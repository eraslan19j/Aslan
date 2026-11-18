import { Capacitor } from '@capacitor/core';
import './styles.css';
import { CrashLogStore } from './core/crashLog';
import { mergeControlIntent, type KeyboardInputState } from './core/controls';
import {
  parseUserAgentInfo,
  type DiagnosticsSnapshot,
  type TimeOfDay,
} from './core/diagnostics';
import { FixedStepClock } from './core/gameLoop';
import { clamp, distance2D } from './core/math';
import { PedestrianSimulator } from './core/pedestrians';
import { ensureRapierReady } from './core/physics';
import {
  attachPlayerToVehicleSeat,
  createPlayerCapsuleState,
  detachPlayerFromVehicleSeat,
  stepOnFootPlayer,
  type VehicleColliderOBB,
} from './core/playerController';
import {
  getQualityPreset,
  nextQualityTier,
  normalizeQualityTier,
  suggestQualityTier,
  type QualityTier,
} from './core/quality';
import { nextAtmospherePreset } from './core/timeCycle';
import { findSanctuaryZone } from './core/sanctuary';
import { SaveStore, type SaveData } from './core/save';
import {
  createDoorChoreography,
  startDoorSequence,
  stepDoorChoreography,
} from './render/doorChoreography';
import { buildBoardingPath } from './render/boardingPath';
import { RoadTrafficSimulator } from './core/traffic';
import {
  applyVehicleCollisionImpulse,
  computeSafeExitPosition,
  createVehicleState,
  ENTER_VEHICLE_DISTANCE,
  getVehicleColliderOBB,
  manualShiftVehicle,
  resetPlayerVehicleMotion,
  stepPlayerVehicle,
  type PlayerVehicleState,
  VEHICLE_SPECS,
} from './core/vehicle';
import {
  applyVehicleImpact,
  consumeDamageEvents,
  createDamageState,
  pickPanelForContact,
  repairVehicleDamage,
  updateVehicleCondition,
  vehicleConditionPercent,
  type VehicleDamageState,
} from './core/vehicleDamage';
import { formatVehicleSpecLine } from './core/vehicleCatalog';
import {
  cycleDrivingMode as nextDrivingMode,
  cycleSteeringControlMode as nextSteeringMode,
  VEHICLE_PHYSICS_SPECS,
  type DrivingMode,
  type GearDisplay,
  type SteeringControlMode as SteeringMode,
  type TransmissionMode,
} from './core/vehiclePhysics';
import {
  getRegionEntry,
  resolveRegionId,
  type RegionId,
  type RegionRegistryEntry,
} from './core/world/regions';
import { sampleTerrainElevation } from './core/world/terrain';
import type {
  LandmarkPin,
  RegionManifest,
  RoadGraph,
  TerrainGrid,
} from './core/world/types';
import {
  computePerimeterRoadBarriers,
  computePlayableWorldBounds,
  type PerimeterRoadBarrier,
  type PlayableWorldBounds,
} from './core/world/worldBounds';
import { getStrings } from './i18n/strings';
import {
  RegionWorldScene,
  type PlayerCameraView,
  type QaCameraMode,
} from './render/RegionWorldScene';
import { installGlobalErrorBoundary } from './runtime/errorBoundary';
import {
  getNativeHardwareProfile,
  HybridStorage,
  registerBackButtonHandler,
  setNativeGameState,
  triggerDrivingHaptic,
  triggerLightHaptic,
  type NativeHardwareProfile,
} from './runtime/nativeBridge';
import {
  ProceduralSoundEngine,
  type VehicleAudioTelemetry,
} from './runtime/soundEngine';
import { HudOverlay } from './ui/HudOverlay';
import { MinimapRenderer } from './ui/MinimapRenderer';

const APP_VERSION = '0.8.0';

interface ActiveRegionRuntime {
  meta: RegionRegistryEntry;
  manifest: RegionManifest;
  terrain: TerrainGrid;
  roadGraph: RoadGraph;
  playableBounds: PlayableWorldBounds;
  perimeterBarriers: PerimeterRoadBarrier[];
  scene: RegionWorldScene;
  traffic: RoadTrafficSimulator;
  pedestrians: PedestrianSimulator;
}

interface GameDebugHandle {
  version: string;
  regionId: RegionId;
  regionLoaded: boolean;
  paused: boolean;
  qualityTier: QualityTier;
  timeOfDay: TimeOfDay;
  cameraView: PlayerCameraView;
  audioMuted: boolean;
  audioBackend: string;
  locale: 'tr' | 'en';
  physicsReady: boolean;
  inVehicle: boolean;
  driverVisibleInCabin: boolean;
  drivingMode: DrivingMode;
  transmissionMode: TransmissionMode;
  steeringMode: SteeringMode;
  speedKph: number;
  gear: GearDisplay;
  rpm: number;
  turboBoost: number;
  driftAngleDeg: number;
  driftScore: number;
  trafficCount: number;
  pedestrianCount: number;
  sanctuaryId: string | null;
  player: { x: number; y: number; z: number };
  vehicle: { x: number; y: number; z: number; heading: number; speed: number };
  perf: {
    fps: number;
    frameMs: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    pixelRatio: number;
    loadedTiles: number;
    activeBuildings: number;
  };
  toggleQuality: () => void;
  setQuality: (tier: QualityTier) => void;
  toggleTimeOfDay: () => void;
  setTimeOfDay: (mode: TimeOfDay) => void;
  cycleCameraView: () => PlayerCameraView;
  cycleDrivingMode: () => DrivingMode;
  setDrivingMode: (mode: DrivingMode) => void;
  toggleTransmission: () => TransmissionMode;
  setTransmissionMode: (mode: TransmissionMode) => void;
  cycleSteeringMode: () => SteeringMode;
  shiftUp: () => void;
  shiftDown: () => void;
  toggleAudio: () => boolean;
  triggerHorn: () => void;
  callTaxi: () => void;
  setCameraMode: (mode: QaCameraMode) => void;
  toggleLocale: () => void;
  togglePause: () => void;
  openSettings: () => void;
  openAbout: () => void;
  closeModal: () => void;
  enterVehicle: () => void;
  exitVehicle: () => void;
  switchRegion: (regionId: RegionId) => Promise<void>;
  teleportTo: (x: number, z: number) => void;
  setRenderFrozen: (frozen: boolean) => void;
  getDiagnostics: () => DiagnosticsSnapshot;
  getCrashCount: () => number;
  /** v0.9.0 — current panel damage (0..100) and a full repair for the QA harness. */
  vehicleCondition: () => number;
  repairVehicle: () => boolean;
}

declare global {
  interface Window {
    __game?: GameDebugHandle;
  }
}

function detectTouchUi(params: URLSearchParams): boolean {
  if (params.get('touch') === '1') return true;
  if (params.get('touch') === '0') return false;
  if (Capacitor.isNativePlatform()) return true;
  if ((navigator.maxTouchPoints ?? 0) > 0) return true;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

function readJsHeapMb(): { used: number | null; total: number | null; limit: number | null } {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  };
  if (!perf.memory) return { used: null, total: null, limit: null };
  const mb = 1024 * 1024;
  return {
    used: Number((perf.memory.usedJSHeapSize / mb).toFixed(1)),
    total: Number((perf.memory.totalJSHeapSize / mb).toFixed(1)),
    limit: Number((perf.memory.jsHeapSizeLimit / mb).toFixed(1)),
  };
}

