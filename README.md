# Kıvılcım — Bahçe Zıplaması

**▶ Hemen oyna: <https://selim-sahin.github.io/kivilcim-zipla/>**

Tarayıcıda çalışan, basılı tut–bırak mekanikli 3B zıplama oyunu. Avuç içi
boyutundaki oyuncak robot **Kıvılcım**, bahçedeki kütükler, dere taşları,
tahta sandıklar ve yosunlu tuğla yığınları arasında zıplar. Kurulum gerekmez;
masaüstü ve mobil tarayıcıda açılır.

## Kullanılan teknolojiler

- **Three.js `0.170.0`** — WebGL tabanlı 3B çizim; küçültülmüş sürümü `vendor/three/` altında, importmap ile depodan yüklenir.
- **Saf HTML + CSS + JavaScript (ES modülleri)** — derleme adımı ya da paket yöneticisi yok.
- **Pointer Events** — fare ve dokunmatik ekran için tek giriş sistemi.
- **Verlet entegrasyonu** — pelerin fiziği; **InstancedMesh + özel shader** — rüzgârlı çim.
- **localStorage** — en yüksek skoru saklar.
- **PWA (manifest + service worker)** — ana ekrana eklenebilir; ikinci açılış önbellekten gelir, çevrimdışı çalışır.
- **Uyarlanabilir kalite** — açılışta FPS ölçülür, telefon yetişemiyorsa çözünürlük, gölge ve çim yoğunluğu kademeli düşürülür.
- **GitHub Pages** — statik barındırma.
- Robot, pelerin, platformlar, çim ve dokular tamamen kodla üretilir; harici model/görsel dosyası yoktur.

## Kontroller / Nasıl oynanır

| Eylem | Fare / dokunmatik | Klavye |
|---|---|---|
| Güç biriktir | Basılı tut | Boşluk'a basılı tut |
| Zıpla | Bırak | Boşluk'u bırak |
| Yeniden başla | Oyun bitince dokun | Boşluk |

- Ne kadar uzun basarsan o kadar uzağa zıplarsın (üst sınırlı). Robotun altındaki halka gücü gösterir.
- Başarılı iniş **+1**. Tam merkeze iniş **+2**; art arda merkez inişlerinde bonus katlanır: 2 → 4 → 8 → 16 → 32.
- Aynı platforma geri inersen puan almazsın ama oyun sürer.
- En yüksek skor tarayıcının `localStorage`'ında saklanır.

## Yerelde çalıştırma

ES modülleri `file://` adresinden açılamaz; küçük bir yerel sunucu gerekir.
Proje klasöründe:

```bash
python -m http.server 8000 --bind 0.0.0.0
```

