// Painted horses for the film chapter: rendered sprite clips (tools/creatures: CC0 Quaternius horse,
// rendered in Blender and painted into 2D-film cel shading) with a flowing mane and tail simulated
// on top, hung from the per-frame bone anchors the renderer exported.
import { asset, loadImage, clamp, lerp, TAU } from '../util.js';
import { Strand } from './creatures.js';

const cache = {};
export async function loadHorse(name) {
  if (!cache[name]) cache[name] = (async () => {
    const meta = await (await fetch(asset(`film/${name}.json`))).json();
    await Promise.all(Object.values(meta.clips).map(async c => { c.img = await loadImage(asset('film/' + c.file)); }));
    return meta;
  })();
  return cache[name];
}

/** One horse: plays clips (with short cross-fades), and owns its mane and tail strands. */
export class Horse {
  constructor(meta, { mane = '#16100c', maneHi = '#4a3424', seed = 0 } = {}) {
    this.m = meta; this.mane = mane; this.maneHi = maneHi; this.seed = seed;
    this.clip = 'Gallop'; this.prev = null; this.mix = 1; this.f = 0; this.pf = 0;
    this.locks = Array.from({ length: 9 }, (_, i) => new Strand(5, 1));
    this.tails = [new Strand(9, 1), new Strand(8, 1), new Strand(7, 1)];
    this.forelock = new Strand(3, 1);
  }
  play(clip) { if (clip === this.clip) return; this.prev = this.clip; this.pf = this.f; this.clip = clip; this.mix = 0; this.f = 0; }
  /** rate: frames per second multiplier (1 = the clip's own 30 fps). */
  update(dt, rate = 1) {
    const fps = this.m.fps;
    this.f += dt * fps * rate; if (this.prev) this.pf += dt * fps * rate;
    this.mix = Math.min(1, this.mix + dt / .35);
    if (this.mix >= 1) this.prev = null;
  }
  frameOf(name, f) { const c = this.m.clips[name], n = c.n; return name === 'Gallop_Jump' ? Math.min(n - 1, Math.floor(f)) : ((Math.floor(f) % n) + n) % n; }
  /** Draws the horse with its feet on (x, y), h pixels tall (the frame height), facing right unless flip. */
  /** A gust lifts the hair: a quick extra push that dies away (wind.js decides when). */
  flick(s = 1) { this.kick = Math.max(this.kick || 0, s); }
  /** wind: the airflow of running (0..1); windX: the weather's wind along screen x (signed, wind.js strength). */
  draw(g, x, y, h, { flip = false, alpha = 1, wind = 0, windX = 0, dt = 0, speed = 0, warm = 1 } = {}) {
    const [fw, fh] = this.m.frame, s = h / fh, w = fw * s;
    // the frame's ground line sits at the lowest hoof of the idle pose: keep it on y
    const ground = this.groundY ??= Math.max(...this.m.clips.Idle.anchors[0] ? ['hoofFL', 'hoofFR', 'hoofBL', 'hoofBR'].map(k => this.m.clips.Idle.anchors[0][k][1]) : [.95]) + .015;
    const ox = x - w / 2, oy = y - ground * h;
    const dir = flip ? -1 : 1;
    const P = ([u, v]) => [x + (u - .5) * w * dir, oy + v * h];
    const blit = (name, f, a) => {
      if (a <= .003) return;
      const c = this.m.clips[name], i = this.frameOf(name, f), col = i % c.cols, row = Math.floor(i / c.cols);
      g.globalAlpha = alpha * a;
      if (flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
      g.drawImage(c.img, col * fw, row * fh, fw, fh, ox, oy, w, h);
      if (flip) g.restore();
    };
    // anchors of the current pose
    const c = this.m.clips[this.clip], an = c.anchors[this.frameOf(this.clip, this.f)];
    // ---------- far tail strands and mane locks behind the body ----------
    const tailRoot = P(an.tail), crest = [an.poll, an.crest2, an.crest, an.withers].map(P);
    const kick = this.kick || 0; this.kick = Math.max(0, kick - dt * 2.2);
    const gust = wind * (1 + .12 * Math.sin(performance.now() / 380 + this.seed)), wx = windX + Math.sign(windX || -dir) * kick * .9;
    const back = -dir; // streaming direction (behind the horse)
    const len = h * .06;
    this.tails.forEach((st, k) => { st.len = len * (1.15 - k * .12); st.update(tailRoot[0], tailRoot[1] + k * h * .012, back * (.6 + speed * .3), .8 - speed * .65, dt, (back * (40 + gust * 220) + wx * 260) * (1 + k * .2), 260 * (1 - speed * .5) - kick * 120, 22); });
    this.forelock.len = h * .03;
    const locks = this.locks.map((st, k) => {
      const u = k / (this.locks.length - 1), seg = Math.min(2, Math.floor(u * 3)), t = u * 3 - seg;
      const a = crest[seg], b = crest[seg + 1], ax = lerp(a[0], b[0], t), ay = lerp(a[1], b[1], t) - h * .02;
      st.len = h * (.036 + .02 * Math.sin(u * Math.PI)) * (1 + speed * .3);
      st.update(ax, ay, back * (.55 + speed * .35), .5 - speed * .85, dt, (back * (40 + gust * 300) + wx * 330) * (1 + u * .3), 260 * (1 - speed * .75) - kick * 200, 24);
      return st;
    });
    this.forelock.update(...P(an.poll), dir * .3, .9, dt, back * gust * 120 + wx * 150, 200 - kick * 120, 30);
    const now = performance.now() / 1000;
    /** A lock of hair: a few fine wavy strands following the simulated chain, tapering to soft tips. */
    const lock = (st, w0, seed, strands = 3) => {
      const p = st.p, n = p.length; if (n < 2) return;
      for (let k = 0; k < strands; k++) {
        const off = (k - (strands - 1) / 2) / strands, lenK = .78 + .3 * Math.abs(Math.sin(seed * 7.1 + k * 3.3));
        const pts = [];
        for (let i = 0; i < n; i++) {
          const q = p[i], r = p[Math.min(n - 1, i + 1)], o = p[Math.max(0, i - 1)], dx = r.x - o.x, dy = r.y - o.y, L = Math.hypot(dx, dy) || 1;
          const u = i / (n - 1), wave = Math.sin(u * 5 - now * (3 + speed * 6) + seed + k) * w0 * .9 * u;
          const spread = off * w0 * (1.2 + u * 1.6);
          pts.push([q.x - dy / L * (spread + wave), q.y + dx / L * (spread + wave), u]);
        }
        const last = Math.min(n - 1, Math.max(2, Math.round((n - 1) * lenK)));
        // filled taper: width falls from w0 at the root to nothing at the tip
        g.beginPath();
        const edge = (i, sgn) => { const [x, y, u] = pts[i], j = Math.min(last, i + 1), [x2, y2] = pts[j], [x0, y0] = pts[Math.max(0, i - 1)], ex = x2 - x0, ey = y2 - y0, L = Math.hypot(ex, ey) || 1, wv = w0 * .45 * Math.pow(1 - u / (last / (n - 1)), .8); return [x - ey / L * wv * sgn, y + ex / L * wv * sgn]; };
        g.moveTo(...edge(0, 1));
        for (let i = 1; i <= last; i++) { const [ax, ay] = edge(i - 1, 1), [bx, by] = edge(i, 1); g.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2); }
        g.lineTo(pts[last][0], pts[last][1]);
        for (let i = last; i >= 1; i--) { const [ax, ay] = edge(i, -1), [bx, by] = edge(i - 1, -1); g.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2); }
        g.closePath(); g.fill();
      }
    };
    g.globalAlpha = alpha; g.fillStyle = this.mane;
    this.tails.forEach((st, k) => lock(st, h * (.034 - k * .006), this.seed + k * 2.1, 4));
    // ---------- body ----------
    if (this.prev) blit(this.prev, this.pf, 1 - this.mix);
    blit(this.clip, this.f, this.prev ? this.mix : 1);
    // ---------- mane: a dark band along the crest, then the locks lifting off it ----------
    g.globalAlpha = alpha; g.fillStyle = this.mane; g.strokeStyle = this.mane; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = h * .026; g.beginPath(); locks.forEach((st, k) => { const q = st.p[0]; k ? g.lineTo(q.x, q.y + h * .008) : g.moveTo(q.x, q.y + h * .008); }); g.stroke();
    locks.forEach((st, k) => lock(st, h * (.02 + .008 * Math.sin(k / locks.length * Math.PI)), this.seed + k * 1.7, 3));
    lock(this.forelock, h * .012, this.seed + 9, 2);
    if (warm > 0) { // the low sun catching the top of the mane
      g.globalAlpha = alpha * .5 * warm; g.strokeStyle = this.maneHi; g.lineWidth = Math.max(1, h * .0045);
      locks.forEach(st => { const p = st.p; g.beginPath(); g.moveTo(p[0].x, p[0].y - h * .006); for (let i = 1; i < p.length - 2; i++) g.quadraticCurveTo(p[i].x, p[i].y - h * .006, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2 - h * .006); g.stroke(); });
    }
    g.globalAlpha = 1;
    return { hooves: ['hoofFL', 'hoofFR', 'hoofBL', 'hoofBR'].map(k => P(an[k])), nose: P(an.nose), poll: P(an.poll) };
  }
}
