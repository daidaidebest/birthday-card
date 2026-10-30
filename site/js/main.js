// Director: owns the clock, scene lifecycle, transitions, subtitles and the HUD.
import { clamp, canvas, wait, isPortrait, fbm } from './util.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Pups } from './pups.js';
import { Gate } from './gate.js';
import { primeClips } from './video.js';
import prologue from './scenes/prologue.js';
import book from './scenes/book.js';
import journey from './scenes/journey.js';
import memories from './scenes/memories.js';
import filmScene from './scenes/film.js';
import wish from './scenes/wish.js';

const SCENES = [prologue, book, journey, memories, filmScene, wish];
const CHAPTERS = [
  { n: 'I', title: '只认识你', sub: '一本等了很久的书', scene: 0 },
  { n: 'II', title: '两条来路', sub: '各自的时光，终于同页', scene: 2 },
  { n: 'III', title: '藏起时光', sub: '把喜欢的时刻，藏进书里', scene: 3 },
  { n: 'IV', title: '风与星光', sub: '自由，和可以靠近的温柔', scene: 4 },
  { n: 'V', title: '为你点亮', sub: '今晚的星光，都为你亮起', scene: 5 },
];

const params = new URLSearchParams(location.search);
const SPEED = Number(params.get('speed')) || 1;
// Test mode only (?auto, or ?autostart for the headless runs): the interactive moments complete themselves after a pause.
// A visitor never gets this: the book, the letter, the candles and the wish wait for her.
const AUTO = params.has('auto') || (params.has('autostart') && !params.has('manual'));   // ?autostart&manual: a visitor, minus the moon
const $ = s => document.querySelector(s);
const film = $('#film'), stage = $('#stage');

// ---------- capability & quality ----------
function detectSoftware() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /llvmpipe|swiftshader|software|basic render/i.test(r);
  } catch { return true; }
}
const software = detectSoftware() || params.has('low');
const env = {
  stage, film, speed: SPEED, auto: AUTO,
  W: innerWidth, H: innerHeight, portrait: isPortrait(),
  // Device pixel ratio for canvases: software rasterisers get 1x, phones up to 2x.
  dpr: software ? 1 : Math.min(devicePixelRatio || 1, innerWidth < 800 ? 2 : 1.6),
  q: software ? .55 : 1,
  software,
  // Resolution for full-screen painterly canvases: soft layers can render below device resolution.
  res: soft => software ? (soft ? .6 : .85) : soft ? Math.min(env.dpr, 1.25) : env.dpr,
  reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
};
if (software) film.classList.add('low-power');
film.classList.toggle('portrait', env.portrait);
env.fx = new FX($('#fx'), env);
env.audio = new Audio(env);
env.pups = new Pups($('#pups'), env);
{ const sfx0 = env.audio.sfx.bind(env.audio); env.audio.sfx = (name, vol, o) => { env.pups.hear?.(name); return sfx0(name, vol, o); }; } // the puppies hear the story

// ---------- look: the 2.5D camera leans toward the pointer or follows the phone's tilt ----------
const lookTarget = { x: 0, y: 0 }; let tilt0 = null;
env.look = { x: 0, y: 0 };
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { lookTarget.x = e.clientX / innerWidth * 2 - 1; lookTarget.y = e.clientY / innerHeight * 2 - 1; } }, { passive: true });
document.addEventListener('mouseleave', () => { lookTarget.x = lookTarget.y = 0; });
function onTilt(e) {
  if (e.gamma == null || e.beta == null) return;
  const ang = ((screen.orientation?.angle ?? window.orientation ?? 0) + 360) % 360;
  const gx = ang === 90 ? e.beta : ang === 270 ? -e.beta : ang === 180 ? -e.gamma : e.gamma;
  const gy = ang === 90 ? -e.gamma : ang === 270 ? e.gamma : ang === 180 ? -e.beta : e.beta;
  if (!tilt0) tilt0 = { x: gx, y: gy };
  tilt0.x += (gx - tilt0.x) * .004; tilt0.y += (gy - tilt0.y) * .004; // slowly re-centre on however she holds the phone
  lookTarget.x = clamp((gx - tilt0.x) / 18, -1, 1); lookTarget.y = clamp((gy - tilt0.y) / 18, -1, 1);
}
function enableTilt() {
  const D = window.DeviceOrientationEvent; if (!D) return;
  if (typeof D.requestPermission === 'function') D.requestPermission().then(r => { if (r === 'granted') addEventListener('deviceorientation', onTilt); }).catch(() => {});
  else addEventListener('deviceorientation', onTilt);
}

