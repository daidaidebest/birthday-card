"""Prologue: a castle on a cliff above a misty lake under a full moon, flown like a drone shot, with a snowy owl
gliding past the moon. Built entirely in Blender from primitives + Poly Haven CC0 textures.
blender -b --factory-startup --python castle.py -- OUT.blend [portrait|landscape] [preview]"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix, Euler, noise
sys.path.insert(0, os.path.expanduser('~/projects/render-workspace/tools'))
import blu
from blu import mat, mat_ph, emission_mat, obj_from_bm, collection, link

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/castle.blend'
ORIENT = argv[1] if len(argv) > 1 else 'portrait'
PREVIEW = 'preview' in argv
FPS, FRAMES = 24, 336
R = random.Random(7)
s = blu.empty_file()
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
s.render.fps = FPS
TEXSZ = 1024

# ------------------------------------------------------------------ materials
P_STONE = mat_ph('stone', 'castle_wall_slates', scale=.28, tint=(.78, .76, .72), bump=.9, size=2048)
P_STONE2 = mat_ph('stone2', 'castle_wall_varriation', scale=.3, tint=(.74, .72, .68), bump=.9, size=2048)
P_ROOF = mat_ph('roof', 'roof_slates_02', scale=.45, tint=(.42, .47, .55), bump=.8, rough_mul=.75, size=2048)
P_ROCK = mat_ph('rock', 'cliff_side', scale=.06, tint=(.62, .62, .64), bump=1.2, size=1024)
P_ROCK2 = mat_ph('rock2', 'rock_face', scale=.05, tint=(.55, .56, .6), bump=1.0, size=1024)

def ground_mat():
    """Rock on the steep parts, dark forest floor on the flats (by the surface's slope)."""
    m = bpy.data.materials.new('ground'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; out = N['Material Output']
    N.remove(N['Principled BSDF'])
    rock = P_ROCK.node_tree  # reuse by building a group-free copy: simplest is a mix of two principled setups
    geo = N.new('ShaderNodeNewGeometry'); sep = N.new('ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Normal'], sep.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = .05; link(nt, geo.outputs['Position'], nz.inputs['Vector'])
    add = N.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'; add.inputs[1].default_value = .25; link(nt, nz.outputs['Fac'], add.inputs[0]); link(nt, sep.outputs['Z'], add.inputs[2])
    ramp = N.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].position = .86; ramp.color_ramp.elements[1].position = .93; link(nt, add.outputs[0], ramp.inputs[0])
    # rock branch
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (.06, .06, .06); link(nt, geo.outputs['Position'], mp.inputs[0])
    def tx(img):
        t = N.new('ShaderNodeTexImage'); t.image = img; t.projection = 'BOX'; t.projection_blend = .4; link(nt, mp.outputs[0], t.inputs[0]); return t
    rd = tx(blu.ph_tex('cliff_side', 'Diffuse', size=1024)); rh = tx(blu.ph_tex('cliff_side', 'Displacement', True, size=1024))
    Pr = N.new('ShaderNodeBsdfPrincipled'); tint = N.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'; tint.inputs['Factor'].default_value = 1
    link(nt, rd.outputs[0], tint.inputs[6]); tint.inputs[7].default_value = (.6, .6, .63, 1); link(nt, tint.outputs[2], Pr.inputs['Base Color']); Pr.inputs['Roughness'].default_value = .85
    b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = 1; b.inputs['Distance'].default_value = .3; link(nt, rh.outputs[0], b.inputs['Height']); link(nt, b.outputs[0], Pr.inputs['Normal'])
    # forest floor branch: dark mossy green-brown with noise
    Pg = N.new('ShaderNodeBsdfPrincipled'); n2 = N.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = .4; link(nt, geo.outputs['Position'], n2.inputs['Vector'])
    gr = N.new('ShaderNodeValToRGB'); gr.color_ramp.elements[0].color = (.012, .02, .012, 1); gr.color_ramp.elements[1].color = (.04, .05, .03, 1); link(nt, n2.outputs['Fac'], gr.inputs[0])
    link(nt, gr.outputs[0], Pg.inputs['Base Color']); Pg.inputs['Roughness'].default_value = .95
    mix = N.new('ShaderNodeMixShader'); link(nt, ramp.outputs[0], mix.inputs[0]); link(nt, Pr.outputs[0], mix.inputs[1]); link(nt, Pg.outputs[0], mix.inputs[2])
    link(nt, mix.outputs[0], out.inputs[0])
    return m
GROUND = ground_mat()

def water_mat():
    m = bpy.data.materials.new('water'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; P = N['Principled BSDF']
    P.inputs['Base Color'].default_value = (.003, .006, .012, 1); P.inputs['Roughness'].default_value = .035; P.inputs['IOR'].default_value = 1.33
    P.inputs['Specular IOR Level'].default_value = .6
    geo = N.new('ShaderNodeNewGeometry'); tc = N.new('ShaderNodeTexCoord')
    # ripples: stretched noise drifting with time (keyframed W)
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (.35, 1.4, 1); link(nt, geo.outputs['Position'], mp.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.noise_dimensions = '4D'; nz.inputs['Scale'].default_value = 1.2; nz.inputs['Detail'].default_value = 6; link(nt, mp.outputs[0], nz.inputs['Vector'])
    nz.inputs['W'].default_value = 0
    nz.inputs['W'].keyframe_insert('default_value', frame=1); nz.inputs['W'].default_value = FRAMES / FPS * .25; nz.inputs['W'].keyframe_insert('default_value', frame=FRAMES)
    b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = .25; b.inputs['Distance'].default_value = .2; link(nt, nz.outputs['Fac'], b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    for fc in m.node_tree.animation_data.action.fcurves if m.node_tree.animation_data and m.node_tree.animation_data.action and hasattr(m.node_tree.animation_data.action, 'fcurves') else []:
        for k in fc.keyframe_points: k.interpolation = 'LINEAR'
    return m
WATER = water_mat()

def window_mats():
    """Three groups of warm windows whose candlelight flickers independently (baked keyframes, no drivers)."""
    out = []
    for g in range(3):
        m = emission_mat(f'win{g}', (1.0, .62, .26), 9)
        e = m.node_tree.nodes['Emission']
        rr = random.Random(g * 31 + 5)
        for f in range(1, FRAMES + 1, 3):
            t = f / FPS
            v = 9 * (.72 + .18 * noise.noise(Vector((t * 1.6, g * 7.7, 0))) + .1 * noise.noise(Vector((t * 5.3, g * 3.1, 1))))
            e.inputs[1].default_value = v; e.inputs[1].keyframe_insert('default_value', frame=f)
        out.append(m)
    return out
WINS = window_mats()
DARKWIN = mat('darkwin', (.01, .012, .02), .2)
FRAME = mat('frame', (.05, .045, .04), .6)

# ------------------------------------------------------------------ terrain
def smooth(a, b, x):
    t = max(0, min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t)
CASTLE = Vector((0, 15, 38))  # castle origin: the top of the cliff
def height(x, y):
    # the promontory: an elliptical plateau with a steep, rough cliff falling into the lake
    dx, dy = x / 70, (y - 18) / 58
    jag = noise.noise(Vector((x * .03, y * .03, 3))) * .16 + noise.noise(Vector((x * .09, y * .09, 7))) * .06
    d = math.sqrt(dx * dx + dy * dy) + jag
    cliff = 38 * (1 - smooth(.95, 1.32, d)) + noise.noise(Vector((x * .12, y * .12, 1))) * 1.2 * smooth(.6, 1.1, d)
    if d < .95: cliff = 38 + max(0, (d - .8)) * -6 + noise.noise(Vector((x * .05, y * .05, 2))) * .6
    # a ridge behind, joining the plateau to the hills on the right
    ridge = 0
    if y > 40: ridge = 34 * smooth(70, 20, abs(x - 60 - (y - 40) * .9)) * smooth(40, 70, y) + noise.noise(Vector((x * .04, y * .04, 9))) * 6
    # forested hills on both shores
    hl = (-x - 150) * .35 + 30 * noise.noise(Vector((x * .006, y * .006, 4))) + 8 * noise.noise(Vector((x * .03, y * .03, 5)))
    hr = (x - 170) * .3 + 25 * noise.noise(Vector((x * .007, y * .007, 6))) + 8 * noise.noise(Vector((x * .03, y * .03, 8)))
    hb = (y - 420) * .4 + 60 * noise.noise(Vector((x * .004, y * .004, 11))) + 10 * noise.noise(Vector((x * .02, y * .02, 12)))
    h = max(cliff, ridge, hl, hr, hb, -6)
    return min(h, 160) if h > 0 else h
def terrain(x0, x1, y0, y1, step, name):
    bm = bmesh.new(); nx, ny = int((x1 - x0) / step) + 1, int((y1 - y0) / step) + 1
    vs = [[bm.verts.new((x0 + i * step, y0 + j * step, height(x0 + i * step, y0 + j * step))) for i in range(nx)] for j in range(ny)]
    for j in range(ny - 1):
        for i in range(nx - 1): bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    return obj_from_bm(name, bm, [GROUND], smooth=True)
ENV = collection('Environment')
near = terrain(-260, 260, -240, 300, 2.0, 'land_near')
far = terrain(-1500, 1500, -700, 1400, 12, 'land_far')
# carve the far grid where the near grid is (avoid z-fighting): drop those faces
bm = bmesh.new(); bm.from_mesh(far.data)
kill = [f for f in bm.faces if all(-258 < v.co.x < 258 and -238 < v.co.y < 298 for v in f.verts)]
bmesh.ops.delete(bm, geom=kill, context='FACES'); bm.to_mesh(far.data); bm.free()

# distant mountains: a ridged range far behind the lake, lost in haze
def mountains():
    bm = bmesh.new(); x0, x1, y0, y1, st = -5000, 5000, 1300, 5200, 26
    nx, ny = int((x1 - x0) / st) + 1, int((y1 - y0) / st) + 1; vs = []
    for j in range(ny):
        row = []
        for i in range(nx):
            x, y = x0 + i * st, y0 + j * st
            r = 1 - abs(noise.noise(Vector((x * .0013, y * .0011, 21))))
            r2 = 1 - abs(noise.noise(Vector((x * .0037, y * .0033, 22))))
            r3 = noise.noise(Vector((x * .011, y * .011, 23)))
            h = (r ** 1.9) * 560 + (r2 ** 2.2) * 220 + r3 * 40 - 140 + (y - y0) * .06
            h = h * smooth(y0, y0 + 500, y) - 60 * (1 - smooth(y0, y0 + 300, y))   # the near edge sinks below the lake: no gap under the range
            row.append(bm.verts.new((x, y, h)))
        vs.append(row)
    for j in range(ny - 1):
        for i in range(nx - 1): bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
    m = mat('mountain', (.05, .055, .07), .9)
    # snow on the heights, by world z
    nt = m.node_tree; N = nt.nodes; geo = N.new('ShaderNodeNewGeometry'); sep = N.new('ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Position'], sep.inputs[0])
    rmp = N.new('ShaderNodeMapRange'); rmp.inputs[1].default_value = 450; rmp.inputs[2].default_value = 650; link(nt, sep.outputs['Z'], rmp.inputs[0])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; link(nt, rmp.outputs[0], mx.inputs[0]); mx.inputs[6].default_value = (.035, .04, .05, 1); mx.inputs[7].default_value = (.55, .6, .7, 1)
    link(nt, mx.outputs[2], N['Principled BSDF'].inputs['Base Color'])
    return obj_from_bm('mountains', bm, [m], smooth=True)
mountains()

lake = bpy.data.meshes.new('lake'); bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=6000); bm.to_mesh(lake); bm.free(); lake.materials.append(WATER)
lo = bpy.data.objects.new('lake', lake); s.collection.objects.link(lo)

# ------------------------------------------------------------------ castle kit
CAS = collection('Castle')
def place(ob, loc, rot=0):
    ob.location = loc; ob.rotation_euler = (0, 0, rot); return ob
def add_window(bm_list, center, normal, w, h, lit):
    """A recessed window: a dark stone frame with a glowing (or dark) pane."""
    n = Vector(normal).normalized(); up = Vector((0, 0, 1)); side = up.cross(n).normalized()
    bm = bmesh.new()
    def box(c, sx, sy, sz):
        mtx = Matrix(((side.x * sx, n.x * sy, 0, c.x), (side.y * sx, n.y * sy, 0, c.y), (0, 0, sz, c.z), (0, 0, 0, 1)))
        bmesh.ops.create_cube(bm, size=1, matrix=mtx)
    box(center, w, .5, h)
    for f in bm.faces: f.material_index = 0
    nf = len(bm.faces)
    box(center + n * .05 + up * (h * .5 + .18), w * 1.25, .45, .3)  # lintel
    box(center + n * .05 - up * (h * .5 + .12), w * 1.3, .55, .22)  # sill
    for f in list(bm.faces)[nf:]: f.material_index = 1
    bm_list.append((bm, lit))
def flush_windows(items, name):
    """Join window boxes per material group into a few objects."""
    groups = {}
    for bm, lit in items: groups.setdefault(lit, []).append(bm)
    for lit, bms in groups.items():
        me = bpy.data.meshes.new(f'{name}_w{lit}'); big = bmesh.new()
        for b in bms:
            tmp = bpy.data.meshes.new('t'); b.to_mesh(tmp); b.free(); big.from_mesh(tmp); bpy.data.meshes.remove(tmp)
        big.to_mesh(me); big.free()
        me.materials.append(WINS[lit] if lit >= 0 else DARKWIN); me.materials.append(FRAME)
        ob = bpy.data.objects.new(f'{name}_w{lit}', me); CAS.objects.link(ob)
WIN_ITEMS = []
def lit_or_dark(p=.55): return R.randrange(3) if R.random() < p else -1

def cylinder(name, r, h, seg=28, mat_=None, r_top=None, cap=True):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=r_top if r_top is not None else r, depth=h, matrix=Matrix.Translation((0, 0, h / 2)))
    return obj_from_bm(name, bm, [mat_ or P_STONE], col=CAS, smooth=True)
def cone_roof(name, r, h, seg=28, flare=.12):
    bm = bmesh.new()
    rings = 8; prev = None; verts = []
    for k in range(rings + 1):
        u = k / rings; rad = r * (1 - u) ** 1.08 * (1 + flare * (1 - u) ** 6); z = h * u
        ring = [bm.verts.new((math.cos(a / seg * 2 * math.pi) * rad, math.sin(a / seg * 2 * math.pi) * rad, z)) for a in range(seg)] if k < rings else [bm.verts.new((0, 0, h))]
        if prev:
            for i in range(seg):
                if len(ring) == 1: bm.faces.new((prev[i], prev[(i + 1) % seg], ring[0]))
                else: bm.faces.new((prev[i], prev[(i + 1) % seg], ring[(i + 1) % seg], ring[i]))
        prev = ring
    bm.faces.new(list(reversed(verts or [v for v in bm.verts][:seg])))
    return obj_from_bm(name, bm, [P_ROOF], col=CAS, smooth=True)
def crenels(name, r, z, n=None, size=1.1, square=None):
    bm = bmesh.new()
    if square:
        w, d = square; per = 2 * (w + d); n = int(per / (size * 2))
        pts = []
        for i in range(n):
            u = i / n * per
            if u < w: p = (-w / 2 + u, -d / 2)
            elif u < w + d: p = (w / 2, -d / 2 + u - w)
            elif u < 2 * w + d: p = (w / 2 - (u - w - d), d / 2)
            else: p = (-w / 2, d / 2 - (u - 2 * w - d))
            pts.append((p, 0))
    else:
        n = n or max(8, int(2 * math.pi * r / (size * 2)))
        pts = [((math.cos(i / n * 2 * math.pi) * r, math.sin(i / n * 2 * math.pi) * r), i / n * 2 * math.pi) for i in range(n)]
    for (x, y), a in pts:
        bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((x, y, z + .7)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Diagonal((size * .9, .8, 1.4, 1)))
    return obj_from_bm(name, bm, [P_STONE2], col=CAS)
def ring(name, r, z, h=.5, out=.35):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=False, segments=32, radius1=r + out, radius2=r + out, depth=h, matrix=Matrix.Translation((0, 0, z)))
    return obj_from_bm(name, bm, [P_STONE2], col=CAS, smooth=True)

