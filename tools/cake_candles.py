"""Shortens the painted cake's candles: cuts D rows out of the middle of each stem, slides the top (with its wick)
down to meet the rest and blends the joint. Run once on the original cut-out; then add D to every wick's y in
site/js/scenes/cake.js (and the per-candle shift printed here to its x)."""
import sys
import numpy as np
from PIL import Image

D, C, B = 140, 235, 14   # rows removed, the row the cut ends at, rows blended above it
src = sys.argv[1] if len(sys.argv) > 1 else 'site/assets/img/cake.webp'
a = np.array(Image.open(src).convert('RGBA')).astype(np.float32)

def runs(y):
    r, xs, x = a[y, :, 3] > 128, [], 0
    while x < a.shape[1]:
        if r[x]:
            s = x
            while x < a.shape[1] and r[x]: x += 1
            xs.append((s, x - 1))
        x += 1
    return xs

out = a.copy()
for (s, e), lo in zip(runs(C - D), runs(C)):
    dx = round(((lo[0] + lo[1]) - (s + e)) / 2)   # the candles lean a little: line the two pieces up
    x0, x1 = s - 6, e + 7
    reg = np.zeros((C, x1 - x0, 4), np.float32)
    reg[D:C] = a[0:C - D, x0 - dx:x1 - dx]
    for k in range(B):
        y, w = C - B + k, (k + 1) / (B + 1)
        reg[y] = reg[y] * (1 - w) + a[y, x0:x1] * w
    out[0:C, x0:x1] = reg
    print('candle at', s, 'shift', dx)
Image.fromarray(out.round().clip(0, 255).astype(np.uint8)).save(src, quality=92, method=6, alpha_quality=100)