// ---------- subtitles ----------
const subEl = $('#subtitle');
let subCurrent = null;
env.say = (text, small) => {
  if (subCurrent) { const old = subCurrent; old.classList.remove('on'); old.classList.add('off'); setTimeout(() => old.remove(), 1400); subCurrent = null; }
  if (!text) return;
  const line = document.createElement('span'); line.className = 'line';
  line.innerHTML = text.replace(/\n/g, '<br>') + (small ? `<small>${small}</small>` : '');
  subEl.appendChild(line); requestAnimationFrame(() => requestAnimationFrame(() => line.classList.add('on')));
  subCurrent = line;
};
/** Cue list helper: [[start, end, text, small?], ...] evaluated each frame. */
env.cues = list => {
  let active = -1;
  return t => {
    let idx = -1;
    for (let i = 0; i < list.length; i++) if (t >= list[i][0] && t < list[i][1]) idx = i;
    if (idx !== active) { active = idx; env.say(idx >= 0 ? list[idx][2] : null, idx >= 0 ? list[idx][3] : null); }
  };
};
env.letterbox = on => film.classList.toggle('letterbox', !!on);

// ---------- chapter card ----------
const card = $('#chapter-card');
env.chapterCard = async (ch, hold = 2000) => {
  const c = CHAPTERS.find(x => x.n === ch); if (!c) return;
  card.querySelector('small').textContent = 'CHAPTER ' + c.n;
  card.querySelector('b').textContent = c.title;
  card.querySelector('span').textContent = c.sub;
  // six little candles, one more lit with every chapter, on the way to the six on her cake
  const n = CHAPTERS.indexOf(c) + 1; card.querySelectorAll('.cc-candles i').forEach((e, k) => { e.classList.toggle('lit', k < n); e.classList.toggle('new', k === n - 1); });
  card.classList.add('on'); env.audio.sfx('chime');
  await wait(hold / SPEED); card.classList.remove('on');
};

// ---------- next button ----------
const nextBtn = $('#btn-next'); let nextCb = null;
/** The way on: a soft "continue" when a chapter is ready to move on, or ({ quiet: true }) a barely-there "skip" while a
 *  story chapter plays by itself. */
env.offerNext = (label, cb, { quiet = false } = {}) => {
  nextCb = cb; nextBtn.firstChild.textContent = (label || '继续') + ' ';
  nextBtn.classList.toggle('quiet', quiet);
  nextBtn.hidden = !cb; requestAnimationFrame(() => nextBtn.classList.toggle('on', !!cb));
};
nextBtn.addEventListener('click', () => { const cb = nextCb; env.offerNext(null); cb && cb(); });

