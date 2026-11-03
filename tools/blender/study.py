"""The cozy study at night (book, memories and cake scenes), built in Blender from Poly Haven CC0 models/textures
plus procedural books, fireplace, fire, fairy lights and a two-tier birthday cake with sugar roses.
blender -b --factory-startup --python study.py -- OUT.blend VARIANT ORIENT [preview]
  VARIANT: book (looping camera drift, no cake) | cake-base (everything for the cake stills: both cameras, the flame
           lights hidden; cake_variants.py renders unlit / lit / after / mask, wide and close, from it)
  ORIENT: portrait | landscape"""
import bpy, bmesh, math, random, sys, os, json
from mathutils import Vector, Matrix, Euler, noise
sys.path.insert(0, os.path.expanduser('~/projects/render-workspace/tools'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # cake.py, embers.py (v17)
import blu
from blu import mat, mat_ph, emission_mat, obj_from_bm, collection, link

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else '/tmp/study.blend'
VAR = argv[1] if len(argv) > 1 else 'book'
ORIENT = argv[2] if len(argv) > 2 else 'portrait'
PREVIEW = 'preview' in argv
CAKE = VAR.startswith('cake')
FPS = 24; LOOP = 240; XF = 24; FRAMES = LOOP + XF if VAR == 'book' else 1
R = random.Random(11)
s = blu.empty_file(); s.render.fps = FPS
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
W_, D_, H_ = 7.0, 6.4, 4.2   # room: x -3.5..3.5, y -3.4..3.0, z 0..4.2
BACK = 3.0

# ------------------------------------------------------------------ materials
FLOOR = mat_ph('floor', 'wood_floor_worn', scale=.5, tint=(.62, .5, .42), bump=.4, size=1024)
PLASTER = mat_ph('plaster', 'plastered_wall_03', scale=.45, tint=(.78, .66, .54), bump=.3, size=1024)
STONE = mat_ph('stone', 'stone_wall', scale=1.1, tint=(.42, .36, .31), bump=.8, size=1024)
FBSTONE = mat_ph('fb_stone', 'stone_wall', scale=1.6, tint=(.12, .095, .08), bump=1.0, size=1024)  # sooty firebox (v19: the book loop too)
DARKWOOD = mat_ph('darkwood', 'dark_wood', scale=.8, tint=(.55, .38, .26), bump=.25, rough_mul=.8, size=1024)
RUG = mat('rug', (.32, .07, .06), .9)
GOLD = mat('gold', (1.0, .76, .38), .25, metal=1)
BRASS = mat('brass', (.85, .62, .32), .3, metal=1)

def box(name, c, size, m, col=None, rot=0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(c) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((*size, 1)))
    return obj_from_bm(name, bm, [m], col=col)

ROOM = collection('Room')
box('floor', (0, -.2, -.05), (W_, D_, .1), FLOOR, ROOM)
box('ceiling', (0, -.2, H_ + .05), (W_, D_, .1), DARKWOOD, ROOM)
# beams across the ceiling
for k in range(5): box(f'beam{k}', (0, -2.8 + k * 1.45, H_ - .14), (W_, .22, .28), DARKWOOD, ROOM)
# back wall with an arched window opening on the right (built from pieces around the opening)
WIN = dict(x0=1.25, x1=2.75, z0=.95, z1=3.5)   # window opening; the arch top spans z1-0.75..z1
def wall_with_window():
    bm = bmesh.new(); t = .3; y = BACK + t / 2
    def cube(cx, cz, sx, sz): bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((cx, y, cz)) @ Matrix.Diagonal((sx, t, sz, 1)))
    cube((-3.5 + WIN['x0']) / 2, H_ / 2, WIN['x0'] + 3.5, H_)                # left of the window
    cube((WIN['x1'] + 3.5) / 2, H_ / 2, 3.5 - WIN['x1'], H_)                 # right
    cube((WIN['x0'] + WIN['x1']) / 2, WIN['z0'] / 2, WIN['x1'] - WIN['x0'], WIN['z0'])      # below
    cube((WIN['x0'] + WIN['x1']) / 2, (WIN['z1'] + H_) / 2, WIN['x1'] - WIN['x0'], H_ - WIN['z1'])  # above
    # the arch: fill the corners above the springing line with wedges following a semicircle
    cx, r, zs = (WIN['x0'] + WIN['x1']) / 2, (WIN['x1'] - WIN['x0']) / 2, WIN['z1'] - (WIN['x1'] - WIN['x0']) / 2
    # v19: two smooth spandrels (a curved soffit) instead of 14 stepped wedges, which caught the moonlight as a white staircase
    n = 32
    for half in (0, 1):
        arc = [math.pi - math.pi / 2 * k / n if half == 0 else math.pi / 2 - math.pi / 2 * k / n for k in range(n + 1)]
        pts = [(cx + math.cos(a) * r, zs + math.sin(a) * r) for a in arc]
        corner = (WIN['x0'] - .005, WIN['z1'] + .005) if half == 0 else (WIN['x1'] + .005, WIN['z1'] + .005)
        poly = pts + [(cx, WIN['z1'] + .005), corner] if half == 0 else [(cx, WIN['z1'] + .005)] + pts + [corner]
        front = [bm.verts.new((px, y - t / 2, pz)) for px, pz in poly]
        back = [bm.verts.new((px, y + t / 2, pz)) for px, pz in poly]
        bm.faces.new(front); bm.faces.new(list(reversed(back)))
        for k in range(len(poly)):
            a, b = k, (k + 1) % len(poly); bm.faces.new((front[b], front[a], back[a], back[b]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = obj_from_bm('backwall', bm, [PLASTER], col=ROOM)
    return cx, r, zs
WCX, WR, WZS = wall_with_window()
box('wall_l', (-3.55, -.2, H_ / 2), (.1, D_, H_), PLASTER, ROOM)
box('wall_r', (3.55, -.2, H_ / 2), (.1, D_, H_), PLASTER, ROOM)
box('wall_front', (0, -3.45, H_ / 2), (W_, .1, H_), PLASTER, ROOM)
# stone lower wall band and skirting
box('wainscot', (-1.0, BACK - .02, .55), (5.0, .06, 1.1), STONE, ROOM)
box('skirt', (0, BACK - .06, .06), (W_, .06, .12), DARKWOOD, ROOM)

# window frame: mullions, transom and the arch rim; thin glass; the night beyond
def window():
    fm = DARKWOOD; y = BACK + .02
    box('win_sill', (WCX, BACK - .1, WIN['z0'] - .05), (WIN['x1'] - WIN['x0'] + .3, .42, .1), DARKWOOD, ROOM)
    for x in (WIN['x0'] + .04, WCX, WIN['x1'] - .04): box('mullion', (x, y, (WIN['z0'] + WZS) / 2), (.07, .1, WZS - WIN['z0']), fm, ROOM)
    for z in (WIN['z0'] + .03, (WIN['z0'] + WZS) * .5 + .2, WZS): box('transom', (WCX, y, z), (WIN['x1'] - WIN['x0'], .1, .07), fm, ROOM)
    bm = bmesh.new()
    for i in range(24):
        a = math.pi * i / 23; p = Vector((WCX + math.cos(a) * (WR - .04), y, WZS + math.sin(a) * (WR - .04)))
        bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation(p) @ Matrix.Rotation(-a, 4, 'Y') @ Matrix.Diagonal((.07, .1, .16, 1)))
    obj_from_bm('arch_rim', bm, [fm], col=ROOM)
    # glass: barely there
    g = bpy.data.materials.new('glass'); g.use_nodes = True; P = g.node_tree.nodes['Principled BSDF']
    P.inputs['Transmission Weight'].default_value = 1; P.inputs['Roughness'].default_value = .02; P.inputs['IOR'].default_value = 1.05
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=.5, matrix=Matrix.Translation((WCX, y + .03, (WIN['z0'] + WIN['z1']) / 2)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((WIN['x1'] - WIN['x0'], WIN['z1'] - WIN['z0'], 1, 1)))
    gl = obj_from_bm('glass', bm, [g], col=ROOM); gl.visible_shadow = False; gl.hide_render = True
    # the night: a sky backdrop with stars and the moon, a hint of distant towers
    sky = bpy.data.materials.new('night'); sky.use_nodes = True; nt = sky.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Generated'], sep.inputs[0])
    gr = N.new('ShaderNodeValToRGB'); link(nt, sep.outputs['Y'], gr.inputs[0])
    gr.color_ramp.elements[0].color = (.012, .025, .06, 1); gr.color_ramp.elements[1].color = (.002, .005, .015, 1)
    vo = N.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 160; link(nt, tc.outputs['Generated'], vo.inputs['Vector'])
    st = N.new('ShaderNodeMapRange'); st.inputs[1].default_value = .05; st.inputs[2].default_value = 0; link(nt, vo.outputs['Distance'], st.inputs[0])
    pw = N.new('ShaderNodeMath'); pw.operation = 'POWER'; pw.inputs[1].default_value = 8; link(nt, st.outputs[0], pw.inputs[0])
    add = N.new('ShaderNodeMix'); add.data_type = 'RGBA'; add.blend_type = 'ADD'; link(nt, pw.outputs[0], add.inputs[0]); link(nt, gr.outputs[0], add.inputs[6]); add.inputs[7].default_value = (2, 2, 2.2, 1)
    em = N.new('ShaderNodeEmission'); em.inputs[1].default_value = 1.6; link(nt, add.outputs[2], em.inputs[0]); link(nt, em.outputs[0], N['Material Output'].inputs[0])
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=.5, matrix=Matrix.Translation((WCX, BACK + 3, 2.4)) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((9, 6, 1, 1)))
    me = bpy.data.meshes.new('sky'); bm.to_mesh(me); bm.free(); me.materials.append(sky)
    uv = me.uv_layers.new()
    o = bpy.data.objects.new('sky', me); ROOM.objects.link(o); o.visible_shadow = False
    # the moon
    moon_img = blu.portable(os.path.expanduser('~/projects/render-workspace/assets/moon.png'))
    mm = bpy.data.materials.new('moon'); mm.use_nodes = True; mnt = mm.node_tree; MN = mnt.nodes; MN.remove(MN['Principled BSDF'])
    t = MN.new('ShaderNodeTexImage'); t.image = moon_img; e = MN.new('ShaderNodeEmission'); e.inputs[1].default_value = 7
    link(mnt, MN.new('ShaderNodeTexCoord').outputs['UV'], t.inputs[0]); link(mnt, t.outputs[0], e.inputs[0]); link(mnt, e.outputs[0], MN['Material Output'].inputs[0])
    bm = bmesh.new(); bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=.42)
    me = bpy.data.meshes.new('moon'); bm.to_mesh(me); bm.free(); uvl = me.uv_layers.new()
    for l in me.loops: v = me.vertices[l.vertex_index].co; uvl.data[l.index].uv = (v.x / .84 + .5, v.y / .84 + .5)
    me.materials.append(mm); mo = bpy.data.objects.new('moon', me); ROOM.objects.link(mo)
    mo.location = (WCX + .55, BACK + 2.9, 3.25); mo.rotation_euler = (math.pi / 2, 0, 0); mo.visible_shadow = False
    # distant towers, a silhouette against the sky
    bm = bmesh.new()
    for (x, h, r) in [(-1.2, 1.6, .14), (-.7, 2.1, .2), (-.2, 1.5, .12), (.5, 2.4, .16), (1.1, 1.7, .12)]:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r, radius2=r, depth=h, matrix=Matrix.Translation((WCX + x * .7, BACK + 2.6, h * .55 / 2)) @ Matrix.Diagonal((.7, .7, .55, 1)))
        bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=r * 1.25, radius2=0, depth=r * 3, matrix=Matrix.Translation((WCX + x * .7, BACK + 2.6, h * .55 + r * 1.05)) @ Matrix.Diagonal((.7, .7, .7, 1)))
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((WCX, BACK + 2.65, .5)) @ Matrix.Diagonal((4, .1, 1.2, 1)))
    obj_from_bm('towers', bm, [mat('silhouette', (.004, .006, .012), .9)], col=ROOM).visible_shadow = False
