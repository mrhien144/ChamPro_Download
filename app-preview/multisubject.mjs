/** ChấmPro multi-subject gradebook. Preserve existing saved grades. */
export const norm=x=>String(x??'').trim().replace(/\s+/g,' ');
export function groupKey(e){return JSON.stringify([norm(e.gradeClass||''),norm(e.name||'')]);}
export function listGroups(exams){
 const m=new Map();
 for(const e of exams){const key=groupKey(e);if(!m.has(key))m.set(key,{key,gradeClass:norm(e.gradeClass),name:norm(e.name),subjects:[],exams:[]});const g=m.get(key);g.exams.push(e);if(e.subject&&!g.subjects.includes(norm(e.subject)))g.subjects.push(norm(e.subject));}
 return [...m.values()].sort((a,b)=>a.gradeClass.localeCompare(b.gradeClass,'vi')||a.name.localeCompare(b.name,'vi'));
}
export function splitName(full){const parts=norm(full).split(' ');return {family:parts.slice(0,-1).join(' '),given:parts.at(-1)||''};}
export function makeReport(db,selectedGroup,subjectIds=null){
 const group=listGroups(db.exams).find(g=>g.key===selectedGroup);if(!group)return null;
 const exams=group.exams.filter(e=>e.subject),subjectNames=[...new Set(exams.map(e=>norm(e.subject)))];
 const chosen=(subjectIds||subjectNames).filter(s=>subjectNames.includes(s));
 const matchClass=(student,grade)=>{const query=norm(grade).toLowerCase(),cls=norm(student.classroom).toLowerCase();if(!query)return true;if(cls===query)return true;const block=query.match(/^(?:khối\s*)?(10|11|12)$/);return Boolean(block&&cls.startsWith(block[1]));};
 const people=db.students.filter(s=>matchClass(s,group.gradeClass)).sort((a,b)=>{const x=splitName(a.name),y=splitName(b.name);return x.given.localeCompare(y.given,'vi')||x.family.localeCompare(y.family,'vi')||String(a.sbd).localeCompare(String(b.sbd));});
 const rows=people.map(s=>{
  const scores={};
  for(const subject of subjectNames){const ids=new Set(exams.filter(e=>norm(e.subject)===subject).map(e=>e.id));const r=db.results.filter(r=>r.studentId===s.id&&ids.has(r.examId)).sort((a,b)=>String(b.savedAt).localeCompare(String(a.savedAt)))[0];scores[subject]=r&&!r.pendingCode&&r.score!==null&&r.score!==undefined&&Number.isFinite(Number(r.score))?Number(r.score):null;}
  const complete=chosen.length>0&&chosen.every(p=>scores[p]!==null);
  const total=complete?Math.round((chosen.reduce((n,p)=>n+scores[p],0)+Number.EPSILON)*1000)/1000:null;
  return {id:s.id,sbd:String(s.sbd),...splitName(s.name),classroom:s.classroom,scores,total,rank:null};
 });
 for(const r of rows)if(r.total!==null)r.rank=1+rows.filter(x=>x.total!==null&&x.total>r.total+1e-8).length;
 const subjectsStats={};for(const p of subjectNames){const vals=rows.map(r=>r.scores[p]).filter(x=>x!==null);subjectsStats[p]={mean:vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null,max:vals.length?Math.max(...vals):null,min:vals.length?Math.min(...vals):null,below:vals.filter(x=>x<5).length};}
 const totals=rows.map(r=>r.total).filter(x=>x!==null),threshold=chosen.length*6;
 const totalStats={mean:totals.length?totals.reduce((a,b)=>a+b,0)/totals.length:null,max:totals.length?Math.max(...totals):null,min:totals.length?Math.min(...totals):null,below:totals.filter(x=>x<threshold).length,threshold};
 return {group,subjectNames,chosen,rows,subjectsStats,totalStats};
}
export function sheetMatrix(report,label='Tổng điểm'){
 if(!report)return [];
 const {group,subjectNames,rows,subjectsStats,totalStats}=report;
 const lines=[[],['TRƯỜNG / ĐƠN VỊ'],[group.name.toUpperCase()+' – '+group.gradeClass],['BẢNG ĐIỂM TỔNG HỢP'],[],['SBD','Họ và','Tên',...subjectNames,label,'XH']];
 for(const r of rows)lines.push([r.sbd,r.family,r.given,...subjectNames.map(s=>r.scores[s]??''),r.total??'',r.rank??'']);
 for(const [title,key] of [['ĐIỂM TRUNG BÌNH','mean'],['Điểm cao nhất','max'],['Điểm thấp nhất','min'],['Điểm dưới 5 / dưới ngưỡng','below']]){
  lines.push([title,'','',...subjectNames.map(s=>subjectsStats[s][key]??''),totalStats[key]??'','']);
 }
 return lines;
}