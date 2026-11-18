# ARCHITECTURE_V2_GODOT.md — Yeni Nesil (Godot) Mimari

> **Durum:** Araştırma raporu sonucu kabul edilen mimari tasarım. Henüz kod yok.
> **Kapsam:** `godot/` klasöründe kurulacak yeni oyun. Mevcut `src/` (web/Three.js) mimarisi için bkz. `ARCHITECTURE.md`.
> **Karar kayıtları:** `DECISIONS.md` → ADR-011 … ADR-016.
> **Tarih:** 2026-11-19

---

## 1. Temel Kararlar (özet)

| # | Karar | Gerekçe | ADR |
|---|-------|---------|-----|
| M-01 | Motor: **Godot 4.7.2-stable** | API 36 + NDK 29 + 16 KB + MIT | ADR-011 |
| M-02 | Alan: **1,2 km²** (1500 × 800 m dikey dilim) | 2.600 bina, ~1,2 MB veri, ölçülebilir | ADR-016 |
| M-03 | **Tek Araç Tanımı** | Oyuncu/NPC ayrı görsel hatasının kök çözümü | ADR-012 |
| M-04 | **GDScript + C++ (GDExtension)** | Hızlı iterasyon + granüler sentez CPU (%35 → %1,7) | ADR-014 |
| M-05 | Konum: aynı depo, **`godot/`** klasörü | Yeni depo yetkisi yok (403) | ADR-013 |
| M-06 | Ses: **2 gerçek kayıt + granüler** | Osilatör "sahte" sorununun çözümü | ADR-014 |
| M-07 | 4 kalite profili + ADPF eklentisi | FPS sözü yerine cihaz sınıfı ölçümü | ADR-015 |
| M-08 | Veri: **OSM2World + Copernicus DSM** | Yüksekliğin %97,2'si uydurma → gerçek veri | ADR-016 |

---

## 2. Katman Mimarisi

**Temel kural: oklar yalnızca aşağı gider. Yukarı çağrı yasak. Aynı katmanda yatay bağımlılık yasak.**

```
┌─────────────────────────────────────────────────────────────┐
│ L5  UI / HUD / Menü            ▸ yalnızca okur, yönetmez    │
├─────────────────────────────────────────────────────────────┤
│ L4  Oyun Döngüsü               ▸ orkestra eder              │
│     (görev, ilerleme, kayıt)                                │
├─────────────────────────────────────────────────────────────┤
│ L3  Oynanış Sistemleri         ▸ dünyayı bilir, UI'yi bilmez│
│     (araç, NPC, trafik, hasar)                              │
├─────────────────────────────────────────────────────────────┤
│ L2  Dünya                      ▸ veri odaklı               │
│     (karo, LOD, navmesh, akış)                              │
├─────────────────────────────────────────────────────────────┤
│ L1  Servisler                  ▸ motor köprüsü, tek kapı    │
│     (fizik, ses, render, giriş)                             │
├─────────────────────────────────────────────────────────────┤
│ L0  Çekirdek                   ▸ hiçbir şeye bağımlı değil │
│     (matematik, RNG, zaman, sabitler)                       │
└─────────────────────────────────────────────────────────────┘
```

### Neden bu ayrım?

| Katman | Gerekçe |
|--------|---------|
| **L0** | En kolay test edilen katman. `Math.random()` / `randf()` yasak — deterministik tohumlu RNG zorunlu. |
| **L1** | Godot'a bağımlı **tek** katman. Motor değişirse yalnızca burası değişir. |
| **L2** | Oynanışı bilmez; saf veri + geometri. |
| **L3** | Dünyayı bilir; UI'yi bilmez → HUD oynanışı bozamaz. |
| **L4** | Sistemleri çağırır, içlerine girmez. |
| **L5** | Sunum. Oynanış durumunu değiştiremez. |

### 🔒 Zorunlu kilit (CI'da denetlenecek)

| Kural | Denetim |
|-------|---------|
| L0 hiçbir katmanı import etmez | `grep` + CI job |
| L1 L2/L3/L4/L5 import etmez | `grep` + CI job |
| L3 L5 import etmez | `grep` + CI job |
| Aynı katmanda yatay import yok | `grep` + CI job |
| Dünya üretiminde `randf()` / `randi()` yasak | `grep` + CI job |

> Bu, mevcut `eslint.config.js` içindeki "src/core/ must remain Three.js-free" kuralının **genelleştirilmiş** halidir.

---

## 3. Dizin Yapısı

