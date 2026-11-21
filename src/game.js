// =============================================================
//  game.js — Oyun akışı (durum makinesi), zıplama yayı, iniş kontrolü,
//  puanlama ve kamera takibi.
//
//  Durumlar:
//    READY → (bas) → CHARGING → (bırak) → AIR → iniş → READY …
//    AIR → kenara iniş → TIPPING → FALLING → FALLEN → OVER
//    AIR → boşluğa düşüş → FALLEN → OVER → (dokun) → yeni oyun
// =============================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Robot } from './robot.js';
import { Cape } from './cape.js';
import { Platforms } from './platforms.js';
import { RobotBlob } from './shadows.js';

const J = CONFIG.jump;
const LND = CONFIG.landing;
const SC = CONFIG.score;
const CAM = CONFIG.camera;
const RB = CONFIG.robot;
const UI = CONFIG.ui;

// Object.freeze: sabit "enum" gibi kullanılan, değiştirilemez nesne
const State = Object.freeze({
  READY: 'hazir',
  CHARGING: 'sarj',
  AIR: 'havada',
  TIPPING: 'devriliyor',
  FALLING: 'dusuyor',
  FALLEN: 'yerde',
  OVER: 'bitti',
});

const LYING_ANGLE = 1.45;   // yere düşünce yatma açısı (radyan)
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

// Çizimde ara değerlenen durum: robotun dönüşümleri ve kamera odağı
function makeSnapshot() {
  return {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    yaw: 0,
    scale: new THREE.Vector3(1, 1, 1),
    focus: new THREE.Vector3(),
  };
}

export class Game {
  constructor({ scene, camera, renderer, world, hud }) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.hud = hud;

    this.robot = new Robot(scene);
    this.cape = new Cape(scene, this.robot);
    this.platforms = new Platforms(scene, renderer, world.decals);
    this.blob = new RobotBlob(world.decals);
    this.effect = this.createCenterEffect();

    this.focus = new THREE.Vector3();
    this.focusTarget = new THREE.Vector3();
    this.camOffset = new THREE.Vector3(CAM.offset.x, CAM.offset.y, CAM.offset.z);

    this.time = 0;
    this.held = false;          // şu an basılı mı (havadayken basılırsa inişte şarj başlar)
    this.ignoreRelease = false; // yeniden başlatan dokunuşun bırakılması zıplatmasın
    this.tip = null;            // devrilme bilgisi
    this.flight = null;         // uçuş bilgisi
    this.clock = 0;             // oyun saati (ms, performance.now() ölçeğinde; main.js her adımda verir)
    this.chargeStart = 0;       // şarjın başladığı an (ms)
    this.prevSnap = makeSnapshot();  // son adımdan önceki durum
    this.curSnap = makeSnapshot();   // son adımdaki durum
    this.teleport = false;           // yeniden başlatmada ara değer yapma

