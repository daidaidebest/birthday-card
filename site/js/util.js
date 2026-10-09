// Shared math, easing, randomness, canvas and loading helpers.
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const inv = (a, b, x) => clamp((x - a) / (b - a));
export const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = t => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = t => Math.pow(clamp(t), 3);
export const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutBack = t => { t = clamp(t); const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const between = (t, a, b) => smooth((t - a) / (b - a));
/** 0 → 1 → 0 window: rises over [a,b], holds, falls over [c,d]. */
export const win = (t, a, b, c, d) => between(t, a, b) * (1 - between(t, c, d));
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const TAU = Math.PI * 2;

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const hash = i => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
export function noise1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }
export function noise2(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a, b) => hash(a * 57 + b * 113);
  return lerp(lerp(h(i, j), h(i + 1, j), ux), lerp(h(i, j + 1), h(i + 1, j + 1), ux), uy) * 2 - 1;
}
export const fbm = (x, y, o = 4) => { let a = 0, s = .5, f = 1; for (let i = 0; i < o; i++) { a += s * noise2(x * f, y * f); f *= 2.03; s *= .5; } return a; };

export function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

const imageCache = new Map();
export function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => resolve(img));
    img.onerror = () => reject(new Error('image ' + src));
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}
export const asset = p => 'assets/' + p;

/** Draw an image to cover a rect (like object-fit: cover) with focal point fx, fy. */
export function drawCover(ctx, img, x, y, w, h, fx = .5, fy = .5, zoom = 1) {
  const iw = img.width, ih = img.height;
  const s = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * s, dh = ih * s;
  ctx.drawImage(img, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
}
export function coverRect(iw, ih, w, h, fx = .5, fy = .5, zoom = 1) {
  const s = Math.max(w / iw, h / ih) * zoom; const dw = iw * s, dh = ih * s;
  return { x: (w - dw) * fx, y: (h - dh) * fy, w: dw, h: dh, s };
}

/** Soft radial glow sprite, cached by color. */
const glowCache = new Map();
export function glowSprite(color = '255,214,150', size = 128, falloff = 2.2) {
  const key = color + size + falloff;
  if (glowCache.has(key)) return glowCache.get(key);
  const c = canvas(size, size), g = c.getContext('2d');
  const img = g.createImageData(size, size); const r = size / 2;
  const [R, G, B] = color.split(',').map(Number);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + .5 - r, y + .5 - r) / r; const a = Math.pow(clamp(1 - d), falloff);
    const i = (y * size + x) * 4; img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B; img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0); glowCache.set(key, c); return c;
}
/** Four-point sparkle sprite. */
export function sparkleSprite(color = '255,236,190', size = 64) {
  const c = canvas(size, size), g = c.getContext('2d'); const r = size / 2;
  g.translate(r, r); g.drawImage(glowSprite(color, size, 3), -r, -r);
  g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(${color},1)`;
  for (const [sx, sy] of [[1, .07], [.07, 1]]) { g.beginPath(); g.ellipse(0, 0, r * sx, r * sy, 0, 0, TAU); g.fill(); }
  g.drawImage(glowSprite('255,255,255', size / 3, 2), -size / 6, -size / 6);
  return c;
}

export const isPortrait = () => innerHeight > innerWidth * 1.05;

/** Wraps Chinese text into lines that fit maxWidth. */
export function wrapText(ctx, text, maxWidth) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        if ('，。、！？；：”’）》'.includes(ch)) { line += ch; out.push(line); line = ''; continue; }
        out.push(line); line = ch;
      } else line += ch;
    }
    out.push(line);
  }
  return out;
}
export function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
