/* ChấmPro same-tab authentication bridge.
 * Only a short-lived WordPress bearer token is kept in sessionStorage.
 * Neither localStorage nor URLs store tokens; Cloudflare validates all permissions.
 */
(function(){
"use strict";
if(window.champroAuthSession)return;
const KEY="champro.auth.session.v1";
let memory=null;
const channel=typeof BroadcastChannel==="function"?new BroadcastChannel("champro.auth.logout.v1"):null;
function expires(token){
 if(typeof token!=="string"||token.length>4096||token.length<20)return 0;
 try{
  const parts=token.split(".");
  if(parts.length!==3)return 0;
  const s=parts[1].replace(/-/g,"+").replace(/_/g,"/");
  const claim=JSON.parse(atob(s.padEnd(Math.ceil(s.length/4)*4,"=")));
  if(claim.iss!=="https://mrhien.com"||claim.aud!=="champro-platform")return 0;
  const exp=Number(claim.exp);
  return Number.isSafeInteger(exp)&&exp>Math.floor(Date.now()/1000)+5?exp:0;
 }catch{return 0;}
}
function clearLocal(){
 memory=null;
 try{sessionStorage.removeItem(KEY);}catch{}
}
function getToken(){
 if(memory&&expires(memory))return memory;
 memory=null;
 try{
  const saved=sessionStorage.getItem(KEY);
  if(saved&&expires(saved)){memory=saved;return saved;}
  if(saved)sessionStorage.removeItem(KEY);
 }catch{}
 return null;
}
function save(token){
 if(!expires(token))return false;
 memory=token;
 try{sessionStorage.setItem(KEY,token);}catch{}
 return true;
}
function clear(){
 clearLocal();
 window.dispatchEvent(new Event("champro-auth-logout"));
 try{channel?.postMessage({type:"logout"});}catch{}
}
if(channel)channel.onmessage=event=>{
 if(event.data?.type!=="logout")return;
 clearLocal();
 window.dispatchEvent(new Event("champro-auth-logout"));
};
window.champroAuthSession=Object.freeze({getToken,save,clear});
})();
