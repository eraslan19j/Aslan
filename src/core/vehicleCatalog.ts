import type { VehicleArchetype } from './vehicle';
import { VEHICLE_PHYSICS_SPECS } from './vehiclePhysics';

/**
 * v0.9.0 — Authoritative vehicle catalogue.
 *
 * Every car class in the game is described here down to engine code, displacement,
 * compression, aspiration, peak-torque RPM, gear ratios, tyre and brake hardware,
 * aero, weight distribution and exhaust voice. The 240 Hz physics specs
 * (`VEHICLE_PHYSICS_SPECS`) and the audio engine both read from this table, and
 * `vehicleCatalog.test.ts` locks the two together so a catalogue edit can never
 * silently desynchronise the simulation.
 *
 * All names, engine codes and model names are FICTIONAL and original to this project
 * (see AGENTS.md "Sert Yasaklar" #1 — no real manufacturer names or logos anywhere).
 */

export type EngineLayout = 'I3' | 'I4' | 'I5' | 'I6' | 'V6' | 'V8' | 'B4';
export type Aspiration = 'na' | 'turbo' | 'twin-turbo' | 'supercharged';
export type FuelType = 'petrol' | 'petrol-hybrid' | 'diesel';
export type BodyStyle =
  | 'coupe'
  | 'sedan'
  | 'hatchback'
  | 'suv'
  | 'van'
  | 'taxi'
  | 'minibus';

/** Long-exposure character of the exhaust note; feeds the AudioWorklet voice. */
export interface ExhaustVoice {
  /** 0 = deep & muffled, 1 = open & raspy. */
  openness: number;
  /** 0 = smooth, 1 = harsh upper-harmonic saturation ("rasp"). */
  rasp: number;
  /** 0 = silent, 1 = loud pops/bangs on overrun & limiter. */
  popGain: number;
  /** 0 = quiet, 1 = loud induction roar on throttle. */
  intakeGain: number;
  /** 0 = no turbo audible, 1 = loud spool whistle + BOV. */
  turboGain: number;
  /** Tailpipe resonance (Hz) — the "body" of the note. */
  pipeResonanceHz: number;
  /** Muffler corner frequency (Hz) — low-pass knee. */
  mufflerCutoffHz: number;
}

export interface VehicleCatalogEntry {
  archetype: VehicleArchetype;
  /** Fictional in-game model name shown on the damage/repair sheet. */
  modelName: string;
  modelNameEn: string;
  bodyStyle: BodyStyle;
  engine: {
    /** Fictional engine family code. */
    code: string;
    layout: EngineLayout;
    aspiration: Aspiration;
    fuel: FuelType;
    displacementCc: number;
    cylinders: number;
    compressionRatio: number;
    valvetrain: string;
    /** Naturally-aspirated-equivalent output at the crank. */
    powerKw: number;
    powerHp: number;
    powerRpm: number;
    torqueNm: number;
    torqueRpm: number;
    redlineRpm: number;
    idleRpm: number;
    /** Specific output in hp per litre — used by the catalogue sanity test. */
    specificOutputHpPerL: number;
  };
  drivetrain: {
    type: 'RWD' | 'FWD' | 'AWD';
    gearbox: string;
    gears: readonly number[];
    reverseRatio: number;
    finalDrive: number;
    shiftTimeSec: number;
  };
  mass: {
    curbKg: number;
    /** Tested with driver + fuel; physics uses this. */
    testKg: number;
    frontWeightBias: number;
  };
  performance: {
    zeroTo100Sec: number;
    topSpeedKph: number;
    /** Braking 100→0 km/h in metres (dry, new pads). */
    braking100to0M: number;
    powerToWeightHpPerTon: number;
  };
  dimensions: {
    lengthMm: number;
    widthMm: number;
    heightMm: number;
    wheelbaseMm: number;
    trackMm: number;
    groundClearanceMm: number;
  };
  chassis: {
    tyreFront: string;
    tyreRear: string;
    brakeFrontMm: number;
    brakeRearMm: number;
    suspension: string;
    steering: string;
    dragCoefficient: number;
  };
  /** Audio identity used by `engine-worklet.js` + `soundEngine.ts`. */
  audio: {
    voice: ExhaustVoice;
    /** Extra sub-bass weight (diesel/minibus 0.3, sports V8 0.22). */
    subWeight: number;
    /** Detune spread between cylinder banks in cents. */
    bankDetuneCents: number;
    hasTurboWhistle: boolean;
    hasSuperchargerWhine: boolean;
  };
}

