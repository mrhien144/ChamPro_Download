const CACHE='champro-web-v2-20261105-native-omr-r1';
const CORE=['./','./index.html','./styles.css','./app.mjs','./advanced.mjs','./qr-compatible.mjs','./multisubject.mjs','./grader.mjs','./omr-native.mjs','./layouts.json','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('champro-web-')&&n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const req=e.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==location.origin||!url.pathname.startsWith(new URL('./',self.registration.scope).pathname))return;
 const netFirst=req.mode==='navigate'||/\.(?:html|css|mjs|js)$/.test(url.pathname);
 if(netFirst){e.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)));}return res;}).catch(()=>caches.match(req)));return;}
 e.respondWith(caches.match(req).then(x=>x||fetch(req).then(res=>{if(res.ok){const copy=res.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(req,copy)));}return res;})));
});