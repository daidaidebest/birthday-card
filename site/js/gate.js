// The opening: a crescent moon at the heart of a hairline-gold orrery. Pressing and holding the moon
// lets it wax to full; letting go early lets it wane again. When it is full, moonlight floods the
// screen and the story begins on the moonlit lake.
import { asset, loadImage, canvas, clamp, lerp, smooth, rng, TAU } from './util.js';

const HOLD = 2.6;      // seconds of holding to go from crescent to full
const WANE = 1.4;      // seconds to fall back when released
const MIN_PHASE = .1;  // the thinnest crescent shown at rest

export class Gate {
  constructor(env, onOpen) {
    this.env = env; this.onOpen = onOpen;
    this.root = document.getElementById('gate');
    this.btn = document.getElementById('gate-moon');
    this.cv = this.btn.querySelector('canvas'); this.g = this.cv.getContext('2d');
    this.dial = this.root.querySelector('.gate-dial');
    this.sky = this.root.querySelector('.gate-sky'); this.sg = this.sky.getContext('2d');
    this.p = 0; this.shown = 0; this.holding = false; this.ready = false; this.done = false; this.t = 0;
    this.buildDial();
    const R = rng(23);
    this.stars = Array.from({ length: 170 }, () => ({ x: R(), y: R(), r: R() * R() * 1.3 + .25, p: R() * TAU, s: .4 + R() * 1.6, warm: R() < .2 }));
    this.shoot = { at: 4 + R() * 4, x: 0, y: 0, k: 1 };
    loadImage(asset('img/moon.webp')).then(img => { this.moon = img; this.resize(); });
    this.resize(); addEventListener('resize', () => this.resize());
    const down = e => { if (!this.ready || this.done) return; e.preventDefault(); this.press(true); };
    const up = () => this.press(false);
    this.btn.addEventListener('pointerdown', down);
    addEventListener('pointerup', up); addEventListener('pointercancel', up);
    this.btn.addEventListener('contextmenu', e => e.preventDefault());
    this.btn.addEventListener('keydown', e => { if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) { e.preventDefault(); if (this.ready) this.press(true); } });
    this.btn.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'Enter') this.press(false); });
    this.loop = this.loop.bind(this); this.last = performance.now(); requestAnimationFrame(this.loop);
  }
  setReady() { this.ready = true; this.root.classList.add('ready'); }
  press(on) {
    if (on === this.holding || this.done) return;
    this.holding = on; this.root.classList.toggle('holding', on);
    if (on) { this.env.audio.unlock(); this.env.audio.sfx('light', .35); this.firstPress ??= true; }
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
      // colour the mask night-blue; it keeps a faint earthshine of the disc showing through
      sg.globalCompositeOperation = 'source-in'; sg.fillStyle = 'rgba(6,11,30,.88)'; sg.fillRect(0, 0, W, W);
      sg.globalCompositeOperation = 'source-over';
      g.save(); g.globalCompositeOperation = 'source-atop'; g.drawImage(s, 0, 0); g.restore();
    }
    // a breath of warm light on the bright limb as it fills
    if (glow > 0) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = glow * .22; const gr = g.createRadialGradient(c + R * .3, c - R * .2, 0, c, c, R); gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(1, 'rgba(255,236,200,0)'); g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, TAU); g.fill(); g.restore(); }
  }
  drawSky(dt) {
    const { sg, sky } = this, W = sky.width, H = sky.height, t = this.t, lift = this.shown;
    sg.clearRect(0, 0, W, H);
    for (const s of this.stars) {
      const a = (.35 + .65 * (.5 + .5 * Math.sin(s.p + t * s.s))) * (1 - lift * .55);
      sg.globalAlpha = a; sg.fillStyle = s.warm ? '#ffe9c4' : '#e8eeff';
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
  }
  loop(now) {
    if (this.gone) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (!this.done) {
      this.p = clamp(this.p + (this.holding ? dt / HOLD : -dt / WANE));
      if (this.p >= 1) this.complete();
    }
    // the drawn phase follows with a little easing so release feels soft
    this.shown = lerp(this.shown, this.done ? 1 : this.p, 1 - Math.exp(-dt * 9));
    const f = lerp(MIN_PHASE, 1, smooth(this.shown));
    this.drawMoon(f, this.shown);
    this.arc.style.strokeDashoffset = this.arcLen * (1 - this.shown);
    this.root.style.setProperty('--phase', this.shown.toFixed(3));
    this.drawSky(dt);
    if (this.holding && Math.random() < .5) { // motes of light drift in toward the moon while it fills
      const r = this.btn.getBoundingClientRect(), a = Math.random() * TAU, d = r.width * (1.2 + Math.random() * .8);
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      this.env.fx.trail(cx + Math.cos(a) * d, cy + Math.sin(a) * d, { vx: -Math.cos(a) * d * .9, vy: -Math.sin(a) * d * .9, life: 1, size: 1.4, spread: 2 });
    }
  }
  complete() {
    this.done = true; this.holding = false; this.root.classList.remove('holding'); this.root.classList.add('full');
    navigator.vibrate?.(18);
    this.env.audio.sfx('chime', .7);
    const r = this.btn.getBoundingClientRect();
    this.env.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 90, speed: 220, life: 2.4, color: '235,240,255', size: 2.2, drag: 1.4, sparkle: .5 });
    setTimeout(() => this.onOpen(), 900);
  }
  close() { this.root.classList.add('gone'); setTimeout(() => { this.gone = true; }, 1600); }
}
