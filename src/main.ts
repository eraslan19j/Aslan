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
import { TaxiMissionManager } from './core/missions';
import { PedestrianSimulator } from './core/pedestrians';
import { ensureRapierReady } from './core/physics';
import {
  attachPlayerToVehicleSeat,
  createPlayerCapsuleState,
  detachPlayerFromVehicleSeat,
  stepOnFootPlayer,
  type VehicleColliderOBB,
} from './core/playerController';
import { suggestQualityTier, type QualityTier } from './core/quality';
import { findSanctuaryZone } from './core/sanctuary';
import { SaveStore, type SaveData } from './core/save';
import { RoadTrafficSimulator } from './core/traffic';
import {
  computeSafeExitPosition,
  createVehicleState,
  ENTER_VEHICLE_DISTANCE,
  getVehicleColliderOBB,
  stepPlayerVehicle,
  type PlayerVehicleState,
} from './core/vehicle';
import { WantedSystem } from './core/wanted';
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
import { getStrings } from './i18n/strings';
import {
  RegionWorldScene,
  type PlayerCameraView,
  type QaCameraMode,
} from './render/RegionWorldScene';
import { installGlobalErrorBoundary } from './runtime/errorBoundary';
import {
  HybridStorage,
  registerBackButtonHandler,
  triggerLightHaptic,
} from './runtime/nativeBridge';
import { ProceduralSoundEngine } from './runtime/soundEngine';
import { HudOverlay } from './ui/HudOverlay';
import { MinimapRenderer } from './ui/MinimapRenderer';

const APP_VERSION = '0.4.0';

interface ActiveRegionRuntime {
  meta: RegionRegistryEntry;
  manifest: RegionManifest;
  terrain: TerrainGrid;
  roadGraph: RoadGraph;
  scene: RegionWorldScene;
  traffic: RoadTrafficSimulator;
  pedestrians: PedestrianSimulator;
  missions: TaxiMissionManager;
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
  locale: 'tr' | 'en';
  physicsReady: boolean;
  inVehicle: boolean;
  driverVisibleInCabin: boolean;
  speedKph: number;
  cash: number;
  wantedStars: number;
  trafficCount: number;
  pedestrianCount: number;
  activeMissionPhase: 'pickup' | 'dropoff' | null;
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

  const scene = new RegionWorldScene(
    container,
    meta,
    manifest,
    terrain,
    qualityTier,
    timeOfDay,
  );
  const trafficCount = qualityTier === 'lite' ? 12 : 18;
  const pedCount = qualityTier === 'lite' ? 16 : 32;
  const seed = regionId === 'esenler-namik-kemal' ? 34034 : 34001;
  const traffic = new RoadTrafficSimulator(
    roadGraph,
    trafficCount,
    seed,
    manifest.spawn.x,
    manifest.spawn.z,
  );
  const pedestrians = new PedestrianSimulator(roadGraph, pedCount, seed + 17);
  const missions = new TaxiMissionManager(manifest.landmarks, roadGraph.nodes, seed + 99);

  return { meta, manifest, terrain, roadGraph, scene, traffic, pedestrians, missions };
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

  const saveStore = new SaveStore(storage);
  const crashLog = new CrashLogStore(storage);
  const loaded = saveStore.load();
  const save: SaveData = loaded.data;

  if (loaded.source === 'default') {
    const nav = navigator as Navigator & { deviceMemory?: number };
    save.qualityTier = suggestQualityTier(nav.hardwareConcurrency, nav.deviceMemory);
  }
  if (params.get('mode') === 'lite') save.qualityTier = 'lite';
  if (params.get('mode') === 'normal') save.qualityTier = 'normal';

  let timeOfDay: TimeOfDay = params.get('time') === 'night' ? 'night' : 'day';
  let activeRegionId: RegionId = resolveRegionId(params.get('region') ?? save.activeRegionId);
  let paused = false;
  let renderFrozen = false;

  const sound = new ProceduralSoundEngine();
  const wanted = new WantedSystem(3);

  installGlobalErrorBoundary({
    crashLog,
    appVersion: APP_VERSION,
    getLocale: () => save.locale,
    onCrash: () => {
      paused = true;
    },
  });

