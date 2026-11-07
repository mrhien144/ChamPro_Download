/**
 * Diagnostic-only grid alignment for part II and part III, R11 guarded.
 * Independently fits the printed circular outlines in EACH question block.
 * No database access, no grading, no changes to the production reader.
 */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function homography(layout,marks){
 const A=[],b=[];
 for(let i=0;i<4;i++){
  const [x,y]=layout.markers[i],[u,v]=marks[i];
  A.push([x,y,1,0,0,0,-x*u,-y*u]);b.push(u);
  A.push([0,0,0,x,y,1,-x*v,-y*v]);b.push(v);
 }
 for(let i=0;i<8;i++){
  let pivot=i;for(let j=i+1;j<8;j++)if(Math.abs(A[j][i])>Math.abs(A[pivot][i]))pivot=j;
  if(Math.abs(A[pivot][i])<1e-8)throw Error('Bốn mốc không xác định được phép chiếu');
  [A[i],A[pivot]]=[A[pivot],A[i]];[b[i],b[pivot]]=[b[pivot],b[i]];
  const n=A[i][i];for(let k=i;k<8;k++)A[i][k]/=n;b[i]/=n;
  for(let j=0;j<8;j++)if(j!==i){const m=A[j][i];for(let k=i;k<8;k++)A[j][k]-=m*A[i][k];b[j]-=m*b[i];}
 }
 return ([x,y])=>{const d=b[6]*x+b[7]*y+1;return [(b[0]*x+b[1]*y+b[2])/d,(b[3]*x+b[4]*y+b[5])/d];};
}
function prepare(canvas){
 const ratio=Math.min(1,900/Math.max(canvas.width,canvas.height));
 const w=Math.round(canvas.width*ratio),h=Math.round(canvas.height*ratio);
 const surface=document.createElement('canvas');surface.width=w;surface.height=h;
 const ctx=surface.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,w,h);
 const rgba=ctx.getImageData(0,0,w,h).data,g=new Uint8Array(w*h);
 for(let j=0,i=0;j<g.length;j++,i+=4)g[j]=(77*rgba[i]+150*rgba[i+1]+29*rgba[i+2])>>8;
 return {g,w,h,ratio};
}
function median(v){const a=[...v].sort((a,b)=>a-b);return a[Math.floor(a.length/2)]??0;}
function avgAt(f,x,y){
 const cx=Math.round(x),cy=Math.round(y),{w,h,g}=f;
 if(cx<2||cy<2||cx>=w-2||cy>=h-2)return 255;
 let sum=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)sum+=g[(cy+j)*w+cx+i];
 return sum/9;
}
function ringAt(f,x,y,r){
 // Dark printed circles have a bright center and a dark circumference.
 let ring=0;
 for(let k=0;k<12;k++){
  const a=k*Math.PI/6;
  ring+=avgAt(f,x+Math.cos(a)*r,y+Math.sin(a)*r);
 }
 return avgAt(f,x,y)-ring/12;
}
function gridPoints(group,project){
 return group.map(row=>row.map(p=>project(p)));
}
function at(f,grid,sx,sy,dx,dy){
 const anchor=grid[0][0],result=[];
 for(const row of grid)result.push(row.map(p=>[anchor[0]+dx+sx*(p[0]-anchor[0]),anchor[1]+dy+sy*(p[1]-anchor[1])]));
 return result;
}
function fit(f,original,part){
 const group=original,raw=group.flat(),stepY=group[0].length>=2?Math.abs(group[0][1][1]-group[0][0][1]):13;
 const verticalStep=group.length>1?Math.abs(group[1][0][1]-group[0][0][1]):stepY;
 const radius=clamp((verticalStep||stepY)*.35,3.4,6.3);
 const evalGrid=(g)=>{
  let sum=0,count=0;const strengths=[];
  for(const row of g)for(const [x,y] of row){
   const ring=ringAt(f,x,y,radius);
   const bg=median([[radius+3,0],[-radius-3,0],[0,radius+3],[0,-radius-3],
    [radius+3,radius+3],[-radius-3,-radius-3]].map(([dx,dy])=>avgAt(f,x+dx,y+dy)));
   const fill=bg-avgAt(f,x,y);
   const strength=Math.max(0,ring,.72*fill);
   strengths.push(strength);
   if(Number.isFinite(strength)){sum+=strength;count++;}
  }
  // Most circles are empty, so seek dark circular outlines, not filled centers.
  const score=count?sum/count:0;
  return score;
 };
 const initialScore=evalGrid(group),candidate={dx:0,dy:0,sx:1,sy:1,score:initialScore};
 let best={...candidate,quality:initialScore};
 for(const sx of [.88,.94,1,1.06])for(const sy of [.88,.94,1,1.06])
  for(let dy=-9;dy<=9;dy+=3)for(let dx=-9;dx<=9;dx+=3){
   const g=at(f,group,sx,sy,dx,dy),score=evalGrid(g);
   const quality=score-Math.hypot(dx,dy)*.13-Math.abs(sx-1)*2-Math.abs(sy-1)*2;
   if(quality>best.quality){best={dx,dy,sx,sy,score,quality};}
  }
 const coarse={...best};
 for(let dy=coarse.dy-2;dy<=coarse.dy+2;dy++)
  for(let dx=coarse.dx-2;dx<=coarse.dx+2;dx++){
   const score=evalGrid(at(f,group,coarse.sx,coarse.sy,dx,dy));
   const quality=score-Math.hypot(dx,dy)*.13-Math.abs(coarse.sx-1)*2-Math.abs(coarse.sy-1)*2;
   if(quality>best.quality)best={...coarse,dx,dy,score,quality};
  }
 const grid=at(f,group,best.sx,best.sy,best.dx,best.dy);
 return {grid,initialScore:Number(initialScore.toFixed(2)),alignedScore:Number(best.score.toFixed(2)),
  dx:best.dx,dy:best.dy,sx:best.sx,sy:best.sy,gain:Number((best.score-initialScore).toFixed(2))};
}
function pick(f,pts,alphabet,type){
 const values=pts.map(([x,y])=>{
  const center=avgAt(f,x,y);
  const bg=median([[8,0],[-8,0],[0,8],[0,-8],[7,7],[-7,7],[7,-7],[-7,-7]].map(([dx,dy])=>avgAt(f,x+dx,y+dy)));
  return {center,contrast:bg-center};
 });
 const ranks=values.map((v,i)=>({...v,i})).sort((a,b)=>b.contrast-a.contrast);
 const top=ranks[0]||{contrast:-999,center:255,i:0},second=ranks[1]||{contrast:-999};
 const diff=top.contrast-second.contrast;
 const strong=top.contrast>=24&&diff>=17&&top.center<195;
 const plausibleBlank=type==='III'&&top.contrast<14&&values.every(v=>v.center>122);
 return {value:strong?alphabet[top.i]:plausibleBlank?'·':'?',status:strong?'filled':plausibleBlank?'blank':'unclear',
  topContrast:Number(top.contrast.toFixed(1)),margin:Number(diff.toFixed(1))};
}
export function inspectSubgrids(canvas,layout,markers,counts={I:18,II:4,III:6}){
 const f=prepare(canvas),map=homography(layout,markers.map(([x,y])=>[x*f.ratio,y*f.ratio]));
 const res={II:[],III:[],summary:{},points:{II:[],III:[]}};
 const parts=[['II',counts.II,'ĐS'],['III',counts.III,'-,0123456789']];
 for(const [part,count,alphabet] of parts){
  let blanks=0,unclear=0,filled=0;
  for(let i=0;i<Math.min(count,layout.parts[part].length);i++){
   const original=gridPoints(layout.parts[part][i],map),cal=fit(f,original,part);
   const before=original.map(row=>pick(f,row,alphabet,part));
   const after=cal.grid.map(row=>pick(f,row,alphabet,part));
   const cells=before.map((b,j)=>{
    const a=after[j];
    if(a.status==='filled'&&b.status==='filled'&&a.value!==b.value)
     return {value:'?',status:'unclear',topContrast:a.topContrast,margin:a.margin,source:'conflict'};
    if(a.status==='filled'&&b.status==='filled'&&a.value===b.value)
     return {...a,source:'agreement'};
    if(b.status==='filled'&&a.status!=='filled')
     return {...b,source:'original'};
    if(a.status==='filled'&&b.status==='unclear'&&cal.gain>2&&a.topContrast>=39&&a.margin>=27)
     return {...a,source:'aligned'};
    if(b.status==='blank'&&a.status==='blank')
     return {...b,source:'agreement'};
    if(b.status==='blank'&&a.status==='filled')
     return {value:'?',status:'unclear',topContrast:a.topContrast,margin:a.margin,source:'conflict'};
    if(b.status==='blank'&&a.status==='unclear')
     return {...b,source:'original'};
    return {...b,source:'original'};
   });
   blanks+=cells.filter(x=>x.status==='blank').length;
   unclear+=cells.filter(x=>x.status==='unclear').length;
   filled+=cells.filter(x=>x.status==='filled').length;
   res[part].push({question:i+1,value:cells.map(x=>x.value).join(''),statuses:cells.map(x=>x.status),
    scoreBefore:cal.initialScore,scoreAfter:cal.alignedScore,gain:cal.gain,
    original:before.map(x=>x.value).join(''),aligned:after.map(x=>x.value).join(''),
    cellSources:cells.map(x=>x.source||'original'),
    shift:[cal.dx,cal.dy],scale:[cal.sx,cal.sy],strengths:cells.map(x=>[x.topContrast,x.margin])});
   res.points[part].push(cal.grid.map((row,j)=>row.map(([x,y],k)=>{
    const useNew=['agreement','aligned'].includes(cells[j]?.source);
    const [px,py]=useNew?[x,y]:original[j][k];
    return [px/f.ratio,py/f.ratio];
   })));
  }
  res.summary[part]={filled,blank:blanks,unclear};
 }
 return res;
}
