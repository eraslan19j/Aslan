export interface VehicleAudioTelemetry {
  paused: boolean;
  inVehicle: boolean;
  speedKph: number;
  rpm: number;
  redlineRpm: number;
  throttle: number;
  turboBoost: number;
  skidIntensity: number;
  backfirePulse: number;
  blowOffPulse: number;
  gearShiftPulse: number;
  cylinders?: number;
}

/**
 * High-fidelity procedural Web Audio API + AudioWorklet vehicle sound engine.
 * Synthesizes:
 * - Physically-informed combustion waveguide engine via AudioWorklet (with rich waveshaper fallback)
 * - Turbocharger spool whistle & blow-off valve ("pssshh") on lift-off / upshifts
 * - Overrun exhaust backfire pops & bangs
 * - Dual-band resonant 4-wheel tire screech driven by Pacejka slip intensity
 * - Speed-proportional aerodynamic wind rush, dual-tone horn & chassis impacts
 */
export class ProceduralSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // AudioWorklet primary engine node (when supported)
  private workletNode: AudioWorkletNode | null = null;
  private workletGain: GainNode | null = null;
  private workletLoading = false;

  // Rich multi-harmonic fallback synthesizer (active immediately until worklet loads, or in headless/old WebView)
  private engineOsc: OscillatorNode | null = null;
  private engineHarmOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Turbo spool whistle
  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;

  // Dual-band tire screech & aerodynamic wind
  private noiseBuffer: AudioBuffer | null = null;
  private skidBand1: BiquadFilterNode | null = null;
  private skidBand2: BiquadFilterNode | null = null;
  private skidGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  private muted = false;
  private initialized = false;
  private lastImpactMs = 0;
  private lastBackfireMs = 0;
  private lastBlowOffMs = 0;

  isMuted(): boolean {
    return this.muted;
  }

  getBackendMode(): string {
    if (!this.initialized) return 'Standby';
    return this.workletNode ? 'AudioWorklet DSP' : 'Waveshaper DSP';
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.36, this.ctx.currentTime, 0.04);
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

  private createWaveshaperCurve(amount = 24): Float32Array<ArrayBuffer> {
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * (1 + amount * 0.08));
    }
    return curve;
  }

  private setupContinuousNodes(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.36;
    master.connect(ctx.destination);
    this.masterGain = master;

    // Shared 2-second white noise buffer for tire screech, wind, blow-off & backfire pops
    const bufLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = noiseBuf;

    // 1. Multi-harmonic combustion fallback engine (sawtooth + 2nd harmonic + sub rumble -> soft-clip -> resonant lowpass)
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.createWaveshaperCurve(18);
    shaper.oversample = '2x';

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 260;
    engineFilter.Q.value = 2.4;

    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 54;

    const harm = ctx.createOscillator();
    harm.type = 'triangle';
    harm.frequency.value = 108;

    const sub = ctx.createOscillator();
    sub.type = 'triangle';
    sub.frequency.value = 27;

    osc.connect(shaper);
    harm.connect(shaper);
    sub.connect(shaper);
    shaper.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);

    osc.start();
    harm.start();
    sub.start();

    this.engineOsc = osc;
    this.engineHarmOsc = harm;
    this.engineSubOsc = sub;
    this.engineFilter = engineFilter;
    this.engineGain = engineGain;

    // 1b. Upgrade seamlessly to real-time AudioWorklet physical waveguide engine when available
    if (ctx.audioWorklet && !this.workletLoading) {
      this.workletLoading = true;
      const workletUrl = new URL('./audio/engine-worklet.js', window.location.href).toString();
      void ctx.audioWorklet
        .addModule(workletUrl)
        .then(() => {
          if (!this.ctx || !this.masterGain) return;
          const node = new AudioWorkletNode(this.ctx, 'istanbul-engine-processor');
          const wg = this.ctx.createGain();
          wg.gain.value = 0;
          node.connect(wg);
          wg.connect(this.masterGain);
          this.workletNode = node;
          this.workletGain = wg;
        })
        .catch(() => {
          // Keep rich fallback synthesizer seamlessly
        });
    }

    // 2. Turbocharger spool whistle
    const turboOsc = ctx.createOscillator();
    turboOsc.type = 'sine';
    turboOsc.frequency.value = 1850;
    const turboGain = ctx.createGain();
    turboGain.gain.value = 0;
    turboOsc.connect(turboGain);
    turboGain.connect(master);
    turboOsc.start();
    this.turboOsc = turboOsc;
    this.turboGain = turboGain;

    // 3. Dual-band resonant asphalt tire screech (realistic rubber squeal vs hiss!)
    const skidNoise = ctx.createBufferSource();
    skidNoise.buffer = noiseBuf;
    skidNoise.loop = true;

    const skidBand1 = ctx.createBiquadFilter();
    skidBand1.type = 'bandpass';
    skidBand1.frequency.value = 1120;
    skidBand1.Q.value = 6.5;

    const skidBand2 = ctx.createBiquadFilter();
    skidBand2.type = 'bandpass';
    skidBand2.frequency.value = 2180;
    skidBand2.Q.value = 5.2;

    const skidGain = ctx.createGain();
    skidGain.gain.value = 0;

    skidNoise.connect(skidBand1);
    skidNoise.connect(skidBand2);
    skidBand1.connect(skidGain);
    skidBand2.connect(skidGain);
    skidGain.connect(master);
    skidNoise.start();

    this.skidBand1 = skidBand1;
    this.skidBand2 = skidBand2;
    this.skidGain = skidGain;

    // 4. Aerodynamic wind rush at high speeds (80–200 km/h)
    const windNoise = ctx.createBufferSource();
    windNoise.buffer = noiseBuf;
    windNoise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 1.2;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windNoise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windNoise.start();

    this.windFilter = windFilter;
    this.windGain = windGain;
  }

  /** Updates engine RPM/load waveguide, turbo whine, tire screech, wind rush, backfire & BOV. */
  updateVehicleAudio(v: VehicleAudioTelemetry): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc || !this.engineSubOsc || !this.engineFilter) {
      return;
    }
    try {
      const now = this.ctx.currentTime;
      if (!Number.isFinite(now)) return;
      if (v.paused || this.muted || !v.inVehicle) {
        this.engineGain.gain.setTargetAtTime(0, now, 0.06);
        this.workletGain?.gain.setTargetAtTime(0, now, 0.06);
        this.turboGain?.gain.setTargetAtTime(0, now, 0.06);
        this.skidGain?.gain.setTargetAtTime(0, now, 0.05);
        this.windGain?.gain.setTargetAtTime(0, now, 0.08);
        return;
      }

      const safeRpm = Number.isFinite(v.rpm) ? Math.max(500, Math.min(9500, v.rpm)) : 950;
      const safeRedline = Number.isFinite(v.redlineRpm) ? Math.max(2000, v.redlineRpm) : 8200;
      const safeThrottle = Number.isFinite(v.throttle) ? Math.max(0, Math.min(1, v.throttle)) : 0;
      const safeBackfire = Number.isFinite(v.backfirePulse) ? Math.max(0, Math.min(1, v.backfirePulse)) : 0;
      const rpmFrac = Math.max(0, Math.min(1, (safeRpm - 800) / Math.max(1000, safeRedline - 800)));
      const cyl = v.cylinders ?? 6;

      // Engine synth: prefer physical waveguide AudioWorklet if loaded, else rich multi-harmonic fallback
      if (this.workletNode && this.workletGain) {
        const pRpm = this.workletNode.parameters.get('rpm');
        const pThr = this.workletNode.parameters.get('throttle');
        const pCyl = this.workletNode.parameters.get('cylinders');
        const pBf = this.workletNode.parameters.get('backfire');
        pRpm?.setTargetAtTime(safeRpm, now, 0.025);
        pThr?.setTargetAtTime(safeThrottle, now, 0.03);
        pCyl?.setTargetAtTime(cyl, now, 0.1);
        pBf?.setTargetAtTime(safeBackfire, now, 0.015);
        const wgTarget = 0.24 + rpmFrac * 0.18 + safeThrottle * 0.14;
        this.workletGain.gain.setTargetAtTime(wgTarget, now, 0.04);
        // Keep fallback muted once AudioWorklet is active
        this.engineGain.gain.setTargetAtTime(0, now, 0.06);
      } else {
        const firingHz = (safeRpm / 60) * (cyl * 0.5);
        this.engineOsc.frequency.setTargetAtTime(Math.max(35, firingHz), now, 0.035);
        this.engineHarmOsc?.frequency.setTargetAtTime(Math.max(70, firingHz * 2.0), now, 0.035);
        this.engineSubOsc.frequency.setTargetAtTime(Math.max(20, firingHz * 0.5), now, 0.035);
        this.engineFilter.frequency.setTargetAtTime(
          210 + rpmFrac * 1350 + safeThrottle * 680,
          now,
          0.04,
        );
        const targetGain = 0.11 + rpmFrac * 0.1 + safeThrottle * 0.07;
        this.engineGain.gain.setTargetAtTime(targetGain, now, 0.05);
      }

      // Turbo spool whine (subtle high-tech turbine whistle under boost)
      if (this.turboOsc && this.turboGain) {
        const boostNorm = Math.max(0, Math.min(1, (v.turboBoost || 0) / 1.3));
        this.turboOsc.frequency.setTargetAtTime(1750 + boostNorm * 2700, now, 0.06);
        this.turboGain.gain.setTargetAtTime(boostNorm > 0.12 ? boostNorm * 0.036 : 0, now, 0.06);
      }

      // Proportional 4-wheel Pacejka tire screech
      if (this.skidGain && this.skidBand1 && this.skidBand2) {
        const skid = Math.max(0, Math.min(1, v.skidIntensity || 0));
        const targetSkidGain = skid > 0.2 ? (skid - 0.2) * 0.24 : 0;
        this.skidGain.gain.setTargetAtTime(targetSkidGain, now, 0.035);
        this.skidBand1.frequency.setTargetAtTime(980 + skid * 460 + Math.min(240, v.speedKph * 2.1), now, 0.04);
        this.skidBand2.frequency.setTargetAtTime(1950 + skid * 720, now, 0.04);
      }

      // High-speed aerodynamic wind rush
      if (this.windGain && this.windFilter) {
        const windNorm = Math.max(0, Math.min(1, (v.speedKph - 45) / 140));
        this.windGain.gain.setTargetAtTime(windNorm * windNorm * 0.14, now, 0.08);
        this.windFilter.frequency.setTargetAtTime(320 + windNorm * 780, now, 0.08);
      }

      // One-shot crisp exhaust backfire pop & turbo blow-off valve sound!
      if (safeBackfire > 0.72) {
        this.playExhaustPop(safeBackfire);
      }
      if (v.blowOffPulse > 0.45) {
        this.playTurboBlowOff(v.blowOffPulse);
      }
    } catch {
      // Never allow audio driver quirks to interrupt the main render loop
    }
  }

  /** Crisp sport exhaust backfire pop / crackle on high-RPM downshifts & lift-off. */
  playExhaustPop(intensity = 0.85): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBackfireMs < 150) return;
    this.lastBackfireMs = nowMs;

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(240 + Math.random() * 140, now);
    filt.Q.value = 1.6;
    const g = this.ctx.createGain();
    const amp = Math.min(0.32, 0.14 + intensity * 0.16);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain);
    src.start(now, Math.random() * 0.8, 0.11);
  }

  /** Turbo blow-off valve ("pssshh-tutu") flutter when lifting off boost or upshifting. */
  playTurboBlowOff(intensity = 0.7): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBlowOffMs < 240) return;
    this.lastBlowOffMs = nowMs;

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(3600, now);
    filt.frequency.exponentialRampToValueAtTime(1650, now + 0.19);
    filt.Q.value = 3.2;
    const g = this.ctx.createGain();
    const amp = Math.min(0.16, 0.06 + intensity * 0.09);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.018);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain);
    src.start(now, Math.random() * 0.8, 0.23);
  }

  /** Classic dual-tone Istanbul car horn. */
  playHorn(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const freqs = [392, 493.88];
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

  /** Punchy low-end impact + metallic scrape crunch when bumping walls or cars. */
  playImpact(severity: number): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const nowMs = performance.now();
    if (nowMs - this.lastImpactMs < 160) return;
    this.lastImpactMs = nowMs;

    const amp = Math.min(0.36, Math.max(0.06, severity * 0.036));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(125, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.15);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.18);
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

  /** Subtle clean UI tap. */
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
      this.engineHarmOsc?.stop();
      this.engineSubOsc?.stop();
      this.turboOsc?.stop();
      this.workletNode?.disconnect();
      void this.ctx?.close();
    } catch {
      // Ignore cleanup errors
    }
    this.ctx = null;
    this.workletNode = null;
    this.initialized = false;
  }
}
