import { clamp } from './math';
import type { VehicleArchetype } from './vehicle';

/**
 * v0.9.0 — GTA-style vehicle damage core (pure TS, deterministic, unit-tested).
 *
 * Ten named body panels each track their own structural health. Impacts are
 * routed to the panel nearest the contact point (so a T-bone dents the door and a
 * head-on folds the bonnet), and panels go through four visual states:
 *
 *   intact → dented (plastic deform + paint scuff) → cracked (lamp/glass) → detached
 *
 * Detached panels (bonnet, bumpers, mirrors, doors at extreme damage) leave the
 * car and fly as debris, exactly like the reference behaviour the user asked for.
 * Mechanical damage then cascades: a crushed bonnet costs engine power, broken
 * glass cuts visibility, a detached bumper raises drag, and a dead engine forces
 * the car to limp.
 */

export type PanelId =
  | 'hood'
  | 'trunk'
  | 'doorFrontLeft'
  | 'doorFrontRight'
  | 'fenderFrontLeft'
  | 'fenderFrontRight'
  | 'bumperFront'
  | 'bumperRear'
  | 'roof'
  | 'windshield';

export const PANEL_ORDER: readonly PanelId[] = [
  'bumperFront',
  'bumperRear',
  'hood',
  'trunk',
  'doorFrontLeft',
  'doorFrontRight',
  'fenderFrontLeft',
  'fenderFrontRight',
  'roof',
  'windshield',
];

/** Local panel anchor points in car space: +Z forward, +X left. */
export interface PanelAnchor {
  id: PanelId;
  x: number;
  z: number;
  /** Panels that can physically fall off the car. */
  detachable: boolean;
  /** Impact energy (arbitrary units, ≈ m/s of closing speed) before it dents. */
  dentThreshold: number;
  /** Impact energy before it detaches / shatters. */
  breakThreshold: number;
}

export const PANEL_ANCHORS: Record<PanelId, PanelAnchor> = {
  bumperFront: { id: 'bumperFront', x: 0, z: 2.15, detachable: true, dentThreshold: 2.2, breakThreshold: 11 },
  bumperRear: { id: 'bumperRear', x: 0, z: -2.15, detachable: true, dentThreshold: 2.2, breakThreshold: 11 },
  hood: { id: 'hood', x: 0, z: 1.35, detachable: true, dentThreshold: 2.6, breakThreshold: 9 },
  trunk: { id: 'trunk', x: 0, z: -1.6, detachable: true, dentThreshold: 3.0, breakThreshold: 11 },
  doorFrontLeft: { id: 'doorFrontLeft', x: 0.98, z: 0.15, detachable: false, dentThreshold: 2.4, breakThreshold: 15 },
  doorFrontRight: { id: 'doorFrontRight', x: -0.98, z: 0.15, detachable: false, dentThreshold: 2.4, breakThreshold: 15 },
  fenderFrontLeft: { id: 'fenderFrontLeft', x: 0.92, z: 1.5, detachable: true, dentThreshold: 3.2, breakThreshold: 13 },
  fenderFrontRight: { id: 'fenderFrontRight', x: -0.92, z: 1.5, detachable: true, dentThreshold: 3.2, breakThreshold: 13 },
  roof: { id: 'roof', x: 0, z: -0.2, detachable: false, dentThreshold: 4.5, breakThreshold: 18 },
  windshield: { id: 'windshield', x: 0, z: 0.68, detachable: false, dentThreshold: 3.6, breakThreshold: 8.5 },
};

export interface PanelState {
  health: number; // 1 = pristine, 0 = destroyed
  /** Plastic deformation depth in metres (visual dent). */
  dent: number;
  /** Panel has left the car and is flying as debris. */
  detached: boolean;
  /** Sub-panel opening angle in radians (bonnet flap / door ajar). */
  openAngle: number;
  /** Shattered glass flag (windshield / lights). */
  shattered: boolean;
  /** Paint scuff amount 0..1 (turns the panel matte/grey). */
  scuff: number;
}

export interface PanelImpact {
  panelId: PanelId;
  /** Closing speed along the contact normal (m/s). */
  energy: number;
  /** World contact point. */
  x: number;
  z: number;
  /** Contact normal (pointing into the struck car). */
  nx: number;
  nz: number;
}

