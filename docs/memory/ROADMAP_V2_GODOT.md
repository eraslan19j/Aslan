# ROADMAP_V2_GODOT.md — Yeni Nesil Yol Haritası

> **Durum:** Araştırma raporu (A→I) sonucu kabul edilen yol haritası. Uygulama Faz 0 ile başlar.
> **İlgili:** `ARCHITECTURE_V2_GODOT.md`, `DECISIONS.md` (ADR-011…ADR-016)
> **Tarih:** 2026-11-19

---

## Kural Özeti

| Kural | Açıklama |
|-------|----------|
| **Her faz tek ölçülebilir hedef** | "Yaklaşık oldu" kabul edilmez |
| **Her faz kendi branch'inde** | `main`'e doğrudan commit yok |
| **PR + CI yeşil olmadan merge yok** | Kalite kapısı |
| **"İlerleme yok" noktaları** | Kriter geçmeden sonraki faza geçilmez |
| **`godot/` ve `src/` aynı PR'da değişmez** | Ayrım korunur |
| **Merge = squash** | Geçmiş temiz |
| **Mevcut oyun bozulmaz** | Faz 6 Adım 7'ye kadar `src/` silinmez |

---

## Faz Haritası

| Faz | Branch | Hedef | Bloke edici kriter | Süre |
|-----|--------|-------|--------------------|------|
| **0** | `feat/g0-version-unify` | Tek sürüm kaynağı | 4 yer eşit | 0,5 gün |
| **0.5** | `feat/g1-phase05` | Kanıt APK | **K5 ≥ 30 kare/s** | 1,5–2 hafta |
| **1** | `feat/g2-vehicle` | Tek Araç Tanımı | V1 = 0, V4 = 0 | 1 hafta |
| **2** | `feat/g3-audio` | Ses baştan | S2 kayıt tabanlı | 1–2 hafta |
| **3** | `feat/g4-world` | Dünya verisi | inferred < %20, H2d = 0 | 2–3 hafta |
| **4** | `feat/g5-npc` | NPC LOD | N2 fizik yok | 1–2 hafta |
| **5** | `feat/g6-profiles` | Profil + ADPF | 16 KB uyumlu | 1 hafta |
| **6** | arşiv | Temizlik | Play + 2 hafta stabil | — |

**Toplam: 8–11 hafta**

---

## FAZ 0 — Sürüm Birleştirme

| | |
|---|---|
| **Branch** | `feat/g0-version-unify` |
| **Hedef** | Tek sürüm kaynağı (`version.json`) |
| **Sorun** | 6 farklı sürüm kaynağı: `package.json` 0.8.0, `src/main.ts:116` 0.8.0, `build.gradle:20-21` code 11 / 0.9.1, `README.md` v0.9.1, `strings.ts:98,193` v0.9.1, `strings.ts:165,260` v0.8.0 |
| **Değişecek** | `version.json` (yeni), `package.json`, `src/main.ts`, `android/app/build.gradle`, `scripts/sync-version.mjs` (yeni), `src/core/version.test.ts` (yeni) |
| **Kabul kriteri** | `npm run version:check` → tüm kaynaklar eşit; `vitest` içinde `version.test.ts` yeşil |
| **Kapı** | `tsc --noEmit && eslint . && vitest run && vite build` |
| **"İlerleme yok"** | Sürümler eşitlenmeden Faz 0.5'e **geçilmez** |
| **Risk** | Çok düşük |
| **Durum** | ✅ **TAMAMLANDI** 2026-11-18 — PR #8 squash birleşti. `version.json` = `0.10.0`/code `12`, 9 hedef senkron, CI'da zorunlu adım. 125 test |

**Neden önce bu?** Kullanıcının "telefonumdaki APK eski olabilir" şüphesi. Hangi kodun telefonda olduğu bilinmeden hiçbir ölçüm güvenilir değil.

---

## FAZ 0.5 — Kanıt Prototipi ⭐ EN KRİTİK

| | |
|---|---|
| **Branch** | `feat/g1-phase05` |
| **Hedef** | Boş Godot projesi → CI → APK → telefonda açılır → ölçüm |
| **Süre** | 1,5–2 hafta (CI tarafı **1 günde** bitti) |
| **Durum** | 🟡 **CI tarafı ✅** — run `44340587460` yeşil. **Telefon ölçümü bekliyor (K2/K5/K6/K8)** |

