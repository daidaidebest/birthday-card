"""Original score for the birthday film, rendered offline (additive synthesis + plucked strings + convolution reverb).
All melodies are original except "Happy Birthday to You", which is in the public domain.
Run: python3 tools/music.py  → site/assets/audio/*.mp3
"""
import numpy as np, subprocess, os, sys
from scipy.signal import fftconvolve, lfilter, butter

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'site', 'assets', 'audio')
os.makedirs(OUT, exist_ok=True)
rs = np.random.RandomState(7)
NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
def m(n):
    if isinstance(n, (int, float)): return n
    name, octv = (n[:-1], int(n[-1])) if n[-1].isdigit() else (n, 4)
    return 12 * (octv + 1) + NOTE[name]
hz = lambda mm: 440.0 * 2 ** ((mm - 69) / 12)

# ---------------- instruments ----------------
def env_ad(n, a, d):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-t / d)
    return e
def celesta(f, dur, vel):
    n = int(SR * (dur + 3.2)); t = np.arange(n) / SR
    parts = [(1, 1, 2.6), (2, .28, 1.1), (3, .1, .5), (4.2, .06, .25), (8.1, .03, .12)]
    y = sum(a * np.sin(2 * np.pi * f * k * t + rs.rand() * 6) * np.exp(-t / d) for k, a, d in parts)
    y *= np.minimum(1, t / .003)
    return y * vel * .5
def musicbox(f, dur, vel):
    n = int(SR * (dur + 2.6)); t = np.arange(n) / SR
    parts = [(1, 1, 1.9), (2.0, .2, .7), (3.0, .08, .4), (5.4, .07, .18), (8.9, .05, .08)]
    y = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / d) for k, a, d in parts)
    return y * np.minimum(1, t / .002) * vel * .45
def piano(f, dur, vel):
    n = int(SR * (dur + 2.4)); t = np.arange(n) / SR
    B = .00035; y = np.zeros(n)
    for k in range(1, 11):
        fk = f * k * np.sqrt(1 + B * k * k)
        if fk > 12000: break
        amp = (1 / k ** 1.25) * (1 if k < 3 else .8)
        dec = 3.2 / (1 + .35 * k) * (1 + 1.5 * (220 / max(f, 80)) ** .5) * .55
        y += amp * np.sin(2 * np.pi * fk * t + rs.rand() * 6) * np.exp(-t / dec)
    rel = np.ones(n); off = int(SR * dur)
    if off < n: rel[off:] = np.exp(-np.arange(n - off) / SR / .25)
    y *= rel * np.minimum(1, t / .004)
    # felt hammer thump
    y[:400] += rs.randn(400) * np.exp(-np.arange(400) / 60) * .02
    return y * vel * .42
def harp(f, dur, vel):
    n = int(SR * (dur + 3.0)); N = max(2, int(round(SR / f)))
    x = np.zeros(n); burst = rs.randn(N) * .5; burst = lfilter([.5, .5], [1], burst); x[:N] = burst
    a = np.zeros(N + 2); a[0] = 1; a[N] = -.4985; a[N + 1] = -.4985
    y = lfilter([1], a, x)
    return y * vel * 1.05 * np.minimum(1, np.arange(n) / 40)
def strings(f, dur, vel, att=1.2, rel=1.6, bright=1.0):
    n = int(SR * (dur + rel)); t = np.arange(n) / SR
    y = np.zeros(n)
    vib = 1 + .0035 * np.sin(2 * np.pi * 5.2 * t + rs.rand() * 6) * np.minimum(1, t / 1.2)
    for det in (-.006, 0, .0055):
        ph = 2 * np.pi * f * (1 + det) * np.cumsum(vib) / SR
        for k in range(1, 14):
            if f * k > 9000: break
            y += np.sin(k * ph + rs.rand() * 6) / k ** (1.35 / bright)
    e = np.minimum(1, t / att); off = int(SR * dur)
    if off < n: e[off:] *= np.exp(-np.arange(n - off) / SR / (rel / 3))
    return y * e * vel * .19
