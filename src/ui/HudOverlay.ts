import type { CrashLogStore } from '../core/crashLog';
import type { TouchStickInput } from '../core/controls';
import {
  formatDiagnosticsJson,
  type DiagnosticsSnapshot,
  type TimeOfDay,
} from '../core/diagnostics';
import { clamp } from '../core/math';
import type { QualityTier } from '../core/quality';
import type { LocaleCode } from '../core/save';
import type {
  DrivingMode,
  DrivetrainType,
  GearDisplay,
  SteeringControlMode,
  TransmissionMode,
} from '../core/vehiclePhysics';
import { REGION_REGISTRY, type RegionId } from '../core/world/regions';
import type { LandmarkPin } from '../core/world/types';
import { getStrings } from '../i18n/strings';
import type { PlayerCameraView } from '../render/RegionWorldScene';

export interface TouchDrivingInput {
  gas: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  /** Proportional -1 (right) .. +1 (left) from CarX slider or Gyro sensor. */
  steerAnalog: number;
  /** True when CarX slider or gyro is actively driving analog steering. */
  useAnalogSteer: boolean;
  handbrake: boolean;
}

export interface HudTelemetryView {
  fps: number;
  drawCalls: number;
  triangles: number;
  loadedTiles: number;
  activeBuildings: number;
  physicsReady: boolean;
  qualityTier: QualityTier;
  regionName: string;
  nearestLandmarkLabel: string;
  sanctuaryLabel: string | null;
  inVehicle: boolean;
  nearVehicle: boolean;
  speedKph: number;
  gear: GearDisplay;
  rpm: number;
  rpmNorm: number;
  turboBoost: number;
  drivetrain: DrivetrainType;
  drivingMode: DrivingMode;
  transmissionMode: TransmissionMode;
  drifting: boolean;
  driftAngleDeg: number;
  driftScore: number;
  /** v0.9.0 — 0..100 body condition; 100 = pristine (row hidden). */
  vehicleCondition: number;
  /** Short spec line for the current car, e.g. "3982 cc V8 TT · 614 hp · 3.4 s". */
  vehicleSpecLine: string;
  /** v0.9.0 — shown while the player is inside a garage's repair radius. */
  nearRepairShop: boolean;
}

export interface HudCallbacks {
  onToggleQuality: () => void;
  onToggleTimeOfDay: () => void;
  onToggleLocale: () => void;
  onTogglePause: () => void;
  onResetPosition: () => void;
  onToggleVehicle: () => void;
  onCallTaxi: () => void;
  onHorn: () => void;
  /** v0.9.0 — repair at the nearest garage (charged from cash). */
  onRepairVehicle: () => void;
  onCycleCamera: () => void;
  onToggleAudio: () => void;
  onCycleDrivingMode: () => void;
  onToggleTransmission: () => void;
  onCycleSteeringMode: () => void;
  onShiftUp: () => void;
  onShiftDown: () => void;
  onSwitchRegion: (regionId: RegionId) => void;
  onTeleportLandmark: (landmark: LandmarkPin) => void;
  getDiagnostics: () => DiagnosticsSnapshot;
}

export type ActiveModal = 'none' | 'pause' | 'settings' | 'about' | 'crashlog';

