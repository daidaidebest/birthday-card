// Sound, all through Web Audio (v16 engine; v18 a game score). The music is decoded buffers, so loops are gapless, and
// the next chapter's music is decoded ahead of time, so there is never a silent gap.
// v18: each chapter's cue is two or three time-aligned layers of one score (tools/score.py; the grid, chords and sections
// are in js/score-map.js). The story plays it like a game score:
//   layer(name, level, sec)   raises or lowers a layer ('bed', 'lead'; the film also has 'pulse', the gallop)
//   section(name)             moves the music to a section on its next phrase or bar line (the film's run holds until the
//                             horses meet; the book's hearth holds until the cover opens)
//   hit(kind, {quantize, ...}) a stinger from the soft sample bank (harp, celesta, music box, piano), its notes chosen from
//                             the chord that is playing, landing on the next 16th/8th/beat/bar; returns the context time it
//                             sounds (until(when) = seconds from now), so the picture can land on it
//   beat()                    {cue, beat, bar, phase, bpm, meter, next, chord} of what is sounding, for lights that pulse
//   cue(name, sec)            the chapter's change: the playing loop stops on a bar line (a phrase end if one is near) and
//                             plays its own written cadence; the next cue comes in on the cadence's resolution chord, over
//                             its ring; the loop's last notes ring on in a reverb, so nothing is cut off
//   end(name)                 lets a cue end on its cadence (the finale: on its real last line and last chord)
//   launch(x, big)            a firework she sends up: the whoosh now, the burst on the next beat (returns that time)
// Ambient beds at ~15% under the music; soft effects with stereo position and a reverb send; ducking for the voice memo.
// iPhone: the context is unlocked (and re-unlocked after calls, Siri or a trip to the home screen) from any touch, and the
// audio session is set to 'playback' so the music plays even with the ringer switch on silent (older iOS: a silent media
// element does the same job). Decoded audio is big on a phone: at most the playing cue, the next one and an outgoing one
// are kept (about 110 MB at the very most, 48 kHz), quiet layers are mono, and the stinger bank is one small mono file.
import { asset } from './util.js';
import MAP from './score-map.js';