def pad(f, dur, vel): return strings(f, dur, vel, att=2.2, rel=3.0, bright=.7) * .9
def bell(f, dur, vel):
    n = int(SR * (dur + 4)); t = np.arange(n) / SR
    parts = [(1, 1, 3.5), (2.76, .5, 1.8), (5.4, .3, .9), (8.93, .2, .5), (13.3, .1, .3)]
    return sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t / d) for k, a, d in parts) * np.minimum(1, t / .002) * vel * .3
INST = dict(celesta=celesta, musicbox=musicbox, piano=piano, harp=harp, strings=strings, pad=pad, bell=bell)
PAN = dict(celesta=.35, musicbox=.3, piano=-.05, harp=-.4, strings=.1, pad=0, bell=.5)

def reverb_ir(sec=3.2, seed=3):
    r = np.random.RandomState(seed); n = int(SR * sec); t = np.arange(n) / SR
    ir = r.randn(2, n) * np.exp(-t / (sec / 6.5))
    b, a = butter(1, 5000 / (SR / 2)); ir = lfilter(b, a, ir, axis=1)
    ir[:, :int(SR * .012)] *= np.linspace(0, 1, int(SR * .012))
    return ir / np.abs(ir).sum(axis=1, keepdims=True) * 40

class Track:
    def __init__(self, bpm, length_beats, tail=4.0):
        self.bpm = bpm; self.spb = 60 / bpm; self.len = length_beats * self.spb
        self.buf = np.zeros((2, int(SR * (self.len + tail))))
    def note(self, inst, beat, dur, pitch, vel=.7, humanize=.012):
        t0 = beat * self.spb + (rs.rand() - .5) * humanize * 2
        y = INST[inst](hz(m(pitch)), dur * self.spb, vel)
        i = max(0, int(t0 * SR)); y = y[:self.buf.shape[1] - i]
        p = PAN[inst] + (rs.rand() - .5) * .1
        self.buf[0, i:i + len(y)] += y * np.sqrt((1 - p) / 2) * 1.4
        self.buf[1, i:i + len(y)] += y * np.sqrt((1 + p) / 2) * 1.4
    def melody(self, inst, start, seq, vel=.7, octave=0):
        b = start
        for item in seq:
            p, d = item[0], item[1]
            if p is not None: self.note(inst, b, d * (1.05 if inst in ('strings', 'pad') else 1), m(p) + octave, item[2] if len(item) > 2 else vel)
            b += d
        return b
    def chord(self, inst, beat, dur, pitches, vel=.5):
        for p in pitches: self.note(inst, beat, dur, p, vel)
    def arp(self, inst, beat, dur, pitches, step=.5, vel=.45, pattern=None):
        seq = pattern or list(range(len(pitches))); k = 0; b = beat
        while b < beat + dur - 1e-6:
            self.note(inst, b, step * 1.6, pitches[seq[k % len(seq)]], vel * (1 if k % len(seq) == 0 else .8)); b += step; k += 1
    def render(self, name, wet=.32, gain=1.0, fade_in=.02, fade_out=2.5):
        y = self.buf
        ir = reverb_ir()
        w = np.stack([fftconvolve(y[0], ir[0])[:y.shape[1]], fftconvolve(y[1], ir[1])[:y.shape[1]]])
        out = y * (1 - wet) + w * wet
        out /= max(1e-6, np.abs(out).max()); out = np.tanh(out * 1.2) / np.tanh(1.2) * .92 * gain
        n = out.shape[1]; fi = int(SR * fade_in); fo = int(SR * fade_out)
        out[:, :fi] *= np.linspace(0, 1, fi); out[:, -fo:] *= np.linspace(1, 0, fo)
        write(name, out)

