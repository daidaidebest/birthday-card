#!/usr/bin/env python3
"""Bakes the 2D skeleton rig the savanna shot uses to bring the two painted lions to life (v19).

    python3 tools/lion_rig.py --import <kaggle output dir>   # 1. keep the chosen SAM masks (tools/lion_rig/masks/*.png)
    python3 tools/lion_rig.py                                # 2. bake site/assets/img/lion-rig.{png,json} + lion-plate.webp
    python3 tools/lion_rig.py --preview DIR                  #    also write weight overlays / contact sheets to DIR
    python3 tools/lion_rig.py --check                        #    numeric check: faces stay rigid under every pose

Step 0 (GPU, once): tools/lion_rig_sam.py on Kaggle (SAM ViT-H part masks + Depth Anything V2 depth of the lions' box).

Nothing here repaints the lions. The browser draws the painting's own pixels through a skinned mesh (js/scenes/creatures.js):
every pixel moves by  p' = p + sum_i w_i(p) * (World_i - World_parent(i)) p  + breath + wind, where the bones are
    m.neck > m.head > m.ear          his neck (lowers the head), head (turns about the atlas), near ear
    f.neck > f.head > f.earL/f.earR  hers
    t1 > t2 > t3                     her tail, a chain
and the weights are 1 on each head (so a face can only move rigidly: no smearing), falling off smoothly through the
mane / neck. Her head lies behind his back: his back is redrawn on top as an occluder layer, so when she moves her head
it slides behind him instead of dragging his outline. The tail is its own layer over a plate (the tail inpainted away).
Eyes: lids slide down the painting's own fur, irises shift inside the eye opening (eye map tile).

Sheet layout (lion-rig.png, RGB, every tile the box size W x H, stacked vertically; 8-bit, weights 0..1):
  0  R m.neck   G m.head  B m.ear
  1  R mane (free strands: wind + lag)   G his breath (px per unit, /2)   B her breath (/2)
  2  R f.neck   G f.head  B f.earL
  3  R f.earR   G t1      B t2
  4  R t3       G tail layer alpha       B occluder alpha (his back over her head)
  5  R eye interior   G eye top (rel. to the eye rect)   B eye height (rel.)      (eye map, see EYES in the json)
"""
import os, sys, json, glob
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SITE = os.path.join(ROOT, 'site/assets')
MASKS = os.path.join(ROOT, 'tools/lion_rig/masks')
X0, Y0, X1, Y1 = 640, 120, 1104, 456          # the lions' box in lions.webp px (keep in sync with lion_rig_sam.py BOX)
W, H = X1 - X0, Y1 - Y0
PLANE_Y = 135                                  # depth/lions/2.webp starts at this row
# which SAM candidate (prompt_<name>_<k>.png) makes each part; several are unioned
CHOICE = {'him': [1], 'his_head': [0, 1], 'his_face': [0], 'his_ear': [0], 'his_mane': [1], 'his_body': [0], 'his_eye': [0],
          'her': [0, 1], 'her_head': [1], 'her_face': [0], 'her_ear_l': [0], 'her_ear_r': [0], 'her_eye_l': [0], 'her_eye_r': [0],
          'her_body': [0], 'tail': [0], 'rock': [1]}
# joints, lions.webp px
P = {'m.neck': (800, 268), 'm.head': (757, 212), 'f.neck': (918, 332), 'f.head': (895, 299)}
TAIL = [(976, 386), (1000, 396), (1024, 405), (1046, 412), (1068, 428)]
# ears: SAM's far-ear mask carries a strip of the crown with it, so it is clipped; base pivots set where each ear meets the head
EARS = {'his_ear': {}, 'her_ear_l': {'pivot': (882, 266)}, 'her_ear_r': {'pivot': (911, 249), 'min_x': 902}}
LINER = {'his_eye': 1.2, 'her_eye_l': 2.0, 'her_eye_r': 1.6}   # the painted upper lid line's thickness (px), part of the lid


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)


def to_box(xy): return xy[0] - X0, xy[1] - Y0


