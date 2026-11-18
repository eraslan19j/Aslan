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

---

### ADR-010 — Kesin 2B Çokgen Bina Çarpışması, Vertex-Color Mesh Birleştirme ve Kurgusal Mahalle İsimlendirmesi (`v0.2.1`)
- **Tarih:** 2026-11-17 | **Durum:** Kabul edildi
- **Bağlam:** Kullanıcının gerçek Android 16 (`2412DPC0AG`, `Mali-G720 MC7`, `60.2 FPS`, `23.4 MB` heap) üzerinde yaptığı `v0.2.0` testinde üç açık geri bildirim geldi: (1) düz yolda görünmez duvara çarpma, (2) karakter/araç/şehir görsellerinin aşırı basit görünmesi ve (3) oyun içinde doğrudan `"Esenler"` ilçe adı kullanılmaması.
- **Kararlar:**
  1. **Kesin 2B Çokgen Çarpışma (`src/core/world/collision.ts` + `src/core/vehicle.ts`):** Uzamsal ızgara geniş faz (broad-phase) olarak AABB kullanmaya devam eder; dar faz (narrow-phase) ise her binanın gerçek OSM çokgen kenarlarına olan en kısa mesafeyi, çokgen içi testini ve dışa dönük yüzey normalini hesaplar. Böylece çapraz binaların boş AABB köşeleri artık caddeyi tıkamaz (%19.0 → %0.5). Araç fiziği çift dingil dairesi (`r = 0.88 m`) ve `dt`-ölçekli teğetsel duvar sıyırması kullanır.
  2. **Vertex-Color Mesh Birleştirme (`src/render/meshMerge.ts`):** Görsel zenginliği 60 FPS ve `<=150` draw-call bütçesi içinde tutmak için karakter uzuvları/gövdesi (7 mesh), Sarı Taksi şasi/cam/tekerlekleri (11 mesh) ve cami landmark'ları tek `BufferGeometry` + `vertexColors` içine pişirilir; prosedürel 2B Canvas dokuları (cephe pencereleri, asfalt şerit/kaldırım, damalı taksi, plaka, çatı çakılı) 0 harici dosya/ağ çağrısıyla üretilir.
  3. **Oyuncu Yüzünde Kurgusal Mahalle Adlandırması:** Dahili veri dizini ve bölge kimlikleri (`esenler-namik-kemal`, `fatih-sultanahmet-eminonu`) kararlılık için korunurken, oyun içi tüm HUD, menü, bildirim ve bölge etiketlerinde doğrudan ilçe/mahalle adı yerine **`Tepe Mahallesi` (`Hillside Quarter`)** ve **`Tarihî Yarımada` (`Historic Peninsula`)** kullanılır. `smoke.mjs` ve birim testleri oyuncu ekranında `"Esenler"`/`"Namık Kemal"` geçmemesini kalıcı olarak doğrular.



---

### ADR-011 — Godot 4.7.2 Motoruna Geçiş ve Mobil Render Kısıtlarının Kabulü (A→I Araştırma Raporu)
- **Tarih:** 2026-11-19 | **Durum:** Kabul edildi (Faz 0.5 ölçümüne bağlı)
- **Bağlam:** Kullanıcı v0.9.1'i telefonda oynadıktan sonra "yama değil, temiz yeniden başlangıç" talep etti. Talep A→I bölümlerinden oluşan araştırmayla gerekçelendirildi. En kritik kanıt: oyuncu aracı ile NPC aracının **iki ayrı görsel hattan** geçmesi (`createPlayerTaxiRig()` vs `buildTrafficClassGeometries()`), NPC cam materyalinde `transparent` alanının bulunmaması (opak cam), NPC gövdesinde iç mekan geometrisi olmaması ve NPC'ye binince aracın yeniden inşa edilmesi.
- **Motor elemeleri (kaynak/ölçüm kanıtlı):**
  - **Unreal 5.x — ELENDİ:** Nanite mobilde desteklenmiyor; Lumen için "not viable for the broad mobile device market" (Epic). Ayrıca Blueprint = GUI dosyası → agent işletilebilirliği ihlali. 100 GB+ disk → ücretsiz CI runner'a sığmaz.
  - **Unity 6 + GameCI — YEDEK:** GameCI `game-ci/unity-builder` **MIT**, son push 2026-11-15, `ubuntu-latest` üzerinde çalışıyor; **ücretsiz Personal lisans** destekli (`docs/03-github/02-activation.mdx`). Ancak `.ulf` lisans dosyası üretmek için **Unity Hub (GUI)** gerekir ve Unity'nin ücretsiz katmanı **gelir eşiğine** tabidir. Bu iki nedenle Godot'un arkasında.
  - **Godot 4.7.2 — SEÇİLDİ:** `platform/android/java/app/config.gradle` (4.7.2-stable): `compileSdk 36`, `targetSdk 36`, `minSdk 24`, `ndkVersion 29.0.14206865`. 16 KB sayfa desteği PR #106358 ile **4.5 milestone**'unda birleşti (2025-05-15). AAB + Play Asset Delivery (`assetPacks = [":assetPackInstallTime"]`) ve `arm64-v8a` varsayılan ABI kaynakta doğrulandı.
  - **Özel C++/Vulkan — ELENDİ:** En yüksek kalite tavanı, ancak tek ajanla sürdürülebilirlik filtresini ihlal eder.
  - **Filament — YEDEK:** Apache-2.0, Android birinci sınıf (3.340 dosya), ancak oyun motoru değil; yalnızca Godot render'ı yetersiz kalırsa C++ katman olarak.
