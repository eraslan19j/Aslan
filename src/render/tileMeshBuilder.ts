import * as THREE from 'three';
import { sampleTerrainElevation } from '../core/world/terrain';
import type {
  BuildingPalette,
  RegionTileData,
  RoadClass,
  TerrainGrid,
} from '../core/world/types';
import { optimizeStaticGeometry } from './meshOptimizer';

export interface BuiltTileGroup {
  key: string;
  group: THREE.Group;
  centerX: number;
  centerZ: number;
  buildingCount: number;
  geometries: THREE.BufferGeometry[];
  propsMesh: THREE.Mesh | null;
  shadowCasterMeshes: THREE.Mesh[];
}

export interface TileMaterialBundle {
  upperBuildingMat: THREE.Material;
  groundRoofMat: THREE.Material;
  roadMat: THREE.Material;
  areaMat: THREE.Material;
  propsMat: THREE.Material;
}

// Sunlit, varied Istanbul residential & historic neighborhood wall palettes
const PALETTE_VARIANTS: Record<BuildingPalette, readonly number[]> = {
  limestone: [0xf2e8d8, 0xebdec9, 0xe4d7c3, 0xf4eee4],
  terracotta: [0xde9e7e, 0xd48e6f, 0xe4b08e, 0xcf8468],
  ottoman_wood: [0xd9b890, 0xcfa77d, 0xe2c8a4, 0xc79a72],
  commercial: [0xe3ded5, 0xd6dce2, 0xeae2d2, 0xd9d4ca],
  civic: [0xeae6de, 0xdce2e8, 0xe5dfd4, 0xded9cf],
  landmark: [0xf5ecdc, 0xeee2cc, 0xf2e8d6, 0xeadbc2],
};

const ROOF_HEX: Record<BuildingPalette, number> = {
  limestone: 0xb96c50,
  terracotta: 0xa65a42,
  ottoman_wood: 0x945d44,
  commercial: 0x8e9299,
  civic: 0x929aa4,
  landmark: 0x83909c,
};

// Multiplied against createAsphaltRoadTexture() (which already holds charcoal asphalt + curbs + white dashes)
const ROAD_RGB: Record<RoadClass, [number, number, number]> = {
  primary: [0.46, 0.48, 0.52],
  secondary: [0.51, 0.53, 0.57],
  tertiary: [0.56, 0.58, 0.61],
  residential: [0.6, 0.61, 0.64],
  service: [0.67, 0.66, 0.64],
  pedestrian: [0.88, 0.84, 0.77],
  tram: [0.85, 0.36, 0.32],
};

// Unified road deck lifts: ALL drivable asphalt sits cleanly ABOVE the 0.24m concrete curb bed
// so curbs NEVER slice across T-junctions or cross-street entrances!
const CURB_DECK_LIFT = 0.24;
const ROAD_LIFT: Record<RoadClass, number> = {
  tram: 0.38,
  primary: 0.34,
  secondary: 0.33,
  tertiary: 0.32,
  residential: 0.31,
  service: 0.3,
  pedestrian: 0.285,
};

function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pushTri(
  pos: number[],
  nor: number[],
  uv: number[],
  col: number[],
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  nx: number,
  ny: number,
  nz: number,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  u2: number,
  v2: number,
  r: number,
  g: number,
  b: number,
): void {
  pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  uv.push(u0, v0, u1, v1, u2, v2);
  col.push(r, g, b, r, g, b, r, g, b);
}

function pushQuadWall(
  pos: number[],
  nor: number[],
  uv: number[],
  col: number[],
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yBot: number,
  yTop: number,
  nx: number,
  nz: number,
  u0: number,
  u1: number,
  vBot: number,
  vTop: number,
  r: number,
  g: number,
  b: number,
): void {
  pushTri(
    pos, nor, uv, col,
    x0, yBot, z0,
    x1, yTop, z1,
    x1, yBot, z1,
    nx, 0, nz,
    u0, vBot, u1, vTop, u1, vBot,
    r, g, b,
  );
  pushTri(
    pos, nor, uv, col,
    x0, yBot, z0,
    x0, yTop, z0,
    x1, yTop, z1,
    nx, 0, nz,
    u0, vBot, u0, vTop, u1, vTop,
    r, g, b,
  );
}

/** Signed area of 2D ring in XZ plane to guarantee consistent outward-facing wall normals. */
function signedAreaXZ(ring: readonly number[]): number {
  let area = 0;
  const n = Math.floor(ring.length / 2);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    area += ring[i * 2]! * ring[j * 2 + 1]! - ring[j * 2]! * ring[i * 2 + 1]!;
  }
  return area * 0.5;
}

