# Day-for-night: repaints a sunset painting as the same place under moonlight, pixel-aligned with the
# original so both can be cut with the same depth planes and crossfaded plane by plane.
#   python3 tools/night.py site/assets/img/lions.webp site/assets/img/lions-night.webp <horizon 0..1>
# The sun is painted out (inpainted from the surrounding sky), tones are remapped to a moonlit palette and
# a last band of amber is kept along the horizon.
import sys, numpy as np, cv2
from PIL import Image

src, dst, horizon = sys.argv[1], sys.argv[2], float(sys.argv[3])
rgb = np.asarray(Image.open(src).convert('RGB'))
H, W = rgb.shape[:2]
f = rgb.astype(np.float32) / 255

# 1. paint out the sun: the bright, warm disc above the horizon, plus its halo
hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
sun = ((hsv[..., 2] > 235) & (hsv[..., 1] > 120) & (hsv[..., 0] > 18) & (hsv[..., 0] < 40)).astype(np.uint8)
sun[int(H * (horizon + .02)):] = 0
n, lab, st, _ = cv2.connectedComponentsWithStats(sun)
if n > 1:
    sun = (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    r = int(np.sqrt(st[1:, cv2.CC_STAT_AREA].max() / np.pi))
    hole = cv2.dilate(sun, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (r, r)), iterations=2)
    small = cv2.resize(rgb, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    fill = cv2.inpaint(small, cv2.resize(hole, (W // 2, H // 2)), 15, cv2.INPAINT_TELEA)
    fill = cv2.GaussianBlur(cv2.resize(fill, (W, H), interpolation=cv2.INTER_CUBIC), (0, 0), 3)
    soft = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), r * .4)[..., None]
    f = f * (1 - soft) + fill.astype(np.float32) / 255 * soft

# 2. moonlit palette by luminance (darkened), keeping a little of the painting's own colour
L = (f @ np.array([.299, .587, .114], np.float32))
stops = np.array([0, .3, .55, .8, 1.]); cols = np.array([[4, 6, 20], [20, 26, 66], [52, 60, 118], [128, 142, 200], [214, 224, 255]], np.float32) / 255
Ld = np.clip(L, 0, 1) ** 1.35
night = np.stack([np.interp(Ld, stops, cols[:, c]) for c in range(3)], -1)
night = night * .88 + f * .12 * np.array([.55, .6, 1.], np.float32)

# 3. the last of the dusk: a faint amber band hugging the horizon, only in the sky
y = np.arange(H, dtype=np.float32)[:, None] / H
band = np.exp(-((y - horizon) / .045) ** 2) * (y < horizon + .01)
sky = cv2.GaussianBlur((L > .25).astype(np.float32), (0, 0), 6)  # lit areas (sky, not the dark rock)
amber = np.array([1., .55, .28], np.float32)
night = night + (band * sky)[..., None] * amber * .32

out = np.clip(night * 255 + .5, 0, 255).astype(np.uint8)
Image.fromarray(out).save(dst, quality=88, method=6)
print(dst, out.shape, 'mean', round(float(out.mean()), 1))
