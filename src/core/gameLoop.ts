export interface FixedStepResult {
  steps: number;
  alpha: number;
  clampedDt: number;
}

/**
 * Pure fixed-timestep simulation accumulator.
 * Prevents physics explosion after tab switches or frame hitches by clamping raw dt.
 */
export class FixedStepClock {
  readonly fixedDt: number;
  readonly maxFrameDt: number;
  readonly maxStepsPerFrame: number;
  private accumulator = 0;

  constructor(fixedHz = 60, maxFrameDt = 0.1, maxStepsPerFrame = 6) {
    if (fixedHz <= 0) throw new Error('fixedHz must be positive');
    this.fixedDt = 1 / fixedHz;
    this.maxFrameDt = maxFrameDt;
    this.maxStepsPerFrame = maxStepsPerFrame;
  }

  advance(rawDtSeconds: number, onStep: (dt: number) => void): FixedStepResult {
    const safeDt = Number.isFinite(rawDtSeconds) && rawDtSeconds > 0 ? rawDtSeconds : 0;
    const clampedDt = Math.min(safeDt, this.maxFrameDt);
    this.accumulator += clampedDt;

    let steps = 0;
    while (this.accumulator >= this.fixedDt && steps < this.maxStepsPerFrame) {
      onStep(this.fixedDt);
      this.accumulator -= this.fixedDt;
      steps += 1;
    }

    if (steps >= this.maxStepsPerFrame && this.accumulator > this.fixedDt) {
      // Drop spiral-of-death backlog cleanly rather than freezing the browser.
      this.accumulator = 0;
    }

    return {
      steps,
      alpha: this.accumulator / this.fixedDt,
      clampedDt,
    };
  }

  reset(): void {
    this.accumulator = 0;
  }
}
