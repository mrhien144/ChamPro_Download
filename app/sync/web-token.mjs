/** Converts the existing short-lived WordPress platform session to a
 * dedicated 10-minute sync-only bearer. Neither token is persisted here.
 * Requires the separate WordPress Sync Device Auth plugin to be enabled.
 */
const ENDPOINT='https://mrhien.com/wp-json/champro/sync/v1/web-token';
let cached=null,pending=null;
function expires(s){
 try{
  const part=s.split('.')[1];
  const decoded=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'=')));
  return decoded.aud==='champro-sync'&&decoded.scope==='sync'?Number(decoded.exp)||0:0;
 }catch{return 0;}
}
export function platformOwner(){
 const token=window.champroAuthSession?.getToken?.();
 if(!token)return null;
 try{
  const part=token.split('.')[1];
  const decoded=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'=')));
  const uid=decoded.sub;
  if(decoded.iss!=='https://mrhien.com'||decoded.aud!=='champro-platform'||!/^[1-9]\d*$/.test(String(uid)))return null;
  return 'wp:'+uid;
 }catch{return null;}
}
export function clearWebSyncToken(){cached=null;pending=null;}
export async function getWebSyncToken(){
 const p=window.champroAuthSession?.getToken?.();
 if(!p)throw Error('Cần đăng nhập để đồng bộ');
 if(cached?.forToken===p&&cached.expires>Date.now()/1000+35)return cached.token;
 if(pending)return pending;
 pending=(async()=>{
  const response=await fetch(ENDPOINT,{
   method:'POST',mode:'cors',credentials:'omit',cache:'no-store',
   headers:{'Content-Type':'application/json'},body:JSON.stringify({platformToken:p})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok||typeof data.token!=='string')
   throw Object.assign(Error(data.message||'Không được cấp phiên đồng bộ'),{status:response.status});
  const until=expires(data.token);
  if(until<=Date.now()/1000)throw Error('Phiên đồng bộ sai thời hạn');
  cached={forToken:p,token:data.token,expires:until};
  return data.token;
 })();
 try{return await pending;}finally{pending=null;}
}
