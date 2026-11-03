"""The owl-post envelope and letter for the prologue, in heavy aged parchment (an original take on the
films' Hogwarts letters). Rendered offline with exact geometry, so the page can open the flap and slide
the letter out:
  env-front   address side (the address itself is set live in emerald ink by the page)
  env-back    flap side, closed (the seal is a separate render, tools/seal_blender.py)
  env-pocket  env-back without the top flap        env-flap / env-flap-in   the top flap, outside / inside
  env-inside  the shadowed interior                 letter                   a parchment sheet
Run: python3 tools/parchment.py → site/assets/img/ ; prints the geometry for site/js/scenes/prologue-art.js
"""
import os, json, numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter

OUT = os.path.join(os.path.dirname(__file__), '..', 'site', 'assets', 'img')
W, H = 1200, 820                      # envelope, px
TIP = (600, 548)                      # where the top flap's point ends (the seal sits on it)


def fbm(h, w, scales=(180, 60, 18, 5), amps=(1, .5, .3, .15), seed=0):
    r = np.random.RandomState(seed); out = np.zeros((h, w))
    for s, a in zip(scales, amps):
        n = gaussian_filter(r.randn(h, w), s); n /= n.std() + 1e-9; out += n * a
    return out / sum(amps)


def deckle(h, w, depth=10, seed=3, k=1):
    r = np.random.RandomState(seed); a = np.ones((h, w))
    yy, xx = np.mgrid[0:h, 0:w]
    depth *= k
    edge = [gaussian_filter(r.randn(n), 7 * k) * depth * 1.6 + gaussian_filter(r.randn(n), 1.2 * k) * depth * .25 + depth for n in (w, w, h, h)]
    for side in range(4):
        n = edge[side]; n = np.clip(n, 2, depth * 2.2)
        if side == 0: d = yy - n[None, :]
        elif side == 1: d = (h - 1 - yy) - n[None, :]
        elif side == 2: d = xx - n[:, None]
        else: d = (w - 1 - xx) - n[:, None]
        a = np.minimum(a, np.clip(d / (2.5 * k) + .5, 0, 1))
    grain = gaussian_filter(r.rand(h, w), k)
    return np.clip(a * (.92 + grain * .16), 0, 1) * (a > .02)


def parchment(h, w, seed=1, base=(222, 198, 150), k=1):
    """Thick, mottled, sun-yellowed parchment: blotches, fibres, foxing, darker worn edges. k: pixel scale (k=1.5 draws
    the same sheet at 1.5x the resolution, every feature the same size relative to the sheet)."""
    r = np.random.RandomState(seed)
    img = np.ones((h, w, 3)) * np.array(base, float)
    blot = fbm(h, w, (220 * k, 90 * k, 30 * k), (1, .6, .3), seed)                          # large tea-coloured mottling
    img += blot[..., None] * np.array([10, 12, 16])
    img -= np.clip(fbm(h, w, (60 * k, 20 * k), (1, .5), seed + 1) - 1.0, 0, None)[..., None] * np.array([18, 24, 32])
    img += fbm(h, w, (3 * k, 1.2 * k), (1, .6), seed + 2)[..., None] * 5               # tooth of the skin
    fib = Image.new('L', (w, h), 0); d = ImageDraw.Draw(fib)
    for _ in range(int(w * h / 500 / k / k)):
        x0, y0 = r.rand() * w, r.rand() * h; a = r.rand() * np.pi; L = (6 + r.rand() * 26) * k
        d.line([x0, y0, x0 + np.cos(a) * L, y0 + np.sin(a) * L], fill=int(25 + r.rand() * 70), width=max(1, round(k)))
    f = np.asarray(fib.filter(ImageFilter.GaussianBlur(.7 * k)), float) / 255
    img -= f[..., None] * np.array([16, 18, 22])
    for _ in range(int(w * h / 60000 / k / k)):                                  # foxing: small rusty spots
        cx, cy, rr = r.rand() * w, r.rand() * h, (2 + r.rand() * 7) * k
        yy, xx = np.ogrid[:h, :w]; m = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * rr * rr))
        img -= m[..., None] * np.array([20, 34, 50]) * r.rand()
    yy, xx = np.mgrid[0:h, 0:w]; e = np.minimum.reduce([xx, yy, w - 1 - xx, h - 1 - yy]) / min(w, h)
    img -= (np.exp(-e / .05) * (.8 + .4 * fbm(h, w, (30 * k, 8 * k), (1, .5), seed + 3)))[..., None] * np.array([40, 52, 66])
    img *= (1 - .18 * ((xx / w - .3) ** 2 + (yy / h - .25) ** 2))[..., None]       # warm light from the upper left
    return np.clip(img, 0, 255)


def rgba(rgb, a):
    return np.dstack([np.clip(rgb, 0, 255), np.clip(a * 255, 0, 255)]).astype(np.uint8)


