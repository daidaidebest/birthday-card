# Part masks and depth for the lion rig (v19), run once as a Kaggle GPU script kernel (one T4 is plenty).
#
#   kaggle kernels push -p <dir with this file as lion_rig_sam.py + kernel-metadata.json>   (enable_gpu, internet)
#   kaggle kernels output cheneric1130/birthday-lion-rig -p tools/lion_rig/sam
#
# Input: the savanna painting (lions.webp) and its rock-and-lions depth plane, fetched from the published site.
# It crops the lions' box, upsamples it 2x (Lanczos, so SAM sees the small heads at ~2.2x after its own resize) and writes:
#   prompt_<name>_<k>.png   SAM ViT-H probability masks (3 candidates per point prompt, crop px at 2x), scores.json
#   auto.npz                SAM automatic mask generation over the crop (all segments, bool, 2x)
#   depth.png               Depth Anything V2 Large of the crop (16-bit, 2x, larger = nearer)
#   sheet.jpg               a contact sheet of every prompt's best candidate
# tools/lion_rig.py turns the chosen masks into the rig the browser animates. Nothing here touches the painting.
import os, sys, json, time, io, subprocess
os.environ['HF_HUB_DISABLE_XET'] = '1'
T0 = time.time()
def log(*a): print(f'[{round(time.time() - T0):4d}s]', *a, flush=True)
import numpy as np, requests, torch
from PIL import Image, ImageDraw

SITE = 'https://daidaidebest.github.io/birthday-card/assets/'
BOX = (640, 120, 1104, 456)          # the lions' box in lions.webp px (1536x864); keep in sync with tools/lion_rig.py
UP = 2
OUT = '/kaggle/working/out' if os.path.isdir('/kaggle/working') else 'out'
os.makedirs(OUT, exist_ok=True)
# point prompts in lions.webp px: (positive points, negative points)
PROMPTS = {
    'him':        ([(725, 195), (790, 200), (800, 280), (700, 335), (760, 300)], [(905, 265), (950, 350), (800, 420)]),
    'his_head':   ([(725, 190), (712, 205), (752, 165), (735, 172)], [(800, 200), (780, 260)]),
    'his_face':   ([(722, 195), (712, 205), (730, 210)], [(790, 200), (760, 250), (752, 165)]),
    'his_ear':    ([(752, 165)], [(725, 195), (780, 170)]),
    'his_mane':   ([(790, 190), (770, 250), (740, 290), (820, 220)], [(725, 195), (820, 290), (752, 165)]),
    'his_body':   ([(820, 290), (780, 320), (700, 335)], [(790, 190), (725, 195), (905, 265)]),
    'his_paw':    ([(680, 340)], [(740, 320)]),
    'his_eye':    ([(729, 185)], [(722, 195), (740, 180)]),
    'her':        ([(905, 265), (950, 350), (900, 366), (1030, 410)], [(800, 280), (725, 195), (800, 420)]),
    'her_head':   ([(905, 265), (880, 260), (930, 290), (912, 240)], [(860, 320), (950, 350), (800, 280)]),
    'her_face':   ([(905, 270), (925, 285), (935, 295)], [(875, 255), (912, 240), (900, 330)]),
    'her_ear_l':  ([(875, 255)], [(900, 265), (860, 290)]),
    'her_ear_r':  ([(911, 240)], [(905, 265)]),
    'her_body':   ([(950, 350), (930, 330), (900, 366)], [(905, 265), (800, 280)]),
    'her_paw':    ([(900, 366)], [(950, 350)]),
    'her_eye_l':  ([(905, 265)], [(905, 280), (895, 255)]),
    'her_eye_r':  ([(928, 262)], [(935, 280)]),
    'tail':       ([(1000, 400), (1040, 415), (1065, 425)], [(950, 350), (1000, 430)]),
    'rock':       ([(800, 420), (700, 400), (1000, 440)], [(800, 300), (1040, 415)]),
}


def fetch(p):
    r = requests.get(SITE + p, timeout=60); r.raise_for_status(); return Image.open(io.BytesIO(r.content))


