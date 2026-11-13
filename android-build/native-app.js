/* ChấmPro Android shell: presentation only; existing camera/OMR/storage untouched. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const pages=['home','scan','exams','students','results'];
const labels={home:'Tổng quan',scan:'Chấm bài',exams:'Đề & đáp án',students:'Học sinh',results:'Kết quả',backup:'Sao lưu'};
const icons={
home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
scan:'<path d="M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m8 0h3a1 1 0 0 0 1-1v-3"/><rect x="7" y="8" width="10" height="8" rx="1"/>',
exams:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
students:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 8a3 3 0 0 1 0 6m1 2a5 5 0 0 1 3 4"/>',
results:'<path d="M5 20V10m7 10V4m7 16v-8"/><path d="M3 21h18"/>'
};
const svg=path=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+path+'</svg>';
document.body.classList.add('cp-native-app');
const top=document.createElement('header');top.className='cp-native-topbar';
top.innerHTML='<div class="cp-native-brand"><img src="./pwa-icon.svg" alt=""><div><strong>ChấmPro</strong><small>Ứng dụng chấm bài · Bản thử nghiệm</small></div></div><div class="cp-native-top-actions"><span class="cp-native-net" id="cpNativeNet" role="status"></span><button class="cp-native-more" id="cpNativeMore" type="button" aria-label="Mở tiện ích">⋯</button></div>';
const bottom=document.createElement('nav');bottom.className='cp-native-bottom';bottom.setAttribute('aria-label','Điều hướng ứng dụng');
bottom.innerHTML=pages.map(p=>'<button type="button" class="cp-native-tab" data-native-page="'+p+'" aria-label="'+labels[p]+'"><span class="cp-native-tab-icon">'+svg(icons[p])+'</span><span>'+labels[p]+'</span></button>').join('');
const sheet=document.createElement('div');sheet.className='cp-native-sheet-backdrop';sheet.id='cpNativeSheet';sheet.hidden=true;
sheet.innerHTML='<section class="cp-native-sheet" role="dialog" aria-modal="true" aria-label="Tiện ích ChấmPro"><div class="cp-native-sheet-handle"></div><h2>Tiện ích</h2><button type="button" data-native-page="backup">◇ Sao lưu & dữ liệu</button><button type="button" data-native-page="exams">▤ Quản lý đáp án</button><button type="button" data-native-page="students">♙ Danh sách học sinh</button><button type="button" id="cpNativeClose">Đóng</button><p>Điểm và ảnh phiếu được lưu trên thiết bị này. Sao lưu trước khi gỡ ứng dụng hoặc xóa dữ liệu.</p></section>';
document.body.prepend(top);document.body.append(bottom,sheet);
const menu=$('nav');
function currentPage(){return document.querySelector('.page.shown')?.id?.replace(/^page-/,'')||'home';}
function sync(){
 const page=currentPage();
 bottom.querySelectorAll('[data-native-page]').forEach(b=>{
  if(b.dataset.nativePage===page){b.setAttribute('aria-current','page');}
  else b.removeAttribute('aria-current');
 });
}
function closeSheet(){sheet.hidden=true;document.body.classList.remove('cp-native-sheet-open');}
function go(page){
 const target=menu?.querySelector('[data-page="'+page+'"]');
 if(target){target.click();closeSheet();sync();}
}
bottom.addEventListener('click',e=>{const b=e.target.closest('[data-native-page]');if(b)go(b.dataset.nativePage);});
sheet.addEventListener('click',e=>{
 const b=e.target.closest('[data-native-page]');
 if(b){go(b.dataset.nativePage);return;}
 if(e.target===sheet||e.target.closest('#cpNativeClose'))closeSheet();
});
$('cpNativeMore').addEventListener('click',()=>{sheet.hidden=false;document.body.classList.add('cp-native-sheet-open');});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSheet();});
if(menu)new MutationObserver(sync).observe(menu,{attributes:true,subtree:true,attributeFilter:['class']});
// Display actual Android connectivity via the Capacitor native Network API.
// navigator.onLine alone can remain true inside the Android WebView after mobile data/Wi-Fi is disabled.
const net=$('cpNativeNet');
const nativeNetwork=window.Capacitor?.Plugins?.Network;
let currentNativeStatus=null;
function renderNetwork(connected){
  if(!net)return;
  net.textContent=connected?'Trực tuyến':'Ngoại tuyến';
  net.classList.toggle('offline',!connected);
  net.setAttribute('aria-label',connected?'Đang có kết nối mạng':'Không có kết nối mạng');
}
async function refreshNetwork(){
  if(nativeNetwork?.getStatus){
    try{
      const info=await nativeNetwork.getStatus();
      if(typeof info.connected==='boolean'){
        currentNativeStatus=info.connected;
        renderNetwork(info.connected);
        return;
      }
    }catch(e){/* Fallback only when native plugin is unavailable. */}
  }
  currentNativeStatus=null;
  renderNetwork(navigator.onLine);
}
if(nativeNetwork?.addListener){
  try{
    Promise.resolve(nativeNetwork.addListener('networkStatusChange',status=>{
      if(typeof status?.connected==='boolean'){
        currentNativeStatus=status.connected;
        renderNetwork(status.connected);
      }
    })).catch(()=>{});
  }catch(e){/* Preserve offline UI if listener registration fails. */}
}
window.addEventListener('online',()=>{void refreshNetwork();});
window.addEventListener('offline',()=>{void refreshNetwork();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshNetwork();});
window.addEventListener('focus',()=>{void refreshNetwork();});
void refreshNetwork();
sync();

