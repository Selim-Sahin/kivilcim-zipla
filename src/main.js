// =============================================================
//  main.js — Giriş noktası: renderer, sahne, kamera, boyutlandırma
//  ve her karede çalışan ana döngü.
// =============================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { Hud } from './hud.js';

const canvas = document.getElementById('game');
const dpr = window.devicePixelRatio || 1;
// Dokunmatik birincil girdi → telefon/tablet kabul et (daha hafif ayarlar)
const isMobile = window.matchMedia('(pointer: coarse)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: dpr <= CONFIG.render.antialiasMaxDpr,
    powerPreference: 'high-performance',
  });
} catch (err) {
  document.getElementById('error').hidden = false;
  throw err;
}
renderer.setPixelRatio(Math.min(dpr, CONFIG.render.maxPixelRatio));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = CONFIG.render.exposure;

const scene = new THREE.Scene();
// Ortografik kamera: perspektif yok, uzaktaki nesneler küçülmez (izometrik görünüm)
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

const world = new World(scene, isMobile);
const hud = new Hud();
const game = new Game({ scene, camera, renderer, world, hud });

new Input(canvas, {
  onPress: () => game.press(),
  onRelease: () => game.release(),
  onCancel: () => game.cancel(),
});

// Adres sonuna ?debug eklenirse oyun nesneleri tarayıcı konsolundan erişilebilir
if (new URLSearchParams(location.search).has('debug')) {
  window.game = game;
  window.kivilcim = { game, world, renderer, scene, camera };
}

// Ekranın kısa kenarına her zaman viewSize kadar dünya sığsın
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);  // false: CSS boyutuna dokunma (style.css belirliyor)
  const aspect = w / h;
  const vs = CONFIG.camera.viewSize;
  const viewW = aspect >= 1 ? vs * aspect : vs;
  const viewH = aspect >= 1 ? vs : vs / aspect;
  camera.left = -viewW / 2;
  camera.right = viewW / 2;
  camera.top = viewH / 2;
  camera.bottom = -viewH / 2;
  camera.updateProjectionMatrix();
  world.resize(viewW, viewH);
}
window.addEventListener('resize', resize);
resize();

// Adres sonuna ?fps eklenirse köşede kare hızı gösterilir
const fpsEl = new URLSearchParams(location.search).has('fps') ? createFpsMeter() : null;
let fpsFrames = 0;
let fpsTime = 0;

let last = performance.now();
renderer.setAnimationLoop((now) => {
  // dt: geçen süre (sn). Sekme arka plandan dönünce büyük sıçrama olmasın diye sınırlı.
  const raw = Math.max(0, (now - last) / 1000);
  last = now;
  const dt = Math.min(raw, CONFIG.render.maxFrameTime);

  game.update(dt);
  world.update(dt, game.focus);
  renderer.render(scene, camera);

  if (fpsEl) {
    fpsFrames++;
    fpsTime += raw;
    if (fpsTime >= 0.5) {
      fpsEl.textContent = Math.round(fpsFrames / fpsTime) + ' FPS';
      fpsFrames = 0;
      fpsTime = 0;
    }
  }
});

function createFpsMeter() {
  const el = document.createElement('div');
  el.id = 'fps';
  document.body.appendChild(el);
  return el;
}
