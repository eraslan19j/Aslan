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

## 3. GitHub Actions CI, Visual QA, Android Emulator QA & API 36 APK

_Updated after remote CI workflows complete on the pushed commit._
