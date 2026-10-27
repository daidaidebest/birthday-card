"""The two-tier birthday cake (v17), built so it reads as a real cake rather than a CG model (run inside Blender).
Buttercream with subsurface scattering, a soft sheen, scraper marks and contact darkening; tiers with slightly uneven
sides and soft, irregular top edges; star-tip shell borders with jittered size, spacing and tilt; sugar pearls of
varied lustre (thin-film nacre); sugar roses with spiral, cupped, rolled-back petals that have thickness and
translucency (blush at the heart, ivory outside, dusted edges) and veined sugar leaves; ivory wax candles with
subsurface glow, a faint melt pool, a charred wick and a drip or two; a few crumbs.
build() keeps every dimension the v16 cake had (stand, tiers, candle positions and wick tips), so cameras and the
web page's wick coordinates stay valid. Returns the wick tips."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise
from blu import obj_from_bm, link

def _n(nt, kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items(): setattr(n, k, v)
    return n

def _math(nt, op, a=None, b=None, v0=None, v1=None):
    m = nt.nodes.new('ShaderNodeMath'); m.operation = op
    if v0 is not None: m.inputs[0].default_value = v0
    if v1 is not None: m.inputs[1].default_value = v1
    if a is not None: link(nt, a, m.inputs[0])
    if b is not None: link(nt, b, m.inputs[1])
    return m.outputs[0]

def _madd(nt, a, k, c):
    """a * k + c"""
    m = nt.nodes.new('ShaderNodeMath'); m.operation = 'MULTIPLY_ADD'; m.inputs[1].default_value = k
    link(nt, a, m.inputs[0])
    if isinstance(c, (int, float)): m.inputs[2].default_value = c
    else: link(nt, c, m.inputs[2])
    return m.outputs[0]

def _mix(nt, fac, a, b, blend='MIX'):
    m = nt.nodes.new('ShaderNodeMix'); m.data_type = 'RGBA'; m.blend_type = blend
    for sock, val in ((m.inputs[0], fac), (m.inputs[6], a), (m.inputs[7], b)):
        if isinstance(val, (int, float)): sock.default_value = val
        elif isinstance(val, tuple): sock.default_value = (*val, 1) if len(val) == 3 else val
        else: link(nt, val, sock)
    return m.outputs[2]

def _principled(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; return m, nt, nt.nodes['Principled BSDF']

def _set(P, **kw):
    for k, v in kw.items():
        key = k.replace('_', ' ')
        P.inputs[key].default_value = (*v, 1) if isinstance(v, tuple) and len(v) == 3 and key in ('Base Color', 'Emission Color', 'Sheen Tint', 'Coat Tint', 'Specular Tint') else v

# ------------------------------------------------------------------ materials
def buttercream(name='buttercream', tint=(.94, .885, .80), ombre=None):
    """Satin buttercream: SSS, sheen, scraper marks + fine grain as bump, darker in contact creases (AO)."""
    m, nt, P = _principled(name)
    _set(P, Roughness=.36, Subsurface_Weight=1.0, Subsurface_Radius=(1.0, .5, .28), Subsurface_Scale=.005,
         Specular_IOR_Level=.42, Sheen_Weight=.35, Sheen_Roughness=.45, Sheen_Tint=(1, .96, .9), Coat_Weight=.06, Coat_Roughness=.3)
    tc = _n(nt, 'ShaderNodeTexCoord'); geo = _n(nt, 'ShaderNodeNewGeometry')
    # colour: a whisper of mottling, and an optional blush ombre toward the base of the tier
    mot = _n(nt, 'ShaderNodeTexNoise'); mot.inputs['Scale'].default_value = 18; mot.inputs['Detail'].default_value = 3
    link(nt, tc.outputs['Object'], mot.inputs['Vector'])
    col = _mix(nt, _math(nt, 'MULTIPLY', mot.outputs['Fac'], v1=.12), tint, (tint[0] * .95, tint[1] * .9, tint[2] * .84))
    if ombre:
        z0, z1, oc = ombre
        sep = _n(nt, 'ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Position'], sep.inputs[0])
        mr = _n(nt, 'ShaderNodeMapRange'); mr.inputs[1].default_value = z0; mr.inputs[2].default_value = z1; mr.inputs[3].default_value = .55; mr.inputs[4].default_value = 0
        link(nt, sep.outputs['Z'], mr.inputs[0]); col = _mix(nt, mr.outputs[0], col, oc)
    ao = _n(nt, 'ShaderNodeAmbientOcclusion'); ao.samples = 12; ao.inputs['Distance'].default_value = .018
    aof = _n(nt, 'ShaderNodeMapRange'); aof.inputs[3].default_value = .52; aof.inputs[4].default_value = 1; link(nt, ao.outputs['AO'], aof.inputs[0])
    col = _mix(nt, 1, col, aof.outputs[0], 'MULTIPLY')
    link(nt, col, P.inputs['Base Color'])
    # scraper marks: soft horizontal bands, broken up; fine grain on top
    wv = _n(nt, 'ShaderNodeTexWave', wave_type='BANDS', bands_direction='Z'); wv.inputs['Scale'].default_value = 26; wv.inputs['Distortion'].default_value = 7
    wv.inputs['Detail'].default_value = 3; wv.inputs['Detail Scale'].default_value = 1.5; link(nt, tc.outputs['Object'], wv.inputs['Vector'])
    gr = _n(nt, 'ShaderNodeTexNoise'); gr.inputs['Scale'].default_value = 420; gr.inputs['Detail'].default_value = 4; link(nt, tc.outputs['Object'], gr.inputs['Vector'])
    bl = _n(nt, 'ShaderNodeTexNoise'); bl.inputs['Scale'].default_value = 70; bl.inputs['Detail'].default_value = 5; link(nt, tc.outputs['Object'], bl.inputs['Vector'])
    h = _madd(nt, gr.outputs['Fac'], .25, _madd(nt, wv.outputs['Fac'], .35, bl.outputs['Fac']))
    b = _n(nt, 'ShaderNodeBump'); b.inputs['Strength'].default_value = .22; b.inputs['Distance'].default_value = .0012
    link(nt, h, b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal']); link(nt, b.outputs[0], ao.inputs['Normal'])
    rr = _n(nt, 'ShaderNodeMapRange'); rr.inputs[3].default_value = .3; rr.inputs[4].default_value = .46; link(nt, bl.outputs['Fac'], rr.inputs[0]); link(nt, rr.outputs[0], P.inputs['Roughness'])
    return m

def sugar_rose_mat():
    m, nt, P = _principled('sugar_rose')
    _set(P, Roughness=.52, Subsurface_Weight=.85, Subsurface_Radius=(1.0, .32, .26), Subsurface_Scale=.0035,
         Specular_IOR_Level=.32, Sheen_Weight=.55, Sheen_Roughness=.35, Sheen_Tint=(1, .93, .92))
    at = _n(nt, 'ShaderNodeAttribute', attribute_name='Col'); geo = _n(nt, 'ShaderNodeNewGeometry')
    j = _n(nt, 'ShaderNodeMapRange'); j.inputs[3].default_value = .93; j.inputs[4].default_value = 1.05; link(nt, geo.outputs['Random Per Island'], j.inputs[0])
    col = _mix(nt, 1, at.outputs['Color'], j.outputs[0], 'MULTIPLY')
    link(nt, col, P.inputs['Base Color'])
    tc = _n(nt, 'ShaderNodeTexCoord'); nz = _n(nt, 'ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 900; nz.inputs['Detail'].default_value = 3
    link(nt, tc.outputs['Object'], nz.inputs['Vector'])
    b = _n(nt, 'ShaderNodeBump'); b.inputs['Strength'].default_value = .12; b.inputs['Distance'].default_value = .0004
    link(nt, nz.outputs['Fac'], b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    return m

def leaf_mat():
    m, nt, P = _principled('sugar_leaf')
    _set(P, Roughness=.5, Subsurface_Weight=.35, Subsurface_Radius=(.4, 1.0, .35), Subsurface_Scale=.002, Sheen_Weight=.4, Sheen_Roughness=.4,
         Specular_IOR_Level=.35)
    uv = _n(nt, 'ShaderNodeUVMap'); sep = _n(nt, 'ShaderNodeSeparateXYZ'); link(nt, uv.outputs[0], sep.inputs[0])
    au = _math(nt, 'ABSOLUTE', sep.outputs['X'])
    # veins: the midrib and slanted side veins (sin bands along v - |u|)
    mid = _n(nt, 'ShaderNodeMapRange'); mid.inputs[1].default_value = 0; mid.inputs[2].default_value = .07; mid.inputs[3].default_value = 1; mid.inputs[4].default_value = 0
    link(nt, au, mid.inputs[0])
    sl = _madd(nt, au, -.45, sep.outputs['Y'])
    sv = _math(nt, 'SINE', _math(nt, 'MULTIPLY', sl, v1=60))
    svp = _math(nt, 'POWER', _madd(nt, sv, .5, .5), v1=14)
    veins = _math(nt, 'MAXIMUM', mid.outputs[0], _math(nt, 'MULTIPLY', svp, v1=.6))
    col = _mix(nt, _math(nt, 'MULTIPLY', au, v1=.5), (.15, .25, .13), (.28, .38, .22))
    col = _mix(nt, _math(nt, 'MULTIPLY', veins, v1=.3), col, (.36, .45, .28))
    link(nt, col, P.inputs['Base Color'])
    b = _n(nt, 'ShaderNodeBump'); b.inputs['Strength'].default_value = .5; b.inputs['Distance'].default_value = .0006; b.invert = True
    link(nt, veins, b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    return m

def pearl_mat():
    """Sugar pearls: nacre (thin film) with a lustre that varies pearl to pearl."""
    m, nt, P = _principled('pearl')
    geo = _n(nt, 'ShaderNodeNewGeometry'); rnd = geo.outputs['Random Per Island']
    col = _mix(nt, rnd, (.93, .89, .82), (.96, .9, .88))
    link(nt, col, P.inputs['Base Color'])
    r = _n(nt, 'ShaderNodeMapRange'); r.inputs[3].default_value = .1; r.inputs[4].default_value = .32; link(nt, rnd, r.inputs[0]); link(nt, r.outputs[0], P.inputs['Roughness'])
    mt = _n(nt, 'ShaderNodeMapRange'); mt.inputs[3].default_value = .35; mt.inputs[4].default_value = .75
    link(nt, _math(nt, 'FRACT', _math(nt, 'MULTIPLY', rnd, v1=7.31)), mt.inputs[0]); link(nt, mt.outputs[0], P.inputs['Metallic'])
    tf = _n(nt, 'ShaderNodeMapRange'); tf.inputs[3].default_value = 250; tf.inputs[4].default_value = 520
    link(nt, _math(nt, 'FRACT', _math(nt, 'MULTIPLY', rnd, v1=3.7)), tf.inputs[0]); link(nt, tf.outputs[0], P.inputs['Thin Film Thickness'])
    _set(P, Thin_Film_IOR=1.45, Coat_Weight=.6, Coat_Roughness=.08)
    return m

def wax_mat(name='wax'):
    """Ivory wax: deep subsurface glow, a faint per-candle tint, satin surface with fine pours."""
    m, nt, P = _principled(name)
    _set(P, Roughness=.32, Subsurface_Weight=1.0, Subsurface_Radius=(1.0, .62, .36), Subsurface_Scale=.007, Specular_IOR_Level=.45,
         Coat_Weight=.15, Coat_Roughness=.22)
    oi = _n(nt, 'ShaderNodeObjectInfo')
    col = _mix(nt, oi.outputs['Random'], (.94, .87, .74), (.95, .84, .76))
    link(nt, col, P.inputs['Base Color'])
    tc = _n(nt, 'ShaderNodeTexCoord'); nz = _n(nt, 'ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 300; nz.inputs['Detail'].default_value = 4
    link(nt, tc.outputs['Object'], nz.inputs['Vector'])
    b = _n(nt, 'ShaderNodeBump'); b.inputs['Strength'].default_value = .08; b.inputs['Distance'].default_value = .0005
    link(nt, nz.outputs['Fac'], b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    return m

def melt_mat():
    m, nt, P = _principled('melt_pool')
    _set(P, Base_Color=(.96, .88, .72), Roughness=.06, Subsurface_Weight=1.0, Subsurface_Radius=(1.0, .7, .45), Subsurface_Scale=.01, Specular_IOR_Level=.5)
    return m

def wick_mat():
    """Cotton soaked dark at the root, charred black above, a little grey ash at the very tip."""
    m, nt, P = _principled('wick')
    geo = _n(nt, 'ShaderNodeNewGeometry'); oi = _n(nt, 'ShaderNodeObjectInfo')
    rel = _n(nt, 'ShaderNodeVectorMath', operation='SUBTRACT'); link(nt, geo.outputs['Position'], rel.inputs[0]); link(nt, oi.outputs['Location'], rel.inputs[1])
    sep = _n(nt, 'ShaderNodeSeparateXYZ'); link(nt, rel.outputs[0], sep.inputs[0])
    t = _n(nt, 'ShaderNodeMapRange'); t.inputs[1].default_value = .0015; t.inputs[2].default_value = .0045; link(nt, sep.outputs['Z'], t.inputs[0])
    col = _mix(nt, t.outputs[0], (.16, .12, .08), (.012, .011, .01))
    a = _n(nt, 'ShaderNodeMapRange'); a.inputs[1].default_value = .0088; a.inputs[2].default_value = .0102; link(nt, sep.outputs['Z'], a.inputs[0])
    col = _mix(nt, _math(nt, 'MULTIPLY', a.outputs[0], v1=.7), col, (.2, .19, .18))
    link(nt, col, P.inputs['Base Color']); _set(P, Roughness=.85, Sheen_Weight=.3)
    return m

def stand_gold():
    m, nt, P = _principled('stand_gold')
    _set(P, Base_Color=(1.0, .77, .42), Metallic=1.0, Roughness=.24, Anisotropic=.3)
    tc = _n(nt, 'ShaderNodeTexCoord'); nz = _n(nt, 'ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 40; nz.inputs['Detail'].default_value = 6
    link(nt, tc.outputs['Object'], nz.inputs['Vector'])
    r = _n(nt, 'ShaderNodeMapRange'); r.inputs[3].default_value = .16; r.inputs[4].default_value = .36; link(nt, nz.outputs['Fac'], r.inputs[0]); link(nt, r.outputs[0], P.inputs['Roughness'])
    return m

def crumb_mat():
    m, nt, P = _principled('crumb')
    geo = _n(nt, 'ShaderNodeNewGeometry')
    col = _mix(nt, _math(nt, 'GREATER_THAN', geo.outputs['Random Per Island'], v1=.62), (.93, .87, .78), (.62, .43, .24))
    link(nt, col, P.inputs['Base Color']); _set(P, Roughness=.7, Subsurface_Weight=.5, Subsurface_Radius=(1, .5, .3), Subsurface_Scale=.002)
    return m

# ------------------------------------------------------------------ geometry helpers
def lathe(bm, cx, cy, prof, segs, disp=None, mat_of=None):
    """Surface of revolution from profile [(r, z)...]; r == 0 at either end closes with a fan."""
    rings = []
    for k, (r, z) in enumerate(prof):
        if r <= 1e-7:
            rings.append([bm.verts.new((cx, cy, z))]); continue
        ring = []
        for j in range(segs):
            a = 2 * math.pi * j / segs; p = Vector((cx + r * math.cos(a), cy + r * math.sin(a), z))
            if disp: p = disp(p, r, z, a, k)
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for k in range(len(rings) - 1):
        A, B = rings[k], rings[k + 1]
        if len(A) == 1 and len(B) == 1: continue
        if len(A) == 1:
            fs = [bm.faces.new((A[0], B[(j + 1) % segs], B[j])) for j in range(segs)]
        elif len(B) == 1:
            fs = [bm.faces.new((A[j], A[(j + 1) % segs], B[0])) for j in range(segs)]
        else:
            fs = [bm.faces.new((A[j], A[(j + 1) % segs], B[(j + 1) % segs], B[j])) for j in range(segs)]
        if mat_of:
            for f in fs: f.material_index = mat_of(k)
    return rings

def _frame(t, n):
    """Matrix whose columns are (t, n x t, n): local x along t, local z along n."""
    t = t.normalized(); n = (n - t * t.dot(n)).normalized(); b = n.cross(t)
    M = Matrix((t, b, n)).transposed(); return M.to_4x4()

# ------------------------------------------------------------------ parts
def tier(CK, cx, cy, r, h, zb, cream, rnd, name):
    bm = bmesh.new(); re = .0055
    prof = [(0, zb + .0005), (r - .003, zb + .0005)]
    nside = 26
    prof += [(r, zb + .002 + (h - re - .002) * k / nside) for k in range(nside + 1)]
    prof += [(r - re + re * math.cos(t), zb + h - re + re * math.sin(t)) for t in [math.pi / 2 * k / 6 for k in range(1, 7)]]
    prof += [(r - re - d, zb + h) for d in (.004, .012, .025)] + [(r * f, zb + h) for f in (.55, .3, .12)] + [(0, zb + h)]
    seed = rnd.uniform(0, 100)
    def disp(p, rr, z, a, k):
        q = Vector((p.x * 34 + seed, p.y * 34, p.z * 34))
        side = min(1, max(0, (rr - r + re) / re)) if rr > r - re else 0
        dr = (.00055 * noise.noise(q) + .0002 * noise.noise(q * 3.1)) * (1 if rr > r - re else 0)
        # the top edge: a soft, uneven crown where the scraper lifted
        up = 0
        if zb + h - re * 1.2 < z:
            up = (.0007 + .0006 * noise.noise(q * .5)) * math.exp(-((rr - (r - re * .7)) / .004) ** 2)
        dz = .00035 * noise.noise(q * 1.7 + Vector((5, 0, 0))) if z > zb + h - 1e-4 else 0
        rad = Vector((math.cos(a), math.sin(a), 0))
        return p + rad * dr + Vector((0, 0, up + dz))
    lathe(bm, cx, cy, prof, 192, disp); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj_from_bm(name, bm, [cream], col=CK, smooth=True)
    return o

def shell_border(CK, cx, cy, r, z, size, cream, rnd, name, n=None, out=0.0):
    """Star-tip shells piped round the tier: head forward, tail tucked under the next, uneven like a hand made them."""
    bm = bmesh.new(); n = n or int(round(2 * math.pi * r / (size * 1.8)))
    phase = rnd.uniform(0, 1)
    for i in range(n):
        a = (i + phase + rnd.uniform(-.13, .13)) / n * 2 * math.pi
        sz = size * rnd.uniform(.86, 1.12)
        ret = bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1)
        for v in ret['verts']:
            x, y, zz = v.co
            phi = math.atan2(zz, y); ridge = 1 + .15 * math.cos(7 * phi + i)
            if x < 0: tap = max(.05, 1 + x * .8); x *= 2.1
            else: tap = 1
            y *= tap * ridge; zz *= tap * ridge
            zz = zz if zz > -.55 else -.55 + (zz + .55) * .25
            y = y if y < .35 else .35 + (y - .35) * .3          # local +y points into the cake: flatten the back
            v.co = Vector((x, y, zz))
        rad = Vector((math.cos(a), math.sin(a), 0)); tan = Vector((-math.sin(a), math.cos(a), 0))
        c = Vector((cx, cy, 0)) + rad * (r + out + rnd.uniform(-.0006, .0006)) + Vector((0, 0, z + rnd.uniform(-.0005, .0005)))
        M = Matrix.Translation(c) @ _frame(tan, Vector((0, 0, 1))) @ Matrix.Rotation(rnd.uniform(-.12, .12), 4, 'X') @ Matrix.Rotation(rnd.uniform(-.08, .08), 4, 'Z') \
            @ Matrix.Diagonal((sz * 1.3, sz * .82, sz * .78, 1))
        bmesh.ops.transform(bm, matrix=M, verts=ret['verts'])
    return obj_from_bm(name, bm, [cream], col=CK, smooth=True)

def pearls(CK, cx, cy, r, z, n, size, mat, rnd):
    bm = bmesh.new(); phase = rnd.uniform(0, 1)
    for i in range(n):
        a = (i + phase + rnd.uniform(-.18, .18)) / n * 2 * math.pi; s = size * rnd.uniform(.84, 1.12)
        c = Vector((cx + math.cos(a) * (r + s * .7), cy + math.sin(a) * (r + s * .7), z + rnd.uniform(-.0007, .0007)))
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=s, matrix=Matrix.Translation(c) @ Matrix.Diagonal((1, 1, rnd.uniform(.93, 1.0), 1)))
    return obj_from_bm('pearls', bm, [mat], col=CK, smooth=True)

def _smooth(a, b, x): t = min(1, max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

def rose(CK, c, axis, S, mat, rnd, roll=0.0, n=None, bud=False):
    """A sugar rose of outer radius S: petals in a golden-angle spiral; the heart a tight cone of wrapped petals,
    the outer ones cupped, opening and rolling back at the rim. Petal colour as a vertex colour ('Col')."""
    bm = bmesh.new(); colL = bm.verts.layers.float_color.new('Col')
    n = n or rnd.randint(15, 18)
    hue = rnd.random()
    deep = Vector((.76, .27, .37)).lerp(Vector((.85, .4, .38)), hue)          # rose pink .. peach blush
    mid = Vector((.93, .58, .62)).lerp(Vector((.95, .67, .6)), hue)
    ivory = Vector((.98, .92, .86))
    NU, NV = 9, 9
    for i in range(n):
        k = i / (n - 1) if n > 1 else 1
        if bud: k *= .45
        az = i * 2.39996 + rnd.uniform(-.15, .15)
        L = S * (.5 + .58 * k) * rnd.uniform(.93, 1.07)
        r0 = S * (.07 + .36 * k ** 1.1)
        W = min(S * (.3 + .42 * k), r0 * 2.5 if k < .5 else 9)
        lean = .05 + 1.3 * k ** 1.7 + rnd.uniform(-.06, .06)
        curl = (.25 + 1.1 * k ** 2) * rnd.uniform(.8, 1.2)
        zb = -S * (.05 + .22 * k)
        Rw0 = r0 * (1 + 1.6 * k ** 2)
        # the spine: leaning out with height, the rim rolling back
        sp = [Vector((0, 0, 0))]; betas = []
        for jv in range(NV):
            v = jv / (NV - 1); beta = lean * v ** 1.3 + curl * _smooth(.55, 1.0, v) ** 1.6 - .12 * (1 - v) * k
            betas.append(beta)
        for jv in range(1, NV):
            b = (betas[jv] + betas[jv - 1]) / 2
            sp.append(sp[-1] + Vector((0, math.sin(b), math.cos(b))) * L / (NV - 1))
        grid = []
        for ju in range(NU):
            u = ju / (NU - 1) * 2 - 1; row = []
            for jv in range(NV):
                v = jv / (NV - 1); ve = v * (1 - .22 * u * u)
                hw = W * (.32 + .68 * math.sin(min(1, ve / .72) * math.pi / 2)) * (1 - .15 * _smooth(.72, 1, ve))
                x = u * hw
                # position along the spine at ve
                fv = ve * (NV - 1); j0 = min(NV - 2, int(fv)); t = fv - j0
                P0 = sp[j0].lerp(sp[j0 + 1], t); beta = betas[j0] * (1 - t) + betas[j0 + 1] * t
                N = Vector((0, math.cos(beta), -math.sin(beta)))
                Rw = Rw0 + max(0, P0.y)
                phi = x / Rw
                xa = Rw * math.sin(phi); d = -(Rw - Rw * math.cos(phi))
                roll_back = S * .16 * curl * _smooth(.5, 1, ve) ** 2 * abs(u) ** 3
                wav = S * .018 * math.sin(u * 5.5 + i * 1.7) * ve ** 2
                p = Vector((xa, 0, 0)) + P0 + N * (d + roll_back + wav)
                # into the rose frame: around the axis at azimuth az, out by r0
                p = Matrix.Rotation(az, 3, 'Z') @ (p + Vector((0, r0, zb)))
                vert = bm.verts.new(p)
                f = .06 + .55 * k + .2 * ve - .3 * _smooth(.82, 1, ve) * (.5 + .5 * k)
                f = min(1, max(0, f))
                cc = deep.lerp(mid, min(1, f * 1.6)) if f < .62 else mid.lerp(ivory, (f - .62) / .38)
                vert[colL] = (*cc, 1)
                row.append(vert)
            grid.append(row)
        for ju in range(NU - 1):
            for jv in range(NV - 1):
                bm.faces.new((grid[ju][jv], grid[ju + 1][jv], grid[ju + 1][jv + 1], grid[ju][jv + 1]))
    # a small sugar calyx plug in the very heart so it never looks hollow
    ret = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=S * .09, matrix=Matrix.Translation((0, 0, S * .12)) @ Matrix.Diagonal((1, 1, 1.6, 1)))
    for v in ret['verts']: v[colL] = (*deep, 1)
    axis = axis.normalized()
    q = axis.to_track_quat('Z', 'Y'); M = Matrix.Translation(c) @ q.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, 'Z')
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    o = obj_from_bm('rose', bm, [mat], col=CK, smooth=True)
    sub = o.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    sol = o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = S * .022; sol.offset = 0; sol.use_rim = True
    return o

def leaf(CK, base, direction, normal, size, mat, rnd):
    """A sugar leaf: pointed oval folded along the midrib, arching down at the tip, slightly waved edge; UV = (u, v)."""
    bm = bmesh.new(); uvL = bm.loops.layers.uv.new('UVMap'); NU, NV = 9, 11; grid = []
    fold = rnd.uniform(.35, .55); arch = rnd.uniform(.4, .8); W = size * .3
    for ju in range(NU):
        u = ju / (NU - 1) * 2 - 1; row = []
        for jv in range(NV):
            v = jv / (NV - 1)
            hw = W * math.sin(math.pi * min(.999, v * .96 + .02)) ** .7 * (1 - .3 * v)
            x = v * size; y = u * hw * (1 + .05 * math.sin(v * 38 + u)); z = abs(y) * fold - arch * size * v * v * .35
            row.append((bm.verts.new((x, y, z)), (u, v)))
        grid.append(row)
    for ju in range(NU - 1):
        for jv in range(NV - 1):
            q = (grid[ju][jv], grid[ju + 1][jv], grid[ju + 1][jv + 1], grid[ju][jv + 1])
            f = bm.faces.new([a for a, _ in q])
            for l, (_, uv) in zip(f.loops, q): l[uvL].uv = uv
    M = Matrix.Translation(base) @ _frame(direction, normal)
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    o = obj_from_bm('leaf', bm, [mat], col=CK, smooth=True)
    sol = o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = .0009; sol.offset = 0
    return o

def candle(CK, x, y, zbase, hgt, rad, wax, melt, wick_m, rnd, drips=0, i=0):
    """A slim wax candle (base pushed 5 mm into the cream), its top a shallow melt pool; returns the wick tip."""
    top = zbase + hgt; bm = bmesh.new()
    prof = [(0, zbase - .005), (rad, zbase - .005)]
    prof += [(rad, zbase - .005 + (hgt + .005 - .0012) * k / 10) for k in range(1, 11)]
    prof += [(rad - .0004, top - .0002), (rad - .0011, top - .0004), (rad * .55, top - .0011), (rad * .25, top - .0013), (0, top - .0013)]
    nprof = len(prof)
    sd = rnd.uniform(0, 50)
    def disp(p, rr, z, a, k):
        if 1 < k < nprof - 5:
            return p + Vector((math.cos(a), math.sin(a), 0)) * .00012 * noise.noise(Vector((p.x * 400 + sd, p.y * 400, p.z * 60)))
        return p
    lathe(bm, x, y, prof, 32, disp, mat_of=lambda k: 1 if k >= nprof - 4 else 0)
    o = obj_from_bm(f'candle{i}', bm, [wax, melt], col=CK, smooth=True)
    # drips: a run of wax from the rim, hugging the side, ending in a bead
    for dnum in range(drips):
        bm = bmesh.new(); phi = rnd.uniform(-2.6, -.5) + dnum * 1.3; length = rnd.uniform(.006, .016)
        rings = []; NS, NC = 14, 10
        for js in range(NS + 1):
            t = js / NS; z = top - .0003 - t * length
            wdt = .0015 * (1 - .35 * t) + .0008 * _smooth(.75, 1, t)
            thk = (.0005 + .0008 * _smooth(.7, 1, t)) * (1 if t < .97 else .5)
            if js == NS: wdt *= .35; thk *= .4
            ring = []
            for jc in range(NC + 1):
                psi = math.pi * jc / NC
                tang = wdt * math.cos(psi); radial = thk * math.sin(psi)
                ang = phi + tang / rad
                ring.append(bm.verts.new((x + (rad - .00015 + radial) * math.cos(ang), y + (rad - .00015 + radial) * math.sin(ang), z)))
            rings.append(ring)
        for js in range(NS):
            for jc in range(NC):
                bm.faces.new((rings[js][jc], rings[js][jc + 1], rings[js + 1][jc + 1], rings[js + 1][jc]))
        obj_from_bm(f'drip{i}_{dnum}', bm, [wax], col=CK, smooth=True)
    # the wick: soaked cotton rising out of the pool, charred and gently curled above it; the tip stays put
    tip = Vector((x, y, top + .009)); bdir = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), 0)).normalized()
    pts = []; NS = 10
    for js in range(NS + 1):
        t = js / NS; pts.append(Vector((0, 0, -.0101 + t * .0101)) + bdir * .0011 * _smooth(.45, 1, t) ** 1.5)
    shift = -pts[-1]
    bm = bmesh.new(); rings = []
    for js, p in enumerate(pts):
        t = js / NS; r = .00068 * (1 - .15 * t) + .00025 * _smooth(.88, 1, t)
        tng = (pts[min(NS, js + 1)] - pts[max(0, js - 1)]).normalized(); M = _frame(Vector((1, 0, 0)) if abs(tng.x) < .9 else Vector((0, 1, 0)), tng)
        ring = [bm.verts.new(tip + shift + p + (M @ Vector((r * math.cos(a), r * math.sin(a), 0, 0))).to_3d()) for a in [2 * math.pi * j / 8 for j in range(8)]]
        rings.append(ring)
    for js in range(NS):
        for j in range(8): bm.faces.new((rings[js][j], rings[js][(j + 1) % 8], rings[js + 1][(j + 1) % 8], rings[js + 1][j]))
    c_ = bm.verts.new(tip + Vector((0, 0, .0003))); [bm.faces.new((rings[-1][j], rings[-1][(j + 1) % 8], c_)) for j in range(8)]
    w = obj_from_bm(f'wick{i}', bm, [wick_m], col=CK, smooth=True)
    # the shader measures height from the object origin: put it at the pool's surface
    me = w.data; off = Vector((x, y, top - .0011)); me.transform(Matrix.Translation(-off)); w.location = off
    return tip

def crumbs(CK, pts, mat, rnd):
    bm = bmesh.new()
    for c, s in pts:
        ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=s, matrix=Matrix.Translation(c) @ Matrix.Diagonal((1, rnd.uniform(.6, 1), rnd.uniform(.4, .7), 1)))
        for v in ret['verts']: v.co += Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * s * .3
    return obj_from_bm('crumbs', bm, [mat], col=CK, smooth=False)

# ------------------------------------------------------------------ the cake
def build(CK, TABLE, top, seed=17):
    rnd = random.Random(seed); cx, cy = TABLE.x, TABLE.y
    cream1 = buttercream('buttercream', ombre=(top + .115, top + .2, (.95, .8, .74)))
    cream2 = buttercream('buttercream_top')
    rose_m, leaf_m, pearl_m = sugar_rose_mat(), leaf_mat(), pearl_mat()
    wax, melt, wick_m = wax_mat(), melt_mat(), wick_mat()
    gold = stand_gold()
    z = top
    # gold cake stand (as v16)
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=.09, radius2=.05, depth=.1, matrix=Matrix.Translation((cx, cy, z + .05)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=.2, radius2=.21, depth=.015, matrix=Matrix.Translation((cx, cy, z + .107)))
    st = obj_from_bm('stand', bm, [gold], col=CK, smooth=True); bv = st.modifiers.new('bev', 'BEVEL'); bv.width = .002; bv.segments = 2; bv.limit_method = 'ANGLE'
    z += .115
    z1 = z + .13; z2 = z1 + .11
    tier(CK, cx, cy, .16, .13, z, cream1, rnd, 'tier1')
    tier(CK, cx, cy, .11, .11, z1, cream2, rnd, 'tier2')
    shell_border(CK, cx, cy, .16, z + .0052, .0105, cream1, rnd, 'tier1_base', out=.0015)
    shell_border(CK, cx, cy, .16 - .0065, z1 + .0035, .0078, cream1, rnd, 'tier1_top')
    shell_border(CK, cx, cy, .11, z1 + .0043, .0085, cream2, rnd, 'tier2_base', out=.001)
    shell_border(CK, cx, cy, .11 - .0058, z2 + .003, .0068, cream2, rnd, 'tier2_top')
    pearls(CK, cx, cy, .11, z1 + .0205, 72, .0042, pearl_m, rnd)
    # roses: a cascade down the front-left of both tiers (same places as v16), facing out and up, with leaves and buds
    up = Vector((0, 0, 1))
    spots = [(-2.0, z2 - .01, .032, .11, 0), (-2.35, z2 - .045, .026, .11, 0), (-2.15, z1 + .005, .034, .16, 0), (-2.55, z1 - .03, .03, .16, 0),
             (-2.3, z1 - .07, .028, .16, 0), (-2.75, z1 - .1, .024, .16, 0), (-1.75, z2 + .005, .022, .07, 1)]
    for j, (ang, zz, sz, rr, ontop) in enumerate(spots):
        rad = Vector((math.cos(ang), math.sin(ang), 0))
        S = sz * 1.08
        if ontop:
            axis = (up * 1.0 + rad * .55 + Vector((0, -.25, 0))).normalized()
            c = Vector((cx, cy, 0)) + rad * rr + Vector((0, 0, zz + S * .05))
        else:
            axis = (rad * .8 + up * .5 + Vector((0, -.15, 0))).normalized()
            c = Vector((cx, cy, 0)) + rad * (rr + S * .12) + Vector((0, 0, zz))
        rose(CK, c, axis, S, rose_m, rnd, roll=rnd.uniform(0, 6.28))
        # two or three leaves tucked under the rose, lying along the cream
        for lk in range(2 if sz < .025 else 3):
            t_ = Vector((-math.sin(ang), math.cos(ang), 0))
            d = (t_ * math.cos(lk * 2.2 + j) + up * math.sin(lk * 2.2 + j) * .8).normalized()
            d = (d - axis * d.dot(axis)).normalized()
            nrm = (axis * .7 + rad * .3).normalized()
            leaf(CK, c + d * S * .6 - axis * S * .12, d, nrm, S * rnd.uniform(.85, 1.1), leaf_m, rnd)
    # buds between the roses
    for (ang, zz, sz, rr) in [(-2.48, z2 - .02, .012, .11), (-2.05, z1 - .05, .013, .16), (-2.62, z1 - .07, .011, .16)]:
        rad = Vector((math.cos(ang), math.sin(ang), 0)); axis = (rad * .85 + up * .45).normalized()
        rose(CK, Vector((cx, cy, 0)) + rad * (rr + sz * .2) + Vector((0, 0, zz)), axis, sz, rose_m, rnd, n=7, bud=True)
    # six slim candles in a gentle arc across the top tier (identical positions to v16)
    CANDLES = []
    for i in range(6):
        u = (i - 2.5) / 2.5
        x, y = cx + u * .084, cy + .006 + .034 * (1 - u * u)
        CANDLES.append(candle(CK, x, y, z2, .085, .0055, wax, melt, wick_m, rnd, drips={1: 1, 3: 2, 4: 1}.get(i, 0), i=i))
    # crumbs: on the stand plate and a few on the lower tier's ledge
    cr = []
    for _ in range(26):
        a = rnd.uniform(-2.9, -.3); rr = rnd.uniform(.168, .198); cr.append((Vector((cx + math.cos(a) * rr, cy + math.sin(a) * rr, z - .0002)), rnd.uniform(.0006, .0016)))
    for _ in range(7):
        a = rnd.uniform(-2.6, -.6); rr = rnd.uniform(.118, .14); cr.append((Vector((cx + math.cos(a) * rr, cy + math.sin(a) * rr, z1 + .0004)), rnd.uniform(.0005, .0011)))
    crumbs(CK, cr, crumb_mat(), rnd)
    return CANDLES
