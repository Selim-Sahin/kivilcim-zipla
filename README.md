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
- **Kare kapısı + sabit zaman adımı** — varsayılan olarak en çok 60 FPS çizilir (120 Hz ekranda her kare eşit aralıkla gelir). Oyun mantığı kare hızından bağımsız 1/120 sn'lik adımlarla ilerler; robot, kamera ve pelerin adımlar arasında ara değerlenir. Zıplama her FPS'te birebir aynıdır.
- **Kalite kademeleri** — çözünürlük, gölge ve çim yoğunluğu; sağ üstteki dişliden seçilir (Otomatik / Yüksek / Orta / Düşük). *Şu an otomatik arama kapalı:* ölçümler bozulmasın diye "Otomatik" son kayıtlı kademede sabit kalır.
- **Önceden çizilmiş zemin dokusu** — zemin gürültüsü açılışta bir kez GPU'da dokuya çizilir; her karede yalnızca okunur.
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
- Kare zamanlamasını görmek için adresin sonuna `?fps` ekle: `http://localhost:8000/?fps`. Örnek gösterge:
  ```
  kare 16.7 ms · p90 17.4 · takılma 1/3 sn
  Firefox 133 · ekran 120 Hz · sınır 60
  işlemci 3.1 ms · hedef aralık 16.7 ms
  K3 · 1x · yumuşak gölge · çim %100
  otomatik · 120 Hz · hedef 55 · sabit
  açılış ms: boya 180 · modül 420 · zemin 450 · shader 900 · kare 930
  ```
  - **kare / p90**: son 3 sn'de çizilen karelerin aralığının **ortancası** ve **90. yüzdeliği** (ms). Ortalama FPS düzensizliği gizler: 60 FPS sınırında akıcı bir oyunda ikisi de ~16,7 olmalıdır. p90 ortancadan çok büyükse kareler düzensiz geliyordur.
  - **takılma**: son 3 sn'de hedef aralığın 1,5 katından uzun süren kare sayısı.
  - **ekran**: yenileme hızı. Oyun başladıktan sonra arka planda ölçülür ve kaydedilir; `(kayıtlı)` önceki açılışta ölçülen değerdir, `(ölçülüyor)` henüz bilinmediğini gösterir.
  - **sınır**: kare kapısı (`config.js` → `render.fpsCap`). Denemek için `?fps&cap=120` (120 Hz'e kadar) ya da `?fps&cap=0` (sınırsız).
  - **işlemci**: bir karede JavaScript'in harcadığı süre (oyun mantığı, pelerin fiziği, çizim komutları). Hedef aralığa yakınsa darboğaz işlemcidir ve grafik ayarlarını düşürmek pek işe yaramaz.
  - **K0–K7**: kalite kademesi (`config.js` → `quality.levels`).
  - **açılış ms**: sayfa açılışından itibaren: HTML'in ilk boyanması, modüllerin yüklenmesi, zemin dokusunun çizilmesi, shader derlemesinin bitmesi ve ilk oyun karesi. Aynı satır tarayıcı konsoluna da yazılır.

## Teşhis modu: hangi ayar ne kadar FPS kazandırıyor?

`?fps` adresine aşağıdaki parametreleri ekleyerek ayarları **tek tek** kapatabilirsin.
Bu parametrelerden biri varken otomatik kalite ve dişli menüsü devre dışıdır (gösterge `teşhis` yazar),
böylece ölçtüğün fark yalnızca o ayardan gelir.

| Parametre | Ne yapar |
|---|---|
| `pr=1` | Çözünürlük çarpanı (pixelRatio). `1`, `1.5`, `2` gibi değer alır. Yüksek DPI telefonda en büyük etkili ayar genelde budur. |
| `shadow=off` | Gölgeleri kapatır. `pcf` (sert kenarlı) ve `pcfsoft` (yumuşak, varsayılan) de yazılabilir. |
| `grass=0` | Çimi gizler. `0.5` gibi bir oran da verilebilir. |
| `ground=flat` | Zemini dokusuz, düz renk yapar. `ground=noise` eski yöntemi (her pikselde gürültü hesabı) geri getirir; yeni dokulu zeminle karşılaştırmak için. |

Önerilen ölçüm sırası (her birinde değerlerin oturması için ~10 sn bekle; `kare` ve `p90`'a bak):

1. `…/kivilcim-zipla/?fps&pr=2` (temel ölçüm: en yüksek çözünürlük, diğer her şey açık)
2. `…/kivilcim-zipla/?fps&pr=1`
3. `…/kivilcim-zipla/?fps&pr=2&shadow=off`
4. `…/kivilcim-zipla/?fps&pr=2&grass=0`
5. `…/kivilcim-zipla/?fps&pr=2&ground=flat` ve `…&ground=noise`
6. `…/kivilcim-zipla/?fps&pr=1&shadow=off&grass=0&ground=flat` (her şey kapalı: ulaşılabilecek en yüksek FPS)

Her şey kapalıyken bile kare süresi yüksekse ve **işlemci** süresi de yüksekse sorun grafik değil, JavaScript tarafıdır.
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
  main.js         renderer, sahne, kamera, shader ön-derleme, ana döngü (kare kapısı, sabit adım), service worker kaydı
  game.js         durum makinesi, zıplama yayı, iniş kontrolü, puan, kamera takibi
  robot.js        Kıvılcım'ın inşası, çömelme/uzama, dönme, güç halkası
  cape.js         Verlet parçacık tabanlı pelerin fiziği
  world.js        ışıklar, sis, sonsuz zemin (açılışta dokuya çizilir), rüzgârlı çim (InstancedMesh + shader)
  platforms.js    4 bahçe objesi, zorluk eğrisi, ekrandan çıkanları silme
  input.js        Pointer Events + Boşluk tuşu
  hud.js          puan, en iyi skor, puan balonları, oyun bitti ekranı
  quality.js      kalite kademeleri: arama, histerezisli izleme (şimdilik kapalı), teşhis modu
  perf.js         ?fps göstergesi: kare süresi istatistikleri, açılış ölçümü, ekran Hz
  settings.js     sağ üstteki dişli: Otomatik / Yüksek / Orta / Düşük (localStorage)
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
| `render.fpsCap` | Kare kapısı: 60, 120 ya da 0 (sınırsız) |
| `render.step`, `render.maxSteps` | Oyun mantığının sabit adımı (1/120 sn) ve bir karede en çok adım sayısı |
| `quality.levels` | Kalite kademeleri (pixelRatio, gölge türü, çim oranı), yukarıdan aşağı denenir |
| `quality.presets` | Dişli menüsündeki Yüksek / Orta / Düşük'ün hangi kademeye karşılık geldiği |
| `quality.targetRatio`, `quality.preferHighRefresh` | Hedef FPS = ekran hızı × oran; 120 Hz ekranda önce 120'nin denenip denenmeyeceği |
| `quality.downAfter`, `quality.upAfter`, `quality.cooldown` | Kaç sn düşük/yüksek FPS'ten sonra kademe değişeceği; başarısız yükselişin bekleme süresi |
| `world.groundTexSize`, `world.groundPeriod` | Zemin dokusunun çözünürlüğü ve tekrar genişliği |
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
