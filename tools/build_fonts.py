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
# fc-match quietly substitutes another family when TeX Gyre is not installed; the Latin subsets never
# change with the site's text, so keep the existing files rather than overwrite them with the wrong face
for name, out in [('TeX Gyre Chorus', 'gift-script'), ('TeX Gyre Pagella:italic', 'gift-latin-italic'), ('TeX Gyre Pagella', 'gift-latin')]:
    path = find(name)
    if 'texgyre' in path.lower(): sub(path, 0, ROOT + f'/assets/fonts/{out}.woff', latin)
    else: print('skip', out, '(TeX Gyre not installed; existing subset kept)')
