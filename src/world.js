// =============================================================
//  world.js — Bahçe: ışıklar, sis, sonsuz zemin ve rüzgârlı çimler
//
//  • Zemin, odakla birlikte kayan tek bir düzlemdir. Rengi dünya
//    koordinatından gürültüyle hesaplanır; düzlem kaysa da toprak
//    yamaları yerinde kalır. Gürültü açılışta BİR KEZ, GPU'da tekrar
//    eden (periyodik) bir dokuya çizilir (bakeGround); zemin ve çim
//    her karede yalnızca bu dokuyu okur. Doku: RGB = zemin rengi,
//    A = toprak oranı (0 çim … 1 toprak).
//  • Çim tek bir InstancedMesh: her örnek 3 yapraklı bir tutam.
//    Tutamlar odak çevresindeki bir dikdörtgene "sarılır" (mod/fract),
//    böylece sabit sayıda tutamla sonsuz çim elde edilir.
// =============================================================
import * as THREE from 'three';
import { CONFIG } from './config.js';

const W = CONFIG.world;
const L = CONFIG.light;
const C = CONFIG.colors;

// Zemin ve çim shader'larının ortak gürültü fonksiyonları (GLSL dili).
// Aynı formül iki yerde çalıştığı için toprak yamalarında çim bitmez.
const NOISE_GLSL = /* glsl */ `
  float kvHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float kvNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = kvHash(i);
    float b = kvHash(i + vec2(1.0, 0.0));
    float c = kvHash(i + vec2(0.0, 1.0));
    float d = kvHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  // 0 = çim, 1 = toprak
  float kvDirt(vec2 p, float threshold) {
    float n = kvNoise(p * 0.3) * 0.65 + kvNoise(p * 0.9 + 7.3) * 0.35;
    return smoothstep(threshold, threshold + 0.05, n);
  }
`;

// Periyodik gürültü: kafes koordinatı "per" ile mod alınır → desen
// kendini dikişsiz tekrar eder (doku kenarları birleşir).
const PERIODIC_NOISE_GLSL = /* glsl */ `
  float kvHash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float kvPNoise(vec2 p, float per) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = kvHash(mod(i, per));
    float b = kvHash(mod(i + vec2(1.0, 0.0), per));
    float c = kvHash(mod(i + vec2(0.0, 1.0), per));
    float d = kvHash(mod(i + vec2(1.0, 1.0), per));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
`;

// Zemin dokusunu çizen tam ekran shader. vUv (0–1) → dünya konumu p = vUv × P.
// Her gürültü çağrısının kafes periyodu = frekans × P (P = 20 iken hepsi tam sayı).
const BAKE_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;
const BAKE_FRAGMENT = /* glsl */ `
  uniform float uP, uDirt;
  uniform vec3 uGrassDark, uGrassLight, uDirtDark, uDirtLight;
  varying vec2 vUv;
  ${PERIODIC_NOISE_GLSL}
  void main() {
    vec2 p = vUv * uP;
    float n = kvPNoise(p * 0.3, 0.3 * uP) * 0.65 + kvPNoise(p * 0.9 + 7.3, 0.9 * uP) * 0.35;
    float dirt = smoothstep(uDirt, uDirt + 0.05, n);
    float n1 = kvPNoise(p * 1.3, 1.3 * uP);
    float n2 = kvPNoise(p * 5.0 + 11.0, 5.0 * uP);
    vec3 grass = mix(uGrassDark, uGrassLight, n1 * 0.7 + n2 * 0.3);
    vec3 soil = mix(uDirtDark, uDirtLight, kvPNoise(p * 3.0 + 3.1, 3.0 * uP) * 0.6 + kvPNoise(p * 9.0, 9.0 * uP) * 0.4);
    float rim = dirt * (1.0 - dirt) * 4.0;          // yama kenarında hafif koyuluk
    gl_FragColor = vec4(mix(grass, soil, dirt) * (1.0 - rim * 0.12), dirt);
  }
`;

