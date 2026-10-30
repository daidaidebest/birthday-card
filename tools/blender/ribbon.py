"""The prologue's satin ribbon and bow in Cycles: tied still + the untie as an RGBA sequence over the envelope.
Geometry and motion come from tools/blender/ribbon_sim.py (pure numpy); this file builds the scene.
  blender -b --factory-startup --python tools/blender/ribbon.py -- still out=PNG [res=1000] [spp=256] [look] [cpu]
  blender -b --factory-startup --python tools/blender/ribbon.py -- build out=BLEND [sim=NPZ]     (packed, for the GPU)
  blender -b --factory-startup --python tools/blender/ribbon.py -- frames out=DIR [sim=NPZ] [res=] [spp=] [f=a-b[:step]]
res = the envelope's width in pixels; the frame covers the CANVAS rectangle below (envelope units), transparent,
with the ribbon's contact shadow on the envelope (shadow catcher) and the envelope occluding what wraps behind it.
'look' renders the envelope itself too (to judge the light against the parchment)."""
import bpy, sys, os, math, time
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import importlib, ribbon_sim as R
importlib.reload(R)
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
ENV_IMG = os.path.join(ROOT, 'site', 'assets', 'img', 'env-back.webp')

# the frame, in envelope coordinates (the page positions the canvas with the same numbers: tools -> ribbon.json)
CANVAS = dict(x0=-.56 * R.EW, x1=.56 * R.EW, y0=-R.EH / 2 - .070, y1=.004)

args = dict(a.split('=', 1) if '=' in a else (a, True) for a in sys.argv[sys.argv.index('--') + 2:]) if '--' in sys.argv else {}
mode = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else 'still'


def satin():
    """Double-face satin: long floats along the ribbon (anisotropic sheen along the weave, UV u = along), soft fibre
    sheen at grazing angles, matte woven selvedges, a fine streaky weave, a slow dye variation. No coat: coat is what
    makes ribbon look like plastic."""
    m = bpy.data.materials.new('satin'); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; Lk = nt.links.new
    P = N['Principled BSDF']; P.location = (400, 0)
    uv = N.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'; uv.location = (-1200, 0)
    sep = N.new('ShaderNodeSeparateXYZ'); Lk(uv.outputs[0], sep.inputs[0]); sep.location = (-1000, 0)
    tg = N.new('ShaderNodeTangent'); tg.direction_type = 'UV_MAP'; tg.uv_map = 'UVMap'; Lk(tg.outputs[0], P.inputs['Tangent'])
    # selvedge mask (1 at the woven edges)
    def mth(op, a, b=None, loc=(0, 0)):
        n = N.new('ShaderNodeMath'); n.operation = op; n.location = loc
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: Lk(v, n.inputs[i])
        return n.outputs[0]
    v = sep.outputs[1]; u = sep.outputs[0]
    edge = mth('MINIMUM', v, mth('SUBTRACT', 1., v))
    selv = mth('MAXIMUM', mth('SUBTRACT', 1., mth('MULTIPLY', edge, 20.)), 0.)
    # fine weave streaks: long along the ribbon, fine across it
    cmb = N.new('ShaderNodeCombineXYZ'); Lk(mth('MULTIPLY', u, 2.2), cmb.inputs[0]); Lk(mth('MULTIPLY', v, 150.), cmb.inputs[1])
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.; nz.inputs['Detail'].default_value = 3; Lk(cmb.outputs[0], nz.inputs['Vector'])
    bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .12; bump.inputs['Distance'].default_value = .00003
    sel_b = mth('MULTIPLY', selv, .6)
    hsum = mth('ADD', nz.outputs[0], sel_b); Lk(hsum, bump.inputs['Height']); Lk(bump.outputs[0], P.inputs['Normal'])
    # dye: a slow variation along the length
    cmb2 = N.new('ShaderNodeCombineXYZ'); Lk(mth('MULTIPLY', u, .18), cmb2.inputs[0]); Lk(mth('MULTIPLY', v, .5), cmb2.inputs[1])
    nz2 = N.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 1.; nz2.inputs['Detail'].default_value = 1; Lk(cmb2.outputs[0], nz2.inputs['Vector'])
    ramp = N.new('ShaderNodeValToRGB'); Lk(nz2.outputs[0], ramp.inputs[0])
    C0, C1 = COLORS['base0'], COLORS['base1']
    ramp.color_ramp.elements[0].position = .35; ramp.color_ramp.elements[0].color = (*C0, 1)
    ramp.color_ramp.elements[1].position = .65; ramp.color_ramp.elements[1].color = (*C1, 1)
    mixc = N.new('ShaderNodeMix'); mixc.data_type = 'RGBA'; mixc.blend_type = 'MULTIPLY'
    Lk(selv, mixc.inputs['Factor']); Lk(ramp.outputs[0], mixc.inputs['A']); mixc.inputs['B'].default_value = (*COLORS['selvedge'], 1)
    Lk(mixc.outputs['Result'], P.inputs['Base Color'])
    Lk(mth('ADD', mth('MULTIPLY', selv, .22), COLORS['rough']), P.inputs['Roughness'])
    P.inputs['Anisotropic'].default_value = COLORS['aniso']
    P.inputs['Specular IOR Level'].default_value = COLORS['spec_level']
    P.inputs['Specular Tint'].default_value = (*COLORS['spec'], 1)
    P.inputs['Sheen Weight'].default_value = COLORS['sheen_w']; P.inputs['Sheen Roughness'].default_value = .32
    P.inputs['Sheen Tint'].default_value = (*COLORS['sheen'], 1)
    P.inputs['Subsurface Weight'].default_value = .0
    return m


