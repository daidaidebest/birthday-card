// The two painted teddy puppies (apricot and cream), brought to life on a WebGL mesh rig.
// The artwork is the same five-view turnaround (front, three-quarter, side, rear three-quarter, back),
// but every part is now a deformable mesh instead of a rigid cut-out: legs bend at the knee and
// ankle so paws plant and lift, the body breathes, stretches and arches, the soft ears and the curly
// tail ride on springs, and the head turns to follow whoever is watching. They notice the pointer,
// follow a finger dragged along the floor, lean into a stroke, spin when tapped, and amuse
// themselves (play bows, scratches, shakes, naps) when left alone.
// Falls back to the 2D rig (pups2d.js) when WebGL is unavailable.
import { asset, loadImage, clamp, lerp } from './util.js';
import { Pups2D } from './pups2d.js';

const LAYOUT = {"apricot":{"head":[[10,41,255,216],[276,31,250,225],[546,43,218,212],[778,42,221,212],[1013,42,232,213]],"body":[[34,281,205,197],[270,273,231,208],[512,275,254,202],[779,277,227,208],[1029,280,195,204]],"front":[[71,494,123,237],[312,494,165,234],[572,496,151,233],[830,494,137,233],[1079,498,113,230]],"back":[[65,737,134,261],[315,735,162,261],[562,735,166,262],[832,736,151,261],[1070,736,128,262]],"tail":[[46,1021,174,191],[299,1023,163,194],[554,1034,161,177],[810,1015,174,197],[1043,1015,175,199]],"blink":[[11,107,368,302],[380,99,353,311],[752,115,317,296],[1079,111,330,301],[1419,109,346,301]]},"cream":{"head":[[8,39,260,220],[272,31,257,229],[544,41,222,217],[776,40,237,218],[1013,40,234,219]],"body":[[31,277,211,204],[269,270,234,214],[512,273,257,207],[778,274,231,212],[1028,273,198,212]],"front":[[69,493,127,240],[310,492,168,237],[570,494,155,236],[827,492,143,237],[1077,496,117,233]],"back":[[62,735,141,265],[312,734,166,264],[558,734,172,265],[831,734,153,264],[1069,735,132,264]],"tail":[[42,1019,182,196],[297,1022,171,200],[550,1031,171,183],[807,1012,180,203],[1041,1012,181,207]],"blink":[[11,481,369,302],[380,471,353,313],[753,487,316,297],[1080,485,329,300],[1420,483,347,301]]}};
// Planted feet and an anatomical neck anchor shared through a turn (280-unit drawing space).
const POSES = [
  { head: [82, 37, 116, 101], body: [94, 109, 92, 87], tail: [143, 107, 31, 48], legs: [[101, 144, 29, 67], [151, 144, 29, 67], [108, 145, 28, 69], [146, 145, 28, 69]], neck: [140, 130] },
  { head: [120, 42, 116, 104], body: [81, 110, 121, 86], tail: [68, 105, 37, 50], legs: [[78, 144, 37, 70], [111, 140, 32, 69], [159, 144, 31, 70], [183, 140, 28, 67]], neck: [180, 134] },
  { head: [141, 43, 109, 104], body: [63, 112, 141, 84], tail: [39, 103, 40, 51], legs: [[69, 144, 40, 70], [97, 141, 33, 69], [163, 144, 31, 70], [186, 140, 28, 69]], neck: [189, 134] },
  { head: [141, 42, 109, 104], body: [82, 109, 121, 89], tail: [81, 113, 39, 52], legs: [[91, 145, 37, 70], [121, 140, 32, 70], [177, 143, 29, 70], [196, 140, 25, 67]], neck: [190, 134] },
  { head: [82, 37, 116, 101], body: [93, 108, 94, 90], tail: [123, 119, 35, 53], legs: [[103, 145, 30, 70], [148, 145, 30, 70], [106, 142, 27, 68], [147, 142, 27, 68]], neck: [140, 130] },
];
// Where the floppy ears hang in each view of the head (u, v of the head rect: root and tip), per side.
const EARS = [
  [[.2, .3, .1, .82], [.8, .3, .9, .82]],
  [[.3, .26, .22, .8], [.86, .3, .9, .7]],
  [[.4, .3, .36, .82], null],
  [[.62, .3, .66, .82], [.2, .3, .12, .7]],
  [[.2, .3, .1, .82], [.8, .3, .9, .82]],
];
const ROUTINES = [
  [['watch', 2.6], ['walk', 3.6], ['lookback', 2.4], ['trot', 2.6], ['greet', 2.6], ['bow', 2.2], ['watch', 3.5], ['hop', 1.6], ['sniff', 2.6], ['sit', 5], ['scratch', 2.2], ['sit', 3], ['rest', 9]],
  [['greet', 2.4], ['watch', 4.5], ['walk', 3.6], ['shake', 1.4], ['lookback', 2.6], ['trot', 2.6], ['sit', 6], ['hop', 1.6], ['watch', 3], ['bow', 2.2], ['rest', 10]],
];
const MODES = {
  book: { y: [.95, .965], zones: [[.04, .27], [.73, .96]] },
  journey: { y: [.975, .985], zones: [[.03, .17], [.83, .97]], small: .85 },
  memories: { y: [.97, .98], zones: [[.04, .24], [.76, .96]] },
  party: { y: [.93, .93], zones: [[.06, .26], [.74, .94]] },
  quiet: { y: [.93, .93], zones: [[.06, .26], [.74, .94]], rest: 1 },
  celebrate: { y: [.93, .93], zones: [[.06, .3], [.7, .94]], party: 1 },
};
const REPLIES = [['喜欢你的摸摸 ♡', '今天你最好看 ♡', '生日快乐呀 ♡', '再摸摸嘛 ♡'], ['也想靠近你一点 ♡', '要一直开心哦 ♡', '抱抱 ♡', '最喜欢你了 ♡']];

