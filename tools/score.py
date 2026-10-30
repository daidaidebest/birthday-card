"""The film's original score, composed here as MIDI and performed by real sampled instruments
(MuseScore General SoundFont, MIT) through FluidSynth, then mixed and mastered to seamless loops.

v19: a score that builds toward one moment. Each chapter has its own tune, colour and key; the keys move by at most one
sharp from chapter to chapter, so the handoffs never clash. Happy Birthday is kept back for the last chapter (no chapter
before it, no stinger, no cadence may play even a fragment of it: tools/check_hb.py proves this and fails otherwise).

  prologue  B minor -> D   76 bpm  moonlit mystery, then wonder: tremolo strings, harp harmonics, celesta; the night
                                   motif low on a flute; the moonlit tune on a solo violin when the letter lands ('bloom',
                                   bar 5); the letter motif (a rising sixth, a quill's stepwise fall) on celesta and harp
                                   as the letter writes itself ('letter', bar 13), answered by violin and flute.
  book      A major        63 bpm  warm, intimate: a fireside lullaby in 12/8 (nylon guitar, felt piano); the story theme
                                   (the dream theme, 16 bars, the score's main tune) lilting on clarinet, sung by the cello.
  journey   D major       116 bpm  a tender travelling ballad, felt in half time: her road (flute) sings the journey's own
                                   tune, his (cello) climbs toward it; in Tokyo (bar 15) they meet in octaves on the story
                                   theme's opening; the road home in harmony. The sand keeps this grid (34 bars, 70.34 s).
  memories  E minor -> G   66 bpm  nostalgic, close: a piano nocturne of its own; her letter ('bloom') brings the letter
                                   motif back in G on a solo violin, the cello beneath, vibraphone light.
  film      D Mixolydian   96 bpm  expansive: strings galloping, the horses' horn call in open fifths, a tender flute for
            -> G Lydian -> G       the close-up, the savanna's broad tune on horn, strings and voices, the stars' own tune
                                   on celesta (its last note the falling star), the gallop gathering again.
  wish      G major (3/4)  76 bpm  the last chapter. 'glow', held while she lights the candles: a G pedal, and the tunes
                                   of the story return one by one (the letter, the story theme, her road); each candle
                                   rings the next note of Happy Birthday's first line (she plays it herself). 'song', once
                                   all six burn: a bar's breath on the dominant, then Happy Birthday, the first time it is
                                   heard: felt piano and celesta, the cello answering with the story theme; a second verse
                                   on violin and flute.
  finale    G major (3/4)  72 bpm  the climax, after the wish, orchestral (no drum kit): Happy Birthday in full as the
            (rit. 66, 60)          fireworks rise, the horns weaving the story theme round it; the story theme as a waltz
                                   for the credits; the postcard: the waltz on piano, then cello with the letter motif
                                   above; Happy Birthday's last line, slowing, and a long last chord.

Needs: fluidsynth, the MuseScore General soundfont (apt: fluidsynth musescore-general-soundfont), ffmpeg,
python: numpy, scipy, mido.   Run: python3 tools/score.py [name ...]  ->  site/assets/audio/<name>.mp3
Keep js/audio.js MUSIC (loop lengths, printed below) and GRID (bpm, beats per bar, offset) in step with what this renders.
Tempos that scenes keep time with: journey 116 bpm 4/4, bar 1 at 0 s, 34 bars, 2 bars per city (site/js/scenes/journey.js).
"""
import os, sys, json, math, random, subprocess, tempfile, functools, itertools
import numpy as np, warnings
warnings.filterwarnings("ignore", message="Chunk")
try: import mido; from scipy.io import wavfile
except ImportError: mido = wavfile = None   # (composing alone, e.g. tools/check_hb.py, needs neither)

SF = '/usr/share/sounds/sf3/MuseScore_General.sf3'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'assets', 'audio')
SR = 44100
NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
def m(n):
    """'C#5' -> 73 (C4 = 60); ints pass through."""
    if isinstance(n, (int, np.integer)): return int(n)
    name, octv = n[:-1], int(n[-1])
    return 12 * (octv + 1) + NOTE[name]

# GM programs in the soundfont
GM = dict(piano=0, brightpiano=1, epiano=4, celesta=8, glock=9, musicbox=10, vibes=11, marimba=12, nylon=24, steel=25, cleangtr=27,
          abass=32, fbass=33, violin=40, viola=41, cello=42, contrabass=43, tremolo=44, pizz=45, harp=46, timpani=47, strings=48, slowstrings=49,
          synstr=50, choir=52, oohs=53, horn=60, brass=61, oboe=68, clarinet=71, flute=73, recorder=74, whistle=78, warmpad=89, choirpad=91,
          bowedpad=92, halo=94, sweep=95)

# ---------------------------------------------------------------- chords
QUAL = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], 'sus4': [0, 5, 7], 'sus2': [0, 2, 7],
        'add9': [0, 4, 7, 14], 'madd9': [0, 3, 7, 14], '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9], '7sus4': [0, 5, 7, 10], 'dim': [0, 3, 6],
        'm9': [0, 3, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14], 'm7b5': [0, 3, 6, 10], '6/9': [0, 4, 7, 9, 14]}
def parse(sym):
    """'F#m7/E' -> (root pc, intervals, bass pc)"""
    bass = None
    if '/' in sym and not sym.endswith('6/9'): sym, b = sym.rsplit('/', 1); bass = NOTE[b]
    root = sym[:2] if len(sym) > 1 and sym[1] in '#b' else sym[:1]
    q = sym[len(root):]
    return NOTE[root], QUAL[q], (bass if bass is not None else NOTE[root])
def pcs_of(sym): r, iv, b = parse(sym); return {(r + i) % 12 for i in iv} | {b}
def close(sym, lo=52, n=4):
    """Close-position chord tones from `lo` upward."""
    r, iv, _ = parse(sym)
    pcs = sorted({(r + i) % 12 for i in iv})
    out = []; p = lo
    while len(out) < n:
        if p % 12 in pcs: out.append(p)
        p += 1
    return out
@functools.lru_cache(maxsize=None)
def _voice(sym, lo, n, avoid):
    r, iv, _ = parse(sym); pcs = {(r + i) % 12 for i in iv}
    third = {(r + i) % 12 for i in iv if i in (3, 4)}; sev = {(r + i) % 12 for i in iv if i in (10, 11)}; ext = {(r + i) % 12 for i in iv if i > 12 or i in (2, 9)}
    cands = [p for p in range(lo, lo + 25) if p % 12 in pcs and all(abs(p - q) % 12 != 1 for q in avoid)]   # no m2/m9 against the melody
    for must in (third | sev, third):
        best = None
        for c in itertools.combinations(cands, n):
            if any(b - a < 3 for a, b in zip(c, c[1:])): continue
            if any((c[j] - c[i]) % 12 == 1 for i in range(n) for j in range(i + 1, n)): continue   # no minor 2nds / 9ths inside the chord
            got = {p % 12 for p in c}
            if not must <= got: continue
            sc = (len(got), bool(ext & got), -((c[-1] - c[0]) + (c[0] - lo) * .6))
            if best is None or sc > best[0]: best = (sc, c)
        if best: return list(best[1])
    return None
def voicing(sym, lo=52, n=4, avoid=()):
    """Spaced chord tones from about `lo` up: the 3rd and 7th always, an added 9th when it fits; no seconds or minor 9ths
    between voices, and none against the melody notes in `avoid`."""
    v = _voice(sym, lo, n, tuple(sorted(set(avoid))))
    if v is None and avoid: v = _voice(sym, lo, n, ())
    return v or close(sym, lo, n)
def mel(evts, b0, b1):
    """pitches of melody events sounding in [b0, b1)"""
    return [e[2] for e in evts if e[0] < b1 - 1e-6 and e[0] + e[1] > b0 + 1e-6]
def bass_of(sym, lo=36):
    r, iv, b = parse(sym); p = lo + ((b - lo) % 12); return p
def timeline(start, items):
    """[(symbol, beats)] -> [(beat, beats, symbol)] from `start`"""
    out = []; b = start
    for s, d in items: out.append((b, d, s)); b += d
    return out
def chord_at(tl, beat):
    for b, d, s in tl:
        if b - 1e-6 <= beat < b + d - 1e-6: return s
    return tl[-1][2]

# ---------------------------------------------------------------- the song object
class Song:
    def __init__(self, name, bpm, beats=4):
        self.name, self.bpm, self.beats = name, bpm, beats
        self.ev = []; self.chans = {}; self.rng = random.Random(sum(map(ord, name)) * 7 + 17)
        self.tempos = [(0, bpm)]; self.ctl = []; self.meta = {}; self.jit = 1.0
    def tempo(self, beat, bpm): self.tempos.append((beat, bpm)); self.tempos.sort()
    def secs(self, beat):
        """seconds at `beat` through the tempo map"""
        t = 0.0; ts = self.tempos + [(1e9, None)]
        for (b0, bpm), (b1, _) in zip(ts, ts[1:]):
            if beat <= b0: break
            t += (min(beat, b1) - b0) * 60 / bpm
        return t
    def ch(self, name, prog, vol=100, pan=64, rev=40, cho=0, drums=False, mod=0):
        if name in self.chans: return name
        idx = 9 if drums else [c for c in range(16) if c != 9 and c not in [v['ch'] for v in self.chans.values()]][0]
        self.chans[name] = dict(ch=idx, prog=GM.get(prog, prog) if not drums else prog, vol=vol, pan=pan, rev=rev, cho=cho, mod=mod)
        return name
    def note(self, ch, beat, dur, pitch, vel=80, human=True):
        if pitch is None: return
        j = self.rng.uniform(-.012, .012) * self.bpm / 60 * self.jit if human else 0
        v = int(max(1, min(127, vel + (self.rng.randint(-4, 4) if human else 0))))
        b = max(0, beat + j)
        self.ev.append((b, 'n', ch, m(pitch), v, b + max(.05, dur)))
    def cc(self, ch, beat, ctrl, val): self.ev.append((beat, 'cc', ch, ctrl, int(max(0, min(127, val)))))
    def chords(self, tl): self.ctl += tl; return tl
    def ramp(self, ch, b0, b1, v0, v1, ctrl=11, steps=24):
        for k in range(steps + 1): self.cc(ch, b0 + (b1 - b0) * k / steps, ctrl, v0 + (v1 - v0) * k / steps)
    def arch(self, ch, b0, b1, lo=70, hi=104, peak=.6):
        """a phrase's breath on expression (CC11): swell toward `peak` of the way through, then ease off"""
        bp = b0 + (b1 - b0) * peak; self.ramp(ch, b0, bp, lo, hi, steps=16); self.ramp(ch, bp, b1, hi, lo, steps=16)
    def pedal(self, ch, b0, b1): self.cc(ch, b0 + .02, 64, 127); self.cc(ch, b1 - .03, 64, 0)
    def melody(self, ch, start, seq, vel=80, octave=0, legato=1.0):
        b = start
        for it in seq:
            p, d = it[0], it[1]; v = it[2] if len(it) > 2 else vel
            if p is not None: self.note(ch, b, d * legato, m(p) + octave, v)
            b += d
        return b
    def play(self, ch, evts, vel=80, legato=1.0, semis=0, human=True):
        """explicit events [(beat, beats, pitch[, vel])]"""
        for e in evts:
            b, d, p = e[:3]; v = e[3] if len(e) > 3 and e[3] is not None else vel
            if p is not None: self.note(ch, b, d * legato, m(p) + semis, v, human)
    def chord(self, ch, beat, dur, notes, vel=70, roll=0.0):
        for i, p in enumerate(notes): self.note(ch, beat + i * roll, dur - i * roll, p, vel)
    def arp(self, ch, beat, dur, notes, step=.5, vel=70, pattern=None, hold=1.6):
        pat = pattern or list(range(len(notes))); k = 0; b = beat
        while b < beat + dur - 1e-6:
            self.note(ch, b, min(step * hold, beat + dur + .02 - b), notes[pat[k % len(pat)] % len(notes)] + 12 * (pat[k % len(pat)] // len(notes)), vel * (1 if k % len(pat) == 0 else .85)); b += step; k += 1
    # -------- render
    def midi(self, path, total_beats, only=None, b0=0.0, b1=None):
        """Writes the song as MIDI: only the channels in `only` (a stem), and only the notes starting in [b0, b1), moved to
        start at 0 (a region: the controllers and the tempo in effect at b0 come along; pedals are let go by b1 + 4)."""
        b1 = 1e9 if b1 is None else b1
        keep = lambda ch: only is None or ch in only
        mf = mido.MidiFile(ticks_per_beat=480); tr = mido.MidiTrack(); mf.tracks.append(tr)
        tick = lambda b: int(round((b - b0) * 480))
        tem = [(b0, [bpm for b, bpm in self.tempos if b <= b0 + 1e-9][-1])] + [(b, bpm) for b, bpm in self.tempos if b0 + 1e-9 < b < b1]
        msgs = [(tick(b), -1, mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(bpm))) for b, bpm in tem]
        for c in self.chans.values():
            k = c['ch']
            msgs.append((0, 0, mido.Message('program_change', channel=k, program=c['prog'])))
            for ctrl, val in ((7, c['vol']), (10, c['pan']), (91, c['rev']), (93, c['cho']), (11, 127), (1, c['mod'])):
                msgs.append((0, 0, mido.Message('control_change', channel=k, control=ctrl, value=val)))
        order = {'off': 0, 'cc': 1, 'on': 2}
        if b0:   # controller state at the region's start
            state = {}
            for e in sorted((e for e in self.ev if e[1] == 'cc' and e[0] <= b0), key=lambda e: e[0]): state[(e[2], e[3])] = e[4]
            for (ch, ctrl), v in state.items():
                if keep(ch): msgs.append((0, 0, mido.Message('control_change', channel=self.chans[ch]['ch'], control=ctrl, value=v)))
        for e in self.ev:
            b, kind, ch = e[:3]
            if not keep(ch): continue
            k = self.chans[ch]['ch']
            if kind == 'n':
                if not (b0 - 1e-9 <= b < b1 - 1e-9): continue
                msgs.append((tick(b), order['on'], mido.Message('note_on', channel=k, note=e[3], velocity=e[4])))
                msgs.append((tick(e[5]), order['off'], mido.Message('note_off', channel=k, note=e[3], velocity=0)))
            elif b0 < b < b1 or (b1 <= b < b1 + 4 and e[3] == 64 and e[4] == 0):
                msgs.append((tick(b), order['cc'], mido.Message('control_change', channel=k, control=e[3], value=e[4])))
        if b1 < 1e9:
            for c in self.chans.values(): msgs.append((tick(b1 + 4), order['cc'], mido.Message('control_change', channel=c['ch'], control=64, value=0)))
        msgs.sort(key=lambda x: (x[0], x[1]))
        now = 0
        for t, _, msg in msgs: msg.time = t - now; now = t; tr.append(msg)
        end = int((min(total_beats, b1) - b0) * 480) + 480 * 16
        tr.append(mido.MetaMessage('end_of_track', time=max(0, end - now)))
        mf.save(path)
    def perform(self, beats, only=None, b0=0.0, b1=None, tail=6.0):
        """FluidSynth's performance of the song, a stem of it (`only`: its channels) or a region [b0, b1) of it: float
        stereo, the region's length plus `tail` s of ring. Returns (samples, region length in samples)."""
        with tempfile.TemporaryDirectory() as tmp:
            mid, wav = os.path.join(tmp, 's.mid'), os.path.join(tmp, 's.wav')
            self.midi(mid, beats, only, b0, b1)
            subprocess.run(['fluidsynth', '-ni', '-q', '-g', '0.55', '-r', str(SR), '-O', 'float', '-o', 'synth.reverb.room-size=0.78', '-o', 'synth.reverb.damp=0.35',
                            '-o', 'synth.reverb.width=1.0', '-o', 'synth.reverb.level=0.85', '-o', 'synth.chorus.active=1', '-o', 'synth.polyphony=512',
                            '-F', wav, SF, mid], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            _, y = wavfile.read(wav); y = y.astype(np.float64)
        L = int(round((self.secs(beats if b1 is None else b1) - self.secs(b0)) * SR)); n = L + int(tail * SR)
        if y.shape[0] < n: y = np.vstack([y, np.zeros((n - y.shape[0], 2))])
        return y[:n], L

def fold(y, L):
    """a loop: the ring past the loop point is folded back onto its start (so it is there when the loop comes round)"""
    out = y[:L].copy(); t = y[L:]; out[:len(t)] += t; return out
def ring(y, L, fade):
    """a one-shot: keeps its ring, faded out over the last `fade` s"""
    out = y.copy(); n = int(fade * SR); out[-n:] *= np.linspace(1, 0, n)[:, None] ** 2; return out
def loudness(y):
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'm.wav'); wavfile.write(wav, SR, y.astype(np.float32))
        r = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'loudnorm=I=-17:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
    return float(json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])['input_i'])
