import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {apkAccountStorage} from '../android-build/account-namespace.mjs';
test('account, photo, mirror and sync data are all distinct',()=>{
 const scopes=[null,'wp:8','wp:11','wp:100'].map(apkAccountStorage);
 for(const key of ['data','photos','mirror','meta'])assert.equal(new Set(scopes.map(s=>s[key])).size,4);
 for(const bad of ['8','wp:0','wp:08','wp:8/evil'])assert.equal(apkAccountStorage(bad).owner,null);
 assert.equal(apkAccountStorage('wp:8').owner,'wp:8');
});
test('scope comes from signed device-bound identity, not username',()=>{
 const s=readFileSync('android-build/apk-account-storage.mjs','utf8');
 assert.match(s,/await inspectSignedIdentity\(saved\)/);
 const auth=readFileSync('android-build/account-direct.mjs','utf8');
 assert.match(auth,/if\(accountStore.owner!==claim.sub\)\{lock\(\);location.reload\(\);return;\}/);
 assert.match(auth,/localStorage.getItem\(LICENSE_KEY\)!==saved/);
 const sync=readFileSync('android-build/app-sync.mjs','utf8');
 assert.match(sync,/metaKey:accountStore.meta/);
 assert.match(sync,/app.syncOwner!==accountStore.owner/);
 assert.match(sync,/const token=async\(\)=>\{assertSession\(\);/);
});
