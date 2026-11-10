/* ChấmPro camera grading STAGING authorization.
 * Tokens stay in memory. No answer sheets, student PII or images sent to D1.
 * Charges 1 credit only when a previously unseen result is ready to commit.
 */
(function(){
"use strict";
const API="https://champro-platform-staging.luckylove1404.workers.dev";
const state={token:null,popup:null,pending:null};
const el=id=>document.getElementById(id);
const msg=message=>{el("scanLicenseStatus").textContent=message;};
async function query(path,data){
 if(!state.token)throw Error("Hãy đăng nhập mrhien.com trước khi lưu kết quả chấm.");
 const r=await fetch(API+path,{method:data?"POST":"GET",cache:"no-store",
  headers:{"Authorization":"Bearer "+state.token,...(data?{"Content-Type":"application/json"}:{})},
  ...(data?{body:JSON.stringify(data)}:{})});
 const result=await r.json().catch(()=>({}));
 if(!r.ok||!result.ok)throw Error(result.error||"Không xác minh được quyền sử dụng ("+r.status+").");
 return result;
}
async function refresh(){
 const x=await query("/api/me");
 const left=x.left.scan===null?"không giới hạn":String(x.left.scan);
 msg("Đã đăng nhập: "+(x.account.name||x.account.email)+
  " · Gói: "+x.account.plan+
  " · Chấm còn "+left+
  " · Đã dùng "+x.used.scan+
  " · Tặng thêm "+x.bonus.scan);
 return x;
}
el("scanLicenseLogin").onclick=()=>{
 state.popup=window.open("https://mrhien.com/champro-connect/","champro-scan-staging-login","popup=yes,width=620,height=760");
 msg(state.popup?"Trong cửa sổ WordPress, bấm KẾT NỐI TÀI KHOẢN.":"Trình duyệt chặn cửa sổ đăng nhập. Hãy cho phép pop-up.");
};
window.addEventListener("message",async event=>{
 if(event.origin!=="https://mrhien.com"||event.source!==state.popup||
  event.data?.type!=="champro-session"||typeof event.data?.token!=="string"||
  event.data.token.length>4096)return;
 state.token=event.data.token;
 state.popup?.close();
 el("scanLicenseRefresh").disabled=false;
 el("scanLicenseLogout").disabled=false;
 try{await refresh();}catch(e){msg("Không đọc được tài khoản: "+e.message);}
});
el("scanLicenseRefresh").onclick=async()=>{try{await refresh();}catch(e){msg("Không tải được số lượt: "+e.message);}};
el("scanLicenseLogout").onclick=()=>{
 state.token=null;el("scanLicenseRefresh").disabled=true;el("scanLicenseLogout").disabled=true;
 msg("Đã đăng xuất. Không thể lưu thêm kết quả cho đến khi đăng nhập lại.");
};
window.champroScanLicense={
 loggedIn:()=>Boolean(state.token),
 async charge(resultId){
  if(!state.token)throw Error("Cần đăng nhập trước khi chấm và lưu.");
  if(state.pending&&state.pending.resultId!==resultId)
    throw Error("Một bài chấm trước chưa xác minh lượt do lỗi mạng. Hãy thử lại với bài cũ trước khi đổi phiếu.");
  if(!state.pending)state.pending={resultId,requestId:"scan:"+resultId};
  const r=await query("/api/usage/scan",{requestId:state.pending.requestId});
  state.pending=null;
  try{await refresh();}catch(e){msg("Đã ghi nhận lượt chấm; không tải được số dư mới.");}
  return r;
 }
};
})();
