"""The memories chapter's wall (v19), rendered on a CUDA GPU (never the CPU, unless 'preview' asks for a small look):
- plate: the study's plaster wall above a dark panelled dado, lit by a warm lamp from above and the fire low on the left
  (same materials, palette and view transform as tools/blender/study.py), with nothing hung on it;
- frames: four picture frames, each its own transparent sprite with a true contact shadow (a shadow catcher on the wall).
  The opening is left clear: the page lays the photograph behind the sprite, so the frame's shadow falls on the picture,
  and it hangs the sprites wherever suits the screen. Personal photographs never leave the VM.
  blender -b --factory-startup --python wall.py -- OUTDIR [plate] [frames] [spp=N] [res=PX] [preview]
Writes wall.png, frame-a..d.png and frames.json (each opening as fractions of its sprite)."""
import bpy, bmesh, math, os, sys, json
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blu
from blu import mat, mat_ph, link

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else 'wall-out'
opts = dict(a.split('=', 1) if '=' in a else (a, True) for a in argv[1:])
PREVIEW = 'preview' in opts
SPP = int(opts.get('spp', 192)); RES = int(opts.get('res', 2200)); FRES = int(opts.get('fres', 1100))
os.makedirs(OUT, exist_ok=True)

def scene():
    s = blu.empty_file(); s.render.film_transparent = False
    s.cycles.samples = SPP; s.cycles.use_denoising = True; s.cycles.max_bounces = 6; s.cycles.seed = 3
    s.view_settings.view_transform = 'AgX'; s.view_settings.look = 'AgX - Medium High Contrast'; s.view_settings.exposure = .8
    s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_mode = 'RGBA'
    w = s.world.node_tree.nodes['Background']; w.inputs[0].default_value = (.05, .03, .022, 1); w.inputs[1].default_value = .35
    if PREVIEW: s.cycles.device = 'CPU'; return s
    pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'CUDA'; pr.get_devices()
    gpus = [d for d in pr.devices if d.type == 'CUDA']
    if not gpus: raise SystemExit('no CUDA device: refusing to render on the CPU')
    for d in pr.devices: d.use = d.type == 'CUDA'
    s.cycles.device = 'GPU'; s.cycles.denoising_use_gpu = True; print('device CUDA', [d.name for d in gpus], flush=True)
    return s

def camera(s, width, cz, aspect=1.0):
    c = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(c); s.camera = c
    c.data.type = 'ORTHO'; c.data.ortho_scale = width * max(1, 1 / aspect) if aspect < 1 else width
    c.location = (0, -4, cz); c.rotation_euler = (math.pi / 2, 0, 0)
    return c

def area(s, name, loc, size, energy, color, aim=(0, 0, 1.4), shape='DISK'):
    l = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA')); s.collection.objects.link(l)
    l.data.shape = shape; l.data.size = size; l.data.energy = energy; l.data.color = color; l.location = loc
    l.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return l

def lights(s, top=62, fire=30, fill=7):
    """A warm lamp high and a little left, the fire low on the left, a dim bounce from the room (as in the study)."""
    area(s, 'lamp', (-.3, -1.15, 3.3), .9, top, (1, .72, .44), aim=(-.1, 0, 1.75))
    area(s, 'fire', (-3.3, -1.5, .32), 1.2, fire, (1, .4, .12))
    area(s, 'room', (1.6, -3.2, 1.5), 3, fill, (1, .68, .5))

def strip(name, verts_rings, material, closed=False, smooth=True):
    """Loft between rings of points (faces share verts along the ring, so the shading is smooth across the profile)."""
    bm = bmesh.new(); rows = [[bm.verts.new(p) for p in r] for r in verts_rings]
    n = len(rows[0])
    for a, b in zip(rows, rows[1:]):
        for i in range(n if closed else n - 1):
            j = (i + 1) % n; bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(material)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