def write(name, out, br='112k'):
    wav = f'/tmp/{name}.raw'
    (np.clip(out.T, -1, 1) * 32767).astype('<i2').tofile(wav)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', wav, '-b:a', br, os.path.join(OUT, name + '.mp3')], check=True)
    os.remove(wav); print(name, round(out.shape[1] / SR, 1), 's')

CH = {  # chord voicings
    'Em': ['E3', 'B3', 'E4', 'G4'], 'C': ['C3', 'G3', 'C4', 'E4'], 'Am': ['A2', 'E3', 'A3', 'C4'], 'B7': ['B2', 'F#3', 'A3', 'D#4'],
    'G': ['G2', 'D3', 'G3', 'B3'], 'D/F#': ['F#2', 'D3', 'A3', 'D4'], 'G/B': ['B2', 'D3', 'G3', 'B3'], 'D': ['D3', 'A3', 'D4', 'F#4'], 'D7': ['D3', 'A3', 'C4', 'F#4'],
    'Cmaj7': ['C3', 'G3', 'B3', 'E4'], 'Em/D': ['D3', 'B3', 'E4', 'G4'],
    'Cc': ['C3', 'G3', 'C4', 'E4'], 'G/B2': ['B2', 'G3', 'B3', 'D4'], 'F': ['F2', 'C3', 'F3', 'A3'], 'C/E': ['E3', 'G3', 'C4', 'E4'], 'Gc': ['G2', 'D3', 'G3', 'B3'],
    'Dm': ['D3', 'A3', 'D4', 'F4'], 'Bb': ['Bb2', 'F3', 'Bb3', 'D4'], 'C7': ['C3', 'G3', 'Bb3', 'E4'], 'F/C': ['C3', 'F3', 'A3', 'C4'],
    'Bm': ['B2', 'F#3', 'B3', 'D4'], 'A': ['A2', 'E3', 'A3', 'C#4'], 'F#m': ['F#2', 'C#3', 'F#3', 'A3'],
}

def prologue():
    T = Track(78, 16 * 3)
    prog = ['Em', 'Em/D', 'Cmaj7', 'B7', 'Em', 'Am', 'B7', 'Em'] * 2
    for i, c in enumerate(prog):
        T.chord('pad', i * 3, 3, [p for p in CH[c][:3]], .42)
        T.arp('harp', i * 3, 3, CH[c], step=.5, vel=.3, pattern=[0, 1, 2, 3, 2, 1])
    mel = [('G5', 1), ('F#5', 1), ('E5', 1), ('B5', 2), ('A5', 1), ('G5', 1), ('E5', 1), ('C5', 1), ('D#5', 3),
           ('E5', 1), ('G5', 1), ('B5', 1), ('C6', 2), ('B5', 1), ('A5', 1), ('F#5', 1), ('D#5', 1), ('E5', 3)]
    T.melody('celesta', 0, mel, .6)
    T.melody('celesta', 24, mel, .5, octave=-12)
    T.melody('strings', 24, [(p, d) for p, d in mel], .32, octave=-12)
    T.render('prologue', wet=.4)

BOOK_MEL = [('B5', 1.5), ('A5', .5), ('G5', 1), ('A5', 2), ('D5', 1), ('E5', 1), ('G5', 1), ('B5', 1), ('A5', 3),
            ('G5', 1.5), ('F#5', .5), ('G5', 1), ('A5', 1), ('C6', 1), ('B5', 1), ('A5', 1.5), ('G5', .5), ('F#5', 1), ('A5', 3),
            ('B5', 1.5), ('A5', .5), ('G5', 1), ('F#5', 2), ('B5', 1), ('G5', 1), ('E5', 1), ('B4', 1), ('C5', 1), ('E5', 1), ('G5', 1),
            ('C6', 1.5), ('B5', .5), ('A5', 1), ('F#5', 1), ('G5', 1), ('A5', 1), ('G5', 3), (None, 3)]
