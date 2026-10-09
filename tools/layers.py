# Splits a painting into 2.5D depth planes for the parallax camera.
#
#   python3 tools/depth.py  site/assets/img/foo.webp        # 1. depth map (Depth Anything V2, small)
#   python3 tools/layers.py foo 4                           # 2. depth planes -> site/assets/depth/foo/
#   python3 tools/layers.py --manifest                      # 3. regenerate js/depth-data.js
#
# Each plane k holds every pixel at least as near as threshold k (a cumulative, depth-feathered mask),
# so stacking the planes reproduces the original exactly when the camera is still. Wherever a nearer
# plane will cover a plane, that plane is inpainted, so a moving camera reveals plausible scenery
# instead of a hole or a ghost. Near planes are cropped to their opaque bounds to keep drawing cheap.
import sys, os, json, glob
import numpy as np, cv2
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'site/assets/depth')


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def despeckle(a, min_area=90):
    """Drop tiny islands of a plane (depth noise) so no stray specks float in front of the scene."""
    fg = (a > .02).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg, connectivity=8)
    keep = np.zeros(n, bool); keep[1:] = st[1:, cv2.CC_STAT_AREA] >= min_area
    return a * keep[lab]


def thresholds(d, k):
    """1-D k-means on depth; the split points sit between cluster centres."""
    v = d[::4, ::4].reshape(-1, 1).astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 1e-4)
    _, _, c = cv2.kmeans(v, k, None, crit, 6, cv2.KMEANS_PP_CENTERS)
    c = np.sort(c.ravel())
    return [(c[i] + c[i + 1]) / 2 for i in range(k - 1)], c


def inpaint(rgb, hole):
    """Telea inpainting at reduced scale (holes are big, detail is irrelevant), blended in softly."""
    if not hole.any():
        return rgb
    H, W = hole.shape
    out = rgb.copy()
    for scale in (4,):
        sw, sh = max(8, W // scale), max(8, H // scale)
        small = cv2.resize(rgb, (sw, sh), interpolation=cv2.INTER_AREA)
        sm = cv2.resize(hole.astype(np.uint8) * 255, (sw, sh), interpolation=cv2.INTER_AREA) > 20
        fill = cv2.inpaint(small, sm.astype(np.uint8), 7, cv2.INPAINT_TELEA)
        fill = cv2.GaussianBlur(fill, (0, 0), 1.2)
        big = cv2.resize(fill, (W, H), interpolation=cv2.INTER_CUBIC)
    soft = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 1.5)[..., None]
    return (out * (1 - soft) + big * soft).astype(np.uint8)


def split(name, k, feather=.035, src=None):
    src = src or glob.glob(os.path.join(ROOT, f'site/assets/img/{name}.*'))[0]
    im = Image.open(src)
    src_a = np.asarray(im.convert('RGBA'))[..., 3].astype(np.float32) / 255 if im.mode in ('RGBA', 'LA') else None
    rgb = np.asarray(im.convert('RGB'))
    d = np.load(os.path.join(ROOT, f'depth/{name}.npy')).astype(np.float32)
    d = cv2.bilateralFilter(d, 7, .05, 5)  # calm depth noise inside surfaces, keep edges
    th, centres = thresholds(d, k)
    os.makedirs(os.path.join(OUT, name), exist_ok=True)
    H, W = d.shape
    alphas = [np.ones_like(d)] + [smoothstep(t - feather, t + feather, d) for t in th]
    # antialias the planes' outlines a touch in image space
    alphas = [alphas[0]] + [cv2.GaussianBlur(despeckle(a), (0, 0), .7) for a in alphas[1:]]
    layers = []
    for i in range(k):
        a = alphas[i]
        if i + 1 < k:  # what the next plane fully covers is hidden here: inpaint it
            hole = cv2.dilate((alphas[i + 1] > .97).astype(np.uint8), np.ones((5, 5), np.uint8), iterations=2) > 0
            col = inpaint(rgb, hole)
        else:
            col = rgb
        # representative depth of the plane = mean depth of the pixels this plane is the top of
        top = a * (1 - alphas[i + 1]) if i + 1 < k else a
        z = float((d * top).sum() / max(top.sum(), 1))
        if src_a is not None:  # a painting with see-through glass keeps it on every plane
            a = a * src_a
        if i == 0 and src_a is None:
            Image.fromarray(col).save(os.path.join(OUT, name, '0.webp'), quality=86, method=6)
            layers.append({'x': 0, 'y': 0, 'w': W, 'h': H, 'z': round(z, 3)})
            continue
        ys, xs = np.where(a > .004)
        x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        rgba = np.dstack([col, (a * 255 + .5).astype(np.uint8)])[y0:y1, x0:x1]
        Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, name, f'{i}.webp'), quality=86, alpha_quality=90, method=6)
        layers.append({'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0), 'z': round(z, 3)})
    meta = {'w': W, 'h': H, 'layers': layers}
    json.dump(meta, open(os.path.join(OUT, name, 'meta.json'), 'w'))
    print(name, 'thresholds', [round(float(t), 3) for t in th], 'z', [l['z'] for l in layers],
          'sizes', [os.path.getsize(os.path.join(OUT, name, f'{i}.webp')) // 1024 for i in range(k)], 'KB')


def manifest():
    data = {}
    for m in sorted(glob.glob(os.path.join(OUT, '*/meta.json'))):
        data[os.path.basename(os.path.dirname(m))] = json.load(open(m))
    js = ('// Generated by tools/layers.py --manifest: depth planes for the 2.5D camera.\n'
          'export const DEPTH = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    open(os.path.join(ROOT, 'site/js/depth-data.js'), 'w').write(js)
    print('manifest', list(data))


if __name__ == '__main__':
    if sys.argv[1] == '--manifest':
        manifest()
    else:
        split(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 4, *(float(a) for a in sys.argv[3:4]))
