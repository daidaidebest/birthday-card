// Screen-space magic: sparkles, dust bursts and the golden swirl used between chapters.
import { canvas, glowSprite, sparkleSprite, TAU, rng, clamp } from './util.js';

export class FX {
  constructor(el, env) {
    this.el = el; this.env = env; this.ctx = el.getContext('2d');
    this.parts = []; this.swirl = 0; this.rand = rng(7);
    this.glow = glowSprite('255,214,150', 64, 2);
    this.spark = sparkleSprite('255,236,190', 48);
    this.resize();
  }
  resize() {
    const { env, el } = this;
    el.width = Math.round(env.W * env.dpr); el.height = Math.round(env.H * env.dpr);
    this.ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
  }
  add(p) { if (this.parts.length < 500 * this.env.q + 150) this.parts.push(p); }
  burst(x, y, o = {}) {
    const n = Math.round((o.n ?? 40) * (this.env.q * .7 + .3)); const R = this.rand;
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, s = (o.speed ?? 120) * (.25 + R() * .9);
      this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.lift ?? 0), life: (o.life ?? 1.5) * (.5 + R() * .7), age: 0,
        size: (o.size ?? 2) * (.5 + R()), color: o.color, drag: o.drag ?? 1.2, g: o.gravity ?? 0, kind: R() < (o.sparkle ?? .25) ? 1 : 0, tw: R() * 10 });
    }
  }
  /** Gentle trail particle, e.g. behind a moving quill or star. */
  trail(x, y, o = {}) {
    const R = this.rand;
    this.add({ x: x + (R() - .5) * (o.spread ?? 6), y: y + (R() - .5) * (o.spread ?? 6), vx: (R() - .5) * 20 + (o.vx ?? 0), vy: (R() - .5) * 20 + (o.vy ?? -10),
      life: (o.life ?? 1.2) * (.6 + R() * .6), age: 0, size: (o.size ?? 1.6) * (.6 + R()), drag: .8, g: o.gravity ?? 0, kind: R() < .2 ? 1 : 0, tw: R() * 10 });
  }
  goldSwirl() { this.swirl = .001; }
  update(dt) {
    const { ctx, env } = this; const W = env.W, H = env.H;
    if (!this.parts.length && !this.swirl) { if (this.dirty) { ctx.clearRect(0, 0, W, H); this.dirty = false; this.el.style.visibility = 'hidden'; } return; }
    if (!this.dirty) this.el.style.visibility = 'visible';
    this.dirty = true;
    ctx.clearRect(0, 0, W, H);
    if (this.swirl > 0) {
      this.swirl += dt;
      const R = this.rand, k = this.swirl;
      if (k < 1.6) for (let i = 0; i < 26 * env.q + 6; i++) {
        const a = R() * TAU, r = Math.max(W, H) * (.55 + R() * .3);
        const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r;
        this.add({ x, y, vx: -Math.cos(a) * r * .9 - Math.sin(a) * r * .8, vy: -Math.sin(a) * r * .9 + Math.cos(a) * r * .8, life: 1.1 + R() * .5, age: 0, size: 1.2 + R() * 2.4, drag: 1.4, g: 0, kind: R() < .3 ? 1 : 0, tw: R() * 9 });
      }
      if (k > 4) this.swirl = 0;
    }
    ctx.globalCompositeOperation = 'lighter';
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.age += dt;
      if (p.age >= p.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
      const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = p.age / p.life, a = clamp(Math.min(k * 6, 1) * (1 - k) * 1.3) * (.65 + .35 * Math.sin(p.tw + p.age * 9));
      ctx.globalAlpha = a;
      const s = p.size * (p.kind ? 7 : 5);
      ctx.drawImage(p.kind ? this.spark : this.glow, p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}
