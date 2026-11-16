# DECISIONS.md — Mimari ve Politika Kararları (ADR)

Her önemli teknik, ürün veya politika kararı burada tarih ve kanıtla kayıt altına alınır.

---

### ADR-001 — Capacitor 8.6.2 Kullanımı (Android 16 / API 36 Zorunluluğu)
- **Tarih:** 2026-11-16 | **Durum:** Kabul edildi
- **Bağlam:** Google Play, 31 Ağustos 2026 itibarıyla tüm yeni uygulama ve güncellemeler için **Android 16 (API 36)** hedefini zorunlu kıldı (istisna uzatması 1 Kasım 2026'da sona erdi). Resmî Capacitor dokümantasyonuna göre Capacitor 7 yalnızca API 35'i destekler; özel `targetSdkVersion` yükseltmesi desteklenmez.
- **Karar:** Doğrudan **Capacitor 8.6.2** (`compileSdkVersion = 36`, `targetSdkVersion = 36`, `minSdkVersion = 24`, Gradle 8.14.3, AGP 8.13, JDK 21) ile başlanır. Android 16'da edge-to-edge zorunlu olduğundan tüm HUD elemanları `env(safe-area-inset-*)` kullanır; geri tuşu Capacitor App eklentisi + AndroidX `OnBackPressedDispatcher` ile duraklatma menüsüne bağlanır.

### ADR-002 — Çekirdek Yığın Sürüm Sabitleme
- **Tarih:** 2026-11-16 | **Durum:** Kabul edildi
- **Bağlam:** `npm` üzerinde `typescript@7.0.2` yayınlanmış durumda ancak `typescript-eslint@8.73.0` peer dependency olarak `typescript >=4.8.4 <6.1.0` istiyor.
- **Karar:** Uyumluluk ve kararlılık için `package.json`'da sabit sürümler:
  - `three@0.187.0`, `@types/three@0.187.0`
  - `@dimforge/rapier3d-compat@0.21.0`
  - `vite@7.3.8`, `vitest@5.1.0`, `typescript@5.9.3`
  - `eslint@10.15.0` + `typescript-eslint@8.73.0`
  - `@capacitor/*@8.x`
- **Sonuç:** Sıfır `--legacy-peer-deps` gereksinimi, temiz CI kurulumu.

### ADR-003 — Google Play Politikaları Doğrulaması (16 Kasım 2026)
- **Tarih:** 2026-11-16 | **Durum:** Doğrulandı
- **Bulgular (GENESIS Bölüm 3 karşılaştırması):**
  1. **Hedef API 36 (Android 16):** Doğrulandı — 31 Ağustos 2026'dan beri zorunlu.
  2. **Play Billing Library 8.0.0+:** Doğrulandı — 31 Ağustos 2026'dan beri zorunlu (uzatma 1 Kasım 2026'da bitti).
  3. **Kapalı Test (12 testçi × 14 gün):** Doğrulandı — 13 Kasım 2023 sonrası kişisel hesaplar için zorunlu. **2026 farkı:** Google artık testçilerin uygulamayı gerçekten açıp kullandığına (engagement) bakıyor. Bu nedenle `USER_TASKS.md`'de 18–20 gerçek testçi hedefi önerildi.
  4. **Kayıt Ücreti & Türkiye Satıcı:** 25 USD tek seferlik ücret ve Türkiye satıcı (TRY) desteği doğrulandı.
  5. **AAB Boyut Sınırı (Güncelleme):** Google Play'in sıkıştırılmış taban indirme uyarısı/sınırı 150 MB'tan **200 MB**'a çıktı (200 MB üstü mobil veri uyarı penceresi ve/veya Play Asset Delivery gerektirir; toplam tavan 4 GB). Biz indirme dönüşümü için hedefimizi yine de **< 150 MB** tutuyoruz.
  6. **Mağaza Görselleri:** İkon `512×512` (32-bit PNG, alfa serbest, promosyon metni yasak), öne çıkan görsel `1024×500` (JPEG veya 24-bit PNG, **alfa kanalı YASAK**, <1 MB), telefon ekran görüntüleri 2–8 adet (min 320 px, maks 3840 px, maks 2:1 oran, alfa yasak).

