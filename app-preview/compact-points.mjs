/** ChấmPro point allocation for new exams. No camera, network or data writes. */
export const PART_II_FIXED=Object.freeze([0,0.1,0.25,0.5,1]);
const numeric=value=>{
 const s=String(value??'').trim().replace(',','.');
 if(s==='')return NaN;
 return Number(s);
};
export function allocateExamPoints(form,counts,rawI,rawIII){
 const nI=Number(counts?.I)||0,nII=Number(counts?.II)||0,nIII=Number(counts?.III)||0;
 if(![nI,nII,nIII].every(n=>Number.isInteger(n)&&n>=0))throw Error('Số câu không hợp lệ');
 const totalI=numeric(rawI),totalIII=form==='120'?0:numeric(rawIII);
 if(!Number.isFinite(totalI)||totalI<0||!Number.isFinite(totalIII)||totalIII<0)
  throw Error('Điểm các phần phải là số không âm');
 if((nI===0&&totalI!==0)||(nIII===0&&totalIII!==0))
  throw Error('Phần có 0 câu phải có tổng điểm bằng 0');
 const perI=nI?totalI/nI:0,perIII=nIII?totalIII/nIII:0;
 if(!Number.isFinite(perI)||!Number.isFinite(perIII))
  throw Error('Không thể phân bổ điểm');
 return {
  rules:{I:perI,II:[...PART_II_FIXED],III:perIII},
  totalI,totalII:nII,totalIII,
  max:totalI+nII+totalIII
 };
}
export function pointsForExam(exam){
 const c=exam.counts||{I:0,II:0,III:0},r=exam.rules||{};
 const totalI=(Number(c.I)||0)*Number(r.I??(exam.form==='120'?10:.25));
 const totalII=(Number(c.II)||0); // II always 0/0.1/0.25/0.5/1, maximum 1 per question
 const totalIII=(Number(c.III)||0)*Number(r.III??.25);
 return {totalI,totalII,totalIII,max:totalI+totalII+totalIII,
  perI:Number(r.I??(exam.form==='120'?10:.25)),perIII:Number(r.III??.25)};
}
export const displayPoints=n=>Number.isFinite(n)?
 new Intl.NumberFormat('vi-VN',{maximumFractionDigits:5}).format(n):'—';