### Ölçülen kapılar [ölçüldü — annotation'lardan]

| K | Kriter | Eşik | Ölçülen | Durum |
|---|---|---|---|---|
| K1 | CI'da APK | — | üretildi | ✅ |
| K3 | targetSdk | 36 | **36** | ✅ |
| K4 | 16 KB hiza | tüm `.so` `0x4000` | **2 `.so`**, ikisi de `align=0x4000` | ✅ |
| K7 | APK boyutu | < 120 MB | **25 MB** | ✅ |
| — | ABI | arm64-v8a | **arm64-v8a** | ✅ |
| K2 | Telefonda açılıyor | açılmalı | **evet** (POCO X7 Pro) | ✅ |
| K5 | FPS | ≥ 30 | **113.0** (8.85 ms) — ⚠️ 120 Hz tavanına takıldı | ⚠️ |
| K6 | Renderer | `mobile(vulkan)` | **mobile(vulkan)** | ✅ |
| K8 | Tek araç hattı | aynı görünmeli | sarı araçlar aynı görünüm | ✅ |

> **K5 neden ⚠️:** sahne yalnız 362 üçgendi; 113 FPS = 8.85 ms ≈ 120 Hz ekran tavanı.
> GPU'nun kalan gücü ölçülemedi. **v0.10.1 yoğunluk merdiveni** (L0 ~2.4k → L3 ~500k üçgen)
> bu boşluğu kapatır. Karar L1/L2/L3 sonuçlarına göre verilecek.

**R11 (godot-ci imajı eski SDK/NDK) artık geçersiz:** imaj hiç kullanılmıyor,
SDK/NDK doğrudan kuruluyor (ADR-017). Ölçümle doğrulandı.
**Süre:** soğuk ~13 dk, sıcak **~5 dk 40 sn** (export template cache ile).

### Alt adımlar

| Adım | Ne | Dosyalar |
|------|----|----------|
| **G2.1** | Boş Godot projesi + CI + APK | `godot/project.godot`, `godot/scenes/main.tscn`, `godot/export_presets.cfg`, `.github/workflows/godot-build.yml`, `godot/.gitignore` |
| **G2.2** | Tek araç + tek karakter + 200 m mahalle | `godot/assets/vehicles/car_a.glb`, `character_a.glb`, `ground_tile.glb`, `godot/scripts/perf_probe.gd`, `quality_profile.gd` |

### Kabul kriterleri (K1–K8)

| # | Kriter | Ölçüm | Eşik |
|---|--------|-------|------|
| **K1** | CI'da APK üretildi | GitHub Actions log + artifact | < 15 dk |
| **K2** | Telefonda açıldı | Kullanıcı gözlemi | Açılıyor, çökmüyor |
| **K3** | `targetSdk 36` | `aapt2 dump badging` | `targetSdkVersion:'36'` |
| **K4** | 16 KB hizalı | `llvm-readelf -l *.so \| grep LOAD` | `Align 0x4000` |
| **K5** | **Performans** | Oyun içi sayaç + RAPORU KOPYALA | **≥ 30 kare/s** (Mali-G720) |
| **K6** | GLES3'te de çalışır | İkinci build | Çalışır, fark ölçülmüş |
| **K7** | APK boyutu | `ls -la` | < 120 MB |
| **K8** | **Aynı araç oyuncu+NPC'de AYNI** | Görsel | Birebir aynı görünüm |

### ⛔ İlerleme yok

> **K5 geçmeden Faz 1'e GEÇİLMEZ.**
> 30 kare/s altındaysa: (a) profil düşür, (b) alan 1,2 → 0,6 km² küçült, (c) E bölümündeki karar ağacını işlet.

### Bilinen riskler

| Risk | Önlem |
|------|-------|
| `barichello/godot-ci` imajında **NDK 25 / API 33** var (eski) | Workflow'da `sdkmanager "platforms;android-36" "ndk;29..."` ile üstüne kur |
| İlk CI çalıştırması başarısız olabilir | Normal — düzeltilecek, 2–3 iterasyon bekle |
| Android SDK indirme `dl.google.com` gerektirir | CI'da **açık**, sandbox'ta kapalı |

