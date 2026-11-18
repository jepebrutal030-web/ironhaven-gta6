// Keyboard + mouse input. Tracks held keys, pointer-lock mouse look, and a
// virtual-key injection used by shot staging (holds W for drive shots).
export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.locked = false;
    this.virtual = new Set(); // keys held by staging/autopilot
    this._onKeyDown = (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (this._keyCb) this._keyCb(e.code);
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
      else if (this._dragging) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    };
    this._onMouseDown = (e) => {
      if (e.button === 0 && this._clickCb) this._clickCb();
      if (e.button === 0) this._dragging = true;
    };
    this._onMouseUp = (e) => { if (e.button === 0) this._dragging = false; };
    this._onLockChange = () => { this.locked = document.pointerLockElement === this._canvas; };
    this._keyCb = null; this._clickCb = null; this._dragging = false; this._canvas = null;
  }
  attach(canvas, { onKey, onClick } = {}) {
    this._canvas = canvas; this._keyCb = onKey || null; this._clickCb = onClick || null;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }
  down(code) { return this.keys.has(code) || this.virtual.has(code); }
  // WASD as axes: x = strafe right, y = forward.
  axes() {
    let x = 0, y = 0;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    return { x, y };
  }
  consumeMouse() { const d = { dx: this.mouseDX, dy: this.mouseDY }; this.mouseDX = 0; this.mouseDY = 0; return d; }
  lockPointer() {
    try { this._canvas?.requestPointerLock?.(); } catch { /* pointer lock unavailable */ }
  }
  unlockPointer() { try { document.exitPointerLock?.(); } catch { /* ignore */ } }
  holdVirtual(code) { this.virtual.add(code); }
  clearVirtual() { this.virtual.clear(); }
}
