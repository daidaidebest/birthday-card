// The two painted teddy puppies from the original gift (apricot and cream), on their five-view
// turnaround rig: real perspective drawings for front, three-quarter, side, rear three-quarter and back,
// blended through turns, with layered legs, tail and head. Motion is refined, the artwork is unchanged.
import { asset, loadImage, clamp, lerp } from './util.js';

const LAYOUT = {"apricot":{"head":[[10,41,255,216],[276,31,250,225],[546,43,218,212],[778,42,221,212],[1013,42,232,213]],"body":[[34,281,205,197],[270,273,231,208],[512,275,254,202],[779,277,227,208],[1029,280,195,204]],"front":[[71,494,123,237],[312,494,165,234],[572,496,151,233],[830,494,137,233],[1079,498,113,230]],"back":[[65,737,134,261],[315,735,162,261],[562,735,166,262],[832,736,151,261],[1070,736,128,262]],"tail":[[46,1021,174,191],[299,1023,163,194],[554,1034,161,177],[810,1015,174,197],[1043,1015,175,199]],"blink":[[11,107,368,302],[380,99,353,311],[752,115,317,296],[1079,111,330,301],[1419,109,346,301]]},"cream":{"head":[[8,39,260,220],[272,31,257,229],[544,41,222,217],[776,40,237,218],[1013,40,234,219]],"body":[[31,277,211,204],[269,270,234,214],[512,273,257,207],[778,274,231,212],[1028,273,198,212]],"front":[[69,493,127,240],[310,492,168,237],[570,494,155,236],[827,492,143,237],[1077,496,117,233]],"back":[[62,735,141,265],[312,734,166,264],[558,734,172,265],[831,734,153,264],[1069,735,132,264]],"tail":[[42,1019,182,196],[297,1022,171,200],[550,1031,171,183],[807,1012,180,203],[1041,1012,181,207]],"blink":[[11,481,369,302],[380,471,353,313],[753,487,316,297],[1080,485,329,300],[1420,483,347,301]]}};
// Planted feet and an anatomical neck anchor shared through a turn (280-unit drawing space).
const POSES = [
  { head: [82, 37, 116, 101], body: [94, 109, 92, 87], tail: [143, 107, 31, 48], legs: [[101, 144, 29, 67], [151, 144, 29, 67], [108, 145, 28, 69], [146, 145, 28, 69]], neck: [140, 130] },
  { head: [120, 42, 116, 104], body: [81, 110, 121, 86], tail: [68, 105, 37, 50], legs: [[78, 144, 37, 70], [111, 140, 32, 69], [159, 144, 31, 70], [183, 140, 28, 67]], neck: [180, 134] },
  { head: [141, 43, 109, 104], body: [63, 112, 141, 84], tail: [39, 103, 40, 51], legs: [[69, 144, 40, 70], [97, 141, 33, 69], [163, 144, 31, 70], [186, 140, 28, 69]], neck: [189, 134] },
  { head: [141, 42, 109, 104], body: [82, 109, 121, 89], tail: [81, 113, 39, 52], legs: [[91, 145, 37, 70], [121, 140, 32, 70], [177, 143, 29, 70], [196, 140, 25, 67]], neck: [190, 134] },
  { head: [82, 37, 116, 101], body: [93, 108, 94, 90], tail: [123, 119, 35, 53], legs: [[103, 145, 30, 70], [148, 145, 30, 70], [106, 142, 27, 68], [147, 142, 27, 68]], neck: [140, 130] },
];
const ROUTINES = [
  [['watch', 2.6], ['walk', 3.6], ['lookback', 2.4], ['trot', 2.6], ['greet', 2.6], ['watch', 4.5], ['hop', 1.6], ['sniff', 2.6], ['sit', 7], ['rest', 9]],
  [['greet', 2.4], ['watch', 4.5], ['walk', 3.6], ['lookback', 2.6], ['trot', 2.6], ['sit', 7], ['hop', 1.6], ['watch', 5], ['rest', 10]],
];
const ang = n => ((n + 180) % 360 + 360) % 360 - 180;
const smooth = t => t * t * (3 - 2 * t);
const damp = (a, b, dt, k = 6) => lerp(a, b, 1 - Math.exp(-dt * k));
const turnTo = (a, b, dt, k = 5) => a + ang(b - a) * (1 - Math.exp(-dt * k));
const pulse = (t, s, d) => t > s && t < s + d ? Math.sin((t - s) / d * Math.PI) : 0;
function poseAt(yaw) {
  const v = Math.abs(ang(yaw)) / 45, lo = Math.floor(v), hi = Math.min(4, lo + 1), t = smooth(v - lo), a = POSES[lo], b = POSES[hi];
  const r = (p, q) => p.map((x, i) => lerp(x, q[i], t));
  return { head: r(a.head, b.head), body: r(a.body, b.body), tail: r(a.tail, b.tail), legs: a.legs.map((x, i) => r(x, b.legs[i])), neck: [lerp(a.neck[0], b.neck[0], t), lerp(a.neck[1], b.neck[1], t)] };
}

