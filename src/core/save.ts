import { normalizeQualityTier, type QualityTier } from './quality';
import type { DrivingMode, SteeringControlMode, TransmissionMode } from './vehiclePhysics';

export type LocaleCode = 'tr' | 'en';

export const SAVE_SCHEMA_VERSION = 1 as const;
export const SAVE_PRIMARY_KEY = 'istanbul_streets_save_v1';
export const SAVE_BACKUP_KEY = 'istanbul_streets_save_v1_bak';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveData {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  updatedAtIso: string;
  locale: LocaleCode;
  qualityTier: QualityTier;
  activeRegionId: string;
  playerPos: { x: number; y: number; z: number };
  cash: number;
  wantedStars: number;
  completedMissions: string[];
  collectiblesFound: string[];
  drivingMode?: DrivingMode;
  transmissionMode?: TransmissionMode;
  steeringMode?: SteeringControlMode;
}

export interface SaveLoadResult {
  data: SaveData;
  source: 'primary' | 'backup' | 'default';
  recoveredFromCorruption: boolean;
}

export function createDefaultSave(nowIso = new Date().toISOString()): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    updatedAtIso: nowIso,
    locale: 'tr',
    qualityTier: 'high',
    activeRegionId: 'esenler-namik-kemal',
    playerPos: { x: 0, y: 1.0, z: 0 },
    cash: 250,
    wantedStars: 0,
    completedMissions: [],
    collectiblesFound: [],
    drivingMode: 'street',
    transmissionMode: 'auto',
    steeringMode: 'buttons',
  };
}

function isValidNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function parseSaveJson(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj.schemaVersion !== SAVE_SCHEMA_VERSION) return null;
    if (obj.locale !== 'tr' && obj.locale !== 'en') return null;
    const normalizedTier = normalizeQualityTier(obj.qualityTier);
    if (!normalizedTier) return null;
    if (typeof obj.activeRegionId !== 'string' || obj.activeRegionId.length === 0) return null;
    if (!isValidNumber(obj.cash) || obj.cash < 0) return null;
    if (!isValidNumber(obj.wantedStars) || obj.wantedStars < 0 || obj.wantedStars > 5) return null;
    if (!obj.playerPos || typeof obj.playerPos !== 'object') return null;
    const pos = obj.playerPos as Record<string, unknown>;
    if (!isValidNumber(pos.x) || !isValidNumber(pos.y) || !isValidNumber(pos.z)) return null;
    if (
      !Array.isArray(obj.completedMissions) ||
      !obj.completedMissions.every((x) => typeof x === 'string')
    ) {
      return null;
    }
    if (
      !Array.isArray(obj.collectiblesFound) ||
      !obj.collectiblesFound.every((x) => typeof x === 'string')
    ) {
      return null;
    }
    const drivingMode: DrivingMode =
      obj.drivingMode === 'drift' || obj.drivingMode === 'sim' ? obj.drivingMode : 'street';
    const transmissionMode: TransmissionMode =
      obj.transmissionMode === 'manual' ? 'manual' : 'auto';
    const steeringMode: SteeringControlMode =
      obj.steeringMode === 'slider' || obj.steeringMode === 'gyro' ? obj.steeringMode : 'buttons';
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      updatedAtIso:
        typeof obj.updatedAtIso === 'string' ? obj.updatedAtIso : new Date().toISOString(),
      locale: obj.locale,
      qualityTier: normalizedTier,
      activeRegionId: obj.activeRegionId,
      playerPos: { x: pos.x, y: pos.y, z: pos.z },
      cash: Math.floor(obj.cash),
      wantedStars: Math.floor(obj.wantedStars),
      completedMissions: [...obj.completedMissions],
      collectiblesFound: [...obj.collectiblesFound],
      drivingMode,
      transmissionMode,
      steeringMode,
    };
  } catch {
    return null;
  }
}

export class SaveStore {
  private readonly storage: KeyValueStorage;

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
  }

  load(): SaveLoadResult {
    const rawPrimary = this.storage.getItem(SAVE_PRIMARY_KEY);
    const primary = parseSaveJson(rawPrimary);
    if (primary) {
      return { data: primary, source: 'primary', recoveredFromCorruption: false };
    }

    const hadCorruptedPrimary = rawPrimary !== null;
    const backup = parseSaveJson(this.storage.getItem(SAVE_BACKUP_KEY));
    if (backup) {
      // Heal primary from verified backup
      this.storage.setItem(SAVE_PRIMARY_KEY, JSON.stringify(backup));
      return { data: backup, source: 'backup', recoveredFromCorruption: hadCorruptedPrimary };
    }

    return {
      data: createDefaultSave(),
      source: 'default',
      recoveredFromCorruption: hadCorruptedPrimary,
    };
  }

  save(data: SaveData): void {
    const serialized = JSON.stringify({
      ...data,
      schemaVersion: SAVE_SCHEMA_VERSION,
      updatedAtIso: new Date().toISOString(),
    });
    // Back up last known-good primary before overwriting so mid-write crashes never wipe progress
    const prevPrimary = this.storage.getItem(SAVE_PRIMARY_KEY);
    if (parseSaveJson(prevPrimary)) {
      this.storage.setItem(SAVE_BACKUP_KEY, prevPrimary!);
    }
    this.storage.setItem(SAVE_PRIMARY_KEY, serialized);
  }

  reset(): SaveData {
    this.storage.removeItem(SAVE_PRIMARY_KEY);
    this.storage.removeItem(SAVE_BACKUP_KEY);
    return createDefaultSave();
  }
}
