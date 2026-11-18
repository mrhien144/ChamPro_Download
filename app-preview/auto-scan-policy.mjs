// Auto-capture policy only. Never changes the OMR reader or grading rules.
export const AUTO_SCAN_INTERVAL_MS=180;
export function canSaveFirstRead(result,knownCode,knownStudent){
 // One-shot only when the existing OMR reports complete, unambiguous
 // recognition, known exam key, known student, and four valid corners.
 const m=result?.markers;
 if(!knownCode||!knownStudent||result?.codeConfidence!==1||!Number.isFinite(result.confidence)||result.confidence<.95||
    result.sbdUnclear||!Array.isArray(result.uncertain)||result.uncertain.length||
    !Array.isArray(m)||m.length!==4||m.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return false;
 // Reject degenerate/duplicate corners as a final safety check.
 if(new Set(m.map(p=>p.join(','))).size!==4)return false;
 let area=0,sign=0;
 for(let i=0;i<4;i++){
  const a=m[i],b=m[(i+1)%4],c=m[(i+2)%4];
  area+=a[0]*b[1]-b[0]*a[1];
  const turn=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
  if(!turn||(sign&&Math.sign(turn)!==sign))return false;
  sign=Math.sign(turn);
 }
 return Math.abs(area)>100;
}
export function autoSaveDecision({fingerprint,lastSaved,lastAuto,result,knownCode,knownStudent,now}){
 if(lastSaved===fingerprint)return 'duplicate';
 if(canSaveFirstRead(result,knownCode,knownStudent))return 'save';
 if(lastAuto?.fingerprint===fingerprint&&now-lastAuto.time<=7000)return 'save';
 return 'confirm';
}
