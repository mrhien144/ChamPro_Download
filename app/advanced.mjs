/** ChấmPro: QR Web import, multi-subject gradebook, and Excel matrix import/export. */
import {getDb,save,toast,spreadsheetRows,loadScript,sendFile} from './app.mjs?v=20261107-verified-paper-r2';
import {listGroups,makeReport,sheetMatrix} from './multisubject.mjs';
import {decodeChamProQR,studentsFromQR,keysFromQR,parseAnswerMatrix} from './qr-compatible.mjs';
import {toCsv} from './grader.mjs';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const db=()=>getDb();
const number=x=>x===null||x===undefined?'':String(Math.round((Number(x)+Number.EPSILON)*100)/100).replace('.',',');
let lastGroup='',qrMode='',qrStream=null,qrRAF=0,qrBusy=false,qrDetector=null,qrScript=null,lastScanAt=0;
function config(r){const saved=(db().reportSettings||{})[r.group.key]||{};return {subjects:Array.isArray(saved.subjects)?saved.subjects.filter(x=>r.subjectNames.includes(x)):r.subjectNames,label:saved.label||'Tổng điểm'};}
function showGroups(){const sel=$('summaryGroup'),previous=sel.value||lastGroup;const groups=listGroups(db().exams);sel.innerHTML='<option value="">-- Chọn kỳ kiểm tra --</option>'+groups.map(g=>'<option value="'+esc(g.key)+'">'+esc(g.gradeClass+' · '+g.name)+'</option>').join('');if(groups.some(g=>g.key===previous))sel.value=previous;else if(groups.length)sel.value=groups[0].key;lastGroup=sel.value;renderSummary();}
function renderSummary(){
 const basic=makeReport(db(),$('summaryGroup').value);
 const subjects=$('summarySubjects'),head=$('summaryHead'),body=$('summaryBody');
 if(!basic){subjects.textContent='Chưa có kỳ kiểm tra';head.innerHTML='';body.innerHTML='';return;}
 const opts=config(basic);$('summaryTotalLabel').value=opts.label;
 subjects.innerHTML=basic.subjectNames.map(s=>'<label><input type="checkbox" value="'+esc(s)+'" '+(opts.subjects.includes(s)?'checked':'')+'>'+esc(s)+'</label>').join('');
 const r=makeReport(db(),$('summaryGroup').value,opts.subjects);
 head.innerHTML='<tr>'+['SBD','Họ và','Tên',...r.subjectNames,opts.label,'XH'].map(s=>'<th>'+esc(s)+'</th>').join('')+'</tr>';
 body.innerHTML=r.rows.map(x=>'<tr><td>'+esc(x.sbd)+'</td><td>'+esc(x.family)+'</td><td>'+esc(x.given)+'</td>'+r.subjectNames.map(s=>'<td class="numeric">'+(x.scores[s]===null?'—':number(x.scores[s]))+'</td>').join('')+'<td class="numeric total">'+(x.total===null?'—':number(x.total))+'</td><td class="numeric rank">'+(x.rank??'—')+'</td></tr>').join('')+
 [['ĐIỂM TRUNG BÌNH','mean'],['Điểm cao nhất','max'],['Điểm thấp nhất','min'],['Điểm dưới 5 / dưới ngưỡng tổng','below']].map(([title,key])=>'<tr class="summary-stat"><td colspan="3">'+title+'</td>'+r.subjectNames.map(s=>'<td class="numeric">'+number(r.subjectsStats[s][key])+'</td>').join('')+'<td class="numeric">'+number(r.totalStats[key])+'</td><td></td></tr>').join('');
}
function setSettings(){const r=makeReport(db(),$('summaryGroup').value);if(!r)return;const selected=[...$('summarySubjects').querySelectorAll('input:checked')].map(x=>x.value);if(!selected.length){toast('Cần chọn ít nhất một môn để xếp hạng');renderSummary();return;}db().reportSettings||={};db().reportSettings[r.group.key]={subjects:selected,label:$('summaryTotalLabel').value.trim()||'Tổng điểm'};save();}
$('summaryGroup').onchange=()=>{lastGroup=$('summaryGroup').value;renderSummary();};
$('summarySubjects').onchange=setSettings;
$('summaryTotalLabel').onchange=setSettings;
function selectedReport(){const base=makeReport(db(),$('summaryGroup').value);if(!base)throw Error('Chưa chọn kỳ kiểm tra');const opts=config(base);if(!opts.subjects.length)throw Error('Cần chọn môn cộng điểm');return {r:makeReport(db(),$('summaryGroup').value,opts.subjects),label:opts.label};}
$('exportSummaryCSV').onclick=()=>{try{const {r,label}=selectedReport();sendFile('ChamPro_BangDiem_'+Date.now()+'.csv',toCsv(sheetMatrix(r,label)),'text/csv;charset=utf-8');}catch(e){toast(e.message);}};
async function xlsx(){if(!window.XLSX)await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js','XLSX');return window.XLSX;}
$('exportSummaryExcel').onclick=async()=>{try{const {r,label}=selectedReport(),X=await xlsx(),arr=sheetMatrix(r,label),ws=X.utils.aoa_to_sheet(arr),book=X.utils.book_new();ws['!cols']=[{wch:13},{wch:28},{wch:15},...r.subjectNames.map(()=>({wch:13})),{wch:20},{wch:9}];const last=r.subjectNames.length+4;ws['!merges']=[1,2,3].map(row=>({s:{r:row,c:0},e:{r:row,c:last}}));X.utils.book_append_sheet(book,ws,'BangDiem');X.writeFile(book,'ChamPro_BangDiem_'+Date.now()+'.xlsx');}catch(e){toast('Xuất Excel: '+e.message);}};
$('answerMatrixTemplate').onclick=async()=>{try{const exam=db().exams.find(e=>e.id===$('keyExam').value);if(!exam)throw Error('Chọn kỳ và môn trước');const X=await xlsx();const codes=Object.keys(exam.keys||{});if(!codes.length)codes.push('1'.padStart(exam.digits,'0'));const n=exam.counts.I+exam.counts.II+exam.counts.III;const rows=[['Câu\\Mã đề',...codes],...Array.from({length:n},(_,i)=>[i+1,...codes.map(()=> '')])];const book=X.utils.book_new(),ws=X.utils.aoa_to_sheet(rows);ws['!cols']=[{wch:20},...codes.map(()=>({wch:15}))];X.utils.book_append_sheet(book,ws,'DapAn');X.writeFile(book,'ChamPro_Mau_DapAn.xlsx');}catch(e){toast(e.message);}};
$('keysFile').addEventListener('change',async ev=>{
 ev.stopImmediatePropagation();const file=ev.target.files?.[0];if(!file)return;
 try{
  const exam=db().exams.find(e=>e.id===$('keyExam').value);if(!exam)throw Error('Hãy chọn kỳ và môn kiểm tra trước');
  const rows=await spreadsheetRows(file,'DapAn');if(!rows.length)throw Error('Excel trống');
  let keys=parseAnswerMatrix(rows,exam);
  if(!keys){
   const header=rows.shift().map(x=>String(x).trim().toLowerCase().replace(/\s+/g,''));const pos=(...names)=>header.findIndex(x=>names.includes(x));const ci=pos('ma_de','mãđề','made'),pi=pos('phan','phần'),qi=pos('cau','câu'),ai=pos('dap_an','đápán','dapan');
   if([ci,pi,qi,ai].some(i=>i<0))throw Error('Cần mẫu DapAn dạng Câu\\Mã đề hoặc CSV 4 cột');
   keys={};
   for(const row of rows){const code=String(row[ci]??'').trim().replace(/\.0$/,'').padStart(exam.digits,'0'),p=String(row[pi]||'').trim().toUpperCase(),q=Number(row[qi]);if(!new RegExp('^\\d{'+exam.digits+'}$').test(code)||!['I','II','III'].includes(p)||!Number.isInteger(q)||q<1||q>exam.counts[p])throw Error('Dữ liệu đáp án sai mã, phần hoặc số câu');keys[code]||={I:[],II:[],III:[]};keys[code][p][q-1]=String(row[ai]??'').trim();}
  }
  for(const [code,key] of Object.entries(keys))for(const part of ['I','II','III'])if(key[part].length!==exam.counts[part]||key[part].some(x=>!x))throw Error('Mã '+code+' thiếu đáp án phần '+part);
  Object.assign(exam.keys,keys);save();toast('Đã nhập '+Object.keys(keys).length+' mã đề.');}
 catch(e){toast('Không nhập được đáp án: '+e.message);}finally{ev.target.value='';}
},{capture:true});
async function loadJsQR(){if(globalThis.jsQR)return globalThis.jsQR;if(!qrScript)qrScript=loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js','jsQR');await qrScript;return globalThis.jsQR;}
async function readQR(source){
 const w=source.videoWidth||source.naturalWidth||source.width,h=source.videoHeight||source.naturalHeight||source.height;if(!w||!h)throw Error('Camera QR chưa sẵn sàng');
 const c=$('qrCanvas'),k=Math.min(1,1700/Math.max(w,h));c.width=Math.max(2,Math.round(w*k));c.height=Math.max(2,Math.round(h*k));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,c.width,c.height);
 if('BarcodeDetector' in globalThis){try{qrDetector||=new BarcodeDetector({formats:['qr_code']});const codes=await qrDetector.detect(c);if(codes.length)return codes[0].rawValue;}catch(e){console.debug(e.message);}}
 const lib=await loadJsQR(),data=ctx.getImageData(0,0,c.width,c.height);return lib(data.data,data.width,data.height,{inversionAttempts:'attemptBoth'})?.data||'';
}
function stopQR(){cancelAnimationFrame(qrRAF);qrRAF=0;if(qrStream){qrStream.getTracks().forEach(x=>x.stop());qrStream=null;}$('qrVideo').srcObject=null;qrBusy=false;}
function closeQR(){stopQR();$('qrDialog').close();}
$('qrClose').onclick=closeQR;$('qrDialog').addEventListener('close',stopQR);
function openQR(type){qrMode=type;$('qrDialogTitle').textContent=type==='answer_key'?'Quét QR đáp án ChấmPro':'Quét QR học sinh';$('qrStatus').textContent='Đặt mã QR tạo tại menu Tạo QR vào camera';$('qrDialog').showModal();}
$('qrAnswerOpen').onclick=()=>{if(!db().exams.some(e=>e.id===$('keyExam').value))return toast('Hãy chọn môn/kỳ kiểm tra');openQR('answer_key');};
$('qrStudentOpen').onclick=()=>openQR('student_list');
async function applyQR(raw){
 let payload;
 try{payload=await decodeChamProQR(raw);}
 catch(e){if(/giải nén gzip/.test(e.message)){await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js','pako');payload=await decodeChamProQR(raw);}else throw e;}
 if(payload.type!==qrMode)throw Error('Loại mã QR không đúng mục đang nhập');
 if(qrMode==='student_list'){
  const students=studentsFromQR(payload),added=students.filter(s=>!db().students.some(x=>x.sbd===s.sbd));if(students.some(s=>!s.classroom)){const cl=prompt('QR có học sinh chưa có tên lớp. Nhập lớp để sử dụng bảng điểm (ví dụ 12A10):','');if(!cl)return;students.forEach(s=>{if(!s.classroom)s.classroom=cl.trim();});}
  if(!confirm('Mã QR có '+students.length+' học sinh, '+added.length+' mới. Nhập danh sách?'))return;
  for(const s of added)db().students.push({id:crypto.randomUUID?.()||String(Date.now())+'-'+s.sbd,...s});save();toast('Đã nhập '+added.length+' học sinh bằng QR.');
 }else{
  const exam=db().exams.find(e=>e.id===$('keyExam').value);const keys=keysFromQR(payload,exam);
  if(!confirm('Nhập '+Object.keys(keys).length+' mã đề của môn '+(exam.subject||'')+'?'))return;
  Object.assign(exam.keys,keys);save();toast('Đã nhập '+Object.keys(keys).length+' mã đề từ QR.');
 }
 closeQR();
}
async function scanLoop(){if(!qrStream||!$('qrDialog').open)return;const now=performance.now();if(!qrBusy&&now-lastScanAt>260){qrBusy=true;lastScanAt=now;try{const raw=await readQR($('qrVideo'));if(raw){stopQR();$('qrStatus').textContent='Đã tìm thấy QR, đang kiểm tra...';await applyQR(raw);return;}}catch(e){$('qrStatus').textContent=e.message;}finally{qrBusy=false;}}qrRAF=requestAnimationFrame(scanLoop);}
$('qrStart').onclick=async()=>{try{stopQR();qrStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:960}},audio:false});$('qrVideo').srcObject=qrStream;await $('qrVideo').play();$('qrStatus').textContent='Đang tìm mã QR...';qrRAF=requestAnimationFrame(scanLoop);}catch(e){$('qrStatus').textContent='Không mở được QR: '+e.message;}};
$('qrFile').onchange=async ev=>{try{const f=ev.target.files[0];if(!f)return;const url=URL.createObjectURL(f),img=new Image();await new Promise((ok,fail)=>{img.onload=ok;img.onerror=()=>fail(Error('Ảnh không đọc được'));img.src=url;});const raw=await readQR(img);URL.revokeObjectURL(url);if(!raw)throw Error('Không thấy QR trong ảnh');await applyQR(raw);}catch(e){$('qrStatus').textContent=e.message;}finally{ev.target.value='';}};
$('qrPaste').onclick=async()=>{const v=prompt('Dán nội dung QR Web ChấmPro:');if(v)try{await applyQR(v.trim());}catch(e){$('qrStatus').textContent=e.message;}};
window.addEventListener('champro-db-updated',showGroups);
showGroups();
