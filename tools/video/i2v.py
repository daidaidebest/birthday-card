# Image-to-video with Wan2.2-TI2V-5B (Apache-2.0) on a Kaggle T4 x2. The main process downloads the model and
# encodes every prompt with UMT5 on the CPU (bf16); then one worker per GPU loads the fp16 transformer and the
# fp32 VAE (tiled decode) and renders its share of JOBS. Writes /kaggle/working/out/<name>.mp4 (CRF 12 master),
# <name>.pt (latents) and three stills per clip.
import os, sys, subprocess, time, gc, traceback, json, io
os.environ['HF_HUB_DISABLE_XET'] = '1'; os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'expandable_segments:True'
T0 = time.time()
WORKER = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] == 'worker' else None
def log(*a): print(f'[{round(time.time() - T0):5d}s]' + (f' w{WORKER}' if WORKER is not None else ''), *a, flush=True)
REPO, M, OUT, EMB = 'Wan-AI/Wan2.2-TI2V-5B-Diffusers', '/tmp/wan', '/kaggle/working/out', '/tmp/emb.pt'
NEG = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走，闪烁，变形'
JOBS = [
    {'name': 'castle-test', 'url': 'https://daidaidebest.github.io/birthday-card/assets/img/castle.webp', 'w': 704, 'h': 1280, 'frames': 121, 'steps': 25, 'seed': 7,
     'prompt': 'A slow, smooth cinematic aerial push-in toward a grand gothic castle on a cliff above a calm lake at night. Soft clouds drift slowly past the bright full moon, warm golden candlelight flickers gently in the many windows, thin mist rolls slowly over the water and moonlight shimmers on the lake. Magical, enchanting, steady camera, film quality.'},
    {'name': 'kiss-test', 'url': 'https://daidaidebest.github.io/birthday-card/assets/img/horses-kiss.webp', 'w': 1280, 'h': 704, 'frames': 121, 'steps': 25, 'seed': 3,
     'prompt': 'Two wild horses, a buckskin stallion with a long black mane and a pinto mare, slowly lean in and gently touch noses at golden hour. Their manes and the tall golden grass sway softly in the warm wind, they blink and breathe calmly, the low sun glows between them. Tender, peaceful, smooth natural motion, hand-drawn animated film style, steady camera.'},
]
import torch, numpy as np, requests
from pathlib import Path
from PIL import Image

if WORKER is None:
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'imageio-ffmpeg'], check=False)
    subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader'])
    from huggingface_hub import hf_hub_download, list_repo_files
    for f in list_repo_files(REPO):
        if f.endswith(('.json', '.safetensors', '.model', '.txt')) or 'tokenizer' in f: hf_hub_download(REPO, f, local_dir=M)
    log('downloaded')
    for p in Path('/kaggle/input').rglob('jobs.json') if Path('/kaggle/input').exists() else []: JOBS = json.loads(p.read_text()); log('jobs from', p)
    from transformers import UMT5EncoderModel, AutoTokenizer
    tok = AutoTokenizer.from_pretrained(M, subfolder='tokenizer')
    te = UMT5EncoderModel.from_pretrained(M, subfolder='text_encoder', torch_dtype=torch.bfloat16)
    def embed(p):
        ids = tok([p], padding='max_length', max_length=512, truncation=True, add_special_tokens=True, return_attention_mask=True, return_tensors='pt')
        with torch.no_grad(): e = te(ids.input_ids, ids.attention_mask).last_hidden_state
        n = int(ids.attention_mask.sum()); e = e[:, :n]; e = torch.cat([e, e.new_zeros(1, 512 - n, e.shape[-1])], 1)
        return e.float()
    embs = {j['name']: embed(j['prompt']) for j in JOBS}
    torch.save({'neg': embed(NEG), 'embs': embs, 'jobs': JOBS}, EMB)
    del te; gc.collect(); log('encoded', len(embs))
    Path(OUT).mkdir(parents=True, exist_ok=True)
    n = torch.cuda.device_count(); procs = []
    for k in range(n):
        procs.append(subprocess.Popen([sys.executable, os.path.abspath(sys.argv[0]), 'worker', str(k), str(n)], env={**os.environ, 'CUDA_VISIBLE_DEVICES': str(k)}))
        time.sleep(60)  # stagger the loads
    for p in procs: p.wait()
    log('ALL_DONE', sorted(os.listdir(OUT)))
    sys.exit(0)

# ---------------- worker ----------------
# Wan2.2 TI2V modulates every token with its own timestep; diffusers adds that table in fp32, a ~2 GB temporary
# at 704x1280 that does not fit a T4 beside the fp16 weights. Do it in fp16 (halves it).
import importlib.util
_f = Path(importlib.util.find_spec('diffusers').origin).parent / 'models/transformers/transformer_wan.py'
_src = _f.read_text()
if 'self.scale_shift_table.unsqueeze(0) + temb.float()' in _src:
    _f.write_text(_src.replace('self.scale_shift_table.unsqueeze(0) + temb.float()', 'self.scale_shift_table.unsqueeze(0).to(temb.dtype) + temb'))