  // Unlock procedural audio seamlessly on first pointer or keyboard interaction
  const unlockOnce = (): void => {
    sound.unlock();
  };
  window.addEventListener('pointerdown', unlockOnce, { passive: true });
  window.addEventListener('keydown', unlockOnce, { passive: true });

  // Mount initial region (default: Tepe Mahallesi)
  let runtime = await loadRegionBundle(container, activeRegionId, save.qualityTier, timeOfDay);
  const minimap = new MinimapRenderer(runtime.roadGraph);
  const clock = new FixedStepClock(60, 0.1, 6);

  let playerX = runtime.manifest.spawn.x;
  let playerZ = runtime.manifest.spawn.z;
  let playerY = sampleTerrainElevation(runtime.terrain, playerX, playerZ);
  let velX = 0;
  let velZ = 0;
  let inVehicle = false;
  let speedKph = 0;
  let gear: 'R' | 'N' | 'D' = 'N';
  let physicsReady = false;
  let elapsedSec = 0;
  const playerCapsule = createPlayerCapsuleState(playerX, playerY, playerZ);

  const placeVehicleNear = (
    rt: ActiveRegionRuntime,
    px: number,
    pz: number,
    heading: number,
  ): PlayerVehicleState => {
    const rawX = clamp(
      px + Math.sin(heading) * 3.8 + Math.cos(heading) * 1.4,
      rt.terrain.minX + 12,
      rt.terrain.maxX - 12,
    );
    const rawZ = clamp(
      pz + Math.cos(heading) * 3.8 - Math.sin(heading) * 1.4,
      rt.terrain.minZ + 12,
      rt.terrain.maxZ - 12,
    );
    const clear = rt.scene.spatialGrid.resolveCircle(rawX, rawZ, 1.35);
    const vy = sampleTerrainElevation(rt.terrain, clear.x, clear.z);
    return createVehicleState('player-taxi', 'taxi', clear.x, vy, clear.z, heading);
  };

