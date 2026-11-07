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
function choice(frame,map,coords,alphabet){
 const values=coords.map(([x,y])=>{const [u,v]=map(x,y);return meanCenter(frame,u,v);});
 if(values.some(x=>x===null))return {value:'?',status:'unclear',strength:0,margin:0};
 const rank=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);
 const median=[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
 const dark=rank[0],next=rank[1];
 const strength=median-dark.v,margin=next.v-dark.v;
 const filled=strength>=23&&margin>=12&&dark.v<median*.93;
 const blank=strength<14&&margin<11;
 return {value:filled?alphabet[dark.i]:blank?'':'?',status:filled?'filled':blank?'blank':'unclear',strength,margin};
}
function marks(frame,map,coords){
 return coords.map(([x,y])=>{const [u,v]=map(x,y);return meanCenter(frame,u,v);});
}
function rowCoords(xs,y){return xs.map(x=>[x,y]);}
function digitGrid(xs){return xs.map(x=>Array.from({length:10},(_,r)=>[x,199+27.75*r]));}
export function readVerifiedWithMarkers(canvas,markers,counts={I:18,II:4,III:6}){
 if(!Array.isArray(markers)||markers.length!==4)throw Error('Cần 4 mốc góc ngoài');
 const map=homography(MARKERS_REF,markers),f=grayFrame(canvas),uncertain=[];
 const digitColumns=digitGrid(SBD_X).map(q=>choice(f,map,q,'0123456789'));
 const codeColumns=digitGrid(CODE_X).map(q=>choice(f,map,q,'0123456789'));
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
  const digits=[];
  for(let j=0;j<4;j++){
   const coords=Array.from({length:10},(_,d)=>[PART_III_X[i][j],PART_III_Y[i]+22*d]);
   const value=choice(f,map,coords,'0123456789');
   if(value.status==='unclear')uncertain.push('Phần III câu '+(i+1)+', cột '+(j+1));
   digits.push(value.value);
  }
  let value=digits.join('').trim();
  // Signs (- / decimal comma) are kept for review if potentially marked.
  // Do not create a negative or decimal number without a verified sign.
  const signX=PART_III_X[i][0],signY=PART_III_Y[i];
  const sign=marks(f,map,[[signX,signY-44],[PART_III_X[i][1],signY-22],[PART_III_X[i][2],signY-22]]);
  if(sign.some(x=>x===null))uncertain.push('Phần III câu '+(i+1)+', dấu');
  else if(sign.some(x=>x<110))uncertain.push('Phần III câu '+(i+1)+', kiểm tra dấu âm/phẩy');
  III.push(value);
 }
 return {sbd,examCode:code,I,II,III,codeConfidence,
   confidence:codeConfidence&&!uncertain.length?1:.7,uncertain,sbdUnclear,
   engine:'ChấmPro calibrated printed-sheet v1',markers,form:'three',
   photoWidth:canvas.width,photoHeight:canvas.height};
}