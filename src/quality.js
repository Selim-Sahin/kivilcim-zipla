// =============================================================
//  quality.js — Grafik kalitesi ve dinamik çözünürlük
//
//  Menü kipleri (settings.js):
//    'oto'    : Otomatik. Oyun sırasında YALNIZCA çözünürlük ölçeği değişir
//               (dinamik çözünürlük, ScaleController). 120 Hz ekranda kare hızı
//               60'tan başlar; bol pay varsa 120 denenir.
//    'pil'    : Pil dostu. 60 FPS, 1.0×, seyrek çim. Sabit.
//    'yuksek' : En yüksek ölçek (2.0×, cihazın DPR'ını geçmez), sahte gölge. Sabit.
//    'ultra'  : Yüksek + gerçek (PCF) gölge. Yalnızca masaüstü.
//    'teshis' : URL parametreleri (?pr=1&shadow=pcf&grass=0) — README'ye bak.
//
//  Shader derlemesi gerektiren hiçbir şey (gölge türü) oyun sırasında kendiliğinden
//  değişmez. Çim yoğunluğu ve gölge yalnızca menüden değişir; değişirken kısa bir
//  "ayarlanıyor" perdesi gösterilir ve oyun bu sırada durur.
// =============================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';

const Q = CONFIG.quality;
const EPS = 1e-6;
const MODE_NAMES = { oto: 'otomatik', pil: 'pil dostu', yuksek: 'yüksek', ultra: 'ultra', teshis: 'teşhis' };
const SHADOW_NAMES = { off: 'sahte gölge', pcf: 'gerçek gölge', pcfsoft: 'gerçek gölge (yumuşak)' };
export const MODES = ['oto', 'pil', 'yuksek', 'ultra'];

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

// =============================================================
//  ScaleController — dinamik çözünürlük kararları (tarayıcıdan bağımsız,
//  tools/dinamik-sim.html aynı sınıfı yapay kare süreleriyle sınar)
//
//  Her çizilen karede bir "yük" örneği alınır:
//    • kare zamanında geldiyse: karenin işi (işlemci, varsa GPU süresiyle)
//    • geciktiyse (aralık > hedef × lateRatio): kare aralığının kendisi
//  Kare kapısı 60'tayken aralık hep ~16,7 ms olduğundan yalnız aralığa bakmak
//  "ne kadar pay var" sorusunu cevaplayamazdı; iş süresi bunu gösterir.
//
//  Karar ölçüsü: son 3 sn'deki örneklerin 90. yüzdeliği (p90).
//    p90 > hedef × 1.15                → bir adım in
//    p90 < hedef × 0.7, 10 sn boyunca  → bir adım çık
//    en yüksek ölçekte p90 < 7 ms, 10 sn boyunca (120 Hz ekran) → 120 FPS dene;
//    120'de inmek gerekirse 60'a dönülür ve bu oturumda 120 bir daha denenmez.
//  Her değişiklikten sonra 2 sn beklenir ve ölçüm sıfırlanır. Daha önce
//  yukarı çıkılan bir değere ikinci kez geri düşülürse tavan orada sabitlenir.
// =============================================================
export class ScaleController {
  // scale: başlangıç ölçeği, min/max: ölçek aralığı, cap: 60 | 120 (0 = sınırsız)
  // allowHigh: 120'ye geçmeye izin (menüdeki kare hızı), lockCap: kare hızına dokunma (?cap)
  constructor({ scale, min, max, cap = 60, allowHigh = true, lockCap = false, hz = 60, now = 0 }) {
    this.min = min;
    this.max = Math.max(min, max);
    this.ceiling = this.max;   // salınım görülünce düşürülen tavan
    this.step = Q.scaleStep;
    this.scale = this.clamp(scale);
    this.cap = cap;
    this.allowHigh = allowHigh;
    this.lockCap = lockCap;
    this.hz = hz;
    this.highFailed = false;   // bu oturumda 120 denendi ve tutmadı
    this.upFrom = new Set();   // yukarı çıkılan değerler
    this.backs = new Map();    // değer → oraya kaç kez geri düşüldü
    this.reset(now);
  }

  clamp(s) {
    const snapped = Math.round(s / this.step) * this.step;
    return Math.round(Math.min(this.ceiling, Math.max(this.min, snapped)) * 1000) / 1000;
  }

