// Prologue: a moonlit lake. A point of light slips from the moon, drifts down on a trail of stardust,
// and blooms into a sealed envelope addressed to 师宝宝. The letter rises and writes itself.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, easeOut, rng, fbm, glowSprite, sparkleSprite, TAU } from '../util.js';
import { loadDepth, DepthView, wander } from '../depth.js';

const LETTER = [
  '亲爱的师宝宝：', '',
  '我们很高兴地通知你——',
  '今晚，你被一本古老的魔法书选中了。', '',
  '它在月光下等了很久很久，',
  '只为在你生日这一天，',
  '把一些故事，一页一页讲给你听。', '',
  '请跟着烛光，去书房找它。',
];
const SIGN = '—— 一个在远方，很想你的人';
const MOON = { x: 836, y: 287 }, CASTLE = { x: 884, y: 1094 };
const A = {};

function makeClouds(seed) {
  const w = 360, h = 140, c = canvas(w, h), g = c.getContext('2d'); const d = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / 70 + seed, y / 34 + seed * 2, 5) * .5 + .5;
    const edge = Math.sin(Math.PI * y / h) * Math.min(1, x / 40, (w - x) / 40);
    const a = clamp((n - .5) * 3) * edge;
    const i = (y * w + x) * 4; d.data[i] = 196; d.data[i + 1] = 206; d.data[i + 2] = 232; d.data[i + 3] = a * 120;
  }
  g.putImageData(d, 0, 0); return c;
}