def tower(name, x, y, z0, r, h, roof='cone', roof_h=None, windows=True, win_p=.55, facing=-math.pi / 2):
    base = Vector((x, y, z0))
    t = cylinder(name, r, h + 6, mat_=P_STONE if R.random() < .6 else P_STONE2); t.location = base - Vector((0, 0, 6))
    ring(name + '_band', r, h - .3).location = base
    if roof == 'cone':
        rh = roof_h or r * 3.2
        c = cone_roof(name + '_roof', r * 1.18, rh); c.location = base + Vector((0, 0, h))
        sp = cylinder(name + '_spike', .12, 3.2, seg=8, mat_=FRAME, r_top=.02); sp.location = base + Vector((0, 0, h + rh - .2))
    elif roof == 'crenel':
        crenels(name + '_cr', r + .05, h, size=1.0).location = base
        cap = cylinder(name + '_cap', r + .2, .5, mat_=P_STONE2); cap.location = base + Vector((0, 0, h - .4))
        c = cone_roof(name + '_roof', r * .55, (roof_h or r * 2.2)); c.location = base + Vector((0, 0, h))
    if windows:
        lv = max(1, int((h - 8) / 6.5))
        for k in range(lv):
            z = z0 + 6 + k * 6.5 + R.uniform(-.4, .4)
            for a in [facing + d for d in (-.9, -.3, .3, .9)][: (3 if r < 4 else 4)]:
                a += R.uniform(-.12, .12)
                n = Vector((math.cos(a), math.sin(a), 0))
                add_window(WIN_ITEMS, Vector((x, y, z)) + n * (r - .12), n, .9 if r < 4 else 1.2, 2.0 if r < 4 else 2.6, lit_or_dark(win_p))
    return t

