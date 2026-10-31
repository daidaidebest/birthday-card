// Chapter III: a wall of the study, hung with her photographs in four old frames (the plaster, the lamplight and the frames
// are Cycles renders, tools/blender/wall.py; the collage is arranged here to suit the screen). She takes any of them down
// to look at it, and turns it over to read the back; left alone, they come forward one by one. Then the letter.
import { asset, loadImage, clamp, lerp, between, easeInOut, easeOut, rng, glowSprite, TAU } from '../util.js';
import { PHOTOS, LETTER } from '../content-shim.js';
import { wander } from '../depth.js';
import { Hearth } from '../hearth.js';

const DROP = 3.0;
const WALL = {};
export default {
  id: 'memories', music: 'memories', bed: 'fire',
  async load() {
    // the wall they hang on and the frames (ordered by photo: the first is the wide one)
    if (!WALL.img) [WALL.img, WALL.meta] = await Promise.all([loadImage(asset('img/wall/wall.webp')), fetch(asset('img/wall/frames.json')).then(r => r.json())]);
    await Promise.all(PHOTOS.map(p => loadImage(p.src).catch(() => null))); },
  create(env) {
    const { el, fx } = env;
    env.pups.set('memories');
    el.innerHTML = `<canvas class="full mm-bg"></canvas><div class="mm-wall"><i class="mm-scrim"></i></div>
      <div class="mm-quote"><small></small><b></b><span></span></div><div class="mm-letter"><div class="mm-paper"><div class="mm-text"></div></div></div>`;
    const bg = el.querySelector('.mm-bg'), g = bg.getContext('2d'), wall = el.querySelector('.mm-wall');
    const R = rng(31);
    const dust = Array.from({ length: Math.round(10 + 14 * env.q) }, () => ({ x: R(), y: R(), r: 1.2 + R() * 2.4, s: .0015 + R() * .004, p: R() * TAU, a: .05 + R() * .12 }));
    const mote = glowSprite('255,214,160', 32, 2), scrim = el.querySelector('.mm-scrim');
    const hearth = new Hearth(el, { before: el.querySelector('.mm-wall'), wash: .8 });   // the fire, out of focus behind the photos, still breathes

    // the frames: each sprite carries the frame and its shadow on the wall, the photograph lies behind it in the opening
    const KEYS = ['a', 'b', 'c', 'd'];
    const cards = PHOTOS.map((p, i) => {
      const k = KEYS[i % KEYS.length], f = WALL.meta[k], [ox, oy, ow, oh] = f.opening, c = document.createElement('figure'); c.className = 'mm-card';
      c.style.setProperty('--ar', f.w / f.h);
      c.innerHTML = `<div class="mm-turn"><div class="ph" style="left:${ox * 100}%;top:${oy * 100}%;width:${ow * 100}%;height:${oh * 100}%"><img src="${p.src}" alt="${p.title}" style="object-position:${p.pos}"></div><img class="mm-fr" src="${asset(`img/wall/frame-${k}.webp`)}" alt="">
        <div class="mm-backface" aria-hidden="true" style="left:${f.pad[0] * 100}%;top:${f.pad[1] * 100}%;right:${f.pad[0] * 100}%;bottom:${f.pad[1] * 100}%"><p>${(p.back || '想把这一刻，\n留给你。').replace(/\n/g, '<br>')}</p><small>${p.title}</small></div></div>`;
      wall.appendChild(c);
      return { el: c, img: c.querySelector('.ph img'), i, f, tilt: (R() - .5) * 1.1, show: 1.1 + i * .28 };
    });
    // letter
    const quote = el.querySelector('.mm-quote'); let quoteIdx = -2;
    const textEl = el.querySelector('.mm-text'), letterEl = el.querySelector('.mm-letter');
    const chars = []; const addP = (txt, cls) => { const p = document.createElement('p'); if (cls) p.className = cls; for (const ch of txt) { const s = document.createElement('span'); s.textContent = ch; p.appendChild(s); chars.push(s); } textEl.appendChild(p); };
    if (LETTER.greeting) addP(LETTER.greeting, 'greet'); LETTER.paragraphs.forEach(t => addP(t)); addP(LETTER.closing, 'close'); addP(LETTER.ps, 'ps');
    let at = 0; const times = chars.map(s => { const t0 = at; const ch = s.textContent; at += '，。；：！？♡'.includes(ch) ? .15 : .038; if (s === s.parentNode.lastChild) at += .32; return t0; });
    let LETTER_AT = 1e9, WRITE_AT = 1e9, WRITE_END = 1e9;
    const openLetter = t => { if (LETTER_AT < 1e9) return; LETTER_AT = t + .3; env.audio.hit?.('letter'); env.audio.section?.('bloom'); WRITE_AT = LETTER_AT + 1.1; WRITE_END = WRITE_AT + at; env.offerNext(null); hint(null); };
    // ---------- looking at photos: tap one to take it down, tap again to hang it back ----------
    const AUTO_IDLE = 4.5, HOLD_LOOK = 5;
    let focusIdx = -1, focusAt = 0, lastInput = 0, lookE = 0; const seen = new Set();
    const hint = text => env.hint(text);
    const focus = i => { focusIdx = i; focusAt = T; if (i >= 0) { seen.add(i); env.audio.sfx('page', .3); env.audio.hit?.('photo', { index: seen.size - 1 }); if (!turnHinted) { turnHinted = true; setTimeout(() => { if (focusIdx >= 0 && !cards.some(c => c.flipped)) hint('再轻点一下，看看照片背面'); }, 1800); } } };
    // the back of a photo: a line written for her. The card squashes edge-on and opens again on its other side
    let turnHinted = false;
    function turnOver(c, on) {
      if (!c || !!c.flipped === on) return; c.flipped = on; hint(null);
      c.el.classList.remove('turning'); void c.el.offsetWidth; c.el.classList.add('turning');
      setTimeout(() => c.el.classList.toggle('flipped', on), 230);
      if (on) { lastInput = T + 4; env.audio.hit ? env.audio.hit('flip', { quantize: '8th' }) : env.audio.sfx('page', .45); }
    }
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
      if (d.i >= 0 && d.i === focusIdx && cards[d.i].e > .6) { turnOver(cards[d.i], !cards[d.i].flipped); return; } // a second tap turns the photo over
      cards.forEach(c => turnOver(c, false));
      if (d.i >= 0 && d.i !== focusIdx) focus(d.i); else if (focusIdx >= 0) focus(-1);
    };
    addEventListener('pointerup', release); addEventListener('pointercancel', release);

    let rs = 1, portrait = false, T = 0, written = 0, offered = false, folded = false, ended = false, cardShown = false, zone = null;
    // Collages, as metres on the wall: [x, y] of each frame's centre. The cluster that lets the frames hang largest on this
    // screen is used, so a phone gets a tall hang, a tablet a square one and a wide screen a broad one. The staggered row is
    // a last resort for very short screens: a collage should never read as a line.
    const HANGS = [
      { w: 1, at: [[-.2, -.6], [-.28, .02], [.26, .07], [.14, .63]] },     // tall
      { w: 1, at: [[-.23, -.31], [-.27, .3], [.27, .34], [.33, -.3]] },    // square
      { w: 1, at: [[-.5, -.27], [.08, .02], [.6, -.08], [-.62, .3]] },     // broad
      { w: .72, at: [[-.84, -.1], [-.26, .08], [.27, -.1], [.74, .1]] },   // staggered
    ];
    const metres = c => c.f.size, gap = .05;
    function hang() {
      const sf = env.safe(), zw = sf.w * .94, zh = sf.h - 12; let best = null;
      for (const { w: pref, at: H_ } of HANGS) {
        const box = [1e9, 1e9, -1e9, -1e9];
        cards.forEach((c, i) => { const [w, h] = metres(c), [x, y] = H_[i % H_.length]; box[0] = Math.min(box[0], x - w / 2); box[1] = Math.min(box[1], y - h / 2); box[2] = Math.max(box[2], x + w / 2); box[3] = Math.max(box[3], y + h / 2); });
        const k = Math.min(zw / (box[2] - box[0] + gap), zh / (box[3] - box[1] + gap));
        if (!best || k * pref > best.k * best.pref) best = { k, pref, H_, box };
      }
      const { k, H_, box } = best, cx = sf.l + sf.w / 2, cy = sf.t + sf.h / 2, mx = (box[0] + box[2]) / 2, my = (box[1] + box[3]) / 2;
      zone = { sf, k };
      cards.forEach((c, i) => {
        const [mw, mh] = metres(c), [x, y] = H_[i % H_.length], fw = 1 - 2 * c.f.pad[0], fh = 1 - 2 * c.f.pad[1], ar = c.f.w / c.f.h;
        // laid out at the size it has in her hands, so the picture stays sharp there; on the wall it is simply drawn smaller
        const top = portrait ? 60 : 0, boxW = portrait ? sf.w * .9 : sf.w * .44, boxH = portrait ? (sf.h - top) * .6 : sf.h * .94;
        const w = Math.round(Math.min(boxW / fw, boxH / fh * ar)); c.w = w; c.h = Math.round(w / ar);
        c.el.style.width = w + 'px'; c.el.style.height = c.h + 'px'; c.el.style.setProperty('--cw', w * .5 + 'px');
        c.ax = cx + (x - mx) * k; c.ay = cy + (y - my) * k; c.sw = mw * k / (w * fw);
        c.fc = portrait ? [sf.l + sf.w / 2, sf.t + top + c.h * fh / 2] : [sf.l + sf.w * .27, sf.t + sf.h / 2];   // in her hands: under the HUD, or to the left of the words
      });
    }
    function layout() {
      const W = env.W, H = env.H; portrait = env.portrait;
      rs = env.software ? .5 : .75; bg.width = Math.round(W * rs); bg.height = Math.round(H * rs);
      hang();
      // the letter stands in the free frame, above the dock, on whole pixels (the writing is never resampled)
      const sf = env.safe(), lw = Math.round(Math.min(600, sf.w * .9)), lh = Math.round(Math.min(sf.h * .97, lw * 1.34));
      letterEl.style.setProperty('--lw', lw + 'px'); letterEl.style.setProperty('--lh', lh + 'px'); letterEl.style.setProperty('--fs', Math.max(15.5, Math.min(19, lw * .042)) + 'px');
      letterEl.style.left = Math.round(sf.l + (sf.w - lw) / 2) + 'px'; letterEl.style.bottom = Math.round(sf.b + (sf.h - lh) * .35) + 'px';
    }
    layout();
    const cues = env.cues([[.8, DROP + .4, '有些日子，想和你慢慢看。']]);

    return {
      resize: layout,
      progress: () => LETTER_AT < 1e9 ? .6 + clamp((T - LETTER_AT) / (WRITE_END - LETTER_AT + 4)) * .4 : seen.size / PHOTOS.length * .6,
      update(dt, t) {
        T = t; const W = env.W, H = env.H;
        const wd = wander(t, 8.3, .8), lx = (wd.x * .6 + env.look.x) * Math.min(W, H) * .02, ly = (wd.y * .4 + env.look.y * .7) * Math.min(W, H) * .02;
        if (!cardShown) { cardShown = true; env.chapterCard('III', 1600); }
        cues(t);
        // ---------- the wall: the lamp above, and the fire's light breathing up from the left ----------
        g.setTransform(rs, 0, 0, rs, 0, 0);
        { const im = WALL.img, s0 = Math.max(W / im.width, H / im.height) * 1.05, x0 = (W - im.width * s0) / 2 - lx * .25, y0 = (H - im.height * s0) * .62 - ly * .25;
          g.drawImage(im, x0, y0, im.width * s0, im.height * s0);
          hearth.update(t, -W * .06, H * .86, Math.max(W, H) * .22, between(t, 0, 2.5) * (1 - between(t, LETTER_AT, LETTER_AT + 2) * .5)); }
        g.globalCompositeOperation = 'lighter';   // a little dust drifting through the lamplight
        for (const b of dust) { const x = ((b.x + t * b.s) % 1.1 - .05) * W - lx * .4, y = (b.y + Math.sin(t * .3 + b.p) * .02) * H - ly * .4; g.globalAlpha = b.a * (.6 + .4 * Math.sin(t * .8 + b.p)); g.drawImage(mote, x - b.r, y - b.r, b.r * 2, b.r * 2); }
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        // ---------- the photographs ----------
        // left alone, the next photo she has not seen comes forward; a photo she is looking at stays until she lets it go
        if (t > DROP && LETTER_AT >= 1e9) {
          const idle = t - Math.max(lastInput, focusAt);
          // she takes the photos down herself (only the test mode brings them forward); a photo she is looking at goes back
          // up on its own after a while, and the letter is there for her once she has looked at one or all of them
          if (env.auto && focusIdx < 0 && idle > (seen.size ? 1.6 : AUTO_IDLE) && seen.size < PHOTOS.length && t - lastInput > AUTO_IDLE) focus([...cards.keys()].find(i => !seen.has(i)));
          else if (focusIdx >= 0 && t - focusAt > (env.auto ? HOLD_LOOK : HOLD_LOOK * 1.8) && t - lastInput > HOLD_LOOK) focus(-1);
          if (t > DROP + 1.5 && !lastInput && focusIdx < 0 && !seen.size) hint('轻触一张照片，取下来看看');
          else if (!env.auto && seen.size && seen.size < PHOTOS.length && focusIdx < 0 && idle > 3.5 && !offered) hint('再取下一张看看');
          if (focusIdx < 0 && !offered && (seen.size === PHOTOS.length || (seen.size && idle > 9))) { offered = true; hint(null); env.offerNext('读一读给你的信', () => openLetter(T)); }
          if (env.auto && offered && focusIdx < 0 && t - Math.max(lastInput, focusAt) > 5) openLetter(t);
        }
        const fi = focusIdx, ft = clamp((t - focusAt) / (env.auto ? HOLD_LOOK : HOLD_LOOK * 1.8)), inFocus = fi >= 0;   // the push-in lasts as long as she looks
        lookE += ((inFocus ? 1 : 0) - lookE) * (1 - Math.exp(-dt * 3.2));
        const letterUp = between(t, LETTER_AT, LETTER_AT + 2);
        const qi = inFocus && t - focusAt > .5 ? fi : -1;
        if (qi !== quoteIdx) {
          quoteIdx = qi; quote.classList.toggle('on', qi >= 0);
          if (qi >= 0) { const p = PHOTOS[qi]; quote.querySelector('small').textContent = `0${qi + 1} / 0${PHOTOS.length}`; quote.querySelector('b').textContent = p.title; quote.querySelector('span').textContent = p.caption; }
        }
        // one photograph comes off the wall into her hands; the room dims a little behind it
        const dimTo = Math.max(lookE * .86, letterUp * .8); if (Math.abs(dimTo - (scrim._o ?? -1)) > .004) { scrim._o = dimTo; scrim.style.opacity = dimTo.toFixed(3); }
        cards.forEach(c => {
          const appear = easeOut(clamp((t - c.show) / 1.1)); if (appear > 0 && !c.landed) { c.landed = true; env.audio.sfx('page', .12); }
          c.e = (c.e || 0) + ((c.i === fi ? 1 : 0) - (c.e || 0)) * (1 - Math.exp(-dt * 3));
          const e = easeInOut(c.e), lift = Math.sin(clamp(c.e) * Math.PI);   // it swings out from the wall as it comes
          const x = lerp(c.ax - lx * .12, c.fc[0], e), y = lerp(c.ay - ly * .12 + (1 - appear) * 7, c.fc[1], e), s = lerp(c.sw * (1 + (1 - appear) * .025), 1, e), rot = lerp(c.tilt, 0, e) + lift * (c.i % 2 ? 1.1 : -1.1);
          c.el.classList.toggle('reading', e > .6); c.el.classList.toggle('develop', c.i === fi);
          if (c.e > .002) c.img.style.transform = `scale(${(1.02 + (c.i === fi ? ft * .05 : 0)).toFixed(4)})`;
          const tf = `translate(${(x - c.w / 2).toFixed(2)}px,${(y - c.h / 2).toFixed(2)}px) rotate(${rot.toFixed(3)}deg) scale(${s.toFixed(4)})`;
          if (tf !== c.tf) { c.tf = tf; c.el.style.transform = tf; }
          c.el.style.zIndex = c.e > .01 ? 5 : 1; const op = appear.toFixed(2); if (c.op !== op) { c.op = op; c.el.style.opacity = op; }
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
          if (written >= chars.length && !folded) { folded = true; env.offerNext('收好这封信', () => { ended = true; env.next({ transition: 'bloom', at: [env.W / 2, env.H * .45], tint: '255,190,120' }); }); }
          if (env.auto && folded && !ended && t > WRITE_END + 25) { ended = true; env.offerNext(null); env.next({ transition: 'bloom', at: [env.W / 2, env.H * .45], tint: '255,190,120' }); }
        }
      },
      destroy() { env.offerNext(null); removeEventListener('pointerup', release); removeEventListener('pointercancel', release); hearth.remove(); },
    };
  },
};
