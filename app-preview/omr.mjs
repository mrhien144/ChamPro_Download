/** ChấmPro OMR — four registration squares and PDF-derived layouts.
 * OpenCV.js required; no upload, no background network request. */
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function detectMarkers(gray,cv) {
 const w=gray.cols,h=gray.rows;
 if(Math.min(w,h)<450)throw Error('Ảnh quá nhỏ; hãy lại gần một chút hoặc bật độ phân giải cao');
 const blurred=new cv.Mat(),bw=new cv.Mat(),contours=new cv.MatVector(),hier=new cv.Mat();
 try {
  cv.GaussianBlur(gray,blurred,new cv.Size(3,3),0);
  let best=null,bestScore=-Infinity,bestCount=0;
  // Both global and local thresholds are necessary for dim rooms and
  // non-uniform illumination across a large paper sheet.
  for(const mode of ['global','local']){
   if(mode==='global')cv.threshold(blurred,bw,0,255,cv.THRESH_BINARY_INV+cv.THRESH_OTSU);
   else cv.adaptiveThreshold(blurred,bw,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY_INV,35,11);
   cv.findContours(bw,contours,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
   const a=[];
   for(let i=0;i<contours.size();i++){
    const contour=contours.get(i);
    try{
     const r=cv.boundingRect(contour),area=cv.contourArea(contour),box=r.width*r.height;
     if(r.width<Math.max(6,w*.004)||r.height<Math.max(6,h*.004))continue;
     if(r.width>Math.min(w,h)*.10||r.height>Math.min(w,h)*.10)continue;
     if(r.width/r.height<.68||r.width/r.height>1.47)continue;
     if(area/box<.66||area<w*h*.000012)continue;
     a.push([r.x+r.width/2,r.y+r.height/2,area]);
    }finally{contour.delete();}
   }
   bestCount=Math.max(bestCount,a.length);
   if(a.length<4)continue;
   const prominent=a.sort((x,y)=>y[2]-x[2]).slice(0,100);
   const pool=[
    [...prominent].sort((x,y)=>x[0]+x[1]-y[0]-y[1]).slice(0,12),
    [...prominent].sort((x,y)=>(y[0]-y[1])-(x[0]-x[1])).slice(0,12),
    [...prominent].sort((x,y)=>y[0]+y[1]-x[0]-x[1]).slice(0,12),
    [...prominent].sort((x,y)=>(x[0]-x[1])-(y[0]-y[1])).slice(0,12)
   ];
   for(const tl of pool[0])for(const tr of pool[1])for(const br of pool[2])for(const bl of pool[3]){
    if(tl===tr||tl===br||tl===bl||tr===br||tr===bl||br===bl)continue;
    if(tr[0]<=tl[0]||br[1]<=tr[1]||bl[0]>=br[0]||bl[1]<=tl[1])continue;
    const widths=[len(tl,tr),len(br,bl)],heights=[len(tl,bl),len(tr,br)];
    const area=Math.abs(cross([tr[0]-tl[0],tr[1]-tl[1]],[bl[0]-tl[0],bl[1]-tl[1]]));
    if(area<w*h*.12||Math.min(...widths)<w*.36||Math.min(...heights)<h*.40)continue;
    const aspect=((widths[0]+widths[1])/2)/((heights[0]+heights[1])/2);
    if(aspect<.42||aspect>1.02)continue;
    const shape=Math.min(...widths)/Math.max(...widths)*Math.min(...heights)/Math.max(...heights);
    if(shape<.48)continue;
    if(cross([tr[0]-tl[0],tr[1]-tl[1]],[br[0]-tr[0],br[1]-tr[1]])<=0)continue;
    const sizes=[tl[2],tr[2],br[2],bl[2]];
    const consistency=Math.min(...sizes)/Math.max(...sizes);
    if(consistency<.22)continue;
    const aspectFit=Math.max(0,1-Math.abs(aspect-.689)/.689);
    const score=area/(w*h)*7+shape*2+consistency*2+aspectFit*2+Math.log1p(Math.min(...sizes))/12;
    if(score>bestScore){bestScore=score;best=[tl,tr,br,bl].map(p=>[p[0],p[1]]);}
   }
  }
  if(!best)throw Error('Chưa xác định được 4 mốc ngoài phiếu (phát hiện '+bestCount+' hình vuông). Giữ đủ cả bốn góc trong khung.');
  return best;
 }finally{blurred.delete();bw.delete();contours.delete();hier.delete();}
}
function innerInk(warped,pt,scale){
 const x=Math.round(pt[0]*scale),y=Math.round(pt[1]*scale),r=Math.max(2,Math.round(1.6*scale));
 if(x-r<0||y-r<0||x+r>=warped.cols||y+r>=warped.rows)return 0;
 let count=0,sum=0;const d=warped.data,width=warped.cols;
 for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
  if(dx*dx+dy*dy>r*r)continue;
  sum+=255-d[(y+dy)*width+(x+dx)];count++;
 }
 return sum/(255*Math.max(1,count));
}
function choose(warped,points,scale,alphabet){
 const ink=points.map(pt=>innerInk(warped,pt,scale));
 const sorted=ink.map((v,i)=>[v,i]).sort((a,b)=>b[0]-a[0]);
 if(sorted[0][0]<.22)return {value:'',status:'blank',ink};
 if(sorted.length>1&&sorted[0][0]-sorted[1][0]<.12)return {value:'?',status:'unclear',ink};
 return {value:alphabet[sorted[0][1]],status:'ok',ink};
}
export function readSheet(canvas,layout,cv,counts=null){
 if(!cv?.Mat)throw Error('Bộ xử lý OpenCV chưa tải xong; kiểm tra kết nối mạng');
 let src=null,gray=null,warped=null,M=null,srcPts=null,dstPts=null;
 try{
  src=cv.imread(canvas);gray=new cv.Mat();cv.cvtColor(src,gray,cv.COLOR_RGBA2GRAY);
  const marks=detectMarkers(gray,cv);const scale=1.65;
  srcPts=cv.matFromArray(4,1,cv.CV_32FC2,marks.flat());
  dstPts=cv.matFromArray(4,1,cv.CV_32FC2,layout.markers.flat().map(v=>v*scale));
  M=cv.getPerspectiveTransform(srcPts,dstPts);
  warped=new cv.Mat();cv.warpPerspective(gray,warped,M,new cv.Size(Math.round(layout.page_size[0]*scale),Math.round(layout.page_size[1]*scale)),cv.INTER_LINEAR,cv.BORDER_CONSTANT,new cv.Scalar(255));
  const uncertain=[];let idOk=0;
  function series(groups,alphabet,region){return groups.map((g,i)=>{const c=choose(warped,g,scale,alphabet);if(c.status==='unclear')uncertain.push(`${region} ${i+1}`);if(c.status==='ok')idOk++;return c.value;});}
  const sbd=series(layout.candidate_no,'0123456789','SBD').join('');
  const examCode=series(layout.exam_code,'0123456789','Mã đề').join('');
  const I=(layout.parts.I||[]).slice(0,Math.max(0,counts?.I??(layout.parts.I||[]).length)).map((g,i)=>{const c=choose(warped,g,scale,'ABCD');if(c.status==='unclear')uncertain.push('Phần I câu '+(i+1));return c.value;});
  const II=(layout.parts.II||[]).slice(0,Math.max(0,counts?.II??(layout.parts.II||[]).length)).map((question,i)=>question.map((g,j)=>{const c=choose(warped,g,scale,'ĐS');if(c.status==='unclear')uncertain.push(`Phần II câu ${i+1}${'abcd'[j]}`);return c.value||' ';}).join(''));
  const III=(layout.parts.III||[]).slice(0,Math.max(0,counts?.III??(layout.parts.III||[]).length)).map((question,i)=>question.map((g,j)=>{const c=choose(warped,g,scale,'.,0123456789');if(c.status==='unclear')uncertain.push(`Phần III câu ${i+1}, cột ${j+1}`);return c.value||' ';}).join('').trim());
  const totalColumns=layout.candidate_no.length+layout.exam_code.length;
  const confidence=clamp((idOk/Math.max(1,totalColumns))*(uncertain.length?0.7:1),0,1);
  return {sbd,examCode,I,II,III,confidence,uncertain,markers:marks,form:layout.mode,photoWidth:gray.cols,photoHeight:gray.rows};
 }finally{
  for(const m of [src,gray,warped,M,srcPts,dstPts])if(m){m.delete();}
 }
}