def hall(name, x, y, z0, w, d, h, roof_h, rot=0, win_rows=1, tall=False, win_p=.6, buttress=True):
    """A rectangular building with a steep gabled slate roof; windows on the long faces."""
    M = Matrix.Translation((x, y, z0)) @ Matrix.Rotation(rot, 4, 'Z')
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=M @ Matrix.Translation((0, 0, (h + 6) / 2 - 6)) @ Matrix.Diagonal((w, d, h + 6, 1)))
    obj_from_bm(name, bm, [P_STONE], col=CAS)
    # gable roof prism
    bm = bmesh.new(); hw, hd = w / 2 + .6, d / 2 + .8
    v = [bm.verts.new(M @ Vector(p)) for p in [(-hw, -hd, h), (hw, -hd, h), (hw, hd, h), (-hw, hd, h), (-hw, 0, h + roof_h), (hw, 0, h + roof_h)]]
    bm.faces.new((v[0], v[1], v[5], v[4])); bm.faces.new((v[2], v[3], v[4], v[5])); bm.faces.new((v[0], v[4], v[3])); bm.faces.new((v[1], v[2], v[5]))
    bm.faces.new((v[0], v[3], v[2], v[1]))
    obj_from_bm(name + '_roof', bm, [P_ROOF], col=CAS)
    # stone gable ends (the roof's triangles in stone), slightly proud
    bm = bmesh.new()
    for sx in (-1, 1):
        g = [bm.verts.new(M @ Vector(p)) for p in [(sx * (w / 2 + .1), -d / 2, h), (sx * (w / 2 + .1), d / 2, h), (sx * (w / 2 + .1), 0, h + roof_h + .5)]]
        bm.faces.new(g)
    obj_from_bm(name + '_gable', bm, [P_STONE2], col=CAS)
    # ridge cresting and dormers suggested by small spikes
    for k in range(int(w / 6)):
        sp = cylinder(f'{name}_fin{k}', .08, 1.4, seg=6, mat_=FRAME, r_top=.02); sp.location = M @ Vector((-w / 2 + 3 + k * 6, 0, h + roof_h))
    # windows on both long faces
    fn = M.to_3x3() @ Vector((0, -1, 0))
    nwin = max(2, int(w / (4.5 if tall else 3.6)))
    for row in range(win_rows):
        for k in range(nwin):
            u = (k + .5) / nwin - .5
            zc = z0 + (h * .45 if tall else 5 + row * (h - 6) / max(1, win_rows))
            add_window(WIN_ITEMS, M @ Vector((u * w * .92, -d / 2 - .08, zc - z0)), fn, 1.6 if tall else 1.1, h * .5 if tall else 2.2, lit_or_dark(win_p))
            add_window(WIN_ITEMS, M @ Vector((u * w * .92, d / 2 + .08, zc - z0)), -fn, 1.6 if tall else 1.1, h * .5 if tall else 2.2, lit_or_dark(win_p * .7))
    if buttress:
        bm = bmesh.new()
        for k in range(nwin + 1):
            u = k / nwin - .5
            for sy in (-1, 1):
                bmesh.ops.create_cube(bm, size=1, matrix=M @ Matrix.Translation((u * w * .92, sy * (d / 2 + .6), h * .38 - 3)) @ Matrix.Diagonal((.9, 1.4, h * .76 + 6, 1)))
        obj_from_bm(name + '_butt', bm, [P_STONE2], col=CAS)

