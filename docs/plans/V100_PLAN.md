# v1.0 Planı — "Play Store'a Hazır Oyun"

> Bu plan **yalnızca arabalar ve araca bağlı sistemler** kapsamındadır (kullanıcı talimatı).
> v0.9.0 tamamlandı; buradaki maddeler v1.0'a kadar sırayla işlenecek.
> Güncel durum için önce [`docs/memory/STATE.md`](../memory/STATE.md) oku.

## 0. v0.9.0'ın Devrettiği Miras

| Hazır olan | Dosya |
|---|---|
| 7 araçlık tam teknik katalog (fizikle test senkronu) | `src/core/vehicleCatalog.ts` |
| OBB↔OBB çarpışma çözücü + temas yaması | `src/core/vehicleCollision.ts` |
| 10 panelli hasar modeli | `src/core/vehicleDamage.ts` |
| Görsel hasar (ezilme, kopan parça, duman, cam) | `src/render/vehicleDamageVisuals.ts` |
| Katmanlı motor/egzoz/turbo DSP | `public/audio/engine-worklet.js` |
| 3 katmanlı lastik sesi | `src/core/vehicleAudioModel.ts` |
| Kapı animasyonu durum makinesi | `src/render/doorChoreography.ts` |
| Sade HUD + hasar çubuğu | `src/ui/HudOverlay.ts` |

---

## 1. Kapı Animasyonunu Karakterle Senkronize Et (K2)

**Sorun:** Şu an kapı açılıyor, karakter sonra ışınlanarak koltuğa geçiyor. Telefonda bu "kırpılma" gibi görünüyor.

**Yapılacak:**
- `stepCharacter`'a `boarding` durumu ekle: karakter kapıya 0.9 m yaklaşır → `doorChoreography` `opening` biter → karakter koltuğa **0.35 sn'lik bir eğri** ile (`easeInOutCubic`) hareket eder → kapı kapanır.
- Kamera bu 0.35 sn'de hafifçe yaklaşmalı (`fov 62 → 58`).
- Çıkışta tersi: kapı açılır → karakter kapıdan dışarı adım atar → kapı kapanır.
- **Kabul:** `boardingActor.test.ts` — karakterin konumu her karede kapı pivotu ile koltuk arasında monoton ilerlemeli, hiçbir karede 0.5 m'den fazla sıçrama olmamalı.

## 2. Şanzıman & Motor Derinliği (R7)

- Motor freni (engine braking) katsayısını araç başına ayrı ver: dizel dolmuş 0.42, benzinli spor 0.18.
- Turbo lag eğrisini katalogdaki `hasTurboWhistle` + hacimden türet; küçük hacim = hızlı spool.
- DCT/AT farkı: DCT'de vites kesintisi 0.11 s, AT'de 0.26 s + tork konvertörü kayması (900 rpm bandında %8 kayıp).
- **Kabul:** `powertrain.test.ts` — 0–100 süreleri katalogla ±0.15 s içinde; süreklilik testinde turboda ani tork sıçraması yok.

## 3. Lastik & Süspansiyon Görsel Derinliği (P4)

