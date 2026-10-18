"""A poured crimson wax seal, rendered in Blender (Cycles) from a height map, top-down on a transparent ground.
  python3 tools/seal_blender.py height           → writes the height map (needs Pillow, numpy, scipy)
  blender -b -P tools/seal_blender.py -- render  → site/assets/img/seal.webp via a PNG
The impression is original: a crescent moon cradling a little constellation of three glints, under an arc of seven tiny stars."""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__)); HMAP = os.path.join(HERE, '..', 'depth', 'seal-height.png'); PNG = os.path.join(HERE, '..', 'depth', 'seal.png')
N = 1024
mode = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else sys.argv[1]

if mode == 'height':
    import numpy as np
    from PIL import Image, ImageDraw
    from scipy.ndimage import gaussian_filter
    r = np.random.RandomState(5); yy, xx = (np.mgrid[0:N, 0:N] - N / 2) / (N / 2)
    ang, rad = np.arctan2(yy, xx), np.hypot(xx, yy)
    wob = sum(r.rand() * .035 / k * np.sin(k * ang + r.rand() * 6) for k in range(2, 9))   # the poured, uneven edge
    R = .86 + wob
    blob = np.clip((R - rad) / .05, 0, 1)
    dome = np.sqrt(np.clip(1 - (rad / R) ** 2, 0, 1)) * .55                                # wax pooled into a low dome
    press_r = .62; inside = rad < press_r
    rim = np.exp(-((rad - press_r - .06) / .07) ** 2) * .35                                # wax squeezed up around the stamp
    h = dome + rim
    h = np.where(inside, .38 + .02 * gaussian_filter(r.randn(N, N), 6), h)                # the flat pressed field
    em = Image.new('L', (N, N), 0); d = ImageDraw.Draw(em); c = N / 2
    d.ellipse([c - 230, c - 230, c + 230, c + 230], fill=255); d.ellipse([c - 150, c - 280, c + 290, c + 160], fill=0)  # crescent
    def star(x, y, ro, ri):
        pts = [(x + (ro if k % 2 == 0 else ri) * math.sin(k * math.pi / 5), y - (ro if k % 2 == 0 else ri) * math.cos(k * math.pi / 5)) for k in range(10)]
        d.polygon(pts, fill=255)
    def sparkle(x, y, ro, ri):                                                            # a four-point glint
        d.polygon([(x + (ro if k % 2 == 0 else ri) * math.sin(k * math.pi / 4), y - (ro if k % 2 == 0 else ri) * math.cos(k * math.pi / 4)) for k in range(8)], fill=255)
    sparkle(c + 60, c - 70, 58, 13); sparkle(c + 120, c + 30, 34, 8); sparkle(c + 20, c + 60, 26, 6)  # a small constellation in its curve
    for k in range(7):                                                                    # an arc of small stars over the top
        a = -math.pi / 2 + (k - 3) * .4; star(c + 268 * math.cos(a), c + 268 * math.sin(a), 26, 11)
    d.ellipse([c - 300, c - 300, c + 300, c + 300], outline=255, width=10)                  # the stamp's border ring
    emb = gaussian_filter(np.asarray(em, float) / 255, 3)
    h = h + np.where(inside | (rad < press_r + .03), emb * .16, 0)
    h = gaussian_filter(h, 1.2) * blob
    Image.fromarray((np.clip(h / h.max(), 0, 1) * 65535).astype(np.uint16)).save(HMAP)
    print('height map', HMAP)

else:
    import bpy
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = 96; sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 640; sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.filepath = PNG
    sc.view_settings.view_transform = 'Standard'
    bpy.ops.mesh.primitive_plane_add(size=2); ob = bpy.context.object
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.subdivide(number_cuts=255); bpy.ops.object.mode_set(mode='OBJECT')
    ss = ob.modifiers.new('s', 'SUBSURF'); ss.subdivision_type = 'SIMPLE'; ss.levels = ss.render_levels = 2  # fine enough for the small stars
    img = bpy.data.images.load(HMAP); img.colorspace_settings.name = 'Non-Color'
    tex = bpy.data.textures.new('h', 'IMAGE'); tex.image = img; tex.extension = 'CLIP'
    dm = ob.modifiers.new('d', 'DISPLACE'); dm.texture = tex; dm.texture_coords = 'UV'; dm.strength = .16; dm.mid_level = 0
    bpy.ops.object.shade_smooth()
    m = bpy.data.materials.new('wax'); m.use_nodes = True; nt = m.node_tree; P = nt.nodes['Principled BSDF']
    P.inputs['Base Color'].default_value = (.15, .006, .012, 1); P.inputs['Roughness'].default_value = .26
    P.inputs['Subsurface Weight'].default_value = .22; P.inputs['Subsurface Radius'].default_value = (.6, .1, .08); P.inputs['Subsurface Scale'].default_value = .05
    P.inputs['Coat Weight'].default_value = .4; P.inputs['Coat Roughness'].default_value = .18
    # outside the poured blob the plane is see-through
    tc = nt.nodes.new('ShaderNodeTexCoord'); it = nt.nodes.new('ShaderNodeTexImage'); it.image = img; it.extension = 'CLIP'
    mr = nt.nodes.new('ShaderNodeMapRange'); mr.inputs['From Min'].default_value = .002; mr.inputs['From Max'].default_value = .02
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mix = nt.nodes.new('ShaderNodeMixShader'); out = nt.nodes['Material Output']
    nt.links.new(tc.outputs['UV'], it.inputs['Vector']); nt.links.new(it.outputs['Color'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], mix.inputs['Fac']); nt.links.new(tr.outputs[0], mix.inputs[1]); nt.links.new(P.outputs[0], mix.inputs[2]); nt.links.new(mix.outputs[0], out.inputs['Surface'])
    ob.data.materials.append(m)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = 2.02; cam.location = (0, 0, 5)
    def light(name, loc, energy, size, color):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, 'AREA')); sc.collection.objects.link(l)
        l.location = loc; l.data.energy = energy; l.data.size = size; l.data.color = color
        l.rotation_euler = (0, 0, 0); d = [-c for c in loc]; import mathutils; l.rotation_euler = mathutils.Vector(d).to_track_quat('-Z', 'Y').to_euler()
    light('key', (-2.4, 2.6, 2.2), 260, 1.6, (1, .86, .7))       # warm candlelight from the upper left
    light('fill', (2.5, -1.5, 3), 60, 4, (.85, .9, 1))
    light('rim', (2.2, 2.4, .6), 120, 1, (1, .8, .6))
    bpy.ops.render.render(write_still=True); print('rendered', PNG)
