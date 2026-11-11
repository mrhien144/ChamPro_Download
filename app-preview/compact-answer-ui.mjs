/**
 * Compact ChấmPro answer-key review. Changes neither the OMR reader nor the
 * stored result/photo model. New exams use totals, legacy exams keep rules.
 */
import {getDb,save,toast} from './app.mjs?v=20261111-compact-answers-v1';
import {regradeAffectedResults} from './result-review.mjs';
import {allocateExamPoints,pointsForExam,displayPoints} from './compact-points.mjs';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const exam=()=>getDb().exams.find(e=>e.id===$('keyExam').value);
const form=$('examForm');
let editing=false,draftCode='',activeKey='';
const fields={
 I:form?.elements.namedItem('totalI'),
 III:form?.elements.namedItem('totalIII')
};
function totalPreview(){
 const type=form.elements.namedItem('form').value,
  counts={I:Number(form.elements.namedItem('cI').value)||0,
   II:Number(form.elements.namedItem('cII').value)||0,
   III:Number(form.elements.namedItem('cIII').value)||0};
 const is120=type==='120';
 $('cpTotalIIIWrap').hidden=is120;
 const explain=(part,n)=>{
  const node=$('cpPerQuestion'+part);
  const field=fields[part];
  const score=Number(String(field.value).replace(',','.'));
  node.textContent=n>0&&Number.isFinite(score)?
   n+' câu × '+displayPoints(score/n)+' điểm/câu':
   n===0?'Phần này không có câu hỏi':'Hãy nhập tổng điểm hợp lệ';
 };
 explain('I',counts.I);if(!is120)explain('III',counts.III);
 $('cpPartIITotal').textContent=displayPoints(counts.II)+' điểm';
 try{
  const allocated=allocateExamPoints(type,counts,fields.I.value,fields.III.value);
  $('cpExamTotalPreview').textContent='Tổng điểm tối đa: '+displayPoints(allocated.max)+' điểm';
  $('cpExamTotalPreview').dataset.valid='yes';
 }catch(error){
  $('cpExamTotalPreview').textContent=error.message;
  $('cpExamTotalPreview').dataset.valid='no';
 }
}
for(const part of ['I','III']){
 fields[part].addEventListener('input',()=>{fields[part].dataset.custom='1';totalPreview();});
}
for(const field of form.querySelectorAll('[name=cI],[name=cII],[name=cIII]')){
 field.addEventListener('input',()=>{
  const type=form.elements.namedItem('form').value;
  if(!fields.I.dataset.custom)fields.I.value=String(Math.max(0,Number(form.elements.namedItem('cI').value)||0)*(type==='120'?10:.25));
  if(!fields.III.dataset.custom)fields.III.value=String(Math.max(0,Number(form.elements.namedItem('cIII').value)||0)*.25);
  totalPreview();
 });
}
form.elements.namedItem('form').addEventListener('change',()=>{
 for(const p of ['I','III'])delete fields[p].dataset.custom;
 // Existing app.mjs handler resets counts and totals for a form change.
 queueMicrotask(totalPreview);
});
form.addEventListener('reset',()=>{
 for(const p of ['I','III'])delete fields[p].dataset.custom;
 setTimeout(totalPreview,0);
});
totalPreview();

