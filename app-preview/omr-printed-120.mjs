/**
 * ChấmPro — calibrated 120-question A/B/C/D printed paper reader.
 * Deliberately isolated from working three-part paper grading.
 * Reference: original 120-question paper photographed on 2026-11-09,
 * projected through the four outside black fiducials. No uploads.
 */
const REF_MARKERS=[[150,480],[737,485],[745,1375],[121,1375]];
const SBD_X=[601,614,626,639,651,664],CODE_3=[698,711,724];
const BASE_X=[[198,222,246,270],[344,369,393,417],[490,515,539,564],[634,659,684,709]];
const DRIFT_X=[-14,-6,-4,0],Y0=767.5,ROW=19.55;
const ANG=Array.from({length:12},(_,i)=>[Math.cos(i*Math.PI/6),Math.sin(i*Math.PI/6)]);
function solve(a,b){
 const m=a.map((r,i)=>[...r,b[i]]),n=b.length;
 for(let i=0;i<n;i++){
  let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(m[j][i])>Math.abs(m[pivot][i]))pivot=j;
  if(Math.abs(m[pivot][i])<1e-9)throw Error('Bốn mốc góc không hợp lệ');
  [m[i],m[pivot]]=[m[pivot],m[i]];
  const v=m[i][i];for(let k=i;k<=n;k++)m[i][k]/=v;
  for(let j=0;j<n;j++){if(j===i)continue;const factor=m[j][i];for(let k=i;k<=n;k++)m[j][k]-=factor*m[i][k];}
 }
 return m.map(r=>r[n]);
}
function projection(markers){
 const a=[],b=[];
 for(let i=0;i<4;i++){
  const [x,y]=REF_MARKERS[i],[u,v]=markers[i];
  a.push([x,y,1,0,0,0,-x*u,-y*u]);b.push(u);
  a.push([0,0,0,x,y,1,-x*v,-y*v]);b.push(v);
 }
 const h=solve(a,b);
 return (x,y)=>{const d=h[6]*x+h[7]*y+1;
  return [(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];};
}
function photoFrame(canvas){
 const down=Math.min(1,1750/Math.max(canvas.width,canvas.height)),w=Math.round(canvas.width*down),h=Math.round(canvas.height*down);
 const surface=document.createElement('canvas');surface.width=w;surface.height=h;
 const ctx=surface.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(canvas,0,0,w,h);
 const rgba=ctx.getImageData(0,0,w,h).data,gray=new Uint8Array(w*h);
 for(let i=0,j=0;j<gray.length;i+=4,j++)
  gray[j]=(rgba[i]*77+rgba[i+1]*150+rgba[i+2]*29)>>8;
 return {gray,w,h,down};
}
function mean(frame,x,y){
 const xx=Math.round(x*frame.down),yy=Math.round(y*frame.down),{gray,w,h}=frame;
 if(xx<3||yy<3||xx>=w-3||yy>=h-3)return null;
 let n=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)n+=gray[(yy+dy)*w+xx+dx];
 return n/25;
}
function median(arr){
 const a=[...arr].sort((x,y)=>x-y),n=a.length;
 return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;
}
function readDigit(frame,project,shift,x){
 const values=Array.from({length:10},(_,d)=>{
  const [a,b]=project(x,550+18.05*d);
  return mean(frame,a+shift[0],b+shift[1]);
 });
 if(values.some(v=>v===null))return {value:'?',status:'unclear'};
 // For top-to-bottom camera shadows, compensate slowly varying brightness.
 const slopes=[];
 for(let i=0;i<10;i++)for(let j=i+3;j<10;j++)
  slopes.push((values[j]-values[i])/(j-i));
 const slope=median(slopes);
 const offset=median(values.map((v,i)=>v-slope*i));
 const strength=values.map((v,i)=>offset+slope*i-v);
 const ranked=strength.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]);
 const best=ranked[0],margin=best[0]-ranked[1][0];
 if(best[0]>=17&&margin>=11)return {value:String(best[1]),status:'filled'};
 if(best[0]<11&&margin<9)return {value:'',status:'blank'};
 return {value:'?',status:'unclear'};
}
function answerPoints(block,row){
 const y=Y0+ROW*row;
 return BASE_X[block].map(x=>[x+DRIFT_X[block]*row/29,y]);
}
function readAnswer(frame,project,shift,points){
 const values=points.map(p=>{
  const [x,y]=project(...p);
  return mean(frame,x+shift[0],y+shift[1]);
 });
 if(values.some(v=>v===null))return {value:'?',status:'unclear'};
 const order=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);
 const background=median(values),strength=background-order[0].v,margin=order[1].v-order[0].v;
 if(order[2].v-order[1].v>25&&order[2].v-order[0].v>37&&
    order[1].v<order[2].v*.88){
  const letters=[order[0].i,order[1].i].sort((a,b)=>a-b).map(i=>'ABCD'[i]);
  return {value:letters.join('+'),status:'multiple'};
 }
 if(strength>=12&&margin>=9)return {value:'ABCD'[order[0].i],status:'filled'};
 if(strength<7&&margin<7)return {value:'',status:'blank'};
 return {value:'?',status:'unclear'};
}
function ringShift(frame,project,spots,referenceRadius){
 // Fit dark circle OUTLINES, not the student's marks. Use a subset of
 // actual printed rings; robust when the marker detector shifts a few px.
 if(!spots.length)return [0,0];
 const p=project(...spots[0]),pr=project(spots[0][0]+referenceRadius,spots[0][1]);
 const radius=Math.hypot(pr[0]-p[0],pr[1]-p[1])*frame.down;
 if(radius<2.2)return [0,0];
 const outer=radius+Math.max(2.5,radius*.52);
 const points=spots.map(p=>project(...p).map(v=>v*frame.down));
 const {gray,w,h}=frame;
 const pixel=(x,y)=>{
  const ix=Math.round(x),iy=Math.round(y);
  return ix>0&&iy>0&&ix<w-1&&iy<h-1?gray[iy*w+ix]:255;
 };
 const evaluate=(dx,dy)=>{
  let acc=0;
  for(const [x,y] of points){
   for(const [u,v] of ANG)
    acc+=pixel(x+dx+outer*u,y+dy+outer*v)-pixel(x+dx+radius*u,y+dy+radius*v);
  }
  return acc/(points.length*ANG.length)-.13*Math.hypot(dx,dy);
 };
 const baseline=evaluate(0,0);
 let best=baseline,bx=0,by=0;
 const limit=6;
 for(let dy=-limit;dy<=limit;dy++)for(let dx=-limit;dx<=limit;dx++){
  if(dx===0&&dy===0)continue;
  const score=evaluate(dx,dy);
  if(score>best){best=score;bx=dx;by=dy;}
 }
 return best>=baseline+1.7?[bx/frame.down,by/frame.down]:[0,0];
}
function digitSpots(xs){
 return xs.flatMap(x=>Array.from({length:10},(_,r)=>[x,550+18.05*r]));
}
export function readPrinted120WithMarkers(canvas,markers,counts={I:120},digits=3){
 if(!Array.isArray(markers)||markers.length!==4||markers.some(p=>!Array.isArray(p)||p.length!==2))
  throw Error('Phiếu 120 câu chưa xác định đủ 4 mốc');
 const proj=projection(markers),frame=photoFrame(canvas),codeCols=Number(digits)===4?[685,698,711,724]:CODE_3;
 const sbdShift=ringShift(frame,proj,digitSpots(SBD_X).filter((_,i)=>i%2===0),6.5);
 const codeShift=ringShift(frame,proj,digitSpots(codeCols),6.5);
 const sbdCells=SBD_X.map(x=>readDigit(frame,proj,sbdShift,x));
 const codeCells=codeCols.map(x=>readDigit(frame,proj,codeShift,x));
 const examCode=codeCells.map(x=>x.value).join('');
 const codeConfidence=codeCells.every(x=>x.status==='filled')?1:0;
 // An empty SBD prefix is normal. Incomplete later columns are NOT guessed.
 let sbd='',hasStarted=false,sbdUnclear=false;
 for(const cell of sbdCells){
  if(cell.status==='filled'){hasStarted=true;sbd+=cell.value;}
  else if(cell.status==='unclear'||hasStarted)sbdUnclear=true;
 }
 if(sbdUnclear||!hasStarted)sbd='';
 const uncertain=[];
 if(!codeConfidence)uncertain.push('Mã đề chưa đọc đủ');
 const I=[],total=Math.max(0,Math.min(120,Number(counts?.I??120)));
 for(let block=0;block<4;block++){
  const spots=[];
  for(let row=0;row<30;row+=3)spots.push(...answerPoints(block,row));
  const shift=ringShift(frame,proj,spots,7.2);
  for(let row=0;row<30&&block*30+row<total;row++){
   const read=readAnswer(frame,proj,shift,answerPoints(block,row));
   I.push(read.value);
   if(read.status==='unclear')uncertain.push('Câu '+(block*30+row+1)+' chưa rõ');
  }
 }
 return {
  sbd,examCode,I,II:[],III:[],uncertain,
  confidence:codeConfidence&&!uncertain.length?1:codeConfidence?.68:.25,
  codeConfidence,sbdUnclear,engine:'ChấmPro Printed 120 v1',markers,form:'120',
  photoWidth:canvas.width,photoHeight:canvas.height
 };
}
