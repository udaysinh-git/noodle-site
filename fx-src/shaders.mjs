// WGSL for the site's two effects. build.mjs prepares these at build time, so the
// browser never loads the WGSL parser.

// Hero background: a few soft strands drifting like noodles in broth. The pointer
// pulls them toward it and lights them up; `pulse` brightens them once a second
// with the countdown. Output is premultiplied, so the page colour shows through.
export const strands = /* wgsl */ `
struct P {
  res: vec2f,
  ptr: vec2f,
  time: f32,
  pulse: f32,
  hover: f32,
  strength: f32,
  c1: vec4f,
  c2: vec4f,
};
@group(0) @binding(0) var<uniform> p: P;

fn strand(x: f32, i: f32, t: f32) -> f32 {
  let a = 0.13 + 0.03 * sin(i * 2.1);
  return 0.5 + (i - 2.0) * 0.07
    + a * sin(x * (1.6 + i * 0.23) + t * (0.22 + i * 0.03) + i * 1.7)
    + 0.05 * sin(x * 3.7 - t * 0.31 + i * 2.9);
}

@fragment fn fs_main(@location(0) uv0: vec2f) -> @location(0) vec4f {
  let uv = uv0;
  let aspect = p.res.x / max(p.res.y, 1.0);
  let q = vec2f(uv.x * aspect, uv.y);
  let m = vec2f(p.ptr.x * aspect, p.ptr.y);
  let t = p.time;
  var col = vec3f(0.0);
  var alpha = 0.0;
  for (var k = 0; k < 5; k++) {
    let i = f32(k);
    var y = strand(q.x, i, t);
    // Pull toward the pointer, strongest close by.
    let dx = q.x - m.x;
    let near = exp(-dx * dx * 6.0) * p.hover;
    y = mix(y, m.y, near * 0.22);
    let d = abs(q.y - y);
    let w = 0.006 + 0.004 * i / 4.0;
    let core = exp(-(d * d) / (w * w));
    let glow = exp(-(d * d) / (w * w * 40.0)) * 0.22;
    let near2 = exp(-dot(q - m, q - m) * 7.0) * p.hover;
    let tint = mix(p.c1.rgb, p.c2.rgb, clamp(uv.x * 0.8 + i * 0.05, 0.0, 1.0));
    let a = (core * 0.55 + glow) * (0.5 + near2 * 0.9 + p.pulse * 0.35);
    col += tint * a;
    alpha += a;
  }
  // Fade out toward the edges so the strands never end in a hard line.
  // Mostly on the right, so the headline on the left stays easy to read.
  let edge = smoothstep(0.12, 0.62, uv.x) * smoothstep(1.0, 0.85, uv.x)
    * smoothstep(0.0, 0.25, uv.y) * smoothstep(1.0, 0.75, uv.y);
  let a = clamp(alpha, 0.0, 1.0) * edge * p.strength;
  return vec4f(col * edge * p.strength, a);
}
`

// CRT post effect over a flat Classic 98 screenshot. Ported from Noodle's own CRT
// skin shader (src/preload/crt.ts): curvature, bloom, scanlines, aperture grille,
// vignette and a little flicker, plus a power-on sweep driven by `power`.
export const crt = /* wgsl */ `
struct U {
  res: vec2f,
  time: f32,
  power: f32,
  dpr: f32,
  curvature: f32,
  scan: f32,
  glow: f32,
};
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> u: U;

fn warp(uv: vec2f) -> vec2f {
  var c = uv * 2.0 - 1.0;
  let k = u.curvature * vec2f(1.0 / 16.0, 1.0 / 12.0);
  c = c * vec2f(1.0 + c.y * c.y * k.x, 1.0 + c.x * c.x * k.y);
  return c * 0.5 + 0.5;
}

fn tap(uv: vec2f) -> vec3f {
  return textureSampleLevel(tex, samp, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).rgb;
}

@fragment fn fs_main(@builtin(position) pos: vec4f, @location(0) uv0: vec2f) -> @location(0) vec4f {
  // Power-on: a bright line that opens into the picture.
  let open = smoothstep(0.22, 0.8, u.power);
  let sx = mix(0.35, 1.0, smoothstep(0.0, 0.25, u.power));
  let sy = mix(0.006, 1.0, open);
  let base = uv0;
  let squeezed = (base - vec2f(0.5)) / vec2f(sx, sy) + vec2f(0.5);
  let uv = warp(squeezed);
  let px = 1.0 / u.res;
  let dir = (uv - vec2f(0.5)) * 0.006;
  var col = vec3f(tap(uv + dir).r, tap(uv).g, tap(uv - dir).b);

  let r = px * 2.5 * u.dpr;
  var bloom = tap(uv + vec2f(r.x, 0.0)) + tap(uv - vec2f(r.x, 0.0));
  bloom += tap(uv + vec2f(0.0, r.y)) + tap(uv - vec2f(0.0, r.y));
  bloom += tap(uv + r * 1.6) + tap(uv - r * 1.6);
  bloom += tap(uv + vec2f(r.x, -r.y) * 1.6) + tap(uv + vec2f(-r.x, r.y) * 1.6);
  bloom = bloom / 8.0;
  col = col + max(bloom - vec3f(0.55), vec3f(0.0)) * u.glow * 1.2;

  let line = uv.y * u.res.y / (3.0 * u.dpr);
  let s = 0.5 + 0.5 * cos(6.2831853 * line);
  col = col * mix(1.0, 0.45 + 0.55 * s, u.scan);

  let m = i32(floor(pos.x / max(1.0, u.dpr))) % 3;
  var mask = vec3f(1.0 - 0.45 * 0.6);
  if (m == 0) { mask.r = 1.0; } else if (m == 1) { mask.g = 1.0; } else { mask.b = 1.0; }
  col = col * mask * (1.0 + 0.6 * 0.3);

  let vc = uv - vec2f(0.5);
  col = col * (1.0 - dot(vc, vc) * (0.35 + u.curvature * 0.7));
  col = col * (1.0 - 0.035 * (0.5 + 0.5 * sin(u.time * 113.0)));
  // Rolling bar, very faint.
  col = col * (1.0 + 0.03 * smoothstep(0.0, 0.08, 0.08 - abs(fract(uv.y - u.time * 0.12) - 0.5)));

  col = col * mix(5.0, 1.0, smoothstep(0.0, 0.9, u.power));
  let edge = min(min(uv.x, 1.0 - uv.x) * u.res.x, min(uv.y, 1.0 - uv.y) * u.res.y);
  let fade = smoothstep(0.0, 4.0 * u.dpr, edge);
  let inside = select(0.0, 1.0, uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0);
  return vec4f(col * fade * inside, 1.0);
}
`
