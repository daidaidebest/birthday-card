// Candle flames with a little physics (v19), for the birthday cake (wish.js).
// Each flame is a soft teardrop over its wick: a pale-gold inner cone, an orange outer mantle that fades to nothing, a
// blue foot, a dark wick with a glowing tip and a halo. Its height and width flicker with a 1/f spectrum (slow breathing,
// quicker trembles, a faint fast shiver), never in step with its neighbours. Air moves it: the room's draught (wind.js,
// a gust crossing the row candle by candle), her finger moving near the candles (they lean the way the finger pushes the
// air), the breath of her wish (air spreading out from the middle of the row, in the rhythm of a slow breath), and the
// blow that puts them out. The base answers at once; the tip lags and overshoots, so a flame bends into an S when the
// air changes. Now and then one gutters (dips, shudders, recovers). Blown out, a thin wisp of smoke curls up from the wick.
// A flame carried on her fingertip trails behind the way she moves it.
import { windAt, WIND_DIR } from './wind.js';
import { clamp, noise1, glowSprite, TAU } from './util.js';

const SPEC = [[.7, .05], [1.9, .045], [4.3, .035], [9.1, .024], [15.7, .014]];   // flicker: frequency (Hz-ish), size
const spring = (s, target, dt, k, c) => { s.v += (k * (target - s.p) - c * s.v) * dt; s.p += s.v * dt; };

function makeFlame(seed) {
  return { seed, base: { p: 0, v: 0 }, tip: { p: 0, v: 0 }, h: { p: 1, v: 0 }, gutAt: -99, gutLen: .7, nextGut: 6 + (seed * 7.31 % 1) * 18, lvl: 1, air: 0, turb: 0 };
}