# ---------------------------------------------------------------------------------------------------------- inputs
def import_masks(src):
    os.makedirs(MASKS, exist_ok=True)
    for name, ks in CHOICE.items():
        m = None
        for k in ks:
            a = np.asarray(Image.open(os.path.join(src, f'prompt_{name}_{k}.png')), np.float32) / 255
            m = a if m is None else np.maximum(m, a)
        m = cv2.resize(m, (W, H), interpolation=cv2.INTER_AREA)            # 2x -> 1x: soft, antialiased edges
        Image.fromarray((m * 255 + .5).astype(np.uint8)).save(os.path.join(MASKS, f'{name}.png'), optimize=True)
    dp = os.path.join(src, 'depth.png')
    if os.path.exists(dp):
        d = np.asarray(Image.open(dp), np.float32) / 65535
        Image.fromarray((cv2.resize(d, (W, H), interpolation=cv2.INTER_AREA) * 255).astype(np.uint8)).save(os.path.join(MASKS, 'depth.png'))
    print('masks ->', MASKS)


def load_masks():
    return {os.path.basename(p)[:-4]: np.asarray(Image.open(p), np.float32) / 255 for p in glob.glob(os.path.join(MASKS, '*.png'))}


def plane_crop(name):
    """The rock-and-lions plane of a painting variant, cropped to the box (RGBA float, rows above the plane transparent)."""
    pl = np.asarray(Image.open(os.path.join(SITE, f'depth/{name}/2.webp')).convert('RGBA'), np.float32) / 255
    out = np.zeros((H, W, 4), np.float32)
    out[PLANE_Y - Y0:, :] = pl[:Y1 - PLANE_Y, X0:X1]
    return out


# ---------------------------------------------------------------------------------------------------------- helpers
def dist_to(mask):
    """Euclidean distance (px) from every pixel to the nearest pixel of a boolean mask."""
    return ndi.distance_transform_edt(~mask)


def blur(a, s): return cv2.GaussianBlur(a, (0, 0), s) if s > 0 else a


def spread(w, r=2):
    """Carries weights a few px past a part's edge (into transparent sky), so antialiased edge pixels move with the part."""
    return np.maximum(w, ndi.grey_dilation(w, size=(2 * r + 1, 2 * r + 1)) * .999)


def ear_weights(m, head_center, pivot=None, min_x=None):
    """An ear's weight: its mask, rising from 0 at its base (the end nearer the head's centre) to 1 a few px up. Pivot = base."""
    if min_x is not None: m = m.copy(); m[:, :min_x - X0] = 0
    ys, xs = np.nonzero(m > .5)
    pts = np.stack([xs, ys], 1).astype(np.float32); c = pts.mean(0)
    u, s, vt = np.linalg.svd(pts - c, full_matrices=False); ax = vt[0]
    proj = (pts - c) @ ax
    ends = [c + ax * proj.min(), c + ax * proj.max()]
    base_end = min(ends, key=lambda e: np.hypot(*(e - head_center)))
    sgn = 1 if np.allclose(base_end, ends[1]) else -1
    L = proj.max() - proj.min()
    # pivot: the middle of the ear's lowest fifth
    sel = (proj * sgn) > (proj * sgn).max() - L * .2
    pivot = pts[sel].mean(0) if pivot is None else np.array(to_box(pivot), np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    along = ((xx - pivot[0]) * ax[0] + (yy - pivot[1]) * ax[1]) * -sgn       # 0 at the base, growing toward the tip
    w = blur(np.clip(m * 1.15, 0, 1), .6) * sstep(1.5, L * .32, along)
    return spread(w, 1), (float(pivot[0] + X0), float(pivot[1] + Y0)), float(L)


def polyline_s(pts, xx, yy):
    """Arc length along a polyline of the nearest point, and the distance to it, for every pixel."""
    best = np.full(xx.shape, 1e9); s_out = np.zeros(xx.shape); acc = 0
    for (ax, ay), (bx, by) in zip(pts[:-1], pts[1:]):
        dx, dy = bx - ax, by - ay; L = np.hypot(dx, dy)
        t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / (L * L), 0, 1)
        d = np.hypot(xx - (ax + t * dx), yy - (ay + t * dy))
        sel = d < best; best[sel] = d[sel]; s_out[sel] = acc + t[sel] * L; acc += L
    return s_out, best, acc


