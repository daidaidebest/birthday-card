// The opening (v18): a crescent moon over a sleeping lake — soft clouds drifting past, a castle far off with a few candles
// in its windows, the moon's path trembling on the water, fireflies rising. A thin halo around the moon fills as it grows.
// (Before v18: a crescent moon at the heart of a hairline-gold orrery.)
// v20: she taps the moon, once. The first note and the music start with that tap (a touch anywhere on the sky does that
// too), and the moon fills by itself while motes of light drift in to it. It used to be held down, but iOS only lets sound
// start on a tap that ends: a held press unlocked nothing, and the first sound came with the owl's letter, the first real
// tap of the story. When it is full the sky and the lake dissolve around it and it settles onto the moon of the film.
// v19: one night air over all of it (wind.js). A breeze drifts in from the right now and then; the clouds go a little
// faster as it arrives, a cat's-paw of fine ripples runs across the lake under it, the moon's path breaks from a steady
// column into scattered glints where it passes and slowly mends, the castle's reflected candles shiver, and the fireflies
// over the shore are carried a little way downwind. Between gusts the lake is nearly still. Now and then a single slow
// ring opens on the water where a firefly touched it.
import { asset, loadImage, canvas, clamp, lerp, smooth, rng, TAU, fbm, noise1, glowSprite } from './util.js';
import { windAt, WIND_DIR } from './wind.js';

const AIR = { seed: 5, speed: .22, base: .2 };   // a slow, soft night air (a gust takes ~4.5 s to cross the frame)
const DIR = WIND_DIR.gate || -1;                 // it blows toward the left
const air = (t, x01) => windAt(t, DIR < 0 ? 1 - x01 : x01, AIR);   // x01: 0 left … 1 right of the screen

const FILL = 3.2;      // seconds from crescent to full, once she has touched it
const ASK = 9;         // a press that never became a tap: how long the full moon waits for one touch more, then goes on in silence
const MIN_PHASE = .2;  // the crescent shown at rest

