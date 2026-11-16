# Bölge Kimlik Kartı — v0.1: Fatih (Sultanahmet–Eminönü)

## 1. Coğrafi Sınırlar (M1 Offline Tile Üretimi İçin)
- **Yaklaşık Kapsam (~2 km²):**
  - Güney: `41.0020` | Kuzey: `41.0145`
  - Batı: `28.9660` | Doğu: `28.9845`
- **Tile Izgarası:** 300 m × 300 m offline GLB + JSON karoları (~6×5 karo).
- **Not:** Kesin landmark koordinatları M1 veri hattında Nominatim/Overpass üzerinden doğrulanacak; aşağıdakiler başlangıç referansıdır.

## 2. Önemli Noktalar ve Güvenli Bölgeler (Sanctuary Zones)
| Nokta | Tür | Oyun Kuralı |
|---|---|---|
| **Ayasofya-i Kebir Cami-i Şerifi** | Aktif İbadethane (Sanctuary) | İç mekân kapalı; çevre tampon alanında (~65 m) silah, şiddet, çatışma ve ragdoll **kilitli** |
| **Sultanahmet Camii** | Aktif İbadethane (Sanctuary) | İç mekân kapalı; çevre tampon alanında (~75 m) silah, şiddet, çatışma ve ragdoll **kilitli** |
| **Sultanahmet Meydanı (Hipodrom)** | Açık Meydan | Yaya yoğunluğu yüksek, simit tezgâhları, sokak kedileri, anıt sütunlar |
| **Divanyolu Caddesi & T1 Tramvay Hattı** | Ana Arter | Çift yön tramvay rayı, sarı taksiler, dar kaldırımlar, esnaf vitrinleri |
| **Kapalıçarşı Çevresi (Beyazıt yönü)** | Labirent Sokaklar | Dar yokuşlu kaçış sokakları, han avluları, yüksek yaya akışı |
| **Eminönü Meydanı & İskele** | Kıyı / Liman | Vapur iskeleleri, Haliç/Boğaz su hattı, martılar, çay ocakları, Bölüm 1 final noktası |

## 3. Görsel ve Mimari Kimlik
- **Renk Paleti:** Sıcak kireçtaşı beji (`#d9c7a8`), eski tuğla terakota (`#b66b4e`), kurşun kubbe grisi (`#7c848c`), ahşap cumbalı konak kahvesi (`#7d5a42`), tramvay kırmızısı/gümüşü, İstanbul taksi sarısı (`#f5b800`), gün batımı Boğaz turuncusu (`#f08b4c`) ve derin deniz laciverti (`#1b3c59`).
- **Bina Tipolojisi:** 2–5 katlı tarihî kâgir yapılar, ahşap cumbalı ara sokak evleri, taş hanlar, kurşun kaplı kubbeler (yalnızca dış silüet landmark olarak elle/prosedürel modellenir).
- **Zemin:** Ana caddede asfalt + tramvay taşı; meydan ve ara sokaklarda Arnavut kaldırımı (prosedürel doku).

## 4. Ses Ortamı ve Yaşam Yoğunluğu
- **Ses Katmanı (M4):** Uzak vapur düdüğü, martı çığlıkları, tramvay çanı, hafif trafik uğultusu, iskele su şıpırtısı (Web Audio + CC0).
- **Yoğunluk:** Meydan ve Eminönü sahilinde yüksek yaya; ara sokaklarda orta/düşük; Divanyolu ve Sahil Yolu'nda akıcı sarı taksi + minibüs trafiği.
- **Veri Kaynakları:** OSM (ODbL) + Overture Maps + Copernicus DEM GLO-30 (N41 E028) + İBB Açık Veri Portalı (vapur iskele & durak vektörleri).
