import {grade,parseRows,toCsv,validateForSave} from './grader.mjs';
import {readSheet} from './omr.mjs';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storedKey='champro-web-beta-v1';
const fresh=()=>({schema:1,exams:[],students:[],results:[]});
let db=fresh(),layouts=null,cvPromise=null,stream=null,autoTimer=null,captureBusy=false,review=null,lastAuto=null,lastSaved='',installPrompt=null,lastReviewImage='',cameraRotation=0;
try{const old=JSON.parse(localStorage.getItem(storedKey)||'null');if(old&&Array.isArray(old.exams)&&Array.isArray(old.students)&&Array.isArray(old.results))db=old;}catch(e){console.warn('localStorage invalid',e)}
const id=()=>globalThis.crypto?.randomUUID?.()||String(Date.now())+'-'+Math.random().toString(16).slice(2);
function save(){try{localStorage.setItem(storedKey,JSON.stringify(db));}catch(e){toast('Không lưu được: bộ nhớ trình duyệt đầy. Hãy xuất bản sao lưu.');throw e;}render();window.dispatchEvent(new Event('champro-db-updated'));}
function toast(m){$('toast').textContent=m;clearTimeout(toast._t);toast._t=setTimeout(()=>$('toast').textContent='',6200);}
function navigate(page){document.body.classList.toggle('scan-active',page==='scan');document.querySelectorAll('.page').forEach(x=>x.classList.toggle('shown',x.id==='page-'+page));document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===page));if(page!=='scan')stopCamera();window.scrollTo({top:0,behavior:'smooth'});}
function parseLines(text){return String(text||'').split(/\r?\n/).map(x=>x.trim());}
function sendFile(name,text,type='text/plain;charset=utf-8'){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);}
function examOptions(target,all=false){const prev=target.value;target.innerHTML=(all?'<option value="">Tất cả</option>':'<option value="">-- Chọn kỳ kiểm tra --</option>')+db.exams.map(e=>`<option value="${esc(e.id)}">${esc([e.gradeClass,e.name,e.subject].filter(Boolean).join(' · '))}</option>`).join('');if([...target.options].some(x=>x.value===prev)&&prev)target.value=prev;
 else if(!all&&db.exams.length)target.value=db.exams[0].id;}
function selectedExam(selector='scanExam'){return db.exams.find(x=>x.id===$(selector).value);}
function render(){
 $('statExams').textContent=new Set(db.exams.map(e=>JSON.stringify([e.gradeClass||'',e.name]))).size;$('statStudents').textContent=db.students.length;$('statResults').textContent=db.results.length;$('statLast').textContent=db.results.length?String(db.results.at(-1).score)+'đ':'—';
 ['scanExam','keyExam','filterExam'].forEach((x,i)=>examOptions($(x),i===2));
 $('examList').innerHTML=db.exams.length?db.exams.map(e=>`<div class="record"><div><strong>${esc([e.gradeClass,e.name,e.subject].filter(Boolean).join(' · '))}</strong><small>${e.form==='120'?'120 câu':'3 phần'} · Mã ${e.digits} số · ${Object.keys(e.keys||{}).length} mã đề</small></div><div class="actions"><button class="outline" data-editexam="${esc(e.id)}">Đáp án</button><button class="outline" data-delexam="${esc(e.id)}">Xóa</button></div></div>`).join(''):'<p class="muted">Chưa có kỳ kiểm tra. Hãy tạo ở bên trái.</p>';
 renderStudents();renderResults();
}
function renderStudents(){const keyword=$('studentSearch').value.toLowerCase();const rows=db.students.filter(s=>(s.sbd+' '+s.name+' '+s.classroom).toLowerCase().includes(keyword)).sort((a,b)=>a.classroom.localeCompare(b.classroom)||a.sbd.localeCompare(b.sbd));
 $('studentsTable').innerHTML=rows.map(s=>`<tr><td>${esc(s.sbd)}</td><td>${esc(s.name)}</td><td>${esc(s.classroom)}</td><td><button class="outline" data-delstudent="${esc(s.id)}">Xóa</button></td></tr>`).join('')||'<tr><td colspan="4">Chưa có học sinh.</td></tr>';}