def wall(name, pts, z0, h, thick=2.4):
    bm = bmesh.new()
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        a, b = Vector((ax, ay, 0)), Vector((bx, by, 0)); L = (b - a).length; ang_ = math.atan2(b.y - a.y, b.x - a.x); c = (a + b) / 2
        Mw = Matrix.Translation((c.x, c.y, z0)) @ Matrix.Rotation(ang_, 4, 'Z')
        bmesh.ops.create_cube(bm, size=1, matrix=Mw @ Matrix.Translation((0, 0, (h + 8) / 2 - 8)) @ Matrix.Diagonal((L + thick, thick, h + 8, 1)))
        n = int(L / 2.2)
        for k in range(n):
            bmesh.ops.create_cube(bm, size=1, matrix=Mw @ Matrix.Translation((-L / 2 + (k + .5) * L / n, -thick * .3, h + .6)) @ Matrix.Diagonal((1.1, .7, 1.2, 1)))
    obj_from_bm(name, bm, [P_STONE2], col=CAS)

# ------------------------------------------------------------------ the castle (Hogwarts-like silhouette, original layout)
Z = 38
hall('great_hall', 0, 18, Z, 46, 15, 21, 13, tall=True, win_p=.85)
tower('astronomy', -24, 30, Z, 6.2, 66, roof_h=22, win_p=.5)
tower('north', 22, 34, Z, 5.2, 52, roof_h=17)
tower('front_l', -33, -4, Z - 2, 4.6, 30, roof='crenel', roof_h=9)
tower('front_r', 30, 0, Z - 1, 5.0, 36, roof_h=15)
tower('gate', 7, -11, Z - 3, 3.6, 25, roof_h=12)
tower('turret1', -23.5, 10.5, Z, 1.9, 33, roof_h=8, win_p=.4)
tower('turret2', 23.5, 10.5, Z, 1.9, 33, roof_h=8, win_p=.4)
tower('turret3', -23.5, 25.5, Z, 1.8, 36, roof_h=8, win_p=.4)
tower('turret4', 23.5, 25.5, Z, 1.8, 36, roof_h=8, win_p=.4)
tower('east', 44, 22, Z - 2, 4.2, 40, roof_h=14)
tower('west_low', -46, 18, Z - 3, 3.9, 24, roof='crenel', roof_h=8)
tower('back_tall', 2, 52, Z + 1, 4.4, 58, roof_h=19, win_p=.45)
hall('east_wing', 34, 42, Z, 26, 13, 24, 11, rot=.35, win_rows=3)
hall('west_wing', -36, 42, Z, 22, 12, 19, 10, rot=-.25, win_rows=2)
hall('front_house', -12, -6, Z - 1, 16, 10, 14, 8, rot=.12, win_rows=2)
# a square clock tower with a pyramid roof
bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((36, 12, Z + 21)) @ Matrix.Diagonal((8, 8, 54, 1))); obj_from_bm('clock', bm, [P_STONE], col=CAS)
cone_roof('clock_roof', 6.2, 14, seg=4, flare=.05).location = (36, 12, Z + 48)
bpy.data.objects['clock_roof'].rotation_euler = (0, 0, math.pi / 4)
crenels('clock_cr', 0, Z + 47.4, square=(8.2, 8.2), size=1.0).location = (36, 12, 0)
clockface = emission_mat('clockface', (1, .8, .5), 4)
bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=32, radius=2.2, matrix=Matrix.Translation((36, 7.9, Z + 40)) @ Matrix.Rotation(math.pi / 2, 4, 'X')); obj_from_bm('clockface', bm, [clockface], col=CAS)
for zz in (14, 22, 30):
    add_window(WIN_ITEMS, Vector((36, 7.9, Z + zz)), (0, -1, 0), 1.2, 2.6, lit_or_dark(.7))
