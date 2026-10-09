// Checks the built site (dist/) or, with --url, the live deployment.
// Same name and flags as the old project's script, so the existing .github workflows keep working.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const urlArg = process.argv.indexOf('--url');
const must = ['index.html', 'js/gift.js', 'js/content.js', 'css/style.css', 'css/scenes.css'];
if (urlArg < 0) {
  const root = existsSync('dist') ? 'dist' : 'site';
  const missing = must.filter(f => !existsSync(join(root, f)));
  // every asset path the code and styles mention must exist
  const text = ['js/gift.js', 'js/content.js', 'css/style.css', 'css/scenes.css', 'index.html'].map(f => readFileSync(join(root, f), 'utf8')).join('\n');
  const refs = new Set([...text.matchAll(/assets\/(?:img|audio|fonts)\/[\w.\-]+\.(?:webp|png|jpe?g|svg|mp3|woff2?)/g)].map(m => m[0]));
  for (const r of refs) if (!existsSync(join(root, r))) missing.push(r);
  const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const depth = walk(join(root, 'assets/depth')).length;
  if (missing.length) { console.error('check: missing\n  ' + missing.join('\n  ')); process.exit(1); }
  console.log(`check: ${root}/ ok — ${refs.size} referenced assets, ${depth} depth-plane files`);
} else {
  const base = process.argv[urlArg + 1].replace(/\/?$/, '/');
  const get = async p => { for (let i = 0; i < 6; i++) { try { const r = await fetch(base + p, { cache: 'no-store' }); if (r.ok) return r; } catch {} await new Promise(r => setTimeout(r, 10000)); } throw new Error('unreachable: ' + base + p); };
  const html = await (await get('')).text();
  if (!html.includes('js/gift.js')) { console.error('check: live index.html does not load js/gift.js'); process.exit(1); }
  for (const p of must.slice(1)) await get(p);
  console.log('check: live site ok at ' + base);
}
