import * as THREE from 'three';
import type { TimeOfDay } from '../core/diagnostics';
import { damp } from '../core/math';
import type { PedestrianAgent } from '../core/pedestrians';
import { getQualityPreset, type QualityTier } from '../core/quality';
import { getTimeCycleProfile } from '../core/timeCycle';
import type { TrafficAgent } from '../core/traffic';
import type { PlayerVehicleState, VehicleArchetype } from '../core/vehicle';
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
  poseCharacterSeated,
  type CharacterRig,
} from './characterMesh';
import { mergeColoredParts, type ColoredGeometryPart } from './meshMerge';
import { ensureMeshOptimizerReady } from './meshOptimizer';
import {
  createAsphaltRoadTexture,
  createContactShadowTexture,
  createIstanbulFacadeTextures,
  createParkGrassTexture,
  createSkyDomeTexture,
  createUrbanGroundTexture,
} from './proceduralTextures';
import {
  applyTileDistanceLod,
  buildTileMeshes,
  type BuiltTileGroup,
} from './tileMeshBuilder';
import { VehicleEffectsSystem } from './vehicleEffects';
import {
  buildTrafficClassGeometries,
  createPlayerTaxiRig,
  mapArchetypeToTrafficClass,
  setPlayerVehicleAppearance,
  updatePlayerTaxiRig,
  type PlayerTaxiRig,
  type TrafficVisualClass,
} from './vehicleMesh';

export type QaCameraMode = 'follow' | 'street' | 'overview';
export type PlayerCameraView = 'chase' | 'wide' | 'hood' | 'bumper' | 'topdown';

const CAMERA_VIEW_ORDER: readonly PlayerCameraView[] = ['chase', 'wide', 'hood', 'bumper', 'topdown'];

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

interface TrafficInstancedClass {
  bodyInst: THREE.InstancedMesh;
  trimWheelsInst: THREE.InstancedMesh;
  glassInst: THREE.InstancedMesh;
  lightsInst: THREE.InstancedMesh;
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
  private readonly loadedTileKeys = new Set<string>();
  private readonly inflightTiles = new Set<string>();
  private readonly tilesRoot = new THREE.Group();
  private readonly bgColor = new THREE.Color();
  private readonly sceneFog = new THREE.Fog(0xbad6ea, 120, 420);

  private readonly hemiLight: THREE.HemisphereLight;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly skyDome: THREE.Mesh;
  private readonly skyMat: THREE.MeshBasicMaterial;
  private readonly daySkyTex: THREE.CanvasTexture;
  private readonly sunsetSkyTex: THREE.CanvasTexture;
  private readonly nightSkyTex: THREE.CanvasTexture;
  private readonly waterMesh: THREE.Mesh | null;
  private readonly characterRig: CharacterRig;
  private characterMountedInTaxi = false;
  private readonly taxiRig: PlayerTaxiRig;

  // Sculpted 3-class instanced AI traffic (Sports Coupe, Street Sedan, Crossover SUV — real wheels, sloped glass & LED lights!)
  private readonly trafficClasses: Record<TrafficVisualClass, TrafficInstancedClass>;
  private readonly trafficColorScratch = new THREE.Color();
  private readonly maxTrafficInstances = 36;

  // Instanced sidewalk pedestrians (only 3 draw calls for up to 56 people across Ultra tier!)
  private readonly pedLegsInst: THREE.InstancedMesh;
  private readonly pedTorsoInst: THREE.InstancedMesh;
  private readonly pedHeadInst: THREE.InstancedMesh;
  private readonly maxPedInstances = 56;
  private lastPedCount = -1;

  // Pooled 3D asphalt skidmarks, volumetric drift smoke & impact sparks (3 draw calls total)
  private readonly vehicleEffects = new VehicleEffectsSystem();

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
    void ensureMeshOptimizerReady();
    this.regionMeta = regionMeta;
    this.manifest = manifest;
    this.terrain = terrain;
    this.availableTileSet = new Set(manifest.availableTiles);
    this.qualityTier = initialQuality;
    this.timeOfDay = initialTimeOfDay;
    this.cameraYaw = manifest.spawn.heading + Math.PI;