function selectedCode(){return $('cpKeyCodeSelect').value;}
function keyOptions(focus=null){
 const select=$('cpKeyCodeSelect'),item=exam();
 const previous=focus??select.value;
 const codes=Object.keys(item?.keys||{}).sort((a,b)=>a.localeCompare(b,'vi',{numeric:true}));
 const available=draftCode&&!codes.includes(draftCode)?[...codes,draftCode]:codes;
 select.innerHTML='<option value="">-- Chọn mã đề --</option>'+
  available.map(code=>'<option value="'+esc(code)+'">'+esc(code)+(code===draftCode?' (mới)':'')+'</option>').join('');
 if(previous&&available.includes(previous))select.value=previous;
 else if(codes.length)select.value=codes[0];
 else if(draftCode)select.value=draftCode;
 else select.value='';
 return {item,codes};
}
function questionRows(part,arr,count){
 return '<section class="cp-key-part"><h3>Phần '+part+' <small>('+count+' câu)</small></h3>'+
 '<div class="cp-key-fields">'+Array.from({length:count},(_,i)=>{
  const value=String(arr?.[i]??'');
  return '<label>Câu '+(i+1)+'<input data-cp-part="'+part+'" data-cp-index="'+i+
   '" type="text" value="'+esc(value)+'"'+(editing?'':' readonly')+
   ' placeholder="'+(part==='I'?'A / A|C':part==='II'?'ĐSĐS':'1,5 / 1,5|2')+
   '" autocapitalize="'+(part==='III'?'off':'characters')+'" spellcheck="false"></label>';
 }).join('')+'</div></section>';
}
function renderReview(){
 const sel=$('cpKeyCodeSelect'),code=selectedCode(),item=exam(),
  review=$('cpKeyReview'),summary=$('cpKeySummary');
 if(!item){
  summary.textContent='Hãy tạo hoặc chọn môn kiểm tra trước.';
  review.hidden=true;activeKey='';return;
 }
 const score=pointsForExam(item),count=Object.keys(item.keys||{}).length;
 summary.innerHTML='<strong>'+esc(item.subject||'Môn học')+'</strong> · '+count+' mã đề'+
  ' · Điểm tối đa '+displayPoints(score.max)+' (I: '+displayPoints(score.totalI)+
  ' · II: '+displayPoints(score.totalII)+' · III: '+displayPoints(score.totalIII)+')';
 if(!code){
  review.hidden=true;activeKey='';return;
 }
 const key=item.keys?.[code]||{I:[],II:[],III:[]};
 if(activeKey!==item.id+':'+code){editing=code===draftCode&&!item.keys?.[code];activeKey=item.id+':'+code;}
 $('keyCode').value=code; // Keep legacy Excel/QR adapter and manual export in sync.
 $('cpKeyGrid').innerHTML=['I','II','III'].filter(p=>item.counts[p]>0)
  .map(p=>questionRows(p,key[p],item.counts[p])).join('');
 review.hidden=false;
 $('cpEditKey').hidden=editing;
 $('cpSaveKey').hidden=!editing;
 $('cpCancelKey').hidden=!editing;
 if(editing){
  const first=$('cpKeyGrid').querySelector('input');
  first?.focus({preventScroll:true});
 }
}
function refresh(options={}){
 const {item}=keyOptions(options.focus);
 if(options.examId&&item?.id!==options.examId){
  const target=getDb().exams.find(e=>e.id===options.examId);
  if(target){$('keyExam').value=target.id;keyOptions(options.focus);}
 }
 renderReview();
}
function enterEdit(){
 if(!exam()||!selectedCode())return toast('Hãy chọn kỳ kiểm tra và mã đề');
 editing=true;renderReview();
}
function cancelEdit(){
 editing=false;
 if(draftCode&&!exam()?.keys?.[draftCode])draftCode='';
 refresh();
}
function parseInputs(item){
 const out={I:[],II:[],III:[]};
 for(const part of ['I','II','III']){
  const count=item.counts[part]||0;
  const inputs=[...$('cpKeyGrid').querySelectorAll('[data-cp-part="'+part+'"]')];
  if(inputs.length!==count)throw Error('Thiếu câu ở phần '+part);
  for(let i=0;i<inputs.length;i++){
   let value=inputs[i].value.trim();
   if(part==='I')value=value.toUpperCase();
   else if(part==='II')value=value.toUpperCase().replaceAll('D','Đ');
   if(!value)throw Error('Phần '+part+', câu '+(i+1)+' chưa có đáp án');
   if(part==='I'){
    if(value!=='ALL'&&!/^[ABCD](\|[ABCD]){0,3}$/.test(value))
     throw Error('Phần I câu '+(i+1)+': nhập A–D, A|C hoặc ALL');
    if(value!=='ALL'&&new Set(value.split('|')).size!==value.split('|').length)
     throw Error('Phần I câu '+(i+1)+' có đáp án trùng');
   }else if(part==='II'){
    if(value!=='ALL'&&!/^[ĐS*]{4}$/.test(value))
     throw Error('Phần II câu '+(i+1)+': phải có 4 ký tự Đ/S/* hoặc ALL');
   }else if(value.toUpperCase()!=='ALL'&&
    (value.length>90||value.split('|').some(x=>!x.trim())))
    throw Error('Phần III câu '+(i+1)+': kiểm tra đáp án và dấu |');
   out[part].push(value);
  }
 }
 return out;
}
function saveEdit(){
 const item=exam(),code=selectedCode();if(!item||!code)return;
 try{
  if(!new RegExp('^\\d{'+item.digits+'}$').test(code))
   throw Error('Mã đề phải đủ '+item.digits+' chữ số');
  const next=parseInputs(item),old=item.keys?.[code];
  if(old&&JSON.stringify(old)===JSON.stringify(next)){
   editing=false;draftCode='';refresh({focus:code});toast('Đáp án không có thay đổi.');return;
  }
  // Scores are recomputed only on teacher save, never while the camera scans.
  item.keys[code]=next;
  const stats=regradeAffectedResults(getDb(),item,'Giáo viên cập nhật đáp án mã '+code,code);
  editing=false;draftCode='';
  save();refresh({focus:code});
  toast('Đã lưu đáp án mã '+code+'. Đã cập nhật '+stats.changed+' bài chấm.');
 }catch(error){toast('Chưa lưu: '+error.message);}
}
$('cpKeyCodeSelect').addEventListener('change',()=>{editing=false;renderReview();});
$('keyExam').addEventListener('change',()=>{editing=false;draftCode='';refresh();});
$('cpEditKey').addEventListener('click',enterEdit);
$('cpCancelKey').addEventListener('click',cancelEdit);
$('cpSaveKey').addEventListener('click',saveEdit);
$('cpNewKey').addEventListener('click',()=>{
 const item=exam();if(!item)return toast('Hãy chọn kỳ kiểm tra trước');
 const code=prompt('Nhập mã đề mới ('+item.digits+' chữ số):','');
 if(code===null)return;
 if(!new RegExp('^\\d{'+item.digits+'}$').test(code.trim()))
  return toast('Mã đề phải có đúng '+item.digits+' chữ số');
 draftCode=code.trim();editing=true;refresh({focus:draftCode});
});
$('examList').addEventListener('click',event=>{
 if(event.target.closest('[data-editexam]'))queueMicrotask(()=>{editing=false;draftCode='';refresh({focus:$('keyCode').value});});
});
window.addEventListener('champro-db-updated',()=>{
 // Refresh imported keys, including multi-code Excel/QR imports.
 if(!editing)refresh();
});
window.addEventListener('champro-keys-imported',event=>{
 const detail=event.detail||{};
 if(detail.examId){$('keyExam').value=detail.examId;draftCode='';editing=false;refresh({focus:detail.codes?.[0]});}
});
refresh();
