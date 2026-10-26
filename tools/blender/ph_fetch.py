"""Fetch Poly Haven (CC0) textures / models / HDRIs into ~/projects/render-workspace/assets/ph/<name>/.
usage: ph_fetch.py tex NAME [RES]   |  ph_fetch.py model NAME [RES]  |  ph_fetch.py hdri NAME [RES]"""
import json, os, sys, urllib.request
ROOT = os.path.expanduser('~/projects/render-workspace/assets/ph')
def get(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0: return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 render-workspace'})
    with urllib.request.urlopen(req) as r, open(path + '.part', 'wb') as f: f.write(r.read())
    os.replace(path + '.part', path)
kind, name = sys.argv[1], sys.argv[2]; res = sys.argv[3] if len(sys.argv) > 3 else '2k'
d = json.load(urllib.request.urlopen(urllib.request.Request('https://api.polyhaven.com/files/' + name, headers={'User-Agent': 'Mozilla/5.0'})))
out = os.path.join(ROOT, name)
if kind == 'tex':
    for m in ['Diffuse', 'nor_gl', 'Rough', 'Displacement', 'AO', 'arm']:
        if m in d and res in d[m]:
            fm = d[m][res]; f = fm.get('jpg') or fm.get('png'); get(f['url'], os.path.join(out, f"{m}.{f['url'].rsplit('.',1)[1]}"))
elif kind == 'model':
    g = d['gltf'][res]['gltf']; get(g['url'], os.path.join(out, os.path.basename(g['url'])))
    for rel, v in g.get('include', {}).items(): get(v['url'], os.path.join(out, rel))
elif kind == 'hdri':
    f = d['hdri'][res]['exr']; get(f['url'], os.path.join(out, name + '.exr'))
print('ok', name, sorted(os.listdir(out)))
