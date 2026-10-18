"""Quick look test: one gallop frame of the CC0 Quaternius horse, golden-hour lit, transparent background.
blender -b Horse.blend --python tools/creatures/horse_test.py -- <out.png> <action> <frame> [subsurf]
"""
import sys, math
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, ACTION, FRAME = argv[0], argv[1], int(argv[2])
SUB = int(argv[3]) if len(argv) > 3 else 2
scene = bpy.context.scene
for o in list(scene.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o)
arm = bpy.data.objects['AnimalArmature']; horse = bpy.data.objects['Horse']
arm.animation_data_create(); arm.animation_data.action = bpy.data.actions[ACTION]
scene.frame_set(FRAME)
if SUB:
    m = horse.modifiers.new('Sub', 'SUBSURF'); m.levels = m.render_levels = SUB
for p in horse.data.polygons: p.use_smooth = True

# a buckskin coat with black points
coat = {'Main': (.42, .2, .075), 'Main_Dark': (.2, .085, .03), 'Main_Light': (.62, .38, .17), 'Hair': (.018, .014, .012), 'Muzzle': (.05, .035, .025), 'Hooves': (.03, .025, .02)}
for mat in horse.data.materials:
    mat.use_nodes = True
    b = mat.node_tree.nodes.get('Principled BSDF')
    if not b: continue
    if mat.name in coat: b.inputs['Base Color'].default_value = (*coat[mat.name], 1)
    b.inputs['Roughness'].default_value = .62
    b.inputs['Sheen Weight'].default_value = .5; b.inputs['Sheen Roughness'].default_value = .35
    b.inputs['Sheen Tint'].default_value = (1, .8, .55, 1)

def sun(name, rot, energy, color, angle=3):
    d = bpy.data.lights.new(name, 'SUN'); d.energy = energy; d.color = color; d.angle = math.radians(angle)
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o); o.rotation_euler = [math.radians(a) for a in rot]
sun('Back', (75, 0, 120), 6, (1, .62, .3))     # low sun behind and to the side: hot rim along the back
sun('Key', (55, 0, -60), 2.2, (1, .82, .6))
world = bpy.data.worlds.new('W'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (.35, .3, .4, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = .5

cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam)
cam.data.lens = 85
center = sum((horse.matrix_world @ Vector(c) for c in horse.bound_box), Vector()) / 8
cam.location = center + Vector((-9, 0, .5)) * max(horse.dimensions) / 2.6
cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
scene.camera = cam
scene.render.engine = 'CYCLES'; scene.cycles.samples = 48; scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = 640, 480
scene.view_settings.view_transform = 'AgX'
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('RENDERED', OUT, horse.dimensions[:])
