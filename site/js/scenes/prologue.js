// Prologue, after the films' owl post: the camera dives through moonlit cloud down to a great castle
// above a black lake (windows flickering with candlelight, lantern boats gliding to the shore, mist on the
// water). A snowy owl leaves the tallest tower, flies straight at the camera and lets go of a letter; the
// heavy parchment envelope tumbles down in 3D and lands addressed in emerald ink. She turns it over,
// breaks the crimson wax seal, and the letter rises and writes itself.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, easeOut, rng, fbm, noise1, glowSprite, sparkleSprite, TAU } from '../util.js';
import { loadDepth, DepthView, wander } from '../depth.js';
import { PRO } from './prologue-art.js';

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
  async load() {
    const [castle, owlBody, owlWing] = await Promise.all([loadImage(asset('img/castle.webp')), loadImage(asset('img/owl-body.webp')), loadImage(asset('img/owl-wing.webp')),
      ...['letter', 'env-front', 'env-back', 'env-inside', 'env-pocket', 'env-flap', 'env-flap-in', 'seal'].map(n => loadImage(asset(`img/${n}.webp`)))]);
    Object.assign(A, { castle, owlBody, owlWing }); A.depth = await loadDepth('castle');
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
        <div class="pro-paper"><div class="pro-paper-inner"></div></div>
        <img class="pro-env-pocket" src="${asset('img/env-pocket.webp')}" alt="">
        <div class="pro-env-flap"><img class="out" src="${asset('img/env-flap.webp')}" alt=""><img class="in" src="${asset('img/env-flap-in.webp')}" alt=""></div>
        <button class="pro-seal" type="button" aria-label="打开火漆，拆开这封信"><img class="l" src="${asset('img/seal.webp')}" alt=""><img class="r" src="${asset('img/seal.webp')}" alt=""></button>
      </div>
      <p class="pro-hint"></p>`;
    const $ = s => wrap.querySelector(s);
    const card = $('.pro-card'), envEl = $('.pro-env'), paper = $('.pro-paper'), inner = $('.pro-paper-inner'), seal = $('.pro-seal'), hint = $('.pro-hint');
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
      resize() {
        res = env.res(true);
        cv.width = Math.round(env.W * res); cv.height = Math.round(env.H * res);
        const W = env.W, H = env.H;
        let lw = Math.min(540, W * .88), lh = lw * 1.34; if (lh > H * .9) { lh = H * .9; lw = lh / 1.34; }
        const fs = Math.max(14, Math.min(21, lw * .041));
        const ew = Math.min(520, W * .86), eh = ew / PRO.envAspect;
        const v = { '--lw': lw + 'px', '--lh': lh + 'px', '--fs': fs + 'px', '--ew': ew + 'px', '--eh': eh + 'px', '--sx': ew * .86 / lw, '--sy': eh * .8 / lh };
        for (const k in v) wrap.style.setProperty(k, v[k]);
      },
      update(dt, t) {
        T = t; cues(t);
        const W = env.W, H = env.H, portrait = env.portrait; g.setTransform(res, 0, 0, res, 0, 0);
        const covered = opened && t - openStart > 2.2;
        if (!covered) {
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
        if (flipped && !opened && t > inst.flipDone + OPEN_AUTO) openAt = t;
        if (!opened && t > openAt) {
          opened = true; openStart = t; wrap.classList.add('open'); say(''); env.audio.sfx('page', .8); env.audio.sfx('sparkle', .5);
          const r = seal.getBoundingClientRect(); fx.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 50, speed: 160, life: 1.2, size: 1.8, color: '255,170,150' });
        }
        if (opened) {
          const k2 = t - openStart;
          wrap.classList.toggle('flap', k2 > .6); wrap.classList.toggle('rise', k2 > 1.3); wrap.classList.toggle('free', k2 > 2.05);
          const ws = openStart + 2.5;
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
    inst.resize();
    return inst;
  },
};
