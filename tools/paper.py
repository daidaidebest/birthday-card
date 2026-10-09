"""Stationery assets rendered offline: laid writing paper, a lined envelope and an embossed wax seal.
Run: python3 tools/paper.py → site/assets/img/{letter,env-*,seal}.webp
"""
import numpy as np, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.ndimage import gaussian_filter, map_coordinates

OUT = os.path.join(os.path.dirname(__file__), '..', 'site', 'assets', 'img')
rs = np.random.RandomState(11)

def fbm(h, w, scales=(180, 60, 18, 5), amps=(1, .5, .3, .15), seed=0):
    r = np.random.RandomState(seed); out = np.zeros((h, w))
    for s, a in zip(scales, amps):
        n = gaussian_filter(r.randn(h, w), s); n /= n.std() + 1e-9; out += n * a
    return out / sum(amps)

def paper_rgb(h, w, base=(241, 232, 210), seed=1, laid=True):
    m = fbm(h, w, seed=seed)
    img = np.ones((h, w, 3)) * np.array(base, float)
    img += m[..., None] * np.array([6, 6, 7])
    if laid:  # laid lines from the mould, and chain lines every ~3 cm
        y = np.arange(h)[:, None]; x = np.arange(w)[None, :]
        lines = (np.sin(y / 2.3 * np.pi) * .5 + .5) * (1 + .3 * np.sin(x / 41 + y / 300))
        img -= (lines * 2.2)[..., None]
        chain = np.exp(-((x % 34) - 17) ** 2 / 3.5) * (0.6 + .4 * np.sin(y / 90))
        img -= (chain * 3.2)[..., None]
    # fibres
    fib = Image.new('L', (w, h), 0); d = ImageDraw.Draw(fib)
    for _ in range(int(w * h / 900)):
        x0, y0 = rs.rand() * w, rs.rand() * h; a = rs.rand() * np.pi; L = 4 + rs.rand() * 16
        d.line([x0, y0, x0 + np.cos(a) * L, y0 + np.sin(a) * L * .6], fill=int(30 + rs.rand() * 60), width=1)
    f = np.asarray(fib.filter(ImageFilter.GaussianBlur(.6)), float) / 255
    img -= f[..., None] * np.array([14, 12, 9])
    # warm ageing towards the edges
    yy, xx = np.mgrid[0:h, 0:w]; e = np.minimum.reduce([xx, yy, w - 1 - xx, h - 1 - yy]) / min(w, h)
    age = np.exp(-e / .06) * (.7 + .3 * fbm(h, w, (40, 12), (1, .5), seed + 5))
    img -= age[..., None] * np.array([18, 26, 40])
    return np.clip(img, 0, 255)

def deckle(h, w, depth=10, seed=3):
    r = np.random.RandomState(seed); a = np.ones((h, w))
    yy, xx = np.mgrid[0:h, 0:w]
    edge = [gaussian_filter(r.randn(n), 7) * depth * 1.6 + gaussian_filter(r.randn(n), 1.2) * depth * .25 + depth for n in (w, w, h, h)]
    for k in range(4):
        n = edge[k]; n = np.clip(n, 2, depth * 2.2)
        if k == 0: d = yy - n[None, :]
        elif k == 1: d = (h - 1 - yy) - n[None, :]
        elif k == 2: d = xx - n[:, None]
        else: d = (w - 1 - xx) - n[:, None]
        a = np.minimum(a, np.clip(d / 2.5 + .5, 0, 1))
    grain = gaussian_filter(r.rand(h, w), 1)
    return np.clip(a * (.92 + grain * .16), 0, 1) * (a > .02)

def gold_line(img, alpha_mask, pts_fn):
    pass