BOOK_CH = ['G', 'D/F#', 'Em', 'D', 'G/B', 'Am', 'D', 'D7', 'G', 'B7', 'Em', 'C', 'Am', 'D', 'G', 'G']
def book():
    T = Track(84, 32 * 3)
    for rep in range(2):
        for i, c in enumerate(BOOK_CH):
            b = (rep * 16 + i) * 3
            T.arp('harp', b, 3, CH[c], step=.5, vel=.34, pattern=[0, 1, 2, 3, 2, 1])
            T.chord('pad', b, 3, CH[c][1:], .3 + rep * .1)
    T.melody('celesta', 0, BOOK_MEL, .62)
    T.melody('strings', 48, BOOK_MEL, .36, octave=-12)
    T.melody('celesta', 48, BOOK_MEL[:10], .35, octave=12)
    T.render('book', wet=.38)

def journey():
    T = Track(76, 32 * 4)
    prog = ['Cc', 'G/B2', 'Am', 'F', 'C/E', 'F', 'Gc', 'Gc', 'Am', 'F', 'Cc', 'Gc', 'F', 'Gc', 'Cc', 'Cc']
    mel = [('E5', 2), ('G5', 1), ('C6', 1), ('B5', 2), ('G5', 2), ('A5', 1.5), ('G5', .5), ('E5', 2), ('F5', 3), ('A5', 1),
           ('G5', 2), ('E5', 1), ('C5', 1), ('D5', 1), ('E5', 1), ('F5', 1), ('A5', 1), ('G5', 4), (None, 2), ('G5', 1), ('C6', 1),
           ('C6', 2), ('B5', 1), ('A5', 1), ('A5', 2), ('C6', 1), ('F5', 1), ('E5', 2), ('G5', 1), ('E5', 1), ('D5', 4),
           ('F5', 2), ('A5', 1), ('C6', 1), ('B5', 2), ('D5', 1), ('G5', 1), ('E5', 1), ('D5', 1), ('C5', 2), ('C5', 4)]
    for rep in range(2):
        for i, c in enumerate(prog):
            b = (rep * 16 + i) * 4
            T.arp('piano', b, 4, CH[c], step=.5, vel=.28, pattern=[0, 1, 2, 3, 2, 1, 2, 3])
            if rep: T.chord('pad', b, 4, CH[c][1:], .34)
    T.melody('piano', 0, mel, .55)
    T.melody('piano', 64, mel, .5)
    T.melody('strings', 64, mel, .26, octave=-12)
    for k in range(0, 128, 8): T.note('bell', k + 7.5, .5, 'G6' if k % 16 else 'E6', .18)
    T.render('journey', wet=.33)

def memories():
    T = Track(64, 24 * 4)
    prog = ['F', 'Dm', 'Bb', 'C'] * 6
    mel = [('A5', 1), ('C6', 1), ('A5', 1), ('G5', 1), ('F5', 2), ('A5', 2), ('Bb5', 1), ('A5', 1), ('G5', 1), ('F5', 1), ('G5', 3), ('C5', 1),
           ('A5', 1), ('C6', 1), ('D6', 1), ('C6', 1), ('A5', 2), ('F5', 2), ('G5', 1), ('Bb5', 1), ('A5', 1), ('G5', 1), ('C6', 4),
           ('F5', 2), ('E5', 1), ('F5', 1), ('D5', 2), ('A5', 2), ('Bb5', 1.5), ('A5', .5), ('G5', 2), ('F5', 4)]
    for i, c in enumerate(prog):
        T.arp('piano', i * 4, 4, CH[c], step=1, vel=.26, pattern=[0, 2, 3, 2])
        T.chord('pad', i * 4, 4, CH[c][1:], .26 + (i >= 12) * .1)
    T.melody('musicbox', 0, mel, .6)
    T.melody('piano', 48, mel, .5)
    T.melody('strings', 48, mel, .25, octave=-12)
    T.render('memories', wet=.36)

