const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.join(__dirname, "..");
function frontend() {
  const storage = new Map();
  const context = vm.createContext({
    window: { APP_CONFIG: { projects: [{name:"P"},{name:"Q"}] }, AdministratorAccess:{token:()=>"fake-admin-session",ensure:()=>true}, SHEET_DATA: {config:{labor:["인부30"],processes:[{name:"공정",subs:["세부"]}]}}, alert(){} },
    document: {addEventListener(){}}, navigator:{}, console,
    localStorage: {getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}
  });
  vm.runInContext(fs.readFileSync(path.join(root,"app.js"),"utf8"),context);
  const run = code => vm.runInContext(code,context);
  return {run,storage,context,plain:code=>JSON.parse(JSON.stringify(run(code)))};
}
test("each project keeps independent labor names, rates and other settings across reload",()=>{
  const {run,plain}=frontend();
  run('updateLaborSetting("인부30","최소장",310000,false); saveState(); activateProject("Q");');
  assert.deepEqual(plain('state.config.labor'),["인부30"]);
  assert.equal(run('estimateCost({labor:"인부30",workAmount:1})'),300000);
  run('updateLaborSetting("인부30","최소장",400000,false); saveState(); state=loadState();');
  assert.equal(run('estimateCost({labor:"최소장",workAmount:0.5})'),200000);
  run('activateProject("P")');
  assert.equal(run('estimateCost({labor:"최소장",workAmount:1})'),310000);
  assert.deepEqual(plain('sourceData.config.labor'),["인부30"]);
});
test("a rate change never recalculates existing records and optional rename cannot cross projects",()=>{
  const {run,plain}=frontend();
  run('state.entries=[{project:"P",id:"same",labor:"인부30",cost:123000,status:"synced"},{project:"Q",id:"same",labor:"인부30",cost:456000,status:"synced"}]; updateLaborSetting("인부30","최소장",500000,true);');
  assert.deepEqual(plain('state.entries.map(r=>[r.project,r.labor,r.cost])'),[["P","최소장",123000],["Q","인부30",456000]]);
});
test("without the history option renaming only changes the active reference list",()=>{
  const {run}=frontend();run('state.entries=[{project:"P",id:"x",labor:"인부30",cost:300000}];updateLaborSetting("인부30","소장",420000,false)');
  assert.equal(run('state.entries[0].labor'),"인부30");assert.equal(run('state.entries[0].cost'),300000);
});
test("explicit zero rate survives reload and fractional work multiplies the configured rate",()=>{
  const {run}=frontend();run('updateLaborSetting("인부30","인부30",0,false);saveState();state=loadState()');
  assert.equal(run('estimateCost({labor:"인부30",workAmount:1})'),0);
  run('updateLaborSetting("인부30","인부30",320000,false)');
  assert.equal(run('estimateCost({labor:"인부30",workAmount:0.5})'),160000);
});
test("invalid rates and duplicate names do not modify settings or records",()=>{
  const {run,plain}=frontend();const before=plain('state.config');
  for(const rate of ['NaN','-1','0.5','Infinity'])assert.throws(()=>run(`updateLaborSetting("인부30","소장",${rate},true)`));
  assert.throws(()=>run('updateLaborSetting("","인부30",100,false)'));
  assert.deepEqual(plain('state.config'),before);
});
test("legacy global config migrates only to its last active project",()=>{
  const {run,storage}=frontend();storage.set("jecheon-field-app-v2",JSON.stringify({activeProject:"Q",config:{labor:["기존45"]}}));
  run('state=loadState();activateProject("P")');assert.equal(run('state.config.labor[0]'),"인부30");
  run('activateProject("Q")');assert.equal(run('state.config.labor[0]'),"기존45");
});
test("pending settings and ordinary record payloads are separate and immutable",()=>{
  const {run}=frontend();run('elements.summaryStart={value:""};elements.summaryEnd={value:""};state.pendingSettings.Q={stateData:{config:{labor:["대기"],laborRates:{대기:440000}}},expectedRevision:2};activateProject("Q");const payload=buildSettingsPayload();const ordinary=buildSharedStatePayload();updateLaborSetting("대기","대기",550000,false)');
  assert.equal(run('payload.config.laborRates["대기"]'),440000);
  assert.equal(run('payload.projectConfigs'),undefined);
  for(const key of ['config','projectSettings','projects','adminToken'])assert.equal(run(`ordinary.${key}`),undefined);
});

