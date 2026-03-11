// Fixed-step simulation loop keeps gameplay deterministic and prevents frame-rate dependent physics.
export class FixedStepLoop {
  constructor({ step = 1 / 60, maxSubSteps = 5 } = {}) {
    this.step = step;
    this.maxSubSteps = maxSubSteps;
    this.accumulator = 0;
  }

  reset() {
    this.accumulator = 0;
  }

  tick(deltaSeconds, updateFixed) {
    this.accumulator += deltaSeconds;

    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSubSteps) {
      updateFixed(this.step);
      this.accumulator -= this.step;
      steps += 1;
    }

    if (steps === this.maxSubSteps && this.accumulator > this.step) {
      // Clamp runaway accumulation on very slow frames to avoid spiral of death.
      this.accumulator = this.step * 0.5;
    }

    const alpha = this.accumulator / this.step;
    return { alpha, steps };
  }
}
