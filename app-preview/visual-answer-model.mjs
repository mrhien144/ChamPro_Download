/** Strict answer-key edit conversions. No camera or storage access. */
export function parseChoiceI(value){
 const v=String(value??'').trim().toUpperCase();
 if(v==='ALL')return {all:true,choices:[]};
 const choices=[...new Set(v.split(/[|;,/ ]+/).filter(x=>/^[ABCD]$/.test(x)))];
 return {all:false,choices};
}
export function serializeChoiceI(choices,all=false){
 if(all)return 'ALL';
 return [...new Set(choices)].filter(x=>/^[ABCD]$/.test(x)).join('|');
}
export function parseChoiceII(value){
 const v=String(value??'').trim().toUpperCase().replaceAll('D','Đ');
 if(v==='ALL')return {all:true,columns:Array.from({length:4},()=>({trueValue:false,falseValue:false}))};
 return {all:false,columns:Array.from({length:4},(_,i)=>({
  trueValue:v[i]==='Đ'||v[i]==='*',
  falseValue:v[i]==='S'||v[i]==='*'
 }))};
}
export function serializeChoiceII(columns,all=false){
 if(all)return 'ALL';
 if(!Array.isArray(columns)||columns.length!==4)throw Error('Phần II phải có đủ bốn ý');
 return columns.map(c=>c.trueValue&&c.falseValue?'*':c.trueValue?'Đ':c.falseValue?'S':'?').join('');
}
export function parseChoiceIII(value){
 const v=String(value??'').trim();
 return {all:v.toUpperCase()==='ALL',values:v.toUpperCase()==='ALL'?['']:v.split('|')};
}
export function serializeChoiceIII(values,all=false){
 if(all)return 'ALL';
 const nonempty=values.map(x=>String(x??'').trim()).filter(Boolean);
 if(!nonempty.length)throw Error('Cần ít nhất một đáp án Phần III');
 if(nonempty.some(x=>x.includes('|')||x.length>90))throw Error('Đáp án Phần III chứa ký tự không hợp lệ hoặc quá dài');
 return [...new Set(nonempty)].join('|');
}
