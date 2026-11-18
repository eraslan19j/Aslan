## v0.11.0 — Gerçek Araç + Dolgu/CPU Testi

Godot 4.7.2 · Mobile (Vulkan) · **Bu bir oyun değil, ölçüm aracı.**

---

### Önceki testin sonucu (senin ölçümün)

| Seviye | Geometri | Render | ms | FPS |
|---|---|---|---|---|
| L0 Boş | 3.4k | 11.3k | 8.58 | 116.5 |
| L1 Mahalle | 15.5k | 47.4k | 8.93 | 112.0 |
| L2 Yoğun | 88.9k | 267.4k | 8.94 | 111.9 |
| L3 Hedef | 210.2k | 630.7k | 9.04 | 110.6 |

**619.000 ek üçgen = sadece 0.46 ms.** Üçgen sayısı senin oyununda **sorun değil.**
Hedef dünya ~50k üçgen — ölçülen tavanın 1/50'si.

**Ama hâlâ 120 Hz tavanındayız.** L0 bile 116 FPS. Yani GPU hiç zorlanmadı.
Üçgen testi **bitti**; sıradaki iki şüpheli: **dolgu** ve **CPU**.

---

### Bu sürümde ne var

#### 1. Dolgu (fill rate) testi
Ekranı kaplayan **saydam katman** sayısını 0 → 12 arası artır.
Her katman tam ekran alpha-blend = mobil GPU'nun en pahalı işi.

`Dolgu -` / `Dolgu +` butonları.

**Beklenen:** 2-3 katmandan sonra FPS düşmeye başlamalı.
Düşmüyorsa mobil GPU gerçekten çok güçlü ve görsel kaliteye yatırım yapabiliriz.

#### 2. CPU testi
Her karede 0 → 2000k skaler işlem. Gerçek oyunda 30 araç + 40 yaya AI'ı
bu sınıfa girer.

`CPU -` / `CPU +` butonları.

**Beklenen:** GDScript yavaş; ~500k'da 30 FPS'in altına düşmeli.

#### 3. Gölge aç/kapa
Gölge geçişlerinin dolgu maliyetini ölçer. `render/geo = 3.00x` bunu zaten
gösteriyordu — şimdi doğrudan ölçüyoruz.

#### 4. Gerçek araç gövdesi (kutular gitti)
`VehicleDef` — **TEK ARAÇ TANIMI** (ADR-012):

- **Yan profil** ile gövde: 10 noktalı silüet, ön tampon → kaput → ön cam →
  tavan → arka cam → bagaj → arka tampon. Kutu değil, araba.
- **Ayrı cam yüzeyi** (saydam, 4 parça) — NPC'lerde de aynı materyal
- **4 tekerlek**, dingil mesafesi 1.42 / -1.38 m
- **Boyut:** 4.42 × 1.82 × 1.18 m (gerçek sedan ölçüsü)

> **K8 kanıtı:** oyuncu aracı ve 200 NPC aracı **aynı fonksiyondan** üretiliyor
> (`_make_vehicle_mesh` → `VehicleDef.build_body`). İkinci hat yok.

**Bulunan hata:** `material_override` kullanıyordum — bu **tüm yüzeyleri eziyor**
ve camı öldürüyordu. Eski oyundaki `trafficGlassMat` opak hatasının **birebir aynısı**
(H1). Kaldırıldı; artık materyaller mesh'in kendi yüzeylerinde.

#### 5. Gölge/z-fighting düzeltmeleri
- Gölge ayarlarını `_ready()`'de değiştirmek **etkisizmiş** (proje ayarı) —
  `project.godot`'a taşındı: split_1=0.35, blend_splits, filtre kalitesi 3
- `depth_prepass` açıldı, MSAA + FXAA
- Işık: mesafe 120 m, bias 0.025/1.0, blur 2.0, fade_start 0.85

---

### Ne yapmalısın

1. Kur, aç.
2. **L1 Mahalle**'ye bas, 10 sn bekle — yeni araç gövdesine bak (kutu değil artık).
3. **Dolgu testini** yap: `Dolgu +` ile 0 → 12 arası çık.
   Her adımda 10 sn bekle + **3 parmak** dokun.
   **FPS hangi katmanda 30'un altına düşüyor?**
4. `Dolgu -` ile sıfırla, sonra **CPU testi**: `CPU +` ile 0 → 2000k.
   Her adımda 10 sn bekle + **3 parmak** dokun.
   **FPS hangi değerde 30'un altına düşüyor?**
5. `Gölge Aç/Kapa` ile farkı ölç.

Rapor artık `stress` alanını da taşıyor:
```json
"stress": { "fill_layers": 6, "cpu_k": 500, "shadow": true }
```

### Kritik karar noktası
- **Dolgu düşük katmanda kırılıyor** → doku/saydamlık bütçesi dar, kalite profili gerekir
- **CPU düşük değerde kırılıyor** → GDScript NPC AI çalışmaz, **C++ (GDExtension) şart**
- **İkisi de yüksek** → Godot bu oyunu rahat taşıyor, Faz 1'e doğrudan geçilir