  let playerVehicle = placeVehicleNear(
    runtime,
    runtime.manifest.spawn.x,
    runtime.manifest.spawn.z,
    runtime.manifest.spawn.heading,
  );
  runtime.missions.ensureMission(playerX, playerZ);

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
      touchUi,
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
    save.wantedStars = wanted.getStars();
    saveStore.save(save);
  };

  let syncDebugHandle: () => void = () => {};

  const collectActiveVehicleOBBs = (): VehicleColliderOBB[] => {
    const list: VehicleColliderOBB[] = [getVehicleColliderOBB(playerVehicle)];
    for (const car of runtime.traffic.getAgents()) {
      list.push({
        id: `traffic-${car.id}`,
        x: car.x,
        z: car.z,
        heading: car.heading,
        halfWidth: car.archetype === 'dolmus' ? 1.05 : 0.96,
        halfLength: car.archetype === 'dolmus' ? 2.55 : 2.15,
      });
    }
    for (const unit of wanted.getUnits()) {
      list.push({
        id: `police-${unit.id}`,
        x: unit.x,
        z: unit.z,
        heading: unit.heading,
        halfWidth: 0.98,
        halfLength: 2.25,
      });
    }
    return list;
  };

  const teleportTo = (x: number, z: number): void => {
    const tx = clamp(x, runtime.terrain.minX + 12, runtime.terrain.maxX - 12);
    const tz = clamp(z, runtime.terrain.minZ + 12, runtime.terrain.maxZ - 12);
    const ty = sampleTerrainElevation(runtime.terrain, tx, tz);
    if (inVehicle) {
      playerVehicle.x = tx;
      playerVehicle.z = tz;
      playerVehicle.y = ty;
      playerVehicle.speed = 0;
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

  const enterVehicle = (): void => {
    inVehicle = true;
    playerX = playerVehicle.x;
    playerY = playerVehicle.y;
    playerZ = playerVehicle.z;
    velX = 0;
    velZ = 0;
    attachPlayerToVehicleSeat(playerCapsule, playerVehicle.id, playerX, playerY, playerZ);
    hud.resetTouchInputs();
    sound.playDoorClick();
    void triggerLightHaptic();
    syncDebugHandle();
  };

  const exitVehicle = (): void => {
    if (!inVehicle) return;
    inVehicle = false;
    playerVehicle.speed = 0;
    playerVehicle.drifting = false;
    const exit = computeSafeExitPosition(
      playerVehicle,
      runtime.scene.spatialGrid,
      (x, z) => sampleTerrainElevation(runtime.terrain, x, z),
      collectActiveVehicleOBBs(),
      {
        minX: runtime.terrain.minX,
        maxX: runtime.terrain.maxX,
        minZ: runtime.terrain.minZ,
        maxZ: runtime.terrain.maxZ,
      },
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
    void triggerLightHaptic();
    syncDebugHandle();
  };

  const toggleVehicle = (): void => {
    if (inVehicle) {
      exitVehicle();
      return;
    }
    const dist = distance2D(playerX, playerZ, playerVehicle.x, playerVehicle.z);
    if (dist <= ENTER_VEHICLE_DISTANCE) {
      enterVehicle();
    }
  };

  const callTaxi = (): void => {
    const heading = runtime.scene.getCameraYaw() + Math.PI;
    playerVehicle = placeVehicleNear(runtime, playerX, playerZ, heading);
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

  const cycleCameraView = (): PlayerCameraView => {
    const next = runtime.scene.cyclePlayerCameraView();
    const t = getStrings(save.locale);
    const label =
      next === 'wide'
        ? t.cameraWide
        : next === 'hood'
          ? t.cameraHood
          : next === 'topdown'
            ? t.cameraTopdown
            : t.cameraChase;
    hud.setState(
      save.locale,
      save.qualityTier,
      timeOfDay,
      activeRegionId,
      next,
      sound.isMuted(),
    );
    hud.showToast(`📷 ${label}`);
    sound.playUiTap();
    void triggerLightHaptic();
    syncDebugHandle();
    return next;
  };

  const toggleAudio = (): boolean => {
    const muted = sound.toggleMute();
    hud.setState(
      save.locale,
      save.qualityTier,
      timeOfDay,
      activeRegionId,
      runtime.scene.getPlayerCameraView(),
      muted,
    );
    if (!muted) sound.playUiTap();
    void triggerLightHaptic();
    syncDebugHandle();
    return muted;
  };

  let switchingRegion = false;
  const switchRegion = async (nextId: RegionId): Promise<void> => {
    if (switchingRegion || nextId === activeRegionId) return;
    switchingRegion = true;
    try {
      const nextRuntime = await loadRegionBundle(container, nextId, save.qualityTier, timeOfDay);
      runtime.scene.dispose();
      runtime = nextRuntime;
      activeRegionId = nextId;
      wanted.clearWanted();
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
      );
      runtime.missions.ensureMission(playerX, playerZ);
      minimap.setRoadGraph(runtime.roadGraph);
      runtime.scene.updateStreaming(playerX, playerZ);
      attachCanvasDrag(runtime.scene.renderer.domElement);
      hud.setLandmarks(runtime.manifest.landmarks);
      hud.setState(
        save.locale,
        save.qualityTier,
        timeOfDay,
        activeRegionId,
        runtime.scene.getPlayerCameraView(),
        sound.isMuted(),
      );
      applySave();
      syncDebugHandle();
    } finally {
      switchingRegion = false;
    }
  };

  const setQuality = (tier: QualityTier): void => {
    save.qualityTier = tier;
    runtime.scene.applyQuality(save.qualityTier);
    hud.setState(
      save.locale,
      save.qualityTier,
      timeOfDay,
      activeRegionId,
      runtime.scene.getPlayerCameraView(),
      sound.isMuted(),
    );
    applySave();
    syncDebugHandle();
  };

  const toggleQuality = (): void => {
    setQuality(save.qualityTier === 'normal' ? 'lite' : 'normal');
    sound.playUiTap();
    void triggerLightHaptic();
  };

  const setTimeOfDay = (mode: TimeOfDay): void => {
    timeOfDay = mode;
    runtime.scene.setTimeOfDay(timeOfDay);
    hud.setState(
      save.locale,
      save.qualityTier,
      timeOfDay,
      activeRegionId,
      runtime.scene.getPlayerCameraView(),
      sound.isMuted(),
    );
    syncDebugHandle();
  };

  const toggleTimeOfDay = (): void => {
    setTimeOfDay(timeOfDay === 'day' ? 'night' : 'day');
    sound.playUiTap();
    void triggerLightHaptic();
  };

  const toggleLocale = (): void => {
    save.locale = save.locale === 'tr' ? 'en' : 'tr';
    hud.setState(
      save.locale,
      save.qualityTier,
      timeOfDay,
      activeRegionId,
      runtime.scene.getPlayerCameraView(),
      sound.isMuted(),
    );
    applySave();
    sound.playUiTap();
    void triggerLightHaptic();
    syncDebugHandle();
  };

  const togglePause = (): void => {
    paused = !paused;
    hud.openModal(paused ? 'pause' : 'none');
    if (paused) applySave();
    sound.playUiTap();
    void triggerLightHaptic();
    syncDebugHandle();
  };

  const dismissBusted = (): void => {
    paused = false;
    wanted.clearWanted();
    exitVehicle();
    teleportTo(runtime.manifest.spawn.x, runtime.manifest.spawn.z);
    playerVehicle = placeVehicleNear(
      runtime,
      runtime.manifest.spawn.x,
      runtime.manifest.spawn.z,
      runtime.manifest.spawn.heading,
    );
    hud.openModal('none');
    applySave();
    syncDebugHandle();
  };

  let fpsSmoothed = 60;
  let frameMsSmoothed = 16.6;
  const uaInfo = parseUserAgentInfo(navigator.userAgent, navigator.platform);

  const buildDiagnosticsSnapshot = (): DiagnosticsSnapshot => {
    const tel = runtime.scene.getTelemetry();
    const gpu = runtime.scene.getGpuInfo();
    const heap = readJsHeapMb();
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
      deviceModel: uaInfo.deviceModel,
      platform: uaInfo.platform,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: Number(tel.pixelRatio.toFixed(2)),
      touchUi,
      crashCount: crashLog.list().length,
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
        wanted.clearWanted();
        exitVehicle();
        teleportTo(runtime.manifest.spawn.x, runtime.manifest.spawn.z);
        playerVehicle = placeVehicleNear(
          runtime,
          runtime.manifest.spawn.x,
          runtime.manifest.spawn.z,
          runtime.manifest.spawn.heading,
        );
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
      onDismissBusted: dismissBusted,
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
      if (hud.getActiveModal() === 'busted') {
        dismissBusted();
        return;
      }
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
    if (hud.getActiveModal() === 'busted') {
      dismissBusted();
      return;
    }
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
    locale: save.locale,
    physicsReady: false,
    inVehicle: false,
    driverVisibleInCabin: false,
    speedKph: 0,
    cash: save.cash,
    wantedStars: 0,
    trafficCount: runtime.traffic.getAgents().length,
    pedestrianCount: runtime.pedestrians.getAgents().length,
    activeMissionPhase: runtime.missions.getActive()?.phase ?? null,
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
    debugHandle.locale = save.locale;
    debugHandle.physicsReady = physicsReady;
    debugHandle.inVehicle = inVehicle;
    debugHandle.driverVisibleInCabin = runtime.scene.isCharacterMountedInTaxi();
    debugHandle.speedKph = speedKph;
    debugHandle.cash = save.cash;
    debugHandle.wantedStars = wanted.getStars();
    debugHandle.trafficCount = runtime.traffic.getAgents().length;
    debugHandle.pedestrianCount = runtime.pedestrians.getAgents().length;
    debugHandle.activeMissionPhase = runtime.missions.getActive()?.phase ?? null;
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

    let throttleActive = false;

    if (!paused && !switchingRegion) {
      const intent = mergeControlIntent(kb, hud.getTouchInput());
      const driveTouch = hud.getTouchDrivingInput();
      const yawTurn = (turnLeft ? 1 : 0) - (turnRight ? 1 : 0);

      clock.advance(rawDt, (dt) => {
        if (yawTurn !== 0) {
          runtime.scene.rotateCameraYaw(yawTurn * 2.1 * dt);
        }

        const sampleElev = (x: number, z: number): number =>
          sampleTerrainElevation(runtime.terrain, x, z);
        const inSanctuary =
          findSanctuaryZone(playerX, playerZ, runtime.manifest.sanctuaryZones) !== null;

        const activeVehicles = collectActiveVehicleOBBs();

        if (inVehicle) {
          const throttle = kb.forward || driveTouch.gas ? 1 : 0;
          const brake = kb.backward || driveTouch.brake ? 1 : 0;
          const steer =
            (kb.left || driveTouch.steerLeft ? 1 : 0) -
            (kb.right || driveTouch.steerRight ? 1 : 0);
          const hb = handbrake || driveTouch.handbrake;
          throttleActive = throttle > 0;

          const res = stepPlayerVehicle(
            playerVehicle,
            { throttle, brake, steer, handbrake: hb },
            dt,
            {
              minX: runtime.terrain.minX,
              maxX: runtime.terrain.maxX,
              minZ: runtime.terrain.minZ,
              maxZ: runtime.terrain.maxZ,
            },
            sampleElev,
            runtime.scene.spatialGrid,
          );
          if (res.impactSpeed > 4.2) {
            sound.playImpact(res.impactSpeed);
            void triggerLightHaptic();
          }

          // Solid collision against AI traffic (fixes ghost pass-through bug!)
          const carVx = Math.sin(playerVehicle.heading) * playerVehicle.speed;
          const carVz = Math.cos(playerVehicle.heading) * playerVehicle.speed;
          const trafficHit = runtime.traffic.resolvePlayerVehicleCollision(
            playerVehicle.x,
            playerVehicle.z,
            carVx,
            carVz,
          );
          if (trafficHit.collided) {
            playerVehicle.x = trafficHit.x;
            playerVehicle.z = trafficHit.z;
            playerVehicle.y = sampleElev(playerVehicle.x, playerVehicle.z);
            playerVehicle.speed *= trafficHit.impactSpeed > 6 ? 0.55 : 0.78;
            if (trafficHit.impactSpeed > 2.6) {
              sound.playImpact(trafficHit.impactSpeed * 1.15);
              void triggerLightHaptic();
            }
            if (trafficHit.impactSpeed > 8.0) {
              wanted.reportOffense(18, inSanctuary);
            }
          }

          speedKph = Math.round(Math.abs(playerVehicle.speed) * 3.6);
          gear = res.gear;
          playerX = playerVehicle.x;
          playerY = playerVehicle.y;
          playerZ = playerVehicle.z;
          playerCapsule.x = playerX;
          playerCapsule.y = playerY;
          playerCapsule.z = playerZ;
          velX = Math.sin(playerVehicle.heading) * playerVehicle.speed;
          velZ = Math.cos(playerVehicle.heading) * playerVehicle.speed;
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
            {
              minX: runtime.terrain.minX,
              maxX: runtime.terrain.maxX,
              minZ: runtime.terrain.minZ,
              maxZ: runtime.terrain.maxZ,
            },
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
        runtime.traffic.step(dt, playerX, playerZ, sampleElev);
        const pedStep = runtime.pedestrians.step(
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
        if (pedStep.closeCalls > 0) {
          wanted.reportOffense(14 * pedStep.closeCalls, inSanctuary);
        }

        // Step Sarı Taksi passenger mission loop
        const missionEv = runtime.missions.step(dt, playerX, playerZ, inVehicle, speedKph);
        if (missionEv.type === 'picked_up') {
          const t = getStrings(save.locale);
          const dest = save.locale === 'tr' ? missionEv.targetNameTr : missionEv.targetNameEn;
          hud.showToast(`🚕 ${t.missionPickedUpToast}: ${dest ?? ''}`);
          sound.playMissionChime(false);
          void triggerLightHaptic();
        } else if (missionEv.type === 'completed') {
          const reward = missionEv.rewardCash ?? 150;
          save.cash += reward;
          applySave();
          const t = getStrings(save.locale);
          hud.showToast(`💰 ${t.missionCompletedToast} +₺${reward}`);
          sound.playMissionChime(true);
          void triggerLightHaptic();
        } else if (missionEv.type === 'expired') {
          hud.showToast(getStrings(save.locale).missionExpiredToast);
        }

        // Step M3 Wanted 1–5★ & fictional Şehir Polisi patrol pursuit
        const wantedRes = wanted.step(
          dt,
          playerX,
          playerZ,
          inVehicle ? playerVehicle.speed : Math.hypot(velX, velZ),
          inSanctuary,
          runtime.scene.spatialGrid,
          sampleElev,
        );
        if (wantedRes.busted) {
          save.cash = Math.max(0, save.cash - 50);
          applySave();
          paused = true;
          hud.openModal('busted');
        }
      });

      if (nowMs - lastStreamCheckMs >= 450) {
        lastStreamCheckMs = nowMs;
        runtime.scene.updateStreaming(playerX, playerZ);
      }

      runtime.scene.updateTraffic(runtime.traffic.getAgents());
      runtime.scene.updatePedestrians(runtime.pedestrians.getAgents());
      runtime.scene.updatePolice(wanted.getUnits());
      runtime.scene.updateMissionBeacon(runtime.missions.getActive());
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

    sound.updateContinuous(
      paused,
      inVehicle,
      speedKph,
      throttleActive,
      playerVehicle.drifting,
      wanted.getStars(),
      elapsedSec,
    );

    runtime.scene.render();

    // Update crisp rotating 2D Minimap radar at ~10 Hz (ultra-low CPU overhead)
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
        police: wanted.getUnits(),
        sanctuaries: runtime.manifest.sanctuaryZones,
        mission: runtime.missions.getActive(),
        timeSec: elapsedSec,
      });
    }

    const tel = runtime.scene.getTelemetry();
    const activeSanctuary = findSanctuaryZone(playerX, playerZ, runtime.manifest.sanctuaryZones);
    const nearVehicle =
      !inVehicle &&
      distance2D(playerX, playerZ, playerVehicle.x, playerVehicle.z) <= ENTER_VEHICLE_DISTANCE;

    debugHandle.paused = paused;
    debugHandle.regionId = activeRegionId;
    debugHandle.qualityTier = save.qualityTier;
    debugHandle.timeOfDay = timeOfDay;
    debugHandle.cameraView = runtime.scene.getPlayerCameraView();
    debugHandle.audioMuted = sound.isMuted();
    debugHandle.locale = save.locale;
    debugHandle.physicsReady = physicsReady;
    debugHandle.inVehicle = inVehicle;
    debugHandle.driverVisibleInCabin = runtime.scene.isCharacterMountedInTaxi();
    debugHandle.speedKph = speedKph;
    debugHandle.cash = save.cash;
    debugHandle.wantedStars = wanted.getStars();
    debugHandle.trafficCount = runtime.traffic.getAgents().length;
    debugHandle.pedestrianCount = runtime.pedestrians.getAgents().length;
    debugHandle.activeMissionPhase = runtime.missions.getActive()?.phase ?? null;
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

    if (nowMs - lastHudUpdateMs >= 250) {
      lastHudUpdateMs = nowMs;
      const t = getStrings(save.locale);
      const activeMission = runtime.missions.getActive();
      let missionLabel: string | null = null;
      if (activeMission) {
        const mDist = Math.round(
          distance2D(playerX, playerZ, activeMission.targetX, activeMission.targetZ),
        );
        const mName =
          save.locale === 'tr' ? activeMission.targetNameTr : activeMission.targetNameEn;
        if (activeMission.phase === 'pickup') {
          missionLabel = `🚕 ${t.missionPickupPrefix}: ${mName} · ${mDist} m`;
        } else {
          missionLabel = `🏁 ${t.missionDropoffPrefix}: ${mName} · ${mDist} m · ${Math.ceil(activeMission.timeRemainingSec)}s`;
        }
      }

      hud.updateTelemetry({
        fps: fpsSmoothed,
        drawCalls: tel.drawCalls,
        triangles: tel.triangles,
        loadedTiles: tel.loadedTiles,
        activeBuildings: tel.activeBuildings,
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
        drifting: playerVehicle.drifting,
        cash: save.cash,
        wantedStars: wanted.getStars(),
        missionLabel,
        missionPhase: activeMission?.phase ?? null,
      });
    }

    if (!renderFrozen) {
      window.requestAnimationFrame(tick);
    }
  };

  window.requestAnimationFrame(tick);
}

void bootstrap();
