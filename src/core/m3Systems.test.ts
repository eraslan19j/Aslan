import { describe, expect, it } from 'vitest';
import { TaxiMissionManager } from './missions';
import { PedestrianSimulator } from './pedestrians';
import type { SanctuaryZone } from './sanctuary';
import { RoadTrafficSimulator } from './traffic';
import { createVehicleState, stepPlayerVehicle } from './vehicle';
import { WantedSystem } from './wanted';
import { BuildingSpatialGrid } from './world/collision';
import type { LandmarkPin, RoadGraph } from './world/types';

function makeSampleRoadGraph(): RoadGraph {
  return {
    schemaVersion: 1,
    regionId: 'test-region',
    nodes: [
      { id: 'n0', x: 0, y: 10, z: 0 },
      { id: 'n1', x: 0, y: 10, z: 90 },
      { id: 'n2', x: 90, y: 12, z: 90 },
      { id: 'n3', x: 90, y: 12, z: 0 },
      { id: 'n4', x: 180, y: 15, z: 0 },
      { id: 'n5', x: 180, y: 15, z: 90 },
    ],
    edges: [
      { id: 'e0', from: 'n0', to: 'n1', lengthMeters: 90, width: 9, roadClass: 'primary', speedLimitKph: 45, oneWay: false },
      { id: 'e1', from: 'n1', to: 'n2', lengthMeters: 90, width: 9, roadClass: 'primary', speedLimitKph: 45, oneWay: false },
      { id: 'e2', from: 'n2', to: 'n3', lengthMeters: 90, width: 8, roadClass: 'secondary', speedLimitKph: 40, oneWay: false },
      { id: 'e3', from: 'n3', to: 'n0', lengthMeters: 90, width: 8, roadClass: 'secondary', speedLimitKph: 40, oneWay: false },
      { id: 'e4', from: 'n3', to: 'n4', lengthMeters: 90, width: 7, roadClass: 'residential', speedLimitKph: 30, oneWay: false },
      { id: 'e5', from: 'n4', to: 'n5', lengthMeters: 90, width: 7, roadClass: 'residential', speedLimitKph: 30, oneWay: false },
      { id: 'e6', from: 'n5', to: 'n2', lengthMeters: 90, width: 7, roadClass: 'residential', speedLimitKph: 30, oneWay: false },
    ],
  };
}

