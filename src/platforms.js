// =============================================================
//  platforms.js — Bahçe objelerinden platformlar
//  Kütük, yassı dere taşı, tahta sandık, yosunlu tuğla yığını.
//  Her platformun parçaları tek bir geometride birleştirilir
//  (az çizim çağrısı = daha akıcı). Malzeme ve dokular paylaşımlıdır;
//  ekrandan çıkan platformların yalnızca geometrisi silinir.
// =============================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';
import { Spring } from './robot.js';
import { createPlatformShadow, disposePlatformShadow, groundDecalPosition } from './shadows.js';

const P = CONFIG.platforms;
const D = CONFIG.difficulty;
const C = CONFIG.colors;

const rand = (a, b) => a + Math.random() * (b - a);  // [a, b) arası rastgele sayı
const lerp = THREE.MathUtils.lerp;

// İlerleme yönleri (izometrik eksenler): ekranda sol-yukarı (−X), sağ-yukarı (−Z)
const DIRECTIONS = [{ x: -1, z: 0 }, { x: 0, z: -1 }];

// ---------------------------------------------------------------
//  Kodla çizilen dokular (Canvas 2D → Three.js dokusu)
// ---------------------------------------------------------------
function canvasTexture(w, h, draw, aniso) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  return tex;
}

function shade(hex, f) {
  return new THREE.Color(hex).multiplyScalar(f).getStyle();
}

// Kütük üstü: yıllık halkalar, öz ve bir çatlak
function drawRings(ctx, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const R = w / 2;
  ctx.fillStyle = C.bark;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = C.woodLight;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.88, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = C.woodRing;
  let r = R * 0.84;
  while (r > 5) {
    const k = Math.random() * 10;
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const rr = r * (1 + 0.03 * Math.sin(a * 3 + k));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.globalAlpha = 0.35 + Math.random() * 0.35;
    ctx.lineWidth = 1 + Math.random() * 1.6;
    ctx.stroke();
    r -= 5 + Math.random() * 7;
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = C.woodRing;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(60, 35, 20, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx + 6, cy);
  ctx.lineTo(cx + R * 0.45, cy + R * 0.08);
  ctx.lineTo(cx + R * 0.8, cy + R * 0.04);
  ctx.stroke();
}

// Ağaç kabuğu: dikey çizgiler ve kısa çatlaklar
function drawBark(ctx, w, h) {
  ctx.fillStyle = C.bark;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = Math.random() < 0.6 ? 'rgba(30, 18, 10, 0.35)' : 'rgba(150, 110, 80, 0.25)';
    ctx.fillRect(Math.random() * w, 0, 1 + Math.random() * 5, h);
  }
  ctx.fillStyle = 'rgba(25, 15, 8, 0.4)';
  for (let i = 0; i < 25; i++) {
    ctx.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 8, 1.5);
  }
}