const SPORTS: VehicleCatalogEntry = {
  archetype: 'sports',
  modelName: 'Kartal GT-S',
  modelNameEn: 'Kartal GT-S',
  bodyStyle: 'coupe',
  engine: {
    code: 'BOS-40V8TT',
    layout: 'V8',
    aspiration: 'twin-turbo',
    fuel: 'petrol',
    displacementCc: 3982,
    cylinders: 8,
    compressionRatio: 9.3,
    valvetrain: 'DOHC 32v VVT',
    powerKw: 451,
    powerHp: 614,
    powerRpm: 7350,
    torqueNm: 640,
    torqueRpm: 3100,
    redlineRpm: 8200,
    idleRpm: 950,
    specificOutputHpPerL: 154.2,
  },
  drivetrain: {
    type: 'RWD',
    gearbox: '6-speed dual-clutch',
    gears: [3.32, 2.18, 1.56, 1.19, 0.94, 0.76],
    reverseRatio: -3.15,
    finalDrive: 3.72,
    shiftTimeSec: 0.11,
  },
  mass: { curbKg: 1340, testKg: 1420, frontWeightBias: 0.51 },
  performance: {
    zeroTo100Sec: 3.4,
    topSpeedKph: 202,
    braking100to0M: 33.8,
    powerToWeightHpPerTon: 458.2,
  },
  dimensions: {
    lengthMm: 4400,
    widthMm: 1900,
    heightMm: 1320,
    wheelbaseMm: 2660,
    trackMm: 1840,
    groundClearanceMm: 115,
  },
  chassis: {
    tyreFront: '245/35 R19',
    tyreRear: '275/30 R19',
    brakeFrontMm: 380,
    brakeRearMm: 330,
    suspension: 'double-wishbone / multi-link, adaptive dampers',
    steering: 'electric, 2.1 turns lock-to-lock',
    dragCoefficient: 0.31,
  },
  audio: {
    voice: {
      openness: 0.82,
      rasp: 0.55,
      popGain: 0.9,
      intakeGain: 0.7,
      turboGain: 0.95,
      pipeResonanceHz: 118,
      mufflerCutoffHz: 2600,
    },
    subWeight: 0.22,
    bankDetuneCents: 14,
    hasTurboWhistle: true,
    hasSuperchargerWhine: false,
  },
};

const SEDAN: VehicleCatalogEntry = {
  archetype: 'sedan',
  modelName: 'Marmara 1.6 T',
  modelNameEn: 'Marmara 1.6 T',
  bodyStyle: 'sedan',
  engine: {
    code: 'MRS-30T',
    layout: 'I6',
    aspiration: 'turbo',
    fuel: 'petrol',
    displacementCc: 2998,
    cylinders: 6,
    compressionRatio: 10.2,
    valvetrain: 'DOHC 24v VVT',
    powerKw: 279,
    powerHp: 379,
    powerRpm: 6000,
    torqueNm: 485,
    torqueRpm: 1800,
    redlineRpm: 7100,
    idleRpm: 850,
    specificOutputHpPerL: 126.4,
  },
  drivetrain: {
    type: 'RWD',
    gearbox: '6-speed torque-converter auto',
    gears: [3.48, 2.15, 1.48, 1.12, 0.88, 0.72],
    reverseRatio: -3.4,
    finalDrive: 4.06,
    shiftTimeSec: 0.24,
  },
  mass: { curbKg: 1520, testKg: 1615, frontWeightBias: 0.6 },
  performance: {
    zeroTo100Sec: 5.1,
    topSpeedKph: 162,
    braking100to0M: 36.4,
    powerToWeightHpPerTon: 249.3,
  },
  dimensions: {
    lengthMm: 4350,
    widthMm: 1840,
    heightMm: 1440,
    wheelbaseMm: 2640,
    trackMm: 1580,
    groundClearanceMm: 135,
  },
  chassis: {
    tyreFront: '205/55 R16',
    tyreRear: '205/55 R16',
    brakeFrontMm: 300,
    brakeRearMm: 280,
    suspension: 'MacPherson strut / torsion beam',
    steering: 'electric, 2.8 turns lock-to-lock',
    dragCoefficient: 0.29,
  },
  audio: {
    voice: {
      openness: 0.42,
      rasp: 0.2,
      popGain: 0.3,
      intakeGain: 0.35,
      turboGain: 0.45,
      pipeResonanceHz: 96,
      mufflerCutoffHz: 1700,
    },
    subWeight: 0.12,
    bankDetuneCents: 6,
    hasTurboWhistle: true,
    hasSuperchargerWhine: false,
  },
};

