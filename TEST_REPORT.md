# Istanbul Streets — Phase 7 Automated Test & Build Verification Report

**Branch:** `arena/868fe0be-aslan`  
**Release Version:** `0.4.0` (`versionCode 6`, Android API 36 `sensorLandscape`)  
**Test Runner:** Vitest `5.1.0` (`11` test suites / `50` automated tests), Playwright `1.65.1` (real Chromium WebGL Smoke + 14-shot Visual QA + 3-min Soak), Android Emulator KVM QA + Gradle API 36 APK build.

---

## 1. Automated Verification Matrix (`TEST 1`–`TEST 10`)

| Test ID | Verification Scope | Automated Test Location | Result | Key Evidence |
|---|---|---|---|---|
| **TEST 1** | Player cannot pass through buildings; grounded friction stops sliding | `src/core/phase7Verification.test.ts` | **PASS** | 120 frames full sprint (`13.8 m/s`) into wall: `isPointInsideBuilding === false` every tick; releasing input decelerates to `< 0.01 m/s` within 0.5 s |
| **TEST 2** | Player cannot walk through vehicle body (parked & angled OBB) | `src/core/phase7Verification.test.ts` | **PASS** | 150 frames full sprint into angled (`36°`) taxi OBB: `collidedVehicleId === 'player-taxi'`, zero penetration into chassis box |
| **TEST 3** | Entering vehicle attaches driver visibly into cabin; no foot drift or self-collision | `src/core/phase7Verification.test.ts`, `src/render/meshOptimizer.test.ts`, `scripts/smoke.mjs` | **PASS** | `mode === 'seated_driving'`, foot inputs produce `0` velocity & `null` self-collision; `charRig.root.parent === driverSeatMount`, `root.visible === true`, `shadowDisc.visible === false`; live Chromium `smoke.mjs` asserts `window.__game.driverVisibleInCabin === true` |
| **TEST 4** | Safe vehicle exit without clipping into walls or neighboring traffic | `src/core/phase7Verification.test.ts` | **PASS** | Taxi boxed in by solid building on driver-left AND AI traffic car on passenger-right -> exit spot verified clear of building, own taxi OBB, and traffic OBB; `detachPlayerFromVehicleSeat` restores `mode === 'on_foot'` |
| **TEST 5** | High-speed vehicle cannot drive or tunnel through thin buildings | `src/core/phase7Verification.test.ts` | **PASS** | Taxi launched at top speed (`~88 km/h`) into `2 m`-thick wall across 120 frames: 6-point sub-stepped collider keeps front bumper outside wall (`z + 0.45*L <= 20.05`) |
| **TEST 6** | Vehicle stays strictly grounded on real sloped roads | `src/core/phase7Verification.test.ts` | **PASS** | 180 ticks driving across real Tepe Mahallesi terrain (`29–90 m` DEM): `|vehicle.y - sampleTerrainElevation(x, z)| < 0.01 m` every tick |
| **TEST 7** | Road networks traversable without stubs or unintended gaps | `src/core/phase7Verification.test.ts`, `scripts/audit-world-geometry.py` | **PASS** | `0` tiny stub roads (`< 2 m`), `0` unintended road-graph gaps (`≤ 9 m`) in both regions; `99.7%` Tepe (`1,916/1,922`) and `93.2%` Fatih (`1,674/1,796`) in largest connected component |
| **TEST 8** | Pedestrians move cleanly and avoid real buildings & vehicle bodies | `src/core/phase7Verification.test.ts` | **PASS** | 180 ticks × 24 agents in BOTH Tepe Mahallesi and Fatih with full `BuildingSpatialGrid` + parked taxi OBB: **`0` pedestrians inside buildings, `0` inside vehicles** |
| **TEST 9** | Existing world assets, tiles, buildings, sanctuaries & landmarks intact | `src/core/phase7Verification.test.ts` | **PASS** | Tepe: `44` tiles, `4,472` buildings, `10` sanctuaries; Fatih: `59` tiles, `3,656` buildings, `3` sanctuaries, `8` landmarks — all preserved |
| **TEST 10** | Mobile mesh optimization (`meshoptimizer` / indexed welding) & Android API 36 build | `src/core/phase7Verification.test.ts`, `src/render/meshOptimizer.test.ts`, `.github/workflows/android.yml` | **PASS** | Indexed welding compresses quad vertices (`6 → 4`), sets `geo.index` + tight `boundingSphere`; `compileSdkVersion = 36`, `targetSdkVersion = 36`, `sensorLandscape`; `npm run build && npm run cap:sync` clean |

