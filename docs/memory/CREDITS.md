# CREDITS.md — Lisanslar ve Atıflar

Her üçüncü parti kod parçası, kütüphane, veri kaynağı ve medya asset'i kaynak URL + lisans + tarih/commit hash ile burada listelenir.

---

## 1. Referans Repolar (`refs/` — gitignored, yalnızca inceleme ve uyarlama)
| Repo | Lisans | Doğrulanan Commit Hash | Tarih | Kullanım Şekli |
|---|---|---|---|---|
| `https://github.com/depixeled-chris/gta7` | MIT | `bd5ee61af4759881c235077605d33be9342108e8` | 2026-11-16 | Mimari desenler (saf TS çekirdek / Three.js ayrımı, sabit adımlı döngü, `window.__game` smoke deseni, koordinat sözleşmesi) |
| `https://github.com/yz4git/next-gen` (WorldSeed) | MIT (kod) | `20f5831c4dbaabc8782766d0c36f505d899336e0` | 2026-11-16 | M1 coğrafi veri hattı mimari referansı |
| `https://github.com/bridge-mind/leonida` | MIT | `c09af18f0a19145930cfb7654498c3ae5e9cba91` | 2026-11-16 | Yalnızca sistem izolasyonu mimari incelemesi (hiçbir karakter/isim/hikâye alınmadı) |
| `https://github.com/cartesiancs/map3d` | MIT | *(henüz klonlanmadı)* | 2026-11-16 | Yedek OSM→3B referans |

> **Kopyalanmayan / Yasak Repo:** `Faizankhan17623/OpenCity` (eski `Gta-Clone`) — lisans dosyası yok (`NONE`), sıfır kod kopyalanır.

## 2. Açık Kaynak Kütüphaneler (`package.json`)
| Paket | Lisans | Kullanım |
|---|---|---|
| `three` (`0.187.0`) | MIT | 3B WebGL render motoru |
| `@dimforge/rapier3d-compat` (`0.21.0`) | Apache-2.0 | 3B fizik motoru (gömülü WASM) |
| `@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor/preferences`, `@capacitor/haptics` (`8.x`) | MIT | Android 16 (API 36) yerel köprü |
| `vite`, `vitest`, `typescript`, `eslint`, `typescript-eslint`, `playwright`, `pngjs` | MIT / Apache-2.0 | Derleme, test ve kalite otomasyonu |

## 3. Coğrafi Veri Kaynakları (M1'den İtibaren Oyun İçi "Hakkında" Ekranında Zorunlu)
- **OpenStreetMap:** © OpenStreetMap contributors — ODbL 1.0 (`https://www.openstreetmap.org/copyright`)
- **Overture Maps Foundation:** Binalar & ulaşım verileri (kaynak bazlı CDLA Permissive 2.0 / ODbL; `https://overturemaps.org`)
- **İBB Açık Veri Portalı:** "Kaynak: İBB Açık Veri Portalı" — İstanbul Büyükşehir Belediyesi Açık Veri Lisansı (`https://data.ibb.gov.tr`)
- **Copernicus DEM GLO-30:** © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved (`https://registry.opendata.aws/copernicus-dem/`)

## 4. Görsel, 3B Model ve Ses Varlıkları
- **M0:** %100 kendi prosedürel kod üretimimiz (harici telifli varlık yok).
- *(M1+ aşamalarında eklenecek her CC0 / CC-BY varlık burada kaynak URL + lisans + tarih ile satır satır işlenecektir.)*
