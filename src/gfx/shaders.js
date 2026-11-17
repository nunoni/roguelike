// All GLSL lives here. Shape ids must match SHAPE in batch.js.

export const FULLSCREEN_VS = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// ---------------------------------------------------------------- shapes
export const SHAPE_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_posSize;   // x, y, half w, half h
layout(location=2) in vec4 a_misc;      // rot, shape, occlusion, extra
layout(location=3) in vec4 a_color;
layout(location=4) in vec4 a_params;    // line, fill, glow, shape param
uniform vec2 u_cam;
uniform vec2 u_viewHalf;
out vec2 v_p;
out vec2 v_size;
out vec4 v_color;
out vec4 v_params;
out vec4 v_misc;
out float v_pad;
void main() {
  vec2 size = a_posSize.zw;
  float shape = a_misc.y;
  float r = min(size.x, size.y);
  float pad = (shape > 8.5 && shape < 10.5) ? 0.0 : (a_params.z > 0.0 ? r * 1.1 + 10.0 : r * 0.2 + 3.0);
  vec2 local = a_corner * (size + pad);
  float c = cos(a_misc.x), s = sin(a_misc.x);
  vec2 world = a_posSize.xy + vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec2 ndc = (world - u_cam) / u_viewHalf;
  gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  v_p = (shape > 9.5 && shape < 10.5) ? a_corner : local;
  v_size = size;
  v_color = a_color;
  v_params = a_params;
  v_misc = a_misc;
  v_pad = pad;
}`;

export const SHAPE_FS = `#version 300 es
precision highp float;
in vec2 v_p;
in vec2 v_size;
in vec4 v_color;
in vec4 v_params;
in vec4 v_misc;
in float v_pad;
uniform sampler2D u_atlas;
out vec4 o;

const float PI = 3.14159265;

float dot2(vec2 v) { return dot(v, v); }