```
godot/
├── project.godot
├── export_presets.cfg
├── .gitignore                       # .godot/, *.import, builds/
│
├── 00_core/                         # L0 — bağımlılıksız
│   ├── rng.gd                       # tohumlu deterministik RNG
│   ├── math_util.gd
│   ├── time_service.gd              # sabit adım saati
│   └── constants.gd                 # TÜM sabitler tek yerde
│
├── 10_services/                     # L1 — motor köprüsü
│   ├── physics/
│   │   ├── physics_world.gd         # Jolt sarmalayıcı
│   │   └── vehicle_body.gd          # Pacejka entegrasyonu
│   ├── audio/
│   │   ├── audio_mixer.gd
│   │   ├── engine_sound.gd          # 3 katmanlı motor
│   │   ├── tire_granular.gd         # fizik güdümlü granüler
│   │   └── nitro_sound.gd
│   ├── render/
│   │   ├── quality_profile.gd       # P0–P3 seçimi
│   │   └── camera_rig.gd
│   └── input/
│       └── input_map.gd
│
├── 20_world/                        # L2
│   ├── tile_loader.gd
│   ├── tile_cache.gd
│   ├── lod_manager.gd
│   ├── navmesh_builder.gd           # Recast (Godot içinde gömülü)
│   └── data/
│       ├── buildings.gd             # OSM ring + DSM yükseklik
│       ├── roads.gd
│       └── terrain.gd
│
├── 30_gameplay/                     # L3
│   ├── vehicle/
│   │   ├── vehicle_definition.gd    # ★ TEK ARAÇ TANIMI
│   │   ├── vehicle_instance.gd      # oyuncu VE npc aynı sınıf
│   │   ├── vehicle_damage.gd
│   │   └── vehicle_catalog.gd
│   ├── npc/
│   │   ├── traffic_manager.gd
│   │   ├── npc_vehicle.gd
│   │   ├── pedestrian.gd
│   │   └── spawn_lod.gd
│   └── player/
│       ├── player_controller.gd
│       └── enter_exit.gd            # ★ model DEĞİŞTİRMEZ
│
├── 40_loop/                         # L4
│   ├── game_loop.gd
│   ├── mission_manager.gd
│   ├── save_service.gd
│   └── progress.gd
│
├── 50_ui/                           # L5
│   ├── hud/
│   │   ├── speedometer.gd
│   │   ├── minimap.gd
│   │   └── debug_overlay.gd         # SADECE debug build
│   └── menu/
│
├── assets/                          # varlıklar (kod değil)
│   ├── vehicles/                    # .glb + .tres tanımları
│   ├── characters/
│   ├── buildings/
│   ├── textures/                    # ASTC / ETC2
│   └── audio/                       # lisanslı kayıtlar
│
├── data/                            # ODbL verisi (AYRI LİSANS)
│   ├── tiles/
│   ├── road-graph.json
│   ├── terrain.json
│   └── LICENSE-ODbL.md              # ★ AYNEN KORUNACAK
│
└── native/                          # C++ (GDExtension)
    ├── src/
    │   ├── pacejka_tire.cpp
    │   └── tire_granular_synth.cpp
    ├── SConstruct
    └── aslan_native.gdextension
```

---

## 4. Araç Görsel Hattı — Tek Araç Tanımı

### Yasak olan (mevcut hatanın kaynağı)

```
createPlayerTaxiRig()        ─┐
                              ├─► İKİ FARKLI GÖRSEL HAT  ❌
buildTrafficClassGeometries()─┘
```

### Yeni hat

```
VehicleDefinition (.tres)   ← TEK KAYNAK
        │
        ▼
  VehicleInstance (tek sınıf)
        ├── player_controlled = true   → LOD0, iç mekan açık
        └── player_controlled = false  → LOD0/1/2, iç mekan kapalı
```

### LOD kuralları

| LOD | Mesafe | İçerik |
|-----|--------|--------|
| **LOD0** | 0–60 m | gövde + cam + **iç mekan** + 4 tekerlek |
| **LOD1** | 60–140 m | gövde + cam (iç mekan kapalı) |
| **LOD2** | 140–300 m | gövde (cam birleştirilmiş) |

### 🔒 Değişmez kural

```gdscript
# enter_exit.gd — DOĞRU
func enter_vehicle(vehicle: VehicleInstance, player: Player) -> void:
    player.visible = false
    vehicle.player_controlled = true      # sadece bayrak
    var cam := get_viewport().get_camera_3d()
    cam.get_parent().remove_child(cam)
    vehicle.seat_anchor.add_child(cam)    # kamera taşınır
```

> **`replace_model()` diye bir fonksiyon YOKTUR ve yazılmayacaktır.**
> Binme = bayrak değişimi + kamera taşıma. Model asla değişmez.

### Doğrulama (CI'da zorunlu grep testleri)

