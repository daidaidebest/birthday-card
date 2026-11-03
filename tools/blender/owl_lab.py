"""Owl-only test bench: blender -b --factory-startup --python owl_lab.py -- t=5.4 out=PNG [nohair] [view=front|side|cam]"""
import bpy, math, sys, os
from mathutils import Vector, Quaternion
sys.path.insert(0, os.path.expanduser('~/projects/render-workspace/tools'))
import blu
from blu import mat, obj_from_bm, collection, link, emission_mat
argv = sys.argv[sys.argv.index('--') + 1:]; OPT = dict(a.split('=', 1) for a in argv if '=' in a)
s = blu.empty_file(); FPS, FRAMES = 24, 336; PORT = True; PREVIEW = 'nohair' in argv
bpy.context.preferences.edit.keyframe_new_interpolation_type = 'LINEAR'
MOON_DIR = Vector((-.2, .9, .45)).normalized()
def cam_matrix(t):
    p = Vector((0, -100 + t * 10, 100)); q = (MOON_DIR).to_track_quat('-Z', 'Y'); return p, q.to_matrix()
w = s.world.node_tree.nodes['Background']; w.inputs[0].default_value = (.02, .03, .06, 1)
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'owl.py')).read())
moon = bpy.data.objects.new('moonlight', bpy.data.lights.new('moonlight', 'SUN')); s.collection.objects.link(moon); moon.data.energy = .95; moon.data.color = (.66, .75, 1)
moon.rotation_euler = (-MOON_DIR).to_track_quat('-Z', 'Y').to_euler()
t = float(OPT.get('t', 5.4)); s.frame_set(int(t * FPS)); cp, B = cam_matrix(t)
c = bpy.data.objects.new('c', bpy.data.cameras.new('c')); s.collection.objects.link(c); s.camera = c; c.data.lens = 50
tgt = root.matrix_world.to_translation(); view = OPT.get('view', 'cam')
d = {'cam': (cp - tgt).normalized(), 'front': root.matrix_world.to_3x3() @ Vector((0, 1, -.2)), 'side': root.matrix_world.to_3x3() @ Vector((1, 0, .1)), 'top': root.matrix_world.to_3x3() @ Vector((0, -.3, 1))}[view].normalized()
c.location = tgt + d * 2.4; c.rotation_euler = (tgt - c.location).to_track_quat('-Z', 'Y').to_euler()
s.render.resolution_x = s.render.resolution_y = int(OPT.get('px', 420)); s.cycles.samples = int(OPT.get('spp', 24)); s.cycles.device = 'CPU'
s.view_settings.view_transform = 'AgX'; s.view_settings.exposure = 1.25
s.render.filepath = OPT['out']; bpy.ops.render.render(write_still=True)