    this.renderer = new THREE.WebGLRenderer({
      antialias: initialQuality !== 'low',
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
    this.sunsetSkyTex = createSkyDomeTexture('sunset');
    this.nightSkyTex = createSkyDomeTexture('night');
    this.disposableTextures.push(this.daySkyTex, this.sunsetSkyTex, this.nightSkyTex);

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

    // Focused crisp shadow frustum (±84m on 1024px -> ~16 cm/texel, 4x faster on mobile & SwiftShader!)
    this.sunLight = new THREE.DirectionalLight(0xfff1d6, 2.25);
    this.sunLight.shadow.mapSize.set(1024, 1024);
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

    // Detailed GTA Free-Roam Coastal Sports Coupe (dynamically adapts paint & class when entering any street car!)
    this.taxiRig = createPlayerTaxiRig(contactShadowTex, 'sports');
    this.disposableGeometries.push(...this.taxiRig.geometries);
    this.disposableMaterials.push(...this.taxiRig.materials);
    this.disposableTextures.push(...this.taxiRig.textures);
    this.scene.add(this.taxiRig.root);

    // Sculpted 3-class GPU-instanced AI Traffic (Sports Coupe, Sedan/Hatchback, Crossover SUV/Van)
    // Shared materials -> ultra-low mobile draw calls with real 3D cylinder tires, alloy rims, sloped glass & LED lights!
    const trafficBodyMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.26,
      metalness: 0.42,
    });
    const trafficTrimMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.56,
      metalness: 0.3,
    });
    const trafficGlassMat = new THREE.MeshStandardMaterial({
      color: 0x162538,
      roughness: 0.08,
      metalness: 0.84,
    });
    const trafficLightsMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.disposableMaterials.push(trafficBodyMat, trafficTrimMat, trafficGlassMat, trafficLightsMat);

    const buildTrafficClassMeshSet = (style: TrafficVisualClass): TrafficInstancedClass => {
      const geos = buildTrafficClassGeometries(style);
      this.disposableGeometries.push(geos.bodyGeo, geos.trimWheelsGeo, geos.glassGeo, geos.lightsGeo);
      const bodyInst = new THREE.InstancedMesh(geos.bodyGeo, trafficBodyMat, this.maxTrafficInstances);
      const trimWheelsInst = new THREE.InstancedMesh(
        geos.trimWheelsGeo,
        trafficTrimMat,
        this.maxTrafficInstances,
      );
      const glassInst = new THREE.InstancedMesh(
        geos.glassGeo,
        trafficGlassMat,
        this.maxTrafficInstances,
      );
      const lightsInst = new THREE.InstancedMesh(
        geos.lightsGeo,
        trafficLightsMat,
        this.maxTrafficInstances,
      );
      for (const inst of [bodyInst, trimWheelsInst, glassInst, lightsInst]) {
        inst.count = 0;
        inst.frustumCulled = false;
        this.scene.add(inst);
      }
      return { bodyInst, trimWheelsInst, glassInst, lightsInst };
    };

    this.trafficClasses = {
      sports: buildTrafficClassMeshSet('sports'),
      sedan: buildTrafficClassMeshSet('sedan'),
      suv: buildTrafficClassMeshSet('suv'),
    };

    // Sculpted instanced sidewalk pedestrians (same 3 draw calls for 56 walkers — real twin legs, arms & hair!)
    const pedLegsGeo = mergeColoredParts([
      { geometry: new THREE.CylinderGeometry(0.08, 0.068, 0.72, 7), color: 0xffffff, position: [-0.095, 0, 0] },
      { geometry: new THREE.CylinderGeometry(0.08, 0.068, 0.72, 7), color: 0xffffff, position: [0.095, 0, 0] },
      { geometry: new THREE.BoxGeometry(0.11, 0.08, 0.2), color: 0xe2e8f0, position: [-0.095, -0.35, 0.03] },
      { geometry: new THREE.BoxGeometry(0.11, 0.08, 0.2), color: 0xe2e8f0, position: [0.095, -0.35, 0.03] },
    ]);
    const pedTorsoGeo = mergeColoredParts([
      { geometry: new THREE.BoxGeometry(0.38, 0.54, 0.21), color: 0xffffff, position: [0, 0, 0] },
      { geometry: new THREE.CylinderGeometry(0.06, 0.052, 0.48, 7), color: 0xf4f6f9, position: [-0.24, -0.02, 0] },
      { geometry: new THREE.CylinderGeometry(0.06, 0.052, 0.48, 7), color: 0xf4f6f9, position: [0.24, -0.02, 0] },
    ]);
    const pedHeadGeo = mergeColoredParts([
      { geometry: new THREE.SphereGeometry(0.135, 9, 9), color: 0xe5b28c, position: [0, 0, 0], scale: [0.92, 1.06, 0.95] },
      {
        geometry: new THREE.SphereGeometry(0.142, 9, 7, 0, Math.PI * 2, 0, Math.PI * 0.58),
        color: 0x1e1a18,
        position: [0, 0.02, -0.015],
        rotation: [-0.2, 0, 0],
      },
    ]);
    const pedLegsMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
    const pedTorsoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68 });
    const pedHeadMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.74 });
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

    // Add pooled asphalt skidmarks, drift smoke & collision sparks
    this.scene.add(this.vehicleEffects.group);

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
    const preset = getQualityPreset(this.qualityTier);
    const loadRadius = preset.streamingRadius;
    const diff = planTileStreaming(
      focusX,
      focusZ,
      loadRadius,
      this.loadedTileKeys,
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
      this.loadedTileKeys.delete(key);
      this.spatialGrid.removeTile(key);
    }

    for (const key of diff.toLoad) {
      if (this.loadedTiles.has(key) || this.inflightTiles.has(key)) continue;
      this.inflightTiles.add(key);
      void this.loadTile(key, focusX, focusZ);
    }

    // Apply 4-tier Android distance-based tile LOD (culls distant props & shadows smoothly)
    for (const tile of this.loadedTiles.values()) {
      applyTileDistanceLod(
        tile,
        focusX,
        focusZ,
        preset.shadowsEnabled,
        preset.propLodDistance,
        preset.shadowLodDistance,
      );
    }
  }

  private async loadTile(key: string, focusX: number, focusZ: number): Promise<void> {
    try {
      const res = await fetch(`${this.regionMeta.baseUrl}/tiles/${key}.json`);
      if (!res.ok) return;
      const tile = (await res.json()) as RegionTileData;
      if (this.disposed || this.loadedTiles.has(key)) return;

      const preset = getQualityPreset(this.qualityTier);
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
        preset.shadowsEnabled,
        true,
        this.manifest.tileSize,
      );
      applyTileDistanceLod(
        built,
        focusX,
        focusZ,
        preset.shadowsEnabled,
        preset.propLodDistance,
        preset.shadowLodDistance,
      );
      this.tilesRoot.add(built.group);
      this.loadedTiles.set(key, built);
      this.loadedTileKeys.add(key);
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

  isCharacterMountedInTaxi(): boolean {
    return (
      this.characterMountedInTaxi &&
      this.characterRig.root.parent === this.taxiRig.driverSeatMount &&
      this.characterRig.root.visible
    );
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
    const tc = getTimeCycleProfile(this.timeOfDay);
    const farDist = preset.fogFar + 190;

    this.skyMat.map =
      this.timeOfDay === 'day'
        ? this.daySkyTex
        : this.timeOfDay === 'sunset'
          ? this.sunsetSkyTex
          : this.nightSkyTex;
    this.skyMat.needsUpdate = true;

    this.bgColor.setHex(tc.skyHorizonHex);
    this.scene.background = this.bgColor;
    this.sceneFog.color.setHex(tc.fogHex);
    this.sceneFog.near = preset.fogNear * (this.timeOfDay === 'night' ? 0.85 : 1.08);
    this.sceneFog.far = farDist * (this.timeOfDay === 'night' ? 0.9 : 1.0);
    this.scene.fog = this.sceneFog;
    this.hemiLight.color.setHex(tc.hemiSkyHex);
    this.hemiLight.groundColor.setHex(tc.hemiGroundHex);
    this.hemiLight.intensity = tc.hemiIntensity * 1.4;
    this.sunLight.color.setHex(tc.sunHex);
    this.sunLight.intensity = tc.sunIntensity * 1.45;
    this.upperBuildingMat.emissiveIntensity = tc.windowEmissiveIntensity;
    this.groundRoofMat.emissiveIntensity = tc.groundEmissiveIntensity;
    // Wet-asphalt twilight & midnight specular sheen (Vice City rain-washed avenue feel!)
    this.roadMat.roughness = tc.roadRoughness;
    this.roadMat.metalness = tc.roadMetalness;
    this.taxiRig.vehicleHeadLight.intensity = tc.headlightIntensity * 7.2;
    this.renderer.toneMappingExposure = tc.exposure;
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

  setPlayerVehicleStyle(archetype: VehicleArchetype, paintHex: number): void {
    setPlayerVehicleAppearance(this.taxiRig, archetype, paintHex);
  }

  updateTraffic(agents: readonly TrafficAgent[]): void {
    const counts: Record<TrafficVisualClass, number> = { sports: 0, sedan: 0, suv: 0 };

    for (let i = 0; i < agents.length; i += 1) {
      const a = agents[i]!;
      const cls = mapArchetypeToTrafficClass(a.archetype);
      const idx = counts[cls];
      if (idx >= this.maxTrafficInstances) continue;
      counts[cls] = idx + 1;

      const bucket = this.trafficClasses[cls];
      const baseRoadY = a.y + 0.31;
      const scaleZ = a.archetype === 'hatchback' ? 0.91 : a.archetype === 'van' || a.archetype === 'dolmus' ? 1.07 : 1.0;
      const scaleY = a.archetype === 'van' || a.archetype === 'dolmus' ? 1.12 : 1.0;

      this.dummyObj.rotation.order = 'YXZ';
      this.dummyObj.position.set(a.x, baseRoadY, a.z);
      this.dummyObj.rotation.set(-a.pitch, a.heading, 0);
      this.dummyObj.scale.set(1, scaleY, scaleZ);
      this.dummyObj.updateMatrix();

      this.trafficColorScratch.setHex(a.paintHex);
      bucket.bodyInst.setMatrixAt(idx, this.dummyObj.matrix);
      bucket.bodyInst.setColorAt(idx, this.trafficColorScratch);
      bucket.trimWheelsInst.setMatrixAt(idx, this.dummyObj.matrix);
      bucket.glassInst.setMatrixAt(idx, this.dummyObj.matrix);
      bucket.lightsInst.setMatrixAt(idx, this.dummyObj.matrix);
    }

    for (const cls of ['sports', 'sedan', 'suv'] as const) {
      const bucket = this.trafficClasses[cls];
      const c = counts[cls];
      bucket.bodyInst.count = c;
      bucket.trimWheelsInst.count = c;
      bucket.glassInst.count = c;
      bucket.lightsInst.count = c;
      if (c > 0) {
        bucket.bodyInst.instanceMatrix.needsUpdate = true;
        bucket.trimWheelsInst.instanceMatrix.needsUpdate = true;
        bucket.glassInst.instanceMatrix.needsUpdate = true;
        bucket.lightsInst.instanceMatrix.needsUpdate = true;
        if (bucket.bodyInst.instanceColor) {
          bucket.bodyInst.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  updatePedestrians(agents: readonly PedestrianAgent[]): void {
    const count = Math.min(agents.length, this.maxPedInstances);
    const colorsDirty = count !== this.lastPedCount;
    this.lastPedCount = count;
    this.pedLegsInst.count = count;
    this.pedTorsoInst.count = count;
    this.pedHeadInst.count = count;

    for (let i = 0; i < count; i += 1) {
      const p = agents[i]!;
      const isIdle = p.behavior === 'idle';
      const bob = isIdle ? 0 : Math.abs(Math.sin(p.stridePhase)) * (p.behavior === 'run' ? 0.085 : 0.055);
      const lean = p.behavior === 'run' ? 0.14 : 0;
      const baseY = p.y + 0.34;

      this.dummyObj.rotation.set(lean, p.heading, 0);
      this.dummyObj.scale.set(1, 1, 1);

      this.dummyObj.position.set(p.x, baseY + 0.39 + bob * 0.4, p.z);
      this.dummyObj.updateMatrix();
      this.pedLegsInst.setMatrixAt(i, this.dummyObj.matrix);
      if (colorsDirty) {
        this.pedLegsInst.setColorAt(i, PED_PANTS_COLORS[p.pantsColorIndex % PED_PANTS_COLORS.length]!);
      }

      this.dummyObj.position.set(p.x, baseY + 1.05 + bob, p.z);
      this.dummyObj.updateMatrix();
      this.pedTorsoInst.setMatrixAt(i, this.dummyObj.matrix);
      if (colorsDirty) {
        this.pedTorsoInst.setColorAt(i, PED_SHIRT_COLORS[p.shirtColorIndex % PED_SHIRT_COLORS.length]!);
      }

      this.dummyObj.rotation.set(0, p.heading + p.lookYaw, 0);
      this.dummyObj.position.set(p.x, baseY + 1.52 + bob, p.z);
      this.dummyObj.updateMatrix();
      this.pedHeadInst.setMatrixAt(i, this.dummyObj.matrix);
    }

    this.pedLegsInst.instanceMatrix.needsUpdate = true;
    this.pedTorsoInst.instanceMatrix.needsUpdate = true;
    this.pedHeadInst.instanceMatrix.needsUpdate = true;
    if (colorsDirty) {
      if (this.pedLegsInst.instanceColor) this.pedLegsInst.instanceColor.needsUpdate = true;
      if (this.pedTorsoInst.instanceColor) this.pedTorsoInst.instanceColor.needsUpdate = true;
    }
  }

  emitCollisionSparks(x: number, y: number, z: number, count = 12): void {
    this.vehicleEffects.emitImpactSparks(x, y, z, count);
  }

  resetVehicleEffects(): void {
    this.vehicleEffects.reset();
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

    // Align detailed player vehicle smoothly to hillside pitch + roll (grounded cleanly on asphalt)
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

    this.taxiRig.root.position.set(vehicle.x, avgY + 0.26, vehicle.z);
    this.taxiRig.root.rotation.set(-slopePitch, vehicle.heading, slopeRoll, 'YXZ');
    updatePlayerTaxiRig(this.taxiRig, vehicle);

    // Seat Attachment: protagonist stays visibly seated inside the cabin!
    if (inVehicle) {
      if (!this.characterMountedInTaxi) {
        this.taxiRig.driverSeatMount.add(this.characterRig.root);
        this.characterRig.root.position.set(0, 0, 0);
        this.characterRig.root.rotation.set(0, 0, 0);
        this.characterMountedInTaxi = true;
      }
      // Visible through rear/side/windshield glass in Chase, Wide & Top-Down; hidden in Hood/Bumper POV
      this.characterRig.root.visible =
        this.playerCameraView !== 'hood' && this.playerCameraView !== 'bumper';
      poseCharacterSeated(this.characterRig, vehicle.steerVisual);
    } else {
      if (this.characterMountedInTaxi) {
        this.scene.add(this.characterRig.root);
        this.characterRig.shadowDisc.visible = true;
        this.characterMountedInTaxi = false;
      }
      this.characterRig.root.visible = true;
      const horizSpeed = Math.hypot(velX, velZ);
      if (horizSpeed > 0.2) {
        const targetHeading = Math.atan2(velX, velZ);
        let diff = targetHeading - this.avatarHeading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.avatarHeading += diff * Math.min(1, dt * 11);
      }
      this.characterRig.root.position.set(playerX, playerY + 0.24, playerZ);
      this.characterRig.root.rotation.set(0, this.avatarHeading, 0);
      animateCharacterRig(this.characterRig, horizSpeed, dt);
    }

    const focusX = inVehicle ? vehicle.x : playerX;
    const focusY = inVehicle ? vehicle.y : playerY;
    const focusZ = inVehicle ? vehicle.z : playerZ;

    // Keep shadow frustum centered tightly around active focus, tracking TimeCycle sun/moon angle
    const tc = getTimeCycleProfile(this.timeOfDay);
    this.sunLight.position.set(
      focusX + tc.sunOffset[0],
      focusY + tc.sunOffset[1],
      focusZ + tc.sunOffset[2],
    );
    this.sunLight.target.position.set(focusX, focusY, focusZ);
    this.sunLight.target.updateMatrixWorld();

    // CarX Street / GTA dynamic speed FOV (60° -> 75° for thrilling speed sensation!)
    const absCarSpeed = Math.hypot(vehicle.dyn.vx, vehicle.dyn.vz);
    const targetFov = inVehicle ? 60 + Math.min(15, absCarSpeed * 0.32) : 60;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, targetFov, 6, dt);
      this.camera.updateProjectionMatrix();
    }

    // Subtle impact + high-RPM micro-shake
    const shakeAmp = inVehicle ? vehicle.dyn.impactPulse * 0.16 : 0;
    const shakeX = shakeAmp > 0.002 ? Math.sin(this.elapsed * 58) * shakeAmp : 0;
    const shakeY = shakeAmp > 0.002 ? Math.cos(this.elapsed * 67) * shakeAmp * 0.7 : 0;

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
      // First-person Hood / Windshield driving POV
      const hX = focusX + sinH * 0.55 + shakeX * 0.35;
      const hZ = focusZ + cosH * 0.55;
      this.camera.position.set(hX, avgY + 1.88 + shakeY * 0.35, hZ);
      this.camera.lookAt(
        focusX + sinH * 28,
        avgY + 1.5 - Math.sin(slopePitch) * 14,
        focusZ + cosH * 28,
      );
      this.cameraYaw = vehicle.heading + Math.PI;
    } else if (this.playerCameraView === 'bumper' && inVehicle) {
      // Low-slung Racing Bumper POV (intense sense of speed!)
      const bX = focusX + sinH * 2.18 + shakeX * 0.4;
      const bZ = focusZ + cosH * 2.18;
      this.camera.position.set(bX, avgY + 0.92 + shakeY * 0.4, bZ);
      this.camera.lookAt(
        focusX + sinH * 30,
        avgY + 0.88 - Math.sin(slopePitch) * 14,
        focusZ + cosH * 30,
      );
      this.cameraYaw = vehicle.heading + Math.PI;
    } else if (this.playerCameraView === 'topdown') {
      const tdHeight = inVehicle ? 36 : 26;
      this.camera.position.x = damp(this.camera.position.x, focusX, 8, dt);
      this.camera.position.y = damp(this.camera.position.y, focusY + tdHeight, 8, dt);
      this.camera.position.z = damp(this.camera.position.z, focusZ + 11, 8, dt);
      this.camera.lookAt(focusX, focusY + 1, focusZ);
    } else {
      // CarX Street / GTA Dynamic 3rd-person Chase Camera:
      // Blends seamlessly toward velocity vector during drifts so corner exits stay dead-center!
      if (inVehicle && absCarSpeed > 0.9) {
        const velAngle = Math.atan2(vehicle.dyn.vx, vehicle.dyn.vz);
        const reverseDriving = vehicle.dyn.vLong < -1.5;
        let targetLookHeading = vehicle.heading;
        if (!reverseDriving && vehicle.dyn.vLong > 2.5) {
          let slipDiff = velAngle - vehicle.heading;
          while (slipDiff > Math.PI) slipDiff -= Math.PI * 2;
          while (slipDiff < -Math.PI) slipDiff += Math.PI * 2;
          // Blend 55% toward actual velocity direction during drifts
          targetLookHeading = vehicle.heading + slipDiff * 0.55;
        }
        const desiredYaw = targetLookHeading + Math.PI;
        let diff = desiredYaw - this.cameraYaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.cameraYaw += diff * Math.min(1, dt * (vehicle.drifting ? 5.6 : 4.6));
      }

      const wide = this.playerCameraView === 'wide';
      const speedPullback = inVehicle ? Math.min(1.6, absCarSpeed * 0.04) : 0;
      const camDist = inVehicle ? (wide ? 12.2 : 8.8) + speedPullback : wide ? 9.6 : 7.4;
      const camHeight = inVehicle ? (wide ? 4.8 : 3.45) : wide ? 4.4 : 3.35;
      const desiredX = focusX + Math.sin(this.cameraYaw) * camDist + shakeX;
      const desiredZ = focusZ + Math.cos(this.cameraYaw) * camDist;
      const camGroundY = sampleTerrainElevation(this.terrain, desiredX, desiredZ);
      const desiredY = Math.max(focusY + camHeight, camGroundY + 2.3) + shakeY;

      this.camera.position.x = damp(this.camera.position.x, desiredX, 10, dt);
      this.camera.position.y = damp(this.camera.position.y, desiredY, 10, dt);
      this.camera.position.z = damp(this.camera.position.z, desiredZ, 10, dt);
      this.camera.lookAt(
        focusX + sinH * (inVehicle ? 2.4 : 0),
        focusY + (inVehicle ? 1.38 : 1.55),
        focusZ + cosH * (inVehicle ? 2.4 : 0),
      );
    }

    // Step asphalt skidmarks, volumetric drift smoke & impact sparks
    this.vehicleEffects.update(vehicle, this.camera.position, dt, inVehicle);

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
    this.vehicleEffects.dispose();
    for (const tile of this.loadedTiles.values()) {
      for (const g of tile.geometries) g.dispose();
    }
    this.loadedTiles.clear();
    this.loadedTileKeys.clear();
    for (const g of this.disposableGeometries) g.dispose();
    for (const m of this.disposableMaterials) m.dispose();
    for (const t of this.disposableTextures) t.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
