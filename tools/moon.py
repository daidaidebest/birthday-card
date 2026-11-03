"""Moon disc for the opening gate, from NASA's public-domain LRO WAC near-side mosaic
(NASA/GSFC/Arizona State University, via Wikimedia Commons: File:Moon_nearside_LRO.jpg).

python3 tools/moon.py <Moon_nearside_LRO.jpg> site/assets/img/moon.webp [size]
"""
import sys
import numpy as np
import cv2

src, dst = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 720
im = cv2.imread(src).astype(np.float32) / 255
g = im.mean(axis=2)
# find the disc: the bright region's extent
ys, xs = np.where(g > .08)
cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
r = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2
pad = int(r * 1.0)
crop = im[int(cy - pad):int(cy + pad), int(cx - pad):int(cx + pad)]
crop = cv2.resize(crop, (N, N), interpolation=cv2.INTER_AREA)
yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
d = np.hypot(xx - N / 2 + .5, yy - N / 2 + .5) / (N / 2)
lum = crop.mean(axis=2)
# soft tone curve: open the maria a little, keep crater relief
lum = np.clip((lum - .03) / .5, 0, 1) ** .72
# gentle limb darkening so it reads as a sphere at full phase, plus a cool rim
mu = np.sqrt(np.clip(1 - d * d, 0, 1))
lum = lum * (.72 + .28 * mu ** .6)
tint = np.array([.84, .94, 1.0])[None, None, :]  # BGR: warm ivory
col = lum[..., None] * tint * 1.04
alpha = np.clip((1 - d) * N / 2 / 1.2, 0, 1)
out = np.dstack([np.clip(col, 0, 1) * 255, alpha * 255]).astype(np.uint8)
cv2.imwrite(dst, out, [cv2.IMWRITE_WEBP_QUALITY, 90])
print(dst, N)
