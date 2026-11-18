# CREDITS.md — Lisanslar ve Atıflar

Her üçüncü parti kod parçası, kütüphane, veri kaynağı ve medya varlığı kaynak URL + lisans + tarih/commit hash ile burada listelenir.

---

## 1. Referans Repolar (`refs/` — gitignored, yalnızca inceleme ve uyarlama)
| Repo | Lisans | Doğrulanan Commit Hash | Tarih | Kullanım Şekli |
|---|---|---|---|---|
| `https://github.com/depixeled-chris/gta7` | MIT | `bd5ee61af4759881c235077605d33be9342108e8` | 2026-11-16 | Mimari desenler (saf TS çekirdek / Three.js ayrımı, sabit adımlı döngü, `window.__game` smoke deseni) |
| `https://github.com/yz4git/next-gen` (WorldSeed) | MIT (kod) | `20f5831c4dbaabc8782766d0c36f505d899336e0` | 2026-11-16 | WGS84→yerel metre projeksiyonu, bina yükseklik çözümleme ve yol grafı üretim deseni |
| `https://github.com/bridge-mind/leonida` | MIT | `c09af18f0a19145930cfb7654498c3ae5e9cba91` | 2026-11-16 | Yalnızca sistem izolasyonu mimari incelemesi (hiçbir karakter/isim/hikâye alınmadı) |
| `https://github.com/cartesiancs/map3d` | MIT | *(henüz klonlanmadı)* | 2026-11-16 | Yedek OSM→3B referans |

> **Kopyalanmayan / Yasak Repo:** `Faizankhan17623/OpenCity` (eski `Gta-Clone`) — lisans dosyası yok (`NONE`), sıfır kod kopyalanır.

## 2. Açık Kaynak Kütüphaneler (`package.json` & CI)
| Paket | Lisans | Kullanım |
|---|---|---|
| `three` (`0.187.0`) | MIT | 3B WebGL render motoru |
| `@dimforge/rapier3d-compat` (`0.21.0`) | Apache-2.0 | 3B fizik motoru (gömülü WASM) |
| `@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor/preferences`, `@capacitor/haptics` (`8.x`) | MIT | Android 16 (API 36) yerel köprü |
| `vite`, `vitest`, `typescript`, `eslint`, `typescript-eslint`, `playwright`, `pngjs` | MIT / Apache-2.0 | Derleme, test, 14-çekim görsel QA & piksel regresyon otomasyonu |
| `rasterio` (BSD-3-Clause), `pyshp` (MIT) — CI Python build-time | BSD-3-Clause / MIT | Copernicus DEM GLO-30 GeoTIFF örnekleme ve `osm_data.zip` shapefile ayrıştırma |

## 3. Coğrafi Veri Kaynakları (`public/derived-data/`, Oyun İçi "Hakkında" Ekranında Görünür)
Tüm OSM türetilmiş harita karoları kaynak koddan ayrı olarak **`public/derived-data/`** klasöründe ve **`public/derived-data/LICENSE-ODbL.md`** lisans dosyasıyla saklanır (ADR-009):

- **OpenStreetMap — Esenler / Namık Kemal Mahallesi (Varsayılan Bölge):**
  - `© OpenStreetMap contributors` — **ODbL 1.0** (`https://www.openstreetmap.org/copyright`)
  - Birincil kaynak paketi: `https://github.com/eraslan19j/ist/releases/download/v1.1-esenler-data/osm_data.zip` (`886,185` bayt / `865.41 KiB`, doğrulanan SHA-256: `8849228b90c2ac807e707bfc91e1b6d0bddb40107afb4962951b20654f621fff`) + Overpass API ibadethane/POI tamamlayıcı katmanları — 2026-11-16 tarihinde 44 offline 300 m karoya işlendi (4,474 bina, 633 yol, 144 park, 2 su, 10 otomatik ibadethane Güvenli Alanı).
