// =============================================================
//  cape.js — Zeytin yeşili pelerin: Verlet parçacık kumaşı
//
//  Yöntem (C'deki düz bir float dizisi gibi düşün):
//   • Pelerin cols × rows parçacıktan oluşan bir ızgara.
//   • Her parçacığın şimdiki ve bir önceki konumu saklanır; hız ayrıca
//     tutulmaz, (şimdiki − önceki) farkı hızdır → Verlet entegrasyonu.
//   • Komşu parçacıklar arasında mesafe kısıtları vardır; her adımda
//     birkaç tur düzeltilerek kumaş yay gibi davranır, uzayıp kopmaz.
//   • Üst sıra robotun omuzlarına kilitlidir. Robot hareket edince geri
//     kalanı atalet, yerçekimi ve hava direnciyle peşinden sürüklenir:
//     şarjda sarkar, havada hıza ters savrulur, inişte salınıp durulur.
// =============================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';

const K = CONFIG.cape;
const C = CONFIG.colors;

// Robotun gövde grubunun yerel uzayında çarpışma şekilleri
const BODY = { hx: 0.2, hz: 0.145, yMin: 0.0, yMax: 0.63 }; // gövde + bacaklar (dikey kutu)
const HEAD = { x: 0, y: 0.77, z: 0, r: 0.225 };               // baş (küre)

const _v = new THREE.Vector3();

export class Cape {
  constructor(scene, robot) {
    this.robot = robot;
    this.cols = K.cols;
    this.rows = K.rows;
    const n = this.cols * this.rows;

    this.pos = new Float32Array(n * 3);        // dünya konumları
    this.prev = new Float32Array(n * 3);       // bir önceki adımın konumları
    this.rest = new Float32Array(n * 3);       // gövdeye göre dinlenme konumları
    this.anchorPrev = new Float32Array(this.cols * 3);
    this.anchorCur = new Float32Array(this.cols * 3);
    this.renderPrev = new Float32Array(n * 3);  // son adımdan önceki konumlar (ara değer için)
    this.inv = new THREE.Matrix4();
    this.hPrev = K.substep;

    this.buildRestPose();
    this.buildConstraints();
    this.buildMesh(scene);
    this.reset();
  }