// Çim tutamının vertex shader parçası: Three.js'in "begin_vertex"
// bölümünün yerine geçer ve "transformed" (dünya konumu) üretir.
const GRASS_VERTEX = /* glsl */ `
  // Tutamın odak çevresindeki alanda sarılmış konumu
  float fr = dot(uFocus, uAxisR) / uArea.x;
  float fu = dot(uFocus, uAxisU) / uArea.y;
  float sa = fract(aSeed.x - fr + 0.5);
  float sb = fract(aSeed.y - fu + 0.5);
  vec2 ground = uAxisR * (fr - 0.5 + sa) * uArea.x + uAxisU * (fu - 0.5 + sb) * uArea.y;

  // Alan kenarında ve toprak yamalarında tutamı küçült
  float edge = smoothstep(0.0, 0.06, min(sa, 1.0 - sa)) * smoothstep(0.0, 0.06, min(sb, 1.0 - sb));
#ifdef KV_LIVE_NOISE
  float dirt = kvDirt(ground, uDirt);
#else
  float dirt = textureLod(uGroundTex, ground / uPeriod, 0.0).a;  // açılışta çizilen dokudan
#endif
  float s = aSeed.w * edge * (1.0 - dirt);

  // Rastgele dönüş
  float ang = aSeed.z * 6.2831853;
  float cs = cos(ang);
  float sn = sin(ang);
  vec3 p = position * s;
  p.xz = vec2(cs * p.x - sn * p.z, sn * p.x + cs * p.z);

  // Rüzgâr: yaprak ucuna doğru artan eğilme (h*h)
  float h = position.y;
  float wave = sin(uTime * uWindSpeed + ground.x * 0.35 + ground.y * 0.25) * 0.6
             + sin(uTime * uWindSpeed * 1.9 + ground.x * 1.1 - ground.y * 0.8) * 0.4;
  p.xz += uWindDir * (0.4 + 0.6 * wave) * uWind * h * h * (s / 0.2);

  vec3 transformed = vec3(ground.x + p.x, p.y, ground.y + p.z);

  // Tutamlar arası hafif renk farkı; toprak kenarında daha kuru
  vColor *= mix(0.82, 1.12, fract(aSeed.z * 7.13)) * mix(1.0, 0.8, dirt);
`;

const _p = new THREE.Vector3();

export class World {
  // opts.ground: 'tex' (varsayılan, doku) | 'noise' (eski: her karede gürültü) | 'flat' (düz renk, teşhis)
  constructor(scene, isMobile, opts = {}) {
    this.scene = scene;
    this.groundMode = opts.ground || 'tex';
    this.time = 0;
    this.windDir = new THREE.Vector3(W.windDir.x, 0, W.windDir.z).normalize();

    // Shader'larla paylaşılan değerler. { value: ... } biçimi Three.js'in
    // uniform kuralıdır; .value değişince bir sonraki karede GPU'ya gider.
    this.uniforms = {
      uTime: { value: 0 },
      uFocus: { value: new THREE.Vector2() },
      uArea: { value: new THREE.Vector2(30, 30) },
      uAxisR: { value: new THREE.Vector2() },
      uAxisU: { value: new THREE.Vector2() },
      uWind: { value: W.wind },
      uWindSpeed: { value: W.windSpeed },
      uWindDir: { value: new THREE.Vector2(this.windDir.x, this.windDir.z) },
      uDirt: { value: W.dirtThreshold },
      uGrassDark: { value: new THREE.Color(C.grassDark) },
      uGrassLight: { value: new THREE.Color(C.grassLight) },
      uDirtDark: { value: new THREE.Color(C.dirtDark) },
      uDirtLight: { value: new THREE.Color(C.dirtLight) },
      uGroundTex: { value: null },
      uPeriod: { value: W.groundPeriod },
    };

    // Zemin dokusu: sRGB biçiminde saklanır (koyu tonlarda bantlanma olmasın),
    // tekrar eder ve mipmap'lidir (uzakta titreşmesin). İçeriğini bakeGround çizer.
    this.groundRT = new THREE.WebGLRenderTarget(W.groundTexSize, W.groundTexSize, {
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      colorSpace: THREE.SRGBColorSpace,
    });
    this.uniforms.uGroundTex.value = this.groundRT.texture;

    // Kameranın bakışına göre zemindeki iki yatay eksen:
    // R = ekranda sağa, U = ekranda yukarı giden yön.
    const o = CONFIG.camera.offset;
    const back = new THREE.Vector2(o.x, o.z).normalize();
    this.uniforms.uAxisU.value.set(-back.x, -back.y);
    this.uniforms.uAxisR.value.set(back.y, -back.x);
    this.elevSin = o.y / Math.hypot(o.x, o.y, o.z); // kamera yükseliş açısının sinüsü

    scene.background = new THREE.Color(C.sky);
    scene.fog = new THREE.Fog(C.sky, W.fogNear, W.fogFar);

    this.createLights(isMobile);
    this.createGround();
    this.createGrass(isMobile);
  }

