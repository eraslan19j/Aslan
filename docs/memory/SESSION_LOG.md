# SESSION_LOG.md — Oturum Günlüğü

---

## Oturum 1 — 2026-11-16 (Kuruluş + Hafıza + M0 İskelet + M1 Gerçek Fatih Dünyası)
- **Hedef:** `GENESIS.md` ve `CONTINUE.md` kaydı, araç envanteri, Play/repo/veri doğrulaması, kalıcı hafıza iskeleti, M0 çalışan 3B sahne + Capacitor 8 (API 36) + CI + Release Debug APK, ardından M1 gerçek Sultanahmet–Eminönü 3B dünyası.
- **Tamamlananlar:**
  1. **Kuruluş & Hafıza (`e681ee6`):** `GENESIS.md`, `CONTINUE.md`, `AGENTS.md`, `CLAUDE.md`, `docs/USER_TASKS.md`, `docs/memory/*`, `docs/store/PLAY_CHECKLIST.md`, `docs/regions/fatih-sultanahmet-eminonu.md` oluşturuldu. Google Play 2026 gereksinimleri (API 36, Billing 8, 12×14 testçi, 200 MB AAB, TR $25/TRY), referans repolar (`gta7`, `next-gen`, `leonida`, `map3d`; `OpenCity` yasak; `osm2threejs` 404) ve açık veri kaynakları (Copernicus DEM GLO-30, OSM, İBB) doğrulandı.
  2. **M0 İskelet (`e39538b` → `29e708f`):** Vite + TS + Three.js + Rapier3D WASM + Capacitor 8 (API 36, `sensorLandscape`, immersive tam ekran, geri tuşu = duraklat) kuruldu; saf TS çekirdek/Three.js ESLint sınırı, global hata yakalayıcı + kilitlenme günlüğü, `.bak` kurtarmalı kayıt, TR/EN UI, Lite modu, `privacy.html` eklendi. `CI` (`43947277709`, 15 draw call, 0 hata) ve `Android APK` (`43947277723`) yeşil geçti; Release `v0.0.1-m0` (5.94 MB APK) yayınlandı. GitHub Issues `#1`–`#7` açıldı.
  3. **M1 Gerçek Fatih Veri Hasadı (`3e3674e` → `eda79bb` → `9a92d05`):** Saf TS coğrafi projeksiyon (`geo.ts`), yükseklik çözümleyici (`height.ts`), çift doğrusal arazi örnekleyici (`terrain.ts`), 300 m histerezisli karo akışı (`tileStreamer.ts`), 2B bina AABB çarpışma ızgarası (`collision.ts`) ve `fetch-fatih-data.yml` yazıldı. GitHub Actions (`43948133177` & `43949962553`) gerçek Copernicus DEM GLO-30 (`N41 E028`) + OpenStreetMap Overpass verisini hasat edip `public/regions/fatih-sultanahmet-eminonu/` altına **1.7 MB** olarak işledi (59 karo, 3,661 bina, 727 yol, 6 T1 tramvay, 1,796 düğüm / 1,924 kenar). Küçük Ayasofya koordinat çakışması 150 m tohum koruyucuyla düzeltildi.
  4. **M1 3B Dünya, Çarpışma, Güvenli Alan & APK (`940ccf2`):** Karo başına ≤3 birleştirilmiş draw call üreten `tileMeshBuilder.ts` ve `FatihWorldScene.ts` (Copernicus DEM arazi, Boğaz suyu, 300 m karo akışı, Ayasofya/Sultanahmet/Dikilitaş/Eminönü vapuru/sarı taksi landmark'ları, Q/E + sürüklemeli 3. şahıs kamera) bağlandı; Duraklat menüsüne hızlı bölge noktaları, HUD'a canlı Güvenli Alan rozeti eklendi. 25/25 birim testi geçti, CI Playwright smoke (`43949962546`) **41 draw call, 21,699 üçgen, 14 karo, 1,526 aktif OSM bina, 0 konsol hatası, Ayasofya Güvenli Alan aktif** ile yeşil geçti; `v0.1.0-m1` API 36 Debug APK (**6.37 MB**) yayınlandı.
- **Ölçülmemiş Kalanlar:** Gerçek Android cihaz FPS/RAM/soğuk başlangıç süresi, 10 dakikalık soak testi (`scripts/soak.mjs`).
- **Sonraki Oturumun İlk Adımı:** M2 Sürüş — Sultanahmet'teki sarı taksiye binip inme, Rapier3D + saf TS araç sürüş fiziği, `road-graph.json` üzerinde AI trafik (taksi/dolmuş/sivil/T1 tramvay) ve 10 dk soak doğrulaması.

---

## Oturum 2 — 2026-11-16 (Esenler Varsayılan Bölge + ODbL + M1.5 Görsel & Emülatör QA + M2 Sürüş/Trafik `v0.2.0`)
- **Hedef:** `docs/prompts/CONTINUE.md` talimatları doğrultusunda Esenler / Namık Kemal'i varsayılan bölge yapma (Fatih'i koruyarak), `v1.1-esenler-data/osm_data.zip` SHA-256 doğrulamalı çevrimdışı veri hattı, ODbL ayrımı, otomatik ibadethane Güvenli Alanları, M1.5 Playwright 14-çekim & Android x86_64 KVM emülatör QA hattı, Ayarlar içi Tanılama Paneli (`RAPORU KOPYALA`), %100 telefon-odaklı `USER_TASKS.md`, ve M2 sürüş + trafik `v0.2.0` API 36 APK yayını.
- **Tamamlananlar:**
  1. **Esenler / Namık Kemal Çevrimdışı Veri Hattı & ODbL (`55d2147` → `0faf18f`):** `fetch-esenler-data.yml` (`43962768531` + `43963862378`) `osm_data.zip` dosyasının tam SHA-256 özetini (`8849228b...`) doğruladı; Copernicus DEM GLO-30 (`29.3..90.7 m`) + Overpass ile birleştirip `public/derived-data/esenler-namik-kemal/` altına **1.9 MB** (44 karo, 4,474 bina, 633 tekilleştirilmiş yol, 1,922 düğüm / 2,164 kenar, 144 park, 2 su, 12 anonim mahalle noktası, 10 otomatik ibadethane Güvenli Alanı) derledi. Fatih `public/derived-data/fatih-sultanahmet-eminonu/` altına taşındı; `LICENSE-ODbL.md` ve `docs/regions/esenler-namik-kemal.md` oluşturuldu.
  2. **Çoklu Bölge + M2 Sürüş & Trafik + Tanılama Paneli (`4971e3f` → `371a147`):** Saf TS `regions.ts`, `vehicle.ts`, `traffic.ts`, `diagnostics.ts` ve 31/31 birim testi yazıldı; `RegionWorldScene.ts` (sürülebilir Sarı Taksi, 2 draw call instanced AI trafik, gündüz/gece, QA kamera modları), Duraklat bölge seçici, 20:9 sürüş dokunmatik butonları ve Ayarlar içi canlı JSON Tanılama Paneli (`RAPORU KOPYALA`) bağlandı. `docs/USER_TASKS.md` %100 Android telefon + Termux `openjdk-17` / `keytool` + `RAPORU KOPYALA` adımlarıyla baştan yazıldı.
  3. **M1.5 Görsel QA + Android Emülatör QA Döngüsü — Önce (`371a147`) → Düzeltme (`765e9b9`) → Sonra:**
     - `qa-screens` dalı salt-okunur çekilerek (`gh run download` Azure Blob bloklu; `git fetch origin qa-screens` çalıştı) 14 Playwright + 3 Android Emülatör PNG piksel piksel incelendi.
     - **6 gerçek görsel/layout/Android hatası yakalanıp düzeltildi:** (1) ters yol üçgen sarımı yüzünden tüm sokakların görünmemesi, (2) gündüz gökyüzü/sis renk çatışması, (3) Fatih Dikilitaş'ın kamerayı kapatması, (4) yokuşta taksi eğimi ve karakter kontrastı, (5) `880×396` 20:9 Tanılama modalında `RAPORU KOPYALA`/`Kapat` taşması, (6) Android sol çentik beyaz şeridi + sistem tam-ekran uyarısı + emülatörde dokunmatik UI algılaması.
     - **Sonra (`765e9b9`) tüm 3 workflow yeşil geçti:** `CI` (`43968724580`: 31/31 test, smoke, 14/14 görsel QA **0 konsol hatası / 0 HUD uyarısı**, piksel regresyon dedektörü aktif, 3 dk Esenler sürüş soak `-10.67 MB` heap / `0` doku sızıntısı / maks 47 draw call), `Android Emulator QA` (`43968724537`: `2400×1080` yatay, 0 crash/ANR/Chromium hatası, joystick `0 m → 5 m`, Geri tuşu → Duraklat), `Android APK` (`43968724584`: Release **`v0.2.0`**, **6.84 MB** API 36 Debug APK).
