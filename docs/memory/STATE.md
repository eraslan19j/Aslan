# STATE.md — Güncel Durum (tek doğruluk kaynağı)

> **Bu dosya her sürümde güncellenir.** Yeni bir oturuma başlayan ajan önce burayı okur.
> Son güncelleme: **2026-11-16** · Sürüm: **v0.9.0** · Dal: `arena/868fe0be-aslan`

## 1. Şu An Neredeyiz?

| Alan | Durum |
|---|---|
| Sürüm | `v0.9.0` — "Hasar & Ses" (GTA-tarzı panel hasarı + katmanlı motor/lastik sesi) |
| Son yeşil sürüm | `v0.8.0` (APK 7.27 MB, 67/67 test, 131 draw call) |
| Test sayısı | **104 test / 21 dosya** (hepsi yeşil) |
| Kapılar | `tsc --noEmit` ✅ · `eslint .` ✅ · `vitest run` ✅ · `vite build` ✅ |
| Platform | Capacitor 8, Android API 36, dikey→yatay `sensorLandscape`, offline |
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
| V1–V2 | NPC araçlarda göçme: gövde ezilmesi + kirli boya | `src/core/traffic.ts`, `RegionWorldScene.ts` |

## 3. Kilitlenmiş Sözleşmeler (değiştirme!)

- **Katalog = fizik.** `auditCatalogAgainstPhysics()` boş dönmeli. Motor eğrisini değiştiren katalogu da günceller.
- **Ses modeli saf TS.** `src/core/` içine `three` import edilemez (ESLint kuralı).
- **Hasar API:** `pickPanelForContact(carX, carZ, heading, contactX, contactZ, length, width)`.
- **Çarpışma API:** `resolveCarPair` → `nx/nz/px/pz` temas yaması; yaw dönüşü için `px/pz` normal ekseninden **sapmalı** olmalı (test bunu doğrular).
- **Kapı:** `startDoorSequence(door, 'opening'|'closing')` + `stepDoorChoreography(door, dt)`.
- **Ses telemetrisi:** `wheels`, `archetype`, `surfaceWetness`, `idleRpm` alanları `VehicleAudioTelemetry`'ye eklendi.

## 4. Sıradaki İşler (v0.9.0 kapanışı → v1.0)

1. APK üret (CI), `v0.9.0` release yayınla, `main`'e fast-forward.
2. `docs/store/` ekran görüntüleri + Play Store metinleri (GTA/marka adı **yasak**).
3. Ses ince ayarı: gerçek telefon kaydıyla karşılaştırma (kullanıcı geri bildirimi bekliyor).
4. v1.0: görev zinciri (5 ana + 3 yan), kayıt ilerlemesi, AdMob/IAP test kimlikleri.

## 5. Bilinen Tuzaklar

- Playwright tarayıcısı sandbox'ta **yok**; görsel doğrulama CI'da (`.github/workflows`) yapılır. Yerelde `smartphone` çözünürlüğünde el ile doğrula.
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
