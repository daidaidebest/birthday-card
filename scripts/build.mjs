// "Build" = copy the finished static site into dist/ (the bundle js/gift.js is prebuilt and committed,
// so CI needs no dependencies). Run tools/build.sh locally after editing the JS sources.
import { cpSync, rmSync, existsSync } from 'node:fs';
const skip = /(^|\/)(preview\.html|\.DS_Store)$/;
rmSync('dist', { recursive: true, force: true });
cpSync('site', 'dist', { recursive: true, filter: src => !skip.test(src.replaceAll('\\', '/')) });
if (!existsSync('dist/index.html')) { console.error('build: dist/index.html missing'); process.exit(1); }
console.log('build: site → dist');
