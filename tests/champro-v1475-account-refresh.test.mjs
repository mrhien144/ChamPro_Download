import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const account=readFileSync('android-build/account-direct.mjs','utf8');
const worker=readFileSync('platform/worker/src/index.js','utf8');
const sync=readFileSync('android-build/app-sync.mjs','utf8');

test('refresh keeps account dialog open until Back or explicit Close',()=>{
 assert.match(account,/function unlock\(claim,onlineConfirmed=false,\{dismissGate=false\}=\{\}\)/);
 assert.match(account,/if\(dismissGate\)\$\('cpAccountGate'\)\.hidden=true/);
 assert.match(account,/unlock\(checked,true\);lastRefreshAt=Date\.now\(\)/);
 assert.match(account,/\$\('cpAccountClose'\)\.onclick=\(\)=>\{closeAccount\(\);\}/);
 assert.match(account,/addListener\('backButton'/);
});
test('refresh of stored trial is not misrepresented as successful paid sync',()=>{
 assert.match(account,/if\(checked\.plan==='free'\)/);
 assert.match(account,/Không coi là đã đồng bộ gói/);
 assert.match(account,/Đã xác minh gói sử dụng:/);
 assert.doesNotMatch(account,/Đã xác minh tài khoản và cập nhật gói sử dụng\./);
});
test('license is still signature-verified and offline data remains untouched',()=>{
 assert.match(account,/await verifyLicense\(fresh\.license\)/);
 assert.ok(account.indexOf('await verifyLicense(fresh.license)')<account.indexOf('localStorage.setItem(LICENSE_KEY,fresh.license)'));
 assert.match(worker,/if\(b\.action==='entitlement'\)/);
 assert.match(sync,/if\(starting\|\|active\|\|!navigator\.onLine/);
});
