# Türetilmiş Coğrafi Veri Lisans Bildirimi (ODbL 1.0 & Copernicus DEM)

Bu klasör (`public/derived-data/`), **Istanbul Streets** oyununun kaynak kodundan (`src/`) **ayrı** olarak saklanan, çevrimdışı 300 m karo paketlerini, yol graflarını, arazi yükseklik ızgaralarını ve anonimleştirilmiş mahalle yer işareti verilerini içerir.

## 1. OpenStreetMap Türetilmiş Veritabanı (ODbL 1.0)
- **Lisans:** Open Database License (ODbL) v1.0 — https://opendatacommons.org/licenses/odbl/1-0/
- **Atıf:** `© OpenStreetMap contributors` (https://www.openstreetmap.org/copyright)
- **Kapsam:**
  - `esenler-namik-kemal/` — Kaynak: `https://github.com/eraslan19j/ist/releases/download/v1.1-esenler-data/osm_data.zip` (886,185 bayt, SHA-256: `8849228b90c2ac807e707bfc91e1b6d0bddb40107afb4962951b20654f621fff`) + OpenStreetMap Overpass API (park, su, ibadethane ve anonimleştirilmiş mahalle noktaları tamamlaması).
  - `fatih-sultanahmet-eminonu/` — Kaynak: OpenStreetMap Overpass API (`south: 41.0020, north: 41.0145, west: 28.9660, east: 28.9845`).
- **Share-Alike (ODbL §4.4 / §4.6):** Bu klasördeki tüm türetilmiş JSON veri dosyaları (`.json` karoları, `road-graph.json`, `manifest.json`) ODbL 1.0 altında herkese açık olarak sunulur. Oyunun `src/` altındaki 3B motor ve oynanış kodu ODbL §4.3 uyarınca *Produced Work* kapsamındadır ve ayrı lisanslanır (bkz. `docs/memory/DECISIONS.md` → `ADR-009`).
- **Gizlilik ve Marka Politikası:** Kişisel ev adresleri (`addr:*`) ve gerçek ticari işletme/marka isimleri türetme aşamasında temizlenmiş veya genel mahalle etiketleriyle anonimleştirilmiştir.

## 2. Copernicus DEM GLO-30 (Arazi Yüksekliği)
- **Dosyalar:** `*/terrain.json`
- **Kaynak:** AWS Open Data (`s3://copernicus-dem-30m`, `Copernicus_DSM_COG_10_N41_00_E028_00_DEM`)
- **Atıf:** `© DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.`

## 3. İBB Açık Veri Portalı
- **Atıf:** `Kaynak: İBB Açık Veri Portalı` (İBB Açık Veri Lisansı — https://data.ibb.gov.tr)
