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

const PALETTE_HEX: Record<BuildingPalette, number> = {
  limestone: 0xebe0ce,
  terracotta: 0xd48e6f,
  ottoman_wood: 0xc9a378,
  commercial: 0xd8d2c7,
  civic: 0xe3dfd7,
  landmark: 0xf1e8d8,
};

const ROOF_HEX: Record<BuildingPalette, number> = {
  limestone: 0xb0664d,
  terracotta: 0x9e543e,
  ottoman_wood: 0x87543d,
  commercial: 0x858991,
  civic: 0x89929c,
  landmark: 0x7d8a96,
};

const ROAD_RGB: Record<RoadClass, [number, number, number]> = {
  primary: [0.17, 0.18, 0.21],
  secondary: [0.21, 0.22, 0.25],
  tertiary: [0.25, 0.26, 0.29],
  residential: [0.29, 0.3, 0.33],
  service: [0.36, 0.36, 0.38],
  pedestrian: [0.58, 0.55, 0.49],
  tram: [0.78, 0.22, 0.18],
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

function buildBatchedBuildingsGeometry(tile: RegionTileData): THREE.BufferGeometry | null {
  if (tile.buildings.length === 0) return null;

  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const wallColor = new THREE.Color();
  const roofColor = new THREE.Color();

  for (const b of tile.buildings) {
    let n = Math.floor(b.ring.length / 2);
    // Strip duplicate closing vertex if present
    if (
      n > 3 &&
      Math.abs(b.ring[0]! - b.ring[(n - 1) * 2]!) < 0.05 &&
      Math.abs(b.ring[1]! - b.ring[(n - 1) * 2 + 1]!) < 0.05
    ) {
      n -= 1;
    }
    if (n < 3) continue;

    wallColor.setHex(PALETTE_HEX[b.palette] ?? PALETTE_HEX.limestone);
    roofColor.setHex(ROOF_HEX[b.palette] ?? ROOF_HEX.limestone);

    // 5.5m foundation skirt ensures zero floating corners on steep Esenler/Fatih slopes
    const y0 = b.baseY - 5.5;
    const y1 = b.baseY + b.height;
    const area = signedAreaXZ(b.ring.slice(0, n * 2));
    if (Math.abs(area) < 0.5) continue;
    const reverse = area < 0;

    const ptsX: number[] = [];
    const ptsZ: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const idx = reverse ? n - 1 - i : i;
      ptsX.push(b.ring[idx * 2]!);
      ptsZ.push(b.ring[idx * 2 + 1]!);
    }

    // Side walls (verified outward right-handed winding matching (nx, 0, nz))
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
      const shade = 0.86 + 0.14 * Math.max(0, nx * 0.6 - nz * 0.8);
      const r = wallColor.r * shade;
      const g = wallColor.g * shade;
      const bl = wallColor.b * shade;

      const uSpan = Math.max(1, len / 4.5);
      const vSpan = Math.max(1, (b.height + 5.5) / 3.4);

      // Outward CCW winding: (p0_bot, p1_top, p1_bot) and (p0_bot, p0_top, p1_top)
      pushTri(
        pos, nor, uv, col,
        x0, y0, z0,
        x1, y1, z1,
        x1, y0, z1,
        nx, 0, nz,
        0, 0, uSpan, vSpan, uSpan, 0,
        r, g, bl,
      );
      pushTri(
        pos, nor, uv, col,
        x0, y0, z0,
        x0, y1, z0,
        x1, y1, z1,
        nx, 0, nz,
        0, 0, 0, vSpan, uSpan, vSpan,
        r, g, bl,
      );
    }

    // Roof polygon via ShapeUtils earcut triangulation (upward +Y winding)
    const contour: THREE.Vector2[] = [];
    for (let i = 0; i < n; i += 1) {
      contour.push(new THREE.Vector2(ptsX[i]!, ptsZ[i]!));
    }
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const tri of tris) {
      const i0 = tri[0]!;
      const i1 = tri[1]!;
      const i2 = tri[2]!;
      pushTri(
        pos, nor, uv, col,
        ptsX[i0]!, y1, ptsZ[i0]!,
        ptsX[i2]!, y1, ptsZ[i2]!,
        ptsX[i1]!, y1, ptsZ[i1]!,
        0, 1, 0,
        0.02, 0.02, 0.02, 0.02, 0.02, 0.02,
        roofColor.r, roofColor.g, roofColor.b,
      );
    }
  }

  if (pos.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
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

  for (const road of tile.roads) {
    const ptCount = Math.floor(road.points.length / 2);
    if (ptCount < 2) continue;

    const halfW = road.width * 0.5;
    const yLift = ROAD_LIFT[road.roadClass] ?? 0.24;
    const [r, g, b] = ROAD_RGB[road.roadClass] ?? ROAD_RGB.residential;

    for (let i = 1; i < ptCount; i += 1) {
      const sx0 = road.points[(i - 1) * 2]!;
      const sz0 = road.points[(i - 1) * 2 + 1]!;
      const sx1 = road.points[i * 2]!;
      const sz1 = road.points[i * 2 + 1]!;
      const totalDx = sx1 - sx0;
      const totalDz = sz1 - sz0;
      const totalLen = Math.hypot(totalDx, totalDz);
      if (totalLen < 0.4) continue;

      const px = (-totalDz / totalLen) * halfW;
      const pz = (totalDx / totalLen) * halfW;
      // Subdivide segments >10m so roads hug curved Esenler hillsides without terrain clipping
      const steps = Math.max(1, Math.min(8, Math.ceil(totalLen / 10)));

      for (let s = 0; s < steps; s += 1) {
        const t0 = s / steps;
        const t1 = (s + 1) / steps;
        const x0 = sx0 + totalDx * t0;
        const z0 = sz0 + totalDz * t0;
        const x1 = sx0 + totalDx * t1;
        const z1 = sz0 + totalDz * t1;

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

        // Outward upward (+Y) CCW winding: (a, b, c) and (a, c, d)
        pushTri(
          pos, nor, uv, col,
          ax, ya, az,
          bx, yb, bz,
          cx, yc, cz,
          0, 1, 0,
          0, 0, 1, 0, 1, 1,
          r, g, b,
        );
        pushTri(
          pos, nor, uv, col,
          ax, ya, az,
          cx, yc, cz,
          dxp, yd, dzp,
          0, 1, 0,
          0, 0, 1, 1, 0, 1,
          r, g, b,
        );
      }
    }
  }

  if (pos.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  return geo;
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
        ? [0.27, 0.53, 0.29]
        : area.kind === 'water'
          ? [0.14, 0.36, 0.54]
          : [0.68, 0.65, 0.59];
    const yLift = area.kind === 'water' ? 0.15 : 0.18;

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
        0, 0, 1, 0, 0, 1,
        r, g, b,
      );
    }
  }

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
 * Compiles one 300m x 300m offline tile into at most 3 draw calls (buildings, roads/tram, parks).
 */
export function buildTileMeshes(
  tile: RegionTileData,
  terrain: TerrainGrid,
  materials: {
    buildingMat: THREE.Material;
    roadMat: THREE.Material;
    areaMat: THREE.Material;
  },
  shadowsEnabled: boolean,
): BuiltTileGroup {
  const group = new THREE.Group();
  group.name = `tile:${tile.key}`;
  const geometries: THREE.BufferGeometry[] = [];

  const bGeo = buildBatchedBuildingsGeometry(tile);
  if (bGeo) {
    geometries.push(bGeo);
    const mesh = new THREE.Mesh(bGeo, materials.buildingMat);
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

  return {
    key: tile.key,
    group,
    buildingCount: tile.buildings.length,
    geometries,
  };
}
