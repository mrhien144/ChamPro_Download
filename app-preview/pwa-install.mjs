/**
 * ChấmPro PWA installation assistant (Preview only).
 * Never touches exams, student data, grading, photo archives or camera.
 */
const $=id=>document.getElementById(id);
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||
 (navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isAndroid=()=>/Android/i.test(navigator.userAgent);
const isStandalone=()=>window.matchMedia?.('(display-mode: standalone)').matches||
 navigator.standalone===true;
let deferredPrompt=null;
const button=$('installBtn'),dialog=$('pwaInstallDialog'),message=$('pwaInstallMessage');
const confirmButton=$('pwaInstallConfirm'),closeButton=$('pwaInstallClose');
const offlineStatus=$('pwaOfflineStatus');
const platform=$('pwaPlatform');
function setStatus(text){if(offlineStatus)offlineStatus.textContent=text;}
function showDialog(){
 if(!dialog)return;
 const standalone=isStandalone();
 if(platform)platform.textContent=isIOS()?'iPhone / iPad':isAndroid()?'Android':'Máy tính / thiết bị khác';
 if(standalone){
  message.textContent='ChấmPro đã được mở ở chế độ ứng dụng. Bạn có thể sử dụng các chức năng cục bộ sau khi tải đầy đủ dữ liệu offline.';
  confirmButton.hidden=true;
 }else if(isIOS()){
  message.textContent='Trên iPhone/iPad: mở ChấmPro bằng Safari → nhấn Chia sẻ → chọn “Thêm vào Màn hình chính” → nhấn Thêm. Nếu tùy chọn không xuất hiện, hãy mở menu của Safari và tìm “Thêm vào Màn hình chính”. iOS không cho website tự bật hộp thoại cài đặt.';
  confirmButton.hidden=true;
 }else if(deferredPrompt){
  message.textContent='Nhấn “Cài đặt ngay” để xác nhận cài ChấmPro trên thiết bị. Sau đó mở biểu tượng ChấmPro Test trên màn hình chính.';
  confirmButton.hidden=false;
 }else{
  message.textContent=isAndroid()?
   'Trong Chrome Android, mở menu ⋮ → chọn “Cài đặt ứng dụng” hoặc “Thêm vào Màn hình chính”. Nếu không thấy, hãy tải lại khi có Internet rồi thử lại.':
   'Trong trình duyệt hỗ trợ, mở menu → “Cài đặt ứng dụng” hoặc “Thêm vào Màn hình chính”.';
  confirmButton.hidden=true;
 }
 if(!dialog.open)dialog.showModal();
 void checkOfflineReady();
}
async function checkOfflineReady(){
 if(!('serviceWorker' in navigator)||!('caches' in window)){
  setStatus('Thiết bị không hỗ trợ đầy đủ lưu trữ ngoại tuyến.');return;
 }
 try{
  const registration=await navigator.serviceWorker.getRegistration('./');
  if(!registration?.active){setStatus('Đang tải bộ ứng dụng. Hãy giữ Internet và mở lại sau khi tải xong.');return;}
  const channel=new MessageChannel();
  const result=await new Promise(resolve=>{
   const timer=setTimeout(()=>resolve(null),3500);
   channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data);};
   registration.active.postMessage({type:'CHAMPRO_OFFLINE_STATUS'},[channel.port2]);
  });
  if(result?.ready){
   setStatus('Đã tải đủ '+result.cached+'/'+result.total+' thành phần ứng dụng để chạy offline. Ảnh và điểm vẫn được lưu riêng trên thiết bị.');
  }else if(result?.total){
   setStatus('Đang tải '+result.cached+'/'+result.total+' thành phần. Hãy giữ Internet, tải lại trang và kiểm tra lần nữa.');
  }else{
   setStatus('Chưa xác nhận đủ tệp offline. Hãy kiểm tra khi có Internet.');
  }
 }catch{setStatus('Chưa kiểm tra được bộ nhớ ngoại tuyến trên thiết bị này.');}
}
window.addEventListener('beforeinstallprompt',e=>{
 e.preventDefault();deferredPrompt=e;
 if(button&&!isStandalone())button.hidden=false;
});
window.addEventListener('appinstalled',()=>{
 deferredPrompt=null;
 if(button)button.textContent='Đã cài ứng dụng';
 if(confirmButton)confirmButton.hidden=true;
 if(message)message.textContent='ChấmPro đã được cài đặt. Bạn có thể mở ứng dụng từ màn hình chính.';
});
if(button){
 button.hidden=false;
 button.dataset.pwaModuleReady='1';
 button.addEventListener('click',showDialog);
}
if(closeButton)closeButton.addEventListener('click',()=>dialog.close());
$('pwaInstallDismiss')?.addEventListener('click',()=>dialog.close());
if(confirmButton)confirmButton.addEventListener('click',async()=>{
 if(!deferredPrompt)return;
 const prompt=deferredPrompt;deferredPrompt=null;
 try{await prompt.prompt();const choice=await prompt.userChoice;
  if(choice?.outcome==='accepted'){message.textContent='Đã chấp nhận yêu cầu cài đặt. Kiểm tra biểu tượng ChấmPro Test trên thiết bị.';}
  else{message.textContent='Chưa cài đặt. Bạn có thể thử lại qua menu trình duyệt.';}
 }catch{message.textContent='Không thể mở yêu cầu cài đặt. Hãy dùng menu của trình duyệt.';}
 confirmButton.hidden=true;
});
$('pwaCheckOffline')?.addEventListener('click',()=>void checkOfflineReady());
if('serviceWorker' in navigator){
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('./sw.js',{scope:'./'})
   .then(()=>void checkOfflineReady())
   .catch(()=>setStatus('Không thể tải bộ ứng dụng offline. Hãy kiểm tra HTTPS và kết nối.'));
 },{once:true});
 navigator.serviceWorker.addEventListener('controllerchange',()=>void checkOfflineReady());
}
