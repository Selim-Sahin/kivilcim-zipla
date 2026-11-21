// =============================================================
//  perf.js — Ölçüm: ?fps göstergesi, açılış süreleri, ekran Hz
//
//  • Kare süreleri: son 3 sn'de çizilen karelerin aralıkları (ms).
//    Ortalama FPS düzensizliği gizler; ortanca "tipik kare"yi, 90. yüzdelik
//    "kötü karelerin" süresini gösterir. Hedef aralığın 1,5 katından uzun
//    süren her kare bir "takılma" sayılır.
//  • Açılış: performance.mark ile işaretlenen anlar (sayfa açılışından ms).
//  • Ekran Hz: oyun başladıktan sonra arka planda ölçülür, localStorage'a
//    yazılır; sonraki açılışlar kayıtlı değeri bekletmeden kullanır.
// =============================================================
import { CONFIG } from './config.js';

const WINDOW_MS = 3000;
const COMMON_HZ = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
const HZ_KEY = CONFIG.quality.hzKey;

// Açılış adımları: [işaret adı, göstergedeki kısa ad]
const STARTUP = [
  ['kv-ilk-boyama', 'boya'],
  ['kv-moduller', 'modül'],
  ['kv-zemin', 'zemin'],
  ['kv-shader', 'shader'],
  ['kv-ilk-kare', 'kare'],
];

export function mark(name) {
  try { performance.mark(name); } catch (err) { /* eski tarayıcı */ }
}

function markTime(name) {
  // HTML'in ilk boyaması: tarayıcı ölçtüyse onun değeri (Paint Timing),
  // yoksa index.html'deki küçük betiğin koyduğu işaret
  if (name === 'kv-ilk-boyama') {
    const paint = performance.getEntriesByType?.('paint') || [];
    const p = paint.find((e) => e.name === 'first-contentful-paint') || paint.find((e) => e.name === 'first-paint');
    if (p) return p.startTime;
  }
  const m = performance.getEntriesByName(name, 'mark');
  return m.length ? m[0].startTime : null;
}

export function browserName() {
  const ua = navigator.userAgent;
  const tests = [
    [/SamsungBrowser\/(\d+)/, 'Samsung'],
    [/(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
    [/EdgA?\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/CriOS\/(\d+)/, 'Chrome'],
    [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ];
  for (const [re, name] of tests) {
    const m = ua.match(re);
    if (m) return `${name} ${m[1]}`;
  }
  return 'tarayıcı ?';
}

function snapHz(hz) {
  return COMMON_HZ.reduce((best, h) => (Math.abs(h - hz) < Math.abs(best - hz) ? h : best), 60);
}

export function loadHz() {
  try {
    const v = parseInt(localStorage.getItem(HZ_KEY), 10);
    return COMMON_HZ.includes(v) ? v : null;
  } catch (err) {
    return null;
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

export class Perf {
  constructor() {
    this.hz = loadHz();       // null: henüz ölçülmedi
    this.hzMeasured = false;  // bu oturumda ölçüldü mü
    this.rafDeltas = [];
    this.rafPrev = null;
    this.rafStart = null;
    this.frames = [];         // { t, dt } — çizilen karelerin aralıkları
    document.addEventListener('visibilitychange', () => {
      // Arka plandan dönüşteki uzun aralık ne Hz ölçümüne ne takılma sayısına girsin
      this.rafPrev = null;
      this.frames.length = 0;
      this.skipNext = true;
    });
  }

  // Her requestAnimationFrame çağrısında (atlanan kareler dahil): ekran Hz ölçümü.
  // Oyun açıldıktan 1 sn sonra 120 aralık toplanır. Ağır karelerde aralık uzayabildiği
  // için ortanca değil alt çeyrek (25. yüzdelik) alınır: hafif kareler gerçek yenileme
  // aralığını gösterir.
  raf(now) {
    if (this.hzMeasured || document.hidden) return;
    if (this.rafStart === null) this.rafStart = now;
    if (this.rafPrev !== null && now - this.rafStart > 1000) this.rafDeltas.push(now - this.rafPrev);
    this.rafPrev = now;
    if (this.rafDeltas.length < 120) return;
    const sorted = this.rafDeltas.sort((a, b) => a - b);
    this.hz = snapHz(1000 / percentile(sorted, 0.25));
    this.hzMeasured = true;
    this.rafDeltas = [];
    try { localStorage.setItem(HZ_KEY, String(this.hz)); } catch (err) { /* önemsiz */ }
  }

  // Çizilen her karede: önceki çizimden bu yana geçen süre (ms)
  frame(now, dt) {
    if (this.skipNext) { this.skipNext = false; return; }
    this.frames.push({ t: now, dt });
    while (this.frames.length && now - this.frames[0].t > WINDOW_MS) this.frames.shift();
  }

  // Hedef kare aralığı (ms): sınır ile ekran hızının küçüğü
  targetInterval(cap) {
    const hz = this.hz || 60;
    const fps = cap > 0 ? Math.min(cap, hz) : hz;
    return 1000 / fps;
  }

  stats(cap) {
    const ds = this.frames.map((f) => f.dt).sort((a, b) => a - b);
    const limit = this.targetInterval(cap) * 1.5;
    return {
      count: ds.length,
      median: percentile(ds, 0.5),
      p90: percentile(ds, 0.9),
      stutters: ds.filter((d) => d > limit).length,
    };
  }

  startupLine() {
    const parts = [];
    for (const [name, label] of STARTUP) {
      const t = markTime(name);
      if (t !== null) parts.push(`${label} ${Math.round(t)}`);
    }
    return parts.length ? `açılış ms: ${parts.join(' · ')}` : '';
  }

  logStartup() {
    const line = this.startupLine();
    if (line) console.info('[Kıvılcım] ' + line);
  }
}
