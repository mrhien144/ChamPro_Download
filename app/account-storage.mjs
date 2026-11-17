/** Account-local namespaces. The original anonymous/QA keys are never renamed
 * or deleted. A signed server sync session is still required for cloud access.
 */
export function webAccountStorage(owner){
 if(typeof owner!=='string'||!/^wp:[1-9]\d*$/.test(owner))return Object.freeze({
  owner:null,data:'champro-web-beta-v1',photos:'champro-sheet-photos-web-guest-v1',meta:null
 });
 const uid=owner.slice(3);
 if(uid==='8')return Object.freeze({owner,data:'champro-web-beta-v1-sync-qa-wp8',photos:'champro-sheet-photos-web-v1',meta:'champro-sync-web-qa-wp8-v1'});
 return Object.freeze({owner,data:'champro-web-beta-v1-account-'+uid,photos:'champro-sheet-photos-web-account-'+uid+'-v1',meta:'champro-sync-web-account-'+uid+'-v1'});
}
