// Chapter IV, an original short film in two shots:
//  A. golden prairie: two wild horses, a buckskin stallion and a pinto mare. She holds the screen to run
//     with them (the camera tracks, the grass rushes past); letting go lets them ease to a walk; a tap
//     sends them leaping. When they have crossed the prairie they slow and stand nose to nose, and the
//     film dissolves into a painted close-up of the two of them touching noses in the low sun.
//  B. the savanna: two lions on a great rock above the plains, alive on the painting itself through a 2D skeleton
//     rig (creatures.js Pride, tools/lion_rig.py): they breathe, she looks up at him, he turns to her, they meet eyes
//     and slow-blink, she leans in and he lowers his head to hers; the gusts move his mane and their ears, her tail
//     sways. The painted sunset dissolves plane by plane into the same place at night; the stars gather (she links
//     them, their eyes follow) and the brightest one falls while they watch it.
// One wind (wind.js) runs through both shots: on the prairie a gust reaches the near grass, then the horses' manes,
// the heavier hair answering later; on the savanna it crosses the foreground grass and then his mane.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, easeOut, rng, glowSprite, sparkleSprite, TAU } from '../util.js';
import { loadHorse, Horse } from './horses.js';
import { loadPride, Pride } from './creatures.js';
import { windAt, follower, WIND_DIR } from '../wind.js';
import { loadDepth, DepthView, wander } from '../depth.js';
import { loadClip, play, stop, setRate, progress as clipAt, drawable, drawCover } from '../video.js';

let prairie, prairieDepth, horseMeta, kiss, lionsDay, lionsNight, prideData, clips = null;
// where things sit in the paintings, as fractions of the image
const NOSE = { x: .553, y: .55 };                // where the two muzzles meet in the close-up
const LIONS = { x: .53, y: .33 };                // the pair on the rock
const HORIZON = .6;                              // the stars stay above this line
const HEART = { x: .24, y: .2 };                 // the constellation, in the open sky (wide screens)
const TS = 1.15;
const B_LEN = 27;       // shot B runs this long once it starts
const AUTO_AFTER = 4.5; // if nobody touches the screen, the horses set off on their own
const B_IN = 2.6;       // the kiss flares into the savanna over this long
const SAV = { dir: 1, seed: 7 };
const PDIR = WIND_DIR.film ?? -1, PRAIRIE = { seed: 3 };   // the savanna's evening wind blows off the setting sun (toward screen right); the prairie's is WIND_DIR.film