---

## 2. Local Build & Test Suite Execution Results

```text
npm run typecheck  -> PASS (0 errors, TypeScript 5.9.3)
npm run lint       -> PASS (0 errors, 0 warnings, ESLint 10)
npm test           -> PASS (11 test files, 50/50 tests passed in 1.70s)
npm run build      -> PASS (Vite 7.3.8 production bundle built in 2.61s)
npm run cap:sync   -> PASS (Capacitor 8.6.2 synced to Android project in 0.101s)
```

---

## 3. GitHub Actions CI, Visual QA, Android Emulator QA & API 36 APK (Verified on `8ccb1da`)

| Pipeline | Run ID | Status | Verified Output & Metrics |
|---|---|---|---|
| **CI (Web + Unit + Headless Chromium Smoke + 14-Shot Visual QA + 3-Min Soak)** | `44048155803` | **PASS (`7m15s`)** | **50/50 Vitest tests**, **0 console errors**, **0 HUD layout warnings**, `driverVisibleInCabin: true`, `walkDist: 2.25 m`, `driveDist: 3.30 m` (`33 km/h`), `exitedOk: true`, `fatihSwitchedOk: true`, **14/14 screenshots** (`Lite: 66–70 draw calls / 86K–109K tris`, `Normal: 83–100 draw calls / 116K–173K tris`), 3-min Soak (`maxDrawCalls: 68`, `texDrift: 0`, `heapGrowthMb: -0.09 MB`, `errors: []`) |
| **Android Emulator QA (x86_64 KVM + Screencap + Logcat)** | `44048155727` | **PASS** | `ISTANBUL_BOOT` `v0.4.0`, `glError: 0`, `FPS: 32`, `Çizim: 63`, `Karo: 7`, `Bina: 2033`, `2400x1080` landscape, `fatalCount: 0`, `anrCount: 0`, `chromiumErrorCount: 0`, `appAliveAfterBack: true` |
| **Android APK / AAB (API 36)** | `44048155859` | **PASS (`1m53s`)** | `com.istanbulstreets.game`, `versionCode 6` (`v0.4.0`), `targetSdkVersion 36`, `sensorLandscape`, Debug APK **`6.91 MB` (`7,247,998 B`)** published to GitHub Release `v0.4.0` |

**Verified Visual Inspection (`qa-screens` PNGs):**
- `esenler_07_driving_20x9.png`: Seated protagonist clearly visible on left-hand driver seat behind translucent tinted rear & side glass; continuous road surface down the slope; zero HUD overlap.
- `esenler_02_street.png`: Grounded character sneakers on asphalt beside parked Sarı Taksi; building fronts aligned cleanly behind curbs with zero road intrusions.
- `esenler_03_overview.png` & `fatih_03_overview.png`: Continuous bend-joined roads & intersections across both regions with zero triangular bend gaps and all original buildings/landmarks preserved.

---

## 4. `v0.5.0` Open-World Upgrade Verification (Stages A–H, Verified on `c4572fa`)

**Release Version:** `0.5.0` (`versionCode 7`, Android API 36 `sensorLandscape`)  
**Unit & Integration Tests:** `12` test suites / **`54/54` tests PASS** (added `src/render/openWorldSystems.test.ts` validating 2-layer curb/asphalt Z-separation, junction hubs, zebra crosswalks, spring-damper vehicle suspension, TimeCycle wet-asphalt sheen, NPC crowd separation/idle states, parked + moving traffic, and 4-tier Android quality scaling).

