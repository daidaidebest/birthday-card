"""Packs painted creature frames into one WebP sprite sheet per clip, plus a manifest with frame
rectangles and the per-frame anchors written by the renderer (rescaled to the cropped frame).

python3 tools/creatures/pack.py <render-dir> <out-dir> <name> [--scale .75] [--cols 6]
  <render-dir>/painted/<Clip>_<frame>.png and <render-dir>/anchors.json are read;
  writes <out-dir>/<name>-<clip>.webp and <out-dir>/<name>.json
"""
import json, glob, os, argparse, re
import numpy as np
import cv2

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('name')
ap.add_argument('--scale', type=float, default=.75); ap.add_argument('--cols', type=int, default=6)
ap.add_argument('--quality', type=int, default=82)
a = ap.parse_args()
os.makedirs(a.dst, exist_ok=True)
meta = json.load(open(f'{a.src}/anchors.json'))
W0, H0 = meta['size']
frames = {}
for p in sorted(glob.glob(f'{a.src}/painted/*.png')):
    m = re.match(r'(.+)_(\d+)\.png$', os.path.basename(p)); frames.setdefault(m.group(1), []).append(p)
# one crop for every clip, so the creature stays registered when clips change
box = [W0, H0, 0, 0]
for clip in frames.values():
    for p in clip:
        al = cv2.imread(p, cv2.IMREAD_UNCHANGED)[..., 3]
        ys, xs = np.where(al > 4)
        if len(xs): box = [min(box[0], xs.min()), min(box[1], ys.min()), max(box[2], xs.max() + 1), max(box[3], ys.max() + 1)]
pad = 6; box = [int(max(0, box[0] - pad)), int(max(0, box[1] - pad)), int(min(W0, box[2] + pad)), int(min(H0, box[3] + pad))]
cw, ch = box[2] - box[0], box[3] - box[1]
fw, fh = round(cw * a.scale), round(ch * a.scale)
out = {'frame': [fw, fh], 'crop': box, 'source': [W0, H0], 'fps': meta['fps'], 'clips': {}}
total = 0
for name, paths in frames.items():
    n = len(paths); cols = min(a.cols, n); rows = (n + cols - 1) // cols
    sheet = np.zeros((rows * fh, cols * fw, 4), np.float32)
    for i, p in enumerate(paths):
        im = cv2.imread(p, cv2.IMREAD_UNCHANGED).astype(np.float32) / 255
        im = im[box[1]:box[3], box[0]:box[2]]
        pm = np.dstack([im[..., :3] * im[..., 3:4], im[..., 3:4]])  # resample premultiplied, then un-premultiply
        pm = cv2.resize(pm, (fw, fh), interpolation=cv2.INTER_AREA)
        al = np.maximum(pm[..., 3:4], 1e-4)
        r, c = divmod(i, cols)
        sheet[r * fh:(r + 1) * fh, c * fw:(c + 1) * fw] = np.dstack([np.where(al > 1e-3, pm[..., :3] / al, 0), pm[..., 3:4]])
    path = f'{a.dst}/{a.name}-{name.lower()}.webp'
    cv2.imwrite(path, (np.clip(sheet, 0, 1) * 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, a.quality])
    total += os.path.getsize(path)
    # anchors in cropped-frame space, 0..1
    anchors = [{k: [round((v[0] * W0 - box[0]) / cw, 4), round((v[1] * H0 - box[1]) / ch, 4)] for k, v in f.items()} for f in meta['clips'][name]]
    out['clips'][name] = {'file': os.path.basename(path), 'n': n, 'cols': cols, 'anchors': anchors}
json.dump(out, open(f'{a.dst}/{a.name}.json', 'w'), separators=(',', ':'))
print(a.name, 'frame', fw, fh, 'bytes', total)
