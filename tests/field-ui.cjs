const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");

function app() {
  const storage = new Map();
  const context = vm.createContext({
    window: { APP_CONFIG: { projects: [{ name: "P" }, { name: "Q" }] }, alert() {}, confirm: () => true },
    document: { addEventListener() {} }, navigator: {}, console,
    localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) }
  });
  vm.runInContext(fs.readFileSync(path.join(root, "app.js"), "utf8"), context);
  return { context, storage, run: (code) => vm.runInContext(code, context) };
}

test("draft typing persists separately, reload recovers newest text and clearing does not resurrect it", () => {
  const { run, storage } = app();
  run('state.workForms.P = {detail:"old"}; saveState(); state.workForms.P.detail = "new\\nline"; saveWorkForms();');
  assert.equal(JSON.parse(storage.get("jecheon-field-app-v2")).workForms.P.detail, "old");
  assert.equal(run('loadState().workForms.P.detail'), "new\nline");
  run('delete state.workForms.P; saveState();');
  assert.equal(run('loadState().workForms.P'), undefined);
});

test("corrupt draft cache preserves main records and the damaged cache without blocking normal saves", () => {
  const { run, storage } = app();
  run('state.workForms = {P:{detail:"P"},Q:{detail:"Q"}}; state.entries=[{id:"unsent",project:"P",status:"local",cost:123}]; saveState(); state.workForms.P.detail="updated"; saveWorkForms();');
  assert.equal(run('loadState().workForms.Q.detail'), "Q");
  storage.set("jecheon-field-app-v2-work-drafts", "[broken");
  run('state = loadState()');
  assert.equal(run('state.entries[0].id'), "unsent");
  assert.equal(run('state.workForms.P.detail'), "P");
  assert.equal(run('storageLoadFailed'), false);
  run('state.workForms.P.detail="recovered"; saveWorkForms()');
  assert.equal(run('loadState().workForms.P.detail'), "recovered");
  assert.equal(storage.get("jecheon-field-app-v2-work-drafts"), "[broken");
});

test("committed draft clearing cannot be undone by an old cache even when cache writes fail", () => {
  const { run, context, storage } = app();
  run('saveState(); state.workForms.P={detail:"submitted"}; saveWorkForms();');
  const oldCache = storage.get("jecheon-field-app-v2-work-drafts");
  context.localStorage.setItem = (key, value) => {
    if (key.endsWith("-work-drafts")) throw new Error("quota");
    storage.set(key, value);
  };
  run('delete state.workForms.P; saveState()');
  assert.equal(storage.get("jecheon-field-app-v2-work-drafts"), oldCache);
  assert.equal(run('loadState().workForms.P'), undefined);
});

test("failed main write leaves the draft revision and recoverable typing cache intact", () => {
  const { run, context } = app();
  run('saveState(); state.workForms.P={detail:"keep me"}; saveWorkForms()');
  const revision = run('state._draftRevision');
  context.localStorage.setItem = () => { throw new Error("quota"); };
  run('delete state.workForms.P');
  assert.throws(() => run('saveState()'), /quota/);
  assert.equal(run('state._draftRevision'), revision);
  assert.equal(run('loadState().workForms.P.detail'), "keep me");
});

test("drafts recover before the first main save and existing unversioned main state migrates", () => {
  const { run, storage } = app();
  run('state.workForms.P={detail:"first"}; saveWorkForms()');
  assert.equal(run('loadState().workForms.P.detail'), "first");
  storage.delete("jecheon-field-app-v2-work-drafts");
  storage.set("jecheon-field-app-v2", JSON.stringify({workForms:{P:{detail:"legacy"}}}));
  run('state=loadState(); saveState()');
  assert.equal(run('loadState().workForms.P.detail'), "legacy");
  assert.ok(run('state._draftRevision'));
});

test("contract input always uses won rather than guessing ten-thousand units", () => {
  const { run } = app();
  assert.equal(run('normalizeContractAmount("30")'), 30);
  assert.equal(run('normalizeContractAmount("300,000")'), 300000);
  for (const value of ["-1", "abc", "1.5", "Infinity"]) assert.equal(run(`normalizeContractAmount(${JSON.stringify(value)})`), 0);
});

test("material bulk validation rejects the entire change before altering any record", async () => {
  const { run } = app();
  run(`state.materialOrders = [{id:"a",project:"P",orderAmount:100,creditAmount:20},{id:"b",project:"P",orderAmount:200,creditAmount:150}];
    currentMaterialRows=state.materialOrders; elements.materialBulkField={value:"orderAmount",options:[{textContent:"발주 금액"}],selectedIndex:0};
    elements.materialBulkValue={value:"120"}; renderAll=()=>{throw new Error("must not render/write");};`);
  await run('applyMaterialBulkEdit()');
  assert.equal(run('state.materialOrders[0].orderAmount'), 100);
  assert.equal(run('state.materialOrders[1].orderAmount'), 200);
});

test("memo-only material bulk edit preserves unrelated historical invalid amounts", async () => {
  const { run } = app();
  run(`state.materialOrders = [{id:"a",project:"P",orderAmount:100,creditAmount:150,memo:"old"}]; currentMaterialRows=state.materialOrders;
    elements.materialBulkField={value:"memo",options:[{textContent:"비고"}],selectedIndex:0}; elements.materialBulkValue={value:"new"};
    renderAll=()=>{}; syncMaterialRowsWithOverlay=async()=>true;`);
  await run('applyMaterialBulkEdit()');
  assert.equal(run('state.materialOrders[0].memo'), "new");
  assert.equal(run('state.materialOrders[0].creditAmount'), 150);
});

