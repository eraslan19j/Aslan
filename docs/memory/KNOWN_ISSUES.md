# KNOWN_ISSUES.md — Bilinen Hatalar, Engeller ve Riskler

Son güncelleme: **2026-11-16**

## Aktif Engeller / Ortam Kısıtları
| ID | Önem | Açıklama | Etki & Geçici Çözüm |
|---|---|---|---|
| ENV-001 | Orta | Sandbox ortamında Java/Android SDK kurulu değil. | APK/AAB derlemesi ve `aapt2` API 36 doğrulaması **GitHub Actions (`android.yml`)** üzerinde koşar. |
| ENV-002 | Orta | Sandbox ağ izin listesi Playwright Chromium CDN'ini ve Overpass/Copernicus uç noktalarını engelliyor. | Playwright smoke testi **GitHub Actions (`ci.yml`)** üzerinde koşar; M1 coğrafi veri üretimi `workflow_dispatch` ile GitHub Actions'ta çalışır. |
| PERF-001 | İzleniyor | Henüz gerçek Android cihazda FPS ve bellek ölçümü yapılmadı. | M0 Release APK çıktığında kullanıcı telefonda açılış kontrolü yapacak; M1'de gerçek cihaz telemetrisi eklenecek. **Tahmini FPS yazılmaz.** |
| BIZ-001 | Yüksek | Kullanıcının bütçesi şu an 0 TL; Google Play 25 USD kayıt ücreti gerektiriyor. | Ücretsiz dağıtım kanalları (GitHub Releases APK + GitHub Pages web demo + itch.io) M0'dan itibaren hazır tutulur; `USER_TASKS.md` en üstte açıkça belirtildi. |

## Çözülmüş Hatalar
*(Henüz yok — ilk hata çözüldüğünde tarih ve kök neden ile buraya taşınır.)*
