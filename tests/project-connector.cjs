const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const path = require("node:path");
const accessKey = password => crypto.createHash("sha256").update(password).digest("hex");
function backend() {
  const properties = new Map(), sheets = new Map(), attempts = new Map();
  let now = 0;
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
    Date: class extends Date { static now() { return now; } },
    CacheService: {getScriptCache:()=>({get:k=>attempts.get(k)?.until>now?attempts.get(k).value:null,put:(k,value,ttl)=>attempts.set(k,{value,until:now+ttl*1000}),remove:k=>attempts.delete(k)})},
    Session: { getActiveUser: () => ({getEmail:()=>active}), getEffectiveUser: () => ({getEmail:()=>"owner@example.test"}) },
    PropertiesService: {getScriptProperties:()=>({getProperty:k=>properties.get(k)||null,setProperty:(k,v)=>properties.set(k,v),deleteProperty:k=>properties.delete(k),getProperties:()=>Object.fromEntries(properties)})},
    Utilities: {DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},getUuid:()=>crypto.randomUUID(),computeDigest:(_,text)=>[...crypto.createHash("sha256").update(text).digest()]},
    SpreadsheetApp: { getActiveSpreadsheet:()=>null,flush(){},openById:id=>{assert.ok(sheets.has(id)); return sheets.get(id)},create(){creates++;if(failCreate)throw new Error("network interrupted");const id="sheet-"+creates,tabs=new Map();const ss={getId:()=>id,setSpreadsheetTimeZone(){},getSheetByName:n=>tabs.get(n),insertSheet:n=>{const tab=sheet();tabs.set(n,tab);return tab}};sheets.set(id,ss);return ss;} },
    LockService: {getScriptLock:()=>({waitLock(){const fn=onLock;onLock=null;fn?.()},releaseLock(){},hasLock:()=>true})},
    ContentService: {MimeType:{JSON:1,JAVASCRIPT:2},createTextOutput:text=>({text,setMimeType(){return this}})},
    HtmlService: {XFrameOptionsMode:{ALLOWALL:1},createHtmlOutput:text=>({text,setTitle(){return this},addMetaTag(){return this},setXFrameOptionsMode(){return this}})}
  });
  const run = code => vm.runInContext(code,context);
  run(fs.readFileSync(path.join(__dirname,"..","password-throttle.gs"),"utf8"));
  run(fs.readFileSync(path.join(__dirname,"..","project-connector.gs"),"utf8"));
  run(fs.readFileSync(path.join(__dirname,"..","admin-auth.gs"),"utf8"));
  run(fs.readFileSync(path.join(__dirname,"..","settings-guard.gs"),"utf8"));
  run("setupConnector()");
  run('setupAdministrator({password:"0123",confirm:"0123"})');
  const token = run('loginAdministrator("0123").token');
  const input = {adminToken:token,name:"새 현장",password:"test-only-password",requestId:"request-test-123456789"};
  const create = (overrides={}) => {context.input={...input,...overrides}; return run("createManagedProject(input)")};
  const auth = {project:input.name,accessKey:crypto.createHash("sha256").update(input.password).digest("hex")};
  const get = (params={}) => {context.params={action:"load",...auth,...params};return JSON.parse(run("doGet({parameter:params}).text"))};
  const post = data => {context.body=JSON.stringify({...auth,...data});return JSON.parse(run("doPost({postData:{contents:body}}).text"))};
  const change = (overrides={}) => {context.changeInput={adminToken:token,name:input.name,password:"01234567",expectedRevision:0,...overrides};return run("changeManagedProjectPassword(changeInput)")};
  return {run,create,get,post,change,properties,token,advance:ms=>now+=ms,creates:()=>creates,setActive:v=>active=v,failCreate:v=>failCreate=v,failSetup:v=>failSetup=v,onLock:fn=>onLock=fn};
}

test("new project provisions one sheet, idempotent retries never reset password",()=>{
  const b=backend();const first=b.create();assert.equal(b.creates(),1);assert.equal(b.create().spreadsheetUrl,first.spreadsheetUrl);
  assert.throws(()=>b.create({password:"different-password"}),/비밀번호/);assert.equal(b.creates(),1);
  assert.throws(()=>b.create({requestId:"another-request-123456"}),/이미/);
});

test("admin and project passwords are separate and four characters preserve leading zero",()=>{
  const b=backend();b.create({password:"4567"});b.setActive("");
  assert.equal(b.get({accessKey:accessKey("0123")}).ok,false);
  assert.equal(b.get({accessKey:accessKey("4567")}).ok,true);
  assert.throws(()=>b.run('loginAdministrator("4567")'),/올바르지/);
  const result=b.run('loginAdministrator("0123")');assert.ok(result.token.length>=64);
  assert.equal(b.post({action:"verifyAdministrator",adminToken:result.token}).ok,true);
  assert.equal(b.post({action:"verifyAdministrator",adminToken:accessKey("4567")}).ok,false);
  assert.ok(!b.properties.get("ADMINISTRATOR_V1").includes('"0123"'));
});