test("switching to input does not render hidden tables or summaries", () => {
  const { run, context } = app();
  context.calls = [];
  run('renderNavigation=()=>{};renderEditState=()=>{};renderMetrics=()=>{};renderLogs=()=>calls.push("logs");renderMaterialTable=()=>calls.push("materials");renderSummary=()=>calls.push("summary");');
  run('setView("input")');
  assert.deepEqual(context.calls, []);
  run('setView("summary")');
  assert.deepEqual(context.calls, ["summary"]);
});

function ui() {
  const nodes = [];
  const storage = new Map();
  function node(tag) {
    const e = { tag, children: [], handlers: {}, setAttribute() {}, append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; }, addEventListener(name, fn) { this.handlers[name] = fn; }, querySelectorAll(selector) { return this.children.filter(c => c.tag === selector); }, focus() {} };
    nodes.push(e);
    return e;
  }
  const views = {};
  for (const id of ["view-logs", "view-materials"]) {
    const properties = new Map();
    views[id] = { dataset: {}, style: { setProperty: (k, v) => properties.set(k, v), removeProperty: k => properties.delete(k), getPropertyValue: k => properties.get(k) || "" },
      removeAttribute() { delete this.dataset.listTextSize; }, querySelector: () => ({ before() {} }) };
  }
  const context = vm.createContext({ window: {}, localStorage: {getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v)},
    document: { addEventListener() {}, querySelector: () => null, createElement: node, getElementById: id => nodes.find(n => n.id === id) || views[id] || null } });
  vm.runInContext(fs.readFileSync(path.join(root, "field-ui.js"), "utf8"), context);
  return { api: context.window.FieldUI, nodes, views, storage, context };
}

test("list font sizes are independent, persisted and never recreate record nodes", () => {
  const {api, views, storage, nodes} = ui();
  api.setListTextSize("work", "14");
  api.setListTextSize("material", "28");
  assert.equal(views["view-logs"].style.getPropertyValue("--list-text-size"), "14px");
  assert.equal(views["view-materials"].dataset.listTextSize, "28");
  assert.equal(storage.get("hwarim-reading-size-work"), "14");
  assert.equal(storage.get("hwarim-reading-size-material"), "28");
  assert.equal(nodes.length, 0);
  api.setListTextSize("work", "default");
  assert.equal(views["view-logs"].dataset.listTextSize, undefined);
  assert.equal(views["view-logs"].style.getPropertyValue("--list-text-size"), "");
  assert.equal(views["view-materials"].dataset.listTextSize, "28");
});

test("list font preference accepts only known sizes and handles disabled storage", () => {
  const {api, storage, views, context} = ui();
  for (const size of ["14", "16", "18", "20", "22", "24", "28"]) {
    api.setListTextSize("work", size, false);
    assert.equal(views["view-logs"].dataset.listTextSize, size);
  }
  assert.equal(storage.size, 0);
  api.setListTextSize("work", "100000px");
  assert.equal(views["view-logs"].dataset.listTextSize, undefined);
  api.setListTextSize("bad", "20");
  assert.equal(storage.size, 1);
  context.localStorage.setItem = () => {throw new Error("blocked");};
  assert.doesNotThrow(() => api.setListTextSize("material", "24"));
  assert.equal(views["view-materials"].dataset.listTextSize, "24");
});

test("money helper displays won and readable Korean units without changing values", () => {
  const { api } = ui();
  assert.equal(api.moneyNote("300000"), "300,000원 (30만 원)");
  assert.equal(api.moneyNote("0"), "0원");
  assert.equal(api.moneyNote("100010005"), "100,010,005원 (1억 1만 5 원)");
  assert.match(api.moneyNote(""), /원 단위/);
});

test("pagination keeps all source rows, resets after filters and reveals linked records", () => {
  const { api, nodes } = ui();
  const rows = Array.from({ length: 65 }, (_, i) => ({ id: String(i) }));
  let shown;
  const render = () => { shown = api.pageRows(rows, "work", ["P"], render); };
  render();
  assert.equal(shown.length, 30);
  assert.equal(shown[0].id, "64");
  nodes.find(n => n.id === "workPager").children.find(n => n.textContent === "다음").handlers.click();
  assert.equal(shown[0].id, "34");
  assert.equal(rows.length, 65);
  assert.equal(rows[0].id, "0");
  assert.equal(api.pageRows(rows, "work", ["Q"], render)[0].id, "64");
  api.revealRecord("work", "0");
  assert.equal(api.pageRows(rows, "work", ["Q"], render).at(-1).id, "0");
  assert.equal(api.pageRows([], "work", ["Q"], render).length, 0);
});

test("pagination state for material does not change the work page", () => {
  const { api } = ui();
  const rows = Array.from({ length: 80 }, (_, i) => ({ id: String(i) }));
  api.revealRecord("work", "0");
  const page = api.pageRows(rows, "work", ["P"], () => {});
  api.pageRows(rows, "material", ["P"], () => {});
  assert.equal(api.pageRows(rows, "work", ["P"], () => {})[0].id, page[0].id);
});
