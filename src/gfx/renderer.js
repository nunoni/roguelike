// Frame orchestration: background -> instanced shapes -> bloom chain -> composite.

import { createProgram, createTarget, destroyTarget } from './gl.js';
import { FULLSCREEN_VS, SHAPE_VS, SHAPE_FS, BG_FS, DOWN_FS, UP_FS, COMPOSITE_FS } from './shaders.js';
import { Batch } from './batch.js';
import { Glyphs } from './glyphs.js';
import { QUALITY, VIEW_H } from '../config.js';

export class Renderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve,
    });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));

    this.pShape = createProgram(gl, SHAPE_VS, SHAPE_FS, 'shape');
    this.pBg = createProgram(gl, FULLSCREEN_VS, BG_FS, 'background');
    this.pDown = createProgram(gl, FULLSCREEN_VS, DOWN_FS, 'bloom down');
    this.pUp = createProgram(gl, FULLSCREEN_VS, UP_FS, 'bloom up');
    this.pComp = createProgram(gl, FULLSCREEN_VS, COMPOSITE_FS, 'composite');

    this.batch = new Batch(gl);
    this.glyphs = new Glyphs(gl);
    this.emptyVao = gl.createVertexArray();

    this.quality = QUALITY.high;
    this.scene = null;
    this.mips = [];
    this.w = 0; this.h = 0;
    this.viewHalf = { x: VIEW_H * 0.5 * (16 / 9), y: VIEW_H * 0.5 };

    this._ripple = new Float32Array(32);
    this._well = new Float32Array(16);
    this._shock = new Float32Array(32);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  setQuality(name) {
    this.quality = QUALITY[name] || QUALITY.high;
    this.w = 0; // force target rebuild
  }

  resize() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.quality.scale;
    const cw = Math.max(2, Math.round(this.canvas.clientWidth * dpr));
    const ch = Math.max(2, Math.round(this.canvas.clientHeight * dpr));
    this.viewHalf.y = VIEW_H * 0.5;
    this.viewHalf.x = VIEW_H * 0.5 * (cw / ch);
    if (cw === this.w && ch === this.h) return;
    this.w = cw; this.h = ch;
    this.canvas.width = cw; this.canvas.height = ch;

    destroyTarget(gl, this.scene);
    for (const m of this.mips) destroyTarget(gl, m);
    this.scene = createTarget(gl, cw, ch, this.hdr);
    if (!this.scene.ok && this.hdr) {       // extension lied: fall back to 8-bit
      this.hdr = false;
      destroyTarget(gl, this.scene);
      this.scene = createTarget(gl, cw, ch, false);
    }
    this.mips = [];
    let w = cw, h = ch;
    for (let i = 0; i < this.quality.bloom; i++) {
      w = Math.max(2, w >> 1); h = Math.max(2, h >> 1);
      this.mips.push(createTarget(gl, w, h, this.hdr));
      if (w <= 4 || h <= 4) break;
    }
  }

  /** Convert a client-space pixel position into world coordinates. */
  toWorld(cam, mx, my) {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((mx - r.left) / r.width) * 2 - 1;
    const ny = ((my - r.top) / r.height) * 2 - 1;
    return { x: cam.x + nx * this.viewHalf.x, y: cam.y + ny * this.viewHalf.y };
  }

  /**
   * frame: { cam, time, sector, fx, wells[], ring, danger, fade, draw(batch, glyphs) }
   */
  render(frame) {
    const gl = this.gl;
    this.resize();
    const vh = this.viewHalf;
    const fx = frame.fx;
    const camX = frame.cam.x + (fx ? fx.shakeX : 0), camY = frame.cam.y + (fx ? fx.shakeY : 0);
    const sec = frame.sector;

    // ---- scene pass
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.disable(gl.BLEND);

    const rp = this._ripple, sh = this._shock;
    rp.fill(0); sh.fill(0);
    const shocks = fx ? fx.shocks : [];
    for (let i = 0; i < Math.min(8, shocks.length); i++) {
      const s = shocks[i];
      const t = 1 - s.life / s.max;
      const e = 1 - Math.pow(1 - t, 2.2);
      const radius = s.radius * e, amp = s.amp * (1 - t);
      rp[i * 4] = s.x; rp[i * 4 + 1] = s.y; rp[i * 4 + 2] = radius; rp[i * 4 + 3] = amp;
      sh[i * 4] = ((s.x - camX) / vh.x) * 0.5 + 0.5;
      sh[i * 4 + 1] = (-(s.y - camY) / vh.y) * 0.5 + 0.5;
      sh[i * 4 + 2] = radius / (2 * vh.y);
      sh[i * 4 + 3] = amp * 0.03;
    }
    const wl = this._well;
    wl.fill(0);
    const wells = frame.wells || [];
    for (let i = 0; i < Math.min(4, wells.length); i++) {
      wl[i * 4] = wells[i].x; wl[i * 4 + 1] = wells[i].y; wl[i * 4 + 2] = wells[i].r; wl[i * 4 + 3] = wells[i].k;
    }

    const bg = this.pBg;
    bg.use();
    gl.uniform2f(bg.u('u_cam'), camX, camY);
    gl.uniform2f(bg.u('u_viewHalf'), vh.x, vh.y);
    gl.uniform2f(bg.u('u_arena'), frame.arena.hw, frame.arena.hh);
    gl.uniform1f(bg.u('u_time'), frame.time);
    gl.uniform3fv(bg.u('u_c1'), sec.c1);
    gl.uniform3fv(bg.u('u_c2'), sec.c2);
    gl.uniform3fv(bg.u('u_c3'), sec.c3);
    gl.uniform3fv(bg.u('u_grid'), sec.grid);
    gl.uniform4fv(bg.u('u_ripple'), rp);
    gl.uniform4fv(bg.u('u_well'), wl);
    const ring = frame.ring;
    gl.uniform4f(bg.u('u_ring'), ring ? ring.x : 0, ring ? ring.y : 0, ring ? ring.r : 0, ring ? 1 : 0);
    gl.uniform1f(bg.u('u_detail'), this.quality.scale < 0.8 ? 0 : 1);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // shapes
    const batch = this.batch;
    batch.begin();
    frame.draw(batch, this.glyphs);
    if (fx) fx.draw(batch, this.glyphs);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const ps = this.pShape;
    ps.use();
    gl.uniform2f(ps.u('u_cam'), camX, camY);
    gl.uniform2f(ps.u('u_viewHalf'), vh.x, vh.y);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.glyphs.tex);
    gl.uniform1i(ps.u('u_atlas'), 0);
    batch.flush();
    gl.disable(gl.BLEND);

    // ---- bloom
    gl.bindVertexArray(this.emptyVao);
    const pd = this.pDown;
    pd.use();
    gl.uniform1i(pd.u('u_tex'), 0);
    let src = this.scene;
    for (let i = 0; i < this.mips.length; i++) {
      const dst = this.mips[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform2f(pd.u('u_texel'), 1 / src.w, 1 / src.h);
      gl.uniform1f(pd.u('u_threshold'), i === 0 ? (this.hdr ? 0.75 : 0.55) : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      src = dst;
    }
    const pu = this.pUp;
    pu.use();
    gl.uniform1i(pu.u('u_tex'), 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.mips.length - 1; i > 0; i--) {
      const s = this.mips[i], dst = this.mips[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
      gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, s.tex);
      gl.uniform2f(pu.u('u_texel'), 0.5 / s.w, 0.5 / s.h);
      gl.uniform1f(pu.u('u_gain'), 0.85);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);

    // ---- composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.w, this.h);
    const pc = this.pComp;
    pc.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene.tex);
    gl.uniform1i(pc.u('u_scene'), 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.mips[0].tex);
    gl.uniform1i(pc.u('u_bloom'), 1);
    gl.uniform1f(pc.u('u_aspect'), this.w / this.h);
    gl.uniform1f(pc.u('u_time'), frame.time % 1000);
    gl.uniform4fv(pc.u('u_shock'), sh);
    gl.uniform1f(pc.u('u_chroma'), 0.0016 + (fx ? fx.chroma : 0) * 0.012);
    gl.uniform1f(pc.u('u_bloomStr'), this.hdr ? 0.9 : 1.2);
    gl.uniform1f(pc.u('u_exposure'), 1.15);
    gl.uniform1f(pc.u('u_danger'), frame.danger || 0);
    gl.uniform1f(pc.u('u_flash'), fx ? Math.min(0.85, fx.whiteout) : 0);
    gl.uniform1f(pc.u('u_fade'), frame.fade || 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }
}
