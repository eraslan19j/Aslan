import { clamp } from './math';
import { VEHICLE_CATALOG, type ExhaustVoice } from './vehicleCatalog';
import type { VehicleArchetype } from './vehicle';
import type { WheelTelemetry } from './vehiclePhysics';

/**
 * v0.9.0 — Pure-TS vehicle audio model.
 *
 * The old build fed a single `skidIntensity` number straight into two fixed
 * band-pass filters. That is why the tyre sound read as a synthetic "hiss":
 * the pitch never moved with speed, the noise never grained, and a locked wheel
 * at 4 km/h sounded identical to a 120 km/h drift.
 *
 * This module derives *physically meaningful* control signals per tyre from the
 * Pacejka wheel telemetry (slip ratio + slip angle + normal load + ground speed),
 * which the DSP layer then turns into:
 *   • a rubber squeal tone (frequency follows slip speed, not a fixed 1.1 kHz),
 *   • a broadband scuff/roar band for heavy sliding,
 *   • a gravel/road-texture layer for light scrub,
 *   • a load-weighted mix so the outside tyres of a corner dominate.
 *
 * Everything here is deterministic and unit-tested (`vehicleAudioModel.test.ts`).
 */

export interface WheelAudio {
  /** 0..1 squeal loudness for this tyre. */
  gain: number;
  /** 0..1 shear/scuff loudness (lower, rougher band). */
  scuff: number;
  /** Squeal fundamental in Hz (roughly proportional to shear speed). */
  fundamentalHz: number;
  /** Wheel ground speed in m/s (used for road-noise pitch). */
  speedMps: number;
  /** True when this tyre is locked or spinning in place. */
  spinning: boolean;
}

export interface TyreAudioFrame {
  wheels: [WheelAudio, WheelAudio, WheelAudio, WheelAudio];
  /** Aggregate loudness 0..1 for skid marks / smoke / haptics. */
  overallGain: number;
  /** Aggregate scuff 0..1. */
  overallScuff: number;
  /** Dominant squeal frequency. */
  dominantHz: number;
}

const EMPTY_WHEEL: WheelAudio = {
  gain: 0,
  scuff: 0,
  fundamentalHz: 0,
  speedMps: 0,
  spinning: false,
};

export function emptyTyreFrame(): TyreAudioFrame {
  return {
    wheels: [{ ...EMPTY_WHEEL }, { ...EMPTY_WHEEL }, { ...EMPTY_WHEEL }, { ...EMPTY_WHEEL }],
    overallGain: 0,
    overallScuff: 0,
    dominantHz: 0,
  };
}

/**
 * Converts one Pacejka wheel into audible tyre signals.
 *
 * Real tyre noise mechanisms:
 *  • Below ~8 % combined slip the tread just brushes the road → broadband scuff.
 *  • Past the friction peak the contact patch breaks away → a high "singing"
 *    squeal whose pitch rises with the *relative* sliding velocity.
 *  • A locked wheel at standstill still howls (high slip ratio, zero speed) but
 *    a rolling wheel at the same slip ratio screams much louder — both effects
 *    are captured by weighting with min(1, speed / 4).
 */
export function computeWheelAudio(
  wheel: WheelTelemetry,
  combinedSlip: number,
  surfaceWetness = 1,
): WheelAudio {
  const uLong = Math.abs(wheel.slipRatio) * 4.2;
  const uLat = Math.abs(Math.tan(clamp(wheel.slipAngle, -1.2, 1.2))) * 3.1;
  const shear = Math.hypot(uLong, uLat);

  const speedMps = Math.abs(wheel.slipRatio) * 3.6 + Math.abs(wheel.slipAngle) * 6.0;
  const loadNorm = clamp(wheel.normalLoad / 4200, 0.25, 1.7);

  if (!wheel.grounded) {
    // Airborne tyre: no rubber on tarmac, so nothing to hear.
    return { ...EMPTY_WHEEL };
  }
  if (combinedSlip < 0.08) {
    return { ...EMPTY_WHEEL, scuff: combinedSlip > 0.02 ? combinedSlip * 0.18 : 0 };
  }

  // Breakaway squeal: only past the friction peak, and louder with load.
  const breakaway = clamp((combinedSlip - 0.55) / 1.25, 0, 1);
  const speedGate = clamp(speedMps / 2.4, 0.18, 1);
  const wetness = clamp(surfaceWetness, 0.7, 1.15);
  const gain = clamp(breakaway * speedGate * loadNorm * 0.62 * wetness, 0, 1);

  // Rough scuff: present earlier than the squeal, dominated by shear, never gated
  // fully out so a slow locked wheel still scrapes.
  const scuff = clamp((combinedSlip - 0.2) * 0.9 * loadNorm * (0.35 + speedGate * 0.65), 0, 0.9);

  // Squeal pitch: real rubber sings ~350–2100 Hz; rises with sliding speed but
  // saturates so a 200 km/h drift does not become a dog whistle.
  const fundamentalHz = clamp(320 + shear * 620 + speedMps * 26, 300, 2150);

  return {
    gain,
    scuff,
    fundamentalHz,
    speedMps,
    spinning: Math.abs(wheel.slipRatio) > 0.5 && Math.abs(wheel.slipAngle) < 0.12,
  };
}

