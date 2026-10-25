const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { prepare } = require("../scripts/prepare-legacy-password.cjs");
const adminToken = "synthetic-admin-session-01234567890123456789";
const fixture = `const SCRIPT_VERSION = "secure-sync-2026-06-12";
const PASSWORD_PROPERTY="PROJECT_PASSWORD_SHA256";
function setupProjectPassword() {
  throw new Error('stub');
}
function setupSheets() {
  throw new Error('stub');
}
function inspectConnectedData() {
  throw new Error('stub');
}
function doGet(e){const params=e.parameter;
  const auth = authorize_(params);
  const project=params.project;
  if(params.action==='load'&&auth.ok)return {
      scriptVersion: SCRIPT_VERSION,
      project,
      ok:true
  };
  return auth;
}
function doPost(payload){const auth=authorize_(payload);if(!auth.ok)return auth;const lock=LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = getSpreadsheet_();
    const project=payload.project;
    if(payload.type==='appState'){
      saveAppState_(ss, project, payload.stateData || {});
    }else if(payload.type==='replaceProjectData'){
      replaceProjectData_(ss, project, payload);
    }
    ss.writes++;return {ok:true};
  }finally{lock.releaseLock()}
}
function authorize_(payload) {
  const expected=PropertiesService.getScriptProperties().getProperty(PASSWORD_PROPERTY);
  if (!secureEqual_(expected, String(payload.accessKey || ""))) {
    return {ok:false};
  }
  return { ok: true };
}`;
function app() {
  const cache=new Map(),props=new Map(),sheet={writes:0},requests=[];let now=0,callback=null,remote=null,loggedIn=true;
  const hash=text=>crypto.createHash("sha256").update(text).digest("hex");props.set("PROJECT_PASSWORD_SHA256",hash("original"));
  const context=vm.createContext({sha256_:hash,secureEqual_:(a,b)=>a===b,json_:v=>v,getSpreadsheet_:()=>sheet,
    readAppState_:()=>sheet.state||{},saveAppState_:(_,project,state)=>sheet.state=state,
    replaceProjectData_:(_,project,payload)=>sheet.state=payload.stateData,
    Date:class extends Date {static now(){return now}},
    UrlFetchApp:{fetch(url,options){
      const input=JSON.parse(options.payload);requests.push({url,options,input});
      if(remote)return remote(input);
      let data;
      if(input.action==='administratorLogin'){
        loggedIn=input.password==='fake-admin-pin';
        data=loggedIn?{ok:true,token:adminToken,expiresAt:now+900000}:{ok:false,message:'관리자 비밀번호가 올바르지 않습니다.'};
      }else if(input.action==='logoutAdministrator'){loggedIn=false;data={ok:true}}
      else data=loggedIn&&input.adminToken===adminToken?{ok:true}:{ok:false,message:'관리자 확인이 만료되었습니다.'};
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(data)};
    }},
    Session:{getActiveUser:()=>({getEmail:()=>"owner@test"}),getEffectiveUser:()=>({getEmail:()=>"owner@test"})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperties:values=>Object.entries(values).forEach(([k,v])=>props.set(k,v))})},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k)?.until>now?cache.get(k).value:null,put:(k,value,ttl)=>cache.set(k,{value,until:now+ttl*1000}),remove:k=>cache.delete(k)})},
    Utilities:{DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(_,text)=>[...crypto.createHash("sha256").update(text).digest()]},
    LockService:{getScriptLock:()=>({waitLock(){const f=callback;callback=null;f?.()},releaseLock(){}})},
    HtmlService:{createHtmlOutput:text=>({text,setTitle(){return this},addMetaTag(){return this}})}
  });
  vm.runInContext(prepare(fixture),context);
  return {sheet,hash,props,requests,run:code=>vm.runInContext(code,context),onLock:f=>callback=f,advance:ms=>now+=ms,setRemote:f=>remote=f,
    change:(input={})=>{context.changeInput={adminToken,password:'0123',expectedRevision:0,...input};return vm.runInContext('changeProjectPassword(changeInput)',context)}};
}
test("legacy admin route is available only as a manager page without touching sheets",()=>{
  const b=app();assert.match(b.run('doGet({parameter:{action:"manage",project:"현장A"}}).text'),/현장A/);assert.equal(b.sheet.writes,0);
  assert.ok(!b.run('doGet({parameter:{action:"manage",project:"<img src=x>"}}).text').includes('<img src=x>'));
});
test("legacy queued write with the old password is rejected after rotation",()=>{
  const b=app();b.onLock(()=>b.change());
  assert.equal(b.run(`doPost({accessKey:"${b.hash("original")}"}).ok`),false);assert.equal(b.sheet.writes,0);
  assert.equal(b.run(`doPost({accessKey:"${b.hash("0123")}"}).ok`),true);assert.equal(b.sheet.writes,1);
});
test("legacy throttle cannot be bypassed with a different project parameter",()=>{
  const b=app();for(let i=0;i<10;i++)b.run(`doGet({parameter:{project:"spoof${i}",accessKey:"bad"}})`);
  assert.equal(b.run(`doGet({parameter:{project:"other",accessKey:"${b.hash("original")}"}}).code`),"RATE_LIMITED");
  b.advance(61000);assert.equal(b.run(`doGet({parameter:{accessKey:"${b.hash("original")}"}}).ok`),true);
});
test("legacy preparer refuses unexpected or already patched sources",()=>{
  assert.throws(()=>prepare(fixture.replace('secure-sync-2026-06-12','other')));
  assert.throws(()=>prepare(prepare(fixture)));
});

