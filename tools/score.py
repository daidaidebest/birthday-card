"""The film's original score, composed here as MIDI and performed by real sampled instruments
(MuseScore General SoundFont, MIT) through FluidSynth, then mixed and mastered to seamless loops.

One theme runs through the whole film, "the dream theme" (原创主题), told like a story in pop-ballad language:
the prologue hints at it on celesta, the study plays it on piano and music box, the sand journey turns it into a
light, walking groove, the memories become a ballad, the wild horses a cinematic run, and the finale a full,
joyful pop arrangement. "Happy Birthday to You" (public domain) returns in every chapter.

Needs: fluidsynth, the MuseScore General soundfont (apt: fluidsynth musescore-general-soundfont), ffmpeg,
python: numpy, scipy, mido.   Run: python3 tools/score.py [name ...]  ->  site/assets/audio/<name>.mp3
Tempos that scenes keep time with: journey 116 bpm, 2 bars per city (site/js/scenes/journey.js).
"""
import os, sys, json, random, subprocess, tempfile
import numpy as np, mido
from scipy.io import wavfile

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
          abass=32, fbass=33, violin=40, cello=42, pizz=45, harp=46, strings=48, slowstrings=49, synstr=50, choir=52, oohs=53,
          horn=60, brass=61, clarinet=71, flute=73, recorder=74, whistle=78, warmpad=89, choirpad=91, bowedpad=92, halo=94, sweep=95)

# ---------------------------------------------------------------- chords
QUAL = {'': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10], 'sus4': [0, 5, 7], 'sus2': [0, 2, 7],
        'add9': [0, 4, 7, 14], '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9], '7sus4': [0, 5, 7, 10], 'dim': [0, 3, 6], 'm9': [0, 3, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14]}
def parse(sym):
    """'F#m7/E' -> (root pc, intervals, bass pc)"""
    bass = None
    if '/' in sym: sym, b = sym.split('/'); bass = NOTE[b]
    root = sym[:2] if len(sym) > 1 and sym[1] in '#b' else sym[:1]
    q = sym[len(root):]
    return NOTE[root], QUAL[q], (bass if bass is not None else NOTE[root])
def voicing(sym, lo=52, n=4):
    """Close-position chord tones from `lo` upward (no bass), smoothest for pads and comping."""
    r, iv, _ = parse(sym)
    pcs = sorted({(r + i) % 12 for i in iv})
    out = []; p = lo
    while len(out) < n:
        if p % 12 in pcs: out.append(p)
        p += 1
    return out
def bass_of(sym, lo=36):
    r, iv, b = parse(sym); p = lo + ((b - lo) % 12); return p

