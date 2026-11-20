import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
function run(body){
 const src="require 'tests/fixtures/champro-gift-wp.php'; function current_user_can($cap){return $cap==='manage_options'&&!empty($GLOBALS['is_admin']);} require 'platform/wordpress/qa/gift-preflight.php';\n"+body;
 const p=spawnSync('php',['-r',src],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr||p.stdout);return JSON.parse(p.stdout);
}
test('preflight refuses non-admins before sending any account request',()=>{
 const x=run("$x=cpd_gift_preflight_result(42);echo json_encode([$x->data['status'],$GLOBALS['requests']]);");
 assert.deepEqual(x,[403,[]]);
});
test('preflight reads the entitlement and verifies a test signature without writes or token output',()=>{
 const x=run("$GLOBALS['is_admin']=true;$before=[$GLOBALS['meta'],$GLOBALS['options'],$GLOBALS['transients']];$x=cpd_gift_preflight_result(42);echo json_encode(['result'=>$x,'unchanged'=>$before===[$GLOBALS['meta'],$GLOBALS['options'],$GLOBALS['transients']],'requests'=>count($GLOBALS['requests'])]);");
 assert.equal(x.result.account_id,'wp:42');assert.equal(x.result.plan,'annual');assert.equal(x.result.signature_valid,true);
 assert.match(x.result.public_key_sha256,/^[a-f0-9]{64}$/);assert.equal(x.unchanged,true);assert.equal(x.requests,1);
 assert.deepEqual(Object.keys(x.result).sort(),['account_id','expires_at','plan','public_key_sha256','signature_valid']);
});
test('preflight validates the account and retains fail-closed account isolation',()=>{
 const x=run("$GLOBALS['is_admin']=true;$bad=cpd_gift_preflight_result(0);cloud_reply(43,'lifetime');$other=cpd_gift_preflight_result(42);echo json_encode([$bad->data['status'],$other->data['status']]);");
 assert.deepEqual(x,[400,503]);
});
