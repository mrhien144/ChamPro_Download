/** ChấmPro interactive answer-key editor. Existing text areas remain the source of truth. */
const byId=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lines=p=>byId('key'+p).value.split(/\r?\n/).map(x=>x.trim());
function getRow(p,q){return lines(p)[q]||'';}
function setRow(p,q,val){
 const el=byId('key'+p),n=Number(byId('flexAnswers').dataset['count'+p]||0),arr=lines(p);
 while(arr.length<n)arr.push('');
 arr[q]=val;el.value=arr.slice(0,n).join('\n');
 el.dispatchEvent(new Event('input',{bubbles:true}));
}
function chip(p,q,id,label,on){
 return '<label class="flex-chip'+(on?' active':'')+'"><input type="checkbox" data-fp="'+p+'" data-fq="'+q+'" data-fv="'+esc(id)+'"'+(on?' checked':'')+'><span>'+esc(label)+'</span></label>';
}
function multiRow(p,q){
 const val=getRow(p,q).toUpperCase().replaceAll('D','Đ'),all=val==='ALL';
 if(p==='I'){
  const values=new Set(val.split(/[|;,/ ]+/));
  return '<div class="flex-question"><strong>Câu '+(q+1)+'</strong><div class="flex-chips">'+
    ['A','B','C','D'].map(x=>chip(p,q,x,x,!all&&values.has(x))).join('')+
    chip(p,q,'ALL','Cho điểm toàn câu',all)+'</div></div>';
 }
 const letters=['a','b','c','d'];
 return '<div class="flex-question"><strong>Câu '+(q+1)+'</strong><div class="flex-chips">'+
  letters.map((l,i)=>{
   const v=val[i]||'';
   return '<div class="flex-sub"><b>Ý '+l+')</b>'+
    chip(p,q,i+'T','Đúng',!all&&(v==='Đ'||v==='*'))+
    chip(p,q,i+'F','Sai',!all&&(v==='S'||v==='*'))+'</div>';
  }).join('')+chip(p,q,'ALL','Cho điểm toàn câu',all)+'</div></div>';
}
function shortRow(q){
 const val=getRow('III',q),all=val.toUpperCase()==='ALL',values=all?['']:val.split('|');
 if(!values.length)values.push('');
 return '<div class="flex-question"><strong>Câu '+(q+1)+'</strong><div class="flex-short" data-short-group="'+q+'">'+
  values.map((v,i)=>'<div class="flex-shortline"><label>Đáp án '+(i+1)+'<input type="text" data-short-q="'+q+'" value="'+esc(v)+'"'+(all?' disabled':'')+' placeholder="Ví dụ: 0,35"></label>'+
  (values.length>1?'<button type="button" class="outline" data-short-remove="'+q+'" data-index="'+i+'">Xóa</button>':'')+'</div>').join('')+
  '<div class="flex-short-actions"><button type="button" class="outline" data-short-add="'+q+'"'+(all?' disabled':'')+'>+ Thêm đáp án</button>'+
  chip('III',q,'ALL','Cho điểm toàn câu',all)+'</div></div></div>';
}
export function refreshFlexibleKeyEditor(){
 const root=byId('flexAnswers');if(!root)return;
 if(!byId('keyExam').value){root.hidden=true;return;}
 for(const p of ['I','II','III']){
  const n=Number(root.dataset['count'+p]||0);
  byId('flex'+p).innerHTML=Array.from({length:n},(_,i)=>p==='III'?shortRow(i):multiRow(p,i)).join('');
 }
 root.hidden=false;
}
export function setFlexibleCounts(counts){
 const root=byId('flexAnswers');if(!root)return;
 for(const p of ['I','II','III'])root.dataset['count'+p]=String(Number(counts?.[p])||0);
 refreshFlexibleKeyEditor();
}
function syncShort(q){
 const group=byId('flexIII').querySelector('[data-short-group="'+q+'"]');
 if(!group)return;
 const values=[...group.querySelectorAll('input[data-short-q]')].map(x=>x.value.trim()).filter(Boolean);
 setRow('III',q,[...new Set(values)].join('|'));
}
function checked(p,q){
 return [...byId('flex'+p).querySelectorAll('input[data-fp="'+p+'"][data-fq="'+q+'"]:checked')].map(x=>x.dataset.fv);
}
export function initFlexibleKeyEditor(){
 const root=byId('flexAnswers');if(!root)return;
 root.addEventListener('change',event=>{
  const el=event.target;
  if(el.matches('[data-fp]')){
   const p=el.dataset.fp,q=Number(el.dataset.fq),v=el.dataset.fv;
   if(p==='I'){
    const a=checked(p,q);
    setRow(p,q,a.includes('ALL')?(v==='ALL'&&el.checked?'ALL':''):a.filter(x=>x!=='ALL').join('|'));
   }else if(p==='II'){
    const a=checked(p,q);
    if(v==='ALL'&&el.checked)setRow(p,q,'ALL');
    else{
     const selected=new Set(a.filter(x=>x!=='ALL')),parts=[];
     for(let i=0;i<4;i++){const t=selected.has(i+'T'),f=selected.has(i+'F');parts.push(t&&f?'*':t?'Đ':f?'S':'?');}
     setRow(p,q,parts.join(''));
    }
   }else if(p==='III'){
    setRow('III',q,v==='ALL'&&el.checked?'ALL':'');
   }
   refreshFlexibleKeyEditor();
  }else if(el.matches('[data-short-q]')){
   syncShort(Number(el.dataset.shortQ));refreshFlexibleKeyEditor();
  }
 });
 root.addEventListener('input',event=>{
  const el=event.target;if(el.matches('[data-short-q]'))syncShort(Number(el.dataset.shortQ));
 });
 root.addEventListener('click',event=>{
  const add=event.target.closest('[data-short-add]'),del=event.target.closest('[data-short-remove]');
  if(add){
   const q=Number(add.dataset.shortAdd),group=add.closest('[data-short-group]');
   const i=group.querySelectorAll('input[data-short-q]').length;
   const line=document.createElement('div');line.className='flex-shortline';
   const label=document.createElement('label');label.textContent='Đáp án '+(i+1);
   const input=document.createElement('input');input.type='text';input.dataset.shortQ=String(q);input.placeholder='Đáp án bổ sung';
   label.appendChild(input);line.appendChild(label);
   const button=document.createElement('button');button.type='button';button.className='outline';button.textContent='Xóa';
   button.dataset.shortRemove=String(q);button.dataset.index=String(i);line.appendChild(button);
   group.insertBefore(line,add.parentElement);input.focus();
  }else if(del){
   const q=Number(del.dataset.shortRemove),i=Number(del.dataset.index),group=del.closest('[data-short-group]');
   const items=[...group.querySelectorAll('.flex-shortline')];items[i]?.remove();syncShort(q);refreshFlexibleKeyEditor();
  }
 });
 for(const p of ['I','II','III'])byId('key'+p).addEventListener('change',refreshFlexibleKeyEditor);
}
