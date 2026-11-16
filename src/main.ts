import './styles.css';
import { CrashLogStore } from './core/crashLog';
import { mergeControlIntent, type KeyboardInputState } from './core/controls';
import { FixedStepClock } from './core/gameLoop';
import { clamp, distance2D } from './core/math';
import { ensureRapierReady } from './core/physics';
import { suggestQualityTier, type QualityTier } from './core/quality';
import { findSanctuaryZone } from './core/sanctuary';
import { SaveStore, type SaveData } from './core/save';
import { FATIH_REGION_ID } from './core/world/geo';
import { sampleTerrainElevation } from './core/world/terrain';
import type { LandmarkPin, RegionManifest, TerrainGrid } from './core/world/types';
import { getStrings } from './i18n/strings';
import { FatihWorldScene } from './render/FatihWorldScene';
import { installGlobalErrorBoundary } from './runtime/errorBoundary';
import {
  HybridStorage,
  registerBackButtonHandler,
  triggerLightHaptic,
} from './runtime/nativeBridge';
import { HudOverlay } from './ui/HudOverlay';

const APP_VERSION = '0.1.0-m1';
const WALK_SPEED = 7.2;
const SPRINT_SPEED = 14.5;
const PLAYER_RADIUS = 0.7;

interface GameDebugHandle {
  version: string;
  regionId: string;
  regionLoaded: boolean;
  paused: boolean;
  qualityTier: QualityTier;
  locale: 'tr' | 'en';
  physicsReady: boolean;
  sanctuaryId: string | null;
  player: { x: number; y: number; z: number };
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
  toggleLocale: () => void;
  togglePause: () => void;
  openAbout: () => void;
  closeModal: () => void;
  teleportTo: (x: number, z: number) => void;
  getCrashCount: () => number;
}

declare global {
  interface Window {
    __game?: GameDebugHandle;
  }
}

function detectTouchUi(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get('touch') === '1') return true;
  if (params.get('touch') === '0') return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

