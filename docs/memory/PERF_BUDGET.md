# PERF_BUDGET.md — Performans Bütçesi ve Gerçek Ölçümler

> **Kural:** Ölçülmemiş hiçbir sayı tahmin olarak yazılmaz. Emülatör veya SwiftShader CPU rasterizasyonundaki FPS değerleri **kesinlikle gerçek cihaz performansı değildir**; gerçek cihaz ölçümü yalnızca kullanıcının telefonundan **Ayarlar → RAPORU KOPYALA** çıktısını paylaşmasıyla kayıt altına alınır.

## 1. Hedef Bütçeler
| Metrik | Normal Mod | Lite Mod | Açıklama |
|---|---|---|---|
| Draw calls / kare | ≤ 150 | ≤ 90 | Karo başına birleştirilmiş geometri (≤3 draw call / 300 m tile) + 2 draw call instanced AI trafik |
| `devicePixelRatio` üst sınırı | ≤ 1.5 | ≤ 1.0 | Yüksek DPI telefonlarda fill-rate koruması |
| Gerçek dinamik gölge ışığı | 1 (güneş) | 0 (kapalı) | Tek directional light, 1024×1024 shadow map |
| Görüş mesafesi (far / fog) | 420 m | 240 m | 300 m tile akışı + histerezisli `dispose()` |
| APK / AAB sıkıştırılmış indirme | < 150 MB | < 150 MB | Google Play 200 MB mobil veri uyarısının altında kal |
| Uzun Soak bellek artışı | Sızıntı yok (düz/düşen plato) | Sızıntı yok | Nesne havuzu + geometri/malzeme `dispose()` |

## 2. Ölçüm Kayıtları
| Tarih | Aşama / Sürüm | Ortam | Draw Calls | Üçgen | Aktif Karo / Bina | Debug APK Boyutu | Not |
|---|---|---|---|---|---|---|---|
| 2026-11-16 | M0 (`v0.0.1-m0`, `29e708f`) | Headless Chromium (CI SwiftShader 1280×720) | **15** | **3,442** | — (başlangıç sahnesi) | **5.94 MB** (6,227,507 B) | 0 hata, `geometries: 16`, `textures: 5` *(SwiftShader FPS cihaz verisi değildir)* |
| 2026-11-16 | M1 (`v0.1.0-m1`, `0cb4ee4`) | Headless Chromium (CI SwiftShader 1280×720) | **38** | **21,657** | **14 karo / 1,526 bina** (Fatih) | **6.37 MB** (6,682,054 B) | 0 hata, Ayasofya Güvenli Alan doğrulandı *(SwiftShader)* |
| 2026-11-16 | **M1.5 + M2 (`v0.2.0`, `765e9b9`)** | Headless Chromium (CI SwiftShader 1280×720 & 880×396) | **50–67** (Esenler) / **49–76** (Fatih) | **39,872–69,943** (Esenler) / **40,753–57,784** (Fatih) | **9 karo / 2,414 bina** (Esenler) · **9 karo / 1,382 bina** (Fatih) | **6.84 MB** (7,176,846 B) | 14/14 görsel QA çekimi, **0 konsol hatası**, **0 HUD taşması**, 10 AI trafik aracı, Sarı Taksi sürüş & çıkış, otomatik ibadethane Güvenli Alanı *(SwiftShader FPS cihaz verisi değildir)* |
| 2026-11-16 | **M2 Soak (`v0.2.0`, `765e9b9`)** | Headless Chromium CI (3 dk kesintisiz Esenler taksi sürüşü, `180 sn`, 12 örnek) | **Maks 47** | — | 9 aktif karo (akışlı) | — | **`heapGrowthMb: -10.67 MB`** (`33.49 → 22.82 MB`), **`texDrift: 0`**, **`geoDrift: +8`** (yeni karo akışı), **0 hata** (`workflow_dispatch` ile 10 dk koşu destekli) |
| 2026-11-16 | **M1.5 Android Emülatör (`v0.2.0`, `765e9b9`)** | Pixel 6 x86_64 KVM API 34 (`2400×1080`, SwiftShader) | **50** (Lite) | — | **9 karo / 2,414 bina** | **6.84 MB** | `FATAL: 0`, `ANR: 0`, `Chromium ERROR: 0`, `glError: 0`, joystick `0 m → 5 m`, Geri tuşu → Duraklat *(Emülatör FPS gerçek cihaz verisi değildir)* |
| 2026-11-16 | **M0–M2** | **Gerçek Android Cihaz** | **gerçek cihaz ölçülmedi** | **gerçek cihaz ölçülmedi** | **gerçek cihaz ölçülmedi** | 6.84 MB (`v0.2.0`) | Kullanıcı telefonunda `v0.2.0` APK'yı açıp **Ayarlar → RAPORU KOPYALA** çıktısını sohbete yapıştırdığında doldurulacak |

## 3. Çevrimdışı Türetilmiş Veri Paketi Bütçesi (`public/derived-data/`, Toplam 3.6 MB)
- **Esenler / Namık Kemal Mahallesi (Varsayılan · `1.9 MB`):** 44 adet 300 m karo, **4,474 OSM bina**, 633 tekilleştirilmiş yol, 1,922 yol düğümü / 2,164 kenar, 144 park, 2 su, 12 anonim mahalle noktası, **10 otomatik ibadethane Güvenli Alanı**, Copernicus DEM GLO-30 (`29.3 m .. 90.7 m`).
- **Fatih: Sultanahmet–Eminönü (İkinci Bölge · `1.7 MB`):** 59 adet 300 m karo, **3,661 OSM bina**, 727 yol, 6 T1 tramvay segmenti, 1,796 yol düğümü / 1,924 kenar, 17 park, 5 su poligonu, 3 tarihi ibadethane Güvenli Alanı, Copernicus DEM GLO-30 (`0.0 m .. 67.2 m`).
- **Sıkıştırılmış APK farkı (M1 → M2, Esenler dahil):** `6.37 MB → 6.84 MB` (**yalnızca +0.47 MB**!).

## 4. Alternatif Motor Eşik Kuralı
- Gerçek orta segment Android cihazda kullanıcı **RAPORU KOPYALA** verisi Lite Modda dahi sürdürülebilir ≥25–30 FPS yakalayamazsa veya WebView bellek sınırına çarparsa, somut ölçümlerle **Godot (Android/Web) geçiş ADR'si** değerlendirilecektir.
