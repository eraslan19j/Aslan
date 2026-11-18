import { describe, expect, it } from 'vitest';
import {
  computeBoostAudio,
  computeEngineAudioFrame,
  computeTyreFrame,
  computeWheelAudio,
  describeImpact,
  emptyTyreFrame,
} from './vehicleAudioModel';
import { createWheelTelemetry, type WheelTelemetry } from './vehiclePhysics';
import { VEHICLE_CATALOG, VEHICLE_ARCHETYPE_ORDER } from './vehicleCatalog';

function wheelsWith(
  slipRatio: number,
  slipAngle: number,
  load = 3800,
  grounded = true,
): WheelTelemetry[] {
  return [0, 1, 2, 3].map((i) => {
    const w = createWheelTelemetry(i, i < 2, i % 2 === 0 ? 0.9 : -0.9, i < 2 ? 1.3 : -1.3);
    w.slipRatio = slipRatio;
    w.slipAngle = slipAngle;
    w.normalLoad = load;
    w.grounded = grounded;
    return w;
  });
}

describe('v0.9.0 realistic tyre + layered engine audio model', () => {
  it('produces silence on a gripping tyre and no fake hiss at a standstill', () => {
    const grip = computeTyreFrame(wheelsWith(0.02, 0.01));
    expect(grip.overallGain).toBe(0);
    expect(grip.overallScuff).toBeLessThan(0.05);

    const airborne = computeTyreFrame(wheelsWith(0.9, 0.5, 3800, false));
    expect(airborne.overallGain).toBe(0);
  });

  it('keeps the squeal pitch tied to slip speed instead of a fixed 1.1 kHz', () => {
    const light = computeWheelAudio(
      { ...createWheelTelemetry(0, true, 0.9, 1.3), slipRatio: 0.3, slipAngle: 0.1, normalLoad: 3600 },
      0.7,
    );
    const heavy = computeWheelAudio(
      { ...createWheelTelemetry(0, true, 0.9, 1.3), slipRatio: 1.15, slipAngle: 0.55, normalLoad: 3600 },
      2.1,
    );
    expect(heavy.fundamentalHz).toBeGreaterThan(light.fundamentalHz);
    expect(heavy.gain).toBeGreaterThan(light.gain);
    // Both stay inside the real rubber squeal band
    expect(light.fundamentalHz).toBeGreaterThan(300);
    expect(heavy.fundamentalHz).toBeLessThan(2200);
  });

  it('gives a locked wheel shear/scuff even at walking pace', () => {
    const locked = computeWheelAudio(
      { ...createWheelTelemetry(2, false, 0.9, -1.3), slipRatio: 0.95, slipAngle: 0.02, normalLoad: 3000 },
      3.0,
    );
    expect(locked.scuff).toBeGreaterThan(0.15);
    expect(locked.spinning).toBe(true);
  });

  it('weights the outside tyres: a one-wheel slide is quieter than a four-wheel slide', () => {
    const all = computeTyreFrame(wheelsWith(1.0, 0.4));
    const one = computeTyreFrame([
      { ...createWheelTelemetry(0, true, 0.9, 1.3), slipRatio: 1.0, slipAngle: 0.4, normalLoad: 3800 },
      { ...createWheelTelemetry(1, true, -0.9, 1.3), slipRatio: 0.02, slipAngle: 0.01, normalLoad: 3800 },
      { ...createWheelTelemetry(2, false, 0.9, -1.3), slipRatio: 0.02, slipAngle: 0.01, normalLoad: 3800 },
      { ...createWheelTelemetry(3, false, -0.9, -1.3), slipRatio: 0.02, slipAngle: 0.01, normalLoad: 3800 },
    ]);
    expect(all.overallGain).toBeGreaterThan(one.overallGain);
    expect(one.overallGain).toBeGreaterThan(0);
  });

  it('wet roads make the tyres louder without changing the pitch band', () => {
    const dry = computeTyreFrame(wheelsWith(0.9, 0.3), 1.0);
    const wet = computeTyreFrame(wheelsWith(0.9, 0.3), 1.15);
    expect(wet.overallGain).toBeGreaterThan(dry.overallGain);
    expect(Math.abs(wet.dominantHz - dry.dominantHz)).toBeLessThan(1);
  });

  it('returns a clean empty frame when no wheels are present', () => {
    const frame = emptyTyreFrame();
    expect(frame.overallGain).toBe(0);
    expect(frame.wheels).toHaveLength(4);
  });

  it('gives every car class a distinct engine voice (cylinder order sets the pitch)', () => {
    const frames = VEHICLE_ARCHETYPE_ORDER.map((arch) => {
      const e = VEHICLE_CATALOG[arch];
      return computeEngineAudioFrame(
        arch,
        e.engine.redlineRpm * 0.7,
        1,
        0.8,
        0,
        e.engine.idleRpm,
        e.engine.redlineRpm,
        e.audio.hasTurboWhistle,
      );
    });
    // V8 sports car and 4-cylinder hatchback must not share a firing frequency
    const sports = frames[VEHICLE_ARCHETYPE_ORDER.indexOf('sports')]!;
    const hatch = frames[VEHICLE_ARCHETYPE_ORDER.indexOf('hatchback')]!;
    expect(sports.firingHz).toBeGreaterThan(hatch.firingHz * 1.2);
    expect(sports.voice.openness).toBeGreaterThan(hatch.voice.openness);
    // Diesel minibus is the muffled one
    const dolmus = frames[VEHICLE_ARCHETYPE_ORDER.indexOf('dolmus')]!;
    expect(dolmus.voice.mufflerCutoffHz).toBeLessThan(sports.voice.mufflerCutoffHz);
  });

  it('engine load, intake roar and turbo scale with throttle & rpm', () => {
    const idle = computeEngineAudioFrame('sports', 950, 0, 0, 0, 950, 8200, true);
    const full = computeEngineAudioFrame('sports', 7000, 1, 1.3, 0, 950, 8200, true);
    expect(idle.load).toBeLessThan(0.2);
    expect(full.load).toBeGreaterThan(0.85);
    expect(full.intake).toBeGreaterThan(idle.intake);
    expect(full.turbo).toBeGreaterThan(0.9);
    expect(idle.turbo).toBe(0);
  });

  it('describes three distinct crash timbres (metal / glass / plastic)', () => {
    const metal = describeImpact(18, 'metal');
    const glass = describeImpact(18, 'glass');
    const plastic = describeImpact(18, 'plastic');
    expect(metal.hz).toBeLessThan(250);
    expect(glass.hz).toBeGreaterThan(2000);
    expect(plastic.hz).toBeGreaterThan(metal.hz);
    expect(plastic.hz).toBeLessThan(glass.hz);
    expect(metal.gain).toBeGreaterThan(0.5);
    // A parking nudge still makes a quiet noise, never full volume
    expect(describeImpact(2, 'metal').gain).toBeLessThan(0.2);
  });
});