# ---------------------------------------------------------------- the song object
class Song:
    def __init__(self, name, bpm, beats=4):
        self.name, self.bpm, self.beats = name, bpm, beats
        self.ev = []; self.chans = {}; self.rng = random.Random(hash(name) % 1000)
        self.tempo_map = [(0, bpm)]
    def spb(self): return 60 / self.bpm
    def bar(self, n): return n * self.beats
    def ch(self, name, prog, vol=100, pan=64, rev=40, cho=0, drums=False):
        if name in self.chans: return name
        idx = 9 if drums else [c for c in range(16) if c != 9 and c not in [v['ch'] for v in self.chans.values()]][0]
        self.chans[name] = dict(ch=idx, prog=GM.get(prog, prog) if not drums else prog, vol=vol, pan=pan, rev=rev, cho=cho)
        return name
    def note(self, ch, beat, dur, pitch, vel=80, human=True):
        if pitch is None: return
        j = self.rng.uniform(-.012, .012) * self.bpm / 60 if human else 0
        v = int(max(1, min(127, vel + (self.rng.randint(-5, 5) if human else 0))))
        self.ev.append((max(0, beat + j), 'on', ch, m(pitch), v)); self.ev.append((max(0, beat + j) + max(.05, dur), 'off', ch, m(pitch), 0))
    def cc(self, ch, beat, ctrl, val): self.ev.append((beat, 'cc', ch, ctrl, int(max(0, min(127, val)))))
    def ramp(self, ch, b0, b1, v0, v1, ctrl=11, steps=24):
        for k in range(steps + 1): self.cc(ch, b0 + (b1 - b0) * k / steps, ctrl, v0 + (v1 - v0) * k / steps)
    def pedal(self, ch, b0, b1): self.cc(ch, b0 + .02, 64, 127); self.cc(ch, b1 - .03, 64, 0)
    def melody(self, ch, start, seq, vel=80, octave=0, legato=1.0):
        b = start
        for it in seq:
            p, d = it[0], it[1]; v = it[2] if len(it) > 2 else vel
            if p is not None: self.note(ch, b, d * legato, m(p) + octave, v)
            b += d
        return b
    def chord(self, ch, beat, dur, notes, vel=70, roll=0.0):
        for i, p in enumerate(notes): self.note(ch, beat + i * roll, dur - i * roll, p, vel)
    def arp(self, ch, beat, dur, notes, step=.5, vel=70, pattern=None, hold=1.6):
        pat = pattern or list(range(len(notes))); k = 0; b = beat
        while b < beat + dur - 1e-6:
            self.note(ch, b, step * hold, notes[pat[k % len(pat)] % len(notes)] + 12 * (pat[k % len(pat)] // len(notes)), vel * (1 if k % len(pat) == 0 else .85)); b += step; k += 1
    def drum(self, beat, key, vel=80): self.note('drums', beat, .1, key, vel)
    # -------- render
    def midi(self, path, total_beats):
        mf = mido.MidiFile(ticks_per_beat=480); tr = mido.MidiTrack(); mf.tracks.append(tr)
        tr.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(self.bpm), time=0))
        msgs = []
        for c in self.chans.values():
            k = c['ch']
            if k != 9: msgs.append((0, 0, mido.Message('program_change', channel=k, program=c['prog'])))
            else: msgs.append((0, 0, mido.Message('program_change', channel=9, program=c['prog'])))
            for ctrl, val in ((7, c['vol']), (10, c['pan']), (91, c['rev']), (93, c['cho']), (11, 127)):
                msgs.append((0, 0, mido.Message('control_change', channel=k, control=ctrl, value=val)))
        order = {'off': 0, 'cc': 1, 'on': 2}
        for b, kind, ch, a, v in self.ev:
            k = self.chans[ch]['ch']; t = int(round(b * 480))
            if kind == 'on': msgs.append((t, order[kind], mido.Message('note_on', channel=k, note=a, velocity=v)))
            elif kind == 'off': msgs.append((t, order[kind], mido.Message('note_off', channel=k, note=a, velocity=0)))
            else: msgs.append((t, order[kind], mido.Message('control_change', channel=k, control=a, value=v)))
        msgs.sort(key=lambda x: (x[0], x[1]))
        now = 0
        for t, _, msg in msgs: msg.time = t - now; now = t; tr.append(msg)
        end = int(total_beats * 480) + 480 * 16
        tr.append(mido.MetaMessage('end_of_track', time=max(0, end - now)))
        mf.save(path)
    def render(self, loop_beats, tail=6.0, gain_db=0.0, loop=True, fade_in=0.0):
        """Renders through FluidSynth; for loops, the reverb tail past the loop point is folded back onto its start."""
        tmp = tempfile.mkdtemp()
        mid, wav = os.path.join(tmp, 's.mid'), os.path.join(tmp, 's.wav')
        self.midi(mid, loop_beats)
        subprocess.run(['fluidsynth', '-ni', '-q', '-g', '0.55', '-r', str(SR), '-o', 'synth.reverb.room-size=0.78', '-o', 'synth.reverb.damp=0.35',
                        '-o', 'synth.reverb.width=1.0', '-o', 'synth.reverb.level=0.85', '-o', 'synth.chorus.active=1', '-o', 'synth.polyphony=512',
                        '-F', wav, SF, mid], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        sr, y = wavfile.read(wav); y = y.astype(np.float64) / 32768.0
        L = int(round(loop_beats * self.spb() * SR))
        if y.shape[0] < L + int(tail * SR): y = np.vstack([y, np.zeros((L + int(tail * SR) - y.shape[0], 2))])
        if loop:
            out = y[:L].copy(); t = y[L:L + int(tail * SR)]; out[:len(t)] += t
        else:
            out = y[:L + int(tail * SR)].copy(); n = int(tail * SR); out[-n:] *= np.linspace(1, 0, n)[:, None] ** 2
        if fade_in: n = int(fade_in * SR); out[:n] *= np.linspace(0, 1, n)[:, None]
        master(self.name, out, gain_db)
        return L / SR

def master(name, out, gain_db=0.0, target=-17.0):
    """Gentle glue (soft-knee peak control), loudness to ~-17 LUFS like a streaming master, MP3."""
    tmp = tempfile.mkdtemp(); wav = os.path.join(tmp, 'm.wav')
    pk = np.abs(out).max() or 1; out = out / pk * .7
    wavfile.write(wav, SR, (out * 32767).astype(np.int16))
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', wav, '-af', f'loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True)
    js = json.loads(r.stderr[r.stderr.rindex('{'):r.stderr.rindex('}') + 1])
    gain = target - float(js['input_i']) + gain_db
    os.makedirs(OUT, exist_ok=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-af', f'volume={gain:.2f}dB,alimiter=limit=0.89:attack=5:release=60:level=false',
                    '-b:a', '128k', os.path.join(OUT, name + '.mp3')], check=True)
    print(f'{name}: {out.shape[0] / SR:.1f}s, gain {gain:+.1f} dB')

