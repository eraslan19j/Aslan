# MOBILE_BENCHMARK.md — Mobil Açık Dünya Oyunları Araştırması ve Kıyaslama

Son güncelleme: **2026-11-17**  
Kapsam: Android açık dünya sürüş/aksiyon mobil oyunlarının 2025–2026 incelemeleri, oyuncu geri bildirimleri ve mobil UX standartlarının **Istanbul Streets (`v0.2.1` → `v0.3.0`)** ile kıyaslanması.

---

## 1. İncelenen Referans Mobil Oyunlar ve Oyuncu Bulguları

| Oyun (Android) | Güçlü Yönleri (Oyuncuların Sevdiği) | Zayıf Yönleri (Oyuncuların Şikâyet Ettiği) | Bizim Oyun İçin Çıkarım |
|---|---|---|---|
| **Gangstar Vegas** (4.3–4.4★, 6.85M+ oy) | Geniş şehir, yaya + trafik canlılığı, araç + yaya geçişi, görev/yan aktivite çeşitliliği, gündüz/gece değişimi, güçlü ses/müzik tasarımı | Çevrimdışı zayıflığı, uzak nesne pop-in, yoğun IAP/reklam baskısı | Çevrimdışı tam çalışma avantajımızı koru; görev döngüsü, yaya canlılığı ve ses efektlerini ekle. |
| **Car Parking Multiplayer 2** (Olzhass) | Yürüyüş + sürüş serbestliği, **6 farklı kamera açısı** (takip, kaput/kokpit, kuş bakışı), **korna**, ayarlanabilir trafik/yaya yoğunluğu, taksi/teslimat görevleri ile para kazanma, el freni/drift | 1.8 GB dev APK/veri boyutu, eski cihazlarda RAM baskısı | 6.85 MB kompakt boyutumuz büyük avantaj; **4 kamera açısı, korna, el freni/drift ve taksi yolcu görevlerini** sıfır ek boyutla ekle. |
| **MadOut2 BigCityOnline** | Geniş şehir kaosu, serbest araç sürüşü ve kovalamaca özgürlüğü, hızlı aksiyon | Aşırı reklam, düşük görsel tutarlılık | Reklamsız/temiz ilk açılış deneyimi + tutarlı prosedürel görsel kalite + akıcı çarpışma fiziği fark yaratır. |
| **Payback 2 – The Battle Sandbox** (4.5★, 2.26M oy) | Hızlı tempo, GPS/minimap üzerinde hedef ve polis/düşman göstergesi, basit dokunmatik kontroller (sol yön, sağ gaz/fren, kapı ikonu), 4 GB RAM dostu | Düşük grafik kalitesi, tekrarlayan serbest dolaşım | **Canlı dönen 2B Minimap / GPS radarı**, net aksiyon döngüsü ve düşük RAM kullanımı (~24 MB heap) şart. |
| **City Driving 3D / Klon Sürüş Oyunları** (2.8★ şikâyet analizi) | — | **Her dokunuşta reklam**, dönemeyen/kötü direksiyon, hayalet veya bozuk trafik çarpışması, sıkışınca kurtarma olmaması, rahatsız edici/yapay motor sesi | Sıfır rahatsız edici reklam, yumuşak/kontrollü direksiyon, gerçek trafik çarpışması, tek tuş araç kurtarma (`🚕`/`R`) ve aç/kapat düğmeli yumuşak prosedürel ses. |

---

## 2. Mobil Oyun UX & Kontrol Standartları (2025–2026)

Mobil dokunmatik oyun tasarımı araştırmasından öne çıkan somut kurallar:
1. **Başparmak Bölgesi (Thumb Zone):** Temel eylemler sol/sağ alt başparmak erişiminde olmalı; ekranın ortası temiz kalmalı, HUD kartları aksiyon düğmeleriyle çakışmamalıdır.
2. **Anında Çoklu Geri Bildirim:** Her basış anında görsel durum (`.pressed`), hafif titreşim (haptic) ve ses onayı vermelidir; sürükleme/dokunma geçişlerinde **takılı kalan tuş (stuck input)** olmamalıdır.
3. **Sıfır Okuma Yükü — Yaparak Öğretme:** Uzun metinler yerine parlayan 3B görev halkası, minimap oku, kısa 1–2 kelimelik etiketler (`GAZ`, `FREN`, `DRİFT`, `BİN`, `İN`) kullanılmalıdır.
4. **Düşük Bilişsel Yük:** Oyuncunun en çok aradığı 4 gösterge (Hız/Vites, Nakit `₺`, Aranma `★`, Minimap/Hedef) net görünmeli; teknik geliştirici verileri ekranı boğmadan ulaşılabilir olmalıdır.

