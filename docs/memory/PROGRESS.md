# PROGRESS.md — İlerleme ve Sıradaki Adımlar

Son güncelleme: **2026-11-18** (Oturum 5 — `v0.10.0` sürüm birleştirme + **Faz 0.5 Godot kanıt prototipi** ilk kez telefona kurulabilir APK üretti)

> **Güncel sürüm özeti için önce [`STATE.md`](./STATE.md) oku.** Bu dosya yalnızca tarihsel aşama tablosudur.

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
| **v0.6.0–v0.8.0 (Sürüş Derinliği)** | 240 Hz Pacejka lastik modeli, 6 ileri şanzıman + debriyaj, turbo/BOV/backfire, CarX drift modu, 4 kamera, dokunmatik CarX HUD, soak testi | ✅ Tamamlandı | 67/67 test, 131 draw call, `v0.8.0` APK 7.27 MB |
| **`v0.9.0` Hasar & Ses** | Araç kataloğu (7 araç, tam teknik künye), OBB↔OBB araba çarpışması, 10 panelli GTA-tarzı hasar (ezilme + kopan parça + duman + cam), hasarın fiziğe etkisi, kapı açma animasyonu, AudioWorklet motor/egzoz/turbo yeniden yazımı, 3 katmanlı lastik sesi, HUD sadeleştirme, NPC araç hasarı | ✅ Tamamlandı | 104/104 test, `tsc`/`eslint`/`build` temiz |
| **`v0.10.0` Sürüm Birleştirme (Faz 0)** | Sürümün tek kaynaktan yönetilmesi; altı yerde ayrışmış sürümün birleştirilmesi | ✅ Tamamlandı | `version.json` tek kaynak, `scripts/sync-version.mjs` 9 hedef, CI'da `version:check` zorunlu. PR #8 squash ile birleşti. 125 test |
| **Faz 0.5 Godot Kanıt Prototipi** | Tahminleri ölçüme çevirmek: Godot 4.7.2 boş proje → CI → APK → telefonda açılıyor → performans ölçümü | 🟡 CI tarafı ✅, telefon ölçümü bekliyor | CI run `44340587460` **yeşil**. K1 ✅ K3 ✅ (36) K4 ✅ (2 `.so`, align 0x4000) K7 ✅ (25 MB). Release `prototype-20261118-154839`. **K2/K5/K6/K8 kullanıcı cihazında ölçülecek** |
| **M7+ Yeni Bölgeler** | Beyoğlu, Beşiktaş, Üsküdar + Kadıköy… | ⚪ Bekliyor | Çoklu bölge kayıt defteri (`src/core/world/regions.ts`) aktif ve testli |

## GitHub Issue Takibi
- `#1` `[M0]`, `#2` `[M1]` ve `#3` `[M2]` teknik olarak tamamlandı (bkz. `KNOWN_ISSUES.md` — sandbox token'ı `gh issue close` iznine sahip değil).
- `#4` `[M3]` – `#7` `[M6]` açık ve sırayla işlenecek.

## Sıradaki 3 Adım (Faz 0.5 kapanışı)

1. **Telefon ölçümü (kullanıcı):** Release `prototype-20261118-154839` → `prototype.apk` indir, kur, aç.
   Ekrandaki sayaçtan **FPS** oku; **3 parmakla dokunup** raporu kopyala ve panele yapıştır.
   Ölçülecek: K2 (açılıyor mu), K5 (FPS ≥ 30), K6 (renderer `mobile(vulkan)`), K8 (oyuncu/NPC aracı aynı mı).
2. **K5 sonucuna göre dallanma:**
   - **≥ 30 FPS** → Faz 1'e geç: tek araç hattı (`VehicleDefinition`) + iç mekân.
   - **< 30 FPS** → profil düşür (gölge 1024², MSAA kapat, fog kapat), yeniden ölç.
     Hâlâ < 30 ise → Filament/C++ yoluna geç (ARCHITECTURE_V2 § karar ağacı).
3. **Faz 1 (yalnız K5 yeşilse):** `feat/g2-vehicle-pipeline` dalı — tek araç tanımı,
   aynı model+materyal+LOD+iç mekân kuralı, `replace_model()` yasak (grep testi V1–V4).

