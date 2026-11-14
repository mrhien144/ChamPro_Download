import assert from 'node:assert/strict';
import {startSync} from '../sync/start.mjs';
let mutated=false,approved=false,requests=0;
const before=globalThis.fetch;
globalThis.fetch=async ()=>{
 requests++;
 return new Response(JSON.stringify({ok:true,owner:'wp:9',enabled:true}),{
  status:200,headers:{'content-type':'application/json'}});
};
try{
 const state={schema:1,exams:[{id:'exam-1',name:'E'}],students:[],results:[]};
 await assert.rejects(()=>startSync({
  api:'https://example.invalid',owner:'wp:8',getToken:async()=>'fake-signed',
  getDb:()=>state,saveDb:async()=>{mutated=true},
  consent:async()=>{approved=true;return true}
 }),/không thuộc tài khoản/);
 assert.equal(requests,1);
 assert.equal(mutated,false);
 assert.equal(approved,false,'should refuse before consent when server account differs');
}finally{globalThis.fetch=before;}
console.log('PASS: cross-account token cannot authorize adoption of legacy data');
