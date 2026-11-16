export type QualityTier = 'normal' | 'lite';

export interface QualityPreset {
  tier: QualityTier;
  maxPixelRatio: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  drawDistance: number;
  fogNear: number;
  fogFar: number;
  maxDrawCallsBudget: number;
  antialias: boolean;
}

const PRESETS: Record<QualityTier, QualityPreset> = {
  normal: {
    tier: 'normal',
    maxPixelRatio: 1.5,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    drawDistance: 300,
    fogNear: 75,
    fogFar: 295,
    maxDrawCallsBudget: 150,
    antialias: true,
  },
  lite: {
    tier: 'lite',
    maxPixelRatio: 1.0,
    shadowsEnabled: false,
    shadowMapSize: 512,
    drawDistance: 165,
    fogNear: 45,
    fogFar: 160,
    maxDrawCallsBudget: 90,
    antialias: false,
  },
};

export function getQualityPreset(tier: QualityTier): QualityPreset {
  return { ...PRESETS[tier] };
}

/** Suggest Lite mode automatically on low-core or low-memory mobile devices. */
export function suggestQualityTier(
  hardwareConcurrency?: number,
  deviceMemoryGb?: number,
): QualityTier {
  if (typeof deviceMemoryGb === 'number' && deviceMemoryGb > 0 && deviceMemoryGb <= 3) {
    return 'lite';
  }
  if (
    typeof hardwareConcurrency === 'number' &&
    hardwareConcurrency > 0 &&
    hardwareConcurrency <= 4
  ) {
    return 'lite';
  }
  return 'normal';
}