function finalizeGeometry(
  pos: number[],
  nor: number[],
  uv: number[],
  col: number[],
): THREE.BufferGeometry | null {
  if (pos.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  optimizeStaticGeometry(geo);
  return geo;
}

/**
 * Compiles all tile buildings into two crisp architectural meshes:
 * 1. Upper apartment walls (balconies, PVC windows, curtains, stucco repeating vertically)
 * 2. Ground-floor Istanbul shopfronts (striped awnings, stone plinths) + textured roofs & parapets
 */
function buildBatchedBuildingsGeometries(tile: RegionTileData): {
  upperGeo: THREE.BufferGeometry | null;
  groundRoofGeo: THREE.BufferGeometry | null;
} {
  if (tile.buildings.length === 0) return { upperGeo: null, groundRoofGeo: null };

  const uPos: number[] = [];
  const uNor: number[] = [];
  const uUv: number[] = [];
  const uCol: number[] = [];

  const gPos: number[] = [];
  const gNor: number[] = [];
  const gUv: number[] = [];
  const gCol: number[] = [];

  const wallColor = new THREE.Color();
  const roofColor = new THREE.Color();

  for (const b of tile.buildings) {
    let n = Math.floor(b.ring.length / 2);
    if (
      n > 3 &&
      Math.abs(b.ring[0]! - b.ring[(n - 1) * 2]!) < 0.05 &&
      Math.abs(b.ring[1]! - b.ring[(n - 1) * 2 + 1]!) < 0.05
    ) {
      n -= 1;
    }
    if (n < 3) continue;

    const area = signedAreaXZ(b.ring.slice(0, n * 2));
    if (Math.abs(area) < 0.5) continue;
    const reverse = area < 0;

    const hash = hashString(b.id);
    const variants = PALETTE_VARIANTS[b.palette] ?? PALETTE_VARIANTS.limestone;
    wallColor.setHex(variants[hash % variants.length]!);
    // Subtle organic hue/brightness jitter per apartment block
    const tintMul = 0.94 + ((hash >>> 8) % 13) * 0.01;
    wallColor.multiplyScalar(tintMul);
    roofColor.setHex(ROOF_HEX[b.palette] ?? ROOF_HEX.limestone);

    const ptsX: number[] = [];
    const ptsZ: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const idx = reverse ? n - 1 - i : i;
      ptsX.push(b.ring[idx * 2]!);
      ptsZ.push(b.ring[idx * 2 + 1]!);
    }

    const ySkirt = b.baseY - 5.5;
    const yGroundBase = b.baseY - 0.15;
    const groundHeight = Math.min(3.75, Math.max(2.6, b.height * 0.42));
    const yGroundTop = Math.min(b.baseY + b.height, b.baseY + groundHeight);
    const yRoof = b.baseY + b.height;
    const parapetH = b.height > 5.0 ? 0.45 : 0.25;
    const yParapet = yRoof + parapetH;
    const uSeed = ((hash >>> 16) % 4) * 0.25;

    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const x0 = ptsX[i]!;
      const z0 = ptsZ[i]!;
      const x1 = ptsX[j]!;
      const z1 = ptsZ[j]!;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 0.2) continue;

      const nx = dz / len;
      const nz = -dx / len;
      const shade = 0.84 + 0.16 * Math.max(0, nx * 0.62 - nz * 0.78);
      const wr = wallColor.r * shade;
      const wg = wallColor.g * shade;
      const wb = wallColor.b * shade;

      // Ground-floor stone skirt for sloped hillsides (mapped cleanly to stone plinth band v = 0.01..0.08)
      const gU0 = uSeed;
      const gU1 = uSeed + Math.max(0.5, len / 10.5);
      pushQuadWall(
        gPos, gNor, gUv, gCol,
        x0, z0, x1, z1,
        ySkirt, yGroundBase,
        nx, nz,
        gU0, gU1, 0.01, 0.08,
        0.72 * shade, 0.71 * shade, 0.69 * shade,
      );

      // Street-level Istanbul shopfront / residential lobby band (v = 0.06..0.67)
      pushQuadWall(
        gPos, gNor, gUv, gCol,
        x0, z0, x1, z1,
        yGroundBase, yGroundTop,
        nx, nz,
        gU0, gU1, 0.06, 0.67,
        Math.min(1, wr * 1.03),
        Math.min(1, wg * 1.03),
        Math.min(1, wb * 1.02),
      );

      // Upper repeating apartment stories with balconies & PVC windows
      const upperH = yRoof - yGroundTop;
      if (upperH > 0.4) {
        const uSpan = Math.max(0.75, len / 10.2);
        const vSpan = Math.max(0.5, upperH / 6.4);
        pushQuadWall(
          uPos, uNor, uUv, uCol,
          x0, z0, x1, z1,
          yGroundTop, yRoof,
          nx, nz,
          uSeed, uSeed + uSpan, 0, vSpan,
          wr, wg, wb,
        );
      }

      // Crisp architectural roof parapet trim band (mapped to stone/roof band v = 0.74..0.82)
      pushQuadWall(
        gPos, gNor, gUv, gCol,
        x0, z0, x1, z1,
        yRoof, yParapet,
        nx, nz,
        0, Math.max(0.5, len / 6), 0.74, 0.82,
        wr * 0.9, wg * 0.89, wb * 0.87,
      );
    }

    // Textured roof slab (v = 0.74..0.98 in groundRoofMat)
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i < n; i += 1) {
      contour.push(new THREE.Vector2(ptsX[i]!, ptsZ[i]!));
    }
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const tri of tris) {
      const i0 = tri[0]!;
      const i1 = tri[1]!;
      const i2 = tri[2]!;
      const x0 = ptsX[i0]!;
      const z0 = ptsZ[i0]!;
      const x1 = ptsX[i2]!;
      const z1 = ptsZ[i2]!;
      const x2 = ptsX[i1]!;
      const z2 = ptsZ[i1]!;
      pushTri(
        gPos, gNor, gUv, gCol,
        x0, yParapet - 0.06, z0,
        x1, yParapet - 0.06, z1,
        x2, yParapet - 0.06, z2,
        0, 1, 0,
        (x0 % 8) / 8, 0.74 + Math.abs((z0 % 8) / 8) * 0.23,
        (x1 % 8) / 8, 0.74 + Math.abs((z1 % 8) / 8) * 0.23,
        (x2 % 8) / 8, 0.74 + Math.abs((z2 % 8) / 8) * 0.23,
        roofColor.r, roofColor.g, roofColor.b,
      );
    }

    // Architectural rooftop skyline detail (stair bulkheads, HVAC chillers, chimneys — 0 extra draw calls!)
    const bw = b.maxX - b.minX;
    const bd = b.maxZ - b.minZ;
    if (b.height >= 7.5 && bw >= 7.5 && bd >= 7.5 && (hash % 5) < 2) {
      const rcx = (b.minX + b.maxX) * 0.5;
      const rcz = (b.minZ + b.maxZ) * 0.5;
      const hx = Math.min(2.1, bw * 0.16);
      const hz = Math.min(1.8, bd * 0.16);
      const mh = 1.35 + (hash % 3) * 0.45;
      const rr = Math.min(1, wallColor.r * 0.88);
      const rg = Math.min(1, wallColor.g * 0.88);
      const rb = Math.min(1, wallColor.b * 0.86);
      // Rooftop mechanical/stair penthouse box mapped into stone roof UV band
      const rx0 = rcx - hx;
      const rx1 = rcx + hx;
      const rz0 = rcz - hz;
      const rz1 = rcz + hz;
      const ry0 = yParapet - 0.06;
      const ry1 = ry0 + mh;
      pushQuadWall(gPos, gNor, gUv, gCol, rx1, rz1, rx0, rz1, ry0, ry1, 0, 1, 0.05, 0.45, 0.75, 0.84, rr, rg, rb);
      pushQuadWall(gPos, gNor, gUv, gCol, rx0, rz0, rx1, rz0, ry0, ry1, 0, -1, 0.05, 0.45, 0.75, 0.84, rr * 0.84, rg * 0.84, rb * 0.84);
      pushQuadWall(gPos, gNor, gUv, gCol, rx1, rz0, rx1, rz1, ry0, ry1, 1, 0, 0.05, 0.45, 0.75, 0.84, rr * 0.94, rg * 0.94, rb * 0.94);
      pushQuadWall(gPos, gNor, gUv, gCol, rx0, rz1, rx0, rz0, ry0, ry1, -1, 0, 0.05, 0.45, 0.75, 0.84, rr * 0.8, rg * 0.8, rb * 0.8);
      pushTri(gPos, gNor, gUv, gCol, rx0, ry1, rz0, rx0, ry1, rz1, rx1, ry1, rz1, 0, 1, 0, 0.1, 0.76, 0.1, 0.94, 0.4, 0.94, roofColor.r * 0.92, roofColor.g * 0.92, roofColor.b * 0.92);
      pushTri(gPos, gNor, gUv, gCol, rx0, ry1, rz0, rx1, ry1, rz1, rx1, ry1, rz0, 0, 1, 0, 0.1, 0.76, 0.4, 0.94, 0.4, 0.76, roofColor.r * 0.92, roofColor.g * 0.92, roofColor.b * 0.92);
    }
  }

  return {
    upperGeo: finalizeGeometry(uPos, uNor, uUv, uCol),
    groundRoofGeo: finalizeGeometry(gPos, gNor, gUv, gCol),
  };
}

