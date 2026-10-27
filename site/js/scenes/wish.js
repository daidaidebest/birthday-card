// Chapter V: the falling star lights the middle candle; she carries its flame to the others (or taps a candle and the
// flame hops over to it), each with a whispered line. The candles are lit in a close-up of the cake, where every candle
// owns a column of the screen wide enough for a fingertip.
// She closes her eyes, makes a wish and blows them out. The camera pulls back into the room as the lamps come up;
// champagne-gold fireworks open slowly far beyond the window, rose petals and motes of golden light drift down, and the
// last letter appears. After the credits, a postcard to keep (../keepsake.js); then the screen goes dark and a real
// night sky closes the story.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, rng, glowSprite, sparkleSprite, TAU } from '../util.js';
import { wander } from '../depth.js';
import { Hearth, drawFire } from '../hearth.js';
import { Keepsake, Closing, alphaMask } from '../keepsake.js';

const A = {};
// The 3D cake in the study (tools/blender/study.py, Cycles), seen by two cameras: the wide shot of the room (waiting in
// the dark, and with the lamps up after the wish, plus a mask of the window glass) and a close-up of the cake for
// lighting the candles (unlit and lit). Wick tips are normalised to the frame, the glass is in render pixels; fire is
// the base centre and width of the hearth's flames (normalised) as each camera sees them; band: where shells burst, as a
// fraction of the glass's height (the portrait window has the moon high in it).
const C3 = {
  p: { w: 1080, h: 1920, glass: [897, 139, 1080, 944], band: [.5, .68],
    wide: [[.39398, .49993], [.43634, .49929], [.47754, .49896], [.51865, .49892], [.56072, .49918], [.60485, .49974]],
    close: [[.2479, .3684], [.35188, .35925], [.4492, .35461], [.54514, .35398], [.64458, .3573], [.7529, .36492]],
    fire: { wide: [.14, .688, .24], close: [.09, .44, .2] } },
  l: { w: 1440, h: 810, glass: [928, 0, 1267, 315], band: [.16, .44],
    wide: [[.43341, .40294], [.45919, .40035], [.48444, .39894], [.50994, .39862], [.53643, .39938], [.56472, .40127]],
    close: [[.3926, .36848], [.43659, .35768], [.47839, .35222], [.51975, .35163], [.56233, .35588], [.60792, .3653]],
    fire: { wide: [.269, .686, .14], close: [.258, .536, .17] } },
};
const N = 6, FIRST = 2, ORDER = [2, 3, 1, 4, 0, 5]; // the star lights a middle candle first; the hint walks outward from it
const WHISPERS = ['这一支，为你走过的那些路。', '这一支，为我们相遇的那座城。', '这一支，为隔着山海的想念。', '这一支，为一起看过的星星。', '这一支，为往后的每一天。', '最后这一支，为你。'];
const FINAL = ['今晚我在东京，|你在远方。', '隔着一片海，|和很多很多公里的夜空，', '我们看的，|是同一片星星。', '愿你一直勇敢，|也一直被爱。', '往后的每一页，|想和你一起写。']; // | : where a narrow screen may break
// after the wish (seconds after she blows): the pull back into the room, the lamps, the fireworks, the letter
const PULL = [1.4, 5], LAMPS = 3.8, FW_START = 5.6, LETTER = 7.2;
// lighting by hand: a carried flame must rest this long on a candle, and lights at most one candle per GAP
const DWELL = .14, GAP = .6, STILL = 260, AUTO_LIGHT = 5.5;   // a carried flame lights a candle only when it rests on it (finger slower than STILL px/s)
const BLUR = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

// screen transforms {s, x, y}: render pixel (px, py) -> screen (x + px * s, y + py * s)
const at = (T, x, y) => [T.x + x * T.s, T.y + y * T.s];
const then = (T, M) => ({ s: T.s * M.s, x: T.x + T.s * M.x, y: T.y + T.s * M.y });
const invert = M => ({ s: 1 / M.s, x: -M.x / M.s, y: -M.y / M.s });
const px = (f, list) => list.map(([x, y]) => [x * f.w, y * f.h]);
const mean = pts => [0, 1].map(k => pts.reduce((a, p) => a + p[k], 0) / pts.length);
// the close-up's wicks laid onto the wide shot's (scale + shift, least squares), so the pull back never jumps
function fitWicks(f) {
  const C = px(f, f.close), D = px(f, f.wide), mc = mean(C), md = mean(D); let num = 0, den = 0;
  C.forEach((p, i) => { for (const k of [0, 1]) { num += (p[k] - mc[k]) * (D[i][k] - md[k]); den += (p[k] - mc[k]) ** 2; } });
  const s = num / den; return { s, x: md[0] - s * mc[0], y: md[1] - s * mc[1] };
}
// the close-up with its edges dissolved, so it can shrink into the room as the camera pulls away
function feather(img) {
  const c = canvas(img.width, img.height), x = c.getContext('2d'), w = c.width, h = c.height; x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'destination-in';
  for (const gr of [x.createLinearGradient(0, 0, w, 0), x.createLinearGradient(0, 0, 0, h)]) {
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.22, '#000'); gr.addColorStop(.78, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
  }
  return c;
}

// a rose petal, drawn once: blush at the tip, paler toward the base, with a soft crease
function petalSprite(h, hue) {
  const w = h * .78, c = canvas(Math.ceil(w), Math.ceil(h)), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, hue[0]); gr.addColorStop(.7, hue[1]); gr.addColorStop(1, hue[2]);
  g.fillStyle = gr; g.beginPath(); g.moveTo(w / 2, h);
  g.bezierCurveTo(-w * .15, h * .6, w * .02, h * .02, w * .42, h * .06); g.quadraticCurveTo(w * .5, h * .14, w * .58, h * .06);
  g.bezierCurveTo(w * .98, h * .02, w * 1.15, h * .6, w / 2, h); g.fill();
  g.globalAlpha = .25; g.strokeStyle = hue[2]; g.lineWidth = 1; g.beginPath(); g.moveTo(w / 2, h * .95); g.quadraticCurveTo(w * .46, h * .5, w * .5, h * .14); g.stroke();
  return c;
}
const PETALS = [['#f7d3d6', '#eaa4ad', '#d9848f'], ['#fbe3e0', '#f1bcbc', '#dc9c9f'], ['#fff1ea', '#f6d6cc', '#e5b3a6']];
// fireworks far away: champagne and soft rose gold only, opening slowly into willows
const FW = ['255,226,170', '255,214,150', '255,236,205', '250,200,175'];

