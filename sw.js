// オフラインで起動できるよう、画面のファイル一式をiPadにしまっておく。
// 画面を更新したら CACHE の番号を上げること（iPad側が新しい版に入れ替わる）。
const CACHE = 'mtest-input-v1.1.0';
const FILES = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/db.js',
  './js/xlsx.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // ブラウザの通常のキャッシュを通さず、必ずサーバーから最新のファイルを取ってくる
  const reqs = FILES.map(f => new Request(f, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(reqs)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // 送信（GAS）など、別のサイトへの通信には関わらない
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // しまってある画面ですぐ表示し、ネットがあれば裏で最新版に入れ替える（次回の起動から反映）
  const key = req.mode === 'navigate' ? './index.html' : req;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(key, { ignoreSearch: true });
    const update = fetch(req, { cache: 'no-cache' })
      .then(res => { if (res.ok) cache.put(key, res.clone()); return res; })
      .catch(() => null);
    if (cached) { e.waitUntil(update); return cached; }
    return (await update) || new Response('オフラインです', { status: 503 });
  }));
});
