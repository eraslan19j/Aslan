import {
  computeBoostAudio,
  computeEngineAudioFrame,
  computeTyreFrame,
  describeImpact,
  emptyTyreFrame,
  type TyreAudioFrame,
} from '../core/vehicleAudioModel';
import { VEHICLE_CATALOG } from '../core/vehicleCatalog';
import type { WheelTelemetry } from '../core/vehiclePhysics';
import type { VehicleArchetype } from '../core/vehicle';

export interface VehicleAudioTelemetry {
  paused: boolean;
  inVehicle: boolean;
  speedKph: number;
  rpm: number;
  redlineRpm: number;
  idleRpm?: number;
  throttle: number;
  turboBoost: number;
  skidIntensity: number;
  backfirePulse: number;
  blowOffPulse: number;
  gearShiftPulse: number;
  cylinders?: number;
  /** v0.9.0 — full Pacejka wheel telemetry feeds the realistic tyre model. */
  wheels?: readonly WheelTelemetry[];
  archetype?: VehicleArchetype;
  /** v0.9.0 — surface wetness (night/rain) changes tyre timbre. */
  surfaceWetness?: number;
}

/**
 * v0.9.0 — Layered, physics-driven vehicle sound engine.
 *
 * What changed from v0.8.0 (all reported by the user):
 *  1. **Tyre squeal** no longer comes from two fixed band-pass filters fed by one
 *     scalar. Each of the four tyres now contributes a squeal whose pitch follows
 *     the actual slip velocity (`vehicleAudioModel.computeTyreFrame`), layered with
 *     a granular scuff band and a road-texture band. This removes the "fake hiss".
 *  2. **Engine** is a 5-layer AudioWorklet voice (exhaust waveguide, intake plenum,
 *     valvetrain, turbo, overrun pops) with per-car cylinder count and exhaust voice.
 *  3. **Turbo/nitro** adds a spool whistle, compressor flutter, blow-off and
 *     wastegate bleed, all sampled from the boost telemetry.
 *  4. **Impacts** are three-timbre layered hits (sheet metal gong + metallic ring,
 *     glass shatter, plastic bumper thud).
 */