test("legacy ordinary and replacement record sync preserve protected settings",()=>{
  const b=app();b.sheet.state={config:{labor:['original']},projectSettings:{constructionStartDate:'2026-01-01'},projects:[],settingsRevision:3};
  for(const type of ['appState','replaceProjectData'])b.run(`doPost({type:'${type}',accessKey:'${b.hash('original')}',stateData:{config:{labor:['hijacked']},projectSettings:{},projects:[],settingsRevision:999,extraSummaryItems:[1]}})`);
  assert.equal(b.sheet.state.config.labor[0],'original');assert.equal(b.sheet.state.settingsRevision,3);assert.equal(b.sheet.state.extraSummaryItems[0],1);
  assert.equal(b.run(`doGet({parameter:{action:'load',accessKey:'${b.hash('original')}'}}).settingsProtection`),true);
});

test("legacy mutations and state require a central admin session even for the Google owner",()=>{
  const b=app(),before=[...b.props];
  for(const token of ['',undefined,b.hash('original')]){
    assert.throws(()=>b.change({adminToken:token}),/관리자/);
    assert.throws(()=>b.run(`passwordManagerState(${JSON.stringify(token)})`),/관리자/);
  }
  assert.deepEqual([...b.props],before);assert.equal(b.sheet.writes,0);
  assert.equal(b.change().revision,1);assert.equal(b.props.get('PROJECT_PASSWORD_SHA256'),b.hash('0123'));
  assert.equal(b.change().revision,1);
  assert.throws(()=>b.change({password:'4567'}),/다른 화면/);
});

test("legacy admin bridge uses a fixed HTTPS POST endpoint and never persists the admin password",()=>{
  const b=app(),before=[...b.props];
  assert.equal(b.run('loginPasswordAdministrator("fake-admin-pin").token'),adminToken);
  const request=b.requests[0];assert.match(request.url,/^https:\/\/script.google.com\/macros\/s\/[^/?]+\/exec$/);
  assert.equal(request.options.method,'post');assert.equal(request.options.validateHttpsCertificates,true);
  assert.equal(request.options.followRedirects,true);assert.equal(request.options.contentType,'application/json');
  assert.deepEqual(request.input,{action:'administratorLogin',password:'fake-admin-pin'});
  assert.deepEqual([...b.props],before);assert.equal(b.sheet.writes,0);
  assert.throws(()=>b.run('loginPasswordAdministrator("original")'),/올바르지/);
  assert.throws(()=>b.run('loginPasswordAdministrator("123")'),/4~128/);
});

test("legacy administrator verification fails closed on bad HTTP, JSON, and central denial",()=>{
  for(const response of [
    {code:500,text:'internal'}, {code:200,text:'<html>login</html>'}, {code:200,text:'{"ok":"true"}'},
    {code:200,text:'{"ok":false,"message":"관리자 확인이 만료되었습니다."}'}, {code:200,text:'x'.repeat(10001)}
  ]){
    const b=app(),before=[...b.props];
    b.setRemote(()=>({getResponseCode:()=>response.code,getContentText:()=>response.text}));
    assert.throws(()=>b.change(),/관리자/);assert.deepEqual([...b.props],before);
    assert.equal(b.run(`doPost({accessKey:"${b.hash('original')}"}).ok`),true);
  }
  const b=app();b.setRemote(()=>{throw new Error('sensitive raw transport details')});
  assert.throws(()=>b.change(),error=>!error.message.includes('sensitive')&&error.message.includes('연결'));
});

test("legacy verifies admin twice around the mutation lock and honors immediate logout",()=>{
  const b=app(),before=[...b.props];b.onLock(()=>b.run(`logoutPasswordAdministrator('${adminToken}')`));
  assert.throws(()=>b.change(),/만료/);assert.deepEqual([...b.props],before);
  assert.equal(b.requests.filter(r=>r.input.action==='verifyAdministrator').length,2);
  b.run('loginPasswordAdministrator("fake-admin-pin")');assert.equal(b.change().revision,1);
  b.run(`logoutPasswordAdministrator('${adminToken}')`);assert.throws(()=>b.change({expectedRevision:1}),/만료/);
});

test("legacy login rejects malformed or expired central sessions",()=>{
  for(const data of [{token:'bad',expiresAt:900000},{token:adminToken,expiresAt:0},{token:adminToken,expiresAt:900001},{token:adminToken,expiresAt:'900000'}]){
    const b=app();b.setRemote(()=>({getResponseCode:()=>200,getContentText:()=>JSON.stringify({ok:true,...data})}));
    assert.throws(()=>b.run('loginPasswordAdministrator("fake-admin-pin")'),/응답/);
  }
});

test("legacy manager starts locked, supports four characters, and keeps credentials out of persistence",()=>{
  const b=app(),html=b.run('LEGACY_PASSWORD_HTML');new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  assert.match(html,/<section id="adminContent" hidden>/);assert.equal((html.match(/minlength="4"/g)||[]).length,3);
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(html));
  assert.match(html,/changeProjectPassword\(\{adminToken,password,expectedRevision:revision\}\)/);
  assert.match(html,/current!==generation/);
  const source=fs.readFileSync(path.join(__dirname,'..','admin-bridge.gs'),'utf8');
  assert.ok(!/PropertiesService|CacheService/.test(source));
});