def film():
    T = Track(72, 14 * 4, tail=6)
    prog = ['Bm', 'G', 'D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A', 'F#m', 'Bm', 'G', 'A']
    for i, c in enumerate(prog):
        v = .3 + min(i, 7) * .04 - max(0, i - 8) * .03
        T.arp('harp', i * 4, 4, CH[c], step=.5, vel=.3, pattern=[0, 1, 2, 3, 2, 3, 1, 2])
        T.chord('strings', i * 4, 4, CH[c], v)
        if i < 8: T.note('piano', i * 4, 2, CH[c][0], .35)
    T.chord('strings', 56, 8, ['D3', 'A3', 'D4', 'F#4', 'A4'], .4)
    T.arp('celesta', 56, 6, ['D5', 'F#5', 'A5', 'D6'], step=.5, vel=.3)
    mel = [('F#5', 2), ('A5', 2), ('B5', 3), ('A5', 1), ('F#5', 2), ('E5', 2), ('C#5', 4), ('D5', 2), ('F#5', 2), ('G5', 3), ('F#5', 1), ('A5', 4), ('E5', 4),
           ('B5', 2), ('A5', 1), ('G5', 1), ('F#5', 2), ('E5', 2), ('D5', 2), ('C#5', 2), ('D5', 4), ('E5', 2), ('C#5', 2)]
    T.melody('strings', 0, mel, .5)
    T.melody('celesta', 32, mel[13:], .35)
    T.render('film', wet=.42, fade_out=4)

HB = [('C5', .75), ('C5', .25), ('D5', 1), ('C5', 1), ('F5', 1), ('E5', 2), ('C5', .75), ('C5', .25), ('D5', 1), ('C5', 1), ('G5', 1), ('F5', 2),
      ('C5', .75), ('C5', .25), ('C6', 1), ('A5', 1), ('F5', 1), ('E5', 1), ('D5', 1), ('Bb5', .75), ('Bb5', .25), ('A5', 1), ('F5', 1), ('G5', 1), ('F5', 3)]
HB_CH = [(0, 'F'), (3, 'F'), (6, 'C7'), (9, 'C7'), (12, 'F'), (15, 'F'), (18, 'Bb'), (21, 'F/C'), (24, 'C7'), (27, 'F')]
def wish():
    T = Track(84, 2 * 30 + 6)
    for rep in range(2):
        o = rep * 30 + 1
        T.melody('musicbox', o, HB, .6 - rep * .1, octave=12 * (1 - rep))
        for b, c in HB_CH: T.arp('harp' if rep else 'musicbox', o + b + 1, 3, CH[c], step=1, vel=.22)
        if rep: T.melody('strings', o, HB, .2, octave=-12)
    T.chord('pad', 0, 66, ['F3', 'C4', 'A4'], .18)
    T.render('wish', wet=.42)

def finale():
    T = Track(72, 30 + 96 + 36 + 12, tail=8)
    for b, c in HB_CH: T.chord('pad', b + 1, 3, CH[c][1:], .3); T.arp('piano', b + 1, 3, CH[c], step=1, vel=.25)
    T.melody('piano', 1, HB, .55)
    # modulate into the book theme, now carried by strings, in full bloom
    T.chord('strings', 28, 3, ['D3', 'A3', 'C4', 'F#4'], .35)
    o = 31
    for rep in range(2):
        for i, c in enumerate(BOOK_CH):
            b = o + (rep * 16 + i) * 3
            T.arp('harp', b, 3, CH[c], step=.5, vel=.3, pattern=[0, 1, 2, 3, 2, 1])
            T.chord('strings' if rep else 'pad', b, 3, CH[c][1:], .32)
    T.melody('strings', o, BOOK_MEL, .48)
    T.melody('celesta', o + 48, BOOK_MEL, .45)
    T.melody('piano', o + 48, BOOK_MEL, .3, octave=-12)
    e = o + 96
    for i, c in enumerate(['C', 'D', 'G', 'G']):
        T.chord('strings', e + i * 6, 6, CH[c], .38 - i * .05)
    T.arp('celesta', e + 12, 12, ['G5', 'B5', 'D6', 'G6', 'D6', 'B5'], step=.5, vel=.25)
    T.note('bell', e + 12, 4, 'G6', .3); T.note('bell', e + 18, 4, 'D6', .22)
    T.render('finale', wet=.4, fade_out=6)

