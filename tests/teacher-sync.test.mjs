/**
 * Isolated staging API tests. No real Cloudflare services, student data or camera.
 * Covers tenant isolation, revision conflicts, photo privacy and upload limits.
 */
import assert from 'node:assert/strict';
import {handleTeacherSync} from '../platform/worker/src/teacher-sync.js';

class FakeDB {
  constructor(){
    this.accounts=new Map([['wp:1',{id:'wp:1',status:'active'}],['wp:2',{id:'wp:2',status:'active'}],['wp:3',{id:'wp:3',status:'suspended'}]]);
    this.records=new Map();
    this.photos=new Map();
  }
  prepare(sql){
    const db=this,query=sql.replace(/\s+/g,' ').trim();
    return {bind(...args){
      return {
        async first(){
          if(query.startsWith('SELECT id,status FROM accounts'))return db.accounts.get(args[0])??null;
          if(query.startsWith('SELECT revision FROM cp_records')){
            const x=db.records.get(args.slice(0,3).join('|'));return x?{revision:x.revision}:null;
          }
          if(query.startsWith('SELECT record_id FROM cp_records')){
            const x=db.records.get([args[0],'result',args[1]].join('|'));
            return x&&!x.deleted_at?{record_id:args[1]}:null;
          }
          if(query.startsWith('SELECT result_id FROM cp_photo_objects')){
            const x=db.photos.get([args[0],args[1]].join('|'));return x?{result_id:x.result_id}:null;
          }
          if(query.startsWith('SELECT r2_object_key,mime_type FROM cp_photo_objects')){
            const x=db.photos.get([args[0],args[1]].join('|'));return x&&!x.deleted_at?x:null;
          }
          throw Error('Unexpected first: '+query);
        },
        async all(){
          if(query.startsWith('SELECT record_type,record_id,revision,payload_json')){
            const [account,limit,offset]=args;
            const results=[...db.records.values()].filter(x=>x.account_id===account)
              .sort((a,b)=>a.record_type.localeCompare(b.record_type)||a.record_id.localeCompare(b.record_id))
              .slice(offset,offset+limit);
            return {results};
          }
          throw Error('Unexpected all: '+query);
        },
        async run(){
          if(query.startsWith('INSERT OR IGNORE INTO cp_records')){
            const [account,type,id,revision,payload_json]=args,key=[account,type,id].join('|');
            if(db.records.has(key))return {meta:{changes:0}};
            db.records.set(key,{account_id:account,record_type:type,record_id:id,revision,payload_json,updated_at:'2026-11-11',deleted_at:null});
            return {meta:{changes:1}};
          }
          if(query.startsWith('UPDATE cp_records SET payload_json=')){
            const [payload_json,account,type,id,expected]=args,key=[account,type,id].join('|');
            const x=db.records.get(key);
            if(!x||x.revision!==expected)return {meta:{changes:0}};
            x.revision++;x.payload_json=payload_json;x.updated_at='2026-11-12';return {meta:{changes:1}};
          }
          if(query.startsWith('INSERT OR IGNORE INTO cp_photo_objects')){
            const [account,result_id,r2_object_key,mime_type,size_bytes,sha256]=args,key=[account,result_id].join('|');
            if(db.photos.has(key))return {meta:{changes:0}};
            db.photos.set(key,{account_id:account,result_id,r2_object_key,mime_type,size_bytes,sha256,deleted_at:null});
            return {meta:{changes:1}};
          }
          throw Error('Unexpected run: '+query);
        }
      };
    }};
  }
}
const db=new FakeDB(),objects=new Map();
const env={DB:db,SHEET_PHOTOS:{
  async put(key,bytes){objects.set(key,new Uint8Array(bytes));},
  async get(key){const data=objects.get(key);return data?{body:new Blob([data]).stream()}:null;},
  async delete(key){objects.delete(key);}
}};
const alice={id:'wp:1'},bob={id:'wp:2'},suspended={id:'wp:3'};
const call=(who,path,method='GET',body,headers={})=>{
  const req=new Request('https://example.test'+path,{method,headers,body});
  return handleTeacherSync(req,env,who,new URL(req.url).pathname,new URL(req.url));
};
const post=(who,type,id,baseRevision,payload)=>call(who,'/api/sync/records','POST',JSON.stringify({type,id,baseRevision,payload}),{'content-type':'application/json'});
const data=async response=>({status:response.status,...await response.json()});

assert.deepEqual((await data(await call(alice,'/api/sync/status'))).ok,true);
assert.equal((await call(suspended,'/api/sync/status')).status,403);
assert.equal((await call({id:'wp:4'},'/api/sync/status')).status,403);

let x=await data(await post(alice,'result','res-1',0,{id:'res-1',score:8}));
assert.equal(x.status,200);assert.equal(x.revision,1);
x=await data(await post(alice,'result','res-1',0,{id:'res-1',score:0}));
assert.equal(x.status,409);
x=await data(await post(alice,'result','res-1',1,{id:'res-1',score:9}));
assert.equal(x.revision,2);
x=await data(await post(alice,'result','res-1',1,{id:'res-1',score:10}));
assert.equal(x.status,409);assert.equal(x.currentRevision,2);

x=await data(await call(alice,'/api/sync/records'));
assert.equal(x.records.length,1);assert.equal(x.records[0].payload.score,9);
x=await data(await call(bob,'/api/sync/records'));
assert.equal(x.records.length,0);
x=await data(await post(bob,'result','res-1',0,{id:'res-1',score:5}));
assert.equal(x.revision,1);
x=await data(await call(bob,'/api/sync/records'));
assert.equal(x.records[0].payload.score,5);
assert.equal((await post(alice,'result','bad id',0,{})).status,400);

const jpeg=new Uint8Array(120);jpeg.set([0xff,0xd8,0xff,0xe0],0);jpeg.set([0xff,0xd9],118);
const upload=(who,id,bytes=jpeg,ctype='image/jpeg')=>call(who,'/api/sync/photo?resultId='+id,'POST',bytes,{'content-type':ctype});
assert.equal((await upload(alice,'unknown')).status,409);
assert.equal((await upload(alice,'res-1',jpeg,'image/png')).status,413);
x=await data(await upload(alice,'res-1'));assert.equal(x.status,201);assert.equal(x.size,120);
assert.equal((await upload(alice,'res-1')).status,409);
const photo=await call(alice,'/api/sync/photo?resultId=res-1');
assert.equal(photo.status,200);assert.equal(photo.headers.get('cache-control'),'private, no-store');
assert.deepEqual(new Uint8Array(await photo.arrayBuffer()),jpeg);
assert.equal((await call(bob,'/api/sync/photo?resultId=res-1')).status,404);
const huge=new Uint8Array(2*1024*1024+1);huge.set([0xff,0xd8,0xff],0);
assert.equal((await upload(bob,'res-1',huge)).status,413);
assert.equal(objects.size,1);

console.log('PASS: staging D1/R2 sync tenant isolation, revisions, photo privacy and size limits');