const HATCHBACK: VehicleCatalogEntry = {
  archetype: 'hatchback',
  modelName: 'Sokak 1.4',
  modelNameEn: 'Sokak 1.4',
  bodyStyle: 'hatchback',
  engine: {
    code: 'SK-20T',
    layout: 'I4',
    aspiration: 'turbo',
    fuel: 'petrol',
    displacementCc: 1984,
    cylinders: 4,
    compressionRatio: 9.6,
    valvetrain: 'DOHC 16v',
    powerKw: 254,
    powerHp: 345,
    powerRpm: 6450,
    torqueNm: 410,
    torqueRpm: 2600,
    redlineRpm: 7400,
    idleRpm: 900,
    specificOutputHpPerL: 173.9,
  },
  drivetrain: {
    type: 'FWD',
    gearbox: '6-speed manual',
    gears: [3.55, 2.19, 1.52, 1.14, 0.9, 0.74],
    reverseRatio: -3.42,
    finalDrive: 4.21,
    shiftTimeSec: 0.16,
  },
  mass: { curbKg: 1210, testKg: 1300, frontWeightBias: 0.62 },
  performance: {
    zeroTo100Sec: 4.9,
    topSpeedKph: 158,
    braking100to0M: 35.2,
    powerToWeightHpPerTon: 285.1,
  },
  dimensions: {
    lengthMm: 3950,
    widthMm: 1780,
    heightMm: 1450,
    wheelbaseMm: 2510,
    trackMm: 1530,
    groundClearanceMm: 130,
  },
  chassis: {
    tyreFront: '195/55 R16',
    tyreRear: '195/55 R16',
    brakeFrontMm: 282,
    brakeRearMm: 250,
    suspension: 'MacPherson strut / twist beam',
    steering: 'electric, 2.7 turns lock-to-lock',
    dragCoefficient: 0.32,
  },
  audio: {
    voice: {
      openness: 0.58,
      rasp: 0.35,
      popGain: 0.45,
      intakeGain: 0.55,
      turboGain: 0,
      pipeResonanceHz: 132,
      mufflerCutoffHz: 2100,
    },
    subWeight: 0.08,
    bankDetuneCents: 4,
    hasTurboWhistle: false,
    hasSuperchargerWhine: false,
  },
};

