/**
 * Diagnostic only: read ink contrast at the centre of printed bubbles.
 * No answer keys, no student records, no storage, no grading.
 */
function solve(rows,values){
 const a=rows.map((row,i)=>[...row,values[i]]),n=values.length;
 for(let i=0;i<n;i++){
  let p=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[p][i]))p=j;
  if(Math.abs(a[p][i])<1e-9)throw Error('Không xác định được phép chiếu');
  [a[i],a[p]]=[a[p],a[i]];
  const t=a[i][i];for(let k=i;k<=n;k++)a[i][k]/=t;
  for(let j=0;j<n;j++)if(j!==i){const q=a[j][i];for(let k=i;k<=n;k++)a[j][k]-=q*a[i][k];}
 }
 return a.map(r=>r[n]);
}
function projector(layout,marks){
 const rows=[],v=[];
 layout.markers.forEach(([x,y],i)=>{
  const [u,w]=marks[i];rows.push([x,y,1,0,0,0,-x*u,-y*u]);v.push(u);
  rows.push([0,0,0,x,y,1,-x*w,-y*w]);v.push(w);
 });
 const m=solve(rows,v);
 return ([x,y])=>{
  const div=m[6]*x+m[7]*y+1;
  return [(m[0]*x+m[1]*y+m[2])/div,(m[3]*x+m[4]*y+m[5])/div];
 };
}
function grayFrame(canvas){
 const scale=Math.min(1,900/Math.max(canvas.width,canvas.height));
 const w=Math.round(canvas.width*scale),h=Math.round(canvas.height*scale);
 const temp=document.createElement('canvas');temp.width=w;temp.height=h;
 const ctx=temp.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,w,h);
 const rgba=ctx.getImageData(0,0,w,h).data,g=new Uint8Array(w*h);
 for(let j=0,i=0;j<g.length;j++,i+=4)g[j]=(77*rgba[i]+150*rgba[i+1]+29*rgba[i+2])>>8;
 return {g,w,h,scale};
}
function median(a){const b=[...a].sort((x,y)=>x-y);return b[Math.floor(b.length/2)]??0;}
function sample(g,w,h,x,y){
 const px=Math.round(x),py=Math.round(y);
 if(px<1||py<1||px>=w-1||py>=h-1)return 255;
 let n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)n+=g[(py+dy)*w+px+dx];
 return n/9;
}
function bubble(frame,point){
 const [x,y]=point,{g,w,h}=frame,r=Math.max(7,Math.min(10,Math.round(h/112)));
 const ink=sample(g,w,h,x,y);
 const samples=[[-r,-r],[r,-r],[-r,r],[r,r],[-r-1,0],[r+1,0],[0,-r-1],[0,r+1]].map(([dx,dy])=>sample(g,w,h,x+dx,y+dy));
 return {center:ink,contrast:median(samples)-ink};
}
function select(frame,map,points,alphabet,kind){
 const ink=points.map(p=>bubble(frame,map(p)));
 const contrast=ink.map(v=>v.contrast);
 const rank=contrast.map((v,i)=>({i,v})).sort((a,b)=>b.v-a.v);
 const dark=ink.map((v,i)=>({i,v:v.center})).sort((a,b)=>a.v-b.v);
 const top=rank[0],second=rank[1];
 let winner=null;
 if(kind==='ID'){
  // Printed gridlines can be darker than one actual bubble. Require a marked
  // centre to be distinctly darker than the second option and nearby paper.
  if(top&&top.v>=23&&(top.v-(second?.v??-100))>=19)winner=top.i;
 }else{
  if(top&&top.v>=24&&(top.v-(second?.v??-100))>=17)winner=top.i;
 }
 // Additional ink darkness guard to reject a bright blank circle.
 if(winner!==null&&ink[winner].center>195)winner=null;
 return {value:winner===null?'?':alphabet[winner],contrast:Number((top?.v??0).toFixed(1)),
  margin:Number(((top?.v??0)-(second?.v??0)).toFixed(1)),centers:ink.map(v=>Math.round(v.center))};
}
export function inspectPrintedInk(canvas,layout,outerMarkers,counts={I:18,II:4,III:6}){
 if(!layout?.markers||outerMarkers?.length!==4)throw Error('Không có đủ bốn mốc');
 const f=grayFrame(canvas),small=outerMarkers.map(([x,y])=>[x*f.scale,y*f.scale]);
 const map=projector(layout,small);
 const code=layout.exam_code.map(group=>select(f,map,group,'0123456789','ID'));
 const sbd=layout.candidate_no.map(group=>select(f,map,group,'0123456789','ID'));
 const I=layout.parts.I.slice(0,counts.I).map(group=>select(f,map,group,'ABCD','ANSWER'));
 const II=layout.parts.II.slice(0,counts.II).map(group=>group.map(pts=>select(f,map,pts,'ĐS','ANSWER')));
 const III=layout.parts.III.slice(0,counts.III).map(group=>group.map(pts=>select(f,map,pts,'-,0123456789','ANSWER')));
 const asText=items=>items.map(x=>x.value).join('');
 return {code:asText(code),sbd:asText(sbd),I:asText(I),
  II:II.map(parts=>asText(parts)),III:III.map(parts=>asText(parts)),
  confidence:{code:code.map(x=>({value:x.value,contrast:x.contrast,margin:x.margin})),
    I:I.map((x,i)=>({question:i+1,value:x.value,contrast:x.contrast,margin:x.margin})),
    II:II.map((items,i)=>({question:i+1,values:items.map(x=>x.value)})),
    III:III.map((items,i)=>({question:i+1,values:items.map(x=>x.value)}))},
  unread:{code:code.filter(x=>x.value==='?').length,I:I.filter(x=>x.value==='?').length,
    II:II.flat().filter(x=>x.value==='?').length,
    III:III.flat().filter(x=>x.value==='?').length}};
}
