# Senin Yapman Gereken İşler (Sadece Android Telefon — Kodlama Gerektirmez)

Bu dosyadaki **tüm adımlar yalnızca Android telefonundan** yapılacak şekilde hazırlanmıştır. Hiçbir adım için ek bir cihaza ihtiyacın yoktur. Oyun kodlama, derleme, görsel QA, emülatör testi ve APK üretimi tamamen otomatik yapılır.

> **Önemli Tarayıcı İpucu ("Masaüstü sitesi"):** Aşağıda bazı GitHub ve Google Play ekranları için tarayıcıda **"Masaüstü sitesi"** açman gerekir. Chrome'da sağ üstteki **üç nokta (⋮)** simgesine dokun → **"Masaüstü sitesi"** kutusunu işaretle.

---

## EN ÖNEMLİ UYARI — BÜTÇE (25 USD) VE ÜCRETSİZ SEÇENEKLER

Google Play'de uygulama yayınlamak için Google **tek seferlik 25 USD** kayıt ücreti ister (çoğu ön ödemeli kartı kabul etmez; uluslararası alışverişe açık banka kartı veya kredi kartı gerekir).
- **Şu an bütçen 0 TL ise hiç sorun değil!** Oyunu **tamamen ücretsiz** olarak hemen şu 3 yerden dağıtıyoruz:
  1. **GitHub Releases (APK):** Her yeni sürümde doğrudan telefonuna indirip kurabileceğin APK dosyası (`v0.2.0` hazır!).
  2. **GitHub Pages (Web Demosu):** Linke dokunan herkesin telefonundan indirmeden oynayabileceği sürüm.
  3. **itch.io (Ücretsiz Mağaza):** Ücretsiz hesap açıp APK ve web sürümünü yayınlayabilirsin.
- Ne zaman 25 USD ayırabilirsen Google Play hesabını telefondan açıp doğrudan kapalı teste yükleriz.

---

## GÖREV LİSTESİ (Durum Takibi)

| # | İş | Ne Zaman? | Maliyet | Durum |
|---|---|---|---|---|
| 1 | Telefonuna **`v0.2.0`** APK'yı kur, oyna ve **"RAPORU KOPYALA"** çıktısını sohbete yapıştır | **ŞİMDİ (M2)** | 0 TL | [ ] Bekliyor |
| 2 | Telefondan GitHub Pages'i aç (web demosu + gizlilik politikası) | M1–M2 | 0 TL | [ ] Bekliyor |
| 3 | Telefondan ücretsiz itch.io hesabı aç (isteğe bağlı) | M2–M4 | 0 TL | [ ] İsteğe bağlı |
| 4 | Google Play Geliştirici Hesabı aç (25 USD) | Play yayını için (M5–M6) | 25 USD | [ ] Bütçe bekliyor |
| 5 | 18–20 test kullanıcısı topla (Play kuralı: en az 12 kişi × 14 gün aktif kullanım) | Play hesabı açılınca | 0 TL | [ ] Bekliyor |
| 6 | **Termux** ile imzalama anahtarı (keystore) üret ve GitHub Secrets'a ekle | Play'e yüklemeden önce (M6) | 0 TL | [ ] Bekliyor |
| 7 | Telefondan AdMob + Play Satıcı (Merchant) + Banka/Vergi ayarları | M5–M6 | 0 TL | [ ] Bekliyor |

---

## GÖREV 1 — `v0.2.0` APK'yı Kur + Gerçek Telefon Raporunu Paylaş (0 TL, 3 Dakika)

> **Önemli:** Emülatördeki FPS gerçek telefonunu göstermez. Gerçek telefon ölçümünü **sadece senin telefonundaki "RAPORU KOPYALA"** düğmesiyle alabiliyoruz!

1. Telefonunda Chrome'u aç ve şu adrese git:
   `https://github.com/eraslan19j/Aslan/releases/tag/v0.2.0`
2. Sayfanın altındaki **Assets** bölümünden `istanbul-streets-debug.apk` dosyasına dokun ve indir.
3. İnen dosyaya dokun. **"Bilinmeyen kaynaklardan yüklemeye izin ver"** çıkarsa:
   - **Ayarlar** → **Bu kaynaktan izin ver** aç → geri dön → **Yükle** de.
4. Oyunu aç (otomatik **yatay** açılır, başlangıç bölgesi **Esenler · Namık Kemal Mahallesi**):
   - Sol analog kolla biraz yürü, **BİN** düğmesine dokunup Sarı Taksi'ye bin, **GAZ / FREN / ◀ ▶** ile sokakta sür.
   - Sağ üstten **Duraklat** → **Bölge Değiştir** ile **Fatih · Sultanahmet–Eminönü** bölgesine de geçebilirsin.
   - Bir caminin yanına yaklaştığında yeşil **"GÜVENLİ ALAN"** rozetinin göründüğünü kontrol et.
