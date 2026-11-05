/** Preserve roster SBD exactly as imported; compare to six-box OMR without rewriting it. */
export function preserveSbd(value){
 const s=String(value??'').trim();
 // Excel numeric integer values sometimes arrive as "1001.0".
 return /^\d+\.0$/.test(s)?s.slice(0,-2):s;
}
export function canonicalSbd(value){
 const s=preserveSbd(value);
 return /^\d+$/.test(s)?s.replace(/^0+(?=\d)/,''):s;
}
export function validSbd(value){
 return /^\d{1,12}$/.test(preserveSbd(value));
}
export function findStudentForSbd(students,sbd){
 const given=preserveSbd(sbd);
 if(!validSbd(given))return null;
 const exact=students.filter(s=>preserveSbd(s.sbd)===given);
 if(exact.length===1)return exact[0];
 if(exact.length>1)return null;
 const number=canonicalSbd(given),matches=students.filter(s=>canonicalSbd(s.sbd)===number);
 return matches.length===1?matches[0]:null;
}