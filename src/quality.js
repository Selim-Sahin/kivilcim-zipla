// =============================================================
//  quality.js — Uyarlanabilir kalite
//
//  Modlar:
//    'oto'    : ARAMA → İZLEME (aşağıda)
//    'yuksek' | 'orta' | 'dusuk' : sabit kademe (CONFIG.quality.presets)
//    'teshis' : URL parametreleriyle (?pr=1&shadow=off&grass=0) sabit ayar;
//               otomatik sistem kapalı, böylece tek tek etkiler ölçülebilir.
//
//  ARAMA : Her kademe sampleTime boyunca ölçülür. Hedef tutarsa izlemeye
//          geçilir; tutmazsa bir alt kademe. Hiçbiri yetmezse önce düşük
//          hedefe (60) göre, o da olmazsa en yüksek FPS'i veren kademe seçilir.
//  İZLEME: downAfter sn hedefin altı → bir kademe in. upAfter sn bol FPS →
//          bir kademe çık ("deneme"); deneme tutmazsa geri in ve o kademeyi
//          soğumaya al (30 sn, sonra 60, 120 … en çok cooldownMax).
//
//  Her kademe değişiminde gölge türü değişiyorsa malzemeler yeniden
//  derlenir: derleme (compileAsync) bitene kadar "busy" olur — ana döngü bu
//  sırada çizim yapmaz — ve ardından skipFrames kare ölçüme katılmaz.
// =============================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';

const Q = CONFIG.quality;
const SHADOW_TYPES = { pcfsoft: THREE.PCFSoftShadowMap, pcf: THREE.PCFShadowMap };
const SHADOW_NAMES = { pcfsoft: 'yumuşak gölge', pcf: 'sert gölge', off: 'gölge yok' };
const MODE_NAMES = { oto: 'otomatik', yuksek: 'yüksek', orta: 'orta', dusuk: 'düşük', teshis: 'teşhis' };
const COMMON_HZ = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];

export class Quality {
  // compile: sahnedeki tüm malzemeleri derleyen async fonksiyon (main.js sağlar)
  // override: teşhis için URL'den gelen sabit değerler ({ pixelRatio?, shadow?, grass? })
  constructor({ renderer, scene, world, compile, override = null }) {
    this.renderer = renderer;
    this.scene = scene;
    this.world = world;
    this.compile = compile;
    this.override = override;
    this.dpr = window.devicePixelRatio || 1;

    this.mode = override ? 'teshis' : 'oto';
    this.phase = 'sabit';   // 'arama' | 'izleme' | 'sabit'
    this.index = 0;
    this.applied = null;
    this.busy = false;      // shader derleniyor → ana döngü bekler
    this.skip = 0;
    this.wait = 0;
    this.hz = 60;
    this.tier = 'low';      // 'high' (ekran hızı) | 'low' (kararlı 60)
    this.scores = {};       // kademe → aramada ölçülen FPS
    this.cool = new Map();  // kademe → { until, dur }
    this.trial = null;      // yukarı deneme: { from, until }
    this.lastFps = null;
    this.resetSample();

    // Sekme arka plana geçince ölçüm bozulmasın: dönüşte baştan say
    document.addEventListener('visibilitychange', () => {
      this.resetSample();
      this.skip = Math.max(this.skip, Q.skipFrames);
    });
  }

  // ---------- Hedefler ----------
  get highTarget() { return this.hz * Q.targetRatio; }
  get lowTarget() { return Math.min(this.hz, Q.lowHz) * Q.targetRatio; }
  get target() { return this.tier === 'high' ? this.highTarget : this.lowTarget; }
  // "Bol FPS": hedefin üstünde pay var. FPS ekran hızına kilitliyse (daha fazlası
  // ölçülemez) ekran hızının %97'si yeterli sayılır.
  get upTarget() { return Math.min(this.target * Q.upHeadroom, this.hz * 0.97); }

  // Ekran yenileme hızını ölç: hiçbir şey çizmeden ~30 kare arası sürenin ortancası.
  // (Ağır çizim yapılırken ölçülse oyunun kendi yavaşlığı karışırdı.)
  async measureRefresh() {
    const deltas = [];
    await Promise.race([
      new Promise((resolve) => {
        let prev = null;
        const tick = (t) => {
          if (prev !== null) deltas.push(t - prev);
          prev = t;
          if (deltas.length < 30) requestAnimationFrame(tick); else resolve();
        };
        requestAnimationFrame(tick);
      }),
      new Promise((resolve) => setTimeout(resolve, 1500)),  // sekme gizliyse bekleme
    ]);
    if (deltas.length < 10) return 60;
    deltas.sort((a, b) => a - b);
    const hz = 1000 / deltas[deltas.length >> 1];
    return COMMON_HZ.reduce((best, h) => (Math.abs(h - hz) < Math.abs(best - hz) ? h : best), 60);
  }

