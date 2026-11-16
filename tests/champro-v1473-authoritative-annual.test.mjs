import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
test('D1 is authoritative: annual license cannot silently fall back to trial',()=>{
 const wp=read('platform/wordpress/champro-direct-login.php');
 const worker=read('platform/worker/src/index.js');
 assert.match(worker,/if\(b\.action==='entitlement'\)/);
 assert.match(worker,/FROM accounts WHERE wp_user_id=\?/);
 assert.match(worker,/account\.expires_at/);
 assert.match(wp,/cpd_authoritative_entitlement\(\$user_id\)/);
 assert.match(wp,/champro_bridge_request\(array\('action'=>'entitlement'/);
 assert.match(wp,/if\(is_wp_error\(\$entitlement\)\)return \$entitlement/);
 assert.match(wp,/\$plan==='annual'/);
 assert.match(wp,/\$exp=cpd_utc_timestamp\(\$entitlement\['expiresAt'\]/);
 assert.doesNotMatch(wp,/get_user_meta\(\$user_id,'cpd_verified_plan'/);
});
test('verified app header shows real user login, not static UI or cached session after logout',()=>{
 const native=read('android-build/native-app.js');
 const account=read('android-build/account-direct.mjs');
 assert.match(native,/id='cpNativeAccountName'/);
 assert.match(native,/champro-account-verified/);
 assert.match(native,/champro-account-logout/);
 assert.match(native,/window\.champroAccountIdentity/);
 assert.match(account,/if\(fresh\.username\)localStorage\.setItem\('cp-v14-account-name'/);
 assert.match(account,/addListener\('backButton'/);
});
