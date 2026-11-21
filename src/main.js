// =============================================================
//  main.js — Giriş noktası: renderer, sahne, kamera, boyutlandırma,
//  shader ön-derleme, kalite, ana döngü (kare kapısı + sabit zaman adımı).
// =============================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { World } from './world.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Quality } from './quality.js';
import { Settings } from './settings.js';
import { Perf, mark, browserName } from './perf.js';

mark('kv-moduller');  // buraya gelindiyse tüm modüller indi ve çalıştı
const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const loader = document.getElementById('loader');
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

// Kare kapısı: config'teki değer, denemek için ?cap=60 | ?cap=120 | ?cap=0 (sınırsız)
const capParam = parseInt(params.get('cap'), 10);
const fpsCap = capParam >= 0 ? capParam : CONFIG.render.fpsCap;
const perf = new Perf();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
} catch (err) {
  loader.hidden = true;
  document.getElementById('error').hidden = false;
  throw err;
}
// Gerçek gölge varsayılan olarak kapalı (sahte gölgeler: shadows.js). Yalnızca
// masaüstünde menüden "Ultra" seçilirse PCF gölge açılır (quality.js).
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = CONFIG.render.exposure;

const scene = new THREE.Scene();
// Ortografik kamera: perspektif yok, uzaktaki nesneler küçülmez (izometrik görünüm)
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);

const world = new World(scene, isMobile, { ground: diag.ground });
world.bakeGround(renderer);  // zemin gürültüsü bir kez dokuya çizilir
mark('kv-zemin');
const hud = new Hud();
const game = new Game({ scene, camera, renderer, world, hud });
const quality = new Quality({ renderer, scene, world, compile: compileScene, override: diag.override, isMobile });

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
//
//  1) Kare kapısı: fpsCap = 60 iken 120 Hz ekranda her ikinci yenileme atlanır.
//     (1000/fpsCap − 2) ms'lik pay, ekranın zamanlamasındaki küçük oynamalara karşı.
//  2) Sabit zaman adımı: oyun mantığı her zaman 1/120 sn'lik adımlarla ilerler
//     (60 FPS'te karede 2 adım, 120 FPS'te 1). Basma/bırakma olayları gerçekleştikleri
//     zamana göre doğru adıma yerleştirilir; böylece şarj süresi ve zıplama her
//     kare hızında birebir aynıdır.
//  3) Çizim: robot, kamera ve pelerin son iki adımın arasına ara değerlenir.
// ---------------------------------------------------------------
const STEP = CONFIG.render.step;
const STEP_MS = STEP * 1000;
const events = [];  // { type: 'press' | 'release' | 'cancel', t: ms }

// t zamanından önce gerçekleşmiş girdileri oyuna ilet
function applyEvents(t) {
  while (events.length && events[0].t < t) {
    const e = events.shift();
    if (e.type === 'press') game.press(e.t);
    else if (e.type === 'release') game.release(e.t);
    else game.cancel();
  }
}

const fpsEl = params.has('fps') ? createFpsMeter() : null;
const browser = browserName();
let statTime = 0;
let statFrames = 0;
let cpuTime = 0;
let pendingReload = false;  // yeni sürüm hazır, uygun anda sayfayı yenile

