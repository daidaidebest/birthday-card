"""Screenshots of every chapter as she sees it (canvas composites, runtime grade.css, grain, vignette), for the grade audit.

  ~/projects/render-workspace/scratch/venv/bin/python tools/grade/capture.py OUTDIR [WxH ...] [--url http://localhost:8123/]
      [--scenes gate,prologue,...] [--speed 2] [--no-webm]

Headless Chromium has no H.264, so by default every assets/video/*.mp4 request is answered with a VP8/WebM transcode of the
same file (cached under OUTDIR/../webm, rebuilt when the mp4 changes): the films then play in the screenshots exactly where
the scene draws them, with the scene's own canvas grade on top. Runs one browser; wrap it in the shared flock:
  flock ~/projects/render-workspace/scratch/browser.lock <python> tools/grade/capture.py ...
Writes OUTDIR/<W>x<H>/<scene>-<t>s.jpg (q 92).
"""
import os, sys, subprocess, time, hashlib
os.environ.setdefault('PLAYWRIGHT_BROWSERS_PATH', os.path.expanduser('~/projects/render-workspace/scratch/pw'))
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VIDEO = os.path.join(ROOT, 'site/assets/video')
# seconds after the chapter starts (at ?speed=2) at which to take a frame: picked to land on the representative shots
TIMES = {
    'gate': [3, 7], 'prologue': [3, 8, 14, 24], 'book': [4, 9, 16], 'journey': [5, 12, 22, 34],
    'memories': [6, 12, 20], 'film': [4, 10, 18, 28, 40], 'wish': [4, 10, 18, 30],
}


def webm_for(mp4, cache):
    os.makedirs(cache, exist_ok=True)
    st = os.stat(mp4)
    key = hashlib.md5(f'{mp4}{st.st_size}{st.st_mtime}'.encode()).hexdigest()[:10]
    out = os.path.join(cache, os.path.basename(mp4)[:-4] + f'.{key}.webm')
    if not os.path.exists(out):
        # same picture (bt709 in, bt709 out), VP8 for the test browser only; never shipped
        subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-y', '-i', mp4, '-an', '-c:v', 'libvpx', '-b:v', '6M', '-crf', '8',
                        '-deadline', 'realtime', '-cpu-used', '6', '-threads', '3', out], check=True)
    return out


def main():
    a = sys.argv[1:]
    out = a.pop(0)
    url = 'http://localhost:8123/'; scenes = list(TIMES); speed = 2; webm = True; sizes = []
    while a:
        x = a.pop(0)
        if x == '--url': url = a.pop(0)
        elif x == '--scenes': scenes = a.pop(0).split(',')
        elif x == '--speed': speed = float(a.pop(0))
        elif x == '--no-webm': webm = False
        else: sizes.append(x)
    sizes = sizes or ['1440x810', '390x844']
    cache = os.path.join(os.path.dirname(os.path.abspath(out)), 'webm')
    if webm:
        for f in sorted(os.listdir(VIDEO)):
            if f.endswith('.mp4'): webm_for(os.path.join(VIDEO, f), cache)
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        for wh in sizes:
            W, H = map(int, wh.split('x')); phone = W < 700; d = os.path.join(out, wh); os.makedirs(d, exist_ok=True)
            for sc in scenes:
                ctx = b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2 if phone else 1, has_touch=phone, is_mobile=phone)
                pg = ctx.new_page()
                if webm:
                    def route(r):
                        f = os.path.join(VIDEO, r.request.url.split('/')[-1].split('?')[0])
                        if not os.path.exists(f): return r.continue_()
                        r.fulfill(path=webm_for(f, cache), content_type='video/webm')
                    pg.route('**/assets/video/*.mp4', route)
                q = f'?speed={speed}' if sc == 'gate' else f'?autostart&scene={sc}&speed={speed}'
                pg.goto(url + q); t0 = time.time()
                for t in TIMES[sc]:
                    dt = t - (time.time() - t0)
                    if dt > 0: pg.wait_for_timeout(int(dt * 1000))
                    pg.screenshot(path=f'{d}/{sc}-{t:02d}s.jpg', type='jpeg', quality=92)
                print(wh, sc, 'ok', flush=True)
                ctx.close()
        b.close()


if __name__ == '__main__':
    main()