- **Ölçülmemiş Kalanlar:** Gerçek Android telefon FPS/GPU/RAM (`gerçek cihaz ölçülmedi` — kullanıcı `v0.2.0` APK'yı açıp `RAPORU KOPYALA` çıktısını paylaştığında güncellenecek).
- **Sonraki Oturumun İlk Adımı:** M3 Suç — Yayalar, Wanted 1–5, kurgusal Şehir Polisi AI, 2B minimap, WASTED/BUSTED ve Güvenli Alan silah kilidi.

---

## Oturum 3 — 2026-11-17 (Gerçek Android 16 Ölçümü + `v0.2.1` Görünmez Duvar Çözümü, Tam Görsel Yenileme ve Kurgusal İsimlendirme)
- **Hedef:** Kullanıcının gerçek Android 16 (`2412DPC0AG`, `ARM Mali-G720 MC7`, WebView 157) üzerinde test ettiği `v0.2.0` geri bildirimlerini eksiksiz çözmek: (1) düz yolda görünmez duvara çarpma hatası, (2) karakter/araç/şehir görsellerinin baştan sona yükseltilmesi, (3) oyun içinde doğrudan `"Esenler"` adlandırmasının kaldırılması ve gerçek cihaz telemetrisinin hafızaya işlenmesi.
- **Tamamlananlar:**
  1. **İlk Gerçek Cihaz Telemetrisi Kaydı (`PERF_BUDGET.md`):** `2412DPC0AG (Android 16, ARM Mali-G720 MC7, WebView 157)` üzerinde `v0.2.0` Normal modda **`60.2 FPS` (`16.62 ms`), `58 drawCalls`, `65,298` üçgen, `23.4 MB` JS heap, `0` crash** doğrulandı.
  2. **Görünmez Duvar Kök Neden & Kesin 2B Çokgen Çözümü:** Çapraz sokaklardaki binaların dikdörtgen AABB köşelerinin 1,743 yol segmentinin 331'ini (%19.0) — başlangıç caddesi 18. m'deki `gpkg_buildings_2717` dâhil — tıkadığı kanıtlandı. `collision.ts` kesin 2B çokgen dar fazı + yüzey normaliyle yenilendi (`331 → 8`, 41× azalma); `vehicle.ts` çift daireli dingil çarpışması (`r=0.88 m`) ve `dt`-ölçekli teğetsel duvar sıyırmasıyla akıcı hâle getirildi. Çapraz köşe, duvar sıyırması ve gerçek başlangıç caddesi 24 m+ açıklığı birim testleriyle kilitlendi (33/33 test yeşil).
  3. **Tam Görsel Yenileme & Draw-Call Optimizasyonu (`v0.2.1`):** Sıfır ağ çağrılı `proceduralTextures.ts`, eklemli 3B insan karakteri (`characterMesh.ts`, `mergeColoredParts` ile 7 draw call), damalı/plakalı/alaşım jantlı Sarı Taksi (`vehicleMesh.ts`, 11 draw call), prosedürel pencereli/çatılı binalar + şeritli asfalt + kaldırım + 8-kenarlı yuvarlak Akdeniz ağaçları + sokak lambaları (`tileMeshBuilder.ts`), 4-parça AI trafik, degrade gökyüzü kubbesi ve 2048px gölgeler (`RegionWorldScene.ts`) eklendi. İlk CI QA geçişinde (`3d89529`) yakalanan 3 görsel/bütçe kusuru (`174–196` draw call, ters `appendBoxProp` sarımı, alçak ilk-kare kamerası) aynı oturumda `meshMerge.ts`, dışa CCW sarım ve anlık başlangıç kamerasıyla giderildi.
  4. **Kurgusal Mahalle İsimlendirmesi:** Tüm oyun içi etiketler **`Tepe Mahallesi` / `Hillside Quarter`** ve **`Tarihî Yarımada` / `Historic Peninsula`** olarak güncellendi; `smoke.mjs` ve birim testleri oyuncu arayüzünde `"Esenler"`/`"Namık"` geçmediğini otomatik doğrular.
  5. **Mobil Oyun Kıyaslaması & `v0.3.0` (M3 Yaşayan Şehir & Eksiklerin Giderilmesi):** *Gangstar Vegas*, *Car Parking Multiplayer 2*, *MadOut2*, *Payback 2* ve mobil UX rehberleri araştırılıp `docs/memory/MOBILE_BENCHMARK.md`'ye kaydedildi. Tespit edilen 2 kritik hata (hayalet trafik çarpışması / yokuşsuz uzak AI araçları + dokunmatik mod değişiminde takılı kalan tuşlar) ve 6 büyük eksiklik (dönen gerçek yol 2B minimap radarı, 0 KB prosedürel Web Audio motor/drift/korna/siren/görev sesi, 32 instanced kaldırım yayası, 3B ışıklı Sarı Taksi yolcu görevleri & `₺` ekonomisi, Wanted 1–5★ + çakarlı kurgusal Şehir Polisi + BUSTED, 4 kamera açısı & mobil DRİFT/Korna/Taksi Çağır kontrolleri) tek sürümde (`v0.3.0`, 38/38 birim testi) teslim edildi.
- **Sonraki Oturumun İlk Adımı:** M4 İstanbul Hissi — Dinamik gün/gece geçişi, sokak radyosu, martı/kedi/simit atmosferi ve Fatih kıyı düzleştirmesi.



---

## Oturum 4 — 2026-11-16 (v0.9.0 "Hasar & Ses" — kullanıcı geri bildirimi turu)

- **Hedef:** Kullanıcının "oyun harika görünüyor" geri bildirimi sonrası v0.9.0 planı: araçlara en ince ayrıntısına kadar teknik künye, GTA-tarzı çarpışma/hasar, çok daha gerçekçi lastik ve motor sesi, HUD sadeleştirmesi, kapı açma animasyonu, kalıcı hafıza.
- **Tamamlananlar:**
  1. **Araç kataloğu (`R1`–`R4`):** 7 araç için motor hacmi, silindir düzeni, aşırı besleme, güç/tork eğrileri, şanzıman oranları, lastik ölçüleri, ağırlık dağılımı, 0–100, son hız. `auditCatalogAgainstPhysics()` katalog ile 240 Hz fizik spec'ini karşılaştırır (6/6 test).
  2. **Çarpışma (`P1`–`P3`):** Eski daire yaklaşımı yerine OBB SAT/MTV çözücü. Gerçek temas yaması hesaplandı (normal ekseni **ve** teğet üzerinde projeksiyon) — bu olmadan kaldıraç kolu sıfır çıkıyor ve PIT dönüşü imkânsız oluyordu. Kütle paylaşımı, sekme katsayısı, lastik sürtünmesi, 3 gövde çoklu temas.
  3. **Hasar (`D1`–`D3`):** 10 panel (kaput, ön/arka tampon, kapılar ×2, çamurluklar ×2, tavan, ön cam). Eşik aşımında parça kopuyor (kaput 9 m/s, tampon 11, çamurluk 13, kapı 15, cam 8.5), motor sağlığı gücü ve sürtünmeyi etkiliyor, motor ölünce araç sürünerek gidiyor.
  4. **Görsel hasar (`D2`):** Vertex deformasyonuyla ezilme, fırlayan parça fiziği (yerçekimi + sekme), motor dumanı, cam kırılması. Kapı/kaput mesh'leri ayrı panel olarak eklendi, hasar aldıkça görünür oluyor.
  5. **Ses (`A1`–`A6`):** `engine-worklet.js` tamamen yeniden yazıldı — silindir ateşleme darbe dizisi, egzoz banka gecikmesi, susturucu haznesi, kuyruk borusu dalga kılavuzu, emme Helmholtz, supap tıkırtısı, turbo spool/flutter/BOV/wastegate, overrun patlamaları. Lastik sesi iki sabit bant-geçiren yerine kayma hızına bağlı cıyaklama + kazıma + gürültü katmanlarına ayrıldı. Tümü saf TS modelde test edildi (9 test).
  6. **HUD (`R5`–`R6`):** FPS / Çizim / Karo / Bina satırı kaldırıldı (yalnız tanılama modalinde). Yerine yalnızca hasar alınınca görünen ince bir hasar çubuğu + araç künyesi geldi.
  7. **Kapı animasyonu (`K1`):** Sürücü kapısı 0.42 sn'de 1.12 rad açılır, 0.30 sn bekler, 0.36 sn'de kapanır.
  8. **NPC hasarı (`V1`–`V2`):** Çarpılan NPC aracın gövdesi ezilir ve boyası kir rengine kayar.
  9. **Kalıcı hafıza:** `docs/memory/STATE.md` eklendi — her sürümde güncellenecek tek doğruluk kaynağı.
- **Sonuç:** 104/104 test, `tsc`/`eslint`/`vite build` temiz.
- **Sonraki İlk Adım:** CI'da APK üret, `v0.9.0` release'i yayınla, `main`'e fast-forward, ardından Play Store metinleri.

---

## Oturum 5 — 2026-11-18 (v0.9.1 — kapı senkronu, nitro/turbo katmanları, tamirci ekonomisi)

- **Hedef:** v0.9.0'ın eksik kalan üç parçasını bitirmek: karakterin kapıdan gerçekten yürüyerek binmesi, nitro/turbo seslerinin telefon hoparlöründe duyulur hale gelmesi, hasarın bir oyun döngüsüne (tamirci + para) bağlanması.
- **Tamamlananlar:**
  1. **K2 kapı senkronu:** `boardingPath.ts` (saf TS) kapı eşiği → koltuk yayını üretir; ekranda karakter kapıdan yürüyerek binip oturuyor. 7 test.
  2. **A7 nitro/turbo:** `computeBoostAudio` ile 4 katman (hiss / jet gövdesi / turbo ıslığı / wastegate chuff); hepsi 350 Hz üstünde, telefon hoparlöründe kaybolmuyor. 6 test.
  3. **D4 tamirci ekonomisi:** 3 kurgusal tamirci, `save.cash` üzerinden ödeme, para yetmezse ret, arızalı araç %30 hızla sürünerek tamirciye ulaşır, minimap'te sarı iğne. 6 test.
  4. **Regresyon düzeltmeleri:** veri hasat botu kurgusal mahalle adlarını gerçek adlara çeviriyordu (AGENTS.md ihlali) → betik sabitlendi; 4 adet 2 m altı yol mikro-çubuğu paketten atıldı, betik de artık atıyor.
  5. **Kararlılık:** headless CI ~1 FPS'te çalıştığı için kapı koreografisi 8 saniyeye uzuyordu → animasyon gerçek zamana bağlandı, `rawDt > 0.4` olursa atlanıyor.
- **Sonuç:** 123/123 test, tüm kapılar yeşil, CI smoke + visual QA + soak geçti. `v0.9.1` yayınlandı, APK `main`'de `releases/` altında.
- **Not:** GitHub Pages deploy iş akışı `Setup Pages` adımında düşüyor (repo ayarı gerekiyor) — oyun dağıtımını etkilemiyor.

---

## Oturum 6 — 2026-11-18 (v0.10.0 sürüm birleştirme + Faz 0.5 Godot kanıt prototipi)

- **Hedef:** (a) A→I araştırma raporunun ilk somut adımı: sürüm numaralarını tek kaynağa indirmek. (b) Faz 0.5: Godot 4.7.2 boş projesinden telefona kurulabilir APK üretip performansı ölçmek.

### Bölüm 1 — Faz 0 sürüm birleştirme (`feat/g0-version-unify`, PR #8, squash)

- **Sorun [ölçüldü]:** sürüm **6 farklı yerde** tutuluyor ve ayrışmıştı:
  `package.json` 0.8.0 · `src/main.ts` 0.8.0 · `build.gradle` code 11/0.9.1 ·
  `README` v0.9.1 · `strings.ts` milestoneTag v0.9.1 ama **aboutSubtitle v0.8.0**.
  Telefondaki APK'nın hangi koddan geldiği belirlenemiyordu.
- **Çözüm:** `version.json` tek kaynak · `scripts/sync-version.mjs` (9 hedef, `--check`) ·
  `src/core/version.test.ts` (2 test) · CI'da `Version single-source check` adımı.
- **Sonuç:** 5 dosya senkronize. `tsc` ✅ `eslint` ✅ **125 test** ✅ `vite build` ✅ build'de eski sürüm kalıntısı **0**.
  CI (12 dk 27 sn) + Android APK (2 dk 17 sn) yeşil → squash birleşti.

### Bölüm 2 — Faz 0.5 Godot kanıt prototipi (`feat/g1-phase05`)

- **Kural:** bu bir oyun değil, **ölçüm aracı**. Kabul kriterleri K1–K8.
- **Yazılanlar:** `godot/project.godot` (Mobile/Vulkan, 2048² gölge) · `scenes/main.tscn` ·
  `scripts/prototype_world.gd` (200×200 m zemin, 12 bina MultiMesh, 8 NPC araç MultiMesh, 1 oyuncu araç —
  **aynı mesh ve materyal**, K8 ön kanıtı) · `scripts/perf_probe.gd` (ortalama/p95/p99/1% low,
  draw call, üçgen, GPU; 60 kare ısınma atlanır; 3 parmak dokunma → panoya rapor).
- **CI:** `.github/workflows/godot-build.yml` — ayrı workflow + `paths` filtresi → mevcut web CI'ı tetiklenmiyor.
- **5 gerçek engel ve kök nedenleri:**
  1. `Setup Android SDK` düştü → `android-actions/setup-android` v17+ varsayılan `cmdline-tools 15859902`
     Ubuntu 24.04'te başarısız. Çözüm: cmdline-tools `11076708` doğrudan indirildi.
  2. Export "configuration errors" → **ETC2/ASTC kapalı**. Kaynak doğrulaması:
     `editor/import/resource_importer_texture_settings.cpp:47-53`. Çözüm: `import_etc2_astc=true`.
  3. `SCRIPT ERROR: Cannot infer the type of "p95"` → `Array.duplicate()` dönüş tipi çıkarılamıyor.
     Çözüm: `var sorted: Array[float]`, `var p95: float`.
  4. `Could not find release keystore` → kaynak: `export_plugin.cpp:2227-2232` + `export_plugin.h:47-52`.
     İlk yazdığım `package/release_keystore_path` anahtarları **uydurmaydı, yanlıştı**;
     doğrusu `keystore/release` veya `GODOT_ANDROID_KEYSTORE_RELEASE_PATH` ortam değişkeni.
  5. **Workflow hiç başlamadı** (`jobs: total_count 0`) → release notları inline yazılınca YAML girintisi
     bozuldu. GitHub "failure" dedi ama **hiçbir hata mesajı vermedi**. Çözüm: `--notes-file` +
     `scripts/check-workflows.mjs` (7 workflow dosyasını ayrıştırır, hatalı satırı bağlamıyla yazdırır) +
     `src/core/workflows.test.ts` (2 test) + `npm test` zincirine `workflows:check`.
- **Ölçülen kapılar [ölçüldü]** — CI run `44340587460`, annotation'lardan okundu:
  | K | Ölçülen |
  |---|---|
  | K1 | APK üretildi ✅ |
  | K3 | targetSdk **36** ✅ |
  | K4 | **2 `.so`**, ikisi de `align=0x4000` (`libc++_shared.so` 1342 KB, `libgodot_android.so` 69448 KB) ✅ |
  | K7 | **25 MB** (26,546,665 B), eşik 120 MB ✅ |
  | ABI | **arm64-v8a** ✅ |
  | Paket | `com.istanbulstreets.prototype` |
- **Süre:** soğuk ~13 dk (template indirme dahil), sıcak **~5 dk 40 sn** (template cache).
- **Kullanıcıya bırakılan:** K2 (açılıyor mu), K5 (FPS ≥ 30), K6 (renderer `mobile(vulkan)`), K8 (tek araç hattı görsel).
  Release `prototype-20261118-154839` → `prototype.apk`.
- **Kısıt notu:** APK'yı bu ortamdan indirmek denendi, **başarısız** —
  release asset `release-assets.githubusercontent.com` (SSL_ERROR_SYSCALL),
  artifact `productionresultssa8.blob.core.windows.net` (EOF). Bu yüzden tüm ölçüm değerleri
  CI annotation'ı olarak yayınlanıyor; kullanıcı release'i kendi ağından indirebilir.
- **Sonuç:** 127/127 test (24 dosya), `tsc` ✅ `eslint` ✅ `workflows:check` ✅.
- **Sonraki İlk Adım:** kullanıcı telefonda K2/K5/K6/K8 ölçsün. K5 ≥ 30 ise Faz 1 (`feat/g2-vehicle-pipeline`);
  değilse profil düşür → hâlâ altındaysa Filament/C++ yoluna geç.

---

## Oturum 7 — 2026-11-18 (v0.10.1 — ilk gerçek cihaz ölçümü + yoğunluk merdiveni)

- **Telefon ölçümü geldi [ölçüldü]** — POCO X7 Pro, Mali-G720 MC7, Android 16:
  ```
  113.0 FPS | 8.85 ms (p95 11.49) | draw 12 | tri 2.1k
  Mali-G720 MC7 | mobile(vulkan)
  ```
  K2 ✅ K6 ✅ K8 ✅ · K5 **113 FPS** ama ⚠️ tavan.

- **Yorum:** 113 FPS = 8.85 ms ≈ 120 Hz ekran tavanı (8.33 ms). Sahne koddan sayıldı:
  **362 üçgen** (zemin 2 + 12 bina 144 + oyuncu 24 + 8 NPC 192). Hedef dünya ~600.000
  ⇒ **1.657 kat** fark. Ölçüm "geçti" ama GPU yükünü göstermedi. K5 ⚠️ olarak işaretlendi.

- **v0.10.1 — yoğunluk merdiveni:** tek APK'da 4 seviye (butonla geçiş), seviye değişince
  sayaç + ısınma sıfırlanıyor:
  L0 Boş ~2.4k · L1 Mahalle ~25k · L2 Yoğun ~120k · L3 Hedef ~500k üçgen.
  Yeni geometri: `_append_cylinder` (tekerlek, seg 8/12/16 → ~150/350/590 üçgen),
  `_make_quad` (cam), `BoxMesh.subdivide` (bina detayı).

- **Ekran görüntüsünden yakalanan 2 hata (düzeltildi):**
  1. **Gölge tırtıklanması** — bina kenarlarında zikzak. Sebep: 180 m gölge mesafesi +
     4 split PSSM. Düzeltme: 90 m, 2 split, bias 0.02/0.8, blur 1.6, filtre kalitesi 3.
  2. **Cam saydamlığı** — v1'de cam materyali proje ayarına bağlıydı; eski oyundaki
     `trafficGlassMat` opak hatasının (**H1'in parçası**) aynısı. Artık materyal kendi
     `TRANSPARENCY_ALPHA` ayarını taşıyor, `CULL_DISABLED`.

- **CI'da yakalanan gerçek sürüm hatası:** `godot/export_presets.cfg` içinde sürüm sabitti
  (`version/code=12`, `version/name="0.10.0"`) ve `sync-version.mjs` bu dosyayı kapsamıyordu.
  Sürüm 0.10.1'e çıkınca APK **hâlâ 0.10.0** üretildi — **Faz 0'ın öldürmesi gereken hatanın
  birebir aynısı, yeni bir dosyada.**
  Düzeltme: `sync-version.mjs` **9 → 11 hedef**; K3 adımı artık APK sürümünü `version.json`
  ile karşılaştırıp **eşleşmezse build kırıyor** (ADR-020).
  Doğrulandı: `[SURUM] versionName=0.10.1 versionCode=13`.

- **CI iyileştirmesi:** `GDScript parse check` adımı (`--check-only`) export'tan önce.
  Parse hataları artık annotation olarak geliyor.

- **Sonuç:** tsc ✅ eslint ✅ 127 test ✅ workflows 7/7 ✅ sync 11 hedef ✅
  Godot CI ✅ (1 m 25 s) · Android APK ✅

---

## Oturum 8 — 2026-11-18 (v0.11.0 — üçgen testi bitti, dolgu/CPU testi + tek araç tanımı)

- **Yoğunluk merdiveni ölçüldü [ölçüldü]** — POCO X7 Pro, Mali-G720 MC7:

| Seviye | Geometri | Render | ms | FPS |
|---|---|---|---|---|
| L0 Boş | 3.4k | 11.3k | 8.58 | 116.5 |
| L1 Mahalle | 15.5k | 47.4k | 8.93 | 112.0 |
| L2 Yoğun | 88.9k | 267.4k | 8.94 | 111.9 |
| L3 Hedef | 210.2k | 630.7k | 9.04 | **110.6** |

- **Sonuç:** 619k ek üçgen = **+0.46 ms** ⇒ `0.00074 ms/1000 tri` ⇒ **üçgen serbest**.
  Hedef dünya ~50k tri, tavanın 1/50'si. `render/geo = 3.00x` sabit ⇒ gölge teşhisi doğru.
  **Ama L0 bile 116 FPS** = 120 Hz tavanı ⇒ asıl darboğaz üçgen değil. → **ADR-021**

- **v0.11.0 StressProbe:** dolgu 0–12 tam ekran saydam katman, CPU 0–2000k işlem/kare,
  gölge aç/kapa. Ölçümler rapora `stress` alanı olarak girer.

- **v0.11.0 VehicleDef — TEK ARAÇ TANIMI:** 10 noktalı yan profil (tampon/kaput/ön cam/
  tavan/arka cam/bagaj), ayrı saydam cam yüzeyi, 4 tekerlek (dingil 1.42/−1.38 m),
  4.42×1.82×1.18 m, clearcoat boya. Oyuncu + 200 NPC **aynı fonksiyondan**.

- **Bulunan gerçek hata:** `material_override` tüm yüzeyleri tek materyale çeviriyor ve
  camı öldürüyordu — eski oyundaki `trafficGlassMat` opak hatasının **birebir aynısı (H1)**.
  Kaldırıldı; materyaller mesh yüzeylerinde.

- **Gölge bulgusu [kaynak/API]:** `directional_shadow_mode`, `shadow_blur`,
  `soft_shadow_filter_quality` **proje ayarı** — `_ready()`'de değiştirmek etkisiz.
  `project.godot`'a taşındı. `depth_prepass` + FXAA eklendi (z-fighting).

- **Sonuç:** tsc ✅ workflows 7/7 ✅ 11 hedef ✅ 127 test ✅ GDScript check ✅
  Godot CI 1m6s ✅ · APK 0.11.0 (14) ✅
