/** Accessible manual corrections for historical results. Offline and camera-independent. */
const e=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
  return '<label class="cp-short-answer-single">Câu '+(i+1)+
   '<input data-rc-short-text="'+i+'" type="text" inputmode="decimal" maxlength="32" value="'+e(raw)+'" placeholder="Nhập đáp án học sinh tô"></label>';
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
  (counts.III?'<details><summary>Phần III — nhập đáp án học sinh đã tô ('+counts.III+' câu)</summary><p class="hint">Chỉ nhập một đáp án cho mỗi câu. Sau khi lưu, hệ thống chấm lại và cập nhật vị trí các vòng tròn trên ảnh.</p><div class="cp-edit-grid">'+rowsIII+'</div></details>':'')+
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
  // The user edits one answer string; no per-column controls are required.
  III.push(raw);IIIColumns.push(null);
 }
 return {sbd:get('#rcSbd').value.trim(),studentId:get('#rcStudent').value,
  examCode:get('#rcExamCode').value.trim(),answers:{I,II,III,IIIColumns}};
}
