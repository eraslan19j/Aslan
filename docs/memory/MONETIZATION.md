# MONETIZATION.md — Adil Gelir Tasarımı ve Dürüst Beklentiler

Son güncelleme: **2026-11-16**

## 1. Dürüst Gerçeklik Kontrolü (Kullanıcı İçin)
- **Gelir garantisi yoktur.** Google Play'de yayınlanan bağımsız mobil oyunların büyük çoğunluğu ilk aylarda çok düşük gelir elde eder veya sıfıra yakın kalır.
- Gelir bir anda oluşmaz; **oynanabilirlik, çökmeme, D1/D7 elde tutma (oyuncunun 1. ve 7. günde geri dönmesi), mağaza puanı (≥4.2) ve organik yorumlar** gelirden önce gelir.
- **Sıfır maliyet gerçeği:** Google Play'e çıkmak için tek seferlik **25 USD** kayıt ücreti şarttır. Bu ücret karşılanana kadar oyun **GitHub Releases (APK)**, **GitHub Pages (web demo)** ve **itch.io** üzerinden ücretsiz büyütülebilir.

## 2. Adil, Tek Oyunculu Gelir Modeli (M5'te Entegre Edilecek)
- **İndirme:** Ücretsiz (Free-to-Play).
- **Ödüllü Reklam (Rewarded Video — %100 İsteğe Bağlı):**
  - Oyuncu kendi isterse izler: görev sonrası 2× oyun içi para, ücretsiz araç tamiri veya güvenli evde ek can.
- **Aralıklı Reklam (Interstitial — Çok Sınırlı):**
  - Yalnızca görev bittikten sonraki geçiş ekranında (en az 5–7 dakika bekleme süresi ile).
  - **Sürüş, çatışma, yaya kaçışı veya ara sahne sırasında ASLA reklam gösterilmez.**
  - **Banner reklam YOK** (ekran alanını ve oyun atmosferini bozar).
- **Uygulama İçi Satın Alma (IAP — Play Billing Library 8.0.0+):**
  - Tek seferlik **"Reklamları Kaldır" (Remove Ads)** paketi.
  - Yalnızca kozmetik paketler (özel kurgusal araç boyası, karakter kıyafeti).
  - **Pay-to-win YOK. Loot box / kumar mekaniği YOK.**

## 3. Teknik ve Hukuki Uyumluluk
- **Reklam SDK (M5):** `@capacitor-community/admob` (`^8.2.1`, MIT, Capacitor 8 uyumlu).
- **Faturalandırma SDK (M5):** `capacitor-plugin-cdv-purchase` (`^13.19.1`, MIT) veya `@spruik/capacitor-iap` (MIT) — Gradle'da `com.android.billingclient:billing:8.+` çözülmesi zorunlu.
- **Test Kimlikleri:** Geliştirme, CI ve kapalı test boyunca **yalnızca Google'ın resmî test reklam kimlikleri** kullanılır. Kendi gerçek reklamına tıklamak kesinlikle yasaktır.
- **Rıza ve Gizlilik:** AB/AEA kullanıcıları için Google UMP (GDPR) rıza akışı + Türkiye KVKK ve Google Play Veri Güvenliği ile uyumlu Türkçe + İngilizce Gizlilik Politikası (`public/privacy.html` → GitHub Pages).

## 4. Başarı Ölçütleri (KPI)
| Metrik | İlk Hedef (Kapalı Test & v0.1) | Sağlıklı Büyüme Hedefi |
|---|---|---|
| Çökme / ANR oranı | < %1.0 | < %0.5 |
| D1 elde tutma | ≥ %25 | ≥ %35 |
| D7 elde tutma | ≥ %8 | ≥ %12 |
| Play mağaza puanı | ≥ 4.0 | ≥ 4.3 |
