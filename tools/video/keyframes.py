# Prologue key art on a single 16 GB GPU: FLUX.1-schnell as an 8-bit GGUF (city96, Apache-2.0), T5 on the CPU,
# VAE decode on the CPU. Writes /kaggle/working/out/<name>-<seed>.png and a contact sheet per job.
import os, sys, subprocess, time, gc, traceback
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
T0 = time.time()
def log(*a): print(f'[{round(time.time() - T0):5d}s]', *a, flush=True)
subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--no-deps', 'gguf'], check=False)
import requests
def fetch(repo, f, root):
    dst = os.path.join(root, f); os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst): return dst
    with requests.get(f'https://huggingface.co/{repo}/resolve/main/{f}', stream=True, timeout=120) as r, open(dst + '.part', 'wb') as o:
        r.raise_for_status(); n = 0
        for chunk in r.iter_content(8 << 20):
            o.write(chunk); n += len(chunk)
            if n >= 256 << 20: o.flush(); os.fsync(o.fileno()); os.posix_fadvise(o.fileno(), 0, 0, os.POSIX_FADV_DONTNEED); n = 0
        o.flush(); os.fsync(o.fileno()); os.posix_fadvise(o.fileno(), 0, 0, os.POSIX_FADV_DONTNEED)
    os.rename(dst + '.part', dst); return dst
M = '/tmp/flux'
from huggingface_hub import list_repo_files
for f in list_repo_files('unsloth/FLUX.1-schnell'):
    if f.startswith('transformer/diffusion') or f in ('flux1-schnell.safetensors', 'ae.safetensors') or f.endswith('.jpeg'): continue
    fetch('unsloth/FLUX.1-schnell', f, M)
