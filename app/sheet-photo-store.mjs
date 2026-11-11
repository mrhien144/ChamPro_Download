import {shortCellMarks} from './result-review.mjs';
/**
 * ChấmPro optional photo archive. Independent from grade storage and OMR.
 * No network calls. All failures are non-fatal to grading.
 */
const DB_NAME='champro-sheet-photos-v1',STORE='photos';
let opening=null,queue=[],busy=false;
export function openPhotoDb(){
 if(!('indexedDB' in globalThis))return Promise.reject(Error('Thiết bị không hỗ trợ IndexedDB'));
 if(!opening)opening=new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error||Error('Không mở được kho ảnh'));
 }).catch(e=>{opening=null;throw e;});
 return opening;
}
async function transaction(mode,operation){
 const db=await openPhotoDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
  let value;
  tx.oncomplete=()=>resolve(value);
  tx.onerror=()=>reject(tx.error||Error('Lỗi lưu ảnh'));
  tx.onabort=()=>reject(tx.error||Error('Giao dịch ảnh bị hủy'));
  const req=operation(store);
  if(req){req.onsuccess=()=>{value=req.result;};req.onerror=()=>reject(req.error);}
 });
}
export const getSheetPhoto=id=>transaction('readonly',s=>s.get(id));
export const removeSheetPhoto=id=>transaction('readwrite',s=>s.delete(id));
export async function pruneSheetPhotos(retentionDays=365){
 const cutoff=Date.now()-retentionDays*86400000,db=await openPhotoDb();
 return new Promise((resolve,reject)=>{
  let removed=0;const tx=db.transaction(STORE,'readwrite'),cursor=tx.objectStore(STORE).openCursor();
  cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;if(Date.parse(c.value.createdAt)<cutoff){c.delete();removed++;}c.continue();};
  tx.oncomplete=()=>resolve(removed);tx.onerror=()=>reject(tx.error);
 });
}
function encode(canvas){
 return new Promise((resolve,reject)=>{
  if(canvas.toBlob)canvas.toBlob(b=>b?resolve(b):reject(Error('Không mã hóa được ảnh')),'image/jpeg',.78);
  else reject(Error('Trình duyệt không hỗ trợ lưu ảnh'));
 });
}
function waitForIdle(){
 return new Promise(resolve=>{
  if(typeof requestIdleCallback==='function')requestIdleCallback(resolve,{timeout:1200});
  else setTimeout(resolve,60);
 });
}
/**
 * Copy only a confirmed frame, before the shared capture canvas is reused.
 * Compression and IndexedDB write happen later, without blocking scoring.
 * Bounded queue prevents photo work from overwhelming continuous scanning.
 */
