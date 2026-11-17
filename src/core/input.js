/** Keyboard + mouse state. `pressed` holds one-shot edges that the consumer clears. */
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.autoFire = false;

    const isTyping = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');

    window.addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });

    window.addEventListener('mousemove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) this.pressed.add('MouseRight');
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  take(code) {
    if (this.pressed.has(code)) { this.pressed.delete(code); return true; }
    return false;
  }

  endFrame() { this.pressed.clear(); }

  /** Build the abstract control frame the simulation consumes. */
  frame(toWorld) {
    const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    const l = Math.hypot(mx, my);
    if (l > 0) { mx /= l; my /= l; }
    const w = toWorld(this.mouse.x, this.mouse.y);
    return {
      mx, my, ax: w.x, ay: w.y,
      fire: this.mouse.down || this.autoFire,
      dash: this.pressed.has('Space') || this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight'),
      bomb: this.pressed.has('MouseRight') || this.pressed.has('KeyE'),
    };
  }
}
