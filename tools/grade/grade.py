"""The film's one grade, baked into its pictures (v19). numpy + PIL + ffmpeg; run with the system python3.

  python3 tools/grade/grade.py                 grade every asset listed in grades.json that is new or changed
  python3 tools/grade/grade.py --all           regrade everything again from the backed-up originals (after editing grades.json)
  python3 tools/grade/grade.py --only GLOB     limit to assets matching GLOB (relative to site/assets, e.g. 'video/study*')
  python3 tools/grade/grade.py --dry           derive and print the parameters and predicted numbers; write nothing
  python3 tools/grade/grade.py --restore GLOB  put the backed-up originals back (and forget their grade)
  python3 tools/grade/grade.py --luts          write each group's .cube LUT (33^3) to <GRADE_DIR>/luts and stop

Heavy (numpy batches, x264): wrap in the shared lock, e.g.
  flock ~/projects/render-workspace/scratch/browser.lock python3 tools/grade/grade.py

How it decides what to do, per file (state in tools/grade/manifest.json):
  * file unchanged since we graded it (sha1 == manifest graded) -> skipped, unless --all
  * file never graded, or replaced by a new render (sha1 != graded) -> the current file is backed up as the new original
    (<GRADE_DIR>/orig/<path>; an older original is kept as <path>.<date>) and graded from it
  * --all regrades from the backed-up original, so grades never stack.
  A new render therefore only needs: drop it in place (same name), run the command. A new *file name* needs a line in
  grades.json (add it to the right group's "files", or a new group with its chapter).

What one grade is (identical maths for stills, depth planes and films; films go through ffmpeg lut3d with the same LUT):
  1 black: the reference's 0.5th-percentile black is moved toward the shared black (common.black) by a soft offset + toe
  2 exposure in linear light toward the chapter's mean (limited, partial)
  3 white balance / split tone in CIELAB: a*/b* shifts for shadows, mid-tones (neutrals) and highlights toward the
    chapter's targets (the narrative temperature arc); pure black stays neutral (the runtime matte tints it)
  4 saturation toward the chapter's mean chroma, then one soft chroma ceiling (cmax), less colour in deep shadow and
    in the roll-off to white
  5 one highlight shoulder for every picture (knee .80, white 1.0 -> ~245)
  6 (full-frame RGB stills and films only) a gentle red-orange halation around bright light sources
  Group parameters are derived from the group's ORIGINAL reference pixels ("match" mode) or fixed ("print" mode, the
  photographs: one print stock, only their black point is matched). Everything sharing a group gets the same transform
  (castle film + its hold loop, study loops, the cake's crossfading renders, a picture and its depth planes).
  Additive light passes (the cake's candle passes) are graded as T(base + pass) - T(base) so they still add up.
Grain is not baked (it costs bytes and must stay one size on every screen): the runtime grain in css/grade.css covers all.
"""
import os, sys, json, hashlib, shutil, subprocess, time, fnmatch, io, tempfile
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import measure as M  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, 'site', 'assets')
CONF = os.path.join(HERE, 'grades.json')
MANIFEST = os.path.join(HERE, 'manifest.json')
GDIR = os.environ.get('GRADE_DIR', os.path.expanduser('~/projects/render-workspace/scratch/v19/grade'))
ORIG = os.path.join(GDIR, 'orig')
LUTS = os.path.join(GDIR, 'luts')
SAMPLE = 360   # short side of the pooled reference sample


def sha1(path):
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ the point transform
def point(px, P, C):
    """px: N x 3 float32 sRGB-encoded 0..1 -> graded (same shape). P: group parameters, C: common settings."""
    o = P['o']
    x = (px - o) / (1 - o)
    k = C['toe']
    x = np.where(x > k, x, k * np.exp((np.minimum(x, k) - k) / k))          # soft toe: nothing clips to 0
    x = M.lin_to_srgb(M.srgb_to_lin(x) * 2 ** P['ev'])
    lab, _ = M.rgb_to_lab(x)
    L, a, b = lab[:, 0], lab[:, 1], lab[:, 2]
    wh = smooth(55, 85, L); ws = 1 - smooth(12, 40, L); wm = np.clip(1 - wh - ws, 0, 1)
    fade = smooth(0, 8, L)
    a = a + (ws * P['sh'][0] + wm * P['mid'][0] + wh * P['hi'][0]) * fade
    b = b + (ws * P['sh'][1] + wm * P['mid'][1] + wh * P['hi'][1]) * fade
    c = np.hypot(a, b)
    cn = c * P['sat']
    cmax = P['cmax']; kn = C['sat_knee'] * cmax
    cn = np.where(cn > kn, kn + (cmax - kn) * np.tanh((cn - kn) / (cmax - kn)), cn)
    cn = cn * (1 - C['hi_desat'] * smooth(88, 104, L)) * (1 - C['lo_desat'] * (1 - smooth(2, 16, L)))
    s = cn / np.maximum(c, 1e-6)
    x = M.lab_to_rgb(np.stack([L, a * s, b * s], -1))
    kn, m = C['knee'], C['shoulder']
    x = np.where(x > kn, kn + (m - kn) * (1 - np.exp(-(np.maximum(x, kn) - kn) / (m - kn))), x)
    return np.clip(x, 0, 1).astype(np.float32)


