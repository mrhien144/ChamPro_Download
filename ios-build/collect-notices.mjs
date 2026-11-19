import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import os from 'node:os';
const root=process.cwd(), out=path.join(root,'app','third-party-notices');
fs.mkdirSync(out,{recursive:true});
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const records=[];
function notices(dir,label){
 const found=fs.readdirSync(dir).filter(n=>/^(licen[cs]e|notice|copying|copyright|third[-_ ]party)/i.test(n)&&fs.statSync(path.join(dir,n)).isFile());
 const links=[];
 for(const name of found){const dest=label.replace(/[^a-zA-Z0-9_.-]/g,'_')+'-'+name.replace(/[^a-zA-Z0-9_.-]/g,'_')+'.txt';fs.copyFileSync(path.join(dir,name),path.join(out,dest));links.push(dest);}
 return links;
}
for(const name of ['@capacitor/core','@capacitor/ios','@capacitor/browser','@capacitor/app','@capacitor/network','pako']){
 const dir=path.join(root,'node_modules',name), p=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
 const links=notices(dir,name+'-'+p.version);
 records.push({name,version:p.version,license:p.license,verified:links.length>0,links});
}
fs.copyFileSync(path.join(root,'node_modules/pako/dist/pako.min.js'),path.join(root,'app/vendor/pako.min.js'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'champro-notices-'));
const packs=[
 {name:'jsQR',spec:'jsqr@1.4.0',file:'jsQR.js',dist:'dist/jsQR.js'},
 {name:'OpenCV.js',spec:'@techstark/opencv-js@4.10.0-release.1',file:'opencv.js',dist:'dist/opencv.js'},
 {name:'SheetJS CE',spec:'https://cdn.sheetjs.com/xlsx-0.18.12/xlsx-0.18.12.tgz',file:'xlsx.full.min.js',dist:'dist/xlsx.full.min.js'}
];
for(const v of packs){
 const dir=fs.mkdtempSync(path.join(temp,'pkg-')),local=path.join(root,'app/vendor',v.file);
 let record={name:v.name,candidate:v.spec,bundleSHA256:sha(local),verified:false,links:[]};
 try{
  let result=JSON.parse(execFileSync('npm',['pack',v.spec,'--json','--pack-destination',dir],{encoding:'utf8',timeout:90000}));
  execFileSync('tar',['-xzf',path.join(dir,result[0].filename),'-C',dir]);
  const d=path.join(dir,'package'),p=JSON.parse(fs.readFileSync(path.join(d,'package.json'),'utf8'));
  record.version=p.version;record.license=p.license;record.links=notices(d,v.name+'-'+p.version);
  record.upstreamSHA256=sha(path.join(d,v.dist));record.verified=record.bundleSHA256===record.upstreamSHA256&&record.links.length>0;
 }catch(e){record.error='Unable to verify package or full notice';}
 records.push(record);
}
fs.rmSync(temp,{recursive:true,force:true});
fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(records,null,2));
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Giấy phép mã nguồn mở</title><style>body{font:16px system-ui;padding:20px;line-height:1.6}li{margin:12px 0}a{overflow-wrap:anywhere}</style><a href="../index.html">Quay lại ChấmPro</a><h1>Giấy phép mã nguồn mở</h1><p>Thư viện có giấy phép riêng; các mục chưa đối chiếu chính xác là thông tin rà soát, chưa đủ điều kiện phát hành.</p><ul>'+records.map(r=>'<li><strong>'+esc(r.name)+'</strong> '+esc(r.version||r.candidate||'')+' · '+esc(r.license||'Chưa xác minh')+' — '+(r.verified?'Đã đối chiếu':'Cần đối chiếu')+'<br>'+r.links.map(l=>'<a href="./'+esc(l)+'">'+esc(l)+'</a>').join('<br>')+'</li>').join('')+'</ul></html>');
console.log(JSON.stringify(records.map(({name,version,verified,error})=>({name,version,verified,error})),null,2));
if(records.some(r=>!r.verified))console.warn('RELEASE BLOCKED pending exact vendor provenance and license verification. Unsigned QA archive only.');
