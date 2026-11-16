import type { CrashLogStore } from '../core/crashLog';
import type { TouchStickInput } from '../core/controls';
import {
  formatDiagnosticsJson,
  type DiagnosticsSnapshot,
  type TimeOfDay,
} from '../core/diagnostics';
import type { QualityTier } from '../core/quality';
import type { LocaleCode } from '../core/save';
import { REGION_REGISTRY, type RegionId } from '../core/world/regions';
import type { LandmarkPin } from '../core/world/types';
import { getStrings } from '../i18n/strings';

export interface TouchDrivingInput {
  gas: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
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
}

export interface HudCallbacks {
  onToggleQuality: () => void;
  onToggleTimeOfDay: () => void;
  onToggleLocale: () => void;
  onTogglePause: () => void;
  onResetPosition: () => void;
  onToggleVehicle: () => void;
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
  private readonly touchLayer: HTMLDivElement;
  private readonly touchFootGroup: HTMLDivElement;
  private readonly touchDriveGroup: HTMLDivElement;
  private readonly modalBackdrop: HTMLDivElement;
  private readonly modalPanel: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;

  private readonly titleEl: HTMLDivElement;
  private readonly subEl: HTMLDivElement;
  private readonly perfRowEl: HTMLDivElement;
  private readonly locationRowEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;

  private readonly qualityBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;
  private readonly aboutBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;

  private readonly sprintBtn: HTMLButtonElement;
  private readonly enterCarBtn: HTMLButtonElement;
  private readonly exitCarBtn: HTMLButtonElement;
  private readonly gasBtn: HTMLButtonElement;
  private readonly brakeBtn: HTMLButtonElement;

  private locale: LocaleCode;
  private qualityTier: QualityTier;
  private timeOfDay: TimeOfDay;
  private activeRegionId: RegionId;
  private activeModal: ActiveModal = 'none';
  private inVehicle = false;
  private readonly touchEnabled: boolean;
  private readonly touchState: TouchStickInput = { x: 0, y: 0, sprint: false };
  private readonly driveTouch: TouchDrivingInput = {
    gas: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
  };
  private readonly callbacks: HudCallbacks;
  private readonly crashLog: CrashLogStore;
  private landmarks: LandmarkPin[] = [];

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

    brandCard.append(brandRow, this.perfRowEl, this.locationRowEl);

    const actions = document.createElement('div');
    actions.className = 'hud-actions';

    this.qualityBtn = this.makeButton('btn-quality', () => this.callbacks.onToggleQuality());
    this.settingsBtn = this.makeButton('btn-settings', () => this.openModal('settings'));
    this.aboutBtn = this.makeButton('btn-about', () => this.openModal('about'));
    this.pauseBtn = this.makeButton('btn-pause', () => this.callbacks.onTogglePause());

    actions.append(this.qualityBtn, this.settingsBtn, this.aboutBtn, this.pauseBtn);
    topRow.append(brandCard, actions);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'hud-bottom';

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'controls-hint';
    bottomRow.append(this.hintEl);

    this.root.append(topRow, bottomRow);

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
    this.wireStick(stickZone, stickKnob);

    const footRight = document.createElement('div');
    footRight.className = 'touch-right-pad';

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

    footRight.append(this.enterCarBtn, this.sprintBtn);
    this.touchFootGroup.append(stickZone, footRight);

    // Driving group
    this.touchDriveGroup = document.createElement('div');
    this.touchDriveGroup.className = 'touch-drive-group touch-hidden';

    const steerPad = document.createElement('div');
    steerPad.className = 'touch-left-steer';
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
    steerPad.append(steerLeftBtn, steerRightBtn);

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
    this.touchDriveGroup.append(steerPad, driveRight);

    this.touchLayer.append(this.touchFootGroup, this.touchDriveGroup);

    this.modalBackdrop = document.createElement('div');
    this.modalBackdrop.className = 'modal-backdrop';
    this.modalPanel = document.createElement('div');
    this.modalPanel.className = 'modal-panel';
    this.modalBackdrop.append(this.modalPanel);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast-banner';

