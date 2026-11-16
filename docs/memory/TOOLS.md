# TOOLS.md — Araç ve Ortam Envanteri

Son doğrulama: **2026-11-16**

## 1. Sandbox (Çalışma Makinesi)
| Bileşen | Durum | Sürüm / Detay |
|---|---|---|
| İşletim Sistemi | Var | Linux x86_64 (2 vCPU, 3.8 GB RAM, 20 GB boş disk) |
| Node.js / npm | Var | Node `v22.22.3`, npm `10.9.8`, yarn `1.22.22` |
| Python | Var | Python `3.11.2`, `pip3` |
| Git / GitHub CLI | Var | `git`, `gh` (kimlik doğrulaması hazır: `eraslan19j`, repo `eraslan19j/Aslan`) |
| Java / JDK | **Yok** | Sandbox içinde `java`/`javac` kurulu değil |
| Android SDK / Gradle | **Yok** | Yerel APK derleme yok → **GitHub Actions (`android.yml`)** üzerinde JDK 21 + Android SDK API 36 ile derlenir |
| Chromium / Playwright binary | **Yok** | Playwright tarayıcı CDN'i sandbox izin listesinde değil → **GitHub Actions (`ci.yml`)** üzerinde headless Chromium çalıştırılır |
| FFmpeg | **Yok** | Ses sentezi Web Audio API / saf JS ile yapılır |

### Sandbox Ağ İzin Listesi & Doğrulanan QA Erişim Yolu (EK KURAL B)
- İzinli hostlar: `github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org`.
- Bloklu hostlar (doğrulandı): `release-assets.githubusercontent.com`, `productionresultssa8.blob.core.windows.net` (`gh run download` → `EOF`), Overpass API, AWS S3.
- **Çalışan QA Görüntü & Logcat Alma Yolu:** `ci.yml` ve `android-qa.yml` çıktılarını hem GitHub Actions Artifact olarak yükler hem de ayrı `qa-screens` dalına (`web/` ve `android/`) temizleyerek yazar. Sandbox dal değiştirmeden **`git fetch origin qa-screens && git archive FETCH_HEAD | tar -x -C /tmp/qa-after`** ile tüm PNG'leri ve `logcat-app.txt` dosyasını salt-okunur indirip `read_file` ile görsel olarak inceler.

## 2. Agent Araçları
| Araç | Durum | Kullanım Alanı |
|---|---|---|
| `bash`, `read_file`, `write_file`, `edit_file` | Var | Kodlama, test, git, `gh`, PNG görsel QA incelemesi |
| `start_process` / `get_process_output` / `stop_process` | Var | Canlı Vite önizleme sunucusu (`0.0.0.0:5173`) |
| `web_search` / `fetch_page` | Var | Google Play politikaları, kütüphane dokümanları, veri kaynağı doğrulama |
| `generate_image` | Var | M6 mağaza ikonu (`512×512`), öne çıkan görsel (`1024×500`) |
| `add_voice` / `generate_speech` | Var | M4/M5 radyo anonsları veya görev seslendirmeleri |

## 3. CI / GitHub Altyapısı (Ücretsiz Katman)
- **`.github/workflows/ci.yml`:** Node 22 + typecheck + lint + 31 Vitest birim testi + Vite build + Playwright smoke (`smoke.mjs`) + **14 çekim görsel QA & `%6` piksel regresyon farkı (`screenshot.mjs`)** + **sürüş soak testi (`soak.mjs`, push 3 dk / dispatch 10 dk)** + Artifact & `qa-screens:web/` yayını.
- **`.github/workflows/android.yml`:** Node 22 + JDK 21 + Android SDK (API 36, Build-Tools 36.0.0) + `cap sync android` + `./gradlew assembleDebug` (+ keystore secrets varsa `bundleRelease`) + `aapt2` doğrulaması + GitHub Release (`v0.2.0`) APK yayını.
- **`.github/workflows/android-qa.yml`:** Android x86_64 KVM API 34 Pixel 6 emülatöründe (`scripts/android-emulator-qa.sh`) APK kurulumu, başlatma, 2400×1080 yatay/çentik kontrolü, `adb exec-out screencap`, sanal joystick kaydırma (`adb shell input swipe`), Geri tuşu (`keyevent 4`), `adb logcat` (`FATAL`/`ANR`/Chromium taraması) + Artifact & `qa-screens:android/` yayını.
- **`.github/workflows/fetch-esenler-data.yml` & `fetch-fatih-data.yml`:** SHA-256 doğrulamalı `osm_data.zip` + Copernicus DEM GLO-30 + Overpass çevrimdışı 300 m karo üretimi (`public/derived-data/`).
- **`.github/workflows/pages.yml`:** GitHub Pages web demosu + `privacy.html`.
