import * as THREE from 'three';
import { damp } from '../core/math';
import { getQualityPreset, type QualityTier } from '../core/quality';
import { createRng } from '../core/rng';
import { BuildingSpatialGrid } from '../core/world/collision';
import { sampleTerrainElevation } from '../core/world/terrain';
import { planTileStreaming } from '../core/world/tileStreamer';
import type {
  LandmarkPin,
  RegionManifest,
  RegionTileData,
  TerrainGrid,
} from '../core/world/types';
import { buildTileMeshes, type BuiltTileGroup } from './tileMeshBuilder';

export interface WorldTelemetry {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  qualityTier: QualityTier;
  loadedTiles: number;
  activeBuildings: number;
}

function createFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Base neutral white plaster so vertex colors tint authentically
    ctx.fillStyle = '#eceae4';
    ctx.fillRect(0, 0, 256, 256);

    // Subtle stone course lines
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let y = 0; y < 256; y += 32) {
      ctx.fillRect(0, y, 256, 2);
    }

    // Window grid (top-left corner kept clean at (0..18, 0..18) for roof UVs)
    const rng = createRng(34011);
    const cols = 4;
    const rows = 4;
    const cellW = 256 / cols;
    const cellH = 256 / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const wx = c * cellW + 14;
        const wy = r * cellH + 14;
        const ww = cellW - 28;
        const wh = cellH - 26;
        // Frame
        ctx.fillStyle = '#5c534a';
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        // Warm sunset reflection or cozy interior glow
        const lit = rng.next() < 0.38;
        ctx.fillStyle = lit ? '#f6d28b' : '#4a5568';
        ctx.fillRect(wx, wy, ww, wh);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSunsetSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#132245');
    grad.addColorStop(0.36, '#394875');
    grad.addColorStop(0.66, '#c16655');
    grad.addColorStop(0.84, '#f09a52');
    grad.addColorStop(1.0, '#f8d48c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * M1 Real Istanbul 300m Streaming World Renderer (Fatih: Sultanahmet - Eminönü).
 * Loads offline OSM + Copernicus DEM tiles dynamically around the player while staying
 * well under the 150 Normal / 90 Lite draw-call budget.
 */
export class FatihWorldScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly spatialGrid = new BuildingSpatialGrid(28);

  private readonly manifest: RegionManifest;
  private readonly terrain: TerrainGrid;
  private readonly regionBaseUrl: string;
  private readonly availableTileSet: Set<string>;
  private readonly loadedTiles = new Map<string, BuiltTileGroup>();
  private readonly inflightTiles = new Set<string>();
  private readonly tilesRoot = new THREE.Group();

  private readonly sunLight: THREE.DirectionalLight;
  private readonly waterMesh: THREE.Mesh;
  private readonly avatarGroup: THREE.Group;

  private readonly buildingMat: THREE.MeshStandardMaterial;
  private readonly roadMat: THREE.MeshStandardMaterial;
  private readonly areaMat: THREE.MeshStandardMaterial;

  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableTextures: THREE.Texture[] = [];

  private qualityTier: QualityTier;
  private avatarHeading = Math.PI / 2;
  private cameraYaw = 0; // 0 = camera behind player looking North (-Z)
  private elapsed = 0;
  private activeBuildings = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    manifest: RegionManifest,
    terrain: TerrainGrid,
    regionBaseUrl: string,
    initialQuality: QualityTier,
  ) {
    this.manifest = manifest;
    this.terrain = terrain;
    this.regionBaseUrl = regionBaseUrl;
    this.availableTileSet = new Set(manifest.availableTiles);
    this.qualityTier = initialQuality;

    const preset = getQualityPreset(initialQuality);

    this.renderer = new THREE.WebGLRenderer({
      antialias: preset.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.domElement.id = 'game-canvas';
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    const skyTex = createSunsetSkyTexture();
    this.disposableTextures.push(skyTex);
    this.scene.background = skyTex;
    this.scene.fog = new THREE.Fog('#cf866a', preset.fogNear, preset.fogFar);

    this.camera = new THREE.PerspectiveCamera(
      58,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.25,
      preset.drawDistance + 120,
    );

    // 1 hemisphere + 1 single sun directional shadow light
    const hemi = new THREE.HemisphereLight('#ffe0bc', '#34415e', 0.95);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight('#ffc485', 2.0);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 260;
    this.sunLight.shadow.camera.left = -85;
    this.sunLight.shadow.camera.right = 85;
    this.sunLight.shadow.camera.top = 85;
    this.sunLight.shadow.camera.bottom = -85;
    this.sunLight.shadow.bias = -0.001;
    this.scene.add(this.sunLight, this.sunLight.target);

    // Shared batched tile materials (zero per-building material allocation!)
    const facadeTex = createFacadeTexture();
    this.disposableTextures.push(facadeTex);

    this.buildingMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        map: facadeTex,
        vertexColors: true,
        roughness: 0.86,
        metalness: 0.05,
      }),
    );
    this.roadMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.92,
        metalness: 0.02,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
    );
    this.areaMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0.0,
        polygonOffset: true,
        polygonOffsetFactor: -0.5,
      }),
    );

    // 1. Copernicus DEM GLO-30 continuous terrain surface (1 draw call)
    this.buildTerrainSurface();

    // 2. Surrounding Bosphorus / Golden Horn / Marmara sea plane (1 draw call)
    const waterGeo = this.trackGeo(new THREE.PlaneGeometry(5200, 5200, 12, 12));
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#1b3e5e',
        roughness: 0.25,
        metalness: 0.32,
        emissive: '#331c1a',
        emissiveIntensity: 0.3,
      }),
    );
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.y = 0.25;
    this.scene.add(this.waterMesh);

    // 3. Procedural iconic landmarks placed at their real OSM coordinates
    this.buildLandmarks();

    // 4. Parked fictional yellow Istanbul taxi near Sultanahmet Square
    this.buildFictionalYellowTaxi(manifest.spawn.x + 8, manifest.spawn.z - 6);

    // 5. Dynamic 300m streamed tile container
    this.scene.add(this.tilesRoot);

    // 6. Playable 3rd-person avatar
    this.avatarGroup = this.buildAvatar();
    const spawnY = sampleTerrainElevation(terrain, manifest.spawn.x, manifest.spawn.z);
    this.avatarGroup.position.set(manifest.spawn.x, spawnY, manifest.spawn.z);
    this.scene.add(this.avatarGroup);
    this.camera.position.set(manifest.spawn.x, spawnY + 6, manifest.spawn.z + 12);

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

  private buildTerrainSurface(): void {
    const { minX, maxX, minZ, maxZ, cols, rows, elevDecimeters } = this.terrain;
    const width = maxX - minX;
    const depth = maxZ - minZ;

    const geo = this.trackGeo(new THREE.PlaneGeometry(width, depth, cols - 1, rows - 1));
    geo.rotateX(-Math.PI / 2);
    const posAttr = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < posAttr.count; i += 1) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const elev = (elevDecimeters[r * cols + c] ?? 0) * 0.1;
      posAttr.setY(i, elev);
      if (elev < 0.8) {
        color.set('#3f4852'); // wet quay / shoreline
      } else if (elev < 14) {
        color.set('#7a7368'); // lower Eminönü stone
      } else {
        color.set('#8d8374'); // historic Sultanahmet hill limestone ground
      }
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = this.trackMat(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0.02,
      }),
    );
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
  }

  private buildLandmarks(): void {
    const domeMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#7d8792', roughness: 0.55, metalness: 0.2 }),
    );
    const limestoneMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#e2d4bc', roughness: 0.85 }),
    );
    const ochreMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#cfa17e', roughness: 0.85 }),
    );
    const ferryWhiteMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#f3f4f6', roughness: 0.45 }),
    );
    const ferryStripeMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#f5b800', roughness: 0.4 }),
    );

    const placeMosqueSilhouette = (lm: LandmarkPin, minarets: number, warmWall: boolean): void => {
      const group = new THREE.Group();
      const baseY = sampleTerrainElevation(this.terrain, lm.x, lm.z);
      group.position.set(lm.x, baseY, lm.z);

      const wallMat = warmWall ? ochreMat : limestoneMat;
      const baseGeo = this.trackGeo(new THREE.BoxGeometry(52, 18, 52));
      const base = new THREE.Mesh(baseGeo, wallMat);
      base.position.y = 8;
      group.add(base);

      const mainDomeGeo = this.trackGeo(
        new THREE.SphereGeometry(16.5, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
      );
      const mainDome = new THREE.Mesh(mainDomeGeo, domeMat);
      mainDome.position.y = 17;
      group.add(mainDome);

      const minaretGeo = this.trackGeo(new THREE.CylinderGeometry(1.0, 1.35, 42, 8));
      const spireGeo = this.trackGeo(new THREE.ConeGeometry(1.15, 7, 8));
      const offsets: [number, number][] =
        minarets >= 6
          ? [
              [-28, -28],
              [28, -28],
              [-28, 28],
              [28, 28],
              [-32, 0],
              [32, 0],
            ]
          : [
              [-27, -27],
              [27, -27],
              [-27, 27],
              [27, 27],
            ];
      for (const [ox, oz] of offsets) {
        const shaft = new THREE.Mesh(minaretGeo, limestoneMat);
        shaft.position.set(ox, 20, oz);
        const cone = new THREE.Mesh(spireGeo, domeMat);
        cone.position.set(ox, 44.5, oz);
        group.add(shaft, cone);
      }

      this.scene.add(group);
    };

    for (const lm of this.manifest.landmarks) {
      if (lm.id === 'ayasofya') {
        placeMosqueSilhouette(lm, 4, true);
      } else if (lm.id === 'sultanahmet-camii') {
        placeMosqueSilhouette(lm, 6, false);
      } else if (lm.id === 'hipodrom') {
        // Dikilitaş (Obelisk of Theodosius) right in Sultanahmet Square
        const y = sampleTerrainElevation(this.terrain, lm.x, lm.z);
        const pedGeo = this.trackGeo(new THREE.BoxGeometry(3.8, 4.5, 3.8));
        const obeliskGeo = this.trackGeo(new THREE.CylinderGeometry(0.65, 1.35, 19, 4));
        const g = new THREE.Group();
        g.position.set(lm.x + 12, y, lm.z - 14);
        const ped = new THREE.Mesh(pedGeo, limestoneMat);
        ped.position.y = 2.25;
        const shaft = new THREE.Mesh(obeliskGeo, ochreMat);
        shaft.position.y = 14;
        shaft.rotation.y = Math.PI / 4;
        g.add(ped, shaft);
        this.scene.add(g);
      } else if (lm.id === 'eminonu-iskele') {
        // Stylized Istanbul vapur (ferry) near Eminönü waterfront
        const g = new THREE.Group();
        g.position.set(lm.x, 0.5, lm.z - 42);
        const hull = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(24, 3.2, 7.5)), ferryWhiteMat);
        hull.position.y = 1.6;
        const deck = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(16, 2.8, 6.2)), ferryWhiteMat);
        deck.position.y = 4.5;
        const funnel = new THREE.Mesh(
          this.trackGeo(new THREE.CylinderGeometry(0.9, 1.0, 4.2, 10)),
          ferryStripeMat,
        );
        funnel.position.set(-1, 7.2, 0);
        g.add(hull, deck, funnel);
        this.scene.add(g);
      }
    }
  }

  private buildFictionalYellowTaxi(x: number, z: number): void {
    const y = sampleTerrainElevation(this.terrain, x, z);
    const group = new THREE.Group();
    const bodyMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#f5b800', roughness: 0.35, metalness: 0.2 }),
    );
    const cabinMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.2, metalness: 0.5 }),
    );
    const signMat = this.trackMat(new THREE.MeshBasicMaterial({ color: '#fff3c4' }));

    const base = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(4.2, 0.9, 1.9)), bodyMat);
    base.position.y = 0.65;
    base.castShadow = true;

    const top = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(2.2, 0.72, 1.65)), cabinMat);
    top.position.set(-0.2, 1.42, 0);

    const sign = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.55, 0.22, 0.8)), signMat);
    sign.position.set(-0.2, 1.88, 0);

    group.add(base, top, sign);
    group.position.set(x, y, z);
    group.rotation.y = 0.45;
    this.scene.add(group);
  }

  private buildAvatar(): THREE.Group {
    const group = new THREE.Group();
    const jacketMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#273b59', roughness: 0.75 }),
    );
    const headMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#e2b796', roughness: 0.7 }),
    );
    const accentMat = this.trackMat(
      new THREE.MeshStandardMaterial({ color: '#f08b4c', roughness: 0.6 }),
    );

    const torso = new THREE.Mesh(this.trackGeo(new THREE.CapsuleGeometry(0.34, 0.75, 6, 12)), jacketMat);
    torso.position.y = 0.95;
    torso.castShadow = true;

    const head = new THREE.Mesh(this.trackGeo(new THREE.SphereGeometry(0.24, 12, 10)), headMat);
    head.position.y = 1.68;
    head.castShadow = true;

    const collar = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.18, 0.14, 0.28)), accentMat);
    collar.position.set(0.32, 1.15, 0);

    group.add(torso, head, collar);
    return group;
  }

  /** Streams 300m offline tiles around (playerX, playerZ) with hysteresis & clean disposal. */
  updateStreaming(playerX: number, playerZ: number): void {
    const loadRadius = 1; // 3x3 = 900m x 900m active window (stays ~30-55 draw calls!)
    const diff = planTileStreaming(
      playerX,
      playerZ,
      loadRadius,
      new Set(this.loadedTiles.keys()),
      this.availableTileSet,
      this.manifest.tileSize,
    );

    for (const key of diff.toUnload) {
      const existing = this.loadedTiles.get(key);
      if (!existing) continue;
      this.tilesRoot.remove(existing.group);
      for (const g of existing.geometries) g.dispose();
      this.activeBuildings -= existing.buildingCount;
      this.loadedTiles.delete(key);
      this.spatialGrid.removeTile(key);
    }

    for (const key of diff.toLoad) {
      if (this.loadedTiles.has(key) || this.inflightTiles.has(key)) continue;
      this.inflightTiles.add(key);
      void this.loadTile(key);
    }
  }

  private async loadTile(key: string): Promise<void> {
    try {
      const res = await fetch(`${this.regionBaseUrl}/tiles/${key}.json`);
      if (!res.ok) return;
      const tile = (await res.json()) as RegionTileData;
      if (this.disposed || this.loadedTiles.has(key)) return;

      const built = buildTileMeshes(
        tile,
        this.terrain,
        {
          buildingMat: this.buildingMat,
          roadMat: this.roadMat,
          areaMat: this.areaMat,
        },
        getQualityPreset(this.qualityTier).shadowsEnabled,
      );
      this.tilesRoot.add(built.group);
      this.loadedTiles.set(key, built);
      this.activeBuildings += built.buildingCount;
      this.spatialGrid.addTile(
        key,
        tile.buildings.map((b) => ({
          id: b.id,
          minX: b.minX,
          maxX: b.maxX,
          minZ: b.minZ,
          maxZ: b.maxZ,
        })),
      );
    } finally {
      this.inflightTiles.delete(key);
    }
  }

  getCameraYaw(): number {
    return this.cameraYaw;
  }

  rotateCameraYaw(deltaRadians: number): void {
    this.cameraYaw += deltaRadians;
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
    this.camera.far = preset.drawDistance + 120;
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
    this.waterMesh.position.y = 0.25 + Math.sin(this.elapsed * 1.2) * 0.05;

    this.avatarGroup.position.set(playerX, playerY, playerZ);
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

    // Move shadow frustum along with the player so shadows stay crisp across all 2 km²
    this.sunLight.position.set(playerX - 65, playerY + 55, playerZ - 85);
    this.sunLight.target.position.set(playerX, playerY, playerZ);
    this.sunLight.target.updateMatrixWorld();

    // Smooth orbitable 3rd-person chase camera
    const camDist = 10.5;
    const camHeight = 5.2;
    const desiredX = playerX + Math.sin(this.cameraYaw) * camDist;
    const desiredZ = playerZ + Math.cos(this.cameraYaw) * camDist;
    const groundUnderCam = sampleTerrainElevation(this.terrain, desiredX, desiredZ);
    const desiredY = Math.max(playerY + camHeight, groundUnderCam + 2.4);

    this.camera.position.x = damp(this.camera.position.x, desiredX, 8, dt);
    this.camera.position.y = damp(this.camera.position.y, desiredY, 8, dt);
    this.camera.position.z = damp(this.camera.position.z, desiredZ, 8, dt);
    this.camera.lookAt(
      playerX - Math.sin(this.cameraYaw) * 6,
      playerY + 1.8,
      playerZ - Math.cos(this.cameraYaw) * 6,
    );
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  getTelemetry(): WorldTelemetry {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
      qualityTier: this.qualityTier,
      loadedTiles: this.loadedTiles.size,
      activeBuildings: this.activeBuildings,
    };
  }

  dispose(): void {
    this.disposed = true;
    for (const tile of this.loadedTiles.values()) {
      for (const g of tile.geometries) g.dispose();
    }
    this.loadedTiles.clear();
    for (const g of this.disposableGeometries) g.dispose();
    for (const m of this.disposableMaterials) m.dispose();
    for (const t of this.disposableTextures) t.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
