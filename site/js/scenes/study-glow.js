// The cozy study's own lights, brought to life over the painting: the fairy-light bulbs twinkle, the fire and the
// lamps breathe, and (in the cake scene) lanterns can drift past beyond the window glass.
import { asset, loadImage, canvas, glowSprite, noise1 } from '../util.js';
import { LIGHTS } from './study-lights.js';

const glass = {};
export const loadGlass = name => glass[name] || (glass[name] = loadImage(asset(`img/${name}-glass.png`)));
let bulbS, fireS;

/** Draws the lights of painting `name` with g's transform set to painting pixels (on the plane they sit on). */
export function studyLights(g, name, t, k = 1) {
  if (k <= .01) return;
  const L = LIGHTS[name]; if (!L) return;
  bulbS = bulbS || glowSprite('255,206,130', 32, 1.7); fireS = fireS || glowSprite('255,150,60', 64, 1.4);
  g.save(); g.globalCompositeOperation = 'lighter';
  L.bulbs.forEach(([x, y, s], i) => {
    const tw = .55 + .45 * Math.sin(t * (1.1 + (i * 7 % 13) * .12) + i * 2.3), r = 6 + s * 1.6;
    g.globalAlpha = k * .5 * tw; g.drawImage(bulbS, x - r, y - r, r * 2, r * 2);
  });
  L.fires.forEach(([x, y, w, h], i) => {
    const f = .7 + .2 * noise1(t * 3.1 + i * 5) + .1 * noise1(t * 9.3 + i), r = Math.max(w, h) * 2.4 + 40;
    g.globalAlpha = k * .35 * f; g.drawImage(fireS, x + w / 2 - r, y + h / 2 - r, r * 2, r * 2);
  });
  g.restore();
}

/** The window glass of painting `name` as a clip: calls draw(gw) with gw in painting pixels, keeps only the glass. */
let tmp = null;
export function behindGlass(g, name, img, scale, draw) {
  const [x0, y0, x1, y1] = LIGHTS[name].glass, w = Math.ceil((x1 - x0) * scale), h = Math.ceil((y1 - y0) * scale);
  if (!img || w < 2 || h < 2) return;
  if (!tmp) tmp = canvas(w, h);
  if (tmp.width !== w || tmp.height !== h) { tmp.width = w; tmp.height = h; }
  const tg = tmp.getContext('2d'); tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, w, h);
  tg.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale); draw(tg);
  tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(img, 0, 0, w, h);
  g.drawImage(tmp, x0, y0, x1 - x0, y1 - y0);
}
export const glassRect = name => LIGHTS[name].glass;