def encode(name, y, mono=False):
    """MP3: stereo at 112 kbps, a mono stem at 80 kbps (summed to one channel)"""
    if mono: y = y.mean(1, keepdims=True)
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'e.wav'); wavfile.write(wav, SR, np.clip(y, -1, 1).astype(np.float32))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-b:a', '80k' if mono else '112k', os.path.join(OUT, name + '.mp3')], check=True)
    return os.path.getsize(os.path.join(OUT, name + '.mp3'))

# ---------------------------------------------------------------- the dream theme (original)
# 16 bars in D major; (pitch, beats). Phrase A asks, phrase B answers and comes home.
THEME_CH = ['D', 'A/C#', 'Bm', 'G', 'D/F#', 'G', 'Em7', 'A7',
            'D', 'A/C#', 'Bm', 'F#m7/A', 'G', 'A', 'D/F#', 'Em7']
THEME = [('A4', .5), ('D5', .5), ('F#5', 1.5), ('E5', .5), ('D5', 1),
         ('C#5', 1), ('E5', 1), ('A4', 2),
         ('B4', .5), ('C#5', .5), ('D5', 1.5), ('F#5', .5), ('E5', 1),
         ('D5', 1), ('B4', 1), ('D5', 2),
         ('A4', .5), ('D5', .5), ('F#5', 1.5), ('A5', .5), ('G5', 1),
         ('F#5', 1), ('E5', .5), ('D5', .5), ('E5', 2),
         ('G5', .5), ('F#5', .5), ('E5', 1), ('D5', 1), ('B4', 1),
         ('C#5', 1.5), ('D5', .5), ('E5', 2),
         ('A4', .5), ('D5', .5), ('F#5', 1.5), ('E5', .5), ('D5', 1),
         ('C#5', 1), ('E5', 1), ('A5', 2),
         ('B5', 1.5), ('A5', .5), ('F#5', 1), ('D5', 1),
         ('E5', 1), ('F#5', .5), ('E5', .5), ('C#5', 2),
         ('D5', .5), ('E5', .5), ('G5', 1.5), ('F#5', .5), ('E5', 1),
         ('E5', 1), ('F#5', .5), ('G5', .5), ('A5', 2),
         ('F#5', 1), ('E5', .5), ('D5', .5), ('B4', 1), ('D5', 1),
         ('E5', 1.5), ('D5', .5), ('D5', 2)]
def tr(seq, semis): return [(m(p) + semis if p is not None else None, d) + tuple(x[2:]) for x in seq for p, d in [x[:2]]]
def trc(chs, semis):
    names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    out = []
    for c in chs:
        base, _, bass = c.partition('/')
        root = base[:2] if len(base) > 1 and base[1] in '#b' else base[:1]
        q = base[len(root):]; nr = names[(NOTE[root] + semis) % 12]
        out.append(nr + q + ('/' + names[(NOTE[bass] + semis) % 12] if bass else ''))
    return out
