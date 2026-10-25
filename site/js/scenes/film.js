// Chapter IV, an original short film in two shots:
//  A. golden prairie: two wild horses, a buckskin stallion and a pinto mare. She holds the screen to run
//     with them (the camera tracks, the grass rushes past); letting go lets them ease to a walk; a tap
//     sends them leaping. When they have crossed the prairie they slow and stand nose to nose, and the
//     film dissolves into a painted close-up of the two of them touching noses in the low sun.
//  B. the savanna: two lions on a great rock above the plains. The painted sunset dissolves plane by
//     plane into the same place at night; the stars gather into a heart and one falls.
import { asset, loadImage, canvas, clamp, lerp, between, easeInOut, easeOut, rng, glowSprite, sparkleSprite, TAU } from '../util.js';
import { loadHorse, Horse } from './horses.js';
import { loadDepth, DepthView, wander } from '../depth.js';
import { loadClip, play, stop, setRate, progress as clipAt, drawable, drawCover } from '../video.js';

let prairie, prairieDepth, horseMeta, kiss, lionsDay, lionsNight, clips = null, lionClip = null;
// where things sit in the paintings, as fractions of the image
const NOSE = { x: .553, y: .55 };                // where the two muzzles meet in the close-up
const LIONS = { x: .53, y: .33 };                // the pair on the rock
const HORIZON = .6;                              // the stars stay above this line
const HEART = { x: .24, y: .2 };                 // the constellation, in the open sky (wide screens)
const TS = 1.15;
// the filmed savanna (tools/video/, Wan2.2 from lions.webp): how a clip's pixels map back onto the painting
const LIONCLIP = { lions: { s: 1280 / 1536, ox: 0, oy: 8 }, lionsp: { s: 1280 / 864, ox: 853.6, oy: 0 } };
const B_LEN = 27;       // shot B runs this long once it starts
const AUTO_AFTER = 4.5; // if nobody touches the screen, the horses set off on their own