# ---------------------------------------------------------------- the dream theme (original)
# 16 bars in D major; (pitch, beats). Phrase A asks, phrase B answers and comes home.
THEME_CH = ['D', 'A/C#', 'Bm', 'G', 'D/F#', 'G', 'Em7', 'A7sus4',
            'D', 'A/C#', 'Bm', 'Bm/A', 'G', 'A', 'D/F#', 'Em7']
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

# Happy Birthday (public domain), 3/4, in F with its pickup; beats.
HB = [('C5', .75), ('C5', .25), ('D5', 1), ('C5', 1), ('F5', 1), ('E5', 2), ('C5', .75), ('C5', .25), ('D5', 1), ('C5', 1), ('G5', 1), ('F5', 2),
      ('C5', .75), ('C5', .25), ('C6', 1), ('A5', 1), ('F5', 1), ('E5', 1), ('D5', 1), ('Bb5', .75), ('Bb5', .25), ('A5', 1), ('F5', 1), ('G5', 1), ('F5', 3)]
HB_CH = ['F', 'C7', 'C7', 'F', 'F', 'Bb', 'F/C', 'C7', 'F']  # one per 3/4 bar after the pickup (bars 1..8) + the last
def hb_bars(): return [(1 + i * 3, c) for i, c in enumerate(HB_CH[:8])]  # beat offsets after a 1-beat pickup

def comp(S, ch, start, chords, beats_per, pattern='pad', vel=62, lo=52, n=4):
    """Accompaniment of a chord list. patterns: pad (held), pulse (8ths), arp (rolling 8ths), ballad (piano: root + rolling hand)."""
    for i, c in enumerate(chords):
        b = start + i * beats_per; v = voicing(c, lo, n)
        if pattern == 'pad': S.chord(ch, b, beats_per * 1.02, v, vel)
        elif pattern == 'pulse':
            for k in range(int(beats_per * 2)): S.chord(ch, b + k * .5, .42, v[1:], vel * (1 if k % 2 == 0 else .78))
        elif pattern == 'arp': S.arp(ch, b, beats_per, v + [v[0] + 12], step=.5, vel=vel, pattern=[0, 1, 2, 3, 4, 3, 2, 1])
        elif pattern == 'ballad':
            S.note(ch, b, beats_per, bass_of(c, 38), vel + 6)
            S.note(ch, b, beats_per, bass_of(c, 38) + 12, vel - 10)
            S.arp(ch, b + .5, beats_per - .5, v, step=.5, vel=vel - 8, pattern=[0, 1, 2, 3, 2, 1, 2])
            S.pedal(ch, b, b + beats_per)
        elif pattern == 'waltz':  # 3/4: bass then two chords
            S.note(ch, b, 1, bass_of(c, 38), vel + 4); S.chord(ch, b + 1, .9, v[1:], vel - 12); S.chord(ch, b + 2, .9, v[1:], vel - 14); S.pedal(ch, b, b + beats_per)
