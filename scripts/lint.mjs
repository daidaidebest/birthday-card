// Lightweight lint for a dependency-free site: every script parses, and the bundle is not older than its sources.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
let bad = 0;
const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk('site/js').filter(f => f.endsWith('.js'))) {
  const src = readFileSync(f, 'utf8');
  try {
    if (/^\s*(import|export)\s/m.test(src)) continue; // ES modules are checked through the bundle below
    else new vm.Script(src, { filename: f });
  } catch (e) { bad++; console.error(`lint: ${f}: ${e.message}`); }
}
try { new vm.Script(readFileSync('site/js/gift.js', 'utf8'), { filename: 'gift.js' }); } catch (e) { bad++; console.error('lint: gift.js does not parse: ' + e.message); }
const newest = Math.max(...walk('site/js').filter(f => !f.endsWith('gift.js') && !f.endsWith('content.js')).map(f => statSync(f).mtimeMs));
if (statSync('site/js/gift.js').mtimeMs + 2000 < newest) console.warn('lint: warning — js sources look newer than js/gift.js; run tools/build.sh');
if (bad) process.exit(1);
console.log('lint: ok');