- **Kabul edilen mobil render kısıtları:** `render_forward_mobile.cpp:906` yorumu: `"not using ssr/sss (currently not supported)"`. `drivers/gles3/rasterizer_scene_gles3.cpp` satır 1171–1200 arasında SSAO/SDFGI/volumetric fonksiyonları **boş gövde (stub)**. Sonuç: görsel kalite SSAO/SSR/volumetric ile değil; **güneş açısı + PBR + IBL + VoxelGI + atmosferik sis** ile kurulacak.
- **Sonuç:** Godot 4.7.2-stable. Karar **Faz 0.5 ölçümüne bağlı** — K5 (≥30 kare/s) geçmezse E bölümündeki karar ağacı işletilir.

### ADR-012 — Tek Araç Tanımı (Single Vehicle Definition) ve Görsel Hat Birleştirmesi
- **Tarih:** 2026-11-19 | **Durum:** Kabul edildi
- **Bağlam:** Kullanıcının bildirdiği hata: "Kendi aracımın içi görünüyor, NPC araçlarının içi görünmüyor. NPC aracına binince onun içi de görünür oluyor."
- **Kök neden (kaynak kod incelendi):**
  1. **İki ayrı görsel hat:** `src/render/vehicleMesh.ts:513` `createPlayerTaxiRig()` (koltuk, torpido, direksiyon içerir) vs `src/render/vehicleMesh.ts:151` `buildTrafficClassGeometries()` (iç mekan içermez).
  2. **İki ayrı cam materyali:** Oyuncu camı `transparent: true, opacity: 0.4`; NPC camı `RegionWorldScene.ts:455` `trafficGlassMat` — `transparent` alanı **yok** → opak boya gibi çizilir.
  3. **Binme = model yeniden inşası:** NPC aracına binildiğinde `createPlayerTaxiRig()` çağrılıp araç yeniden üretiliyor; bu yüzden "içi birden görünür" oluyor.
