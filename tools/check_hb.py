"""Happy Birthday leak check: the birthday tune is kept for the last chapter. This scans every note the score composes
(tools/score.py: each cue's channels, stems and sections, each chapter's closing cadence) and every stinger the page can
play (js/audio.js KINDS, evaluated in node against every chord of every cue and cadence as tools/score.py composes it,
with the phrases score.py writes to js/score-map.js, including the melodies that build up across repeated hits: the
stars, the candles, the photographs, every random walk of the stardust), and fails if a fragment of Happy Birthday
occurs anywhere outside the final chapter's material. (It reads the composition, not the rendered files: run it before
rendering; it also warns when js/score-map.js is stale.)

A fragment is 4 consecutive intervals of the tune (5 notes), in any key, rhythm or octave: matched on exact intervals and
on intervals with repeated notes merged ("Hap-py" sung as one note), anywhere in the tune (across its line ends too); and,
within each of its four lines, on intervals folded into an octave (a note of the fragment displaced by an octave).

Allowed (the final chapter, 'wish'): the wish cue from its 'song' section on, the finale, their cadences, and the
stingers only the final chapter plays (candle, wish, burst, stamp). Everything else must be clean, including the wish
cue's opening 'glow' (the tune is first heard from the candles she lights, then formally in the 'song').

It also warns (without failing) about the incipit's three-interval core outside the last chapter: 5-6-5-1' or 5-6-5-2'
(+2 -2 +5 / +2 -2 +7), on its own the most recognisable shape of the tune.

Run: python3 tools/check_hb.py [-v]      exit status 1 when a fragment leaks.
"""
import importlib.util, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__)); SITE = os.path.join(os.path.dirname(HERE), 'site')
spec = importlib.util.spec_from_file_location('score', os.path.join(HERE, 'score.py')); score = importlib.util.module_from_spec(spec); spec.loader.exec_module(score)
VERBOSE = '-v' in sys.argv

# Happy Birthday (Hill sisters, public domain) in C, the whole tune, pitches only
TUNE = [score.m(p) for p in 'G4 G4 A4 G4 C5 B4 G4 G4 A4 G4 D5 C5 G4 G4 G5 E5 C5 B4 A4 F5 F5 E5 C5 D5 C5'.split()]
N = 4   # intervals per fragment
def ivs(ps): return [b - a for a, b in zip(ps, ps[1:])]
def merged(ps): return [p for i, p in enumerate(ps) if i == 0 or p != ps[i - 1]]
def fold(i): return (i + 6) % 12 - 6 if i % 12 else 0
def windows(seq): return {tuple(seq[k:k + N]) for k in range(len(seq) - N + 1)}
MODES = {'exact': (lambda ps: ivs(ps)), 'merged': (lambda ps: ivs(merged(ps))), 'folded': (lambda ps: [fold(i) for i in ivs(merged(ps))])}
REF = {k: windows(f(TUNE)) for k, f in MODES.items()}
LINES = [TUNE[0:6], TUNE[6:12], TUNE[12:19], TUNE[19:25]]   # (each with its pickup)
REF['folded'] = set().union(*(windows([fold(i) for i in ivs(merged(l))]) for l in LINES))

CORE = {(2, -2, 5), (2, -2, 7)}
def core(ps):
    q = merged(ps); iv = ivs(q)
    return [(k, q[k:k + 4]) for k in range(len(iv) - 2) if tuple(iv[k:k + 3]) in CORE]
WARN = []
def find(ps, where=None):
    if where: WARN.extend((where, c) for _, c in core(ps))
    """[(mode, start index, notes)] of tune fragments in a pitch sequence"""
    hits = []
    for mode, f in MODES.items():
        src = ps if mode == 'exact' else merged(ps); seq = f(ps)
        for k in range(len(seq) - N + 1):
            if tuple(seq[k:k + N]) in REF[mode]: hits.append((mode, k, src[k:k + N + 1]))
    return hits
NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
def nm(p): return f'{NAMES[p % 12]}{p // 12 - 1}'

# ---------------------------------------------------------------- the composed score
def lines(notes, gap=6.0, tol=.05):
    """monophonic readings of a channel's notes [(beat, end, pitch)]: its top line and its bottom line (simultaneous
    notes grouped), each split where it rests longer than `gap` beats"""
    notes = sorted(notes); groups = []
    for b, e, p in notes:
        if groups and b - groups[-1][0] <= tol: groups[-1][1].append(p); groups[-1][2] = max(groups[-1][2], e)
        else: groups.append([b, [p], e])
    out = []
    for pick in (max, min):
        cur = []; last_end = None
        for b, ps, e in groups:
            if cur and b - last_end > gap: out.append(cur); cur = []
            cur.append((b, pick(ps))); last_end = max(last_end or e, e) if cur[:-1] else e
        if cur: out.append(cur)
    return out