# ---------------------------------------------------------------------------------------------------------- bake
def bake(preview=None):
    M = load_masks()
    day, night = plane_crop('lions'), plane_crop('lions-night')
    alpha = day[..., 3]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    b = lambda k, t=.5: M[k] > t
    him, her, rock = M['him'] * (alpha > .02), np.maximum(M['her'], M['her_head']) * (alpha > .02), M['rock']
    tiles = np.zeros((6, H, W, 3), np.float32)
    rig = {'box': [X0, Y0, W, H], 'bones': {}, 'eyes': [], 'layers': {}}

    # ---- him: neck > head > ear ----
    head_m = ndi.binary_dilation(b('his_head') | b('his_face'), iterations=1)
    d_head = dist_to(head_m)
    w_mh = np.where(head_m, 1, sstep(14, 0, d_head))
    w_mn = np.where(head_m, 1, sstep(70, 8, d_head)) * np.clip(spread(him + (1 - alpha), 2), 0, 1)
    w_mn = np.maximum(w_mn, w_mh)
    hc = np.array(to_box((728, 195)), np.float32)
    w_me, piv_me, _ = ear_weights(M['his_ear'], hc, **EARS['his_ear'])
    # free mane strands: far from the head and the body, more at the outer edge
    mane = b('his_mane') & ~head_m
    anchor = head_m | (b('his_body') & ~b('his_mane'))
    d_anchor = dist_to(anchor)
    d_edge = dist_to(~(b('his_mane') | b('him')) | (alpha < .5))
    w_mane = mane * sstep(3, 28, d_anchor) * (.4 + .6 * (1 - sstep(0, 12, d_edge)))
    w_mane = spread(blur(w_mane.astype(np.float32), 1.2), 2) * (1 - head_m)
    # ---- her: neck > head > ears ----
    fhead = ndi.binary_dilation(b('her_head'), iterations=1)
    d_fhead = dist_to(fhead)
    w_fh = np.where(fhead, 1, sstep(12, 0, d_fhead))
    w_fn = np.maximum(np.where(fhead, 1, sstep(42, 6, d_fhead)), w_fh)
    fc = np.array(to_box((905, 270)), np.float32)
    w_fl, piv_fl, _ = ear_weights(M['her_ear_l'], fc, **EARS['her_ear_l'])
    w_fr, piv_fr, _ = ear_weights(M['her_ear_r'], fc, **EARS['her_ear_r'])
    # her weights must not reach his face or mane (his back near her head is covered by the occluder)
    keep_off = ndi.binary_dilation(head_m | b('his_mane'), iterations=3)
    for w in (w_fh, w_fn): w[keep_off] = 0
    # ---- breath: the ribcage swells (back rises), the head and mane ride along rigidly ----
    rock_b = (rock > .5) & ~(b('him') | b('her'))
    d_rock = dist_to(rock_b)
    def breath(body, c, sig, ride):
        cx, cy = to_box(c)
        g = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sig * sig))
        f = np.clip(d_rock / 34, 0, 1) * (ride + (1 - ride) * g) * body
        return spread(blur(f.astype(np.float32), 2.5), 2)
    def rigid(f, region, v):
        """Forces a field to the constant v over a head (and blends back over 5 px), so the head rises as one piece."""
        k = np.clip(sstep(5, 0, dist_to(ndi.binary_dilation(region, iterations=2))), 0, 1)
        return f * (1 - k) + v * k
    br_m = breath(np.clip(him * 1.0, 0, 1), (822, 292), 46, .35)
    br_f = breath(np.clip(her * 1.0, 0, 1), (946, 346), 34, .3)
    under = br_m[to_box((872, 302))[1], to_box((872, 302))[0]]
    br_m = rigid(br_m, head_m, float(br_m[head_m].mean()))
    br_m = rigid(br_m, fhead, .6 * float(under))            # her head rests on his back: it rides his breath too
    br_f = rigid(br_f, fhead, float(br_f[fhead].mean()))
    br_f = rigid(br_f, head_m, 0.)
    # ---- tail: a chain along the painted tail; its own layer over a plate ----
    tpts = [to_box(p) for p in TAIL]
    s, dl, Ltail = polyline_s(tpts, xx, yy)
    tm = M['tail']; tmask = ndi.binary_dilation(tm > .35, iterations=1)
    near = dl < 16
    t1 = sstep(6, 18, s) * near; t2 = sstep(26, 38, s) * near; t3 = sstep(50, 62, s) * near
    tail_alpha = np.clip(tm * 1.1, 0, 1) * sstep(3, 9, s)
    root_zone = tmask & (s < 12)
    # in the base layer, the tail only exists in its root zone (with the same weights); beyond it the plate shows
    base_t1 = t1 * root_zone
    # ---- occluder: his back, redrawn over her head where her weights reach his body ----
    reach = (np.maximum(w_fn, w_fh) > .002) & (M['him'] > .15)
    occ = sstep(.4, .7, M['him']) * (1 - sstep(.4, .6, M['her_body'])) * np.clip(blur(ndi.binary_dilation(reach, iterations=3).astype(np.float32), 1.2) * 1.5, 0, 1)
    occ[fhead & (M['him'] < .5)] = 0
    # ---- eyes ----
    for key, who in (('his_eye', 0), ('her_eye_l', 1), ('her_eye_r', 1)):
        op = b(key); L = LINER[key]
        ys, xs = np.nonzero(op); rx0, rx1, ry0, ry1 = xs.min() - 2, xs.max() + 3, ys.min() - 4, ys.max() + 3
        top = np.full(W, np.nan); hgt = np.full(W, np.nan)
        for x in range(xs.min(), xs.max() + 1):
            col = np.nonzero(op[:, x])[0]
            if len(col): top[x] = col.min() - L; hgt[x] = col.max() + 1 - top[x]
        idx = np.arange(W); ok = ~np.isnan(top)
        top = np.interp(idx, idx[ok], top[ok]); hgt = np.interp(idx, idx[ok], hgt[ok])   # (replicated past the ends)
        inner = blur(ndi.distance_transform_edt(op).astype(np.float32), .5)
        m = np.clip(inner / 2.2, 0, 1)                                   # 0 at the opening's edge, 1 two px in
        ex = np.zeros((H, W), bool); ex[ry0:ry1, rx0:rx1] = True
        tiles[5, ..., 0] = np.where(ex, np.maximum(tiles[5, ..., 0], m), tiles[5, ..., 0])
        rh = ry1 - ry0
        tiles[5, ry0:ry1, rx0:rx1, 1] = ((top[rx0:rx1] - ry0) / rh)[None, :]
        tiles[5, ry0:ry1, rx0:rx1, 2] = (hgt[rx0:rx1] / rh)[None, :]
        cy, cx = ndi.center_of_mass(op)
        rig['eyes'].append({'name': key, 'who': who, 'rect': [rx0 + X0, ry0 + Y0, rx1 - rx0, rh], 'liner': L,
                            'c': [round(cx + X0, 1), round(cy + Y0, 1)], 'w': int(xs.max() - xs.min() + 1), 'h': int(ys.max() - ys.min() + 1)})
    # ---- pack ----
    tiles[0] = np.stack([w_mn, w_mh, w_me], -1)
    tiles[1] = np.stack([w_mane, br_m / 2, br_f / 2], -1)
    tiles[2] = np.stack([w_fn, w_fh, w_fl], -1)
    tiles[3] = np.stack([w_fr, t1 * (tmask | root_zone), t2 * tmask], -1)
    tiles[4] = np.stack([t3 * tmask, tail_alpha, occ], -1)
    sheet = (np.clip(tiles, 0, 1) * 255 + .5).astype(np.uint8).reshape(6 * H, W, 3)
    Image.fromarray(sheet).save(os.path.join(SITE, 'img/lion-rig.png'), optimize=True)
    # the base layer's tail weights differ from the tail layer's: store the root-zone limit
    rig['bones'] = {
        'm.neck': {'p': P['m.neck']}, 'm.head': {'p': P['m.head'], 'parent': 'm.neck'}, 'm.ear': {'p': piv_me, 'parent': 'm.head'},
        'f.neck': {'p': P['f.neck']}, 'f.head': {'p': P['f.head'], 'parent': 'f.neck'},
        'f.earL': {'p': piv_fl, 'parent': 'f.head'}, 'f.earR': {'p': piv_fr, 'parent': 'f.head'},
        't1': {'p': TAIL[0]}, 't2': {'p': TAIL[1], 'parent': 't1'}, 't3': {'p': TAIL[2], 'parent': 't2'}}
    for v in rig['bones'].values(): v['p'] = [round(float(v['p'][0]), 2), round(float(v['p'][1]), 2)]
    def bbox(m, pad):
        ys, xs = np.nonzero(m); return [int(max(0, xs.min() - pad)) + X0, int(max(0, ys.min() - pad)) + Y0, int(min(W, xs.max() + pad + 1) - max(0, xs.min() - pad)), int(min(H, ys.max() + pad + 1) - max(0, ys.min() - pad))]
    rig['layers'] = {'tail': bbox(tail_alpha > .01, 14), 'occ': bbox(occ > .01, 3), 'tailRoot': 12}
    rig['tail'] = [list(p) for p in TAIL]; rig['tailLen'] = round(float(Ltail), 1)
    rig['heads'] = {'him': bbox(head_m, 0), 'her': bbox(fhead, 0)}
    rig['ears'] = {'m': bbox(M['his_ear'] > .5, 0), 'fL': bbox(M['her_ear_l'] > .5, 0), 'fR': bbox(M['her_ear_r'] > .5, 0)}
    # ---- plates: the tail inpainted away, for the sunset and the night planes ----
    pm = (ndi.binary_dilation(tm > .2, iterations=2) & (s >= 7)).astype(np.uint8)
    tb = rig['layers']['tail']; bx, by, bw, bh = tb[0] - X0, tb[1] - Y0, tb[2], tb[3]
    plates = []
    for img in (day, night):
        pre = (img[..., :3] * img[..., 3:4] * 255).astype(np.uint8)
        a8 = (img[..., 3] * 255).astype(np.uint8)
        rgb = cv2.inpaint(pre, pm * 255, 5, cv2.INPAINT_TELEA).astype(np.float32)
        al = cv2.inpaint(a8, pm * 255, 5, cv2.INPAINT_TELEA).astype(np.float32) / 255
        al = np.where(al > .5, np.clip((al - .5) * 2.2 + .5, 0, 1), np.clip((al - .5) * 2.2 + .5, 0, 1))
        rgb = np.where(al[..., None] > 1e-3, rgb / 255 / np.maximum(al[..., None], 1e-3), 0)
        out = np.concatenate([np.clip(rgb, 0, 1), al[..., None]], -1)
        out = np.where(pm[..., None] > 0, out, img)     # only the plate region changes
        plates.append(out[by:by + bh, bx:bx + bw])
    pl = np.concatenate(plates, 1)
    Image.fromarray((pl * 255 + .5).astype(np.uint8), 'RGBA').save(os.path.join(SITE, 'img/lion-plate.webp'), lossless=True, quality=100, method=6)
    rig['plate'] = {'rect': tb, 'size': [bw, bh]}   # day at x 0, night at x bw
    json.dump(rig, open(os.path.join(SITE, 'img/lion-rig.json'), 'w'), separators=(',', ':'), default=lambda o: o.item() if hasattr(o, 'item') else float(o))
    print('baked', os.path.getsize(os.path.join(SITE, 'img/lion-rig.png')), 'B rig,', os.path.getsize(os.path.join(SITE, 'img/lion-plate.webp')), 'B plates')
    print(open(os.path.join(SITE, 'img/lion-rig.json')).read()[:1200])
    if preview: write_preview(preview, day, tiles, rig)
    return rig, tiles


