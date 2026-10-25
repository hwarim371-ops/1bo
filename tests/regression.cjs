const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
function app() {
  const storage = new Map();
  const context = vm.createContext({
    window: { APP_CONFIG: { projects: [{ name: "P" }, { name: "Q" }] }, SHEET_DATA: {}, alert() {}, confirm: () => true },
    document: { addEventListener() {}, body: { classList: { contains: () => false } } },
    navigator: { onLine: true },
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
    crypto: require("node:crypto").webcrypto, AbortSignal, console, setTimeout, clearTimeout
  });
  vm.runInContext(source, context);
  const run = (code) => vm.runInContext(code, context);
  run('elements.summaryStart = {value:""}; elements.summaryEnd = {value:""};');
  return { run, context, plain: (code) => JSON.parse(JSON.stringify(run(code))) };
}

test("project directory refresh preserves active project, legacy URL and unsent edits", async () => {
  const {run,context,plain}=app();
  context.document.querySelectorAll=()=>[];
  context.window.ProjectDirectory={enabled:true,list:async()=>[{name:"P",syncEndpoint:"new",managed:true},{name:"New",syncEndpoint:"central",managed:true}]};
  run('fillSelect=()=>{}; renderProjectSettings=()=>{}; elements.accessProjectSelect={value:"P"}; elements.projectSelect={value:"P"}; state.projects[0].syncEndpoint="legacy";state.entries=[{id:"pending",project:"P",status:"failed"}];state.sheetEdits={P:{draft:true}};');
  await run('refreshProjectDirectory({})');
  assert.equal(run('state.activeProject'),"P");assert.equal(run('state.projects[0].syncEndpoint'),"legacy");
  assert.equal(run('state.projects.find(p=>p.name==="New").managed'),true);
  assert.equal(run('state.entries[0].status'),"failed");assert.deepEqual(plain('state.sheetEdits'),{P:{draft:true}});
});
test("directory network failure leaves existing project list intact", async () => {
  const {run,context}=app();context.document.querySelectorAll=()=>[];
  context.window.ProjectDirectory={enabled:true,list:async()=>{throw new Error("offline")}};
  assert.equal(await run('refreshProjectDirectory({})'),false);assert.equal(run('state.projects.length'),2);
});
test("managed project flag survives local normalization",()=>{
  const {run}=app();assert.equal(run('normalizeProjects([{name:"new",managed:true}])[0].managed'),true);
});
test("explicit zero survives normalization and numeric parsing", () => {
  const { plain, run } = app();
  assert.equal(run('normalizeEntries([{cost:0}])[0].cost'), 0);
  assert.equal(run('normalizeMaterialOrders([{orderAmount:0,creditAmount:0}])[0].creditAmount'), 0);
  assert.equal(run('numberOrBlank("300,000원")'), 300000);
  assert.equal(run('numberOrBlank(Infinity)'), "");
  assert.equal(run('Number.isNaN(parseAmount("금액오류"))'), true);
});
test("all recorded work costs including unknown categories are counted", () => {
  const { plain } = app();
  const result = plain('calculateTotals([{cost:300000,costType:"",paymentStatus:"외상"}, {cost:400000,costType:"장비대",paymentStatus:"결제완료"}], [{orderAmount:500000,creditAmount:200000}], [])');
  assert.equal(result.totalCost, 1200000);
  assert.equal(result.paidAmount, 700000);
  assert.equal(result.credit, 500000);
  assert.equal(result.otherCost, 300000);
  assert.equal(result.difference, 0);
});
test("table, category and process totals use same complete work set", () => {
  const { run } = app();
  run('state.entries = [{id:"x",project:"P",cost:300000,costType:"기타",mainProcess:"공정",date:"2026-09-01"}]');
  assert.equal(run('workTableTotals(projectEntries()).totalCost'), 300000);
  assert.equal(run('buildProcessCostRows(projectEntries(), [])[0].total'), 300000);
  assert.equal(run('buildCategoryBreakdownRows("other", projectEntries(), [])[0].value'), 300000);
});
test("unknown and partial payment labels cannot imply full payment", () => {
  const { run } = app();
  assert.equal(run('isPaidPaymentStatus("부분결제")'), false);
  assert.equal(run('isPaidPaymentStatus("미지급")'), false);
  assert.equal(run('isPaidPaymentStatus("카드결제")'), true);
  assert.equal(run('summaryLedgerRows([{cost:100,paymentStatus:"부분결제"}],[],[])[0].issues.length > 0'), true);
});
test("invalid historical credit is exposed rather than silently capped", () => {
  const { run } = app();
  assert.equal(run('materialCreditAmount({orderAmount:100,creditAmount:150})'), 150);
  assert.equal(run('calculateTotals([], [{orderAmount:100,creditAmount:150}], []).difference'), -50);
  assert.throws(() => run('validateMaterialAmounts({orderAmount:100,creditAmount:150})'), /외상/);
});
test("dated extras are not repeated in another month; legacy dates remain untouched", () => {
  const { run } = app();
  run('state.extraSummaryItems = [{project:"P",id:"a",date:"2026-08-01",amount:100}, {project:"P",id:"b",date:"2026-09-01",amount:200}, {project:"P",id:"old",amount:300}]; elements.summaryStart.value="2026-09-01"; elements.summaryEnd.value="2026-09-30";');
  assert.equal(run('calculateTotals([],[]).totalCost'), 200);
  assert.equal(run('projectExtraSummaryItems().length'), 3);
  run('elements.summaryStart.value=""; elements.summaryEnd.value=""');
  assert.equal(run('calculateTotals([],[]).totalCost'), 600);
});
test("ledger sums match cards for valid data and all categories", () => {
  const { run } = app();
  run('state.entries=[{project:"P",id:"a",date:"2026-08-01",cost:100,paymentStatus:"결제완료",costType:"인건비"},{project:"P",id:"b",date:"2026-08-01",cost:20,paymentStatus:"외상",costType:""}]; state.materialOrders=[{project:"P",id:"m",date:"2026-08-01",orderAmount:80,creditAmount:50}];');
  assert.equal(run('sum(summaryLedgerRows(projectEntries(),projectMaterialOrders(),[]).map(r=>r.total))'), run('calculateTotals(projectEntries(),projectMaterialOrders(),[]).totalCost'));
  assert.equal(run('sum(summaryLedgerRows(projectEntries(),projectMaterialOrders(),[]).map(r=>r.credit))'), 70);
});
test("construction start date is independent from report dates and project", () => {
  const { run } = app();
  run('state.projects[0].constructionStartDate="2026-05-01"; state.projects[1].constructionStartDate="2026-07-01"; elements.summaryStart.value="2026-09-01";');
  assert.equal(run('getProjectStartDate()'), "2026-05-01");
  run('state.activeProject="Q"');
  assert.equal(run('getProjectStartDate()'), "2026-07-01");
});
test("work days count distinct dates while elapsed days include the start", () => {
  const { run } = app();
  run('state.projects[0].constructionStartDate="2026-05-01"; state.entries=[{project:"P",date:"2026-05-01"},{project:"P",date:"2026-05-01"},{project:"P",date:"2026-05-02"},{project:"P",date:"2026-04-01"},{project:"Q",date:"2026-05-03"}]; elements.summaryStart.value="2026-05-02"; elements.summaryEnd.value="2026-05-31";');
  assert.equal(run('calculateOperationStats().workDays'), 2);
  assert.equal(run('calculateOperationStats().periodWorkDays'), 1);
  assert.equal(run('elapsedDaysInclusive("2026-05-01","2026-05-01")'), 1);
});
test("editing only a memo preserves missing legacy fields and multiline content", () => {
  const { plain } = app();
  const row = plain('patchedRecord({id:"a",date:"",mainProcess:"",subProcess:"",costType:"",cost:0,memo:"이전",detailProcess:"첫줄\\n둘째줄"}, {memo:{before:"이전",value:"수정\\n메모"}}, "work")');
  assert.equal(row.date, "");
  assert.equal(row.costType, "");
  assert.equal(row.cost, 0);
  assert.equal(row.detailProcess, "첫줄\n둘째줄");
  assert.equal(row.memo, "수정\n메모");
});
test("material memo-only edit does not demand correcting unrelated legacy fields", () => {
  const { run } = app();
  assert.equal(run('patchedRecord({memo:"a",product:"",process:"",orderAmount:100,creditAmount:150},{memo:{before:"a",value:"b"}},"material").memo'), "b");
  assert.throws(() => run('patchedRecord({orderAmount:100,creditAmount:50},{creditAmount:{before:50,value:150}},"material")'), /외상/);
});
test("only touched required fields are validated; competing cell changes stop save", () => {
  const { run } = app();
  assert.throws(() => run('patchedRecord({date:"2026-09-01"},{date:{before:"2026-09-01",value:""}},"work")'), /필수/);
  assert.throws(() => run('patchedRecord({memo:"remote"},{memo:{before:"old",value:"mine"}},"work")'), /다른 곳/);
});
test("failed unsent rows survive an empty server restore with other projects intact", () => {
  const { plain } = app();
  const rows = plain('mergeProjectRecords([{id:"failed",project:"P",status:"failed",cost:30},{id:"q",project:"Q",status:"synced",cost:40}], [], "P", "work")');
  assert.deepEqual(rows.map(r=>r.id).sort(), ["failed","q"]);
});
test("acknowledged retry is deduplicated; differing remote data is retained as conflict", () => {
  const { run, plain } = app();
  assert.equal(run('mergeProjectRecords([{id:"a",project:"P",status:"failed",cost:30}], [{id:"a",cost:30}], "P","work").length'), 1);
  assert.equal(run('mergeProjectRecords([{id:"a",project:"P",status:"failed",cost:30}], [{id:"a",cost:30}], "P","work")[0].status'), "synced");
  const rows = plain('mergeProjectRecords([{id:"a",project:"P",status:"failed",cost:30}], [{id:"a",cost:40}], "P","work")');
  assert.equal(rows[0].cost, 30);
  assert.equal(rows[0].status, "conflict");
  assert.equal(rows[0]._remoteConflict.cost, 40);
});
test("unacknowledged edit retains last server version through localStorage reload", () => {
  const { run } = app();
  run('state.entries=[{id:"a",project:"P",status:"synced",cost:30}]; saveState(); state.entries[0]={...state.entries[0],cost:40,status:"failed"}; saveState(); state=loadState();');
  assert.equal(run('state.entries[0]._syncBase'), run('workSyncKey({cost:30})'));
  assert.equal(run('mergeProjectRecords(state.entries,[{id:"a",cost:30}],"P","work")[0].status'), "failed");
});
test("deleted remote records do not discard unsent local edits", () => {
  const { run } = app();
  run('state.deletedRecords.work=[{id:"a",project:"P"}]');
  assert.equal(run('mergeProjectRecords([{id:"a",project:"P",status:"failed",cost:30}], [], "P","work")[0].status'), "conflict");
});
test("sync skips a POST when a prior response was lost but server already has record", async () => {
  const { run, context } = app();
  let posts = 0;
  context.fetch = async () => { posts++; };
  run('state.projects[0].syncEndpoint="https://example.invalid"; projectAccessKeys.set("P","test"); loadSheetBackupJsonp=async()=>({ok:true,scriptVersion:REQUIRED_SCRIPT_VERSION,workEntries:[{id:"a",cost:30}],materialOrders:[]});');
  assert.equal(await run('syncPayload("workEntries",[{id:"a",project:"P",cost:30,status:"failed"}])'), true);
  assert.equal(posts, 0);
});
test("sync never posts a conflicting edit", async () => {
  const { run, context } = app();
  let posts = 0;
  context.fetch = async () => { posts++; };
  run('state.projects[0].syncEndpoint="https://example.invalid"; projectAccessKeys.set("P","test"); state.entries=[{id:"a",project:"P",cost:30,status:"failed"}]; loadSheetBackupJsonp=async()=>({ok:true,scriptVersion:REQUIRED_SCRIPT_VERSION,workEntries:[{id:"a",cost:40}],materialOrders:[]});');
  assert.equal(await run('syncPayload("workEntries",state.entries)'), false);
  assert.equal(run('state.entries[0].status'), "conflict");
  assert.equal(posts, 0);
});
test("settings writes are acknowledged by readback, not opaque HTTP response", async () => {
  const { run, context } = app();
  context.fetch = async () => ({ type: "opaque" });
  run('state.projects[0].syncEndpoint="https://example.invalid"; projectAccessKeys.set("P","test"); wait=async()=>{}; loadSheetBackupJsonp=async()=>({ok:true,scriptVersion:REQUIRED_SCRIPT_VERSION,settingsProtection:true,stateData:{config:{old:true},settingsRevision:0}});');
  assert.equal(await run('syncPayload("appState",[],{stateData:{config:{changed:true},projectSettings:{},projects:[]},settingsUpdate:true,expectedSettingsRevision:0,adminToken:"fake"})'), false);
});
test("empty persisted arrays remain empty rather than restoring seed records", () => {
  const { run } = app();
  run('saveState(); seedState.entries=[{id:"seed",cost:10}]; state=loadState()');
  assert.equal(run('state.entries.length'), 0);
});

