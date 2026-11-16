import * as THREE from 'three';
import type { TimeOfDay } from '../core/diagnostics';
import { damp } from '../core/math';
import { getQualityPreset, type QualityTier } from '../core/quality';
import { createRng } from '../core/rng';
import type { TrafficAgent } from '../core/traffic';
import type { PlayerVehicleState } from '../core/vehicle';
import { BuildingSpatialGrid } from '../core/world/collision';
import type { RegionRegistryEntry } from '../core/world/regions';
import { sampleTerrainElevation } from '../core/world/terrain';
import { planTileStreaming } from '../core/world/tileStreamer';
import type {
  LandmarkPin,
  RegionManifest,
  RegionTileData,
  TerrainGrid,
} from '../core/world/types';
import { buildTileMeshes, type BuiltTileGroup } from './tileMeshBuilder';

export type QaCameraMode = 'follow' | 'street' | 'overview';

export interface WorldTelemetry {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  qualityTier: QualityTier;
  timeOfDay: TimeOfDay;
  loadedTiles: number;
  activeBuildings: number;
}

const TRAFFIC_COLORS = [
  new THREE.Color(0xf5b800), // Istanbul taxi yellow
  new THREE.Color(0x2b6cb0), // Dolmus blue
  new THREE.Color(0xdbe2ea), // Silver civilian
  new THREE.Color(0x8c3b3b), // Burgundy civilian
  new THREE.Color(0x3a4a5e), // Slate civilian
];

function createFacadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#eceae4';
    ctx.fillRect(0, 0, 256, 256);

    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < 256; y += 32) {
      ctx.fillRect(0, y, 256, 2);
    }

    const rng = createRng(34011);
    const cols = 4;
    const rows = 4;
    const cellW = 256 / cols;
    const cellH = 256 / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        // Keep top-left corner clean for roof UVs (0.02, 0.02)
        const wx = c * cellW + 15;
        const wy = r * cellH + 15;
        const ww = cellW - 30;
        const wh = cellH - 28;
        ctx.fillStyle = '#534b44';
        ctx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
        const lit = rng.next() < 0.42;
        ctx.fillStyle = lit ? '#f8d78c' : '#3d495b';
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

function createWindowEmissiveTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 256, 256);
    const rng = createRng(34011);
    const cols = 4;
    const rows = 4;
    const cellW = 256 / cols;
    const cellH = 256 / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        if (rng.next() < 0.42) {
          ctx.fillStyle = '#ffcf70';
          ctx.fillRect(c * cellW + 16, r * cellH + 16, cellW - 32, cellH - 30);
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSkyTexture(mode: TimeOfDay): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    if (mode === 'day') {
      grad.addColorStop(0.0, '#13254a');
      grad.addColorStop(0.36, '#3b507f');
      grad.addColorStop(0.66, '#c76c58');
      grad.addColorStop(0.84, '#f29e54');
      grad.addColorStop(1.0, '#f9d892');
    } else {
      grad.addColorStop(0.0, '#040814');
      grad.addColorStop(0.45, '#0b1530');
      grad.addColorStop(0.78, '#1a2748');
      grad.addColorStop(1.0, '#2e3352');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class RegionWorldScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly spatialGrid = new BuildingSpatialGrid(28);

  private readonly regionMeta: RegionRegistryEntry;
  private readonly manifest: RegionManifest;
  private readonly terrain: TerrainGrid;
  private readonly availableTileSet: Set<string>;
  private readonly loadedTiles = new Map<string, BuiltTileGroup>();
  private readonly inflightTiles = new Set<string>();
  private readonly tilesRoot = new THREE.Group();

  private readonly hemiLight: THREE.HemisphereLight;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly daySkyTex: THREE.CanvasTexture;
  private readonly nightSkyTex: THREE.CanvasTexture;
  private readonly waterMesh: THREE.Mesh | null;
  private readonly avatarGroup: THREE.Group;
  private readonly playerVehicleGroup: THREE.Group;
  private readonly headlightMat: THREE.MeshBasicMaterial;
  private readonly brakeLightMat: THREE.MeshBasicMaterial;
  private readonly vehicleHeadLight: THREE.PointLight;

  private readonly trafficChassisInst: THREE.InstancedMesh;
  private readonly trafficCabinInst: THREE.InstancedMesh;
  private readonly maxTrafficInstances = 24;
  private readonly dummyObj = new THREE.Object3D();

  private readonly buildingMat: THREE.MeshStandardMaterial;
  private readonly roadMat: THREE.MeshStandardMaterial;
  private readonly areaMat: THREE.MeshStandardMaterial;

  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableTextures: THREE.Texture[] = [];

  private qualityTier: QualityTier;
  private timeOfDay: TimeOfDay;
  private qaCameraMode: QaCameraMode = 'follow';
  private avatarHeading = 0;
  private cameraYaw = 0;
  private elapsed = 0;
  private activeBuildings = 0;
  private disposed = false;

  constructor(
    container: HTMLElement,
    regionMeta: RegionRegistryEntry,
    manifest: RegionManifest,
    terrain: TerrainGrid,
    initialQuality: QualityTier,
    initialTimeOfDay: TimeOfDay = 'day',
  ) {
    this.regionMeta = regionMeta;
    this.manifest = manifest;
    this.terrain = terrain;
    this.availableTileSet = new Set(manifest.availableTiles);
    this.qualityTier = initialQuality;
    this.timeOfDay = initialTimeOfDay;
    this.cameraYaw = manifest.spawn.heading + Math.PI;

    this.renderer = new THREE.WebGLRenderer({
      antialias: initialQuality === 'normal',
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || 1280, container.clientHeight || 720);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.daySkyTex = createSkyTexture('day');
    this.nightSkyTex = createSkyTexture('night');
    this.disposableTextures.push(this.daySkyTex, this.nightSkyTex);

    this.camera = new THREE.PerspectiveCamera(
      60,
      (container.clientWidth || 1280) / Math.max(1, container.clientHeight || 720),
      0.5,
      900,
    );

    this.hemiLight = new THREE.HemisphereLight(0xffdfb0, 0x3b4863, 0.9);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffcb8c, 2.0);
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 420;
    this.sunLight.shadow.camera.left = -130;
    this.sunLight.shadow.camera.right = 130;
    this.sunLight.shadow.camera.top = 130;
    this.sunLight.shadow.camera.bottom = -130;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Shared tile materials (<= 3 draw calls per 300m tile, polygonOffset eliminates z-fighting!)
    const facadeTex = createFacadeTexture();
    const emissiveTex = createWindowEmissiveTexture();
    this.disposableTextures.push(facadeTex, emissiveTex);

    this.buildingMat = new THREE.MeshStandardMaterial({
      map: facadeTex,
      emissive: new THREE.Color(0xffb454),
      emissiveMap: emissiveTex,
      emissiveIntensity: 0.08,
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.04,
    });
    this.roadMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.areaMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.disposableMaterials.push(this.buildingMat, this.roadMat, this.areaMat);

    // Copernicus DEM GLO-30 terrain mesh
    this.buildTerrainMesh();

    // Sea plane (Fatih Bosphorus/Marmara only) or distant hillside apron (Esenler)
    this.waterMesh = this.regionMeta.hasCoastalSea ? this.buildSeaMesh() : this.buildInlandApron();

    // Streamed 300m tiles root
    this.scene.add(this.tilesRoot);

    // Region landmarks (mosque domes/minarets + neighborhood POI beacons)
    this.buildLandmarks();

    // Player avatar (hidden when inside vehicle)
    this.avatarGroup = this.buildAvatar();
    this.scene.add(this.avatarGroup);

    // Drivable player vehicle (fictional Istanbul Sarı Taksi)
    this.headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
    this.brakeLightMat = new THREE.MeshBasicMaterial({ color: 0x551111 });
    this.disposableMaterials.push(this.headlightMat, this.brakeLightMat);
    this.vehicleHeadLight = new THREE.PointLight(0xffe7a8, 0, 26, 1.8);
    this.playerVehicleGroup = this.buildPlayerTaxi();
    this.playerVehicleGroup.add(this.vehicleHeadLight);
    this.vehicleHeadLight.position.set(0, 1.1, 2.8);
    this.scene.add(this.playerVehicleGroup);

    // Instanced AI Traffic (2 draw calls total for up to 24 moving vehicles!)
    const chassisGeo = new THREE.BoxGeometry(1.85, 0.68, 4.25);
    const cabinGeo = new THREE.BoxGeometry(1.55, 0.54, 2.25);
    const chassisMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.3 });
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.25,
      metalness: 0.5,
    });
    this.disposableGeometries.push(chassisGeo, cabinGeo);
    this.disposableMaterials.push(chassisMat, cabinMat);

    this.trafficChassisInst = new THREE.InstancedMesh(
      chassisGeo,
      chassisMat,
      this.maxTrafficInstances,
    );
    this.trafficCabinInst = new THREE.InstancedMesh(cabinGeo, cabinMat, this.maxTrafficInstances);
    this.trafficChassisInst.count = 0;
    this.trafficCabinInst.count = 0;
    this.trafficChassisInst.frustumCulled = false;
    this.trafficCabinInst.frustumCulled = false;
    this.scene.add(this.trafficChassisInst, this.trafficCabinInst);

    this.applyLighting();
    this.applyQuality(initialQuality);
  }

  private buildTerrainMesh(): void {
    const { minX, maxX, minZ, maxZ, cols, rows, elevDecimeters } = this.terrain;
    const width = maxX - minX;
    const depth = maxZ - minZ;
    const geo = new THREE.PlaneGeometry(width, depth, cols - 1, rows - 1);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const baseColor = new THREE.Color();
    const minM = this.terrain.minMeters;
    const spanM = Math.max(1, this.terrain.maxMeters - minM);

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const idx = r * cols + c;
        const elev = (elevDecimeters[idx] ?? 0) * 0.1;
        pos.setY(idx, elev);
        const t = (elev - minM) / spanM;
        if (this.regionMeta.hasCoastalSea && elev < 1.2) {
          baseColor.setHex(0x8a7d68);
        } else if (this.regionMeta.character === 'residential-hillside') {
          // Urban asphalt-beige base transitioning to greener high ridges
          baseColor.setRGB(0.49 + t * 0.08, 0.47 + t * 0.09, 0.43 + t * 0.05);
        } else {
          baseColor.setRGB(0.56 + t * 0.06, 0.52 + t * 0.06, 0.44 + t * 0.04);
        }
        colors[idx * 3] = baseColor.r;
        colors[idx * 3 + 1] = baseColor.g;
        colors[idx * 3 + 2] = baseColor.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.02,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((minX + maxX) * 0.5, 0, (minZ + maxZ) * 0.5);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.disposableGeometries.push(geo);
    this.disposableMaterials.push(mat);
  }

  private buildSeaMesh(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(5200, 5200, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x163858,
      roughness: 0.25,
      metalness: 0.35,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0.35, 0);
    this.scene.add(mesh);
    this.disposableGeometries.push(geo);
    this.disposableMaterials.push(mat);
    return mesh;
  }

  private buildInlandApron(): THREE.Mesh | null {
    // Subtle distant Istanbul ground apron below Esenler hills so the horizon never shows void gaps
    const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x454549,
      roughness: 0.98,
      metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, Math.max(0, this.terrain.minMeters - 6), 0);
    this.scene.add(mesh);
    this.disposableGeometries.push(geo);
    this.disposableMaterials.push(mat);
    return null;
  }

  private buildLandmarks(): void {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xe6dac5, roughness: 0.82 });
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x6f7c8a,
      roughness: 0.55,
      metalness: 0.25,
    });
    const obeliskMat = new THREE.MeshStandardMaterial({ color: 0xc29e74, roughness: 0.78 });
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf5b800,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
      roughness: 0.4,
    });
    const safeRingMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
    });
    this.disposableMaterials.push(stoneMat, domeMat, obeliskMat, beaconMat, safeRingMat);

    const addMosque = (lm: LandmarkPin, domeRadius: number, minaretCount: number): void => {
      const g = new THREE.Group();
      const baseY = sampleTerrainElevation(this.terrain, lm.x, lm.z);
      g.position.set(lm.x, baseY, lm.z);

      const baseGeo = new THREE.BoxGeometry(domeRadius * 2.0, domeRadius * 0.82, domeRadius * 2.0);
      const domeGeo = new THREE.SphereGeometry(
        domeRadius * 0.92,
        16,
        10,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.52,
      );
      const minGeo = new THREE.CylinderGeometry(0.7, 1.05, domeRadius * 2.25, 8);
      const coneGeo = new THREE.ConeGeometry(0.85, 3.6, 8);
      this.disposableGeometries.push(baseGeo, domeGeo, minGeo, coneGeo);

      const base = new THREE.Mesh(baseGeo, stoneMat);
      base.position.y = domeRadius * 0.36;
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.position.y = domeRadius * 0.78;
      g.add(base, dome);

      const spread = domeRadius * 1.15;
      const offsets: [number, number][] =
        minaretCount === 1
          ? [[spread, spread]]
          : minaretCount === 6
            ? [
                [-spread, -spread],
                [spread, -spread],
                [-spread, spread],
                [spread, spread],
                [-spread * 1.1, 0],
                [spread * 1.1, 0],
              ]
            : [
                [-spread, -spread],
                [spread, -spread],
                [-spread, spread],
                [spread, spread],
              ];
      for (const [ox, oz] of offsets) {
        const min = new THREE.Mesh(minGeo, stoneMat);
        min.position.set(ox, domeRadius * 1.12, oz);
        const cone = new THREE.Mesh(coneGeo, domeMat);
        cone.position.set(ox, domeRadius * 2.25 + 1.8, oz);
        g.add(min, cone);
      }

      // Subtle sanctuary ground ring
      const ringGeo = new THREE.RingGeometry(
        Math.max(domeRadius * 1.5, 16),
        Math.max(domeRadius * 1.5 + 1.2, 17.2),
        32,
      );
      ringGeo.rotateX(-Math.PI / 2);
      this.disposableGeometries.push(ringGeo);
      const ring = new THREE.Mesh(ringGeo, safeRingMat);
      ring.position.y = 0.55;
      g.add(ring);

      this.scene.add(g);
    };

    const poleGeo = new THREE.CylinderGeometry(0.18, 0.24, 5.2, 8);
    const orbGeo = new THREE.OctahedronGeometry(0.75, 0);
    this.disposableGeometries.push(poleGeo, orbGeo);

    for (const lm of this.manifest.landmarks) {
      if (lm.id === 'ayasofya') {
        addMosque(lm, 19, 4);
      } else if (lm.id === 'sultanahmet-camii') {
        addMosque(lm, 20, 6);
      } else if (lm.kind === 'mosque') {
        addMosque(lm, 9.5, 1);
      } else if (lm.id === 'hipodrom') {
        const baseY = sampleTerrainElevation(this.terrain, lm.x, lm.z);
        const obGeo = new THREE.CylinderGeometry(0.85, 1.55, 22, 4);
        this.disposableGeometries.push(obGeo);
        const ob = new THREE.Mesh(obGeo, obeliskMat);
        ob.position.set(lm.x, baseY + 11, lm.z);
        ob.rotation.y = Math.PI / 4;
        this.scene.add(ob);
      } else if (lm.id === 'eminonu-iskele') {
        const hullGeo = new THREE.BoxGeometry(28, 3.6, 8);
        const deckGeo = new THREE.BoxGeometry(19, 3.4, 6.2);
        const stackGeo = new THREE.CylinderGeometry(0.8, 0.95, 4.4, 10);
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f5f7, roughness: 0.55 });
        const yellowMat = new THREE.MeshStandardMaterial({ color: 0xf5b800, roughness: 0.5 });
        this.disposableGeometries.push(hullGeo, deckGeo, stackGeo);
        this.disposableMaterials.push(whiteMat, yellowMat);
        const ferry = new THREE.Group();
        ferry.position.set(lm.x - 18, 1.8, lm.z - 55);
        ferry.rotation.y = 0.35;
        const hull = new THREE.Mesh(hullGeo, whiteMat);
        const deck = new THREE.Mesh(deckGeo, whiteMat);
        deck.position.y = 3.2;
        const stack = new THREE.Mesh(stackGeo, yellowMat);
        stack.position.y = 6.3;
        ferry.add(hull, deck, stack);
        this.scene.add(ferry);
      } else if (lm.id !== 'nk-merkez-cadde') {
        // Anonymized neighborhood POI / mission marker (bakkal, çay ocağı, okul, park, pazar yeri)
        const baseY = sampleTerrainElevation(this.terrain, lm.x, lm.z);
        const marker = new THREE.Group();
        marker.position.set(lm.x, baseY, lm.z);
        const pole = new THREE.Mesh(poleGeo, stoneMat);
        pole.position.y = 2.6;
        const orb = new THREE.Mesh(orbGeo, beaconMat);
        orb.position.y = 5.6;
        marker.add(pole, orb);
        this.scene.add(marker);
      }
    }
  }

  private buildAvatar(): THREE.Group {
    const group = new THREE.Group();
    const jacketMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xe2b89b, roughness: 0.7 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0xf5b800, roughness: 0.5 });

    const bodyGeo = new THREE.CapsuleGeometry(0.32, 0.78, 4, 8);
    const headGeo = new THREE.SphereGeometry(0.24, 10, 10);
    const scarfGeo = new THREE.BoxGeometry(0.18, 0.14, 0.44);
    this.disposableGeometries.push(bodyGeo, headGeo, scarfGeo);
    this.disposableMaterials.push(jacketMat, headMat, accentMat);

    const torso = new THREE.Mesh(bodyGeo, jacketMat);
    torso.position.y = 0.84;
    torso.castShadow = true;

    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.56;
    head.castShadow = true;

    const collar = new THREE.Mesh(scarfGeo, accentMat);
    collar.position.set(0, 1.15, 0.25);

    group.add(torso, head, collar);
    return group;
  }

  private buildPlayerTaxi(): THREE.Group {
    const group = new THREE.Group();
    const taxiMat = new THREE.MeshStandardMaterial({
      color: 0xf5b800,
      roughness: 0.36,
      metalness: 0.28,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x162234,
      roughness: 0.18,
      metalness: 0.6,
    });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.9 });
    const signMat = new THREE.MeshStandardMaterial({
      color: 0xfff7cc,
      emissive: 0xf5b800,
      emissiveIntensity: 0.55,
    });

    const bodyGeo = new THREE.BoxGeometry(1.88, 0.66, 4.3);
    const cabinGeo = new THREE.BoxGeometry(1.58, 0.56, 2.25);
    const signGeo = new THREE.BoxGeometry(0.66, 0.2, 0.26);
    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.26, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const lampGeo = new THREE.BoxGeometry(0.34, 0.16, 0.08);
    this.disposableGeometries.push(bodyGeo, cabinGeo, signGeo, wheelGeo, lampGeo);
    this.disposableMaterials.push(taxiMat, glassMat, wheelMat, signMat);

    const body = new THREE.Mesh(bodyGeo, taxiMat);
    body.position.y = 0.62;
    body.castShadow = true;
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 1.18, -0.15);
    const roofSign = new THREE.Mesh(signGeo, signMat);
    roofSign.position.set(0, 1.54, -0.1);
    group.add(body, cabin, roofSign);

    const wheelCoords: [number, number][] = [
      [-0.92, 1.32],
      [0.92, 1.32],
      [-0.92, -1.32],
      [0.92, -1.32],
    ];
    for (const [wx, wz] of wheelCoords) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, 0.36, wz);
      group.add(wheel);
    }

    // Front headlights (+Z forward) & rear brake lights (-Z)
    for (const lx of [-0.62, 0.62]) {
      const hl = new THREE.Mesh(lampGeo, this.headlightMat);
      hl.position.set(lx, 0.66, 2.16);
      const bl = new THREE.Mesh(lampGeo, this.brakeLightMat);
      bl.position.set(lx, 0.66, -2.16);
      group.add(hl, bl);
    }

    return group;
  }

  /** Streams 300m offline tiles around (focusX, focusZ) with hysteresis & GPU disposal. */
  updateStreaming(focusX: number, focusZ: number): void {
    const loadRadius = 1; // 3x3 = 900m x 900m active window
    const diff = planTileStreaming(
      focusX,
      focusZ,
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
      const res = await fetch(`${this.regionMeta.baseUrl}/tiles/${key}.json`);
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

  setQaCameraMode(mode: QaCameraMode): void {
    this.qaCameraMode = mode;
  }

  setTimeOfDay(mode: TimeOfDay): void {
    this.timeOfDay = mode;
    this.applyLighting();
  }

  getTimeOfDay(): TimeOfDay {
    return this.timeOfDay;
  }

  private applyLighting(): void {
    const preset = getQualityPreset(this.qualityTier);
    const farDist = preset.fogFar + 140;
    if (this.timeOfDay === 'day') {
      this.scene.background = this.daySkyTex;
      this.scene.fog = new THREE.Fog(0xd49a74, preset.fogNear * 0.9, farDist);
      this.hemiLight.color.setHex(0xffdfb0);
      this.hemiLight.groundColor.setHex(0x3b4863);
      this.hemiLight.intensity = 0.92;
      this.sunLight.color.setHex(0xffcb8c);
      this.sunLight.intensity = 2.05;
      this.buildingMat.emissiveIntensity = 0.06;
      this.vehicleHeadLight.intensity = 0;
      this.renderer.toneMappingExposure = 1.08;
    } else {
      this.scene.background = this.nightSkyTex;
      this.scene.fog = new THREE.Fog(0x0f1a33, preset.fogNear * 0.75, farDist * 0.85);
      this.hemiLight.color.setHex(0x4b689c);
      this.hemiLight.groundColor.setHex(0x161b2a);
      this.hemiLight.intensity = 0.55;
      this.sunLight.color.setHex(0x9cb8f0);
      this.sunLight.intensity = 0.85;
      this.buildingMat.emissiveIntensity = 0.95;
      this.vehicleHeadLight.intensity = 18;
      this.renderer.toneMappingExposure = 1.15;
    }
  }

  applyQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    const preset = getQualityPreset(tier);
    const dpr = Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = preset.shadowsEnabled;
    this.sunLight.castShadow = preset.shadowsEnabled;
    this.camera.far = preset.drawDistance + 420;
    this.camera.updateProjectionMatrix();
    this.applyLighting();
  }

  updateTraffic(agents: readonly TrafficAgent[]): void {
    const count = Math.min(agents.length, this.maxTrafficInstances);
    this.trafficChassisInst.count = count;
    this.trafficCabinInst.count = count;

    for (let i = 0; i < count; i += 1) {
      const a = agents[i]!;
      const scaleY = a.archetype === 'dolmus' ? 1.35 : 1.0;
      const scaleZ = a.archetype === 'dolmus' ? 1.15 : 1.0;

      this.dummyObj.position.set(a.x, a.y + 0.56 * scaleY, a.z);
      this.dummyObj.rotation.set(0, a.heading, 0);
      this.dummyObj.scale.set(1, scaleY, scaleZ);
      this.dummyObj.updateMatrix();
      this.trafficChassisInst.setMatrixAt(i, this.dummyObj.matrix);

      const color =
        a.archetype === 'taxi'
          ? TRAFFIC_COLORS[0]!
          : a.archetype === 'dolmus'
            ? TRAFFIC_COLORS[1]!
            : TRAFFIC_COLORS[2 + (a.colorIndex % 3)]!;
      this.trafficChassisInst.setColorAt(i, color);

      this.dummyObj.position.set(a.x, a.y + 1.08 * scaleY, a.z);
      this.dummyObj.scale.set(1, scaleY * 0.9, scaleZ * 0.92);
      this.dummyObj.updateMatrix();
      this.trafficCabinInst.setMatrixAt(i, this.dummyObj.matrix);
    }

    this.trafficChassisInst.instanceMatrix.needsUpdate = true;
    this.trafficCabinInst.instanceMatrix.needsUpdate = true;
    if (this.trafficChassisInst.instanceColor) {
      this.trafficChassisInst.instanceColor.needsUpdate = true;
    }
  }

  updateVisuals(
    playerX: number,
    playerY: number,
    playerZ: number,
    velX: number,
    velZ: number,
    inVehicle: boolean,
    vehicle: PlayerVehicleState,
    dt: number,
  ): void {
    this.elapsed += dt;

    // Update player taxi visual
    this.playerVehicleGroup.position.set(vehicle.x, vehicle.y + 0.08, vehicle.z);
    this.playerVehicleGroup.rotation.set(-vehicle.pitch, vehicle.heading, 0, 'YXZ');
    this.brakeLightMat.color.setHex(vehicle.braking ? 0xff2222 : 0x551111);

    // Update on-foot avatar
    this.avatarGroup.visible = !inVehicle;
    if (!inVehicle) {
      const speedSq = velX * velX + velZ * velZ;
      if (speedSq > 0.04) {
        const targetHeading = Math.atan2(velX, velZ);
        let diff = targetHeading - this.avatarHeading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.avatarHeading += diff * Math.min(1, dt * 10);
      }
      const bob = speedSq > 0.04 ? Math.abs(Math.sin(this.elapsed * 11)) * 0.08 : 0;
      this.avatarGroup.position.set(playerX, playerY + bob, playerZ);
      this.avatarGroup.rotation.y = this.avatarHeading;
    }

    const focusX = inVehicle ? vehicle.x : playerX;
    const focusY = inVehicle ? vehicle.y : playerY;
    const focusZ = inVehicle ? vehicle.z : playerZ;

    // Keep shadow frustum centered around active focus
    this.sunLight.position.set(focusX + 115, focusY + 135, focusZ + 80);
    this.sunLight.target.position.set(focusX, focusY, focusZ);
    this.sunLight.target.updateMatrixWorld();

    // Camera positioning (supports reproducible QA camera modes)
    if (this.qaCameraMode === 'overview') {
      const targetPosX = focusX + 85;
      const targetPosY = focusY + 72;
      const targetPosZ = focusZ + 95;
      this.camera.position.set(targetPosX, targetPosY, targetPosZ);
      this.camera.lookAt(focusX, focusY + 4, focusZ);
    } else if (this.qaCameraMode === 'street') {
      const lookYaw = vehicle.heading;
      const sx = focusX - Math.sin(lookYaw) * 9.5 + Math.cos(lookYaw) * 2.2;
      const sz = focusZ - Math.cos(lookYaw) * 9.5 - Math.sin(lookYaw) * 2.2;
      const sy = Math.max(focusY + 2.3, sampleTerrainElevation(this.terrain, sx, sz) + 2.1);
      this.camera.position.set(sx, sy, sz);
      this.camera.lookAt(
        focusX + Math.sin(lookYaw) * 14,
        focusY + 2.6,
        focusZ + Math.cos(lookYaw) * 14,
      );
    } else {
      // Dynamic 3rd-person follow (auto-aligns behind vehicle when driving)
      if (inVehicle && Math.abs(vehicle.speed) > 1.2) {
        const desiredYaw = vehicle.heading + Math.PI;
        let diff = desiredYaw - this.cameraYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.cameraYaw += diff * Math.min(1, dt * 3.2);
      }

      const camDist = inVehicle ? 10.5 : 8.5;
      const camHeight = inVehicle ? 4.4 : 3.9;
      const desiredX = focusX + Math.sin(this.cameraYaw) * camDist;
      const desiredZ = focusZ + Math.cos(this.cameraYaw) * camDist;
      const camGroundY = sampleTerrainElevation(this.terrain, desiredX, desiredZ);
      const desiredY = Math.max(focusY + camHeight, camGroundY + 2.6);

      this.camera.position.x = damp(this.camera.position.x, desiredX, 8, dt);
      this.camera.position.y = damp(this.camera.position.y, desiredY, 8, dt);
      this.camera.position.z = damp(this.camera.position.z, desiredZ, 8, dt);
      this.camera.lookAt(focusX, focusY + (inVehicle ? 1.5 : 1.7), focusZ);
    }

    if (this.waterMesh) {
      this.waterMesh.position.y = 0.35 + Math.sin(this.elapsed * 1.1) * 0.08;
    }
  }

  getGpuInfo(): { renderer: string; vendor: string } {
    try {
      const gl = this.renderer.getContext();
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || 'WebGL');
        const vendor = String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || 'Unknown');
        return { renderer, vendor };
      }
      return {
        renderer: String(gl.getParameter(gl.RENDERER) || 'WebGL'),
        vendor: String(gl.getParameter(gl.VENDOR) || 'Unknown'),
      };
    } catch {
      return { renderer: 'Unknown', vendor: 'Unknown' };
    }
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
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
      timeOfDay: this.timeOfDay,
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
