"""Painted key art with FLUX.1-schnell (Apache-2.0), run on a free Kaggle GPU notebook (T4 x2, internet on).

Paste this file into a notebook cell (or exec it) and run it. It downloads the ungated diffusers copy of the
model (~34 GB), generates every image listed in JOBS into /kaggle/working/out/, and writes a contact sheet per
job. Download the PNGs you like, then on the local machine:

    python3 tools/depth.py  site/assets/img/<name>.webp
    python3 tools/layers.py <name> 4                     # or: <name>-night 4 --depth <name>
    python3 tools/layers.py --manifest

Memory plan for two 15 GB T4s: the T5 text encoder runs on the CPU in bf16, the fp16 transformer is split
across both GPUs, and the VAE decodes in fp32. Never call .to()/from_pipe() on a pipeline holding the split
transformer: build pipelines with their constructors.
"""
import os, sys, time, traceback
os.environ['HF_HUB_DISABLE_XET'] = '1'  # the Xet backend got the Kaggle container killed; plain HTTP is fine
import numpy as np, torch
from pathlib import Path
from PIL import Image, ImageDraw
from huggingface_hub import hf_hub_download, list_repo_files
from diffusers import FluxPipeline, FluxImg2ImgPipeline, FluxTransformer2DModel, AutoencoderKL

REPO, M, OUT = 'unsloth/FLUX.1-schnell', '/tmp/flux', Path('/kaggle/working/out')
STYLE = ('hand-painted background and character art from a classic 1990s 2D animated feature film, lush gouache and oil '
         'painting, soft painterly brushwork, cinematic lighting, highly detailed, no text, no watermark')
PROMPTS = {
    'lions': 'Wide cinematic shot of a great jutting rock promontory rising above the African savanna at sunset. On top of the rock two lions rest side by side facing the setting sun: a majestic male lion with a thick dark flowing mane sits upright, and a graceful lioness lies close beside him, leaning her head against his mane. Below stretch endless golden plains dotted with flat-topped acacia trees and a silver river winding to the horizon. Huge glowing sky of orange, rose and violet clouds, the large sun low on the horizon, warm rim light on their fur. The rock and the lions sit in the right third of the frame and the upper half of the picture is open sky. ' + STYLE,
    'lions-night': 'The same wide shot of the great rock promontory above the African savanna, now at night. On top of the rock the majestic maned lion sits upright and the lioness lies beside him, leaning her head against his mane, both silvered by moonlight. A deep indigo and violet sky full of stars, the last faint amber glow along the horizon, the plains, acacia trees and winding river in cool blue moonlit shadow. ' + STYLE,
    'horses': 'Intimate close-up of two wild mustang horses touching noses tenderly at golden hour on a prairie of tall golden grass. On the left a buckskin stallion with a golden coat and a long flowing black mane; on the right a pinto paint mare with white and chestnut patches. Gentle soft eyes, manes lifting in the warm wind, the low sun glowing between their muzzles, distant red sandstone mesas softly blurred behind. ' + STYLE,
    'cake': 'A breathtaking elegant two-tier birthday cake seen from the front, standing on an antique gold cake stand. Smooth ivory buttercream with a soft blush pink ombre toward the base, delicate gold leaf flakes, a fine gold drip along the top edge, strings of tiny sugar pearls, a cascade of fresh blush and cream garden roses flowing down one side. Five tall slender ivory candles stand on top, unlit, with neat black wicks and no flames. Warm soft glow, rich fine-art oil painting, painterly realism, luxurious and romantic, centered, isolated on a plain pure black background, no table, no text',
}
# name, prompt key, seeds, width, height, img2img source name (the night is painted over the sunset)
JOBS = [
    ('lions', 'lions', [11, 23, 37, 58, 71, 89], 1536, 864, None),
    ('lions-night', 'lions-night', [11, 23, 37, 58, 71, 89], 1536, 864, 'lions'),
    ('horses', 'horses', [5, 9, 14, 23, 31, 47], 1536, 864, None),
    ('cake', 'cake', [5, 17, 29, 41], 1024, 1216, None),
]