// ---------- the dock: subtitle, hint and the way on share one column at the bottom, so they never cover each other ----------
// Scenes keep their own words above the dock's reserved band (env.safe().b), and ask for hints here instead of
// placing their own: env.hint(text) at the bottom, env.hint(text, { top: true }) under the top edge when the bottom
// of the frame is where her finger works.
const hintEls = { b: $('#hint'), t: $('#hint-top') };
env.hint = (text, { top = false } = {}) => {
  const k = top ? 't' : 'b', other = top ? 'b' : 't';
  if (!text) { for (const e of Object.values(hintEls)) e.classList.remove('on'); return; }
  hintEls[other].classList.remove('on');
  if (hintEls[k].textContent !== text) hintEls[k].textContent = text;
  hintEls[k].classList.add('on');
};
/** The usable frame in CSS px: the safe-area insets, with the dock's reserved band added to the bottom one (b). */
const probe = $('#safe-probe');
env.safe = () => {
  const r = probe.getBoundingClientRect();
  return { t: r.top, l: r.left, r: env.W - r.right, b: env.H - r.bottom, w: r.width, h: r.height };
};
/** While she reads (book pages, letters) the grain and the vignette step back from the text. */
env.reading = on => film.classList.toggle('reading', !!on);
/** Resolution for text-bearing canvases (book pages): the screen's real density, never the performance cap. */
env.textDpr = () => Math.min(devicePixelRatio || 1, software || env.q < 1 ? 2 : 3);   // even a software rasteriser gets 2x for text

// ---------- veil ----------
const veil = document.createElement('div');
Object.assign(veil.style, { position: 'absolute', inset: '0', zIndex: 41, background: '#000', opacity: 0, pointerEvents: 'none', transition: 'opacity 1.2s ease' });
film.appendChild(veil);
env.veil = (opacity, ms = 1200, color = '#000') => { veil.style.transition = `opacity ${ms / SPEED}ms ease`; veil.style.background = color; veil.style.opacity = opacity; return wait(ms / SPEED); };

// ---------- scene lifecycle ----------
let current = null, currentIndex = -1, switching = false, paused = false;
const loaded = new Map();
function preload(i) {
  if (!loaded.has(i)) loaded.set(i, Promise.resolve(SCENES[i].load ? SCENES[i].load(env) : null).catch(e => console.warn(e)));
  return loaded.get(i);
}
env.next = opts => go(currentIndex + 1, opts);
/** Scenes crossfade: the outgoing frame freezes while the next one fades in over it. */
async function go(i, { transition = 'cross', fast = false, at = null, tint = null } = {}) {
  if (switching || i < 0 || i >= SCENES.length) return;
  switching = true; env.offerNext(null); env.say(null); env.hint(null); env.reading(false);
  const old = current;
  if ((transition === 'bloom' || transition === 'sand' || transition === 'star') && (fast || env.reduced)) transition = 'cross';
  const evolve = transition === 'sand' || transition === 'star';   // something of the last shot becomes the next one
  if (transition === 'gold') { env.fx.goldSwirl(); env.veil(.55, 650, '#fff1d0'); }
  else if (transition === 'white') env.veil(.7, 650, '#fff4dc');
  else if (transition === 'amber') env.veil(.85, 700, '#f2c27e');
  else if (transition === 'moon') env.veil(1, 1, '#eef1ff');
  else if (transition === 'black' || fast) await env.veil(1, 450);
  await preload(i);
  if (old) old.frozen = true;
  currentIndex = i; updateMenu(); film.dataset.scene = SCENES[i].id;
  const S = SCENES[i];
  const el = document.createElement('div'); el.className = 'scene scene-' + S.id; el.style.opacity = old && !fast && transition !== 'black' ? 0 : 1;
  if (transition === 'moon') setTimeout(() => env.veil(0, 2200, '#eef1ff'), 300); stage.appendChild(el);
  env.letterbox(false);
  env.handoff = (transition === 'bloom' || evolve) && !fast && !env.reduced ? (at || [env.W / 2, env.H / 2]) : null;
  // the scene's env inherits from the live one (not a copy), so W, H, portrait, dpr and q stay current through resizes and rotation
  current = S.create(Object.assign(Object.create(env), { el })); settle = performance.now() + 1600; gaps.length = 0;
  current.el = el; current.t = 0;
  env.audio.cue(S.music, fast ? 1.8 : 3.4); env.audio.bed(S.bed || null, 4); env.audio.prepare(SCENES[i + 1]?.music);
  for (let k = i + 1; k < Math.min(SCENES.length, i + 3); k++) preload(k);
  history.replaceState(null, '', '#' + S.id);
  const fade = transition === 'gold' ? 1500 : transition === 'moon' ? 600 : transition === 'bloom' ? 2300 : transition === 'sand' ? 2900 : transition === 'star' ? 2200 : 1300;
  if (transition === 'bloom') { el.style.opacity = 1; bloom(el, old, env.handoff, fade / SPEED, tint); }
  else if (transition === 'sand') sand(el, old, env.handoff, fade / SPEED);
  else if (transition === 'star') starCut(el, old, env.handoff, fade / SPEED);
  // a lens pulling focus: the old shot drifts forward and softens while the new one resolves out of a blur
  const soft = !env.software && !env.reduced && !film.classList.contains('low-power') && old && !fast && transition !== 'black' && transition !== 'bloom' && !evolve;
  if (soft) {
    el.classList.add('entering');
    old.el.style.transition = `transform ${fade * 1.2 / SPEED}ms cubic-bezier(.4,0,.2,1), filter ${fade / SPEED}ms ease`;
    old.el.classList.add('leaving');
  }
  if (transition !== 'bloom' && !evolve) requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = `opacity ${fade / SPEED}ms ease, transform ${fade * 1.4 / SPEED}ms cubic-bezier(.2,.7,.2,1), filter ${fade * 1.1 / SPEED}ms ease`;
    el.style.opacity = 1; el.classList.remove('entering');
  }));
  await wait(fade / SPEED);
  if (old) { old.destroy?.(); old.el?.remove(); }
  setTimeout(() => { el.style.transition = ''; }, fade * .5 / SPEED); env.veil(0, 900);
  switching = false;
}
env.go = go;