export interface VehicleDamageState {
  archetype: VehicleArchetype;
  panels: Record<PanelId, PanelState>;
  /** Aggregate mechanical damage. */
  engineHealth: number;
  /** 0..1 — power multiplier applied to the physics engine. */
  powerScale: number;
  /** Extra drag from a missing bumper / hanging panel. */
  dragScale: number;
  /** 0..1 visibility loss from shattered glass (HUD vignette). */
  visibility: number;
  /** Cumulative damage score used by the repair cost / insurance screen. */
  totalDamage: number;
  /** Set once the engine is destroyed (car cannot drive). */
  disabled: boolean;
  /** Recent impacts waiting for the renderer to spawn debris / sparks. */
  pendingImpacts: PanelImpact[];
  /** Panels that just detached this frame, for the debris system. */
  pendingDetached: { panelId: PanelId; x: number; z: number; nx: number; nz: number }[];
}

export function createDamageState(archetype: VehicleArchetype): VehicleDamageState {
  const panels = {} as Record<PanelId, PanelState>;
  for (const id of PANEL_ORDER) {
    panels[id] = {
      health: 1,
      dent: 0,
      detached: false,
      openAngle: 0,
      shattered: false,
      scuff: 0,
    };
  }
  return {
    archetype,
    panels,
    engineHealth: 1,
    powerScale: 1,
    dragScale: 1,
    visibility: 1,
    totalDamage: 0,
    disabled: false,
    pendingImpacts: [],
    pendingDetached: [],
  };
}

/** Converts a world contact point into the nearest panel of the car. */
export function pickPanelForContact(
  carX: number,
  carZ: number,
  heading: number,
  contactX: number,
  contactZ: number,
  length: number,
  width: number,
): PanelId {
  const sinH = Math.sin(heading);
  const cosH = Math.cos(heading);
  const dx = contactX - carX;
  const dz = contactZ - carZ;
  const localFwd = dx * sinH + dz * cosH;
  const localLeft = dx * cosH - dz * sinH;

  const halfL = length * 0.5;
  const halfW = width * 0.5;
  const frontness = localFwd / Math.max(0.1, halfL);
  const sideness = Math.abs(localLeft) / Math.max(0.1, halfW);

  // Front / rear bumper region
  if (frontness > 0.86 && sideness < 0.95) return 'bumperFront';
  if (frontness < -0.86 && sideness < 0.95) return 'bumperRear';
  // Hood / trunk (upper front & rear decks)
  if (frontness > 0.5) {
    if (Math.abs(localLeft) < halfW * 0.55) return 'hood';
    return localLeft > 0 ? 'fenderFrontLeft' : 'fenderFrontRight';
  }
  if (frontness < -0.62) return 'trunk';
  // Cabin sides
  if (sideness > 0.55) {
    if (localFwd > -0.3) return localLeft > 0 ? 'doorFrontLeft' : 'doorFrontRight';
    return localLeft > 0 ? 'doorFrontLeft' : 'doorFrontRight';
  }
  // Top of the cabin
  if (sideness <= 0.55 && frontness > -0.3 && frontness <= 0.5) {
    return Math.abs(localFwd) > 0.35 ? 'windshield' : 'roof';
  }
  return 'roof';
}

/**
 * Applies an impact to the car and returns the resulting damage events.
 * `energy` is the closing speed in m/s; a 20 km/h nudge ≈ 5.5, a 90 km/h crash ≈ 25.
 */
