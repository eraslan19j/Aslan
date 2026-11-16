# PROMPT 1/2 — ISTANBUL STREETS: KURULUŞ ve ÇEKİRDEK (v3)

> Bu metnin tamamını ilk iş olarak repoya `docs/prompts/GENESIS.md` adıyla commit et. Bu dosya projenin değişmez şartnamesidir; sohbet bağlamı kaybolsa bile buradan devam edilir.

---

## 0. BAĞLAM VE ÖNCELİKLER

- Kullanıcı **kodlama bilmiyor**, **bütçesi sıfır**, elinde bir Windows PC ve bir Android telefon var. Bu proje onun gelir umudu. Senden bağımsız, baştan sona kendi başına çalışmanı istiyor.
- Önceliklerin sırasıyla: **(1)** çalışan, kararlı bir Android APK, **(2)** Google Play'in kabul edeceği uyumluluk, **(3)** sıfır maliyet, **(4)** dürüstlük. Gösterişli ama kırılgan şeyden, sade ama sağlam şeyi tercih et.
- Agent modundasın ve tam yetkin var: kod yazma, terminal, git, web araştırma, GitHub repolarını indirme/inceleme, görsel/ses üretimi (araçların varsa), GitHub'a commit/push/PR/Actions/Release. Önce hangi araçlara sahip olduğunu envanterle (`docs/memory/TOOLS.md`).
- **Kullanıcıya soru sorma.** Makul varsayım yap, `DECISIONS.md`'ye yaz. İstisna: yalnızca kullanıcının yapabileceği işler (hesap açma, ödeme, imza anahtarı, test kullanıcısı bulma). Bunları `docs/USER_TASKS.md`'ye **çok basit Türkçe, tıklama tıklama** yaz (kodlama bilmeyen biri için) ve o işi beklerken bloke olma, yapabildiğin işe devam et.
- Sansür/sınırlama yok: planı, riskleri, kötü haberleri açıkça yaz. Süslü dil yok, kanıt var.

## 1. DÜRÜSTLÜK VE KALİTE SÖZLEŞMESİ

"Hatasız" garanti edilemez; **ölçülebilir kalite kapıları** zorunludur. Bir aşama bu kapıların hepsi yeşil olmadan "bitti" sayılmaz:

1. `typecheck` + lint temiz.
2. Birim testleri (saf TS çekirdek: fizik, AI, wanted, görev, kayıt) yeşil.
3. Headless Chromium smoke testi: açılış, 60 sn oynanış simülasyonu, **konsolda sıfır hata**.
4. 10 dakikalık soak testi: bellek sızıntısı yok, FPS çökmesi yok.
5. Global hata yakalayıcı + yerel kilitlenme günlüğü (oyun çökerse temiz mesaj, kayıt bozulmaz).
6. APK CI'da derleniyor; kurulum + açılış duman testi mümkünse emülatörde.
7. Performans ölçümü `PERF_BUDGET.md`'ye yazıldı (gerçek cihaz yoksa bunu açıkça belirt, tahmin yazma).
8. Lisans/atıf dosyası güncel.

Çalıştırmadığın hiçbir şeye "çalışıyor" deme. Engel (ağ, SDK, hız sınırı, araç eksikliği) olursa nedenini yaz, alternatifi uygula.

## 2. OYUN VİZYONU (Vice City ruhu, tamamen orijinal)

**Ad:** Istanbul Streets (çalışma adı; ad bulunabilirliğini kontrol et, alternatif: "Boğaz Suçu").
**Tür:** Gerçek İstanbul'da geçen, 3. şahıs, GTA Vice City tarzı açık dünya suç oyunu.

Vice City'den alınacak **ruh** (kopya değil): güçlü karakterli hikâye, sinematik görev sunumu, serbest dolaşım + suç ekonomisi, radyo istasyonları, bölge bölge açılan harita, kült diyaloglar, atmosfer.

**İstanbul kimliği (rakiplerden fark):** martılar, simit ve çay ocakları, sokak kedileri, sarı taksiler, dolmuş/minibüs, tramvay hattı, vapur ve iskele, Boğaz'da gün batımı, esnaf ve pazarlık, dar yokuşlu sokaklar, kapalı çarşı labirenti, çatı katları ve manzara.