describe('M3 & Mobile Benchmark Systems', () => {
  it('resolves solid player-to-traffic collisions (no ghost cars) and yields on horn', () => {
    const traffic = new RoadTrafficSimulator(makeSampleRoadGraph(), 4, 34034);
    traffic.step(0.1, 0, 0, () => 10);
    const agent = traffic.getAgents()[0]!;

    // Drive player taxi directly onto the AI vehicle's spot -> MUST collide & push apart!
    const hit = traffic.resolvePlayerVehicleCollision(agent.x + 0.4, agent.z, -10, 0);
    expect(hit.collided).toBe(true);
    expect(hit.hitAgentId).toBe(agent.id);
    expect(hit.impactSpeed).toBeGreaterThan(2);
    expect(Math.hypot(hit.x - agent.x, hit.z - agent.z)).toBeGreaterThanOrEqual(2.0);

    // Honking nearby triggers polite traffic yield
    traffic.notifyHorn(agent.x, agent.z, 30);
    expect(agent.yieldTimer).toBeGreaterThan(1.0);
  });

  it('walks sidewalk pedestrians, dodges on horn, and keeps Worship Sanctuaries strictly calm', () => {
    const graph = makeSampleRoadGraph();
    const peds = new PedestrianSimulator(graph, 8, 991);
    const sanctuaries: SanctuaryZone[] = [
      { id: 'mosque-1', nameTr: 'Merkez Camii', nameEn: 'Central Mosque', x: 0, z: 0, radiusMeters: 500 },
    ];
    // Inside giant sanctuary -> honking & speeding NEVER trigger panic or close-call offenses!
    peds.notifyHorn(0, 0, sanctuaries, 300);
    const calmRes = peds.step(0.1, 0, 0, 20, true, sanctuaries, () => 10);
    expect(calmRes.closeCalls).toBe(0);
    for (const p of peds.getAgents()) {
      expect(p.panicTimer).toBe(0);
    }

    // Outside sanctuary -> honking triggers polite startle/dodge reaction
    const first = peds.getAgents()[0]!;
    peds.notifyHorn(first.x, first.z, [], 30);
    expect(first.panicTimer).toBeGreaterThan(1.5);
  });

  it('runs a full Sarı Taksi pickup -> drop-off mission cycle and awards cash + streak', () => {
    const graph = makeSampleRoadGraph();
    const landmarks: LandmarkPin[] = [
      { id: 'lm-a', nameTr: 'Durak A', nameEn: 'Stop A', x: 90, y: 12, z: 0, lon: 28.88, lat: 41.04, kind: 'park' },
      { id: 'lm-b', nameTr: 'Durak B', nameEn: 'Stop B', x: 180, y: 15, z: 90, lon: 28.89, lat: 41.04, kind: 'bazaar' },
    ];
    const mgr = new TaxiMissionManager(landmarks, graph.nodes, 34034);
    const m = mgr.ensureMission(0, 0);
    expect(m.phase).toBe('pickup');

    // Arrive at pickup slowly inside taxi -> passenger boards!
    const pickEv = mgr.step(0.1, m.targetX, m.targetZ, true, 15);
    expect(pickEv.type).toBe('picked_up');
    expect(mgr.getActive()?.phase).toBe('dropoff');

    // Arrive at drop-off before timer expires -> earn cash + combo streak + auto next fare!
    const drop = mgr.getActive()!;
    const doneEv = mgr.step(0.1, drop.targetX, drop.targetZ, true, 20);
    expect(doneEv.type).toBe('completed');
    expect(doneEv.rewardCash).toBeGreaterThan(120);
    expect(mgr.getCompletedCount()).toBe(1);
    expect(mgr.getStreak()).toBe(1);
    expect(mgr.getActive()?.phase).toBe('pickup');
  });

  it('enforces Wanted 1-5 stars, Worship Sanctuary immunity, police deployment, and BUSTED recovery', () => {
    const wanted = new WantedSystem(3);
    const grid = new BuildingSpatialGrid(20);

    // Offenses inside Worship Sanctuary are strictly rejected
    expect(wanted.reportOffense(40, true)).toBe(false);
    expect(wanted.getStars()).toBe(0);

    // Offenses outside sanctuary raise Wanted stars & deploy patrol cruisers
    expect(wanted.reportOffense(30, false)).toBe(true);
    expect(wanted.getStars()).toBe(1);

    const step1 = wanted.step(0.1, 0, 0, 10, false, grid, () => 0);
    expect(step1.activePoliceCount).toBe(1);
    expect(step1.busted).toBe(false);

    // Move patrol right next to stationary player outside sanctuary for >3s -> triggers BUSTED
    const unit = wanted.getUnits()[0]!;
    unit.x = 1.5;
    unit.z = 0;
    let busted = false;
    for (let i = 0; i < 35; i += 1) {
      const r = wanted.step(0.1, 0, 0, 0, false, grid, () => 0);
      if (r.busted) {
        busted = true;
        break;
      }
    }
    expect(busted).toBe(true);
    expect(wanted.getStars()).toBe(0);
  });

  it('reports vehicle gear (D/R/N) and handbrake drift state cleanly', () => {
    const grid = new BuildingSpatialGrid(20);
    const taxi = createVehicleState('t1', 'taxi', 0, 0, 0, 0);
    const bounds = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };

    // Accelerate forward -> forward gear ('1'..'6')
    let gear: string = 'N';
    for (let i = 0; i < 45; i += 1) {
      gear = stepPlayerVehicle(taxi, { throttle: 1, brake: 0, steer: 0, handbrake: false }, 1 / 60, bounds, () => 0, grid).gear;
    }
    expect(['1', '2', '3', '4', '5', '6']).toContain(gear);
    expect(taxi.speed).toBeGreaterThan(5);

    // Pull handbrake while steering -> drifting flag activates!
    for (let i = 0; i < 12; i += 1) {
      stepPlayerVehicle(taxi, { throttle: 0, brake: 0, steer: 1, handbrake: true }, 1 / 60, bounds, () => 0, grid);
    }
    expect(taxi.drifting).toBe(true);
  });
});
