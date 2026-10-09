// Silhouette creatures for the film chapter: a rigged galloping horse and two sitting lions.
import { lerp, clamp, TAU } from '../util.js';

const D = Math.PI / 180;
const ease = t => t * t * (3 - 2 * t);

/** Leg pose for a gallop. phase 0..1 (stance first), amp 0 = standing square. Returns [upper, lower] angles from vertical (rad, +forward). */
function legPose(ph, amp, fore) {
  ph = ((ph % 1) + 1) % 1;
  let th, fold;
  if (ph < .36) { const u = ph / .36; th = lerp(26, -34, u); fold = 6 + Math.sin(u * Math.PI) * 8; }
  else { const u = (ph - .36) / .64; th = lerp(-34, 30, ease(u)); fold = Math.sin(Math.pow(u, .8) * Math.PI) * (fore ? 118 : 84); }
  th *= amp; fold *= amp;
  return fore ? [th * D, (th - fold) * D] : [(th - 8 * amp - 6) * D, (th + fold * .55 + 4) * D];
}

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

function limb(g, x, y, a1, l1, a2, l2, w1, w2, w3) {
  const kx = x + Math.sin(a1) * l1, ky = y + Math.cos(a1) * l1;
  const fx = kx + Math.sin(a2) * l2, fy = ky + Math.cos(a2) * l2;
  // tapered limb as a filled quad strip with round joints
  const seg = (ax, ay, bx, by, wa, wb) => {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    g.beginPath(); g.moveTo(ax + nx * wa, ay + ny * wa); g.lineTo(bx + nx * wb, by + ny * wb); g.lineTo(bx - nx * wb, by - ny * wb); g.lineTo(ax - nx * wa, ay - ny * wa); g.fill();
    g.beginPath(); g.arc(bx, by, wb, 0, TAU); g.fill();
  };
  seg(x, y, kx, ky, w1, w2); seg(kx, ky, fx, fy, w2, w3);
  // hoof
  g.beginPath(); g.ellipse(fx + Math.sin(a2) * .03, fy + .02, w3 * 1.5, w3 * 1.15, a2, 0, TAU); g.fill();
  return [fx, fy];
}

/**
 * Horse in side view facing +x, origin on the ground under the barrel; 1 unit ≈ barrel length.
 * s: { phase, amp, neck (0 relaxed..1 stretched), head (nod rad), mane: Strand[], tail: Strand }
 */
export function drawHorse(g, x, y, size, s, col = '#0b0a12', far = '#191826') {
  g.save(); g.translate(x, y); g.scale(size, size);
  const ph = s.phase, amp = s.amp;
  const bob = -Math.abs(Math.sin(ph * TAU)) * .07 * amp - (1 - amp) * 0, pitch = Math.sin(ph * TAU + .6) * .05 * amp;
  g.translate(0, bob); g.rotate(pitch);
  const legs = [
    { fore: false, x: -.42, y: -.88, off: 0, far: true }, { fore: true, x: .45, y: -.84, off: .3, far: true },
    { fore: false, x: -.42, y: -.88, off: .1, far: false }, { fore: true, x: .45, y: -.84, off: .42, far: false },
  ];
  const drawLeg = L => {
    const [a1, a2] = legPose(ph - L.off, amp, L.fore);
    g.fillStyle = L.far ? far : col;
    if (L.fore) limb(g, L.x + (L.far ? -.03 : 0), L.y, a1, .44, a2, .4, .14, .06, .045);
    else limb(g, L.x + (L.far ? -.04 : 0), L.y, a1, .47, a2, .43, .21, .065, .045);
  };
  legs.filter(l => l.far).forEach(drawLeg);
  g.fillStyle = col;
  // tail
  if (s.tail) {
    const P = s.tail.p; g.beginPath(); g.moveTo(-.6, -1.2);
    P.forEach((q, i) => { if (i) g.lineTo(q.x + (i / P.length) * .02, q.y - .05 * (1 - i / P.length)); });
    for (let i = P.length - 1; i > 0; i--) { const q = P[i], w = .12 * Math.sin(i / P.length * Math.PI * .9) + .03; g.lineTo(q.x, q.y + w); }
    g.lineTo(-.62, -1.05); g.fill();
  }
  // barrel, chest and quarters
  g.beginPath();
  g.moveTo(.64, -.98); g.bezierCurveTo(.6, -1.22, .46, -1.33, .32, -1.32);
  g.bezierCurveTo(.12, -1.24, -.1, -1.22, -.3, -1.3); g.bezierCurveTo(-.52, -1.34, -.7, -1.24, -.74, -1.04);
  g.bezierCurveTo(-.76, -.86, -.64, -.7, -.46, -.68); g.bezierCurveTo(-.22, -.62, .06, -.6, .3, -.68);
  g.bezierCurveTo(.52, -.72, .66, -.8, .64, -.98); g.fill();
  // neck and head
  const nk = s.neck ?? 1, poll = [lerp(.86, 1.02, nk), lerp(-1.78, -1.58, nk)], hd = (s.head || 0) + lerp(.25, -.12, nk);
  g.beginPath(); g.moveTo(.3, -1.28); g.bezierCurveTo(.5, -1.5, poll[0] - .1, poll[1] - .02, poll[0], poll[1]);
  g.lineTo(poll[0] + .08, poll[1] + .12); g.bezierCurveTo(poll[0] - .0, poll[1] + .36, .8, -1.08, .66, -.88); g.closePath(); g.fill();
  g.save(); g.translate(poll[0], poll[1]); g.rotate(hd);
  g.beginPath(); g.moveTo(-.04, -.03); g.bezierCurveTo(.12, -.04, .3, .08, .44, .22); g.bezierCurveTo(.47, .27, .44, .32, .38, .32);
  g.bezierCurveTo(.3, .3, .24, .3, .17, .22); g.bezierCurveTo(.1, .16, .02, .14, -.02, .1); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(.0, -.02); g.lineTo(.03, -.17); g.lineTo(.08, -.03); g.fill(); // ear
  g.restore();
  // mane locks streaming back
  if (s.mane) s.mane.forEach(m => { const P = m.p; g.beginPath(); g.moveTo(P[0].x, P[0].y); P.forEach((q, i) => i && g.lineTo(q.x, q.y)); for (let i = P.length - 1; i >= 0; i--) g.lineTo(P[i].x + .05, P[i].y + .06 * (1 - i / P.length)); g.fill(); });
  legs.filter(l => !l.far).forEach(drawLeg);
  g.restore();
  return { poll: [x + poll[0] * size, y + poll[1] * size] };
}
/** Anchor points (in horse units) for mane locks along the crest and the tail root. */
export function horseAnchors(nk = 1) {
  const poll = [lerp(.86, 1.02, nk), lerp(-1.78, -1.58, nk)];
  const crest = []; for (let i = 0; i < 6; i++) { const u = i / 5; crest.push([lerp(poll[0] - .03, .34, u), lerp(poll[1] - .02, -1.3, u) - Math.sin(u * Math.PI) * .07]); }
  return { crest, tail: [-.62, -1.18] };
}