def point_img(arr, P, C, chunk=1 << 18):
    """arr H x W x 3 float32 -> graded, in chunks (bounded memory on the shared 4 GB VM)."""
    flat = arr.reshape(-1, 3)
    out = np.empty_like(flat)
    for i in range(0, len(flat), chunk):
        out[i:i + chunk] = point(flat[i:i + chunk], P, C)
    return out.reshape(arr.shape)


def halation(arr, H, C):
    """Screen in a blurred, red-shifted copy of what is near white (stills; films get the same through ffmpeg)."""
    if not H or H <= 0:
        return arr
    thr = C['hal_threshold']
    h = np.clip((arr - thr) / (1 - thr), 0, 1) ** 1.5
    h = M.blur(h, C['hal_sigma'] * min(arr.shape[:2])) * np.array(C['hal_tint'], np.float32)
    return 1 - (1 - arr) * (1 - H * np.clip(h, 0, 1))


# ------------------------------------------------------------------ deriving a group's parameters
def zero_params(T, C):
    return {'o': 0.0, 'ev': 0.0, 'sh': [0.0, 0.0], 'mid': [0.0, 0.0], 'hi': [0.0, 0.0], 'sat': 1.0, 'cmax': T.get('cmax', C['cmax'])}


def toward(cur, tgt, strength):
    return cur + strength * (tgt - cur)


def gray_L(v):
    """CIELAB L* of a neutral grey of encoded value v (0..255)."""
    return float(M.rgb_to_lab(np.array([[v / 255] * 3], np.float32))[0][0, 0])


def derive(sample, T, C):
    """sample: N x 3 original pixels. T: the chapter/group targets. Returns (params, stats before, stats after).
    Each target sets a goal = original + strength * (target - original), measured once on the original; the parameters
    are then iterated until the graded sample meets every goal (exposure is matched on mean L*, so a change of
    saturation does not read as a change of brightness)."""
    st0 = M.colour_stats(sample)
    P = zero_params(T, C)
    bt, bs = T.get('black', [C['black'], .8])
    b = st0['black'] / 255
    btgt = toward(st0['black'], bt, bs) / 255
    P['o'] = float((b - btgt) / (1 - btgt))
    if T.get('mode') == 'print':
        off = T['offset']
        P['sh'], P['mid'], P['hi'] = [float(v) for v in off['sh']], [float(v) for v in off['mid']], [float(v) for v in off['hi']]
        P['sat'] = float(T.get('sat_gain', 1.0)); P['ev'] = float(T.get('ev', 0.0)); P['cmax'] = float(P['cmax'])
        return P, st0, M.colour_stats(point(sample, P, C))
    goal = {}
    if 'mean' in T: goal['meanL'] = toward(st0['meanL'], st0['meanL'] + gray_L(T['mean'][0]) - gray_L(st0['mean']), T['mean'][1])
    if 'neu' in T and not np.isnan(st0['neu_a']):
        goal['neu_a'] = toward(st0['neu_a'], T['neu'][0][0], T['neu'][1]); goal['neu_b'] = toward(st0['neu_b'], T['neu'][0][1], T['neu'][1])
    for k in ('hi_b', 'sh_b', 'sat'):
        if k in T: goal[k] = toward(st0[k], T[k][0], T[k][1])
    lim = T.get('ev_max', C['ev_max'])
    for it in range(5):
        if 'meanL' in goal:     # exposure: bisection on mean L* with everything else applied
            lo, hi = -lim, lim
            for _ in range(16):
                P['ev'] = (lo + hi) / 2
                lab, _x = M.rgb_to_lab(point(sample, P, C))
                lo, hi = (P['ev'], hi) if lab[:, 0].mean() < goal['meanL'] else (lo, P['ev'])
            P['ev'] = float((lo + hi) / 2)
        st = M.colour_stats(point(sample, P, C))
        if 'neu_a' in goal and not np.isnan(st['neu_a']):
            P['mid'][0] += goal['neu_a'] - st['neu_a']; P['mid'][1] += goal['neu_b'] - st['neu_b']
        P['hi'][0] = P['mid'][0]; P['sh'][0] = P['mid'][0] * .6
        if 'hi_b' in goal: P['hi'][1] += goal['hi_b'] - st['hi_b']
        if 'sh_b' in goal: P['sh'][1] += goal['sh_b'] - st['sh_b']
        if 'sat' in goal:
            st = M.colour_stats(point(sample, P, C))
            P['sat'] = float(np.clip(P['sat'] * goal['sat'] / max(st['sat'], 1e-3), *T.get('sat_range', C['sat_range'])))
    for k in ('sh', 'mid', 'hi'):   # a grade, not a repaint: shifts are bounded
        P[k] = [float(np.clip(v, -C.get('shift_max', 14), C.get('shift_max', 14))) for v in P[k]]
    P = {k: (float(v) if not isinstance(v, list) else v) for k, v in P.items()}
    return P, st0, M.colour_stats(point(sample, P, C))