def bassline(S, ch, start, chords, beats_per, style='root', vel=78):
    for i, c in enumerate(chords):
        b = start + i * beats_per; r = bass_of(c, 33)
        if style == 'root': S.note(ch, b, beats_per * .95, r, vel)
        elif style == 'pop':
            S.note(ch, b, 1.4, r, vel); S.note(ch, b + 1.5, .45, r, vel - 12); S.note(ch, b + 2, 1, r + (7 if parse(c)[1][2] == 7 else 0), vel - 6); S.note(ch, b + 3, .9, r + 12, vel - 16)
        elif style == 'walk':
            S.note(ch, b, .9, r, vel); S.note(ch, b + 1, .9, r + 7, vel - 10); S.note(ch, b + 2, .9, r + 12, vel - 8); S.note(ch, b + 3, .9, r + 7, vel - 12)
def groove(S, start, bars, style='pop', vel=70, fill=True):
    """Drums (GM keys): 36 kick, 38 snare, 37 side stick, 39 clap, 42 closed hat, 46 open hat, 49 crash, 70 shaker, 54 tambourine, 81 triangle."""
    for k in range(bars):
        b = start + k * 4
        if style == 'pop':
            for h in range(8): S.drum(b + h * .5, 42, vel * (.62 if h % 2 else .78))
            S.drum(b, 36, vel + 10); S.drum(b + 1.5, 36, vel - 8); S.drum(b + 2, 36, vel + 4)
            S.drum(b + 1, 37, vel - 8); S.drum(b + 3, 37, vel - 4); S.drum(b + 3, 38, vel - 34)
            if fill and k % 4 == 3: S.drum(b + 3.5, 46, vel - 12)
        elif style == 'soft':
            for h in range(8): S.drum(b + h * .5, 70, vel * (.5 if h % 2 else .66))
            S.drum(b, 36, vel - 6); S.drum(b + 2.5, 36, vel - 18); S.drum(b + 1, 37, vel - 16); S.drum(b + 3, 37, vel - 12)
        elif style == 'ballad':
            S.drum(b, 36, vel - 10); S.drum(b + 2, 37, vel - 18); S.drum(b + 3.5, 70, vel - 30)
        elif style == 'drive':
            for h in range(8): S.drum(b + h * .5, 42, vel * (.7 if h % 2 else .85))
            S.drum(b, 36, vel + 12); S.drum(b + .75, 36, vel - 10); S.drum(b + 2, 36, vel + 6); S.drum(b + 2.5, 36, vel - 10)
            S.drum(b + 1, 38, vel); S.drum(b + 3, 38, vel + 4)
            if k % 4 == 3:
                for f in range(4): S.drum(b + 3 + f * .25, [50, 48, 45, 43][f], vel - 6 + f * 3)
def crash(S, beat, vel=78): S.drum(beat, 49, vel)
def swell(S, beat, beats=2, vel=70):
    """A reverse cymbal rising into `beat` (GM 119; its sample peaks 1.32 s after the note starts)."""
    S.ch('revcym', 119, vol=82, pan=64, rev=60)
    lead = 1.32 * S.bpm / 60
    S.note('revcym', beat - lead, lead + .05, 'C4', vel, human=False)
def sparkle(S, ch, beat, notes, vel=60, step=.25):
    for i, p in enumerate(notes): S.note(ch, beat + i * step, 1.5, p, vel - i * 2)