const SUV: VehicleCatalogEntry = {
  archetype: 'suv',
  modelName: 'Yayla 2.2 D',
  modelNameEn: 'Yayla 2.2 D',
  bodyStyle: 'suv',
  engine: {
    code: 'YY-35V6TT',
    layout: 'V6',
    aspiration: 'twin-turbo',
    fuel: 'petrol',
    displacementCc: 3498,
    cylinders: 6,
    compressionRatio: 10.0,
    valvetrain: 'DOHC 24v VVT',
    powerKw: 311,
    powerHp: 423,
    powerRpm: 5450,
    torqueNm: 620,
    torqueRpm: 1900,
    redlineRpm: 6600,
    idleRpm: 800,
    specificOutputHpPerL: 120.9,
  },
  drivetrain: {
    type: 'AWD',
    gearbox: '8-speed automatic',
    gears: [3.62, 2.26, 1.54, 1.15, 0.89, 0.72],
    reverseRatio: -3.5,
    finalDrive: 3.9,
    shiftTimeSec: 0.19,
  },
  mass: { curbKg: 2040, testKg: 2160, frontWeightBias: 0.56 },
  performance: {
    zeroTo100Sec: 5.9,
    topSpeedKph: 150,
    braking100to0M: 39.9,
    powerToWeightHpPerTon: 207.4,
  },
  dimensions: {
    lengthMm: 4650,
    widthMm: 1960,
    heightMm: 1760,
    wheelbaseMm: 2790,
    trackMm: 1660,
    groundClearanceMm: 195,
  },
  chassis: {
    tyreFront: '235/60 R18',
    tyreRear: '235/60 R18',
    brakeFrontMm: 320,
    brakeRearMm: 300,
    suspension: 'MacPherson strut / multi-link, self-levelling rear',
    steering: 'electric, 3.0 turns lock-to-lock',
    dragCoefficient: 0.35,
  },
  audio: {
    voice: {
      openness: 0.3,
      rasp: 0.12,
      popGain: 0.15,
      intakeGain: 0.25,
      turboGain: 0.7,
      pipeResonanceHz: 78,
      mufflerCutoffHz: 1400,
    },
    subWeight: 0.3,
    bankDetuneCents: 3,
    hasTurboWhistle: true,
    hasSuperchargerWhine: false,
  },
};

const VAN: VehicleCatalogEntry = {
  archetype: 'van',
  modelName: 'Kurye 2.5',
  modelNameEn: 'Kurye 2.5',
  bodyStyle: 'van',
  engine: {
    code: 'KR-25BiTD',
    layout: 'I4',
    aspiration: 'twin-turbo',
    fuel: 'diesel',
    displacementCc: 2495,
    cylinders: 4,
    compressionRatio: 16.8,
    valvetrain: 'DOHC 16v common-rail',
    powerKw: 181,
    powerHp: 246,
    powerRpm: 4680,
    torqueNm: 450,
    torqueRpm: 1500,
    redlineRpm: 5800,
    idleRpm: 700,
    specificOutputHpPerL: 98.6,
  },
  drivetrain: {
    type: 'RWD',
    gearbox: '6-speed manual',
    gears: [3.8, 2.35, 1.58, 1.16, 0.88, 0.71],
    reverseRatio: -3.78,
    finalDrive: 4.44,
    shiftTimeSec: 0.21,
  },
  mass: { curbKg: 2350, testKg: 2480, frontWeightBias: 0.52 },
  performance: {
    zeroTo100Sec: 7.6,
    topSpeedKph: 131,
    braking100to0M: 45.0,
    powerToWeightHpPerTon: 104.7,
  },
  dimensions: {
    lengthMm: 4950,
    widthMm: 2000,
    heightMm: 2040,
    wheelbaseMm: 3100,
    trackMm: 1700,
    groundClearanceMm: 205,
  },
  chassis: {
    tyreFront: '215/65 R16C',
    tyreRear: '215/65 R16C',
    brakeFrontMm: 300,
    brakeRearMm: 280,
    suspension: 'MacPherson strut / leaf spring',
    steering: 'hydraulic, 3.4 turns lock-to-lock',
    dragCoefficient: 0.39,
  },
  audio: {
    voice: {
      openness: 0.22,
      rasp: 0.1,
      popGain: 0.08,
      intakeGain: 0.2,
      turboGain: 0.55,
      pipeResonanceHz: 62,
      mufflerCutoffHz: 1150,
    },
    subWeight: 0.34,
    bankDetuneCents: 2,
    hasTurboWhistle: true,
    hasSuperchargerWhine: false,
  },
};

