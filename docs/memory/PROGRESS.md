# PROGRESS.md — İlerleme ve Sıradaki Adımlar

Son güncelleme: **2026-11-16** (Oturum 1 — Kuruluş, M0 Tamamlandı, M1 Gerçek Fatih Dünyası Tamamlandı)

## Aşama Tablosu

| Aşama | Hedef | Durum | Kanıt / Not |
|---|---|---|---|
| **M0 İskelet** | Repo, hafıza, CI, Capacitor 8 (API 36), başlangıç 3B sahne, `USER_TASKS.md`, Release APK | ✅ Tamamlandı | CI (`43947277709`) + Android API 36 (`43947277723`) yeşil; Release `v0.0.1-m0` (5.94 MB Debug APK) yayınlandı |
| **M1 Dünya** | Sultanahmet–Eminönü gerçek offline veri hattı (OSM + Copernicus DEM), 300 m tile akışı, 3. şahıs yürüme, bina çarpışması, güvenli alanlar, kamera, atıf ekranı | ✅ Tamamlandı | Gerçek veri hasadı (`43948133177` + `43949962553`, 1.7 MB, 3,661 bina, Copernicus DEM GLO-30), 25/25 birim testi, CI Playwright smoke (`43949962546`, 41 draw call, 1,526 aktif bina, 0 hata), Release `v0.1.0-m1` (`43949962424`, 6.37 MB API 36 APK). *Not: 10 dk soak ve gerçek Android cihaz FPS henüz ölçülmedi.* |
| **M2 Sürüş** | Rapier3D araç fiziği (sarı taksi, dolmuş, sivil), carjack/bin-in, yol grafı yapay zekâ trafiği, çarpışma | ⚪ Sıradaki | `road-graph.json` (1,796 düğüm / 1,924 kenar) ve Rapier3D WASM hazır |
| **M3 Suç** | Yayalar, panik, Wanted 1–5, kurgusal Şehir Polisi AI, HUD/minimap, WASTED/BUSTED | ⚪ Bekliyor | Ayasofya/Sultanahmet Güvenli Alan kontrolü (`findSanctuaryZone`) şimdiden aktif |
| **M4 İstanbul Hissi** | Gelişmiş landmark'lar, detaylı Boğaz/Haliç suyu, gün/gece döngüsü, dinamik ses, radyo, martı/kedi/simit | ⚪ Bekliyor | M1'de temel Ayasofya, Sultanahmet Camii, Dikilitaş, Eminönü vapuru ve sarı taksi silüetleri eklendi |
| **M5 Oyun** | Bölüm 1 hikâyesi (5 ana görev + 3 yan aktivite), kayıt, ayarlar, 10 dk soak testi, AdMob + IAP (test kimlikleri) | ⚪ Bekliyor | — |
| **M6 Mağaza** | İkon 512×512, öne çıkan 1024×500, ekran görüntüleri, gizlilik politikası, Play Checklist, imzalı AAB | ⚪ Bekliyor | `privacy.html` ve `PLAY_CHECKLIST.md` hazır |
| **M7+ Yeni Bölgeler** | v0.2 Beyoğlu, v0.3 Beşiktaş, v0.4 Üsküdar+Kadıköy… | ⚪ Bekliyor | Bölge kartı + 300 m tile şeması çoklu bölgeye hazır |

## GitHub Issue Takibi
- `#1` `[M0]` ve `#2` `[M1]` oluşturuldu; teknik çalışma tamamlandı (bkz. `KNOWN_ISSUES.md` — sandbox token'ı issue kapatma iznine sahip değil).
- `#3` `[M2]` – `#7` `[M6]` açık ve sırayla işlenecek.

## Sıradaki 3 Adım (Sonraki Oturum İçin)
1. **M2 Sürüş & Araç Fiziği (Rapier3D + Saf TS Çekirdek):** Oyuncunun Sultanahmet Meydanı'ndaki kurgusal **Sarı Taksi**ye binip inmesini (`E`/`F` veya dokunmatik **BİN/İN** düğmesi), arcade-eğlenceli sürüş fiziğini (hızlanma, el freni/drift, geri vites, yokuş tırmanışı, bina çarpışması, hız göstergesi) ve takip kamerasını ekle.
2. **M2 Yol Grafı Trafiği (Sarı Taksi + Dolmuş + Sivil + T1 Tramvay):** M1'de hasat edilen gerçek `road-graph.json` (1,796 düğüm, 1,924 kenar) ve T1 tramvay polilineleri üzerinde instanced yapay zekâ araçları + temel çarpışma/durma kurallarını çalıştır (draw call < 120 koru).
3. **10 dk Soak + Mobil Sürüş Dokunmatik Kontrolü:** Sürüş dokunmatik butonları (Gaz / Fren / Sol-Sağ / Bin-İn) ekle, CI'da soak testi çalıştırıp bellek/geometri sızıntısı olmadığını doğrula ve `v0.2.0-m2` APK yayınla.