  // Dinlenme hâli: omuzlardan aşağı, eteğe doğru hafif genişleyen bir yüzey
  buildRestPose() {
    const { cols, rows } = this;   // nesneden alan çekme (destructuring)
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1);
      const w = THREE.MathUtils.lerp(K.topWidth, K.bottomWidth, t);
      for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 3;
        this.rest[k] = (i / (cols - 1) - 0.5) * w;
        this.rest[k + 1] = K.topY - j * K.segment;
        this.rest[k + 2] = K.topZ - t * 0.05;
      }
    }
  }

  // Kısıtlar düz bir dizide dörtlü tutulur: [a, b, dinlenmeUzunluğu, sertlik]
  buildConstraints() {
    const { cols, rows, rest } = this;
    const list = [];
    const add = (a, b, stiff) => {
      const dx = rest[b * 3] - rest[a * 3];
      const dy = rest[b * 3 + 1] - rest[a * 3 + 1];
      const dz = rest[b * 3 + 2] - rest[a * 3 + 2];
      list.push(a, b, Math.sqrt(dx * dx + dy * dy + dz * dz), stiff);
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = j * cols + i;
        if (i + 1 < cols) add(a, a + 1, K.stiffness);                 // yapısal (yatay)
        if (j + 1 < rows) add(a, a + cols, K.stiffness);              // yapısal (dikey)
        if (i + 1 < cols && j + 1 < rows) {                           // kesme (çapraz)
          add(a, a + cols + 1, K.shearStiffness);
          add(a + 1, a + cols, K.shearStiffness);
        }
        if (i + 2 < cols) add(a, a + 2, K.bendStiffness);             // bükülme (bir atlamalı)
        if (j + 2 < rows) add(a, a + 2 * cols, K.bendStiffness);
      }
    }
    this.cons = new Float32Array(list);
  }

  buildMesh(scene) {
    const { cols, rows } = this;
    const n = cols * rows;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));

    const uv = new Float32Array(n * 2);
    const color = new Float32Array(n * 3);
    const base = new THREE.Color(C.cape);
    const c = new THREE.Color();
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1);
      c.copy(base).multiplyScalar(1.08 - t * 0.25);  // yukarısı açık, etek koyu
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        uv[k * 2] = i / (cols - 1);
        uv[k * 2 + 1] = 1 - t;
        color[k * 3] = c.r;
        color[k * 3 + 1] = c.g;
        color[k * 3 + 2] = c.b;
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(color, 3));

    const idx = [];
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = j * cols + i;
        const b = a + 1;
        const d = a + cols;
        const e = d + 1;
        idx.push(a, d, b, b, d, e);
      }
    }
    geo.setIndex(idx);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;  // köşeler her karede değişiyor
    scene.add(this.mesh);
  }

  // Pelerini robotun şu anki duruşuna göre dinlenme hâline getir
  reset() {
    const body = this.robot.body;
    body.updateWorldMatrix(true, false);
    const m = body.matrixWorld;
    const n = this.cols * this.rows;
    for (let k = 0; k < n; k++) {
      _v.fromArray(this.rest, k * 3).applyMatrix4(m);
      _v.toArray(this.pos, k * 3);
      _v.toArray(this.prev, k * 3);
    }
    this.anchorCur.set(this.pos.subarray(0, this.cols * 3));
    this.anchorPrev.set(this.anchorCur);
    this.hPrev = K.substep;
    this.renderPrev.set(this.pos);
    this.writeGeometry(1);
  }

  // floorY: pelerinin altına inemeyeceği yükseklik; wind: rüzgâr yönü (Vector3)
  update(dt, time, floorY, wind) {
    if (dt <= 0) return;
    this.renderPrev.set(this.pos);
    const m = this.robot.body.matrixWorld;   // çağırmadan önce güncellenmiş olmalı
    this.inv.copy(m).invert();

    // Omuz noktaları: önceki kare → bu kare (alt adımlarda ara değerlenir)
    this.anchorPrev.set(this.anchorCur);
    for (let i = 0; i < this.cols; i++) {
      _v.fromArray(this.rest, i * 3).applyMatrix4(m).toArray(this.anchorCur, i * 3);
    }

    // Robotun hızı → havada dalgalanma miktarı
    const mid = Math.floor(this.cols / 2) * 3;
    const speed = Math.hypot(
      this.anchorCur[mid] - this.anchorPrev[mid],
      this.anchorCur[mid + 1] - this.anchorPrev[mid + 1],
      this.anchorCur[mid + 2] - this.anchorPrev[mid + 2]
    ) / dt;
    const flutter = K.flutter * THREE.MathUtils.clamp((speed - 1.5) / 6, 0, 1.2);

    const steps = Math.min(8, Math.max(1, Math.ceil(dt / K.substep)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.step(h, (s + 1) / steps, time + s * h, flutter, floorY, wind, m);
    }
    // Geometri burada değil, çizimden hemen önce writeGeometry(alpha) ile yazılır
  }

  step(h, alpha, time, flutter, floorY, wind, m) {
    const { cols, rows, pos, prev } = this;
    const ratio = h / this.hPrev;     // adım süresi değişirse hızı düzelt
    this.hPrev = h;
    const keep = 1 - K.damping;
    const h2 = h * h;
    const nrm = this.mesh.geometry.attributes.normal.array;  // geçen karenin normalleri

    // 1) Verlet: yeni = şimdiki + (şimdiki − önceki) + ivme·h²
    for (let j = 1; j < rows; j++) {
      const t = j / (rows - 1);   // 0 = omuz, 1 = etek
      const gust = K.breeze * t * (0.6 + 0.4 * Math.sin(time * 1.3 + j * 0.5));
      for (let i = 0; i < cols; i++) {
        const k = (j * cols + i) * 3;
        let vx = (pos[k] - prev[k]) * ratio * keep;
        let vy = (pos[k + 1] - prev[k + 1]) * ratio * keep;
        let vz = (pos[k + 2] - prev[k + 2]) * ratio * keep;

        // Karesel hava direnci: hızlıyken güçlü (savrulma), yavaşken zayıf (salınım)
        const sp = Math.sqrt(vx * vx + vy * vy + vz * vz) / h;
        const drag = Math.min(K.airDrag * sp * h, 0.5);
        vx *= 1 - drag;
        vy *= 1 - drag;
        vz *= 1 - drag;

        let ax = wind.x * gust;
        let ay = -K.gravity;
        let az = wind.z * gust;
        if (flutter > 0) {
          // Kumaş normali boyunca ilerleyen dalga: eteğe doğru güçlenir
          const f = flutter * t * Math.sin(time * K.flutterFreq - j * 0.9 + i * 0.6);
          ax += nrm[k] * f;
          ay += nrm[k + 1] * f;
          az += nrm[k + 2] * f;
        }

        prev[k] = pos[k];
        prev[k + 1] = pos[k + 1];
        prev[k + 2] = pos[k + 2];
        pos[k] += vx + ax * h2;
        pos[k + 1] += vy + ay * h2;
        pos[k + 2] += vz + az * h2;
      }
    }

    // 2) Üst sıra omuzlara kilitli
    for (let i = 0; i < cols * 3; i++) {
      prev[i] = pos[i];
      pos[i] = this.anchorPrev[i] + (this.anchorCur[i] - this.anchorPrev[i]) * alpha;
    }

    // 3) Mesafe kısıtları
    const cons = this.cons;
    const pinned = cols;   // ilk "cols" parçacık sabit
    for (let it = 0; it < K.iterations; it++) {
      for (let c = 0; c < cons.length; c += 4) {
        const ia = cons[c];
        const ib = cons[c + 1];
        const a = ia * 3;
        const b = ib * 3;
        const dx = pos[b] - pos[a];
        const dy = pos[b + 1] - pos[a + 1];
        const dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = ((d - cons[c + 2]) / d) * cons[c + 3];
        const pinA = ia < pinned;
        const pinB = ib < pinned;
        if (pinA && pinB) continue;
        const wa = pinA ? 0 : (pinB ? 1 : 0.5);   // sabit uç hareket etmez
        const wb = pinB ? 0 : (pinA ? 1 : 0.5);
        pos[a] += dx * diff * wa;
        pos[a + 1] += dy * diff * wa;
        pos[a + 2] += dz * diff * wa;
        pos[b] -= dx * diff * wb;
        pos[b + 1] -= dy * diff * wb;
        pos[b + 2] -= dz * diff * wb;
      }
    }

    // 4) Çarpışmalar
    this.collide(floorY, m);
  }

  collide(floorY, m) {
    const { cols, rows, pos, prev } = this;
    const n = cols * rows;
    for (let p = cols; p < n; p++) {
      const k = p * 3;
      // Parçacığı gövdenin yerel uzayına taşı (çömelme ölçeği de hesaba girer)
      _v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(this.inv);
      let moved = false;

      // Gövde: dikey kutu — yalnızca yatayda, en kısa yönden dışarı it
      if (_v.y > BODY.yMin && _v.y < BODY.yMax && Math.abs(_v.x) < BODY.hx && Math.abs(_v.z) < BODY.hz) {
        const px = BODY.hx - Math.abs(_v.x);
        const pz = BODY.hz - Math.abs(_v.z);
        if (pz <= px) _v.z = _v.z > 0 ? BODY.hz : -BODY.hz;
        else _v.x = _v.x > 0 ? BODY.hx : -BODY.hx;
        moved = true;
      }

      // Baş: küre
      const dx = _v.x - HEAD.x;
      const dy = _v.y - HEAD.y;
      const dz = _v.z - HEAD.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < HEAD.r * HEAD.r) {
        const s = HEAD.r / (Math.sqrt(d2) || 1e-6);
        _v.set(HEAD.x + dx * s, HEAD.y + dy * s, HEAD.z + dz * s);
        moved = true;
      }

      if (moved) {
        _v.applyMatrix4(m);
        pos[k] = _v.x;
        pos[k + 1] = _v.y;
        pos[k + 2] = _v.z;
      }

      // Zemin: altına inme, yerde sürtünerek yavaşla
      if (pos[k + 1] < floorY + 0.01) {
        pos[k + 1] = floorY + 0.01;
        prev[k] = pos[k] - (pos[k] - prev[k]) * 0.5;
        prev[k + 2] = pos[k + 2] - (pos[k + 2] - prev[k + 2]) * 0.5;
      }
    }
  }

  // alpha: son iki fizik adımı arasındaki konum (0 = önceki adım, 1 = son adım)
  writeGeometry(alpha) {
    const geo = this.mesh.geometry;
    const out = geo.attributes.position.array;
    const a = this.renderPrev;
    const b = this.pos;
    for (let i = 0; i < b.length; i++) out[i] = a[i] + (b[i] - a[i]) * alpha;
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  }
}
