// How the puppies feel (v19), shared by the WebGL rig (pups.js) and the 2D one (pups2d.js).
// The story sets the weather of their hearts, chapter by chapter, and what they hear moves it a little:
//   ar  arousal   0 calm … 1 bouncing      cu  curiosity  ears up, head tilts, watching what happens
//   te  tenderness soft, close, wistful    dr  drowsiness slow blinks, nodding off by the fire
//   aw  awe        still, looking up, wide-eyed
// Each puppy carries its own blend that eases toward the chapter's target over a couple of seconds (never a snap), with
// its own temperament on top (the apricot one livelier, the cream one dozier and softer), and picks what to do next by
// weighted chance from that blend, so the two never act in lockstep and nothing repeats like a loop.
import { clamp } from './util.js';

// interactive things (and the dock's words) the puppies must never sit in front of
export const AVOID = '#btn-next.on, #hint.on, #subtitle .line.on, .pup-avoid, .ws-btn, .ks-actions button';
/** Really on screen: no hidden or transparent ancestor (a button inside a faded panel does not count). */
export function shown(e) {
  for (let n = e, k = 1; n && n !== document.body; n = n.parentElement) {
    const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    k *= +cs.opacity; if (k < .05) return false;
  }
  return true;
}

const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (A, B, k) => { const o = {}; for (const n in A) o[n] = A[n] + (B[n] - A[n]) * k; return o; };
const F = (ar, cu, te, dr, aw) => ({ ar, cu, te, dr, aw });

/** The chapter's target feeling. tm: seconds since the chapter's mode was set; s: what they have heard (counts, flags). */
export function feelFor(mode, tm, s) {
  switch (mode) {
    // the study and the magic book: ears up while it wakes and opens; as she reads on, the fire's warmth wins
    case 'book': return mix(F(.42, .95, .18, 0, .15), F(.12, .3, .35, .95, 0), sm(30, 75, tm + (s.page || 0) * 9));
    // the sand journey: off they go
    case 'journey': return F(.86, .45, .12, 0, .08);
    // the photographs: wistful and soft; the birthday letter: tender, close, very still
    case 'memories': return s.letter ? mix(F(.3, .5, .7, 0, .1), F(.08, .15, 1, .12, .25), sm(0, 6, tm - s.letterAt)) : F(.3, .55, .68, 0, .1);
    // the cake: excited, but gentle with it (she is lighting candles)
    case 'party': return F(.6, .75, .38, 0, .3);
    // while she wishes: lying quiet beside her, eyes closed, wishing along
    case 'quiet': return F(.04, .08, .85, .35, .3);
    // after the wish: the fireworks (awe), then the letter and the closing (quiet tenderness)
    case 'tender': return mix(F(.32, .3, .55, 0, .95), F(.08, .1, 1, .2, .35), sm(30, 60, tm));
    case 'celebrate': return F(1, .3, .2, 0, .2);
    default: return F(.3, .4, .3, 0, 0);
  }
}
/** Each one's temperament, added to the chapter's feeling. */
export const NATURE = [F(.08, .06, -.04, -.1, 0), F(-.06, -.02, .08, .12, .04)];

/** Eases one puppy's feeling toward the target (time constant ~2.2 s; drowsiness comes on slower than it leaves). */
export function blendFeel(e, target, nature, dt) {
  for (const n in target) {
    const want = clamp(target[n] + nature[n]), k = n === 'dr' && want > e[n] ? .22 : .45;
    e[n] += (want - e[n]) * (1 - Math.exp(-dt * k));
  }
}
export const calmFeel = () => F(.3, .4, .3, 0, 0);

