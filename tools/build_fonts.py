# Subset OFL fonts to exactly the characters used by the site.
import glob, os
from fontTools.ttLib import TTFont, TTCollection
from fontTools import subset
ROOT = os.path.join(os.path.dirname(__file__), '..', 'site')
text = ''
for f in glob.glob(ROOT + '/**/*', recursive=True):
    if f.endswith(('.js', '.html', '.css', '.json')):
        text += open(f, encoding='utf-8').read()
chars = set(text) | set(chr(c) for c in range(32, 127)) | set('　，。、！？；：“”‘’（）《》—…·♡✧♪→←')
chars = ''.join(sorted(c for c in chars if ord(c) >= 32))
print('chars', len(chars))
def sub(src, idx, out, keep=None):
    if src.endswith('.ttc'):
        font = TTCollection(src).fonts[idx]
    else:
        font = TTFont(src)
    opts = subset.Options(); opts.flavor = 'woff'; opts.layout_features = ['kern', 'liga', 'palt']; opts.name_IDs = ['*']; opts.notdef_outline = True
    s = subset.Subsetter(opts); s.populate(text=keep or chars); s.subset(font)
    font.flavor = 'woff'; font.save(out); print(out, os.path.getsize(out))
def scidx(path):
    for i, f in enumerate(TTCollection(path).fonts):
        if 'SC' in f['name'].getDebugName(1): return i
N = '/usr/share/fonts/opentype/noto/'
sub(N + 'NotoSerifCJK-Regular.ttc', scidx(N + 'NotoSerifCJK-Regular.ttc'), ROOT + '/assets/fonts/gift-serif.woff')
sub(N + 'NotoSerifCJK-SemiBold.ttc', scidx(N + 'NotoSerifCJK-SemiBold.ttc'), ROOT + '/assets/fonts/gift-serif-bold.woff')
latin = ''.join(chr(c) for c in range(32, 127)) + '’‘“”—–…·♡'
import subprocess
def find(name):
    return subprocess.run(['fc-match', '-f', '%{file}', name], capture_output=True, text=True).stdout
sub(find('TeX Gyre Chorus'), 0, ROOT + '/assets/fonts/gift-script.woff', latin)
sub(find('TeX Gyre Pagella:italic'), 0, ROOT + '/assets/fonts/gift-latin-italic.woff', latin)
sub(find('TeX Gyre Pagella'), 0, ROOT + '/assets/fonts/gift-latin.woff', latin)
