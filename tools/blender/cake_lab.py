"""Cake test bench (CPU previews only): the cake alone on a dark table, seen by the study's close-up camera, lit by
the same key / firelight / candle lights as the cake stills.
blender -b --factory-startup --python cake_lab.py -- OUT.png ORIENT [lit] [res=0.3] [spp=24] [crop=x0,y0,x1,y1] [cam=close|wide]"""
import bpy, sys, os, math
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blu, cake
from blu import mat, obj_from_bm, collection
import bmesh

argv = sys.argv[sys.argv.index('--') + 1:]; OUT, ORIENT = argv[0], argv[1]
opt = dict(a.split('=') for a in argv[2:] if '=' in a); LIT = 'lit' in argv
s = blu.empty_file(); CK = collection('Cake'); TABLE = Vector((.15, -.55, 0)); top = .7829
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=64, radius1=.62, radius2=.62, depth=.04, matrix=Matrix.Translation((TABLE.x, TABLE.y, top - .02)))
obj_from_bm('table', bm, [mat('tablewood', (.12, .06, .03), .35)], smooth=True)
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=4, matrix=Matrix.Translation((0, 2.9, 1.5)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
obj_from_bm('wall', bm, [mat('wall', (.35, .25, .17), .8)])
C = cake.build(CK, TABLE, top)
def point(name, loc, e, col, r):
    L = bpy.data.objects.new(name, bpy.data.lights.new(name, 'POINT')); s.collection.objects.link(L); L.location = loc
    L.data.energy = e; L.data.color = col; L.data.shadow_soft_size = r; L.visible_camera = False; L.visible_glossy = False; return L
for i, (dx, e) in enumerate(((-.15, 170), (.2, 140))): point('firelight', (-.7 + dx, 2.55 - .62, 1.0), e * .8, (1, .42, .12), .3)
point('chandelier', (0, .3, 3.5), 6, (1, .62, .34), .3)
if LIT:
    for i, c in enumerate(C): point(f'flame{i}', c + Vector((0, 0, .014)), float(opt.get('fe', 2.2)), (1, .6, .25), .006)
key = bpy.data.objects.new('cake_key', bpy.data.lights.new('cake_key', 'AREA')); s.collection.objects.link(key)
key.data.size = .6; key.data.energy = 6; key.data.color = (1, .78, .55); key.location = (TABLE.x - .5, TABLE.y - .6, top + .9)
key.rotation_euler = (Vector((TABLE.x, TABLE.y, top)) - key.location).to_track_quat('-Z', 'Y').to_euler(); key.visible_camera = False
w = s.world; w.node_tree.nodes['Background'].inputs[0].default_value = (.03, .025, .03, 1); w.node_tree.nodes['Background'].inputs[1].default_value = .06
TOP = C[0].z
if opt.get('cam', 'close') == 'close':
    cc = bpy.data.objects.new('cam_close', bpy.data.cameras.new('cam_close')); s.collection.objects.link(cc)
    cc.data.sensor_fit = 'AUTO'; cc.data.lens = 35; cc.data.dof.use_dof = True; cc.data.dof.aperture_fstop = 3.2
    row = Vector((TABLE.x, TABLE.y + .02, TOP - .03)); d, el = (.6, math.radians(16)) if ORIENT == 'portrait' else (.78, math.radians(14))
    cc.location = row + Vector((-.03, -d * math.cos(el), d * math.sin(el)))
    aimc = row + Vector((0, 0, -.06 if ORIENT == 'portrait' else -.035))
    cc.rotation_euler = (aimc - cc.location).to_track_quat('-Z', 'Y').to_euler(); cc.data.dof.focus_distance = (row - cc.location).length
else:
    cc = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); s.collection.objects.link(cc)
    cc.data.lens = 32 if ORIENT == 'portrait' else 30; focus = Vector((TABLE.x, TABLE.y, TOP - .12))
    cc.location = Vector((TABLE.x - .05, TABLE.y - 1.25, TOP + .05)) if ORIENT == 'portrait' else Vector((TABLE.x - .1, TABLE.y - 1.05, TOP + .08))
    aim = focus + Vector((0, 0, .12 if ORIENT == 'portrait' else .05)); cc.rotation_euler = (aim - cc.location).to_track_quat('-Z', 'Y').to_euler()
s.camera = cc
from bpy_extras.object_utils import world_to_camera_view
res = (1080, 1920) if ORIENT == 'portrait' else (1920, 1080); s.render.resolution_x, s.render.resolution_y = res
bpy.context.view_layer.update()
print('WICKS', [[round(p.x, 5), round(1 - p.y, 5)] for p in (world_to_camera_view(s, cc, c) for c in C)])
s.render.resolution_percentage = int(float(opt.get('res', .3)) * 100)
if 'crop' in opt:
    x0, y0, x1, y1 = map(float, opt['crop'].split(',')); s.render.use_border = True; s.render.use_crop_to_border = True
    s.render.border_min_x, s.render.border_min_y, s.render.border_max_x, s.render.border_max_y = x0, 1 - y1, x1, 1 - y0
s.cycles.device = 'CPU'; s.cycles.samples = int(opt.get('spp', 24)); s.cycles.use_denoising = True; s.cycles.max_bounces = 6
s.view_settings.view_transform = 'AgX'; s.view_settings.look = 'AgX - Medium High Contrast'; s.view_settings.exposure = .8
s.render.filepath = OUT; bpy.ops.render.render(write_still=True)