### GeoQC Building-Building Overlap Audit (`scripts/audit-world-geometry.py`)
| Region | Tiles | Unique Buildings | Building-Building Overlaps (Before → After) | Overlap Area (Before → After) | Severe Road Intrusions | Unintended Road Gaps ≤ 9 m |
|---|---|---|---|---|---|---|
| `esenler-namik-kemal` | 44 | 4,442 | `33 → 0` | `38,855.2 m² → 0.0 m²` (`-100%`) | `0` | `0` |
| `fatih-sultanahmet-eminonu` | 59 | 3,646 | `33 → 3` | `2,663.3 m² → 1.76 m²` (`-99.93%`) | `0` | `0` |

### Remote CI, Visual QA, Android Emulator & APK Pipelines (`c4572fa`)
| Pipeline | Run ID | Status | Verified Output & Metrics |
|---|---|---|---|
| **CI (Web + Unit + Smoke + 15-Shot Visual QA + 3-Min Soak)** | `44073160242` | **PASS (`7m48s`)** | **54/54 Vitest**, **0 console errors**, **0 HUD warnings**, `version: "0.5.0"`, `trafficCount: 26`, `pedestrianCount: 40`, `driverVisibleInCabin: true`, **15/15 PNGs** (including `esenler_09_sunset_driving.png`), Low tier `68–71` draws (`9` tiles), High/Ultra `113–120` draws (`24–25` tiles / `4,131` buildings); 3-min Soak `maxDrawCalls: 74`, `texDrift: 0`, `heapGrowthMb: -42.36 MB`, `errors: []` |
| **Android Emulator QA (x86_64 KVM)** | `44073160200` | **PASS** | `ISTANBUL_BOOT` `v0.5.0`, `qualityTier: "low"`, `glError: 0`, `2400x1080` landscape, `FPS: 64`, `fatalCount: 0`, `anrCount: 0`, `chromiumErrorCount: 0`, `appAliveAfterBack: true` |
| **Android API 36 Debug APK** | `44073160361` | **PASS** | `com.istanbulstreets.game`, `versionCode 7` (`v0.5.0`), `targetSdkVersion 36`, `sensorLandscape` verified via `aapt2` |

**Verified Visual Inspection (`qa-screens` PNGs on `c4572fa`):**
- `esenler_03_overview.png` & `fatih_03_overview.png`: Zero concrete curbs slicing across T-junction mouths or road endpoints; clean circular asphalt junction hubs, outer curbs only, zebra crosswalk bars, rooftop silhouettes, and Mediterranean palm trees.
- `esenler_09_sunset_driving.png`: Vice City golden-peach coastal sunset sky, glowing amber apartment/shopfront windows, wet-asphalt headlight reflection sheen, seated driver visible inside taxi cabin, `"Ultra"` quality pill.
- `esenler_04_night.png`: Starry indigo sky, illuminated Istanbul facades, gleaming wet asphalt under warm headlights.
- `esenler_07_driving_20x9.png` & `android/emulator_01_launch.png`: Crisp 20:9 mobile controls, `"Yüksek"` / `"Düşük"` quality badges, zero HUD clipping or overlap.

---

## 5. `v0.6.0` GTA Free-Roam & Sculpted Wheeled NPC Vehicles Verification (`fe7c797` / `477f985`)

**Release Version:** `0.6.0` (`versionCode 8`, Android API 36 `sensorLandscape`)  
**Unit & Integration Tests:** `12` test suites / **`55/55` tests PASS** (added sculpted 3-class NPC geometry + wheeled police cruiser + `swapWithPlayerVehicle` street car takeover verification in `src/render/openWorldSystems.test.ts`).

