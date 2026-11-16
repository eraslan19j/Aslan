# PERF_BUDGET.md — Performans Bütçesi ve Gerçek Ölçümler

> **Kural:** Ölçülmemiş hiçbir sayı tahmin olarak yazılmaz. Gerçek Android cihaz testi yoksa açıkça **"Gerçek cihazda henüz ölçülmedi"** yazılır.

## 1. Hedef Bütçeler
| Metrik | Normal Mod | Lite Mod | Açıklama |
|---|---|---|---|
| Draw calls / kare | ≤ 150 | ≤ 90 | Karo başına birleştirilmiş geometri (≤3 draw call / 300 m tile) + instancing |
| `devicePixelRatio` üst sınırı | ≤ 1.5 | ≤ 1.0 | Yüksek DPI telefonlarda fill-rate koruması |
| Gerçek dinamik gölge ışığı | 1 (güneş) | 0 (kapalı) | Tek directional light, 1024×1024 shadow map |
| Görüş mesafesi (far / fog) | 420 m | 240 m | 300 m tile akışı + histerezisli `dispose()` |
| APK / AAB sıkıştırılmış indirme | < 150 MB | < 150 MB | Google Play 200 MB mobil veri uyarısının altında kal |
| 10 dk Soak bellek artışı | Sızıntı yok (düz plato) | Sızıntı yok | Nesne havuzu + geometri/malzeme `dispose()` |

## 2. Gerçek Ölçüm Kayıtları
| Tarih | Aşama / Sürüm | Ortam | Draw Calls | Üçgen | Kare Süresi / FPS | Aktif Karo / Bina | Debug APK Boyutu | Not |
|---|---|---|---|---|---|---|---|---|
| 2026-11-16 | M0 (`v0.0.1-m0`, `1c385cd` / `29e708f`) | Headless Chromium (CI SwiftShader 1280×720) | **15** | **3,442** | **71.26 ms / 20.72 FPS** | — (başlangıç sahnesi) | **5.94 MB** (6,227,507 B) | SwiftShader CPU yazılım raster; 0 konsol hatası, `geometries: 16`, `textures: 5`, `uniqueColors: 507` |
| 2026-11-16 | M1 (`v0.1.0-m1`, `940ccf2`) | Headless Chromium (CI SwiftShader 1280×720) | **41** | **21,699** | **108.41 ms / 14.06 FPS** | **14 karo / 1,526 gerçek OSM bina** | **6.37 MB** (6,682,054 B) | Gerçek Sultanahmet–Eminönü 1.7 MB offline veri (+0.43 MB sıkıştırılmış APK); 0 hata, `geometries: 52`, `textures: 5`, Ayasofya Güvenli Alan doğrulandı |
| 2026-11-16 | M0–M1 | **Gerçek Android Cihaz** | **Ölçülmedi** | **Ölçülmedi** | **Ölçülmedi** | **Ölçülmedi** | 6.37 MB (`v0.1.0-m1`) | Gerçek donanım erişimi yok; kullanıcı telefon testi bekliyor |
| 2026-11-16 | M1 | **10 dk Uzun Soak Testi** | **Ölçülmedi** | **Ölçülmedi** | **Ölçülmedi** | — | — | `scripts/soak.mjs` hazır; M1–M2 geçişinde CI'da çalıştırılacak |

## 3. Veri Paketi Bütçesi (Fatih: Sultanahmet–Eminönü, M1)
- **Disk boyutu (`public/regions/fatih-sultanahmet-eminonu/`):** **1.7 MB** (sıkıştırılmamış JSON; APK içinde sıkıştırılmış ek yük: **+0.43 MB**).
- **Kapsam:** 59 adet 300 m karo, **3,661 gerçek OSM bina**, 727 yol segmenti, 6 T1 tramvay segmenti, 1,796 yol düğümü / 1,924 kenar, 17 park, 5 su poligonu, Copernicus DEM GLO-30 (`0.0 m .. 67.2 m`).

## 4. Alternatif Motor Eşik Kuralı
- M1/M2'de gerçek orta segment Android cihazda Lite Modda dahi sürdürülebilir ≥25–30 FPS yakalanamazsa veya WebView bellek sınırına çarparsa, somut ölçümlerle **Godot (Android/Web) geçiş ADR'si** değerlendirilecektir.
