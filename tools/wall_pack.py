#!/usr/bin/env python3
"""The memories wall: packs the Cycles renders (tools/blender/wall.py) into site/assets/img/wall/ for the page.
  python3 tools/wall_pack.py RENDER_DIR      (wall.png, frame-a..d.png, frames.json)"""
import sys, os, json
from PIL import Image
src = sys.argv[1]; out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'site', 'assets', 'img', 'wall'); os.makedirs(out, exist_ok=True)
Image.open(f'{src}/wall.png').convert('RGB').resize((1800, 1800), Image.LANCZOS).save(f'{out}/wall.webp', quality=80, method=6)
meta = json.load(open(f'{src}/frames.json'))
for k in meta:
    im = Image.open(f'{src}/frame-{k}.png').convert('RGBA'); w = 900; h = round(im.height * w / im.width) if im.width >= im.height else None
    if h is None: h = 900; w = round(im.width * h / im.height)
    im.resize((w, h), Image.LANCZOS).save(f'{out}/frame-{k}.webp', quality=86, alpha_quality=90, method=6); meta[k].update(w=w, h=h)
json.dump(meta, open(f'{out}/frames.json', 'w'), separators=(',', ':'))
print({f: os.path.getsize(f'{out}/{f}') // 1024 for f in sorted(os.listdir(out))})
