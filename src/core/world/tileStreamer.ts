import { TILE_SIZE_METERS, tileKey, worldToTileCoord } from './geo';

export interface TileStreamingDiff {
  centerKey: string;
  desired: string[];
  toLoad: string[];
  toUnload: string[];
}

/**
 * Pure 300m tile streaming planner with unload hysteresis so crossing a tile edge
 * does not repeatedly load/unload boundary tiles.
 */
export function planTileStreaming(
  playerX: number,
  playerZ: number,
  loadRadiusTiles: number,
  currentlyLoaded: ReadonlySet<string>,
  availableTiles: ReadonlySet<string>,
  tileSize = TILE_SIZE_METERS,
): TileStreamingDiff {
  const center = worldToTileCoord(playerX, playerZ, tileSize);
  const desiredSet = new Set<string>();
  const keepRadius = loadRadiusTiles + 1;
  const keepSet = new Set<string>();

  for (let dz = -keepRadius; dz <= keepRadius; dz += 1) {
    for (let dx = -keepRadius; dx <= keepRadius; dx += 1) {
      const k = tileKey(center.tx + dx, center.tz + dz);
      if (!availableTiles.has(k)) continue;
      keepSet.add(k);
      if (Math.abs(dx) <= loadRadiusTiles && Math.abs(dz) <= loadRadiusTiles) {
        desiredSet.add(k);
      }
    }
  }

  // Sort toLoad closest-first so the tile directly under the player always loads first
  const toLoad = [...desiredSet]
    .filter((k) => !currentlyLoaded.has(k))
    .sort((a, b) => {
      const da = tileDistanceSq(a, center.tx, center.tz);
      const db = tileDistanceSq(b, center.tx, center.tz);
      return da - db;
    });

  const toUnload = [...currentlyLoaded].filter((k) => !keepSet.has(k));

  return {
    centerKey: center.key,
    desired: [...desiredSet],
    toLoad,
    toUnload,
  };
}

function tileDistanceSq(key: string, ctx: number, ctz: number): number {
  const parts = key.split('_');
  const tx = Number(parts[1] ?? 0);
  const tz = Number(parts[2] ?? 0);
  const dx = tx - ctx;
  const dz = tz - ctz;
  return dx * dx + dz * dz;
}