window()
import drapes   # v19: crimson velvet curtains on a brass rod, tied back, stirred by a draught (loop-periodic)
drapes.drapes(ROOM, WIN, BACK, FRAMES, LOOP, FPS, GOLD, BRASS)

# ------------------------------------------------------------------ fireplace and fire
FIRE = Vector((-.7, BACK - .45, .1))
def fireplace():
    cx = FIRE.x; y = BACK - .32
    for (dx, sx) in ((-.78, .34), (.78, .34)): box('fp_jamb', (cx + dx, y, .65), (sx, .5, 1.3), STONE, ROOM)
    box('fp_lintel', (cx, y, 1.42), (1.9, .52, .3), STONE, ROOM)
    box('fp_mantel', (cx, y - .06, 1.62), (2.3, .66, .1), DARKWOOD, ROOM)
    soot = mat('soot', (.015, .012, .01), .95)
    box('fp_back', (cx, y + .1, .62), (1.25, .1, 1.25), soot, ROOM); box('fp_in_l', (cx - .6, y - .05, .62), (.04, .5, 1.25), soot, ROOM); box('fp_in_r', (cx + .6, y - .05, .62), (.04, .5, 1.25), soot, ROOM); box('fp_in_t', (cx, y - .05, 1.26), (1.25, .5, .04), soot, ROOM)
    box('fp_hearth', (cx, y - .35, .04), (2.1, .9, .08), DARKWOOD, ROOM)
    box('fp_chimney', (cx, y + .05, 2.9), (1.6, .4, 2.6), STONE, ROOM)
    if True:   # v17 cake stills, v19 book loop too: a glowing ember and log bed (cake: the page paints the flames; book: flame_vol)
        import embers; embers.build(ROOM, cx, FIRE.y, .08)
        for o in ROOM.objects:
            if o.name.startswith(('fp_back', 'fp_in_')): o.data.materials[0] = FBSTONE
    else:
        # logs
        logm = mat('log', (.06, .035, .02), .9)
        for i, (dx, rz) in enumerate([(-.2, .25), (.18, -.3), (0, 1.57)]):
            bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=10, radius1=.07, radius2=.06, depth=.6, matrix=Matrix.Translation((cx + dx, FIRE.y, .14 + i * .08)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
            obj_from_bm('log', bm, [logm], col=ROOM, smooth=True)
        # embers
        box('embers', (cx, FIRE.y, .1), (.7, .3, .04), emission_mat('embers', (1, .25, .04), 4), ROOM)
    # flames: crossed cards with a rising, flickering emission (4D noise drifting upward)
    fm = bpy.data.materials.new('flame'); fm.use_nodes = True; nt = fm.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    tc = N.new('ShaderNodeTexCoord'); mp = N.new('ShaderNodeMapping'); link(nt, tc.outputs['Generated'], mp.inputs[0]); mp.inputs['Scale'].default_value = (3, 1, 2)
    nz = N.new('ShaderNodeTexNoise'); nz.noise_dimensions = '4D'; nz.inputs['Scale'].default_value = 2.5; nz.inputs['Detail'].default_value = 4; link(nt, mp.outputs[0], nz.inputs['Vector'])
    for f, w in ((1, 0), (FRAMES, FRAMES / FPS * 2.2)):
        nz.inputs['W'].default_value = w; nz.inputs['W'].keyframe_insert('default_value', frame=f)
        mp.inputs['Location'].default_value = (0, 0, -w * .8); mp.inputs['Location'].keyframe_insert('default_value', frame=f)
    sep = N.new('ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Generated'], sep.inputs[0])
    shape = N.new('ShaderNodeMath'); shape.operation = 'SUBTRACT'; shape.inputs[0].default_value = 1; link(nt, sep.outputs['Z'], shape.inputs[1])
    cen = N.new('ShaderNodeMath'); cen.operation = 'SUBTRACT'; cen.inputs[1].default_value = .5; link(nt, sep.outputs['X'], cen.inputs[0])
    ab = N.new('ShaderNodeMath'); ab.operation = 'ABSOLUTE'; link(nt, cen.outputs[0], ab.inputs[0])
    side = N.new('ShaderNodeMath'); side.operation = 'MULTIPLY'; side.inputs[1].default_value = 2.4; link(nt, ab.outputs[0], side.inputs[0])
    m1 = N.new('ShaderNodeMath'); m1.operation = 'SUBTRACT'; link(nt, shape.outputs[0], m1.inputs[0]); link(nt, side.outputs[0], m1.inputs[1])
    m2 = N.new('ShaderNodeMath'); m2.operation = 'MULTIPLY_ADD'; m2.inputs[1].default_value = .9; link(nt, nz.outputs['Fac'], m2.inputs[0]); link(nt, m1.outputs[0], m2.inputs[2])
    rmp = N.new('ShaderNodeMapRange'); rmp.inputs[1].default_value = .55; rmp.inputs[2].default_value = 1.05; link(nt, m2.outputs[0], rmp.inputs[0])
    col = N.new('ShaderNodeValToRGB'); link(nt, rmp.outputs[0], col.inputs[0])
    col.color_ramp.elements[0].color = (.9, .12, .01, 1); col.color_ramp.elements[1].color = (1, .85, .45, 1)
    em = N.new('ShaderNodeEmission'); link(nt, col.outputs[0], em.inputs[0])
    st = N.new('ShaderNodeMath'); st.operation = 'MULTIPLY'; st.inputs[1].default_value = 3; link(nt, rmp.outputs[0], st.inputs[0]); link(nt, st.outputs[0], em.inputs[1])
    tr = N.new('ShaderNodeBsdfTransparent'); mix = N.new('ShaderNodeMixShader')
    gt = N.new('ShaderNodeMath'); gt.operation = 'POWER'; gt.inputs[1].default_value = .6; link(nt, rmp.outputs[0], gt.inputs[0])
    link(nt, gt.outputs[0], mix.inputs[0]); link(nt, tr.outputs[0], mix.inputs[1]); link(nt, em.outputs[0], mix.inputs[2]); link(nt, mix.outputs[0], N['Material Output'].inputs[0])
    # flame tongues: soft teardrops glowing orange at the root to pale gold at the tip, each flickering on its own
    tm = bpy.data.materials.new('tongue'); tm.use_nodes = True; nt = tm.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    tc = N.new('ShaderNodeTexCoord'); sp = N.new('ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Generated'], sp.inputs[0])
    cr = N.new('ShaderNodeValToRGB'); link(nt, sp.outputs['Z'], cr.inputs[0])
    cr.color_ramp.elements[0].color = (1, .16, .01, 1); cr.color_ramp.elements[1].color = (1, .62, .2, 1); cr.color_ramp.elements[1].position = .75
    em = N.new('ShaderNodeEmission'); em.inputs[1].default_value = 2.6; link(nt, cr.outputs[0], em.inputs[0])
    fr = N.new('ShaderNodeLayerWeight'); fr.inputs['Blend'].default_value = .45
    tr = N.new('ShaderNodeBsdfTransparent'); mx = N.new('ShaderNodeMixShader')
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; link(nt, fr.outputs['Facing'], inv.inputs[1])
    link(nt, inv.outputs[0], mx.inputs[0]); link(nt, tr.outputs[0], mx.inputs[1]); link(nt, em.outputs[0], mx.inputs[2]); link(nt, mx.outputs[0], N['Material Output'].inputs[0])
    rr = random.Random(5)
    for i in range(0):   # v19: no tongue cards (they rendered as pale cones); the book loop has flame_vol
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=10, radius=1)
        for v in bm.verts:
            z = (v.co.z + 1) / 2; k = (1 - z) ** .8 * (.35 + .65 * min(1, z * 4))
            v.co.x *= k; v.co.y *= k; v.co.z = z
        o = obj_from_bm('tongue', bm, [tm], col=ROOM, smooth=True); o.visible_shadow = False; o.visible_diffuse = False; o.visible_glossy = False  # the point lights do the lighting
        x0 = cx + rr.uniform(-.28, .28); h0 = rr.uniform(.22, .5) * (1.25 - abs(x0 - cx) * 1.6); w0 = rr.uniform(.05, .09)
        o.location = (x0, FIRE.y + rr.uniform(-.06, .06), .17)
        for f in range(1, FRAMES + 1, 2):
            t = f / FPS; n1 = noise.noise(Vector((t * 4.1, i * 3.7, 0))); n2 = noise.noise(Vector((t * 9.3, i * 1.3, 5)))
            o.scale = (w0 * (1 + .25 * n2), w0 * (1 + .25 * n2), h0 * (.8 + .35 * n1 + .15 * n2)); o.rotation_euler = (n2 * .15, n1 * .2, 0)
            o.keyframe_insert('scale', frame=f); o.keyframe_insert('rotation_euler', frame=f)
    # a faint ember glow inside the firebox
    eg = bpy.data.objects.new('ember_glow', bpy.data.lights.new('ember_glow', 'POINT')); ROOM.objects.link(eg)
    eg.data.energy = 18; eg.data.color = (1, .3, .06); eg.data.shadow_soft_size = .2; eg.location = (cx, FIRE.y, .25); eg.visible_camera = False
    eg.data.energy = 6; eg.location = (cx, FIRE.y - .38, .36)
    if not CAKE:   # v19 book loop: a volumetric flame over the embers, and its light low inside the firebox
        import drapes; _, FLAME_ST = drapes.fire(ROOM, cx, FIRE.y, .08, FRAMES, FPS)
        fl = bpy.data.objects.new('flame_core', bpy.data.lights.new('flame_core', 'POINT')); ROOM.objects.link(fl)
        fl.data.color = (1, .38, .08); fl.data.shadow_soft_size = .12; fl.location = (cx, FIRE.y - .05, .3); fl.visible_camera = False
        for f in range(1, FRAMES + 1, 2): fl.data.energy = 10 * FLAME_ST[f - 1]; fl.data.keyframe_insert('energy', frame=f)
    # firelight: two flickering points (baked keyframes)
    for i, (dx, e) in enumerate(((-.15, 170), (.2, 140))):
        L = bpy.data.objects.new('firelight', bpy.data.lights.new('firelight', 'POINT')); ROOM.objects.link(L)
        L.data.color = (1, .42, .12); L.data.shadow_soft_size = .3; L.location = (cx + dx, FIRE.y - .62, 1.0)
        for f in range(1, FRAMES + 1, 2):
            t = f / FPS; L.data.energy = e * (.75 + .18 * noise.noise(Vector((t * 3.1, i * 4.3, 0))) + .09 * noise.noise(Vector((t * 9.7, i, 2))))
            if not CAKE: L.data.energy = e * (FLAME_ST[f - 1] + .05 * noise.noise(Vector((t * 9.7, i, 2))))   # v19: the room's firelight follows the flame
            L.data.keyframe_insert('energy', frame=f)
        if True:   # the flames' room light passes the sooty inside of the firebox and the bed by (only the embers and flame_core light those)
            fbx = bpy.data.collections.new('firebox_dark')
            for o in ROOM.objects:
                if o.name.startswith(('fp_back', 'fp_in_', 'log', 'coals', 'ash_bed')): fbx.objects.link(o)
            L.light_linking.receiver_collection = fbx
            for co in fbx.collection_objects: co.light_linking.link_state = 'EXCLUDE'
