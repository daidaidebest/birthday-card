// The envelope's satin ribbon and bow: rendered in Cycles (tools/blender/ribbon.py, packed by tools/ribbon_pack.py into
// assets/img/ribbon/), played here on a canvas laid over the opening envelope. A tap unties it (the right tail is drawn
// out, its loop slips through the knot, the knot lets go and the slack ribbon slides down off the envelope); a drag
// on the bow pulls the tail herself: the rendered motion follows her finger through a spring, keeps her momentum when
// she lets go, and once the loop has slipped through the knot it finishes by itself. The card's back shows the same
// bow as a still (ribbonStill()). Missing frames: the still slips away instead; nothing at all: the tap just opens.
import { asset, loadImage, clamp, lerp, smooth } from './util.js';

const DIR = 'img/ribbon/';
const R = { m: null, still: null, frames: [], ready: false, failed: false };

// Manifest + still first (the card's back needs it while the letter falls); the frames follow in the background.
export async function loadRibbon() {
  if (R.m || R.failed) return R;
  try {
    const res = await fetch(asset(DIR + 'ribbon.json')); if (!res.ok) throw new Error(res.status);
    R.m = await res.json();
    R.still = await loadImage(asset(DIR + R.m.still)).catch(() => null);
    R.loading = Promise.all(R.m.frames.map(([f], i) => loadImage(asset(DIR + f)).then(im => { R.frames[i] = im; }).catch(() => { R.frames[i] = null; })))
      .then(() => { R.ready = R.frames.every(Boolean); });
  } catch (e) { R.failed = true; }
  return R;
}

// The bow on the card's back (same placement as the canvas over the opened envelope).
export function ribbonStill() {
  if (!R.m || !R.still) return '';
  const r = R.m.rect;
  return `<img class="ribbon-still" alt="" src="${asset(DIR + R.m.still)}" style="left:${r.left * 100}%;top:${r.top * 100}%;width:${r.width * 100}%;height:${r.height * 100}%">`;
}

