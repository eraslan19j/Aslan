import * as THREE from 'three';
import type { TimeOfDay } from '../core/diagnostics';
import { damp } from '../core/math';
import type { ActiveTaxiMission } from '../core/missions';
import type { PedestrianAgent } from '../core/pedestrians';
import { getQualityPreset, type QualityTier } from '../core/quality';
import type { TrafficAgent } from '../core/traffic';
import type { PlayerVehicleState } from '../core/vehicle';
import type { PoliceUnit } from '../core/wanted';
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
import {
  animateCharacterRig,
  createCharacterRig,
  type CharacterRig,
} from './characterMesh';
import { mergeColoredParts, type ColoredGeometryPart } from './meshMerge';
import {
  createAsphaltRoadTexture,
  createContactShadowTexture,
  createIstanbulFacadeTextures,
  createParkGrassTexture,
  createSkyDomeTexture,
  createUrbanGroundTexture,
} from './proceduralTextures';
import { buildTileMeshes, type BuiltTileGroup } from './tileMeshBuilder';
import {
  createPlayerTaxiRig,
  updatePlayerTaxiRig,
  type PlayerTaxiRig,
} from './vehicleMesh';

export type QaCameraMode = 'follow' | 'street' | 'overview';
export type PlayerCameraView = 'chase' | 'wide' | 'hood' | 'topdown';

const CAMERA_VIEW_ORDER: readonly PlayerCameraView[] = ['chase', 'wide', 'hood', 'topdown'];

const PED_SHIRT_COLORS = [
  new THREE.Color(0x2563eb),
  new THREE.Color(0xdc2626),
  new THREE.Color(0x16a34a),
  new THREE.Color(0xeab308),
  new THREE.Color(0xf1f5f9),
  new THREE.Color(0x9333ea),
  new THREE.Color(0xea580c),
  new THREE.Color(0x334155),
];

