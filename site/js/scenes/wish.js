// Chapter V: the falling star lights the first candle; each candle is lit by a memory.
// She closes her eyes, makes a wish and blows them out. Sky lanterns rise, and the last letter appears.
import { asset, loadImage, canvas, clamp, lerp, between, win, easeInOut, easeOut, rng, glowSprite, sparkleSprite, TAU, wait } from '../util.js';
import { paintCake, CANDLES, CAKE_W, CAKE_H } from './cake.js';
import { loadDepth, DepthView, wander } from '../depth.js';

const A = {};
const WIN_L = { x0: 855, y0: 60, x1: 1250, y1: 470 }, WIN_P = { x0: 345, y0: 30, x1: 738, y1: 770 };
const LIGHT_AT = [.6, 2.1, 3.6, 5.1, 6.6];
const LIGHT_ORDER = [2, 0, 1, 3, 4];
const WHISPERS = ['这一支，为你走过的那些路。', '这一支，为我们相遇的那座城。', '这一支，为隔着山海的想念。', '这一支，为往后的每一天。', '最后这一支，为你。'];
const FINAL = ['今晚我在东京，你在远方。', '隔着一片海，和很多很多公里的夜空，', '我们看的，是同一片星星。', '愿你一直勇敢，也一直被爱。', '往后的每一页，想和你一起写。'];

function lanternSprite(h) {
  const w = h * .72, c = canvas(w * 3, h * 2.2), g = c.getContext('2d'), cx = w * 1.5, top = h * .55;
  g.drawImage(glowSprite('255,170,80', 128, 1.6), 0, 0, w * 3, h * 2.2);
  const gr = g.createLinearGradient(0, top, 0, top + h); gr.addColorStop(0, '#ffcf7a'); gr.addColorStop(.6, '#ff9c3e'); gr.addColorStop(1, '#e8662a');
  g.fillStyle = gr; g.beginPath(); g.moveTo(cx - w * .36, top); g.lineTo(cx + w * .36, top); g.quadraticCurveTo(cx + w * .55, top + h * .6, cx + w * .42, top + h); g.lineTo(cx - w * .42, top + h); g.quadraticCurveTo(cx - w * .55, top + h * .6, cx - w * .36, top); g.fill();
  const inner = g.createRadialGradient(cx, top + h * .78, 0, cx, top + h * .7, h * .5); inner.addColorStop(0, 'rgba(255,250,220,.95)'); inner.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = inner; g.fillRect(cx - w, top, w * 2, h);
  g.strokeStyle = 'rgba(160,70,20,.35)'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(cx - w * .36 + i * w * .18, top); g.lineTo(cx - w * .42 + i * w * .21, top + h); g.stroke(); }
  return c;
}