### ADR-004 — Referans Repoların Doğrulanması (GENESIS Bölüm 5)
- **Tarih:** 2026-11-16 | **Durum:** Doğrulandı
- **Bulgular (`gh api` + shallow clone):**
  - `depixeled-chris/gta7` — **MIT**, aktif (2026-06-01), commit `bd5ee61af4759881c235077605d33be9342108e8` → Ana mimari & kontrol/test referansı.
  - `yz4git/next-gen` (WorldSeed) — **MIT**, aktif (2026-10-25), commit `20f5831c4dbaabc8782766d0c36f505d899336e0` → M1 coğrafi veri hattı referansı.
  - `bridge-mind/leonida` — **MIT**, aktif (2026-09-02), commit `c09af18f0a19145930cfb7654498c3ae5e9cba91` → Yalnızca sistem izolasyonu mimari referansı (GTA VI fan içeriği KESİNLİKLE alınmaz).
  - `cartesiancs/map3d` — **MIT**, aktif (2026-11-07), 2693 yıldız → Yedek OSM→3B referans.
  - `YusufEminoglu/osm2threejs` — **HTTP 404 (Bulunamadı)** → Listeden çıkarıldı.
  - `Faizankhan17623/Gta-Clone` → `Faizankhan17623/OpenCity` adresine yönleniyor, **LİSANS YOK (`NONE`)** → Kod kopyalama kesinlikle yasak.

