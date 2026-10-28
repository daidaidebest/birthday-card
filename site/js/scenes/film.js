// Chapter IV, an original short film in two shots:
//  A. golden prairie: two wild horses, a buckskin stallion and a pinto mare. She holds the screen to run
//     with them (the camera tracks, the grass rushes past); letting go lets them ease to a walk; a tap
//     sends them leaping. When they have crossed the prairie they slow and stand nose to nose, and the
//     film dissolves into a painted close-up of the two of them touching noses in the low sun.
//  B. the savanna: two lions on a great rock above the plains, alive on the painting itself (they breathe,
//     the wind moves his mane, her tail flicks, ears twitch, eyes blink). The painted sunset dissolves
//     plane by plane into the same place at night; the stars gather into a heart and one falls.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, easeOut, rng, glowSprite, sparkleSprite, TAU } from '../util.js';
import { loadHorse, Horse } from './horses.js';
import { loadDepth, DepthView, wander } from '../depth.js';
import { loadClip, play, stop, setRate, progress as clipAt, drawable, drawCover } from '../video.js';

let prairie, prairieDepth, horseMeta, kiss, lionsDay, lionsNight, lionRig, clips = null;
// where things sit in the paintings, as fractions of the image
const NOSE = { x: .553, y: .55 };                // where the two muzzles meet in the close-up
const LIONS = { x: .53, y: .33 };                // the pair on the rock
const HORIZON = .6;                              // the stars stay above this line
const HEART = { x: .24, y: .2 };                 // the constellation, in the open sky (wide screens)
const TS = 1.15;
const B_LEN = 27;       // shot B runs this long once it starts
const AUTO_AFTER = 4.5; // if nobody touches the screen, the horses set off on their own

