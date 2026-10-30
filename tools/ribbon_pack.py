"""Pack the ribbon renders for the page: site/assets/img/ribbon/ (still.webp, u00.webp.., ribbon.json).
  python3 tools/ribbon_pack.py FRAMES_DIR [--sim SIM.npz] [--frame-px 800] [--still-px 1200] [--out DIR] [--q 82]
FRAMES_DIR holds f_0000.png.. and still.png from tools/blender/ribbon_gpu.py (RGBA, straight alpha). Each frame is
cropped to what it shows (the contact shadow included) so the phone decodes only the ribbon; the JSON says where each
crop sits on the canvas, where the canvas sits on the envelope, the untie's timing and the tail's path for the drag."""
import os, sys, json, argparse, numpy as np
from PIL import Image
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blender'))
import ribbon_sim as R

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
CANVAS = dict(x0=-.56 * R.EW, x1=.56 * R.EW, y0=-R.EH / 2 - .070, y1=.004)     # = tools/blender/ribbon.py
FLAP_TIP = .663                                                                  # the flap's point, from the top (tools/parchment.py)
ap = argparse.ArgumentParser(); ap.add_argument('frames'); ap.add_argument('--sim'); ap.add_argument('--frame-px', type=int, default=800)
ap.add_argument('--still-px', type=int, default=1200); ap.add_argument('--out', default=os.path.join(ROOT, 'site', 'assets', 'img', 'ribbon'))
ap.add_argument('--q', type=int, default=82); a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
cw, ch = (CANVAS['x1'] - CANVAS['x0']) / R.EW, (CANVAS['y1'] - CANVAS['y0']) / R.EW   # canvas size in envelope widths


def clean(im, px):
    """Resize to px (envelope width), drop the faintest shadow (it would only widen the crop), feather the top edge."""
    W, H = round(cw * px), round(ch * px)
    if im.size != (W, H):
        # resize premultiplied, so edges against transparency stay clean
        f = np.asarray(im.convert('RGBA')).astype(np.float32) / 255; f[..., :3] *= f[..., 3:]
        f = np.stack([np.asarray(Image.fromarray(f[..., k]).resize((W, H), Image.LANCZOS)) for k in range(4)], -1).clip(0, 1)
    else:
        f = np.asarray(im.convert('RGBA')).astype(np.float32) / 255; f[..., :3] *= f[..., 3:]
    y = np.arange(H)[:, None]; fb = np.clip((H - 1 - y) / (H * .2), 0, 1)   # it fades as it falls out below the envelope
    k = (f[..., 3] >= 2.5 / 255) * np.clip(y / 6., 0, 1) ** .5 * fb * fb * (3 - 2 * fb)   # and no seam where the canvas starts
    f *= k[..., None]; al = f[..., 3]
    out = np.zeros_like(f); out[..., 3] = al; m = al > 0; out[m, :3] = np.minimum(f[m, :3] / al[m, None], 1)
    return Image.fromarray((out * 255 + .5).clip(0, 255).astype(np.uint8), 'RGBA')


def crop(im, pad=2):
    al = np.asarray(im)[..., 3]; ys, xs = np.nonzero(al)
    if not len(xs): return None, (0, 0, 1, 1)
    x0, y0 = max(xs.min() - pad, 0), max(ys.min() - pad, 0); x1, y1 = min(xs.max() + pad + 1, im.width), min(ys.max() + pad + 1, im.height)
    return im.crop((x0, y0, x1, y1)), (int(x0), int(y0), int(x1 - x0), int(y1 - y0))


names = sorted(f for f in os.listdir(a.frames) if f.startswith('f_') and f.endswith('.png'))
frames, total, dec = [], 0, 0
for k, n in enumerate(names):
    im = clean(Image.open(os.path.join(a.frames, n)), a.frame_px); c, box = crop(im)
    fn = 'u%02d.webp' % k
    if c is None: c = Image.new('RGBA', (1, 1))
    c.save(os.path.join(a.out, fn), 'WEBP', quality=a.q, alpha_quality=90, method=6)
    total += os.path.getsize(os.path.join(a.out, fn)); dec += box[2] * box[3] * 4
    frames.append([fn, *box])
still = os.path.join(a.frames, 'still.png')
st = clean(Image.open(still if os.path.exists(still) else os.path.join(a.frames, names[0])), a.still_px)
st.save(os.path.join(a.out, 'still.webp'), 'WEBP', quality=88, alpha_quality=95, method=6)
man = dict(v=1, fps=R.FPS, size=[round(cw * a.frame_px), round(ch * a.frame_px)], still='still.webp', stillSize=list(st.size),
           rect=dict(left=round((CANVAS['x0'] + R.EW / 2) / R.EW, 5), top=round((R.EH / 2 - CANVAS['y1']) / R.EH, 5),
                     width=round(cw, 5), height=round((CANVAS['y1'] - CANVAS['y0']) / R.EH, 5)),
           frames=frames)
T = R.TIMES; end = (len(frames) - 1) / R.FPS
man['t'] = dict(grip=T['grip'], pop=T['pop'], free=T['pop'] + .25, end=round(end, 3))
man['grab'] = [.5, R.SEAL_Y + .08, .13]
if a.sim:
    S = np.load(a.sim); X = S['X']
    fx = lambda p: [round((p[0] + R.EW / 2) / R.EW, 4), round((R.EH / 2 - p[1]) / R.EH, 4)]
    man['pull'] = [[round(f / R.FPS, 3), *fx(X[f][-1])] for f in range(len(X)) if f / R.FPS <= T['pop'] + 1e-6]
    # the flap is free once nothing in front of the envelope is left above its point (plus half a ribbon)
    lim = R.EH / 2 - FLAP_TIP * R.EH - R.RW * .6
    for f in range(len(X)):
        front = X[f][:, 2] > -R.ET / 2
        if f / R.FPS > T['pop'] and not (X[f][front, 1] > lim).any(): man['t']['free'] = round(f / R.FPS, 3); break
json.dump(man, open(os.path.join(a.out, 'ribbon.json'), 'w'), separators=(',', ':'))
print(f"{len(frames)} frames, {total / 1024:.0f} KB webp, decoded {dec / 2 ** 20:.1f} MB; still {os.path.getsize(os.path.join(a.out, 'still.webp')) / 1024:.0f} KB; t={man['t']}")
