# Depth Anything V2 (small, Apache-2.0) via onnxruntime -> relative inverse depth maps for tools/layers.py.
#   pip install onnxruntime opencv-python pillow numpy
#   python3 tools/depth.py site/assets/img/photo.webp [more images...]
# The first run downloads the model (~100 MB) into models/ (git-ignored).
import os, sys, urllib.request, numpy as np, onnxruntime as ort
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
MODEL = os.path.join(ROOT, 'models/da2-vits.onnx')
URL = 'https://github.com/fabio-sim/Depth-Anything-ONNX/releases/download/v2.0.0/depth_anything_v2_vits.onnx'
if not os.path.exists(MODEL):
    os.makedirs(os.path.dirname(MODEL), exist_ok=True)
    print('downloading depth model…'); urllib.request.urlretrieve(URL, MODEL)
sess = ort.InferenceSession(MODEL, providers=['CPUExecutionProvider'])
MEAN = np.array([.485, .456, .406], np.float32); STD = np.array([.229, .224, .225], np.float32)


def depth(path):
    im = Image.open(path).convert('RGB'); W, H = im.size

    def run(img):
        x = np.asarray(img.resize((518, 518), Image.BICUBIC), np.float32) / 255
        x = ((x - MEAN) / STD).transpose(2, 0, 1)[None]
        return sess.run(None, {'l_x_': x})[0][0]
    d = run(im) + run(im.transpose(Image.FLIP_LEFT_RIGHT))[:, ::-1]  # flip test-time augmentation
    d = np.asarray(Image.fromarray(d.astype(np.float32), 'F').resize((W, H), Image.BICUBIC))
    return (d - d.min()) / (d.max() - d.min() + 1e-6)  # 0 = far, 1 = near


if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'depth'), exist_ok=True)
    for p in sys.argv[1:]:
        d = depth(p); name = os.path.basename(p).rsplit('.', 1)[0]
        np.save(os.path.join(ROOT, f'depth/{name}.npy'), d.astype(np.float16))
        Image.fromarray((d * 255).astype(np.uint8)).save(os.path.join(ROOT, f'depth/{name}-depth.png'))
        print(name, d.shape)
