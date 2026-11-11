/* ChấmPro Preview: immutable static shell, no student/photo/API caching. */
const CACHE='champro-app-preview-pwa-v1-20261111';
const CORE=[
 './','./index.html','./styles.css','./app.mjs','./pwa-install.mjs',
 './advanced.mjs','./qr-compatible.mjs','./multisubject.mjs',
 './grader.mjs','./result-review.mjs','./result-review-ui.mjs',
 './omr-native.mjs','./omr-verified-paper.mjs','./omr-printed-120.mjs',
 './answer-flex-editor.mjs','./student-identity.mjs',
 './sheet-photo-store.mjs','./local-data-store.mjs','./account-bridge.mjs',
 './vendor/xlsx.full.min.js','./vendor/jsQR.js',
 './layouts.json','./manifest.webmanifest','./icon.svg',
 './pwa-icon.svg','./pwa-maskable.svg',
 './pwa-icon-192.png','./pwa-icon-512.png','./pwa-maskable-512.png','./apple-touch-icon.png'
];
const scope=new URL('./',self.registration.scope);
const abs=CORE.map(path=>new URL(path,scope).href);
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // A failed core download rejects install; the previous working SW remains.
  await cache.addAll(CORE.map(path=>new Request(path,{cache:'reload'})));
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>
   (k.startsWith('champro-app-preview-'))&&k!==CACHE
  ).map(k=>caches.delete(k)));
  await self.clients.claim();
 })());
});
self.addEventListener('message',event=>{
 if(event.data?.type!=='CHAMPRO_OFFLINE_STATUS')return;
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  const found=await Promise.all(abs.map(url=>cache.match(url)));
  const cached=found.filter(Boolean).length;
  event.ports?.[0]?.postMessage({ready:cached===abs.length,cached,total:abs.length,version:CACHE});
 })());
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
 if(req.mode==='navigate'){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   // Always open the same local app shell; no network needed after install.
   const local=await cache.match(new URL('./index.html',scope).href);
   return local||fetch(req);
  })());
  return;
 }
 // Cache only known static resources; never store account responses,
 // student data, photo archives or arbitrary URLs.
 if(!abs.includes(url.origin+url.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  const match=await cache.match(url.origin+url.pathname);
  return match||fetch(req);
 })());
});
