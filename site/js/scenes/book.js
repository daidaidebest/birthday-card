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
          <div class="bk-page l"><canvas></canvas><i class="bk-fl"></i><i class="bk-shadow"></i></div>
          <div class="bk-page r"><canvas></canvas><i class="bk-fl"></i><i class="bk-shadow"></i><i class="bk-curl"></i></div>
          <div class="bk-leaf"></div>
          <div class="bk-cover"><div class="bk-cover-front"><b>师宝宝</b><small>一本只认识你的书</small></div><div class="bk-cover-inside"></div></div>
        </div>
      </div></div>`;
    const $ = s => el.querySelector(s);
    // one canvas holds the window sky, the depth planes of the room and its warm light (fewest layers to composite)
    const light = $('.bk-room'), lg = light.getContext('2d', { alpha: false });
    const camEl = $('.bk-cam'), floatEl = $('.bk-float'), bookEl = $('.bk-book'), leafEl = $('.bk-leaf'), coverEl = $('.bk-cover'), curlEl = $('.bk-curl');
    const hearth = new Hearth(el);   // warm firelight breathing over the room and the book (on top, screen blend)
    const auraS = glowSprite('255,206,130', 128, 1.6); let camX = env.W / 2, camY = env.H / 2, camS = .5;
    const pageL = $('.bk-page.l canvas'), pageR = $('.bk-page.r canvas'), shadowL = $('.bk-page.l .bk-shadow'), shadowR = $('.bk-page.r .bk-shadow'), fireL = [...el.querySelectorAll('.bk-fl')];
    bookEl.querySelector('.bk-cover-front').style.backgroundImage = `url(${A.cover.src})`;
    bookEl.querySelector('.bk-cover-inside').style.backgroundImage = `url(${marbled()})`;

    const defs = buildPages(A);
    const SPREADS = defs.length / 2;
    // the pages are drawn at the screen's real pixel density (env.textDpr), not the scene's performance cap: ink stays sharp
    let win = { x: 0, y: 0, w: 1, h: 1 }, rs = 1, pw = 300, ph = 400, dpr = env.textDpr(), N = env.q < 1 ? 10 : env.portrait ? 14 : 18;
    // phones: one page faces her at a time. It is still a whole book: the camera frames the right-hand page for reading,
    // with the spine and a sliver of the left page at the edge, and eases back a little while a leaf turns over.
    // Turning the phone over switches between the two (setMode, from layout()).
    let single = env.portrait; el.classList.toggle('bk-single', single);
    let portrait = env.portrait;
    const R = rng(5);
    let room = A.room && !A.room.failed ? A.room : null;
    if (room) { room.v.loop = true; room.portrait = env.portrait; play(room, .5); } // a 5 s in-and-out loop, played slow

    // ---------------- warm light: soft bokeh far back in the lamplight, a little dust in the air ----------------
    const glowW = glowSprite('255,190,110', 128, 1.8), bokehS = glowSprite('255,214,150', 64, 1.25), dustS = glowSprite('255,226,180', 32, 2.2);
    const bokeh = Array.from({ length: Math.round(8 + 6 * env.q) }, () => ({ x: R(), y: .08 + R() * .6, r: .018 + R() * .035, p: R() * TAU, v: .002 + R() * .004, a: .08 + R() * .12 }));
    const motes = Array.from({ length: Math.round(16 * env.q + 8) }, () => ({ x: R(), y: R(), z: R(), p: R() * TAU, s: .4 + R() * .8 }));

    // ---------------- layout ----------------
    // The pages are laid out at their reading size (so the writing is drawn sharp at the size she reads it); before she
    // opens the book the camera holds it smaller, with the room around it.
    let map = { s: 1, x: 0, y: 0 }, view = null, viewFor = null; const tmp = {};
    let zClosed = .86, zOpen = .6, sxRead = .5, midY = 0;
    function layout() {
      const W = env.W, H = env.H; portrait = env.portrait; dpr = env.textDpr(); N = env.q < 1 ? 10 : portrait ? 14 : 18;
      if (portrait !== single) setMode(portrait);
      if (room && room.portrait !== portrait) {   // turned: the filmed room for this orientation takes over once it can play
        const want = portrait;
        loadClip(portrait ? 'studyp' : 'study').then(c => { if (c.failed || env.portrait !== want) return; c.v.loop = true; c.portrait = want; play(c, .5); if (room !== c) stop(room); room = A.room = c; });
      }
      // the book lives in the frame that is left once the notch, the home bar and the dock's band are taken out
      const sf = env.safe(), availH = Math.max(H * .5, sf.h - 16);
      midY = (sf.t + sf.h / 2) - H / 2;
      const img = portrait ? A.port : A.study;
      map = coverRect(img.width, img.height, W, H, .5, portrait ? .7 : .78);
      // 2.5D room: four depth planes; the window's sky lives on the farthest plane, behind its glass
      const dm = portrait ? A.dPort : A.dLand;
      if (viewFor !== dm) { viewFor = dm; view = new DepthView(dm, { amp: .045, focus: .72 }); }
      rs = env.res(false); light.width = Math.round(W * rs); light.height = Math.round(H * rs);
      if (single) { // reading: the page spans ~88% of the screen's width
        pw = Math.round(Math.min(W * .86, H * .48, availH * .95 / 1.36)); zClosed = Math.min(W * .76, H * .42) / pw;
        zOpen = Math.min(1, W * .96 / (pw * 2.09)); sxRead = (W - pw) / 2 / W + .012;
      } else {
        pw = Math.round(Math.min(W * .33, H * .54, availH * .96 / 1.36)); zClosed = zOpen = Math.min(W * .31, H * .47) / pw; sxRead = .5;
      }
      ph = Math.round(pw * 1.36);
      camEl.style.perspective = Math.round(Math.hypot(W, H) * 1.25) + 'px';   // a lens, not a telephoto: the leaf reads in depth
      el.style.setProperty('--pw', pw + 'px'); el.style.setProperty('--ph', ph + 'px'); el.style.setProperty('--sw', (pw / N) + 'px'); el.style.setProperty('--seam', SEAM + 'px');
      [pageL, pageR].forEach(c => { c.width = Math.round(pw * dpr); c.height = Math.round(ph * dpr); });
      buildLeaf(); if (leafF >= 0) leafEl.style.display = ''; rebuild();
      cam.init = false;
    }
    // ---------------- page rendering ----------------
    const inst = { L: null, R: null };
    function makePage(i, c) {
      if (i < 0 || i >= defs.length) return null;
      const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { i, c, g, side: single ? 'right' : defs[i].side, ...defs[i].build(g, pw, ph) };
    }
    function render(p, prog, time) {
      if (!p) return; const g = p.g; g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(paper(p.c.width, p.c.height, p.side, A.tex, undefined, dpr), 0, 0);   // the paper's grain at full resolution too
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.textAlign = 'left'; p.draw(prog, time);
    }
    /** The back of a turned leaf, lying on the left (phones: the left page only ever shows the backs of turned leaves). */
    function blankLeft() { const g = pageL.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(paper(pageL.width, pageL.height, 'left', A.tex, undefined, dpr), 0, 0); }
    // Which page index each surface shows; layout() can rebuild everything from these at any moment.
    let idxL = -1, idxR = single ? 0 : 1, leafF = -1, leafB = -1, cur = 0, leftBlank = false;
    const isLast = () => single ? cur >= defs.length - 1 : spread >= SPREADS - 1;
    function rebuild() {
      inst.L = idxL >= 0 ? makePage(idxL, pageL) : null;
      inst.R = makePage(idxR, pageR);
      render(inst.L, writeL, T); render(inst.R, writeR, T);
      if (single && leftBlank) blankLeft();
      if (leafF >= 0) sliceLeaf();
    }
    function sliceLeaf() {
      const a = canvas(pageR.width, pageR.height), b = canvas(pageR.width, pageR.height);
      render(makePage(leafF, a), 99, T); sliceInto(a, 'f');
      if (leafB >= 0) render(makePage(leafB, b), 0, T);
      else { const g = b.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(paper(b.width, b.height, 'left', A.tex, undefined, dpr), 0, 0); } // the back of a leaf: plain paper
      sliceInto(b, 'b');
    }
    // ---------------- turning leaf: a sheet of paper made of hinged strips ----------------
    let strips = []; const SEAM = 1.5;
    function buildLeaf() {
      leafEl.innerHTML = ''; strips = [];
      let parent = leafEl;
      for (let i = 0; i < N; i++) {
        const s = document.createElement('div'); s.className = 'bk-strip' + (i === 0 ? ' first' : '');
        // each strip carries 1.5 px of its neighbour's paper, tucked under the next strip: no hairline seams between layers
        const sw = Math.ceil((pw / N + SEAM) * dpr), f = canvas(sw, Math.round(ph * dpr)), b = canvas(sw, Math.round(ph * dpr)); f.className = 'f'; b.className = 'b';
        const sf = document.createElement('i'), sb = document.createElement('i'); sf.className = 'sf'; sb.className = 'sb';
        s.append(f, sf, b, sb); parent.appendChild(s); parent = s; strips.push({ s, f, b, sf, sb });
      }
      leafEl.style.display = 'none';
    }
    function sliceInto(src, which) {
      const sw = src.width / N, ow = c => c.width;
      strips.forEach((st, i) => {
        const c = st[which], g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height);
        // the back canvas is mirrored in place, so its extra 1.5 px lands on the spine side, under the strip before it
        const sx = which === 'f' ? i * sw : src.width - (i + 1) * sw, w = Math.min(ow(c), src.width - sx);
        g.drawImage(src, sx, 0, w, src.height, 0, 0, w, c.height);
      });
    }
    // light from in front of the book, a little from the left (the lamp and the hearth); a page lying flat is not shaded
    const LX = -.3, LZ = .95, LN = Math.hypot(LX, LZ), REST = LZ / LN;
    const shadeCss = d => { // d: how squarely the visible face meets the light
      if (d >= REST) return `rgba(255,243,220,${Math.min(.12, (d - REST) * 1.6).toFixed(3)})`;
      return `rgba(30,17,7,${(clamp((REST - d) / (REST + .35)) * .62).toFixed(3)})`;
    };
    let curlS = 0, landAt = -1;
    /** Bends the leaf for turn progress t: the spine side swings over on an eased arc; by hand her finger leads with
     *  the edge; on its own the edge lifts first, then trails behind as the sheet falls through the air. */
    function bendLeaf(t, dt, byHand) {
      const root = -180 * (.5 - .5 * Math.cos(Math.PI * clamp(t)));
      let want, ex;
      if (landAt >= 0) { const u = clamp((T - landAt) / .42); want = 8 * Math.sin(u * Math.PI) * (1 - u * .4); ex = 2; } // it settles: the edge lifts a hair and lies down
      else if (byHand) { want = -68 * Math.sin(Math.PI * clamp(t)) * (1 - .25 * t); ex = 1.35; } // a visible bow, even seen edge-on
      else { want = -44 * Math.sin(Math.PI * clamp(t / .34)) + 60 * Math.pow(Math.sin(Math.PI * clamp((t - .12) / .88)), 1.15); ex = lerp(2.2, 1.3, between(t, .12, .42)); }
      curlS += (want - curlS) * (1 - Math.exp(-dt * (landAt >= 0 ? 30 : 11)));
      const ang = strips.map((_, i) => clamp(root + curlS * Math.pow((i + 1) / N, ex), -179.7, -.25));
      const vtx = ang.map((a, i) => i ? (a + ang[i - 1]) / 2 : a); vtx.push(ang[N - 1]);
      const dF = vtx.map(a => { const r = a * Math.PI / 180; return (Math.sin(r) * LX + Math.cos(r) * LZ) / LN; });
      strips.forEach((st, i) => {
        st.s.style.transform = `rotateY(${(i ? ang[i] - ang[i - 1] : ang[0]).toFixed(2)}deg)`;
        st.sf.style.background = `linear-gradient(90deg,${shadeCss(dF[i])},${shadeCss(dF[i + 1])})`;
        st.sb.style.background = `linear-gradient(90deg,${shadeCss(-dF[i + 1])},${shadeCss(-dF[i])})`;
      });
      // the shadow the lifted sheet throws onto the pages beneath it moves with its edge
      let xe = 0, hgt = 0; ang.forEach(a => { const r = a * Math.PI / 180; xe += Math.cos(r) / N; hgt = Math.max(hgt, -Math.sin(r)); });
      const a = (.42 * hgt + .12 * (1 - hgt) * (t > .02 && t < .98 ? 1 : 0)).toFixed(3), soft = .06 + .3 * hgt;
      const er = Math.max(0, xe), el2 = Math.max(0, -xe);
      shadowR.style.background = `linear-gradient(90deg,rgba(30,16,6,${a}) ${(er * 100).toFixed(1)}%,rgba(30,16,6,0) ${((er + soft) * 100).toFixed(1)}%)`;
      shadowL.style.background = `linear-gradient(270deg,rgba(30,16,6,${a}) ${(el2 * 100).toFixed(1)}%,rgba(30,16,6,0) ${((el2 + soft * .7) * 100).toFixed(1)}%)`;
      shadowR.style.opacity = shadowL.style.opacity = 1;
      return xe;
    }

    // ---------------- the camera: the book's scale (1 = reading size) and where its spine sits, on soft springs ----------------
    const cam = { z: 1, sx: .5, vz: 0, vsx: 0, init: false };
    function spring(dt, zT, sxT, w) {
      if (!cam.init) { cam.z = zT; cam.sx = sxT; cam.vz = cam.vsx = 0; cam.init = true; return; }
      for (const [k, v, T0] of [['z', 'vz', zT], ['sx', 'vsx', sxT]]) { cam[v] += (w * w * (T0 - cam[k]) - 2 * w * cam[v]) * dt; cam[k] += cam[v] * dt; }
    }

    // ---------------- timeline state ----------------
    let T = 0, spread = -1, writeL = 0, writeR = 0, phase = 'intro', phaseAt = 0, turnP = 0, coverP = 0, rise = 0, dive = 0, focus = 0, focusTarget = 0;
    let hurry = false, ended = false, cardShown = false, frameN = 0, openedAt = -1, curlK = 0, fireAt = null, fireCss = '', steady = 0, readingOn = false;
    const OPEN_AT = 4.4;
    // she turns the pages herself: drag a page (or the cover) leftward, or tap. Only the test mode (?auto) turns them for her.
    const IDLE_TURN = 3.4, IDLE_OPEN = 3.5, IDLE_DIVE = 4.5;
    let manual = false, turnTarget = 1, dragX = 0, dragP = 0, downAt = 0, waitAt = 0, turnsDone = 0;
    const hint = text => env.hint(text);   // in the dock, under the page
    function startTurn(byHand) {
      if (phase !== 'hold' && phase !== 'write') return;
      hint(null); curlK = 0; curlEl.style.setProperty('--c', 0);
      if (isLast()) { phase = 'dive'; phaseAt = T; env.audio.sfx('whoosh', .45); env.audio.hit?.('dive'); return; }
      manual = !!byHand; turnTarget = 1; curlS = 0; landAt = -1;
      if (single) { leafF = cur; leafB = -2; sliceLeaf(); idxR = ++cur; }
      else { leafF = idxR; leafB = (spread + 1) * 2; sliceLeaf(); idxR = (spread + 1) * 2 + 1; }
      // the page underneath is the next page, still unwritten
      inst.R = makePage(idxR, pageR); writeR = 0; render(inst.R, 0, T);
      leafEl.style.display = ''; phase = 'turn'; phaseAt = T; turnP = 0;
      env.audio.sfx('page', .9); env.audio.hit?.('page');
    }
    function finishTurn() {
      turnsDone++; leafEl.style.display = 'none'; leafF = leafB = -1; landAt = -1;
      shadowR.style.opacity = shadowL.style.opacity = 0;
      // the sheet settles: a breath of dust from the gutter, a faint glint of sound
      const r = pageR.getBoundingClientRect();
      if (r.width) for (let k = 0; k < 2; k++) fx.burst(r.left + 4, r.top + r.height * (.3 + R() * .5), { n: 3, speed: 16, life: 2.4, size: 1.1, sparkle: 0, color: '255,228,186', lift: 8, drag: 1.6 });
      env.audio.sfx('glint', .14);
      if (single) { leftBlank = true; blankLeft(); phase = 'write'; phaseAt = T; hurry = false; return; }
      spread++;
      idxL = spread * 2; inst.L = makePage(idxL, pageL); writeL = 0; render(inst.L, 0, T);
      phase = 'write'; phaseAt = T; hurry = false;
    }
    /** The phone turned: one page at a time (upright) ⇄ the open spread (on its side), keeping her place and the ink. */
    function setMode(toSingle) {
      if (phase === 'turn') { if (turnTarget || turnP > .5) finishTurn(); else cancelTurn(); }   // a leaf in the air lands at once
      const open = openedAt >= 0;
      if (toSingle) {
        if (open) {   // read on from the page she was on: the right one once it has begun, else the left
          const lDur = inst.L?.dur || 0, onRight = idxR >= 0 && (writeR > 0 || writeL >= lDur);
          cur = onRight ? idxR : Math.max(0, idxL); writeR = onRight ? writeR : writeL;
          idxR = cur; leftBlank = cur > 0;
        } else { idxR = 0; leftBlank = false; }
        idxL = -1; writeL = 0;
      } else {
        if (open) {
          spread = Math.floor(cur / 2); idxL = spread * 2; idxR = idxL + 1;
          if (cur % 2 === 0) { writeL = writeR; writeR = 0; } else writeL = 99;   // the left page was already written
        } else { idxL = 0; idxR = 1; writeL = writeR = 0; }
        leftBlank = false;
      }
      single = toSingle; el.classList.toggle('bk-single', single);
      if (phase === 'hold') { phase = 'write'; phaseAt = T; }
      curlEl.style.setProperty('--c', 0); curlK = 0;
    }
    /** A turn let go too early falls back: the leaf lies down again on the right. */
    function cancelTurn() {
      leafEl.style.display = 'none'; shadowR.style.opacity = shadowL.style.opacity = 0; landAt = -1;
      if (single) cur = leafF; idxR = leafF; leafF = leafB = -1;
      inst.R = makePage(idxR, pageR); writeR = inst.R?.dur || 0; render(inst.R, writeR, T);
      phase = 'hold'; phaseAt = T; waitAt = T;
    }
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('#hud,#menu,#btn-next')) return;
      dragX = e.clientX; downAt = T; dragP = 0;
      if (phase === 'hold' && !isLast() && (single || e.clientX > env.W * .35)) startTurn(true);
      else if (phase === 'cover-wait') { phase = 'cover'; phaseAt = T; manual = true; coverP = 0; hint(null); coverEl.classList.remove('invite'); env.audio.sfx('whoosh', .4); env.audio.hit?.('cover'); env.audio.section?.('theme'); }
    });
    addEventListener('pointermove', e => {
      if (!manual) return;
      dragP = clamp((dragX - e.clientX) / (pw * cam.z * 1.2));
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

    const cues = env.cues([[2.2, 5.4, '书房里的灯，一盏一盏，暖暖地亮了起来。']]);
    layout();

    return {
      progress: () => single ? clamp((cur + 1 + turnP) / (defs.length + 1)) : clamp((spread + 1 + turnP) / (SPREADS + 1)),
      debug: () => ({ phase, spread, cur, writeL, writeR, T, turnP: +turnP.toFixed(3), lDur: inst.L?.dur, rDur: inst.R?.dur, z: +cam.z.toFixed(3), sx: +cam.sx.toFixed(3), pw, page: (r => [Math.round(r.left), Math.round(r.right), Math.round(r.width)])(pageR.getBoundingClientRect()) }),
      resize() { layout(); },
      destroy() { env.reading(false); removeEventListener('pointerup', release); removeEventListener('pointercancel', release); stop(room); hearth.remove(); },
      update(dt, t) {
        T = t; const W = env.W, H = env.H;
        if (!cardShown && t > .2) { cardShown = true; env.chapterCard('I', 1700); }
        if (t < 9) cues(t);
        // ---------- 2.5D camera ----------
        const wd = wander(t, 4.1, .9), push = clamp((cam.z - zClosed) / (1 - zClosed || 1));
        view.frame(map, { x: wd.x * .7 + env.look.x * .8, y: wd.y * .45 + env.look.y * .5 - .25 * (1 - rise), zoom: .035 * rise + .06 * between(t, 1, 45) + .05 * clamp(push) + .16 * dive, focus: .72 }, [W / 2, H * .55]);
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
          lg.setTransform(rs, 0, 0, rs, 0, 0); const leap = drawFire(lg, hx, hy, hw, t, warm); hearth.update(t, hx, hy, hw, warm, leap);
          fireAt = [hx, hy];
        }
        { const pm = view.at(.75, tmp); lg.setTransform(rs * pm.s, 0, 0, rs * pm.s, rs * pm.x, rs * pm.y); if (!filmed) studySteam(lg, portrait ? 'study-port' : 'study-land', t, warm * (1 - rise * .6)); lg.setTransform(rs, 0, 0, rs, 0, 0); } // the film has its own steam
        lg.globalCompositeOperation = 'lighter';
        bokeh.forEach(b => {
          const pm = view.at(.9, tmp), k = pm.s / map.s, x = pm.x + (((b.x + t * b.v) % 1.1 - .05) * W - map.x) * k, y = pm.y + ((b.y + Math.sin(t * .4 + b.p) * .02) * H - map.y) * k, r = b.r * Math.min(W, H) * 1.6;
          lg.globalAlpha = b.a * warm * (.6 + .4 * Math.sin(t * .7 + b.p)); lg.drawImage(bokehS, x - r, y - r, r * 2, r * 2);
        });
        // a little dust hanging in the lamplight, near and far (soft, slow, never glittering)
        motes.forEach(m => {
          const x = ((m.x + t * .003 * (m.z + .3) + Math.sin(t * .13 + m.p) * .01) % 1) * W, y = ((m.y + Math.sin(t * .17 + m.p) * .015 - t * .002 * m.z) % 1 + 1) % 1 * H, sz = 1.2 + m.z * 2.6;
          lg.globalAlpha = warm * (.05 + .12 * m.z) * (.55 + .45 * Math.sin(t * .6 * m.s + m.p)); lg.drawImage(dustS, x - sz, y - sz, sz * 2, sz * 2);
        });
        lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;
        // warm lamplight wash and a soft pool of light where the book floats
        const wv = warm * (.75 + Math.sin(t * 9) * .05 + Math.sin(t * 4.1) * .06);
        if (wv > .01) { lg.globalCompositeOperation = 'lighter'; lg.globalAlpha = wv * .18; lg.drawImage(glowW, W * .1, -H * .35, W * .8, H * 1.2); }
        const av = (.3 + rise * .3) * (1 - push * .5);
        if (av > .02) { lg.globalCompositeOperation = 'lighter'; lg.globalAlpha = av * .32; const aw = pw * 3 * camS, ah = ph * 1.9 * camS; lg.drawImage(auraS, camX - aw / 2, camY - ah / 2, aw, ah); }
        lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;

        // ---------- choreography ----------
        if (phase === 'intro') {
          rise = easeInOut(between(t, 2.4, 4.6)); // after the chapter's title has cleared
          if (t > OPEN_AT) { phase = 'cover-wait'; phaseAt = t; coverEl.classList.add('invite'); if (single) { idxR = 0; inst.R = makePage(0, pageR); render(inst.R, 0, t); } else { idxL = 0; inst.L = makePage(0, pageL); render(inst.L, 0, t); } }
        }
        if (phase === 'cover-wait') {
          if (t - phaseAt > 1.2) hint('轻触封面，或向左拨开，翻开这本书');
          if (env.auto && t - phaseAt > IDLE_OPEN) { phase = 'cover'; phaseAt = t; manual = false; turnTarget = 1; hint(null); coverEl.classList.remove('invite'); env.audio.sfx('whoosh', .4); env.audio.hit?.('cover'); env.audio.section?.('theme'); }
        }
        if (phase === 'cover') {
          if (!manual) coverP = clamp(coverP + (turnTarget ? 1 : -1) * dt / 1.5);
          if (coverP <= 0 && !manual && !turnTarget) { phase = 'cover-wait'; phaseAt = t - 1.2; turnTarget = 1; coverEl.classList.add('invite'); }
          if (coverP >= 1) { spread = 0; openedAt = t; writeL = 0; writeR = 0; if (single) { cur = 0; idxR = 0; inst.R = inst.R || makePage(0, pageR); } else { idxL = 0; inst.L = makePage(0, pageL); render(inst.L, 0, t); } phase = 'write'; phaseAt = t; }
        }
        if (phase === 'write' || phase === 'hold') {
          const L = inst.L, Rp = inst.R, spd = hurry ? 6 : 1.5;
          const lDur = L?.dur || 0, rDur = Rp?.dur || 0;
          // on a phone the ink waits until the camera has come in close enough to read it
          const ready = !single || openedAt < 0 || cam.z > .9 || t - openedAt > 2.6;
          if (!ready) { /* the push-in */ }
          else if (writeL < lDur + .01) { writeL += dt * spd; render(L, writeL, t); }
          else if (writeR < rDur + .01) { writeR += dt * spd; render(Rp, writeR, t); }
          else if ((frameN++ % (env.q < 1 ? 6 : 3)) === 0) { render(L, writeL, t); render(Rp, writeR, t); } // gold ink shimmer
          focusTarget = !single && Rp?.map ? -.35 : 0;
          if (phase === 'write' && ready && writeL >= lDur && writeR >= rDur) { phase = 'hold'; phaseAt = t; waitAt = t; }
          if (phase === 'hold') {
            const last = isLast(), wait = t - waitAt;
            if (wait > 1.4 && (last || !turnsDone)) hint(last ? '轻触书页，走进故事里' : '向左拨动书页，翻到下一页');
            else if (!last && wait > 9) hint('轻触书页，或向左拨动');
            if (env.auto && wait > (last ? IDLE_DIVE : IDLE_TURN)) startTurn();
          }
        }
        // the free corner of the page lifts a little, breathing, to say it can be turned
        { const want = phase === 'hold' && !isLast() && t - waitAt > .8 ? .55 + .45 * (.5 + .5 * Math.sin((t - waitAt) * 1.7)) : 0;
          curlK += (want - curlK) * (1 - Math.exp(-dt * 3)); const v = curlK.toFixed(3); if (curlEl._v !== v) { curlEl._v = v; curlEl.style.setProperty('--c', v); } }
        let pull = 0; // phones: how far the camera eases back while a leaf is in the air
        if (phase === 'turn') {
          if (!manual && landAt < 0) turnP = clamp(turnP + (turnTarget ? 1 : -1) * dt / 1.25);
          if (turnP <= 0 && !manual && !turnTarget) { cancelTurn(); }
          else {
            if (turnP >= 1 && !manual && landAt < 0) landAt = t;
            bendLeaf(turnP, dt, manual);
            if (landAt >= 0 && t - landAt > .42) finishTurn();
          }
          focusTarget = 0;
          pull = between(turnP, 0, .22) * (1 - between(turnP, .82, 1));
        }
        if (phase === 'dive') {
          dive = easeIn(clamp((t - phaseAt) / 1.8));
          if (!ended && dive > .55) { ended = true; env.next({ transition: 'sand', at: [env.W / 2, env.H * .48] }); } // the page crumbles into the sand of the next chapter
        }
        focus = lerp(focus, focusTarget, 1 - Math.exp(-dt * 2.2));

        // ---------- camera targets: closed on the desk → the open spread → close on the page she reads ----------
        const ce = easeInOut(coverP), reading = openedAt >= 0 && t - openedAt > .55;
        const sxClosed = .5 - .522 * zClosed * pw / W;
        let zT, sxT;
        if (!reading) { zT = lerp(zClosed, zOpen, ce); sxT = lerp(sxClosed, .5, ce); }
        else { zT = 1; sxT = sxRead + focus * pw * .5 / W; }
        if (single && pull > 0) { zT = lerp(zT, .8, pull); sxT = lerp(sxT, .29, pull); }
        spring(Math.min(dt, .05), zT, sxT, phase === 'turn' ? 3.6 : reading ? 2.3 : 2.8);

        // ---------- book transform ----------
        // while she reads, the book steadies in her hands: no tilt, sway or float, true scale and whole device pixels, so the
        // page reaches the screen 1:1 (any tilt or sub-pixel drift would resample the writing and soften the ink). It
        // comes alive again the moment a leaf lifts.
        const steadyWant = reading && (phase === 'write' || phase === 'hold') && !dive ? 1 : 0;
        steady += (steadyWant - steady) * (1 - Math.exp(-dt * (steadyWant ? 2.4 : 7))); if (steady > .985 && steadyWant) steady = 1;   // the last hair of the ease would only blur
        const calm = 1 - steady;
        if ((steady > .5) !== readingOn) { readingOn = steady > .5; env.reading(readingOn); }
        const bob = Math.sin(t * .9) * 5 * rise * (1 - push * .7) * calm, sway = Math.sin(t * .5) * 1.1 * rise * (1 - push * .6) * calm;
        const tableY = portrait ? H * .3 : H * .27;
        const ty = lerp(tableY, midY - H * .01, rise) + bob;   // up into the middle of the free frame, clear of the dock
        const rx = (lerp(64, 15, rise) - 8 * push) * calm, sc = lerp(.52, 1, rise);
        const bp = view.at(1.12, tmp), bk = bp.s / map.s;
        let s = sc * cam.z, spineX = cam.sx * W, y = ty + (bp.y + (H / 2 - map.y) * bk - H / 2) * calm;
        spineX += (bp.x + (W / 2 - map.x) * bk - W / 2) * (1 - push * .6) * calm;
        if (dive > 0) { const k = 1 + dive * 5, cx = spineX + pw * s * .5; s *= k; spineX = cx - (cx - spineX) * k; y += ph * .05 * dive * 5; }
        else if (steady === 1) {   // settled: snap the page's corner to the pixel grid
          if (Math.abs(s - 1) < .02) s = 1;
          spineX = Math.round(spineX * dpr) / dpr; y = Math.round((H / 2 + y - ph / 2) * dpr) / dpr - H / 2 + ph / 2;
        }
        floatEl.style.transform = `translate3d(${(spineX - W / 2).toFixed(3)}px,${y.toFixed(3)}px,0) rotateX(${(rx - dive * 10).toFixed(2)}deg) rotateZ(${sway.toFixed(2)}deg) scale3d(${s.toFixed(4)},${s.toFixed(4)},${s.toFixed(4)})`;
        coverEl.style.transform = `rotateY(${(-180 * easeInOut(coverP)).toFixed(2)}deg) translateZ(2px)`;
        bookEl.classList.toggle('is-open', coverP > .5);
        // the hearth's light on the pages: warm from the fire's side, rising and sinking with the flames
        if (fireAt && coverP > .3) {
          const vx = (spineX - fireAt[0]), vy = (H / 2 + y - fireAt[1]), ang = Math.atan2(vx, -vy) * 180 / Math.PI, lv = (hearth.level || .7) * warm, near = clamp(1.3 - Math.hypot(vx, vy) / Math.max(W, H));
          const o = (.07 + .1 * lv) * (.6 + .4 * near) * clamp((coverP - .3) / .4) * (1 - .5 * steady), css = `linear-gradient(${ang.toFixed(1)}deg,rgba(255,132,52,${o.toFixed(3)}),rgba(255,170,90,${(o * .35).toFixed(3)}) 45%,rgba(24,12,6,${(o * .5).toFixed(3)}))`;
          if (css !== fireCss) { fireCss = css; fireL.forEach(e => { e.style.backgroundImage = css; }); }
        }
        camX = spineX + (single && coverP > .5 ? pw * s * .5 : 0); camY = H / 2 + y; camS = s;
      },
    };
  },
};
