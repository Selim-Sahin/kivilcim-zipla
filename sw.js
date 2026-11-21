// =============================================================
//  sw.js — Service worker: oyunu önbellekten açar, çevrimdışı çalıştırır.
//
//  Önbellek adı sürüm numarası taşır. Oyunda bir dosya değişince
//  VERSION da değişmelidir: commit'ten önce `python tools/sw_surum.py`
//  çalıştır (dosya içeriklerinden özet üretir). Tarayıcı sw.js'in değiştiğini görünce yeni
//  sürümü arka planda indirir, eski önbelleği siler; sayfa da uygun
//  anda (oyuncu henüz puan almamışken) kendini yeniler.
// =============================================================
const VERSION = 'v-a47d1185a4';
const CACHE = 'kivilcim-' + VERSION;

// Oyunun ihtiyaç duyduğu dosyaların tamamı (ilk açılışta hepsi indirilir)
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './vendor/three/three.module.min.js',
  './vendor/three/addons/utils/BufferGeometryUtils.js',
  './vendor/three/addons/geometries/RoundedBoxGeometry.js',
  './src/main.js',
  './src/config.js',
  './src/world.js',
  './src/game.js',
  './src/robot.js',
  './src/cape.js',
  './src/platforms.js',
  './src/input.js',
  './src/hud.js',
  './src/quality.js',
  './src/settings.js',
  './src/perf.js',
  './src/shadows.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    // İlk kurulumda sayfanın az önce indirdiği kopyalar kullanılır (ikinci kez indirme yok).
    // Güncellemede ise cache: 'reload' → HTTP önbelleğindeki eski kopyayı değil, sunucudakini al.
    const isUpdate = (await caches.keys()).some((n) => n.startsWith('kivilcim-'));
    const mode = isUpdate ? 'reload' : 'default';
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map((url) => new Request(url, { cache: mode })));
    await self.skipWaiting();  // eski sürümün kapanmasını bekleme
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith('kivilcim-') && n !== CACHE)
      .map((n) => caches.delete(n)));
    await self.clients.claim();  // açık sayfaları hemen yeni sürüme bağla
  })());
});

// Önce önbellek, yoksa ağ. ?fps / ?debug gibi parametreler aynı dosyayı gösterir.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch (err) {
      // Çevrimdışı ve listede olmayan bir sayfa istendiyse oyunu aç
      if (req.mode === 'navigate') {
        const page = await cache.match('./index.html');
        if (page) return page;
      }
      throw err;
    }
  })());
});
