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
import { ensureRapierReady } from './core/physics';
import { suggestQualityTier, type QualityTier } from './core/quality';
import { findSanctuaryZone } from './core/sanctuary';
import { SaveStore, type SaveData } from './core/save';
import { RoadTrafficSimulator } from './core/traffic';
import {
  computeSafeExitPosition,
  createVehicleState,
  ENTER_VEHICLE_DISTANCE,
  stepPlayerVehicle,
  type PlayerVehicleState,
} from './core/vehicle';
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
import { RegionWorldScene, type QaCameraMode } from './render/RegionWorldScene';
import { installGlobalErrorBoundary } from './runtime/errorBoundary';
import {
  HybridStorage,
  registerBackButtonHandler,
  triggerLightHaptic,
} from './runtime/nativeBridge';
import { HudOverlay } from './ui/HudOverlay';

const APP_VERSION = '0.2.0';
const WALK_SPEED = 7.2;
const SPRINT_SPEED = 14.5;
const PLAYER_RADIUS = 0.7;

interface ActiveRegionRuntime {
  meta: RegionRegistryEntry;
  manifest: RegionManifest;
  terrain: TerrainGrid;
  scene: RegionWorldScene;
  traffic: RoadTrafficSimulator;
}

interface GameDebugHandle {
  version: string;
  regionId: RegionId;
  regionLoaded: boolean;
  paused: boolean;
  qualityTier: QualityTier;
  timeOfDay: TimeOfDay;
  locale: 'tr' | 'en';
  physicsReady: boolean;
  inVehicle: boolean;
  speedKph: number;
  trafficCount: number;
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
  const trafficCount = qualityTier === 'lite' ? 10 : 18;
  const traffic = new RoadTrafficSimulator(
    roadGraph,
    trafficCount,
    regionId === 'esenler-namik-kemal' ? 34034 : 34001,
  );

  return { meta, manifest, terrain, scene, traffic };
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

  installGlobalErrorBoundary({
    crashLog,
    appVersion: APP_VERSION,
    getLocale: () => save.locale,
    onCrash: () => {
      paused = true;
    },
  });

  // Mount initial region (default: Esenler / Namık Kemal)
  let runtime = await loadRegionBundle(container, activeRegionId, save.qualityTier, timeOfDay);
  const clock = new FixedStepClock(60, 0.1, 6);

  let playerX = runtime.manifest.spawn.x;
  let playerZ = runtime.manifest.spawn.z;
  let playerY = sampleTerrainElevation(runtime.terrain, playerX, playerZ);
  let velX = 0;
  let velZ = 0;
  let inVehicle = false;
  let speedKph = 0;
  let physicsReady = false;

  const placeVehicleAtSpawn = (rt: ActiveRegionRuntime): PlayerVehicleState => {
    const h = rt.manifest.spawn.heading;
    // Park drivable Sarı Taksi 4.2m ahead/beside spawn along the street
    const vx = clamp(
      rt.manifest.spawn.x + Math.sin(h) * 3.8 + Math.cos(h) * 1.4,
      rt.terrain.minX + 12,
      rt.terrain.maxX - 12,
    );
    const vz = clamp(
      rt.manifest.spawn.z + Math.cos(h) * 3.8 - Math.sin(h) * 1.4,
      rt.terrain.minZ + 12,
      rt.terrain.maxZ - 12,
    );
    const vy = sampleTerrainElevation(rt.terrain, vx, vz);
    return createVehicleState('player-taxi', 'taxi', vx, vy, vz, h);
  };