# ------------------------------------------------------------------ files
def is_video(rel): return rel.endswith('.mp4')


def read_frames(path, times, short=SAMPLE):
    """RGB float frames from a film at the given seconds (bt709 decode, as browsers show untagged HD)."""
    out = []
    for t in times:
        p = subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-ss', str(t), '-i', path, '-frames:v', '1',
                            '-vf', 'scale=in_color_matrix=bt709:flags=lanczos+accurate_rnd+full_chroma_int,format=rgb24', '-f', 'image2pipe',
                            '-vcodec', 'png', '-'], capture_output=True, check=True)
        out.append(Image.open(io.BytesIO(p.stdout)).convert('RGB'))
    return out


def sample_of(files, times):
    px = []
    for f in files:
        ims = read_frames(f, times) if is_video(f) else [Image.open(f)]
        for im in ims:
            rgb, mask = M.load(im, SAMPLE)
            px.append(rgb[mask])
    px = np.concatenate(px).astype(np.float32)
    if len(px) > 160000:     # a fixed random subset is plenty for the statistics and keeps the derivation quick
        px = px[np.random.default_rng(7).choice(len(px), 160000, replace=False)]
    return px


def webp_info(path):
    with open(path, 'rb') as f:
        head = f.read(64)
    return {'lossless': b'VP8L' in head, 'alpha': b'ALPH' in open(path, 'rb').read(4096) or b'VP8L' in head}


def save_webp(im, dst, orig_bytes, lossless):
    if lossless:
        im.save(dst, 'WEBP', lossless=True, quality=100, method=6, exact=False)
        return 'lossless'
    best = None
    lo, hi = 70, 96
    while lo <= hi:     # the highest quality whose size stays within +8 % of the original
        q = (lo + hi) // 2
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=q, method=6, alpha_quality=100)
        if buf.tell() <= orig_bytes * 1.08:
            best = (q, buf.getvalue()); lo = q + 1
        else:
            hi = q - 1
    if best is None:
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=70, method=6, alpha_quality=90); best = (70, buf.getvalue())
    with open(dst, 'wb') as f:
        f.write(best[1])
    return f'q{best[0]}'


def grade_still(src, dst, P, C, hal, base=None):
    im = Image.open(src); im.load()
    mode = im.mode
    rgba = im.convert('RGBA') if ('A' in mode or mode == 'P') else None
    arr = np.asarray((rgba or im.convert('RGB')), dtype=np.float32)[..., :3] / 255
    if base is not None:   # additive light pass: T(base + pass) - T(base)
        b = np.asarray(Image.open(base).convert('RGB').resize(im.size, Image.LANCZOS), dtype=np.float32) / 255
        g = np.clip(point_img(np.clip(b + arr, 0, None), P, C) - point_img(b, P, C), 0, 1)
    else:
        g = point_img(arr, P, C)
        if hal and rgba is None:
            g = halation(g, hal, C)
    out = np.clip(np.round(g * 255), 0, 255).astype(np.uint8)
    if rgba is not None:
        res = Image.fromarray(np.dstack([out, np.asarray(rgba)[..., 3]]), 'RGBA')
    else:
        res = Image.fromarray(out, 'RGB')
    if dst.endswith('.png'):
        if mode == 'L':
            res = res.convert('L')
        res.save(dst, 'PNG', optimize=True)
        return 'png'
    return save_webp(res, dst, os.path.getsize(src), webp_info(src)['lossless'])


