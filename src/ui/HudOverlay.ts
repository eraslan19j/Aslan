import type { CrashLogStore } from '../core/crashLog';
import type { TouchStickInput } from '../core/controls';
import type { QualityTier } from '../core/quality';
import type { LocaleCode } from '../core/save';
import type { LandmarkPin } from '../core/world/types';
import { getStrings } from '../i18n/strings';

export interface HudTelemetryView {
  fps: number;
  drawCalls: number;
  triangles: number;
  loadedTiles: number;
  activeBuildings: number;
  physicsReady: boolean;
  qualityTier: QualityTier;
  nearestLandmarkLabel: string;
  sanctuaryLabel: string | null;
}

export interface HudCallbacks {
  onToggleQuality: () => void;
  onToggleLocale: () => void;
  onTogglePause: () => void;
  onResetPosition: () => void;
  onTeleportLandmark: (landmark: LandmarkPin) => void;
}

type ActiveModal = 'none' | 'pause' | 'about' | 'crashlog';

export class HudOverlay {
  private readonly root: HTMLDivElement;
  private readonly touchLayer: HTMLDivElement;
  private readonly modalBackdrop: HTMLDivElement;
  private readonly modalPanel: HTMLDivElement;
  private readonly toastEl: HTMLDivElement;

  private readonly titleEl: HTMLDivElement;
  private readonly subEl: HTMLDivElement;
  private readonly perfRowEl: HTMLDivElement;
  private readonly locationRowEl: HTMLDivElement;
  private readonly hintEl: HTMLDivElement;

  private readonly qualityBtn: HTMLButtonElement;
  private readonly langBtn: HTMLButtonElement;
  private readonly aboutBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly sprintBtn: HTMLButtonElement;

  private locale: LocaleCode;
  private qualityTier: QualityTier;
  private activeModal: ActiveModal = 'none';
  private readonly touchEnabled: boolean;
  private readonly touchState: TouchStickInput = { x: 0, y: 0, sprint: false };
  private readonly callbacks: HudCallbacks;
  private readonly crashLog: CrashLogStore;
  private landmarks: LandmarkPin[] = [];