const TAXI: VehicleCatalogEntry = {
  archetype: 'taxi',
  modelName: 'Taksi 1.6 (Sarı)',
  modelNameEn: 'Taxi 1.6 (Yellow)',
  bodyStyle: 'taxi',
  engine: {
    code: 'TK-20T',
    layout: 'I4',
    aspiration: 'turbo',
    fuel: 'petrol',
    displacementCc: 1984,
    cylinders: 4,
    compressionRatio: 9.8,
    valvetrain: 'DOHC 16v',
    powerKw: 281,
    powerHp: 382,
    powerRpm: 5900,
    torqueNm: 495,
    torqueRpm: 2100,
    redlineRpm: 7000,
    idleRpm: 850,
    specificOutputHpPerL: 192.5,
  },
  drivetrain: {
    type: 'RWD',
    gearbox: '6-speed torque-converter auto',
    gears: [3.48, 2.15, 1.48, 1.12, 0.88, 0.72],
    reverseRatio: -3.4,
    finalDrive: 4.06,
    shiftTimeSec: 0.26,
  },
  mass: { curbKg: 1480, testKg: 1570, frontWeightBias: 0.6 },
  performance: {
    zeroTo100Sec: 5.2,
    topSpeedKph: 155,
    braking100to0M: 36.8,
    powerToWeightHpPerTon: 258.1,
  },
  dimensions: {
    lengthMm: 4300,
    widthMm: 1850,
    heightMm: 1480,
    wheelbaseMm: 2620,
    trackMm: 1585,
    groundClearanceMm: 140,
  },
  chassis: {
    tyreFront: '205/55 R16',
    tyreRear: '205/55 R16',
    brakeFrontMm: 300,
    brakeRearMm: 280,
    suspension: 'MacPherson strut / torsion beam',
    steering: 'electric, 2.8 turns lock-to-lock',
    dragCoefficient: 0.30,
  },
  audio: {
    voice: {
      openness: 0.4,
      rasp: 0.18,
      popGain: 0.25,
      intakeGain: 0.32,
      turboGain: 0.4,
      pipeResonanceHz: 98,
      mufflerCutoffHz: 1750,
    },
    subWeight: 0.12,
    bankDetuneCents: 5,
    hasTurboWhistle: true,
    hasSuperchargerWhine: false,
  },
};

const DOLMUS: VehicleCatalogEntry = {
  archetype: 'dolmus',
  modelName: 'Minibüs 2.5 D',
  modelNameEn: 'Minibus 2.5 D',
  bodyStyle: 'minibus',
  engine: {
    code: 'MN-25TD',
    layout: 'I4',
    aspiration: 'turbo',
    fuel: 'diesel',
    displacementCc: 2495,
    cylinders: 4,
    compressionRatio: 17.6,
    valvetrain: 'SOHC 8v',
    powerKw: 171,
    powerHp: 233,
    powerRpm: 4530,
    torqueNm: 440,
    torqueRpm: 1500,
    redlineRpm: 5600,
    idleRpm: 780,
    specificOutputHpPerL: 93.4,
  },
  drivetrain: {
    type: 'RWD',
    gearbox: '6-speed manual',
    gears: [3.8, 2.35, 1.58, 1.16, 0.88, 0.71],
    reverseRatio: -3.78,
    finalDrive: 4.55,
    shiftTimeSec: 0.23,
  },
  mass: { curbKg: 2450, testKg: 2590, frontWeightBias: 0.5 },
  performance: {
    zeroTo100Sec: 9.8,
    topSpeedKph: 126,
    braking100to0M: 47.1,
    powerToWeightHpPerTon: 95.1,
  },
  dimensions: {
    lengthMm: 5000,
    widthMm: 2000,
    heightMm: 2050,
    wheelbaseMm: 3110,
    trackMm: 1710,
    groundClearanceMm: 210,
  },
  chassis: {
    tyreFront: '215/65 R16C',
    tyreRear: '215/65 R16C',
    brakeFrontMm: 305,
    brakeRearMm: 285,
    suspension: 'double-wishbone / leaf spring',
    steering: 'hydraulic, 3.5 turns lock-to-lock',
    dragCoefficient: 0.40,
  },
  audio: {
    voice: {
      openness: 0.2,
      rasp: 0.08,
      popGain: 0.06,
      intakeGain: 0.18,
      turboGain: 0.5,
      pipeResonanceHz: 58,
      mufflerCutoffHz: 1100,
    },
    subWeight: 0.36,
    bankDetuneCents: 2,
    hasTurboWhistle: true,
    hasSuperchargerWhine: false,
  },
};

export const VEHICLE_CATALOG: Record<VehicleArchetype, VehicleCatalogEntry> = {
  sports: SPORTS,
  sedan: SEDAN,
  hatchback: HATCHBACK,
  suv: SUV,
  van: VAN,
  taxi: TAXI,
  dolmus: DOLMUS,
};