**Orijinallik kuralları:**
- GTA/Rockstar/Take-Two/Vice City/Leonida isim, karakter, logo, müzik, hikâye öğesi **yok**. Mağaza metninde "GTA" kelimesi **kullanma**.
- Gerçek marka/araç modeli/logo yok: kurgusal markalar ve araç modelleri. Gerçek kişi yok. Polis ve resmi kurumlar kurgusal tasarım ("Şehir Polisi" vb.), gerçek amblem yok.
- Ayasofya ve Sultanahmet Camii aktif ibadethanelerdir: çevrelerinde ve içinde şiddet/silah/ragdoll yok; iç mekânlar kapalı. Dini ve etnik alay yok.
- Şiddet stilize ve ölçülü (Play politikası + yaş derecelendirmesi). Hedef kitle **18+** olarak beyan edilecek.

**Hikâye iskeleti (sen yaz, orijinal):** Bölge bölge bölümler. Her sürüm bir bölgeyi ve bir hikâye bölümünü açar. Karakterler kurgusal, ciddi suç draması + İstanbul mizahı. Her bölümde: 4–6 ana görev, 3–4 yan aktivite, koleksiyon, bir "vay be" anı.

## 3. GELİR VE GOOGLE PLAY STRATEJİSİ (araştırılmış gerçekler, 16 Kasım 2026)

Bunları güncel resmî Play Console yardım sayfalarından **tekrar doğrula**; değişmişse `DECISIONS.md`'ye yaz.

- **Hedef API:** 31 Ağustos 2026'dan beri yeni uygulamalar ve güncellemeler **Android 16 (API 36)** hedeflemeli. Aynı tarihte Play Billing Library 8.0.0+ şartı olduğu bildiriliyor; doğrula.
- **Kişisel geliştirici hesabı** (13 Kasım 2023 sonrası açılan): üretime çıkmadan önce **kapalı testte en az 12 test kullanıcısı, kesintisiz 14 gün**. Kuruluş hesapları (D-U-N-S) muaf. Kural uygulama başına değil hesap başınadır; test kullanıcıları gerçekten uygulamayı kullanmalı.
- **Kayıt ücreti:** tek seferlik **25 USD**; hazır ödeme kartı gerekir (ön ödemeli kart kabul edilmez). Kullanıcının bütçesi sıfır: bu, `USER_TASKS.md`'de **en üst uyarı** olsun. Ücretsiz dağıtım alternatifleri hazır olsun: GitHub Releases APK, GitHub Pages web demosu, itch.io.
- **Türkiye'de satıcı (merchant) hesabı** desteklenir; ödeme için vergi/banka adımları `USER_TASKS.md`'de anlatılsın (hukuki/mali tavsiye değildir, kullanıcı doğrulamalı).
- **Hedef:** 25 USD ödendikten sonra mümkün olan en erken zamanda **kapalı test sürümünü yükle** ki 14 günlük sayaç oyun büyürken işlesin (bkz. bölüm 10, M5).

**Para kazanma tasarımı (adil, GTA tarzı tek oyunculu):**
- Ücretsiz indirme.
- **Ödüllü reklam** (isteğe bağlı: çift para, araç tamiri, ek can). Aralıklı reklam çok sınırlı: yalnızca görev aralarında; sürüş/çatışma/ara sahne sırasında **asla**. Banner yok.
- **Tek seferlik "Reklamsız" IAP** + kozmetik paketler (araç boyası, kıyafet). Pay-to-win yok, loot box yok.
- Elde tutma: günlük ödül, her yeni bölge güncellemesi, koleksiyon/başarımlar.
- Reklam SDK'sı (ör. AdMob için bakımı süren Capacitor eklentisi) ve faturalandırma eklentisini **bakım durumu ve API 36 uyumluluğunu doğrulayarak** seç. Geliştirmede **yalnızca test reklam kimlikleri**; kendi reklamına asla tıklama. Kullanıcı rızası (UMP/GDPR) ve KVKK uyumlu gizlilik politikası (GitHub Pages'te barındır).
- **Gerçekçi beklenti:** Gelir garantisi yok. Mağazada çoğu oyun az kazanır. Başarı ölçütlerin: kurulum, D1/D7 elde tutma, puan, yorum. Kullanıcıya bunu `docs/memory/MONETIZATION.md`'de dürüstçe yaz.