def regions(S, beats):
    """[(name, b0, b1)] of a cue: its sections (or the finale's parts) in score order"""
    M = S.meta
    if M.get('parts'): return [(p, b0, b1) for p, b0, b1, _ in M['parts']]
    cuts = sorted({0.0} | {float(v[0]) - float(v[1]) for v in M.get('sections', {}).values()})
    names = {float(v[0]) - float(v[1]): k for k, v in M.get('sections', {}).items()}
    return [(names.get(a, 'start'), a, b) for a, b in zip(cuts, cuts[1:] + [float(beats)])]
def allowed_cue(cue, region):
    if cue in ('finale', 'wish.end', 'finale.end'): return True
    if cue == 'wish': return region not in ('start', 'glow')
    return False
def scan_song(cue, S, beats, report):
    notes = {}
    for e in S.ev:
        if e[1] == 'n': notes.setdefault(e[2], []).append((e[0], e[5], e[3]))
    stems = S.meta.get('stems', {})
    groups = {f'ch:{c}': v for c, v in notes.items()}
    for st, chans in stems.items(): groups[f'stem:{st}'] = [n for c in chans for n in notes.get(c, [])]   # (a melody handed between instruments)
    regs = regions(S, beats) if beats else [('all', 0, 1e9)]
    for g, ns in groups.items():
        for line in lines(ns):
            ps = [p for _, p in line]
            mi = [i for i, p in enumerate(ps) if i == 0 or p != ps[i - 1]]
            region = lambda b: next((r for r, b0, b1 in regs if b0 - 1e-6 <= b < b1 - 1e-6), regs[-1][0])
            for k, c in core(ps):
                b = line[mi[k]][0]
                if not allowed_cue(cue, region(b)): WARN.append((f'{cue}/{region(b)} {g} beat {b:.1f}', c))
            for mode, k, frag in find(ps):
                b = line[k][0] if mode == 'exact' else line[[i for i, p in enumerate(ps) if i == 0 or p != ps[i - 1]][k]][0]
                reg = next((r for r, b0, b1 in regs if b0 - 1e-6 <= b < b1 - 1e-6), regs[-1][0])
                report.append(dict(where=f'{cue}/{reg}', what=g, beat=round(b, 2), mode=mode, notes=' '.join(map(nm, frag)), ok=allowed_cue(cue, reg)))

