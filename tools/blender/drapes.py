"""v19 study details (run inside Blender, imported by study.py):
- drapes(): crimson velvet curtains either side of the arched window, on a brass rod, gathered by gold tie-backs into
  an hourglass and flaring to the sill. A draught through the old casement stirs them: the air is a loop-periodic
  breeze with one real gust per loop, and each panel answers it through a few cloth modes (the skirt billowing into the
  room, swinging sideways, a ripple running along the hem, the swag above the tie breathing, the pleats opening). Every
  mode is a shape key driven by a damped spring (heavy velvet: slow, lagging, a little overshoot), integrated to a
  periodic steady state so frame LOOP+1 is frame 1 again. The far panel hears the gust a moment later.
- fire(): a volumetric flame (emission only) rising from the ember bed: tongues shaped from rising 4D noise inside a
  tapering envelope, coloured by temperature (deep red at the edges and tips, orange, a yellow-white heart at the root),
  plus a flickering light low inside the firebox that follows the same flame strength."""
import bpy, bmesh, math
from mathutils import Vector, Matrix, noise
from blu import obj_from_bm, link

def _velvet():
    m = bpy.data.materials.new('velvet'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; P = N['Principled BSDF']
    P.inputs['Base Color'].default_value = (.30, .022, .04, 1); P.inputs['Roughness'].default_value = .66
    P.inputs['Sheen Weight'].default_value = 1.0; P.inputs['Sheen Roughness'].default_value = .38; P.inputs['Sheen Tint'].default_value = (1, .55, .5, 1)
    P.inputs['Specular IOR Level'].default_value = .35
    # a little unevenness in the dye and the pile
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 7; nz.inputs['Detail'].default_value = 5
    link(nt, tc.outputs['Object'], nz.inputs['Vector'])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.inputs['Factor'].default_value = 1
    mr = N.new('ShaderNodeMapRange'); mr.inputs[1].default_value = .35; mr.inputs[2].default_value = .65; link(nt, nz.outputs['Fac'], mr.inputs[0])
    link(nt, mr.outputs[0], mx.inputs['Factor']); mx.inputs[6].default_value = (.24, .016, .032, 1); mx.inputs[7].default_value = (.34, .03, .05, 1)
    link(nt, mx.outputs[2], P.inputs['Base Color'])
    fine = N.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 900; link(nt, tc.outputs['Object'], fine.inputs['Vector'])
    b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = .08; link(nt, fine.outputs['Fac'], b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    return m

def _periodic_air(n, fps, seed):
    """One loop of moving air (n frames, periodic): a soft breeze from a few harmonics, and one gust that swells, holds with
    a little buffeting and dies away. Returns air[f] for f in 0..n-1, about 0..1."""
    T = n / fps; out = []
    g0, glen = T * (.18 + .1 * ((seed * .37) % 1)), 3.2   # the gust: when in the loop, how long
    for f in range(n):
        t = f / fps; u = 2 * math.pi * t / T
        breeze = .22 + .07 * math.sin(u + seed) + .05 * math.sin(2 * u + 1.7 * seed) + .03 * math.sin(5 * u + .4 * seed)
        x = ((t - g0) % T) / glen   # periodic gust envelope
        env = 0 if x > 1.6 else (x / .25) ** 2 * (3 - 2 * x / .25) if x < .25 else 1 if x < .7 else max(0, 1 - (x - .7) / .9) ** 2
        buffet = 1 + .12 * math.sin(t * 7.3 + seed) * min(1, x * 2) if env else 1
        out.append(breeze + .62 * env * buffet)
    return out

def _respond(air, fps, k, c, m, lag):
    """A damped spring driven by the air (delayed by lag seconds), run over several loops to its periodic steady state."""
    n = len(air); dt = 1 / fps; p = v = 0.0; res = [0.0] * n; sub = 4
    for rep in range(6):
        for f in range(n):
            a = air[int(round(f - lag * fps)) % n]
            for _ in range(sub):
                acc = (k * (a - p) - c * v) / m; v += acc * dt / sub; p += v * dt / sub
            if rep == 5: res[f] = p
    mean = sum(res) / n
    return [r - mean for r in res], mean

def drapes(col, WIN, BACK, FRAMES, LOOP, FPS, gold, brass):
    x0, x1, cx = WIN['x0'], WIN['x1'], (WIN['x0'] + WIN['x1']) / 2
    ZT, ZH, VT = 3.70, 1.03, .655           # rings, hem (just above the sill), the tie-back (fraction of the drop)
    Y0 = BACK - .072
    vel = _velvet()
    NS, NV, NP = 112, 84, 5.5               # columns, rows, pleats across a panel
    air = _periodic_air(LOOP, FPS, 3.1)
    panels = []
    for side in (-1, 1):                    # -1: left of the window, +1: right (mirrored about the window's centre)
        ph = .13 if side < 0 else .41       # each panel's pleats fall a little differently
        tieZ = ZT - VT * (ZT - ZH) + (.025 if side > 0 else 0)
        vt = (ZT - tieZ) / (ZT - ZH)
        def edge(v):
            # outer edge (against the wall) and inner edge (toward the glass), measured outward from the window jamb
            if v < vt: q = (v / vt) ** 1.55; inn = -.12 + (.22 - -.12) * q; out = .40 + (.36 - .40) * q
            else: q = ((v - vt) / (1 - vt)) ** .72; inn = .22 + (.03 - .22) * q; out = .36 + (.43 - .36) * q
            return inn, out
        w_top = .52
        def place(s, v):
            inn, out = edge(v); w = out - inn
            d = out - s * w                 # s=0 outer edge … s=1 inner edge
            x = (x0 - d) if side < 0 else (x1 + d)
            A = min(.072, .032 * (w_top / max(w, .05)) ** .62) * (1 + .25 * v)
            fold = .5 + .5 * math.cos(2 * math.pi * (NP * s + ph + .08 * math.sin(v * 3.1 + side)))
            bundle = .035 * math.exp(-((v - vt) / .09) ** 2)   # the gathered fabric stands out from the wall at the tie
            y = Y0 - A * fold - bundle + .004 * math.sin(s * 9 + v * 4)
            z = ZT - v * (ZT - ZH) + .009 * fold * max(0, (v - .9) / .1)   # the hem rides up a little on each fold
            return Vector((x, y, z)), w
        bm = bmesh.new(); grid = []; uv = []
        for j in range(NV + 1):
            v = j / NV; row = []
            for i in range(NS + 1):
                s = i / NS; p, _ = place(s, v); row.append(bm.verts.new(p))
            grid.append(row)
        for j in range(NV):
            for i in range(NS):
                f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]) if side < 0 else (grid[j][i + 1], grid[j][i], grid[j + 1][i], grid[j + 1][i + 1]))
        o = obj_from_bm(f'drape_{"l" if side < 0 else "r"}', bm, [vel], col=col, smooth=True)
        sol = o.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = .009; sol.offset = 1; sol.use_even_offset = True
        # ---- cloth modes as shape keys (displacements from the rest pose) ----
        me = o.data; o.shape_key_add(name='rest', from_mix=False)
        def mode(name, fn):
            k = o.shape_key_add(name=name, from_mix=False); k.slider_min = -3; k.slider_max = 3
            for j in range(NV + 1):
                v = j / NV
                for i in range(NS + 1):
                    s = i / NS; idx = j * (NS + 1) + i
                    k.data[idx].co = me.vertices[idx].co + Vector(fn(s, v))
            return k
        below = lambda v: max(0, (v - vt) / (1 - vt)) ** 1.25
        swag = lambda v: math.sin(math.pi * min(1, v / vt)) ** 2 if v < vt else 0
        free = lambda s: .55 + .45 * s     # the inner edge hangs free, the outer one brushes the wall
        out_dir = -1 if side < 0 else 1    # +x away from the window on the right
        K = {
            'billow': mode('billow', lambda s, v: (0, -.05 * below(v) * free(s) * (.6 + .4 * math.sin(math.pi * s)), .006 * below(v) ** 2)),
            'sway': mode('sway', lambda s, v: (.03 * out_dir * below(v) ** 1.4 * free(s), -.006 * below(v), 0)),
            'ripc': mode('ripc', lambda s, v: (0, -.014 * below(v) ** 2.2 * math.cos(2 * math.pi * 1.3 * s), 0)),
            'rips': mode('rips', lambda s, v: (0, -.014 * below(v) ** 2.2 * math.sin(2 * math.pi * 1.3 * s), 0)),
            'swag': mode('swag', lambda s, v: (0, -.016 * swag(v) * free(s), 0)),
            'pleat': mode('pleat', lambda s, v: (0, .01 * (below(v) + .4 * swag(v)) * math.cos(2 * math.pi * (NP * s + ph)), 0)),
        }
        # each mode answers the same air with its own weight and lag; the right panel hears the gust .45 s later
        lag0 = 0 if side < 0 else .45
        spec = {   # stiffness, damping, mass, lag, gain
            'billow': (5.5, 2.4, 1.6, .15, 1.0), 'sway': (4.0, 1.7, 1.8, .35, .8), 'swag': (9, 3.5, 1.2, .05, .7), 'pleat': (7, 2.8, 1.4, .25, .7)}
        keys = {}
        for nm, (kk, cc, mm, lg, gain) in spec.items():
            r, mean = _respond(air, FPS, kk, cc, mm, lag0 + lg); keys[nm] = [gain * (mean * .6 + x * 1.5) for x in r]
        # the hem ripple runs along the panel: a travelling wave from two phases, stronger while the skirt is moving
        rr, _ = _respond(air, FPS, 6, 2.2, 1.3, lag0 + .5)
        speed = [abs(rr[(f + 1) % LOOP] - rr[f - 1]) * FPS * .5 for f in range(LOOP)]
        smax = max(speed) or 1
        keys['ripc'] = []; keys['rips'] = []
        for f in range(LOOP):
            a = .35 + 1.3 * speed[f] / smax; ph2 = 2 * math.pi * f / LOOP * 3 + side
            keys['ripc'].append(a * math.cos(ph2)); keys['rips'].append(a * math.sin(ph2))
        for f in range(1, FRAMES + 1):
            i = (f - 1) % LOOP
            for nm, kb in K.items():
                kb.value = keys[nm][i]; kb.keyframe_insert('value', frame=f)
        panels.append((o, side, tieZ, edge(vt)))
    # ---- the rod, its rings and finials, the brackets, and the gold tie-backs ----
    RZ, RY = ZT + .045, Y0 - .02
    bm = bmesh.new()
    L = (x1 - x0) + 1.2
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=.014, radius2=.014, depth=L, matrix=Matrix.Translation((cx, RY, RZ)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    for sx in (-1, 1):
        bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=.03, matrix=Matrix.Translation((cx + sx * (L / 2 + .02), RY, RZ)))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=.0, radius2=.024, depth=.05, matrix=Matrix.Translation((cx + sx * (L / 2 + .065), RY, RZ)) @ Matrix.Rotation(-sx * math.pi / 2, 4, 'Y'))
        for bx in (x0 - .2, x1 + .2):   # wall brackets
            bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=.008, radius2=.008, depth=BACK - RY, matrix=Matrix.Translation((bx, (BACK + RY) / 2, RZ)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    for (o, side, tieZ, (inn, out)) in panels:
        for k in range(10):
            d = .40 - k * (.52 / 9); x = (x0 - d) if side < 0 else (x1 + d)
            bmesh.ops.create_cone(bm, cap_ends=False, segments=14, radius1=.022, radius2=.022, depth=.012, matrix=Matrix.Translation((x, RY, RZ)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    obj_from_bm('curtain_rod', bm, [brass], col=col, smooth=True)
    bm = bmesh.new()
    for (o, side, tieZ, (inn, out)) in panels:
        dm = (inn + out) / 2; x = (x0 - dm) if side < 0 else (x1 + dm); w = (out - inn) / 2 + .02
        # a cord round the gathered bundle, and a tassel hanging from its knot on the window side
        ring = []
        for k in range(28):
            a = 2 * math.pi * k / 28
            ring.append(Vector((x + math.cos(a) * w, Y0 - .05 + math.sin(a) * .06, tieZ + .012 * math.sin(2 * a))))
        for k in range(28):
            p, q = ring[k], ring[(k + 1) % 28]
            bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=.007, radius2=.007, depth=(q - p).length + .003,
                                  matrix=Matrix.Translation((p + q) / 2) @ (q - p).to_track_quat('Z', 'Y').to_matrix().to_4x4())
        kx = x + (w if side < 0 else -w) * .92
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=.018, matrix=Matrix.Translation((kx, Y0 - .1, tieZ - .01)))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=.03, radius2=.012, depth=.13, matrix=Matrix.Translation((kx, Y0 - .1, tieZ - .1)))
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=.016, matrix=Matrix.Translation((kx, Y0 - .1, tieZ - .03)))
    obj_from_bm('tiebacks', bm, [gold], col=col, smooth=True)