# dusty rose silk: deep enough to read against the parchment at night, never candy pink (linear RGB)
COLORS = dict(base0=(.205, .078, .092), base1=(.235, .090, .102), selvedge=(.86, .82, .83), spec=(1., .84, .82),
              sheen=(1., .80, .80), rough=.36, aniso=.6, spec_level=.5, sheen_w=.3)


def lin(c):  # sRGB 0..255 -> linear
    c = np.array(c) / 255.; return tuple(np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4))


def make_mesh(name, V, F, uv):
    me = bpy.data.meshes.new(name); me.from_pydata(V.tolist(), [], F.tolist()); me.update()
    ul = me.uv_layers.new(name='UVMap'); li = np.zeros(len(me.loops), int); me.loops.foreach_get('vertex_index', li)
    ul.data.foreach_set('uv', uv[li].astype(np.float32).ravel())
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob)
    so = ob.modifiers.new('thick', 'SOLIDIFY'); so.thickness = R.RT; so.offset = 0; so.use_even_offset = False; so.use_rim = True; so.use_quality_normals = False
    return ob


def scene(res, spp, look=False, gpu=False):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'
    sc.cycles.device = 'GPU' if gpu else 'CPU'
    sc.cycles.samples = spp; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = .01
    sc.cycles.use_denoising = True
    try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except TypeError: print('no OIDN here (VM CPU build): rendering without the denoiser'); sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 8; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 3; sc.cycles.transparent_max_bounces = 8
    sc.cycles.sample_clamp_indirect = 4.
    sc.render.film_transparent = True
    cw, ch = CANVAS['x1'] - CANVAS['x0'], CANVAS['y1'] - CANVAS['y0']
    sc.render.resolution_x = round(cw / R.EW * res); sc.render.resolution_y = round(ch / R.EW * res); sc.render.resolution_percentage = 100
    sc['env_px'] = res
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '8'
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.fps = R.FPS
    # world: the night around her, dim and blue
    w = bpy.data.worlds.new('night'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (.020, .026, .045, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.
    # camera: straight down onto the flap side, orthographic (the page shows the envelope flat)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(cw, ch); cam.data.sensor_fit = 'AUTO'
    cam.location = ((CANVAS['x0'] + CANVAS['x1']) / 2, (CANVAS['y0'] + CANVAS['y1']) / 2, .5); cam.data.clip_end = 2
    # the envelope: a slab that catches the ribbon's shadow and hides what wraps behind it
    me = bpy.data.meshes.new('env'); hx, hy = R.EW / 2, R.EH / 2
    vs = [(-hx, -hy, -R.ET), (hx, -hy, -R.ET), (hx, hy, -R.ET), (-hx, hy, -R.ET), (-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0)]
    fs = [(4, 5, 6, 7), (3, 2, 1, 0), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    me.from_pydata(vs, [], fs); me.update()
    ul = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            x, y, z = vs[me.loops[li].vertex_index]; ul.data[li].uv = ((x + hx) / R.EW, (y + hy) / R.EH)
    env = bpy.data.objects.new('envelope', me); sc.collection.objects.link(env)
    em = bpy.data.materials.new('parchment'); em.use_nodes = True; nt = em.node_tree
    img = bpy.data.images.load(ENV_IMG); tx = nt.nodes.new('ShaderNodeTexImage'); tx.image = img; tx.interpolation = 'Cubic'
    P = nt.nodes['Principled BSDF']; nt.links.new(tx.outputs['Color'], P.inputs['Base Color']); P.inputs['Roughness'].default_value = .85
    P.inputs['Specular IOR Level'].default_value = .25
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mix = nt.nodes.new('ShaderNodeMixShader'); out = nt.nodes['Material Output']
    nt.links.new(tx.outputs['Alpha'], mix.inputs[0]); nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(P.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs[0])
    env.data.materials.append(em)
    env.is_shadow_catcher = not look
    # light: a broad soft key from above-left (the same light the parchment is painted in), a cool moon rim from
    # the upper right, a low warm candle kick from the lower left (the glow that breathes beside the envelope)
    K = np.array([0, R.KY, 0])
    def area(name, pos, energy, color, size, shape='DISK'):
        L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.color = color; L.shape = shape; L.size = size
        ob = bpy.data.objects.new(name, L); sc.collection.objects.link(ob); ob.location = tuple(K + np.array(pos))
        from mathutils import Vector
        d = -np.array(pos, float); d /= np.linalg.norm(d); ob.rotation_mode = 'QUATERNION'
        ob.rotation_quaternion = Vector((-d).tolist()).to_track_quat('Z', 'Y')   # area lights shine along -Z
        return ob
    area('key', (-.10, .22, .34), LIGHT['key'], (1., .95, .88), .30)
    rims = [area('moon', (.24, .16, .07), LIGHT['moon'], (.70, .80, 1.), .08), area('candle', (-.20, -.15, .045), LIGHT['candle'], (1., .72, .48), .06)]
    # the low rim lights only touch the ribbon: their long grazing shadows would streak across the whole envelope
    rc = bpy.data.collections.new('rim_receivers')
    for L in rims: L.light_linking.receiver_collection = rc
    return sc


LIGHT = dict(key=5.5, moon=1.6, candle=1.4)
for k in list(COLORS) + list(LIGHT):          # quick look tweaks from the command line: aniso=-.6 key=4 ...
    if k in args:
        v = tuple(float(x) for x in args[k].split(','))
        (COLORS if k in COLORS else LIGHT)[k] = v[0] if len(v) == 1 else v


def ribbon_object(ch, name='ribbon'):
    V, F, uv = R.strip(ch['X'], ch['D'], ch['G'], ch['PL'])
    ob = make_mesh(name, V, F, uv); ob.data.materials.append(satin())
    bpy.data.collections['rim_receivers'].objects.link(ob)
    return ob


def render(sc, path):
    sc.render.filepath = path; t = time.time(); bpy.ops.render.render(write_still=True); print('rendered', path, '%.1fs' % (time.time() - t), flush=True)


def visible_frames(S):
    """Last frame with any ribbon inside the canvas (in front of the envelope or below it)."""
    last = 0
    for f in range(len(S['X'])):
        X = S['X'][f]; inside = (X[:, 1] > CANVAS['y0'] - R.RW) & (X[:, 0] > CANVAS['x0'] - R.RW) & (X[:, 0] < CANVAS['x1'] + R.RW)
        if inside.any(): last = f
    return last


def load_sim(path):
    if path and os.path.exists(path):
        z = np.load(path); return {k: z[k] for k in z.files}
    S = R.simulate(R.build_chain(R.design()), log=True)
    if path: np.savez_compressed(path, **S)
    return S


def animated(sc, S, f_end):
    """The ribbon with one shape key per frame (linear in time between neighbours, so motion blur sees the real path)."""
    ch = R.build_chain(R.design())
    ob = ribbon_object(dict(X=S['X'][0], D=S['D'][0], G=S['G'][0], PL=S['PL'][0], tags=ch['tags']))
    bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
    ob.shape_key_add(name='Basis', from_mix=False)
    for f in range(1, f_end + 1):
        V, F, uv = R.strip(S['X'][f], S['D'][f], S['G'][f], S['PL'][f])
        k = ob.shape_key_add(name='f%03d' % f, from_mix=False); k.data.foreach_set('co', V.astype(np.float32).ravel())
        for fr, val in ((f - 1, 0.), (f, 1.), (f + 1, 0.)):
            k.value = val; k.keyframe_insert('value', frame=fr)
        k.value = 0.
    sc.frame_start, sc.frame_end = 0, f_end
    sc.render.use_motion_blur = True; sc.render.motion_blur_shutter = .5
    return ob


if mode in ('build', 'frames'):
    res = int(args.get('res', 1000)); spp = int(args.get('spp', 160))
    sc = scene(res, spp, gpu=mode == 'build')
    S = load_sim(args.get('sim')); f_end = min(visible_frames(S) + 1, len(S['X']) - 1)
    print('frames 0 ..', f_end, flush=True)
    animated(sc, S, f_end)
    if mode == 'build':
        sc.cycles.use_denoising = True                       # OIDN is set by ribbon_gpu.py on the A10 (this VM's build has none)
        bpy.ops.file.pack_all(); bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args['out']), compress=True)
        print('saved', args['out'])
    else:
        spec = args.get('f', '0-%d' % f_end)
        r, st = (spec.split(':') + ['1'])[:2]; a, b = map(int, r.split('-'))
        os.makedirs(args['out'], exist_ok=True)
        for f in range(a, min(b, f_end) + 1, int(st)):
            sc.frame_set(f); render(sc, os.path.join(os.path.abspath(args['out']), 'f_%04d.png' % f))

if mode == 'still':
    res = int(args.get('res', 1000)); spp = int(args.get('spp', 256))
    sc = scene(res, spp, look='look' in args)
    ch = R.build_chain(R.design()); ribbon_object(ch)
    if 'blend' in args: bpy.ops.wm.save_as_mainfile(filepath=args['blend'])
    render(sc, os.path.abspath(args['out']))