```bash
# V1: NPC kodunda ayrı mesh üretici olmamalı
! grep -rqE "build_traffic|create_player_rig|make_npc_mesh" godot/30_gameplay/npc/

# V4: model değiştiren fonksiyon olmamalı
! grep -rqE "replace_model|swap_vehicle_mesh" godot/

# V2: tek cam materyali
test "$(grep -rl 'glass' godot/assets/materials/ 2>/dev/null | wc -l)" -le 1
```

---

## 5. Veri Hattı

```
┌─────────────── CI'DA / ÇEVRİMDIŞI (bir kez) ───────────────┐
│                                                             │
│  OSM .osm/.pbf ──┐                                          │
│                  ├──► OSM2World ──► gerçek height/levels/   │
│  OSM etiketleri ─┘                  roof:height             │
│                                            │                │
│  Copernicus DSM (AWS, 30 m) ──► çatı yüksekliği ──┤         │
│                                                    ▼        │
│                            data/buildings.json              │
│         heightSource: osm2world | dsm | levels | inferred   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────── TELEFONDA (çalışma anı) ────────────────┐
│  tile_loader.gd ──► buildings.gd ──► MultiMesh (batch)      │
│                 ├──► lod_manager.gd                         │
│                 └──► navmesh_builder.gd (Recast)            │
└─────────────────────────────────────────────────────────────┘
```

### 📊 Ölçülmüş mevcut durum ve hedef

| Ölçü | Bugün | Hedef | Durum |
|------|-------|-------|-------|
| `inferred` yükseklik oranı | **%97,2** | **< %20** | 🔴 |
| Fatih yol taşması | %0,00 | < %2 | ✅ |
| Esenler yol taşması | **%20,34** | < %2 | 🔴 (kapsam dışı) |
| Terrain dışı bina | **42** | **0** | 🔴 |
| Arazi oturması medyanı | **−0,00 m** | ±0,5 m | ✅ |
| Min bina genişliği | 1,41 m | ≥ 2,5 m | 🟠 |

### Tek kaynak kuralı

> **Bina ve yol verisi aynı kaynaktan gelmelidir.** Fatih (OSM) temiz; Esenler (İBB GeoPackage) hizasız. Başlangıçta **yalnızca Fatih** kapsamda.

---

## 6. Ses Mimarisi

### Motor — 3 katman (2 gerçek + 1 sentez)

```
RPM ──► katman ağırlıkları
        ├── Kayıt 1: VEHCar_CarEngineSlow_LOOP_01   (Meta, CC BY 4.0)
        ├── Kayıt 2: VEHCar_CarEngineHigh_LOOP_01   (Meta, CC BY 4.0)
        └── Sentez : harmonik (RPM/60 × silindir sayısı)
                          │
                          ▼
        EQ ──► distortion ──► compressor ──► panner
```

### Lastik — fizik güdümlü granüler

| Fizik değeri | Ses parametresi | Aralık |
|--------------|-----------------|--------|
| slip oranı | grain **yoğunluğu** | 0 → 5 tane/sn … tam slip → 80 |
| slip açısı | grain **konumu** (kayıttaki bölge) | düz → tonal, yanal → gürültülü |
| normal kuvvet | grain **genliği** | 0 … %100 |
| tekerlek başına | **panner** | 4 ayrı kanal |
| yüzey | grain **kaynağı** | asfalt / ıslak / çakıl |
| araç hızı | grain **perde kayması** | ±%8 (Doppler) |

**Pencere:** Hann · **Tane boyu:** 20–60 ms · **Çakışma:** 3× · **Örnekleme:** 48 kHz

### CPU gerçeği (hesaplanmış)

| Ortam | Kapasite | Kullanım | Sonuç |
|-------|----------|----------|-------|
| GDScript (muhafazakâr) | 3 M işlem/sn | **%115** | 🔴 yetmez |
| GDScript (iyimser) | 10 M işlem/sn | %35 | 🟡 sınırda |
| **C++ GDExtension** | 200 M işlem/sn | **%1,7** | 🟢 rahat |

> **Karar:** Faz 2a'da **GDScript prototip** (algoritmayı duy), Faz 2b'de **C++ üretim**.

### Bloke edici ön koşul

> 🚨 **Lastik kayma kaydı yok.** Meta Open Sound'un 44 kategorisinde (`AMB ANML BIRD BLLT BOAT CERM CHAIN CLOCK CLOTH CREA CRWD DOOR DRWR DSGN FEET FGHT FOOD GLAS GORE HMN LASR MACH MAG MECH METL MOTR MUSC OBJ PAPR PLAS RAIN SWSH TOOL TOON TRN UI VEGE VEH VOX WATR WEAP WHSH WIND WOOD`) lastik/kayma kategorisi **bulunmuyor**. Sentez ile başlanmaz — kayıt şart.

