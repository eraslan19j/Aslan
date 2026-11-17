/**
 * 4-Tier Android-First Open-World Quality System (Low / Medium / High / Ultra).
 * Controls resolution scaling, shadows, open-world tile streaming radius, prop/shadow LOD cutoffs,
 * fog & draw distance, and live NPC + traffic agent densities.
 */
export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

export const QUALITY_TIER_ORDER: readonly QualityTier[] = ['low', 'medium', 'high', 'ultra'];

export interface QualityPreset {
  tier: QualityTier;
  maxPixelRatio: number;
  antialias: boolean;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  drawDistance: number;
  fogNear: number;
  fogFar: number;
  /** Open-world tile streaming radius (1 = 3x3 tiles, 2 = 5x5 tiles). */
  streamingRadius: number;
  /** Distance cutoff (m) for batched street props (trees, palms, lamps, benches, signs). */
  propLodDistance: number;
  /** Distance cutoff (m) for building shadow casting. */
  shadowLodDistance: number;
  /** Active road-network AI vehicles (moving + curbside parked). */
  trafficCount: number;
  /** Active sidewalk AI pedestrians. */
  pedestrianCount: number;
  fixedStepHz: number;
}

const PRESETS: Record<QualityTier, QualityPreset> = {
  low: {
    tier: 'low',
    maxPixelRatio: 1.0,
    antialias: false,
    shadowsEnabled: false,
    shadowMapSize: 512,
    drawDistance: 280,
    fogNear: 120,
    fogFar: 320,
    streamingRadius: 1,
    propLodDistance: 210,
    shadowLodDistance: 0,
    trafficCount: 10,
    pedestrianCount: 14,
    fixedStepHz: 60,
  },
  medium: {
    tier: 'medium',
    maxPixelRatio: 1.35,
    antialias: true,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    drawDistance: 410,
    fogNear: 165,
    fogFar: 460,
    streamingRadius: 1,
    propLodDistance: 310,
    shadowLodDistance: 260,
    trafficCount: 18,
    pedestrianCount: 28,
    fixedStepHz: 60,
  },
  high: {
    tier: 'high',
    maxPixelRatio: 1.75,
    antialias: true,
    shadowsEnabled: true,
    shadowMapSize: 1536,
    drawDistance: 540,
    fogNear: 215,
    fogFar: 610,
    streamingRadius: 2,
    propLodDistance: 400,
    shadowLodDistance: 360,
    trafficCount: 26,
    pedestrianCount: 40,
    fixedStepHz: 60,
  },
  ultra: {
    tier: 'ultra',
    maxPixelRatio: 2.0,
    antialias: true,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    drawDistance: 720,
    fogNear: 270,
    fogFar: 790,
    streamingRadius: 2,
    propLodDistance: 540,
    shadowLodDistance: 460,
    trafficCount: 34,
    pedestrianCount: 54,
    fixedStepHz: 60,
  },
};

export function normalizeQualityTier(raw: unknown): QualityTier | null {
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'ultra') {
    return raw;
  }
  // Backward compatibility for v0.1–v0.4 saves & URL parameters
  if (raw === 'lite') return 'low';
  if (raw === 'normal') return 'high';
  return null;
}

export function getQualityPreset(tier: QualityTier): QualityPreset {
  return PRESETS[tier];
}

export function nextQualityTier(current: QualityTier): QualityTier {
  const idx = QUALITY_TIER_ORDER.indexOf(current);
  return QUALITY_TIER_ORDER[(idx + 1) % QUALITY_TIER_ORDER.length]!;
}

export function suggestQualityTier(
  hardwareConcurrency?: number,
  deviceMemoryGb?: number,
): QualityTier {
  if (typeof deviceMemoryGb === 'number' && deviceMemoryGb <= 3) {
    return 'low';
  }
  if (typeof hardwareConcurrency === 'number' && hardwareConcurrency <= 4) {
    return 'low';
  }
  if (typeof deviceMemoryGb === 'number' && deviceMemoryGb <= 4) {
    return 'medium';
  }
  if (typeof hardwareConcurrency === 'number' && hardwareConcurrency <= 6) {
    return 'medium';
  }
  return 'high';
}
