// The two lights (v21). Two small points of warm light, always together, that travel the whole story with her: they drift out
// of the moon she tapped, turn up now and then in the upper air of a chapter, come to her finger, go ahead of her into
// each chapter's point of light and walk the road past Shenzhen. At the very end they walk on along a road that appears
// only behind them, toward the first light, and out of the frame. They are the film's smallest characters, so they rest
// more than they show, move slowly, and step aside (quiet) for a page, a letter, a photograph or the candles.
// Drawn by fx.js on its canvas: two sprites a frame, nothing at all while they rest. Off for reduced motion.
import { glowSprite, clamp, noise1, TAU } from './util.js';

const REST = [12, 20], SHOW = [8, 13];   // seconds
const pick = ([a, b]) => a + Math.random() * (b - a);

export class Pair {
  constructor(fx, env) {
    this.fx = fx; this.env = env; this.off = env.reduced; this.why = new Set(); this.band = null;
    this.x = this.y = -99; this.vx = this.vy = 0; this.a = 0; this.t = 0; this.s = Math.random() * 9; this.mode = 'rest'; this.until = 1e9; this.from = null; this.spot = null;
    this.g1 = glowSprite('255,228,178', 64, 2); this.g2 = glowSprite('255,206,196', 64, 2); this.roadA = 0; this.safe = null; this.safeAt = -9; this.dust = 0;
  }
  get active() { return !this.off && (this.a > .004 || this.roadA > 0); }
  /** Some moments want the frame to themselves. */
  quiet(why, on) { if (on) this.why.add(why); else this.why.delete(why); }
  /** Where they may wander in this chapter, in CSS px [x0, y0, x1, y1]; null: the upper air of the frame. */
  zone(b) { this.band = b; }
  /** They come out of a point, after a moment: the moon, or the light a chapter has just opened from. */
  appear(x, y, after = 0) { this.from = [x, y]; this.mode = 'rest'; this.until = this.t + after; }
  place(x, y) { this.x = x; this.y = y; this.vx = this.vy = 0; }
  /** They go ahead of her into a point of light, and come out of it again a little later. */
  lead(x, y, { sec = 1.4, again = 3.4 } = {}) {
    if (this.off) return;
    if (this.a < .08) this.place(x + (x < this.env.W / 2 ? 90 : -90), y + 70);
    this.mode = 'lead'; this.spot = [x, y]; this.until = this.t + sec; this.again = again; this.from = [x, y];
  }
  /** She touched the night (or the wall): they come to her finger for a moment and circle it. */
  touch(x, y) {
    if (this.off || this.why.size || this.mode === 'lead' || this.mode === 'walk') return;
    if (this.a < .08) this.place(x + (Math.random() < .5 ? -70 : 70), y - 60);
    this.mode = 'seek'; this.spot = [x, y - 24]; this.until = this.t + 2.6;
  }
  /** They are the tip of something moving (the road on the map): set each frame. */
  carry(x, y) {
    if (this.off) return;
    if (this.mode !== 'carry') { this.mode = 'carry'; this.place(x, y); } else { this.x = x; this.y = y; }
    this.until = this.t + .25;
  }
  /** The end: they set off along the road, and it appears behind them. */
  walk() { if (this.off) return; this.why.clear(); this.mode = 'walk'; this.a = 0; this.place(-30, this.roadY(-30)); this.roadA = 1; this.walked = 0; }
  roadY(x) { const { W, H } = this.env, u = x / W; return H * (.84 - .13 * u + .012 * Math.sin(u * 7)); }
  home() {
    const { env } = this, W = env.W, H = env.H;
    if (this.t - this.safeAt > 2 || !this.safe) { this.safe = env.safe(); this.safeAt = this.t; }
    const sf = this.safe; return this.band || [sf.l + W * .1, sf.t + 34, W - sf.r - W * .1, Math.max(sf.t + 70, H * .32)];
  }
  step(dt) {
    if (this.off) return;
    const t = this.t += dt, { env } = this, hidden = this.why.size > 0;
    let want = 0, k = 1, go = null;
    if (this.mode === 'rest') {
      if (t > this.until && !hidden) { this.mode = 'wander'; this.until = t + pick(SHOW); const b = this.home(); if (this.from) this.place(...this.from); else this.place(b[0] + Math.random() * (b[2] - b[0]), b[1] + Math.random() * (b[3] - b[1])); this.from = null; }
    } else if (this.mode === 'wander') {
      want = 1; const [x0, y0, x1, y1] = this.home();
      go = [x0 + (x1 - x0) * (.5 + .5 * Math.sin(t * .09 + this.s) * Math.cos(t * .037 + this.s)), y0 + (y1 - y0) * (.5 + .5 * Math.sin(t * .13 + this.s * 2))];
      if (t > this.until) { this.mode = 'rest'; this.until = t + pick(REST); }
    } else if (this.mode === 'seek') {
      want = 1; k = 1.5; const c = t * 1.1; go = [this.spot[0] + Math.cos(c) * 16, this.spot[1] + Math.sin(c) * 10];
      if (t > this.until) { this.mode = 'wander'; this.until = t + pick(SHOW); }
    } else if (this.mode === 'lead') {
      want = 1; k = 2.6; go = this.spot;
      if (t > this.until || Math.hypot(this.x - go[0], this.y - go[1]) < 12) { this.mode = 'rest'; this.until = t + this.again; }
    } else if (this.mode === 'carry') {
      want = 1; if (t > this.until) { this.mode = 'rest'; this.until = t + pick(REST); }
    } else if (this.mode === 'walk') {
      const W = env.W; this.x += W / 38 * dt; this.y = this.roadY(this.x); want = this.x < W + 26 ? 1 : 0; if (want === 0) this.roadA += (.42 - this.roadA) * (1 - Math.exp(-dt * .25));
    }
    if (hidden && this.mode !== 'lead' && this.mode !== 'carry' && this.mode !== 'walk') want = 0;
    this.a += (want - this.a) * (1 - Math.exp(-dt * (want > this.a ? (this.mode === 'lead' || this.mode === 'carry' ? 3 : 1) : 2.2)));
    if (go) { this.vx += (go[0] - this.x) * k * k * dt; this.vy += (go[1] - this.y) * k * k * dt; const d = Math.exp(-2 * k * dt); this.vx *= d; this.vy *= d; this.x += this.vx * dt; this.y += this.vy * dt; }
    if (this.a > .4 && (this.dust -= dt) < 0) { this.dust = .55; if (env.q === 1) this.fx.trail(this.x, this.y, { life: 1.6, size: .7, vy: -5, spread: 4, color: '255,226,180' }); }
  }
  draw(c) {
    if (!this.active) return;
    const t = this.t, { W, H } = this.env, u = clamp(Math.min(W, H) / 390, 1, 1.4);
    if (this.roadA > 0) {   // the road, only ever behind them: it is there because they walked it
      const end = Math.min(this.x - 12 * u, W + 24), gr = c.createLinearGradient(end - W * .8, 0, end, 0); gr.addColorStop(0, 'rgba(255,224,170,.1)'); gr.addColorStop(1, 'rgba(255,226,176,.75)');
      c.save(); c.globalAlpha = this.roadA; c.strokeStyle = gr; c.lineWidth = 1.1; c.setLineDash([3, 7]); c.beginPath();
      for (let x = -24; x < end; x += 12) x === -24 ? c.moveTo(x, this.roadY(x)) : c.lineTo(x, this.roadY(x)); c.stroke(); c.restore();
    }
    if (this.a <= .004) return;
    const d = (8 + 3 * Math.sin(t * .47)) * u, th = t * .55 + noise1(t * .2) * .6;   // always close; now and then almost touching
    c.globalCompositeOperation = 'lighter';
    for (const [s, g] of [[1, this.g1], [-1, this.g2]]) {
      const x = this.x + s * Math.cos(th) * d, y = this.y + s * Math.sin(th) * d * .55, br = .8 + .2 * Math.sin(t * 1.1 + s), r = (11 + 2 * Math.sin(t * .9 + s * 2)) * u;
      c.globalAlpha = this.a * .78 * br; c.drawImage(g, x - r, y - r, r * 2, r * 2);
      c.globalAlpha = this.a * .95; c.fillStyle = '#fff6e6'; c.beginPath(); c.arc(x, y, 1.25 * u, 0, TAU); c.fill();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
}
