// WGSL for the site's two effects. build.mjs prepares these at build time, so the
// browser never loads the WGSL parser.

// CRT post effect over a flat Classic 98 screenshot. Ported from Noodle's own CRT
// skin shader (src/preload/crt.ts): curvature, bloom, scanlines, aperture grille,
// and vignette. `power` is kept at 1: the picture is simply on.
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

  col = col * mix(5.0, 1.0, smoothstep(0.0, 0.9, u.power));
  let edge = min(min(uv.x, 1.0 - uv.x) * u.res.x, min(uv.y, 1.0 - uv.y) * u.res.y);
  let fade = smoothstep(0.0, 4.0 * u.dpr, edge);
  let inside = select(0.0, 1.0, uv.x >= 0.0 && uv.y >= 0.0 && uv.x <= 1.0 && uv.y <= 1.0);
  return vec4f(col * fade * inside, 1.0);
}
`
