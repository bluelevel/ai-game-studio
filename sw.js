// 온라인이면 서버의 최신 파일을 쓰고(받은 것은 캐시에 저장), 오프라인이거나 서버가 2초 안에
// 답하지 않으면 캐시로 연다. 늦게 온 서버 응답도 캐시에 저장되어 다음에 열 때 반영된다.
const CACHE = 'bokbulbok-v16';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
const WAIT = 2000;
let slowUntil = 0;   // 서버가 한 번 늦으면 잠시 동안은 캐시로 바로 연다 (파일마다 2초씩 기다리지 않게)

self.addEventListener('install', (e) => {
  // cache: 'reload' — 브라우저의 HTTP 캐시를 건너뛰고 서버에서 새로 받는다
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const fromCache = () => caches.match(e.request, { ignoreSearch: true })
    .then((hit) => hit || (e.request.mode === 'navigate' ? caches.match('./') : undefined));
  const net = fetch(e.request, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      return caches.open(CACHE).then((c) => c.put(e.request, copy)).then(() => res, () => res);
    }
    return res;
  });
  e.waitUntil(net.catch(() => {}));                      // 캐시로 먼저 답해도 서버 응답은 끝까지 받아 저장
  e.respondWith(new Promise((resolve, reject) => {
    let settled = false;
    const useCache = () => fromCache().then((hit) => {
      if (settled) return;
      if (hit) { settled = true; resolve(hit); }
    });
    const timer = setTimeout(() => { slowUntil = Date.now() + 10000; useCache(); }, Date.now() < slowUntil ? 0 : WAIT);
    net.then((res) => {
      clearTimeout(timer);
      if (!settled) { settled = true; resolve(res); }
    }, () => {
      clearTimeout(timer);
      fromCache().then((hit) => {
        if (settled) return;
        settled = true;
        if (hit) resolve(hit); else reject(new TypeError('offline'));
      });
    });
  }));
});
