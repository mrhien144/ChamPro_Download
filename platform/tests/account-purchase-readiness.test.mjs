import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const js=readFileSync(new URL('../account/account.js',import.meta.url),'utf8');
function node(){
 return {disabled:true,hidden:false,textContent:'',value:'',title:'',classList:{add(){},remove(){}},
  append(){},replaceChildren(){},removeAttribute(){},setAttribute(){},onclick:null};
}
async function scenario({ready,token,plan='free',reject=false}){
 const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
 const events={};
 const window={addEventListener(name,handler){events[name]=handler;},champroAuthSession:{
  getToken(){return token?'test-bearer-token':null;},save(){return true;},clear(){}
 },open(){return null;},location:{assign(){throw Error('Must not navigate in unit test');}}};
 const document={getElementById:$,createElement:()=>node()};
 const fetch=async(url)=>{
  if(url.includes('checkout-readiness')) {
   if(reject)throw Error('Network unavailable');
   return {ok:true,json:async()=>({ok:true,ready})};
  }
  if(url.endsWith('/api/me'))return {ok:true,json:async()=>({
   ok:true,account:{name:'Test',plan,email:'test@example.test'},left:{scan:100,mix:5,qr:5},
   limits:{scan:100,mix:5,qr:5},used:{scan:0,mix:0,qr:0},bonus:{scan:0,mix:0,qr:0}
  })};
  throw Error('Unexpected URL '+url);
 };
 vm.runInNewContext(js,{window,document,fetch,console,encodeURIComponent});
 for(let i=0;i<30;i++)await Promise.resolve();
 return {annual:$('buyAnnual').disabled,lifetime:$('buyLifetime').disabled,status:$('annualStatus').textContent};
}
assert.deepEqual([ (await scenario({ready:false,token:true})).annual,(await scenario({ready:false,token:true})).lifetime],[true,true]);
assert.deepEqual([ (await scenario({ready:true,token:false})).annual,(await scenario({ready:true,token:false})).lifetime],[true,true]);
assert.deepEqual([ (await scenario({ready:true,token:true})).annual,(await scenario({ready:true,token:true})).lifetime],[false,false]);
assert.deepEqual([ (await scenario({ready:true,token:true,plan:'annual'})).annual,(await scenario({ready:true,token:true,plan:'annual'})).lifetime],[true,false]);
assert.deepEqual([ (await scenario({ready:true,token:true,plan:'lifetime'})).annual,(await scenario({ready:true,token:true,plan:'lifetime'})).lifetime],[true,true]);
assert.deepEqual([ (await scenario({ready:true,token:true,plan:'suspended'})).annual,(await scenario({ready:true,token:true,plan:'suspended'})).lifetime],[true,true]);
assert.deepEqual([ (await scenario({ready:true,token:true,reject:true})).annual,(await scenario({ready:true,token:true,reject:true})).lifetime],[true,true]);
assert(!js.includes('PURCHASES_OPEN=true') && js.includes('champro/v1/checkout-readiness'));
console.log('PASS: purchase controls require verified server readiness + login, reject lifetime/suspended/offline and disable unsafe renewals.');
