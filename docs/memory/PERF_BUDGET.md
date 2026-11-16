# PERF_BUDGET.md — Performans Bütçesi ve Gerçek Ölçümler

> **Kural:** Ölçülmemiş hiçbir sayı tahmin olarak yazılmaz. Gerçek Android cihaz testi yoksa açıkça "Gerçek cihazda henüz ölçülmedi" yazılır.

## 1. Hedef Bütçeler (Başlangıç)
| Metrik | Normal Mod | Lite Mod | Açıklama |
|---|---|---|---|
| Draw calls / kare | ≤ 150 | ≤ 90 | Instancing + doku atlası zorunlu |
| `devicePixelRatio` üst sınırı | ≤ 1.5 | ≤ 1.0 | Yüksek DPI telefonlarda fill-rate koruması |
| Gerçek dinamik gölge ışığı | 1 (güneş) | 0 (kapalı) | Tek directional light, 1024×1024 shadow map |
| Görüş mesafesi (far / fog) | 300 m | 160 m | 300 m tile akışı + frustum kesme |
| APK / AAB sıkıştırılmış indirme | < 150 MB | < 150 MB | Google Play 200 MB mobil veri uyarısının altında kal |
| 10 dk Soak bellek artışı | Sızıntı yok (düz plato) | Sızıntı yok | Nesne havuzu + geometri/malzeme `dispose()` |

## 2. Gerçek Ölçüm Kayıtları
| Tarih | Aşama / Sürüm | Ortam | Draw Calls | Üçgen | Kare Süresi / FPS | Web Dist Boyutu | Debug APK Boyutu | Not |
|---|---|---|---|---|---|---|---|---|
| 2026-11-16 | M0 | Headless Chromium (CI SwiftShader) | *(CI sonrası doldurulacak)* | *(CI sonrası)* | *(CI sonrası)* | *(build sonrası)* | *(CI sonrası)* | SwiftShader yazılım raster; gerçek GPU değil |
| 2026-11-16 | M0 | Gerçek Android Cihaz | **Ölçülmedi** | **Ölçülmedi** | **Ölçülmedi** | — | — | Gerçek cihaz erişimi yok; kullanıcı APK testi bekliyor |

## 3. Alternatif Motor Eşik Kuralı
- M1'de gerçek orta segment Android cihazda Lite Modda dahi sürdürülebilir ≥25–30 FPS yakalanamazsa veya WebView bellek sınırına çarparsa, somut ölçümlerle **Godot (Android/Web) geçiş ADR'si** değerlendirilecektir.
