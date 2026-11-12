/* Strictly validate Android login callback. The deep link contains a one-use
   short-lived ticket, never an account token or PKCE verifier. */
export function parseAuthReturn(raw,expectedState){
 if(typeof raw!=='string'||raw.length>512||
   typeof expectedState!=='string'||!/^[a-f0-9]{32}$/.test(expectedState))return null;
 try{
  const u=new URL(raw);
  if(u.protocol!=='champrotest145:'||u.hostname!=='auth'||u.pathname!=='/complete'||
    u.username||u.password||u.hash)return null;
  const keys=[...u.searchParams.keys()];
  if(keys.length!==2||!keys.includes('ticket')||!keys.includes('state'))return null;
  const ticket=u.searchParams.get('ticket'),state=u.searchParams.get('state');
  if(!/^[a-f0-9]{48}$/.test(ticket||'')||state!==expectedState)return null;
  return {ticket,state};
 }catch{return null;}
}
