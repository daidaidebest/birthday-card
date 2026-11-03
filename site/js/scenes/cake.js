// The birthday cake: a painting (FLUX.1-schnell on a Kaggle GPU, see tools/keyart.py) cut out of its black
// background, with the candles left unlit so the flames she lights are drawn live on the wicks. The painted
// candles came out far too tall; tools/cake_candles.py shortens each stem by cutting out its middle.
import { asset, loadImage } from '../util.js';

// the cut-out's size; the foot of the gold stand sits on its bottom edge
export const CAKE_W = 682, CAKE_H = 1050;
// wick tips in cake pixels, left to right
export const CANDLES = [[126, 207], [198, 204], [302, 196], [422, 195], [509, 201], [562, 202]];
// flame height for these candles (about twice a candle's width), in cake pixels
export const FLAME = 52;

export const loadCake = () => loadImage(asset('img/cake.webp'));