export default {
  id: 'film', music: 'film',
  async load(env) {
    // filmed plates for shot A (tools/video/): the gallop (a tall framing on phones) and the close-up
    if (!env.reduced && !clips) {
      clips = await Promise.all([loadClip(env.portrait ? 'runp' : 'run'), loadClip('kiss')]);
      if (clips[0].failed && env.portrait) clips[0] = await loadClip('run');
    }
    if (!env.reduced && !lionClip) { lionClip = await loadClip(env.portrait ? 'lionsp' : 'lions'); if (lionClip.failed) lionClip = null; } // plays once, forward and back: it ends on the painting's own pose
    [prairie, prairieDepth, kiss, lionsDay, lionsNight, ...horseMeta] = await Promise.all([loadImage(asset('img/prairie-gold.webp')), loadDepth('prairie-gold'), loadDepth('horses-kiss'), loadDepth('lions'), loadDepth('lions-night'), loadHorse('horse-buckskin'), loadHorse('horse-paint')]);
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
    // a heart of stars (constellation) in the upper sky; heartC is where it sits this frame
    const heart = Array.from({ length: 14 }, (_, i) => { const a = i / 14 * TAU; return [Math.pow(Math.sin(a), 3), -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 16]; });
    let heartC = [0, 0, 1];
    const heartXY = ([x, y]) => [heartC[0] + x * heartC[2], heartC[1] + y * heartC[2]];
    const flies = Array.from({ length: Math.round(30 * env.q + 10) }, () => ({ x: R(), y: .7 + R() * .25, p: R() * TAU, s: .3 + R() }));

    let T = 0, ended = false, fell = false, cardShown = false;
    const [clipRun, clipKiss] = clips || [];
    let filmed = !!(clipRun && clipKiss && !clipRun.failed && !clipKiss.failed);
    const viewA = new DepthView(prairieDepth, { amp: .035, focus: .55 }), tmp = {};
    const viewK = new DepthView(kiss, { amp: .03, focus: .7 }), viewD = new DepthView(lionsDay, { amp: .03, focus: .62 }), viewN = new DepthView(lionsNight, { amp: .03, focus: .62 });
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
      [2.8, 7.4, '后来，太阳慢慢落下去了，'], [8.0, 13.2, '也有停下来的时候，', '可以安心靠近的温柔'], [14.6, 19.2, '星星替我们，记住了今晚。'], [19.8, 24.4, '最亮的那一颗，留给你。'],
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
      g.fillStyle = 'rgba(26,13,5,.55)'; g.fillRect(0, b0, W, bh);
      const m = { s, x: W / 2 - fx * iw * s, y };
      // the strip melts into the wash at its top and bottom edges (an alpha mask, so no seam shows)
      if (stripCv.width !== Math.round(W * rs) || stripCv.height !== Math.round(h * rs)) { stripCv.width = Math.round(W * rs); stripCv.height = Math.round(h * rs); }
      const sg = stripCv.getContext('2d'); sg.setTransform(rs, 0, 0, rs, 0, 0); sg.globalCompositeOperation = 'source-over'; sg.clearRect(0, 0, W, h);
      sg.drawImage(v, m.x, 0, iw * s, h);
      const gr = sg.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.2, '#000'); gr.addColorStop(.8, '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = gr; sg.fillRect(0, 0, W, h);
      g.drawImage(stripCv, 0, y, W, h);
      return m;
    }
    function shotKissFilmed(k, W, H, alpha) {
      const [b0, bh] = band(), v = clipKiss.v, iw = v.videoWidth || 1280, ih = v.videoHeight || 704;
      let m;
      if (env.portrait) m = strip(clipKiss, NOSE.x, alpha); // neither of them is cut off
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
      const k = t - B_START, portrait = env.portrait, night = easeInOut(between(k, lionClip ? 6 : 3, 14));
      // phones keep the pair in frame; wide screens see the whole vista
      const iw = lionsDay.w, ih = lionsDay.h, base = fit(iw, ih, LIONS.x, LIONS.y, .4, portrait ? 1 : 1.03), s = base.s;
      const wd = wander(k, 5.2, .7), cam = { x: wd.x * .8 + env.look.x * .8, y: wd.y * .45 + env.look.y * .5, zoom: .07 * easeInOut(between(k, 0, 26)), focus: .62 };
      const pivot = [base.x + LIONS.x * iw * s, base.y + LIONS.y * ih * s];
      viewD.frame(base, cam, pivot); viewN.frame(base, cam, pivot);
      // the sunset, then the night composited on its own and dissolved over it; the night sky's stars and
      // heart live on its farthest plane, behind the rock
      if (night < 1) {
        g.globalAlpha = alpha; const nl = lionsDay.layers.length;
        if (lionClip && drawable(lionClip)) { drawLions(g, W, H, base, cam, pivot); }
        else { viewD.draw(g, 0, nl - 1); viewD.drawWind(g, nl - 1, t, 9, gust); }
        birds(g, k, t, W, H, alpha * (1 - night));
        motes(g, t, W, H, alpha * (1 - night * .7));
      }
      if (night > 0) {
        ng.setTransform(rs, 0, 0, rs, 0, 0); ng.globalAlpha = 1; viewN.draw(ng, 0, 1);
        sky(ng, k, t, W, H, viewN.T[0], iw, ih);
        ng.globalAlpha = 1; viewN.draw(ng, 1);
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha * night; g.drawImage(nightCv, 0, 0); g.restore();
      }
      // fireflies over the grass
      g.globalCompositeOperation = 'lighter';
      flies.forEach(f => { const a = night * (.5 + .5 * Math.sin(t * 3 * f.s + f.p)); if (a < .05) return; const x = (f.x + Math.sin(t * .2 + f.p) * .03) * W, y = (f.y + Math.sin(t * .5 * f.s + f.p) * .02) * H; g.globalAlpha = alpha * a; g.drawImage(glowS, x - 5, y - 5, 10, 10); });
      g.globalCompositeOperation = 'source-over';
    }
    // the filmed lions, laid exactly over the painting (mid-depth plane), looping forward and back
    function drawLions(g, W, H, base, cam, pivot) {
      if (!lionClip.wanted) play(lionClip, 1, 0);
      const M = LIONCLIP[lionClip.name], P = viewD.at(.62, {}), v = lionClip.v;
      g.drawImage(v, P.x + P.s * M.ox / M.s, P.y + P.s * M.oy / M.s, v.videoWidth * P.s / M.s, v.videoHeight * P.s / M.s);
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
      heartC = [X(env.portrait ? LIONS.x : HEART.x), Y(env.portrait ? HEART.y * .8 : HEART.y), Math.min(W, H) * (env.portrait ? .2 : .13)];
      const form = between(k, 13, 18);
      if (form > 0) {
        const pts = heart.map(heartXY);
        g.globalAlpha = form * .5; g.strokeStyle = '#f2dcae'; g.lineWidth = .8; g.beginPath();
        const n = Math.floor(pts.length * between(k, 14, 19)); for (let i = 0; i <= n && i < pts.length; i++) i ? g.lineTo(pts[i][0], pts[i][1]) : g.moveTo(pts[i][0], pts[i][1]); if (n >= pts.length) g.closePath(); g.stroke();
        g.globalCompositeOperation = 'lighter';
        pts.forEach(([x, y], i) => { if (i === 0 && fell) return; const tw = .7 + .3 * Math.sin(t * 3 + i); const sz = (i === 0 ? 34 : 16) * tw; g.globalAlpha = form * (i === 0 ? 1 : .8); g.drawImage(spark, x - sz / 2, y - sz / 2, sz, sz); });
        g.globalCompositeOperation = 'source-over';
        if (!fell && k > 21.2) { fell = true; fallAt = t; env.audio.sfx('sparkle', .8); }
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
      resize, progress: () => A.bAt ? .5 + clamp((T - A.bAt) / B_LEN) * .5 : A.run * .5,
      update(dt, t) {
        dt *= TS; t *= TS;
        T = t; const W = env.W, H = env.H;
        if (!cardShown) { cardShown = true; env.letterbox(true); env.chapterCard('IV', 1700); }
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
          if (k >= 1 && !ended) { ended = true; env.letterbox(false); env.next({ transition: 'bloom', at: [x, y] }); }
        }
      },
      destroy() { env.letterbox(false); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); if (clipRun) { stop(clipRun); stop(clipKiss); } if (lionClip) stop(lionClip); },
    };
  },
};
const B_START = 0;
const SHOT_B = new URLSearchParams(location.search).get('shot') === 'b';
const easeIn2 = t => t * t;