wall('curtain', [(-46, 18), (-33, -4), (-12, -12), (7, -11), (30, 0), (44, 22), (40, 46)], Z - 3, 11)
wall('curtain_back', [(-46, 18), (-40, 46), (-24, 30)], Z - 2, 10)
flush_windows(WIN_ITEMS, 'castle')

# ------------------------------------------------------------------ pines
def pine(name, h, seed):
    rr = random.Random(seed); bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=.25 * h / 14, radius2=.05, depth=h * .35, matrix=Matrix.Translation((0, 0, h * .17)))
    layers = 9; seg = 11
    for k in range(layers):
        u = k / layers; z = h * (.18 + u * .74); rad = h * .3 * (1 - u) ** 1.05 + .3; drop = h * .1 * (1 - u * .5)
        top = bm.verts.new((0, 0, z + drop * .9))
        rim = []
        for i in range(seg):
            a = i / seg * 2 * math.pi + rr.uniform(-.15, .15); rk = rad * rr.uniform(.75, 1.15)
            rim.append(bm.verts.new((math.cos(a) * rk, math.sin(a) * rk, z - drop * rr.uniform(.2, .55))))
            if i % 2: rim.append(bm.verts.new((math.cos(a + .2) * rk * .7, math.sin(a + .2) * rk * .7, z - drop * .1)))
        for i in range(len(rim)): bm.faces.new((top, rim[i], rim[(i + 1) % len(rim)]))
    bm.verts.new((0, 0, h));
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(PINE); return me
PINE = mat('pine', (.012, .028, .018), .85)
PINE.node_tree.nodes['Principled BSDF'].inputs['Subsurface Weight'].default_value = .0
PINES = [pine(f'pine{k}', 14, k) for k in range(4)]
TREES = collection('Trees')
RT = random.Random(3); n_tree = 0
def scatter(x0, x1, y0, y1, count, near_scale=1.0):
    global n_tree
    tries = 0
    while tries < count * 4 and count > 0:
        tries += 1; x, y = RT.uniform(x0, x1), RT.uniform(y0, y1); z = height(x, y)
        if z < 1.5: continue
        dzx = height(x + 2, y) - z; dzy = height(x, y + 2) - z
        if math.hypot(dzx, dzy) > 2.2: continue
        if abs(x) < 52 and -16 < y < 60 and z > 30: continue  # not inside the castle
        if noise.noise(Vector((x * .02, y * .02, 31))) < -.35: continue  # clearings
        ob = bpy.data.objects.new(f't{n_tree}', PINES[n_tree % 4]); TREES.objects.link(ob); n_tree += 1
        sc = RT.uniform(.7, 1.35) * near_scale; ob.scale = (sc, sc, sc * RT.uniform(.9, 1.2)); ob.location = (x, y, z - .5); ob.rotation_euler = (RT.uniform(-.04, .04), RT.uniform(-.04, .04), RT.uniform(0, 6.3))
        count -= 1
