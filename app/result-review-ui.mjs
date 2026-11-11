/** Accessible manual corrections for historical results. Offline and camera-independent. */
import {shortDigitColumns} from './result-review.mjs';
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digits=Array.from({length:10},(_,i)=>String(i));
export function renderResultEditor(record,exam,students){
 const opts=(value,options)=>options.map(([v,t])=>'<option value="'+e(v)+'"'+(v===value?' selected':'')+'>'+e(t)+'</option>').join('');
 const answer=record.answers||{},counts=exam.counts;
 const studentOptions=[['','-- Chưa xác định --'],...students.map(s=>[s.id,s.sbd+' - '+s.name])];
 const rowsI=Array.from({length:counts.I},(_,i)=>{
  const response=String(answer.I?.[i]||'').toUpperCase().split('+');
  return '<fieldset class="cp-edit-question"><legend>Câu '+(i+1)+'</legend>'+
   ['A','B','C','D'].map(letter=>'<label><input type="checkbox" data-rc-i="'+i+'" value="'+letter+'"'+(response.includes(letter)?' checked':'')+'> '+letter+'</label>').join('')+
   '</fieldset>';
 }).join('');
 const rowsII=Array.from({length:counts.II},(_,i)=>{
  const response=String(answer.II?.[i]||'').toUpperCase().replaceAll('D','Đ');
  return '<fieldset class="cp-edit-question"><legend>Câu '+(i+1)+'</legend>'+
   Array.from({length:4},(_,j)=>'<label>Ý '+('abcd'[j])+
    '<select data-rc-ii="'+i+'" data-rc-sub="'+j+'">'+
    opts(response[j]||' ',[[' ','Trống'],['Đ','Đúng'],['S','Sai']])+'</select></label>').join('')+
   '</fieldset>';
 }).join('');
 const rowsIII=Array.from({length:counts.III},(_,i)=>{
  const raw=String(answer.III?.[i]||'');
  const cols=shortDigitColumns(answer.IIIColumns?.[i]??raw)||['','','',''];
  return '<fieldset class="cp-edit-question"><legend>Câu '+(i+1)+'</legend>'+
   '<div class="cp-short-columns">'+cols.map((digit,j)=>
    '<label>Cột '+(j+1)+'<select data-rc-iii="'+i+'" data-rc-col="'+j+'">'+
    opts(digit,[['','Trống'],...digits.map(d=>[d,d])])+'</select></label>').join('')+'</div>'+
   '<label>Đáp án nhận diện / nhập số (hỗ trợ dấu âm, thập phân)'+
   '<input data-rc-short-text="'+i+'" type="text" inputmode="decimal" maxlength="32" value="'+e(raw)+'"></label>'+
   '</fieldset>';
 }).join('');
 const history=record.scoreHistory?.length?'<details><summary>Lịch sử chỉnh sửa ('+record.scoreHistory.length+')</summary>'+
  record.scoreHistory.map(x=>'<p>'+e(new Date(x.at).toLocaleString('vi-VN'))+': '+e(x.oldScore)+' → '+e(x.newScore)+' ('+e(x.reason)+')</p>').join('')+
  '</details>':'';
 return '<section class="cp-manual-editor"><h3>Chỉnh sửa bài đã chấm</h3>'+
  '<p class="hint">Đối chiếu ảnh gốc rồi sửa phương án máy nhận diện sai. Điểm được tính lại khi bấm Lưu chỉnh sửa. Có lưu lịch sử để kiểm tra.</p>'+
  '<div class="review-data"><label>SBD <input id="rcSbd" inputmode="numeric" maxlength="12" value="'+e(record.sbd||'')+'"></label>'+
  '<label>Chọn học sinh <select id="rcStudent">'+opts(record.studentId||'',studentOptions)+'</select></label>'+
  '<label>Mã đề <input id="rcExamCode" inputmode="numeric" maxlength="'+e(exam.digits)+'" value="'+e(record.examCode)+'"></label></div>'+
  '<details><summary>Phần I — chọn các ô học sinh đã tô ('+counts.I+' câu)</summary><div class="cp-edit-grid">'+rowsI+'</div></details>'+
  (counts.II?'<details><summary>Phần II — từng ý Đúng/Sai ('+counts.II+' câu)</summary><div class="cp-edit-grid">'+rowsII+'</div></details>':'')+
  (counts.III?'<details><summary>Phần III — từng ô số của bốn cột ('+counts.III+' câu)</summary><p class="hint">Mỗi cột chọn một ô 0–9 hoặc Trống. Với giá trị âm/thập phân, nhập trực tiếp vào ô văn bản và không tô chọn các cột không xác định.</p><div class="cp-edit-grid">'+rowsIII+'</div></details>':'')+
  '<div class="actions"><button type="button" id="rcSave" class="primary">Lưu chỉnh sửa & chấm lại</button>'+
  (record.machineReadOriginal?'<button type="button" id="rcRestore" class="outline">Khôi phục kết quả máy đọc</button>':'')+
  '</div>'+history+'</section>';
}
export function bindResultEditor(root,students){
 const sbd=root.querySelector('#rcSbd'),student=root.querySelector('#rcStudent');
 student?.addEventListener('change',()=>{
  const found=students.find(x=>x.id===student.value);
  if(found)sbd.value=found.sbd;
 });
 sbd?.addEventListener('input',()=>{
  const selected=students.find(x=>x.id===student.value);
  if(selected&&String(selected.sbd)!==sbd.value)student.value='';
 });
 root.querySelectorAll('select[data-rc-iii]').forEach(el=>el.addEventListener('change',()=>{
  const q=el.dataset.rcIii;
  const cols=[...root.querySelectorAll('select[data-rc-iii="'+q+'"]')]
   .sort((a,b)=>Number(a.dataset.rcCol)-Number(b.dataset.rcCol));
  const text=root.querySelector('[data-rc-short-text="'+q+'"]');
  if(text)text.value=cols.map(x=>x.value).join('');
 }));
 root.querySelectorAll('[data-rc-short-text]').forEach(input=>input.addEventListener('input',()=>{
  const q=input.dataset.rcShortText;
  const cols=[...root.querySelectorAll('select[data-rc-iii="'+q+'"]')];
  const value=input.value.trim();
  if(value!==cols.map(el=>el.value).join(''))for(const c of cols)c.value='';
 }));
}
export function collectResultEditor(root,exam){
 const get=x=>root.querySelector(x);
 const I=Array.from({length:exam.counts.I},(_,i)=>
  [...root.querySelectorAll('input[data-rc-i="'+i+'"]:checked')].map(x=>x.value).join('+'));
 const II=Array.from({length:exam.counts.II},(_,i)=>
  Array.from({length:4},(_,j)=>get('select[data-rc-ii="'+i+'"][data-rc-sub="'+j+'"]')?.value||' ').join(''));
 const III=[],IIIColumns=[];
 for(let i=0;i<exam.counts.III;i++){
  const raw=get('[data-rc-short-text="'+i+'"]')?.value.trim()||'';
  const cols=Array.from({length:4},(_,j)=>get('select[data-rc-iii="'+i+'"][data-rc-col="'+j+'"]')?.value||'');
  III.push(raw);IIIColumns.push(cols.join('')===raw?cols:null);
 }
 return {sbd:get('#rcSbd').value.trim(),studentId:get('#rcStudent').value,
  examCode:get('#rcExamCode').value.trim(),answers:{I,II,III,IIIColumns}};
}
