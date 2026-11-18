# STATE.md — Güncel Durum (tek doğruluk kaynağı)

> **Bu dosya her sürümde güncellenir.** Yeni bir oturuma başlayan ajan önce burayı okur.
> Son güncelleme: **2026-11-18** · Sürüm: **v0.10.0** · Dal: `feat/g1-phase05`

## 1. Şu An Neredeyiz?

| Alan | Durum |
|---|---|
| Sürüm (web) | `v0.10.0` (kararlı, `main` ile senkron) — tek sürüm kaynağı `version.json` |
| Sürüm (Godot) | **v0.11.0** — dolgu/CPU stres testi + tek araç tanımı, APK **25 MB** (`prototype-20261118-180205`) |
| Test sayısı | **127 test / 24 dosya** (hepsi yeşil) |
| Hedef motor | **Godot 4.7.2** (ADR-011) — geçiş Faz 0.5 kanıt prototipiyle başladı |
| Kapılar | `tsc --noEmit` ✅ · `eslint .` ✅ · `vitest run` ✅ · `vite build` ✅ · CI smoke + görsel QA + soak ✅ · APK ✅ |
| `main` | `fbafa8f` — Faz 0 sürüm birleştirme birleşti (PR #8); dal senkron |
| Platform (web) | Capacitor 8, Android API 36, yatay `sensorLandscape`, offline |
| Platform (Godot) | Mobile (Vulkan) renderer, targetSdk 36, minSdk 24, arm64-v8a, 16 KB sayfa |
| Hedef | Google Play (AAB), TR/EN arayüz |

## 2. v0.9.0'da Tamamlananlar

| Kod | İş | Dosya |
|---|---|---|
| R1–R3 | Araç kataloğu (ağırlık, hacim, motor, tork, güç, 0–100, şanzıman, lastik) — 7 araç | `src/core/vehicleCatalog.ts` |
| R4 | Katalog ↔ fizik tutarlılık denetimi (test) | `src/core/vehicleCatalog.test.ts` |
| R5 | HUD sadeleştirme: FPS/Çizim/Karo/Bina satırı **kaldırıldı** (yalnız tanılama modalinde) | `src/ui/HudOverlay.ts`, `src/styles.css` |
| R6 | Hasar çubuğu + araç künyesi (sadece hasar varken) | `HudOverlay.ts`, `styles.css`, `i18n/strings.ts` |
| P1 | OBB ↔ OBB araba çarpışması (SAT/MTV, temas yaması, kütle paylaşımı, PIT dönüşü) | `src/core/vehicleCollision.ts` |
| P2 | Trafik entegrasyonu: gerçek ayak izi, sıfır iç içe geçme | `src/core/traffic.ts` |
| P3 | 3 gövde çoklu temas çözücü | `vehicleCollision.ts` (`solveVehicleContacts`) |
| D1 | 10 panelli hasar modeli (kaput, tamponlar, kapılar, çamurluk, tavan, ön cam) | `src/core/vehicleDamage.ts` |
| D2 | **Görsel hasar**: ezilme (vertex deformasyonu), kopan parça fiziği, duman, cam kırılması | `src/render/vehicleDamageVisuals.ts` |
| D3 | Hasar → fizik: güç kaybı (`powerScale`), sürtünme (`dragScale`), motor ölümü | `src/core/vehiclePhysics.ts`, `src/core/vehicle.ts` |
| A1–A4 | Motor sesi tam yeniden yazımı: eksoz darbe dizisi, banka gecikmesi, susturucu, turbo spool/flutter/BOV, overrun patlamaları | `public/audio/engine-worklet.js` |
| A5 | 3 katmanlı lastik sesi (cıyaklama + kazıma + gürültü), rüzgâr, nitro, katmanlı çarpma | `src/runtime/soundEngine.ts` |
| A6 | Saf-TS ses modeli + 9 test | `src/core/vehicleAudioModel.ts` |
| K1 | **Kapı açma animasyonu** (0 → 1.12 rad, bekleme, kapanma) | `src/render/doorChoreography.ts`, `vehicleMesh.ts` |
| K2 | **Kapı senkronlu biniş**: kapı → karakter yürüyüşü → koltuğa oturma | `src/render/boardingPath.ts`, `RegionWorldScene.setBoarding` |
| A7 | Nitro/turbo katmanları telefon hoparlörüne uygun (hiss + jet gövdesi + ıslık + wastegate) | `vehicleAudioModel.computeBoostAudio` |
| D4 | Tamirci ekonomisi: 3 tamirci, `save.cash`'ten ödeme, arızalı araç 30 % hızla sürünür, minimap iğnesi | `vehicleDamage.ts` (`REPAIR_SHOPS`, `chargeRepair`), `MinimapRenderer` |
| V1–V2 | NPC araçlarda göçme: gövde ezilmesi + kirli boya | `src/core/traffic.ts`, `RegionWorldScene.ts` |

## 2b. Faz 0.5 — Kanıt Prototipi (2026-11-18)

Tahminleri ölçüme çeviren aşama. **Bu bir oyun değil, ölçüm aracı.**

### Ölçülen kapılar — CI'da otomatik [ölçüldü]

| # | Kriter | Eşik | Ölçülen | Durum |
|---|---|---|---|---|
| K1 | CI'da APK üretimi | başarılı | run `44340587460` | ✅ |
| K3 | targetSdk | 36 | **36** | ✅ |
| K4 | 16 KB sayfa hizası | tüm `.so` 0x4000 | `libc++_shared.so` 1342 KB + `libgodot_android.so` 69448 KB, **ikisi de align=0x4000** | ✅ |
| K7 | APK boyutu | < 120 MB | **25 MB** (26,546,665 B) | ✅ |
| — | ABI | arm64-v8a | **arm64-v8a** | ✅ |
| — | Paket adı | — | `com.istanbulstreets.prototype` | ✅ |

### Kullanıcı cihazında ÖLÇÜLDÜ (v1, 2026-11-18) [ölçüldü]

POCO X7 Pro · Mali-G720 MC7 · Android 16

```
113.0 FPS | 8.85 ms (p95 11.49) | draw 12 | tri 2.1k
Mali-G720 MC7 | mobile(vulkan)
```

| # | Kriter | Eşik | Ölçülen | Durum |
|---|---|---|---|---|
| K2 | Uygulama açılıyor | açılmalı | evet | ✅ |
| K5 | Ortalama FPS | ≥ 30 | **113.0** | ⚠️ tavan |
| K6 | Renderer | `mobile(vulkan)` | **mobile(vulkan)** | ✅ |
| K8 | Tek araç hattı | aynı görünmeli | sarı araçlar aynı | ✅ |

> **⚠️ K5 ölçümü tavan değerine takıldı.** POCO X7 Pro 120 Hz; 113 FPS = 8.85 ms ≈
> ekran tavanı (8.33 ms). Sahne 362 üçgendi (koddan sayıldı). Hedef dünya ~600.000
> üçgen ⇒ **1.657 kat** fark. Bu ölçüm GPU'nun ne kadar yükte olduğunu göstermiyor.

### v2 — Yoğunluk merdiveni (v0.10.1)

Tek APK'da 4 seviye, butonlarla geçiş. Seviye değişince sayaç + ısınma sıfırlanır.

**ÖLÇÜLDÜ (POCO X7 Pro, 2026-11-18):**

| Seviye | Geometri | Render | ms | FPS |
|---|---|---|---|---|
| L0 Boş | 3.4k | 11.3k | 8.58 | 116.5 |
| L1 Mahalle | 15.5k | 47.4k | 8.93 | 112.0 |
| L2 Yoğun | 88.9k | 267.4k | 8.94 | 111.9 |
| **L3 Hedef** | **210.2k** | **630.7k** | **9.04** | **110.6** |

**Türetilen sabit:** 619k ek üçgen = **+0.46 ms** ⇒ `0.00074 ms / 1000 üçgen`
⇒ **üçgen serbest**. Hedef dünya ~50k üçgen, tavanın 1/50'si.
`render/geo = 3.00x` her seviyede sabit ⇒ 2 gölge split + 1 ana geçiş doğrulandı.

**K5 ⚠️ nedeni:** L0 bile 116 FPS = 120 Hz tavanı. GPU zorlanmadı; darboğaz
üçgen değil. Sıradaki test: **dolgu** + **CPU** (v0.11.0 StressProbe).

### v1 ekran görüntüsünden yakalanan hatalar (v0.10.1'de düzeltildi)

1. **Gölge tırtıklanması** — bina kenarlarında zikzak. Sebep: 180 m mesafe + 4 split PSSM.
   Düzeltme: 90 m, 2 split, bias 0.02/0.8, blur 1.6, filtre kalitesi 3.
2. **Cam saydamlığı** — v1'de cam proje ayarına bağlıydı. Eski oyundaki `trafficGlassMat`
   opak hatasının (H1) aynısı. Artık materyal kendi `TRANSPARENCY_ALPHA`'sını taşıyor.

### Süre ölçümü [ölçüldü]

- Soğuk derleme (template indirme dahil): **~13 dk**
- Sıcak derleme (template cache): **~5 dk 40 sn**
- Export template `.tpz` = 1.221 MB → `actions/cache` ile önbelleklenir

### CI'da çözülen 5 gerçek engel

| # | Engel | Kök neden | Çözüm |
|---|---|---|---|
| 1 | `Setup Android SDK` düştü | `android-actions/setup-android` v17+ varsayılan cmdline-tools 15859902 indirmesi Ubuntu 24.04'te başarısız | cmdline-tools `11076708` doğrudan indirilir |
| 2 | Export "configuration errors" | ETC2/ASTC sıkıştırma kapalı | `textures/vram_compression/import_etc2_astc=true` |
| 3 | GDScript parse error | `sorted := _frame_ms.duplicate()` tipi çıkarılamıyor | `var sorted: Array[float]`, `var p95: float` |
| 4 | Code signing hatası | Release keystore yok | `GODOT_ANDROID_KEYSTORE_RELEASE_PATH` ortam değişkeni |
| 5 | Workflow hiç başlamadı (`jobs: total_count 0`) | Release notları inline yazılınca YAML girintisi bozuldu | `--notes-file`, + `scripts/check-workflows.mjs` denetimi |

**5. engel en tehlikelisiydi:** commit geçti, workflow "failure" dedi, hiçbir hata mesajı yoktu.
Artık `npm test` her workflow dosyasını ayrıştırıp doğruluyor.

## 3. Kilitlenmiş Sözleşmeler (değiştirme!)

- **Katalog = fizik.** `auditCatalogAgainstPhysics()` boş dönmeli. Motor eğrisini değiştiren katalogu da günceller.
- **Ses modeli saf TS.** `src/core/` içine `three` import edilemez (ESLint kuralı).
- **Hasar API:** `pickPanelForContact(carX, carZ, heading, contactX, contactZ, length, width)`.
- **Çarpışma API:** `resolveCarPair` → `nx/nz/px/pz` temas yaması; yaw dönüşü için `px/pz` normal ekseninden **sapmalı** olmalı (test bunu doğrular).
- **Kapı:** `startDoorSequence(door, 'opening'|'closing')` + `stepDoorChoreography(door, dt)`.
- **Ses telemetrisi:** `wheels`, `archetype`, `surfaceWetness`, `idleRpm` alanları `VehicleAudioTelemetry`'ye eklendi.

## 4. Sıradaki İşler (v0.9.0 kapanışı → v1.0)

1. **Kullanıcı telefonda test etsin:** `releases/istanbul-streets-latest-debug.apk` (v0.9.1).
   Özellikle ses (lastik/motor/nitro) ve kapı animasyonu geri bildirimi bekleniyor.
2. v1.0 maddeleri → [`docs/plans/V100_PLAN.md`](../plans/V100_PLAN.md): NPC gövde çeşitliliği (V3),
   şanzıman derinliği (R7), süspansiyon görselleri (P4), Play Store paketi (M6).
3. GitHub Pages deploy adımı `Setup Pages` hatası veriyor (repo ayarı gerekli: Settings → Pages → GitHub Actions).
4. v1.0: görev zinciri (5 ana + 3 yan), kayıt ilerlemesi, AdMob/IAP test kimlikleri.

## 5. Bilinen Tuzaklar

- Playwright tarayıcısı sandbox'ta **yok**; görsel doğrulama CI'da (`.github/workflows`) yapılır.
- **Ses/görsel hatası ayıklama:** CI smoke raporu commit yorumu olarak yayınlanır
  (`gh api repos/eraslan19j/Aslan/commits/<sha>/comments`). Job log'u bu sandbox'a inmez.
- **Kare hızı düşük cihazlarda animasyon:** kapı/biniş korografisi `Math.min(rawDt, 0.5)` ile
  gerçek zamana bağlı; `rawDt > 0.4` olursa koreografi atlanıp anında oturtulur (yoksa 8 sn sürer).
- **Veri botu:** `build-esenler-region.py` oyuncuya görünen adları üretir. Kurgusal adlar
  (`Tepe Mahallesi` / `Ana Cadde`) betikte sabittir — bot manifest'i ezse bile doğru kalır.
- `scripts/smoke.mjs` `location-telemetry` testid'ine bağlı — HUD'ı değiştiren commit onu da güncellemeli (v0.9.0'da `perf-telemetry` boş olmalı kontrolü eklendi).
- Android SDK sandbox'ta yok → APK yalnız CI'dan.
- `toBeCloseTo(x, 0)` tam yuvarlama yapar; tolerans için `Math.abs(a-b) < tol` kullan.
- Hasar testinde motor sağlığı 0.30'da durur; daha fazla düşürmek için ön tamponu da ez.

## 6. Nasıl Güncellenir?

Her PR/sürüm sonunda:
1. Bu dosyanın "Şu An Neredeyiz" tablosunu güncelle.
2. `PROGRESS.md` aşama tablosuna satır ekle.
3. `SESSION_LOG.md`'ye oturum özeti yaz.
4. Yeni kararlar → `DECISIONS.md`, yeni hatalar → `KNOWN_ISSUES.md`, yeni lisans → `CREDITS.md`.
