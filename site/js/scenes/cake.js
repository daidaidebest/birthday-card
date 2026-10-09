// An elegant two-tier birthday cake, painted procedurally once into an offscreen canvas.
// Ivory buttercream with a blush ombré, a gold-leaf drip, pearl borders and a cascade of roses.
import { canvas, clamp, lerp, rng, TAU } from '../util.js';

export const CAKE_W = 760, CAKE_H = 900;
// candle tips in cake space, filled when drawn (back row first)
export const CANDLES = [];

function shadeCylinder(g, cx, top, rx, ry, h, base, blush) {
  // body
  g.save();
  g.beginPath(); g.moveTo(cx - rx, top); g.lineTo(cx - rx, top + h); g.ellipse(cx, top + h, rx, ry, 0, Math.PI, 0, true); g.lineTo(cx + rx, top); g.ellipse(cx, top, rx, ry, 0, 0, Math.PI, false); g.closePath();
  g.clip();
  const gr = g.createLinearGradient(cx - rx, 0, cx + rx, 0);
  gr.addColorStop(0, '#b9ab9e'); gr.addColorStop(.12, '#e6dccf'); gr.addColorStop(.34, base); gr.addColorStop(.5, '#fffaf2'); gr.addColorStop(.72, '#efe2d0'); gr.addColorStop(.93, '#c9a98c'); gr.addColorStop(1, '#9c7c62');
  g.fillStyle = gr; g.fillRect(cx - rx, top - ry, rx * 2, h + ry * 2);
  // blush ombré rising from the base
  const om = g.createLinearGradient(0, top + h + ry, 0, top);
  om.addColorStop(0, `rgba(${blush},.75)`); om.addColorStop(.45, `rgba(${blush},.28)`); om.addColorStop(1, `rgba(${blush},0)`);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = om; g.fillRect(cx - rx, top - ry, rx * 2, h + ry * 2);
  g.globalCompositeOperation = 'source-over';
  // contact shadow under the top edge (frosting overhang)
  const sh = g.createLinearGradient(0, top, 0, top + h * .2); sh.addColorStop(0, 'rgba(90,60,40,.18)'); sh.addColorStop(1, 'rgba(90,60,40,0)');
  g.fillStyle = sh; g.fillRect(cx - rx, top, rx * 2, h * .2);
  g.restore();
  // top surface
  const tg = g.createRadialGradient(cx - rx * .2, top - ry * .3, 0, cx, top, rx);
  tg.addColorStop(0, '#fffdf8'); tg.addColorStop(.7, '#f6eee2'); tg.addColorStop(1, '#ddcfbd');
  g.fillStyle = tg; g.beginPath(); g.ellipse(cx, top, rx, ry, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, top, rx - 2, ry - 1, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
}
function goldGrad(g, x0, y0, x1, y1) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  gr.addColorStop(0, '#7a5320'); gr.addColorStop(.3, '#e8c57a'); gr.addColorStop(.45, '#fff2c4'); gr.addColorStop(.6, '#d2a24f'); gr.addColorStop(1, '#8a6125');
  return gr;
}
function goldDrip(g, cx, top, rx, ry, seed) {
  const R = rng(seed);
  g.save(); g.fillStyle = goldGrad(g, cx - rx, top, cx + rx, top + ry * 3);
  g.beginPath(); g.ellipse(cx, top, rx + 1, ry + 1, 0, 0, Math.PI); // band along the front rim
  const n = 18;
  for (let i = n; i >= 0; i--) {
    const a = i / n * Math.PI, x = cx + Math.cos(a) * rx, y = top + Math.sin(a) * ry;
    const len = (R() < .35 ? 26 + R() * 26 : 8 + R() * 10) * Math.sin(a) + 4;
    const w = 4.5 + R() * 2.5;
    g.lineTo(x + w, y + 2); g.quadraticCurveTo(x + w * .9, y + len, x, y + len + w * .6); g.quadraticCurveTo(x - w * .9, y + len, x - w, y + 2);
  }
  g.closePath(); g.fill();
  // specular glints
  g.fillStyle = 'rgba(255,250,225,.75)';
  for (let i = 0; i < 9; i++) { const a = .3 + i / 9 * 2.4, x = cx + Math.cos(a) * rx * .97, y = top + Math.sin(a) * ry + 4; g.beginPath(); g.ellipse(x, y, 3, 1.4, 0, 0, TAU); g.fill(); }
  g.restore();
}
function pearls(g, cx, y, rx, ry, r) {
  const n = Math.round(rx * Math.PI / (r * 2.05));
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - i / n * Math.PI, x = cx + Math.cos(a) * rx, yy = y + Math.sin(a) * ry, s = r * (.85 + Math.sin(a) * .15);
    const gr = g.createRadialGradient(x - s * .35, yy - s * .4, s * .1, x, yy, s);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(.5, '#f2ebe2'); gr.addColorStop(1, '#b8a99a');
    g.fillStyle = gr; g.beginPath(); g.arc(x, yy, s, 0, TAU); g.fill();
  }
}
function goldLeaf(g, x, y, s, seed) {
  const R = rng(seed);
  g.save(); g.fillStyle = goldGrad(g, x - s, y - s, x + s, y + s); g.globalAlpha = .92;
  for (let k = 0; k < 5; k++) {
    const cx = x + (R() - .5) * s * 1.6, cy = y + (R() - .5) * s;
    g.beginPath(); for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, r = s * (.15 + R() * .3); i ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill();
  }
  g.restore();
}
/** Garden rose seen from slightly above: outer petals open, inner petals cupped. tone 0 blush, 1 ivory, 2 deep rose */
function rose(g, x, y, r, rot, tone, seed) {
  const R = rng(seed);
  const pal = [['#fbe3df', '#efb8b4', '#d48b8e', '#9c5560'], ['#fffdf8', '#f3e8da', '#d8c4ae', '#a08670'], ['#f2b4b6', '#d47c86', '#a84c5c', '#6e2836']][tone];
  g.save(); g.translate(x, y); g.rotate(rot);
  const sh = g.createRadialGradient(0, r * .15, r * .3, 0, r * .15, r * 1.15); sh.addColorStop(0, 'rgba(60,25,25,.38)'); sh.addColorStop(1, 'rgba(60,25,25,0)');
  g.fillStyle = sh; g.beginPath(); g.arc(0, r * .15, r * 1.15, 0, TAU); g.fill();
  g.scale(1, .86);
  const petal = (dist, w, h, a, light, mid, dark) => {
    g.save(); g.rotate(a); g.translate(0, -dist);
    g.fillStyle = 'rgba(80,30,35,.25)'; g.beginPath(); g.ellipse(0, 3, w * 1.02, h, 0, 0, TAU); g.fill();
    const gr = g.createLinearGradient(0, h, 0, -h); gr.addColorStop(0, dark); gr.addColorStop(.45, mid); gr.addColorStop(1, light);
    g.fillStyle = gr; g.beginPath(); g.moveTo(-w, h * .3); g.bezierCurveTo(-w * 1.05, -h * .9, w * 1.05, -h * .9, w, h * .3); g.quadraticCurveTo(0, h * 1.1, -w, h * .3); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = Math.max(.8, r * .03); g.beginPath(); g.moveTo(-w * .8, -h * .35); g.quadraticCurveTo(0, -h * .78, w * .8, -h * .35); g.stroke();
    g.restore();
  };
  const n1 = 6; for (let i = 0; i < n1; i++) petal(r * .5, r * .42, r * .38, i / n1 * TAU + R() * .2, pal[0], pal[1], pal[2]);
  const n2 = 5; for (let i = 0; i < n2; i++) petal(r * .28, r * .34, r * .3, i / n2 * TAU + .6 + R() * .2, pal[0], pal[1], pal[2]);
  // cupped heart: overlapping crescents
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7 + R(); g.save(); g.rotate(a);
    const gr = g.createLinearGradient(0, -r * .3, 0, r * .2); gr.addColorStop(0, pal[0]); gr.addColorStop(1, pal[2]);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * (.3 - i * .045), Math.PI * 1.05, Math.PI * 2.1); g.quadraticCurveTo(0, r * .08, -r * (.3 - i * .045), -r * .02); g.fill();
    g.restore();
  }
  g.fillStyle = pal[3]; g.beginPath(); g.ellipse(0, -r * .02, r * .07, r * .05, .4, 0, TAU); g.fill();
  g.strokeStyle = pal[3]; g.globalAlpha = .6; g.lineWidth = Math.max(1, r * .035); g.beginPath();
  for (let i = 0; i < 26; i++) { const a = i * .42, rr = r * .03 + i * r * .006; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(0, 0); } g.stroke();
  g.restore();
}
function leafSpray(g, x, y, len, ang, seed) {
  const R = rng(seed);
  g.save(); g.translate(x, y); g.rotate(ang);
  g.strokeStyle = '#6f7d62'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * .5, -len * .12, len, 0); g.stroke();
  for (let i = 1; i < 8; i++) {
    const u = i / 8, px = len * u, py = -Math.sin(u * Math.PI) * len * .06, s = len * (.13 - u * .06);
    for (const side of [-1, 1]) {
      g.save(); g.translate(px, py); g.rotate(side * (.9 + R() * .3));
      const gr = g.createLinearGradient(0, 0, s * 1.6, 0); gr.addColorStop(0, '#8ea283'); gr.addColorStop(1, '#b9c7ab');
      g.fillStyle = gr; g.beginPath(); g.ellipse(s * .9, 0, s * .95, s * .62, 0, 0, TAU); g.fill(); g.restore();
    }
  }
  g.restore();
}
function candle(g, x, base, h, w) {
  const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  gr.addColorStop(0, '#cfc3b2'); gr.addColorStop(.4, '#fffaf0'); gr.addColorStop(.7, '#f5ecdc'); gr.addColorStop(1, '#bfae98');
  g.fillStyle = gr; g.beginPath(); g.roundRect(x - w / 2, base - h, w, h, [w / 2, w / 2, 1, 1]); g.fill();
  // gold spiral ribbon
  g.save(); g.beginPath(); g.rect(x - w / 2, base - h, w, h); g.clip();
  g.strokeStyle = goldGrad(g, x - w, base - h, x + w, base); g.lineWidth = w * .28;
  for (let y = base; y > base - h - w; y -= w * 1.5) { g.beginPath(); g.moveTo(x - w / 2, y); g.lineTo(x + w / 2, y - w * .9); g.stroke(); }
  g.restore();
  g.strokeStyle = '#3a2a1c'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, base - h); g.lineTo(x + .5, base - h - 7); g.stroke();
  return [x, base - h - 7];
}

