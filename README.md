# Istanbul Streets

Gerçek İstanbul harita ve yükseklik verileriyle %100 çevrimdışı çalışan, tamamen orijinal, 3. şahıs açık dünya aksiyon ve sürüş oyunu.

- **Paket Adı:** `com.istanbulstreets.game`
- **Hedef Platformlar:** Android 16 (API 36, minSdk 24, `sensorLandscape`) + Web Demosu
- **Mevcut Sürüm:** **`v0.10.0` "Hasar & Ses"** — GTA-tarzı 10 panelli araç hasarı (ezilme, kopan parça, cam kırılması, motor dumanı), OBB↔OBB araba çarpışması (araçlar artık birbirine girmiyor), tamamen yeniden yazılmış katmanlı motor/egzoz/turbo sesi, kayma hızına bağlı 3 katmanlı lastik sesi, kapı senkronlu biniş animasyonu, tamirci ekonomisi ve sade oyun HUD'u.
- **Oynanabilir APK:** [`releases/istanbul-streets-latest-debug.apk`](releases/istanbul-streets-latest-debug.apk) — her etiketli sürümde otomatik güncellenir.
- **Planlar:** [`docs/plans/V090_ROADMAP.md`](docs/plans/V090_ROADMAP.md) (tamamlandı) · [`docs/plans/V100_PLAN.md`](docs/plans/V100_PLAN.md) (sıradaki) · [`docs/plans/VEHICLE_SPECS_V090.md`](docs/plans/VEHICLE_SPECS_V090.md) (7 aracın tam teknik künyesi)
- **Proje hafızası:** [`docs/memory/STATE.md`](docs/memory/STATE.md) — her sürümde güncellenen tek doğruluk kaynağı.

## v0.9.1 Öne Çıkanlar

- **Araç hasarı (D1–D4):** 10 gövde paneli ayrı ayrı hasarlanır; kaput/tampon/çamurluk kuvvet eşiğini aşınca **kopup fırlar**, ön cam kırılır, motor duman çıkarır ve güç kaybeder. Hasarlı araç tamirciye kadar %30 hızla sürünür; tamir `₺` ile yapılır.
- **Çarpışma (P1–P3):** OBB SAT/MTV çözücü + gerçek temas yaması; kütle paylaşımı, sekme katsayısı ve PIT dönüşü.
- **Ses (A1–A7):** AudioWorklet içinde silindir ateşleme dizisi, egzoz banka gecikmesi, susturucu + kuyruk borusu dalga kılavuzu, emme Helmholtz, supap tıkırtısı, turbo spool/BOV/wastegate; nitro 4 katmana ayrıldı ve tamamı telefon hoparlörünün geçirdiği bantta.
- **Biniş animasyonu (K1–K2):** Kapı 1.12 rad açılır, karakter kapıdan yürüyerek biner, kapı kapanır.
- **Sade HUD:** FPS/Çizim/Karo/Bina sayaçları kaldırıldı; yalnızca hasar alınınca görünen ince bir hasar çubuğu var.

## Temel Özellikler (`v0.2.0`'dan beri)

- **Çoklu Çevrimdışı Bölge Paketi (`public/derived-data/`, Toplam 3.6 MB):**
  - **Esenler / Namık Kemal Mahallesi (Varsayılan · 1.9 MB):** SHA-256 doğrulamalı `v1.1-esenler-data/osm_data.zip` + Copernicus DEM GLO-30 (`29.3–90.7 m`) + Overpass; 44 adet 300 m karo, **4,474 OSM bina**, 633 tekilleştirilmiş sokak, 1,922 düğüm / 2,164 kenar, 144 park, 2 su, 12 anonim mahalle noktası (gerçek kişi/marka/ev adresi içermez) ve **10 otomatik `amenity=place_of_worship` Güvenli Alanı**.
  - **Fatih: Sultanahmet–Eminönü (İkinci Bölge · 1.7 MB):** 59 adet 300 m karo, **3,661 OSM bina**, 727 yol, kırmızı T1 tramvay hattı, 1,796 düğüm / 1,924 kenar, Copernicus DEM GLO-30 (`0.0–67.2 m`) ve Ayasofya / Sultanahmet Camii / Yeni Cami Güvenli Alanları. Duraklat menüsünden anlık geçiş.