export default {
  id: 'wish', music: 'wish', bed: 'fire',
  async load(env) {
    if (A.c3) return;
    const k = env.portrait ? 'p' : 'l';
    const img = await Promise.all(['unlit', 'after', 'mask', 'close-unlit', 'close-lit'].map(n => loadImage(asset(`img/cake3d-${n}-${k}.webp`))))
      .then(([unlit, after, mask, cu, cl]) => ({ unlit, after, mask, cu, cl })).catch(e => { console.warn(e); return null; }); // without them: flames in a warm dark
    A.c3 = { k, ...C3[k], M: fitWicks(C3[k]), mid: mean(px(C3[k], C3[k].wide)), img };
  },
  create(env) {
    const { el, fx } = env, c3 = A.c3, I = c3.img, R = rng(13);
    el.innerHTML = `
      <div class="ws-world"><canvas class="ws-room"></canvas>
      <canvas class="full ws-cake"></canvas></div>
      <div class="ws-ui">
        <div class="ws-ask"><p class="ws-ask-line">今晚的星光，都为你亮起。</p><button class="ws-btn" type="button">闭上眼睛，许个愿 <span>✧</span></button></div>
        <div class="ws-wish"><p class="w1">闭上眼睛……</p><p class="w2">把最想实现的那个愿望，<br>悄悄放在心里。</p><i class="ws-breath"></i>
          <div class="ws-blow"><p>许好了吗？</p><button class="ws-btn" type="button" data-blow>吹灭蜡烛 <span>～</span></button><button class="ws-mic" type="button">或者，对着麦克风轻轻吹一口气</button></div></div>
        <div class="ws-final"><h1>师宝宝，生日快乐。</h1>${FINAL.map(l => `<p>${l.split('|').map(s => `<span>${s}</span>`).join('')}</p>`).join('')}
          <div class="ws-arc"><span class="me">东京<small>此刻的我</small></span><span class="you">深圳<small>我们相遇的地方</small></span></div></div>
        <div class="ws-credits"><div class="roll">
          <p class="big">师宝宝的生日童话</p><p class="rule"></p>
          <p><small>主演</small>师宝宝</p><p><small>特别出演</small>两只小泰迪</p><p><small>编剧 · 导演 · 想念</small>一个在东京的人</p>
          <p><small>魔法书、沙画、旷野与星空</small>为你一页一页画出来</p><p><small>配乐</small>为今晚写的小夜曲</p>
          <p><small>致敬</small>《哈利·波特》《小马王》《狮子王》带来的灵感</p><p><small>示意照片</small>Unsplash 的摄影师们</p>
          <p class="rule"></p><p class="big">To be continued……</p><p class="last">下一页，我们一起写。</p>
        </div></div>
      </div>`;
    const $ = s => el.querySelector(s);
    const world = $('.ws-world'), room = $('.ws-room'), sg = room.getContext('2d', { alpha: false }), cv = $('.ws-cake'), g = cv.getContext('2d');
    const top = document.createElement('canvas'); top.className = 'full ws-top'; $('.ws-ui').before(top); const tg = top.getContext('2d');
    const hearth = new Hearth(world, { z: 2 }); // after the cake canvas: firelight over the dark room, under the words
    const replay = () => { location.hash = ''; location.search = ''; location.reload(); };
    const keep = new Keepsake(el, env, { onAgain: () => wishAgain() }), closing = new Closing(el, env, { onReplay: replay });
    const glowW = glowSprite('255,196,120', 256, 1.5), glowSm = glowSprite('255,220,160', 64, 2), spark = sparkleSprite('255,236,190', 48), smokeS = glowSprite('200,196,205', 64, 1.4);
    const petalImgs = PETALS.map(c => petalSprite(48, c));
    const petals = Array.from({ length: 18 }, (_, i) => ({ c: i % PETALS.length, x: ((i * .383 + .05) % 1), st: 3 + i * 1.1 + R() * .8, sp: .7 + R() * .5, sz: .7 + R() * .6, ph: R() * TAU, spin: (R() - .5) * 1.4 }));
    const motes = Array.from({ length: 34 }, () => ({ x: R(), y: R(), v: .012 + R() * .02, p: R() * TAU, s: .5 + R() }));
    // fireworks beyond the glass (render pixels of the wide shot): shells rise, burst, and their sparks fall
    const shells = [], sparks = [], fwGlow = Object.fromEntries([...FW, '255,230,190'].map(c => [c, glowSprite(c, 32, 2.6)]));
    let flashA = 0, flashC = FW[0], nextShell = 0, fwStop = Infinity;
    const flames = Array.from({ length: N }, () => ({ lit: 0, out: 0, seed: R() * 40 }));
    const flights = [], smoke = [];
    let T = 0, phase = 'light', phaseAt = 0, lit = 0, blowAt = 0, finalAt = 0, creditsAt = 0, round = 1, step = {}, mic = null;
    let map = { s: 1, x: 0, y: 0 }, camC = map, wT = map, cT = map, rs = 1, topDirty = true, look = null, zBase = 1.02, soft = null;
    let cam = { from: 0, to: 0, at: 0, dur: 1 }, e = 0, lamp = 0, heat = 1; // e: 0 = the close-up, 1 = the wide shot of the room
    let cardOn = false, ending = false, endAt = 0, dark = false;
    const setCam = (to, dur) => { cam = { from: e, to, at: T, dur }; };

    // ---------- lighting by hand: each candle owns a column of the screen ----------
    let touch = null, carry = false, dwell = { i: -1, t: 0 }, lastLight = 0, lastCarry = -1, lastTap = -1, idleAt = 0, hinted = false, sayTimer = 0;
    const hintEl = document.createElement('p'); hintEl.className = 'ws-hint'; el.appendChild(hintEl);
    const hint = text => { if (text) hintEl.textContent = text; hintEl.classList.toggle('on', !!text); };
    const tip = i => at(cT, c3.close[i][0] * c3.w, c3.close[i][1] * c3.h);
    const spacing = () => (tip(N - 1)[0] - tip(0)[0]) / (N - 1);
    const flameSize = () => spacing() * .55;
    const column = x => { let best = 0, bd = Infinity; for (let i = 0; i < N; i++) { const d = Math.abs(tip(i)[0] - x); if (d < bd) { bd = d; best = i; } } return best; };
    const inBand = (x, y) => { const sp = spacing(), ty = tip(FIRST)[1]; return x > tip(0)[0] - sp * 1.2 && x < tip(N - 1)[0] + sp * 1.2 && y > ty - Math.max(70, sp * 1.6) && y < ty + Math.max(150, sp * 3.6); };
    const busy = i => flights.some(f => !f.done && f.i === i);
    const unlit = () => flames.map((f, i) => i).filter(i => !flames[i].lit && !busy(i));
    const nextUp = () => ORDER.find(i => !flames[i].lit && !busy(i));
    function light(i) {
      if (flames[i].lit) return; flames[i].lit = .01; lit++; lastLight = T;
      const [tx, ty] = tip(i); fx.burst(tx, ty - 8, { n: 26, speed: 70, life: 1.2, size: 1.6 }); env.audio.sfx('light', .7);
      env.say(WHISPERS[Math.min(lit, WHISPERS.length) - 1]); clearTimeout(sayTimer); sayTimer = setTimeout(() => env.say(null), 2600);
    }
    // a star from the night sky (the first one, the fallback, the relight), or the flame hopping over from a lit candle
    const launch = (i, from) => { flights.push({ i, src: -1, from: from || [env.W * (.55 + R() * .4), -20], st: T, dur: 1.15, done: false }); lastLight = T; };
    function hop(i) {
      const src = flames.map((f, j) => j).filter(j => flames[j].lit > .3).sort((a, b) => Math.abs(a - i) - Math.abs(b - i))[0];
      if (src == null) return launch(i);
      flights.push({ i, src, st: T, dur: .55, done: false }); lastLight = T; env.audio.sfx('sparkle', .25);
    }
    // a tap lights exactly one candle: the one in that column, or the waiting one nearest to it
    function tapAt(x, y) {
      if (!inBand(x, y) || T - lastTap < .25) return;
      const c = column(x), free = unlit(); if (!free.length) return;
      lastTap = T; hop(free.includes(c) ? c : free.reduce((b, j) => Math.abs(j - c) < Math.abs(b - c) ? j : b));
    }
    cv.addEventListener('pointerdown', e => {
      if (phase !== 'light' || !e.isPrimary) return;
      const x = e.clientX, y = e.clientY; hint(null); idleAt = T;
      touch = { id: e.pointerId, x, y, x0: x, y0: y, moved: false, finger: e.pointerType !== 'mouse' };
      if (inBand(x, y) && flames[column(x)].lit > .3) { carry = true; dwell = { i: column(x), t: T }; env.audio.sfx('sparkle', .2); }
    });
    const onMove = e => { if (!touch || e.pointerId !== touch.id) return; touch.x = e.clientX; touch.y = e.clientY; if (Math.hypot(touch.x - touch.x0, touch.y - touch.y0) > 12) touch.moved = true; idleAt = T; };
    const onUp = e => {
      if (!touch || e.pointerId !== touch.id) return; const tp = touch; touch = null; carry = false; dwell = { i: -1, t: 0 }; idleAt = T;
      if (e.type === 'pointerup' && !tp.moved && phase === 'light') tapAt(tp.x0, tp.y0);
    };
    addEventListener('pointermove', onMove, { passive: true }); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);

    function layout() {
      const W = env.W, H = env.H;
      rs = env.res(true); top.width = Math.round(W * rs); top.height = Math.round(H * rs); cv.width = Math.round(W * env.dpr); cv.height = Math.round(H * env.dpr);
      room._r = env.res(true); room._at = -1; // a resized canvas is blank: repaint on the next frame
      const s = Math.max(W / c3.w, H / c3.h); map = { s, x: (W - c3.w * s) / 2, y: (H - c3.h * s) / 2 };
      // the room canvas spans the whole frame (wider than the screen) so the lean toward the window never shows an edge
      { const rw = c3.w * s, rh = c3.h * s, rr = room._r; room.width = Math.round(rw * rr); room.height = Math.round(rh * rr);
        Object.assign(room.style, { position: 'absolute', left: map.x + 'px', top: map.y + 'px', width: rw + 'px', height: rh + 'px' }); }
      // never closer than a fingertip: on a small landscape phone the close-up leans in until the candles are 46 px apart
      const sp0 = (c3.close[N - 1][0] - c3.close[0][0]) * c3.w * s / (N - 1); zBase = Math.max(1.02, 46 / sp0);
      el.classList.toggle('land', !env.portrait);
      // after the wish the room leans toward the window (a CSS transform on the world), never so far that an edge shows
      const [x0, y0, x1, y1] = c3.glass, wcx = map.x + (x0 + x1) / 2 * s, wcy = map.y + (y0 + y1) / 2 * s, z = 1.18, rw = c3.w * s, rh = c3.h * s;
      const fit = (want, o, z, lo, len, view) => { const a = view - o - z * (lo + len - o), b = -o - z * (lo - o); return a > b ? (a + b) / 2 : clamp(want, a, b); };
      const tx = fit(W / 2 - wcx, wcx, z, map.x, rw, W), ty = fit(H * .48 - wcy, wcy, z, map.y, rh, H);
      look = { tx, ty, z, ox: wcx, oy: wcy };
      el.style.setProperty('--look', `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${z.toFixed(3)})`);
      el.style.setProperty('--look-origin', `${wcx.toFixed(1)}px ${wcy.toFixed(1)}px`);
      keep.layout(W, H);
    }
    layout();

    function startWish() { if (phase !== 'ask') return; phase = 'wish'; phaseAt = T; el.classList.add('wishing'); el.classList.remove('asking'); env.audio.duck(.4, 2.5); env.pups.set('quiet'); }
    function blow() {
      if (phase !== 'wish' || T - phaseAt < 5) return;
      phase = 'blown'; blowAt = T; step = {}; fwStop = Infinity; el.classList.remove('wishing', 'w-close', 'w-heart', 'w-breath', 'w-ready'); el.classList.add('blown');
      env.audio.sfx('blow', 1); stopMic();
      if (I && !soft) soft = feather(I.cu);
      keep.prepare(); closing.prepare(); // the postcard and the night sky get ready while the fireworks play
    }
    function wishAgain() {
      if (ending) return;
      keep.hide(); cardOn = false; round++; fwStop = T;
      flames.forEach(f => { f.lit = 0; f.out = 0; }); flights.length = 0; smoke.length = 0; lit = 0;
      phase = 'relight'; phaseAt = T; setCam(0, 2.6);
      el.classList.remove('blown', 'final', 'credits', 'look', 'keepsake', 'asking'); env.audio.cue('wish', 2); env.pups.set('party');
    }
    function showCard() { cardOn = true; fwStop = Math.min(fwStop, T + 3); el.classList.add('keepsake'); keep.show(T); env.pups.set(null); env.say(null); }
    function startEnding() {
      ending = true; endAt = T; closing.start(T); env.pups.set(null); env.say(null); hint(null);
      env.audio.duck(.32, 5); env.audio.bed(null, 6); // leaving the room: the fire's crackle goes, the music sinks low
    }
    async function startMic(btn) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = env.audio.ctx || new (window.AudioContext || window.webkitAudioContext)();
        const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
        mic = { stream, an, buf: new Uint8Array(an.fftSize), loud: 0 }; btn.textContent = '对着麦克风，轻轻吹……';
      } catch { btn.textContent = '麦克风没有打开，点一下按钮也可以'; }
    }
    function stopMic() { mic?.stream.getTracks().forEach(t => t.stop()); mic = null; }
    $('.ws-ask .ws-btn').addEventListener('click', startWish);
    $('[data-blow]').addEventListener('click', blow);
    $('.ws-mic').addEventListener('click', e => startMic(e.currentTarget));
    cv.addEventListener('click', () => { if (phase === 'wish') blow(); });

    // ---------- fireworks: shells rise beyond the glass and open into slow willows ----------
    const screenX = x => { let sx = wT.x + x * wT.s; if (look && el.classList.contains('look')) sx = look.ox + look.z * (sx - look.ox) + look.tx; return clamp(sx / env.W); };
    function stepFireworks(t, k, sdt) {
      const [wx, wy, x1, y1] = c3.glass, ww = x1 - wx, wh = y1 - wy;
      if (phase === 'blown' && k > FW_START && t > nextShell && t < fwStop && k < 70) {
        const sh = { x: wx + ww * (.2 + R() * .6), y: wy + wh * 1.05, ty: wy + wh * lerp(c3.band[0], c3.band[1], R()), col: FW[(R() * FW.length) | 0], big: .75 + R() * .35 };
        shells.push(sh); nextShell = t + 2.2 + R() * 2.6; env.audio.firework?.(screenX(sh.x), 'launch', sh.big);
      }
      for (let i = shells.length - 1; i >= 0; i--) {
        const sh = shells[i]; sh.y += (sh.ty - sh.y) * Math.min(1, sdt * 2.6); sparks.push({ x: sh.x, y: sh.y, vx: 0, vy: 0, life: .5, max: .5, col: '255,230,190', tr: true });
        if (sh.y - sh.ty < 2) {
          shells.splice(i, 1); const n = 64, r = Math.min(Math.max(ww, wh * .6), ww * 1.1) * (.2 + .1 * sh.big);
          for (let j = 0; j < n; j++) { const a = j / n * TAU, q = .75 + R() * .25; sparks.push({ x: sh.x, y: sh.y, vx: Math.cos(a) * q * r * 1.5, vy: Math.sin(a) * q * r * 1.5, life: 2.8 + R() * 1.2, max: 3.6, col: sh.col }); }
          flashA = .45 * sh.big; flashC = sh.col; env.audio.firework?.(screenX(sh.x), 'burst', sh.big);
        }
      }
    }
    function drawSparks(gw, t, sdt, unit = 1) {
      gw.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]; p.life -= sdt; if (p.life <= 0) { sparks.splice(i, 1); continue; }
        p.vx *= Math.pow(.3, sdt); p.vy = p.vy * Math.pow(.3, sdt) + 14 * unit * sdt; p.x += p.vx * sdt; p.y += p.vy * sdt;
        const u = p.life / p.max, sz = (p.tr ? 5 : 9) * unit * (.45 + u), tw = p.tr ? 1 : .6 + .4 * Math.sin(t * 30 + i);
        gw.globalAlpha = Math.min(1, u * 1.6) * tw; gw.drawImage(fwGlow[p.col] || glowSm, p.x - sz, p.y - sz, sz * 2, sz * 2);
        gw.fillStyle = '#fff8e8'; const c = sz * .16; gw.fillRect(p.x - c, p.y - c, c * 2, c * 2);
      }
      gw.globalAlpha = 1; gw.globalCompositeOperation = 'source-over';
    }

    // ---------- the room: the close-up and the wide shot, cross-faded while the camera pulls back ----------
    const glassCv = canvas(1, 1), glassG = glassCv.getContext('2d'), glassA = I && alphaMask(I.mask, c3.glass, c3);
    const blit = (img, T, a) => { if (!img || a <= .004) return; sg.globalAlpha = Math.min(1, a); sg.drawImage(img, T.x, T.y, c3.w * T.s, c3.h * T.s); };
    function paint(t, rr) {
      const W = env.W, H = env.H;
      sg.setTransform(rr, 0, 0, rr, -map.x * rr, -map.y * rr); sg.globalAlpha = 1; sg.globalCompositeOperation = 'source-over';
      const litK = flames.reduce((a, f) => a + f.lit * (1 - f.out), 0) / N, closeA = 1 - between(e, .3, .8), plainA = 1 - between(e, 0, .18);
      if (!I) { const gr = sg.createRadialGradient(W / 2, H * .45, 0, W / 2, H * .45, Math.max(W, H) * .8); gr.addColorStop(0, '#3a2414'); gr.addColorStop(1, '#07050a'); sg.fillStyle = gr; sg.fillRect(0, 0, W, H); }
      if (I && closeA < 1) { blit(I.unlit, wT, 1); blit(I.after, wT, lamp); }
      // fireworks, far beyond the glass: kept only where the mask is glass (the tower and the mullions stand in front)
      if (sparks.length || shells.length || phase === 'blown') {
        const sdt = Math.min(.1, t - (room._fwAt ?? t)); room._fwAt = t; stepFireworks(t, t - blowAt, sdt);
        if (sparks.length) {
          const [x0, y0, x1, y1] = c3.glass, sc = rr * wT.s, gw = Math.max(2, Math.ceil((x1 - x0) * sc)), gh = Math.max(2, Math.ceil((y1 - y0) * sc));
          if (glassCv.width !== gw || glassCv.height !== gh) { glassCv.width = gw; glassCv.height = gh; }
          glassG.setTransform(1, 0, 0, 1, 0, 0); glassG.globalCompositeOperation = 'source-over'; glassG.globalAlpha = 1; glassG.clearRect(0, 0, gw, gh);
          glassG.setTransform(sc, 0, 0, sc, -x0 * sc, -y0 * sc); drawSparks(glassG, t, sdt, c3.h / 1300);
          if (glassA) { glassG.setTransform(1, 0, 0, 1, 0, 0); glassG.globalCompositeOperation = 'destination-in'; glassG.drawImage(glassA, 0, 0, gw, gh); glassG.globalCompositeOperation = 'source-over'; }
          sg.globalAlpha = 1; sg.drawImage(glassCv, wT.x + x0 * wT.s, wT.y + y0 * wT.s, (x1 - x0) * wT.s, (y1 - y0) * wT.s);
        }
      }
      if (I && closeA > 0) {
        if (plainA < 1 && soft) blit(soft, cT, closeA);
        blit(I.cu, cT, closeA * (soft ? plainA : 1));
        blit(I.cl, cT, closeA * litK);
      }
      sg.globalAlpha = 1;
      // the hearth: living flame over the rendered fire (as each camera sees it), and its light breathing over the room
      if (I) {
        const fc = c3.fire.close, fw = c3.fire.wide, wa = 1 - closeA;
        const [cx, cy] = at(cT, fc[0] * c3.w, fc[1] * c3.h), cw = fc[2] * c3.w * cT.s, [wx, wy] = at(wT, fw[0] * c3.w, fw[1] * c3.h), ww = fw[2] * c3.w * wT.s;
        if (closeA > .01) { if (BLUR) sg.filter = `blur(${(cw * .035 * rr).toFixed(1)}px)`; drawFire(sg, cx, cy, cw, t, closeA * heat * .9); if (BLUR) sg.filter = 'none'; } // out of focus, like the rendered fire
        if (wa > .01) drawFire(sg, wx, wy, ww, t, wa * heat, 3);
        hearth.update(t, lerp(cx, wx, wa), lerp(cy, wy, wa), lerp(cw, ww, wa), .62 * heat);
      }
    }

    return {
      resize: layout,
      debug: () => ({ phase, lit, e: +e.toFixed(3), lamp: +lamp.toFixed(2), card: cardOn, ending, shells: shells.length, sparks: sparks.length, spacing: +spacing().toFixed(1), tips: flames.map((f, i) => [...tip(i).map(v => +v.toFixed(1)), +f.lit.toFixed(2)]), sealed: keep.sealed, saved: keep.savedAt }),
      progress: () => ending || cardOn ? 1 : phase === 'light' ? T / 60 : phase === 'blown' ? .7 + clamp((T - blowAt) / 60) * .3 : .5,
      update(dt, t) {
        T = t; const W = env.W, H = env.H;
        if (!this.started) { this.started = true; env.chapterCard('V', 1700); env.pups.set('party'); }
        if (ending) {
          closing.update(dt, t);
          if (!dark && t - endAt > 4.2) { dark = true; hearth.hide(); el.classList.add('ended'); } // the room has gone: only the night sky remains
          if (dark) return;
          heat = 1 - between(t - endAt, 0, 3.5);
        }
        keep.update(dt, t);
        // ---------- camera ----------
        e = lerp(cam.from, cam.to, easeInOut(clamp((t - cam.at) / cam.dur)));
        lamp += ((phase === 'blown' && t - blowAt > LAMPS ? 1 : 0) - lamp) * (1 - Math.exp(-dt * .9));
        const wd = wander(t, 2.3, .8), calm = phase === 'wish' ? .35 : 1, lx = (wd.x * 4 + env.look.x * 7) * calm, ly = (wd.y * 3 + env.look.y * 5) * calm;
        { // the close-up: a slow push toward the candles (the wicks stay put under her finger), leaning in while she wishes
          const z = zBase + .035 * easeInOut(between(t, 0, 24)) + (phase === 'wish' ? .03 * between(t - phaseAt, 0, 6) : 0);
          const [fx0, fy0] = at(map, ...mean(px(c3, c3.close)));
          camC = { s: map.s * z, x: fx0 - (fx0 - map.x) * z + lx, y: fy0 - (fy0 - map.y) * z + ly };
        }
        const zW = 1.02 + .02 * (phase === 'blown' ? between(t - blowAt, PULL[1], 40) : 0), camW = { s: map.s * zW, x: W / 2 - (W / 2 - map.x) * zW + lx, y: H / 2 - (H / 2 - map.y) * zW + ly };
        if (env.reduced) { wT = camW; cT = camC; } // no flight through the room: the two shots simply cross-fade
        else { // the wide shot starts scaled so its cake lies on the close-up's, then settles into place
          const A0 = then(camC, invert(c3.M)), s = A0.s ** (1 - e) * camW.s ** e, [mx, my] = c3.mid, P0 = at(A0, mx, my), P1 = at(camW, mx, my);
          const raw = { s, x: lerp(P0[0], P1[0], e) - mx * s, y: lerp(P0[1], P1[1], e) - my * s };
          cT = then(raw, c3.M); wT = { s, x: clamp(raw.x, W - c3.w * s, 0), y: clamp(raw.y, H - c3.h * s, 0) };
        }
        { const rr = room._r, due = t - (room._at ?? -1) >= 1 / 31 || room._w !== room.width; if (due) { room._at = t; room._w = room.width; paint(t, rr); } }

        // ---------- candlelight and the dark ----------
        g.setTransform(env.dpr, 0, 0, env.dpr, 0, 0); g.clearRect(0, 0, W, H);
        tg.setTransform(rs, 0, 0, rs, 0, 0); if (topDirty || phase === 'blown') { tg.clearRect(0, 0, W, H); topDirty = phase === 'blown'; }
        const warm = flames.reduce((a, f) => a + f.lit * (1 - f.out), 0) / N, fs = flameSize(), sp = spacing();
        const darkness = .55 * (phase === 'wish' ? .45 + between(t - phaseAt, 0, 2.5) * .4 : phase === 'blown' ? lerp(.8, .22, between(t - blowAt, LAMPS - .3, LAMPS + 3.7)) : .62 - warm * .3);
        // warm pool of light around the candles
        { const [mx, my] = tip(FIRST), r = sp * 4.6; g.globalCompositeOperation = 'lighter'; g.globalAlpha = warm * .28 * (.92 + Math.sin(t * 9) * .05); g.drawImage(glowW, mx - r, my - r * .7, r * 2, r * 1.6); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
        // the room falls into shadow except where the candles reach
        if (phase === 'blown') { tg.fillStyle = `rgba(5,5,14,${darkness.toFixed(3)})`; tg.fillRect(0, 0, W, H); } // the leaning world no longer covers the screen edges
        else {
          const [lx0, ly0] = tip(FIRST), reach = Math.max(W, H) * (.25 + warm * .45), dg = g.createRadialGradient(lx0, ly0, 0, lx0, ly0, reach);
          dg.addColorStop(0, `rgba(5,5,14,${(darkness * (1 - warm * .85)).toFixed(3)})`); dg.addColorStop(.55, `rgba(5,5,14,${(darkness * (1 - warm * .4)).toFixed(3)})`); dg.addColorStop(1, `rgba(5,5,14,${darkness.toFixed(3)})`);
          g.fillStyle = dg; g.fillRect(0, 0, W, H);
        }

        // ---------- lighting the candles ----------
        if (phase === 'light' || phase === 'relight') {
          // the star from the night sky lights the first candle; then the rest are hers to light
          if (!flights.length && !lit && t > (env.handoff ? 1.1 : .6) && phase === 'light') launch(FIRST, env.handoff || [W / 2, -20]); // the falling star, come through from the last chapter
          const nx = nextUp();
          if (phase === 'relight' && t - phaseAt > 2.6 && t - lastLight > .5 && nx != null) launch(nx);
          if (phase === 'light' && lit >= 1 && nx != null) {
            if (!hinted && t - Math.max(lastLight, idleAt) > 2.4 && !touch) { hinted = true; hint('把烛火带给下一支蜡烛，或轻点它'); }
            if (t - Math.max(lastLight, idleAt) > AUTO_LIGHT && !touch) launch(nx);
            // a soft ring breathing round the candle that is waiting next
            const a = between(t - Math.max(lastLight, idleAt), .9, 1.9) * (flights.some(f => !f.done) ? 0 : 1);
            if (a > 0) {
              const [x, y] = tip(nx), r = sp * .42, k = env.reduced ? .35 : (t * .7) % 1;
              g.globalCompositeOperation = 'lighter'; g.globalAlpha = a * .35; g.drawImage(glowSm, x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6);
              g.lineWidth = 1.4; g.strokeStyle = `rgba(255,226,170,${(a * .55).toFixed(3)})`; g.beginPath(); g.arc(x, y - fs * .15, r, 0, TAU); g.stroke();
              g.strokeStyle = `rgba(255,226,170,${(a * .5 * (1 - k)).toFixed(3)})`; g.beginPath(); g.arc(x, y - fs * .15, r * (1 + k * .7), 0, TAU); g.stroke();
              g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
            }
          }
          flights.forEach(f => {
            if (f.done) return; const u = clamp((t - f.st) / f.dur), [tx, ty] = tip(f.i);
            let x, y;
            if (f.src >= 0) { const [sx, sy] = tip(f.src), lift = Math.abs(f.i - f.src) * sp * .35 + fs; x = lerp(sx, tx, easeInOut(u)); y = lerp(sy - fs * .6, ty - fs * .3, easeInOut(u)) - Math.sin(u * Math.PI) * lift; }
            else { x = lerp(f.from[0], tx, easeInOut(u)) + Math.sin(u * Math.PI) * 60 * (f.i % 2 ? 1 : -1); y = lerp(f.from[1], ty - 10, easeInOut(u)) - Math.sin(u * Math.PI) * 30; }
            g.globalCompositeOperation = 'lighter'; g.drawImage(spark, x - 14, y - 14, 28, 28); g.globalCompositeOperation = 'source-over';
            if (Math.random() < .9) fx.trail(x, y, { life: 1.1, size: 1.6 });
            if (u >= 1) { f.done = true; if (phase === 'relight') { flames[f.i].lit = .01; lit++; lastLight = t; env.audio.sfx('light', .5); } else light(f.i); }
          });
          // pick the flame up when her finger passes over a lit candle
          if (touch && !carry && phase === 'light' && inBand(touch.x, touch.y) && flames[column(touch.x)].lit > .3) { carry = true; dwell = { i: column(touch.x), t }; env.audio.sfx('sparkle', .2); }
          // a flame carried just above her fingertip: it lights one candle at a time, once it has rested on it a moment
          if (carry && touch) {
            const cx = touch.x, cy = touch.y - (touch.finger ? 34 : 0);
            drawFlame(g, cx, cy, fs * .75, t, 3, 0, 1);
            if (Math.random() < .7) fx.trail(cx, cy - 6, { life: .9, size: 1.3, vy: -20 });
            const i = inBand(touch.x, touch.y) ? column(touch.x) : -1;
            const sp = dwell.x == null ? 0 : Math.hypot(touch.x - dwell.x, touch.y - dwell.y) / Math.max(dt, 1e-3); dwell.x = touch.x; dwell.y = touch.y;
            if (i !== dwell.i || sp > STILL) dwell = { i, t, x: touch.x, y: touch.y };   // sweeping across does nothing: she has to pause on a candle
            else if (i >= 0 && !flames[i].lit && !busy(i) && t - dwell.t >= DWELL && t - lastCarry >= GAP) { lastCarry = t; light(i); }
          }
          if (lit >= N && phase === 'light' && t - lastLight > 1.9) { phase = 'ask'; phaseAt = t; el.classList.add('asking'); carry = false; touch = null; hint(null); }
          if (lit >= N && phase === 'relight' && t - lastLight > 1.5) { phase = 'ask'; phaseAt = t; el.classList.add('asking'); }
        }
        if (phase === 'ask' && t - phaseAt > 18) startWish(); // let the moment happen on its own if nobody taps
        if (phase === 'wish') {
          const k = t - phaseAt; el.classList.toggle('w-close', k > .2); el.classList.toggle('w-heart', k > 2); el.classList.toggle('w-breath', k > 3.6); el.classList.toggle('w-ready', k > 5);
          if (mic && k > 5) {
            mic.an.getByteTimeDomainData(mic.buf); let sum = 0; for (const v of mic.buf) sum += (v - 128) ** 2; const rms = Math.sqrt(sum / mic.buf.length);
            mic.loud = rms > 18 ? mic.loud + dt : Math.max(0, mic.loud - dt); if (mic.loud > .25) blow();
          }
          if (k > 22) blow();
        }
        flames.forEach((f, i) => {
          if (f.lit > 0) f.lit = Math.min(1, f.lit + dt * 2.2);
          if (phase === 'blown') { const st = blowAt + .35 + i * .09; if (t > st && f.out < 1) { if (f.out === 0) for (let k = 0; k < 26; k++) smoke.push({ i, age: -k * .07, p: Math.random() * TAU }); f.out = Math.min(1, f.out + dt * 5); } }
          const a = f.lit * (1 - f.out); if (a <= 0) return;
          const [x, y] = tip(i), lean = phase === 'blown' ? between(t, blowAt, blowAt + .35) * 14 : 0;
          drawFlame(g, x, y, fs * (.4 + .6 * a), t, f.seed, lean, a);
        });
        // smoke wisps curling up
        for (let k = smoke.length - 1; k >= 0; k--) {
          const s = smoke[k]; s.age += dt; if (s.age > 3.2) { smoke.splice(k, 1); continue; } if (s.age < 0) continue;
          const [x, y] = tip(s.i), u = s.age / 3.2, sc = fs / 16;
          g.globalAlpha = (1 - u) * .22; const r = (2 + u * 12) * sc;
          g.drawImage(smokeS, x + Math.sin(s.age * 3 + s.i) * 10 * u * sc + Math.sin(s.age * 7 + s.p) * 2 - r, y - 8 * sc - u * 120 * sc - r, r * 2, r * 2);
        }
        g.globalAlpha = 1;

        // ---------- after the wish ----------
        if (phase === 'blown') {
          const k = t - blowAt;
          if (k > .3 && !step.pups) { step.pups = 1; env.pups.set('tender'); }
          if (k > .7 && !step.dust) { step.dust = 1; const [x, y] = tip(FIRST); fx.burst(x, y - 20, { n: 50, speed: 60, life: 2.6, size: 1.6, color: '255,226,170' }); } // a breath of golden dust where the flames were
          if (k > 1.2 && !step.music) { step.music = 1; env.audio.cue('finale', 3); }
          if (k > PULL[0] && !step.pull) { step.pull = 1; setCam(1, PULL[1] - PULL[0]); }
          if (k > PULL[1] && !step.look) { step.look = 1; el.classList.add('look'); }
          if (round === 1 && k > LETTER && !step.final) { step.final = 1; el.classList.add('final'); finalAt = t; }
          if (round > 1 && k > 12 && !cardOn) showCard(); // she has read the letter once: the second wish goes straight to her postcard
          // the fireworks' light flickers over the room
          if (flashA > .01) { tg.globalCompositeOperation = 'lighter'; tg.fillStyle = `rgba(${flashC},${(flashA * .09).toFixed(3)})`; tg.fillRect(0, 0, W, H); tg.globalCompositeOperation = 'source-over'; flashA *= Math.pow(.02, dt); }
          // a few rose petals drifting down through the room, and motes of golden light hanging in the air
          if (!env.reduced) {
            const kp = k - (PULL[1] - 2);
            tg.globalCompositeOperation = 'lighter';
            motes.forEach(m => { const a = between(kp, 2, 6) * (.35 + .65 * Math.sin(t * .9 * m.s + m.p) ** 2) * (cardOn ? .5 : 1); const x = (m.x + Math.sin(t * .15 + m.p) * .04) * W, y = ((m.y - t * m.v) % 1 + 1) % 1 * H, sz = 7 * m.s; tg.globalAlpha = a * .45; tg.drawImage(glowSm, x - sz, y - sz, sz * 2, sz * 2); });
            tg.globalCompositeOperation = 'source-over';
            petals.forEach(p => {
              const u = (kp - p.st) * .05 * p.sp; if (u < 0 || u > 1.2) return;
              const sz = Math.min(W, H) * .045 * p.sz, x = W * (.05 + p.x * .9) + Math.sin(kp * .8 + p.ph) * sz * 1.4, y = -sz + u * (H + sz * 2);
              const flip = Math.cos(kp * 1.6 + p.ph), rot = p.ph + kp * p.spin + Math.sin(kp * 1.1 + p.ph) * .5;
              tg.save(); tg.translate(x, y); tg.rotate(rot); tg.scale(Math.max(.15, Math.abs(flip)), 1); tg.globalAlpha = .92 * clamp(u * 10) * clamp((1.2 - u) * 6);
              tg.drawImage(petalImgs[p.c], -sz * .39, -sz / 2, sz * .78, sz); tg.restore();
            });
          }
          tg.globalAlpha = 1;
          if (step.final && !cardOn) {
            const kf = t - finalAt, lines = el.querySelectorAll('.ws-final p'); lines.forEach((p, i) => p.classList.toggle('on', kf > 1.2 + i * 2.4));
            const end = 1.2 + FINAL.length * 2.4, arcK = between(kf, end + .4, end + 2.4); el.querySelector('.ws-arc').style.setProperty('--k', arcK.toFixed(3));
            if (arcK > 0 && !el.classList.contains('credits')) drawArc(tg, el.querySelector('.ws-arc'), arcK, t);
            if (kf > end + 6.5 && !el.classList.contains('credits')) { el.classList.add('credits'); creditsAt = t; }
            // the postcard comes once the last credit has drifted up past the top third of the screen
            if (el.classList.contains('credits') && t - creditsAt > 6 && (t - creditsAt > 30 || $('.roll .last').getBoundingClientRect().bottom < H * .3)) showCard();
          }
        }
        // ---------- the postcard, then the dark ----------
        if (cardOn && !ending) {
          const quiet = !shells.length && sparks.length < 4; // the fireworks have faded
          if (keep.savedAt != null && t - keep.savedAt > 3.2 && quiet) startEnding();
          else if (t - keep.touchedAt > (keep.sealed ? 50 : 75)) startEnding(); // she never taps: let it end gently anyway
        }
      },
      destroy() {
        stopMic(); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
        hearth.remove(); keep.remove(); closing.remove();
      },
    };

    function drawArc(g, box, k, t) {
      const me = box.querySelector('.me').getBoundingClientRect(), you = box.querySelector('.you').getBoundingClientRect();
      const ax = me.left + me.width / 2, ay = me.top - 8, bx = you.left + you.width / 2, by = you.top - 8, mx = (ax + bx) / 2, my = Math.min(ay, by) - Math.abs(bx - ax) * .32;
      g.save(); g.strokeStyle = 'rgba(255,224,170,.85)'; g.lineWidth = 1.4; g.setLineDash([4, 6]); g.lineDashOffset = -t * 20; g.beginPath();
      const N = 60; for (let i = 0; i <= N * k; i++) { const u = i / N, x = (1 - u) * (1 - u) * ax + 2 * (1 - u) * u * mx + u * u * bx, y = (1 - u) * (1 - u) * ay + 2 * (1 - u) * u * my + u * u * by; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke(); g.setLineDash([]);
      g.globalCompositeOperation = 'lighter';
      for (const [x, y] of [[ax, ay], [bx, by]]) g.drawImage(spark, x - 16, y - 16, 32, 32);
      if (k >= 1) { const hx = mx, hy = (ay + by) / 2 - Math.abs(bx - ax) * .16, s = 16 + Math.sin(t * 3) * 2; g.fillStyle = '#ffb3a8'; g.globalAlpha = .9; heartPath(g, hx, hy, s); g.fill(); g.globalAlpha = .5; g.drawImage(glowW, hx - 40, hy - 40, 80, 80); }
      g.restore();
    }
  },
};
function heartPath(g, x, y, s) { g.beginPath(); for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU; const hx = 16 * Math.pow(Math.sin(a), 3), hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); i ? g.lineTo(x + hx * s / 16, y + hy * s / 16) : g.moveTo(x + hx * s / 16, y + hy * s / 16); } g.closePath(); }
function drawFlame(g, x, y, s, t, seed, lean, a) {
  const f = 1 + Math.sin(t * 13 + seed) * .07 + Math.sin(t * 7.1 + seed * 3) * .05, sway = Math.sin(t * 3.3 + seed) * s * .07 + lean * s * .06;
  g.save(); g.translate(x, y); g.globalAlpha = a;
  g.globalCompositeOperation = 'lighter';
  const halo = g.createRadialGradient(0, -s * .5, 0, 0, -s * .5, s * 3.2); halo.addColorStop(0, 'rgba(255,200,120,.45)'); halo.addColorStop(1, 'rgba(255,160,80,0)');
  g.fillStyle = halo; g.fillRect(-s * 3.2, -s * 3.7, s * 6.4, s * 6.4);
  const gr = g.createRadialGradient(0, -s * .38, 0, 0, -s * .5, s * .95);
  gr.addColorStop(0, 'rgba(255,253,235,1)'); gr.addColorStop(.3, 'rgba(255,214,130,.95)'); gr.addColorStop(.75, 'rgba(255,140,50,.55)'); gr.addColorStop(1, 'rgba(255,100,30,0)');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, s * .12); g.bezierCurveTo(-s * .36, -s * .1, -s * .2 + sway, -s * .8 * f, sway * 1.8, -s * 1.3 * f); g.bezierCurveTo(s * .2 + sway, -s * .8 * f, s * .36, -s * .1, 0, s * .12); g.fill();
  g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(90,120,255,.35)'; g.beginPath(); g.ellipse(0, 0, s * .12, s * .16, 0, 0, TAU); g.fill();
  g.restore();
}
