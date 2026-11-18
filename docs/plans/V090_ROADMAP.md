# v0.9.0 — Araç Odaklı Büyük Gelişim Planı (Kalıcı Yol Haritası)

> **Durum:** Uygulanıyor · **Hedef sürüm:** `0.9.0` (`versionCode 11`) · **Başlangıç tabanı:** `99fe35a` (`v0.8.0`)
> Bu dosya oturumlar arası **kalıcı plandır**. Her oturum sonunda `docs/memory/PROGRESS.md` +
> `docs/memory/SESSION_LOG.md` + `docs/memory/CAR_DATABASE.md` güncellenir.

## 0. Kullanıcı Talebi (birebir kapsam)

| # | Talep | Bu plandaki karşılığı |
|---|---|---|
| R1 | Lastik (kayma) sesi çok yapmacık, geliştirilsin | A2 — Gerçek lastik fizik modeline bağlı 3 katmanlı sürtünme sesi |
| R2 | Sesler/efektler daha güçlü olsun | A1–A5 (motor, turbo, egzoz, çarpma, lastik) |
| R3 | **Sadece arabalar** ile ilgilen (bu plan için) | Tüm iş kalemleri `src/core/vehicle*`, `src/render/vehicle*`, `src/runtime/soundEngine*` |
| R4 | Araç çeşitlerine göre ağırlık/hız/motor/tork en ince detaya kadar | C1 — `CAR_DATABASE.md` + `src/core/vehicleCatalog.ts` + testler |
| R5 | Ekrandaki gereksiz yazılar/bilgiler kalksın (“site gibi görünüyor”) | U1 — HUD sadeleştirme (FPS/Çizim/Karo/Bina satırı ana ekrandan kalkar) |
| R6 | Araç NPC aracının içine giriyor (gerçekçi değil) | P1 — OBB↔OBB doyumlu çarpışma çözümü (SAT + MTV) |
| R7 | GTA tarzı çarpma efekti & araç hasarı (kapı, kaput uçması) | D1–D3 — Panel hasarı, deformasyon, kopan parça, cam kırılması |
| R8 | Egzoz sesi iyi ama geliştirilebilir | A1/A5 |
| R9 | Motor sesi katmanlı ve gerçekçi | A1 — Egzoz + emme + mekanik + turbo katmanları |
| R10 | Nitro/turbo sesi geliştirilsin | A3 |
| R11 | Araç fiziği geliştirilsin | P2 — Kütle/hp/tork’tan türetilmiş fizik + hasar etkisi |
| R12 | Tüm araçlar (NPC dâhil) tasarlanıp geliştirilsin | V1 — 7 gövde sınıfına ayrı görsel + hasar |
| R13 | Karakter geliştirilsin, kapı açıp binme animasyonu | K1 — Kapı pivotu + oturma koreografisi |
| R14 | Açık kaynak araştırması, depoları indir, araçları indir | Bölüm 1 (kaynak tablosu) + `refs/` (gitignored) |
| R15 | Proje deposuna çalışan APK gönder, tam yetki | Sürüm sonunda CI APK + GitHub Release |
| R16 | Kalıcı hafıza ekle, her güncellemede güncelle | Bölüm 5 — `docs/memory/*` protokolü |

## 1. Araştırılan Açık Kaynak Kaynaklar (lisans doğrulandı)

