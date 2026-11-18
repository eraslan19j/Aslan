## Faz 0.5 Kanıt Prototipi

Godot 4.7.2 + Mobile (Vulkan) renderer. Bu bir oyun değil, **ölçüm aracı**.

### Telefona kurulum
1. Aşağıdaki `prototype.apk` dosyasını indirin.
2. Telefonda açın; "bilinmeyen kaynaklara izin ver" uyarısını onaylayın.
3. Uygulama açılınca ekranın sol üstünde canlı sayaç görünür.

### Ölçülecek kriterler
| # | Soru | Eşik |
|---|---|---|
| **K2** | Uygulama açıldı mı? | açılmalı |
| **K5** | Ortalama FPS | **≥ 30** |
| **K6** | Renderer adı (ekranda yazar) | `mobile(vulkan)` |
| **K8** | Oyuncu aracı ile NPC'ler aynı görünüyor mu? | aynı |

### Raporu kopyalama
Ekrana **3 parmakla** aynı anda dokunun. Rapor panoya kopyalanır ve
konsola yazılır. Sonra panele yapıştırıp gönderin.

Rapor içeriği: cihaz modeli, GPU adı, renderer, FPS, ortalama/p95/p99
kare süresi, 1% low FPS, draw call, üçgen sayısı.

### Notlar
- İlk 60 kare ısınma sayılır ve **ölçüme dahil edilmez** (shader derleme).
- Değerler Godot `Performance` sayaçlarından okunur, uydurulmaz.
- Sahne: 200×200 m zemin, 12 bina (MultiMesh), 8 NPC araç (MultiMesh),
  1 oyuncu araç — hepsi tek material.
