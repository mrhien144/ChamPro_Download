const CACHE='champro-web-v2-20261111-account-bridge-preview';
const CORE=['./','./index.html','./styles.css','./app.mjs','./advanced.mjs','./qr-compatible.mjs','./multisubject.mjs','./grader.mjs','./result-review.mjs','./result-review-ui.mjs','./omr-native.mjs','./omr-verified-paper.mjs','./omr-printed-120.mjs','./answer-flex-editor.mjs','./student-identity.mjs','./sheet-photo-store.mjs','./local-data-store.mjs','./account-bridge.mjs','./vendor/xlsx.full.min.js','./vendor/jsQR.js','./layouts.json','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('champro-web-')&&n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==location.origin||!url.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;
 const netFirst=false; // Cache-first for offline operation; versioned asset URLs use ignoreSearch.
 if(netFirst){e.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)));}return res;}).catch(()=>caches.match(req,{ignoreSearch:true})));return;}
 e.respondWith(caches.match(req,{ignoreSearch:true}).then(x=>x||fetch(req).then(res=>{if(res.ok){const copy=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)));}return res;})));
});