import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('auto-provision a stable WordPress EC signing key and verify the license',async()=>{
 const php=[
  "define('ABSPATH','/test/');",
  '$GLOBALS[\'cpdtest_options\']=array();',
  'function add_action(){}',
  'function add_filter(){}',
  'function register_activation_hook(){}',
  'function add_shortcode(){}',
  'function get_option($key,$fallback=false){return $GLOBALS[\'cpdtest_options\'][$key]??$fallback;}',
  'function add_option($key,$value){if(isset($GLOBALS[\'cpdtest_options\'][$key]))return false;$GLOBALS[\'cpdtest_options\'][$key]=$value;return true;}',
  'function wp_json_encode($x){return json_encode($x);}',
  "require 'platform/wordpress/champro-direct-login.php';",
  'cpd_generate_key_if_missing();',
  '$j=cpd_public_jwk();',
  "if(!$j){fwrite(STDERR,'No auto key');exit(9);}",
  '$pem1=cpd_private_pem();',
  'cpd_generate_key_if_missing();',
  "if($pem1!==cpd_private_pem()){fwrite(STDERR,'Unstable key');exit(9);}",
  "$claims=array('iss'=>'champro-platform','aud'=>'com.champro.nativepreview.v145','sub'=>'wp:2',",
  " 'deviceId'=>'cp-12345678-1234-4234-8234-123456789abc','plan'=>'free','iat'=>1234567,'exp'=>1235567);",
  '$jwt=cpd_sign($claims);',
  "echo json_encode(array('publicKey'=>$j,'token'=>$jwt));"
 ].join('\n');
 const run=spawnSync('php',['-r',php],{encoding:'utf8'});
 assert.equal(run.status,0,run.stderr);
 const {publicKey,token}=JSON.parse(run.stdout);
 assert.equal(publicKey.kty,'EC');assert.equal(publicKey.crv,'P-256');
 const key=await crypto.subtle.importKey('jwk',publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 const parts=token.split('.');
 assert.equal(parts.length,3);
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,
  Buffer.from(parts[2],'base64url'),Buffer.from(parts[0]+'.'+parts[1])),true);
});
