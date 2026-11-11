// Private staging sync API. Never called by the camera loop.
// Authenticated WordPress account identity is provided by the parent Worker.
// Only explicit client requests cause upload; no automatic sync on import.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(message,status=400)=>json({ok:false,error:message},status);
const TYPES=new Set(['exam','student','result','settings']);
const validId=s=>typeof s==='string'&&s.length>=1&&s.length<=128&&/^[a-zA-Z0-9_.:-]+$/.test(s);
const maxJson=192*1024;
async function jsonBody(req){
 const len=Number(req.headers.get('content-length')||0);
 if(len>maxJson)return null;
 const raw=await req.text();
 if(raw.length>maxJson)return null;
 try{return JSON.parse(raw);}catch{return null;}
}
function allowed(a){return a&&a.status==='active';}
async function ensureAccount(env,who){
 const account=await env.DB.prepare('SELECT id,status FROM accounts WHERE id=?').bind(who.id).first();
 return allowed(account);
}
async function records(req,env,who,url){
 if(req.method==='GET'){
  const rawLimit=url.searchParams.get('limit')||'50',rawOffset=url.searchParams.get('offset')||'0';
  if(!/^\\d{1,3}$/.test(rawLimit)||!/^\\d{1,6}$/.test(rawOffset))return fail('Tham số phân trang không hợp lệ');
  const limit=Math.min(100,Math.max(1,Number(rawLimit)));
  const offset=Math.min(100000,Number(rawOffset));
  const rows=await env.DB.prepare('SELECT record_type,record_id,revision,payload_json,updated_at,deleted_at FROM cp_records WHERE account_id=? ORDER BY record_type,record_id LIMIT ? OFFSET ?').bind(who.id,limit,offset).all();
  return json({ok:true,records:(rows.results||[]).map(r=>({...r,payload:JSON.parse(r.payload_json),payload_json:undefined})),limit,offset});
 }
 if(req.method!=='POST')return fail('Phương thức không hỗ trợ',405);
 const b=await jsonBody(req);
 if(!b||!TYPES.has(b.type)||!validId(b.id)||!Number.isSafeInteger(b.baseRevision)||b.baseRevision<0||!b.payload||typeof b.payload!=='object'||Array.isArray(b.payload))return fail('Dữ liệu đồng bộ không hợp lệ');
 const payload=JSON.stringify(b.payload);
 if(payload.length>64000)return fail('Bản ghi vượt giới hạn 64 KB',413);
 if(b.baseRevision===0){
  const result=await env.DB.prepare('INSERT OR IGNORE INTO cp_records (account_id,record_type,record_id,revision,payload_json) VALUES (?,?,?,?,?)').bind(who.id,b.type,b.id,1,payload).run();
  if(result.meta?.changes)return json({ok:true,revision:1});
 }else{
  const result=await env.DB.prepare('UPDATE cp_records SET payload_json=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP,deleted_at=NULL WHERE account_id=? AND record_type=? AND record_id=? AND revision=?').bind(payload,who.id,b.type,b.id,b.baseRevision).run();
  if(result.meta?.changes)return json({ok:true,revision:b.baseRevision+1});
 }
 const current=await env.DB.prepare('SELECT revision FROM cp_records WHERE account_id=? AND record_type=? AND record_id=?').bind(who.id,b.type,b.id).first();
 return json({ok:false,error:'Xung đột phiên bản. Không ghi đè dữ liệu từ thiết bị khác.',currentRevision:current?.revision||0},409);
}
async function photos(req,env,who,url){
 if(!env.SHEET_PHOTOS)return fail('Chưa kết nối kho ảnh',503);
 const resultId=url.searchParams.get('resultId');
 if(!validId(resultId))return fail('Mã bài chấm không hợp lệ');
 if(req.method==='GET'){
  const row=await env.DB.prepare('SELECT r2_object_key,mime_type FROM cp_photo_objects WHERE account_id=? AND result_id=? AND deleted_at IS NULL').bind(who.id,resultId).first();
  if(!row)return fail('Không tìm thấy ảnh',404);
  const object=await env.SHEET_PHOTOS.get(row.r2_object_key);
  if(!object)return fail('Ảnh chưa sẵn sàng',404);
  return new Response(object.body,{headers:{'content-type':'image/jpeg','cache-control':'private, no-store','x-content-type-options':'nosniff','content-disposition':'attachment; filename="sheet.jpg"'}});
 }
 if(req.method!=='POST')return fail('Phương thức không hỗ trợ',405);
 const type=(req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 const length=Number(req.headers.get('content-length')||0);
 if(type!=='image/jpeg'||length>2*1024*1024)return fail('Chỉ nhận JPEG tối đa 2 MB',413);
 if(!req.body)return fail('Thiếu ảnh phiếu',400);
 const reader=req.body.getReader(),chunks=[];let total=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   total+=value.byteLength;
   if(total>2*1024*1024){await reader.cancel().catch(()=>{});return fail('Ảnh vượt giới hạn 2 MB',413);}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let at=0;
 for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
 if(bytes.length<100||bytes.length>2*1024*1024||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)return fail('Ảnh JPEG không hợp lệ',400);
 const resultRecord=await env.DB.prepare("SELECT record_id FROM cp_records WHERE account_id=? AND record_type='result' AND record_id=? AND deleted_at IS NULL").bind(who.id,resultId).first();
 if(!resultRecord)return fail('Cần đồng bộ kết quả chấm trước khi lưu ảnh',409);
 const existing=await env.DB.prepare('SELECT result_id FROM cp_photo_objects WHERE account_id=? AND result_id=?').bind(who.id,resultId).first();
 if(existing)return json({ok:false,error:'Ảnh đã tồn tại; không tự động ghi đè'},409);
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 const hash=[...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
 const objectKey='accounts/'+encodeURIComponent(who.id)+'/photos/'+crypto.randomUUID()+'.jpg';
 await env.SHEET_PHOTOS.put(objectKey,bytes,{httpMetadata:{contentType:'image/jpeg'},customMetadata:{sha256:hash}});
 try{
  const result=await env.DB.prepare('INSERT OR IGNORE INTO cp_photo_objects (account_id,result_id,r2_object_key,mime_type,size_bytes,sha256) VALUES (?,?,?,?,?,?)').bind(who.id,resultId,objectKey,'image/jpeg',bytes.length,hash).run();
  if(!result.meta?.changes){await env.SHEET_PHOTOS.delete(objectKey);return fail('Ảnh đã tồn tại',409);}
 }catch(e){await env.SHEET_PHOTOS.delete(objectKey).catch(()=>{});throw e;}
 return json({ok:true,resultId,size:bytes.length,sha256:hash},201);
}
export async function handleTeacherSync(req,env,who,path,url){
 if(!await ensureAccount(env,who))return fail('Tài khoản không tồn tại hoặc bị khóa',403);
 if(path==='/api/sync/status'&&req.method==='GET')return json({ok:true,service:'champro-sync-staging',storage:'D1+private R2',mode:'explicit-only'});
 if(path==='/api/sync/records')return records(req,env,who,url);
 if(path==='/api/sync/photo')return photos(req,env,who,url);
 return fail('API đồng bộ không tồn tại',404);
}