5. **Gerçek Cihaz Raporunu Kopyala (Çok Önemli!):**
   - Oyun açıkken (10–15 saniye oynadıktan sonra) sağ üstteki **Ayarlar** düğmesine dokun.
   - Aşağı kaydır ve sarı **"RAPORU KOPYALA"** düğmesine dokun (`Rapor panoya kopyalandı!` yazısı çıkar).
   - Bir sonraki sohbet mesajına bu kopyalanan metni **doğrudan yapıştırıp gönder** (istersen **Lite** moduna geçip bir rapor daha kopyalayabilirsin).

---

## GÖREV 2 — Telefondan GitHub Pages'i Aç (Web Demosu + Gizlilik Politikası, 0 TL)

Google Play ileride bizden internet üzerinde açık bir **Gizlilik Politikası** bağlantısı ister. Telefondan 1 dakikada açabilirsin:

1. Chrome'da `https://github.com/eraslan19j/Aslan` adresine git ve GitHub hesabına giriş yap.
2. Chrome sağ üst **üç nokta (⋮)** → **"Masaüstü sitesi"** kutusunu işaretle.
3. Üst menüden **Settings** sekmesine dokun.
4. Sol menüden **Pages** seçeneğine dokun.
5. **Build and deployment** altındaki **Source** kutusundan **GitHub Actions** seç.
6. Tamam! Bir sonraki yayında adreslerin otomatik açılır:
   - Web demosu: `https://eraslan19j.github.io/Aslan/`
   - Gizlilik politikası: `https://eraslan19j.github.io/Aslan/privacy.html`

---

## GÖREV 3 — Telefondan Ücretsiz itch.io Hesabı (İsteğe Bağlı, 0 TL)

1. Chrome'da `https://itch.io` aç → sağ üstten **Register** dokun.
2. Kullanıcı adı, şifre, e-posta gir ve *"I'm interested in distributing content on itch.io"* kutusunu işaretle.
3. Hesap açılınca telefondan APK ve web zip yükleme adımlarını buraya ekleyeceğiz.

---

## GÖREV 4 — Telefondan Google Play Geliştirici Hesabı (25 USD, M5–M6'da)

1. Chrome'da **Masaüstü sitesi** açıkken `https://play.google.com/console/signup` adresine git.
2. Google hesabınla giriş yap → **Personal (Kişisel)** hesap türünü seç.
3. Kimlik doğrulama ve tek seferlik **25 USD** ödemeyi normal banka/kredi kartıyla tamamla.

---

## GÖREV 5 — 18–20 Test Kullanıcısı Toplama (Play Kapalı Test, 0 TL)

Google Play kuralı: Kişisel hesaplarda **en az 12 kişi** uygulamayı **14 gün boyunca kesintisiz** kapalı testte kurup açmak zorundadır. Bazı kişiler silebildiği için **18–20 arkadaş/aile/topluluk Gmail adresi** toplamak güvenlidir.
- Sadece Google Play hesaplarının bağlı olduğu Gmail adreslerini not etmen yeterli (M6'da Play Console'a telefondan tek listede yapıştıracaksın).

---

## GÖREV 6 — Sadece Telefondan Termux ile İmzalama Anahtarı (Keystore) Üretme (0 TL, M6'da)

Google Play'e yüklenen her oyunun gizli bir **imza anahtarı (`.jks`)** olmalıdır. Bu anahtarı **hiçbir yere paylaşma**; sadece kendi Google Drive'ına yedekle ve GitHub Secrets'a ekle.

### Adım 6.1 — Termux'u Doğru Yerden Kur
> **DİKKAT:** Termux'u Google Play Store'dan **YÜKLEME** (eski sürüm olduğu için hata verir).
1. Telefonunda Chrome ile `https://f-droid.org/en/packages/com.termux/` adresine git.
2. Aşağı kaydır → **Download APK** dokun ve Termux APK'sını kur.
3. Termux uygulamasını aç.

### Adım 6.2 — Java (keytool) Kurulumu (Kopyala-Yapıştır)
Aşağıdaki satırları tek tek Termux'a yapıştır ve Enter'a bas:

```bash
termux-setup-storage
```
*(Ekrana dosya izni sorusu çıkarsa **İzin Ver** de.)*

