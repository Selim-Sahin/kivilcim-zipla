// =============================================================
//  quality.js — Uyarlanabilir kalite
//
//  Açılışta birkaç saniye FPS ölçer. Hedefin altındaysa
//  CONFIG.quality.levels listesinde bir kademe aşağı iner ve yeniden
//  ölçer. Hedef tutunca ya da liste bitince ölçüm durur; oyun
//  sırasında kalite bir daha değişmez (ekran titremesin).
// =============================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';

const Q = CONFIG.quality;
const SHADOW_TYPES = { pcfsoft: THREE.PCFSoftShadowMap, pcf: THREE.PCFShadowMap };
const SHADOW_NAMES = { pcfsoft: 'yumuşak gölge', pcf: 'sert gölge', off: 'gölge yok' };

export class Quality {
  constructor({ renderer, scene, world }) {
    this.renderer = renderer;
    this.scene = scene;
    this.world = world;
    this.dpr = window.devicePixelRatio || 1;

    this.index = 0;
    this.applied = null;   // şu an uygulanan ayarlar (gerçek pixelRatio dahil)
    this.measuring = true;
    this.wait = Q.warmup;  // bu süre bitmeden ölçme
    this.frames = 0;
    this.time = 0;
    this.firstFps = null;  // en iyi kalitede ölçülen FPS
    this.lastFps = null;

    // Sekme arka plana geçince ölçüm bozulmasın: dönüşte baştan say
    document.addEventListener('visibilitychange', () => this.restartSample(Q.settle));

    this.apply(0);
  }

  // Seviyenin bu cihazdaki gerçek karşılığı (DPR 1 olan ekranda 2× istemenin anlamı yok)
  effective(i) {
    const l = Q.levels[i];
    return {
      pixelRatio: Math.min(this.dpr, l.pixelRatio),
      shadow: l.shadow,
      grass: l.grass,
    };
  }

  apply(i) {
    const next = this.effective(i);
    const prev = this.applied;
    this.index = i;
    this.applied = next;

    if (!prev || prev.pixelRatio !== next.pixelRatio) {
      this.renderer.setPixelRatio(next.pixelRatio);
    }
    if (!prev || prev.shadow !== next.shadow) {
      const on = next.shadow !== 'off';
      this.renderer.shadowMap.enabled = on;
      if (on) this.renderer.shadowMap.type = SHADOW_TYPES[next.shadow];
      this.world.setShadows(on);
      // Gölge türü shader'ın içine gömülüdür; malzemeler yeniden derlenmeli
      if (prev) this.scene.traverse((o) => {
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => { x.needsUpdate = true; });
        else if (m) m.needsUpdate = true;
      });
    }
    if (!prev || prev.grass !== next.grass) {
      this.world.setGrassRatio(next.grass);
    }
  }

  // Görünür bir fark yaratan bir sonraki kademe (yoksa -1)
  nextIndex() {
    const cur = JSON.stringify(this.applied);
    for (let i = this.index + 1; i < Q.levels.length; i++) {
      if (JSON.stringify(this.effective(i)) !== cur) return i;
    }
    return -1;
  }

  restartSample(wait) {
    this.frames = 0;
    this.time = 0;
    this.wait = Math.max(this.wait, wait);
  }

  // Her karede çağrılır; raw = sınırlanmamış kare süresi (sn)
  update(raw) {
    if (!this.measuring || document.hidden) return;
    if (this.wait > 0) {
      this.wait -= raw;
      return;
    }
    this.frames++;
    this.time += raw;
    if (this.time < Q.sampleTime) return;

    const fps = this.frames / this.time;
    this.lastFps = fps;
    if (this.firstFps === null) this.firstFps = fps;

    const next = fps < Q.targetFps ? this.nextIndex() : -1;
    if (next >= 0) {
      this.apply(next);
      this.restartSample(Q.settle);
      return;
    }

    this.measuring = false;
    // Kademeler hiç işe yaramadıysa kare hızı dışarıdan kilitli: en iyi kaliteye dön
    if (this.index > 0 && fps < Q.targetFps && fps - this.firstFps < Q.minGain) {
      this.apply(0);
    }
  }

  // ?fps göstergesi için kısa açıklama
  describe() {
    const a = this.applied;
    const grass = Math.round(a.grass * 100);
    const state = this.measuring ? ' · ölçülüyor' : '';
    return `K${this.index} · ${a.pixelRatio}x · ${SHADOW_NAMES[a.shadow]} · çim %${grass}${state}`;
  }
}
