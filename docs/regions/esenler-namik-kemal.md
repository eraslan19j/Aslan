# Bölge Kimlik Kartı — v0.2 (Varsayılan Başlangıç): Esenler / Namık Kemal Mahallesi

## 1. Coğrafi Sınırlar ve Offline Veri Kaynağı
- **Bölge Kimliği:** `esenler-namik-kemal` (Varsayılan başlangıç bölgesi; Fatih ikinci bölge olarak korunur)
- **Resmî Kapsam (yaklaşık 1.9 km²):**
  - Güney: `41.0250` | Kuzey: `41.0370`
  - Batı: `28.8870` | Doğu: `28.9040`
- **Birincil Doğrulanmış Veri Kaynağı:**
  - URL: `https://github.com/eraslan19j/ist/releases/download/v1.1-esenler-data/osm_data.zip`
  - Boyut: `886,185 bayt` (`865.41 KiB`)
  - Doğrulanan SHA-256: `8849228b90c2ac807e707bfc91e1b6d0bddb40107afb4962951b20654f621fff`
  - Arşiv İçeriği (`source-inspection.json`): `manifest.json` + `osm_data.gpkg` (2.8 MB GeoPackage: `buildings` 4,464, `roads` 376, `paths` 259, `landuse` 118, `natural` 19, `waterways` 1, `amenities` 108, `shops` 56, `tourism` 8, `road_network_edges` 2,600, `road_network_nodes` 1,013).
- **Tamamlanan Eksik Katmanlar:**
  - **Arazi Yüksekliği:** `osm_data.gpkg` içinde yükseklik katmanı bulunmadığından **Copernicus DEM GLO-30 (`N41 E028`)** 49×49 ızgara ile örneklendi (gerçek Esenler tepeleri ve eğimleri: **~27 m – 99 m**).
  - **Park / Su / İbadethane / POI Tamamlaması:** Overpass API üzerinden `amenity=place_of_worship`, `leisure=park|playground`, `natural=water` ve mahalle POI'leri çekilerek offline 300 m karolara gömüldü.
- **Türetilmiş Veri Klasörü:** `public/derived-data/esenler-namik-kemal/` (ODbL 1.0 ayrı klasör, bkz. `public/derived-data/LICENSE-ODbL.md`).

## 2. Mahalle Dokusu ve Sürüş Karakteri
- **Konut Ağırlıklı Yoğun Doku:** Bitişik nizam 4–6 katlı apartman blokları, zemin katta mahalle esnafı (anonimleştirilmiş).
- **Dar ve Eğimli Sokaklar:** 5.2 m – 5.8 m genişliğinde tek/çift şeritli mahalle sokakları, sert yokuşlar ve ani köşe dönüşleri; bu sayede M2 sürüş mekaniği dar sokak manevrası, el freni dönüşü ve yokuş tırmanışı üzerine kurulur.
- **Açık Hava & Gece Atmosferi:** Gündüz sıcak kireç/sıva ve tuğla tonları; gece sıcak sodyum sokak ışıkları, apartman pencere parıltıları ve araç farları.

## 3. Anonimleştirilmiş Landmark ve Görev Noktaları
> **Sert Kural:** Gerçek kişi adı, özel ev adresi (`addr:*`) ve gerçek ticari marka/işletme logosu kesinlikle kullanılmaz. OSM'deki gerçek koordinatlar kurgusal/genel mahalle noktalarına dönüştürülür.

| Nokta Türü | OSM Kaynağı | Oyun İçi Rolü (M1.5 – M5) |
|---|---|---|
| **Namık Kemal Merkez Cadde** | Merkezi araç yolu | Varsayılan başlangıç noktası, kurgusal Sarı Taksi & Dolmuş çıkış hattı |
| **Tüm İbadethaneler (Camiler)** | `amenity=place_of_worship` (otomatik tarama) | **Otomatik Güvenli Alan (Sanctuary Zone, r = 52 m):** silah, şiddet, çatışma ve ragdoll kilitli; iç mekânlar kapalı |
| **Mahalle Bakkalı (#1, #2)** | `shop=convenience\|bakery\|greengrocer` | Erken görev teslimat / bilgi toplama noktası |
| **Mahalle Çay Ocağı (#1, #2)** | `amenity=cafe\|tea` | Kurgusal mahalle rehberi / görev başlangıç ve buluşma noktası |
| **Semt Okulu (#1, #2)** | `amenity=school\|kindergarten` | Yön belirleyici mahalle nirengi noktası ve hız düşürme bölgesi |
| **Namık Kemal Parkı (#1, #2)** | `leisure=park\|playground` | Açık nefes alanı, yaya buluşma ve kaçış bağlantısı |
| **Semt Pazar Yeri** | `amenity=marketplace` | Dar kaçış koridoru ve hareketli teslimat görevi noktası |

## 4. Görsel ve Ses Kimliği
- **Renk Paleti:** Sıcak sıva beji (`#d9cab3`), eskitme tuğla (`#b86f52`), şehir asfaltı (`#3c4048`), park yeşili (`#4b854f`), mahalle dolmuş mavisi/sarısı (`#2b6cb0` / `#f5b800`), gece sokak lambası kehribarı (`#ffb347`).
- **Trafik Karması (M2):** Kurgusal İstanbul Sarı Taksi, mahalle dolmuşu ve kompakt sivil araçlar — gerçek yol grafı (`road-graph.json`) üzerinde akıcı sürüş.
- **Atıflar:** `© OpenStreetMap contributors (ODbL 1.0)` + `Copernicus DEM GLO-30 (EU / ESA)` + `Kaynak: İBB Açık Veri Portalı`.