# ---------------- sound effects ----------------
def sfx():
    def save(name, y, wet=.25):
        y = np.stack([y, y]) if y.ndim == 1 else y
        ir = reverb_ir(1.6, 9); w = np.stack([fftconvolve(y[0], ir[0])[:y.shape[1]], fftconvolve(y[1], ir[1])[:y.shape[1]]])
        out = y * (1 - wet) + w * wet; out = out / max(1e-6, np.abs(out).max()) * .9
        write('sfx-' + name, out, '96k')
    def noise(sec): return rs.randn(int(SR * sec))
    t = lambda sec: np.arange(int(SR * sec)) / SR
    # wax seal: crack + warm chord shimmer
    y = np.zeros(int(SR * 2.5)); c = noise(.06) * np.exp(-t(.06) / .01); y[:len(c)] += c * .6
    for k, f in enumerate([hz(m('E5')), hz(m('G#5')), hz(m('B5')), hz(m('E6'))]):
        b = bell(f, .3, .5); i = int(SR * (.05 + k * .06)); y[i:i + len(b)] += b[:len(y) - i]
    save('seal', y, .4)
    y = np.zeros(int(SR * 3));
    for k, p in enumerate(['E6', 'B6', 'G#6', 'E7']):
        b = celesta(hz(m(p)), .3, .5); i = int(SR * k * .09); y[i:i + len(b)] += b[:len(y) - i]
    save('chime', y, .45)
    # page turn: band-limited paper swish
    n = noise(.7); b, a = butter(2, [900 / (SR / 2), 6000 / (SR / 2)], 'band'); n = lfilter(b, a, n)
    e = np.sin(np.pi * np.minimum(1, t(.7) / .7)) ** 2 * (1 + .6 * np.sin(t(.7) * 40)); save('page', n * e, .15)
    n = noise(1.2); b, a = butter(2, [300 / (SR / 2), 2500 / (SR / 2)], 'band'); n = lfilter(b, a, n); save('whoosh', n * np.sin(np.pi * t(1.2) / 1.2) ** 2, .3)
    y = np.zeros(int(SR * 2.2))
    for k in range(9):
        b = bell(hz(m('C7') + [0, 4, 7, 11, 12, 16, 19, 23, 24][k]), .1, .3); i = int(SR * k * .045); y[i:i + len(b)] += b[:len(y) - i]
    save('sparkle', y, .5)
    n = noise(1.4); b, a = butter(2, 1400 / (SR / 2)); n = lfilter(b, a, n); e = np.minimum(1, t(1.4) / .08) * np.exp(-t(1.4) / .45); save('blow', n * e, .1)
    # two soft owl hoots
    y = np.zeros(int(SR * 2.2))
    for st, ln in [(.0, .35), (.55, .9)]:
        tt = t(ln); f = 390 * (1 - .06 * tt / ln); s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / ln) ** 1.5
        s += .3 * np.sin(4 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / ln) ** 2; i = int(SR * st); y[i:i + len(s)] += s
    save('owl', y, .5)
    y = noise(.12) * np.exp(-t(.12) / .02) * .4; b = bell(hz(m('A6')), .1, .4); y = np.concatenate([y, np.zeros(len(b))]); y[int(SR * .03):int(SR * .03) + len(b)] += b[:len(y) - int(SR * .03)]
    save('light', y, .4)

if __name__ == '__main__':
    which = sys.argv[1:] or ['sfx', 'prologue', 'book', 'journey', 'memories', 'film', 'wish', 'finale']
    for w in which: globals()[w]()
