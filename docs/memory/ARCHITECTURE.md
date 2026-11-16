# ARCHITECTURE.md — Teknik Mimari

## 1. Yığın (Stack) ve Sabit Sürümler
- **Web / Oyun Motoru:** Vite `7.3.8` + TypeScript `5.9.3` + Three.js `0.187.0`
- **Fizik:** Rapier3D (`@dimforge/rapier3d-compat` `0.21.0`, gömülü WASM — ek harici binary indirme yok)
- **Test & Kalite:** Vitest `5.1.0` (Node ortamı, saf çekirdek) + ESLint `10.15.0` + `typescript-eslint` + Playwright Chromium (CI headless smoke + soak)
- **Mobil Paketleme:** Capacitor `8.6.2` (`@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor/preferences`, `@capacitor/haptics`)
  - **Android Hedef:** `compileSdkVersion = 36`, `targetSdkVersion = 36` (Android 16), `minSdkVersion = 24` (Android 7.0+)
  - **App ID:** `com.istanbulstreets.game`
  - **Ekran:** `sensorLandscape`, immersive tam ekran, `FLAG_KEEP_SCREEN_ON`, 120 Hz uyumlu, donanım hızlandırmalı WebView, Android 16 edge-to-edge güvenli alanları (`env(safe-area-inset-*)`).

## 2. Sert Katman Ayrımı (Pure Core vs Render)
```
src/
  core/        # SAF TypeScript — ZERO 'three' ve ZERO DOM bağımlılığı.
               # Node ortamında Vitest ile %100 deterministik birim testli:
               #   - math.ts (clamp, lerp, damp, angleDelta, safeApproachSpeed)
               #   - rng.ts (mulberry32 + hashSeed, Math.random() YASAK)
               #   - gameLoop.ts (sabit 60 Hz timestep akümülatör mantığı)
               #   - quality.ts (Normal / Lite kalite profilleri, pixelRatio/görüş mesafesi/gölge)
               #   - save.ts (sürümlü kayıt şeması v1, bozulma tespiti + yedek kurtarma)
               #   - crashLog.ts (yapılandırılmış kilitlenme günlüğü, ana kaydı asla bozmaz)
               #   - controls.ts (klavye + dokunmatik + gamepad analog niyet birleştirici)
               #   - physics.ts (Rapier3D WASM sarmalayıcı + güvenli başlangıç kontrolü)
               #   - [M1+] world/, traffic/, vehicles/, wanted/, missions/
  i18n/        # Tek dosya TR + EN yerelleştirme sözlüğü ve yardımcısı
  render/      # Three.js katmanı — sahne, tek güneş gölgesi, su, prosedürel dokular,
               # performans telemetrisi (drawCalls, triangles, geometries, textures)
  runtime/     # Tarayıcı & Capacitor köprüsü:
               #   - errorBoundary.ts (window.onerror + unhandledrejection -> crashLog + temiz UI)
               #   - nativeBridge.ts (Capacitor App backButton -> duraklat, Preferences depolama)
               #   - loopDriver.ts (requestAnimationFrame -> FixedStepLoop)
  ui/          # Hafif DOM HUD, Duraklatma/Ayarlar, Lite Modu, Dil, Hakkında/Atıflar, Kilitlenme Ekranı
```

## 3. Koordinat ve Simülasyon Sözleşmeleri (Referans: `gta7`)
- **Koordinat sistemi:** `+X` = Doğu, `+Z` = Güney, `+Y` = Yukarı. Yön açısı (`heading`) `0` = `+X`, saat yönünün tersine artar (`-Z` kuzey). İleri vektörü = `(cos h, 0, -sin h)`.
- **Sabit adım:** Simülasyon sabit 60 Hz (`dt = 1/60`) akümülatörle çalışır; `dt` üst sınırı `0.1s` (sekme değişimi veya takılmada fizik patlamasını önler).
- **Determinizm:** Tüm prosedürel/tile yerleştirme seeded RNG (`mulberry32`) ile yapılır.

## 4. Veri Hattı (Offline-First, M1+)
- Coğrafi veriler (OSM + Overture Maps + Copernicus DEM GLO-30 + İBB vektör durak/iskele) **build zamanında** işlenip 300 m × 300 m GLB + JSON tile paketlerine dönüştürülür ve uygulamaya gömülür.
- Çalışma zamanında **sıfır canlı API bağımlılığı** vardır; uçak modunda tam çalışır.
- Yol grafı tek kaynak olarak trafik, polis kovalamacası, minimap GPS ve görev rotalarını besler.
- Ayasofya ve Sultanahmet Camii çevresi `sanctuaryZones` olarak veri manifestinde işaretlenir; silah/şiddet/ragdoll motoru bu alanlarda kilitlidir.

## 5. WebView Risk Yönetimi
- **Risk:** Orta/alt segment Android cihazlarda WebView WebGL performansı yerel OpenGL/Vulkan motorlarının gerisinde kalabilir.
- **Önlem:** (1) M0'dan itibaren canlı draw call / FPS / triangle telemetrisi; (2) tek dokunuşla **Lite Modu** (`pixelRatio <= 1.0`, gölgesiz, kısa görüş mesafesi); (3) instancing + nesne havuzu + 300 m tile akışı + frustum/mesafe kesme.
- **Karar eşiği:** M1'de gerçek/ölçülmüş performans bütçe hedeflerini ciddi şekilde kaçırırsa alternatif motor (ör. Godot Android/Web) için veriye dayalı ADR yazılır.
