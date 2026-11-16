# Senin Yapman Gereken İşler (Adım Adım, Kodlama Gerektirmez)

Bu dosya **sadece senin yapabileceğin** işleri içerir (hesap açma, ödeme, imza anahtarı, test oyuncusu bulma). Oyun kodlama, derleme ve APK üretme işlerinin tamamı otomatik olarak yapılıyor.

---

## EN ÖNEMLİ UYARI — BÜTÇE (25 USD) VE ÜCRETSİZ SEÇENEKLER

Google Play'de uygulama yayınlamak için Google **tek seferlik 25 USD** (yaklaşık 900–1000 TL, kura göre değişir) kayıt ücreti istiyor. Bu ücreti ödemeden Google Play'e uygulama yüklenemez.
- **Dikkat:** Google ön ödemeli kartları (sanal tek kullanımlık / ön ödemeli kartların çoğunu) kabul etmez; normal banka kartı (uluslararası alışverişe açık) veya kredi kartı gerekir.
- **Şu an bütçen 0 TL ise hiç sorun değil!** Oyunu **tamamen ücretsiz** olarak şu 3 yerden hemen dağıtabiliriz (hepsi hazır olacak):
  1. **GitHub Releases (APK):** Her yeni sürümde doğrudan telefonuna indirip kurabileceğin APK dosyası.
  2. **GitHub Pages (Web Demosu):** Linke tıklayan herkesin telefon veya bilgisayardan indirmeden oynayabileceği sürüm.
  3. **itch.io (Ücretsiz Mağaza):** Ücretsiz hesap açıp APK ve web sürümünü yayınlayabilirsin, bağış bile açılabilir.
- Ne zaman 25 USD ayırabilirsen Google Play hesabını açarız ve oyunun o zamanki sürümünü doğrudan kapalı teste yükleriz.

---

## GÖREV LİSTESİ (Durum Takibi)

| # | İş | Ne Zaman Gerekli? | Maliyet | Durum |
|---|---|---|---|---|
| 1 | Telefonunda ilk APK'yı test et | M0 bittiğinde (ŞİMDİ) | 0 TL | [ ] Bekliyor |
| 2 | GitHub Pages'i 2 tıklamayla aç (web demosu + gizlilik politikası) | M0–M1 | 0 TL | [ ] Bekliyor |
| 3 | Ücretsiz itch.io hesabı aç (isteğe bağlı, ücretsiz dağıtım) | M1–M4 | 0 TL | [ ] İsteğe bağlı |
| 4 | Google Play Geliştirici Hesabı aç (25 USD) | M5–M6 (Play yayını için) | 25 USD | [ ] Bütçe bekliyor |
| 5 | 18–20 test kullanıcısı topla (Play kuralı: en az 12 kişi × 14 gün) | Play hesabı açılınca | 0 TL | [ ] Bekliyor |
| 6 | Windows PC'de imzalama anahtarı (keystore) üret ve GitHub Secrets'a ekle | Play'e yüklemeden önce (M6) | 0 TL | [ ] Bekliyor |
| 7 | Gelir için Google AdMob + Play Satıcı (Merchant) + Vergi/Banka ayarları | M5–M6 | 0 TL | [ ] Bekliyor |

---

## GÖREV 1 — Telefonuna APK Kurup Açıldığını Kontrol Et (0 TL)

1. Android telefonunda tarayıcıyı aç ve şu adrese git:
   `https://github.com/eraslan19j/Aslan/releases`
2. En üstteki sürümün altındaki **Assets** bölümünden `istanbul-streets-debug.apk` dosyasına dokun ve indir.
3. İnen dosyaya dokun. Telefon **"Bilinmeyen kaynaklardan uygulama yüklemeye izin ver"** uyarısı verirse:
   - **Ayarlar** → **Bu kaynaktan izin ver** düğmesini aç → geri dön → **Yükle** de.
4. Uygulamayı aç ve şunları kontrol et:
   - Ekran otomatik **yatay** dönüyor mu?
   - İstanbul gün batımı sahnesi açılıyor mu?
   - Sağ üstteki **Lite** düğmesine basınca donma olmadan çalışıyor mu?
   - Telefonun **Geri** tuşuna basınca duraklatma menüsü açılıyor mu?
5. Bir sorun görürsen ekran görüntüsü alıp bir sonraki sohbette paylaşman yeterli.

---

