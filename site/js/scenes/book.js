// Chapter I: a warm, cozy study. The lamps and the fire come up, the book rises from the desk,
// opens, writes in its own ink and turns its pages on a magical breeze.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, easeOut, easeIn, smooth, rng, glowSprite, sparkleSprite, coverRect, TAU, fbm, wait } from '../util.js';
import { buildPages, paper } from './pages.js';
import { loadDepth, DepthView, wander } from '../depth.js';
import { studyLights, studySteam } from './study-glow.js';
import { loadClip, play, stop, drawable } from '../video.js';
import { Hearth, drawFire, FIRE } from '../hearth.js';

const A = {};

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
  id: 'book', music: 'book', bed: 'fire',
  async load(env) {
    // the filmed room (tools/video/): the fire and lamplight alive, the camera breathing slowly in and out
    if (!env.reduced && A.room === undefined) A.room = await loadClip(env.portrait ? 'studyp' : 'study');
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
    // one canvas holds the window sky, the depth planes of the room and its warm light (fewest layers to composite)
    const light = $('.bk-room'), lg = light.getContext('2d', { alpha: false });
    const floatEl = $('.bk-float'), bookEl = $('.bk-book'), leafEl = $('.bk-leaf'), coverEl = $('.bk-cover');
    const hearth = new Hearth(el);   // warm firelight breathing over the room and the book (on top, screen blend)
    const auraS = glowSprite('255,206,130', 128, 1.6); let camX = 0, camY = 0, camS = .5;
    const pageL = $('.bk-page.l canvas'), pageR = $('.bk-page.r canvas'), shadowL = $('.bk-page.l .bk-shadow'), shadowR = $('.bk-page.r .bk-shadow');
    bookEl.querySelector('.bk-cover-front').style.backgroundImage = `url(${A.cover.src})`;
    bookEl.querySelector('.bk-cover-inside').style.backgroundImage = `url(${marbled()})`;

    const defs = buildPages(A);
    const SPREADS = defs.length / 2;
    let win = { x: 0, y: 0, w: 1, h: 1 }, rs = 1, pw = 300, ph = 400, dpr = env.dpr, N = env.q < 1 || env.portrait ? 10 : 18;
    // phones: a single-page book. The spine sits just left of the screen, one page faces her at a time, the cover and each
    // turned leaf swing away past the spine and fade, and nothing slides sideways.
    const single = env.portrait; el.classList.toggle('bk-single', single);
    let portrait = env.portrait, cover = null;
    const R = rng(5);
    const room = A.room && !A.room.failed ? A.room : null;
    if (room) { room.v.loop = true; room.portrait = env.portrait; play(room, .5); } // a 5 s in-and-out loop, played slow

    // ---------------- warm light: soft bokeh drifting in the lamplight, a hearth glow that breathes ----------------
    const glowW = glowSprite('255,190,110', 128, 1.8), sparkle = sparkleSprite('255,230,180', 48), bokehS = glowSprite('255,214,150', 64, 1.25);
    const bokeh = Array.from({ length: Math.round(10 + 8 * env.q) }, () => ({ x: R(), y: .08 + R() * .6, r: .018 + R() * .035, p: R() * TAU, v: .004 + R() * .008, a: .1 + R() * .16 }));
    const motes = Array.from({ length: Math.round(60 * env.q + 20) }, () => ({ x: R(), y: R(), z: R(), p: R() * TAU }));

    // ---------------- layout ----------------
    let map = { s: 1, x: 0, y: 0 }, view = null, viewFor = null; const tmp = {};
    function layout() {
      const W = env.W, H = env.H; portrait = env.portrait; dpr = env.dpr;
      const img = portrait ? A.port : A.study;
      map = coverRect(img.width, img.height, W, H, .5, portrait ? .7 : .78);
      // 2.5D room: four depth planes; the window's sky lives on the farthest plane, behind its glass
      const dm = portrait ? A.dPort : A.dLand;
      if (viewFor !== dm) { viewFor = dm; view = new DepthView(dm, { amp: .045, focus: .72 }); }
      rs = env.res(false); light.width = Math.round(W * rs); light.height = Math.round(H * rs);
      pw = Math.round(single ? Math.min(W * .76, H * .42) : Math.min(W * .31, H * .47));
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
      return { i, c, g, side: single ? 'right' : defs[i].side, ...defs[i].build(g, pw, ph) };
    }
    function render(p, prog, time) {
      if (!p) return; const g = p.g; g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.drawImage(paper(Math.round(pw), Math.round(ph), p.side, A.tex), 0, 0, pw, ph);
      g.textAlign = 'left'; p.draw(prog, time);
    }
    // Which page index each surface shows; layout() can rebuild everything from these at any moment.
    let idxL = -1, idxR = single ? 0 : 1, leafF = -1, leafB = -1, cur = 0;
    const isLast = () => single ? cur >= defs.length - 1 : spread >= SPREADS - 1;
    function rebuild() {
      inst.L = idxL >= 0 ? makePage(idxL, pageL) : null;
      inst.R = makePage(idxR, pageR);
      render(inst.L, writeL, T); render(inst.R, writeR, T);
      if (leafF >= 0) sliceLeaf();
    }
    function sliceLeaf() {
      const a = canvas(pageR.width, pageR.height), b = canvas(pageR.width, pageR.height);
      render(makePage(leafF, a), 99, T); sliceInto(a, 'f');
      if (leafB >= 0) render(makePage(leafB, b), 0, T);
      else { const g = b.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(paper(Math.round(pw), Math.round(ph), 'left', A.tex), 0, 0, b.width, b.height); } // the back of a leaf: plain paper
      sliceInto(b, 'b');
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
    const OPEN_AT = 4.4;
    // she turns the pages herself: drag a page (or the cover) leftward, or tap; a long pause turns it for her
    const IDLE_TURN = 3.4, IDLE_OPEN = 3.5, IDLE_DIVE = 4.5; // left alone, the book turns its own pages (reading time comes while the ink writes)
    let manual = false, turnTarget = 1, dragX = 0, dragP = 0, downAt = 0, waitAt = 0, turnsDone = 0;
    const hintEl = document.createElement('p'); hintEl.className = 'bk-hint'; el.appendChild(hintEl);
    const hint = text => { if (text) hintEl.textContent = text; hintEl.classList.toggle('on', !!text); };
    function startTurn(byHand) {
      if (phase !== 'hold' && phase !== 'write') return;
      hint(null);
      if (isLast()) { phase = 'dive'; phaseAt = T; env.audio.sfx('whoosh', .6); return; }
      manual = !!byHand; turnTarget = 1;
      if (single) { leafF = cur; leafB = -2; sliceLeaf(); idxR = ++cur; }
      else { leafF = idxR; leafB = (spread + 1) * 2; sliceLeaf(); idxR = (spread + 1) * 2 + 1; }
      // the page underneath is the next page, still unwritten
      inst.R = makePage(idxR, pageR); writeR = 0; render(inst.R, 0, T);
      leafEl.style.display = ''; phase = 'turn'; phaseAt = T; turnP = 0;
      env.audio.sfx('page', .9); env.audio.sfx('whoosh', .35);
    }
    function finishTurn() {
      turnsDone++; leafEl.style.display = 'none'; leafF = leafB = -1; leafEl.style.opacity = '';
      if (single) { phase = 'write'; phaseAt = T; hurry = false; return; }
      spread++;
      idxL = spread * 2; inst.L = makePage(idxL, pageL); writeL = 0; render(inst.L, 0, T);
      phase = 'write'; phaseAt = T; hurry = false;
    }
    /** A turn let go too early falls back: the leaf lies down again on the right. */
    function cancelTurn() {
      leafEl.style.display = 'none'; leafEl.style.opacity = ''; if (single) cur = leafF; idxR = leafF; leafF = leafB = -1;
      inst.R = makePage(idxR, pageR); writeR = inst.R?.dur || 0; render(inst.R, writeR, T);
      phase = 'hold'; phaseAt = T; waitAt = T;
    }
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('#hud,#menu,#btn-next')) return;
      dragX = e.clientX; downAt = T; dragP = 0;
      if (phase === 'hold' && !isLast() && (single || e.clientX > env.W * .35)) startTurn(true);
      else if (phase === 'cover-wait') { phase = 'cover'; phaseAt = T; manual = true; coverP = 0; hint(null); env.audio.sfx('whoosh', .5); }
    });
    addEventListener('pointermove', e => {
      if (!manual) return;
      dragP = clamp((dragX - e.clientX) / (pw * 1.3));
      if (phase === 'turn') turnP = dragP; else if (phase === 'cover') coverP = dragP;
    }, { passive: true });
    const release = e => {
      if (!manual) return; manual = false;
      const tap = T - downAt < .3 && Math.abs((e?.clientX ?? dragX) - dragX) < 12;
      // a tap, a flick or a drag past a third of the way completes it; otherwise it falls back
      turnTarget = tap || dragP > .32 || (dragP > .08 && T - downAt < .35) ? 1 : 0;
    };
    addEventListener('pointerup', release); addEventListener('pointercancel', release);
    el.addEventListener('click', () => {
      if (phase === 'write') hurry = true;
      else if (phase === 'hold' && isLast()) startTurn();
    });

    let glintAt = 0;
    function cornerGlow(t) {
      if (t - glintAt < .09 || !pageR.isConnected) return; glintAt = t;
      const r = pageR.getBoundingClientRect(), k = (t * .7) % 1;
      fx.trail(r.right - 6 - k * r.width * .06, r.bottom - 6 - (1 - k) * r.height * .1, { life: 1.1, size: 1.3, vy: -12, spread: 3 });
    }
    function coverGlow(t) {
      if (t - glintAt < .07) return; glintAt = t;
      const r = coverEl.getBoundingClientRect(), k = (t * .35) % 1;
      fx.trail(r.right - 4, r.top + k * r.height, { life: 1.2, size: 1.4, vy: -10, spread: 3 });
    }
    const cues = env.cues([[2.2, 5.4, '书房里的灯，一盏一盏，暖暖地亮了起来。']]);
    layout();

    return {
      progress: () => single ? clamp((cur + 1 + turnP) / (defs.length + 1)) : clamp((spread + 1 + turnP) / (SPREADS + 1)),
      debug: () => ({ phase, spread, writeL, writeR, T, lDur: inst.L?.dur, rDur: inst.R?.dur }),
      resize() { layout(); },
      destroy() { removeEventListener('pointerup', release); removeEventListener('pointercancel', release); stop(room); hearth.remove(); },
      update(dt, t) {
        T = t; const W = env.W, H = env.H;
        if (!cardShown && t > .2) { cardShown = true; env.chapterCard('I', 1700); }
        if (t < 9) cues(t);
        // ---------- 2.5D camera ----------
        const wd = wander(t, 4.1, .9);
        view.frame(map, { x: wd.x * .7 + env.look.x * .8, y: wd.y * .45 + env.look.y * .5 - .25 * (1 - rise), zoom: .035 * rise + .06 * between(t, 1, 45) + .16 * dive, focus: .72 }, [W / 2, H * .55]);
        // ---------- the room, its warm light, dust ----------
        lg.setTransform(rs, 0, 0, rs, 0, 0); lg.globalAlpha = 1;
        const filmed = room && drawable(room) && (room.portrait === portrait);
        if (filmed) { // the clip spans the painting's frame, moved by the camera as its middle depth would be
          const pm = view.at(.55, tmp), img = portrait ? A.port : A.study;
          lg.drawImage(room.v, pm.x, pm.y, img.width * pm.s, img.height * pm.s);
        } else view.draw(lg);
        // the lamps and the fire come up as the book wakes, then breathe gently
        const warm = between(t, .2, 2.4) * (.9 + Math.sin(t * 2.3) * .04 + Math.sin(t * 5.1) * .03 + Math.sin(t * 9.7) * .02);
        { const pm = view.at(.4, tmp); lg.setTransform(rs * pm.s, 0, 0, rs * pm.s, rs * pm.x, rs * pm.y); studyLights(lg, portrait ? 'study-port' : 'study-land', t, warm * (filmed ? 0 : 1)); } // the 3D film has its own lights
        { // the hearth: living flame over the filmed fire, and its light breathing over the room
          const F = FIRE[portrait ? 'study-port' : 'study-land'], img = portrait ? A.port : A.study, pm = view.at(.55, tmp);
          const hx = pm.x + F.x * img.width * pm.s, hy = pm.y + F.y * img.height * pm.s, hw = F.w * img.width * pm.s;
          lg.setTransform(rs, 0, 0, rs, 0, 0); drawFire(lg, hx, hy, hw, t, warm); hearth.update(t, hx, hy, hw, warm);
        }
        { const pm = view.at(.75, tmp); lg.setTransform(rs * pm.s, 0, 0, rs * pm.s, rs * pm.x, rs * pm.y); if (!filmed) studySteam(lg, portrait ? 'study-port' : 'study-land', t, warm * (1 - rise * .6)); lg.setTransform(rs, 0, 0, rs, 0, 0); } // the film has its own steam
        lg.globalCompositeOperation = 'lighter';
        bokeh.forEach(b => {
          const pm = view.at(.9, tmp), k = pm.s / map.s, x = pm.x + (((b.x + t * b.v) % 1.1 - .05) * W - map.x) * k, y = pm.y + ((b.y + Math.sin(t * .4 + b.p) * .02) * H - map.y) * k, r = b.r * Math.min(W, H) * 1.6;
          lg.globalAlpha = b.a * warm * (.6 + .4 * Math.sin(t * .7 + b.p)); lg.drawImage(bokehS, x - r, y - r, r * 2, r * 2);
        });
        lg.globalCompositeOperation = 'source-over';
        lg.globalAlpha = 1; lg.globalCompositeOperation = 'lighter';
        motes.forEach(m => {
          const x = ((m.x + t * .006 * (m.z + .3)) % 1) * W, y = ((m.y + Math.sin(t * .2 + m.p) * .02 - t * .004 * m.z) % 1 + 1) % 1 * H;
          lg.globalAlpha = (.25 + .5 * m.z) * (.5 + .5 * Math.sin(t * 1.3 + m.p)); lg.fillStyle = '#ffdca0'; lg.fillRect(x, y, 1 + m.z * 1.4, 1 + m.z * 1.4);
        });
        lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;
        // warm lamplight wash and the book's own glow are painted here rather than as extra full-screen layers
        const wv = warm * (.75 + Math.sin(t * 9) * .05 + Math.sin(t * 4.1) * .06);
        if (wv > .01) { lg.globalCompositeOperation = 'lighter'; lg.globalAlpha = wv * .22; lg.drawImage(glowW, W * .1, -H * .35, W * .8, H * 1.2); }
        const av = .35 + rise * .45 + Math.sin(t * 1.7) * .1 * rise;
        if (av > .02) { lg.globalCompositeOperation = 'lighter'; lg.globalAlpha = av * .55; const aw = pw * 3.4 * camS, ah = ph * 2.1 * camS; lg.drawImage(auraS, W / 2 + camX - aw / 2, H / 2 + camY - ah / 2, aw, ah); }
        lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;

        // ---------- choreography ----------
        if (phase === 'intro') {
          rise = easeInOut(between(t, 2.4, 4.6)); // after the chapter's title has cleared
          if (t > OPEN_AT) { phase = 'cover-wait'; phaseAt = t; if (single) { idxR = 0; inst.R = makePage(0, pageR); render(inst.R, 0, t); } else { idxL = 0; inst.L = makePage(0, pageL); render(inst.L, 0, t); } }
        }
        if (phase === 'cover-wait') {
          if (t - phaseAt > 1.2) hint('轻触封面，或向左拨开，翻开这本书');
          coverGlow(t);
          if (t - phaseAt > IDLE_OPEN) { phase = 'cover'; phaseAt = t; manual = false; turnTarget = 1; hint(null); env.audio.sfx('whoosh', .5); }
        }
        if (phase === 'cover') {
          if (!manual) coverP = clamp(coverP + (turnTarget ? 1 : -1) * dt / 1.3);
          if (coverP <= 0 && !manual && !turnTarget) { phase = 'cover-wait'; phaseAt = t - 1.2; turnTarget = 1; }
          if (coverP >= 1) { spread = 0; coverEl.style.display = 'none'; writeL = 0; writeR = 0; if (single) { cur = 0; idxR = 0; inst.R = inst.R || makePage(0, pageR); } else { idxL = 0; inst.L = makePage(0, pageL); render(inst.L, 0, t); } phase = 'write'; phaseAt = t; }
        }
        if (phase === 'write' || phase === 'hold') {
          const L = inst.L, Rp = inst.R, spd = hurry ? 6 : 1.5;
          const lDur = L?.dur || 0, rDur = Rp?.dur || 0;
          if (writeL < lDur + .01) { writeL += dt * spd; render(L, writeL, t); }
          else if (writeR < rDur + .01) { writeR += dt * spd; render(Rp, writeR, t); }
          else if ((frameN++ % (env.q < 1 ? 6 : 3)) === 0) { render(L, writeL, t); render(Rp, writeR, t); } // gold ink shimmer
          // the camera follows the pen on narrow screens
          focusTarget = single ? 0 : portrait ? (writeL < lDur ? 1 : -1) : 0;
          if (Rp?.map && !single) focusTarget = portrait ? -1 : -.35;
          if (phase === 'write' && writeL >= lDur && writeR >= rDur) { phase = 'hold'; phaseAt = t; waitAt = t; }
          if (phase === 'hold') {
            const last = isLast(), wait = t - waitAt;
            if (wait > 1.4) hint(last ? '轻触书页，走进故事里' : turnsDone ? null : '向左拨动书页，翻到下一页');
            if (!last) cornerGlow(t);
            if (wait > (last ? IDLE_DIVE : IDLE_TURN)) startTurn();
          }
        }
        if (phase === 'turn') {
          if (!manual) turnP = clamp(turnP + (turnTarget ? 1 : -1) * dt / 1.05);
          if (turnP <= 0 && !manual && !turnTarget) { cancelTurn(); }
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
          if (single) leafEl.style.opacity = (1 - between(turnP, .58, .9)).toFixed(3);   // past the spine, the leaf slips out of view
          if (turnP >= 1) { shadowR.style.opacity = 0; shadowL.style.opacity = 0; finishTurn(); }
        }
        if (phase === 'dive') {
          dive = easeIn(clamp((t - phaseAt) / 1.8));
          if (!ended && dive > .55) { ended = true; env.next({ transition: 'bloom', at: [env.W / 2, env.H / 2] }); }
        }
        focus = lerp(focus, focusTarget, 1 - Math.exp(-dt * 2.2));

        // ---------- book transform ----------
        const bob = Math.sin(t * .9) * 6 * rise, sway = Math.sin(t * .5) * 1.2 * rise;
        const tableY = portrait ? H * .3 : H * .27;
        const ty = lerp(tableY, portrait ? -H * .02 : -H * .015, rise) + bob;
        const rx = lerp(64, 15, rise), sc = lerp(.52, 1, rise);
        const closedShift = single ? -pw / 2 : -pw / 2 * (1 - easeInOut(coverP));
        const bp = view.at(1.12, tmp), bk = bp.s / map.s;
        let x = closedShift + focus * pw / 2 + (bp.x + (W / 2 - map.x) * bk - W / 2), s = sc, y = ty + (bp.y + (H / 2 - map.y) * bk - H / 2);
        if (dive > 0) { s = sc * (1 + dive * 5); x = lerp(x, -pw * .45 * (1 + dive * 5), dive); y = lerp(ty, ty + ph * .05 * dive * 5, dive); }
        floatEl.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) rotateX(${(rx - dive * 12).toFixed(2)}deg) rotateZ(${sway.toFixed(2)}deg) scale(${s.toFixed(4)})`;
        coverEl.style.transform = `rotateY(${(-180 * easeInOut(coverP)).toFixed(2)}deg) translateZ(2px)`;
        if (single) coverEl.style.opacity = (1 - between(coverP, .5, .82)).toFixed(3);
        bookEl.classList.toggle('is-open', coverP > .5);
        camX = x; camY = y; camS = s;
        if (rise > 0 && rise < 1 && Math.random() < .5) fx.trail(W / 2 + (R() - .5) * pw * 1.2, H / 2 + ty + ph * .3, { vy: -40, life: 1.4 });
      },
    };
  },
};