// Heart with the tip toward +x. Unit heart: tip at origin, lobes up to y=1.1.
float sdHeartUnit(vec2 p) {
  p.x = abs(p.x);
  if (p.y + p.x > 1.0) return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
  return sqrt(min(dot2(p - vec2(0.0, 1.0)), dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}
float sdHeart(vec2 p, float r) {
  vec2 q = vec2(p.y, -p.x) / r * 0.55 + vec2(0.0, 0.55);
  return sdHeartUnit(q) * r / 0.55;
}
float sdNgon(vec2 p, float r, float n) {
  float an = PI / n;
  float a = mod(atan(p.y, p.x), 2.0 * an) - an;
  vec2 q = length(p) * vec2(cos(a), abs(sin(a)));
  vec2 d = q - vec2(r * cos(an), clamp(q.y, 0.0, r * sin(an)));
  return length(d) * sign(d.x);
}
float sdStar(vec2 p, float r, float n, float inner) {
  float an = PI / n;
  float a = mod(atan(p.y, p.x) + an, 2.0 * an) - an;
  vec2 q = length(p) * vec2(cos(a), abs(sin(a)));
  vec2 A = vec2(r, 0.0), B = r * inner * vec2(cos(an), sin(an));
  vec2 pa = q - A, ba = B - A;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  float d = length(pa - ba * h);
  float cr = ba.x * pa.y - ba.y * pa.x;
  return cr > 0.0 ? -d : d;
}
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
float sdArc(vec2 p, float ap, float r) {
  vec2 q = vec2(abs(p.y), p.x);
  vec2 sc = vec2(sin(ap), cos(ap));
  return (sc.y * q.x > sc.x * q.y) ? length(q - sc * r) : abs(length(q) - r);
}

void main() {
  int shape = int(v_misc.y + 0.5);
  vec2 p = v_p;
  float r = min(v_size.x, v_size.y);
  vec3 col = v_color.rgb;
  float alpha = v_color.a;

  if (shape == 9) {            // soft glow blob (particles): purely additive
    vec2 q = p / v_size;
    float f = max(0.0, 1.0 - dot(q, q));
    f = f * f * (0.35 + 0.65 * f);
    o = vec4(col * f * alpha, 0.0);
    return;
  }
  if (shape == 10) {           // glyph from the atlas
    vec2 uv = mix(v_params.xy, v_params.zw, p * 0.5 + 0.5);
    float a = texture(u_atlas, uv).a;
    o = vec4(col * a * alpha, a * alpha * v_misc.z);
    return;
  }

  float d;
  if (shape == 0) d = length(p) - r;
  else if (shape == 2) d = sdHeart(p, r);
  else if (shape == 3) d = sdNgon(p, r, v_params.w);
  else if (shape == 4) d = sdStar(p, r, v_params.w, v_misc.w > 0.0 ? v_misc.w : 0.45);
  else if (shape == 5) {       // capsule along x
    vec2 q = vec2(max(abs(p.x) - (v_size.x - v_size.y), 0.0), p.y);
    d = length(q) - v_size.y;
  }
  else if (shape == 6) d = sdBox(p, v_size - v_params.w) - v_params.w;
  else if (shape == 7) d = sdArc(p, v_params.w, r) - v_misc.w;
  else if (shape == 8) {       // crescent opening toward +x
    d = max(length(p) - r, -(length(p - vec2(r * 0.5, 0.0)) - r * 0.82));
  }
  else if (shape == 11) {      // broken heart: zig-zag crack along the axis
    d = sdHeart(p, r);
    float zig = abs(fract(p.x / (r * 0.5) + 0.25) - 0.5) * 2.0 - 0.5;
    float crack = abs(p.y - zig * r * 0.22) - r * 0.07;
    d = max(d, -crack);
  }
  else if (shape == 12) {      // plus
    d = min(sdBox(p, vec2(r, r * 0.32)), sdBox(p, vec2(r * 0.32, r)));
  }
  else if (shape == 13) {      // chevron / arrowhead pointing +x
    d = max(sdNgon(p, r, 3.0), -sdNgon(p + vec2(r * 0.62, 0.0), r * 0.85, 3.0));
  }
  else d = length(p) - r;

  float aa = max(fwidth(d), 0.0001);
  float line = v_params.x, fill = v_params.y, glow = v_params.z;

  float fillMask = smoothstep(aa, -aa, d);
  float lineMask = line > 0.0 ? smoothstep(line + aa, line - aa, abs(d + line)) : 0.0;
  // soft gradient just inside the edge, the "neon tube" look
  float inner = fillMask * (0.3 + 0.7 * exp(d / (r * 0.45 + 1.0)));
  float gr = v_pad * 0.32 + 1.0;
  float outer = glow * exp(-max(d, 0.0) / gr) * (1.0 - fillMask) * smoothstep(v_pad, v_pad * 0.45, d);

  vec3 c = col * (lineMask * 1.5 + inner * fill + outer * 0.55);
  c += vec3(1.0) * lineMask * lineMask * 0.25;      // white-hot core on the stroke
  float occ = max(fillMask * v_misc.z, lineMask * min(v_misc.z * 2.0, 1.0));
  o = vec4(c * alpha, occ * alpha);
}`;

// ---------------------------------------------------------------- background
export const BG_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_cam;
uniform vec2 u_viewHalf;
uniform vec2 u_arena;
uniform float u_time;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec3 u_grid;
uniform vec4 u_ripple[8];   // x, y, radius, amplitude
uniform vec4 u_well[4];     // x, y, radius, strength
uniform vec4 u_ring;        // x, y, radius, on
uniform float u_detail;
out vec4 o;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(17.1, 9.3);
    a *= 0.5;
  }
  return s;
}
float stars(vec2 wp, float par, float cell, float seed, float dens) {
  vec2 sp = (u_cam * par + (wp - u_cam)) / cell;
  vec2 id = floor(sp);
  vec2 f = fract(sp) - 0.5;
  float h = hash21(id + seed);
  if (h < dens) return 0.0;
  vec2 off = (vec2(hash21(id + seed + 3.1), hash21(id + seed + 7.7)) - 0.5) * 0.7;
  float d = length(f - off) * cell;
  float tw = 0.6 + 0.4 * sin(u_time * (1.0 + h * 3.0) + h * 40.0);
  float size = 1.0 + (h - dens) / (1.0 - dens) * 2.2;
  return smoothstep(size, 0.0, d) * tw;
}
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
  vec2 ndc = v_uv * 2.0 - 1.0;
  vec2 wp = u_cam + vec2(ndc.x, -ndc.y) * u_viewHalf;

  // nebula
  vec2 np = (u_cam * 0.3 + (wp - u_cam)) * 0.0011;
  vec3 col = vec3(0.004, 0.004, 0.012);
  if (u_detail > 0.5) {
    vec2 q = vec2(fbm(np + u_time * 0.006), fbm(np + vec2(5.2, 1.3) - u_time * 0.004));
    float n = fbm(np + 1.7 * q);
    float wisp = fbm(np * 2.3 + q * 2.0 + 11.0);
    col += mix(u_c1, u_c2, smoothstep(0.25, 0.75, q.x)) * pow(n, 2.0) * 1.5;
    col += u_c3 * pow(wisp, 4.5) * 0.9;
  } else {
    float n = noise(np * 2.0) * 0.6 + noise(np * 5.0) * 0.4;
    col += mix(u_c1, u_c2, n) * n * n * 0.4;
  }

  // parallax stars
  float st = stars(wp, 0.12, 70.0, 1.0, 0.86) * 0.5
           + stars(wp, 0.25, 120.0, 21.0, 0.84) * 0.8
           + stars(wp, 0.45, 210.0, 47.0, 0.8) * 1.2;
  col += vec3(0.75, 0.85, 1.0) * st;

  // arena floor grid, displaced by shockwaves and gravity wells
  vec2 gp = wp;
  float energy = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 rp = u_ripple[i];
    if (rp.w <= 0.0) continue;
    vec2 dv = wp - rp.xy;
    float dist = length(dv) + 0.001;
    float x = (dist - rp.z) / 70.0;
    float f = exp(-x * x) * rp.w;
    gp += dv / dist * f * 34.0;
    energy += f;
  }
  for (int i = 0; i < 4; i++) {
    vec4 w = u_well[i];
    if (w.w <= 0.0) continue;
    vec2 dv = wp - w.xy;
    float dist2 = dot(dv, dv);
    float f = w.w * w.z * w.z / (dist2 + w.z * w.z * 0.35);
    gp -= dv * f * 0.42;
    energy += f * 0.6;
  }
  float dEdge = sdBox(wp, u_arena);
  float inside = smoothstep(4.0, -4.0, dEdge);
  vec2 g = gp / 100.0;
  vec2 gf = abs(fract(g - 0.5) - 0.5);
  vec2 gw = fwidth(g) * 1.2;
  float lines = max(smoothstep(gw.x, 0.0, gf.x), smoothstep(gw.y, 0.0, gf.y));
  float dots = smoothstep(0.07, 0.02, length(gf));
  float gridI = (lines * 0.07 + dots * 0.26) * (1.0 + energy * 9.0);
  col += u_grid * gridI * inside;

  // arena wall
  float wall = exp(-abs(dEdge) / 5.0) * 1.6 + exp(-abs(dEdge) / 50.0) * 0.22;
  col += u_grid * wall;
  if (dEdge > 0.0) {
    col *= 0.45;
    float stripes = smoothstep(0.42, 0.5, abs(fract((wp.x + wp.y) / 90.0 + u_time * 0.2) - 0.5));
    col += u_grid * stripes * 0.03 * exp(-dEdge / 260.0);
  }

  // closing ring (final boss)
  if (u_ring.w > 0.5) {
    float dr = length(wp - u_ring.xy) - u_ring.z;
    col += vec3(1.0, 0.15, 0.45) * (exp(-abs(dr) / 6.0) * 1.8 + exp(-abs(dr) / 60.0) * 0.3);
    if (dr > 0.0) col += vec3(0.35, 0.0, 0.08) * (0.4 + 0.3 * sin(u_time * 5.0 - dr * 0.03)) * smoothstep(0.0, 200.0, dr);
  }

  o = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------- bloom
export const DOWN_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_threshold;   // > 0 on the first pass only
out vec4 o;
vec3 pre(vec3 c) {
  if (u_threshold <= 0.0) return c;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(u_threshold * 0.55, u_threshold * 1.6, l);
  return c * k;
}
void main() {
  vec3 c = pre(texture(u_tex, v_uv).rgb) * 4.0;
  c += pre(texture(u_tex, v_uv + u_texel * vec2(-1.0, -1.0)).rgb);
  c += pre(texture(u_tex, v_uv + u_texel * vec2(1.0, -1.0)).rgb);
  c += pre(texture(u_tex, v_uv + u_texel * vec2(-1.0, 1.0)).rgb);
  c += pre(texture(u_tex, v_uv + u_texel * vec2(1.0, 1.0)).rgb);
  o = vec4(c / 8.0, 1.0);
}`;

export const UP_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_gain;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv + u_texel * vec2(-2.0, 0.0)).rgb;
  c += texture(u_tex, v_uv + u_texel * vec2(2.0, 0.0)).rgb;
  c += texture(u_tex, v_uv + u_texel * vec2(0.0, -2.0)).rgb;
  c += texture(u_tex, v_uv + u_texel * vec2(0.0, 2.0)).rgb;
  c += texture(u_tex, v_uv + u_texel * vec2(-1.0, 1.0)).rgb * 2.0;
  c += texture(u_tex, v_uv + u_texel * vec2(1.0, 1.0)).rgb * 2.0;
  c += texture(u_tex, v_uv + u_texel * vec2(-1.0, -1.0)).rgb * 2.0;
  c += texture(u_tex, v_uv + u_texel * vec2(1.0, -1.0)).rgb * 2.0;
  o = vec4(c / 12.0 * u_gain, 1.0);
}`;

// ---------------------------------------------------------------- composite
export const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_bloom;
uniform float u_aspect;
uniform float u_time;
uniform vec4 u_shock[8];     // uv x, uv y, radius (in view heights), amplitude
uniform float u_chroma;
uniform float u_bloomStr;
uniform float u_exposure;
uniform float u_danger;      // low-health pulse 0..1
uniform float u_flash;       // white flash 0..1
uniform float u_fade;        // darken (menus)
out vec4 o;

vec3 sampleAll(vec2 uv) {
  return texture(u_scene, uv).rgb + texture(u_bloom, uv).rgb * u_bloomStr;
}
float hash(vec2 p) {
  p = fract(p * vec2(443.897, 441.423));
  p += dot(p, p.yx + 19.19);
  return fract((p.x + p.y) * p.x);
}

void main() {
  vec2 uv = v_uv;
  for (int i = 0; i < 8; i++) {
    vec4 s = u_shock[i];
    if (s.w <= 0.0) continue;
    vec2 d = (uv - s.xy) * vec2(u_aspect, 1.0);
    float dist = length(d) + 0.0001;
    float x = (dist - s.z) / 0.045;
    float f = x * exp(-x * x) * s.w;
    uv -= d / dist * f * vec2(1.0 / u_aspect, 1.0);
  }

  vec2 c = uv - 0.5;
  float r2 = dot(c, c);
  vec2 off = c * (u_chroma * (0.4 + r2 * 2.4));
  vec3 col;
  if (u_chroma > 0.0005) {
    col.r = sampleAll(uv + off).r;
    col.g = sampleAll(uv).g;
    col.b = sampleAll(uv - off).b;
  } else {
    col = sampleAll(uv);
  }

  float vig = smoothstep(1.05, 0.25, length(c * vec2(1.0, 1.15)) * 1.25);
  col *= mix(0.5, 1.0, vig);
  col += vec3(0.9, 0.02, 0.1) * u_danger * (1.0 - vig) * 0.9;

  col = 1.0 - exp(-col * u_exposure);
  col = mix(col, vec3(1.0), u_flash);
  col *= 1.0 - u_fade;
  col += (hash(gl_FragCoord.xy + u_time * 60.0) - 0.5) * 0.018;
  o = vec4(col, 1.0);
}`;
