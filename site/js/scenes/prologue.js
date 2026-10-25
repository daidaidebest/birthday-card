// Prologue, after the films' owl post: from high above, the camera glides down past the moon toward a castle
// on a cliff over a misty lake (a photograph in depth planes; candlelight breathing in its windows). A snowy owl
// glides across the sky and lets go of a letter as it leaves the frame; the heavy parchment envelope tumbles down
// in 3D and lands addressed in emerald ink. She turns it over and touches the little gold-foil star on its flap:
// two threads of light run along the flap's seams, it springs open, and the letter slides out, unfolds and writes
// itself while the birthday tune plays.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, easeOut, easeIn, rng, fbm, noise1, glowSprite, sparkleSprite, TAU } from '../util.js';
import { loadDepth, DepthView, wander } from '../depth.js';
import { PRO } from './prologue-art.js';

const LETTER = [
  '亲爱的师宝宝：', '',
  '我们很高兴地通知你——',
  '你已被月光魔法书院录取。', '',
  '开学日期：十一月三日，你的生日——就是今晚。',
  '所需物品：好奇心，和一点点勇气，',
  '以及，允许自己被好好地爱着。', '',
  '请跟着烛光，去书房找那本魔法书。',
];
const SIGN = '—— 一个在远方，很想你的人';
const ADDRESS = ['师宝宝 收', '月光湖畔 · 最高的塔楼', '朝东的那扇窗'];
const A = {};

// timeline (seconds)
const DIVE = 7.2;                         // the crane from the moon down to the castle
const OWL0 = 4.4, OWL1 = 9.6;             // the owl's glide across the sky
const DROP = 9.5, LAND = 13.4;            // the letter falls from its talons and settles in front of her
const FLIP_AUTO = 2.8, OPEN_AUTO = 6;     // she may turn it / open it herself; otherwise it happens
// the opening, in seconds after she touches the star
const O = { burst: .78, flap: .86, rise: 1.45, away: 2.5, forward: 2.65, unfold: 3.1, write: 4.55, covered: 4.45 };
// the flap's seams in envelope units (100 wide): from its point out to the two top corners (tools/parchment.py)
const SEAM = { tip: [50, 45.2], l: [1.6, .9], r: [98.4, .9] };

const STAR = `<svg class="pro-star-svg" viewBox="-50 -50 100 100" aria-hidden="true"><defs>
  <radialGradient id="psg" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#fff6cf"/><stop offset=".35" stop-color="#f1cf7a"/><stop offset=".75" stop-color="#b98a2e"/><stop offset="1" stop-color="#7d5a17"/></radialGradient>
  <linearGradient id="psh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
  <circle r="44" fill="#6e4f14" opacity=".18"/>
  <path d="${starPath(36, 15)}" fill="url(#psg)" stroke="#8a6420" stroke-width="1.4"/>
  <path d="${starPath(36, 15)}" fill="url(#psh)" transform="scale(.82)"/>
  <path d="${starPath(10, 4.2)}" fill="#fff8de" opacity=".9"/></svg>`;