scatter(-260, 260, -240, 300, 2600 if not PREVIEW else 900)
scatter(-1200, 1200, -600, 1300, 2500 if not PREVIEW else 600, 1.6)

# ------------------------------------------------------------------ sky, moon, light
MOON_DIR = Vector((-.2, 1, .44)).normalized()
w = s.world; nt = w.node_tree; N = nt.nodes; bg = N['Background']
tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Generated'], sep.inputs[0])
grad = N.new('ShaderNodeValToRGB'); link(nt, sep.outputs['Z'], grad.inputs[0])
el = grad.color_ramp.elements; el[0].position = 0; el[0].color = (.012, .02, .04, 1); el[1].position = .45; el[1].color = (.0016, .003, .009, 1)
e2 = el.new(.02); e2.color = (.018, .028, .052, 1)
# stars: tiny voronoi cells on the sky dome
vor = N.new('ShaderNodeTexVoronoi'); vor.feature = 'F1'; vor.inputs['Scale'].default_value = 420; link(nt, tc.outputs['Generated'], vor.inputs['Vector'])
st = N.new('ShaderNodeMapRange'); st.inputs[1].default_value = .06; st.inputs[2].default_value = .0; st.inputs[3].default_value = 0; st.inputs[4].default_value = 1
link(nt, vor.outputs['Distance'], st.inputs[0])
pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 6; link(nt, st.outputs[0], pw.inputs[0])
rnd = N.new('ShaderNodeMath'); rnd.operation = 'MULTIPLY'; link(nt, pw.outputs[0], rnd.inputs[0]); link(nt, vor.outputs['Color'], rnd.inputs[1])
hz = N.new('ShaderNodeMapRange'); hz.inputs[1].default_value = .02; hz.inputs[2].default_value = .2; link(nt, sep.outputs['Z'], hz.inputs[0])
sm = N.new('ShaderNodeMath'); sm.operation = 'MULTIPLY'; link(nt, rnd.outputs[0], sm.inputs[0]); link(nt, hz.outputs[0], sm.inputs[1])
sm2 = N.new('ShaderNodeMath'); sm2.operation = 'MULTIPLY'; sm2.inputs[1].default_value = 1.6; link(nt, sm.outputs[0], sm2.inputs[0])
# moon halo: a soft glow around the moon's direction
dot = N.new('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'; link(nt, tc.outputs['Generated'], dot.inputs[0]); dot.inputs[1].default_value = MOON_DIR
halo = N.new('ShaderNodeMath'); halo.operation = 'POWER'; halo.inputs[1].default_value = 90; link(nt, dot.outputs['Value'], halo.inputs[0])
halo2 = N.new('ShaderNodeMath'); halo2.operation = 'POWER'; halo2.inputs[1].default_value = 900; link(nt, dot.outputs['Value'], halo2.inputs[0])
hsum = N.new('ShaderNodeMath'); hsum.operation = 'MULTIPLY_ADD'; hsum.inputs[1].default_value = .12; link(nt, halo.outputs[0], hsum.inputs[0]); link(nt, halo2.outputs[0], hsum.inputs[2])
hcol = N.new('ShaderNodeMix'); hcol.data_type = 'RGBA'; hcol.blend_type = 'ADD'; link(nt, hsum.outputs[0], hcol.inputs[0])
link(nt, grad.outputs[0], hcol.inputs[6]); hcol.inputs[7].default_value = (.22, .28, .42, 1)
star = N.new('ShaderNodeMix'); star.data_type = 'RGBA'; star.blend_type = 'ADD'; link(nt, sm2.outputs[0], star.inputs[0]); link(nt, hcol.outputs[2], star.inputs[6]); star.inputs[7].default_value = (1, .97, .92, 1)
link(nt, star.outputs[2], bg.inputs[0]); bg.inputs[1].default_value = 1

# the moon: a textured sphere far away, lit from the camera side so it reads full
moon_img = blu.portable(os.path.expanduser('~/projects/render-workspace/assets/moon.png'))
mm = bpy.data.materials.new('moon'); mm.use_nodes = True; mnt = mm.node_tree; MN = mnt.nodes; MN.remove(MN['Principled BSDF'])
mtc = MN.new('ShaderNodeTexCoord'); mtx = MN.new('ShaderNodeTexImage'); mtx.image = moon_img; link(mnt, mtc.outputs['UV'], mtx.inputs[0])
mem = MN.new('ShaderNodeEmission'); mem.inputs[1].default_value = 6; link(mnt, mtx.outputs[0], mem.inputs[0]); link(mnt, mem.outputs[0], MN['Material Output'].inputs[0])
DIST, RAD = 60000, 1150
bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=64, radius=RAD)
me = bpy.data.meshes.new('moon'); bm.to_mesh(me); bm.free()
uv = me.uv_layers.new();
for l in me.loops: v = me.vertices[l.vertex_index].co; uv.data[l.index].uv = (v.x / RAD / 2 + .5, v.y / RAD / 2 + .5)
me.materials.append(mm); moon = bpy.data.objects.new('moon', me); s.collection.objects.link(moon)
moon.location = MOON_DIR * DIST; moon.rotation_euler = MOON_DIR.to_track_quat('Z', 'Y').to_euler()
moon.visible_shadow = False
for attr in ('visible_diffuse', 'visible_glossy', 'visible_transmission', 'visible_volume_scatter'): setattr(moon, attr, attr == 'visible_glossy')

