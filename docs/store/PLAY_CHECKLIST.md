# PLAY_CHECKLIST.md — Google Play Mağaza Hazırlık Listesi

Son politika doğrulaması: **2026-11-16** (Detaylar: `docs/memory/DECISIONS.md` ADR-003)

## 1. Teknik Uyumluluk
- [ ] **Hedef SDK:** `compileSdkVersion = 36`, `targetSdkVersion = 36` (Android 16 — 31 Ağustos 2026'dan beri zorunlu)
- [ ] **Min SDK:** `minSdkVersion = 24` (Capacitor 8)
- [ ] **Format:** İmzalı **Android App Bundle (`.aab`)** + **Play App Signing** etkin
- [ ] **Boyut:** Sıkıştırılmış taban indirme `< 150 MB` (Play mobil veri uyarı eşiği 200 MB)
- [ ] **Play Billing Library:** `8.0.0+` (M5'te IAP eklendiğinde zorunlu; M0–M4'te faturalandırma izni yok)
- [ ] **Android 16 Edge-to-Edge & Geri Tuşu:** Güvenli alan (`env(safe-area-inset-*)`) ve geri tuşu duraklatma doğrulandı
- [ ] **Çökme / ANR:** 10 dk soak testi yeşil, global hata yakalayıcı + güvenli kayıt aktif

## 2. Hesap & Kapalı Test (Kişisel Hesap)
- [ ] Google Play Geliştirici Hesabı açıldı (25 USD) — bkz. `docs/USER_TASKS.md`
- [ ] Kapalı testte en az **12 gerçek testçi** (hedef 18–20) **kesintisiz 14 gün** aktif katılım sağladı
- [ ] Test geri bildirimleri ve iyileştirmeler kayıt altına alındı (üretime başvuru formu için)

## 3. Politika, Gizlilik ve Yaş Derecelendirmesi
- [ ] **Gizlilik Politikası URL'si:** Canlı HTTPS adresi (`https://eraslan19j.github.io/Aslan/privacy.html`), TR + EN, KVKK & GDPR uyumlu
- [ ] **Veri Güvenliği (Data Safety) Formu:** Toplanan/paylaşılan veriler (M5'te AdMob cihaz/reklam kimliği, yerel kayıt — sunucuya kişisel veri gönderilmez) dürüstçe beyan edildi
- [ ] **Hedef Kitle:** **18+** olarak beyan edildi (çocuklara yönelik DEĞİL)
- [ ] **IARC İçerik Derecelendirmesi:** Stilize suç/şiddet ve (M5'te) reklam/IAP dürüstçe işaretlendi
- [ ] **Reklam Beyanı:** M5'te reklamlar eklendiğinde "Uygulama reklam içerir" işaretlendi; UMP rıza akışı aktif
- [ ] **Telif & Marka Kontrolü:** Başlıkta, kısa/uzun açıklamada, ekran görüntülerinde "GTA", "Grand Theft Auto", "Vice City", "Rockstar", gerçek araç markası veya gerçek polis amblemi **SIFIR**
- [ ] **Hassas Mekân Kuralı:** Ayasofya ve Sultanahmet Camii çevresi şiddetsiz güvenli bölge; oyun içi Hakkında ekranında OSM/Overture/İBB/Copernicus atıfları görünür

## 4. Mağaza Görselleri ve Metinleri (M6)
- [ ] **Uygulama İkonu:** `512 × 512 px`, 32-bit PNG (alfa kanalı serbest), < 1 MB, promosyon metni/rozet YOK
- [ ] **Öne Çıkan Görsel (Feature Graphic):** `1024 × 500 px`, JPEG veya 24-bit PNG (**alfa kanalı YASAK**), < 1 MB
- [ ] **Telefon Ekran Görüntüleri:** 4–8 adet yatay (`1920 × 1080 px`, JPEG veya 24-bit PNG, alfa kanalı YASAK, < 8 MB), gerçek oyundan alınmış
- [ ] **Kısa Açıklama (≤ 80 karakter):** Türkçe + İngilizce
- [ ] **Uzun Açıklama (≤ 4000 karakter):** Türkçe + İngilizce
- [ ] **Sürüm Notları:** Türkçe + İngilizce