export default {
  id: 'film', music: 'film', bed: 'wind',
  async load(env) {
    // filmed plates for shot A (tools/video/): the gallop (a tall framing on phones) and the close-up
    if (!env.reduced && !clips) {
      clips = await Promise.all([loadClip(env.portrait ? 'runp' : 'run'), loadClip('kiss')]);
      if (clips[0].failed && env.portrait) clips[0] = await loadClip('run');
    }
    // (shot B no longer plays the filmed lions, lions.mp4: the generated clip warped her face as she turned)
    [prairie, prairieDepth, kiss, lionsDay, lionsNight, prideData, ...horseMeta] = await Promise.all([loadImage(asset('img/prairie-gold.webp')), loadDepth('prairie-gold'), loadDepth('horses-kiss'), loadDepth('lions'), loadDepth('lions-night'), env.reduced ? null : loadPride(), loadHorse('horse-buckskin'), loadHorse('horse-paint')]);
  },
  create(env) {
    const { el, fx } = env;
    env.pups.set('hidden');
    el.innerHTML = '<canvas class="full"></canvas>';
    const cv = el.querySelector('canvas'), g = cv.getContext('2d', { alpha: false }), hint = text => env.hint(text);   // in the dock
    const R = rng(91);
    const glowW = glowSprite('255,214,150', 256, 1.4), glowS = glowSprite('255,236,200', 64, 2), spark = sparkleSprite('255,240,210', 48), sunGlow = glowSprite('255,170,80', 256, 1.2), dustS = glowSprite('230,190,140', 64, 1.6);
    // the two horses: the stallion runs nearer the camera, the mare a stride behind and a little farther
    const stallion = new Horse(horseMeta[0], { mane: '#120c09', maneHi: '#6b4a2c', seed: 1 });
    const mare = new Horse(horseMeta[1], { mane: '#2a150b', maneHi: '#8a5a34', seed: 4 });
    // grass for the foreground of both shots
    const blades = Array.from({ length: Math.round(160 * env.q + 60) }, () => ({ x: R(), h: .04 + R() * R() * .11, w: .6 + R() * 1.6, p: R() * TAU, d: R() }));
    const dust = [];
    // twinkling stars over the painted night sky (image space, above the horizon)
    const stars = Array.from({ length: Math.round(160 * env.q + 50) }, () => ({ x: R(), y: R() * HORIZON * .9, r: R() * R() * 1.5 + .4, p: R() * TAU, s: .5 + R() * 2 }));
    // a crescent moon of stars in the upper sky (the opening's crescent, come round again); its upper tip is the brightest
    // star, the one that falls. heartC is where the constellation sits this frame.
    const D2 = Math.PI / 180, crescent = [
      ...Array.from({ length: 8 }, (_, i) => { const a = (-70 - i * 220 / 7) * D2; return [Math.cos(a), Math.sin(a)]; }),          // the outer rim, round the left
      ...Array.from({ length: 6 }, (_, j) => { const a = (96.6 + (j + 1) * 166.8 / 7) * D2; return [.45 + .946 * Math.cos(a), .946 * Math.sin(a)]; })]; // the inner rim, back up
    const heart = crescent.map(([x, y]) => [x * .72 + .12, y * .72 + .32]);
    let heartC = [0, 0, 1];
    const heartXY = ([x, y]) => [heartC[0] + x * heartC[2], heartC[1] + y * heartC[2]];
    const flies = Array.from({ length: Math.round(30 * env.q + 10) }, () => ({ x: R(), y: .7 + R() * .25, p: R() * TAU, s: .3 + R() }));

    let T = 0, ended = false, fell = false, cardShown = false;
    // she draws the constellation: a touch or a stroke near the stars links the next one (in order, forgiving), each the
    // next note of the theme; left alone for a while it draws itself. When it is whole it glows, and its brightest star falls.
    const C = { on: false, at: 0, k: 0, linked: 0, last: -9, touched: -9, done: -1, pts: [], down: false, hinted: false };
    const linkNext = byHand => {
      if (C.linked >= heart.length || T - C.last < (byHand ? .12 : .45)) return;
      const i = C.linked++, [x, y] = C.pts[i] || [0, 0]; C.last = T; if (byHand) C.touched = T;
      fx.burst(x, y, { n: 10, speed: 40, life: 1.1, size: 1.3, color: '255,232,180' });
      env.audio.hit ? env.audio.hit('star', { index: i, of: heart.length }) : env.audio.sfx('glint', .35);
      if (byHand && C.hinted) { C.hinted = 2; hint(null); }
      lions?.event('link', { x, y, i });
      if (C.linked >= heart.length) { C.done = C.k; hint(null); env.audio.hit?.('heart'); env.say('星星替我们，记住了今晚。'); lions?.event('done'); }
    };
    const reach = (x, y) => {
      if (!C.on || C.linked >= heart.length || !C.pts.length) return;
      const nx = C.pts[C.linked], dn = Math.hypot(nx[0] - x, nx[1] - y), da = Math.min(...C.pts.map(q => Math.hypot(q[0] - x, q[1] - y)));
      if (dn < 90 || da < 56) linkNext(true);
    };
    el.addEventListener('pointerdown', e => { if (C.on) { C.down = true; reach(e.clientX, e.clientY); } });
    addEventListener('pointermove', e => { if (C.down) reach(e.clientX, e.clientY); }, { passive: true });
    const lift = () => { C.down = false; }; addEventListener('pointerup', lift); addEventListener('pointercancel', lift);
    let [clipRun, clipKiss] = clips || [];
    let filmed = !!(clipRun && clipKiss && !clipRun.failed && !clipKiss.failed);
    const viewA = new DepthView(prairieDepth, { amp: .035, focus: .55 }), tmp = {};
    const viewK = new DepthView(kiss, { amp: .03, focus: .7 }), viewD = new DepthView(lionsDay, { amp: .03, focus: .62 }), viewN = new DepthView(lionsNight, { amp: .03, focus: .62 });
    // the pair's own life (no motion at all when reduced): one plan, played on the sunset and the night planes
    const lions = prideData && !env.reduced ? new Pride(prideData, [lionsDay.layers[2], lionsNight.layers[2]], { software: env.software }) : null;
    const sav = { shoot: null, fall: null };
    // ---------- shot A state ----------
    const A = { run: 0, speed: 0, held: false, heldAt: -1, touched: false, auto: false, scroll: 0, done: false, doneAt: 0, meet: 0, jumpAt: -9, said: 0, kissAt: 0, bAt: 0 };
    const sayA = [[.12, '愿你有奔向旷野的自由，'], [.48, '也有一起奔跑的人。']];
    const down = e => { if (e.target.closest('#hud,#menu,#btn-next')) return; A.held = true; A.heldAt = T; A.touched = true; A.px = e.clientX; A.py = e.clientY; hint(null); };
    const up = e => {
      if (!A.held) return; A.held = false;
      // a quick tap (not a hold) sends them leaping
      if (!filmed && T - A.heldAt < .28 && Math.hypot(e.clientX - A.px, e.clientY - A.py) < 16 && !A.done && T - A.jumpAt > 1.6) {
        A.jumpAt = T; A.speed = Math.max(A.speed, .9); env.audio.sfx('whoosh', .5);
        stallion.play('Gallop_Jump'); setTimeout(() => mare.play('Gallop_Jump'), 140);
      }
    };
    el.addEventListener('pointerdown', down); addEventListener('pointerup', up); addEventListener('pointercancel', up);
    const cuesB = env.cues([
      [2.8, 7.4, '后来，太阳慢慢落下去了，'], [8.0, 13.2, '也有停下来的时候，', '可以安心靠近的温柔'], 
    ]);
    let rs = 1;
    // the manes are heavy: they answer a gust a moment after the grass does, and overshoot a little
    const maneS = follower({ stiffness: 6, damping: 2.6, mass: 1.4 }), maneM = follower({ stiffness: 5, damping: 2.4, mass: 1.5 });
    const grassW = new Float32Array(48); let grassT = -1;
    // their breath in the cooling evening air: a soft puff from the nostrils on each slow exhale while they stand,
    // carried off by the wind
    const puffs = [], puffPh = [0, .45];
    function breathe(g, t, dt, hs, dirs, hh, alpha, standing) {
      hs.forEach((h, i) => {
        const ph = (t / (3.1 + i * .5) + puffPh[i]) % 1, prev = h.puffPrev ?? ph; h.puffPrev = ph;
        if (standing && ph < prev) for (let k = 0; k < 4; k++) puffs.push({ x: h.nose[0], y: h.nose[1], vx: dirs[i] * hh * (.05 + .05 * Math.random()), vy: -hh * (.01 + .02 * Math.random()), age: -k * .07, life: 1.5 + Math.random() * .6, r: hh * (.025 + .02 * Math.random()) });
      });
      const W = env.W, wx = PDIR * windAt(t, .5, PRAIRIE) * hh * .25;
      g.globalCompositeOperation = 'screen';
      for (let i = puffs.length - 1; i >= 0; i--) {
        const q = puffs[i]; q.age += dt; if (q.age > q.life) { puffs.splice(i, 1); continue; } if (q.age < 0) continue;
        q.vx += (wx - q.vx) * dt * .9; q.vy -= hh * .01 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.r += hh * .05 * dt;
        const u = q.age / q.life; g.globalAlpha = alpha * .16 * Math.sin(Math.min(1, u * 3) * Math.PI / 2) * (1 - u);
        g.drawImage(glowS, q.x - q.r, q.y - q.r, q.r * 2, q.r * 2);
      }
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = alpha; void W;
    }
    const nightCv = canvas(1, 1), ng = nightCv.getContext('2d'), stripCv = canvas(1, 1), washCv = canvas(40, 70);
    // the frame she can use (safe-area insets, the dock's band at the bottom, the HUD row at the top), refreshed on resize
    let safe = env.safe(), safeAt = 0;
    function resize() { rs = env.res(false); cv.width = nightCv.width = Math.round(env.W * rs); cv.height = nightCv.height = Math.round(env.H * rs); safe = env.safe(); safeAt = T; }
    // the painted shots are framed inside the letterbox (style.css #bars): this is the visible band
    const band = () => { const b = env.portrait ? env.H * .07 : Math.max(env.H * .055, (env.H - env.W / 2.2) / 2); return [b, env.H - 2 * b]; };
    /** Cover-fits a painting to the band, keeping point (px, py) of it at height `at` of the band. */
    function fit(iw, ih, px, py, at, zoom = 1) {
      const W = env.W, [b0, bh] = band(), s = Math.max(W / iw, bh / ih) * zoom;
      const x = env.portrait ? clamp(W * .5 - px * iw * s, W - iw * s, 0) : (W - iw * s) * .5;
      return { s, x, y: clamp(b0 + at * bh - py * ih * s, b0 + bh - ih * s, b0) };
    }
    resize();

    // ---------- shot A ----------
    function shotA(t, dt, W, H, alpha) {
      const portrait = env.portrait;
      // input: hold to run; after a while with no touch at all, they run anyway
      if (!A.touched && t > AUTO_AFTER) A.auto = true;
      if (!A.touched && t > 2.6 && !A.hinted) { A.hinted = true; hint('按住屏幕，和它们一起奔跑'); }
      const jumping = t - A.jumpAt < 1.5;
      const want = A.done ? 0 : (A.held || A.auto || jumping) ? 1 : A.run > 0 ? .3 : 0;
      A.speed += (want - A.speed) * (1 - Math.exp(-dt * (want > A.speed ? 1.6 : 1.1)));
      if (!A.done) A.run = Math.min(1, A.run + dt * A.speed / 11);
      if (A.run >= 1 && !A.done) { A.done = true; A.doneAt = t; hint(null); }
      A.scroll += dt * A.speed;
      for (const [at, line] of sayA) if (A.run >= at && A.said < at) { A.said = at; env.say(line); setTimeout(() => { if (A.said === at) env.say(null); }, 4200); }
      if (A.kissAt && !A.meetSaid && t - A.kissAt > 1.4) { A.meetSaid = true; env.say('风走过很远的路，终于停在你身边。'); }
      // ---------- background: the painting's planes, the camera tracking across it ----------
      const ih = prairie.height, iw = prairie.width, sc = Math.max(W / iw, H / ih) * (portrait ? 1.02 : 1.08);
      const dw = iw * sc, dh = ih * sc, oy = (H - dh) * (portrait ? .62 : .58);
      const track = lerp(-1.2, 1.1, easeInOut(A.run)), wd = wander(t, 3.7, .8);
      viewA.frame({ s: sc, x: (W - dw) * lerp(.15, .85, easeInOut(A.run)), y: oy },
        { x: track + wd.x * .2 + env.look.x * .6, y: wd.y * .25 + env.look.y * .4 - A.speed * .15, zoom: .05 * A.speed + .08 * (A.done ? easeInOut(clamp((t - A.doneAt) / 6)) : 0), focus: .55 }, [W / 2, H * .62]);
      g.globalAlpha = alpha; viewA.draw(g, 0, 3);
      // golden haze and the low sun
      const golden = A.done ? 1 - between(t - A.doneAt, 3, 8) * .4 : 1;
      const hm = viewA.at(.02, tmp), sunX = hm.x + 1200 * hm.s, sunY = hm.y + 450 * hm.s;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha * .55 * golden; const sg = W * .5; g.drawImage(sunGlow, sunX - sg, sunY - sg * .6, sg * 2, sg * 1.2); g.globalCompositeOperation = 'source-over';
      // ---------- the horses, between the tall grass and the near grass ----------
      const ground = viewA.at(.78, tmp), gy = ground.y + 610 * ground.s, hh = portrait ? Math.min(W * .6, H * .26) : Math.min(W * .3, H * .36);
      const clip = s => s > .55 ? 'Gallop' : s > .1 ? 'Walk' : 'Idle';
      const rate = s => s > .55 ? .75 + s * .45 : s > .1 ? .55 + s * 1.2 : 1;
      [stallion, mare].forEach(h => { if (h.clip !== 'Gallop_Jump' || h.f > h.m.clips.Gallop_Jump.n - 2) h.play(clip(A.speed)); h.update(dt, rate(A.speed)); });
      // screen positions: they drift from left of centre to right of centre across the run; at the end the mare comes round to face him
      const lead = Math.sin(t * .6) * .015 * A.speed, meet = A.done ? easeInOut(clamp((t - A.doneAt) / 3.2)) : 0;
      A.meet = meet;
      const xs = (portrait ? lerp(.56, .66, easeInOut(A.run)) : lerp(.3, .56, easeInOut(A.run))) * W + lead * W, xm = xs + lerp(-hh * (portrait ? .62 : .9), hh * (portrait ? .62 : 1.18), meet) + Math.sin(t * .45) * .01 * W * A.speed;
      const ym = gy - hh * .07;
      // dust behind the hooves
      g.globalCompositeOperation = 'lighter';
      for (let i = dust.length - 1; i >= 0; i--) { const d = dust[i]; d.age += dt; if (d.age > d.life) { dust.splice(i, 1); continue; } d.x += (d.vx - A.speed * W * .12) * dt; d.y += d.vy * dt; d.vy += 8 * dt; g.globalAlpha = alpha * .1 * (1 - d.age / d.life); g.drawImage(dustS, d.x - d.r, d.y - d.r, d.r * 2, d.r * 2); }
      g.globalCompositeOperation = 'source-over';
      const flipM = meet > .5;
      // the gust reaches the grass at once (grass()), each mane a moment later and heavier; a strong one lifts them
      const wS = windAt(t, PDIR > 0 ? xs / W : 1 - xs / W, PRAIRIE), wM = windAt(t, PDIR > 0 ? xm / W : 1 - xm / W, PRAIRIE);
      const fS = maneS(dt, wS), fM = maneM(dt, wM);
      for (const [h, w, key] of [[stallion, wS, 'gS'], [mare, wM, 'gM']]) { if (w - (A[key] || 0) > .02 && w > .55 && t - (A[key + 't'] || -9) > 4) { A[key + 't'] = t; h.flick(.7 + .3 * w); } A[key] = (A[key] || 0) * .85 + w * .15; }
      const hm2 = mare.draw(g, xm, ym, hh * .94, { flip: flipM, alpha, wind: A.speed * .9 + .1, windX: PDIR * fM, dt, speed: A.speed });
      const hs = stallion.draw(g, xs, gy, hh, { alpha, wind: A.speed * .9 + .1, windX: PDIR * fS, dt, speed: A.speed });
      if (A.speed < .35 || puffs.length) breathe(g, t, dt, [hs, hm2], [1, flipM ? -1 : 1], hh, alpha, A.speed < .35);
      if (A.speed > .5) [...hs.hooves, ...hm2.hooves].forEach(([x, y]) => { if (Math.random() < .12 * A.speed) dust.push({ x, y, vx: -20 - Math.random() * 40, vy: -14 - Math.random() * 22, life: 1.1 + Math.random() * .8, age: 0, r: 10 + Math.random() * 22 }); });
      // noses touch: a soft warm glow where they meet, as the close-up dissolves in
      if (meet > .85) { const k = clamp((t - A.doneAt - 2.6) / 2), [nx, ny] = hs.nose; g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha * .35 * Math.sin(k * Math.PI); g.drawImage(glowW, nx - hh * .5, ny - hh * .5, hh, hh); g.globalCompositeOperation = 'source-over'; }
      // near grass plane in front of their legs, then a procedural fringe that rushes past with the speed
      g.globalAlpha = alpha; viewA.draw(g, 3);
      // pollen and the light, streaking with the run
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40 * env.q + 10; i++) { const x = (((i * 97.3 - A.scroll * (90 + i % 7 * 30) * W / 900 + t * 8) % (W + 40)) + W + 40) % (W + 40) - 20, y = H * (.4 + ((i * 53) % 45) / 100) + Math.sin(t + i) * 10; g.globalAlpha = alpha * (.18 + .3 * Math.sin(t * 2 + i)) * golden; const l = 3 + A.speed * 14; g.drawImage(glowS, x - l, y - 3, l * 2, 6); }
      g.globalCompositeOperation = 'source-over';
      grass(g, W, H, t, alpha, A.scroll * W * .9, '#2a1606', .55 + A.speed * .6, PDIR, PRAIRIE);
      // warm grade
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, `rgba(255,170,90,${.1 * golden})`); gr.addColorStop(.6, `rgba(255,180,100,${.12 * golden})`); gr.addColorStop(1, 'rgba(40,20,10,.28)');
      g.globalAlpha = alpha; g.fillStyle = gr; g.fillRect(0, 0, W, H);
      if (A.done && !A.kissAt && t - A.doneAt > 3.2) A.kissAt = t;
      if (A.kissAt) shotKiss(t - A.kissAt, W, H, alpha * easeInOut(between(t - A.kissAt, 0, 2.2)));
      if (A.kissAt && !A.bAt && t - A.kissAt > 8.5) A.bAt = t;
    }
    // ---------- shot A, filmed: the gallop runs at the pace she sets, then the close-up ----------
    // Holding the screen runs with them (the footage at full speed); left alone it eases into slow motion.
    // How far they have run is how far the clip has played.
    function shotAFilmed(t, dt, W, H, alpha) {
      if (!A.touched && t > AUTO_AFTER) A.auto = true;
      if (!A.touched && t > 2.6 && !A.hinted) { A.hinted = true; hint('按住屏幕，和它们一起奔跑'); }
      const want = A.done ? .6 : (A.held || A.auto) ? 1 : 0;
      A.speed += (want - A.speed) * (1 - Math.exp(-dt * (want > A.speed ? 1.8 : 1.2)));
      if (!A.started) { A.started = true; play(clipRun, .5, 0); }
      setRate(clipRun, lerp(.45, 1.05, A.speed));
      A.run = clamp(clipAt(clipRun) / .86); A.scroll += dt * A.speed;
      if (A.run >= 1 && !A.done) { A.done = true; A.doneAt = t; A.kissAt = t; hint(null); play(clipKiss, .8, 0); }
      for (const [at, line] of sayA) if (A.run >= at && A.said < at) { A.said = at; env.say(line); setTimeout(() => { if (A.said === at) env.say(null); }, 4200); }
      if (A.kissAt && !A.meetSaid && t - A.kissAt > 1.4) { A.meetSaid = true; env.say('风走过很远的路，终于停在你身边。'); }
      const [b0, bh] = band(), lx = env.look.x * .02, ly = env.look.y * .02, kissIn = A.kissAt ? easeInOut(between(t - A.kissAt, 0, 1.2)) : 0;
      if (kissIn < 1 || !drawable(clipKiss)) {
        swapRun();
        if (A.swap) { const x = easeInOut(clamp((T - A.swap.at) / .7)); frameRun(A.swap.old, alpha, lx, ly); frameRun(clipRun, alpha * x, lx, ly); if (x >= 1) { stop(A.swap.old); A.swap = null; } }
        else frameRun(clipRun, alpha, lx, ly);
      }
      // pollen and light streaking past with the run
      const golden = 1 - kissIn * .5;
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 30 * env.q + 8; i++) { const x = (((i * 97.3 - A.scroll * (90 + i % 7 * 30) * W / 900 + t * 8) % (W + 40)) + W + 40) % (W + 40) - 20, y = H * (.35 + ((i * 53) % 45) / 100) + Math.sin(t + i) * 10; g.globalAlpha = alpha * (.12 + .22 * Math.sin(t * 2 + i)) * golden * (1 - kissIn); const l = 3 + A.speed * 14; g.drawImage(glowS, x - l, y - 3, l * 2, 6); }
      g.globalCompositeOperation = 'source-over';
      if (kissIn > 0 && drawable(clipKiss)) shotKissFilmed(t - A.kissAt, W, H, alpha * kissIn);
      if (A.kissAt && !A.bAt && t - A.kissAt > 7.5) A.bAt = t;
    }
    /** The gallop, framed for the screen as it is now: cover when the clip's shape matches, a strip (wide clip, tall
     *  screen) or a pillar (tall clip, wide screen) otherwise, so nothing is ever cropped to a sliver or stretched. */
    function frameRun(clip, alpha, lx, ly) {
      if (!drawable(clip)) return;
      const [b0, bh] = band(), W = env.W, wide = clip.v.videoWidth > clip.v.videoHeight;
      if (env.portrait && wide) strip(clip, .42, alpha, 1.35);
      else if (!env.portrait && !wide) pillar(clip, alpha);
      else { g.globalAlpha = alpha; drawCover(g, clip, 0, b0, W, bh, .5 + lx, .5 + ly, 1.03 + .03 * A.speed); }
    }
    /** When the screen turns mid-run, the framing made for it is fetched, started at the same point of the run, and
     *  cross-faded in once it really plays (Low Power Mode may refuse it: then the strip / pillar simply stays). */
    function swapRun() {
      const want = env.portrait ? 'runp' : 'run';
      if (!clipRun || clipRun.name === want || A.done || A.swap) { if (A.next && A.next.name === clipRun?.name) A.next = null; return; }
      if (!A.next && !A.fetching) {
        A.fetching = true;
        loadClip(want).then(c => { A.fetching = false; if (ended || c.failed || A.done) return; play(c, clipRun.rate || 1, (c.v.duration || 4.375) * clamp(clipAt(clipRun))); A.next = c; });
      }
      const c = A.next; if (!c) return;
      if (c.blocked || c.failed) { stop(c); A.next = null; A.fetching = 'no'; return; }
      if (drawable(c) && !c.v.paused && c.v.currentTime > 0) { A.swap = { old: clipRun, at: T }; clipRun = c; if (clips) clips[0] = c; A.next = null; }
    }
    /** A tall clip on a wide screen: a pillar down the middle, soft at its sides, over a dim wash of the same light. */
    function pillar(clip, alpha) {
      const [b0, bh] = band(), W = env.W, v = clip.v, iw = v.videoWidth, ih = v.videoHeight, s = bh / ih, w = iw * s, x = (W - w) / 2;
      const wg = washCv.getContext('2d'); wg.filter = 'blur(4px)'; wg.drawImage(v, -8, -8, washCv.width + 16, washCv.height + 16);
      g.globalAlpha = alpha; g.imageSmoothingEnabled = true; g.drawImage(washCv, -W * .05, b0 - bh * .05, W * 1.1, bh * 1.1);
      g.fillStyle = 'rgba(22,11,4,.66)'; g.fillRect(0, b0, W, bh);
      if (stripCv.width !== Math.round(w * rs) || stripCv.height !== Math.round(bh * rs)) { stripCv.width = Math.round(w * rs); stripCv.height = Math.round(bh * rs); }
      const sg = stripCv.getContext('2d'); sg.setTransform(rs, 0, 0, rs, 0, 0); sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, w, bh);
      sg.drawImage(v, 0, 0, w, bh);
      const gr = sg.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.16, '#000'); gr.addColorStop(.84, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = gr; sg.fillRect(0, 0, w, bh);
      g.drawImage(stripCv, x, b0, w, bh);
    }
    /** A wide clip on a phone: a cinema strip across the screen, soft at its edges, over a dim wash of the same light. */
    function strip(clip, fx, alpha, wide = 1.55) {
      const [b0, bh] = band(), W = env.W, v = clip.v, iw = v.videoWidth, ih = v.videoHeight, s = W * wide / iw, h = ih * s, y = b0 + (bh - h) * .5;
      // the wash: the clip squeezed into a few pixels and stretched back up, a soft blur of its colours
      const wg = washCv.getContext('2d'); wg.filter = 'blur(4px)'; wg.drawImage(v, -8, -8, washCv.width + 16, washCv.height + 16);
      g.globalAlpha = alpha; g.imageSmoothingEnabled = true; g.drawImage(washCv, -W * .1, b0 - bh * .05, W * 1.2, bh * 1.1);
      g.fillStyle = 'rgba(22,11,4,.7)'; g.fillRect(0, b0, W, bh);
      const m = { s, x: W / 2 - fx * iw * s, y };
      // the strip melts into the wash at its top and bottom edges (an alpha mask, so no seam shows)
      if (stripCv.width !== Math.round(W * rs) || stripCv.height !== Math.round(h * rs)) { stripCv.width = Math.round(W * rs); stripCv.height = Math.round(h * rs); }
      const sg = stripCv.getContext('2d'); sg.setTransform(rs, 0, 0, rs, 0, 0); sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, W, h);
      sg.drawImage(v, m.x, 0, iw * s, h);
      const gr = sg.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.24, '#000'); gr.addColorStop(.76, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = gr; sg.fillRect(0, 0, W, h);
      g.drawImage(stripCv, 0, y, W, h);
      return m;
    }
    function shotKissFilmed(k, W, H, alpha) {
      const [b0, bh] = band(), v = clipKiss.v, iw = v.videoWidth || 1280, ih = v.videoHeight || 704;
      let m;
      if (env.portrait) m = strip(clipKiss, NOSE.x, alpha, 1.82); // close, but neither of them is cut off
      else { g.globalAlpha = alpha; m = drawCover(g, clipKiss, 0, b0, W, bh, NOSE.x, .5, 1.02 + .04 * easeOut(clamp(k / 8))); }
      const nx = m.x + NOSE.x * iw * m.s, ny = m.y + NOSE.y * ih * m.s, r = Math.min(W, H) * (.3 + Math.sin(k * 1.3) * .03); A.nose = [nx, ny];
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha * .22 * between(k, .8, 3); g.drawImage(glowW, nx - r, ny - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
      if (k > 2.2 && !A.sparkled) { A.sparkled = true; fx.burst(nx, ny, { n: 30, speed: 55, life: 1.8, size: 1.6, color: '255,226,170' }); env.audio.sfx('sparkle', .4); }
      g.globalAlpha = 1;
    }
    // ---------- the close-up: painted, nose to nose in the low sun ----------
    function shotKiss(k, W, H, alpha) {
      if (alpha <= 0) return;
      const iw = kiss.w, ih = kiss.h, base = fit(iw, ih, NOSE.x, NOSE.y, .56), s = base.s, wd = wander(k, 2.1, .6);
      viewK.frame(base, { x: wd.x * .6 + env.look.x * .7, y: wd.y * .4 + env.look.y * .4, zoom: .1 * easeOut(clamp(k / 10)), focus: .7 }, [base.x + NOSE.x * iw * s, base.y + NOSE.y * ih * s]);
      g.globalAlpha = alpha; viewK.draw(g);
      // the sun breathing between their muzzles
      const p = viewK.at(.7, tmp), nx = p.x + p.s * NOSE.x * iw, ny = p.y + p.s * NOSE.y * ih, r = Math.min(W, H) * (.32 + Math.sin(k * 1.3) * .03); A.nose = [nx, ny];
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha * .3 * between(k, .8, 3); g.drawImage(glowW, nx - r, ny - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
      if (k > 2.2 && !A.sparkled) { A.sparkled = true; fx.burst(nx, ny, { n: 30, speed: 55, life: 1.8, size: 1.6, color: '255,226,170' }); env.audio.sfx('sparkle', .4); }
      // a gentle vignette keeps the eye on the two of them
      const vg = g.createRadialGradient(nx, ny, Math.min(W, H) * .2, nx, ny, Math.max(W, H) * .8); vg.addColorStop(0, 'rgba(30,14,4,0)'); vg.addColorStop(1, 'rgba(30,14,4,.45)');
      g.globalAlpha = alpha; g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    // ---------- shot B: the painted savanna, sunset dissolving into night ----------
    function shotB(t, dt, W, H, alpha) {
      const k = t - B_START, portrait = env.portrait, night = easeInOut(between(k, 6, 14));
      // phones keep the pair in frame; wide screens see the whole vista
      const iw = lionsDay.w, ih = lionsDay.h, base = fit(iw, ih, LIONS.x, LIONS.y, .4, portrait ? 1 : 1.03), s = base.s;
      const wd = wander(k, 5.2, .7), cam = { x: wd.x * .8 + env.look.x * .8, y: wd.y * .45 + env.look.y * .5, zoom: .07 * easeInOut(between(k, 0, 26)), focus: .62 };
      const pivot = [base.x + LIONS.x * iw * s, base.y + LIONS.y * ih * s];
      viewD.frame(base, cam, pivot); viewN.frame(base, cam, pivot);
      if (lions) lions.update(k, dt, { T: viewD.T[2], W, H, t: T, wind: SAV, heart: C.on && C.pts.length ? (C.linked < C.pts.length ? C.pts[C.linked] : heartXY(heart[3])) : heartGuess(), shoot: sav.shoot, star: sav.fall });
      // the sunset, then the night composited on its own and dissolved over it; the night sky's stars and
      // heart live on its farthest plane, behind the rock
      if (night < 1) {
        g.globalAlpha = alpha; const nl = lionsDay.layers.length;
        viewD.draw(g, 0, 2); lions ? lions.draw(g, viewD, 0, rs) : viewD.draw(g, 2, 3); viewD.drawWind(g, nl - 1, t, 9, gust);
        birds(g, k, t, W, H, alpha * (1 - night));
        motes(g, t, W, H, alpha * (1 - night * .7));
      }
      if (night > 0) {
        ng.setTransform(rs, 0, 0, rs, 0, 0); ng.globalAlpha = 1; viewN.draw(ng, 0, 1);
        sky(ng, k, t, W, H, viewN.T[0], iw, ih);
        ng.globalAlpha = 1; viewN.draw(ng, 1, 2); lions ? lions.draw(ng, viewN, 1, rs) : viewN.draw(ng, 2, 3); viewN.drawWind(ng, 3, t, 7, gust);
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha * night; g.drawImage(nightCv, 0, 0);
        g.globalCompositeOperation = 'screen'; g.fillStyle = 'rgba(46,54,96,.26)'; g.fillRect(0, 0, nightCv.width, nightCv.height); g.restore();   // moonlight: the night reads, it does not swallow the pair
      }
      // fireflies over the grass
      g.globalCompositeOperation = 'lighter';
      flies.forEach(f => { const a = night * (.5 + .5 * Math.sin(t * 3 * f.s + f.p)); if (a < .05) return; const x = (f.x + Math.sin(t * .2 + f.p) * .03) * W, y = (f.y + Math.sin(t * .5 * f.s + f.p) * .02) * H; g.globalAlpha = alpha * a; g.drawImage(glowS, x - 5, y - 5, 10, 10); });
      g.globalCompositeOperation = 'source-over';
    }
    // wind through the savanna grass: the shared gusts (wind.js) arriving from the left, light blades answering at once,
    // with a flutter on top; one value per column per frame
    const gcol = new Float32Array(80); let gT = -1;
    const gust = x => {   // (on the film's own clock T, the same one the lions' mane reads, so it is one gust)
      if (T !== gT) { gT = T; for (let i = 0; i < 80; i++) { const u = i / 79, w = windAt(T, SAV.dir > 0 ? u : 1 - u, SAV); gcol[i] = SAV.dir * (w * 1.15 - .2 + .3 * w * Math.sin(T * 2.6 - u * 26 + i * .7)); } }
      return gcol[Math.min(79, Math.max(0, Math.round(x * 79)))];
    };
    // a few birds heading home across the sunset, wings beating then gliding
    const flock = Array.from({ length: 7 }, (_, i) => ({ dx: (R() - .5) * .16 - i * .02, dy: (R() - .5) * .07, ph: R() * TAU, s: .7 + R() * .5, delay: R() * .6 }));
    function birds(g, k, t, W, H, a) {
      if (a < .02) return;
      g.save(); g.strokeStyle = 'rgba(48,22,18,.85)'; g.lineCap = 'round'; g.lineJoin = 'round';
      for (const [k0, dur, y0, dir] of [[1, 11, .2, -1], [7.5, 9, .12, 1]]) {
        const u = (k - k0) / dur; if (u < -.2 || u > 1.3) continue;
        flock.forEach((b, i) => {
          if (i > (dir > 0 ? 3 : 6)) return;
          const v = u - b.delay * .1, x = (dir < 0 ? lerp(1.12, -.15, v) : lerp(-.15, 1.12, v)) * W + b.dx * W, y = (y0 + b.dy + Math.sin(v * 3 + b.ph) * .01) * H;
          const sz = Math.min(W, H) * .016 * b.s, beat = (t * 1.1 + b.ph) % 3 < 1.6 ? Math.sin(t * 11 + b.ph) : .25;
          g.globalAlpha = a * clamp(v * 8) * clamp((1.1 - v) * 8); g.lineWidth = Math.max(1, sz * .16);
          g.beginPath(); g.moveTo(x - sz, y - sz * .5 * beat); g.quadraticCurveTo(x - sz * .4, y - sz * .35 * beat - sz * .1, x, y); g.quadraticCurveTo(x + sz * .4, y - sz * .35 * beat - sz * .1, x + sz, y - sz * .5 * beat); g.stroke();
        });
      }
      g.restore();
    }
    // warm specks of dust and pollen drifting in the low sun
    const specks = Array.from({ length: Math.round(40 * env.q + 14) }, () => ({ x: R(), y: R(), v: .006 + R() * .012, p: R() * TAU, s: .5 + R() }));
    function motes(g, t, W, H, a) {
      g.globalCompositeOperation = 'lighter';
      specks.forEach(m => { const x = ((m.x + t * m.v) % 1.1 - .05) * W, y = (m.y + Math.sin(t * .4 + m.p) * .03) * H, tw = .4 + .6 * Math.sin(t * 1.3 * m.s + m.p) ** 2; g.globalAlpha = a * tw * .5; const sz = 5 * m.s; g.drawImage(dustS, x - sz, y - sz, sz * 2, sz * 2); });
      g.globalCompositeOperation = 'source-over';
    }
    // the constellation's extent in its own units, so it can be kept clear of the HUD, the notch and the dock
    const HB = heart.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]);
    function placeHeart(W, H, X, Y) {
      let r0 = Math.min(W, H) * (env.portrait ? .27 : .14), cy = Y(env.portrait ? HEART.y * .8 : HEART.y);
      if (env.portrait) cy = Math.max(H * .1 + r0 * .5, cy - r0 * .75);   // on a phone: bigger, and up in the open sky above the pair
      let cx = X(env.portrait ? LIONS.x : HEART.x) - (env.portrait ? r0 * .2 : 0);
      if (T - safeAt > 1) { safe = env.safe(); safeAt = T; }
      const m = 28, x0 = safe.l + m, x1 = W - safe.r - m, y0 = safe.t + m, y1 = H - safe.b - m;   // (the next star's ring is ~20 px)
      r0 = Math.max(10, Math.min(r0, (x1 - x0) / (HB[2] - HB[0]), (y1 - y0) / (HB[3] - HB[1])));
      cx = clamp(cx, x0 - HB[0] * r0, Math.max(x0 - HB[0] * r0, x1 - HB[2] * r0)); cy = clamp(cy, y0 - HB[1] * r0, Math.max(y0 - HB[1] * r0, y1 - HB[3] * r0));
      heartC = [cx, cy, r0];
    }
    const heartGuess = () => heartC[2] > 1 ? heartXY(heart[3]) : null;
    function sky(g, k, t, W, H, P, iw, ih) {
      const X = u => P.x + P.s * u * iw, Y = v => P.y + P.s * v * ih;
      // stars arrive with the night
      g.fillStyle = '#f4f0ff';
      stars.forEach(st => { const a = .35 + .65 * (.5 + .5 * Math.sin(st.p + t * st.s)); g.globalAlpha = a; g.fillRect(X(st.x), Y(st.y), st.r, st.r); });
      // the heart: in the open sky on wide screens, above the pair on phones; always inside the safe frame
      placeHeart(W, H, X, Y);
      const form = between(k, 13, 15);
      if (form > 0) {
        const pts = C.pts = heart.map(heartXY); C.k = k;
        if (!C.on && form > .5) { C.on = true; C.at = k; C.onT = T; env.audio.section?.('stars'); }
        if (C.on && !C.hinted && k - C.at > .8 && !C.linked) { C.hinted = true; hint('用手指把星星连起来'); }
        if (C.on && C.linked < heart.length && (env.auto || T - Math.max(C.touched, C.last, C.onT) > (C.linked ? 3.5 : 6.5))) linkNext(false);   // left alone, it draws itself
        const whole = C.done >= 0 ? between(k - C.done, 0, 1.2) : 0;
        g.globalAlpha = form * (.5 + whole * .4); g.strokeStyle = '#f2dcae'; g.lineWidth = .8 + whole * .6; g.beginPath();
        for (let i = 0; i < C.linked && i < pts.length; i++) i ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1]);
        if (C.linked >= pts.length) g.closePath(); g.stroke();
        if (C.linked < pts.length && C.on) { // the next star breathes, so she knows where to go
          const [x, y] = pts[C.linked], r = 15 + 5 * Math.sin(t * 4); g.globalAlpha = .45 + .25 * Math.sin(t * 4); g.lineWidth = 1; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
        }
        g.globalCompositeOperation = 'lighter';
        pts.forEach(([x, y], i) => { // soft points of light; only the brightest one carries a glint
          if (i === 0 && fell) return; const tw = .82 + .18 * Math.sin(t * 1.4 + i * 1.7);
          if (i === 0) { const sz = 26 * tw; g.globalAlpha = form; g.drawImage(spark, x - sz / 2, y - sz / 2, sz, sz); }
          else { const sz = 11 * tw; g.globalAlpha = form * .75; g.drawImage(glowS, x - sz / 2, y - sz / 2, sz, sz); g.globalAlpha = form * .9; g.fillStyle = '#fff8ec'; g.fillRect(x - .8, y - .8, 1.6, 1.6); }
        });
        g.globalCompositeOperation = 'source-over';
        if (!fell && C.done >= 0 && k > C.done + 2.4) { fell = true; fallAt = t; env.say('最亮的那一颗，留给你。'); env.audio.hit ? env.audio.hit('fall') : env.audio.sfx('sparkle', .8); env.audio.section?.('gather'); lions?.event('fall'); }
      }
      // a shooting star
      const ss = between(k, 10.5, 11.6); sav.shoot = ss > 0 && ss < 1 ? [lerp(W * .85, W * .45, ss), lerp(H * .08, H * .26, ss)] : null;
      if (ss > 0 && ss < 1) { const x = lerp(W * .85, W * .45, ss), y = lerp(H * .08, H * .26, ss); g.globalAlpha = Math.sin(ss * Math.PI); const lg = g.createLinearGradient(x, y, x + W * .1, y - H * .05); lg.addColorStop(0, '#fff'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.strokeStyle = lg; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + W * .1, y - H * .05); g.stroke(); }
    }
    function grass(g, W, H, t, alpha, scroll, col, windy, dir = -1, wseed = PRAIRIE) {
      if (t !== grassT) { grassT = t; for (let i = 0; i < 48; i++) { const u = i / 47; grassW[i] = windAt(t, dir > 0 ? u : 1 - u, wseed); } }
      g.globalAlpha = alpha; g.strokeStyle = col; g.lineCap = 'round';
      blades.forEach(b => {
        const x = (((b.x * (W + 80) - scroll * (.6 + b.d * .8)) % (W + 80)) + W + 80) % (W + 80) - 40, base = H + 4, h = b.h * H * (env.portrait ? .7 : 1);
        const w = grassW[Math.max(0, Math.min(47, Math.round(x / W * 47)))];   // the gust here, now (blades answer at once)
        const bend = (Math.sin(t * 1.6 + b.p + x * .01) * .5 + .5) * 14 * windy + 6 * windy - dir * (w * 15 + w * 5 * Math.sin(t * 5.3 + b.p * 3));
        g.lineWidth = b.w; g.beginPath(); g.moveTo(x, base); g.quadraticCurveTo(x - bend * .2, base - h * .55, x - bend, base - h); g.stroke();
      });
    }
    let fallAt = 0;
    return {
      resize, lions, progress: () => A.bAt ? .5 + clamp((T - A.bAt) / B_LEN) * .5 : A.run * .5,
      debug: () => ({ T, bAt: A.bAt, stars: { on: C.on, linked: C.linked, n: heart.length, done: C.done, next: C.pts[C.linked] || null }, fell }),
      update(dt, t) {
        dt *= TS; t *= TS;
        T = t; const W = env.W, H = env.H;
        if (!cardShown) { cardShown = true; env.letterbox(true); env.chapterCard('IV', 1700); }
        if (!A.skip && t > 8) { A.skip = true; env.offerNext('跳过', () => { ended = true; env.letterbox(false); env.next({ transition: 'bloom', at: [env.W / 2, env.H * .5] }); }, { quiet: true }); }
        if (fell && A.skip === true) { A.skip = 1; env.offerNext(null); }
        if (env.audio.layer && !A.bAt && T - (A.pulseAt || -9) > .25) { A.pulseAt = T; env.audio.layer('pulse', clamp(.15 + A.speed * .85), .4); }
        if (A.kissAt && !A.kissSnd) { A.kissSnd = true; env.audio.section?.('close'); env.audio.hit?.('kiss'); }
        if (A.bAt && !A.savSnd) { A.savSnd = true; hint(null); env.audio.section?.('savanna'); env.audio.layer?.('pulse', 0, 3); }
        g.setTransform(rs, 0, 0, rs, 0, 0);
        const t2 = Math.max(0, t - 1);
        g.globalAlpha = 1; g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H);
        if (SHOT_B && !A.bAt) A.bAt = Math.max(.01, t2); // ?shot=b: straight to the savanna (testing)
        const tB = A.bAt ? t2 - A.bAt : -1, mixAB = tB < 0 ? 0 : between(tB, .45, B_IN);
        if (filmed && t2 > 1.2 && !A.started && !drawable(clipRun)) filmed = false; // no picture: the painted version
        if (mixAB < 1) (filmed ? shotAFilmed : shotA)(t2, dt, W, H, 1);
        if (filmed && mixAB >= 1 && !A.stopped) { A.stopped = true; stop(clipRun); stop(clipKiss); }
        if (mixAB > 0) { cuesB(tB); shotB(tB + B_START, dt, W, H, mixAB); }
        // the cut: the low sun between their muzzles flares up and fills the frame, and the savanna is there as it fades
        // (no double exposure of two paintings: the light covers the moment they overlap)
        if (tB >= 0 && tB < B_IN + .9) {
          const up = easeOut(clamp(tB / 1.05)), fl = up * (1 - between(tB, 1.25, B_IN + .9)), [nx, ny] = A.nose || [W / 2, H / 2];
          const R0 = Math.max(W, H) * lerp(.2, 1.25, up), gr = g.createRadialGradient(nx, ny, 0, nx, ny, R0);
          gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(.35, 'rgba(255,205,140,.9)'); gr.addColorStop(1, 'rgba(255,160,80,.55)');
          g.globalCompositeOperation = 'screen'; g.globalAlpha = .92 * fl; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
        }
        g.globalAlpha = 1;
        // the brightest star falls toward the next chapter
        if (fell) {
          const k = clamp((tB - fallAt) / 3.2), [hx0, hy0] = heartXY(heart[0]), x = lerp(hx0, W * .5, k), y = lerp(hy0, H * .62, easeIn2(k)); sav.fall = [x, y];
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1; const s = 40 + k * 60; g.drawImage(spark, x - s / 2, y - s / 2, s, s); g.drawImage(glowW, x - s * 2, y - s * 2, s * 4, s * 4); g.globalCompositeOperation = 'source-over';
          if (Math.random() < .8) fx.trail(x, y, { life: 1.5, size: 1.8, vy: -30 });
          if (k >= 1 && !ended) { ended = true; env.letterbox(false); env.next({ transition: 'star', at: [x, y] }); } // the same star goes on to light the first candle
        }
      },
      destroy() { lions?.dispose(); env.offerNext(null); env.letterbox(false); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('pointerup', lift); removeEventListener('pointercancel', lift); if (clipRun) { stop(clipRun); stop(clipKiss); } },
    };
  },
};
const B_START = 0;
const SHOT_B = new URLSearchParams(location.search).get('shot') === 'b';
const easeIn2 = t => t * t;
