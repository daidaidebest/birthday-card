// Director: owns the clock, scene lifecycle, transitions, subtitles and the HUD.
import { clamp, canvas, wait, isPortrait } from './util.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Pups } from './pups.js';
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
  stage, film, speed: SPEED,
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
  card.classList.add('on'); env.audio.sfx('chime');
  await wait(hold / SPEED); card.classList.remove('on');
};

// ---------- next button ----------
const nextBtn = $('#btn-next'); let nextCb = null;
env.offerNext = (label, cb) => {
  nextCb = cb; nextBtn.firstChild.textContent = (label || '继续') + ' ';
  nextBtn.hidden = !cb; requestAnimationFrame(() => nextBtn.classList.toggle('on', !!cb));
};
nextBtn.addEventListener('click', () => { const cb = nextCb; env.offerNext(null); cb && cb(); });

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
async function go(i, { transition = 'cross', fast = false } = {}) {
  if (switching || i < 0 || i >= SCENES.length) return;
  switching = true; env.offerNext(null); env.say(null);
  const old = current;
  if (transition === 'gold') { env.fx.goldSwirl(); env.veil(.55, 650, '#fff1d0'); }
  else if (transition === 'white') env.veil(.7, 650, '#fff4dc');
  else if (transition === 'amber') env.veil(.85, 700, '#f2c27e');
  else if (transition === 'black' || fast) await env.veil(1, 450);
  await preload(i);
  if (old) old.frozen = true;
  currentIndex = i; updateMenu();
  const S = SCENES[i];
  const el = document.createElement('div'); el.className = 'scene scene-' + S.id; el.style.opacity = old && !fast && transition !== 'black' ? 0 : 1; stage.appendChild(el);
  env.letterbox(false);
  current = S.create({ ...env, el }); settle = performance.now() + 1600; gaps.length = 0;
  current.el = el; current.t = 0;
  env.audio.cue(S.music, 1.6);
  for (let k = i + 1; k < Math.min(SCENES.length, i + 3); k++) preload(k);
  history.replaceState(null, '', '#' + S.id);
  const fade = transition === 'gold' ? 1100 : 900;
  requestAnimationFrame(() => { el.style.transition = `opacity ${fade / SPEED}ms ease`; el.style.opacity = 1; });
  await wait(fade / SPEED);
  if (old) { old.destroy?.(); old.el?.remove(); }
  el.style.transition = ''; env.veil(0, 800);
  switching = false;
}
env.go = go;

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
  if (!paused && !document.hidden && frameAvg > 40 && env.q > .5) { env.q = .5; env.dpr = 1; film.classList.add('low-power'); resize(); }
}, 4000);

function resize() {
  env.W = innerWidth; env.H = innerHeight; env.portrait = isPortrait(); film.classList.toggle('portrait', env.portrait);
  env.fx.resize(); env.pups.resize(); current?.resize?.();
}
addEventListener('resize', () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 120); });

// ---------- HUD ----------
let idleTimer = 0;
const wake = () => { film.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(() => film.classList.add('idle'), 3200); };
addEventListener('pointermove', wake, { passive: true }); addEventListener('pointerdown', wake, { passive: true });
$('#btn-sound').addEventListener('click', e => { const on = env.audio.toggle(); e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.setAttribute('aria-label', on ? '静音' : '打开声音'); });
const setPaused = p => { paused = p; film.classList.toggle('paused', p); env.audio.pause(p); $('#btn-pause').setAttribute('aria-label', p ? '继续播放' : '暂停'); };
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
document.addEventListener('visibilitychange', () => env.audio.pause(document.hidden || paused));

// ---------- start ----------
const startIndex = Math.max(0, SCENES.findIndex(s => s.id === (params.get('scene') || location.hash.slice(1))));
Promise.all([preload(startIndex), document.fonts?.ready]).then(() => {
  film.classList.remove('is-loading'); $('#gate-loading').textContent = '';
});
const gate = $('#gate');
let started = false;
async function begin() {
  if (started) return; started = true;
  enableTilt(); // must run inside the tap for iOS to ask for motion access
  env.audio.unlock();
  gate.classList.add('cracking');
  const r = $('#gate-seal').getBoundingClientRect();
  env.fx.burst(r.left + r.width / 2, r.top + r.height / 2, { n: 120, speed: 260, life: 2.2, color: '255,214,150', size: 2.6, drag: 1.6 });
  env.audio.sfx('seal');
  await wait(450);
  gate.classList.add('gone'); film.classList.add('started'); wake();
  go(startIndex);
}
$('#gate-seal').addEventListener('click', begin);
if (params.has('autostart')) { film.classList.remove('is-loading'); begin(); }
requestAnimationFrame(frame);
window.__gift = { stats, env, go, get scene() { return current; }, setPaused };
