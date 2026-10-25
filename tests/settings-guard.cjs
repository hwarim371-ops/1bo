const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'..','settings-guard.gs'),'utf8'),context);
const settings={config:{labor:['labor'],laborRates:{labor:300000}},projectSettings:{constructionStartDate:'2026-01-01'},projects:[{name:'A'}]};
function merge(current,incoming,request={}){context.current=current;context.incoming=incoming;context.request=request;context.auth=token=>{if(token!=='synthetic-admin')throw new Error('unauthorized')};return JSON.parse(JSON.stringify(vm.runInContext('mergeProtectedSettings_(current,incoming,request,auth)',context)))}
test('ordinary saves preserve all settings and revision while allowing record bookkeeping',()=>{
 const current={...settings,settingsRevision:4};const next=merge(current,{config:{labor:['bad']},projectSettings:{},projects:[],settingsRevision:999,deletedRecords:{work:['x']}});
 assert.deepEqual(next,{...current,deletedRecords:{work:['x']}});assert.deepEqual(merge({},settings),{settingsRevision:0});
});
test('settings mutations require admin even when content is unchanged or the token is a project password',()=>{
 for(const token of [undefined,'project-password'])assert.throws(()=>merge(settings,settings,{settingsUpdate:true,adminToken:token,expectedSettingsRevision:0}),/unauthorized/);
});
test('settings update is revision controlled, idempotent and preserves ordinary data',()=>{
 const current={...settings,settingsRevision:4,extraSummaryItems:[{amount:42}]},request={settingsUpdate:true,adminToken:'synthetic-admin',expectedSettingsRevision:4};
 const changed={...settings,config:{labor:['new']}};const next=merge(current,changed,request);assert.equal(next.settingsRevision,5);assert.deepEqual(next.extraSummaryItems,current.extraSummaryItems);
 assert.deepEqual(merge(next,changed,request),next);assert.throws(()=>merge(next,settings,request),/다른 기기/);
 assert.equal(merge(next,changed,{...request,expectedSettingsRevision:5}).settingsRevision,5);
});
test('invalid settings shape and missing revisions fail before mutation',()=>{
 for(const value of [[],null,'bad'])assert.throws(()=>merge(settings,value));
 for(const incoming of [{}, {...settings,config:[]}, {...settings,projects:{}}])assert.throws(()=>merge(settings,incoming,{settingsUpdate:true,adminToken:'synthetic-admin',expectedSettingsRevision:0}),/형식/);
 assert.throws(()=>merge(settings,settings,{settingsUpdate:true,adminToken:'synthetic-admin'}),/다시/);
});