export function enqueueSheetPhoto({id,canvas,markers,angle=0,form='three',digits=3,examId,examCode}){
 if(!id||!canvas?.width||!canvas?.height)return false;
 if(queue.length>=3)return false;
 const snapshot=document.createElement('canvas');
 const scale=Math.min(1,1400/Math.max(canvas.width,canvas.height));
 snapshot.width=Math.max(1,Math.round(canvas.width*scale));snapshot.height=Math.max(1,Math.round(canvas.height*scale));
 snapshot.getContext('2d').drawImage(canvas,0,0,snapshot.width,snapshot.height);
 const adjusted=(markers||[]).map(([x,y])=>[x*scale,y*scale]);
 queue.push({id,snapshot,markers:adjusted,angle,form,digits,examId,examCode,createdAt:new Date().toISOString()});
 if(!busy)void drain();
 return true;
}
async function drain(){
 busy=true;
 try{
  while(queue.length){
   const item=queue.shift();
   try{
    await waitForIdle();
    const blob=await encode(item.snapshot);
    await transaction('readwrite',s=>s.put({
     id:item.id,blob,markers:item.markers,angle:item.angle,form:item.form,
     digits:item.digits,examId:item.examId,examCode:item.examCode,createdAt:item.createdAt
    }));
    globalThis.dispatchEvent(new CustomEvent('champro-photo-status',{detail:{id:item.id,status:'saved'}}));
   }catch(e){
    console.warn('ChấmPro photo archive:',e);
    globalThis.dispatchEvent(new CustomEvent('champro-photo-status',{detail:{id:item.id,status:'failed'}}));
   }finally{item.snapshot.width=0;item.snapshot.height=0;}
  }
 }finally{busy=false;}
}
const REFS={
 three:[[84.5,96.5],[964.4,105.5],[944.4,1401.6],[70.4,1389.5]],
 '120':[[150,480],[737,485],[745,1375],[121,1375]]
};
function projection(from,to){
 if(from?.length!==4||to?.length!==4)return null;
 const a=[],v=[];
 for(let i=0;i<4;i++){
  const [x,y]=from[i],[u,w]=to[i];
  a.push([x,y,1,0,0,0,-x*u,-y*u]);v.push(u);
  a.push([0,0,0,x,y,1,-x*w,-y*w]);v.push(w);
 }
 const m=a.map((r,i)=>[...r,v[i]]);
 for(let i=0;i<8;i++){
  let p=i;for(let j=i+1;j<8;j++)if(Math.abs(m[j][i])>Math.abs(m[p][i]))p=j;
  if(Math.abs(m[p][i])<1e-8)return null;
  [m[i],m[p]]=[m[p],m[i]];
  const q=m[i][i];for(let k=i;k<9;k++)m[i][k]/=q;
  for(let j=0;j<8;j++)if(j!==i){const q=m[j][i];for(let k=i;k<9;k++)m[j][k]-=q*m[i][k];}
 }
 const h=m.map(r=>r[8]);
 return (x,y)=>{const d=h[6]*x+h[7]*y+1;return [(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];};
}
function centers(form,part,q){
 if(form==='120'){
  if(part!=='I'||q>120)return [];
  const block=Math.floor((q-1)/30),row=(q-1)%30;
  const x=[[198,222,246,270],[344,369,393,417],[490,515,539,564],[634,659,684,709]][block];
  return x.map(v=>[v+[-14,-6,-4,0][block]*row/29,767.5+19.55*row]);
 }
 if(part==='I'){
  const block=Math.floor((q-1)/10),row=(q-1)%10;
  const x=[[155,197,239,280],[362,403,444,485],[568,609,650,691],[775,817,858,900]][block];
  return x?.map(v=>[v,[578,582,585,588][block]+21.8*row])||[];
 }
 if(part==='II'){
  const x=[[153,195],[237,279],[361,403],[443,484],[565,607],[647,689],[770,812],[853,895]][q-1];
  return x?Array.from({length:4},(_,j)=>x.map(v=>[v,886+2*Math.floor((q-1)/2)+21.5*j])):[];
 }
 if(part==='III'){
  const x=[[142,171,199,227],[275,303,331,359],[406,435,463,491],[536,566,595,623],[667,696,725,753],[799,829,857,885]][q-1];
  const y=[1119,1120,1122,1123,1125,1127][q-1];
  // Exact printed bubble centres used by the verified sheet reader: four
  // columns × ten digits, without approximating a single question centre.
  return x?.map(v=>Array.from({length:10},(_,digit)=>[v,y+22*digit]))||[];
 }
 return [];
}
function mark(ctx,p,color,r=10){
 if(!p||!Number.isFinite(p[0])||!Number.isFinite(p[1]))return;
 ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);
 ctx.lineWidth=Math.max(3,r*.3);ctx.strokeStyle=color;ctx.stroke();
}
function fillDigit(ctx,p,color,r=10){
 if(!p||!Number.isFinite(p[0])||!Number.isFinite(p[1]))return;
 ctx.beginPath();ctx.arc(p[0],p[1],r,0,Math.PI*2);
 ctx.fillStyle=color;ctx.globalAlpha=.82;ctx.fill();ctx.globalAlpha=1;
 ctx.lineWidth=Math.max(2,r*.18);ctx.strokeStyle='#ffffff';ctx.stroke();
}
export async function showSheetPhoto(container,record,exam){
 container.replaceChildren();
 const note=document.createElement('p');note.className='hint';note.textContent='Đang mở ảnh phiếu đã lưu…';container.append(note);
 try{
  const stored=await getSheetPhoto(record.id);
  if(!stored){note.textContent='Bài này chưa có ảnh lưu trên thiết bị, hoặc ảnh đã được dọn dẹp.';return;}
  const url=URL.createObjectURL(stored.blob),img=new Image();
  try{await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Ảnh không đọc được'));img.src=url;});
   const c=document.createElement('canvas'),angle=stored.angle||0;
   c.width=angle===90||angle===270?img.height:img.width;
   c.height=angle===90||angle===270?img.width:img.height;
   const g=c.getContext('2d');
   if(angle===90){g.translate(c.width,0);g.rotate(Math.PI/2);}
   else if(angle===270){g.translate(0,c.height);g.rotate(-Math.PI/2);}
   else if(angle===180){g.translate(c.width,c.height);g.rotate(Math.PI);}
   g.drawImage(img,0,0);
   g.setTransform(1,0,0,1,0,0);
   const ref=REFS[stored.form],map=projection(ref,stored.markers);
   const key=exam?.keys?.[record.examCode];
   // Score engine remains the source of truth, including flexible answer keys.
   let gradeDetails=[];
   if(exam&&key){
    const {grade}=await import('./grader.mjs');
    gradeDetails=grade(exam,{...record.answers,examCode:record.examCode}).detail;
   }
   if(map&&gradeDetails.length){
    const radius=Math.max(5,Math.min(c.width,c.height)*.008);
    for(const d of gradeDetails){
     const positions=centers(stored.form,d.part,d.q);
     if(!positions.length)continue;
     const correct=d.got>=d.max-1e-8,actual=String(d.response||'').toUpperCase();
     const alphabet=d.part==='II'?'ĐS':'ABCD';
     if(d.part==='I'){
      const selected=actual.split(/[+|;/]/).filter(Boolean);
      for(const letter of selected){const index=alphabet.indexOf(letter);if(index>=0)mark(g,map(...positions[index]),correct?'#16a34a':'#e11d48',radius);}
      if(!correct){const accepted=String(d.key||'').toUpperCase().split(/[|;/]/);for(const letter of accepted){const index=alphabet.indexOf(letter);if(index>=0)mark(g,map(...positions[index]),'#eab308',radius*.75);}}
     }else if(d.part==='II'){
      const answer=String(d.key||'').toUpperCase().replaceAll('D','Đ');
      for(let j=0;j<4;j++){
       const letter=actual[j],correctLetter=answer[j],idx=alphabet.indexOf(letter);
       if(idx>=0){const right=letter===correctLetter||correctLetter==='*';mark(g,map(...positions[j][idx]),right?'#16a34a':'#e11d48',radius*.8);}
       if(idx>=0&&letter!==correctLetter&&correctLetter!=='*'){const k=alphabet.indexOf(correctLetter);if(k>=0)mark(g,map(...positions[j][k]),'#eab308',radius*.65);}
      }
     }else if(d.part==='III'){
      const savedColumns=record.answers?.IIIColumns?.[d.q-1]??null;
      const marks=shortCellMarks(d.response,d.key,savedColumns,4);
      for(const spot of marks){
       const point=positions[spot.column]?.[Number(spot.digit)];
       if(!point)continue;
       const colour=spot.color==='green'?'#166534':spot.color==='red'?'#dc2626':'#eab308';
       fillDigit(g,map(...point),colour,Math.max(5,radius*.82));
      }
     }
    }
   }
   note.textContent=map&&gradeDetails.length?'Xanh đậm: ô đúng · Đỏ: ô tô sai · Vàng: ô đáp án đúng tương ứng. Phần III khoanh từng ô số; với bài cũ thiếu vị trí cột, đối chiếu lại ảnh gốc.':'Ảnh phiếu gốc. Chưa đủ dữ liệu tọa độ hoặc đáp án để đánh dấu trực tiếp.';
   c.className='champro-archived-photo';c.style.cssText='display:block;width:100%;height:auto;max-height:70vh;object-fit:contain;margin:10px 0;';
   container.append(c);
  }finally{URL.revokeObjectURL(url);}
 }catch(e){note.textContent='Không thể mở ảnh: '+e.message;}
}
