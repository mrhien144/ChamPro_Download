/** ChấmPro Canvas OMR — no OpenCV or WebAssembly. No image uploads. */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
function pixelFrame(canvas){
 const ratio=Math.min(1,900/Math.max(canvas.width,canvas.height));
 const w=Math.max(1,Math.round(canvas.width*ratio)),h=Math.max(1,Math.round(canvas.height*ratio));
 const out=document.createElement('canvas');out.width=w;out.height=h;
 const ctx=out.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,w,h);
 const rgba=ctx.getImageData(0,0,w,h).data,gray=new Uint8Array(w*h);
 for(let i=0,j=0;j<gray.length;i+=4,j++)gray[j]=(rgba[i]*77+rgba[i+1]*150+rgba[i+2]*29)>>8;
 return {gray,w,h,sx:canvas.width/w,sy:canvas.height/h};
}
function otsu(g){
 const hist=new Uint32Array(256);for(let i=0;i<g.length;i++)hist[g[i]]++;
 let sum=0;for(let k=0;k<256;k++)sum+=k*hist[k];
 let w0=0,s0=0,max=-1,threshold=128;
 for(let t=0;t<255;t++){
  w0+=hist[t];s0+=t*hist[t];const w1=g.length-w0;if(!w0||!w1)continue;
  const diff=s0/w0-(sum-s0)/w1,score=w0*w1*diff*diff;
  if(score>max){max=score;threshold=t;}
 }
 return clamp(threshold+7,48,190);
}
function candidateSquares(g,w,h,local){
 const n=w*h,mask=new Uint8Array(n),visited=new Uint8Array(n);
 if(local){
  const stride=w+1,integral=new Uint32Array(stride*(h+1));
  for(let y=0;y<h;y++){
   let run=0;for(let x=0;x<w;x++){run+=g[y*w+x];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+run;}
  }
  const radius=19;
  for(let y=0;y<h;y++){
   const top=Math.max(0,y-radius),bottom=Math.min(h-1,y+radius);
   for(let x=0;x<w;x++){
    const left=Math.max(0,x-radius),right=Math.min(w-1,x+radius);
    const sum=integral[(bottom+1)*stride+right+1]-integral[top*stride+right+1]-integral[(bottom+1)*stride+left]+integral[top*stride+left];
    const average=sum/((bottom-top+1)*(right-left+1));
    const j=y*w+x;mask[j]=g[j]<Math.min(190,average-30)?1:0;
   }
  }
 }else{
  const threshold=otsu(g);for(let i=0;i<n;i++)mask[i]=g[i]<threshold?1:0;
 }
 const queue=new Int32Array(n),squares=[],minSide=Math.max(5,Math.floor(Math.min(w,h)*.006)),maxSide=Math.min(w,h)*.095,minArea=Math.max(18,n*.000025);
 for(let start=0;start<n;start++){
  if(!mask[start]||visited[start])continue;
  visited[start]=1;let head=0,tail=1;queue[0]=start;
  let xmin=w,xmax=0,ymin=h,ymax=0;
  while(head<tail){
   const i=queue[head++],x=i%w,y=(i/w)|0;
   if(x<xmin)xmin=x;if(x>xmax)xmax=x;if(y<ymin)ymin=y;if(y>ymax)ymax=y;
   const left=x>0?i-1:-1,right=x<w-1?i+1:-1,up=y>0?i-w:-1,down=y<h-1?i+w:-1;
   for(const q of [left,right,up,down]){if(q>=0&&mask[q]&&!visited[q]){visited[q]=1;queue[tail++]=q;}}
  }
  const width=xmax-xmin+1,height=ymax-ymin+1;
  if(tail<minArea||width<minSide||height<minSide||width>maxSide||height>maxSide)continue;
  const aspect=width/height,density=tail/(width*height);
  if(aspect<.67||aspect>1.49||density<.67)continue;
  squares.push([(xmin+xmax)/2,(ymin+ymax)/2,tail]);
 }
 return squares;
}
function quadFrom(a,w,h){
 if(a.length<4)return null;
 const prominent=a.sort((x,y)=>y[2]-x[2]).slice(0,90);
 const pool=[
  [...prominent].sort((x,y)=>x[0]+x[1]-y[0]-y[1]).slice(0,11),
  [...prominent].sort((x,y)=>(y[0]-y[1])-(x[0]-x[1])).slice(0,11),
  [...prominent].sort((x,y)=>y[0]+y[1]-x[0]-x[1]).slice(0,11),
  [...prominent].sort((x,y)=>(x[0]-x[1])-(y[0]-y[1])).slice(0,11)
 ];
 let best=null,bestScore=-Infinity,bestConsistency=0;
 for(const tl of pool[0])for(const tr of pool[1])for(const br of pool[2])for(const bl of pool[3]){
  if(tl===tr||tr===br||br===bl||tl===bl||tl===br||tr===bl)continue;
  if(tr[0]<=tl[0]||br[1]<=tr[1]||bl[0]>=br[0]||bl[1]<=tl[1])continue;
  const widths=[len(tl,tr),len(br,bl)],heights=[len(tl,bl),len(tr,br)];
  const area=Math.abs(cross([tr[0]-tl[0],tr[1]-tl[1]],[bl[0]-tl[0],bl[1]-tl[1]]));
  if(area<w*h*.10||Math.min(...widths)<w*.30||Math.min(...heights)<h*.37)continue;
  const aspect=(widths[0]+widths[1])/(heights[0]+heights[1]);
  // The four outer marks form an A4 portrait fiducial rectangle (~0.689).
  // Near-square or landscape quads are usually interior blocks, not the sheet.
  if(aspect<.50||aspect>.86)continue;
  const shape=(Math.min(...widths)/Math.max(...widths))*(Math.min(...heights)/Math.max(...heights));
  const sizes=[tl[2],tr[2],br[2],bl[2]],consistency=Math.min(...sizes)/Math.max(...sizes);
  if(shape<.45||consistency<.20)continue;
  const turn=cross([tr[0]-tl[0],tr[1]-tl[1]],[br[0]-tr[0],br[1]-tr[1]]);
  if(turn<=0)continue;
  const fit=Math.max(0,1-Math.abs(aspect-.689)/.689);
  const score=area/(w*h)*8+shape*2+consistency*2+fit*2+Math.log1p(Math.min(...sizes))/12;
  if(score>bestScore){bestScore=score;bestConsistency=consistency;best=[tl,tr,br,bl].map(p=>[p[0],p[1]]);}
 }
 return best?{points:best,score:bestScore,consistency:bestConsistency}:null;
}
function linearSolve(matrix,vector){
 const n=vector.length,a=matrix.map((row,i)=>[...row,vector[i]]);
 for(let i=0;i<n;i++){
  let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[pivot][i]))pivot=j;
  if(Math.abs(a[pivot][i])<1e-9)throw Error('Mốc phiếu không xác định được phép chiếu');
  [a[i],a[pivot]]=[a[pivot],a[i]];const base=a[i][i];
  for(let k=i;k<=n;k++)a[i][k]/=base;
  for(let j=0;j<n;j++){if(j===i)continue;const factor=a[j][i];for(let k=i;k<=n;k++)a[j][k]-=factor*a[i][k];}
 }
 return a.map(row=>row[n]);
}
function projector(layout,markers){
 const rows=[],values=[];
 layout.markers.forEach(([x,y],i)=>{
  const [u,v]=markers[i];
  rows.push([x,y,1,0,0,0,-x*u,-y*u]);values.push(u);
  rows.push([0,0,0,x,y,1,-x*v,-y*v]);values.push(v);
 });
 const m=linearSolve(rows,values);
 return (x,y)=>{const d=m[6]*x+m[7]*y+1;return [(m[0]*x+m[1]*y+m[2])/d,(m[3]*x+m[4]*y+m[5])/d]};
}
function innerInk(frame,map,point){
 const sample=(dx,dy)=>{
  const [x,y]=map(point[0]+dx,point[1]+dy),ix=Math.round(x),iy=Math.round(y);
  if(ix<0||iy<0||ix>=frame.w||iy>=frame.h)return null;
  return frame.gray[iy*frame.w+ix];
 };
 let sum=0,count=0;
 for(const dy of [-1.2,0,1.2])for(const dx of [-1.2,0,1.2]){
  const value=sample(dx,dy);if(value!==null){sum+=value;count++;}
 }
 if(!count)return 0;
 const backgrounds=[[5,0],[-5,0],[0,5],[0,-5],[4,4],[-4,-4],[4,-4],[-4,4]]
  .map(([dx,dy])=>sample(dx,dy)).filter(v=>v!==null).sort((a,b)=>a-b);
 const bg=backgrounds.length?backgrounds[Math.floor(backgrounds.length/2)]:255;
 return Math.max(0,(bg-sum/count)/255);
}
function choice(frame,map,points,alphabet){
 const ink=points.map(point=>innerInk(frame,map,point));
 const ranks=ink.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]);
 if(!ranks.length)return {value:'',status:'blank'};
 if(ranks[0][0]<.19)return {value:'',status:'blank'};
 if(ranks.length>1&&ranks[0][0]-ranks[1][0]<.10)return {value:'?',status:'unclear'};
 return {value:alphabet[ranks[0][1]],status:'ok'};
}
export function readSheet(canvas,layout,_unused=null,counts=null){
 if(!layout?.markers||!layout?.candidate_no||!layout?.exam_code)throw Error('Chưa có tọa độ phiếu hợp lệ');
 const frame=pixelFrame(canvas),{gray,w,h}=frame;
 if(Math.min(w,h)<350)throw Error('Ảnh quá nhỏ hoặc quá xa');
 // Global threshold can mistake a small interior square for a fiducial.
 // If that geometry looks weak, compare the locally thresholded candidate.
 const global=quadFrom(candidateSquares(gray,w,h,false),w,h);
 const tryLocal=!global||global.consistency<.68||global.score<10.4;
 const local=tryLocal?quadFrom(candidateSquares(gray,w,h,true),w,h):null;
 const chosen=!global?local:!local?global:(local.score>global.score?local:global);
 if(!chosen)throw Error('Không tìm đủ 4 ô vuông đen ngoài cùng trên phiếu');
 const markers=chosen.points,markerMode=(chosen===local?'local':'global');
 const map=projector(layout,markers);
 const uncertain=[];let idOk=0;
 function series(groups,alphabet,region){return groups.map((g,i)=>{
  const c=choice(frame,map,g,alphabet);if(c.status==='unclear')uncertain.push(region+' '+(i+1));
  if(c.status==='ok')idOk++;return c.value;
 });}
 const sbd=series(layout.candidate_no,'0123456789','SBD').join('');
 const examCode=series(layout.exam_code,'0123456789','Mã đề').join('');
 const part=layout.parts||{};
 const I=(part.I||[]).slice(0,Math.max(0,counts?.I??(part.I||[]).length)).map((g,i)=>{
  const c=choice(frame,map,g,'ABCD');if(c.status==='unclear')uncertain.push('Phần I câu '+(i+1));return c.value;
 });
 const II=(part.II||[]).slice(0,Math.max(0,counts?.II??(part.II||[]).length)).map((q,i)=>q.map((g,j)=>{
  const c=choice(frame,map,g,'ĐS');if(c.status==='unclear')uncertain.push('Phần II câu '+(i+1)+'abcd'[j]);return c.value||' ';
 }).join(''));
 const III=(part.III||[]).slice(0,Math.max(0,counts?.III??(part.III||[]).length)).map((q,i)=>q.map((g,j)=>{
  const c=choice(frame,map,g,'.,0123456789');if(c.status==='unclear')uncertain.push('Phần III câu '+(i+1)+', cột '+(j+1));return c.value||' ';
 }).join('').trim());
 const total=layout.candidate_no.length+layout.exam_code.length;
 const codeConfidence=(examCode.length===layout.exam_code.length&&/^\d+$/.test(examCode)&&!uncertain.some(x=>x.startsWith('Mã đề ')))?1:0;
 const confidence=clamp(idOk/Math.max(1,total)*(uncertain.length?.7:1),0,1);
 return {sbd,examCode,I,II,III,confidence,codeConfidence,uncertain,markerMode,markerScore:Number(chosen.score.toFixed(2)),markers:markers.map(([x,y])=>[x*frame.sx,y*frame.sy]),form:layout.mode,photoWidth:canvas.width,photoHeight:canvas.height,engine:'Canvas Native'};
}
