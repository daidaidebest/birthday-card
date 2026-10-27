// Sound, all through Web Audio (v16, v17 handoffs): music as decoded buffers, so loops are gapless and chapters hand over
// with long, overlapping crossfades (the next chapter's music is decoded ahead of time, so there is never a silent gap).
// v17: the new chapter comes in on a bar line of the old one (waiting up to ~2 s for it), and the old one recedes into
// the distance as it fades (a low-pass closing down); keys of neighbouring chapters differ by one sharp at most; ambient beds
// at ~15% under the music; soft effects with stereo position and a reverb send; ducking for the voice memo.
// iPhone: the context is unlocked (and re-unlocked after calls, Siri or a trip to the home screen) from any touch, and the
// audio session is set to 'playback' so the music plays even with the ringer switch on silent (older iOS: a silent media
// element does the same job).
import { asset } from './util.js';

// loop length of each cue in seconds (exactly what tools/score.py rendered; 0 = plays once)
const MUSIC = { prologue: 63.157891, book: 76.190476, journey: 70.344828, memories: 80, film: 60, wish: 45, finale: 0 };
// each cue's beat grid: [bpm, beats per bar, beat of the first bar line] (the wish's song starts on its pickup)
const GRID = { prologue: [76, 4, 0], book: [63, 4, 0], journey: [116, 4, 0], memories: [66, 4, 0], film: [96, 4, 0], wish: [84, 3, 1], finale: [72, 4, 0] };
// longer overlaps where the incoming music opens with a hush in the same key family
const XF = { 'prologue>book': 1.1, 'journey>memories': 1.15, 'film>wish': 1.2, 'wish>finale': 1.3 };
const AFTER = { wish: 'finale' };   // music a chapter moves on to by itself (decoded ahead like the next chapter's)
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

