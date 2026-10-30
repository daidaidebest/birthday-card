// One wind for the whole world (v19). Every chapter that has air in it asks this module, so a gust is one event:
// it rises upwind, travels across the frame and dies away, and the grass, a horse's mane, the leaves, the lake's
// ripples, a curtain and the candle flames answer the same gust one after another, each with its own lag and weight.
// Pure functions of time (seconds) and position (0..1 across the frame, along the wind): deterministic, no state.
import { clamp, noise1 } from './util.js';

const smooth = x => x * x * (3 - 2 * x);
/** Gust schedule for a seed: a calm breeze with a gust every 7–15 s, each 2.5–5 s long, of varied strength. */
function gusts(seed) {
  const out = []; let t = -20 + (seed % 5);
  for (let i = 0; i < 400; i++) {
    const r1 = noise1(seed * 7.13 + i * 3.71) * .5 + .5, r2 = noise1(seed * 1.91 + i * 5.33) * .5 + .5, r3 = noise1(seed * 4.27 + i * 2.17) * .5 + .5;
    t += 7 + 8 * r1; out.push({ t, len: 2.5 + 2.5 * r2, s: .45 + .55 * r3 });
  }
  return out;
}
const cache = new Map();
const sched = seed => { if (!cache.has(seed)) cache.set(seed, gusts(seed)); return cache.get(seed); };

/** How hard the wind blows at time t and position x (0 upwind edge … 1 downwind edge), 0..~1.2.
 *  speed: how many frame-widths a gust front travels per second (default .35, so a gust crosses in ~3 s). */
export function windAt(t, x = .5, { seed = 1, speed = .35, base = .22 } = {}) {
  const tt = t - x / speed;   // the gust reaches the downwind side later
  let g = 0;
  for (const e of sched(seed)) {
    if (e.t > tt + 1) break;
    const u = (tt - e.t) / e.len; if (u < 0 || u > 1.6) continue;
    // a quick swell, a held push with a little buffeting, a long fall
    const env = u < .25 ? smooth(u / .25) : u < .7 ? 1 : smooth(clamp(1 - (u - .7) / .9));
    g = Math.max(g, e.s * env * (.85 + .15 * noise1(tt * 2.3 + e.t)));
  }
  const breeze = base * (.75 + .25 * noise1(tt * .31 + seed * 11) + .12 * noise1(tt * 1.7 + seed * 3));
  return breeze + g;
}

/** A follower with weight: something light (a flame, a grass blade) answers at once, something heavy (a mane, a curtain,
 *  a branch) lags and overshoots a little. Call each frame: f = follower(); f(dt, windAt(...)) → its current lean. */
export function follower({ stiffness = 9, damping = 3.2, mass = 1 } = {}) {
  let p = 0, v = 0;
  return (dt, target) => {
    dt = Math.min(dt, .05);
    const a = (stiffness * (target - p) - damping * v) / mass;
    v += a * dt; p += v * dt; return p;
  };
}

/** The scene's prevailing direction: +1 the wind blows toward screen right, −1 toward the left. Per chapter. */
export const WIND_DIR = { prologue: -1, gate: -1, book: 1, journey: 1, film: -1, wish: 1 };