export class Flames {
  /** n candles; reduced: prefers-reduced-motion (a calmer flicker, no shiver). */
  constructor(n, { reduced = false, seed = 11 } = {}) {
    this.n = n; this.reduced = reduced; this.seed = seed; this.t = 0;
    this.f = Array.from({ length: n }, (_, i) => makeFlame(3.7 + i * 5.13 + seed));
    this.carry = makeFlame(1.9); this.finger = null; this.wisps = [];
    this.halo = glowSprite('255,186,104', 96, 1.8); this.core = glowSprite('255,236,196', 48, 2.4);
  }
  /** How strongly the air pushes flame i sideways right now (screen px/s-ish → normalised lean), from all sources. */
  step(dt, t, { tips, finger = null, breath = 0, blowAt = null, spacing = 40 } = {}) {
    dt = Math.min(dt, .05); this.t = t;
    // the finger's velocity, smoothed (pointer events are lumpy on phones)
    if (finger) {
      const F = this.finger;
      if (F && F.id === finger.id) { const vx = (finger.x - F.x) / Math.max(dt, 1e-3), vy = (finger.y - F.y) / Math.max(dt, 1e-3); F.vx += (vx - F.vx) * (1 - Math.exp(-dt * 14)); F.vy += (vy - F.vy) * (1 - Math.exp(-dt * 14)); F.x = finger.x; F.y = finger.y; }
      else this.finger = { id: finger.id, x: finger.x, y: finger.y, vx: 0, vy: 0 };
    } else if (this.finger) { this.finger.vx *= Math.exp(-dt * 6); this.finger.vy *= Math.exp(-dt * 6); if (Math.abs(this.finger.vx) < 2) this.finger = null; }
    const n = this.n, mid = (n - 1) / 2, dir = WIND_DIR.wish || 1;
    const exhale = breath > 0 ? Math.max(0, Math.sin(t * TAU / 4.6 - .6)) ** 2 * breath : 0;   // her slow breath: only the out-breath moves air
    for (let i = 0; i < n; i++) {
      const fl = this.f[i], [x, y] = tips(i), u = n > 1 ? i / (n - 1) : .5;
      // the room's draught: the shared wind, very weak indoors, crossing the row so neighbours lean one after another
      const room = (windAt(t, dir > 0 ? u * .25 : (1 - u) * .25, { seed: this.seed, speed: .5, base: .08 }) - .1) * .5 * dir;
      let air = room, turb = Math.abs(room) * .5;
      if (this.finger) {   // air pushed by her finger: strongest close by, falling off over a few candle spacings
        const F = this.finger, d2 = ((F.x - x) / (spacing * 2.2)) ** 2 + ((F.y - y) / (spacing * 3)) ** 2, k = Math.exp(-d2);
        air += clamp(F.vx / 900, -1.2, 1.2) * k; turb += Math.min(1, Math.hypot(F.vx, F.vy) / 700) * k;
      }
      if (exhale > 0) { const out = (i - mid) / Math.max(1, mid); air += out * .35 * exhale; turb += .5 * exhale; }
      if (blowAt != null && t >= blowAt) {   // the blow: a hard push outward from the middle, reaching the outer candles last
        const k = t - blowAt - Math.abs(i - mid) * .06, g = k < 0 ? 0 : k < .12 ? k / .12 : Math.max(0, 1 - (k - .12) / .5);
        air += (i - mid >= 0 ? 1 : -1) * (.6 + Math.abs(i - mid) * .25) * 1.6 * g; turb += 1.6 * g;
      }
      fl.air = air; fl.turb = turb;
      this.advance(fl, dt, t, air, turb);
    }
    // smoke wisps rise and drift with the room's air
    for (let k = this.wisps.length - 1; k >= 0; k--) { const w = this.wisps[k]; w.age += dt; if (w.age > w.life) this.wisps.splice(k, 1); }
  }
  advance(fl, dt, t, air, turb) {
    // the base answers at once, the tip lags behind it (and overshoots), the height dips when it leans hard
    spring(fl.base, clamp(air, -1.6, 1.6), dt, 46, 10);
    spring(fl.tip, fl.base.p, dt, 15, 4.2);
    // gutter now and then (sooner in a draught): a dip, a shudder, a recovery
    if (t > fl.nextGut) { fl.gutAt = t; fl.gutLen = .5 + (fl.seed * 3.3 % 1) * .5; fl.nextGut = t + 9 + Math.random() * 20 - Math.min(6, turb * 8); }
    const gu = (t - fl.gutAt) / fl.gutLen, gut = gu >= 0 && gu < 1 ? Math.sin(gu * Math.PI) : 0;
    let flick = 0; const s = fl.seed, r = this.reduced ? .45 : 1;
    for (let k = 0; k < SPEC.length; k++) flick += SPEC[k][1] * noise1(t * SPEC[k][0] + s * (k + 1.7)) * (k > 2 ? r : 1);
    const want = 1 + flick * (1 + turb * 1.5) - gut * .28 - Math.min(.35, Math.abs(fl.base.p) * .2);
    spring(fl.h, want, dt, 90, 12);
    fl.gut = gut; fl.shiver = (this.reduced ? 0 : 1) * (gut * .6 + Math.min(1, turb) * .35);
    fl.lvl = clamp(fl.h.p * (1 - gut * .25), .4, 1.25);
  }
  /** The brightness of flame i this frame (about .6 … 1.2), for the light it throws on the cake. */
  level(i) { return this.f[i] ? this.f[i].lvl : 1; }
  /** Blown out: a wisp of smoke from the wick (and the flame's state starts fresh for a relight). */
  snuff(i, x, y, s) {
    const fl = this.f[i]; if (!fl) return;
    for (let k = 0; k < 2; k++) this.wisps.push({ i, x, y, s, age: -k * .12, life: 3.2 + Math.random() * 1.2, seed: Math.random() * 50, lean: clamp(fl.tip.p, -1.5, 1.5) });
    this.f[i] = makeFlame(fl.seed);
  }
  /** Draws flame i at its wick tip (x, y), size s (px), alpha a. */
  draw(g, i, x, y, s, a = 1) { const fl = this.f[i]; if (fl && a > .004) paint(g, x, y, s, a, fl, this.t, this.halo, this.core); }
  /** The flame carried on her fingertip: it streams back from the way she moves it. */
  carried(g, x, y, s, dt) {
    const c = this.carry, last = c.last || [x, y]; const vx = (x - last[0]) / Math.max(dt, 1e-3); c.last = [x, y];
    c.vs = (c.vs || 0) + (vx - (c.vs || 0)) * (1 - Math.exp(-Math.min(dt, .05) * 12));
    this.advance(c, Math.min(dt, .05), this.t, clamp(-c.vs / 700, -1.4, 1.4), Math.min(1, Math.abs(c.vs) / 600));
    paint(g, x, y, s, 1, c, this.t, this.halo, this.core);
  }
  /** Smoke wisps from snuffed wicks: thin, curling, widening and fading as they rise. pos(i) → the wick tip now. */
  smoke(g, pos) {
    if (!this.wisps.length) return;
    g.save(); g.globalCompositeOperation = 'source-over'; g.lineCap = 'round';
    for (const w of this.wisps) {
      if (w.age <= 0) continue;
      const [x0, y0] = pos ? pos(w.i) : [w.x, w.y], u = w.age / w.life, S = w.s, len = S * (1.2 + w.age * 2.4), N = 18;
      g.beginPath();
      for (let k = 0; k <= N; k++) {
        const v = k / N, hgt = v * len, age = w.age - v * .9;   // older smoke is higher up
        const curl = Math.sin(hgt / S * 2.1 + w.seed - w.age * 1.7) * S * .32 * v + noise1(hgt / S * .9 + w.seed + w.age * .6) * S * .5 * v * v;
        const px = x0 + curl + w.lean * S * .9 * Math.min(1, v * 2) * Math.exp(-w.age * 1.2), py = y0 - S * .1 - hgt;
        if (age < -.05) break;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.strokeStyle = `rgba(214,208,218,${(.32 * (1 - u) * Math.min(1, w.age * 4)).toFixed(3)})`; g.lineWidth = Math.max(.8, S * (.06 + u * .14)); g.stroke();
      g.strokeStyle = `rgba(214,208,218,${(.1 * (1 - u)).toFixed(3)})`; g.lineWidth = Math.max(2, S * (.22 + u * .5)); g.stroke();   // its soft spread
    }
    g.restore();
  }
}

/** One flame: halo, outer mantle, inner cone, blue foot, wick. lean from the springs; size s (px). */
function paint(g, x, y, s, a, fl, t, halo, core) {
  const h = fl.h.p, sd = fl.seed, sh = fl.shiver || 0;
  const H = s * 1.32 * h * (1 - .12 * Math.min(1, Math.abs(fl.tip.p))), W = s * .34 * (.92 + .16 * (2 - h)) * (1 + Math.abs(fl.base.p) * .08);
  const wob = (noise1(t * 7.3 + sd) * .05 + noise1(t * 13.1 + sd * 2) * .03 * sh * 3) * s;   // the tip's tremble
  const mx = fl.base.p * s * .32, tx = fl.tip.p * s * .95 + wob;
  g.save(); g.translate(x, y); g.globalAlpha = a;
  g.globalCompositeOperation = 'lighter';
  // the halo, breathing with the flame
  const R = s * 3 * (.85 + .2 * fl.lvl); g.globalAlpha = a * .32 * fl.lvl; g.drawImage(halo, -R + tx * .3, -H * .45 - R, R * 2, R * 2);
  g.globalAlpha = a;
  const shape = (k, kw) => {   // the teardrop, scaled toward its foot by k (height) and kw (width)
    const hh = H * k, ww = W * kw, b = s * .1;
    g.beginPath(); g.moveTo(-ww * .2, b);
    g.bezierCurveTo(-ww * 1.05, -hh * .02, -ww * .62 + mx * k, -hh * .64, tx * k, -hh);
    g.bezierCurveTo(ww * .62 + mx * k, -hh * .64, ww * 1.05, -hh * .02, ww * .2, b); g.closePath();
  };
  // the outer mantle: orange, fading out toward its edge and tip
  let gr = g.createRadialGradient(tx * .25, -H * .3, 0, tx * .35, -H * .42, H * .82);
  gr.addColorStop(0, 'rgba(255,196,110,.9)'); gr.addColorStop(.45, 'rgba(255,146,52,.6)'); gr.addColorStop(.8, 'rgba(240,92,24,.22)'); gr.addColorStop(1, 'rgba(220,70,20,0)');
  g.fillStyle = gr; shape(1, 1); g.fill();
  // the luminous inner cone: pale gold, brightest a little above the wick
  gr = g.createRadialGradient(tx * .15, -H * .26, 0, tx * .2, -H * .3, H * .5);
  gr.addColorStop(0, 'rgba(255,250,228,1)'); gr.addColorStop(.5, 'rgba(255,226,150,.85)'); gr.addColorStop(1, 'rgba(255,190,90,0)');
  g.fillStyle = gr; shape(.66, .62); g.fill();
  g.globalAlpha = a * (.75 + .25 * fl.lvl); g.drawImage(core, -W * .9 + tx * .12, -H * .42 - W * .9, W * 1.8, W * 1.8);
  // the blue foot of the flame, low around the wick
  g.globalAlpha = a * .55; g.fillStyle = 'rgba(70,110,255,.5)'; g.beginPath(); g.ellipse(mx * .1, s * .02, W * .55, s * .13, 0, 0, TAU); g.fill();
  // the wick: dark, curling a little, its tip glowing
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = a * .9; g.strokeStyle = 'rgba(40,22,14,.85)'; g.lineWidth = Math.max(.8, s * .05); g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, s * .14); g.quadraticCurveTo(0, -s * .02, mx * .2 + s * .03, -s * .1); g.stroke();
  g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,120,40,.9)'; g.beginPath(); g.arc(mx * .2 + s * .03, -s * .1, Math.max(.6, s * .028), 0, TAU); g.fill();
  g.restore();
}

/** v18 signature kept for any caller not yet moved to Flames: a flame with its own state per seed (no air). */
const legacy = new Map();
export function drawFlame(g, x, y, s, t, seed, lean = 0, a = 1) {
  let fl = legacy.get(seed); if (!fl) { fl = makeFlame(seed); fl.t = t; legacy.set(seed, fl); }
  const dt = clamp(t - fl.t, 0, .05); fl.t = t;
  Flames.prototype.advance.call({ reduced: false }, fl, dt, t, lean / 10, Math.abs(lean) / 10);
  paint(g, x, y, s, a, fl, t, glowSprite('255,186,104', 96, 1.8), glowSprite('255,236,196', 48, 2.4));
}
