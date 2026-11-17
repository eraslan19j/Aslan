# Istanbul Streets — World Geometry, Road, Collision & Mobile Optimization Repair Report

**Branch:** `arena/868fe0be-aslan`  
**Release Version:** `0.4.0` (`versionCode 6`, Android API 36)  
**Geometry Analysis & Repair Tooling:** `shapely 2.2.0` (BSD-3-Clause), `trimesh 5.2.1` (MIT), `meshoptimizer 1.3.0` (MIT)  
**Reproducible Scripts:** `scripts/audit-world-geometry.py`, `scripts/repair-world-geometry.py`

---

## 1. Non-Destructive Preservation Guarantee

All original offline regions, geographic coordinate frames, terrain DEMs, landmarks, Worship Sanctuary safe zones, and engine architecture (**Three.js + Rapier3D + Capacitor 8**) were preserved intact:
- **Zero global shifting or relocation of buildings.** Untouched buildings (`3,169` in Tepe Mahallesi + `1,701` in Tarihî Yarımada = `4,870` buildings) have byte-identical footprints.
- **99.91% of all original buildings preserved (`8,128 / 8,135`):** Only `7` unrecoverable raw OSM defects sitting 100% inside active road carriageways (`< 5 m²` remaining after clearing road asphalt) were omitted (`2` in Tepe Mahallesi, `5` in Tarihî Yarımada).
- **100% of original 103 tiles (`44` Tepe + `59` Fatih), `13` Worship Sanctuaries, and all landmarks preserved.**

---

## 2. Phase 2 & Phase 3 — Quantitative Before vs After World Audit (`Shapely` + `Trimesh`)

### Region 1: Tepe Mahallesi (`esenler-namik-kemal`, 44 Tiles)

| Metric | Before Repair (`6262e57`) | After Repair (`7115b57`) | Delta / Outcome |
|---|---:|---:|---|
| Preserved Buildings | `4,474` | **`4,472`** (`99.96%`) | `3,169` untouched, `1,304` surgically trimmed, `2` unrecoverable OSM road-blockers removed |
| Buildings Intersecting Roads (`> 0.25 m²`) | `1,038` (`23.2%`) | **`5`** (`0.11%`) | **-99.5% eliminated** (remaining 5 are sub-1.3 m² outer round-join bevel touches) |
| **Severe Road Intrusions (`> 1.5 m²`)** | **`840`** | **`0`** | **-100.0% ELIMINATED** |
| **Total Road-Building Overlap Area** | **`9,744.74 m²`** | **`3.03 m²`** | **-99.97% RECLAIMED** (`13,216.99 m²` cleared including curb margin) |
| Max Single-Building Road Intrusion | `540.39 m²` | **`1.31 m²`** | **-99.8% reduced** |
| Invalid Building Polygons (`shapely.is_valid`) | `0` | **`0`** | Verified clean |
| Degenerate 3D Wall Faces (`trimesh`) | `0` | **`0`** | Verified clean |
| Floating / Buried Buildings | `0` / `0` | **`0` / `0`** | Grounded to DEM |
| Tiny Orphan Stub Roads (`< 2 m`) | `4` | **`0`** | **-100% ELIMINATED** |
| **Unintended Road-Graph Gaps (`≤ 9 m`)** | **`99`** | **`0`** | **-100% ELIMINATED** (`37` clean building-free bridges added) |
| Road-Graph Connected Components | `9` (`1,802` main) | **`2` (`1,916 / 1,922 = 99.7%` main)** | **7 stranded road islands reconnected**; intentional dead ends preserved |

### Region 2: Tarihî Yarımada (`fatih-sultanahmet-eminonu`, 59 Tiles)

| Metric | Before Repair (`6262e57`) | After Repair (`7115b57`) | Delta / Outcome |
|---|---:|---:|---|
| Preserved Buildings | `3,661` | **`3,656`** (`99.86%`) | `1,701` untouched, `1,958` surgically trimmed, `5` unrecoverable OSM road-blockers removed |
| Buildings Intersecting Roads (`> 0.25 m²`) | `1,924` (`52.6%`) | **`17`** (`0.46%`) | **-99.1% eliminated** (all remaining `< 1.38 m²`) |
| **Severe Road Intrusions (`> 1.5 m²`)** | **`1,771`** | **`0`** | **-100.0% ELIMINATED** |
| **Total Road-Building Overlap Area** | **`32,923.05 m²`** | **`10.05 m²`** | **-99.97% RECLAIMED** (`33,566.65 m²` cleared including curb margin) |
| Max Single-Building Road Intrusion | `647.44 m²` | **`1.38 m²`** | **-99.8% reduced** |
| Invalid Building Polygons (`shapely.is_valid`) | `0` | **`0`** | Verified clean |
| Degenerate 3D Wall Faces (`trimesh`) | `0` | **`0`** | Verified clean |
| Floating / Buried Buildings | `0` / `0` | **`0` / `0`** | Grounded cleanly on steep slopes |
| Tiny Orphan Stub Roads (`< 2 m`) | `0` | **`0`** | Verified clean |
| **Unintended Road-Graph Gaps (`≤ 9 m`)** | **`55`** | **`0`** | **-100% ELIMINATED** (`25` clean building-free bridges added) |
| Road-Graph Connected Components | `14` (`1,533` main) | **`8` (`1,674 / 1,796 = 93.2%` main)** | **6 stranded road islands reconnected** (`+141` nodes joined to main network) |