function buildBatchedRoadsGeometry(
  tile: RegionTileData,
  terrain: TerrainGrid,
  tileSize = 300,
): THREE.BufferGeometry | null {
  if (tile.roads.length === 0) return null;

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];

  const tileMinX = tile.tx * tileSize;
  const tileMaxX = (tile.tx + 1) * tileSize;
  const tileMinZ = tile.tz * tileSize;
  const tileMaxZ = (tile.tz + 1) * tileSize;
  const isNearTileBorder = (x: number, z: number): boolean =>
    Math.abs(x - tileMinX) < 2.2 ||
    Math.abs(x - tileMaxX) < 2.2 ||
    Math.abs(z - tileMinZ) < 2.2 ||
    Math.abs(z - tileMaxZ) < 2.2;

  // Build lightweight spatial endpoint/segment lookup to distinguish real T-junctions/crossroads from cul-de-sacs
  const roadSegments: { roadIdx: number; x0: number; z0: number; x1: number; z1: number; halfW: number }[] = [];
  for (let rIdx = 0; rIdx < tile.roads.length; rIdx += 1) {
    const road = tile.roads[rIdx]!;
    const ptCount = Math.floor(road.points.length / 2);
    const hw = Math.max(1.4, road.width * 0.5);
    for (let i = 1; i < ptCount; i += 1) {
      roadSegments.push({
        roadIdx: rIdx,
        x0: road.points[(i - 1) * 2]!,
        z0: road.points[(i - 1) * 2 + 1]!,
        x1: road.points[i * 2]!,
        z1: road.points[i * 2 + 1]!,
        halfW: hw,
      });
    }
  }

  const meetsAnotherRoad = (roadIdx: number, px: number, pz: number, ownHalfW: number): number => {
    let bestOtherHalfW = 0;
    for (const seg of roadSegments) {
      if (seg.roadIdx === roadIdx) continue;
      const sx = seg.x1 - seg.x0;
      const sz = seg.z1 - seg.z0;
      const lenSq = sx * sx + sz * sz;
      if (lenSq < 0.01) continue;
      const t = Math.max(0, Math.min(1, ((px - seg.x0) * sx + (pz - seg.z0) * sz) / lenSq));
      const cx = seg.x0 + sx * t;
      const cz = seg.z0 + sz * t;
      const d = Math.hypot(px - cx, pz - cz);
      if (d <= ownHalfW + seg.halfW + 1.2) {
        bestOtherHalfW = Math.max(bestOtherHalfW, seg.halfW);
      }
    }
    return bestOtherHalfW;
  };

  const appendFanCap = (
    cx: number,
    cz: number,
    dirX: number,
    dirZ: number,
    radius: number,
    yLift: number,
    uMid: number,
    vCoord: number,
    r: number,
    g: number,
    b: number,
    fullCircle = false,
  ): void => {
    const cy = sampleTerrainElevation(terrain, cx, cz) + yLift;
    const baseAngle = Math.atan2(dirZ, dirX);
    const steps = fullCircle ? 10 : 5;
    const sweep = fullCircle ? Math.PI * 2 : Math.PI;
    const startAngle = fullCircle ? 0 : baseAngle - Math.PI * 0.5;
    for (let s = 0; s < steps; s += 1) {
      const a0 = startAngle + (s / steps) * sweep;
      const a1 = startAngle + ((s + 1) / steps) * sweep;
      const x0 = cx + Math.cos(a0) * radius;
      const z0 = cz + Math.sin(a0) * radius;
      const x1 = cx + Math.cos(a1) * radius;
      const z1 = cz + Math.sin(a1) * radius;
      const y0 = sampleTerrainElevation(terrain, x0, z0) + yLift;
      const y1 = sampleTerrainElevation(terrain, x1, z1) + yLift;
      pushTri(
        pos, nor, uv, col,
        cx, cy, cz,
        x1, y1, z1,
        x0, y0, z0,
        0, 1, 0,
        uMid, vCoord, uMid, vCoord, uMid, vCoord,
        r, g, b,
      );
    }
  };

  const appendBevelWedge = (
    cx: number,
    cz: number,
    p0x: number,
    p0z: number,
    p1x: number,
    p1z: number,
    yLift: number,
    uCenter: number,
    uEdge: number,
    vCoord: number,
    r: number,
    g: number,
    b: number,
  ): void => {
    if (Math.hypot(p1x - p0x, p1z - p0z) <= 0.08) return;
    const cy = sampleTerrainElevation(terrain, cx, cz) + yLift;
    const y0 = sampleTerrainElevation(terrain, p0x, p0z) + yLift;
    const y1 = sampleTerrainElevation(terrain, p1x, p1z) + yLift;
    const cross = (p0x - cx) * (p1z - cz) - (p0z - cz) * (p1x - cx);
    if (cross < 0) {
      pushTri(
        pos, nor, uv, col,
        cx, cy, cz,
        p0x, y0, p0z,
        p1x, y1, p1z,
        0, 1, 0,
        uCenter, vCoord, uEdge, vCoord, uEdge, vCoord,
        r, g, b,
      );
    } else {
      pushTri(
        pos, nor, uv, col,
        cx, cy, cz,
        p1x, y1, p1z,
        p0x, y0, p0z,
        0, 1, 0,
        uCenter, vCoord, uEdge, vCoord, uEdge, vCoord,
        r, g, b,
      );
    }
  };

  const appendZebraCrosswalk = (
    cx: number,
    cz: number,
    dirX: number,
    dirZ: number,
    halfW: number,
    yLift: number,
    r: number,
    g: number,
    b: number,
  ): void => {
    const px = -dirZ * (halfW - 0.12);
    const pz = dirX * (halfW - 0.12);
    const depth = 1.05; // 2.1m total crosswalk depth
    const x0 = cx - dirX * depth;
    const z0 = cz - dirZ * depth;
    const x1 = cx + dirX * depth;
    const z1 = cz + dirZ * depth;

    const ax = x0 - px;
    const az = z0 - pz;
    const bx = x0 + px;
    const bz = z0 + pz;
    const cxp = x1 + px;
    const czp = z1 + pz;
    const dxp = x1 - px;
    const dzp = z1 - pz;

    const ya = sampleTerrainElevation(terrain, ax, az) + yLift;
    const yb = sampleTerrainElevation(terrain, bx, bz) + yLift;
    const yc = sampleTerrainElevation(terrain, cxp, czp) + yLift;
    const yd = sampleTerrainElevation(terrain, dxp, dzp) + yLift;

    const vSpan = Math.max(1, Math.round((halfW * 2) / 1.4));
    // Map zebra bars across road width (V spans road width; U spans 0.87..0.99 crosswalk strip)
    pushTri(
      pos, nor, uv, col,
      ax, ya, az,
      bx, yb, bz,
      cxp, yc, czp,
      0, 1, 0,
      0.87, 0, 0.87, vSpan, 0.99, vSpan,
      r, g, b,
    );
    pushTri(
      pos, nor, uv, col,
      ax, ya, az,
      cxp, yc, czp,
      dxp, yd, dzp,
      0, 1, 0,
      0.87, 0, 0.99, vSpan, 0.99, 0,
      r, g, b,
    );
  };

  // Emit two strictly depth-separated layers per road (STILL 1 draw call!):
  // 1) Lower unified concrete sidewalk & curb bed (y = terrain + 0.24m, width = halfW + 0.78m)
  // 2) Higher seamless pure asphalt deck (y = terrain + 0.30..0.34m, width = halfW)
  // Because ALL asphalt sits above ALL curbs, concrete curbs NEVER cut across T-junctions or road ends!
  const CURB_RGB: [number, number, number] = [0.92, 0.91, 0.88];
  const U_CURB_INNER = 0.015;
  const U_CURB_OUTER = 0.125;
  const U_CURB_MID = 0.065;
  const U_ASPHALT_PURE = 0.28;

  for (let rIdx = 0; rIdx < tile.roads.length; rIdx += 1) {
    const road = tile.roads[rIdx]!;
    const ptCount = Math.floor(road.points.length / 2);
    if (ptCount < 2) continue;

    const halfW = Math.max(1.4, road.width * 0.5);
    const curbHalfW = halfW + (road.roadClass === 'tram' ? 0.15 : 0.78);
    const yLift = ROAD_LIFT[road.roadClass] ?? 0.31;
    const [r, g, b] = ROAD_RGB[road.roadClass] ?? ROAD_RGB.residential;
    const hasCenterLine =
      road.roadClass === 'primary' ||
      road.roadClass === 'secondary' ||
      road.roadClass === 'tertiary' ||
      road.roadClass === 'residential';
    // Pure asphalt UV range (ZERO curb stone baked into asphalt ribbon!)
    const uLeft = hasCenterLine ? 0.155 : 0.19;
    const uRight = hasCenterLine ? 0.845 : 0.44;

    const startX = road.points[0]!;
    const startZ = road.points[1]!;
    const endX = road.points[(ptCount - 1) * 2]!;
    const endZ = road.points[(ptCount - 1) * 2 + 1]!;
    const startAtBorder = isNearTileBorder(startX, startZ);
    const endAtBorder = isNearTileBorder(endX, endZ);
    const startOtherHW = startAtBorder ? 0 : meetsAnotherRoad(rIdx, startX, startZ, halfW);
    const endOtherHW = endAtBorder ? 0 : meetsAnotherRoad(rIdx, endX, endZ, halfW);

    let distSoFar = 0;
    let prevEndLeftX = 0;
    let prevEndLeftZ = 0;
    let prevEndRightX = 0;
    let prevEndRightZ = 0;
    let prevCurbLeftX = 0;
    let prevCurbLeftZ = 0;
    let prevCurbRightX = 0;
    let prevCurbRightZ = 0;
    let hasPrevSeg = false;

    for (let i = 1; i < ptCount; i += 1) {
      const sx0 = road.points[(i - 1) * 2]!;
      const sz0 = road.points[(i - 1) * 2 + 1]!;
      const sx1 = road.points[i * 2]!;
      const sz1 = road.points[i * 2 + 1]!;
      const totalDx = sx1 - sx0;
      const totalDz = sz1 - sz0;
      const totalLen = Math.hypot(totalDx, totalDz);
      if (totalLen < 0.35) continue;

      const dirX = totalDx / totalLen;
      const dirZ = totalDz / totalLen;
      const px = -dirZ * halfW;
      const pz = dirX * halfW;
      const cpx = -dirZ * curbHalfW;
      const cpz = dirX * curbHalfW;

      if (!hasPrevSeg) {
        if (!startAtBorder) {
          // Lower curb turnaround/junction flare
          appendFanCap(sx0, sz0, -dirX, -dirZ, curbHalfW, CURB_DECK_LIFT, U_CURB_MID, 0, CURB_RGB[0], CURB_RGB[1], CURB_RGB[2], startOtherHW > 0);
          // Higher pure asphalt hub (full circle at intersections so no stripes clash; semicircle at cul-de-sacs)
          const hubR = startOtherHW > 0 ? Math.max(halfW, startOtherHW) * 1.04 : halfW;
          appendFanCap(sx0, sz0, -dirX, -dirZ, hubR, yLift + (startOtherHW > 0 ? 0.008 : 0), U_ASPHALT_PURE, 0, r, g, b, startOtherHW > 0);
          // Turkish zebra crosswalk inset cleanly from T-junction / crossroad mouth
          if (hasCenterLine && startOtherHW > 0 && totalLen >= 13.5) {
            const cwDist = Math.min(totalLen * 0.35, Math.max(halfW, startOtherHW) + 2.1);
            appendZebraCrosswalk(sx0 + dirX * cwDist, sz0 + dirZ * cwDist, dirX, dirZ, halfW, yLift + 0.012, r * 1.04, g * 1.04, b * 1.04);
          }
        }
      } else {
        const vJoin = distSoFar / 8.0;
        // Seamless bend bevel wedges for BOTH lower curb bed and higher asphalt deck
        appendBevelWedge(sx0, sz0, prevCurbLeftX, prevCurbLeftZ, sx0 - cpx, sz0 - cpz, CURB_DECK_LIFT, U_CURB_MID, U_CURB_OUTER, vJoin, CURB_RGB[0], CURB_RGB[1], CURB_RGB[2]);
        appendBevelWedge(sx0, sz0, prevCurbRightX, prevCurbRightZ, sx0 + cpx, sz0 + cpz, CURB_DECK_LIFT, U_CURB_MID, U_CURB_OUTER, vJoin, CURB_RGB[0], CURB_RGB[1], CURB_RGB[2]);
        appendBevelWedge(sx0, sz0, prevEndLeftX, prevEndLeftZ, sx0 - px, sz0 - pz, yLift, U_ASPHALT_PURE, uLeft, vJoin, r, g, b);
        appendBevelWedge(sx0, sz0, prevEndRightX, prevEndRightZ, sx0 + px, sz0 + pz, yLift, U_ASPHALT_PURE, uRight, vJoin, r, g, b);
      }

      const steps = Math.max(1, Math.min(8, Math.ceil(totalLen / 10)));

      for (let s = 0; s < steps; s += 1) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const x0 = sx0 + totalDx * t0;
        const z0 = sz0 + totalDz * t0;
        const x1 = sx0 + totalDx * t1;
        const z1 = sz0 + totalDz * t1;

        const segLen = totalLen / steps;
        const v0 = distSoFar / 8.0;
        const v1 = (distSoFar + segLen) / 8.0;
        distSoFar += segLen;

        // LAYER 1: Lower continuous concrete sidewalk/curb apron (sits underneath ALL asphalt!)
        const cax = x0 - cpx;
        const caz = z0 - cpz;
        const cbx = x0 + cpx;
        const cbz = z0 + cpz;
        const ccx = x1 + cpx;
        const ccz = z1 + cpz;
        const cdx = x1 - cpx;
        const cdz = z1 - cpz;
        const cya = sampleTerrainElevation(terrain, cax, caz) + CURB_DECK_LIFT;
        const cyb = sampleTerrainElevation(terrain, cbx, cbz) + CURB_DECK_LIFT;
        const cyc = sampleTerrainElevation(terrain, ccx, ccz) + CURB_DECK_LIFT;
        const cyd = sampleTerrainElevation(terrain, cdx, cdz) + CURB_DECK_LIFT;

        pushTri(
          pos, nor, uv, col,
          cax, cya, caz,
          cbx, cyb, cbz,
          ccx, cyc, ccz,
          0, 1, 0,
          U_CURB_INNER, v0, U_CURB_OUTER, v0, U_CURB_OUTER, v1,
          CURB_RGB[0], CURB_RGB[1], CURB_RGB[2],
        );
        pushTri(
          pos, nor, uv, col,
          cax, cya, caz,
          ccx, cyc, ccz,
          cdx, cyd, cdz,
          0, 1, 0,
          U_CURB_INNER, v0, U_CURB_OUTER, v1, U_CURB_INNER, v1,
          CURB_RGB[0], CURB_RGB[1], CURB_RGB[2],
        );

        // LAYER 2: Pure dark drivable asphalt carriageway (ZERO concrete curbs inside!)
        const ax = x0 - px;
        const az = z0 - pz;
        const bx = x0 + px;
        const bz = z0 + pz;
        const cx = x1 + px;
        const cz = z1 + pz;
        const dxp = x1 - px;
        const dzp = z1 - pz;

        const ya = sampleTerrainElevation(terrain, ax, az) + yLift;
        const yb = sampleTerrainElevation(terrain, bx, bz) + yLift;
        const yc = sampleTerrainElevation(terrain, cx, cz) + yLift;
        const yd = sampleTerrainElevation(terrain, dxp, dzp) + yLift;

        pushTri(
          pos, nor, uv, col,
          ax, ya, az,
          bx, yb, bz,
          cx, yc, cz,
          0, 1, 0,
          uLeft, v0, uRight, v0, uRight, v1,
          r, g, b,
        );
        pushTri(
          pos, nor, uv, col,
          ax, ya, az,
          cx, yc, cz,
          dxp, yd, dzp,
          0, 1, 0,
          uLeft, v0, uRight, v1, uLeft, v1,
          r, g, b,
        );
      }

      prevEndLeftX = sx1 - px;
      prevEndLeftZ = sz1 - pz;
      prevEndRightX = sx1 + px;
      prevEndRightZ = sz1 + pz;
      prevCurbLeftX = sx1 - cpx;
      prevCurbLeftZ = sz1 - cpz;
      prevCurbRightX = sx1 + cpx;
      prevCurbRightZ = sz1 + cpz;
      hasPrevSeg = true;

      if (i === ptCount - 1 && !endAtBorder) {
        appendFanCap(sx1, sz1, dirX, dirZ, curbHalfW, CURB_DECK_LIFT, U_CURB_MID, distSoFar / 8.0, CURB_RGB[0], CURB_RGB[1], CURB_RGB[2], endOtherHW > 0);
        const hubR = endOtherHW > 0 ? Math.max(halfW, endOtherHW) * 1.04 : halfW;
        appendFanCap(sx1, sz1, dirX, dirZ, hubR, yLift + (endOtherHW > 0 ? 0.008 : 0), U_ASPHALT_PURE, distSoFar / 8.0, r, g, b, endOtherHW > 0);
        if (hasCenterLine && endOtherHW > 0 && totalLen >= 13.5) {
          const cwDist = Math.min(totalLen * 0.35, Math.max(halfW, endOtherHW) + 2.1);
          appendZebraCrosswalk(sx1 - dirX * cwDist, sz1 - dirZ * cwDist, dirX, dirZ, halfW, yLift + 0.012, r * 1.04, g * 1.04, b * 1.04);
        }
      }
    }
  }

  return finalizeGeometry(pos, nor, uv, col);
}

