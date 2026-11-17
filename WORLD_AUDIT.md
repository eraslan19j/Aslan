# WORLD_AUDIT.md — Phase 1 Complete Repository & World Geometry Audit

**Date:** 2026-11-17  
**Branch:** `arena/868fe0be-aslan`  
**Baseline Commit:** `e2d116c` (`v0.3.0`)  
**Audit Tooling:** Python `shapely 2.2.0` (BSD-3-Clause), `trimesh 5.2.1` (MIT), `numpy 2.4.6`, Node `22.22.3`, Vitest `5.1.0`, TypeScript `5.9.3`

---

## 1. Engine, Runtime & Repository Architecture

| Component | Exact Implementation & Version | Location |
|---|---|---|
| **3D Render Engine** | Three.js `0.187.0` (WebGL2, batched BufferGeometry + InstancedMesh) | `src/render/` |
| **Physics & Collision** | `@dimforge/rapier3d-compat` `0.21.0` (WASM) + pure-TS exact 2D polygon `BuildingSpatialGrid` | `src/core/physics.ts`, `src/core/world/collision.ts` |
| **Mobile Wrapper** | Capacitor `8.6.2` (`@capacitor/core`, `@capacitor/android`, `app`, `haptics`, `preferences`), Android 16 / API 36 (`minSdk 24`, `sensorLandscape`) | `android/`, `capacitor.config.ts` |
| **Bundler & Language** | Vite `7.3.8`, TypeScript `5.9.3` (strict), ESLint `10.15.0` (enforcing zero Three.js inside `src/core/`) | `package.json`, `eslint.config.js` |
| **Main World Scene** | `RegionWorldScene` (300m tile streaming, sky dome, procedural textures, instanced traffic/peds/police, 4 cameras) | `src/render/RegionWorldScene.ts` |
| **Tile Mesh Builder** | Static batched geometry per 300m tile (`upperBuilding`, `groundRoof`, `roads`, `areas`, `props`) | `src/render/tileMeshBuilder.ts` |
| **Offline World Data** | JSON 300m tiled packs (`manifest.json`, `terrain.json` decimeter DEM, `road-graph.json`, `tiles/t_X_Z.json`) derived from OSM/İBB + Copernicus DEM GLO-30 | `public/derived-data/esenler-namik-kemal/` (44 tiles, 1.9 MB), `public/derived-data/fatih-sultanahmet-eminonu/` (59 tiles, 1.7 MB) |
| **Character Controller** | On-foot camera-relative walk/sprint loop + articulated 7-draw-call `CharacterRig` | `src/main.ts`, `src/render/characterMesh.ts` |
| **Vehicle Controller** | Pure-TS kinematic/dynamic arcade-sim car physics + 11-draw-call `PlayerTaxiRig` | `src/core/vehicle.ts`, `src/render/vehicleMesh.ts` |
| **AI Traffic & Pedestrians** | Graph-based AI traffic (`RoadTrafficSimulator`), sidewalk walkers (`PedestrianSimulator`), Taxi fares (`TaxiMissionManager`), Wanted 1–5★ (`WantedSystem`) | `src/core/{traffic,pedestrians,missions,wanted}.ts` |
| **CI & QA Pipeline** | Unit tests (Vitest), Headless Chromium Smoke, 14-shot Visual QA, 3-min Soak, Android x86_64 KVM Emulator QA, API 36 APK build | `.github/workflows/{ci,android,android-qa}.yml` |

### Baseline Build Record (Pre-Modification)
- `npm run typecheck`: **PASS** (0 errors)
- `npm run lint`: **PASS** (0 errors; `.venv/**` added to ESLint ignores)
- `npm test`: **PASS** (9 test files, 38/38 tests passed)
- `npm run build`: **PASS** (`dist/assets/index-*.js` 141.56 kB / 47.80 kB gzip; `three` 537.65 kB; `rapier` 4,334.40 kB)
- Latest CI (`e2d116c`): **14/14 screenshots**, **0 console errors**, **0 HUD warnings**, `69–103` draw calls, `167,001–175,055` triangles (Normal Tepe), Debug APK `6.87 MB` (`7,199,798 B`).

---

## 2. Automated World Geometry & Topology Audit (`Shapely 2.2.0` + `Trimesh 5.2.1`)

Executed via `scripts/audit-world-geometry.py` (read-only) over **103 tiles**, **8,135 buildings**, **2,017 tile road polylines**, and **3,718 road-graph nodes**:

| Metric | Tepe Mahallesi (`esenler-namik-kemal`) | Tarihî Yarımada (`fatih-sultanahmet-eminonu`) | Status |
|---|---|---|---|
| Tiles | 44 | 59 | OK |
| Total Buildings | 4,474 | 3,661 | OK |
| Duplicate Building IDs Across Tiles | 0 | 0 | OK |
| Invalid Building Polygons (`shapely.is_valid`) | 0 | 0 | OK |
| Zero-Area Buildings (`< 0.5 m²`) | 0 | 0 | OK |
| Degenerate Building 3D Wall Faces (`trimesh`) | 0 | 0 | OK |
| Floating Buildings (`baseY > maxTerrain + 0.8 m`) | 0 | 0 | OK |
| Buried Buildings | 0 | 0 | OK |
| **Buildings Intersecting Road Carriageways (`> 0.25 m²`)** | **1,038 (23.2%)** | **1,924 (52.6%)** | **CRITICAL** |
| **Severe Road Intrusions (`> 1.5 m²`)** | **840** | **1,771** | **CRITICAL** |
| **Total Building-on-Road Overlap Area** | **9,744.74 m²** (max 540.39 m²) | **32,923.05 m²** (max 647.44 m²) | **CRITICAL** |
| **Unjoined Sharp Road Bends (`dot < 0.7`, open pie-gaps)** | **195** | **345** | **CRITICAL** |
| **Tiny Broken Stub Roads (`< 2.0 m`)** | **4** | **0** | **ERROR** |
| **Road Graph Connected Components (Islands)** | **9** (1,802 / 1,922 in main) | **14** (1,533 / 1,796 in main) | **CRITICAL** |
| **Unintended Disconnected Road Gaps (`0.05..9.0 m`)** | **99** | **55** | **CRITICAL** |
| **Sidewalk Midpoints (`±3.55 m`) Inside Buildings** | **391 / 4,328 (9.0%)** | **695 / 3,034 (22.9%)** | **CRITICAL** |