// Sandık tahtaları: 4 yatay tahta, damarlar ve çiviler
function drawPlanks(ctx, w, h) {
  const rows = 4;
  const ph = h / rows;
  for (let i = 0; i < rows; i++) {
    const y0 = i * ph;
    ctx.fillStyle = shade(C.crate, 0.85 + Math.random() * 0.25);
    ctx.fillRect(0, y0, w, ph);
    ctx.strokeStyle = 'rgba(90, 55, 25, 0.25)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const gy = y0 + 4 + Math.random() * (ph - 8);
      ctx.beginPath();
      ctx.moveTo(0, gy);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, gy + Math.sin(x * 0.05 + k) * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(60, 35, 15, 0.8)';
    ctx.fillRect(0, y0, w, 3);
    ctx.fillStyle = 'rgba(50, 40, 35, 0.9)';
    for (const x of [22, w - 22]) {
      ctx.beginPath();
      ctx.arc(x, y0 + ph / 2, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function createMaterials(aniso) {
  const barkTex = canvasTexture(128, 256, drawBark, aniso);
  barkTex.wrapS = THREE.RepeatWrapping;
  barkTex.repeat.set(3, 1);
  return {
    // Lambert: yalnızca dağınık ışık (pürüzlü ahşap/taş için fiziksel malzemeyle neredeyse aynı,
    // piksel başına çok daha ucuz; robotla aynı shader programlarını paylaşır)
    bark: new THREE.MeshLambertMaterial({ map: barkTex, flatShading: true }),
    stumpTop: new THREE.MeshLambertMaterial({ map: canvasTexture(256, 256, drawRings, aniso) }),
    stone: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    crate: new THREE.MeshLambertMaterial({ map: canvasTexture(256, 256, drawPlanks, aniso) }),
    crateFrame: new THREE.MeshLambertMaterial({ color: C.crateFrame }),
    bricks: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  };
}

// ---------------------------------------------------------------
//  Platform üreticileri. Hepsi orijinde, tabanı y = 0'da kurulur ve
//  { geo, mat, shape, half, top } döndürür:
//    shape: 'circle' | 'rect'   (üst yüzeyin izi)
//    half : yarıçap ya da yarı kenar,  top: üst yüzey yüksekliği
// ---------------------------------------------------------------
function buildStump(r, M) {
  const h = rand(0.7, 0.95);
  const bark = new THREE.CylinderGeometry(r, r * 1.12, h, 20, 3, true);
  bark.translate(0, h / 2, 0);

  // Gövdeyi düzensizleştir; üst kenar sabit kalsın ki üst diskle arada boşluk olmasın
  const p = bark.attributes.position;
  const k1 = rand(0, 6);
  const k2 = rand(0, 6);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    if (y > h - 0.001) continue;
    const a = Math.atan2(z, x);
    const bump = 1 + 0.05 * Math.sin(a * 5 + k1) + 0.03 * Math.sin(a * 9 + k2);
    p.setXYZ(i, x * bump, y, z * bump);
  }
  bark.computeVertexNormals();

  // Toprağa dalan kökler: yatırılmış sivri silindirler
  const parts = [bark];
  const rootCount = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < rootCount; i++) {
    const len = r * rand(0.5, 0.8);
    const root = new THREE.CylinderGeometry(0.02, r * 0.2, len, 6, 1);
    root.rotateZ(-(Math.PI / 2 + 0.3));
    root.translate(r * 0.8 + 0.48 * len, 0.12 - 0.15 * len, 0);
    root.rotateY((i / rootCount) * Math.PI * 2 + rand(-0.4, 0.4));
    parts.push(root);
  }
  const barkAll = mergeGeometries(parts);

  const top = new THREE.CircleGeometry(r, 28);
  top.rotateX(-Math.PI / 2);
  top.translate(0, h, 0);

  // useGroups = true → grup 0 kabuk malzemesi, grup 1 halkalı üst yüz
  const geo = mergeGeometries([barkAll, top], true);
  for (const g of parts) g.dispose();
  barkAll.dispose();
  top.dispose();
  return { geo, mat: [M.bark, M.stumpTop], shape: 'circle', half: r, top: h, foot: 1.12 };
}

function buildStone(r, M) {
  const h = rand(0.32, 0.42);
  // Yan kesit profili: düz taban, yuvarlak kenar, hafif kubbeli üst
  const sideR = r * 0.18;
  const pts = [new THREE.Vector2(0.001, 0)];
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI;
    pts.push(new THREE.Vector2(r - sideR + Math.cos(a) * sideR, h / 2 + Math.sin(a) * h / 2));
  }
  pts.push(new THREE.Vector2(r * 0.5, h * 1.02));
  pts.push(new THREE.Vector2(0.001, h * 1.03));
  const geo = new THREE.LatheGeometry(pts, 16);

  // Kenarı düzensizleştir ve köşe başına renk tonu ver (benekli taş)
  const p = geo.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const base = new THREE.Color(C.stone);
  const c = new THREE.Color();
  const k1 = rand(0, 6);
  const k2 = rand(0, 6);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const s = 1 + 0.05 * Math.sin(a * 2 + k1) + 0.03 * Math.sin(a * 3 + k2);
    p.setXYZ(i, x * s, y, z * s);
    c.copy(base).multiplyScalar(0.85 + Math.random() * 0.2 + (y / h) * 0.12);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return { geo, mat: M.stone, shape: 'circle', half: r, top: h + 0.005 };
}

function buildCrate(r, M) {
  const half = r * 0.92;
  const s = half * 2;
  const h = THREE.MathUtils.clamp(s * 0.72, 0.6, 0.95);
  const t = Math.max(0.06, s * 0.06);   // çerçeve kalınlığı

  const panel = new THREE.BoxGeometry(s - t * 0.5, h - 0.01, s - t * 0.5);
  panel.translate(0, (h - 0.01) / 2, 0);

  // Çerçeve parçaları: dikmeler, üst/alt kirişler, yanlarda çapraz destek
  const frame = [];
  const add = (w, hh, d, x, y, z, rotZ = 0, rotY = 0) => {
    const g = new THREE.BoxGeometry(w, hh, d);
    if (rotZ) g.rotateZ(rotZ);
    g.translate(x, y, z);
    if (rotY) g.rotateY(rotY);
    frame.push(g);
  };
  const e = half - t / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) add(t, h, t, sx * e, h / 2, sz * e);
  }
  for (const y of [t / 2, h - t / 2]) {
    for (const sz of [-1, 1]) add(s, t, t, 0, y, sz * e);
    for (const sx of [-1, 1]) add(t, t, s - 2 * t, sx * e, y, 0);
  }
  const wIn = s - 2 * t;
  const hIn = h - 2 * t;
  const len = Math.hypot(wIn, hIn);
  const ang = Math.atan2(hIn, wIn);
  for (let i = 0; i < 4; i++) {
    add(len, t * 0.8, t * 0.5, 0, h / 2, half - t * 0.2, i % 2 ? ang : -ang, (i * Math.PI) / 2);
  }
  const frameGeo = mergeGeometries(frame);
  const geo = mergeGeometries([panel, frameGeo], true);
  for (const g of frame) g.dispose();
  frameGeo.dispose();
  panel.dispose();
  return { geo, mat: [M.crate, M.crateFrame], shape: 'rect', half, top: h };
}

