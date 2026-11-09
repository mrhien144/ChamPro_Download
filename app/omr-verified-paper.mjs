/** ChấmPro 3-section, 3-digit physical answer sheet reader (calibrated). */
export const MARKERS_REF=[[84.5,96.5],[964.4,105.5],[944.4,1401.6],[70.4,1389.5]];
const SBD_X=[754,774,794,813,832,850],CODE_X=[899,918,937];
const PART_I_X=[[155,197,239,280],[362,403,444,485],[568,609,650,691],[775,817,858,900]];
const PART_I_Y=[578,582,585,588];
const PART_II_X=[[153,195],[237,279],[361,403],[443,484],[565,607],[647,689],[770,812],[853,895]];
const PART_III_X=[[142,171,199,227],[275,303,331,359],[406,435,463,491],[536,566,595,623],[667,696,725,753],[799,829,857,885]];
const PART_III_Y=[1119,1120,1122,1123,1125,1127];
function homography(from,to){
 const matrix=[],vector=[];
 for(let i=0;i<4;i++){
  const [x,y]=from[i],[u,v]=to[i];
  matrix.push([x,y,1,0,0,0,-x*u,-y*u]);vector.push(u);
  matrix.push([0,0,0,x,y,1,-x*v,-y*v]);vector.push(v);
 }
 const n=8,a=matrix.map((row,i)=>[...row,vector[i]]);
 for(let i=0;i<n;i++){
  let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[pivot][i]))pivot=j;
  if(Math.abs(a[pivot][i])<1e-8)throw Error('Bốn mốc không hợp lệ');
  [a[pivot],a[i]]=[a[i],a[pivot]];
  const v=a[i][i];for(let k=i;k<=n;k++)a[i][k]/=v;
  for(let j=0;j<n;j++){if(j===i)continue;const factor=a[j][i];for(let k=i;k<=n;k++)a[j][k]-=factor*a[i][k];}
 }
 const m=a.map(row=>row[n]);
 return (x,y)=>{const den=m[6]*x+m[7]*y+1;return [(m[0]*x+m[1]*y+m[2])/den,(m[3]*x+m[4]*y+m[5])/den];};
}
function grayFrame(c){
 const down=Math.min(1,1700/Math.max(c.width,c.height));
 const w=Math.max(1,Math.round(c.width*down)),h=Math.max(1,Math.round(c.height*down));
 const tmp=document.createElement('canvas');tmp.width=w;tmp.height=h;
 const ctx=tmp.getContext('2d',{willReadFrequently:true});ctx.drawImage(c,0,0,w,h);
 const data=ctx.getImageData(0,0,w,h).data,gray=new Uint8Array(w*h);
 for(let i=0,j=0;j<gray.length;i+=4,j++)gray[j]=(77*data[i]+150*data[i+1]+29*data[i+2])>>8;
 return {gray,w,h,down};
}
function meanCenter(frame,x,y){
 const {gray,w,h,down}=frame,px=Math.round(x*down),py=Math.round(y*down);
 if(px<3||py<3||px>=w-3||py>=h-3)return null;
 let sum=0;
 for(let iy=-2;iy<=2;iy++)for(let ix=-2;ix<=2;ix++)sum+=gray[(py+iy)*w+px+ix];
 return sum/25;
}
function median(values){
 const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;
 return n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2;
}
function choice(frame,map,coords,alphabet,numeric=false){
 const values=coords.map(([x,y])=>{const [u,v]=map(x,y);return meanCenter(frame,u,v);});
 if(values.some(x=>x===null))return {value:'?',status:'unclear',strength:0,margin:0};
 if(numeric&&values.length===10){
  // The camera frame may be shaded from top to bottom. A dark unfilled
  // circle at the bottom must not beat a pencilled digit near the top.
  // Estimate a robust background brightness slope, with one filled outlier.
  const slopes=[];
  for(let i=0;i<values.length;i++)
   for(let j=i+3;j<values.length;j++)
    slopes.push((values[j]-values[i])/(j-i));
  const slope=median(slopes);
  const intercept=median(values.map((v,i)=>v-slope*i));
  const rank=values.map((v,i)=>({i,score:intercept+slope*i-v}))
   .sort((a,b)=>b.score-a.score);
  const top=rank[0],second=rank[1],strength=top.score,margin=top.score-second.score;
  const filled=strength>=18&&margin>=13;
  const blank=strength<12&&margin<9;
  return {value:filled?alphabet[top.i]:blank?'':'?',status:filled?'filled':blank?'blank':'unclear',
   strength,margin};
 }
 const rank=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);
 const background=median(values);
 const dark=rank[0],next=rank[1];
 const strength=background-dark.v,margin=next.v-dark.v;
 const filled=strength>=23&&margin>=12&&dark.v<background*.93;
 const blank=strength<14&&margin<11;
 return {value:filled?alphabet[dark.i]:blank?'':'?',status:filled?'filled':blank?'blank':'unclear',strength,margin};
}
function marks(frame,map,coords){
 return coords.map(([x,y])=>{const [u,v]=map(x,y);return meanCenter(frame,u,v);});
}

