import * as THREE from 'three';
import { sampleTerrainElevation } from '../core/world/terrain';
import type {
  BuildingPalette,
  RegionTileData,
  RoadClass,
  TerrainGrid,
} from '../core/world/types';

export interface BuiltTileGroup {
  key: string;
  group: THREE.Group;
  buildingCount: number;
  geometries: THREE.BufferGeometry[];
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

const ROAD_LIFT: Record<RoadClass, number> = {
  tram: 0.48,
  primary: 0.42,
  secondary: 0.38,
  tertiary: 0.34,
  residential: 0.3,
  service: 0.26,
  pedestrian: 0.23,
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
  geo.computeBoundingSphere();
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
  }

  return {
    upperGeo: finalizeGeometry(uPos, uNor, uUv, uCol),
    groundRoofGeo: finalizeGeometry(gPos, gNor, gUv, gCol),
  };
}

function buildBatchedRoadsGeometry(
  tile: RegionTileData,
  terrain: TerrainGrid,
): THREE.BufferGeometry | null {
  if (tile.roads.length === 0) return null;

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];

  const appendRoadCap = (
    cx: number,
    cz: number,
    dirX: number,
    dirZ: number,
    halfW: number,
    yLift: number,
    uMid: number,
    vCoord: number,
    r: number,
    g: number,
    b: number,
  ): void => {
    // 4-step semicircular end-cap so intersections & tile transitions never show sharp half-cut stumps
    const cy = sampleTerrainElevation(terrain, cx, cz) + yLift;
    const baseAngle = Math.atan2(dirZ, dirX);
    const steps = 4;
    for (let s = 0; s < steps; s += 1) {
      const a0 = baseAngle - Math.PI * 0.5 + (s / steps) * Math.PI;
      const a1 = baseAngle - Math.PI * 0.5 + ((s + 1) / steps) * Math.PI;
      const x0 = cx + Math.cos(a0) * halfW;
      const z0 = cz + Math.sin(a0) * halfW;
      const x1 = cx + Math.cos(a1) * halfW;
      const z1 = cz + Math.sin(a1) * halfW;
      const y0 = sampleTerrainElevation(terrain, x0, z0) + yLift;
      const y1 = sampleTerrainElevation(terrain, x1, z1) + yLift;
      // Upward (+Y) CCW winding in XZ (screen-right X, screen-down Z)
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

  for (const road of tile.roads) {
    const ptCount = Math.floor(road.points.length / 2);
    if (ptCount < 2) continue;

    // Exact repaired road width (zero artificial apron bloat into building facades!)
    const halfW = Math.max(1.4, road.width * 0.5);
    const yLift = ROAD_LIFT[road.roadClass] ?? 0.26;
    const [r, g, b] = ROAD_RGB[road.roadClass] ?? ROAD_RGB.residential;
    const hasCenterLine =
      road.roadClass === 'primary' ||
      road.roadClass === 'secondary' ||
      road.roadClass === 'tertiary' ||
      road.roadClass === 'residential';
    const uLeft = hasCenterLine ? 0.0 : 0.14;
    const uRight = hasCenterLine ? 1.0 : 0.46;
    const uAsphalt = 0.25;

    let distSoFar = 0;
    let prevEndLeftX = 0;
    let prevEndLeftZ = 0;
    let prevEndRightX = 0;
    let prevEndRightZ = 0;
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

      // Start rounded junction cap on the very first segment
      if (!hasPrevSeg) {
        appendRoadCap(sx0, sz0, -dirX, -dirZ, halfW, yLift, uAsphalt, 0, r, g, b);
      } else {
        // Fill corner bend wedge seamlessly between previous segment end and current segment start
        const jcY = sampleTerrainElevation(terrain, sx0, sz0) + yLift;
        const curStartLeftX = sx0 - px;
        const curStartLeftZ = sz0 - pz;
        const curStartRightX = sx0 + px;
        const curStartRightZ = sz0 + pz;
        const vJoin = distSoFar / 8.0;

        // Left outer bevel wedge (only if edges separated at bend)
        if (Math.hypot(curStartLeftX - prevEndLeftX, curStartLeftZ - prevEndLeftZ) > 0.08) {
          const yPrevL = sampleTerrainElevation(terrain, prevEndLeftX, prevEndLeftZ) + yLift;
          const yCurL = sampleTerrainElevation(terrain, curStartLeftX, curStartLeftZ) + yLift;
          // Ensure upward normal regardless of turn sign
          const crossL =
            (prevEndLeftX - sx0) * (curStartLeftZ - sz0) -
            (prevEndLeftZ - sz0) * (curStartLeftX - sx0);
          if (crossL < 0) {
            pushTri(
              pos, nor, uv, col,
              sx0, jcY, sz0,
              prevEndLeftX, yPrevL, prevEndLeftZ,
              curStartLeftX, yCurL, curStartLeftZ,
              0, 1, 0,
              uAsphalt, vJoin, uLeft, vJoin, uLeft, vJoin,
              r, g, b,
            );
          } else {
            pushTri(
              pos, nor, uv, col,
              sx0, jcY, sz0,
              curStartLeftX, yCurL, curStartLeftZ,
              prevEndLeftX, yPrevL, prevEndLeftZ,
              0, 1, 0,
              uAsphalt, vJoin, uLeft, vJoin, uLeft, vJoin,
              r, g, b,
            );
          }
        }
        // Right outer bevel wedge
        if (Math.hypot(curStartRightX - prevEndRightX, curStartRightZ - prevEndRightZ) > 0.08) {
          const yPrevR = sampleTerrainElevation(terrain, prevEndRightX, prevEndRightZ) + yLift;
          const yCurR = sampleTerrainElevation(terrain, curStartRightX, curStartRightZ) + yLift;
          const crossR =
            (prevEndRightX - sx0) * (curStartRightZ - sz0) -
            (prevEndRightZ - sz0) * (curStartRightX - sx0);
          if (crossR < 0) {
            pushTri(
              pos, nor, uv, col,
              sx0, jcY, sz0,
              prevEndRightX, yPrevR, prevEndRightZ,
              curStartRightX, yCurR, curStartRightZ,
              0, 1, 0,
              uAsphalt, vJoin, uRight, vJoin, uRight, vJoin,
              r, g, b,
            );
          } else {
            pushTri(
              pos, nor, uv, col,
              sx0, jcY, sz0,
              curStartRightX, yCurR, curStartRightZ,
              prevEndRightX, yPrevR, prevEndRightZ,
              0, 1, 0,
              uAsphalt, vJoin, uRight, vJoin, uRight, vJoin,
              r, g, b,
            );
          }
        }
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

        // Upward (+Y) CCW winding: (a, b, c) and (a, c, d) with continuous world-meter V UVs
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
      hasPrevSeg = true;

      // End rounded junction cap on the final segment
      if (i === ptCount - 1) {
        appendRoadCap(sx1, sz1, dirX, dirZ, halfW, yLift, uAsphalt, distSoFar / 8.0, r, g, b);
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
    // Tapered 6-sided Mediterranean bark trunk
    appendTaperedPrism(
      pos, nor, uv, col,
      tx, baseY, tz,
      0.22 * scale, 0.14 * scale, 2.35 * scale, 6,
      0.38, 0.27, 0.19,
      false, false,
    );
    // 3-tier rounded faceted Mediterranean plane-tree crown (100% outward-wound!)
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

  const appendStreetLamp = (lx: number, lz: number, dirX: number, dirZ: number): void => {
    const baseY = sampleTerrainElevation(terrain, lx, lz) + 0.2;
    // Galvanized dark steel post
    appendBoxProp(pos, nor, uv, col, lx, baseY, lz, 0.09, 5.6, 0.09, 0.24, 0.27, 0.31);
    // Horizontal bracket reaching toward road
    const armX = lx + dirX * 0.65;
    const armZ = lz + dirZ * 0.65;
    appendBoxProp(pos, nor, uv, col, armX, baseY + 5.45, armZ, 0.55, 0.1, 0.55, 0.26, 0.29, 0.34);
    // Warm lantern head
    const headX = lx + dirX * 1.05;
    const headZ = lz + dirZ * 1.05;
    appendBoxProp(pos, nor, uv, col, headX, baseY + 5.26, headZ, 0.24, 0.16, 0.24, 1.0, 0.89, 0.62);
  };

  // 1. Place park trees inside OSM parks (capped cleanly per tile)
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
    if (isClearOfBuildings(tile, cx, cz, 2.2)) {
      appendTree(cx, cz, h);
      treeCount += 1;
    }
    // Add 1–2 extra trees partway toward vertices for larger parks
    for (let i = 0; i < n && treeCount < 32; i += Math.max(2, Math.floor(n / 3))) {
      const px = cx * 0.55 + area.ring[i * 2]! * 0.45;
      const pz = cz * 0.55 + area.ring[i * 2 + 1]! * 0.45;
      if (Math.hypot(px - cx, pz - cz) > 6 && isClearOfBuildings(tile, px, pz, 2.2)) {
        appendTree(px, pz, h + i * 17);
        treeCount += 1;
      }
    }
  }

  // 2. Place street lamps & occasional boulevard trees along main roads (always clear of buildings & driving lanes)
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
    const halfW = road.width * 0.5 + 0.35;
    let sideToggle = hashString(road.id) % 2 === 0 ? 1 : -1;

    for (let i = 1; i < ptCount && lampCount < 22; i += 1) {
      const x0 = road.points[(i - 1) * 2]!;
      const z0 = road.points[(i - 1) * 2 + 1]!;
      const x1 = road.points[i * 2]!;
      const z1 = road.points[i * 2 + 1]!;
      const dx = x1 - x0;
      const dz = z1 - z0;
      const len = Math.hypot(dx, dz);
      if (len < 2) continue;

      const nx = -dz / len;
      const nz = dx / len;
      let cursor = spacing - accDist;
      while (cursor <= len && lampCount < 22) {
        const t = cursor / len;
        const rx = x0 + dx * t;
        const rz = z0 + dz * t;
        const lx = rx + nx * halfW * sideToggle;
        const lz = rz + nz * halfW * sideToggle;

        if (isClearOfBuildings(tile, lx, lz, 0.85)) {
          appendStreetLamp(lx, lz, -nx * sideToggle, -nz * sideToggle);
          lampCount += 1;
          // Occasional curbside tree opposite the lamp when sidewalk space allows
          if (lampCount % 2 === 0 && treeCount < 42) {
            const tx = rx - nx * (halfW + 0.9) * sideToggle;
            const tz = rz - nz * (halfW + 0.9) * sideToggle;
            if (isClearOfBuildings(tile, tx, tz, 1.8)) {
              appendTree(tx, tz, hashString(road.id) + lampCount * 31);
              treeCount += 1;
            }
          }
        }
        sideToggle *= -1;
        cursor += spacing;
      }
      accDist = (accDist + len) % spacing;
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
): BuiltTileGroup {
  const group = new THREE.Group();
  group.name = `tile:${tile.key}`;
  const geometries: THREE.BufferGeometry[] = [];

  const { upperGeo, groundRoofGeo } = buildBatchedBuildingsGeometries(tile);
  if (upperGeo) {
    geometries.push(upperGeo);
    const mesh = new THREE.Mesh(upperGeo, materials.upperBuildingMat);
    mesh.castShadow = shadowsEnabled;
    mesh.receiveShadow = shadowsEnabled;
    group.add(mesh);
  }
  if (groundRoofGeo) {
    geometries.push(groundRoofGeo);
    const mesh = new THREE.Mesh(groundRoofGeo, materials.groundRoofMat);
    mesh.castShadow = shadowsEnabled;
    mesh.receiveShadow = shadowsEnabled;
    group.add(mesh);
  }

  const rGeo = buildBatchedRoadsGeometry(tile, terrain);
  if (rGeo) {
    geometries.push(rGeo);
    const mesh = new THREE.Mesh(rGeo, materials.roadMat);
    mesh.receiveShadow = shadowsEnabled;
    group.add(mesh);
  }

  const aGeo = buildBatchedAreasGeometry(tile, terrain);
  if (aGeo) {
    geometries.push(aGeo);
    const mesh = new THREE.Mesh(aGeo, materials.areaMat);
    mesh.receiveShadow = shadowsEnabled;
    group.add(mesh);
  }

  if (includeProps) {
    const pGeo = buildBatchedStreetPropsGeometry(tile, terrain);
    if (pGeo) {
      geometries.push(pGeo);
      const mesh = new THREE.Mesh(pGeo, materials.propsMat);
      mesh.castShadow = false;
      mesh.receiveShadow = shadowsEnabled;
      group.add(mesh);
    }
  }

  return {
    key: tile.key,
    group,
    buildingCount: tile.buildings.length,
    geometries,
  };
}
