/** ChấmPro diagnostic: image-local calibration of printed SBD and exam-code grids.
 * Pure Canvas; reads no stored students or answers; does not grade or save.
 * The PDF-derived cell locations are treated as approximate, not ground truth.
 */
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function solve(rows,vector){
 const n=vector.length,a=rows.map((r,i)=>[...r,vector[i]]);
 for(let i=0;i<n;i++){
  let pivot=i;for(let j=i+1;j<n;j++)if(Math.abs(a[j][i])>Math.abs(a[pivot][i]))pivot=j;
  if(Math.abs(a[pivot][i])<1e-9)throw Error('Không lập được phép chiếu từ bốn mốc');
  [a[i],a[pivot]]=[a[pivot],a[i]];
  const k=a[i][i];for(let j=i;j<=n;j++)a[i][j]/=k;
  for(let j=0;j<n;j++){if(j===i)continue;const t=a[j][i];for(let v=i;v<=n;v++)a[j][v]-=t*a[i][v];}
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
 const m=solve(rows,values);
 return ([x,y])=>{const d=m[6]*x+m[7]*y+1;return [(m[0]*x+m[1]*y+m[2])/d,(m[3]*x+m[4]*y+m[5])/d];};
}
function prepareFrame(canvas){
 const factor=Math.min(1,900/Math.max(canvas.width,canvas.height)),w=Math.round(canvas.width*factor),h=Math.round(canvas.height*factor);
 const temp=document.createElement('canvas');temp.width=w;temp.height=h;
 const ctx=temp.getContext('2d',{willReadFrequently:true});
 ctx.drawImage(canvas,0,0,w,h);
 const data=ctx.getImageData(0,0,w,h).data,g=new Uint8Array(w*h);
 for(let i=0,j=0;j<g.length;i+=4,j++)g[j]=(77*data[i]+150*data[i+1]+29*data[i+2])>>8;
 return {g,w,h,factor};
}
function median(array){const a=[...array].sort((x,y)=>x-y);return a[Math.floor(a.length/2)]??0;}
function sampleMean(frame,x,y){
 const ix=Math.round(x),iy=Math.round(y),{g,w,h}=frame;
 if(ix<2||iy<2||ix>=w-2||iy>=h-2)return 255;
 let sum=0;
 for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)sum+=g[(iy+dy)*w+ix+dx];
 return sum/9;
}
function ringMap(frame,base,radius,rangeX,rangeY){
 const {g,w,h}=frame,out=new Float32Array(w*h);
 const x0=Math.max(9,Math.floor(Math.min(...base.map(p=>p[0]))+rangeX[0]-12));
 const x1=Math.min(w-10,Math.ceil(Math.max(...base.map(p=>p[0]))+rangeX[1]+12));
 const y0=Math.max(9,Math.floor(Math.min(...base.map(p=>p[1]))+rangeY[0]-12));
 const y1=Math.min(h-10,Math.ceil(Math.max(...base.map(p=>p[1]))+rangeY[1]+12));
 const offsets=[];
 for(let i=0;i<16;i++){
  const a=2*Math.PI*i/16,dx=Math.round(radius*Math.cos(a)),dy=Math.round(radius*Math.sin(a));
  if(!offsets.some(p=>p[0]===dx&&p[1]===dy))offsets.push([dx,dy]);
 }
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
  let ring=0;for(const [dx,dy] of offsets)ring+=g[(y+dy)*w+(x+dx)];
  ring/=offsets.length;
  const center=(g[y*w+x]*4+g[(y-1)*w+x]+g[(y+1)*w+x]+g[y*w+x-1]+g[y*w+x+1])/8;
  out[y*w+x]=Math.max(0,(center-ring)/255);
 }
 return out;
}
function fitGrid(frame,map,group,kind){
 if(!group?.length||!group[0]?.length)return null;
 const points=group.flatMap(row=>row.map(p=>map(p))),origin=map(group[0][0]);
 const stepX=group.length>1?Math.abs(map(group[1][0])[0]-origin[0]):15;
 const stepY=group[0].length>1?Math.abs(map(group[0][1])[1]-origin[1]):15;
 const r=clamp(stepY*.35,3,8);
 const rangeX=kind==='SBD'?[stepX*1.35,stepX*3.1]:[0,stepX*2.2];
 const rangeY=[-stepY*.40,stepY*1.45];
 const ring=ringMap(frame,points,r,rangeX,rangeY),{w,h}=frame;
 const variants=[];
 function evaluate(sx,sy,dx,dy){
  let sum=0,valid=0;
  for(const p of points){
   const x=Math.round(origin[0]+dx+sx*(p[0]-origin[0]));
   const y=Math.round(origin[1]+dy+sy*(p[1]-origin[1]));
   if(x<0||y<0||x>=w||y>=h)continue;
   sum+=ring[y*w+x];valid++;
  }
  return valid===points.length?sum/valid:0;
 }
 let best={score:-1,dx:0,dy:0,sx:1,sy:1};
 for(let sx=.64;sx<=1.081;sx+=.055)
  for(let sy=.82;sy<=1.081;sy+=.04)
   for(let dx=rangeX[0];dx<=rangeX[1];dx+=2.6)
    for(let dy=rangeY[0];dy<=rangeY[1];dy+=2.6){
     const score=evaluate(sx,sy,dx,dy);
     if(score>best.score)best={sx,sy,dx,dy,score};
    }
 // Refine to sub-cell accuracy after coarse search.
 const coarse=best;
 for(let sx=coarse.sx-.04;sx<=coarse.sx+.041;sx+=.02)
  for(let sy=coarse.sy-.03;sy<=coarse.sy+.031;sy+=.02)
   for(let dx=coarse.dx-2;dx<=coarse.dx+2.01;dx+=1)
    for(let dy=coarse.dy-2;dy<=coarse.dy+2.01;dy+=1){
     const score=evaluate(sx,sy,dx,dy);
     if(score>best.score)best={sx,sy,dx,dy,score};
    }
 const rawScore=evaluate(1,1,0,0);
 const corrected=group.map(row=>row.map(p=>{
  const [x,y]=map(p);
  return [origin[0]+best.dx+best.sx*(x-origin[0]),origin[1]+best.dy+best.sy*(y-origin[1])];
 }));
 const inks=corrected.map(row=>row.map(([x,y])=>255-sampleMean(frame,x,y)));
 const alphabet='0123456789';
 const vals=inks.map(col=>{
  const sorted=col.map((v,i)=>({ink:v,i})).sort((a,b)=>b.ink-a.ink);
  const baseline=median(col),strength=(sorted[0].ink-baseline)/255,margin=(sorted[0].ink-(sorted[1]?.ink??0))/255;
  const confidence=strength>=.052&&margin>=.040;
  return {value:confidence?alphabet[sorted[0].i]:'?',strength:Number(strength.toFixed(3)),margin:Number(margin.toFixed(3)),index:sorted[0].i};
 });
 const plausible=best.score>=.075&&best.score>=rawScore+.025;
 return {value:plausible?vals.map(x=>x.value).join(''):'?',plausible,fitScore:Number(best.score.toFixed(3)),rawScore:Number(rawScore.toFixed(3)),
  parameters:Object.fromEntries(['sx','sy','dx','dy'].map(k=>[k,Number(best[k].toFixed(2))])),
  cells:corrected.map(row=>row.map(([x,y])=>[x/frame.factor,y/frame.factor])),characters:vals};
}
export function calibrateIdentity(canvas,layout,outerMarkers){
 const frame=prepareFrame(canvas),markers=outerMarkers.map(([x,y])=>[x*frame.factor,y*frame.factor]),map=projector(layout,markers);
 return {sbd:fitGrid(frame,map,layout.candidate_no,'SBD'),code:fitGrid(frame,map,layout.exam_code,'CODE')};
}
