/** ChấmPro scan-staging: conservative duplicate detection before quota consumption.
 * A valid SBD identifies a script within one exam, even if it is not yet in the roster.
 * Missing SBD cannot distinguish two different sheets with identical answers.
 */
export function normalizeSbd(value){
 const s=String(value??'').trim();
 if(!/^\d{1,12}(?:\.0)?$/.test(s))return '';
 return s.replace(/\.0$/,'').replace(/^0+(?=\d)/,'');
}
export function answersKey(exam,answers){
 const counts=exam.counts||{I:0,II:0,III:0};
 return JSON.stringify([
  String(answers.examCode||'').trim(),
  ...['I','II','III'].map(p=>
   Array.from({length:Number(counts[p])||0},(_,i)=>
    String(answers[p]?.[i]??'').trim().toUpperCase().replace(/\s+/g,'')
   )
  )
 ]);
}
export function identityFor(exam,student,answers){
 const sbd=normalizeSbd(student?.sbd)||normalizeSbd(answers.sbd);
 if(sbd)return {type:'sbd',id:sbd};
 return {type:'unknown',id:answersKey(exam,answers)};
}
export function existingFor(db,exam,student,answers){
 const wanted=identityFor(exam,student,answers);
 const matches=(db.results||[]).filter(r=>r.examId===exam.id);
 if(wanted.type==='sbd'){
  return matches.find(r=>
   (student?.id&&r.studentId===student.id)||
   [r.sbd,r.rawSbd].some(s=>normalizeSbd(s)===wanted.id)
  )||null;
 }
 // Without SBD, matching answers MAY be a different person. Block automatic
 // repeated reads; allow a verified manual override for a different paper.
 const key=answersKey(exam,answers);
 return matches.find(r=>
  !normalizeSbd(r.sbd)&&!normalizeSbd(r.rawSbd)&&
  answersKey(exam,{examCode:r.examCode,...(r.answers||{})})===key
 )||null;
}
export function creditIdentity(exam,student,answers,{distinctUnknownId}={}){
 const who=identityFor(exam,student,answers);
 return JSON.stringify([
  'ChamPro-scan-v2',String(exam.id),
  who.type,who.type==='unknown'&&distinctUnknownId?'manual-unknown:'+distinctUnknownId:who.id
 ]);
}