def letter():
    W, H = 1000, 1340
    rgb = paper_rgb(H, W, seed=2)
    # letter-fold creases in thirds: a soft valley shadow and a lit ridge
    y = np.arange(H)[:, None].astype(float)
    for fy, sgn in ((H / 3, 1), (2 * H / 3, -1)):
        d = (y - fy)
        rgb -= (np.exp(-(d - 2) ** 2 / 40) * 16 + np.exp(-d ** 2 / 9000) * 4 * sgn * np.tanh(d / 30))[..., None] * np.array([1, 1, 1.1])
        rgb += (np.exp(-(d + 2.5) ** 2 / 3) * 10)[..., None]
    # gold foil elements are drawn into a mask, then given a metallic, slightly uneven sheen
    gm = Image.new('L', (W, H), 0); d = ImageDraw.Draw(gm)
    m = 46
    for k, wdt in ((0, 3), (10, 1)):
        d.rectangle([m + k, m + k, W - m - k, H - m - k], outline=255, width=wdt)
    cx, cy = W // 2, 104
    star = [(cx + np.cos(-np.pi / 2 + i * np.pi / 4) * (26 if i % 2 == 0 else 7), cy + np.sin(-np.pi / 2 + i * np.pi / 4) * (26 if i % 2 == 0 else 7)) for i in range(8)]
    d.polygon(star, fill=255); d.ellipse([cx - 40, cy - 40, cx + 40, cy + 40], outline=255, width=2)
    for sx in (-1, 1):
        d.line([cx + sx * 56, cy, cx + sx * 200, cy], fill=255, width=1)
        d.ellipse([cx + sx * 206 - 3, cy - 3, cx + sx * 206 + 3, cy + 3], fill=255)
    gmask = gaussian_filter(np.asarray(gm).astype(float) / 255, .5)
    yy, xx = np.mgrid[0:H, 0:W]
    sheen = .5 + .5 * np.sin(xx / 90 + yy / 140) * np.cos(yy / 230 - xx / 400)
    gold = np.dstack([150 + 95 * sheen, 108 + 92 * sheen, 46 + 70 * sheen])
    arr = rgb * (1 - gmask[..., None]) + gold * gmask[..., None]
    a = deckle(H, W, 9, 4)
    out = np.dstack([arr, a * 255]).astype('uint8')
    Image.fromarray(out, 'RGBA').save(os.path.join(OUT, 'letter.webp'), quality=88, method=6)
    print('letter')