### Key Changes Verified
- **Pure GTA-Style Free-Roam (Zero Forced Taxi Mode):** Replaced default yellow taxi with a sleek crimson GT Sports Coupe (`34 IST 06`, dual exhausts, rear wing spoiler, zero roof taxi sign); disabled automatic taxi passenger pickup missions, hidden `$0` HUD cash badge, and cleared forced taxi minimap beacon (`activeMissionPhase === null`).
- **Enter / Steal Any Street Car (`F` / `BİN`):** Pressing `F` or `BİN` near any parked or moving NPC car seamlessly swaps into that vehicle (`TrafficSystem.swapWithPlayerVehicle`), instantly adopting its class (`sports`, `sedan`, `hatchback`, `suv`, `van`), metallic paint color, and roof/spoiler styling while keeping zero physics/memory leaks.
- **Sculpted Multi-Class Wheeled NPC Vehicles & Humanoid Pedestrians:** Replaced blocky 2-box traffic vehicles with 3 distinct sculpted instanced classes (`sports`, `sedan`, `suv` — each with 4 real 3D spoked alloy wheels, wheel arches, sloped windshields, grilles, bumpers, headlights/taillights, and spoilers/roof rails), upgraded police cruisers with full sculpted wheeled bodies, and upgraded instanced pedestrians to twin-legged articulated silhouettes while **reducing** total High-tier draw calls (`115 → 111`).
- **Visual Polish Fix:** Lowered `driverSeatMount` inside the low-slung sports coupe cabin so the seated driver has clean headroom under the roof across all archetypes, and shifted the forward night headlight light cone ahead of the hood.

### Remote CI, Visual QA, Android Emulator & APK Pipelines (`fe7c797` / `477f985`)
| Pipeline | Run ID | Status | Verified Output & Metrics |
|---|---|---|---|
| **CI (Web + Unit + Smoke + 15-Shot Visual QA + 3-Min Soak)** | `44092751836` | **PASS (`12m18s`)** | **55/55 Vitest**, **0 console errors**, **0 HUD warnings**, `version: "0.6.0"`, `activeMissionPhase: null`, `trafficCount: 26`, `pedestrianCount: 40`, `driverVisibleInCabin: true`, **15/15 PNGs**, Low tier `71–72` draws (`9` tiles), Medium `87–99` draws (`9` tiles), High `110–114` draws (`24–25` tiles / `4,131` buildings); 3-min Soak `maxDrawCalls: 77`, `texDrift: 0`, `heapGrowthMb: -8.33 MB`, `errors: []` |
| **Android Emulator QA (x86_64 KVM)** | `44091268207` | **PASS (`4m15s`)** | `ISTANBUL_BOOT` `v0.6.0`, `qualityTier: "low"`, `glError: 0`, `2400x1080` landscape, `Çizim: 64`, `Karo: 5`, `Bina: 1341`, `fatalCount: 0`, `anrCount: 0`, `chromiumErrorCount: 0`, `appAliveAfterBack: true` |
| **Android API 36 Debug APK & GitHub Release `v0.6.0`** | `44092751801` | **PASS** | `com.istanbulstreets.game`, `versionCode 8` (`v0.6.0`), `targetSdkVersion 36`, `sensorLandscape` verified via `aapt2`, published to `releases/tag/v0.6.0` (`istanbul-streets-debug.apk`, `6.92 MB`) |

---

## 6. `v0.7.0` Apex Driving Physics, CarX HUD, DSP Audio & Performance Overhaul

**Release Version:** `0.7.0` (`versionCode 9`, Android API 36 `sensorLandscape`)  
**Unit & Integration Tests:** `13` test suites / **`61/61` tests PASS** (added `src/core/vehiclePhysics.test.ts` covering Pacejka saturation, longitudinal/lateral load transfer, 6-speed auto/manual shifting, Street/Drift/Sim handling modes, 4-wheel torque split, turbo boost & BOV, collision impulse conservation, and zero-NaN stability across `0.001–0.05 s` timesteps).

