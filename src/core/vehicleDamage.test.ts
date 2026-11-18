import { describe, expect, it } from 'vitest';
import {
  applyVehicleImpact,
  consumeDamageEvents,
  createDamageState,
  PANEL_ORDER,
  pickPanelForContact,
  repairCostTry,
  repairVehicleDamage,
  updateVehicleCondition,
  vehicleConditionPercent,
} from './vehicleDamage';

const CAR_L = 4.4;
const CAR_W = 1.9;

describe('v0.9.0 GTA-style Vehicle Damage (panels, dents, detached hood, glass)', () => {
  it('starts pristine and reports 100 % condition', () => {
    const state = createDamageState('sedan');
    expect(vehicleConditionPercent(state)).toBe(100);
    expect(state.powerScale).toBe(1);
    expect(state.dragScale).toBe(1);
    expect(state.visibility).toBe(1);
    expect(state.disabled).toBe(false);
    for (const id of PANEL_ORDER) {
      expect(state.panels[id].health).toBe(1);
      expect(state.panels[id].detached).toBe(false);
    }
  });

  it('routes a head-on hit to the bonnet and a rear hit to the boot lid', () => {
    expect(pickPanelForContact(0, 0, 0, 0, 2.3, CAR_L, CAR_W)).toBe('bumperFront');
    expect(pickPanelForContact(0, 0, 0, 0, -2.3, CAR_L, CAR_W)).toBe('bumperRear');
    expect(pickPanelForContact(0, 0, 0, 0, 1.5, CAR_L, CAR_W)).toBe('hood');
    expect(pickPanelForContact(0, 0, 0, 0, -1.7, CAR_L, CAR_W)).toBe('trunk');
    // Side impact on the left door
    expect(pickPanelForContact(0, 0, 0, 0.95, 0.1, CAR_L, CAR_W)).toBe('doorFrontLeft');
    expect(pickPanelForContact(0, 0, 0, -0.95, 0.1, CAR_L, CAR_W)).toBe('doorFrontRight');
  });

  it('a light nudge dents the panel but does not detach it', () => {
    const state = createDamageState('sedan');
    const impact = applyVehicleImpact(state, 4.5, 0, 1.5, 0, 1, 0, 0, 0, CAR_L, CAR_W);
    expect(impact?.panelId).toBe('hood');
    expect(state.panels.hood.dent).toBeGreaterThan(0);
    expect(state.panels.hood.detached).toBe(false);
    expect(vehicleConditionPercent(state)).toBeLessThan(100);
    expect(repairCostTry(state)).toBeGreaterThan(0);
  });

  it('a severe head-on detaches the bonnet and costs engine power', () => {
    const state = createDamageState('sports');
    applyVehicleImpact(state, 26, 0, 1.4, 0, 1, 0, 0, 0, CAR_L, CAR_W);
    expect(state.panels.hood.detached).toBe(true);
    expect(state.pendingDetached.length).toBe(1);
    expect(state.pendingDetached[0]!.panelId).toBe('hood');
    expect(state.powerScale).toBeLessThan(0.85);
    expect(state.dragScale).toBeGreaterThan(1);
  });

  it('shatters the windscreen on a heavy frontal blow and reduces visibility', () => {
    const state = createDamageState('sedan');
    applyVehicleImpact(state, 11, 0, 0.72, 0, 1, 0, 0, 0, CAR_L, CAR_W);
    expect(state.panels.windshield.shattered).toBe(true);
    expect(state.visibility).toBeLessThan(1);
  });

  it('repeated side hits eventually peel the bumper but never detach the roof', () => {
    const state = createDamageState('suv');
    for (let i = 0; i < 12; i += 1) {
      applyVehicleImpact(state, 4, 0.98, 0.1, 1, 0, 0, 0, 0, CAR_L, CAR_W);
    }
    expect(state.panels.doorFrontLeft.health).toBeLessThan(0.5);
    expect(state.panels.doorFrontLeft.detached).toBe(false);
    // Roof structural integrity is preserved no matter how many door hits land.
    expect(state.panels.roof.detached).toBe(false);
    expect(state.panels.roof.health).toBe(1);
  });

  it('repair restores every panel, power, drag and visibility', () => {
    const state = createDamageState('taxi');
    applyVehicleImpact(state, 24, 0, 1.5, 0, 1, 0, 0, 0, CAR_L, CAR_W);
    applyVehicleImpact(state, 24, 0, -1.6, 0, -1, 0, 0, 0, CAR_L, CAR_W);
    expect(vehicleConditionPercent(state)).toBeLessThan(100);
    repairVehicleDamage(state);
    expect(vehicleConditionPercent(state)).toBe(100);
    expect(state.powerScale).toBe(1);
    expect(state.dragScale).toBe(1);
    expect(state.visibility).toBe(1);
    expect(state.disabled).toBe(false);
    expect(state.totalDamage).toBe(0);
  });

  it('marks the car disabled only when the engine bay is fully crushed', () => {
    const state = createDamageState('hatchback');
    // Crush the bonnet AND the front bumper (the whole engine bay crumple zone).
    for (let i = 0; i < 6; i += 1) {
      applyVehicleImpact(state, 30, 0, 1.5, 0, 1, 0, 0, 0, CAR_L, CAR_W);
      applyVehicleImpact(state, 30, 0, 2.25, 0, 1, 0, 0, 0, CAR_L, CAR_W);
    }
    updateVehicleCondition(state);
    expect(state.engineHealth).toBeLessThan(0.2);
    expect(state.powerScale).toBeLessThan(0.35);
  });

  it('clears the one-shot impact queues after the renderer consumes them', () => {
    const state = createDamageState('van');
    applyVehicleImpact(state, 6, 0, 1.5, 0, 1, 0, 0, 0, CAR_L, CAR_W);
    expect(state.pendingImpacts.length).toBeGreaterThan(0);
    consumeDamageEvents(state);
    expect(state.pendingImpacts.length).toBe(0);
    expect(state.pendingDetached.length).toBe(0);
  });
});
