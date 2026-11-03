"""v22: two cupped hands, seen as she sees her own, catching a very small star and closing round it (the star-to-heart moment).
Nothing is modelled by hand: each finger is a chain of metaball spheres, posed from a curl value, so the frames are a real
close of the hands with the star's light inside them, shining through the fingers (subsurface, Cycles). No star is drawn:
the page draws it, at the point written to hands.json. Transparent background, so the frames sit over the painted night.

  blender -b -P hands.py -- OUT START END [STEP] [SPP] [W H]     (one of the A10s: CUDA, never the local GPU)
Frames 1-8: the open hands wait, moonlit; the star's light arrives. Frames 9-36: they close round it."""
import bpy, sys, math, json, os
from mathutils import Vector, Matrix, Euler
a = sys.argv[sys.argv.index('--') + 1:]; OUT, F0, F1 = a[0], int(a[1]), int(a[2]); STEP = int(a[3]) if len(a) > 3 else 1; SPP = int(a[4]) if len(a) > 4 else 256
RW, RH = (int(a[5]), int(a[6])) if len(a) > 6 else (800, 600); N = 36
os.makedirs(OUT, exist_ok=True)
def ease(x): x = max(0, min(1, x)); return x * x * (3 - 2 * x)
# fingers: knuckle (x, y), bone lengths, base radius (right hand, palm up, thumb toward +x, fingers along +y)
FING = {'index': ((.36, .98), (.46, .28, .23), .08), 'middle': ((.12, 1.05), (.50, .31, .24), .083), 'ring': ((-.13, 1.0), (.46, .29, .23), .078), 'pinky': ((-.35, .88), (.36, .22, .19), .066)}
def bones(c):
    """c 0..1: how far the hand has closed. Returns chains of (point, radius) in the hand's own space."""
    ch = {}
    bowl = .28 + .3 * c     # the palm itself cups across its width
    z = lambda x, y: bowl * x * x * 1.3 + .12 * (y - .5) ** 2 * (1 + c)
    for name, ((kx, ky), L, r) in FING.items():
        p = Vector((kx, ky, z(kx, ky))); ang = math.radians(12 + 12 * c); pts = [(p.copy(), r * 1.08)]; spread = kx * .1 * (1 - c * .6)
        curl = {'index': (34, 34, 22), 'middle': (40, 38, 24), 'ring': (44, 42, 26), 'pinky': (50, 46, 28)}[name]
        for i, l in enumerate(L):
            ang += math.radians(curl[i] * (.1 + .92 * (c - .3) / .6)); d = Vector((spread, math.cos(ang), math.sin(ang))).normalized()
            p = p + d * l; pts.append((p.copy(), r * (1 - .1 * (i + 1))))
        ch[name] = pts
    # the thumb: out from the heel of the hand, folding across as the hand closes
    p = Vector((.32, .24, z(.32, .24) + .03)); r = .094; pts = [(p.copy(), r * 1.3)]
    th = math.radians(62 - 40 * c); lift = math.radians(26 + 34 * c)
    for i, l in enumerate((.44, .34, .27)):
        d = Vector((math.sin(th), math.cos(th) * .86, math.sin(lift))).normalized(); p = p + d * l; pts.append((p.copy(), r * (1 - .13 * (i + 1)))); th -= math.radians(10 + 42 * c); lift += math.radians(4)
    ch['thumb'] = pts
    # the palm: metacarpals fanning from the wrist, and the two pads of the heel
    pm = []
    for name, ((kx, ky), _, r) in FING.items():
        w = Vector((kx * .42, .0, z(kx * .42, 0))); k = Vector((kx, ky, z(kx, ky))); pm.append([(w, .13), (w.lerp(k, .5) - Vector((0, 0, .02)), .125), (k, r * 1.25)])
    ch['palm'] = pm
    ch['wrist'] = [(Vector((0, -.05, z(0, 0) - .02)), .19), (Vector((0, -.55, -.02)), .15), (Vector((0, -1.6, -.08)), .19)]
    return ch
def blob(name, chains, mat, M):
    """one metaball family (they melt together) along the chains, turned into a mesh"""
    mb = bpy.data.metaballs.new(name); mb.resolution = .022; mb.render_resolution = .022; mb.threshold = .42; ob = bpy.data.objects.new(name, mb); bpy.context.collection.objects.link(ob)
    for ch in chains:
        for (p0, r0), (p1, r1) in zip(ch, ch[1:]):
            n = max(2, int((p1 - p0).length / (.32 * min(r0, r1))))
            for i in range(n + 1):
                u = i / n; e = mb.elements.new(); e.co = M @ p0.lerp(p1, u); e.radius = (r0 + (r1 - r0) * u) * 1.72; e.stiffness = 2
    bpy.context.view_layer.update(); dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); bpy.data.objects.remove(ob); bpy.data.metaballs.remove(mb)
    o = bpy.data.objects.new(name + 'm', me); bpy.context.collection.objects.link(o); me.materials.append(mat)
    for pl in me.polygons: pl.use_smooth = True
    return o
