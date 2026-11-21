// =============================================================
//  robot.js — Kıvılcım: Three.js primitiflerinden kurulan oyuncak robot
//
//  Sahne ağacı (her grup bir dönüşüm katmanı):
//    root   → konum (ayak tabanı)
//    tilt   → düşerken devrilme
//    yaw    → zıplama yönüne dönme
//    body   → çömelme/uzama ölçeği (pivot ayak hizasında)  ← parçalar burada
//    ring   → güç halkası (yaw altında, ölçekten etkilenmez)
//  Robotun "önü" yerel +Z yönüdür.
//
//  Çizim maliyeti: her grubun içindeki sabit parçalar, malzemesi aynıysa
//  tek geometride birleştirilir (mergeStatic). Hareketli parçalar (kollar,
//  baş, anten) kendi gruplarında kalır. Malzemeler Lambert: ışık hesabı
//  fiziksel (Standard) malzemeden çok daha ucuz.
// =============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CONFIG } from './config.js';

const R = CONFIG.robot;
const C = CONFIG.colors;

// Sönümlü yay: x değerini hedefe salınımlı biçimde çeker.
// freq = salınım frekansı (Hz), zeta = sönüm oranı (0 = sonsuz salınım, 1 = salınımsız)
export class Spring {
  constructor(value, freq, zeta) {
    this.x = value;
    this.v = 0;
    this.target = value;
    const w = 2 * Math.PI * freq;
    this.k = w * w;
    this.c = 2 * zeta * w;
  }

  update(dt) {
    // Büyük dt'de kararlı kalsın diye küçük adımlara böl
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = this.k * (this.target - this.x) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }

  set(value) {
    this.x = value;
    this.v = 0;
    this.target = value;
  }
}

// Bir grubun doğrudan çocuğu olan meshleri malzemeye göre birleştirir:
// aynı malzemeli parçalar tek geometri (tek çizim çağrısı) olur. Parçaların
// konum/dönüş/ölçeği geometriye işlenir; alt gruplara (hareketli parçalar) dokunulmaz.
function mergeStatic(group) {
  const byMat = new Map();
  for (const o of group.children) {
    if (!o.isMesh) continue;
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o);
  }
  for (const [mat, meshes] of byMat) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      m.updateMatrix();
      const g = m.geometry.clone().applyMatrix4(m.matrix);  // paylaşılan geometri bozulmasın: kopya
      return g.index ? g.toNonIndexed() : g;
    });
    const merged = new THREE.Mesh(mergeGeometries(geos), mat);
    merged.castShadow = meshes.some((m) => m.castShadow);
    for (const g of geos) g.dispose();
    for (const m of meshes) group.remove(m);
    group.add(merged);
  }
}

// Fiziksel malzemenin (metalness) koyulaştırdığı rengi Lambert'te taklit et
function lambert(color, metalness, extra = {}) {
  const c = new THREE.Color(color).multiplyScalar(1 - metalness);
  return new THREE.MeshLambertMaterial({ color: c, ...extra });
}