export function applyVehicleImpact(
  state: VehicleDamageState,
  energy: number,
  contactX: number,
  contactZ: number,
  nx: number,
  nz: number,
  carX: number,
  carZ: number,
  heading: number,
  length: number,
  width: number,
): PanelImpact | null {
  if (energy < 1.0) return null;
  const panelId = pickPanelForContact(carX, carZ, heading, contactX, contactZ, length, width);
  const panel = state.panels[panelId];
  const anchor = PANEL_ANCHORS[panelId];

  // Damage scales super-linearly with speed, matching how real crashes behave.
  const severity = clamp((energy - 1.0) * 0.085 * (1 + Math.max(0, energy - 12) * 0.03), 0, 1.2);
  panel.health = clamp(panel.health - severity * 0.55, 0, 1);
  panel.dent = clamp(panel.dent + severity * (anchor.detachable ? 0.26 : 0.16), 0, 0.72);
  panel.scuff = clamp(panel.scuff + severity * 0.5, 0, 1);

  if (energy >= anchor.breakThreshold && anchor.detachable && !panel.detached) {
    panel.detached = true;
    panel.health = 0;
    panel.openAngle = Math.PI * 0.55;
    state.pendingDetached.push({ panelId, x: contactX, z: contactZ, nx, nz });
  } else if (energy >= anchor.dentThreshold && panel.health < 0.55 && anchor.detachable) {
    // Bent hinge: bonnet / boot flap up as it deforms.
    panel.openAngle = Math.max(panel.openAngle, clamp((0.55 - panel.health) * 0.55, 0, 0.42));
  }

  if (panelId === 'windshield' && energy >= anchor.breakThreshold && !panel.shattered) {
    panel.shattered = true;
  }

  const impact: PanelImpact = { panelId, energy, x: contactX, z: contactZ, nx, nz };
  state.pendingImpacts.push(impact);
  state.totalDamage += severity * (anchor.detachable ? 120 : 95);
  updateVehicleCondition(state);
  return impact;
}

/** Recomputes derived mechanical effects from the panel health map. */
export function updateVehicleCondition(state: VehicleDamageState): void {
  const engineBayDamage =
    (1 - state.panels.hood.health) * 0.45 +
    (1 - state.panels.bumperFront.health) * 0.22 +
    (1 - state.panels.fenderFrontLeft.health) * 0.16 +
    (1 - state.panels.fenderFrontRight.health) * 0.16 +
    (state.panels.hood.detached ? 0.25 : 0);
  state.engineHealth = clamp(1 - engineBayDamage, 0.05, 1);
  // A destroyed engine still limps at 18 % power (GTA: smoke + slow crawl before death).
  state.powerScale = clamp(0.18 + state.engineHealth * 0.82, 0.18, 1);

  let drag = 1;
  if (state.panels.bumperFront.detached) drag += 0.16;
  if (state.panels.bumperRear.detached) drag += 0.12;
  if (state.panels.hood.detached) drag += 0.07;
  if (state.panels.doorFrontLeft.openAngle > 0.25 || state.panels.doorFrontRight.openAngle > 0.25) {
    drag += 0.09;
  }
  state.dragScale = drag;

  const shatteredPanels = PANEL_ORDER.filter((id) => state.panels[id].shattered).length;
  state.visibility = clamp(1 - shatteredPanels * 0.28 - (state.panels.windshield.shattered ? 0.25 : 0), 0.25, 1);
  state.disabled = state.engineHealth <= 0.09;
}

/** Clears one-shot queues after the renderer/audio layer consumed them. */
export function consumeDamageEvents(state: VehicleDamageState): void {
  state.pendingImpacts.length = 0;
  state.pendingDetached.length = 0;
}

export function repairVehicleDamage(state: VehicleDamageState): void {
  for (const id of PANEL_ORDER) {
    const p = state.panels[id];
    p.health = 1;
    p.dent = 0;
    p.detached = false;
    p.openAngle = 0;
    p.shattered = false;
    p.scuff = 0;
  }
  state.engineHealth = 1;
  state.powerScale = 1;
  state.dragScale = 1;
  state.visibility = 1;
  state.totalDamage = 0;
  state.disabled = false;
  state.pendingImpacts.length = 0;
  state.pendingDetached.length = 0;
}

/** Turkish repair price in lira for the repair shop / HUD repair prompt. */
export function repairCostTry(state: VehicleDamageState): number {
  return Math.round(state.totalDamage * 24);
}

/** Overall 0..100 condition percentage for the damage readout. */
export function vehicleConditionPercent(state: VehicleDamageState): number {
  let sum = 0;
  for (const id of PANEL_ORDER) sum += state.panels[id].health;
  return Math.round((sum / PANEL_ORDER.length) * 100);
}
