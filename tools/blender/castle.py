"""Prologue (v16): a gothic castle on a sheer rock promontory above a misty lake under a full moon, flown like a drone
shot, with a snowy owl crossing in front of the moon (owl.py). Built entirely in Blender from code + Poly Haven CC0
textures: lathed towers with corbelled parapets, dormered cone roofs and finials; a buttressed great hall with lancet
windows, pinnacles and a roof lantern; a stone viaduct to a tower on a rock in the lake; a stratified cliff; pine forest;
moonlit clouds; far-shore village lights. Every lit window is a recessed pointed arch with a stone surround and mullions.
blender -b --factory-startup --python castle.py -- OUT.blend [portrait|landscape] [preview] [render=F,F res=0.25 spp=16 dir=DIR]"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix, Euler, Quaternion, noise
sys.path.insert(0, os.path.expanduser('~/projects/render-workspace/tools'))
import blu
from blu import mat, mat_ph, emission_mat, obj_from_bm, collection, link

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/castle.blend'
ORIENT = argv[1] if len(argv) > 1 else 'portrait'
PREVIEW = 'preview' in argv
OPT = dict(a.split('=', 1) for a in argv if '=' in a)
FPS, FRAMES = 24, 336
PORT = ORIENT == 'portrait'
R = random.Random(7)
s = blu.empty_file()
s.render.fps = FPS
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
TEX = 1024 if PREVIEW else 2048

def smooth(a, b, x):
    t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t)
def ease_io(u): u = max(0, min(1, u)); return .5 - .5 * math.cos(math.pi * u)

# ------------------------------------------------------------------ materials
def weather(grime=.55, moss=.25, ao=1.4, streak=.35, var=.1, sat=1.0, ledge=0.0):
    """Ageing on top of a Poly Haven stone: soot in the crevices (AO), rain streaks down the walls, damp moss toward
    the foot of the walls and a little per-object variation, so no two towers are the same grey."""
    def f(m, nt, P, mp):
        N = nt.nodes; src = P.inputs['Base Color'].links[0].from_socket
        geo = N.new('ShaderNodeNewGeometry'); oi = N.new('ShaderNodeObjectInfo')
        a = N.new('ShaderNodeAmbientOcclusion'); a.inputs['Distance'].default_value = ao; a.samples = 6
        inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; link(nt, a.outputs['AO'], inv.inputs[1])
        g = N.new('ShaderNodeMath'); g.operation = 'MULTIPLY'; g.inputs[1].default_value = grime; link(nt, inv.outputs[0], g.inputs[0])
        sm = N.new('ShaderNodeMapping'); sm.inputs['Scale'].default_value = (1.3, 1.3, .07); link(nt, geo.outputs['Position'], sm.inputs[0])
        sn = N.new('ShaderNodeTexNoise'); sn.inputs['Scale'].default_value = 1.6; sn.inputs['Detail'].default_value = 3; link(nt, sm.outputs[0], sn.inputs['Vector'])
        sr = N.new('ShaderNodeMapRange'); sr.inputs[1].default_value = .45; sr.inputs[2].default_value = .75; sr.inputs[4].default_value = streak; link(nt, sn.outputs['Fac'], sr.inputs[0])
        tot = N.new('ShaderNodeMath'); tot.operation = 'ADD'; tot.use_clamp = True; link(nt, g.outputs[0], tot.inputs[0]); link(nt, sr.outputs[0], tot.inputs[1])
        dark = N.new('ShaderNodeMix'); dark.data_type = 'RGBA'; dark.blend_type = 'MULTIPLY'; link(nt, tot.outputs[0], dark.inputs[0])
        link(nt, src, dark.inputs[6]); dark.inputs[7].default_value = (.16, .15, .14, 1)
        # moss: low on the walls (world z just above the plateau) and in the crevices
        sep = N.new('ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Position'], sep.inputs[0])
        mz = N.new('ShaderNodeMapRange'); mz.inputs[1].default_value = 44; mz.inputs[2].default_value = 37; link(nt, sep.outputs['Z'], mz.inputs[0])
        mn = N.new('ShaderNodeTexNoise'); mn.inputs['Scale'].default_value = .9; link(nt, geo.outputs['Position'], mn.inputs['Vector'])
        mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; link(nt, mz.outputs[0], mm.inputs[0]); link(nt, mn.outputs['Fac'], mm.inputs[1])
        mm2 = N.new('ShaderNodeMath'); mm2.operation = 'MULTIPLY'; mm2.inputs[1].default_value = moss * 1.6; mm2.use_clamp = True; link(nt, mm.outputs[0], mm2.inputs[0])
        mos = N.new('ShaderNodeMix'); mos.data_type = 'RGBA'; link(nt, mm2.outputs[0], mos.inputs[0]); link(nt, dark.outputs[2], mos.inputs[6]); mos.inputs[7].default_value = (.06, .075, .045, 1)
        # per-object tone
        vr = N.new('ShaderNodeMapRange'); vr.inputs[3].default_value = 1 - var; vr.inputs[4].default_value = 1 + var; link(nt, oi.outputs['Random'], vr.inputs[0])
        hsv = N.new('ShaderNodeHueSaturation'); link(nt, vr.outputs[0], hsv.inputs['Value']); link(nt, mos.outputs[2], hsv.inputs['Color']); hsv.inputs['Saturation'].default_value = sat
        out = hsv.outputs[0]
        if ledge:   # upward-facing ledges carry moss, heather and dark earth
            sz = N.new('ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Normal'], sz.inputs[0])
            ln = N.new('ShaderNodeTexNoise'); ln.inputs['Scale'].default_value = .25; link(nt, geo.outputs['Position'], ln.inputs['Vector'])
            la = N.new('ShaderNodeMath'); la.operation = 'MULTIPLY_ADD'; la.inputs[1].default_value = .35; link(nt, ln.outputs['Fac'], la.inputs[0]); link(nt, sz.outputs['Z'], la.inputs[2])
            lr = N.new('ShaderNodeMapRange'); lr.inputs[1].default_value = .72; lr.inputs[2].default_value = .9; lr.inputs[4].default_value = ledge; link(nt, la.outputs[0], lr.inputs[0])
            lm = N.new('ShaderNodeMix'); lm.data_type = 'RGBA'; link(nt, lr.outputs[0], lm.inputs[0]); link(nt, out, lm.inputs[6]); lm.inputs[7].default_value = (.025, .035, .022, 1)
            out = lm.outputs[2]
        link(nt, out, P.inputs['Base Color'])
    return f

STONE = mat_ph('stone', 'castle_wall_slates', scale=.3, tint=(.86, .83, .78), bump=1.0, size=TEX, extra=weather())
STONE2 = mat_ph('stone2', 'castle_wall_varriation', scale=.32, tint=(.8, .78, .74), bump=1.0, size=TEX, extra=weather(grime=.5, moss=.3))
TRIM = mat_ph('trim', 'castle_wall_varriation', scale=1.1, tint=(1.0, .97, .92), bump=.5, size=TEX // 2, extra=weather(grime=.4, moss=0, streak=.15, var=.05))
ROOF = mat_ph('roof', 'roof_slates_03', scale=.55, tint=(.36, .4, .48), bump=.9, rough_mul=.62, size=TEX, extra=weather(grime=.35, moss=0, streak=.2, var=.12))
ROCK = mat_ph('rock', 'cliff_side', scale=.06, tint=(.62, .63, .66), bump=1.5, size=TEX, extra=weather(grime=.6, moss=0, ao=4, streak=.45, var=.06, sat=.22, ledge=.85))
MOSSROCK = mat_ph('mossrock', 'mossy_rock', scale=.12, tint=(.62, .66, .66), bump=1.0, size=TEX // 2, extra=weather(grime=.5, moss=0, ao=3, streak=.2, var=.05))
IRON = mat('iron', (.03, .03, .032), .35, metal=.8)
GILT = mat('gilt', (.75, .55, .22), .25, metal=1)
LEAD = mat('lead', (.12, .13, .15), .3, metal=.6)
DARKWIN = mat('darkwin', (.006, .008, .014), .08)
DARKWIN.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value = .8
ARCHDARK = mat('archdark', (.004, .004, .005), .9)

def window_glass(g):
    """Candlelit glass: each pane has its own colour temperature and brightness, is warmer and brighter low down
    (candles, a hearth), and some show the soft shadow of a curtain or a figure. Three groups flicker on their own."""
    m = bpy.data.materials.new(f'win{g}'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.remove(N['Principled BSDF']); out = N['Material Output']
    at = N.new('ShaderNodeAttribute'); at.attribute_name = 'rnd'; at.attribute_type = 'GEOMETRY'
    uv = N.new('ShaderNodeUVMap'); su = N.new('ShaderNodeSeparateXYZ'); link(nt, uv.outputs[0], su.inputs[0])
    sr = N.new('ShaderNodeSeparateColor'); link(nt, at.outputs['Color'], sr.inputs[0])
    bb = N.new('ShaderNodeBlackbody'); tmp = N.new('ShaderNodeMapRange'); tmp.inputs[3].default_value = 1650; tmp.inputs[4].default_value = 2500
    link(nt, sr.outputs[0], tmp.inputs[0]); link(nt, tmp.outputs[0], bb.inputs[0])
    grad = N.new('ShaderNodeMapRange'); grad.inputs[3].default_value = 1.3; grad.inputs[4].default_value = .55; link(nt, su.outputs['Y'], grad.inputs[0])
    # a soft silhouette: noise in the pane's own coordinates, offset per window
    off = N.new('ShaderNodeVectorMath'); off.operation = 'ADD'; link(nt, uv.outputs[0], off.inputs[0]); link(nt, at.outputs['Color'], off.inputs[1])
    sc = N.new('ShaderNodeMapping'); sc.inputs['Scale'].default_value = (3.2, 1.6, 1); link(nt, off.outputs[0], sc.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.4; nz.inputs['Detail'].default_value = 1; link(nt, sc.outputs[0], nz.inputs['Vector'])
    sh = N.new('ShaderNodeMapRange'); sh.inputs[1].default_value = .38; sh.inputs[2].default_value = .62; sh.inputs[3].default_value = .35; sh.inputs[4].default_value = 1; link(nt, nz.outputs['Fac'], sh.inputs[0])
    lvl = N.new('ShaderNodeMapRange'); lvl.inputs[3].default_value = .45; lvl.inputs[4].default_value = 1.5; link(nt, sr.outputs[1], lvl.inputs[0])
    fl = N.new('ShaderNodeValue'); fl.outputs[0].default_value = 1
    m1 = N.new('ShaderNodeMath'); m1.operation = 'MULTIPLY'; link(nt, grad.outputs[0], m1.inputs[0]); link(nt, sh.outputs[0], m1.inputs[1])
    m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY'; link(nt, m1.outputs[0], m2.inputs[0]); link(nt, lvl.outputs[0], m2.inputs[1])
    m3 = N.new('ShaderNodeMath'); m3.operation = 'MULTIPLY'; link(nt, m2.outputs[0], m3.inputs[0]); link(nt, fl.outputs[0], m3.inputs[1])
    m4 = N.new('ShaderNodeMath'); m4.operation = 'MULTIPLY'; m4.inputs[1].default_value = 10; link(nt, m3.outputs[0], m4.inputs[0])
    em = N.new('ShaderNodeEmission'); link(nt, bb.outputs[0], em.inputs[0]); link(nt, m4.outputs[0], em.inputs[1])
    gl = N.new('ShaderNodeBsdfGlossy'); gl.inputs['Roughness'].default_value = .12; gl.inputs['Color'].default_value = (.4, .42, .5, 1)
    ad = N.new('ShaderNodeAddShader'); link(nt, em.outputs[0], ad.inputs[0]); link(nt, gl.outputs[0], ad.inputs[1]); link(nt, ad.outputs[0], out.inputs[0])
    rr = random.Random(g * 31 + 5)
    for f in range(1, FRAMES + 1, 2):
        t = f / FPS
        fl.outputs[0].default_value = .8 + .13 * noise.noise(Vector((t * 1.4, g * 7.7, 0))) + .07 * noise.noise(Vector((t * 4.6, g * 3.1, 1)))
        fl.outputs[0].keyframe_insert('default_value', frame=f)
    return m
WINS = [window_glass(g) for g in range(3)]

# ------------------------------------------------------------------ geometry helpers
CAS = collection('Castle')
def finish(ob, sharp=35, bevel=0.0, seg=1):
    me = ob.data
    for p in me.polygons: p.use_smooth = True
    me.set_sharp_from_angle(angle=math.radians(sharp))
    if bevel and not PREVIEW:
        b = ob.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40); b.harden_normals = False
    return ob

def lathe(name, prof, seg, mats, col=None, phase=None, cap=True):
    """Surface of revolution from a (radius, z[, mat_index]) profile, bottom to top. A radius of 0 closes to a point."""
    bm = bmesh.new(); rings = []; ph = (math.pi / seg) if phase is None else phase
    for pr in prof:
        r, z = pr[0], pr[1]
        if r <= 1e-5: rings.append(([bm.verts.new((0, 0, z))], pr[2] if len(pr) > 2 else 0)); continue
        rings.append(([bm.verts.new((math.cos(ph + i / seg * 2 * math.pi) * r, math.sin(ph + i / seg * 2 * math.pi) * r, z)) for i in range(seg)], pr[2] if len(pr) > 2 else 0))
    for (a, _), (b, mi) in zip(rings, rings[1:]):
        if len(b) == 1:
            for i in range(seg): bm.faces.new((a[i], a[(i + 1) % seg], b[0])).material_index = mi
        elif len(a) == 1:
            for i in range(seg): bm.faces.new((a[0], b[(i + 1) % seg], b[i])).material_index = mi
        else:
            for i in range(seg): bm.faces.new((a[i], a[(i + 1) % seg], b[(i + 1) % seg], b[i])).material_index = mi
    if cap and len(rings[-1][0]) > 1: bm.faces.new(rings[-1][0]).material_index = rings[-1][1]
    return obj_from_bm(name, bm, mats, col=col or CAS)

def box(bm, c, size, rot=0, M=None):
    m = (M or Matrix()) @ Matrix.Translation(c) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((*size, 1))
    return bmesh.ops.create_cube(bm, size=1, matrix=m)['verts']

def obox(bm, c, right, n, sx, sy, sz):
    """A box sized sx along right, sy along n (outward) and sz up, centred on c."""
    m = Matrix(((right.x * sx, n.x * sy, 0, c.x), (right.y * sx, n.y * sy, 0, c.y), (right.z * sx, n.z * sy, sz, c.z), (0, 0, 0, 1)))
    return bmesh.ops.create_cube(bm, size=1, matrix=m)['verts']

def prism_roof(bm, M, w, d, z, h, over=.7):
    """Gabled roof, ridge along x."""
    hw, hd = w / 2 + over, d / 2 + over
    v = [bm.verts.new(M @ Vector(p)) for p in [(-hw, -hd, z), (hw, -hd, z), (hw, hd, z), (-hw, hd, z), (-hw, 0, z + h), (hw, 0, z + h)]]
    bm.faces.new((v[0], v[1], v[5], v[4])); bm.faces.new((v[2], v[3], v[4], v[5])); bm.faces.new((v[0], v[3], v[2], v[1]))
    return v

# ------------------------------------------------------------------ windows: recessed pointed arches with stone surrounds
WIN = []
def window(c, n, w, h, lit, kind='lancet', mull=None, frame=.22):
    WIN.append((Vector(c), Vector(n).normalized(), w, h, lit, kind, (w > 1.0) if mull is None else mull, frame))
def lit_or_dark(p=.55): return R.randrange(3) if R.random() < p else -1

def arch_pts(w, h, kind, k=9):
    """Outline (u right, v up), counter-clockwise seen from outside: bottom-left, bottom-right, up the right jamb, over the
    arch, down the left jamb. Same number of points for any size, so a surround can be built between two outlines."""
    if kind == 'rect': return [(-w / 2, 0), (w / 2, 0)] + [(w / 2, h * i / k) for i in range(1, k)] + [(w / 2 - w * i / k, h) for i in range(k + 1)] + [(-w / 2, h - h * i / k) for i in range(1, k)]
    if kind == 'round':
        sy = h - w / 2; arc = [(w / 2 * math.cos(math.pi * i / (2 * k)), sy + w / 2 * math.sin(math.pi * i / (2 * k))) for i in range(2 * k + 1)]
    else:
        Rr = w * .92; sy = h - Rr * math.sin(math.acos((Rr - w / 2) / Rr)); phi = math.acos((Rr - w / 2) / Rr)
        right = [((w / 2 - Rr) + Rr * math.cos(phi * i / k), sy + Rr * math.sin(phi * i / k)) for i in range(k + 1)]
        left = [(-(w / 2 - Rr) - Rr * math.cos(phi * (k - i) / k), sy + Rr * math.sin(phi * (k - i) / k)) for i in range(1, k + 1)]
        arc = right + left
    return [(-w / 2, 0), (w / 2, 0)] + arc[:-1] + [arc[-1]]

def build_windows():
    panes = {g: bmesh.new() for g in (-1, 0, 1, 2)}; fr = bmesh.new()
    rlay = {g: (b.loops.layers.color.new('rnd'), b.loops.layers.uv.new('UVMap')) for g, b in panes.items()}
    up = Vector((0, 0, 1))
    for (c, n, w, h, lit, kind, mull, fw) in WIN:
        right = up.cross(n).normalized()
        P = lambda u, v, d: c + right * u + up * v + n * d
        inner = arch_pts(w, h, kind); outer = [(u * (w + 2 * fw) / w, v * (h + 1.3 * fw) / h - fw * .35) for (u, v) in inner]
        # pane (UV 0..1 across the opening, rnd = this window's private random colour)
        bm = panes[lit]; cl, uvl = rlay[lit]; rc = (R.random(), R.random(), R.random(), 1)
        vs = [bm.verts.new(P(u, v, .03)) for (u, v) in inner]; f = bm.faces.new(vs)
        for lp in f.loops:
            q = lp.vert.co - c; lp[uvl].uv = (q.dot(right) / w + .5, q.dot(up) / h); lp[cl] = rc
        # surround: the face of the frame, its outer side back to the wall, and the reveal back to the glass
        fo = [fr.verts.new(P(u, v, .16)) for (u, v) in outer]; fi = [fr.verts.new(P(u, v, .16)) for (u, v) in inner]
        wo = [fr.verts.new(P(u, v, -.02)) for (u, v) in outer]; gi = [fr.verts.new(P(u, v, .03)) for (u, v) in inner]
        L = len(inner)
        for i in range(L):
            j = (i + 1) % L
            if i == 0: continue  # the sill edge is a separate ledge
            fr.faces.new((fi[i], fi[j], fo[j], fo[i])); fr.faces.new((fo[i], fo[j], wo[j], wo[i])); fr.faces.new((gi[i], gi[j], fi[j], fi[i]))
        # sill: a projecting ledge; mullion and transom
        obox(fr, c + up * (-fw * .35 - .1) + n * .2, right, n, w + 2 * fw + .3, .42, .2)
        if mull:
            ah = h * (.86 if kind != 'rect' else 1)
            obox(fr, c + up * ah / 2 + n * .07, right, n, .1, .08, ah)
            if h > 2.4: obox(fr, c + up * h * .52 + n * .07, right, n, w, .08, .09)
    for g, bm in panes.items():
        if not bm.verts: bm.free(); continue
        ob = obj_from_bm(f'panes{g}', bm, [WINS[g] if g >= 0 else DARKWIN], col=CAS)
    finish(obj_from_bm('window_frames', fr, [TRIM], col=CAS), sharp=30)

# ------------------------------------------------------------------ towers
def ring_windows(x, y, z0, r, h, facing, n_each=3, w=1.0, wh=2.3, lit=.55, spread=1.0, kind='lancet', floor=6.5, start=6.5, jitter=.08):
    floors = max(1, int((h - start - 4) / floor) + 1)
    for k in range(floors):
        z = z0 + start + k * floor + R.uniform(-.3, .3)
        for i in range(n_each):
            a = facing + (i - (n_each - 1) / 2) * spread + R.uniform(-jitter, jitter)
            nn = Vector((math.cos(a), math.sin(a), 0))
            window(Vector((x, y, z)) + nn * (r - .02), nn, w, wh, lit_or_dark(lit), kind)

def corbels(name, x, y, z, r, n=None, seg=None):
    bm = bmesh.new(); n = n or max(10, int(2 * math.pi * r / .95))
    for i in range(n):
        a = (i + .5) / n * 2 * math.pi
        for (dz, dr, sz) in ((0, .25, (.34, .5, .45)), (-.42, .12, (.3, .3, .5))):
            c = Vector((math.cos(a) * (r + dr), math.sin(a) * (r + dr), z + dz))
            box(bm, c, sz, a + math.pi / 2)
    ob = obj_from_bm(name, bm, [TRIM], col=CAS); ob.location = (x, y, 0); return finish(ob, bevel=.04)

def merlons(name, x, y, z, r, size=.9, square=None):
    bm = bmesh.new()
    if square:
        w, d = square; per = 2 * (w + d); n = int(per / (size * 2))
        for i in range(n):
            u = (i + .25) / n * per
            if u < w: p, a = (-w / 2 + u, -d / 2), 0
            elif u < w + d: p, a = (w / 2, -d / 2 + u - w), math.pi / 2
            elif u < 2 * w + d: p, a = (w / 2 - (u - w - d), d / 2), 0
            else: p, a = (-w / 2, d / 2 - (u - 2 * w - d)), math.pi / 2
            box(bm, Vector((p[0], p[1], z + .7)), (size, .55, 1.4), a)
    else:
        n = max(8, int(2 * math.pi * r / (size * 2)))
        for i in range(n):
            a = i / n * 2 * math.pi; box(bm, Vector((math.cos(a) * r, math.sin(a) * r, z + .7)), (size, .55, 1.4), a + math.pi / 2)
    ob = obj_from_bm(name, bm, [STONE2], col=CAS); ob.location = (x, y, 0); return finish(ob, bevel=.05)

def finial(name, x, y, z, h=3.5, ball=.28, vane=False):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=.09, radius2=.015, depth=h, matrix=Matrix.Translation((x, y, z + h / 2)))
    bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=ball, matrix=Matrix.Translation((x, y, z + h * .32)))
    if vane:
        v = [bm.verts.new(p) for p in [(x, y, z + h * .7), (x + 1.1, y, z + h * .66), (x + .9, y, z + h * .78), (x, y, z + h * .82)]]; bm.faces.new(v)
    obj_from_bm(name, bm, [IRON], col=CAS)

def dormers(name, x, y, zb, rb, rh, n=4, phase=.4, lit=.5):
    """Little gabled dormers sitting on a cone roof, each with a lit or dark window."""
    bm = bmesh.new(); rbm = bmesh.new()
    for i in range(n):
        a = phase + i / n * 2 * math.pi; z = zb + rh * .22; rr = rb * (1 - .22) * .98
        nn = Vector((math.cos(a), math.sin(a), 0)); c = Vector((x, y, 0)) + nn * rr
        M = Matrix.Translation((c.x, c.y, z)) @ Matrix.Rotation(a - math.pi / 2, 4, 'Z')
        box(bm, Vector((0, .3, .9)), (1.3, 1.8, 1.8), 0, M)
        v = [rbm.verts.new(M @ Vector(p)) for p in [(-.85, 1.35, 1.8), (.85, 1.35, 1.8), (.85, -.7, 1.8), (-.85, -.7, 1.8), (0, 1.35, 2.75), (0, -.7, 2.75)]]
        rbm.faces.new((v[0], v[4], v[5], v[3])); rbm.faces.new((v[1], v[2], v[5], v[4])); rbm.faces.new((v[0], v[1], v[4]))
        window(c + nn * 1.21 + Vector((0, 0, z + .25 - c.z + c.z)), nn, .5, 1.0, lit_or_dark(lit), 'lancet', mull=False, frame=.1)
    finish(obj_from_bm(name, bm, [STONE2], col=CAS), bevel=.03); finish(obj_from_bm(name + '_r', rbm, [ROOF], col=CAS))

def tower(name, x, y, z0, r, h, roof='cone', roof_h=None, seg=36, lit=.55, facing=-math.pi / 2, n_win=3, dorm=True, mach=True, win_w=None):
    """Round (seg 36) or octagonal (seg 8) tower: battered foot, string courses, corbelled parapet, cone roof."""
    sharp = 89 if seg > 12 else 30
    prof = [(r * 1.16, z0 - 10), (r * 1.16, z0 + .6), (r * 1.0, z0 + 3.2)]
    for zc in [z0 + 3.2 + k * 13 for k in range(1, int((h - 8) / 13) + 1)]:   # string courses
        prof += [(r, zc - .25), (r + .16, zc - .1), (r + .16, zc + .2), (r, zc + .3)]
    top = z0 + h
    if mach: prof += [(r, top - 2.4), (r + .55, top - 2.2), (r + .55, top + .3), (r + .45, top + .3), (r + .45, top + .35)]
    else: prof += [(r, top), (r + .3, top + .1), (r + .3, top + .35)]
    body = lathe(name, prof, seg, [STONE if R.random() < .6 else STONE2]); finish(body, sharp=sharp if seg <= 12 else 40, bevel=.05 if seg <= 12 else 0)
    if mach: corbels(name + '_corbels', x, y, top - 2.75, r + .1, n=int(2 * math.pi * r / .9) if seg > 12 else None)
    body.location = (x, y, 0)
    rr = r + (.55 if mach else .3)
    if roof == 'cone':
        rh = roof_h or r * 3.2
        rp = [(rr + .6, top + .2), (rr + .25, top + .9)] + [(rr * (1 - u) ** 1.12 * .97, top + .9 + rh * u) for u in [i / 10 for i in range(1, 10)]] + [(0, top + .9 + rh)]
        rf = lathe(name + '_roof', rp, seg if seg > 12 else 8, [ROOF]); rf.location = (x, y, 0); finish(rf, sharp=60 if seg > 12 else 30)
        finial(name + '_fin', x, y, top + .9 + rh - .3, h=3.2 + r * .25, vane=r > 4.5)
        if dorm and r > 3.4 and not PREVIEW: dormers(name + '_dorm', x, y, top + .9, rr, rh, n=3 if r < 5 else 4, phase=facing + .5)
    elif roof == 'crenel':
        merlons(name + '_mer', x, y, top + .3, rr - .25)
        rp = [(r * .62, top - 1), (r * .62, top + 5)] + [(r * .66 * (1 - u) ** 1.1, top + 5 + (roof_h or r * 2) * u) for u in [i / 8 for i in range(1, 8)]] + [(0, top + 5 + (roof_h or r * 2))]
        rf = lathe(name + '_cap', rp, seg if seg > 12 else 8, [ROOF]); rf.location = (x, y, 0); finish(rf, sharp=60)
        cr = lathe(name + '_drum', [(r * .66, top - 1), (r * .66, top + 5.1)], seg, [STONE2]); cr.location = (x, y, 0); finish(cr, sharp=60)
        finial(name + '_fin', x, y, top + 5 + (roof_h or r * 2) - .2, h=2.6)
    if seg > 12: ring_windows(x, y, z0, r, h - 3, facing, n_each=n_win, w=win_w or (.95 if r < 4 else 1.25), wh=2.2 if r < 4 else 2.8, lit=lit)
    else: ring_windows(x, y, z0, r * math.cos(math.pi / seg) + .01, h - 3, facing, n_each=n_win, w=win_w or 1.1, wh=2.6, lit=lit, spread=2 * math.pi / seg, jitter=0)
    return body

def square_tower(name, x, y, z0, w, h, roof_h, lit=.6, rot=0):
    M = Matrix.Translation((x, y, 0)) @ Matrix.Rotation(rot, 4, 'Z')
    bm = bmesh.new(); box(bm, Vector((0, 0, z0 + (h - 10) / 2)), (w, w, h + 10), 0, M)
    for zc in (z0 + 14, z0 + 30, z0 + h - 2.6): box(bm, Vector((0, 0, zc)), (w + .35, w + .35, .35), 0, M)
    finish(obj_from_bm(name, bm, [STONE], col=CAS), bevel=.06)
    merlons(name + '_mer', 0, 0, z0 + h, 0, square=(w + .1, w + .1)).matrix_world = M
    pr = lathe(name + '_roof', [(w * .66, z0 + h - .2), (w * .7, z0 + h + .6)] + [(w * .7 * (1 - u) ** 1.05, z0 + h + .6 + roof_h * u) for u in (.25, .5, .75)] + [(0, z0 + h + .6 + roof_h)], 4, [ROOF], phase=math.pi / 4)
    pr.matrix_world = M; finish(pr, sharp=30)
    finial(name + '_fin', x, y, z0 + h + roof_h, h=4, vane=True)
    fn = M.to_3x3() @ Vector((0, -1, 0))
    for zz in (8, 16, 24, 34):
        window(M @ Vector((0, -w / 2 - .02, z0 + zz)), fn, 1.2, 2.8, lit_or_dark(lit))
    # a clock face: gilt numerals ring on a dark dial
    c = M @ Vector((0, -w / 2 - .12, z0 + h - 8))
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=40, radius=2.4, matrix=Matrix.Translation(c) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    obj_from_bm(name + '_dial', bm, [mat('dial', (.03, .035, .05), .4)], col=CAS)
    bm = bmesh.new()
    for i in range(12):
        a = i / 12 * 2 * math.pi; p = c + (M.to_3x3() @ Vector((math.cos(a) * 2.0, -.03, math.sin(a) * 2.0)))
        box(bm, p, (.18, .05, .42 if i % 3 == 0 else .25), rot + 0)
    for (L, a) in ((1.3, 1.1), (1.8, -.4)):
        p = c + M.to_3x3() @ Vector((math.cos(a) * L / 2, -.05, math.sin(a) * L / 2)); vv = box(bm, p, (L, .04, .1), 0)
        bmesh.ops.rotate(bm, verts=vv, cent=p, matrix=Matrix.Rotation(-a, 3, M.to_3x3() @ Vector((0, 1, 0))))
    obj_from_bm(name + '_hands', bm, [GILT], col=CAS)

# ------------------------------------------------------------------ the great hall and wings
def hall(name, x, y, z0, w, d, h, roof_h, rot=0, rows=1, tall=False, lit=.6, buttress=True, lantern=False, chimneys=0, gable_win=False):
    M = Matrix.Translation((x, y, z0)) @ Matrix.Rotation(rot, 4, 'Z'); M3 = M.to_3x3()
    bm = bmesh.new(); box(bm, Vector((0, 0, (h - 8) / 2)), (w, d, h + 8), 0, M)
    box(bm, Vector((0, 0, h - .2)), (w + .5, d + .5, .4), 0, M)   # eaves cornice
    box(bm, Vector((0, 0, 1.3)), (w + .6, d + .6, 2.6), 0, M)     # plinth
    finish(obj_from_bm(name, bm, [STONE], col=CAS), bevel=.05)
    rb = bmesh.new(); prism_roof(rb, M, w, d, h, roof_h, over=.6); finish(obj_from_bm(name + '_roof', rb, [ROOF], col=CAS), sharp=20)
    # stone gable ends, proud of the roof, with a cross-shaped finial
    gb = bmesh.new()
    for sx in (-1, 1):
        g = [gb.verts.new(M @ Vector(p)) for p in [(sx * (w / 2 + .1), -d / 2 - .7, h), (sx * (w / 2 + .1), d / 2 + .7, h), (sx * (w / 2 + .1), 0, h + roof_h + .6)]]
        gf = gb.faces.new(g if sx > 0 else list(reversed(g)))
        e = bmesh.ops.extrude_face_region(gb, geom=[gf])['geom']; bmesh.ops.translate(gb, verts=[v for v in e if isinstance(v, bmesh.types.BMVert)], vec=M3 @ Vector((-sx * .7, 0, 0)))
    finish(obj_from_bm(name + '_gable', gb, [STONE2], col=CAS), bevel=.05)
    for sx in (-1, 1): finial(f'{name}_gf{sx}', *(M @ Vector((sx * (w / 2 - .25), 0, h + roof_h + .5))), h=2.2, ball=.18)
    # ridge cresting
    cb = bmesh.new()
    for k in range(int(w / 1.6)):
        p = M @ Vector((-w / 2 + .8 + k * 1.6, 0, h + roof_h + .05)); box(cb, p, (.08, .08, .7 if k % 2 else 1.0), rot)
    obj_from_bm(name + '_crest', cb, [IRON], col=CAS)
    # bays: windows between buttresses on both long faces
    fn = M3 @ Vector((0, -1, 0)); nb = max(2, int(w / (5.2 if tall else 3.6)))
    bb = bmesh.new()
    for side in (-1, 1):
        nrm = fn * (-side) if side > 0 else fn
        for row in range(rows):
            for k in range(nb):
                u = (k + .5) / nb - .5
                if tall: zc, ww, wh = h * .2, 1.9, h * .58
                else: zc, ww, wh = 4.5 + row * (h - 6) / max(1, rows), 1.15, 2.3
                ly = (-d / 2 - .02) if side < 0 else (d / 2 + .02)
                window(M @ Vector((u * w * .94, ly, zc)), nrm if side < 0 else -fn, ww, wh, lit_or_dark(lit if side < 0 else lit * .6), 'lancet', mull=True)
        if buttress:
            for k in range(nb + 1):
                u = k / nb - .5; ly = side * (d / 2 + .9)
                box(bb, Vector((u * w * .94, ly, h * .3 - 4)), (1.0, 1.8, h * .6 + 8), 0, M)                  # lower stage
                box(bb, Vector((u * w * .94, side * (d / 2 + .6), h * .75 - 1)), (.9, 1.2, h * .4), 0, M)  # upper stage
                if tall:  # a pinnacle on each buttress
                    p = M @ Vector((u * w * .94, side * (d / 2 + .6), h + 1.6)); box(bb, p, (.7, .7, 2.4), rot)
                    bmesh.ops.create_cone(bb, cap_ends=True, segments=4, radius1=.55, radius2=0, depth=3.4, matrix=Matrix.Translation(p + Vector((0, 0, 2.9))) @ Matrix.Rotation(rot + math.pi / 4, 4, 'Z'))
    if buttress: finish(obj_from_bm(name + '_butt', bb, [STONE2], col=CAS), bevel=.04)
    if gable_win:  # a great window high in each gable end
        for sx in (-1, 1):
            window(M @ Vector((sx * (w / 2 + .12), 0, h * .32)), M3 @ Vector((sx, 0, 0)), 3.0, h * .55, lit_or_dark(.9), 'lancet', mull=True, frame=.35)
    if lantern:  # an octagonal lantern on the ridge with its own spire
        lz = z0 + h + roof_h - .6; lx, ly_ = (M @ Vector((0, 0, 0))).x, (M @ Vector((0, 0, 0))).y
        lb = lathe(name + '_lantern', [(2.2, lz - 1), (2.2, lz + 4.2), (2.5, lz + 4.4), (2.5, lz + 4.8)], 8, [TRIM]); lb.location = (lx, ly_, 0); finish(lb, sharp=30, bevel=.03)
        sp = lathe(name + '_spire', [(2.6, lz + 4.8)] + [(2.6 * (1 - u) ** 1.2, lz + 4.8 + 11 * u) for u in (.2, .4, .6, .8)] + [(0, lz + 15.8)], 8, [LEAD]); sp.location = (lx, ly_, 0); finish(sp, sharp=30)
        finial(name + '_lfin', lx, ly_, lz + 15.6, h=3, vane=True)
        for i in range(8):
            a = i / 8 * 2 * math.pi + math.pi / 8; nn = Vector((math.cos(a), math.sin(a), 0))
            window(Vector((lx, ly_, lz + .2)) + nn * 2.1, nn, .9, 2.8, 0 if i % 2 else 1, 'lancet', mull=False, frame=.12)
    if chimneys:
        cb = bmesh.new()
        for k in range(chimneys):
            u = (k + .5) / chimneys - .5; p = M @ Vector((u * w * .8, d * .18, h + roof_h * .6))
            box(cb, p, (1.1, 1.6, roof_h * 1.2 + 3), rot); box(cb, p + Vector((0, 0, roof_h * .6 + 1.6)), (1.4, 1.9, .3), rot)
        finish(obj_from_bm(name + '_chim', cb, [STONE2], col=CAS), bevel=.04)

def wall(name, pts, z0, h, thick=2.6, cren=True):
    bm = bmesh.new()
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        a, b = Vector((ax, ay, 0)), Vector((bx, by, 0)); L = (b - a).length; ang = math.atan2(b.y - a.y, b.x - a.x); c = (a + b) / 2
        Mw = Matrix.Translation((c.x, c.y, z0)) @ Matrix.Rotation(ang, 4, 'Z')
        box(bm, Vector((0, 0, (h - 12) / 2)), (L + thick, thick, h + 12), 0, Mw)
        box(bm, Vector((0, -thick * .5, h - .4)), (L + thick, .5, .5), 0, Mw)
        if cren:
            n = int(L / 2.0)
            for k in range(n): box(bm, Vector((-L / 2 + (k + .5) * L / n, -thick * .32, h + .65)), (1.0, .6, 1.3), 0, Mw)
    finish(obj_from_bm(name, bm, [STONE2], col=CAS), bevel=.05)

def gatehouse(x, y, z0):
    tower('gate_l', x - 6.5, y, z0, 3.7, 24, roof_h=10, n_win=2, lit=.5, dorm=False)
    tower('gate_r', x + 6.5, y, z0, 3.7, 24, roof_h=10, n_win=2, lit=.5, dorm=False)
    bm = bmesh.new(); box(bm, Vector((x, y + 1.5, z0 + 7)), (10, 7, 26)); box(bm, Vector((x, y - 2.1, z0 + 19.4)), (10.6, .6, .5))
    finish(obj_from_bm('gate_block', bm, [STONE], col=CAS), bevel=.05)
    merlons('gate_mer', x, y + 1.5, z0 + 20, 0, square=(10, 7))
    # the archway: a dark round-headed opening with a gilt-studded portcullis glimpse, and a lantern above
    bm = bmesh.new(); pts = arch_pts(4.6, 7.2, 'round')
    vs = [bm.verts.new(Vector((x + u, y - 2.05, z0 - 1 + v))) for (u, v) in pts]; bm.faces.new(vs)
    obj_from_bm('gate_arch', bm, [ARCHDARK], col=CAS)
    window(Vector((x, y - 2.02, z0 - 1)), (0, -1, 0), 4.6, 7.2, -1, 'round', mull=False, frame=.5)
    window(Vector((x, y - 2.02, z0 + 10)), (0, -1, 0), 1.3, 2.6, 0, 'lancet')
    window(Vector((x - 2.6, y - 2.02, z0 + 14)), (0, -1, 0), .9, 2.0, 1, 'lancet', mull=False)
    window(Vector((x + 2.6, y - 2.02, z0 + 14)), (0, -1, 0), .9, 2.0, 2, 'lancet', mull=False)

def viaduct(name, a, b, deck, base, n, thick=5.5):
    """A stone bridge on round arches, built as one elevation (piers and arches notched out of the bottom) extruded."""
    a, b = Vector(a), Vector(b); d = (b - a); L = d.length; ang = math.atan2(d.y, d.x)
    M = Matrix.Translation((a.x, a.y, 0)) @ Matrix.Rotation(ang, 4, 'Z')
    bay = L / n; pier = bay * .22; span = bay - pier; rise = span / 2; spring = min(deck - rise - 3, deck * .62)
    out = [(0, base)]
    for k in range(n):
        x0 = k * bay + pier / 2 if k else pier
        x1 = (k + 1) * bay - pier / 2 if k < n - 1 else L - pier
        sp = x1 - x0; cx = (x0 + x1) / 2; rr = sp / 2
        out += [(x0, base), (x0, spring)] + [(cx - rr * math.cos(math.pi * i / 14), spring + rr * math.sin(math.pi * i / 14)) for i in range(1, 14)] + [(x1, spring), (x1, base)]
    out += [(L, base), (L, deck), (0, deck)]
    bm = bmesh.new(); vf = [bm.verts.new(M @ Vector((u, -thick / 2, v))) for (u, v) in out]; vb = [bm.verts.new(M @ Vector((u, thick / 2, v))) for (u, v) in out]
    bm.faces.new(vf); bm.faces.new(list(reversed(vb)))
    for i in range(len(out)):
        j = (i + 1) % len(out); bm.faces.new((vf[j], vf[i], vb[i], vb[j]))
    # parapets and a string course
    box(bm, Vector((L / 2, -thick / 2 + .25, deck + .6)), (L, .5, 1.2), 0, M); box(bm, Vector((L / 2, thick / 2 - .25, deck + .6)), (L, .5, 1.2), 0, M)
    box(bm, Vector((L / 2, 0, spring + rise + .9)), (L, thick + .5, .45), 0, M)
    finish(obj_from_bm(name, bm, [STONE2], col=CAS), sharp=30, bevel=.05)
    # lanterns along the parapet
    lb = bmesh.new()
    for k in range(1, n):
        p = M @ Vector((k * bay, -thick / 2 + .25, deck + 1.9)); bmesh.ops.create_uvsphere(lb, u_segments=8, v_segments=6, radius=.28, matrix=Matrix.Translation(p))
    obj_from_bm(name + '_lamps', lb, [emission_mat('lamp', (1, .62, .28), 18)], col=CAS)

# ------------------------------------------------------------------ the castle (gothic, original layout)
Z = 38
hall('great_hall', 0, 18, Z, 46, 16, 22, 15, tall=True, lit=.9, lantern=True, gable_win=True)
tower('astronomy', -26, 32, Z, 6.2, 70, roof_h=24, lit=.55, n_win=3)
tower('north', 22, 36, Z, 5.2, 54, roof_h=18, lit=.5)
tower('front_l', -36, -6, Z - 2, 5.0, 34, roof='crenel', roof_h=9, seg=8, lit=.6, n_win=3)
tower('front_r', 30, -4, Z - 1, 5.2, 40, roof_h=16, lit=.55)
for k, (tx, ty, th) in enumerate([(-23.6, 10.2, 33), (23.6, 10.2, 33), (-23.6, 25.8, 36), (23.6, 25.8, 36)]):
    tower(f'turret{k}', tx, ty, Z, 2.0, th, roof_h=9, lit=.4, n_win=2, dorm=False, mach=False, win_w=.7)
tower('east', 48, 22, Z - 2, 4.4, 44, roof_h=15, lit=.5)
tower('west_low', -50, 18, Z - 3, 4.0, 26, roof='crenel', roof_h=8, lit=.5)
tower('back_tall', 2, 54, Z + 1, 4.6, 60, roof_h=20, lit=.45, seg=8)
tower('east_back', 40, 50, Z, 3.4, 36, roof_h=12, lit=.4, dorm=False)
square_tower('clock', 36, 10, Z, 9, 52, 15, rot=.05)
hall('east_wing', 34, 42, Z, 26, 13, 24, 11, rot=.35, rows=3, chimneys=2)
hall('west_wing', -38, 44, Z, 22, 12, 19, 10, rot=-.25, rows=2, chimneys=2)
hall('front_house', -15, -7, Z - 1, 16, 10, 14, 8, rot=.12, rows=2, chimneys=1, buttress=False)
hall('north_range', -8, 46, Z, 24, 11, 18, 9, rot=.0, rows=2, chimneys=2, buttress=False)
gatehouse(8, -14, Z - 3)
wall('curtain', [(-50, 18), (-36, -6), (-24, -13), (1.5, -13.5)], Z - 3, 11)
wall('curtain_e', [(14.5, -13.5), (30, -4), (48, 22), (40, 50)], Z - 3, 11)
wall('curtain_back', [(-50, 18), (-44, 46), (-26, 32)], Z - 2, 10)
# a tower on a rock in the lake, joined to the castle by a viaduct
ISL = Vector((-64, -34)) if PORT else Vector((-74, -38))
viaduct('viaduct', (-47, 6), (ISL.x + 3, ISL.y + 5), Z - 1, -4, 4)
tower('lake_tower', ISL.x, ISL.y, 30, 4.0, 22, roof_h=13, lit=.7, n_win=3, facing=-math.pi / 2 - .3)
build_windows()

# ------------------------------------------------------------------ the promontory: a stratified rock cliff
ENV = collection('Environment')
EC = Vector((0, 20)); ERX, ERY = 66, 54
def prom_r(th, z):
    """Radius of the promontory at angle th and height z: buttresses and gullies down the face, broken ledges, a talus
    flaring into the water, and a rounded lip at the top."""
    base = 1 / math.sqrt((math.cos(th) / ERX) ** 2 + (math.sin(th) / ERY) ** 2)
    px, py = math.cos(th) * base, math.sin(th) * base
    gully = noise.fractal(Vector((px * .045, py * .045, z * .012)), 1.0, 2.1, 3) * 7.5
    ledges = noise.cell(Vector((px * .07, py * .07, z * .23 + noise.noise(Vector((px * .03, py * .03, 1))) * 2.5))) * 2.4
    rough = noise.fractal(Vector((px * .16, py * .16, z * .16)), 1.0, 2.0, 4) * 1.8
    talus = 15 * (1 - smooth(-4, 15, z)) ** 1.7
    lip = -3.5 * smooth(31, 38.4, z) ** 1.5
    return base + gully + ledges + rough + talus + lip + 3
def cliff():
    NT, zs = (360 if PREVIEW else 720), [-8 + i * (46.4 / 70) for i in range(71)]
    bm = bmesh.new(); rows = []
    for z in zs:
        rows.append([bm.verts.new((EC.x + math.cos(i / NT * 2 * math.pi) * prom_r(i / NT * 2 * math.pi, z), EC.y + math.sin(i / NT * 2 * math.pi) * prom_r(i / NT * 2 * math.pi, z), z + noise.noise(Vector((i * .07, z * .2, 4))) * .4)) for i in range(NT)])
    for a, b in zip(rows, rows[1:]):
        for i in range(NT): bm.faces.new((a[i], a[(i + 1) % NT], b[(i + 1) % NT], b[i]))
    ob = obj_from_bm('cliff', bm, [ROCK], col=ENV); finish(ob, sharp=70)
    # the plateau: a gently uneven disc inside the cliff's lip
    bm = bmesh.new(); NR = 28; prev = None
    for k in range(NR + 1):
        f = k / NR; ring = []
        for i in range(NT // 4):
            th = i / (NT // 4) * 2 * math.pi; r = prom_r(th, 38.2) * f
            x, y = EC.x + math.cos(th) * r, EC.y + math.sin(th) * r
            ring.append(bm.verts.new((x, y, 38.25 + noise.noise(Vector((x * .05, y * .05, 9))) * .5 - .6 * f ** 6)))
        if prev:
            for i in range(len(ring)): bm.faces.new((prev[i], prev[(i + 1) % len(ring)], ring[(i + 1) % len(ring)], ring[i]))
        prev = ring
    finish(obj_from_bm('plateau', bm, [MOSSROCK], col=ENV), sharp=80)
    # boulders at the waterline
    bm = bmesh.new(); rr = random.Random(4)
    for i in range(70 if not PREVIEW else 25):
        th = rr.uniform(0, 2 * math.pi); r = prom_r(th, -1) + rr.uniform(-2, 5); sz = rr.uniform(1.2, 4.5)
        v = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=sz, matrix=Matrix.Translation((EC.x + math.cos(th) * r, EC.y + math.sin(th) * r, rr.uniform(-1.5, .5))))['verts']
        for q in v: q.co += (q.co - Vector((EC.x + math.cos(th) * r, EC.y + math.sin(th) * r, 0))).normalized() * noise.noise(q.co * .5) * sz * .35; q.co.z *= .7
    finish(obj_from_bm('boulders', bm, [ROCK], col=ENV), sharp=50)
    # the lake tower's rock
    bm = bmesh.new(); NT2 = 120; rows = []
    for z in [-6 + i * 1.0 for i in range(37)]:
        rows.append([bm.verts.new((ISL.x + math.cos(i / NT2 * 2 * math.pi) * (6.5 + 7 * (1 - smooth(-4, 18, z)) ** 1.5 + noise.cell(Vector((math.cos(i / NT2 * 6.28) * 2, math.sin(i / NT2 * 6.28) * 2, z * .4))) * 1.6 - 1.5 * smooth(26, 30, z)),
                                     ISL.y + math.sin(i / NT2 * 2 * math.pi) * (6.5 + 7 * (1 - smooth(-4, 18, z)) ** 1.5 + noise.cell(Vector((math.cos(i / NT2 * 6.28) * 2, math.sin(i / NT2 * 6.28) * 2, z * .4))) * 1.6 - 1.5 * smooth(26, 30, z)), min(z, 30))) for i in range(NT2)])
    for a, b in zip(rows, rows[1:]):
        for i in range(NT2): bm.faces.new((a[i], a[(i + 1) % NT2], b[(i + 1) % NT2], b[i]))
    bm.faces.new(rows[-1]); finish(obj_from_bm('isle', bm, [ROCK], col=ENV), sharp=70)
cliff()

# ------------------------------------------------------------------ the shores, hills and mountains
def ground_mat():
    m = bpy.data.materials.new('ground'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; P = N['Principled BSDF']
    geo = N.new('ShaderNodeNewGeometry'); n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = .35; link(nt, geo.outputs['Position'], n2.inputs['Vector'])
    gr = N.new('ShaderNodeValToRGB'); gr.color_ramp.elements[0].color = (.01, .016, .012, 1); gr.color_ramp.elements[1].color = (.035, .045, .035, 1); link(nt, n2.outputs['Fac'], gr.inputs[0])
    link(nt, gr.outputs[0], P.inputs['Base Color']); P.inputs['Roughness'].default_value = .95
    return m
GROUND = ground_mat()
def height(x, y):
    hl = (-x - 140) * .38 + 30 * noise.noise(Vector((x * .006, y * .006, 4))) + 8 * noise.noise(Vector((x * .03, y * .03, 5)))
    hr = (x - 150) * .32 + 26 * noise.noise(Vector((x * .007, y * .007, 6))) + 8 * noise.noise(Vector((x * .03, y * .03, 8)))
    hb = (y - 380) * .38 + 60 * noise.noise(Vector((x * .004, y * .004, 11))) + 10 * noise.noise(Vector((x * .02, y * .02, 12)))
    ridge = 0
    if y > 60: ridge = 36 * smooth(70, 20, abs(x - 70 - (y - 60) * .8)) * smooth(60, 110, y) + noise.noise(Vector((x * .04, y * .04, 9))) * 5
    return min(max(hl, hr, hb, ridge, -8), 170)
def terrain(x0, x1, y0, y1, step, name, hole=None):
    bm = bmesh.new(); nx, ny = int((x1 - x0) / step) + 1, int((y1 - y0) / step) + 1
    vs = [[bm.verts.new((x0 + i * step, y0 + j * step, height(x0 + i * step, y0 + j * step))) for i in range(nx)] for j in range(ny)]
    for j in range(ny - 1):
        for i in range(nx - 1):
            if hole and all(hole(v.co) for v in (vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i])): continue
            bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    return finish(obj_from_bm(name, bm, [GROUND], col=ENV), sharp=89)
terrain(-420, 460, -320, 520, 4.0 if not PREVIEW else 8.0, 'land_near')
terrain(-1800, 1800, -900, 1700, 16, 'land_far', hole=lambda c: -416 < c.x < 456 and -316 < c.y < 516)
def mountains(elev_lift):
    bm = bmesh.new(); x0, x1, y0, y1, st = -6000, 6000, 1500, 5600, 30
    nx, ny = int((x1 - x0) / st) + 1, int((y1 - y0) / st) + 1; vs = []
    for j in range(ny):
        row = []
        for i in range(nx):
            x, y = x0 + i * st, y0 + j * st
            r1 = 1 - abs(noise.noise(Vector((x * .0011, y * .0012, 21)))); r2 = 1 - abs(noise.noise(Vector((x * .0031, y * .0029, 22))))
            h = (r1 ** 2.1) * 620 + (r2 ** 2.4) * 240 + noise.fractal(Vector((x * .01, y * .01, 23)), 1, 2, 3) * 30 - 160 + (y - y0) * .05
            h = h * smooth(y0, y0 + 600, y) * elev_lift - 60 * (1 - smooth(y0, y0 + 300, y))
            row.append(bm.verts.new((x, y, h)))
        vs.append(row)
    for j in range(ny - 1):
        for i in range(nx - 1): bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    m = mat('mountain', (.05, .055, .07), .9); nt = m.node_tree; N = nt.nodes
    geo = N.new('ShaderNodeNewGeometry'); sep = N.new('ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Position'], sep.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .004; link(nt, geo.outputs['Position'], nz.inputs['Vector'])
    ad = N.new('ShaderNodeMath'); ad.operation = 'MULTIPLY_ADD'; ad.inputs[1].default_value = 160; link(nt, nz.outputs['Fac'], ad.inputs[0]); link(nt, sep.outputs['Z'], ad.inputs[2])
    rmp = N.new('ShaderNodeMapRange'); rmp.inputs[1].default_value = 470; rmp.inputs[2].default_value = 560; link(nt, ad.outputs[0], rmp.inputs[0])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; link(nt, rmp.outputs[0], mx.inputs[0]); mx.inputs[6].default_value = (.03, .035, .045, 1); mx.inputs[7].default_value = (.6, .65, .75, 1)
    link(nt, mx.outputs[2], N['Principled BSDF'].inputs['Base Color'])
    finish(obj_from_bm('mountains', bm, [m], col=ENV), sharp=89)
mountains(1.0 if PORT else .8)

def water_mat():
    m = bpy.data.materials.new('water'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; P = N['Principled BSDF']
    P.inputs['Base Color'].default_value = (.002, .004, .008, 1); P.inputs['Roughness'].default_value = .025; P.inputs['IOR'].default_value = 1.33
    geo = N.new('ShaderNodeNewGeometry')
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (.32, 1.5, 1); link(nt, geo.outputs['Position'], mp.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.noise_dimensions = '4D'; nz.inputs['Scale'].default_value = 1.1; nz.inputs['Detail'].default_value = 7; link(nt, mp.outputs[0], nz.inputs['Vector'])
    for f, w in ((1, 0), (FRAMES, FRAMES / FPS * .22)): nz.inputs['W'].default_value = w; nz.inputs['W'].keyframe_insert('default_value', frame=f)
    mp2 = N.new('ShaderNodeMapping'); mp2.inputs['Scale'].default_value = (.04, .12, 1); link(nt, geo.outputs['Position'], mp2.inputs[0])
    sw = N.new('ShaderNodeTexNoise'); sw.inputs['Scale'].default_value = 1; link(nt, mp2.outputs[0], sw.inputs['Vector'])
    mx = N.new('ShaderNodeMath'); mx.operation = 'MULTIPLY_ADD'; mx.inputs[1].default_value = .5; link(nt, nz.outputs['Fac'], mx.inputs[0]); link(nt, sw.outputs['Fac'], mx.inputs[2])
    b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = .22; b.inputs['Distance'].default_value = .2; link(nt, mx.outputs[0], b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    return m
lake = bpy.data.meshes.new('lake'); bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=7000); bm.to_mesh(lake); bm.free(); lake.materials.append(water_mat())
s.collection.objects.link(bpy.data.objects.new('lake', lake))

# ------------------------------------------------------------------ pines
PINE = mat('pine', (.018, .036, .026), .8)
pn = PINE.node_tree.nodes; oi = pn.new('ShaderNodeObjectInfo'); hv = pn.new('ShaderNodeHueSaturation'); hv.inputs['Color'].default_value = (.018, .036, .026, 1)
vr = pn.new('ShaderNodeMapRange'); vr.inputs[3].default_value = .7; vr.inputs[4].default_value = 1.35; link(PINE.node_tree, oi.outputs['Random'], vr.inputs[0]); link(PINE.node_tree, vr.outputs[0], hv.inputs['Value'])
link(PINE.node_tree, hv.outputs[0], pn['Principled BSDF'].inputs['Base Color'])
pn['Principled BSDF'].inputs['Sheen Weight'].default_value = .5
def pine(name, h, seed, tiers=11):
    rr = random.Random(seed); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=.22 * h / 14, radius2=.04, depth=h * .4, matrix=Matrix.Translation((0, 0, h * .2)))
    for k in range(tiers):
        u = k / tiers; z = h * (.16 + u * .78); rad = h * .27 * (1 - u) ** 1.0 * rr.uniform(.85, 1.1) + .25; drop = h * .1 * (1 - u * .45)
        top = bm.verts.new((0, 0, z + drop * .8)); rim = []; seg = 9 + (2 if u < .5 else 0)
        for i in range(seg):
            a = i / seg * 2 * math.pi + rr.uniform(-.2, .2); rk = rad * rr.uniform(.6, 1.2)
            rim.append(bm.verts.new((math.cos(a) * rk, math.sin(a) * rk, z - drop * rr.uniform(.25, .7))))
            rim.append(bm.verts.new((math.cos(a + .3) * rk * .62, math.sin(a + .3) * rk * .62, z - drop * .05)))
        for i in range(len(rim)): bm.faces.new((top, rim[i], rim[(i + 1) % len(rim)]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(PINE); return me
PINES = [pine(f'pine{k}', 14, k) for k in range(5)]
TREES = collection('Trees'); RT = random.Random(3); n_tree = 0
def on_prom(x, y, margin=0):
    th = math.atan2(y - EC.y, x - EC.x); return math.hypot(x - EC.x, y - EC.y) < prom_r(th, 38) - margin
def in_castle(x, y): return (-56 < x < 54 and -18 < y < 60) or (Vector((x, y)) - ISL).length < 10 or (-66 < x < -40 and -40 < y < 10)
def scatter(x0, x1, y0, y1, count, sc=1.0, prom=False):
    global n_tree; tries = 0
    while tries < count * 5 and count > 0:
        tries += 1; x, y = RT.uniform(x0, x1), RT.uniform(y0, y1)
        if prom:
            if not on_prom(x, y, 2) or in_castle(x, y): continue
            z = 38.2
        else:
            if on_prom(x, y, -12): continue
            z = height(x, y)
            if z < 1.5 or math.hypot(height(x + 2, y) - z, height(x, y + 2) - z) > 2.4: continue
        if noise.noise(Vector((x * .02, y * .02, 31))) < -.38: continue
        ob = bpy.data.objects.new(f't{n_tree}', PINES[n_tree % len(PINES)]); TREES.objects.link(ob); n_tree += 1
        k = RT.uniform(.65, 1.35) * sc; ob.scale = (k, k, k * RT.uniform(.9, 1.25)); ob.location = (x, y, z - .4); ob.rotation_euler = (RT.uniform(-.04, .04), RT.uniform(-.04, .04), RT.uniform(0, 6.3))
        count -= 1
scatter(-80, 80, -40, 85, 180 if not PREVIEW else 80, .9, prom=True)
scatter(-420, 460, -320, 520, 2600 if not PREVIEW else 700)
scatter(-1400, 1400, -700, 1500, 2600 if not PREVIEW else 500, 1.7)

# far-shore village lights (a hamlet on the hills across the water)
VL = emission_mat('village', (1, .58, .24), 40)
bm = bmesh.new(); rv = random.Random(12)
for cx, cy, n in ((-260, 560, 26), (230, 640, 18), (-520, 760, 14), (520, 520, 10)):
    for i in range(n):
        x, y = cx + rv.gauss(0, 22), cy + rv.gauss(0, 16); z = height(x, y) + 1.5
        bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=.6 + rv.random() * .5, matrix=Matrix.Translation((x, y, z)))
obj_from_bm('village', bm, [VL], col=ENV)

# ------------------------------------------------------------------ sky, moon, clouds, light
EL, AZ = (math.radians(27), math.radians(-12)) if PORT else (math.radians(16.5), math.radians(-20))
MOON_DIR = Vector((math.sin(AZ) * math.cos(EL), math.cos(AZ) * math.cos(EL), math.sin(EL)))
w = s.world; nt = w.node_tree; N = nt.nodes; bg = N['Background']
tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Generated'], sep.inputs[0])
grad = N.new('ShaderNodeValToRGB'); link(nt, sep.outputs['Z'], grad.inputs[0])
el = grad.color_ramp.elements; el[0].position = 0; el[0].color = (.016, .024, .046, 1); el[1].position = .5; el[1].color = (.0014, .0026, .008, 1)
e2 = el.new(.05); e2.color = (.02, .03, .056, 1)
vor = N.new('ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 520; link(nt, tc.outputs['Generated'], vor.inputs['Vector'])
st = N.new('ShaderNodeMapRange'); st.inputs[1].default_value = .05; st.inputs[2].default_value = 0; link(nt, vor.outputs['Distance'], st.inputs[0])
pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 7; link(nt, st.outputs[0], pw.inputs[0])
cs = N.new('ShaderNodeSeparateColor'); link(nt, vor.outputs['Color'], cs.inputs[0])
cp = N.new('ShaderNodeMath'); cp.operation = 'POWER'; cp.inputs[1].default_value = 3; link(nt, cs.outputs[0], cp.inputs[0])
rnd = N.new('ShaderNodeMath'); rnd.operation = 'MULTIPLY'; link(nt, pw.outputs[0], rnd.inputs[0]); link(nt, cp.outputs[0], rnd.inputs[1])
hz = N.new('ShaderNodeMapRange'); hz.inputs[1].default_value = .03; hz.inputs[2].default_value = .22; link(nt, sep.outputs['Z'], hz.inputs[0])
sm = N.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'; link(nt, rnd.outputs[0], sm.inputs[0]); link(nt, hz.outputs[0], sm.inputs[1])
sm2 = N.new('ShaderNodeMath'); sm2.operation = 'MULTIPLY'; sm2.inputs[1].default_value = 3.0; link(nt, sm.outputs[0], sm2.inputs[0])
dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; link(nt, tc.outputs['Generated'], dot.inputs[0]); dot.inputs[1].default_value = MOON_DIR
dc = N.new('ShaderNodeMath'); dc.operation = 'MAXIMUM'; dc.inputs[1].default_value = 0; link(nt, dot.outputs['Value'], dc.inputs[0])
halo = N.new('ShaderNodeMath'); halo.operation = 'POWER'; halo.inputs[1].default_value = 60; link(nt, dc.outputs[0], halo.inputs[0])
halo2 = N.new('ShaderNodeMath'); halo2.operation = 'POWER'; halo2.inputs[1].default_value = 1400; link(nt, dc.outputs[0], halo2.inputs[0])
hsum = N.new('ShaderNodeMath'); hsum.operation = 'MULTIPLY_ADD'; hsum.inputs[1].default_value = .14; link(nt, halo.outputs[0], hsum.inputs[0]); link(nt, halo2.outputs[0], hsum.inputs[2])
hcol = N.new('ShaderNodeMix'); hcol.data_type = 'RGBA'; hcol.blend_type = 'ADD'; link(nt, hsum.outputs[0], hcol.inputs[0]); link(nt, grad.outputs[0], hcol.inputs[6]); hcol.inputs[7].default_value = (.2, .26, .4, 1)
star = N.new('ShaderNodeMix'); star.data_type = 'RGBA'; star.blend_type = 'ADD'; link(nt, sm2.outputs[0], star.inputs[0]); link(nt, hcol.outputs[2], star.inputs[6]); star.inputs[7].default_value = (1, .97, .92, 1)
link(nt, star.outputs[2], bg.inputs[0]); bg.inputs[1].default_value = 1

moon_img = blu.portable(os.path.expanduser('~/projects/render-workspace/assets/moon.png'))
mm = bpy.data.materials.new('moon'); mm.use_nodes = True; mnt = mm.node_tree; MN = mnt.nodes; MN.remove(MN['Principled BSDF'])
mtc = MN.new('ShaderNodeTexCoord'); mtx = MN.new('ShaderNodeTexImage'); mtx.image = moon_img; link(mnt, mtc.outputs['UV'], mtx.inputs[0])
mem = MN.new('ShaderNodeEmission'); mem.inputs[1].default_value = 7; link(mnt, mtx.outputs[0], mem.inputs[0]); link(mnt, mem.outputs[0], MN['Material Output'].inputs[0])
DIST, RAD = 60000, 1100
bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=RAD); me = bpy.data.meshes.new('moon'); bm.to_mesh(me); bm.free()
uv = me.uv_layers.new()
for l in me.loops: v = me.vertices[l.vertex_index].co; uv.data[l.index].uv = (v.x / RAD / 2 + .5, v.y / RAD / 2 + .5)
me.materials.append(mm); moon = bpy.data.objects.new('moon', me); s.collection.objects.link(moon)
moon.location = MOON_DIR * DIST; moon.rotation_euler = MOON_DIR.to_track_quat('Z', 'Y').to_euler(); moon.visible_shadow = False
for attr in ('visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_volume_scatter'): setattr(moon, attr, attr == 'visible_glossy')

def cloud_mat(name, dens, seed):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.remove(N['Principled BSDF']); out = N['Material Output']
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (2.6, 1.0, 1); mp.inputs['Location'].default_value = (seed, seed * .7, 0); link(nt, tc.outputs['Generated'], mp.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.noise_dimensions = '4D'; nz.inputs['Scale'].default_value = 2.2; nz.inputs['Detail'].default_value = 8; nz.inputs['Roughness'].default_value = .62; link(nt, mp.outputs[0], nz.inputs['Vector'])
    for f, wv in ((1, 0), (FRAMES, .35)): nz.inputs['W'].default_value = wv; nz.inputs['W'].keyframe_insert('default_value', frame=f)
    # fade toward the card's edges
    sp = N.new('ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Generated'], sp.inputs[0])
    def edge(sock):
        a = N.new('ShaderNodeMath'); a.operation = 'PINGPONG'; a.inputs[1].default_value = .5; link(nt, sock, a.inputs[0])
        b = N.new('ShaderNodeMapRange'); b.inputs[1].default_value = 0; b.inputs[2].default_value = .22; link(nt, a.outputs[0], b.inputs[0]); return b.outputs[0]
    ex = N.new('ShaderNodeMath'); ex.operation = 'MULTIPLY'; link(nt, edge(sp.outputs['X']), ex.inputs[0]); link(nt, edge(sp.outputs['Y']), ex.inputs[1])
    th = N.new('ShaderNodeMapRange'); th.inputs[1].default_value = .5; th.inputs[2].default_value = .78; link(nt, nz.outputs['Fac'], th.inputs[0])
    d = N.new('ShaderNodeMath'); d.operation = 'MULTIPLY'; link(nt, th.outputs[0], d.inputs[0]); link(nt, ex.outputs[0], d.inputs[1])
    d2 = N.new('ShaderNodeMath'); d2.operation = 'MULTIPLY'; d2.inputs[1].default_value = dens; d2.use_clamp = True; link(nt, d.outputs[0], d2.inputs[0])
    # brighter where the cloud is thin and near the moon (silver lining)
    geo = N.new('ShaderNodeNewGeometry'); nv = N.new('ShaderNodeVectorMath'); nv.operation = 'NORMALIZE'; link(nt, geo.outputs['Position'], nv.inputs[0])
    dm = N.new('ShaderNodeVectorMath'); dm.operation = 'DOT_PRODUCT'; dm.inputs[1].default_value = MOON_DIR; link(nt, nv.outputs[0], dm.inputs[0])
    gm = N.new('ShaderNodeMath'); gm.operation = 'POWER'; gm.inputs[1].default_value = 220; link(nt, dm.outputs['Value'], gm.inputs[0])
    gl = N.new('ShaderNodeMath'); gl.operation = 'MULTIPLY_ADD'; gl.inputs[1].default_value = 3.2; gl.inputs[2].default_value = .055; link(nt, gm.outputs[0], gl.inputs[0])
    em = N.new('ShaderNodeEmission'); em.inputs[0].default_value = (.6, .68, .9, 1); link(nt, gl.outputs[0], em.inputs[1])
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader'); link(nt, d2.outputs[0], mx.inputs[0]); link(nt, tr.outputs[0], mx.inputs[1]); link(nt, em.outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], out.inputs[0]); return m
for k, (daz, del_, dist, w_, h_, dens) in enumerate([(-.05, .03, 9000, 5200, 1500, .85), (.16, -.06, 8000, 6000, 1700, .7), (-.24, -.1, 7600, 5000, 1300, .7), (.05, .1, 10000, 7000, 1800, .5), (-.4, .02, 9000, 5000, 1500, .6)]):
    a = AZ + daz; e = EL + del_; d = Vector((math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)))
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=.5); me = bpy.data.meshes.new(f'cloud{k}'); bm.to_mesh(me); bm.free(); me.materials.append(cloud_mat(f'cloud{k}', dens, k * 3.7))
    ob = bpy.data.objects.new(f'cloud{k}', me); s.collection.objects.link(ob)
    ob.location = d * dist; ob.rotation_euler = (-d).to_track_quat('Z', 'Y').to_euler(); ob.scale = (w_, h_, 1)
    ob.visible_shadow = False; ob.visible_diffuse = False; ob.visible_glossy = True
    side = d.cross(Vector((0, 0, 1))).normalized()
    ob.keyframe_insert('location', frame=1); ob.location = d * dist + side * 160; ob.keyframe_insert('location', frame=FRAMES)

sun = bpy.data.objects.new('moonlight', bpy.data.lights.new('moonlight', 'SUN')); s.collection.objects.link(sun)
sun.data.energy = .95; sun.data.color = (.66, .75, 1.0); sun.data.angle = math.radians(.6)
sun.rotation_euler = (-MOON_DIR).to_track_quat('-Z', 'Y').to_euler()
fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN')); s.collection.objects.link(fill)
fill.data.energy = .62; fill.data.color = (.55, .63, .92); fill.rotation_euler = (-Vector((-.45, -1, .55)).normalized()).to_track_quat('-Z', 'Y').to_euler()
fill.data.angle = math.radians(20)
for (x, y, z, e) in [(0, 6, Z + 9, 2600), (-24, 22, Z + 30, 700), (20, 26, Z + 22, 700), (36, 4, Z + 18, 600), (-14, -14, Z + 6, 700), (8, -18, Z + 2, 900), (ISL.x, ISL.y - 6, 40, 500)]:
    L = bpy.data.objects.new('warm', bpy.data.lights.new('warm', 'POINT')); L.data.energy = e; L.data.color = (1, .6, .28); L.data.shadow_soft_size = 2; L.location = (x, y, z); s.collection.objects.link(L); L.visible_camera = False; L.visible_glossy = False

def volumes():
    m = bpy.data.materials.new('mist'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    v = N.new('ShaderNodeVolumePrincipled'); v.inputs['Color'].default_value = (.75, .82, 1, 1); v.inputs['Anisotropy'].default_value = .5
    geo = N.new('ShaderNodeNewGeometry'); sep = N.new('ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Position'], sep.inputs[0])
    fall = N.new('ShaderNodeMapRange'); fall.inputs[1].default_value = 0; fall.inputs[2].default_value = 9; fall.inputs[3].default_value = 1; fall.inputs[4].default_value = 0; link(nt, sep.outputs['Z'], fall.inputs[0])
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (.011, .018, .06); link(nt, geo.outputs['Position'], mp.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.noise_dimensions = '4D'; nz.inputs['Detail'].default_value = 3; link(nt, mp.outputs[0], nz.inputs['Vector'])
    for f, wv in ((1, 0), (FRAMES, .7)): nz.inputs['W'].default_value = wv; nz.inputs['W'].keyframe_insert('default_value', frame=f)
    c = N.new('ShaderNodeMapRange'); c.inputs[1].default_value = .42; c.inputs[2].default_value = .72; link(nt, nz.outputs['Fac'], c.inputs[0])
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; link(nt, fall.outputs[0], mul.inputs[0]); link(nt, c.outputs[0], mul.inputs[1])
    d = N.new('ShaderNodeMath'); d.operation = 'MULTIPLY'; d.inputs[1].default_value = .035; link(nt, mul.outputs[0], d.inputs[0])
    link(nt, d.outputs[0], v.inputs['Density']); link(nt, v.outputs[0], N['Material Output'].inputs['Volume'])
    bm = bmesh.new(); box(bm, Vector((0, 120, 5)), (900, 900, 11)); obj_from_bm('mist', bm, [m])
    h = bpy.data.materials.new('haze'); h.use_nodes = True; nt = h.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    v = N.new('ShaderNodeVolumePrincipled'); v.inputs['Color'].default_value = (.55, .65, .9, 1); v.inputs['Density'].default_value = .00013; v.inputs['Anisotropy'].default_value = .55
    link(nt, v.outputs[0], N['Material Output'].inputs['Volume'])
    bm = bmesh.new(); box(bm, Vector((0, 2600, 400)), (10000, 5000, 1200)); obj_from_bm('haze', bm, [h])
    # a faint glow of haze around the castle itself, catching the moon and the windows
    g = bpy.data.materials.new('castlehaze'); g.use_nodes = True; nt = g.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    v = N.new('ShaderNodeVolumePrincipled'); v.inputs['Color'].default_value = (.7, .76, .95, 1); v.inputs['Density'].default_value = .0006; v.inputs['Anisotropy'].default_value = .6
    link(nt, v.outputs[0], N['Material Output'].inputs['Volume'])
    bm = bmesh.new(); box(bm, Vector((0, 40, 80)), (300, 220, 120)); obj_from_bm('castlehaze', bm, [g])
volumes()

# ------------------------------------------------------------------ camera: from the moon, down across the lake to the castle; then a slow drift that loops
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera = cam
cam.data.lens = 30 if PORT else 32; cam.data.sensor_fit = 'AUTO'; cam.data.clip_end = 90000; cam.data.clip_start = .2
P0 = Vector((-26, -470, 150)); P1 = Vector((-6, -196, 19)) if PORT else Vector((-10, -232, 23))
CASTLE_AIM = Vector((-2, 30, 52)) if PORT else Vector((-4, 30, 60))
MOON_AIM = P0 + MOON_DIR * 800 + Vector((0, 0, -60))
DESC0, DESC1 = 2.2, 9.8   # seconds
def cam_at(t):
    u = ease_io((t - DESC0) / (DESC1 - DESC0))
    p = P0.lerp(P1, u) + Vector((math.sin(u * math.pi) * 34, 0, math.sin(u * math.pi) * 18)) + Vector((0, t * 3.2 * (1 - u), 0))
    drift = max(0, t - DESC1); p += Vector((drift * 1.1, drift * 2.6, -drift * .25))
    aim = MOON_AIM.lerp(CASTLE_AIM, ease_io((t - DESC0 - .6) / (DESC1 - DESC0 - .3))) + Vector((drift * .9, 0, 0))
    return p, (aim - p).normalized().to_track_quat('-Z', 'Y')
cam.rotation_mode = 'QUATERNION'
for f in range(1, FRAMES + 1):
    p, q = cam_at(f / FPS); cam.location = p; cam.rotation_quaternion = q
    cam.keyframe_insert('location', frame=f); cam.keyframe_insert('rotation_quaternion', frame=f)
def cam_matrix(t):
    p, q = cam_at(t); return p, q.to_matrix()

# ------------------------------------------------------------------ the owl
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'owl.py')).read())

# ------------------------------------------------------------------ render settings
s.render.resolution_x, s.render.resolution_y = (1080, 1920) if PORT else (1440, 810)
s.cycles.samples = 64; s.cycles.use_denoising = True
try: s.cycles.denoiser = 'OPENIMAGEDENOISE'
except TypeError: pass
s.cycles.max_bounces = 6; s.cycles.diffuse_bounces = 2; s.cycles.glossy_bounces = 3; s.cycles.transparent_max_bounces = 16; s.cycles.volume_bounces = 0
s.cycles.volume_step_rate = 3; s.cycles.volume_preview_step_rate = 4
s.view_settings.view_transform = 'AgX'; s.view_settings.look = 'AgX - Medium High Contrast'; s.view_settings.exposure = .78
s.render.image_settings.file_format = 'PNG'
s.render.use_motion_blur = True; s.render.motion_blur_shutter = .5
if 'render' in OPT:   # quick local previews (CPU)
    s.render.resolution_percentage = int(float(OPT.get('res', .25)) * 100); s.cycles.samples = int(OPT.get('spp', 16)); s.cycles.device = 'CPU'
    s.render.use_motion_blur = False; s.cycles.volume_step_rate = 6
    d = OPT.get('dir', '/tmp'); os.makedirs(d, exist_ok=True)
    for f in [int(x) for x in OPT['render'].split(',')]:
        s.frame_set(f); s.render.filepath = os.path.join(d, f'{ORIENT[0]}_{f:04d}.png'); bpy.ops.render.render(write_still=True)
else:
    blu.save(OUT, (1, FRAMES))
