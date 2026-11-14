/* ChấmPro home page: shared first-party WordPress login, read-only.
 * Uses the existing short-lived sessionStorage bearer token for same-tab navigation.
 * Never writes credentials to URL, localStorage, cookies or cross-tab broadcasts.
 */
(function(){
"use strict";
const button=document.getElementById("champroHomeLogin");
if(!button)return;
const session=window.champroAuthSession;
const API="https://champro-platform-staging.luckylove1404.workers.dev";
let popup=null,seq=0;
const generic="Đăng ký và đăng nhập";
function label(account){
 button.textContent=account?.name||account?.email||generic;
 button.classList.toggle("hs-auth-connected",Boolean(account));
 button.title=account?"Đã đăng nhập · Bấm để cập nhật tài khoản":"Đăng ký hoặc đăng nhập bằng tài khoản mrhien.com";
 button.setAttribute("aria-label",account?"Tài khoản "+(account.name||account.email||"đã đăng nhập"):generic);
}
async function refresh(){
 const sequence=++seq,token=session?.getToken();
 if(!token){label(null);return;}
 try{
  const response=await fetch(API+"/api/me",{headers:{"Authorization":"Bearer "+token},cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(sequence!==seq||session?.getToken()!==token)return;
  if(response.status===401||response.status===403){session?.clear();label(null);return;}
  if(response.ok&&data.ok&&data.account){label(data.account);return;}
  // Transient errors must not invalidate the current account session.
  button.title="Chưa cập nhật được tên tài khoản, bấm để thử lại";
 }catch{
  if(sequence===seq)button.title="Không thể cập nhật tài khoản. Kiểm tra kết nối mạng và thử lại";
 }
}
button.addEventListener("click",()=>{
 if(session?.getToken()){refresh();return;}
 popup=window.open("https://mrhien.com/champro-connect/","champro-home-login","popup=yes,width=620,height=760");
 if(!popup)button.title="Trình duyệt chặn cửa sổ đăng nhập. Vui lòng cho phép pop-up.";
});
window.addEventListener("message",event=>{
 if(event.origin!=="https://mrhien.com"||!popup||event.source!==popup||event.data?.type!=="champro-session"||typeof event.data.token!=="string"||event.data.token.length>4096)return;
 if(!session?.save(event.data.token))return;
 popup.close();popup=null;
 window.dispatchEvent(new Event("champro-auth-updated"));
 refresh();
});
window.addEventListener("champro-auth-updated",refresh);
window.addEventListener("champro-auth-logout",()=>{seq++;label(null);});
window.addEventListener("pageshow",refresh);
window.addEventListener("focus",refresh);
label(null);refresh();
})();