### Key Systems Delivered & Verified
- **240 Hz 4-Wheel Pacejka & Weight-Transfer Vehicle Physics (`src/core/vehiclePhysics.ts`, `src/core/vehicle.ts`):** 6-speed sequential gearbox (`auto` / `manual` + paddle shift `E`/`Q`), turbo spool & blow-off valve (`BAR` gauge), AWD/RWD/FWD drivetrains, realistic brake torque (`6,400–8,800 Nm`) + handbrake drift lock, `street` / `drift` / `sim` physics presets (with `sim` assists = `0`), glancing wall collision impulse without tunneling, and full DEM slope grounding.
- **Zero-Idle Pooled Vehicle VFX & 4-Wheel Articulation (`src/render/vehicleEffects.ts`, `src/render/vehicleMesh.ts`):** Densely packed `InstancedMesh` skidmarks, tire drift smoke, and scrape sparks (`0` GPU draw calls when idle), 4 spinning/steering alloy wheels + brake calipers, twin exhaust backfire cones, and 5 camera views (`Takip`, `Geniş`, `Kaput`, `Tampon`, `Üstten`) with drift-angle lead and speed FOV warp.
- **Procedural Combustion AudioWorklet + Waveshaper DSP (`public/audio/engine-worklet.js`, `src/runtime/soundEngine.ts`):** Cylinder-accurate firing order harmonics, turbo whistle, blow-off valve chirp, exhaust pop/backfire, tire screech, and automatic Waveshaper DSP fallback with finite-value guards.
- **CarX Street Cockpit HUD & 3 Steering Modes (`src/ui/HudOverlay.ts`, `src/styles.css`):** Live RPM tachometer bar, gear indicator, `km/s`, turbo `BAR`, drivetrain (`RWD`/`AWD`/`FWD`), `CADDE`/`DRİFT`/`SİM` and `OTO`/`MAN` badges, `Butonlar` / `Kaydırıcı` / `Jiroskop` touch steering modes, localized TR/EN diagnostics panel, and pure free-roam (zero active police/wanted/missions).
- **Android Hardware Performance & Zero-GC Loop (`android/.../NativeGameBoostPlugin.java`, `src/main.ts`, `src/ui/MinimapRenderer.ts`):** Native Android hardware/refresh/audio/GameMode bridge, zero-allocation OBB pool, AABB-culled minimap road rendering, string-diff HUD caching — cutting SwiftShader frame time **`389.14 ms → 224.53 ms` (`-42%`)** and achieving **`-10.71 MB`** heap delta across the 3-minute driving soak test.

### Remote CI, Visual QA, Android Emulator & APK Pipelines (`275928e`)
| Pipeline | Run ID | Status | Verified Output & Metrics |
|---|---|---|---|
| **CI (Web + Unit + Smoke + 15-Shot Visual QA + 3-Min Soak)** | `44128296967` | **PASS** | **61/61 Vitest**, **0 console errors**, **0 HUD warnings**, `version: "0.7.0"`, `frameMs: 224.53 ms` (`-42%` vs `v0.6.0`), `driveDist: 2.69 m` (`28 km/h`, `Gear 1`, `4009 RPM`), `cameraCycleOk: true`, `drivingModeToggleOk: true`, `transmissionToggleOk: true`, `audioToggleOk: true`, `driverVisibleInCabin: true`, **15/15 PNGs** (`esenler_07_driving_20x9.png`, `esenler_09_sunset_driving.png`, `esenler_08_diagnostics_20x9.png` visually inspected); 3-min Soak `maxDrawCalls: 83`, `texDrift: 0`, `heapGrowthMb: -10.71 MB`, `errors: []` |
| **Android API 36 Debug APK & GitHub Release `v0.7.0`** | `44128296916` | **PASS** | `com.istanbulstreets.game`, `versionCode 9` (`v0.7.0`), `targetSdkVersion 36`, `sensorLandscape`, `public/audio/engine-worklet.js` & `NativeGameBoostPlugin` synced cleanly |
| **Android Emulator QA (x86_64 KVM)** | `44131393592` | **PASS** | `ISTANBUL_BOOT` `v0.7.0`, `glError: 0`, `nativeHw` reported (`cpuCores: 2`, `sdkInt: 34`, `audioSampleRate: 48000`, `refreshRateHz: 60`, `gameMode: "standard"`), `2400x1080` landscape, `fatalCount: 0`, `anrCount: 0`, `chromiumErrorCount: 0`, `appAliveAfterBack: true` |