def write_preview(d, day, tiles, rig):
    os.makedirs(d, exist_ok=True)
    base = day[..., :3] * day[..., 3:4] + np.array([.1, .55, .55]) * (1 - day[..., 3:4])
    names = [['m.neck', 'm.head', 'm.ear'], ['mane', 'breath m', 'breath f'], ['f.neck', 'f.head', 'f.earL'], ['f.earR', 't1', 't2'], ['t3', 'tail alpha', 'occluder'], ['eye in', 'eye top', 'eye h']]
    out = []
    for i in range(6):
        for c in range(3):
            w = tiles[i, ..., c][..., None]
            out.append(((base * .45 + np.array([1, .15, .1]) * w * .9 + base * (1 - w) * .3) * 255).clip(0, 255).astype(np.uint8))
    rows = [np.concatenate(out[r * 3:r * 3 + 3], 1) for r in range(6)]
    im = Image.fromarray(np.concatenate(rows, 0))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(im)
    for i in range(6):
        for c in range(3): dr.text((c * W + 4, i * H + 4), names[i][c], fill=(255, 255, 0))
    im.save(os.path.join(d, 'rig_weights.png'))
    print('preview ->', d)


# ---------------------------------------------------------------------------------------------------------- check
def check():
    """Skins the box under extreme poses (numpy mirror of creatures.js) and reports, inside each face (head mask minus
    ears, eroded 1 px), the largest deviation from that head's rigid transform."""
    rig = json.load(open(os.path.join(SITE, 'img/lion-rig.json')))
    sheet = np.asarray(Image.open(os.path.join(SITE, 'img/lion-rig.png')), np.float32).reshape(6, H, W, 3) / 255
    M = load_masks()
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32); X, Y = xx + X0, yy + Y0
    def aff(px, py, rot=0., sx=1., tx=0., ty=0.):
        c, s = np.cos(rot), np.sin(rot)
        A = np.array([[c * sx, -s], [s * sx, c]]); t = np.array([px + tx, py + ty]) - A @ np.array([px, py])
        return np.vstack([np.c_[A, t], [0, 0, 1]])
    worst = {}
    for pose in range(40):
        r = np.random.default_rng(pose)
        loc = {k: aff(*rig['bones'][k]['p'], rot=r.uniform(-.09, .09), sx=r.uniform(.96, 1.0) if k.endswith('head') else 1, tx=r.uniform(-2, 2), ty=r.uniform(-2, 2)) for k in rig['bones']}
        world = {}
        for k in ['m.neck', 'm.head', 'm.ear', 'f.neck', 'f.head', 'f.earL', 'f.earR', 't1', 't2', 't3']:
            par = rig['bones'][k].get('parent'); world[k] = (world[par] if par else np.eye(3)) @ loc[k]
        ch = {'m.neck': sheet[0, ..., 0], 'm.head': sheet[0, ..., 1], 'm.ear': sheet[0, ..., 2], 'f.neck': sheet[2, ..., 0], 'f.head': sheet[2, ..., 1], 'f.earL': sheet[2, ..., 2], 'f.earR': sheet[3, ..., 0]}
        dx = np.zeros_like(X); dy = np.zeros_like(Y)
        for k, w in ch.items():
            par = rig['bones'][k].get('parent'); D = world[k] - (world[par] if par else np.eye(3))
            dx += w * (D[0, 0] * X + D[0, 1] * Y + D[0, 2]); dy += w * (D[1, 0] * X + D[1, 1] * Y + D[1, 2])
        br_m, br_f = r.uniform(0, 1.6), r.uniform(0, 1.6)
        dy -= sheet[1, ..., 1] * 2 * br_m + sheet[1, ..., 2] * 2 * br_f
        mane = r.uniform(-4, 4); dx += sheet[1, ..., 0] * mane
        for who, hm, ears, hk in (('him', M['his_head'], [M['his_ear']], 'm.head'), ('her', M['her_head'], [M['her_ear_l'], M['her_ear_r']], 'f.head')):
            face = (hm > .5) & ~ndi.binary_dilation(np.max(ears, 0) > .2, iterations=3)
            face = ndi.binary_erosion(face, iterations=1)
            Wd = world[hk]; rx = Wd[0, 0] * X + Wd[0, 1] * Y + Wd[0, 2]; ry = Wd[1, 0] * X + Wd[1, 1] * Y + Wd[1, 2]
            bm = sheet[1, ..., 1 if who == 'him' else 2] * 2 * (br_m if who == 'him' else br_f)
            if who == 'her': bm = bm + 0   # (her head also rides his breath through br_f's head value)
            ex = (X + dx) - rx; ey = (Y + dy) - ry
            # remove the rigid breath translation of the head (a constant over the face by construction)
            ex, ey = ex[face], ey[face]; ey = ey - np.median(ey); ex = ex - np.median(ex)
            dev = float(np.max(np.hypot(ex, ey)))
            worst[who] = max(worst.get(who, 0), dev)
    print('largest non-rigid motion inside the faces over 40 random poses (px, 1 = one painting pixel):', {k: round(v, 3) for k, v in worst.items()})
    return worst


if __name__ == '__main__':
    a = sys.argv[1:]
    if '--import' in a: import_masks(a[a.index('--import') + 1])
    elif '--check' in a: check()
    else: bake(a[a.index('--preview') + 1] if '--preview' in a else None)