- **Karar:** Tek `VehicleDefinition` kaynağı (`.tres`). Oyuncu ve NPC **aynı sınıfı** (`VehicleInstance`) kullanır; fark yalnızca `player_controlled` bayrağıdır. LOD0 = gövde + cam + iç mekan; LOD1/2 = iç mekan kapalı. **`replace_model()` / `swap_vehicle_mesh()` fonksiyonu yasaktır**; binme = bayrak değişimi + kamera taşıma.
- **Doğrulama (CI'da zorunlu):** `grep` ile NPC kodunda ayrı mesh üretici **0 sonuç**, `replace_model` **0 sonuç**, cam materyali **1**.
- **Sonuç:** Hata mimari olarak imkânsız hale gelir.

### ADR-013 — Yeni Depo Yerine Aynı Depoda `godot/` Klasörü
- **Tarih:** 2026-11-19 | **Durum:** Kabul edildi
- **Bağlam:** Araştırma sırasında `eraslan19j/aslan-godot` adlı ayrı depo önerildi. Öneri uygulanmadan önce yetki ölçüldü.
- **Ölçüm:** `POST /user/repos` → **403 `"Resource not accessible by integration"`**. `PATCH /repos/eraslan19j/Aslan` → **403**. `GET /installation/repositories` → boş. Token bir GitHub App kurulum token'ıdır ve **tek depoya** (Aslan) kilitlidir. Depo seviyesinde `admin: true`, hesap seviyesinde **yetki yok**.
- **Karar:** Yeni oyun aynı depoda `godot/` klasöründe geliştirilir; ayrı workflow dosyası (`godot-*.yml`) ve `paths:` filtresi ile mevcut web CI'ı tetiklenmez. Mevcut oyun **hiç dokunulmadan** çalışmaya devam eder.
- **Sonuç:** Faz 6 Adım 7'de (Play yayını + 2 hafta stabil sonrası) ayrı depoya taşınabilir. O zamana kadar tek depo.

### ADR-014 — Ses Hattı: Granüler Sentez + Meta Open Sound
- **Tarih:** 2026-11-19 | **Durum:** Kabul edildi
- **Bağlam:** Kullanıcının ses şikâyetleri: (1) lastik sesi sahte, (2) motor katmansız, (3) nitro duyulmuyor, (4) egzoz iyileştirilebilir. Kök neden: mevcut `ProceduralSoundEngine` **AudioWorklet osilatör** tabanlıdır; kayıt kullanmaz.
- **Kabul edilen kaynak:** `facebookincubator/Meta-open-sound` — enstrümanlar **CC0-1.0**, Oculus Audio Pack **CC BY 4.0**. `AGENTS.md` dosyası agent kullanımı için hazırlanmış. `VEH.json` içinde 9 araç sesi: `VEHCar_CarEngineHigh_LOOP_01`, `VEHCar_CarEngineSlow_LOOP_01`, `VEHCar_CarStartRunStop_OS_01`, kapı/bagaj/cam/vites sesleri. **Lastik/kayma sesi 44 kategoride YOK.**
- **Lisans uyumu:** `AGENTS.md` satır 49: "Sadece kendi üretimin > CC0 > CC-BY (atıflı)". **CC BY 4.0 uygundur**; `CREDITS.md`'ye URL + lisans + tarih zorunlu.
- **Motor hattı:** 2 gerçek kayıt katmanı (`Slow_LOOP` + `High_LOOP`) + RPM'e bağlı harmonik sentez katmanı = 3 katman. Akademik destek: granüler sentez örnek tabanlıdan daha gerçekçi bulundu (M=2.44 vs M=2.19, p=.0410, N=16).
- **Lastik hattı:** Fizik güdümlü **granüler sentez** — slip oranı grain yoğunluğunu, slip açısı grain konumunu, normal kuvvet genliği, tekerlek başına panner'ı belirler. Hann penceresi, 20–60 ms tane boyu. Gerçek kayıttan türetilir; osilatör **yasak**.
- **Uygulama katmanı:** Godot `AudioStreamGenerator` + `push_buffer(PackedVector2Array)` mevcut. CPU hesabı: 4 tekerlek × 3 çakışma × 48 kHz ≈ **3,46 M işlem/sn** → GDScript'te %35–115 (riskli), **C++ GDExtension'da %1,7**. Karar: **GDScript'te prototip, C++'ta üretim.**
- **Sonuç:** Bloke edici ön koşul — lastik kayma kaydı (tek dosya, CC0/CC BY) kullanıcıdan gelmeli. Sentez ile başlanmaz.

### ADR-015 — Kalite Profilleri ve ADPF Eklentisi
- **Tarih:** 2026-11-19 | **Durum:** Kabul edildi
- **Bağlam:** Kullanıcı sabit FPS vaadi istemedi; cihaz sınıfı başına kalite profili istedi. Godot'ta **Game Mode API ve Thermal API yoktur** (tüm repoda `GameMode` → 2 alakasız sonuç, `thermal` → 0 sonuç).
- **Karar:** Dört profil: **P0 Düşük** (GLES3 Compatibility, ETC2, 20 araç), **P1 Orta** (Vulkan Mobile, ASTC 8×8, 40 araç), **P2 Yüksek** (Vulkan Mobile, ASTC 4×4, 2048² gölge, 68 araç — POCO X7 Pro / Mali-G720 MC7 hedefi), **P3 Ultra** (4096² gölge, 100 araç). Profil seçimi **GPU adına göre sabit tablo değil**, ilk açılışta 3 saniyelik ölçümle ve bir üst profili deneyip geri düşme ile yapılır.
- **ADPF:** Godot'un Java eklenti sistemi (`plugin/GodotPlugin.java`, `@UsedByGodot`, `GodotPluginRegistry.java`) üzerinden yazılacak. Şablon: `m4gr3d/Godot-Android-Plugin-Template` (MIT). Referans: `android/games-samples` `agdk/adpf` (Apache-2.0). Ölçülmüş fayda: MediaTek Boat Attack demosunda **+8,5 FPS, −%12 güç, +25 dk oyun süresi, FPS sapması −%25**.
- **16 KB riski:** Godot motoru NDK 29 ile uyumlu, ancak **bizim ADPF eklentimiz NDK r28+ ile derlenmezse 4 KB hizalı çıkar**. CI'da `llvm-readelf -l *.so | grep LOAD` → `Align 0x4000` zorunlu kontrol.
- **Sonuç:** FPS sözü verilmez; profil + ADPF termal yönetimi.

### ADR-016 — Veri Hattı: OSM2World + Copernicus DSM, Tek Kaynak Kuralı
- **Tarih:** 2026-11-19 | **Durum:** Kabul edildi
- **Bağlam:** Kullanıcı "bina konumları yanlış" bildirdi. Dört ölçüm yapıldı (tümü bu depodaki gerçek veri üzerinde).
- **Ölçüm sonuçları:**
  1. **Koordinat matematiği DOĞRU:** `src/core/world/geo.ts` equirectangular projeksiyonu. Ayasofya–Sultanahmet Camii mesafesi oyunda **457 m**, gerçek haversine **457 m**, **hata 0,0 m (%0,00)**. Kosinüs-enlem düzeltmesi doğru uygulanmış (İstanbul'da %24,5 sapmayı düzeltiyor).
  2. **Bina yüksekliği %97,2 UYDURMA:** 8.120 binanın yalnızca **63'ü (%0,8)** OSM `height` etiketli, **165'i (%2,0)** `building:levels` etiketli, **7.892'si (%97,2)** `inferred`. `scripts/build-fatih-region.mjs:100` uydurma yöntemi: bina tipinin ortalaması × binanın ID'sinden üretilen sözde-rastgele sayı (0,8–1,22). Sonuç: cami ve tarihi yapılar 24 m tavanına sıkışıyor.
  3. **Yol taşması bölgeye göre uçurum:** Fatih binalarında yola taşma **0/3.646 = %0,00**; Esenler'de **910/4.474 = %20,34** (taşan alan %27,00). Kök neden: **Fatih binaları OSM kaynaklı** (`b_*` ID), **Esenler binaları İBB GeoPackage kaynaklı** (`gpkg_buildings_*` ID) — iki farklı kaynak, iki farklı hizalama.
  4. **Arazi oturması kusursuz:** `baseY − arazi yüksekliği` medyanı **−0,00 m**; |fark|>1 m olan **10 bina (%0,3)**. **Ancak 42 bina (%1,15) arazi ızgarasının dışında** (terrain ±777×±695 m, binalar dışına taşıyor) → zeminsiz/havada.
- **Karar:**
  1. **Tek kaynak kuralı:** Bina ve yol verisi aynı kaynaktan. Esenler başlangıçta **kapsam dışı**; yalnızca Fatih (OSM) ile başlanır.
  2. **Yükseklik zenginleştirme:** OSM2World (MIT, `tordanik/OSM2World`) ile OSM'den gerçek `height` / `levels` / `roof:height` çıkarılır; eksikler Copernicus DSM (30 m) ile ölçülür.
  3. **Kabul kriteri (CI'da zorunlu):** `inferred` oranı **< %20**, yol taşması **< %2**, terrain dışı bina **0**, min bina genişliği **≥ 2,5 m**.
- **Sonuç:** H2a (konum) sorun yok; H2b (yükseklik), H2c (Esenler hizasızlığı), H2d (terrain dışı) düzeltilecek.