| Kaynak | Lisans | Ne alındı / neden |
|---|---|---|
| [`geoffmyers/engine-sound-lab`](https://github.com/geoffmyers/engine-sound-lab) (`engine-dsp.js`) | **GPL-3.0** | ⚠️ **Kod kopyalanmadı** (GPL bulaşıcı). Yalnızca **mimari fikir**: silindir başına ateşleme açısı, egzoz dalga kılavuzu + susturucu rezonansı, emme katmanı, overrun pop’ları, turbo ıslık/blow-off ayrı kanallar. |
| [`Antonio-R1/engine-sound-generator`](https://github.com/Antonio-R1/engine-sound-generator) | **MIT** | MIT olduğu için **algoritma referansı** olarak serbestçe incelendi (`refs/`): emme/egzoz/çıkış dalga kılavuzu uzunlukları, açık/kapalı yansıma katsayıları. |
| [`DasEtwas/enginesound`](https://github.com/DasEtwas/enginesound) | **MIT** | Baldan vd. “Physically informed car engine sound synthesis” (SIVE 2015) parametre seti: boru uç yansıması, susturucu odaları, silindir ateşleme. |
| [`watrabi/beamng-web-clone`](https://github.com/watrabi/beamng-web-clone), [`aphix/crush-stream`](https://github.com/aphix/crush-stream) | belirsiz / kontrol edildi | ⚠️ Kod **kullanılmadı**; yalnızca **hasar tasarımı** fikri: panel başına ayrı gövde parçası, menteşe/kilit kopması, cam kırılması. |
| [`CS-Software-LLC/skidpad`](https://github.com/CS-Software-LLC/skidpad) PR #6 | MIT (proje) | Lastik ciyaklaması: iki bantlı gürültü + teker başına combined-slip kapısı fikri. |
| [`gor3a/vehicle-makes-models`](https://github.com/gor3a/vehicle-makes-models) | **ODbL** | ⚠️ Veri kopyalanmadı (ODbL paylaşım zorunluluğu). Yalnızca **gerçekçi aralık doğrulaması** için okundu (kütle 900–2500 kg, tork 150–800 Nm). |
| `refs/vice` (`eraslan19j/vice`) | referans | Vice City hissi: ağırlıklı gövde salınımı, kapı animasyonu, araç kokpiti. |

**Sonuç:** Tüm DSP ve hasar kodu bu depoda **sıfırdan** yazıldı; hiçbir GPL/ODbL kodu veya verisi
kopyalanmadı. Atıflar `docs/memory/CREDITS.md` içine işlendi.

### İndirilen yerel referanslar (gitignore: `refs/`)
```
refs/engine-sound-lab/   # GPL — sadece okuma, mimari referans
refs/engine-sound-gen/   # MIT
refs/crush-stream/       # sadece okuma (hasar fikri)
refs/beamng-web/         # sadece okuma (hasar fikri)
```

## 2. Uygulama Kalemleri

### A. Ses (R1, R2, R8, R9, R10)
- **A1 — Katmanlı motor sentezi** (`public/audio/engine-worklet.js` yeniden yazılır):
  - `exhaust` (ateşleme darbesi + boru dalga kılavuzu + susturucu LP + rezonans)
  - `intake` (emme plenum rezonansı + gaz kelebeği tıslaması)
  - `mechanical` (supap klikleri ~8 kHz, zincir/kayış vınlaması)
  - `turbo` (türbin ıslığı, spool gecikmesi, blow-off / surge flutter, wastegate)
  - `overrun` (yakıt kesme pop’ları, ayrı kanal)
  - Motor profili: silindir sayısı, V/I düzeni, idle/redline, egzoz tonu (`engineProfile` parametresi).
- **A2 — Gerçekçi lastik sesi** (yapaylık giderilir):
  - Eski sabit `bandpass(1120/2180)` yerine: **gürültü + FM ciyaklama + granüler modülasyon**,
    hıza ve kayma açısına göre sürekli perde kayması, yol yüzeyi tınısı, lastik ısınması.
  - `skidIntensity` yerine teker başına `(slipRatio, slipAngle, normalLoad)` → ağırlıklı
    `tireSquealModel()` (saf TS, `src/core/vehicleAudioModel.ts`, **unit testli**).
- **A3 — Turbo/nitro**: spool ıslığı perde rampası, BOV “psssh”, surge flutter, wastegate bleed, nitro
  püskürtme “whoosh” (opsiyonel, sadece bastırınca).
- **A4 — Çarpma sesleri**: metal gövde (düşük gong + metalik çınlama), cam kırılması, plastik tampon,
  lastik gıcırtısı, hasar şiddetine göre 4 ayrı örnek katmanı.
- **A5 — Egzoz**: devir kesici patlaması, downshift kraker, soğuk rölanti dalgalanması.

### P. Fizik (R6, R11)
- **P1 — Araç↔araç OBB çarpışması** (`src/core/vehicleCollision.ts`):
  SAT + minimum öteleme vektörü; kütle-ağırlıklı itme, teğetsel sürtünme, yaw impulsu,
  **doyum (soketleşme) sıfır** — iki araç asla birbirinin içine giremez.
- **P2 — Katalogdan türetilen fizik**: `src/core/vehicleCatalog.ts` → kütle, güç (hp), tork (Nm),
  vites oranları, final drive, redline, boyutlar, drivetrain, aero (CdA), fren gücü.
  `VEHICLE_PHYSICS_SPECS` bu katalogla **tutarlılık testine** bağlanır (0–100 km/s ≤ ±12 % sapma).
- **P3 — Hasar etkisi**: motor gücü kaybı, direksiyon çekmesi, teker sürüklemesi, cam kırılınca
  görüş kaybı (pseudo), kaput açılınca soğutma kaybı.

### D. Hasar & Efekt (R7)
- **D1 — Panel hasarı çekirdeği** (`src/core/vehicleDamage.ts`): 10 panel (ön tampon, arka tampon,
  sol/sağ kapı, kaput, bagaj, tavan, sol/sağ çamurluk, cam) × `health`, `dent`, `detached`, `open`.
- **D2 — Görsel deformasyon** (`src/render/vehicleDamage.ts`): panel başına köşe noktası kaydırma
  (gerçek “göçük”), boya sıyrılması, cam kırık dokusu, kopan parçaların fizikli uçuşu (kaput, tampon,
  ayna), kapı menteşe açısı.
- **D3 — Duman/kıvılcım/cam tozu**: hasar arttıkça kaputtan duman, kıvılcım yoğunluğu.

### V. Araç Tasarımı (R4, R12)
- **V1** — NPC ve oyuncu için **7 gövde sınıfı**: `sports`, `sedan`, `hatchback`, `suv`, `van`,
  `taxi`, `dolmus`; her sınıfa özgü oranlar, farlar, jantlar, hasar panelleri.
- **V2** — Katalogdaki her model için Türkçe/İngilizce ad, renk paleti, egzoz ses profili.

### K. Karakter (R13)
- **K1** — Kapı açma/kapama pivotu + koreografi: `BİN` → şoför kapısı açılır (0.35 s),
  karakter koltuğa oturur, kapı kapanır; `İN` → tersi.

### U. Arayüz (R5)
- **U1** — Ana HUD’tan `FPS / Çizim / Karo / Bina` satırı kaldırılır (Tanılama modalında kalır).
  Kontrol ipucu şeridi mobilde zaten gizli; masaüstünde tek satıra indirilir.
  Hız göstergesi sadeleştirilir (marka kartı küçültülür).

## 3. Kabul Kriterleri

1. `npx tsc --noEmit` + `npx eslint .` → **0** hata/uyarı.
2. `npx vitest run` → tüm suite’ler yeşil; yeni: `vehicleCollision`, `vehicleDamage`,
   `vehicleCatalog`, `vehicleAudioModel` (en az **+16 test**).
3. `npm run build` + `cap sync android` temiz.
4. `smoke.mjs`: `errors: []`, `drawCalls <= 150`, HUD’da FPS satırı **yok**.
5. İki araç 5 m/s farkla arkadan çarptığında **0.0 m** iç içe girme (unit test + soak).
6. APK CI yeşil, Release `v0.9.0` yayınlanır.
7. `qa-screens` PNG’lerinde: sade HUD, kopan kaput, çalışan kapı animasyonu görülür.

## 4. Sıra (her adım tek commit)

1. Kalıcı hafıza + bu plan → `docs/`
2. `vehicleCatalog.ts` + test → katalog
3. `vehicleAudioModel.ts` + worklet + `soundEngine.ts` → ses
4. `vehicleCollision.ts` + `traffic.ts` + `main.ts` → iç içe girme biter
5. `vehicleDamage.ts` + `render/vehicleDamage.ts` → GTA hasarı
6. `characterMesh`/`vehicleMesh` kapı animasyonu → binme
7. HUD sadeleştirme
8. NPC gövde çeşitleri
9. Tüm kapılar + CI + APK + Release `v0.9.0`

## 5. Kalıcı Hafıza Protokolü (her güncellemede)

Her PR/commit sonunda **zorunlu** güncellenecek dosyalar:

| Dosya | Ne yazılır |
|---|---|
| `docs/memory/PROGRESS.md` | Aşama tablosu + sürüm |
| `docs/memory/SESSION_LOG.md` | Oturum girdisi (yapılan/sonraki) |
| `docs/memory/CAR_DATABASE.md` | Araç spesifikasyonları (kütle, güç, tork, ses profili) |
| `docs/memory/DECISIONS.md` | Mimari kararlar (lisans, ses mimarisi, hasar modeli) |
| `docs/memory/CREDITS.md` | İncelenen depolar + lisans |
| `docs/memory/KNOWN_ISSUES.md` | Açık hatalar |
| `docs/memory/PERF_BUDGET.md` | draw-call / RAM / FPS bütçesi |
| `docs/plans/V090_ROADMAP.md` | Bu dosya — kalem durumu `⬜/🟨/✅` |
| `AGENTS.md` | Oturum başlangıç okuma sırası |
