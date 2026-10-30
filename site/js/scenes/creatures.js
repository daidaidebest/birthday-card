// The film's creatures: springy strands for the painted horses' manes and tails, and the two lions of the savanna,
// brought to life on the painting itself by a 2D skeleton (tools/lion_rig.py bakes the rig from SAM part masks).
import { asset, loadImage, canvas, clamp, rng } from '../util.js';
import { windAt, follower } from '../wind.js';

/** A chain of points that trails behind an anchor with springy lag (mane locks, tails). */
export class Strand {
  constructor(n, len) { this.n = n; this.len = len; this.p = Array.from({ length: n }, () => ({ x: 0, y: 0, vx: 0, vy: 0 })); this.init = false; }
  update(ax, ay, dirx, diry, dt, wind = 0, gravity = 0, stiff = 14) {
    const P = this.p;
    if (!this.init) { P.forEach((q, i) => { q.x = ax + dirx * this.len * i; q.y = ay + diry * this.len * i; }); this.init = true; }
    P[0].x = ax; P[0].y = ay;
    for (let i = 1; i < this.n; i++) {
      const q = P[i], prev = P[i - 1];
      const tx = prev.x + dirx * this.len, ty = prev.y + diry * this.len;
      q.vx += ((tx - q.x) * stiff + wind) * dt; q.vy += ((ty - q.y) * stiff + gravity) * dt;
      q.vx *= Math.exp(-dt * 5); q.vy *= Math.exp(-dt * 5);
      q.x += q.vx * dt; q.y += q.vy * dt;
      const dx = q.x - prev.x, dy = q.y - prev.y, d = Math.hypot(dx, dy) || 1;
      q.x = prev.x + dx / d * this.len; q.y = prev.y + dy / d * this.len;
    }
  }
}

// =====================================================================================================================
// The lions. Nothing redraws a face: the painting's own pixels are drawn through a skinned mesh (WebGL), every pixel
// moving by  p' = p + sum_i w_i(p) (World_i - World_parent(i)) p + breath + wind.  The weights (assets/img/lion-rig.png)
// are exactly 1 over each head, so a face can only turn, tilt or rise as one rigid piece; the falloff lives in the mane,
// the neck and the sky around them. Her head lies behind his back, so his back is redrawn over it (an occluder layer)
// and her head slides behind him; the tail is its own layer over a plate where the painted tail was inpainted away.
// Eyes: an upper lid slides down the painting's own fur (its painted lid line arriving at the edge) and the iris shifts
// inside the eye opening. A small director drives it: motivated beats on the shot's clock (she looks up at him, he turns
// to her, they meet eyes and slow-blink, she leans in, he lowers his head to hers, the shooting star, the stars), replies
// to her touch (their eyes follow each star she links, the fall), gust-driven mane and ears, breathing with a sigh now
// and then, blinks and small idle business on seeded, varied timing, and never everything at once.
// Without WebGL (or reduced motion) the painting is drawn still.
let prideData = null;
/** Loads the rig (json, weight sheet, tail plates); resolves null if anything is missing. */
export function loadPride() {
  prideData ??= Promise.all([fetch(asset('img/lion-rig.json')).then(r => r.json()), loadImage(asset('img/lion-rig.png')), loadImage(asset('img/lion-plate.webp'))])
    .then(([rig, sheet, plate]) => ({ rig, sheet, plate })).catch(() => null);
  return prideData;
}