function filteredResults(){const e=$('filterExam').value,q=$('resultsSearch').value.toLowerCase();return db.results.filter(r=>(!e||r.examId===e)&&(!q||(r.studentName+' '+r.sbd+' '+r.examCode).toLowerCase().includes(q))).sort((a,b)=>b.savedAt.localeCompare(a.savedAt));}
function renderResults(){$('resultsTable').innerHTML=filteredResults().map(r=>`<tr><td>${esc(new Date(r.savedAt).toLocaleString('vi-VN'))}</td><td>${esc(db.exams.find(e=>e.id===r.examId)?.subject||r.subject||'')}</td><td>${esc(r.studentName)}</td><td>${esc(r.sbd)}</td><td>${esc(r.examCode)}</td><td class="grade">${esc(r.score)} / ${esc(r.max)}</td><td><button class="outline" data-result="${esc(r.id)}">Xem</button></td></tr>`).join('')||'<tr><td colspan="7">Chưa có kết quả.</td></tr>';}
function validateExamInput(f){const form=f.get('form'),digits=Number(f.get('digits')),counts={I:Number(f.get('cI')),II:Number(f.get('cII')),III:Number(f.get('cIII'))};if(!f.get('name')?.trim())throw Error('Hãy nhập tên kỳ kiểm tra');if(![3,4].includes(digits))throw Error('Mã đề phải có 3 hoặc 4 chữ số');if(Object.values(counts).some(x=>!Number.isInteger(x)||x<0))throw Error('Số câu không hợp lệ');if(form==='120'&&(counts.I>120||counts.II||counts.III))throw Error('Phiếu 120 câu chỉ dùng phần I (tối đa 120 câu).');if(form==='three'&&(counts.I>40||counts.II>8||counts.III>6))throw Error('Phiếu 3 phần chỉ hỗ trợ I≤40, II≤8, III≤6 trên mẫu giấy gốc.');return {form,digits,counts};}
$('examForm').addEventListener('submit',ev=>{ev.preventDefault();try{const f=new FormData(ev.target);const v=validateExamInput(f);const gradeClass=String(f.get('gradeClass')||'').trim(),subject=String(f.get('subject')||'').trim(),period=String(f.get('name')||'').trim();
if(!gradeClass||!subject)throw Error('Cần nhập Khối/Lớp và Môn học');
if(db.exams.some(e=>String(e.gradeClass||'').toLowerCase()===gradeClass.toLowerCase()&&e.name.toLowerCase()===period.toLowerCase()&&String(e.subject||'').toLowerCase()===subject.toLowerCase()))throw Error('Môn này đã có trong kỳ kiểm tra. Hãy mở để nhập mã đề khác.');
db.exams.push({id:id(),name:period,gradeClass,subject,...v,keys:{},rules:{I:v.form==='120'?10/120:.25,II:[0,.1,.25,.5,1],III:.25}});save();ev.target.reset();toast('Đã thêm môn vào kỳ kiểm tra. Tiếp tục nhập bộ đáp án.');}catch(e){toast(e.message);}});
document.querySelector('[name=form]').addEventListener('change',ev=>{const f=$('examForm');if(ev.target.value==='120'){f.elements.cI.value=120;f.elements.cII.value=0;f.elements.cIII.value=0;}else{f.elements.cI.value=18;f.elements.cII.value=4;f.elements.cIII.value=6;}});
function codeEditor(){const e=selectedExam('keyExam');const code=$('keyCode').value.trim();const k=e?.keys?.[code];if(!e)return; if(!/^\d{3,4}$/.test(code)){toast('Nhập mã đề 3 hoặc 4 số.');return;}
 $('ruleI').value=e.rules?.I??.25;$('ruleIII').value=e.rules?.III??.25;$('ruleII').value=(e.rules?.II||[0,.1,.25,.5,1]).slice(1).join(',');
 for(const p of ['I','II','III'])$('key'+p).value=(k?.[p]||[]).join('\n');
 toast(k?'Đã mở bộ đáp án':'Mã đề mới. Hãy nhập đáp án rồi lưu.');}
$('loadKey').onclick=codeEditor;
$('keyExam').addEventListener('change',()=>{const e=selectedExam('keyExam');if(e){$('keyCode').value=Object.keys(e.keys||{})[0]||''.padStart(e.digits,'0');codeEditor();}});
$('saveKey').onclick=()=>{try{const e=selectedExam('keyExam'),code=$('keyCode').value.trim();if(!e)throw Error('Chưa chọn kỳ kiểm tra');if(!new RegExp('^\\d{'+e.digits+'}$').test(code))throw Error('Mã đề phải đúng '+e.digits+' chữ số');
 const I=parseLines($('keyI').value),II=parseLines($('keyII').value),III=parseLines($('keyIII').value);
 for(const p of ['I','II','III'])if(({I,II,III})[p].filter(Boolean).length!==e.counts[p])throw Error(`Phần ${p} phải có đủ ${e.counts[p]} dòng đáp án`);
 if(I.some(x=>x&&!/^(ALL|[ABCD](\|[ABCD])*)$/i.test(x)))throw Error('Phần I: nhập A–D, A|C hoặc ALL');
 if(II.some(x=>x&&!/^(ALL|[ĐSDđsd]{4})$/.test(x)))throw Error('Phần II: mỗi dòng gồm Đ/S bốn ý hoặc ALL');
 const partII=[0,...$('ruleII').value.split(',').map(x=>Number(x.trim()))];if(partII.length!==5||partII.some(x=>!Number.isFinite(x)||x<0))throw Error('Điểm phần II phải gồm bốn số không âm');
 e.rules={I:Number($('ruleI').value),II:partII,III:Number($('ruleIII').value)};
 if(!Number.isFinite(e.rules.I)||!Number.isFinite(e.rules.III)||e.rules.I<0||e.rules.III<0)throw Error('Điểm số không hợp lệ');
 e.keys[code]={I,II:II.map(s=>s.toUpperCase().replaceAll('D','Đ')),III};save();toast(`Đã lưu mã đề ${code}.`);
 }catch(e){toast('Chưa lưu: '+e.message);}};