const PED_PANTS_COLORS = [
  new THREE.Color(0x1e293b),
  new THREE.Color(0x334155),
  new THREE.Color(0x27272a),
  new THREE.Color(0x3f3f46),
];

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
  new THREE.Color(0xf6b800), // Istanbul taxi yellow
  new THREE.Color(0x2867a8), // Dolmus blue
  new THREE.Color(0xe2e8f0), // Pearl silver sedan
  new THREE.Color(0x9a3737), // Burgundy sedan
  new THREE.Color(0x3a4a5e), // Graphite slate sedan
];

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
  private readonly skyDome: THREE.Mesh;
  private readonly skyMat: THREE.MeshBasicMaterial;
  private readonly daySkyTex: THREE.CanvasTexture;
  private readonly nightSkyTex: THREE.CanvasTexture;
  private readonly waterMesh: THREE.Mesh | null;
  private readonly characterRig: CharacterRig;
  private readonly taxiRig: PlayerTaxiRig;

  // Upgraded 4-part instanced AI traffic (4 draw calls total for all 24 vehicles)
  private readonly trafficChassisInst: THREE.InstancedMesh;
  private readonly trafficCabinInst: THREE.InstancedMesh;
  private readonly trafficRoofInst: THREE.InstancedMesh;
  private readonly trafficUnderInst: THREE.InstancedMesh;
  private readonly maxTrafficInstances = 24;

  // Instanced sidewalk pedestrians (only 3 draw calls for up to 36 people!)
  private readonly pedLegsInst: THREE.InstancedMesh;
  private readonly pedTorsoInst: THREE.InstancedMesh;
  private readonly pedHeadInst: THREE.InstancedMesh;
  private readonly maxPedInstances = 36;

  // Fictional Şehir Polisi instanced patrol cruisers (2 draw calls, 0 when stars === 0!)
  private readonly policeBodyInst: THREE.InstancedMesh;
  private readonly policeBeaconInst: THREE.InstancedMesh;
  private readonly policeBeaconMat: THREE.MeshBasicMaterial;
  private readonly maxPoliceInstances = 4;

  // Glowing 3D Taxi Mission pickup / drop-off beacon (2 draw calls)
  private readonly missionGroup = new THREE.Group();
  private readonly missionRingMat: THREE.MeshBasicMaterial;
  private readonly missionPillarMat: THREE.MeshBasicMaterial;

  private readonly dummyObj = new THREE.Object3D();

  private readonly upperBuildingMat: THREE.MeshStandardMaterial;
  private readonly groundRoofMat: THREE.MeshStandardMaterial;
  private readonly roadMat: THREE.MeshStandardMaterial;
  private readonly areaMat: THREE.MeshStandardMaterial;
  private readonly propsMat: THREE.MeshStandardMaterial;

  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableTextures: THREE.Texture[] = [];
  private readonly resizeObserver: ResizeObserver | null;

  private qualityTier: QualityTier;
  private timeOfDay: TimeOfDay;
  private qaCameraMode: QaCameraMode = 'follow';
  private playerCameraView: PlayerCameraView = 'chase';
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

    const maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        const rect = entries[0]?.contentRect;
        if (rect && rect.width > 0 && rect.height > 0 && !this.disposed) {
          this.resize(rect.width, rect.height);
        }
      });
      this.resizeObserver.observe(container);
    } else {
      this.resizeObserver = null;
    }

    this.scene = new THREE.Scene();
    this.daySkyTex = createSkyDomeTexture('day');
    this.nightSkyTex = createSkyDomeTexture('night');
    this.disposableTextures.push(this.daySkyTex, this.nightSkyTex);

    // 3D Equirectangular Sky Dome (warm sun + wispy clouds by day, stars + moon by night)
    const skyGeo = new THREE.SphereGeometry(760, 24, 16);
    this.skyMat = new THREE.MeshBasicMaterial({
      map: this.daySkyTex,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.skyDome = new THREE.Mesh(skyGeo, this.skyMat);
    this.skyDome.renderOrder = -1;
    this.scene.add(this.skyDome);
    this.disposableGeometries.push(skyGeo);
    this.disposableMaterials.push(this.skyMat);

    this.camera = new THREE.PerspectiveCamera(
      60,
      (container.clientWidth || 1280) / Math.max(1, container.clientHeight || 720),
      0.4,
      920,
    );
    // Snap camera immediately to ideal elevated 3rd-person follow position at spawn (no frame-1 dip!)
    const spawnY = sampleTerrainElevation(terrain, manifest.spawn.x, manifest.spawn.z);
    const initCamX = manifest.spawn.x + Math.sin(this.cameraYaw) * 7.4;
    const initCamZ = manifest.spawn.z + Math.cos(this.cameraYaw) * 7.4;
    const initCamY = Math.max(
      spawnY + 3.4,
      sampleTerrainElevation(terrain, initCamX, initCamZ) + 2.4,
    );
    this.camera.position.set(initCamX, initCamY, initCamZ);
    this.camera.lookAt(manifest.spawn.x, spawnY + 1.6, manifest.spawn.z);

    this.hemiLight = new THREE.HemisphereLight(0xd4eeff, 0x776858, 1.1);
    this.scene.add(this.hemiLight);

    // Tightly focused crisp shadow frustum (±82m on 2048px -> ~8 cm/texel razor-sharp street shadows!)
    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 2.25);
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 15;
    this.sunLight.shadow.camera.far = 360;
    this.sunLight.shadow.camera.left = -84;
    this.sunLight.shadow.camera.right = 84;
    this.sunLight.shadow.camera.top = 84;
    this.sunLight.shadow.camera.bottom = -84;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.04;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Procedural PBR-inspired tile materials
    const facadeSet = createIstanbulFacadeTextures(Math.min(4, maxAniso));
    const roadTex = createAsphaltRoadTexture(maxAniso);
    const parkTex = createParkGrassTexture(Math.min(4, maxAniso));
    const contactShadowTex = createContactShadowTexture();
    this.disposableTextures.push(
      facadeSet.upperMap,
      facadeSet.upperEmissiveMap,
      facadeSet.groundRoofMap,
      facadeSet.groundRoofEmissiveMap,
      roadTex,
      parkTex,
      contactShadowTex,
    );

    this.upperBuildingMat = new THREE.MeshStandardMaterial({
      map: facadeSet.upperMap,
      emissive: new THREE.Color(0xffb85c),
      emissiveMap: facadeSet.upperEmissiveMap,
      emissiveIntensity: 0.0,
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.05,
    });
    this.groundRoofMat = new THREE.MeshStandardMaterial({
      map: facadeSet.groundRoofMap,
      emissive: new THREE.Color(0xffb85c),
      emissiveMap: facadeSet.groundRoofEmissiveMap,
      emissiveIntensity: 0.0,
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.06,
    });
    this.roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.06,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.areaMat = new THREE.MeshStandardMaterial({
      map: parkTex,
      vertexColors: true,
      roughness: 0.95,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.propsMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.82,
      metalness: 0.08,
    });
    this.disposableMaterials.push(
      this.upperBuildingMat,
      this.groundRoofMat,
      this.roadMat,
      this.areaMat,
      this.propsMat,
    );

    // Copernicus DEM GLO-30 terrain mesh with crisp urban paving texture
    this.buildTerrainMesh(Math.min(4, maxAniso));

    // Sea plane (coastal peninsula) or distant hillside apron
    this.waterMesh = this.regionMeta.hasCoastalSea ? this.buildSeaMesh() : this.buildInlandApron();

    // Streamed 300m tiles root
    this.scene.add(this.tilesRoot);

    // Region landmarks (mosque domes/minarets + neighborhood POI markers)
    this.buildLandmarks();

    // Articulated stylized 3rd-person human protagonist (grounded sneakers at y = 0!)
    this.characterRig = createCharacterRig(contactShadowTex);
    this.disposableGeometries.push(...this.characterRig.geometries);
    this.disposableMaterials.push(...this.characterRig.materials);
    this.scene.add(this.characterRig.root);

    // Detailed stylized Istanbul Yellow Taxi (checkered stripe, TAKSİ sign, steerable rolling wheels!)
    this.taxiRig = createPlayerTaxiRig(contactShadowTex);
    this.disposableGeometries.push(...this.taxiRig.geometries);
    this.disposableMaterials.push(...this.taxiRig.materials);
    this.disposableTextures.push(...this.taxiRig.textures);
    this.scene.add(this.taxiRig.root);

    // Upgraded 4-part Instanced AI Traffic (4 draw calls total for up to 24 moving vehicles!)
    const chassisGeo = new THREE.BoxGeometry(1.86, 0.56, 4.25);
    const cabinGeo = new THREE.BoxGeometry(1.56, 0.46, 2.15);
    const roofGeo = new THREE.BoxGeometry(1.58, 0.1, 2.05);
    const underGeo = new THREE.BoxGeometry(1.94, 0.34, 3.35);

    const chassisMat = new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.28 });
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x243b53,
      roughness: 0.16,
      metalness: 0.55,
    });
    const roofMat = new THREE.MeshStandardMaterial({ roughness: 0.36, metalness: 0.25 });
    const underMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.9 });

    this.disposableGeometries.push(chassisGeo, cabinGeo, roofGeo, underGeo);
    this.disposableMaterials.push(chassisMat, cabinMat, roofMat, underMat);

    this.trafficChassisInst = new THREE.InstancedMesh(
      chassisGeo,
      chassisMat,
      this.maxTrafficInstances,
    );
    this.trafficCabinInst = new THREE.InstancedMesh(cabinGeo, cabinMat, this.maxTrafficInstances);
    this.trafficRoofInst = new THREE.InstancedMesh(roofGeo, roofMat, this.maxTrafficInstances);
    this.trafficUnderInst = new THREE.InstancedMesh(underGeo, underMat, this.maxTrafficInstances);

    for (const inst of [
      this.trafficChassisInst,
      this.trafficCabinInst,
      this.trafficRoofInst,
      this.trafficUnderInst,
    ]) {
      inst.count = 0;
      inst.frustumCulled = false;
      this.scene.add(inst);
    }

    // Instanced sidewalk pedestrians (3 draw calls total for 36 living city walkers!)
    const pedLegsGeo = new THREE.BoxGeometry(0.32, 0.78, 0.22);
    const pedTorsoGeo = new THREE.BoxGeometry(0.42, 0.56, 0.24);
    const pedHeadGeo = new THREE.SphereGeometry(0.145, 8, 8);
    const pedLegsMat = new THREE.MeshStandardMaterial({ roughness: 0.84 });
    const pedTorsoMat = new THREE.MeshStandardMaterial({ roughness: 0.72 });
    const pedHeadMat = new THREE.MeshStandardMaterial({ color: 0xe2ae88, roughness: 0.76 });
    this.disposableGeometries.push(pedLegsGeo, pedTorsoGeo, pedHeadGeo);
    this.disposableMaterials.push(pedLegsMat, pedTorsoMat, pedHeadMat);

    this.pedLegsInst = new THREE.InstancedMesh(pedLegsGeo, pedLegsMat, this.maxPedInstances);
    this.pedTorsoInst = new THREE.InstancedMesh(pedTorsoGeo, pedTorsoMat, this.maxPedInstances);
    this.pedHeadInst = new THREE.InstancedMesh(pedHeadGeo, pedHeadMat, this.maxPedInstances);
    for (const inst of [this.pedLegsInst, this.pedTorsoInst, this.pedHeadInst]) {
      inst.count = 0;
      inst.frustumCulled = false;
      this.scene.add(inst);
    }

    // Fictional Şehir Polisi patrol cars (merged navy-white cruiser + flashing roof lightbar)
    const policeBodyGeo = mergeColoredParts([
      { geometry: new THREE.BoxGeometry(1.94, 0.32, 3.4), color: 0x151921, position: [0, 0.24, 0] },
      { geometry: new THREE.BoxGeometry(1.88, 0.56, 4.35), color: 0x0f274a, position: [0, 0.58, 0] },
      { geometry: new THREE.BoxGeometry(1.91, 0.22, 2.2), color: 0xf8fafc, position: [0, 0.64, -0.05] },
      { geometry: new THREE.BoxGeometry(1.56, 0.46, 2.1), color: 0x1e334d, position: [0, 1.05, -0.15] },
      { geometry: new THREE.BoxGeometry(1.58, 0.1, 1.85), color: 0xf8fafc, position: [0, 1.32, -0.15] },
    ]);
    const policeBeaconGeo = new THREE.BoxGeometry(0.95, 0.16, 0.26);
    const policeBodyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.32,
      metalness: 0.34,
    });
    this.policeBeaconMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    this.disposableGeometries.push(policeBodyGeo, policeBeaconGeo);
    this.disposableMaterials.push(policeBodyMat, this.policeBeaconMat);

    this.policeBodyInst = new THREE.InstancedMesh(
      policeBodyGeo,
      policeBodyMat,
      this.maxPoliceInstances,
    );
    this.policeBeaconInst = new THREE.InstancedMesh(
      policeBeaconGeo,
      this.policeBeaconMat,
      this.maxPoliceInstances,
    );
    this.policeBodyInst.count = 0;
    this.policeBeaconInst.count = 0;
    this.policeBodyInst.frustumCulled = false;
    this.policeBeaconInst.frustumCulled = false;
    this.scene.add(this.policeBodyInst, this.policeBeaconInst);

    // Glowing 3D Taxi Mission pickup / drop-off ring & vertical sky beacon
    const mRingGeo = new THREE.RingGeometry(2.6, 3.55, 28);
    mRingGeo.rotateX(-Math.PI / 2);
    const mPillarGeo = new THREE.CylinderGeometry(0.65, 1.85, 28, 12, 1, true);
    this.missionRingMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.missionPillarMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.disposableGeometries.push(mRingGeo, mPillarGeo);
    this.disposableMaterials.push(this.missionRingMat, this.missionPillarMat);

    const mRing = new THREE.Mesh(mRingGeo, this.missionRingMat);
    mRing.position.y = 0.55;
    const mPillar = new THREE.Mesh(mPillarGeo, this.missionPillarMat);
    mPillar.position.y = 14.5;
    this.missionGroup.add(mRing, mPillar);
    this.missionGroup.visible = false;
    this.scene.add(this.missionGroup);

    this.applyLighting();
    this.applyQuality(initialQuality);
  }

  private buildTerrainMesh(anisotropy: number): void {
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
          baseColor.setHex(0x9a9488);
        } else if (this.regionMeta.character === 'residential-hillside') {
          // Warm sunlit Istanbul sidewalk concrete blending into soft hillside olive-stone
          baseColor.setRGB(0.68 + t * 0.05, 0.67 + t * 0.07, 0.63 + t * 0.03);
        } else {
          // Warm historic peninsula travertine paving stone
          baseColor.setRGB(0.74 + t * 0.05, 0.7 + t * 0.05, 0.62 + t * 0.03);
        }
        colors[idx * 3] = baseColor.r;
        colors[idx * 3 + 1] = baseColor.g;
        colors[idx * 3 + 2] = baseColor.b;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const groundTex = createUrbanGroundTexture(anisotropy);
    this.disposableTextures.push(groundTex);

    const mat = new THREE.MeshStandardMaterial({
      map: groundTex,
      vertexColors: true,
      roughness: 0.94,
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
      color: 0x184770,
      roughness: 0.22,
      metalness: 0.42,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0.35, 0);
    this.scene.add(mesh);
    this.disposableGeometries.push(geo);
    this.disposableMaterials.push(mat);
    return mesh;
  }

  private buildInlandApron(): THREE.Mesh | null {
    const geo = new THREE.PlaneGeometry(6000, 6000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x62666b,
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
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xede2cf, roughness: 0.78 });
    const obeliskMat = new THREE.MeshStandardMaterial({ color: 0xc9a378, roughness: 0.76 });
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xf5b800,
      emissive: 0xd97706,
      emissiveIntensity: 0.35,
      roughness: 0.35,
    });
    const safeRingMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
    });
    this.disposableMaterials.push(stoneMat, obeliskMat, beaconMat, safeRingMat);

    const mosqueMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0.16,
    });
    this.disposableMaterials.push(mosqueMat);

    const addMosque = (lm: LandmarkPin, domeRadius: number, minaretCount: number): void => {
      const g = new THREE.Group();
      const baseY = sampleTerrainElevation(this.terrain, lm.x, lm.z);
      g.position.set(lm.x, baseY, lm.z);

      const parts: ColoredGeometryPart[] = [
        {
          geometry: new THREE.BoxGeometry(domeRadius * 2.0, domeRadius * 0.82, domeRadius * 2.0),
          color: 0xede2cf,
          position: [0, domeRadius * 0.36, 0],
        },
        {
          geometry: new THREE.SphereGeometry(
            domeRadius * 0.92,
            18,
            12,
            0,
            Math.PI * 2,
            0,
            Math.PI * 0.52,
          ),
          color: 0x6d7d8e,
          position: [0, domeRadius * 0.78, 0],
        },
      ];

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
        parts.push(
          {
            geometry: new THREE.CylinderGeometry(0.68, 1.02, domeRadius * 2.25, 10),
            color: 0xede2cf,
            position: [ox, domeRadius * 1.12, oz],
          },
          {
            geometry: new THREE.ConeGeometry(0.84, 3.6, 10),
            color: 0x6d7d8e,
            position: [ox, domeRadius * 2.25 + 1.8, oz],
          },
        );
      }

      const mergedMosqueGeo = mergeColoredParts(parts);
      this.disposableGeometries.push(mergedMosqueGeo);
      const mosqueMesh = new THREE.Mesh(mergedMosqueGeo, mosqueMat);
      g.add(mosqueMesh);

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

    const poleGeo = new THREE.CylinderGeometry(0.16, 0.22, 4.8, 8);
    const orbGeo = new THREE.OctahedronGeometry(0.68, 0);
    this.disposableGeometries.push(poleGeo, orbGeo);

    for (const lm of this.manifest.landmarks) {
      if (lm.id === 'ayasofya') {
        addMosque(lm, 19, 4);
      } else if (lm.id === 'sultanahmet-camii') {
        addMosque(lm, 20, 6);
      } else if (lm.kind === 'mosque') {
        addMosque(lm, 9.5, 1);
      } else if (lm.id === 'hipodrom') {
        const ox = lm.x - 16;
        const oz = lm.z - 22;
        const baseY = sampleTerrainElevation(this.terrain, ox, oz);
        const obGeo = new THREE.CylinderGeometry(0.85, 1.55, 22, 4);
        this.disposableGeometries.push(obGeo);
        const ob = new THREE.Mesh(obGeo, obeliskMat);
        ob.position.set(ox, baseY + 11, oz);
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
        const baseY = sampleTerrainElevation(this.terrain, lm.x, lm.z);
        const marker = new THREE.Group();
        marker.position.set(lm.x, baseY, lm.z);
        const pole = new THREE.Mesh(poleGeo, stoneMat);
        pole.position.y = 2.4;
        const orb = new THREE.Mesh(orbGeo, beaconMat);
        orb.position.y = 5.2;
        marker.add(pole, orb);
        this.scene.add(marker);
      }
    }
  }

  /** Streams 300m offline tiles around (focusX, focusZ) with exact 2D polygon colliders & GPU disposal. */
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
          upperBuildingMat: this.upperBuildingMat,
          groundRoofMat: this.groundRoofMat,
          roadMat: this.roadMat,
          areaMat: this.areaMat,
          propsMat: this.propsMat,
        },
        getQualityPreset(this.qualityTier).shadowsEnabled,
        true,
      );
      this.tilesRoot.add(built.group);
      this.loadedTiles.set(key, built);
      this.activeBuildings += built.buildingCount;
      // Register EXACT 2D polygon rings so diagonal streets have zero phantom AABB roadblocks!
      this.spatialGrid.addTile(
        key,
        tile.buildings.map((b) => ({
          id: b.id,
          minX: b.minX,
          maxX: b.maxX,
          minZ: b.minZ,
          maxZ: b.maxZ,
          ring: b.ring,
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

  getPlayerCameraView(): PlayerCameraView {
    return this.playerCameraView;
  }

  cyclePlayerCameraView(): PlayerCameraView {
    const idx = CAMERA_VIEW_ORDER.indexOf(this.playerCameraView);
    this.playerCameraView = CAMERA_VIEW_ORDER[(idx + 1) % CAMERA_VIEW_ORDER.length]!;
    return this.playerCameraView;
  }

  setPlayerCameraView(view: PlayerCameraView): void {
    this.playerCameraView = view;
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
    const farDist = preset.fogFar + 190;
    if (this.timeOfDay === 'day') {
      this.skyMat.map = this.daySkyTex;
      this.skyMat.needsUpdate = true;
      this.scene.background = new THREE.Color(0xcde3f2);
      this.scene.fog = new THREE.Fog(0xd4e5f0, preset.fogNear * 1.15, farDist);
      this.hemiLight.color.setHex(0xd6eeff);
      this.hemiLight.groundColor.setHex(0x807263);
      this.hemiLight.intensity = 1.15;
      this.sunLight.color.setHex(0xfff1d4);
      this.sunLight.intensity = 2.25;
      this.upperBuildingMat.emissiveIntensity = 0.0;
      this.groundRoofMat.emissiveIntensity = 0.04;
      this.taxiRig.vehicleHeadLight.intensity = 0;
      this.renderer.toneMappingExposure = 1.08;
    } else {
      this.skyMat.map = this.nightSkyTex;
      this.skyMat.needsUpdate = true;
      this.scene.background = new THREE.Color(0x0b152c);
      this.scene.fog = new THREE.Fog(0x101c36, preset.fogNear * 0.85, farDist * 0.9);
      this.hemiLight.color.setHex(0x5578b4);
      this.hemiLight.groundColor.setHex(0x1c2336);
      this.hemiLight.intensity = 0.65;
      this.sunLight.color.setHex(0xaac4f6);
      this.sunLight.intensity = 0.92;
      this.upperBuildingMat.emissiveIntensity = 1.08;
      this.groundRoofMat.emissiveIntensity = 1.15;
      this.taxiRig.vehicleHeadLight.intensity = 24;
      this.renderer.toneMappingExposure = 1.16;
    }
  }

  applyQuality(tier: QualityTier): void {
    this.qualityTier = tier;
    const preset = getQualityPreset(tier);
    const dpr = Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = preset.shadowsEnabled;
    this.sunLight.castShadow = preset.shadowsEnabled;
    this.camera.far = preset.drawDistance + 480;
    this.camera.updateProjectionMatrix();
    this.applyLighting();
  }

  updateTraffic(agents: readonly TrafficAgent[]): void {
    const count = Math.min(agents.length, this.maxTrafficInstances);
    this.trafficChassisInst.count = count;
    this.trafficCabinInst.count = count;
    this.trafficRoofInst.count = count;
    this.trafficUnderInst.count = count;

    for (let i = 0; i < count; i += 1) {
      const a = agents[i]!;
      const scaleY = a.archetype === 'dolmus' ? 1.32 : 1.0;
      const scaleZ = a.archetype === 'dolmus' ? 1.15 : 1.0;
      const baseRoadY = a.y + 0.34;

      const color =
        a.archetype === 'taxi'
          ? TRAFFIC_COLORS[0]!
          : a.archetype === 'dolmus'
            ? TRAFFIC_COLORS[1]!
            : TRAFFIC_COLORS[2 + (a.colorIndex % 3)]!;

      // Undercarriage / wheel shadow block (slope-aligned to hills!)
      this.dummyObj.rotation.order = 'YXZ';
      this.dummyObj.position.set(a.x, baseRoadY + 0.24, a.z);
      this.dummyObj.rotation.set(-a.pitch, a.heading, 0);
      this.dummyObj.scale.set(1, 1, scaleZ);
      this.dummyObj.updateMatrix();
      this.trafficUnderInst.setMatrixAt(i, this.dummyObj.matrix);

      // Lower painted chassis
      this.dummyObj.position.set(a.x, baseRoadY + 0.56 * scaleY, a.z);
      this.dummyObj.scale.set(1, scaleY, scaleZ);
      this.dummyObj.updateMatrix();
      this.trafficChassisInst.setMatrixAt(i, this.dummyObj.matrix);
      this.trafficChassisInst.setColorAt(i, color);

      // Glossy dark greenhouse cabin
      this.dummyObj.position.set(a.x, baseRoadY + 1.04 * scaleY, a.z);
      this.dummyObj.scale.set(1, scaleY * 0.9, scaleZ * 0.92);
      this.dummyObj.updateMatrix();
      this.trafficCabinInst.setMatrixAt(i, this.dummyObj.matrix);

      // Painted roof cap
      this.dummyObj.position.set(a.x, baseRoadY + 1.3 * scaleY, a.z);
      this.dummyObj.scale.set(1, 1, scaleZ * 0.88);
      this.dummyObj.updateMatrix();
      this.trafficRoofInst.setMatrixAt(i, this.dummyObj.matrix);
      this.trafficRoofInst.setColorAt(i, color);
    }

    this.trafficUnderInst.instanceMatrix.needsUpdate = true;
    this.trafficChassisInst.instanceMatrix.needsUpdate = true;
    this.trafficCabinInst.instanceMatrix.needsUpdate = true;
    this.trafficRoofInst.instanceMatrix.needsUpdate = true;
    if (this.trafficChassisInst.instanceColor) {
      this.trafficChassisInst.instanceColor.needsUpdate = true;
    }
    if (this.trafficRoofInst.instanceColor) {
      this.trafficRoofInst.instanceColor.needsUpdate = true;
    }
  }

  updatePedestrians(agents: readonly PedestrianAgent[]): void {
    const count = Math.min(agents.length, this.maxPedInstances);
    this.pedLegsInst.count = count;
    this.pedTorsoInst.count = count;
    this.pedHeadInst.count = count;

    for (let i = 0; i < count; i += 1) {
      const p = agents[i]!;
      const bob = Math.abs(Math.sin(p.stridePhase)) * 0.055;
      const baseY = p.y + 0.34;

      this.dummyObj.rotation.set(0, p.heading, 0);
      this.dummyObj.scale.set(1, 1, 1);

      this.dummyObj.position.set(p.x, baseY + 0.39 + bob * 0.4, p.z);
      this.dummyObj.updateMatrix();
      this.pedLegsInst.setMatrixAt(i, this.dummyObj.matrix);
      this.pedLegsInst.setColorAt(i, PED_PANTS_COLORS[p.pantsColorIndex % PED_PANTS_COLORS.length]!);

      this.dummyObj.position.set(p.x, baseY + 1.05 + bob, p.z);
      this.dummyObj.updateMatrix();
      this.pedTorsoInst.setMatrixAt(i, this.dummyObj.matrix);
      this.pedTorsoInst.setColorAt(i, PED_SHIRT_COLORS[p.shirtColorIndex % PED_SHIRT_COLORS.length]!);

      this.dummyObj.position.set(p.x, baseY + 1.52 + bob, p.z);
      this.dummyObj.updateMatrix();
      this.pedHeadInst.setMatrixAt(i, this.dummyObj.matrix);
    }

    this.pedLegsInst.instanceMatrix.needsUpdate = true;
    this.pedTorsoInst.instanceMatrix.needsUpdate = true;
    this.pedHeadInst.instanceMatrix.needsUpdate = true;
    if (this.pedLegsInst.instanceColor) this.pedLegsInst.instanceColor.needsUpdate = true;
    if (this.pedTorsoInst.instanceColor) this.pedTorsoInst.instanceColor.needsUpdate = true;
  }

  updatePolice(units: readonly PoliceUnit[]): void {
    let activeCount = 0;
    for (const u of units) {
      if (!u.active || activeCount >= this.maxPoliceInstances) continue;
      const baseY = u.y + 0.35;
      this.dummyObj.rotation.set(0, u.heading, 0);
      this.dummyObj.scale.set(1, 1, 1);
      this.dummyObj.position.set(u.x, baseY, u.z);
      this.dummyObj.updateMatrix();
      this.policeBodyInst.setMatrixAt(activeCount, this.dummyObj.matrix);

      this.dummyObj.position.set(u.x, baseY + 1.44, u.z);
      this.dummyObj.updateMatrix();
      this.policeBeaconInst.setMatrixAt(activeCount, this.dummyObj.matrix);
      activeCount += 1;
    }

    this.policeBodyInst.count = activeCount;
    this.policeBeaconInst.count = activeCount;
    if (activeCount > 0) {
      this.policeBodyInst.instanceMatrix.needsUpdate = true;
      this.policeBeaconInst.instanceMatrix.needsUpdate = true;
      const flashBlue = Math.floor(this.elapsed * 7) % 2 === 0;
      this.policeBeaconMat.color.setHex(flashBlue ? 0x3b82f6 : 0xef4444);
    }
  }

  updateMissionBeacon(mission: ActiveTaxiMission | null): void {
    if (!mission) {
      this.missionGroup.visible = false;
      return;
    }
    this.missionGroup.visible = true;
    const baseY = sampleTerrainElevation(this.terrain, mission.targetX, mission.targetZ);
    this.missionGroup.position.set(mission.targetX, baseY, mission.targetZ);
    const pulse = 1 + Math.sin(this.elapsed * 4.5) * 0.1;
    this.missionGroup.scale.set(pulse, 1, pulse);
    const hex = mission.phase === 'pickup' ? 0x22c55e : 0xf5b800;
    this.missionRingMat.color.setHex(hex);
    this.missionPillarMat.color.setHex(hex);
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

    // Align detailed player Sarı Taksi smoothly to hillside pitch + roll (grounded cleanly on asphalt)
    const sinH = Math.sin(vehicle.heading);
    const cosH = Math.cos(vehicle.heading);
    const yFront = sampleTerrainElevation(
      this.terrain,
      vehicle.x + sinH * 1.8,
      vehicle.z + cosH * 1.8,
    );
    const yRear = sampleTerrainElevation(
      this.terrain,
      vehicle.x - sinH * 1.8,
      vehicle.z - cosH * 1.8,
    );
    const yLeft = sampleTerrainElevation(
      this.terrain,
      vehicle.x + cosH * 0.95,
      vehicle.z - sinH * 0.95,
    );
    const yRight = sampleTerrainElevation(
      this.terrain,
      vehicle.x - cosH * 0.95,
      vehicle.z + sinH * 0.95,
    );
    const slopePitch = Math.atan2(yFront - yRear, 3.6);
    const slopeRoll = Math.atan2(yLeft - yRight, 1.9);
    const avgY = Math.max(vehicle.y, (yFront + yRear + yLeft + yRight) * 0.25);

    this.taxiRig.root.position.set(vehicle.x, avgY + 0.35, vehicle.z);
    this.taxiRig.root.rotation.set(-slopePitch, vehicle.heading, slopeRoll, 'YXZ');
    updatePlayerTaxiRig(this.taxiRig, vehicle);

    // Update grounded articulated on-foot human character
    this.characterRig.root.visible = !inVehicle;
    if (!inVehicle) {
      const horizSpeed = Math.hypot(velX, velZ);
      if (horizSpeed > 0.2) {
        const targetHeading = Math.atan2(velX, velZ);
        let diff = targetHeading - this.avatarHeading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.avatarHeading += diff * Math.min(1, dt * 11);
      }
      // Sneakers bottom sits at local y=0; road deck sits at terrain + ~0.34m -> ZERO floating!
      this.characterRig.root.position.set(playerX, playerY + 0.34, playerZ);
      this.characterRig.root.rotation.y = this.avatarHeading;
      animateCharacterRig(this.characterRig, horizSpeed, dt);
    }

    const focusX = inVehicle ? vehicle.x : playerX;
    const focusY = inVehicle ? vehicle.y : playerY;
    const focusZ = inVehicle ? vehicle.z : playerZ;

    // Keep shadow frustum centered tightly around active focus
    this.sunLight.position.set(focusX + 88, focusY + 128, focusZ + 62);
    this.sunLight.target.position.set(focusX, focusY, focusZ);
    this.sunLight.target.updateMatrixWorld();

    // Dynamic driving FOV for crisp sense of speed
    const targetFov = inVehicle ? 60 + Math.min(7, Math.abs(vehicle.speed) * 0.28) : 60;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }

    // Camera positioning
    if (this.qaCameraMode === 'overview') {
      this.camera.position.set(focusX + 85, focusY + 72, focusZ + 95);
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
    } else if (this.playerCameraView === 'hood' && inVehicle) {
      // First-person Hood / Windshield driving POV (favorite in mobile driving games!)
      const hX = focusX + sinH * 0.55;
      const hZ = focusZ + cosH * 0.55;
      this.camera.position.set(hX, avgY + 1.95, hZ);
      this.camera.lookAt(
        focusX + sinH * 28,
        avgY + 1.55 - Math.sin(slopePitch) * 14,
        focusZ + cosH * 28,
      );
      this.cameraYaw = vehicle.heading + Math.PI;
    } else if (this.playerCameraView === 'topdown') {
      // Classic top-down GTA-style city camera
      const tdHeight = inVehicle ? 36 : 26;
      this.camera.position.x = damp(this.camera.position.x, focusX, 8, dt);
      this.camera.position.y = damp(this.camera.position.y, focusY + tdHeight, 8, dt);
      this.camera.position.z = damp(this.camera.position.z, focusZ + 11, 8, dt);
      this.camera.lookAt(focusX, focusY + 1, focusZ);
    } else {
      // Dynamic 3rd-person follow (Chase or Wide Action Chase)
      if (inVehicle && Math.abs(vehicle.speed) > 0.9) {
        const desiredYaw = vehicle.heading + Math.PI;
        let diff = desiredYaw - this.cameraYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.cameraYaw += diff * Math.min(1, dt * 4.2);
      }

      const wide = this.playerCameraView === 'wide';
      const camDist = inVehicle ? (wide ? 12.8 : 9.6) : wide ? 9.6 : 7.4;
      const camHeight = inVehicle ? (wide ? 5.2 : 3.8) : wide ? 4.4 : 3.35;
      const desiredX = focusX + Math.sin(this.cameraYaw) * camDist;
      const desiredZ = focusZ + Math.cos(this.cameraYaw) * camDist;
      const camGroundY = sampleTerrainElevation(this.terrain, desiredX, desiredZ);
      const desiredY = Math.max(focusY + camHeight, camGroundY + 2.4);

      this.camera.position.x = damp(this.camera.position.x, desiredX, 9, dt);
      this.camera.position.y = damp(this.camera.position.y, desiredY, 9, dt);
      this.camera.position.z = damp(this.camera.position.z, desiredZ, 9, dt);
      this.camera.lookAt(focusX, focusY + (inVehicle ? 1.45 : 1.55), focusZ);
    }

    // Keep sky dome centered on camera so horizon never clips or shifts
    this.skyDome.position.copy(this.camera.position);

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
    this.resizeObserver?.disconnect();
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