/** The golden thread: each chapter ends in a point of light, and the next one opens out of it — a soft circle of
 *  light grows from that point, its rim glowing gold, while the old chapter drifts back and softens behind. */
function bloom(el, old, [bx, by], ms, tint) {
  tint = tint || '255,214,150';
  const ring = document.createElement('i'); ring.className = 'bloom-ring'; film.appendChild(ring);
  const far = Math.max(Math.hypot(bx, by), Math.hypot(env.W - bx, by), Math.hypot(bx, env.H - by), Math.hypot(env.W - bx, env.H - by)) + 140;
  const t0 = performance.now(), ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const [tr, tg, tb] = tint.split(',').map(Number), hi = `${Math.min(255, tr + 12)},${Math.min(255, tg + 22)},${Math.min(255, tb + 40)}`;
  env.fx.burst(bx, by, { n: 18, speed: 70, life: 1.8, size: 1.6, color: tint, sparkle: 0 }); env.audio.sfx('light', .45); env.audio.sfx('shimmer', .22);
  if (old?.el) { old.el.style.transition = `transform ${ms * 1.2}ms cubic-bezier(.4,0,.2,1), filter ${ms}ms ease`; old.el.style.transform = 'scale(1.06)'; old.el.style.filter = 'blur(6px) brightness(1.15)'; }
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), r = 30 + ease(k) * far, f = 70 + 90 * k;
    const m = `radial-gradient(circle at ${bx}px ${by}px, #000 ${Math.max(0, r - f)}px, rgba(0,0,0,.6) ${r - f * .4}px, transparent ${r}px)`;
    el.style.webkitMaskImage = el.style.maskImage = m;
    ring.style.background = `radial-gradient(circle at ${bx}px ${by}px, rgba(${hi},${(.4 * (1 - k)).toFixed(3)}) 0, rgba(${hi},0) ${Math.max(1, r * .35)}px, rgba(${tint},0) ${Math.max(0, r - f * 1.1)}px, rgba(${tint},${(.3 * (1 - k * .85)).toFixed(3)}) ${r - f * .45}px, rgba(${tint},0) ${r + 30}px)`;
    if (k < .8 && Math.random() < .3) { const a = Math.random() * Math.PI * 2, rr = r - f * .45; env.fx.trail(bx + Math.cos(a) * rr, by + Math.sin(a) * rr, { life: 1.2, size: 1.3, vy: -10, color: tint }); }
    if (k < 1) requestAnimationFrame(step);
    else { el.style.webkitMaskImage = el.style.maskImage = ''; ring.remove(); }
  };
  requestAnimationFrame(step);
}