export default {
  id: 'prologue', music: 'prologue',
  async load() {
    const [lake] = await Promise.all([loadImage(asset('img/night-lake.webp')),
      ...['letter', 'env-inside', 'env-pocket', 'env-flap', 'env-flap-in', 'seal'].map(n => loadImage(asset(`img/${n}.webp`)))]);
    A.lake = lake; A.depth = await loadDepth('night-lake');
    if (!A.clouds) A.clouds = [makeClouds(1.3), makeClouds(7.9)];
  },
  create(env) {
    const { el, fx } = env;
    env.pups.set('hidden');
    const cv = canvas(1, 1); cv.className = 'full'; el.appendChild(cv);
    const g = cv.getContext('2d', { alpha: false }), img = A.lake, clouds = A.clouds;
    const R = rng(11);
    const stars = Array.from({ length: Math.round(110 * env.q + 30) }, () => {
      let x, y; do { x = R() * 1024; y = R() * 780; } while (Math.hypot(x - MOON.x, y - MOON.y) < 90);
      return { x, y, r: .5 + R() * R() * 1.6, p: R() * TAU, s: .6 + R() * 2.2 };
    });
    const moonGlow = glowSprite('205,220,255', 128, 1.6), warm = glowSprite('255,190,110', 64, 2), bloom = glowSprite('255,236,200', 128, 1.3), spark = sparkleSprite('255,246,225', 64);
    const glints = Array.from({ length: Math.round(50 * env.q + 16) }, () => { const y = 1130 + R() * 330; return { x: 760 + (R() - .5) * 160 * (1 + R()), y, p: R() * TAU, s: 1 + R() * 3, l: 4 + R() * 14, d: clamp(lerp(.14, 1, Math.pow((y - 1130) / 350, 1.6))) }; });
    const view = new DepthView(A.depth, { amp: .035, focus: .42 }), tmp = {};

    // ---------- envelope and letter ----------
    const wrap = document.createElement('div'); wrap.className = 'pro-letter-wrap'; el.appendChild(wrap);
    wrap.innerHTML = `
      <div class="pro-env">
        <i class="pro-env-shadow"></i>
        <img class="pro-env-inside" src="${asset('img/env-inside.webp')}" alt="">
        <div class="pro-paper"><div class="pro-paper-inner"></div></div>
        <img class="pro-env-pocket" src="${asset('img/env-pocket.webp')}" alt="">
        <div class="pro-env-flap"><img class="out" src="${asset('img/env-flap.webp')}" alt=""><img class="in" src="${asset('img/env-flap-in.webp')}" alt=""></div>
        <button class="pro-seal" type="button" aria-label="打开信"><img src="${asset('img/seal.webp')}" alt=""></button>
      </div>`;
    const envEl = wrap.querySelector('.pro-env'), paper = wrap.querySelector('.pro-paper'), inner = wrap.querySelector('.pro-paper-inner'), seal = wrap.querySelector('.pro-seal');
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

    const ARRIVE = 4.7;
    let T = 0, openAt = ARRIVE + 1.3, opened = false, openStart = 0, written = 0, done = false, doneAt = 0, leaving = false, bloomed = false, res = 1;
    seal.addEventListener('click', () => { if (!opened && T > ARRIVE + .6) openAt = T; });
    const cues = env.cues([[.5, 4, '今晚的月亮，替一个人送来一封信。'], [ARRIVE + .2, ARRIVE + 2.4, '寄给 · 师宝宝']]);

    const inst = {
      progress: () => clamp(T / (ARRIVE + 4 + WRITE_LEN + 3)),
      resize() {
        res = env.res(true);
        cv.width = Math.round(env.W * res); cv.height = Math.round(env.H * res);
        const W = env.W, H = env.H;
        let lw = Math.min(540, W * .88), lh = lw * 1.34; if (lh > H * .9) { lh = H * .9; lw = lh / 1.34; }
        const fs = Math.max(14, Math.min(21, lw * .041));
        const ew = Math.min(500, W * .84), eh = ew * .65;
        const v = { '--lw': lw + 'px', '--lh': lh + 'px', '--fs': fs + 'px', '--ew': ew + 'px', '--eh': eh + 'px', '--sx': ew * .9 / lw, '--sy': eh * .84 / lh };
        for (const k in v) wrap.style.setProperty(k, v[k]);
      },
      update(dt, t) {
        T = t; cues(t);
        const W = env.W, H = env.H; g.setTransform(res, 0, 0, res, 0, 0);
        // the painted night stops being redrawn once the letter covers it
        const still = opened && t - openStart > 2 && !inst.redrawn;
        if (!(opened && t - openStart > 2.2)) {
          const s = env.portrait ? Math.max(W / 1024, H / 1536) * 1.12 : W / 1024 * 1.04;
          const tilt = easeInOut(t / 7);
          const y0 = H * .36 - MOON.y * s, y1 = H * .6 - CASTLE.y * s;
          const oy = clamp(lerp(y0, y1, tilt), H - 1536 * s, 0);
          const ox = (W - 1024 * s) * (env.portrait ? .72 : .5);
          inst.cam = { s, ox, oy };
        }
        const { s, ox, oy } = inst.cam;
        // 2.5D: the painting is four depth planes; the camera cranes down with the tilt, drifts and leans with her
        const wd = wander(t, 1.3, .8), crane = easeInOut(t / 7);
        view.frame({ s, x: ox, y: oy }, { x: wd.x * .55 + env.look.x * .7, y: lerp(-1.1, .2, crane) + wd.y * .25 + env.look.y * .45, zoom: .07 * easeInOut(t / 14), focus: .42 }, [W / 2, H * .5]);
        const sky = view.T[0], at = (d, o) => view.at(d, o);
        const P = (x, y) => [sky.x + x * sky.s, sky.y + y * sky.s];
        view.draw(g, 0, 1);
        clouds.forEach((c, i) => {
          const cw = 1024 * s * (1.1 + i * .3), ch = cw * c.height / c.width, drift = ((t * (6 + i * 5) * s) % cw), [, cy] = P(0, 140 + i * 330);
          g.globalAlpha = .5 - i * .12; g.drawImage(c, ox - drift, cy, cw, ch); g.drawImage(c, ox - drift + cw, cy, cw, ch);
        });
        g.globalAlpha = 1; g.fillStyle = '#eef2ff';
        for (const st of stars) { const [x, y] = P(st.x, st.y); if (y < -4 || y > H) continue; g.globalAlpha = .35 + .65 * (.5 + .5 * Math.sin(st.p + t * st.s)); g.fillRect(x, y, st.r * s * 1.6, st.r * s * 1.6); }
        const [mx, my] = P(MOON.x, MOON.y); const mg = 260 * s * (1 + .05 * Math.sin(t * .8));
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = .55; g.drawImage(moonGlow, mx - mg, my - mg, mg * 2, mg * 2);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        view.draw(g, 1, 2);
        const cm = at(.13, tmp), cx = cm.x + (CASTLE.x - 6) * cm.s, cy = cm.y + CASTLE.y * cm.s, cf = 40 * cm.s * (1 + .12 * Math.sin(t * 7.3) + .08 * Math.sin(t * 13.1));
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = .7; g.drawImage(warm, cx - cf, cy - cf, cf * 2, cf * 2);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        view.draw(g, 2, 3);
        // moonlight glints ride the lake at their own depth
        g.globalCompositeOperation = 'lighter'; g.fillStyle = '#dfe8ff';
        for (const l of glints) {
          const a = Math.max(0, Math.sin(l.p + t * l.s)); if (a < .05) continue;
          const m = at(l.d, tmp), x = m.x + l.x * m.s, y = m.y + l.y * m.s;
          g.globalAlpha = a * .55; g.fillRect(x - l.l * m.s / 2, y, l.l * m.s, 1.2);
        }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        view.draw(g, 3);

        // ---------- the falling light ----------
        const k = clamp((t - 1.4) / (ARRIVE - 1.4));
        if (k > 0 && k < 1) {
          const e = easeInOut(k), tx = W / 2, ty = H * .47;
          const x = lerp(mx, tx, e) + Math.sin(k * Math.PI * 2.2) * W * .07 * (1 - k), y = lerp(my, ty, e);
          const sz = (24 + k * 30) * (1 + Math.sin(t * 9) * .12);
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = .9; g.drawImage(bloom, x - sz * 2.4, y - sz * 2.4, sz * 4.8, sz * 4.8);
          g.globalAlpha = 1; g.drawImage(spark, x - sz / 2, y - sz / 2, sz, sz);
          g.globalCompositeOperation = 'source-over';
          fx.trail(x, y, { life: 1.5, size: 1.8, spread: 10, vy: 6 });
          if (env.q >= 1) fx.trail(x, y, { life: 1.2, size: 1.2, spread: 16, vy: 10 });
        }
        if (!bloomed && t >= ARRIVE) { bloomed = true; fx.burst(W / 2, H * .47, { n: 80, speed: 170, life: 1.5, size: 2 }); env.audio.sfx('chime', .8); }
        const flash = bloomed ? Math.max(0, 1 - (t - ARRIVE) / .8) : 0;
        if (flash > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = flash * .8; const b = Math.min(W, H) * (.5 + (1 - flash) * .6); g.drawImage(bloom, W / 2 - b, H * .47 - b, b * 2, b * 2); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
        const dim = between(t, ARRIVE - .4, ARRIVE + 1.2) * .6 + (done ? between(t, doneAt, doneAt + 2) * .2 : 0);
        if (dim > 0) { g.fillStyle = `rgba(4,6,14,${dim.toFixed(3)})`; g.fillRect(0, 0, W, H); }

        // ---------- envelope ----------
        if (t > ARRIVE - .1 && !opened) {
          const a = easeOut(clamp((t - ARRIVE + .1) / 1));
          envEl.style.opacity = a.toFixed(3);
          envEl.style.transform = `translateY(${(Math.sin(t * 1.6) * 5).toFixed(1)}px) rotate(${(Math.sin(t * 1.1) * 1.1).toFixed(2)}deg) scale(${lerp(.7, 1, a).toFixed(3)})`;
          if (a >= 1) wrap.classList.add('ready');
        }
        if (!opened && t > openAt) {
          opened = true; openStart = t; wrap.classList.add('open'); env.audio.sfx('seal');
          envEl.style.transform = ''; envEl.style.opacity = 1;
          const r = seal.getBoundingClientRect(); fx.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 60, speed: 180, life: 1.3, size: 2 });
        }
        if (opened) {
          const k2 = t - openStart;
          wrap.classList.toggle('flap', k2 > .12); wrap.classList.toggle('rise', k2 > .7); wrap.classList.toggle('free', k2 > 1.45);
          const ws = openStart + 1.9;
          while (written < chars.length && t >= ws + times[written]) {
            const sp = chars[written++]; sp.classList.add('on');
            if (written % 4 === 0) { const r = sp.getBoundingClientRect(); fx.trail(r.right, r.top + r.height * .6, { life: .9, size: 1.4, vy: -16 }); }
          }
          if (written >= chars.length && !done) { done = true; doneAt = t; paper.classList.add('glow'); env.audio.sfx('sparkle', .6); }
          if (done && t > doneAt + 1.7 && !leaving) { leaving = true; env.next({ transition: 'gold' }); }
        }
      },
    };
    inst.resize();
    return inst;
  },
};