import imageio_ffmpeg
from diffusers import WanTransformer3DModel, AutoencoderKLWan, UniPCMultistepScheduler
NW = int(sys.argv[3]); D = torch.load(EMB); JOBS = D['jobs'][WORKER::NW]; neg = D['neg']
for j in JOBS: j['frames'] = min(j['frames'], 105); j['steps'] = min(j['steps'], 22)  # what a T4 holds
if not JOBS: sys.exit(0)
tr = WanTransformer3DModel.from_pretrained(M, subfolder='transformer', torch_dtype=torch.float16, device_map='cuda')
vae = AutoencoderKLWan.from_pretrained(M, subfolder='vae', torch_dtype=torch.float32); vae.enable_tiling()  # lives on the CPU while denoising
sch = UniPCMultistepScheduler.from_pretrained(M, subfolder='scheduler')
LM = torch.tensor(vae.config.latents_mean).view(1, -1, 1, 1, 1); LS = 1.0 / torch.tensor(vae.config.latents_std).view(1, -1, 1, 1, 1)
log('loaded', torch.cuda.memory_allocated() // 2**20, 'MiB')

def generate(img, pe, ne, frames, steps, cfg, seed, cb):
    """Wan2.2 TI2V image-to-video (the expand_timesteps path of diffusers' WanImageToVideoPipeline), written out so
    the VAE can stay off the GPU while the transformer runs."""
    w, h = img.size
    x = torch.from_numpy(np.asarray(img)).permute(2, 0, 1)[None, :, None].float() / 127.5 - 1  # 1,3,1,H,W
    vae.to('cuda')
    with torch.no_grad(): cond = vae.encode(x.cuda()).latent_dist.mode()
    vae.to('cpu'); torch.cuda.empty_cache()
    cond = (cond - LM.cuda()) * LS.cuda()                                        # 1,48,1,h,w
    F, lh, lw = (frames - 1) // 4 + 1, h // 16, w // 16
    g = torch.Generator('cuda').manual_seed(seed)
    lat = torch.randn(1, 48, F, lh, lw, generator=g, device='cuda', dtype=torch.float32)
    mask = torch.ones(1, 1, F, lh, lw, device='cuda'); mask[:, :, 0] = 0
    sch.set_timesteps(steps, device='cuda')
    for i, t in enumerate(sch.timesteps):
        inp = ((1 - mask) * cond + mask * lat).half()
        ts = (mask[0][0][:, ::2, ::2] * t).flatten()[None]
        with torch.no_grad():
            c = tr(hidden_states=inp, timestep=ts, encoder_hidden_states=pe, return_dict=False)[0]
            u = tr(hidden_states=inp, timestep=ts, encoder_hidden_states=ne, return_dict=False)[0]
        noise = (u + cfg * (c - u)).float(); del c, u
        lat = sch.step(noise, t, lat, return_dict=False)[0]
        cb(i, lat)
    return (1 - mask) * cond + mask * lat

def decode(lat):
    tr.to('cpu'); torch.cuda.empty_cache(); vae.to('cuda')
    with torch.no_grad(): v = vae.decode((lat / LS.cuda() + LM.cuda()).float(), return_dict=False)[0]
    vae.to('cpu'); torch.cuda.empty_cache(); tr.to('cuda')
    return ((v[0].clamp(-1, 1) + 1) * 127.5).round().byte().permute(1, 2, 3, 0).cpu().numpy()  # T,H,W,C

def fetch_img(j):
    u, w, h = j['url'], j['w'], j['h']
    if not u.startswith('http') and not os.path.exists(u): u = str(next(Path('/kaggle/input').rglob(Path(u).name)))
    im = Image.open(io.BytesIO(requests.get(u, timeout=60).content) if u.startswith('http') else u).convert('RGB')
    s = max(w / im.width, h / im.height); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    fx, fy = j.get('fx', .5), j.get('fy', .5); x, y = round((im.width - w) * fx), round((im.height - h) * fy)
    return im.crop((x, y, x + w, y + h))

def write_mp4(frames, path, fps=24):
    h, w = frames[0].shape[:2]
    wr = imageio_ffmpeg.write_frames(str(path), (w, h), fps=fps, codec='libx264', quality=None, output_params=['-crf', '12', '-pix_fmt', 'yuv420p', '-preset', 'slow'])
    wr.send(None)
    for f in frames: wr.send(np.ascontiguousarray(f))
    wr.close()

for j in JOBS:
    name = j['name']
    try:
        img = fetch_img(j); img.save(f'{OUT}/{name}-in.png')
        t = time.time(); last = [t]
        def cb(i, lat):
            now = time.time()
            if i in (0, 1) or i % 5 == 4: log(name, 'step', i, round(now - last[0], 1), 's', 'nan' if torch.isnan(lat).any() else 'ok', torch.cuda.max_memory_allocated() // 2**20, 'MiB peak')
            last[0] = now
        lat = generate(img, D['embs'][name].half().cuda(), neg.half().cuda(), j['frames'], j['steps'], j.get('cfg', 5.0), j['seed'], cb)
        torch.save(lat.cpu(), f'{OUT}/{name}.pt'); log(name, 'denoised', round(time.time() - t), 's')
        v = decode(lat)
        write_mp4(list(v), f'{OUT}/{name}.mp4')
        for k in (0, len(v) // 2, len(v) - 1): Image.fromarray(v[k]).save(f'{OUT}/{name}-f{k:03d}.jpg', quality=90)
        log(name, 'saved', v.shape, round(time.time() - t), 's total', 'mean', round(float(v.mean()), 1))
        del lat, v
    except Exception:
        traceback.print_exc()
    gc.collect(); torch.cuda.empty_cache()
log('worker done')
