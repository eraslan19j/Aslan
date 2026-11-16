# Istanbul Streets

Gerçek İstanbul atmosferinden ilham alan, tamamen orijinal, 3. şahıs açık dünya suç/aksiyon ve sürüş oyunu.

- **Paket Adı:** `com.istanbulstreets.game`
- **Hedef Platformlar:** Android 16 (API 36, minSdk 24, `sensorLandscape`) + Web Demosu
- **Mevcut Aşama:** **M0 İskelet (`v0.0.1-m0`)** — Çalışan 3B İstanbul gün batımı başlangıç sahnesi, Rapier3D WASM fizik entegrasyonu, Lite/Normal kalite modu, TR/EN dil desteği, global hata yakalayıcı + yerel kilitlenme günlüğü, sürümlü + yedekli kayıt sistemi, Capacitor 8 Android API 36 projesi ve otomatik GitHub Actions APK/CI hattı.

## Özellikler (M0)
- **Saf TS Çekirdek / Three.js Ayrımı:** Simülasyon matematiği, deterministik RNG, sabit 60 Hz döngü, kayıt/yedek kurtarma, kilitlenme günlüğü, kalite profilleri, güvenli alan (sanctuary) kuralları ve Rapier3D fizik testleri Node ortamında birim testlidir (`ESLint` sınır denetimli).
- **Performans Bütçesi ve Lite Modu:** Tek güneş gölgesi, instanced ufuk çizgisi, `pixelRatio <= 1.5` (Lite `<= 1.0`, gölgesiz), canlı FPS / draw call / üçgen sayacı.
- **Android 16 (API 36) Uyumlu:** Capacitor 8.6.2, `sensorLandscape`, immersive tam ekran, ekran açık tutma, 120 Hz ekran modu tercihi, güvenli alan (`env(safe-area-inset-*)`), geri tuşu ile duraklatma.
- **Çevrimdışı & Güvenli:** Çalışma zamanında canlı API bağımlılığı yok; Ayasofya ve Sultanahmet Camii çevresi şiddetsiz güvenli alan olarak tanımlıdır.

## Kontroller
- **Masaüstü:** `WASD` veya Ok tuşları (Yürü), `Shift` (Koş), `Esc` (Duraklat)
- **Dokunmatik / Mobil:** Sol ekran analog kolu (Yürü), sağ alt `KOŞ` düğmesi, telefon Geri tuşu (Duraklat)

## Kurulum ve Geliştirme Komutları
```bash
npm ci               # Bağımlılıkları kur
npm run dev          # Yerel geliştirme sunucusu
npm run typecheck    # TypeScript tip kontrolü
npm run lint         # ESLint kontrolü
npm test             # Vitest birim testleri
npm run build        # Üretim web derlemesi -> dist/
npm run smoke        # Playwright headless Chromium duman testi
npm run cap:sync     # dist/ -> android/ Capacitor senkronizasyonu
```

## Android APK İndirme
Hazır debug APK dosyaları **GitHub Releases** sekmesinde yayınlanır. Kurulum ve diğer kullanıcı adımları için [`docs/USER_TASKS.md`](./docs/USER_TASKS.md) dosyasına bakın.

## Lisanslar ve Atıflar
Tüm kütüphane, referans repo ve coğrafi veri atıfları (OpenStreetMap, Overture Maps, İBB Açık Veri Portalı, Copernicus DEM GLO-30) [`docs/memory/CREDITS.md`](./docs/memory/CREDITS.md) dosyasında ve oyun içi **Hakkında** ekranında yer alır.

## Bilinen Sınırlar (M0)
- M0, teknik iskelet ve doğrulama aşamasıdır: gerçek Sultanahmet–Eminönü haritası **M1**, sürüş ve trafik **M2**, yaya/polis/wanted **M3**, İstanbul landmark ve ses/radyo **M4**, ana hikâye ve görevler **M5** aşamasında eklenecektir.
- Gerçek Android cihazda FPS henüz ölçülmemiştir (bkz. `docs/memory/PERF_BUDGET.md`).
