import { distance2D } from './math';

export interface SanctuaryZone {
  id: string;
  nameTr: string;
  nameEn: string;
  /** Local world coordinates (meters from active region origin). */
  x: number;
  z: number;
  radiusMeters: number;
}

/**
 * Active worship sanctuary zones in Fatih (Sultanahmet-Eminönü).
 * Inside these zones weapons, combat, and ragdoll effects are strictly locked.
 * Coordinates will be synchronized with exact M1 projected landmark positions.
 */
export const FATIH_SANCTUARY_ZONES: readonly SanctuaryZone[] = [
  {
    id: 'ayasofya',
    nameTr: 'Ayasofya Çevresi (Güvenli Alan)',
    nameEn: 'Hagia Sophia Precinct (Safe Zone)',
    x: 90,
    z: -55,
    radiusMeters: 65,
  },
  {
    id: 'sultanahmet-camii',
    nameTr: 'Sultanahmet Camii Çevresi (Güvenli Alan)',
    nameEn: 'Blue Mosque Precinct (Safe Zone)',
    x: -75,
    z: 85,
    radiusMeters: 75,
  },
];

export function findSanctuaryZone(
  x: number,
  z: number,
  zones: readonly SanctuaryZone[] = FATIH_SANCTUARY_ZONES,
): SanctuaryZone | null {
  for (const zone of zones) {
    if (distance2D(x, z, zone.x, zone.z) <= zone.radiusMeters) {
      return zone;
    }
  }
  return null;
}

export function isCombatAllowedAt(
  x: number,
  z: number,
  zones: readonly SanctuaryZone[] = FATIH_SANCTUARY_ZONES,
): boolean {
  return findSanctuaryZone(x, z, zones) === null;
}