def liner(h, w):
    # midnight blue liner with a scatter of tiny gold stars
    base = np.ones((h, w, 3)) * np.array([22, 30, 58], float) + fbm(h, w, (60, 15), (1, .4), 21)[..., None] * 6
    img = Image.fromarray(np.clip(base, 0, 255).astype('uint8')); d = ImageDraw.Draw(img)
    r = np.random.RandomState(5)
    for gy in range(0, h + 60, 60):
        for gx in range(0, w + 60, 60):
            x = gx + (30 if (gy // 60) % 2 else 0) + r.randn() * 2; y = gy + r.randn() * 2; s = 5 + r.rand() * 3
            pts = [(x + np.cos(-np.pi / 2 + i * np.pi / 4) * (s if i % 2 == 0 else s * .3), y + np.sin(-np.pi / 2 + i * np.pi / 4) * (s if i % 2 == 0 else s * .3)) for i in range(8)]
            d.polygon(pts, fill=(196, 160, 92))
    return np.asarray(img).astype(float)

def envelope():
    W, H = 1200, 780
    p = paper_rgb(H, W, base=(236, 226, 204), seed=7, laid=False)
    # pocket with the diagonal side-fold shading
    yy, xx = np.mgrid[0:H, 0:W]
    notch = yy < (H * .56) * (1 - np.abs(xx - W / 2) / (W / 2))
    lower = (yy - H) / H
    shade = np.zeros((H, W))
    left = xx < W / 2
    dl = (yy - xx * H / W * .9); dr = (yy - (W - xx) * H / W * .9)
    shade += np.where(left, np.exp(-np.abs(dl) / 6) * 10, np.exp(-np.abs(dr) / 6) * 10)
    shade += np.clip(-lower, 0, 1) * 0
    pocket = np.clip(p - shade[..., None], 0, 255)
    a = (~notch).astype(float) * 255
    a = gaussian_filter(a, .7)
    # soft shadow under the flap edge
    edge = np.abs(yy - (H * .56) * (1 - np.abs(xx - W / 2) / (W / 2)))
    pocket -= (np.exp(-edge / 10) * 22 * (~notch))[..., None]
    Image.fromarray(np.dstack([np.clip(pocket, 0, 255), a]).astype('uint8'), 'RGBA').save(os.path.join(OUT, 'env-pocket.webp'), quality=88)
    # interior: liner visible behind the letter
    inside = liner(H, W) * .7
    Image.fromarray(inside.astype('uint8')).save(os.path.join(OUT, 'env-inside.webp'), quality=86)
    # flap: outer paper and inner liner, as a triangle with a softly rounded point
    FH = int(H * .62)
    tri = Image.new('L', (W, FH), 0); dt = ImageDraw.Draw(tri)
    dt.polygon([(0, 0), (W, 0), (W / 2 + 40, FH - 18), (W / 2, FH), (W / 2 - 40, FH - 18)], fill=255)
    ta = np.asarray(tri.filter(ImageFilter.GaussianBlur(.8))).astype(float)
    outer = paper_rgb(FH, W, base=(240, 231, 210), seed=12, laid=False)
    yy, xx = np.mgrid[0:FH, 0:W]
    outer -= (yy / FH * 10)[..., None]
    Image.fromarray(np.dstack([np.clip(outer, 0, 255), ta]).astype('uint8'), 'RGBA').save(os.path.join(OUT, 'env-flap.webp'), quality=88)
    inner = liner(FH, W)
    # thin gold edge on the liner
    border = (ta > 10) & (np.asarray(tri.filter(ImageFilter.MinFilter(15))) < 128)
    inner[border] = [190, 152, 84]
    Image.fromarray(np.dstack([inner, ta]).astype('uint8'), 'RGBA').save(os.path.join(OUT, 'env-flap-in.webp'), quality=88)
    print('envelope')

def seal(glyph='师'):
    S = 420; c = S / 2; r = np.random.RandomState(4)
    yy, xx = np.mgrid[0:S, 0:S].astype(float)
    ang = np.arctan2(yy - c, xx - c); rad = np.hypot(xx - c, yy - c)
    # irregular poured outline
    wob = 1 + .045 * np.sin(ang * 5 + .7) + .03 * np.sin(ang * 11 + 2) + .02 * np.sin(ang * 17)
    R = S * .43 * wob
    inside = rad < R
    # height: domed blob, a pressed recessed disc, raised rim and an embossed glyph + ring of beads
    h = np.clip(1 - (rad / R) ** 2, 0, 1) ** .5 * 1.0
    disc = rad < S * .3
    h = np.where(disc, h * .55, h)
    h += np.exp(-((rad - S * .3) ** 2) / 30) * .35
    g = Image.new('L', (S, S), 0); d = ImageDraw.Draw(g)
    font = ImageFont.truetype('/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc', int(S * .3), index=2)
    bb = d.textbbox((0, 0), glyph, font=font); d.text((c - (bb[0] + bb[2]) / 2, c - (bb[1] + bb[3]) / 2 - 4), glyph, font=font, fill=255)
    for k in range(36):
        a = k / 36 * 2 * np.pi; x, y = c + np.cos(a) * S * .255, c + np.sin(a) * S * .255
        d.ellipse([x - 3.2, y - 3.2, x + 3.2, y + 3.2], fill=255)
    gl = gaussian_filter(np.asarray(g).astype(float) / 255, 1.6)
    h += gl * .3
    h = gaussian_filter(h, 1.2)
    # lighting from the upper left
    gy, gx = np.gradient(h * 60)
    n = np.dstack([-gx, -gy, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    L = np.array([-.5, -.6, .62]); L /= np.linalg.norm(L)
    diff = np.clip((n * L).sum(2), 0, 1)
    Hh = (L + np.array([0, 0, 1])); Hh /= np.linalg.norm(Hh)
    spec = np.clip((n * Hh).sum(2), 0, 1) ** 40
    base = np.array([128, 18, 30], float)
    col = base[None, None] * (.35 + .9 * diff[..., None]) + spec[..., None] * np.array([255, 190, 180]) * .55
    col *= (1 + fbm(S, S, (8, 2), (1, .5), 3) * .05)[..., None]
    a = np.clip((R - rad) / 1.5, 0, 1) * 255
    Image.fromarray(np.dstack([np.clip(col, 0, 255), a]).astype('uint8'), 'RGBA').save(os.path.join(OUT, 'seal.webp'), quality=90)
    print('seal')

if __name__ == '__main__':
    letter(); envelope(); seal()