# ================================================================ the pieces
def prologue():
    """Castle and owl, then the letter. Arrival of the letter on bar 5 (~12.6 s); theme on music box while she opens it;
    then Happy Birthday (3/4) as the letter writes itself. 76 bpm."""
    S = Song('prologue', 76)
    for c in [('cel', 'celesta', 92, 40, 70), ('harp', 'harp', 88, 84, 60), ('str', 'slowstrings', 84, 64, 75), ('pad', 'warmpad', 70, 64, 80),
              ('box', 'musicbox', 96, 70, 60), ('pno', 'piano', 92, 60, 55), ('fl', 'flute', 78, 56, 70), ('cello', 'cello', 80, 50, 60)]:
        S.ch(c[0], c[1], vol=c[2], pan=c[3], rev=c[4])
    S.ch('drums', 0, vol=80, drums=True, rev=70)
    intro = ['Bm', 'G', 'D/F#', 'Em7', 'Bm', 'G', 'Asus4', 'A']
    # 1-4: night, mystery and wonder: a rising celesta figure over sustained strings (two chords per bar)
    for i, c in enumerate(intro):
        b = i * 2; v = voicing(c, 50, 4)
        S.chord('str', b, 2.05, v, 58 + i * 3); S.chord('pad', b, 2.05, v[:3], 50)
        S.arp('cel', b, 2, [x + 24 for x in v], step=.25, vel=50 + i * 3, pattern=[0, 2, 1, 3, 2, 0, 3, 1], hold=3)
    S.ramp('str', 0, 16, 70, 118)
    S.note('cello', 0, 8, 'B2', 58); S.note('cello', 8, 8, 'G2', 62)
    swell(S, 16, 3, 72)
    # 5-12: the letter has landed: the dream theme's first phrase on music box, harp rolling underneath
    o = 16
    S.melody('box', o, THEME[:33], 82)
    comp(S, 'harp', o, THEME_CH[:8], 4, 'arp', 54, lo=50)
    comp(S, 'pad', o, THEME_CH[:8], 4, 'pad', 46, lo=54, n=3)
    for i, c in enumerate(THEME_CH[:8]): S.note('cello', o + i * 4, 4, bass_of(c, 38), 60)
    S.melody('fl', o + 16, THEME[16:33], 52, octave=-12)
    crash(S, o, 54)
    # 13-20: Happy Birthday as the letter writes itself (3/4, F up to D: +9 semitones -> D major), piano + celesta + strings
    o = 16 + 32
    S.melody('pno', o, tr(HB, -3), 78); S.melody('cel', o, tr(HB, 9), 46)
    for b, c in hb_bars():
        cc = trc([c], -3)[0]; comp(S, 'pno', o + b, [cc], 3, 'waltz', 56); S.chord('str', o + b, 3.02, voicing(cc, 54, 3), 56)
    S.chord('str', o + 25, 6, voicing('D', 50, 4), 60); S.chord('pno', o + 25, 6, voicing('D', 62, 4), 54, roll=.08)
    sparkle(S, 'cel', o + 25, [m('D6'), m('F#6'), m('A6'), m('D7')], 52)
    total = o + 31
    return S.render(total)

def book():
    """The study and the magic book: the dream theme, intimate, on piano with music box; 72 bpm."""
    S = Song('book', 72)
    S.ch('pno', 'piano', 100, 64, 55); S.ch('box', 'musicbox', 84, 76, 65); S.ch('str', 'strings', 70, 60, 75); S.ch('pad', 'warmpad', 62, 64, 80)
    S.ch('cel', 'celesta', 70, 44, 70); S.ch('bass', 'abass', 70, 64, 30)
    o = 0
    comp(S, 'pno', 0, ['D', 'G', 'D', 'A7sus4'], 4, 'ballad', 58)
    S.melody('cel', 2, [('A5', .5), ('D6', .5), ('F#6', 1)], 44)
    o = 16
    S.melody('pno', o, THEME, 74, octave=0)
    comp(S, 'pno', o, THEME_CH, 4, 'ballad', 52)
    S.melody('box', o + 32, THEME[33:], 58, octave=12)
    comp(S, 'pad', o, THEME_CH, 4, 'pad', 40, lo=54, n=3)
    comp(S, 'str', o + 32, THEME_CH[8:], 4, 'pad', 48, lo=50, n=4); S.ramp('str', o + 32, o + 64, 60, 110)
    bassline(S, 'bass', o + 32, THEME_CH[8:], 4, 'root', 62)
    end = o + 64
    S.chord('pno', end, 4, voicing('Dmaj7', 50, 4), 50, roll=.1)
    return S.render(end + 4)