export default {
  id: 'wish', music: 'wish',
  async load() {
    const [land, port, lake] = await Promise.all(['img/study-land.webp', 'img/study-port.webp', 'img/night-lake.webp'].map(p => loadImage(asset(p))));
    Object.assign(A, { land, port, lake }); if (!A.cake) A.cake = paintCake();
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
          <p class="big">写给师宝宝的一场梦</p><p class="rule"></p>
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
    const lanterns = [lanternSprite(40), lanternSprite(26)];
    const skyStars = Array.from({ length: 70 }, () => ({ x: R(), y: R() * .6, p: R() * TAU, s: .6 + R() * 2 }));
    let WINDOW = WIN_L, portrait = false, rs = 1;
    const flames = CANDLES.map((_, i) => ({ lit: 0, out: 0, seed: R() * 40 }));
    const flights = []; const smoke = []; const lamps = [];
    let topDirty = true, map = { s: 1, x: 0, y: 0 }, cake = { x: 0, y: 0, s: 1 }, T = 0, phase = 'light', phaseAt = 0, lit = 0, blowAt = 0, finalAt = 0, creditsAt = 0, mic = null;
    const whisper = env.cues(LIGHT_AT.map((a, i) => [a + .25, a + 1.6, WHISPERS[i]]));

    function layout() {
      const W = env.W, H = env.H; portrait = env.portrait;
      rs = env.res(true); top.width = Math.round(W * rs); top.height = Math.round(H * rs); cv.width = Math.round(W * env.dpr); cv.height = Math.round(H * env.dpr);
      room._r = env.res(true); room._at = -1; // a resized canvas is blank: repaint on the next frame
      const img = portrait ? A.port : A.land; WINDOW = portrait ? WIN_P : WIN_L;
      const s = Math.max(W / img.width, H / img.height), fy = portrait ? .7 : .78;
      map = { s, x: (W - img.width * s) / 2, y: (H - img.height * s) * fy };
      // the room canvas spans the whole painting (wider than the screen) so the zoom toward the window never shows an edge
      { const rw = img.width * s, rh = img.height * s, rr = room._r; room.width = Math.round(rw * rr); room.height = Math.round(rh * rr);
        Object.assign(room.style, { position: 'absolute', left: map.x + 'px', top: map.y + 'px', width: rw + 'px', height: rh + 'px' }); }
      const dm = portrait ? A.dPort : A.dLand; if (viewFor !== dm) { viewFor = dm; view = new DepthView(dm, { amp: .026, focus: portrait ? .73 : .8 }); }
      el.classList.toggle('land', !portrait);
      // the cake stands on the desk: in front of the window on wide screens, centred on phones
      const cs = (portrait ? 640 : 560) / CAKE_W * s, baseY = portrait ? 1250 : 870, cx = portrait ? W / 2 : map.x + 640 * s;
      cake = cake0 = { s: cs, x: cx - CAKE_W * cs / 2, y: map.y + baseY * s - (CAKE_H - 22) * cs };
      const wcx = map.x + (WINDOW.x0 + WINDOW.x1) / 2 * s, wcy = map.y + (WINDOW.y0 + WINDOW.y1) / 2 * s;
      const z = portrait ? 1.35 : Math.min(2.2, H * .9 / ((WINDOW.y1 - WINDOW.y0) * s));
      el.style.setProperty('--look', `translate(${(W / 2 - wcx).toFixed(1)}px,${(H * .48 - wcy).toFixed(1)}px) scale(${z.toFixed(3)})`);
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
      flames.forEach(f => { f.lit = 0; f.out = 0; }); lit = 0; phase = 'relight'; phaseAt = T; el.classList.remove('blown', 'final', 'credits', 'look'); env.audio.cue('wish', 2);
    });
    $('[data-replay]').addEventListener('click', () => { location.hash = ''; location.search = ''; location.reload(); });

    return {
      resize: layout,
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
        if (portrait) view.draw(sg);
        // ---------- sky through the window, on the far plane ----------
        sg.setTransform(rr * T0.s, 0, 0, rr * T0.s, rr * (T0.x - map.x), rr * (T0.y - map.y));
        const wx = WINDOW.x0, wy = WINDOW.y0, ww = WINDOW.x1 - WINDOW.x0, wh = WINDOW.y1 - WINDOW.y0;
        sg.save(); sg.beginPath(); sg.rect(wx, wy, ww, wh); sg.clip();
        if (!portrait) {
          const ls = Math.max(ww / A.lake.width, wh / A.lake.height) * 1.02; sg.drawImage(A.lake, wx + (ww - A.lake.width * ls) / 2, wy + (wh - A.lake.height * ls) * .3, A.lake.width * ls, A.lake.height * ls);
          sg.fillStyle = '#eef2ff';
          skyStars.forEach(s => { sg.globalAlpha = .3 + .7 * (.5 + .5 * Math.sin(s.p + t * s.s)); sg.fillRect(wx + s.x * ww, wy + s.y * wh, 1.3 / map.s, 1.3 / map.s); });
          sg.globalAlpha = 1;
        }
        // distant lanterns drifting up beyond the glass
        if (phase === 'blown') {
          const k = t - blowAt;
          for (let i = 0; i < 70; i++) {
            const st = 2 + (i * 0.53) % 14, life = 18, u = (k - st) / life; if (u < 0 || u > 1) continue;
            const x = wx + ((i * 0.618) % 1) * ww + Math.sin(k * .4 + i) * 8, y = wy + wh * (1.05 - u * 1.25), sz = (8 + (i % 5) * 3) * 2;
            const spr = lanterns[1]; sg.globalAlpha = Math.min(1, u * 6) * (1 - Math.max(0, u - .85) * 6) * (portrait ? .85 : 1);
            sg.drawImage(spr, x - sz * 1.5, y - sz * 1.1, sz * 3, sz * 2.2);
          }
          sg.globalAlpha = 1;
        }
        sg.restore();
        if (!portrait) { sg.setTransform(rr, 0, 0, rr, -map.x * rr, -map.y * rr); view.draw(sg); }
        }
        // the cake stands on the desk, so it moves with the desk's plane
        { const pm = view.at(view.focus, tmp), k = pm.s / map.s; cake = { s: cake0.s * k, x: pm.x + (cake0.x - map.x) * k, y: pm.y + (cake0.y - map.y) * k }; }

        // ---------- the cake and its candles ----------
        g.setTransform(env.dpr, 0, 0, env.dpr, 0, 0); g.clearRect(0, 0, W, H);
        tg.setTransform(rs, 0, 0, rs, 0, 0); if (topDirty || phase === 'blown') { tg.clearRect(0, 0, W, H); topDirty = phase === 'blown'; }
        const warm = flames.reduce((a, f) => a + f.lit * (1 - f.out), 0) / flames.length;
        const darkness = phase === 'wish' ? .45 + between(t - phaseAt, 0, 2.5) * .4 : phase === 'blown' ? lerp(.8, .42, between(t - blowAt, 2, 10)) : .62 - warm * .3;
        const cw = CAKE_W * cake.s, ch = CAKE_H * cake.s;
        // warm pool of light around the cake
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = warm * .55 * (.92 + Math.sin(t * 9) * .05);
        g.drawImage(glowW, W / 2 - cw * 1.1, cake.y - ch * .15, cw * 2.2, ch * 1.4);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.drawImage(A.cake, cake.x, cake.y, cw, ch);
        // the room falls into shadow except where the candles reach
        const [lx, ly] = tip(2), reach = Math.max(W, H) * (.25 + warm * .45);
        const dg = g.createRadialGradient(lx, ly, 0, lx, ly, reach);
        dg.addColorStop(0, `rgba(5,5,14,${(darkness * (1 - warm * .85)).toFixed(3)})`); dg.addColorStop(.55, `rgba(5,5,14,${(darkness * (1 - warm * .4)).toFixed(3)})`); dg.addColorStop(1, `rgba(5,5,14,${darkness.toFixed(3)})`);
        if (phase === 'blown') { tg.fillStyle = `rgba(5,5,14,${darkness.toFixed(3)})`; tg.fillRect(0, 0, W, H); } // the zoomed world no longer covers the screen edges
        else { g.fillStyle = dg; g.fillRect(0, 0, W, H); }

        // ---------- lighting the candles ----------
        if (phase === 'light' || phase === 'relight') {
          const base = phase === 'relight' ? phaseAt - .6 : 0, times = phase === 'relight' ? [0, .5, 1, 1.5, 2] : LIGHT_AT;
          if (phase === 'light') whisper(t);
          times.forEach((at, k) => {
            const i = LIGHT_ORDER[k], st = base + at;
            if (t > st && !flights[k + (phase === 'relight' ? 5 : 0)]) {
              const [sx, sy] = k === 0 && phase === 'light' ? [W / 2, -20] : P(WINDOW.x0 + R() * 540, WINDOW.y0 + 120 + R() * 200);
              flights[k + (phase === 'relight' ? 5 : 0)] = { i, sx, sy, st, done: false };
            }
          });
          flights.forEach(f => {
            if (!f || f.done) return; const u = clamp((t - f.st) / 1.15); const [tx, ty] = tip(f.i);
            const x = lerp(f.sx, tx, easeInOut(u)) + Math.sin(u * Math.PI) * 60 * (f.i % 2 ? 1 : -1), y = lerp(f.sy, ty - 10, easeInOut(u)) - Math.sin(u * Math.PI) * 30;
            g.globalCompositeOperation = 'lighter'; g.drawImage(spark, x - 14, y - 14, 28, 28); g.globalCompositeOperation = 'source-over';
            if (Math.random() < .9) fx.trail(x, y, { life: 1.1, size: 1.6 });
            if (u >= 1) { f.done = true; flames[f.i].lit = .01; fx.burst(tx, ty - 8, { n: 26, speed: 70, life: 1.2, size: 1.6 }); env.audio.sfx('light', .7); lit++; }
          });
          if (lit >= 5 && phase === 'light' && t > LIGHT_AT[4] + 1.9) { phase = 'ask'; phaseAt = t; el.classList.add('asking'); }
          if (lit >= 10 && phase === 'relight' && t > phaseAt + 3) { phase = 'ask'; phaseAt = t; el.classList.add('asking'); lit = 5; }
        }
        if (phase === 'ask' && t - phaseAt > 45) startWish(); // let the moment happen on its own if nobody taps
        if (phase === 'wish') {
          const k = t - phaseAt; el.classList.toggle('w-close', k > .2); el.classList.toggle('w-heart', k > 2); el.classList.toggle('w-breath', k > 3.6); el.classList.toggle('w-ready', k > 5);
          if (mic && k > 5) {
            mic.an.getByteTimeDomainData(mic.buf); let sum = 0; for (const v of mic.buf) sum += (v - 128) ** 2; const rms = Math.sqrt(sum / mic.buf.length);
            mic.loud = rms > 18 ? mic.loud + dt : Math.max(0, mic.loud - dt); if (mic.loud > .25) blow();
          }
          if (k > 40) blow();
        }
        flames.forEach((f, i) => {
          if (f.lit > 0) f.lit = Math.min(1, f.lit + dt * 2.2);
          if (phase === 'blown') { const st = blowAt + .35 + i * .09; if (t > st && f.out < 1) { if (f.out === 0) for (let k = 0; k < 26; k++) smoke.push({ i, age: -k * .07, p: Math.random() * TAU }); f.out = Math.min(1, f.out + dt * 5); } }
          const a = f.lit * (1 - f.out); if (a <= 0) return;
          const [x, y] = tip(i), sc = cake.s * 2.1;
          const lean = phase === 'blown' ? between(t, blowAt, blowAt + .35) * 14 : 0;
          drawFlame(g, x, y, 16 * sc * (.4 + .6 * a), t, f.seed, lean, a);
        });
        // smoke wisps curling up
        for (let k = smoke.length - 1; k >= 0; k--) {
          const s = smoke[k]; s.age += dt; if (s.age > 3.2) { smoke.splice(k, 1); continue; } if (s.age < 0) continue;
          const [x, y] = tip(s.i), u = s.age / 3.2, sc = cake.s * 2;
          g.globalAlpha = (1 - u) * .22; const r = (2 + u * 12) * sc;
          g.drawImage(smokeS, x + Math.sin(s.age * 3 + s.i) * 10 * u * sc + Math.sin(s.age * 7 + s.p) * 2 - r, y - 8 * sc - u * 120 * sc - r, r * 2, r * 2);
        }
        g.globalAlpha = 1;

        // ---------- after the wish ----------
        if (phase === 'blown') {
          const k = t - blowAt;
          if (k > .3 && !this.cheered) { this.cheered = true; env.pups.set('celebrate'); }
          if (k > 1.6 && !el.classList.contains('look')) el.classList.add('look');
          if (k > 3.4 && !el.classList.contains('final')) { el.classList.add('final'); finalAt = t; }
          // a few near lanterns floating through the room
          for (let i = 0; i < 10; i++) {
            const st = 3.5 + i * 1.6, life = 14, u = (k - st) / life; if (u < 0 || u > 1) continue;
            const x = W * ((i * .37 + .08) % 1) + Math.sin(k * .5 + i) * 20, y = H * (1.1 - u * 1.35), sz = (14 + (i % 3) * 8) * Math.min(W, H) / 700;
            tg.globalAlpha = Math.min(1, u * 5) * (1 - Math.max(0, u - .8) * 5);
            tg.drawImage(lanterns[0], x - sz * 1.5, y - sz * 1.1, sz * 3, sz * 2.2);
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
      destroy() { stopMic(); },
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
