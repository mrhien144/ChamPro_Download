/* ChấmPro camera grading PREVIEW authorization (isolated URL only).
 * Tokens stay in memory. No answer sheets, student PII or images sent to D1.
 * Charges 1 credit only when a previously unseen result is ready to commit.
 */
(function(){
"use strict";
const API="https://champro-platform-staging.luckylove1404.workers.dev";
const session=window.champroAuthSession;
const state={token:session?.getToken()||null,popup:null,pending:null,accountId:null,usedScan:null};
const receipt=(message)=>{const e=el("scanLicenseReceipt");if(e)e.textContent=message;};
const el=id=>document.getElementById(id);
const msg=message=>{const node=el("scanLicenseStatus");if(node)node.textContent=message;};
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
 state.accountId=x.account.id;
 state.usedScan=Number(x.used.scan);
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
 state.accountId=null;state.pending=null;state.usedScan=null;
 receipt("Đã đăng nhập; chưa ghi nhận lượt chấm mới trong phiên này.");
 session?.save(event.data.token);
 state.popup?.close();
 el("scanLicenseRefresh").disabled=false;
 el("scanLicenseLogout").disabled=false;
 try{await refresh();}catch(e){msg("Không đọc được tài khoản: "+e.message);}
});
el("scanLicenseRefresh").onclick=async()=>{try{await refresh();}catch(e){msg("Không tải được số lượt: "+e.message);}};
el("scanLicenseLogout").onclick=()=>{
 session?.clear();state.token=null;state.accountId=null;state.usedScan=null;state.pending=null;receipt("Đã đăng xuất.");el("scanLicenseRefresh").disabled=true;el("scanLicenseLogout").disabled=true;
 msg("Đã đăng xuất. Không thể lưu thêm kết quả cho đến khi đăng nhập lại.");
};
window.addEventListener("champro-auth-logout",()=>{
 state.token=null;state.accountId=null;state.pending=null;state.usedScan=null;receipt("Đã đăng xuất.");
 el("scanLicenseRefresh").disabled=true;el("scanLicenseLogout").disabled=true;
 msg("Đã đăng xuất khỏi ChấmPro.");
});
if(state.token){
 el("scanLicenseRefresh").disabled=false;
 el("scanLicenseLogout").disabled=false;
 refresh().catch(e=>msg("Không đọc được hạn mức: "+e.message));
}
window.champroScanLicense={
 loggedIn:()=>Boolean(state.token),
 async charge(fingerprint){
  if(!state.token)throw Error("Cần đăng nhập trước khi chấm và lưu.");
  if(state.pending&&state.pending.fingerprint!==fingerprint)
    throw Error("Một bài chấm trước chưa xác minh lượt do lỗi mạng. Hãy thử lại với bài cũ trước khi đổi phiếu.");
  if(!state.accountId)await refresh();
  if(!state.pending){
   // Same account + same test + same SBD always use the same request ID.
   // This is also safe if the first response was lost or the page reloaded.
   const payload=new TextEncoder().encode(state.accountId+"|"+fingerprint);
   const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",payload));
   const hash=Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
   state.pending={fingerprint,requestId:"scan:"+hash};
  }
  const before=state.usedScan;
  receipt("Đang xác minh lượt chấm với Cloudflare…");
  let r;
  try{r=await query("/api/usage/scan",{requestId:state.pending.requestId});}
  catch(e){receipt("CHƯA XÁC NHẬN lượt chấm: "+e.message);throw e;}
  // A successful HTTP response alone is insufficient: verify the D1 usage
  // counter returned by /api/me before allowing a local result to commit.
  let after;
  try{after=await refresh();}
  catch(e){
    receipt("Chưa đối soát được số lượt sau khi gửi. Thử lưu LẠI CÙNG PHIẾU để tránh trừ trùng.");
    throw Error("Không xác minh được số lượt đã ghi trên Cloudflare. Vui lòng thử lại cùng phiếu.");
  }
  if(!Number.isFinite(state.usedScan) ||
     (!r.duplicate && before!==null && state.usedScan<=before) ||
     (r.duplicate && state.usedScan<1)){
    receipt("LỖI ĐỐI SOÁT: Cloudflare chưa xác nhận số lượt mới. Chưa lưu kết quả.");
    throw Error("Số lượt trên Cloudflare chưa khớp sau khi gửi. Không lưu bài để tránh sai hạn mức.");
  }
  const label=r.duplicate?"Đã ghi nhận trước đó (không trừ trùng)":"Đã ghi nhận 1 lượt mới";
  const left=after.left.scan===null?"không giới hạn":after.left.scan;
  receipt("ĐÃ XÁC NHẬN · "+label+" · Tài khoản "+after.account.id+
          " · Đã dùng "+state.usedScan+" · Còn "+left);
  state.pending=null;
  return r;
 }
};
})();