---

## FAZ 1 — Tek Araç Tanımı

| | |
|---|---|
| **Branch** | `feat/g2-vehicle` |
| **Hedef** | H1 hatasının mimari olarak imkânsız hale gelmesi |

### Kabul kriterleri (V1–V6)

| # | Kriter | Ölçüm | Eşik |
|---|--------|-------|------|
| **V1** | Oyuncu ve NPC aynı `VehicleDefinition` | `grep` | Ayrı mesh üretici **0** |
| **V2** | Cam materyali tek | Dosya sayısı | **1** |
| **V3** | İç mekan sadece LOD0'da | Kod + görsel | LOD1/2'de `interior_mesh` yok |
| **V4** | **Binme model değiştirmez** | `grep replace_model` | **0 sonuç** |
| **V5** | Aynı mesafede aynı LOD | Ölçüm | Oyuncu/NPC farkı 0 |
| **V6** | Hasar her ikisinde aynı | Görsel | %100 eşleşme |

### ⛔ İlerleme yok

> **V1 ve V4 geçmeden Faz 2'ye geçilmez.**

---

## FAZ 2 — Ses Baştan

| | |
|---|---|
| **Branch** | `feat/g3-audio` |
| **Hedef** | Kullanıcının 4 maddelik ses listesi: lastik, motor, nitro, egzoz |

### 🚨 Bloke edici ön koşul

> **Lastik kayma kaydı (tek dosya, CC0/CC BY) kullanıcıdan gelmeli.**
> Meta Open Sound'da lastik kategorisi **yok**. Sentez ile başlanmaz.

### Kabul kriterleri (S1–S5)

| # | Kriter | Ölçüm | Eşik |
|---|--------|-------|------|
| **S1** | Motor 3 katmanlı | Kod + dinleme | 3 ayrı `AudioStream` |
| **S2** | **Lastik kayıt tabanlı** | Dosya | Osilatör **0** |
| **S3** | Nitro ayrı kanal | Kod | Var |
| **S4** | Lisans | `CREDITS.md` | %100 (URL + lisans + tarih) |
| **S5** | RPM geçişi kesintisiz | Dinleme | Çıtırtı yok |

### Alt adımlar

| Adım | Ne |
|------|----|
| **2a** | GDScript granüler prototip (2 tekerlek, 6 tane) — algoritmayı duy |
| **2b** | C++ GDExtension (4 tekerlek, 12 tane) — gerçek zamanlı |

### ⛔ İlerleme yok

> **S2 geçmeden "ses bitti" DENMEZ.**

---

## FAZ 3 — Dünya Verisi

| | |
|---|---|
| **Branch** | `feat/g4-world` |
| **Hedef** | H2b, H2c, H2d çözümü |

### Kabul kriterleri (B1–B5 + H2)

| # | Kriter | Bugün | Hedef |
|---|--------|-------|-------|
| **B1** | `inferred` yükseklik oranı | **%97,2** | **< %20** |
| **H2c** | Yol taşması | %0,00 / %20,34 | **< %2** |
| **H2d** | Terrain dışı bina | **42** | **0** |
| **B3** | Min bina genişliği | 1,41 m | **≥ 2,5 m** |
| **B4** | ODbL uyumu | ✅ Var | Korunur |
| **B5** | Silüet tanınabilir | — | Kullanıcı gözlemi |

### Kapsam kararı

> **Esenler başlangıçta kapsam dışı.** Fatih (OSM) temiz — yol taşması %0,00. Esenler İBB GeoPackage kaynaklı ve %20,34 taşma var.

### ⛔ İlerleme yok

> **B1 ve H2d geçmeden Faz 4'e geçilmez.**

---

## FAZ 4 — NPC LOD

| | |
|---|---|
| **Branch** | `feat/g5-npc` |
| **Hedef** | 3 LOD katmanı, sadece 8 araçta fizik |

### Kabul kriterleri (N1–N4)

| # | Kriter | Eşik |
|---|--------|------|
| **N1** | L0/L1/L2 katmanları var | 3 katman |
| **N2** | L2'de fizik yok | CPU < %5 |
| **N3** | Terfi 1 karede | Ölçüm |
| **N4** | Görsel tutarlılık | Aynı model |

