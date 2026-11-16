# KNOWN_ISSUES.md — Bilinen Hatalar, Engeller ve Riskler

Son güncelleme: **2026-11-16**

## Aktif Engeller / Ortam Kısıtları
| ID | Önem | Açıklama | Etki & Geçici Çözüm |
|---|---|---|---|
| ENV-001 | Orta | Sandbox ortamında Java/Android SDK kurulu değil. | APK/AAB derlemesi ve `aapt2` API 36 doğrulaması **GitHub Actions (`android.yml`)** üzerinde koşar (yeşil doğrulandı). |
| ENV-002 | Orta | Sandbox ağ izin listesi Playwright Chromium, Overpass API, AWS S3 ve GitHub Actions ham log indirme hostunu engelliyor. | Playwright smoke (`ci.yml`) ve gerçek Fatih veri hasadı (`fetch-fatih-data.yml`) **GitHub Actions**'ta çalışır; sonuçlar commit yorumu ve GitHub Release üzerinden doğrulanır. |
| ENV-003 | Düşük | Sandbox GitHub token'ı `gh issue create` yapabiliyor ancak `gh issue close` çağrısında `Resource not accessible by integration` dönüyor. | Aşama tamamlanma durumu `docs/memory/PROGRESS.md` dosyasında takip edilir; kullanıcı isterse `#1` (`[M0]`) ve `#2` (`[M1]`) issue'larını GitHub arayüzünden kapatabilir. |
| PERF-001 | İzleniyor | Henüz gerçek Android cihazda FPS, soğuk başlangıç süresi ve RAM ölçümü yapılmadı. | Kullanıcı `v0.1.0-m1` APK'sını telefonda test edip geri bildirim verecek; **tahmini FPS yazılmaz.** |
| PERF-002 | İzleniyor | 10 dakikalık uzun soak testi (`scripts/soak.mjs`) henüz çalıştırılmadı. | M2 ile birlikte CI'da (veya manuel workflow dispatch ile) 10 dk soak doğrulaması koşulacak. |
| DATA-001 | Düşük | Copernicus DEM GLO-30 bir DSM (yüzey modeli) olduğundan yoğun bina çatılarında yerel yükseklik 5–12 m yukarı kayabilir (ör. Eminönü iskelesi civarı 37 m okuyabiliyor). | M2/M4'te kıyı hattı (`water` + `pier`) yakınında yumuşak deniz seviyesi düşümü (coastal flattening) uygulanarak rıhtım gerçek 1–2 m kotuna indirilecek. |
| BIZ-001 | Yüksek | Kullanıcının bütçesi şu an 0 TL; Google Play 25 USD kayıt ücreti gerektiriyor. | Ücretsiz dağıtım kanalları (GitHub Releases APK + GitHub Pages web demo + itch.io) hazır; `docs/USER_TASKS.md` en üstte açıkça belirtildi. |

## Çözülmüş Hatalar
| ID | Tarih | Açıklama & Kök Neden | Çözüm |
|---|---|---|---|
| FIX-001 | 2026-11-16 | `android.yml` adım içi `if: secrets.*` sözdizimi GitHub Actions tarafından reddedildi. | Gizli anahtarlar step `env:` alanına alınıp bash içinde kontrol edildi (`1c385cd`). |
| FIX-002 | 2026-11-16 | `android-actions/setup-android@v3` Step 5 hatası verdi. | Ubuntu runner'daki kurulu `$ANDROID_HOME` + `sdkmanager` doğrudan kullanıldı (`34c7b6c`). |
| FIX-003 | 2026-11-16 | Android build-tools 36 `aapt2 dump xmltree`, `screenOrientation=6` (ondalık) bastığı için hex regex başarısız oldu. | Regex `0x0*6\|sensorLandscape\|=6([^0-9]\|$)` olarak düzeltildi (`29e708f`). |
| FIX-004 | 2026-11-16 | M1 OSM regex eşleşmesi `ayasofya` için ilk olarak Küçük Ayasofya Camii'ni (`41.0030, 28.9729`) eşleştirdi. | `scripts/build-fatih-region.mjs` içine 150 m tohum koordinat yakınlık filtresi eklendi; `fetch-fatih-data.yml` (`43949962553`) yeniden çalıştırılarak gerçek Ayasofya-i Kebir (`28.979836, 41.008599`) doğrulandı (`9a92d05`). |