describe('boost audio frame (v0.9.0 A7 nitro & turbo layers)', () => {
  it('is silent at rest with no nitro and no boost', () => {
    const f = computeBoostAudio(0, 0, 0, false);
    expect(f.hissGain).toBe(0);
    expect(f.whooshGain).toBe(0);
    expect(f.whistleGain).toBe(0);
    expect(f.chuffGain).toBe(0);
  });

  it('keeps every layer above the phone-speaker rolloff', () => {
    for (const nitro of [0, 0.25, 0.5, 1]) {
      const f = computeBoostAudio(nitro, 0.8, 120, false);
      expect(f.whooshHz).toBeGreaterThanOrEqual(350);
      expect(f.hissHz).toBeGreaterThan(1500);
      expect(f.whistleHz).toBeGreaterThan(2000);
    }
  });

  it('nitro hiss and jet body rise with pressure', () => {
    const low = computeBoostAudio(0.2, 0, 60, false);
    const high = computeBoostAudio(1.0, 0, 60, false);
    expect(high.hissHz).toBeGreaterThan(low.hissHz);
    expect(high.hissGain).toBeGreaterThan(low.hissGain);
    expect(high.whooshGain).toBeGreaterThan(low.whooshGain);
  });

  it('turbo whistle climbs with boost but stays gentle', () => {
    const low = computeBoostAudio(0, 0.2, 80, false);
    const high = computeBoostAudio(0, 1.0, 80, false);
    expect(high.whistleHz).toBeGreaterThan(low.whistleHz);
    expect(high.whistleGain).toBeLessThan(0.12);
  });

  it('wastegate chuff only fires on lift-off with real boost', () => {
    expect(computeBoostAudio(0, 0.9, 90, false).chuffGain).toBe(0);
    expect(computeBoostAudio(0, 0.1, 90, true).chuffGain).toBe(0);
    expect(computeBoostAudio(0, 0.9, 90, true).chuffGain).toBeGreaterThan(0.1);
  });

  it('never sums the layers into clipping territory', () => {
    const f = computeBoostAudio(1, 1, 200, true);
    const total = f.hissGain + f.whooshGain + f.whistleGain + f.chuffGain;
    expect(total).toBeLessThan(1);
  });
});