  createLights(isMobile) {
    this.hemi = new THREE.HemisphereLight(C.hemiSky, C.hemiGround, L.hemiIntensity);
    this.scene.add(this.hemi);

    // Sıcak gün ışığı: tek yönlü ışık + yumuşak gölge
    const sun = new THREE.DirectionalLight(C.sun, L.sunIntensity);
    const size = isMobile ? L.shadowMapSizeMobile : L.shadowMapSize;
    sun.castShadow = true;
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -L.shadowExtent;
    cam.right = L.shadowExtent;
    cam.top = L.shadowExtent;
    cam.bottom = -L.shadowExtent;
    cam.near = 1;
    cam.far = 60;
    cam.updateProjectionMatrix();
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.sun = sun;
    this.scene.add(sun, sun.target);

    // Dolgu ışığı: kameranın gördüğü yüzler (robotun sırtı) kapkara kalmasın.
    // Yönlü ışıkta yalnızca yön önemlidir; hedefi orijinde kalabilir.
    const fill = new THREE.DirectionalLight(C.hemiSky, L.fillIntensity);
    fill.position.set(L.fillOffset.x, L.fillOffset.y, L.fillOffset.z);
    this.scene.add(fill);

    // Güneş odakla birlikte taşınır. Gölge kenarları titremesin diye konum,
    // gölge dokusunun piksel ızgarasına oturtulur; bunun için ışığın eksenleri:
    this.sunOffset = new THREE.Vector3(L.sunOffset.x, L.sunOffset.y, L.sunOffset.z);
    this.sunFwd = this.sunOffset.clone().normalize().negate();
    this.sunRight = new THREE.Vector3().crossVectors(this.sunFwd, new THREE.Vector3(0, 1, 0)).normalize();
    this.sunUp = new THREE.Vector3().crossVectors(this.sunRight, this.sunFwd).normalize();
    this.shadowTexel = (2 * L.shadowExtent) / size;
  }

