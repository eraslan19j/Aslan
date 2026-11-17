import * as THREE from 'three';
import type { PlayerVehicleState } from '../core/vehicle';

interface SmokeParticle {
  active: boolean;
  age: number;
  maxAge: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  baseScale: number;
  rotY: number;
}

interface SparkParticle {
  active: boolean;
  age: number;
  maxAge: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

const MAX_SKID_MARKS = 440;
const MAX_SMOKE = 150;
const MAX_SPARKS = 44;

function createSmokeTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(240, 244, 248, 0.85)');
    grad.addColorStop(0.42, 'rgba(222, 228, 236, 0.48)');
    grad.addColorStop(0.75, 'rgba(205, 212, 222, 0.16)');
    grad.addColorStop(1, 'rgba(205, 212, 222, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Zero-GC pooled 3D driving VFX system (only 3 total draw calls!):
 * 1. Persistent asphalt rubber skidmarks laid directly under sliding/spinning tires
 * 2. Volumetric drifting tire smoke puffs
 * 3. Wall/traffic impact sparks
 */
export class VehicleEffectsSystem {
  readonly group = new THREE.Group();

  private readonly skidMesh: THREE.InstancedMesh;
  private readonly smokeMesh: THREE.InstancedMesh;
  private readonly sparkMesh: THREE.InstancedMesh;
  private readonly smokeTex: THREE.CanvasTexture;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  private readonly dummy = new THREE.Object3D();

  private skidCursor = 0;
  private skidActiveCount = 0;
  private readonly prevWheelValid = [false, false, false, false];
  private readonly prevWheelX = new Float64Array(4);
  private readonly prevWheelY = new Float64Array(4);
  private readonly prevWheelZ = new Float64Array(4);

  private smokeCursor = 0;
  private smokeSpawnAccum = 0;
  private readonly smokePool: SmokeParticle[] = [];

  private sparkCursor = 0;
  private readonly sparkPool: SparkParticle[] = [];

  private rngState = 0x9e3779b9;

  constructor() {
    // 1. Asphalt Skidmarks (1 draw call)
    const skidGeo = new THREE.PlaneGeometry(0.27, 1.0);
    skidGeo.rotateX(-Math.PI / 2);
    const skidMat = new THREE.MeshBasicMaterial({
      color: 0x0f1217,
      transparent: true,
      opacity: 0.56,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.skidMesh = new THREE.InstancedMesh(skidGeo, skidMat, MAX_SKID_MARKS);
    this.skidMesh.frustumCulled = false;
    this.skidMesh.count = 0;
    this.skidMesh.renderOrder = 1;
    this.group.add(this.skidMesh);
    this.geometries.push(skidGeo);
    this.materials.push(skidMat);

    // 2. Volumetric Tire Drift Smoke (1 draw call)
    this.smokeTex = createSmokeTexture();
    const smokeGeo = new THREE.PlaneGeometry(1.0, 1.0);
    const smokeMat = new THREE.MeshBasicMaterial({
      map: this.smokeTex,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, MAX_SMOKE);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.count = 0;
    this.smokeMesh.renderOrder = 3;
    this.group.add(this.smokeMesh);
    this.geometries.push(smokeGeo);
    this.materials.push(smokeMat);

    for (let i = 0; i < MAX_SMOKE; i += 1) {
      this.smokePool.push({
        active: false,
        age: 0,
        maxAge: 1,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        baseScale: 0.6,
        rotY: 0,
      });
    }

    // 3. Collision Sparks (1 draw call)
    const sparkGeo = new THREE.BoxGeometry(0.06, 0.06, 0.36);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffb703,
      transparent: true,
      opacity: 0.95,
    });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.count = 0;
    this.sparkMesh.renderOrder = 4;
    this.group.add(this.sparkMesh);
    this.geometries.push(sparkGeo);
    this.materials.push(sparkMat);

    for (let i = 0; i < MAX_SPARKS; i += 1) {
      this.sparkPool.push({
        active: false,
        age: 0,
        maxAge: 0.35,
        x: 0,
        y: -999,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
      });
    }
  }

  private fastRand(): number {
    let x = this.rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngState = x >>> 0;
    return (this.rngState & 0xffff) / 0xffff;
  }

  /** Emits a crisp burst of metal collision sparks at world position (x, y, z). */
  emitImpactSparks(x: number, y: number, z: number, count = 12): void {
    for (let i = 0; i < count; i += 1) {
      const p = this.sparkPool[this.sparkCursor]!;
      this.sparkCursor = (this.sparkCursor + 1) % MAX_SPARKS;
      const angle = this.fastRand() * Math.PI * 2;
      const speed = 3.5 + this.fastRand() * 8.0;
      p.active = true;
      p.age = 0;
      p.maxAge = 0.24 + this.fastRand() * 0.24;
      p.x = x + (this.fastRand() - 0.5) * 0.8;
      p.y = y + 0.55 + this.fastRand() * 0.35;
      p.z = z + (this.fastRand() - 0.5) * 0.8;
      p.vx = Math.cos(angle) * speed;
      p.vy = 2.4 + this.fastRand() * 4.5;
      p.vz = Math.sin(angle) * speed;
    }
  }

  /** Clears all skidmarks and active particles (used on region switches or teleport). */
  reset(): void {
    this.skidCursor = 0;
    this.skidActiveCount = 0;
    this.skidMesh.count = 0;
    for (let i = 0; i < 4; i += 1) this.prevWheelValid[i] = false;
    for (let i = 0; i < MAX_SMOKE; i += 1) {
      this.smokePool[i]!.active = false;
    }
    this.smokeMesh.count = 0;
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      this.sparkPool[i]!.active = false;
    }
    this.sparkMesh.count = 0;
  }

  update(
    vehicle: PlayerVehicleState,
    cameraPos: THREE.Vector3,
    dt: number,
    inVehicle: boolean,
  ): void {
    const safeDt = Math.min(0.05, Math.max(0.001, dt));
    const dyn = vehicle.dyn;

    let skidDirty = false;

    // 1. Lay asphalt skidmarks & emit tire smoke from sliding/spinning wheels
    this.smokeSpawnAccum += safeDt;
    const allowSmokeSpawn = this.smokeSpawnAccum >= 0.028;
    if (allowSmokeSpawn) this.smokeSpawnAccum = 0;

    if (inVehicle) {
      for (let i = 0; i < 4; i += 1) {
        const w = dyn.wheels[i]!;
        const skidding = w.skidIntensity > 0.24;

        if (skidding) {
          const wx = w.worldX;
          const wy = w.worldY + 0.295; // Just above road mesh surface (road offset +0.26)
          const wz = w.worldZ;

          if (this.prevWheelValid[i]) {
            const dx = wx - this.prevWheelX[i]!;
            const dz = wz - this.prevWheelZ[i]!;
            const segLen = Math.hypot(dx, dz);

            if (segLen >= 0.22 && segLen <= 3.5) {
              const midX = (wx + this.prevWheelX[i]!) * 0.5;
              const midY = (wy + this.prevWheelY[i]!) * 0.5;
              const midZ = (wz + this.prevWheelZ[i]!) * 0.5;
              const yaw = Math.atan2(dx, dz);

              this.dummy.position.set(midX, midY, midZ);
              this.dummy.rotation.set(0, yaw, 0);
              this.dummy.scale.set(1.0 + w.skidIntensity * 0.25, 1, segLen + 0.08);
              this.dummy.updateMatrix();
              this.skidMesh.setMatrixAt(this.skidCursor, this.dummy.matrix);
              this.skidCursor = (this.skidCursor + 1) % MAX_SKID_MARKS;
              if (this.skidActiveCount < MAX_SKID_MARKS) this.skidActiveCount += 1;
              skidDirty = true;

              this.prevWheelX[i] = wx;
              this.prevWheelY[i] = wy;
              this.prevWheelZ[i] = wz;
            } else if (segLen > 3.5) {
              this.prevWheelX[i] = wx;
              this.prevWheelY[i] = wy;
              this.prevWheelZ[i] = wz;
            }
          } else {
            this.prevWheelValid[i] = true;
            this.prevWheelX[i] = wx;
            this.prevWheelY[i] = wy;
            this.prevWheelZ[i] = wz;
          }

          // Spawn billowing tire drift smoke
          if (allowSmokeSpawn && w.skidIntensity > 0.32) {
            const p = this.smokePool[this.smokeCursor]!;
            this.smokeCursor = (this.smokeCursor + 1) % MAX_SMOKE;
            p.active = true;
            p.age = 0;
            p.maxAge = 0.62 + this.fastRand() * 0.45;
            p.x = wx + (this.fastRand() - 0.5) * 0.22;
            p.y = wy + 0.14;
            p.z = wz + (this.fastRand() - 0.5) * 0.22;
            p.vx = -dyn.vx * 0.14 + (this.fastRand() - 0.5) * 1.4;
            p.vy = 0.75 + this.fastRand() * 0.95;
            p.vz = -dyn.vz * 0.14 + (this.fastRand() - 0.5) * 1.4;
            p.baseScale = 0.45 + w.skidIntensity * 0.45;
            p.rotY = this.fastRand() * Math.PI * 2;
          }
        } else {
          this.prevWheelValid[i] = false;
        }
      }
    } else {
      for (let i = 0; i < 4; i += 1) this.prevWheelValid[i] = false;
    }

    if (skidDirty) {
      this.skidMesh.count = this.skidActiveCount;
      this.skidMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Step billowing smoke billboards facing camera (densely packed: 0 draw calls when idle!)
    let activeSmoke = 0;
    for (let i = 0; i < MAX_SMOKE; i += 1) {
      const p = this.smokePool[i]!;
      if (!p.active) continue;
      p.age += safeDt;
      if (p.age >= p.maxAge) {
        p.active = false;
        continue;
      }
      const t = p.age / p.maxAge;
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.z += p.vz * safeDt;
      p.vx *= 0.95;
      p.vz *= 0.95;

      // Expand early, taper gently near end so fade-out feels soft without alpha-per-instance cost
      const envelope = t < 0.2 ? t / 0.2 : Math.max(0.01, 1 - (t - 0.2) * 0.75);
      const s = p.baseScale * (0.7 + t * 2.1) * envelope;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.lookAt(cameraPos);
      this.dummy.scale.set(s, s, s);
      this.dummy.updateMatrix();
      this.smokeMesh.setMatrixAt(activeSmoke, this.dummy.matrix);
      activeSmoke += 1;
    }
    this.smokeMesh.count = activeSmoke;
    if (activeSmoke > 0) {
      this.smokeMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Step impact sparks with gravity (densely packed: 0 draw calls when idle!)
    let activeSparks = 0;
    for (let i = 0; i < MAX_SPARKS; i += 1) {
      const p = this.sparkPool[i]!;
      if (!p.active) continue;
      p.age += safeDt;
      if (p.age >= p.maxAge) {
        p.active = false;
        continue;
      }
      p.vy -= 18 * safeDt;
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;
      p.z += p.vz * safeDt;
      const scale = Math.max(0.05, 1 - p.age / p.maxAge);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(0, Math.atan2(p.vx, p.vz), 0);
      this.dummy.scale.set(scale, scale, scale * 1.4);
      this.dummy.updateMatrix();
      this.sparkMesh.setMatrixAt(activeSparks, this.dummy.matrix);
      activeSparks += 1;
    }
    this.sparkMesh.count = activeSparks;
    if (activeSparks > 0) {
      this.sparkMesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.smokeTex.dispose();
  }
}