$('examList').addEventListener('click',ev=>{const edit=ev.target.closest('[data-editexam]'),del=ev.target.closest('[data-delexam]');if(edit){$('keyExam').value=edit.dataset.editexam;const e=selectedExam('keyExam');$('keyCode').value=Object.keys(e?.keys||{})[0]||''.padStart(e?.digits||3,'0');codeEditor();$('keyEditor').scrollIntoView({behavior:'smooth'});}if(del){const e=db.exams.find(x=>x.id===del.dataset.delexam);if(!confirm(`Xóa kỳ ${e?.name}? Kết quả đã lưu vẫn được giữ.`))return;db.exams=db.exams.filter(x=>x.id!==del.dataset.delexam);save();}});
$('exportKeys').onclick=()=>sendFile('ChamPro_Mau_Nhap_Dap_An.csv',toCsv([['ma_de','phan','cau','dap_an'],['101','I','1','A'],['101','II','1','ĐSĐS'],['101','III','1','1.5']]),'text/csv;charset=utf-8');
$('studentForm').onsubmit=ev=>{ev.preventDefault();try{const f=new FormData(ev.target),sbd=String(f.get('sbd')||'').trim().padStart(6,'0');if(!/^\d{6}$/.test(sbd))throw Error('SBD phải có 6 chữ số');if(db.students.some(s=>s.sbd===sbd))throw Error('SBD đã có trong danh sách');db.students.push({id:id(),sbd,name:String(f.get('name')||'').trim(),classroom:String(f.get('classroom')||'').trim()});save();ev.target.reset();toast('Đã thêm học sinh');}catch(e){toast(e.message);}};
$('studentsTable').addEventListener('click',ev=>{const btn=ev.target.closest('[data-delstudent]');if(!btn)return;const s=db.students.find(x=>x.id===btn.dataset.delstudent);if(confirm('Xóa học sinh '+(s?.name||'')+'?')){db.students=db.students.filter(x=>x.id!==btn.dataset.delstudent);save();}});
$('studentSearch').oninput=renderStudents;$('resultsSearch').oninput=renderResults;$('filterExam').onchange=renderResults;
$('studentsSample').onclick=()=>sendFile('ChamPro_Mau_Danh_Sach_Hoc_Sinh.csv',toCsv([['SBD','Họ tên','Lớp'],['001234','Nguyễn Văn A','12A10']]),'text/csv;charset=utf-8');
async function spreadsheetRows(file,sheetName=null){if(/\.csv$/i.test(file.name))return parseRows(await file.text());if(!/\.xlsx?$/i.test(file.name))throw Error('Chỉ hỗ trợ CSV/XLS/XLSX');
 if(!window.XLSX)await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js','XLSX');
 const data=await file.arrayBuffer(),wb=window.XLSX.read(data,{type:'array',cellText:true});return window.XLSX.utils.sheet_to_json((wb.Sheets[sheetName]||wb.Sheets[wb.SheetNames[0]]),{header:1,defval:'',raw:false});}
