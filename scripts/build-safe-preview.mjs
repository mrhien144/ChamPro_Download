/**
 * Build a physically and logically isolated ChấmPro preview under /app-preview/.
 *
 * IMPORTANT: GitHub Pages serves its normal site from the default branch.
 * Running this script produces files ONLY under dist/app-preview/ locally.
 * It does not publish or change /app/ or any Cloudflare resource.
 *
 * This preview must be hosted at https://champro.mrhien.com/app-preview/
 * for the existing first-party WordPress postMessage login target to match.
 */
import {cp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';

const source=resolve('app'),dest=resolve('dist/app-preview');
await rm(dest,{recursive:true,force:true});
await mkdir(dest,{recursive:true});
await cp(source,dest,{recursive:true});

async function edit(file,from,to){
 const path=join(dest,file);
 const previous=await readFile(path,'utf8');
 assert(previous.includes(from),file+': expected source marker missing');
 const next=previous.replace(from,to);
 await writeFile(path,next,'utf8');
}
const previewKey='champro-app-preview-v1';
await edit('app.mjs',"const storedKey='champro-web-beta-v1';",
 "const storedKey='"+previewKey+"';");
await edit('local-data-store.mjs',"const DB_NAME='champro-local-mirror-v1'",
 "const DB_NAME='champro-local-mirror-preview-v1'");
await edit('sheet-photo-store.mjs',"const DB_NAME='champro-sheet-photos-v1'",
 "const DB_NAME='champro-sheet-photos-preview-v1'");
await edit('sw.js',"const CACHE='champro-web-v2-20261111-account-bridge-preview'",
 "const CACHE='champro-app-preview-v1-20261111-corrections-v1'");
await edit('sw.js',"n.startsWith('champro-web-')",
 "n.startsWith('champro-app-preview-')");
await edit('manifest.webmanifest','"short_name":"ChấmPro"',
 '"short_name":"ChấmPro Test"');
await edit('manifest.webmanifest','"name":"ChấmPro – Chấm trắc nghiệm"',
 '"name":"ChấmPro – Bản thử nghiệm riêng"');
await edit('index.html','./account-bridge.mjs?v=20261111-account-preview',
 './account-bridge.mjs?v=20261111-account-smoke');
await edit('index.html','./app.mjs?v=20261110-photo-archive-preview',
 './app.mjs?v=20261111-review-corrections-v1');
await edit('index.html','./styles.css?v=20261110-photo-archive-preview',
 './styles.css?v=20261111-review-corrections-v1');
await edit('index.html','<small>WEB · BETA</small>',
 '<small>BẢN THỬ NGHIỆM RIÊNG</small>');
await edit('index.html','Bản web thử nghiệm: dữ liệu được lưu trong bộ nhớ trình duyệt của thiết bị này.',
 'BẢN THỬ NGHIỆM /app-preview/: dữ liệu trong bản này tách riêng khỏi /app/. Không nhập dữ liệu học sinh thật.');

// Ensure the preview cannot read/write the live app's browser databases.
const files={
 app:await readFile(join(dest,'app.mjs'),'utf8'),
 photo:await readFile(join(dest,'sheet-photo-store.mjs'),'utf8'),
 local:await readFile(join(dest,'local-data-store.mjs'),'utf8'),
 sw:await readFile(join(dest,'sw.js'),'utf8')
};
assert(files.app.includes("'"+previewKey+"'"));
assert(!files.app.includes("'champro-web-beta-v1'"));
assert(!files.photo.includes("'champro-sheet-photos-v1'"));
assert(!files.local.includes("'champro-local-mirror-v1'"));
assert(!files.sw.includes("n.startsWith('champro-web-')"));
assert(files.sw.includes("n.startsWith('champro-app-preview-')"));
assert(files.sw.includes("'./account-bridge.mjs'"));
assert(files.sw.includes("'./result-review.mjs'"));
assert(files.sw.includes("'./result-review-ui.mjs'"));
const instructions=[
 'ChấmPro – BẢN THỬ NGHIỆM RIÊNG',
 '',
 'Chỉ dùng dữ liệu giả. Không thay thế thư mục /app/ đang chấm bài.',
 'Toàn bộ nội dung thư mục này được thiết kế cho /app-preview/ trên champro.mrhien.com.',
 'Các kho dữ liệu localStorage, IndexedDB, Cache Storage và Service Worker của',
 'bản này có tên hoặc phạm vi độc lập với /app/.',
 'WordPress Bridge dùng postMessage theo origin https://champro.mrhien.com;',
 'nếu triển khai ở tên miền khác, đăng nhập sẽ KHÔNG hoạt động.',
 'Đây chưa phải bản thương mại; chưa kích hoạt upload điểm hoặc ảnh lên Cloudflare.',
 'Muốn thử đăng nhập: Sao lưu & dữ liệu → Kết nối tài khoản WordPress.',
 'Lưu ý: Không nhấn Merge PR số 2 hoặc đè lên /app/ chỉ để chạy thử.'
].join('\n');
await writeFile(join(dest,'PREVIEW-INSTRUCTIONS.txt'),instructions);
console.log('PASS: isolated /app-preview/ build created (no live files modified)');
