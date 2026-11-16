import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(p,'utf8');
test('Android back dismisses account without affecting offline data',()=>{
 const account=read('android-build/account-direct.mjs');
 assert.match(account,/addListener\('backButton'/);
 assert.match(account,/if\(closeAccount\(\)\)return/);
 assert.match(account,/if\(verified\)\s*\{\s*gate.hidden=true/);
 assert.match(account,/if\(!\$\('cpAccountGate'\)\?\.hidden\)return/);
});
test('account is compact and truthful',()=>{
 const prep=read('android-build/prepare-preview-apk.py');
 assert.match(prep,/cp-account-details/);
 assert.match(prep,/Mua gói \/ Nâng cấp/);
 assert.match(prep,/Cập nhật ứng dụng/);
 assert.match(prep,/id="cpCurrentPlan"/);
 assert.doesNotMatch(prep,/<h1>ChấmPro Test v14\.5<\/h1>/);
});
test('verified WordPress exchange returns login and device refresh enrollment',()=>{
 const php=read('platform/wordpress/champro-direct-login.php');
 assert.match(php,/\$license\['username'\]=\$user \? \$user->user_login/);
 assert.match(php,/\$license\['refreshDeviceRegistered'\]=\$registered/);
 assert.match(php,/function cpd_verify_device_signature/);
 assert.match(php,/delete_transient\(\$key\); \/\/ single use/);
 assert.match(php,/\/refresh-challenge/);
 assert.match(php,/\/refresh-license/);
 assert.match(php,/\$result=cpd_license\(\$uid,\$device\)/);
 assert.match(php,/\$license\['syncDeviceRegistered'\]=false/);
});
test('unchanged grading implementation and guarded sync',()=>{
 const source=read('app-preview/grader.mjs');
 assert.match(source,/export function grade\(/);
 const sync=read('android-build/app-sync.mjs');
 assert.match(sync,/if\(starting\|\|active\|\|!navigator\.onLine/);
});
