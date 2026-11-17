import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webAccountStorage} from '../../app/account-storage.mjs';
test('all three local stores are disjoint for independent verified account IDs',()=>{
 const uids=[null,'wp:8','wp:10','wp:100','wp:11'];
 const stores=uids.map(webAccountStorage);
 for(const field of ['data','photos','meta']){
  assert.equal(new Set(stores.map(s=>s[field])).size,stores.length);
 }
 assert.equal(stores[0].owner,null);
 assert.equal(stores[0].data,'champro-web-beta-v1');
 assert.equal(stores[1].data,'champro-web-beta-v1-sync-qa-wp8');
 assert.equal(stores[1].photos,'champro-sheet-photos-web-v1');
 assert.equal(stores[1].meta,'champro-sync-web-qa-wp8-v1');
 for(const bad of ['wp:0','wp:01','wp:8/foo','wp:1.2','8','wp:-1'])assert.equal(webAccountStorage(bad).owner,null);
});
test('switching identity only selects a different namespace and never deletes old data',()=>{
 const storage=new Map();
 for(const owner of ['wp:8','wp:11',null]){
  const key=webAccountStorage(owner).data;storage.set(key,owner||'guest');
 }
 assert.equal(storage.get(webAccountStorage('wp:8').data),'wp:8');
 assert.equal(storage.get(webAccountStorage('wp:11').data),'wp:11');
 assert.equal(storage.get(webAccountStorage(null).data),'guest');
 const app=readFileSync('app/app.mjs','utf8');
 const photo=readFileSync('app/sheet-photo-store.mjs','utf8');
 const sync=readFileSync('app/web-app-sync.mjs','utf8');
 assert.match(app,/accountOwner!==platformOwner\(\)/);
 assert.match(photo,/DB_NAME=webAccountStorage\(platformOwner\(\)\).photos/);
 assert.match(sync,/metaKey:webAccountStorage\(owner\).meta/);
 assert.match(sync,/getToken:scopedToken/);
});
