// Runtime glyph atlas for in-world text (damage numbers, callouts).

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-!x.%♥ ';
const COLS = 10, CELL = 64;

export class Glyphs {
  constructor(gl) {
    const rows = Math.ceil(CHARS.length / COLS);
    const cv = document.createElement('canvas');
    cv.width = COLS * CELL;
    cv.height = rows * CELL;
    const c = cv.getContext('2d');
    c.font = `900 ${CELL * 0.72}px "Trebuchet MS", "Segoe UI", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#fff';
    this.map = new Map();
    this.adv = new Map();
    for (let i = 0; i < CHARS.length; i++) {
      const ch = CHARS[i];
      const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
      c.fillText(ch, cx + CELL / 2, cy + CELL / 2 + 2);
      this.map.set(ch, [cx / cv.width, cy / cv.height, (cx + CELL) / cv.width, (cy + CELL) / cv.height]);
      this.adv.set(ch, Math.max(0.3, Math.min(1, c.measureText(ch).width / CELL + 0.06)));
    }
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** Draw centred text; size is the glyph cell half-height in world units. */
  draw(batch, str, x, y, size, col, a = 1) {
    let width = 0;
    for (const ch of str) width += (this.adv.get(ch) ?? 0.6) * size * 2;
    let cx = x - width / 2;
    for (const ch of str) {
      const adv = (this.adv.get(ch) ?? 0.6) * size * 2;
      const uv = this.map.get(ch);
      if (uv && ch !== ' ') batch.glyph(cx + adv / 2, y, size, size, col, a, uv[0], uv[1], uv[2], uv[3], 0.6);
      cx += adv;
    }
  }
}
