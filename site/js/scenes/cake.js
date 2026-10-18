// The birthday cake: a painting (FLUX.1-schnell on a Kaggle GPU, see tools/keyart.py) cut out of its black
// background, with the candles left unlit so the flames she lights are drawn live on the wicks.
import { asset, loadImage } from '../util.js';

// the cut-out's size; the foot of the gold stand sits on its bottom edge
export const CAKE_W = 682, CAKE_H = 1050;
// wick tips in cake pixels, left to right
export const CANDLES = [[122, 67], [196, 64], [300, 56], [422, 55], [510, 61], [564, 62]];
// flame height for these candles (about twice a candle's width), in cake pixels
export const FLAME = 52;

export const loadCake = () => loadImage(asset('img/cake.webp'));
