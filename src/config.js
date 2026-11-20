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
    antialiasMaxDpr: 1.5,   // DPR bundan büyükse kenar yumuşatma kapalı (ekran zaten keskin)
    exposure: 1.0,          // genel parlaklık (ton eşleme pozlaması)
    maxFrameTime: 1 / 30,   // bir karede ilerletilecek en uzun süre (takılmada sıçramayı önler)
  },

  // ---------- Uyarlanabilir kalite ----------
  // Açılışta ekranın yenileme hızı (60/90/120 Hz…) ölçülür; hedef FPS ona göre seçilir.
  // ARAMA: her kademe ölçülür, hedef tutmazsa bir alt kademeye inilir.
  //        120 Hz'de hiçbir kademe ~110 FPS'e yetişemezse hedef kararlı 60'a düşer.
  // İZLEME: oyun boyunca sürer. Uzun süre hedefin altı → bir kademe in;
  //        uzun süre bol FPS → bir kademe çık. Başarısız çıkış o kademeyi bir süre "soğumaya" alır.
  // Kademe değişince shader'ların derlenmesi beklenir, ardından ilk kareler sayılmaz.
  quality: {
    targetRatio: 0.92,      // hedef FPS = yenileme hızı × bu oran (120 Hz → 110, 60 Hz → 55)
    lowHz: 60,              // yüksek yenileme tutmazsa inilecek kararlı hız
    preferHighRefresh: true,// 120 Hz ekranda önce 120'yi dene (false: doğrudan 60 hedefle)
    warmup: 0.8,            // açılışta ölçüme başlamadan beklenen süre (sn)
    skipFrames: 12,         // kademe değişip derleme bittikten sonra sayılmayan kare sayısı
    sampleTime: 1.5,        // aramada her kademenin ölçüm süresi (sn)
    window: 1,              // izlemede tek ölçüm penceresinin süresi (sn)
    downMargin: 0.9,        // izlemede "hedefin altı" eşiği = hedef × bu oran (histerezis)
    downAfter: 4,           // bu kadar sn üst üste hedefin altı → bir kademe in
    upAfter: 12,            // bu kadar sn üst üste bol FPS → bir kademe çık
    upHeadroom: 1.15,       // "bol FPS" = hedef × bu oran (ekran hızına kilitliyse ekran hızının %97'si)
    cooldown: 30,           // başarısız kademeye yeniden çıkmadan beklenen süre (sn), her başarısızlıkta 2 katı
    cooldownMax: 300,
    storageKey: 'kivilcim.kalite',      // manuel seçim (Otomatik/Yüksek/Orta/Düşük)
    autoLevelKey: 'kivilcim.otoKademe', // otomatik modun son kademesi (sonraki açılış oradan başlar)
    presets: { yuksek: 0, orta: 4, dusuk: 7 },  // manuel seçimlerin karşılığı olan kademeler
    // shadow: 'pcfsoft' (yumuşak) | 'pcf' (sert kenarlı, daha ucuz) | 'off'
    // grass: çim tutamı oranı (1 = world.grassCount'un tamamı)
    levels: [
      { pixelRatio: 2,    shadow: 'pcfsoft', grass: 1 },
      { pixelRatio: 1.5,  shadow: 'pcfsoft', grass: 1 },
      { pixelRatio: 1.25, shadow: 'pcfsoft', grass: 1 },
      { pixelRatio: 1,    shadow: 'pcfsoft', grass: 1 },
      { pixelRatio: 1,    shadow: 'pcf',     grass: 1 },
      { pixelRatio: 1,    shadow: 'off',     grass: 1 },
      { pixelRatio: 1,    shadow: 'off',     grass: 0.6 },
      { pixelRatio: 1,    shadow: 'off',     grass: 0.35 },
    ],
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