GG = fetch('city96/FLUX.1-schnell-gguf', 'flux1-schnell-Q8_0.gguf', '/tmp/gguf')
log('downloaded')
import torch, numpy as np
from pathlib import Path
from PIL import Image, ImageDraw
from diffusers import FluxPipeline, FluxTransformer2DModel, AutoencoderKL, GGUFQuantizationConfig
subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader'])
OUT = Path('/kaggle/working/out'); OUT.mkdir(parents=True, exist_ok=True)
enc = FluxPipeline.from_pretrained(M, transformer=None, vae=None, torch_dtype=torch.bfloat16)
tr = FluxTransformer2DModel.from_single_file(GG, quantization_config=GGUFQuantizationConfig(compute_dtype=torch.float16), torch_dtype=torch.float16, config=M, subfolder='transformer').to('cuda')
vae = AutoencoderKL.from_pretrained(M, subfolder='vae', torch_dtype=torch.float32); vae.enable_tiling()
pipe = FluxPipeline(scheduler=enc.scheduler, vae=None, text_encoder=None, tokenizer=None, text_encoder_2=None, tokenizer_2=None, transformer=tr)
log('loaded', torch.cuda.memory_allocated() // 2**20, 'MiB on GPU')

def encode(p):
    with torch.no_grad():
        pe, pp, _ = enc.encode_prompt(prompt=p, prompt_2=p, device=torch.device('cpu'), num_images_per_prompt=1, max_sequence_length=256)
    return pe.to('cuda', torch.float16), pp.to('cuda', torch.float16)
def decode(lat, w, h):
    lat = FluxPipeline._unpack_latents(lat, h, w, 8).to('cpu', torch.float32) / vae.config.scaling_factor + vae.config.shift_factor
    with torch.no_grad(): x = vae.decode(lat, return_dict=False)[0]
    x = (x[0].clamp(-1, 1) + 1) * 127.5
    return Image.fromarray(x.permute(1, 2, 0).round().byte().numpy())
def sheet(paths, name, tw=640):
    ims = [Image.open(p).convert('RGB') for p in paths]
    if not ims: return
    th = max(round(tw * i.height / i.width) for i in ims); rows = (len(ims) + 1) // 2
    S = Image.new('RGB', (2 * tw, rows * (th + 20)), (20, 20, 24)); d = ImageDraw.Draw(S)
    for k, (i, p) in enumerate(zip(ims, paths)):
        x, y = k % 2 * tw, k // 2 * (th + 20); S.paste(i.resize((tw, round(tw * i.height / i.width)), Image.LANCZOS), (x, y + 20)); d.text((x + 4, y + 4), Path(p).name, fill=(255, 255, 255))
    S.save(OUT / f'sheet-{name}.jpg', quality=88)


FILM = 'cinematic film still from a big-budget family fantasy film, photorealistic detail, volumetric light, enchanting and gentle, no text, no watermark'
CEL = ('classic hand-drawn 2D animated feature film, expressive cel-animated characters with clean confident ink lines and soft painted shading, '
       'realistic graceful horse anatomy, lush painterly gouache backgrounds, warm cinematic lighting, highly detailed, no text, no watermark')
COZY = 'cinematic painterly illustration from a cozy animated film, warm and inviting, highly detailed, no people, no text, no watermark'
CASTLE = ('An enchanted night view: a grand ancient castle of warm grey stone with many tall towers, turrets and pointed spires stands on a rocky cliff above a calm lake, '
          'hundreds of its windows glowing with warm golden candlelight. A big bright full moon among soft silver-lit clouds and stars, gentle mist drifting on the lake, '
          'moonlight shimmering on the water, a few little lantern boats. Deep blue night with rich warm gold accents, magical and welcoming rather than gloomy. ')
OWL = ('A beautiful snowy owl with pure white feathers lightly flecked with grey flies toward the camera through a moonlit night sky, wings spread wide mid-flap, round golden eyes, '
       'a cream parchment envelope sealed with red wax held in its talons. Far behind and below it, softly out of focus, a castle with warm glowing windows above a lake and a full moon among silver clouds. '
       'Soft silver rim light on the feathers, sharp focus on the owl, shallow depth of field. ')
RUN = ('Two wild mustang horses gallop together across a vast golden prairie at sunset, seen from a low three-quarter front angle as they run toward the camera side by side: '
       'a buckskin stallion with a golden tan coat, black lower legs and a long flowing black mane and tail, and a pinto paint mare with white and chestnut patches and a pale flowing mane. '
       'Manes and tails streaming in the wind, golden dust under their hooves, red sandstone buttes and a huge glowing sky behind. ')
KISS = ('Intimate close-up of two wild mustang horses touching noses tenderly at golden hour on a prairie of tall golden grass. On the left a buckskin stallion with a golden tan coat and long flowing black mane; '
        'on the right a pinto paint mare with white and chestnut patches. Gentle soft eyes, manes lifting in the warm wind, the low sun glowing between their muzzles, red sandstone mesas softly blurred behind. ')
STUDY = ('A warm cozy magical study at night, seen from behind a sturdy old wooden desk in the foreground whose centre is clear and empty. Behind it tall wooden bookshelves full of old leather books '
         'with warm string fairy lights draped along them like tiny stars, a stone fireplace with a gentle glowing fire on one side, a big soft armchair with a knitted blanket and cushions, potted plants and trailing ivy, '
         'a brass lamp with a warm glow, a steaming cup of tea and a small stack of books at the edge of the desk, a tall window showing a deep blue moonlit sky with a full moon and stars. '
         'Amber and honey tones with soft blue moonlight, peaceful, golden bokeh. ')
JOBS = [
 ('castle', CASTLE + FILM, [3, 8, 13, 21, 34, 55], 864, 1536),
 ('owl', OWL + FILM, [2, 7, 19, 42, 61, 77], 864, 1536),
 ('run', RUN + CEL, [5, 9, 14, 23, 31, 47], 1536, 864),
 ('runp', RUN + 'Vertical composition, both horses in the centre of the frame. ' + CEL, [5, 9, 14, 23], 864, 1536),
 ('kiss', KISS + CEL, [5, 9, 14, 23], 1536, 864),
 ('study', STUDY + COZY, [4, 11, 18, 27, 36, 45], 1536, 864),
 ('studyp', STUDY + 'Vertical composition. ' + COZY, [4, 11, 18, 27], 864, 1536),
]
prompts = {}
for name, p, seeds, w, h in JOBS:
    p = p or prompts[name]; prompts[name] = p
    t = time.time(); pe, pp = encode(p); log('encoded', name, round(time.time() - t), 's'); outs = []
    for s in seeds:
        try:
            t = time.time()
            with torch.no_grad():
                lat = pipe(prompt_embeds=pe, pooled_prompt_embeds=pp, num_inference_steps=4, guidance_scale=0., height=h, width=w, generator=torch.Generator('cpu').manual_seed(s), output_type='latent').images
            im = decode(lat, w, h); f = OUT / f'{name}-{s}.png'; im.save(f); outs.append(f)
            del lat; gc.collect(); torch.cuda.empty_cache()
            log('saved', f.name, round(time.time() - t), 's', 'mean', round(float(np.asarray(im).mean()), 1))
        except Exception:
            traceback.print_exc()
    sheet(outs, name + ('2' if (OUT / f'sheet-{name}.jpg').exists() else ''))
log('ALL_DONE', len(list(OUT.glob('*.png'))), 'images')