function starPath(R, r) { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + (Math.cos(a) * q).toFixed(2) + ' ' + (Math.sin(a) * q).toFixed(2); } return d + 'Z'; }

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
    const [castle, owl] = await Promise.all([loadImage(asset('img/castle.webp')), loadImage(asset('img/owl-glide.webp')),
      ...['letter', 'env-front', 'env-back', 'env-inside', 'env-pocket', 'env-flap', 'env-flap-in'].map(n => loadImage(asset(`img/${n}.webp`)))]);
    Object.assign(A, { castle, owl }); A.depth = await loadDepth('castle');
    if (!A.puffs) A.puffs = [puff(1.3), puff(4.1), puff(7.9), puff(11.2)];
    if (!A.lights) A.lights = windowLights(castle);
  },
  create(env) {
    const { el, fx } = env;
    env.pups.set('hidden');
    const cv = canvas(1, 1); cv.className = 'full'; el.appendChild(cv);
    const g = cv.getContext('2d', { alpha: false }), img = A.castle, IW = img.width, IH = img.height;
    const R = rng(11);
    const view = new DepthView(A.depth, { amp: .05, focus: .4 }), tmp = {}, n = A.depth.layers.length;
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
        <div class="pro-face pro-back"><img src="${asset('img/env-back.webp')}" alt=""><span class="pro-star-img">${STAR}</span></div>
      </div>
      <div class="pro-env">
        <i class="pro-env-shadow"></i>
        <img class="pro-env-inside" src="${asset('img/env-inside.webp')}" alt="">
        <div class="pro-paper"><div class="pro-fold f1"><b></b><u></u><i></i></div><div class="pro-fold f2"><b></b><u></u><i></i></div><div class="pro-fold f0"><b></b><u></u><i></i></div><div class="pro-paper-inner"></div></div>
        <img class="pro-env-pocket" src="${asset('img/env-pocket.webp')}" alt="">
        <div class="pro-env-flap"><img class="out" src="${asset('img/env-flap.webp')}" alt=""><img class="in" src="${asset('img/env-flap-in.webp')}" alt=""><i></i></div>
        <svg class="pro-seam" viewBox="0 0 100 ${(100 / PRO.envAspect).toFixed(2)}" preserveAspectRatio="none" aria-hidden="true">${['l', 'r'].map(k => `<path d="M${SEAM.tip} L${SEAM[k]}" pathLength="1"/>`).join('')}</svg>
        <button class="pro-seal" type="button" aria-label="轻触金色的星星，拆开这封信">${STAR}</button>
        <i class="pro-flash"></i>
      </div>
      <p class="pro-hint"></p>`;
    const $ = s => wrap.querySelector(s);
    const card = $('.pro-card'), envEl = $('.pro-env'), paper = $('.pro-paper'), inner = $('.pro-paper-inner'), seal = $('.pro-seal'), hint = $('.pro-hint');
    const flap = $('.pro-env-flap'), flash = $('.pro-flash'), envParts = ['.pro-env-shadow', '.pro-env-inside', '.pro-env-pocket'].map($);
    const folds = [0, 1, 2].map(k => $('.pro-fold.f' + k)), seams = [...wrap.querySelectorAll('.pro-seam path')];
    let openRig = null, seamDone = false;
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
    envEl.addEventListener('click', () => { if (flipped && !opened && T > flipAt + 1.1) openAt = T; }); // the star, or anywhere on the envelope
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
        if (!opened && openRig) openRig(0); // the folded letter waits inside
      },
      update(dt, t) {
        T = t; cues(t);
        const W = env.W, H = env.H, portrait = env.portrait; g.setTransform(res, 0, 0, res, 0, 0);
        const covered = opened && t - openStart > O.covered;
        if (!covered) {
          // ---------- the castle, from the air: a slow drone glide forward and down, from the moon to the castle ----------
          // (a photograph split into depth planes: the near forest, the cliff, the castle and the mountains each move at
          // their own speed as the camera travels, which is what makes it read as a real place)
          const s = Math.max(W / IW, H / IH) * (portrait ? 1.05 : 1.02), dw = IW * s, dh = IH * s;
          const glide = easeInOut(clamp(t / (DIVE + 2.5))), y0 = H * .3 - PRO.moon.y * IH * s, y1 = H * (portrait ? .5 : .62) - PRO.castle.y * IH * s; // wide screens keep the moon in frame
          const oy = clamp(lerp(y0, y1, glide), H - dh, 0), ox = clamp(W * .5 - PRO.castle.x * IW * s, W - dw, 0);
          const wd = wander(t, 1.3, .6), push = .3 * easeInOut(clamp(t / 13)) + .06 * clamp((t - 13) / 10);
          view.frame({ s, x: ox, y: oy }, { x: lerp(portrait ? -.9 : -.55, portrait ? .5 : .3, glide) + wd.x * .25 + env.look.x * .7, y: lerp(-.8, .2, glide) + wd.y * .15 + env.look.y * .4, zoom: push, focus: .4 }, [W / 2, H * .5]);
          const P = (d, x, y) => { const m = view.at(d, tmp); return [m.x + x * IW * m.s, m.y + y * IH * m.s, m.s]; };
          // sky plane, then stars and the moon's halo on it
          g.globalAlpha = 1; view.draw(g, 0, 1);
          g.fillStyle = '#eef2ff';
          for (const st of stars) { const [x, y, ms] = P(0, st.x / IW, st.y / IH); if (y < -4 || y > H) continue; g.globalAlpha = .2 + .4 * (.5 + .5 * Math.sin(st.p + t * st.s)); g.fillRect(x, y, st.r * ms * 1.2, st.r * ms * 1.2); }
          { const [mx, my, ms] = P(0, PRO.moon.x, PRO.moon.y), mg = 160 * ms * (1 + .05 * Math.sin(t * .8)); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .35; g.drawImage(moonGlow, mx - mg, my - mg, mg * 2, mg * 2); g.globalCompositeOperation = 'source-over'; }
          for (let i = 1; i < n; i++) {
            g.globalAlpha = 1; view.draw(g, i, i + 1);
            const T_i = view.T[i];
            if (i === PRO.castlePlane) { // the windows breathe with candlelight, and mist drifts below the walls
              g.globalCompositeOperation = 'lighter';
              A.lights.forEach((L, k) => {
                const f = .55 + .3 * noise1(t * 1.7 + k * 9.3) + .15 * noise1(t * 6.1 + k * 3.1);
                g.globalAlpha = .5 * f; g.drawImage(L.glow, T_i.x, T_i.y, IW * T_i.s, IH * T_i.s);
                g.globalAlpha = .25 * f; g.drawImage(L.sharp, T_i.x, T_i.y, IW * T_i.s, IH * T_i.s);
              });
              g.globalCompositeOperation = 'source-over';
              for (const m of mist) { const [x, y, ms] = P(.45, ((m.x + t * m.v) % 1.4) - .2, m.y), mw = 900 * ms * m.s; g.globalAlpha = .16; g.drawImage(A.puffs[m.k], x - mw / 2, y - mw * .2, mw, mw * .4); }
            }
            if (i === PRO.lakePlane) { // moonlight glints on the water
              g.globalCompositeOperation = 'lighter'; g.fillStyle = '#dfe8ff';
              for (const l of glints) { const a = Math.max(0, Math.sin(l.p + t * l.s)); if (a < .05) continue; const [x, y, ms] = P(.9, l.x / IW, l.y / IH); g.globalAlpha = a * .45; g.fillRect(x - l.l * ms / 2, y, l.l * ms, 1.2); }
              g.globalCompositeOperation = 'source-over';
            }
          }
          // ---------- thin cloud the camera passes through at the start ----------
          for (const c of dive) {
            const z = c.z0 - t * .42; if (z <= .08 || z > 3) continue;
            const a = clamp((z - .1) / .35) * clamp((2.6 - z) / .8) * .38, sz = W * 1.1 / z;
            const x = W / 2 + c.x * W * .5 / z, y = H * .38 + c.y * H * .5 / z;
            g.globalAlpha = a; g.save(); g.translate(x, y); if (c.flip) g.scale(-1, 1); g.drawImage(A.puffs[c.k], -sz / 2, -sz * .26, sz, sz * .52); g.restore();
          }
          g.globalAlpha = 1;
          // ---------- the owl: it glides across the sky past the moon, calm and unhurried, and out of frame ----------
          const ko = (t - OWL0) / (OWL1 - OWL0);
          if (ko > 0 && ko < 1) {
            const ow = Math.min(W * (portrait ? .62 : .34), H * .5), oh = ow * A.owl.height / A.owl.width;
            const e = ko, x = lerp(W + ow * .55, -ow * .6, e), y = H * lerp(.3, .21, e) + Math.sin(t * 2.1) * H * .008;
            const lift = Math.sin(t * 2.1 + .6); // a glide, not a flap: the wings flex a little with the air
            g.save(); g.translate(x, y); g.rotate(-.04 + Math.sin(t * 1.3) * .03); g.scale(1, 1 + lift * .025);
            g.globalAlpha = clamp(ko * 8) * clamp((1 - ko) * 8); g.drawImage(A.owl, -ow / 2, -oh / 2, ow, oh); g.restore(); g.globalAlpha = 1;
            if (!inst.hoot && ko > .25) { inst.hoot = true; env.audio.sfx('whoosh', .3); }
          }
          owlXY = [W * .14, -H * .04, 0]; // it let the letter go as it left the frame
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
          if (flipped) { card.style.opacity = 0; envEl.classList.add('on'); inst.flipDone = t; say('轻触金色的星星，拆开这封信'); }
        }
        if (flipped && !opened && openAt === Infinity && t > inst.flipDone + OPEN_AUTO) openAt = t; // once: it would otherwise keep postponing itself
        if (!opened && t > openAt) { opened = true; openStart = t; wrap.classList.add('open'); say(''); env.audio.sfx('seal', .7); }
        if (opened) {
          const k2 = t - openStart;
          openRig(k2);
          const ws = openStart + O.write;
          while (written < chars.length && t >= ws + times[written]) {
            const sp = chars[written++]; sp.classList.add('on');
            if (written % 4 === 0) { const r = sp.getBoundingClientRect(); fx.trail(r.right, r.top + r.height * .6, { life: .9, size: 1.4, vy: -16, color: '140,220,170' }); }
          }
          if (written >= chars.length && !done) { done = true; doneAt = t; paper.classList.add('glow'); env.audio.sfx('sparkle', .6); }
          if (done && t > doneAt + 1.7 && !leaving) { leaving = true; const r = paper.getBoundingClientRect(); env.next({ transition: 'bloom', at: [r.left + r.width / 2, r.top + r.height * .55] }); }
        }
        // a hush falls once the letter is in front of her
        const dim = between(t, LAND - 1.5, LAND + .5) * .45 + (opened ? between(t - openStart, 0, 2) * .25 : 0);
        if (dim > 0 && !covered) { g.fillStyle = `rgba(4,6,14,${dim.toFixed(3)})`; g.fillRect(0, 0, W, H); }
      },
    };
    // ---------- the opening, one frame at a time (seconds after she touches the star) ----------
    let last = -1, flapUp = false;
    openRig = k => {
      const W = env.W, ew = Math.min(520, W * .86), eh = ew / PRO.envAspect, lw = parseFloat(wrap.style.getPropertyValue('--lw')), lh = parseFloat(wrap.style.getPropertyValue('--lh'));
      // the star: pressed, it spins and flares; then two threads of light run along the flap's seams to its corners
      const er = envEl.getBoundingClientRect(), ux = er.width / 100, toPx = q => [er.left + q[0] * ux, er.top + q[1] * ux];
      const press = k < .3 ? Math.sin(clamp(k / .3) * Math.PI) * .12 : 0, gone = easeIn(clamp((k - .18) / .4));
      seal.style.transform = `translate(-50%,-50%) scale(${(1 - press + gone * .5).toFixed(3)}) rotate(${(easeOut(clamp(k / .6)) * 144).toFixed(1)}deg)`;
      seal.style.opacity = (1 - gone).toFixed(3);
      const run = easeInOut(clamp((k - .12) / (O.burst - .12)));
      seams.forEach((p, i) => {
        p.style.strokeDashoffset = (1 - run).toFixed(3); p.style.opacity = (k < O.burst + .9 ? 1 : clamp(1 - (k - O.burst - .9) / .6)).toFixed(3);
        if (run > 0 && run < 1) { const end = i ? SEAM.r : SEAM.l, q = [lerp(SEAM.tip[0], end[0], run), lerp(SEAM.tip[1], end[1], run)], [x, y] = toPx(q); fx.trail(x, y, { life: .9, size: 1.6, vy: -14, spread: 3, color: '255,226,150' }); }
      });
      if (k >= O.burst && !seamDone) {
        seamDone = true; env.audio.sfx('sparkle', .6);
        // golden dust spills out of the mouth of the envelope as it opens
        for (let i = 0; i <= 8; i++) { const [x, y] = toPx([lerp(8, 92, i / 8), 2]); fx.burst(x, y, { n: 8, speed: 70, life: 1.6, size: 1.5, color: '255,220,150' }); }
      }
      { const u = clamp((k - O.burst + .2) / .7); flash.style.opacity = (u > 0 && u < 1 ? Math.sin(u * Math.PI) * .55 : 0).toFixed(3); flash.style.transform = `translate(-50%,-50%) scale(${(.4 + 1.3 * easeOut(u)).toFixed(3)})`; }
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
    inst.resize();
    return inst;
  },
};