- Kamber değişimini yanal yükten türet (şu an sabit 0.02/0.06).
- Süspansiyon sıkışmasını tekerlek gövdesine yansıt: çamurluk ile tekerlek arası boşluk dinamik olsun.
- Ağır çarpmada aks kırılması: tekerlek 8 m/s üstü yanal darbede ±14° yatık kalır (GTA'daki "topal tekerlek").
- **Kabul:** `suspension.test.ts` — yanal ivme 8 m/s²'de dış tekerlek sıkışması iç tekerlekten büyük; kırık aksta yatıklık kalıcı.

## 4. Nitro & Turbo Ses İnce Ayarı (A7)

**Sorun:** Kullanıcı nitro/turbo seslerinin güçlendirilmesini istedi; DSP yazıldı ama gerçek telefon hoparlöründe kulakla doğrulanmadı.

- Nitro: 3 katman (basınçlı hava "whoosh" + metalik rezonans + egzoz patlaması), 320 ms giriş / 180 ms çıkış.
- Turbo: ıslık temeli hız ile 2.4 → 9.1 kHz; wastegate "chuff" sesi gaz bırakınca.
- Telefon hoparlörü 300 Hz altını keser → tüm bu katmanlara **350 Hz üstü harmonik** eklenmeli (şu an sub-bass ağırlıklı).
- **Kabul:** `audioLayers.test.ts` — her katmanın spektral ağırlık merkezi > 400 Hz; toplam çıkış hiçbir ayarda kırpılmıyor (`peak < 0.98`).

## 5. NPC Araç Çeşitliliği (V3)

- Instanced bucket sayısını 3'ten (sedan/suv/sports) **7'ye** çıkar: gerçek araç sınıfları (hatchback, taxi, van, dolmuş ayrı gövde silüeti).
- Her sınıfa 3 renk paleti → görsel tekrar hissi kırılır.
- Dolmuş ve taksi için tabela/ışık detayı (kurgusal isimler).
- **Bütçe:** +4 draw call (toplam ≤ 145).

## 6. Hasar Ekranı & Tamir Ekonomisi (D4)

- Hasar aldığında HUD'da 4 sn görünen "HASAR %32 · TAMİR ₺410" kartı.
- Tamir: duraklat menüsünde değil, haritadaki 3 tamirci noktasında (mevcut landmark altyapısı kullanılır).
- Motor öldüyse araç çalışmaz; en yakın tamirciye çekme (çok yavaş sürüş, 12 km/s tavan).
- **Kabul:** `repairEconomy.test.ts` — hasar puanı → TL dönüşümü katalogla uyumlu, iflas durumunda bile tamir mümkün.

## 7. Play Store Paketi (M6 — v1.0 blokeri)

- 512×512 ikon, 1024×500 öne çıkan görsel, 8 telefon ekran görüntüsü (16:9 yatay).
- Kısa açıklama (80 karakter) + uzun açıklama (4000 karakter) — **GTA/Rockstar/marka adı yasak** (AGENTS.md).
- Gizlilik politikası (mevcut `privacy.html` güncellenecek: hasar verisi toplanmıyor).
- Veri güvenliği formu: "hiçbir veri toplanmıyor" beyanı.
- İmzalı AAB: CI'da `ANDROID_KEYSTORE_*` secret'ları ile.
- 12 testçi × 14 gün kapalı test → üretim.

## 8. Performans Bütçesi (v1.0 hedefi)

| Metrik | v0.8.0 | v0.9.0 | v1.0 hedefi |
|---|---|---|---|
| Draw call | 131 | ~136 | **≤ 145** |
| Üçgen | 21.7k | ~24k | **≤ 30k** |
| Test sayısı | 67 | 104 | **≥ 130** |
| APK boyutu | 7.27 MB | 7.29 MB | **≤ 9 MB** |
| Soak (10 dk) bellek artışı | — | ölçülmedi | **< 8 MB** |

---

## Uygulama Sırası

1. **K2** (kapı senkronu) — görsel olarak en çok fark edilen eksik.
2. **A7** (nitro/turbo hoparlör ayarı) — kullanıcı geri bildirimi bekliyor.
3. **D4** (tamir ekonomisi) — hasar sistemini oyuna bağlar.
4. **V3** (NPC çeşitliliği) — görsel zenginlik.
5. **R7 + P4** (şanzıman, süspansiyon derinliği).
6. **M6** (Play Store paketi) ve sürüm.

## Riskler

| Risk | Etki | Azaltma |
|---|---|---|
| K2'de kamera kırpılması | Oyuncu bulantısı | Kamera geçişini `smoothDamp` ile 0.35 sn'ye yay |
| A7'de kırpma (clipping) | Ses bozulması | Master limiter + katman başına tepe ölçümü testi |
| V3'te draw call patlaması | FPS düşüşü | Bucket başına 1 gövde + 1 tekerlek = 14 çağrı; ölçülüp bütçeye alınacak |
| Play Store reddi | v1.0 gecikir | Marka/GTA adı taraması CI'da `grep -ri "gta\|rockstar"` ile otomatik |
