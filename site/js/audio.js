// Music cues stream through <audio> elements routed into Web Audio gains so crossfades also work on iOS.
const CUES = {
  prologue: 'assets/audio/prologue.mp3',
  book: 'assets/audio/book.mp3',
  journey: 'assets/audio/journey.mp3',
  memories: 'assets/audio/memories.mp3',
  film: 'assets/audio/film.mp3',
  wish: 'assets/audio/wish.mp3',
  finale: 'assets/audio/finale.mp3',
};
const SFX = ['seal', 'chime', 'page', 'whoosh', 'sparkle', 'blow', 'owl', 'light'];

export class Audio {
  constructor(env) {
    this.env = env; this.on = true; this.ctx = null; this.tracks = new Map(); this.current = null; this.buffers = new Map(); this.paused = false;
  }
  unlock() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = 1; this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = .55; this.sfxBus.connect(this.master);
      // Prime iOS with a silent buffer inside the gesture.
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      SFX.forEach(n => this.loadSfx(n));
    } catch (e) { console.warn('audio', e); }
  }
  async loadSfx(name) {
    try {
      const r = await fetch(`assets/audio/sfx-${name}.mp3`); if (!r.ok) return;
      const data = await r.arrayBuffer();
      this.buffers.set(name, await new Promise((res, rej) => this.ctx.decodeAudioData(data, res, rej)));
    } catch { /* optional */ }
  }
  track(name) {
    if (this.tracks.has(name)) return this.tracks.get(name);
    const el = new window.Audio(); el.preload = 'auto'; el.loop = true; el.src = CUES[name];
    const t = { el, gain: null };
    if (this.ctx && location.protocol !== 'file:') { // file:// media cannot be routed through Web Audio
      try { const src = this.ctx.createMediaElementSource(el); t.gain = this.ctx.createGain(); t.gain.gain.value = 0; src.connect(t.gain).connect(this.master); } catch { t.gain = null; }
    }
    this.tracks.set(name, t); return t;
  }
  fade(t, to, sec) {
    if (t.gain) { const g = t.gain.gain, now = this.ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(to, now + sec); }
    else { const from = t.el.volume, start = performance.now(); const step = () => { const k = Math.min(1, (performance.now() - start) / (sec * 1000)); t.el.volume = from + (to - from) * k; if (k < 1) requestAnimationFrame(step); }; step(); }
    if (to === 0) setTimeout(() => { if (this.current !== t) t.el.pause(); }, sec * 1000 + 60);
  }
  cue(name, sec = 2.5) {
    if (!name || !CUES[name] || !this.ctx) return;
    const next = this.track(name);
    if (this.current === next) return;
    if (this.current) this.fade(this.current, 0, sec);
    this.current = next;
    if (!next.gain) next.el.volume = 0;
    next.el.currentTime = 0;
    if (!this.paused) next.el.play().catch(() => {});
    this.fade(next, 1, sec);
  }
  /** Lower the music under a quiet moment (0..1). */
  duck(level = .35, sec = 1.5) { if (this.current) this.fade(this.current, level, sec); }
  sfx(name, vol = 1) {
    if (!this.ctx || !this.on) return; const b = this.buffers.get(name); if (!b) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(); g.gain.value = vol; s.buffer = b; s.connect(g).connect(this.sfxBus); s.start();
  }
  toggle() {
    this.on = !this.on;
    if (this.ctx) { const g = this.master.gain; g.cancelScheduledValues(this.ctx.currentTime); g.setTargetAtTime(this.on ? 1 : 0, this.ctx.currentTime, .15); }
    else this.tracks.forEach(t => { t.el.muted = !this.on; });
    return this.on;
  }
  pause(p) {
    this.paused = p;
    if (this.ctx) p ? this.ctx.suspend() : this.ctx.resume();
    if (this.current) p ? this.current.el.pause() : this.current.el.play().catch(() => {});
  }
}