---

## 3. Istanbul Streets `v0.2.1` vs Mobil Standartlar — Tespit Edilen Hatalar ve Eksikler

| # | Kategori | `v0.2.1` Durumu (Tespit Edilen Hata / Eksik) | Öncelik | `v0.3.0` Çözüm Planı |
|---|---|---|---|---|
| 1 | **HATA: Hayalet Trafik & Seyrek Dağılım** | Oyuncu taksisi AI trafik araçlarının içinden hayalet gibi geçiyordu; AI araçlar birbirinin içinden geçiyordu; 18 araç tüm 2×2 km haritaya dağıldığından sokaklar boş kalıyordu; yokuşlarda AI araçlar eğime yatmıyordu. | **Kritik** | `RoadTrafficSimulator` oyuncu çevresinde (`35–240 m`) dinamik trafik akışı + AI-AI mesafe koruması + **katı oyuncu↔trafik çarpışma fiziği** + yokuş eğim (pitch) hizalaması. |
| 2 | **HATA: Dokunmatik Mod Değişiminde Takılı Tuş** | `BİN`/`İN` geçişinde aktif `touchState` ve `driveTouch` sıfırlanmıyordu; `GAZ` veya `◀` basılıyken inilince tekrar binildiğinde araç kendiliğinden gidiyordu. | **Kritik** | `HudOverlay` içinde mod geçişinde ve modal açılışında tüm dokunmatik basılı durumların anında sıfırlanması. |
| 3 | **EKSİK: Canlı 2B Minimap / GPS Radarı** | Açık dünya sokaklarını, park hâlindeki taksiyi, cami güvenli alanlarını, polisleri ve görev hedefini gösteren radar yoktu. | **Kritik** | `MinimapRenderer.ts` — gerçek `road-graph.json` sokaklarını kameraya göre döndüren canlı 2B radar (dokunarak `120 m ↔ 240 m` yakınlaştırma). |
| 4 | **EKSİK: Tamamen Sessiz Oyun (0 Ses)** | Motor sesi, drift lastik sesi, korna, çarpışma, kapı ve görev tamamlama sesi yoktu. | **Kritik** | `soundEngine.ts` — sıfır harici dosyalı Web Audio API prosedürel motor/drift/korna/çarpışma/siren/görev sesi + tek tık `🔊`/`🔇` susturma. |
| 5 | **EKSİK: Görev / Kazanç Döngüsü (`₺`)** | Gezinmek ve sürmek dışında hedef, ödül ve ilerleme döngüsü yoktu. | **Yüksek** | `missions.ts` — **Sarı Taksi Yolcu Görevleri** (3B parlayan alım/bırakım halkası + minimap oku + geri sayım + kombo bonusu + kalıcı `₺` bakiyesi). |
| 6 | **EKSİK: Yayalar & Canlı Şehir** | Kaldırımlar tamamen boştu; şehir ıssız hissettiriyordu. | **Yüksek** | `pedestrians.ts` — kaldırımlarda yürüyen 32 instanced yaya (yalnızca **3 draw call**), korna/hızda kaçma/panik tepkisi, Güvenli Alan koruması. |
| 7 | **EKSİK: Aranma (Wanted 1–5) & Kurgusal Şehir Polisi** | M3 yol haritasındaki polis devriyesi, aranma yıldızları ve yakalanma/kaçış döngüsü eksikti. | **Yüksek** | `wanted.ts` — dikkatsiz çarpışmalarda 1–5★ aranma, çakarlı kurgusal Şehir Polisi takibi, İbadethane Güvenli Alanlarında suç/şiddet kilidi, saklanarak soğuma ve `YAKALANDIN` kurtarma döngüsü. |
| 8 | **EKSİK: Mobil Sürüş Araçları (Kamera, Drift, Korna, Kurtarma)** | Mobilde el freni/drift, kamera açısı değişimi, korna ve tek tuş taksi çağırma/kurtarma yoktu. | **Orta** | `📷` 4 kamera açısı (Takip / Geniş / Kaput / Kuş Bakışı), mobilde `DRİFT` + `🔔` Korna + `🚕` Taksi Çağır/Kurtar tuşları + dijital hız/vites göstergesi. |

---

## 4. Performans ve Kalite Hedefi (`v0.3.0`)
- Tüm yeni sistemler (32 yaya, çakarlı polis araçları, 3B görev halkası, 2B minimap, prosedürel ses) **draw call ≤ 115** (150 bütçesinin altında), **APK < 7.2 MB**, **0 internet çağrısı**, **0 üçüncü taraf marka** ve **60 FPS Mali-G720** hedefiyle inşa edilir.
