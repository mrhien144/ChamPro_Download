import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SyncTransport} from '../../app-preview/sync/client.mjs';

test('web and Android subscribe only to owner-bound sync paths',()=>{
 const web=readFileSync('app-preview/web-app-sync.mjs','utf8');
 const account=readFileSync('app-preview/account-bridge.mjs','utf8');
 const html=readFileSync('app-preview/index.html','utf8');
 assert.match(web,/platformOwner\(\)/);
 assert.match(web,/identity\.id!==owner/);
 assert.match(web,/getToken:getWebSyncToken/);
 assert.match(web,/champro-web-auth-disconnected/);
 assert.match(account,/window\.champroAuthSession=Object\.freeze/);
 assert.match(account,/emitAuth\('verified'\)/);
 assert.match(html,/web-app-sync\.mjs/);
});
test('receiver polls when online and idle, never while camera is capturing',()=>{
 const saved={window:globalThis.window,document:globalThis.document,navigator:globalThis.navigator,
  setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval};
 let callback=null,cleared=false,busy=false,online=true,hidden=false;
 const w={addEventListener(){},removeEventListener(){}};
 const d={get hidden(){return hidden},addEventListener(){},removeEventListener(){}};
 Object.defineProperty(globalThis,'window',{configurable:true,value:w});
 Object.defineProperty(globalThis,'document',{configurable:true,value:d});
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{get onLine(){return online}}});
 globalThis.setInterval=cb=>{callback=cb;return 42;};
 globalThis.clearInterval=id=>{if(id===42)cleared=true;};
 try{
  const transport=new SyncTransport({api:'https://sync.test.invalid',
   getToken:async()=>null,getLocal:async()=>null,applyRemote:async()=>{},
   isBusy:()=>busy,enabled:true});
  transport.setAccount('wp:8');
  let scheduled=0;
  transport.schedule=()=>{scheduled++};
  transport.start();
  assert.equal(scheduled,1);
  assert.equal(typeof callback,'function');
  callback();assert.equal(scheduled,2,'visible idle app should poll');
  busy=true;callback();assert.equal(scheduled,2,'no polling in camera loop');
  busy=false;hidden=true;callback();assert.equal(scheduled,2,'hidden app does not waste data');
  hidden=false;online=false;callback();assert.equal(scheduled,2,'offline does not make requests');
  transport.stop();assert.equal(cleared,true,'stop must release poll timer');
 }finally{
  for(const [k,v] of Object.entries(saved)){
   if(k==='window'||k==='document'||k==='navigator'){
    if(v===undefined)delete globalThis[k];else Object.defineProperty(globalThis,k,{configurable:true,value:v});
   }else globalThis[k]=v;
  }
 }
});
