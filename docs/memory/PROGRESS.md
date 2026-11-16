# PROGRESS.md — İlerleme ve Sıradaki Adımlar

Son güncelleme: **2026-11-16** (Oturum 2 — Esenler Varsayılan Bölge + ODbL + M1.5 Görsel & Android Emülatör QA + M2 Sürüş & Trafik `v0.2.0` Tamamlandı)

## Aşama Tablosu

| Aşama | Hedef | Durum | Kanıt / Not |
|---|---|---|---|
| **M0 İskelet** | Repo, hafıza, CI, Capacitor 8 (API 36), başlangıç 3B sahne, `USER_TASKS.md`, Release APK | ✅ Tamamlandı | CI (`43947277709`) + Android API 36 (`43947277723`) yeşil; Release `v0.0.1-m0` (5.94 MB APK) |
| **M1 Dünya** | Fatih (Sultanahmet–Eminönü) offline veri hattı, 300 m karo akışı, 3. şahıs yürüme, çarpışma, güvenli alan, atıf ekranı | ✅ Tamamlandı | Gerçek veri hasadı (`43948133177` + `43949962553`, 1.7 MB, 3,661 bina), Release `v0.1.0-m1` (6.37 MB APK) — ikinci bölge olarak korunuyor |
| **M1.5 Esenler + ODbL + Görsel & Emülatör QA** | Esenler / Namık Kemal varsayılan bölge (SHA-256 doğrulamalı `osm_data.zip`), otomatik ibadethane Güvenli Alanları, ODbL ayrımı, 14-çekim Playwright QA + piksel regresyon, x86_64 KVM Android emülatör QA, Ayarlar Tanılama Paneli (`RAPORU KOPYALA`), %100 telefon-odaklı `USER_TASKS.md` | ✅ Tamamlandı | Esenler hasat (`43963862378`, SHA-256 doğrulandı, 1.9 MB, 44 karo, 4,474 bina, 10 cami Güvenli Alanı); görsel QA Önce (`371a147`) → 6 bulgu düzeltildi → Sonra (`765e9b9`, 14/14 çekim, 0 konsol hatası, 0 HUD uyarısı, `qa-screens` üzerinden piksel piksel doğrulandı); Android x86_64 KVM emülatör QA (`43968724537`, 2400×1080 yatay, joystick `0 m → 5 m`, Geri → Duraklat, 0 crash/ANR) |
| **M2 Sürüş & Trafik (`v0.2.0`)** | Çoklu bölge seçici, sürülebilir Sarı Taksi (BİN/İN, eğim hizalamalı sürüş fiziği, hız göstergesi, 20:9 dokunmatik sürüş tuşları), gerçek yol grafı AI trafiği (2 draw call instanced), soak testi, `v0.2.0` API 36 APK | ✅ Tamamlandı | 31/31 birim testi; CI Smoke + 14-çekim QA + 3 dk Esenler sürüş soak (`43968724580`: maks 47 draw call, `texDrift: 0`, `heapGrowthMb: -10.67 MB`, 0 hata); Release **`v0.2.0`** API 36 Debug APK (`43968724584`, **6.84 MB**). *Not: Gerçek Android telefon FPS ölçümü kullanıcının `RAPORU KOPYALA` paylaşımını bekliyor.* |
| **M3 Suç** | Yayalar, panik, Wanted 1–5, kurgusal Şehir Polisi AI, HUD/minimap, WASTED/BUSTED, Güvenli Alan silah/şiddet kilidi | ⚪ Sıradaki | Esenler (10 ibadethane) + Fatih (3 tarihi cami) otomatik Güvenli Alan algılaması aktif |
| **M4 İstanbul Hissi** | Gelişmiş landmark'lar, dinamik gün/gece döngüsü, Web Audio motor/trafik/ortam sesi, radyo, martı/kedi/simit, Fatih kıyı düzleştirmesi | ⚪ Bekliyor | Gündüz/Gece ışık & far/pencere geçişi M2'de temeliyle hazır |
| **M5 Oyun** | Bölüm 1 hikâyesi (5 ana görev + 3 yan aktivite — Esenler + Fatih), kayıt, ayarlar, 10 dk soak testi, AdMob + IAP (test kimlikleri) | ⚪ Bekliyor | Esenler anonim mahalle görev noktaları (bakkal, çay ocağı, park, okul, pazar) haritada işaretli |
| **M6 Mağaza** | İkon 512×512, öne çıkan 1024×500, ekran görüntüleri, gizlilik politikası, Play Checklist, Termux imzalı AAB | ⚪ Bekliyor | `privacy.html`, `PLAY_CHECKLIST.md` ve telefon-odaklı Termux `USER_TASKS.md` hazır |
| **M7+ Yeni Bölgeler** | Beyoğlu, Beşiktaş, Üsküdar + Kadıköy… | ⚪ Bekliyor | Çoklu bölge kayıt defteri (`src/core/world/regions.ts`) aktif ve testli |

## GitHub Issue Takibi
- `#1` `[M0]`, `#2` `[M1]` ve `#3` `[M2]` teknik olarak tamamlandı (bkz. `KNOWN_ISSUES.md` — sandbox token'ı `gh issue close` iznine sahip değil).
- `#4` `[M3]` – `#7` `[M6]` açık ve sırayla işlenecek.

## Sıradaki 3 Adım (M3 İçin)
1. **Gerçek Telefon Verisi:** Kullanıcı `v0.2.0` APK'sını telefonuna kurup **Ayarlar → RAPORU KOPYALA** çıktısını paylaştığında gerçek cihaz FPS/GPU/RAM değerlerini `PERF_BUDGET.md`'ye işle ve gerekirse Lite/Normal ayarlarını ince ayarla.
2. **M3 Yaya AI + Wanted 1–5 + Kurgusal Şehir Polisi:** Esenler sokaklarında kaldırım/yaya dolaşımı, trafik/yaya etkileşimi, 1–5 yıldız Wanted merdiveni, 10 ibadethane Güvenli Alanında otomatik silah/şiddet kilidi, 2B minimap (yollar + cami güvenli alanları + polisler) ve WASTED / BUSTED döngüsü.
3. **10 dk Soak & Emülatör WebView Güncelleme Denemesi:** `workflow_dispatch` ile 10 dk tam soak doğrulaması ve Android API 35 emülatör imajında daha güncel WebView ile 3B tuval testini değerlendir.
