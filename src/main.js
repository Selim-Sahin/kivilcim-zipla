// =============================================================
//  main.js — Giriş noktası: renderer, sahne, kamera, boyutlandırma,
//  shader ön-derleme, uyarlanabilir kalite ve ana döngü.
// =============================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Quality } from './quality.js';
import { Settings } from './settings.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const loader = document.getElementById('loader');
const dpr = window.devicePixelRatio || 1;
// Dokunmatik birincil girdi → telefon/tablet kabul et (daha hafif ayarlar)
const isMobile = window.matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------
//  Teşhis parametreleri (README'de anlatıldı). Herhangi biri varsa
//  otomatik kalite kapanır, böylece tek bir ayarın FPS etkisi ölçülebilir:
//    ?fps&pr=1  ?fps&shadow=off|pcf|pcfsoft  ?fps&grass=0|0.5  ?fps&ground=flat|noise
// ---------------------------------------------------------------
function readDiagnostics() {
  const o = {};
  const pr = parseFloat(params.get('pr'));
  if (pr > 0) o.pixelRatio = pr;
  if (['off', 'pcf', 'pcfsoft'].includes(params.get('shadow'))) o.shadow = params.get('shadow');
  const grass = parseFloat(params.get('grass'));
  if (grass >= 0) o.grass = Math.min(1, grass);
  const ground = ['flat', 'noise', 'tex'].includes(params.get('ground')) ? params.get('ground') : 'tex';
  const any = Object.keys(o).length > 0 || params.has('ground');
  return { override: any ? o : null, ground };
}
const diag = readDiagnostics();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: dpr <= CONFIG.render.antialiasMaxDpr,
    powerPreference: 'high-performance',
  });
} catch (err) {
  loader.hidden = true;
  document.getElementById('error').hidden = false;
  throw err;
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = CONFIG.render.exposure;

const scene = new THREE.Scene();
// Ortografik kamera: perspektif yok, uzaktaki nesneler küçülmez (izometrik görünüm)
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

const world = new World(scene, isMobile, { ground: diag.ground });
world.bakeGround(renderer);  // zemin gürültüsü bir kez dokuya çizilir
const hud = new Hud();
const game = new Game({ scene, camera, renderer, world, hud });
const quality = new Quality({ renderer, scene, world, compile: compileScene, override: diag.override });

// Adres sonuna ?debug eklenirse oyun nesneleri tarayıcı konsolundan erişilebilir
if (params.has('debug')) {
  window.game = game;
  window.kivilcim = { game, world, renderer, scene, camera, quality };
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

// ---------------------------------------------------------------
//  Shader derleme: ilk zıplamada / yeni platform tipinde takılma
//  olmasın diye tüm malzemeler yükleme ekranı açıkken derlenir.
//  Kalite sistemi de gölge türü değişince bunu çağırır ve bitmesini bekler.
// ---------------------------------------------------------------
async function compileScene() {
  // Henüz sahnede olmayan platform malzemeleri için geçici küçük kutular
  const temp = new THREE.Group();
  const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  for (const mat of Object.values(game.platforms.materials)) {
    const m = new THREE.Mesh(box, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    temp.add(m);
  }
  temp.position.copy(game.focus);
  scene.add(temp);

  // Gizli nesneler (güç halkası, efektler) de derlensin diye geçici olarak görünür yap
  const hidden = [];
  scene.traverse((o) => {
    if (!o.visible) { hidden.push(o); o.visible = true; }
  });

  try {
    await renderer.compileAsync(scene, camera);
  } finally {
    for (const o of hidden) o.visible = false;
  }
  try {
    // Gölge (derinlik) malzemeleri ilk çizimde derlenir. Gizli nesneler yeniden gizlendi;
    // geçici kutular 1 cm'lik olduğundan bu kare normal oyun karesinden farksızdır.
    renderer.render(scene, camera);
  } finally {
    scene.remove(temp);
    box.dispose();
  }
}

// ---------------------------------------------------------------
//  Ana döngü
// ---------------------------------------------------------------
const fpsEl = params.has('fps') ? createFpsMeter() : null;
let fpsFrames = 0;
let fpsTime = 0;
let cpuTime = 0;
let pendingReload = false;  // yeni sürüm hazır, uygun anda sayfayı yenile

function startLoop() {
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    // dt: geçen süre (sn). Sekme arka plandan dönünce büyük sıçrama olmasın diye sınırlı.
    const raw = Math.max(0, (now - last) / 1000);
    last = now;
    // Kalite değişiminde shader'lar derlenirken çizme: ekran son karede kalır,
    // oyun da duraklar (takılma fizik sıçramasına dönüşmesin).
    if (quality.busy) return;
    const dt = Math.min(raw, CONFIG.render.maxFrameTime);

    const t0 = performance.now();
    game.update(dt);
    world.update(dt, game.focus);
    renderer.render(scene, camera);
    cpuTime += performance.now() - t0;  // JS + çizim komutlarının gönderilmesi (GPU'nun kendi işi hariç)
    quality.update(raw);

    if (pendingReload && isFreshStart()) location.reload();

    if (fpsEl) {
      fpsFrames++;
      fpsTime += raw;
      if (fpsTime >= 0.5) {
        const cpu = (cpuTime / fpsFrames).toFixed(1);
        fpsEl.textContent = `${Math.round(fpsFrames / fpsTime)} FPS · işlemci ${cpu} ms\n` + quality.describe();
        fpsFrames = 0;
        cpuTime = 0;
        fpsTime = 0;
      }
    }
  });
}

// Oyuncu henüz hiç puan almamışsa yenilemek hiçbir şey kaybettirmez
function isFreshStart() {
  return game.state === 'hazir' && game.score === 0;
}

function createFpsMeter() {
  const el = document.createElement('div');
  el.id = 'fps';
  document.body.appendChild(el);
  return el;
}

// ---------------------------------------------------------------
//  Service worker: dosyaları önbelleğe alır (hızlı ikinci açılış,
//  çevrimdışı oyun). Yeni sürüm yüklenince uygun anda yenilenir.
// ---------------------------------------------------------------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) pendingReload = true;  // ilk kurulumda yenilemeye gerek yok
  });
  navigator.serviceWorker.register('./sw.js').catch((err) => {
    console.warn('Service worker kaydedilemedi:', err);
  });
}

// ---------------------------------------------------------------
//  Başlat
// ---------------------------------------------------------------
const settings = new Settings({ locked: !!diag.override });
try {
  // Kayıtlı kalite modunu uygula (ekran hızını da ölçer), ardından tüm shader'ları derle
  await quality.start(settings.mode);
  await compileScene();
} catch (err) {
  console.warn('Shader ön-derleme atlandı:', err);
}
settings.onChange = (mode) => quality.setMode(mode);

new Input(canvas, {
  onPress: () => game.press(),
  onRelease: () => game.release(),
  onCancel: () => game.cancel(),
});

startLoop();
loader.classList.add('done');
loader.addEventListener('transitionend', () => loader.remove(), { once: true });
setTimeout(() => loader.remove(), 1000);  // geçiş olayı gelmezse yine kaldır
registerServiceWorker();