JOURNEY_BPM = 116
def journey():
    """Two roads of sand: a tender piece in G on the same 116 bpm grid the sand keeps (one city per 2 bars), felt as a
    slow ballad — piano rolling softly, a solo cello singing the theme low and close, then the violins taking it up while
    the strings swell as the two roads draw near, harp and celesta where they cross. No drums: the sand keeps the time."""
    S = Song('journey', JOURNEY_BPM)
    S.ch('pno', 'piano', 98, 60, 58); S.ch('cello', 'cello', 88, 46, 64); S.ch('vln', 'violin', 84, 80, 68)
    S.ch('str', 'slowstrings', 74, 64, 82); S.ch('pad', 'warmpad', 50, 64, 85); S.ch('harp', 'harp', 80, 84, 70); S.ch('cel', 'celesta', 58, 88, 78)
    ch = trc(THEME_CH, 5); TH = tr(THEME, 5)
    # intro (2 bars): the piano alone, the first chord unfolding; the cello breathes in under it
    S.arp('pno', 0, 8, voicing('G', 55, 4) + [m('G5')], step=.5, vel=44, pattern=[0, 2, 1, 3, 2, 4, 3, 1], hold=2.2); S.pedal('pno', 0, 8)
    S.note('cello', 4, 4, 'G2', 42)
    o = 8
    for rep in range(2):
        b0 = o + rep * 64
        for i, c in enumerate(ch):
            b = b0 + i * 4; v = voicing(c, 50, 4)
            S.note('pno', b, 4, bass_of(c, 36), 50 + 4 * rep)
            S.arp('pno', b + .5, 3.5, v, step=.5, vel=38 + 4 * rep, pattern=[0, 1, 2, 3, 2, 1, 2], hold=2.0)
            S.pedal('pno', b, b + 4)
        comp(S, 'str', b0, ch, 4, 'pad', 36 + 12 * rep, lo=52, n=3)
        if rep == 0:
            S.melody('cello', b0, TH, 62, octave=-24, legato=1.03)            # her road and his, told low and close, like a voice
            comp(S, 'pad', b0, ch, 4, 'pad', 30, lo=55, n=3)
            S.ramp('str', b0, b0 + 64, 70, 96)
        else:
            S.melody('vln', b0, TH, 66, octave=-12, legato=1.03)             # the violins take it up as the roads draw near
            for i, c in enumerate(ch): S.note('cello', b0 + i * 4, 4, bass_of(c, 38), 54)
            S.ramp('str', b0, b0 + 48, 96, 124); S.ramp('str', b0 + 56, b0 + 64, 124, 84)
            for k, bb in enumerate((b0 - 1, b0 + 31)):                       # harp glissandi into each half
                for i, q in enumerate(['G4', 'A4', 'B4', 'D5', 'E5', 'G5', 'A5', 'B5', 'D6']): S.note('harp', bb + i * .11, 2.2, q, 44 + i * 2)
            for i, c in enumerate(ch[8:]):                                     # celesta where the two roads cross
                vv = voicing(c, 72, 3); S.note('cel', b0 + 32 + i * 4 + 2, 1.6, vv[-1], 40)
    end = o + 128
    return S.render(end)

def memories():
    """Photographs and her letter: the theme as a slow ballad in F (piano, cello, strings), 64 bpm."""
    S = Song('memories', 64)
    S.ch('pno', 'piano', 104, 64, 60); S.ch('cello', 'cello', 84, 46, 65); S.ch('str', 'slowstrings', 76, 70, 80); S.ch('pad', 'warmpad', 58, 64, 80)
    S.ch('gtr', 'nylon', 70, 30, 55); S.ch('drums', 40, 70, drums=True, rev=55)
    ch = trc(THEME_CH, 3)
    comp(S, 'pno', 0, ['F', 'Bb', 'F/A', 'C7sus4'], 4, 'ballad', 56)
    o = 16
    S.melody('pno', o, tr(THEME, 3), 72)
    comp(S, 'pno', o, ch, 4, 'ballad', 48)
    S.melody('cello', o + 32, tr(THEME[33:], 3), 60, octave=-12)
    comp(S, 'pad', o, ch, 4, 'pad', 40, lo=53, n=3)
    comp(S, 'str', o + 32, ch[8:], 4, 'pad', 50, lo=53, n=4); S.ramp('str', o + 32, o + 64, 50, 112)
    for i, c in enumerate(ch[8:]): S.arp('gtr', o + 32 + i * 4, 4, voicing(c, 52, 4), step=.5, vel=46, pattern=[0, 2, 1, 3, 2, 1])
    groove(S, o + 32, 8, 'ballad', 58)
    o2 = o + 64
    # a second time through, higher and fuller: strings carry it, piano answers
    S.melody('str', o2, tr(THEME, 3), 74, octave=0)
    S.melody('pno', o2, tr(THEME, 3), 56, octave=12)
    comp(S, 'pno', o2, ch, 4, 'ballad', 50); comp(S, 'pad', o2, ch, 4, 'pad', 42, lo=53, n=3)
    for i, c in enumerate(ch): S.note('cello', o2 + i * 4, 4, bass_of(c, 36), 62)
    groove(S, o2, 16, 'ballad', 62)
    end = o2 + 64
    S.chord('pno', end, 4, voicing('Fmaj7', 50, 4), 50, roll=.12)
    return S.render(end + 4)

