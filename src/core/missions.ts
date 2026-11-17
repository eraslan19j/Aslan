import { distance2D } from './math';
import { createRng, type Rng } from './rng';
import type { LandmarkPin, RoadGraphNode } from './world/types';

export type TaxiMissionPhase = 'pickup' | 'dropoff';

export interface ActiveTaxiMission {
  id: string;
  phase: TaxiMissionPhase;
  targetX: number;
  targetZ: number;
  targetNameTr: string;
  targetNameEn: string;
  dropoffX: number;
  dropoffZ: number;
  dropoffNameTr: string;
  dropoffNameEn: string;
  rewardCash: number;
  timeRemainingSec: number;
  maxTimeSec: number;
}

export interface MissionStepEvent {
  type: 'none' | 'picked_up' | 'completed' | 'expired';
  rewardCash?: number;
  streak?: number;
  targetNameTr?: string;
  targetNameEn?: string;
}

const PICKUP_RADIUS = 8.5;
const DROPOFF_RADIUS = 10.5;

/**
 * Pure TypeScript Sarı Taksi fare mission loop.
 * Picks reachable real street/landmark locations in the active region (Tepe Mahallesi or Tarihî Yarımada),
 * awards ₺ + combo streak bonuses on completion, and stays 100% deterministic via seeded RNG.
 */
export class TaxiMissionManager {
  private readonly landmarks: readonly LandmarkPin[];
  private readonly nodes: readonly RoadGraphNode[];
  private readonly rng: Rng;
  private active: ActiveTaxiMission | null = null;
  private completedCount = 0;
  private streak = 0;
  private seq = 0;

  constructor(
    landmarks: readonly LandmarkPin[],
    nodes: readonly RoadGraphNode[],
    seed = 34034,
  ) {
    this.landmarks = landmarks;
    this.nodes = nodes;
    this.rng = createRng(seed);
  }

  getActive(): ActiveTaxiMission | null {
    return this.active;
  }

  getCompletedCount(): number {
    return this.completedCount;
  }

  getStreak(): number {
    return this.streak;
  }

  private pickPoint(
    fromX: number,
    fromZ: number,
    minDist: number,
    maxDist: number,
  ): { x: number; z: number; nameTr: string; nameEn: string } {
    // Prefer real named non-mosque landmarks within range so destinations feel recognizable
    const lmCandidates = this.landmarks.filter((lm) => {
      if (lm.kind === 'mosque') return false;
      const d = distance2D(fromX, fromZ, lm.x, lm.z);
      return d >= minDist && d <= maxDist;
    });
    if (lmCandidates.length > 0) {
      const lm = lmCandidates[Math.floor(this.rng.next() * lmCandidates.length)]!;
      return { x: lm.x, z: lm.z, nameTr: lm.nameTr, nameEn: lm.nameEn };
    }

    // Fallback to reachable road-graph intersections within ideal driving distance
    let best: RoadGraphNode | null = null;
    let bestErr = Infinity;
    const mid = (minDist + maxDist) * 0.5;
    const tries = Math.min(40, this.nodes.length);
    for (let i = 0; i < tries; i += 1) {
      const n = this.nodes[Math.floor(this.rng.next() * this.nodes.length)]!;
      const d = distance2D(fromX, fromZ, n.x, n.z);
      if (d >= minDist && d <= maxDist) {
        best = n;
        break;
      }
      const err = Math.abs(d - mid);
      if (err < bestErr) {
        bestErr = err;
        best = n;
      }
    }
    if (best) {
      return {
        x: best.x,
        z: best.z,
        nameTr: 'Mahalle Durağı',
        nameEn: 'Neighborhood Stop',
      };
    }
    return {
      x: fromX + 120,
      z: fromZ + 60,
      nameTr: 'Merkez Durak',
      nameEn: 'Central Stop',
    };
  }

  /** Ensures there is always an inviting nearby pickup fare ready when driving. */
  ensureMission(playerX: number, playerZ: number): ActiveTaxiMission {
    if (this.active) return this.active;
    this.seq += 1;
    const pickup = this.pickPoint(playerX, playerZ, 45, 165);
    const dropoff = this.pickPoint(pickup.x, pickup.z, 130, 380);
    const tripDist = distance2D(pickup.x, pickup.z, dropoff.x, dropoff.z);
    const baseReward = Math.round(110 + tripDist * 0.75);
    const timeBudget = Math.max(38, Math.round(tripDist / 5.2 + 24));

    this.active = {
      id: `taxi-fare-${this.seq}`,
      phase: 'pickup',
      targetX: pickup.x,
      targetZ: pickup.z,
      targetNameTr: pickup.nameTr,
      targetNameEn: pickup.nameEn,
      dropoffX: dropoff.x,
      dropoffZ: dropoff.z,
      dropoffNameTr: dropoff.nameTr,
      dropoffNameEn: dropoff.nameEn,
      rewardCash: baseReward,
      timeRemainingSec: timeBudget,
      maxTimeSec: timeBudget,
    };
    return this.active;
  }

  step(
    dt: number,
    playerX: number,
    playerZ: number,
    inVehicle: boolean,
    vehicleSpeedKph: number,
  ): MissionStepEvent {
    const m = this.ensureMission(playerX, playerZ);
    const dist = distance2D(playerX, playerZ, m.targetX, m.targetZ);

    if (m.phase === 'pickup') {
      if (inVehicle && dist <= PICKUP_RADIUS && vehicleSpeedKph <= 38) {
        m.phase = 'dropoff';
        m.targetX = m.dropoffX;
        m.targetZ = m.dropoffZ;
        m.targetNameTr = m.dropoffNameTr;
        m.targetNameEn = m.dropoffNameEn;
        return {
          type: 'picked_up',
          targetNameTr: m.dropoffNameTr,
          targetNameEn: m.dropoffNameEn,
        };
      }
      return { type: 'none' };
    }

    // Active passenger drop-off countdown
    m.timeRemainingSec = Math.max(0, m.timeRemainingSec - dt);
    if (inVehicle && dist <= DROPOFF_RADIUS && vehicleSpeedKph <= 48) {
      this.completedCount += 1;
      this.streak += 1;
      const timeBonus = Math.round(m.timeRemainingSec * 2.5);
      const streakBonus = Math.min(250, (this.streak - 1) * 40);
      const totalReward = m.rewardCash + timeBonus + streakBonus;
      const targetNameTr = m.targetNameTr;
      const targetNameEn = m.targetNameEn;
      this.active = null;
      this.ensureMission(playerX, playerZ);
      return {
        type: 'completed',
        rewardCash: totalReward,
        streak: this.streak,
        targetNameTr,
        targetNameEn,
      };
    }

    if (m.timeRemainingSec <= 0) {
      this.streak = 0;
      this.active = null;
      this.ensureMission(playerX, playerZ);
      return { type: 'expired' };
    }

    return { type: 'none' };
  }
}