async function copyTextSafe(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for older Android WebView contexts
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export class HudOverlay {
  private readonly root: HTMLDivElement;
  private readonly minimapWrap: HTMLDivElement;

  // CarX Cockpit Speed / RPM / Gear / Turbo / Mode cluster
  private readonly speedCluster: HTMLDivElement;
  private readonly rpmFillEl: HTMLDivElement;
  private readonly speedValueEl: HTMLSpanElement;
  private readonly speedUnitEl: HTMLSpanElement;
  private readonly speedGearEl: HTMLSpanElement;
  private readonly drivetrainEl: HTMLSpanElement;
  private readonly boostEl: HTMLSpanElement;
  private readonly modeChipBtn: HTMLButtonElement;
  private readonly transChipBtn: HTMLButtonElement;
  private readonly driftBannerEl: HTMLDivElement;

  private readonly touchLayer: HTMLDivElement;
  private readonly touchFootGroup: HTMLDivElement;
  private readonly touchDriveGroup: HTMLDivElement;
  private readonly steerButtonsWrap: HTMLDivElement;
  private readonly steerSliderWrap: HTMLDivElement;
  private readonly steerSliderThumb: HTMLDivElement;
  private readonly steerSliderLabel: HTMLSpanElement;
  private readonly steerGyroPill: HTMLDivElement;
  private readonly manualShiftGroup: HTMLDivElement;

  private readonly modalBackdrop: HTMLDivElement;
  private readonly modalPanel: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;

  private readonly titleEl: HTMLDivElement;
  private readonly subEl: HTMLDivElement;
  private readonly perfRowEl: HTMLDivElement;
  private readonly locationRowEl: HTMLDivElement;
  /** v0.9.0 — crash damage bar; hidden while the car is pristine. */
  private readonly damageRowEl: HTMLDivElement;
  private lastDamageHtml = '';
  private readonly hintEl: HTMLDivElement;

  private readonly cameraBtn: HTMLButtonElement;
  private readonly audioBtn: HTMLButtonElement;
  private readonly qualityBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;
  private readonly aboutBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;

  private readonly sprintBtn: HTMLButtonElement;
  private readonly enterCarBtn: HTMLButtonElement;
  private readonly callTaxiBtn: HTMLButtonElement;
  private readonly exitCarBtn: HTMLButtonElement;
  private readonly gasBtn: HTMLButtonElement;
  private readonly brakeBtn: HTMLButtonElement;
  private readonly driftBtn: HTMLButtonElement;
  private readonly hornBtn: HTMLButtonElement;
  private readonly steerModeQuickBtn: HTMLButtonElement;
  private readonly repairBtn: HTMLButtonElement;
  private readonly shiftDownBtn: HTMLButtonElement;
  private readonly shiftUpBtn: HTMLButtonElement;
  private readonly holdButtons: HTMLButtonElement[] = [];
  private stickKnobEl: HTMLDivElement | null = null;
  private lastLocationHtml = '';

  private locale: LocaleCode;
  private qualityTier: QualityTier;
  private timeOfDay: TimeOfDay;
  private activeRegionId: RegionId;
  private cameraView: PlayerCameraView = 'chase';
  private audioMuted = false;
  private drivingMode: DrivingMode = 'street';
  private transmissionMode: TransmissionMode = 'auto';
  private steeringMode: SteeringControlMode = 'buttons';
  private activeModal: ActiveModal = 'none';
  private inVehicle = false;
  private readonly touchEnabled: boolean;
  private readonly touchState: TouchStickInput = { x: 0, y: 0, sprint: false };
  private readonly driveTouch: TouchDrivingInput = {
    gas: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    steerAnalog: 0,
    useAnalogSteer: false,
    handbrake: false,
  };
  private gyroSteerSmoothed = 0;
  private readonly callbacks: HudCallbacks;
  private readonly crashLog: CrashLogStore;
  private landmarks: LandmarkPin[] = [];
  private toastTimerId: number | null = null;

  constructor(
    container: HTMLElement,
    initialLocale: LocaleCode,
    initialQuality: QualityTier,
    initialTimeOfDay: TimeOfDay,
    initialRegionId: RegionId,
    touchEnabled: boolean,
    crashLog: CrashLogStore,
    callbacks: HudCallbacks,
  ) {
    this.locale = initialLocale;
    this.qualityTier = initialQuality;
    this.timeOfDay = initialTimeOfDay;
    this.activeRegionId = initialRegionId;
    this.touchEnabled = touchEnabled;
    this.crashLog = crashLog;
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.className = 'hud-root';

    const topRow = document.createElement('div');
    topRow.className = 'hud-top';

    const brandCard = document.createElement('div');
    brandCard.className = 'hud-card';

    const brandRow = document.createElement('div');
    brandRow.className = 'brand-row';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'brand-title';

    this.subEl = document.createElement('div');
    this.subEl.className = 'brand-sub';

    brandRow.append(this.titleEl, this.subEl);

    this.perfRowEl = document.createElement('div');
    this.perfRowEl.className = 'perf-row';
    this.perfRowEl.dataset.testid = 'perf-telemetry';

    this.locationRowEl = document.createElement('div');
    this.locationRowEl.className = 'location-row';
    this.locationRowEl.dataset.testid = 'location-telemetry';

    this.damageRowEl = document.createElement('div');
    this.damageRowEl.className = 'damage-row';
    this.damageRowEl.dataset.testid = 'vehicle-damage';
    this.damageRowEl.style.display = 'none';

    brandCard.append(brandRow, this.perfRowEl, this.damageRowEl, this.locationRowEl);

    const actions = document.createElement('div');
    actions.className = 'hud-actions';

    this.cameraBtn = this.makeButton('btn-camera', () => this.callbacks.onCycleCamera());
    this.audioBtn = this.makeButton('btn-audio', () => this.callbacks.onToggleAudio());
    this.qualityBtn = this.makeButton('btn-quality', () => this.callbacks.onToggleQuality());
    this.settingsBtn = this.makeButton('btn-settings', () => this.openModal('settings'));
    this.aboutBtn = this.makeButton('btn-about', () => this.openModal('about'));
    this.pauseBtn = this.makeButton('btn-pause', () => this.callbacks.onTogglePause());

    actions.append(
      this.cameraBtn,
      this.audioBtn,
      this.qualityBtn,
      this.settingsBtn,
      this.aboutBtn,
      this.pauseBtn,
    );
    topRow.append(brandCard, actions);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'hud-bottom';

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'controls-hint';
    bottomRow.append(this.hintEl);

    this.root.append(topRow, bottomRow);

    // Minimap container
    this.minimapWrap = document.createElement('div');
    this.minimapWrap.className = touchEnabled ? 'minimap-wrap touch-pos' : 'minimap-wrap';

    // CarX Street Cockpit Gauge Cluster (RPM bar + Speed + Gear + Boost + Mode/Trans chips)
    this.speedCluster = document.createElement('div');
    this.speedCluster.className = 'speed-cluster';
    this.speedCluster.dataset.testid = 'speedometer';

    const rpmTrack = document.createElement('div');
    rpmTrack.className = 'rpm-bar-track';
    this.rpmFillEl = document.createElement('div');
    this.rpmFillEl.className = 'rpm-bar-fill';
    rpmTrack.append(this.rpmFillEl);

    const speedMainRow = document.createElement('div');
    speedMainRow.className = 'speed-main-row';

    this.speedValueEl = document.createElement('span');
    this.speedValueEl.className = 'speed-value';
    this.speedValueEl.textContent = '0';

    this.speedUnitEl = document.createElement('span');
    this.speedUnitEl.className = 'speed-unit';

    this.speedGearEl = document.createElement('span');
    this.speedGearEl.className = 'speed-gear';
    this.speedGearEl.dataset.testid = 'hud-gear';
    this.speedGearEl.textContent = 'N';

    speedMainRow.append(this.speedValueEl, this.speedUnitEl, this.speedGearEl);

    const speedMetaRow = document.createElement('div');
    speedMetaRow.className = 'speed-meta-row';

    this.drivetrainEl = document.createElement('span');
    this.drivetrainEl.className = 'drive-badge';
    this.drivetrainEl.textContent = 'RWD';

    this.boostEl = document.createElement('span');
    this.boostEl.className = 'boost-badge';
    this.boostEl.textContent = '0.0 BAR';

    this.modeChipBtn = document.createElement('button');
    this.modeChipBtn.type = 'button';
    this.modeChipBtn.className = 'cockpit-chip';
    this.modeChipBtn.dataset.testid = 'btn-driving-mode';
    this.modeChipBtn.addEventListener('click', () => this.callbacks.onCycleDrivingMode());

    this.transChipBtn = document.createElement('button');
    this.transChipBtn.type = 'button';
    this.transChipBtn.className = 'cockpit-chip';
    this.transChipBtn.dataset.testid = 'btn-transmission';
    this.transChipBtn.addEventListener('click', () => this.callbacks.onToggleTransmission());

    speedMetaRow.append(this.drivetrainEl, this.boostEl, this.modeChipBtn, this.transChipBtn);
    this.speedCluster.append(rpmTrack, speedMainRow, speedMetaRow);

    // Floating Drift Angle + Combo Score Banner (top-center)
    this.driftBannerEl = document.createElement('div');
    this.driftBannerEl.className = 'drift-banner';
    this.driftBannerEl.dataset.testid = 'drift-banner';

    // Touch controls layer (on-foot group + driving group)
    this.touchLayer = document.createElement('div');
    this.touchLayer.className = touchEnabled ? 'touch-layer visible' : 'touch-layer';

    // On-foot group
    this.touchFootGroup = document.createElement('div');
    this.touchFootGroup.className = 'touch-foot-group';

    const stickZone = document.createElement('div');
    stickZone.className = 'stick-zone';
    stickZone.dataset.testid = 'touch-stick';
    const stickKnob = document.createElement('div');
    stickKnob.className = 'stick-knob';
    stickZone.append(stickKnob);
    this.stickKnobEl = stickKnob;
    this.wireStick(stickZone, stickKnob);

    const footRight = document.createElement('div');
    footRight.className = 'touch-right-pad';

    this.callTaxiBtn = document.createElement('button');
    this.callTaxiBtn.type = 'button';
    this.callTaxiBtn.className = 'touch-pad-btn touch-btn-small';
    this.callTaxiBtn.dataset.testid = 'touch-call-taxi';
    this.callTaxiBtn.addEventListener('click', () => this.callbacks.onCallTaxi());

    this.enterCarBtn = document.createElement('button');
    this.enterCarBtn.type = 'button';
    this.enterCarBtn.className = 'touch-pad-btn action';
    this.enterCarBtn.dataset.testid = 'touch-enter-car';
    this.enterCarBtn.addEventListener('click', () => this.callbacks.onToggleVehicle());

    this.sprintBtn = document.createElement('button');
    this.sprintBtn.type = 'button';
    this.sprintBtn.className = 'touch-pad-btn primary';
    this.sprintBtn.dataset.testid = 'touch-sprint';
    this.wireHoldButton(this.sprintBtn, (v) => {
      this.touchState.sprint = v;
    });

    footRight.append(this.callTaxiBtn, this.enterCarBtn, this.sprintBtn);
    this.touchFootGroup.append(stickZone, footRight);

    // Driving group
    this.touchDriveGroup = document.createElement('div');
    this.touchDriveGroup.className = 'touch-drive-group touch-hidden';

    const auxLeft = document.createElement('div');
    auxLeft.className = 'touch-aux-left';
    this.hornBtn = document.createElement('button');
    this.hornBtn.type = 'button';
    this.hornBtn.className = 'touch-pad-btn touch-btn-small';
    this.hornBtn.dataset.testid = 'touch-horn';
    this.hornBtn.textContent = '🔔';
    this.hornBtn.addEventListener('click', () => this.callbacks.onHorn());

    this.steerModeQuickBtn = document.createElement('button');
    this.steerModeQuickBtn.type = 'button';
    this.steerModeQuickBtn.className = 'touch-pad-btn touch-btn-small';
    this.steerModeQuickBtn.dataset.testid = 'touch-steer-mode';
    this.steerModeQuickBtn.textContent = '🎛';
    this.steerModeQuickBtn.addEventListener('click', () => this.callbacks.onCycleSteeringMode());

    // v0.9.0 (D4) — appears only when a garage is in range.
    this.repairBtn = document.createElement('button');
    this.repairBtn.type = 'button';
    this.repairBtn.className = 'touch-pad-btn touch-btn-small repair-hidden';
    this.repairBtn.dataset.testid = 'touch-repair';
    this.repairBtn.textContent = '🔧';
    this.repairBtn.addEventListener('click', () => this.callbacks.onRepairVehicle());

    auxLeft.append(this.hornBtn, this.steerModeQuickBtn, this.repairBtn);

    // Steering Mode 1: Crisp Left / Right Buttons
    this.steerButtonsWrap = document.createElement('div');
    this.steerButtonsWrap.className = 'touch-left-steer';
    const steerLeftBtn = document.createElement('button');
    steerLeftBtn.type = 'button';
    steerLeftBtn.className = 'touch-pad-btn';
    steerLeftBtn.textContent = '◀';
    steerLeftBtn.dataset.testid = 'touch-steer-left';
    this.wireHoldButton(steerLeftBtn, (v) => {
      this.driveTouch.steerLeft = v;
    });

    const steerRightBtn = document.createElement('button');
    steerRightBtn.type = 'button';
    steerRightBtn.className = 'touch-pad-btn';
    steerRightBtn.textContent = '▶';
    steerRightBtn.dataset.testid = 'touch-steer-right';
    this.wireHoldButton(steerRightBtn, (v) => {
      this.driveTouch.steerRight = v;
    });
    this.steerButtonsWrap.append(steerLeftBtn, steerRightBtn);

    // Steering Mode 2: CarX Street Precision Analog Touch Slider
    this.steerSliderWrap = document.createElement('div');
    this.steerSliderWrap.className = 'touch-steer-slider touch-hidden';
    this.steerSliderWrap.dataset.testid = 'touch-steer-slider';
    this.steerSliderLabel = document.createElement('span');
    this.steerSliderLabel.className = 'steer-slider-label';
    this.steerSliderThumb = document.createElement('div');
    this.steerSliderThumb.className = 'steer-slider-thumb';
    this.steerSliderWrap.append(this.steerSliderLabel, this.steerSliderThumb);
    this.wireSteerSlider(this.steerSliderWrap, this.steerSliderThumb);

    // Steering Mode 3: Gyro / Tilt Steering indicator
    this.steerGyroPill = document.createElement('div');
    this.steerGyroPill.className = 'touch-gyro-pill touch-hidden';
    this.steerGyroPill.dataset.testid = 'touch-steer-gyro';

    // Aux Right: Manual Shift V- / V+ (shown only in manual mode) + Handbrake
    const auxRight = document.createElement('div');
    auxRight.className = 'touch-aux-right';

    this.manualShiftGroup = document.createElement('div');
    this.manualShiftGroup.className = 'manual-shift-group touch-hidden';

    this.shiftDownBtn = document.createElement('button');
    this.shiftDownBtn.type = 'button';
    this.shiftDownBtn.className = 'touch-pad-btn touch-btn-small';
    this.shiftDownBtn.dataset.testid = 'touch-shift-down';
    this.shiftDownBtn.addEventListener('click', () => this.callbacks.onShiftDown());

    this.shiftUpBtn = document.createElement('button');
    this.shiftUpBtn.type = 'button';
    this.shiftUpBtn.className = 'touch-pad-btn touch-btn-small primary';
    this.shiftUpBtn.dataset.testid = 'touch-shift-up';
    this.shiftUpBtn.addEventListener('click', () => this.callbacks.onShiftUp());

    this.manualShiftGroup.append(this.shiftDownBtn, this.shiftUpBtn);

    this.driftBtn = document.createElement('button');
    this.driftBtn.type = 'button';
    this.driftBtn.className = 'touch-pad-btn touch-btn-small';
    this.driftBtn.dataset.testid = 'touch-drift';
    this.wireHoldButton(this.driftBtn, (v) => {
      this.driveTouch.handbrake = v;
    });
    auxRight.append(this.manualShiftGroup, this.driftBtn);

    const driveRight = document.createElement('div');
    driveRight.className = 'touch-right-pad';

    this.exitCarBtn = document.createElement('button');
    this.exitCarBtn.type = 'button';
    this.exitCarBtn.className = 'touch-pad-btn action';
    this.exitCarBtn.dataset.testid = 'touch-exit-car';
    this.exitCarBtn.addEventListener('click', () => this.callbacks.onToggleVehicle());

    this.brakeBtn = document.createElement('button');
    this.brakeBtn.type = 'button';
    this.brakeBtn.className = 'touch-pad-btn danger';
    this.brakeBtn.dataset.testid = 'touch-brake';
    this.wireHoldButton(this.brakeBtn, (v) => {
      this.driveTouch.brake = v;
    });

    this.gasBtn = document.createElement('button');
    this.gasBtn.type = 'button';
    this.gasBtn.className = 'touch-pad-btn primary';
    this.gasBtn.dataset.testid = 'touch-gas';
    this.wireHoldButton(this.gasBtn, (v) => {
      this.driveTouch.gas = v;
    });

    driveRight.append(this.exitCarBtn, this.brakeBtn, this.gasBtn);
    this.touchDriveGroup.append(
      auxLeft,
      this.steerButtonsWrap,
      this.steerSliderWrap,
      this.steerGyroPill,
      auxRight,
      driveRight,
    );

    this.touchLayer.append(this.touchFootGroup, this.touchDriveGroup);

    this.modalBackdrop = document.createElement('div');
    this.modalBackdrop.className = 'modal-backdrop';
    this.modalPanel = document.createElement('div');
    this.modalPanel.className = 'modal-panel';
    this.modalBackdrop.append(this.modalPanel);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast-banner';

    container.append(
      this.root,
      this.minimapWrap,
      this.speedCluster,
      this.driftBannerEl,
      this.touchLayer,
      this.modalBackdrop,
      this.toastEl,
    );

    this.installGyroListener();
    this.applyLabels();
    this.applySteeringVisibility();
  }

  private installGyroListener(): void {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    window.addEventListener(
      'deviceorientation',
      (ev: DeviceOrientationEvent) => {
        if (this.steeringMode !== 'gyro' || !this.inVehicle) return;
        const beta = ev.beta;
        if (beta === null || !Number.isFinite(beta)) return;
        // Landscape sensor orientation: left-side-up (90°) vs right-side-up (270°/-90°)
        const screenAngle =
          (window.screen?.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 90);
        const sign = screenAngle === 270 || screenAngle === -90 ? -1 : 1;
        // Tilt phone left -> negative beta in landscape 90° -> steer left (+1)
        const rawTilt = clamp((-beta * sign) / 32, -1, 1);
        const deadzoned = Math.abs(rawTilt) < 0.08 ? 0 : (rawTilt - Math.sign(rawTilt) * 0.08) / 0.92;
        this.gyroSteerSmoothed = this.gyroSteerSmoothed * 0.72 + deadzoned * 0.28;
        this.driveTouch.steerAnalog = clamp(this.gyroSteerSmoothed, -1, 1);
        this.driveTouch.useAnalogSteer = true;
      },
      { passive: true },
    );
  }

  private wireSteerSlider(track: HTMLDivElement, thumb: HTMLDivElement): void {
    let activePointerId: number | null = null;
    const updateFromClientX = (clientX: number): void => {
      const rect = track.getBoundingClientRect();
      const half = Math.max(24, rect.width * 0.5 - 24);
      const cx = rect.left + rect.width * 0.5;
      const dx = clamp(clientX - cx, -half, half);
      const norm = dx / half; // -1 left .. +1 right
      thumb.style.transform = `translateX(${dx}px)`;
      // Engine convention: +1 = left, -1 = right
      this.driveTouch.steerAnalog = -norm;
      this.driveTouch.useAnalogSteer = true;
    };
    const reset = (): void => {
      activePointerId = null;
      thumb.style.transform = 'translateX(0px)';
      this.driveTouch.steerAnalog = 0;
      this.driveTouch.useAnalogSteer = false;
    };
    track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      activePointerId = e.pointerId;
      track.setPointerCapture(e.pointerId);
      updateFromClientX(e.clientX);
    });
    track.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activePointerId) return;
      updateFromClientX(e.clientX);
    });
    track.addEventListener('pointerup', (e) => {
      if (e.pointerId === activePointerId) reset();
    });
    track.addEventListener('pointercancel', (e) => {
      if (e.pointerId === activePointerId) reset();
    });
  }

  private applySteeringVisibility(): void {
    this.steerButtonsWrap.classList.toggle('touch-hidden', this.steeringMode !== 'buttons');
    this.steerSliderWrap.classList.toggle('touch-hidden', this.steeringMode !== 'slider');
    this.steerGyroPill.classList.toggle('touch-hidden', this.steeringMode !== 'gyro');
    this.manualShiftGroup.classList.toggle('touch-hidden', this.transmissionMode !== 'manual');
    if (this.steeringMode !== 'gyro') {
      this.gyroSteerSmoothed = 0;
      if (this.steeringMode === 'buttons') {
        this.driveTouch.steerAnalog = 0;
        this.driveTouch.useAnalogSteer = false;
      }
    }
  }

  mountMinimap(canvas: HTMLCanvasElement): void {
    this.minimapWrap.innerHTML = '';
    this.minimapWrap.append(canvas);
  }

  setLandmarks(landmarks: LandmarkPin[]): void {
    this.landmarks = landmarks;
  }

  /** Clears every active touch hold & stick offset (prevents stuck gas/steer on mode/modal change). */
  resetTouchInputs(): void {
    this.touchState.x = 0;
    this.touchState.y = 0;
    this.touchState.sprint = false;
    this.driveTouch.gas = false;
    this.driveTouch.brake = false;
    this.driveTouch.steerLeft = false;
    this.driveTouch.steerRight = false;
    this.driveTouch.steerAnalog = 0;
    this.driveTouch.useAnalogSteer = false;
    this.driveTouch.handbrake = false;
    this.steerSliderThumb.style.transform = 'translateX(0px)';
    if (this.stickKnobEl) {
      this.stickKnobEl.style.transform = 'translate(0px, 0px)';
    }
    for (const btn of this.holdButtons) {
      btn.classList.remove('pressed');
    }
  }

  private makeButton(testId: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hud-btn';
    btn.dataset.testid = testId;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private wireHoldButton(btn: HTMLButtonElement, onChange: (pressed: boolean) => void): void {
    this.holdButtons.push(btn);
    const setPressed = (v: boolean): void => {
      onChange(v);
      btn.classList.toggle('pressed', v);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      setPressed(true);
    });
    btn.addEventListener('pointerup', () => setPressed(false));
    btn.addEventListener('pointercancel', () => setPressed(false));
    btn.addEventListener('lostpointercapture', () => setPressed(false));
  }

  private wireStick(zone: HTMLDivElement, knob: HTMLDivElement): void {
    let activePointerId: number | null = null;
    const maxRadius = 36;

    const updateFromClient = (clientX: number, clientY: number): void => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) {
        dx = (dx / dist) * maxRadius;
        dy = (dy / dist) * maxRadius;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touchState.x = dx / maxRadius;
      this.touchState.y = -dy / maxRadius;
    };

    const reset = (): void => {
      activePointerId = null;
      knob.style.transform = 'translate(0px, 0px)';
      this.touchState.x = 0;
      this.touchState.y = 0;
    };

    zone.addEventListener('pointerdown', (e) => {
      activePointerId = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      updateFromClient(e.clientX, e.clientY);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activePointerId) return;
      updateFromClient(e.clientX, e.clientY);
    });
    zone.addEventListener('pointerup', (e) => {
      if (e.pointerId === activePointerId) reset();
    });
    zone.addEventListener('pointercancel', (e) => {
      if (e.pointerId === activePointerId) reset();
    });
  }

  getTouchInput(): TouchStickInput {
    return this.touchState;
  }

  getTouchDrivingInput(): TouchDrivingInput {
    return this.driveTouch;
  }

  setState(
    locale: LocaleCode,
    qualityTier: QualityTier,
    timeOfDay: TimeOfDay,
    regionId: RegionId,
    cameraView = this.cameraView,
    audioMuted = this.audioMuted,
    drivingMode = this.drivingMode,
    transmissionMode = this.transmissionMode,
    steeringMode = this.steeringMode,
  ): void {
    this.locale = locale;
    this.qualityTier = qualityTier;
    this.timeOfDay = timeOfDay;
    this.activeRegionId = regionId;
    this.cameraView = cameraView;
    this.audioMuted = audioMuted;
    this.drivingMode = drivingMode;
    this.transmissionMode = transmissionMode;
    this.steeringMode = steeringMode;
    this.applyLabels();
    this.applySteeringVisibility();
    if (this.activeModal !== 'none') {
      this.renderModal();
    }
  }

  private getQualityLabel(t: ReturnType<typeof getStrings>): string {
    if (this.qualityTier === 'low') return t.qualityLow;
    if (this.qualityTier === 'medium') return t.qualityMedium;
    if (this.qualityTier === 'ultra') return t.qualityUltra;
    return t.qualityHigh;
  }

  private getTimeLabel(t: ReturnType<typeof getStrings>): string {
    if (this.timeOfDay === 'sunset') return `${t.timeSunset} 🌇`;
    if (this.timeOfDay === 'night') return `${t.timeNight} 🌙`;
    return `${t.timeDay} ☀`;
  }

  private getDrivingModeLabel(t: ReturnType<typeof getStrings>): string {
    if (this.drivingMode === 'drift') return t.modeDrift;
    if (this.drivingMode === 'sim') return t.modeSim;
    return t.modeStreet;
  }

  private getSteeringLabel(t: ReturnType<typeof getStrings>): string {
    if (this.steeringMode === 'slider') return t.steerSlider;
    if (this.steeringMode === 'gyro') return t.steerGyro;
    return t.steerButtons;
  }

  private applyLabels(): void {
    const t = getStrings(this.locale);
    this.titleEl.textContent = t.appTitle;
    this.subEl.textContent = t.milestoneTag;
    this.cameraBtn.textContent = '📷';
    this.cameraBtn.title = t.cameraButtonTitle;
    this.audioBtn.textContent = this.audioMuted ? '🔇' : '🔊';
    this.audioBtn.title = this.audioMuted ? t.soundOff : t.soundOn;
    this.audioBtn.classList.toggle('active', this.audioMuted);
    this.qualityBtn.textContent = this.getQualityLabel(t);
    this.qualityBtn.classList.toggle('active', this.qualityTier === 'ultra' || this.qualityTier === 'low');
    this.settingsBtn.textContent = t.settingsButton;
    this.aboutBtn.textContent = t.aboutButton;
    this.pauseBtn.textContent = t.pauseButton;

    this.speedUnitEl.textContent = t.speedUnit;
    this.modeChipBtn.textContent = this.getDrivingModeLabel(t);
    this.modeChipBtn.className = `cockpit-chip mode-${this.drivingMode}`;
    this.transChipBtn.textContent = this.transmissionMode === 'manual' ? t.transManual : t.transAuto;
    this.transChipBtn.className = `cockpit-chip ${this.transmissionMode === 'manual' ? 'mode-drift' : ''}`;

    this.sprintBtn.textContent = t.sprintButton;
    this.enterCarBtn.textContent = t.enterCarButton;
    this.callTaxiBtn.textContent = '🚗';
    this.callTaxiBtn.title = t.callTaxiButton;
    this.exitCarBtn.textContent = t.exitCarButton;
    this.gasBtn.textContent = t.gasButton;
    this.brakeBtn.textContent = t.brakeButton;
    this.driftBtn.textContent = t.driftButton;
    this.hornBtn.title = t.hornButton;
    this.steerModeQuickBtn.title = `${t.steeringModeToastPrefix}: ${this.getSteeringLabel(t)}`;
    this.steerSliderLabel.textContent = t.steerSliderHint;
    this.steerGyroPill.textContent = t.gyroHint;
    this.shiftUpBtn.textContent = t.shiftUpButton;
    this.shiftDownBtn.textContent = t.shiftDownButton;
    this.updateHintLabel();
  }

  private updateHintLabel(): void {
    const t = getStrings(this.locale);
    if (this.inVehicle) {
      this.hintEl.textContent = this.touchEnabled
        ? t.controlsHintDriveTouch
        : t.controlsHintDriveDesktop;
    } else {
      this.hintEl.textContent = this.touchEnabled
        ? t.controlsHintFootTouch
        : t.controlsHintFootDesktop;
    }
  }

  updateTelemetry(view: HudTelemetryView): void {
    const t = getStrings(this.locale);
    if (this.inVehicle !== view.inVehicle) {
      this.inVehicle = view.inVehicle;
      this.resetTouchInputs();
      this.touchFootGroup.classList.toggle('touch-hidden', this.inVehicle);
      this.touchDriveGroup.classList.toggle('touch-hidden', !this.inVehicle);
      this.speedCluster.classList.toggle('visible', this.inVehicle);
      if (!this.inVehicle) {
        this.driftBannerEl.classList.remove('visible');
      }
      this.updateHintLabel();
    }
    this.enterCarBtn.classList.toggle('touch-hidden', !view.nearVehicle);
    this.repairBtn.classList.toggle('repair-hidden', !view.nearRepairShop || view.vehicleCondition >= 100);
    this.callTaxiBtn.classList.toggle('touch-hidden', view.nearVehicle);

    if (view.inVehicle) {
      this.speedValueEl.textContent = String(view.speedKph);
      this.speedGearEl.textContent = view.gear;
      const redline = view.rpmNorm >= 0.89;
      this.speedGearEl.classList.toggle('redline', redline);
      this.speedGearEl.classList.toggle('drift', view.drifting && !redline);

      const rpmPct = Math.round(clamp(view.rpmNorm, 0.04, 1) * 100);
      this.rpmFillEl.style.width = `${rpmPct}%`;
      this.rpmFillEl.classList.toggle('redline', redline);

      this.drivetrainEl.textContent = view.drivetrain;
      const boostBar = Math.max(0, view.turboBoost * 1.6);
      this.boostEl.textContent = `${boostBar.toFixed(1)} ${t.turboLabel}`;
      this.boostEl.classList.toggle('active', boostBar > 0.25);

      if (view.drifting || view.driftScore >= 40) {
        this.driftBannerEl.classList.add('visible');
        this.driftBannerEl.textContent = `${t.driftScoreLabel} · ${view.driftAngleDeg}° · ${Math.round(view.driftScore).toLocaleString()}`;
      } else {
        this.driftBannerEl.classList.remove('visible');
      }
    }

    // v0.9.0 — the FPS / draw-call / tile / building counters are developer telemetry,
    // not gameplay information. They made the HUD read like a web dashboard on a phone
    // ("site gibi görünüyor"), so they now live only in the diagnostics modal.
    if (this.perfRowEl.childElementCount > 0) {
      this.perfRowEl.replaceChildren();
      this.perfRowEl.classList.add('hidden-telemetry');
    }

    const sanctuaryHtml = view.sanctuaryLabel
      ? `<span class="sanctuary-pill" data-testid="sanctuary-banner">${t.sanctuaryBanner} · ${view.sanctuaryLabel}</span>`
      : '';
    const vehiclePromptHtml =
      !view.inVehicle && view.nearVehicle
        ? `<span class="prompt-pill" data-testid="vehicle-prompt">${t.nearVehiclePrompt}</span>`
        : '';

    // Location line keeps the player-oriented district + landmark context only.
    const locationHtml =
      `<span class="location-pill">${view.regionName} · ${view.nearestLandmarkLabel}</span>` +
      sanctuaryHtml +
      vehiclePromptHtml;
    // v0.9.0 — a compact body-condition bar replaces the developer counters:
    // it only appears once the car actually takes damage.
    const condition = Math.round(view.vehicleCondition);
    if (condition >= 100) {
      if (this.damageRowEl.style.display !== 'none') {
        this.damageRowEl.style.display = 'none';
        this.lastDamageHtml = '';
      }
    } else {
      const damageHtml =
        `<span class="damage-label" data-testid="vehicle-condition">` +
        `${t.damageLabel} %${100 - condition}</span>` +
        `<span class="damage-track"><span class="damage-fill" style="width:${condition}%"></span></span>` +
        (view.vehicleSpecLine ? `<span class="spec-pill">${view.vehicleSpecLine}</span>` : '');
      if (damageHtml !== this.lastDamageHtml) {
        this.lastDamageHtml = damageHtml;
        this.damageRowEl.innerHTML = damageHtml;
        this.damageRowEl.style.display = 'flex';
      }
    }

    if (locationHtml !== this.lastLocationHtml) {
      this.lastLocationHtml = locationHtml;
      this.locationRowEl.innerHTML = locationHtml;
    }
  }

  openModal(modal: ActiveModal): void {
    this.activeModal = modal;
    if (modal !== 'none') {
      this.resetTouchInputs();
    }
    this.modalBackdrop.classList.toggle('open', modal !== 'none');
    this.renderModal();
  }

  getActiveModal(): ActiveModal {
    return this.activeModal;
  }

  showToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    if (this.toastTimerId !== null) window.clearTimeout(this.toastTimerId);
    this.toastTimerId = window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
      this.toastTimerId = null;
    }, 3000);
  }

  private renderModal(): void {
    const t = getStrings(this.locale);
    this.modalPanel.innerHTML = '';
    if (this.activeModal === 'none') return;

    if (this.activeModal === 'pause') {
      const h2 = document.createElement('h2');
      h2.textContent = t.pausedTitle;

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const resumeBtn = this.makeButton('modal-resume', () => this.callbacks.onTogglePause());
      resumeBtn.classList.add('active');
      resumeBtn.textContent = t.resumeButton;

      const resetBtn = this.makeButton('modal-reset-pos', () => {
        this.callbacks.onResetPosition();
        this.callbacks.onTogglePause();
      });
      resetBtn.textContent = t.resetPosButton;

      const settingsBtn = this.makeButton('modal-settings', () => this.openModal('settings'));
      settingsBtn.textContent = t.settingsButton;

      const aboutBtn = this.makeButton('modal-about', () => this.openModal('about'));
      aboutBtn.textContent = t.aboutButton;

      const crashBtn = this.makeButton('modal-crashlog', () => this.openModal('crashlog'));
      crashBtn.textContent = t.viewCrashLogButton;

      actions.append(resumeBtn, resetBtn, settingsBtn, aboutBtn, crashBtn);
      this.modalPanel.append(h2, actions);

      const regTitle = document.createElement('div');
      regTitle.className = 'fast-travel-title';
      regTitle.textContent = t.regionSwitchHeading;

      const regRow = document.createElement('div');
      regRow.className = 'modal-actions';
      for (const reg of REGION_REGISTRY) {
        const btn = this.makeButton(`region-${reg.id}`, () => {
          this.callbacks.onSwitchRegion(reg.id);
          this.callbacks.onTogglePause();
        });
        btn.textContent = this.locale === 'tr' ? reg.nameTr : reg.nameEn;
        if (reg.id === this.activeRegionId) btn.classList.add('active');
        regRow.append(btn);
      }
      this.modalPanel.append(regTitle, regRow);

      if (this.landmarks.length > 0) {
        const ftTitle = document.createElement('div');
        ftTitle.className = 'fast-travel-title';
        ftTitle.textContent = t.fastTravelHeading;

        const ftRow = document.createElement('div');
        ftRow.className = 'modal-actions';
        for (const lm of this.landmarks.slice(0, 10)) {
          const btn = this.makeButton(`tp-${lm.id}`, () => {
            this.callbacks.onTeleportLandmark(lm);
            this.callbacks.onTogglePause();
          });
          btn.textContent = this.locale === 'tr' ? lm.nameTr : lm.nameEn;
          ftRow.append(btn);
        }
        this.modalPanel.append(ftTitle, ftRow);
      }
      return;
    }

    if (this.activeModal === 'settings') {
      const snap = this.callbacks.getDiagnostics();
      const jsonText = formatDiagnosticsJson(snap);

      const header = document.createElement('div');
      header.className = 'modal-header-row';

      const h2 = document.createElement('h2');
      h2.textContent = t.settingsTitle;

      const topActions = document.createElement('div');
      topActions.className = 'modal-actions modal-actions-tight';

      const copyBtn = this.makeButton('btn-copy-diagnostics', () => {
        void copyTextSafe(jsonText).then((ok) => {
          copyBtn.textContent = ok ? t.reportCopied : t.copyReportButton;
          this.showToast(t.reportCopied);
        });
      });
      copyBtn.classList.add('active');
      copyBtn.textContent = t.copyReportButton;

      const closeBtn = this.makeButton('modal-close', () => this.openModal('none'));
      closeBtn.textContent = t.closeButton;

      topActions.append(copyBtn, closeBtn);
      header.append(h2, topActions);

      const ctrlRow = document.createElement('div');
      ctrlRow.className = 'modal-actions modal-actions-tight';

      const driveModeBtn = this.makeButton('settings-driving-mode', () =>
        this.callbacks.onCycleDrivingMode(),
      );
      driveModeBtn.textContent = `🏎 ${this.getDrivingModeLabel(t)}`;
      driveModeBtn.classList.add('active');

      const transBtn = this.makeButton('settings-transmission', () =>
        this.callbacks.onToggleTransmission(),
      );
      transBtn.textContent = `⚙ ${this.transmissionMode === 'manual' ? t.transManual : t.transAuto}`;
      if (this.transmissionMode === 'manual') transBtn.classList.add('active');

      const steerBtn = this.makeButton('settings-steering', () =>
        this.callbacks.onCycleSteeringMode(),
      );
      steerBtn.textContent = `🎛 ${this.getSteeringLabel(t)}`;

      const qualBtn = this.makeButton('settings-quality', () => this.callbacks.onToggleQuality());
      qualBtn.textContent = `${this.getQualityLabel(t)} ✓`;
      qualBtn.classList.add('active');

      const timeBtn = this.makeButton('settings-time', () => this.callbacks.onToggleTimeOfDay());
      timeBtn.textContent = this.getTimeLabel(t);
      if (this.timeOfDay !== 'day') timeBtn.classList.add('active');

      const soundBtn = this.makeButton('settings-audio', () => this.callbacks.onToggleAudio());
      soundBtn.textContent = this.audioMuted ? `🔇 ${t.soundOff}` : `🔊 ${t.soundOn}`;
      if (this.audioMuted) soundBtn.classList.add('active');

      const camLabel =
        this.cameraView === 'wide'
          ? t.cameraWide
          : this.cameraView === 'hood'
            ? t.cameraHood
            : this.cameraView === 'bumper'
              ? t.cameraBumper
              : this.cameraView === 'topdown'
                ? t.cameraTopdown
                : t.cameraChase;
      const camBtn = this.makeButton('settings-camera', () => this.callbacks.onCycleCamera());
      camBtn.textContent = `📷 ${camLabel}`;

      const langBtn = this.makeButton('settings-lang', () => this.callbacks.onToggleLocale());
      langBtn.textContent = t.langButton;

      ctrlRow.append(
        driveModeBtn,
        transBtn,
        steerBtn,
        qualBtn,
        timeBtn,
        soundBtn,
        camBtn,
        langBtn,
      );

      const diagTitle = document.createElement('div');
      diagTitle.className = 'fast-travel-title';
      diagTitle.textContent = t.diagnosticsHeading;

      const grid = document.createElement('div');
      grid.className = 'diag-grid';
      grid.dataset.testid = 'diagnostics-grid';

      const activeReg = REGION_REGISTRY.find((r) => r.id === snap.regionId);
      const regionLabel = activeReg
        ? this.locale === 'tr'
          ? activeReg.nameTr
          : activeReg.nameEn
        : snap.regionId;

      const isTr = this.locale === 'tr';
      const entries: [string, string][] = [
        [isTr ? 'FPS / KARE' : 'FPS / FRAME', `${snap.fps} FPS (${snap.frameMs} ms)`],
        [isTr ? 'ÇİZİM / ÜÇGEN' : 'DRAW / TRIS', `${snap.drawCalls} / ${snap.triangles}`],
        [isTr ? 'KARO / BİNA' : 'TILES / BLDGS', `${snap.activeTiles} / ${snap.activeBuildings}`],
        [
          isTr ? 'JS BELLEK' : 'JS HEAP',
          snap.jsHeapUsedMb !== null
            ? `${snap.jsHeapUsedMb} / ${snap.jsHeapTotalMb ?? '?'} MB`
            : 'N/A',
        ],
        [isTr ? 'GPU / İŞLEYİCİ' : 'GPU / RENDERER', snap.gpuRenderer],
        [
          isTr ? 'SES / DONANIM' : 'AUDIO / NATIVE',
          `${snap.audioBackend ?? 'WebAudio'} · ${snap.nativePerfProfile ?? 'Web'}`,
        ],
        [
          isTr ? 'SÜRÜŞ / VİTES' : 'DRIVING / GEAR',
          `${snap.drivingMode ?? 'street'} · ${snap.transmissionMode ?? 'auto'}`,
        ],
        [
          isTr ? 'MOD / KALİTE' : 'MODE / QUALITY',
          `${snap.qualityTier} · ${snap.timeOfDay} · ${regionLabel}`,
        ],
      ];
      for (const [k, v] of entries) {
        const item = document.createElement('div');
        item.className = 'diag-item';
        const st = document.createElement('strong');
        st.textContent = k;
        const val = document.createElement('span');
        val.textContent = v;
        item.append(st, val);
        grid.append(item);
      }

      const pre = document.createElement('pre');
      pre.className = 'crash-pre';
      pre.dataset.testid = 'diagnostics-json';
      pre.textContent = jsonText;

      this.modalPanel.append(header, ctrlRow, diagTitle, grid, pre);
      return;
    }

    if (this.activeModal === 'about') {
      const h2 = document.createElement('h2');
      h2.textContent = t.aboutTitle;

      const p1 = document.createElement('p');
      p1.textContent = t.aboutSubtitle;

      const pOrig = document.createElement('p');
      pOrig.textContent = t.aboutOriginalityNote;

      const hData = document.createElement('p');
      hData.style.fontWeight = '700';
      hData.style.color = '#f3f4f6';
      hData.textContent = t.aboutDataHeading;

      const list = document.createElement('ul');
      const items = [
        '© OpenStreetMap contributors (ODbL 1.0) — İstanbul açık harita verileri (binalar, yollar ve ibadethane güvenli alanları)',
        'Türetilmiş veri klasörü: public/derived-data/ (LICENSE-ODbL.md)',
        'Copernicus DEM GLO-30 — © DLR e.V. & Airbus Defence and Space GmbH (EU / ESA) — arazi yüksekliği',
        'Kaynak: İBB Açık Veri Portalı (İBB Açık Veri Lisansı)',
        'Engine: Three.js (MIT) · Rapier3D (Apache-2.0) · meshoptimizer (MIT) · 240 Hz Pacejka Physics · AudioWorklet DSP · Capacitor 8 Android Native',
      ];
      for (const text of items) {
        const li = document.createElement('li');
        li.textContent = text;
        list.append(li);
      }

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const privacyLink = document.createElement('a');
      privacyLink.href = './privacy.html';
      privacyLink.target = '_blank';
      privacyLink.rel = 'noopener noreferrer';
      privacyLink.className = 'hud-btn';
      privacyLink.style.textDecoration = 'none';
      privacyLink.textContent = t.aboutPrivacyLink;

      const closeBtn = this.makeButton('modal-close', () => this.openModal('none'));
      closeBtn.classList.add('active');
      closeBtn.textContent = t.closeButton;

      actions.append(privacyLink, closeBtn);
      this.modalPanel.append(h2, p1, pOrig, hData, list, actions);
      return;
    }

    if (this.activeModal === 'crashlog') {
      const h2 = document.createElement('h2');
      h2.textContent = t.viewCrashLogButton;

      const pre = document.createElement('pre');
      pre.className = 'crash-pre';
      const records = this.crashLog.list();
      pre.textContent = records.length > 0 ? this.crashLog.formatText() : t.crashLogEmpty;

      const actions = document.createElement('div');
      actions.className = 'modal-actions';

      const closeBtn = this.makeButton('modal-close', () => this.openModal('pause'));
      closeBtn.classList.add('active');
      closeBtn.textContent = t.closeButton;

      actions.append(closeBtn);
      this.modalPanel.append(h2, pre, actions);
    }
  }
}