  // Hedef kare aralığı (ms): kare kapısı ile ekran hızının küçüğü
  get target() {
    const fps = this.cap > 0 ? Math.min(this.cap, this.hz) : this.hz;
    return 1000 / fps;
  }

  reset(now) {
    this.waitUntil = now + Q.settle * 1000;
    this.times = [];
    this.loads = [];
    this.since = null;       // ölçüm penceresinin başladığı an
    this.goodSince = null;   // "bol pay" koşulunun başladığı an
    this.nextCheck = 0;
    this.p50 = null;
    this.p90 = null;
    this.state = 'bekliyor';
  }

  canGoHigh() {
    return !this.lockCap && this.allowHigh && !this.highFailed && this.cap > 0 && this.cap < 120
      && this.hz >= Q.highRateMinHz && this.scale >= this.max - EPS;
  }

  // now: ms, interval: önceki çizimden bu yana geçen süre (ms), work: karenin işi (ms).
  // Değişiklik olursa { scale?, cap?, why } döndürür.
  sample(now, interval, work) {
    if (now < this.waitUntil) return null;
    if (this.since === null) this.since = now;
    const T = this.target;
    this.times.push(now);
    this.loads.push(interval > T * Q.lateRatio ? interval : work);
    const from = now - Q.window * 1000;
    let drop = 0;
    while (drop < this.times.length && this.times[drop] < from) drop++;
    if (drop) { this.times.splice(0, drop); this.loads.splice(0, drop); }

    if (now - this.since < Q.window * 1000) { this.state = 'ölçülüyor'; return null; }
    if (now < this.nextCheck) return null;
    this.nextCheck = now + Q.check * 1000;

    const sorted = this.loads.slice().sort((a, b) => a - b);
    this.p50 = percentile(sorted, 0.5);
    this.p90 = percentile(sorted, 0.9);

    if (this.p90 > T * Q.downRatio) return this.down(now);

    const high = this.canGoHigh();
    const good = high
      ? this.p90 < Q.highRateP90
      : this.scale < this.ceiling - EPS && this.p90 < T * Q.upRatio;
    if (!good) { this.goodSince = null; this.state = 'dengede'; return null; }
    if (this.goodSince === null) this.goodSince = now;
    this.state = 'pay var';
    if (now - this.goodSince < Q.upHold * 1000) return null;
    return high ? this.goHigh(now) : this.up(now);
  }

  down(now) {
    if (this.cap >= 120 && !this.lockCap) {
      this.cap = 60;
      this.highFailed = true;
      this.reset(now);
      return { cap: 60, why: '120 FPS tutmadı → 60' };
    }
    if (this.scale <= this.min + EPS) {
      this.reset(now);  // inilecek yer yok; yeniden ölç
      return null;
    }
    const s = this.clamp(this.scale - this.step);
    let why = 'yük yüksek';
    if (this.upFrom.has(s)) {
      const n = (this.backs.get(s) || 0) + 1;
      this.backs.set(s, n);
      if (n >= 2 && s < this.ceiling) {
        this.ceiling = s;
        why += `; ${s}'e ikinci kez geri düşüldü → tavan ${s}`;
      }
    }
    this.scale = s;
    this.reset(now);
    return { scale: s, why };
  }

  up(now) {
    this.upFrom.add(this.scale);
    this.scale = this.clamp(this.scale + this.step);
    this.reset(now);
    return { scale: this.scale, why: 'pay var' };
  }

  goHigh(now) {
    this.cap = 120;
    this.reset(now);
    return { cap: 120, why: 'en yüksek ölçekte bol pay → 120 FPS dene' };
  }
}

