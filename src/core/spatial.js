/**
 * Uniform hash grid. Entities are inserted by centre; queries are widened by the
 * largest inserted radius so big bodies are still found.
 */
export class Grid {
  constructor(cell = 110) {
    this.cell = cell;
    this.map = new Map();
    this.used = [];
    this.maxR = 0;
  }

  clear() {
    for (const a of this.used) a.length = 0;
    this.used.length = 0;
    this.maxR = 0;
  }

  insert(e) {
    const cx = Math.floor(e.x / this.cell), cy = Math.floor(e.y / this.cell);
    const k = (cx + 4096) * 8192 + (cy + 4096);
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    if (a.length === 0) this.used.push(a);
    a.push(e);
    if (e.r > this.maxR) this.maxR = e.r;
  }

  /** Fills `out` with every entity whose centre is within r + maxR of the point (coarse). */
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell, R = r + this.maxR;
    const x0 = Math.floor((x - R) / c), x1 = Math.floor((x + R) / c);
    const y0 = Math.floor((y - R) / c), y1 = Math.floor((y + R) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const a = this.map.get((cx + 4096) * 8192 + (cy + 4096));
        if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
      }
    }
    return out;
  }
}
