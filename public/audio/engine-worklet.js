/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// Physically-informed procedural combustion engine AudioWorklet DSP.
// Synthesizes multi-cylinder firing impulses, exhaust waveguide resonance,
// throttle-load harmonic saturation, and overrun exhaust crackles in real time.
class IstanbulEngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 950, minValue: 500, maxValue: 9500, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'cylinders', defaultValue: 6, minValue: 4, maxValue: 8, automationRate: 'k-rate' },
      { name: 'backfire', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.crankPhase = 0;
    this.exhaustBuf = new Float32Array(128);
    this.exhaustIdx = 0;
    this.lpState = 0;
    this.subLpState = 0;
    this.noiseSeed = 0x1234567;
  }

  fastNoise() {
    let x = this.noiseSeed;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noiseSeed = x >>> 0;
    return ((this.noiseSeed & 0xffff) / 32767.5) - 1.0;
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0]?.[0];
    if (!out) return true;

    const rpm = parameters.rpm[0] || 950;
    const throttle = parameters.throttle[0] || 0;
    const cyl = Math.round(parameters.cylinders[0] || 6);
    const backfire = parameters.backfire[0] || 0;

    // 4-stroke firing frequency = (RPM / 60) * (cylinders / 2)
    const firingHz = (rpm / 60) * (cyl * 0.5);
    const phaseInc = firingHz / sampleRate;

    // Short exhaust waveguide delay length scales subtly with exhaust gas velocity
    const delaySamples = Math.max(16, Math.min(115, Math.floor(sampleRate / Math.max(180, firingHz * 2.1))));
    const cutoffHz = 210 + rpm * 0.24 + throttle * 980;
    const lpAlpha = Math.min(0.85, (2 * Math.PI * cutoffHz) / (sampleRate + 2 * Math.PI * cutoffHz));
    const subAlpha = 0.04;

    const len = out.length;
    const buf = this.exhaustBuf;
    const mask = buf.length - 1;

    for (let i = 0; i < len; i += 1) {
      this.crankPhase += phaseInc;
      if (this.crankPhase >= 1.0) this.crankPhase -= 1.0;

      const p = this.crankPhase;
      // Asymmetric combustion pressure pulse + intake/valve harmonics
      const pulse =
        Math.sin(p * Math.PI * 2) * 0.55 +
        Math.sin(p * Math.PI * 4 + 0.4) * (0.28 + throttle * 0.24) +
        Math.sin(p * Math.PI * 6 + 0.9) * (0.14 + throttle * 0.22) +
        Math.sin(p * Math.PI * 1.0) * 0.32; // half-order rumble

      // Combustion intake roar noise scaled by throttle load
      const roar = this.fastNoise() * (0.04 + throttle * 0.14);

      // Overrun exhaust pop impulse burst
      const pop = backfire > 0.2 ? this.fastNoise() * backfire * 0.65 : 0;

      const excited = pulse * (0.52 + throttle * 0.68) + roar + pop;

      // Exhaust pipe waveguide reflection feedback
      const readIdx = (this.exhaustIdx - delaySamples) & mask;
      const reflected = buf[readIdx];
      const wave = Math.tanh((excited + reflected * (0.42 + throttle * 0.12)) * (1.1 + throttle * 0.85));
      buf[this.exhaustIdx] = wave;
      this.exhaustIdx = (this.exhaustIdx + 1) & mask;

      // Muffler lowpass + warm low-end cabinet body
      this.lpState += (wave - this.lpState) * lpAlpha;
      this.subLpState += (wave - this.subLpState) * subAlpha;

      out[i] = (this.lpState * 0.72 + this.subLpState * 0.42) * 0.48;
    }

    return true;
  }
}

registerProcessor('istanbul-engine-processor', IstanbulEngineProcessor);