const CUES = MAP.cues;
const AFTER = { wish: 'finale' };   // music a chapter moves on to by itself (decoded ahead like the next chapter's)
// layer levels a cue starts with; the prologue's melody comes in with the owl (or by itself after 3.5 s)
const MIX = { prologue: { lead: 0 } }, INTRO = { prologue: { lead: [3.5, 2.5] } };
const HOLDS = 4;                    // a held section comes round at most this often before the music moves on anyway
const WET = .42;                    // how much of the last beat rings on in the reverb when a loop stops or jumps
const SFX = ['chime', 'light', 'sparkle', 'tap', 'seal', 'rustle', 'page', 'whoosh', 'wings', 'blow', 'bark1', 'bark2', 'yip', 'patter', 'wag', 'sneeze', 'glint', 'shimmer', 'sand'];
const ALIAS = { owl: 'wings', pop: 'fw-burst1' };
const BEDS = { wind: ['amb-wind', .17], fire: ['amb-fire', .24] };
const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYyLjMuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAZAAADQwA/Pz9ISEhIUFBQUFdXV1dfX19fZ2dnZ29vb293d3d3f39/f4iIiIiQkJCQmJiYmKCgoKCoqKior6+vr7e3t7e/v7+/yMjIyNDQ0NDY2NjY4ODg4Ojo6Ojw8PDw+Pj4+P////8AAAAATGF2YzYyLjExAAAAAAAAAAAAAAAAJAJSAAAAAAAAA0NUGuZAAAAAAAAAAAAAAAAAAP/zEMQAAAADSAAAAABMQU1FMy4xMExBTUUz//MSxA0AAANIAAAAAC4xMDEgKGJlTEFNRTMu//MQxBsAAANIAAAAADEwMSAoYmVMQU1FMy7/8xDEKAAAA0gAAAAAMTAxIChiZUxBTUUzLv/zEMQ1AAADSAAAAAAxMDEgKGJlTEFNRTMu//MQxEIAAANIAAAAADEwMSAoYmVMQU1FMy7/8xDETwAAA0gAAAAAMTAxIChiZXRhIDMpVf/zEMRcAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxGkAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xLEdgAAA0gAAAAAVVVVVVVVVVVVVVVVVVX/8xDEhAAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMSRAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxJ4AAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEqwAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMS4AAADSAAAAABVVVVVVVVVVVVVVVVV//MQxMUAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDE0gAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEsTfAAADSAAAAABVVVVVVVVVVVVVVVVVVf/zEMTtAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxPIAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDE8gAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMTyAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxPIAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDE8gAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMTyAAADSAAAAABVVVVVVVVVVVVVVVVV';
const eqIn = n => Float32Array.from({ length: n }, (_, i) => Math.sin(i / (n - 1) * Math.PI / 2));
const eqOut = n => Float32Array.from({ length: n }, (_, i) => Math.cos(i / (n - 1) * Math.PI / 2));
// old WebKit returns nothing (or throws) where newer browsers return promises
const quiet = f => { try { const p = f(); if (p && p.catch) p.catch(() => {}); } catch { /* not supported here */ } };
/** Caches a promise per key; a result of undefined (a network or decode error) is forgotten, so it is tried again later. */
const once = (map, key, make) => {
  if (!map.has(key)) { const p = make(); map.set(key, p); p.then(v => { if (v === undefined && map.get(key) === p) map.delete(key); }); }
  return map.get(key);
};
/** The files of a cue: its layers, its cadence, and (the finale) the parts played once before and after its loop. */
const files = name => { const D = CUES[name]; return [...D.stems.map(s => name + '.' + s), name + '.end', ...(D.head ? [name + '.head'] : []), ...(D.outro ? [name + '.outro'] : [])]; };
// ---------------------------------------------------------------- the score's clock
/** Seconds into a cue at a score beat, and back (through its tempo map: only the finale's last bars slow down). */
const secOf = (D, b) => { let s = D.tempo[0]; for (const t of D.tempo) if (t[0] <= b) s = t; return s[2] + (b - s[0]) * 60 / s[1]; };
const beatOf = (D, sec) => { let s = D.tempo[0]; for (const t of D.tempo) if (t[2] <= sec) s = t; return s[0] + (sec - s[2]) * s[1] / 60; };
const bpmAt = (D, b) => { let s = D.tempo[0]; for (const t of D.tempo) if (t[0] <= b) s = t; return s[1]; };
const chordAt = (rows, b) => { let r = rows[0]; for (const x of rows) if (x[0] <= b + 1e-6) r = x; return r; };
const STEP = { '32nd': .125, '16th': .25, '8th': .5, beat: 1 };
// ---------------------------------------------------------------- stingers: what each moment plays, from the chord of the moment
// h: the harmony (root, bass, tones, tw = twinkle tones, key); o: the hit's options. Notes: [instrument, midi, beats later, velocity]
const inSet = (lo, hi, pcs) => { const out = []; for (let p = lo; p <= hi; p++) if (pcs.includes(p % 12)) out.push(p); return out; };
const near = (p, pcs) => { for (let d = 0; d < 7; d++) for (const q of [p - d, p + d]) if (pcs.includes(((q % 12) + 12) % 12)) return q; return p; };
const low = (pc, lo) => lo + ((pc - lo) % 12 + 12) % 12;
const KINDS = {
  // the prologue: stardust in the night sky (random, a step or two from the last), the owl, the letter
  twinkle: { q: '16th', gap: .08, v: .32, f: (h, o, A) => { const s = inSet(84, 100, h.tw); let i = s.indexOf(A.lastTw); i = i < 0 ? (Math.random() * s.length) | 0 : Math.max(0, Math.min(s.length - 1, i + [-2, -1, 1, 2][(Math.random() * 4) | 0])); A.lastTw = s[i]; return [['cel', s[i], 0, .8]]; } },
  owl: { q: '8th', v: .4, f: h => inSet(67, 91, h.tw).slice(0, 9).map((p, i) => ['harp', p, i * .125, .5 + i * .04]).concat([['cel', inSet(88, 100, h.tones)[0], 1.1, .45]]) },
  land: { q: 'beat', v: .5, f: h => [['harp', low(h.bass, 43), 0, .7], ['harp', low(h.root, 50) + 7, .08, .5], ['harp', near(low(h.root, 60) + 4, h.tones), .16, .5], ['cel', inSet(84, 96, h.tones)[1], .3, .45]] },
  open: { q: '8th', v: .4, f: h => inSet(76, 96, h.tones).slice(0, 5).map((p, i) => ['cel', p, i * .25, .6]) },
  done: { q: '8th', v: .42, f: h => inSet(76, 98, h.tones).reverse().slice(0, 5).map((p, i) => ['cel', p, i * .25, .65 - i * .06]) },
  // the book: the cover, a page, the dive into the next chapter
  cover: { q: '8th', v: .48, f: h => [low(h.bass, 43), ...inSet(52, 76, h.tones).slice(0, 5)].map((p, i) => ['harp', p, i * .125, .55 + i * .05]) },
  page: { q: '8th', v: .4, f: h => inSet(60, 79, h.tones).slice(0, 4).map((p, i) => ['harp', p, i * .25, .5 + i * .06]) },
  dive: { q: '8th', v: .42, f: h => inSet(60, 96, h.tw).slice(0, 12).map((p, i) => ['harp', p, i * .125, .45 + i * .03]) },
  // the journey: each new city settling on the downbeat
  station: { q: 'bar', v: .42, f: h => [['harp', low(h.bass, 41), 0, .6], ...inSet(55, 74, h.tones).slice(0, 4).map((p, i) => ['harp', p, .06 + i * .125, .45]), ['cel', inSet(81, 93, h.tones)[0], .5, .35]] },
  // the memories: a photograph taken down (a note further up the chord each time), a polaroid turned over, the letter
  photo: { q: '8th', v: .4, f: (h, o) => { const s = inSet(76, 98, h.tones), p = s[(o.index || 0) % s.length]; return [['cel', p, 0, .7], ['cel', p - 12, .02, .25]]; } },
  flip: { q: '8th', v: .36, f: h => { const s = inSet(76, 91, h.tones).reverse().slice(0, 3); return [...s.map((p, i) => ['cel', p, i * .5, .6 - i * .1]), ['harp', low(h.root, 48), 0, .35]]; } },
  letter: { q: 'beat', v: .38, f: h => [['harp', low(h.bass, 43), 0, .5], ...inSet(64, 84, h.tones).slice(0, 4).map((p, i) => ['harp', p, .25 + i * .25, .4])] },
  // the film: the horses meet, the stars she taps into a heart (a phrase that comes home on the last one), the heart
  // complete, the brightest star falling
  kiss: { q: 'beat', v: .42, f: h => [['harp', low(h.bass, 43), 0, .55], ...inSet(60, 79, h.tones).slice(0, 3).map((p, i) => ['harp', p, .1 + i * .1, .45]), ['cel', inSet(84, 96, h.tones)[0], .5, .45], ['cel', inSet(88, 100, h.tones)[0], .75, .4]] },
  star: { q: '8th', v: .44, f: (h, o, A) => {
    const n = Math.max(2, Math.min(MAP.phrases.theme.length, o.of || 8)), i = Math.max(0, Math.min(n - 1, o.index || 0)), th = MAP.phrases.theme;
    let p = th[th.length - n + i] + A.semis(h.key); if (p < 79) p += 12; p = near(p, h.tw);
    const last = i === n - 1;
    return last ? [['cel', p, 0, .85], ['box', p - 12, .01, .45], ['harp', low(h.bass, 43), 0, .5], ...inSet(55, 74, h.tones).slice(0, 3).map((q, k) => ['harp', q, .12 + k * .12, .4])] : [['cel', p, 0, .7], ['box', p - 12, .01, .3]];
  } },
  heart: { q: 'beat', v: .46, f: h => [['pno', low(h.bass, 36), 0, .5], ...inSet(55, 91, h.tw).slice(0, 12).map((p, i) => ['harp', p, i * .125, .4 + i * .03]), ...inSet(84, 100, h.tones).slice(0, 3).map((p, i) => ['cel', p, 1.5 + i * .25, .5])] },
  fall: { q: '8th', v: .42, f: h => inSet(76, 100, h.tones).reverse().slice(0, 7).map((p, i) => ['cel', p, i * .25, .7 - i * .06]) },
  // the wish: each candle the next note of the theme (six candles, a phrase home), her closed eyes, a firework's glint
  candle: { q: '8th', v: .5, f: (h, o, A) => {
    const c = MAP.phrases.candle, i = Math.max(0, Math.min(c.length - 1, o.index || 0)); let p = c[i] + A.semis(h.key); if (p < 72) p += 12; p = near(p, h.tw);
    const n = [['box', p, 0, .8], ['cel', p + 12, .01, .22]];
    if (i === c.length - 1) inSet(p + 3, p + 19, h.tones).slice(0, 3).forEach((q, k) => n.push(['cel', q, .5 + k * .25, .5]));
    return n;
  } },
  wish: { q: 'beat', v: .3, f: h => inSet(79, 96, h.tones).slice(0, 3).map((p, i) => ['cel', p, i * .5, .5]) },
  burst: { q: '8th', gap: .05, v: .26, f: h => { const s = inSet(84, 100, h.tw); return [['cel', s[(Math.random() * s.length) | 0], 0, .7]]; } },
  // the postcard: the golden postmark pressed down, a warm low chord
  stamp: { q: 'beat', v: .5, f: h => [['pno', low(h.bass, 33), 0, .7], ['pno', low(h.root, 40) + 7, .03, .55], ['pno', near(low(h.root, 48) + 4, h.tones), .06, .5], ['harp', inSet(67, 79, h.tones)[0], .12, .35]] },
};