function buildBatchedAreasGeometry(
  tile: RegionTileData,
  terrain: TerrainGrid,
): THREE.BufferGeometry | null {
  if (tile.areas.length === 0) return null;

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];

  for (const area of tile.areas) {
    let n = Math.floor(area.ring.length / 2);
    if (
      n > 3 &&
      Math.abs(area.ring[0]! - area.ring[(n - 1) * 2]!) < 0.05 &&
      Math.abs(area.ring[1]! - area.ring[(n - 1) * 2 + 1]!) < 0.05
    ) {
      n -= 1;
    }
    if (n < 3) continue;

    const contour: THREE.Vector2[] = [];
    for (let i = 0; i < n; i += 1) {
      contour.push(new THREE.Vector2(area.ring[i * 2]!, area.ring[i * 2 + 1]!));
    }
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const [r, g, b] =
      area.kind === 'park'
        ? [0.32, 0.62, 0.34]
        : area.kind === 'water'
          ? [0.16, 0.42, 0.62]
          : [0.76, 0.73, 0.67];
    const yLift = area.kind === 'water' ? 0.16 : 0.2;

    for (const tri of tris) {
      const p0 = contour[tri[0]!]!;
      const p1 = contour[tri[1]!]!;
      const p2 = contour[tri[2]!]!;
      const y0 = sampleTerrainElevation(terrain, p0.x, p0.y) + yLift;
      const y1 = sampleTerrainElevation(terrain, p1.x, p1.y) + yLift;
      const y2 = sampleTerrainElevation(terrain, p2.x, p2.y) + yLift;

      pushTri(
        pos, nor, uv, col,
        p0.x, y0, p0.y,
        p2.x, y2, p2.y,
        p1.x, y1, p1.y,
        0, 1, 0,
        p0.x / 10, p0.y / 10, p2.x / 10, p2.y / 10, p1.x / 10, p1.y / 10,
        r, g, b,
      );
    }
  }

  return finalizeGeometry(pos, nor, uv, col);
}