// Camera corner-square positions can be off by several pixels. Fit each
// printed bubble region to the OUTLINE rings before examining dark centers.
// Do not optimize directly for "darkness": that can mistake ring edges for fills.
const ANGLES=Array.from({length:12},(_,i)=>[Math.cos(i*Math.PI/6),Math.sin(i*Math.PI/6)]);
function localRingShift(frame,projection,groups,radiusRef){
 const all=groups.flat();
 if(!all.length)return [0,0];
 const center=all[Math.floor(all.length/2)];
 const c0=projection(center[0],center[1]);
 const c1=projection(center[0]+radiusRef,center[1]);
 const r=Math.hypot(c1[0]-c0[0],c1[1]-c0[1])*frame.down;
 if(r<2.5)return [0,0];
 const rOuter=r+Math.max(2.7,r*.55);
 const steps=Math.max(3,Math.min(6,Math.round(r*.68)));
 const spots=all.map(([x,y])=>{const [u,v]=projection(x,y);return [u*frame.down,v*frame.down];});
 const {gray,w,h}=frame;
 const shade=(x,y)=>{const ix=Math.round(x),iy=Math.round(y);return ix>0&&iy>0&&ix<w&&iy<h?gray[iy*w+ix]:255;};
 const evaluate=(dx,dy)=>{
  let total=0;
  for(const [x,y] of spots){
   const xx=x+dx,yy=y+dy;
   for(const [cx,cy] of ANGLES)
    total+=shade(xx+cx*rOuter,yy+cy*rOuter)-shade(xx+cx*r,yy+cy*r);
  }
  return total/(spots.length*ANGLES.length)-.16*Math.hypot(dx,dy);
 };
 const baseline=evaluate(0,0);
 let bestScore=baseline,bestDx=0,bestDy=0;
 for(let dy=-steps;dy<=steps;dy++)for(let dx=-steps;dx<=steps;dx++){
  if(dx===0&&dy===0)continue;
  const score=evaluate(dx,dy);
  if(score>bestScore){bestScore=score;bestDx=dx;bestDy=dy;}
 }
 return bestScore>=baseline+2.1?[bestDx/frame.down,bestDy/frame.down]:[0,0];
}
function shifted(projection,shift){return (x,y)=>{const p=projection(x,y);return [p[0]+shift[0],p[1]+shift[1]];};}

function rowCoords(xs,y){return xs.map(x=>[x,y]);}
function digitGrid(xs){return xs.map(x=>Array.from({length:10},(_,r)=>[x,199+27.75*r]));}
export function readVerifiedWithMarkers(canvas,markers,counts={I:18,II:4,III:6}){
 if(!Array.isArray(markers)||markers.length!==4)throw Error('Cần 4 mốc góc ngoài');
 const map=homography(MARKERS_REF,markers),f=grayFrame(canvas),uncertain=[];
 const sbdGrid=digitGrid(SBD_X),sbdShift=localRingShift(f,map,sbdGrid,8.2);
 const sbdMap=shifted(map,sbdShift);
 const digitColumns=sbdGrid.map(q=>choice(f,sbdMap,q,'0123456789',true));
 const codeColumns=digitGrid(CODE_X).map(q=>choice(f,map,q,'0123456789',true));
 const code=codeColumns.map(q=>q.value).join(''),codeConfidence=codeColumns.every(q=>q.status==='filled')?1:0;
 if(!codeConfidence)uncertain.push('Mã đề chưa rõ');
 // Leftmost SBD columns may legitimately be blank; do not prepend zeros.
 let sbd='',started=false,sbdUnclear=false;
 for(const col of digitColumns){
  if(col.status==='filled'){started=true;sbd+=col.value;}
  else if(col.status==='unclear'||started){sbdUnclear=true;}
 }
 if(sbdUnclear||!started)sbd='';
 const readCount=(k,max)=>Math.max(0,Math.min(max,Number(counts[k]??(k==='I'?18:k==='II'?4:6))));
 const I=[],II=[],III=[];
 for(let i=0;i<readCount('I',40);i++){
  const b=Math.floor(i/10),y=PART_I_Y[b]+21.8*(i%10);
  const value=choice(f,map,rowCoords(PART_I_X[b],y),'ABCD');
  I.push(value.value);
  if(value.status==='unclear')uncertain.push('Phần I câu '+(i+1));
 }
 for(let i=0;i<readCount('II',8);i++){
  let word='';for(let j=0;j<4;j++){
   const y=886+2*Math.floor(i/2)+21.5*j;
   const value=choice(f,map,rowCoords(PART_II_X[i],y),'ĐS');
   word+=value.value||' ';
   if(value.status==='unclear')uncertain.push('Phần II câu '+(i+1)+', ý '+('abcd'[j]));
  }
  II.push(word);
 }
 for(let i=0;i<readCount('III',6);i++){
  const pts=PART_III_X[i].map(x=>Array.from({length:10},(_,d)=>[x,PART_III_Y[i]+22*d]));
  const shift=localRingShift(f,map,pts,7.4),partMap=shifted(map,shift);
  const digits=[];
  for(let j=0;j<4;j++){
   const coords=Array.from({length:10},(_,d)=>[PART_III_X[i][j],PART_III_Y[i]+22*d]);
   const value=choice(f,partMap,coords,'0123456789',true);
   if(value.status==='unclear')uncertain.push('Phần III câu '+(i+1)+', cột '+(j+1));
   digits.push(value.value);
  }
  let value=digits.join('').trim();
  // Signs (- / decimal comma) are kept for review if potentially marked.
  // Do not create a negative or decimal number without a verified sign.
  const signX=PART_III_X[i][0],signY=PART_III_Y[i];
  const sign=marks(f,partMap,[[signX,signY-44],[PART_III_X[i][1],signY-22],[PART_III_X[i][2],signY-22]]);
  if(sign.some(x=>x===null))uncertain.push('Phần III câu '+(i+1)+', dấu');
  else if(sign.some(x=>x<110))uncertain.push('Phần III câu '+(i+1)+', kiểm tra dấu âm/phẩy');
  III.push(value);
 }
 return {sbd,examCode:code,I,II,III,codeConfidence,
   confidence:codeConfidence&&!uncertain.length?1:.7,uncertain,sbdUnclear,
   engine:'ChấmPro calibrated printed-sheet v1',markers,form:'three',
   photoWidth:canvas.width,photoHeight:canvas.height};
}