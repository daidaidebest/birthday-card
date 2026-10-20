// Prologue, after the films' owl post: the camera dives through moonlit cloud down to a great castle
// above a black lake (windows flickering with candlelight, lantern boats gliding to the shore, mist on the
// water). A snowy owl leaves the tallest tower, flies straight at the camera and lets go of a letter; the
// heavy parchment envelope tumbles down in 3D and lands addressed in emerald ink. She turns it over,
// breaks the crimson wax seal, and the letter rises and writes itself.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, easeOut, easeIn, rng, fbm, noise1, glowSprite, sparkleSprite, TAU } from '../util.js';
import { loadDepth, DepthView, wander } from '../depth.js';
import { PRO } from './prologue-art.js';
import { loadClip, play, stop, drawable, drawCover } from '../video.js';

const LETTER = [
  '亲爱的师宝宝：', '',
  '我们很高兴地通知你——',
  '你已被月光魔法书院录取。', '',
  '开学日期：你的生日，就是今晚。',
  '所需物品：好奇心，和一点点勇气，',
  '以及，允许自己被好好地爱着。', '',
  '请跟着烛光，去书房找那本魔法书。',
];
const SIGN = '—— 一个在远方，很想你的人';
const ADDRESS = ['师宝宝 收', '月光湖畔 · 最高的塔楼', '朝东的那扇窗'];
const A = {};

// timeline (seconds)
const DIVE = 7.2;                         // the crane from the moon down to the castle
const OWL0 = 5.0, OWL1 = 10.6;            // the owl's flight, tower to camera
const DROP = 9.5, LAND = 13.4;            // the letter falls from its talons and settles in front of her
const FLIP_AUTO = 2.8, OPEN_AUTO = 6;     // she may turn it / break the seal herself; otherwise it happens
// the opening, in seconds after the seal is pressed
// the filmed opening: the castle clip plays slowed (4.4 s → ~6.2 s); the owl's clip takes over as it reaches the camera
const V = { castleRate: .7, owlAt: 5.2, owlRate: .9, blend: .9 };
const O = { burst: .62, flap: .8, rise: 1.4, away: 2.45, forward: 2.6, unfold: 3.05, write: 4.5, covered: 4.4 };

// Where the seal cracks: a few jagged rays from a point near its centre (seal.webp percent units), and the
// wedges between them, which fly apart as shards.
function sealCracks(R) {
  const c = [47 + R() * 6, 44 + R() * 6], n = 7, ang = [];
  for (let i = 0; i < n; i++) ang.push((i + .2 + R() * .6) / n * TAU);
  const at = (a, r) => [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r];
  const rays = ang.map(a => [c, at(a + (R() - .5) * .35, 12 + R() * 8), at(a + (R() - .5) * .3, 30 + R() * 6), at(a, 47)]);
  const wedges = ang.map((a, i) => {
    const b = ang[(i + 1) % n] + (i === n - 1 ? TAU : 0), arc = [];
    for (let k = 0; k <= 4; k++) arc.push(at(a + (b - a) * k / 4, 70));
    const nx = rays[(i + 1) % n], poly = [...rays[i], ...arc, ...nx.slice().reverse()];
    const m = at((a + b) / 2, 26);
    return { poly, c: m };
  });
  return { c, rays, wedges };
}

function puff(seed, w = 420, h = 220) {   // a soft moonlit cloud
  const c = canvas(w, h), g = c.getContext('2d'), d = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x / w - .5) * 2, v = (y / h - .5) * 2, r = Math.max(0, 1 - (u * u + v * v * 1.3));
    const n = fbm(x / 60 + seed, y / 46 + seed * 1.7, 5) * .5 + .5, a = clamp((n * r - .18) * 2.4);
    const i = (y * w + x) * 4, lit = 200 + 40 * (1 - v) * .5;
    d.data[i] = lit - 18; d.data[i + 1] = lit - 8; d.data[i + 2] = Math.min(255, lit + 24); d.data[i + 3] = a * 200;
  }
  g.putImageData(d, 0, 0); return c;
}