const BONES = ['m.neck', 'm.head', 'm.ear', 'lag', 'f.neck', 'f.head', 'f.earL', 'f.earR', 't1', 't2', 't3'];
const VS = `
attribute vec2 aP; attribute vec4 aW0, aW1, aW2; attribute float aW3;
uniform vec3 uD[22]; uniform vec2 uBreath; uniform vec4 uWind; uniform vec4 uBox;
varying vec2 vUv;
vec2 bone(vec3 r0, vec3 r1, vec2 p) { vec3 h = vec3(p, 1.0); return vec2(dot(r0, h), dot(r1, h)); }
void main() {
  vec2 p = aP;
  vec2 d = aW0.x * bone(uD[0], uD[1], p) + aW0.y * bone(uD[2], uD[3], p) + aW0.z * bone(uD[4], uD[5], p)
         + aW1.x * bone(uD[8], uD[9], p) + aW1.y * bone(uD[10], uD[11], p) + aW1.z * bone(uD[12], uD[13], p) + aW1.w * bone(uD[14], uD[15], p)
         + aW2.x * bone(uD[16], uD[17], p) + aW2.y * bone(uD[18], uD[19], p) + aW2.z * bone(uD[20], uD[21], p);
  // the free strands of his mane: they trail the head's motion (lag) and stream downwind, a wave running down them
  float wave = 0.6 + 0.4 * sin(uWind.y - p.y * 0.085 + p.x * 0.031) + 0.18 * sin(uWind.y * 1.7 - p.y * 0.21 + 1.3);
  d += aW0.w * (bone(uD[6], uD[7], p) + vec2(uWind.x * wave, uWind.z * wave));
  d.y -= aW2.w * uBreath.x + aW3 * uBreath.y;
  vUv = (p - uBox.xy) / uBox.zw;
  vec2 c = (p + d - uBox.xy) / uBox.zw;
  gl_Position = vec4(c.x * 2.0 - 1.0, 1.0 - c.y * 2.0, 0.0, 1.0);
}`;
const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex, uEye, uMask; uniform float uMode; uniform vec4 uER[3], uEP[3]; uniform vec2 uPx;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  if (uMode < 0.5) {
    for (int i = 0; i < 3; i++) {
      vec4 r = uER[i]; vec2 e = (vUv - r.xy) / r.zw;
      if (e.x >= 0.0 && e.y >= 0.0 && e.x <= 1.0 && e.y <= 1.0) {
        vec3 m = texture2D(uEye, vUv).rgb;
        float rh = r.w / uPx.y, h = m.b * rh, yl = e.y * rh - m.g * rh, c = uEP[i].x;
        if (h > 0.5 && yl >= -0.5 && yl <= h + 0.5) {
          if (yl < c * h + uEP[i].w) uv.y -= c * h * uPx.y;   // the lid: fur above the eye, its painted line at the edge
          else uv -= uEP[i].yz * uPx * m.r;                   // below it the iris looks where it is told
        }
      }
    }
  }
  vec4 col = texture2D(uTex, uv);
  if (uMode > 0.5) { vec3 k = texture2D(uMask, vUv).rgb; col *= uMode < 1.5 ? k.g : k.b; }
  gl_FragColor = col;
}`;

/** A critically damped (or springy) follower: to(target, settle seconds), kick(velocity). */
class Spring {
  constructor(x = 0, w = 3, z = .92) { this.x = this.t = x; this.v = 0; this.w = w; this.z = z; }
  to(t, dur) { this.t = t; if (dur) this.w = 4.6 / dur; return this; }
  kick(v) { this.v += v; return this; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt * this.w / .4)), h = dt / n;
    for (let i = 0; i < n; i++) { const a = this.w * this.w * (this.t - this.x) - 2 * this.z * this.w * this.v; this.v += a * h; this.x += this.v * h; }
    return this.x;
  }
}
const lionState = (ears, seed) => ({
  neckRot: new Spring(), neckX: new Spring(), neckY: new Spring(), headRot: new Spring(), headSx: new Spring(1),
  gx: new Spring(0, 7), gy: new Spring(0, 7), lid: new Spring(0, 9), ears: ears.map(() => new Spring(0, 14, .38)), hold: -9,
  blink: { at: -9, kind: 0, next: 1.2 + seed * 1.7 }, br: { ph: seed * .37, rate: 1, deep: 0 },
});
// blink lid curves: a quick blink and the slow, trusting blink cats give each other
const blinkCurve = (u, slow) => {
  const [c, h, o] = slow ? [.38, .32, .6] : [.06, .035, .11];
  if (u < 0) return 0; if (u < c) return Math.sin(u / c * Math.PI / 2) ** 2; if (u < c + h) return 1;
  return u < c + h + o ? 1 - Math.sin((u - c - h) / o * Math.PI / 2) ** 2 : 0;
};
const breathWave = ph => { const f = ph % 1, u = f < .42 ? f / .42 * .5 : .5 + (f - .42) / .58 * .5; return .5 - .5 * Math.cos(u * Math.PI * 2); };

export class Pride {
  /** data: loadPride(); planes: the rock-and-lions plane of the sunset and of the night (depth layers); env for the wind seed. */
  constructor(data, planes, { software = false } = {}) {
    const { rig, sheet, plate } = data, [X0, Y0, W, H] = rig.box;
    this.rig = rig; this.box = rig.box; this.planes = planes; this.software = software; this.R = rng(29);
    this.him = lionState([0], 0); this.her = lionState([0, 0], 1);
    this.tail = { th: [new Spring(0, 2.2, .7), new Spring(0, 1.9, .55), new Spring(0, 1.6, .45)], mood: 1, ph: 0, amp: .6 };
    this.lag = [new Spring(0, 2.8, .5), new Spring(0, 2.8, .5), new Spring(0, 2.8, .5)];   // where his head was: the mane trails it
    this.q = [];
    this.mane = follower({ stiffness: 5.5, damping: 2.5, mass: 1.6 }); this.wPrev = 0; this.gustAt = -9;
    this.k = -1; this.events = []; this.busy = { m: -9, f: -9 }; this.idleAt = 0; this.look = null; this.forced = null;
    this.eyeC = rig.eyes.map(e => e.c);
    this.beats = this.script();
    // ---------- GL ----------
    try { this.gl = this.initGL(sheet, plate); } catch (e) { this.gl = null; console.warn('lions: no WebGL rig', e); }
  }

  // ---------------------------------------------------------------------------------------------- the behaviour
  /** The motivated beats, on shot B's clock (seconds): film.js keeps its own events (birds 1–12 s from the right,
   *  the shooting star 10.5–11.6 s, the stars from 13 s) in step with these. */
  script() {
    const m = this.him, f = this.her, set = (s, v, d) => s.to(v, d);
    return [
      [.6, () => { this.tail.mood = 1; }],                                                        // her tail sways, content
      [2.5, () => { f.ears[1].kick(-1.6); this.busy.f = this.k; }],                               // the birds' wingbeats: her far ear turns to them
      [3.2, () => { set(m.gx, .35, .5); set(m.gy, -.75, .5); m.ears[0].kick(-1.2); }],            // he glances up at the birds
      [4.6, () => { set(m.gx, 0, .8); set(m.gy, 0, .8); }],
      [4.4, () => { set(f.headRot, -.034, 1.7); set(f.neckY, -.5, 1.9); set(f.gx, -.5, .6); set(f.gy, -.45, .6); }],   // she looks up at him
      [5.7, () => this.blink(f, true)],
      [6.5, () => { set(m.neckRot, -.014, 2.2); set(m.neckY, .6, 2.4); set(m.headRot, -.052, 2.1); set(m.headSx, .975, 2.1); this.lookAt(m, 'her', .5); m.ears[0].kick(1.1); }],  // he turns to her
      [8.1, () => this.blink(m, true)],                                                            // they meet eyes: a slow blink, answered
      [8.8, () => { this.blink(f, true); set(f.lid, .22, 1); }],
      [9.5, () => { set(f.neckX, -1.8, 2.6); set(f.neckY, .9, 2.6); set(f.headRot, -.068, 2.4); set(f.lid, .46, 2); this.tail.mood = .45; f.br.rate = .85; }],  // she leans into him
      [10.15, () => { set(m.headRot, -.082, 2.3); set(m.neckY, 1.15, 2.4); set(m.lid, .3, 1.8); m.br.rate = .88; }],  // he lowers his head to hers
      [10.75, () => { f.ears[0].kick(2.2); f.ears[1].kick(2.4); set(f.lid, .04, .25); this.look = 'shoot'; }],  // the shooting star: her ears, her eyes
      [11.9, () => { this.look = null; set(f.lid, .42, 1.2); set(f.gx, -.35, 1); set(f.gy, -.25, 1); }],
      [12.4, () => { m.br.deep = 1; }],                                                            // a long, contented breath
      [13.2, () => { set(m.neckRot, 0, 2.8); set(m.neckY, 0, 2.8); set(m.headRot, .02, 2.6); set(m.headSx, 1, 2.6); set(m.lid, 0, 1.5); m.br.rate = 1;
        set(f.headRot, -.03, 2.8); set(f.neckX, -1.1, 3); set(f.neckY, .35, 3); set(f.lid, .12, 1.6); f.br.rate = 1; this.tail.mood = .8;
        this.look = 'heart'; }],                                                                   // the stars gather: both look up
    ].sort((a, b) => a[0] - b[0]);
  }
  /** Something happened in the film: 'link' (a star she linked, at screen x, y), 'done', 'fall'. */
  event(kind, data = {}) { this.events.push([kind, data]); }
  /** Runs fn `delay` seconds from now on the shot's clock (so pausing or speed changes keep it in step). */
  later(delay, fn) { this.q.push([this.k + delay, fn]); }
  blink(L, slow = false) { L.blink.at = this.k; L.blink.kind = slow ? 2 : 1; L.blink.next = this.k + (slow ? 4 : 0) + 2.6 + this.R() * 4.2; }
  /** Points a lion's eyes at 'her' / 'him' or at an image point [x, y]; follow: how much the head comes along. */
  lookAt(L, at, dur = .4, follow = 0) {
    const who = L === this.him ? 0 : 1, e = this.eyeC[who === 0 ? 0 : 1];
    const P = at === 'her' ? this.eyeC[1] : at === 'him' ? this.eyeC[0] : at;
    const dx = P[0] - e[0], dy = P[1] - e[1], n = Math.hypot(dx, dy) || 1;
    const rest = who === 0 ? [-.86, -.5] : [-.9, -.43], gain = who === 0 ? 1.15 : 1.5, lim = who === 0 ? 1.3 : 1.8;
    let gx = (dx / n - rest[0]) * gain, gy = (dy / n - rest[1]) * gain; const g = Math.hypot(gx, gy); if (g > lim) { gx *= lim / g; gy *= lim / g; }
    L.gx.to(gx, dur); L.gy.to(gy, dur);
    if (follow) L.headRot.to((who === 0 ? -1 : 1) * gy * follow + (who === 0 ? .02 : -.03), dur * 4);
  }
  /** Shot B's clock k (s), frame dt, and what the film is showing: ctx = { T: plane 2's screen transform, W, H,
   *  heart: [x, y] screen or null, star: the falling star [x, y] screen or null, wind: { seed, dir } }. */
  update(k, dt, ctx) {
    dt = Math.min(dt, .1); this.k = k; const m = this.him, f = this.her, R = this.R;
    const toImg = ctx.T ? ([x, y]) => [(x - ctx.T.x) / ctx.T.s, (y - ctx.T.y) / ctx.T.s] : p => p;
    while (this.beats.length && k >= this.beats[0][0]) { this.beats.shift()[1](); this.idleAt = k; }
    for (let i = this.q.length - 1; i >= 0; i--) if (k >= this.q[i][0]) this.q.splice(i, 1)[0][1]();
    for (const [kind, d] of this.events.splice(0)) {
      if (kind === 'link') {   // their eyes follow the stars she draws; now and then an ear turns to the chime
        const P = toImg([d.x, d.y]); this.lookAt(f, P, .3, .004); this.later(.14 + R() * .22, () => this.lookAt(m, P, .45, .005));
        if (d.i % 3 === 1) (d.i % 2 ? m : f).ears[d.i % 2 ? 0 : 1].kick(d.i % 2 ? -1.4 : 1.6);
        this.idleAt = k; this.look = null;
      } else if (kind === 'done') {   // the heart is whole: he turns to her for a moment, she closes her eyes, smiling
        this.lookAt(m, 'her', .5); m.headRot.to(-.045, 1.4); m.neckY.to(.5, 1.6); this.blink(f, true);
        const H = ctx.heart ? toImg(ctx.heart) : [600, 60]; this.later(1.6, () => { this.lookAt(m, H, .6); m.headRot.to(.025, 1.8); m.neckY.to(0, 2); });
        this.idleAt = k + 2; this.look = null;
      } else if (kind === 'fall') { this.look = 'star'; f.ears[0].kick(2); f.ears[1].kick(2); m.ears[0].kick(1.8); f.lid.to(0, .3); m.lid.to(0, .3); this.idleAt = k; }
    }
    // a gaze that tracks something moving
    if (this.look === 'heart' && ctx.heart) { const P = toImg(ctx.heart); if (k > m.hold) this.lookAt(m, P, .8, .006); if (k > f.hold) this.lookAt(f, P, .6, .005); }
    if (this.look === 'star' && ctx.star) { const P = toImg(ctx.star); this.lookAt(m, P, .25, .012); this.lookAt(f, P, .2, .01); }
    if (this.look === 'shoot' && ctx.shoot) { const P = toImg(ctx.shoot); this.lookAt(f, P, .2); }
    // ---------- idle life (after the scripted beats): one small thing at a time, seeded and varied ----------
    if (!this.beats.length && k - this.idleAt > 3.2 + R() * .2) {
      this.idleAt = k + R() * 2.8; const r = R();
      if (r < .22) { const d = 1.8 + R() * 1.2; m.hold = k + d + .6; this.lookAt(m, 'her', .5); m.headRot.to(-.03, 1.6); this.later(d, () => { if (this.look !== 'star' && this.look !== 'heart') { m.gx.to(-.2, .8); m.gy.to(-.6, .8); m.headRot.to(.015, 2); } }); }
      else if (r < .4) f.headRot.to(f.headRot.t + (R() - .55) * .016, 1.6);          // she settles her head against him
      else if (r < .55) m.br.deep = 1;                                               // a sigh
      else if (r < .7) f.ears[R() < .5 ? 0 : 1].kick((R() < .5 ? -1 : 1) * (1.2 + R()));
      else if (r < .82) this.tail.mood = .4 + R() * .7;
      else if (r < .92) { f.hold = k + 1.8; this.lookAt(f, 'him', .4); }  // she peeks at him
      else m.ears[0].kick(-1.3);
    }
    // ---------- the wind (its own gusts, travelling toward screen right on the savanna: off the setting sun) ----------
    const wd = ctx.wind || {}, dir = wd.dir ?? 1, xm = ctx.T ? clamp(((ctx.T.x + ctx.T.s * 790) / (ctx.W || 1))) : .5, x01 = dir > 0 ? xm : 1 - xm;
    const wv = windAt(ctx.t ?? k, x01, { seed: wd.seed ?? 7 }); this.maneAmp = dir * (.45 + 2.9 * this.mane(dt, wv)); this.wavePh = (this.wavePh || 0) + dt * (1.6 + 1.8 * wv);
    if (wv - this.wPrev > .012 && wv > .48 && k - this.gustAt > 3.5) {   // a gust arrives: ears answer it (hers flatten a touch, his flicks)
      this.gustAt = k; if (R() < .75) f.ears[0].kick(-1.5 - R()); if (R() < .6) this.later(.26 + R() * .3, () => m.ears[0].kick(-1.2));
    }
    this.wPrev = this.wPrev * .8 + wv * .2;
    // ---------- blinks ----------
    for (const L of [m, f]) {
      const b = L.blink; if (k >= b.next) { this.blink(L, false); if (R() < .2) b.next = k + .32; }
      L.blinkLid = blinkCurve(k - b.at, b.kind === 2);
      // breathing; a sigh is one slower, deeper cycle, begun when the last one has run out (so it never jumps)
      const br = L.br; if (br.deep && br.end == null) br.end = Math.floor(br.ph) + 2;
      br.dc = br.end != null && br.ph >= br.end - 1 ? 1 : 0; if (br.end != null && br.ph >= br.end) { br.deep = 0; br.end = null; br.dc = 0; }
      br.ph += dt * br.rate / (L === m ? 4.6 : 3.9) * (br.dc ? .62 : 1);
      for (const s of [L.neckRot, L.neckX, L.neckY, L.headRot, L.headSx, L.gx, L.gy, L.lid, ...L.ears]) s.step(dt);
    }
    // ---------- the tail: a lazy sway driven at the root, the rest following with lag ----------
    const T = this.tail; T.ph += dt * (.13 + .05 * Math.sin(k * .21)) * T.mood;
    const sway = T.mood * (-.03 - .045 * (.5 + .5 * Math.sin(T.ph * Math.PI * 2)) - .02 * Math.max(0, Math.sin(T.ph * 4.7)));
    T.th[0].to(sway, 0); T.th[1].to(T.th[0].x * 1.25 - .015 * T.mood, 0); T.th[2].to(T.th[1].x * 1.35 - .05 * T.mood * (.5 + .5 * Math.sin(T.ph * 9.3)), 0);
    T.th.forEach(s => s.step(dt));
    this.lag[0].to(m.neckRot.x, 0); this.lag[1].to(m.headRot.x, 0); this.lag[2].to(m.neckY.x, 0); this.lag.forEach(s => s.step(dt));
    this.dirty = true;
  }
  /** Bone deltas for the shader: 11 bones x 2 rows of (a, b, c): x' - x = a x + b y + c. */
  pose() {
    const rig = this.rig, m = this.him, f = this.her, F = this.forced || {};
    const v = (key, s) => F[key] ?? (typeof s === 'number' ? s : s.x);
    const L = (p, rot = 0, sx = 1, tx = 0, ty = 0) => { const c = Math.cos(rot), s = Math.sin(rot), a = c * sx, b = -s, d = s * sx, e = c; return [a, b, p[0] + tx - a * p[0] - b * p[1], d, e, p[1] + ty - d * p[0] - e * p[1]]; };
    const mul = (A, B) => [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2], A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
    const P = k => rig.bones[k].p, I = [1, 0, 0, 0, 1, 0];
    const th = this.tail.th.map(s => s.x), dt3 = [th[0], th[1] - th[0], th[2] - th[1]];
    const loc = {
      'm.neck': L(P('m.neck'), v('m.neckRot', m.neckRot), 1, v('m.neckX', m.neckX), v('m.neckY', m.neckY)),
      'm.head': L(P('m.head'), v('m.headRot', m.headRot), v('m.headSx', m.headSx)),
      'm.ear': L(P('m.ear'), v('m.ear', m.ears[0]) * 1.1),
      'f.neck': L(P('f.neck'), v('f.neckRot', f.neckRot), 1, v('f.neckX', f.neckX), v('f.neckY', f.neckY)),
      'f.head': L(P('f.head'), v('f.headRot', f.headRot), v('f.headSx', f.headSx)),
      'f.earL': L(P('f.earL'), v('f.earL', f.ears[0]) * -1), 'f.earR': L(P('f.earR'), v('f.earR', f.ears[1]) * -.9),
      t1: L(P('t1'), v('t1', { x: dt3[0] })), t2: L(P('t2'), v('t2', { x: dt3[1] })), t3: L(P('t3'), v('t3', { x: dt3[2] })),
    };
    const world = {};
    for (const k of ['m.neck', 'm.head', 'm.ear', 'f.neck', 'f.head', 'f.earL', 'f.earR', 't1', 't2', 't3']) { const par = rig.bones[k].parent; world[k] = par ? mul(world[par], loc[k]) : loc[k]; }
    // the mane's lag: where the head was a moment ago, minus where it is
    const lagW = F.noLag ? world['m.head'] : mul(L(P('m.neck'), this.lag[0].x, 1, v('m.neckX', m.neckX), this.lag[2].x), L(P('m.head'), this.lag[1].x, v('m.headSx', m.headSx)));
    const D = new Float32Array(66);
    BONES.forEach((k, i) => {
      let d;
      if (k === 'lag') d = lagW.map((x, j) => (x - world['m.head'][j]) * .7);
      else { const par = rig.bones[k].parent, Wp = par ? world[par] : I; d = world[k].map((x, j) => x - Wp[j]); }
      D.set([d[0], d[1], d[2], d[3], d[4], d[5]], i * 6);
    });
    return { D, world, breath: [v('m.breath', (1.15 + .9 * (m.br.dc || 0)) * breathWave(m.br.ph)), v('f.breath', .95 * (1 + .6 * (f.br.dc || 0)) * breathWave(f.br.ph))],
      eyes: this.rig.eyes.map(e => { const L = e.who ? f : m; return [clamp(Math.max(v(e.who ? 'f.lid' : 'm.lid', L.lid), F.lid ?? L.blinkLid ?? 0), 0, 1 - e.liner / e.h - .02), v(e.who ? 'f.gx' : 'm.gx', L.gx), v(e.who ? 'f.gy' : 'm.gy', L.gy), e.liner]; }),
      wind: [F.wind ?? this.maneAmp ?? 0, this.wavePh || 0, -.22 * Math.abs(F.wind ?? this.maneAmp ?? 0)] };
  }

  // ---------------------------------------------------------------------------------------------- drawing
  initGL(sheet, plate) {
    const [X0, Y0, W, H] = this.box, rig = this.rig;
    const glc = canvas(W, H), gl = glc.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
    if (!gl) return null;
    this.glc = glc;
    glc.addEventListener('webglcontextlost', e => { e.preventDefault(); this.gl = null; });
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const U = n => gl.getUniformLocation(pr, n), A = n => gl.getAttribLocation(pr, n);
    this.u = { D: U('uD'), breath: U('uBreath'), wind: U('uWind'), box: U('uBox'), mode: U('uMode'), ER: U('uER'), EP: U('uEP'), px: U('uPx'), tex: U('uTex'), eye: U('uEye'), mask: U('uMask') };
    this.a = { P: A('aP'), W0: A('aW0'), W1: A('aW1'), W2: A('aW2'), W3: A('aW3') };
    // ---- the weight sheet ----
    const sc = canvas(W, H * 6), sg = sc.getContext('2d', { willReadFrequently: true }); sg.drawImage(sheet, 0, 0);
    const px = sg.getImageData(0, 0, W, H * 6).data;
    const at = (t, c, x, y) => { // a vertex sits on a pixel corner: the mean of the four pixels around it
      const x0 = clamp(Math.floor(x) - 1, 0, W - 1), x1 = clamp(Math.floor(x), 0, W - 1), y0 = clamp(Math.floor(y) - 1, 0, H - 1), y1 = clamp(Math.floor(y), 0, H - 1), o = t * H;
      return (px[((o + y0) * W + x0) * 4 + c] + px[((o + y0) * W + x1) * 4 + c] + px[((o + y1) * W + x0) * 4 + c] + px[((o + y1) * W + x1) * 4 + c]) / 1020;
    };
    const root = rig.tail[0], rootR = rig.layers.tailRoot + 2;
    const attr = {
      base: (x, y, o) => { const X = x + X0, Y = y + Y0, nearRoot = Math.hypot(X - root[0], Y - root[1]) < rootR;
        o.set([at(0, 0, x, y), at(0, 1, x, y), at(0, 2, x, y), at(1, 0, x, y), at(2, 0, x, y), at(2, 1, x, y), at(2, 2, x, y), at(3, 0, x, y), nearRoot ? at(3, 1, x, y) : 0, 0, 0, at(1, 1, x, y) * 2, at(1, 2, x, y) * 2]); },
      tail: (x, y, o) => o.set([0, 0, 0, 0, 0, 0, 0, 0, at(3, 1, x, y), at(3, 2, x, y), at(4, 0, x, y), 0, at(1, 2, x, y) * 2]),
      occ: (x, y, o) => o.set([at(0, 0, x, y), at(0, 1, x, y), at(0, 2, x, y), at(1, 0, x, y), 0, 0, 0, 0, 0, 0, 0, at(1, 1, x, y) * 2, 0]),
    };
    const rel = r => [r[0] - X0, r[1] - Y0, r[2], r[3]];
    this.meshes = { base: this.mesh(gl, [0, 0, W, H], 3, attr.base), tail: this.mesh(gl, rel(rig.layers.tail), 2, attr.tail), occ: this.mesh(gl, rel(rig.layers.occ), 3, attr.occ) };
    // ---- textures: the painting's plane (sunset, night) as is, and with the tail inpainted away; masks; eye map ----
    const tex = (src, premul) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
      return t;
    };
    const tile = k => { const c = canvas(W, H); c.getContext('2d').drawImage(sheet, 0, k * H, W, H, 0, 0, W, H); return c; };
    this.texMask = tex(tile(4), false); this.texEye = tex(tile(5), false);
    const [px0, py0, pw, ph] = rig.plate.rect;
    this.tex = this.planes.map((l, i) => {
      const c = canvas(W, H), cg = c.getContext('2d'); cg.drawImage(l.img, l.x - X0, l.y - Y0);
      const orig = tex(c, true);
      cg.clearRect(px0 - X0, py0 - Y0, pw, ph); cg.drawImage(plate, i * pw, 0, pw, ph, px0 - X0, py0 - Y0, pw, ph);
      return { orig, base: tex(c, true) };
    });
    gl.uniform4f(this.u.box, X0, Y0, W, H); gl.uniform2f(this.u.px, 1 / W, 1 / H);
    gl.uniform4fv(this.u.ER, new Float32Array(rig.eyes.flatMap(e => [(e.rect[0] - X0) / W, (e.rect[1] - Y0) / H, e.rect[2] / W, e.rect[3] / H])));
    gl.uniform1i(this.u.tex, 0); gl.uniform1i(this.u.eye, 1); gl.uniform1i(this.u.mask, 2);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.DEPTH_TEST);
    return gl;
  }
  /** A grid mesh over a rect of the box (box px), vertices every `step` px, with the rig's weights per vertex. */
  mesh(gl, [rx, ry, rw, rh], step, fill) {
    const nx = Math.ceil(rw / step) + 1, ny = Math.ceil(rh / step) + 1, n = nx * ny, P = new Float32Array(n * 2), Wt = new Float32Array(n * 13), o = new Float32Array(13);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = Math.min(rx + i * step, rx + rw), y = Math.min(ry + j * step, ry + rh), v = j * nx + i;
      P[v * 2] = x + this.box[0]; P[v * 2 + 1] = y + this.box[1]; fill(x, y, o); Wt.set(o, v * 13);
    }
    const idx = new Uint16Array((nx - 1) * (ny - 1) * 6); let q = 0;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.set([a, b, c, b, d, c], q); q += 6; }
    const buf = (data, target = gl.ARRAY_BUFFER) => { const bb = gl.createBuffer(); gl.bindBuffer(target, bb); gl.bufferData(target, data, gl.STATIC_DRAW); return bb; };
    return { P: buf(P), W: buf(Wt), I: buf(idx, gl.ELEMENT_ARRAY_BUFFER), count: idx.length, n };
  }
  /** Renders plane i (0 sunset, 1 night) with the lions posed into the GL canvas, at `scale` canvas px per painting px. */
  render(i, scale) {
    const gl = this.gl, [, , W, H] = this.box; if (!gl) return false;
    const w = Math.round(W * scale), h = Math.round(H * scale);
    if (this.glc.width !== w || this.glc.height !== h) { this.glc.width = w; this.glc.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const p = this._pose && !this.dirty ? this._pose : (this._pose = this.pose()); this.dirty = false;
    gl.uniform3fv(this.u.D, p.D); gl.uniform2f(this.u.breath, p.breath[0], p.breath[1]); gl.uniform4f(this.u.wind, p.wind[0], p.wind[1], p.wind[2], 0);
    gl.uniform4fv(this.u.EP, new Float32Array(p.eyes.flat()));
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texEye); gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    const draw = (mesh, texture, mode) => {
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture); gl.uniform1f(this.u.mode, mode);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.P); gl.enableVertexAttribArray(this.a.P); gl.vertexAttribPointer(this.a.P, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.W);
      [[this.a.W0, 4, 0], [this.a.W1, 4, 16], [this.a.W2, 4, 32], [this.a.W3, 1, 48]].forEach(([loc, n, off]) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, 52, off); });
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.I); gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    };
    const t = this.tex[i];
    draw(this.meshes.base, t.base, 0); draw(this.meshes.tail, t.orig, 1); draw(this.meshes.occ, t.orig, 2);
    return true;
  }
  /** Draws the rock-and-lions plane of `view` (plane index 2) into g: the plane around the lions' box as painted, and the
   *  box through the rig. res: canvas px per CSS px of g. */
  draw(g, view, i, res = 1) {
    const l = this.planes[i], T = view.T[2], s = T.s, ox = T.x + s * l.x, oy = T.y + s * l.y, [X0, Y0, W, H] = this.box;
    const scale = clamp(Math.ceil(s * res * (this.software ? 2 : 4)) / (this.software ? 2 : 4), .5, this.software ? 1 : 2.5);
    if (!this.gl || this.lost || !this.render(i, scale)) { g.drawImage(l.img, ox, oy, l.w * s, l.h * s); return; }
    // the plane around the box (1 px of overlap under the box's edges hides any seam)
    const bx = X0 - l.x, by = Y0 + H - l.y;
    g.drawImage(l.img, 0, 0, bx + 1, l.h, ox, oy, (bx + 1) * s, l.h * s);
    g.drawImage(l.img, bx + W - 1, 0, l.w - bx - W + 1, l.h, ox + (bx + W - 1) * s, oy, (l.w - bx - W + 1) * s, l.h * s);
    g.drawImage(l.img, bx - 1, by - 1, W + 2, l.h - by + 1, ox + (bx - 1) * s, oy + (by - 1) * s, (W + 2) * s, (l.h - by + 1) * s);
    if (Y0 > l.y) g.drawImage(l.img, bx - 1, 0, W + 2, Y0 - l.y + 1, ox + (bx - 1) * s, oy, (W + 2) * s, (Y0 - l.y + 1) * s);
    g.drawImage(this.glc, T.x + s * X0, T.y + s * Y0, W * s, H * s);
  }
  /** Test hook: the GL output of plane i at a forced pose (null = the live one), as RGBA pixels, top row first. */
  snapshot(i = 0, forced = null, scale = 2) {
    const keep = this.forced; this.forced = forced; this.dirty = true; this.render(i, scale); this.forced = keep; this.dirty = true;
    const gl = this.gl, w = this.glc.width, h = this.glc.height, out = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
    const c = canvas(w, h), cg = c.getContext('2d'), im = cg.createImageData(w, h);
    for (let y = 0; y < h; y++) im.data.set(out.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    for (let q = 0; q < im.data.length; q += 4) { const a = im.data[q + 3]; if (a && a < 255) { im.data[q] = im.data[q] * 255 / a; im.data[q + 1] = im.data[q + 1] * 255 / a; im.data[q + 2] = im.data[q + 2] * 255 / a; } }
    cg.putImageData(im, 0, 0); return c.toDataURL('image/png');
  }
  /** Current pose numbers (debug / tests). */
  state() { const p = this.pose(); return { k: this.k, gl: !!this.gl, him: { head: this.him.headRot.x, neck: [this.him.neckRot.x, this.him.neckX.x, this.him.neckY.x], gaze: [this.him.gx.x, this.him.gy.x], lid: p.eyes[0][0] }, her: { head: this.her.headRot.x, neck: [this.her.neckRot.x, this.her.neckX.x, this.her.neckY.x], gaze: [this.her.gx.x, this.her.gy.x], lid: p.eyes[1][0] }, tail: this.tail.th.map(s => s.x), breath: p.breath, mane: p.wind[0] }; }
  dispose() { try { this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* gone */ } this.gl = null; }
}
