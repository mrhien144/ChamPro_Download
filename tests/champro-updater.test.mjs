import test from 'node:test';
import assert from 'node:assert/strict';
import {CURRENT_VERSION_CODE,PACKAGE_ID,validateUpdateManifest} from '../android-build/update-app.mjs';
const hex='a'.repeat(64);
function valid(extra={}){return {
 schema:1,packageId:PACKAGE_ID,versionCode:CURRENT_VERSION_CODE+1,
 versionName:'14.3',apkUrl:'https://champro.mrhien.com/downloads/champro/champro-v14.3.apk',
 sha256:hex,notes:'Sửa lỗi đăng nhập.',...extra
};}
test('accepts newer trusted-source package and valid digest',()=>{
 const result=validateUpdateManifest(valid());
 assert.equal(result.versionName,'14.3');
 assert.equal(result.sha256,hex);
});
test('does not offer older or equal versions',()=>{
 assert.equal(validateUpdateManifest(valid({versionCode:CURRENT_VERSION_CODE})),null);
 assert.equal(validateUpdateManifest(valid({versionCode:CURRENT_VERSION_CODE-1})),null);
});
test('rejects wrong package, wrong digest, arbitrary download host, or non-HTTPS',()=>{
 for(const changes of [
  {packageId:'evil.app'},
  {sha256:'not-a-digest'},
  {apkUrl:'http://champro.mrhien.com/downloads/champro/x.apk'},
  {apkUrl:'https://evil.example.com/downloads/champro/x.apk'},
  {apkUrl:'https://github.com/another/repo/releases/download/v1/x.apk'},
  {apkUrl:'https://champro.mrhien.com/redirect/evil.apk'},
  {apkUrl:'https://champro.mrhien.com@evil.example/downloads/champro/x.apk'}
 ])assert.throws(()=>validateUpdateManifest(valid(changes)));
});
test('accepts official GitHub release only under the owned repo',()=>{
 assert.equal(validateUpdateManifest(valid({
  apkUrl:'https://github.com/mrhien144/ChamPro_Download/releases/download/v14.3/champro.apk'
 })).versionCode,CURRENT_VERSION_CODE+1);
});
test('rejects malformed meta and oversized notes',()=>{
 assert.throws(()=>validateUpdateManifest(null));
 assert.throws(()=>validateUpdateManifest(valid({schema:2})));
 assert.throws(()=>validateUpdateManifest(valid({versionCode:0})));
 assert.throws(()=>validateUpdateManifest(valid({notes:'x'.repeat(2001)})));
});
