/** Pure, offline-safe review helpers; never called by the camera scan loop. */
import {grade,equalShort} from './grader.mjs';

export function shortDigitColumns(value,width=4){
 if(Array.isArray(value)){
  if(value.length!==width)return null;
  const out=value.map(v=>String(v??'').trim());
  return out.every(v=>v===''||/^[0-9]$/.test(v))?out:null;
 }
 const text=String(value??'').trim();
 if(!/^[0-9]{1,4}$/.test(text)||text.length>width)return null;
 return [...text,...Array(width-text.length).fill('')];
}
function numericChoices(key,width){
 return String(key??'').split('|').map(s=>s.trim())
  .filter(s=>/^[0-9]{1,4}$/.test(s)&&s.length<=width);
}
/**
 * Returns explicit bubbles to colour on the ORIGINAL four-column short-answer
 * sheet. If earlier scans did not preserve columns, the legacy text is
 * left-aligned and consumers must state this limitation to the reviewer.
 *
 * Bubble marks: green = the filled digit is right in its column,
 * red = an incorrect filled digit, yellow = the expected digit in that column.
 */
export function shortCellMarks(response,key,savedColumns=null,width=4){
 const actual=shortDigitColumns(savedColumns??response,width);
 if(!actual)return [];
 const selected=String(response??'').trim();
 const choices=numericChoices(key,width),all=String(key??'').toUpperCase()==='ALL';
 if(all)return actual.flatMap((digit,column)=>digit?[{column,digit,color:'green'}]:[]);
 if(!choices.length)return [];
 let best=null,bestScore=-Infinity;
 for(const candidate of choices){
  for(let offset=0;offset<=width-candidate.length;offset++){
   const expected=Array(width).fill('');
   [...candidate].forEach((digit,j)=>{expected[offset+j]=digit;});
   const matches=actual.reduce((sum,v,i)=>sum+(v&&v===expected[i]?1:0),0);
   const conflicts=actual.reduce((sum,v,i)=>sum+(v&&expected[i]&&v!==expected[i]?1:0),0);
   const missing=actual.reduce((sum,v,i)=>sum+(!v&&expected[i]?1:0),0);
   const extras=actual.reduce((sum,v,i)=>sum+(v&&!expected[i]?1:0),0);
   let score=matches*10-conflicts*3-missing-extras;
   if(equalShort(selected,candidate))score+=50;
   if(score>bestScore){bestScore=score;best=expected;}
  }
 }
 if(!best)return [];
 const marks=[];
 for(let column=0;column<width;column++){
  const observed=actual[column],correct=best[column];
  if(observed){
   marks.push({column,digit:observed,color:observed===correct?'green':'red'});
  }
  if(correct&&correct!==observed)marks.push({column,digit:correct,color:'yellow'});
 }
 return marks;
}
export function regradeAffectedResults(data,exam,reason='Giáo viên sửa đáp án',code=null){
 const stats={checked:0,changed:0,skipped:0};
 for(const r of data.results||[]){
  if(r.examId!==exam.id||(code&&r.examCode!==code))continue;
  if(!r.answers||!exam.keys?.[r.examCode]){stats.skipped++;continue;}
  stats.checked++;
  try{
   const newGrade=grade(exam,{...r.answers,examCode:r.examCode});
   const differs=r.score!==newGrade.total||r.max!==newGrade.max||
    ['I','II','III'].some(p=>r.parts?.[p]!==newGrade.points[p]);
   if(!differs)continue;
   const now=new Date().toISOString();
   if(!Array.isArray(r.scoreHistory))r.scoreHistory=[];
   r.scoreHistory.push({at:now,oldScore:r.score,oldMax:r.max,
    oldParts:{...(r.parts||{})},newScore:newGrade.total,newMax:newGrade.max,
    reason});
   r.score=newGrade.total;r.max=newGrade.max;r.parts=newGrade.points;
   r.regradedAt=now;stats.changed++;
  }catch{stats.skipped++;}
 }
 return stats;
}
const clone=x=>JSON.parse(JSON.stringify(x));
const plain=s=>String(s??'').trim();
const codeIsValid=(code,digits)=>new RegExp('^\\d{'+digits+'}$').test(code);
export function correctedRecord(data,exam,old,changes){
 if(!exam?.keys)throw Error('Không tìm thấy kỳ kiểm tra gốc');
 const code=plain(changes.examCode);
 if(!codeIsValid(code,exam.digits)||!exam.keys[code])
  throw Error('Mã đề không tồn tại hoặc không đúng '+exam.digits+' chữ số');
 const sbd=plain(changes.sbd);
 if(sbd&&!/^[0-9]{1,12}$/.test(sbd))throw Error('SBD phải gồm 1–12 chữ số');
 let student=changes.studentId?data.students.find(x=>x.id===changes.studentId):null;
 // A newly typed SBD overrides a stale student dropdown only after the user
 // actively clears or changes that dropdown in the UI.
 if(student&&sbd&&String(student.sbd)!==sbd)
  throw Error('SBD không khớp học sinh đã chọn');
 if(!student&&sbd)student=data.students.find(x=>String(x.sbd)===sbd);
 if(student&&(data.results||[]).some(r=>r.id!==old.id&&r.examId===old.examId&&r.studentId===student.id))
  throw Error('Học sinh đã có bài trong môn/kỳ này; không thể gán trùng');
 const counts=exam.counts||{I:0,II:0,III:0},answers={I:[],II:[],III:[],IIIColumns:[]};
 for(const part of ['I','II','III']){
  if(!Array.isArray(changes.answers?.[part])||changes.answers[part].length!==counts[part])
   throw Error('Thiếu số câu ở phần '+part);
 }
 for(const raw of changes.answers.I){
  const text=plain(raw).toUpperCase();
  if(text&&!/^(?:[ABCD](?:\+[ABCD]){0,3}|\?)$/.test(text))
   throw Error('Phần I chỉ nhận A, B, C, D hoặc nhiều ô tô');
  if(new Set(text.split('+')).size!==text.split('+').length)throw Error('Phần I có phương án trùng');
  answers.I.push(text);
 }
 for(const raw of changes.answers.II){
  const value=String(raw??'').toUpperCase().replaceAll('D','Đ');
  if(value.length!==4||!/^[ĐS ?]{4}$/.test(value))throw Error('Phần II phải đủ bốn ý Đ/S/Trống');
  answers.II.push(value);
 }
 for(let i=0;i<counts.III;i++){
  const response=plain(changes.answers.III[i]);
  if(response.length>32||!/^[0-9.,\-+ ]*$/.test(response))throw Error('Phần III chỉ nhận đáp án dạng số');
  const cols=shortDigitColumns(changes.answers.IIIColumns?.[i]);
  // Physical columns are authoritative when edited through the four
  // per-column dropdowns. Otherwise preserve numeric text with no fake map.
  if(changes.answers.IIIColumns?.[i]!=null&&!cols)throw Error('Cột số phần III không hợp lệ');
  if(cols&&cols.join('')!==response.replace(/\s/g,''))
   throw Error('Các ô số phần III không khớp giá trị nhập ở câu '+(i+1));
  answers.III.push(response);answers.IIIColumns.push(cols);
 }
 const next=clone(old),now=new Date().toISOString();
 if(!next.machineReadOriginal){
  next.machineReadOriginal={sbd:old.rawSbd??old.sbd??'',studentId:old.studentId??null,
   examCode:old.examCode,answers:clone(old.answers)};
 }
 next.examCode=code;next.answers=answers;next.sbd=student?.sbd||sbd;
 next.studentId=student?.id??null;
 next.studentName=student?.name||'Chưa xác định học sinh';
 next.classroom=student?.classroom||'';
 next.pendingStudent=!student;
 const scored=grade(exam,{...answers,examCode:code});
 const before=JSON.stringify([old.sbd,old.studentId,old.examCode,old.answers,old.score,old.max,old.parts]);
 const after=JSON.stringify([next.sbd,next.studentId,next.examCode,next.answers,scored.total,scored.max,scored.points]);
 if(before===after)return {record:old,changed:false};
 if(!Array.isArray(next.scoreHistory))next.scoreHistory=[];
 next.scoreHistory.push({at:now,oldScore:old.score,oldMax:old.max,
  oldParts:{...(old.parts||{})},newScore:scored.total,newMax:scored.max,
  reason:changes.reason||'Giáo viên chỉnh sửa bài đã chấm',oldExamCode:old.examCode,
  newExamCode:code});
 next.score=scored.total;next.max=scored.max;next.parts=scored.points;
 next.manualEditedAt=now;
 return {record:next,changed:true};
}