/** Folds the four tyre signals into the aggregate frame the DSP consumes. */
export function computeTyreFrame(
  wheels: readonly WheelTelemetry[],
  surfaceWetness = 1,
): TyreAudioFrame {
  const frame = emptyTyreFrame();
  if (wheels.length < 4) return frame;

  let totalWeight = 0;
  let weightedHz = 0;
  let maxGain = 0;
  let maxScuff = 0;

  for (let i = 0; i < 4; i += 1) {
    const w = wheels[i]!;
    const rhoX = Math.abs(w.slipRatio) / 0.16;
    const rhoY = Math.abs(Math.tan(clamp(w.slipAngle, -1.2, 1.2))) / 0.22;
    const combined = Math.hypot(rhoX, rhoY);
    const audio = computeWheelAudio(w, combined, surfaceWetness);
    frame.wheels[i] = audio;
    totalWeight += audio.gain + audio.scuff * 0.4;
    weightedHz += audio.fundamentalHz * (audio.gain + audio.scuff * 0.4);
    if (audio.gain > maxGain) maxGain = audio.gain;
    if (audio.scuff > maxScuff) maxScuff = audio.scuff;
  }

  frame.overallGain = clamp(totalWeight / 4, 0, 1);
  frame.overallScuff = maxScuff;
  frame.dominantHz = totalWeight > 1e-4 ? weightedHz / totalWeight : 0;
  if (frame.overallGain < maxGain * 0.75) frame.overallGain = maxGain * 0.75;
  return frame;
}

export interface EngineAudioFrame {
  /** Exhaust firing fundamental in Hz. */
  firingHz: number;
  /** Per-cylinder firing events per second (crank order). */
  pulseRate: number;
  /** 0..1 load used to open the muffler / brighten the harmonics. */
  load: number;
  /** 0..1 rpm fraction inside the usable band. */
  rpmFrac: number;
  /** Turbo shaft speed proxy 0..1. */
  turbo: number;
  /** Intake roar 0..1. */
  intake: number;
  /** Mechanical valvetrain click level 0..1. */
  mechanical: number;
  /** Overrun pop amount 0..1. */
  overrun: number;
  voice: ExhaustVoice;
  cylinders: number;
}

/**
 * Derives the engine voice frame. Cylinder count changes the firing order, so a
 * 4-cylinder sits an octave above a V8 at the same rpm — that single fact is what
 * made the old sound read as "one generic engine" instead of seven distinct cars.
 */
export function computeEngineAudioFrame(
  archetype: VehicleArchetype,
  rpm: number,
  throttle: number,
  turboBoost: number,
  backfirePulse: number,
  idleRpm: number,
  redlineRpm: number,
  hasTurbo: boolean,
): EngineAudioFrame {
  const entry = VEHICLE_CATALOG[archetype];
  const safeRpm = clamp(rpm, 400, redlineRpm + 400);
  const cylinders = entry.engine.cylinders;
  const rpmFrac = clamp((safeRpm - idleRpm) / Math.max(1, redlineRpm - idleRpm), 0, 1);
  const firingHz = (safeRpm / 60) * (cylinders / 2);
  const throttleSafe = clamp(throttle, 0, 1);
  const load = clamp(throttleSafe * 0.82 + rpmFrac * 0.18, 0, 1);

  return {
    firingHz,
    pulseRate: firingHz * 2,
    load,
    rpmFrac,
    turbo: hasTurbo ? clamp(turboBoost / 1.35, 0, 1) : 0,
    intake: clamp(entry.audio.voice.intakeGain * load * (0.35 + rpmFrac * 0.9), 0, 1),
    mechanical: clamp(0.25 + rpmFrac * 0.6, 0, 1),
    overrun: clamp(backfirePulse, 0, 1),
    voice: entry.audio.voice,
    cylinders,
  };
}