export class Gate {
  constructor(env, onOpen) {
    this.env = env; this.onOpen = onOpen;
    this.root = document.getElementById('gate');
    this.btn = document.getElementById('gate-moon');
    this.cv = this.btn.querySelector('canvas'); this.g = this.cv.getContext('2d');
    this.dial = this.root.querySelector('.gate-dial');
    this.sky = this.root.querySelector('.gate-sky'); this.sg = this.sky.getContext('2d');
    this.p = 0; this.shown = 0; this.touched = false; this.down = false; this.ready = false; this.done = false; this.t = 0; this.wax = 0; this.asked = 0;
    this.motes = []; this.ripples = [];
    this.buildDial();
    const R = rng(23);
    this.stars = Array.from({ length: 170 }, () => ({ x: R(), y: R(), r: R() * R() * 1.3 + .25, p: R() * TAU, s: .4 + R() * 1.6, warm: R() < .2 }));
    this.shoot = { at: 4 + R() * 4, x: 0, y: 0, k: 1 };
    this.clouds = [0, 1, 2, 3].map(i => ({ img: cloudSprite(11 + i * 7.3), x: R(), y: .2 + i * .13 + R() * .05, s: .7 + R() * .5, v: .004 + R() * .006, a: .55 + R() * .25 }));
    this.flies = Array.from({ length: 34 }, () => ({ x: R(), y: .55 + R() * .45, p: R() * TAU, s: .4 + R() * .9, v: .01 + R() * .02, r: .6 + R() * 1.4, dx: 0 }));
    this.ring = { at: 7 + R() * 6, x: .5, y: .5, k: 1 };   // a single slow ring on the water now and then
    this.reduced = env.reduced;
    this.warm = glowSprite('255,206,140', 64, 2); this.cool = glowSprite('226,234,255', 128, 1.6);
    loadImage(asset('img/moon.webp')).then(img => { this.moon = img; this.resize(); });
    this.resize(); addEventListener('resize', () => this.resize());
    this.root.addEventListener('pointerdown', e => {
      this.sound();
      if (e.target.closest('#gate-moon')) this.touch(); else this.ripple(e.clientX, e.clientY);
    });
    const up = () => { this.down = false; };
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    this.btn.addEventListener('contextmenu', e => e.preventDefault());
    this.btn.addEventListener('keydown', e => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); this.sound(); this.touch(); this.down = false; } });
    this.loop = this.loop.bind(this); this.last = performance.now(); requestAnimationFrame(this.loop);
  }
  setReady() { this.ready = true; this.root.classList.add('ready'); }
  /** The first touch of anything here starts the sound (js/audio.js begin: it may wait for the finger to lift, on iOS). */
  sound() { const { cue, bed } = this.env.opening; this.env.audio.begin(cue, bed); }
  touch() {
    if (this.done) return;
    this.down = true; if (this.touched) return;
    this.touched = true; this.root.classList.add('holding');
  }
  /** A touch on the sky: the night answers with a soft ring of light and a star's note. */
  ripple(x, y) {
    const k = this.sky.width / innerWidth; this.ripples.push({ x: x * k, y: y * k, t: this.t });
    this.env.audio.hit('twinkle', { force: !this.env.audio.begun, vel: .6, pan: (x / innerWidth * 2 - 1) * .6 });
  }
  buildDial() {
    const ns = 'http://www.w3.org/2000/svg', svg = this.dial;
    const el = (tag, attrs, parent = svg) => { const n = document.createElementNS(ns, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; };
    const outer = el('g', { class: 'dial-outer' });
    el('circle', { r: 193, class: 'hair' }, outer); el('circle', { r: 181, class: 'hair faint' }, outer);
    for (let i = 0; i < 120; i++) {
      const a = i / 120 * TAU, major = i % 10 === 0, r0 = major ? 176 : i % 5 === 0 ? 184 : 187;
      el('line', { x1: Math.cos(a) * r0, y1: Math.sin(a) * r0, x2: Math.cos(a) * 193, y2: Math.sin(a) * 193, class: major ? 'tick major' : 'tick' }, outer);
    }
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU - TAU / 4, x = Math.cos(a) * 203, y = Math.sin(a) * 203; el('path', { d: `M${x} ${y - 5}L${x + 2} ${y}L${x} ${y + 5}L${x - 2} ${y}Z`, class: 'gem', transform: `rotate(${i * 90} ${x} ${y})` }, outer); }
    const words = el('g', { class: 'dial-words' });
    el('path', { id: 'gate-arc', d: 'M0,-160 A160,160 0 1,1 -0.01,-160', fill: 'none' }, words);
    const text = el('text', { class: 'dial-text' }, words);
    const tp = el('textPath', { href: '#gate-arc', startOffset: '0' }, text);
    tp.textContent = 'A LETTER BY MOONLIGHT  ✦  FOR SHI BAOBAO  ✦  WRITTEN IN STARLIGHT  ✦  MMXXVI  ✦  ';
    el('circle', { r: 170, class: 'dots' });
    // three small bodies on their own slow orbits, as on an orrery
    [[148, 'o1', 2.2], [170, 'o2', 1.6], [181, 'o3', 1.3]].forEach(([r, c, s]) => { const g = el('g', { class: 'orbit ' + c }); el('circle', { cx: r, cy: 0, r: s, class: 'body' }, g); });
    el('circle', { r: 140, class: 'hair faint' });
    this.arc = el('circle', { r: 148, class: 'progress', transform: 'rotate(-90)' });
    this.arcLen = TAU * 148; this.arc.style.strokeDasharray = this.arcLen; this.arc.style.strokeDashoffset = this.arcLen;
  }
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    this.cv.width = Math.max(1, Math.round(r.width * dpr)); this.cv.height = Math.max(1, Math.round(r.height * dpr));
    this.sky.width = Math.round(innerWidth * Math.min(dpr, 1.5)); this.sky.height = Math.round(innerHeight * Math.min(dpr, 1.5));
    this.shadowCv = canvas(this.cv.width, this.cv.height);
    this.land = landscape(this.sky.width, this.sky.height);
  }
  /** Draws the moon lit to fraction f (0 new … 1 full), waxing from the right. */
  drawMoon(f, glow) {
    const { g, cv, moon } = this; if (!moon) return;
    const W = cv.width, R = W / 2 * .995, c = W / 2;
    g.clearRect(0, 0, W, W);
    g.drawImage(moon, c - R, c - R, R * 2, R * 2);
    // shadow mask: the dark limb plus the part of the near side beyond the terminator ellipse
    const s = this.shadowCv, sg = s.getContext('2d'), k = 1 - 2 * f;
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, W, W);
    if (f < .999) {
      sg.filter = `blur(${Math.max(1, W * .012)}px)`;
      sg.fillStyle = '#000'; sg.beginPath();
      sg.moveTo(c, c - R * 1.05); sg.arc(c, c, R * 1.05, -Math.PI / 2, Math.PI / 2, true);
      sg.ellipse(c, c, Math.max(.001, R * Math.abs(k)), R * 1.05, 0, Math.PI / 2, -Math.PI / 2, k > 0);
      sg.closePath(); sg.fill(); sg.filter = 'none';
      // the unlit side melts into the sky: erased almost entirely, a ghost of earthshine left
      g.save(); g.globalCompositeOperation = 'destination-out'; g.globalAlpha = .84; g.drawImage(s, 0, 0); g.restore();
      g.save(); g.globalAlpha = .42 * (1 - f); g.strokeStyle = '#dfe3ff'; g.lineWidth = Math.max(1, W * .007); g.beginPath(); g.arc(c, c, R * .985, Math.PI * .55, Math.PI * 1.45); g.stroke(); g.restore();
    }
    // a breath of warm light on the bright limb as it fills
    if (glow > 0) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = glow * .22; const gr = g.createRadialGradient(c + R * .3, c - R * .2, 0, c, c, R); gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(1, 'rgba(255,236,200,0)'); g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill(); g.restore(); }
  }
  drawSky(dt) {
    const { sg, sky } = this, W = sky.width, H = sky.height, t = this.t, lift = this.shown;
    sg.clearRect(0, 0, W, H);
    const hzY = this.land ? this.land.hz : H;
    for (const s of this.stars) {
      const a = (.35 + .65 * (.5 + .5 * Math.sin(s.p + t * s.s))) * (1 - lift * .55);
      sg.globalAlpha = a; sg.fillStyle = s.warm ? '#ffe9c4' : '#e8eeff';
      if (s.y * H > hzY - 4) continue;
      sg.beginPath(); sg.arc(s.x * W, s.y * H, s.r * W / 1400 + .4, 0, TAU); sg.fill();
    }
    const sh = this.shoot;
    if (t > sh.at && sh.k >= 1) { sh.k = 0; sh.x = .55 + Math.random() * .4; sh.y = .05 + Math.random() * .25; }
    if (sh.k < 1) {
      sh.k += dt / .9; const k = smooth(sh.k), x = (sh.x - k * .25) * W, y = (sh.y + k * .14) * H, len = W * .09;
      const gr = sg.createLinearGradient(x, y, x + len, y - len * .56); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      sg.globalAlpha = Math.sin(sh.k * Math.PI); sg.strokeStyle = gr; sg.lineWidth = Math.max(1, W / 1200); sg.beginPath(); sg.moveTo(x, y); sg.lineTo(x + len, y - len * .56); sg.stroke();
      if (sh.k >= 1) sh.at = t + 7 + Math.random() * 9;
    }
    sg.globalAlpha = 1;
    // clouds drifting slowly past, lit at their edges by the moon (brighter as it fills)
    for (const c of this.clouds) {   // they drift with the air aloft: a little quicker while a gust passes beneath them
      c.pos = (c.pos ?? c.x) + dt * c.v * (.6 + 1.6 * air(t, (c.pos ?? c.x) % 1.6 - .3));
      const w = W * c.s * 1.1, h = w * c.img.height / c.img.width, x = (c.pos % 1.6 - .3) * W - w / 2, y = c.y * H - h / 2;
      sg.globalAlpha = c.a * (.8 + lift * .5); sg.drawImage(c.img, x, y, w, h);
    }
    sg.globalAlpha = 1;
    const L = this.land; if (!L) return;
    sg.drawImage(L.c, 0, 0);
    // where she touched the sky, and the motes of light on their way in to the moon
    { sg.globalCompositeOperation = 'lighter';
      this.ripples = this.ripples.filter(q => {
        const u = (t - q.t) / 1.5; if (u >= 1) return false; const s = W * (.05 + .1 * smooth(u));
        sg.globalAlpha = .55 * (1 - u) * (1 - u); sg.drawImage(this.cool, q.x - s, q.y - s, s * 2, s * 2); return true;
      });
      const r0 = this.btn.getBoundingClientRect(), k0 = W / innerWidth, cx = (r0.left + r0.width / 2) * k0, cy = (r0.top + r0.height / 2) * k0;
      if (this.touched && !this.done && this.motes.length < 26 && Math.random() < .5) { const a = Math.random() * TAU, d = r0.width * k0 * (1.05 + Math.random() * .9); this.motes.push({ a, d, u: 0, v: .45 + Math.random() * .35, s: W * (.006 + Math.random() * .007) }); }
      this.motes = this.motes.filter(q => {
        q.u += dt * q.v; if (q.u >= 1) return false; const e = smooth(q.u), rr = q.d * (1 - e) + r0.width * k0 * .32 * e, a = q.a + e * .9, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        sg.globalAlpha = Math.sin(q.u * Math.PI) * .95; sg.drawImage(this.warm, x - q.s * 3, y - q.s * 3, q.s * 6, q.s * 6); return true;
      });
      sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1; }
    // the moon's path on the water: short trembling strokes under the moon, wider as it fills
    const r = this.btn.getBoundingClientRect(), k = W / innerWidth, mx = (r.left + r.width / 2) * k, hz = L.hz, mw = r.width * k * (.35 + lift * .35);
    const lw = this.lakeAir ??= { v: 0, ph: 0 }, here = air(t, mx / W) - AIR.base;   // the water roughens under a gust and calms slowly
    lw.v += (Math.max(0, here) - lw.v) * (1 - Math.exp(-dt * (here > lw.v ? 1.8 : .45)));
    const rough = clamp(lw.v * 1.6) * (this.reduced ? .4 : 1);
    lw.ph += dt * (1 + rough * 1.6);   // the shimmer's clock: quicker on rough water (integrated, so it never jumps)
    sg.globalCompositeOperation = 'lighter';
    // a cat's-paw: fine ripples catching the sky, running across the lake under the gust (faint)
    sg.fillStyle = '#c8d4ff';
    for (let i = 0; i < 26; i++) {
      const v = (i + .5) / 26, y = hz + 2 + v * v * (H - hz), x = ((i * .618 + .13) % 1) * W, g = Math.max(0, air(t, x / W) - AIR.base);
      if (g < .04) continue;
      const len = W * (.04 + .08 * v) * (.6 + .6 * Math.abs(noise1(i * 2.3 + t * .8)));
      sg.globalAlpha = Math.min(.09, g * .14) * (1 - v * .5); sg.fillRect(x - len / 2 + noise1(i + t * 1.3) * W * .02, y, len, Math.max(1, H * .0012));
    }
    // the moon's path: a steady column of long strokes on still water; a gust breaks it into short scattered glints
    // that tremble faster and spread wider, and it mends slowly after
    const spread = 1 + rough * .9, ts = lw.ph;
    sg.fillStyle = '#e8eeff';
    for (let i = 0; i < 46; i++) {
      const v = i / 46, y = hz + 3 + v * (H - hz), wob = noise1(i * 3.1 + ts * 1.7) * mw * (.3 + v) * spread;
      const len = mw * (.25 + .6 * Math.abs(noise1(i * 7.7 + ts * 2.3))) * (1 - v * .4) * (1 - rough * .45);
      sg.globalAlpha = (.18 + .3 * Math.abs(noise1(i * 1.9 + ts * 3.1))) * (1 - v * .6) * (.6 + lift * .6);
      sg.fillRect(mx + wob - len / 2, y, len, Math.max(1, H * .0018));
      if (rough > .15 && i % 3 === 1) {   // a few glints thrown wide of the path
        const gx = mx + noise1(i * 5.3 + ts * 3.7) * mw * (1.2 + v) * spread;
        sg.globalAlpha *= rough * .8; sg.fillRect(gx - len * .18, y, len * .36, Math.max(1, H * .0016));
      }
    }
    // a slow ring on the water where a firefly touched it (never in a gust; one at a time)
    const rg = this.ring;
    if (t > rg.at && rg.k >= 1 && rough < .1 && !this.reduced) { rg.k = 0; rg.x = mx / W + (Math.random() - .5) * .35; rg.y = .25 + Math.random() * .5; }
    if (rg.k < 1) {
      rg.k += dt / 5.5; const e = smooth(rg.k), rx = W * (.012 + .07 * e), cx = rg.x * W, cy = hz + rg.y * (H - hz);
      sg.globalAlpha = .16 * Math.sin(Math.PI * Math.min(1, rg.k * 1.3)) * (1 - rg.k); sg.strokeStyle = '#dfe6ff'; sg.lineWidth = Math.max(1, W / 1400);
      sg.beginPath(); sg.ellipse(cx, cy, rx, rx * .16, 0, 0, TAU); sg.stroke();
      if (rg.k > .15) { const r2 = W * (.01 + .05 * smooth((rg.k - .15) / .85)); sg.globalAlpha *= .6; sg.beginPath(); sg.ellipse(cx, cy, r2, r2 * .16, 0, 0, TAU); sg.stroke(); }
      if (rg.k >= 1) rg.at = t + 9 + Math.random() * 12;
    }
    // candles in the castle's windows, and their trembling reflections
    for (const wl of L.lights) {
      const f = .6 + .3 * noise1(t * 1.3 + wl.p) + .1 * noise1(t * 5 + wl.p), s2 = wl.r * 4;
      sg.globalAlpha = f * .9; sg.drawImage(this.warm, wl.x - s2, wl.y - s2, s2 * 2, s2 * 2);
      const sv = 1 + rough * 3;   // the reflection shivers and stretches on rougher water
      sg.globalAlpha = f * .35 * (1 - rough * .3); sg.drawImage(this.warm, wl.x - s2 + noise1(ts * 2 + wl.p) * 2 * sv, 2 * hz - wl.y - s2, s2 * 2, s2 * (2.6 + rough * 1.8));
    }
    // fireflies rising over the shore
    for (const fl of this.flies) {   // carried a little way downwind by a gust, drifting back on their own after
      const y = ((fl.y - t * fl.v) % .5 + .5) % .5 + .5, g = Math.max(0, air(t, fl.x + fl.dx) - AIR.base);
      fl.dx = clamp(fl.dx + dt * (DIR * g * .05 * fl.s - fl.dx * .12), -.12, .12);
      const x = (fl.x + fl.dx) * W + Math.sin(t * fl.s + fl.p) * W * .02, a = Math.max(0, Math.sin(t * fl.s * 2.1 + fl.p)) ** 2;
      if (a < .02) continue; const s2 = fl.r * W / 260;
      sg.globalAlpha = a * .8; sg.drawImage(this.warm, x - s2 * 3, y * H - s2 * 3, s2 * 6, s2 * 6);
    }
    sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = 1;
  }
  loop(now) {
    if (this.gone) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (!this.done && this.ready && this.touched) {
      this.p = clamp(this.p + dt / FILL);
      if (this.wax < 2 && this.p > (this.wax + 1) * .32) this.env.audio.hit('wax', { index: this.wax++ });   // a note higher each time it grows
      if (this.p >= 1) this.arrive(dt);
    }
    // the drawn phase follows with a little easing so release feels soft
    this.shown = lerp(this.shown, this.done ? 1 : this.p, 1 - Math.exp(-dt * 9));
    const f = lerp(MIN_PHASE, 1, smooth(this.shown));
    this.drawMoon(f, this.shown);
    this.arc.style.strokeDashoffset = this.arcLen * (1 - this.shown);
    this.root.style.setProperty('--phase', this.shown.toFixed(3));
    this.drawSky(dt);
  }
  /** The moon is full. Sound comes first: if a press never became a tap the browser has not let it start, so the moon waits
   *  for the finger to lift, asks once for a real tap, and goes on in silence rather than wait for ever. */
  arrive(dt) {
    if (this.env.audio.running) return this.complete();
    if (this.down) return;
    this.asked += dt; this.root.classList.add('asking');
    if (this.asked > ASK) this.complete();
  }
  complete() {
    this.done = true; this.root.classList.remove('holding', 'asking'); this.root.classList.add('full');
    navigator.vibrate?.(12);
    this.env.audio.hit('full');
    setTimeout(() => this.onOpen(), 1100);
  }
  /** The story opens without a cut: the sky and the lake dissolve around the moon, and it settles onto the moon of the film
   *  behind them. spot: where that moon is on screen, [x, y, radius] (none, for the painted castle: this one simply fades). */
  handoff(spot) {
    const b = this.btn, r = b.getBoundingClientRect();
    if (spot && !this.env.reduced) { b.style.setProperty('--to', `translate(${(spot[0] - r.left - r.width / 2).toFixed(1)}px,${(spot[1] - r.top - r.height / 2).toFixed(1)}px)`); b.style.setProperty('--ts', (spot[2] * 2 / r.width).toFixed(3)); }
    this.root.classList.add('gone'); setTimeout(() => { this.gone = true; this.root.style.display = 'none'; }, 2700);
  }
}

