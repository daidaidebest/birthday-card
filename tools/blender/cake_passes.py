"""Cake stills -> web images, plus per-candle light passes for the close-up (v17). Plain Python (numpy + Pillow).
python3 cake_passes.py RENDER_DIR(with cake_portrait/, cake_landscape/) IMG_DIR
Stills: cake3d-{unlit,lit,after,mask,close-unlit,close-lit}-{p,l}.webp at 1080x1920 / 1440x810.
Passes: cake3d-close-light{i}-{p,l}.webp at half that size; D_i = pass-i - pass-base in display space (AgX), so
close-unlit + D_i is the close-up with only candle i burning. AgX is not additive, so the six raw passes overshoot where
their light overlaps; they are rescaled per pixel by (pass-all - pass-base) / sum(D_i) (never up), which makes
close-unlit + sum(D_i) match close-lit. The check is run on the decoded webp files, as the page will see them."""
import sys, os, json
import numpy as np
from PIL import Image
SRC, IMG = sys.argv[1], sys.argv[2]
def load(p, size=None):
    im = Image.open(p); a = np.asarray(im).astype(np.float64)
    a = a / (65535. if a.max() > 255 else 255.)
    a = a[..., :3]
    if size and (im.size != size): a = resize(a, size)
    return a
def resize(a, size, f=Image.LANCZOS):
    ch = [np.asarray(Image.fromarray(a[..., c].astype(np.float32), 'F').resize(size, f)) for c in range(3)]
    return np.stack(ch, -1).astype(np.float64)
def blur(a, sig):
    r = int(3 * sig + .5); k = np.exp(-.5 * (np.arange(-r, r + 1) / sig) ** 2); k /= k.sum()
    for ax in (0, 1):
        p = np.pad(a, [(r, r) if i == ax else (0, 0) for i in range(a.ndim)], mode='edge')
        a = sum(k[j] * np.take(p, range(j, j + a.shape[ax]), axis=ax) for j in range(2 * r + 1))
    return a
def allocate(D, T):
    """Per pixel and channel, split the true all-candle lift T among the candles: where the singles overshoot (AgX
    compresses highlights), take the same amount off each (projection onto sum = T, never below 0), so the candle that
    dominates a spot keeps most of its own glow; where they fall short (the toe), scale them up (at most 3x)."""
    S = D.sum(0)
    up = np.where(S > 1e-6, np.minimum(3, T / np.maximum(S, 1e-6)), 0)
    Ds = -np.sort(-D, axis=0); cs = np.cumsum(Ds, 0); k = np.arange(1, D.shape[0] + 1).reshape(-1, 1, 1, 1)
    lam_k = (cs - T) / k; ok = Ds - lam_k > 0
    idx = ok.sum(0) - 1; idx = np.maximum(idx, 0)
    lam = np.take_along_axis(lam_k, idx[None], 0)[0]
    proj = np.clip(D - lam, 0, None)
    return np.where(S > T, proj, D * up)
def to8(a): return Image.fromarray((np.clip(a, 0, 1) * 255 + .5).astype(np.uint8), 'RGB')
def webp(a, path, q):
    to8(a).save(path, 'WEBP', quality=q, method=6); return os.path.getsize(path)
report = {}
for o, k in (('portrait', 'p'), ('landscape', 'l')):
    if not os.path.isdir(os.path.join(SRC, 'cake_' + o)): continue   # one orientation may be re-rendered alone
    d = os.path.join(SRC, f'cake_{o}'); full = (1080, 1920) if k == 'p' else (1440, 810); half = (full[0] // 2, full[1] // 2)
    sizes = {}
    for src, dst in (('wide-unlit', 'unlit'), ('wide-lit', 'lit'), ('wide-after', 'after'), ('wide-mask', 'mask'), ('close-unlit', 'close-unlit'), ('close-lit', 'close-lit')):
        sizes[dst] = webp(load(os.path.join(d, src + '.png'), full), os.path.join(IMG, f'cake3d-{dst}-{k}.webp'), 88)
    base = load(os.path.join(d, 'pass-base.png'), half); allp = load(os.path.join(d, 'pass-all.png'), half)
    P = [load(os.path.join(d, f'pass-{i}.png'), half) for i in range(6)]
    D = np.stack([np.clip(p - base, 0, None) for p in P])          # 6, h, w, 3: each candle alone (display space)
    tgt = np.clip(allp - base, 0, None)
    Dn = allocate(D, tgt)
    for i in range(6):
        a = blur(Dn[i], .8)
        sizes[f'close-light{i}'] = webp(a, os.path.join(IMG, f'cake3d-close-light{i}-{k}.webp'), 90)
    # the check, on what the page decodes: close-unlit + up(D_i), summed, against close-lit (8-bit units)
    U = load(os.path.join(IMG, f'cake3d-close-unlit-{k}.webp')); Lt = load(os.path.join(IMG, f'cake3d-close-lit-{k}.webp'))
    Dw = [resize(load(os.path.join(IMG, f'cake3d-close-light{i}-{k}.webp')), full, Image.BILINEAR) for i in range(6)]
    comp = np.clip(U + sum(Dw), 0, 1); e = np.abs(comp - Lt) * 255
    # singles: close-unlit + D_i against pass-i itself (half res), before the rescale (exact by construction) and after
    single = []
    for i in range(6):
        Pi = P[i]; Dh = load(os.path.join(IMG, f'cake3d-close-light{i}-{k}.webp'))
        single.append(float(np.abs(np.clip(base + Dh, 0, 1) - Pi).mean() * 255))
    rawsum = np.clip(base + D.sum(0), 0, 1); er = np.abs(rawsum - allp) * 255
    ls = [float(np.percentile(np.abs(np.clip(base + Dn[i], 0, 1) - P[i]) * 255, 99)) for i in range(6)]
    report[k] = dict(sum_vs_lit_mean=round(float(e.mean()), 3), sum_vs_lit_p999=round(float(np.percentile(e, 99.9)), 2), sum_vs_lit_max=round(float(e.max()), 1),
                     raw_unscaled_sum_vs_all_mean=round(float(er.mean()), 3), raw_unscaled_sum_vs_all_max=round(float(er.max()), 1),
                     single_vs_pass_mean=[round(x, 3) for x in single], single_vs_pass_p99=[round(x, 1) for x in ls],
                     kb={n: round(v / 1024, 1) for n, v in sizes.items()}, total_kb=round(sum(sizes.values()) / 1024, 1))
print(json.dumps(report, indent=1))