  let playerVehicle = placeVehicleAtSpawn(runtime);

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
    saveStore.save(save);
  };

  let syncDebugHandle: () => void = () => {};

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
    runtime.scene.updateStreaming(tx, tz);
    applySave();
    syncDebugHandle();
  };

  const enterVehicle = (): void => {
    inVehicle = true;
    playerX = playerVehicle.x;
    playerY = playerVehicle.y;
    playerZ = playerVehicle.z;
    void triggerLightHaptic();
    syncDebugHandle();
  };

  const exitVehicle = (): void => {
    if (!inVehicle) return;
    inVehicle = false;
    playerVehicle.speed = 0;
    const exit = computeSafeExitPosition(playerVehicle, runtime.scene.spatialGrid, (x, z) =>
      sampleTerrainElevation(runtime.terrain, x, z),
    );
    playerX = exit.x;
    playerY = exit.y;
    playerZ = exit.z;
    speedKph = 0;
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

  let switchingRegion = false;
  const switchRegion = async (nextId: RegionId): Promise<void> => {
    if (switchingRegion || nextId === activeRegionId) return;
    switchingRegion = true;
    try {
      const nextRuntime = await loadRegionBundle(container, nextId, save.qualityTier, timeOfDay);
      runtime.scene.dispose();
      runtime = nextRuntime;
      activeRegionId = nextId;
      inVehicle = false;
      speedKph = 0;
      playerX = runtime.manifest.spawn.x;
      playerZ = runtime.manifest.spawn.z;
      playerY = sampleTerrainElevation(runtime.terrain, playerX, playerZ);
      playerVehicle = placeVehicleAtSpawn(runtime);
      runtime.scene.updateStreaming(playerX, playerZ);
      attachCanvasDrag(runtime.scene.renderer.domElement);
      hud.setLandmarks(runtime.manifest.landmarks);
      hud.setState(save.locale, save.qualityTier, timeOfDay, activeRegionId);
      applySave();
      syncDebugHandle();
    } finally {
      switchingRegion = false;
    }
  };

  const setQuality = (tier: QualityTier): void => {
    save.qualityTier = tier;
    runtime.scene.applyQuality(save.qualityTier);
    hud.setState(save.locale, save.qualityTier, timeOfDay, activeRegionId);
    applySave();
    syncDebugHandle();
  };

  const toggleQuality = (): void => {
    setQuality(save.qualityTier === 'normal' ? 'lite' : 'normal');
    void triggerLightHaptic();
  };

  const setTimeOfDay = (mode: TimeOfDay): void => {
    timeOfDay = mode;
    runtime.scene.setTimeOfDay(timeOfDay);
    hud.setState(save.locale, save.qualityTier, timeOfDay, activeRegionId);
    syncDebugHandle();
  };

  const toggleTimeOfDay = (): void => {
    setTimeOfDay(timeOfDay === 'day' ? 'night' : 'day');
    void triggerLightHaptic();
  };

  const toggleLocale = (): void => {
    save.locale = save.locale === 'tr' ? 'en' : 'tr';
    hud.setState(save.locale, save.qualityTier, timeOfDay, activeRegionId);
    applySave();
    void triggerLightHaptic();
    syncDebugHandle();
  };

  const togglePause = (): void => {
    paused = !paused;
    hud.openModal(paused ? 'pause' : 'none');
    if (paused) applySave();
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
        exitVehicle();
        teleportTo(runtime.manifest.spawn.x, runtime.manifest.spawn.z);
        playerVehicle = placeVehicleAtSpawn(runtime);
      },
      onToggleVehicle: toggleVehicle,
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
      if (hud.getActiveModal() !== 'none' && hud.getActiveModal() !== 'pause') {
        hud.openModal(paused ? 'pause' : 'none');
      } else {
        togglePause();
      }
      return;
    }
    if (e.code === 'KeyF' && !e.repeat && !paused) {
      toggleVehicle();
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
    return `${name} · ${Math.round(bestDist)} m`;
  };

  const debugHandle: GameDebugHandle = {
    version: APP_VERSION,
    regionId: activeRegionId,
    regionLoaded: true,
    paused: false,
    qualityTier: save.qualityTier,
    timeOfDay,
    locale: save.locale,
    physicsReady: false,
    inVehicle: false,
    speedKph: 0,
    trafficCount: runtime.traffic.getAgents().length,
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
    debugHandle.locale = save.locale;
    debugHandle.physicsReady = physicsReady;
    debugHandle.inVehicle = inVehicle;
    debugHandle.speedKph = speedKph;
    debugHandle.trafficCount = runtime.traffic.getAgents().length;
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
  let lastStreamCheckMs = 0;

  const tick = (nowMs: number): void => {
    const rawDt = Math.max(0.0001, (nowMs - lastTimeMs) / 1000);
    lastTimeMs = nowMs;

    const frameMs = rawDt * 1000;
    frameMsSmoothed = frameMsSmoothed * 0.9 + frameMs * 0.1;
    fpsSmoothed = fpsSmoothed * 0.9 + Math.min(240, 1 / rawDt) * 0.1;

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

        if (inVehicle) {
          const throttle = (kb.forward || driveTouch.gas) ? 1 : 0;
          const brake = (kb.backward || driveTouch.brake) ? 1 : 0;
          const steer =
            ((kb.left || driveTouch.steerLeft) ? 1 : 0) -
            ((kb.right || driveTouch.steerRight) ? 1 : 0);

          const res = stepPlayerVehicle(
            playerVehicle,
            { throttle, brake, steer, handbrake },
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
          speedKph = res.speedKph;
          playerX = playerVehicle.x;
          playerY = playerVehicle.y;
          playerZ = playerVehicle.z;
          velX = Math.sin(playerVehicle.heading) * playerVehicle.speed;
          velZ = Math.cos(playerVehicle.heading) * playerVehicle.speed;
        } else {
          const speed = intent.sprint ? SPRINT_SPEED : WALK_SPEED;
          const yaw = runtime.scene.getCameraYaw();
          const fwdX = -Math.sin(yaw);
          const fwdZ = -Math.cos(yaw);
          const rightX = Math.cos(yaw);
          const rightZ = -Math.sin(yaw);

          velX = (rightX * intent.moveX + fwdX * intent.moveY) * speed;
          velZ = (rightZ * intent.moveX + fwdZ * intent.moveY) * speed;

          let nextX = clamp(playerX + velX * dt, runtime.terrain.minX + 8, runtime.terrain.maxX - 8);
          let nextZ = clamp(playerZ + velZ * dt, runtime.terrain.minZ + 8, runtime.terrain.maxZ - 8);

          const resolved = runtime.scene.spatialGrid.resolveCircle(nextX, nextZ, PLAYER_RADIUS);
          nextX = resolved.x;
          nextZ = resolved.z;

          playerX = nextX;
          playerZ = nextZ;
          playerY = sampleElev(playerX, playerZ);
          speedKph = 0;
        }

        // Advance road-graph AI traffic across real neighborhood streets
        runtime.traffic.step(dt, playerX, playerZ, sampleElev);
      });

      if (nowMs - lastStreamCheckMs >= 450) {
        lastStreamCheckMs = nowMs;
        runtime.scene.updateStreaming(playerX, playerZ);
      }

      runtime.scene.updateTraffic(runtime.traffic.getAgents());
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

    runtime.scene.render();

    const tel = runtime.scene.getTelemetry();
    const activeSanctuary = findSanctuaryZone(playerX, playerZ, runtime.manifest.sanctuaryZones);
    const nearVehicle =
      !inVehicle &&
      distance2D(playerX, playerZ, playerVehicle.x, playerVehicle.z) <= ENTER_VEHICLE_DISTANCE;

    debugHandle.paused = paused;
    debugHandle.regionId = activeRegionId;
    debugHandle.qualityTier = save.qualityTier;
    debugHandle.timeOfDay = timeOfDay;
    debugHandle.locale = save.locale;
    debugHandle.physicsReady = physicsReady;
    debugHandle.inVehicle = inVehicle;
    debugHandle.speedKph = speedKph;
    debugHandle.trafficCount = runtime.traffic.getAgents().length;
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
      hud.updateTelemetry({
        fps: fpsSmoothed,
        drawCalls: tel.drawCalls,
        triangles: tel.triangles,
        loadedTiles: tel.loadedTiles,
        activeBuildings: tel.activeBuildings,
        physicsReady,
        qualityTier: save.qualityTier,
        regionName:
          save.locale === 'tr' ? runtime.meta.nameTr : runtime.meta.nameEn,
        nearestLandmarkLabel: findNearestLandmarkLabel(),
        sanctuaryLabel: activeSanctuary
          ? save.locale === 'tr'
            ? activeSanctuary.nameTr
            : activeSanctuary.nameEn
          : null,
        inVehicle,
        nearVehicle,
        speedKph,
      });
    }

    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

void bootstrap();
