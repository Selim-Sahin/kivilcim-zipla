// =============================================================
//  shadows.js — Sahte (ucuz) gölgeler
//
//  Gerçek gölge (shadow map) sahneyi güneşin gözünden bir kez daha çizer
//  ve her pikselde gölge dokusunu örnekler: telefonda pahalı. Bunun yerine:
//   • Robot: altında yumuşak kenarlı yuvarlak bir leke (tek dörtgen).
//     Altındaki yüzeye (zemin ya da platform üstü) oturur; robot yükseldikçe
//     küçülür ve solar. Havadayken tam altında durduğu için iniş noktasını gösterir.
//   • Platformlar: ayak izinin güneş yönünde uzatılmış hâli; yarı saydam koyu
//     bir "çıkartma". Dokusu platform oluşturulurken bir kez kodla çizilir.
//  Platform üstünde çıkartma yüzeyin çok az üstündedir ve polygonOffset ile
//  öne alınır: yüzeyle aynı derinlikte titreşme (z-fighting) olmaz.
//  Zeminde ise çim yaprakları çıkartmayı örterdi (gölge yalnızca yaprak
//  aralarında görünürdü). Bu yüzden zemin gölgeleri yaprakların hemen üstüne
//  (grassLift) konur ve kameraya doğru aynı oranda kaydırılır: ekranda tam
//  yerdeki konumunda görünür, altındaki yaprakları da koyulaştırır.
// =============================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';

const S = CONFIG.shadows;
const L = CONFIG.light;

// Güneş yönü: yükseklik başına gölgenin yerde kaydığı mesafe (x, z)
export const SUN_SHIFT = new THREE.Vector2(-L.sunOffset.x / L.sunOffset.y, -L.sunOffset.z / L.sunOffset.y);

// h yüksekliğindeki bir nokta, kameraya doğru h × CAM_SHIFT kaydırılırsa
// ekranda yerdeki (h = 0) noktayla aynı piksele düşer (ortografik kamera).
const CO = CONFIG.camera.offset;
const CAM_SHIFT = new THREE.Vector2(CO.x, CO.z).divideScalar(CO.y);

// Zemindeki bir gölgenin konumu: (x, z) yerdeki nokta → çimin üstündeki eşdeğeri
export function groundDecalPosition(out, x, z, lift = S.grassLift) {
  return out.set(x + CAM_SHIFT.x * lift, lift, z + CAM_SHIFT.y * lift);
}

function decalMaterial(map, opacity) {
  return new THREE.MeshBasicMaterial({
    color: S.color,
    map,
    transparent: true,
    opacity,
    depthWrite: false,       // saydam çıkartma derinlik yazmaz (üst üste binince delik açmaz)
    polygonOffset: true,     // derinliği yüzeyden biraz öne al → z-fighting yok
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

// Yere yatırılmış 1×1 dörtgen (ölçekle boyutlandırılır)
const QUAD = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// ---------------------------------------------------------------
//  Robot lekesi
// ---------------------------------------------------------------
function blobTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export class RobotBlob {
  constructor(parent) {
    this.mesh = new THREE.Mesh(QUAD, decalMaterial(blobTexture(), S.blobOpacity));
    this.mesh.renderOrder = 1;      // platform gölgelerinin üstüne çizilsin
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
  }

  // x, y, z: robotun ayak konumu; surfaceY: altındaki yüzeyin yüksekliği
  update(x, y, z, surfaceY) {
    const h = Math.max(0, y - surfaceY);
    const k = Math.min(1, h / S.blobFadeHeight);       // 0 yerde … 1 en yüksekte
    const size = S.blobSize * (1 - k * (1 - S.blobMinScale));
    // Robotun gövdesi yerden yüksekte: gölgesi güneş yönüne biraz kayar
    const off = S.blobSunOffset;
    const gx = x + SUN_SHIFT.x * off;
    const gz = z + SUN_SHIFT.y * off;
    if (surfaceY > 0) {
      this.mesh.position.set(gx, surfaceY + S.lift, gz);
    } else {
      // Zeminde: çimin üstünde; robot yere yattıysa (oyun sonu) onu örtmesin diye alçalt
      groundDecalPosition(this.mesh.position, gx, gz, Math.max(S.lift, Math.min(S.grassLift, h * 0.5)));
    }
    this.mesh.scale.set(size, 1, size);
    this.mesh.material.opacity = S.blobOpacity * (1 - k * (1 - S.blobMinOpacity));
  }
}

// ---------------------------------------------------------------
//  Platform gölgesi
// ---------------------------------------------------------------
// shape: 'circle' | 'rect', half: üst yüzeyin yarıçapı / yarı kenarı,
// foot: tabandaki yarıçap çarpanı (kütük aşağı doğru genişler), top: yükseklik.
// Döndürülen mesh platform merkezine göre konumlanmıştır (x, z eklenmeli).
export function createPlatformShadow(shape, half, top, foot = 1) {
  const sx = SUN_SHIFT.x * top;   // üst kenarın gölgesinin kayması
  const sz = SUN_SHIFT.y * top;
  const blur = S.platformBlur;
  const reach = half * Math.max(foot, 1) + blur * 2;
  const extent = 2 * (reach + Math.max(Math.abs(sx), Math.abs(sz)) / 2);  // dokunun kapsadığı dünya genişliği

  const px = S.platformTexSize;
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  const scale = px / extent;
  const far = px * 4;   // şekil tuvalin dışına çizilir; yalnızca bulanık "gölgesi" içeri düşer

  ctx.shadowColor = '#fff';
  ctx.shadowBlur = blur * scale;
  ctx.shadowOffsetX = far;
  ctx.fillStyle = '#fff';
  // Ayak izini tabandan üst kenarın gölgesine doğru süpür (yan yüzlerin gölgesi)
  const steps = 12;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = half * (foot + (1 - foot) * t) * scale;
    const cx = px / 2 + (t - 0.5) * sx * scale - far;
    const cy = px / 2 + (t - 0.5) * sz * scale;
    if (shape === 'circle') {
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    } else {
      ctx.rect(cx - r, cy - r, r * 2, r * 2);
    }
  }
  ctx.fill('nonzero');

  // Platformun kendi taban izini sil: çıkartma çimin üstünde durduğu için
  // yoksa platformun alt kenarını da koyulaştırırdı. Gölge tabandan dışarı başlar.
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.globalCompositeOperation = 'destination-out';
  const r0 = half * foot * 0.98 * scale;
  const bx = px / 2 - 0.5 * sx * scale;
  const by = px / 2 - 0.5 * sz * scale;
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(bx, by, r0, 0, Math.PI * 2);
  else ctx.rect(bx - r0, by - r0, r0 * 2, r0 * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  const mesh = new THREE.Mesh(QUAD, decalMaterial(tex, S.platformOpacity));
  mesh.scale.set(extent, 1, extent);
  mesh.userData.center = new THREE.Vector2(sx / 2, sz / 2);  // dokunun merkezi platforma göre
  return mesh;
}

export function disposePlatformShadow(mesh) {
  if (mesh.parent) mesh.parent.remove(mesh);
  mesh.material.map.dispose();
  mesh.material.dispose();
}