const D2R = Math.PI / 180;
const ang = n => ((n + 180) % 360 + 360) % 360 - 180;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const sstep = (a, b, x) => smooth((x - a) / (b - a));
const damp = (a, b, dt, k = 6) => lerp(a, b, 1 - Math.exp(-dt * k));
const turnTo = (a, b, dt, k = 5) => a + ang(b - a) * (1 - Math.exp(-dt * k));
const pulse = (t, s, d) => t > s && t < s + d ? Math.sin((t - s) / d * Math.PI) : 0;
/** A damped spring toward 0, driven by an external push. */
const spring = (s, push, dt, k = 60, c = 7) => { s.v += (-k * s.x - c * s.v + push) * dt; s.x += s.v * dt; };
function poseAt(yaw) {
  const v = Math.abs(ang(yaw)) / 45, lo = Math.floor(v), hi = Math.min(4, lo + 1), t = smooth(v - lo), a = POSES[lo], b = POSES[hi];
  const r = (p, q) => p.map((x, i) => lerp(x, q[i], t));
  return { head: r(a.head, b.head), body: r(a.body, b.body), tail: r(a.tail, b.tail), legs: a.legs.map((x, i) => r(x, b.legs[i])), neck: [lerp(a.neck[0], b.neck[0], t), lerp(a.neck[1], b.neck[1], t)] };
}
// ---------- tiny 2D affine helper: [a b c d e f] maps (x,y) -> (a x + c y + e, b x + d y + f) ----------
const I = () => [1, 0, 0, 1, 0, 0];
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const T = (m, x, y) => mul(m, [1, 0, 0, 1, x, y]);
const S = (m, x, y = x) => mul(m, [x, 0, 0, y, 0, 0]);
const R = (m, a) => { const c = Math.cos(a), s = Math.sin(a); return mul(m, [c, s, -s, c, 0, 0]); };
const about = (m, x, y, f) => T(f(T(m, x, y)), -x, -y);
const rot = (p, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a), x = p[0] - cx, y = p[1] - cy; p[0] = cx + x * c - y * s; p[1] = cy + x * s + y * c; };

const VS = `attribute vec2 p;attribute vec2 uv;attribute float a;uniform vec2 res;varying vec2 v;varying float al;
void main(){v=uv;al=a;gl_Position=vec4(p.x/res.x*2.-1.,1.-p.y/res.y*2.,0.,1.);}`;
const FS = `precision mediump float;uniform sampler2D tex;varying vec2 v;varying float al;void main(){gl_FragColor=texture2D(tex,v)*al;}`;