fireplace()

# ------------------------------------------------------------------ shelves of books
BOOKC = [(.32, .07, .06), (.08, .16, .11), (.07, .09, .2), (.36, .24, .1), (.18, .05, .1), (.42, .33, .2), (.12, .1, .07), (.25, .2, .14)]
book_mats = []
for i, c in enumerate(BOOKC):
    m = mat(f'book{i}', c, .55)
    book_mats.append(m)
def fill_shelf(x0, x1, y, z, depth=.26, hmax=.34, rot=0, M=Matrix()):
    x = x0
    while x < x1 - .03:
        th = R.uniform(.025, .06); h = R.uniform(.2, hmax); lean = R.random() < .06
        if x + th > x1: break
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=M @ Matrix.Translation((x + th / 2, y, z + h / 2)) @ (Matrix.Rotation(.25, 4, 'Y') if lean else Matrix()) @ Matrix.Diagonal((th, depth * R.uniform(.8, 1), h, 1)))
        o = obj_from_bm('book', bm, [book_mats[R.randrange(len(book_mats))], GOLD], col=SHELF)
        # a thin gold band on some spines
        x += th + (.08 if lean else .002)
        if R.random() < .08: x += R.uniform(.05, .15)
SHELF = collection('Shelves')
def bookcase(x, w=1.5, h=3.2, y=BACK - .22, d=.42):
    # carcass
    box('bc_side', (x - w / 2, y, h / 2), (.05, d, h), DARKWOOD, SHELF); box('bc_side', (x + w / 2, y, h / 2), (.05, d, h), DARKWOOD, SHELF)
    box('bc_back', (x, y + d / 2 - .02, h / 2), (w, .03, h), DARKWOOD, SHELF); box('bc_top', (x, y, h), (w + .12, d + .06, .08), DARKWOOD, SHELF)
    n = 6
    for k in range(n):
        z = .12 + k * (h - .2) / n
        box('bc_shelf', (x, y, z), (w, d, .04), DARKWOOD, SHELF)
        if k < n - 1 or True: fill_shelf(x - w / 2 + .04, x + w / 2 - .04, y + .02, z + .02, depth=d * .7, hmax=min(.38, (h - .2) / n - .06))