def film():
    """Wild horses (driving, E minor -> G), then the savanna at sunset into night (wide strings, horn), and the star
    falling on the first notes of Happy Birthday. 96 bpm."""
    S = Song('film', 96)
    S.ch('str', 'strings', 96, 64, 60); S.ch('cello', 'cello', 92, 44, 55); S.ch('horn', 'horn', 82, 72, 70); S.ch('pno', 'piano', 86, 60, 50)
    S.ch('tim', 'pizz', 70, 84, 40); S.ch('cel', 'celesta', 70, 40, 80); S.ch('choir', 'oohs', 64, 64, 85); S.ch('fl', 'flute', 76, 56, 70)
    S.ch('drums', 0, 86, drums=True, rev=45)
    run = ['Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D/F#', 'C', 'D', 'Bm', 'Em', 'C', 'D', 'G', 'G']
    # galloping ostinato: cellos in 16ths-ish 'da-da-dum', strings sustain, toms
    for i, c in enumerate(run):
        b = i * 4; r = bass_of(c, 40)
        for k in range(4):
            S.note('cello', b + k, .22, r, 74); S.note('cello', b + k + .25, .22, r, 62); S.note('cello', b + k + .5, .45, r + 12, 70)
        S.chord('str', b, 4.02, voicing(c, 52, 4), 66 + min(i, 8) * 3)
        if i >= 4: S.chord('pno', b, .5, voicing(c, 64, 3), 60); S.chord('pno', b + 2.5, .5, voicing(c, 64, 3), 54)
    groove(S, 8, 14, 'drive', 70)
    S.ramp('str', 0, 32, 70, 120)
    # the theme, heroic, on horn then strings, in G (+5 from D)
    S.melody('horn', 16, tr(THEME[:33], 5), 78, octave=-12)
    S.melody('str', 32, tr(THEME[16:33], 5), 80)
    crash(S, 16, 80); crash(S, 48, 84)
    # 17-28: the savanna, sunset into night: half-time, wide and calm
    o = 64
    sav = ['G', 'D/F#', 'Em7', 'Cmaj7', 'G', 'D/F#', 'C', 'D']
    for i, c in enumerate(sav):
        b = o + i * 4
        S.chord('str', b, 4.05, voicing(c, 50, 5), 60); S.note('cello', b, 4, bass_of(c, 36), 62)
        S.chord('choir', b, 4.05, voicing(c, 60, 3), 46 + i * 2)
        S.arp('cel', b, 4, [x + 12 for x in voicing(c, 64, 4)], step=.5, vel=40, pattern=[0, 2, 1, 3])
    S.melody('fl', o + 4, tr(THEME[:16], 5), 60)
    S.melody('horn', o + 16, tr(THEME[16:33], 5), 62, octave=-12)
    # the stars gather into a heart... and the brightest falls: Happy Birthday's first line on celesta, slow
    o2 = o + 32
    S.chord('str', o2, 8, voicing('Gmaj7', 50, 5), 56); S.chord('choir', o2, 8, voicing('G', 60, 3), 50)
    S.melody('cel', o2 + 1, [(m(p) + 2 + 12, d * 1.5) for p, d in HB[:6]], 66)
    S.chord('str', o2 + 8, 6, voicing('G', 50, 4), 50)
    sparkle(S, 'cel', o2 + 8.5, [m('G6'), m('B6'), m('D7'), m('G7')], 56)
    return S.render(o2 + 16, tail=7, loop=False)

