const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','administrator-access.js'),'utf8');
function app(){
 const nodes=new Map(),windowEvents={},documentEvents={},timers=new Map(),created=[];let clock=1000,id=0;
 function node(tag){return {tag,children:[],listeners:{},contentWindow:{},open:false,value:'',append(...xs){this.children.push(...xs)},remove(){this.removed=true},addEventListener(n,fn){this.listeners[n]=fn},reportValidity:()=>true,reset(){nodes.get('administratorPassword').value=''},showModal(){this.open=true},focus(){},close(){this.open=false;this.listeners.close?.()},submit(){}}}
 for(const key of ['administratorDialog','administratorStatus','administratorPassword','administratorLoginForm','administratorLoginFields','administratorCancel'])nodes.set(key,node(key));
 const win={APP_CONFIG:{projectDirectoryEndpoint:'https://script.google.com/macros/s/KNOWN/exec'},addEventListener(n,fn){windowEvents[n]=fn},removeEventListener(n,fn){if(windowEvents[n]===fn)delete windowEvents[n]},dispatchEvent(){}};
 const context=vm.createContext({window:win,document:{getElementById:k=>nodes.get(k),createElement:t=>{const x=node(t);created.push(x);return x},body:{append(){}},addEventListener(n,fn){documentEvents[n]=fn}},location:{origin:'https://hwarim371-ops.github.io'},crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789012'},Event:class{},Date:class extends Date{static now(){return clock}},setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id},clearTimeout:n=>timers.delete(n)});
 vm.runInContext(source,context);documentEvents.DOMContentLoaded();
 return {nodes,win,timers,created,advance:ms=>clock+=ms,async start(){win.AdministratorAccess.open();nodes.get('administratorPassword').value='fake-pin';return nodes.get('administratorLoginForm').listeners.submit({preventDefault(){}})},reply(overrides={}){const frame=created.findLast(x=>x.tag==='iframe');windowEvents.message?.({origin:'https://unit-script.googleusercontent.com',source:frame.contentWindow,data:{type:'hwarim-administrator',requestId:'12345678-1234-1234-1234-123456789012',ok:true,token:'synthetic-admin-session-01234567890123456789',expiresAt:901000},...overrides})}};
}
test('administrator login posts credentials, clears visible input, and never persists or puts them in URLs',async()=>{
 const b=app(),pending=b.start();assert.equal(b.nodes.get('administratorPassword').value,'');const form=b.created.find(x=>x.tag==='form');assert.equal(form.method,'POST');assert.ok(!form.action.includes('fake-pin'));
 b.reply();await pending;assert.ok(b.win.AdministratorAccess.token());assert.equal(b.nodes.get('administratorDialog').open,false);assert.equal(form.removed,true);
 assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(source));
});
test('messages from a wrong origin or unrelated window cannot unlock settings',async()=>{
 const b=app(),pending=b.start();b.reply({origin:'https://evil.invalid'});assert.equal(b.win.AdministratorAccess.token(),'');b.reply({source:{parent:null}});assert.equal(b.win.AdministratorAccess.token(),'');b.reply();await pending;assert.ok(b.win.AdministratorAccess.token());
});
test('timeout and cancellation remain locked and expired sessions lock on use',async()=>{
 const b=app(),pending=b.start();[...b.timers.values()].find(t=>t.ms===30000).fn();await pending;assert.equal(b.win.AdministratorAccess.token(),'');assert.match(b.nodes.get('administratorStatus').textContent,/지연/);
 const c=app(),cancelled=c.start();c.nodes.get('administratorDialog').close();c.reply();await cancelled;assert.equal(c.win.AdministratorAccess.token(),'');
 const d=app(),login=d.start();d.reply();await login;d.advance(900001);assert.equal(d.win.AdministratorAccess.token(),'');
});