/** A soft cloud: fractal noise shaped into a long, low bank, pale lavender with a brighter, moonlit upper edge. */
function cloudSprite(seed, w = 420, h = 130) {
  const c = canvas(w, h), g = c.getContext('2d'), d = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x / w - .5) * 2, v = (y / h - .5) * 2, r = Math.max(0, 1 - (u * u * .9 + v * v * 1.6));
    const n = fbm(x / 70 + seed, y / 38 + seed * 1.3, 5) * .5 + .5, a = clamp((n * r - .2) * 2.2), lit = 1 - y / h * .5;
    const i = (y * w + x) * 4; d.data[i] = 200 + 40 * lit; d.data[i + 1] = 196 + 40 * lit; d.data[i + 2] = 228 + 27 * lit; d.data[i + 3] = a * 120;
  }
  g.putImageData(d, 0, 0); return c;
}
/** The far shore: low hills and a small castle in silhouette on the horizon, and the dark, still lake below. */
function landscape(W, H) {
  const c = canvas(W, H), g = c.getContext('2d'), hz = Math.round(H * (H > W ? .885 : .83)), R = rng(41), lights = [];
  const ridge = x => hz - H * (.012 + .022 * (fbm(x / W * 3.2, 7.1, 3) * .5 + .5) + .018 * Math.exp(-((((x / W) - .2) / .12) ** 2)));
  const sil = new Path2D(); sil.moveTo(0, hz);
  for (let x = 0; x <= W; x += 4) sil.lineTo(x, ridge(x));
  // the castle, small and far: towers with pointed roofs on a rise right of the moon
  const cx = W * .66, base = ridge(cx) - H * .004, u = Math.min(W, H) * .012;
  [[-6, 5, 1.1], [-3.4, 8.5, 1.2], [-1, 6, 1], [1.4, 11, 1.4], [3.6, 7, 1.1], [5.8, 4.5, .9], [7.6, 6.2, 1]].forEach(([dx, hh, ww]) => {
    const x0 = cx + dx * u, w = ww * u, top = base - hh * u;
    sil.rect(x0 - w / 2, top, w, base - top + 2); sil.moveTo(x0 - w * .62, top); sil.lineTo(x0, top - w * 2.1); sil.lineTo(x0 + w * .62, top); sil.closePath();
    for (let k = 0; k < Math.max(1, hh / 3.4); k++) if (R() < .7) lights.push({ x: x0 + (R() - .5) * w * .4, y: top + u * (1.2 + k * 2.1), r: u * .16, p: R() * 9 });
  });
  sil.rect(cx - 7 * u, base - 3 * u, 15 * u, 3 * u + 2);   // the curtain wall
  sil.lineTo(W, hz); sil.lineTo(W, hz + 2); sil.lineTo(0, hz + 2); sil.closePath();
  // a rose glow low in the sky, behind the far shore
  let gr = g.createLinearGradient(0, hz - H * .22, 0, hz); gr.addColorStop(0, 'rgba(232,170,160,0)'); gr.addColorStop(1, 'rgba(244,184,160,.3)');
  g.fillStyle = gr; g.fillRect(0, hz - H * .22, W, H * .22);
  g.fillStyle = '#242656'; g.fill(sil);
  // the lake: a moonlit blue, lighter toward the far shore, where the rose of the sky lies on it
  gr = g.createLinearGradient(0, hz, 0, H); gr.addColorStop(0, '#6a5a94'); gr.addColorStop(.3, '#3f4284'); gr.addColorStop(1, '#23285e');
  g.fillStyle = gr; g.fillRect(0, hz + 1, W, H - hz);
  // the far shore mirrored, faint and broken by ripples
  g.save(); g.globalAlpha = .55; g.translate(0, 2 * hz); g.scale(1, -1);
  for (let y = 0; y < H * .06; y += 2) { g.save(); g.beginPath(); g.rect(0, hz - y - 2, W, 2); g.clip(); g.translate(Math.sin(y * .7) * 2, 0); g.fillStyle = '#26285a'; g.fill(sil); g.restore(); }
  g.restore();
  g.fillStyle = 'rgba(214,220,250,.18)'; g.fillRect(0, hz, W, 1);
  return { c, hz, lights };
}