// what each thing they can do asks of the moment (weights from the feeling), and roughly how long it lasts
const BIG = new Set(['zoom', 'chase', 'hop', 'bark', 'bow', 'visit', 'shake', 'beg']);
export const PICK = {
  watch: e => 1 + e.cu * 1.4 + e.aw * 1.1,
  sit: e => .55 + e.te * 1.5 + e.dr * 1.1 + e.aw * .7,
  rest: e => e.dr * 3 + e.te * .45,
  walk: e => (.7 + e.ar * .5) * (1 - e.dr) * (1 - e.aw * .7) * (1 - e.te * .4),
  trot: e => e.ar * 1.3 * (1 - e.te * .6) * (1 - e.dr),
  zoom: e => Math.max(0, e.ar - .62) * 2.4,
  hop: e => Math.max(0, e.ar - .42) * 1.5,
  bark: e => Math.max(0, e.ar - .35) * .8 * (1 - e.te) * (1 - e.aw) * (1 - e.dr),
  sniff: e => .3 + e.cu * .9 - e.aw * .3,
  lookback: e => .45 + e.cu * .4,
  greet: e => .45 + e.ar * .3 + e.te * .35,
  bow: e => e.ar * .9 * (1 - e.te) * (1 - e.dr),
  chase: e => Math.max(0, e.ar - .45) * 1.2,
  scratch: e => .22 * (1 - e.aw) * (1 - e.te * .5),
  sneeze: () => .12,
  beg: e => .15 + e.ar * .3,
  shake: e => .12 + e.ar * .15,
  visit: e => .2 + e.te * 1.3,
  yawn: e => e.dr * 2,
  nod: e => e.dr * 1.7,
  gaze: e => e.aw * 2.6 + e.cu * .5,
  sigh: e => e.te * 1.1 + e.dr * .4,
  tilt: e => e.cu * 1.3,
};
export const DUR = { watch: 2.6, sit: 3.6, rest: 7, walk: 3, trot: 2.2, zoom: 3.2, hop: 1.6, bark: 1.4, sniff: 2.4, lookback: 2, greet: 2.2, bow: 2.2, chase: 2.4, scratch: 2, sneeze: 1.6, beg: 3.2, shake: 1.4, visit: 6, yawn: 2.6, nod: 5.5, gaze: 4.2, sigh: 3.2, tilt: 2.4 };
/** Picks what to do next. allowed: the moods this rig can show; other: the other puppy (two big moves never start together). */
export function pickMood(e, cur, other, t, allowed) {
  let sum = 0; const opts = [];
  for (const m of allowed) {
    const f = PICK[m]; if (!f) continue;
    let w = Math.max(0, f(e));
    if (m === cur) w *= .25;                                                     // rarely the same thing twice
    if (BIG.has(m) && other && BIG.has(other.mood) && t - other.moodAt < 2.2) w *= .15;   // not both at once
    if (m === 'visit' && other && other.mood === 'visit') w = 0;
    if (w > 0) { opts.push([m, w]); sum += w; }
  }
  let r = Math.random() * sum;
  for (const [m, w] of opts) { if ((r -= w) <= 0) return m; }
  return 'watch';
}
/** How long to stay with it: calm hearts linger, excited ones move on. */
export const durFor = (m, e) => (DUR[m] || 2.5) * (1.45 - e.ar * .65 + e.dr * .3) * (.8 + Math.random() * .45);

/** Little things they murmur, by feeling (a soft bubble now and then, never chatter over each other). */
export const MURMUR = {
  tilt: ['？', '咦？', '嗯？'], yawn: ['（哈欠）', '呼啊～'], nod: ['zzz', '呼……', '好暖和……'], sigh: ['……', '嗯', '♡'],
  gaze: ['哇……', '好漂亮……', '✦'], eager: ['出发！', '走呀走呀～', '冲呀！'], gentle: ['嘘……', '蛋糕！', '♪'],
};
/** The body that goes with a feeling: ear set (-1 hanging back … 1 pricked), tail carriage (deg), wag speed (rad/s) and
 *  size, breathing rate (rad/s), how low the head hangs, and how often and how slowly they blink. */
export function bodyOf(e) {
  return {
    ears: clamp(e.cu * .8 + e.aw * .6 + e.ar * .3 - e.te * .45 - e.dr * .9, -1, 1),
    tail: (e.ar * .7 + e.cu * .25 + e.aw * .15 - e.te * .55 - e.dr * .9) * 14,
    wag: 3.2 + e.ar * 10.5 + e.cu * 1.2 - e.dr * 1.5,
    wagA: .35 + e.ar * .85 + e.te * .12 - e.dr * .25 - e.aw * .2,
    breath: 1.45 + e.ar * 2.1 - e.dr * .45,
    pant: clamp((e.ar - .7) * 3.3),
    low: clamp(e.te * .28 + e.dr * .55),
    blinkGap: 2.4 + e.aw * 4.5 - e.dr * 1.1, blinkLen: .13 + e.dr * .7 + e.te * .06,
  };
}
