import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('WordPress ES256 license verifies using Android-compatible P-256',async()=>{
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const jwk=await crypto.subtle.exportKey('jwk',keys.privateKey);
 const php=[
  "define('ABSPATH','/test/');",
  "define('CHAMPRO_LICENSE_PRIVATE_JWK',getenv('TEST_JWK'));",
  'function wp_json_encode($x){return json_encode($x);}',
  'function register_activation_hook(){}',
  'function add_shortcode(){}',
  'function add_action(){}',
  'function add_filter(){}',
  "require 'platform/wordpress/champro-direct-login.php';",
  "$claims=array('iss'=>'champro-platform','aud'=>'com.champro.nativepreview.v145',",
  " 'sub'=>'wp:2','deviceId'=>'cp-12345678-1234-4234-8234-123456789abc',",
  " 'plan'=>'free','iat'=>1234567,'exp'=>1235567);",
  'echo cpd_sign($claims);'
 ].join('\n');
 const result=spawnSync('php',['-r',php],{encoding:'utf8',env:{...process.env,TEST_JWK:JSON.stringify(jwk)}});
 assert.equal(result.status,0,result.stderr);
 const token=result.stdout.trim().split('.');
 assert.equal(token.length,3,result.stdout);
 const claims=JSON.parse(Buffer.from(token[1],'base64url').toString());
 assert.equal(claims.aud,'com.champro.nativepreview.v145');
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},
  keys.publicKey,Buffer.from(token[2],'base64url'),Buffer.from(token[0]+'.'+token[1])),true);
});