// the castle's lit windows, split into three groups that flicker independently
function windowLights(img) {
  const W = img.width, H = img.height, src = canvas(W, H), sg = src.getContext('2d');
  sg.drawImage(img, 0, 0); const px = sg.getImageData(0, 0, W, H).data;
  const groups = [0, 1, 2].map(() => { const c = canvas(W, H); return { c, d: c.getContext('2d').createImageData(W, H) }; });
  for (let y = Math.floor(H * PRO.windows.y0); y < H * PRO.windows.y1; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, r = px[i], gg = px[i + 1], b = px[i + 2];
    if (r > 160 && gg > 95 && r - b > 70 && r >= gg) {
      const k = ((x >> 3) * 7 + (y >> 3) * 13) % 3, d = groups[k].d.data;
      d[i] = 255; d[i + 1] = 196; d[i + 2] = 110; d[i + 3] = Math.min(255, (r - b) * 1.6);
    }
  }
  return groups.map(({ c, d }) => {
    c.getContext('2d').putImageData(d, 0, 0);
    const glow = canvas(W / 4, H / 4), gl = glow.getContext('2d'); gl.filter = 'blur(2px)'; gl.drawImage(c, 0, 0, W / 4, H / 4); // a soft halo around each pane
    return { sharp: c, glow };
  });
}

