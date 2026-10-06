/* 离线缓存外壳：联网时始终取最新，断网时回退缓存 */
const CACHE = 'examdrill-v4';
const SHELL = [
  './',
  'index.html',
  'styles.css?v=1',
  'app.js?v=5',
  'db.js?v=1',
  'seed.js?v=1',
  'cloud-config.js?v=1',
  'cloud.js?v=1',
  'docx.js?v=1',
  'manifest.webmanifest?v=1',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 只接管同源资源；跨域（如 CDN 上的云 SDK）交回浏览器正常处理
  let same = false;
  try { same = new URL(req.url).origin === self.location.origin; } catch (_) {}
  if (!same) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        // 联网成功：写入最新副本，返回网络结果（联网优先，避免旧缓存锁死）
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        // 断网：回退缓存；导航请求兜底到 index.html
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
      )
  );
});
