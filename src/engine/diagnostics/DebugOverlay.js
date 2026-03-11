export class DebugOverlay {
  constructor(parent) {
    this.parent = parent;
    this.enabled = true;

    this.frameCount = 0;
    this.elapsed = 0;
    this.fps = 0;
    this.avgMs = 0;

    this.el = document.createElement('div');
    this.el.className = 'debug-overlay';
    this.el.textContent = 'FPS -- | MS -- | DC -- | TRI -- | MEM --';
    this.parent.appendChild(this.el);
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.el.style.display = enabled ? 'block' : 'none';
  }

  update(dt, renderer) {
    if (!this.enabled) return;

    this.frameCount += 1;
    this.elapsed += dt;
    this.avgMs = this.avgMs * 0.9 + dt * 1000 * 0.1;

    if (this.elapsed >= 0.5) {
      this.fps = Math.round(this.frameCount / this.elapsed);
      this.frameCount = 0;
      this.elapsed = 0;

      const drawCalls = renderer.info.render.calls;
      const tris = renderer.info.render.triangles;
      const memoryMb = performance?.memory?.usedJSHeapSize
        ? `${(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1)}MB`
        : 'n/a';

      this.el.textContent = `FPS ${this.fps} | MS ${this.avgMs.toFixed(2)} | DC ${drawCalls} | TRI ${tris} | MEM ${memoryMb}`;
    }
  }
}