test("restore rejects malformed payload without deleting local records", async () => {
  const { run } = app();
  run('state.projects[0].syncEndpoint="https://example.invalid"; projectAccessKeys.set("P","test"); elements.restoreSyncButton={}; state.entries=[{id:"a",project:"P",cost:30,status:"failed"}]; loadSheetBackupJsonp=async()=>({ok:true,scriptVersion:REQUIRED_SCRIPT_VERSION});');
  await assert.rejects(run('restoreFromGoogleSheet({silent:true})'), /목록/);
  assert.equal(run('state.entries[0].id'), "a");
  assert.equal(run('syncInFlight'), 0);
});

test("real restore preserves unsent records, cell drafts and pending project settings", async () => {
  const { run } = app();
  run('state.projects[0].syncEndpoint="https://example.invalid"; projectAccessKeys.set("P","test"); elements.restoreSyncButton={}; renderAll=()=>{}; state.entries=[{id:"a",project:"P",cost:30,status:"failed"}]; sheetEdits("work").a={memo:{before:"old",value:"draft"}}; state.pendingSettings.P={stateData:{config:{labor:["my list"]}},expectedRevision:0}; state.config.labor=["my list"]; loadSheetBackupJsonp=async()=>({ok:true,scriptVersion:REQUIRED_SCRIPT_VERSION,workEntries:[],materialOrders:[],stateData:{config:{labor:["remote list"]}}});');
  assert.equal(await run('restoreFromGoogleSheet({silent:true})'),true);
  assert.equal(run('state.entries[0].id'),"a");
  assert.equal(run('sheetEdits("work").a.memo.value'),"draft");
  assert.equal(run('state.config.labor[0]'),"my list");
});