export default {
  id: 'film', music: 'film', bed: 'wind',
  async load(env) {
    // filmed plates for shot A (tools/video/): the gallop (a tall framing on phones) and the close-up
    if (!env.reduced && !clips) {
      clips = await Promise.all([loadClip(env.portrait ? 'runp' : 'run'), loadClip('kiss')]);
      if (clips[0].failed && env.portrait) clips[0] = await loadClip('run');
    }
    // (shot B no longer plays the filmed lions, lions.mp4: the generated clip warped her face as she turned)
    [prairie, prairieDepth, kiss, lionsDay, lionsNight, lionRig, ...horseMeta] = await Promise.all([loadImage(asset('img/prairie-gold.webp')), loadDepth('prairie-gold'), loadDepth('horses-kiss'), loadDepth('lions'), loadDepth('lions-night'), env.reduced ? null : loadImage(asset('img/lion-rig.png')).catch(() => null), loadHorse('horse-buckskin'), loadHorse('horse-paint')]);
  },
  create(env) {
    const { el, fx } = env;
    env.pups.set('hidden');
    el.innerHTML = '<canvas class="full"></canvas><p class="film-hint"></p>';
    const cv = el.querySelector('canvas'), g = cv.getContext('2d', { alpha: false }), hint = el.querySelector('.film-hint');
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
      if (byHand && C.hinted) { C.hinted = 2; hint.classList.remove('on'); }
      if (C.linked >= heart.length) { C.done = C.k; env.audio.hit?.('heart'); env.say('星星替我们，记住了今晚。'); }
    };
    const reach = (x, y) => {
      if (!C.on || C.linked >= heart.length || !C.pts.length) return;
      const nx = C.pts[C.linked], dn = Math.hypot(nx[0] - x, nx[1] - y), da = Math.min(...C.pts.map(q => Math.hypot(q[0] - x, q[1] - y)));
      if (dn < 90 || da < 56) linkNext(true);
    };
    el.addEventListener('pointerdown', e => { if (C.on) { C.down = true; reach(e.clientX, e.clientY); } });
    addEventListener('pointermove', e => { if (C.down) reach(e.clientX, e.clientY); }, { passive: true });
    const lift = () => { C.down = false; }; addEventListener('pointerup', lift); addEventListener('pointercancel', lift);
    const [clipRun, clipKiss] = clips || [];
    let filmed = !!(clipRun && clipKiss && !clipRun.failed && !clipKiss.failed);
    const viewA = new DepthView(prairieDepth, { amp: .035, focus: .55 }), tmp = {};
    const viewK = new DepthView(kiss, { amp: .03, focus: .7 }), viewD = new DepthView(lionsDay, { amp: .03, focus: .62 }), viewN = new DepthView(lionsNight, { amp: .03, focus: .62 });
    // the pair's own life (no motion at all when reduced): one plan, played on the sunset and the night planes
    const lions = lionRig && !env.reduced ? new Pride(lionRig, lionsDay.layers[2], lionsNight.layers[2]) : null;
    // ---------- shot A state ----------
    const A = { run: 0, speed: 0, held: false, heldAt: -1, touched: false, auto: false, scroll: 0, done: false, doneAt: 0, meet: 0, jumpAt: -9, said: 0, kissAt: 0, bAt: 0 };
    const sayA = [[.12, '愿你有奔向旷野的自由，'], [.48, '也有一起奔跑的人。']];
    const down = e => { if (e.target.closest('#hud,#menu,#btn-next')) return; A.held = true; A.heldAt = T; A.touched = true; A.px = e.clientX; A.py = e.clientY; hint.classList.remove('on'); };
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
    const nightCv = canvas(1, 1), ng = nightCv.getContext('2d'), stripCv = canvas(1, 1), washCv = canvas(40, 70);
    function resize() { rs = env.res(false); cv.width = nightCv.width = Math.round(env.W * rs); cv.height = nightCv.height = Math.round(env.H * rs); }
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
      if (!A.touched && t > 2.6 && !A.hinted) { A.hinted = true; hint.textContent = '按住屏幕，和它们一起奔跑'; hint.classList.add('on'); }
      const jumping = t - A.jumpAt < 1.5;
      const want = A.done ? 0 : (A.held || A.auto || jumping) ? 1 : A.run > 0 ? .3 : 0;
      A.speed += (want - A.speed) * (1 - Math.exp(-dt * (want > A.speed ? 1.6 : 1.1)));
      if (!A.done) A.run = Math.min(1, A.run + dt * A.speed / 11);
      if (A.run >= 1 && !A.done) { A.done = true; A.doneAt = t; hint.classList.remove('on'); }
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
      const hm2 = mare.draw(g, xm, ym, hh * .94, { flip: flipM, alpha, wind: A.speed * .9 + .1, dt, speed: A.speed });
      const hs = stallion.draw(g, xs, gy, hh, { alpha, wind: A.speed * .9 + .1, dt, speed: A.speed });
      if (A.speed > .5) [...hs.hooves, ...hm2.hooves].forEach(([x, y]) => { if (Math.random() < .12 * A.speed) dust.push({ x, y, vx: -20 - Math.random() * 40, vy: -14 - Math.random() * 22, life: 1.1 + Math.random() * .8, age: 0, r: 10 + Math.random() * 22 }); });
      // noses touch: a soft warm glow where they meet, as the close-up dissolves in
      if (meet > .85) { const k = clamp((t - A.doneAt - 2.6) / 2), [nx, ny] = hs.nose; g.globalCompositeOperation = 'lighter'; g.globalAlpha = alpha * .35 * Math.sin(k * Math.PI); g.drawImage(glowW, nx - hh * .5, ny - hh * .5, hh, hh); g.globalCompositeOperation = 'source-over'; }
      // near grass plane in front of their legs, then a procedural fringe that rushes past with the speed
      g.globalAlpha = alpha; viewA.draw(g, 3);
      // pollen and the light, streaking with the run
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 40 * env.q + 10; i++) { const x = (((i * 97.3 - A.scroll * (90 + i % 7 * 30) * W / 900 + t * 8) % (W + 40)) + W + 40) % (W + 40) - 20, y = H * (.4 + ((i * 53) % 45) / 100) + Math.sin(t + i) * 10; g.globalAlpha = alpha * (.18 + .3 * Math.sin(t * 2 + i)) * golden; const l = 3 + A.speed * 14; g.drawImage(glowS, x - l, y - 3, l * 2, 6); }
      g.globalCompositeOperation = 'source-over';
      grass(g, W, H, t, alpha, A.scroll * W * .9, '#2a1606', .55 + A.speed * .6);
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
      if (!A.touched && t > 2.6 && !A.hinted) { A.hinted = true; hint.textContent = '按住屏幕，和它们一起奔跑'; hint.classList.add('on'); }
      const want = A.done ? .6 : (A.held || A.auto) ? 1 : 0;
      A.speed += (want - A.speed) * (1 - Math.exp(-dt * (want > A.speed ? 1.8 : 1.2)));
      if (!A.started) { A.started = true; play(clipRun, .5, 0); }
      setRate(clipRun, lerp(.45, 1.05, A.speed));
      A.run = clamp(clipAt(clipRun) / .86); A.scroll += dt * A.speed;
      if (A.run >= 1 && !A.done) { A.done = true; A.doneAt = t; A.kissAt = t; hint.classList.remove('on'); play(clipKiss, .8, 0); }
      for (const [at, line] of sayA) if (A.run >= at && A.said < at) { A.said = at; env.say(line); setTimeout(() => { if (A.said === at) env.say(null); }, 4200); }
      if (A.kissAt && !A.meetSaid && t - A.kissAt > 1.4) { A.meetSaid = true; env.say('风走过很远的路，终于停在你身边。'); }
      const [b0, bh] = band(), lx = env.look.x * .02, ly = env.look.y * .02, kissIn = A.kissAt ? easeInOut(between(t - A.kissAt, 0, 1.2)) : 0;
      if (kissIn < 1 || !drawable(clipKiss)) {
        if (env.portrait && clipRun.v.videoWidth > clipRun.v.videoHeight) strip(clipRun, .42, alpha, 1.35); // no tall framing of the gallop
        else { g.globalAlpha = alpha; drawCover(g, clipRun, 0, b0, W, bh, .5 + lx, .5 + ly, 1.03 + .03 * A.speed); }
      }
      // pollen and light streaking past with the run
      const golden = 1 - kissIn * .5;
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 30 * env.q + 8; i++) { const x = (((i * 97.3 - A.scroll * (90 + i % 7 * 30) * W / 900 + t * 8) % (W + 40)) + W + 40) % (W + 40) - 20, y = H * (.35 + ((i * 53) % 45) / 100) + Math.sin(t + i) * 10; g.globalAlpha = alpha * (.12 + .22 * Math.sin(t * 2 + i)) * golden * (1 - kissIn); const l = 3 + A.speed * 14; g.drawImage(glowS, x - l, y - 3, l * 2, 6); }
      g.globalCompositeOperation = 'source-over';
      if (kissIn > 0 && drawable(clipKiss)) shotKissFilmed(t - A.kissAt, W, H, alpha * kissIn);
      if (A.kissAt && !A.bAt && t - A.kissAt > 7.5) A.bAt = t;
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
      const nx = m.x + NOSE.x * iw * m.s, ny = m.y + NOSE.y * ih * m.s, r = Math.min(W, H) * (.3 + Math.sin(k * 1.3) * .03);
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
      const p = viewK.at(.7, tmp), nx = p.x + p.s * NOSE.x * iw, ny = p.y + p.s * NOSE.y * ih, r = Math.min(W, H) * (.32 + Math.sin(k * 1.3) * .03);
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
      if (lions) lions.update(k, night < 1, night > 0, env.software ? 1 / 20 : 1 / 30);
      // the sunset, then the night composited on its own and dissolved over it; the night sky's stars and
      // heart live on its farthest plane, behind the rock
      if (night < 1) {
        g.globalAlpha = alpha; const nl = lionsDay.layers.length;
        viewD.draw(g, 0, 2); lions ? lions.draw(g, viewD, 0) : viewD.draw(g, 2, 3); viewD.drawWind(g, nl - 1, t, 9, gust);
        birds(g, k, t, W, H, alpha * (1 - night));
        motes(g, t, W, H, alpha * (1 - night * .7));
      }
      if (night > 0) {
        ng.setTransform(rs, 0, 0, rs, 0, 0); ng.globalAlpha = 1; viewN.draw(ng, 0, 1);
        sky(ng, k, t, W, H, viewN.T[0], iw, ih);
        ng.globalAlpha = 1; viewN.draw(ng, 1, 2); lions ? lions.draw(ng, viewN, 1) : viewN.draw(ng, 2, 3); viewN.draw(ng, 3);
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha * night; g.drawImage(nightCv, 0, 0);
        g.globalCompositeOperation = 'screen'; g.fillStyle = 'rgba(46,54,96,.26)'; g.fillRect(0, 0, nightCv.width, nightCv.height); g.restore();   // moonlight: the night reads, it does not swallow the pair
      }
      // fireflies over the grass
      g.globalCompositeOperation = 'lighter';
      flies.forEach(f => { const a = night * (.5 + .5 * Math.sin(t * 3 * f.s + f.p)); if (a < .05) return; const x = (f.x + Math.sin(t * .2 + f.p) * .03) * W, y = (f.y + Math.sin(t * .5 * f.s + f.p) * .02) * H; g.globalAlpha = alpha * a; g.drawImage(glowS, x - 5, y - 5, 10, 10); });
      g.globalCompositeOperation = 'source-over';
    }
    // wind through the grass: slow travelling gusts
    const gust = (x, t) => Math.sin(t * 1.3 - x * 9) * .6 + Math.sin(t * 2.7 - x * 23 + 1.3) * .3 + Math.sin(t * .6 + x * 4) * .3;
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
    function sky(g, k, t, W, H, P, iw, ih) {
      const X = u => P.x + P.s * u * iw, Y = v => P.y + P.s * v * ih;
      // stars arrive with the night
      g.fillStyle = '#f4f0ff';
      stars.forEach(st => { const a = .35 + .65 * (.5 + .5 * Math.sin(st.p + t * st.s)); g.globalAlpha = a; g.fillRect(X(st.x), Y(st.y), st.r, st.r); });
      // the heart: in the open sky on wide screens, above the pair on phones
      { const r0 = Math.min(W, H) * (env.portrait ? .27 : .14); let cy = Y(env.portrait ? HEART.y * .8 : HEART.y);
        if (env.portrait) cy = Math.max(H * .1 + r0 * .5, cy - r0 * .75);   // on a phone: bigger, and up in the open sky above the pair
        heartC = [X(env.portrait ? LIONS.x : HEART.x) - (env.portrait ? r0 * .2 : 0), cy, r0]; }
      const form = between(k, 13, 15);
      if (form > 0) {
        const pts = C.pts = heart.map(heartXY); C.k = k;
        if (!C.on && form > .5) { C.on = true; C.at = k; C.onT = T; env.audio.section?.('stars'); }
        if (C.on && !C.hinted && k - C.at > .8 && !C.linked) { C.hinted = true; hint.textContent = '用手指把星星连起来'; hint.classList.add('on'); }
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
        if (!fell && C.done >= 0 && k > C.done + 2.4) { fell = true; fallAt = t; env.say('最亮的那一颗，留给你。'); env.audio.hit ? env.audio.hit('fall') : env.audio.sfx('sparkle', .8); env.audio.section?.('gather'); }
      }
      // a shooting star
      const ss = between(k, 10.5, 11.6); if (ss > 0 && ss < 1) { const x = lerp(W * .85, W * .45, ss), y = lerp(H * .08, H * .26, ss); g.globalAlpha = Math.sin(ss * Math.PI); const lg = g.createLinearGradient(x, y, x + W * .1, y - H * .05); lg.addColorStop(0, '#fff'); lg.addColorStop(1, 'rgba(255,255,255,0)'); g.strokeStyle = lg; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + W * .1, y - H * .05); g.stroke(); }
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
        if (A.bAt && !A.savSnd) { A.savSnd = true; env.audio.section?.('savanna'); env.audio.layer?.('pulse', 0, 3); }
        g.setTransform(rs, 0, 0, rs, 0, 0);
        const t2 = Math.max(0, t - 1);
        g.globalAlpha = 1; g.fillStyle = '#05060c'; g.fillRect(0, 0, W, H);
        if (SHOT_B && !A.bAt) A.bAt = Math.max(.01, t2); // ?shot=b: straight to the savanna (testing)
        const tB = A.bAt ? t2 - A.bAt : -1, mixAB = tB < 0 ? 0 : between(tB, 0, 2.4);
        if (filmed && t2 > 1.2 && !A.started && !drawable(clipRun)) filmed = false; // no picture: the painted version
        if (mixAB < 1) (filmed ? shotAFilmed : shotA)(t2, dt, W, H, 1);
        if (filmed && mixAB >= 1 && !A.stopped) { A.stopped = true; stop(clipRun); stop(clipKiss); }
        if (mixAB > 0) { cuesB(tB); shotB(tB + B_START, dt, W, H, mixAB); }
        g.globalAlpha = 1;
        // the brightest star falls toward the next chapter
        if (fell) {
          const k = clamp((tB - fallAt) / 3.2), [hx0, hy0] = heartXY(heart[0]), x = lerp(hx0, W * .5, k), y = lerp(hy0, H * .62, easeIn2(k));
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1; const s = 40 + k * 60; g.drawImage(spark, x - s / 2, y - s / 2, s, s); g.drawImage(glowW, x - s * 2, y - s * 2, s * 4, s * 4); g.globalCompositeOperation = 'source-over';
          if (Math.random() < .8) fx.trail(x, y, { life: 1.5, size: 1.8, vy: -30 });
          if (k >= 1 && !ended) { ended = true; env.letterbox(false); env.next({ transition: 'star', at: [x, y] }); } // the same star goes on to light the first candle
        }
      },
      destroy() { env.offerNext(null); env.letterbox(false); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('pointerup', lift); removeEventListener('pointercancel', lift); if (clipRun) { stop(clipRun); stop(clipKiss); } },
    };
  },
};
const B_START = 0;
const SHOT_B = new URLSearchParams(location.search).get('shot') === 'b';
const easeIn2 = t => t * t;

