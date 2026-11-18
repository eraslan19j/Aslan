/* global AudioWorkletProcessor, registerProcessor, sampleRate */
/**
 * v0.9.0 — Layered combustion engine DSP (Istanbul Streets).
 *
 * Written from scratch for this project (no third-party code). The signal chain is
 * modelled on the physics described in Baldan et al., "Physically informed car
 * engine sound synthesis" (SIVE 2015) and the open-source MIT reference
 * `Antonio-R1/engine-sound-generator` (waveguide idea only — no code copied):
 *
 *   crank angle ──► per-cylinder exhaust blowdown pulse
 *                        │
 *                        ├─► header delay (runner length) ─┐
 *                        │                                 ├─► bank collector (soft clip)
 *                        │                                 │
 *                        │                                 └─► tailpipe waveguide
 *                        │                                        (open-end reflection)
 *                        │                                        └─► muffler LP + chamber
 *                        │
 *                        ├─► intake plenum resonance (throttle hiss + induction roar)
 *                        ├─► valvetrain clicks (broadband, rpm-locked)
 *                        └─► turbo whistle + flutter + blow-off (when boost > 0)
 *
 * Layers are summed with independent gains so a 4-cylinder diesel minibus and a
 * twin-turbo V8 are audibly different *machines*, not the same oscillator detuned.
 *
 * All parameters are k-rate (updated once per 128-sample block) except the fast
 * automations that Web Audio interpolates for us.
 */

const TABLE_SIZE = 2048;

class IstanbulEngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 900, minValue: 300, maxValue: 12000, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'cylinders', defaultValue: 6, minValue: 3, maxValue: 12, automationRate: 'k-rate' },
      { name: 'load', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'boost', defaultValue: 0, minValue: 0, maxValue: 1.5, automationRate: 'k-rate' },
      { name: 'overrun', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      // Voice character
      { name: 'openness', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'rasp', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'mufflerHz', defaultValue: 1800, minValue: 600, maxValue: 4200, automationRate: 'k-rate' },
      { name: 'pipeHz', defaultValue: 100, minValue: 45, maxValue: 220, automationRate: 'k-rate' },
      { name: 'intakeGain', defaultValue: 0.3, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'turboGain', defaultValue: 0.4, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'popGain', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'subWeight', defaultValue: 0.15, minValue: 0, maxValue: 0.5, automationRate: 'k-rate' },
      { name: 'bankDetune', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.crankPhase = 0;
    this.crankDeg = 0;

    // Exhaust: two banks (V engines) + one shared collector buffer.
    this.bankBufL = new Float32Array(2048);
    this.bankBufR = new Float32Array(2048);
    this.bankIdxL = 0;
    this.bankIdxR = 0;
    this.collector = new Float32Array(1024);
    this.collectorIdx = 0;

    // Tailpipe waveguide (fixed in *time*, not in crank degrees — that is what makes
    // the pulse train sound like a pipe rather than a synthesizer).
    this.pipeBuf = new Float32Array(TABLE_SIZE);
    this.pipeIdx = 0;
    this.pipeDelay = 200;

    // Muffler chamber resonators (3 parallel band-pass biquads implemented by hand
    // so we stay allocation-free from the audio thread).
    this.chamber1 = 0;
    this.chamber2 = 0;
    this.chamber1V = 0;
    this.chamber2V = 0;

    // One-pole filters
    this.mufflerLp = 0;
    this.mufflerLp2 = 0;
    this.subLp = 0;
    this.intakeLp = 0;
    this.intakeRes = 0;
    this.raspLp = 0;
    this.hpState = 0;

    // Turbo shaft model (spool lag is what makes a turbo *sound* like a turbo)
    this.turboShaft = 0;
    this.turboPhase = 0;
    this.blowOffEnv = 0;
    this.bovPhase = 0;
    this.wastegateEnv = 0;

    // Crank/valvetrain clicks
    this.clickEnv = 0;
    this.clickDecay = 0;

    // Noise RNG (xorshift32 — deterministic and fast)
    this.noiseSeed = 0x9e3779b9;

    // Overrun pop scheduling
    this.popTimer = 0;
    this.popEnv = 0;
    this.popBand = 0;

    // Per-cylinder accumulators
    this.cylPhase = new Float32Array(12);
    this.cylGain = new Float32Array(12);
    this.cylBank = new Uint8Array(12);

    // Smoothed parameters (avoid zipper noise between k-rate blocks)
    this.smRpm = 900;
    this.smLoad = 0;
    this.smThrottle = 0;
    this.smBoost = 0;
    this.smCyl = 6;
    this.smOpenness = 0.5;
    this.smRasp = 0.3;
    this.smMufflerHz = 1800;
    this.smPipeHz = 100;
    this.smIntake = 0.3;
    this.smTurbo = 0.4;
    this.smPop = 0.5;
    this.smSub = 0.15;
    this.smDetune = 0.5;
    this.prevThrottle = 0;

    this.firingOrderSet = false;
  }

  fastNoise() {
    let x = this.noiseSeed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noiseSeed = x >>> 0;
    return ((this.noiseSeed & 0xffff) / 32767.5) - 1.0;
  }

  /** Builds evenly-spaced (or split) firing angles over a 720° cycle for each cylinder. */
  configureFiring(cyl) {
    const n = Math.max(3, Math.min(12, Math.round(cyl)));
    if (this.firingOrderSet && this.cylCount === n) return;
    this.cylCount = n;
    // Even-fire engine: one firing every 720/n crank degrees.
    // Odd cylinder counts on V engines keep the same even spacing (that is why a
    // straight-6 is silky and a V6 with split pins growls — we approximate with a
    // tiny alternating trim in `cylGain`).
    for (let i = 0; i < n; i += 1) {
      this.cylPhase[i] = (i * 720) / n;
      this.cylGain[i] = i % 2 === 0 ? 1.0 : 0.94;
      this.cylBank[i] = i % 2;
    }
    this.firingOrderSet = true;
  }

  /** Adds one exhaust blowdown pulse for a fired cylinder into the right bank buffer. */
  pushExhaustPulse(bank, strength, flow) {
    const buf = bank === 0 ? this.bankBufL : this.bankBufR;
    const idx = bank === 0 ? this.bankIdxL : this.bankIdxR;
    // Blowdown: steep rise, exponential decay, turbulent noise on the tail.
    buf[idx] = strength * (0.85 + this.fastNoise() * 0.15) + flow;
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0]?.[0];
    if (!out) return true;
    const len = out.length;

    const p = (name, fallback) => {
      const v = parameters[name];
      return v && v.length > 0 ? v[0] : fallback;
    };

    const tRpm = p('rpm', 900);
    const tThrottle = p('throttle', 0);
    const tCyl = p('cylinders', 6);
    const tLoad = p('load', tThrottle);
    const tBoost = p('boost', 0);
    const tOverrun = p('overrun', 0);
    const tOpen = p('openness', 0.5);
    const tRasp = p('rasp', 0.3);
    const tMuffler = p('mufflerHz', 1800);
    const tPipe = p('pipeHz', 100);
    const tIntake = p('intakeGain', 0.3);
    const tTurbo = p('turboGain', 0.4);
    const tPop = p('popGain', 0.5);
    const tSub = p('subWeight', 0.15);
    const tDetune = p('bankDetune', 0.5);

    this.configureFiring(tCyl);

    // Block-rate smoothing (~5 ms) keeps everything click-free.
    const k = 0.22;
    this.smRpm += (tRpm - this.smRpm) * k;
    this.smThrottle += (tThrottle - this.smThrottle) * 0.3;
    this.smLoad += (tLoad - this.smLoad) * 0.25;
    this.smBoost += (tBoost - this.smBoost) * 0.12;
    this.smOpenness += (tOpen - this.smOpenness) * 0.08;
    this.smRasp += (tRasp - this.smRasp) * 0.08;
    this.smMufflerHz += (tMuffler - this.smMufflerHz) * 0.08;
    this.smPipeHz += (tPipe - this.smPipeHz) * 0.08;
    this.smIntake += (tIntake - this.smIntake) * 0.08;
    this.smTurbo += (tTurbo - this.smTurbo) * 0.08;
    this.smPop += (tPop - this.smPop) * 0.08;
    this.smSub += (tSub - this.smSub) * 0.08;
    this.smDetune += (tDetune - this.smDetune) * 0.08;

    // ---- Turbo shaft: first-order spool lag, this is the "whistle" generator ----
    const boostTarget = Math.max(0, Math.min(1.4, this.smBoost));
    const spoolRate = boostTarget > this.turboShaft ? 0.00042 : 0.0016;
    this.turboShaft += (boostTarget - this.turboShaft) * spoolRate * len;

    // Blow-off valve fires when the throttle snaps shut while boost is still high.
    const liftedOff = this.prevThrottle > 0.55 && this.smThrottle < 0.12;
    if (liftedOff && this.turboShaft > 0.22) {
      this.blowOffEnv = Math.min(1, 0.55 + this.turboShaft);
      this.turboShaft *= 0.55;
    }
    this.prevThrottle = this.smThrottle;
    this.blowOffEnv *= Math.exp(-len / (sampleRate * 0.16));
    this.wastegateEnv += ((this.turboShaft > 0.9 ? 1 : 0) - this.wastegateEnv) * 0.05;

    // ---- Muffler / pipe coefficients (recomputed per block) ----
    const openDb = 0.55 + this.smOpenness * 0.45;
    const mufflerCut = this.smMufflerHz * (0.82 + this.smLoad * 0.55) * openDb;
    const mufflerAlpha = Math.min(0.92, (2 * Math.PI * mufflerCut) / (sampleRate + 2 * Math.PI * mufflerCut));
    const pipeDelay = Math.max(
      48,
      Math.min(TABLE_SIZE - 8, Math.round(sampleRate / Math.max(55, this.smPipeHz * 2.1))),
    );
    this.pipeDelay = pipeDelay;

    const crankPerSample = (this.smRpm * 6) / sampleRate; // degrees per sample
    const n = this.cylCount;

    // Chamber resonance coefficients (muffler body: two coupled resonances)
    const res1 = 2 * Math.sin((2 * Math.PI * this.smPipeHz * 2.07) / sampleRate);
    const res2 = 2 * Math.sin((2 * Math.PI * this.smPipeHz * 3.61) / sampleRate);
    const res1Damp = 0.9965;
    const res2Damp = 0.994;

    const intakeAlpha = Math.min(0.9, (2 * Math.PI * (620 + this.smRpm * 0.22)) / (sampleRate + 2 * Math.PI * 620));
    const raspAlpha = Math.min(0.8, (2 * Math.PI * (1500 + this.smRpm * 0.5)) / (sampleRate + 2 * Math.PI * 1500));
    const subAlpha = 0.012;

    // Valvetrain click rate: 2 valve events per firing (in + ex)
    const clickHz = (this.smRpm / 60) * n;
    const clickInc = clickHz / sampleRate;

    this.clickAcc = this.clickEnv > 0 ? 1 : 0;
    this.clickEnv *= Math.exp(-len / (sampleRate * 0.008));

    // Overrun pop scheduling
    const overrunActive = tOverrun > 0.12 || (this.smThrottle < 0.05 && this.smRpm > 2200);
    if (overrunActive) {
      this.popTimer -= len / sampleRate;
      if (this.popTimer <= 0) {
        const revBias = Math.min(1, this.smRpm / 7000);
        this.popTimer = 0.035 + Math.random() * (0.26 - revBias * 0.18);
        this.popEnv = Math.min(1, 0.35 + revBias * 0.75) * (0.35 + tOverrun * 0.9);
        this.popBand = 120 + Math.random() * 380;
      }
    }
    this.popEnv *= Math.exp(-len / (sampleRate * 0.045));

    let lfoPhase = this.bovPhase;

    for (let i = 0; i < len; i += 1) {
      // ---------------- CRANK ----------------
      this.crankDeg += crankPerSample;
      if (this.crankDeg >= 720) this.crankDeg -= 720;

      // ---------------- EXHAUST PULSE TRAIN ----------------
      // Each cylinder contributes an exponential blowdown burst while it is inside
      // its exhaust window (crank angle offsets 0..~120° after firing).
      let pulseL = 0;
      let pulseR = 0;
      for (let c = 0; c < n; c += 1) {
        let delta = this.crankDeg - this.cylPhase[c];
        if (delta < 0) delta += 720;
        if (delta < 96) {
          // blowdown: very fast attack, ~35° decay, then the exhaust stroke tail
          const blowdown = Math.exp(-delta / 9.5);
          const tail = delta > 30 ? Math.exp(-(delta - 30) / 46) * 0.34 : 0;
          const shape = (blowdown + tail) * this.cylGain[c] * (0.55 + this.smLoad * 0.9);
          const bank = this.cylBank[c];
          // Bank detune gives the V-engine burble (each bank fires unevenly).
          const detune = bank === 0 ? 1 + this.smDetune * 0.006 : 1 - this.smDetune * 0.006;
          if (bank === 0) pulseL += shape * detune;
          else pulseR += shape / detune;
        }
      }

      // Turbulent flow noise riding the pulse train (grows with load)
      const flowNoise = this.fastNoise() * (0.02 + this.smLoad * 0.075);

      // ---------------- BANK COLLECTORS ----------------
      // Short feedback comb per bank = header runner resonance.
      const bL = this.bankBufL;
      const bR = this.bankBufR;
      const runnerDelayL = 22 + Math.round(this.smRpm * 0.004);
      const runnerDelayR = 26 + Math.round(this.smRpm * 0.004);
      const readL = (this.bankIdxL - runnerDelayL) & 2047;
      const readR = (this.bankIdxR - runnerDelayR) & 2047;
      const reflL = bL[readL] * 0.62;
      const reflR = bR[readR] * 0.62;
      const collL = Math.tanh((pulseL + reflL + flowNoise) * (1.0 + this.smLoad * 1.35));
      const collR = Math.tanh((pulseR + reflR + flowNoise) * (1.0 + this.smLoad * 1.35));
      bL[this.bankIdxL] = collL;
      bR[this.bankIdxR] = collR;
      this.bankIdxL = (this.bankIdxL + 1) & 2047;
      this.bankIdxR = (this.bankIdxR + 1) & 2047;

      const collector = (collL + collR) * 0.85;

      // ---------------- TAILPIPE WAVEGUIDE (fixed in time) ----------------
      const pipeMask = TABLE_SIZE - 1;
      const readPipe = (this.pipeIdx - this.pipeDelay) & pipeMask;
      const reflected = -this.pipeBuf[readPipe]; // open end reflects inverted
      const pipeIn = collector + reflected * 0.44;
      this.pipeBuf[this.pipeIdx] = pipeIn;
      this.pipeIdx = (this.pipeIdx + 1) & pipeMask;

      // ---------------- MUFFLER ----------------
      this.mufflerLp += (pipeIn - this.mufflerLp) * mufflerAlpha;
      this.mufflerLp2 += (this.mufflerLp - this.mufflerLp2) * mufflerAlpha;

      // Coupled chamber resonators (the "body" of the note)
      this.chamber1V += (pipeIn - this.chamber1) * res1 - this.chamber1V * (1 - res1Damp) * 0.9;
      this.chamber1 += this.chamber1V;
      this.chamber2V += (pipeIn - this.chamber2) * res2 - this.chamber2V * (1 - res2Damp) * 0.9;
      this.chamber2 += this.chamber2V;

      const chambered = this.chamber1 * 0.16 + this.chamber2 * 0.1;

      this.subLp += (this.mufflerLp2 - this.subLp) * subAlpha;

      // ---------------- INTAKE ----------------
      const intakeSource = collector * (0.35 + this.smLoad * 0.65);
      this.intakeLp += (intakeSource - this.intakeLp) * intakeAlpha;
      // Helmholtz resonance ring on the plenum
      this.intakeRes += (this.intakeLp - this.intakeRes) * 0.18;
      const intakeAir = this.fastNoise() * 0.12 * this.smLoad * this.smIntake;
      const intake = (this.intakeLp - this.intakeRes) * 0.7 + intakeAir;

      // ---------------- MECHANICAL (valvetrain clicks + timing whine) ----------------
      this.clickAcc += clickInc;
      let clicks = 0;
      if (this.clickAcc >= 1) {
        this.clickAcc -= 1;
        clicks = (this.fastNoise() > 0 ? 1 : -1) * 0.55;
      }
      this.clickEnv = Math.abs(clicks) > 0 ? 1 : this.clickEnv * 0.985;
      const mechanical = clicks * 0.1 + this.clickEnv * this.fastNoise() * 0.03;

      // ---------------- TURBO ----------------
      // Whistle: frequency follows the shaft, amplitude follows boost.
      const shaftHz = 1400 + this.turboShaft * 5200;
      this.turboPhase += (2 * Math.PI * shaftHz) / sampleRate;
      if (this.turboPhase > Math.PI * 2) this.turboPhase -= Math.PI * 2;
      const whistle = Math.sin(this.turboPhase) * this.turboShaft * 0.085 * this.smTurbo;

      // Compressor flutter near surge (a little "chuff-chuff" under partial boost)
      lfoPhase += 42 / sampleRate;
      if (lfoPhase > Math.PI * 2) lfoPhase -= Math.PI * 2;
      const flutterGain = Math.max(0, 1 - Math.abs(this.turboShaft - 0.55) * 3.4);
      const flutter =
        this.fastNoise() * 0.5 * (1 - Math.abs(Math.sin(lfoPhase * 4))) * flutterGain * 0.09 * this.smTurbo;

      // Blow-off valve: band-limited noise burst sweeping down in pitch
      this.bovPhase += 1;
      const bovFreq = 4200 - Math.min(2600, this.blowOffEnv * 2400);
      const bov = this.fastNoise() * this.blowOffEnv * 0.3 * (0.55 + 0.45 * Math.sin(this.bovPhase * 0.7)) *
        (bovFreq / 4200);

      // Wastegate bleed at sustained max boost
      const wastegate = this.fastNoise() * this.wastegateEnv * 0.03 * this.smTurbo;

      // ---------------- OVERRUN POPS ----------------
      let pop = 0;
      if (this.popEnv > 0.01) {
        const bandNoise = this.fastNoise();
        this.popBand = this.popBand * 0.995 + 1;
        // Crunchy exponential decay with a metallic edge
        pop = bandNoise * this.popEnv * 0.5 * (1 + Math.sin(this.popBand * 0.031));
      }

      // ---------------- MIX ----------------
      const exhaust =
        this.mufflerLp2 * (0.55 + this.smOpenness * 0.55) + chambered * (0.8 + this.smRasp * 0.6);
      const rasp = (exhaust - this.raspLp) * this.smRasp * 0.9;
      this.raspLp += (exhaust - this.raspLp) * raspAlpha;

      const popFinal = pop * this.smPop;
      const sub = this.subLp * this.smSub * 4.2;

      const sample =
        (exhaust * 0.34 + rasp + sub + intake * 0.5 + mechanical * 0.5 +
          whistle + flutter + bov + wastegate + popFinal) *
        0.62;

      // Gentle master soft-clip: keeps transients punchy without ever clipping.
      out[i] = Math.tanh(sample * 1.25) * 0.82;
    }

    this.bovPhase = this.bovPhase % (Math.PI * 2);
    return true;
  }
}

registerProcessor('istanbul-engine-processor', IstanbulEngineProcessor);