def wish():
    """The candles: Happy Birthday on a music box, then harp and strings, tender, in F; 84 bpm (3/4)."""
    S = Song('wish', 84, 3)
    S.ch('box', 'musicbox', 96, 64, 65); S.ch('harp', 'harp', 82, 84, 65); S.ch('str', 'slowstrings', 72, 56, 80); S.ch('pad', 'warmpad', 56, 64, 85)
    S.ch('cel', 'celesta', 64, 40, 75)
    for rep in range(2):
        o = rep * 27
        S.melody('box', o, HB, 74 - rep * 8, octave=12 * (1 - rep))
        if rep: S.melody('cel', o, HB, 46, octave=12); S.melody('str', o, HB, 46, octave=-12)
        for b, c in hb_bars():
            v = voicing(c, 53, 4)
            S.arp('harp' if rep else 'box', o + b, 3, v, step=1 if not rep else .5, vel=46, pattern=[0, 1, 2, 3, 2, 1])
            S.chord('pad', o + b, 3.02, v[:3], 38)
    S.chord('str', 54, 6, voicing('F', 50, 4), 46)
    return S.render(60)

def finale():
    """After the wish: the dream theme, romantic and unhurried, in D (piano and strings, a soft brushed pulse in the
    second chorus), then Happy Birthday sung by strings and voices, then a lift to E for the last chorus and the
    credits. 92 bpm."""
    S = Song('finale', 92)
    S.ch('pno', 'piano', 104, 60, 60); S.ch('bass', 'abass', 80, 64, 35); S.ch('gtr', 'nylon', 64, 34, 55); S.ch('str', 'strings', 88, 70, 75)
    S.ch('cel', 'celesta', 62, 80, 75); S.ch('cello', 'cello', 82, 46, 60); S.ch('pad', 'warmpad', 52, 64, 85); S.ch('choir', 'oohs', 62, 64, 85)
    S.ch('drums', 40, 78, drums=True, rev=55)
    # intro: piano alone, the hook remembered
    comp(S, 'pno', 0, ['D', 'A/C#', 'Bm', 'G'], 4, 'ballad', 56)
    S.melody('cel', 4, THEME[:9], 46, octave=12)
    def chorus(o, semis, big):
        ch = trc(THEME_CH, semis)
        S.melody('pno', o, tr(THEME, semis), 80)
        comp(S, 'pno', o, ch, 4, 'ballad', 48)
        comp(S, 'pad', o, ch, 4, 'pad', 38, lo=54, n=3)
        if big:
            S.melody('str', o, tr(THEME, semis), 64, octave=-12); S.melody('choir', o + 32, tr(THEME[33:], semis), 46, octave=-12)
            comp(S, 'str', o, ch, 4, 'pad', 46, lo=50, n=4)
            for i, c in enumerate(ch): S.arp('gtr', o + i * 4, 4, voicing(c, 52, 4), step=.5, vel=44, pattern=[0, 2, 1, 3, 2, 1])
            bassline(S, 'bass', o, ch, 4, 'root', 66)
            groove(S, o + 16, 12, 'ballad', 60)
        else:
            S.melody('cello', o + 32, tr(THEME[33:], semis), 56, octave=-12)
            for i, c in enumerate(ch[8:]): S.note('cello', o + 32 + i * 4, 4, bass_of(c, 36), 54)
    chorus(16, 0, False)
    chorus(80, 0, True)
    # Happy Birthday, carried by strings and voices (3/4 in D)
    o = 144
    S.melody('str', o, tr(HB, -3), 74); S.melody('cel', o, tr(HB, -3), 48, octave=12); S.melody('choir', o, tr(HB, -3), 52, octave=-12)
    for b, c in hb_bars():
        cc = trc([c], -3)[0]; v = voicing(cc, 52, 4)
        comp(S, 'pno', o + b, [cc], 3, 'waltz', 50); S.note('cello', o + b, 2.9, bass_of(cc, 36), 60)
    S.chord('str', o + 25, 6, voicing('D', 50, 5), 62); S.chord('pno', o + 25, 6, voicing('Dmaj7', 50, 5), 58, roll=.08)
    # lift to E: the last chorus, for the credits
    o2 = o + 31
    swell(S, o2, 2, 56)
    chorus(o2, 2, True)
    end = o2 + 64
    S.chord('pno', end, 8, voicing('Emaj9', 48, 5), 54, roll=.12); S.chord('str', end, 8, voicing('E', 48, 5), 52)
    sparkle(S, 'cel', end + .5, [m('E6'), m('G#6'), m('B6'), m('E7')], 50, step=.35)
    return S.render(end + 8, tail=8, loop=False)

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
    names = sys.argv[1:] or list(PIECES) + ['sfx']
    for n in names:
        if n == 'sfx': [f() for f in SFX.values()]
        else: PIECES[n]()