// ---------- the lions, alive on the painting ----------
// Nothing here redraws a face: the pair stays exactly as painted and only small, safe things move. They lie
// in plane 2 of depth/lions (and of lions-night, the same drawing by night); a copy of that plane, padded
// above, is rebuilt around them every frame:
//   wind    the back and top of his mane and the mane under his chin sway a couple of px: a per-pixel warp
//           weighted by assets/img/lion-rig.png R, which is zero on faces, eyes, ears and bodies
//   tail    now and then the tip of the tail lifts and swishes (rig G, bent about its root) over a plate of
//           what it lay on: the rock just below it, sky elsewhere
//   ears    his ear and her near ear twitch back now and then: a small rotation about the ear's base
//   breath  the pair swells and settles: columns stretched just above the rock line, everything higher
//           (both heads included) carried up rigidly, ~1 px
//   blinks  lids in the fur colour beside each eye close over it for ~150 ms
// Coordinates are lions.webp px (1536x864). The rig (assets/img/lion-rig.png) was baked once from the painting.
const RIG = { x: 648, y: 127, w: 442, h: 320 };   // the rig's box
const PAD = 8;                                     // plane 2 starts at y 135: the copy reaches 8 px higher
const EAR_M = [752, 184, 751, 165, 12, 22, 1];     // pivot (the ear's base); window ellipse cx, cy, rx, ry; which way is back
const EAR_F = [879, 269, 877, 251, 12, 19, -1];
const TAIL = [1001, 402.5, .928, .373];            // the root of the tip; along the tail
const TAILBOX = [994, 376, 1086, 441];             // where the tip can be
const ROCK = [[648, 356], [660, 352], [700, 353], [715, 345], [800, 342], [830, 352], [850, 361], [880, 367], [900, 377], [940, 384], [970, 391], [998, 404]]; // the rock line under them
const STRETCH = 70, CW = 4;                        // breath: the band above the rock that swells; column width
// each eye: its open shape, whose it is, where its lid's fur is (x, y, w, h), its corners, and the middle of
// the lid's edge open (above the eye) and shut (a gentle curve low in the eye)
const EYES = [
  { who: 0, at: [726, 190, 7, 3], c: [724.2, 188.6, 732.6, 180.2], m: [728, 178.6, 729.4, 186.4], lw: 1, p: [726, 180.4, 732.2, 180.4, 731.6, 184, 729.6, 187.6, 727.4, 188.9, 724.4, 188.6, 724.4, 184.6] },
  { who: 1, at: [900, 274, 10, 3], c: [896.4, 266.2, 913.8, 268.8], m: [905, 255.2, 905, 270.6], lw: 1.25, p: [902, 256.6, 908, 256.9, 911.2, 259.4, 912.6, 264, 913.6, 268.5, 912, 270.6, 904, 270.6, 899, 269.6, 896.6, 266, 897.4, 261.5, 899.5, 258.2] },
  { who: 1, at: [915, 259, 6, 8], c: [923.6, 266.4, 931.8, 265.6], m: [927.6, 254, 927.6, 268.6], lw: 1.1, p: [925, 255.8, 929.5, 256, 931.5, 259, 931.6, 265, 930, 268.6, 925.5, 268.9, 923.6, 264.5, 923.6, 259] },
];
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const rockAt = x => { for (let i = 1; i < ROCK.length; i++) if (x <= ROCK[i][0]) { const [x0, y0] = ROCK[i - 1], [x1, y1] = ROCK[i]; return y0 + (y1 - y0) * clamp((x - x0) / (x1 - x0)); } return ROCK[ROCK.length - 1][1]; };
const earW = (e, x, y) => sstep(1, .45, Math.hypot((x - e[2]) / e[4], (y - e[3]) / e[5]));
// premultiplied bilinear sample of a box-sized RGBA array at box px (x, y); m: an optional 0/1 mask
function sample(S, m, x, y, o) {
  const W = RIG.w, x0 = Math.floor(x), y0 = Math.floor(y);
  o[0] = o[1] = o[2] = o[3] = 0;
  if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= RIG.h - 1) return;
  const fx = x - x0, fy = y - y0, i = y0 * W + x0;
  tap(S, m, i, (1 - fx) * (1 - fy), o); tap(S, m, i + 1, fx * (1 - fy), o); tap(S, m, i + W, (1 - fx) * fy, o); tap(S, m, i + W + 1, fx * fy, o);
}
function tap(S, m, i, w, o) { if (m && !m[i]) return; const q = i * 4; o[0] += S[q] * w; o[1] += S[q + 1] * w; o[2] += S[q + 2] * w; o[3] += S[q + 3] * w; }
function write(d, q, o) { const a = o[3]; if (a < .5) { d[q + 3] = 0; return; } const k = 255 / a; d[q] = o[0] * k; d[q + 1] = o[1] * k; d[q + 2] = o[2] * k; d[q + 3] = a; }

