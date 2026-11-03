"""Shared Blender helpers for the birthday-card scenes (run inside Blender).
The local GPU renderer rejects images that carry a file path, even packed ones: portable() copies a file's
pixels into a generated, packed image instead."""
import bpy, bmesh, math, random, os
from mathutils import Vector, Matrix, noise

PH = os.path.expanduser('~/projects/render-workspace/assets/ph')

def empty_file():
    bpy.ops.wm.read_homefile(use_empty=True)
    s = bpy.context.scene
    s.render.engine = 'CYCLES'; s.render.filepath = '//'
    w = bpy.data.worlds.new('World'); s.world = w; w.use_nodes = True
    return s

_cache = {}
def portable(path, noncolor=False, size=None):
    key = (path, noncolor, size)
    if key in _cache: return _cache[key]
    src = bpy.data.images.load(path)
    if size and src.size[0] > size: src.scale(size, size * src.size[1] // src.size[0])
    w, h = src.size
    im = bpy.data.images.new(os.path.basename(os.path.dirname(path)) + '_' + os.path.basename(path).split('.')[0], w, h, alpha=False)
    if noncolor: im.colorspace_settings.name = 'Non-Color'
    buf = [0.0] * (w * h * 4); src.pixels.foreach_get(buf); im.pixels.foreach_set(buf)
    im.pack(); bpy.data.images.remove(src)
    _cache[key] = im; return im

def ph_tex(name, f, noncolor=False, size=None):
    for ext in ('jpg', 'png'):
        p = os.path.join(PH, name, f + '.' + ext)
        if os.path.exists(p): return portable(p, noncolor, size)
    return None

def link(nt, a, b): nt.links.new(a, b)

def mat_ph(name, tex, scale=.25, tint=(1, 1, 1), bump=.6, rough_mul=1.0, size=1024, emission=None, extra=None):
    """Principled material from a Poly Haven texture set, box-projected in world space (no UVs needed)."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes
    P = N['Principled BSDF']
    geo = N.new('ShaderNodeNewGeometry'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale, scale, scale)
    link(nt, geo.outputs['Position'], mp.inputs['Vector'])
    def tx(img):
        t = N.new('ShaderNodeTexImage'); t.image = img; t.projection = 'BOX'; t.projection_blend = .35; link(nt, mp.outputs[0], t.inputs[0]); return t
    d = tx(ph_tex(tex, 'Diffuse', size=size))
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    link(nt, d.outputs[0], mix.inputs[6]); mix.inputs[7].default_value = (*tint, 1)
    link(nt, mix.outputs[2], P.inputs['Base Color'])
    r_img = ph_tex(tex, 'Rough', True, size=size)
    if r_img:
        r = tx(r_img); mm = N.new('ShaderNodeMath'); mm.operation = 'MULTIPLY'; mm.inputs[1].default_value = rough_mul
        link(nt, r.outputs[0], mm.inputs[0]); link(nt, mm.outputs[0], P.inputs['Roughness'])
    h_img = ph_tex(tex, 'Displacement', True, size=size)
    if h_img:
        h = tx(h_img); b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = bump; b.inputs['Distance'].default_value = .05
        link(nt, h.outputs[0], b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    if extra: extra(m, nt, P, mp)
    return m

def mat(name, color, rough=.5, metal=0, emit=None, strength=0, alpha=1, trans=0):
    m = bpy.data.materials.new(name); m.use_nodes = True; P = m.node_tree.nodes['Principled BSDF']
    P.inputs['Base Color'].default_value = (*color, 1); P.inputs['Roughness'].default_value = rough; P.inputs['Metallic'].default_value = metal
    if emit: P.inputs['Emission Color'].default_value = (*emit, 1); P.inputs['Emission Strength'].default_value = strength
    if trans: P.inputs['Transmission Weight'].default_value = trans
    return m

def emission_mat(name, color, strength):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; N.remove(N['Principled BSDF'])
    e = N.new('ShaderNodeEmission'); e.inputs[0].default_value = (*color, 1); e.inputs[1].default_value = strength
    link(nt, e.outputs[0], N['Material Output'].inputs[0]); return m

def obj_from_bm(name, bm, mats=(), col=None, smooth=False):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for m in mats: me.materials.append(m)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me); (col or bpy.context.scene.collection).objects.link(ob); return ob

def collection(name, parent=None):
    c = bpy.data.collections.new(name); (parent or bpy.context.scene.collection).children.link(c); return c

def save(path, frames=None):
    s = bpy.context.scene
    for i in list(bpy.data.images):
        if i.type in ('RENDER_RESULT', 'COMPOSITING'): bpy.data.images.remove(i)
    if frames: s.frame_start, s.frame_end = frames
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print('saved', path, os.path.getsize(path) // 1024, 'KB')

def make_portable_all(maxsize=1024):
    """Every image loaded from a file (e.g. by a glTF import) -> a generated, packed copy with no path."""
    for im in list(bpy.data.images):
        if im.source != 'FILE' or im.type != 'IMAGE': continue
        try:
            if im.size[0] == 0: im.reload()
            if im.size[0] > maxsize: im.scale(maxsize, max(1, maxsize * im.size[1] // im.size[0]))
            w, h = im.size
            nw = bpy.data.images.new(im.name + '_p', w, h, alpha=True)
            nw.colorspace_settings.name = im.colorspace_settings.name
            buf = [0.0] * (w * h * 4); im.pixels.foreach_get(buf); nw.pixels.foreach_set(buf); nw.pack()
            nw.alpha_mode = im.alpha_mode
            im.user_remap(nw); bpy.data.images.remove(im)
        except Exception as e:
            print('portable failed', im.name, e)

def import_gltf(name, loc=(0, 0, 0), rot=0, scale=1.0, col=None, res='1k'):
    """Imports a Poly Haven model; returns a parent empty placed at loc (z rotation rot)."""
    d = os.path.join(PH, name); f = [x for x in os.listdir(d) if x.endswith('.gltf')][0]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(d, f))
    new = [o for o in bpy.data.objects if o not in before]
    root = bpy.data.objects.new(name, None); (col or bpy.context.scene.collection).objects.link(root)
    for o in new:
        if o.parent is None: o.parent = root
        if col:
            for c in list(o.users_collection): c.objects.unlink(o)
            col.objects.link(o)
    root.location = loc; root.rotation_euler = (0, 0, rot); root.scale = (scale, scale, scale)
    return root

def bbox(root):
    """World-space bounds of an imported hierarchy."""
    bpy.context.view_layer.update()
    pts = []
    for o in [root] + list(root.children_recursive):
        if o.type == 'MESH': pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
    if not pts: return Vector(), Vector()
    return Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))), Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
