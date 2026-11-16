# PROGRESS.md — İlerleme ve Sıradaki Adımlar

Son güncelleme: **2026-11-16** (Oturum 1 — Kuruluş & M0)

## Aşama Tablosu

| Aşama | Hedef | Durum | Kanıt / Not |
|---|---|---|---|
| **M0 İskelet** | Repo, hafıza, CI, Capacitor 8 (API 36), başlangıç 3B sahne, `USER_TASKS.md`, Release APK | 🟡 Yapılıyor | Hafıza ve şartname kuruldu; uygulama, Android, CI ve Release APK hazırlanıyor |
| **M1 Dünya** | Sultanahmet–Eminönü offline veri hattı, 300 m tile akışı, 3. şahıs yürüme, kamera, atıf ekranı | ⚪ Bekliyor | M0 yeşil olduktan sonra |
| **M2 Sürüş** | Araç fiziği, carjack, çarpışma, trafik (taksi, dolmuş, sivil) | ⚪ Bekliyor | — |
| **M3 Suç** | Yayalar, panik, Wanted 1–5, Şehir Polisi AI, HUD/minimap, WASTED/BUSTED | ⚪ Bekliyor | — |
| **M4 İstanbul Hissi** | Landmark'lar (Ayasofya/Sultanahmet güvenli alanları, Galata silüeti, vapur), su, gün/gece, ses, radyo, martı/kedi/simit | ⚪ Bekliyor | — |
| **M5 Oyun** | Bölüm 1 hikâyesi (5 ana görev + 3 yan aktivite), kayıt, ayarlar, soak testi, AdMob + IAP (test kimlikleri) | ⚪ Bekliyor | — |
| **M6 Mağaza** | İkon 512×512, öne çıkan 1024×500, ekran görüntüleri, gizlilik politikası, Play Checklist, imzalı AAB | ⚪ Bekliyor | — |
| **M7+ Yeni Bölgeler** | v0.2 Beyoğlu, v0.3 Beşiktaş, v0.4 Üsküdar+Kadıköy… | ⚪ Bekliyor | — |

## Sıradaki 3 Adım
1. **M0 Kod Tabanı & Capacitor 8:** Vite + TS + Three.js + Rapier3D çekirdeğini, saf TS birim testlerini, global hata yakalayıcı + kilitlenme günlüğünü, TR/EN yerelleştirmeyi, Lite modlu İstanbul gün batımı başlangıç sahnesini ve `android/` (API 36, `sensorLandscape`, immersive tam ekran, geri tuşu = duraklat) projesini kur.
2. **CI + Android Workflow Doğrulama:** `ci.yml` (typecheck, lint, test, build, Playwright smoke) ve `android.yml` (JDK 21 + Android SDK 36 debug APK + `aapt2` kontrolü) ile `pages.yml` (web demo + gizlilik politikası) iş akışlarını çalıştır ve hepsini yeşil doğrula.
3. **M0 Release APK:** CI'da üretilen ve doğrulanan API 36 debug APK'sını GitHub Release (`v0.0.1-m0`) olarak yayınla, `PERF_BUDGET.md` & `SESSION_LOG.md` güncelle ve M1 veri hattı hazırlığına geç.
