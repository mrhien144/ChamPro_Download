/** ChấmPro score engine. Pure functions: no network, no camera, no writes. */
export const toNumber = v => Number(String(v??'').trim().replace(',','.'));
export function normalizeAnswer(value) {return String(value??'').trim().toUpperCase().replaceAll('D','Đ').replaceAll('−','-').replaceAll(',','.');}
export function equalShort(a,b) {
  const x=normalizeAnswer(a),y=normalizeAnswer(b);
  if(!x||!y)return false;
  if(x===y)return true;
  const nx=Number(x),ny=Number(y);
  return Number.isFinite(nx)&&Number.isFinite(ny)&&Math.abs(nx-ny)<1e-9;
}
export function grade(exam,answers) {
  if(!exam || !exam.keys || !exam.keys[answers.examCode])throw Error('Không có bộ đáp án của mã đề '+(answers.examCode||'trống'));
  const key=exam.keys[answers.examCode];
  const rules=exam.rules||{};
  const counts=exam.counts||{I:18,II:4,III:6};
  const points={I:0,II:0,III:0};const detail=[];let max=0;
  const sI=Number(rules.I??0.25),sII=rules.II||[0,0.1,0.25,0.5,1],sIII=Number(rules.III??0.25);
  for(let i=0;i<(counts.I||0);i++){
    const correct=String(key.I?.[i]??'').trim().toUpperCase();const value=String(answers.I?.[i]??'').trim().toUpperCase();
    const valid=correct==='ALL'||correct.split(/[|;/]/).map(t=>t.trim()).includes(value)&&value!=='';
    const got=valid?sI:0;points.I+=got;max+=sI;detail.push({part:'I',q:i+1,response:value,key:correct,got,max:sI});
  }
  for(let i=0;i<(counts.II||0);i++){
    const correct=String(key.II?.[i]??'').toUpperCase().replaceAll('D','Đ');const value=String(answers.II?.[i]??'').toUpperCase().replaceAll('D','Đ');
    let n=0;for(let j=0;j<4;j++)if(correct[j]&&correct[j]===value[j]&&'ĐS'.includes(correct[j]))n++;
    const got=correct==='ALL'?Number(sII[4]):Number(sII[n]??0);const mx=Number(sII[4]??1);
    points.II+=got;max+=mx;detail.push({part:'II',q:i+1,response:value,key:correct,got,max:mx});
  }
  for(let i=0;i<(counts.III||0);i++){
    const correct=String(key.III?.[i]??'');const value=String(answers.III?.[i]??'');
    const got=correct.trim().toUpperCase()==='ALL'||correct.split('|').some(k=>equalShort(value,k))?sIII:0;
    points.III+=got;max+=sIII;detail.push({part:'III',q:i+1,response:value,key:correct,got,max:sIII});
  }
  const total=Object.values(points).reduce((a,b)=>a+b,0);
  const round=x=>Math.round((x+Number.EPSILON)*1000)/1000;
  return {total:round(total),max:round(max),points:Object.fromEntries(Object.entries(points).map(([k,v])=>[k,round(v)])),detail};
}
export function parseRows(csv) {const rows=[], data=String(csv).replace(/^\uFEFF/,'');let row=[],field='',quotes=false;
 for(let i=0;i<data.length;i++){const c=data[i];if(c==='"'){if(quotes&&data[i+1]==='"'){field+='"';i++;}else quotes=!quotes;}else if(c===','&&!quotes){row.push(field);field='';}else if((c==='\r'||c==='\n')&&!quotes){if(c==='\r'&&data[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field='';}else field+=c;}
 row.push(field);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function toCsv(rows) {const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';return '\uFEFF'+rows.map(r=>r.map(q).join(',')).join('\r\n');}
export function validateForSave(exam,student,omr) {
 const issues=[];
 if(!exam||!exam.keys)issues.push('Chưa chọn kỳ kiểm tra');
 if(!omr||!exam?.keys?.[omr.examCode])issues.push('Mã đề chưa tồn tại trong bộ đáp án');
 const found=Object.values({I:omr?.I||[],II:omr?.II||[],III:omr?.III||[]}).flat().some(s=>String(s||'').replace(/\?/g,'').trim());
 if(!found)issues.push('Phiếu không có đáp án được tô');
 if(omr?.uncertain?.some(x=>!/^SBD \d+$/.test(x)))issues.push('Có mã đề hoặc đáp án chưa rõ, cần giáo viên kiểm tra');
 return issues;
}