/** Book → sand: the page the camera has dived into crumbles into sand. A paper-coloured veil over the next chapter erodes
 *  along a grainy front that runs out from where she touched, and its grains pour down through the dark. */
function sand(el, old, [bx, by], ms) {
  const W = env.W, H = env.H, d = Math.min(env.dpr, 1.5), cv = document.createElement('canvas'); cv.className = 'tx-layer';
  cv.width = Math.round(W * d); cv.height = Math.round(H * d); film.appendChild(cv); const g = cv.getContext('2d');
  const mw = 150, mh = Math.max(40, Math.round(150 * H / W)), mk = document.createElement('canvas'); mk.width = mw; mk.height = mh;
  const mg = mk.getContext('2d'), img = mg.createImageData(mw, mh), far = Math.hypot(Math.max(bx, W - bx), Math.max(by, H - by));
  const dist = new Float32Array(mw * mh), tone = new Float32Array(mw * mh);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const px = (x + .5) / mw * W, py = (y + .5) / mh * H, n = fbm(x / 9, y / 9, 3) * .5 + .5, j = y * mw + x;
    dist[j] = Math.hypot(px - bx, (py - by) * 1.15) / far * .78 + n * .3 + (py / H) * .1; tone[j] = n;
  }
  const PAL = ['232,214,176', '214,190,146', '196,168,122', '244,228,196', '178,148,104'];
  const grains = [], t0 = performance.now(); let last = t0, prevK = -1;
  env.audio.sfx('sand', .5); env.audio.sfx('whoosh', .25);
  let swapped = false;
  const step = now => {
    const u = (now - t0) / ms, dt = Math.min(.05, (now - last) / 1000); last = now;
    if (!swapped && u > .09) { swapped = true; el.style.opacity = 1; if (old?.el) old.el.style.opacity = 0; } // under the veil
    const k = u < .1 ? -1 : Math.pow(clamp((u - .1) / .72), 1.35) * 1.12, veil = clamp(u / .08);
    const D = img.data;
    for (let j = 0; j < dist.length; j++) {
      const a = clamp((dist[j] - k) / .05), i = j * 4, t = tone[j];
      D[i] = 226 + t * 22; D[i + 1] = 204 + t * 20; D[i + 2] = 160 + t * 22; D[i + 3] = a * 255 * veil;
      // where the front has just passed, the paper lets go of its grains
      if (prevK >= 0 && dist[j] >= prevK && dist[j] < k && grains.length < 1600 * env.q + 200 && Math.random() < .55) {
        const x = ((j % mw) + Math.random()) / mw * W, y = (((j / mw) | 0) + Math.random()) / mh * H;
        for (let q = 0; q < 2; q++) grains.push({ x, y, vx: (Math.random() - .5) * 26 - 10, vy: -8 + Math.random() * 18, s: .6 + Math.random() * 1.3, c: PAL[(Math.random() * PAL.length) | 0], life: 1.1 + Math.random() * 1.2, age: 0 });
      }
    }
    prevK = k; mg.putImageData(img, 0, 0);
    g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = true; g.drawImage(mk, 0, 0, W, H);
    for (let i = grains.length - 1; i >= 0; i--) {
      const p = grains[i]; p.age += dt; if (p.age > p.life || p.y > H + 4) { grains[i] = grains[grains.length - 1]; grains.pop(); continue; }
      p.vy += 300 * dt; p.vx *= Math.exp(-dt * 1.2); p.x += (p.vx + Math.sin(p.age * 3 + p.y * .02) * 6) * dt; p.y += p.vy * dt;
      g.globalAlpha = clamp((p.life - p.age) * 1.6) * .9; g.fillStyle = `rgb(${p.c})`; g.fillRect(p.x, p.y, p.s, p.s * 1.3);
    }
    g.globalAlpha = 1;
    if (u < 1.35 || grains.length) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}
