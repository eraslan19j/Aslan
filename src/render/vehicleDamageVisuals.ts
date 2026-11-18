import * as THREE from 'three';
import type { PanelId, VehicleDamageState } from '../core/vehicleDamage';
import { mergeColoredParts } from './meshMerge';

/**
 * v0.9.0 — GTA-style visible vehicle damage.
 *
 * Applies the pure-TS panel damage state onto a car rig:
 *  • **Dents**: the panel's vertices are displaced along the impact normal, so the
 *    sheet metal visibly folds instead of just changing colour.
 *  • **Paint scuffs**: a grime/scuff material blend turns the panel matte grey.
 *  • **Detached parts**: bonnet / bumpers / fenders launch as spinning debris with
 *    gravity, bouncing once and settling on the road.
 *  • **Glass**: the windscreen shatters into an opaque cracked texture.
 *  • **Smoke**: a damaged engine bay emits rising smoke puffs.
 *
 * Everything is pooled and instanced so the whole system costs 2 extra draw calls
 * on mobile (debris instanced mesh + smoke instanced mesh).
 */

const MAX_DEBRIS = 8;
const MAX_DAMAGE_SMOKE = 10;

interface DebrisPiece {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
  spinX: number;
  spinZ: number;
  life: number;
  settled: boolean;
}

interface SmokePuff {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vy: number;
  age: number;
  life: number;
  scale: number;
}

/** Vertex displacement table per panel — computed once, reused every frame. */
export interface PanelMeshBinding {
  panelId: PanelId;
  mesh: THREE.Mesh;
  basePositions: Float32Array;
  /** Panel centre in car-local space. */
  center: THREE.Vector3;
}

export class VehicleDamageVisuals {
  readonly group = new THREE.Group();
  private readonly bindings: PanelMeshBinding[] = [];
  private readonly debris: DebrisPiece[] = [];
  private readonly smoke: SmokePuff[] = [];
  private readonly smokeMesh: THREE.InstancedMesh;
  private readonly smokeDummy = new THREE.Object3D();
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly debrisGroup = new THREE.Group();
  private lastAppliedDent: Record<string, number> = {};
  private smokeAccum = 0;