test("old mixed settings pending is retained for admin review but cannot replace live references",async()=>{
  const {run}=app();run('state.projects[0].syncEndpoint="https://example.invalid"; projectAccessKeys.set("P","test"); elements.restoreSyncButton={}; renderAll=()=>{}; state.pendingShared.P={config:{labor:["old unsent"]}}; loadSheetBackupJsonp=async()=>({ok:true,scriptVersion:REQUIRED_SCRIPT_VERSION,workEntries:[],materialOrders:[],stateData:{config:{labor:["current"]},settingsRevision:5}});');
  await run('restoreFromGoogleSheet({silent:true})');assert.equal(run('state.config.labor[0]'),'current');assert.equal(run('state.pendingSettings.P.stateData.config.labor[0]'),'old unsent');assert.equal(run('state.pendingSettings.P.needsReview'),true);
});

test("administrator settings are never sent to a server without settings protection",async()=>{
  const {run,context}=app();let posted=false;context.fetch=async()=>{posted=true};
  run('state.projects[0].syncEndpoint="https://example.invalid"; projectAccessKeys.set("P","test"); loadSheetBackupJsonp=async()=>({scriptVersion:REQUIRED_SCRIPT_VERSION,stateData:{}})');
  assert.equal(await run('syncPayload("appState",[],{settingsUpdate:true,stateData:{}})'),false);assert.equal(posted,false);
});

test("storage failure aborts save rather than reporting success", () => {
  const { run, context } = app();
  context.localStorage.setItem=()=>{throw new Error("quota");};
  assert.throws(()=>run("saveState()"),/quota/);
});