export class Pups {
  constructor(el, env) {
    let gl = null;
    // software rasterisers get the lighter 2D rig (?pupsgl forces WebGL, for testing)
    const want = !env.software || new URLSearchParams(location.search).has('pupsgl');
    try { gl = want && el.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true }); } catch { gl = null; }
    if (!gl) return new Pups2D(el, env);
    this.el = el; this.env = env; this.gl = gl; this.mode = 'hidden'; this.t = 0;
    this.tex = {}; this.img = {};
    const prog = this.prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]]) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(prog, s); }
    gl.linkProgram(prog); gl.useProgram(prog);
    this.loc = { p: gl.getAttribLocation(prog, 'p'), uv: gl.getAttribLocation(prog, 'uv'), a: gl.getAttribLocation(prog, 'a'), res: gl.getUniformLocation(prog, 'res') };
    this.buf = gl.createBuffer(); this.verts = new Float32Array(60000); this.n = 0;
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const files = { apricot: 'img/teddy-apricot-turnaround-v9.webp', cream: 'img/teddy-cream-turnaround-v9.webp', blink: 'img/teddy-turnaround-blink-v9.webp' };
    for (const k in files) loadImage(asset(files[k])).then(img => { this.img[k] = img; this.tex[k] = this.upload(img); }).catch(() => {});
    this.tex.fx = this.upload(this.fxAtlas());
    this.dogs = ['apricot', 'cream'].map((color, i) => ({
      color, i, x: i ? .85 : .15, tx: i ? .85 : .15, yaw: i ? -45 : 45, headYaw: i ? -45 : 45, phase: i * 2.7, gait: 0,
      mood: 'watch', moodAt: 0, next: i ? 4 : 2, beat: 0, hopAt: -20, sit: 0, rest: 0, sniff: 0, greet: 0, tilt: 0, bow: 0, scratch: 0, shake: 0,
      petAt: -99, pet: 0, nextBlink: 2 + i * 1.4, blinkUntil: 0, alpha: 0, hearts: [], lag: 0, hopping: -1, walking: false, closed: false,
      spinAt: -99, gaze: 0, gazeY: 0, attn: 0, follow: false,
      ear: [{ x: 0, v: 0 }, { x: 0, v: 0 }], tailS: { x: 0, v: 0 }, body: { x: 0, v: 0 }, vx: 0, lastVx: 0, lastY: 0, vy: 0,
    }));
    this.bubbles = this.dogs.map(() => { const b = document.createElement('span'); b.className = 'pup-bubble'; el.parentNode.appendChild(b); return b; });
    this.pointer = { x: -1, y: -1, at: -99, down: false, downAt: -99, sx: 0, sy: 0, moved: 0 };
    addEventListener('pointermove', e => this.move(e), { passive: true });
    addEventListener('pointerdown', e => this.down(e), { passive: true });
    addEventListener('pointerup', e => this.up(e), { passive: true });
    addEventListener('pointercancel', () => { this.pointer.down = false; }, { passive: true });
    this.resize();
  }
  upload(img) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    t.w = img.width; t.h = img.height; return t;
  }
  /** Soft contact shadow and a heart, drawn once into a small atlas. */
  fxAtlas() {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(10,8,14,.62)'); gr.addColorStop(.55, 'rgba(10,8,14,.32)'); gr.addColorStop(1, 'rgba(10,8,14,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.translate(192, 68); g.scale(3.6, 3.6); g.fillStyle = '#f4a6a8';
    g.beginPath(); g.moveTo(0, 6); g.bezierCurveTo(-14, -4, -8, -16, 0, -8); g.bezierCurveTo(8, -16, 14, -4, 0, 6); g.fill();
    return c;
  }
  resize() {
    const { env, el } = this; this.band = Math.round(Math.max(env.H * .36, 330)); this.oy = env.H - this.band;
    el.style.height = this.band + 'px'; el.style.top = this.oy + 'px';
    this.dpr = Math.min(env.dpr, 2);
    el.width = Math.round(env.W * this.dpr); el.height = Math.round(this.band * this.dpr);
    this.gl.viewport(0, 0, el.width, el.height);
  }
  set(mode) {
    if (mode === this.mode) return;
    this.mode = mode; const M = MODES[mode]; this.showAt = this.t + 1;
    this.dogs.forEach(d => {
      d.beat = 0; d.next = this.t + 1 + d.i * 1.5; d.mood = M?.rest ? 'rest' : 'watch'; d.follow = false;
      if (M) { const z = M.zones[d.i]; if (d.alpha < .05) d.x = d.tx = lerp(z[0], z[1], d.i ? .7 : .3); else d.tx = clamp(d.x, z[0], z[1]); }
      if (M?.party) d.hopAt = this.t + d.i * .5;
    });
  }
  size() { const { W, portrait } = this.env, M = MODES[this.mode]; return (W < 700 || portrait ? 104 : clamp(W * .13, 148, 186)) * (M?.small || 1); }
  ground() { const M = MODES[this.mode]; return this.env.H * (this.env.portrait ? M.y[1] : M.y[0]); }
  active() { return !!MODES[this.mode] && !this.env.film.classList.contains('paused'); }
  hit(d, x, y) { const S = this.size(), gy = this.ground(), dx = d.x * this.env.W; return Math.abs(x - dx) < S * .36 && y < gy + 6 && y > gy - S * .8; }
  // ---------- the visitor ----------
  move(e) {
    const p = this.pointer, t = this.t;
    if (p.x >= 0) p.moved += Math.hypot(e.clientX - p.x, e.clientY - p.y);
    p.x = e.clientX; p.y = e.clientY; p.at = t;
    if (!this.active()) return;
    // stroking: pointer sweeping across a puppy (hovering with a mouse, or a finger held down)
    this.dogs.forEach(d => {
      if ((e.pointerType === 'mouse' || p.down) && this.hit(d, p.x, p.y)) {
        d.pet = Math.min(2.5, d.pet + Math.abs(e.movementX || 0) * .004 + Math.abs(e.movementY || 0) * .004 + .012);
        if (d.pet > 1 && t - d.petAt > 3) this.petted(d);
      }
    });
    // a finger held on the floor and dragged: the nearest puppy follows it
    if (p.down && p.y > this.ground() - this.size() * 1.2 && t - p.downAt > .25) {
      const near = this.dogs.reduce((a, b) => Math.abs(a.x * this.env.W - p.x) < Math.abs(b.x * this.env.W - p.x) ? a : b);
      near.follow = true; this.dogs.forEach(d => { if (d !== near) d.follow = false; });
    }
  }
  down(e) {
    const p = this.pointer; p.down = true; p.downAt = this.t; p.sx = e.clientX; p.sy = e.clientY; p.x = e.clientX; p.y = e.clientY; p.at = this.t; p.moved = 0;
  }
  up(e) {
    const p = this.pointer; p.down = false; this.dogs.forEach(d => { d.follow = false; });
    if (!this.active() || p.moved > 14 || this.t - p.downAt > .6) return;
    this.dogs.forEach(d => { if (this.hit(d, e.clientX, e.clientY)) this.tapped(d); });
  }
  tapped(d) {
    const t = this.t;
    d.taps = (d.taps || 0) + 1;
    if (d.taps % 3 === 2) { d.spinAt = t; this.env.audio.sfx('sparkle', .25); } // every few taps, a happy spin
    else { d.hopAt = t; }
    d.mood = 'watch'; d.next = t + 3; d.tx = d.x; d.greet = 1;
    if (t - d.petAt > 2) this.petted(d, true);
  }
  petted(d, quiet) {
    const t = this.t; d.petAt = t; d.pet = 0; d.mood = 'watch'; d.next = t + 4.5; d.tx = d.x;
    for (let k = 0; k < 3; k++) d.hearts.push({ x: (Math.random() - .5) * .3, age: -k * .22 });
    const S = this.size(), gy = this.ground(), b = this.bubbles[d.i];
    b.textContent = REPLIES[d.i][Math.floor(Math.random() * REPLIES[d.i].length)];
    b.style.left = d.x * this.env.W + 'px'; b.style.top = (gy - S * .86) + 'px'; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
    clearTimeout(b.t); b.t = setTimeout(() => b.classList.remove('on'), 2600);
    if (!quiet) this.env.audio.sfx('sparkle', .3);
  }
  // ---------- brain ----------
  think(d, dt, M) {
    const t = this.t, env = this.env, W = env.W, S = this.size();
    const on = M && t > (this.showAt || 0);
    d.alpha = damp(d.alpha, on ? 1 : 0, dt, on ? 4 : 8);
    if (!M) return;
    const z = M.zones[d.i], petT = t - d.petAt, petted = petT < 3.6, p = this.pointer;
    d.pet = Math.max(0, d.pet - dt * .35);
    // attention: a recently moved pointer draws the eyes
    const fresh = t - p.at < 2.5 && p.x >= 0, px = p.x, dxp = px - d.x * W;
    d.attn = damp(d.attn, fresh && !d.follow && d.rest < .5 ? 1 : 0, dt, 3);
    if (d.follow && p.down) { d.tx = clamp(px / W, .03, .97); d.mood = Math.abs(d.tx - d.x) * W > S * .8 ? 'trot' : 'walk'; d.next = t + 2; }
    else if (!d.follow && (d.x < z[0] - .01 || d.x > z[1] + .01) && t > d.next - 1.5) { d.tx = clamp(d.x, z[0], z[1]); d.mood = 'walk'; } // wander home after following
    if (!petted && !M.rest && t > d.next && !d.follow) {
      if (M.party) { d.mood = Math.random() < .55 ? 'hop' : 'trot'; d.next = t + 1.2 + Math.random() * 1.2; }
      else { const [mood, sec] = ROUTINES[d.i][d.beat++ % ROUTINES[d.i].length]; d.mood = mood; d.next = t + sec; }
      d.moodAt = t;
      if (d.mood === 'walk' || d.mood === 'trot') { let x = lerp(z[0], z[1], Math.random()); if (Math.abs(x - d.x) < .05) x = d.x < (z[0] + z[1]) / 2 ? z[1] - .02 : z[0] + .02; d.tx = x; }
      if (d.mood === 'hop') d.hopAt = t;
    }
    if (M.rest && !d.follow) d.mood = 'rest';
    const hopT = t - d.hopAt, hopping = hopT >= 0 && hopT < 1.2, spinT = t - d.spinAt, spinning = spinT >= 0 && spinT < 1.1;
    const busy = petted || hopping || spinning;
    const resting = d.mood === 'rest' && !busy, sitting = (d.mood === 'sit' || d.mood === 'scratch') && !busy;
    d.rest = damp(d.rest, resting ? 1 : 0, dt, 2.6); d.sit = damp(d.sit, sitting ? 1 : 0, dt, 4);
    d.sniff = damp(d.sniff, d.mood === 'sniff' && !busy ? 1 : 0, dt, 4);
    d.bow = damp(d.bow, d.mood === 'bow' && !busy ? pulse(t - d.moodAt, .1, 2) * 1.4 : 0, dt, 7);
    d.scratch = damp(d.scratch, d.mood === 'scratch' && !busy && t - d.moodAt > .5 ? 1 : 0, dt, 8);
    d.shake = d.mood === 'shake' && !busy ? pulse(t - d.moodAt, 0, 1.3) : 0;
    d.greet = damp(d.greet, d.rest < .1 && d.sit < .1 ? (petted ? pulse(petT, .5, 2) : d.mood === 'greet' ? pulse(t - d.moodAt, .3, 1.8) : 0) : 0, dt, 8);
    d.tilt = damp(d.tilt, petted ? pulse(petT, .05, 3.4) : 0, dt, 5);
    const dx = (d.tx - d.x) * W, dist = Math.abs(dx);
    const walking = !busy && (d.mood === 'walk' || d.mood === 'trot' || M.party || d.follow) && dist > 2;
    d.gait = damp(d.gait, walking && d.rest < .08 && d.sit < .1 ? 1 : 0, dt, 6);
    const inward = d.i ? -1 : 1, trot = d.mood === 'trot' || M.party;
    let want = d.mood === 'lookback' ? inward * 135 : d.mood === 'watch' || petted ? 0 : inward * 45;
    if (d.attn > .5 && !walking && !resting) want = Math.round(clamp(dxp / (S * 3), -1, 1) * .9) * 45; // face the visitor (on a drawn view)
    if (resting) want = inward * 45;
    const x0 = d.x;
    if (walking) {
      want = dx > 0 ? 90 : -90;
      const speed = (trot ? 84 : 38) * (W < 700 ? .7 : 1) * smooth(d.gait);
      const step = Math.min(dist, speed * dt);
      d.x += Math.sign(dx) * step / W; d.phase += step / (trot ? 30 : 25) * Math.PI * 2;
    }
    // a spin runs the yaw all the way round through every view of the turnaround
    if (spinning) d.yaw = ang(d.spinFrom + 360 * smooth(spinT / 1.1));
    else { d.yaw = ang(turnTo(d.yaw, want, dt, 5.2)); d.spinFrom = d.yaw; }
    // the head leads a turn, then settles; with attention it tracks the pointer
    let headWant = d.mood === 'lookback' ? inward * 45 : petted ? 0 : walking ? want : d.yaw;
    d.gazeRaw = headWant;
    // with attention the head tracks the pointer: it settles on the nearest drawn view (no lingering
    // cross-fade between two drawings) and the remainder becomes a small shift of the face within it
    if (d.attn > .3 && !walking && !petted && !spinning) { d.gazeRaw = d.yaw + clamp(dxp / (S * 2.2), -1, 1) * 50; headWant = Math.round(d.gazeRaw / 45) * 45; }
    d.headYaw = spinning ? d.yaw : ang(turnTo(d.headYaw, headWant, dt, 6.5));
    const gy = this.ground(), dyp = p.y - (gy - S * .6);
    d.gazeY = damp(d.gazeY, d.attn > .3 ? clamp(dyp / (S * 3), -1, .6) : 0, dt, 4);
    d.lag = damp(d.lag, d.gait * Math.sign(dx || 1), dt, 3);
    // secondary motion: ears and body jiggle from acceleration, the tail answers excitement
    d.vx = (d.x - x0) * W / Math.max(dt, 1e-3);
    const ax = (d.vx - d.lastVx) / Math.max(dt, 1e-3); d.lastVx = d.vx;
    const hopY = hopping ? (hopT < .22 ? 0 : hopT < .78 ? Math.sin((hopT - .22) / .56 * Math.PI) * 34 : 0) : 0;
    const vy = (hopY - d.lastY) / Math.max(dt, 1e-3); const ay = (vy - d.vy) / Math.max(dt, 1e-3); d.vy = vy; d.lastY = hopY;
    const stepBounce = walking ? Math.sin(d.phase * (trot ? 2 : 2)) * (trot ? 220 : 90) : 0;
    d.ear.forEach((e, k) => spring(e, -ax * .02 + ay * .012 + stepBounce * (k ? 1 : -1) * .02 + d.shake * Math.sin(t * 38) * 260, dt, 70, 6));
    spring(d.body, -ax * .006 + d.shake * Math.sin(t * 38) * 90, dt, 90, 9);
    if (t > d.nextBlink) { d.blinkUntil = t + .13 + Math.random() * .06; d.nextBlink = t + 2.6 + Math.random() * 3.4; if (Math.random() < .18) d.nextBlink = t + .32; }
    d.closed = d.rest > .75 || (t < d.blinkUntil && !petted && d.pet < .3); // eyes stay open (and bright) while she pets or taps them
    d.hopping = hopping ? hopT : -1; d.walking = walking; d.trot = trot;
    d.hearts = d.hearts.filter(h => (h.age += dt) < 1.8);
  }
  update(dt) {
    const { gl, env } = this, M = MODES[this.mode];
    this.t += dt;
    const ready = this.tex.apricot && this.tex.cream && this.tex.blink;
    const any = this.dogs.some(d => d.alpha > .002) || !!M;
    if (!any || !ready) { if (!this.clean) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); this.clean = true; } return; }
    this.clean = false;
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const S = this.size(), gy = M ? this.ground() : this.lastGround || env.H;
    if (M) this.lastGround = gy;
    // draw the farther-forward puppy last
    this.dogs.forEach(d => this.think(d, dt, M));
    gl.useProgram(this.prog); gl.uniform2f(this.loc.res, env.W, this.band);
    this.dogs.forEach(d => { if (d.alpha > .002) this.draw(d, S, gy); });
  }
  // ---------- mesh emission ----------
  /** Emits a grid mesh for one part. deform(pt, u, v) moves a drawing-space point in place. */
  quad(tex, crop, rect, m, alpha, cols, rows, deform) {
    if (alpha < .004) return;
    if (this.curTex !== tex) { this.flush(); this.curTex = tex; }
    const [sx, sy, sw, sh] = crop, [rx, ry, rw, rh] = rect, V = this.verts, oy = this.oy;
    const pts = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const u = i / cols, v = j / rows, p = [rx + u * rw, ry + v * rh];
      if (deform) deform(p, u, v);
      pts.push([m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5] - oy, (sx + u * sw) / tex.w, (sy + v * sh) / tex.h]);
    }
    if (this.n + cols * rows * 6 * 5 > V.length) this.flush();
    const put = q => { const o = this.n; V[o] = q[0]; V[o + 1] = q[1]; V[o + 2] = q[2]; V[o + 3] = q[3]; V[o + 4] = alpha; this.n += 5; };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = pts[j * (cols + 1) + i], b = pts[j * (cols + 1) + i + 1], c = pts[(j + 1) * (cols + 1) + i], e = pts[(j + 1) * (cols + 1) + i + 1];
      put(a); put(b); put(c); put(b); put(e); put(c);
    }
  }
  flush() {
    if (!this.n || !this.curTex) { this.n = 0; return; }
    const gl = this.gl, L = this.loc;
    gl.bindTexture(gl.TEXTURE_2D, this.curTex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, this.verts.subarray(0, this.n), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(L.p); gl.vertexAttribPointer(L.p, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(L.uv); gl.vertexAttribPointer(L.uv, 2, gl.FLOAT, false, 20, 8);
    gl.enableVertexAttribArray(L.a); gl.vertexAttribPointer(L.a, 1, gl.FLOAT, false, 20, 16);
    gl.drawArrays(gl.TRIANGLES, 0, this.n / 5); this.n = 0;
  }
  /** One body part through a turn: the two nearest views of the turnaround, cross-faded. */
  part(name, yaw, rect, m, color, alpha, cols, rows, deform) {
    const v = Math.abs(ang(yaw)) / 45, a = Math.floor(v), b = Math.min(4, a + 1), k = sstep(.3, .7, v - a); // brief cross-fade: less double image
    const atlas = name === 'blink' ? this.tex.blink : this.tex[color], crops = LAYOUT[color][name];
    // one view always stays opaque: the incoming view fades in over the outgoing one, then the outgoing fades out beneath it
    this.quad(atlas, crops[a], rect, m, alpha * (1 - sstep(.5, 1, k)), cols, rows, deform && ((p, u, w) => deform(p, u, w, a)));
    if (a !== b) this.quad(atlas, crops[b], rect, m, alpha * sstep(0, .5, k), cols, rows, deform && ((p, u, w) => deform(p, u, w, b)));
  }
  draw(d, S, gy) {
    const t = this.t + d.i * 3.71, yaw = ang(d.yaw), facing = yaw < 0 ? -1 : 1, view = Math.abs(yaw), pose = poseAt(yaw);
    const gait = d.gait, trot = d.trot, breath = Math.sin(t * (d.i ? 1.72 : 2)) * (1 + d.rest * .6);
    const hopT = d.hopping; let hop = 0, crouch = 0;
    if (hopT >= 0) {
      if (hopT < .22) crouch = Math.sin(hopT / .22 * Math.PI / 2);
      else if (hopT < .78) hop = Math.sin((hopT - .22) / .56 * Math.PI) * 34;
      else crouch = Math.sin((hopT - .78) / .42 * Math.PI) * .6;
    }
    const bob = d.walking ? -Math.abs(Math.sin(d.phase * (trot ? 1 : 2))) * gait * (trot ? 3.6 : 1.3) : 0;
    const x = d.x * this.env.W, sc = S / 280, ox = x - S / 2, oy = gy - S * .84, A = d.alpha;
    const sv = Math.sin(view * D2R);
    // contact shadow
    const sh = S * .33 * (1 - hop / 90 + d.rest * .12);
    this.quad(this.tex.fx, [0, 0, 128, 128], [x - sh, gy - S * .06, sh * 2, S * .09], I(), A * Math.max(.2, .9 - hop / 70), 1, 1);
    // root transform: squash and stretch around the feet, facing flip, bob and hop
    let m = I(); m = T(m, ox, oy); m = S_(m, sc);
    const stretch = hopT >= 0 ? (hop > 0 ? 1 + hop / 380 : 1 - crouch * .06) : 1 + breath * .006;
    m = about(m, 140, 234, q => S_(q, 1 / Math.sqrt(stretch), stretch));
    m = T(m, 140 + d.body.x * .06, 20 + bob - hop + crouch * 5); m = S_(m, facing, 1); m = T(m, -140, 0);
    // play bow: the front sinks and the rear stays up, pivoting about the hind feet
    if (d.bow > .01) m = about(m, 150, 210, q => R(q, d.bow * 9 * D2R * (view > 20 && view < 160 ? 1 : 0)));
    if (d.bow > .01) m = T(m, 0, d.bow * 4 * (1 - sv));
    const color = d.color;
    const leg = i => {
      const r = pose.legs[i], rear = i < 2, offered = i === 2 ? d.greet : 0;
      const offset = trot ? [.5, 0, 0, .5][i] : [.5, 0, .25, .75][i];
      const cycle = ((d.phase / (Math.PI * 2) + offset) % 1 + 1) % 1, swing = clamp((cycle - .61) / .39);
      const stride = (cycle < .61 ? lerp(-14, 14, cycle / .61) : lerp(14, -14, smooth(swing))) * gait;
      // the swing leg folds at the knee while it travels forward, then plants straight
      const fold = Math.sin(swing * Math.PI) * gait * (rear ? -24 : 30) * sv;
      let top = stride * sv + (rear ? -d.sit * 34 - d.rest * 37 : -d.rest * 63 - offered * 35 - d.bow * 30 * sv);
      let knee = fold + (rear ? d.sit * 52 + d.rest * 30 : d.rest * 40 + offered * 35 + d.bow * 50 * sv);
      // scratching: the near hind leg kicks rapidly at the ear
      if (i === 0 && d.scratch > .05) { top += d.scratch * (-40 + Math.sin(t * 34) * 12); knee += d.scratch * 30; }
      const lower = rear ? d.sit * 26 + d.rest * 30 : d.rest * 30 + d.bow * 14 * (1 - sv * .3);
      const lift = Math.sin(swing * Math.PI) * gait * (trot ? 9 : 5) + offered * 9 + (i === 0 ? d.scratch * 10 : 0);
      const squeeze = 1 - (rear ? d.sit * .28 + d.rest * .3 : d.rest * .08) - crouch * .14;
      const px = r[0] + r[2] * .5, py = r[1] + 13, kneeY = r[1] + r[3] * .52, ankY = r[1] + r[3] * .82;
      const lm = T(m, 0, lower - lift + crouch * 7);
      this.part(rear ? 'back' : 'front', yaw, r, lm, color, A, 2, 8, (p, u, v) => {
        p[1] = py + (p[1] - py) * squeeze;
        const kY = py + (kneeY - py) * squeeze, aY = py + (ankY - py) * squeeze;
        const wk = sstep(.4, .62, v), wa = sstep(.74, .9, v);
        rot(p, px, aY, -(top + knee) * .55 * wa * D2R);  // the paw stays nearly level with the ground
        rot(p, px, kY, knee * wk * D2R);
        rot(p, px, py, top * D2R);
      });
    };
    const tail = () => {
      const r = pose.tail, excited = d.greet * 16 + (hopT >= 0 ? 15 : 0) + gait * 7 + d.tilt * 8 + d.attn * 6 + (d.pet > .3 ? 10 : 0);
      const speed = excited > 8 ? 14 : 7, wag = Math.sin(t * speed) * (excited + 4) * (1 - d.rest * .85) + Math.sin(t * 2.1) * 2 - d.rest * 17 + d.bow * 14;
      const bx = r[0] + r[2] * .5, by = r[1] + r[3] * .86;
      const tm = T(m, -d.sit * 4 * sv, d.sit * 20 + d.rest * 24);
      this.part('tail', yaw, r, tm, color, A, 4, 4, (p, u, v) => {
        // distance from the root drives a travelling wave: the tip lags and curls further
        const k = clamp(Math.hypot((p[0] - bx) / r[2], (p[1] - by) / r[3]) / 1.1);
        const lagW = Math.sin(t * speed - k * 1.6) * (excited + 4) * (1 - d.rest * .85) * .5;
        rot(p, bx, by, (wag * (.55 + k * .3) + lagW * k + d.tailS.x * 8 * k) * D2R);
      });
    };
    const head = () => {
      const r = pose.head, tilt = d.sniff * 18 + d.rest * 20 - d.tilt * 13 + Math.sin(d.phase - .8) * gait * 2.2 + Math.sin(t * .9) * 1.2 * (1 - gait) + d.gazeY * 7 + d.bow * 6 - d.scratch * 10;
      const hm0 = T(m, d.sniff * 8 + d.rest * 9 - d.lag * 2 + d.body.x * .04, d.sniff * 23 + d.rest * 46 - d.sit * 3 + breath * .3 - d.tilt * 2 + d.bow * 18 * sv + d.scratch * 4);
      const hm = about(hm0, pose.neck[0], pose.neck[1], q => R(q, (tilt + d.shake * Math.sin(t * 38) * 14) * D2R));
      // the head is drawn facing its own yaw; the face drifts a little toward the gaze within a view
      const gaze = clamp(ang((d.gazeRaw ?? d.headYaw) - d.headYaw) / 25, -1, 1) * (d.headYaw < 0 ? -1 : 1);
      const name = d.closed ? 'blink' : 'head';
      this.part(name, d.headYaw, r, hm, color, A, 6, 6, (p, u, v, vi) => {
        const bump = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
        p[0] += gaze * bump * r[2] * .035 * (vi === 0 || vi === 4 ? 1 : .5);
        p[1] += d.gazeY * bump * r[3] * .02;
        // floppy ears: soft regions that swing about their roots on springs
        const ears = EARS[vi];
        for (let s = 0; s < 2; s++) {
          const e = ears[s]; if (!e) continue;
          const du = (u - e[0]) / (Math.abs(e[2] - e[0]) + .14), dv = (v - e[1]) / (e[3] - e[1]);
          const w = clamp(1 - Math.abs(du)) * sstep(0, 1, dv) * (1 - sstep(1, 1.35, dv));
          if (w > 0) rot(p, r[0] + e[0] * r[2], r[1] + e[1] * r[3], w * (d.ear[s].x * 9 + (s ? 1 : -1) * d.tilt * 3) * D2R);
        }
        // breathing swells the cheeks very slightly
        p[0] += (u - .5) * r[2] * .008 * breath * bump;
      });
    };
    const body = () => {
      const r = pose.body;
      const bm0 = T(m, -d.sit * 4 - d.greet, d.rest * 21 + crouch * 4 + d.sit * 6 * sv);
      const bm = about(bm0, 140, 163, q => S_(R(q, (-d.sit * sv * 22 + d.bow * -4 * sv) * D2R), 1 - d.rest * .08, 1 - d.rest * .13));
      this.part('body', yaw, r, bm, color, A, 6, 4, (p, u, v) => {
        const bump = Math.sin(u * Math.PI);
        p[1] -= bump * r[3] * (breath * .012 + (hop > 0 ? hop / 34 * .03 : 0) - crouch * .02); // breathing and the arch of a hop
        p[0] += (1 - v) * d.body.x * .05 + (u - .5) * r[2] * breath * .006;
        p[1] += (u - .5) * (d.bow * sv * r[3] * .2);
      });
    };
    if (view < 112) tail();
    leg(1); leg(3);
    if (view > 112) head();
    body();
    leg(0); leg(2);
    if (view <= 112) head();
    if (view >= 112) tail();
    // hearts
    d.hearts.forEach(h => {
      if (h.age < 0) return; const k = h.age / 1.8, a = Math.sin(k * Math.PI) * d.alpha, s = S * .16;
      const hx = x + h.x * S + Math.sin(h.age * 4) * 6, hy = oy + S * .2 - h.age * S * .32;
      this.quad(this.tex.fx, [128, 0, 128, 128], [hx - s / 2, hy - s / 2, s, s], I(), a, 1, 1);
    });
    this.flush(); this.curTex = null;
  }
}
// scale helper with a name that does not shadow the size variable inside draw()
const S_ = S;
