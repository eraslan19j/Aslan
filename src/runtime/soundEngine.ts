/**
 * Zero-asset procedural Web Audio API sound engine for mobile & web.
 * Generates smooth, non-fatiguing engine hum, drift tire hiss, dual-tone taxi horn,
 * collision impact thud, door click, cash/mission chime, and subtle police siren.
 * Never throws in restricted/headless environments and unlocks automatically on user gesture.
 */
export class ProceduralSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private driftGain: GainNode | null = null;
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private muted = false;
  private initialized = false;
  private lastImpactMs = 0;

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.32, this.ctx.currentTime, 0.04);
    }
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Must be called from a user pointer/key event to satisfy mobile autoplay policies. */
  unlock(): void {
    if (typeof window === 'undefined') return;
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    try {
      if (!this.ctx) {
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      if (!this.initialized) {
        this.setupContinuousNodes(this.ctx);
        this.initialized = true;
      }
    } catch {
      // Ignore audio errors on locked/headless devices
    }
  }

  private setupContinuousNodes(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.32;
    master.connect(ctx.destination);
    this.masterGain = master;

    // 1. Smooth warm 4-cylinder taxi engine synth (sawtooth + sub triangle through lowpass)
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 180;
    engineFilter.Q.value = 1.6;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 54;

    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = 27;

    osc.connect(engineFilter);
    sub.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    osc.start();
    sub.start();

    this.engineOsc = osc;
    this.engineSubOsc = sub;
    this.engineFilter = engineFilter;
    this.engineGain = engineGain;

    // 2. Bandpass-filtered white noise for handbrake tire screech / drift
    const bufLen = ctx.sampleRate;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    const driftBand = ctx.createBiquadFilter();
    driftBand.type = 'bandpass';
    driftBand.frequency.value = 1450;
    driftBand.Q.value = 4.2;

    const driftGain = ctx.createGain();
    driftGain.gain.value = 0;
    noise.connect(driftBand);
    driftBand.connect(driftGain);
    driftGain.connect(master);
    noise.start();
    this.driftGain = driftGain;

    // 3. Soft distant police siren oscillator (muted when wantedStars === 0)
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 620;
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    this.sirenOsc = sirenOsc;
    this.sirenGain = sirenGain;
  }

  /** Updates continuous engine pitch, tire drift hiss, and police siren smoothly each frame. */
  updateContinuous(
    paused: boolean,
    inVehicle: boolean,
    speedKph: number,
    throttleActive: boolean,
    drifting: boolean,
    wantedStars: number,
    elapsedSec: number,
  ): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc || !this.engineSubOsc || !this.engineFilter) {
      return;
    }
    const now = this.ctx.currentTime;
    if (paused || this.muted) {
      this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      this.driftGain?.gain.setTargetAtTime(0, now, 0.06);
      this.sirenGain?.gain.setTargetAtTime(0, now, 0.08);
      return;
    }

    if (inVehicle) {
      // Simulate 4-gear RPM cadence for realistic acceleration feel
      const gearSpeed = (speedKph % 26) / 26;
      const baseHz = 48 + speedKph * 1.15 + gearSpeed * 28 + (throttleActive ? 14 : 0);
      this.engineOsc.frequency.setTargetAtTime(baseHz, now, 0.06);
      this.engineSubOsc.frequency.setTargetAtTime(baseHz * 0.5, now, 0.06);
      this.engineFilter.frequency.setTargetAtTime(
        175 + speedKph * 5.2 + (throttleActive ? 130 : 0),
        now,
        0.07,
      );
      const targetGain = 0.09 + Math.min(0.11, speedKph * 0.0014) + (throttleActive ? 0.03 : 0);
      this.engineGain.gain.setTargetAtTime(targetGain, now, 0.08);
    } else {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
    }

    if (this.driftGain) {
      this.driftGain.gain.setTargetAtTime(inVehicle && drifting ? 0.14 : 0, now, 0.05);
    }

    if (this.sirenOsc && this.sirenGain) {
      if (wantedStars > 0) {
        const wail = 610 + Math.sin(elapsedSec * 6.2) * 175;
        this.sirenOsc.frequency.setTargetAtTime(wail, now, 0.05);
        this.sirenGain.gain.setTargetAtTime(0.038 + wantedStars * 0.006, now, 0.12);
      } else {
        this.sirenGain.gain.setTargetAtTime(0, now, 0.12);
      }
    }
  }

  /** Classic dual-tone Istanbul taxi horn. */
  playHorn(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const freqs = [392, 493.88]; // G4 + B4 rich dual car horn
    for (const f of freqs) {
      const osc = this.ctx.createOscillator();
      const filt = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      filt.type = 'lowpass';
      filt.frequency.value = 1350;
      g.gain.setValueAtTime(0.001, now);
      g.gain.linearRampToValueAtTime(0.14, now + 0.02);
      g.gain.setValueAtTime(0.12, now + 0.24);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc.connect(filt);
      filt.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.36);
    }
  }

  /** Low punchy thud when bumping walls or traffic cars (rate-limited so scrapes never clip). */
  playImpact(severity: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const nowMs = performance.now();
    if (nowMs - this.lastImpactMs < 180) return;
    this.lastImpactMs = nowMs;

    const amp = Math.min(0.32, Math.max(0.05, severity * 0.032));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.14);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  /** Crisp car door latch click on enter/exit. */
  playDoorClick(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.07);
    g.gain.setValueAtTime(0.14, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** Warm ascending chord chime when picking up or completing a taxi fare mission! */
  playMissionChime(completed: boolean): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = completed ? [523.25, 659.25, 783.99, 1046.5] : [440, 587.33];
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const t = now + idx * 0.075;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  /** Subtle clean UI click. */
  playUiTap(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  dispose(): void {
    try {
      this.engineOsc?.stop();
      this.engineSubOsc?.stop();
      this.sirenOsc?.stop();
      void this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
    this.initialized = false;
  }
}