SIZE = {'env-inside': 600, 'letter': 1400, 'letter-wide': 1500}  # px wide on disk; the envelope's faces are drawn at most ~520 CSS px wide;
# the letter is read up close (up to ~540 CSS px wide, 3x on an iPhone), so it keeps its fibres at full density


def save(arr, name):
    im = Image.fromarray(arr, 'RGBA'); w = SIZE.get(name, 960)
    im.resize((w, round(im.height * w / im.width)), Image.LANCZOS).save(os.path.join(OUT, name + '.webp'), quality=76, alpha_quality=88, method=6)
    print(name, w, os.path.getsize(os.path.join(OUT, name + '.webp')) // 1024, 'KB')


def tri_mask(pts, blur=1.2):
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(pts, fill=255)
    return gaussian_filter(np.asarray(m, float) / 255, blur)


def edge_shadow(pts, side, width=14, strength=34):
    """A soft shadow thrown by a flap edge onto the paper beneath (side: which side of the line is under)."""
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).line(pts, fill=255, width=2)
    s = gaussian_filter(np.asarray(m, float) / 255, width / 2.5)
    return s / (s.max() + 1e-9) * strength


def envelope():
    a = deckle(H, W, depth=7, seed=21)
    front = parchment(H, W, seed=4)
    save(rgba(front, a), 'env-front')
    back = parchment(H, W, seed=8)
    # the diamond fold: side flaps meet in the middle, the bottom flap rises over them, the top flap over all
    L, Rt, B, T = [(0, 0), (W * .52, H * .56), (0, H)], [(W, 0), (W * .48, H * .56), (W, H)], [(0, H), (W * .5, H * .4), (W, H)], [(0, 0), TIP, (W, 0)]
    shade = np.zeros((H, W))
    shade += tri_mask(L) * 8 + tri_mask(Rt) * 12                                 # side flaps a touch lower, in shade
    shade += edge_shadow([B[0], B[1], B[2]], 'below', 18, 30)                    # the bottom flap's edges
    flap = tri_mask(T)
    shade = shade * (1 - flap) + edge_shadow([T[0], T[1], T[2]], 'below', 22, 44) * (1 - flap)
    pocket = back - shade[..., None] * np.array([.9, 1, 1.15])
    # crease highlights along the folds
    cre = Image.new('L', (W, H), 0); d = ImageDraw.Draw(cre); d.line([B[0], B[1], B[2]], fill=255, width=2)
    pocket += gaussian_filter(np.asarray(cre, float) / 255, 1)[..., None] * 18
    flap_rgb = back * (1.02 + .03 * (1 - np.arange(H)[:, None, None] / H))
    fcre = Image.new('L', (W, H), 0); ImageDraw.Draw(fcre).line([T[0], T[1], T[2]], fill=255, width=2)
    flap_rgb = flap_rgb + gaussian_filter(np.asarray(fcre, float) / 255, 1)[..., None] * 14
    whole = pocket * (1 - flap[..., None]) + flap_rgb * flap[..., None]
    save(rgba(whole, a), 'env-back')
    save(rgba(pocket, a * (1 - flap)), 'env-pocket')
    save(rgba(flap_rgb, a * flap), 'env-flap')
    inner = parchment(H, W, seed=12, base=(196, 172, 128)) * .82
    save(rgba(inner[:, ::-1], (a * flap)[:, ::-1]), 'env-flap-in')                 # mirrored: see prologue CSS
    y = np.linspace(0, 1, H)[:, None, None]
    inside = parchment(H, W, seed=15, base=(170, 146, 106)) * (.45 + .4 * y)       # darkest up under the fold
    save(rgba(inside, a), 'env-inside')


def letter(k=1.5, wide=False):
    w, h = round(1000 * k), round(1340 * k)
    if wide: w, h = h, w   # a landscape sheet for short landscape screens, still folded in thirds
    rgb = parchment(h, w, seed=31, base=(228, 208, 164), k=k)
    yy = np.arange(h)[:, None].astype(float)
    for fy in (h / 3, 2 * h / 3):                                                # folded in thirds to fit the envelope
        d = yy - fy; rgb -= (np.exp(-(d - 2 * k) ** 2 / (50 * k * k)) * 14)[..., None]; rgb += (np.exp(-(d + 3 * k) ** 2 / (4 * k * k)) * 9)[..., None]
    save(rgba(rgb, deckle(h, w, depth=9, seed=33, k=k)), 'letter-wide' if wide else 'letter')


if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['letter']: letter(); letter(wide=True); sys.exit()   # v19: only the letters, at full density
    envelope(); letter()
    print(json.dumps({'envAspect': round(W / H, 4), 'tip': [TIP[0] / W, TIP[1] / H]}))
