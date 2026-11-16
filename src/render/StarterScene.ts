import * as THREE from 'three';
import { damp } from '../core/math';
import { getQualityPreset, type QualityTier } from '../core/quality';
import { createRng } from '../core/rng';

export interface RenderTelemetry {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  qualityTier: QualityTier;
}

function createCobblestoneTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#5c5852';
    ctx.fillRect(0, 0, 256, 256);
    const rng = createRng(20261116);
    const rows = 16;
    const cols = 8;
    const cellH = 256 / rows;
    const cellW = 256 / cols;
    for (let r = 0; r < rows; r += 1) {
      const offset = (r % 2) * (cellW * 0.5);
      for (let c = -1; c <= cols; c += 1) {
        const shade = rng.int(98, 138);
        const warm = rng.int(-6, 10);
        ctx.fillStyle = `rgb(${shade + warm}, ${shade}, ${shade - 8})`;
        ctx.fillRect(c * cellW + offset + 1.5, r * cellH + 1.5, cellW - 3, cellH - 3);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(22, 18);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createSunsetSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#101b38');
    grad.addColorStop(0.38, '#303b66');
    grad.addColorStop(0.68, '#b85c52');
    grad.addColorStop(0.86, '#f0944d');
    grad.addColorStop(1.0, '#f7cf86');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * M0 Starter Scene: Low-draw-call Istanbul sunset waterfront plaza (Eminönü/Sultanahmet mood).
 * Uses instancing and procedural textures so the bundle stays tiny and works 100% offline.
 */
export class StarterScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  private readonly sunLight: THREE.DirectionalLight;
  private readonly waterMesh: THREE.Mesh;
  private readonly avatarGroup: THREE.Group;
  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableTextures: THREE.Texture[] = [];

  private qualityTier: QualityTier;
  private avatarHeading = Math.PI / 2;
  private elapsed = 0;

  constructor(container: HTMLElement, initialQuality: QualityTier) {
    this.qualityTier = initialQuality;
    const preset = getQualityPreset(initialQuality);

    this.renderer = new THREE.WebGLRenderer({
      antialias: preset.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.domElement.id = 'game-canvas';
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyTex = createSunsetSkyTexture();
    this.disposableTextures.push(skyTex);
    this.scene.background = skyTex;
    this.scene.fog = new THREE.Fog('#c97a63', preset.fogNear, preset.fogFar);

    this.camera = new THREE.PerspectiveCamera(
      58,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.2,
      preset.drawDistance,
    );
    this.camera.position.set(0, 6.2, 16.5);

    // Lighting: 1 hemisphere + 1 single shadow-casting sun light (strict performance budget)
    const hemi = new THREE.HemisphereLight('#ffd2a6', '#283655', 0.85);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight('#ffb977', 2.1);
    this.sunLight.position.set(-48, 34, -65);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 180;
    this.sunLight.shadow.camera.left = -45;
    this.sunLight.shadow.camera.right = 45;
    this.sunLight.shadow.camera.top = 45;
    this.sunLight.shadow.camera.bottom = -45;
    this.sunLight.shadow.bias = -0.0008;
    this.scene.add(this.sunLight);

    // Coastal cobblestone plaza (Eminönü waterfront hint)
    const cobbleTex = createCobblestoneTexture();
    this.disposableTextures.push(cobbleTex);
    const plazaGeo = this.trackGeo(new THREE.BoxGeometry(100, 1.0, 74));
    const plazaMat = this.trackMat(
      new THREE.MeshStandardMaterial({ map: cobbleTex, roughness: 0.9, metalness: 0.04 }),
    );
    const plaza = new THREE.Mesh(plazaGeo, plazaMat);
    plaza.position.set(0, -0.5, 13);
    plaza.receiveShadow = true;
    this.scene.add(plaza);

    // Stone quay parapet separating plaza from Bosphorus/Golden Horn water
    const wallGeo = this.trackGeo(new THREE.BoxGeometry(100, 1.1, 1.1));
    const wallMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#c9b79c', roughness: 0.85 }),
    );
    const seaWall = new THREE.Mesh(wallGeo, wallMat);
    seaWall.position.set(0, 0.55, -24);
    seaWall.castShadow = true;
    seaWall.receiveShadow = true;
    this.scene.add(seaWall);

    // Bosphorus / Golden Horn stylized sunset water
    const waterGeo = this.trackGeo(new THREE.PlaneGeometry(420, 260, 24, 16));
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#1b3c59',
        roughness: 0.25,
        metalness: 0.35,
        emissive: '#331c1a',
        emissiveIntensity: 0.35,
      }),
    );
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.set(0, -0.35, -152);
    this.scene.add(this.waterMesh);

    // Glowing low sun disc over the horizon
    const sunDiscGeo = this.trackGeo(new THREE.CircleGeometry(14, 24));
    const sunDiscMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: '#ffd080', fog: false }),
    );
    const sunDisc = new THREE.Mesh(sunDiscGeo, sunDiscMat);
    sunDisc.position.set(-55, 22, -210);
    this.scene.add(sunDisc);

    // Instanced Istanbul skyline across the Golden Horn (single draw call!)
    this.buildInstancedSkyline();

    // Instanced bollards & warm streetlamps along the waterfront (2 draw calls total!)
    this.buildWaterfrontProps();

    // Parked fictional yellow Istanbul taxi prop (visual anchor)
    this.buildFictionalYellowTaxi(-10, 0, -14);

    // Playable 3rd-person starter avatar
    this.avatarGroup = this.buildStarterAvatar();
    this.avatarGroup.position.set(0, 0, 6);
    this.scene.add(this.avatarGroup);

    this.applyQuality(initialQuality);
    this.resize(container.clientWidth, container.clientHeight);
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.disposableGeometries.push(geo);
    return geo;
  }

  private trackMat<T extends THREE.Material>(mat: T): T {
    this.disposableMaterials.push(mat);
    return mat;
  }

  private buildInstancedSkyline(): void {
    const rng = createRng(3401);
    const count = 52;
    const boxGeo = this.trackGeo(new THREE.BoxGeometry(1, 1, 1));
    const mat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#3b3545', roughness: 0.85, metalness: 0.05 }),
    );
    const inst = new THREE.InstancedMesh(boxGeo, mat, count);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const palette = ['#4b4152', '#5b4b54', '#6b5352', '#3f3b4f', '#735a50'];

    for (let i = 0; i < count; i += 1) {
      const x = -140 + (i / count) * 280 + rng.range(-3, 3);
      const z = -128 - rng.range(0, 48);
      const w = rng.range(6, 15);
      const h = rng.range(9, 28);
      const d = rng.range(6, 14);
      dummy.position.set(x, h * 0.5 - 0.5, z);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
      color.set(rng.pick(palette));
      inst.setColorAt(i, color);
    }
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.scene.add(inst);

    // Stylized distant Galata-inspired tower silhouette across the water
    const towerMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#5c4d52', roughness: 0.85 }),
    );
    const bodyGeo = this.trackGeo(new THREE.CylinderGeometry(4.2, 4.8, 34, 12));
    const roofGeo = this.trackGeo(new THREE.ConeGeometry(4.8, 12, 12));
    const towerBody = new THREE.Mesh(bodyGeo, towerMat);
    towerBody.position.set(22, 17, -142);
    const towerRoof = new THREE.Mesh(roofGeo, towerMat);
    towerRoof.position.set(22, 40, -142);
    this.scene.add(towerBody, towerRoof);
  }

  private buildWaterfrontProps(): void {
    const lampCount = 8;
    const poleGeo = this.trackGeo(new THREE.CylinderGeometry(0.11, 0.14, 5.2, 8));
    const poleMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#262b36', roughness: 0.6, metalness: 0.5 }),
    );
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampCount);

    const bulbGeo = this.trackGeo(new THREE.SphereGeometry(0.32, 10, 8));
    const bulbMat = this.trackMat(
      new THREE.MeshBasicMaterial({ color: '#ffe0a3' }),
    );
    const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampCount);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < lampCount; i += 1) {
      const x = -35 + i * 10;
      dummy.position.set(x, 2.6, -22.2);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poles.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, 5.35, -22.2);
      dummy.updateMatrix();
      bulbs.setMatrixAt(i, dummy.matrix);
    }
    poles.instanceMatrix.needsUpdate = true;
    bulbs.instanceMatrix.needsUpdate = true;
    poles.castShadow = true;
    this.scene.add(poles, bulbs);
  }

  private buildFictionalYellowTaxi(x: number, y: number, z: number): void {
    const group = new THREE.Group();
    const bodyMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#f5b800', roughness: 0.35, metalness: 0.2 }),
    );
    const cabinMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.2, metalness: 0.5 }),
    );
    const signMat = this.trackMat(new THREE.MeshBasicMaterial({ color: '#fff3c4' }));

    const baseGeo = this.trackGeo(new THREE.BoxGeometry(4.2, 0.9, 1.9));
    const base = new THREE.Mesh(baseGeo, bodyMat);
    base.position.y = 0.65;
    base.castShadow = true;
    base.receiveShadow = true;

    const topGeo = this.trackGeo(new THREE.BoxGeometry(2.2, 0.72, 1.65));
    const top = new THREE.Mesh(topGeo, cabinMat);
    top.position.set(-0.2, 1.42, 0);
    top.castShadow = true;

    const signGeo = this.trackGeo(new THREE.BoxGeometry(0.55, 0.22, 0.8));
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(-0.2, 1.88, 0);

    group.add(base, top, sign);
    group.position.set(x, y, z);
    group.rotation.y = 0.32;
    this.scene.add(group);
  }

  private buildStarterAvatar(): THREE.Group {
    const group = new THREE.Group();
    const jacketMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#2b3d59', roughness: 0.75 }),
    );
    const headMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#e2b796', roughness: 0.7 }),
    );
    const accentMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#f08b4c', roughness: 0.6 }),
    );

    const torsoGeo = this.trackGeo(new THREE.CapsuleGeometry(0.34, 0.75, 6, 12));
    const torso = new THREE.Mesh(torsoGeo, jacketMat);
    torso.position.y = 0.95;
    torso.castShadow = true;

    const headGeo = this.trackGeo(new THREE.SphereGeometry(0.24, 12, 10));
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.68;
    head.castShadow = true;

    // Facing indicator collar
    const badgeGeo = this.trackGeo(new THREE.BoxGeometry(0.18, 0.14, 0.28));
    const badge = new THREE.Mesh(badgeGeo, accentMat);
    badge.position.set(0.32, 1.15, 0);

    group.add(torso, head, badge);
    return group;
  }

  applyQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    const preset = getQualityPreset(tier);
    const dpr = Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = preset.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sunLight.castShadow = preset.shadowsEnabled;
    if (preset.shadowsEnabled) {
      this.sunLight.shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
    this.camera.far = preset.drawDistance;
    this.camera.updateProjectionMatrix();
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = preset.fogNear;
      this.scene.fog.far = preset.fogFar;
    }
  }

  resize(width: number, height: number): void {
    const safeW = Math.max(1, Math.floor(width));
    const safeH = Math.max(1, Math.floor(height));
    this.camera.aspect = safeW / safeH;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(safeW, safeH, false);
  }

  updateVisuals(
    playerX: number,
    playerY: number,
    playerZ: number,
    velX: number,
    velZ: number,
    dt: number,
  ): void {
    this.elapsed += dt;
    // Gentle Bosphorus water shimmer
    this.waterMesh.position.y = -0.35 + Math.sin(this.elapsed * 1.4) * 0.06;

    // Position avatar (physics center is ~0.8m above feet)
    this.avatarGroup.position.set(playerX, Math.max(0, playerY - 0.8), playerZ);
    const speedSq = velX * velX + velZ * velZ;
    if (speedSq > 0.25) {
      const targetHeading = Math.atan2(-velZ, velX);
      const diff = Math.atan2(
        Math.sin(targetHeading - this.avatarHeading),
        Math.cos(targetHeading - this.avatarHeading),
      );
      this.avatarHeading += diff * Math.min(1, dt * 10);
      this.avatarGroup.rotation.y = this.avatarHeading;
    }

    // Smooth 3rd-person chase camera looking north over the Golden Horn sunset
    const camTargetX = playerX;
    const camTargetY = Math.max(0, playerY - 0.8) + 4.4;
    const camTargetZ = playerZ + 9.2;
    this.camera.position.x = damp(this.camera.position.x, camTargetX, 6, dt);
    this.camera.position.y = damp(this.camera.position.y, camTargetY, 6, dt);
    this.camera.position.z = damp(this.camera.position.z, camTargetZ, 6, dt);
    this.camera.lookAt(playerX, Math.max(0, playerY - 0.8) + 1.5, playerZ - 6);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  getTelemetry(): RenderTelemetry {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
      qualityTier: this.qualityTier,
    };
  }

  dispose(): void {
    for (const g of this.disposableGeometries) g.dispose();
    for (const m of this.disposableMaterials) m.dispose();
    for (const t of this.disposableTextures) t.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
