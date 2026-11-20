import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

function run(body){
 const p=spawnSync('php',['-r',"require 'tests/fixtures/champro-gift-wp.php';\n"+body],{encoding:'utf8'});
 assert.equal(p.status,0,p.error?.message||p.stderr||p.stdout);
 return JSON.parse(p.stdout);
}
const license="license_summary(cpd_license(42,$GLOBALS['device']))";
const now=()=>Math.floor(Date.now()/1000);

test('a manual annual gift issues a real signed license without a WooCommerce order',async()=>{
 const x=run(`$result=cpd_license(42,$GLOBALS['device']);echo json_encode(['license'=>license_summary($result),'key'=>cpd_public_jwk(),'meta'=>$GLOBALS['meta'],'requests'=>$GLOBALS['requests']]);`);
 assert.equal(x.license.plan,'annual');assert.ok(x.license.exp>now()+364*86400);
 assert.equal(x.license.sub,'wp:42');assert.deepEqual(x.meta,[]);
 assert.equal(x.requests.length,1);
 const [url,args]=x.requests[0];assert.equal(url,'https://worker.example.invalid/api/me');
 assert.equal(args.headers.Authorization,'Bearer fake-token-for-user-42');
 assert.equal(args.redirection,0);assert.equal(args.sslverify,true);assert.ok(args.timeout<=6);
 const key=await crypto.subtle.importKey('jwk',x.key,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 const [h,p,s]=x.license.token.split('.');
 assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,Buffer.from(s,'base64url'),Buffer.from(h+'.'+p)),true);
 assert.equal(x.license.issuer,'champro-platform');assert.equal(x.license.audience,'com.champro.nativepreview.v145');
 // Execute the unchanged Android verifier with no usable network.
 const storage=new Map([['cp-v14-install-id',x.license.device],['cp-v145-pinned-verification-key',JSON.stringify(x.key)]]);
 let networkCalls=0;
 const module=readFileSync('android-build/offline-license.mjs','utf8').replace(/^export \{[^}]+\};?\s*$/m,'');
 const verifier=runInNewContext(module+'\n({verifyLicense,inspectSignedIdentity})',{
  crypto,TextEncoder,TextDecoder,atob,console,
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  document:{readyState:'loading',addEventListener(){}},
  fetch(){networkCalls++;throw Error('Offline');}
 });
 const offline=await verifier.verifyLicense(x.license.token);
 assert.equal(offline.plan,'annual');assert.equal(offline.sub,'wp:42');assert.equal(networkCalls,0);
 await assert.rejects(verifier.verifyLicense(x.license.token,x.license.exp+1),/hết hạn/);
 const identity=await verifier.inspectSignedIdentity(x.license.token);
 assert.equal(identity.sub,'wp:42');assert.equal(networkCalls,0);
});
test('a lifetime gift upgrades the license without creating a paid order or WP grant',()=>{
 const x=run(`cloud_reply(42,'lifetime');echo json_encode(['license'=>${license},'meta'=>$GLOBALS['meta']]);`);
 assert.equal(x.license.plan,'lifetime');assert.equal(x.license.exp,4102444800);assert.deepEqual(x.meta,[]);
});
test('a gift works even after the old WordPress trial has expired',()=>{
 const x=run(`$GLOBALS['meta'][42]['cpd_trial_started']=time()-30*86400;echo json_encode(${license});`);
 assert.equal(x.plan,'annual');
});
test('existing verified lifetime purchases survive a shorter gift',()=>{
 const x=run(`$GLOBALS['meta'][42]=['cpd_verified_plan'=>'lifetime'];echo json_encode(${license});`);
 assert.equal(x.plan,'lifetime');
});
test('annual gifts never shorten an existing verified annual purchase',()=>{
 const x=run(`$future=time()+2*365*86400;$GLOBALS['meta'][42]=['cpd_verified_plan'=>'annual','cpd_verified_expires'=>$future];echo json_encode(['license'=>${license},'expected'=>$future]);`);
 assert.equal(x.license.exp,x.expected);
});
test('a verified paid entitlement is retained when Cloudflare still reports free',()=>{
 const x=run(`cloud_reply(42,'free');$GLOBALS['meta'][42]=['cpd_verified_plan'=>'annual','cpd_verified_expires'=>time()+86400];echo json_encode(${license});`);
 assert.equal(x.plan,'annual');
});
test('a longer annual gift extends the license without persisting the gift locally',()=>{
 const x=run(`$GLOBALS['meta'][42]=['cpd_verified_plan'=>'annual','cpd_verified_expires'=>time()+86400];$old=$GLOBALS['meta'];echo json_encode(['license'=>${license},'unchanged'=>$old===$GLOBALS['meta']]);`);
 assert.ok(x.license.exp>now()+364*86400);assert.equal(x.unchanged,true);
});
test('normal trials retain their original start and are not reset on refresh',()=>{
 const x=run(`cloud_reply(42,'free');$start=time()-2*86400;$GLOBALS['meta'][42]['cpd_trial_started']=$start;echo json_encode(['license'=>${license},'expected'=>$start+7*86400]);`);
 assert.equal(x.license.plan,'free');assert.equal(x.license.exp,x.expected);
});
test('known unregistered D1 accounts retain existing WordPress trial behavior',()=>{
 const x=run(`$GLOBALS['cloud_response']=['status'=>404,'body'=>json_encode(['ok'=>false,'error'=>'Chưa đồng bộ tài khoản WordPress'])];echo json_encode(${license});`);
 assert.equal(x.plan,'free');assert.ok(x.exp>now()+6*86400);
});
test('expired trials remain expired',()=>{
 const x=run(`cloud_reply(42,'free');$GLOBALS['meta'][42]['cpd_trial_started']=time()-8*86400;echo json_encode(${license});`);
 assert.equal(x.status,402);
});
test('network errors cannot overwrite an annual license with a free license',()=>{
 const x=run(`$GLOBALS['cloud_response']=new WP_Error('timeout','Timeout');echo json_encode(${license});`);
 assert.deepEqual(x,{error:true,status:503});
});
test('missing bridge configuration stops issuing an unverified license',()=>{
 const x=run(`$GLOBALS['cloud_ready']=false;echo json_encode(['license'=>${license},'requests'=>$GLOBALS['requests']]);`);
 assert.equal(x.license.status,503);assert.deepEqual(x.requests,[]);
});
test('HTTP failures, redirects, proxy 404s and malformed responses cannot mint a trial',()=>{
 for(const [status,body] of [[500,'{}'],[301,'{}'],[404,'<html>Not Found</html>'],[200,'{'],[200,JSON.stringify({ok:true})],[200,JSON.stringify({ok:'true',account:{id:'wp:42',status:'active',plan:'lifetime'}})]]){
  const encoded=Buffer.from(body).toString('base64');
  const x=run(`$GLOBALS['cloud_response']=['status'=>${status},'body'=>base64_decode('${encoded}')];echo json_encode(${license});`);
  assert.equal(x.status,503,`${status} ${body}`);
 }
});
test('the returned entitlement must belong to the authenticated account',()=>{
 const x=run(`cloud_reply(43,'lifetime');echo json_encode(${license});`);
 assert.equal(x.status,503);
});
test('suspension is enforced even when local metadata says lifetime',()=>{
 const x=run(`cloud_reply(42,'suspended',null,'suspended');$GLOBALS['meta'][42]['cpd_verified_plan']='lifetime';echo json_encode(${license});`);
 assert.equal(x.status,403);
});
test('unknown statuses and plan names cannot grant access',()=>{
 for(const [plan,status] of [['supervip','active'],['lifetime','unknown'],['annual','']]){
  const x=run(`cloud_reply(42,'${plan}',null,'${status}');echo json_encode(${license});`);
  assert.equal(x.status,503);
 }
});
test('UTC expiry does not depend on the hosting timezone and rejects impossible dates',()=>{
 const x=run(`date_default_timezone_set('Asia/Ho_Chi_Minh');echo json_encode([cpd_cloud_expiry('2030-01-02 03:04:05'),cpd_cloud_expiry('2030-01-02T03:04:05Z'),cpd_cloud_expiry('2030-02-30 00:00:00'),cpd_cloud_expiry('tomorrow'),cpd_cloud_expiry('2030-01-01 99:00:00')]);`);
 assert.equal(x[0],Date.parse('2030-01-02T03:04:05Z')/1000);assert.equal(x[1],x[0]);assert.deepEqual(x.slice(2),[false,false,false]);
});
test('an invalid or expired annual grant cannot extend access',()=>{
 for(const [expires,status] of [['2030-02-30 00:00:00',503],['2000-01-01 00:00:00',402],['',503]]){
  const x=run(`cloud_reply(42,'annual','${expires}');echo json_encode(${license});`);
  assert.equal(x.status,status);
 }
});
test('an insecure or credential-bearing URL is rejected before sending a token',()=>{
 for(const url of ['http://worker.example.invalid/api/me','https://user:password@worker.example.invalid/api/me','https://worker.example.invalid/api/me?token=x']){
  const x=run(`$GLOBALS['cloud_url']='${url}';echo json_encode(['license'=>${license},'requests'=>$GLOBALS['requests']]);`);
  assert.equal(x.license.status,503);assert.deepEqual(x.requests,[]);
 }
});
test('gift entitlements remain isolated and a removed gift is not cached as a purchase',()=>{
 const x=run(`$a=${license};cloud_reply(43,'free');$b=license_summary(cpd_license(43,$GLOBALS['device']));cloud_reply(42,'free');$c=${license};echo json_encode([$a,$b,$c,$GLOBALS['meta']]);`);
 assert.equal(x[0].plan,'annual');assert.equal(x[1].plan,'free');assert.equal(x[1].sub,'wp:43');assert.equal(x[2].plan,'free');
 assert.equal(x[3]['42'].cpd_verified_plan,undefined);assert.equal(x[3]['43'].cpd_verified_plan,undefined);
});
test('invalid devices and unknown accounts fail before the entitlement request',()=>{
 const x=run(`echo json_encode([license_summary(cpd_license(42,'bad')),license_summary(cpd_license(0,$GLOBALS['device'])),$GLOBALS['requests']]);`);
 assert.equal(x[0].status,403);assert.equal(x[1].status,403);assert.deepEqual(x[2],[]);
});
test('signed device refresh returns the gift; replay, tampering and other accounts fail',()=>{
 const x=run(`
 $device=$GLOBALS['device'];$jwk=cpd_public_jwk();cpd_register_device_key(42,$device,$jwk);
 $challenge=$GLOBALS['routes']['/champro/v2/refresh-challenge'];
 $refresh=$GLOBALS['routes']['/champro/v2/refresh-license'];
 $nonce=$challenge(new WP_REST_Request(['wpUserId'=>42,'deviceId'=>$device]))['nonce'];
 $der='';openssl_sign(cpd_signed_payload(42,$device,$nonce),$der,$GLOBALS['options'][cpd_auto_key_option()],OPENSSL_ALGO_SHA256);
 $body=['wpUserId'=>42,'deviceId'=>$device,'nonce'=>$nonce,'signature'=>cpd_b64e(cpd_der_raw($der)),'plan'=>'lifetime'];
 $ok=license_summary($refresh(new WP_REST_Request($body)));
 $replay=license_summary($refresh(new WP_REST_Request($body)));
 $other=$body;$other['wpUserId']=43;$wrong=license_summary($refresh(new WP_REST_Request($other)));
 $nonce2=$challenge(new WP_REST_Request(['wpUserId'=>42,'deviceId'=>$device]))['nonce'];$body['nonce']=$nonce2;
 $tampered=license_summary($refresh(new WP_REST_Request($body)));
 echo json_encode([$ok,$replay,$wrong,$tampered,count($GLOBALS['requests'])]);`);
 assert.equal(x[0].plan,'annual');assert.equal(x[0].username,'qa-42');assert.equal(x[1].status,401);assert.equal(x[2].status,403);assert.equal(x[3].status,403);assert.equal(x[4],1);
});
test('the existing PKCE exchange still validates one-use tickets and ignores client plans',()=>{
 const x=run(`
 $device=$GLOBALS['device'];$verifier=str_repeat('a',64);$state=str_repeat('b',32);$ticket=str_repeat('c',48);
 $GLOBALS['transients']['cpd_ticket_'.$ticket]=['user_id'=>42,'device'=>$device,'challenge'=>cpd_sha($verifier),'state'=>$state];
 $exchange=$GLOBALS['routes']['/champro/v2/exchange'];$request=new WP_REST_Request(['ticket'=>$ticket,'state'=>$state,'verifier'=>$verifier,'deviceId'=>$device,'plan'=>'lifetime']);
 echo json_encode([license_summary($exchange($request)),license_summary($exchange($request))]);`);
 assert.equal(x[0].plan,'annual');assert.equal(x[1].status,401);
});
