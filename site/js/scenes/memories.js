// Chapter III: polaroids hung on a string of fairy lights. She takes any of them down to look into it
// (a living photo she can lean into); left alone, they come forward one by one. Then the letter.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, easeOut, easeOutBack, rng, glowSprite, TAU } from '../util.js';
import { PHOTOS, LETTER } from '../content-shim.js';
import { loadDepth, depthNameFor, DepthView, wander } from '../depth.js';
import { Hearth, FIRE } from '../hearth.js';

const DROP = 3.0;
const DEPTHS = {}, ROOM = {};
export default {
  id: 'memories', music: 'memories', bed: 'fire',
  async load() {
    // the photos hang in the same cozy study as the book and the cake, its lights and fire far out of focus behind them
    if (!ROOM.land) await Promise.all(['land', 'port'].map(async k => {
      const img = await loadImage(asset(`img/study-${k}.webp`)), w = k === 'land' ? 480 : 270, h = Math.round(w * img.height / img.width), c = canvas(w, h), cg = c.getContext('2d');
      cg.filter = 'blur(9px) saturate(1.15)'; cg.drawImage(img, -12, -12, w + 24, h + 24); cg.filter = 'none';
      cg.fillStyle = 'rgba(14,8,10,.36)'; cg.fillRect(0, 0, w, h); ROOM[k] = c;
    }));
    await Promise.all(PHOTOS.map(p => Promise.all([loadImage(p.src).catch(() => null), loadDepth(depthNameFor(p.src)).then(d => { DEPTHS[p.src] = d; }).catch(() => null)]))); },
  create(env) {
    const { el, fx } = env;
    env.pups.set('memories');
    el.innerHTML = `<canvas class="full mm-bg"></canvas><div class="mm-wall"></div>
      <div class="mm-quote"><small></small><b></b><span></span></div><div class="mm-letter"><div class="mm-paper"><div class="mm-text"></div></div></div>`;
    const bg = el.querySelector('.mm-bg'), g = bg.getContext('2d'), wall = el.querySelector('.mm-wall');
    const R = rng(31);
    const bokeh = Array.from({ length: Math.round(18 + 18 * env.q) }, () => ({ x: R(), y: R(), r: 12 + R() * 60, s: .002 + R() * .008, p: R() * TAU, c: R() < .7 ? '255,196,120' : '255,170,150', a: .08 + R() * .2 }));
    const sprites = {}; const spr = c => sprites[c] || (sprites[c] = glowSprite(c, 128, 1.2));
    const bulb = glowSprite('255,214,150', 64, 2.2), ember = glowSprite('255,140,60', 64, 1.6);
    const hearth = new Hearth(el, { before: el.querySelector('.mm-wall'), wash: .8 });   // the fire, out of focus behind the photos, still breathes

    // polaroids
    const cards = PHOTOS.map((p, i) => {
      const c = document.createElement('figure'); c.className = 'mm-card';
      c.innerHTML = `<i class="clip"></i><div class="ph"><img src="${p.src}" alt="${p.title}" style="object-position:${p.pos}"></div><figcaption><b>${p.title}</b><span>${p.caption}</span></figcaption>`;
      wall.appendChild(c);
      // living photo: the picture's depth planes, re-composited by a slow camera while it is in focus
      const dm = DEPTHS[p.src], view = dm ? new DepthView(dm, { amp: .05, focus: .3 }) : null;
      if (view) { const box = c.querySelector('.ph'); box.classList.add('ph-depth'); view.mount(box); c.querySelector('img').style.visibility = 'hidden'; }
      return { el: c, img: c.querySelector('img'), i, swing: (R() - .5) * 30, ph: R() * TAU, drop: 1.25 + i * .24, view, pos: (p.pos || '50% 50%').split(' ').map(v => parseFloat(v) / 100), base: null };
    });
    // letter
    const quote = el.querySelector('.mm-quote'); let quoteIdx = -2;
    const textEl = el.querySelector('.mm-text'), letterEl = el.querySelector('.mm-letter');
    const chars = []; const addP = (txt, cls) => { const p = document.createElement('p'); if (cls) p.className = cls; for (const ch of txt) { const s = document.createElement('span'); s.textContent = ch; p.appendChild(s); chars.push(s); } textEl.appendChild(p); };
    addP(LETTER.greeting, 'greet'); LETTER.paragraphs.forEach(t => addP(t)); addP(LETTER.closing, 'close'); addP(LETTER.ps, 'ps');
    let at = 0; const times = chars.map(s => { const t0 = at; const ch = s.textContent; at += '，。；：！？♡'.includes(ch) ? .15 : .038; if (s === s.parentNode.lastChild) at += .32; return t0; });
    let LETTER_AT = 1e9, WRITE_AT = 1e9, WRITE_END = 1e9;
    const openLetter = t => { if (LETTER_AT < 1e9) return; LETTER_AT = t + .3; WRITE_AT = LETTER_AT + 1.1; WRITE_END = WRITE_AT + at; env.offerNext(null); hint(null); };
    // ---------- looking at photos: tap one to take it down, tap again to hang it back ----------
    const AUTO_IDLE = 4.5, HOLD_LOOK = 5;
    let focusIdx = -1, focusAt = 0, lastInput = 0, lookE = 0; const seen = new Set();
    const hintEl = document.createElement('p'); hintEl.className = 'mm-hint'; el.appendChild(hintEl);
    const hint = text => { if (text) hintEl.textContent = text; hintEl.classList.toggle('on', !!text); };
    const focus = i => { focusIdx = i; focusAt = T; if (i >= 0) { seen.add(i); env.audio.sfx('page', .35); } };
    let drag = null;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('#hud,#menu,#btn-next') || LETTER_AT < 1e9) return;
      lastInput = T; hint(null);
      const card = e.target.closest('.mm-card'), i = card ? cards.findIndex(c => c.el === card) : -1;
      drag = { x: e.clientX, y: e.clientY, i, t: T };
    });
    addEventListener('pointermove', e => { if (drag && focusIdx >= 0) { drag.dx = (e.clientX - drag.x) / env.W; drag.dy = (e.clientY - drag.y) / env.H; } }, { passive: true });
    const release = () => {
      if (!drag) return; const d = drag; drag = null;
      if (Math.hypot(d.dx || 0, d.dy || 0) > .03) return; // that was a look around, not a tap
      if (d.i >= 0 && d.i !== focusIdx) focus(d.i); else if (focusIdx >= 0) focus(-1);
    };
    addEventListener('pointerup', release); addEventListener('pointercancel', release);

    let rs = 1, anchors = [], cardW = 180, portrait = false, T = 0, written = 0, offered = false, folded = false, ended = false, cardShown = false;
    function layout() {
      const W = env.W, H = env.H; portrait = env.portrait;
      rs = env.software ? .5 : .75; bg.width = Math.round(W * rs); bg.height = Math.round(H * rs);
      cardW = portrait ? Math.min(W * .3, 150) : Math.min(W * .16, H * .3);
      el.style.setProperty('--cw', cardW + 'px');
      cards.forEach(c => { if (!c.view) return; const bw = cardW * .88, m = c.view.m, s = Math.max(bw / m.w, bw / m.h); c.base = { s, x: (bw - m.w * s) * c.pos[0], y: (bw - m.h * s) * c.pos[1], bw }; c.still = true; c.view.frame(c.base, { x: 0, y: 0, zoom: 0, focus: .3 }, [bw / 2, bw / 2]).apply(); });
      // string(s) of lights: one swag on wide screens, two on phones
      const all = PHOTOS.map((_, i) => i), rows = portrait && all.length > 3 ? [all.slice(0, 3), all.slice(3)] : [all];
      anchors = []; strings = rows.map((row, r) => {
        const y0 = H * (portrait ? .13 + r * .27 : .17), sag = H * (portrait ? .05 : .07);
        const pts = x => y0 + sag * (1 - Math.pow((x / W - .5) * 2, 2));
        row.forEach((ci, k) => { const x = W * ((k + 1) / (row.length + 1)) + (portrait ? 0 : (k - (row.length - 1) / 2) * W * .01); anchors[ci] = [x, pts(x)]; });
        return pts;
      });
      const lw = Math.min(600, W * .9);
      letterEl.style.setProperty('--lw', lw + 'px'); letterEl.style.setProperty('--fs', Math.max(14, Math.min(18, lw * .031)) + 'px');
    }
    let strings = [];
    layout();
    const cues = env.cues([[.8, DROP + .4, '有些风景，想和你慢慢看。']]);

    return {
      resize: layout,
      progress: () => LETTER_AT < 1e9 ? .6 + clamp((T - LETTER_AT) / (WRITE_END - LETTER_AT + 4)) * .4 : seen.size / PHOTOS.length * .6,
      update(dt, t) {
        T = t; const W = env.W, H = env.H;
        const wd = wander(t, 8.3, .8), lx = (wd.x * .6 + env.look.x) * Math.min(W, H) * .02, ly = (wd.y * .4 + env.look.y * .7) * Math.min(W, H) * .02;
        if (!cardShown) { cardShown = true; env.chapterCard('III', 1600); }
        cues(t);
        // ---------- background: bokeh and fairy lights ----------
        g.setTransform(rs, 0, 0, rs, 0, 0);
        { const r = env.portrait ? ROOM.port : ROOM.land, k = 1.12, s = Math.max(W / r.width, H / r.height) * k; // the study, out of focus
          const x0 = (W - r.width * s) / 2 - lx * .5, y0 = (H - r.height * s) / 2 - ly * .5;
          g.drawImage(r, x0, y0, r.width * s, r.height * s);
          const F = FIRE[env.portrait ? 'study-port' : 'study-land'], hx = x0 + F.x * r.width * s, hy = y0 + F.y * r.height * s, hw = F.w * r.width * s;
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = .35 + .12 * Math.sin(t * 5.3) + .08 * Math.sin(t * 2.1); g.drawImage(ember, hx - hw * .7, hy - hw * .75, hw * 1.4, hw * .9); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
          hearth.update(t, hx, hy, hw, between(t, 0, 2.5) * (1 - between(t, LETTER_AT, LETTER_AT + 2) * .5));
          const vg = g.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .2, W / 2, H * .5, Math.max(W, H) * .75); vg.addColorStop(0, 'rgba(20,10,8,0)'); vg.addColorStop(1, 'rgba(10,5,6,.6)');
          g.fillStyle = vg; g.fillRect(0, 0, W, H); }
        g.globalCompositeOperation = 'lighter';
        bokeh.forEach(b => { const dz = b.r / 40 - .6, x = ((b.x + t * b.s) % 1.2 - .1) * W - lx * dz * 1.6, y = (b.y + Math.sin(t * .3 + b.p) * .02) * H - ly * dz * 1.6; g.globalAlpha = b.a * (.7 + .3 * Math.sin(t + b.p)); g.drawImage(spr(b.c), x - b.r, y - b.r, b.r * 2, b.r * 2); });
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        const lightsOn = between(t, .4, 1.8);
        strings.forEach((f, r) => {
          g.strokeStyle = 'rgba(60,40,30,.9)'; g.lineWidth = 1.2; g.beginPath(); for (let x = -10; x <= W + 10; x += 12) { const y = f(x); x < 0 ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke();
          g.globalCompositeOperation = 'lighter';
          for (let k = 0; k < 18; k++) {
            const x = (k + .5) / 18 * W, y = f(x) + 5, on = lightsOn * clamp((t - .4) * 8 - k * .3), tw = .65 + .35 * Math.sin(t * 2.2 + k * 1.7 + r);
            if (on <= 0) continue; g.globalAlpha = on * tw; g.drawImage(bulb, x - 18, y - 18, 36, 36); g.globalAlpha = on; g.fillStyle = '#fff1c8'; g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill();
          }
          g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        });
        // ---------- polaroids ----------
        // left alone, the next photo she has not seen comes forward; a photo she is looking at stays until she lets it go
        if (t > DROP && LETTER_AT >= 1e9) {
          const idle = t - Math.max(lastInput, focusAt);
          if (focusIdx < 0 && idle > (seen.size ? 1.6 : AUTO_IDLE) && seen.size < PHOTOS.length && t - lastInput > AUTO_IDLE) focus([...cards.keys()].find(i => !seen.has(i)));
          else if (focusIdx >= 0 && t - focusAt > HOLD_LOOK && t - lastInput > HOLD_LOOK) focus(-1);
          if (t > DROP + 1.5 && !lastInput && focusIdx < 0 && !seen.size) hint('轻触一张照片，取下来看看');
          if (seen.size === PHOTOS.length && focusIdx < 0 && !offered) { offered = true; env.offerNext('读一读给你的信', () => openLetter(T)); }
          if (offered && focusIdx < 0 && t - Math.max(lastInput, focusAt) > 5) openLetter(t);
        }
        const fi = focusIdx, ft = clamp((t - focusAt) / HOLD_LOOK), inFocus = fi >= 0;
        lookE += ((inFocus ? 1 : 0) - lookE) * (1 - Math.exp(-dt * 3.2));
        const letterUp = between(t, LETTER_AT, LETTER_AT + 2);
        const qi = inFocus && t - focusAt > .5 ? fi : -1;
        if (qi !== quoteIdx) {
          quoteIdx = qi; quote.classList.toggle('on', qi >= 0);
          if (qi >= 0) { const p = PHOTOS[qi]; quote.querySelector('small').textContent = `0${qi + 1} / 0${PHOTOS.length}`; quote.querySelector('b').textContent = p.title; quote.querySelector('span').textContent = p.caption; }
        }
        // while one photo is looked at, the others step back (smaller, higher, dimmer) to make room
        cards.forEach(c => {
          const [ax, ay] = anchors[c.i]; const k = easeOutBack(clamp((t - c.drop) / 1.1));
          if (k > 0 && !c.landed) { c.landed = true; env.audio.sfx('page', .15); }
          const sw = Math.sin(t * 1.4 + c.ph) * (2 + 6 * Math.exp(-(t - c.drop) * .7)) + c.swing * .1;
          let x = ax - lx * .5, y = lerp(-H * .4, ay, k) - ly * .5, rot = sw, s = 1, z = 0, dim = 0;
          c.e = (c.e || 0) + ((c.i === fi ? 1 : 0) - (c.e || 0)) * (1 - Math.exp(-dt * 3.4));
          if (c.e > .002 || inFocus) {
            const e = easeInOut(c.e);
            if (c.e > .002) {
              const target = portrait ? Math.min(W * .78, H * .42) : Math.min(H * .62 * .82, W * .32);
              s = lerp(1, target / cardW, e); x = lerp(ax, W * (portrait ? .5 : .36), e); y = lerp(ay, H * (portrait ? .12 : .14), e); rot = lerp(sw, -2, e); z = 1;
              if (c.view && c.base) { // the camera glides through the photo's depth while she looks at it
                const b = c.base, dx = drag && c.i === fi ? (drag.dx || 0) * 4 : 0, dy = drag && c.i === fi ? (drag.dy || 0) * 3 : 0;
                c.lx = lerp(c.lx || 0, clamp(lerp(-.7, .7, easeInOut(ft)) + env.look.x * .5 - dx, -1.3, 1.3), .08); c.ly = lerp(c.ly || 0, clamp(lerp(.3, -.2, ft) + env.look.y * .4 - dy, -1.3, 1.3), .08);
                c.view.frame(b, { x: c.lx, y: c.ly, zoom: .14 * easeInOut(clamp(ft * 1.4)) * c.e, focus: .3 }, [b.bw / 2, b.bw * .55]).apply(); c.still = false;
              } else c.img.style.transform = `scale(${1.04 + ft * .1}) translate(${(ft - .5) * -2}%,0)`;
              c.el.classList.toggle('reading', e > .6);
            } else { dim = (inFocus ? .55 : 0) * lookE + lookE * .4; s = 1 - lookE * .26; y -= lookE * H * .07; c.el.classList.remove('reading'); }
            if (c.e <= .002 && c.view && c.base && !c.still) { c.still = true; c.view.frame(c.base, { x: 0, y: 0, zoom: 0, focus: .3 }, [c.base.bw / 2, c.base.bw / 2]).apply(); }
          } else c.el.classList.remove('reading');
          if (letterUp > 0) { dim = Math.max(dim, letterUp * .7); y -= letterUp * H * .06; }
          c.el.style.transform = `translate(${(x - cardW / 2).toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${s.toFixed(3)})`;
          c.el.style.zIndex = z ? 5 : 1; const op = (1 - dim * .6).toFixed(2); if (c.op !== op) { c.op = op; c.el.style.opacity = op; }
        });
        // ---------- letter ----------
        letterEl.classList.toggle('up', t > LETTER_AT);
        if (t > WRITE_AT) {
          let moved = false;
          while (written < chars.length && t >= WRITE_AT + times[written]) { chars[written++].classList.add('on'); moved = true; }
          if (moved) {
            const sp = chars[written - 1], paper = textEl.parentNode, r = sp.getBoundingClientRect(), pr = paper.getBoundingClientRect();
            if (r.bottom > pr.bottom - pr.height * .22) paper.scrollTop += r.bottom - (pr.bottom - pr.height * .22);
            if (written % 4 === 0) fx.trail(r.right, r.top + r.height * .6, { life: .9, size: 1.3, vy: -14 });
          }
          if (written >= chars.length && !folded) { folded = true; env.offerNext('收好这封信', () => { ended = true; env.next({ transition: 'bloom', at: [env.W / 2, env.H * .45] }); }); }
          if (folded && !ended && t > WRITE_END + 25) { ended = true; env.offerNext(null); env.next({ transition: 'bloom', at: [env.W / 2, env.H * .45] }); }
        }
      },
      destroy() { env.offerNext(null); removeEventListener('pointerup', release); removeEventListener('pointercancel', release); hearth.remove(); },
    };
  },
};