export interface ImpactAudioSpec {
  kind: 'metal' | 'glass' | 'plastic' | 'body';
  /** 0..1 loudness. */
  gain: number;
  /** Base resonance in Hz. */
  hz: number;
  /** Decay time constant in seconds. */
  decaySec: number;
}

/**
 * Maps an impact (closing speed + struck panel) to a layered one-shot sound.
 * Glass shatters into a bright noise burst, sheet metal gongs low with a metallic
 * ring, plastic bumpers thud — the three GTA crash timbres.
 */
export function describeImpact(
  energy: number,
  panelKind: 'glass' | 'plastic' | 'metal',
): ImpactAudioSpec {
  const loudness = clamp(energy / 22, 0.08, 1);
  if (panelKind === 'glass') {
    return { kind: 'glass', gain: loudness * 0.9, hz: 2600 + loudness * 2400, decaySec: 0.18 };
  }
  if (panelKind === 'plastic') {
    return { kind: 'plastic', gain: loudness * 0.75, hz: 180 + loudness * 90, decaySec: 0.13 };
  }
  return {
    kind: 'metal',
    gain: loudness,
    hz: 68 + loudness * 120,
    decaySec: 0.22 + (1 - loudness) * 0.16,
  };
}


/**
 * v0.9.0 (A7) — Nitro / turbo layer mix.
 *
 * Phone loudspeakers roll off hard below ~350 Hz, so a pure sub-bass "whoosh"
 * simply disappears on a handset. This model keeps every layer above that knee
 * and gives each one its own band, so nitro reads as a *pressure jet* rather than
 * a filtered hiss:
 *
 *   • `hissHz`   — 1.8 → 6.4 kHz air-jet hiss that rises with pressure
 *   • `whooshHz` — 380 → 900 Hz body of the jet (survives phone speakers)
 *   • `whistleHz`— turbo shaft whistle, 2.4 → 9.1 kHz with boost
 *   • `chuffHz`  — wastegate dump when the throttle is released
 */
export interface BoostAudioFrame {
  /** 0..1 overall nitro intensity. */
  nitro: number;
  /** 0..1 turbo shaft energy. */
  turbo: number;
  /** Air-jet hiss centre (Hz). */
  hissHz: number;
  /** Jet body centre (Hz) — deliberately above the phone-speaker knee. */
  whooshHz: number;
  /** Turbo whistle centre (Hz). */
  whistleHz: number;
  /** Wastegate chuff centre (Hz). */
  chuffHz: number;
  /** Layer gains, all kept under 1 so the master bus never clips. */
  hissGain: number;
  whooshGain: number;
  whistleGain: number;
  chuffGain: number;
}

export const EMPTY_BOOST_FRAME: BoostAudioFrame = {
  nitro: 0,
  turbo: 0,
  hissHz: 1800,
  whooshHz: 380,
  whistleHz: 2400,
  chuffHz: 520,
  hissGain: 0,
  whooshGain: 0,
  whistleGain: 0,
  chuffGain: 0,
};

/**
 * @param nitro 0..1 nitro charge in use
 * @param boost 0..1 turbo boost pressure
 * @param speedKph road speed (nitro sounds brighter at speed)
 * @param released true while the throttle is lifting off (wastegate chuff)
 */
export function computeBoostAudio(
  nitro: number,
  boost: number,
  speedKph: number,
  released: boolean,
): BoostAudioFrame {
  const n = clamp(nitro, 0, 1);
  const b = clamp(boost, 0, 1);
  const speed = clamp(speedKph / 200, 0, 1);

  // Nitro pressure builds a bright hiss on top of a mid "jet body".
  const hissHz = 1800 + n * 3600 + speed * 900;
  const whooshHz = clamp(380 + n * 420 + speed * 120, 350, 900);
  // The turbo spins up with boost pressure, not with engine rpm.
  const whistleHz = clamp(2400 + Math.pow(b, 0.75) * 6700, 2400, 9200);

  const hissGain = n * n * 0.24;
  const whooshGain = n * 0.3;
  // The whistle is intentionally quiet: it is a detail, not the main event.
  const whistleGain = b > 0.06 ? Math.pow(b, 1.4) * 0.11 : 0;
  const chuffGain = released && b > 0.25 ? Math.min(0.28, (b - 0.25) * 0.48) : 0;

  return {
    nitro: n,
    turbo: b,
    hissHz,
    whooshHz,
    whistleHz,
    chuffHz: clamp(430 + b * 320, 430, 750),
    hissGain,
    whooshGain,
    whistleGain,
    chuffGain,
  };
}
