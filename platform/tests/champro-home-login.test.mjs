import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root=readFileSync('index.html','utf8');
const home=readFileSync('platform/licensing/home-auth.js','utf8');
const common=readFileSync('platform/licensing/auth-session.js','utf8');
assert(root.includes('id="champroHomeLogin"'));
assert(root.includes('/platform/licensing/auth-session.js'));
assert(root.includes('/platform/licensing/home-auth.js'));
assert(root.indexOf('/platform/licensing/auth-session.js')<root.indexOf('/platform/licensing/home-auth.js'));
assert(!home.includes('localStorage')||home.includes('Never writes credentials to URL, localStorage'));
assert(home.includes('/api/me'));
assert(!home.includes('/api/usage/'));
assert(root.includes('href="/app/"')&&root.includes('href="/tron-de/"')&&root.includes('href="/qr-excel.html"'));

const now=Math.floor(Date.now()/1000);
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({iss:'https://mrhien.com',aud:'champro-platform',iat:now,exp:now+900})+'.'+('x'.repeat(43));
const store=new Map();
const listeners=new Map();
const opened={};
const button={
  textContent:'Đăng ký và đăng nhập',title:'',attrs:{},handlers:{},
  classList:{enabled:new Set(),toggle(key,on){if(on)this.enabled.add(key);else this.enabled.delete(key)}},
  addEventListener(name,callback){this.handlers[name]=callback},
  setAttribute(key,value){this.attrs[key]=value}
};
let popup=null,calls=[];
const sessionStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
const window={
  addEventListener(name,callback){let a=listeners.get(name)||[];a.push(callback);listeners.set(name,a)},
  dispatchEvent(event){for(const callback of listeners.get(event.type)||[])callback(event)},
  open(url,name,config){opened.url=url;popup={close(){popup=null}};return popup;},
  champroAuthSession:null
};
const env={
  window,document:{getElementById:id=>id==='champroHomeLogin'?button:null},
  Event:class {constructor(type){this.type=type}},sessionStorage,
  atob:s=>Buffer.from(s,'base64').toString('binary'),
  fetch:async(url,options)=>{calls.push({url,authorization:options.headers.Authorization});return {status:200,ok:true,json:async()=>({ok:true,account:{name:'giaovien_demo',plan:'free'}})};},
  console,Date
};
const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
vm.runInNewContext(common,env);
vm.runInNewContext(home,env);
await drain();
assert.equal(button.textContent,'Đăng ký và đăng nhập');
button.handlers.click();
assert.equal(opened.url,'https://mrhien.com/champro-connect/');
window.dispatchEvent({type:'message',origin:'https://other.example',source:popup,data:{type:'champro-session',token}});
assert.equal(window.champroAuthSession.getToken(),null,'foreign origin ignored');
window.dispatchEvent({type:'message',origin:'https://mrhien.com',source:popup,data:{type:'champro-session',token}});
await drain();
assert.equal(button.textContent,'giaovien_demo');
assert.equal(window.champroAuthSession.getToken(),token);
assert.equal(button.classList.enabled.has('hs-auth-connected'),true);
assert.equal(calls.at(-1).authorization,'Bearer '+token);
// Shared session storage is reused when navigating to a different page in SAME tab.
assert.equal(sessionStorage.getItem('champro.auth.session.v1'),token);
window.champroAuthSession.clear();
await drain();
assert.equal(button.textContent,'Đăng ký và đăng nhập');
assert.equal(window.champroAuthSession.getToken(),null);
console.log('PASS: landing sign-in popup, origin check, account label, same-tab session and logout; no quota modification.');
