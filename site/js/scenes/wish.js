// Chapter V: the falling star lights the first candle; she carries its flame to the others (or taps
// a candle and a star flies in to light it), each with a whispered line.
// She closes her eyes, makes a wish and blows them out. In the hush, champagne-gold fireworks open slowly far beyond
// the window, a few rose petals and motes of golden light drift down through the room, and the last letter appears.
import { asset, loadImage, canvas, clamp, lerp, between, win, easeInOut, easeOut, rng, glowSprite, sparkleSprite, TAU, wait } from '../util.js';
import { loadCake, CANDLES, CAKE_W, CAKE_H, FLAME } from './cake.js';
import { loadDepth, DepthView, wander } from '../depth.js';
import { studyLights, studySteam, behindGlass, loadGlass, glassRect } from './study-glow.js';
import { loadClip, play, stop, drawable } from '../video.js';

const A = {};
const glassBox = name => { const [x0, y0, x1, y1] = glassRect(name); return { x0, y0, x1, y1 }; };
const N = CANDLES.length, FIRST = Math.floor((N - 1) / 2); // the star lights a middle candle first
const WHISPERS = ['这一支，为你走过的那些路。', '这一支，为我们相遇的那座城。', '这一支，为隔着山海的想念。', '这一支，为一起看过的星星。', '这一支，为往后的每一天。', '最后这一支，为你。'];
const FINAL = ['今晚我在东京，你在远方。', '隔着一片海，和很多很多公里的夜空，', '我们看的，是同一片星星。', '愿你一直勇敢，也一直被爱。', '往后的每一页，想和你一起写。'];

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
  id: 'wish', music: 'wish',
  async load(env) {
    if (!env.reduced && A.room === undefined) A.room = await loadClip(env.portrait ? 'studyp' : 'study'); // the same filmed room as the book
    const [land, port, glassL, glassP] = await Promise.all([loadImage(asset('img/study-land.webp')), loadImage(asset('img/study-port.webp')), loadGlass('study-land'), loadGlass('study-port')]);
    Object.assign(A, { land, port, glassL, glassP }); if (!A.cake) A.cake = gradeCake(await loadCake());
    [A.dLand, A.dPort] = await Promise.all([loadDepth('study-land'), loadDepth('study-port')]);
  },
  create(env) {
    const { el, fx } = env;
    el.innerHTML = `
      <div class="ws-world"><canvas class="ws-room"></canvas>
      <canvas class="full ws-cake"></canvas></div>
      <div class="ws-ui">
        <div class="ws-ask"><p class="ws-ask-line">今晚的星光，都为你亮起。</p><button class="ws-btn" type="button">闭上眼睛，许个愿 <span>✧</span></button></div>
        <div class="ws-wish"><p class="w1">闭上眼睛……</p><p class="w2">把最想实现的那个愿望，<br>悄悄放在心里。</p><i class="ws-breath"></i>
          <div class="ws-blow"><p>许好了吗？</p><button class="ws-btn" type="button" data-blow>吹灭蜡烛 <span>～</span></button><button class="ws-mic" type="button">或者，对着麦克风轻轻吹一口气</button></div></div>
        <div class="ws-final"><h1>师宝宝，生日快乐。</h1>${FINAL.map(l => `<p>${l}</p>`).join('')}
          <div class="ws-arc"><span class="me">东京<small>此刻的我</small></span><span class="you">深圳<small>我们相遇的地方</small></span></div></div>
        <div class="ws-credits"><div class="roll">
          <p class="big">师宝宝的生日童话</p><p class="rule"></p>
          <p><small>主演</small>师宝宝</p><p><small>特别出演</small>两只小泰迪</p><p><small>编剧 · 导演 · 想念</small>一个在东京的人</p>
          <p><small>魔法书、沙画、旷野与星空</small>为你一页一页画出来</p><p><small>配乐</small>为今晚写的小夜曲</p>
          <p><small>致敬</small>《哈利·波特》《小马王》《狮子王》带来的灵感</p><p><small>示意照片</small>Unsplash 的摄影师们</p>
          <p class="rule"></p><p class="big">To be continued……</p><p>下一页，我们一起写。</p>
          <div class="ws-end"><button type="button" data-again>再许一个愿 ✧</button><button type="button" data-replay>从头再看一遍</button></div>
        </div></div>
      </div>`;
    const $ = s => el.querySelector(s);
    // the room is one canvas: sky beyond the glass + four depth planes; the cake rides the desk's plane
    const room = $('.ws-room'), sg = room.getContext('2d', { alpha: false }), sky = room, cv = $('.ws-cake'), g = cv.getContext('2d');
    let view = null, viewFor = null, cake0 = { x: 0, y: 0, s: 1 }; const tmp = {};
    const R = rng(13);
    const top = document.createElement('canvas'); top.className = 'full ws-top'; el.querySelector('.ws-ui').before(top); const tg = top.getContext('2d');
    const fxg = () => tg;
    const glowW = glowSprite('255,196,120', 256, 1.5), glowSm = glowSprite('255,220,160', 64, 2), spark = sparkleSprite('255,236,190', 48), smokeS = glowSprite('200,196,205', 64, 1.4);
    const petalImgs = PETALS.map(c => petalSprite(48, c));
    const petals = Array.from({ length: 18 }, (_, i) => ({ c: i % PETALS.length, x: ((i * .383 + .05) % 1), st: 3 + i * 1.1 + R() * .8, sp: .7 + R() * .5, sz: .7 + R() * .6, ph: R() * TAU, spin: (R() - .5) * 1.4 }));
    const motes = Array.from({ length: 34 }, () => ({ x: R(), y: R(), v: .012 + R() * .02, p: R() * TAU, s: .5 + R() }));
    // fireworks beyond the glass (painting units of the far plane): shells rise, burst, and their sparks fall
    const shells = [], sparks = [], fwGlow = Object.fromEntries(FW.map(c => [c, glowSprite(c, 32, 2.6)])); fwGlow['255,230,190'] = glowSprite('255,230,190', 32, 2.6); let flashA = 0, flashC = FW[0], nextShell = 0;
    const room0 = A.room && !A.room.failed ? A.room : null;
    if (room0) { room0.v.loop = true; room0.portrait = env.portrait; play(room0, .5); }
    let WINDOW = glassBox('study-land'), portrait = false, rs = 1;
    const flames = CANDLES.map((_, i) => ({ lit: 0, out: 0, seed: R() * 40 }));
    const flights = []; const smoke = []; const lamps = [];
    let topDirty = true, map = { s: 1, x: 0, y: 0 }, cake = { x: 0, y: 0, s: 1 }, T = 0, phase = 'light', phaseAt = 0, lit = 0, blowAt = 0, finalAt = 0, creditsAt = 0, mic = null;
    // ---------- lighting by hand ----------
    const AUTO_LIGHT = 4.5;
    let carry = null, lastLight = 0, hinted = false, sayTimer = 0;
    const hintEl = document.createElement('p'); hintEl.className = 'ws-hint'; el.appendChild(hintEl);
    const hint = text => { if (text) hintEl.textContent = text; hintEl.classList.toggle('on', !!text); };
    const unlit = () => flames.map((f, i) => i).filter(i => !flames[i].lit && !flights.some(f => f && !f.done && f.i === i));
    const nearest = (x, y, list, r) => { let best = -1, bd = r; list.forEach(i => { const [tx, ty] = tip(i), d = Math.hypot(tx - x, ty - y); if (d < bd) { bd = d; best = i; } }); return best; };
    function light(i) {
      if (flames[i].lit) return; flames[i].lit = .01; lit++; lastLight = T;
      const [tx, ty] = tip(i); fx.burst(tx, ty - 8, { n: 26, speed: 70, life: 1.2, size: 1.6 }); env.audio.sfx('light', .7);
      env.say(WHISPERS[Math.min(lit, WHISPERS.length) - 1]); clearTimeout(sayTimer); sayTimer = setTimeout(() => env.say(null), 2600);
    }
    function launch(i, from) {
      const [sx, sy] = from || P(WINDOW.x0 + R() * (WINDOW.x1 - WINDOW.x0), WINDOW.y0 + (WINDOW.y1 - WINDOW.y0) * (.3 + R() * .4));
      flights.push({ i, sx, sy, st: T, done: false }); lastLight = T;
    }
    const wickReach = () => Math.max(26, CAKE_W * cake.s * .06);
    cv.addEventListener('pointerdown', e => {
      if (phase !== 'light') return;
      hint(null);
      const litOnes = flames.map((f, i) => i).filter(i => flames[i].lit > .5);
      if (nearest(e.clientX, e.clientY, litOnes, wickReach() * 1.6) >= 0) { carry = { x: e.clientX, y: e.clientY }; env.audio.sfx('sparkle', .2); return; }
      const i = nearest(e.clientX, e.clientY, unlit(), wickReach() * 1.4);
      if (i >= 0) launch(i);
    });
    addEventListener('pointermove', e => { if (carry) { carry.x = e.clientX; carry.y = e.clientY; } }, { passive: true });
    const drop = () => { carry = null; };
    addEventListener('pointerup', drop); addEventListener('pointercancel', drop);

    function layout() {
      const W = env.W, H = env.H; portrait = env.portrait;
      rs = env.res(true); top.width = Math.round(W * rs); top.height = Math.round(H * rs); cv.width = Math.round(W * env.dpr); cv.height = Math.round(H * env.dpr);
      room._r = env.res(true); room._at = -1; // a resized canvas is blank: repaint on the next frame
      const img = portrait ? A.port : A.land; WINDOW = glassBox(portrait ? 'study-port' : 'study-land');
      const s = Math.max(W / img.width, H / img.height), fy = portrait ? .7 : .78;
      map = { s, x: (W - img.width * s) / 2, y: (H - img.height * s) * fy };
      // the room canvas spans the whole painting (wider than the screen) so the zoom toward the window never shows an edge
      { const rw = img.width * s, rh = img.height * s, rr = room._r; room.width = Math.round(rw * rr); room.height = Math.round(rh * rr);
        Object.assign(room.style, { position: 'absolute', left: map.x + 'px', top: map.y + 'px', width: rw + 'px', height: rh + 'px' }); }
      const dm = portrait ? A.dPort : A.dLand; if (viewFor !== dm) { viewFor = dm; view = new DepthView(dm, { amp: .04, focus: portrait ? .73 : .8 }); }
      el.classList.toggle('land', !portrait);
      // the cake stands on the desk: in front of the window on wide screens, centred on phones
      const cs = (portrait ? 760 : 500) / CAKE_H * s, baseY = portrait ? 1330 : 800, cx = portrait ? W / 2 : map.x + 800 * s; // in front of the fire, under the window
      cake = cake0 = { s: cs, x: cx - CAKE_W * cs / 2, y: map.y + baseY * s - (CAKE_H - 6) * cs };
      const wcx = map.x + (WINDOW.x0 + WINDOW.x1) / 2 * s, wcy = map.y + (WINDOW.y0 + WINDOW.y1) / 2 * s;
      const z = portrait ? 1.35 : Math.min(2.2, H * .9 / ((WINDOW.y1 - WINDOW.y0) * s));
      // look toward the window, but never so far that the room's edge comes into view
      const rw = img.width * s, rh = img.height * s;
      const fit = (want, o, z, lo, len, view) => { const a = view - o - z * (lo + len - o), b = -o - z * (lo - o); return a > b ? (a + b) / 2 : clamp(want, a, b); };
      const tx = fit(W / 2 - wcx, wcx, z, map.x, rw, W), ty = fit(H * .48 - wcy, wcy, z, map.y, rh, H);
      el.style.setProperty('--look', `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px) scale(${z.toFixed(3)})`);
      el.style.setProperty('--look-origin', `${wcx.toFixed(1)}px ${wcy.toFixed(1)}px`);
    }
    layout();
    const P = (x, y) => [map.x + x * map.s, map.y + y * map.s];
    const tip = i => [cake.x + CANDLES[i][0] * cake.s, cake.y + CANDLES[i][1] * cake.s];

    function startWish() { if (phase !== 'ask') return; phase = 'wish'; phaseAt = T; el.classList.add('wishing'); el.classList.remove('asking'); env.audio.duck(.4, 2.5); env.pups.set('quiet'); }
    function blow() {
      if (phase !== 'wish' || T - phaseAt < 5) return;
      phase = 'blown'; blowAt = T; el.classList.remove('wishing'); el.classList.add('blown');
      env.audio.sfx('blow', 1); stopMic();
      setTimeout(() => { env.audio.cue('finale', 3); }, 1200);
      setTimeout(() => { const [x, y] = tip(FIRST); env.fx.burst(x, y - 20, { n: 50, speed: 60, life: 2.6, size: 1.6, color: '255,226,170' }); }, 700); // a breath of golden dust where the flames were
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
    $('[data-again]').addEventListener('click', () => {
      flames.forEach(f => { f.lit = 0; f.out = 0; }); flights.length = 0; lit = 0; phase = 'relight'; phaseAt = T; el.classList.remove('blown', 'final', 'credits', 'look'); env.audio.cue('wish', 2);
    });
    $('[data-replay]').addEventListener('click', () => { location.hash = ''; location.search = ''; location.reload(); });

    return {
      resize: layout,
      debug: () => ({ phase, lit, shells: shells.length, sparks: sparks.length, win: WINDOW, tips: flames.map((f, i) => [...tip(i), +f.lit.toFixed(2)]) }),
      progress: () => phase === 'light' ? T / 60 : phase === 'blown' ? .7 + clamp((T - blowAt) / 60) * .3 : .5,
      update(dt, t) {
        T = t; const W = env.W, H = env.H;
        if (!this.started) { this.started = true; env.chapterCard('V', 1700); env.pups.set('party'); }
        // ---------- sky through the window ----------
        // ---------- 2.5D camera ----------
        const wd = wander(t, 2.3, .8), calm = phase === 'wish' ? .35 : 1;
        view.frame(map, { x: (wd.x * .7 + env.look.x * .8) * calm, y: (wd.y * .45 + env.look.y * .5) * calm, zoom: .04 * between(t, 0, 9) + (phase === 'wish' ? .04 * between(t - phaseAt, 0, 6) : 0), focus: view.focus }, [W / 2, H * .55]);
        const rr = room._r, T0 = view.T[0];
        // the room's camera moves well under a pixel per frame, so its planes repaint at ~30 fps while cake and flames stay at full rate
        const paintRoom = t - (room._at ?? -1) >= 1 / 31 || room._w !== room.width; if (paintRoom) { room._at = t; room._w = room.width; }
        if (paintRoom) {
        sg.setTransform(rr, 0, 0, rr, -map.x * rr, -map.y * rr); sg.globalAlpha = 1;
        // the filmed room breathing with firelight; once the candles are out it gives way to the still painting,
        // so the fireworks beyond the glass line up with the window exactly
        const filmK = room0 && drawable(room0) && room0.portrait === portrait ? 1 - (phase === 'blown' ? between(t - blowAt, 0, 1.4) : 0) : 0;
        if (filmK < 1) view.draw(sg);
        if (filmK > 0) { const pm = view.at(.55, tmp), img = portrait ? A.port : A.land; sg.globalAlpha = filmK; sg.drawImage(room0.v, pm.x, pm.y, img.width * pm.s, img.height * pm.s); sg.globalAlpha = 1; }
        // ---------- the room's own lights, and fireworks beyond the window glass (far plane) ----------
        const name = portrait ? 'study-port' : 'study-land';
        sg.setTransform(rr * T0.s, 0, 0, rr * T0.s, rr * (T0.x - map.x), rr * (T0.y - map.y));
        if (phase === 'blown') {
          const k = t - blowAt, wx = WINDOW.x0, wy = WINDOW.y0, ww = WINDOW.x1 - WINDOW.x0, wh = WINDOW.y1 - WINDOW.y0, sdt = Math.min(.1, t - (room._fwAt ?? t)); room._fwAt = t;
          if (k > 1.8 && t > nextShell && k < 40) { // a volley, then a pause; the big heart once
            shells.push({ x: wx + ww * (.2 + R() * .6), y: wy + wh * 1.05, ty: wy + wh * (.16 + R() * .28), v: 0, col: FW[(R() * FW.length) | 0], heart: false, up: true });
            nextShell = t + 2.2 + R() * 2.6;
          }
          for (let i = shells.length - 1; i >= 0; i--) {
            const sh = shells[i]; sh.y += (sh.ty - sh.y) * Math.min(1, sdt * 2.6); sparks.push({ x: sh.x, y: sh.y, vx: 0, vy: 0, life: .5, max: .5, col: '255,230,190', tr: true });
            if (sh.y - sh.ty < 2) { // burst
              shells.splice(i, 1); const n = 64, r = ww * (.22 + R() * .08);
              for (let j = 0; j < n; j++) {
                const a = j / n * TAU; let vx, vy;
                if (sh.heart) { vx = 16 * Math.pow(Math.sin(a), 3) / 16; vy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16; }
                else { const q = .75 + R() * .25; vx = Math.cos(a) * q; vy = Math.sin(a) * q; }
                sparks.push({ x: sh.x, y: sh.y, vx: vx * r * 1.5, vy: vy * r * 1.5, life: 2.8 + R() * 1.2, max: 3.6, col: sh.col });
              }
              flashA = .45; flashC = sh.col; env.audio.sfx('pop', .18);
            }
          }
          behindGlass(sg, name, portrait ? A.glassP : A.glassL, rr * T0.s, gw => {
            gw.globalCompositeOperation = 'lighter';
            for (let i = sparks.length - 1; i >= 0; i--) {
              const p = sparks[i]; p.life -= sdt; if (p.life <= 0) { sparks.splice(i, 1); continue; }
              p.vx *= Math.pow(.3, sdt); p.vy = p.vy * Math.pow(.3, sdt) + 14 * sdt; p.x += p.vx * sdt; p.y += p.vy * sdt;
              const u = p.life / p.max, sz = (p.tr ? 5 : 9) * (.45 + u), tw = p.tr ? 1 : .6 + .4 * Math.sin(t * 30 + i);
              gw.globalAlpha = Math.min(1, u * 1.6) * tw; gw.drawImage(fwGlow[p.col] || glowSm, p.x - sz, p.y - sz, sz * 2, sz * 2);
              gw.fillStyle = '#fff8e8'; const c = sz * .16; gw.fillRect(p.x - c, p.y - c, c * 2, c * 2);
            }
            gw.globalAlpha = 1; gw.globalCompositeOperation = 'source-over';
          });
        }
        { const pm = view.at(.4, tmp); sg.setTransform(rr * pm.s, 0, 0, rr * pm.s, rr * (pm.x - map.x), rr * (pm.y - map.y)); studyLights(sg, name, t, (phase === 'blown' ? lerp(.3, 1.35, between(t - blowAt, 1.5, 5)) : 1) * (1 - filmK * .8)); } // the lights come up after the wish
        { const pm = view.at(.75, tmp); sg.setTransform(rr * pm.s, 0, 0, rr * pm.s, rr * (pm.x - map.x), rr * (pm.y - map.y)); if (filmK < 1) studySteam(sg, name, t, .8 * (1 - filmK)); }
        }
        // the cake stands on the desk, so it moves with the desk's plane
        { const pm = view.at(view.focus, tmp), k = pm.s / map.s; cake = { s: cake0.s * k, x: pm.x + (cake0.x - map.x) * k, y: pm.y + (cake0.y - map.y) * k }; }

        // ---------- the cake and its candles ----------
        g.setTransform(env.dpr, 0, 0, env.dpr, 0, 0); g.clearRect(0, 0, W, H);
        tg.setTransform(rs, 0, 0, rs, 0, 0); if (topDirty || phase === 'blown') { tg.clearRect(0, 0, W, H); topDirty = phase === 'blown'; }
        const warm = flames.reduce((a, f) => a + f.lit * (1 - f.out), 0) / flames.length;
        const darkness = phase === 'wish' ? .45 + between(t - phaseAt, 0, 2.5) * .4 : phase === 'blown' ? lerp(.8, .22, between(t - blowAt, 1.5, 6)) : .62 - warm * .3;
        const cw = CAKE_W * cake.s, ch = CAKE_H * cake.s;
        // warm pool of light around the cake
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = warm * .55 * (.92 + Math.sin(t * 9) * .05);
        g.drawImage(glowW, W / 2 - cw * 1.1, cake.y - ch * .15, cw * 2.2, ch * 1.4);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        // a soft contact shadow where the stand meets the desk
        { const sx = cake.x + cw / 2, sy = cake.y + ch * .99, sh = g.createRadialGradient(sx, sy, 0, sx, sy, cw * .5);
          sh.addColorStop(0, 'rgba(8,4,2,.6)'); sh.addColorStop(1, 'rgba(8,4,2,0)');
          g.save(); g.translate(sx, sy); g.scale(1, .12); g.translate(-sx, -sy); g.fillStyle = sh; g.fillRect(sx - cw * .5, sy - cw * .5, cw, cw); g.restore(); }
        g.drawImage(A.cake, cake.x, cake.y, cw, ch);
        // the room falls into shadow except where the candles reach
        const [lx, ly] = tip(FIRST), reach = Math.max(W, H) * (.25 + warm * .45);
        const dg = g.createRadialGradient(lx, ly, 0, lx, ly, reach);
        dg.addColorStop(0, `rgba(5,5,14,${(darkness * (1 - warm * .85)).toFixed(3)})`); dg.addColorStop(.55, `rgba(5,5,14,${(darkness * (1 - warm * .4)).toFixed(3)})`); dg.addColorStop(1, `rgba(5,5,14,${darkness.toFixed(3)})`);
        if (phase === 'blown') { tg.fillStyle = `rgba(5,5,14,${darkness.toFixed(3)})`; tg.fillRect(0, 0, W, H); } // the zoomed world no longer covers the screen edges
        else { g.fillStyle = dg; g.fillRect(0, 0, W, H); }

        // ---------- lighting the candles ----------
        if (phase === 'light' || phase === 'relight') {
          // the star from the night sky lights the first candle; then the rest are hers to light
          if (!flights.length && t > (env.handoff ? 1.1 : .6)) launch(FIRST, env.handoff || [W / 2, -20]); // the falling star, come through from the last chapter
          if (phase === 'relight' && t - lastLight > .5 && unlit().length) launch(unlit()[0]);
          if (phase === 'light' && lit >= 1 && unlit().length) {
            if (!hinted && t - lastLight > 2.2) { hinted = true; hint('触碰烛火，把它带到另一支蜡烛上'); }
            if (t - lastLight > AUTO_LIGHT && !carry) launch(unlit()[0]);
          }
          flights.forEach(f => {
            if (!f || f.done) return; const u = clamp((t - f.st) / 1.15); const [tx, ty] = tip(f.i);
            const x = lerp(f.sx, tx, easeInOut(u)) + Math.sin(u * Math.PI) * 60 * (f.i % 2 ? 1 : -1), y = lerp(f.sy, ty - 10, easeInOut(u)) - Math.sin(u * Math.PI) * 30;
            g.globalCompositeOperation = 'lighter'; g.drawImage(spark, x - 14, y - 14, 28, 28); g.globalCompositeOperation = 'source-over';
            if (Math.random() < .9) fx.trail(x, y, { life: 1.1, size: 1.6 });
            if (u >= 1) { f.done = true; if (phase === 'relight') { flames[f.i].lit = .01; lit++; env.audio.sfx('light', .5); } else light(f.i); }
          });
          // a flame carried on her fingertip
          if (carry) {
            drawFlame(g, carry.x, carry.y + 10, FLAME * .75 * cake.s, t, 3, 0, 1);
            if (Math.random() < .7) fx.trail(carry.x, carry.y - 6, { life: .9, size: 1.3, vy: -20 });
            const i = nearest(carry.x, carry.y + 10, unlit(), wickReach());
            if (i >= 0) light(i);
          }
          if (lit >= N && phase === 'light' && t - lastLight > 1.9) { phase = 'ask'; phaseAt = t; el.classList.add('asking'); carry = null; hint(null); }
          if (lit >= N && phase === 'relight' && t > phaseAt + 3) { phase = 'ask'; phaseAt = t; el.classList.add('asking'); }
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
          const [x, y] = tip(i);
          const lean = phase === 'blown' ? between(t, blowAt, blowAt + .35) * 14 : 0;
          drawFlame(g, x, y, FLAME * cake.s * (.4 + .6 * a), t, f.seed, lean, a);
        });
        // smoke wisps curling up
        for (let k = smoke.length - 1; k >= 0; k--) {
          const s = smoke[k]; s.age += dt; if (s.age > 3.2) { smoke.splice(k, 1); continue; } if (s.age < 0) continue;
          const [x, y] = tip(s.i), u = s.age / 3.2, sc = cake.s * FLAME / 16;
          g.globalAlpha = (1 - u) * .22; const r = (2 + u * 12) * sc;
          g.drawImage(smokeS, x + Math.sin(s.age * 3 + s.i) * 10 * u * sc + Math.sin(s.age * 7 + s.p) * 2 - r, y - 8 * sc - u * 120 * sc - r, r * 2, r * 2);
        }
        g.globalAlpha = 1;

        // ---------- after the wish ----------
        if (phase === 'blown') {
          const k = t - blowAt;
          if (k > .3 && !this.cheered) { this.cheered = true; env.pups.set('tender'); }
          if (k > 1.6 && !el.classList.contains('look')) el.classList.add('look');
          if (k > 3.4 && !el.classList.contains('final')) { el.classList.add('final'); finalAt = t; }
          // the fireworks' light flickers over the room
          if (flashA > .01) { tg.globalCompositeOperation = 'lighter'; tg.fillStyle = `rgba(${flashC},${(flashA * .09).toFixed(3)})`; tg.fillRect(0, 0, W, H); tg.globalCompositeOperation = 'source-over'; flashA *= Math.pow(.02, dt); }
          // a few rose petals drifting down through the room, and motes of golden light hanging in the air
          if (!env.reduced) {
            tg.globalCompositeOperation = 'lighter';
            motes.forEach(m => { const a = between(k, 2, 6) * (.35 + .65 * Math.sin(t * .9 * m.s + m.p) ** 2); const x = (m.x + Math.sin(t * .15 + m.p) * .04) * W, y = ((m.y - t * m.v) % 1 + 1) % 1 * H, sz = 7 * m.s; tg.globalAlpha = a * .45; tg.drawImage(glowSm, x - sz, y - sz, sz * 2, sz * 2); });
            tg.globalCompositeOperation = 'source-over';
            petals.forEach(p => {
              const u = (k - p.st) * .05 * p.sp; if (u < 0 || u > 1.2) return;
              const sz = Math.min(W, H) * .045 * p.sz, x = W * (.05 + p.x * .9) + Math.sin(k * .8 + p.ph) * sz * 1.4, y = -sz + u * (H + sz * 2);
              const flip = Math.cos(k * 1.6 + p.ph), rot = p.ph + k * p.spin + Math.sin(k * 1.1 + p.ph) * .5;
              tg.save(); tg.translate(x, y); tg.rotate(rot); tg.scale(Math.max(.15, Math.abs(flip)), 1); tg.globalAlpha = .92 * clamp(u * 10) * clamp((1.2 - u) * 6);
              tg.drawImage(petalImgs[p.c], -sz * .39, -sz / 2, sz * .78, sz); tg.restore();
            });
          }
          tg.globalAlpha = 1;
          if (k > 3.4) {
            const lines = el.querySelectorAll('.ws-final p'); lines.forEach((p, i) => p.classList.toggle('on', k > 4.6 + i * 2.4));
            const arcK = between(k, 4.6 + FINAL.length * 2.4 + .4, 4.6 + FINAL.length * 2.4 + 2.4); el.querySelector('.ws-arc').style.setProperty('--k', arcK.toFixed(3));
            if (arcK > 0 && !el.classList.contains('credits')) drawArc(fxg(), el.querySelector('.ws-arc'), arcK, t);
            if (k > 4.6 + FINAL.length * 2.4 + 6.5 && !el.classList.contains('credits')) { el.classList.add('credits'); creditsAt = t; }
          }
        }
      },
      destroy() { stopMic(); removeEventListener('pointerup', drop); removeEventListener('pointercancel', drop); stop(room0); },
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
// Settles the painted cake into the candlelit room: a warm multiply, light falling off toward the stand.
function gradeCake(img) {
  const c = canvas(img.width, img.height), g = c.getContext('2d'), h = img.height;
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(255,222,188)'; g.fillRect(0, 0, img.width, h);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgb(255,250,240)'); gr.addColorStop(.45, 'rgb(205,180,160)'); gr.addColorStop(1, 'rgb(120,92,72)');
  g.fillStyle = gr; g.fillRect(0, 0, img.width, h);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(img, 0, 0); // keep the cut-out's own alpha
  return c;
}
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