export class Audio {
  constructor(env) {
    this.env = env; this.on = true; this.ctx = null; this.paused = false; this.wokeAt = -1e9;
    this.bytes = new Map(); this.music = new Map(); this.buffers = new Map(); this.cur = null; this.token = 0; this.beds = new Map();
    this.fading = new Set(); this.tails = new Set(); this.mix = {}; this.voices = []; this.lastHit = {}; this.busy = 0; this.busyAt = 0; this.booms = [];
    this.voice = { state: 'unknown', n: 0 };
    // start downloading the opening music (and the stinger bank) right away; it is decoded as soon as there is a context
    this.fetchCue('prologue'); this.fetch('stingers'); this.checkVoice();
  }
  // ---------------------------------------------------------------- unlocking (call from any user gesture, any number of times)
  init() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ }
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);            // ducked under the voice
    this.ambBus = c.createGain(); this.ambBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = .6; this.sfxBus.connect(this.master);
    this.voiceBus = c.createGain(); this.voiceBus.connect(this.master);
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(3.4, 2.4); this.verbIn = c.createGain(); this.verbIn.gain.value = .9;
    this.verbIn.connect(this.verb); this.verb.connect(this.sfxBus);
    // the music's own room: what rings on when a loop stops, and the space around the stingers
    this.mverb = c.createConvolver(); this.mverb.buffer = this.impulse(2.8, 2.5, .22); this.mverb.connect(this.musicBus);
    this.stingBus = c.createGain(); this.stingBus.gain.value = .9; this.stingBus.connect(this.musicBus);
    this.stingVerb = c.createGain(); this.stingVerb.gain.value = .35; this.stingBus.connect(this.stingVerb); this.stingVerb.connect(this.mverb);
    // paused (or hidden) stays silent even if the system wakes the context; 'interrupted' (iOS: a call, Siri) waits for the next touch
    c.onstatechange = () => { if (c.state === 'running' && (this.paused || document.hidden)) quiet(() => c.suspend()); };
    for (const ev of ['focus', 'pageshow']) addEventListener(ev, () => this.unlock());   // iOS often allows a resume once the call is over
    SFX.forEach(n => this.loadBuffer('sfx-' + n)); ['fw-launch', 'fw-burst1', 'fw-burst2', 'amb-wind', 'amb-fire'].forEach(n => this.loadBuffer(n));
    this.bank = this.loadBuffer('stingers').then(buf => buf ? { buf, off: this.lead(buf, MAP.bank.lead) } : null);
    this.decode('prologue');
    this.tick = setInterval(() => this.conduct(), 250);
    return c;
  }
  unlock() {
    const c = this.init(); if (!c || this.paused || document.hidden) return;
    if (c.state !== 'running') {   // 'suspended' (autoplay rules, our own pause) or 'interrupted' (iOS)
      quiet(() => c.resume());
      const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);   // older iOS unlocks on a sound played inside the touch
      if (!navigator.userActivation || navigator.userActivation.isActive) this.wokeAt = performance.now();
    }
    if (!navigator.audioSession && !this.keep) {   // before iOS 17: a playing media element puts the page in the 'playback' session
      const el = this.keep = document.createElement('audio'); el.src = SILENT; el.loop = true; el.setAttribute('playsinline', ''); el.preload = 'auto';
    }
    if (this.keep && this.keep.paused) quiet(() => this.keep.play());
  }
  /** Effects only while sound is really coming out (or a touch has just woken it): nothing piles up in a suspended context. */
  live() { return this.ctx.state === 'running' || performance.now() - this.wokeAt < 1500; }
  impulse(sec, decay, smooth = .35) {
    const c = this.ctx, n = Math.round(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * smooth; d[i] = lp * Math.exp(-i / c.sampleRate * decay) * Math.min(1, i / (c.sampleRate * .02)); } }
    return b;
  }
  // ---------------------------------------------------------------- loading (null: the file is not there; undefined: try again later)
  fetch(name) {
    const file = name === 'voice' ? this.voice.file : name + '.mp3';
    return once(this.bytes, name, () => fetch(asset('audio/' + file)).then(r => r.ok ? r.arrayBuffer() : null).catch(() => undefined));
  }
  fetchCue(name) { if (CUES[name]) files(name).forEach(f => this.fetch(f)); }
  decodeData(ab) { return new Promise((res, rej) => { const p = this.ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); }   // settles once, whichever answers
  loadBuffer(name) {
    if (!this.ctx) return Promise.resolve(null);
    return once(this.buffers, name, () => this.fetch(name).then(ab => ab ? this.decodeData(ab.slice(0)) : ab).catch(() => undefined));
  }
  /** Where the music starts in a decoded file: decoders that do not trim the encoder's padding leave silence in front. */
  lead(buf, nominal) {
    if (buf.duration - nominal <= .015) return 0;
    const d = buf.getChannelData(0), lim = Math.min(d.length, buf.sampleRate * .08); let off = 0;
    while (off < lim && Math.abs(d[off]) < 1e-4) off++;
    return off / buf.sampleRate;
  }
  /** Decodes a cue (once): its layers, which share one start (same length, same encoder, so the same padding), and its cadence. */
  decode(name) {
    const D = CUES[name]; if (!D || !this.init()) return Promise.resolve(null);
    return once(this.music, name, () => Promise.all(files(name).map(f => this.fetch(f).then(ab => ab ? this.decodeData(ab.slice(0)) : ab).catch(() => undefined))).then(bs => {
      if (bs.includes(undefined)) return undefined;
      if (!bs[0]) return null;
      const m = { name, D, stems: {}, off: this.lead(bs[0], D.len) }; let k = 0;
      for (const s of D.stems) { const b = bs[k++]; if (b) m.stems[s] = b; }
      m.cad = bs[k++]; if (m.cad) m.cadOff = this.lead(m.cad, D.cad.dur);
      for (const part of ['head', 'outro']) if (D[part]) { const b = bs[k++]; if (b) m[part] = { buf: b, off: this.lead(b, D[part].dur) }; }
      return m;
    }).catch(() => undefined));
  }
  /** Gets the next chapter's music ready while this one plays (decoded once no chapter change is under way, to keep the
   *  peak of decoded audio to two cues). */
  prepare(name) {
    name = name || AFTER[this.want];
    if (!name || !CUES[name]) return;
    this.next = name; this.fetchCue(name); if (this.ctx && !this.changing()) { this.decode(name); this.evict(); }
  }
  changing() { return !!(this.prev && this.ctx && this.ctx.currentTime < this.prev.exit + .5); }
  /** Keeps decoded music only for what is playing, what was asked for and what comes next (decoded audio is large on a
   *  phone). A track that is still sounding keeps its own buffers until it stops, so this never cuts anything off. */
  evict(keep = [this.cur?.name, this.want, this.next, this.prev?.name]) { for (const k of [...this.music.keys()]) if (!keep.includes(k)) this.music.delete(k); }
  // ---------------------------------------------------------------- tracks: a cue playing, its layers started together
  // track: source(s) -> segment gain (cut at a jump or an exit) -> layer gain -> fade-in -> distance (a low-pass) ->
  // level (ducking, quick fades) -> music bus; the level also feeds the room (send), opened only over a last beat
  makeTrack(m, name) {
    const c = this.ctx, D = m.D, tr = { name, m, D, voices: new Set(), layers: {}, segs: [], hold: null };
    tr.out = c.createGain(); tr.lp = c.createBiquadFilter(); tr.fin = c.createGain(); tr.send = c.createGain(); tr.send.gain.value = 0;
    tr.lp.type = 'lowpass'; tr.lp.frequency.value = Math.min(20000, c.sampleRate * .45); tr.lp.Q.value = 0;
    tr.fin.connect(tr.lp); tr.lp.connect(tr.out); tr.out.connect(this.musicBus); tr.out.connect(tr.send); tr.send.connect(this.mverb);
    const mix = this.mix[name] || {};
    for (const s of D.stems) { const g = tr.layers[s] = c.createGain(); g.gain.value = mix[s] ?? MIX[name]?.[s] ?? 1; g.connect(tr.fin); }
    return tr;
  }
  /** Starts the loop's layers at `at` from score beat `b` (inside the loop), holding a section if it has a hold. */
  segment(tr, at, b, fade = .012) {
    const c = this.ctx, D = tr.D, m = tr.m, L0 = secOf(D, D.loop[0]), o = secOf(D, b) - L0;
    const sec = Object.entries(D.sections).find(([, s]) => s[2] && b >= s[0] - 1e-6 && b < s[2] - 1e-6);
    const loop = sec ? [secOf(D, sec[1][0]) - L0, secOf(D, sec[1][2]) - L0] : [0, D.len];
    tr.hold = sec ? { name: sec[0], at, len: loop[1] - loop[0] } : null;
    const seg = { kind: 'loop', at, o, loop, voices: [] };
    for (const s of D.stems) {
      const buf = m.stems[s]; if (!buf) continue;
      const src = c.createBufferSource(), g = c.createGain(); src.buffer = buf;
      src.loop = true; src.loopStart = m.off + loop[0]; src.loopEnd = Math.min(buf.duration, m.off + loop[1]);
      src.connect(g); g.connect(tr.layers[s]);
      if (fade) { g.gain.setValueAtTime(0, at - .002); g.gain.linearRampToValueAtTime(1, at + fade); }
      src.start(at, m.off + o); this.own(tr, src); seg.voices.push({ src, g });
    }
    tr.segs.push(seg); return seg;
  }
  /** A part played once (the finale's first twenty bars, its outro) at `at`. */
  part(tr, kind, at, fade = .012) {
    const c = this.ctx, p = tr.m[kind]; if (!p) return null;
    const src = c.createBufferSource(), g = c.createGain(); src.buffer = p.buf; src.connect(g); g.connect(tr.layers.bed || tr.fin);
    if (fade) { g.gain.setValueAtTime(0, at - .002); g.gain.linearRampToValueAtTime(1, at + fade); }
    src.start(at, p.off); this.own(tr, src);
    const seg = { kind, at, o: 0, loop: null, b0: tr.D[kind].beats[0], voices: [{ src, g }] }; tr.segs.push(seg); return seg;
  }
  own(tr, src) { tr.voices.add(src); src.onended = () => { tr.voices.delete(src); if (!tr.voices.size && tr.done) this.drop(tr); }; }
  drop(tr) { this.fading.delete(tr); try { tr.out.disconnect(); tr.send.disconnect(); } catch { /* gone */ } if (this.cur === tr) this.cur = null; if (this.prev === tr) this.prev = null; }
  /** Stops a track's sources at `at` (sample-exactly), the last beat ringing on in the room. */
  cut(tr, at, segs = tr.segs) {
    const c = this.ctx, now = c.currentTime, spb = 60 / this.grid(tr, at).bpm, s = tr.send.gain;
    try { s.cancelScheduledValues(now); s.setValueAtTime(0, Math.max(now, at - spb)); s.linearRampToValueAtTime(WET, at); s.linearRampToValueAtTime(0, at + .03); } catch { /* a dry stop */ }
    for (const seg of segs) for (const v of seg.voices) {
      try { v.g.gain.cancelScheduledValues(Math.max(now, at - .02)); v.g.gain.setValueAtTime(1, Math.max(now, at - .012)); v.g.gain.linearRampToValueAtTime(0, at + .015); v.src.stop(at + .05); } catch { /* already stopped */ }
    }
  }
  /** Where a track is at time t: its segment and score beat. */
  where(tr, t) {
    let seg = tr.segs[0]; for (const s of tr.segs) if (s.at <= t + 1e-6) seg = s;
    if (!seg) return null;
    const D = tr.D; let p = seg.o + (t - seg.at);
    if (seg.loop && p >= seg.loop[1]) p = seg.loop[0] + (p - seg.loop[1]) % (seg.loop[1] - seg.loop[0]);
    const b = seg.kind === 'loop' ? beatOf(D, secOf(D, D.loop[0]) + p) : beatOf(D, secOf(D, seg.b0) + p);
    return { seg, p, b };
  }
  /** The beat grid of a track (or of a cadence) at time t. */
  grid(tr, t) {
    if (tr.cad) { const C = tr.D.cad, b = (t - tr.at) * C.bpm / 60; return { b, bpm: C.bpm, meter: C.meter, first: 0, phrase: [C.meter, 0], rows: C.chords, key: tr.D.key, name: tr.name, cad: true }; }
    const w = this.where(tr, t), D = tr.D, b = w ? w.b : beatOf(D, t - tr.start);
    return { b, bpm: bpmAt(D, b), meter: D.meter, first: D.first, phrase: D.phrase, rows: D.chords, key: D.key, name: tr.name };
  }
  /** What is sounding at time t: the playing track, a cadence ending a chapter, the track on its way out, or what is next. */
  sounding(t) {
    const c = this.cur; if (c && t >= c.start - 1e-3) return c;
    for (const e of this.tails) if (t >= e.at - 1e-3 && t < e.at + e.res + 2 * 60 / e.D.cad.bpm) return e;
    if (this.prev && t < this.prev.exit) return this.prev;
    return c || null;
  }
  /** The next grid point at or after t of what is sounding: a 32nd, 16th, 8th, beat, half bar, bar or phrase. */
  quant(q, t, tr = this.sounding(t)) {
    if (!tr || !q || q === 'none') return t;
    const g = this.grid(tr, t), spb = 60 / g.bpm;
    let n;
    if (q === 'bar' || q === 'half' || q === 'phrase') { const u = q === 'phrase' ? g.phrase[0] : q === 'half' && g.meter % 2 === 0 ? g.meter / 2 : g.meter, o = q === 'phrase' ? g.phrase[1] : g.first; n = o + Math.ceil((g.b - o) / u - 1e-6) * u; }
    else { const u = STEP[q] || 1; n = Math.ceil(g.b / u - 1e-6) * u; }
    return t + (n - g.b) * spb;
  }
  /** A musically sensible place to stop or jump: a phrase end if one comes within ~1.5 s, else a bar line within `wait`,
   *  else a half bar, else the next beat. `pick` (beats) asks for that much earlier (a pickup into the next section). */
  boundary(tr, t, wait = 2.4, pick = 0) {
    const g = this.grid(tr, t), spb = 60 / g.bpm, opts = [[g.phrase[0], g.phrase[1], 1.5], [g.meter, g.first, wait]];
    if (g.meter % 2 === 0) opts.push([g.meter / 2, g.first, wait]);
    opts.push([1, 0, 1e9]);
    for (const [u, o, lim] of opts) {
      const n = o + Math.ceil((g.b + pick - o) / u - 1e-6) * u - pick, dt = (n - g.b) * spb;
      if (dt <= lim) return t + dt;
    }
    return t;
  }
  // ---------------------------------------------------------------- music
  /** Moves to a cue. The current music plays on until the new one is decoded, so there is never a gap; a cue asked for
   *  before the context runs is scheduled anyway and starts the moment a touch unlocks it. The playing loop finishes its
   *  bar (or phrase) and plays its cadence; the new cue enters on the cadence's resolution. `sec` < 2.5 (skipping through
   *  the menu) stops it on the next beat instead. */
  async cue(name, sec = 3.2, { delay = .35 } = {}) {
    if (!name || !CUES[name]) return;
    this.want = name;
    if (!this.init()) return;
    const token = ++this.token;   // the latest request wins, even one for the music already playing
    if (this.cur?.name === name) return;
    const m = await this.decode(name);
    if (token !== this.token || !m) return;
    const c = this.ctx, now = c.currentTime, old = this.cur, fast = sec < 2.5;
    const pick = (CUES[name].first || 0) * 60 / CUES[name].bpm;   // a pickup (the wish's song) comes in before the bar line
    let at;
    if (old && old.start > now + .05) {   // still waiting for its entry (a cadence is playing): the newest choice takes its place
      at = old.start + old.pick - pick; old.done = true; for (const s of old.voices) try { s.stop(); } catch { /* never started */ }
      this.drop(old);
    } else if (old && (now - old.start < 3 || !old.m.cad)) {   // only just begun: it simply gives way, quickly
      at = this.quick(old, now + .05) + .1;
    } else if (old) {
      const E = fast ? this.quant('beat', now + .12, old) : this.boundary(old, now + delay);
      at = this.exit(old, E) - pick;
    } else at = now + .02;
    at = Math.max(at, now + .03);
    const tr = this.cur = this.makeTrack(m, name); tr.start = at + pick; tr.pick = pick;
    if (CUES[name].head) { this.part(tr, 'head', at, 0); this.segment(tr, at + CUES[name].head.len, CUES[name].loop[0], 0); }
    else this.segment(tr, at, 0, 0);
    // in on the resolution: a short bloom (a first cue, with nothing before it, fades in slowly)
    const fin = old ? .35 : Math.max(.6, sec * .85), f = tr.fin.gain;
    f.setValueAtTime(0, now); f.setValueAtTime(0, Math.max(now, at - .05)); f.setValueCurveAtTime(eqIn(64), Math.max(now, at - .05), fin);
    for (const [s, [after, ramp]] of Object.entries(INTRO[name] || {})) if (this.mix[name]?.[s] == null) tr.intro = { s, at: at + after, ramp };
    this.evict();
  }
  /** Ends a track at E: its sources stop exactly there, its last beat rings on, its cadence plays. Returns the moment of
   *  the cadence's resolution (where the next cue comes in). */
  exit(tr, E) {
    const c = this.ctx; tr.exit = E; tr.done = true; this.prev = tr; this.fading.add(tr);
    this.cut(tr, E);
    for (const f of this.fading) if (f !== tr && !f.quick) this.quick(f, c.currentTime);   // older ones bow out in under a second
    const C = tr.D.cad; if (!tr.m.cad) return E;
    const src = c.createBufferSource(), g = c.createGain(); src.buffer = tr.m.cad; src.connect(g); g.connect(this.musicBus);
    g.gain.value = Math.max(.0001, tr.out.gain.value) * Math.max(...Object.values(tr.layers).map(l => l.gain.value), .6);
    src.start(E, tr.m.cadOff);
    const e = { cad: true, name: tr.name, D: tr.D, at: E, res: C.res, src, g }; this.tails.add(e);
    src.onended = () => { this.tails.delete(e); g.disconnect(); };
    return E + C.res;
  }
  /** Lets a track go in under a second (a low-pass closing as it recedes); returns when it is gone. */
  quick(tr, at) {
    const c = this.ctx, now = c.currentTime, g = tr.out.gain, v = Math.max(.0001, g.value), s0 = Math.max(now + .01, at);
    tr.quick = tr.done = true; tr.exit = Math.min(tr.exit ?? 1e9, s0 + .8); this.fading.add(tr);
    try { g.cancelScheduledValues(now); g.setValueAtTime(v, now); g.setValueAtTime(v, s0); g.setValueCurveAtTime(eqOut(32).map(x => x * v), s0, .8); }
    catch { quiet(() => { g.setValueAtTime(v, s0); g.linearRampToValueAtTime(0, s0 + .8); }); }
    try { const f = tr.lp.frequency; f.cancelScheduledValues(now); f.setValueAtTime(f.value, s0); f.exponentialRampToValueAtTime(900, s0 + .75); } catch { /* the fade alone will do */ }
    for (const s of tr.voices) try { s.stop(s0 + .85); } catch { /* already stopped */ }
    if (!tr.voices.size) this.drop(tr);
    return s0 + .8;
  }
  /** Lets the cue end on its cadence (the finale: its own last line and long last chord); nothing follows. Returns when it starts. */
  end(name) {
    const tr = this.cur; if (!tr || !this.ctx || (name && tr.name !== name) || tr.done || tr.outro) return null;
    const c = this.ctx, now = c.currentTime;
    if (tr.start > now) return null;   // (not in yet)
    if (tr.m.outro) {   // the finale: its last bars follow any bar of it
      const B = this.boundary(tr, now + .25, 3.6); tr.outro = true; this.want = null;
      this.cut(tr, B); this.part(tr, 'outro', B, .02); tr.hold = null;
      tr.segs = tr.segs.filter(s => s.kind === 'outro' || s.at <= B); return B;
    }
    const B = this.boundary(tr, now + .25); this.want = null; this.exit(tr, B); this.cur = null; return B;
  }
  /** Moves the playing cue to a section on its next phrase end (within ~1.5 s), else its next bar line (a section that
   *  starts with a pickup moves that much earlier). A section already playing, or about to by itself, is left alone. */
  section(name, { wait = 2.6 } = {}) {
    const tr = this.cur, S = tr?.D.sections[name]; if (!S || !this.ctx || tr.done || tr.outro) return null;
    const c = this.ctx, now = c.currentTime, t = Math.max(now + .15, tr.start), [at, pick, holdEnd] = S;
    const B = this.boundary(tr, t, wait, pick), w = this.where(tr, B); if (!w || w.seg.kind !== 'loop') return null;
    const ends = Object.values(tr.D.sections).map(s => s[0]).filter(x => x > at).concat([tr.D.loop[1]]), until = Math.min(holdEnd || 1e9, ...ends);
    const inside = w.b >= at - pick - 1e-3 && w.b < until - pick - 1e-3;
    if (inside) { if (tr.hold && tr.hold.name !== name) this.unhold(tr); return B; }
    this.cut(tr, B, tr.segs.filter(s => s.at <= B)); tr.segs = tr.segs.filter(s => s.at <= B);
    this.segment(tr, B, at - pick); return B;
  }
  /** A held section lets go: the loop carries on past it (the same sources, so nothing moves). */
  unhold(tr) {
    const seg = tr.segs[tr.segs.length - 1], now = this.ctx.currentTime, w = this.where(tr, now);
    if (!tr.hold || !w || w.seg !== seg || seg.loop[1] - w.p < .06) return false;   // (too close to its loop point: next time)
    for (const v of seg.voices) { v.src.loopStart = tr.m.off; v.src.loopEnd = Math.min(v.src.buffer.duration, tr.m.off + tr.D.len); }
    seg.at = now; seg.o = w.p; seg.loop = [0, tr.D.len]; tr.hold = null; return true;
  }
  /** Raises or lowers a layer of the playing cue (or, with {cue}, of a cue about to play) over `sec` seconds. */
  layer(name, level = 1, sec = 1.5, { cue } = {}) {
    cue = cue || this.cur?.name || this.want; if (!cue || !CUES[cue]?.stems.includes(name)) return;
    level = Math.max(0, Math.min(1.2, +level || 0));
    (this.mix[cue] ||= {})[name] = level;
    const tr = this.cur?.name === cue ? this.cur : null; if (!tr || !this.ctx) return;
    if (tr.intro?.s === name) tr.intro = null;
    const g = tr.layers[name].gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now);
    if (sec > .02) g.setTargetAtTime(level, now, sec / 3); else g.setValueAtTime(level, now);
  }
  /** Seconds into a cue while it is the one playing (null otherwise), for scenes that keep time with the music. */
  time(name) {
    const tr = this.cur; if (!tr || tr.name !== name || !this.ctx || this.ctx.state !== 'running') return null;
    const now = this.ctx.currentTime; if (now < tr.start) return null;
    const w = this.where(tr, now); return w && w.seg.kind === 'loop' ? w.p : w ? now - tr.start : null;
  }
  /** The beat of what is sounding: {cue, beat, bar, phase, bpm, meter, next (context time of the next beat), chord}. */
  beat() {
    if (!this.ctx) return null; const now = this.ctx.currentTime, tr = this.sounding(now); if (!tr) return null;
    const g = this.grid(tr, now), b = g.b - g.first, r = chordAt(g.rows, g.b);
    return { cue: g.name, beat: b, bar: Math.floor(b / g.meter), phase: b - Math.floor(b), bpm: g.bpm, meter: g.meter, next: now + (Math.ceil(g.b - 1e-6) - g.b) * 60 / g.bpm, chord: { root: r[1], bass: r[2], tones: r[3] }, cadence: !!g.cad };
  }
  /** Seconds from now until a context time (what hit() and launch() return). */
  until(when) { return this.ctx && when != null ? Math.max(0, when - this.ctx.currentTime) : 0; }
  /** Lowers this chapter's music under a quiet moment (0..1); the next cue comes in at full level. */
  duck(level = .35, sec = 1.5) {
    const tr = this.cur; if (!tr || !this.ctx) return; const g = tr.out.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(level, now + sec);
  }
  /** Housekeeping four times a second: an intro layer coming in, a held section letting go after a while, the next
   *  chapter's music decoded once a change is over. */
  conduct() {
    const c = this.ctx; if (!c || c.state !== 'running') return; const now = c.currentTime, tr = this.cur;
    if (tr?.intro && now >= tr.intro.at) { const { s, ramp } = tr.intro; tr.intro = null; const g = tr.layers[s].gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.setTargetAtTime(this.mix[tr.name]?.[s] ?? 1, now, ramp / 3); }
    if (tr?.hold && now > tr.hold.at + tr.hold.len * (HOLDS - .5)) this.unhold(tr);
    if (this.next && !this.changing() && !this.music.has(this.next) && CUES[this.next]) { this.decode(this.next); this.evict(); }
    if (this.prev && now > this.prev.exit + .5 && !this.prev.voices.size) this.prev = null;
    if (this.cur?.done && !this.cur.voices.size) this.cur = null;
    this.busy *= Math.exp(-(now - this.busyAt) / 1.5); this.busyAt = now;
  }
  // ---------------------------------------------------------------- stingers
  /** semitones from the score's own key (D) to a cue's key, the nearer way */
  semis(key) { return ((key - MAP.phrases.tonic + 6) % 12 + 12) % 12 - 6; }
  /** The harmony sounding at time t: root, bass, chord tones, twinkle tones, key. */
  harmony(t) {
    const tr = this.sounding(t); if (!tr) return { root: 2, bass: 2, tones: [2, 6, 9], tw: [2, 4, 6, 9, 11], key: 2 };
    const g = this.grid(tr, t), r = chordAt(g.rows, g.b + .12 * g.bpm / 60);
    return { root: r[1], bass: r[2], tones: r[3], tw: r[4], key: g.key };
  }
  /** A stinger in the key and chord of the moment, on the next grid point ({quantize: '16th'|'8th'|'beat'|'bar'|'none'},
   *  or {at} a context time). {vel 0..1, pan -1..1, index (which candle, star, photo), of (how many stars)}. Returns the
   *  context time it sounds, or null (no sound now). Rate-limited, and quieter when many come close together. */
  hit(kind, { quantize, vel = 1, pan = 0, index = 0, of, at } = {}) {
    const K = KINDS[kind]; if (!K || !this.ctx || !this.on || !this.live()) return null;
    const c = this.ctx, now = c.currentTime;
    const when = at != null ? Math.max(at, now + .02) : this.quant(quantize || K.q, now + .035);
    if (K.gap && when - (this.lastHit[kind] ?? -1) < K.gap) return null;
    this.lastHit[kind] = when;
    this.busy = this.busy * Math.exp(-(now - this.busyAt) / 1.5) + 1; this.busyAt = now;
    const h = this.harmony(when), spb = 60 / (this.grid(this.sounding(when) || {}, when)?.bpm || 90), level = K.v * vel / Math.sqrt(1 + Math.max(0, this.busy - 2) / 3);
    const notes = K.f(h, { index, of }, this).filter(n => n && n[1] != null);
    this.bank?.then(B => { if (B) for (const [inst, p, dt, v] of notes) this.note(B, inst, p, when + dt * Math.min(spb, .5), v * level, pan + (Math.random() - .5) * .1); });
    return when;
  }
  /** One note from the bank, bent from the nearest sample; the oldest notes give way past twelve at once. */
  note(B, inst, p, at, gain, pan) {
    const set = MAP.bank.notes[inst]; if (!set) return;
    const c = this.ctx; let s = set[0]; for (const x of set) if (Math.abs(x[0] - p) < Math.abs(s[0] - p)) s = x;
    const rate = Math.pow(2, (p - s[0]) / 12), src = c.createBufferSource(), g = c.createGain(); src.buffer = B.buf; src.playbackRate.value = rate;
    const dur = s[2] / rate; g.gain.setValueAtTime(gain, at); g.gain.setValueAtTime(gain, at + dur - .1); g.gain.linearRampToValueAtTime(0, at + dur);
    src.connect(g); let node = g;
    if (pan && c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(pn); node = pn; }
    node.connect(this.stingBus);
    src.start(at, B.off + s[1], s[2]); src.stop(at + dur + .02);
    const v = { src, g, at }; this.voices.push(v); src.onended = () => { const i = this.voices.indexOf(v); if (i >= 0) this.voices.splice(i, 1); node.disconnect(); };
    while (this.voices.length > 12) { const o = this.voices.shift(), n = c.currentTime; try { o.g.gain.cancelScheduledValues(n); o.g.gain.setValueAtTime(o.g.gain.value, n); o.g.gain.linearRampToValueAtTime(0, n + .05); o.src.stop(n + .06); } catch { /* done */ } }
  }
  // ---------------------------------------------------------------- ambience: beds that loop on long crossfades (noise-like, so any point joins any other)
  bed(name, sec = 3.5) {
    for (const [k, b] of this.beds) if (k !== name) { this.beds.delete(k); this.fadeBed(b, sec); }
    if (!name || this.beds.has(name) || !BEDS[name] || !this.init()) return;
    const [file, level] = BEDS[name], c = this.ctx, g = c.createGain(); g.gain.value = 0; g.connect(this.ambBus);
    const b = { g, next: 0, timer: 0, srcs: new Set() }; this.beds.set(name, b);
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(level, c.currentTime + sec);
    this.loadBuffer(file).then(buf => {
      if (!buf || this.beds.get(name) !== b) return;
      // each pass keeps clear of the file's own fades; passes are at least twice the crossfade long, so curves never overlap
      const D = buf.duration, edge = Math.min(1.6, D * .06), span = D - 2 * edge, X = Math.min(4, span / 4), ahead = Math.min(6, span / 2 - X - .5);
      const seg = (at, first) => {   // one pass through the bed from a random point; the next one overlaps its fade-out
        const s = c.createBufferSource(), e = c.createGain(); s.buffer = buf; s.connect(e); e.connect(g);
        const off = edge + Math.random() * span * .5, L = D - edge - off;
        if (first) e.gain.value = 1; else { e.gain.value = 0; e.gain.setValueCurveAtTime(eqIn(32), at, X); }
        e.gain.setValueCurveAtTime(eqOut(32), at + L - X, X);
        s.start(at, off); s.stop(at + L); s.end = at + L; b.srcs.add(s); s.onended = () => { b.srcs.delete(s); e.disconnect(); };
        return at + L - X;
      };
      // scheduled well ahead, so a busy or throttled main thread can be late by seconds without a gap
      const tick = () => { if (this.beds.get(name) === b && c.currentTime > b.next - ahead) b.next = seg(Math.max(b.next, c.currentTime + .05)); };
      b.next = seg(c.currentTime + .05, true);
      b.timer = setInterval(tick, 500);
    });
  }
  fadeBed(b, sec) {
    clearInterval(b.timer); const c = this.ctx, g = b.g.gain, now = c.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + sec);
    for (const s of b.srcs) try { s.stop(Math.min(s.end, now + sec + .05)); } catch { /* already over */ }
    setTimeout(() => b.g.disconnect(), sec * 1000 + 3000);
  }
  // ---------------------------------------------------------------- effects
  sfx(name, vol, opts) { this.play(name, vol, opts); }
  /** (what sfx calls: other modules may wrap sfx, so the page's own effects come straight here) */
  play(name, vol = 1, { pan = 0, verb = 0, delay = 0, rate = 1, lowpass = 0, at = null } = {}) {
    if (!this.ctx || !this.on || !this.live()) return;
    name = ALIAS[name] || name; const key = name.startsWith('fw-') || name.startsWith('amb-') ? name : 'sfx-' + name, asked = performance.now();
    this.loadBuffer(key).then(b => {
      // still decoding long after it was asked for (a slow phone, the first touch): better left out than heard late
      if (!b || this.ctx.state === 'closed' || !this.live() || performance.now() - asked > 1500) return;
      const c = this.ctx, s = c.createBufferSource(), g = c.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol;
      s.connect(g); let node = g;
      if (lowpass) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; node.connect(f); node = f; }
      if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node.connect(p); node = p; }
      node.connect(this.sfxBus);
      if (verb) { const v = c.createGain(); v.gain.value = verb; node.connect(v); v.connect(this.verbIn); }
      s.start(at != null ? Math.max(at, c.currentTime) : c.currentTime + delay);
    });
  }
  /** A firework far beyond the window: x 0..1 across the screen places it in the stereo field; the boom arrives a moment
   *  after the light, as it would from far away (landing on the music's next eighth), washed in a wide reverb, with a
   *  glint of celesta in the key. */
  firework(x = .5, kind = 'burst', big = 1) {
    const pan = (x * 2 - 1) * .85;
    if (kind === 'launch') return this.play('fw-launch', .5 * big, { pan, verb: .5, lowpass: 2600 });
    if (!this.ctx) return;
    const now = this.ctx.currentTime, q = this.quant('8th', now + .32), at = q - now <= .8 ? q : now + .38 + Math.random() * .2;
    this.boom(at, pan, big); this.hit('burst', { at, pan: pan * .7, vel: .8 * big });
  }
  boom(at, pan, big) { this.play(Math.random() < .5 ? 'fw-burst1' : 'fw-burst2', .85 * big, { pan, verb: 1.1, at, lowpass: 3800, rate: .92 + Math.random() * .16 }); }
  /** A firework she sends up herself: the whoosh now, the burst on the next free beat at least `after` s away (a tap
   *  storm spreads over the beats instead of piling up). Returns the context time of the burst, for the picture. */
  launch(x = .5, big = 1, { after = 1.0 } = {}) {
    if (!this.ctx || !this.on || !this.live()) return null;
    const c = this.ctx, now = c.currentTime, pan = (x * 2 - 1) * .85;
    this.firework(x, 'launch', big);
    this.booms = this.booms.filter(b => b > now - .1);
    let at = this.quant('beat', now + after);
    for (let k = 0; k < 4 && this.booms.some(b => Math.abs(b - at) < .05); k++) at = this.quant('beat', at + .05);
    if (!this.booms.some(b => Math.abs(b - at) < .05)) { this.booms.push(at); this.boom(at, pan, big); this.hit('burst', { at, pan: pan * .7, vel: .9 * big }); }
    return at;
  }
  // ---------------------------------------------------------------- the voice memo
  checkVoice() {
    return this.voice.check ??= (async () => {
      this.voice.state = 'checking';
      for (const ext of ['mp3', 'm4a']) {
        try { const r = await fetch(asset(`audio/voice.${ext}`), { method: 'HEAD' }); if (r.ok && +(r.headers.get('content-length') || 1) > 0) { this.voice.file = `voice.${ext}`; break; } } catch { /* offline */ }
      }
      this.voice.state = this.voice.file ? 'ready' : 'none';
      if (this.voice.file) this.fetch('voice');   // downloaded now, decoded on the first tap
      return this.hasVoice;
    })();
  }
  get hasVoice() { return this.voice.state === 'ready'; }
  /** Plays the recorded message: the music and the ambience sink to a whisper, then come back when it ends. */
  async playVoice(onEnd) {
    if (!this.init() || !this.hasVoice) return false;
    this.unlock(); this.stopVoice(true);
    const n = ++this.voice.n, buf = await this.loadBuffer('voice');
    if (!buf || n !== this.voice.n) return false;   // stopped (the chapter moved on) while it was decoding
    const c = this.ctx, now = c.currentTime;
    for (const bus of [this.musicBus, this.ambBus]) { const g = bus.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(bus === this.musicBus ? .16 : .25, now + 1.1); }
    const s = c.createBufferSource(), g = c.createGain(); s.buffer = buf; g.gain.value = 1; s.connect(g); g.connect(this.voiceBus);
    s.start(now + .9); this.voice.src = s;
    s.onended = () => { g.disconnect(); if (this.voice.src === s) { this.voice.src = null; this.restoreFromVoice(); onEnd && onEnd(); } };
    return buf.duration + .9;
  }
  stopVoice(hush) { this.voice.n++; const s = this.voice.src; if (!s) return; this.voice.src = null; try { s.stop(); } catch { /* done */ } if (!hush) this.restoreFromVoice(); }
  restoreFromVoice() {
    if (!this.ctx) return; const now = this.ctx.currentTime;
    for (const bus of [this.musicBus, this.ambBus]) { const g = bus.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(1, now + 2.2); }
  }
  // ---------------------------------------------------------------- transport
  toggle() {
    this.on = !this.on;
    if (this.ctx) { const g = this.master.gain; g.cancelScheduledValues(this.ctx.currentTime); g.setTargetAtTime(this.on ? 1 : 0, this.ctx.currentTime, .15); }
    return this.on;
  }
  pause(p) {
    this.paused = p;
    if (this.ctx) quiet(() => p ? this.ctx.suspend() : this.ctx.resume());   // a refused resume (iOS, no touch yet) is retried by unlock()
    if (this.keep) p ? this.keep.pause() : quiet(() => this.keep.play());
  }
  /** Decoded audio held right now, in MB (for the tests: the phone budget). */
  mem() {
    const mb = b => b ? b.length * b.numberOfChannels * 4 / 1048576 : 0, out = { cues: {}, total: 0 };
    const seen = new Set(), add = (k, b) => { if (b && !seen.has(b)) { seen.add(b); out.cues[k] = (out.cues[k] || 0) + mb(b); out.total += mb(b); } };
    for (const tr of [this.cur, this.prev, ...this.fading]) if (tr) { for (const b of Object.values(tr.m.stems)) add(tr.name, b); add(tr.name, tr.m.cad); add(tr.name, tr.m.head?.buf); add(tr.name, tr.m.outro?.buf); }
    for (const e of this.tails) add(e.name + '.end', e.src.buffer);
    return out;
  }
}
