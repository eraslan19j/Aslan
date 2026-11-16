import './styles.css';
import { CrashLogStore } from './core/crashLog';
import { mergeControlIntent, type KeyboardInputState } from './core/controls';
import { FixedStepClock } from './core/gameLoop';
import { createStarterPhysicsWorld, type StarterPhysicsWorld } from './core/physics';
import { suggestQualityTier, type QualityTier } from './core/quality';
import { SaveStore, type SaveData } from './core/save';
import { getStrings } from './i18n/strings';
import { StarterScene } from './render/StarterScene';
import { installGlobalErrorBoundary } from './runtime/errorBoundary';
import {
  HybridStorage,
  registerBackButtonHandler,
  triggerLightHaptic,
} from './runtime/nativeBridge';
import { HudOverlay } from './ui/HudOverlay';

const APP_VERSION = '0.0.1-m0';

interface GameDebugHandle {
  version: string;
  paused: boolean;
  qualityTier: QualityTier;
  locale: 'tr' | 'en';
  physicsReady: boolean;
  player: { x: number; y: number; z: number };
  perf: {
    fps: number;
    frameMs: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    pixelRatio: number;
  };
  toggleQuality: () => void;
  toggleLocale: () => void;
  togglePause: () => void;
  openAbout: () => void;
  closeModal: () => void;
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

  // On first fresh launch without saved preference, auto-suggest Lite on low-spec devices
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

  const sceneHost = new StarterScene(container, save.qualityTier);
  const clock = new FixedStepClock(60, 0.1, 6);

  let physics: StarterPhysicsWorld | null = null;
  let playerX = 0;
  let playerY = 1.0;
  let playerZ = 6;
  let velX = 0;
  let velZ = 0;

  const kb: KeyboardInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
  };

  const applySave = (): void => {
    save.playerPos = { x: playerX, y: playerY, z: playerZ };
    saveStore.save(save);
  };

  const toggleQuality = (): void => {
    save.qualityTier = save.qualityTier === 'normal' ? 'lite' : 'normal';
    sceneHost.applyQuality(save.qualityTier);
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

  const resetPosition = (): void => {
    if (physics) {
      physics.resetPlayer(0, 1.2, 6);
      const p = physics.getPlayerPosition();
      playerX = p.x;
      playerY = p.y;
      playerZ = p.z;
    } else {
      playerX = 0;
      playerY = 1.0;
      playerZ = 6;
    }
    applySave();
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
      onResetPosition: resetPosition,
    },
  );

  if (loaded.recoveredFromCorruption) {
    hud.showToast(getStrings(save.locale).recoveredSaveToast);
  }

  // Keyboard bindings
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
  });

  // Android hardware/gesture back button -> Pause menu
  registerBackButtonHandler(() => {
    if (hud.getActiveModal() === 'about' || hud.getActiveModal() === 'crashlog') {
      hud.openModal(paused ? 'pause' : 'none');
      return;
    }
    togglePause();
  });

  // Resize handling
  window.addEventListener('resize', () => {
    sceneHost.resize(window.innerWidth, window.innerHeight);
  });

  // Initialize Rapier3D WASM physics asynchronously (scene renders immediately without blocking)
  void createStarterPhysicsWorld()
    .then((world) => {
      physics = world;
      const p = world.getPlayerPosition();
      playerX = p.x;
      playerY = p.y;
      playerZ = p.z;
    })
    .catch((err: unknown) => {
      crashLog.record({
        source: 'runtime',
        message: `Rapier init failed: ${err instanceof Error ? err.message : String(err)}`,
        version: APP_VERSION,
      });
    });

  // Main render & fixed-step simulation loop
  let lastTimeMs = performance.now();
  let fpsSmoothed = 60;
  let frameMsSmoothed = 16.6;
  let lastHudUpdateMs = 0;

  const debugHandle: GameDebugHandle = {
    version: APP_VERSION,
    paused: false,
    qualityTier: save.qualityTier,
    locale: save.locale,
    physicsReady: false,
    player: { x: playerX, y: playerY, z: playerZ },
    perf: {
      fps: 60,
      frameMs: 16.6,
      drawCalls: 0,
      triangles: 0,
      geometries: 0,
      textures: 0,
      pixelRatio: 1,
    },
    toggleQuality,
    toggleLocale,
    togglePause,
    openAbout: () => hud.openModal('about'),
    closeModal: () => {
      paused = false;
      hud.openModal('none');
    },
    getCrashCount: () => crashLog.list().length,
  };
  window.__game = debugHandle;

  const tick = (nowMs: number): void => {
    const rawDt = Math.max(0.0001, (nowMs - lastTimeMs) / 1000);
    lastTimeMs = nowMs;

    const frameMs = rawDt * 1000;
    frameMsSmoothed = frameMsSmoothed * 0.9 + frameMs * 0.1;
    const instantFps = 1 / rawDt;
    fpsSmoothed = fpsSmoothed * 0.9 + Math.min(240, instantFps) * 0.1;

    if (!paused) {
      const intent = mergeControlIntent(kb, hud.getTouchInput());
      // Forward input (+Y) moves North (-Z); right input (+X) moves East (+X)
      clock.advance(rawDt, (dt) => {
        if (physics) {
          const snap = physics.step(intent.moveX, -intent.moveY, intent.sprint, dt);
          playerX = snap.x;
          playerY = snap.y;
          playerZ = snap.z;
          velX = snap.vx;
          velZ = snap.vz;
        } else {
          const speed = intent.sprint ? 10 : 6;
          velX = intent.moveX * speed;
          velZ = -intent.moveY * speed;
          playerX = Math.max(-44, Math.min(44, playerX + velX * dt));
          playerZ = Math.max(-22.5, Math.min(44, playerZ + velZ * dt));
        }
      });

      sceneHost.updateVisuals(playerX, playerY, playerZ, velX, velZ, Math.min(rawDt, 0.05));
    }

    sceneHost.render();

    const tel = sceneHost.getTelemetry();
    debugHandle.paused = paused;
    debugHandle.qualityTier = save.qualityTier;
    debugHandle.locale = save.locale;
    debugHandle.physicsReady = physics !== null;
    debugHandle.player = { x: playerX, y: playerY, z: playerZ };
    debugHandle.perf = {
      fps: fpsSmoothed,
      frameMs: frameMsSmoothed,
      drawCalls: tel.drawCalls,
      triangles: tel.triangles,
      geometries: tel.geometries,
      textures: tel.textures,
      pixelRatio: tel.pixelRatio,
    };

    if (nowMs - lastHudUpdateMs >= 250) {
      lastHudUpdateMs = nowMs;
      hud.updateTelemetry({
        fps: fpsSmoothed,
        drawCalls: tel.drawCalls,
        triangles: tel.triangles,
        physicsReady: physics !== null,
        qualityTier: save.qualityTier,
      });
    }

    window.requestAnimationFrame(tick);
  };

  window.requestAnimationFrame(tick);
}

void bootstrap();