function startLoop() {
  let simTime = null;   // oyunun ulaştığı an (ms, performance.now() ölçeğinde)
  let lastDraw = null;  // son çizimin anı
  renderer.setAnimationLoop((now) => {
    perf.raf(now);      // ekran Hz ölçümü (atlanan kareler de sayılır)
    if (simTime === null) {
      simTime = now;
      lastDraw = now;
      draw(now, 0, true);
      return;
    }

    // 1) Kare kapısı
    if (fpsCap > 0 && now - lastDraw < 1000 / fpsCap - 2) return;
    const interval = now - lastDraw;
    lastDraw = now;

    // Kalite değişiminde shader'lar derlenirken çizme: ekran son karede kalır,
    // oyun da duraklar (takılma fizik sıçramasına dönüşmesin).
    if (quality.busy) {
      simTime = now;
      return;
    }

    // 2) Sabit adımlar
    const t0 = performance.now();
    let steps = 0;
    while (simTime + STEP_MS <= now && steps < CONFIG.render.maxSteps) {
      applyEvents(simTime + STEP_MS);
      game.clock = simTime + STEP_MS;
      game.step(STEP);
      simTime += STEP_MS;
      steps++;
    }
    // Uzun takılma (ör. sekme arka plandaydı): yetişilemeyen süre atılır, oyun sıçramaz
    if (now - simTime > STEP_MS) simTime = now;

    draw(now, interval, false, (now - simTime) / STEP_MS, t0);
  });
}

function draw(now, interval, first, alpha = 1, t0 = performance.now()) {
  // 3) Ara değerli çizim
  const focus = game.beginRender(alpha);
  world.update(Math.min(interval / 1000, 0.1), focus);
  renderer.render(scene, camera);
  game.endRender();
  cpuTime += performance.now() - t0;  // JS + çizim komutlarının gönderilmesi (GPU'nun kendi işi hariç)

  if (first) {
    mark('kv-ilk-kare');
    perf.logStartup();
    return;
  }
  quality.update(interval / 1000);
  perf.frame(now, interval);
  if (perf.hz && quality.hz !== perf.hz) quality.hz = perf.hz;

  if (pendingReload && isFreshStart()) location.reload();

  if (fpsEl) {
    statFrames++;
    statTime += interval;
    if (statTime >= 500) {
      fpsEl.textContent = fpsText(cpuTime / statFrames);
      statFrames = 0;
      statTime = 0;
      cpuTime = 0;
    }
  }
}

// ?fps göstergesi
function fpsText(cpu) {
  const s = perf.stats(fpsCap);
  const hzNote = perf.hzMeasured ? '' : (perf.hz ? ' (kayıtlı)' : ' (ölçülüyor)');
  const lines = [
    `kare ${s.median.toFixed(1)} ms · p90 ${s.p90.toFixed(1)} · takılma ${s.stutters}/3 sn`,
    `${browser} · ekran ${perf.hz || '?'} Hz${hzNote} · sınır ${fpsCap || 'yok'}`,
    `işlemci ${cpu.toFixed(1)} ms · hedef aralık ${perf.targetInterval(fpsCap).toFixed(1)} ms`,
    quality.describe(),
    perf.startupLine(),
  ];
  return lines.filter(Boolean).join('\n');
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
// Bu turda otomatik kalite ARAMASI kapalı: kademe değişimleri ölçümü bozmasın.
// 'Otomatik' seçiliyken son kayıtlı otomatik kademede sabit kalınır.
async function applyQualityMode(mode) {
  if (mode === 'oto' && !diag.override) {
    quality.mode = 'oto';
    quality.phase = 'sabit';
    quality.trial = null;
    await quality.apply(quality.loadAutoLevel());
  } else {
    await quality.setMode(mode);
  }
}

const settings = new Settings({ locked: !!diag.override, allowUltra: !isMobile });
quality.hz = perf.hz || 60;  // kayıtlı ekran hızı; açılışta ölçüm beklenmez
try {
  await applyQualityMode(settings.mode);
  await compileScene();
} catch (err) {
  console.warn('Shader ön-derleme atlandı:', err);
}
mark('kv-shader');
settings.onChange = (mode) => applyQualityMode(mode);

new Input(canvas, {
  onPress: (t) => events.push({ type: 'press', t }),
  onRelease: (t) => events.push({ type: 'release', t }),
  onCancel: (t) => events.push({ type: 'cancel', t }),
});

startLoop();
loader.classList.add('done');
loader.addEventListener('transitionend', () => loader.remove(), { once: true });
setTimeout(() => loader.remove(), 1000);  // geçiş olayı gelmezse yine kaldır
registerServiceWorker();