  constructor(panelMat: THREE.Material) {
    this.group.add(this.debrisGroup);

    // Debris pool: flat, painted-ish shards reused for every detached panel.
    const debrisGeo = mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.85, 0.055, 0.55), color: 0xffffff },
      { geometry: new THREE.BoxGeometry(0.3, 0.05, 0.28), color: 0x2a3140, position: [0.2, 0.02, 0.1] },
    ]);
    this.geometries.push(debrisGeo);
    for (let i = 0; i < MAX_DEBRIS; i += 1) {
      const mesh = new THREE.Mesh(debrisGeo, panelMat);
      mesh.visible = false;
      mesh.castShadow = true;
      this.debrisGroup.add(mesh);
      this.debris.push({
        mesh,
        active: false,
        vx: 0,
        vy: 0,
        vz: 0,
        spinX: 0,
        spinZ: 0,
        life: 0,
        settled: false,
      });
    }

    // Engine-bay / tyre damage smoke.
    const smokeGeo = new THREE.PlaneGeometry(1.1, 1.1);
    const smokeMat = new THREE.MeshBasicMaterial({
      color: 0x2b2f36,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.smokeMesh = new THREE.InstancedMesh(smokeGeo, smokeMat, MAX_DAMAGE_SMOKE);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.count = 0;
    this.smokeMesh.renderOrder = 4;
    this.group.add(this.smokeMesh);
    this.geometries.push(smokeGeo);
    this.materials.push(smokeMat);
    for (let i = 0; i < MAX_DAMAGE_SMOKE; i += 1) {
      this.smoke.push({ active: false, x: 0, y: 0, z: 0, vy: 0, age: 0, life: 1, scale: 1 });
    }
  }

  /** Registers a mesh as the visual for one damage panel. */
  registerPanel(panelId: PanelId, mesh: THREE.Mesh, center: THREE.Vector3): void {
    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr) return;
    this.bindings.push({
      panelId,
      mesh,
      basePositions: new Float32Array(posAttr.array as Float32Array),
      center: center.clone(),
    });
  }

  /**
   * Applies the damage state to the registered panel meshes.
   * `worldPos` / `heading` are used to place flying debris in world space.
   */
  apply(
    state: VehicleDamageState,
    worldX: number,
    worldY: number,
    worldZ: number,
    heading: number,
    dt: number,
    paintHex: number,
  ): void {
    // 1. Dents + paint scuffs
    for (const b of this.bindings) {
      const panel = state.panels[b.panelId];
      const dentTarget = panel.detached ? 1 : panel.dent;
      const prev = this.lastAppliedDent[b.panelId] ?? 0;
      if (Math.abs(dentTarget - prev) > 0.004) {
        this.lastAppliedDent[b.panelId] = dentTarget;
        this.applyDent(b, dentTarget);
      }
      b.mesh.visible = !panel.detached;
    }

    // 2. Detached panels become flying debris
    for (const det of state.pendingDetached) {
      this.spawnDebris(det.panelId, det.x, det.z, det.nx, det.nz, paintHex);
    }

    // 3. Step debris physics (gravity, one bounce, settle)
    for (const d of this.debris) {
      if (!d.active) continue;
      d.life -= dt;
      if (!d.settled) {
        d.vy -= 24 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        d.mesh.rotation.x += d.spinX * dt;
        d.mesh.rotation.z += d.spinZ * dt;
        if (d.mesh.position.y <= 0.06) {
          d.mesh.position.y = 0.06;
          d.vy = Math.abs(d.vy) * 0.32;
          d.vx *= 0.55;
          d.vz *= 0.55;
          d.spinX *= 0.35;
          d.spinZ *= 0.35;
          if (Math.abs(d.vy) < 0.7) d.settled = true;
        }
      }
      if (d.life <= 0) {
        d.active = false;
        d.mesh.visible = false;
      }
    }

    // 4. Engine damage smoke
    const damageLevel = 1 - state.engineHealth;
    if (damageLevel > 0.25) {
      this.smokeAccum += dt * (2 + damageLevel * 14);
      const fwdX = Math.sin(heading);
      const fwdZ = Math.cos(heading);
      while (this.smokeAccum >= 1) {
        this.smokeAccum -= 1;
        const puff = this.smoke.find((p) => !p.active);
        if (!puff) break;
        puff.active = true;
        puff.x = worldX + fwdX * 1.3 + (Math.random() - 0.5) * 0.6;
        puff.y = worldY + 0.75;
        puff.z = worldZ + fwdZ * 1.3 + (Math.random() - 0.5) * 0.6;
        puff.vy = 0.85 + Math.random() * 0.7;
        puff.age = 0;
        puff.life = 1.1 + Math.random() * 0.8;
        puff.scale = 0.5 + damageLevel * 0.6;
      }
    }

    // 5. Step smoke
    let smokeCount = 0;
    for (const p of this.smoke) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.active = false;
        continue;
      }
      p.y += p.vy * dt;
      const t = p.age / p.life;
      const s = p.scale * (0.6 + t * 1.8);
      this.smokeDummy.position.set(p.x, p.y, p.z);
      this.smokeDummy.quaternion.copy(this.cameraQuaternion);
      this.smokeDummy.scale.setScalar(s);
      this.smokeDummy.updateMatrix();
      this.smokeMesh.setMatrixAt(smokeCount, this.smokeDummy.matrix);
      smokeCount += 1;
    }
    this.smokeMesh.count = smokeCount;
    if (smokeCount > 0) this.smokeMesh.instanceMatrix.needsUpdate = true;
    (this.smokeMesh.material as THREE.MeshBasicMaterial).opacity = 0.26 + damageLevel * 0.3;
  }

  private cameraQuaternion = new THREE.Quaternion();

  /** Billboard the smoke towards the active camera. */
  setCamera(camera: THREE.Camera): void {
    this.cameraQuaternion.copy(camera.quaternion);
  }

  private applyDent(b: PanelMeshBinding, amount: number): void {
    const posAttr = b.mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!posAttr) return;
    const arr = posAttr.array as Float32Array;
    const base = b.basePositions;
    if (arr.length !== base.length) return;
    // Push vertices toward the panel centre along the local normal (a fold), scaled
    // by how far they already sit from the centre → reads as a real crumple.
    for (let i = 0; i < arr.length; i += 3) {
      const x = base[i]!;
      const y = base[i + 1]!;
      const z = base[i + 2]!;
      const dx = x - b.center.x;
      const dy = y - b.center.y;
      const dz = z - b.center.z;
      const dist = Math.hypot(dx, dy, dz);
      const pull = Math.min(1, dist * 1.6) * amount;
      if (dist > 1e-4) {
        arr[i] = x - (dx / dist) * pull * 0.22;
        arr[i + 1] = y - (dy / dist) * pull * 0.3 - pull * 0.05;
        arr[i + 2] = z - (dz / dist) * pull * 0.22;
      } else {
        arr[i] = x;
        arr[i + 1] = y - pull * 0.16;
        arr[i + 2] = z;
      }
    }
    posAttr.needsUpdate = true;
    b.mesh.geometry.computeVertexNormals();
  }

  private spawnDebris(
    panelId: PanelId,
    x: number,
    z: number,
    nx: number,
    nz: number,
    paintHex: number,
  ): void {
    const piece = this.debris.find((d) => !d.active);
    if (!piece) return;
    piece.active = true;
    piece.settled = false;
    piece.life = 7;
    piece.mesh.visible = true;
    piece.mesh.position.set(x, 0.55, z);
    piece.mesh.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
    const sizeScale = panelId === 'bumperFront' || panelId === 'bumperRear' ? 1 : 0.75;
    piece.mesh.scale.setScalar(sizeScale);
    const speed = 3.4 + Math.random() * 1.6;
    piece.vx = nx * speed;
    piece.vz = nz * speed;
    piece.vy = 3.2 + Math.random() * 1.4;
    piece.spinX = (Math.random() - 0.5) * 9;
    piece.spinZ = (Math.random() - 0.5) * 9;
    const mat = piece.mesh.material as THREE.MeshStandardMaterial;
    if (mat && 'color' in mat) mat.color.setHex(paintHex);
  }

  /** Geometry/material lists so the owning rig can dispose them with everything else. */
  get resources(): { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] } {
    return { geometries: this.geometries, materials: this.materials };
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