test("only owner can bootstrap admin, setup is not an overwrite or recovery endpoint",()=>{
  const b=backend();const before=b.properties.get("ADMINISTRATOR_V1");
  assert.throws(()=>b.run('setupAdministrator({password:"9876",confirm:"9876"})'),/이미/);
  b.properties.delete("ADMINISTRATOR_V1");b.setActive("");
  assert.throws(()=>b.run('setupAdministrator({password:"9876",confirm:"9876"})'),/관리자/);
  assert.equal(b.properties.has("ADMINISTRATOR_V1"),false);
  b.setActive("owner@example.test");
  assert.throws(()=>b.run('setupAdministrator({password:"123",confirm:"123"})'),/4~128/);
  assert.throws(()=>b.run('setupAdministrator({password:"1234",confirm:"9999"})'),/일치/);
  b.run('setupAdministrator({password:"9876",confirm:"9876"})');
  assert.notEqual(b.properties.get("ADMINISTRATOR_V1"),before);
});

test("admin sessions expire, logout revokes, and admin rotation revokes every prior session",()=>{
  const b=backend();b.create();b.advance(900001);assert.throws(()=>b.change(),/만료/);
  const a=b.run('loginAdministrator("0123").token');
  b.run(`logoutAdministrator(${JSON.stringify(a)})`);
  assert.throws(()=>b.change({adminToken:a}),/만료/);
  const c=b.run('loginAdministrator("0123").token'),d=b.run('loginAdministrator("0123").token');
  b.run(`changeAdministratorPassword({adminToken:${JSON.stringify(c)},password:"6789",confirm:"6789"})`);
  assert.throws(()=>b.change({adminToken:c}),/만료/);assert.throws(()=>b.change({adminToken:d}),/만료/);
  assert.throws(()=>b.run('loginAdministrator("0123")'),/올바르지/);
  assert.ok(b.run('loginAdministrator("6789").token'));
  assert.equal(b.get().ok,true);
});

test("five wrong administrator passwords lock login for fifteen minutes without locking project data",()=>{
  const b=backend();b.create();
  for(let i=0;i<5;i++)assert.throws(()=>b.run('loginAdministrator("wrong")'),/비밀번호/);
  assert.throws(()=>b.run('loginAdministrator("0123")'),/15분/);
  assert.equal(b.get().ok,true);
  b.advance(900001);assert.ok(b.run('loginAdministrator("0123").token'));
  assert.equal(b.properties.has("ADMIN_LOGIN_FAILURES"),false);
});

test("administrator state is rechecked under the project mutation lock",()=>{
  const b=backend();b.create();b.onLock(()=>b.run(`logoutAdministrator(${JSON.stringify(b.token)})`));
  assert.throws(()=>b.change(),/만료/);assert.equal(b.get().ok,true);
});

test("central HTTP login, verification and logout are compatible with legacy administrator bridge",()=>{
  const b=backend();b.create();const before=[...b.properties];
  const login=b.post({action:'administratorLogin',password:'0123'});assert.equal(login.ok,true);
  assert.equal(b.post({action:'verifyAdministrator',adminToken:login.token}).ok,true);
  assert.equal(b.post({action:'logoutAdministrator',adminToken:login.token}).ok,true);
  assert.equal(b.post({action:'verifyAdministrator',adminToken:login.token}).ok,false);
  assert.equal(b.get().ok,true);assert.deepEqual([...b.properties],before);
});

test("browser administrator callback is origin-bound, nonce-bound and only returns session results",()=>{
  const b=backend(),params={origin:'https://hwarim371-ops.github.io',requestId:'12345678-1234-1234-1234-123456789012',adminBrowserAction:'login',password:'0123'};
  const html=b.run(`doPost({parameter:${JSON.stringify(params)}}).text`);
  assert.match(html,/window.top.postMessage/);assert.match(html,/hwarim-administrator/);assert.match(html,/https:\/\/hwarim371-ops.github.io/);
  assert.ok(!html.includes('"password"'));assert.ok(!html.includes('"0123"'));new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  assert.throws(()=>b.run(`doPost({parameter:${JSON.stringify({...params,origin:'https://evil.invalid'})}})`),/경로/);
  assert.throws(()=>b.run(`doPost({parameter:${JSON.stringify({...params,requestId:'short'})}})`),/경로/);
});

test("central project password can edit records but cannot overwrite manager settings",()=>{
  const b=backend();b.create();const settings={config:{labor:['owner']},projectSettings:{constructionStartDate:'2026-01-01'},projects:[]};
  assert.equal(b.post({type:'appState',stateData:settings,settingsUpdate:true,expectedSettingsRevision:0,adminToken:b.token}).ok,true);
  assert.equal(b.post({type:'appState',stateData:{config:{labor:['staff']},extraSummaryItems:[{amount:5}]}}).ok,true);
  assert.deepEqual(b.get().stateData.config,settings.config);assert.equal(b.get().stateData.extraSummaryItems[0].amount,5);
  assert.equal(b.post({type:'appState',stateData:settings,settingsUpdate:true,expectedSettingsRevision:1}).ok,false);
  assert.equal(b.post({type:'workEntries',records:[{id:'staff-work',cost:12}]}).ok,true);
  assert.equal(b.get().settingsProtection,true);
});

