"""Painterly compositor for creature render passes (render_horse.py): turns flat colour, channel-split
lighting and depth into a frame that sits in a hand-painted 2D film. Golden-hour cel bands, a hot
rim where the low sun wraps the silhouette, cool lavender shadow, a soft warm-brown ink line, and
a little brush grain.

python3 tools/creatures/paint.py <pass-dir> <out-dir> [--mood dusk|gold|night] [--scale 1]
"""
import sys, glob, os, argparse
import numpy as np
import cv2

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--mood', default='gold')
ap.add_argument('--scale', type=float, default=1)
ap.add_argument('--sat', type=float, default=1, help='coat saturation boost')
ap.add_argument('--warm', type=float, default=0, help='push the coat toward gold')
args = ap.parse_args()
os.makedirs(args.dst, exist_ok=True)

MOODS = {
    # lit colour, shadow colour, rim colour, ink colour, ambient lift
    'gold': dict(lit=(1.0, .86, .68), shade=(.52, .36, .46), rim=(1.0, .74, .42), ink=(.22, .11, .07), rimk=1.25),
    'dusk': dict(lit=(1.0, .78, .62), shade=(.36, .32, .52), rim=(1.0, .62, .4), ink=(.18, .09, .08), rimk=1.4),
    'night': dict(lit=(.62, .68, .9), shade=(.18, .2, .36), rim=(.7, .82, 1.0), ink=(.06, .06, .12), rimk=1.1),
}
P = MOODS[args.mood]
rng = np.random.default_rng(5)


def load(path):
    im = cv2.imread(path, cv2.IMREAD_UNCHANGED)
    im = im.astype(np.float32) / (65535 if im.dtype == np.uint16 else 255)
    return im[..., [2, 1, 0, 3]] if im.shape[2] == 4 else im[..., ::-1]


def lin(c): return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)
def srgb(c): c = np.clip(c, 0, 1); return np.where(c <= .0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - .055)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


grain = None
for path in sorted(glob.glob(f'{args.src}/albedo/*.png')):
    tag = os.path.basename(path)
    alb = load(path); lig = load(f'{args.src}/light/{tag}'); dep = load(f'{args.src}/depth/{tag}')
    a = alb[..., 3:4]
    safe = np.maximum(a, 1e-4)
    base = lin(alb[..., :3] / safe)                  # straight-alpha PNG, sRGB encoded -> linear
    if args.sat != 1 or args.warm:
        lum = (base * np.array([.2126, .7152, .0722])).sum(axis=2, keepdims=True)
        base = np.clip(lum + (base - lum) * args.sat, 0, 1) * (1 + args.warm * np.array([.12, .02, -.14]))
    L = lin(np.clip(lig[..., :3] / safe, 0, 1))
    h, w = a.shape[:2]
    # the rim only lives near the silhouette; smoothing first keeps sampling noise from speckling it
    dist = cv2.distanceTransform((a[..., 0] > .5).astype(np.uint8), cv2.DIST_L2, 3)
    near = smoothstep(9 * args.scale + 4, 2, dist)[..., None]
    rim = cv2.GaussianBlur(L[..., 0], (0, 0), 1.2)[..., None] * near
    key = cv2.GaussianBlur(L[..., 1], (0, 0), .8)[..., None]
    sky = L[..., 2:3]
    if grain is None or grain.shape[:2] != (h, w):
        grain = cv2.GaussianBlur(rng.standard_normal((h, w)).astype(np.float32), (0, 0), 1.1)[..., None]
        streak = cv2.GaussianBlur(rng.standard_normal((h, w)).astype(np.float32), (0, 0), sigmaX=6, sigmaY=1.2)[..., None]
    # cel bands: a broad soft terminator, a second highlight band, and the gradient kept faintly underneath
    k = key / .6
    band = smoothstep(.3, .42, k) * .7 + smoothstep(.72, .84, k) * .3
    tone = band * .85 + np.clip(k, 0, 1) * .15
    lit = base * np.array(P['lit']) * 1.05
    shadow = base ** 1.25 * np.array(P['shade']) * .8 + sky * np.array([.012, .016, .04])  # deeper, richer hue in shade
    col = shadow + (lit - shadow) * tone
    # rim: the low sun catching fur along the silhouette, a warm glow rather than a white stripe
    r = smoothstep(.06, .3, rim)
    col = col + r * np.array(P['rim']) ** 2.2 * P['rimk'] * (.25 + base * 1.6)
    # ink: silhouette edge from alpha, interior lines from depth breaks (legs crossing the body)
    d = dep[..., 0] / np.maximum(a[..., 0], 1e-4)
    gx = cv2.Sobel(d, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(d, cv2.CV_32F, 0, 1, ksize=3)
    inner = smoothstep(.05, .14, np.hypot(gx, gy)) * (a[..., 0] > .5)
    inner = cv2.GaussianBlur(inner, (0, 0), .6)
    edge = a[..., 0] - cv2.erode(a[..., 0], np.ones((3, 3), np.uint8))
    line = np.clip(np.maximum(inner, edge * 1.2), 0, 1)[..., None] * (1 - r * .85)  # rim-lit edges stay hot, not inked
    ink = np.array(P['ink']) ** 2.2
    col = col * (1 - line * .78) + ink * line * .78
    # brush grain: tiny value jitter and directional streaks so it reads as paint, not plastic
    col = col * (1 + grain * .03 + streak * .025)
    col = srgb(col)
    out = np.dstack([col * a, a])  # premultiplied for clean resampling, written straight below
    rgba = np.dstack([col, a])
    if args.scale != 1:
        rgba = cv2.resize(out, None, fx=args.scale, fy=args.scale, interpolation=cv2.INTER_AREA)
        aa = np.maximum(rgba[..., 3:4], 1e-4); rgba = np.dstack([rgba[..., :3] / aa, rgba[..., 3:4]])
    cv2.imwrite(f'{args.dst}/{tag}', (np.clip(rgba[..., [2, 1, 0, 3]], 0, 1) * 255).astype(np.uint8))
print('painted', len(glob.glob(f'{args.dst}/*.png')))
