// The study's hearth, alive (v16). The filmed fire renders as pale cones, so the page paints real flame on top of it:
// the cones are tinted toward orange, and tongues of flame lick up from the logs, each flickering on its own. Around it,
// warm firelight breathes over the room — two pseudo-elements in screen blend whose opacity and size follow slow,
// irregular noise (set as CSS custom properties every frame), so the light on the desk, the book and the letter is never
// quite still and never repeats.
import { noise1, clamp, TAU } from './util.js';

/** Where the fire is in each study frame (normalised to the painting/film): the base centre of the flames and the
 *  size of the firebox opening. */
export const FIRE = {
  'study-port': { x: .312, y: .668, w: .21, h: .1 },
  'study-land': { x: .416, y: .8, w: .15, h: .16 },
};

export class Hearth {
  constructor(parent, { wash = 1, before = null, z = null } = {}) {
    this.el = document.createElement('div'); this.el.className = 'hearth-glow'; this.el.setAttribute('aria-hidden', 'true');
    if (z != null || before) this.el.style.zIndex = z ?? 'auto';   // inserted under other layers: keep document order
    before ? parent.insertBefore(this.el, before) : parent.appendChild(this.el);
    this.wash = wash; this.seed = Math.random() * 100;
  }
  /** Breathing firelight at screen point (x, y) (the base of the flames), sized from the firebox width w (px). */
  update(t, x, y, w, k = 1) {
    const s = this.seed, n1 = noise1(t * .9 + s), n2 = noise1(t * 2.3 + s * 2), n3 = noise1(t * 5.1 + s * 3), n4 = noise1(t * .45 + s * 4);
    const st = this.el.style;
    st.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
    st.setProperty('--hw', w.toFixed(1) + 'px');
    st.setProperty('--o1', clamp((.72 + .18 * n1 + .1 * n2 + .05 * n3) * k).toFixed(3));
    st.setProperty('--s1', (1 + .05 * n1 + .025 * n3).toFixed(3));
    st.setProperty('--o2', clamp((.6 + .22 * n4 + .12 * n2) * k * this.wash).toFixed(3));
    st.setProperty('--s2', (1 + .04 * n4 + .02 * n2).toFixed(3));
  }
  hide() { this.el.style.setProperty('--o1', 0); this.el.style.setProperty('--o2', 0); }
  remove() { this.el.remove(); }
}

/** Flame tongues over the filmed fire, drawn into a 2D context in screen pixels: base centre (x, y), firebox width w. */
export function drawFire(g, x, y, w, t, k = 1, seed = 0) {
  if (k <= .01) return;
  const h = w * .62;
  g.save();
  // the pale cones take on the colour of fire
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = .85 * k;
  let gr = g.createRadialGradient(x, y - h * .35, 0, x, y - h * .35, w * .62);
  gr.addColorStop(0, 'rgb(255,150,62)'); gr.addColorStop(.6, 'rgb(255,190,120)'); gr.addColorStop(1, 'rgb(255,255,255)');
  g.fillStyle = gr; g.fillRect(x - w * .7, y - h * 1.2, w * 1.4, h * 1.4);
  // tongues of flame
  g.globalCompositeOperation = 'lighter';
  const N = 9;
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1) - .5, c = 1 - Math.abs(u) * 1.25;
    const fl = .55 + .3 * noise1(t * 3.1 + i * 7.3 + seed) + .15 * noise1(t * 8.7 + i * 2.1 + seed);
    const th = h * (.45 + .75 * c) * fl, tw = w * (.09 + .06 * c) * (.85 + .2 * noise1(t * 4.3 + i));
    const bx = x + u * w * .78 + noise1(t * 1.3 + i * 3) * w * .02, sway = noise1(t * 2.2 + i * 5.7 + seed) * tw * 1.4;
    g.globalAlpha = (.42 + .3 * c) * k;
    gr = g.createLinearGradient(bx, y, bx, y - th);
    gr.addColorStop(0, 'rgba(255,96,24,.95)'); gr.addColorStop(.32, 'rgba(255,150,44,.85)'); gr.addColorStop(.7, 'rgba(255,196,96,.45)'); gr.addColorStop(1, 'rgba(255,220,150,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(bx - tw, y);
    g.bezierCurveTo(bx - tw * 1.1, y - th * .35, bx - tw * .35 + sway * .5, y - th * .7, bx + sway, y - th);
    g.bezierCurveTo(bx + tw * .35 + sway * .5, y - th * .7, bx + tw * 1.1, y - th * .35, bx + tw, y); g.closePath(); g.fill();
    // a hot, pale core low in the flame
    g.globalAlpha = (.25 + .2 * c) * k * fl;
    gr = g.createRadialGradient(bx, y - th * .18, 0, bx, y - th * .18, tw * 1.1);
    gr.addColorStop(0, 'rgba(255,236,190,.9)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = gr; g.fillRect(bx - tw * 1.2, y - th * .45, tw * 2.4, th * .55);
  }
  // embers glowing along the logs
  g.globalAlpha = (.5 + .2 * noise1(t * 1.7 + seed)) * k;
  gr = g.createRadialGradient(x, y, 0, x, y, w * .5);
  gr.addColorStop(0, 'rgba(255,110,30,.7)'); gr.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = gr; g.save(); g.translate(x, y); g.scale(1, .28); g.beginPath(); g.arc(0, 0, w * .5, 0, TAU); g.restore(); g.fill();
  // a few sparks rising
  g.globalAlpha = k;
  for (let i = 0; i < 6; i++) {
    const ph = (t * (.35 + i * .07) + i * .37 + seed) % 1, sx = x + (((i * 47) % 13) / 13 - .5) * w * .6 + Math.sin(t * 2 + i) * w * .04, sy = y - ph * h * 1.6;
    g.fillStyle = `rgba(255,${(180 + 60 * (1 - ph)) | 0},120,${(.9 * (1 - ph)).toFixed(2)})`; g.fillRect(sx, sy, 1.6, 1.6);
  }
  g.restore();
}
