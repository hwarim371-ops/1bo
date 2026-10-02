const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const path = require("node:path");
const accessKey = password => crypto.createHash("sha256").update(password).digest("hex");
function backend() {
  const properties = new Map(), sheets = new Map();
  let active = "owner@example.test", creates = 0, failCreate = false, failSetup = false, onLock = null;
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
    LockService: {getScriptLock:()=>({waitLock(){const fn=onLock;onLock=null;fn?.()},releaseLock(){},hasLock:()=>true})},
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
  const change = (overrides={}) => {context.changeInput={name:input.name,password:"01234567",expectedRevision:0,...overrides};return run("changeManagedProjectPassword(changeInput)")};
  return {run,create,get,post,change,properties,creates:()=>creates,setActive:v=>active=v,failCreate:v=>failCreate=v,failSetup:v=>failSetup=v,onLock:fn=>onLock=fn};
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
test("legacy names and passwords outside 8-128 characters are rejected without writes",()=>{
  const b=backend();assert.throws(()=>b.create({name:"천안1"}),/기존/);
  for(const password of ["123","1234","1234567"," ".repeat(8),"x".repeat(129),12345678,null]) assert.throws(()=>b.create({password}),/8~128/);
  assert.equal(b.creates(),0);
});
test("eight digits preserve leading zero; longer passwords remain supported",()=>{
  const b=backend();b.create({password:"01234567"});assert.equal(b.get({accessKey:accessKey("01234567")}).ok,true);assert.equal(b.get({accessKey:accessKey("1234567")}).ok,false);
  const long=backend();long.create({password:"x".repeat(128)});assert.equal(long.get({accessKey:accessKey("x".repeat(128))}).ok,true);
});
test("password changes are owner-only and cannot use the public data endpoint",()=>{
  const b=backend();b.create();const before=[...b.properties];
  for(const user of ["","someone@example.test"]){b.setActive(user);assert.throws(()=>b.change(),/관리자/)}
  assert.equal(b.post({type:"changeManagedProjectPassword",password:"0123"}).ok,false);
  assert.deepEqual([...b.properties],before);assert.equal(b.get().ok,true);
});
test("password rotation preserves sheet, records, state, journal and other projects",()=>{
  const b=backend(),first=b.create();b.create({name:"다른 현장"});
  b.post({type:"workEntries",records:[{id:"w1",cost:700000,memo:"keep"}]});b.post({type:"materialOrders",records:[{id:"m1",orderAmount:123}]});b.post({type:"appState",stateData:{config:{labor:["기존인부"]}}});
  const before=b.get(),result=b.change();assert.equal(result.spreadsheetUrl,first.spreadsheetUrl);assert.equal(result.passwordRevision,1);assert.equal(b.creates(),2);
  assert.equal(b.get().ok,false);assert.equal(b.post({type:"workEntries",records:[{id:"w1",cost:1}]}).ok,false);
  const after=b.get({accessKey:accessKey("01234567")});assert.deepEqual(after,before);assert.equal(b.get({project:"다른 현장"}).ok,true);
  assert.equal(b.post({accessKey:accessKey("01234567"),type:"workEntries",records:[{id:"w2",cost:40}]}).ok,true);
  assert.equal(b.get({accessKey:accessKey("01234567")}).workEntries.length,2);
  const registry=[...b.properties.values()].find(v=>v.includes('"name":"새 현장"'));
  assert.equal(JSON.parse(registry).requestId,"request-test-123456789");assert.ok(!registry.includes('"password"'));assert.ok(!registry.includes('"01234567"'));
  assert.deepEqual(b.get({action:"projects"}).projects,[{name:"새 현장"},{name:"다른 현장"}]);
});
test("invalid password changes and incomplete projects never modify credentials",()=>{
  const b=backend();b.create();const before=[...b.properties];
  for(const password of ["1234","1234567","x".repeat(129),"        ",12345678])assert.throws(()=>b.change({password}),/8~128/);
  for(const expectedRevision of [undefined,"0",-1,0.5])assert.throws(()=>b.change({expectedRevision}),/새로고침/);
  assert.throws(()=>b.change({name:"missing"}),/완료/);assert.throws(()=>b.change({name:"천안1"}),/완료/);assert.deepEqual([...b.properties],before);
  const partial=backend();partial.failSetup(true);assert.throws(()=>partial.create());assert.throws(()=>partial.change(),/완료/);
});
test("same-password retries are idempotent, stale changes cannot undo newer passwords",()=>{
  const b=backend();b.create();assert.equal(b.change().passwordRevision,1);const changed=[...b.properties];
  assert.equal(b.change().passwordRevision,1);assert.deepEqual([...b.properties],changed);
  assert.throws(()=>b.change({password:"45678901"}),/다른 화면/);
  assert.equal(b.change({password:"45678901",expectedRevision:1}).passwordRevision,2);
  assert.throws(()=>b.change(),/다른 화면/);assert.equal(b.get({accessKey:accessKey("45678901")}).ok,true);
  assert.equal(b.change({password:"45678901",expectedRevision:2}).passwordRevision,2);
});
test("queued writes recheck credentials after a concurrent password change",()=>{
  const b=backend();b.create();b.onLock(()=>b.change());
  assert.equal(b.post({type:"workEntries",records:[{id:"old-request",cost:1}]}).ok,false);
  assert.equal(b.get({accessKey:accessKey("01234567")}).workEntries.length,0);
});
test("manager scripts compile and all password inputs require eight characters",()=>{
  const html=backend().run("MANAGER_HTML");const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(script);
  assert.equal((html.match(/minlength="8"/g)||[]).length,4);assert.ok(!html.includes('minlength="4"'));
});
test("previously configured four-digit credentials remain valid until owner changes them",()=>{
  const b=backend();b.create();const key=[...b.properties.keys()].find(k=>k.startsWith("PROJECT_")),project=JSON.parse(b.properties.get(key));
  project.verifier=accessKey(project.salt+accessKey("0123"));b.properties.set(key,JSON.stringify(project));
  assert.equal(b.get({accessKey:accessKey("0123")}).ok,true);assert.throws(()=>b.change({password:"4567"}),/8~128/);
  assert.equal(b.get({accessKey:accessKey("0123")}).ok,true);b.change();assert.equal(b.get({accessKey:accessKey("0123")}).ok,false);
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