def hand(mat, side, c):
    """side: +1 right hand, -1 left. Wrist low in the frame, palm turned in and up, little fingers together in the middle."""
    k = (c - .3) / .6; roll = -math.radians(20 + 13 * k); yaw = math.radians(-3 + 8 * k)
    M = Matrix.Translation((side * (.6 - .03 * k), -.08, .16 + .08 * k)) @ Matrix.Scale(side, 4, (1, 0, 0)) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(roll, 4, 'Y') @ Matrix.Rotation(math.radians(16), 4, 'X')
    ch = bones(c); s = 'R' if side > 0 else 'L'; out = []
    for k in ('index', 'middle', 'ring', 'pinky', 'thumb'): out.append(blob(s + k, [ch[k]], mat, M))
    out.append(blob(s + 'palm', ch['palm'] + [ch['wrist']], mat, M)); return out
# ---- the scene
sc = bpy.context.scene
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
sc.render.engine = 'CYCLES'; sc.cycles.device = 'GPU'; sc.cycles.samples = SPP; sc.cycles.use_denoising = True; sc.cycles.max_bounces = 10; sc.cycles.diffuse_bounces = 4; sc.cycles.transmission_bounces = 6
pr = bpy.context.preferences.addons['cycles'].preferences; pr.compute_device_type = 'CUDA'; pr.get_devices()
for d in pr.devices: d.use = d.type == 'CUDA'
print('devices', [d.name for d in pr.devices if d.use], flush=True)
sc.render.resolution_x, sc.render.resolution_y = RW, RH; sc.render.film_transparent = True; sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'None'
w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.012, .016, .035, 1); w.node_tree.nodes['Background'].inputs[1].default_value = 1.6; sc.world = w
m = bpy.data.materials.new('skin'); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
b.inputs['Base Color'].default_value = (.9, .62, .5, 1); b.inputs['Roughness'].default_value = .46; b.inputs['Subsurface Weight'].default_value = 1; b.inputs['Subsurface Radius'].default_value = (1.0, .32, .14); b.inputs['Subsurface Scale'].default_value = .42; b.inputs['Specular IOR Level'].default_value = .42
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); bpy.context.collection.objects.link(cam); sc.camera = cam; cam.data.lens = 42; cam.location = (0, -1.0, 3.5)
tgt = Vector((0, .5, .3)); cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
STAR = Vector((0, .66, .5))
star = bpy.data.lights.new('star', 'POINT'); star.color = (1, .72, .4); star.shadow_soft_size = .05; so = bpy.data.objects.new('star', star); bpy.context.collection.objects.link(so); so.location = STAR
moon = bpy.data.lights.new('moon', 'AREA'); moon.size = 5; moon.color = (.52, .62, 1); mo = bpy.data.objects.new('moon', moon); bpy.context.collection.objects.link(mo); mo.location = (-2.6, 2.2, 4.4); mo.rotation_euler = (Vector((0, .6, 0)) - mo.location).to_track_quat('-Z', 'Y').to_euler(); moon.energy = 70
# where the page draws the star, as a fraction of the frame
from bpy_extras.object_utils import world_to_camera_view as w2c
bpy.context.view_layer.update(); uv = w2c(sc, cam, STAR); json.dump({'frames': N, 'w': RW, 'h': RH, 'star': [round(uv.x, 4), round(1 - uv.y, 4)]}, open(os.path.join(OUT, 'hands.json'), 'w')); print('star at', uv.x, 1 - uv.y, flush=True)
for f in range(F0, F1 + 1, STEP):
    u = (f - 1) / (N - 1); c = .3 + .1 * ease(f / 8) + .58 * ease((f - 9) / 27)    # open, a little more cupped as it lands, then closing
    star.energy = 15 * ease(f / 7) * (1 + 6 * ease((f - 9) / 27) ** 2)
    made = hand(m, 1, c) + hand(m, -1, c)
    sc.render.filepath = os.path.join(OUT, f'h{f:03d}.png'); bpy.ops.render.render(write_still=True); print('frame', f, flush=True)
    for o in made: me = o.data; bpy.data.objects.remove(o); bpy.data.meshes.remove(me)
print('DONE', flush=True)
