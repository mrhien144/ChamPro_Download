/**
 * ChấmPro staged WordPress sign-in and read-only cloud connection probe.
 *
 * Intentionally independent of camera / grader / IndexedDB.
 * Token exists only in JS memory and expires with the WordPress session JWT.
 * This module never reads or uploads real scans, students, answers or grades.
 * An additional user-confirmed smoke test creates only synthetic records and JPEGs.
 */
const WP_ORIGIN='https://mrhien.com';
const WORKER='https://champro-platform-staging.luckylove1404.workers.dev';
let popup=null,token=null,account=null;
const byId=id=>document.getElementById(id);
const status=text=>{const el=byId('cpAccountStatus');if(el)el.textContent=text;};
function safeClose(){
 try{if(popup&&!popup.closed)popup.close();}catch{}
 popup=null;
}
async function smokeRequest(path,method,activeToken,body,contentType){
 const response=await fetch(WORKER+path,{
  method,mode:'cors',credentials:'omit',cache:'no-store',
  headers:{Authorization:'Bearer '+activeToken,'Content-Type':contentType},
  body
 });
 const payload=await response.json().catch(()=>null);
 if(!response.ok||!payload?.ok)throw Error(payload?.error||'Yêu cầu thử nghiệm không thành công ('+response.status+')');
 return payload;
}
function demoPhoto(){
 return new Promise((resolve,reject)=>{
  const canvas=document.createElement('canvas');
  canvas.width=480;canvas.height=320;
  const context=canvas.getContext('2d');
  if(!context){reject(Error('Trình duyệt không hỗ trợ Canvas'));return;}
  context.fillStyle='#ffffff';context.fillRect(0,0,480,320);
  context.fillStyle='#1f2937';context.font='bold 26px sans-serif';
  context.fillText('CHAMPRO - TEST ONLY',20,70);
  context.font='18px sans-serif';context.fillText('Synthetic image - no student data',20,115);
  canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Không tạo được ảnh thử nghiệm')),'image/jpeg',0.72);
 });
}
async function runCloudSmoke(activeToken){
 const id='smoke-'+crypto.randomUUID();
 const payload={id,testOnly:true,kind:'champro-staging-smoke',score:0,
  createdAt:new Date().toISOString(),studentName:'SYNTHETIC TEST ONLY'};
 const saved=await smokeRequest('/api/sync/records','POST',activeToken,
  JSON.stringify({type:'result',id,baseRevision:0,payload}),'application/json');
 if(saved.revision!==1)throw Error('D1 không trả về phiên bản bản ghi mới');
 const page=await query('/api/sync/records?limit=100&offset=0',activeToken);
 // The API uses bounded pages; D1 may contain records from earlier tests.
 let found=page.records.some(x=>x.record_id===id&&x.payload?.testOnly===true);
 for(let offset=100;!found&&page.records.length>=100&&offset<=10000;offset+=100){
  const next=await query('/api/sync/records?limit=100&offset='+offset,activeToken);
  found=next.records.some(x=>x.record_id===id&&x.payload?.testOnly===true);
  if(next.records.length<100)break;
 }
 if(!found)throw Error('D1 đã ghi nhưng chưa đọc lại được bản ghi thử nghiệm');
 const blob=await demoPhoto();
 if(blob.size>2*1024*1024)throw Error('Ảnh thử nghiệm vượt giới hạn');
 const uploaded=await smokeRequest('/api/sync/photo?resultId='+encodeURIComponent(id),
  'POST',activeToken,blob,'image/jpeg');
 const response=await fetch(WORKER+'/api/sync/photo?resultId='+encodeURIComponent(id),{
  method:'GET',mode:'cors',credentials:'omit',cache:'no-store',
  headers:{Authorization:'Bearer '+activeToken}
 });
 if(!response.ok)throw Error('R2 không trả ảnh đã lưu ('+response.status+')');
 const returned=new Uint8Array(await response.arrayBuffer());
 const source=new Uint8Array(await blob.arrayBuffer());
 if(returned.length!==source.length||returned.some((v,i)=>v!==source[i]))
  throw Error('Ảnh tải về không khớp ảnh đã gửi');
 if(uploaded.sha256){
  const digest=await crypto.subtle.digest('SHA-256',returned);
  const hex=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hex!==uploaded.sha256)throw Error('R2 trả về ảnh không đúng mã kiểm tra SHA-256');
 }
 return id;
}
async function query(path,activeToken){
 const response=await fetch(WORKER+path,{
  method:'GET',
  mode:'cors',
  credentials:'omit',
  cache:'no-store',
  headers:{Authorization:'Bearer '+activeToken,'Accept':'application/json'}
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.ok)throw Error(result?.error||'Máy chủ ChấmPro chưa xác nhận tài khoản');
 return result;
}
export function initAccountBridge(){
 const connect=byId('cpConnectAccount'),disconnect=byId('cpDisconnectAccount'),
  statusButton=byId('cpCheckCloud'),smokeButton=byId('cpSmokeCloud');
 if(!connect||!disconnect||!statusButton||!smokeButton)return;
 const setConnected=connected=>{
  disconnect.hidden=!connected;statusButton.hidden=!connected;smokeButton.hidden=!connected;
  connect.hidden=connected;
 };
 setConnected(false);
 connect.addEventListener('click',()=>{
  safeClose();token=null;account=null;setConnected(false);
  // Call window.open directly in this user gesture to support mobile browsers.
  popup=window.open(WP_ORIGIN+'/champro-connect/','champro-wordpress-login',
   'popup=yes,width=620,height=710');
  if(!popup){status('Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép mở cửa sổ từ ChấmPro.');return;}
  status('Trong cửa sổ WordPress vừa mở, bấm “Kết nối ChấmPro”.');
 });
 window.addEventListener('message',async event=>{
  // A token can only be accepted from the exact popup this app opened.
  if(!popup||event.source!==popup||event.origin!==WP_ORIGIN||
   event.data?.type!=='champro-session'||typeof event.data?.token!=='string')return;
  const candidate=event.data.token;
  // Do not persist, log, print, expose in URL, or broadcast this credential.
  if(candidate.length>4096||candidate.split('.').length!==3){
   status('Phiên đăng nhập không hợp lệ.');safeClose();return;
  }
  status('Đang xác minh tài khoản với ChấmPro staging…');
  try{
   const result=await query('/api/me',candidate);
   token=candidate;account=result.account;
   status('Đã kết nối tài khoản: '+(account?.name||'WordPress')+'. Không có dữ liệu học sinh nào được tải lên.');
   setConnected(true);
  }catch(error){
   token=null;account=null;setConnected(false);
   status('Chưa kết nối được: '+error.message);
  }finally{safeClose();}
 });
 disconnect.addEventListener('click',()=>{
  token=null;account=null;safeClose();setConnected(false);
  status('Đã ngắt kết nối trong phiên làm việc này. Dữ liệu trên thiết bị được giữ nguyên.');
 });
 smokeButton.addEventListener('click',async()=>{
  if(!token)return;
  if(!confirm('Ghi 1 bản ghi và 1 ảnh GIẢ LẬP vào D1/R2 staging để kiểm thử? Không lấy dữ liệu học sinh hoặc ảnh phiếu thật. Bản ghi thử sẽ còn trên staging cho đến khi dọn thủ công.'))return;
  const currentToken=token;
  smokeButton.disabled=true;statusButton.disabled=true;
  status('Đang ghi và đọc lại 1 bản ghi + 1 ảnh giả lập trên D1/R2…');
  try{
   const testId=await runCloudSmoke(currentToken);
   status('ĐÃ KIỂM TRA THÀNH CÔNG: ghi/đọc D1 và R2, ảnh đúng nội dung. Mã thử: '+testId+
    '. Dữ liệu học sinh thực tế vẫn chỉ lưu trên thiết bị.');
  }catch(error){
   status('Chưa hoàn tất kiểm thử D1/R2: '+error.message+
    '. Có thể đã lưu một phần dữ liệu thử trên staging. Không dùng dữ liệu học sinh thật.');
  }finally{smokeButton.disabled=false;statusButton.disabled=false;}
 });
 statusButton.addEventListener('click',async()=>{
  if(!token)return;
  status('Đang kiểm tra D1/R2…');
  try{
   const result=await query('/api/sync/status',token);
   status('Kết nối API thành công. Chế độ đồng bộ: '+result.mode+
    '. Chưa tải dữ liệu hoặc ảnh phiếu lên máy chủ.');
  }catch(error){
   token=null;account=null;setConnected(false);
   status('Không thể kiểm tra kết nối: '+error.message+'. Hãy đăng nhập lại.');
  }
 });
}
initAccountBridge();