sun = bpy.data.objects.new('moonlight', bpy.data.lights.new('moonlight', 'SUN')); s.collection.objects.link(sun)
sun.data.energy = .55; sun.data.color = (.62, .72, 1.0); sun.data.angle = math.radians(.6)
sun.rotation_euler = (-MOON_DIR).to_track_quat('-Z', 'Y').to_euler()
# a faint cool fill from the camera side so the castle's front isn't pure black
fill = bpy.data.objects.new('fill', bpy.data.lights.new('fill', 'SUN')); s.collection.objects.link(fill)
fill.data.energy = .32; fill.data.color = (.55, .63, .9); fill.rotation_euler = Vector((.3, -1, .5)).normalized().to_track_quat('Z', 'Y').to_euler()
fill.rotation_euler = (-Vector((.3, -1, .5)).normalized()).to_track_quat('-Z', 'Y').to_euler()
# warm light spilling from the great hall windows onto the courtyard and walls
for (x, y, z, e) in [(0, 9, Z + 9, 2500), (-24, 24, Z + 30, 600), (20, 28, Z + 20, 600), (36, 7, Z + 18, 500), (-12, -12, Z + 6, 600)]:
    L = bpy.data.objects.new('warm', bpy.data.lights.new('warm', 'POINT')); L.data.energy = e; L.data.color = (1, .6, .28); L.data.shadow_soft_size = 2; L.location = (x, y, z); s.collection.objects.link(L); L.visible_camera = False; L.visible_glossy = False

