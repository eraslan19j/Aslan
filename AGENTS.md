# AGENTS.md — Istanbul Streets

> Her oturumda İLK okunacak dosya (<150 satır). Oturum başı okuma sırası:
> `AGENTS.md` → `docs/prompts/GENESIS.md` → `docs/memory/PROGRESS.md` → `docs/memory/KNOWN_ISSUES.md` → `docs/USER_TASKS.md` → son `docs/memory/SESSION_LOG.md`.

## Proje Özeti
- **Ad:** Istanbul Streets (çalışma adı; yedek: Boğaz Suçu) | **App ID:** `com.istanbulstreets.game`
- **Tür:** Gerçek İstanbul'da geçen, 3. şahıs açık dünya suç oyunu (Vice City ruhu, %100 orijinal).
- **Öncelik sırası:** (1) Çalışan, kararlı Android APK (API 36), (2) Google Play uyumluluğu, (3) Sıfır maliyet, (4) Dürüstlük.
- **Kullanıcı profili:** Kodlama bilmiyor, bütçe sıfır, Windows PC + Android telefon. **Soru sorma.** Makul varsayımı `DECISIONS.md`'ye yaz. Sadece kullanıcının yapabileceği işleri `docs/USER_TASKS.md`'ye çok basit Türkçe, tıklama tıklama yaz.

## Temel Komutlar
```bash
npm ci                  # Bağımlılıkları kur
npm run typecheck       # tsc --noEmit (sıfır hata)
npm run lint            # ESLint (sıfır uyarı/hata)
npm test                # Vitest saf TS çekirdek birim testleri (Node)
npm run build           # typecheck + vite build -> dist/
npm run smoke           # Headless Chromium duman testi (konsolda 0 hata + raster doğrulama)
npm run cap:sync        # dist/ -> android/ senkronizasyonu (npx cap sync android)
npm run dev             # Vite dev sunucusu (0.0.0.0:5173)
```

## Klasör Haritası
```
docs/
  prompts/GENESIS.md    # Değişmez ana şartname
  prompts/CONTINUE.md   # Sonraki oturumlar için devam prompt'u
  USER_TASKS.md         # Kullanıcıya özel adımlar (basit Türkçe)
  memory/               # PROJECT_BRIEF, ARCHITECTURE, DECISIONS, PROGRESS,
                        # KNOWN_ISSUES, PERF_BUDGET, CREDITS, TOOLS, MONETIZATION, SESSION_LOG
  store/PLAY_CHECKLIST.md
  regions/<ilce>.md     # Bölge kimlik kartları ve veri notları
src/
  core/                 # SAF TS çekirdek (Three.js YASAK; birim testli)
  render/               # Three.js sahne, ışık, malzeme, kamera
  runtime/              # Tarayıcı/Capacitor köprüsü, hata yakalayıcı, döngü
  ui/                   # HUD, menü, ayarlar, dokunmatik kontroller, atıf ekranı
  i18n/                 # Tek kaynak TR + EN metinler
public/                 # Çalışma zamanı statik dosyaları (privacy.html, veri tile'ları vb.)
android/                # Capacitor 8 Android projesi (compileSdk/targetSdk 36)
scripts/                # smoke.mjs, soak.mjs ve build-time veri betikleri
refs/                   # Gitignored referans repolar (kopyalanan her parça CREDITS.md'ye)
```

## Sert Yasaklar
1. **Telif/Marka:** GTA, Rockstar, Take-Two, Vice City, Leonida isim/karakter/logo/müzik/hikâye YOK. Mağaza metninde "GTA" kelimesi KULLANMA. Gerçek araç markası/logosu, gerçek kişi, gerçek polis amblemi YOK.
2. **İbadethaneler:** Ayasofya ve Sultanahmet Camii aktif ibadethanelerdir — içleri kapalı; çevrelerinde şiddet/silah/ragdoll YASAK. Dini/etnik alay YOK.
3. **Asset Lisansı:** Sadece kendi üretimin > CC0 > CC-BY (atıflı). CC-BY-NC, editorial-only, lisansı belirsiz (örn. `OpenCity`) YASAK. Her asset/kod `CREDITS.md`'ye (URL + lisans + tarih/commit hash).
4. **Harita/Uydu:** Google/Bing/Esri/Mapbox uydu görüntüsü gömme YASAK. Oyun canlı API'ye bağımlı olamaz (offline çalışır).
5. **Güvenlik:** Keystore, parola, token ASLA repoya veya loglara yazılmaz. Reklamlarda geliştirmede sadece Google test kimlikleri.
6. **Mimari:** `src/core/` içinde `three` importu YASAK. `Math.random()` deterministik dünya üretiminde YASAK.
7. **Dürüstlük:** Çalıştırmadığın şeye "çalışıyor", ölçmediğine "ölçüldü" DEME.

## Kalite Kapıları & Oturum Protokolü
- **Her aşama bitişinde:** typecheck + lint + birim testleri + headless smoke (0 hata) + (uygunsa) soak + CI/APK yeşil + `PERF_BUDGET.md` + `CREDITS.md` güncel.
- **Git:** Çalışma dalında commit (`feat/fix/perf/docs/ci/chore`) + push.
- **Oturum sonu (~%80 bağlam):** Güvenli noktada dur → `PROGRESS.md` + `SESSION_LOG.md` güncelle → commit + push → kısa 5 maddelik rapor.