export function paintCake() {
  const c = canvas(CAKE_W, CAKE_H), g = c.getContext('2d');
  const cx = CAKE_W / 2;
  // ----- stand: porcelain plate with gold rim on a pedestal -----
  const plateY = 760;
  g.fillStyle = 'rgba(20,10,5,.35)'; g.beginPath(); g.ellipse(cx, plateY + 120, 230, 30, 0, 0, TAU); g.fill();
  const ped = g.createLinearGradient(cx - 90, 0, cx + 90, 0); ped.addColorStop(0, '#9f9488'); ped.addColorStop(.45, '#fbf7f0'); ped.addColorStop(1, '#8d8174');
  g.fillStyle = ped; g.beginPath(); g.moveTo(cx - 40, plateY + 20); g.bezierCurveTo(cx - 34, plateY + 70, cx - 120, plateY + 95, cx - 125, plateY + 118); g.lineTo(cx + 125, plateY + 118); g.bezierCurveTo(cx + 120, plateY + 95, cx + 34, plateY + 70, cx + 40, plateY + 20); g.fill();
  g.fillStyle = goldGrad(g, cx - 125, 0, cx + 125, 0); g.fillRect(cx - 126, plateY + 112, 252, 7);
  const pl = g.createLinearGradient(cx - 330, 0, cx + 330, 0); pl.addColorStop(0, '#a49a8f'); pl.addColorStop(.4, '#fdfaf5'); pl.addColorStop(1, '#9c9083');
  g.fillStyle = pl; g.beginPath(); g.ellipse(cx, plateY + 12, 330, 58, 0, 0, Math.PI); g.lineTo(cx - 330, plateY); g.ellipse(cx, plateY, 330, 58, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#f7f2ea'; g.beginPath(); g.ellipse(cx, plateY, 330, 58, 0, 0, TAU); g.fill();
  g.strokeStyle = goldGrad(g, cx - 330, plateY, cx + 330, plateY); g.lineWidth = 5; g.beginPath(); g.ellipse(cx, plateY + 2, 328, 57, 0, 0, Math.PI); g.stroke();
  // ----- bottom tier -----
  const b = { rx: 250, ry: 48, top: 520, h: 240 };
  shadeCylinder(g, cx, b.top, b.rx, b.ry, b.h, '#f7efe4', '236,170,170');
  pearls(g, cx, b.top + b.h - 4, b.rx + 2, b.ry, 9);
  // ----- top tier -----
  const t = { rx: 168, ry: 33, top: 330, h: 196 };
  shadeCylinder(g, cx, t.top, t.rx, t.ry, t.h, '#fbf5ec', '240,190,186');
  pearls(g, cx, t.top + t.h - 3, t.rx + 2, t.ry, 7);
  goldDrip(g, cx, t.top, t.rx, t.ry, 11);
  goldLeaf(g, cx + 95, t.top + 120, 34, 4); goldLeaf(g, cx - 160, b.top + 150, 30, 8);
  // a whisper of piped lace on the bottom tier
  g.save(); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.6;
  for (let i = 0; i < 9; i++) { const a = Math.PI * (.12 + i * .095), x = cx + Math.cos(a) * b.rx * .98, y = b.top + 40 + Math.sin(a) * b.ry; g.beginPath(); g.arc(x, y + 10, 16, .2, Math.PI - .2); g.stroke(); g.beginPath(); g.arc(x, y + 36, 3, 0, TAU); g.stroke(); }
  g.restore();
  // ----- candles on the top tier (back row first) -----
  CANDLES.length = 0;
  const spots = [[-.62, -.35], [.58, -.4], [-.05, -.62], [-.32, .25], [.34, .2]].sort((p, q) => p[1] - q[1]);
  spots.forEach(([u, v]) => { const x = cx + u * t.rx * .75, base = t.top + v * t.ry * .75; CANDLES.push(candle(g, x, base, 128 + (v + 1) * 6, 13)); });
  // ----- cascade of roses and greenery -----
  leafSpray(g, cx - 150, t.top + 10, 130, -2.6, 3); leafSpray(g, cx - 120, t.top + 40, 120, 2.7, 5);
  leafSpray(g, cx + 120, b.top + 70, 150, .25, 9); leafSpray(g, cx + 160, b.top + 130, 120, .9, 13); leafSpray(g, cx + 70, t.top + 175, 110, -.4, 17);
  const blooms = [
    [cx - 176, t.top + 70, 34, 1], [cx - 98, t.top + 40, 36, 2], [cx - 140, t.top + 12, 56, 0], [cx - 150, t.top + 118, 28, 0],
    [cx + 214, b.top + 70, 34, 1], [cx + 84, b.top + 34, 36, 2], [cx + 174, b.top + 112, 36, 0], [cx + 140, b.top + 24, 62, 0], [cx + 232, b.top + 14, 30, 1],
    [cx - 10, b.top + b.h + 2, 30, 1], [cx + 40, b.top + b.h + 8, 22, 0],
  ];
  blooms.forEach(([x, y, r, tone], i) => rose(g, x, y, r, i * 1.3, tone, i + 2));
  // tiny buds / berries
  const R = rng(99); g.fillStyle = '#c87b7f';
  for (let i = 0; i < 16; i++) { const x = cx + 90 + R() * 140, y = b.top + R() * 110; g.beginPath(); g.arc(x, y, 3 + R() * 2, 0, TAU); g.fill(); }
  return c;
}
