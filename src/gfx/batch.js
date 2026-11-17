// Instanced shape batch: every glowing thing on screen goes through one draw call.

export const SHAPE = {
  circle: 0, heart: 2, ngon: 3, star: 4, capsule: 5, box: 6, arc: 7,
  crescent: 8, glow: 9, glyph: 10, broken: 11, plus: 12, chevron: 13,
};

const STRIDE = 16;

export class Batch {
  constructor(gl, max = 36000) {
    this.gl = gl;
    this.max = max;
    this.data = new Float32Array(max * STRIDE);
    this.n = 0;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    for (let i = 0; i < 4; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, STRIDE * 4, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);
  }

  begin() { this.n = 0; }

  /**
   * Low-level push. col is [r,g,b]; line = half stroke width (world units),
   * fill = interior brightness, glow = outer halo strength, occ = how much the
   * shape hides what is behind it.
   */
  push(shape, x, y, w, h, rot, col, a, line, fill, glow, p3 = 0, occ = 0, extra = 0) {
    if (this.n >= this.max) return;
    const d = this.data, o = this.n++ * STRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h;
    d[o + 4] = rot; d[o + 5] = shape; d[o + 6] = occ; d[o + 7] = extra;
    d[o + 8] = col[0]; d[o + 9] = col[1]; d[o + 10] = col[2]; d[o + 11] = a;
    d[o + 12] = line; d[o + 13] = fill; d[o + 14] = glow; d[o + 15] = p3;
  }

  // ---- convenience shapes -------------------------------------------------
  circle(x, y, r, col, a = 1, line = 2, fill = 0.25, glow = 1, occ = 0.8) {
    this.push(SHAPE.circle, x, y, r, r, 0, col, a, line, fill, glow, 0, occ);
  }
  ring(x, y, r, col, a = 1, line = 2, glow = 1) {
    this.push(SHAPE.circle, x, y, r, r, 0, col, a, line, 0, glow, 0, 0);
  }
  heart(x, y, r, rot, col, a = 1, line = 2, fill = 0.35, glow = 1, occ = 0.8) {
    this.push(SHAPE.heart, x, y, r, r, rot, col, a, line, fill, glow, 0, occ);
  }
  broken(x, y, r, rot, col, a = 1, line = 2, fill = 0.35, glow = 1, occ = 0.8) {
    this.push(SHAPE.broken, x, y, r, r, rot, col, a, line, fill, glow, 0, occ);
  }
  ngon(x, y, r, sides, rot, col, a = 1, line = 2, fill = 0.25, glow = 1, occ = 0.8) {
    this.push(SHAPE.ngon, x, y, r, r, rot, col, a, line, fill, glow, sides, occ);
  }
  star(x, y, r, points, rot, col, a = 1, line = 2, fill = 0.25, glow = 1, occ = 0.8, inner = 0.45) {
    this.push(SHAPE.star, x, y, r, r, rot, col, a, line, fill, glow, points, occ, inner);
  }
  box(x, y, w, h, rot, col, a = 1, line = 2, fill = 0.25, glow = 1, occ = 0.8, round = 0) {
    this.push(SHAPE.box, x, y, w, h, rot, col, a, line, fill, glow, round, occ);
  }
  crescent(x, y, r, rot, col, a = 1, line = 2, fill = 0.25, glow = 1, occ = 0.6) {
    this.push(SHAPE.crescent, x, y, r, r, rot, col, a, line, fill, glow, 0, occ);
  }
  plus(x, y, r, rot, col, a = 1, line = 2, fill = 0.4, glow = 1, occ = 0.8) {
    this.push(SHAPE.plus, x, y, r, r, rot, col, a, line, fill, glow, 0, occ);
  }
  chevron(x, y, r, rot, col, a = 1, line = 2, fill = 0.25, glow = 1, occ = 0.8) {
    this.push(SHAPE.chevron, x, y, r, r, rot, col, a, line, fill, glow, 0, occ);
  }
  /** Arc centred on `rot`, covering ±half radians, stroke half-width `w`. */
  arc(x, y, r, rot, half, w, col, a = 1, glow = 1) {
    this.push(SHAPE.arc, x, y, r, r, rot, col, a, 0, 1, glow, half, 0, w);
  }
  /** Solid glowing line segment. */
  line(x1, y1, x2, y2, w, col, a = 1, glow = 1) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    this.push(SHAPE.capsule, (x1 + x2) / 2, (y1 + y2) / 2, len / 2 + w, w, Math.atan2(dy, dx), col, a, 0, 1, glow, 0, 0);
  }
  /** Additive soft blob, optionally stretched along `rot`. */
  glow(x, y, w, h, rot, col, a = 1) {
    this.push(SHAPE.glow, x, y, w, h, rot, col, a, 0, 0, 0);
  }
  glyph(x, y, w, h, col, a, u0, v0, u1, v1, occ = 0) {
    if (this.n >= this.max) return;
    const d = this.data, o = this.n++ * STRIDE;
    d[o] = x; d[o + 1] = y; d[o + 2] = w; d[o + 3] = h;
    d[o + 4] = 0; d[o + 5] = SHAPE.glyph; d[o + 6] = occ; d[o + 7] = 0;
    d[o + 8] = col[0]; d[o + 9] = col[1]; d[o + 10] = col[2]; d[o + 11] = a;
    d[o + 12] = u0; d[o + 13] = v0; d[o + 14] = u1; d[o + 15] = v1;
  }

  flush() {
    if (!this.n) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * STRIDE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
    gl.bindVertexArray(null);
  }
}