### ADR-005 — Gelir Eklentileri Ön Seçimi (M5 İçin)
- **Tarih:** 2026-11-16 | **Durum:** Önerildi (M5'te pinlenecek)
- **Reklam:** `@capacitor-community/admob` `^8.2.1` (MIT, ücretsiz, Capacitor 8.5+ uyumlu, Ekim 2026 aktif bakım).
- **Uygulama İçi Satın Alma (IAP):** `capacitor-plugin-cdv-purchase` `^13.19.1` (MIT, ücretsiz, native Capacitor 8 köprüsü + Play Billing Library 8 desteği) veya `@spruik/capacitor-iap` (MIT, Capacitor 8). M5'te gerçek Gradle derlemesiyle PBL 8.0.0+ çözümlemesi (`com.android.billingclient:billing:8.+`) doğrulanarak eklenecek. M0–M4 arasında faturalandırma/reklam izinleri APK'ya eklenmez (temiz derleme).

### ADR-006 — İstanbul Coğrafi Veri Kaynakları Doğrulaması (M1 İçin)
- **Tarih:** 2026-11-16 | **Durum:** Doğrulandı
- **Copernicus DEM GLO-30:** AWS açık veri (`s3://copernicus-dem-30m`) genel erişime açık; İstanbul karoları (`N41 E028` / `N41 E029`) dâhil. DSM (bina/ağaç üstü yüzey) olduğu için M1'de yumuşatma/bina tabanı düzleştirme uygulanacak.
- **İBB Açık Veri Portalı (`data.ibb.gov.tr`):** İBB Açık Veri Lisansı ile deniz ulaşımı iskele vektörleri, ulaşım yolları, parklar ve mahalle bazlı bina istatistikleri (CSV) mevcut; ancak indirilebilir 3B kent bina mesh modeli bulunmuyor.
- **Karar:** M1'de ana 3B bina + yol kaynağı **OSM + Overture Maps**, arazi yüksekliği **Copernicus DEM GLO-30**, durak/vapur iskele/park zenginleştirmesi **İBB Açık Veri Portalı** olacak. Sandbox dışı ağ kısıtı nedeniyle veri indirimi M1'de GitHub Actions `workflow_dispatch` üzerinden yapılıp offline tile olarak paketlenecek.

### ADR-007 — Sandbox / CI Doğrulama Bölüşümü
- **Tarih:** 2026-11-16 | **Durum:** Kabul edildi
- **Bağlam:** Çalışma sandbox'ında JDK/Android SDK yok ve Playwright tarayıcı indirme CDN'i ağ izin listesi dışında.
- **Karar:**
  - **Sandbox:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npx cap sync android`, canlı Vite önizlemesi.
  - **GitHub Actions:** `ci.yml` (Playwright headless Chromium smoke testi + SwiftShader WebGL + ekran görüntüsü doğrulaması) ve `android.yml` (JDK 21 + Android SDK API 36 + Gradle APK/AAB derleme + `aapt2` manifest/targetSdk doğrulaması).
  - Hiçbir aşama CI'da yeşil görülmeden "bitti" ilan edilmez.

### ADR-008 — Çalışma Adı Uygunluğu ("Istanbul Streets")
- **Tarih:** 2026-11-16 | **Durum:** Kabul edildi (M6 öncesi tekrar kontrol edilecek)
- **Bulgu:** Web aramasında Google Play, Steam ve itch.io'da "Istanbul Streets" adında çakışan bir açık dünya suç oyunu bulunmadı (sadece *Istanbul: The Digital Edition* kutu oyunu ve *Streets of Istanbul Field Recordings* ses paketi mevcut). Çalışma adı **"Istanbul Streets"** olarak korunur; yedek ad **"Boğaz Suçu"** saklı tutulur.

### ADR-009 — Esenler / Namık Kemal Varsayılan Bölge, ODbL 1.0 Türetilmiş Veri Ayrımı, Otomatik İbadethane Güvenli Alanları ve M1.5 QA Hattı
- **Tarih:** 2026-11-16 | **Durum:** Kabul edildi
- **Bağlam:** `docs/prompts/CONTINUE.md` gereğince başlangıç bölgesi **Esenler / Namık Kemal Mahallesi** olarak güncellenirken Fatih'in korunması, kullanıcının sağladığı `v1.1-esenler-data/osm_data.zip` paketinin SHA-256 doğrulamalı çevrimdışı boru hattından geçirilmesi, ODbL 1.0 yükümlülüklerinin temiz yönetilmesi, tüm ibadethanelerin otomatik Güvenli Alan olması, M1.5 görsel + Android emülatör QA kurulması ve kullanıcının yalnızca Android telefonu olması sebebiyle tüm rehberlerin %100 telefondan uygulanabilir kılınması gerekiyor.
- **Kararlar:**
  1. **Çoklu Bölge Kayıt Defteri (`src/core/world/regions.ts`):** `esenler-namik-kemal` varsayılan başlangıç bölgesi (`DEFAULT_REGION_ID`), `fatih-sultanahmet-eminonu` ikinci bölge olarak kayıtlıdır; Duraklat menüsünden çalışma zamanında geçiş yapılır.
  2. **SHA-256 Doğrulamalı Esenler Veri Hattı (`.github/workflows/fetch-esenler-data.yml` + `scripts/build-esenler-region.py`):** `osm_data.zip` (`886,185` bayt, SHA-256 `8849228b90c2ac807e707bfc91e1b6d0bddb40107afb4962951b20654f621fff`) GitHub Actions'ta indirilir, hash eşleşmezse build başarısız olur; eksik yükseklik ve POI katmanları Copernicus DEM GLO-30 (`N41 E028`) + Overpass ile tamamlanıp 300 m offline karolara (1.9 MB, 44 karo, 4,474 bina, 633 tekilleştirilmiş yol, 1,922 düğüm / 2,164 kenar) derlenir.
  3. **ODbL 1.0 Türetilmiş Veri Ayrımı & Paylaşım Politikası:** OpenStreetMap ODbL 1.0 uyarınca OSM tabanlı tüm türetilmiş harita/karo verileri kaynak koddan ayrı olarak **`public/derived-data/`** klasöründe tutulur ve **`public/derived-data/LICENSE-ODbL.md`** lisans bildirimiyle birlikte sunulur. Oyun motoru kaynak kodu, kurgusal hikâye/görevler ve orijinal 3B/UI varlıkları ODbL kapsamındaki *Produced Work* tarafında ayrıdır; `public/derived-data/` içindeki türetilmiş coğrafi karolar (Derivative Database) herkese açık repoda ODbL 1.0 altında paylaşılmaya devam eder. Atıf metinleri oyun içi **Hakkında** ekranı, `README.md` ve `docs/memory/CREDITS.md` içinde yer alır.
  4. **Kişisel Veri / Marka Hijyeni & Otomatik Güvenli Alan:** Esenler POI'leri (bakkal, çay ocağı, okul, park, pazar yeri) anonim mahalle noktalarına dönüştürülür; gerçek kişi adı, ev adresi veya ticari marka/logo kullanılmaz. OSM `amenity=place_of_worship` kayıtlarının tamamı otomatik olarak şiddet/silah kilitli **Güvenli Alan** (Esenler'de 10 cami/ibadethane + Fatih'te Ayasofya, Sultanahmet Camii, Yeni Cami) olarak üretilir.
  5. **M1.5 Çift Yayınlı QA Hattı (`qa-screens` Dalı + Artifacts):** Sandbox `blob.core.windows.net` artifact CDN'ine erişemediği için hem `ci.yml` (14 Playwright PNG + `qa-summary.md` + `soak-report.json`) hem `android-qa.yml` (x86_64 KVM emülatör PNG + `logcat-app.txt` + `emulator-report.json`) çıktılarını hem Artifact olarak yükler hem de ayrı `qa-screens` dalındaki `web/` ve `android/` klasörlerini temizleyerek günceller. Piksel regresyon farkı `%6` eşiği aşarsa CI uyarısı üretilir.
  6. **%100 Telefondan Kullanıcı Akışı (`docs/USER_TASKS.md`):** Tüm kullanıcı adımları sıfır bilgisayar varsayımıyla Chrome "Masaüstü sitesi" ve F-Droid Termux (`openjdk-17` + `keytool`) kopyala-yapıştır komutlarıyla yeniden yazılır. Gerçek cihaz FPS/RAM verisi yalnızca kullanıcının oyun içi **Ayarlar → RAPORU KOPYALA** JSON çıktısını sohbete yapıştırmasıyla ölçülür.

