/* ES256 offline licenses for APK v14. Server-only private key in Worker secret LICENSE_PRIVATE_JWK.
   Never copy the private key into APK, GitHub repository or WordPress code. */
const te=new TextEncoder();
function b64(bytes){let str='';for(const b of bytes)str+=String.fromCharCode(b);return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');}
const json64=o=>b64(te.encode(JSON.stringify(o)));
function fail(error,status=400){return new Response(JSON.stringify({ok:false,error}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function toSeconds(v){return Math.floor(new Date(String(v).replace(' ','T')+'Z').getTime()/1000);}
export async function issueOfflineLicense(env,wpUserId,deviceId){
 if(!/^cp-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(deviceId||'')))
  return fail('Mã thiết bị không hợp lệ');
 if(!env.LICENSE_PRIVATE_JWK)return fail('Máy chủ chưa cấu hình khóa ký bản quyền ngoại tuyến',503);
 const account=await env.DB.prepare('SELECT * FROM accounts WHERE wp_user_id=?').bind(wpUserId).first();
 if(!account||account.status!=='active')return fail('Tài khoản chưa hoạt động hoặc đang bị khóa',403);
 const now=Math.floor(Date.now()/1000);
 let plan='free',exp=0;
 if(account.plan==='lifetime'){plan='lifetime';exp=4102444800;} // 2100 (practical lifetime)
 else if(account.plan==='annual'&&account.expires_at&&toSeconds(account.expires_at)>now){
  plan='annual';exp=toSeconds(account.expires_at);
 }else{
  // 7-day one-time trial from the account's server creation date.
  // App reinstalls or repeated requests do NOT restart the clock.
  const started=toSeconds(account.created_at);
  if(!Number.isFinite(started))return fail('Ngày tạo tài khoản chưa hợp lệ',503);
  exp=started+7*86400;
  if(exp<=now)return fail('Đã hết 7 ngày dùng thử. Hãy mua gói ChấmPro.',402);
 }
 let secret;
 try{secret=JSON.parse(env.LICENSE_PRIVATE_JWK);}
 catch{return fail('Cấu hình khóa ký bản quyền không hợp lệ',503);}
 if(secret.kty!=='EC'||secret.crv!=='P-256'||!secret.d)return fail('Khóa ký bản quyền không hợp lệ',503);
 const key=await crypto.subtle.importKey('jwk',secret,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const head=json64({alg:'ES256',typ:'JWT'});
 const payload=json64({iss:'champro-platform',aud:'com.champro.nativepreview.v14',
  sub:'wp:'+wpUserId,deviceId,plan,iat:now,exp});
 const message=head+'.'+payload;
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,te.encode(message)));
 return new Response(JSON.stringify({ok:true,license:message+'.'+b64(signature),plan,expiresAt:new Date(exp*1000).toISOString()}),{
  headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
 });
}