// APK-only organization: move the existing graded-paper history card to the
// bottom of Chấm bài, after the live camera and its settings. Moving the same
// DOM element keeps the original result filter, search, edit, photo viewer,
// history and event listeners fully intact (including late QR/Excel updates).
// Kết quả retains its independent aggregate score reports and exports.
const scanPage=$('page-scan');
const historyCard=$('filterExam')?.closest('.card');
if(scanPage&&historyCard&&historyCard.closest('#page-results')){
 const heading=document.createElement('div');
 heading.className='cp-native-scan-history-heading';
 heading.innerHTML='<h2>Phiếu đã chấm · Xem lại bài</h2>'+
  '<p>Lọc môn hoặc tìm học sinh để xem phiếu, sửa bài và cập nhật điểm đã chấm.</p>';
 historyCard.classList.add('cp-native-scan-history');
 scanPage.append(heading,historyCard);
}

// APK camera presentation only: keep the existing exam picker in
// "Cài đặt quét" BELOW the camera, as in the phone reference screenshot.
// Do not relocate it or replace any existing camera/listener elements.
const card=document.querySelector('#page-scan .camera-card');
const surface=$('cameraSurface');
if(card&&surface){
 const resize=document.createElement('div');
 resize.className='cp-native-camera-resize';
 resize.innerHTML='<label for="cpNativeZoom">Khung camera</label><button id="cpNativeZoomOut" type="button" aria-label="Thu nhỏ khung">−</button><input id="cpNativeZoom" type="range" min="34" max="100" step="2" value="100" aria-label="Kích thước khung camera"><button id="cpNativeZoomIn" type="button" aria-label="Phóng to khung">+</button><output id="cpNativeZoomValue" for="cpNativeZoom">100%</output>';
 // The live view starts directly beneath the candidate banner. Sizing tools
 // stay BELOW the live view so they never shrink the camera on first opening.
 surface.after(resize);
 const slider=$('cpNativeZoom'),output=$('cpNativeZoomValue');
 let zoom=100;
 function setZoom(value){
  zoom=Math.max(34,Math.min(100,Number(value)||100));
  slider.value=String(zoom);output.textContent=zoom+'%';
  const widthAvailable=card.clientWidth>50?card.clientWidth:
   Math.min(window.innerWidth,690);
  // Use the full camera-card width by default, not a 72% shrunk area.
  // In portrait, a 3:4 viewport fills the phone width like the reference.
  // In landscape, cap height to keep touch controls reachable.
  const maxWidth=window.innerWidth>window.innerHeight?
   Math.min(widthAvailable,Math.max(240,(window.innerHeight-145)*.75)):
   widthAvailable;
  const width=Math.max(100,Math.round(maxWidth*zoom/100));
  surface.style.setProperty('--cp-native-camera-width',width+'px');
 }
 slider.addEventListener('input',()=>setZoom(slider.value));
 $('cpNativeZoomOut').addEventListener('click',()=>setZoom(zoom-10));
 $('cpNativeZoomIn').addEventListener('click',()=>setZoom(zoom+10));
 window.addEventListener('resize',()=>setZoom(zoom));
 window.addEventListener('orientationchange',()=>setZoom(zoom));
 if('ResizeObserver' in window){
  const observer=new ResizeObserver(()=>setZoom(zoom));
  observer.observe(card);
 }
 setZoom(100);
}
// No modification to video stream, getUserMedia, canvas, auto-scan timing,
// fiducial detection, answer grading, photo queue or IndexedDB.
})();
