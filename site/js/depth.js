// 2.5D camera: paintings split offline into depth planes (tools/depth.py + tools/layers.py, Depth Anything V2)
// are re-composited every frame with per-plane parallax and a dolly, so a still painting reads as a
// real space the camera floats through. Planes are either drawn into a canvas or placed as DOM
// images moved only by compositor transforms; both share the same projection.
import { DEPTH } from './depth-data.js';
import { asset, loadImage } from './util.js';

export const hasDepth = name => !!DEPTH[name];

/** Loads the planes of a painting; resolves to null when no depth data exists for it. */
export async function loadDepth(name) {
  const m = DEPTH[name]; if (!m) return null;
  if (!m.ready) m.ready = Promise.all(m.layers.map((l, i) => loadImage(asset(`depth/${name}/${i}.webp`)))).then(imgs => {
    const z0 = m.layers[0].z, z1 = m.layers[m.layers.length - 1].z;
    m.layers.forEach((l, i) => { l.img = imgs[i]; l.d = (l.z - z0) / (z1 - z0 || 1); }); // 0 = farthest, 1 = nearest
    return m;
  });
  return m.ready;
}
/** Depth plane set name for a photo path such as assets/img/photo-x.webp */
export const depthNameFor = src => (src.match(/([^/]+)\.(webp|jpe?g|png)$/i) || [])[1];

/**
 * A view of one painting.
 *   base   – how the whole painting maps to the screen with a still camera: screenX = base.x + base.s * imageX
 *   cam    – { x, y } pan in [-1.3, 1.3], zoom (dolly, 0…~.1), focus (the depth that stays put, 0…1)
 *   amp    – parallax strength as a fraction of the painting's on-screen width
 */
export class DepthView {
  constructor(m, { amp = .03, focus = .45 } = {}) {
    this.m = m; this.amp = amp; this.focus = focus;
    this.T = m.layers.map(() => ({ s: 1, x: 0, y: 0 }));
    this.base = { s: 1, x: 0, y: 0 }; this.pivot = [0, 0]; this.cam = { x: 0, y: 0, zoom: 0, focus };
  }
  /** Extra scale that keeps the moving planes covering the frame. */
  get over() { const f = this.cam.focus ?? this.focus; return 1 + 2.7 * this.amp * Math.max(f, 1 - f); }
  /** Places the camera. pivot: the screen point the dolly pushes toward. */
  frame(base, cam, pivot) {
    this.base = base; this.cam = cam; this.pivot = pivot;
    this.m.layers.forEach((l, i) => this.at(l.d, this.T[i]));
    return this;
  }
  /** Projection for any depth in [0,1] (to attach effects such as stars or glints to a plane). */
  at(d, out = {}) {
    const { base, cam, pivot: [px, py] } = this, f = cam.focus ?? this.focus, rel = d - f;
    const sl = this.over * (1 + (cam.zoom || 0) * d), w = base.s * this.m.w;
    out.s = base.s * sl;
    out.x = px + (base.x - px) * sl - (cam.x || 0) * this.amp * w * rel;
    out.y = py + (base.y - py) * sl - (cam.y || 0) * this.amp * w * rel;
    return out;
  }
  /** Draws planes [from, to) into a 2D context. */
  draw(g, from = 0, to = this.m.layers.length) {
    for (let i = from; i < to; i++) {
      const l = this.m.layers[i], T = this.T[i];
      g.drawImage(l.img, T.x + T.s * l.x, T.y + T.s * l.y, l.w * T.s, l.h * T.s);
    }
  }
  /** Creates one <img> per plane inside parent (absolutely placed, moved by transforms only). */
  mount(parent, cls = 'dp-layer') {
    this.els = this.m.layers.map((l, i) => {
      const im = new Image(); im.src = l.img.src; im.alt = ''; im.decoding = 'async'; im.className = cls;
      Object.assign(im.style, { position: 'absolute', left: 0, top: 0, width: l.w + 'px', height: l.h + 'px', transformOrigin: '0 0', willChange: 'transform', maxWidth: 'none', pointerEvents: 'none' });
      parent.appendChild(im); return im;
    });
    return this.els;
  }
  /** Pushes the current frame to the mounted planes. */
  apply() {
    this.els?.forEach((im, i) => {
      const l = this.m.layers[i], T = this.T[i];
      const v = `matrix(${T.s.toFixed(5)},0,0,${T.s.toFixed(5)},${(T.x + T.s * l.x).toFixed(2)},${(T.y + T.s * l.y).toFixed(2)})`;
      if (im._t !== v) { im._t = v; im.style.transform = v; }
    });
  }
}

/** Cover-fit base mapping of an image into a box, focal point fx/fy. */
export function coverBase(iw, ih, W, H, fx = .5, fy = .5, zoom = 1, ox = 0, oy = 0) {
  const s = Math.max(W / iw, H / ih) * zoom;
  return { s, x: ox + (W - iw * s) * fx, y: oy + (H - ih * s) * fy };
}

/** Slow, organic camera wander (sum of incommensurate sines), in [-1, 1]. */
export function wander(t, seed = 0, speed = 1) {
  const u = t * speed;
  return {
    x: Math.sin(u * .23 + seed) * .62 + Math.sin(u * .51 + seed * 2.1) * .28,
    y: Math.sin(u * .19 + seed * 1.7) * .45 + Math.sin(u * .43 + seed * .6) * .2,
  };
}