async function loadRegionBundle(
  container: HTMLElement,
  regionId: RegionId,
  qualityTier: QualityTier,
  timeOfDay: TimeOfDay,
): Promise<ActiveRegionRuntime> {
  const meta = getRegionEntry(regionId);
  const [manifestRes, terrainRes, graphRes] = await Promise.all([
    fetch(`${meta.baseUrl}/manifest.json`),
    fetch(`${meta.baseUrl}/terrain.json`),
    fetch(`${meta.baseUrl}/road-graph.json`),
  ]);
  if (!manifestRes.ok || !terrainRes.ok || !graphRes.ok) {
    throw new Error(`Failed to load offline derived data for region ${regionId}`);
  }
  const manifest = (await manifestRes.json()) as RegionManifest;
  const terrain = (await terrainRes.json()) as TerrainGrid;
  const roadGraph = (await graphRes.json()) as RoadGraph;

  const playableBounds = computePlayableWorldBounds(terrain);
  const perimeterBarriers = computePerimeterRoadBarriers(roadGraph, playableBounds);

  const scene = new RegionWorldScene(
    container,
    meta,
    manifest,
    terrain,
    qualityTier,
    timeOfDay,
  );
  scene.setPerimeterBarriers(perimeterBarriers);
  const qPreset = getQualityPreset(qualityTier);
  const seed = regionId === 'esenler-namik-kemal' ? 34034 : 34001;
  const traffic = new RoadTrafficSimulator(
    roadGraph,
    qPreset.trafficCount,
    seed,
    manifest.spawn.x,
    manifest.spawn.z,
    playableBounds,
  );
  const pedestrians = new PedestrianSimulator(
    roadGraph,
    qPreset.pedestrianCount,
    seed + 17,
    playableBounds,
  );

  return {
    meta,
    manifest,
    terrain,
    roadGraph,
    playableBounds,
    perimeterBarriers,
    scene,
    traffic,
    pedestrians,
  };
}

