# M1.5 Görsel QA & Android Emülatör QA Özeti (`v0.2.0`)

Son güncelleme: **2026-11-16** · Doğrulanan son commit: **`765e9b9`** · Karşılaştırma tabanı (Önce): **`371a147`**

> **Dürüstlük Notu (FPS):** Hem Playwright Headless Chromium hem Android x86_64 KVM Emülatörü **SwiftShader CPU yazılım rasterizasyonu** kullanır. Bu ortamlardaki FPS değerleri **gerçek Android telefon performansını TEMSİL ETMEZ**; yalnızca görsel bütünlük, 20:9 HUD yerleşimi, kamera açıları, dokunmatik giriş, geri tuşu ve çökmesizlik (0 crash/ANR) doğrulaması içindir. Gerçek cihaz FPS ölçümü yalnızca kullanıcının telefonundan **Ayarlar → RAPORU KOPYALA** çıktısını paylaşmasıyla alınacaktır.

---

## 1. Ekran Görüntüsü Erişim Yolu (EK KURAL B Doğrulaması)
- **GitHub Actions Artifact (`gh run download`):** Sandbox ağ izin listesi `productionresultssa8.blob.core.windows.net` hostunu engellediği için `EOF` hatasıyla bloklandı (artifact'lar yine de GitHub arayüzünden indirilebilir olarak yüklenir).
- **Ayrı `qa-screens` Dalı (`git fetch origin qa-screens` + `git archive FETCH_HEAD`):** **Başarılı (1.2 sn).** Aktif çalışma dalı (`arena/868fe0be-aslan`) kirletilmeden ve dal değiştirilmeden 14 Web PNG + 3 Android Emülatör PNG + JSON/logcat raporları salt-okunur çekilip piksel piksel görsel olarak incelendi.

---

## 2. Görsel İnceleme Döngüsü: Bulgu → Düzeltme → Önce / Sonra

| Bulgu | Önce (`371a147`) Görsel / Log Kanıtı | Uygulanan Düzeltme (`765e9b9`) | Sonra (`765e9b9`) Doğrulama |
|---|---|---|---|
| **VQA-01 (Kritik): Yollar görünmüyordu** | `esenler_01_start.png`, `esenler_03_overview.png` ve `fatih_03_overview.png` karelerinde sokaklar çıplak arazi görünüyordu; yol üçgenlerinin sarımı `(a,c,b)/(a,d,c)` aşağı (`-Y`) baktığı için `FrontSide` culling ile %100 gizleniyordu. | `src/render/tileMeshBuilder.ts`: Yol quad üçgen sarımı yukarı (`+Y`) bakan `(a,b,c)/(a,c,d)` yönüne çevrildi, asfalt renkleri ve `yLift` (`0.23..0.48 m`) + `polygonOffset` ayarlandı. | **Doğrulandı:** Tüm 633 Esenler sokağı, ana caddeler, Fatih meydanı ve kırmızı T1 tramvay hattı net asfalt olarak görünüyor. |
| **VQA-02: Gündüz gökyüzü / sis uyumsuzluğu** | Koyu lacivert gökyüzü (`#13254a`) ile çöl sarısı sis (`#d49a74`) keskin kontrast oluşturuyordu; binalar fazla karanlık kalıyordu. | `src/render/RegionWorldScene.ts` + `tileMeshBuilder.ts`: Açık Akdeniz/İstanbul gündüz gökyüzü (`#3a7ec2 → #e6e4d8`), uyumlu ufuk sisi (`#cadfeb`), güneşli cephe/pencere dokusu ve taş/beton zemin tonu uygulandı. | **Doğrulandı:** `esenler_01..03`, `fatih_01..03` karelerinde homojen, okunaklı gündüz atmosferi. |
| **VQA-03: Fatih Dikilitaş kamerayı kapatıyordu** | `fatih_01_start.png` ve `fatih_06_touch_20x9.png` karelerinde Hipodrom Dikilitaş doğrudan oyuncu kamerasının tam ortasını blokluyordu. | `src/render/RegionWorldScene.ts`: Dikilitaş Hipodrom ekseninde `(-16, -22) m` kaydırıldı. | **Doğrulandı:** `fatih_01_start.png` karesinde 6 minareli Sultanahmet Camii ve 4 minareli Ayasofya engelsiz görünüyor. |
| **VQA-04: Taksi eğim & karakter kontrastı** | Esenler dik yokuşunda taksinin sağ tekeri eğime gömülüyordu; oyuncu karakteri koyu siyah silüetti. | `src/render/RegionWorldScene.ts`: 4-noktalı DEM yükseklik örneklemesiyle taksi eğim (pitch + roll) hizalaması, sarı tavan + mavi cam kabin ve lacivert ceketli karakter eklendi. | **Doğrulandı:** `esenler_01_start.png` ve `esenler_07_driving_20x9.png` karelerinde taksi yokuşa tam oturuyor. |
| **VQA-05 (HUD): 20:9 Tanılama modalı taşması** | `esenler_08_diagnostics_20x9.png` (`880×396`): Otomatik HUD denetimi `Button "RAPORU KOPYALA" clips outside viewport; Button "Kapat" clips outside viewport` uyarısı verdi. | `src/ui/HudOverlay.ts` + `src/styles.css`: `RAPORU KOPYALA` ve `Kapat` butonları üst başlık satırına alındı; 20:9 kısa ekranlarda 4 sütunlu kompakt tanılama ızgarası uygulandı. | **Doğrulandı:** `HUD warnings: 0` (14/14 temiz); tüm düğmeler `880×396` ekranda kaydırma olmadan görünür ve dokunulabilir. |
| **VQA-06 (Android): Sol çentik beyaz şerit, sistem uyarısı ve dokunmatik UI** | `emulator_01..03`: Sol kamera çentiğinde 128 px beyaz şerit vardı, Android'in `"Viewing full screen [Got it]"` sistem uyarısı girişi engelliyordu ve `detectTouchUi()` emülatörde `false` dönüp joystiği gizliyordu. | `MainActivity.java` (`LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS` + `#0D1324` arka plan), `values/styles.xml` + `values-v28/styles.xml`, `src/main.ts` (`Capacitor.isNativePlatform()` kontrolü), `scripts/android-emulator-qa.sh` (`immersive_mode_confirmations confirmed`). | **Doğrulandı:** Beyaz şerit %100 kalktı, sistem uyarısı kalktı, joystick + `BİN` + `KOŞ` göründü; joystick kaydırmasıyla oyuncu `0 m → 5 m` yürüdü ve Geri tuşu `Duraklatıldı` menüsünü açtı. |

---

## 3. Son Doğrulanan 14 Web Playwright Çekimi (`765e9b9` · `qa-screens:web/`)

- **Toplam çekim:** 14 · **Konsol hatası:** `0` · **HUD taşma/çakışma uyarısı:** `0`
- **Görsel regresyon eşiği (`>6%`):** Aktif olarak çalıştı (`765e9b9` büyük yol/gökyüzü/modal iyileştirmesi olduğu için 14/14 karede beklenen yüksek piksel değişimi `25.91%..96.1%` uyarısı üreterek regresyon dedektörünün çalıştığını doğruladı ve `qa-screens` yeni referans olarak güncellendi).

| Dosya | Bölge | Görünüm | Boyut | Draw / Tris | Karo / Bina | Renk | HUD |
|---|---|---|---|---|---|---|---|
| `esenler_01_start.png` | `esenler-namik-kemal` | Başlangıç (3. Şahıs) | 1280×720 | 60 / 67,403 | 9 / 2,414 | 594 | ✓ |
| `esenler_02_street.png` | `esenler-namik-kemal` | Sokak Seviyesi | 1280×720 | 60 / 67,403 | 9 / 2,414 | 654 | ✓ |
| `esenler_03_overview.png` | `esenler-namik-kemal` | Geniş Görünüm | 1280×720 | 67 / 69,943 | 9 / 2,414 | 972 | ✓ |
| `esenler_04_night.png` | `esenler-namik-kemal` | Gece Modu | 1280×720 | 60 / 67,403 | 9 / 2,414 | 973 | ✓ |
| `esenler_05_lite.png` | `esenler-namik-kemal` | Lite Modu | 1280×720 | 50 / 39,872 | 9 / 2,414 | 486 | ✓ |
| `esenler_06_touch_20x9.png` | `esenler-namik-kemal` | 20:9 Yatay Dokunmatik | 880×396 | 60 / 67,403 | 9 / 2,414 | 560 | ✓ |
| `esenler_07_driving_20x9.png` | `esenler-namik-kemal` | 20:9 Sürüş Modu (Sarı Taksi) | 880×396 | 55 / 66,743 | 9 / 2,414 | 517 | ✓ |
| `esenler_08_diagnostics_20x9.png` | `esenler-namik-kemal` | 20:9 Tanılama Paneli (Ayarlar) | 880×396 | 60 / 67,403 | 9 / 2,414 | 501 | ✓ |
| `fatih_01_start.png` | `fatih-sultanahmet-eminonu` | Başlangıç (3. Şahıs) | 1280×720 | 74 / 57,736 | 9 / 1,382 | 655 | ✓ |
| `fatih_02_street.png` | `fatih-sultanahmet-eminonu` | Sokak Seviyesi | 1280×720 | 76 / 57,784 | 9 / 1,382 | 636 | ✓ |
| `fatih_03_overview.png` | `fatih-sultanahmet-eminonu` | Geniş Görünüm | 1280×720 | 49 / 56,580 | 9 / 1,382 | 897 | ✓ |
| `fatih_04_night.png` | `fatih-sultanahmet-eminonu` | Gece Modu | 1280×720 | 76 / 57,784 | 9 / 1,382 | 796 | ✓ |
| `fatih_05_lite.png` | `fatih-sultanahmet-eminonu` | Lite Modu | 1280×720 | 65 / 40,753 | 9 / 1,382 | 504 | ✓ |
| `fatih_06_touch_20x9.png` | `fatih-sultanahmet-eminonu` | 20:9 Yatay Dokunmatik | 880×396 | 76 / 57,784 | 9 / 1,382 | 611 | ✓ |

---

## 4. Android x86_64 KVM Emülatör QA (`765e9b9` · `qa-screens:android/`)

- **Profil:** Pixel 6, Android API 34 (`x86_64`, `google_apis`, `-gpu swiftshader_indirect`), WebView `113.0.5672.136`
- **Sonuç:** `2400×1080` yatay (`sensorLandscape`) doğrulandı · `FATAL EXCEPTION: 0` · `ANR: 0` · `Chromium ERROR: 0` · `glError: 0` · `appAliveAfterBack: true`
- **Çekimler:**
  1. `emulator_01_launch.png` — Esenler başlangıç, `Karo: 9`, `Bina: 2414`, `Çizim: 50`, sol joystick + sağ `BİN`/`KOŞ` butonları tam ekranda ve çentik temiz.
  2. `emulator_02_after_joystick.png` — `adb shell input swipe` ile sanal joystick sürüklendi; konum göstergesi `0 m → 5 m` ilerledi ve `Capacitor/Preferences` kaydı `(44.14, 46.54, -33.93)` olarak güncellendi.
  3. `emulator_03_pause_back.png` — Donanım Geri tuşu (`keyevent 4`) uygulamadan çıkmadı, `Duraklatıldı` menüsünü (Esenler + Fatih bölge seçici ve 10 mahalle noktası) eksiksiz açtı.
- **Bilinen Emülatör Sınırı (`EMU-001`):** API 34 stok WebView 113 + `-gpu swiftshader_indirect` ortamında WebGL komutları hatasız çalışsa da (`glError: 0`, `Çizim: 50`) emülatör SurfaceTexture kompozitörü 3B tuvali koyu göstermektedir; 3B sahne görsel doğrulaması Playwright Chromium 159 SwiftShader Vulkan (14 çekim) ile yapılmakta, gerçek telefon WebGL doğrulaması kullanıcı APK testiyle (`RAPORU KOPYALA`) tamamlanacaktır.
