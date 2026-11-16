import { clamp } from '../math';
import type { BuildingHeightSource, BuildingPalette } from './types';

export interface ResolvedHeight {
  height: number;
  source: BuildingHeightSource;
}

const FATIH_KIND_DEFAULT_HEIGHTS: Record<string, number> = {
  mosque: 22,
  cathedral: 24,
  church: 15,
  hotel: 15.5,
  apartments: 13.5,
  commercial: 12.5,
  office: 14,
  retail: 9.5,
  historic: 11.5,
  public: 12,
  civic: 12,
  school: 11,
  university: 13,
  hospital: 15,
  train_station: 11,
  house: 7.5,
  residential: 10.5,
  kiosk: 3.6,
  roof: 4.5,
};

function deterministicUnit(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return (h >>> 0) / 4_294_967_295;
}

export function parseOsmMeters(raw?: string | number): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toLowerCase().replace(',', '.');
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(m|meters?|ft|feet)?$/);
  if (!match?.[1]) return null;
  const num = Number(match[1]);
  if (!Number.isFinite(num) || num <= 0) return null;
  if (match[2] === 'ft' || match[2] === 'feet') {
    return num * 0.3048;
  }
  return num;
}

/**
 * GENESIS §6 Rule 3:
 * height tag -> building:levels * 3.2 -> deterministic Fatih-calibrated estimate.
 */
export function resolveBuildingHeight(
  id: string,
  heightTag?: string | number,
  levelsTag?: string | number,
  buildingKind?: string,
): ResolvedHeight {
  const parsedHeight = parseOsmMeters(heightTag);
  if (parsedHeight !== null) {
    return { height: Number(clamp(parsedHeight, 3.0, 95).toFixed(2)), source: 'height' };
  }

  const levelsNum =
    typeof levelsTag === 'number'
      ? levelsTag
      : typeof levelsTag === 'string'
        ? Number(levelsTag.trim().replace(',', '.'))
        : Number.NaN;
  if (Number.isFinite(levelsNum) && levelsNum > 0 && levelsNum <= 40) {
    return { height: Number(clamp(levelsNum * 3.2, 3.2, 95).toFixed(2)), source: 'levels' };
  }

  const base = FATIH_KIND_DEFAULT_HEIGHTS[buildingKind ?? ''] ?? 10.5;
  const jitter = 0.8 + deterministicUnit(id) * 0.42;
  return { height: Number(clamp(base * jitter, 4.2, 24).toFixed(2)), source: 'inferred' };
}

export function classifyFatihPalette(id: string, buildingKind?: string): BuildingPalette {
  const k = (buildingKind ?? '').toLowerCase();
  if (k === 'mosque' || k === 'historic' || k === 'cathedral' || k === 'church') {
    return 'landmark';
  }
  if (k === 'civic' || k === 'public' || k === 'school' || k === 'university' || k === 'train_station') {
    return 'civic';
  }
  if (k === 'commercial' || k === 'retail' || k === 'hotel' || k === 'office') {
    return 'commercial';
  }
  const u = deterministicUnit(`${id}:pal`);
  if (u < 0.42) return 'limestone';
  if (u < 0.72) return 'terracotta';
  if (u < 0.9) return 'ottoman_wood';
  return 'commercial';
}