  constructor(
    container: HTMLElement,
    initialLocale: LocaleCode,
    initialQuality: QualityTier,
    touchEnabled: boolean,
    crashLog: CrashLogStore,
    callbacks: HudCallbacks,
  ) {
    this.locale = initialLocale;
    this.qualityTier = initialQuality;
    this.touchEnabled = touchEnabled;
    this.crashLog = crashLog;
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.className = 'hud-root';

    const topRow = document.createElement('div');
    topRow.className = 'hud-top';

    const brandCard = document.createElement('div');
    brandCard.className = 'hud-card';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'brand-title';

    this.subEl = document.createElement('div');
    this.subEl.className = 'brand-sub';

    this.perfRowEl = document.createElement('div');
    this.perfRowEl.className = 'perf-row';
    this.perfRowEl.dataset.testid = 'perf-telemetry';

    this.locationRowEl = document.createElement('div');
    this.locationRowEl.className = 'location-row';
    this.locationRowEl.dataset.testid = 'location-telemetry';

    brandCard.append(this.titleEl, this.subEl, this.perfRowEl, this.locationRowEl);

    const actions = document.createElement('div');
    actions.className = 'hud-actions';

    this.qualityBtn = this.makeButton('btn-quality', () => this.callbacks.onToggleQuality());
    this.langBtn = this.makeButton('btn-lang', () => this.callbacks.onToggleLocale());
    this.aboutBtn = this.makeButton('btn-about', () => this.openModal('about'));
    this.pauseBtn = this.makeButton('btn-pause', () => this.callbacks.onTogglePause());

    actions.append(this.qualityBtn, this.langBtn, this.aboutBtn, this.pauseBtn);
    topRow.append(brandCard, actions);

    const bottomRow = document.createElement('div');
    bottomRow.className = 'hud-bottom';

    this.hintEl = document.createElement('div');
    this.hintEl.className = 'controls-hint';
    bottomRow.append(this.hintEl);

    this.root.append(topRow, bottomRow);

    this.touchLayer = document.createElement('div');
    this.touchLayer.className = touchEnabled ? 'touch-layer visible' : 'touch-layer';

    const stickZone = document.createElement('div');
    stickZone.className = 'stick-zone';
    stickZone.dataset.testid = 'touch-stick';
    const stickKnob = document.createElement('div');
    stickKnob.className = 'stick-knob';
    stickZone.append(stickKnob);
    this.wireStick(stickZone, stickKnob);

    this.sprintBtn = document.createElement('button');
    this.sprintBtn.type = 'button';
    this.sprintBtn.className = 'sprint-pad';
    this.sprintBtn.dataset.testid = 'touch-sprint';
    this.wireSprint(this.sprintBtn);

    this.touchLayer.append(stickZone, this.sprintBtn);

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

  private wireStick(zone: HTMLDivElement, knob: HTMLDivElement): void {
    let activePointerId: number | null = null;
    const maxRadius = 40;

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

  private wireSprint(btn: HTMLButtonElement): void {
    const setPressed = (v: boolean): void => {
      this.touchState.sprint = v;
      btn.classList.toggle('pressed', v);
    };
    btn.addEventListener('pointerdown', () => setPressed(true));
    btn.addEventListener('pointerup', () => setPressed(false));
    btn.addEventListener('pointercancel', () => setPressed(false));
    btn.addEventListener('pointerleave', () => setPressed(false));
  }

  getTouchInput(): TouchStickInput {
    return this.touchState;
  }

  setState(locale: LocaleCode, qualityTier: QualityTier): void {
    this.locale = locale;
    this.qualityTier = qualityTier;
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
    this.langBtn.textContent = t.langButton;
    this.aboutBtn.textContent = t.aboutButton;
    this.pauseBtn.textContent = t.pauseButton;
    this.sprintBtn.textContent = t.sprintButton;
    this.hintEl.textContent = this.touchEnabled ? t.controlsHintTouch : t.controlsHintDesktop;
  }

  updateTelemetry(view: HudTelemetryView): void {
    const t = getStrings(this.locale);
    const physText = view.physicsReady ? t.physicsReady : t.physicsLoading;
    this.perfRowEl.innerHTML =
      `<span class="perf-pill">${t.fpsLabel}: ${Math.round(view.fps)}</span>` +
      `<span class="perf-pill">${t.drawsLabel}: ${view.drawCalls}</span>` +
      `<span class="perf-pill">${t.trisLabel}: ${view.triangles}</span>` +
      `<span class="perf-pill">${t.tilesLabel}: ${view.loadedTiles}</span>` +
      `<span class="perf-pill">${t.buildingsLabel}: ${view.activeBuildings}</span>` +
      `<span class="perf-pill ${view.physicsReady ? 'ok' : ''}">${physText}</span>`;

    const sanctuaryHtml = view.sanctuaryLabel
      ? `<span class="sanctuary-pill" data-testid="sanctuary-banner">${t.sanctuaryBanner} · ${view.sanctuaryLabel}</span>`
      : '';
    this.locationRowEl.innerHTML =
      `<span class="location-pill">${view.nearestLandmarkLabel}</span>${sanctuaryHtml}`;
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
    }, 4000);
  }

  private renderModal(): void {
    const t = getStrings(this.locale);
    this.modalPanel.innerHTML = '';
    if (this.activeModal === 'none') return;

    if (this.activeModal === 'pause') {
      const h2 = document.createElement('h2');
      h2.textContent = t.pausedTitle;
      const p = document.createElement('p');
      p.textContent = t.aboutSubtitle;

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

      const aboutBtn = this.makeButton('modal-about', () => this.openModal('about'));
      aboutBtn.textContent = t.aboutButton;

      const crashBtn = this.makeButton('modal-crashlog', () => this.openModal('crashlog'));
      crashBtn.textContent = t.viewCrashLogButton;

      actions.append(resumeBtn, resetBtn, aboutBtn, crashBtn);
      this.modalPanel.append(h2, p, actions);

      if (this.landmarks.length > 0) {
        const ftTitle = document.createElement('div');
        ftTitle.className = 'fast-travel-title';
        ftTitle.textContent = t.fastTravelHeading;

        const ftRow = document.createElement('div');
        ftRow.className = 'modal-actions';
        for (const lm of this.landmarks) {
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
        '© OpenStreetMap contributors (ODbL 1.0) — Sultanahmet–Eminönü binaları, yolları ve T1 tramvay hattı',
        'Copernicus DEM GLO-30 — © DLR e.V. & Airbus Defence and Space GmbH (EU / ESA) — arazi yüksekliği',
        'Kaynak: İBB Açık Veri Portalı (İBB Açık Veri Lisansı)',
        'Overture Maps Foundation (CDLA Permissive 2.0 / ODbL)',
        'Engine: Three.js (MIT) · Rapier3D (Apache-2.0) · Capacitor (MIT)',
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
