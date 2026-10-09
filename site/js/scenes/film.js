// Chapter IV, an original short film in two shots:
//  A. golden prairie at dusk — two wild horses run together through the wind, then slow and touch noses.
//  B. savanna night — two lions on a rock beneath a setting sun; the stars gather into a heart and one falls.
import { asset, loadImage, canvas, clamp, lerp, between, win, easeInOut, easeOut, smooth, rng, glowSprite, sparkleSprite, TAU, noise1, fbm } from '../util.js';
import { drawHorse, drawLion, Strand, horseAnchors } from './creatures.js';
import { loadDepth, DepthView, wander } from '../depth.js';

let prairie, prairieDepth;
const TS = 1.4;
const A_LEN = 18.5, B_START = 17.2, LEN = 44;

export default {
  id: 'film', music: 'film',
  async load() { [prairie, prairieDepth] = await Promise.all([loadImage(asset('img/prairie.webp')), loadDepth('prairie')]); },
  create(env) {
    const { el, fx } = env;
    env.pups.set('hidden');
    el.innerHTML = '<canvas class="full"></canvas>';
    const cv = el.querySelector('canvas'), g = cv.getContext('2d', { alpha: false });
    const R = rng(91);
    const glowW = glowSprite('255,214,150', 256, 1.4), glowS = glowSprite('255,236,200', 64, 2), spark = sparkleSprite('255,240,210', 48), sunGlow = glowSprite('255,170,80', 256, 1.2);
    // horses: wind-blown manes and tails
    const horses = [0, 1].map(i => {
      const an = horseAnchors(1);
      return { i, x: 0, phase: i * .37, speed: 1.55 + i * .04, amp: 1, neck: 1, head: 0, tail: new Strand(8, .13), mane: an.crest.map(() => new Strand(4, .075)), col: i ? '#0f0d17' : '#0a0911', far: i ? '#1e1b29' : '#1a1724' };
    });
    // grass for the foreground of both shots
    const blades = Array.from({ length: Math.round(160 * env.q + 60) }, () => ({ x: R(), h: .04 + R() * R() * .11, w: .6 + R() * 1.6, p: R() * TAU, d: R() }));
    const dust = [];
    const stars = Array.from({ length: Math.round(220 * env.q + 60) }, () => ({ x: R(), y: R() * .62, r: R() * R() * 1.6 + .3, p: R() * TAU, s: .5 + R() * 2 }));
    // a heart of stars (constellation) in the upper sky
    const heart = Array.from({ length: 14 }, (_, i) => { const a = i / 14 * TAU; return [Math.pow(Math.sin(a), 3), -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16]; });
    const heartXY = ([x, y]) => { const m = Math.min(env.W, env.H) * (env.portrait ? .2 : .13); return [env.W * (env.portrait ? .5 : .52) + x * m, env.H * (env.portrait ? .22 : .3) + y * m]; };
    const flies = Array.from({ length: Math.round(30 * env.q + 10) }, () => ({ x: R(), y: .7 + R() * .25, p: R() * TAU, s: .3 + R() }));
    const acacias = Array.from({ length: 7 }, (_, i) => ({ x: R(), s: .35 + R() * .4 }));

    let T = 0, ended = false, fell = false, cardShown = false;
    const viewA = new DepthView(prairieDepth, { amp: .03, focus: .5 }), tmp = {};
    let skyOff = [0, 0, 1]; // shot B: where the sky plane currently sits (for the falling star)
    const cues = env.cues([
      [2.2, 6.6, '愿你有奔向旷野的自由，'], [7.0, 11.2, '也有一起奔跑的人。'], [12.2, 16.6, '风走过很远的路，终于停在你身边。'],
      [20.0, 24.6, '后来，太阳慢慢落下去了，'], [25.2, 30.4, '也有停下来的时候，', '可以安心靠近的温柔'], [31.8, 36.4, '星星替我们，记住了今晚。'], [37.0, 41.6, '最亮的那一颗，留给你。'],
    ]);
    let rs = 1;
    function resize() { rs = env.res(false); cv.width = Math.round(env.W * rs); cv.height = Math.round(env.H * rs); }
    resize();

    // ---------- shot A ----------
    function shotA(t, dt, W, H, alpha) {
      const portrait = env.portrait;
      const S = Math.min(W, H) * (portrait ? .2 : .16); // horse size
      const pan = t * (portrait ? 14 : 22);
      // background painting, slow pan + warm-to-dusk grade
      const ih = prairie.height, iw = prairie.width, sc = Math.max(W / iw, H / ih) * (portrait ? 1.05 : 1.12);
      const dw = iw * sc, dh = ih * sc, ox = Math.min(0, (W - dw) * .2 - pan * .25 + 20), oy = (H - dh) * .55;
      // 2.5D: the camera tracks the horses across four depth planes of the painting
      const wd = wander(t, 3.7, .8), track = lerp(-1.1, .55, easeOut(clamp(t / 9)));
      viewA.frame({ s: sc, x: Math.max(W - dw, ox), y: oy }, { x: track + wd.x * .25 + env.look.x * .7, y: wd.y * .3 + env.look.y * .45, zoom: .06 * between(t, 0, 18), focus: .5 }, [W / 2, H * .6]);
      g.globalAlpha = alpha; viewA.draw(g);
      const golden = 1 - between(t, 9, 18);
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, `rgba(255,170,90,${.18 * golden})`); gr.addColorStop(.55, `rgba(255,190,110,${.28 * golden})`); gr.addColorStop(1, `rgba(40,20,10,${.25})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // low sun bloom on the horizon
      const bx = Math.max(W - dw, ox), hm = viewA.at(.08, tmp), hy = hm.y + ih * .64 * hm.s, sx = hm.x + (W * .3 - bx) / sc * hm.s - pan * .05;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha * (.5 + .25 * golden); const sg = W * .55; g.drawImage(sunGlow, sx - sg, hy - sg * .55, sg * 2, sg * 1.1); g.globalCompositeOperation = 'source-over';
      // eagle riding the wind high above
      // the horses
      const ground = hy + (H - hy) * (portrait ? .42 : .38);
      const slow = between(t, 10.5, 14.2), stop = between(t, 13.5, 15.5);
      horses.forEach(h => {
        h.amp = lerp(1, 0, stop); h.neck = lerp(1, .15, between(t, 13.8, 16));
        h.phase += dt * h.speed * lerp(1, .55, slow) * (1 - stop * .85);
        const lead = h.i ? -.05 : .05;
        const baseX = lerp(-.25, .5, easeOut(clamp(t / 9))) + (h.i ? 1 : -1) * Math.max(.1, S * 1.08 / W) * (1 - stop * .05) + lead * Math.sin(t * .7 + h.i * 2) * (1 - slow);
        h.x = baseX * W; h.nod = h.i ? 1 : -1;
        h.head = win(t, 14.6, 15.6, 17, 18) * .35 + Math.sin(t * 2 + h.i) * .04 * stop;
      });
      // horses face each other at the end: the second turns
      horses.forEach(h => {
        const dir = h.i === 1 ? Math.cos(Math.PI * between(t, 13.2, 14.1)) : 1, an = horseAnchors(h.neck);
        const wind = -9 * (1 - stop) - 3;
        h.tail.update(an.tail[0], an.tail[1], -.8, .55, dt, wind, 2.5, 12);
        h.mane.forEach((m, j) => m.update(an.crest[j][0], an.crest[j][1], -.9, .35, dt, wind, 1.5, 14));
        const y = ground + (h.i ? -S * .08 : 0), sz = S * (h.i ? .94 : 1);
        g.globalAlpha = alpha * .35; g.fillStyle = '#1a0f08'; g.beginPath(); g.ellipse(h.x, y + 2, sz * .7, sz * .06, 0, 0, TAU); g.fill();
        g.globalAlpha = alpha;
        g.save(); if (dir < 1) { g.translate(h.x, 0); g.scale(Math.sign(dir) * Math.max(.08, Math.abs(dir)), 1); g.translate(-h.x, 0); }
        drawHorse(g, h.x, y, sz, h, h.col, h.far); g.restore();
        if (h.amp > .4 && Math.random() < .6) dust.push({ x: h.x - sz * .4, y: y - 2, vx: -40 - Math.random() * 60, vy: -20 - Math.random() * 30, life: 1.3, age: 0, r: 4 + Math.random() * 10 });
      });
      g.globalCompositeOperation = 'lighter';
      for (let i = dust.length - 1; i >= 0; i--) { const d = dust[i]; d.age += dt; if (d.age > d.life) { dust.splice(i, 1); continue; } d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 10 * dt; g.globalAlpha = alpha * .07 * (1 - d.age / d.life); g.drawImage(glowW, d.x - d.r * 2, d.y - d.r * 2, d.r * 4, d.r * 4); }
      // pollen catching the last sun
      for (let i = 0; i < 40 * env.q + 10; i++) { const x = ((i * 97.3 + t * (18 + i % 7 * 4)) % (W + 40)) - 20, y = H * (.45 + ((i * 53) % 40) / 100) + Math.sin(t + i) * 10; g.globalAlpha = alpha * (.2 + .3 * Math.sin(t * 2 + i)) * golden + .05; g.drawImage(glowS, x - 3, y - 3, 6, 6); }
      g.globalCompositeOperation = 'source-over';
      grass(g, W, H, t, alpha, pan * 1.6, '#0d0805', 1 - stop * .5);
    }
    // ---------- shot B ----------
    function shotB(t, dt, W, H, alpha) {
      const k = t - B_START, portrait = env.portrait;
      const night = between(k, 3, 13);
      // 2.5D: sky, horizon, rock and lions, foreground tree and grass each sit at their own depth
      const wdB = wander(k, 5.2, .7), cxB = wdB.x * .8 + env.look.x * .8, cyB = wdB.y * .45 + env.look.y * .5, zB = .05 * between(k, 0, 26), AMP = W * .028, F = .6;
      const lay = d => { const sc = 1.05 + zB * d, ox = W / 2 - W / 2 * sc - cxB * AMP * (d - F), oy = H * .62 - H * .62 * sc - cyB * AMP * (d - F); g.setTransform(rs * sc, 0, 0, rs * sc, rs * ox, rs * oy); return [ox, oy, sc]; };
      skyOff = lay(0);
      const hz = H * (portrait ? .66 : .7);
      const top = mix3('#24315e', '#070b1d', night), mid = mix3('#d46a4a', '#2a2346', night), low = mix3('#ffc272', '#6a3c4a', night);
      const gr = g.createLinearGradient(0, 0, 0, hz); gr.addColorStop(0, top); gr.addColorStop(.62, mid); gr.addColorStop(1, low);
      g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(-W * .05, -H * .05, W * 1.1, hz + H * .1);
      // stars arrive with the night
      g.fillStyle = '#f4f0ff';
      stars.forEach(s => { const a = night * (.35 + .65 * (.5 + .5 * Math.sin(s.p + t * s.s))); if (a < .03) return; g.globalAlpha = alpha * a; g.fillRect(s.x * W, s.y * hz, s.r, s.r); });
      // setting sun
      const sunY = lerp(hz - H * .12, hz + H * .1, easeInOut(between(k, 0, 9))), sr = Math.min(W, H) * .14, sx = W * (portrait ? .5 : .62);
      g.globalAlpha = alpha * (1 - night * .7); g.globalCompositeOperation = 'lighter'; g.drawImage(sunGlow, sx - sr * 5, sunY - sr * 3.5, sr * 10, sr * 7); g.globalCompositeOperation = 'source-over';
      g.save(); g.beginPath(); g.rect(0, 0, W, hz); g.clip(); g.globalAlpha = alpha * (1 - night * .4); g.fillStyle = '#ffd890'; g.beginPath(); g.arc(sx, sunY, sr, 0, TAU); g.fill(); g.restore();
      // heart constellation
      const form = between(k, 13, 18);
      if (form > 0) {
        const pts = heart.map(heartXY);
        g.globalAlpha = alpha * form * .5; g.strokeStyle = '#f2dcae'; g.lineWidth = .8; g.beginPath();
        const n = Math.floor(pts.length * between(k, 14, 19)); for (let i = 0; i <= n && i < pts.length; i++) i ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1]); if (n >= pts.length) g.closePath(); g.stroke();
        g.globalCompositeOperation = 'lighter';
        pts.forEach(([x, y], i) => { if (i === 0 && fell) return; const tw = .7 + .3 * Math.sin(t * 3 + i); const s = (i === 0 ? 34 : 16) * tw; g.globalAlpha = alpha * form * (i === 0 ? 1 : .8); g.drawImage(spark, x - s / 2, y - s / 2, s, s); });
        g.globalCompositeOperation = 'source-over';
        if (!fell && k > 21.2) { fell = true; fallAt = t; env.audio.sfx('sparkle', .8); }
      }
      // shooting star
      const ss = between(k, 10.5, 11.6); if (ss > 0 && ss < 1) { const x0 = W * .85, y0 = H * .08; const x = lerp(x0, W * .45, ss), y = lerp(y0, H * .26, ss); g.globalAlpha = alpha * Math.sin(ss * Math.PI); const lg = g.createLinearGradient(x, y, x + W * .1, y - H * .05); lg.addColorStop(0, '#fff'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.strokeStyle = lg; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + W * .1, y - H * .05); g.stroke(); }
      // distant acacias on the horizon
      lay(.22);
      g.globalAlpha = alpha; g.fillStyle = mix3('#3a1f2a', '#0b0a16', night);
      g.beginPath(); g.moveTo(-W * .05, hz); for (let x = -W * .05; x <= W * 1.05; x += 8) g.lineTo(x, hz - 4 - fbm(x / 160, 2, 3) * 10 - 6); g.lineTo(W * 1.05, H * 1.1); g.lineTo(-W * .05, H * 1.1); g.fill();
      const gg = g.createLinearGradient(0, hz, 0, H); gg.addColorStop(0, 'rgba(255,170,100,' + (.12 * (1 - night)) + ')'); gg.addColorStop(1, 'rgba(4,3,8,.9)'); g.fillStyle = gg; g.fillRect(-W * .05, hz - 4, W * 1.1, H * 1.1 - hz + 4); g.fillStyle = mix3('#3a1f2a', '#0b0a16', night);
      acacias.forEach(a => acacia(g, a.x * W, hz - 6, a.s * Math.min(W, H) * .1));
      // big acacia and rock in the foreground
      const ink = '#07060d';
      lay(.6);
      const rk = Math.min(W, H) * (portrait ? .36 : .36), rx = W * (portrait ? .5 : .66), ry = hz - rk * (portrait ? .12 : .32);
      g.beginPath(); g.moveTo(rx - rk * 1.6, H); g.bezierCurveTo(rx - rk * 1.2, ry + rk * .1, rx - rk * .9, ry - rk * .02, rx - rk * .55, ry - rk * .05);
      g.lineTo(rx + rk * .7, ry - rk * .08); g.bezierCurveTo(rx + rk * .95, ry - rk * .05, rx + rk * 1.0, ry + rk * .1, rx + rk * 1.05, ry + rk * .2); g.bezierCurveTo(rx + rk * 1.4, ry + rk * .3, rx + rk * 1.8, ry + rk * .5, W * 1.08, H * 1.1); g.lineTo(rx - rk * 1.6, H * 1.1); g.fill();
      // lions, the lioness leaning in
      const lean = win(k, 6, 9, 30, 33);
      const ls = rk * .5, lyy = ry - rk * .07;
      drawLion(g, rx - rk * .1, lyy, ls, { mane: true, dir: 1, head: -.05 + lean * .12, tail: t * 1.3, col: ink, far: '#14111d' });
      drawLion(g, rx + rk * .66 - lean * rk * .06, lyy, ls * .9, { mane: false, dir: -1, head: .1 + lean * .26 + Math.sin(t * 1.4) * .02 * lean, tail: t * 1.1 + 2, col: ink, far: '#14111d' });
      // the big acacia stands nearest, framing the pair
      lay(.92); g.fillStyle = ink; acacia(g, W * (portrait ? .08 : .17), H * 1.02, Math.min(W, H) * (portrait ? .62 : .5), true);
      // fireflies over the grass
      lay(.85); g.globalCompositeOperation = 'lighter';
      flies.forEach(f => { const a = night * (.5 + .5 * Math.sin(t * 3 * f.s + f.p)); if (a < .05) return; const x = (f.x + Math.sin(t * .2 + f.p) * .03) * W, y = (f.y + Math.sin(t * .5 * f.s + f.p) * .02) * H; g.globalAlpha = alpha * a; g.drawImage(glowS, x - 5, y - 5, 10, 10); });
      g.globalCompositeOperation = 'source-over';
      lay(1); grass(g, W, H, t, alpha, 0, ink, .5);
      g.setTransform(rs, 0, 0, rs, 0, 0);
    }
    function grass(g, W, H, t, alpha, scroll, col, windy) {
      g.globalAlpha = alpha; g.strokeStyle = col; g.lineCap = 'round';
      blades.forEach(b => {
        const x = (((b.x * (W + 80) - scroll * (.6 + b.d * .8)) % (W + 80)) + W + 80) % (W + 80) - 40, base = H + 4, h = b.h * H * (env.portrait ? .7 : 1);
        const bend = (Math.sin(t * 1.6 + b.p + x * .01) * .5 + .5) * 14 * windy + 6 * windy;
        g.lineWidth = b.w; g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x - bend * .2, base - h * .55, x - bend, base - h); g.stroke();
      });
    }
    let fallAt = 0;
    return {
      resize, progress: () => clamp(T / LEN),
      update(dt, t) {
        dt *= TS; t *= TS; // the film runs a touch faster than real time
        T = t; const W = env.W, H = env.H;
        if (!cardShown) { cardShown = true; env.letterbox(true); env.chapterCard('IV', 1700); }
        cues(t - 1);
        g.setTransform(rs, 0, 0, rs, 0, 0);
        const t2 = Math.max(0, t - 1), mixAB = between(t2, B_START, B_START + 2.4);
        g.globalAlpha = 1; g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H);
        if (mixAB < 1) shotA(t2, dt, W, H, 1);
        if (mixAB > 0) shotB(t2, dt, W, H, mixAB);
        g.globalAlpha = 1;
        // the brightest star falls toward the next chapter
        if (fell) {
          const k = clamp((t - fallAt) / 3.2), [hx, hy] = heartXY(heart[0]), hx0 = skyOff[0] + hx * skyOff[2], hy0 = skyOff[1] + hy * skyOff[2], x = lerp(hx0, W * .5, k), y = lerp(hy0, H * .62, easeIn2(k));
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1; const s = 40 + k * 60; g.drawImage(spark, x - s / 2, y - s / 2, s, s); g.drawImage(glowW, x - s * 2, y - s * 2, s * 4, s * 4); g.globalCompositeOperation = 'source-over';
          if (Math.random() < .8) fx.trail(x, y, { life: 1.5, size: 1.8, vy: -30 });
          if (k >= 1 && !ended) { ended = true; env.letterbox(false); env.next({ transition: 'white' }); }
        }
      },
      destroy() { env.letterbox(false); },
    };
  },
};
const easeIn2 = t => t * t;
function mix3(a, b, k) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)), pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',')})`;
}
function acacia(g, x, y, s, big) {
  g.save(); g.translate(x, y);
  g.beginPath(); g.moveTo(-s * .03, 0); g.lineTo(-s * .02, -s * .45); g.lineTo(-s * .25, -s * .7); g.lineTo(-s * .22, -s * .72); g.lineTo(0, -s * .52); g.lineTo(s * .2, -s * .75); g.lineTo(s * .23, -s * .73); g.lineTo(s * .03, -s * .45); g.lineTo(s * .04, 0); g.fill();
  g.beginPath(); const n = big ? 40 : 18;
  for (let i = 0; i <= n; i++) { const u = i / n, px = lerp(-s * .55, s * .55, u), py = -s * .74 - Math.sin(u * Math.PI) * s * .12 - (Math.sin(u * 37) * .5 + .5) * s * .03; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  for (let i = n; i >= 0; i--) { const u = i / n, px = lerp(-s * .52, s * .52, u), py = -s * .7 + Math.sin(u * 23) * s * .015; g.lineTo(px, py); }
  g.fill(); g.restore();
}
/** A broad-winged bird soaring on thermals. */
function drawGlider(g, x, y, s, t) {
  const f = Math.sin(t * 1.1) * .15 + (Math.sin(t * .37) > .85 ? Math.sin(t * 9) * .4 : 0);
  g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = '#1c1210';
  g.beginPath(); g.moveTo(-2, -.2 - f); g.quadraticCurveTo(-1, -.35 - f * .5, 0, 0); g.quadraticCurveTo(1, -.35 - f * .5, 2, -.2 - f); g.quadraticCurveTo(1.1, .05, .15, .25); g.lineTo(0, .5); g.lineTo(-.15, .25); g.quadraticCurveTo(-1.1, .05, -2, -.2 - f); g.fill();
  g.restore();
}