def write_cube(P, C, path, n=33):
    g = np.linspace(0, 1, n, dtype=np.float32)
    b, gg, r = np.meshgrid(g, g, g, indexing='ij')          # .cube order: red fastest
    px = np.stack([r.ravel(), gg.ravel(), b.ravel()], -1)
    out = point(px, P, C)
    with open(path, 'w') as f:
        f.write(f'TITLE "{os.path.basename(path)}"\nLUT_3D_SIZE {n}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
        f.write('\n'.join(f'{v[0]:.5f} {v[1]:.5f} {v[2]:.5f}' for v in out))
        f.write('\n')


def grade_video(src, dst, cube, C, hal, crf, tag):
    iw, ih = map(int, subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src],
                                     capture_output=True, text=True, check=True).stdout.strip().split(',')[:2])
    head = f"[0:v]scale=in_color_matrix=bt709:in_range=tv:flags=accurate_rnd+full_chroma_int,format=gbrp16le,lut3d=file='{cube}':interp=tetrahedral"
    tail = "scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd,format=yuv420p[o]"
    if hal and hal > 0:
        thr = C['hal_threshold']; tr, tg, tb = C['hal_tint']; sig = C['hal_sigma'] * min(iw, ih)
        e = f"pow(clip((val-maxval*{thr})/(maxval*{1 - thr})\\,0\\,1)\\,1.5)*maxval"
        fg = (f"{head},split[a][b];[b]lutrgb=r='{e}':g='{e}':b='{e}',gblur=sigma={sig:.2f},"
              f"colorchannelmixer=rr={tr}:gg={tg}:bb={tb}[h];[a][h]blend=all_mode=screen:all_opacity={hal},{tail}")
    else:
        fg = f"{head},{tail}"
    before = os.path.getsize(src)
    for attempt in range(3):
        tmp = dst + '.tmp.mp4'
        subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', src, '-filter_complex', fg, '-map', '[o]', '-an',
                        '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
                        '-threads', '3', '-movflags', '+faststart', tmp], check=True)
        size = os.path.getsize(tmp)
        print(f'    {tag}: crf {crf} -> {size / 1e6:.2f} MB (orig {before / 1e6:.2f} MB)', flush=True)
        if size > before * 1.15 and attempt < 2:
            crf += 1; continue
        if size < before * .7 and attempt < 2:
            crf -= 1; continue
        break
    os.replace(tmp, dst)
    return f'crf{crf}'


# ------------------------------------------------------------------ driver
def expand(pattern):
    hits = sorted(os.path.relpath(os.path.join(dp, f), ASSETS) for dp, _, fs in os.walk(ASSETS) for f in fs
                  if fnmatch.fnmatch(os.path.relpath(os.path.join(dp, f), ASSETS), pattern))
    return hits


def backup(rel, cur_sha, man):
    dst = os.path.join(ORIG, rel)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and sha1(dst) != cur_sha:
        os.replace(dst, dst + '.' + time.strftime('%Y%m%d-%H%M%S'))
    if not os.path.exists(dst):
        shutil.copy2(os.path.join(ASSETS, rel), dst)
    return dst