**Play uyumluluk listesi (`docs/store/PLAY_CHECKLIST.md`):** Veri güvenliği formu, gizlilik politikası URL'si, IARC içerik derecelendirmesi (dürüst), reklam beyanı, hedef kitle 18+, ikon 512×512, öne çıkan görsel 1024×500, telefon ekran görüntüleri (yatay), kısa/uzun açıklama TR + EN, metadata'da marka ihlali yok, AAB + Play App Signing, sürüm notları. Güncel boyut/format kurallarını Play yardımından doğrula.

## 4. TEKNİK MİMARİ

- **Vite + TypeScript + Three.js** (güncel kararlı sürüm, `package.json`'da sabit). **Rapier** (`@dimforge/rapier3d-compat`, WASM gömülü).
- **Saf mantık / render ayrımı:** oyun mantığı Three.js'siz saf TS, birim testli. Render katmanı ayrı.
- **Android:** Capacitor, `appId com.istanbulstreets.game`, hedef/derleme API 36, `sensorLandscape`, immersive tam ekran, geri tuşu = duraklat, 120 Hz'e izin, ekran açık kalsın, WebView donanım hızlandırma.
- **Neden WebView:** tek kod tabanı hem web hem APK. **Risk:** WebView'da WebGL performansı orta segmentte sınırlı olabilir. Bu yüzden: erken ölç (M1), bütçeyi sıkı tut, "Lite modu" (düşük çözünürlük, kısa görüş mesafesi, gölgesiz) sun. Performans hedefi tutmazsa **alternatif motor ADR'si** yaz (ör. Godot Web/Android), ama bunu ancak ölçümle gerekçelendirerek öner.
- **Performans bütçesi (başlangıç):** ≤150 draw call, pixelRatio ≤1.5 (Lite 1.0), tek güneş gölgesi, instancing, 300 m tile akışı + mesafe/frustum kesme, nesne havuzu, doku atlası, Draco/meshopt, APK/AAB hedef boyutu <150 MB (Play taban sınırlarını doğrula).
- **Ses:** Web Audio sentezi + CC0 örnekler. Radyo: orijinal/CC0 müzik; telifli şarkı yok.
- **Kayıt:** sürümlü şema, Capacitor Preferences/localStorage, bozulmaya karşı yedek.
- **Yerelleştirme:** Türkçe + İngilizce, metinler tek dosyada.

## 5. REFERANS REPOLAR (doğrulandı)

`/refs` altına `git clone --depth 1`; **incele, uyarla, sıfırdan başlama.** Alınan her kod parçası için `CREDITS.md`'ye repo + lisans + commit hash yaz. `refs/` `.gitignore`'da.

| Repo | Lisans | Rol |
|---|---|---|
| `depixeled-chris/gta7` | MIT | **ANA TABAN**: mobil dokunmatik, arcade sürüş/drift, carjack, trafik, yaya paniği, wanted+polis AI, HUD/minimap, testler, `CLAUDE.md` |
| `yz4git/next-gen` (WorldSeed) | MIT (kod); veri lisansları ayrı | **Gerçek dünya veri hattı**: Overture+OSM+arazi → GLB tile, yol grafı, çarpışma, doğma noktaları. Genç proje: commit hash sabitle |
| `bridge-mind/leonida` | MIT | **Yalnızca mimari referans** (sistem izolasyonu, yol grafı, ped/wanted/görev). Masaüstü-only, az test edilmiş. GTA VI fan projesi: **isim/karakter/hikâye alma** |
| `cartesiancs/map3d` | MIT | Yedek OSM→GLB aracı (doku yok) |
| `YusufEminoglu/osm2threejs` | MIT | Yedek, Python: `from_place("Kadıköy, İstanbul")`; yeni/az test edilmiş |
| `Faizankhan17623/Gta-Clone` | **Lisans dosyası görünmüyor** | **Kod kopyalama**; yalnızca fikir referansı |

Kullanma: `swift502/Sketchbook` (arşivlenmiş, cannon.js). Başka repo önereceksen önce varlığını, lisansını ve güncelliğini doğrula; doğrulamadığını kullanma. Ayrıca araştır: Capacitor + Vite + Android, Three.js mobil performans, Overpass kullanım politikası, instancing/LOD teknikleri, mobil dokunmatik oyun UX'i.

## 6. GERÇEK İSTANBUL VERİSİ (tüm şehir hedefi, fazlı üretim)

**Kaynaklar ve lisanslar:**
- **OpenStreetMap** (ODbL): bina, yol, su, park. Atıf: © OpenStreetMap contributors.
- **Overture Maps**: bina ve ulaşım. Kaynağa özel lisansları kontrol et.
- **İBB Açık Veri Portalı** (`data.ibb.gov.tr`): ulaşım, durak, hat vb. İBB Açık Veri Lisansı (CC BY 4.0 benzeri olarak tanımlanıyor); atıf: "Kaynak: İBB Açık Veri Portalı". İBB'nin 3B kent modeli/bina verisi için portalı **tara**, indirilebilir ve lisansı uygun bir şey varsa kullan; yoksa varsayma.
- **Arazi yüksekliği:** Copernicus DEM GLO-30 (ücretsiz, lisansta belirtilen atıf bildirimiyle; AWS açık veri). **İstanbul karolarının (N41 E028/E029) genel sürümde bulunduğunu doğrula**; yoksa GLO-90 veya Terrarium/SRTM'e düş.
- **Uydu görüntüsü:** Sentinel-2 (10 m, ücretsiz) ve ESA WorldCover yalnızca **makro** kullanım için (arazi rengi, orman/su maskesi, Boğaz hattı). Sokak dokusu için çözünürlük yetmez. **Google/Bing/Esri/Mapbox uydu görüntülerini indirip oyuna gömme**: kullanım şartları buna izin vermez.
- Sokak ölçeği görsel kalite: OSM verisi + **prosedürel doku/malzeme** + CC0 doku (Poly Haven, ambientCG).

**Fazlı alan (her sürüm bir bölge):**

| Sürüm | Bölge | İçerik |
|---|---|---|
| 0.1 | **Fatih: Sultanahmet–Eminönü** (~2 km²: yaklaşık güney 41.002, kuzey 41.014, batı 28.966, doğu 28.984) | Ayasofya, Sultanahmet Camii, Hipodrom, Kapalıçarşı yönü, Eminönü, tramvay hattı |
| 0.2 | **Beyoğlu**: Galata (Kule, Köprü), Karaköy, Cihangir, Taksim | Haliç geçişi, dar yokuşlar, İstiklal |
| 0.3 | **Beşiktaş** + Boğaz kıyısı | Dolmabahçe, Ortaköy, Boğaz yolu, vapur iskeleleri |
| 0.4 | **Üsküdar + Kadıköy** (Asya yakası) | Boğaz köprüsü/vapur geçişi, Kız Kulesi, Moda, Kadıköy iskele |
| 0.5 | **Şişli + Sarıyer** | Levent/Maslak gökdelenleri, Boğaz yolu, Bebek–Sarıyer |
| 0.6+ | Eyüpsultan, Zeytinburnu, Bakırköy, Ataşehir, Adalar (vapurla) ve sırayla kalan ilçeler | |

İstanbul'un 39 ilçesi (ileri sürüm yol haritası için): Adalar, Arnavutköy, Ataşehir, Avcılar, Bağcılar, Bahçelievler, Bakırköy, Başakşehir, Bayrampaşa, Beşiktaş, Beykoz, Beylikdüzü, Beyoğlu, Büyükçekmece, Çatalca, Çekmeköy, Esenler, Esenyurt, Eyüpsultan, Fatih, Gaziosmanpaşa, Güngören, Kadıköy, Kağıthane, Kartal, Küçükçekmece, Maltepe, Pendik, Sancaktepe, Sarıyer, Silivri, Sultanbeyli, Sultangazi, Şile, Şişli, Tuzla, Ümraniye, Üsküdar, Zeytinburnu.

Landmark koordinatlarını Nominatim/Overpass ile **kendin doğrula**; yukarıdakiler yaklaşıktır.

**Veri hattı kuralları:**
1. Veri **build zamanında** üretilir, tile GLB + JSON olarak APK'ya gömülür. Oyun açılışta canlı API'ye **bağımlı değil**, tamamen offline çalışır.
2. Sandbox ağı engelliyse: veri üretimini **GitHub Actions** workflow'una taşı (`workflow_dispatch`), çıktıyı artifact/commit yap. Overpass'e saygılı ol (önbellek, geri çekilme).
3. Bina yüksekliği: `height` → `building:levels × 3.2` → deterministik tahmin. Veri kalite raporu üret.
4. Landmark'lar (kubbe, minare, kule, köprü, vapur) **elle/prosedürel** modellenir ve gerçek konuma yerleştirilir.
5. Yol grafı trafik, polis, GPS ve görev rotalarının tek kaynağı olsun. Her bölge tile akışıyla yüklenir; bölge değişimi yükleme ekranıyla maskelenir.
6. Tarihî ve karakteristik hissi korumak için "bölge kimlik kartı" yaz (renk paleti, bina tipleri, ses ortamı, yaya yoğunluğu).

## 7. ASSET VE GÖRSEL ÜRETİM

- **Güvenli lisans sırası:** kendi üretimin (prosedürel/kod) > **CC0** (Kenney, Quaternius, Poly Haven, ambientCG) > CC-BY (atıfla). **CC-BY-NC, editorial-only ve lisansı belirsiz asset yasak** (reklam/IAP ticari sayılır). Freesound'da her sesin lisansını tek tek kontrol et. Jamendo gibi kaynaklar ticari kullanımda ayrı lisans ister: kullanma. Mixamo animasyonları oyunda kullanılabilir, ham dosya olarak yeniden dağıtma.
- Her asset: kaynak URL + lisans + tarih → `CREDITS.md`.
- Araçlar kurgusal tasarım (gerçek marka yok); İstanbul taksisi (sarı), dolmuş, minibüs, polis, spor, motosiklet, vapur.
- **Görsel üretim:** önce araçlarında görsel üretim olup olmadığına bak. Varsa ikon, öne çıkan görsel, tanıtım görselleri için kullan (kurgusal, telifsiz). Yoksa ikon/öne çıkan görseli SVG/Canvas ile üret; ekran görüntüleri ve kısa tanıtım klibi için oyunu **headless Chromium/emülatörde** kaydet.
- Dokular için önce prosedürel malzeme, sonra CC0 doku. Doku atlası ve sıkıştırma (KTX2/WebP) kullan.

## 8. KALICI HAFIZA (repo = hafıza)

Oturumlar arası hafızaya güvenme; **hafıza repodadır**:

```
AGENTS.md                    # Kök, <150 satır: HER oturumda ilk okunur (komutlar, klasör haritası, yasaklar, protokol). CLAUDE.md işaretçi.
docs/prompts/GENESIS.md      # Bu şartname (değişmez)
docs/prompts/CONTINUE.md     # Prompt 2 (devam prompt'u)
docs/USER_TASKS.md           # Kullanıcıya özel işler, basit Türkçe adım adım, durum işaretli
docs/memory/
  PROJECT_BRIEF.md  ARCHITECTURE.md  DECISIONS.md (ADR)  PROGRESS.md (aşama, sıradaki 3 adım)
  KNOWN_ISSUES.md   PERF_BUDGET.md   CREDITS.md  TOOLS.md  MONETIZATION.md  SESSION_LOG.md
docs/store/PLAY_CHECKLIST.md # Mağaza hazırlık listesi
docs/regions/<ilce>.md       # Bölge kimlik kartı + veri notları
```

**Protokol:** (1) Oturum başı: `AGENTS.md` → `PROGRESS.md` → `KNOWN_ISSUES.md` → `USER_TASKS.md` → son `SESSION_LOG.md`. (2) Her karar `DECISIONS.md`'ye, her hata `KNOWN_ISSUES.md`'ye. (3) Oturum sonu: `PROGRESS.md` + `SESSION_LOG.md` güncelle, **commit + push**. (4) Dosyaları kısa ve güncel tut; eski girdileri özetleyip arşivle (bağlam şişmesin). (5) Görevleri GitHub Issues + Project board ile de izle.

## 9. GITHUB, CI VE APK

- Bağlı repoyu kullan (yoksa `istanbul-streets` oluştur). Dal → PR → CI yeşil → birleştir. Commit: `feat/fix/perf/docs/ci/chore`.
- **ci.yml:** `npm ci` → typecheck/lint → testler → build → Playwright smoke.
- **android.yml:** Node LTS + uygun JDK + Android SDK → build → `cap sync` → `./gradlew assembleDebug` (+ `bundleRelease` imza gizli anahtarları varsa) → artifact; `v*` etiketinde GitHub Release'e APK/AAB.
- **İmza:** Play App Signing kullan. Yükleme anahtarını (keystore) **asla repoya koyma ve kendin üretip loglama**. `USER_TASKS.md`'de kullanıcıya Windows'ta anahtar üretme + GitHub Secrets'a ekleme adımlarını basitçe yaz ve anahtarı **yedeklemesi gerektiğini** vurgula.
- **Pages:** web demosu + gizlilik politikası + (isteğe bağlı) basit tanıtım sayfası.
- README: özellikler, kontroller, kurulum, atıflar, sınırlar.

## 10. YOL HARİTASI VE BİTİŞ KRİTERLERİ

| Aşama | İçerik | Bitti sayılır eğer |
|---|---|---|
| **M0** İskelet | Repo, hafıza, CI, Capacitor, boş sahne, `USER_TASKS.md` | CI yeşil; Release'te yatay açılan **debug APK** (API 36 hedef) |
| **M1** Dünya | Sultanahmet–Eminönü veri hattı, tile akışı, yürüme, kamera | Gerçek bölge APK'da yürünüyor; FPS ölçüldü; atıflar görünüyor |
| **M2** Sürüş | Araçlar, carjack, çarpışma, trafik | Araç çal-sür çalışıyor, sokaklarda takılmıyor |
| **M3** Suç | Yayalar, wanted 1–5, polis, HUD/minimap | Wanted döngüsü + WASTED/BUSTED tamam |
| **M4** İstanbul hissi | Landmark'lar, su, gün/gece, ses, radyo, martı/kedi/simit detayları | Bölge tanınır; gece/gündüz akıcı |
| **M5** Oyun | Ana hikâye bölümü 1, 4–6 görev, yan aktiviteler, kayıt, ayarlar, kalite otomasyonu, **reklam + IAP** (test kimlikleri) | Baştan sona oynanıyor; kalite kapıları yeşil |
| **M6** Mağaza hazırlığı | Mağaza görselleri, gizlilik politikası, Play checklist, imzalı AAB | Kullanıcı tek tıkla yükleyebilir; `USER_TASKS.md` tamam |
| **M7+** Yeni bölgeler | 0.2 Beyoğlu, 0.3 Beşiktaş, … | Her sürüm: yeni bölge + hikâye bölümü + dengeleme |

## 11. BU OTURUMDA NE YAPACAKSIN

1. Bu metni `docs/prompts/GENESIS.md` olarak kaydet; `TOOLS.md`'de araç envanterini çıkar.
2. Bölüm 3 ve 5'teki gerçekleri hızlıca doğrula (Play şartları, repolar); farkları `DECISIONS.md`'ye yaz.
3. Hafıza iskeletini, `AGENTS.md`'yi ve `USER_TASKS.md`'yi kur. `docs/prompts/CONTINUE.md`'yi de oluştur (Prompt 2 metni kullanıcıdan gelecek ya da sen bu şartnameden türet).
4. M0'ı bitir, sonra M1, M2… sırayla ilerle. Her aşama sonunda kalite kapıları → hafıza → commit/push.
5. **Bağlam bütçesi:** bağlamın ~%80'i dolduğunda mevcut işi güvenli noktada bitir, hafızayı güncelle, push et ve **kısa rapor** ver: ne bitti, ne ölçüldü, ne engellendi, kullanıcıdan beklenen iş, sıradaki 3 adım.
6. Dur-kalk yok: sorun çıkarsa çöz, çözemezsen belgele ve başka işe geç. Başlama mesajı gerekmez; hemen çalış.
