import { clamp, distance2D } from './math';
import type { BuildingSpatialGrid } from './world/collision';

export interface PoliceUnit {
  id: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  active: boolean;
}

export interface WantedStepResult {
  stars: number;
  heat: number;
  busted: boolean;
  bustedProgress: number; // 0..1
  inSanctuaryProtected: boolean;
  activePoliceCount: number;
}

const HEAT_PER_STAR = 25;
const MAX_STARS = 5;
const BUSTED_HOLD_SEC = 3.0;
const BUSTED_RADIUS = 7.5;

/**
 * Pure TypeScript M3 Wanted (1–5★) & Fictional Şehir Polisi patrol system.
 * - Reckless collisions/close-calls raise heat & stars ONLY outside Worship Sanctuary safe zones.
 * - Inside Worship Sanctuary safe zones, crime heat is locked and police back off respectfully.
 * - Staying away from police units cools down stars automatically.
 * - Being caught nearly stationary right beside a patrol car triggers BUSTED recovery.
 */
export class WantedSystem {
  private heat = 0;
  private stars = 0;
  private bustedTimer = 0;
  private evadeTimer = 0;
  private readonly units: PoliceUnit[] = [];

  constructor(maxUnits = 3) {
    for (let i = 0; i < maxUnits; i += 1) {
      this.units.push({
        id: i,
        x: 0,
        y: 0,
        z: 0,
        heading: 0,
        speed: 0,
        active: false,
      });
    }
  }

  getStars(): number {
    return this.stars;
  }

  getHeat(): number {
    return this.heat;
  }

  getUnits(): readonly PoliceUnit[] {
    return this.units;
  }

  /** Reports a reckless offense (ignored inside Worship Sanctuary safe zones). */
  reportOffense(amount: number, inSanctuary: boolean): boolean {
    if (inSanctuary || amount <= 0) return false;
    this.heat = clamp(this.heat + amount, 0, HEAT_PER_STAR * MAX_STARS);
    const nextStars = clamp(Math.floor(this.heat / HEAT_PER_STAR), 0, MAX_STARS);
    const increased = nextStars > this.stars;
    this.stars = nextStars;
    this.evadeTimer = 0;
    return increased;
  }

  clearWanted(): void {
    this.heat = 0;
    this.stars = 0;
    this.bustedTimer = 0;
    this.evadeTimer = 0;
    for (const u of this.units) {
      u.active = false;
      u.speed = 0;
    }
  }

  step(
    dt: number,
    playerX: number,
    playerZ: number,
    playerSpeedMps: number,
    inSanctuary: boolean,
    spatialGrid: BuildingSpatialGrid,
    sampleElev: (x: number, z: number) => number,
  ): WantedStepResult {
    const safeDt = Math.min(dt, 0.1);
    const desiredUnits = this.stars === 0 ? 0 : Math.min(this.units.length, Math.ceil(this.stars / 2));

    let nearestPoliceDist = Infinity;
    let activePoliceCount = 0;

    for (let i = 0; i < this.units.length; i += 1) {
      const u = this.units[i]!;
      if (i >= desiredUnits) {
        u.active = false;
        u.speed = 0;
        continue;
      }

      if (!u.active) {
        // Spawn patrol car at an approaching distance behind/flanking the player
        const angle = (i * 2.1 + 0.7) % (Math.PI * 2);
        const spawnDist = 52 + i * 16;
        const sx = playerX + Math.sin(angle) * spawnDist;
        const sz = playerZ + Math.cos(angle) * spawnDist;
        const resolved = spatialGrid.resolveCircle(sx, sz, 1.3);
        u.x = resolved.x;
        u.z = resolved.z;
        u.y = sampleElev(u.x, u.z);
        u.heading = Math.atan2(playerX - u.x, playerZ - u.z);
        u.speed = 8;
        u.active = true;
      }

      activePoliceCount += 1;
      const dist = distance2D(u.x, u.z, playerX, playerZ);
      if (dist < nearestPoliceDist) nearestPoliceDist = dist;

      // Respawn if left very far behind during chase
      if (dist > 180) {
        u.active = false;
        continue;
      }

      // Respect Worship Sanctuary perimeter: hold at safe standoff distance
      const targetStopDist = inSanctuary ? 28 : 4.2;
      const toPlayerAngle = Math.atan2(playerX - u.x, playerZ - u.z);
      let angleDiff = toPlayerAngle - u.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      u.heading += clamp(angleDiff, -2.6 * safeDt, 2.6 * safeDt);

      const maxChaseSpeed = 12.5 + this.stars * 2.1;
      const targetSpeed = dist > targetStopDist ? maxChaseSpeed : 0;
      u.speed += clamp(targetSpeed - u.speed, -16 * safeDt, 11 * safeDt);

      const nx = u.x + Math.sin(u.heading) * u.speed * safeDt;
      const nz = u.z + Math.cos(u.heading) * u.speed * safeDt;
      const resolved = spatialGrid.resolveCircle(nx, nz, 1.05);
      if (resolved.collided) {
        // Steer around corner obstacle cleanly
        u.heading += 1.6 * safeDt;
        u.speed *= 0.85;
      }
      u.x = resolved.x;
      u.z = resolved.z;
      u.y = sampleElev(u.x, u.z);
    }

    // Cooldown when out of police proximity or sheltered in a Sanctuary
    if (this.stars > 0) {
      if (inSanctuary || nearestPoliceDist > 58) {
        this.evadeTimer += safeDt;
        const coolRate = inSanctuary ? 8.5 : 4.2;
        if (this.evadeTimer >= 2.5) {
          this.heat = Math.max(0, this.heat - coolRate * safeDt);
          this.stars = clamp(Math.floor(this.heat / HEAT_PER_STAR), 0, MAX_STARS);
          if (this.stars === 0) this.clearWanted();
        }
      } else {
        this.evadeTimer = 0;
      }
    }

    // Busted detection: stationary/very slow right next to a patrol unit (never inside sanctuaries)
    let busted = false;
    if (
      this.stars > 0 &&
      !inSanctuary &&
      nearestPoliceDist <= BUSTED_RADIUS &&
      Math.abs(playerSpeedMps) < 2.2
    ) {
      this.bustedTimer += safeDt;
      if (this.bustedTimer >= BUSTED_HOLD_SEC) {
        busted = true;
        this.clearWanted();
      }
    } else {
      this.bustedTimer = Math.max(0, this.bustedTimer - safeDt * 1.5);
    }

    return {
      stars: this.stars,
      heat: Number(this.heat.toFixed(1)),
      busted,
      bustedProgress: clamp(this.bustedTimer / BUSTED_HOLD_SEC, 0, 1),
      inSanctuaryProtected: inSanctuary,
      activePoliceCount,
    };
  }
}