const MODES = {
  book: { y: [.95, .965], zones: [[.04, .27], [.73, .96]] },
  journey: { y: [.975, .985], zones: [[.03, .17], [.83, .97]], small: .85 },
  memories: { y: [.97, .98], zones: [[.04, .24], [.76, .96]] },
  party: { y: [.93, .93], zones: [[.06, .26], [.74, .94]] },
  quiet: { y: [.93, .93], zones: [[.06, .26], [.74, .94]], rest: 1 },
  celebrate: { y: [.93, .93], zones: [[.06, .3], [.7, .94]], party: 1 },
};
const REPLIES = [['喜欢你的摸摸 ♡', '今天你最好看 ♡', '生日快乐呀 ♡'], ['也想靠近你一点 ♡', '要一直开心哦 ♡', '抱抱 ♡']];

export class Pups {
  constructor(el, env) {
    this.el = el; this.env = env; this.g = el.getContext('2d'); this.mode = 'hidden'; this.t = 0; this.clean = true;
    this.img = {};
    ['apricot', 'cream', 'blink'].forEach(k => loadImage(asset(`img/teddy-${k === 'blink' ? 'turnaround-blink' : k + '-turnaround'}-v9.webp`)).then(i => { this.img[k] = i; }).catch(() => {}));
    this.dogs = ['apricot', 'cream'].map((color, i) => ({
      color, i, x: i ? .85 : .15, tx: i ? .85 : .15, yaw: i ? -45 : 45, headYaw: i ? -45 : 45, phase: i * 2.7, gait: 0,
      mood: 'watch', moodAt: 0, next: i ? 4 : 2, beat: 0, hopAt: -20, sit: 0, rest: 0, sniff: 0, greet: 0, tilt: 0,
      petAt: -99, nextBlink: 2 + i * 1.4, blinkUntil: 0, alpha: 0, hearts: [], box: null, lag: 0, hopping: -1, walking: false, closed: false,
    }));
    this.bubbles = this.dogs.map(() => { const b = document.createElement('span'); b.className = 'pup-bubble'; el.parentNode.appendChild(b); return b; });
    this.resize();
    addEventListener('pointerdown', e => this.poke(e), { passive: true });
  }
  // The canvas only covers the floor band where the puppies live, so the compositor blends far fewer pixels.
  resize() {
    const { env, el } = this; this.band = Math.round(Math.max(env.H * .36, 330)); this.oy = env.H - this.band;
    el.style.height = this.band + 'px'; el.style.top = this.oy + 'px';
    el.width = Math.round(env.W * env.dpr); el.height = Math.round(this.band * env.dpr); this.clean = false;
  }
  set(mode) {
    if (mode === this.mode) return;
    this.mode = mode; const M = MODES[mode]; this.showAt = this.t + 1; // appear once the new scene has faded in
    this.dogs.forEach(d => {
      d.beat = 0; d.next = this.t + 1 + d.i * 1.5; d.mood = M?.rest ? 'rest' : 'watch';
      if (M) { const z = M.zones[d.i]; if (d.alpha < .05) d.x = d.tx = lerp(z[0], z[1], d.i ? .7 : .3); else d.tx = clamp(d.x, z[0], z[1]); }
      if (M?.party) d.hopAt = this.t + d.i * .5;
    });
  }
  size() { const { W, portrait } = this.env, M = MODES[this.mode]; return (W < 700 || portrait ? 104 : clamp(W * .13, 148, 186)) * (M?.small || 1); }
  ground() { const M = MODES[this.mode]; return this.env.H * (this.env.portrait ? M.y[1] : M.y[0]); }
  poke(e) {
    if (!MODES[this.mode] || this.env.film.classList.contains('paused')) return;
    const S = this.size(), gy = this.ground();
    this.dogs.forEach(d => {
      const x = d.x * this.env.W;
      if (Math.abs(e.clientX - x) < S * .36 && e.clientY < gy + 6 && e.clientY > gy - S * .78) {
        d.petAt = this.t; d.mood = 'watch'; d.next = this.t + 4; d.tx = d.x;
        for (let k = 0; k < 3; k++) d.hearts.push({ x: (Math.random() - .5) * .3, age: -k * .22 });
        const b = this.bubbles[d.i]; b.textContent = REPLIES[d.i][Math.floor(Math.random() * 3)];
        b.style.left = x + 'px'; b.style.top = (gy - S * .82) + 'px'; b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
        clearTimeout(b.t); b.t = setTimeout(() => b.classList.remove('on'), 2600);
        this.env.audio.sfx('sparkle', .3);
      }
    });
  }
  update(dt) {
    const { g, env } = this, M = MODES[this.mode];
    this.t += dt;
    g.setTransform(env.dpr, 0, 0, env.dpr, 0, -this.oy * env.dpr);
    const any = this.dogs.some(d => d.alpha > .002) || !!M;
    if (!any || !this.img.apricot || !this.img.cream || !this.img.blink) { if (!this.clean) { g.clearRect(0, 0, env.W, env.H); this.clean = true; } return; }
    if (!this.clean) { g.clearRect(0, 0, env.W, env.H); this.clean = true; }
    // only repaint where the puppies were last frame
    this.dogs.forEach(d => { if (d.box) g.clearRect(...d.box); d.box = null; });
    const S = this.size(), gy = M ? this.ground() : this.lastGround || env.H;
    if (M) this.lastGround = gy;
    this.dogs.forEach(d => { this.think(d, dt, M); if (d.alpha > .002) this.draw(d, S, gy); });
  }
  think(d, dt, M) {
    const t = this.t;
    const on = M && t > (this.showAt || 0);
    d.alpha = damp(d.alpha, on ? 1 : 0, dt, on ? 4 : 8);
    if (!M) return;
    const z = M.zones[d.i], petT = t - d.petAt, petted = petT < 3.6;
    if (!petted && !M.rest && t > d.next) {
      if (M.party) { d.mood = Math.random() < .55 ? 'hop' : 'trot'; d.next = t + 1.2 + Math.random() * 1.2; }
      else { const [mood, sec] = ROUTINES[d.i][d.beat++ % ROUTINES[d.i].length]; d.mood = mood; d.next = t + sec; }
      d.moodAt = t;
      if (d.mood === 'walk' || d.mood === 'trot') { let x = lerp(z[0], z[1], Math.random()); if (Math.abs(x - d.x) < .05) x = d.x < (z[0] + z[1]) / 2 ? z[1] - .02 : z[0] + .02; d.tx = x; }
      if (d.mood === 'hop') d.hopAt = t;
    }
    if (M.rest) d.mood = 'rest';
    const hopT = t - d.hopAt, hopping = hopT >= 0 && hopT < 1.2;
    const resting = d.mood === 'rest' && !petted && !hopping, sitting = d.mood === 'sit' && !petted && !hopping;
    d.rest = damp(d.rest, resting ? 1 : 0, dt, 3.5); d.sit = damp(d.sit, sitting ? 1 : 0, dt, 4);
    d.sniff = damp(d.sniff, d.mood === 'sniff' && !petted ? 1 : 0, dt, 4);
    d.greet = damp(d.greet, d.rest < .1 && d.sit < .1 ? (petted ? pulse(petT, .5, 2) : d.mood === 'greet' ? pulse(t - d.moodAt, .3, 1.8) : 0) : 0, dt, 8);
    d.tilt = damp(d.tilt, petted ? pulse(petT, .05, 3.4) : 0, dt, 5);
    const W = this.env.W, dx = (d.tx - d.x) * W, dist = Math.abs(dx);
    const walking = !petted && !hopping && (d.mood === 'walk' || d.mood === 'trot' || M.party) && dist > 2;
    d.gait = damp(d.gait, walking && d.rest < .08 && d.sit < .1 ? 1 : 0, dt, 6);
    const inward = d.i ? -1 : 1;
    let want = d.mood === 'lookback' ? inward * 135 : d.mood === 'watch' || petted ? 0 : inward * 45;
    if (resting) want = inward * 45;
    if (walking) {
      want = dx > 0 ? 90 : -90;
      // speed follows the gait blend, so starts and stops ease instead of snapping
      const speed = (d.mood === 'trot' || M.party ? 78 : 36) * (W < 700 ? .7 : 1) * smooth(d.gait);
      const step = Math.min(dist, speed * dt);
      d.x += Math.sign(dx) * step / W; d.phase += step / (d.mood === 'trot' || M.party ? 30 : 25) * Math.PI * 2;
    }
    d.yaw = turnTo(d.yaw, want, dt, 5.2);
    // the head leads a turn a little, then settles
    const headWant = d.mood === 'lookback' ? inward * 45 : petted ? 0 : walking ? want * .82 : d.yaw;
    d.headYaw = turnTo(d.headYaw, headWant, dt, 6.5);
    d.lag = damp(d.lag, d.gait * Math.sign(dx || 1), dt, 3);
    if (t > d.nextBlink) { d.blinkUntil = t + .13 + Math.random() * .06; d.nextBlink = t + 2.6 + Math.random() * 3.4; if (Math.random() < .18) d.nextBlink = t + .32; }
    d.closed = d.rest > .75 || t < d.blinkUntil || (petted && petT > .15 && petT < .55);
    d.hopping = hopping ? hopT : -1; d.walking = walking;
    d.hearts = d.hearts.filter(h => (h.age += dt) < 1.8);
  }
  layer(part, yaw, rect, color) {
    const v = Math.abs(ang(yaw)) / 45, a = Math.floor(v), b = Math.min(4, a + 1), k = smooth(v - a), crops = LAYOUT[color][part];
    const atlas = part === 'blink' ? this.img.blink : this.img[color], g = this.g;
    const paint = (i, o) => { if (o < .005) return; const c = crops[i]; g.globalAlpha = this.alpha * o; g.drawImage(atlas, c[0], c[1], c[2], c[3], rect[0], rect[1], rect[2], rect[3]); };
    paint(a, 1 - k); if (a !== b) paint(b, k);
  }
  draw(d, S, gy) {
    const g = this.g, t = this.t + d.i * 3.71, yaw = ang(d.yaw), facing = yaw < 0 ? -1 : 1, view = Math.abs(yaw), pose = poseAt(yaw);
    const gait = d.gait, trot = d.mood === 'trot' || MODES[this.mode]?.party, breath = Math.sin(t * (d.i ? 1.72 : 2));
    const hopT = d.hopping; let hop = 0, crouch = 0;
    if (hopT >= 0) {
      if (hopT < .22) crouch = Math.sin(hopT / .22 * Math.PI / 2);
      else if (hopT < .78) hop = Math.sin((hopT - .22) / .56 * Math.PI) * 34;
      else crouch = Math.sin((hopT - .78) / .42 * Math.PI) * .6;
    }
    const bob = d.walking ? -Math.abs(Math.sin(d.phase * (trot ? 1 : 2))) * gait * (trot ? 3.6 : 1.3) : 0;
    const x = d.x * this.env.W, sc = S / 280, ox = x - S / 2, oy = gy - S * .84;
    d.box = [ox - 6, oy - S * .3, S + 12, S * 1.36];
    this.alpha = d.alpha;
    g.save(); g.globalAlpha = d.alpha * Math.max(.15, .5 - hop / 130); g.fillStyle = 'rgba(8,8,14,.6)';
    g.beginPath(); g.ellipse(x, gy - S * .015, S * .33 * (1 - hop / 90 + d.rest * .12), S * .042, 0, 0, Math.PI * 2); g.fill(); g.restore();
    g.save(); g.translate(ox, oy); g.scale(sc, sc);
    // squash and stretch around the feet
    const stretch = hopT >= 0 ? (hop > 0 ? 1 + hop / 380 : 1 - crouch * .06) : 1 + breath * .006;
    g.translate(140, 234); g.scale(1 / Math.sqrt(stretch), stretch); g.translate(-140, -234);
    g.translate(140, 20 + bob - hop + crouch * 5); g.scale(facing, 1); g.translate(-140, 0);
    const color = d.color;
    const leg = i => {
      const r = pose.legs[i], rear = i < 2, offered = i === 2 ? d.greet : 0;
      const offset = trot ? [.5, 0, 0, .5][i] : [.5, 0, .25, .75][i];
      const cycle = ((d.phase / (Math.PI * 2) + offset) % 1 + 1) % 1, swing = clamp((cycle - .61) / .39);
      const stride = (cycle < .61 ? lerp(-14, 14, cycle / .61) : lerp(14, -14, smooth(swing))) * gait;
      const deg = stride * Math.sin(view * Math.PI / 180) + (rear ? -d.sit * 24 - d.rest * 37 : -d.rest * 63 - offered * 35);
      const lower = rear ? d.sit * 24 + d.rest * 33 : d.rest * 34;
      const lift = Math.sin(swing * Math.PI) * gait * (trot ? 11 : 7) + offered * 11;
      const squeeze = 1 - (rear ? d.sit * .31 + d.rest * .39 : d.rest * .1 + offered * .15) - crouch * .17;
      const px = r[0] + r[2] * .5, py = r[1] + 13;
      g.save(); g.translate(0, lower - lift + crouch * 7); g.translate(px, py); g.rotate(deg * Math.PI / 180); g.scale(1, squeeze); g.translate(-px, -py);
      this.layer(rear ? 'back' : 'front', yaw, r, color); g.restore();
    };
    const tail = () => {
      const r = pose.tail, excited = d.greet * 16 + (hopT >= 0 ? 15 : 0) + gait * 7 + d.tilt * 6;
      const wag = Math.sin(t * (excited > 8 ? 13 : 7)) * (excited + 3) * (1 - d.rest) + Math.sin(t * 2.1) * 2;
      g.save(); g.translate(0, d.sit * 12 + d.rest * 24);
      g.translate(r[0] + r[2] * .5, r[1] + r[3] * .86); g.rotate((wag - d.rest * 17) * Math.PI / 180); g.translate(-r[0] - r[2] * .5, -r[1] - r[3] * .86);
      this.layer('tail', yaw, r, color); g.restore();
    };
    const head = () => {
      const r = pose.head, tilt = d.sniff * 18 + d.rest * 20 - d.tilt * 13 + Math.sin(d.phase - .8) * gait * 2.2 + Math.sin(t * .9) * 1.2 * (1 - gait);
      g.save(); g.translate(d.sniff * 8 + d.rest * 9 - d.lag * 2, d.sniff * 23 + d.rest * 46 - d.sit * 3 + breath * .3 - d.tilt * 2);
      g.translate(...pose.neck); g.rotate(tilt * Math.PI / 180); g.translate(-pose.neck[0], -pose.neck[1]);
      this.layer(d.closed ? 'blink' : 'head', d.headYaw, r, color); g.restore();
    };
    if (view < 112) tail();
    leg(1); leg(3);
    if (view > 112) head();
    g.save(); g.translate(-d.sit * 2 - d.greet, d.rest * 21 + crouch * 4);
    g.translate(140, 163); g.rotate((-d.sit * Math.sin(view * Math.PI / 180) * 10) * Math.PI / 180);
    g.scale(1 - d.rest * .08, 1 - d.rest * .13 + breath * .01); g.translate(-140, -163);
    this.layer('body', yaw, pose.body, color); g.restore();
    leg(0); leg(2);
    if (view < 35) leg(3);
    if (view > 145) leg(1);
    if (view <= 112) head();
    if (view >= 112) tail();
    if (d.rest > .45) { // forepaws support the lowered chin
      const a = clamp((d.rest - .45) / .5), fore = LAYOUT[color].front[1], px = pose.neck[0] + 25;
      g.globalAlpha = this.alpha * a;
      g.drawImage(this.img[color], fore[0], fore[1] + fore[3] * .76, fore[2], fore[3] * .24, px, 198, 28, 16);
      g.drawImage(this.img[color], fore[0], fore[1] + fore[3] * .76, fore[2], fore[3] * .24, px + 19, 193, 26, 15);
    }
    g.restore(); g.globalAlpha = 1;
    d.hearts.forEach(h => {
      if (h.age < 0) return; const k = h.age / 1.8, a = Math.sin(k * Math.PI) * d.alpha;
      g.save(); g.globalAlpha = a; g.translate(x + h.x * S + Math.sin(h.age * 4) * 6, oy + S * .2 - h.age * S * .32); g.scale(S / 260, S / 260);
      g.fillStyle = '#f4a6a8';
      g.beginPath(); g.moveTo(0, 6); g.bezierCurveTo(-14, -4, -8, -16, 0, -8); g.bezierCurveTo(8, -16, 14, -4, 0, 6); g.fill(); g.restore();
    });
  }
}