/** The falling star → the first candle: a match cut. Everything else sinks into the dark, the star stays where it is, and the
 *  room comes up around it; the next chapter carries the same star on to the wick. */
function starCut(el, old, [x, y], ms) {
  const st = document.createElement('i'); st.className = 'tx-star'; st.style.left = x + 'px'; st.style.top = y + 'px'; film.appendChild(st);
  if (old?.el) { old.el.style.transition = `opacity ${ms * .4}ms ease`; old.el.style.opacity = 0; }
  el.style.opacity = 0; el.style.transition = `opacity ${ms * .7}ms ease ${ms * .3}ms`;
  requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = 1; st.classList.add('on'); }));
  env.audio.sfx('glint', .3);
  setTimeout(() => { st.classList.remove('on'); st.classList.add('off'); }, ms * .42);
  setTimeout(() => st.remove(), ms * .42 + 900);
}

// ---------- loop ----------
let last = performance.now(), frameAvg = 16, work = 8, half = false, probeAt = 0, settle = 0; const gaps = [];
const bar = $('#progress i'), stats = { frames: 0, work: 0, half: false };
function frame(now) {
  requestAnimationFrame(frame);
  // Even pacing: when a frame's work cannot fit in 60 fps, render every other vsync (a steady 30)
  // instead of letting the frame rate jitter.
  if (half && now - last < 1000 / 30 - 4) return;
  const interval = now - last;
  let dt = Math.min(.05, interval / 1000); last = now;
  // Measure the uncapped cadence; if this device cannot hold ~48 fps, lock to an even 30
  // (steady 33 ms frames read as smoother than frames that wander between 20 and 30 ms).
  if (!half && !paused && !document.hidden && now > settle) { // scene starts decode images: not representative
    gaps.push(interval);
    if (gaps.length >= 48) { // the median ignores one-off hitches such as image decodes
      const m = gaps.sort((a, b) => a - b)[24]; gaps.length = 0;
      if (m > 21) { half = true; probeAt = now + 15000; }
    }
  } else if (half && now > probeAt) { half = false; gaps.length = 0; }
  frameAvg = frameAvg * .97 + dt * 1000 * .03;
  if (paused || document.hidden) return;
  dt *= SPEED;
  const lk = env.reduced ? 0 : 1 - Math.exp(-dt * 2.6);
  env.look.x += (lookTarget.x * (env.reduced ? 0 : 1) - env.look.x) * lk; env.look.y += (lookTarget.y * (env.reduced ? 0 : 1) - env.look.y) * lk;
  const t0 = performance.now();
  if (current && !current.frozen) { current.t += dt; current.update?.(dt, current.t); }
  env.pups.update(dt);
  env.fx.update(dt);
  work = work * .95 + (performance.now() - t0) * .05; stats.frames++; stats.work = work; stats.half = half;
  const prog = current?.progress ? current.progress() : 0;
  bar.style.width = ((currentIndex + clamp(prog)) / SCENES.length * 100).toFixed(2) + '%';
}
// Adaptive quality: if frames are consistently slow, lower canvas density once.
setInterval(() => {
  if (!paused && !document.hidden && frameAvg > 40 && env.q > .5) { env.q = .5; env.dpr = 1; film.classList.add('low-power'); resize(true); }
}, 4000);

function resize(force) {
  if (force !== true && env.W === innerWidth && env.H === innerHeight && env.portrait === isPortrait()) return;
  env.W = innerWidth; env.H = innerHeight; env.portrait = isPortrait(); film.classList.toggle('portrait', env.portrait);
  env.fx.resize(); env.pups.resize(); current?.resize?.();
}
// rotation, the browser's bars sliding in and out, split screen: one debounced relayout (scenes get resize() and, when the
// orientation flipped, env.portrait already tells them which way they now face)
const onResize = () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 120); };
addEventListener('resize', onResize); addEventListener('orientationchange', onResize); window.visualViewport?.addEventListener('resize', onResize);

