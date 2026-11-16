import {handleSync} from './sync.js';
/**
 * ChấmPro dedicated sync Worker.
 * NEVER accepts payment/plan changes, never grades scans.
 * Only account-isolated D1 snapshots and R2 photos.
 */
const encode=new TextEncoder(),decode=new TextDecoder();
const reply=(o,status=200)=>new Response(JSON.stringify(o),{
 status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
function fromB64(s){
 if(!/^[A-Za-z0-9_-]+$/.test(String(s||'')))throw Error('Không hợp lệ');
 return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
}
async function auth(req,env){
 const match=/^Bearer ([A-Za-z0-9._-]{50,8192})$/.exec(req.headers.get('Authorization')||'');
 if(!match)throw Object.assign(Error('Cần xác thực tài khoản'),{status:401});
 const t=match[1].split('.');
 if(t.length!==3)throw Object.assign(Error('Phiên đồng bộ không hợp lệ'),{status:401});
 let head,claims;
 try{head=JSON.parse(decode.decode(fromB64(t[0])));claims=JSON.parse(decode.decode(fromB64(t[1])));}
 catch{throw Object.assign(Error('Phiên đồng bộ bị lỗi'),{status:401});}
 const now=Math.floor(Date.now()/1000);
 if(head.alg!=='HS256'||head.typ!=='JWT'||
   claims.iss!=='https://mrhien.com'||claims.aud!=='champro-sync'||
   claims.scope!=='sync'||!/^[1-9]\d*$/.test(String(claims.sub||''))||
   !(/^(web|cp-[0-9a-f-]{36})$/i).test(String(claims.deviceId||''))||
   !Number.isInteger(claims.iat)||claims.iat>now+60||
   !Number.isInteger(claims.exp)||claims.exp<=now||claims.exp>now+660||
   !env.CHAMPRO_SYNC_HMAC_SECRET||env.CHAMPRO_SYNC_HMAC_SECRET.length<32)
  throw Object.assign(Error('Phiên đồng bộ hết hạn hoặc sai quyền'),{status:401});
 const key=await crypto.subtle.importKey('raw',encode.encode(env.CHAMPRO_SYNC_HMAC_SECRET),
  {name:'HMAC',hash:'SHA-256'},false,['verify']);
 const good=await crypto.subtle.verify('HMAC',key,fromB64(t[2]),encode.encode(t[0]+'.'+t[1]));
 if(!good)throw Object.assign(Error('Chữ ký đồng bộ không hợp lệ'),{status:401});
 return {id:'wp:'+claims.sub,wpId:Number(claims.sub),deviceId:claims.deviceId};
}
export default {
 async fetch(req,env){
  const path=new URL(req.url).pathname,origin=req.headers.get('Origin')||'';
  const allowed=String(env.ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
  if(origin&&!allowed.includes(origin))return reply({ok:false,error:'Nguồn truy cập bị chặn'},403);
  const cors={
   'Access-Control-Allow-Origin':origin||'https://champro.mrhien.com',
   'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
   'Access-Control-Allow-Headers':'Authorization,Content-Type,X-Photo-Metadata,X-Photo-Base-Sha256',
   'Access-Control-Expose-Headers':'X-Champro-Photo-Meta,X-Photo-Metadata,X-Content-Sha256',
   'Vary':'Origin','Cache-Control':'no-store'
  };
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  let res;
  try{
   if(path==='/health'&&req.method==='GET')res=reply({ok:true,service:'champro-sync'});
   else if(env.CHAMPRO_SYNC_ENABLED!=='1')res=reply({ok:false,error:'Đồng bộ chưa kích hoạt'},503);
   else if(!env.DB||!env.BUCKET||!env.CHAMPRO_SYNC_HMAC_SECRET)
    res=reply({ok:false,error:'Thiếu cấu hình D1/R2 hoặc khóa đồng bộ'},503);
   else if(!path.startsWith('/api/sync/'))res=reply({ok:false,error:'Không tìm thấy API'},404);
   else res=await handleSync(req,env,await auth(req,env),path);
  }catch(e){res=reply({ok:false,error:e.status?e.message:'Lỗi máy chủ'},e.status||500);}
  for(const [k,v] of Object.entries(cors))res.headers.set(k,v);
  return res;
 }
};
