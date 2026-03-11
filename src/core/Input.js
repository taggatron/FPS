export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDelta = { x: 0, y: 0 };
    this.mouseButtons = new Set();
    this.wheel = 0;

    this._onKeyDown = (e) => this.keys.add(e.code);
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      this.mouseDelta.x += e.movementX;
      this.mouseDelta.y += e.movementY;
    };
    this._onMouseDown = (e) => this.mouseButtons.add(e.button);
    this._onMouseUp = (e) => this.mouseButtons.delete(e.button);
    this._onWheel = (e) => {
      this.wheel += Math.sign(e.deltaY);
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
  }

  isDown(code) {
    return this.keys.has(code);
  }

  isMouseDown(button = 0) {
    return this.mouseButtons.has(button);
  }

  consumeMouseDelta() {
    const d = { ...this.mouseDelta };
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    return d;
  }

  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
  }
}