/** Appends a closed outward-wound 6-sided box prism into batched prop geometry arrays. */
function appendBoxProp(
  pos: number[],
  nor: number[],
  uv: number[],
  col: number[],
  cx: number,
  yBot: number,
  cz: number,
  hx: number,
  h: number,
  hz: number,
  r: number,
  g: number,
  b: number,
): void {
  const yTop = yBot + h;
  const x0 = cx - hx;
  const x1 = cx + hx;
  const z0 = cz - hz;
  const z1 = cz + hz;

  // 4 outward-wound CCW vertical faces matching pushQuadWall normal (dz, 0, -dx)
  pushQuadWall(pos, nor, uv, col, x1, z1, x0, z1, yBot, yTop, 0, 1, 0, 1, 0, 1, r, g, b); // +Z
  pushQuadWall(pos, nor, uv, col, x0, z0, x1, z0, yBot, yTop, 0, -1, 0, 1, 0, 1, r * 0.84, g * 0.84, b * 0.84); // -Z
  pushQuadWall(pos, nor, uv, col, x1, z0, x1, z1, yBot, yTop, 1, 0, 0, 1, 0, 1, r * 0.94, g * 0.94, b * 0.94); // +X
  pushQuadWall(pos, nor, uv, col, x0, z1, x0, z0, yBot, yTop, -1, 0, 0, 1, 0, 1, r * 0.8, g * 0.8, b * 0.8); // -X

  // Top face (+Y)
  pushTri(
    pos, nor, uv, col,
    x0, yTop, z0,
    x0, yTop, z1,
    x1, yTop, z1,
    0, 1, 0,
    0, 0, 0, 1, 1, 1,
    Math.min(1, r * 1.08), Math.min(1, g * 1.08), Math.min(1, b * 1.08),
  );
  pushTri(
    pos, nor, uv, col,
    x0, yTop, z0,
    x1, yTop, z1,
    x1, yTop, z0,
    0, 1, 0,
    0, 0, 1, 1, 1, 0,
    Math.min(1, r * 1.08), Math.min(1, g * 1.08), Math.min(1, b * 1.08),
  );

  // Bottom face (-Y)
  pushTri(
    pos, nor, uv, col,
    x0, yBot, z0,
    x1, yBot, z0,
    x1, yBot, z1,
    0, -1, 0,
    0, 0, 1, 0, 1, 1,
    r * 0.72, g * 0.72, b * 0.72,
  );
  pushTri(
    pos, nor, uv, col,
    x0, yBot, z0,
    x1, yBot, z1,
    x0, yBot, z1,
    0, -1, 0,
    0, 0, 1, 1, 0, 1,
    r * 0.72, g * 0.72, b * 0.72,
  );
}

/** Appends a closed outward-wound N-sided tapered frustum (for organic tree trunks & canopies). */
function appendTaperedPrism(
  pos: number[],
  nor: number[],
  uv: number[],
  col: number[],
  cx: number,
  yBot: number,
  cz: number,
  rBot: number,
  rTop: number,
  h: number,
  sides: number,
  r: number,
  g: number,
  b: number,
  capTop: boolean,
  capBottom: boolean,
): void {
  const yTop = yBot + h;
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const c0 = Math.cos(a0);
    const s0 = Math.sin(a0);
    const c1 = Math.cos(a1);
    const s1 = Math.sin(a1);

    const bx0 = cx + c0 * rBot;
    const bz0 = cz + s0 * rBot;
    const bx1 = cx + c1 * rBot;
    const bz1 = cz + s1 * rBot;
    const tx0 = cx + c0 * rTop;
    const tz0 = cz + s0 * rTop;
    const tx1 = cx + c1 * rTop;
    const tz1 = cz + s1 * rTop;

    const midA = (a0 + a1) * 0.5;
    const nx = Math.cos(midA);
    const nz = Math.sin(midA);
    const shade = 0.8 + 0.22 * Math.max(0, nx * 0.6 + nz * 0.55);
    const cr = Math.min(1, r * shade);
    const cg = Math.min(1, g * shade);
    const cb = Math.min(1, b * shade);

    // Outward CCW side quad: (b0, t1, b1) and (b0, t0, t1)
    pushTri(pos, nor, uv, col, bx0, yBot, bz0, tx1, yTop, tz1, bx1, yBot, bz1, nx, 0.25, nz, 0, 0, 1, 1, 1, 0, cr, cg, cb);
    pushTri(pos, nor, uv, col, bx0, yBot, bz0, tx0, yTop, tz0, tx1, yTop, tz1, nx, 0.25, nz, 0, 0, 0, 1, 1, 1, cr, cg, cb);

    if (capTop && rTop > 0.01) {
      pushTri(
        pos, nor, uv, col,
        cx, yTop, cz,
        tx1, yTop, tz1,
        tx0, yTop, tz0,
        0, 1, 0,
        0.5, 0.5, 1, 0, 0, 0,
        Math.min(1, r * 1.12), Math.min(1, g * 1.12), Math.min(1, b * 1.12),
      );
    }
    if (capBottom && rBot > 0.01) {
      pushTri(
        pos, nor, uv, col,
        cx, yBot, cz,
        bx0, yBot, bz0,
        bx1, yBot, bz1,
        0, -1, 0,
        0.5, 0.5, 0, 0, 1, 0,
        r * 0.68, g * 0.68, b * 0.68,
      );
    }
  }
}

export interface PlannedStreetProp {
  kind: 'tree' | 'lamp' | 'bench' | 'trashBin' | 'sign' | 'shrub';
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  seed: number;
  isStop?: boolean;
}

interface TileRoadSegment {
  roadIdx: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  halfW: number;
}

function collectTileRoadSegments(tile: RegionTileData): TileRoadSegment[] {
  const segs: TileRoadSegment[] = [];
  for (let rIdx = 0; rIdx < tile.roads.length; rIdx += 1) {
    const road = tile.roads[rIdx]!;
    const ptCount = Math.floor(road.points.length / 2);
    const halfW = Math.max(1.5, road.width * 0.5);
    for (let i = 1; i < ptCount; i += 1) {
      segs.push({
        roadIdx: rIdx,
        x0: road.points[(i - 1) * 2]!,
        z0: road.points[(i - 1) * 2 + 1]!,
        x1: road.points[i * 2]!,
        z1: road.points[i * 2 + 1]!,
        halfW,
      });
    }
  }
  return segs;
}

