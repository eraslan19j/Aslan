# Istanbul Streets

Gerçek İstanbul harita ve yükseklik verileriyle çevrimdışı çalışan, tamamen orijinal, 3. şahıs açık dünya suç/aksiyon ve sürüş oyunu.

- **Paket Adı:** `com.istanbulstreets.game`
- **Hedef Platformlar:** Android 16 (API 36, minSdk 24, `sensorLandscape`) + Web Demosu
- **Mevcut Aşama:** **M1 Gerçek Dünya (`v0.1.0-m1`)** — Gerçek OpenStreetMap + Copernicus DEM GLO-30 verisinden çevrimdışı üretilmiş **Fatih (Sultanahmet–Eminönü)** 3B haritası, 300 m karo akışı, 3. şahıs yürüme & bina çarpışması, Ayasofya/Sultanahmet Güvenli Alanları, Lite/Normal modu, TR/EN yerelleştirme ve otomatik API 36 APK hattı.

## Özellikler (M0 + M1)
- **Gerçek Fatih (Sultanahmet–Eminönü) Offline Veri Paketi (1.7 MB):** 59 adet 300 m karo, **3,661 gerçek OSM bina**, 727 yol segmenti, 6 T1 tramvay segmenti, 1,796 yol düğümü / 1,924 kenar, 17 park, 5 su poligonu ve Copernicus DEM GLO-30 arazi yüksekliği (`0.0 m .. 67.2 m`). Çalışma zamanında sıfır canlı API çağrısı.
- **Yüksek Performanslı Karo Akışı:** Karo başına ≤3 birleştirilmiş draw call (CI smoke ölçümü: 1,526 aktif bina ve 14 karo yüklenirken toplam **41 draw call**, 21,699 üçgen, 0 konsol hatası), `pixelRatio <= 1.5` (Lite `<= 1.0`), histerezisli `dispose()`.
- **Saf TS Çekirdek / Three.js Ayrımı:** Tüm simülasyon, coğrafi projeksiyon, bina çarpışması, kayıt/yedek kurtarma, kilitlenme günlüğü, güvenli alanlar ve Rapier3D WASM testleri Node ortamında 25/25 birim testlidir (`ESLint` sınır denetimli).
- **Güvenli Alan (Sanctuary) Kuralı:** Ayasofya-i Kebir ve Sultanahmet Camii çevreleri şiddet/silah kilitli güvenli alan olarak canlı HUD rozetiyle işaretlenir; cami iç mekânları kapalıdır.
- **Android 16 (API 36) Uyumlu:** Capacitor 8.6.2, `sensorLandscape`, immersive tam ekran, ekran açık tutma, 120 Hz ekran tercihi, `env(safe-area-inset-*)` güvenli alan ve geri tuşu ile duraklatma.

## Kontroller
- **Masaüstü:** `WASD` / Ok tuşları (Yürü), `Shift` (Koş), `Q/E` veya Fare Sürükle (Kamera), `Esc` (Duraklat + Hızlı Keşif Noktaları)
- **Dokunmatik / Mobil:** Sol analog kol (Yürü), sağ ekran sürükleme (Kamera), `KOŞ` düğmesi, telefon Geri tuşu (Duraklat)

## Kurulum ve Geliştirme Komutları
```bash
npm ci               # Bağımlılıkları kur
npm run dev          # Yerel geliştirme sunucusu
npm run typecheck    # TypeScript tip kontrolü
npm run lint         # ESLint kontrolü (src/core Three.js sınırı dahil)
npm test             # Vitest saf TS + veri paketi + Rapier3D birim testleri (25 test)
npm run build        # Üretim web derlemesi -> dist/
npm run smoke        # Playwright headless Chromium duman testi
npm run soak         # 10 dakikalık bellek/geometri sızıntı testi
npm run cap:sync     # dist/ -> android/ Capacitor senkronizasyonu
```

## Android APK İndirme
En güncel API 36 Debug APK (6.37 MB):
- [`v0.1.0-m1` GitHub Release](https://github.com/eraslan19j/Aslan/releases/tag/v0.1.0-m1)

Kurulum ve kullanıcı adımları için [`docs/USER_TASKS.md`](./docs/USER_TASKS.md) dosyasına bakın.

## Lisanslar ve Atıflar
- `© OpenStreetMap contributors` (ODbL 1.0)
- `Copernicus DEM GLO-30` — © DLR e.V. & Airbus Defence and Space GmbH (EU / ESA)
- `Kaynak: İBB Açık Veri Portalı` (İBB Açık Veri Lisansı)
- `Overture Maps Foundation` (CDLA Permissive 2.0 / ODbL)
- Tam liste: [`docs/memory/CREDITS.md`](./docs/memory/CREDITS.md) ve oyun içi **Hakkında** ekranı.

## Bilinen Sınırlar (M1)
- Sürüş/araç fiziği ve yol grafı trafiği **M2**, yayalar/polis/wanted **M3**, gelişmiş İstanbul ses/radyo/gün-gece **M4**, hikâye/görevler **M5** aşamasında eklenecektir.
- Gerçek Android cihaz FPS/RAM ve 10 dk soak testi henüz ölçülmemiştir (bkz. `docs/memory/PERF_BUDGET.md` ve `docs/memory/KNOWN_ISSUES.md`).
