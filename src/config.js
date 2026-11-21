// =============================================================
//  config.js — Oyunun ayarlanabilir TÜM değerleri burada.
//  Birimler: uzunluk = dünya birimi (Kıvılcım ≈ 1.1 birim boyunda),
//  zaman = saniye, renkler = CSS hex metni ('#rrggbb').
//  Bir değeri değiştirip sayfayı yenilemek yeterli; derleme yok.
//  Not: "export" bu nesneyi diğer modüllerin import etmesine izin verir.
// =============================================================

export const CONFIG = {
  // ---------- Görüntü ve performans ----------
  render: {
    mobilePixelRatio: 1.5,  // telefonda Otomatik kipin başlangıç ölçeği (kayıtlı sonuç yoksa)
    exposure: 1.0,          // genel parlaklık (ton eşleme pozlaması)
    // Kare kapısı: en çok bu kadar FPS çiz. 120 Hz ekranda 60 ile her ikinci yenileme
    // atlanır; kareler eşit aralıkla (16,7 ms) gelir. Oyunda kare hızını menü ve
    // Otomatik kip belirler; bu değer yalnızca teşhis kipinde geçerlidir.
    // Adres çubuğundan sabitlemek için: ?cap=60 | ?cap=120 | ?cap=0 (sınırsız)
    fpsCap: 60,
    // Oyun mantığı sabit adımlarla ilerler (kare hızından bağımsız, zıplama her FPS'te aynı).
    // Çizimde robot, kamera ve pelerin iki adım arasında ara değerlenir.
    step: 1 / 120,
    maxSteps: 8,            // bir karede en çok bu kadar adım (uzun takılmada kalan süre atılır)
  },

  // ---------- Kalite ve dinamik çözünürlük (quality.js) ----------
  // Otomatik kipte oyun sırasında YALNIZCA çözünürlük ölçeği değişir (shader derlenmez).
  // Karar ölçüsü: son `window` sn'deki kare yükünün 90. yüzdeliği (p90, ms).
  //   p90 > hedef × downRatio                → bir adım in
  //   p90 < hedef × upRatio, upHold sn boyunca → bir adım çık
  // Hedef aralık kare kapısından gelir (60 → 16,7 ms; 120 → 8,3 ms).
  quality: {
    minScale: 1.0,          // çözünürlük ölçeği aralığı (cihazın DPR'ını geçmez)
    maxScale: 2.0,
    scaleStep: 0.1,
    window: 3,              // p90 ölçüm penceresi (sn)
    downRatio: 1.15,
    upRatio: 0.7,
    upHold: 10,             // çıkmak için "bol pay"ın sürmesi gereken süre (sn)
    settle: 2,              // her değişiklikten sonra ölçüme başlamadan beklenen süre (sn)
    check: 0.25,            // p90 kaç sn'de bir hesaplanır
    lateRatio: 1.3,         // aralığı hedef × bunu aşan kare "gecikmiş" sayılır (yükü = aralık)
    highRateP90: 7,         // en yüksek ölçekte p90 bunun altındaysa (ms) 120 FPS denenir
    highRateMinHz: 90,      // 120 FPS denemesi için en az ekran hızı
    curtainMin: 0.35,       // "ayarlanıyor" perdesinin en kısa süresi (sn)
    log: true,              // kararları tarayıcı konsoluna yaz
    // Menü kipleri. scale: çözünürlük ölçeği, grass: çim oranı (1 = world.grassCount),
    // shadow: 'off' = sahte gölgeler (shadows.js) | 'pcf' = gerçek gölge, rate: sabit kare hızı
    modes: {
      oto:    { grass: 1, shadow: 'off' },                          // ölçek dinamik
      pil:    { scale: 1.0, grass: 0.35, shadow: 'off', rate: 60 }, // Pil dostu
      yuksek: { scale: 2.0, grass: 1, shadow: 'off' },
      ultra:  { scale: 2.0, grass: 1, shadow: 'pcf' },              // yalnızca masaüstü
    },
    storageKey: 'kivilcim.kalite',    // menü kipi
    rateKey: 'kivilcim.kareHizi',     // menüdeki kare hızı (60 | 120)
    autoKey: 'kivilcim.dinamik',      // otomatik kipin sonucu: { scale, cap }
    hzKey: 'kivilcim.ekranHz',        // arka planda ölçülen ekran yenileme hızı
    oldKeys: ['kivilcim.otoKademe', 'kivilcim.otoKademe2'],  // eski kademe sistemi (silinir)
  },

  // ---------- Kamera ----------
  camera: {
    viewSize: 6.6,                     // ekranın KISA kenarına sığan dünya genişliği
    offset: { x: 10, y: 11, z: 10 },   // odağa göre kamera konumu (izometrik açı)
    followSpeed: 3.2,                  // takip hızı (büyük = daha çabuk)
  },

  // ---------- Zıplama ----------
  jump: {
    chargeRate: 3.4,    // basılı tutulan her saniyede eklenen mesafe (birim/sn)
    maxDistance: 6.0,   // zıplama mesafesinin üst sınırı
    launchSpeed: 7.5,   // dikey kalkış hızı → yayın yüksekliği
    gravity: 24,        // yerçekimi → büyük = daha kısa, daha "tok" uçuş
  },

  // ---------- İniş kontrolü ----------
  landing: {
    tolerance: 0.04,    // üst yüzey kenarından bu kadar taşma hâlâ başarılı iniş
    edgeZone: 0.2,      // bundan az taşarsa robot kenardan devrilir
    centerRatio: 0.22,  // merkez bölgesi yarıçapı = platform yarıçapı × bu oran
    centerMin: 0.13,    // merkez bölgesinin en küçük yarıçapı
  },

  // ---------- Puan ----------
  score: {
    normal: 1,          // sıradan iniş
    centerBase: 2,      // ilk merkez inişi
    centerFactor: 2,    // art arda merkezde çarpan: 2 → 4 → 8 → 16 → 32
    centerMax: 32,      // tek inişte en fazla puan
    storageKey: 'kivilcim.enIyi', // localStorage anahtarı
  },

  // ---------- Arayüz zamanlamaları ----------
  ui: {
    gameOverDelay: 0.9, // düştükten kaç sn sonra "oyun bitti" ekranı çıksın
    restartLock: 0.5,   // ekran çıktıktan sonra dokunmaların yok sayıldığı süre
  },

  // ---------- Zorluk eğrisi ----------
  // z = 1 − e^(−puan / rampScore): 0'dan 1'e yumuşakça yaklaşır.
  // Örn. rampScore 30 ise 30 puanda z ≈ 0.63, 90 puanda z ≈ 0.95.
  difficulty: {
    rampScore: 30,
    sizeStart: 1.0,        // platform yarıçapı (kare için yarı kenar) — başta
    sizeEnd: 0.5,          // — zorlaştıkça
    sizeJitter: 0.12,      // ± rastgele boyut oranı
    gapStart: [0.5, 1.5],  // kenardan kenara boşluk [en az, en çok] — başta
    gapEnd: [1.1, 2.5],    // — zorlaştıkça
  },

  // ---------- Platformlar ----------
  platforms: {
    weights: { stump: 1, stone: 1, crate: 1, bricks: 1 }, // seçilme ağırlıkları
    dropHeight: 2.5,     // yeni platform bu yükseklikten düşerek gelir
    dropTime: 0.35,
    pressDepth: 0.14,    // tam şarjda platformun basılma oranı
    springFreq: 5,       // geri yaylanma frekansı (Hz)
    springDamping: 0.25, // sönüm oranı (küçük = daha çok salınım)
    maxCount: 16,        // sahnede en fazla platform (güvenlik sınırı)
  },

  // ---------- Robot animasyonu ----------
  robot: {
    squash: 0.32,         // tam şarjda çömelme oranı
    stretchImpulse: 5.5,  // kalkışta uzama itkisi
    landImpulse: 4.5,     // inişte basılma itkisi
    springFreq: 4.2,      // gövde yayı frekansı (Hz)
    springDamping: 0.32,  // gövde yayı sönümü
    turnSpeed: 9,         // zıplama yönüne dönme hızı
    tipAccel: 14,         // kenardan devrilirken açısal ivme
  },

  // ---------- Pelerin (Verlet kumaş) ----------
  cape: {
    cols: 6,              // yatay parçacık sayısı
    rows: 8,              // dikey parçacık sayısı
    segment: 0.072,       // satırlar arası mesafe
    topWidth: 0.28,       // omuzdaki genişlik
    bottomWidth: 0.42,    // etekteki genişlik
    topY: 0.6,            // omuz bağlantısının yüksekliği (robot yerel)
    topZ: -0.15,          // sırtın biraz arkası
    gravity: 22,
    damping: 0.004,       // her alt adımda hız kaybı (0–1)
    airDrag: 0.55,        // hava direnci (hızın karesiyle büyür)
    iterations: 6,        // kısıt çözüm turu: fazla = daha sert kumaş
    stiffness: 1.0,       // yapısal kısıtlar (0–1)
    shearStiffness: 0.7,  // çapraz kısıtlar
    bendStiffness: 0.25,  // bükülme direnci (küçük = daha yumuşak kıvrım)
    flutter: 16,          // havada dalgalanma kuvveti
    flutterFreq: 16,      // dalgalanma frekansı
    breeze: 1.5,          // dururken esinti etkisi
    substep: 1 / 120,     // fizik adımı (sn)
  },

  // ---------- Sahte gölgeler (shadows.js) ----------
  shadows: {
    color: '#1e2610',        // koyu zeytin: çimin gölgedeki tonuna yakın
    lift: 0.006,             // platform üstünde: yüzeyin bu kadar üstünde (+ polygonOffset)
    grassLift: 0.28,         // zeminde: çim yapraklarının üstünde (yoksa yapraklar gölgeyi örter)
    blobSize: 0.7,           // robot lekesinin çapı (yerdeyken)
    blobOpacity: 0.62,
    blobFadeHeight: 3,       // bu yükseklikte leke en küçük ve en soluk
    blobMinScale: 0.55,
    blobMinOpacity: 0.3,
    blobSunOffset: 0.3,      // leke güneş yönüne bu yükseklik kadar kayar
    platformOpacity: 0.55,
    platformBlur: 0.09,      // platform gölgesinin kenar yumuşaklığı (dünya birimi)
    platformTexSize: 128,    // platform gölge dokusunun çözünürlüğü
  },

  // ---------- Dünya ----------
  world: {
    groundSize: 120,
    grassCount: 9000,        // masaüstünde çim tutamı sayısı
    grassCountMobile: 5000,  // dokunmatik cihazlarda
    grassShadowMobile: false, // dokunmatikte çim gölge almasın (binlerce yaprakta gölge örneklemek pahalı)
    bladeHeight: [0.16, 0.26],
    bladeWidth: 0.17,        // yaprak eni / yaprak boyu oranı
    grassMargin: 4,          // çim alanı ekran dışına bu kadar taşar
    wind: 0.09,              // yaprak ucunun salınım genliği
    windSpeed: 1.6,
    windDir: { x: 0.8, z: 0.6 },
    dirtThreshold: 0.63,     // büyük = daha az toprak yaması
    groundTexSize: 1024,     // zemin dokusunun çözünürlüğü (açılışta bir kez çizilir)
    groundPeriod: 20,        // dokunun tekrar ettiği dünya genişliği (gürültü frekanslarıyla tam bölünmeli)
    fogNear: 21,
    fogFar: 48,
  },

  // ---------- Işık ----------
  light: {
    sunIntensity: 2.5,
    sunOffset: { x: -4, y: 12, z: 7 },  // güneşin odağa göre yönü (gölgeler ekranda sağa düşer)
    hemiIntensity: 1.5,
    fillIntensity: 0.55,                // kamera yönünden gelen gölgesiz dolgu ışığı
    fillOffset: { x: 6, y: 5, z: 8 },
    shadowMapSize: 2048,       // masaüstü
    shadowMapSizeMobile: 1024, // dokunmatik cihazlar
    shadowExtent: 9,           // gölge kamerasının yarı genişliği
  },

  // ---------- Renkler ----------
  colors: {
    sky: '#efe3c6',        // arka plan ve sis
    sun: '#ffdcaa',
    hemiSky: '#fff1d6',
    hemiGround: '#6f7d3a',
    // robot
    graphite: '#5a5f69',
    glove: '#6a6f78',
    copper: '#c4672b',
    visor: '#b4561d',
    visorGlow: '#ff7f2e',
    eye: '#ffd98a',
    cape: '#5f6b2c',
    // güç halkası
    ringStart: '#ff8a2a',
    ringEnd: '#ffe27a',
    ringTrack: '#3b2a18',
    // zemin
    grassDark: '#55722a',
    grassLight: '#7d9638',
    bladeBase: '#4a6a22',
    bladeTip: '#a7bc50',
    dirtDark: '#6b4a2e',
    dirtLight: '#8e6b46',
    // platformlar
    bark: '#5a3e2b',
    woodLight: '#d0a36a',
    woodRing: '#9a6a3c',
    crate: '#bb8a50',
    crateFrame: '#7a5230',
    stone: '#9a9f98',
    brick: '#a5543a',
    moss: '#5f7d2a',
  },
};