def main():
    a = sys.argv[1:]
    ALL = '--all' in a; DRY = '--dry' in a; ONLY = a[a.index('--only') + 1] if '--only' in a else None
    if '--restore' in a:
        pat = a[a.index('--restore') + 1]; man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {'files': {}}
        for rel in list(man['files']):
            if fnmatch.fnmatch(rel, pat) and os.path.exists(os.path.join(ORIG, rel)):
                shutil.copy2(os.path.join(ORIG, rel), os.path.join(ASSETS, rel)); del man['files'][rel]; print('restored', rel)
        json.dump(man, open(MANIFEST, 'w'), indent=1, ensure_ascii=False)
        return
    cfg = json.load(open(CONF)); C = cfg['common']
    man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {'files': {}, 'groups': {}}
    os.makedirs(LUTS, exist_ok=True)
    groups = {G['name']: G for G in cfg['groups']}
    derived = {}

    def files_of(G):
        excl = {r for p in G.get('exclude', []) for r in expand(p)}
        return [r for p in G['files'] for r in expand(p) if r not in excl]

    def params(name):
        """A group's parameters, derived (once) from its references' ORIGINAL pixels, or borrowed from another group."""
        if name in derived:
            return derived[name]
        G = groups[name]
        if G.get('params_from'):      # same light as another group (sprites on a painting, additive passes on their base)
            derived[name] = params(G['params_from'])
            return derived[name]
        T = dict(cfg['chapters'][G['chapter']]); T.update(G.get('targets', {}))
        refs = [r for p in G.get('ref', G['files'][:1]) for r in expand(p)]
        sample = sample_of([orig_of(r) for r in refs], G.get('times', [1, 4, 7]))
        derived[name] = (refs, derive(sample, T, C))
        return derived[name]

    for G in cfg['groups']:
        files = files_of(G)
        if not files:
            print('!! no files for group', G['name']); continue
        if ONLY and not any(fnmatch.fnmatch(r, ONLY) for r in files):
            continue
        todo = []
        for rel in files:
            if ONLY and not fnmatch.fnmatch(rel, ONLY):
                continue
            cur = sha1(os.path.join(ASSETS, rel)); ent = man['files'].get(rel)
            if ent and ent.get('graded') == cur:
                if ALL: todo.append((rel, 'regrade'))
            else:
                todo.append((rel, 'new'))
        if not todo and '--luts' not in a and not DRY:
            continue
        # new or changed files are backed up first (the new original); references are always read from originals
        if not DRY:
            for rel, why in todo:
                if why == 'new':
                    backup(rel, sha1(os.path.join(ASSETS, rel)), man)
        refs, (P, s0, s1) = params(G['name'])
        print(f"== {G['name']} ({G['chapter']}): {len(todo)}/{len(files)} files, ref {', '.join(refs)}" + (f" (params of {G['params_from']})" if G.get('params_from') else ''))
        print('   params', json.dumps({k: (round(v, 3) if isinstance(v, float) else [round(u, 2) for u in v]) for k, v in P.items()}))
        for lab, s in (('   before', s0), ('   after ', s1)):
            print(lab, ' '.join(f"{k} {s[k]:.1f}" for k in ('black', 'white', 'mean', 'sat', 'sat95', 'neu_a', 'neu_b', 'hi_b', 'sh_b')), f"cct {s['cct']:.0f}")
        cube = os.path.join(LUTS, G['name'] + '.cube')
        if DRY:
            continue
        write_cube(P, C, cube)
        if '--luts' in a:
            continue
        man['groups'][G['name']] = {'chapter': G['chapter'], 'params': P, 'ref': refs, 'before': s0, 'after': s1}
        for rel, why in todo:
            src = orig_of(rel); dst = os.path.join(ASSETS, rel); b0 = os.path.getsize(src)
            hal = G.get('halation', 0) if not rel.startswith('depth/') else 0
            if is_video(rel):
                crf = G.get('crf', 21)
                if isinstance(crf, dict):
                    crf = next((v for k, v in crf.items() if k != 'default' and fnmatch.fnmatch(rel, k)), crf.get('default', 21))
                how = grade_video(src, dst, cube, C, hal, crf, rel)
            else:
                base = None
                if G.get('additive'):
                    base = orig_of(G['additive'].replace('{k}', rel.rsplit('-', 1)[1].split('.')[0]))
                how = grade_still(src, dst, P, C, hal, base)
            man['files'][rel] = {'group': G['name'], 'orig': sha1(src), 'graded': sha1(dst), 'bytes_before': b0,
                                 'bytes_after': os.path.getsize(dst), 'enc': how, 'when': time.strftime('%Y-%m-%d %H:%M')}
            print(f'   {rel}: {b0} -> {os.path.getsize(dst)} bytes ({how})', flush=True)
            json.dump(man, open(MANIFEST, 'w'), indent=1, ensure_ascii=False)


def orig_of(rel):
    o = os.path.join(ORIG, rel)
    return o if os.path.exists(o) else os.path.join(ASSETS, rel)   # (a dry run of a never-graded file)


if __name__ == '__main__':
    main()
