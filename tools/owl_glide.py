"""Cuts the gliding snowy owl out of its photograph (FLUX.1-schnell, see tools/video/) using its depth map
(depth/owl-photo.npy from tools/depth.py). Writes site/assets/img/owl-glide.webp; it glides across the castle's sky in
the prologue (site/js/scenes/prologue.js) and lets go of the letter just out of frame."""
import os, sys
import numpy as np, cv2
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-1000/owl-photo.png'
rgb = np.asarray(Image.open(src).convert('RGB'))
d = np.load(f'{ROOT}/depth/owl-photo.npy').astype(np.float32)
a = np.clip((d - .55) / .12, 0, 1)                      # the owl is by far the nearest thing in the picture
n, lab, st, _ = cv2.connectedComponentsWithStats((a > .5).astype(np.uint8), 8)
k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); keep = cv2.dilate((lab == k).astype(np.uint8), np.ones((9, 9), np.uint8))
a = cv2.GaussianBlur(a * keep, (0, 0), 1.0)
x, y, w, h, _ = st[k]; pad = 12; x0, y0, x1, y1 = max(0, x - pad), max(0, y - pad), min(rgb.shape[1], x + w + pad), min(rgb.shape[0], y + h + pad)
# un-premultiply the sky out of the soft edge a little: pull edge colours toward the owl's own whites
out = np.dstack([rgb, (a * 255).astype(np.uint8)])[y0:y1, x0:x1]
Image.fromarray(out, 'RGBA').save(f'{ROOT}/site/assets/img/owl-glide.webp', quality=92, method=6, alpha_quality=100)
print('owl box', (x0, y0, x1, y1), 'size', (x1 - x0, y1 - y0))
