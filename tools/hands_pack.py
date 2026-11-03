"""Packs the rendered hands (tools/blender/hands.py) for the page: hands_pack.py SRC -> site/assets/img/hands/h01..h36.webp, hands.json.
Sized for the phone, the arms and fingertips melting away toward the frame's edges so no edge shows over the painting."""
import sys, os, json
import numpy as np
from PIL import Image
SRC = sys.argv[1]; OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'assets', 'img', 'hands'); os.makedirs(OUT, exist_ok=True)
meta = json.load(open(os.path.join(SRC, 'hands.json'))); W, H = 480, 360; total = 0
for i in range(1, meta['frames'] + 1):
    a = np.asarray(Image.open(os.path.join(SRC, f'h{i:03d}.png')).convert('RGBA').resize((W, H), Image.LANCZOS)).astype(np.float32)
    y = np.arange(H); fade = np.clip((H * .97 - y) / (H * .3), 0, 1) ** 1.4 * np.clip((y - H * .01) / (H * .2), 0, 1) ** 1.2; a[..., 3] *= fade[:, None]   # (the longest fingers leave the render: they melt into the night too)
    p = os.path.join(OUT, f'h{i:02d}.webp'); Image.fromarray(a.clip(0, 255).astype(np.uint8)).save(p, quality=82, method=6, alpha_quality=80); total += os.path.getsize(p)
json.dump({'frames': meta['frames'], 'w': W, 'h': H, 'star': meta['star']}, open(os.path.join(OUT, 'hands.json'), 'w'))
print(meta['frames'], 'frames', total // 1024, 'KB, decoded', W * H * 4 * meta['frames'] // 1048576, 'MB')