### ⛔ İlerleme yok

> **N2 geçmeden araç sayısı ARTIRILMAZ.**

---

## FAZ 5 — Kalite Profilleri + ADPF

| | |
|---|---|
| **Branch** | `feat/g6-profiles` |
| **Hedef** | P0–P3 otomatik seçim + ADPF eklentisi |

### Kabul kriterleri

| # | Kriter | Eşik |
|---|--------|------|
| **P1** | 4 profil cihazda çalışır | 4/4 |
| **P2** | ADPF eklentisi derlenir | APK'da var |
| **P3** | **ADPF 16 KB uyumlu** | `Align 0x4000` |
| **P4** | Termal eğri ölçülmüş | 20 dk oyun, FPS düşüşü kaydedilmiş |

---

## FAZ 6 — Arşivleme

| Adım | Ne | Ön koşul |
|------|----|----------|
| 0 | `git tag legacy-web-v0.9.1` | — |
| 1 | Sürüm birleştirme (Faz 0) | — |
| 2 | `godot/` klasörü | Faz 0 |
| 3 | Faz 0.5 kabul | Faz 0 |
| 4 | Faz 1 dikey dilim | Faz 0.5 |
| 5 | Faz 2–5 sistemler | Faz 1–4 |
| 6 | Play yayını + 2 hafta stabil | **TÜMÜ** |
| 7 | `git tag legacy-web-final` + `src/` kaldır | **Adım 6** |

> ⛔ **Adım 7'ye kadar `src/` altındaki hiçbir dosya silinmez.**

---

## Kullanıcıdan Gerekenler

| Zaman | Ne | Neden |
|-------|----|-------|
| **Şimdi** | Hiçbir şey | — |
| **Faz 0.5 sonu** | APK'yı kur + RAPORU KOPYALA | K2, K5 ölçümü |
| **Faz 2 başlangıcı** | **1 dosya**: lastik kayma sesi (CC0/CC BY) | S2 bloke edici |
| **Asla** | GUI araç (Blender, Unity Hub) | Godot seçildi |

---

## Ölçüm Politikası

| Etiket | Anlamı |
|--------|--------|
| **[ölçüldü]** | Sandbox/CI'da gerçekten çalıştırıldı |
| **[kaynak kod incelendi]** | GitHub'dan klonlanıp dosya okundu |
| **[belgeye dayalı]** | Resmî belge veya bağımsız kaynak |
| **[teorik]** | Doğrulanmadı |

**Kural:** Hiçbir ölçüm uydurulmaz. Bilinmeyen "bilinmiyor" olarak yazılır.

---

## Risk Özeti

| # | Risk | Olasılık | Etki | Önlem |
|---|------|----------|------|-------|
| R1 | K5 tutmaz | Orta-Yüksek | Kritik | 3 senaryo ölç, 0,6 km² fallback |
| R2 | Ses kaynağı yok | **Düşük** (Meta çözdü) | Orta | Son 1 dosya kullanıcıdan |
| R3 | Görsel kalite | Orta | Yüksek | 5 temel strateji |
| R4 | Tek ajan tükenmesi | Orta | Kritik | Küçük fazlar, kapılar |
| R5 | 16 KB reddi | Orta-Yüksek | Kritik | CI'da `readelf` zorunlu |
| R6 | Veri hizasızlığı | Orta | Orta | Esenler kapsam dışı |
| R7 | GDScript perf | Orta | Orta | Statik tip + C++ hot path |
| R8 | CI süresi/disk | Düşük | Orta | Cache + `paths:` filtresi |
| R9 | Telif ihlali | Düşük | Kritik | `CREDITS.md` CI kontrolü |
| R10 | Godot regresyonu | Orta | Orta | 4.7.2'ye sabitle |
| **R11** | **CI imajı eski SDK/NDK** | ~~Yüksek~~ **BERTARAF** | Yüksek | ✅ 2026-11-18: imaj hiç kullanılmıyor, SDK/NDK doğrudan kuruluyor (ADR-017). `readelf` ölçümü: 2 `.so` hepsi `0x4000` |
