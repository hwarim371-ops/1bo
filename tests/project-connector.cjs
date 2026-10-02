const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const path = require("node:path");
function backend() {
  const properties = new Map(), sheets = new Map();
  let active = "owner@example.test", creates = 0, failCreate = false, failSetup = false;
  function sheet() {
    const rows = [];
    return { rows, getLastRow: () => rows.length, getMaxRows: () => 10000, setFrozenRows() {},
      getRange(r, c, nr, nc) { return {
        getValues: () => Array.from({length:nr}, (_, i) => Array.from({length:nc}, (_,j) => rows[r+i-1]?.[c+j-1] ?? "")),
        setValues(values) { if (failSetup) throw new Error("setup interrupted"); values.forEach((row,i) => { rows[r+i-1] ||= []; row.forEach((v,j) => rows[r+i-1][c+j-1] = typeof v === "string" && v.startsWith("'") ? v.slice(1) : v); }); },
        clearContent() { for (let i=0;i<nr;i++) rows[r+i-1] = Array(nc).fill(""); while (rows.length && rows.at(-1).every(v=>v==="")) rows.pop(); }
      }; }
    };
  }
  const context = vm.createContext({ console: {log(){}},
    Session: { getActiveUser: () => ({getEmail:()=>active}), getEffectiveUser: () => ({getEmail:()=>"owner@example.test"}) },
    PropertiesService: {getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),getProperties:()=>Object.fromEntries(properties)})},
    Utilities: {DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},getUuid:()=>crypto.randomUUID(),computeDigest:(_,text)=>[...crypto.createHash("sha256").update(text).digest()]},
    SpreadsheetApp: { getActiveSpreadsheet:()=>null,flush(){},openById:id=>{assert.ok(sheets.has(id)); return sheets.get(id)},create(){creates++;if(failCreate)throw new Error("network interrupted");const id="sheet-"+creates,tabs=new Map();const ss={getId:()=>id,setSpreadsheetTimeZone(){},getSheetByName:n=>tabs.get(n),insertSheet:n=>{const tab=sheet();tabs.set(n,tab);return tab}};sheets.set(id,ss);return ss;} },
    LockService: {getScriptLock:()=>({waitLock(){},releaseLock(){},hasLock:()=>true})},
    ContentService: {MimeType:{JSON:1,JAVASCRIPT:2},createTextOutput:text=>({text,setMimeType(){return this}})},
    HtmlService: {createHtmlOutput:text=>({text,setTitle(){return this},addMetaTag(){return this}})}
  });
  const run = code => vm.runInContext(code,context);
  run(fs.readFileSync(path.join(__dirname,"..","project-connector.gs"),"utf8"));
  run("setupConnector()");
  const input = {name:"새 현장",password:"test-only-password",requestId:"request-test-123456789"};
  const create = (overrides={}) => {context.input={...input,...overrides}; return run("createManagedProject(input)")};
  const auth = {project:input.name,accessKey:crypto.createHash("sha256").update(input.password).digest("hex")};
  const get = (params={}) => {context.params={action:"load",...auth,...params};return JSON.parse(run("doGet({parameter:params}).text"))};
  const post = data => {context.body=JSON.stringify({...auth,...data});return JSON.parse(run("doPost({postData:{contents:body}}).text"))};
  return {run,create,get,post,properties,creates:()=>creates,setActive:v=>active=v,failCreate:v=>failCreate=v,failSetup:v=>failSetup=v};
}