    container.append(this.root, this.touchLayer, this.modalBackdrop, this.toastEl);
    this.applyLabels();
  }

  setLandmarks(landmarks: LandmarkPin[]): void {
    this.landmarks = landmarks;
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
  ): void {
    this.locale = locale;
    this.qualityTier = qualityTier;
    this.timeOfDay = timeOfDay;
    this.activeRegionId = regionId;
    this.applyLabels();
    if (this.activeModal !== 'none') {
      this.renderModal();
    }
  }

  private applyLabels(): void {
    const t = getStrings(this.locale);
    this.titleEl.textContent = t.appTitle;
    this.subEl.textContent = t.milestoneTag;
    this.qualityBtn.textContent =
      this.qualityTier === 'lite' ? t.qualityLite : t.qualityNormal;
    this.qualityBtn.classList.toggle('active', this.qualityTier === 'lite');
    this.settingsBtn.textContent = t.settingsButton;
    this.aboutBtn.textContent = t.aboutButton;
    this.pauseBtn.textContent = t.pauseButton;

    this.sprintBtn.textContent = t.sprintButton;
    this.enterCarBtn.textContent = t.enterCarButton;
    this.exitCarBtn.textContent = t.exitCarButton;
    this.gasBtn.textContent = t.gasButton;
    this.brakeBtn.textContent = t.brakeButton;
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
      this.touchFootGroup.classList.toggle('touch-hidden', this.inVehicle);
      this.touchDriveGroup.classList.toggle('touch-hidden', !this.inVehicle);
      this.updateHintLabel();
    }
    this.enterCarBtn.classList.toggle('touch-hidden', !view.nearVehicle);

    const speedHtml = view.inVehicle
      ? `<span class="perf-pill speed" data-testid="speedometer">${view.speedKph} ${t.speedUnit}</span>`
      : '';
    this.perfRowEl.innerHTML =
      `<span class="perf-pill">${t.fpsLabel}: ${Math.round(view.fps)}</span>` +
      `<span class="perf-pill">${t.drawsLabel}: ${view.drawCalls}</span>` +
      `<span class="perf-pill">${t.tilesLabel}: ${view.loadedTiles}</span>` +
      `<span class="perf-pill">${t.buildingsLabel}: ${view.activeBuildings}</span>` +
      speedHtml;

    const sanctuaryHtml = view.sanctuaryLabel
      ? `<span class="sanctuary-pill" data-testid="sanctuary-banner">${t.sanctuaryBanner} · ${view.sanctuaryLabel}</span>`
      : '';
    const vehiclePromptHtml =
      !view.inVehicle && view.nearVehicle
        ? `<span class="prompt-pill" data-testid="vehicle-prompt">${t.nearVehiclePrompt}</span>`
        : '';

    this.locationRowEl.innerHTML =
      `<span class="location-pill">${view.regionName} · ${view.nearestLandmarkLabel}</span>` +
      sanctuaryHtml +
      vehiclePromptHtml;
  }

  openModal(modal: ActiveModal): void {
    this.activeModal = modal;
    this.modalBackdrop.classList.toggle('open', modal !== 'none');
    this.renderModal();
  }

  getActiveModal(): ActiveModal {
    return this.activeModal;
  }

  showToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('visible');
    window.setTimeout(() => {
      this.toastEl.classList.remove('visible');
    }, 3600);
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

      // Multi-region switcher (Namık Kemal default + Fatih second region)
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

      const qualBtn = this.makeButton('settings-quality', () => this.callbacks.onToggleQuality());
      qualBtn.textContent =
        this.qualityTier === 'lite' ? `${t.qualityLite} ✓` : t.qualityNormal;
      if (this.qualityTier === 'lite') qualBtn.classList.add('active');

      const timeBtn = this.makeButton('settings-time', () => this.callbacks.onToggleTimeOfDay());
      timeBtn.textContent = this.timeOfDay === 'night' ? `${t.timeNight} 🌙` : `${t.timeDay} ☀`;
      if (this.timeOfDay === 'night') timeBtn.classList.add('active');

      const langBtn = this.makeButton('settings-lang', () => this.callbacks.onToggleLocale());
      langBtn.textContent = t.langButton;

      ctrlRow.append(qualBtn, timeBtn, langBtn);

      const diagTitle = document.createElement('div');
      diagTitle.className = 'fast-travel-title';
      diagTitle.textContent = t.diagnosticsHeading;

      const grid = document.createElement('div');
      grid.className = 'diag-grid';
      grid.dataset.testid = 'diagnostics-grid';

      const entries: [string, string][] = [
        ['FPS / Frame', `${snap.fps} FPS (${snap.frameMs} ms)`],
        ['Draw / Tris', `${snap.drawCalls} / ${snap.triangles}`],
        ['Tiles / Bldgs', `${snap.activeTiles} / ${snap.activeBuildings}`],
        [
          'JS Heap',
          snap.jsHeapUsedMb !== null
            ? `${snap.jsHeapUsedMb} / ${snap.jsHeapTotalMb ?? '?'} MB`
            : 'N/A',
        ],
        ['GPU / Renderer', snap.gpuRenderer],
        ['WebView', snap.webViewVersion],
        ['Device', snap.deviceModel],
        ['Mode / Quality', `${snap.qualityTier} · ${snap.timeOfDay} · ${snap.regionId}`],
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
        '© OpenStreetMap contributors (ODbL 1.0) — Esenler / Namık Kemal (v1.1-esenler-data + Overpass) & Fatih binaları, yolları ve ibadethane güvenli alanları',
        'Türetilmiş veri klasörü: public/derived-data/ (LICENSE-ODbL.md)',
        'Copernicus DEM GLO-30 — © DLR e.V. & Airbus Defence and Space GmbH (EU / ESA) — arazi yüksekliği',
        'Kaynak: İBB Açık Veri Portalı (İBB Açık Veri Lisansı)',
        'Engine: Three.js (MIT) · Rapier3D (Apache-2.0) · Capacitor 8 (MIT)',
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
