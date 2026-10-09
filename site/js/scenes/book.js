// Chapter I: the study. Candles ignite by themselves, the book rises from the desk,
// opens, writes in its own ink and turns its pages on a magical breeze.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, easeOut, easeIn, smooth, rng, glowSprite, sparkleSprite, coverRect, TAU, fbm, wait } from '../util.js';
import { buildPages, paper } from './pages.js';
import { loadDepth, DepthView, wander } from '../depth.js';

const A = {};
const WINDOW = { x0: 855, y0: 60, x1: 1250, y1: 470, moon: [1105, 168] };

function candleSprite(h) {
  const w = h * .2, c = canvas(w + 4, h + 4), g = c.getContext('2d');
  const gr = g.createLinearGradient(2, 0, w + 2, 0);
  gr.addColorStop(0, '#9d9180'); gr.addColorStop(.35, '#f4ecdc'); gr.addColorStop(.6, '#fffaf0'); gr.addColorStop(1, '#a89a86');
  g.fillStyle = gr; g.beginPath(); g.moveTo(2, 6); g.lineTo(2, h + 2); g.lineTo(w + 2, h + 2); g.lineTo(w + 2, 6);
  // melted rim with drips
  g.quadraticCurveTo(w * .8 + 2, 2, w * .55 + 2, 5); g.quadraticCurveTo(w * .4, 9, w * .25, 4); g.quadraticCurveTo(w * .1, 2, 2, 6); g.fill();
  g.fillStyle = 'rgba(255,250,236,.9)';
  for (const [x, l] of [[.22, .16], [.7, .26], [.48, .09]]) { g.beginPath(); g.ellipse(2 + w * x, 6 + h * l / 2, w * .07, h * l / 2, 0, 0, TAU); g.fill(); }
  const top = g.createLinearGradient(0, 0, 0, h * .3); top.addColorStop(0, 'rgba(255,200,120,.45)'); top.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = top; g.fillRect(2, 2, w, h * .3);
  return c;
}
function flame(g, x, y, s, t, seed) {
  const f = 1 + Math.sin(t * 13 + seed) * .06 + Math.sin(t * 7.3 + seed * 2) * .05, sway = Math.sin(t * 3.1 + seed) * s * .08;
  g.save(); g.translate(x, y); g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(0, -s * .45, 0, 0, -s * .45, s * .9);
  gr.addColorStop(0, 'rgba(255,248,220,1)'); gr.addColorStop(.35, 'rgba(255,200,110,.9)'); gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-s * .32, -s * .2, -s * .18 + sway, -s * .75 * f, sway * 1.6, -s * 1.15 * f); g.bezierCurveTo(s * .18 + sway, -s * .75 * f, s * .32, -s * .2, 0, 0); g.fill();
  g.restore();
}