bookcase(-2.35, 1.5); bookcase(-3.25, 1.4, y=-1.0, d=.4) if False else None
# left wall: a second bookcase facing into the room
bc = collection('bc2')
def side_bookcase():
    M = Matrix.Translation((-3.28, .6, 0)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
    w, h, d = 2.2, 3.4, .42
    for (cx, sx) in ((-w / 2, .05), (w / 2, .05)):
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=M @ Matrix.Translation((cx, 0, h / 2)) @ Matrix.Diagonal((sx, d, h, 1))); obj_from_bm('bc2', bm, [DARKWOOD], col=SHELF)
    for k in range(6):
        z = .12 + k * (h - .2) / 6
        bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=M @ Matrix.Translation((0, 0, z)) @ Matrix.Diagonal((w, d, .04, 1))); obj_from_bm('bc2s', bm, [DARKWOOD], col=SHELF)
        fill_shelf(-w / 2 + .04, w / 2 - .04, .02, z + .02, depth=d * .7, hmax=.4, M=M)
side_bookcase()

# ------------------------------------------------------------------ furniture (Poly Haven)
FURN = collection('Furniture')
def place(name, loc, rot=0, scale=1.0): return blu.import_gltf(name, loc, rot, scale, col=FURN)
place('ArmChair_01', (1.75, .55, 0), math.radians(200))
place('throw_pillows_01', (1.75, .55, .42), math.radians(200), .55)
place('potted_plant_01', (2.95, 2.45, 0), 0, 1.0)
place('potted_plant_01', (.75, 2.55, 0), 1.3, .8)
place('mantel_clock_01', (FIRE.x, BACK - .4, 1.67), math.pi)
place('brass_candleholders', (FIRE.x - .65, BACK - .4, 1.67), math.pi, .45)
place('ornate_mirror_01', (FIRE.x, BACK - .5, 2.45), 0, 1.5)
place('vintage_oil_lamp', (2.85, 1.0, .62), 0, .9)
box('side_table', (2.85, 1.0, .3), (.5, .5, .6), DARKWOOD, FURN)
place('Chandelier_01', (0, .3, H_ - .05), 0, 1.0)
place('fancy_picture_frame_01', (.75, BACK - .05, 2.3), 0, 1.0)
for k in range(3): place('book_encyclopedia_set_01', (-2.65, BACK - .3, 3.25 + .0), math.pi, .0001) if False else None
# rug before the fire
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=.5, matrix=Matrix.Translation((-.3, 1.0, .006)) @ Matrix.Diagonal((3.2, 2.2, 1, 1)))
def rug_mat():
    m = bpy.data.materials.new('rug_p'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; P = N['Principled BSDF']; P.inputs['Roughness'].default_value = .95
    tc = N.new('ShaderNodeTexCoord'); sep = N.new('ShaderNodeSeparateXYZ'); link(nt, tc.outputs['Generated'], sep.inputs[0])
    def edge(c):  # distance to the nearest edge along one axis, 0..0.5
        a = N.new('ShaderNodeMath'); a.operation = 'SUBTRACT'; a.inputs[1].default_value = .5; link(nt, c, a.inputs[0])
        b = N.new('ShaderNodeMath'); b.operation = 'ABSOLUTE'; link(nt, a.outputs[0], b.inputs[0])
        d = N.new('ShaderNodeMath'); d.operation = 'SUBTRACT'; d.inputs[0].default_value = .5; link(nt, b.outputs[0], d.inputs[1]); return d.outputs[0]
    mn = N.new('ShaderNodeMath'); mn.operation = 'MINIMUM'; link(nt, edge(sep.outputs['X']), mn.inputs[0]); link(nt, edge(sep.outputs['Y']), mn.inputs[1])
    ramp = N.new('ShaderNodeValToRGB'); link(nt, mn.outputs[0], ramp.inputs[0]); el = ramp.color_ramp.elements; ramp.color_ramp.interpolation = 'CONSTANT'
    el[0].position = 0; el[0].color = (.05, .05, .09, 1); el[1].position = .03; el[1].color = (.5, .33, .12, 1)
    for pos, c in ((.045, (.05, .06, .12, 1)), (.09, (.5, .33, .12, 1)), (.1, (.24, .03, .035, 1))): e = el.new(pos); e.color = c
    # a woven medallion pattern over the field
    vo = N.new('ShaderNodeTexWave'); vo.wave_type = 'RINGS'; vo.inputs['Scale'].default_value = 3; link(nt, tc.outputs['Generated'], vo.inputs['Vector'])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = .35; link(nt, ramp.outputs[0], mx.inputs[6]); link(nt, vo.outputs['Color'], mx.inputs[7])
    link(nt, mx.outputs[2], P.inputs['Base Color'])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 400; link(nt, tc.outputs['Object'], nz.inputs['Vector']); bp = N.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = .3; link(nt, nz.outputs['Fac'], bp.inputs['Height']); link(nt, bp.outputs[0], P.inputs['Normal'])
    return m
RUGM = rug_mat()
obj_from_bm('rug', bm, [RUGM], col=FURN)

# ------------------------------------------------------------------ warm lights: oil lamp, candles on the mantel, chandelier
def point(name, loc, e, col=(1, .6, .3), r=.05, frames=None):
    L = bpy.data.objects.new(name, bpy.data.lights.new(name, 'POINT')); s.collection.objects.link(L); L.location = loc
    L.data.energy = e; L.data.color = col; L.data.shadow_soft_size = r; L.visible_camera = False; L.visible_glossy = False; return L
point('oil_lamp', (2.85, 1.0, 1.05), 55, (1, .58, .28), .08)
for i, x in enumerate((-.65 - .2, -.65, -.65 + .2)): point('mantel_candle', (FIRE.x + x, BACK - .4, 2.05), 3, (1, .6, .3), .02)
point('chandelier', (0, .3, H_ - .7), 12, (1, .62, .34), .3)
# moonlight through the window
ml = bpy.data.objects.new('moonlight', bpy.data.lights.new('moonlight', 'AREA')); s.collection.objects.link(ml)
ml.data.shape = 'RECTANGLE'; ml.data.size = 1.4; ml.data.size_y = 2.4; ml.data.energy = 90; ml.data.color = (.55, .65, 1)
ml.location = (WCX, BACK + .5, 2.4); ml.rotation_euler = (math.radians(-80), 0, 0); ml.visible_camera = False; ml.visible_glossy = False; ml.visible_transmission = False
# room fill (very low) so shadows never go dead black
w = s.world; nt = w.node_tree; nt.nodes['Background'].inputs[0].default_value = (.03, .025, .03, 1); nt.nodes['Background'].inputs[1].default_value = .06

# ------------------------------------------------------------------ fairy lights: catenaries of tiny warm bulbs that twinkle
FAIRY = []
for g in range(3):
    m = emission_mat(f'fairy{g}', (1, .72, .36), 18)
    e = m.node_tree.nodes['Emission']
    for f in range(1, FRAMES + 1, 4):
        t = f / FPS; e.inputs[1].default_value = 18 * (.55 + .45 * (.5 + .5 * math.sin(t * (1.3 + g * .7) + g * 2)))
        e.inputs[1].keyframe_insert('default_value', frame=f)
    FAIRY.append(m)
def garland(p0, p1, sag, n, name):
    bm_list = []; bm = bmesh.new(); wire = bmesh.new()
    for i in range(n + 1):
        u = i / n; p = Vector(p0).lerp(Vector(p1), u) - Vector((0, 0, sag * 4 * u * (1 - u)))
        bmesh.ops.create_uvsphere(bm, u_segments=6, v_segments=4, radius=.018, matrix=Matrix.Translation(p))
        for f in bm.faces[-24:] if False else []: pass
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in FAIRY: me.materials.append(m)
    # assign each bulb (24 faces per sphere) to one of the three twinkle groups
    for k, p in enumerate(me.polygons): p.material_index = (k // 24) % 3
    o = bpy.data.objects.new(name, me); FURN.objects.link(o); o.visible_shadow = False
garland((WIN['x0'] - .1, BACK - .12, WZS + .2), (WIN['x1'] + .1, BACK - .12, WZS + .2), .35, 18, 'fairy_win')
garland((-3.4, BACK - .1, 3.6), (WIN['x0'] - .2, BACK - .1, 3.7), .45, 30, 'fairy_back')
garland((FIRE.x - 1.1, BACK - .7, 1.7), (FIRE.x + 1.1, BACK - .7, 1.7), .12, 16, 'fairy_mantel')
garland((-3.45, -1.5, 3.7), (-3.45, 1.8, 3.6), .4, 24, 'fairy_left')

# ------------------------------------------------------------------ the cake (cake variants): two tiers, sugar roses, pearls, gold stand, six candles
CANDLES = []
if CAKE:
    CK = collection('Cake'); TABLE = Vector((.15, -.55, 0))
    place('round_wooden_table_01', (TABLE.x, TABLE.y, 0), 0, .78)
    lo, hi = blu.bbox(bpy.data.objects['round_wooden_table_01']); top = hi.z
    import cake   # v17: the believable cake (tools/blender/cake.py), same dimensions and wick tips as v16
    CANDLES[:] = cake.build(CK, TABLE, top)
    # candle light (shown only in the lit stills)
    for i, c in enumerate(CANDLES): point(f'flame{i}', c + Vector((0, 0, .014)), 2.2, (1, .6, .25), .006).hide_render = True
    # a soft warm key over the table so the cake reads (its strength is set per still)
    key = bpy.data.objects.new('cake_key', bpy.data.lights.new('cake_key', 'AREA')); s.collection.objects.link(key)
    key.data.size = .6; key.data.energy = 10; key.data.color = (1, .78, .55)
    key.location = (TABLE.x - .5, TABLE.y - .6, top + .9); key.rotation_euler = (Vector((TABLE.x, TABLE.y, top)) - key.location).to_track_quat('-Z', 'Y').to_euler()
    key.visible_camera = False
    for n in ('chandelier', 'oil_lamp'): bpy.data.objects[n]['base_energy'] = bpy.data.objects[n].data.energy

# ------------------------------------------------------------------ cameras
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cam); s.camera = cam
cam.data.sensor_fit = 'AUTO'; cam.data.dof.use_dof = True
tgt = bpy.data.objects.new('aim', None); s.collection.objects.link(tgt)
con = cam.constraints.new('TRACK_TO'); con.target = tgt; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
if VAR == 'book':
    cam.data.lens = 24 if ORIENT == 'portrait' else 26
    cam.data.dof.focus_distance = 4.6; cam.data.dof.aperture_fstop = 2.8
    base, aim = Vector((.15, -3.05, 1.45)), Vector((.05, BACK, 1.55))
    for f in range(1, FRAMES + 1):
        u = (f - 1) / LOOP * 2 * math.pi   # a closed drift: one gentle ellipse per loop
        cam.location = base + Vector((.16 * math.sin(u), .22 * (1 - math.cos(u)) * .5, .05 * math.sin(2 * u))); cam.keyframe_insert('location', frame=f)
        tgt.location = aim + Vector((.1 * math.sin(u + .6), 0, .04 * math.sin(2 * u + .3))); tgt.keyframe_insert('location', frame=f)
else:
    TOP = CANDLES[0].z if CANDLES else 1.0
    cam.data.lens = 32 if ORIENT == 'portrait' else 30
    focus = Vector((TABLE.x, TABLE.y, TOP - .12))
    cam.location = Vector((TABLE.x - .05, TABLE.y - 1.25, TOP + .05)) if ORIENT == 'portrait' else Vector((TABLE.x - .1, TABLE.y - 1.05, TOP + .08))
    tgt.location = focus + Vector((0, 0, .12 if ORIENT == 'portrait' else .05))
    cam.data.dof.focus_object = None; cam.data.dof.focus_distance = (cam.location - focus).length; cam.data.dof.aperture_fstop = 2.2
    # the close-up for lighting the candles: the top tier fills the frame, seen a little from above
    cc = bpy.data.objects.new('cam_close', bpy.data.cameras.new('cam_close')); s.collection.objects.link(cc)
    cc.data.sensor_fit = 'AUTO'; cc.data.lens = 35; cc.data.dof.use_dof = True; cc.data.dof.aperture_fstop = 3.2
    row = Vector((TABLE.x, TABLE.y + .02, TOP - .03)); d, el = (.6, math.radians(16)) if ORIENT == 'portrait' else (.78, math.radians(14))
    cc.location = row + Vector((-.03, -d * math.cos(el), d * math.sin(el)))
    aimc = row + Vector((0, 0, -.06 if ORIENT == 'portrait' else -.035))
    cc.rotation_euler = (aimc - cc.location).to_track_quat('-Z', 'Y').to_euler(); cc.data.dof.focus_distance = (row - cc.location).length
s.frame_set(1)

# ------------------------------------------------------------------ the depth pass (a variant): view distance as grey, everything else off
if VAR == 'cake-depth':
    dm = bpy.data.materials.new('depth'); dm.use_nodes = True; nt = dm.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    cd = N.new('ShaderNodeCameraData'); mr = N.new('ShaderNodeMapRange'); mr.inputs[1].default_value = .3; mr.inputs[2].default_value = 9
    link(nt, cd.outputs['View Distance'], mr.inputs[0]); e = N.new('ShaderNodeEmission'); link(nt, mr.outputs[0], e.inputs[0]); link(nt, e.outputs[0], N['Material Output'].inputs[0])
    for o in bpy.data.objects:
        if o.type == 'MESH':
            o.data.materials.clear(); o.data.materials.append(dm)
            for ms in o.material_slots: ms.link = 'OBJECT'; ms.material = dm
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT': bpy.data.objects.remove(o)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0
    cam.data.dof.use_dof = False
    for o in ('glass', 'sky', 'moon', 'towers'):
        if o in bpy.data.objects: bpy.data.objects[o].hide_render = o == 'glass'
    s.cycles.samples = 16; s.cycles.use_denoising = False; s.view_settings.view_transform = 'Standard'
    s.render.image_settings.color_depth = '16'

# the window mask (a variant): the sky beyond the glass white, everything else black (same camera and focus blur)
if VAR == 'cake-mask':
    black = emission_mat('mask_black', (0, 0, 0), 0); white = emission_mat('mask_white', (1, 1, 1), 1)
    for o in bpy.data.objects:
        if o.type == 'MESH':
            m = white if o.name in ('sky', 'moon') else black
            o.data.materials.clear(); o.data.materials.append(m)
            for ms in o.material_slots: ms.link = 'OBJECT'; ms.material = m
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT': bpy.data.objects.remove(o)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0
    s.cycles.samples = 24; s.cycles.use_denoising = False; s.view_settings.view_transform = 'Standard'

# where the wicks land on screen (for the web's flames), for both cameras
if CAKE:
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    res = (1080, 1920) if ORIENT == 'portrait' else (1920, 1080)
    s.render.resolution_x, s.render.resolution_y = res
    out = {'res': res}
    for k, c_ in (('wicks', cam), ('wicks_close', bpy.data.objects['cam_close'])):
        pts = [world_to_camera_view(s, c_, c) for c in CANDLES]; out[k] = [[round(p.x, 5), round(1 - p.y, 5)] for p in pts]
        # the hearth (for reference): the ember bed's centre at log-top height and the opening's inner width
        fb = [world_to_camera_view(s, c_, Vector((FIRE.x + dx, FIRE.y, .2))) for dx in (0, -.6, .6)]
        out[k.replace('wicks', 'fire')] = [round(fb[0].x, 4), round(1 - fb[0].y, 4), round(fb[2].x - fb[1].x, 4)]
    json.dump(out, open(OUT.replace('.blend', '.wicks.json'), 'w'))

# ------------------------------------------------------------------ render settings
blu.make_portable_all(1024)
s.render.resolution_x, s.render.resolution_y = (1080, 1920) if ORIENT == 'portrait' else (1920, 1080)
if VAR not in ('cake-depth', 'cake-mask'):
    s.cycles.samples = 96; s.cycles.use_denoising = True
    s.view_settings.view_transform = 'AgX'; s.view_settings.look = 'AgX - Medium High Contrast'; s.view_settings.exposure = .8
s.cycles.max_bounces = 6; s.cycles.caustics_reflective = False; s.cycles.caustics_refractive = False
s.render.image_settings.file_format = 'PNG'
blu.save(OUT, (1, FRAMES))