  // Zemin dokusunu GPU'da bir kez çiz (açılışta, ilk kareden önce)
  bakeGround(renderer) {
    const u = this.uniforms;
    const mat = new THREE.ShaderMaterial({
      vertexShader: BAKE_VERTEX,
      fragmentShader: BAKE_FRAGMENT,
      uniforms: {
        uP: u.uPeriod, uDirt: u.uDirt,
        uGrassDark: u.uGrassDark, uGrassLight: u.uGrassLight,
        uDirtDark: u.uDirtDark, uDirtLight: u.uDirtLight,
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    const bakeScene = new THREE.Scene();
    bakeScene.add(quad);
    const cam = new THREE.Camera();

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.groundRT);
    renderer.render(bakeScene, cam);
    renderer.setRenderTarget(prevTarget);

    quad.geometry.dispose();
    mat.dispose();
  }

  createGround() {
    const geo = new THREE.PlaneGeometry(W.groundSize, W.groundSize, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const u = this.uniforms;
    const mode = this.groundMode;

    // Teşhis: düz renk (gürültü de doku okuması da yok)
    if (mode === 'flat') {
      mat.color.copy(u.uGrassDark.value).lerp(u.uGrassLight.value, 0.5);
    } else {
      // onBeforeCompile: Three.js'in hazır shader'ına kendi kodumuzu ekleriz;
      // böylece ışık, gölge ve sis hesapları aynen çalışmaya devam eder.
      mat.onBeforeCompile = (shader) => {
        for (const name of ['uDirt', 'uGrassDark', 'uGrassLight', 'uDirtDark', 'uDirtLight', 'uGroundTex', 'uPeriod']) {
          shader.uniforms[name] = u[name];
        }
        shader.vertexShader = 'varying vec2 vGround;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vGround = (modelMatrix * vec4(transformed, 1.0)).xz;'
        );
        const body = mode === 'noise'
          ? /* glsl */ `
            // ESKİ YÖNTEM (teşhis için): her pikselde 6 gürültü hesabı
            float dirt = kvDirt(vGround, uDirt);
            float n1 = kvNoise(vGround * 1.3);
            float n2 = kvNoise(vGround * 5.0 + 11.0);
            vec3 grass = mix(uGrassDark, uGrassLight, n1 * 0.7 + n2 * 0.3);
            vec3 soil = mix(uDirtDark, uDirtLight, kvNoise(vGround * 3.0 + 3.1) * 0.6 + kvNoise(vGround * 9.0) * 0.4);
            float rim = dirt * (1.0 - dirt) * 4.0;
            diffuseColor.rgb *= mix(grass, soil, dirt) * (1.0 - rim * 0.12);`
          : /* glsl */ `
            // Tek doku okuması (sRGB doku okunurken otomatik olarak doğrusal renge çözülür)
            diffuseColor.rgb *= texture2D(uGroundTex, vGround / uPeriod).rgb;`;
        shader.fragmentShader = `
          varying vec2 vGround;
          uniform float uDirt, uPeriod;
          uniform vec3 uGrassDark, uGrassLight, uDirtDark, uDirtLight;
          uniform sampler2D uGroundTex;
          ${mode === 'noise' ? NOISE_GLSL : ''}
        ` + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n{' + body + '\n}');
      };
      mat.customProgramCacheKey = () => 'kvGround-' + mode;
    }

    this.ground = new THREE.Mesh(geo, mat);
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
  }

  createGrass(isMobile) {
    const count = isMobile ? W.grassCountMobile : W.grassCount;
    const geo = createTuftGeometry();

    // Her tutam için 4 sayı: alan içi konum (x, y), dönüş, boy.
    // Konumlar ızgara + rastgele kaydırma ile dağıtılır (kümelenme olmasın).
    // Izgara hücreleri karıştırılır: kalite düşünce yalnızca ilk N tutam
    // çizilir (setGrassRatio) ve bu ilk N tutam yine tüm alana eşit yayılır.
    const seeds = new Float32Array(count * 4);
    const nx = Math.ceil(Math.sqrt(count));
    const ny = Math.ceil(count / nx);
    const cells = Array.from({ length: nx * ny }, (_, k) => k);
    for (let k = cells.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [cells[k], cells[j]] = [cells[j], cells[k]];
    }
    for (let i = 0; i < count; i++) {
      const gx = cells[i] % nx;
      const gy = Math.floor(cells[i] / nx);
      seeds[i * 4 + 0] = (gx + Math.random()) / nx;
      seeds[i * 4 + 1] = (gy + Math.random()) / ny;
      seeds[i * 4 + 2] = Math.random();
      seeds[i * 4 + 3] = THREE.MathUtils.lerp(W.bladeHeight[0], W.bladeHeight[1], Math.random());
    }
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.customProgramCacheKey = () => 'kvGrass-' + this.groundMode;
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      for (const name of ['uTime', 'uFocus', 'uArea', 'uAxisR', 'uAxisU', 'uWind', 'uWindSpeed', 'uWindDir', 'uDirt', 'uGroundTex', 'uPeriod']) {
        shader.uniforms[name] = u[name];
      }
      const live = this.groundMode === 'noise';
      shader.vertexShader = `
        ${live ? '#define KV_LIVE_NOISE' : ''}
        attribute vec4 aSeed;
        uniform float uTime, uWind, uWindSpeed, uDirt, uPeriod;
        uniform vec2 uFocus, uArea, uAxisR, uAxisU, uWindDir;
        uniform sampler2D uGroundTex;
        ${live ? NOISE_GLSL : ''}
      ` + shader.vertexShader.replace('#include <begin_vertex>', GRASS_VERTEX);
      // Yaprağın iki yüzü de zemin gibi aydınlansın (arka yüz kararmasın)
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n  normal = normalize(vNormal);'
      );
    };

    // Örnek matrisleri birim matris kalır; konumu shader hesaplar.
    // Sınır küresi anlamsız olduğundan görünürlük testi kapatılır.
    this.grass = new THREE.InstancedMesh(geo, mat, count);
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = !isMobile || W.grassShadowMobile;
    this.grassMax = count;
    this.scene.add(this.grass);
  }

