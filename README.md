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
- **Sahte gölgeler** — gerçek gölge (shadow map) yerine: robotun altında yumuşak bir leke (havadayken iniş noktasını gösterir), platformların yanında güneş yönüne uzanan, açılışta bir kez kodla çizilen yarı saydam gölge çıkartmaları. Gerçek gölge yalnızca bilgisayarda, menüdeki **Ultra** seçeneğinde açılır.
- **Lambert malzemeler** — robot, pelerin ve platformlarda ucuz dağınık ışık modeli; robotun sabit parçaları malzemeye göre tek geometride birleştirilir (daha az çizim çağrısı).
- **localStorage** — en yüksek skoru saklar.
- **PWA (manifest + service worker)** — ana ekrana eklenebilir; ikinci açılış önbellekten gelir, çevrimdışı çalışır.
- **Kare kapısı + sabit zaman adımı** — varsayılan olarak en çok 60 FPS çizilir (120 Hz ekranda her kare eşit aralıkla gelir). Oyun mantığı kare hızından bağımsız 1/120 sn'lik adımlarla ilerler; robot, kamera ve pelerin adımlar arasında ara değerlenir. Zıplama her FPS'te birebir aynıdır.
- **Dinamik çözünürlük** — sağ üstteki dişliden: **Otomatik** · **Pil dostu** (60 FPS, 1.0×, seyrek çim) · **Yüksek** · **Ultra** (gerçek gölge, yalnızca bilgisayarda) ve ayrı bir **Kare hızı: 60 / 120** seçimi. Otomatik kipte oyun sırasında *yalnızca* çözünürlük ölçeği (1.0–2.0×, 0.1 adımlarla, cihazın DPR'ını geçmeden) değişir; shader derlemesi gerektiren hiçbir şey kendiliğinden değişmez. Karar son 3 sn'deki kare yükünün 90. yüzdeliğine göre verilir; sonuç cihazda saklanır, sonraki açılış oradan başlar. Çim ve gölge yalnızca menüden değişir (kısa bir "Ayarlanıyor…" perdesiyle). Kenar yumuşatma her zaman açık.
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
  hedef 16.7 ms (60 FPS) · kare p50 16.7 · p90 17.4 ms
  takılma 1/3 sn · işlemci 3.1 ms · GPU yok
  otomatik · ölçek 1.6× (1–2) · pay var 4/10 sn
  sahte gölge · çim %100
  yük p50 5.2 · p90 7.9 ms
  son karar: yük yüksek
  Firefox 133 · ekran 120 Hz
  açılış ms: boya 180 · modül 420 · zemin 450 · shader 900 · kare 930
  ```
  - **hedef**: kare kapısından gelen hedef kare aralığı (60 → 16,7 ms; 120 → 8,3 ms).
  - **kare p50 / p90**: son 3 sn'de çizilen karelerin aralığının **ortancası** ve **90. yüzdeliği** (ms). 60 FPS'te akıcı bir oyunda ikisi de ~16,7 olmalıdır; p90 ortancadan çok büyükse kareler düzensiz geliyordur.
  - **takılma**: son 3 sn'de hedef aralığın 1,5 katından uzun süren kare sayısı.
  - **işlemci / GPU**: bir karede JavaScript'in (oyun mantığı, pelerin, çizim komutları) ve ekran kartının harcadığı süre. GPU süresi yalnızca tarayıcı `EXT_disjoint_timer_query_webgl2`'yi veriyorsa görünür (Firefox'ta genelde `yok`).
  - **ölçek**: çözünürlük çarpanı ve izin verilen aralık; salınım görülüp tavan düşürüldüyse `tavan 1.6` gibi yazar. Ardından durum: `bekliyor` (değişiklikten sonraki 2 sn), `ölçülüyor` (3 sn'lik pencere doluyor), `dengede`, `pay var 4/10 sn` (10 sn dolarsa bir adım çıkılır).
  - **yük p50 / p90**: dinamik çözünürlüğün karar ölçüsü. Zamanında gelen karede karenin işi (işlemci, varsa GPU süresiyle), geciken karede kare aralığının kendisi. (Kare kapısı 60'tayken aralık hep ~16,7 ms'dir; ne kadar pay kaldığını yalnız iş süresi gösterir.)
  - **ekran**: yenileme hızı. Oyun başladıktan sonra arka planda ölçülür ve kaydedilir; `(kayıtlı)` önceki açılışta ölçülen değerdir, `(ölçülüyor)` henüz bilinmediğini gösterir.
  - **açılış ms**: sayfa açılışından itibaren: HTML'in ilk boyanması, modüllerin yüklenmesi, zemin dokusunun çizilmesi, shader derlemesinin bitmesi ve ilk oyun karesi. Aynı satır tarayıcı konsoluna da yazılır.

## Teşhis modu: hangi ayar ne kadar FPS kazandırıyor?

`?fps` adresine aşağıdaki parametreleri ekleyerek ayarları **tek tek** kapatabilirsin.
Bu parametrelerden biri varken dinamik çözünürlük ve dişli menüsü devre dışıdır (gösterge `teşhis` yazar),
böylece ölçtüğün fark yalnızca o ayardan gelir.

| Parametre | Ne yapar |
|---|---|
| `pr=1` | Çözünürlük çarpanı (pixelRatio). `1`, `1.5`, `2` gibi değer alır. Yüksek DPI telefonda en büyük etkili ayar genelde budur. |
| `shadow=pcf` | Gerçek gölgeyi açar (sahte gölgeler gizlenir); telefonda gerçek gölgenin maliyetini ölçmek için. `pcfsoft` (yumuşak kenar) ve `off` (sahte gölge, varsayılan) de yazılabilir. |
| `grass=0` | Çimi gizler. `0.5` gibi bir oran da verilebilir. |
| `cap=120` | Kare kapısını sabitler (`60`, `120` ya da `0` = sınırsız). Tek başına teşhis kipini açmaz: Otomatik kipte çözünürlük yine değişir, yalnızca kare hızı sabit kalır. |
| `ground=flat` | Zemini dokusuz, düz renk yapar. `ground=noise` eski yöntemi (her pikselde gürültü hesabı) geri getirir; yeni dokulu zeminle karşılaştırmak için. |

Önerilen ölçüm sırası (her birinde değerlerin oturması için ~10 sn bekle; `kare` ve `p90`'a bak):

1. `…/kivilcim-zipla/?fps&pr=2` (temel ölçüm: en yüksek çözünürlük, diğer her şey açık)
2. `…/kivilcim-zipla/?fps&pr=1`
3. `…/kivilcim-zipla/?fps&pr=2&shadow=pcf` (gerçek gölge ne kadar pahalı?)
4. `…/kivilcim-zipla/?fps&pr=2&grass=0`
5. `…/kivilcim-zipla/?fps&pr=2&ground=flat` ve `…&ground=noise`
6. `…/kivilcim-zipla/?fps&pr=1&shadow=off&grass=0&ground=flat` (her şey kapalı: ulaşılabilecek en yüksek FPS)

Her şey kapalıyken bile kare süresi yüksekse ve **işlemci** süresi de yüksekse sorun grafik değil, JavaScript tarafıdır.

## Dinamik çözünürlük nasıl karar verir?

Yalnızca **Otomatik** kipte çalışır (`src/quality.js` → `ScaleController`):

1. Her çizilen karede bir *yük* örneği alınır (yukarıdaki `yük`). Karar ölçüsü son 3 sn'nin **p90**'ıdır.
2. p90 > hedef × 1,15 → ölçek bir adım (0.1) iner.
3. p90 < hedef × 0,7 ve bu 10 sn sürerse → bir adım çıkar.
4. Her değişiklikten sonra 2 sn beklenir ve ölçüm sıfırlanır.
5. Daha önce yukarı çıkılan bir değere **ikinci kez geri düşülürse** tavan orada sabitlenir: sistem aynı iki değer arasında gidip gelemez.
6. 120 Hz ekranda kare hızı 60 ile başlar. Ölçek en üstteyken (2.0× ya da cihazın DPR'ı) p90 10 sn boyunca 7 ms'nin altındaysa 120 denenir; 120'de inmek gerekirse 60'a dönülür ve o oturumda 120 bir daha denenmez. Menüde kare hızı 60 seçiliyse 120 hiç denenmez.
7. Sonuç (ölçek, kare hızı) `localStorage`'a yazılır; sonraki açılış oradan başlar. Kayıt yoksa telefon 1.5×, bilgisayar en yüksek ölçekle başlar.

Kararlar tarayıcı konsoluna da yazılır (`[Kıvılcım] ölçek 1.5× · 60 FPS — yük yüksek`).

**Simülasyon:** `tools/dinamik-sim.html` aynı `ScaleController` sınıfını yapay kare süreleriyle çalıştırır (her kareye ±%40 gürültü). Yerel sunucu açıkken <http://localhost:8000/tools/dinamik-sim.html> adresinde senaryoları, ölçeğin zamanla değişimini ve 150'şer rastgele cihazla salınım istatistiğini gösterir.
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
  dinamik-sim.html  dinamik çözünürlük kararlarının simülasyonu (tarayıcıda açılır)
src/
  config.js       TÜM ayarlanabilir değerler (zıplama, yerçekimi, pelerin, zorluk, renkler…)
  main.js         renderer, sahne, kamera, shader ön-derleme, ana döngü (kare kapısı, sabit adım), service worker kaydı
  game.js         durum makinesi, zıplama yayı, iniş kontrolü, puan, kamera takibi
  robot.js        Kıvılcım'ın inşası, çömelme/uzama, dönme, güç halkası
  cape.js         Verlet parçacık tabanlı pelerin fiziği
  shadows.js      sahte gölgeler: robot lekesi, platform gölge çıkartmaları
  world.js        ışıklar, sis, sonsuz zemin (açılışta dokuya çizilir), rüzgârlı çim (InstancedMesh + shader)
  platforms.js    4 bahçe objesi, zorluk eğrisi, ekrandan çıkanları silme
  input.js        Pointer Events + Boşluk tuşu
  hud.js          puan, en iyi skor, puan balonları, oyun bitti ekranı
  quality.js      menü kipleri, dinamik çözünürlük (ScaleController), teşhis modu
  perf.js         ?fps göstergesi: kare süresi istatistikleri, açılış ölçümü, ekran Hz
  settings.js     sağ üstteki dişli (kip + kare hızı, localStorage), "Ayarlanıyor…" perdesi
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
| `render.fpsCap` | Teşhis kipindeki kare kapısı (oyunda kare hızını menü ve Otomatik kip belirler) |
| `render.step`, `render.maxSteps` | Oyun mantığının sabit adımı (1/120 sn) ve bir karede en çok adım sayısı |
| `quality.modes` | Menü kiplerinin ayarları: ölçek, çim oranı, gölge türü, sabit kare hızı |
| `quality.minScale`, `quality.maxScale`, `quality.scaleStep` | Dinamik çözünürlük aralığı ve adımı (1.0–2.0, 0.1) |
| `quality.downRatio`, `quality.upRatio`, `quality.upHold`, `quality.settle`, `quality.window` | İnme/çıkma eşikleri (hedefin 1,15 ve 0,7 katı), çıkmak için bekleme (10 sn), değişiklik sonrası bekleme (2 sn), ölçüm penceresi (3 sn) |
| `quality.highRateP90` | En yüksek ölçekte p90 bunun altındaysa (7 ms) 120 FPS denenir |
| `render.mobilePixelRatio` | Telefonda Otomatik kipin başlangıç ölçeği (1,5; kayıtlı sonuç yoksa) |
| `shadows.*` | Sahte gölgelerin rengi, saydamlığı, robot lekesinin boyu ve solması, platform gölgesinin yumuşaklığı |
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