test("field users cannot edit labor references without administrator authentication",()=>{
  const {run,plain}=frontend(),before=plain('state.config');run('window.AdministratorAccess.token=()=>""');
  assert.throws(()=>run('updateLaborSetting("인부30","변경",1,true)'),/관리자/);assert.deepEqual(plain('state.config'),before);
});
test("password manager links use each project endpoint without credentials",()=>{
  const {run}=frontend();
  assert.equal(run('projectPasswordUrl({name:"P",syncEndpoint:"https://script.google.com/macros/s/LEGACY/exec"})'),"https://script.google.com/macros/s/LEGACY/exec?action=manage&project=P");
  assert.equal(run('projectPasswordUrl({name:"P",syncEndpoint:"javascript:alert(1)"})'),"");
});

function legacy() {
  const hash = x=>crypto.createHash("sha256").update(x).digest("hex");
  const props=new Map([["PROJECT_PASSWORD_SHA256",hash("original")],["PROJECT_SPREADSHEET_ID","unchanged"]]);
  const context=vm.createContext({
    PASSWORD_PROPERTY:"PROJECT_PASSWORD_SHA256",sha256_:hash,secureEqual_:(a,b)=>a===b,
    requirePasswordAdministrator_:token=>{if(token!=="test-admin-session")throw new Error("관리자 확인 필요")},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperties:values=>Object.entries(values).forEach(([k,v])=>props.set(k,v))})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})}
  });
  vm.runInContext(fs.readFileSync(path.join(root,"legacy-password-admin.gs"),"utf8"),context);
  return {run:code=>vm.runInContext(code,context),props,hash};
}
test("legacy password manager rejects missing administrator session without changing anything",()=>{
  const b=legacy(),before=[...b.props];assert.throws(()=>b.run('passwordManagerState()'),/관리자/);assert.throws(()=>b.run('changeProjectPassword({password:"0123",expectedRevision:0})'),/관리자/);
  assert.deepEqual([...b.props],before);
});
test("legacy four-character password preserves zero and only updates credential properties",()=>{
  const b=legacy();b.run('changeProjectPassword({adminToken:"test-admin-session",password:"0123",expectedRevision:0})');
  assert.equal(b.props.get("PROJECT_PASSWORD_SHA256"),b.hash("0123"));assert.equal(b.props.get("PROJECT_SPREADSHEET_ID"),"unchanged");
  assert.equal(b.run('passwordManagerState("test-admin-session").revision'),1);assert.ok(!JSON.stringify([...b.props]).includes('"0123"'));
});
test("legacy password validation, retries and stale forms preserve the latest credential",()=>{
  const b=legacy();for(const password of ['"123"','"    "','1234','"x".repeat(129)'])assert.throws(()=>b.run(`changeProjectPassword({adminToken:"test-admin-session",password:${password},expectedRevision:0})`),/4~128/);
  b.run('changeProjectPassword({adminToken:"test-admin-session",password:"0123",expectedRevision:0})');b.run('changeProjectPassword({adminToken:"test-admin-session",password:"0123",expectedRevision:0})');
  assert.throws(()=>b.run('changeProjectPassword({adminToken:"test-admin-session",password:"4567",expectedRevision:0})'),/다른 화면/);
  assert.equal(b.props.get("PROJECT_PASSWORD_SHA256"),b.hash("0123"));
  new vm.Script(b.run('LEGACY_PASSWORD_HTML').match(/<script>([\s\S]*?)<\/script>/)[1]);
});