test("new project provisions one sheet, idempotent retries never reset password",()=>{
  const b=backend();const first=b.create();assert.equal(b.creates(),1);assert.equal(b.create().spreadsheetUrl,first.spreadsheetUrl);
  assert.throws(()=>b.create({password:"different-password"}),/비밀번호/);assert.equal(b.creates(),1);
  assert.throws(()=>b.create({requestId:"another-request-123456"}),/이미/);
});
test("anonymous callers cannot create projects or use owner RPC",()=>{
  const b=backend();b.setActive("");assert.throws(()=>b.create(),/관리자/);assert.throws(()=>b.run("listManagedProjects()"),/관리자/);assert.equal(b.creates(),0);
  b.setActive("someone@example.test");assert.throws(()=>b.run("setupConnector()"),/소유자/);
});
test("legacy names and weak passwords are rejected without writes",()=>{
  const b=backend();assert.throws(()=>b.create({name:"천안1"}),/기존/);assert.throws(()=>b.create({password:"1234"}),/8/);assert.equal(b.creates(),0);
});
test("uncertain create never retries a second spreadsheet",()=>{
  const b=backend();b.failCreate(true);assert.throws(()=>b.create(),/network/);b.failCreate(false);assert.throws(()=>b.create(),/중복/);assert.equal(b.creates(),1);
});
test("interrupted sheet setup resumes from journal; incomplete project not listed",()=>{
  const b=backend();b.failSetup(true);assert.throws(()=>b.create(),/interrupted/);assert.equal(b.get({action:"projects"}).projects.length,0);
  b.failSetup(false);b.create();assert.equal(b.creates(),1);assert.equal(b.get({action:"projects"}).projects.length,1);
});
test("public directory exposes names only, not keys, sheet IDs or passwords",()=>{
  const b=backend();b.create();const publicData=b.get({action:"projects"});assert.deepEqual(publicData.projects,[{name:"새 현장"}]);
  const props=JSON.stringify(Object.fromEntries(b.properties));assert.ok(!props.includes("test-only-password"));
  assert.equal(b.get({accessKey:"wrong"}).ok,false);assert.equal(b.post({accessKey:"wrong",type:"workEntries",records:[]}).ok,false);
});
test("record round trip preserves zero, multiline memo, contract and sheet isolation",()=>{
  const b=backend();b.create();const row={id:"work-1",date:"2026-10-02",cost:0,workAmount:0.5,memo:"=not a formula\n둘째 줄",contractFlag:true,contractTotal:0};
  assert.equal(b.post({spreadsheetId:"unrelated-private-sheet",type:"workEntries",records:[row]}).ok,true);
  let saved=b.get().workEntries;assert.equal(saved.length,1);assert.equal(saved[0].cost,0);assert.equal(saved[0].memo,row.memo);assert.equal(saved[0].contractFlag,true);
  b.post({type:"workEntries",records:[{...row,memo:"changed"}]});assert.equal(b.get().workEntries.length,1);
  assert.equal(b.post({type:"replaceProjectData",records:[]}).ok,false);assert.equal(b.get().workEntries.length,1);
  b.post({type:"deleteWorkEntries",records:[{id:row.id}]});assert.equal(b.get().workEntries.length,0);
});
test("material, large settings and formula-shaped text round trip",()=>{
  const b=backend();b.create();assert.equal(b.post({type:"materialOrders",records:[{id:"m1",product:"'+label",orderAmount:100,creditAmount:0}]}).ok,true);
  assert.equal(b.get().materialOrders[0].product,"'+label");assert.equal(b.get().materialOrders[0].creditAmount,0);
  const stateData={config:{memo:"long ".repeat(18000)},projectSettings:{constructionStartDate:"2026-10-01"}};
  assert.equal(b.post({type:"appState",stateData}).ok,true);assert.deepEqual(b.get().stateData.config,stateData.config);
});
test("invalid IDs, duplicate IDs and invalid numbers do not replace previous records",()=>{
  const b=backend();b.create();b.post({type:"workEntries",records:[{id:"a",cost:123}]});
  for(const records of [[{cost:1}],[{id:"a"},{id:"a"}],[{id:"b",cost:-3}]]) assert.equal(b.post({type:"workEntries",records}).ok,false);
  assert.equal(b.get().workEntries[0].cost,123);
});
test("JSONP callback cannot inject code",()=>{
  const b=backend();b.create();const value=b.run('json_({ok:true},"alert(1);//").text');assert.equal(value,'{"ok":true}');
});
