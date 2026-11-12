/* ChấmPro v14 APK-only offline entitlement.
   All OMR, camera, grading and local data modules are unchanged.
   License: ES256 signed by server, bound to a random install ID.
   No network requests on boot or while grading. */
const $=id=>document.getElementById(id);
const INSTALL_KEY='cp-v14-install-id';
const LICENSE_KEY='cp-v14-signed-license';
const CLOCK_KEY='cp-v14-last-verified-time';
const ISSUER='champro-platform';
const AUDIENCE='com.champro.nativepreview.v14';
const enc=new TextEncoder();
function decode64(s){
 if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('Mã kích hoạt có ký tự không hợp lệ');
 const b=atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'='));
 return Uint8Array.from(b,c=>c.charCodeAt(0));
}
function parse(s){return JSON.parse(new TextDecoder().decode(decode64(s)));}
function getInstallId(){
 let v=localStorage.getItem(INSTALL_KEY);
 if(!v){
  v='cp-'+crypto.randomUUID();
  localStorage.setItem(INSTALL_KEY,v);
 }
 if(!/^cp-[0-9a-f-]{36}$/i.test(v))throw Error('Mã thiết bị không hợp lệ');
 return v;
}
async function verifyLicense(s,now=Math.floor(Date.now()/1000)){
 const t=String(s||'').trim().split('.');
 if(t.length!==3||s.length>8192)throw Error('Mã kích hoạt không đúng định dạng');
 const header=parse(t[0]),body=parse(t[1]);
 if(header.alg!=='ES256'||header.typ!=='JWT')throw Error('Thuật toán ký không được chấp nhận');
 const publicKey=await crypto.subtle.importKey('jwk',{
  kty:'EC',crv:'P-256',
  x:'DpOMFr1G8KrwXx9Ds5uXXGMVSQfa89i8JoIVrfoesDQ',
  y:'0tzdqqri0Zn5VjlXPrets7c5cr4vY3jZzJyLo-MNjuY',
  key_ops:['verify'],ext:true
 },{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 const valid=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,decode64(t[2]),enc.encode(t[0]+'.'+t[1]));
 if(!valid)throw Error('Chữ ký bản quyền không hợp lệ');
 if(body.iss!==ISSUER||body.aud!==AUDIENCE||typeof body.sub!=='string'||
    !/^wp:[1-9]\d*$/.test(body.sub)||body.deviceId!==getInstallId()||
    !['free','annual','lifetime'].includes(body.plan)||
    !Number.isSafeInteger(body.iat)||!Number.isSafeInteger(body.exp)||
    body.iat>now+300||body.exp<=now)
    throw Error('Giấy phép sai thiết bị, hết hạn hoặc không hợp lệ');
 const last=Number(localStorage.getItem(CLOCK_KEY)||0);
 if(now+300<last)throw Error('Đồng hồ điện thoại bị chỉnh lùi. Cần kiểm tra lại thời gian');
 localStorage.setItem(CLOCK_KEY,String(Math.max(last,now)));
 return body;
}
function showMsg(s){const el=$('cpLicenseMessage');if(el)el.textContent=s;}
function unlock(body){
 document.documentElement.classList.remove('cp-license-pending');
 const gate=$('cpLicenseGate');if(gate)gate.hidden=true;
 const detail=$('cpLicenseDetails');
 if(detail)detail.textContent='Gói '+({free:'dùng thử',annual:'1 năm',lifetime:'trọn đời'}[body.plan])+
   ' • Chấm bài offline • '+(body.plan==='lifetime'?'Không giới hạn thời gian sử dụng theo gói':'Hết hạn '+new Date(body.exp*1000).toLocaleDateString('vi-VN'));
}
function boot(){
 const gate=$('cpLicenseGate'),device=$('cpLicenseDevice');
 if(!gate)return;
 try{
  device.value=getInstallId();
  $('cpLicenseCopy').onclick=async()=>{
   try{await navigator.clipboard.writeText(device.value);showMsg('Đã sao chép mã thiết bị.');}
   catch{device.select();showMsg('Hãy sao chép mã thiết bị trong ô trên.');}
  };
  $('cpLicenseSite').onclick=()=>window.open('https://mrhien.com/champro-activate/','_blank','noopener');
  $('cpLicenseActivate').onclick=async()=>{
   const candidate=$('cpLicenseCode').value.trim();
   $('cpLicenseActivate').disabled=true;
   try{const verified=await verifyLicense(candidate);localStorage.setItem(LICENSE_KEY,candidate);unlock(verified);}
   catch(e){showMsg(e.message);}
   finally{$('cpLicenseActivate').disabled=false;}
  };
  verifyLicense(localStorage.getItem(LICENSE_KEY)||'').then(unlock,()=>{
   showMsg('Chưa kích hoạt. Đăng nhập mrhien.com để lấy giấy phép cho thiết bị này. Sau khi kích hoạt, ứng dụng chấm bài không cần mạng.');
  });
 }catch(e){showMsg(e.message);}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
export {verifyLicense};
