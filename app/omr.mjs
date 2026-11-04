/** ChấmPro OMR — four registration squares and PDF-derived layouts.
 * OpenCV.js required; no upload, no background network request. */
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const len=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function detectMarkers(gray,cv) {
 const w=gray.cols,h=gray.rows;
 if(Math.min(w,h)<450)throw Error('Ảnh quá nhỏ; hãy lại gần một chút hoặc bật độ phân giải cao');
 let blurred=new cv.Mat(),bw=new cv.Mat(),contours=new cv.MatVector(),hier=new cv.Mat();
 try {
  cv.GaussianBlur(gray,blurred,new cv.Size(3,3),0);
  cv.threshold(blurred,bw,0,255,cv.THRESH_BINARY_INV+cv.THRESH_OTSU);
  cv.findContours(bw,contours,hier,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
  const a=[];
  for(let i=0;i<contours.size();i++){
   const contour=contours.get(i);
   try {
    const r=cv.boundingRect(contour),area=cv.contourArea(contour);
    if(r.width<Math.max(7,w*.006)||r.height<Math.max(7,h*.006))continue;
    if(r.width>Math.min(w,h)*.08||r.height>Math.min(w,h)*.08)continue;
    if(r.width/r.height<.63||r.width/r.height>1.58)continue;
    if(area/(r.width*r.height)<.69||area<w*h*.000018)continue;
    a.push([r.x+r.width/2,r.y+r.height/2,area]);
   }finally{contour.delete();}
  }
  if(a.length<4)throw Error('Chưa tìm đủ 4 ô vuông đen (đã thấy '+a.length+')');
  const pool=[
   [...a].sort((x,y)=>x[0]+x[1]-y[0]-y[1]).slice(0,8),
   [...a].sort((x,y)=>y[0]-y[1]-x[0]+x[1]).slice(0,8),
   [...a].sort((x,y)=>y[0]+y[1]-x[0]-x[1]).slice(0,8),
   [...a].sort((x,y)=>x[0]-x[1]-y[0]+y[1]).slice(0,8)
  ];
  let best=null,bestScore=-Infinity;
  for(const tl of pool[0])for(const tr of pool[1])for(const br of pool[2])for(const bl of pool[3]){
   if(tr[0]<=tl[0]||br[1]<=tr[1]||bl[0]>=br[0]||bl[1]<=tl[1])continue;
   const p=[tl,tr,br,bl],widths=[len(tl,tr),len(br,bl)],heights=[len(tl,bl),len(tr,br)];
   const area=Math.abs(cross([tr[0]-tl[0],tr[1]-tl[1]],[bl[0]-tl[0],bl[1]-tl[1]]));
   if(area<w*h*.11||Math.min(...widths)<w*.30||Math.min(...heights)<h*.36)continue;
   const aspect=((widths[0]+widths[1])/2)/((heights[0]+heights[1])/2);
   if(aspect<.35||aspect>1.05)continue;
   const shape=(Math.min(...widths)/Math.max(...widths))*(Math.min(...heights)/Math.max(...heights));
   if(shape<.5)continue;
   if(cross([tr[0]-tl[0],tr[1]-tl[1]],[br[0]-tr[0],br[1]-tr[1]])<=0)continue;
   const sizes=p.map(x=>x[2]);const consistency=Math.min(...sizes)/Math.max(...sizes);
   if(consistency<.17)continue;
   const score=area/(w*h)*8+shape+consistency;
   if(score>bestScore){bestScore=score;best=p.map(x=>[x[0],x[1]]);}
  }
  if(!best)throw Error('Đã thấy hình vuông, nhưng hình học phiếu chưa hợp lệ. Hãy giữ phẳng cả tờ giấy.');
  return best;
 } finally {blurred.delete();bw.delete();contours.delete();hier.delete();}
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
export function readSheet(canvas,layout,cv){
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
  const I=(layout.parts.I||[]).map((g,i)=>{const c=choose(warped,g,scale,'ABCD');if(c.status==='unclear')uncertain.push('Phần I câu '+(i+1));return c.value;});
  const II=(layout.parts.II||[]).map((question,i)=>question.map((g,j)=>{const c=choose(warped,g,scale,'ĐS');if(c.status==='unclear')uncertain.push(`Phần II câu ${i+1}${'abcd'[j]}`);return c.value||' ';}).join(''));
  const III=(layout.parts.III||[]).map((question,i)=>question.map((g,j)=>{const c=choose(warped,g,scale,'.,0123456789');if(c.status==='unclear')uncertain.push(`Phần III câu ${i+1}, cột ${j+1}`);return c.value||' ';}).join('').trim());
  const totalColumns=layout.candidate_no.length+layout.exam_code.length;
  const confidence=clamp((idOk/Math.max(1,totalColumns))*(uncertain.length?0.7:1),0,1);
  return {sbd,examCode,I,II,III,confidence,uncertain,markers:marks,form:layout.mode,photoWidth:gray.cols,photoHeight:gray.rows};
 }finally{
  for(const m of [src,gray,warped,M,srcPts,dstPts])if(m){m.delete();}
 }
}