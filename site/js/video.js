// Filmed plates: short clips (generated offline, see tools/video/) that scenes paint into their canvases each
// frame, so grading, light and particles still sit on top. A clip that cannot play (no autoplay, Low Power
// Mode, an old browser) reports failed, and the scene falls back to its painted 2.5D shot.
import { asset } from './util.js';

const cache = new Map(), created = [];

/** Loads a clip; resolves once its first frame can be drawn (or failed is set). Never rejects. */
export function loadClip(name) {
  if (cache.has(name)) return cache.get(name);
  const v = document.createElement('video');
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = asset(`video/${name}.mp4`); created.push(v);
  const clip = { v, name, failed: false, ready: false, rate: 1, wanted: false };
  clip.loaded = new Promise(res => {
    const done = ok => { if (clip.ready || clip.failed) return; ok ? clip.ready = true : clip.failed = true; res(clip); };
    v.addEventListener('loadeddata', () => done(true), { once: true });
    v.addEventListener('error', () => done(false), { once: true });
    setTimeout(() => done(v.readyState >= 2), 20000);
  });
  v.load();
  cache.set(name, clip.loaded);
  return clip.loaded;
}

/** Starts (or resumes) a clip at a playback rate; marks it failed if the browser refuses to play it. */
export function play(clip, rate = 1, from) {
  if (!clip || clip.failed) return;
  const v = clip.v; clip.wanted = true; v._wanted = true;
  if (from != null && Math.abs(v.currentTime - from) > .01) try { v.currentTime = from; } catch { /* not seekable yet */ }
  setRate(clip, rate);
  const p = v.play();
  if (p && p.catch) p.catch(() => { if (clip.wanted && v.paused) { clip.blocked = true; } });
}
export function setRate(clip, rate) {
  if (!clip || clip.failed) return;
  const r = Math.max(.25, Math.min(2, rate));
  if (Math.abs(clip.v.playbackRate - r) > .01) clip.v.playbackRate = r;
  clip.rate = r;
}
export function stop(clip) { if (clip && !clip.failed) { clip.wanted = false; clip.v._wanted = false; clip.v.pause(); } }
/** Fraction of the clip played, 0..1. */
export const progress = clip => clip && clip.v.duration ? clip.v.currentTime / clip.v.duration : 0;
/** True when the clip's picture can be drawn this frame. */
export const drawable = clip => !!clip && !clip.failed && !clip.blocked && clip.v.readyState >= 2 && clip.v.videoWidth > 0;

/** Draws a clip to cover the rect (x, y, w, h) of g, keeping point (fx, fy) of the frame at the same point of the rect. */
export function drawCover(g, clip, x, y, w, h, fx = .5, fy = .5, zoom = 1) {
  const v = clip.v, iw = v.videoWidth, ih = v.videoHeight, s = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * s, dh = ih * s;
  g.drawImage(v, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
  return { s, x: x + (w - dw) * fx, y: y + (h - dh) * fy };
}

/** iPhone in Low Power Mode lets a video play only if it was first played from a tap. Called from the first touch of the
 *  moon: every clip the film will need is created and played-then-paused inside that gesture, so later plays succeed. */
export function primeClips(names) {
  for (const n of names) loadClip(n);   // creates (and starts loading) any clip not made yet, synchronously
  for (const el of created) if (!el.dataset.primed) {
    el.dataset.primed = '1'; const pr = el.play();
    if (pr && pr.then) pr.then(() => { if (!el._wanted) el.pause(); }).catch(() => {});
  }
}

// the director's pause button pauses filmed plates too
addEventListener('gift:pause', e => { for (const p of cache.values()) p.then(c => { if (!c.failed && c.wanted) e.detail ? c.v.pause() : c.v.play().catch(() => {}); }); });
