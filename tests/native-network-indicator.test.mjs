import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../android-build/native-app.js',import.meta.url),'utf8');
const begin=source.indexOf("const net=$('cpNativeNet');");
const end=source.indexOf('// APK-only organization:',begin);
assert.ok(begin>0&&end>begin,'Network status is a small, isolated UI-only block');
const networkBlock=source.slice(begin,end);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('uses Android native state over stale navigator.onLine; switches both ways on event',async()=>{
 const classes=new Set(),events={},documentEvents={};
 const net={textContent:'',attrs:{},classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)},setAttribute(k,v){this.attrs[k]=v;}};
 let connected=false,networkListener;
 const context={
   navigator:{onLine:true},// Android WebView incorrectly reports Internet.
   window:{
      Capacitor:{Plugins:{Network:{
         async getStatus(){return {connected,connectionType:connected?'wifi':'none'};},
         addListener(name,handler){assert.equal(name,'networkStatusChange');networkListener=handler;return Promise.resolve({remove(){}});}
      }}},
      addEventListener(name,fn){events[name]=fn;}
   },
   document:{hidden:false,addEventListener(name,fn){documentEvents[name]=fn;}},
   $:id=>id==='cpNativeNet'?net:null,
   sync(){},
   Promise
 };
 vm.runInNewContext(networkBlock,context,{timeout:1000});
 await tick();
 assert.equal(net.textContent,'Ngoại tuyến','native offline overrides stale WebView online');
 assert.equal(classes.has('offline'),true);
 connected=true;networkListener({connected:true,connectionType:'wifi'});
 assert.equal(net.textContent,'Trực tuyến');
 assert.equal(classes.has('offline'),false);
 connected=false;networkListener({connected:false,connectionType:'none'});
 assert.equal(net.textContent,'Ngoại tuyến');
 events.focus();await tick();
 assert.equal(net.textContent,'Ngoại tuyến','resuming screen refreshes native connectivity');
});
test('UI only: does not mutate grading code or fetch anything while scanning',()=>{
 assert.doesNotMatch(networkBlock,/\bfetch\s*\(|XMLHttpRequest|camera|grade|score|localStorage|setInterval/);
 assert.match(networkBlock,/nativeNetwork\.getStatus/);
 assert.match(networkBlock,/networkStatusChange/);
 assert.match(networkBlock,/visibilitychange/);
});