async function bootstrap(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Root #app element not found');
  }

  const params = new URLSearchParams(window.location.search);
  const touchUi = detectTouchUi(params);

  const storage = new HybridStorage();
  await storage.hydrate();

  // Query Android native hardware profile (RAM, CPU cores, 120Hz display, GameMode)
  const nativeHw: NativeHardwareProfile | null = await getNativeHardwareProfile();
  void setNativeGameState(true, false);

  const saveStore = new SaveStore(storage);
  const crashLog = new CrashLogStore(storage);
  const loaded = saveStore.load();
  const save: SaveData = loaded.data;

  if (loaded.source === 'default') {
    const nav = navigator as Navigator & { deviceMemory?: number };
    const cores = nativeHw?.cpuCores ?? nav.hardwareConcurrency;
    const ramGb = nativeHw?.totalRamMb ? nativeHw.totalRamMb / 1024 : nav.deviceMemory;
    save.qualityTier = suggestQualityTier(cores, ramGb);
  }
  const urlMode = normalizeQualityTier(params.get('mode'));
  if (urlMode) save.qualityTier = urlMode;

  const urlTime = params.get('time');
  let timeOfDay: TimeOfDay =
    urlTime === 'night' ? 'night' : urlTime === 'sunset' ? 'sunset' : 'day';
  let activeRegionId: RegionId = resolveRegionId(params.get('region') ?? save.activeRegionId);
  let drivingMode: DrivingMode = save.drivingMode ?? 'street';
  let transmissionMode: TransmissionMode = save.transmissionMode ?? 'auto';
  let steeringMode: SteeringMode = save.steeringMode ?? 'buttons';
  let paused = false;
  let renderFrozen = false;

  const sound = new ProceduralSoundEngine();

  installGlobalErrorBoundary({
    crashLog,
    appVersion: APP_VERSION,
    getLocale: () => save.locale,
    onCrash: () => {
      paused = true;
    },
  });

  // Unlock procedural AudioWorklet / WebAudio seamlessly on first interaction
  const unlockOnce = (): void => {
    sound.unlock();
  };
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce, { passive: true });

  let runtime = await loadRegionBundle(container, activeRegionId, save.qualityTier, timeOfDay);
  const minimap = new MinimapRenderer(runtime.roadGraph, runtime.playableBounds);
  const clock = new FixedStepClock(60, 0.1, 6);

  let playerX = runtime.manifest.spawn.x;
  let playerZ = runtime.manifest.spawn.z;
  let playerY = sampleTerrainElevation(runtime.terrain, playerX, playerZ);
  let velX = 0;
  let velZ = 0;
  let inVehicle = false;
  let speedKph = 0;
  let gear: GearDisplay = 'N';
  let physicsReady = false;
  let elapsedSec = 0;
  let pendingShiftUp = false;
  let pendingShiftDown = false;
  let lastDriftHapticSec = -10;
  const playerCapsule = createPlayerCapsuleState(playerX, playerY, playerZ);

  const placeVehicleNear = (
    rt: ActiveRegionRuntime,
    px: number,
    pz: number,
    heading: number,
    archetype = playerVehicle?.archetype ?? 'sports',
    paintHex = playerVehicle?.paintHex ?? 0xdc2626,
  ): PlayerVehicleState => {
    const rawX = clamp(
      px + Math.sin(heading) * 3.8 + Math.cos(heading) * 1.4,
      rt.playableBounds.minX + 4,
      rt.playableBounds.maxX - 4,
    );
    const rawZ = clamp(
      pz + Math.cos(heading) * 3.8 - Math.sin(heading) * 1.4,
      rt.playableBounds.minZ + 4,
      rt.playableBounds.maxZ - 4,
    );
    const clear = rt.scene.spatialGrid.resolveCircle(rawX, rawZ, 1.35);
    const vy = sampleTerrainElevation(rt.terrain, clear.x, clear.z);
    rt.scene.setPlayerVehicleStyle(archetype, paintHex);
    return createVehicleState(
      'player-vehicle',
      archetype,
      clear.x,
      vy,
      clear.z,
      heading,
      paintHex,
      drivingMode,
      transmissionMode,
    );
  };

  let playerVehicle: PlayerVehicleState;
  /** v0.9.0 — persistent GTA-style panel damage for the player's current car. */
  let vehicleDamage: VehicleDamageState = createDamageState('sedan');
  // Re-pointed whenever the player swaps into a different car (archetype-specific panels).
  /** v0.9.0 — door swing choreography (unit-tested pure state machine). */
  const door = createDoorChoreography();
  /** v0.9.0 (K2) — true while the character is visibly walking into the car. */
  let boardingInProgress = false;
  playerVehicle = placeVehicleNear(
    runtime,
    runtime.manifest.spawn.x,
    runtime.manifest.spawn.z,
    runtime.manifest.spawn.heading,
    'sports',
    0xdc2626,
  );

  void ensureRapierReady()
    .then(() => {
      physicsReady = true;
    })
    .catch((err: unknown) => {
      crashLog.record({
        source: 'runtime',
        message: `Rapier WASM init failed: ${err instanceof Error ? err.message : String(err)}`,
        version: APP_VERSION,
      });
    });

  runtime.scene.updateStreaming(playerX, playerZ);
  console.info(
    'ISTANBUL_BOOT',
    JSON.stringify({
      version: APP_VERSION,
      regionId: activeRegionId,
      qualityTier: save.qualityTier,
      drivingMode,
      transmissionMode,
      steeringMode,
      touchUi,
      nativeHw,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      canvas: `${runtime.scene.renderer.domElement.width}x${runtime.scene.renderer.domElement.height}`,
      glError: runtime.scene.renderer.getContext().getError(),
      gpu: runtime.scene.getGpuInfo(),
    }),
  );

  const kb: KeyboardInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };
  let handbrake = false;
  let turnLeft = false;
  let turnRight = false;

  // Zero-GC reusable OBB buffer for player & traffic collision queries
  const vehicleObbPool: VehicleColliderOBB[] = [];
  const collectActiveVehicleOBBs = (): readonly VehicleColliderOBB[] => {
    const trafficAgents = runtime.traffic.getAgents();
    const total = 1 + trafficAgents.length;
    while (vehicleObbPool.length < total) {
      vehicleObbPool.push({
        id: '',
        x: 0,
        z: 0,
        heading: 0,
        halfWidth: 0.96,
        halfLength: 2.15,
      });
    }
    vehicleObbPool.length = total;

    const pObb = getVehicleColliderOBB(playerVehicle);
    const slot0 = vehicleObbPool[0]!;
    slot0.id = pObb.id;
    slot0.x = pObb.x;
    slot0.z = pObb.z;
    slot0.heading = pObb.heading;
    slot0.halfWidth = pObb.halfWidth;
    slot0.halfLength = pObb.halfLength;

    for (let i = 0; i < trafficAgents.length; i += 1) {
      const car = trafficAgents[i]!;
      const slot = vehicleObbPool[i + 1]!;
      slot.id = `traffic-${car.id}`;
      slot.x = car.x;
      slot.z = car.z;
      slot.heading = car.heading;
      slot.halfWidth = car.archetype === 'dolmus' || car.archetype === 'van' ? 1.05 : 0.96;
      slot.halfLength = car.archetype === 'dolmus' || car.archetype === 'van' ? 2.55 : 2.15;
    }
    return vehicleObbPool;
  };

  // Zero-GC reusable audio telemetry packet
  const audioPacket: VehicleAudioTelemetry = {
    paused: false,
    inVehicle: false,
    speedKph: 0,
    rpm: 950,
    redlineRpm: 8200,
    throttle: 0,
    turboBoost: 0,
    skidIntensity: 0,
    backfirePulse: 0,
    blowOffPulse: 0,
    gearShiftPulse: 0,
    cylinders: 6,
    archetype: 'sports',
    surfaceWetness: 1,
  };

  // Drag-to-orbit camera handler attached to current WebGL canvas
  let dragPointerId: number | null = null;
  let lastDragX = 0;
  const attachCanvasDrag = (canvas: HTMLCanvasElement): void => {
    canvas.addEventListener('pointerdown', (e) => {
      dragPointerId = e.pointerId;
      lastDragX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== dragPointerId) return;
      const dx = e.clientX - lastDragX;
      lastDragX = e.clientX;
      runtime.scene.rotateCameraYaw(-dx * 0.0055);
    });
    const endDrag = (e: PointerEvent): void => {
      if (e.pointerId === dragPointerId) dragPointerId = null;
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
  };
  attachCanvasDrag(runtime.scene.renderer.domElement);

  const applySave = (): void => {
    save.activeRegionId = activeRegionId;
    save.playerPos = { x: playerX, y: playerY, z: playerZ };
    save.wantedStars = 0;
    save.drivingMode = drivingMode;
    save.transmissionMode = transmissionMode;
    save.steeringMode = steeringMode;
    saveStore.save(save);
  };

  let syncDebugHandle: () => void = () => {};

  const syncHudState = (): void => {
    hud.setState(
      save.locale,
      save.qualityTier,
      timeOfDay,
      activeRegionId,
      runtime.scene.getPlayerCameraView(),
      sound.isMuted(),
      drivingMode,
      transmissionMode,
      steeringMode,
    );
  };

  const teleportTo = (x: number, z: number): void => {
    const tx = clamp(x, runtime.playableBounds.minX + 3, runtime.playableBounds.maxX - 3);
    const tz = clamp(z, runtime.playableBounds.minZ + 3, runtime.playableBounds.maxZ - 3);
    const ty = sampleTerrainElevation(runtime.terrain, tx, tz);
    if (inVehicle) {
      playerVehicle.x = tx;
      playerVehicle.z = tz;
      playerVehicle.y = ty;
      resetPlayerVehicleMotion(playerVehicle);
      runtime.scene.resetVehicleEffects();
    }
    playerX = tx;
    playerZ = tz;
    playerY = ty;
    playerCapsule.x = tx;
    playerCapsule.y = ty;
    playerCapsule.z = tz;
    playerCapsule.vx = 0;
    playerCapsule.vz = 0;
    runtime.scene.updateStreaming(tx, tz);
    applySave();
    syncDebugHandle();
  };

  /**
   * v0.9.0 — GTA-style door choreography. The driver door swings out, the character
   * steps in, then the door slams shut. Purely cosmetic; physics is untouched.
   */
  const stepDoorAnimation = (dt: number): void => {
    const before = door.angle;
    stepDoorChoreography(door, dt);
    if (door.angle !== before) {
      runtime.scene.setPlayerDoorAngle('left', door.angle);
    }
  };

  /** Where the nearest repair shop would be — always available, damage is never permanent. */
  const repairPlayerVehicle = (): boolean => {
    if (vehicleDamage.totalDamage < 1) return false;
    repairVehicleDamage(vehicleDamage);
    runtime.scene.syncPlayerDamage(
      vehicleDamage,
      playerVehicle.x,
      playerVehicle.y,
      playerVehicle.z,
      playerVehicle.heading,
      0,
    );
    syncDebugHandle();
    return true;
  };

  const enterVehicle = (): void => {
    if (boardingInProgress) return;
    const spec = VEHICLE_SPECS[playerVehicle.archetype];

    // v0.9.0 (K2): the door swings open, the character walks in, *then* the seat
    // takes over. Without this the player saw a door open and a body teleport.
    startDoorSequence(door, 'opening');
    sound.playDoorClick();
    void triggerLightHaptic();

    const groundY = sampleTerrainElevation(runtime.terrain, playerX, playerZ);
    runtime.scene.setBoarding(
      true,
      buildBoardingPath(
        playerVehicle.x,
        playerVehicle.z,
        playerVehicle.heading,
        spec.width,
        spec.length,
        groundY,
        playerVehicle.y + 0.18,
      ),
    );
    boardingInProgress = true;
  };

  /** Called once the walk-in beat finishes: sit the player down for real. */
  const completeBoarding = (): void => {
    boardingInProgress = false;
    inVehicle = true;
    playerVehicle.dyn.drivingMode = drivingMode;
    playerVehicle.dyn.transmissionMode = transmissionMode;
    playerX = playerVehicle.x;
    playerY = playerVehicle.y;
    playerZ = playerVehicle.z;
    velX = 0;
    velZ = 0;
    attachPlayerToVehicleSeat(playerCapsule, playerVehicle.id, playerX, playerY, playerZ);
    hud.resetTouchInputs();
    syncDebugHandle();
  };

  const exitVehicle = (): void => {
    if (boardingInProgress) {
      // Abort a walk-in that has not finished yet.
      boardingInProgress = false;
      runtime.scene.setBoarding(false);
      door.phase = 'closed';
      door.angle = 0;
      runtime.scene.setPlayerDoorAngle('left', 0);
      return;
    }
    if (!inVehicle) return;
    inVehicle = false;
    playerVehicle.speed = 0;
    playerVehicle.dyn.vx = 0;
    playerVehicle.dyn.vz = 0;
    playerVehicle.dyn.vLong = 0;
    playerVehicle.dyn.vLat = 0;
    playerVehicle.dyn.yawRate = 0;
    playerVehicle.drifting = false;
    const exit = computeSafeExitPosition(
      playerVehicle,
      runtime.scene.spatialGrid,
      (x, z) => sampleTerrainElevation(runtime.terrain, x, z),
      collectActiveVehicleOBBs(),
      runtime.playableBounds,
    );
    playerX = exit.x;
    playerY = exit.y;
    playerZ = exit.z;
    velX = 0;
    velZ = 0;
    detachPlayerFromVehicleSeat(playerCapsule, exit.x, exit.y, exit.z);
    speedKph = 0;
    gear = 'N';
    hud.resetTouchInputs();
    sound.playDoorClick();
    startDoorSequence(door, 'opening');
    void triggerLightHaptic();
    syncDebugHandle();
  };

  const toggleVehicle = (): void => {
    if (inVehicle) {
      exitVehicle();
      return;
    }
    const distOwn = distance2D(playerX, playerZ, playerVehicle.x, playerVehicle.z);
    const nearNpc = runtime.traffic.findNearestAgent(playerX, playerZ, ENTER_VEHICLE_DISTANCE);
    const distNpc = nearNpc ? distance2D(playerX, playerZ, nearNpc.x, nearNpc.z) : Infinity;

    // GTA Free-Roam: enter whichever car is closest (your parked ride OR ANY NPC car on the street!)
    if (nearNpc && distNpc < distOwn && distNpc <= ENTER_VEHICLE_DISTANCE) {
      const claimed = runtime.traffic.swapWithPlayerVehicle(nearNpc.id, {
        archetype: playerVehicle.archetype,
        paintHex: playerVehicle.paintHex,
        x: playerVehicle.x,
        y: playerVehicle.y,
        z: playerVehicle.z,
        heading: playerVehicle.heading,
        pitch: playerVehicle.pitch,
      });
      if (claimed) {
        playerVehicle = createVehicleState(
          'player-vehicle',
          claimed.archetype,
          claimed.x,
          claimed.y,
          claimed.z,
          claimed.heading,
          claimed.paintHex,
          drivingMode,
          transmissionMode,
        );
        // Seamless momentum transfer if claiming a moving car on the avenue!
        if (claimed.speedMps > 0.4) {
          playerVehicle.speed = claimed.speedMps;
          playerVehicle.dyn.vLong = claimed.speedMps;
          playerVehicle.dyn.vx = Math.sin(claimed.heading) * claimed.speedMps;
          playerVehicle.dyn.vz = Math.cos(claimed.heading) * claimed.speedMps;
        }
        runtime.scene.setPlayerVehicleStyle(playerVehicle.archetype, playerVehicle.paintHex);
        runtime.scene.resetVehicleEffects();
        // v0.9.0: a newly claimed car starts pristine with its own damage map.
        vehicleDamage = createDamageState(playerVehicle.archetype);
        updateVehicleCondition(vehicleDamage);
        const vehName =
          claimed.archetype === 'sports'
            ? save.locale === 'tr'
              ? 'Spor Coupe (RWD)'
              : 'Sports Coupe (RWD)'
            : claimed.archetype === 'suv'
              ? 'SUV (AWD)'
              : claimed.archetype === 'van' || claimed.archetype === 'dolmus'
                ? 'Van (RWD)'
                : claimed.archetype === 'hatchback'
                  ? 'Hatchback (FWD)'
                  : 'Sedan (RWD)';
        hud.showToast(`🚗 ${vehName}`);
        enterVehicle();
        return;
      }
    }

    if (distOwn <= ENTER_VEHICLE_DISTANCE) {
      enterVehicle();
    }
  };

  const callTaxi = (): void => {
    const heading = runtime.scene.getCameraYaw() + Math.PI;
    playerVehicle = placeVehicleNear(runtime, playerX, playerZ, heading);
    runtime.scene.resetVehicleEffects();
    vehicleDamage = createDamageState(playerVehicle.archetype);
    sound.playHorn();
    void triggerLightHaptic();
    hud.showToast(getStrings(save.locale).taxiCalledToast);
    syncDebugHandle();
  };

  const triggerHorn = (): void => {
    sound.playHorn();
    runtime.traffic.notifyHorn(playerX, playerZ, 28);
    runtime.pedestrians.notifyHorn(playerX, playerZ, runtime.manifest.sanctuaryZones, 22);
    void triggerLightHaptic();
  };

  const setDrivingMode = (mode: DrivingMode): void => {
    drivingMode = mode;
    playerVehicle.dyn.drivingMode = mode;
    const t = getStrings(save.locale);
    const label =
      mode === 'drift' ? t.modeDrift : mode === 'sim' ? t.modeSim : t.modeStreet;
    syncHudState();
    hud.showToast(`🏎 ${t.drivingModeToastPrefix}: ${label}`);
    applySave();
    sound.playUiTap();
    void triggerDrivingHaptic('shift', 0.55);
    syncDebugHandle();
  };

  const cycleDrivingMode = (): DrivingMode => {
    const next = nextDrivingMode(drivingMode);
    setDrivingMode(next);
    return next;
  };

  const setTransmissionMode = (mode: TransmissionMode): void => {
    transmissionMode = mode;
    playerVehicle.dyn.transmissionMode = mode;
    const t = getStrings(save.locale);
    const label = mode === 'manual' ? t.transManual : t.transAuto;
    syncHudState();
    hud.showToast(`⚙ ${t.transmissionToastPrefix}: ${label}`);
    applySave();
    sound.playUiTap();
    void triggerDrivingHaptic('shift', 0.55);
    syncDebugHandle();
  };

  const toggleTransmission = (): TransmissionMode => {
    const next: TransmissionMode = transmissionMode === 'auto' ? 'manual' : 'auto';
    setTransmissionMode(next);
    return next;
  };

  const cycleSteeringMode = (): SteeringMode => {
    steeringMode = nextSteeringMode(steeringMode);
    const t = getStrings(save.locale);
    const label =
      steeringMode === 'slider'
        ? t.steerSlider
        : steeringMode === 'gyro'
          ? t.steerGyro
          : t.steerButtons;
    syncHudState();
    hud.showToast(`🎛 ${t.steeringModeToastPrefix}: ${label}`);
    applySave();
    sound.playUiTap();
    void triggerLightHaptic();
    syncDebugHandle();
    return steeringMode;
  };

  const triggerShiftUp = (): void => {
    if (!inVehicle) return;
    if (transmissionMode !== 'manual') {
      setTransmissionMode('manual');
    }
    pendingShiftUp = true;
    void triggerDrivingHaptic('shift', 0.65);
  };

  const triggerShiftDown = (): void => {
    if (!inVehicle) return;
    if (transmissionMode !== 'manual') {
      setTransmissionMode('manual');
    }
    pendingShiftDown = true;
    void triggerDrivingHaptic('shift', 0.65);
  };

  const cycleCameraView = (): PlayerCameraView => {
    const next = runtime.scene.cyclePlayerCameraView();
    const t = getStrings(save.locale);
    const label =
      next === 'wide'
        ? t.cameraWide
        : next === 'hood'
          ? t.cameraHood
          : next === 'bumper'
            ? t.cameraBumper
            : next === 'topdown'
              ? t.cameraTopdown
              : t.cameraChase;
    syncHudState();
    hud.showToast(`📷 ${label}`);
    sound.playUiTap();
    void triggerLightHaptic();
    syncDebugHandle();
    return next;
  };

  const toggleAudio = (): boolean => {
    const muted = sound.toggleMute();
    syncHudState();
    if (!muted) sound.playUiTap();
    void triggerLightHaptic();
    syncDebugHandle();
    return muted;
  };

  let switchingRegion = false;
  const switchRegion = async (nextId: RegionId): Promise<void> => {
    if (switchingRegion || nextId === activeRegionId) return;
    switchingRegion = true;
    void setNativeGameState(false, true);
    try {
      const nextRuntime = await loadRegionBundle(container, nextId, save.qualityTier, timeOfDay);
      runtime.scene.dispose();
      runtime = nextRuntime;
      activeRegionId = nextId;
      inVehicle = false;
      speedKph = 0;
      gear = 'N';
      playerX = runtime.manifest.spawn.x;
      playerZ = runtime.manifest.spawn.z;
      playerY = sampleTerrainElevation(runtime.terrain, playerX, playerZ);
      detachPlayerFromVehicleSeat(playerCapsule, playerX, playerY, playerZ);
      playerVehicle = placeVehicleNear(
        runtime,
        runtime.manifest.spawn.x,
        runtime.manifest.spawn.z,
        runtime.manifest.spawn.heading,
        playerVehicle.archetype,
        playerVehicle.paintHex,
      );
      minimap.setRoadGraph(runtime.roadGraph, runtime.playableBounds);
      runtime.scene.updateStreaming(playerX, playerZ);
      attachCanvasDrag(runtime.scene.renderer.domElement);
      hud.setLandmarks(runtime.manifest.landmarks);
      syncHudState();
      applySave();
      syncDebugHandle();
    } finally {
      switchingRegion = false;
      void setNativeGameState(!paused, false);
    }
  };

  const setQuality = (tier: QualityTier): void => {
    save.qualityTier = tier;
    const preset = getQualityPreset(tier);
    runtime.scene.applyQuality(save.qualityTier);
    const fx = inVehicle ? playerVehicle.x : playerX;
    const fz = inVehicle ? playerVehicle.z : playerZ;
    runtime.traffic.setMaxActiveCount(preset.trafficCount, fx, fz);
    runtime.pedestrians.setMaxActiveCount(preset.pedestrianCount, fx, fz);
    runtime.scene.updateStreaming(fx, fz);
    syncHudState();
    applySave();
    syncDebugHandle();
  };

  const toggleQuality = (): void => {
    setQuality(nextQualityTier(save.qualityTier));
    sound.playUiTap();
    void triggerLightHaptic();
  };

  const setTimeOfDay = (mode: TimeOfDay): void => {
    timeOfDay = mode;
    runtime.scene.setTimeOfDay(timeOfDay);
    syncHudState();
    syncDebugHandle();
  };

  const toggleTimeOfDay = (): void => {
    setTimeOfDay(nextAtmospherePreset(timeOfDay));
    sound.playUiTap();
    void triggerLightHaptic();
  };

  const toggleLocale = (): void => {
    save.locale = save.locale === 'tr' ? 'en' : 'tr';
    syncHudState();
    applySave();
    sound.playUiTap();
    void triggerLightHaptic();
    syncDebugHandle();
  };

  const togglePause = (): void => {
    paused = !paused;
    void setNativeGameState(!paused, false);
    hud.openModal(paused ? 'pause' : 'none');
    if (paused) applySave();
    sound.playUiTap();
    void triggerLightHaptic();
    syncDebugHandle();
  };

  let fpsSmoothed = 60;
  let frameMsSmoothed = 16.6;
  const uaInfo = parseUserAgentInfo(navigator.userAgent, navigator.platform);

  const buildDiagnosticsSnapshot = (): DiagnosticsSnapshot => {
    const tel = runtime.scene.getTelemetry();
    const gpu = runtime.scene.getGpuInfo();
    const heap = readJsHeapMb();
    const nativeSummary = nativeHw
      ? `API ${nativeHw.sdkInt} · ${nativeHw.cpuCores}c · ${nativeHw.totalRamMb ?? '?'}MB · ${nativeHw.refreshRateHz ?? 60}Hz · ${nativeHw.gameMode}`
      : 'Web/Desktop';
    return {
      appVersion: APP_VERSION,
      timestampIso: new Date().toISOString(),
      regionId: activeRegionId,
      qualityTier: save.qualityTier,
      timeOfDay,
      mode: inVehicle ? 'driving' : 'on-foot',
      fps: Number(fpsSmoothed.toFixed(1)),
      frameMs: Number(frameMsSmoothed.toFixed(2)),
      drawCalls: tel.drawCalls,
      triangles: tel.triangles,
      activeTiles: tel.loadedTiles,
      activeBuildings: tel.activeBuildings,
      trafficCount: runtime.traffic.getAgents().length,
      jsHeapUsedMb: heap.used,
      jsHeapTotalMb: heap.total,
      jsHeapLimitMb: heap.limit,
      gpuRenderer: gpu.renderer,
      gpuVendor: gpu.vendor,
      webViewVersion: uaInfo.webViewVersion,
      deviceModel: nativeHw ? `${nativeHw.manufacturer} ${nativeHw.model}` : uaInfo.deviceModel,
      platform: uaInfo.platform,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: Number(tel.pixelRatio.toFixed(2)),
      touchUi,
      crashCount: crashLog.list().length,
      drivingMode,
      transmissionMode,
      audioBackend: sound.getBackendMode(),
      nativePerfProfile: nativeSummary,
    };
  };

  const hud = new HudOverlay(
    container,
    save.locale,
    save.qualityTier,
    timeOfDay,
    activeRegionId,
    touchUi,
    crashLog,
    {
      onToggleQuality: toggleQuality,
      onToggleTimeOfDay: toggleTimeOfDay,
      onToggleLocale: toggleLocale,
      onTogglePause: togglePause,
      onResetPosition: () => {
        exitVehicle();
        teleportTo(runtime.manifest.spawn.x, runtime.manifest.spawn.z);
        playerVehicle = placeVehicleNear(
          runtime,
          runtime.manifest.spawn.x,
          runtime.manifest.spawn.z,
          runtime.manifest.spawn.heading,
        );
        runtime.scene.resetVehicleEffects();
        vehicleDamage = createDamageState(playerVehicle.archetype);
      },
      onToggleVehicle: toggleVehicle,
      onCallTaxi: callTaxi,
      onHorn: triggerHorn,
      onCycleCamera: () => {
        cycleCameraView();
      },
      onToggleAudio: () => {
        toggleAudio();
      },
      onCycleDrivingMode: () => {
        cycleDrivingMode();
      },
      onToggleTransmission: () => {
        toggleTransmission();
      },
      onCycleSteeringMode: () => {
        cycleSteeringMode();
      },
      onShiftUp: triggerShiftUp,
      onShiftDown: triggerShiftDown,
      onSwitchRegion: (rid) => {
        void switchRegion(rid);
      },
      onTeleportLandmark: (lm: LandmarkPin) => {
        const offset = lm.kind === 'mosque' ? 32 : 5;
        teleportTo(lm.x - offset, lm.z + offset * 0.4);
      },
      getDiagnostics: buildDiagnosticsSnapshot,
    },
  );
  hud.mountMinimap(minimap.element);
  hud.setLandmarks(runtime.manifest.landmarks);
  syncHudState();

  if (loaded.recoveredFromCorruption) {
    hud.showToast(getStrings(save.locale).recoveredSaveToast);
  }

  // Keyboard controls
  const setKey = (code: string, down: boolean): void => {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        kb.forward = down;
        break;
      case 'KeyS':
      case 'ArrowDown':
        kb.backward = down;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        kb.left = down;
        break;
      case 'KeyD':
      case 'ArrowRight':
        kb.right = down;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        kb.sprint = down;
        break;
      case 'Space':
        handbrake = down;
        break;
      case 'KeyQ':
        turnLeft = down;
        break;
      case 'KeyE':
        turnRight = down;
        break;
      default:
        break;
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && !e.repeat) {
      if (hud.getActiveModal() !== 'none' && hud.getActiveModal() !== 'pause') {
        hud.openModal(paused ? 'pause' : 'none');
      } else {
        togglePause();
      }
      return;
    }
    if (paused) return;
    if (e.code === 'KeyF' && !e.repeat) {
      toggleVehicle();
      return;
    }
    if (e.code === 'KeyC' && !e.repeat) {
      cycleCameraView();
      return;
    }
    if (e.code === 'KeyM' && !e.repeat) {
      toggleAudio();
      return;
    }
    if (e.code === 'KeyH' && !e.repeat) {
      triggerHorn();
      return;
    }
    if (e.code === 'KeyV' && !e.repeat && inVehicle) {
      cycleDrivingMode();
      return;
    }
    if (e.code === 'KeyG' && !e.repeat && inVehicle) {
      toggleTransmission();
      return;
    }
    if (e.code === 'KeyE' && !e.repeat && inVehicle && transmissionMode === 'manual') {
      triggerShiftUp();
      return;
    }
    if (e.code === 'KeyQ' && !e.repeat && inVehicle && transmissionMode === 'manual') {
      triggerShiftDown();
      return;
    }
    if (e.code === 'KeyR' && !e.repeat && !inVehicle) {
      callTaxi();
      return;
    }
    setKey(e.code, true);
  });
  window.addEventListener('keyup', (e) => setKey(e.code, false));
  window.addEventListener('blur', () => {
    kb.forward = false;
    kb.backward = false;
    kb.left = false;
    kb.right = false;
    kb.sprint = false;
    handbrake = false;
    turnLeft = false;
    turnRight = false;
    hud.resetTouchInputs();
  });

  registerBackButtonHandler(() => {
    if (hud.getActiveModal() !== 'none' && hud.getActiveModal() !== 'pause') {
      hud.openModal(paused ? 'pause' : 'none');
      return;
    }
    togglePause();
  });

  window.addEventListener('resize', () => {
    runtime.scene.resize(window.innerWidth, window.innerHeight);
  });

  const findNearestLandmarkLabel = (): string => {
    let best: LandmarkPin | null = null;
    let bestDist = Infinity;
    for (const lm of runtime.manifest.landmarks) {
      const d = distance2D(playerX, playerZ, lm.x, lm.z);
      if (d < bestDist) {
        bestDist = d;
        best = lm;
      }
    }
    if (!best) return '';
    const name = save.locale === 'tr' ? best.nameTr : best.nameEn;
    return bestDist < 25 ? name : `${name} · ${Math.round(bestDist)} m`;
  };

  const debugHandle: GameDebugHandle = {
    version: APP_VERSION,
    regionId: activeRegionId,
    regionLoaded: true,
    paused: false,
    qualityTier: save.qualityTier,
    timeOfDay,
    cameraView: runtime.scene.getPlayerCameraView(),
    audioMuted: sound.isMuted(),
    audioBackend: sound.getBackendMode(),
    locale: save.locale,
    physicsReady: false,
    inVehicle: false,
    driverVisibleInCabin: false,
    drivingMode,
    transmissionMode,
    steeringMode,
    speedKph: 0,
    gear: 'N',
    rpm: playerVehicle.dyn.rpm,
    turboBoost: 0,
    driftAngleDeg: 0,
    driftScore: 0,
    trafficCount: runtime.traffic.getAgents().length,
    pedestrianCount: runtime.pedestrians.getAgents().length,
    sanctuaryId: null,
    player: { x: playerX, y: playerY, z: playerZ },
    vehicle: {
      x: playerVehicle.x,
      y: playerVehicle.y,
      z: playerVehicle.z,
      heading: playerVehicle.heading,
      speed: 0,
    },
    perf: {
      fps: 60,
      frameMs: 16.6,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      pixelRatio: 1,
      loadedTiles: 0,
      activeBuildings: 0,
    },
    toggleQuality,
    setQuality,
    toggleTimeOfDay,
    setTimeOfDay,
    cycleCameraView,
    cycleDrivingMode,
    setDrivingMode,
    toggleTransmission,
    setTransmissionMode,
    cycleSteeringMode,
    shiftUp: triggerShiftUp,
    shiftDown: triggerShiftDown,
    toggleAudio,
    triggerHorn,
    callTaxi,
    setCameraMode: (mode: QaCameraMode) => runtime.scene.setQaCameraMode(mode),
    toggleLocale,
    togglePause,
    openSettings: () => hud.openModal('settings'),
    openAbout: () => hud.openModal('about'),
    closeModal: () => {
      paused = false;
      void setNativeGameState(true, false);
      hud.openModal('none');
      syncDebugHandle();
    },
    enterVehicle,
    exitVehicle,
    switchRegion,
    teleportTo,
    setRenderFrozen: (frozen: boolean) => {
      renderFrozen = frozen;
      if (!frozen) {
        lastTimeMs = performance.now();
        window.requestAnimationFrame(tick);
      }
    },
    getDiagnostics: buildDiagnosticsSnapshot,
    getCrashCount: () => crashLog.list().length,
    vehicleCondition: () => vehicleConditionPercent(vehicleDamage),
    repairVehicle: () => repairPlayerVehicle(),
  };
  window.__game = debugHandle;

  syncDebugHandle = (): void => {
    const tel = runtime.scene.getTelemetry();
    const activeSanctuary = findSanctuaryZone(playerX, playerZ, runtime.manifest.sanctuaryZones);
    debugHandle.paused = paused;
    debugHandle.regionId = activeRegionId;
    debugHandle.qualityTier = save.qualityTier;
    debugHandle.timeOfDay = timeOfDay;
    debugHandle.cameraView = runtime.scene.getPlayerCameraView();
    debugHandle.audioMuted = sound.isMuted();
    debugHandle.audioBackend = sound.getBackendMode();
    debugHandle.locale = save.locale;
    debugHandle.physicsReady = physicsReady;
    debugHandle.inVehicle = inVehicle;
    debugHandle.driverVisibleInCabin = runtime.scene.isCharacterMountedInTaxi();
    debugHandle.drivingMode = drivingMode;
    debugHandle.transmissionMode = transmissionMode;
    debugHandle.steeringMode = steeringMode;
    debugHandle.speedKph = speedKph;
    debugHandle.gear = gear;
    debugHandle.rpm = Math.round(playerVehicle.dyn.rpm);
    debugHandle.turboBoost = Number(playerVehicle.dyn.turboBoost.toFixed(2));
    debugHandle.driftAngleDeg = Math.round(playerVehicle.dyn.driftAngleDeg);
    debugHandle.driftScore = Math.round(playerVehicle.dyn.driftScore);
    debugHandle.trafficCount = runtime.traffic.getAgents().length;
    debugHandle.pedestrianCount = runtime.pedestrians.getAgents().length;
    debugHandle.sanctuaryId = activeSanctuary?.id ?? null;
    debugHandle.player = { x: playerX, y: playerY, z: playerZ };
    debugHandle.vehicle = {
      x: playerVehicle.x,
      y: playerVehicle.y,
      z: playerVehicle.z,
      heading: playerVehicle.heading,
      speed: playerVehicle.speed,
    };
    debugHandle.perf = {
      fps: fpsSmoothed,
      frameMs: frameMsSmoothed,
      drawCalls: tel.drawCalls,
      triangles: tel.triangles,
      geometries: tel.geometries,
      textures: tel.textures,
      pixelRatio: tel.pixelRatio,
      loadedTiles: tel.loadedTiles,
      activeBuildings: tel.activeBuildings,
    };
  };
  syncDebugHandle();

  let lastTimeMs = performance.now();
  let lastHudUpdateMs = 0;
  let lastMinimapUpdateMs = 0;
  let lastStreamCheckMs = 0;

  const tick = (nowMs: number): void => {
    const rawDt = Math.max(0.0001, (nowMs - lastTimeMs) / 1000);
    lastTimeMs = nowMs;
    elapsedSec += Math.min(rawDt, 0.05);

    const frameMs = rawDt * 1000;
    frameMsSmoothed = frameMsSmoothed * 0.9 + frameMs * 0.1;
    fpsSmoothed = fpsSmoothed * 0.9 + Math.min(240, 1 / rawDt) * 0.1;

    let throttleAmount = 0;

    if (!paused && !switchingRegion) {
      const intent = mergeControlIntent(kb, hud.getTouchInput());
      const driveTouch = hud.getTouchDrivingInput();
      const canOrbitQE = !inVehicle || transmissionMode !== 'manual';
      const yawTurn = canOrbitQE ? (turnLeft ? 1 : 0) - (turnRight ? 1 : 0) : 0;

      clock.advance(rawDt, (dt) => {
        if (yawTurn !== 0) {
          runtime.scene.rotateCameraYaw(yawTurn * 2.1 * dt);
        }

        const sampleElev = (x: number, z: number): number =>
          sampleTerrainElevation(runtime.terrain, x, z);

        const activeVehicles = collectActiveVehicleOBBs();

        if (inVehicle) {
          const throttle = kb.forward || driveTouch.gas ? 1 : 0;
          const brake = kb.backward || driveTouch.brake ? 1 : 0;
          const kbSteer = (kb.left ? 1 : 0) - (kb.right ? 1 : 0);
          const btnSteer = (driveTouch.steerLeft ? 1 : 0) - (driveTouch.steerRight ? 1 : 0);
          const steer =
            kbSteer !== 0
              ? kbSteer
              : driveTouch.useAnalogSteer
                ? driveTouch.steerAnalog
                : btnSteer;
          const hb = handbrake || driveTouch.handbrake;
          throttleAmount = throttle;

          const shiftUp = pendingShiftUp;
          const shiftDown = pendingShiftDown;
          pendingShiftUp = false;
          pendingShiftDown = false;
          if (shiftUp) manualShiftVehicle(playerVehicle, 1);
          if (shiftDown) manualShiftVehicle(playerVehicle, -1);

          const surfaceGrip = timeOfDay === 'night' ? 0.94 : timeOfDay === 'sunset' ? 0.97 : 1.0;
          // v0.9.0: damage degrades power, adds drag and can ultimately kill the engine.
          playerVehicle.dyn.powerScale = vehicleDamage.powerScale;
          playerVehicle.dyn.dragScale = vehicleDamage.dragScale;
          const res = stepPlayerVehicle(
            playerVehicle,
            { throttle, brake, steer, handbrake: hb, surfaceGrip },
            dt,
            runtime.playableBounds,
            sampleElev,
            runtime.scene.spatialGrid,
          );

          if (res.shiftedGear) {
            void triggerDrivingHaptic('shift', 0.45);
          }

          if (res.impactSpeed > 3.6) {
            sound.playImpact(res.impactSpeed);
            runtime.scene.emitCollisionSparks(
              playerVehicle.x + Math.sin(playerVehicle.heading) * 1.4,
              playerVehicle.y + 0.65,
              playerVehicle.z + Math.cos(playerVehicle.heading) * 1.4,
              Math.min(18, Math.round(res.impactSpeed * 1.4)),
            );
            void triggerDrivingHaptic('impact', clamp(res.impactSpeed / 18, 0.3, 1));
          }

          // Subtle tactile drift rumble pulse every ~180 ms during high-slip drifts
          if (playerVehicle.drifting && elapsedSec - lastDriftHapticSec > 0.18) {
            lastDriftHapticSec = elapsedSec;
            void triggerDrivingHaptic('drift', clamp(playerVehicle.dyn.driftAngleDeg / 55, 0.25, 0.7));
          }

          // v0.9.0 exact OBB ↔ OBB collision: real footprint, zero interpenetration.
          const trafficHit = runtime.traffic.resolvePlayerVehicleCollision(
            playerVehicle.x,
            playerVehicle.z,
            playerVehicle.dyn.vx,
            playerVehicle.dyn.vz,
            VEHICLE_PHYSICS_SPECS[playerVehicle.archetype].massKg,
            playerVehicle.heading,
            playerVehicle.archetype,
          );
          if (trafficHit.collided) {
            applyVehicleCollisionImpulse(
              playerVehicle,
              trafficHit.x,
              trafficHit.z,
              trafficHit.impactSpeed,
              sampleElev,
            );
            if (trafficHit.impactSpeed > 1.2) {
              // v0.9.0: route the hit into the panel damage model, then let the
              // material of the struck panel choose the crash timbre (metal/plastic/glass).
              const hitPanel = pickPanelForContact(
                playerVehicle.x,
                playerVehicle.z,
                playerVehicle.heading,
                trafficHit.contactX,
                trafficHit.contactZ,
                VEHICLE_SPECS[playerVehicle.archetype].length,
                VEHICLE_SPECS[playerVehicle.archetype].width,
              );
              applyVehicleImpact(
                vehicleDamage,
                trafficHit.impactSpeed * 1.35,
                trafficHit.contactX,
                trafficHit.contactZ,
                trafficHit.nx,
                trafficHit.nz,
                playerVehicle.x,
                playerVehicle.z,
                playerVehicle.heading,
                VEHICLE_SPECS[playerVehicle.archetype].length,
                VEHICLE_SPECS[playerVehicle.archetype].width,
              );
              sound.playImpact(
                trafficHit.impactSpeed * 1.15,
                hitPanel === 'windshield' ? 'glass' : hitPanel.startsWith('bumper') ? 'plastic' : 'metal',
              );
              runtime.scene.emitCollisionSparks(
                trafficHit.contactX,
                playerVehicle.y + 0.72,
                trafficHit.contactZ,
                Math.min(18, Math.round(trafficHit.impactSpeed * 1.4)),
              );
              void triggerDrivingHaptic('impact', clamp(trafficHit.impactSpeed / 16, 0.35, 1));
            }
          }

          speedKph = res.speedKph;
          gear = res.gear;
          playerX = playerVehicle.x;
          playerY = playerVehicle.y;
          playerZ = playerVehicle.z;
          playerCapsule.x = playerX;
          playerCapsule.y = playerY;
          playerCapsule.z = playerZ;
          velX = playerVehicle.dyn.vx;
          velZ = playerVehicle.dyn.vz;
        } else {
          playerCapsule.x = playerX;
          playerCapsule.y = playerY;
          playerCapsule.z = playerZ;
          stepOnFootPlayer(
            playerCapsule,
            intent.moveX,
            intent.moveY,
            intent.sprint,
            runtime.scene.getCameraYaw(),
            dt,
            runtime.playableBounds,
            sampleElev,
            runtime.scene.spatialGrid,
            activeVehicles,
          );

          playerX = playerCapsule.x;
          playerY = playerCapsule.y;
          playerZ = playerCapsule.z;
          velX = playerCapsule.vx;
          velZ = playerCapsule.vz;
          speedKph = 0;
          gear = 'N';
        }

        // Advance road-graph AI traffic & obstacle-aware sidewalk pedestrians around active player
        runtime.traffic.step(dt, playerX, playerZ, sampleElev, runtime.scene.spatialGrid);
        runtime.pedestrians.step(
          dt,
          playerX,
          playerZ,
          playerVehicle.speed,
          inVehicle,
          runtime.manifest.sanctuaryZones,
          sampleElev,
          runtime.scene.spatialGrid,
          activeVehicles,
        );
      });

      if (nowMs - lastStreamCheckMs >= 450) {
        lastStreamCheckMs = nowMs;
        runtime.scene.updateStreaming(playerX, playerZ);
      }

      runtime.scene.updateTraffic(runtime.traffic.getAgents());
      runtime.scene.updatePedestrians(runtime.pedestrians.getAgents());
      runtime.scene.updateVisuals(
        playerX,
        playerY,
        playerZ,
        velX,
        velZ,
        inVehicle,
        playerVehicle,
        Math.min(rawDt, 0.05),
      );
    }

    // Update rich waveguide AudioWorklet engine + turbo + BOV + backfire + tire screech
    const dyn = playerVehicle.dyn;
    const pSpec = VEHICLE_PHYSICS_SPECS[playerVehicle.archetype];
    const rpmNorm = clamp(
      (dyn.rpm - pSpec.idleRpm) / Math.max(1, pSpec.redlineRpm - pSpec.idleRpm),
      0,
      1,
    );
    audioPacket.paused = paused;
    audioPacket.inVehicle = inVehicle;
    audioPacket.speedKph = speedKph;
    audioPacket.rpm = dyn.rpm;
    audioPacket.redlineRpm = pSpec.redlineRpm;
    audioPacket.throttle = throttleAmount;
    audioPacket.turboBoost = dyn.turboBoost;
    audioPacket.skidIntensity = dyn.maxSkidIntensity;
    audioPacket.backfirePulse = dyn.backfirePulse;
    audioPacket.blowOffPulse = dyn.blowOffPulse;
    audioPacket.gearShiftPulse = dyn.gearShiftPulse;
    audioPacket.idleRpm = pSpec.idleRpm;
    audioPacket.wheels = dyn.wheels;
    audioPacket.archetype = playerVehicle.archetype;
    audioPacket.surfaceWetness = timeOfDay === 'night' ? 1.12 : timeOfDay === 'sunset' ? 1.05 : 1.0;
    sound.updateVehicleAudio(audioPacket);

    // v0.9.0: door swing choreography + visible crash damage, then clear one-shot queues.
    stepDoorAnimation(Math.min(rawDt, 0.05));
    if (boardingInProgress && door.phase === 'boarding') {
      completeBoarding();
    }
    runtime.scene.syncPlayerDamage(
      vehicleDamage,
      playerVehicle.x,
      playerVehicle.y,
      playerVehicle.z,
      playerVehicle.heading,
      Math.min(rawDt, 0.05),
    );
    consumeDamageEvents(vehicleDamage);

    runtime.scene.render();

    // Update zero-GC 2D Minimap radar at ~10 Hz
    if (!paused && nowMs - lastMinimapUpdateMs >= 100) {
      lastMinimapUpdateMs = nowMs;
      minimap.render({
        playerX,
        playerZ,
        cameraYaw: runtime.scene.getCameraYaw(),
        inVehicle,
        vehicleX: playerVehicle.x,
        vehicleZ: playerVehicle.z,
        traffic: runtime.traffic.getAgents(),
        sanctuaries: runtime.manifest.sanctuaryZones,
        timeSec: elapsedSec,
      });
    }

    const tel = runtime.scene.getTelemetry();
    const activeSanctuary = findSanctuaryZone(playerX, playerZ, runtime.manifest.sanctuaryZones);
    const nearVehicle =
      !inVehicle &&
      (distance2D(playerX, playerZ, playerVehicle.x, playerVehicle.z) <= ENTER_VEHICLE_DISTANCE ||
        runtime.traffic.findNearestAgent(playerX, playerZ, ENTER_VEHICLE_DISTANCE) !== null);

    debugHandle.paused = paused;
    debugHandle.regionId = activeRegionId;
    debugHandle.qualityTier = save.qualityTier;
    debugHandle.timeOfDay = timeOfDay;
    debugHandle.cameraView = runtime.scene.getPlayerCameraView();
    debugHandle.audioMuted = sound.isMuted();
    debugHandle.audioBackend = sound.getBackendMode();
    debugHandle.locale = save.locale;
    debugHandle.physicsReady = physicsReady;
    debugHandle.inVehicle = inVehicle;
    debugHandle.driverVisibleInCabin = runtime.scene.isCharacterMountedInTaxi();
    debugHandle.drivingMode = drivingMode;
    debugHandle.transmissionMode = transmissionMode;
    debugHandle.steeringMode = steeringMode;
    debugHandle.speedKph = speedKph;
    debugHandle.gear = gear;
    debugHandle.rpm = Math.round(dyn.rpm);
    debugHandle.turboBoost = Number(dyn.turboBoost.toFixed(2));
    debugHandle.driftAngleDeg = Math.round(dyn.driftAngleDeg);
    debugHandle.driftScore = Math.round(dyn.driftScore);
    debugHandle.trafficCount = runtime.traffic.getAgents().length;
    debugHandle.pedestrianCount = runtime.pedestrians.getAgents().length;
    debugHandle.sanctuaryId = activeSanctuary?.id ?? null;
    debugHandle.player = { x: playerX, y: playerY, z: playerZ };
    debugHandle.vehicle = {
      x: playerVehicle.x,
      y: playerVehicle.y,
      z: playerVehicle.z,
      heading: playerVehicle.heading,
      speed: playerVehicle.speed,
    };
    debugHandle.perf = {
      fps: fpsSmoothed,
      frameMs: frameMsSmoothed,
      drawCalls: tel.drawCalls,
      triangles: tel.triangles,
      geometries: tel.geometries,
      textures: tel.textures,
      pixelRatio: tel.pixelRatio,
      loadedTiles: tel.loadedTiles,
      activeBuildings: tel.activeBuildings,
    };

    if (nowMs - lastHudUpdateMs >= 80) {
      lastHudUpdateMs = nowMs;
      hud.updateTelemetry({
        fps: fpsSmoothed,
        drawCalls: tel.drawCalls,
        triangles: tel.triangles,
        loadedTiles: tel.loadedTiles,
        activeBuildings: tel.activeBuildings,
        vehicleCondition: vehicleConditionPercent(vehicleDamage),
        vehicleSpecLine: inVehicle ? formatVehicleSpecLine(playerVehicle.archetype) : '',
        physicsReady,
        qualityTier: save.qualityTier,
        regionName: save.locale === 'tr' ? runtime.meta.nameTr : runtime.meta.nameEn,
        nearestLandmarkLabel: findNearestLandmarkLabel(),
        sanctuaryLabel: activeSanctuary
          ? save.locale === 'tr'
            ? activeSanctuary.nameTr
            : activeSanctuary.nameEn
          : null,
        inVehicle,
        nearVehicle,
        speedKph,
        gear,
        rpm: dyn.rpm,
        rpmNorm,
        turboBoost: dyn.turboBoost,
        drivetrain: pSpec.drivetrain,
        drivingMode,
        transmissionMode,
        drifting: playerVehicle.drifting,
        driftAngleDeg: Math.round(dyn.driftAngleDeg),
        driftScore: dyn.driftScore,
      });
    }

    if (!renderFrozen) {
      window.requestAnimationFrame(tick);
    }
  };

  window.requestAnimationFrame(tick);
}

void bootstrap();