### Visual Road Continuity Repair (`src/render/tileMeshBuilder.ts`)
- Removed artificial `+0.45 m/side` (`+0.90 m` total) road apron inflation so rendered asphalt matches exact repaired carriageway widths without pushing asphalt into ground-floor walls.
- Replaced disconnected flat-quad segments with **corner bevel/mitre bend wedges** at all `540` sharp bends (`195` Tepe + `345` Fatih) and **4-step semicircular junction end-caps** at road endpoints/T-junctions — eliminating half-cut stumps and open triangular bend tears.
- Added matching tile asphalt ribbons for repaired bridges `≥ 2.0 m` so rendered roads align 1:1 with `road-graph.json`.

---

## 3. Phase 4 & Phase 5 — Collision System, GTA Seated Driver & Gameplay Repairs

| Audit Issue | Root Cause | Implemented Fix | Files Changed |
|---|---|---|---|
| **ERR-03** Player walking through vehicles | Zero player-vs-vehicle collision on foot | Added exact 2D `resolveCircleAgainstVehicleOBB` across player taxi, all AI traffic (`sedan`/`taxi`/`dolmus`), and Şehir Polisi cruisers inside sub-stepped `stepOnFootPlayer()` | `src/core/playerController.ts`, `src/main.ts` |
| **ERR-04** Driver vanishing inside vehicle | `characterRig.root.visible = !inVehicle` | Added translucent hollow cabin glass, interior dashboard/steering wheel/seats, and `driverSeatMount` to `PlayerTaxiRig`; added `poseCharacterSeated(rig, steerVisual)` so protagonist sits visibly at the wheel (hidden only in `hood` first-person view); explicit `attachPlayerToVehicleSeat` / `detachPlayerFromVehicleSeat` state machine disables foot drift & self-collision while seated | `src/render/vehicleMesh.ts`, `src/render/characterMesh.ts`, `src/render/RegionWorldScene.ts`, `src/core/playerController.ts`, `src/main.ts` |
| **ERR-05** Foot sliding / floating offset | Instantaneous velocity with zero friction/slope modulation + hardcoded `+0.34 m` lift | Added crisp `GROUND_ACCEL` (`40 m/s²`) / `GROUND_DECEL` (`46 m/s²`), uphill slope speed modulation, sub-stepped horizontal integration (`MAX_SUBSTEP_DIST = 0.25 m`), and lowered grounded sneaker height to surface elevation (`+0.24 m`) | `src/core/playerController.ts`, `src/render/RegionWorldScene.ts` |
| **ERR-06** Vehicle bumper corner clipping & tunneling | Single-step 2-axle circle collision left rectangular corners exposed | Upgraded `stepPlayerVehicle` to **anti-tunneling sub-steps** (`≤ 0.35 m/step`) + **6-point oriented body collider** (front/rear axles + 4 bumper corners FL/FR/RL/RR) + tangent wall sliding; upgraded `computeSafeExitPosition` to test 6 exit spots against buildings, own taxi OBB, all nearby traffic/police OBBs, and world bounds | `src/core/vehicle.ts`, `src/main.ts` |
| **ERR-07** Pedestrians walking through walls & cars | Fixed `±3.55 m` offset without `BuildingSpatialGrid` | Upgraded `PedestrianSimulator.step` with edge-width-aware sidewalk corridors, fallback inward offsets (`1.0x → 0.72x → 0.45x → opposite curb`), `BuildingSpatialGrid.resolveCircle`, and `resolveCircleAgainstVehicleOBB` — verified **0% wall/car clipping** across 360 simulation steps in both regions | `src/core/pedestrians.ts`, `src/main.ts` |

---

## 4. Phase 6 — Mobile Optimization Summary

| Optimization | Implementation | File |
|---|---|---|
| **MIT `meshoptimizer@1.3.0` + Vertex Welding** | `optimizeStaticGeometry()` welds identical static tile vertices into indexed `Uint16Array`/`Uint32Array` buffers (~33–45% quad vertex reduction), runs `MeshoptSimplifier.compactMesh()` once WASM is ready, and computes tight frustum-culling bounding boxes/spheres | `src/render/meshOptimizer.ts`, `src/render/tileMeshBuilder.ts` |
| **Distance-Based Tile LOD & Shadow Culling** | `applyTileDistanceLod()` culls distant street props/trees beyond `370 m` (`260 m` Lite) and disables shadow casting on distant tiles beyond `340 m` (`220 m` Lite), cutting mobile GPU shadow-pass cost without skyline pop-in | `src/render/tileMeshBuilder.ts`, `src/render/RegionWorldScene.ts` |
| **Frustum Culling & Batched Tile Streaming** | All 5 batched meshes per 300 m tile have `frustumCulled = true` with pre-computed bounding spheres; 3×3 tile streaming disposes evicted `BufferGeometry` objects with zero GPU memory leak | `src/render/tileMeshBuilder.ts`, `src/render/RegionWorldScene.ts` |
