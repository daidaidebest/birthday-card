# Builds the prologue's assets from the painted key art (tools/keyart.py output):
#   castle  → site/assets/img/castle.webp (then depth.py + layers.py castle 4)
#   owl     → owl-body.webp + owl-wing.webp: the owl cut off its black ground and split at the shoulders, so
#             the page can beat the wings (one wing is painted; the other is its mirror)
# (the envelope and letter come from tools/parchment.py, the wax seal from tools/seal_blender.py)
# Usage: python3 tools/prologue_art.py <render dir> castle=<seed> owl=<seed>
# The owl's shoulders, tail and talons are measured per picture: see tools/prologue_art.json.
import sys, os, json, numpy as np, cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
IMG = os.path.join(ROOT, 'site/assets/img')
SRC = sys.argv[1]
PICK = dict(a.split('=') for a in sys.argv[2:])
ART = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'prologue_art.json')))


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, f'{name}-{PICK[name]}.png')).convert('RGB'))


def matte(rgb, lo=22, hi=48, fill=True):
    """Alpha for a subject painted on plain black: brightness ramp, largest blob, holes filled."""
    v = rgb.max(-1).astype(np.float32)
    fg = (v > lo).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
    keep = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    # fill holes: background pockets that touch no border (wingtips can split the background in two)
    nb, bl = cv2.connectedComponents((1 - keep).astype(np.uint8))
    edge = set(np.unique(np.concatenate([bl[0], bl[-1], bl[:, 0], bl[:, -1]])))
    if fill: keep = keep | np.isin(bl, [i for i in range(1, nb) if i not in edge]).astype(np.uint8)
    a = np.clip((v - lo) / (hi - lo), 0, 1) * cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 1)
    a = np.maximum(a, cv2.erode(keep, np.ones((5, 5), np.uint8)).astype(np.float32))
    col = np.where(a[..., None] > .02, np.clip(rgb / np.maximum(a, .3)[..., None], 0, 255), rgb)
    return col.astype(np.uint8), a


def save(arr, name, q=88):
    im = Image.fromarray(arr, 'RGBA' if arr.shape[-1] == 4 else 'RGB')
    im.save(os.path.join(IMG, name + '.webp'), quality=q, alpha_quality=92, method=6)
    print(name, im.size, os.path.getsize(os.path.join(IMG, name + '.webp')) // 1024, 'KB')
    return im.size


out = {}
if 'castle' in PICK:
    save(load('castle'), 'castle', 86)

if 'owl' in PICK:
    col, a = matte(load('owl'), fill=False)  # the gaps between wing and tail are real background
    H, W = a.shape; o = ART['owl']; cx, half = o['cx'], o['body'] // 2
    # body: the central strip, plus the fanned tail below the wings
    body_m = np.zeros((H, W), np.float32); body_m[:, cx - half:cx + half] = 1
    body_m[o['tail_y']:, o['tail_x0']:o['tail_x1']] = 1
    body_m = cv2.GaussianBlur(body_m, (0, 0), 6)
    # wing: the right side outside the body, reaching a little under it so the joint stays hidden while it beats
    wing_m = np.zeros((H, W), np.float32); wing_m[:, cx + half - 30:] = 1; wing_m[o['tail_y']:, :o['tail_x1']] = 0
    wing_m = cv2.GaussianBlur(wing_m, (0, 0), 3)
    rgba = lambda m: np.dstack([col, (a * m * 255).astype(np.uint8)])
    bx0, bx1 = cx - o['half_w'], cx + o['half_w']; body = rgba(body_m)[:, bx0:bx1]
    wy0 = o['wing_y0']; wing = rgba(wing_m)[wy0:, cx + half - 30:]
    save(np.ascontiguousarray(body), 'owl-body'); save(np.ascontiguousarray(wing), 'owl-wing')
    sxp, syp = o['shoulder']                # the wing root, full-image px
    out['owl'] = dict(w=W, sx=sxp - cx, sy=0, wx=sxp - (cx + half - 30), wy=syp - wy0, by=syp, ty=o['talons_y'])

print(json.dumps(out))
