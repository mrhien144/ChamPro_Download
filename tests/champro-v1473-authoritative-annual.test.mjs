import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(path,'utf8');
test('cloud gift lookup is authenticated and failed lookups cannot silently issue a trial',()=>{
 const wp=read('platform/wordpress/champro-direct-login.php');
 const worker=read('platform/worker/src/index.js');
 assert.match(worker,/path==='\/api\/me'/);
 assert.match(wp,/cpd_cloud_entitlement\(\$user\)/);
 assert.match(wp,/champro_bridge_jwt\(\$user\)/);
 assert.match(wp,/if\(is_wp_error\(\$cloud\)\)return \$cloud/);
 assert.match(wp,/\$plan==='annual'/);
 assert.match(wp,/cpd_cloud_expiry\(\$account\['expiresAt'\]/);
 // Existing verified purchases stay compatible with the deployed 0.5.2 flow.
 // Executable gift/authentication/expiry cases live in champro-gift-entitlement.
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