---

## 7. NPC / Trafik — LOD Katmanları

| Katman | Mesafe | Sayı (1,2 km²) | Fizik | Güncelleme |
|--------|--------|----------------|-------|------------|
| **L0** | 0–80 m | 8 araç | tam | her fizik adımı (60 Hz) |
| **L1** | 80–250 m | 20 araç | kinematic | 30 Hz |
| **L2** | 250 m+ | 40 araç | **yok** | 6 Hz |
| **Toplam** | | **68** | | |

**Terfi kuralları:**
- L2 → L1: kavşağa 50 m kala
- L2/L1 → L0: oyuncu 40 m'ye yaklaşınca veya çarpışma anında
- Gecikme: 1 kare (kabul edilebilir)

---

## 8. Kalite Profilleri

| Profil | GPU sınıfı | Renderer | Doku | Gölge | Araç LOD | NPC |
|--------|-----------|----------|------|-------|----------|-----|
| **P0 Düşük** | PowerVR, eski Mali | Compatibility (GLES3) | ETC2 | kapalı / 1024² | LOD2 max | 20 |
| **P1 Orta** | Mali-G5x/G6x, Adreno 6xx | Mobile (Vulkan) | ASTC 8×8 | 1024² | LOD1 max | 40 |
| **P2 Yüksek** | **Mali-G720 (POCO X7 Pro)** | Mobile (Vulkan) | ASTC 4×4 | 2048² | LOD0+LOD1 | 68 |
| **P3 Ultra** | Adreno 7xx+, Dimensity 9xxx | Mobile (Vulkan) | ASTC 4×4 | 4096² | LOD0 | 100 |

**Seçim yöntemi (sabit tablo değil):**
1. GPU adını oku (`GL_RENDERER`)
2. 60 kare ölç, ortalama kare süresi → aday profil
3. Bir üst profili 5 sn dene; kare süresi > hedef × 1,3 ise geri düş
4. Sonucu kaydet (tekrar ölçme)

---

## 9. Görsel Kalite Stratejisi

**Mobil renderer'da bulunmayanlar (kaynaktan doğrulandı):**
- `render_forward_mobile.cpp:906` → `"not using ssr/sss (currently not supported)"`
- GLES3 yolunda SSAO / SDFGI / volumetric fog → **boş gövde (stub)**

**Bu yüzden görüntü şu 5 temel üzerine kurulur:**

| # | Ne | Neden en yüksek getiri |
|---|----|------------------------|
| 1 | Güneş açısı + sert gölge | GTA hissi = uzun gölge + sıcak ışık |
| 2 | PBR materyal doğruluğu | Araba boyası "plastik" görünmesin |
| 3 | **IBL / çevre haritası** | Cam ve metal yansıması (mevcut projede **yoktu**) |
| 4 | VoxelGI | Bina aralarında ışık sızması düzelsin |
| 5 | Atmosferik sis | Ufuk kesilmesin |

---

## 10. Arşivleme Sırası (geri dönüş yolu korunur)

| Adım | Ne | Ön koşul |
|------|----|----------|
| 0 | `git tag legacy-web-v0.9.1` | — |
| 1 | Sürüm birleştirme (`version.json`) | — |
| 2 | `godot/` klasörü kurulumu | Adım 1 |
| 3 | Faz 0.5 kabul (K1–K8) | Adım 2 |
| 4 | Faz 1 dikey dilim | Adım 3 |
| 5 | Faz 2–5 sistemler | Adım 4 |
| 6 | Play yayını + 2 hafta stabil | Adım 5 |
| 7 | `git tag legacy-web-final` + `src/` kaldır | **Adım 6** |

> ⛔ **Adım 7'ye kadar `src/` altındaki hiçbir dosya silinmez.**

---

## 11. Bilinmeyenler (dürüst liste)

| Bilinmeyen | Neden | Ne zaman çözülür |
|-----------|-------|------------------|
| Telefonda kaç kare/s? | Ölçülmedi (ADB yok) | Faz 0.5, kullanıcının cihazında |
| Godot APK CI'da derlenir mi? | `dl.google.com` sandbox'ta kapalı | Faz 0.5 ilk CI çalışması |
| 16 KB gerçekten geçer mi? | Kod öyle diyor, test edilmedi | Faz 0.5 `readelf` |
| Hangi profil? | Mali-G720 teorik P2 | Faz 0.5 |
| Ses kaynağı bulunur mu? | `freesound.org` allowlist dışı | Faz 2 öncesi, kullanıcıdan |
| 1,2 km² doğru mu? | 2.600 bina hesaplandı, render edilmedi | Faz 0.5 K5 |