test("administrator setup script compiles and never stores password in browser persistence",()=>{
  const b=backend(),html=b.run('ADMIN_SETUP_HTML');new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  assert.equal((html.match(/minlength="4"/g)||[]).length,2);
  assert.ok(!/localStorage|sessionStorage/.test(html));
  b.setActive("");assert.throws(()=>b.run('administratorSetupPage_()'),/관리자/);
});
test("callers without admin sessions cannot create projects; setup remains owner-only",()=>{
  const b=backend();b.setActive("");assert.throws(()=>b.create({adminToken:""}),/관리자/);assert.throws(()=>b.run("listManagedProjects()"),/관리자/);assert.equal(b.creates(),0);
  b.setActive("someone@example.test");assert.throws(()=>b.run("setupConnector()"),/소유자/);
});
test("legacy names and passwords outside 4-128 characters are rejected without writes",()=>{
  const b=backend();assert.throws(()=>b.create({name:"천안1"}),/기존/);
  for(const password of ["123",""," ".repeat(4),"x".repeat(129),1234,null]) assert.throws(()=>b.create({password}),/4~128/);
  assert.equal(b.creates(),0);
});
test("four digits preserve leading zero; longer passwords remain supported",()=>{
  const b=backend();b.create({password:"0123"});assert.equal(b.get({accessKey:accessKey("0123")}).ok,true);assert.equal(b.get({accessKey:accessKey("123")}).ok,false);
  const long=backend();long.create({password:"x".repeat(128)});assert.equal(long.get({accessKey:accessKey("x".repeat(128))}).ok,true);
});
test("password changes require admin session and cannot use the project data endpoint",()=>{
  const b=backend();b.create();const before=[...b.properties];
  for(const user of ["","someone@example.test"]){b.setActive(user);assert.throws(()=>b.change({adminToken:""}),/관리자/)}
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
  for(const password of ["123","","x".repeat(129),"    ",1234])assert.throws(()=>b.change({password}),/4~128/);
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
test("manager scripts compile and all password inputs require four characters",()=>{
  const html=backend().run("MANAGER_HTML");const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(script);
  assert.equal((html.match(/minlength="4"/g)||[]).length,7);assert.ok(!html.includes('minlength="8"'));
});
test("previously configured four-digit credentials remain valid until owner changes them",()=>{
  const b=backend();b.create();const key=[...b.properties.keys()].find(k=>k.startsWith("PROJECT_")),project=JSON.parse(b.properties.get(key));
  project.verifier=accessKey(project.salt+accessKey("0123"));b.properties.set(key,JSON.stringify(project));
  assert.equal(b.get({accessKey:accessKey("0123")}).ok,true);b.change({password:"4567"});
  assert.equal(b.get({accessKey:accessKey("4567")}).ok,true);assert.equal(b.get({accessKey:accessKey("0123")}).ok,false);
});

test("repeated bad passwords briefly block only that project and expire",()=>{
  const b=backend();b.create();b.create({name:"other"});
  for(let i=0;i<10;i++)assert.equal(b.get({accessKey:accessKey("bad"+i)}).ok,false);
  assert.match(b.get().message,/1분/);assert.equal(b.get({project:"other"}).ok,true);
  b.advance(61000);assert.equal(b.get().ok,true);
});

test("project manager deep link is escaped and selects only the named project",()=>{
  const b=backend();const html=b.run('doGet({parameter:{action:"manage",project:"</script><img src=x>"}}).text');
  assert.ok(!html.includes('</script><img'));assert.ok(html.includes('\\u003c/script>'));
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
  const stateData={config:{memo:"long ".repeat(18000)},projectSettings:{constructionStartDate:"2026-10-01"},projects:[]};
  assert.equal(b.post({type:"appState",stateData,settingsUpdate:true,expectedSettingsRevision:0,adminToken:b.token}).ok,true);assert.deepEqual(b.get().stateData.config,stateData.config);
});
test("invalid IDs, duplicate IDs and invalid numbers do not replace previous records",()=>{
  const b=backend();b.create();b.post({type:"workEntries",records:[{id:"a",cost:123}]});
  for(const records of [[{cost:1}],[{id:"a"},{id:"a"}],[{id:"b",cost:-3}]]) assert.equal(b.post({type:"workEntries",records}).ok,false);
  assert.equal(b.get().workEntries[0].cost,123);
});
test("JSONP callback cannot inject code",()=>{
  const b=backend();b.create();const value=b.run('json_({ok:true},"alert(1);//").text');assert.equal(value,'{"ok":true}');
});
