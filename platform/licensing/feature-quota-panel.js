/* Read-only quota details for the active tool. No grading/mixing/QR logic is modified.
   No student records, answer sheets or tokens are sent anywhere except the /api/me authorization header. */
(function(){
"use strict";
const API="https://champro-platform-staging.luckylove1404.workers.dev";
const feature=location.pathname.startsWith("/tron-de/")?"mix":location.pathname.includes("qr-excel.html")?"qr":"scan";
const targets={scan:"#page-scan .side-panel",mix:"#hs-mix-entitlement",qr:".qr-leftcol > .panel:first-child"};
const featureNames={scan:"Chấm bài",mix:"Trộn đề",qr:"Tạo QR"};
const host=document.querySelector(targets[feature]);
if(!host||document.getElementById("champroFeatureQuota"))return;
const root=document.createElement("section");root.id="champroFeatureQuota";
root.setAttribute("aria-label","Thông tin gói và lượt "+featureNames[feature]);
root.style.cssText="margin:14px 0 0;padding:13px;border:1px solid #d7e2f1;border-radius:12px;background:#f8fbff;color:#183453;font:inherit";
const title=document.createElement("strong");title.textContent="Gói và lượt "+featureNames[feature];title.style.cssText="display:block;margin-bottom:8px;font-size:15px";
const info=document.createElement("div");info.style.cssText="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 12px;font-size:13px;line-height:1.6";
const note=document.createElement("p");note.style.cssText="margin:8px 0 0;font-size:12px;color:#526781";note.setAttribute("role","status");
const action=document.createElement("button");action.type="button";action.textContent="Xem lượt "+featureNames[feature];action.style.cssText="margin-top:10px;padding:8px 12px;border:1px solid #adc6e5;border-radius:8px;background:white;color:#174b8f;cursor:pointer;font:inherit";
function field(label,value){
 const wrap=document.createElement("div"),l=document.createElement("span"),v=document.createElement("strong");
 l.textContent=label+": ";v.textContent=value;wrap.append(l,v);info.append(wrap);
}
function reset(message){
 info.replaceChildren();field("Trạng thái","Chưa đăng nhập");field("Gói","—");
 field("Đã dùng","—");field("Còn lại","—");note.textContent=message;
 action.textContent="Đăng ký / Đăng nhập";action.disabled=false;
}
const planNames={free:"Miễn phí",annual:"12 tháng",lifetime:"Trọn đời",suspended:"Tạm khóa"};
let busy=false;
async function refresh(){
 if(busy)return;const token=window.champroAuthSession?.getToken();
 if(!token){reset("Đăng nhập để xem số lượt chính xác trên tài khoản.");return;}
 busy=true;action.disabled=true;note.textContent="Đang đọc hạn mức từ tài khoản…";
 try{
  const resp=await fetch(API+"/api/me",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  const json=await resp.json().catch(()=>({}));
  if(!resp.ok||json.ok!==true){
   if(resp.status===401||resp.status===403){
    window.champroAuthSession?.clear();
    reset("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
    return;
   }
   throw Error(json.error||"Không đọc được thông tin tài khoản");
  }
  const account=json.account||{},remaining=json.left?.[feature];
  info.replaceChildren();
  field("Gói",planNames[account.plan]||account.plan||"—");
  field("Đã dùng",Number(json.used?.[feature]||0).toLocaleString("vi-VN"));
  field("Còn lại",remaining===null?"Không giới hạn":remaining===undefined?"—":Number(remaining).toLocaleString("vi-VN"));
  field("Tặng thêm",Number(json.bonus?.[feature]||0).toLocaleString("vi-VN"));
  if(account.plan==="annual"&&account.expiresAt)field("Hết hạn",String(account.expiresAt));
  note.textContent="Số liệu cùng tài khoản trên website; chỉ xem, không trừ lượt.";
  action.textContent="Cập nhật lượt "+featureNames[feature];
 }catch(err){note.textContent="Không cập nhật được: "+err.message;}
 finally{busy=false;action.disabled=false;}
}
action.addEventListener("click",()=>{
 if(window.champroAuthSession?.getToken()){refresh();return;}
 const loginId={scan:"champroQuotaLogin",mix:"mixLicenseLogin",qr:"licenseLogin"}[feature];
 document.getElementById(loginId)?.click();
});
root.append(title,info,note,action);
if(feature==="scan"){host.append(root);}else{host.append(root);}
window.addEventListener("champro-auth-updated",refresh);
window.addEventListener("champro-auth-logout",()=>reset("Đã đăng xuất. Đăng nhập để xem hạn mức."));
window.addEventListener("focus",refresh);
window.addEventListener("pageshow",refresh);
reset("Đăng nhập để xem số lượt chính xác trên tài khoản.");
refresh();
})();