```bash
pkg update -y && pkg upgrade -y
```
*(Soru sorarsa sadece Enter'a basarak devam et.)*

```bash
pkg install openjdk-17 -y
```

**Hata olursa ne yapmalısın?**
- `Unable to locate package openjdk-17` çıkarsa önce `termux-change-repo` yaz → Enter → ilk sunucuyu seç → Enter → sonra tekrar `pkg update -y && pkg install openjdk-17 -y` çalıştır.
- `openjdk-17` yerine daha yeni sürüm isterse `pkg install openjdk-21 -y` komutunu kullan (ikisi de `keytool` içerir).

### Adım 6.3 — Keystore Anahtarını Üret (Kopyala-Yapıştır)
Aşağıdaki komutu yapıştırıp Enter'a bas:

```bash
keytool -genkeypair -v -keystore ~/storage/downloads/istanbul-streets-release.jks -alias istanbulstreets -keyalg RSA -keysize 2048 -validity 10000
```

Termux sana sırayla birkaç soru soracak:
1. **Enter keystore password:** Güçlü bir şifre yaz (örneğin 12+ karakter, harf+rakam) ve **bir kâğıda/şifre yöneticisine kaydet**. *(Yazarken ekranda karakter görünmez, bu normaldir!)*
2. **Re-enter new password:** Aynı şifreyi tekrar yaz ve Enter.
3. **What is your first and last name?:** Adını yaz veya boş bırakıp Enter.
4. **Organizational unit / Organization / City / State / Country:** Şehir için `Istanbul`, ülke için `TR` yazıp diğerlerine Enter basabilirsin.
5. **Is CN=... correct?:** `yes` yaz ve Enter.
6. **Key password:** Aynı şifreyi kullanmak için direkt **Enter**'a bas.

**Hata olursa ne yapmalısın?**
- `Permission denied` veya `No such file or directory`: `termux-setup-storage` çalışmamıştır. Komutta `~/storage/downloads/` yerine `~/istanbul-streets-release.jks` yazıp oluştur, sonra dosya yöneticisinden yedekle.
- `keytool: command not found`: Termux'u kapatıp tekrar aç, `which keytool` yaz; boşsa `pkg install openjdk-21 -y` çalıştır.

### Adım 6.4 — Anahtarı Telefonda Yedekle (ÇOK ÖNEMLİ!)
- Bu `.jks` dosyasını kaybedersen Google Play'deki oyununa bir daha güncelleme **gönderemezsin**.
- Telefonunun **Dosyalarım → İndirilenler (Downloads)** klasöründe `istanbul-streets-release.jks` dosyasını gör.
- Bu dosyayı **Google Drive** hesabında gizli bir klasöre yedekle (ve şifreni güvenli bir yerde sakla).

### Adım 6.5 — Base64 Metnini Kopyala ve GitHub Secrets'a Ekle
Termux'ta şu komutu çalıştır:

```bash
base64 -w 0 ~/storage/downloads/istanbul-streets-release.jks > ~/storage/downloads/keystore-base64.txt && echo "HAZIR"
```
*(Hata: `base64: invalid option -- 'w'` çıkarsa `base64 ~/storage/downloads/istanbul-streets-release.jks | tr -d '\n' > ~/storage/downloads/keystore-base64.txt && echo "HAZIR"` yaz.)*

1. **Dosyalarım → İndirilenler** içinden `keystore-base64.txt` dosyasını aç, içindeki tüm metni **Tümünü Seç → Kopyala** yap.
2. Chrome'da **Masaüstü sitesi** açıkken `https://github.com/eraslan19j/Aslan/settings/secrets/actions` adresine git.
3. **New repository secret** düğmesine basarak şu **4 gizli anahtarı** tek tek ekle:
   - `ANDROID_KEYSTORE_BASE64` → Kopyaladığın uzun Base64 metni
   - `ANDROID_KEYSTORE_PASSWORD` → Belirlediğin keystore şifresi
   - `ANDROID_KEY_ALIAS` → `istanbulstreets`
   - `ANDROID_KEY_PASSWORD` → Belirlediğin şifre (keystore şifresiyle aynı)
4. Ekledikten sonra telefonundan geçici `keystore-base64.txt` dosyasını silebilirsin (`.jks` yedeğini **ASLA SİLME**).
5. Bundan sonra GitHub Actions otomatik olarak **imzalı Google Play AAB (`istanbul-streets-release.aab`)** üretecektir!

---

## GÖREV 7 — Gelir Ayarları (AdMob + Play Satıcı + Türkiye Vergi Notu, M5–M6'da)

1. **Google AdMob:** Chrome **Masaüstü sitesi** ile `https://admob.google.com` aç → ücretsiz hesap oluştur. (M5'te uygulama yalnızca Google test kimlikleriyle gelir; canlı kimlikleri M6'da sen ekleyeceksin.)
2. **Play Satıcı (Merchant) Hesabı:** Play Console'da **Ayarlar → Ödeme profili** bölümünden Türkiye (TRY) banka hesabını bağla.
3. **Türkiye Vergi / Banka Notu:** Türkiye'de mobil uygulama/oyun gelirleri (reklam ve uygulama içi satış) için 193 sayılı Gelir Vergisi Kanunu Mükerrer 20/B kapsamında **Sosyal İçerik Üreticiliği ve Mobil Uygulama Geliştiriciliği İstisna Belgesi** ve buna özel açılan banka hesabı üzerinden otomatik %15 stopaj kolaylığı bulunmaktadır. İlk gerçek geliri almadan önce bir mali müşavire veya e-Devlet/İnteraktif Vergi Dairesi üzerinden güncel istisna şartlarına danışman önerilir.