/** Hand-marbled endpaper: domain-warped noise mapped to ink colours. */
let marbledURL = null;
function marbled() {
  if (marbledURL) return marbledURL;
  const w = 220, h = 300, c = canvas(w, h), g = c.getContext('2d'), d = g.createImageData(w, h);
  const pal = [[22, 32, 62], [92, 26, 30], [28, 44, 80], [140, 52, 40], [24, 30, 56]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const qx = fbm(x / 60, y / 60, 3), qy = fbm(x / 60 + 5.2, y / 60 + 1.3, 3);
    const v = fbm(x / 40 + qx * 2.6, y / 26 + qy * 2.6, 4) * .5 + .5;
    const k = v * (pal.length - 1), i0 = Math.floor(k), f = k - i0, a = pal[i0], b = pal[Math.min(pal.length - 1, i0 + 1)];
    const vein = Math.pow(1 - Math.abs(Math.sin(v * 38)), 14);
    const i = (y * w + x) * 4;
    d.data[i] = a[0] + (b[0] - a[0]) * f + vein * 170; d.data[i + 1] = a[1] + (b[1] - a[1]) * f + vein * 140; d.data[i + 2] = a[2] + (b[2] - a[2]) * f + vein * 80; d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  g.strokeStyle = 'rgba(214,170,90,.7)'; g.lineWidth = 3; g.strokeRect(8, 8, w - 16, h - 16);
  marbledURL = c.toDataURL('image/jpeg', .85); return marbledURL;
}

export default {
  id: 'book', music: 'book',
  async load() {
    const [study, port, cover, spell, botanical, tex] = await Promise.all(['img/study-land.webp', 'img/study-port.webp', 'img/cover.webp', 'img/spell.webp', 'img/botanical.webp', 'img/paper.webp'].map(p => loadImage(asset(p))));
    Object.assign(A, { study, port, cover, spell, botanical, tex });
    [A.dLand, A.dPort] = await Promise.all([loadDepth('study-land'), loadDepth('study-port')]);
    await Promise.all([document.fonts?.load('20px GiftSerif'), document.fonts?.load('600 20px GiftSerif'), document.fonts?.load('italic 20px GiftLatin')]).catch(() => {});
  },
  create(env) {
    const { el, fx } = env;
    env.pups.set('book');
    el.innerHTML = `
      <canvas class="full bk-room"></canvas>
      <div class="bk-cam"><div class="bk-float">
        <div class="bk-book">
          <div class="bk-backcover"></div>
          <div class="bk-stack l"></div><div class="bk-stack r"></div>
          <div class="bk-page l"><canvas></canvas><i class="bk-shadow"></i></div>
          <div class="bk-page r"><canvas></canvas><i class="bk-shadow"></i></div>
          <div class="bk-leaf"></div>
          <div class="bk-cover"><div class="bk-cover-front"><b>师宝宝</b><small>一本只认识你的书</small></div><div class="bk-cover-inside"></div></div>
        </div>
      </div></div>`;
    const $ = s => el.querySelector(s);
    // one canvas holds the window sky, the four depth planes of the room and the candlelight (fewest layers to composite)
    const light = $('.bk-room'), lg = light.getContext('2d', { alpha: false }), skyG = lg;
    const floatEl = $('.bk-float'), bookEl = $('.bk-book'), leafEl = $('.bk-leaf'), coverEl = $('.bk-cover');
    const auraS = glowSprite('255,206,130', 128, 1.6); let camX = 0, camY = 0, camS = .5;
    const pageL = $('.bk-page.l canvas'), pageR = $('.bk-page.r canvas'), shadowL = $('.bk-page.l .bk-shadow'), shadowR = $('.bk-page.r .bk-shadow');
    bookEl.querySelector('.bk-cover-front').style.backgroundImage = `url(${A.cover.src})`;
    bookEl.querySelector('.bk-cover-inside').style.backgroundImage = `url(${marbled()})`;

    const defs = buildPages(A);
    const SPREADS = defs.length / 2;
    let win = { x: 0, y: 0, w: 1, h: 1 }, rs = 1, pw = 300, ph = 400, dpr = env.dpr, N = env.q < 1 ? 12 : 18;
    let portrait = env.portrait, cover = null;
    const R = rng(5);

    // ---------------- candles ----------------
    const candleH = [96, 70, 50];
    const sprites = candleH.map(h => candleSprite(h));
    const glowW = glowSprite('255,190,110', 128, 1.8), sparkle = sparkleSprite('255,230,180', 48);
    const candles = Array.from({ length: Math.round(9 + 7 * env.q) }, (_, i) => {
      const depth = i % 3; return { x: .06 + R() * .88, y: .05 + R() * .32 + depth * .03, depth, ph: R() * TAU, lit: 0, at: .2 + i * .12 + R() * .2, seed: R() * 50 };
    }).sort((a, b) => b.depth - a.depth);
    const motes = Array.from({ length: Math.round(60 * env.q + 20) }, () => ({ x: R(), y: R(), z: R(), p: R() * TAU }));
    const clouds = (() => { const c = canvas(240, 90), g = c.getContext('2d'), d = g.createImageData(240, 90); for (let y = 0; y < 90; y++) for (let x = 0; x < 240; x++) { const n = fbm(x / 45, y / 22, 4) * .5 + .5, e = Math.sin(Math.PI * y / 90); const i = (y * 240 + x) * 4; d.data[i] = 180; d.data[i + 1] = 190; d.data[i + 2] = 222; d.data[i + 3] = clamp((n - .52) * 3) * e * 150; } g.putImageData(d, 0, 0); return c; })();
    const stars = Array.from({ length: 40 }, () => ({ x: WINDOW.x0 + R() * (WINDOW.x1 - WINDOW.x0), y: WINDOW.y0 + R() * 220, p: R() * TAU, s: 1 + R() * 2 }));
    const moonGlow = glowSprite('215,225,255', 128, 1.5);

    // ---------------- layout ----------------
    let map = { s: 1, x: 0, y: 0 }, view = null, viewFor = null; const tmp = {};
    function layout() {
      const W = env.W, H = env.H; portrait = env.portrait; dpr = env.dpr;
      const img = portrait ? A.port : A.study;
      map = coverRect(img.width, img.height, W, H, .5, portrait ? .7 : .78);
      // 2.5D room: four depth planes; the window's sky lives on the farthest plane, behind its glass
      const dm = portrait ? A.dPort : A.dLand;
      if (viewFor !== dm) { viewFor = dm; view = new DepthView(dm, { amp: .028, focus: .72 }); }
      rs = env.res(false); light.width = Math.round(W * rs); light.height = Math.round(H * rs);
      pw = Math.round(portrait ? Math.min(W * .84, H * .42) : Math.min(W * .31, H * .47));
      ph = Math.round(pw * 1.36);
      el.style.setProperty('--pw', pw + 'px'); el.style.setProperty('--ph', ph + 'px'); el.style.setProperty('--sw', (pw / N) + 'px');
      [pageL, pageR].forEach(c => { c.width = Math.round(pw * dpr); c.height = Math.round(ph * dpr); });
      buildLeaf(); if (leafF >= 0) leafEl.style.display = ''; rebuild();
    }
    // ---------------- page rendering ----------------
    const inst = { L: null, R: null };
    function makePage(i, c) {
      if (i < 0 || i >= defs.length) return null;
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { i, c, g, side: defs[i].side, ...defs[i].build(g, pw, ph) };
    }
    function render(p, prog, time) {
      if (!p) return; const g = p.g; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.drawImage(paper(Math.round(pw), Math.round(ph), p.side, A.tex), 0, 0, pw, ph);
      g.textAlign = 'left'; p.draw(prog, time);
    }
    // Which page index each surface shows; layout() can rebuild everything from these at any moment.
    let idxL = -1, idxR = 1, leafF = -1, leafB = -1;
    function rebuild() {
      inst.L = idxL >= 0 ? makePage(idxL, pageL) : null;
      inst.R = makePage(idxR, pageR);
      render(inst.L, writeL, T); render(inst.R, writeR, T);
      if (leafF >= 0) sliceLeaf();
    }
    function sliceLeaf() {
      const a = canvas(pageR.width, pageR.height), b = canvas(pageR.width, pageR.height);
      render(makePage(leafF, a), 99, T); sliceInto(a, 'f');
      render(makePage(leafB, b), 0, T); sliceInto(b, 'b');
    }
    // ---------------- turning leaf ----------------
    let strips = [];
    function buildLeaf() {
      leafEl.innerHTML = ''; strips = [];
      let parent = leafEl;
      for (let i = 0; i < N; i++) {
        const s = document.createElement('div'); s.className = 'bk-strip' + (i === 0 ? ' first' : '');
        const f = canvas(pw / N * dpr + 1, ph * dpr), b = canvas(pw / N * dpr + 1, ph * dpr); f.className = 'f'; b.className = 'b';
        const sf = document.createElement('i'), sb = document.createElement('i'); sf.className = 'sf'; sb.className = 'sb';
        s.append(f, sf, b, sb); parent.appendChild(s); parent = s; strips.push({ s, f, b, sf, sb });
      }
      leafEl.style.display = 'none';
    }
    function sliceInto(src, which) {
      const sw = src.width / N;
      strips.forEach((st, i) => {
        const c = st[which], g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
        const sx = which === 'f' ? i * sw : src.width - (i + 1) * sw;
        g.drawImage(src, sx, 0, sw + 1, src.height, 0, 0, c.width, c.height);
      });
    }

    // ---------------- timeline state ----------------
    let T = 0, spread = -1, writeL = 0, writeR = 0, phase = 'intro', phaseAt = 0, turnP = 0, coverP = 0, rise = 0, dive = 0, focus = 0, focusTarget = 0;
    let hurry = false, ended = false, cardShown = false, frameN = 0;
    const OPEN_AT = 2.6;
    function startTurn() {
      if (phase !== 'hold' && phase !== 'write') return;
      if (spread >= SPREADS - 1) { phase = 'dive'; phaseAt = T; return; }
      leafF = idxR; leafB = (spread + 1) * 2; sliceLeaf();
      // the page underneath is the next right page, still unwritten
      idxR = (spread + 1) * 2 + 1; inst.R = makePage(idxR, pageR); writeR = 0; render(inst.R, 0, T);
      leafEl.style.display = ''; phase = 'turn'; phaseAt = T; turnP = 0;
      env.audio.sfx('page', .9); env.audio.sfx('whoosh', .35);
    }
    function finishTurn() {
      spread++; leafEl.style.display = 'none'; leafF = leafB = -1;
      idxL = spread * 2; inst.L = makePage(idxL, pageL); writeL = 0; render(inst.L, 0, T);
      phase = 'write'; phaseAt = T; hurry = false;
    }
    el.addEventListener('click', () => {
      if (phase === 'write') hurry = true;
      else if (phase === 'hold') startTurn();
    });

    const cues = env.cues([[2.2, 5.4, '书房里的蜡烛，一支一支，自己亮了起来。']]);
    layout();

    return {
      progress: () => clamp((spread + 1 + turnP) / (SPREADS + 1)),
      debug: () => ({ phase, spread, writeL, writeR, T, lDur: inst.L?.dur, rDur: inst.R?.dur }),
      resize() { layout(); },
      destroy() {},
      update(dt, t) {
        T = t; const W = env.W, H = env.H;
        if (!cardShown && t > .2) { cardShown = true; env.chapterCard('I', 1700); }
        if (t < 9) cues(t);
        // ---------- sky in the window (landscape painting only) ----------
        // ---------- 2.5D camera ----------
        const wd = wander(t, 4.1, .9);
        view.frame(map, { x: wd.x * .7 + env.look.x * .8, y: wd.y * .45 + env.look.y * .5 - .25 * (1 - rise), zoom: .035 * rise + .16 * dive, focus: .72 }, [W / 2, H * .55]);
        const T0 = view.T[0];
        if (!portrait) { // the sky behind the window glass, in the far plane's coordinates
          skyG.setTransform(rs * T0.s, 0, 0, rs * T0.s, rs * T0.x, rs * T0.y);
          const x0 = WINDOW.x0, y0 = WINDOW.y0, ww = WINDOW.x1 - WINDOW.x0, wh = WINDOW.y1 - WINDOW.y0;
          const gr = skyG.createLinearGradient(0, y0, 0, y0 + wh); gr.addColorStop(0, '#0b1430'); gr.addColorStop(.6, '#1d2c58'); gr.addColorStop(1, '#3a4672');
          skyG.fillStyle = gr; skyG.fillRect(x0, y0, ww, wh);
          skyG.fillStyle = '#eef2ff';
          stars.forEach(s => { skyG.globalAlpha = .4 + .6 * (.5 + .5 * Math.sin(s.p + t * s.s)); skyG.fillRect(s.x, s.y, 1.4, 1.4); });
          const [mx, my] = WINDOW.moon, X = mx, Y = my, r = 26;
          skyG.globalAlpha = .9; skyG.drawImage(moonGlow, X - r * 5, Y - r * 5, r * 10, r * 10);
          skyG.globalAlpha = 1; skyG.fillStyle = '#f4f1e4'; skyG.beginPath(); skyG.arc(X, Y, r, 0, TAU); skyG.fill();
          skyG.fillStyle = 'rgba(180,170,150,.25)'; [[-.3, -.2, .25], [.25, .1, .18], [-.05, .35, .15]].forEach(([a, b, c]) => { skyG.beginPath(); skyG.arc(X + a * r, Y + b * r, c * r, 0, TAU); skyG.fill(); });
          const cw = ww * 1.4, drift = (t * 8) % cw; skyG.globalAlpha = .55;
          skyG.drawImage(clouds, x0 - drift, y0 + wh * .12, cw, cw * .37); skyG.drawImage(clouds, x0 - drift + cw, y0 + wh * .12, cw, cw * .37);
          skyG.globalAlpha = 1;
        }
        // ---------- floating candles, warm light, dust ----------
        lg.setTransform(rs, 0, 0, rs, 0, 0); lg.globalAlpha = 1; view.draw(lg);
        let warm = 0;
        candles.forEach(c => {
          if (!c.lit && t > c.at) { c.lit = .001; const x = c.x * W, y = c.y * H; fx.burst(x, y, { n: 14, speed: 60, life: 1.1, size: 1.4 }); if (Math.random() < .5) env.audio.sfx('light', .25); }
          if (c.lit) c.lit = Math.min(1, c.lit + dt * 2.4);
          const sc = (1 - c.depth * .28) * Math.min(1.1, Math.max(.6, Math.min(W, H) / 800));
          const pm = view.at([.95, .62, .38][c.depth], tmp), k = pm.s / map.s;
          const x = pm.x + (c.x * W - map.x) * k, y = pm.y + (c.y * H + Math.sin(t * .6 + c.ph) * 8 * sc - map.y) * k, spr = sprites[c.depth];
          lg.globalAlpha = .55 + .45 * (1 - c.depth * .3);
          lg.drawImage(spr, x - spr.width * sc / 2, y, spr.width * sc, spr.height * sc);
          if (c.lit) {
            const fl = .85 + Math.sin(t * 11 + c.seed) * .08 + Math.sin(t * 5.7 + c.seed) * .07;
            lg.globalAlpha = c.lit * .55 * fl; lg.globalCompositeOperation = 'lighter';
            const gs = 150 * sc; lg.drawImage(glowW, x - gs, y - gs * 1.05, gs * 2, gs * 2);
            lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = c.lit;
            flame(lg, x, y + 3 * sc, 24 * sc, t, c.seed);
            warm += c.lit / candles.length;
          }
        });
        lg.globalAlpha = 1; lg.globalCompositeOperation = 'lighter';
        motes.forEach(m => {
          const x = ((m.x + t * .006 * (m.z + .3)) % 1) * W, y = ((m.y + Math.sin(t * .2 + m.p) * .02 - t * .004 * m.z) % 1 + 1) % 1 * H;
          lg.globalAlpha = (.25 + .5 * m.z) * (.5 + .5 * Math.sin(t * 1.3 + m.p)); lg.fillStyle = '#ffdca0'; lg.fillRect(x, y, 1 + m.z * 1.4, 1 + m.z * 1.4);
        });
        lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;
        // warm candle wash and the book's own glow are painted here rather than as extra full-screen layers
        const wv = warm * (.75 + Math.sin(t * 9) * .05 + Math.sin(t * 4.1) * .06);
        if (wv > .01) { lg.globalCompositeOperation = 'lighter'; lg.globalAlpha = wv * .22; lg.drawImage(glowW, W * .1, -H * .35, W * .8, H * 1.2); }
        const av = .35 + rise * .45 + Math.sin(t * 1.7) * .1 * rise;
        if (av > .02) { lg.globalCompositeOperation = 'lighter'; lg.globalAlpha = av * .55; const aw = pw * 3.4 * camS, ah = ph * 2.1 * camS; lg.drawImage(auraS, W / 2 + camX - aw / 2, H / 2 + camY - ah / 2, aw, ah); }
        lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;

        // ---------- choreography ----------
        if (phase === 'intro') {
          rise = easeInOut(between(t, .7, 2.9));
          if (t > OPEN_AT) { phase = 'cover'; phaseAt = t; env.audio.sfx('whoosh', .5); idxL = 0; inst.L = makePage(0, pageL); render(inst.L, 0, t); }
        }
        if (phase === 'cover') {
          coverP = easeInOut(clamp((t - phaseAt) / 1.3));
          if (coverP >= 1) { spread = 0; coverEl.style.display = 'none'; idxL = 0; inst.L = makePage(0, pageL); writeL = 0; writeR = 0; render(inst.L, 0, t); phase = 'write'; phaseAt = t; }
        }
        if (phase === 'write' || phase === 'hold') {
          const L = inst.L, Rp = inst.R, spd = hurry ? 6 : 1;
          const lDur = L?.dur || 0, rDur = Rp?.dur || 0;
          if (writeL < lDur + .01) { writeL += dt * spd; render(L, writeL, t); }
          else if (writeR < rDur + .01) { writeR += dt * spd; render(Rp, writeR, t); }
          else if ((frameN++ % (env.q < 1 ? 6 : 3)) === 0) { render(L, writeL, t); render(Rp, writeR, t); } // gold ink shimmer
          // the camera follows the pen on narrow screens
          focusTarget = portrait ? (writeL < lDur ? 1 : -1) : 0;
          if (Rp?.map) focusTarget = portrait ? -1 : -.35;
          if (phase === 'write' && writeL >= lDur && writeR >= rDur) { phase = 'hold'; phaseAt = t; }
          if (phase === 'hold' && t - phaseAt > (spread === SPREADS - 1 ? .6 : 1.05)) startTurn();
        }
        if (phase === 'turn') {
          turnP = clamp((t - phaseAt) / 1.12);
          focusTarget = 0;
          const e = easeInOut(turnP), root = -180 * e, curl = 115 * Math.sin(Math.PI * turnP) * (-(1 - turnP) + turnP * .55);
          let acc = root;
          strips.forEach((st, i) => {
            const w = Math.pow((i + 1) / N, 1.7) - Math.pow(i / N, 1.7), ang = (i === 0 ? root : 0) + curl * w;
            acc += i === 0 ? curl * w : curl * w;
            st.s.style.transform = `rotateY(${ang.toFixed(2)}deg)`;
            const a = (acc - (i === 0 ? 0 : 0)) * Math.PI / 180, lit = Math.abs(Math.sin(a));
            st.sf.style.opacity = (lit * .5).toFixed(3); st.sb.style.opacity = (lit * .45).toFixed(3);
          });
          shadowR.style.opacity = (Math.sin(Math.PI * Math.min(1, turnP * 1.6)) * .55).toFixed(3);
          shadowL.style.opacity = (between(turnP, .45, .95) * (1 - between(turnP, .95, 1)) * .5).toFixed(3);
          if (turnP > .08 && turnP < .92 && Math.random() < env.q) {
            const r = strips[N - 1].s.getBoundingClientRect(); fx.trail(r.left + r.width / 2, r.top + R() * r.height, { life: 1.3, size: 1.6, vy: -25, spread: 4 });
          }
          if (turnP >= 1) { shadowR.style.opacity = 0; shadowL.style.opacity = 0; finishTurn(); }
        }
        if (phase === 'dive') {
          dive = easeIn(clamp((t - phaseAt) / 1.8));
          if (!ended && dive > .55) { ended = true; env.next({ transition: 'amber' }); }
        }
        focus = lerp(focus, focusTarget, 1 - Math.exp(-dt * 2.2));

        // ---------- book transform ----------
        const bob = Math.sin(t * .9) * 6 * rise, sway = Math.sin(t * .5) * 1.2 * rise;
        const tableY = portrait ? H * .3 : H * .27;
        const ty = lerp(tableY, portrait ? -H * .02 : -H * .015, rise) + bob;
        const rx = lerp(64, 15, rise), sc = lerp(.52, 1, rise);
        const closedShift = -pw / 2 * (1 - coverP);
        const bp = view.at(1.12, tmp), bk = bp.s / map.s;
        let x = closedShift + focus * pw / 2 + (bp.x + (W / 2 - map.x) * bk - W / 2), s = sc, y = ty + (bp.y + (H / 2 - map.y) * bk - H / 2);
        if (dive > 0) { s = sc * (1 + dive * 5); x = lerp(x, -pw * .45 * (1 + dive * 5), dive); y = lerp(ty, ty + ph * .05 * dive * 5, dive); }
        floatEl.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotateX(${(rx - dive * 12).toFixed(2)}deg) rotateZ(${sway.toFixed(2)}deg) scale(${s.toFixed(4)})`;
        coverEl.style.transform = `rotateY(${(-180 * coverP).toFixed(2)}deg) translateZ(2px)`;
        bookEl.classList.toggle('is-open', coverP > .5);
        camX = x; camY = y; camS = s;
        if (rise > 0 && rise < 1 && Math.random() < .5) fx.trail(W / 2 + (R() - .5) * pw * 1.2, H / 2 + ty + ph * .3, { vy: -40, life: 1.4 });
      },
    };
  },
};
