"""Renders the CC0 Quaternius horse (Ultimate Animated Animals, CC0) as passes for the painterly
compositor (tools/creatures/paint.py):

  albedo/   flat coat colours (emission), with alpha
  light/    lighting on a white coat: R = low sun behind (rim), G = key light, B = sky fill
  depth/    camera distance, for interior ink lines
  anchors.json  per-frame screen positions (0..1) of the bones the browser hangs the flowing mane,
                tail and hoof dust on

blender -b Horse.blend --python tools/creatures/render_horse.py -- <out-dir> <coat> <W> <H> <action:start:end[:step]> ...
coat: buckskin | paint
"""
import sys, json, math
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, COAT, W, H = argv[0], argv[1], int(argv[2]), int(argv[3])
CLIPS = [a.split(':') for a in argv[4:]]
scene = bpy.context.scene
for o in list(scene.objects):
    if o.type in ('CAMERA', 'LIGHT'): bpy.data.objects.remove(o)
arm = bpy.data.objects['AnimalArmature']; horse = bpy.data.objects['Horse']
arm.animation_data_create()
sub = horse.modifiers.new('Sub', 'SUBSURF'); sub.levels = sub.render_levels = 2
for p in horse.data.polygons: p.use_smooth = True

COATS = {
    # Main, Main_Dark (points), Main_Light (belly/muzzle), Hair, Muzzle, Hooves
    'buckskin': {'Main': (.42, .19, .055), 'Main_Dark': (.035, .025, .02), 'Main_Light': (.56, .31, .11), 'Hair': (.02, .016, .014), 'Muzzle': (.06, .045, .035), 'Hooves': (.05, .04, .03), 'Eye_White': (.9, .88, .85), 'Eye_Black': (.02, .015, .012)},
    'paint': {'Main': (.66, .6, .52), 'Main_Dark': (.5, .2, .07), 'Main_Light': (.7, .64, .56), 'Hair': (.14, .06, .03), 'Muzzle': (.55, .35, .3), 'Hooves': (.32, .25, .2), 'Eye_White': (.9, .88, .85), 'Eye_Black': (.02, .015, .012)},
}[COAT]
PATCH = (.3, .1, .03)  # chestnut patches on the paint coat


def emission_material(name, color, patches=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    N, L = m.node_tree.nodes, m.node_tree.links; N.clear()
    out = N.new('ShaderNodeOutputMaterial'); em = N.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    if patches:  # bold pinto patches that stay put on the coat (generated coordinates follow the rest pose)
        tc = N.new('ShaderNodeTexCoord'); nz = N.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = 2.2; nz.inputs['Detail'].default_value = 3; nz.inputs['Roughness'].default_value = .45
        L.new(tc.outputs['Generated'], nz.inputs['Vector'])
        ramp = N.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = .52; ramp.color_ramp.elements[0].color = (*color, 1)
        ramp.color_ramp.elements[1].position = .56; ramp.color_ramp.elements[1].color = (*PATCH, 1)
        L.new(nz.outputs['Fac'], ramp.inputs['Fac']); L.new(ramp.outputs['Color'], em.inputs['Color'])
    L.new(em.outputs['Emission'], out.inputs['Surface'])
    return m


originals = [s.material for s in horse.material_slots]
albedo = [emission_material('A_' + m.name, COATS.get(m.name, (.5, .5, .5)), patches=(COAT == 'paint' and m.name == 'Main')) for m in originals]
white = bpy.data.materials.new('White'); white.use_nodes = True
wb = white.node_tree.nodes['Principled BSDF']; wb.inputs['Base Color'].default_value = (.8, .8, .8, 1); wb.inputs['Roughness'].default_value = .85
depth = bpy.data.materials.new('Depth'); depth.use_nodes = True
dn, dl = depth.node_tree.nodes, depth.node_tree.links; dn.clear()
do = dn.new('ShaderNodeOutputMaterial'); de = dn.new('ShaderNodeEmission'); cd = dn.new('ShaderNodeCameraData'); mr = dn.new('ShaderNodeMapRange')
dl.new(cd.outputs['View Distance'], mr.inputs['Value']); dl.new(mr.outputs['Result'], de.inputs['Color']); dl.new(de.outputs['Emission'], do.inputs['Surface'])


def use(mats):
    for slot, m in zip(horse.material_slots, mats): slot.material = m


# ---------- lights: each in its own colour channel ----------
def sun(name, travel, energy, color, angle=2):
    """travel: the direction the light travels (from the sun toward the scene)."""
    d = bpy.data.lights.new(name, 'SUN'); d.energy = energy; d.color = color; d.angle = math.radians(angle)
    o = bpy.data.objects.new(name, d); scene.collection.objects.link(o)
    o.rotation_euler = Vector(travel).normalized().to_track_quat('-Z', 'Y').to_euler()
# the camera looks along +X and the horse runs toward +Y (screen right). The low sun sits behind the
# horse and a little ahead of it, so its light comes back toward the camera and only wraps the edges.
sun('Rim', (-.8, -.55, -.12), 7, (1, 0, 0))
sun('Key', (.55, -.35, -.75), 3.2, (0, 1, 0), 6)
world = bpy.data.worlds.new('W'); scene.world = world; world.use_nodes = True
bgn = world.node_tree.nodes['Background']; bgn.inputs['Color'].default_value = (0, 0, 1, 1); bgn.inputs['Strength'].default_value = .6

# ---------- camera: orthographic, a little low and a little in front, like a 2D layout ----------
cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); scene.collection.objects.link(cam)
cam.data.type = 'ORTHO'
arm.animation_data.action = bpy.data.actions['Gallop']; scene.frame_set(0)
L = horse.dimensions.y
center = Vector((0, 0, horse.dimensions.z * .52))
yaw, pitch = math.radians(14), math.radians(4)
cam.location = center + Vector((-math.cos(yaw) * math.cos(pitch), math.sin(yaw) * math.cos(pitch), math.sin(pitch))) * 30
cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
cam.data.ortho_scale = L * 1.38
cam.data.clip_end = 100
scene.camera = cam
mr.inputs['From Min'].default_value = 30 - L * .7; mr.inputs['From Max'].default_value = 30 + L * .7

scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.view_settings.view_transform = 'Standard'
scene.render.image_settings.file_format = 'PNG'; scene.render.image_settings.color_mode = 'RGBA'; scene.render.image_settings.color_depth = '16'
scene.cycles.use_denoising = False

BONES = {'withers': ('Neck1', 'head'), 'poll': ('Head', 'head'), 'nose': ('Head', 'tail'), 'crest': ('Neck2', 'head'), 'crest2': ('Neck3', 'head'),
         'tail': ('Tail1', 'head'), 'tail2': ('Tail3', 'head'), 'hoofFL': ('FrontLowerLeg.L', 'tail'), 'hoofFR': ('FrontLowerLeg.R', 'tail'),
         'hoofBL': ('BackLowerLeg.L', 'tail'), 'hoofBR': ('BackLowerLeg.R', 'tail')}
anchors = {}
for clip in CLIPS:
    name, a, b = clip[0], int(clip[1]), int(clip[2]); step = int(clip[3]) if len(clip) > 3 else 1
    arm.animation_data.action = bpy.data.actions[name]
    anchors[name] = []
    for f in range(a, b, step):
        scene.frame_set(f)
        pts = {}
        for k, (bone, end) in BONES.items():
            pb = arm.pose.bones[bone]; p = arm.matrix_world @ (pb.head if end == 'head' else pb.tail)
            v = world_to_camera_view(scene, cam, p); pts[k] = [round(v.x, 4), round(1 - v.y, 4)]
        anchors[name].append(pts)
        tag = f'{name}_{f:03d}'
        use(albedo); scene.cycles.samples = 6
        scene.render.filepath = f'{OUT}/albedo/{tag}.png'; bpy.ops.render.render(write_still=True)
        use([white] * len(originals)); scene.cycles.samples = 64; scene.cycles.use_denoising = True
        scene.render.filepath = f'{OUT}/light/{tag}.png'; bpy.ops.render.render(write_still=True)
        scene.cycles.use_denoising = False
        use([depth] * len(originals)); scene.cycles.samples = 4
        scene.render.filepath = f'{OUT}/depth/{tag}.png'; bpy.ops.render.render(write_still=True)
        print('FRAME', tag, flush=True)
json.dump({'size': [W, H], 'fps': scene.render.fps, 'clips': anchors}, open(f'{OUT}/anchors.json', 'w'))
print('DONE')
