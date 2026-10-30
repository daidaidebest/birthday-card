"""Image measurements for the grade pipeline (numpy + PIL only; run with the system python3).

Every number is taken at one common scale (short side resized to 720 px) so grain and sharpness are
comparable "relative to the frame", and only on opaque pixels (alpha > .9) for cut-out sprites/planes.

  black / white  luma (Rec.709 weights on the encoded 0..255 values) at the 0.5th / 99.5th percentile
  mean           mean luma (0..255)
  sat / sat95    mean / 95th-percentile CIELAB chroma C*
  neu_a, neu_b   mean a*, b* of near-neutral pixels (C* < 16, 22 < L* < 92): the white balance / tint
  hi_b, sh_b     mean b* of the brightest / darkest 10 % (split toning: + is warm/yellow, - is cool/blue)
  cct            correlated colour temperature (K, McCamy) of the brightest 10 %
  contrast       standard deviation of L*
  noise          Immerkaer noise sigma (8-bit levels) on flat areas of the luma
  sharp          fine-detail ratio std(I - blur1.2) / std(I - blur6): high = crisp, low = soft / shallow focus

python3 tools/grade/measure.py FILE... prints a table (videos: give frames extracted by grade.py --frames).
"""
import sys
import numpy as np
from PIL import Image

SCALE = 720


def load(path_or_img, scale=SCALE):
    """-> (rgb float32 0..1 HxWx3, mask bool HxW) at the common scale."""
    im = path_or_img if isinstance(path_or_img, Image.Image) else Image.open(path_or_img)
    im.load()
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGBA' if 'A' in im.mode or im.mode == 'P' else 'RGB')
    s = scale / min(im.size)
    if s < 1:
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    a = np.asarray(im, dtype=np.float32) / 255
    if a.shape[2] == 4:
        return a[..., :3], a[..., 3] > .9
    return a, np.ones(a.shape[:2], bool)