# ---------------------------------------------------------------- the stingers (js/audio.js, run in node)
FINAL_KINDS = {'candle', 'wish', 'burst', 'stamp'}
JS = r"""
import { readFileSync } from 'node:fs';
import { KINDS } from '%(audio)s';
import MAP from '%(map)s';
const DATA = JSON.parse(readFileSync('%(data)s', 'utf8'));
MAP.phrases = DATA.phrases;   // (the composition's phrases, whatever the map on disk says)
const A = { lastTw: null, prevTw: null, semis: key => ((key - MAP.phrases.tonic + 6) %% 12 + 12) %% 12 - 6 };
const rows = DATA.rows;
const out = [], H = (key, r) => ({ root: r[1], bass: r[2], tones: r[3], tw: r[4], key });
const mel = notes => notes.filter(n => n && n[1] != null).sort((a, b) => a[2] - b[2] || b[1] - a[1]).map(n => n[1]);
const rnd = Math.random;
for (const [kind, K] of Object.entries(KINDS)) {
  for (const [cue, key, r] of rows) {
    const h = H(key, r), ctx = `${cue}@${r[0]}`;
    if (kind === 'twinkle') {   // every random walk of five notes from every start
      const s = []; for (let p = 84; p <= 100; p++) if (h.tw.includes(p %% 12)) s.push(p);
      for (let i = 0; i < s.length; i++) for (let w = 0; w < 4 ** 4; w++) {
        const seq = []; A.lastTw = s[i]; A.prevTw = null; seq.push(s[i]);
        for (let k = 0; k < 4; k++) { const step = (w >> (2 * k)) & 3; Math.random = () => (step + .5) / 4; seq.push(K.f(h, {}, A)[0][1]); }
        Math.random = rnd; out.push({ kind, ctx, seq: 'walk', ps: seq });
      }
      continue;
    }
    if (kind === 'burst') continue;   // (the final chapter's fireworks: single random notes)
    // one hit, its notes in time order
    for (const index of [0, 1, 2, 3, 4, 5]) out.push({ kind, ctx, seq: 'one', ps: mel(K.f(h, { index, of: 14 }, A)) });
    // the melody across repeated hits: each hit's first (main) note
    const runs = kind === 'star' ? [...Array(29).keys()].map(n => n + 2) : kind === 'candle' ? [6] : kind === 'photo' ? [12] : [6];
    for (const of of runs) { const seq = []; for (let i = 0; i < of; i++) { const n = mel(K.f(h, { index: i, of }, A)); if (n.length) seq.push(n.sort ? n[0] : n); } out.push({ kind, ctx, seq: 'run' + of, ps: seq }); }
  }
}
console.log(JSON.stringify(out));
"""
def scan_stingers(report, songs):
    rows = []
    for name, (S, E) in songs.items():
        sc = set(S.meta['scale'])
        rows += [[name, S.meta['key'], r] for r in score.chord_rows(S.ctl, sc)] + [[name + '.end', S.meta['key'], r] for r in score.chord_rows(E.ctl, sc)]
    phrases = dict(star=score.STAR, candle=score.CANDLE, tonic=2)
    try:
        t = open(os.path.join(SITE, 'js', 'score-map.js')).read(); disk = json.loads(t[t.index('{'):t.rindex('}') + 1])
        if disk.get('phrases') != phrases or any(json.loads(json.dumps(score.chord_rows(S.ctl, set(S.meta['scale'])))) != disk['cues'].get(n, {}).get('chords') for n, (S, _) in songs.items()):
            print('note: js/score-map.js is stale (render with tools/score.py to refresh it); this check used the composition')
    except (OSError, ValueError, KeyError): print('note: js/score-map.js unreadable')
    with tempfile.TemporaryDirectory() as tmp:
        f, d = os.path.join(tmp, 'k.mjs'), os.path.join(tmp, 'd.json')
        json.dump(dict(rows=rows, phrases=phrases), open(d, 'w'))
        open(f, 'w').write(JS % dict(audio='file://' + os.path.join(SITE, 'js', 'audio.js'), map='file://' + os.path.join(SITE, 'js', 'score-map.js'), data=d))
        r = subprocess.run(['node', f], capture_output=True, text=True)
    if r.returncode: print(r.stderr); raise SystemExit('stinger evaluation failed')
    seen = set()
    for x in json.loads(r.stdout):
        for mode, k, frag in find(x['ps'], None if x['kind'] in FINAL_KINDS else f"stinger/{x['kind']} {x['seq']} {x['ctx']}"):
            key = (x['kind'], x['seq'], mode, tuple(frag))
            if key in seen: continue
            seen.add(key)
            report.append(dict(where=f"stinger/{x['kind']}", what=f"{x['seq']} {x['ctx']}", beat=None, mode=mode, notes=' '.join(map(nm, frag)), ok=x['kind'] in FINAL_KINDS))
    return

def main():
    report = []; songs = {}
    for name in score.PIECES:
        S, beats = score.PIECES[name](); scan_song(name, S, beats, report)
        E = score.ENDINGS[name](); scan_song(name + '.end', E, None, report); songs[name] = (S, E)
    scan_stingers(report, songs)
    bad = [r for r in report if not r['ok']]; good = [r for r in report if r['ok']]
    def show(rs, lim):
        by = {}
        for r in rs: by.setdefault((r['where'], r['what'].split(' ')[0] if r['where'].startswith('stinger') else r['what']), []).append(r)
        for (w, g), v in list(by.items())[:lim]:
            v.sort(key=lambda r: (r['beat'] is None, r['beat'] or 0))
            print(f'    {w:<22} {g:<18} {len(v):>4}x  first: ' + (f"beat {v[0]['beat']}, " if v[0]['beat'] is not None else f"{v[0]['what']}, ") + f"{v[0]['mode']}: {v[0]['notes']}")
    print(f'Happy Birthday fragments ({N} intervals, any key/rhythm/octave) in the final chapter (allowed): {len(good)}')
    show(good, 40 if VERBOSE else 12)
    print(f'... OUTSIDE the final chapter (leaks): {len(bad)}')
    show(bad, 200)
    first = sorted((r for r in good if r['beat'] is not None and r['where'].startswith('wish/')), key=lambda r: r['beat'])
    if WARN:
        print(f"warnings: the incipit's core (5-6-5-1' / 5-6-5-2', three intervals) outside the last chapter: {len(WARN)}")
        for w, c in WARN[:12]: print(f"    {w}: {' '.join(map(nm, c))}")
    if first: print(f"first in the wish cue's score: {first[0]['where']} beat {first[0]['beat']} ({first[0]['what']})")
    print('PASS: no Happy Birthday before the final chapter' if not bad else 'FAIL: Happy Birthday leaks into earlier chapters')
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
