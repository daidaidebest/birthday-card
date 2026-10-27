"""Renders the cake stills from a cake-base study file (run on the render machine):
blender -b cake-base_ORIENT.blend --python cake_variants.py -- OUTDIR ORIENT [spp]
Wide: unlit, lit, after, mask (window glass white). Close: unlit, lit."""
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]; OUT, ORIENT = argv[0], argv[1]; SPP = int(argv[2]) if len(argv) > 2 else 96
s = bpy.context.scene; os.makedirs(OUT, exist_ok=True)
s.cycles.device = 'GPU'
pr = bpy.context.preferences.addons['cycles'].preferences
for kind in ('CUDA', 'OPTIX'):
    try:
        pr.compute_device_type = kind; pr.get_devices(); gpus = [d for d in pr.devices if d.type == kind]
        if not gpus: continue
        for d in pr.devices: d.use = d.type == kind
        print('device', kind, flush=True); break
    except Exception: pass
else: raise SystemExit('no GPU device')
s.render.resolution_x, s.render.resolution_y = (1080, 1920) if ORIENT == 'portrait' else (1920, 1080)
KEY = {'unlit': 6, 'lit': 10, 'after': 16}
def lamps(k):
    for n in ('chandelier', 'oil_lamp'):
        o = bpy.data.objects[n]; b = o['base_energy']
        o.data.energy = {'after': {'chandelier': 140, 'oil_lamp': 70}[n], 'unlit': b * .5}.get(k, b)
def shot(name, cam, k):
    s.camera = bpy.data.objects[cam]; lamps(k); bpy.data.objects['cake_key'].data.energy = KEY[k]
    for i in range(6): bpy.data.objects[f'flame{i}'].hide_render = k != 'lit'
    s.cycles.samples = SPP; s.cycles.use_denoising = True
    s.view_settings.view_transform = 'AgX'; s.view_settings.look = 'AgX - Medium High Contrast'; s.view_settings.exposure = .8
    s.render.image_settings.file_format = 'PNG'; s.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True); print('done', name, flush=True)
for k in ('unlit', 'lit'): shot(f'close-{k}', 'cam_close', k)
for k in ('unlit', 'lit', 'after'): shot(f'wide-{k}', 'cam', k)
# the window mask: sky and moon white, everything else black, same camera and focus blur
black = bpy.data.materials.new('mask_black'); black.use_nodes = True; white = bpy.data.materials.new('mask_white'); white.use_nodes = True
for m, v in ((black, 0), (white, 1)):
    N = m.node_tree.nodes; N.remove(N['Principled BSDF']); e = N.new('ShaderNodeEmission'); e.inputs[0].default_value = (v, v, v, 1); e.inputs[1].default_value = v
    m.node_tree.links.new(e.outputs[0], N['Material Output'].inputs[0])
for o in bpy.data.objects:
    if o.type == 'MESH':
        m = white if o.name in ('sky', 'moon') else black
        o.data.materials.clear(); o.data.materials.append(m)
        for ms in o.material_slots: ms.link = 'OBJECT'; ms.material = m
    if o.type == 'CURVES': o.hide_render = True
for o in list(bpy.data.objects):
    if o.type == 'LIGHT': bpy.data.objects.remove(o)
s.world.node_tree.nodes['Background'].inputs[1].default_value = 0
s.camera = bpy.data.objects['cam']; s.cycles.samples = 24; s.cycles.use_denoising = False; s.view_settings.view_transform = 'Standard'; s.view_settings.look = 'None'
s.render.filepath = os.path.join(OUT, 'wide-mask.png'); bpy.ops.render.render(write_still=True); print('done wide-mask', flush=True)
