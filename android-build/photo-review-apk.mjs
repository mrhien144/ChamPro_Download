/**
 * ChấmPro APK-only paper viewer.
 * Original photo and score/marking engine are unchanged.
 * This module rectifies the already annotated photo for display only.
 */
import {showSheetPhoto as showOriginalSheetPhoto,getSheetPhoto} from './sheet-photo-store.mjs';
export {enqueueSheetPhoto} from './sheet-photo-store.mjs';

const PAGES={
 three:{width:1024,height:1536,markers:[[84.5,96.5],[964.4,105.5],[944.4,1401.6],[70.4,1389.5]]},
 '120':{width:1024,height:1536,markers:[[150,480],[737,485],[745,1375],[121,1375]]}
};
function homography(from,to){
 if(!Array.isArray(to)||to.length!==4||to.some(p=>!Array.isArray(p)||p.length<2||p.some(v=>!Number.isFinite(Number(v)))))return null;
 const m=[];
 for(let i=0;i<4;i++){
  const [x,y]=from[i],[u,v]=to[i];
  m.push([x,y,1,0,0,0,-x*u,-y*u,u]);
  m.push([0,0,0,x,y,1,-x*v,-y*v,v]);
 }
 for(let i=0;i<8;i++){
  let pivot=i;
  for(let j=i+1;j<8;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;
  if(Math.abs(m[pivot][i])<1e-8)return null;
  [m[i],m[pivot]]=[m[pivot],m[i]];
  const factor=m[i][i];for(let k=i;k<9;k++)m[i][k]/=factor;
  for(let j=0;j<8;j++)if(j!==i){
   const f=m[j][i];for(let k=i;k<9;k++)m[j][k]-=f*m[i][k];
  }
 }
 const h=m.map(row=>row[8]);
 return (x,y)=>{
  const denom=h[6]*x+h[7]*y+1;
  if(Math.abs(denom)<1e-7)return [NaN,NaN];
  return [(h[0]*x+h[1]*y+h[2])/denom,(h[3]*x+h[4]*y+h[5])/denom];
 };
}
function area(points){
 let total=0;
 for(let i=0;i<4;i++){const a=points[i],b=points[(i+1)%4];total+=a[0]*b[1]-b[0]*a[1];}
 return Math.abs(total/2);
}
/* Map two source points to two destination points in a triangle without
 * modifying any pixels in the original archived photo. */
function triangle(ctx,src,from,to){
 const [s0,s1,s2]=from,[d0,d1,d2]=to;
 const sx1=s1[0]-s0[0],sy1=s1[1]-s0[1],sx2=s2[0]-s0[0],sy2=s2[1]-s0[1];
 const dx1=d1[0]-d0[0],dy1=d1[1]-d0[1],dx2=d2[0]-d0[0],dy2=d2[1]-d0[1];
 const det=sx1*sy2-sx2*sy1;
 if(Math.abs(det)<1e-7)return;
 const a=(dx1*sy2-dx2*sy1)/det,c=(dx2*sx1-dx1*sx2)/det;
 const b=(dy1*sy2-dy2*sy1)/det,d=(dy2*sx1-dy1*sx2)/det;
 const e=d0[0]-a*s0[0]-c*s0[1],f=d0[1]-b*s0[0]-d*s0[1];
 ctx.save();
 ctx.beginPath();
 // Slight overlap removes anti-aliased seams between adjacent mesh cells.
 const mx=(d0[0]+d1[0]+d2[0])/3,my=(d0[1]+d1[1]+d2[1])/3;
 for(let i=0;i<3;i++){
  const p=to[i],length=Math.hypot(p[0]-mx,p[1]-my)||1;
  const x=p[0]+(p[0]-mx)*.55/length,y=p[1]+(p[1]-my)*.55/length;
  if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
 }
 ctx.closePath();ctx.clip();
 ctx.setTransform(a,b,c,d,e,f);
 ctx.drawImage(src,0,0);
 ctx.restore();
}
function paperCanvas(original,stored){
 const spec=PAGES[stored.form]||PAGES.three;
 const project=homography(spec.markers,stored.markers);
 if(!project)return null;
 const corners=[[0,0],[spec.width,0],[spec.width,spec.height],[0,spec.height]].map(p=>project(...p));
 if(corners.some(p=>p.some(v=>!Number.isFinite(v))))return null;
 const minX=Math.min(...corners.map(p=>p[0])),maxX=Math.max(...corners.map(p=>p[0]));
 const minY=Math.min(...corners.map(p=>p[1])),maxY=Math.max(...corners.map(p=>p[1]));
 // Reject implausible geometry rather than show an empty/cut-off page.
 if(area(corners)<original.width*original.height*.025||
    maxX-minX<80||maxY-minY<100||
    minX < -original.width*.15||minY < -original.height*.15||
    maxX > original.width*1.15||maxY > original.height*1.15)return null;
 const result=document.createElement('canvas');
 result.width=960;result.height=Math.round(960*spec.height/spec.width);
 const g=result.getContext('2d',{alpha:false});
 g.fillStyle='#fff';g.fillRect(0,0,result.width,result.height);
 const cols=8,rows=12;
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const x0=col*spec.width/cols,x1=(col+1)*spec.width/cols;
  const y0=row*spec.height/rows,y1=(row+1)*spec.height/rows;
  const source=[project(x0,y0),project(x1,y0),project(x1,y1),project(x0,y1)];
  const dest=[[x0*result.width/spec.width,y0*result.height/spec.height],
   [x1*result.width/spec.width,y0*result.height/spec.height],
   [x1*result.width/spec.width,y1*result.height/spec.height],
   [x0*result.width/spec.width,y1*result.height/spec.height]];
  triangle(g,original,[source[0],source[1],source[2]],[dest[0],dest[1],dest[2]]);
  triangle(g,original,[source[0],source[2],source[3]],[dest[0],dest[2],dest[3]]);
 }
 return result;
}
function bboxCrop(original,stored){
 const points=stored.markers;
 if(!Array.isArray(points)||points.length!==4)return null;
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const padX=(Math.max(...xs)-Math.min(...xs))*.105;
 const padY=(Math.max(...ys)-Math.min(...ys))*.105;
 const x=Math.max(0,Math.floor(Math.min(...xs)-padX));
 const y=Math.max(0,Math.floor(Math.min(...ys)-padY));
 const w=Math.min(original.width-x,Math.ceil(Math.max(...xs)+padX-x));
 const h=Math.min(original.height-y,Math.ceil(Math.max(...ys)+padY-y));
 if(w<80||h<100)return null;
 const c=document.createElement('canvas');c.width=w;c.height=h;
 c.getContext('2d').drawImage(original,x,y,w,h,0,0,w,h);
 return c;
}
function attachViewer(container,canvas,mode){
 const viewer=document.createElement('section');viewer.className='cp-apk-paper-viewer';
 const bar=document.createElement('div');bar.className='cp-apk-paper-tools';
 bar.innerHTML='<strong>Phiếu trả lời · '+(mode==='rectified'?'Đã cắt & căn thẳng':'Đã cắt ảnh')+'</strong>'+
 '<div class="cp-apk-paper-buttons"><button type="button" data-zoom="out" aria-label="Thu nhỏ ảnh">−</button>'+
 '<output aria-live="polite">100%</output><button type="button" data-zoom="in" aria-label="Phóng to ảnh">+</button>'+
 '<button type="button" data-zoom="fit">Vừa màn hình</button></div>'+
 '<button type="button" class="cp-apk-jump-edit" data-review-action="edit">✎ Chỉnh sửa bài</button>';
 const viewport=document.createElement('div');viewport.className='cp-apk-paper-viewport';
 viewport.setAttribute('aria-label','Ảnh phiếu đã chấm, vuốt để xem và dùng hai ngón để phóng to');
 canvas.className='cp-apk-paper-canvas';
 canvas.style.cssText='display:block;max-width:none;max-height:none;height:auto;margin:0 auto;';
 viewport.append(canvas);viewer.append(bar,viewport);
 const hint=document.createElement('p');hint.className='cp-apk-paper-hint';
 hint.textContent='Vuốt lên để xem phần chỉnh sửa bên dưới. Khi phóng to, có thể kéo ảnh để kiểm tra từng ô.';
 viewer.append(hint);
 let zoom=1,fitWidth=0;
 const out=bar.querySelector('output');
 function setZoom(next){
  const oldWidth=canvas.getBoundingClientRect().width;
  const ratioX=viewport.scrollWidth>viewport.clientWidth?
   (viewport.scrollLeft+viewport.clientWidth/2)/Math.max(1,oldWidth):.5;
  const ratioY=viewport.scrollHeight>viewport.clientHeight?
   (viewport.scrollTop+viewport.clientHeight/2)/Math.max(1,canvas.getBoundingClientRect().height):.5;
  zoom=Math.min(4,Math.max(.65,Number(next)||1));
  // At fit-size, the page is a normal document section: one-finger swipes
  // must scroll the review dialog to reach the student-answer editor.
  // Only a zoomed paper becomes a separate pannable scroll viewport.
  viewport.classList.toggle('cp-apk-paper-zoomed',zoom>1.01);
  fitWidth=Math.max(150,viewport.clientWidth-2);
  const newWidth=Math.round(fitWidth*zoom);
  canvas.style.width=newWidth+'px';
  out.textContent=Math.round(zoom*100)+'%';
  viewport.scrollLeft=Math.max(0,newWidth*ratioX-viewport.clientWidth/2);
  viewport.scrollTop=Math.max(0,newWidth*canvas.height/canvas.width*ratioY-viewport.clientHeight/2);
 }
 bar.addEventListener('click',e=>{
  if(e.target.closest('[data-review-action="edit"]')){
   const editor=container.closest('#reviewBody')?.querySelector('.cp-manual-editor');
   const dialog=container.closest('#reviewDialog');
   if(editor&&dialog){
    // Scroll the modal, not the image and not the underlying app screen.
    const offset=editor.getBoundingClientRect().top-dialog.getBoundingClientRect().top;
    dialog.scrollTo({top:dialog.scrollTop+offset-72,behavior:'smooth'});
    const first=editor.querySelector('input,select,button');
    if(first)first.setAttribute('data-cp-edit-target','');
   }
   return;
  }
  const action=e.target.closest('button[data-zoom]')?.dataset.zoom;
  if(action==='out')setZoom(zoom/1.5);
  if(action==='in')setZoom(zoom*1.5);
  if(action==='fit'){setZoom(1);viewport.scrollTo(0,0);}
 });
 let pinch=null;
 function distance(t){return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);}
 viewport.addEventListener('touchstart',e=>{
  if(e.touches.length===2)pinch={distance:distance(e.touches),zoom};
 },{passive:true});
 viewport.addEventListener('touchmove',e=>{
  if(e.touches.length!==2||!pinch)return;
  e.preventDefault();
  setZoom(pinch.zoom*distance(e.touches)/Math.max(1,pinch.distance));
 },{passive:false});
 viewport.addEventListener('touchend',e=>{if(e.touches.length<2)pinch=null;},{passive:true});
 canvas.addEventListener('dblclick',()=>setZoom(zoom<1.5?2:1));
 container.append(viewer);
 requestAnimationFrame(()=>setZoom(1));
 // Observe width changes (rotation or dialog resizing) without affecting
 // camera processing or triggering layout updates while scanning.
 if('ResizeObserver' in globalThis){
  const observer=new ResizeObserver(()=>{
   if(!viewer.isConnected){observer.disconnect();return;}
   const w=viewport.clientWidth;
   if(w>0&&Math.abs(w-2-fitWidth)>3)setZoom(zoom);
  });
  observer.observe(viewport);
 }
}
export async function showSheetPhoto(container,record,exam){
 await showOriginalSheetPhoto(container,record,exam);
 const original=container.querySelector('canvas.champro-archived-photo');
 if(!original)return;
 try{
  const stored=await getSheetPhoto(record.id);
  if(!stored)return;
  const rectified=paperCanvas(original,stored);
  const cropped=rectified||bboxCrop(original,stored);
  if(!cropped)return;
  original.remove();
  attachViewer(container,cropped,rectified?'rectified':'cropped');
 }catch(error){
  console.warn('ChấmPro APK photo viewer:',error);
  // Preserve original marked photo when crop fails.
 }
}