  // Kalite ayarı: çizilecek tutam oranı (0–1). Bellek aynı kalır, GPU daha az çizer.
  setGrassRatio(ratio) {
    this.grass.visible = ratio > 0;
    this.grass.count = Math.max(1, Math.round(this.grassMax * ratio));
  }

  // Kalite ayarı: güneş gölge yapsın mı
  setShadows(on) {
    this.sun.castShadow = on;
  }

  // Ekran boyutu değişince çim alanını görünür bölgeye göre ayarla
  resize(viewW, viewH) {
    const m = W.grassMargin * 2;
    this.uniforms.uArea.value.set(viewW + m, viewH / this.elevSin + m);
  }

  update(dt, focus) {
    this.time += dt;
    this.uniforms.uTime.value = this.time;
    this.uniforms.uFocus.value.set(focus.x, focus.z);
    this.ground.position.set(focus.x, 0, focus.z);

    // Güneşi odakla taşı, gölge texel ızgarasına yuvarla
    const t = this.shadowTexel;
    const r = Math.round(focus.dot(this.sunRight) / t) * t;
    const u = Math.round(focus.dot(this.sunUp) / t) * t;
    const f = focus.dot(this.sunFwd);
    _p.copy(this.sunRight).multiplyScalar(r)
      .addScaledVector(this.sunUp, u)
      .addScaledVector(this.sunFwd, f);
    this.sun.target.position.copy(_p);
    this.sun.position.copy(_p).add(this.sunOffset);
  }
}

// 3 yapraklı çim tutamı. Boy 1 birim kabul edilir; gerçek boyu shader ölçekler.
function createTuftGeometry() {
  const SEG = 3;     // yaprak başına segment
  const BLADES = 3;  // tutamdaki yaprak sayısı
  const pos = [];
  const col = [];
  const nor = [];
  const idx = [];
  const cBase = new THREE.Color(C.bladeBase);
  const cTip = new THREE.Color(C.bladeTip);
  const c = new THREE.Color();
  const halfW = W.bladeWidth / 2;

  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + Math.random() * 0.8;
    const ox = Math.cos(a) * 0.3;          // tutam içindeki konum
    const oz = Math.sin(a) * 0.3;
    const height = 0.7 + Math.random() * 0.3;
    const lean = 0.15 + Math.random() * 0.25;
    const lx = Math.cos(a) * lean;          // dışa doğru kavis
    const lz = Math.sin(a) * lean;
    const face = Math.random() * Math.PI;   // yaprak düzleminin yönü
    const fx = Math.cos(face);
    const fz = Math.sin(face);
    const start = pos.length / 3;

    for (let s = 0; s < SEG; s++) {
      const t = s / SEG;
      const w = halfW * (1 - t * 0.75);     // uca doğru incelir
      const cx = ox + lx * t * t;
      const cz = oz + lz * t * t;
      const y = t * height;
      pos.push(cx - fx * w, y, cz - fz * w, cx + fx * w, y, cz + fz * w);
      c.copy(cBase).lerp(cTip, t);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      nor.push(0, 1, 0, 0, 1, 0);           // normal yukarı: zemin gibi aydınlanır
    }
    // sivri uç
    pos.push(ox + lx, height, oz + lz);
    col.push(cTip.r, cTip.g, cTip.b);
    nor.push(0, 1, 0);

    for (let s = 0; s < SEG - 1; s++) {
      const i0 = start + s * 2;
      idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2);
    }
    const last = start + (SEG - 1) * 2;
    idx.push(last, last + 1, last + 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}