class Pride {
  constructor(rig, ...layers) {
    const W = RIG.w, H = RIG.h, rd = pixels(rig, 0, 0, W, H);
    this.R = new Float32Array(W * H); this.G = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { this.R[i] = rd[i * 4] / 255; this.G[i] = rd[i * 4 + 1] > 127 ? 1 : 0; }
    // the pixels each warp touches (box px)
    const area = (x0, y0, x1, y1, keep) => {
      const a = { x0: x0 - RIG.x, y0: y0 - RIG.y, w: x1 - x0, h: y1 - y0, x: [], y: [], r: [], e: [], s: [], q: [] };
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const w = keep(x, y); if (w) { a.x.push(x); a.y.push(y); a.q.push(((y - y0) * a.w + x - x0) * 4); a.r.push(w[0]); a.e.push(w[1]); } }
      for (const k of ['x', 'y', 'q']) a[k] = Int32Array.from(a[k]); a.r = Float32Array.from(a.r); a.e = Float32Array.from(a.e);
      a.n = a.x.length; return a;
    };
    const per = (a, f) => Float32Array.from(a.x, (x, n) => f(x, a.y[n]));
    const Rw = (x, y) => this.R[(y - RIG.y) * W + x - RIG.x];
    this.M = area(712, 128, 861, 189 + 125, (x, y) => { const r = Rw(x, y), e = earW(EAR_M, x, y); return r > .003 || e > 0 ? [r, e] : 0; });
    const M = this.M; M.lift = per(M, (x, y) => .25 + .65 * (1 - sstep(140, 156, y)));   // the top strands lift as they stream back
    M.c1 = per(M, x => Math.cos(x * .02)); M.s1 = per(M, x => Math.sin(x * .02)); M.c2 = per(M, x => Math.cos(x * .05)); M.s2 = per(M, x => Math.sin(x * .05));
    M.rows = new Float32Array((M.h + 1) * 4);
    this.F = area(EAR_F[2] - EAR_F[4] - 1, EAR_F[3] - EAR_F[5] - 1, EAR_F[2] + EAR_F[4] + 2, EAR_F[3] + EAR_F[5] + 2, (x, y) => { const e = earW(EAR_F, x, y); return e > 0 ? [0, e] : 0; });
    const along = (x, y) => (x - TAIL[0]) * TAIL[2] + (y - TAIL[1]) * TAIL[3];
    this.T = area(...TAILBOX, (x, y) => { const s = along(x, y), n = (y - TAIL[1]) * TAIL[2] - (x - TAIL[0]) * TAIL[3]; return s > 3 && s < 84 && n > -24 && n < 9 ? [0, 0] : 0; }); // the band the tip sweeps
    this.T.bend = per(this.T, (x, y) => clamp((along(x, y) - 6) / 62) ** 1.5);   // how much of the tail's turn each point takes
    this.cols = [];
    for (let x = 652; x < 996; x += CW) { const xc = x + CW / 2; this.cols.push({ x, an: Math.round(rockAt(xc)) - RIG.y, w: sstep(652, 700, xc) * (1 - sstep(976, 996, xc)) }); }
    this.planes = layers.map(l => this.plane(l));
    // the plan: when each blinks, twitches an ear, flicks the tail (seeded: the same every time)
    const R = rng(23), seq = (t, gap, spread, n, twice = 0) => { const s = []; for (let i = 0; i < n; i++) { t += gap + R() * spread; s.push(t); if (R() < twice) s.push(t + .34); } return s; };
    this.plan = { blink: [seq(-2.2, 3.4, 3.6, 12, .25), seq(-.6, 3, 3.2, 14, .2)], ear: [seq(-2.4, 8, 6, 5), seq(-2.4, 6, 5, 6)], tail: seq(-2.2, 4.6, 4, 8) };
    this.k = -1e9; this.o = new Float32Array(4); this.o2 = new Float32Array(4);
  }
  plane(l) {
    const W = RIG.w, H = RIG.h, oy = l.y - PAD, by = RIG.y - oy;   // the box's top row in the copy
    const P = canvas(l.w, l.h + PAD), pg = P.getContext('2d'); pg.drawImage(l.img, 0, PAD);
    const src = pixels(P, RIG.x, by, W, H), S = new Float32Array(W * H * 4);
    for (let i = 0; i < S.length; i += 4) { const a = src[i + 3] / 255; S[i] = src[i] * a; S[i + 1] = src[i + 1] * a; S[i + 2] = src[i + 2] * a; S[i + 3] = src[i + 3]; }
    const box = canvas(W, H), bg = box.getContext('2d'); bg.drawImage(P, RIG.x, by, W, H, 0, 0, W, H);
    const cut = a => { const im = new ImageData(a.w, a.h); for (let y = 0; y < a.h; y++) im.data.set(src.subarray(((a.y0 + y) * W + a.x0) * 4, ((a.y0 + y) * W + a.x0 + a.w) * 4), y * a.w * 4); return im; };
    // under the tail's tip: the rock where it lay right on it, otherwise nothing (sky shows through)
    const T = this.T, plate = new Float32Array(T.n * 4);
    for (let n = 0; n < T.n; n++) {
      let j = (T.y[n] - RIG.y) * W + T.x[n] - RIG.x;
      if (this.G[j]) { let f = -1; for (let k = 1; k <= 3; k++) { const jj = j + k * W; if (this.G[jj]) continue; if (src[jj * 4 + 3] > 230 && src[jj * 4 + 2] >= src[jj * 4] - 5) f = jj; break; } j = f; }
      if (j >= 0) plate.set(S.subarray(j * 4, j * 4 + 4), n * 4);
    }
    // the lids: the colour of the fur beside each eye
    const lid = EYES.map(e => { const [x0, y0, w, h] = e.at, c = [0, 0, 0]; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) for (let k = 0; k < 3; k++) c[k] += src[((y - RIG.y) * W + x - RIG.x) * 4 + k] / (w * h); return c.map(v => v | 0); });
    return { l, P, pg, box, bg, S, oy, by, plate, lid, m: cut(this.M), f: cut(this.F), t: cut(this.T), still: [false, false] };
  }
  /** What they are doing at time k (shot B seconds). */
  pose(k) {
    const p = this.plan, ev = (list, d) => { for (const t0 of list) if (k >= t0 && k < t0 + d) return k - t0; return -1; };
    const blink = u => u < 0 ? 0 : u < .05 ? sstep(0, .05, u) : u < .09 ? 1 : 1 - sstep(.09, .16, u);
    const twitch = u => u < 0 ? 0 : u < .06 ? easeOut(u / .06) : Math.exp(-(u - .06) * 9) * Math.cos((u - .06) * 15);
    const u = ev(p.tail, 2.4), flick = u < 0 ? 0 : (easeOut(clamp(u / .32)) + .22 * Math.sin(Math.max(0, u - .2) * 8.5) * Math.exp(-u * 1.3)) * (1 - easeInOut(clamp((u - .8) / 1.5)));
    return {
      k, gust: .5 + .3 * Math.sin(k * .37 + .4) + .2 * Math.sin(k * .93 + 2),
      ear: [twitch(ev(p.ear[0], .6)) * .075 * EAR_M[6], twitch(ev(p.ear[1], .6)) * .085 * EAR_F[6]],
      tail: .16 * flick + .022 * Math.sin(k * .8),
      breath: 1.2 * (1 - Math.cos(k * TAU / 4.4)) * .5,
      blink: [blink(ev(p.blink[0], .16)), blink(ev(p.blink[1], .16))],
    };
  }
  /** Rebuilds the planes in view (0 the sunset, 1 the night); step: at most this often (software). */
  update(k, day, night, step = 1 / 30) {
    if (step && Math.abs(k - this.k) < step) return;
    this.k = k; this.now = this.pose(k);
    if (day) this.render(this.planes[0], this.now);
    if (night) this.render(this.planes[1], this.now);
  }
  render(pl, p) {
    const S = pl.S, o = this.o, o2 = this.o2;
    // (every turn here is under .25 rad: cos and sin by their series)
    // the mane in the wind (two travelling waves, split into a row part and a column part), and his ear
    { const M = this.M, d = pl.m.data, k = p.k, gu = p.gust, th = p.ear[0], cx = EAR_M[0], cy = EAR_M[1], rw = M.rows, y0 = M.y0 + RIG.y;
      for (let r = 0; r <= M.h; r++) { const y = y0 + r, a = k * 1.7 - y * .045, b = k * 2.9 - y * .11 + 1.1; rw[r * 4] = Math.sin(a); rw[r * 4 + 1] = Math.cos(a); rw[r * 4 + 2] = Math.sin(b); rw[r * 4 + 3] = Math.cos(b); }
      for (let n = 0; n < M.n; n++) {
        const x = M.x[n], y = M.y[n], r = M.r[n], e = M.e[n]; let sx = x, sy = y;
        if (r) { const j = (y - y0) * 4, w = .62 * (rw[j] * M.c1[n] - rw[j + 1] * M.s1[n]) + .38 * (rw[j + 2] * M.c2[n] + rw[j + 3] * M.s2[n]), f = r * gu * (.35 + .65 * w); sx -= f * 2.3; sy += f * M.lift[n]; }
        if (e && th) { const a = th * e, ca = 1 - a * a / 2, sa = a - a * a * a / 6, qx = sx - cx, qy = sy - cy; sx = cx + ca * qx + sa * qy; sy = cy - sa * qx + ca * qy; }
        sample(S, null, sx - RIG.x, sy - RIG.y, o); write(d, M.q[n], o);
      }
      pl.bg.putImageData(pl.m, M.x0, M.y0); }
    // her ear
    { const F = this.F, th = p.ear[1];
      if (th || !pl.still[0]) {
        const d = pl.f.data, cx = EAR_F[0], cy = EAR_F[1];
        for (let n = 0; n < F.n; n++) { const a = th * F.e[n], ca = 1 - a * a / 2, sa = a - a * a * a / 6, qx = F.x[n] - cx, qy = F.y[n] - cy; sample(S, null, cx + ca * qx + sa * qy - RIG.x, cy - sa * qx + ca * qy - RIG.y, o); write(d, F.q[n], o); }
        pl.bg.putImageData(pl.f, F.x0, F.y0); pl.still[0] = !th;
      } }
    // the tail's tip, bent about its root (lifting is anticlockwise), over the plate
    { const T = this.T, d = pl.t.data, th = -p.tail, [cx, cy] = TAIL, G = this.G, pt = pl.plate;
      for (let n = 0; n < T.n; n++) {
        const qx = T.x[n] - cx, qy = T.y[n] - cy, a = th * T.bend[n], ca = 1 - a * a / 2, sa = a - a * a * a / 6;
        sample(S, G, cx + ca * qx + sa * qy - RIG.x, cy - sa * qx + ca * qy - RIG.y, o);
        const j = n * 4, keep = 1 - o[3] / 255; o2[0] = o[0] + pt[j] * keep; o2[1] = o[1] + pt[j + 1] * keep; o2[2] = o[2] + pt[j + 2] * keep; o2[3] = o[3] + pt[j + 3] * keep;
        write(d, T.q[n], o2);
      }
      pl.bg.putImageData(pl.t, T.x0, T.y0); }
    // breath: back into the plane, column by column: the band just above the rock stretched, everything
    // above it carried up whole (1 px of overlap hides the join)
    const g = pl.pg, by = pl.by, box = pl.box, b = p.breath;
    g.clearRect(RIG.x, by, RIG.w, RIG.h); g.drawImage(box, RIG.x, by);
    for (const { x, an, w } of this.cols) {
      const A = w * b, bx = x - RIG.x, ya = an - STRETCH; if (A < .02) continue;
      g.clearRect(x, by, CW, an);
      g.drawImage(box, bx, 0, CW, ya + 1, x, by - A, CW, ya + 1);
      g.drawImage(box, bx, ya, CW, STRETCH, x, by + ya - A, CW, STRETCH + A);
    }
    // blinks: the upper lid comes down over the eye in the fur's own colour, its edge a dark curve that ends
    // along the lower lid
    EYES.forEach((e, i) => {
      const c = p.blink[e.who]; if (c <= 0) return;
      const [lx, ly, rx, ry] = e.c, mx = lerp(e.m[0], e.m[2], c), my = lerp(e.m[1], e.m[3], c), qx = 2 * mx - (lx + rx) / 2, qy = 2 * my - (ly + ry) / 2, [r, gg, bb] = pl.lid[i];
      const col = this.cols.find(cl => cl.x + CW > lx) || { w: 0 }, cx = (lx + rx) / 2, cy = (ly + ry + e.m[1] + e.m[3]) / 4;
      const shape = sc => { g.beginPath(); for (let j = 0; j < e.p.length; j += 2) g.lineTo(cx + (e.p[j] - cx) * sc, cy + (e.p[j + 1] - cy) * sc); g.closePath(); };
      g.save(); g.translate(0, -pl.oy - col.w * b);
      g.save(); shape(1.06); g.clip();
      g.fillStyle = `rgb(${r},${gg},${bb})`; g.beginPath(); g.moveTo(lx, ly); g.quadraticCurveTo(qx, qy, rx, ry); g.lineTo(rx + 3, Math.min(ly, ry) - 16); g.lineTo(lx - 3, Math.min(ly, ry) - 16); g.fill();
      const last = sstep(.7, 1, c); if (last > 0) { g.globalAlpha = last; g.fillRect(lx - 4, Math.min(ly, ry) - 16, rx - lx + 8, 32); g.globalAlpha = 1; } // the sliver below the shut line
      g.restore(); shape(1.3); g.clip();
      g.strokeStyle = `rgb(${r * .28 | 0},${gg * .28 | 0},${bb * .28 | 0})`; g.lineWidth = e.lw; g.beginPath(); g.moveTo(lx, ly); g.quadraticCurveTo(qx, qy, rx, ry); g.stroke();
      g.restore();
    });
  }
  /** Draws plane 2 (with them in it) where the view puts it. */
  draw(g, view, i) { const pl = this.planes[i], l = pl.l, T = view.T[2]; g.drawImage(pl.P, T.x + T.s * l.x, T.y + T.s * (l.y - PAD), l.w * T.s, (l.h + PAD) * T.s); }
}
/** RGBA of a rectangle of an image or canvas (read once, at setup). */
function pixels(im, x, y, w, h) { const c = canvas(w, h).getContext('2d', { willReadFrequently: true }); c.drawImage(im, x, y, w, h, 0, 0, w, h); return c.getImageData(0, 0, w, h).data; }