// Geometrinin tüm köşelerine tek renk yazar (birleştirince tuğla tuğla renk kalsın)
function paint(g, color) {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function buildBricks(r, M) {
  const half = r * 0.92;
  const s = half * 2;
  const courses = s > 1.3 ? 4 : 3;   // sıra sayısı
  const hb = 0.18;                   // tuğla yüksekliği
  const gap = 0.025;                 // derz
  const parts = [];
  const c = new THREE.Color();
  const brick = new THREE.Color(C.brick);
  const soot = new THREE.Color('#3a2a22');
  const moss = new THREE.Color(C.moss);

  // Her sırada 2 × 4 tuğla; sıralar birbirine dik döşenir (örgü)
  for (let k = 0; k < courses; k++) {
    const alongX = k % 2 === 0;
    const L = s / 2;
    const Wd = s / 4;
    const y = hb * k + hb / 2;
    const jit = k === courses - 1 ? 0.008 : 0.02;  // üst sıra daha düzgün
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 4; j++) {
        const a = -half + L * (i + 0.5);
        const b = -half + Wd * (j + 0.5);
        const g = alongX
          ? new THREE.BoxGeometry(L - gap, hb - gap, Wd - gap)
          : new THREE.BoxGeometry(Wd - gap, hb - gap, L - gap);
        g.rotateY(rand(-2, 2) * jit);
        g.translate((alongX ? a : b) + rand(-jit, jit), y, (alongX ? b : a) + rand(-jit, jit));
        c.copy(brick).multiplyScalar(rand(0.75, 1.15));
        if (Math.random() < 0.15) c.lerp(soot, 0.4);  // isli tuğla
        parts.push(paint(g, c));
      }
    }
  }

  // Yosun: üstte yassı, yanlarda sarkan lekeler
  const topY = courses * hb - gap / 2;
  const mossCount = 4 + Math.floor(Math.random() * 3);
  for (let m = 0; m < mossCount; m++) {
    const g = new THREE.SphereGeometry(rand(0.1, 0.2) * Math.min(1, s), 8, 6);
    if (m < 3) {
      g.scale(1, 0.38, 1);
      g.translate(rand(-0.8, 0.8) * half, topY, rand(-0.8, 0.8) * half);
    } else {
      g.scale(1, 0.7, 0.35);
      g.translate(rand(-0.7, 0.7) * half, rand(hb, topY - 0.05), half);
      g.rotateY(Math.floor(rand(0, 4)) * (Math.PI / 2));
    }
    c.copy(moss).multiplyScalar(rand(0.8, 1.2));
    parts.push(paint(g, c));
  }

  const geo = mergeGeometries(parts);
  for (const g of parts) g.dispose();
  return { geo, mat: M.bricks, shape: 'rect', half, top: topY };
}