export class Audio {
  constructor(env) {
    this.env = env; this.on = true; this.ctx = null; this.paused = false; this.wokeAt = -1e9;
    this.bytes = new Map(); this.music = new Map(); this.buffers = new Map(); this.cur = null; this.token = 0; this.beds = new Map(); this.fading = new Set();
    this.voice = { state: 'unknown', n: 0 };
    // start downloading the opening music right away; it is decoded as soon as there is a context
    this.fetch('prologue'); this.checkVoice();
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
    // paused (or hidden) stays silent even if the system wakes the context; 'interrupted' (iOS: a call, Siri) waits for the next touch
    c.onstatechange = () => { if (c.state === 'running' && (this.paused || document.hidden)) quiet(() => c.suspend()); };
    for (const ev of ['focus', 'pageshow']) addEventListener(ev, () => this.unlock());   // iOS often allows a resume once the call is over
    SFX.forEach(n => this.loadBuffer('sfx-' + n)); ['fw-launch', 'fw-burst1', 'fw-burst2', 'amb-wind', 'amb-fire'].forEach(n => this.loadBuffer(n));
    if (this.bytes.has('prologue')) this.decode('prologue');
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
  impulse(sec, decay) {
    const c = this.ctx, n = Math.round(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * .35; d[i] = lp * Math.exp(-i / c.sampleRate * decay) * Math.min(1, i / (c.sampleRate * .02)); } }
    return b;
  }
  // ---------------------------------------------------------------- loading (null: the file is not there; undefined: try again later)
  fetch(name) {
    const file = name === 'voice' ? this.voice.file : name + '.mp3';
    return once(this.bytes, name, () => fetch(asset('audio/' + file)).then(r => r.ok ? r.arrayBuffer() : null).catch(() => undefined));
  }
  decodeData(ab) { return new Promise((res, rej) => { const p = this.ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); }   // settles once, whichever answers
  loadBuffer(name) {
    if (!this.ctx) return Promise.resolve(null);
    return once(this.buffers, name, () => this.fetch(name).then(ab => ab ? this.decodeData(ab.slice(0)) : ab).catch(() => undefined));
  }
  /** Decodes a music cue (once) and finds its exact loop: encoders may pad the start, so skip any leading silence. */
  decode(name) {
    if (!MUSIC.hasOwnProperty(name) || !this.init()) return Promise.resolve(null);
    return once(this.music, name, () => this.fetch(name).then(ab => ab ? this.decodeData(ab.slice(0)) : ab).then(buf => {
      if (!buf) return buf;
      const d = buf.getChannelData(0), sr = buf.sampleRate; let off = 0;
      if (buf.duration - (MUSIC[name] || buf.duration) > .015) { const lim = Math.min(d.length, sr * .08); while (off < lim && Math.abs(d[off]) < 1e-4) off++; }
      return { name, buf, off: off / sr, len: MUSIC[name] || 0 };
    }).catch(() => undefined));
  }
  /** Gets the next chapter's music ready while this one plays. */
  prepare(name) {
    name = name || AFTER[this.want];
    if (!name || !MUSIC.hasOwnProperty(name)) return;
    this.next = name; this.fetch(name); if (this.ctx) { this.decode(name); this.evict(); }
  }
  /** Keeps decoded music only for what is playing, what was asked for and what comes next (decoded audio is large on a
   *  phone). A track that is fading out keeps its own buffer until it stops, so this never cuts anything off. */
  evict(keep = [this.cur?.name, this.want, this.next]) { for (const k of [...this.music.keys()]) if (!keep.includes(k)) this.music.delete(k); }
  // ---------------------------------------------------------------- music
  /** Crossfades to a cue. The current music keeps playing until the new one is decoded, so there is never a gap; a cue
   *  asked for before the context runs is scheduled anyway and starts the moment a touch unlocks it. The new cue starts
   *  on the old one's next bar line if that comes within ~2 s (else its next half bar or beat), so the two pulses meet. */
  async cue(name, sec = 3.2, { delay = .35 } = {}) {
    if (!name || !MUSIC.hasOwnProperty(name)) return;
    this.want = name;
    if (!this.init()) return;
    const token = ++this.token;   // the latest request wins, even one for the music already playing
    if (this.cur?.name === name) return;
    const m = await this.decode(name);
    if (token !== this.token || !m) return;
    const c = this.ctx, now = c.currentTime, old = this.cur;
    if (old) sec *= XF[old.name + '>' + name] || 1;
    // source -> fade-in -> distance (a low-pass, open until it leaves) -> level (ducking, fade-out) -> music bus:
    // the two fades never share an automation timeline
    const src = c.createBufferSource(), gin = c.createGain(), lp = c.createBiquadFilter(), g = c.createGain(); src.buffer = m.buf;
    lp.type = 'lowpass'; lp.frequency.value = Math.min(20000, c.sampleRate * .45); lp.Q.value = 0;
    if (m.len) { src.loop = true; src.loopStart = m.off; src.loopEnd = Math.min(m.buf.duration, m.off + m.len); }
    src.connect(gin); gin.connect(lp); lp.connect(g); g.connect(this.musicBus);
    const fin = Math.max(.6, sec * .85), t0 = old ? this.barLine(old, now + delay, Math.min(2, sec * .6)) : now + .02;
    gin.gain.setValueAtTime(0, now); gin.gain.setValueCurveAtTime(eqIn(64), t0, fin);
    src.start(t0, m.off);
    const tr = this.cur = { name, src, g, lp, t0, off: m.off, len: m.len || m.buf.duration };
    src.onended = () => { this.fading.delete(tr); g.disconnect(); if (this.cur === tr) this.cur = null; };
    if (old) this.release(old, sec * 1.15, t0 - Math.min(.34, t0 - now));   // the old one starts to give way just before
    this.evict();
  }
  /** The first bar line (else half bar, else beat) of a playing cue at or after `at`, if it comes within `wait` s. */
  barLine(tr, at, wait) {
    const gr = GRID[tr.name]; if (!gr) return at;
    const spb = 60 / gr[0], p = (at - tr.t0) / spb - gr[2]; if (p < 0) return at;
    for (const n of [gr[1], gr[1] % 2 ? 1 : 2, 1]) { const w = (Math.ceil(p / n - 1e-6) * n - p) * spb; if (w <= wait) return at + w; }
    return at;
  }
  release(tr, sec, at = 0) {
    const c = this.ctx, now = c.currentTime, g = tr.g.gain, v = Math.max(.0001, g.value), s0 = Math.max(now + .01, at);
    try { g.cancelScheduledValues(now); g.setValueAtTime(v, now); g.setValueAtTime(v, s0); g.setValueCurveAtTime(eqOut(64).map(x => x * v), s0, sec); }
    catch { quiet(() => { g.setValueAtTime(v, s0); g.linearRampToValueAtTime(0, s0 + sec); }); }
    if (tr.lp) try { const f = tr.lp.frequency; f.cancelScheduledValues(now); f.setValueAtTime(f.value, s0); f.exponentialRampToValueAtTime(900, s0 + sec * .9); } catch { /* the fade alone will do */ }
    try { tr.src.stop(s0 + sec + .1); } catch { /* already stopped */ }
    // hurrying through the chapters: only the latest outgoing track keeps its long fade; older ones bow out in under a second
    for (const f of this.fading) if (!f.quick) {
      f.quick = true; const q = f.g.gain, w = q.value;
      try { q.cancelScheduledValues(now); q.setValueAtTime(w, now); q.linearRampToValueAtTime(0, now + .8); f.src.stop(now + .9); } catch { /* ending anyway */ }
    }
    this.fading.add(tr);
  }
  /** Seconds into a cue while it is the one playing (null otherwise), for scenes that keep time with the music. */
  time(name) {
    const tr = this.cur; if (!tr || tr.name !== name || !this.ctx || this.ctx.state !== 'running') return null;
    const p = this.ctx.currentTime - tr.t0; if (p < 0) return null;
    return tr.len ? p % tr.len : p;
  }
  /** Lowers this chapter's music under a quiet moment (0..1); the next cue comes in at full level. */
  duck(level = .35, sec = 1.5) {
    const tr = this.cur; if (!tr || !this.ctx) return; const g = tr.g.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(level, now + sec);
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
  play(name, vol = 1, { pan = 0, verb = 0, delay = 0, rate = 1, lowpass = 0 } = {}) {
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
      s.start(c.currentTime + delay);
    });
  }
  /** A firework far beyond the window: x 0..1 across the screen places it in the stereo field; the boom arrives a moment
   *  after the light, as it would from far away, washed in a wide reverb. */
  firework(x = .5, kind = 'burst', big = 1) {
    const pan = (x * 2 - 1) * .85;
    if (kind === 'launch') this.play('fw-launch', .5 * big, { pan, verb: .5, lowpass: 2600 });
    else this.play(Math.random() < .5 ? 'fw-burst1' : 'fw-burst2', .85 * big, { pan, verb: 1.1, delay: .38 + Math.random() * .2, lowpass: 3800, rate: .92 + Math.random() * .16 });
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
}
