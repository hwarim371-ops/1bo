const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { prepare } = require("../scripts/prepare-legacy-password.cjs");
const fixture = `const SCRIPT_VERSION = "secure-sync-2026-06-12";
const PASSWORD_PROPERTY="PROJECT_PASSWORD_SHA256";
function doGet(e){const params=e.parameter;
  const auth = authorize_(params);
  return auth;
}
function doPost(payload){const auth=authorize_(payload);if(!auth.ok)return auth;const lock=LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const ss = getSpreadsheet_();
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
  const cache=new Map(),props=new Map(),sheet={writes:0};let now=0,callback=null;
  const hash=text=>crypto.createHash("sha256").update(text).digest("hex");props.set("PROJECT_PASSWORD_SHA256",hash("original"));
  const context=vm.createContext({sha256_:hash,secureEqual_:(a,b)=>a===b,json_:v=>v,getSpreadsheet_:()=>sheet,
    Session:{getActiveUser:()=>({getEmail:()=>"owner@test"}),getEffectiveUser:()=>({getEmail:()=>"owner@test"})},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k),setProperties:values=>Object.entries(values).forEach(([k,v])=>props.set(k,v))})},
    CacheService:{getScriptCache:()=>({get:k=>cache.get(k)?.until>now?cache.get(k).value:null,put:(k,value,ttl)=>cache.set(k,{value,until:now+ttl*1000}),remove:k=>cache.delete(k)})},
    Utilities:{DigestAlgorithm:{SHA_256:1},Charset:{UTF_8:1},computeDigest:(_,text)=>[...crypto.createHash("sha256").update(text).digest()]},
    LockService:{getScriptLock:()=>({waitLock(){const f=callback;callback=null;f?.()},releaseLock(){}})},
    HtmlService:{createHtmlOutput:text=>({text,setTitle(){return this},addMetaTag(){return this}})}
  });
  vm.runInContext(prepare(fixture),context);
  return {sheet,hash,run:code=>vm.runInContext(code,context),onLock:f=>callback=f,advance:ms=>now+=ms};
}
test("legacy admin route is available only as a manager page without touching sheets",()=>{
  const b=app();assert.match(b.run('doGet({parameter:{action:"manage",project:"현장A"}}).text'),/현장A/);assert.equal(b.sheet.writes,0);
  assert.ok(!b.run('doGet({parameter:{action:"manage",project:"<img src=x>"}}).text').includes('<img src=x>'));
});
test("legacy queued write with the old password is rejected after rotation",()=>{
  const b=app();b.onLock(()=>b.run('changeProjectPassword({password:"0123",expectedRevision:0})'));
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
