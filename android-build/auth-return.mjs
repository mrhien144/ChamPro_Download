/* Parse a ChấmPro login callback without trusting any URL-provided credential.
 * Only the short-lived pair code is returned; secret stays inside app session. */
export function acceptedAuthPair(raw,expected){
 if(typeof raw!=='string'||raw.length>512)return false;
 if(typeof expected!=='string'||!/^[A-HJ-NP-Z2-9]{9}$/.test(expected))return false;
 try{
  const url=new URL(raw);
  return url.protocol==='champrotest:'&&url.hostname==='auth'&&
   url.pathname==='/complete'&&!url.username&&!url.password&&
   url.searchParams.get('pair')===expected&&
   [...url.searchParams.keys()].length===1&&!url.hash;
 }catch{return false;}
}