async function loadScript(src,globalName){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=resolve;s.onerror=()=>reject(Error('Không tải được thư viện. Cần Internet ở lần sử dụng đầu.'));document.head.append(s);});if(globalName&&!window[globalName])throw Error('Thư viện chưa khởi tạo');}
$('studentsFile').onchange=async ev=>{try{const file=ev.target.files[0];if(!file)return;const rows=await spreadsheetRows(file);const header=(rows[0]||[]).map(x=>String(x).trim().toLowerCase().replace(/\s+/g,''));const idx=(...names)=>header.findIndex(x=>names.includes(x));let i=idx('sbd','sốbáodanh','sob aodanh'.replaceAll(' ',''),'sốbáodanh'.normalize('NFD').replace(/[\u0300-\u036f]/g,'')),j=idx('họtên','hoten','name','fullname'),k=idx('lớp','lop','classroom');if(i<0||j<0)throw Error('Thiếu cột SBD và Họ tên');let added=0;for(const row of rows.slice(1)){const sbd=String(row[i]??'').replace(/\.0$/,'').trim().padStart(6,'0'),name=String(row[j]??'').trim();if(!/^\d{6}$/.test(sbd)||!name||db.students.some(s=>s.sbd===sbd))continue;db.students.push({id:id(),sbd,name,classroom:k<0?'':String(row[k]??'').trim()});added++;}save();toast('Đã nhập '+added+' học sinh mới.');}catch(e){toast('Không nhập được: '+e.message);}ev.target.value='';};
$('keysFile').onchange=async ev=>{try{const e=selectedExam('keyExam');if(!e)throw Error('Hãy chọn kỳ kiểm tra trước');const file=ev.target.files[0];if(!file)return;const rows=await spreadsheetRows(file),head=rows.shift().map(x=>String(x).toLowerCase().trim().replace(/\s+/g,''));const pos=(...a)=>head.findIndex(x=>a.includes(x));const c=pos('ma_de','mãđề','made'),p=pos('phan','phần'),q=pos('cau','câu'),a=pos('dap_an','đápán','dapan');if([c,p,q,a].some(x=>x<0))throw Error('Cần cột ma_de, phan, cau, dap_an');let changed=0;for(const row of rows){const code=String(row[c]??'').trim().replace(/\.0$/,'');const part=String(row[p]??'').trim().toUpperCase();const number=Number(row[q]);if(!new RegExp('^\\d{'+e.digits+'}$').test(code)||!['I','II','III'].includes(part)||!Number.isInteger(number)||number<1||number>e.counts[part])continue;const k=e.keys[code]||{I:[],II:[],III:[]};k[part][number-1]=String(row[a]??'').trim();e.keys[code]=k;changed++;}save();toast(`Đã nhập ${changed} ô đáp án. Kiểm tra đủ số câu trước khi chấm.`);}catch(e){toast('Không nhập được: '+e.message);}ev.target.value='';};
$('resultsCSV').onclick=()=>sendFile('ChamPro_Ket_Qua.csv',toCsv([['Thời gian','Kỳ kiểm tra','Môn học','Họ tên','Lớp','SBD','Mã đề','Điểm','Điểm tối đa','Phần I','Phần II','Phần III'],...filteredResults().map(r=>[r.savedAt,db.exams.find(e=>e.id===r.examId)?.name||r.period||'',db.exams.find(e=>e.id===r.examId)?.subject||r.subject||'',r.studentName,r.classroom,r.sbd,r.examCode,r.score,r.max,r.parts.I,r.parts.II,r.parts.III])]),'text/csv;charset=utf-8');
$('resultsTable').addEventListener('click',ev=>{const b=ev.target.closest('[data-result]');if(!b)return;const r=db.results.find(x=>x.id===b.dataset.result);if(!r)return;const e=db.exams.find(x=>x.id===r.examId);const d=$('reviewDialog');$('reviewBody').innerHTML=`<p><strong>${esc(r.studentName)}</strong> · ${esc(r.sbd)} · Mã đề ${esc(r.examCode)}</p><p class="success">Điểm: ${esc(r.score)} / ${esc(r.max)}</p><p>Phần I: ${esc(r.answers.I?.join(', '))}</p><p>Phần II: ${esc(r.answers.II?.join(' | '))}</p><p>Phần III: ${esc(r.answers.III?.join(' | '))}</p><p class="hint">${e?'Chi tiết được lưu tại thời điểm chấm.':'Đề gốc đã bị xóa.'}</p>`;$('saveReview').hidden=true;d.showModal();});
$('backupBtn').onclick=()=>sendFile('ChamPro_SaoLuu_'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(db,null,2),'application/json');
$('restoreFile').onchange=async ev=>{try{const f=ev.target.files[0];if(!f)return;const data=JSON.parse(await f.text());if(!Array.isArray(data.exams)||!Array.isArray(data.students)||!Array.isArray(data.results)||data.schema!==1)throw Error('Không phải tệp sao lưu đúng định dạng');if(!confirm(`Khôi phục ${data.exams.length} kỳ kiểm tra, ${data.students.length} học sinh, ${data.results.length} bài? Dữ liệu hiện tại sẽ bị thay thế.`))return;db=data;save();toast('Đã khôi phục dữ liệu');}catch(e){toast(e.message)}ev.target.value='';};
// Camera, auto scanning, OCR gating.
// Do not depend on a single external host: try the local GitHub Pages vendor first.
async function loadOpenCvScript(url){
 return new Promise((resolve,reject)=>{
  const tag=document.createElement('script');tag.src=url;tag.async=true;
  const timer=setTimeout(()=>{tag.remove();reject(Error('Quá thời gian tải '+url));},20000);
  tag.onload=()=>{clearTimeout(timer);resolve();};
  tag.onerror=()=>{clearTimeout(timer);tag.remove();reject(Error('Không kết nối được '+url));};
  document.head.appendChild(tag);
 });
}
async function awaitCvReady(){
 if(window.cv&&typeof window.cv.then==='function'){
  window.cv=await Promise.race([Promise.resolve(window.cv),new Promise((_,reject)=>setTimeout(()=>reject(Error('OpenCV khởi tạo quá lâu')),35000))]);
 }
 const start=performance.now();
 while(!window.cv?.Mat){
  if(performance.now()-start>35000)throw Error('OpenCV không tạo được đối tượng Mat');
  await new Promise(r=>setTimeout(r,180));
 }
 return window.cv;
}
async function ensureCv(){
 if(window.cv?.Mat)return window.cv;
 if(cvPromise)return cvPromise;
 $('cvStatus').textContent='Đang tải bộ nhận diện ảnh…';
 cvPromise=(async()=>{
  const sources=['./vendor/opencv.js',
    'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
    'https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js',
    'https://docs.opencv.org/4.10.0/opencv.js'];
  const errors=[];
  for(const src of sources){
   try{
    $('scanStatus').textContent='Đang khởi động bộ nhận diện ảnh…';
    if(!window.cv)await loadOpenCvScript(src);
    const ready=await awaitCvReady();
    $('cvStatus').textContent='Bộ nhận diện đã sẵn sàng';
    $('scanStatus').textContent='Bộ nhận diện đã sẵn sàng · Đưa đủ 4 ô đen vào vùng ngắm';
    return ready;
   }catch(e){
    errors.push(src.split('/')[2]||'tệp cục bộ');
    console.warn('OpenCV load failed',src,e);
    if(window.cv&&!window.cv.Mat)window.cv=null;
   }
  }
  throw Error('Không tải được OpenCV từ '+errors.join(', ')+'. Hãy kiểm tra mạng và thử nút "Kiểm tra bộ xử lý ảnh".');
 })().catch(e=>{cvPromise=null;$('cvStatus').textContent='Lỗi bộ nhận diện ảnh';throw e});
 return cvPromise;
}
async function ensureLayouts(){if(!layouts){const r=await fetch('./layouts.json',{cache:'force-cache'});if(!r.ok)throw Error('Không tải được tọa độ mẫu phiếu');layouts=await r.json();}return layouts;}
// The four outer printed fiducials are A4 portrait: 547.28 x 793.89 PDF points.
// Never resize the guide's X and Y independently: that made it look square on phones.
// object-fit:contain keeps the complete frame; the guide is fitted ONLY in visible pixels.
const FIDUCIAL_ASPECT=547.2756/793.8898;
function cameraGuideMetrics(sw,sh,videoW,videoH){
 if(!(sw>0&&sh>0&&videoW>0&&videoH>0))return null;
 const aspect=videoW/videoH;
 const viewW=Math.min(sw,sh*aspect),viewH=Math.min(sh,sw/aspect);
 const markerW=Math.min(viewW*.90,viewH*.90*FIDUCIAL_ASPECT);
 const markerH=markerW/FIDUCIAL_ASPECT;
 return {viewW,viewH,markerW,markerH,aspect};
}
function fitGuideToVisibleVideo(){
 const v=$('video'),surface=$('cameraSurface'),guide=$('captureGuide'),note=$('videoFormatNote');
 // Never infer physical document orientation merely from videoWidth/videoHeight.
 // Mobile camera metadata may report landscape frames even while the preview is upright.
 const rotated=cameraRotation!==0;
 v.classList.toggle('rotate-landscape',rotated);
 v.style.setProperty('--camera-rotation',cameraRotation+'deg');
 if(rotated){v.style.width=surface.clientHeight+'px';v.style.height=surface.clientWidth+'px';}
 else {v.style.width='';v.style.height='';}
 // The video uses object-fit: cover. Calculate the A4 marker guide from the
 // visible portrait viewport, not from the uncropped landscape camera ratio.
 // The original, un-cropped camera frame is still used to read OMR.
 const sw=surface.clientWidth,sh=surface.clientHeight;
 if(!(sw>0&&sh>0&&v.videoWidth&&v.videoHeight)){
  guide.style.width='';guide.style.height='';
  if(note)note.textContent='Khung phiếu A4 · giữ điện thoại dọc';
  return;
 }
 const markerH=Math.min(sh*.88,sw*.91/FIDUCIAL_ASPECT);
 const markerW=markerH*FIDUCIAL_ASPECT;
 guide.style.width=Math.round(markerW)+'px';
 guide.style.height=Math.round(markerH)+'px';
 if(note)note.textContent='Camera toàn khung · vùng A4 '+v.videoWidth+'×'+v.videoHeight+(rotated?' · Xoay '+cameraRotation+'°':'');
}
$('video').addEventListener('loadedmetadata',fitGuideToVisibleVideo);
$('video').addEventListener('resize',fitGuideToVisibleVideo);
window.addEventListener('resize',fitGuideToVisibleVideo);
if(typeof ResizeObserver!=='undefined')new ResizeObserver(fitGuideToVisibleVideo).observe($('cameraSurface'));
async function startCamera(){if(stream)return;try{if(!navigator.mediaDevices?.getUserMedia)throw Error('Cần HTTPS và trình duyệt hỗ trợ camera');const cameraOptions={audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1080},height:{ideal:1440},aspectRatio:{ideal:3/4},frameRate:{ideal:30,max:30}}};
let s;try{s=await navigator.mediaDevices.getUserMedia(cameraOptions);}catch(firstError){
 // Some browsers/cameras reject portrait constraints; fall back to rear camera.
 s=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'}}});
}stream=s;$('video').srcObject=s;await $('video').play();fitGuideToVisibleVideo();$('cameraPlaceholder').hidden=true;$('scanMode').textContent='Camera đang mở';$('scanStatus').textContent='Đặt phiếu phẳng, đủ 4 ô đen trong hình';if($('autoScan').checked)autoTimer=setInterval(autoScanOnce,750);void Promise.all([ensureCv(),ensureLayouts()]).catch(e=>{$('scanStatus').textContent='Chưa tải được bộ đọc ảnh: '+e.message;});}catch(e){toast('Camera: '+e.message);$('scanStatus').textContent=e.message;}}
function stopCamera(){if(autoTimer){clearInterval(autoTimer);autoTimer=null;}if(stream){stream.getTracks().forEach(x=>x.stop());stream=null;}$('video').srcObject=null;$('cameraPlaceholder').hidden=false;$('scanMode').textContent='Đã dừng';lastAuto=null;}
$('startCamera').onclick=startCamera;$('stopCamera').onclick=stopCamera;
$('rotateCamera').onclick=()=>{cameraRotation=cameraRotation===0?270:cameraRotation===270?90:0;fitGuideToVisibleVideo();$('scanStatus').textContent=cameraRotation?'Đã xoay khung hình '+cameraRotation+'°; tiếp tục quét.':'Đã khôi phục hướng camera gốc.';};
$('autoScan').onchange=()=>{if(autoTimer){clearInterval(autoTimer);autoTimer=null;}if(stream&&$('autoScan').checked)autoTimer=setInterval(autoScanOnce,750);};
$('torch').onclick=async()=>{try{const t=stream?.getVideoTracks()[0];if(!t)throw Error('Camera chưa mở');const can=t.getCapabilities?.();if(!can?.torch)throw Error('Thiết bị hoặc trình duyệt không hỗ trợ đèn');await t.applyConstraints({advanced:[{torch:!Boolean(t.getSettings().torch)}]});}catch(e){toast(e.message);}};
function captureVideo(){
 const v=$('video');if(!stream||!v.videoWidth)throw Error('Camera chưa sẵn sàng');
 const scale=Math.min(1,1500/Math.max(v.videoWidth,v.videoHeight));
 const w=Math.round(v.videoWidth*scale),h=Math.round(v.videoHeight*scale);
 const c=$('capture');c.width=cameraRotation?h:w;c.height=cameraRotation?w:h;
 const ctx=c.getContext('2d',{willReadFrequently:true});
 if(cameraRotation===90){ctx.translate(c.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(v,0,0,w,h);}
 else if(cameraRotation===270){ctx.translate(0,c.height);ctx.rotate(-Math.PI/2);ctx.drawImage(v,0,0,w,h);}
 else ctx.drawImage(v,0,0,w,h);
 return c;
}
function imageCanvas(img){const c=$('capture'),scale=Math.min(1,2000/Math.max(img.naturalWidth,img.naturalHeight));c.width=Math.round(img.naturalWidth*scale);c.height=Math.round(img.naturalHeight*scale);c.getContext('2d',{willReadFrequently:true}).drawImage(img,0,0,c.width,c.height);return c;}
// Camera sensors may expose sideways frames despite the phone being upright.
// Inspect actual OMR geometry in 0/90/270/180-degree versions, not videoWidth alone.
// After a successful read, keep the winning orientation to speed up subsequent frames.
function rotatedCanvas(original,degrees){
 if(!degrees)return original;
 const w=original.width,h=original.height;
 const c=document.createElement('canvas');
 c.width=degrees===90||degrees===270?h:w;
 c.height=degrees===90||degrees===270?w:h;
 const g=c.getContext('2d',{willReadFrequently:true});
 if(degrees===90){g.translate(c.width,0);g.rotate(Math.PI/2);}
 else if(degrees===270){g.translate(0,c.height);g.rotate(-Math.PI/2);}
 else if(degrees===180){g.translate(c.width,c.height);g.rotate(Math.PI);}
 g.drawImage(original,0,0);
 return c;
}
let lastGoodOrientation=0,scanDirectionAttempt=0;
async function trySheetOrientations(c,layout,cv,exam,manual=false){
 const results=[],errors=[];
 const normal=[lastGoodOrientation,0,90,270,180].filter((v,i,all)=>all.indexOf(v)===i);
 // Most frames use only the previous valid angle; periodically try all angles
 // until a real student and exam code are read, including sideways sensor frames.
 const fullSearch=manual||(++scanDirectionAttempt%4===0&&!lastAuto);
 const directions=fullSearch?normal:normal.slice(0,1);
 for(const deg of directions){
  // Yield before entering synchronous OpenCV: update the progress message on Samsung.
  await new Promise(resolve=>requestAnimationFrame(resolve));
  try{
   const result=readSheet(rotatedCanvas(c,deg),layout,cv,exam.counts);
   const knownStudent=db.students.some(x=>x.sbd===result.sbd);
   const knownCode=Boolean(exam.keys?.[result.examCode]);
   const score=(knownStudent?3:0)+(knownCode?3:0)+(result.confidence||0)*3-
    Math.min(2,(result.uncertain?.length||0)*.025);
   results.push({result,deg,score,knownStudent,knownCode});
   if(knownCode&&knownStudent&&result.confidence>=.98&&!result.uncertain.length){lastGoodOrientation=deg;break;}
  }catch(e){errors.push(deg+'°: '+e.message);}
 }
 if(!results.length)throw Error('Không xác định được mốc phiếu ('+errors.slice(0,2).join(' | ').slice(0,180)+')');
 results.sort((a,b)=>b.score-a.score);
 if(results[0].knownStudent&&results[0].knownCode)lastGoodOrientation=results[0].deg;
 return results[0];
}
async function readCanvas(c,manual=false,origin='camera'){if(captureBusy)return;const exam=selectedExam();if(!exam){$('scanStatus').textContent='Chưa chọn môn/kỳ kiểm tra. Hãy tạo đề, nhập đáp án và chọn kỳ kiểm tra trước khi chấm.';if(manual)toast('Hãy tạo và chọn kỳ kiểm tra trước');return;}
 if(!manual&&!db.students.length){$('scanStatus').textContent='Chưa có danh sách học sinh. Vào mục Học sinh để nhập SBD trước khi chấm tự động.';return;}
 if(!manual&&!Object.keys(exam.keys||{}).length){$('scanStatus').textContent='Chưa có bộ đáp án cho '+(exam.subject||exam.name)+'. Vào Đề & đáp án để nhập mã đề trước khi chấm.';return;}
 captureBusy=true;if(manual)lastReviewImage=c.toDataURL('image/jpeg',.65);const t0=performance.now();$('scanStatus').textContent='Đang phân tích phiếu…';await new Promise(resolve=>requestAnimationFrame(resolve));try{
  const [cv,geometry]=await Promise.all([ensureCv(),ensureLayouts()]);
  const key='ChamPro_Phieu_'+(exam.form==='120'?'120Cau':'3Phan')+'_MaDe'+exam.digits;
  if(!geometry[key])throw Error('Không có tọa độ mẫu phiếu '+key);
  const match=await trySheetOrientations(c,geometry[key],cv,exam,manual),result=match.result;
  if(match.deg&&origin==='camera'&&stream&&match.knownCode&&match.knownStudent&&result.confidence>=.9){
   cameraRotation=(cameraRotation+match.deg)%360;
   fitGuideToVisibleVideo();
   $('scanStatus').textContent='Đã tự hiệu chỉnh hướng phiếu '+match.deg+'°';
  }
  if(match.knownCode&&match.knownStudent&&result.confidence>=.9){$('captureGuide').classList.add('detected');setTimeout(()=>$('captureGuide').classList.remove('detected'),550);}$('scanInfo').textContent=`Đã đọc SBD ${result.sbd||'?'}, mã đề ${result.examCode||'?'}; độ tin cậy ${(result.confidence*100).toFixed(0)}%; ${result.uncertain.length} ô cần xem. ${(performance.now()-t0).toFixed(0)} ms`;
  $('scanStatus').textContent='Đã nhận diện SBD '+(result.sbd||'?')+' · mã đề '+(result.examCode||'?')+' · '+(performance.now()-t0).toFixed(0)+' ms';
  if(manual){openReview(exam,result);return;}
  const student=db.students.find(s=>s.sbd===result.sbd),issues=validateForSave(exam,student,result);
  if(result.confidence<.95)issues.push('SBD hoặc mã đề chưa đủ tin cậy');
  if(issues.length){lastAuto=null;$('scanStatus').textContent='Chưa thể lưu: '+issues.slice(0,3).join('; ');$('scanInfo').textContent+=' | '+issues.join('; ');return;}
  const fingerprint=JSON.stringify([exam.id,result.sbd,result.examCode,result.I.slice(0,exam.counts.I),result.II.slice(0,exam.counts.II),result.III.slice(0,exam.counts.III)]);
  if(lastAuto?.fingerprint!==fingerprint||Date.now()-lastAuto.time>7000){lastAuto={fingerprint,time:Date.now()};$('scanStatus').textContent='Đã nhận diện. Giữ yên để xác nhận lần hai…';return;}
  if(lastSaved===exam.id+student.id+result.examCode){$('scanStatus').textContent='Bài này vừa chấm; hãy đổi phiếu tiếp theo';return;}
  const done=saveResult(exam,student,result,true);lastSaved=exam.id+student.id+result.examCode;lastAuto=null;lastGoodOrientation=match.deg;
  $('scanStatus').textContent='Đã chấm: '+done.score+'/'+done.max+' điểm';
 }catch(e){if(manual)toast('Không nhận diện được: '+e.message+'; có thể nhập thủ công.');$('scanStatus').textContent='Không nhận diện: '+e.message;$('scanInfo').textContent='Lỗi nhận diện: '+e.message;lastAuto=null;if(manual){openReview(exam,{sbd:'',examCode:'',I:[],II:[],III:[],confidence:0,uncertain:['Chưa đọc được ảnh – nhập tay']});}}
 finally{captureBusy=false;}}
async function autoScanOnce(){if(!stream||captureBusy||$('reviewDialog').open||!$('autoScan').checked)return;try{await readCanvas(captureVideo(),false);}catch(e){$('scanStatus').textContent=e.message;}}
$('snap').onclick=async()=>{try{await readCanvas(captureVideo(),true);}catch(e){toast(e.message)}};
$('openPhoto').onclick=async()=>{const file=$('photoFile').files[0];if(!file)return toast('Hãy chọn ảnh phiếu trước');const url=URL.createObjectURL(file),img=new Image();img.onload=async()=>{try{await readCanvas(imageCanvas(img),true,'photo');}catch(e){toast(e.message);}finally{URL.revokeObjectURL(url);}};img.onerror=()=>{URL.revokeObjectURL(url);toast('Không mở được ảnh')};img.src=url;};
$('testEngine').onclick=async()=>{try{await Promise.all([ensureCv(),ensureLayouts()]);toast('OpenCV và 4 mẫu phiếu đã sẵn sàng');}catch(e){toast(e.message);}};
function openReview(exam,omr){review={exam,omr};const student=db.students.find(s=>s.sbd===omr.sbd);const info=omr.uncertain?.length?`<p class="warning">Có ${omr.uncertain.length} ô chưa rõ. Hãy kiểm tra với ảnh phiếu trước khi lưu.</p>`:'<p class="success">Đã nhận dạng. Kiểm tra SBD, mã đề và đáp án trước khi lưu.</p>';
 const field=(p,num,val,opts)=>`<label>${p} ${num}<input data-p="${p}" data-q="${num-1}" ${opts||''} value="${esc(val)}"></label>`;
 $('reviewBody').innerHTML=info+(lastReviewImage?`<details><summary>Ảnh phiếu đang kiểm tra (không lưu vào kết quả)</summary><img src="${lastReviewImage}" alt="Ảnh phiếu để đối chiếu" style="display:block;width:100%;max-height:460px;object-fit:contain;background:#0b1724;margin:8px 0 15px"></details>`:'')+`<div class="review-data"><label>Học sinh<select id="reviewStudent"><option value="">-- Chọn học sinh --</option>${db.students.map(s=>`<option value="${esc(s.id)}" ${student?.id===s.id?'selected':''}>${esc(s.sbd)} - ${esc(s.name)}</option>`).join('')}</select></label><label>SBD đọc từ phiếu<input id="reviewSbd" value="${esc(omr.sbd)}" maxlength="6" inputmode="numeric"></label><label>Mã đề<input id="reviewCode" value="${esc(omr.examCode)}" maxlength="4" inputmode="numeric"></label></div><h3>Phần I</h3><div class="answeredit">${Array.from({length:exam.counts.I},(_,i)=>field('I',i+1,omr.I?.[i]||'', 'maxlength="3"')).join('')}</div>${exam.counts.II?'<h3>Phần II (Đ/S, 4 ý)</h3><div class="answeredit">'+Array.from({length:exam.counts.II},(_,i)=>field('II',i+1,omr.II?.[i]||'', 'maxlength="4"')).join('')+'</div>':''}${exam.counts.III?'<h3>Phần III</h3><div class="answeredit">'+Array.from({length:exam.counts.III},(_,i)=>field('III',i+1,omr.III?.[i]||'', '')).join('')+'</div>':''}`;
 $('saveReview').hidden=false;$('reviewDialog').showModal();}
function saveResult(exam,student,ans,fromAuto=false){const value=grade(exam,{examCode:ans.examCode,I:ans.I,II:ans.II,III:ans.III});
 const exists=db.results.find(x=>x.examId===exam.id&&x.studentId===student.id);
 if(exists&&!fromAuto&&!confirm('Bài này đã được chấm. Ghi đè kết quả cũ?'))return null;
 if(exists&&fromAuto)throw Error('Bài đã có trong lịch sử, không chấm trùng');
 const record={id:exists?.id||id(),examId:exam.id,gradeClass:exam.gradeClass||student.classroom,subject:exam.subject||'',period:exam.name,studentId:student.id,studentName:student.name,classroom:student.classroom,sbd:student.sbd,examCode:ans.examCode,answers:{I:ans.I,II:ans.II,III:ans.III},score:value.total,max:value.max,parts:value.points,savedAt:new Date().toISOString()};
 db.results=db.results.filter(x=>x.id!==record.id);db.results.push(record);save();$('scanPerson').textContent=student.name;$('scanScore').textContent=`SBD ${student.sbd} · ${record.score}/${record.max} điểm`;$('scanMode').textContent='Đã chấm';
const flash=$('resultFlash');$('flashName').textContent=student.name;$('flashScore').textContent=`${record.score}/${record.max} điểm`;flash.hidden=false;clearTimeout(saveResult._flash);saveResult._flash=setTimeout(()=>{flash.hidden=true;$('scanMode').textContent='Sẵn sàng chấm bài tiếp';},1100);if(navigator.vibrate)try{navigator.vibrate(90);}catch{}return record;}
$('saveReview').onclick=()=>{try{if(!review)return;const student=db.students.find(s=>s.id===$('reviewStudent').value),exam=review.exam,sbd=$('reviewSbd').value.trim(),examCode=$('reviewCode').value.trim();if(!student)throw Error('Chưa chọn học sinh');if(student.sbd!==sbd)throw Error('SBD nhập không khớp học sinh. Sửa lại SBD hoặc chọn đúng học sinh');if(!exam.keys[examCode])throw Error('Không tìm thấy đáp án cho mã đề '+examCode);
 const answers={sbd,examCode,I:[],II:[],III:[]};document.querySelectorAll('#reviewBody input[data-p]').forEach(i=>{answers[i.dataset.p][Number(i.dataset.q)]=i.value.trim().toUpperCase()});
 if(!Object.values({I:answers.I,II:answers.II,III:answers.III}).flat().some(Boolean))throw Error('Chưa có câu trả lời nào');
 if(answers.I.some(x=>x&&!/^[ABCD]$/.test(x)))throw Error('Phần I chỉ chọn A/B/C/D');
 if(answers.II.some(x=>x&&!/^[ĐSD? ]{0,4}$/.test(x)))throw Error('Phần II chỉ nhập 4 ký tự Đ/S');
 const done=saveResult(exam,student,answers,false);if(!done)return;$('reviewDialog').close();toast('Đã chấm và lưu: '+done.score+'/'+done.max+' điểm');
 }catch(e){toast('Không lưu được: '+e.message);}};
$('closeReview').onclick=()=>$('reviewDialog').close();
// Offline PWA install prompt
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installBtn').hidden=false;});
$('installBtn').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('installBtn').hidden=true;}};
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
document.querySelectorAll('[data-goto]').forEach(el=>el.onclick=()=>navigate(el.dataset.goto));
$('nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)navigate(b.dataset.page)});
render();
export {getDb,save,toast,spreadsheetRows,loadScript,sendFile};
function getDb(){return db;}