- Bu bilgisayarda: <http://localhost:8000>
- Aynı ağdaki telefon/tablette: `http://<bilgisayarın-yerel-IP'si>:8000`
  (Windows'ta IP için `ipconfig`; güvenlik duvarı Python için izin isteyebilir — "Özel ağ"ı onayla.)
- Kare hızını ve kalite kademesini görmek için adresin sonuna `?fps` ekle: `http://localhost:8000/?fps`
  (ör. `58 FPS · K1 · 1.5x · yumuşak gölge · çim %100`; ölçüm sürerken `ölçülüyor` yazar)
- `?debug` eklenirse tarayıcı konsolundan `game` nesnesine erişebilirsin (ör. `game.score`, `game.state`).

## GitHub Pages'te yayınlama

1. Bu klasörü bir GitHub deposuna gönder.
2. Depoda **Settings → Pages → Build and deployment** bölümünde
   *Source: Deploy from a branch*, *Branch: `main`* ve *`/ (root)`* seç.
3. Birkaç dakika sonra oyun `https://<kullanıcı>.github.io/<depo>/` adresinde açılır.

Tüm yollar görelidir (`./style.css`, `./src/main.js`), bu yüzden alt klasörde sorunsuz çalışır.

### Yeni sürüm yayınlarken (önemli)

Oyun telefonda önbellekten açılır. Oyuncuların yeni sürümü alması için `sw.js`'teki
`VERSION` değişmelidir. Commit'ten **önce** proje kökünde şunu çalıştır:

```bash
python tools/sw_surum.py
```

Betik dosya içeriklerinden bir özet hesaplayıp `VERSION`'a yazar; yeni bir oyun dosyası
eklediysen ve `sw.js`'teki `ASSETS` listesine koymayı unuttuysan uyarır. Telefon bir
sonraki açılışta yeni sürümü fark eder, arka planda indirir ve oyuncu henüz puan
almamışsa sayfayı kendiliğinden yeniler.

## Dosya yapısı

```
index.html        importmap, modulepreload, tuval, yükleme ekranı ve arayüz katmanları
style.css         tam ekran düzen, dokunmatik ayarları, arayüz stilleri
sw.js             service worker: önbellek (sürüm numaralı), çevrimdışı çalışma
manifest.json     PWA bilgileri (ad, ikonlar, tam ekran)
icons/            uygulama ikonları (SVG + PNG)
vendor/three/     Three.js 0.170.0 (küçültülmüş) + kullanılan iki eklenti, MIT lisansı
tools/
  sw_surum.py     sw.js VERSION'unu dosya içeriklerinden günceller (yayından önce)
src/
  config.js       TÜM ayarlanabilir değerler (zıplama, yerçekimi, pelerin, zorluk, renkler…)
  main.js         renderer, sahne, kamera, shader ön-derleme, ana döngü, service worker kaydı
  game.js         durum makinesi, zıplama yayı, iniş kontrolü, puan, kamera takibi
  robot.js        Kıvılcım'ın inşası, çömelme/uzama, dönme, güç halkası
  cape.js         Verlet parçacık tabanlı pelerin fiziği
  world.js        ışıklar, sis, sonsuz zemin, rüzgârlı çim (InstancedMesh + shader)
  platforms.js    4 bahçe objesi, zorluk eğrisi, ekrandan çıkanları silme
  input.js        Pointer Events + Boşluk tuşu
  hud.js          puan, en iyi skor, puan balonları, oyun bitti ekranı
  quality.js      uyarlanabilir kalite: FPS ölçümü ve kademe değiştirme
```

## Ayarlar (`src/config.js`)

Değeri değiştirip sayfayı yenilemen yeterli. Sık kullanılanlar:

| Ayar | Ne yapar |
|---|---|
| `jump.chargeRate` | Basılı tutulan saniye başına zıplama mesafesi |
| `jump.maxDistance` | Zıplama mesafesinin üst sınırı |
| `jump.launchSpeed`, `jump.gravity` | Yayın yüksekliği ve uçuş süresi |
| `landing.centerRatio` | Merkez bölgesinin büyüklüğü |
| `difficulty.*` | Platform boyutu ve aralığının puana göre değişimi |
| `cape.iterations`, `cape.stiffness`, `cape.bendStiffness` | Pelerinin sertliği |
| `cape.airDrag`, `cape.flutter` | Havada savrulma ve dalgalanma |
| `quality.levels` | Kalite kademeleri (pixelRatio, gölge türü, çim oranı), yukarıdan aşağı denenir |
| `quality.targetFps`, `quality.sampleTime` | Hedef kare hızı ve her kademedeki ölçüm süresi |
| `world.grassCount`, `world.grassShadowMobile`, `light.shadowMapSize` | Performans / görsel kalite dengesi |
| `colors.*` | Tüm renkler |

## Pelerin fiziği kısaca

Pelerin 6 × 8 parçacıktan oluşan bir ızgaradır. Her parçacığın şimdiki ve bir
önceki konumu tutulur (Verlet entegrasyonu). Komşular arasındaki mesafe
kısıtları her adımda birkaç tur düzeltilir. Üst sıra robotun omuzlarına
kilitlidir. Hava direnci hızın karesiyle büyüdüğü için pelerin uçarken
güçlü biçimde savrulur, inişte ise birkaç kez salınıp durulur. Gövde ve baş
basit çarpışma şekilleriyle temsil edilir; pelerin robotun içinden geçmez.

## Tarayıcı desteği

Importmap ve WebGL2 destekleyen güncel tarayıcılar: Chrome/Edge 89+,
Firefox 108+, Safari 16.4+ (iOS 16.4+).