export default {
  id: 'prologue', music: 'prologue',
  async load(env) {
    const [castle, owlBody, owlWing] = await Promise.all([loadImage(asset('img/castle.webp')), loadImage(asset('img/owl-body.webp')), loadImage(asset('img/owl-wing.webp')),
      ...['letter', 'env-front', 'env-back', 'env-inside', 'env-pocket', 'env-flap', 'env-flap-in', 'seal'].map(n => loadImage(asset(`img/${n}.webp`)))]);
    Object.assign(A, { castle, owlBody, owlWing }); A.depth = await loadDepth('castle');
    if (!env.reduced) A.clips = await Promise.all([loadClip('castle'), loadClip('owl')]);
    if (!A.puffs) A.puffs = [puff(1.3), puff(4.1), puff(7.9), puff(11.2)];
    if (!A.lights) A.lights = windowLights(castle);
  },
  create(env) {
    const { el, fx } = env;
    env.pups.set('hidden');
    const cv = canvas(1, 1); cv.className = 'full'; el.appendChild(cv);
    const g = cv.getContext('2d', { alpha: false }), img = A.castle, IW = img.width, IH = img.height;
    const R = rng(11);
    const view = new DepthView(A.depth, { amp: .03, focus: .45 }), tmp = {}, n = A.depth.layers.length;
    const moonGlow = glowSprite('205,220,255', 128, 1.6), warm = glowSprite('255,190,110', 64, 2), bloom = glowSprite('255,236,200', 128, 1.3), spark = sparkleSprite('255,246,225', 64);
    const stars = Array.from({ length: Math.round(90 * env.q + 30) }, () => ({ x: R() * IW, y: R() * IH * PRO.horizon * .8, r: .5 + R() * R() * 1.4, p: R() * TAU, s: .6 + R() * 2.2 }));
    const glints = Array.from({ length: Math.round(70 * env.q + 20) }, () => ({ x: lerp(PRO.lake.x0, PRO.lake.x1, R()) * IW, y: lerp(PRO.lake.y0, PRO.lake.y1, R() * R()) * IH, p: R() * TAU, s: 1 + R() * 3, l: 4 + R() * 14 }));
    // clouds the camera dives through: each starts far ahead and rushes past
    const dive = Array.from({ length: 9 }, (_, i) => ({ x: (R() - .5) * 1.6, y: (R() - .5) * .9, z0: 1.2 + i * .32 + R() * .2, k: i % A.puffs.length, flip: R() < .5 }));
    const mist = Array.from({ length: 6 }, (_, i) => ({ x: R(), y: PRO.mistY + (R() - .5) * .03, s: .5 + R() * .5, v: .004 + R() * .006, k: i % A.puffs.length }));
    const boats = PRO.boats.map((b, i) => ({ ...b, ph: R() * TAU }));
    // filmed plates (tools/video/): the castle from the air, then the owl. Without them, the painted 2.5D shot below.
    const [clipCastle, clipOwl] = A.clips || [];
    let filmed = !!(clipCastle && clipOwl && !clipCastle.failed && !clipOwl.failed);
    if (filmed) play(clipCastle, V.castleRate, 0);

    // ---------- the envelope: a 3D card while it falls, then the opening rig ----------
    const wrap = document.createElement('div'); wrap.className = 'pro-letter-wrap'; el.appendChild(wrap);
    wrap.innerHTML = `
      <div class="pro-card">
        <div class="pro-face pro-front"><img src="${asset('img/env-front.webp')}" alt=""><div class="pro-addr">${ADDRESS.map((l, i) => `<p class="a${i}">${l}</p>`).join('')}</div></div>
        <div class="pro-face pro-back"><img src="${asset('img/env-back.webp')}" alt=""><img class="pro-seal-img" src="${asset('img/seal.webp')}" alt=""></div>
      </div>
      <div class="pro-env">
        <i class="pro-env-shadow"></i>
        <img class="pro-env-inside" src="${asset('img/env-inside.webp')}" alt="">
        <div class="pro-paper"><div class="pro-fold f1"><b></b><u></u><i></i></div><div class="pro-fold f2"><b></b><u></u><i></i></div><div class="pro-fold f0"><b></b><u></u><i></i></div><div class="pro-paper-inner"></div></div>
        <img class="pro-env-pocket" src="${asset('img/env-pocket.webp')}" alt="">
        <div class="pro-env-flap"><img class="out" src="${asset('img/env-flap.webp')}" alt=""><img class="in" src="${asset('img/env-flap-in.webp')}" alt=""><i></i></div>
        <button class="pro-seal" type="button" aria-label="打开火漆，拆开这封信"><img src="${asset('img/seal.webp')}" alt=""><svg viewBox="0 0 100 100" aria-hidden="true"></svg></button>
        <i class="pro-flash"></i>
      </div>
      <p class="pro-hint"></p>`;
    const $ = s => wrap.querySelector(s);
    const card = $('.pro-card'), envEl = $('.pro-env'), paper = $('.pro-paper'), inner = $('.pro-paper-inner'), seal = $('.pro-seal'), hint = $('.pro-hint');
    const flap = $('.pro-env-flap'), flash = $('.pro-flash'), envParts = ['.pro-env-shadow', '.pro-env-inside', '.pro-env-pocket'].map($);
    const folds = [0, 1, 2].map(k => $('.pro-fold.f' + k)), crack = sealCracks(R), cracks = seal.querySelector('svg');
    cracks.innerHTML = crack.rays.map(r => `<path d="M${r.map(p => p.map(v => v.toFixed(1)).join(' ')).join(' L')}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`).join('');
    const crackPaths = [...cracks.children];
    let shards = null, openRig = null;
    for (const k in PRO.seal) wrap.style.setProperty('--seal-' + k, PRO.seal[k] * 100 + '%');
    const chars = [];
    LETTER.forEach(line => {
      const p = document.createElement('p'); if (!line) p.className = 'gap';
      for (const ch of line) { const s = document.createElement('span'); s.textContent = ch; p.appendChild(s); chars.push(s); }
      inner.appendChild(p);
    });
    const sign = document.createElement('p'); sign.className = 'sign';
    for (const ch of SIGN) { const s = document.createElement('span'); s.textContent = ch; sign.appendChild(s); chars.push(s); }
    inner.appendChild(sign);
    let at = 0; const times = [];
    chars.forEach(s => { times.push(at); const ch = s.textContent; at += '，。—：'.includes(ch) ? .17 : .042; if (s === s.parentNode.lastChild) at += .22; });
    const WRITE_LEN = at;

    let T = 0, res = 1, flipAt = Infinity, flipped = false, openAt = Infinity, opened = false, openStart = 0, written = 0, done = false, doneAt = 0, leaving = false, landed = false;
    let owlXY = null;
    const say = text => { hint.textContent = text; wrap.classList.toggle('hinted', !!text); };
    // turn it over: tap the envelope, or swipe across it
    let drag = null;
    card.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; });
    addEventListener('pointerup', e => { if (drag && landed && flipAt === Infinity) { flipAt = T; env.audio.sfx('page', .5); say(''); } drag = null; });
    seal.addEventListener('click', () => { if (flipped && !opened && T > flipAt + 1.1) openAt = T; });
    const cues = env.cues([[.6, 4.8, '有一封信，在月光下飞了很远的路。'], [5.6, 9.4, '雪白的猫头鹰，替一个人把它送来。']]);

    const inst = {
      progress: () => clamp(T / (LAND + 6 + WRITE_LEN + 3)),
      destroy() { stop(clipCastle); stop(clipOwl); },
      resize() {
        res = env.res(true);
        cv.width = Math.round(env.W * res); cv.height = Math.round(env.H * res);
        const W = env.W, H = env.H;
        let lw = Math.min(540, W * .88), lh = lw * 1.34; if (lh > H * .9) { lh = H * .9; lw = lh / 1.34; }
        const fs = Math.max(14, Math.min(21, lw * .041));
        const ew = Math.min(520, W * .86), eh = ew / PRO.envAspect;
        const v = { '--lw': lw + 'px', '--lh': lh + 'px', '--fs': fs + 'px', '--ew': ew + 'px', '--eh': eh + 'px', '--sx': ew * .86 / lw, '--sy': eh * .8 / lh };
        for (const k in v) wrap.style.setProperty(k, v[k]);
        if (!opened && openRig) openRig(0); // the folded letter waits inside
      },
      update(dt, t) {
        T = t; cues(t);
        const W = env.W, H = env.H, portrait = env.portrait; g.setTransform(res, 0, 0, res, 0, 0);
        const covered = opened && t - openStart > O.covered;
        if (!covered && filmed && (t < 1.5 || drawable(clipCastle))) {
          filmedFrame(t, W, H, portrait);
        } else if (!covered) {
          if (filmed && t >= 1.5) filmed = false; // the clip never produced a picture: fall back to the painting
          // ---------- the castle: a crane down from the moon, then a slow push toward it ----------
          const s = Math.max(W / IW, H / IH) * (portrait ? 1.06 : 1.02), dw = IW * s, dh = IH * s;
          const crane = easeInOut(clamp(t / DIVE)), y0 = H * .32 - PRO.moon.y * IH * s, y1 = H * .56 - PRO.castle.y * IH * s;
          const oy = clamp(lerp(y0, y1, crane), H - dh, 0), ox = clamp(W * .5 - PRO.castle.x * IW * s, W - dw, 0);
          const wd = wander(t, 1.3, .7), push = .12 * easeInOut(clamp((t - 2) / 16));
          view.frame({ s, x: ox, y: oy }, { x: wd.x * .5 + env.look.x * .7, y: lerp(-1, .15, crane) + wd.y * .25 + env.look.y * .4, zoom: push, focus: .45 }, [W / 2, H * .55]);
          const P = (d, x, y) => { const m = view.at(d, tmp); return [m.x + x * IW * m.s, m.y + y * IH * m.s, m.s]; };
          // sky plane, then stars and the moon's halo on it
          g.globalAlpha = 1; view.draw(g, 0, 1);
          g.fillStyle = '#eef2ff';
          for (const st of stars) { const [x, y, ms] = P(0, st.x / IW, st.y / IH); if (y < -4 || y > H) continue; g.globalAlpha = .3 + .6 * (.5 + .5 * Math.sin(st.p + t * st.s)); g.fillRect(x, y, st.r * ms * 1.4, st.r * ms * 1.4); }
          { const [mx, my, ms] = P(0, PRO.moon.x, PRO.moon.y), mg = 300 * ms * (1 + .05 * Math.sin(t * .8)); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .5; g.drawImage(moonGlow, mx - mg, my - mg, mg * 2, mg * 2); g.globalCompositeOperation = 'source-over'; }
          for (let i = 1; i < n; i++) {
            g.globalAlpha = 1; view.draw(g, i, i + 1);
            const T_i = view.T[i];
            if (i === PRO.castlePlane) { // the windows breathe with candlelight
              g.globalCompositeOperation = 'lighter';
              A.lights.forEach((L, k) => {
                const f = .55 + .3 * noise1(t * 1.7 + k * 9.3) + .15 * noise1(t * 6.1 + k * 3.1);
                g.globalAlpha = .55 * f; g.drawImage(L.glow, T_i.x, T_i.y, IW * T_i.s, IH * T_i.s);
                g.globalAlpha = .35 * f; g.drawImage(L.sharp, T_i.x, T_i.y, IW * T_i.s, IH * T_i.s);
              });
              g.globalCompositeOperation = 'source-over';
            }
            if (i === PRO.lakePlane) { // moonlight glints on the water, lantern boats, mist
              g.globalCompositeOperation = 'lighter'; g.fillStyle = '#dfe8ff';
              for (const l of glints) { const a = Math.max(0, Math.sin(l.p + t * l.s)); if (a < .05) continue; const [x, y, ms] = P(.5, l.x / IW, l.y / IH); g.globalAlpha = a * .5; g.fillRect(x - l.l * ms / 2, y, l.l * ms, 1.2); }
              for (const b of boats) {
                const u = clamp(b.t0 + t / b.dur), bx = lerp(b.x0, b.x1, u), by = lerp(b.y0, b.y1, u) + Math.sin(t * 1.3 + b.ph) * .0008, [x, y, ms] = P(.55, bx, by), sz = 26 * ms * b.s;
                g.globalCompositeOperation = 'source-over'; g.globalAlpha = .85; g.fillStyle = '#0a0c14'; g.beginPath(); g.ellipse(x, y + sz * .12, sz * .55, sz * .1, 0, 0, TAU); g.fill();
                g.globalCompositeOperation = 'lighter'; const fl = .8 + .2 * noise1(t * 5 + b.ph);
                g.globalAlpha = .9 * fl; g.drawImage(warm, x - sz * .5, y - sz * .62, sz, sz);
                g.globalAlpha = .35 * fl; g.drawImage(warm, x - sz * .16, y + sz * .1, sz * .32, sz * 1.1); // its reflection
              }
              g.globalCompositeOperation = 'source-over';
              for (const m of mist) { const [x, y, ms] = P(.5, ((m.x + t * m.v) % 1.4) - .2, m.y), mw = 700 * ms * m.s; g.globalAlpha = .22; g.drawImage(A.puffs[m.k], x - mw / 2, y - mw * .2, mw, mw * .4); }
            }
          }
          // ---------- the dive through the clouds ----------
          for (const c of dive) {
            const z = c.z0 - t * .42; if (z <= .08 || z > 3) continue;
            const a = clamp((z - .1) / .35) * clamp((2.6 - z) / .8) * .7, sz = W * 1.1 / z;
            const x = W / 2 + c.x * W * .5 / z, y = H * .38 + c.y * H * .5 / z;
            g.globalAlpha = a; g.save(); g.translate(x, y); if (c.flip) g.scale(-1, 1); g.drawImage(A.puffs[c.k], -sz / 2, -sz * .26, sz, sz * .52); g.restore();
          }
          g.globalAlpha = 1;
          // ---------- the owl ----------
          const ko = (t - OWL0) / (OWL1 - OWL0);
          if (ko > 0 && ko < 1) {
            const [tx, ty] = P(PRO.castlePlane / (n - 1), PRO.tower.x, PRO.tower.y);
            const grow = Math.pow(ko, 2.4), size = lerp(Math.min(W, H) * .05, Math.max(W, H) * 1.1, grow);
            // keyframes: off the tower, a swoop down toward the middle of the frame as it comes at the camera,
            // then up over the camera and out of the top
            const K = [[0, tx, ty], [.5, W * .56, H * .4], [.78, W * .5, H * .36], [1, W * .5, -size * .55]];
            let j = 0; while (j < K.length - 2 && ko > K[j + 1][0]) j++;
            const u = (ko - K[j][0]) / (K[j + 1][0] - K[j][0]), su = u * u * (3 - 2 * u);
            const x = lerp(K[j][1], K[j + 1][1], su) + Math.sin(ko * Math.PI * 2) * W * .05 * (1 - ko), y = lerp(K[j][2], K[j + 1][2], su);
            const bank = Math.sin(ko * Math.PI * 2) * .18 * (1 - ko);
            owlXY = [x, y + size * .32, size];
            if (!inst.hoot && ko > .04) { inst.hoot = true; env.audio.sfx('owl', .55); }
            if (!inst.swoop && t > DROP - .3) { inst.swoop = true; env.audio.sfx('whoosh', .7); }
            drawOwl(g, x, y, size, t, bank, ko < DROP_K);
          } else owlXY = null;
        }
        // ---------- the letter falls and turns ----------
        const kf = (t - DROP) / (LAND - DROP);
        if (kf > 0 && !flipped) {
          if (!inst.from) inst.from = owlXY ? [owlXY[0], owlXY[1]] : [W * .5, H * .1];
          const k = clamp(kf), e = easeOut(k), [x0, y0] = inst.from;
          const x = lerp(x0, W / 2, e) + Math.sin(k * Math.PI * 2.4) * W * .1 * (1 - k), y = lerp(y0, H * .5, e);
          const spin = Math.pow(1 - e, 1.4) * 540, tumble = Math.sin(k * 8) * 40 * (1 - k), rz = Math.sin(k * Math.PI * 3) * 22 * (1 - k);
          let ry = spin, lift = 0;
          if (t > flipAt) { const f = easeInOut(clamp((t - flipAt) / 1)); ry = 180 * f; lift = Math.sin(f * Math.PI); if (f >= 1) flipped = true; }
          const bob = k >= 1 ? Math.sin(t * 1.6) * 5 : 0, sc = lerp(.12, 1, e) * (1 + lift * .06);
          card.style.opacity = clamp(kf * 6).toFixed(3);
          card.style.transform = `translate(${(x - W / 2).toFixed(1)}px,${(y - H / 2 + bob).toFixed(1)}px) scale(${sc.toFixed(3)}) rotateX(${(tumble + lift * 8).toFixed(1)}deg) rotateY(${ry.toFixed(1)}deg) rotateZ(${rz.toFixed(1)}deg)`;
          if (k >= 1 && !landed) { landed = true; wrap.classList.add('landed'); env.audio.sfx('chime', .5); fx.burst(W / 2, H / 2, { n: 40, speed: 120, life: 1.4, size: 1.6 }); }
          if (landed && flipAt === Infinity) {
            if (t > LAND + 1.2 && !inst.h1) { inst.h1 = true; say('轻触信封，把它翻过来'); }
            if (t > LAND + FLIP_AUTO + 1.5) { flipAt = t; say(''); env.audio.sfx('page', .5); }
          }
          if (flipped) { card.style.opacity = 0; envEl.classList.add('on'); inst.flipDone = t; say('轻触火漆，拆开这封信'); }
        }
        if (flipped && !opened && openAt === Infinity && t > inst.flipDone + OPEN_AUTO) openAt = t; // once: it would otherwise keep postponing itself
        if (!opened && t > openAt) { opened = true; openStart = t; wrap.classList.add('open'); say(''); env.audio.sfx('seal', .8); }
        if (opened) {
          const k2 = t - openStart;
          openRig(k2);
          const ws = openStart + O.write;
          while (written < chars.length && t >= ws + times[written]) {
            const sp = chars[written++]; sp.classList.add('on');
            if (written % 4 === 0) { const r = sp.getBoundingClientRect(); fx.trail(r.right, r.top + r.height * .6, { life: .9, size: 1.4, vy: -16, color: '140,220,170' }); }
          }
          if (written >= chars.length && !done) { done = true; doneAt = t; paper.classList.add('glow'); env.audio.sfx('sparkle', .6); }
          if (done && t > doneAt + 1.7 && !leaving) { leaving = true; env.next({ transition: 'gold' }); }
        }
        // a hush falls once the letter is in front of her
        const dim = between(t, LAND - 1.5, LAND + .5) * .45 + (opened ? between(t - openStart, 0, 2) * .25 : 0);
        if (dim > 0 && !covered) { g.fillStyle = `rgba(4,6,14,${dim.toFixed(3)})`; g.fillRect(0, 0, W, H); }
      },
    };
    const DROP_K = (DROP - OWL0) / (OWL1 - OWL0);
    // the owl: one painted body and wing (mirrored for the other side), wings beating about the shoulders
    function drawOwl(g, x, y, size, t, bank, carrying) {
      const B = A.owlBody, Wg = A.owlWing, k = size / PRO.owl.w, beat = Math.sin(t * TAU * 2.1), lift = beat * .5 - .05;
      g.save(); g.translate(x, y); g.rotate(bank); g.scale(k, k);
      for (const side of [-1, 1]) {
        g.save(); g.translate(side * PRO.owl.sx, PRO.owl.sy); g.scale(side, 1); g.rotate(-lift);
        g.scale(1, 1 - Math.abs(beat) * .18); // the wing foreshortens at the top and bottom of the beat
        g.drawImage(Wg, -PRO.owl.wx, -PRO.owl.wy); g.restore();
      }
      g.drawImage(B, -B.width / 2, -PRO.owl.by);
      if (carrying) { // the letter, held in its talons
        const ty = PRO.owl.ty - PRO.owl.by; g.fillStyle = '#d9c39a'; g.fillRect(-PRO.owl.w * .07, ty - PRO.owl.w * .03, PRO.owl.w * .14, PRO.owl.w * .095);
        g.fillStyle = '#8c1d1d'; g.beginPath(); g.arc(0, ty + PRO.owl.w * .018, PRO.owl.w * .018, 0, TAU); g.fill();
      }
      g.restore();
    }
    // ---------- the filmed opening ----------
    function filmedFrame(t, W, H, portrait) {
      g.globalAlpha = 1; g.fillStyle = '#05070d'; g.fillRect(0, 0, W, H);
      // the castle clip is a tall frame: on wide screens the camera cranes down it, from the moon to the castle
      const crane = easeInOut(clamp(t / DIVE)), lx = env.look.x * .015, ly = env.look.y * .015;
      if (drawable(clipCastle)) drawCover(g, clipCastle, 0, 0, W, H, .5 + lx, portrait ? .5 + ly : lerp(.04, .5, crane) + ly, 1.04 + .04 * crane);
      if (t > V.owlAt - .3 && !inst.owlStarted) { inst.owlStarted = true; play(clipOwl, V.owlRate, 0); }
      // the owl comes in through a rush of cloud; as it lets go of the letter it swoops up over the camera
      const ko = between(t, V.owlAt, V.owlAt + V.blend), up = easeIn(clamp((t - DROP + 1.2) / 1.1));
      const near = 1.04 + .5 * easeIn(clamp((t - V.owlAt) / (DROP - 1.2 - V.owlAt))) + up * .8;
      if (ko > 0 && up < 1 && drawable(clipOwl)) {
        g.globalAlpha = ko; const m = drawCover(g, clipOwl, 0, -up * H * 1.3, W, H, .5 + lx, (portrait ? .5 : .36) + ly, near); g.globalAlpha = 1;
      }
      { const k = (t - V.owlAt + .5) / 1.6; // the cloud the cut hides in
        if (k > 0 && k < 1) for (let i = 0; i < 4; i++) {
          const z = 1.4 - k * 1.3 + i * .12, a = Math.sin(k * Math.PI) * .75, sz = W * 1.2 / Math.max(.15, z), x = W * (.5 + (i - 1.5) * .22 / z), y = H * (.45 + (i % 2 - .5) * .2 / z);
          g.globalAlpha = a; g.drawImage(A.puffs[i % A.puffs.length], x - sz / 2, y - sz * .26, sz, sz * .52);
        }
        g.globalAlpha = 1; }
      if (!inst.hoot && t > V.owlAt + .4) { inst.hoot = true; env.audio.sfx('owl', .5); }
      if (!inst.swoop && t > DROP - .3) { inst.swoop = true; env.audio.sfx('whoosh', .55); }
      // the dive through thin cloud over the first seconds
      for (const c of dive) {
        const z = c.z0 - t * .42; if (z <= .08 || z > 3) continue;
        const a = clamp((z - .1) / .35) * clamp((2.6 - z) / .8) * .55, sz = W * 1.1 / z;
        const x = W / 2 + c.x * W * .5 / z, y = H * .38 + c.y * H * .5 / z;
        g.globalAlpha = a; g.save(); g.translate(x, y); if (c.flip) g.scale(-1, 1); g.drawImage(A.puffs[c.k], -sz / 2, -sz * .26, sz, sz * .52); g.restore();
      }
      g.globalAlpha = 1; owlXY = [W * .5, -H * .04, 0]; // it let the letter go just above, as it passed over
    }
    // ---------- the opening, one frame at a time (seconds after she presses the seal) ----------
    let last = -1, flapUp = false;
    openRig = k => {
      const W = env.W, ew = Math.min(520, W * .86), eh = ew / PRO.envAspect, lw = parseFloat(wrap.style.getPropertyValue('--lw')), lh = parseFloat(wrap.style.getPropertyValue('--lh'));
      // the seal: pressed, light cracks through it, then it bursts
      const press = k < O.burst ? Math.sin(clamp(k / O.burst) * Math.PI) * .07 : 0;
      if (k < O.burst + .1) {
        seal.style.transform = `translate(-50%,-50%) scale(${(1 - press).toFixed(3)})`;
        crackPaths.forEach((p, i) => { const u = clamp((k - .04 - i * .025) / (O.burst - .12)); p.style.strokeDashoffset = (1 - easeOut(u)).toFixed(3); p.style.strokeWidth = (1.2 + 1.6 * u).toFixed(2); });
      }
      if (k >= O.burst && !shards) {
        seal.style.visibility = 'hidden'; shards = burstSeal(); env.audio.sfx('sparkle', .55);
        const r = seal.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        fx.burst(cx, cy, { n: 46, speed: 190, life: 1.3, size: 1.7, color: '255,214,140' });
        fx.burst(cx, cy, { n: 18, speed: 120, life: .9, size: 1.2, color: '170,30,35' });
      }
      if (shards) stepShards(k - O.burst);
      { const u = clamp((k - O.burst) / .55); flash.style.opacity = (u > 0 && u < 1 ? Math.sin(u * Math.PI) * (1 - u * .4) : 0).toFixed(3); flash.style.transform = `translate(-50%,-50%) scale(${(.3 + 1.5 * easeOut(u)).toFixed(3)})`; }
      // the flap swings up on its hinge; past upright it is behind the letter
      const fa = 178 * easeInOut(clamp((k - O.flap) / .8)), drop = easeIn(clamp((k - O.away) / .75)), dy = drop * eh * .8, fade = (1 - drop).toFixed(3);
      if (fa > 90 !== flapUp) { flapUp = fa > 90; flap.style.zIndex = flapUp ? 1 : 4; }
      flap.style.transform = `translateY(${dy.toFixed(1)}px) rotateX(${fa.toFixed(1)}deg)`; flap.style.setProperty('--shade', (Math.sin(fa * Math.PI / 180) * .6).toFixed(3)); flap.style.opacity = fade;
      envParts.forEach(e => { e.style.transform = `translateY(${dy.toFixed(1)}px)`; e.style.opacity = fade; });
      // the letter, folded in three, slides up out of the pocket, comes forward and opens fold by fold
      const s0 = ew * .84 / lw, fh = lh / 3, y0 = eh * .06, yOut = -eh / 2 - fh * s0 / 2 - 6;
      const rise = easeInOut(clamp((k - O.rise) / 1.05)), come = easeInOut(clamp((k - O.forward) / 1.2));
      const y = lerp(lerp(y0, yOut, rise), 0, come), sc = lerp(s0, 1, come);
      if (come > 0 && paper.style.zIndex !== '6') paper.style.zIndex = 6;
      const u2 = easeInOut(clamp((k - O.unfold) / .7)), u0 = easeInOut(clamp((k - O.unfold - .45) / .75));
      const a2 = 177 * (1 - u2), a0 = -174 * (1 - u0);
      const key = [y, sc, a2, a0].map(v => v.toFixed(2)).join();
      if (key !== last) {
        last = key;
        paper.style.transform = `translateY(${y.toFixed(1)}px) scale(${sc.toFixed(4)})`;
        folds[2].style.transform = `rotateX(${a2.toFixed(2)}deg)`; folds[0].style.transform = `rotateX(${a0.toFixed(2)}deg)`;
        folds[2].style.setProperty('--shade', (Math.abs(Math.sin(a2 * Math.PI / 360)) * .8).toFixed(3));
        folds[0].style.setProperty('--shade', (Math.abs(Math.sin(a0 * Math.PI / 360)) * .8).toFixed(3));
        folds[1].style.setProperty('--shade', (1 - u0) * .6);
      }
      if (u0 >= 1 && !paper.classList.contains('lifted')) { paper.classList.add('lifted'); paper.style.transformStyle = 'flat'; }
      if (!inst.paperSnd && k > O.unfold) { inst.paperSnd = true; env.audio.sfx('page', .7); }
    };
    // the wax shards: each a wedge of the seal's own picture, thrown out from where it cracked
    function burstSeal() {
      const sw = seal.offsetWidth;
      return crack.wedges.map(w => {
        const el = document.createElement('div'); el.className = 'pro-shard';
        el.innerHTML = `<img src="${asset('img/seal.webp')}" alt="">`; el.firstChild.style.clipPath = `polygon(${w.poly.map(p => p[0].toFixed(1) + '% ' + p[1].toFixed(1) + '%').join(',')})`;
        el.style.transformOrigin = `${w.c[0].toFixed(1)}% ${w.c[1].toFixed(1)}%`; envEl.appendChild(el);
        const dx = w.c[0] - crack.c[0], dy = w.c[1] - crack.c[1], d = Math.hypot(dx, dy) || 1, sp = sw * (2.2 + R() * 1.6);
        return { el, x: 0, y: 0, vx: dx / d * sp, vy: dy / d * sp - sw * 2.4, r: 0, vr: (R() - .5) * 900, rx: 0, vrx: (R() - .5) * 700, g: sw * 16 };
      });
    }
    let shardT = 0;
    function stepShards(k) {
      const dt = Math.max(0, k - shardT); shardT = k;
      for (const p of shards) {
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; p.rx += p.vrx * dt;
        p.el.style.transform = `translate(-50%,-50%) translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) rotate(${p.r.toFixed(1)}deg) rotateX(${p.rx.toFixed(1)}deg)`;
        p.el.style.opacity = clamp(1.4 - k * 1.1).toFixed(3);
      }
      if (k > 1.4) { shards.forEach(p => p.el.remove()); shards.length = 0; }
    }
    inst.resize();
    return inst;
  },
};