function distToSegmentSq(
  px: number,
  pz: number,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
): number {
  const sx = x1 - x0;
  const sz = z1 - z0;
  const lenSq = sx * sx + sz * sz;
  if (lenSq < 1e-6) {
    return (px - x0) * (px - x0) + (pz - z0) * (pz - z0);
  }
  const t = Math.max(0, Math.min(1, ((px - x0) * sx + (pz - z0) * sz) / lenSq));
  const cx = x0 + sx * t;
  const cz = z0 + sz * t;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

/**
 * Checks whether (px, pz) stays strictly outside EVERY asphalt road lane and junction mouth
 * in this tile by at least `clearance` meters beyond each road's asphalt half-width.
 */
export function isPointClearOfTileRoads(
  tile: RegionTileData,
  px: number,
  pz: number,
  clearance: number,
  precomputedSegs?: readonly TileRoadSegment[],
): boolean {
  const segs = precomputedSegs ?? collectTileRoadSegments(tile);
  let closeRoadCount = 0;
  let firstCloseRoadIdx = -1;

  for (let i = 0; i < segs.length; i += 1) {
    const seg = segs[i]!;
    const minAllow = seg.halfW + clearance;
    const minX = Math.min(seg.x0, seg.x1) - minAllow - 2.4;
    const maxX = Math.max(seg.x0, seg.x1) + minAllow + 2.4;
    const minZ = Math.min(seg.z0, seg.z1) - minAllow - 2.4;
    const maxZ = Math.max(seg.z0, seg.z1) + minAllow + 2.4;
    if (px < minX || px > maxX || pz < minZ || pz > maxZ) continue;

    const dSq = distToSegmentSq(px, pz, seg.x0, seg.z0, seg.x1, seg.z1);
    if (dSq < minAllow * minAllow) {
      return false;
    }

    // Reject props squeezed tightly into multi-road intersection corners/mouths!
    const junctionMargin = seg.halfW + Math.max(clearance + 1.8, 2.8);
    if (dSq < junctionMargin * junctionMargin) {
      if (firstCloseRoadIdx === -1) {
        firstCloseRoadIdx = seg.roadIdx;
        closeRoadCount = 1;
      } else if (seg.roadIdx !== firstCloseRoadIdx) {
        closeRoadCount += 1;
        if (closeRoadCount >= 2) return false;
      }
    }
  }

  return true;
}

/** Checks if a point is clear of all building bounding boxes in this tile. */
function isClearOfBuildings(tile: RegionTileData, px: number, pz: number, margin: number): boolean {
  for (const b of tile.buildings) {
    if (
      px >= b.minX - margin &&
      px <= b.maxX + margin &&
      pz >= b.minZ - margin &&
      pz <= b.maxZ + margin
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Pure deterministic street-prop placement planner verifying EVERY tree, palm, cypress,
 * street lamp, traffic sign, bench, shrub & bin is strictly clear of:
 *   1. ALL road lanes & multi-road junction mouths in the tile
 *   2. ALL building footprints
 *   3. ALL previously placed props (zero overlapping trees/poles!)
 */
export function planTileStreetProps(tile: RegionTileData): PlannedStreetProp[] {
  const placed: PlannedStreetProp[] = [];
  const segs = collectTileRoadSegments(tile);

  const canPlace = (
    x: number,
    z: number,
    buildingMargin: number,
    roadClearance: number,
    propSpacing: number,
  ): boolean => {
    if (!isClearOfBuildings(tile, x, z, buildingMargin)) return false;
    if (!isPointClearOfTileRoads(tile, x, z, roadClearance, segs)) return false;
    const spSq = propSpacing * propSpacing;
    for (let i = 0; i < placed.length; i += 1) {
      const p = placed[i]!;
      const dx = p.x - x;
      const dz = p.z - z;
      if (dx * dx + dz * dz < spSq) return false;
    }
    return true;
  };

  // 1. Place park trees, benches & shrubs inside OSM parks (strictly clear of roads & buildings)
  let treeCount = 0;
  for (const area of tile.areas) {
    if (area.kind !== 'park' || treeCount >= 32) continue;
    const n = Math.floor(area.ring.length / 2);
    if (n < 3) continue;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < n; i += 1) {
      cx += area.ring[i * 2]!;
      cz += area.ring[i * 2 + 1]!;
    }
    cx /= n;
    cz /= n;
    const h = hashString(area.id);
    if (canPlace(cx, cz, 2.2, 2.4, 3.4)) {
      placed.push({ kind: 'tree', x: cx, z: cz, dirX: 0, dirZ: 1, seed: h });
      treeCount += 1;
      if (canPlace(cx + 2.6, cz, 1.1, 1.4, 1.8)) {
        placed.push({ kind: 'bench', x: cx + 2.6, z: cz, dirX: 0, dirZ: 1, seed: h });
      }
      if (canPlace(cx - 2.4, cz + 1.4, 1.0, 1.4, 1.6)) {
        placed.push({ kind: 'shrub', x: cx - 2.4, z: cz + 1.4, dirX: 0, dirZ: 1, seed: h });
      }
    }
    for (let i = 0; i < n && treeCount < 32; i += Math.max(2, Math.floor(n / 3))) {
      const px = cx * 0.55 + area.ring[i * 2]! * 0.45;
      const pz = cz * 0.55 + area.ring[i * 2 + 1]! * 0.45;
      if (Math.hypot(px - cx, pz - cz) > 6 && canPlace(px, pz, 2.2, 2.4, 3.8)) {
        placed.push({ kind: 'tree', x: px, z: pz, dirX: 0, dirZ: 1, seed: h + i * 17 });
        treeCount += 1;
      }
    }
  }

  // 2. Place street lamps, signs & boulevard trees along outer sidewalk edges only
  let lampCount = 0;
  for (const road of tile.roads) {
    if (
      road.roadClass !== 'primary' &&
      road.roadClass !== 'secondary' &&
      road.roadClass !== 'tertiary'
    ) {
      continue;
    }
    if (lampCount >= 22) break;
    const ptCount = Math.floor(road.points.length / 2);
    if (ptCount < 2) continue;

    let accDist = 14;
    const spacing = 36;
    const roadHalfW = Math.max(1.5, road.width * 0.5);
    const lampOffset = roadHalfW + 1.28;
    const treeOffset = roadHalfW + 2.55;
    let sideToggle = hashString(road.id) % 2 === 0 ? 1 : -1;

    // Traffic/crosswalk sign cleanly behind curb away from intersection mouth
    const sx0 = road.points[0]!;
    const sz0 = road.points[1]!;
    const sx1 = road.points[2]!;
    const sz1 = road.points[3]!;
    const sLen = Math.hypot(sx1 - sx0, sz1 - sz0);
    if (sLen > 12 && lampCount < 22) {
      const snx = -(sz1 - sz0) / sLen;
      const snz = (sx1 - sx0) / sLen;
      const signX = sx0 + ((sx1 - sx0) / sLen) * 6.5 + snx * lampOffset;
      const signZ = sz0 + ((sz1 - sz0) / sLen) * 6.5 + snz * lampOffset;
      if (canPlace(signX, signZ, 0.85, 1.15, 2.4)) {
        placed.push({
          kind: 'sign',
          x: signX,
          z: signZ,
          dirX: -snx,
          dirZ: -snz,
          seed: hashString(road.id),
          isStop: road.roadClass === 'primary' || hashString(road.id) % 2 === 0,
        });
      }
    }

    for (let i = 1; i < ptCount && lampCount < 22; i += 1) {
      const x0 = road.points[(i - 1) * 2]!;
      const z0 = road.points[(i - 1) * 2 + 1]!;
      const x1 = road.points[i * 2]!;
      const z1 = road.points[i * 2 + 1]!;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 3) continue;

      const nx = -dz / len;
      const nz = dx / len;
      let cursor = spacing - accDist;
      while (cursor <= len && lampCount < 22) {
        // Keep away from start/end vertices of short segments where intersections meet
        if (cursor > 4.0 && len - cursor > 4.0) {
          const t = cursor / len;
          const rx = x0 + dx * t;
          const rz = z0 + dz * t;
          const lx = rx + nx * lampOffset * sideToggle;
          const lz = rz + nz * lampOffset * sideToggle;

          if (canPlace(lx, lz, 0.9, 1.15, 4.5)) {
            placed.push({
              kind: 'lamp',
              x: lx,
              z: lz,
              dirX: -nx * sideToggle,
              dirZ: -nz * sideToggle,
              seed: hashString(road.id) + lampCount,
            });
            lampCount += 1;

            const oppTreeX = rx - nx * treeOffset * sideToggle;
            const oppTreeZ = rz - nz * treeOffset * sideToggle;
            const oppFurnX = rx - nx * (lampOffset + 0.35) * sideToggle;
            const oppFurnZ = rz - nz * (lampOffset + 0.35) * sideToggle;

            if (lampCount % 2 === 0 && treeCount < 42 && canPlace(oppTreeX, oppTreeZ, 1.95, 2.4, 3.8)) {
              placed.push({
                kind: 'tree',
                x: oppTreeX,
                z: oppTreeZ,
                dirX: 0,
                dirZ: 1,
                seed: hashString(road.id) + lampCount * 31,
              });
              treeCount += 1;
            } else if (lampCount % 3 === 1 && canPlace(oppFurnX, oppFurnZ, 1.0, 1.25, 2.5)) {
              placed.push({
                kind: 'bench',
                x: oppFurnX,
                z: oppFurnZ,
                dirX: nx * sideToggle,
                dirZ: nz * sideToggle,
                seed: hashString(road.id) + lampCount,
              });
            } else if (lampCount % 3 === 2 && canPlace(oppFurnX, oppFurnZ, 0.8, 1.18, 2.2)) {
              placed.push({
                kind: 'trashBin',
                x: oppFurnX,
                z: oppFurnZ,
                dirX: 0,
                dirZ: 1,
                seed: hashString(road.id) + lampCount,
              });
            }
          }
        }
        sideToggle *= -1;
        cursor += spacing;
      }
      accDist = (accDist + len) % spacing;
    }
  }

  return placed;
}

/**
 * Compiles batched Mediterranean park/street trees and galvanized Istanbul street lamps
 * into a single vertex-colored mesh per tile (only +1 draw call per tile!).
 */
function buildBatchedStreetPropsGeometry(
  tile: RegionTileData,
  terrain: TerrainGrid,
): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];

  const appendTree = (tx: number, tz: number, seed: number): void => {
    const baseY = sampleTerrainElevation(terrain, tx, tz) + 0.14;
    const scale = 0.86 + (seed % 5) * 0.08;
    const gShift = ((seed >>> 4) % 5) * 0.025;
    const species = seed % 3;

    if (species === 0) {
      // Mediterranean coastal palm (slender curved trunk + 6 lush drooping fronds -> Vice City coastal feel!)
      const leanX = (((seed >>> 2) % 7) - 3) * 0.07;
      const leanZ = (((seed >>> 6) % 7) - 3) * 0.07;
      let cx = tx;
      let cz = tz;
      let cy = baseY;
      const segH = 1.15 * scale;
      for (let s = 0; s < 4; s += 1) {
        appendTaperedPrism(
          pos, nor, uv, col,
          cx, cy, cz,
          (0.2 - s * 0.022) * scale,
          (0.18 - s * 0.02) * scale,
          segH, 6,
          0.46 - s * 0.02, 0.36 - s * 0.02, 0.25,
          false, false,
        );
        cx += leanX * (s + 1) * 0.35;
        cz += leanZ * (s + 1) * 0.35;
        cy += segH * 0.96;
      }
      // Crown coconut hub + 6 splayed palm fronds
      appendTaperedPrism(pos, nor, uv, col, cx, cy - 0.1, cz, 0.24 * scale, 0.32 * scale, 0.35 * scale, 6, 0.26, 0.48, 0.18, true, true);
      for (let f = 0; f < 6; f += 1) {
        const ang = (f / 6) * Math.PI * 2 + (seed % 11) * 0.2;
        const fx = Math.cos(ang);
        const fz = Math.sin(ang);
        const px = -fz * 0.32 * scale;
        const pz = fx * 0.32 * scale;
        const midX = cx + fx * 1.15 * scale;
        const midZ = cz + fz * 1.15 * scale;
        const tipX = cx + fx * 2.25 * scale;
        const tipZ = cz + fz * 2.25 * scale;
        const y0 = cy + 0.18 * scale;
        const yMid = cy + 0.56 * scale;
        const yTip = cy - 0.15 * scale;
        const fr = 0.21 + gShift * 0.4;
        const fg = 0.54 + gShift;
        const fb = 0.2;
        // Upper frond blade (2 double-sided triangles for crisp sun-caught silhouette)
        pushTri(pos, nor, uv, col, cx, y0, cz, midX + px, yMid, midZ + pz, midX - px, yMid, midZ - pz, 0, 1, 0, 0, 0, 1, 0.5, 0, 0.5, fr, fg, fb);
        pushTri(pos, nor, uv, col, midX - px, yMid, midZ - pz, midX + px, yMid, midZ + pz, tipX, yTip, tipZ, 0, 1, 0, 0, 0.5, 1, 0.5, 0.5, 1, fr * 0.9, fg * 0.95, fb * 0.9);
        // Underside shaded face
        pushTri(pos, nor, uv, col, cx, y0, cz, midX - px, yMid, midZ - pz, midX + px, yMid, midZ + pz, 0, -1, 0, 0, 0, 0, 0.5, 1, 0.5, fr * 0.65, fg * 0.72, fb * 0.65);
        pushTri(pos, nor, uv, col, midX + px, yMid, midZ + pz, midX - px, yMid, midZ - pz, tipX, yTip, tipZ, 0, -1, 0, 1, 0.5, 0, 0.5, 0.5, 1, fr * 0.62, fg * 0.7, fb * 0.62);
      }
      return;
    }

    if (species === 2) {
      // Classic tall columnar Istanbul cypress tree
      appendTaperedPrism(pos, nor, uv, col, tx, baseY, tz, 0.17 * scale, 0.12 * scale, 1.3 * scale, 6, 0.36, 0.26, 0.18, false, false);
      appendTaperedPrism(pos, nor, uv, col, tx, baseY + 1.1 * scale, tz, 0.55 * scale, 0.78 * scale, 1.5 * scale, 7, 0.13 + gShift * 0.3, 0.36 + gShift * 0.7, 0.17, false, true);
      appendTaperedPrism(pos, nor, uv, col, tx, baseY + 2.6 * scale, tz, 0.78 * scale, 0.52 * scale, 2.0 * scale, 7, 0.16 + gShift * 0.3, 0.42 + gShift * 0.7, 0.2, false, false);
      appendTaperedPrism(pos, nor, uv, col, tx, baseY + 4.6 * scale, tz, 0.52 * scale, 0.08 * scale, 1.35 * scale, 7, 0.19 + gShift * 0.3, 0.48 + gShift * 0.7, 0.22, true, false);
      return;
    }

    // Species 1: Broad 3-tier Mediterranean Istanbul plane tree (Çınar)
    appendTaperedPrism(
      pos, nor, uv, col,
      tx, baseY, tz,
      0.22 * scale, 0.14 * scale, 2.35 * scale, 6,
      0.38, 0.27, 0.19,
      false, false,
    );
    appendTaperedPrism(
      pos, nor, uv, col,
      tx, baseY + 2.05 * scale, tz,
      0.75 * scale, 1.55 * scale, 0.95 * scale, 8,
      0.19 + gShift * 0.4, 0.45 + gShift, 0.2,
      false, true,
    );
    appendTaperedPrism(
      pos, nor, uv, col,
      tx, baseY + 3.0 * scale, tz,
      1.55 * scale, 1.28 * scale, 1.1 * scale, 8,
      0.24 + gShift * 0.45, 0.54 + gShift, 0.23,
      false, false,
    );
    appendTaperedPrism(
      pos, nor, uv, col,
      tx, baseY + 4.1 * scale, tz,
      1.28 * scale, 0.38 * scale, 0.75 * scale, 8,
      0.31 + gShift * 0.5, 0.62 + gShift, 0.27,
      true, false,
    );
  };

  const appendBench = (bx: number, bz: number): void => {
    const baseY = sampleTerrainElevation(terrain, bx, bz) + 0.23;
    // Wrought-iron legs + warm cedar wood bench seat & backrest
    appendBoxProp(pos, nor, uv, col, bx - 0.65, baseY, bz, 0.07, 0.44, 0.26, 0.18, 0.2, 0.24);
    appendBoxProp(pos, nor, uv, col, bx + 0.65, baseY, bz, 0.07, 0.44, 0.26, 0.18, 0.2, 0.24);
    appendBoxProp(pos, nor, uv, col, bx, baseY + 0.42, bz, 0.78, 0.08, 0.28, 0.56, 0.35, 0.2);
    appendBoxProp(pos, nor, uv, col, bx, baseY + 0.66, bz - 0.22, 0.78, 0.26, 0.06, 0.52, 0.32, 0.18);
  };

  const appendTrashBin = (bx: number, bz: number): void => {
    const baseY = sampleTerrainElevation(terrain, bx, bz) + 0.23;
    appendBoxProp(pos, nor, uv, col, bx, baseY, bz, 0.06, 0.32, 0.06, 0.22, 0.25, 0.29);
    appendTaperedPrism(pos, nor, uv, col, bx, baseY + 0.26, bz, 0.19, 0.22, 0.62, 6, 0.16, 0.42, 0.34, true, true);
  };

  const appendTrafficSign = (sx: number, sz: number, isStop: boolean): void => {
    const baseY = sampleTerrainElevation(terrain, sx, sz) + 0.23;
    appendBoxProp(pos, nor, uv, col, sx, baseY, sz, 0.045, 2.55, 0.045, 0.66, 0.69, 0.72);
    if (isStop) {
      appendBoxProp(pos, nor, uv, col, sx, baseY + 2.38, sz, 0.34, 0.34, 0.05, 0.84, 0.16, 0.16);
    } else {
      appendBoxProp(pos, nor, uv, col, sx, baseY + 2.35, sz, 0.32, 0.38, 0.05, 0.14, 0.42, 0.82);
    }
  };

  const appendShrub = (sx: number, sz: number, seed: number): void => {
    const baseY = sampleTerrainElevation(terrain, sx, sz) + 0.18;
    const rad = 0.52 + (seed % 3) * 0.16;
    appendTaperedPrism(pos, nor, uv, col, sx, baseY, sz, rad * 0.78, rad, 0.36, 6, 0.18, 0.46, 0.2, false, true);
    appendTaperedPrism(pos, nor, uv, col, sx, baseY + 0.36, sz, rad, rad * 0.45, 0.32, 6, 0.26, 0.56, 0.24, true, false);
    if (seed % 2 === 0) {
      // Subtle Mediterranean bougainvillea blossom accent
      appendBoxProp(pos, nor, uv, col, sx + 0.12, baseY + 0.56, sz - 0.08, 0.14, 0.12, 0.14, 0.88, 0.24, 0.52);
    }
  };

  const appendStreetLamp = (lx: number, lz: number, dirX: number, dirZ: number): void => {
    const baseY = sampleTerrainElevation(terrain, lx, lz) + 0.22;
    // Modern anthracite tapered pedestal + galvanized steel mast
    appendTaperedPrism(pos, nor, uv, col, lx, baseY, lz, 0.14, 0.1, 0.65, 6, 0.18, 0.2, 0.24, false, true);
    appendTaperedPrism(pos, nor, uv, col, lx, baseY + 0.65, lz, 0.085, 0.055, 5.15, 6, 0.26, 0.3, 0.35, false, false);
    // Sleek angled gooseneck arm leaning gracefully over the curb
    const armX = lx + dirX * 0.52;
    const armZ = lz + dirZ * 0.52;
    appendBoxProp(pos, nor, uv, col, armX, baseY + 5.72, armZ, 0.48, 0.08, 0.48, 0.24, 0.28, 0.34);
    // Slim modern cobra-head LED housing + bright warm-white LED diffuser
    const headX = lx + dirX * 0.96;
    const headZ = lz + dirZ * 0.96;
    appendBoxProp(pos, nor, uv, col, headX, baseY + 5.72, headZ, 0.26, 0.09, 0.26, 0.19, 0.22, 0.27);
    appendBoxProp(pos, nor, uv, col, headX, baseY + 5.64, headZ, 0.22, 0.06, 0.22, 1.0, 0.93, 0.72);
  };

  const plannedProps = planTileStreetProps(tile);
  for (const prop of plannedProps) {
    if (prop.kind === 'tree') {
      appendTree(prop.x, prop.z, prop.seed);
    } else if (prop.kind === 'lamp') {
      appendStreetLamp(prop.x, prop.z, prop.dirX, prop.dirZ);
    } else if (prop.kind === 'bench') {
      appendBench(prop.x, prop.z);
    } else if (prop.kind === 'trashBin') {
      appendTrashBin(prop.x, prop.z);
    } else if (prop.kind === 'sign') {
      appendTrafficSign(prop.x, prop.z, Boolean(prop.isStop));
    } else if (prop.kind === 'shrub') {
      appendShrub(prop.x, prop.z, prop.seed);
    }
  }

  return finalizeGeometry(pos, nor, uv, col);
}