/** Sitting lion silhouette facing +x (dir -1 mirrors). o: { mane, head (rad), tail (phase), col } */
export function drawLion(g, x, y, size, o) {
  g.save(); g.translate(x, y); g.scale(size * (o.dir || 1), size);
  g.fillStyle = o.col || '#090811'; g.strokeStyle = g.fillStyle;
  const f = Math.sin(o.tail || 0);
  g.lineWidth = .055; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-.6, -.08); g.bezierCurveTo(-.9, .0, -1.05, .0, -1.15, -.06 - f * .06); g.bezierCurveTo(-1.22, -.12 - f * .1, -1.24, -.2 - f * .14, -1.2, -.28 - f * .16); g.stroke();
  g.beginPath(); g.ellipse(-1.2, -.3 - f * .16, .05, .09, .3, 0, TAU); g.fill();
  // far foreleg, slightly lighter
  g.save(); g.fillStyle = o.far || '#16131f'; g.beginPath(); g.moveTo(.22, -.5); g.lineTo(.2, 0); g.lineTo(.38, 0); g.lineTo(.36, -.5); g.fill(); g.restore();
  g.beginPath();
  g.moveTo(.6, 0); g.lineTo(.33, 0); g.lineTo(.33, -.5); g.quadraticCurveTo(.2, -.4, .06, -.26);
  g.lineTo(.08, -.08); g.quadraticCurveTo(.14, -.02, .16, 0); g.lineTo(-.3, 0);
  g.bezierCurveTo(-.76, 0, -.84, -.42, -.64, -.64); g.bezierCurveTo(-.46, -.86, -.16, -.98, .12, -1.08);
  g.lineTo(.32, -1.12); g.bezierCurveTo(.5, -1.0, .52, -.72, .49, -.5); g.lineTo(.6, -.03); g.closePath(); g.fill();
  if (o.mane) { // a soft, heavy mane draped over the shoulders and chest
    g.beginPath(); const n = 40;
    for (let i = 0; i <= n; i++) { const a = i / n * TAU, w = 1 + Math.sin(a * 9) * .045 + Math.sin(a * 4 + 1) * .03; const px = .3 + Math.cos(a) * .36 * w, py = -1.02 + Math.sin(a) * .42 * w; i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.fill();
  }
  const pv = o.mane ? [.5, -1.16] : [.36, -1.14];
  g.save(); g.translate(pv[0], pv[1]); g.rotate(o.head || 0);
  if (!o.mane) { g.beginPath(); g.moveTo(-.08, .2); g.lineTo(-.12, -.06); g.lineTo(.12, -.05); g.lineTo(.14, .22); g.fill(); }
  g.beginPath(); g.moveTo(-.06, -.12); g.bezierCurveTo(.06, -.22, .22, -.2, .3, -.1); g.bezierCurveTo(.36, -.06, .42, -.03, .45, .02);
  g.bezierCurveTo(.47, .08, .44, .1, .4, .1); g.bezierCurveTo(.38, .14, .32, .17, .24, .16); g.bezierCurveTo(.14, .16, .04, .14, -.04, .1); g.bezierCurveTo(-.1, .04, -.1, -.06, -.06, -.12); g.fill();
  g.beginPath(); g.ellipse(.0, -.15, .055, .065, -.2, 0, TAU); g.fill(); // ear
  g.restore();
  g.restore();
}
