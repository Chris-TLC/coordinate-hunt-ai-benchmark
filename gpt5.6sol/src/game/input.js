export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = -0.08;
    this.fireQueued = false;
    this.scanQueued = false;
    this.locked = false;
    this.onLockChange = () => {};

    window.addEventListener('keydown', (event) => {
      this.keys.add(event.code);
      if (event.code === 'KeyQ' && !event.repeat) this.scanQueued = true;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'Space'].includes(event.code)) event.preventDefault();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousemove', (event) => {
      if (!this.locked) return;
      this.yaw -= event.movementX * 0.00175;
      this.pitch -= event.movementY * 0.0016;
      this.pitch = Math.max(-1.14, Math.min(1.02, this.pitch));
    });
    window.addEventListener('mousedown', (event) => {
      if ((this.locked || event.target === this.canvas) && event.button === 0) this.fireQueued = true;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange(this.locked);
    });
  }

  requestLock() {
    const fallback = () => {
      try {
        const request = this.canvas.requestPointerLock();
        if (request?.catch) request.catch(() => {});
      } catch {
        // The game remains playable with fixed aim in browsers without Pointer Lock.
      }
    };
    try {
      const request = this.canvas.requestPointerLock({ unadjustedMovement: false });
      if (request?.catch) request.catch(fallback);
    } catch {
      fallback();
    }
  }

  movement() {
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    return { forward, strafe, sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') };
  }

  consumeFire() {
    const value = this.fireQueued;
    this.fireQueued = false;
    return value;
  }

  consumeScan() {
    const value = this.scanQueued;
    this.scanQueued = false;
    return value;
  }

  flush() {
    this.fireQueued = false;
    this.scanQueued = false;
    this.keys.clear();
  }
}