- **OpenStreetMap — Fatih: Sultanahmet–Eminönü (İkinci Bölge):**
  - `© OpenStreetMap contributors` — **ODbL 1.0** (`https://www.openstreetmap.org/copyright`) — 2026-11-16 tarihinde 59 offline 300 m karoya işlendi (3,661 bina, 727 yol, 6 T1 tramvay segmenti, parklar ve su poligonları).
- **Copernicus DEM GLO-30:**
  - `© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved` (`https://registry.opendata.aws/copernicus-dem/`, karo `Copernicus_DSM_COG_10_N41_00_E028_00_DEM`) — 2026-11-16 tarihinde her iki bölge için build-time örneklendi.
- **İBB Açık Veri Portalı:**
  - `Kaynak: İBB Açık Veri Portalı` — İstanbul Büyükşehir Belediyesi Açık Veri Lisansı (`https://data.ibb.gov.tr`).
- **Overture Maps Foundation:**
  - Kaynak bazlı CDLA Permissive 2.0 / ODbL (`https://overturemaps.org`) — ileri bölgelerde ek bina yükseklik zenginleştirmesi için hazır.

## 4. Görsel, 3B Model ve Ses Varlıkları
- **M0–M2:** %100 kendi prosedürel kod üretimimiz (harici telifli varlık yok). Tüm binalar, asfalt yollar, T1 tramvay hattı, landmark silüetleri, kurgusal Sarı Taksi / Dolmuş / sivil trafik araçları ve karakter dokuları kodla üretilmiştir.

## 7. v0.9.0 — Ses & Hasar Araştırma Referansları (2026-11-16)

Bu sürümde motor/lastik sesi ve çarpışma deformasyonu için açık kaynak ekosistemi tarandı.
**Hiçbir kod kopyalanmadı**; yalnızca teknik yaklaşım (algoritma fikri) incelendi.

| Kaynak | Lisans | Nasıl Kullanıldı | Kod Alındı mı? |
|---|---|---|---|
| `https://github.com/geoffmyers/engine-sound-lab` | **GPL-3.0** | Silindir ateşleme açısına bağlı darbe dizisi, egzoz banka gecikmesi, susturucu + kuyruk borusu dalga kılavuzu, turbo surge/BOV sırası **fikir olarak** okundu | ❌ **Hayır** (GPL bulaşmasın) |
| `https://github.com/Antonio-R1/engine-sound-generator` | MIT | AudioWorklet içinde emme/blok/çıkış seslerinin ayrı ses yolları, Doppler gecikme düğümleri — mimari | ❌ (kendi DSP'miz yazıldı) |
| `https://github.com/DasEtwas/enginesound` | MIT | Boru/hazne akustik modeli, dikişsiz döngü çapraz geçiş matematiği | ❌ |
| Godot "Unit 7" lastik cıyaklama PR'ı (YannickDurindel) | MIT | 2.6/5.2 kHz bant-geçiren gürültü + 1180 Hz cıyaklama tonu + FM vibrato + genlik salınımı; kayma eşiğinde smoothstep, 50 ms giriş / 140 ms çıkış | ❌ (matematik kendi `vehicleAudioModel.ts`'imizde) |
| `CS-Software-LLC/skidpad` #6 | MIT | Cıyaklama ön-döngü (loop) fallback fikri | ❌ |
| `https://github.com/aphix/crush-stream` | **Lisans yok** | Şekil-eşleştirme deformasyonuna bakıldı | ❌ **Hayır** |
| `https://github.com/watrabi/beamng-web-clone` | **Lisans yok** | Kırılma/kopma fiziği incelemesi | ❌ **Hayır** |
| `Letsmoe/third-gear` #24 | — | GTA/Forza seviyesi yaklaşım: darbe noktasında göçme, menteşeli parçalar, kuvvet eşiğinde kopma — **bizim D1/D2 modelimizin temeli** | ❌ |
| `gor3a/vehicle-makes-models` | ODbL | Yalnızca **kalibrasyon** (güç/tork/ağırlık aralıkları); hiçbir gerçek marka/model adı oyuna girmedi | ❌ |
| `Dazmac-PTY-LTD/car-data-specifications` | — | Aynı şekilde yalnızca sayısal kalibrasyon | ❌ |
