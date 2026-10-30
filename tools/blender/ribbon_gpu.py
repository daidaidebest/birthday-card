"""Render the packed ribbon scene (tools/blender/ribbon.py build) on a CUDA GPU, frame by frame, resumable.
  blender -b ribbon.blend --python ribbon_gpu.py -- OUTDIR SPEC [spp] [res]
SPEC: a-b[:step] | a,b,c | still   ('still' = the tied bow, frame 0, written as OUTDIR/still.png)
res = envelope width in px (the frame is 1.12 x 0.6566 of it). CUDA only: OptiX fell back to the CPU silently before."""
import bpy, sys, os, time
a = sys.argv[sys.argv.index('--') + 1:]; out, spec = a[0], a[1]
spp = int(a[2]) if len(a) > 2 and a[2] != '-' else 0; res = int(a[3]) if len(a) > 3 else 0
s = bpy.context.scene; pr = bpy.context.preferences.addons['cycles'].preferences
pr.compute_device_type = 'CUDA'; pr.get_devices()
gpus = [d for d in pr.devices if d.type == 'CUDA']
if not gpus: raise SystemExit('no CUDA device: refusing to render on the CPU')
for d in pr.devices: d.use = d.type == 'CUDA'
s.cycles.device = 'GPU'; print('device CUDA', [d.name for d in gpus], flush=True)
try: s.cycles.denoiser = 'OPENIMAGEDENOISE'; s.cycles.denoising_use_gpu = True
except Exception as e: print('denoiser', e)
if spp: s.cycles.samples = spp
if res:
    k = res / s.get('env_px', 1000)                # the packed scene stores the envelope width it was built for
    s.render.resolution_x, s.render.resolution_y = round(s.render.resolution_x * k), round(s.render.resolution_y * k)
os.makedirs(out, exist_ok=True)
if spec == 'still': frames = [('still.png', 0)]
elif '-' in spec:
    r, st = (spec.split(':') + ['1'])[:2]; f0, f1 = map(int, r.split('-'))
    frames = [(f'f_{f:04d}.png', f) for f in range(f0, min(f1, s.frame_end) + 1, int(st))]
else: frames = [(f'f_{int(f):04d}.png', int(f)) for f in spec.split(',')]
t0 = time.time()
for name, f in frames:
    p = os.path.join(out, name)
    if os.path.exists(p): continue
    t = time.time(); s.frame_set(f); s.render.filepath = p; bpy.ops.render.render(write_still=True)
    print(f'frame {f} {time.time() - t:.1f}s', flush=True)
print(f'done {len(frames)} in {time.time() - t0:.0f}s', flush=True)
