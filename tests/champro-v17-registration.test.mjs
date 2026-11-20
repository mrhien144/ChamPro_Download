import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const js=readFileSync('android-build/account-direct.mjs','utf8');
const ui=readFileSync('android-build/prepare-preview-apk.py','utf8');
const php=readFileSync('platform/wordpress/champro-registration-companion.php','utf8');
test('separate login, signup and password recovery controls',()=>{
 for(const id of ['cpSignIn','cpRegister','cpForgot','cpRegForm','cpRegEmail','cpRegCode','cpRegPassword','cpRegConfirm'])assert.ok(ui.includes('id="'+id+'"'));
 assert.match(js,/if\(password!==\$\('cpRegConfirm'\)\.value\)/);
 assert.match(js,/await exchange\(result\.ticket,state\)/);
 assert.match(js,/wp-login\.php\?action=lostpassword/);
});
test('registration uses a verified email and original PKCE license flow',()=>{
 assert.match(php,/hash_equals/);
 assert.match(php,/random_int\(0,99999999\)/);
 assert.match(php,/wp_insert_user/);
 assert.match(php,/'role'=>'subscriber'/);
 assert.match(php,/champro_bridge_account\(\$user\)/);
 assert.ok(php.indexOf('$sync=$user?')<php.indexOf('$ticket=bin2hex'));
 assert.match(php,/cpd_ticket_/);
 assert.doesNotMatch(php,/UPDATE accounts|DELETE FROM|CHAMPRO_LICENSE_PRIVATE_JWK/);
});
test('only ChấmPro-specific authenticated browser login provisions legacy accounts',()=>{
 assert.match(php,/admin_post_cpd_authorize/);
 assert.match(php,/wp_verify_nonce/);
 assert.doesNotMatch(php,/add_action\('user_register'/);
});
