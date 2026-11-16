/**
 * ChấmPro legacy-state adapter (web/app). Encapsulates historical localStorage
 * {schema:1, exams:[], students:[], results:[]} without changing the grader.
 * Sync is opt-in, owner-bound, and all write/diff work is asynchronous.
 */
import {validRecord} from './reconcile.mjs';
const FIELDS={exam:'exams',student:'students',result:'results'};
const VERSION=1;
const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9:_-]{1,100}$/.test(x);
const ownerId=x=>/^wp:[1-9]\d*$/.test(String(x||''));
function json(value){return JSON.stringify(value);}
async function hash(value){
 const bytes=new TextEncoder().encode(json(value));
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 return Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
}
export class LegacySyncAdapter{
 constructor({getState,saveState,metaKey='champro-sync-local-v1',storage=localStorage}){
  if(typeof getState!=='function'||typeof saveState!=='function')
   throw Error('Thiếu kho dữ liệu chấm cục bộ');
  this.getState=getState;this.saveState=saveState;this.metaKey=metaKey;this.storage=storage;
  this.meta={schema:VERSION,owner:null,entries:{},photos:{}};
  try{
   const old=JSON.parse(storage.getItem(metaKey)||'null');
   if(old?.schema===VERSION&&typeof old.entries==='object'&&
      (old.owner===null||ownerId(old.owner)))
    this.meta={...this.meta,...old};
  }catch{}
  this.incoming=false;
 }
 store(){this.storage.setItem(this.metaKey,json(this.meta));}
 async bindOwner(owner,{consent=async()=>false}={}){
  if(!ownerId(owner))throw Error('Tài khoản ChấmPro không hợp lệ');
  if(this.meta.owner&&this.meta.owner!==owner)
   throw Error('Thiết bị còn dữ liệu của tài khoản khác; phải xuất bản sao lưu và chuyển dữ liệu có kiểm soát');
  if(this.meta.owner===owner)return true;
  const state=this.getState(),count=Object.values(FIELDS).reduce((n,k)=>n+(state[k]?.length||0),0);
  if(count && !await consent(count,owner))return false;
  this.meta.owner=owner;this.store();return true;
 }
 assertOwner(owner){
  if(!ownerId(owner)||this.meta.owner!==owner)
   throw Error('Chưa liên kết dữ liệu với tài khoản đang đăng nhập');
 }
 snapshot(){
  const db=this.getState();
  if(db?.schema!==1||!Object.values(FIELDS).every(k=>Array.isArray(db[k])))
   throw Error('Kho bài chấm cục bộ không đúng định dạng');
  const rows=new Map();
  for(const [kind,field] of Object.entries(FIELDS))
   for(const item of db[field]){
    if(!safeId(item.id))throw Error('Bản ghi cục bộ không có mã hợp lệ');
    const key=kind+':'+item.id;
    if(rows.has(key))throw Error('Trùng bản ghi cục bộ: '+key);
    rows.set(key,{kind,id:item.id,payload:item});
   }
  return rows;
 }
 async changed(owner){
  this.assertOwner(owner);
  const present=this.snapshot(),updates=[];
  for(const [key,row] of present){
   const digest=await hash(row.payload),old=this.meta.entries[key];
   if(old?.hash===digest && !old.deleted)continue;
   updates.push({...row,revision:old?.revision||0,hash:digest});
  }
  for(const [key,old] of Object.entries(this.meta.entries)){
   if(present.has(key)||old.deleted)continue;
   const [kind,...rest]=key.split(':'),id=rest.join(':');
   if(!(kind in FIELDS)||!safeId(id))continue;
   updates.push({kind,id,payload:{},deleted:true,revision:old.revision||0,hash:null});
  }
  return updates;
 }
 async getLocal(kind,id){
  const current=this.snapshot().get(kind+':'+id);
  if(!current)return null;
  return {...current,revision:this.meta.entries[kind+':'+id]?.revision||0};
 }
 async uploaded(owner,kind,id,revision,hashValue,deleted=false){
  this.assertOwner(owner);
  const key=kind+':'+id;
  if(!Number.isSafeInteger(revision)||revision<1)throw Error('Phiên bản máy chủ không hợp lệ');
  const current=this.snapshot().get(key);
  const currentHash=current?await hash(current.payload):null;
  // If a record changed during an in-flight upload, record the new remote
  // base revision but retain the OLD digest. Next scan will queue the newer edit.
  this.meta.entries[key]={revision,hash:hashValue,deleted};
  this.store();
  return currentHash!==hashValue;
 }
 async applyRemote(owner,remote){
  this.assertOwner(owner);
  if(!validRecord(remote))throw Error('Bản ghi từ máy chủ không hợp lệ');
  const field=FIELDS[remote.kind];
  if(!field)throw Error('Loại dữ liệu chưa hỗ trợ');
  const key=remote.kind+':'+remote.id;
  const previous=this.meta.entries[key];
  const row=this.snapshot().get(key);
  const currentHash=row?await hash(row.payload):null;
  // Protect local edits even if they have not yet been placed into the queue.
  if((row&&!previous)||(previous&&previous.hash!==currentHash))
   throw Error('Xung đột dữ liệu cục bộ; chưa tải đè '+key);
  this.incoming=true;
  try{
   const state=this.getState(),copy={...state,[field]:[...state[field]]};
   const idx=copy[field].findIndex(x=>x.id===remote.id);
   if(remote.deletedAt){if(idx>=0)copy[field].splice(idx,1);}
   else if(idx>=0)copy[field][idx]=remote.payload;
   else copy[field].push(remote.payload);
   // Caller must persist data locally before metadata acknowledges the cloud.
   await this.saveState(copy);
   this.meta.entries[key]={revision:remote.revision,hash:remote.deletedAt?null:await hash(remote.payload),
    deleted:Boolean(remote.deletedAt)};
   this.store();
  }finally{this.incoming=false;}
 }
}