def srgb_to_lin(c):
    return np.where(c <= .04045, c / 12.92, ((c + .055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, None)
    return np.where(c <= .0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - .055)


M_XYZ = np.array([[.4124564, .3575761, .1804375], [.2126729, .7151522, .0721750], [.0193339, .1191920, .9503041]], np.float32)
WHITE = np.array([.95047, 1., 1.08883], np.float32)


def rgb_to_lab(rgb):
    xyz = srgb_to_lin(rgb) @ M_XYZ.T
    t = xyz / WHITE
    f = np.where(t > (6 / 29) ** 3, np.cbrt(t), t / (3 * (6 / 29) ** 2) + 4 / 29)
    L = 116 * f[..., 1] - 16
    return np.stack([L, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1), xyz


def lab_to_rgb(lab):
    fy = (lab[..., 0] + 16) / 116
    f = np.stack([fy + lab[..., 1] / 500, fy, fy - lab[..., 2] / 200], -1)
    t = np.where(f > 6 / 29, f ** 3, 3 * (6 / 29) ** 2 * (f - 4 / 29))
    lin = (t * WHITE) @ np.linalg.inv(M_XYZ).T
    return lin_to_srgb(lin)


def blur(a, sigma):
    """Gaussian-ish blur of a 2D/3D float array by three box passes per axis (edge clamped)."""
    if sigma <= 0:
        return a
    r = max(1, int(round(np.sqrt(12 * sigma * sigma / 3 + 1) / 2 - .5)))
    out = a.astype(np.float32, copy=True)
    for ax in (0, 1):
        for _ in range(3):
            pad = [(0, 0)] * out.ndim
            pad[ax] = (r + 1, r)
            p = np.pad(out, pad, mode='edge')
            c = np.cumsum(p, axis=ax, dtype=np.float64)
            n = out.shape[ax]
            hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=ax)
            lo = np.take(c, np.arange(0, n), axis=ax)
            out = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return out


def luma(rgb):
    return rgb @ np.array([.2126, .7152, .0722], np.float32)


def noise_sigma(y, mask):
    """Immerkaer (1996) fast noise estimate on flat pixels, in 0..255 levels."""
    k = (y[:-2, :-2] - 2 * y[:-2, 1:-1] + y[:-2, 2:] - 2 * y[1:-1, :-2] + 4 * y[1:-1, 1:-1] - 2 * y[1:-1, 2:]
         + y[2:, :-2] - 2 * y[2:, 1:-1] + y[2:, 2:])
    gx = y[1:-1, 2:] - y[1:-1, :-2]
    gy = y[2:, 1:-1] - y[:-2, 1:-1]
    g = np.hypot(gx, gy)
    m = mask[1:-1, 1:-1] & (g < np.percentile(g[mask[1:-1, 1:-1]], 60)) & (y[1:-1, 1:-1] > .04) & (y[1:-1, 1:-1] < .96)
    if m.sum() < 500:
        return float('nan')
    return float(np.sqrt(np.pi / 2) / 6 * np.abs(k[m]).mean() * 255)


def cct_of(xyz):
    X, Y, Z = xyz
    s = X + Y + Z
    if s <= 0:
        return float('nan')
    x, y = X / s, Y / s
    n = (x - .3320) / (.1858 - y)
    return float(449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33)


def colour_stats(px):
    """The colour/tone subset of metrics() on an N x 3 pixel array (used to derive grades from pooled samples)."""
    y = luma(px) * 255
    lab, xyz = rgb_to_lab(px)
    L, C = lab[:, 0], np.hypot(lab[:, 1], lab[:, 2])
    neu = (C < 16) & (L > 22) & (L < 92)
    hi, sh = L >= np.percentile(L, 90), L <= np.percentile(L, 10)
    return {'black': float(np.percentile(y, .5)), 'white': float(np.percentile(y, 99.5)), 'mean': float(y.mean()), 'meanL': float(L.mean()),
            'sat': float(C.mean()), 'sat95': float(np.percentile(C, 95)), 'contrast': float(L.std()),
            'neu_a': float(lab[neu, 1].mean()) if neu.sum() > 100 else float('nan'),
            'neu_b': float(lab[neu, 2].mean()) if neu.sum() > 100 else float('nan'),
            'hi_b': float(lab[hi, 2].mean()), 'sh_b': float(lab[sh, 2].mean()), 'cct': cct_of(xyz[hi].mean(0))}


def metrics(src, scale=SCALE):
    rgb, mask = load(src, scale)
    y = luma(rgb)
    lab, xyz = rgb_to_lab(rgb)
    L, C = lab[..., 0], np.hypot(lab[..., 1], lab[..., 2])
    m = mask
    yv, Lv = y[m] * 255, L[m]
    out = {
        'black': float(np.percentile(yv, .5)), 'white': float(np.percentile(yv, 99.5)), 'mean': float(yv.mean()),
        'sat': float(C[m].mean()), 'sat95': float(np.percentile(C[m], 95)), 'contrast': float(Lv.std()),
    }
    neu = m & (C < 16) & (L > 22) & (L < 92)
    out['neu_a'] = float(lab[..., 1][neu].mean()) if neu.sum() > 200 else float('nan')
    out['neu_b'] = float(lab[..., 2][neu].mean()) if neu.sum() > 200 else float('nan')
    hi = m & (L >= np.percentile(Lv, 90))
    sh = m & (L <= np.percentile(Lv, 10))
    out['hi_b'] = float(lab[..., 2][hi].mean())
    out['sh_b'] = float(lab[..., 2][sh].mean())
    out['cct'] = cct_of(xyz[hi].mean(0))
    out['noise'] = noise_sigma(y, m)
    d1 = y - blur(y, 1.2)
    d6 = y - blur(y, 6)
    out['sharp'] = float(d1[m].std() / max(1e-6, d6[m].std()))
    return out


COLS = ['black', 'white', 'mean', 'sat', 'sat95', 'neu_a', 'neu_b', 'hi_b', 'sh_b', 'cct', 'contrast', 'noise', 'sharp']
FMT = {'cct': '{:6.0f}', 'sharp': '{:5.3f}', 'noise': '{:5.2f}'}


def row(name, mt, width=34):
    return f'{name[:width]:<{width}} ' + ' '.join((FMT.get(k, '{:6.1f}')).format(mt[k]) for k in COLS)


def header(width=34):
    return f'{"asset":<{width}} ' + ' '.join(f'{k:>{6 if k not in ("sharp", "noise") else 5}}' for k in COLS)


if __name__ == '__main__':
    print(header())
    for f in sys.argv[1:]:
        print(row('/'.join(f.split('/')[-2:]) if '/depth/' in f else f.split('/')[-1], metrics(f)))
