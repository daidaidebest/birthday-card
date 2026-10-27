# A snowy owl (v16), exec'd from castle.py (uses its namespace: s, FPS, FRAMES, MOON_DIR, PORT, PREVIEW, cam_matrix, blu...).
# Built feather by feather: ten slotted primaries, secondaries, tertials and two rows of coverts on each wing, carried by a
# shoulder-elbow-wrist chain; a fanned tail; a round head with a facial disc, half-lidded golden eyes with a glossy coat and a
# hooked beak almost hidden in bristles; a coat of short hair-curve plumage over the body and head so the silhouette is
# soft; feathered feet holding a sealed letter with a gold star. Feather textures (shape, rachis, barbs, a few dark bars)
# are painted procedurally with numpy and packed.
# Flight: deep strokes (the downstroke slower than the upstroke, the hand folding back and the primaries closing on the way
# up, opening into fingers on the way down), long glides with small corrections, the body lifting on each downstroke, a
# bank as it climbs away; the head stays level and turns to look at the camera as it passes the moon.
import bpy, bmesh, math, random
import numpy as np
from mathutils import Vector, Matrix, Euler, Quaternion

OWL = collection('Owl')
RO = random.Random(5)

# ---------------------------------------------------------------- feather textures
def feather_img(name, kind, seed, W=96, H=384):
    rng = np.random.default_rng(seed)
    v = (np.arange(H) + .5) / H; x = (np.arange(W) + .5) / W * 2 - 1
    V, X = np.meshgrid(v, x, indexing='ij')
    sm = lambda a, b, t: np.clip((t - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((t - a) / (b - a), 0, 1))
    prof = np.clip(V / .06, 0, 1) ** .5 * np.sqrt(np.clip(1 - np.clip((V - .74) / .26, 0, None) ** 2, 0, 1))
    if kind == 'primary': xr, ao, ai = -.5, .36, 1.4 * (1 - .32 * sm(.5, .62, V))
    elif kind == 'secondary': xr, ao, ai = -.25, .7, 1.2
    elif kind == 'tail': xr, ao, ai = -.05, .9, .95
    else: xr, ao, ai = 0, .9, .9
    d = X - xr; edge = np.where(d < 0, ao * prof + d, ai * prof - d)          # distance inside the vane (x units)
    barb = .5 + .5 * np.sin(2 * np.pi * (V * 46 - np.abs(d) * 9))
    rag = np.clip(edge / .16, 0, 1)
    alpha = np.clip(edge / .035, 0, 1) * (1 - (1 - rag) * .55 * barb) * np.clip(prof * 4, 0, 1)
    col = np.ones((H, W, 3)) * np.array([.95, .95, .93])
    col *= (.93 + .07 * barb)[..., None]
    col *= (.86 + .14 * np.clip(V / .3, 0, 1))[..., None]                     # greyer toward the hidden root
    rach = np.exp(-(d / .03) ** 2) * np.clip(1 - V * 1.1, 0, 1); col = col * (1 - rach[..., None] * .3)
    # a few dark marks: subterminal bars on flight feathers, a small chevron on coverts
    dark = np.zeros((H, W))
    if kind in ('primary', 'secondary', 'tail'):
        bars = [.58, .72, .86] if kind == 'primary' else [.5, .74] if kind == 'secondary' else [.62, .84]
        for b in bars:
            if rng.random() < .25: continue
            wob = .012 * np.sin(np.abs(d) * 9 + rng.random() * 6)
            dark = np.maximum(dark, np.exp(-((V - b - wob) / .022) ** 2) * (.55 + .45 * rng.random()) * np.clip(1.25 - np.abs(d), 0, 1))
    else:
        if rng.random() < .65:
            c = .74 + rng.random() * .1
            dark = np.exp(-((V - c + np.abs(d) * .18) / .04) ** 2) * np.exp(-(d / .45) ** 2) * (.6 + .4 * rng.random())
    col = col * (1 - dark[..., None] * .82) + dark[..., None] * np.array([.09, .075, .065]) * .82
    rgba = np.concatenate([col, alpha[..., None]], axis=2).astype(np.float32)
    im = bpy.data.images.new(name, W, H, alpha=True); im.pixels.foreach_set(rgba.ravel()); im.pack(); return im

def feather_mat(name, img, under=.28):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; P = N['Principled BSDF']; out = N['Material Output']
    tx = N.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Cubic'; tx.extension = 'CLIP'
    oi = N.new('ShaderNodeObjectInfo'); vr = N.new('ShaderNodeMapRange'); vr.inputs[3].default_value = .93; vr.inputs[4].default_value = 1.03; link(nt, oi.outputs['Random'], vr.inputs[0])
    hs = N.new('ShaderNodeHueSaturation'); link(nt, tx.outputs['Color'], hs.inputs['Color']); link(nt, vr.outputs[0], hs.inputs['Value'])
    link(nt, hs.outputs[0], P.inputs['Base Color']); P.inputs['Roughness'].default_value = .55; P.inputs['Sheen Weight'].default_value = .7; P.inputs['Sheen Roughness'].default_value = .35
    tr = N.new('ShaderNodeBsdfTranslucent'); link(nt, hs.outputs[0], tr.inputs['Color'])
    mx = N.new('ShaderNodeMixShader'); mx.inputs[0].default_value = under; link(nt, P.outputs[0], mx.inputs[1]); link(nt, tr.outputs[0], mx.inputs[2])
    tp = N.new('ShaderNodeBsdfTransparent'); ma = N.new('ShaderNodeMixShader'); link(nt, tx.outputs['Alpha'], ma.inputs[0]); link(nt, tp.outputs[0], ma.inputs[1]); link(nt, mx.outputs[0], ma.inputs[2])
    link(nt, ma.outputs[0], out.inputs[0]); return m

F_PRIM = [feather_mat(f'owl_prim{k}', feather_img(f'fx_prim{k}', 'primary', 10 + k), .32) for k in range(3)]
F_SEC = [feather_mat(f'owl_sec{k}', feather_img(f'fx_sec{k}', 'secondary', 20 + k), .3) for k in range(2)]
F_COV = [feather_mat(f'owl_cov{k}', feather_img(f'fx_cov{k}', 'covert', 30 + k), .2) for k in range(3)]
F_TAIL = feather_mat('owl_tail', feather_img('fx_tail', 'tail', 40), .3)

def plumage_mat(name, spots=.3, scale=26.0, base=(.9, .9, .88)):
    """Soft white plumage for the body shells and the hair-curve fluff: a few dark flecks (voronoi), sheen."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; P = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale * 1.8, scale); link(nt, tc.outputs['Object'], mp.inputs[0])
    vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Randomness'].default_value = .95; link(nt, mp.outputs[0], vo.inputs['Vector'])
    th = N.new('ShaderNodeMapRange'); th.inputs[1].default_value = .12; th.inputs[2].default_value = .2; link(nt, vo.outputs['Distance'], th.inputs[0])
    sc = N.new('ShaderNodeSeparateColor'); link(nt, vo.outputs['Color'], sc.inputs[0])
    ck = N.new('ShaderNodeMath'); ck.operation = 'GREATER_THAN'; ck.inputs[1].default_value = 1 - spots; link(nt, sc.outputs[0], ck.inputs[0])
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; link(nt, th.outputs[0], inv.inputs[1])
    sp = N.new('ShaderNodeMath'); sp.operation = 'MULTIPLY'; link(nt, inv.outputs[0], sp.inputs[0]); link(nt, ck.outputs[0], sp.inputs[1])
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'; link(nt, sp.outputs[0], col.inputs[0]); col.inputs[6].default_value = (*base, 1); col.inputs[7].default_value = (.1, .085, .075, 1)
    link(nt, col.outputs[2], P.inputs['Base Color']); P.inputs['Roughness'].default_value = .7; P.inputs['Sheen Weight'].default_value = 1; P.inputs['Sheen Roughness'].default_value = .4
    return m, col
BODYM, _ = plumage_mat('owl_plumage', spots=.07)
FACEM, _ = plumage_mat('owl_face', spots=0, base=(.94, .94, .93))
def hair_mat(name, spots=.06, base=(.92, .92, .9)):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.remove(N['Principled BSDF']); out = N['Material Output']
    _, col = plumage_mat(name + '_c', spots=spots, base=base); h = N.new('ShaderNodeBsdfHairPrincipled'); h.parametrization = 'COLOR'
    # copy the fleck pattern into this tree
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (26, 47, 26); link(nt, tc.outputs['Object'], mp.inputs[0])
    vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Randomness'].default_value = .95; link(nt, mp.outputs[0], vo.inputs['Vector'])
    th = N.new('ShaderNodeMapRange'); th.inputs[1].default_value = .12; th.inputs[2].default_value = .2; link(nt, vo.outputs['Distance'], th.inputs[0])
    sc = N.new('ShaderNodeSeparateColor'); link(nt, vo.outputs['Color'], sc.inputs[0])
    ck = N.new('ShaderNodeMath'); ck.operation = 'GREATER_THAN'; ck.inputs[1].default_value = 1 - spots; link(nt, sc.outputs[0], ck.inputs[0])
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; link(nt, th.outputs[0], inv.inputs[1])
    sp = N.new('ShaderNodeMath'); sp.operation = 'MULTIPLY'; link(nt, inv.outputs[0], sp.inputs[0]); link(nt, ck.outputs[0], sp.inputs[1])
    cm = N.new('ShaderNodeMix'); cm.data_type = 'RGBA'; link(nt, sp.outputs[0], cm.inputs[0]); cm.inputs[6].default_value = (*base, 1); cm.inputs[7].default_value = (.12, .1, .09, 1)
    link(nt, cm.outputs[2], h.inputs['Color']); h.inputs['Roughness'].default_value = .38; h.inputs['Radial Roughness'].default_value = .5; h.inputs['Coat'].default_value = .15
    link(nt, h.outputs[0], out.inputs[0]); return m
HAIR = hair_mat('owl_hair'); HAIRF = hair_mat('owl_hairface', spots=0, base=(.95, .95, .94))
EYE = bpy.data.materials.new('owl_eye'); EYE.use_nodes = True
def _eye():
    nt = EYE.node_tree; N = nt.nodes; P = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Object'], sp.inputs[0])
    cx = N.new('ShaderNodeCombineXYZ'); link(nt, sp.outputs['X'], cx.inputs['X']); link(nt, sp.outputs['Z'], cx.inputs['Y'])
    ln = N.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; link(nt, cx.outputs[0], ln.inputs[0])
    nr = N.new('ShaderNodeMath'); nr.operation = 'DIVIDE'; nr.inputs[1].default_value = .0165; link(nt, ln.outputs['Value'], nr.inputs[0])
    ramp = N.new('ShaderNodeValToRGB'); E = ramp.color_ramp.elements
    E[0].position = .38; E[0].color = (0, 0, 0, 1); E[1].position = .44; E[1].color = (.95, .62, .05, 1)
    e = E.new(.78); e.color = (1, .78, .16, 1); e = E.new(.92); e.color = (.35, .2, .02, 1); e = E.new(.97); e.color = (.02, .02, .02, 1)
    link(nt, nr.outputs[0], ramp.inputs[0]); link(nt, ramp.outputs[0], P.inputs['Base Color'])
    P.inputs['Roughness'].default_value = .35; P.inputs['Coat Weight'].default_value = 1; P.inputs['Coat Roughness'].default_value = .02
_eye()
BEAK = mat('owl_beak', (.05, .045, .045), .3)
TALON = mat('owl_talon', (.02, .02, .02), .25)
PAPER = mat('owl_letter', (.78, .69, .52), .75)
STARG = mat('owl_star', (.9, .68, .28), .2, metal=1)

# ---------------------------------------------------------------- geometry helpers
def ellipsoid(name, c, r, parent, mats, seg=32, rings=20, taper=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in bm.verts:
        x, y, z = v.co
        if taper: x, y, z = taper(x, y, z)
        v.co = Vector((c[0] + x * r[0], c[1] + y * r[1], c[2] + z * r[2]))
    ob = obj_from_bm(name, bm, mats, col=OWL, smooth=True); ob.parent = parent; return ob

def card(bm, L, Wd, bend=.0, camber=.0, mirror=False, M=Matrix(), uvl=None, nu=3, nv=9, twist=0.0):
    """A feather card from its root along +x, its narrow (leading) vane toward +y (or -y mirrored)."""
    grid = []
    for j in range(nv + 1):
        v = j / nv; row = []
        for i in range(nu + 1):
            u = i / nu; y = ((u - .5) if mirror else (.5 - u)) * Wd * (.55 + .45 * min(1, v * 6))
            z = -bend * L * v * v + camber * Wd * (1 - (2 * u - 1) ** 2) + math.sin(twist) * y * v
            row.append((bm.verts.new(M @ Vector((v * L, y, z))), u, v))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            q = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]]
            f = bm.faces.new([a[0] for a in (q if not mirror else q[::-1])]); f.smooth = True
            if uvl:
                for lp, a in zip(f.loops, (q if not mirror else q[::-1])): lp[uvl].uv = (a[1], a[2])
    return grid

def cards_object(name, specs, parent, mats, sx):
    """specs: [(root(x,y,z), angle_deg, L, W, bend, camber, mat_index)] in the parent's frame (right wing; mirrored for sx<0)."""
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    for (p, a, L, Wd, bend, cam, mi) in specs:
        ang = math.radians(a) if sx > 0 else math.pi - math.radians(a)
        M = Matrix.Translation((sx * p[0], p[1], p[2])) @ Matrix.Rotation(ang, 4, 'Z')
        n0 = len(bm.faces); card(bm, L, Wd, bend, cam, mirror=sx < 0, M=M, uvl=uvl)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[n0:]: f.material_index = mi
    ob = obj_from_bm(name, bm, mats, col=OWL); ob.parent = parent; return ob

def empty(name, parent, loc=(0, 0, 0)):
    e = bpy.data.objects.new(name, None); OWL.objects.link(e); e.parent = parent; e.location = loc; e.rotation_mode = 'XYZ'; e.empty_display_size = .05; return e

def fluff(name, parent, c, r, n, L, seed, mat_, taper=None, back=(0, -1, 0), lift=.5, keep=None, rad=.0011):
    """Short hair-curve plumage over an ellipsoid: each strand lies back along `back`, lifting off the surface a little."""
    rng = np.random.default_rng(seed)
    d = rng.normal(size=(n * 2, 3)); d /= np.linalg.norm(d, axis=1)[:, None]
    if keep is not None: d = d[keep(d)]
    d = d[:n]; n = len(d)
    rr = np.array(r); P0 = d * rr
    if taper: P0 = np.array([taper(*q) for q in d]) * rr
    nrm = P0 / (rr * rr); nrm /= np.linalg.norm(nrm, axis=1)[:, None]
    b = np.array(back, dtype=float); t = b - (nrm @ b)[:, None] * nrm; t /= np.maximum(np.linalg.norm(t, axis=1), 1e-6)[:, None]
    ln = L * (.7 + .6 * rng.random(n))[:, None]
    root = np.array(c) + P0 - nrm * .002
    mid = root + t * ln * .5 + nrm * ln * lift * .45
    tip = root + t * ln + nrm * ln * lift * .25 + rng.normal(scale=.12, size=(n, 3)) * ln
    pts = np.stack([root, mid, tip], axis=1).reshape(-1, 3).astype(np.float32)
    cv = bpy.data.hair_curves.new(name); cv.add_curves([3] * n)
    cv.attributes['position'].data.foreach_set('vector', pts.ravel())
    ra = cv.attributes.get('radius') or cv.attributes.new('radius', 'FLOAT', 'POINT')
    ra.data.foreach_set('value', np.tile(np.array([rad, rad * .7, rad * .25], dtype=np.float32), n))
    cv.materials.append(mat_)
    ob = bpy.data.objects.new(name, cv); OWL.objects.link(ob); ob.parent = parent; return ob

# ---------------------------------------------------------------- body, head, tail, feet, letter
root = empty('owl', None)
root.rotation_mode = 'QUATERNION'
def body_taper(x, y, z):
    k = 1 - .36 * max(0, -y) ** 1.5
    return x * k, y, (z - .16 * max(0, -y) ** 2 + .05 * max(0, y)) * (1 - .1 * max(0, -y))
BODY_R = (.13, .205, .125)
body = ellipsoid('owl_body', (0, 0, 0), BODY_R, root, [BODYM], taper=body_taper)
NH = 9000 if PREVIEW else 42000
fluff('owl_body_fluff', root, (0, 0, 0), BODY_R, NH, .03, 1, HAIR, taper=body_taper, lift=.55)
head = empty('owl_head', root, (0, .2, .075))
HEAD_R = (.104, .1, .1)
ellipsoid('owl_head_m', (0, 0, 0), HEAD_R, head, [BODYM])
fluff('owl_head_fluff', head, (0, 0, 0), HEAD_R, NH // 3, .022, 2, HAIR, back=(0, -1, .1), lift=.45, keep=lambda d: d[:, 1] < .55)
# the facial disc: a flattened dish of short, bright feathers framing the eyes
ellipsoid('owl_face_m', (0, .058, -.004), (.094, .048, .086), head, [FACEM])
fluff('owl_face_fluff', head, (0, .058, -.004), (.094, .048, .086), NH // 5, .016, 3, HAIRF, back=(0, .3, -1), lift=.25, keep=lambda d: d[:, 1] > .2, rad=.0008)
for sx in (-1, 1):
    eo = empty(f'owl_eye{sx}', head, (sx * .04, .1, .016)); eo.rotation_euler = (0, 0, -sx * .22)
    ellipsoid(f'owl_eyeball{sx}', (0, 0, 0), (.0165, .0165, .0165), eo, [EYE], seg=24, rings=16)
    # a relaxed upper lid: a cap of face plumage over the top third of the eye
    ellipsoid(f'owl_lid{sx}', (0, .002, .009), (.019, .0175, .012), eo, [FACEM], seg=20, rings=12, taper=lambda x, y, z: (x, y, max(z, -.15)))
bk = bmesh.new(); bmesh.ops.create_cone(bk, cap_ends=True, segments=10, radius1=.013, radius2=.002, depth=.03, matrix=Matrix.Translation((0, .112, -.02)) @ Matrix.Rotation(math.radians(-62), 4, 'X'))
for v in bk.verts: v.co.y += .006 * max(0, -(v.co.z + .02) / .015)   # a slight hook
obj_from_bm('owl_beak', bk, [BEAK], col=OWL, smooth=True).parent = head
tail_e = empty('owl_tail', root, (0, -.175, .0))
cards_object('owl_tail_f', [((0, (k - 5.5) * .009, .002 * abs(k - 5.5)), -90 + (k - 5.5) * 3.2, .2 - abs(k - 5.5) * .004, .052, .06, .1, 0) for k in range(12)], tail_e, [F_TAIL], 1)
# feet tucked up under the tail, holding the letter
for sx in (-1, 1):
    ellipsoid(f'owl_foot{sx}', (sx * .035, -.02, -.105), (.03, .045, .028), root, [BODYM])
    tb = bmesh.new()
    for k in range(3):
        bmesh.ops.create_cone(tb, cap_ends=True, segments=6, radius1=.004, radius2=.0008, depth=.025, matrix=Matrix.Translation((sx * .035 + (k - 1) * .009, .01, -.13)) @ Matrix.Rotation(math.radians(70), 4, 'X'))
    obj_from_bm(f'owl_talons{sx}', tb, [TALON], col=OWL).parent = root
lb = bmesh.new(); bmesh.ops.create_cube(lb, size=1, matrix=Matrix.Translation((0, -.005, -.142)) @ Matrix.Rotation(.12, 4, 'Z') @ Matrix.Diagonal((.13, .088, .005, 1)))
obj_from_bm('owl_letter', lb, [PAPER], col=OWL).parent = root
sb = bmesh.new(); vs = [sb.verts.new((math.cos(-math.pi / 2 + i * math.pi / 5) * (.012 if i % 2 == 0 else .005), -.005 + math.sin(-math.pi / 2 + i * math.pi / 5) * (.012 if i % 2 == 0 else .005), -.1452)) for i in range(10)]
sb.faces.new(vs[::-1]); obj_from_bm('owl_star', sb, [STARG], col=OWL).parent = root

# ---------------------------------------------------------------- wings: shoulder -> elbow -> wrist chains of empties
HUM, FORE, HAND = .118, .165, .135
WING = {}
for side, sx in (('R', 1), ('L', -1)):
    sh = empty(f'sh.{side}', root, (sx * .085, .07, .055)); el = empty(f'el.{side}', sh, (sx * HUM, 0, 0)); wr = empty(f'wr.{side}', el, (sx * FORE, -.012, 0))
    # leading-edge shells (lesser coverts over the bones)
    ellipsoid(f'le_hum.{side}', (sx * .055, .004, .004), (.07, .042, .024), sh, [BODYM])
    ellipsoid(f'le_fore.{side}', (sx * .085, -.002, .003), (.098, .032, .016), el, [BODYM])
    ellipsoid(f'le_hand.{side}', (sx * .07, -.006, .0), (.08, .022, .011), wr, [BODYM])
    fluff(f'le_fluff.{side}', sh, (sx * .055, .004, .004), (.07, .042, .024), NH // 12, .02, 7 + sx, HAIR, back=(sx * .3, -1, 0), lift=.3, keep=lambda d: d[:, 2] > -.2)
    # tertials and scapulars on the arm; secondaries + greater and median coverts on the forearm; primary coverts on the hand
    cards_object(f'arm_f.{side}', [((.012 + k * .022, -.018, .004 - k * .001), -97 + k * 2, .17 - k * .006, .055, .05, .12, k % 2) for k in range(5)] +
                 [((.01 + k * .02, -.012, .018), -100 + k * 3, .1, .045, .04, .12, 2) for k in range(5)], sh, [F_SEC[0], F_SEC[1], F_COV[0]], sx)
    cards_object(f'fore_f.{side}', [((.004 + k * .0125, -.01, -.002 * (k % 2)), -97 + k * 1.1, .195 + .006 * math.sin(k), .054, .05, .1, k % 2) for k in range(14)] +
                 [((.006 + k * .0135, -.004, .007), -98 + k * 1.3, .1, .044, .03, .12, 2 + k % 2) for k in range(13)] +
                 [((.01 + k * .015, .003, .013), -100 + k * 1.5, .06, .036, .02, .12, 4) for k in range(11)], el, [F_SEC[0], F_SEC[1], F_COV[0], F_COV[1], F_COV[2]], sx)
    cards_object(f'hand_cov.{side}', [((.004 + k * .013, -.002, .008), -72 + k * 6.5, .095, .036, .03, .1, k % 2) for k in range(9)], wr, [F_COV[1], F_COV[2]], sx)
    prims = []
    for i in range(10):
        e = empty(f'p{i}.{side}', wr, (sx * (.002 + i * .0135), -.004 - .002 * i, -.002 - .0006 * i))
        L = .25 + .085 * math.sin(math.pi * min(1, (i + 2.2) / 11.5))
        cards_object(f'prim{i}.{side}', [((0, 0, 0), 0, L, .05 - i * .0008, .07, .08, 0)], e, [F_PRIM[i % 3]], sx)
        prims.append(e)
    WING[side] = (sx, sh, el, wr, prims)

# ---------------------------------------------------------------- flight
OWL_T0, OWL_T1 = 3.0, 8.6
FLAPS = [(-.5, 4), (3.3, 2)]   # (owl time, beats); each run of beats starts and ends mid-downstroke, where the wings are level
BEAT, PH0, RAMP = .55, .28, .14
def stroke(tau):
    """(phase within a beat or None, weight of the flapping pose 0..1)."""
    for t0, nb in FLAPS:
        t1 = t0 + nb * BEAT
        if t0 <= tau < t1:
            w = min(1, (tau - t0) / RAMP, (t1 - tau) / RAMP); w = w * w * (3 - 2 * w)
            return ((tau - t0) / BEAT + PH0) % 1, w
    return None, 0
def pose(tau):
    ph, wgt = stroke(tau)
    glide = dict(el=math.radians(9) + math.radians(1.5) * math.sin(tau * 4.3), sw=math.radians(2), tw=math.radians(-2) + math.radians(2) * math.sin(tau * 3.1),
                 elf=math.radians(6), wrf=math.radians(-4), wrz=math.radians(-2), sup=0, spread=1.0, bob=0, pitch=0)
    if ph is None or wgt <= 0:
        return glide
    if ph < .56: u = ph / .56; e = math.cos(u * math.pi)              # downstroke: +1 (up) -> -1 (down)
    else: u = (ph - .56) / .44; e = -math.cos(u * math.pi)           # upstroke: -1 -> +1
    up_k = math.sin(u * math.pi) if ph >= .56 else 0                 # how far into the tucked upstroke
    lag = (ph - .09) % 1; le = math.cos(lag / .56 * math.pi) if lag < .56 else -math.cos((lag - .56) / .44 * math.pi)
    fl = dict(el=math.radians(12) + math.radians(42) * e, sw=math.radians(8) * e - math.radians(6) * up_k, tw=math.radians(-8) * (1 - up_k) + math.radians(14) * up_k,
              elf=math.radians(6) + math.radians(34) * up_k, wrf=math.radians(18) * le, wrz=math.radians(-4) - math.radians(46) * up_k, sup=math.radians(30) * up_k,
              spread=1 - .85 * up_k, bob=-.045 * e, pitch=math.radians(4) * e)
    return {k: glide[k] * (1 - wgt) + fl[k] * wgt for k in glide}

def set_key(o, attr, f): o.keyframe_insert(attr, frame=f)
f_mid = int((OWL_T0 + OWL_T1) / 2 * FPS)
TX, TY = (10.125 / 30, 18 / 30) if PORT else (18 / 32, 10.125 / 32)
def moon_img_xy(t):
    cp, B = cam_matrix(t); md = B.inverted() @ MOON_DIR; return Vector((md.x / -md.z / TX, md.y / -md.z / TY))
D0, D1 = (10.0, 8.6) if PORT else (7.4, 6.4)
U_MOON = max(.3, min(.75, (1.32 - moon_img_xy(OWL_T1).x) / 2.74))   # where along the path she crosses the moon
def rel(u, t):
    """Owl position in camera space at flight fraction u: from off the right edge, low across the moon, out at the top left."""
    m = moon_img_xy(t)
    xn = 1.32 - 2.74 * u
    yn = m.y - .09 + .05 * math.sin(u * math.pi) + .55 * max(0, u - U_MOON + .05) ** 1.6 + .03 * math.sin(u * 7)
    d = D0 + (D1 - D0) * u
    return Vector((xn * TX * d, yn * TY * d, -d))
for o in OWL.objects: o.hide_render = True; o.keyframe_insert('hide_render', frame=1)
okey = bpy.data.objects.new('owl_key', bpy.data.lights.new('owl_key', 'SUN')); s.collection.objects.link(okey)
okey.data.energy = 2.6; okey.data.color = (.82, .87, 1.0); okey.data.angle = math.radians(10)
cpm, Bm = cam_matrix(f_mid / FPS); okey.rotation_euler = (Bm @ Vector((.45, .12, -1)).normalized()).to_track_quat('-Z', 'Y').to_euler()
rim = bpy.data.objects.new('owl_rim', bpy.data.lights.new('owl_rim', 'SUN')); s.collection.objects.link(rim)
rim.data.energy = 3.0; rim.data.color = (.72, .8, 1.0); rim.data.angle = math.radians(4)
rim.rotation_euler = (Bm @ Vector((.2, -.5, 1)).normalized()).to_track_quat('-Z', 'Y').to_euler()   # from behind: the moon's edge light on the feathers
for L_ in (okey, rim):
    try: L_.light_linking.receiver_collection = OWL; L_.light_linking.blocker_collection = OWL   # lights and shadows only the owl
    except Exception as ex: print('light linking unavailable', ex)
f0, f1 = int(OWL_T0 * FPS) - 2, int(OWL_T1 * FPS) + 3
for f in range(f0, f1 + 1):
    t = f / FPS; tau = t - OWL_T0; u = tau / (OWL_T1 - OWL_T0)
    if f in (f0, f0 + 1):
        for o in OWL.objects: o.hide_render = f == f0; o.keyframe_insert('hide_render', frame=f)
    cp, B = cam_matrix(t); p = pose(tau)
    q = rel(u, t); q2 = rel(u + .01, t + .056)
    # heading: along the screen path, turned a little toward the camera so we see her face and the tops of the wings
    fwd = (q2 - q).normalized(); fwd = (fwd + Vector((0, 0, .6))).normalized()
    upv = Vector((0, 1, 0)); right = fwd.cross(upv).normalized(); upv = right.cross(fwd).normalized()
    bank = .45 - .55 * max(0, u - U_MOON - .05) + .07 * math.sin(tau * 2.2)   # underside toward us; she rolls out of it as she climbs away
    Mc = Matrix((right, fwd, upv)).transposed() @ Matrix.Rotation(bank, 3, 'Y') @ Matrix.Rotation(-.08 + p['pitch'], 3, 'X')
    root.location = cp + B @ (q + Vector((0, p['bob'], 0))); root.rotation_quaternion = (B @ Mc).to_quaternion()
    set_key(root, 'location', f); set_key(root, 'rotation_quaternion', f)
    for side, (sx, sh, el, wr, prims) in WING.items():
        sh.rotation_euler = Euler((p['tw'], -sx * p['el'], sx * p['sw'])); set_key(sh, 'rotation_euler', f)
        el.rotation_euler = Euler((0, -sx * p['wrf'] * .4, -sx * p['elf'])); set_key(el, 'rotation_euler', f)
        wr.rotation_euler = Euler((p['sup'], -sx * p['wrf'], sx * p['wrz'] + -sx * p['elf'] * -.9)); set_key(wr, 'rotation_euler', f)
        for i, e in enumerate(prims):
            k = i / 9; full = -78 + 70 * k ** .9; shut = -78 + 22 * k
            a = math.radians(shut + (full - shut) * p['spread'])
            e.rotation_euler = Euler((p['sup'] * (.3 + .7 * k), 0, a if sx > 0 else -a)); set_key(e, 'rotation_euler', f)
    # the head stays level and finds the camera as she passes the moon
    look = math.exp(-((u - U_MOON + .04) / .2) ** 2)
    owl_w = (B @ Mc); to_cam = owl_w.inverted() @ (cp - root.location).normalized()
    yaw = max(-1.6, min(1.6, math.atan2(-to_cam.x, to_cam.y))) * look * .9
    pit = math.atan2(to_cam.z, math.hypot(to_cam.x, to_cam.y)) * look * .45 - p['pitch'] - p['bob'] * 1.5
    head.rotation_euler = Euler((pit, 0, yaw)); set_key(head, 'rotation_euler', f)
    tail_e.rotation_euler = Euler((p['bob'] * 2.5 + math.radians(5) * math.sin(tau * 2.4), 0, math.radians(3) * math.sin(tau * 1.7))); set_key(tail_e, 'rotation_euler', f)
    if f == f1:
        for o in OWL.objects: o.hide_render = True; o.keyframe_insert('hide_render', frame=f)
def fcurves_of(action):
    if hasattr(action, 'fcurves'): return list(action.fcurves)
    return [fc for ly in action.layers for st in ly.strips for cb in st.channelbags for fc in cb.fcurves]
for o in OWL.objects:
    ad = o.animation_data
    if ad and ad.action:
        for fc in fcurves_of(ad.action):
            for kp in fc.keyframe_points: kp.interpolation = 'CONSTANT' if fc.data_path == 'hide_render' else 'LINEAR'
OWL_TEST = 'owltest' in OPT
if OWL_TEST:   # a full-resolution crop of the real shot around the owl
    t = float(OPT['owltest']); s.frame_set(int(t * FPS)); cp, B = cam_matrix(t)
    q = B.inverted() @ (root.matrix_world.to_translation() - cp); x, y = q.x / -q.z / TX, q.y / -q.z / TY
    s.render.use_border = True; s.render.use_crop_to_border = True; hw = .2 if PORT else .14; hh = hw * (s.render.resolution_x / s.render.resolution_y if False else (1080 / 1920 if PORT else 1440 / 810))
    s.render.border_min_x, s.render.border_max_x = max(0, (x + 1) / 2 - hw), min(1, (x + 1) / 2 + hw)
    s.render.border_min_y, s.render.border_max_y = max(0, (y + 1) / 2 - hh), min(1, (y + 1) / 2 + hh)