const BUILDERS = { stump: buildStump, stone: buildStone, crate: buildCrate, bricks: buildBricks };

// ---------------------------------------------------------------
//  Tek platform
// ---------------------------------------------------------------
class Platform {
  constructor(type, built, drop, decals) {
    this.type = type;
    this.shape = built.shape;
    this.half = built.half;
    this.top = built.top;
    this.x = 0;
    this.z = 0;

    this.mesh = new THREE.Mesh(built.geo, built.mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    // Yuvarlaklar herhangi bir açıda, kareler eksenlere hizalı döner (iz değişmesin)
    this.group.rotation.y = this.shape === 'circle'
      ? Math.random() * Math.PI * 2
      : Math.floor(Math.random() * 4) * (Math.PI / 2);

    this.press = new Spring(0, P.springFreq, P.springDamping);  // 0 = normal, + = basılı
    this.dropT = drop ? 0 : 1;

    // Sahte gölge: yerde, güneş yönüne uzanan yumuşak leke (bir kez çizilir)
    this.shadow = createPlatformShadow(this.shape, this.half, this.top, built.foot || 1);
    this.shadowOpacity = this.shadow.material.opacity;
    decals.add(this.shadow);
  }

  setPosition(x, z) {
    this.x = x;
    this.z = z;
    this.group.position.set(x, this.dropT < 1 ? P.dropHeight : 0, z);
    const c = this.shadow.userData.center;
    groundDecalPosition(this.shadow.position, x + c.x, z + c.y);
    this.shadow.material.opacity = this.shadowOpacity * this.dropT;
  }

  // (x, z) noktası üst yüzeyin izinde mi? margin: kenardan taşma payı
  contains(x, z, margin) {
    const dx = x - this.x;
    const dz = z - this.z;
    const R = this.half + margin;
    if (this.shape === 'circle') return dx * dx + dz * dz <= R * R;
    return Math.abs(dx) <= R && Math.abs(dz) <= R;
  }

  centerDistance(x, z) {
    return Math.hypot(x - this.x, z - this.z);
  }

  // Basılma ve düşme animasyonu dahil, üst yüzeyin anlık yüksekliği
  surfaceY() {
    return this.top * this.group.scale.y + this.group.position.y;
  }

  update(dt) {
    if (this.dropT < 1) {
      this.dropT = Math.min(1, this.dropT + dt / P.dropTime);
      const t = this.dropT;
      this.group.position.y = P.dropHeight * (1 - t * t);  // hızlanarak düşer
      if (this.dropT >= 1) this.press.v += 2.5;              // yere çarpınca hafif ezilme
      this.shadow.material.opacity = this.shadowOpacity * t * t;  // düşerken gölge koyulaşır
    }
    const p = this.press.update(dt);
    this.group.scale.y = 1 - p;
    const sxz = 1 + p * 0.3;
    this.group.scale.x = sxz;
    this.group.scale.z = sxz;
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    this.mesh.geometry.dispose();  // malzemeler paylaşımlı, silinmez
    disposePlatformShadow(this.shadow);
  }
}

// ---------------------------------------------------------------
//  Platform yöneticisi: üretim, zorluk eğrisi, temizlik
// ---------------------------------------------------------------
export class Platforms {
  // decals: sahte gölgelerin ekleneceği grup (World.decals)
  constructor(scene, renderer, decals) {
    this.scene = scene;
    this.decals = decals;
    this.materials = createMaterials(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
    this.list = [];
    this.lastType = null;
    this.sameCount = 0;
    this.frustum = new THREE.Frustum();
    this.projView = new THREE.Matrix4();
    this.sphere = new THREE.Sphere();
  }

  // 0 (kolay) → 1 (zor)
  difficulty(score) {
    return 1 - Math.exp(-score / D.rampScore);
  }

  sizeFor(score) {
    const d = this.difficulty(score);
    return lerp(D.sizeStart, D.sizeEnd, d) * (1 + rand(-D.sizeJitter, D.sizeJitter));
  }

  gapFor(score) {
    const d = this.difficulty(score);
    return rand(lerp(D.gapStart[0], D.gapEnd[0], d), lerp(D.gapStart[1], D.gapEnd[1], d));
  }

  // Ağırlıklı rastgele tip; aynı tip üst üste en fazla 2 kez
  pickType() {
    const entries = Object.entries(P.weights).filter(([type, w]) => {
      return w > 0 && !(type === this.lastType && this.sameCount >= 2);
    });
    let total = 0;
    for (const [, w] of entries) total += w;
    let roll = Math.random() * total;
    let type = entries[entries.length - 1][0];
    for (const [t, w] of entries) {
      roll -= w;
      if (roll <= 0) { type = t; break; }
    }
    this.sameCount = type === this.lastType ? this.sameCount + 1 : 1;
    this.lastType = type;
    return type;
  }

  create(type, r, drop) {
    const p = new Platform(type, BUILDERS[type](r, this.materials), drop, this.decals);
    this.scene.add(p.group);
    this.list.push(p);
    return p;
  }

  // Yeni oyun: ilk iki platformu döndürür
  reset() {
    for (const p of this.list) p.dispose();
    this.list = [];
    this.lastType = null;
    this.sameCount = 0;
    const first = this.create('stump', D.sizeStart, false);
    first.setPosition(0, 0);
    const second = this.spawnNext(first, 0, false);
    return [first, second];
  }

  // "from" platformundan rastgele bir izometrik yönde yeni platform
  spawnNext(from, score, drop = true) {
    const p = this.create(this.pickType(), this.sizeFor(score), drop);
    const dir = DIRECTIONS[Math.random() < 0.5 ? 0 : 1];
    const dist = from.half + p.half + this.gapFor(score);
    p.setPosition(from.x + dir.x * dist, from.z + dir.z * dist);
    return p;
  }

  update(dt) {
    for (const p of this.list) p.update(dt);
  }

  // Kamera görüş alanından tamamen çıkan platformları sil (cur/next hariç)
  cleanup(camera, cur, next) {
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
    this.list = this.list.filter((p) => {
      if (p === cur || p === next) return true;
      this.sphere.center.set(p.x, p.top / 2, p.z);
      this.sphere.radius = p.half * 1.5 + 1.5;   // gölgesi için pay
      if (this.frustum.intersectsSphere(this.sphere)) return true;
      p.dispose();
      return false;
    });
    // Güvenlik sınırı: çok birikirse en eskiyi sil
    while (this.list.length > P.maxCount) {
      const i = this.list.findIndex((p) => p !== cur && p !== next);
      if (i < 0) break;
      this.list[i].dispose();
      this.list.splice(i, 1);
    }
  }
}
