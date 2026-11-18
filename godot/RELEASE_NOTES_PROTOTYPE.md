## Faz 0.5 — Yoğunluk Merdiveni (v2)

Godot 4.7.2 + Mobile (Vulkan). Bu bir oyun değil, **ölçüm aracı**.

### Neden v2?
v1 sahnesi **362 üçgen**di ve telefonunda **113 FPS** verdi.
POCO X7 Pro 120 Hz olduğu için 113 FPS = **8.85 ms ≈ ekran tavanı**.
Yani GPU'nun ne kadar gücü kaldığını göremedik — o ölçüm bir şey kanıtlamıyor.

v2 tek APK'da **4 yoğunluk seviyesi** sunar. Butonlarla geçilir.

| Seviye | Üçgen | Ne |
|---|---|---|
| **L0 Boş** | ~2.400 | v1 referansı (zemin + 12 bina + 9 araç) |
| **L1 Mahalle** | ~25.000 | 150 bina, 40 araç, cam açık |
| **L2 Yoğun** | ~120.000 | 600 bina, 100 araç, daha yüksek detay |
| **L3 Hedef** | ~500.000 | 1.400 bina, 200 araç — gerçek hedefe yakın |

### Ne yapmalısın
1. APK'yı kur, aç.
2. **Her seviyeye sırayla bas.** Her seferinde **10 saniye bekle**
   (sayaç "ısınıyor…" yazısından çıkıp sayı göstermeye başlayınca).
3. Her seviyede ekrana **3 parmak** dokun → o seviyenin raporu panoya kopyalanır.
4. 4 raporu da buraya yapıştır.

Sayaçta göreceksin:
```
SEVİYE: L2 Yogun — 120.0k üçgen
113.0 FPS | 8.85 ms (p95 11.49) | draw 12 | tri 120.0k
Mali-G720 MC7 | mobile(vulkan)
```

### Kritik soru
**Hangi seviyede FPS 30'un altına düşüyor?**
- **L3'te bile ≥ 30** → Godot rahat taşıyor, Faz 1'e doğrudan geçilir.
- **L2'de düşüyor** → gerçek dünya 1.2 km²'yi karo/streaming ile küçültmek gerekir.
- **L1'de düşüyor** → motor seçimi yanlış, Filament/C++ değerlendirilir.

### v2'de düzeltilenler
- **Gölge tırtıklanması** (v1 ekran görüntüsünde bina kenarlarında zikzak):
  mesafe 180 m → **90 m**, 4 split → **2 split**, bias yumuşatıldı, blur 1.6.
- **Cam saydamlığı:** v1'de `trafficGlassMat` proje ayarına bağlıydı ve opak
  görünüyordu (eski oyundaki H1 hatasının aynısı). Artık materyal kendi
  `TRANSPARENCY_ALPHA` ayarını taşıyor — proje ayarından bağımsız.

### Notlar
- İlk 60 kare ısınma sayılır, ölçüme dahil edilmez. Seviye değişince sayaç sıfırlanır.
- Değerler Godot `Performance` sayaçlarından okunur, uydurulmaz.