export const VEHICLE_ARCHETYPE_ORDER: readonly VehicleArchetype[] = [
  'sports',
  'sedan',
  'hatchback',
  'taxi',
  'suv',
  'van',
  'dolmus',
];

export function getVehicleCatalogEntry(archetype: VehicleArchetype): VehicleCatalogEntry {
  return VEHICLE_CATALOG[archetype];
}

/** Human-readable one-liner for the repair sheet / about modal. */
export function formatVehicleSpecLine(archetype: VehicleArchetype): string {
  const e = VEHICLE_CATALOG[archetype];
  return `${e.modelName} · ${e.engine.displacementCc} cc ${e.engine.layout} ${e.engine.aspiration.toUpperCase()} · ${e.engine.powerHp} hp / ${e.engine.torqueNm} Nm · ${e.mass.curbKg} kg`;
}

/**
 * Numeric consistency report used by the unit test. Returns a list of mismatches
 * between the catalogue and the tuned 240 Hz physics spec (empty = in sync).
 */
export function auditCatalogAgainstPhysics(): string[] {
  const problems: string[] = [];
  for (const arch of VEHICLE_ARCHETYPE_ORDER) {
    const e = VEHICLE_CATALOG[arch];
    const p = VEHICLE_PHYSICS_SPECS[arch];
    if (!p) {
      problems.push(`${arch}: missing physics spec`);
      continue;
    }
    if (Math.abs(p.massKg - e.mass.curbKg) > 40) {
      problems.push(`${arch}: mass ${p.massKg} vs catalogue ${e.mass.curbKg}`);
    }
    if (Math.abs(p.peakTorqueNm - e.engine.torqueNm) > 40) {
      problems.push(`${arch}: torque ${p.peakTorqueNm} vs catalogue ${e.engine.torqueNm}`);
    }
    if (Math.abs(p.redlineRpm - e.engine.redlineRpm) > 250) {
      problems.push(`${arch}: redline ${p.redlineRpm} vs catalogue ${e.engine.redlineRpm}`);
    }
    if (Math.abs(p.idleRpm - e.engine.idleRpm) > 120) {
      problems.push(`${arch}: idle ${p.idleRpm} vs catalogue ${e.engine.idleRpm}`);
    }
    if (p.gearRatios.length !== e.drivetrain.gears.length) {
      problems.push(`${arch}: gear count ${p.gearRatios.length} vs ${e.drivetrain.gears.length}`);
    }
    if (p.drivetrain !== e.drivetrain.type) {
      problems.push(`${arch}: drivetrain ${p.drivetrain} vs ${e.drivetrain.type}`);
    }
    if (Math.abs(p.topSpeedMps * 3.6 - e.performance.topSpeedKph) > 14) {
      problems.push(
        `${arch}: top speed ${(p.topSpeedMps * 3.6).toFixed(0)} vs catalogue ${e.performance.topSpeedKph}`,
      );
    }
  }
  return problems;
}

/**
 * Crank power in kW at a given RPM, derived from the tuned torque curve.
 * Used by HUD/tests so the catalogue power figure is never a dead number.
 */
export function estimateCrankPowerKw(archetype: VehicleArchetype, rpm: number): number {
  const p = VEHICLE_PHYSICS_SPECS[archetype];
  const frac = Math.max(0, Math.min(1, (rpm - p.idleRpm) / Math.max(1, p.redlineRpm - p.idleRpm)));
  const curve = p.torqueCurve;
  let torqueFraction = curve[curve.length - 1]![1];
  for (let i = 1; i < curve.length; i += 1) {
    const [x0, y0] = curve[i - 1]!;
    const [x1, y1] = curve[i]!;
    if (frac <= x1) {
      const t = x1 > x0 ? (frac - x0) / (x1 - x0) : 0;
      torqueFraction = y0 + t * (y1 - y0);
      break;
    }
  }
  const torqueNm = p.peakTorqueNm * torqueFraction;
  return (torqueNm * rpm * Math.PI * 2) / 60 / 1000;
}