## GÖREV 2 — GitHub Pages'i Aç (Web Demosu + Gizlilik Politikası, 0 TL)

Google Play ileride bizden internet üzerinde açık bir **Gizlilik Politikası** adresi isteyecek. Bunu GitHub üzerinden tamamen ücretsiz yayınlayacağız:

1. Bilgisayarında `https://github.com/eraslan19j/Aslan` sayfasına git.
2. Üst menüden **Settings** (Ayarlar) sekmesine tıkla.
3. Sol menüden **Pages** seçeneğine tıkla.
4. **Build and deployment** altındaki **Source** açılır listesinden **GitHub Actions** seçeneğini seç.
5. İşlem tamam! Bundan sonra web demosu ve gizlilik politikası otomatik olarak şu adreslerde yayınlanır:
   - Web demosu: `https://eraslan19j.github.io/Aslan/`
   - Gizlilik politikası: `https://eraslan19j.github.io/Aslan/privacy.html`

---

## GÖREV 3 — Ücretsiz itch.io Hesabı (İsteğe Bağlı, 0 TL)

Google Play bütçesi birikene kadar oyunu dünyayla paylaşmak istersen:
1. `https://itch.io` adresine gir → sağ üstten **Register** (Kayıt Ol) tıkla.
2. Kullanıcı adı, şifre, e-posta gir ve "I'm interested in distributing content on itch.io" kutucuğunu işaretle.
3. Hesap açıldığında M1–M2 sonrası APK ve web sürümünü yükleme adımlarını buraya ekleyeceğiz.

---

## GÖREV 4 — Google Play Geliştirici Hesabı Açma (25 USD — Bütçe Hazır Olunca)

1. `https://play.google.com/console/signup` adresine git (normal Google hesabınla giriş yap).
2. Hesap türü olarak **Kişisel (Personal)** seç (şirketin yoksa; şirket hesabında D-U-N-S numarası gerekir ama 12 testçi kuralından muaftır).
3. Kimlik bilgilerini, telefon numaranı ve adresini **gerçek ve eksiksiz** gir (Google kimlik doğrulaması ister; sahte bilgi hesabı kalıcı kapatır).
4. **25 USD** tek seferlik kayıt ücretini uluslararası ödemeye açık banka veya kredi kartı ile öde.
5. **Önemli hedef:** Hesap onaylanır onaylanmaz oyunun ilk oynanabilir sürümünü **Kapalı Test (Closed Testing)** kanalına yükleyeceğiz ki zorunlu **14 günlük sayaç** oyun geliştirilirken boşa zaman kaybetmeden işlemeye başlasın!

---

## GÖREV 5 — 12 Test Kullanıcısı × 14 Gün (Kişisel Hesap Zorunluluğu, 0 TL)

Google Play kuralı (16 Kasım 2026 doğrulandı): 13 Kasım 2023 sonrası açılan kişisel hesaplarda uygulamayı mağazaya çıkarmadan önce **en az 12 gerçek kişinin** kapalı teste katılıp **kesintisiz 14 gün** boyunca kayıtlı kalması ve uygulamayı gerçekten açıp kullanması gerekir.
- **Neden 18–20 kişi?** Bir kişi bile 9. günde silerse veya testten çıkarsa sayı 11'e düşer ve süreç aksar. Emniyet payı için en az **18–20 kişi** (arkadaşlar, aile, Türk oyun geliştirici Discord/Reddit toplulukları) topla.
- Play hesabını açtığında bu kişilere göndereceğin hazır davet mesajını (TR + EN) buraya ekleyeceğiz.
- **Asla sahte/bot test servisi veya sahte hesap kullanma** — Google 2026'da bu tür hesapları kalıcı yasaklıyor.

---

## GÖREV 6 — Windows PC'de İmza Anahtarı (Keystore) Üretme ve GitHub Secrets'a Ekleme (M6)

> **KRİTİK GÜVENLİK KURALI:** Bu anahtar dosyasını (`upload-keystore.jks`) ve şifrelerini **ASLA sohbete yapıştırma** ve **ASLA GitHub reposuna dosya olarak yükleme**. Sadece aşağıda anlatıldığı gibi güvenli **GitHub Secrets** bölümüne ekle. Anahtarı kaybedersen oyununa güncelleme yüklemekte ciddi sorun yaşarsın — mutlaka USB belleğe ve buluta (Google Drive vb.) **şifreli yedeğini al!**

