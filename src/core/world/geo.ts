export interface LonLat {
  lon: number;
  lat: number;
}

export interface LocalXZ {
  x: number;
  z: number;
}

export interface GeoBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

export interface TileCoord {
  tx: number;
  tz: number;
  key: string;
}

export const EARTH_RADIUS_METERS = 6_378_137;
export const TILE_SIZE_METERS = 300;

/**
 * Region v0.1: Fatih (Sultanahmet - Eminönü) ~2.17 km².
 * Origin sits near Sultanahmet / Divanyolu center.
 */
export const FATIH_REGION_ID = 'fatih-sultanahmet-eminonu';

export const FATIH_BOUNDS: GeoBounds = {
  south: 41.002,
  north: 41.0145,
  west: 28.966,
  east: 28.9845,
};

export const FATIH_ORIGIN: LonLat = {
  lon: (FATIH_BOUNDS.west + FATIH_BOUNDS.east) / 2,
  lat: (FATIH_BOUNDS.south + FATIH_BOUNDS.north) / 2,
};

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Equirectangular local projection centered at `origin`.
 * Matches project coordinate frame: +X = East, +Z = South, +Y = Up.
 * Adapted from yz4git/next-gen (MIT).
 */
export function lonLatToLocal(point: LonLat, origin: LonLat = FATIH_ORIGIN): LocalXZ {
  const cosLat = Math.cos(origin.lat * DEG_TO_RAD);
  return {
    x: (point.lon - origin.lon) * DEG_TO_RAD * EARTH_RADIUS_METERS * cosLat,
    z: -(point.lat - origin.lat) * DEG_TO_RAD * EARTH_RADIUS_METERS,
  };
}

export function localToLonLat(local: LocalXZ, origin: LonLat = FATIH_ORIGIN): LonLat {
  const cosLat = Math.cos(origin.lat * DEG_TO_RAD);
  return {
    lon: origin.lon + (local.x / (EARTH_RADIUS_METERS * cosLat)) * RAD_TO_DEG,
    lat: origin.lat - (local.z / EARTH_RADIUS_METERS) * RAD_TO_DEG,
  };
}

export function tileKey(tx: number, tz: number): string {
  return `t_${tx}_${tz}`;
}

export function worldToTileCoord(
  x: number,
  z: number,
  tileSize = TILE_SIZE_METERS,
): TileCoord {
  const tx = Math.floor(x / tileSize);
  const tz = Math.floor(z / tileSize);
  return { tx, tz, key: tileKey(tx, tz) };
}
