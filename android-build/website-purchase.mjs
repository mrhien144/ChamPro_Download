// Website APK only. Never imported by the camera, grading, or Play bundle.
export function checkoutUrl(plan){
 if(!['annual','lifetime'].includes(plan))throw Error('Gói không hợp lệ');
 const url=new URL('https://mrhien.com/champro-mua-goi/');
 url.searchParams.set('plan',plan);
 return url.toString();
}
function boot(){
 const $=id=>document.getElementById(id);
 const status=(s)=>{const e=$('cpAuthStatus');if(e){e.textContent=s;e.dataset.level='info';}};
 async function buy(plan,button){
  if(!window.champroAccountIdentity?.wpUserId){status('Hãy đăng nhập tài khoản ChấmPro trước khi mua gói.');return;}
  if(!navigator.onLine){status('Cần Internet để mua gói. Chấm bài vẫn hoạt động offline.');return;}
  button.disabled=true;
  try{
   const url=checkoutUrl(plan), browser=window.Capacitor?.Plugins?.Browser;
   status('Hãy kiểm tra đúng tài khoản trên mrhien.com trước khi thanh toán.');
   if(browser?.open)await browser.open({url});
   else window.open(url,'_blank','noopener');
  }catch(e){status('Chưa mở được trang mua gói. Vui lòng thử lại.');}
  finally{button.disabled=false;}
 }
 for(const [id,plan] of [['cpBuyAnnual','annual'],['cpBuyLifetime','lifetime']]){
  const button=$(id);if(button)button.addEventListener('click',()=>void buy(plan,button));
 }
 // Only refresh when returning from this browser flow and account screen is open.
 const browser=window.Capacitor?.Plugins?.Browser;
 if(browser?.addListener)void Promise.resolve(browser.addListener('browserFinished',()=>{
  if(!$('cpAccountGate')?.hidden&&!$('cpViewPlans')?.hidden&&navigator.onLine)$('cpRefreshPlan')?.click();
 })).catch(()=>{});
}
if(typeof document!=='undefined'){
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
}