### Adım A: Windows'ta Anahtar Dosyası Üret
1. Bilgisayarına **Adoptium Temurin JDK 21 (Windows x64 .msi)** indirip kur: `https://adoptium.net` (sadece "İleri → İleri → Kur" tıkla).
2. Windows Başlat menüsüne **PowerShell** yaz ve aç.
3. Masaüstüne güvenli bir klasör aç ve anahtarı oluştur (aşağıdaki satırı kopyala-yapıştır, Enter'a bas):
   ```powershell
   mkdir "$HOME\Desktop\IstanbulStreets-ANAHTAR-YEDEK"
   keytool -genkey -v -keystore "$HOME\Desktop\IstanbulStreets-ANAHTAR-YEDEK\upload-keystore.jks" -keyalg RSA -keysize 2048 -validity 10000 -alias istanbulstreets
   ```
4. PowerShell senden bir **parola** isteyecek (örneğin güçlü bir şifre belirle ve bir kağıda/şifre yöneticisine not al). Ardından ad-soyad ve şehir (`Istanbul`, ülke `TR`) sorularını cevapla, son soruya `yes` yaz.
5. Anahtar dosyasını GitHub Secrets'a yapıştırabilmek için metne (Base64) çevir:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Desktop\IstanbulStreets-ANAHTAR-YEDEK\upload-keystore.jks")) | Set-Clipboard
   ```
   *(Bu komut anahtar dosyasını doğrudan panona kopyalar — ekrana basmaz.)*

### Adım B: GitHub Secrets'a Ekle
1. `https://github.com/eraslan19j/Aslan/settings/secrets/actions` sayfasına git.
2. **New repository secret** düğmesine tıklayıp şu **4 gizli anahtarı** tek tek ekle:
   - `ANDROID_KEYSTORE_BASE64` → Az önce panoya kopyaladığın uzun metni yapıştır (`Ctrl+V`).
   - `ANDROID_KEYSTORE_PASSWORD` → Belirlediğin anahtar deposu şifresi.
   - `ANDROID_KEY_ALIAS` → `istanbulstreets`
   - `ANDROID_KEY_PASSWORD` → Anahtar şifresi (genelde keystore şifresiyle aynı).
3. Bu 4 alan eklendiğinde GitHub Actions otomatik olarak Google Play'e yüklenebilir **imzalı `.aab`** dosyasını üretecek!
4. `Desktop\IstanbulStreets-ANAHTAR-YEDEK\upload-keystore.jks` dosyasını mutlaka harici USB veya şifreli bulut yedeklemeye kopyala.

---

## GÖREV 7 — Gelir (AdMob + Play Satıcı Hesabı + Türkiye Vergi/Banka) — M5/M6

*(Önemli not: Aşağıdaki bilgiler genel bilgilendirmedir, **hukuki veya mali tavsiye değildir**. Gelir elde etmeye başlamadan önce bir mali müşavire veya vergi dairesine danışmalısın.)*

1. **Google AdMob Hesabı (Ücretsiz):** `https://admob.google.com` adresinden ücretsiz hesap aç. Uygulama içi reklam kimlikleri (App ID, Rewarded Ad Unit ID, Interstitial Ad Unit ID) M5 aşamasında eklenecek. **ASLA kendi oyunundaki gerçek reklama tıklama** — Google hesabını kalıcı kapatır!
2. **Google Play Satıcı (Merchant) Hesabı (Türkiye Destekleniyor, Varsayılan Para Birimi: TRY):**
   - Play Console → **Kurulum (Setup)** → **Ödemeler profili (Payments profile)** bölümünden Türkiye banka hesabını (IBAN) ekle.
3. **Türkiye'de Uygulama Geliri ve Vergi:**
   - Türkiye'de mobil uygulama / reklam gelirleri için **Sosyal İçerik Üreticiliği ve Mobil Uygulama Geliştiriciliği İstisnası** (193 sayılı Gelir Vergisi Kanunu Mükerrer Madde 20/B — özel banka hesabı üzerinden otomatik %15 stopaj uygulaması) gibi kolaylaştırılmış düzenlemeler bulunmaktadır; güncel limitler ve şartlar her yıl değişebilir.
   - İlk ödemeyi çekmeden önce e-Devlet / İnteraktif Vergi Dairesi veya bir serbest muhasebeci mali müşavir (SMMM) ile bu istisnadan yararlanıp yararlanamayacağını **mutlaka doğrula**.