---

## 3. Root-Cause Catalogue of Every Identified Gameplay, Physics & Visual Defect

| # | Defect Reported / Found | Exact Root Cause in Code / Data | Planned Repair Phase |
|---|---|---|---|
| **ERR-01** | **Buildings protrude onto roads** (`1,038` in Tepe, `1,924` in Fatih) | (a) Raw OSM footprints overhang road corridors by 0.5–8 m (and large courtyards/arcades cross minor alleys); (b) default road widths + `tileMeshBuilder.ts` extra `+0.45 m/side` apron widen narrow streets into facades. | **Phase 2** (`shapely` surgical `difference()` clipping of ONLY overhanging slivers + narrow-corridor width clamping; preserves geographic coords/scale/elevation/IDs) |
| **ERR-02** | **Half-cut, broken & torn roads at bends/intersections** (`540` sharp bends, `154` gaps, `23` graph islands, `4` tiny stubs) | (a) `tileMeshBuilder.ts` builds each road segment as an unjoined flat quad with NO mitre/bevel corner wedges and NO rounded junction end-caps, leaving pie-slice tears and abrupt stumps; (b) `road-graph.json` has `99 + 55` small unintended endpoint gaps (`≤ 9 m`) fracturing 120 + 263 nodes into disconnected islands. | **Phase 3** (Road topology gap snapper preserving intentional dead ends + `tileMeshBuilder.ts` continuous corner-joined road ribbons with junction caps & clean stub removal) |
| **ERR-03** | **Character walks straight through vehicles** | `src/main.ts` on-foot movement only calls `spatialGrid.resolveCircle()` against buildings; ZERO collision check exists against `playerVehicle`, AI traffic cars, or police cruisers. | **Phase 4** (Pure-TS oriented-box `resolveCircleAgainstVehicleOBB` applied to player vs parked taxi, all AI traffic cars, and police units) |
| **ERR-04** | **Character vanishes upon entering vehicle** | `src/render/RegionWorldScene.ts:1032` sets `this.characterRig.root.visible = !inVehicle`, hiding the protagonist instead of seating them inside the driver's cabin. | **Phase 4** (GTA Vice City-style visible driver seat attachment inside taxi cabin behind translucent tinted windshield, seated limb pose, hands on steering wheel, zero self-collision) |
| **ERR-05** | **Character slides / floats on non-road ground** | `src/main.ts` snaps horizontal velocity instantaneously with zero grounded acceleration/friction or uphill slope modulation, and `RegionWorldScene.ts` applies a fixed `+0.34 m` height offset even off-road. | **Phase 4** (`src/core/playerController.ts`: GTA/OpenCity-style grounded capsule controller with smooth accel/decel friction, slope speed scaling, sub-stepped wall slide, and accurate surface elevation detection) |
| **ERR-06** | **Vehicle corners can clip buildings / tunnel at high speed** | `src/core/vehicle.ts` checks 2 axle circles (`r = 0.88 m`) in a single step per tick, which leaves rectangular bumper corners under-protected on acute wall corners and risks tunneling on large `dt`. | **Phase 4** (Sub-stepped 6-point oriented body collider — front/rear axles + 4 bumper corners — with tangent wall-slide and full safe-exit check against buildings + traffic + terrain bounds) |
| **ERR-07** | **Pedestrians walk through building walls** (`9.0%` Tepe, `22.9%` Fatih) | `src/core/pedestrians.ts` offsets walkers to a fixed `±3.55 m` from road centerline without ever querying `BuildingSpatialGrid` or checking corridor clearance. | **Phase 5** (Nav-corridor clearance + dynamic `BuildingSpatialGrid` & vehicle OBB avoidance so pedestrians steer smoothly around walls, corners, and cars) |
| **ERR-08** | **Mobile triangle load & FPS headroom (`170K–175K` tris in Normal)** | Distant tiles (`> 180 m`) still render full street props (trees/lamps) and high-detail unindexed triangle soup with zero distance-based LOD or vertex indexing. | **Phase 6** (Distance-based tile LOD, `meshoptimizer` MIT integration + indexed/deduplicated static batching, frustum culling, aggressive distant prop culling) |

---

## 4. Open-Source Reference & Tooling Hygiene

- **`shapely 2.2.0` (BSD-3-Clause):** Installed in local `.venv` for exact planar polygon/road intersection & topological repair.
- **`trimesh 5.2.1` (MIT):** Installed in local `.venv` for 3D building mesh & degenerate triangle validation.
- **`meshoptimizer 1.3.0` (MIT):** Eligible npm package for Phase 6 mesh optimization & vertex cache efficiency.
- **`webgl-games/opencity` (MIT):** Inspected for clean third-person grounded acceleration/deceleration and vehicle state transition patterns (no engine switch; stays 100% Three.js + Rapier3D + Capacitor 8).
- **`mrxenginner/reVC`:** Referenced strictly for GTA Vice City player-experience design principles (visible seated driver, crisp enter/exit, solid world/vehicle collisions); zero code or proprietary assets copied.