// =============================================================
//  Quality — kipleri uygular, dinamik çözünürlüğü çalıştırır
// =============================================================
export class Quality {
  // compile: sahnedeki tüm malzemeleri derleyen async fonksiyon (main.js)
  // curtain: { show(): Promise, hide() } — "ayarlanıyor" perdesi (settings.js)
  // override: teşhis için URL'den gelen sabit değerler ({ pixelRatio?, shadow?, grass? })
  // capOverride: ?cap=… ile sabitlenen kare kapısı (null: menü/otomatik karar verir)
  constructor({ renderer, scene, world, compile, curtain, override = null, capOverride = null, isMobile = false }) {
    this.renderer = renderer;
    this.scene = scene;
    this.world = world;
    this.compile = compile;
    this.curtain = curtain;
    this.override = override;
    this.capOverride = capOverride;
    this.isMobile = isMobile;
    const dpr = window.devicePixelRatio || 1;
    // Ölçek aralığı 1.0–2.0; cihazın DPR'ını geçmez (DPR 1 olan ekranda 2× anlamsız)
    this.maxScale = Math.max(Q.minScale, Math.min(Q.maxScale, dpr));

    this.mode = override ? 'teshis' : 'oto';
    this.rate = 120;        // menüdeki kare hızı üst sınırı (60 | 120)
    this.hz = 60;           // ekran yenileme hızı (perf.js ölçer, main.js günceller)
    this.applied = null;    // { scale, grass, shadow }
    this.cap = 60;          // geçerli kare kapısı
    this.ctrl = null;       // yalnızca otomatik kipte
    this.busy = false;      // perde açık / shader derleniyor → ana döngü bekler

    // Sekme arka plandan dönünce ölçüm baştan başlasın
    document.addEventListener('visibilitychange', () => this.ctrl?.reset(performance.now()));
  }

  get fpsCap() { return this.cap; }

  // Kipin ayarları: { scale, grass, shadow, cap }
  plan(mode) {
    const cap = (fallback) => (this.capOverride !== null ? this.capOverride : fallback);
    if (this.override) {
      const o = this.override;
      const dpr = window.devicePixelRatio || 1;
      return {
        scale: o.pixelRatio ? Math.min(dpr, o.pixelRatio) : this.maxScale,
        grass: o.grass ?? 1,
        shadow: o.shadow ?? 'off',
        cap: cap(CONFIG.render.fpsCap),
      };
    }
    const m = Q.modes[mode];
    if (mode === 'oto') {
      const saved = this.loadAuto();
      const start = this.isMobile ? Math.min(CONFIG.render.mobilePixelRatio, this.maxScale) : this.maxScale;
      return {
        scale: saved ? saved.scale : start,
        grass: m.grass,
        shadow: m.shadow,
        cap: cap(this.rate >= 120 && saved?.cap === 120 ? 120 : 60),
      };
    }
    return {
      scale: Math.min(m.scale, this.maxScale),
      grass: m.grass,
      shadow: m.shadow,
      cap: cap(m.rate || this.rate),
    };
  }

  // Açılışta (yükleme ekranı açıkken): perde yok
  async start(mode, rate) {
    this.rate = rate;
    await this.setMode(this.override ? 'teshis' : mode, false);
  }

  async setMode(mode, useCurtain = true) {
    if (this.override) mode = 'teshis';
    else if (!MODES.includes(mode) || (mode === 'ultra' && this.isMobile)) mode = 'oto';
    this.mode = mode;
    const p = this.plan(mode);
    this.cap = p.cap;
    this.ctrl = mode === 'oto'
      ? new ScaleController({
        scale: p.scale,
        min: Q.minScale,
        max: this.maxScale,
        cap: p.cap,
        allowHigh: this.rate >= 120,
        lockCap: this.capOverride !== null,
        hz: this.hz,
        now: performance.now(),
      })
      : null;
    await this.applyLook({ scale: this.ctrl ? this.ctrl.scale : p.scale, grass: p.grass, shadow: p.shadow }, useCurtain);
  }

  // Menüdeki kare hızı (60 | 120). Shader'a dokunmaz, perde gerekmez.
  setRate(rate) {
    this.rate = rate;
    if (this.override || this.capOverride !== null) return;
    if (this.ctrl) {
      this.ctrl.allowHigh = rate >= 120;
      this.ctrl.highFailed = false;  // kullanıcı 120'ye yeniden izin verdi
      if (rate < 120 && this.cap >= 120) this.setCap(60);
      this.ctrl.reset(performance.now());
    } else {
      this.cap = Q.modes[this.mode].rate || rate;
    }
  }

  setCap(cap) {
    this.cap = cap;
    if (this.ctrl) this.ctrl.cap = cap;
    this.saveAuto();
  }