---

## 7. `v0.8.0` Street Grip, Road-Clear Props, Upgraded NPC Fleet, Physical Perimeter Barriers & Visual Modernization

**Release Version:** `0.8.0` (`versionCode 10`, Android API 36 `sensorLandscape`)  
**Unit & Integration Tests:** `16` test suites / **`67/67` tests PASS** (added `src/core/world/worldBounds.test.ts`, `src/render/streetProps.test.ts`, and `src/core/v080DrivingAndTraffic.test.ts`).

### Key Systems Delivered & Verified
- **Planted High-Speed `street` Handling (`src/core/vehiclePhysics.ts`, `src/core/vehicle.ts`):** Rear-biased Street traction (`gripFrontMult: 1.2`, `gripRearMult: 1.38`), `driftRearRelease: 0` on normal throttle (preserving intentional handbrake slides + dedicated `drift` / `sim` modes), lateral ESC stabilization + high-speed steering lock taper (`< 22°` peak slip during full-lock turns above `110 km/h`).
- **100% Road-Clear Street Props Across All 103 Tiles (`src/render/tileMeshBuilder.ts`, `src/render/streetProps.test.ts`):** Pure deterministic `planTileStreetProps()` checks every road carriageway segment, curb lip, highway median, intersection mouth, building footprint, and prop-to-prop spacing (`>= 2.2 m` road clearance for every tree, `>= 1.1 m` for every streetlamp/sign/bench/bin) — verified `0` violations across all `44` Esenler + `59` Fatih tiles.
- **Upgraded NPC Vehicles — Player Visuals & Mechanics (`src/core/traffic.ts`, `src/render/vehicleMesh.ts`, `src/render/RegionWorldScene.ts`):** Shared `InstancedMesh` rotating & front-steering 5-spoke alloy wheels (`+1` draw call for 144 wheels), dynamic crimson brake lights + high-mount 3rd LED brake bar, metallic clearcoat sheen, suspension pitch/roll, real mass-weighted collision knockback impulse & spin recovery, and seamless momentum transfer on car takeover.
- **Zero Invisible Walls — Unified Perimeter & Physical 3D Roadblocks (`src/core/world/worldBounds.ts`, `src/render/RegionWorldScene.ts`, `src/ui/MinimapRenderer.ts`):** Canonical `PlayableWorldBounds` shared identically by player, NPC traffic, pedestrians, and minimap; physical red/white Istanbul municipal concrete jersey barricades + cones + pulsing amber hazard beacons (`2` draw calls total) with exact `BuildingSpatialGrid` polygon colliders at every perimeter exit road, while 100% of NPC cars & pedestrians stay strictly inside bounds.
- **Modernized Visuals & Articulated Character Animations (`src/render/characterMesh.ts`, `src/render/RegionWorldScene.ts`, `src/render/proceduralTextures.ts`):** Vice-inspired GPU `ShaderMaterial` atmospheric sky dome + solar/lunar scattering + twinkling night starfield `Points`; articulated multi-joint protagonist (`thigh`/`shin` knee bend, `upperArm`/`forearm` elbow curl + steering grip, bomber jacket, aviator shades — batched into `10` draw calls); striding instanced pedestrians (`4` draw calls for up to 56 walkers); smoked-glass apartment balconies and crisp glowing `KAFE`/`FIRIN`/`MARKET` neon shopfronts.