export class ProceduralSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // AudioWorklet primary engine node (when supported)
  private workletNode: AudioWorkletNode | null = null;
  private workletGain: GainNode | null = null;
  private workletLoading = false;

  // Rich multi-harmonic fallback synthesizer (active immediately until worklet loads)
  private engineOsc: OscillatorNode | null = null;
  private engineHarmOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;

  // Exhaust rasp layer (waveshaper + band-pass) for the fallback path
  private raspGain: GainNode | null = null;

  // Turbo spool whistle + BOV noise
  private turboOsc: OscillatorNode | null = null;
  private turboGain: GainNode | null = null;
  private bovNoiseGain: GainNode | null = null;
  private bovFilter: BiquadFilterNode | null = null;

  // Realistic tyre layers: squeal tone, granular scuff, road texture
  private noiseBuffer: AudioBuffer | null = null;
  private tyreSqueal: OscillatorNode | null = null;
  private tyreSqueal2: OscillatorNode | null = null;
  private tyreSquealGain: GainNode | null = null;
  private tyreSquealFilter: BiquadFilterNode | null = null;
  private tyreScuffSrc: AudioBufferSourceNode | null = null;
  private tyreScuffGain: GainNode | null = null;
  private tyreScuffFilter: BiquadFilterNode | null = null;
  private tyreGrainGain: GainNode | null = null;
  private tyreRoadSrc: AudioBufferSourceNode | null = null;
  private tyreRoadGain: GainNode | null = null;
  private tyreRoadFilter: BiquadFilterNode | null = null;

  // Aerodynamic wind rush
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  // Nitro
  private nitroGain: GainNode | null = null;
  private nitroFilter: BiquadFilterNode | null = null;
  /** v0.9.0 A7 — nitro "jet body" layer that survives phone speakers. */
  private nitroWhooshGain: GainNode | null = null;
  private nitroWhooshFilter: BiquadFilterNode | null = null;
  /** v0.9.0 A7 — wastegate chuff noise (lift-off with boost). */
  private chuffGain: GainNode | null = null;
  private chuffFilter: BiquadFilterNode | null = null;
  /** Octave partial of the turbo whistle — keeps the spin audible on a phone. */
  private turboOsc2: OscillatorNode | null = null;

  private muted = false;
  private initialized = false;
  private lastImpactMs = 0;
  private lastBackfireMs = 0;
  private lastBlowOffMs = 0;
  private tyreFrame: TyreAudioFrame = emptyTyreFrame();

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
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.42, this.ctx.currentTime, 0.04);
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
    const n = 512;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const x = (i * 2) / n - 1;
      // Asymmetric soft clip = even-order harmonics = "rasp" of a real exhaust
      const drive = 1 + amount * 0.08;
      curve[i] = x >= 0 ? Math.tanh(x * drive) : Math.tanh(x * drive * 0.78) * 0.9;
    }
    return curve;
  }

  private makeNoiseBuffer(ctx: AudioContext, seconds = 3, pink = false): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (pink) {
      // Voss-McCartney-ish pink noise: much more natural for tyres and wind.
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < len; i += 1) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.969 * b2 + white * 0.153852;
        b3 = 0.8665 * b3 + white * 0.3104856;
        b4 = 0.55 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.016898;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else {
      for (let i = 0; i < len; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return buf;
  }

  private setupContinuousNodes(ctx: AudioContext): void {
    // Master chain: sum → glue compressor → master gain → destination
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.42;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.004;
    comp.release.value = 0.16;
    master.connect(comp);
    comp.connect(ctx.destination);
    this.masterGain = master;

    const white = this.makeNoiseBuffer(ctx, 3, false);
    const pink = this.makeNoiseBuffer(ctx, 3, true);
    this.noiseBuffer = pink;

    // ---- 1. Fallback engine (oscillators + waveshaper + filter), used until the
    //         AudioWorklet module is ready (older WebViews stay on this path) ----
    const shaper = ctx.createWaveShaper();
    shaper.curve = this.createWaveshaperCurve(20);
    shaper.oversample = '2x';

    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 260;
    engineFilter.Q.value = 1.9;

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

    // Exhaust rasp band on the fallback path
    const raspBp = ctx.createBiquadFilter();
    raspBp.type = 'bandpass';
    raspBp.frequency.value = 1450;
    raspBp.Q.value = 0.9;
    const raspGain = ctx.createGain();
    raspGain.gain.value = 0;
    shaper.connect(raspBp);
    raspBp.connect(raspGain);
    raspGain.connect(master);
    this.raspGain = raspGain;

    // ---- 2. AudioWorklet layered engine upgrade ----
    if (ctx.audioWorklet && !this.workletLoading) {
      this.workletLoading = true;
      const workletUrl = new URL('./audio/engine-worklet.js', window.location.href).toString();
      void ctx.audioWorklet
        .addModule(workletUrl)
        .then(() => {
          if (!this.ctx || !this.masterGain) return;
          const node = new AudioWorkletNode(this.ctx, 'istanbul-engine-processor', {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [1],
          });
          const wg = this.ctx.createGain();
          wg.gain.value = 0;
          node.connect(wg);
          wg.connect(this.masterGain);
          this.workletNode = node;
          this.workletGain = wg;
        })
        .catch(() => {
          // Keep the fallback synthesizer — the game must never go silent.
        });
    }

    // ---- 3. Turbo whistle (sine sweeping with the shaft) ----
    const turboOsc = ctx.createOscillator();
    turboOsc.type = 'sine';
    turboOsc.frequency.value = 1650;
    const turboGain = ctx.createGain();
    turboGain.gain.value = 0;
    turboOsc.connect(turboGain);
    turboGain.connect(master);
    turboOsc.start();
    this.turboOsc = turboOsc;
    this.turboGain = turboGain;

    // Octave upper partial: a single sine at 1.5 kHz is inaudible on a handset
    // speaker, but the octave sits right in its passband.
    const turboOsc2 = ctx.createOscillator();
    turboOsc2.type = 'sine';
    turboOsc2.frequency.value = 3300;
    turboOsc2.connect(turboGain);
    turboOsc2.start();
    this.turboOsc2 = turboOsc2;

    // ---- 4. BOV / wastegate noise (band-passed white noise) ----
    const bovSrc = ctx.createBufferSource();
    bovSrc.buffer = white;
    bovSrc.loop = true;
    const bovFilter = ctx.createBiquadFilter();
    bovFilter.type = 'bandpass';
    bovFilter.frequency.value = 3600;
    bovFilter.Q.value = 1.1;
    const bovGain = ctx.createGain();
    bovGain.gain.value = 0;
    bovSrc.connect(bovFilter);
    bovFilter.connect(bovGain);
    bovGain.connect(master);
    bovSrc.start();
    this.bovFilter = bovFilter;
    this.bovNoiseGain = bovGain;

    // ---- 5. REALISTIC TYRE SOUND: three independent layers ----
    // (a) Squeal: two detuned sawtooth-ish oscillators + resonant band-pass whose
    //     frequency and level track the physics-driven slip velocity.
    const squeal = ctx.createOscillator();
    squeal.type = 'sawtooth';
    squeal.frequency.value = 780;
    const squeal2 = ctx.createOscillator();
    squeal2.type = 'sine';
    squeal2.frequency.value = 1560;
    const squealGain = ctx.createGain();
    squealGain.gain.value = 0;
    const squealFilter = ctx.createBiquadFilter();
    squealFilter.type = 'bandpass';
    squealFilter.frequency.value = 1300;
    squealFilter.Q.value = 7.5;
    const squealMix = ctx.createGain();
    squealMix.gain.value = 0.5;
    squeal.connect(squealMix);
    squeal2.connect(squealMix);
    squealMix.connect(squealFilter);
    squealFilter.connect(squealGain);
    squealGain.connect(master);
    squeal.start();
    squeal2.start();
    this.tyreSqueal = squeal;
    this.tyreSqueal2 = squeal2;
    this.tyreSquealGain = squealGain;
    this.tyreSquealFilter = squealFilter;

    // (b) Scuff: pink noise through a moving band-pass + fast grain AM so the
    //     texture "gravels" instead of hissing steadily.
    const scuffSrc = ctx.createBufferSource();
    scuffSrc.buffer = pink;
    scuffSrc.loop = true;
    const scuffFilter = ctx.createBiquadFilter();
    scuffFilter.type = 'bandpass';
    scuffFilter.frequency.value = 520;
    scuffFilter.Q.value = 0.85;
    const scuffGain = ctx.createGain();
    scuffGain.gain.value = 0;
    // Grain modulation: an LFO multiplied into the scuff gain
    const grainLfo = ctx.createOscillator();
    grainLfo.type = 'square';
    grainLfo.frequency.value = 34;
    const grainDepth = ctx.createGain();
    grainDepth.gain.value = 0.0;
    const grainCarrier = ctx.createGain();
    grainCarrier.gain.value = 1;
    grainLfo.connect(grainDepth);
    grainDepth.connect(grainCarrier.gain);
    grainLfo.start();
    scuffSrc.connect(scuffFilter);
    scuffFilter.connect(grainCarrier);
    grainCarrier.connect(scuffGain);
    scuffGain.connect(master);
    scuffSrc.start();
    this.tyreScuffSrc = scuffSrc;
    this.tyreScuffGain = scuffGain;
    this.tyreScuffFilter = scuffFilter;
    this.tyreGrainGain = grainDepth;

    // (c) Road texture: pink noise low-passed, rises with speed (tyre roar).
    const roadSrc = ctx.createBufferSource();
    roadSrc.buffer = pink;
    roadSrc.loop = true;
    const roadFilter = ctx.createBiquadFilter();
    roadFilter.type = 'lowpass';
    roadFilter.frequency.value = 900;
    roadFilter.Q.value = 0.4;
    const roadGain = ctx.createGain();
    roadGain.gain.value = 0;
    roadSrc.connect(roadFilter);
    roadFilter.connect(roadGain);
    roadGain.connect(master);
    roadSrc.start();
    this.tyreRoadSrc = roadSrc;
    this.tyreRoadGain = roadGain;
    this.tyreRoadFilter = roadFilter;

    // ---- 6. Aerodynamic wind rush ----
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = pink;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start();
    this.windFilter = windFilter;
    this.windGain = windGain;

    // ---- 7. Nitro jet (low whoosh + high hiss) ----
    const nitroSrc = ctx.createBufferSource();
    nitroSrc.buffer = white;
    nitroSrc.loop = true;
    const nitroFilter = ctx.createBiquadFilter();
    nitroFilter.type = 'bandpass';
    nitroFilter.frequency.value = 2400;
    nitroFilter.Q.value = 0.6;
    const nitroGain = ctx.createGain();
    nitroGain.gain.value = 0;
    nitroSrc.connect(nitroFilter);
    nitroFilter.connect(nitroGain);
    nitroGain.connect(master);
    nitroSrc.start();
    this.nitroFilter = nitroFilter;
    this.nitroGain = nitroGain;

    // Nitro "jet body": a narrow band well above the phone-speaker knee, so the
    // effect is felt on a handset instead of vanishing into sub-bass.
    const whooshSrc = ctx.createBufferSource();
    whooshSrc.buffer = white;
    whooshSrc.loop = true;
    const whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.frequency.value = 520;
    whooshFilter.Q.value = 1.6;
    const whooshGain = ctx.createGain();
    whooshGain.gain.value = 0;
    whooshSrc.connect(whooshFilter);
    whooshFilter.connect(whooshGain);
    whooshGain.connect(master);
    whooshSrc.start();
    this.nitroWhooshFilter = whooshFilter;
    this.nitroWhooshGain = whooshGain;

    // Wastegate chuff: short low-mid noise burst on lift-off.
    const chuffSrc = ctx.createBufferSource();
    chuffSrc.buffer = white;
    chuffSrc.loop = true;
    const chuffFilter = ctx.createBiquadFilter();
    chuffFilter.type = 'bandpass';
    chuffFilter.frequency.value = 600;
    chuffFilter.Q.value = 2.2;
    const chuffGain = ctx.createGain();
    chuffGain.gain.value = 0;
    chuffSrc.connect(chuffFilter);
    chuffFilter.connect(chuffGain);
    chuffGain.connect(master);
    chuffSrc.start();
    this.chuffFilter = chuffFilter;
    this.chuffGain = chuffGain;
  }

  /** Updates the whole vehicle mix from one telemetry packet (call once per frame). */
  updateVehicleAudio(v: VehicleAudioTelemetry): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc || !this.engineSubOsc || !this.engineFilter) {
      return;
    }
    try {
      const now = this.ctx.currentTime;
      if (!Number.isFinite(now)) return;

      const silence = (): void => {
        this.engineGain?.gain.setTargetAtTime(0, now, 0.06);
        this.workletGain?.gain.setTargetAtTime(0, now, 0.06);
        this.raspGain?.gain.setTargetAtTime(0, now, 0.06);
        this.turboGain?.gain.setTargetAtTime(0, now, 0.06);
        this.bovNoiseGain?.gain.setTargetAtTime(0, now, 0.05);
        this.tyreSquealGain?.gain.setTargetAtTime(0, now, 0.05);
        this.tyreScuffGain?.gain.setTargetAtTime(0, now, 0.05);
        this.tyreRoadGain?.gain.setTargetAtTime(0, now, 0.06);
        this.windGain?.gain.setTargetAtTime(0, now, 0.08);
        this.nitroGain?.gain.setTargetAtTime(0, now, 0.05);
        this.nitroWhooshGain?.gain.setTargetAtTime(0, now, 0.05);
        this.chuffGain?.gain.setTargetAtTime(0, now, 0.08);
      };

      if (v.paused || this.muted || !v.inVehicle) {
        silence();
        return;
      }

      const archetype = v.archetype ?? 'sports';
      const entry = VEHICLE_CATALOG[archetype];
      const idleRpm = v.idleRpm ?? entry.engine.idleRpm;
      const safeRpm = Number.isFinite(v.rpm) ? Math.max(400, Math.min(11000, v.rpm)) : idleRpm;
      const safeRedline = Number.isFinite(v.redlineRpm) ? Math.max(2000, v.redlineRpm) : 7000;
      const safeThrottle = Number.isFinite(v.throttle) ? Math.max(0, Math.min(1, v.throttle)) : 0;
      const safeBackfire = Number.isFinite(v.backfirePulse) ? Math.max(0, Math.min(1, v.backfirePulse)) : 0;
      const hasTurbo = entry.audio.hasTurboWhistle;

      const frame = computeEngineAudioFrame(
        archetype,
        safeRpm,
        safeThrottle,
        v.turboBoost || 0,
        safeBackfire,
        idleRpm,
        safeRedline,
        hasTurbo,
      );
      const voice = frame.voice;

      // ---------------- ENGINE ----------------
      if (this.workletNode && this.workletGain) {
        const set = (name: string, value: number, tau = 0.03): void => {
          const param = this.workletNode?.parameters.get(name);
          param?.setTargetAtTime(value, now, tau);
        };
        set('rpm', safeRpm, 0.02);
        set('throttle', safeThrottle, 0.03);
        set('cylinders', entry.engine.cylinders, 0.2);
        set('load', frame.load, 0.04);
        set('boost', hasTurbo ? Math.max(0, v.turboBoost || 0) : 0, 0.05);
        set('overrun', safeBackfire, 0.02);
        set('openness', voice.openness, 0.1);
        set('rasp', voice.rasp, 0.1);
        set('mufflerHz', voice.mufflerCutoffHz, 0.1);
        set('pipeHz', voice.pipeResonanceHz, 0.1);
        set('intakeGain', voice.intakeGain, 0.1);
        set('turboGain', voice.turboGain, 0.1);
        set('popGain', voice.popGain, 0.1);
        set('subWeight', entry.audio.subWeight, 0.1);
        set('bankDetune', entry.audio.bankDetuneCents / 25, 0.1);
        const targetGain = 0.34 + frame.rpmFrac * 0.2 + safeThrottle * 0.16;
        this.workletGain.gain.setTargetAtTime(targetGain, now, 0.05);
        this.engineGain.gain.setTargetAtTime(0, now, 0.08);
        this.raspGain?.gain.setTargetAtTime(0, now, 0.08);
      } else {
        const cyl = entry.engine.cylinders;
        const firingHz = (safeRpm / 60) * (cyl * 0.5);
        this.engineOsc.frequency.setTargetAtTime(Math.max(28, firingHz), now, 0.03);
        this.engineHarmOsc?.frequency.setTargetAtTime(Math.max(56, firingHz * 2), now, 0.03);
        this.engineSubOsc.frequency.setTargetAtTime(Math.max(18, firingHz * 0.5), now, 0.03);
        this.engineFilter.frequency.setTargetAtTime(
          180 + frame.rpmFrac * (700 + voice.mufflerCutoffHz * 0.55) + safeThrottle * 600,
          now,
          0.04,
        );
        const targetGain = 0.13 + frame.rpmFrac * 0.1 + safeThrottle * 0.08;
        this.engineGain.gain.setTargetAtTime(targetGain, now, 0.05);
        this.raspGain?.gain.setTargetAtTime(voice.rasp * (0.03 + frame.load * 0.09), now, 0.05);
      }

      // ---------------- TURBO + BLOW-OFF ----------------
      if (this.turboOsc && this.turboGain) {
        const boostNorm = Math.max(0, Math.min(1, (v.turboBoost || 0) / 1.35));
        this.turboOsc.frequency.setTargetAtTime(1500 + boostNorm * 3200, now, 0.07);
        this.turboGain.gain.setTargetAtTime(
          hasTurbo && boostNorm > 0.1 ? boostNorm * 0.042 * voice.turboGain : 0,
          now,
          0.07,
        );
      }
      if (this.bovNoiseGain && this.bovFilter) {
        const bov = Math.max(0, Math.min(1, v.blowOffPulse || 0));
        this.bovNoiseGain.gain.setTargetAtTime(bov > 0.15 ? bov * 0.16 : 0, now, 0.02);
        this.bovFilter.frequency.setTargetAtTime(4200 - bov * 2200, now, 0.05);
      }

      // ---------------- TYRES (physics-driven, 4 wheels) ----------------
      if (v.wheels && v.wheels.length >= 4) {
        this.tyreFrame = tyreFrameFor(v.wheels, v.surfaceWetness ?? 1);
      } else {
        // Legacy scalar path: still map to the new layered model, but smoother.
        const s = Math.max(0, Math.min(1, v.skidIntensity || 0));
        this.tyreFrame.overallGain = s * s * 0.9;
        this.tyreFrame.overallScuff = Math.max(0, s - 0.25) * 0.8;
        const speedBias = Math.min(1, v.speedKph / 90);
        this.tyreFrame.dominantHz = 520 + speedBias * 900 + s * 420;
      }

      const tyre = this.tyreFrame;
      const squeal = Math.max(0, Math.min(1, tyre.overallGain));
      const scuff = Math.max(0, Math.min(1, tyre.overallScuff));
      const hz = Math.max(300, Math.min(2200, tyre.dominantHz || 700));

      if (this.tyreSqueal && this.tyreSqueal2 && this.tyreSquealGain && this.tyreSquealFilter) {
        // Two detuned partials give the rubber the "singing" beat instead of a pure tone.
        this.tyreSqueal.frequency.setTargetAtTime(hz, now, 0.03);
        this.tyreSqueal2.frequency.setTargetAtTime(hz * 1.98, now, 0.03);
        this.tyreSquealFilter.frequency.setTargetAtTime(hz * 1.35, now, 0.04);
        this.tyreSquealGain.gain.setTargetAtTime(squeal > 0.04 ? Math.min(0.2, squeal * 0.18) : 0, now, 0.035);
      }
      if (this.tyreScuffGain && this.tyreScuffFilter && this.tyreGrainGain) {
        this.tyreScuffFilter.frequency.setTargetAtTime(260 + hz * 0.34 + scuff * 380, now, 0.04);
        this.tyreScuffGain.gain.setTargetAtTime(scuff > 0.02 ? Math.min(0.26, scuff * 0.3) : 0, now, 0.04);
        // More grain as the tyre is dragged (breaks the steady-hiss feel).
        this.tyreGrainGain.gain.setTargetAtTime(0.12 + scuff * 0.5, now, 0.1);
      }
      if (this.tyreRoadGain && this.tyreRoadFilter) {
        const roadNorm = Math.max(0, Math.min(1, (v.speedKph - 8) / 150));
        this.tyreRoadGain.gain.setTargetAtTime(roadNorm * roadNorm * 0.13, now, 0.1);
        this.tyreRoadFilter.frequency.setTargetAtTime(420 + roadNorm * 1500, now, 0.1);
      }

      // ---------------- WIND ----------------
      if (this.windGain && this.windFilter) {
        const windNorm = Math.max(0, Math.min(1, (v.speedKph - 45) / 150));
        this.windGain.gain.setTargetAtTime(windNorm * windNorm * 0.16, now, 0.08);
        this.windFilter.frequency.setTargetAtTime(300 + windNorm * 900, now, 0.08);
      }

      // ---------------- NITRO + TURBO (layered, phone-speaker safe) ----------------
      // A pure sub-bass whoosh is inaudible on a phone, which is why the old effect
      // read as fake. `computeBoostAudio` splits it into hiss + jet body + whistle +
      // wastegate chuff, every one of them above ~350 Hz.
      const nitroNorm = Math.max(0, Math.min(1, ((v.turboBoost || 0) - 1.0) / 0.35));
      const boostNorm = Math.max(0, Math.min(1, (v.turboBoost || 0) / 1.35));
      const liftingOff = safeThrottle < 0.12 && (v.speedKph || 0) > 25;
      const boostFrame = computeBoostAudio(nitroNorm, boostNorm, v.speedKph || 0, liftingOff);

      if (this.nitroGain && this.nitroFilter) {
        this.nitroGain.gain.setTargetAtTime(boostFrame.hissGain, now, 0.06);
        this.nitroFilter.frequency.setTargetAtTime(boostFrame.hissHz, now, 0.08);
      }
      if (this.nitroWhooshGain && this.nitroWhooshFilter) {
        this.nitroWhooshGain.gain.setTargetAtTime(boostFrame.whooshGain, now, 0.05);
        this.nitroWhooshFilter.frequency.setTargetAtTime(boostFrame.whooshHz, now, 0.09);
      }
      if (this.chuffGain && this.chuffFilter) {
        this.chuffGain.gain.setTargetAtTime(boostFrame.chuffGain, now, 0.05);
        this.chuffFilter.frequency.setTargetAtTime(boostFrame.chuffHz, now, 0.07);
      }
      if (this.turboOsc && this.turboGain && hasTurbo) {
        // Two-partial whistle: the octave partial keeps the spin audible on a phone.
        this.turboOsc.frequency.setTargetAtTime(boostFrame.whistleHz, now, 0.05);
        this.turboOsc2?.frequency.setTargetAtTime(boostFrame.whistleHz * 2.02, now, 0.05);
        this.turboGain.gain.setTargetAtTime(boostFrame.whistleGain, now, 0.06);
      }

      // ---------------- ONE-SHOT EVENTS ----------------
      if (safeBackfire > 0.7 && voice.popGain > 0.2) {
        this.playExhaustPop(safeBackfire * voice.popGain);
      }
      if (v.blowOffPulse > 0.42 && hasTurbo) {
        this.playTurboBlowOff(v.blowOffPulse * voice.turboGain);
      }
    } catch {
      // Never allow audio driver quirks to interrupt the main render loop
    }
  }

  /** Crisp sport exhaust backfire pop / crackle on high-RPM downshifts & lift-off. */
  playExhaustPop(intensity = 0.85): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBackfireMs < 130) return;
    this.lastBackfireMs = nowMs;

    const now = this.ctx.currentTime;
    // Two-part pop: a broadband crack plus a low "thump" body → real afterfire.
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(420 + Math.random() * 320, now);
    filt.frequency.exponentialRampToValueAtTime(160, now + 0.08);
    filt.Q.value = 1.1;
    const g = this.ctx.createGain();
    const amp = Math.min(0.4, 0.16 + intensity * 0.22);
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain);
    src.start(now, Math.random() * 1.2, 0.12);

    const thump = this.ctx.createOscillator();
    const tg = this.ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, now);
    thump.frequency.exponentialRampToValueAtTime(48, now + 0.09);
    tg.gain.setValueAtTime(amp * 0.7, now);
    tg.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    thump.connect(tg);
    tg.connect(this.masterGain);
    thump.start(now);
    thump.stop(now + 0.11);
  }

  /** Turbo blow-off valve ("pssshh-tutu") flutter when lifting off boost or upshifting. */
  playTurboBlowOff(intensity = 0.7): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer || this.muted) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBlowOffMs < 210) return;
    this.lastBlowOffMs = nowMs;

    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(4600, now);
    filt.frequency.exponentialRampToValueAtTime(1500, now + 0.22);
    filt.Q.value = 2.4;
    const g = this.ctx.createGain();
    const amp = Math.min(0.2, 0.07 + intensity * 0.12);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    // Turbo flutter: amplitude wobble so it flutters rather than hisses evenly.
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'triangle';
    lfo.frequency.value = 26;
    lfoGain.gain.value = amp * 0.35;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain);
    src.start(now, Math.random() * 1.2, 0.26);
    lfo.start(now);
    lfo.stop(now + 0.26);
  }

  /** Classic dual-tone Istanbul car horn. */
  playHorn(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    for (const f of [392, 493.88]) {
      const osc = this.ctx.createOscillator();
      const filt = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f, now);
      filt.type = 'lowpass';
      filt.frequency.value = 1500;
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

  /**
   * v0.9.0 layered crash: sheet-metal gong + metallic ring + optional glass shatter.
   * `severity` is the closing speed in m/s (≈ 5 = parking bump, 25 = write-off).
   */
  playImpact(severity: number, panelKind: 'metal' | 'glass' | 'plastic' = 'metal'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const nowMs = performance.now();
    if (nowMs - this.lastImpactMs < 90) return;
    this.lastImpactMs = nowMs;

    const spec = describeImpact(severity, panelKind);
    const now = this.ctx.currentTime;

    // 1. Body gong (low sine sweep — the thud you feel)
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(spec.hz, now);
    osc.frequency.exponentialRampToValueAtTime(spec.hz * 0.45, now + spec.decaySec);
    g.gain.setValueAtTime(spec.gain * 0.34, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + spec.decaySec + 0.05);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + spec.decaySec + 0.06);

    if (this.noiseBuffer) {
      // 2. Metal crunch / glass burst
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filt = this.ctx.createBiquadFilter();
      filt.type = panelKind === 'glass' ? 'highpass' : 'bandpass';
      filt.frequency.setValueAtTime(spec.hz * (panelKind === 'glass' ? 1 : 2.4), now);
      if (panelKind === 'glass') {
        filt.frequency.exponentialRampToValueAtTime(spec.hz * 1.4, now + 0.14);
      }
      filt.Q.value = panelKind === 'glass' ? 0.7 : 3.1;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(spec.gain * 0.28, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + (panelKind === 'glass' ? 0.26 : 0.16));
      src.connect(filt);
      filt.connect(ng);
      ng.connect(this.masterGain);
      src.start(now, Math.random() * 1.5, panelKind === 'glass' ? 0.3 : 0.2);
    }

    // 3. Metallic ring (the "ching" of a bent panel)
    if (panelKind === 'metal' && severity > 6) {
      const ring = this.ctx.createOscillator();
      const ringGain = this.ctx.createGain();
      ring.type = 'sine';
      ring.frequency.setValueAtTime(1800 + Math.random() * 900, now);
      ringGain.gain.setValueAtTime(Math.min(0.09, spec.gain * 0.09), now);
      ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      ring.connect(ringGain);
      ringGain.connect(this.masterGain);
      ring.start(now);
      ring.stop(now + 0.44);
    }
  }

  /** Tyre screech one-shot for handbrake starts & wheelspin bursts. */
  playSkidBurst(intensity = 0.7): void {
    if (!this.ctx || !this.masterGain || this.muted || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.setValueAtTime(620, now);
    filt.frequency.linearRampToValueAtTime(1180, now + 0.3);
    filt.Q.value = 6.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(Math.min(0.16, intensity * 0.16), now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.masterGain);
    src.start(now, Math.random(), 0.55);
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

    // Mechanical latch noise on top of the thump
    if (this.noiseBuffer) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'highpass';
      filt.frequency.value = 2200;
      const ng = this.ctx.createGain();
      ng.gain.setValueAtTime(0.05, now);
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      src.connect(filt);
      filt.connect(ng);
      ng.connect(this.masterGain);
      src.start(now, Math.random(), 0.06);
    }
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
      this.turboOsc2?.stop();
      this.tyreSqueal?.stop();
      this.tyreSqueal2?.stop();
      this.tyreScuffSrc?.stop();
      this.tyreRoadSrc?.stop();
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

/** Thin wrapper so the call site stays readable. */
function tyreFrameFor(wheels: readonly WheelTelemetry[], wetness: number): TyreAudioFrame {
  return computeTyreFrame(wheels, wetness);
}