# ------------------------------------------------------------------ mist over the lake
def mist():
    m = bpy.data.materials.new('mist'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    v = N.new('ShaderNodeVolumePrincipled'); v.inputs['Color'].default_value = (.75, .82, 1, 1); v.inputs['Anisotropy'].default_value = .45
    geo = N.new('ShaderNodeNewGeometry'); sep = N.new('ShaderNodeSeparateXYZ'); link(nt, geo.outputs['Position'], sep.inputs[0])
    fall = N.new('ShaderNodeMapRange'); fall.inputs[1].default_value = 2; fall.inputs[2].default_value = 26; fall.inputs[3].default_value = 1; fall.inputs[4].default_value = 0; link(nt, sep.outputs['Z'], fall.inputs[0])
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (.012, .02, .05); link(nt, geo.outputs['Position'], mp.inputs[0])
    nz = N.new('ShaderNodeTexNoise'); nz.noise_dimensions = '4D'; nz.inputs['Detail'].default_value = 3; link(nt, mp.outputs[0], nz.inputs['Vector'])
    nz.inputs['W'].default_value = 0; nz.inputs['W'].keyframe_insert('default_value', frame=1); nz.inputs['W'].default_value = .6; nz.inputs['W'].keyframe_insert('default_value', frame=FRAMES)
    c = N.new('ShaderNodeMapRange'); c.inputs[1].default_value = .42; c.inputs[2].default_value = .7; link(nt, nz.outputs['Fac'], c.inputs[0])
    mul = N.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; link(nt, fall.outputs[0], mul.inputs[0]); link(nt, c.outputs[0], mul.inputs[1])
    d = N.new('ShaderNodeMath'); d.operation = 'MULTIPLY'; d.inputs[1].default_value = .045; link(nt, mul.outputs[0], d.inputs[0])
    link(nt, d.outputs[0], v.inputs['Density']); link(nt, v.outputs[0], N['Material Output'].inputs['Volume'])
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, 120, 12)) @ Matrix.Diagonal((700, 700, 28, 1)))
    obj_from_bm('mist', bm, [m])
    # a thin, wide haze for depth (aerial perspective) toward the mountains
    h = bpy.data.materials.new('haze'); h.use_nodes = True; nt = h.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    v = N.new('ShaderNodeVolumePrincipled'); v.inputs['Color'].default_value = (.55, .65, .9, 1); v.inputs['Density'].default_value = .00016; v.inputs['Anisotropy'].default_value = .5
    link(nt, v.outputs[0], N['Material Output'].inputs['Volume'])
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, 2400, 300)) @ Matrix.Diagonal((9000, 4600, 1000, 1)))
    obj_from_bm('haze', bm, [h])
mist()


# ------------------------------------------------------------------ camera: a drone glide from the moon down to the castle, then a slow drift
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera = cam
cam.data.lens = 30 if ORIENT == 'portrait' else 32; cam.data.sensor_fit = 'AUTO'; cam.data.clip_end = 90000; cam.data.clip_start = .3
tgt = bpy.data.objects.new('cam_target', None); s.collection.objects.link(tgt)
con = cam.constraints.new('TRACK_TO'); con.target = tgt; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
def ease(u): u = max(0, min(1, u)); return u * u * (3 - 2 * u)
def ease_io(u): u = max(0, min(1, u)); return .5 - .5 * math.cos(math.pi * u)
P0, P1 = Vector((-70, -560, 205)), Vector((-6, -158, 64))
CASTLE_AIM = Vector((2, 22, 72))
MOON_AIM = P0 + MOON_DIR * 600
DIVE = 9.5 * FPS
for f in range(1, FRAMES + 1):
    u = ease_io(f / DIVE) if f <= DIVE else 1
    drift = max(0, f - DIVE) / FPS  # after the dive, an almost imperceptible push-in and drift
    p = P0.lerp(P1, u) + Vector((math.sin(u * math.pi) * 40, 0, math.sin(u * math.pi) * 25))
    p += Vector((drift * 1.2, drift * 3.0, -drift * .5))
    aim = MOON_AIM.lerp(CASTLE_AIM, ease_io(min(1, f / (DIVE * .92)))) + Vector((drift * .6, 0, 0))
    cam.location = p; cam.keyframe_insert('location', frame=f)
    tgt.location = aim; tgt.keyframe_insert('location', frame=f)

# ------------------------------------------------------------------ the owl
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'owl.py')).read())

# ------------------------------------------------------------------ render settings
s.render.resolution_x, s.render.resolution_y = (1080, 1920) if ORIENT == 'portrait' else (1920, 1080)
s.cycles.samples = 64; s.cycles.use_denoising = True; s.cycles.max_bounces = 6; s.cycles.volume_bounces = 1
s.cycles.volume_step_rate = 4; s.cycles.volume_preview_step_rate = 4
s.view_settings.view_transform = 'AgX'; s.view_settings.look = 'AgX - Medium High Contrast'; s.view_settings.exposure = 1.2
s.render.image_settings.file_format = 'PNG'
s.render.use_motion_blur = True; s.render.motion_blur_shutter = .5
blu.save(OUT, (1, FRAMES))