- **M2 Sürüş & Yol Grafı Trafiği:** Sürülebilir kurgusal Sarı Taksi (`F` veya `BİN/İN`), yokuş eğimine (pitch+roll) oturan şasi, hız göstergesi, el freni, 20:9 sürüş dokunmatik butonları (`◀ ▶`, `GAZ`, `FREN`, `İN`) ve gerçek yol grafında dolaşan 2 draw call instanced AI trafik (taksi/dolmuş/sivil).
- **M1.5 Otomatik Görsel & Android Emülatör QA:** Her push'ta 14 Playwright çekimi (2 bölge × 6+ kamera/mod + 20:9 sürüş & tanılama), `%6` piksel regresyon uyarısı, sürüş soak testi (`heapGrowthMb: -10.67 MB`, `texDrift: 0`, maks 47 draw call) ve Android x86_64 KVM emülatöründe `screencap` + dokunmatik joystick + donanım Geri tuşu + `logcat` doğrulaması (`docs/qa/screens/README.md`).
- **Ayarlar İçi Canlı Tanılama Paneli:** FPS, kare süresi, draw call, üçgen, aktif karo/bina, JS heap, GPU/renderer, WebView sürümü, cihaz modeli ve kalite modunu JSON olarak tek dokunuşla kopyalayan **`RAPORU KOPYALA`** düğmesi.
- **Saf TS Çekirdek / Three.js Ayrımı:** 31/31 birim testi (Node ortamında + Rapier3D WASM), ESLint katman sınır denetimi.

## Kontroller
- **Dokunmatik / Mobil (20:9 Yatay):**
  - *Yaya:* Sol analog kol (Yürü), sağ ekran sürükleme (Kamera), `BİN` (Taksiye bin), `KOŞ` (Sprint), telefon Geri tuşu (Duraklat + Bölge Değiştir)
  - *Sürüş:* Sol `◀ ▶` (Direksiyon), sağ `GAZ` / `FREN` / `İN`
- **Masaüstü / Klavye:** `WASD`/Oklar (Yürü/Sür), `Shift` (Koş), `Space` (El freni), `F` (Taksiye Bin/İn), `Q/E` veya Fare Sürükle (Kamera), `Esc` (Duraklat + Bölge Değiştir)

## Kurulum ve Geliştirme Komutları
```bash
npm ci               # Bağımlılıkları kur
npm run dev          # Yerel geliştirme sunucusu
npm run typecheck    # TypeScript tip kontrolü
npm run lint         # ESLint kontrolü (src/core Three.js sınırı dahil)
npm test             # Vitest saf TS + çoklu bölge veri paketi + Rapier3D testleri (31 test)
npm run build        # Üretim web derlemesi -> dist/
npm run smoke        # Playwright headless Chromium M2 duman testi
npm run qa:screens   # 14 çekim görsel QA + %6 piksel regresyon farkı
npm run soak         # Sürüş & karo akışı bellek/GPU sızıntı testi
npm run cap:sync     # dist/ -> android/ Capacitor senkronizasyonu
```

## Android APK İndirme (Sadece Telefonla Kurulum)
En güncel API 36 Debug APK (**6.84 MB**):
- [`v0.2.0` GitHub Release](https://github.com/eraslan19j/Aslan/releases/tag/v0.2.0)

100% Android telefon odaklı adım adım kurulum, Termux keystore ve gerçek telefon raporu paylaşım rehberi için [`docs/USER_TASKS.md`](./docs/USER_TASKS.md) dosyasına bakın.

## Lisanslar ve Atıflar (ODbL 1.0 & Açık Veri)
- **`© OpenStreetMap contributors` (ODbL 1.0):** Tüm türetilmiş OSM harita/karo verileri kaynak koddan ayrı olarak [`public/derived-data/`](./public/derived-data/) klasöründe ve [`public/derived-data/LICENSE-ODbL.md`](./public/derived-data/LICENSE-ODbL.md) lisans bildirimiyle saklanır. Esenler / Namık Kemal verisi `v1.1-esenler-data/osm_data.zip` (SHA-256 doğrulamalı) + Overpass kaynaklıdır.
- **`Copernicus DEM GLO-30`:** © DLR e.V. 2010–2014 & © Airbus Defence and Space GmbH 2014–2018 (EU / ESA).
- **`Kaynak: İBB Açık Veri Portalı`** (İBB Açık Veri Lisansı).
- Tam liste: [`docs/memory/CREDITS.md`](./docs/memory/CREDITS.md) ve oyun içi **Hakkında** ekranı.

## Bilinen Sınırlar (`v0.2.0`)
- Yayalar, Wanted 1–5 ve kurgusal Şehir Polisi AI **M3**, gelişmiş İstanbul ses/radyo **M4**, hikâye/görevler **M5** aşamasında eklenecektir.
- **Gerçek Android cihaz FPS/RAM ölçümü henüz yapılmamıştır** (`PERF_BUDGET.md`); emülatör/SwiftShader ölçümleri yalnızca görsel/yerleşim/çökme doğrulaması içindir.