  // Açılışta bir kez: ekran hızını ölç, kayıtlı modu uygula
  async start(mode) {
    this.hz = await this.measureRefresh();
    if (this.override) return this.setMode('teshis');
    return this.setMode(mode);
  }

  async setMode(mode) {
    if (this.override) mode = 'teshis';
    if (!(mode in MODE_NAMES)) mode = 'oto';
    this.mode = mode;
    this.trial = null;
    this.resetSample();

    if (mode === 'oto') {
      this.tier = Q.preferHighRefresh && this.hz >= 90 ? 'high' : 'low';
      this.scores = {};
      this.cool.clear();
      this.phase = 'arama';
      this.wait = Q.warmup;
      await this.apply(this.loadAutoLevel());
    } else {
      this.phase = 'sabit';
      await this.apply(mode === 'teshis' ? 0 : Q.presets[mode]);
    }
  }

  // ---------- Kademe uygulama ----------
  // Seviyenin bu cihazdaki gerçek karşılığı (DPR 1 olan ekranda 2× istemenin anlamı yok)
  effective(i) {
    const l = { ...Q.levels[i], ...(this.override || {}) };
    return { pixelRatio: Math.min(this.dpr, l.pixelRatio), shadow: l.shadow, grass: l.grass };
  }

  async apply(i) {
    i = Math.max(0, Math.min(Q.levels.length - 1, i | 0));
    const next = this.effective(i);
    const prev = this.applied;
    this.index = i;
    this.applied = next;
    this.resetSample();
    this.skip = Q.skipFrames;
    if (this.mode === 'oto') this.saveAutoLevel(i);

    if (!prev || prev.pixelRatio !== next.pixelRatio) {
      this.renderer.setPixelRatio(next.pixelRatio);
    }
    if (!prev || prev.grass !== next.grass) {
      this.world.setGrassRatio(next.grass);
    }
    if (!prev || prev.shadow !== next.shadow) {
      const on = next.shadow !== 'off';
      this.renderer.shadowMap.enabled = on;
      if (on) this.renderer.shadowMap.type = SHADOW_TYPES[next.shadow];
      this.world.setShadows(on);
      if (prev) {
        // Gölge türü shader'ın içine gömülüdür: malzemeler yeniden derlenmeli.
        this.scene.traverse((o) => {
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; });
          else if (m) m.needsUpdate = true;
        });
        // Derleme bitene kadar bekle; ana döngü bu sırada çizmez (takılma ölçüme girmez)
        this.busy = true;
        try {
          await this.compile();
        } catch (err) {
          console.warn('Kalite: derleme beklenemedi', err);
        } finally {
          this.busy = false;
          this.skip = Q.skipFrames;
          this.resetSample();
        }
      }
    }
  }

  // Görünür bir fark yaratan bir alt (dir = +1) ya da üst (dir = -1) kademe; yoksa -1
  neighbor(dir) {
    const cur = JSON.stringify(this.applied);
    for (let i = this.index + dir; i >= 0 && i < Q.levels.length; i += dir) {
      if (JSON.stringify(this.effective(i)) !== cur) return i;
    }
    return -1;
  }

  coolDown(i) {
    const prev = this.cool.get(i);
    const dur = prev ? Math.min(prev.dur * 2, Q.cooldownMax) : Q.cooldown;
    this.cool.set(i, { dur, until: performance.now() + dur * 1000 });
  }

  isCooling(i) {
    const c = this.cool.get(i);
    return !!c && performance.now() < c.until;
  }

  resetSample() {
    this.frames = 0;
    this.time = 0;
    this.below = 0;  // izleme: üst üste hedefin altında geçen süre
    this.above = 0;  // izleme: üst üste bol FPS ile geçen süre
  }

  // ---------- Her kare ----------
  // raw = sınırlanmamış kare süresi (sn)
  update(raw) {
    if (this.busy || this.phase === 'sabit' || document.hidden) return;
    if (this.wait > 0) { this.wait -= raw; return; }
    if (this.skip > 0) { this.skip--; return; }

    this.frames++;
    this.time += raw;
    const span = this.phase === 'arama' ? Q.sampleTime : Q.window;
    if (this.time < span) return;

    const fps = this.frames / this.time;
    this.lastFps = fps;
    this.frames = 0;
    this.time = 0;
    if (this.phase === 'arama') this.searchStep(fps);
    else this.monitorStep(fps, span);
  }

  searchStep(fps) {
    this.scores[this.index] = fps;
    if (fps >= this.target) {
      this.phase = 'izleme';
      this.resetSample();
      return;
    }
    this.coolDown(this.index);  // bu kademe şimdilik yetmiyor
    const next = this.neighbor(+1);
    if (next >= 0) {
      this.apply(next);
      return;
    }
    // Liste bitti. Yüksek hedef (ör. 110) hiçbir kademede tutmadıysa: kararlı 60'a geç
    // ve ona yeten EN KALİTELİ kademeyi seç; o da yoksa en yüksek FPS'i vereni.
    if (this.tier === 'high') this.tier = 'low';
    const measured = Object.entries(this.scores).map(([i, f]) => [Number(i), f]);
    const ok = measured.filter(([, f]) => f >= this.target).sort((a, b) => a[0] - b[0]);
    const pick = ok.length ? ok[0][0] : measured.sort((a, b) => b[1] - a[1])[0][0];
    for (const [i] of ok) this.cool.delete(i);  // yeni hedefe yeten kademeler artık engelli değil
    this.phase = 'izleme';
    if (pick !== this.index) this.apply(pick); else this.resetSample();
  }

  monitorStep(fps, span) {
    this.below = fps < this.target * Q.downMargin ? this.below + span : 0;
    this.above = fps >= this.upTarget ? this.above + span : 0;

    // Yukarı deneme süresi sorunsuz geçtiyse o kademenin soğuma kaydını sil
    if (this.trial && performance.now() > this.trial.until) {
      this.cool.delete(this.index);
      this.trial = null;
    }

    if (this.below >= Q.downAfter) {
      if (this.trial) {
        // Deneme tutmadı: geri in, bu kademeyi (giderek uzayan) soğumaya al
        const from = this.trial.from;
        this.coolDown(this.index);
        this.trial = null;
        this.apply(from);
        return;
      }
      const next = this.neighbor(+1);
      if (next >= 0) {
        this.coolDown(this.index);
        this.apply(next);
      } else if (this.tier === 'high') {
        this.tier = 'low';  // en alttayız ve yüksek hedef tutmuyor → kararlı 60
        this.resetSample();
      } else {
        this.resetSample();
      }
      return;
    }

    if (this.above >= Q.upAfter) {
      // 120 Hz ekranda kararlı 60'tayken FPS yüksek hedefe de yetiyorsa hedefi yükselt
      if (this.tier === 'low' && Q.preferHighRefresh && this.hz >= 90 && fps >= this.highTarget) {
        this.tier = 'high';
        this.resetSample();
        return;
      }
      const up = this.neighbor(-1);
      if (up >= 0 && !this.isCooling(up)) {
        this.trial = { from: this.index, until: performance.now() + Q.downAfter * 3000 };
        this.apply(up);
      } else {
        this.above = 0;
      }
    }
  }

  // ---------- Kalıcılık ----------
  loadAutoLevel() {
    try {
      const v = parseInt(localStorage.getItem(Q.autoLevelKey), 10);
      return Number.isFinite(v) && v >= 0 && v < Q.levels.length ? v : 0;
    } catch (err) {
      return 0;
    }
  }

  saveAutoLevel(i) {
    try { localStorage.setItem(Q.autoLevelKey, String(i)); } catch (err) { /* önemsiz */ }
  }

  // ---------- ?fps göstergesi ----------
  describe() {
    const a = this.applied;
    if (!a) return '';
    const grass = a.grass > 0 ? `çim %${Math.round(a.grass * 100)}` : 'çim yok';
    let line2 = `${MODE_NAMES[this.mode]} · ${this.hz} Hz`;
    if (this.mode === 'oto') {
      line2 += ` · hedef ${Math.round(this.target)} · ${this.busy ? 'derleniyor' : this.phase}`;
      if (this.trial) line2 += ' (deneme)';
    }
    const ground = this.world.groundMode === 'tex' ? '' : ` · zemin ${this.world.groundMode}`;
    return `K${this.index} · ${a.pixelRatio}x · ${SHADOW_NAMES[a.shadow]} · ${grass}${ground}\n${line2}`;
  }
}
