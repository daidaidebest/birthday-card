"""A glowing ember and log bed for the study's hearth (v17 cake stills; the web page paints the living flames on top).
Charred logs with alligator cracks glowing from below, a heap of coals with ash-grey skins and hot orange cores, an ash
bed, and a low ember light that warms the inside of the firebox. Run inside Blender."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, noise
from blu import obj_from_bm, link
from cake import _n, _math, _madd, _mix, _principled, _set

def _heat_ramp(nt, fac):
    cr = _n(nt, 'ShaderNodeValToRGB'); link(nt, fac, cr.inputs[0]); el = cr.color_ramp.elements
    el[0].position = 0; el[0].color = (.6, .04, .005, 1); el[1].position = 1; el[1].color = (1, .55, .16, 1)
    e = el.new(.45); e.color = (1, .18, .02, 1); e = el.new(.75); e.color = (1, .34, .05, 1)
    return cr.outputs[0]

def coal_mat(z_floor):
    m, nt, P = _principled('coal')
    geo = _n(nt, 'ShaderNodeNewGeometry'); tc = _n(nt, 'ShaderNodeTexCoord')
    ash = _n(nt, 'ShaderNodeTexNoise'); ash.inputs['Scale'].default_value = 140; ash.inputs['Detail'].default_value = 6; link(nt, geo.outputs['Position'], ash.inputs['Vector'])
    am = _n(nt, 'ShaderNodeMapRange'); am.inputs[1].default_value = .5; am.inputs[2].default_value = .62; link(nt, ash.outputs['Fac'], am.inputs[0])
    vo = _n(nt, 'ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE'); vo.inputs['Scale'].default_value = 90; link(nt, geo.outputs['Position'], vo.inputs['Vector'])
    crack = _n(nt, 'ShaderNodeMapRange'); crack.inputs[1].default_value = .0; crack.inputs[2].default_value = .06; crack.inputs[3].default_value = 1; crack.inputs[4].default_value = 0
    link(nt, vo.outputs['Distance'], crack.inputs[0])
    rnd = geo.outputs['Random Per Island']
    # hot cores show where the ash skin is thin, and always along the cracks
    hot = _math(nt, 'MAXIMUM', _math(nt, 'SUBTRACT', v0=1, b=am.outputs[0]), _math(nt, 'MULTIPLY', crack.outputs[0], v1=.9))
    k = _madd(nt, rnd, .7, .3)
    sep = _n(nt, 'ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Position'], sep.inputs[0])
    low = _n(nt, 'ShaderNodeMapRange'); low.inputs[1].default_value = z_floor + .02; low.inputs[2].default_value = z_floor + .09; low.inputs[3].default_value = 1; low.inputs[4].default_value = .45
    link(nt, sep.outputs['Z'], low.inputs[0])
    g = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', hot, k), low.outputs[0])
    link(nt, _heat_ramp(nt, g), P.inputs['Emission Color'])
    link(nt, _math(nt, 'MULTIPLY', _math(nt, 'POWER', g, v1=1.6), v1=3.2), P.inputs['Emission Strength'])
    link(nt, _mix(nt, am.outputs[0], (.03, .025, .022), (.16, .15, .14)), P.inputs['Base Color'])
    _set(P, Roughness=.9)
    b = _n(nt, 'ShaderNodeBump'); b.inputs['Strength'].default_value = .6; b.inputs['Distance'].default_value = .002
    link(nt, ash.outputs['Fac'], b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    return m

def log_mat(z_floor):
    """Charred wood: black alligator char, cracks glowing hotter toward the bed, a little bark texture higher up."""
    m, nt, P = _principled('char_log')
    geo = _n(nt, 'ShaderNodeNewGeometry'); tc = _n(nt, 'ShaderNodeTexCoord')
    wob = _n(nt, 'ShaderNodeTexNoise'); wob.inputs['Scale'].default_value = 14; wob.inputs['Detail'].default_value = 3; link(nt, tc.outputs['Object'], wob.inputs['Vector'])
    wv = _n(nt, 'ShaderNodeVectorMath', operation='MULTIPLY_ADD'); link(nt, wob.outputs['Color'], wv.inputs[0]); wv.inputs[1].default_value = (.035, .035, .035); link(nt, tc.outputs['Object'], wv.inputs[2])
    mp = _n(nt, 'ShaderNodeMapping'); mp.inputs['Scale'].default_value = (.65, 1.6, 1.6); link(nt, wv.outputs[0], mp.inputs['Vector'])
    vo = _n(nt, 'ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE'); vo.inputs['Scale'].default_value = 17; vo.inputs['Randomness'].default_value = 1
    link(nt, mp.outputs[0], vo.inputs['Vector'])
    crack = _n(nt, 'ShaderNodeMapRange'); crack.inputs[1].default_value = 0; crack.inputs[2].default_value = .055; crack.inputs[3].default_value = 1; crack.inputs[4].default_value = 0
    link(nt, vo.outputs['Distance'], crack.inputs[0])
    nz = _n(nt, 'ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 9; nz.inputs['Detail'].default_value = 4; link(nt, geo.outputs['Position'], nz.inputs['Vector'])
    sep = _n(nt, 'ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Position'], sep.inputs[0])
    heat = _n(nt, 'ShaderNodeMapRange'); heat.inputs[1].default_value = z_floor + .04; heat.inputs[2].default_value = z_floor + .15; heat.inputs[3].default_value = 1; heat.inputs[4].default_value = 0
    link(nt, sep.outputs['Z'], heat.inputs[0])
    nrm = _n(nt, 'ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Normal'], nrm.inputs[0])
    under = _n(nt, 'ShaderNodeMapRange'); under.inputs[1].default_value = .2; under.inputs[2].default_value = -.7; under.inputs[3].default_value = .04; under.inputs[4].default_value = 1
    link(nt, nrm.outputs['Z'], under.inputs[0])
    h = _math(nt, 'MULTIPLY', _math(nt, 'MULTIPLY', heat.outputs[0], under.outputs[0]), _madd(nt, nz.outputs['Fac'], .9, .25))
    glow = _math(nt, 'MAXIMUM', _math(nt, 'MULTIPLY', crack.outputs[0], h), _math(nt, 'MULTIPLY', _math(nt, 'POWER', h, v1=2.2), v1=.55))
    link(nt, _heat_ramp(nt, glow), P.inputs['Emission Color'])
    link(nt, _math(nt, 'MULTIPLY', _math(nt, 'POWER', glow, v1=1.4), v1=4), P.inputs['Emission Strength'])
    link(nt, _mix(nt, crack.outputs[0], (.03, .026, .022), (.006, .005, .004)), P.inputs['Base Color'])
    _set(P, Roughness=.88, Sheen_Weight=.25)
    b = _n(nt, 'ShaderNodeBump'); b.inputs['Strength'].default_value = .8; b.inputs['Distance'].default_value = .004
    link(nt, vo.outputs['Distance'], b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    return m

def ash_mat(z_floor, cx, fy):
    m, nt, P = _principled('ash_bed')
    geo = _n(nt, 'ShaderNodeNewGeometry')
    nz = _n(nt, 'ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 26; nz.inputs['Detail'].default_value = 6; link(nt, geo.outputs['Position'], nz.inputs['Vector'])
    fine = _n(nt, 'ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 260; fine.inputs['Detail'].default_value = 4; link(nt, geo.outputs['Position'], fine.inputs['Vector'])
    # distance from the heart of the fire
    d = _n(nt, 'ShaderNodeVectorMath', operation='DISTANCE'); link(nt, geo.outputs['Position'], d.inputs[0]); d.inputs[1].default_value = (cx, fy, z_floor)
    ctr = _n(nt, 'ShaderNodeMapRange'); ctr.inputs[1].default_value = .12; ctr.inputs[2].default_value = .36; ctr.inputs[3].default_value = 1; ctr.inputs[4].default_value = 0
    link(nt, d.outputs['Value'], ctr.inputs[0])
    sp = _n(nt, 'ShaderNodeMapRange'); sp.inputs[1].default_value = .52; sp.inputs[2].default_value = .7; link(nt, nz.outputs['Fac'], sp.inputs[0])
    g = _math(nt, 'MULTIPLY', sp.outputs[0], ctr.outputs[0])
    link(nt, _heat_ramp(nt, _math(nt, 'MULTIPLY', g, v1=.8)), P.inputs['Emission Color'])
    link(nt, _math(nt, 'MULTIPLY', _math(nt, 'POWER', g, v1=1.5), v1=3.5), P.inputs['Emission Strength'])
    link(nt, _mix(nt, fine.outputs['Fac'], (.09, .085, .08), (.24, .23, .22)), P.inputs['Base Color'])
    _set(P, Roughness=.95)
    return m

def build(col, cx, fy, z_floor=.08, seed=3):
    rnd = random.Random(seed)
    coal, logm, ashm = coal_mat(z_floor), log_mat(z_floor), ash_mat(z_floor, cx, fy)
    # the ash bed: a low mound across the grate area
    bm = bmesh.new(); NX, NY = 44, 22; vs = []
    for j in range(NY + 1):
        row = []
        for i in range(NX + 1):
            x = cx - .46 + .92 * i / NX; y = fy - .2 + .38 * j / NY
            r = math.hypot((x - cx) / .4, (y - fy) / .17)
            z = z_floor + .002 + .03 * max(0, 1 - r * r) + .006 * noise.noise(Vector((x * 14, y * 14, 1))) * min(1, max(0, 1.2 - r))
            row.append(bm.verts.new((x, y, z)))
        vs.append(row)
    for j in range(NY):
        for i in range(NX): bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    obj_from_bm('ash_bed', bm, [ashm], col=col, smooth=True)
    # coals heaped toward the middle, under and between the logs
    bm = bmesh.new()
    for k in range(230):
        a = rnd.uniform(0, 2 * math.pi); rr = rnd.random() ** .7
        x = cx + math.cos(a) * rr * .34; y = fy + math.sin(a) * rr * .15
        r = math.hypot((x - cx) / .4, (y - fy) / .17)
        s = rnd.uniform(.012, .03) * (1.15 - .4 * rr)
        z = z_floor + .03 * max(0, 1 - r * r) + s * .4 + rnd.uniform(0, .012) * (1 - rr)
        ret = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=s, matrix=Matrix.Translation((x, y, z)) @ Matrix.Rotation(rnd.uniform(0, 6.3), 4, 'Z')
                                         @ Matrix.Diagonal((rnd.uniform(.8, 1.4), rnd.uniform(.6, 1.1), rnd.uniform(.35, .6), 1)))
        sd = rnd.uniform(0, 99)
        for v in ret['verts']:
            v.co += (v.co - Vector((x, y, z))).normalized() * s * .28 * noise.noise(v.co * 90 + Vector((sd, 0, 0)))
    obj_from_bm('coals', bm, [coal], col=col, smooth=False)
    # three charred logs: two lying across the bed, one leaning over them
    def log(c, rz, ry, L, R0):
        bm = bmesh.new(); NS, NA = 16, 20; rings = []
        sd = rnd.uniform(0, 99)
        for j in range(NS + 1):
            t = j / NS - .5; ring = []
            for i in range(NA):
                a = 2 * math.pi * i / NA
                rr = R0 * (1 + .07 * noise.noise(Vector((t * 4 + sd, math.cos(a) * 1.5, math.sin(a) * 1.5))) + .035 * noise.noise(Vector((t * 30, a * 3, sd))))
                rr *= 1 - .25 * max(0, abs(t) - .42) / .08     # charred, rounded ends
                ring.append(bm.verts.new((t * L, rr * math.cos(a), rr * math.sin(a))))
            rings.append(ring)
        for j in range(NS):
            for i in range(NA): bm.faces.new((rings[j][i], rings[j][(i + 1) % NA], rings[j + 1][(i + 1) % NA], rings[j + 1][i]))
        for ring, sgn in ((rings[0], -1), (rings[-1], 1)):
            cv = bm.verts.new((sum(v.co.x for v in ring) / NA + sgn * .006, 0, 0))
            for i in range(NA):
                f = (ring[i], ring[(i + 1) % NA], cv) if sgn > 0 else (ring[(i + 1) % NA], ring[i], cv); bm.faces.new(f)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = obj_from_bm('log', bm, [logm], col=col, smooth=True)
        o.location = c; o.rotation_euler = (0, ry, rz)
        return o
    log((cx - .03, fy + .06, z_floor + .072), .12, 0, .62, .066)
    log((cx + .04, fy - .07, z_floor + .065), -.1, 0, .56, .06)
    log((cx - .02, fy - .005, z_floor + .16), 1.25, -.28, .5, .055)
    # the ember light: just above the logs, shining up the inside of the firebox (the bed itself glows)
    L = bpy.data.objects.new('ember_bed_light', bpy.data.lights.new('ember_bed_light', 'AREA')); col.objects.link(L)
    L.data.shape = 'RECTANGLE'; L.data.size = .7; L.data.size_y = .28; L.data.energy = 22; L.data.color = (1, .3, .07)
    L.location = (cx, fy, z_floor + .34); L.rotation_euler = (math.pi, 0, 0); L.visible_camera = False
