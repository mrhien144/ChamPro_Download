/* ChấmPro v14.2 APK-only update checker.
 * Separate from camera, OMR, grading, student data and photo storage.
 * Never downloads/installs without a user tap. Android itself validates package signature
 * and asks for installation confirmation. No developer signing key is bundled here.
 */
export const CURRENT_VERSION_CODE=14200;
export const PACKAGE_ID='com.champro.nativepreview.v142';
export const MANIFEST_URL='https://champro.mrhien.com/updates/champro-android-preview.json';
const LAST_CHECK_KEY='cp-v142-updates-last-checked';
const INTERVAL_MS=24*60*60*1000;
const $=id=>document.getElementById(id);
let nextUpdate=null;
function safeUpdateUrl(raw){
 const url=new URL(raw);
 if(url.protocol!=='https:'||url.username||url.password||url.hash)throw Error('Địa chỉ cập nhật không hợp lệ.');
 const hosted=url.origin==='https://champro.mrhien.com'&&url.pathname.startsWith('/downloads/champro/');
 const release=url.origin==='https://github.com'&&url.pathname.startsWith('/mrhien144/ChamPro_Download/releases/download/');
 if(!hosted&&!release)throw Error('Nguồn tải cập nhật chưa được ChấmPro cho phép.');
 return url.toString();
}
export function validateUpdateManifest(m){
 if(!m||typeof m!=='object'||Array.isArray(m)||m.schema!==1)throw Error('Tệp thông tin cập nhật không đúng định dạng.');
 if(m.packageId!==PACKAGE_ID)throw Error('Bản cập nhật này không dành cho ứng dụng đã cài.');
 if(!Number.isSafeInteger(m.versionCode)||m.versionCode<1)throw Error('Mã phiên bản không hợp lệ.');
 if(typeof m.versionName!=='string'||!/^[0-9][0-9a-zA-Z.+-]{0,24}$/.test(m.versionName))throw Error('Tên phiên bản không hợp lệ.');
 if(m.versionCode<=CURRENT_VERSION_CODE)return null;
 if(typeof m.sha256!=='string'||!/^[a-f0-9]{64}$/i.test(m.sha256))throw Error('Thiếu SHA-256 của bản cập nhật.');
 if(typeof m.notes!=='string'||m.notes.length>2000)throw Error('Nội dung cập nhật không hợp lệ.');
 return {versionCode:m.versionCode,versionName:m.versionName,apkUrl:safeUpdateUrl(m.apkUrl),sha256:m.sha256.toLowerCase(),notes:m.notes};
}
function status(s){const e=$('cpUpdateStatus');if(e)e.textContent=s;}
function showUpdate(info){
 nextUpdate=info;
 const d=$('cpUpdateDetails'),b=$('cpUpdateDownload');
 if(!d||!b)return;
 if(info){
  d.hidden=false;d.textContent='Phiên bản mới '+info.versionName+' — '+info.notes+
   '\nMã kiểm tra SHA-256: '+info.sha256+
   '\nAndroid sẽ yêu cầu bạn xác nhận cài đặt và chỉ cho phép cập nhật đúng chữ ký APK.';
  d.style.whiteSpace='pre-line';
  b.hidden=false;status('Có bản cập nhật ChấmPro mới: '+info.versionName);
 }else{
  d.hidden=true;b.hidden=true;status('Đã là phiên bản mới nhất trong kênh thử nghiệm này.');
 }
}
function isScanning(){return Boolean(document.querySelector('#page-scan.page.shown'));}
async function fetchManifest(){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),8000);
 try{
  const response=await fetch(MANIFEST_URL,{mode:'cors',cache:'no-store',credentials:'omit',signal:controller.signal,
   headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('Máy chủ cập nhật chưa công bố phiên bản mới ('+response.status+').');
  const length=Number(response.headers.get('content-length')||0);
  if(length>12_000)throw Error('Tệp cập nhật có kích thước bất thường.');
  const source=await response.text();
  if(source.length>12_000)throw Error('Tệp cập nhật có kích thước bất thường.');
  return validateUpdateManifest(JSON.parse(source));
 }finally{clearTimeout(timer);}
}
async function check(auto=false){
 if(isScanning())return !auto&&status('Đang chấm bài. Hãy kiểm tra cập nhật sau khi đóng camera.');
 if(!navigator.onLine)return !auto&&status('Đang offline. ChấmPro vẫn sử dụng bình thường; kiểm tra cập nhật khi có Internet.');
 const btn=$('cpUpdateCheck');
 if(btn)btn.disabled=true;
 if(!auto)status('Đang kiểm tra phiên bản cập nhật…');
 try{
  const info=await fetchManifest();
  showUpdate(info);
  localStorage.setItem(LAST_CHECK_KEY,String(Date.now()));
  if(auto&&info){
   // Keep the notification off the camera, and only surface it when the user opens account menu.
   const card=$('cpUpdaterPanel');if(card)card.dataset.updateAvailable='true';
  }
 }catch(err){
  if(!auto)status(err.name==='AbortError'?
   'Không kết nối được máy chủ cập nhật. Ứng dụng vẫn chấm offline bình thường.':
   'Chưa thể kiểm tra cập nhật: '+(err.message||'lỗi kết nối')+
   '. Hệ thống cập nhật cần được triển khai trên website trước khi phát hành chính thức.');
 }finally{if(btn)btn.disabled=false;}
}
async function openDownload(){
 const info=nextUpdate;
 if(!info)return;
 if(isScanning())return status('Vui lòng đóng camera trước khi tải bản cập nhật.');
 if(!navigator.onLine)return status('Cần Internet để tải APK. Bạn vẫn chấm offline bình thường.');
 // Avoid unannounced install: Android installation is explicitly confirmed by the user.
 // Production must use the SAME package ID and an unchanging app signing certificate.
 if(!confirm('Mở liên kết APK ChấmPro '+info.versionName+'?\nAndroid sẽ yêu cầu bạn xác nhận cài đặt. Không xóa ứng dụng cũ hoặc dữ liệu.'))return;
 try{
  const browser=window.Capacitor?.Plugins?.Browser;
  if(browser?.open)await browser.open({url:info.apkUrl});
  else window.open(info.apkUrl,'_blank','noopener');
  status('Đã mở nguồn tải APK chính thức. Sau khi tải, hãy chọn cài đặt bản cập nhật trên Android.');
 }catch(e){status('Không mở được liên kết tải: '+(e.message||'lỗi trình duyệt'));}
}
function addMenu(){
 if($('cpNativeCheckUpdates'))return;
 const close=$('cpNativeClose');
 if(!close)return;
 const b=document.createElement('button');
 b.id='cpNativeCheckUpdates';b.type='button';b.textContent='↻ Kiểm tra cập nhật ChấmPro';
 b.addEventListener('click',()=>{
  close.click();
  const gate=$('cpAccountGate');
  if(gate){gate.hidden=false;$('cpUpdaterPanel')?.scrollIntoView({block:'nearest'});}
  void check();
 });
 close.before(b);
}
function boot(){
 const checkBtn=$('cpUpdateCheck'),download=$('cpUpdateDownload');
 if(!checkBtn||!download)return;
 checkBtn.addEventListener('click',()=>void check(false));
 download.addEventListener('click',()=>void openDownload());
 setTimeout(addMenu,300);
 // A low-priority, at-most-daily check. Never run while scanning.
 setTimeout(()=>{
  const last=Number(localStorage.getItem(LAST_CHECK_KEY)||0);
  if(!document.hidden&&!isScanning()&&navigator.onLine&&Date.now()-last>=INTERVAL_MS)void check(true);
 },15000);
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
 else boot();
}
