"""Renders the cake stills from a cake-base study file (run on the render machine, CUDA only):
blender -b cake-base_ORIENT.blend --python cake_variants.py -- OUTDIR ORIENT [spp] [pass_spp]
Wide: unlit, lit, after, mask (window glass white). Close: unlit, lit.
v17: 'lit' is exactly 'unlit' plus the six candle flames (no other light changes), so the page can light candles one by
one: pass-base and pass-0..5 (half resolution, 16-bit) are the close-up with no candle / only candle i lit, rendered
with the same seed; the web passes D_i = pass-i - pass-base (display space) are made from them offline (cake_passes.py)."""
import bpy, sys, os
argv = sys.argv[sys.argv.index('--') + 1:]; OUT, ORIENT = argv[0], argv[1]
SPP = int(argv[2]) if len(argv) > 2 else 128; PSPP = int(argv[3]) if len(argv) > 3 else 320
s = bpy.context.scene; os.makedirs(OUT, exist_ok=True)
s.cycles.device = 'GPU'
pr = bpy.context.preferences.addons['cycles'].preferences
pr.compute_device_type = 'CUDA'; pr.get_devices(); gpus = [d for d in pr.devices if d.type == 'CUDA']   # OPTIX silently falls back to CPU here
if not gpus: raise SystemExit('no CUDA device')
for d in pr.devices: d.use = d.type == 'CUDA'
print('device CUDA', [d.name for d in gpus], flush=True)
RES = (1080, 1920) if ORIENT == 'portrait' else (1920, 1080)
KEY = {'unlit': 6, 'lit': 6, 'after': 16}
FLAME = 2.6
def lamps(k):
    for n in ('chandelier', 'oil_lamp'):
        o = bpy.data.objects[n]; b = o['base_energy']
        o.data.energy = {'after': {'chandelier': 140, 'oil_lamp': 70}[n]}.get(k, b * .5)
def look():
    s.view_settings.view_transform = 'AgX'; s.view_settings.look = 'AgX - Medium High Contrast'; s.view_settings.exposure = .8
    s.cycles.seed = 0; s.cycles.use_animated_seed = False
def shot(name, cam, k, lit=None, spp=SPP, half=False, depth='8'):
    """lit: which candles burn (None: all for 'lit', none otherwise)."""
    s.camera = bpy.data.objects[cam]; lamps(k); bpy.data.objects['cake_key'].data.energy = KEY[k]
    on = set(range(6)) if (lit is None and k == 'lit') else set(lit or ())
    for i in range(6):
        f = bpy.data.objects[f'flame{i}']; f.hide_render = i not in on; f.data.energy = FLAME
    s.render.resolution_x, s.render.resolution_y = RES; s.render.resolution_percentage = 50 if half else 100
    s.cycles.samples = spp; s.cycles.use_denoising = True; look()
    s.render.image_settings.file_format = 'PNG'; s.render.image_settings.color_depth = depth
    s.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True); print('done', name, flush=True)
for k in ('unlit', 'lit'): shot(f'close-{k}', 'cam_close', k)
# per-candle light: the base and each candle alone, half resolution, same seed, more samples (clean differences)
shot('pass-base', 'cam_close', 'unlit', lit=(), spp=PSPP, half=True, depth='16')
for i in range(6): shot(f'pass-{i}', 'cam_close', 'unlit', lit=(i,), spp=PSPP, half=True, depth='16')
shot('pass-all', 'cam_close', 'unlit', lit=range(6), spp=PSPP, half=True, depth='16')
for k in ('unlit', 'lit', 'after'): shot(f'wide-{k}', 'cam', k)
# the window mask: sky and moon white, everything else black, same camera and focus blur
s.render.resolution_percentage = 100; s.render.image_settings.color_depth = '8'
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
s.camera = bpy.data.objects['cam']; s.cycles.samples = 24; s.cycles.use_denoising = False; s.view_settings.view_transform = 'Standard'; s.view_settings.look = 'None'  # exposure stays .8, as v16
s.render.filepath = os.path.join(OUT, 'wide-mask.png'); bpy.ops.render.render(write_still=True); print('done wide-mask', flush=True)
