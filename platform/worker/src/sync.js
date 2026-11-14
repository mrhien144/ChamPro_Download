/* ChấmPro authenticated D1/R2 sync API. ISOLATED FEATURE, NOT ENABLED BY DEFAULT.
 * Designed for offline-first consumers: no grading, camera or scoring code here.
 *
 * Requires migration 0003_sync_records.sql and env.BUCKET (R2). The Worker
 * must verify a short-lived first-party session BEFORE calling this module.
 * Never accept wpUserId, account_id, owner, R2 key, or paid plan from client.
 */
const LIMIT=100,MAX_JSON=32768,MAX_PHOTO=2097152;
const kinds=new Set(['exam','student','answer','result']);
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(error,status=400)=>reply({ok:false,error},status);
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9:_-]{1,100}$/.test(id);
const validKind=kind=>kinds.has(kind);
function reader(row){
 return {kind:row.kind,id:row.record_id,revision:row.revision,
  modifiedAt:row.updated_at,deletedAt:row.deleted_at||null,
  payload:JSON.parse(row.payload_json)};
}
async function account(env,who){
 const id=who?.id;
 if(typeof id!=='string'||!/^wp:[1-9]\d*$/.test(id))return null;
 return (await env.DB.prepare("SELECT id FROM accounts WHERE id=? AND status='active'").bind(id).first())?.id||null;
}
async function readJson(req){
 const raw=await req.text();
 if(raw.length>MAX_JSON)throw Object.assign(Error('Bản ghi quá lớn'),{status:413});
 try{return JSON.parse(raw);}catch{throw Object.assign(Error('JSON không hợp lệ'),{status:400});}
}
async function records(req,env,owner){
 if(req.method==='GET'){
  const url=new URL(req.url),limit=Math.min(LIMIT,Math.max(1,Number(url.searchParams.get('limit')||LIMIT)));
  const offset=Number(url.searchParams.get('offset')||0);
  if(!Number.isInteger(offset)||offset<0||offset>500000||!Number.isFinite(limit))return fail('Phân trang không hợp lệ');
  const result=await env.DB.prepare('SELECT kind,record_id,revision,payload_json,updated_at,deleted_at FROM sync_records WHERE account_id=? ORDER BY kind,record_id LIMIT ? OFFSET ?')
   .bind(owner,limit,offset).all();
  const rows=(result.results||[]).map(reader);
  return reply({ok:true,records:rows,nextOffset:rows.length===limit?offset+rows.length:null});
 }
 if(req.method!=='POST')return fail('Phương thức không hợp lệ',405);
 const body=await readJson(req);
 const {kind,id,payload,baseRevision,deleted=false}=body||{};
 if(!validKind(kind)||!validId(id)||!Number.isSafeInteger(baseRevision)||baseRevision<0||
  !payload||typeof payload!=='object'||Array.isArray(payload)||typeof deleted!=='boolean')return fail('Bản ghi không hợp lệ');
 const data=JSON.stringify(payload);
 if(data.length>MAX_JSON-400)return fail('Bản ghi quá lớn',413);
 // Atomic CAS: a concurrent edit cannot silently replace another device's edit.
 const updated=await env.DB.prepare(
  'INSERT INTO sync_records(account_id,kind,record_id,revision,payload_json,deleted_at) '+
  'SELECT ?,?,?,?,?,? WHERE (?=0 OR EXISTS (SELECT 1 FROM sync_records WHERE account_id=? AND kind=? AND record_id=?)) '+
  'ON CONFLICT(account_id,kind,record_id) DO UPDATE SET '+
  'revision=excluded.revision,payload_json=excluded.payload_json,deleted_at=excluded.deleted_at,updated_at=CURRENT_TIMESTAMP '+
  'WHERE sync_records.revision=?'
 ).bind(owner,kind,id,baseRevision+1,data,deleted?new Date().toISOString():null,baseRevision,owner,kind,id,baseRevision).run();
 if(!updated.meta?.changes){
  const prior=await env.DB.prepare('SELECT kind,record_id,revision,payload_json,updated_at,deleted_at FROM sync_records WHERE account_id=? AND kind=? AND record_id=?').bind(owner,kind,id).first();
  return reply({ok:false,error:'Xung đột dữ liệu; không ghi đè',current:prior?reader(prior):null},409);
 }
 return reply({ok:true,kind,id,revision:baseRevision+1});
}
async function photo(req,env,owner){
 if(!env.BUCKET)return fail('Kho ảnh chưa sẵn sàng',503);
 const url=new URL(req.url),id=url.searchParams.get('resultId');
 if(!validId(id))return fail('Mã bài chấm không hợp lệ');
 const result=await env.DB.prepare("SELECT record_id FROM sync_records WHERE account_id=? AND kind='result' AND record_id=? AND deleted_at IS NULL").bind(owner,id).first();
 if(!result)return fail('Hãy đồng bộ bài chấm trước khi lưu ảnh',409);
 if(req.method==='GET'){
  const meta=await env.DB.prepare('SELECT object_key,sha256,byte_size FROM sync_photos WHERE account_id=? AND result_id=?').bind(owner,id).first();
  if(!meta)return fail('Chưa có ảnh phiếu',404);
  const obj=await env.BUCKET.get(meta.object_key);
  if(!obj)return fail('Ảnh phiếu chưa có trong kho',404);
  return new Response(obj.body,{headers:{'content-type':'image/jpeg','cache-control':'private, no-store','x-content-sha256':meta.sha256}});
 }
 if(req.method!=='POST')return fail('Phương thức không hợp lệ',405);
 if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='image/jpeg')return fail('Chỉ chấp nhận JPEG');
 const length=Number(req.headers.get('content-length')||0);
 if(length>MAX_PHOTO)return fail('Ảnh vượt quá 2 MiB',413);
 const bytes=new Uint8Array(await req.arrayBuffer());
 if(bytes.length<4||bytes.length>MAX_PHOTO||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)
  return fail('Tệp ảnh JPEG không hợp lệ',400);
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const base=req.headers.get('x-photo-base-sha256')||'';
 if(base&&!/^[a-f0-9]{64}$/.test(base))return fail('Phiên bản ảnh không hợp lệ',400);
 // Content-addressed immutable objects prevent concurrent writes replacing
 // bytes that another phone uploaded. D1 CAS decides the winning revision.
 const key='champro-sync/'+owner+'/photos/'+id+'/'+hash+'.jpg';
 const old=await env.DB.prepare('SELECT sha256 FROM sync_photos WHERE account_id=? AND result_id=?').bind(owner,id).first();
 if(old?.sha256===hash)return reply({ok:true,duplicate:true,resultId:id,sha256:hash,byteSize:bytes.length});
 if((old?.sha256||'')!==base)return reply({ok:false,error:'Xung đột ảnh phiếu',currentSha256:old?.sha256||null},409);
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
 const updated=await env.DB.prepare(
  'INSERT INTO sync_photos(account_id,result_id,object_key,sha256,byte_size) '+
  'SELECT ?,?,?,?,? WHERE (?=\'\' OR EXISTS(SELECT 1 FROM sync_photos WHERE account_id=? AND result_id=?)) '+
  'ON CONFLICT(account_id,result_id) DO UPDATE SET object_key=excluded.object_key,sha256=excluded.sha256,byte_size=excluded.byte_size,updated_at=CURRENT_TIMESTAMP '+
  'WHERE sync_photos.sha256=?'
 ).bind(owner,id,key,hash,bytes.length,base,owner,id,base).run();
 if(!updated.meta?.changes){
  const current=await env.DB.prepare('SELECT sha256 FROM sync_photos WHERE account_id=? AND result_id=?').bind(owner,id).first();
  return reply({ok:false,error:'Xung đột ảnh phiếu',currentSha256:current?.sha256||null},409);
 }
 return reply({ok:true,resultId:id,sha256:hash,byteSize:bytes.length});
}
export async function handleSync(req,env,who,path){
 if(env.CHAMPRO_SYNC_ENABLED!=='1')return fail('Đồng bộ đang được kiểm thử; chưa kích hoạt',503);
 const owner=await account(env,who);
 if(!owner)return fail('Tài khoản chưa được phép đồng bộ',403);
 if(path==='/api/sync/records')return records(req,env,owner);
 if(path==='/api/sync/photo')return photo(req,env,owner);
 return fail('Không tìm thấy API',404);
}
