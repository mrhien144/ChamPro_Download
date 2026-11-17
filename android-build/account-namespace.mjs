// Pure namespace selection: no migration, no deletion, no network access.
export function apkAccountStorage(owner){
 const account=typeof owner==='string'&&/^wp:[1-9]\d*$/.test(owner)?owner:null;
 const suffix=account?'account-'+account.slice(3):'locked';
 return Object.freeze({owner:account,data:'champro-app-v15-'+suffix,photos:'champro-sheet-photos-v15-'+suffix,mirror:'champro-local-mirror-v15-'+suffix,meta:'champro-sync-apk-v15-'+suffix});
}
