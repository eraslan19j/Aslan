# PROGRESS.md — İlerleme ve Sıradaki Adımlar

Son güncelleme: **2026-11-17** (Oturum 3 — Gerçek Android 16 Ölçümü + `v0.2.1` Görünmez Duvar Düzeltmesi, Tam Görsel Yenileme ve Kurgusal Mahalle İsimlendirmesi)

## Aşama Tablosu

| Aşama | Hedef | Durum | Kanıt / Not |
|---|---|---|---|
| **M0 İskelet** | Repo, hafıza, CI, Capacitor 8 (API 36), başlangıç 3B sahne, `USER_TASKS.md`, Release APK | ✅ Tamamlandı | CI (`43947277709`) + Android API 36 (`43947277723`) yeşil; Release `v0.0.1-m0` (5.94 MB APK) |
| **M1 Dünya** | Fatih (Sultanahmet–Eminönü) offline veri hattı, 300 m karo akışı, 3. şahıs yürüme, çarpışma, güvenli alan, atıf ekranı | ✅ Tamamlandı | Gerçek veri hasadı (`43948133177` + `43949962553`, 1.7 MB, 3,661 bina), Release `v0.1.0-m1` (6.37 MB APK) — ikinci bölge (`Tarihî Yarımada`) olarak korunuyor |
| **M1.5 Veri + ODbL + Görsel & Emülatör QA** | Varsayılan mahalle offline veri paketi (SHA-256 doğrulamalı `osm_data.zip`), otomatik ibadethane Güvenli Alanları, ODbL ayrımı, 14-çekim Playwright QA + piksel regresyon, x86_64 KVM Android emülatör QA, Ayarlar Tanılama Paneli (`RAPORU KOPYALA`), %100 telefon-odaklı `USER_TASKS.md` | ✅ Tamamlandı | Hasat (`43963862378`, SHA-256 doğrulandı, 1.9 MB, 44 karo, 4,474 bina, 10 cami Güvenli Alanı); 14/14 görsel QA & Android x86_64 KVM emülatör QA (`43968724537`) doğrulandı |
| **M2 Sürüş & Trafik (`v0.2.0` → `v0.2.1`)** | Çoklu bölge seçici, sürülebilir Sarı Taksi, AI trafik, soak testi, **gerçek Android 16 doğrulaması**, görünmez duvar çözümü, tam görsel yenileme, kurgusal mahalle adlandırması | ✅ Tamamlandı | İlk gerçek telefon ölçümü (`2412DPC0AG`, Android 16, Mali-G720 MC7): **`60.2 FPS`, `16.62 ms`, `23.4 MB` heap, `0` crash**. `v0.2.1` ile kesin 2B çokgen bina çarpışması, duvar sıyırmalı sürüş fiziği, eklemli insan karakteri, detaylı damalı Sarı Taksi, prosedürel binalar/yollar/ağaçlar/lambalar/gökyüzü, `meshMerge` draw-call birleştirmesi ve `Tepe Mahallesi` adlandırması tamamlandı (33/33 birim testi) |
| **M3 Suç & Mobil Standartları (`v0.3.0`)** | Mobil oyun kıyaslaması (`MOBILE_BENCHMARK.md`), canlı dönen 2B minimap radarı, prosedürel Web Audio motor/drift/korna/siren/görev sesi, 32 instanced yaya, katı trafik çarpışması + yokuş eğimi, Sarı Taksi yolcu görevleri (`₺`), Wanted 1–5★ + çakarlı kurgusal Şehir Polisi + BUSTED, 4 kamera açısı, mobilde DRİFT/Korna/Taksi Çağır | ✅ Tamamlandı | 38/38 birim testi (`m3Systems.test.ts` dâhil), hayalet trafik ve dokunmatik takılı-tuş hataları giderildi; `v0.3.0` CI & API 36 APK doğrulanıyor |
| **M4 İstanbul Hissi** | Gelişmiş landmark'lar, dinamik gün/gece döngüsü, Web Audio motor/trafik/ortam sesi, radyo, martı/kedi/simit, Fatih kıyı düzleştirmesi | ⚪ Bekliyor | Gündüz/Gece ışık & far/pencere geçişi M2'de temeliyle hazır |
| **M5 Oyun** | Bölüm 1 hikâyesi (5 ana görev + 3 yan aktivite — Esenler + Fatih), kayıt, ayarlar, 10 dk soak testi, AdMob + IAP (test kimlikleri) | ⚪ Bekliyor | Esenler anonim mahalle görev noktaları (bakkal, çay ocağı, park, okul, pazar) haritada işaretli |
| **M6 Mağaza** | İkon 512×512, öne çıkan 1024×500, ekran görüntüleri, gizlilik politikası, Play Checklist, Termux imzalı AAB | ⚪ Bekliyor | `privacy.html`, `PLAY_CHECKLIST.md` ve telefon-odaklı Termux `USER_TASKS.md` hazır |
| **M7+ Yeni Bölgeler** | Beyoğlu, Beşiktaş, Üsküdar + Kadıköy… | ⚪ Bekliyor | Çoklu bölge kayıt defteri (`src/core/world/regions.ts`) aktif ve testli |

## GitHub Issue Takibi
- `#1` `[M0]`, `#2` `[M1]` ve `#3` `[M2]` teknik olarak tamamlandı (bkz. `KNOWN_ISSUES.md` — sandbox token'ı `gh issue close` iznine sahip değil).
- `#4` `[M3]` – `#7` `[M6]` açık ve sırayla işlenecek.

## Sıradaki 3 Adım (M3 İçin)
1. **Gerçek Telefon `v0.2.1` Onayı:** Kullanıcı yeni `v0.2.1` APK'sını telefonunda test edip sürüş akıcılığı, görsel kalite ve FPS'i doğrulayacak.
2. **M3 Yaya AI + Wanted 1–5 + Kurgusal Şehir Polisi:** Tepe Mahallesi sokaklarında kaldırım/yaya dolaşımı, trafik/yaya etkileşimi, 1–5 yıldız Wanted merdiveni, 10 ibadethane Güvenli Alanında otomatik silah/şiddet kilidi, 2B minimap (yollar + cami güvenli alanları + polisler) ve WASTED / BUSTED döngüsü.
3. **M4 İstanbul Hissi & Ses:** Dinamik gün/gece döngüsü, Web Audio motor/trafik/ortam sesi, sokak detayları ve Fatih kıyı düzleştirmesi.
