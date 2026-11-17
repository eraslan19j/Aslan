/**
 * TimeCycle Atmosphere & Lighting Presets (pure TS, zero Three.js).
 * Architecturally inspired by GTA Vice City's CTimeCycle / Timecyc hourly palettes:
 * drives sky zenith/horizon, sun/moon angle & color, hemisphere ambient fill, fog,
 * emissive storefront/window glow, and asphalt specular sheen across Day, Sunset & Night.
 */

export type AtmospherePresetId = 'day' | 'sunset' | 'night';

export interface TimeCycleProfile {
  id: AtmospherePresetId;
  skyTopHex: number;
  skyMidHex: number;
  skyHorizonHex: number;
  fogHex: number;
  sunHex: number;
  sunIntensity: number;
  sunOffset: readonly [number, number, number];
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  windowEmissiveIntensity: number;
  groundEmissiveIntensity: number;
  roadRoughness: number;
  roadMetalness: number;
  headlightIntensity: number;
  exposure: number;
}

const TIMECYCLE_PROFILES: Record<AtmospherePresetId, TimeCycleProfile> = {
  day: {
    id: 'day',
    skyTopHex: 0x3a82d6,
    skyMidHex: 0x7cb8ed,
    skyHorizonHex: 0xdbeeff,
    fogHex: 0xcbe3f8,
    sunHex: 0xfff4dc,
    sunIntensity: 1.55,
    sunOffset: [88, 128, 62],
    hemiSkyHex: 0xcce5ff,
    hemiGroundHex: 0x8b7e6d,
    hemiIntensity: 0.78,
    windowEmissiveIntensity: 0.0,
    groundEmissiveIntensity: 0.0,
    roadRoughness: 0.84,
    roadMetalness: 0.06,
    headlightIntensity: 0,
    exposure: 1.08,
  },
  // Iconic Vice City golden-peach & warm violet coastal twilight
  sunset: {
    id: 'sunset',
    skyTopHex: 0x2b2458,
    skyMidHex: 0xc95f7a,
    skyHorizonHex: 0xffa85c,
    fogHex: 0xe68b6c,
    sunHex: 0xff9e54,
    sunIntensity: 1.48,
    sunOffset: [132, 46, -84],
    hemiSkyHex: 0xffb380,
    hemiGroundHex: 0x4c3549,
    hemiIntensity: 0.68,
    windowEmissiveIntensity: 0.55,
    groundEmissiveIntensity: 0.65,
    roadRoughness: 0.58,
    roadMetalness: 0.18,
    headlightIntensity: 1.6,
    exposure: 1.06,
  },
  // Vibrant Vice City Mediterranean midnight with glowing windows & subtle wet-asphalt reflection
  night: {
    id: 'night',
    skyTopHex: 0x091026,
    skyMidHex: 0x162246,
    skyHorizonHex: 0x293259,
    fogHex: 0x16203b,
    sunHex: 0x90b4f8,
    sunIntensity: 0.52,
    sunOffset: [-70, 96, -55],
    hemiSkyHex: 0x3b4d82,
    hemiGroundHex: 0x1d1a26,
    hemiIntensity: 0.48,
    windowEmissiveIntensity: 1.15,
    groundEmissiveIntensity: 1.25,
    roadRoughness: 0.42,
    roadMetalness: 0.28,
    headlightIntensity: 3.4,
    exposure: 1.04,
  },
};

export function getTimeCycleProfile(id: AtmospherePresetId): TimeCycleProfile {
  return TIMECYCLE_PROFILES[id];
}

export function nextAtmospherePreset(current: AtmospherePresetId): AtmospherePresetId {
  if (current === 'day') return 'sunset';
  if (current === 'sunset') return 'night';
  return 'day';
}