# ---------------------------------------------------------------- the wall
def plate():
    s = scene(); W = 3.0
    s.render.resolution_x = s.render.resolution_y = 400 if PREVIEW else RES
    camera(s, W, 1.52); lights(s)
    plaster = mat_ph('plaster', 'plastered_wall_03', scale=.7, tint=(.5, .38, .27), bump=.5, size=2048)
    wood = mat_ph('darkwood', 'dark_wood', scale=.8, tint=(.46, .31, .21), bump=.25, rough_mul=.8, size=2048)
    cream = mat('rail', (.2, .11, .06), .42)
    # (built facing the camera in object space: the box projection reads the object's own normal)
    bm = bmesh.new(); vs = [bm.verts.new(v) for v in ((-3, 0, -.6), (3, 0, -.6), (3, 0, 3.8), (-3, 0, 3.8))]; bm.faces.new(vs); me = bpy.data.meshes.new('wall'); bm.to_mesh(me); bm.free()
    me.materials.append(plaster); o = bpy.data.objects.new('wall', me); s.collection.objects.link(o)
    # the dado: a skirting of dark panels with a moulded rail, low in the frame, so a tall screen has a floor of sorts
    H = .42
    def box(n, c, sz, m):
        bpy.ops.mesh.primitive_cube_add(size=1, location=c); b = bpy.context.object; b.name = n; b.scale = sz; b.data.materials.append(m); return b
    box('dado', (0, -.006, H / 2 - .1), (6, .012, H + .2), wood)
    box('rail', (0, -.022, H + .012), (6, .044, .036), cream); box('rail2', (0, -.012, H - .018), (6, .024, .012), wood)
    for k in range(-5, 6):
        x = k * .62
        for z, h in ((.1, .22),):
            box(f'pa{k}', (x, -.016, z), (.5, .01, h), wood)
            for dx, dz, sx, sz in ((0, h / 2 - .006, .5, .012), (0, -h / 2 + .006, .5, .012), (-.244, 0, .012, h), (.244, 0, .012, h)):
                box(f'pb{k}', (x + dx, -.02, z + dz), (sx, .008, sz), cream)
    s.render.filepath = os.path.join(OUT, 'wall.png'); bpy.ops.render.render(write_still=True); print('done wall', flush=True)