export class Ribbon {
  // host: the envelope box (.pro-env). opts: onStart() when she takes hold of it, onLoose() when the loop slips through
  // the knot (open the envelope from here), onFree() when the ribbon has left the flap, onDone() when it is gone.
  constructor(host, opts = {}) {
    this.host = host; this.o = opts; this.m = R.m;
    this.t = 0; this.v = 0; this.mode = 'idle'; this.fired = {}; this.alpha = 1; this.enabled = true;   // the scene gates it (enabled = false until it lies flap-up)
    const c = this.cv = document.createElement('canvas'); c.className = 'ribbon-cv'; c.setAttribute('aria-hidden', 'true');
    if (this.m) { const r = this.m.rect; Object.assign(c.style, { left: r.left * 100 + '%', top: r.top * 100 + '%', width: r.width * 100 + '%', height: r.height * 100 + '%' }); }
    host.appendChild(c); this.g = c.getContext('2d');
    this.T = this.m ? this.m.t : { pop: .3, free: .6, end: .9 };
    this.down = this.down.bind(this); this.move = this.move.bind(this); this.up = this.up.bind(this);
    host.addEventListener('pointerdown', this.down); addEventListener('pointermove', this.move, { passive: true }); addEventListener('pointerup', this.up); addEventListener('pointercancel', this.up);
    this.resize(); this.draw();
  }
  get untied() { return this.mode !== 'idle' && this.mode !== 'drag' && this.mode !== 'back'; }
  // ---------- input ----------
  local(e) { const b = this.host.getBoundingClientRect(); return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height]; }
  down(e) {
    if (!this.enabled || (this.mode !== 'idle' && this.mode !== 'back')) return;
    const p = this.local(e), gr = this.m && this.m.grab;
    this.drag = { p0: p, moved: false, on: gr && Math.hypot(p[0] - gr[0], (p[1] - gr[1]) / 1.4634) < gr[2], last: performance.now(), tLast: this.t };
  }
  move(e) {
    const d = this.drag; if (!d) return;
    const p = this.local(e);
    if (!d.moved && Math.hypot(p[0] - d.p0[0], p[1] - d.p0[1]) > .02) {
      if (!d.on || !this.frames()) { this.drag = null; return; }      // a swipe off the bow is not a pull
      d.moved = true; this.mode = 'drag'; this.start();
    }
    if (d.moved) this.target = this.tFor(p[0] - d.p0[0], p[1] - d.p0[1]);
  }
  up() {
    const d = this.drag; this.drag = null; if (!d) return;
    if (!d.moved) { this.play(); return; }                             // a tap: it unties itself
    // let go: a quick pull or one that is well on its way carries through, a hesitant one settles back into the bow
    if (this.v > .35 || this.t > this.T.pop * .55) this.go(Math.max(1, Math.min(2.2, this.v)));
    else this.mode = 'back';
  }
  // the time at which the tail's tip (as rendered) is nearest to where her finger has drawn it
  tFor(dx, dy) {
    const P = this.m.pull, x0 = P[0][1], y0 = P[0][2]; let best = 0, bd = 1e9;
    for (const [t, x, y] of P) { const dd = (x - x0 - dx) ** 2 + ((y - y0 - dy) / 1.4634) ** 2; if (dd < bd) { bd = dd; best = t; } }
    return Math.min(best, this.T.pop * .97);
  }
  // ---------- control ----------
  frames() { return R.ready || (R.frames.length && R.frames.filter(Boolean).length > R.frames.length * .9); }
  start() { if (!this.fired.start) { this.fired.start = true; this.o.onStart?.(); } }
  play() { if (this.untied) return; this.start(); this.go(1); }
  go(rate) {
    this.rate = rate;
    if (this.frames()) this.mode = 'auto';
    else if (R.loading && !R.failed && this.mode !== 'wait') { this.mode = 'wait'; this.waited = 0; }   // the frames are still on their way
    else { this.mode = 'fallback'; this.t = 0; }
  }
  fire(k, t) { if (!this.fired[k] && this.t >= t) { this.fired[k] = true; this.o['on' + k[0].toUpperCase() + k.slice(1)]?.(); } }
  update(dt) {
    dt = Math.min(dt, .05);
    if (this.mode === 'drag') {                     // a spring between her finger and the fabric: it lags, then catches up
      const k = 140, c = 2 * Math.sqrt(k) * .9, a = k * ((this.target ?? 0) - this.t) - c * this.v;
      this.v += a * dt; this.t = clamp(this.t + this.v * dt, 0, this.T.pop * .97);
      if (this.t > this.T.pop * .9) this.go(Math.max(1, this.v));    // the loop has slipped: it goes on its own now
    } else if (this.mode === 'back') {              // it settles back into the bow
      const k = 60, c = 2 * Math.sqrt(k), a = -k * this.t - c * this.v;
      this.v += a * dt; this.t = Math.max(0, this.t + this.v * dt); if (this.t < .002 && Math.abs(this.v) < .01) { this.t = 0; this.v = 0; this.mode = 'idle'; }
    } else if (this.mode === 'wait') {
      this.waited += dt; if (this.frames()) this.go(1); else if (this.waited > 1.5) { this.mode = 'fallback'; this.t = 0; }
    } else if (this.mode === 'auto' || this.mode === 'fallback') {
      this.rate = lerp(this.rate, 1, 1 - Math.exp(-dt * 2.5)); this.v = this.rate; this.t += dt * this.rate;
      this.fire('loose', this.T.pop); this.fire('free', this.T.free);
      const end = this.mode === 'fallback' ? .9 : this.T.end;
      this.alpha = 1 - smooth((this.t - (end - .3)) / .3);
      if (this.t >= end) { this.mode = 'done'; this.fire('done', 0); this.cv.style.visibility = 'hidden'; }
    }
    if (this.mode !== 'idle' && this.mode !== 'done') this.draw();
  }
  // ---------- drawing ----------
  resize() {
    if (!this.m) return;
    const b = this.host.getBoundingClientRect(), r = this.m.rect, cw = b.width * r.width, ch = b.height * r.height;
    if (!cw) return;
    const s = Math.min(devicePixelRatio || 1, 2.5, (this.m.stillSize || this.m.size)[0] / cw);  // never more pixels than were rendered
    this.cv.width = Math.round(cw * s); this.cv.height = Math.round(ch * s); this.draw();
  }
  draw() {
    const g = this.g, W = this.cv.width, H = this.cv.height; g.clearRect(0, 0, W, H);
    if (!this.m) return;
    const sx = W / this.m.size[0], sy = H / this.m.size[1];
    g.globalAlpha = this.alpha;
    if (this.mode === 'fallback' || this.mode === 'wait' || (this.t === 0 && R.still)) {     // the still: whole, or slipping down and away
      if (!R.still) return;
      const k = this.mode === 'fallback' ? clamp(this.t / .9) : 0, e = k * k;
      g.globalAlpha = this.alpha * (1 - smooth(k * 1.2 - .2)); g.drawImage(R.still, 0, H * e * .35, W, H); g.globalAlpha = 1; return;
    }
    // between two rendered frames: an exact cross-dissolve of the premultiplied images (no double edges)
    const n = this.m.frames.length, ft = clamp(this.t * this.m.fps, 0, n - 1), i = Math.floor(ft), a = ft - i;
    const one = (j, al, op) => { const im = R.frames[j], f = this.m.frames[j]; if (!im || al <= 0) return; g.globalAlpha = al * this.alpha; g.globalCompositeOperation = op; g.drawImage(im, f[1] * sx, f[2] * sy, f[3] * sx, f[4] * sy); };
    // the hand takes up the slack before anything moves (grip): the sharper still hands over to the frames under motion
    const k = R.still ? clamp((this.t - this.T.grip) / .12) : 1;
    if (k < 1) { g.globalAlpha = this.alpha * (1 - k); g.drawImage(R.still, 0, 0, W, H); }
    one(i, (1 - a) * k, k < 1 ? 'lighter' : 'source-over'); if (i + 1 < n) one(i + 1, a * k, 'lighter');
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  destroy() {
    R.frames = []; R.ready = false;   // 52 decoded frames are heavy on a phone: let them go after the prologue (a replay gets the still)
    this.host.removeEventListener('pointerdown', this.down); removeEventListener('pointermove', this.move); removeEventListener('pointerup', this.up); removeEventListener('pointercancel', this.up);
    this.cv.remove();
  }
}
