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
| Chromium / Playwright binary | **Yok** | Sandbox ağ izin listesi sadece `github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org`, `files.pythonhosted.org` ile sınırlı; Playwright tarayıcı CDN'i bloklu → **GitHub Actions (`ci.yml`)** üzerinde headless Chromium çalıştırılır |
| FFmpeg | **Yok** | Ses sentezi Web Audio API ile tarayıcıda / saf JS ile yapılır |

## 2. Agent Araçları
| Araç | Durum | Kullanım Alanı |
|---|---|---|
| `bash`, `read_file`, `write_file`, `edit_file` | Var | Kodlama, test, git, `gh` CLI |
| `start_process` / `get_process_output` / `stop_process` | Var | Canlı Vite önizleme sunucusu (0.0.0.0) |
| `web_search` / `fetch_page` | Var | Google Play politikaları, kütüphane dokümanları, veri kaynağı doğrulama |
| `generate_image` | Var | M6 mağaza ikonu (512×512), öne çıkan görsel (1024×500) ve kurgusal tanıtım görselleri (telifsiz, sıfır maliyet) |
| `add_voice` / `generate_speech` | Var | Gerekirse M4/M5 radyo anonsları veya görev seslendirmeleri |
| `image_search` | Var | Yalnızca görsel referans (oyuna telifli görsel gömülmez) |

## 3. CI / GitHub Altyapısı (Ücretsiz Katman)
- **GitHub Actions (`ubuntu-latest`):**
  - `ci.yml`: Node 22 + typecheck + lint + Vitest + Vite build + Playwright Chromium headless smoke testi (SwiftShader WebGL).
  - `android.yml`: Node 22 + JDK 21 + Android SDK (API 36, Build-Tools 36.0.0) + `cap sync android` + `./gradlew assembleDebug` (+ keystore gizli anahtarları eklendiğinde `bundleRelease`) + `aapt2` doğrulaması + GitHub Release APK yüklemesi.
  - `pages.yml`: GitHub Pages üzerinde web demosu + gizlilik politikası (`privacy.html`).
- **Veri Üretimi (M1+):** Sandbox dış ağı Overpass/Copernicus/İBB'ye kapalı olduğundan, build-time coğrafi veri üretim betikleri GitHub Actions `workflow_dispatch` ile çalıştırılıp çıktı offline tile olarak repoya/artifact'a alınacaktır.