// Yardımcı: mesh oluşturup ebeveyne ekler. "x = 0" varsayılan parametredir.
function part(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

const RING_VERTEX = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RING_FRAGMENT = /* glsl */ `
  uniform float uProgress;
  uniform float uOpacity;
  uniform float uPulse;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uTrack;
  varying vec2 vPos;
  void main() {
    // Robotun önünden başlayıp çevresinde dolan açı (0..1)
    float a = atan(vPos.x, -vPos.y);
    if (a < 0.0) a += 6.2831853;
    float f = a / 6.2831853;
    float on = step(f, uProgress);
    vec3 fill = mix(uColorA, uColorB, uProgress) * (1.0 + uPulse);
    vec3 col = mix(uTrack, fill, on);
    float alpha = mix(0.35, 1.0, on) * uOpacity;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

export class Robot {
  constructor(scene) {
    this.root = new THREE.Group();
    this.tilt = new THREE.Group();
    this.yawGroup = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.tilt);
    this.tilt.add(this.yawGroup);
    this.yawGroup.add(this.body);
    scene.add(this.root);

    this.mats = {
      body: lambert(C.graphite, 0.1),
      glove: lambert(C.glove, 0.05),
      copper: lambert(C.copper, 0.3),
      // Parlayan parçalar: kendi ışığını yayar (emissive), aydınlatmadan bağımsız
      visor: lambert(C.visor, 0.2, { emissive: C.visorGlow, emissiveIntensity: 0.9 }),
      eye: lambert(C.eye, 0, { emissive: C.eye, emissiveIntensity: 1.6 }),
    };

    this.build();
    for (const g of [this.body, this.head, this.antennaGroup, ...this.armPivots]) mergeStatic(g);
    this.ring = this.createRing();
    this.yawGroup.add(this.ring);

    this.yaw = 0;
    this.targetYaw = 0;
    this.squash = new Spring(1, R.springFreq, R.springDamping);
    this.arms = new Spring(0, 3.5, 0.45);
    this.spread = new Spring(0, 3.5, 0.45);
    this.antenna = new Spring(0, 5, 0.18);
    this.ringOpacity = 0;
  }

  build() {
    const m = this.mats;
    const b = this.body;

    // --- Bacaklar ve ayaklar ---
    const legGeo = new THREE.CylinderGeometry(0.048, 0.055, 0.22, 10);
    const footGeo = new RoundedBoxGeometry(0.12, 0.07, 0.17, 2, 0.03);
    for (const s of [-1, 1]) {
      part(b, legGeo, m.body, s * 0.09, 0.17, 0);
      part(b, footGeo, m.copper, s * 0.09, 0.035, 0.025);
    }

    // --- Gövde: yuvarlatılmış kutu + bakır kemer + göğüs amblemi ---
    part(b, new RoundedBoxGeometry(0.36, 0.34, 0.27, 3, 0.08), m.body, 0, 0.45, 0);
    part(b, new RoundedBoxGeometry(0.375, 0.035, 0.285, 2, 0.015), m.copper, 0, 0.33, 0);
    const emblem = part(b, new THREE.CylinderGeometry(0.045, 0.045, 0.02, 18), m.copper, 0, 0.49, 0.135);
    emblem.rotation.x = Math.PI / 2;
    const core = part(b, new THREE.CylinderGeometry(0.022, 0.022, 0.024, 12), m.visor, 0, 0.49, 0.137);
    core.rotation.x = Math.PI / 2;

    // --- Boyun ---
    part(b, new THREE.CylinderGeometry(0.07, 0.08, 0.05, 12), m.copper, 0, 0.64, 0);

    // --- Baş: silindir taban + yarım küre kubbe ---
    const head = new THREE.Group();
    head.position.y = 0.655;
    b.add(head);
    this.head = head;
    part(head, new THREE.CylinderGeometry(0.2, 0.19, 0.11, 24), m.body, 0, 0.055, 0);
    part(head, new THREE.SphereGeometry(0.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.body, 0, 0.11, 0);

    // Vizör: başın önünü ~220° saran yatay bant (kısmi, açık uçlu silindir)
    part(head, new THREE.CylinderGeometry(0.207, 0.203, 0.075, 28, 1, true, -1.9, 3.8), m.visor, 0, 0.06, 0);

    // Vizör üzerindeki iki göz ışığı
    const eyeGeo = new RoundedBoxGeometry(0.055, 0.032, 0.02, 1, 0.008);
    for (const s of [-1, 1]) {
      const eye = part(head, eyeGeo, m.eye, s * 0.062, 0.062, 0.2);
      eye.rotation.y = s * 0.3;
      eye.castShadow = false;
    }

    // Anten: kısa çubuk + parlayan uç (sallanabilsin diye ayrı grup)
    const ant = new THREE.Group();
    ant.position.y = 0.3;
    head.add(ant);
    this.antennaGroup = ant;
    part(ant, new THREE.CylinderGeometry(0.011, 0.014, 0.13, 6), m.copper, 0, 0.065, 0);
    part(ant, new THREE.SphereGeometry(0.032, 12, 10), m.visor, 0, 0.14, 0);

    // --- Kollar: omuzdan dönen pivot grupları ---
    this.armPivots = [];
    const shoulderGeo = new THREE.SphereGeometry(0.055, 12, 10);
    const armGeo = new THREE.CylinderGeometry(0.034, 0.04, 0.17, 8);
    const cuffGeo = new THREE.TorusGeometry(0.043, 0.013, 6, 14);
    const gloveGeo = new THREE.SphereGeometry(0.055, 12, 10);
    const thumbGeo = new THREE.SphereGeometry(0.022, 8, 6);
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.205, 0.56, 0);
      pivot.userData.side = s;
      b.add(pivot);
      part(pivot, shoulderGeo, m.copper);
      part(pivot, armGeo, m.body, 0, -0.1, 0);
      const cuff = part(pivot, cuffGeo, m.copper, 0, -0.185, 0);
      cuff.rotation.x = Math.PI / 2;
      const glove = part(pivot, gloveGeo, m.glove, 0, -0.23, 0.005);  // eldiven: basık küre
      glove.scale.set(1, 0.9, 1.15);
      part(pivot, thumbGeo, m.glove, -s * 0.045, -0.215, 0.035);     // başparmak (içe dönük)
      this.armPivots.push(pivot);
    }

    // --- Pelerin tokaları (omuzların arkası) ---
    const claspGeo = new THREE.SphereGeometry(0.03, 10, 8);
    for (const s of [-1, 1]) part(b, claspGeo, m.copper, s * 0.14, 0.6, -0.14);
  }

  createRing() {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uProgress: { value: 0 },
        uOpacity: { value: 0 },
        uPulse: { value: 0 },
        uColorA: { value: new THREE.Color(C.ringStart) },
        uColorB: { value: new THREE.Color(C.ringEnd) },
        uTrack: { value: new THREE.Color(C.ringTrack) },
      },
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.48, 56, 1), mat);
    ring.rotation.x = -Math.PI / 2;   // yere yatır
    ring.position.y = 0.02;
    ring.renderOrder = 2;
    ring.visible = false;
    return ring;
  }

  // Robotu (dx, dz) yönüne döndür; instant = true ise anında
  faceTowards(dx, dz, instant) {
    if (dx * dx + dz * dz < 1e-8) return;
    this.targetYaw = Math.atan2(dx, dz);
    if (instant) this.yaw = this.targetYaw;
  }

  setTilt(axis, angle) {
    this.tilt.quaternion.setFromAxisAngle(axis, angle);
  }

  takeoff() {
    this.squash.v += R.stretchImpulse;   // sıkışmış yay + itki → uzama
    this.antenna.v -= 6;
  }

  land(strength) {
    this.squash.v -= R.landImpulse * strength;  // inişte basılıp sarsılma
    this.antenna.v += 7 * strength;
  }

  reset() {
    this.tilt.quaternion.identity();
    this.squash.set(1);
    this.arms.set(0);
    this.spread.set(0);
    this.antenna.set(0);
    this.body.scale.set(1, 1, 1);
    this.body.position.set(0, 0, 0);
    this.ringOpacity = 0;
    this.ring.visible = false;
  }

  // st: { charging, charge01, inAir, grounded }
  update(dt, time, st) {
    // 1) Yön: hedef açıya yumuşakça dön (en kısa yoldan)
    let d = this.targetYaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-R.turnSpeed * dt));
    this.yawGroup.rotation.y = this.yaw;

    // 2) Çömelme / uzama: hacim korunsun diye y küçülünce x-z büyür
    this.squash.target = st.charging ? 1 - R.squash * st.charge01 : 1;
    let sy = this.squash.update(dt);
    if (st.grounded && !st.charging) sy += Math.sin(time * 2.4) * 0.012; // nefes alma
    sy = THREE.MathUtils.clamp(sy, 0.45, 1.6);
    const sxz = 1 / Math.sqrt(sy);
    this.body.scale.set(sxz, sy, sxz);
    // Tam şarjda hafif titreme
    this.body.position.x = st.charging && st.charge01 >= 1 ? Math.sin(time * 70) * 0.008 : 0;

    // 3) Kollar: şarjda geriye, havada öne-yukarı açılır
    this.arms.target = st.inAir ? -2.0 : (st.charging ? 0.7 * st.charge01 : 0);
    this.spread.target = st.inAir ? 0.5 : 0;
    const armA = this.arms.update(dt);
    const spr = this.spread.update(dt);
    for (const p of this.armPivots) {
      const s = p.userData.side;
      p.rotation.set(armA, 0, s * (0.12 + spr));
    }

    // 4) Anten yaylanması
    this.antennaGroup.rotation.x = this.antenna.update(dt);

    // 5) Vizör parıltısı: hafif nabız, şarjla güçlenir
    this.mats.visor.emissiveIntensity = 0.8 + Math.sin(time * 2.2) * 0.15 + st.charge01 * 0.9;

    // 6) Güç halkası
    const u = this.ring.material.uniforms;
    const target = st.charging ? 1 : 0;
    this.ringOpacity += (target - this.ringOpacity) * (1 - Math.exp(-14 * dt));
    this.ring.visible = this.ringOpacity > 0.01;
    u.uOpacity.value = this.ringOpacity;
    if (st.charging) u.uProgress.value = st.charge01;
    u.uPulse.value = st.charging && st.charge01 >= 1 ? 0.25 + 0.25 * Math.sin(time * 14) : 0;
  }
}