    this.checkConfig();
    this.restart();
    this.focus.copy(this.focusTarget);
    this.updateCamera(0);
    this.saveSnapshot(this.prevSnap);
  }

  // Ayar hatası uyarısı: en geniş aralık maksimum zıplamayla aşılabilmeli
  checkConfig() {
    const D = CONFIG.difficulty;
    const worst = 2 * D.sizeStart * (1 + D.sizeJitter) + Math.max(D.gapStart[1], D.gapEnd[1]);
    if (worst > J.maxDistance) {
      console.warn(`config: jump.maxDistance (${J.maxDistance}) en uzak aralıktan (${worst.toFixed(2)}) kısa.`);
    }
  }

  restart() {
    const pair = this.platforms.reset();
    this.cur = pair[0];   // üzerinde durulan platform
    this.next = pair[1];  // hedef platform

    this.score = 0;
    this.combo = 0;       // art arda merkez sayısı
    this.charge = 0;
    this.charge01 = 0;
    this.flight = null;
    this.tip = null;

    this.robot.reset();
    this.robot.root.position.set(this.cur.x, this.cur.surfaceY(), this.cur.z);
    this.robot.faceTowards(this.next.x - this.cur.x, this.next.z - this.cur.z, true);
    this.robot.yawGroup.rotation.y = this.robot.yaw;
    this.robot.root.updateMatrixWorld(true);
    this.cape.reset();

    this.hud.setScore(0);
    this.hud.hideGameOver();
    this.setState(State.READY);
    this.updateFocusTarget();
    this.teleport = true;
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  // ---------------- Girdi ----------------
  // t: olayın gerçekleştiği an (ms). Şarj süresi kare/adım sayısından değil, basma ve
  // bırakma anları arasındaki farktan hesaplanır: aynı basış her FPS'te aynı zıplamadır.
  press(t = this.clock) {
    this.held = true;
    if (this.state === State.OVER) {
      if (this.stateTime >= UI.restartLock) {
        this.restart();
        this.ignoreRelease = true;
      }
      return;
    }
    if (this.state === State.READY) this.beginCharge(t);
  }

  release(t = this.clock) {
    this.held = false;
    if (this.ignoreRelease) {
      this.ignoreRelease = false;
      return;
    }
    if (this.state === State.CHARGING) {
      this.charge = Math.max(0, (t - this.chargeStart) / 1000);
      this.jump();
    }
  }

  cancel() {
    this.held = false;
    this.ignoreRelease = false;
    if (this.state === State.CHARGING) {
      this.charge = 0;
      this.charge01 = 0;
      this.setState(State.READY);
    }
  }

  beginCharge(t = this.clock) {
    this.chargeStart = t;
    this.charge = 0;
    this.charge01 = 0;
    this.setState(State.CHARGING);
  }

  // ---------------- Zıplama ----------------
  jump() {
    const dist = Math.min(this.charge * J.chargeRate, J.maxDistance);
    const from = this.robot.root.position.clone();

    // Yön: robottan hedef platformun merkezine
    let dx = this.next.x - from.x;
    let dz = this.next.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;

    // Parabol: dikey hız sabit. Uçuş süresi hedef platformun yüksekliğine göre
    // hesaplanır; böylece basma süresi, aşağı ya da yukarı zıplarken de
    // hedefin üst yüzeyinde aynı yatay mesafeye karşılık gelir.
    const vy = J.launchSpeed;
    const g = J.gravity;
    const disc = vy * vy - 2 * g * (this.next.top - from.y);
    const flightTime = disc > 0 ? (vy + Math.sqrt(disc)) / g : (2 * vy) / g;
    const vh = dist / flightTime;
    this.flight = { from, dx, dz, vh, vy, g, t: 0, blocked: false, bx: 0, bz: 0 };
    this.flight.result = this.predictLanding(this.flight);

    this.robot.faceTowards(dx, dz, false);
    this.robot.takeoff();
    this.charge = 0;
    this.charge01 = 0;
    this.setState(State.AIR);
    this.hud.hideHint();
  }

  // İniş noktasını kalkışta hesapla. Yüksek platformun üst düzlemi inişte
  // daha önce kesilir; o yüzden adaylar yüksekten alçağa denenir.
  predictLanding(f) {
    const candidates = [this.cur, this.next].sort((a, b) => b.top - a.top);
    for (const p of candidates) {
      // y(t) = y0 + vy·t − ½·g·t² = p.top  →  inişteki (büyük) kök
      const disc = f.vy * f.vy - 2 * f.g * (p.top - f.from.y);
      if (disc < 0) continue;   // o yüksekliğe hiç çıkamıyor
      const t = (f.vy + Math.sqrt(disc)) / f.g;
      const x = f.from.x + f.dx * f.vh * t;
      const z = f.from.z + f.dz * f.vh * t;
      if (p.contains(x, z, LND.tolerance)) return { type: 'land', platform: p, t, x, z };
      if (p.contains(x, z, LND.edgeZone)) return { type: 'edge', platform: p, t, x, z };
    }
    return { type: 'miss' };
  }

  updateAir(dt) {
    const f = this.flight;
    const r = f.result;
    const pos = this.robot.root.position;
    f.t += dt;

    if ((r.type === 'land' || r.type === 'edge') && f.t >= r.t) {
      pos.set(r.x, r.platform.surfaceY(), r.z);
      if (r.type === 'land') this.onLand(r.platform, r.x, r.z);
      else this.startTipping(r.platform, r.x, r.z);
      return;
    }

    let x = f.from.x + f.dx * f.vh * f.t;
    let z = f.from.z + f.dz * f.vh * f.t;
    const y = f.from.y + f.vy * f.t - 0.5 * f.g * f.t * f.t;

    if (r.type === 'miss') {
      // İnerken bir platformun yan yüzüne çarparsa yatay hareket durur
      const descending = f.vy - f.g * f.t < 0;
      if (!f.blocked && descending) {
        for (const p of [this.cur, this.next]) {
          if (y < p.top && p.contains(x, z, 0.12)) {
            f.blocked = true;
            f.bx = pos.x;
            f.bz = pos.z;
            break;
          }
        }
      }
      if (f.blocked) {
        x = f.bx;
        z = f.bz;
      }
      if (y <= 0) {
        pos.set(x, 0, z);
        const s = f.blocked ? -1 : 1;   // çarptıysa geriye, yoksa ileri devrilir
        this.startFallen(s * f.dx, s * f.dz, 4, 0);
        return;
      }
    }
    pos.set(x, y, z);
  }

  onLand(p, x, z) {
    this.robot.land(1);

    if (p === this.next) {
      const centerR = Math.max(LND.centerMin, p.half * LND.centerRatio);
      let gained;
      if (p.centerDistance(x, z) <= centerR) {
        // Merkez: 2, 4, 8, 16 … (tavan centerMax)
        this.combo += 1;
        gained = Math.min(SC.centerBase * Math.pow(SC.centerFactor, this.combo - 1), SC.centerMax);
        this.playCenterEffect(p);
      } else {
        this.combo = 0;
        gained = SC.normal;
      }
      this.score += gained;
      this.hud.setScore(this.score);
      this.showPopup('+' + gained, this.combo > 0);

      this.cur = p;
      this.next = this.platforms.spawnNext(p, this.score);
      this.updateFocusTarget();
    }
    // Aynı platforma geri indiyse puan yok, oyun sürer.

    this.robot.faceTowards(this.next.x - x, this.next.z - z, false);
    this.setState(State.READY);
    if (this.held) this.beginCharge();   // havadayken basılmışsa şarj hemen başlar
  }

  // ---------------- Düşme ----------------
  startTipping(p, x, z) {
    // Dışa doğru yön: daire için merkezden; kare için en çok taşan eksen
    let ox = x - p.x;
    let oz = z - p.z;
    if (p.shape === 'rect') {
      if (Math.abs(ox) > Math.abs(oz)) { ox = Math.sign(ox); oz = 0; }
      else { ox = 0; oz = Math.sign(oz); }
    }
    const l = Math.hypot(ox, oz) || 1;
    ox /= l;
    oz /= l;
    // Dönme ekseni = yukarı × dışarı → robotun tepesi dışarı doğru devrilir
    this.tip = { ox, oz, axis: new THREE.Vector3(oz, 0, -ox), angle: 0, vel: 1.5, settled: false };
    this.robot.land(0.6);
    this.setState(State.TIPPING);
  }

  updateTipping(dt) {
    const tp = this.tip;
    const pos = this.robot.root.position;
    tp.vel += RB.tipAccel * dt;
    tp.angle += tp.vel * dt;
    pos.x += tp.ox * tp.vel * dt * 0.12;
    pos.z += tp.oz * tp.vel * dt * 0.12;
    this.robot.setTilt(tp.axis, tp.angle);
    if (tp.angle > 1.0) {
      this.fallVel = 0;
      this.setState(State.FALLING);
    }
  }

  updateFalling(dt) {
    const tp = this.tip;
    const pos = this.robot.root.position;
    this.fallVel -= J.gravity * dt;
    pos.y += this.fallVel * dt;
    pos.x += tp.ox * 0.8 * dt;
    pos.z += tp.oz * 0.8 * dt;
    tp.angle = Math.min(tp.angle + tp.vel * dt, LYING_ANGLE);
    this.robot.setTilt(tp.axis, tp.angle);
    if (pos.y <= 0) {
      pos.y = 0;
      this.startFallen(tp.ox, tp.oz, tp.vel, tp.angle);
    }
  }

  startFallen(dirX, dirZ, vel, angle) {
    this.tip = { ox: dirX, oz: dirZ, axis: new THREE.Vector3(dirZ, 0, -dirX), angle, vel, settled: false };
    this.robot.land(1);
    this.combo = 0;
    this.setState(State.FALLEN);
  }

  // Yere yatarken küçük bir sekme
  updateFallen(dt) {
    const tp = this.tip;
    if (!tp.settled) {
      tp.vel += 22 * dt;
      tp.angle += tp.vel * dt;
      if (tp.angle >= LYING_ANGLE) {
        tp.angle = LYING_ANGLE;
        if (tp.vel < 1.5) {
          tp.settled = true;
          tp.vel = 0;
        } else {
          tp.vel = -tp.vel * 0.3;
        }
      }
    }
    this.robot.setTilt(tp.axis, tp.angle);
    this.robot.root.position.y = Math.sin(tp.angle) * 0.14;  // gövde toprağa gömülmesin
    if (this.stateTime > UI.gameOverDelay) this.gameOver();
  }

  gameOver() {
    this.setState(State.OVER);
    const isNew = this.hud.commitScore(this.score);
    this.hud.showGameOver(this.score, isNew);
  }

  // ---------------- Efektler ----------------
  createCenterEffect() {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, t: 1, base: 1 };
  }

  playCenterEffect(p) {
    const e = this.effect;
    e.mesh.position.set(p.x, p.top + 0.02, p.z);
    e.base = p.half;
    e.t = 0;
    e.mesh.visible = true;
  }

  updateEffect(dt) {
    const e = this.effect;
    if (e.t >= 1) {
      e.mesh.visible = false;
      return;
    }
    e.t = Math.min(1, e.t + dt / 0.55);
    const s = e.base * (0.4 + e.t * 1.3);
    e.mesh.scale.set(s, s, s);
    e.mesh.material.opacity = (1 - e.t) * 0.85;
  }

  // Robotun üstünde "+N" balonu (3B konumu ekran pikseline çevirir)
  showPopup(text, strong) {
    _v.copy(this.robot.root.position);
    _v.y += 1.3;
    _v.project(this.camera);
    const x = ((_v.x + 1) / 2) * window.innerWidth;
    const y = ((1 - _v.y) / 2) * window.innerHeight;
    this.hud.popup(text, x, y, strong);
  }

  // ---------------- Kamera ----------------
  updateFocusTarget() {
    this.focusTarget.set(
      (this.cur.x + this.next.x) / 2,
      (this.cur.top + this.next.top) / 4,
      (this.cur.z + this.next.z) / 2
    );
  }

  updateCamera(dt) {
    // Kare hızından bağımsız yumuşak takip
    const k = 1 - Math.exp(-CAM.followSpeed * dt);
    this.focus.lerp(this.focusTarget, k);
    this.placeCamera(this.focus);
  }

  placeCamera(focus) {
    this.camera.position.copy(focus).add(this.camOffset);
    this.camera.lookAt(focus);
    this.camera.updateMatrixWorld();
  }

  // ---------------- Sabit adım ve ara değer ----------------
  // main.js oyunu her zaman aynı uzunlukta (h = 1/120 sn) adımlarla ilerletir.
  // Böylece zıplama yayı, şarj ve fizik 60 ya da 120 FPS'te birebir aynıdır.
  step(h) {
    this.saveSnapshot(this.prevSnap);
    this.update(h);
    if (this.teleport) {          // yeni oyun: eski konumdan kayarak gelmesin
      this.saveSnapshot(this.prevSnap);
      this.teleport = false;
    }
  }

  saveSnapshot(s) {
    const r = this.robot;
    s.pos.copy(r.root.position);
    s.quat.copy(r.tilt.quaternion);
    s.yaw = r.yawGroup.rotation.y;
    s.scale.copy(r.body.scale);
    s.focus.copy(this.focus);
  }

  // Çizimden hemen önce: robotu, kamerayı ve pelerini son iki adımın arasına koy.
  // alpha = 0 → önceki adım, 1 → son adım. Döndürdüğü odak dünyaya (çim, güneş) verilir.
  beginRender(alpha) {
    const p = this.prevSnap;
    const c = this.curSnap;
    const r = this.robot;
    this.saveSnapshot(c);
    r.root.position.lerpVectors(p.pos, c.pos, alpha);
    r.tilt.quaternion.slerpQuaternions(p.quat, c.quat, alpha);
    r.yawGroup.rotation.y = p.yaw + (c.yaw - p.yaw) * alpha;
    r.body.scale.lerpVectors(p.scale, c.scale, alpha);
    r.root.updateMatrixWorld(true);
    this.updateBlob();
    _f.lerpVectors(p.focus, c.focus, alpha);
    this.placeCamera(_f);
    this.cape.writeGeometry(alpha);
    return _f;
  }

  // Robotun sahte gölgesi: tam altındaki yüzeye (platform üstü ya da zemin) oturur
  updateBlob() {
    const pos = this.robot.root.position;
    let surface = 0;
    for (const p of [this.cur, this.next]) {
      const y = p.surfaceY();
      if (y > surface && y <= pos.y + 0.05 && p.contains(pos.x, pos.z, 0)) surface = y;
    }
    this.blob.update(pos.x, pos.y, pos.z, surface);
  }

  // Çizimden sonra: oyun mantığının gerçek durumunu geri yükle
  endRender() {
    const c = this.curSnap;
    const r = this.robot;
    r.root.position.copy(c.pos);
    r.tilt.quaternion.copy(c.quat);
    r.yawGroup.rotation.y = c.yaw;
    r.body.scale.copy(c.scale);
    r.root.updateMatrixWorld(true);
  }

  // ---------------- Ana güncelleme ----------------
  update(dt) {
    this.time += dt;
    this.stateTime += dt;

    switch (this.state) {
      case State.CHARGING:
        this.charge += dt;
        this.charge01 = Math.min((this.charge * J.chargeRate) / J.maxDistance, 1);
        break;
      case State.AIR:
        this.updateAir(dt);
        break;
      case State.TIPPING:
        this.updateTipping(dt);
        break;
      case State.FALLING:
        this.updateFalling(dt);
        break;
      case State.FALLEN:
        this.updateFallen(dt);
        break;
      default:
        break;
    }

    // Platformlar: şarjda basılma, yeni gelenin düşüşü
    const charging = this.state === State.CHARGING;
    this.cur.press.target = charging ? CONFIG.platforms.pressDepth * this.charge01 : 0;
    this.platforms.update(dt);

    const grounded = this.state === State.READY || charging;
    if (grounded) this.robot.root.position.y = this.cur.surfaceY();

    this.robot.update(dt, this.time, {
      charging,
      charge01: charging ? this.charge01 : 0,
      inAir: this.state === State.AIR,
      grounded,
    });
    this.robot.root.updateMatrixWorld(true);

    // Pelerin: yerdeyken platform yüzeyi, aksi hâlde çim zemini taban alır
    const floorY = grounded ? this.robot.root.position.y : 0;
    this.cape.update(dt, this.time, floorY, this.world.windDir);

    this.updateEffect(dt);
    this.updateCamera(dt);
    this.platforms.cleanup(this.camera, this.cur, this.next);
  }
}