/**
 * Compiles one 300m x 300m offline tile into at most 5 draw calls:
 * upper buildings, ground shopfronts+roofs, textured asphalt roads, parks, and street props (trees+lamps).
 */
export function buildTileMeshes(
  tile: RegionTileData,
  terrain: TerrainGrid,
  materials: TileMaterialBundle,
  shadowsEnabled: boolean,
  includeProps = true,
  tileSize = 300,
): BuiltTileGroup {
  const group = new THREE.Group();
  group.name = `tile:${tile.key}`;
  const geometries: THREE.BufferGeometry[] = [];
  const shadowCasterMeshes: THREE.Mesh[] = [];
  let propsMesh: THREE.Mesh | null = null;

  const { upperGeo, groundRoofGeo } = buildBatchedBuildingsGeometries(tile);
  if (upperGeo) {
    geometries.push(upperGeo);
    const mesh = new THREE.Mesh(upperGeo, materials.upperBuildingMat);
    mesh.castShadow = shadowsEnabled;
    mesh.receiveShadow = shadowsEnabled;
    mesh.frustumCulled = true;
    shadowCasterMeshes.push(mesh);
    group.add(mesh);
  }
  if (groundRoofGeo) {
    geometries.push(groundRoofGeo);
    const mesh = new THREE.Mesh(groundRoofGeo, materials.groundRoofMat);
    mesh.castShadow = shadowsEnabled;
    mesh.receiveShadow = shadowsEnabled;
    mesh.frustumCulled = true;
    shadowCasterMeshes.push(mesh);
    group.add(mesh);
  }

  const rGeo = buildBatchedRoadsGeometry(tile, terrain, tileSize);
  if (rGeo) {
    geometries.push(rGeo);
    const mesh = new THREE.Mesh(rGeo, materials.roadMat);
    mesh.receiveShadow = shadowsEnabled;
    mesh.frustumCulled = true;
    group.add(mesh);
  }

  const aGeo = buildBatchedAreasGeometry(tile, terrain);
  if (aGeo) {
    geometries.push(aGeo);
    const mesh = new THREE.Mesh(aGeo, materials.areaMat);
    mesh.receiveShadow = shadowsEnabled;
    mesh.frustumCulled = true;
    group.add(mesh);
  }

  if (includeProps) {
    const pGeo = buildBatchedStreetPropsGeometry(tile, terrain);
    if (pGeo) {
      geometries.push(pGeo);
      const mesh = new THREE.Mesh(pGeo, materials.propsMat);
      mesh.castShadow = false;
      mesh.receiveShadow = shadowsEnabled;
      mesh.frustumCulled = true;
      propsMesh = mesh;
      group.add(mesh);
    }
  }

  return {
    key: tile.key,
    group,
    centerX: (tile.tx + 0.5) * tileSize,
    centerZ: (tile.tz + 0.5) * tileSize,
    buildingCount: tile.buildings.length,
    geometries,
    propsMesh,
    shadowCasterMeshes,
  };
}

/**
 * Distance-based tile LOD for mobile GPUs governed by the active 4-tier Android quality profile:
 * - LOD 0 (near): full street props (palms, trees, lamps, benches, signs) + building shadows
 * - LOD 1 (mid/far): culls distant street props & shadow casting while keeping skyline crisp
 */
export function applyTileDistanceLod(
  tile: BuiltTileGroup,
  focusX: number,
  focusZ: number,
  shadowsEnabled: boolean,
  propCutoff: number,
  shadowCutoff: number,
): void {
  const dist = Math.hypot(tile.centerX - focusX, tile.centerZ - focusZ);

  if (tile.propsMesh) {
    tile.propsMesh.visible = dist <= propCutoff;
  }
  const castHere = shadowsEnabled && shadowCutoff > 0 && dist <= shadowCutoff;
  for (const m of tile.shadowCasterMeshes) {
    m.castShadow = castHere;
  }
}