def fire(col, cx, fy, z0, FRAMES, FPS):
    """A volumetric emission flame over the ember bed (cx, fy at floor height z0); returns the flame strength per frame."""
    H, WD, DP = .6, .36, .14
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, 0, H / 2)) @ Matrix.Diagonal((WD * 2.3, DP * 2.4, H, 1)))
    me = bpy.data.meshes.new('flame_vol'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('flame_vol', me); col.objects.link(o); o.location = (cx, fy, z0 + .02)
    o.visible_diffuse = False; o.visible_shadow = False; o.visible_transmission = False; o.visible_volume_scatter = False
    m = bpy.data.materials.new('flame_vol'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    out = N['Material Output']
    def node(kind, **kw):
        n = N.new(kind)
        for k, v in kw.items(): setattr(n, k, v)
        return n
    def math_(op, a, b=None, v1=None):
        n = node('ShaderNodeMath', operation=op)
        link(nt, a, n.inputs[0]) if not isinstance(a, (int, float)) else setattr(n.inputs[0], 'default_value', a)
        if b is not None: link(nt, b, n.inputs[1]) if not isinstance(b, (int, float)) else setattr(n.inputs[1], 'default_value', b)
        return n.outputs[0]
    tc = node('ShaderNodeTexCoord'); sep = node('ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Object'], sep.inputs[0])
    X, Y, Z = sep.outputs['X'], sep.outputs['Y'], sep.outputs['Z']
    h = math_('MULTIPLY', Z, 1 / H)                                   # 0 at the bed, 1 at the top
    # rising, evolving turbulence (two scales), keyed so it climbs and boils
    mp = node('ShaderNodeMapping'); link(nt, tc.outputs['Object'], mp.inputs[0]); mp.inputs['Scale'].default_value = (11, 9, 3.2)
    n1 = node('ShaderNodeTexNoise', noise_dimensions='4D'); n1.inputs['Scale'].default_value = 1.6; n1.inputs['Detail'].default_value = 3; n1.inputs['Roughness'].default_value = .55
    link(nt, mp.outputs[0], n1.inputs['Vector'])
    mp2 = node('ShaderNodeMapping'); link(nt, tc.outputs['Object'], mp2.inputs[0]); mp2.inputs['Scale'].default_value = (2.2, 2.2, 1.1)
    n2 = node('ShaderNodeTexNoise', noise_dimensions='4D'); n2.inputs['Scale'].default_value = 1.3; n2.inputs['Detail'].default_value = 1
    link(nt, mp2.outputs[0], n2.inputs['Vector'])
    for f, k in ((1, 0), (FRAMES + 40, (FRAMES + 39) / FPS)):
        mp.inputs['Location'].default_value = (0, 0, -k * 1.15); mp.inputs['Location'].keyframe_insert('default_value', frame=f)
        mp2.inputs['Location'].default_value = (0, 0, -k * .5); mp2.inputs['Location'].keyframe_insert('default_value', frame=f)
        n1.inputs['W'].default_value = k * .9; n1.inputs['W'].keyframe_insert('default_value', frame=f)
        n2.inputs['W'].default_value = k * .45; n2.inputs['W'].keyframe_insert('default_value', frame=f)
    # the envelope: wide and low at the bed, tapering to tips; the slow noise sways the column side to side
    sway = math_('MULTIPLY', math_('SUBTRACT', n2.outputs['Fac'], .5), math_('MULTIPLY', h, .5))
    xs = math_('SUBTRACT', X, sway)
    width = math_('MULTIPLY', math_('POWER', math_('MAXIMUM', math_('SUBTRACT', 1, h), 0), .62), WD)
    rx = math_('DIVIDE', xs, math_('MAXIMUM', width, .01)); ry = math_('DIVIDE', Y, DP)
    r = math_('SQRT', math_('ADD', math_('MULTIPLY', rx, rx), math_('MULTIPLY', ry, ry)))
    env = math_('MAXIMUM', math_('SUBTRACT', 1, r), 0)
    # tongues: turbulence carves the envelope, more strongly higher up, so the flame breaks into licks at the top
    carve = math_('MULTIPLY', math_('SUBTRACT', n1.outputs['Fac'], .42), math_('ADD', .9, math_('MULTIPLY', h, 1.6)))
    dens = math_('SUBTRACT', math_('ADD', math_('MULTIPLY', env, 1.25), carve), math_('MULTIPLY', h, .55))
    mr = node('ShaderNodeMapRange'); mr.inputs[1].default_value = .12; mr.inputs[2].default_value = .55; link(nt, dens, mr.inputs[0])
    d = mr.outputs[0]
    # temperature: hottest low in the middle of the flame
    temp = math_('MULTIPLY', d, math_('SUBTRACT', 1.05, math_('MULTIPLY', h, .85)))
    cr = node('ShaderNodeValToRGB'); link(nt, temp, cr.inputs[0]); el = cr.color_ramp.elements
    el[0].position = 0; el[0].color = (.35, .015, .002, 1); el[1].position = 1; el[1].color = (1, .6, .2, 1)
    e = el.new(.3); e.color = (.95, .12, .008, 1); e = el.new(.62); e.color = (1, .36, .035, 1)
    em = node('ShaderNodeEmission'); link(nt, cr.outputs[0], em.inputs[0])
    link(nt, math_('MULTIPLY', math_('POWER', d, 1.6), 15), em.inputs[1])
    link(nt, em.outputs[0], out.inputs['Volume'])
    me.materials.append(m)
    # the flame's strength over time (for the light inside the firebox): the same slow swell the column has
    st = [.75 + .18 * noise.noise(Vector((f / FPS * 1.3, 4.2, 0))) + .09 * noise.noise(Vector((f / FPS * 4.1, 1.1, 2))) for f in range(1, FRAMES + 1)]
    return o, st