def main():
    subprocess.run(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader'])
    dev = 'cuda' if torch.cuda.is_available() else 'cpu'
    paint = fetch('img/lions.webp').convert('RGB')
    plane = fetch('depth/lions/2.webp').convert('RGBA')        # the rock-and-lions plane, starts at y 135
    full = Image.new('RGBA', paint.size, (0, 0, 0, 0)); full.paste(plane, (0, 135))
    crop = paint.crop(BOX); W, H = crop.size
    big = crop.resize((W * UP, H * UP), Image.LANCZOS)
    big.save(f'{OUT}/crop2x.png'); full.crop(BOX).save(f'{OUT}/plane_crop.png')
    log('inputs', paint.size, crop.size, dev)

    # ---------- SAM ViT-H: point prompts ----------
    from transformers import SamModel, SamProcessor
    sam = SamModel.from_pretrained('facebook/sam-vit-huge').to(dev).eval()      # fp32: the masks are the product
    proc = SamProcessor.from_pretrained('facebook/sam-vit-huge')
    inp = proc(big, return_tensors='pt').to(dev)
    with torch.no_grad(): emb = sam.get_image_embeddings(inp['pixel_values'])
    if isinstance(emb, (tuple, list)): emb = emb[0]
    osz, rsz = inp['original_sizes'].cpu(), inp['reshaped_input_sizes'].cpu()
    sc = 1024 / max(big.size)
    scores = {}
    for name, (pos, neg) in PROMPTS.items():
        pts = [((x - BOX[0]) * UP * sc, (y - BOX[1]) * UP * sc) for x, y in pos + neg]
        lab = [1] * len(pos) + [0] * len(neg)
        ip = torch.tensor([[pts]], dtype=torch.float32, device=dev); il = torch.tensor([[lab]], dtype=torch.long, device=dev)
        try:
            with torch.no_grad(): o = sam(image_embeddings=emb, input_points=ip, input_labels=il, multimask_output=True)
        except Exception as e:   # (API drift: fall back to the full forward)
            log('embeddings path failed', repr(e))
            with torch.no_grad(): o = sam(pixel_values=inp['pixel_values'], input_points=ip, input_labels=il, multimask_output=True)
        m = proc.image_processor.post_process_masks(o.pred_masks.cpu(), osz, rsz, binarize=False)[0][0]   # (3, H, W) logits
        pr = torch.sigmoid(m).numpy()
        s = o.iou_scores.cpu().numpy().reshape(-1).tolist(); scores[name] = s
        for k in range(pr.shape[0]): Image.fromarray((pr[k] * 255 + .5).astype(np.uint8)).save(f'{OUT}/prompt_{name}_{k}.png')
        log(name, [round(v, 3) for v in s])
    json.dump({'box': BOX, 'up': UP, 'scores': scores, 'prompts': PROMPTS}, open(f'{OUT}/scores.json', 'w'), indent=1)

    # ---------- SAM automatic segments ----------
    try:
        from transformers import pipeline
        gen = pipeline('mask-generation', model=sam, image_processor=proc.image_processor, device=0 if dev == 'cuda' else -1)
        res = gen(big, points_per_batch=64, pred_iou_thresh=.8)
        ms = np.stack([np.asarray(m, bool) for m in res['masks']]) if res['masks'] else np.zeros((0, *big.size[::-1]), bool)
        np.savez_compressed(f'{OUT}/auto.npz', masks=np.packbits(ms, axis=-1), shape=ms.shape, scores=np.array([float(s) for s in res['scores']]))
        log('auto segments', ms.shape)
    except Exception as e:
        log('auto failed', repr(e))
    del sam; torch.cuda.empty_cache()

    # ---------- Depth Anything V2 Large ----------
    try:
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation
        dp = AutoImageProcessor.from_pretrained('depth-anything/Depth-Anything-V2-Large-hf')
        dm = AutoModelForDepthEstimation.from_pretrained('depth-anything/Depth-Anything-V2-Large-hf', torch_dtype=torch.float16).to(dev).eval()
        x = dp(images=big, return_tensors='pt').to(dev)
        with torch.no_grad(): d = dm(pixel_values=x['pixel_values'].half()).predicted_depth.float()
        d = torch.nn.functional.interpolate(d[:, None], size=big.size[::-1], mode='bicubic', align_corners=False)[0, 0].cpu().numpy()
        d = (d - d.min()) / (d.max() - d.min() + 1e-9)
        Image.fromarray((d * 65535).astype(np.uint16)).save(f'{OUT}/depth.png')
        log('depth', d.shape)
    except Exception as e:
        log('depth failed', repr(e))

    # ---------- contact sheet ----------
    tiles = []
    for name in PROMPTS:
        k = int(np.argmax(scores[name])); m = np.asarray(Image.open(f'{OUT}/prompt_{name}_{k}.png')) / 255.
        a = np.asarray(big, np.float32); tint = a * .35 + np.array([255, 40, 40]) * .65
        t = Image.fromarray((a * (1 - m[..., None]) + tint * m[..., None]).astype(np.uint8)).resize((W, H))
        ImageDraw.Draw(t).text((4, 4), f'{name} {k} {scores[name][k]:.2f}', fill=(255, 255, 0)); tiles.append(t)
    cols = 4; rows = (len(tiles) + cols - 1) // cols; sh = Image.new('RGB', (cols * W, rows * H))
    for i, t in enumerate(tiles): sh.paste(t, (i % cols * W, i // cols * H))
    sh.save(f'{OUT}/sheet.jpg', quality=88)
    log('DONE', sorted(os.listdir(OUT)))


if __name__ == '__main__':
    try: main()
    except Exception:
        import traceback; traceback.print_exc(); log('FAILED', sorted(os.listdir(OUT))); sys.exit(1)
