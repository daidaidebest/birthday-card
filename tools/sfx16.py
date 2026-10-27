"""v16 sound effects and ambient beds, original and synthesized here (soft instruments from the MuseScore General
SoundFont through FluidSynth, everything else from shaped noise).
Gentle tap and light sounds instead of bright 'dings'; paper, wings, small-dog sounds; distant fireworks (the page adds
stereo position and reverb); two ambient beds played at ~15% under the music: a night breeze, a crackling hearth.
Run: ~/projects/render-workspace/scratch/venv/bin/python tools/sfx16.py [name ...]  ->  site/assets/audio/"""
import os, sys, subprocess, tempfile
import numpy as np, mido
from scipy.io import wavfile
from scipy.signal import butter, lfilter, sosfilt, fftconvolve

SR = 44100
SF = '/usr/share/sounds/sf3/MuseScore_General.sf3'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'assets', 'audio')
rs = np.random.RandomState(16)
t_ = lambda sec: np.arange(int(SR * sec)) / SR
def noise(sec): return rs.randn(int(SR * sec))
def bp(y, lo, hi, order=2): return sosfilt(butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band', output='sos'), y, axis=0)
def lp(y, f, order=2): return sosfilt(butter(order, f / (SR / 2), output='sos'), y, axis=0)
def hp(y, f, order=2): return sosfilt(butter(order, f / (SR / 2), 'high', output='sos'), y, axis=0)
def m(n):
    names = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}; k = names[n[0]]; i = 1
    if n[1] in '#b': k += 1 if n[1] == '#' else -1; i = 2
    return 12 * (int(n[i:]) + 1) + k
def ir(sec=2.2, decay=3.2, seed=3, hf=5000):
    r = np.random.RandomState(seed); n = int(SR * sec); e = np.exp(-np.arange(n) / SR * decay)
    y = np.stack([lp(r.randn(n), hf) * e, lp(r.randn(n), hf) * e], 1); y[:int(SR * .012)] *= np.linspace(0, 1, int(SR * .012))[:, None]
    return y / np.abs(y).sum(0).max() * 40
def reverb(y, wet=.3, sec=2.2, decay=3.2, hf=5000):
    y = np.stack([y, y], 1) if y.ndim == 1 else y; h = ir(sec, decay, hf=hf)
    w = np.stack([fftconvolve(y[:, 0], h[:, 0])[:len(y)], fftconvolve(y[:, 1], h[:, 1])[:len(y)]], 1)
    return y * (1 - wet) + w * wet
def fade(y, a=.005, b=.08):
    n = len(y); ia, ib = int(SR * a), int(SR * b)
    e = np.ones(n); e[:ia] = np.linspace(0, 1, ia) if ia else 1; e[n - ib:] = np.linspace(1, 0, ib) ** 2 if ib else 1
    return y * (e[:, None] if y.ndim == 2 else e)
def write(name, y, peak=.8, rate='96k'):
    y = np.stack([y, y], 1) if y.ndim == 1 else y
    y = y / (np.abs(y).max() or 1) * peak
    wav = os.path.join(tempfile.mkdtemp(), 'a.wav'); wavfile.write(wav, SR, (y * 32767).astype(np.int16))
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-b:a', rate, os.path.join(OUT, name + '.mp3')], check=True)
    print(name, f'{len(y) / SR:.2f}s')

