"""Encodes a master clip from the Kaggle job (tools/video/i2v.py, CRF 12) for the web:
H.264 (plays everywhere, including iPhone), yuv420p, faststart, no audio.

    python3 tools/video/encode.py master.mp4 site/assets/video/<name>.mp4 [--crf 25] [--width 720] [--trim a:b]

--trim keeps seconds a..b of the master. --pingpong N keeps frames 0..N and appends them reversed, a loop with
no seam (the study's slow camera breathes in and out). Needs an ffmpeg with libx264: FFMPEG=/path/to/ffmpeg, or `ffmpeg` on PATH
(the imageio-ffmpeg package ships one)."""
import argparse, os, subprocess

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--crf', type=int, default=25); ap.add_argument('--width', type=int, default=0); ap.add_argument('--trim', default=''); ap.add_argument('--pingpong', type=int, default=0)
a = ap.parse_args()
vf = []
if a.trim:
    s, e = a.trim.split(':'); vf.append(f'trim={s}:{e},setpts=PTS-STARTPTS')
if a.width: vf.append(f'scale={a.width}:-2:flags=lanczos')
if a.pingpong:
    n = a.pingpong
    filt = (f'[0:v]trim=start_frame=0:end_frame={n + 1},setpts=PTS-STARTPTS,{",".join(vf) or "null"},split[a][b];'
            f'[b]reverse,trim=start_frame=1:end_frame={n},setpts=PTS-STARTPTS[r];[a][r]concat=n=2:v=1[v]')
    io = ['-i', a.src, '-filter_complex', filt, '-map', '[v]']
else:
    io = ['-i', a.src, '-vf', ','.join(vf) or 'null']
cmd = [os.environ.get('FFMPEG', 'ffmpeg'), '-y', '-loglevel', 'error', *io, '-an',
       '-c:v', 'libx264', '-preset', 'veryslow', '-crf', str(a.crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart', a.dst]
subprocess.run(cmd, check=True)
print(a.dst, os.path.getsize(a.dst) // 1024, 'KiB')