async function bootstrap(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) {
    throw new Error('Root #app element not found');
  }

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

  let paused = false;

  installGlobalErrorBoundary({
    crashLog,
    appVersion: APP_VERSION,
    getLocale: () => save.locale,
    onCrash: () => {
      paused = true;
    },
  });

  // Load offline Fatih (Sultanahmet - Eminönü) manifest + Copernicus DEM terrain grid
  const regionBaseUrl = `./regions/${FATIH_REGION_ID}`;
  const [manifestRes, terrainRes] = await Promise.all([
    fetch(`${regionBaseUrl}/manifest.json`),
    fetch(`${regionBaseUrl}/terrain.json`),
  ]);
  if (!manifestRes.ok || !terrainRes.ok) {
    throw new Error(`Failed to load offline region ${FATIH_REGION_ID}`);
  }
  const manifest = (await manifestRes.json()) as RegionManifest;
  const terrain = (await terrainRes.json()) as TerrainGrid;

  const worldScene = new FatihWorldScene(
    container,
    manifest,
    terrain,
    regionBaseUrl,
    save.qualityTier,
  );
  const clock = new FixedStepClock(60, 0.1, 6);

  // Start at verified Sultanahmet Square spawn (open space, real Copernicus DEM elevation)
  let playerX = manifest.spawn.x;
  let playerZ = manifest.spawn.z;
  let playerY = sampleTerrainElevation(terrain, playerX, playerZ);
  let velX = 0;
  let velZ = 0;
  let physicsReady = false;

  // Prime embedded Rapier3D WASM asynchronously so M2 vehicle physics is already warm
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

  // Stream initial 300m tiles around Sultanahmet Square immediately
  worldScene.updateStreaming(playerX, playerZ);

  const kb: KeyboardInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };
  let turnLeft = false;
  let turnRight = false;

  const applySave = (): void => {
    save.activeRegionId = manifest.regionId;
    save.playerPos = { x: playerX, y: playerY, z: playerZ };
    saveStore.save(save);
  };

  const teleportTo = (x: number, z: number): void => {
    playerX = clamp(x, terrain.minX + 10, terrain.maxX - 10);
    playerZ = clamp(z, terrain.minZ + 10, terrain.maxZ - 10);
    playerY = sampleTerrainElevation(terrain, playerX, playerZ);
    worldScene.updateStreaming(playerX, playerZ);
    applySave();
  };

  const toggleQuality = (): void => {
    save.qualityTier = save.qualityTier === 'normal' ? 'lite' : 'normal';
    worldScene.applyQuality(save.qualityTier);
    hud.setState(save.locale, save.qualityTier);
    applySave();
    void triggerLightHaptic();
  };

  const toggleLocale = (): void => {
    save.locale = save.locale === 'tr' ? 'en' : 'tr';
    hud.setState(save.locale, save.qualityTier);
    applySave();
    void triggerLightHaptic();
  };

  const togglePause = (): void => {
    paused = !paused;
    hud.openModal(paused ? 'pause' : 'none');
    if (paused) applySave();
    void triggerLightHaptic();
  };

  const hud = new HudOverlay(
    container,
    save.locale,
    save.qualityTier,
    detectTouchUi(),
    crashLog,
    {
      onToggleQuality: toggleQuality,
      onToggleLocale: toggleLocale,
      onTogglePause: togglePause,
      onResetPosition: () => teleportTo(manifest.spawn.x, manifest.spawn.z),
      onTeleportLandmark: (lm: LandmarkPin) => {
        // Offset 25m outside mosque footprints while staying inside or beside plaza
        const offset = lm.kind === 'mosque' ? 38 : 6;
        teleportTo(lm.x - offset, lm.z + offset * 0.5);
      },
    },
  );
  hud.setLandmarks(manifest.landmarks);

  if (loaded.recoveredFromCorruption) {
    hud.showToast(getStrings(save.locale).recoveredSaveToast);
  }

  // Right-side / canvas drag rotates third-person camera yaw smoothly
  let dragPointerId: number | null = null;
  let lastDragX = 0;
  const canvas = worldScene.renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    dragPointerId = e.pointerId;
    lastDragX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== dragPointerId) return;
    const dx = e.clientX - lastDragX;
    lastDragX = e.clientX;
    worldScene.rotateCameraYaw(-dx * 0.0055);
  });
  const endDrag = (e: PointerEvent): void => {
    if (e.pointerId === dragPointerId) dragPointerId = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

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
      if (hud.getActiveModal() === 'about' || hud.getActiveModal() === 'crashlog') {
        hud.openModal(paused ? 'pause' : 'none');
      } else {
        togglePause();
      }
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
    turnLeft = false;
    turnRight = false;
  });

  registerBackButtonHandler(() => {
    if (hud.getActiveModal() === 'about' || hud.getActiveModal() === 'crashlog') {
      hud.openModal(paused ? 'pause' : 'none');
      return;
    }
    togglePause();
  });

  window.addEventListener('resize', () => {
    worldScene.resize(window.innerWidth, window.innerHeight);
  });

  const findNearestLandmarkLabel = (): string => {
    let best: LandmarkPin | null = null;
    let bestDist = Infinity;
    for (const lm of manifest.landmarks) {
      const d = distance2D(playerX, playerZ, lm.x, lm.z);
      if (d < bestDist) {
        bestDist = d;
        best = lm;
      }
    }
    if (!best) return manifest.nameTr;
    const name = save.locale === 'tr' ? best.nameTr : best.nameEn;
    return `${name} · ${Math.round(bestDist)} m`;
  };

  let lastTimeMs = performance.now();
  let fpsSmoothed = 60;
  let frameMsSmoothed = 16.6;
  let lastHudUpdateMs = 0;
  let lastStreamCheckMs = 0;

  const debugHandle: GameDebugHandle = {
    version: APP_VERSION,
    regionId: manifest.regionId,
    regionLoaded: true,
    paused: false,
    qualityTier: save.qualityTier,
    locale: save.locale,
    physicsReady: false,
    sanctuaryId: null,
    player: { x: playerX, y: playerY, z: playerZ },
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
    toggleLocale,
    togglePause,
    openAbout: () => hud.openModal('about'),
    closeModal: () => {
      paused = false;
      hud.openModal('none');
    },
    teleportTo,
    getCrashCount: () => crashLog.list().length,
  };
  window.__game = debugHandle;

  const tick = (nowMs: number): void => {
    const rawDt = Math.max(0.0001, (nowMs - lastTimeMs) / 1000);
    lastTimeMs = nowMs;

    const frameMs = rawDt * 1000;
    frameMsSmoothed = frameMsSmoothed * 0.9 + frameMs * 0.1;
    fpsSmoothed = fpsSmoothed * 0.9 + Math.min(240, 1 / rawDt) * 0.1;

    if (!paused) {
      const intent = mergeControlIntent(kb, hud.getTouchInput());
      const yawTurn = (turnLeft ? 1 : 0) - (turnRight ? 1 : 0);

      clock.advance(rawDt, (dt) => {
        if (yawTurn !== 0) {
          worldScene.rotateCameraYaw(yawTurn * 2.1 * dt);
        }

        const speed = intent.sprint ? SPRINT_SPEED : WALK_SPEED;
        const yaw = worldScene.getCameraYaw();
        // Camera forward = (-sin(yaw), -cos(yaw)); camera right = (cos(yaw), -sin(yaw))
        const fwdX = -Math.sin(yaw);
        const fwdZ = -Math.cos(yaw);
        const rightX = Math.cos(yaw);
        const rightZ = -Math.sin(yaw);

        velX = (rightX * intent.moveX + fwdX * intent.moveY) * speed;
        velZ = (rightZ * intent.moveX + fwdZ * intent.moveY) * speed;

        let nextX = clamp(playerX + velX * dt, terrain.minX + 8, terrain.maxX - 8);
        let nextZ = clamp(playerZ + velZ * dt, terrain.minZ + 8, terrain.maxZ - 8);

        // Resolve against real streamed OSM building footprints
        const resolved = worldScene.spatialGrid.resolveCircle(nextX, nextZ, PLAYER_RADIUS);
        nextX = resolved.x;
        nextZ = resolved.z;

        playerX = nextX;
        playerZ = nextZ;
        playerY = sampleTerrainElevation(terrain, playerX, playerZ);
      });

      if (nowMs - lastStreamCheckMs >= 450) {
        lastStreamCheckMs = nowMs;
        worldScene.updateStreaming(playerX, playerZ);
      }

      worldScene.updateVisuals(playerX, playerY, playerZ, velX, velZ, Math.min(rawDt, 0.05));
    }

    worldScene.render();

    const tel = worldScene.getTelemetry();
    const activeSanctuary = findSanctuaryZone(playerX, playerZ, manifest.sanctuaryZones);

    debugHandle.paused = paused;
    debugHandle.qualityTier = save.qualityTier;
    debugHandle.locale = save.locale;
    debugHandle.physicsReady = physicsReady;
    debugHandle.sanctuaryId = activeSanctuary?.id ?? null;
    debugHandle.player = { x: playerX, y: playerY, z: playerZ };
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
        nearestLandmarkLabel: findNearestLandmarkLabel(),
        sanctuaryLabel: activeSanctuary
          ? save.locale === 'tr'
            ? activeSanctuary.nameTr
            : activeSanctuary.nameEn
          : null,
      });
    }

    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

void bootstrap();