// ---------- HUD ----------
let idleTimer = 0;
const wake = () => { film.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => film.classList.add('idle'), 3200); };
addEventListener('pointermove', wake, { passive: true }); addEventListener('pointerdown', wake, { passive: true });
$('#btn-sound').addEventListener('click', e => { const on = env.audio.toggle(); e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.setAttribute('aria-label', on ? '静音' : '打开声音'); });
const setPaused = p => { paused = p; film.classList.toggle('paused', p); env.audio.pause(p); dispatchEvent(new CustomEvent('gift:pause', { detail: p })); $('#btn-pause').setAttribute('aria-label', p ? '继续播放' : '暂停'); };
$('#btn-pause').addEventListener('click', () => setPaused(!paused));
addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); } if (e.code === 'ArrowRight' && nextCb) nextBtn.click(); });
const menu = $('#menu');
function updateMenu() {
  const list = $('#menu-list'); list.innerHTML = '';
  CHAPTERS.forEach(c => {
    const li = document.createElement('li'), b = document.createElement('button');
    b.innerHTML = `<span>${c.title}</span><small>${c.n}</small>`;
    const active = currentIndex >= c.scene && (CHAPTERS.find(x => x.scene > c.scene)?.scene ?? 99) > currentIndex;
    b.setAttribute('aria-current', active);
    b.onclick = () => { menu.hidden = true; setPaused(false); go(c.scene, { fast: true }); };
    li.appendChild(b); list.appendChild(li);
  });
}
$('#btn-menu').addEventListener('click', () => { updateMenu(); menu.hidden = false; });
$('#menu-close').addEventListener('click', () => { menu.hidden = true; });
menu.addEventListener('click', e => { if (e.target === menu) menu.hidden = true; });
document.addEventListener('visibilitychange', () => { env.audio.pause(document.hidden || paused); dispatchEvent(new CustomEvent('gift:pause', { detail: document.hidden || paused })); });

// ---------- start ----------
const startIndex = Math.max(0, SCENES.findIndex(s => s.id === (params.get('scene') || location.hash.slice(1))));
let started = false;
const gate = new Gate(env, begin);
// iOS only grants motion access (and audio) from inside a real gesture: ask on the first press of the moon. Sound is
// (re)unlocked from every touch, because iOS can suspend it again after a call, Siri or a visit to the home screen.
const firstTouch = () => {
  enableTilt(); env.audio.unlock();
  if (!env.reduced) { const p = env.portrait ? 'p' : ''; primeClips(['castle' + p, 'castle-hold' + p, env.portrait ? 'studyp' : 'study', env.portrait ? 'runp' : 'run', 'kiss', env.portrait ? 'lionsp' : 'lions']); } // Low Power Mode: films may only play once a tap has played them
};
$('#gate-moon').addEventListener('pointerdown', firstTouch, { once: true });
$('#gate-moon').addEventListener('keydown', firstTouch, { once: true });
for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, () => env.audio.unlock(), { passive: true, capture: true });
// iPhone: no pinch-zoom on the stage (double-tap zoom is off via touch-action)
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
// a soft, woody tick for the controls
document.addEventListener('click', e => { if (e.target.closest('#hud button, #menu button, #btn-next')) env.audio.sfx('tap', .7); }, true);
Promise.all([preload(startIndex), document.fonts?.ready]).then(() => {
  film.classList.remove('is-loading'); $('#gate-loading').textContent = ''; gate.setReady();
});
function begin() {
  if (started) return; started = true;
  gate.close(); film.classList.add('started'); wake();
  go(startIndex, { transition: 'moon' });
}
if (params.has('autostart')) { film.classList.remove('is-loading'); env.audio.unlock(); begin(); }
requestAnimationFrame(frame);
window.__gift = { stats, env, go, get scene() { return current; }, setPaused };