  // Çözünürlük, çim, gölge. Çim ya da gölge değişiyorsa perde açılır; gölge
  // türü shader'a gömülü olduğundan malzemeler yeniden derlenir.
  async applyLook(next, useCurtain) {
    const prev = this.applied;
    const heavy = !!prev && (prev.grass !== next.grass || prev.shadow !== next.shadow);
    const curtain = heavy && useCurtain && this.curtain;
    if (curtain) {
      this.busy = true;
      await this.curtain.show();
    }
    const t0 = performance.now();
    try {
      this.applied = { ...next };
      if (!prev || prev.scale !== next.scale) this.renderer.setPixelRatio(next.scale);
      if (!prev || prev.grass !== next.grass) this.world.setGrassRatio(next.grass);
      if (!prev || prev.shadow !== next.shadow) {
        const on = next.shadow !== 'off';
        this.renderer.shadowMap.enabled = on;
        if (on) this.renderer.shadowMap.type = next.shadow === 'pcfsoft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        this.world.setShadows(on);
        if (prev) {
          this.scene.traverse((o) => {
            const m = o.material;
            if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; });
            else if (m) m.needsUpdate = true;
          });
          this.busy = true;
          try { await this.compile(); } catch (err) { console.warn('Kalite: derleme beklenemedi', err); }
        }
      }
    } finally {
      if (curtain) {
        const left = Q.curtainMin * 1000 - (performance.now() - t0);
        if (left > 0) await new Promise((r) => setTimeout(r, left));
        this.curtain.hide();
      }
      this.busy = false;
      this.ctrl?.reset(performance.now());
    }
  }

  // Her çizilen karede (main.js). interval, work: ms
  frame(now, interval, work) {
    const c = this.ctrl;
    if (!c || this.busy || document.hidden) return;
    c.hz = this.hz;
    const change = c.sample(now, interval, work);
    if (!change) return;
    if (change.scale !== undefined) {
      this.applied.scale = change.scale;
      this.renderer.setPixelRatio(change.scale);  // yalnızca çizim tamponu boyutu: shader derlenmez
    }
    if (change.cap !== undefined) this.cap = change.cap;
    this.lastChange = change.why;
    this.saveAuto();
    if (Q.log) console.info(`[Kıvılcım] ölçek ${c.scale}× · ${this.cap} FPS — ${change.why}`);
  }

  // ---------- Kalıcılık: otomatik kipin sonucu (ölçek, kare hızı) ----------
  loadAuto() {
    try {
      const v = JSON.parse(localStorage.getItem(Q.autoKey));
      if (!v || !(v.scale >= Q.minScale && v.scale <= Q.maxScale)) return null;
      return { scale: Math.min(v.scale, this.maxScale), cap: v.cap === 120 ? 120 : 60 };
    } catch (err) {
      return null;
    }
  }

  saveAuto() {
    if (!this.ctrl) return;
    try {
      localStorage.setItem(Q.autoKey, JSON.stringify({ scale: this.ctrl.scale, cap: this.cap }));
    } catch (err) { /* önemsiz */ }
  }

  // ---------- ?fps göstergesi ----------
  describe() {
    const a = this.applied;
    if (!a) return '';
    const grass = a.grass > 0 ? `çim %${Math.round(a.grass * 100)}` : 'çim yok';
    const c = this.ctrl;
    let line1 = `${MODE_NAMES[this.mode]} · ölçek ${a.scale.toFixed(2).replace(/0$/, '')}×`;
    if (c) {
      line1 += ` (${c.min}–${c.max}`;
      if (c.ceiling < c.max) line1 += `, tavan ${c.ceiling}`;
      line1 += `) · ${c.state}`;
      if (c.state === 'pay var') line1 += ` ${Math.floor((performance.now() - c.goodSince) / 1000)}/${Q.upHold} sn`;
    }
    const lines = [line1, `${SHADOW_NAMES[a.shadow]} · ${grass}${this.world.groundMode === 'tex' ? '' : ` · zemin ${this.world.groundMode}`}`];
    if (c?.p90 != null) lines.push(`yük p50 ${c.p50.toFixed(1)} · p90 ${c.p90.toFixed(1)} ms`);
    if (this.lastChange) lines.push(`son karar: ${this.lastChange}`);
    return lines.join('\n');
  }
}
