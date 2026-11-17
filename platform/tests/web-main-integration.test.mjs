import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const at=path=>readFileSync(path,'utf8');

test('Main site loads additional sync module without replacing known camera files',()=>{
 const html=at('app/index.html');
 assert.match(html,/src="\.\/app\.mjs\?v=20261117-sync-qa-off"/);
 assert.match(html,/src="\.\/web-app-sync\.mjs\?v=20261117-sync-qa-off"/);
 assert.match(html,/src="\.\/advanced\.mjs\?v=20261117-sync-qa-off"/);
 const entry=html.match(/src="(\.\/app\.mjs\?[^"]+)"/)[1];
 assert.ok(at('app/advanced.mjs').includes("from '"+entry+"'"),'Both modules must share a single app instance');
 assert.match(html,/src="\/platform\/licensing\/auth-session\.js"/);
 assert.match(html,/src="\/platform\/licensing\/quota-dashboard\.js(?:\?[^\"]*)?"/);
});
test('Legacy browser data key and synchronous local save path remain untouched',()=>{
 const app=at('app/app.mjs');
 assert.match(app,/const storedKey='champro-web-beta-v1'/);
 assert.match(app,/function save\(\)\{try\{localStorage\.setItem\(dataKey,JSON\.stringify\(db\)\)/);
 assert.match(app,/const dataKey=qaMode\?storedKey\+'-sync-qa-wp8':storedKey/);
 assert.match(app,/qaMode=platformOwner\(\)===qaOwner/);
 assert.match(app,/window\.champroAppData=Object\.freeze/);
 assert.match(app,/getDb,applySyncDb,isCameraBusy/);
 const capture=app.split('function queueSheetFrame(')[1].split('// Offline PWA install prompt')[0];
 assert.doesNotMatch(capture,/requestIdleCallback|setTimeout/,'Confirmed frame must be copied before reuse');
 assert.match(capture,/enqueueSheetPhoto\(/);
 assert.match(app,/frame:qaMode&&frame\?copyReviewFrame\(frame,angle\):null/);
 assert.match(app,/enqueueSheetPhoto/);
 assert.match(app,/showSheetPhoto/);
});
test('Main auth integration uses existing session and verifies owner with Worker',()=>{
 const sync=at('app/web-app-sync.mjs');
 const auth=at('app/sync/web-token.mjs');
 const orchestrator=at('app/sync/start.mjs');
 assert.match(sync,/champro-auth-updated/);
 assert.match(sync,/champro-auth-logout/);
 assert.doesNotMatch(sync,/getAccount\?\./);
 assert.match(sync,/platformOwner\(\)/);
 assert.match(sync,/const QA_OWNER='wp:8'/);
 assert.match(sync,/app.syncOwner!==owner/);
 assert.match(sync,/getToken:scopedToken/);
 assert.match(sync,/metaKey:'champro-sync-web-qa-wp8-v1'/);
 assert.match(sync,/consent:async count/);
 assert.match(auth,/\/wp-json\/champro\/sync\/v1\/web-token/);
 assert.match(orchestrator,/result\.owner!==owner/);
 assert.match(orchestrator,/result\.enabled!==true/);
});
test('No grading or image network call is required for core scoring',()=>{
 const app=at('app/app.mjs');
 const scorer=at('app/grader.mjs');
 assert.doesNotMatch(scorer,/\bfetch\(/);
 const fun=app.split('function saveResult(exam,student,ans,fromAuto=false)')[1].split("$('saveReview').onclick=")[0];
 assert.doesNotMatch(fun,/\bfetch\(|\bawait\b|enqueueSheetPhoto/);
});
test('All app script modules imported by isolated sync are committed',()=>{
 for(const p of ['app/web-app-sync.mjs','app/sheet-photo-store.mjs','app/result-review.mjs','app/sync/start.mjs','app/sync/client.mjs','app/sync/reconcile.mjs','app/sync/legacy-adapter.mjs','app/sync/web-token.mjs']){
  const txt=at(p);
  for(const m of txt.matchAll(/(?:from\s+|import\s*\()['"]((?:\.\/|\.\.\/)[^'"]+)['"]/g)){
   assert.ok(existsSync(resolve(dirname(p),m[1])),p+' missing '+m[1]);
  }
 }
});
test('Offline service worker precaches required extra modules',()=>{
 const sw=at('app/sw.js');
 assert.match(sw,/caches\.match\(req,\{ignoreSearch:true\}\)/,'Offline script URLs with cache-bust query must resolve to precached file');
 for(const name of ['web-app-sync.mjs','sync/client.mjs','sync/reconcile.mjs','sync/legacy-adapter.mjs','sync/start.mjs','sync/web-token.mjs','sheet-photo-store.mjs','result-review.mjs']){
  assert.ok(sw.includes("./"+name),name+' missing from PWA cache');
 }
});