# ---------------------------------------------------------------- the frames
def gold(name, base=(.74, .49, .17), bole=(.32, .07, .04)):
    """Water gilding, worn: gold leaf rubbed through to its red bole here and there, a little darker in the hollows."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; P = N['Principled BSDF']
    tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 34; nz.inputs['Detail'].default_value = 7; nz.inputs['Roughness'].default_value = .62
    link(nt, tc.outputs['Object'], nz.inputs['Vector'])
    mr = N.new('ShaderNodeMapRange'); mr.inputs[1].default_value = .62; mr.inputs[2].default_value = .7; link(nt, nz.outputs['Fac'], mr.inputs[0])
    mx = N.new('ShaderNodeMix'); mx.data_type = 'RGBA'; link(nt, mr.outputs[0], mx.inputs['Factor']); mx.inputs[6].default_value = (*base, 1); mx.inputs[7].default_value = (*bole, 1)
    link(nt, mx.outputs[2], P.inputs['Base Color'])
    me = N.new('ShaderNodeMath'); me.operation = 'SUBTRACT'; me.inputs[0].default_value = 1; link(nt, mr.outputs[0], me.inputs[1]); link(nt, me.outputs[0], P.inputs['Metallic'])
    P.inputs['Roughness'].default_value = .34
    b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = .3; b.inputs['Distance'].default_value = .002; link(nt, nz.outputs['Fac'], b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    return m

def moulding(name, ow, oh, profile, material):
    """Sweeps profile [(out, depth), ...] around the opening ow x oh. Four mitred sides, smooth across the profile."""
    for side in range(4):
        rings = []
        for out, d in profile:
            x, z = ow / 2 + out, oh / 2 + out
            a, b = {0: ((-x, z), (x, z)), 1: ((x, z), (x, -z)), 2: ((x, -z), (-x, -z)), 3: ((-x, -z), (-x, z))}[side]
            rings.append([(a[0], -d, a[1]), (b[0], -d, b[1])])
        strip(f'{name}{side}', rings, material)

def ring_flat(name, x0, z0, x1, z1, y, material):
    """A flat band between two rectangles (half sizes), at depth y."""
    bm = bmesh.new()
    a = [(-x0, z0), (x0, z0), (x0, -z0), (-x0, -z0)]; b = [(-x1, z1), (x1, z1), (x1, -z1), (-x1, -z1)]
    A = [bm.verts.new((p[0], -y, p[1])) for p in a]; B = [bm.verts.new((p[0], -y, p[1])) for p in b]
    for i in range(4):
        j = (i + 1) % 4; bm.faces.new((A[i], A[j], B[j], B[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(material)
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

def beads(name, ow, oh, out, depth, r, material):
    """A row of pearl beading around the frame (a classic gilt detail)."""
    bm = bmesh.new(); x, z = ow / 2 + out, oh / 2 + out; pts = []
    for (ax, az), (bx, bz) in (((-x, z), (x, z)), ((x, z), (x, -z)), ((x, -z), (-x, -z)), ((-x, -z), (-x, z))):
        n = max(2, int(math.hypot(bx - ax, bz - az) / (r * 2.3)))
        pts += [(ax + (bx - ax) * i / n, az + (bz - az) * i / n) for i in range(n)]
    for px, pz in pts:
        bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r, matrix=Matrix.Translation((px, -depth, pz)))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(material)
    for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); return o

W_ = (.40, .30); T_ = (.30, .40)   # the openings: one landscape, three upright
FR = {
  # k: opening, mat width, moulding profile [(out, depth)...] (metres, from the mat's outer edge), material kind
  'a': dict(o=W_, m=.035, kind='gilt', p=[(0, .006), (.002, .02), (.008, .03), (.018, .036), (.03, .034), (.043, .024), (.052, .03), (.06, .022), (.064, .004)]),
  'b': dict(o=T_, m=.05, kind='walnut', p=[(0, .006), (.002, .022), (.01, .026), (.022, .024), (.036, .03), (.044, .028), (.05, .006)]),
  'c': dict(o=T_, m=.07, kind='black', p=[(0, .005), (.002, .018), (.006, .021), (.016, .021), (.02, .017), (.022, .004)]),
  'd': dict(o=T_, m=.022, kind='thin', p=[(0, .005), (.001, .018), (.007, .026), (.016, .028), (.024, .02), (.028, .004)]),
}

def frame(k, f):
    s = scene(); s.render.film_transparent = True
    ow, oh = f['o']; mw, P = f['m'], f['p']; tw = ow + 2 * (mw + P[-1][0]); th = oh + 2 * (mw + P[-1][0])
    pad = .11; cw, ch = tw + 2 * pad, th + 2 * pad
    s.render.resolution_x = round((360 if PREVIEW else FRES) * (cw / max(cw, ch))); s.render.resolution_y = round((360 if PREVIEW else FRES) * (ch / max(cw, ch)))
    cam = camera(s, max(cw, ch), 0, 1); lights(s, top=40, fire=14, fill=12)
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0)); bpy.context.object.is_shadow_catcher = True
    # the cream mat with a bevelled window, sitting in the rebate
    paper = mat('mat', (.86, .81, .72), .8); core = mat('core', (.92, .89, .82), .6)
    ix, iz = ow / 2, oh / 2; bx, bz = ix + mw, iz + mw
    ring_flat('mat', ix + .0016, iz + .0016, bx + .002, bz + .002, .008, paper)
    strip('bevel', [[(-ix - .0016, -.008, iz + .0016), (ix + .0016, -.008, iz + .0016), (ix + .0016, -.008, -iz - .0016), (-ix - .0016, -.008, -iz - .0016)],
                    [(-ix, -.0045, iz), (ix, -.0045, iz), (ix, -.0045, -iz), (-ix, -.0045, -iz)]], core, closed=True, smooth=False)
    kind = f['kind']; Q = [(mw + a, b) for a, b in P]
    if kind == 'gilt':
        g = gold('gilt'); moulding('mld', ow, oh, Q, g)
        beads('pearl', ow, oh, mw + .0475, .029, .0034, g); beads('pearl2', ow, oh, mw + .0035, .021, .0018, g)
    elif kind == 'walnut':
        w = mat_ph('walnut', 'dark_wood', scale=2.2, tint=(.34, .2, .12), bump=.15, rough_mul=.55, size=1024); moulding('mld', ow, oh, Q, w)
        beads('slip', ow, oh, mw + .0022, .021, .0014, gold('slipg'))
    elif kind == 'black':
        moulding('mld', ow, oh, Q, mat('lacquer', (.016, .012, .012), .24)); beads('slip', ow, oh, mw + .0016, .018, .001, gold('slipg'))
    else:
        moulding('mld', ow, oh, Q, gold('thin', (.7, .5, .24), (.2, .09, .05)))
    ring_flat('back', bx + .001, bz + .001, bx + P[-1][0], bz + P[-1][0], .002, mat('backing', (.02, .014, .01), .8))
    s.render.filepath = os.path.join(OUT, f'frame-{k}.png'); bpy.ops.render.render(write_still=True); print('done frame', k, flush=True)
    return dict(w=s.render.resolution_x, h=s.render.resolution_y, opening=[(cw / 2 - ow / 2) / cw, (ch / 2 - oh / 2) / ch, ow / cw, oh / ch], size=[round(tw, 4), round(th, 4)], pad=[pad / cw, pad / ch])

if 'plate' in opts or not ('frames' in opts): plate()
if 'frames' in opts or not ('plate' in opts):
    meta = {k: frame(k, f) for k, f in FR.items()}
    json.dump(meta, open(os.path.join(OUT, 'frames.json'), 'w'), indent=1); print(json.dumps(meta)[:400], flush=True)