def theme(a, b, start=0.0, semis=0, scale=1.0):
    """theme bars a..b (1-based) as explicit events [(beat, beats, midi)], from `start`, durations x `scale`"""
    out = []; t = 0.0
    for p, d in THEME:
        bar = int(t // 4 + 1e-9) + 1
        if a <= bar <= b: out.append((start + (t - (a - 1) * 4) * scale, d * scale, m(p) + semis))
        t += d
    return out
def swing(evts, origin=0.0):
    """12/8: an off-beat eighth lands on the last triplet of the beat (long-short lilt)"""
    def f(t):
        x = t - origin; b = math.floor(x + 1e-9); u = x - b
        return origin + b + (u * 4 / 3 if u <= .5 else 2 / 3 + (u - .5) * 2 / 3)
    return [(f(e[0]), f(e[0] + e[1]) - f(e[0])) + tuple(e[2:]) for e in evts]
D_MAJOR = [2, 4, 6, 7, 9, 11, 1]
E_MINOR = [4, 6, 7, 9, 11, 0, 2]
def modal(evts, frm=D_MAJOR, to=E_MINOR, raise_at=()):
    """degree for degree into another mode (default D major -> E natural minor); the 7th is raised inside the
    (start, end) beat ranges of `raise_at` (a leading tone over the dominant)"""
    out = []
    for e in evts:
        p = e[2]; deg = frm.index(p % 12); base = p - (p - frm[0]) % 12   # the source tonic at or below p
        q = base + (to[0] - frm[0]) + (to[deg] - to[0]) % 12
        if deg == 6 and any(a <= e[0] < b for a, b in raise_at): q += 1
        out.append((e[0], e[1], q) + tuple(e[3:]))
    return out
def counter(tl, start, end, step, lo, hi, first, avoid=(), vel=None):
    """a smooth inner line: on every `step` beats the chord tone nearest the last note, inside [lo, hi], kept a third or
    more away from the melody notes sounding at that moment (avoid = melody events)"""
    out = []; prev = m(first); b = start
    while b < end - 1e-6:
        s = chord_at(tl, b); pcs = pcs_of(s)
        mel = [e[2] for e in avoid if e[0] - 1e-6 <= b < e[0] + e[1] - 1e-6] + [e[2] for e in avoid if b <= e[0] < b + step - 1e-6]
        cands = [p for p in range(m(lo), m(hi) + 1) if p % 12 in pcs and all(abs(p - q) >= 3 and (p - q) % 12 != 0 for q in mel)]
        if not cands: cands = [p for p in range(m(lo), m(hi) + 1) if p % 12 in pcs]
        p = min(cands, key=lambda x: (abs(x - prev), x)); out.append((b, step, p) + ((vel,) if vel else ())); prev = p; b += step
    # tie repeated notes into longer ones
    tied = []
    for e in out:
        if tied and tied[-1][2] == e[2] and abs(tied[-1][0] + tied[-1][1] - e[0]) < 1e-6: tied[-1] = (tied[-1][0], tied[-1][1] + e[1]) + tuple(tied[-1][2:])
        else: tied.append(e)
    return tied

# Happy Birthday (public domain), 3/4, in F with its pickup; beats.
HB = [('C5', .75), ('C5', .25), ('D5', 1), ('C5', 1), ('F5', 1), ('E5', 2), ('C5', .75), ('C5', .25), ('D5', 1), ('C5', 1), ('G5', 1), ('F5', 2),
      ('C5', .75), ('C5', .25), ('C6', 1), ('A5', 1), ('F5', 1), ('E5', 1), ('D5', 1), ('Bb5', .75), ('Bb5', .25), ('A5', 1), ('F5', 1), ('G5', 1), ('F5', 3)]
HB_TL = [(1, 3, 'F'), (4, 3, 'C7'), (7, 3, 'C7'), (10, 3, 'F'), (13, 3, 'F'), (16, 3, 'Bb'), (19, 2, 'F/C'), (21, 1, 'C7'), (22, 3, 'F')]  # after the 1-beat pickup

def comp(S, ch, start, chords, beats_per, pattern='pad', vel=62, lo=52, n=4):
    """Accompaniment of a chord list. patterns: pad (held), arp (rolling 8ths), ballad (piano: root + rolling hand)."""
    for i, c in enumerate(chords):
        b = start + i * beats_per; v = voicing(c, lo, n)
        if pattern == 'pad': S.chord(ch, b, beats_per * 1.02, v, vel)
        elif pattern == 'arp': S.arp(ch, b, beats_per, v + [v[0] + 12], step=.5, vel=vel, pattern=[0, 1, 2, 3, 4, 3, 2, 1])
        elif pattern == 'ballad':
            S.note(ch, b, beats_per, bass_of(c, 38), vel + 6)
            S.note(ch, b, beats_per, bass_of(c, 38) + 12, vel - 10)
            S.arp(ch, b + .5, beats_per - .5, v, step=.5, vel=vel - 8, pattern=[0, 1, 2, 3, 2, 1, 2])
            S.pedal(ch, b, b + beats_per)
def pads(S, ch, tl, vel, lo=52, n=3, b0=-1e9, b1=1e9, mel_=()):
    for b, d, s in tl:
        if b0 <= b < b1: S.chord(ch, b, d * 1.02, voicing(s, lo, n, mel(mel_, b, b + d)), vel)
def roots(S, ch, tl, vel, lo=36, b0=-1e9, b1=1e9, octave=False):
    for b, d, s in tl:
        if b0 <= b < b1:
            S.note(ch, b, d * .98, bass_of(s, lo), vel)
            if octave: S.note(ch, b, d * .98, bass_of(s, lo) + 12, vel - 12)
def roll(S, ch, b0, b1, pitch, v0, v1, rate=6):
    """a timpani roll, crescendo v0 -> v1"""
    n = int((b1 - b0) * rate)
    for k in range(n): S.note(ch, b0 + k / rate, 1.2 / rate, pitch, v0 + (v1 - v0) * k / max(1, n - 1), human=False)
def gliss(S, ch, end, notes, span=1.0, vel=46, dur=2.4):
    """a harp glissando arriving on `end`"""
    for i, p in enumerate(notes): S.note(ch, end - span + span * i / len(notes), dur, p, vel + i, human=False)
def swell(S, beat, vel=70):
    """A reverse cymbal rising into `beat` (GM 119; its sample peaks 1.32 s after the note starts)."""
    S.ch('revcym', 119, vol=72, pan=64, rev=70)
    lead = 1.32 * S.bpm / 60
    S.note('revcym', beat - lead, lead + .05, 'C4', vel, human=False)
def sparkle(S, ch, beat, notes, vel=60, step=.25):
    for i, p in enumerate(notes): S.note(ch, beat + i * step, 1.5, p, vel - i * 2)
PENTA = lambda lo, hi, pcs=(2, 4, 7, 9, 11): [p for p in range(m(lo), m(hi) + 1) if p % 12 in pcs]   # G/D pentatonic: in every key here

# ================================================================ v19: the motifs (all original, except Happy Birthday)
# The score builds toward one moment. Each chapter has its own tune and its own colour, and Happy Birthday is kept back
# for the last chapter (tools/check_hb.py proves it): she lights its first line herself, candle by candle; it is sung for
# the first time once all six burn; after the wish it returns in full, the whole orchestra, the earlier tunes woven round.
def L(s, semis=0):
    """'F#5:1.5 A5:.5 r:1 | D6:2' -> [(midi or None, beats)] ('|' marks bars, for the eye)"""
    out = []
    for tok in s.replace('|', ' ').split():
        p, d = tok.split(':'); out.append((None if p == 'r' else m(p) + semis, float(d)))
    return out
def at(start, seq, semis=0, scale=1.0):
    """[(pitch, beats)] -> events [(beat, beats, midi)] from `start` (rests skipped)"""
    out = []; b = start
    for p, d in seq:
        if p is not None: out.append((b, d * scale, m(p) + semis))
        b += d * scale
    return out
def diat(evts, steps, scale=D_MAJOR):
    """each note moved `steps` degrees along the scale (a third above: 2, a sixth below: -5)"""
    P = [p for p in range(128) if p % 12 in scale]
    return [(e[0], e[1], P[min(range(len(P)), key=lambda i: abs(P[i] - e[2])) + steps]) + tuple(e[3:]) for e in evts]
G_MAJOR = [7, 9, 11, 0, 2, 4, 6]

# the prologue's night motif (B minor, low flute): it asks, rising, and never quite lands
NIGHT = L('B4:2 C#5:1 D5:1 | F#5:3 E5:1 | G5:2 E5:1 F#5:1 | E5:4')
NIGHT_HOME = L('B4:2 C#5:1 D5:1 | F#5:3 E5:1 | G5:2 E5:1 F#5:1 | C#5:2 A#4:2')
# the moonlit tune (D, solo violin), when the letter has landed: wonder, wide leaps that float down
MOON = L('F#5:1.5 A5:.5 D6:2 | C#6:1 B5:1 A5:1 F#5:1 | G5:1.5 B5:.5 E6:2 | D6:1 C#6:1 A5:2 | B5:1.5 G5:.5 E5:1 G5:1 | F#5:1 E5:1 C#5:2 '
         '| D5:1 F#5:1 B5:1 A5:1 | G5:1 F#5:1 E5:2')
# the letter motif (D): a rising sixth, then a quill's stepwise fall; her letter in the prologue and in the memories, a
# memory gathering in the last chapter, a descant on the postcard
LETTER = L('A4:1 F#5:1.5 E5:.5 D5:1 | E5:1 C#5:.5 B4:.5 A4:2 | B4:1 G5:1.5 F#5:.5 E5:1 | F#5:1 E5:.5 D5:.5 E5:2')
LETTER_ANSWER = L('A4:1 A5:1.5 G5:.5 F#5:1 | G5:1 E5:.5 D5:.5 E5:2 | G5:1 F#5:1 E5:1 D5:1 | E5:2 C#5:2')
# the journey (D, in the ballad's half time: one unit = two of the sand's beats): her road, and the road home together
ROAD = L('F#5:1.5 E5:.5 D5:1 A4:1 | B4:1 C#5:1 E5:2 | D5:1.5 C#5:.5 B4:1 F#4:1 | G4:1 A4:1 B4:2 | D5:1 F#5:1 A5:1 G5:1 | E5:2 D5:1 C#5:1')
ROAD_HOME = L('D5:1 F#5:1 B5:1.5 A5:.5 | F#5:1.5 E5:.5 C#5:2 | D5:1 E5:1 G5:1.5 F#5:.5 | E5:1.5 F#5:.5 A5:2 | F#5:1.5 E5:.5 D5:1 B4:1 '
              '| A4:1 C#5:1 D5:2')
# the memories' nocturne (E minor, piano)
MEMORY = L('B4:1 E5:1 G5:1.5 F#5:.5 | A5:1.5 F#5:.5 D5:1 B4:1 | C5:1 E5:1 G5:1.5 B5:.5 | A5:2 E5:1 C5:1 | B4:1 E5:1 G5:1.5 A5:.5 '
           '| B5:1.5 G5:.5 A5:2 | C6:1 B5:.5 A5:.5 E5:1 G5:1 | F#5:2 D#5:2')
# the film: the horses' horn call (D Mixolydian, open fifths), the tender close-up (flute), the savanna (G Lydian, broad),
# the stars (celesta; the last note is the one that falls)
HORN_CALL = L('D4:.5 A4:.5 D5:2 C5:.5 A4:.5 | G4:1.5 E4:.5 G4:1 C5:1 | B4:1.5 A4:.5 G4:1 E4:1 | D4:1 G4:1 B4:1 D5:1')
CLOSE_UP = L('B4:1 D5:1 F#5:1.5 E5:.5 | D5:1.5 E5:.5 F#5:1 A5:1 | G5:2 E5:2')
SAVANNA = L('D4:2 G4:1 A4:1 | B4:2 C#5:1 E5:1 | D5:3 A4:1 | F#4:2 A4:1 D5:1 | E5:2 D5:1 B4:1 | C5:2 G4:2')
STARS = L('B5:.5 D6:.5 F#6:2 E6:1 | D6:.5 E6:.5 G6:2 F#6:1 | D6:2 B5:1 A5:1 | G5:1 C6:1 A5:1 D6:1 | B5:3 A5:.5 B5:.5 | G5:4')
# the story theme (THEME, the book's) as a waltz, for the finale (D; a pickup into bars 1, 5, 9 and back to 1)
WALTZ_PICK = L('A4:.5 D5:.5')
WALTZ = [L(s) for s in ('F#5:2 E5:.5 D5:.5', 'C#5:1 E5:1 A4:1', 'B4:.5 C#5:.5 D5:1 F#5:.5 E5:.5', 'D5:1 B4:1 A4:.5 D5:.5',
                        'F#5:1.5 A5:.5 G5:1', 'F#5:1 E5:.5 D5:.5 E5:1', 'G5:.5 F#5:.5 E5:1 D5:.5 B4:.5', 'C#5:1 E5:1 A4:.5 D5:.5',
                        'F#5:1.5 E5:.5 D5:1', 'C#5:1 E5:1 A5:1', 'B5:1.5 A5:.5 F#5:.5 D5:.5', 'E5:1 F#5:.5 E5:.5 C#5:1',
                        'D5:.5 E5:.5 G5:1.5 F#5:.5', 'E5:1 F#5:.5 G5:.5 A5:1', 'F#5:1 E5:.5 D5:.5 B4:.5 C#5:.5', 'D5:2 A4:.5 D5:.5')]
WALTZ_CH = [[('D', 3)], [('A/C#', 3)], [('Bm', 3)], [('G', 3)], [('D/F#', 2), ('G', 1)], [('Bm7', 3)], [('Em7', 3)], [('A7', 3)],
            [('D', 3)], [('A/C#', 3)], [('Bm', 3)], [('F#m7/A', 3)], [('G', 3)], [('A', 3)], [('D/F#', 2), ('A7', 1)], [('D', 3)]]
def waltz(a, b, start, semis=0):
    """the story theme as a waltz, bars a..b (1-based) from `start` (bar a's downbeat): (melody events, chord timeline)"""
    ev, items = [], []
    for k in range(a, b + 1): ev += at(start + (k - a) * 3, WALTZ[k - 1], semis); items += WALTZ_CH[k - 1]
    return ev, timeline(start, [(trc([c], semis)[0], d) for c, d in items])
HBG = tr(HB, 2)   # Happy Birthday in G, its pickup first (25 beats)

def harpwaltz(S, ch, tl, vel, lo=55, b0=-1e9, b1=1e9, mel_=(), bass_lo=43):
    """3/4 for a harp or a piano: the bass on the downbeat, the chord rolling up and back in eighths"""
    for b, d, s in tl:
        if b0 <= b < b1:
            v = voicing(s, lo, 3, mel(mel_, b, b + d))
            S.arp(ch, b, d, [bass_of(s, bass_lo)] + v, step=.5, vel=vel, pattern=[0, 1, 2, 3, 2, 1], hold=1.8)

# ================================================================ the pieces
def prologue():
    """Moonlit mystery, then wonder (76 bpm, 24 bars). The night in B minor: tremolo strings, harp harmonics, celesta
    glints, the night motif low on a flute. The letter lands (bar 5, 'bloom'): the night opens into D and a solo violin
    sings the moonlit tune. The letter writes itself (bar 13, 'letter'): its own motif on celesta and harp over a quill
    of soft harp sixteenths, then the violin answers with the flute a third above; A7 turns back to the night, and F#7
    brings it round to B minor."""
    S = Song('prologue', 76)
    S.ch('fl', 'flute', 86, 52, 74, mod=14); S.ch('vln', 'violin', 96, 74, 70, mod=30); S.ch('harp', 'harp', 86, 86, 70)
    S.ch('cel', 'celesta', 80, 42, 78); S.ch('trem', 'tremolo', 74, 60, 84); S.ch('str', 'slowstrings', 82, 66, 80); S.ch('cello', 'cello', 86, 46, 66, mod=12)
    S.ch('choir', 'oohs', 58, 64, 96); S.ch('timp', 'timpani', 84, 60, 64); S.ch('celm', 'celesta', 92, 54, 76); S.ch('harpm', 'harp', 86, 76, 72)
    def dark(o, tl, line, crest):
        S.play('fl', line, 60); S.arch('fl', o, o + 8, 64, 98); S.arch('fl', o + 8, o + 16, 64, 94)
        for b, d, s in tl:
            v = voicing(s, 50, 4, mel(line, b, b + d)); S.chord('trem', b, d * 1.02, v, 46); S.chord('choir', b, d * 1.02, v[1:], 34)
            hi = [x + 24 for x in v if all(abs(x + 24 - q) % 12 != 1 for q in mel(line, b, b + d))] or [v[-1] + 24]
            if d == 4: S.note('harp', b, 3, hi[-1], 34); S.note('harp', b + 2.5, 1.5, hi[len(hi) // 2], 28)
            if (b - o) % 8 == 0: sparkle(S, 'cel', b + 1, [x + 12 for x in hi[::-1]][:3], 28, step=.5)
        S.ramp('trem', o, o + 16, 44, crest)
    # 1-4: the night over the castle
    dark(0, S.chords(timeline(0, [('Bmadd9', 4), ('Gmaj7', 4), ('Em9', 4), ('A7sus4', 4)])), at(0, NIGHT), 88)
    for p, b, d in (('B2', 0, 8), ('E3', 8, 4), ('A2', 12, 4)): S.note('cello', b, d * .98, p, 52)
    S.note('timp', 0, 2, 'B2', 44, human=False); roll(S, 'timp', 13, 16, 'A2', 22, 64)
    swell(S, 16, 54); gliss(S, 'harp', 16, PENTA('A3', 'A5', (9, 11, 2, 4)), 1.0, 40)
    # 5-12 (bloom): the letter has landed; the night opens into D and a solo violin sings the moonlit tune
    o = 16; tl = S.chords(timeline(o, [('D', 4), ('Bm7', 4), ('Gmaj7', 4), ('D/F#', 4), ('Em7', 4), ('A/C#', 4), ('Bm7', 2), ('Gmaj7', 2), ('A7sus4', 2), ('A7', 2)]))
    V = at(o, MOON); S.play('vln', V, 74)
    for a in range(4): S.arch('vln', o + a * 8, o + a * 8 + 8, 76, 110 if a in (1, 2) else 100)
    for b, d, s in tl: v = voicing(s, 50, 4, mel(V, b, b + d)); S.arp('harp', b, d, v + [v[0] + 12], step=.5, vel=40, pattern=[0, 1, 2, 3, 4, 3, 2, 1])
    pads(S, 'str', tl, 44, lo=57, n=3, mel_=V); S.ramp('str', o, o + 32, 64, 100)
    S.note('timp', o, 2.5, 'D3', 54, human=False)
    for p, b, d in (('D2', 0, 8), ('G2', 8, 4), ('F#2', 12, 4)): S.note('cello', o + b, d * .98, p, 50)
    S.play('cello', counter(tl, o + 16, o + 32, 2, 'D3', 'B3', 'F#3', avoid=V), 54)
    pads(S, 'choir', tl, 28, lo=60, n=3, b0=o + 16, mel_=V)
    for b, d, s in tl[::2]: S.note('cel', b + 1, 2, voicing(s, 79, 3, mel(V, b, b + d))[-1], 30)
    # 13-20 (letter): the letter writes itself: its motif on celesta and harp, a quill of harp sixteenths beneath; then
    # the violin answers it, the flute a third above; A7 turns to the night
    o = 48; tl = S.chords(timeline(o, [('D', 4), ('Bm7', 4), ('Gmaj7', 4), ('A7sus4', 2), ('A7', 2), ('D/F#', 4), ('G', 4), ('Em7', 4), ('A7sus4', 2), ('A7', 2)]))
    M1 = at(o, LETTER); S.play('celm', M1, 64); S.play('harpm', M1, 44, semis=-12)
    M2 = at(o + 16, LETTER_ANSWER); S.play('vln', M2, 70); S.play('fl', diat(M2, 2), 44)
    for a in range(2): S.arch('vln', o + 16 + a * 8, o + 24 + a * 8, 78, 106); S.arch('fl', o + 16 + a * 8, o + 24 + a * 8, 70, 96)
    for b, d, s in tl:
        v = voicing(s, 55, 4, mel(M1 + M2, b, b + d)); S.arp('harp', b, d, v + [v[0] + 12, v[1] + 12], step=.25, vel=28, pattern=[0, 1, 2, 3, 4, 5, 4, 3, 2, 1], hold=1.3)
    pads(S, 'str', tl, 40, lo=54, n=3, mel_=M1 + [(b, d, p - 12) for b, d, p in M1] + M2); S.ramp('str', o, o + 16, 90, 74); S.ramp('str', o + 16, o + 32, 74, 96)
    roots(S, 'cello', tl, 46, lo=38)
    pads(S, 'choir', tl, 24, lo=60, n=3, b0=o + 16, mel_=M2)
    # 21-24: the night again; F#7 leads home to B minor (the loop)
    o = 80
    dark(o, S.chords(timeline(o, [('Bmadd9', 4), ('Gmaj7', 4), ('Em9', 4), ('F#7sus4', 2), ('F#7', 2)])), at(o, NIGHT_HOME), 70)
    for p, b, d in (('B2', 0, 4), ('G2', 4, 4), ('E3', 8, 4), ('F#2', 12, 4)): S.note('cello', o + b, d * .98, p, 50)
    # the melody (flute, violin, celesta, the letter's celesta and harp) is a layer: it comes in with the owl; the letter's
    # motif can be called up as it starts to write itself
    S.meta = dict(stems=dict(lead=['fl', 'vln', 'cel', 'celm', 'harpm']), key=2, scale=D_MAJOR, phrase=(8, 0), sections=dict(bloom=(16, 0), letter=(48, 0)))
    return S, 96

def book():
    """The study and the magic book: a fireside lullaby in A, 12/8 (63 bpm). Nylon guitar rocking in triplets and a felt
    piano; the theme lilting on clarinet, then sung by the cello with the clarinet beside it; a music box remembers the
    opening before it comes round. 20 bars."""
    S = Song('book', 63)
    S.ch('cl', 'clarinet', 90, 56, 66, mod=8); S.ch('gtr', 'nylon', 92, 42, 56); S.ch('pno', 'piano', 74, 70, 64); S.ch('cello', 'cello', 86, 50, 64, mod=16)
    S.ch('str', 'slowstrings', 64, 64, 84); S.ch('box', 'musicbox', 66, 80, 74); S.ch('cel', 'celesta', 52, 86, 78); S.ch('cellom', 'cello', 86, 50, 64, mod=16)
    K = -5; ch = trc(THEME_CH, K)
    tl = S.chords(timeline(0, [('A', 4), ('Dmaj7/A', 4)] + [(c, 4) for c in ch] + [('Dmaj9', 4), ('E', 2), ('E7', 2)]))
    def rock(b, d, s, vel):
        v = voicing(s, 57, 3); bs = bass_of(s, 40)
        for k in range(int(round(d))):
            fifth = min((q for q in range(bs + 5, bs + 10) if q % 12 in pcs_of(s)), key=lambda q: abs(q - bs - 7))
            three = [bs if k == 0 else (fifth if k == 2 else v[2]), v[0], v[1]] if k % 2 == 0 else [v[2], v[1], v[0]]
            for j, p in enumerate(three): S.note('gtr', b + k + j / 3, .75, p, vel * (1 if j == 0 else .8))
    for b, d, s in tl:
        rock(b, d, s, 46 if b < 8 or b >= 72 else 42)
        S.chord('pno', b, d, [bass_of(s, 38)] + voicing(s, 57, 3), 34 if b < 40 else 38, roll=.09); S.pedal('pno', b, b + d)
        if 40 <= b < 72 and d == 4: S.chord('pno', b + 2, 2, voicing(s, 64, 3), 28, roll=.06)
    # 1-2: the hearth; the music box hints at the opening
    S.play('box', swing(theme(1, 1, 4, K + 12), 4), 40); S.note('cello', 0, 7.9, 'A2', 38)
    # 3-10: the theme in A, lilting, on clarinet
    A = swing(theme(1, 8, 8, K), 8); S.play('cl', A, 66)
    for a in range(4): S.arch('cl', 8 + a * 8, 16 + a * 8, 72, 104)
    roots(S, 'cello', tl, 44, lo=38, b0=8, b1=40)
    pads(S, 'str', tl, 32, lo=56, n=3); S.ramp('str', 0, 8, 56, 50); S.ramp('str', 8, 40, 50, 76); S.ramp('str', 40, 60, 76, 100); S.ramp('str', 60, 80, 100, 56)
    # 11-18: the cello sings the second half; the clarinet keeps it company with a slow inner line
    B = swing(theme(9, 16, 40, K - 12), 40); S.play('cellom', B, 66)
    for a in range(4): S.arch('cellom', 40 + a * 8, 48 + a * 8, 76, 110)
    S.play('cl', counter(tl, 40, 72, 2, 'E4', 'B4', 'A4', avoid=B), 44)
    for b in (40, 48, 56, 64): S.note('cel', b, 2, voicing(chord_at(tl, b), 81, 3)[-1], 28)
    # 19-20: home again; the music box remembers the opening, and E7 turns back to A
    S.play('box', swing(theme(1, 2, 72, K + 12), 72), 38)
    S.note('cello', 72, 3.9, 'D3', 40); S.note('cello', 76, 3.9, 'E3', 42)
    # v18: the hearth (bars 1-2) holds until she opens the cover; the melody (clarinet, the singing cello, music box) is a layer
    S.meta = dict(stems=dict(lead=['cl', 'cellom', 'box', 'cel']), key=9, scale=[9, 11, 1, 2, 4, 6, 8], phrase=(8, 0), sections=dict(hearth=(0, 0, 8), theme=(8, 0), cello=(40, 0)))
    return S, 80

JOURNEY_BPM = 116
def journey():
    """Two roads of sand: a travelling ballad in D on the 116 bpm grid the sand keeps (one city per 2 bars; bar 1 at 0 s),
    felt in half time. Her road, a flute, sings the journey's own tune; his road, a cello, walks below and climbs toward
    it; on bar 15 (29.0 s, the routes meet in Tokyo) they play the story theme's opening together in octaves (the book's
    tune: their story) while the strings lift and a harp sweeps in; then the road home, the cello in harmony beneath; the
    piano alone, and the two still talking, to close. No drums: the piano's eighths keep the time. 34 bars, 70.344828 s."""
    S = Song('journey', JOURNEY_BPM)
    S.ch('pno', 'piano', 92, 62, 58); S.ch('fl', 'flute', 92, 78, 70, mod=14); S.ch('cello', 'cello', 94, 46, 64, mod=18)
    S.ch('str', 'slowstrings', 74, 64, 84); S.ch('harp', 'harp', 80, 88, 72); S.ch('cel', 'celesta', 56, 92, 80)
    tl = S.chords(timeline(0, [('D', 8)] + [(c, 8) for c in THEME_CH[:4]] + [('D/F#', 6), ('G', 2)] + [('Em7', 4), ('A7sus4', 2), ('A7', 2)] + [(c, 8) for c in THEME_CH[8:15]]
                  + [('A7sus4', 4), ('D', 4)] + [('Gmaj7', 4), ('D/F#', 4), ('Em7', 4), ('A7sus4', 4)]))
    assert sum(d for _, d, _ in tl) == 136
    her = at(8, ROAD, scale=2.0); meet = theme(9, 10, 56, 0, 2.0); home = at(72, ROAD_HOME, scale=2.0)
    FL = her + meet + home   # her line (for the accompaniment to keep clear of)
    # the piano: a bass note on each downbeat and a rolling eighth-note hand (the clock of the piece); bar 1 exactly at 0
    for bar in range(34):
        bb = bar * 4; lvl = 48 if bb < 8 else 45 if 56 <= bb < 80 else 41 if bb < 120 else 45
        segs = [(0, 4)] if chord_at(tl, bb) == chord_at(tl, bb + 2) else [(0, 2), (2, 2)]
        for h, seg in segs:
            s2 = chord_at(tl, bb + h); v = voicing(s2, 55, 4, mel(FL, bb + h, bb + h + seg))
            S.note('pno', bb + h, seg, bass_of(s2, 36), lvl + 8, human=bb + h > 0)
            S.arp('pno', bb + h + .5, seg - .5, v, step=.5, vel=lvl, pattern=[0, 1, 2, 3, 2, 1, 2], hold=2.0)
        S.pedal('pno', bb, bb + 4)
    S.note('cello', 4, 4, 'D3', 38)
    # 3-14: her road (flute) and his (cello: below, climbing toward her)
    S.play('fl', her, 64, legato=1.02)
    his = [('D3', 3), ('A2', 1), ('D3', 2), ('F#3', 1), ('E3', 1), ('E3', 4), ('A2', 2), ('C#3', 1), ('E3', 1), ('D3', 2), ('F#3', 2), ('B3', 2), ('F#3', 2),
           ('G3', 4), ('B3', 1), ('A3', 1), ('G3', 1), ('A3', 1), ('F#3', 2), ('A3', 2), ('D4', 2), ('B3', 2), ('D4', 2), ('B3', 1), ('G3', 1), ('A3', 2), ('C#4', 1), ('E4', 1)]
    S.melody('cello', 8, his, 54, legato=1.02)
    for a in range(6): S.arch('fl', 8 + a * 8, 16 + a * 8, 74, 100 + a * 2)
    S.ramp('cello', 8, 56, 70, 104)
    pads(S, 'str', tl, 40, lo=55, n=3, mel_=FL); S.ramp('str', 0, 8, 40, 40); S.ramp('str', 8, 40, 40, 58); S.ramp('str', 40, 56, 58, 92); S.ramp('str', 56, 76, 92, 98)
    S.ramp('str', 76, 100, 98, 70); S.ramp('str', 100, 136, 70, 40)
    # 15-18: Tokyo: together, in octaves, on the story theme's opening; a harp sweeps in, the celesta catches the light
    gliss(S, 'harp', 56, PENTA('A3', 'A5', (9, 11, 4, 6)), 1.2, 38, dur=1.6)
    S.play('fl', meet, 68, legato=1.02); S.play('cello', meet, 62, semis=-12, legato=1.02)
    S.arch('fl', 56, 72, 90, 106); S.ramp('cello', 56, 72, 100, 106)
    sparkle(S, 'cel', 56, [m('D6'), m('F#6'), m('A6'), m('D7')], 44, step=.3)
    for b, d, s in tl:
        if 56 <= b < 88: S.arp('harp', b, d, voicing(s, 62, 3) + [voicing(s, 62, 3)[0] + 12], step=1, vel=36, pattern=[0, 1, 2, 3, 2, 1, 2, 3], hold=1.05)
        if 64 <= b < 96 and (b - 64) % 8 == 0: S.note('cel', b, 1.6, voicing(s, 77, 3, mel(FL, b, b + 2))[-1], 34)
    # 19-30: the road home: the flute sings on, the cello in harmony beneath
    S.play('fl', home, 66, legato=1.02)
    for a in range(6): S.arch('fl', 72 + a * 8, 80 + a * 8, 96 - a * 3, 108 - a * 3)
    S.play('cello', counter(tl, 72, 120, 2, 'D3', 'B3', 'A3', avoid=home), 54); S.ramp('cello', 72, 120, 100, 76)
    # 31-34: the piano alone, the two voices still talking (his echo, her question), back to the start
    S.melody('cello', 120, [('A3', 2), ('D4', 2), ('F#4', 4)], 48); S.melody('fl', 128, [('E5', 2), ('D5', 2), ('E5', 4)], 50)
    S.cc('cello', 119.9, 11, 84); S.cc('fl', 127.9, 11, 80)
    # the two voices (her flute, his cello) are a layer over the piano's clock; the grid is unchanged (the sand keeps it)
    S.meta = dict(stems=dict(lead=['fl', 'cello']), key=2, scale=D_MAJOR, phrase=(8, 0))
    return S, 136

def memories():
    """Photographs and her letter: a nocturne (66 bpm, 22 bars). A piano alone remembers in E minor, its own tune, the
    cello joining; when her letter opens ('bloom') it turns to G and the letter motif from the prologue comes back on a
    solo violin, the cello beneath, a vibraphone like light on old photographs; the piano alone again, B7 leads back."""
    S = Song('memories', 66)
    S.ch('pno', 'piano', 100, 64, 62); S.ch('vln', 'violin', 88, 76, 72, mod=28); S.ch('cello', 'cello', 84, 46, 66, mod=16)
    S.ch('str', 'slowstrings', 70, 60, 84); S.ch('vib', 'vibes', 60, 88, 80); S.ch('harp', 'harp', 70, 84, 72); S.ch('pnom', 'piano', 100, 64, 62)
    em = ['Em', 'Bm/D', 'Cmaj7', 'Am7', 'Em/G', 'Cmaj7', 'Am7', 'B7']
    tl = S.chords(timeline(0, [('Emadd9', 4), ('Cmaj7', 4)] + [(c, 4) for c in em]
                  + [('G', 4), ('Em7', 4), ('Cmaj7', 4), ('D7sus4', 2), ('D7', 2), ('G/B', 4), ('C', 4), ('Am7', 4), ('D7sus4', 2), ('D7', 2)]
                  + [('Em', 4), ('Bm/D', 4), ('Cmaj7', 4), ('B7sus4', 2), ('B7', 2)]))
    assert sum(d for _, d, _ in tl) == 88
    def lh(b, d, s, vel):
        v = [bass_of(s, 40)] + voicing(s, 52, 3)
        S.arp('pno', b, d, v, step=.5, vel=vel, pattern=[0, 1, 2, 3, 2, 1, 2, 1], hold=2.4); S.pedal('pno', b, b + d); S.pedal('pnom', b, b + d)
    for b, d, s in tl: lh(b, d, s, 34 if 40 <= b < 72 else 42 if b < 8 else 38)
    S.note('vib', 0, 3, 'B5', 30); S.note('vib', 4, 3, 'G5', 28); S.note('cello', 0, 7.9, 'E3', 36)
    A = at(8, MEMORY); B = at(40, LETTER, 5) + at(56, LETTER_ANSWER, 5); C = at(72, MEMORY[:8]) + at(80, L('C5:1 E5:1 G5:2 | F#5:2 D#5:2'))
    # 3-10: the nocturne, remembered on the piano
    S.play('pnom', A, 62)
    S.play('cello', counter(tl, 24, 40, 2, 'B2', 'G3', 'E3', avoid=A), 46); S.ramp('cello', 24, 40, 70, 96)
    pads(S, 'str', tl, 28, lo=55, n=3, mel_=A + B + C, b1=72); pads(S, 'str', tl, 28, lo=58, n=3, mel_=A + B + C, b0=72); S.ramp('str', 0, 16, 60, 40); S.ramp('str', 16, 40, 40, 70); S.ramp('str', 40, 64, 70, 100); S.ramp('str', 64, 88, 100, 60)
    # 11-18 (bloom): her letter: it turns to G, the letter motif on the violin, the cello answering beneath
    S.play('vln', B, 70)
    for a in range(4): S.arch('vln', 40 + a * 8, 48 + a * 8, 78, 112)
    S.play('cello', counter(tl, 40, 72, 2, 'D3', 'B3', 'G3', avoid=B), 52)
    for b, d, s in tl:
        if 40 <= b < 72 and d == 4: S.note('vib', b, 2.5, voicing(s, 76, 3, mel(B, b, b + d))[-1], 32); S.note('vib', b + 2, 2, voicing(s, 72, 3, mel(B, b, b + d))[1], 24)
    gliss(S, 'harp', 40, [m(x) for x in ['B3', 'F#4', 'A4', 'B4', 'F#5', 'A5', 'B5']], .8, 30, dur=.9)
    # 19-22: the piano alone again, the nocturne's opening; B7 back to the start
    S.play('pnom', C, 54)
    # the piano's melody and the violin are a layer (they thin out while she reads); the bloom into G can be called up
    S.meta = dict(stems=dict(lead=['pnom', 'vln']), key=7, scale=G_MAJOR, phrase=(8, 0), sections=dict(bloom=(40, 0)))
    return S, 88

def film():
    """Wild horses (96 bpm, 24 bars, a seamless loop): strings galloping in triplets, timpani, the horses' own horn call
    in D Mixolydian (open fifths, the flat seventh of free country); the close-up, tender, a flute; the savanna at sunset
    and into night, broad: its tune in long notes on horn with strings and voices (G Lydian); the stars on celesta, a tune
    of their own whose last note is the star that falls; the gallop gathers again."""
    S = Song('film', 96)
    S.ch('str', 'strings', 92, 64, 66); S.ch('gal', 'cello', 96, 46, 54); S.ch('hi', 'slowstrings', 84, 70, 80); S.ch('horn', 'horn', 92, 74, 72, mod=6)
    S.ch('timp', 'timpani', 90, 60, 58); S.ch('fl', 'flute', 86, 54, 72, mod=16); S.ch('choir', 'oohs', 66, 64, 92); S.ch('cel', 'celesta', 74, 40, 80)
    S.ch('harp', 'harp', 80, 86, 72); S.ch('bass', 'contrabass', 80, 60, 56)
    S.ch('him', 'slowstrings', 84, 70, 80); S.ch('strm', 'strings', 92, 64, 66); S.ch('bassg', 'contrabass', 80, 60, 56)   # (stems: melody, gallop)
    QUAL['5'] = [0, 7]
    tl = S.chords(timeline(0, [('D5', 8), ('D', 4), ('C', 4), ('Em7', 4), ('G', 4), ('D', 4)]   # 1-7 the run
                  + [('Gmaj7', 4), ('D/F#', 4), ('Em7', 2), ('A7sus4', 2)]            # 8-10 the close-up
                  + [('Gmaj7', 4), ('A/G', 4), ('D/F#', 4), ('D', 4), ('Em7', 4), ('Cmaj7', 4)]   # 11-16 the savanna
                  + [('Gmaj7', 4), ('Em7', 4), ('G', 4), ('C', 2), ('D', 2), ('Gadd9', 4), ('Cmaj7/G', 4)]   # 17-22 the stars
                  + [('Dsus4', 4), ('D5', 4)]))                                        # 23-24 the gallop gathers
    assert sum(d for _, d, _ in tl) == 96
    def gallop(b0, b1, root, v0, v1):
        n = int(round((b1 - b0)))
        for k in range(n):
            v = v0 + (v1 - v0) * k / max(1, n - 1); r = bass_of(chord_at(tl, b0 + k), 43) if root is None else m(root)
            for j, (dv, oc) in enumerate(((1, 0), (.7, 0), (.82, 12))): S.note('gal', b0 + k + j / 3, .3, r + oc, v * dv)
            S.note('bassg', b0 + k, .45, r - 12, v * .8)
    # 1-7: the run: the horn call
    gallop(0, 28, None, 52, 66); S.ramp('gal', 0, 8, 80, 104)
    for b, d, s in tl:
        if b < 28:
            S.chord('str', b, d * 1.02, ([m('D4'), m('A4'), m('D5')] if s == 'D5' else voicing(s, 50, 4)), 48 + min(b, 24) * .7)
            S.note('timp', b, 1, 'D3' if parse(s)[0] in (2, 7) else 'A2', 64, human=False); S.note('timp', b + 2, 1, 'A2', 48, human=False)
    S.ramp('str', 0, 24, 70, 100)
    H = swing(at(8, HORN_CALL), 8); S.play('horn', H, 72); S.play('horn', H, 50, semis=-12)
    for a in range(2): S.arch('horn', 8 + a * 8, 16 + a * 8, 86, 118)
    S.play('him', swing(at(8, HORN_CALL, 12), 8), 40); S.ramp('him', 8, 24, 60, 90)
    soar = swing(at(24, L('F#5:1 A5:1 D6:2')), 24); S.cc('strm', 0, 11, 100); S.play('strm', soar, 68); S.play('him', soar, 46, semis=-12)
    S.chord('horn', 24, 4, [m('D3'), m('A3'), m('D4')], 64)
    # 8-10: the horses' close-up: the gallop stops; a flute, tender
    S.play('fl', swing(at(28, CLOSE_UP), 28), 62); S.arch('fl', 28, 40, 70, 104)
    for b, d, s in tl:
        if 28 <= b < 40: S.chord('hi', b, d * 1.02, voicing(s, 55, 4), 44); S.arp('harp', b, d, voicing(s, 55, 4), step=1, vel=38, pattern=[0, 1, 2, 3])
        if 28 <= b < 64: S.note('bass', b, d * .98, bass_of(s, 28) + 12, 42)
    # 11-16: the savanna, sunset into night: its tune broad on horn (G Lydian), strings wide, voices
    sav = at(40, SAVANNA); S.play('horn', sav, 76)
    for a in range(3): S.arch('horn', 40 + a * 8, 48 + a * 8, 80, 112)
    for b, d, s in tl:
        if 40 <= b < 64:
            av = mel(sav, b, b + d); up = voicing(s, 67, 3, av)
            S.chord('str', b, d * 1.03, [bass_of(s, 43)] + voicing(s, 50, 2, av) + up, 50)
            S.chord('choir', b, d * 1.03, voicing(s, 60, 3, av), 42); S.arp('harp', b, d, up, step=1, vel=32, pattern=[0, 1, 2, 1])
    S.ramp('str', 40, 52, 80, 104); S.ramp('str', 52, 64, 104, 70); S.note('timp', 40, 3, 'G2', 50, human=False)
    # 17-22: the stars: their own tune on celesta (the flute an octave below at first); the last note is the one that falls
    CEL = at(64, STARS)
    S.play('cel', CEL, 68); S.play('fl', CEL[:8], 38, semis=-12)
    for b, d, s in tl:
        if 64 <= b < 88:
            av = mel(CEL, b, b + d); S.chord('hi', b, d * 1.03, voicing(s, 64, 3, av), 46); S.chord('choir', b, d * 1.03, voicing(s, 60, 3, av), 42)
            S.note('bass', b, d * .98, bass_of(s, 31), 44); S.arp('harp', b, d, voicing(s, 67, 3, av), step=1, vel=38, pattern=[0, 1, 2, 1])
    sparkle(S, 'cel', 84.5, [m('D7'), m('B6'), m('G6')], 44, step=.4)
    # 23-24: the gallop gathers again (the loop)
    gallop(88, 96, 'D3', 36, 52); S.ramp('gal', 88, 96, 74, 80)
    S.chord('str', 88, 8.1, [m('D4'), m('A4')], 40); S.ramp('str', 88, 96, 50, 70); roll(S, 'timp', 92, 96, 'D3', 18, 52)
    # three layers: the pads (bed), the melody (horn, strings, flute, celesta) and the gallop (cello triplets, bass,
    # timpani) that follows how fast she runs; the run holds (bars 1-7 come round again) until the horses meet
    S.meta = dict(stems=dict(lead=['horn', 'him', 'strm', 'fl', 'cel'], pulse=['gal', 'bassg', 'timp']), key=7, scale=G_MAJOR, phrase=(8, 0),
                  sections=dict(run=(0, 0, 28), close=(28, 0), savanna=(40, 0), stars=(64, 0), gather=(88, 0)))
    return S, 96

def wish():
    """The last chapter (G, 3/4, 76 bpm, 24 bars). 'glow' (held while she lights the candles, bars 1-7): the room holds
    its breath on a G pedal, harp and strings, and the earlier tunes come back one by one, as memories gather: the letter
    motif on celesta, the story theme on the cello, her road on the flute; each candle she lights rings the next note of
    Happy Birthday's first line (js/audio.js 'candle'). 'song' (once all six burn): a bar of breath on the dominant, then
    Happy Birthday, sung for the first time: a felt piano with celesta above it, the harp turning, the cello answering the
    long notes with the story theme's opening; a second verse, warmer, on the violin with the flute and the strings open;
    its last note is the glow's first chord."""
    S = Song('wish', 76, 3)
    S.ch('pnom', 'piano', 96, 60, 62); S.ch('celm', 'celesta', 64, 42, 76); S.ch('vln', 'violin', 92, 72, 70, mod=28); S.ch('fl', 'flute', 82, 54, 72, mod=14)
    S.ch('cl', 'cello', 86, 50, 66, mod=16); S.ch('harp', 'harp', 84, 84, 66); S.ch('str', 'slowstrings', 72, 60, 84); S.ch('cello', 'cello', 80, 46, 66, mod=14)
    S.ch('bass', 'contrabass', 70, 58, 60); S.ch('cel', 'celesta', 58, 86, 82); S.ch('choir', 'oohs', 54, 64, 96)
    # 1-7 (glow): a G pedal; the tunes of the story come back, softly
    glow = S.chords(timeline(0, [('Gmaj9', 3), ('Cmaj9/G', 3), ('Em9/G', 3), ('Cmaj7/G', 3), ('Gadd9', 3), ('Am9/G', 3), ('D/G', 3)]))
    frag = at(0, L('D5:1 B5:1.5 A5:.5 | G5:2.5 r:.5')); S.play('celm', frag, 46)                       # the letter
    ev, _ = waltz(1, 2, 6, 5 - 12); story = at(5, WALTZ_PICK, 5 - 12) + ev; S.play('cl', story, 48)    # the story theme
    road = at(12, L('B5:1.5 A5:.5 G5:1 | D5:1 E5:1 F#5:1 | A5:3')); S.play('fl', road, 40)             # her road
    S.arch('cl', 5, 12, 70, 100); S.arch('fl', 12, 21, 66, 96)
    for b, d, s in glow:
        av = mel(frag + story + road, b, b + d)
        S.arp('harp', b, d, voicing(s, 55, 3, av) + [voicing(s, 55, 3, av)[0] + 12], step=1, vel=30, pattern=[0, 1, 2, 3, 2, 1], hold=1.6)
        S.chord('str', b, d * 1.02, voicing(s, 55, 3, av), 30); S.note('bass', b, d * .99, 'G2', 34); S.chord('choir', b, d * 1.02, voicing(s, 60, 2, av), 22)
    S.ramp('str', 0, 21, 60, 84)
    sparkle(S, 'cel', 19, [m('D6'), m('A6'), m('D7')], 30, step=.5)
    # 8 ('song'): the breath before: the dominant, a harp sweep, the pickup
    S.chords([(21, 2, 'D7sus4'), (23, 1, 'D7')])
    S.chord('str', 21, 3.05, voicing('D7sus4', 55, 3), 34); S.ramp('str', 21, 24, 70, 92); S.chord('choir', 21, 3, voicing('D7sus4', 60, 3), 26)
    S.note('bass', 21, 3, 'D2', 40); S.note('cello', 21, 2, 'A2', 38); S.note('cello', 23, 1, 'C3', 40)
    gliss(S, 'harp', 23, PENTA('D4', 'D6', (2, 7, 9)), 1.4, 30, dur=1.6)
    # 9-16: Happy Birthday, the first time: a felt piano, the celesta an octave above, the harp turning beneath
    hb1 = at(23, HBG[:-1] + [(HBG[-1][0], 2)]); S.play('pnom', hb1, 68); S.play('celm', hb1, 30, semis=12)
    tl1 = S.chords([(23 + b, d, trc([c], 2)[0]) for b, d, c in HB_TL])
    harpwaltz(S, 'harp', tl1, 36, mel_=hb1); pads(S, 'str', tl1, 34, lo=55, n=3, mel_=hb1); S.ramp('str', 24, 48, 76, 86)
    roots(S, 'bass', tl1, 36, lo=31)
    answers = [(27, 'A3:.5 D4:.5 F#4:2'), (33, 'D4:.5 G4:.5 B4:2'), (45, 'B3:.5 D4:.5 G4:2')]   # the story theme's opening, in the long notes
    for b, s in answers: S.play('cello', at(b, L(s)), 52)
    for b, p in ((24, 'G2'), (30, 'D3'), (36, 'G2'), (39, 'G2'), (42, 'C3')): S.note('cello', b, 2.9, p, 40)
    # 17-25: the second verse, warmer: the violin, the flute an octave above for the last two lines, the strings open
    hb2 = at(47, HBG); S.play('vln', hb2, 72); S.play('fl', [e for e in hb2 if e[0] >= 59], 40)
    for a in range(4): S.arch('vln', 48 + a * 6, 54 + a * 6, 80, 110 if a in (1, 2) else 100)
    tl2 = S.chords([(47 + b, d, trc([c], 2)[0]) for b, d, c in HB_TL])
    harpwaltz(S, 'harp', tl2, 40, mel_=hb2); pads(S, 'str', tl2, 40, lo=55, n=3, mel_=hb2); S.ramp('str', 48, 60, 86, 104); S.ramp('str', 60, 75, 104, 70)
    pads(S, 'choir', tl2, 30, lo=60, n=3, b0=59, mel_=hb2); roots(S, 'bass', tl2, 40, lo=31)
    for b, s in [(51, 'A3:.5 D4:.5 F#4:2'), (57, 'D4:.5 G4:.5 B4:2'), (69, 'B3:.5 D4:.5 G4:2')]: S.play('cello', at(b, L(s)), 54)
    for b, p in ((48, 'G2'), (54, 'D3'), (60, 'G2'), (63, 'G2'), (66, 'C3')): S.note('cello', b, 2.9, p, 42)
    sparkle(S, 'cel', 70, [m('G6'), m('B6'), m('D7')], 32, step=.5)
    S.ctl.sort()
    # the tunes (letter, story, road, the song) are a layer over the harp, strings and bass
    S.meta = dict(stems=dict(lead=['pnom', 'celm', 'vln', 'fl', 'cl']), key=7, scale=G_MAJOR, phrase=(6, 0), sections=dict(glow=(0, 0, 21, 8), song=(21, 0)))
    return S, 72

def finale():
    """After the wish: the climax (G, 3/4, 72 bpm), orchestral, no drum kit. A bar's swell as the fireworks rise
    (timpani, a harp sweep, strings), and Happy Birthday in full: violins and flute in octaves, the horns weaving the
    story theme round its long notes, voices, timpani, the harp turning; a bar of the letter motif on celesta; then, for
    the credits, the story theme itself as a waltz (strings, the cello's counter-line, harp). The postcard: the waltz's
    second half on a piano alone, then its first half on the cello with the letter motif above. The end: Happy
    Birthday's last line, slowing (rit. 66, 60), on celesta and piano, and a long last chord with the stars.
    Parts: head (bars 1-18) once, loop (19-34) while she stays with the postcard, outro (35-42)."""
    S = Song('finale', 72, 3)
    S.ch('str', 'strings', 96, 64, 74); S.ch('hi', 'slowstrings', 86, 70, 82); S.ch('cello', 'cello', 90, 46, 64, mod=18); S.ch('bass', 'contrabass', 80, 58, 60)
    S.ch('horn', 'horn', 90, 74, 74, mod=6); S.ch('choir', 'oohs', 70, 64, 94); S.ch('timp', 'timpani', 88, 60, 62); S.ch('harp', 'harp', 84, 86, 70)
    S.ch('cel', 'celesta', 72, 40, 80); S.ch('pno', 'piano', 98, 62, 62); S.ch('fl', 'flute', 84, 56, 74, mod=14); S.ch('cellom', 'cello', 90, 50, 64, mod=18)
    S.tempo(105, 66); S.tempo(108, 60)
    # 1: the swell as the first fireworks rise; the pickup
    S.chords([(0, 2, 'D7sus4'), (2, 1, 'D7')])
    roll(S, 'timp', 0, 3, 'D3', 18, 70); swell(S, 3, 62); gliss(S, 'harp', 3, PENTA('D3', 'D6', (2, 7, 9)), 1.6, 36, dur=2.4)
    S.chord('hi', 0, 3.05, voicing('D7sus4', 55, 4), 44); S.ramp('hi', 0, 3, 50, 100); S.chord('horn', 0, 3, [m('D3'), m('A3'), m('C4')], 40); S.ramp('horn', 0, 3, 50, 96)
    S.note('bass', 0, 3, 'D2', 50); S.note('cello', 0, 3, 'D3', 50)
    # 2-9: Happy Birthday, all of us: violins (and flute) in octaves, horns weaving the story theme round its long notes
    T = at(2, HBG); S.play('str', T, 82); S.play('hi', T, 56, semis=12); S.play('fl', T, 52, semis=12)
    for a in range(4): S.arch('str', 3 + a * 6, 9 + a * 6, 96, 124 if a in (1, 2) else 112)
    tl = S.chords([(2 + b, d, trc([c], 2)[0]) for b, d, c in HB_TL])
    horns = L('B3:3 | A3:.5 D4:.5 F#4:1.5 E4:.5 | D4:1 C4:1 A3:1 | D4:.5 G4:.5 B4:1.5 A4:.5 | G4:2 D4:1 | E4:1.5 G4:.5 C5:1 | D4:1 B3:1 C4:1 | B3:.5 D4:.5 G4:2')
    S.play('horn', at(3, horns), 66); S.ramp('horn', 3, 15, 80, 104); S.ramp('horn', 15, 27, 104, 90)
    for b, d, s in tl:
        av = mel(T, b, b + d); av += [x - 12 for x in av] + [x + 12 for x in av]
        S.chord('choir', b, d * 1.02, voicing(s, 57, 4, av), 46); S.note('cello', b, d * .98, bass_of(s, 38), 70); S.note('bass', b, d * .98, bass_of(s, 28) + 12, 56)
    harpwaltz(S, 'harp', tl, 44, lo=62, mel_=T)
    for b, v in ((3, 72), (15, 64)): S.note('timp', b, 2, 'G2', v, human=False)
    roll(S, 'timp', 25, 27, 'D3', 24, 56); S.note('timp', 27, 2, 'G2', 50, human=False)
    for b, ns in ((8, ('D6', 'F#6', 'A6', 'D7')), (18.5, ('E6', 'G6', 'C7', 'E7'))): sparkle(S, 'cel', b, [m(x) for x in ns], 42, step=.25)
    # 10: a breath: the letter motif's opening on celesta, and the waltz's pickup
    S.chords([(27, 2, 'Cmaj7'), (29, 1, 'D7sus4')])
    S.play('cel', at(27, L('D5:1 B5:1.5')), 56); S.chord('hi', 27, 3, voicing('Cmaj7', 55, 3), 40); S.note('cello', 27, 2, 'C3', 50); S.note('cello', 29, 1, 'D3', 50)
    S.note('bass', 27, 3, 'C2', 40)
    # 11-18: the credits: the story theme as a waltz, strings singing, the cello's counter-line, the harp, the horns
    W, wt = waltz(1, 8, 30, 5); W = at(29, WALTZ_PICK, 5) + W; S.chords(wt)
    S.play('str', W, 78); S.play('hi', W, 50, semis=12)
    for a in range(4): S.arch('str', 30 + a * 6, 36 + a * 6, 92, 116)
    S.play('cello', counter(wt, 30, 54, 1, 'B2', 'G3', 'G3', avoid=W), 56); S.ramp('cello', 30, 54, 90, 104)
    harpwaltz(S, 'harp', wt, 40, mel_=W); roots(S, 'bass', wt, 46, lo=31)
    for b, d, s in wt: av = mel(W, b, b + d); S.chord('horn', b, d * 1.02, voicing(s, 53, 3, av), 34); S.chord('choir', b, d * 1.02, voicing(s, 60, 3, av), 32)
    S.note('timp', 30, 2, 'G2', 56, human=False)
    # 19-26 (loop): the postcard: the waltz's second half on a piano alone, the strings far away
    P, pt = waltz(9, 16, 54, 5); S.chords(pt); S.play('pno', P, 78)
    harpwaltz(S, 'pno', pt, 42, lo=52, mel_=P, bass_lo=38)
    for b, d, s in pt: S.pedal('pno', b, b + d)
    pads(S, 'hi', pt, 36, lo=55, n=3, mel_=P); S.ramp('hi', 54, 78, 56, 74)
    # 27-34: the cello sings the first half, the letter motif high on the celesta between its phrases, the harp
    C, ct = waltz(1, 8, 78, 5); S.chords(ct); C = [e for e in C if e[0] < 101]; S.play('cellom', C, 76, semis=-12)
    for a in range(4): S.arch('cellom', 78 + a * 6, 84 + a * 6, 80, 108)
    S.play('cel', at(78, L('D6:1 B6:1.5 A6:.5 | F#6:3')), 34); S.play('cel', at(90, L('D6:1 B6:1.5 A6:.5 | G6:3')), 30)
    harpwaltz(S, 'harp', ct, 40, mel_=[(e[0], e[1], e[2] - 12) for e in C])
    for b, d, s in ct: S.chord('pno', b, d, voicing(s, 62, 3, mel(C, b, b + d)), 32, roll=.08); S.pedal('pno', b, b + d)
    pads(S, 'hi', ct, 34, lo=55, n=3, mel_=C); S.ramp('hi', 78, 102, 74, 56); roots(S, 'bass', pt + ct, 36, lo=31)
    S.play('pno', at(101, WALTZ_PICK, 5), 64)   # (the pickup back into the loop)
    # 35-42 (outro): Happy Birthday's last line, slowing, on celesta and piano; the long last chord, the stars
    S.chords([(102, 3, 'Cadd9'), (105, 2, 'G/D'), (107, 1, 'D7'), (108, 18, 'Gadd9')])
    last = at(104, HBG[19:24]) + [(108, 3, m('G5'))]
    S.play('cel', last, 60); S.play('pno', last, 50, semis=-12)
    S.chord('pno', 102, 2, [m('C3'), m('G3'), m('D4'), m('E4')], 36, roll=.1); S.pedal('pno', 102, 108)
    S.chord('harp', 105, 2, voicing('G/D', 55, 4), 34, roll=.08); S.chord('harp', 107, 1, voicing('D7', 55, 4), 32, roll=.06)
    for b, d, s in [(102, 3, 'Cadd9'), (105, 2, 'G/D'), (107, 1, 'D7')]: S.chord('hi', b, d * 1.02, voicing(s, 55, 3), 32); S.note('cello', b, d * .98, bass_of(s, 38), 40)
    S.chord('hi', 108, 18, [m('G3'), m('D4'), m('B4'), m('A5'), m('D5')], 44); S.ramp('hi', 108, 126, 90, 28)
    S.chord('pno', 111, 15, [m('G1'), m('D2'), m('G2'), m('D3'), m('B3'), m('A4'), m('D5')], 42, roll=.12); S.pedal('pno', 111, 126)
    S.chord('choir', 108, 16, voicing('G', 60, 3), 26); S.ramp('choir', 108, 126, 80, 28)
    S.note('bass', 108, 17, 'G2', 32); S.note('cello', 108, 17, 'G2', 36)
    sparkle(S, 'cel', 112, [m('D6'), m('G6'), m('B6'), m('A7')], 34, step=.5)
    S.note('harp', 118, 6, 'B5', 22); S.note('harp', 120, 6, 'D6', 18)
    S.ctl.sort()
    # played as three parts: the swell, the song and the credits (bars 1-18) once, the postcard (19-34) for as long as
    # she stays with it, then the last line and the last chord (35-42) when the closing shot asks for the end
    S.meta = dict(key=7, scale=G_MAJOR, phrase=(6, 0), parts=[('head', 0, 54, 5.0), ('loop', 54, 102, 6.0), ('outro', 102, 126, 8.0)])
    return S, 126

# ================================================================ v18: endings, the stinger bank, the cue map
# Each chapter's cue has a composed ending: when the story moves on, the loop stops on a bar line and this cadence plays
# in time, resolving the harmony; the next chapter comes in on its resolution chord (whose sustained voices are open
# fifths, so they sit under the next key). `res` is the beat of the resolution.
def end_prologue():
    """Em7 - A7sus4 - A: the theme's own half close (the violin sighs E-D-C#); the book, in A, takes the A as home."""
    E = Song('prologue-end', 76); E.jit = .3
    E.ch('vln', 'violin', 96, 74, 70, mod=30); E.ch('harp', 'harp', 86, 86, 70); E.ch('cel', 'celesta', 80, 42, 78)
    E.ch('str', 'slowstrings', 82, 66, 80); E.ch('cello', 'cello', 86, 46, 66, mod=12); E.ch('choir', 'oohs', 58, 64, 96)
    tl = E.chords(timeline(0, [('Em7', 1), ('A7sus4', 1), ('A', 4)]))
    for b, d, s in tl: E.chord('str', b, d * 1.02 if b < 2 else 3.5, voicing(s, 54, 3), 42)
    E.ramp('str', 2, 5.5, 100, 64)
    E.chord('harp', 0, 2, voicing('Em7', 50, 4), 40, roll=.06); E.chord('harp', 2, 4, [m(x) for x in ('A2', 'E3', 'A3', 'C#4', 'E4', 'A4')], 44, roll=.09)
    E.note('cello', 0, 1, 'E3', 50, human=False); E.note('cello', 1, 4.5, 'A2', 48)
    E.play('vln', [(0, 1, m('E5')), (1, 1, m('D5')), (2, 3, m('C#5'))], 66); E.ramp('vln', 0, 5, 100, 70)
    E.chord('choir', 2, 3.5, [m('A3'), m('E4'), m('A4')], 26)
    sparkle(E, 'cel', 2.05, [m('A5'), m('C#6'), m('E6')], 34, step=.33)
    E.meta = dict(res=2, beats=5.5); return E
def end_book():
    """E7sus4 - E7 - A, the lullaby's close: the guitar rocks once more, the clarinet's leading note goes home."""
    E = Song('book-end', 63); E.jit = .3
    E.ch('cl', 'clarinet', 90, 56, 66, mod=8); E.ch('gtr', 'nylon', 92, 42, 56); E.ch('pno', 'piano', 74, 70, 64); E.ch('cello', 'cello', 86, 50, 64, mod=16)
    E.ch('str', 'slowstrings', 64, 64, 84); E.ch('box', 'musicbox', 66, 80, 74)
    tl = E.chords(timeline(0, [('E7sus4', 1), ('E7', 1), ('A', 4)]))
    for b, s in ((0, 'E7sus4'), (1, 'E7')):
        v = voicing(s, 57, 3)
        for j, p in enumerate([m('E3'), v[0], v[1]]): E.note('gtr', b + j / 3, .75, p, 44 if j else 48)
        E.chord('pno', b, 1, [m('E2')] + v, 32, roll=.08); E.pedal('pno', b, b + 1)
        E.chord('str', b, 1.02, voicing(s, 54, 3), 30)
    E.chord('gtr', 2, 3, [m(x) for x in ('A2', 'E3', 'A3', 'C#4', 'E4')], 44, roll=.12)
    E.chord('pno', 2, 3.5, [m(x) for x in ('A1', 'E2', 'A2', 'E3', 'A3')], 36, roll=.1); E.pedal('pno', 2, 5.5)
    E.chord('str', 2, 3.5, [m('A3'), m('E4'), m('A4')], 30); E.ramp('str', 2, 5.5, 100, 60)
    E.play('cl', [(0, 1, m('B4')), (1, 1, m('G#4')), (2, 2.8, m('A4'))], 60)
    E.note('cello', 0, 2, 'E3', 44, human=False); E.note('cello', 2, 3.5, 'A2', 42)
    E.play('box', [(2.02, .5, m('E6')), (2.35, .5, m('C#6')), (2.7, 2, m('A5'))], 34)
    E.meta = dict(res=2, beats=5.5); return E
def end_journey():
    """A7sus4 - A7 - D in the duet's own time: the piano's eighths, the flute's C# up to D, the cello down to it."""
    E = Song('journey-end', JOURNEY_BPM); E.jit = .3
    E.ch('pno', 'piano', 92, 62, 58); E.ch('fl', 'flute', 92, 78, 70, mod=14); E.ch('cello', 'cello', 94, 46, 64, mod=18)
    E.ch('str', 'slowstrings', 74, 64, 84); E.ch('harp', 'harp', 80, 88, 72); E.ch('cel', 'celesta', 56, 92, 80)
    tl = E.chords(timeline(0, [('A7sus4', 2), ('A7', 2), ('D', 4)]))
    for b, s in ((0, 'A7sus4'), (2, 'A7')):
        v = voicing(s, 55, 4); E.note('pno', b, 2, m('A1') + 12, 50, human=not b); E.arp('pno', b + .5, 1.5, v, step=.5, vel=42, pattern=[0, 1, 2, 3], hold=2.0)
        E.chord('str', b, 2.04, voicing(s, 55, 3), 38)
    E.pedal('pno', 0, 2); E.pedal('pno', 2, 4)
    E.chord('pno', 4, 3.5, [m(x) for x in ('D2', 'A2', 'D3', 'F#3', 'A3')], 46, roll=.05); E.pedal('pno', 4, 7.5)
    E.chord('str', 4, 3.5, [m(x) for x in ('D3', 'A3', 'D4', 'A4')], 36); E.ramp('str', 4, 7.5, 100, 60)
    E.play('fl', [(0, 2, m('E5')), (2, 2, m('C#5')), (4, 3.5, m('D5'))], 62, legato=1.02); E.ramp('fl', 4, 7.5, 100, 70)
    E.note('cello', 0, 4, 'A2', 50, human=False); E.note('cello', 4, 3.5, 'D3', 48)
    gliss(E, 'harp', 4, PENTA('D4', 'D6', (2, 4, 6, 9, 11)), 1.0, 34, dur=1.6)
    sparkle(E, 'cel', 4.05, [m('D6'), m('F#6'), m('A6')], 36, step=.25)
    E.meta = dict(res=4, beats=7.5); return E
def end_memories():
    """Am7 - D7 - G: the nocturne's piano, the violin rising E-F#-G, a last light on the vibraphone."""
    E = Song('memories-end', 66); E.jit = .3
    E.ch('pno', 'piano', 100, 64, 62); E.ch('vln', 'violin', 88, 76, 72, mod=28); E.ch('cello', 'cello', 84, 46, 66, mod=16)
    E.ch('str', 'slowstrings', 70, 60, 84); E.ch('vib', 'vibes', 60, 88, 80)
    tl = E.chords(timeline(0, [('Am7', 1), ('D7', 1), ('G', 4)]))
    for b, s in ((0, 'Am7'), (1, 'D7')):
        v = [bass_of(s, 40)] + voicing(s, 52, 3); E.arp('pno', b, 1, v, step=.25, vel=38, pattern=[0, 1, 2, 3], hold=2.4); E.pedal('pno', b, b + 1)
        E.chord('str', b, 1.02, voicing(s, 55, 3), 28)
    E.chord('pno', 2, 3.5, [m(x) for x in ('G1', 'D2', 'G2', 'D3', 'B3')], 40, roll=.09); E.pedal('pno', 2, 5.5)
    E.chord('str', 2, 3.5, [m('G3'), m('D4'), m('G4')], 28); E.ramp('str', 2, 5.5, 100, 60)
    E.play('vln', [(0, 1, m('E5')), (1, 1, m('F#5')), (2, 3, m('G5'))], 66); E.ramp('vln', 2, 5, 100, 72)
    E.note('cello', 0, 1, 'A2', 46, human=False); E.note('cello', 1, 1, 'D3', 46); E.note('cello', 2, 3.5, 'G2', 44)
    E.note('vib', 2.05, 2.5, 'B5', 30); E.note('vib', 2.4, 2, 'D6', 26)
    E.meta = dict(res=2, beats=5.5); return E
def end_film():
    """C - D - G, broad: the horn calls E-F#-G, a timpani roll and a harp sweep into G (the wish's key), celesta stars."""
    E = Song('film-end', 96); E.jit = .3
    E.ch('str', 'strings', 92, 64, 66); E.ch('hi', 'slowstrings', 84, 70, 80); E.ch('horn', 'horn', 92, 74, 72, mod=6); E.ch('timp', 'timpani', 90, 60, 58)
    E.ch('choir', 'oohs', 66, 64, 92); E.ch('cel', 'celesta', 74, 40, 80); E.ch('harp', 'harp', 80, 86, 72); E.ch('bass', 'contrabass', 80, 60, 56)
    tl = E.chords(timeline(0, [('C', 2), ('D', 2), ('G', 4)]))
    for b, s in ((0, 'C'), (2, 'D')): E.chord('str', b, 2.04, voicing(s, 50, 4), 54 + b * 2); E.chord('hi', b, 2.04, voicing(s, 64, 3), 40)
    E.chord('str', 4, 4.5, [m(x) for x in ('G2', 'D3', 'G3', 'D4')], 56); E.chord('hi', 4, 4.5, [m('G4'), m('B4'), m('D5')], 42)
    E.ramp('str', 4, 8.5, 100, 60); E.ramp('hi', 4, 8.5, 100, 60)
    E.play('horn', [(0, 2, m('E4')), (2, 2, m('F#4')), (4, 4, m('G4'))], 70); E.play('horn', [(0, 2, m('E4')), (2, 2, m('F#4')), (4, 4, m('G4'))], 46, semis=-12)
    E.note('bass', 0, 2, 'C2', 50, human=False); E.note('bass', 2, 2, 'D2', 52); E.note('bass', 4, 4, 'G1', 50)
    roll(E, 'timp', 2, 4, 'D3', 26, 56); E.note('timp', 4, 3, 'G2', 60, human=False)
    gliss(E, 'harp', 4, PENTA('G3', 'G5'), 1.0, 38, dur=1.8)
    E.chord('choir', 4, 4, voicing('G', 60, 3), 34); sparkle(E, 'cel', 4.1, [m('G6'), m('B6'), m('D7')], 40, step=.3)
    E.meta = dict(res=4, beats=8.5); return E
def end_wish():
    """D7 - G, one bar of the waltz: the piano sings A-F#-G with the celesta above, harp and cello beneath (the finale
    comes in on the G)."""
    E = Song('wish-end', 76, 3); E.jit = .3
    E.ch('pnom', 'piano', 96, 60, 62); E.ch('harp', 'harp', 84, 84, 66); E.ch('str', 'slowstrings', 72, 60, 84); E.ch('celm', 'celesta', 64, 42, 76)
    E.ch('cello', 'cello', 80, 46, 66, mod=14)
    tl = E.chords(timeline(0, [('D7', 3), ('G', 3)]))
    E.arp('harp', 0, 3, voicing('D7', 55, 4), step=1, vel=36, pattern=[0, 1, 2, 3, 2, 1])
    E.chord('harp', 3, 3, [m(x) for x in ('G2', 'D3', 'G3', 'B3', 'D4', 'G4')], 38, roll=.08)
    mel_ = [(0, 1.5, m('A5')), (1.5, 1.5, m('F#5')), (3, 3, m('G5'))]
    E.play('pnom', mel_, 62); E.play('celm', mel_, 26, semis=12)
    E.note('cello', 0, 3, 'D3', 44, human=False); E.note('cello', 3, 3, 'G2', 42)
    E.chord('str', 0, 3.03, voicing('D7', 53, 3), 32); E.chord('str', 3, 3, [m('G3'), m('D4'), m('G4')], 30); E.ramp('str', 3, 6, 100, 60)
    E.meta = dict(res=3, beats=6); return E
def end_finale():
    """D7sus4 - D7 - G: a short close for leaving the finale early (wishing again: the wish comes in on the G); the real
    ending is its own outro."""
    E = Song('finale-end', 72, 3); E.jit = .3
    E.ch('str', 'strings', 96, 64, 74); E.ch('cello', 'cello', 90, 46, 64, mod=18); E.ch('harp', 'harp', 84, 86, 70); E.ch('cel', 'celesta', 70, 40, 80)
    E.ch('pno', 'piano', 98, 62, 62); E.ch('hi', 'slowstrings', 86, 70, 82)
    tl = E.chords(timeline(0, [('D7sus4', 1.5), ('D7', 1.5), ('G', 3)]))
    for b, s in ((0, 'D7sus4'), (1.5, 'D7')): E.chord('hi', b, 1.52, voicing(s, 52, 4), 42); E.chord('harp', b, 1.5, voicing(s, 55, 4), 34, roll=.06)
    E.chord('hi', 3, 3.5, [m(x) for x in ('G3', 'D4', 'G4', 'D5')], 42); E.ramp('hi', 3, 6.5, 100, 60)
    E.chord('pno', 3, 3.5, [m(x) for x in ('G2', 'D3', 'G3', 'B3', 'D4')], 40, roll=.1); E.pedal('pno', 3, 6.5)
    E.play('str', [(0, 1.5, m('A5')), (1.5, 1.5, m('F#5')), (3, 3, m('G5'))], 62)
    E.note('cello', 0, 3, 'D3', 50, human=False); E.note('cello', 3, 3.5, 'G2', 46)
    sparkle(E, 'cel', 3.05, [m('G6'), m('B6'), m('D7')], 34, step=.3)
    E.meta = dict(res=3, beats=6.5); return E
ENDINGS = dict(prologue=end_prologue, book=end_book, journey=end_journey, memories=end_memories, film=end_film, wish=end_wish, finale=end_finale)

# The stinger bank: single notes of four soft instruments every major third (the page bends each to pitch, two semitones
# at most), dry and mono (the page adds the reverb), all in one file.
BANK = dict(harp=('harp', range(48, 97, 4), 1.6), cel=('celesta', range(72, 101, 4), 1.4), box=('musicbox', range(72, 97, 4), 1.4), pno=('piano', range(33, 66, 4), 2.2))
GAP, LEAD = .12, .05
def bank():
    segs, parts, at = {}, [np.zeros(int(LEAD * SR))], LEAD
    for key, (prog, notes, dur) in BANK.items():
        S = Song('bank', 60); S.ch('x', prog, 110, 64, 0, 0); notes = list(notes)
        for i, p in enumerate(notes): S.note('x', i * 4, dur * .6, p, 84, human=False)   # (at 60 bpm, beats are seconds)
        y, _ = S.perform(len(notes) * 4, tail=1.0); y = y.mean(1)
        for i, p in enumerate(notes):
            seg = y[int(i * 4 * SR):int((i * 4 + dur) * SR)].copy(); n = int(.15 * SR); seg[-n:] *= np.linspace(1, 0, n) ** 2
            segs.setdefault(key, []).append([p, round(at, 4), dur]); parts += [seg, np.zeros(int(GAP * SR))]; at += dur + GAP
    y = np.concatenate(parts); y = y / np.abs(y).max() * .9
    size = encode('stingers', y[:, None], mono=True)
    print(f'stingers: {len(y) / SR:.1f}s mono, {sum(len(v) for v in segs.values())} notes, {size // 1024} KB')
    return dict(file='stingers', lead=LEAD, notes=segs)

# ---------------------------------------------------------------- the cue map (site/js/score-map.js) and the build
MAPJS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'js', 'score-map.js')
# the stingers' phrases, in D (js/audio.js moves them to the key that is playing): the stars she links into a heart (the
# stars' own tune, its last notes: the last one comes home), and the six candles: Happy Birthday's first line, which
# she lights herself in the last chapter (the only stinger that may play it: tools/check_hb.py)
STAR = [p - 5 for p, _ in STARS]
CANDLE = [p - 5 for p, _ in HBG[:6]]
def stems_of(S):
    sp = S.meta.get('stems', {}); used = {c for v in sp.values() for c in v}
    return {'bed': [c for c in S.chans if c not in used], **sp}
def chord_rows(tl, scale):
    """[beat, root, bass, chord tones, twinkle tones (chord tones plus the 9th / 6th where they are in the key and a whole
    step from every chord tone)]"""
    out = []
    for b, d, sym in sorted(tl):
        r, iv, bs = parse(sym); pcs = sorted({(r + i) % 12 for i in iv})
        tw = sorted(set(pcs) | {t for t in ((r + 2) % 12, (r + 9) % 12) if t in scale and all((t - q) % 12 not in (1, 11) for q in pcs)})
        out.append([round(b, 4), r, bs, pcs, tw])
    return out
def build(name):
    S, beats = PIECES[name](); M = S.meta
    parts = M.get('parts') or [('loop', 0, beats, 6.0)]; st = stems_of(S); out = {}
    for part, b0, b1, tail in parts:
        for stem, chans in (st.items() if part == 'loop' else [('bed', list(S.chans))]):
            y, L = S.perform(beats, only=set(chans), b0=b0, b1=b1, tail=tail)
            out[(part, stem)] = fold(y, L) if part == 'loop' else ring(y, L, min(tail, 3.0))
    sums = {part: sum(v for (p, _), v in out.items() if p == part) for part, *_ in parts}
    lufs = loudness(np.concatenate(list(sums.values()))); g = 10 ** ((-17 - lufs) / 20)
    pk = max(np.abs(v).max() for v in sums.values()) * g
    if pk > .89: g *= .89 / pk
    E = ENDINGS[name](); ey, EL = E.perform(E.meta['beats'], tail=3.0); ey = ring(ey, EL, 1.6) * g
    if np.abs(ey).max() > .89: ey *= .89 / np.abs(ey).max()
    size = {}
    for (part, stem), y in out.items(): f = f'{name}.{stem}' if part == 'loop' else f'{name}.{part}'; size[f] = encode(f, y * g, mono=stem != 'bed')
    size[name + '.end'] = encode(name + '.end', ey)
    lp = [p for p in parts if p[0] == 'loop'][0]; L = S.secs(lp[2]) - S.secs(lp[1])
    q = lambda x: round(x, 6)
    entry = dict(bpm=S.bpm, meter=S.beats, first=M.get('phrase', (8, 0))[1] if S.beats == 3 else 0, len=q(L), loop=[lp[1], lp[2]],
                 tempo=[[b, bpm, q(S.secs(b))] for b, bpm in S.tempos], key=M['key'], scale=sorted(M['scale']), phrase=list(M.get('phrase', (8, 0))),
                 sections={k: list(v) for k, v in M.get('sections', {}).items()}, stems=list(st), mono=[k for k in st if k != 'bed'],
                 chords=chord_rows(S.ctl, set(M['scale'])),
                 cad=dict(res=q(E.secs(E.meta['res'])), dur=q(len(ey) / SR), bpm=E.bpm, meter=E.beats, chords=chord_rows(E.ctl, set(M['scale']))))
    for part, b0, b1, tail in parts:
        if part != 'loop': entry[part] = dict(beats=[b0, b1], dur=q(len(out[(part, 'bed')]) / SR), len=q(S.secs(b1) - S.secs(b0)))
    print(f'{name}: loop {L:.6f}s ({lp[1]}-{lp[2]} beats), {lufs:.1f} LUFS -> gain {20 * math.log10(g):+.1f} dB, sum peak {pk / max(g, 1e-9) * g:.2f}; '
          + ', '.join(f'{k} {v // 1024} KB' for k, v in size.items()))
    return entry
def write_map(cues=None, bank_=None):
    cur = {}
    if os.path.exists(MAPJS): t = open(MAPJS).read(); cur = json.loads(t[t.index('{'):t.rindex('}') + 1])
    cur.setdefault('cues', {}).update(cues or {})
    if bank_: cur['bank'] = bank_
    cur['phrases'] = dict(star=STAR, candle=CANDLE, tonic=2)
    with open(MAPJS, 'w') as f:
        f.write('// The score as data for js/audio.js, written by tools/score.py (not by hand): for each cue its beat grid and tempo map,\n'
                '// chords (beat, root, bass, chord tones, twinkle tones), sections, layers, cadence; the stinger bank; the phrases.\n')
        f.write('export default ' + json.dumps(cur, separators=(',', ':')) + ';\n')

# ================================================================ sound effects
def write_sfx(name, y, peak=.85):
    y = y / (np.abs(y).max() or 1) * peak
    if y.ndim == 1: y = np.stack([y, y], 1)
    tmp = tempfile.mkdtemp(); wav = os.path.join(tmp, 's.wav'); wavfile.write(wav, SR, (y * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-b:a', '96k', os.path.join(OUT, f'sfx-{name}.mp3')], check=True); print('sfx', name)
def sfx_seal():
    """Opening the envelope: a quick harp glissando up with a celesta sparkle on top (performed by the soundfont)."""
    S = Song('sfx', 120); S.ch('harp', 'harp', 110, 60, 70); S.ch('cel', 'celesta', 90, 70, 80)
    notes = [m(x) for x in ['D4', 'E4', 'F#4', 'A4', 'B4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6', 'E6', 'F#6', 'A6']]
    for i, p in enumerate(notes): S.note('harp', i * .07, 2, p, 70 + i * 2, human=False)
    for i, p in enumerate([m('A6'), m('D7'), m('F#7')]): S.note('cel', 1.0 + i * .18, 2, p, 70, human=False)
    tmp = tempfile.mkdtemp(); S.midi(tmp + '/s.mid', 6)
    subprocess.run(['fluidsynth', '-ni', '-q', '-r', str(SR), '-F', tmp + '/s.wav', SF, tmp + '/s.mid'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    _, y = wavfile.read(tmp + '/s.wav'); y = y[:int(SR * 3.2)].astype(float); n = int(SR * .8); y[-n:] *= np.linspace(1, 0, n)[:, None]
    write_sfx('seal', y)
def sfx_pop():
    """A firework far away: a soft low thump, then a crackle of sparks."""
    rng = np.random.RandomState(4); n = int(SR * 2.2); t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * (55 + 40 * np.exp(-t * 18)) * t) * np.exp(-t * 7) * (t < .6)
    crack = np.zeros(n)
    for k in range(70):
        at = int(SR * (.25 + rng.rand() ** 1.6 * 1.6)); L = int(SR * .012); env = np.exp(-np.arange(L) / (L / 5))
        crack[at:at + L] += rng.randn(L) * env * (.3 + rng.rand() * .7) * np.exp(-(at / SR - .25) * 1.2)
    from scipy.signal import butter, lfilter
    b, a = butter(2, [1500 / (SR / 2), 9000 / (SR / 2)], 'band'); crack = lfilter(b, a, crack)
    y = thump * .9 + crack * 2.2
    L = np.stack([y, np.roll(y, 120)], 1)  # a touch of width
    write_sfx('pop', L, .7)
def sfx_yip():
    """A small, happy puppy yip: a short pitched chirp with a voiced, nasal formant."""
    n = int(SR * .2); t = np.arange(n) / SR
    f0 = 820 + 420 * np.sin(np.clip(t / .09, 0, 1) * np.pi / 2) - 300 * np.clip((t - .09) / .1, 0, 1)
    ph = 2 * np.pi * np.cumsum(f0) / SR
    y = sum(np.sin(k * ph) * a for k, a in [(1, 1), (2, .55), (3, .3), (4, .14), (5, .08)])
    env = np.clip(t / .008, 0, 1) * np.exp(-np.clip(t - .03, 0, None) * 22)
    from scipy.signal import butter, lfilter
    b, a = butter(2, [700 / (SR / 2), 3200 / (SR / 2)], 'band'); y = lfilter(b, a, y * env)
    y = np.concatenate([y, np.zeros(int(SR * .08))])
    write_sfx('yip', y, .6)
SFX = dict(seal=sfx_seal, pop=sfx_pop, yip=sfx_yip)

PIECES = dict(prologue=prologue, book=book, journey=journey, memories=memories, film=film, wish=wish, finale=finale)
if __name__ == '__main__':
    names = sys.argv[1:] or list(PIECES) + ['bank']
    cues = {}
    for n in names:
        if n == 'sfx': [f() for f in SFX.values()]   # (superseded by tools/sfx16.py; kept for reference)
        elif n == 'bank': write_map(bank_=bank())
        else: cues[n] = build(n); write_map(cues)