T0 = time.time()
def log(*a): print(f'[{round(time.time() - T0):5d}s]', *a, flush=True)

for f in list_repo_files(REPO):
    if f not in ('flux1-schnell.safetensors', 'ae.safetensors') and not f.endswith('.jpeg'):
        hf_hub_download(REPO, f, local_dir=M)
OUT.mkdir(parents=True, exist_ok=True)
enc = FluxPipeline.from_pretrained(M, transformer=None, vae=None, torch_dtype=torch.bfloat16)
tr = FluxTransformer2DModel.from_pretrained(M, subfolder='transformer', torch_dtype=torch.float16, device_map='auto', max_memory={0: '11GiB', 1: '12.5GiB'})
vae16 = AutoencoderKL.from_pretrained(M, subfolder='vae', torch_dtype=torch.float16).to('cuda:0')
vae32 = AutoencoderKL.from_pretrained(M, subfolder='vae', torch_dtype=torch.float32).to('cuda:0'); vae32.enable_tiling()
parts = dict(scheduler=enc.scheduler, vae=vae16, text_encoder=None, tokenizer=None, text_encoder_2=None, tokenizer_2=None, transformer=tr)
pipe, i2i = FluxPipeline(**parts), FluxImg2ImgPipeline(**parts)
log('loaded')


def encode(p):
    with torch.no_grad():
        pe, pp, _ = enc.encode_prompt(prompt=p, prompt_2=p, device=torch.device('cpu'), num_images_per_prompt=1, max_sequence_length=256)
    return pe.to('cuda:0', torch.float16), pp.to('cuda:0', torch.float16)


def decode(lat, w, h):
    lat = FluxPipeline._unpack_latents(lat, h, w, 8).to('cuda:0', torch.float32) / vae32.config.scaling_factor + vae32.config.shift_factor
    with torch.no_grad():
        x = vae32.decode(lat, return_dict=False)[0]
    return pipe.image_processor.postprocess(x, output_type='pil')[0]


def sheet(paths, name, tw=640):
    ims = [Image.open(p).convert('RGB') for p in paths]
    if not ims: return
    th = max(round(tw * i.height / i.width) for i in ims); rows = (len(ims) + 1) // 2
    S = Image.new('RGB', (2 * tw, rows * (th + 20)), (20, 20, 24)); d = ImageDraw.Draw(S)
    for k, (i, p) in enumerate(zip(ims, paths)):
        x, y = k % 2 * tw, k // 2 * (th + 20)
        S.paste(i.resize((tw, round(tw * i.height / i.width)), Image.LANCZOS), (x, y + 20)); d.text((x + 4, y + 4), Path(p).name, fill=(255, 255, 255))
    S.save(OUT / f'sheet-{name}.jpg', quality=88)


for name, key, seeds, w, h, src in JOBS:
    pe, pp = encode(PROMPTS[key]); outs = []
    for s in seeds:
        try:
            kw = dict(prompt_embeds=pe, pooled_prompt_embeds=pp, guidance_scale=0., height=h, width=w, generator=torch.Generator('cpu').manual_seed(s), output_type='latent')
            with torch.no_grad():
                if src:  # 8 steps at strength .55 keeps the composition, so both paintings share one set of depth planes
                    lat = i2i(image=Image.open(OUT / f'{src}-{s}.png').convert('RGB'), strength=.55, num_inference_steps=8, **kw).images
                else:
                    lat = pipe(num_inference_steps=4, **kw).images
            p = OUT / f'{name}-{s}.png'; decode(lat, w, h).save(p); outs.append(p); log('saved', p.name)
        except Exception:
            traceback.print_exc()
    sheet(outs, name)
log('done')
