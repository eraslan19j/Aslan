import { describe, expect, it } from 'vitest';
import { RoadTrafficSimulator } from './traffic';
import {
  boxFromArchetype,
  resolveCarPair,
  solveVehicleContacts,
  testBoxOverlap,
  type DynamicBody,
} from './vehicleCollision';
import type { RoadGraph } from './world/types';

function loopGraph(): RoadGraph {
  const nodes = [
    { id: 'n0', x: 0, z: 0 },
    { id: 'n1', x: 0, z: 200 },
    { id: 'n2', x: 200, z: 200 },
    { id: 'n3', x: 200, z: 0 },
  ];
  const edges = [
    { from: 'n0', to: 'n1', lengthMeters: 200, speedLimitKph: 40, roadClass: 'residential', oneWay: false },
    { from: 'n1', to: 'n2', lengthMeters: 200, speedLimitKph: 40, roadClass: 'residential', oneWay: false },
    { from: 'n2', to: 'n3', lengthMeters: 200, speedLimitKph: 40, roadClass: 'residential', oneWay: false },
    { from: 'n3', to: 'n0', lengthMeters: 200, speedLimitKph: 40, roadClass: 'residential', oneWay: false },
  ];
  return { nodes, edges, bounds: { minX: 0, maxX: 200, minZ: 0, maxZ: 200 } } as unknown as RoadGraph;
}

describe('v0.9.0 Vehicle OBB Collision (no more sinking into NPC cars)', () => {
  it('detects a nose-into-door overlap and pushes along the true minimum axis', () => {
    // Player sports car pointing +X, right at the flank of an NPC sedan facing +Z.
    const player = boxFromArchetype(0, 0, Math.PI / 2, 'sports');
    const npc = boxFromArchetype(1.2, 0, 0, 'sedan');
    const contact = testBoxOverlap(player, npc);
    expect(contact.hit).toBe(true);
    // Push the player back out along -X (the axis it entered from).
    expect(contact.nx).toBeLessThan(-0.9);
    expect(Math.abs(contact.nz)).toBeLessThan(0.1);
    expect(contact.depth).toBeGreaterThan(0.15);
  });

  it('reports zero overlap once the cars are cleanly separated', () => {
    const player = boxFromArchetype(0, 0, 0, 'sports');
    const npc = boxFromArchetype(0, 6.5, 0, 'sedan');
    expect(testBoxOverlap(player, npc).hit).toBe(false);
  });

  it('a 60 km/h rear-end moves the struck car forward and leaves NO interpenetration', () => {
    const res = resolveCarPair({
      ax: 0,
      az: -4.0,
      aHeading: 0,
      avx: 0,
      avz: 16.7,
      aMassKg: 1420,
      aArchetype: 'sports',
      bx: 0,
      bz: 0,
      bHeading: 0,
      bvx: 0,
      bvz: 0,
      bMassKg: 1615,
      bArchetype: 'sedan',
    });
    expect(res.collided).toBe(true);
    expect(res.closingSpeed).toBeGreaterThan(15);
    // A slows down, B is shoved forward
    expect(res.aDeltaVz).toBeLessThan(0);
    expect(res.bDeltaVz).toBeGreaterThan(3);
    // A must be pushed backwards out of B
    expect(res.az).toBeLessThan(-4.0);
    // After the correction the boxes must not overlap any more
    const after = testBoxOverlap(
      boxFromArchetype(res.ax, res.az, 0, 'sports'),
      boxFromArchetype(res.bx, res.bz, 0, 'sedan'),
    );
    expect(after.hit).toBe(false);
  });

  it('lighter car is pushed farther than the heavier one (mass-weighted separation)', () => {
    // Heavy minibus drives its nose into the flank of a small hatchback (deep, unambiguous overlap).
    const heavyHitsLight = resolveCarPair({
      ax: 3.1,
      az: 0,
      aHeading: Math.PI / 2,
      avx: 9,
      avz: 0,
      aMassKg: 2590, // dolmus
      aArchetype: 'dolmus',
      bx: 0,
      bz: 0,
      bHeading: 0,
      bvx: 0,
      bvz: 0,
      bMassKg: 1300, // hatchback
      bArchetype: 'hatchback',
    });
    expect(heavyHitsLight.collided).toBe(true);
    const heavyMove = Math.hypot(heavyHitsLight.ax - 3.1, heavyHitsLight.az - 0);
    const lightMove = Math.hypot(heavyHitsLight.bx - 0, heavyHitsLight.bz - 0);
    expect(lightMove).toBeGreaterThan(heavyMove * 1.8);
  });

  it('an off-centre hit adds spin to the struck car (GTA-style PIT manoeuvre)', () => {
    // Sports car drives +X at full lock into the sedan's left flank, well forward of centre.
    const pit = resolveCarPair({
      ax: 1.5,
      az: -1.2,
      aHeading: Math.PI / 2,
      avx: -12,
      avz: 0,
      aMassKg: 1420,
      aArchetype: 'sports',
      bx: 0,
      bz: 0,
      bHeading: 0,
      bvx: 0,
      bvz: 0,
      bMassKg: 1615,
      bArchetype: 'sedan',
    });
    expect(pit.collided).toBe(true);
    expect(Math.abs(pit.bDeltaYaw)).toBeGreaterThan(0.5);
  });

  it('iterated multi-body solve leaves a 6-car pileup fully separated', () => {
    const bodies: DynamicBody[] = [];
    for (let i = 0; i < 6; i += 1) {
      bodies.push({
        x: (i % 2) * 0.8,
        z: i * 3.1,
        heading: 0,
        vx: 0,
        vz: i === 5 ? -9 : 0,
        yawRate: 0,
        massKg: 1500,
        archetype: 'sedan',
      });
    }
    solveVehicleContacts(bodies, 6);
    for (let i = 0; i < bodies.length; i += 1) {
      for (let k = i + 1; k < bodies.length; k += 1) {
        const a = bodies[i]!;
        const b = bodies[k]!;
        const overlap = testBoxOverlap(
          boxFromArchetype(a.x, a.z, a.heading, a.archetype),
          boxFromArchetype(b.x, b.z, b.heading, b.archetype),
        );
        expect(overlap.depth).toBeLessThan(0.16);
      }
    }
  });

  it('traffic simulator resolves a heading-aware hit with zero residual penetration', () => {
    const sim = new RoadTrafficSimulator(loopGraph(), 4, 4242, 60, 60);
    const target = sim.getAgents()[0]!;
    // Park the target, then drive another car straight into its flank along its own axis.
    const fwdX = Math.sin(target.heading);
    const fwdZ = Math.cos(target.heading);
    const hit = sim.resolvePlayerVehicleCollision(
      target.x + fwdX * 3.6,
      target.z + fwdZ * 3.6,
      -fwdX * 14,
      -fwdZ * 14,
      1420,
      target.heading + Math.PI,
      'sports',
    );
    expect(hit.collided).toBe(true);
    expect(hit.penetrationDepth).toBeGreaterThan(0);
    expect(Math.hypot(hit.x - target.x, hit.z - target.z)).toBeGreaterThan(2.0);
    expect(target.knockTimer).toBeGreaterThan(0.5);
  });
});
