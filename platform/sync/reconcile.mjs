/**
 * ChấmPro cloud sync - pure, side-effect-free reconciliation.
 *
 * NO network, camera, localStorage, deletion, or overwrite here.
 * All records MUST be scoped by a server-authenticated WordPress account.
 *
 * A record is {id, kind, revision, payload, modifiedAt, deletedAt?}.
 * Revision is allocated by server, never by local client.
 * Local dirtiness is tracked separately so a remote fetch cannot silently
 * overwrite unsent changes. Conflicts require explicit user resolution.
 */
export const KINDS=Object.freeze(['exam','student','result']);
const kinds=new Set(KINDS);
export function validRecord(r){
 return Boolean(r && typeof r==='object' &&
  typeof r.id==='string' && /^[a-zA-Z0-9:_-]{1,100}$/.test(r.id) &&
  kinds.has(r.kind) && Number.isSafeInteger(r.revision) && r.revision>=0 &&
  r.payload && typeof r.payload==='object' && !Array.isArray(r.payload));
}
export function resolveRecord({local,remote,dirty=false}={}){
 if(!remote) return {action:'retain-local',record:local??null};
 if(!validRecord(remote)) throw Error('Bản ghi máy chủ không hợp lệ');
 if(!local) return dirty?{action:'conflict',local:null,remote}:{action:'download',record:remote};
 if(!validRecord(local)||local.id!==remote.id||local.kind!==remote.kind)
   throw Error('Không khớp định danh bản ghi');
 // The client might have a queued correction, independent of version.
 if(dirty){
  if(local.revision!==remote.revision)
   return {action:'conflict',local,remote};
  return {action:'retain-local',record:local};
 }
 if(remote.revision>local.revision)
  return {action:'download',record:remote};
 if(remote.revision===local.revision)
  return {action:'unchanged',record:local};
 // Never upload a stale local record without an explicit new edit.
 return {action:'retain-local',record:local};
}
export function planUpload({record,baseRevision}){
 if(!validRecord(record)||!Number.isSafeInteger(baseRevision)||baseRevision<0)
  throw Error('Dữ liệu đồng bộ không hợp lệ');
 if(record.revision!==baseRevision)
  throw Error('Bản ghi đã thay đổi: cần tải dữ liệu và giải quyết xung đột');
 return {kind:record.kind,id:record.id,baseRevision,payload:record.payload,deleted:record.deleted===true};
}
export function syncDecision(status){
 if(status===401||status===403)return 'reauth-required';
 if(status===409)return 'conflict';
 if(status===413)return 'too-large';
 if(status===429||status===408||status>=500)return 'retry-later';
 if(status>=400)return 'stop-and-report';
 return 'ok';
}