def sf(notes, sec, extra=None):
    """Render notes [(start_sec, dur_sec, midi, vel, program)] through FluidSynth with its own (soft) reverb."""
    mf = mido.MidiFile(ticks_per_beat=480); tr = mido.MidiTrack(); mf.tracks.append(tr)
    tr.append(mido.MetaMessage('set_tempo', tempo=500000, time=0))
    progs = sorted({n[4] for n in notes}); chan = {p: i for i, p in enumerate(progs)}; ev = []
    for p, c in chan.items():
        ev.append((0, 0, mido.Message('program_change', channel=c, program=p)))
        for ctrl, val in ((7, 100), (91, 50), (93, 0)): ev.append((0, 0, mido.Message('control_change', channel=c, control=ctrl, value=val)))
    for (st, d, k, v, p) in notes:
        ev.append((int(st * 960), 2, mido.Message('note_on', channel=chan[p], note=k, velocity=v)))
        ev.append((int((st + d) * 960), 1, mido.Message('note_off', channel=chan[p], note=k, velocity=0)))
    ev.sort(key=lambda e: (e[0], e[1])); now = 0
    for tt, _, msg in ev: msg.time = tt - now; now = tt; tr.append(msg)
    tr.append(mido.MetaMessage('end_of_track', time=int(sec * 960)))
    d = tempfile.mkdtemp(); mf.save(d + '/a.mid')
    subprocess.run(['fluidsynth', '-ni', '-q', '-g', '0.6', '-r', str(SR), '-o', 'synth.reverb.room-size=0.7', '-o', 'synth.reverb.level=0.7', '-F', d + '/a.wav', SF, d + '/a.mid'],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    _, y = wavfile.read(d + '/a.wav'); y = y.astype(float) / 32768; n = int(SR * sec)
    return np.vstack([y, np.zeros((max(0, n - len(y)), 2))])[:n]
HARP, CEL, BOX, PIANO, VIB, PAD = 46, 8, 10, 0, 11, 89

# ------------------------------------------------------------------ soft feedback
def chime():
    """Chapter cards, the letter landing: a low harp dyad that blooms, a whisper of celesta an octave up, no sharp attack."""
    y = sf([(0, 2.5, m('D5'), 48, HARP), (.09, 2.5, m('A5'), 40, HARP), (.32, 2.2, m('F#5'), 34, CEL)], 3.2)
    write('sfx-chime', fade(lp(reverb(y, .35, 2.6), 5200), .025, .9), .55)
def light():
    """A candle catching / a touch that brings light: the soft breath of a flame and a warm glass tone, felt more than heard."""
    n = len(t_(1.6)); breath = lp(noise(1.6), 900) * np.minimum(1, t_(1.6) / .05) * np.exp(-t_(1.6) / .18) * .5
    tone = sf([(0.02, 1.4, m('E5'), 34, VIB), (0.02, 1.2, m('B5'), 22, CEL)], 1.6)
    y = np.stack([breath, breath], 1) + tone * 1.4
    write('sfx-light', fade(lp(reverb(y, .3, 2.0), 4200), .012, .5), .5)
def sparkle():
    """Something opening into light: a slow, low harp arpeggio settling on a music-box note."""
    ns = [(i * .085, 2.2, m(p), 44 - i * 2, HARP) for i, p in enumerate(['D5', 'F#5', 'A5', 'D6', 'F#6'])] + [(.5, 1.8, m('A6'), 26, BOX)]
    write('sfx-sparkle', fade(lp(reverb(sf(ns, 2.8), .35, 2.4), 6500), .025, .8), .5)
def tap():
    """Buttons: a muted, woody tick, very short."""
    tt = t_(.35); y = np.sin(2 * np.pi * 523 * tt) * np.exp(-tt / .05) + .4 * np.sin(2 * np.pi * 784 * tt) * np.exp(-tt / .03)
    y = lp(y * np.minimum(1, tt / .004), 2500) + lp(noise(.35), 1800) * np.exp(-tt / .008) * .15
    write('sfx-tap', fade(reverb(y, .18, 1.2), .002, .1), .35)
def seal():
    """Opening the envelope: paper giving way and a soft harp glissando up."""
    ns = [(i * .075, 2, m(p), 42 + i, HARP) for i, p in enumerate(['D4', 'F#4', 'A4', 'D5', 'E5', 'F#5', 'A5', 'B5', 'D6'])] + [(.85, 1.8, m('F#6'), 26, CEL)]
    y = sf(ns, 3.0) * 1.3; y[:len(y)] += _rustle(3.0, .6)
    write('sfx-seal', fade(lp(reverb(y, .3, 2.4), 6000), .01, .8), .55)
def _rustle(sec, amt=1.0, seed=7):
    r = np.random.RandomState(seed); n = int(SR * sec); y = np.zeros(n)
    k = 0
    while k < n:   # grains of crinkle: short bursts of band-passed noise, bunched
        L = int(SR * r.uniform(.004, .03)); g = r.randn(L) * np.hanning(L) * r.uniform(.2, 1) * np.exp(-k / SR * 1.5)
        if k + L < n: y[k:k + L] += g
        k += int(SR * r.exponential(.012 if (k / SR) % .7 < .45 else .05))
    y = bp(y, 1200, 7500) + bp(r.randn(n), 500, 3000) * .08 * np.exp(-np.arange(n) / SR * 2)
    y *= np.minimum(1, np.arange(n) / (SR * .03))
    return np.stack([y, np.roll(y, 90)], 1) * amt
def rustle(): write('sfx-rustle', fade(reverb(_rustle(1.4), .15, 1.2), .005, .3), .45)
def page():
    """A page turning: a soft swish of paper."""
    tt = t_(.75); y = bp(noise(.75), 700, 5000) * np.sin(np.pi * np.minimum(1, tt / .75)) ** 2 * (1 + .5 * np.sin(tt * 38))
    write('sfx-page', fade(reverb(y + _rustle(.75, .25, 3)[:, 0], .15, 1.0), .01, .2), .4)
def whoosh():
    tt = t_(1.3); y = bp(noise(1.3), 250, 1800) * np.sin(np.pi * tt / 1.3) ** 2.2
    write('sfx-whoosh', fade(reverb(y, .25, 1.6), .02, .3), .35)
def wings():
    """The owl going by: a few deep, soft wingbeats, quieter as she leaves (owls are almost silent)."""
    y = np.zeros(int(SR * 3.2))
    for k, (at, a) in enumerate([(.05, .7), (.6, 1), (1.15, .9), (1.7, .55), (2.3, .3)]):
        L = int(SR * .34); e = np.sin(np.pi * np.arange(L) / L) ** 3; i = int(SR * at)
        g = bp(noise(.34), 120, 900) * e * a + bp(noise(.34), 900, 2600) * e * a * .12
        y[i:i + L] += g
    write('sfx-wings', fade(reverb(np.stack([y, np.roll(y, 200)], 1), .3, 2.0), .02, .4), .4)
def blow():
    tt = t_(1.4); y = lp(noise(1.4), 1300) * np.minimum(1, tt / .06) * np.exp(-tt / .42)
    write('sfx-blow', fade(reverb(y, .12, 1.0), .005, .3), .5)

# ------------------------------------------------------------------ the teddies
def _bark(f0=560, rise=180, dur=.16, seed=1):
    """A small dog's soft 'arf': a pitched chirp with a nasal formant, breathy, rounded off."""
    r = np.random.RandomState(seed); tt = t_(dur); u = tt / dur
    f = f0 + rise * np.sin(np.clip(u / .35, 0, 1) * np.pi / 2) - rise * 1.3 * np.clip((u - .35) / .65, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * (1 + .01 * r.randn(len(f)))) / SR
    y = sum(np.sin(k * ph) * a for k, a in [(1, 1), (2, .65), (3, .4), (4, .2), (5, .1), (6, .05)])
    y = bp(y, 450, 2600) + bp(r.randn(len(tt)), 900, 4000) * .12
    env = np.minimum(1, tt / .012) * np.exp(-np.clip(tt - .04, 0, None) * 16)
    return y * env
def barks():
    for i, (f0, rise, d) in enumerate([(560, 170, .16), (640, 210, .14)]):
        y = np.concatenate([_bark(f0, rise, d, i), np.zeros(int(SR * .1)), _bark(f0 * 1.06, rise, d * .9, i + 5) * .8 if i == 1 else np.zeros(0), np.zeros(int(SR * .25))])
        write(f'sfx-bark{i + 1}', fade(lp(reverb(y, .12, .9), 4500), .002, .15), .5)
    y = np.concatenate([_bark(820, 380, .2, 9), np.zeros(int(SR * .25))])   # the old happy yip, softened
    write('sfx-yip', fade(lp(reverb(y, .12, .9), 4200), .002, .15), .45)
def patter():
    """Little paws running on a wooden floor: soft, quick, irregular taps."""
    y = np.zeros(int(SR * 1.8)); r = np.random.RandomState(4); at = .02
    while at < 1.6:
        L = int(SR * .025); g = lp(r.randn(L), 1800) * np.exp(-np.arange(L) / (SR * .004)) * r.uniform(.4, 1) + np.sin(2 * np.pi * r.uniform(180, 260) * np.arange(L) / SR) * np.exp(-np.arange(L) / (SR * .006)) * .5
        i = int(SR * at); y[i:i + L] += g; at += r.choice([.055, .07, .09]) * r.uniform(.85, 1.2)
    y *= np.minimum(1, t_(1.8) / .15) * np.clip((1.8 - t_(1.8)) / .4, 0, 1)
    write('sfx-patter', fade(reverb(y, .18, 1.0), .002, .2), .4)
def wag():
    """A happy tail: three soft brushy swishes."""
    y = np.zeros(int(SR * 1.0))
    for k in range(4):
        L = int(SR * .13); i = int(SR * (.03 + k * .19)); y[i:i + L] += bp(noise(.13), 600, 4000) * np.sin(np.pi * np.arange(L) / L) ** 2 * (1 - k * .15)
    write('sfx-wag', fade(reverb(y, .1, .8), .002, .1), .3)
def sneeze():
    """A teddy's tiny sneeze, 'pf-chu': a breathy burst through a nasal 'u' (no hiss, no click), with a soft puff after."""
    r = np.random.RandomState(12); tt = t_(.45)
    chu = (bp(r.randn(len(tt)), 700, 3000) + bp(r.randn(len(tt)), 1000, 1400, 1) * 1.6) * np.minimum(1, tt / .018) * np.exp(-tt / .075)
    puff = lp(r.randn(len(tt)), 900) * np.exp(-np.clip(tt - .09, 0, None) / .08) * (tt > .09) * .35
    write('sfx-sneeze', fade(reverb(lp(chu + puff, 4200), .12, .8), .002, .12), .3)

# ------------------------------------------------------------------ fireworks far away (dry: the page pans them and adds space)
def fireworks():
    tt = t_(1.5); f = 500 + 900 * (tt / 1.5) ** 1.5
    y = bp(noise(1.5), 300, 3000) * (tt / 1.5) ** 1.2 * np.exp(-np.clip(tt - 1.2, 0, None) * 12) * .5
    y += np.sin(2 * np.pi * np.cumsum(f) / SR) * .04 * (tt / 1.5)        # the faintest rising whistle
    write('fw-launch', fade(lp(y, 3500), .05, .1), .3)
    for k in range(2):
        r = np.random.RandomState(20 + k); n = int(SR * 3.4); tt = np.arange(n) / SR
        boom = lp(r.randn(n), 160, 4) * np.minimum(1, tt / .012) * np.exp(-tt / (.32 + .1 * k)) * 3.2
        boom += np.sin(2 * np.pi * (48 + 20 * np.exp(-tt * 10)) * tt) * np.exp(-tt * 5) * .6
        crack = np.zeros(n)
        for _ in range(110 + 40 * k):
            at = int(SR * (.25 + r.rand() ** 1.4 * 2.6)); L = int(SR * r.uniform(.003, .012))
            if at + L < n: crack[at:at + L] += r.randn(L) * np.exp(-np.arange(L) / (L / 4)) * r.uniform(.2, 1) * np.exp(-(at / SR) * .7)
        crack = bp(crack, 1200, 7000) * 1.4
        y = lp(boom, 900) + crack
        write(f'fw-burst{k + 1}', fade(y, .002, .6), .6)

# ------------------------------------------------------------------ ambient beds (the page loops them with long crossfades)
def bed_wind(sec=32):
    """A night breeze over water and pines: two bands of soft noise that swell in slow gusts, wide in stereo."""
    n = int(SR * sec); tt = np.arange(n) / SR; out = []
    for ch in range(2):
        r = np.random.RandomState(40 + ch)
        g = .55 + .3 * np.sin(2 * np.pi * tt / 11 + ch) + .2 * np.sin(2 * np.pi * tt / 4.7 + 1.3 * ch) + .12 * np.sin(2 * np.pi * tt / 2.1 + ch * 2)
        low = lp(np.cumsum(r.randn(n)) * .02, 300) * 1.2
        mid = bp(r.randn(n), 260, 1100) * .35
        hiss = bp(r.randn(n), 2500, 7000) * .05 * (g ** 2)
        y = (low + mid) * g + hiss
        y -= lp(y, 30)   # no DC wander
        out.append(y)
    y = np.stack(out, 1); write('amb-wind', fade(y, 1.5, 1.5), .5, '80k')
def bed_fire(sec=30):
    """A hearth: the low breath of the flames, a soft hiss, and crackles and the odd pop of embers, scattered in stereo."""
    n = int(SR * sec); tt = np.arange(n) / SR; r = np.random.RandomState(8)
    breath = lp(r.randn(n), 220, 3) * (1 + .35 * np.sin(2 * np.pi * tt / 3.3) + .2 * np.sin(2 * np.pi * tt / 1.3)) * 1.6
    hiss = bp(r.randn(n), 2200, 8000) * .06 * (1 + .4 * np.sin(2 * np.pi * tt / 2.7))
    L_, R_ = breath + hiss, breath * .95 + hiss
    L_ = L_.copy(); R_ = R_.copy(); at = 0.0
    while at < sec - .1:
        big = r.rand() < .06; ln = int(SR * (r.uniform(.006, .02) if big else r.uniform(.0015, .006)))
        fc = r.uniform(900, 2600) if big else r.uniform(1800, 6000)
        g = bp(r.randn(ln * 3), fc * .6, min(fc * 1.6, 15000))[:ln] * np.exp(-np.arange(ln) / (ln / 3)) * (r.uniform(.6, 1.4) if big else r.uniform(.15, .7))
        i = int(SR * at); pan = r.uniform(-.8, .8)
        if i + ln < n: L_[i:i + ln] += g * (1 - pan) * .8; R_[i:i + ln] += g * (1 + pan) * .8
        at += r.exponential(.09) if r.rand() < .8 else r.exponential(.5)   # crackles come in little bursts
    y = np.stack([L_, R_], 1); y -= lp(y, 25)
    write('amb-fire', fade(reverb(y, .12, 1.0, 4, 6000), 1.5, 1.5), .55, '96k')

ALL = dict(chime=chime, light=light, sparkle=sparkle, tap=tap, seal=seal, rustle=rustle, page=page, whoosh=whoosh, wings=wings, blow=blow,
           barks=barks, patter=patter, wag=wag, sneeze=sneeze, fireworks=fireworks, wind=bed_wind, fire=bed_fire)
if __name__ == '__main__':
    for k in (sys.argv[1:] or ALL): ALL[k]()
