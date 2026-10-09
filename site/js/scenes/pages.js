// Page artwork for the magic book. Every page is drawn into a canvas at its real size;
// "prog" is seconds of handwriting on that page, so ink appears stroke by stroke.
import { canvas, clamp, lerp, between, rng, TAU, glowSprite } from '../util.js';

export const INK = '#2b1b0f', SEPIA = '#6d4c2a', GOLD_A = '#c99a45', GOLD_B = '#f3d58e';
const SERIF = 'GiftSerif, "Noto Serif SC", "Songti SC", serif', LATIN = 'GiftLatin, Palatino, Georgia, serif';

// ---------------- geography shared with the journey ----------------
export const CHINA_OUTLINE = 'M650.7 736.5L639.2 731.1L638.8 716.1L645.7 708.1L661 703.2L669 703.6L672.1 710.3L666 718L662.7 728.1L650.7 736.5ZM241.6 313.9L240.5 303.9L250.1 299.3L237.5 268.9L265.3 262L272.4 258.1L282.5 226.7L310.3 232.5L318.1 224.6L318.8 207L330.4 205.4L341 193.7L346.5 192.3L350.2 204.5L362 213.8L381.9 220.4L391.6 234.5L386.2 254.9L391.2 262.5L407.9 265.5L426.7 267.9L443.6 278.8L452.3 280.8L458.7 296.9L466.9 307.3L482.3 306.9L511.2 310.8L529.8 308.4L543.7 311L564.4 321.6L581.3 321.6L587.5 327L603.8 317.6L626.4 311.6L647.4 310.9L663.8 304.8L673.8 295.4L683.6 289.5L681.3 283.7L676.9 277L684.2 265.7L692.1 267.3L706.5 270.8L720.4 261.6L741.8 254.8L752.1 243.2L761.9 238.2L782.2 235.9L793.3 237.9L794.8 231.7L782.1 219.4L770.9 213.8L760.1 220.3L746.3 217.6L738.4 219.8L734.8 212.6L744.7 195.1L751.5 182L768.3 188.6L788 177.5L787.9 169.8L800.5 151.2L808.3 145.6L808.2 136L800.5 131.8L812 123.1L829.4 119.9L848 119.5L869 124.7L881.2 131.1L889.9 148.8L895.1 156.3L900 167.1L905.2 184.2L929.6 189.8L946.2 202.2L951.8 218.7L973.1 218.7L985.2 211.8L1008.4 206.6L1001 222.4L995.6 228.8L990.8 248L981.4 265L964.4 261.9L952.4 268.1L956 283L954 303.7L946.9 304.2L947 313.1L937.9 302.8L932.4 312.6L910.7 320.1L912.9 329.3L900.8 328.7L894.2 323.2L884.5 335.6L869.1 345L857.7 356.3L838.1 361.3L827.8 369.5L812.8 374.3L820.2 366.2L817.3 359.4L828.4 347.6L821 338.4L808.8 344.6L793 356.8L784.3 368.1L770.6 368.9L763.5 377.1L770.8 388.9L782.3 391.8L782.8 399.7L793.8 404.8L809.5 392.3L822 399.1L831 399.5L833.3 408.7L813.5 413.6L806.9 423L793.3 431.8L786.1 444.1L801.2 453.7L806.7 470.9L815.2 486.9L824.7 500.4L824.5 513.4L815.7 518.2L819 527.5L827.3 532.9L825.1 547.2L821.6 561.1L813.8 562.6L803.5 581.6L792.2 604.5L779.2 625.4L759.9 641.6L740.5 656.3L724.7 658.3L716.1 666.1L711.3 660.4L703.4 669.1L683.8 677.9L669 680.5L664.2 699L656.5 700.1L652.8 687.4L656.1 680.6L637.3 675L630.7 677.8L616.6 673.3L609.9 666.2L612.2 656.1L599.4 652.9L592.6 646.3L580.7 655.7L567.1 657.7L555.9 657.6L548.4 661.9L541.1 664.4L543.2 684.4L535.8 684L534.5 679.9L534.1 672.6L523.8 677.7L517.8 674.5L507.4 667.9L511.4 653.4L502.6 650L499.2 633.9L484.5 636.8L486.1 616L499.4 601.4L500 587L499.6 573.6L493.4 569.4L488.8 559.1L480.6 560.4L465.5 557.8L470.2 550.5L463.6 539.6L453.7 546.9L441.9 542.6L425.8 553.8L413 566.8L401.8 569L395.6 564.3L388.2 563.9L378.2 559.8L370.7 564.3L361.4 577.3L360.2 563.5L351.7 567.2L335.4 565.5L319.5 561.4L308.2 553.8L297.3 550.3L292.6 541.9L284.7 539.4L270.6 528L259.4 522.6L253.6 526.8L234.1 514.6L220.3 503.5L216.4 484.2L226.5 486.5L226.9 477.6L221.4 468.6L222.8 454.4L207.7 433.9L184.7 426.8L180.6 413.3L170.2 405.2L167.7 400.2L165.6 390.2L166.1 383.4L157.6 379.4L153 381.1L149.5 365L153.4 360.9L151.5 356.9L164.9 348.6L174.5 345.2L189.4 347.5L194.7 336.3L212.6 334.3L217.6 327.3L239.7 317.8L241.6 313.9ZM822.9 628.1L814.5 656.2L808.5 670.5L801.1 655.7L799.5 642.8L807.7 625.6L818.9 612.3L825.3 617.5L822.9 628.1Z';
export const CITIES = {
  zhoukou: { name: '周口', lon: 114.65, lat: 33.62 }, tianjin: { name: '天津', lon: 117.2, lat: 39.08 }, beijing: { name: '北京', lon: 116.39, lat: 39.9 },
  hongkong: { name: '香港', lon: 114.18, lat: 22.31 }, shenzhen: { name: '深圳', lon: 114.06, lat: 22.55 },
  wuhan: { name: '武汉', lon: 114.27, lat: 30.58 }, nanjing: { name: '南京', lon: 118.78, lat: 32.05 }, shanghai: { name: '上海', lon: 121.43, lat: 31.22 },
  tokyo: { name: '东京', lon: 139.69, lat: 35.69 },
};
// Natural Earth 1:110m (public domain), same projection as CHINA_OUTLINE: the last stop of both roads.
export const JAPAN_OUTLINE = 'M1104.4 369.3L1091.4 387.0L1091.7 405.0L1086.4 419.0L1088.8 427.7L1081.5 440.1L1063.7 448.3L1039.0 449.4L1019.1 469.4L1009.7 462.6L1009.1 449.6L984.8 453.4L968.2 461.7L951.8 462.0L966.0 474.9L956.7 504.6L947.6 512.0L940.8 505.2L944.3 489.4L935.4 484.3L929.7 472.3L943.0 466.9L950.3 455.9L964.4 446.9L974.6 434.9L1002.5 429.7L1017.5 433.3L1032.1 402.2L1041.5 410.5L1062.0 393.0L1070.0 386.2L1078.8 364.8L1076.4 345.1L1082.3 334.1L1097.2 330.9L1104.8 355.1L1104.4 369.3ZM1142.6 285.7L1152.5 278.3L1155.6 297.9L1134.8 302.7L1122.6 320.1L1100.6 308.1L1092.9 327.3L1077.4 327.5L1075.4 310.1L1082.4 296.7L1097.3 295.7L1101.4 271.5L1105.5 257.8L1122.0 276.1L1132.7 282.0L1142.6 285.7ZM971.2 469.4L978.9 458.9L986.9 461.0L992.7 453.6L1002.9 457.4L1004.7 463.4L996.8 474.0L991.1 468.4L983.9 472.4L980.2 482.7L971.1 477.7L971.2 469.4Z';
export const mapXY = c => [140 + (c.lon - 73) * 14, 110 + (54 - c.lat) * 17.5];
export const HER_ROUTE = ['zhoukou', 'tianjin', 'beijing', 'hongkong', 'shenzhen', 'tokyo'];
export const HIS_ROUTE = ['wuhan', 'nanjing', 'shanghai', 'shenzhen', 'tokyo'];

// ---------------- paper ----------------
const paperCache = new Map();
export function paper(w, h, side, tex, tint = '#ecdcb7') {
  const key = [w, h, side, tint].join();
  if (paperCache.has(key)) return paperCache.get(key);
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = tint; g.fillRect(0, 0, w, h);
  if (tex) { g.globalAlpha = .55; g.globalCompositeOperation = 'multiply'; const p = g.createPattern(tex, 'repeat'); g.fillStyle = p; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
  const R = rng(side === 'left' ? 3 : 9);
  for (let i = 0; i < 9; i++) { // foxing: soft age spots
    const x = R() * w, y = R() * h, r = (R() * 18 + 4) * w / 500;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(140,96,48,.12)'); gr.addColorStop(1, 'rgba(140,96,48,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const v = g.createRadialGradient(w / 2, h * .45, Math.min(w, h) * .3, w / 2, h / 2, Math.max(w, h) * .78);
  v.addColorStop(0, 'rgba(120,80,40,0)'); v.addColorStop(1, 'rgba(110,70,30,.32)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
  // gutter: the page curves into the spine
  const gx = side === 'left' ? w : 0, gutter = g.createLinearGradient(gx, 0, side === 'left' ? w * .82 : w * .18, 0);
  gutter.addColorStop(0, 'rgba(60,35,15,.42)'); gutter.addColorStop(.35, 'rgba(60,35,15,.12)'); gutter.addColorStop(1, 'rgba(60,35,15,0)');
  g.fillStyle = gutter; g.fillRect(0, 0, w, h);
  // outer edge darkening
  const ex = side === 'left' ? 0 : w, edge = g.createLinearGradient(ex, 0, side === 'left' ? w * .06 : w * .94, 0);
  edge.addColorStop(0, 'rgba(90,60,25,.25)'); edge.addColorStop(1, 'rgba(90,60,25,0)'); g.fillStyle = edge; g.fillRect(0, 0, w, h);
  paperCache.set(key, c); return c;
}

// ---------------- primitives ----------------
const glow = glowSprite('255,214,140', 64, 2);
/** Lay out text lines; returns chars with positions and the time each is written. */
export function layoutText(g, w, { lines, x = .5, y = .3, size = .055, lh = 1.9, align = 'center', start = 0, cps = 9, font = SERIF, weight = 400, color = INK, gold = false, spacing = .08 }) {
  const fs = size * w; g.font = `${weight} ${fs}px ${font}`;
  const out = []; let t = start;
  lines.forEach((line, li) => {
    const chars = [...line]; const widths = chars.map(c => g.measureText(c).width + fs * spacing);
    const total = widths.reduce((a, b) => a + b, 0) - fs * spacing;
    let cx = align === 'center' ? x * w - total / 2 : align === 'right' ? x * w - total : x * w;
    const cy = y * w + li * fs * lh;
    chars.forEach((ch, i) => { out.push({ ch, x: cx, y: cy, t, fs, color, gold, weight, font }); cx += widths[i]; t += '，。、；：！？—'.includes(ch) ? 2.4 / cps / 2.7 : 1 / cps / 2.7; });
    if (line) t += 1.2 / cps;
  });
  return { chars: out, end: t };
}
export function drawText(g, L, prog, w, time = 0) {
  let pen = null, font = '';
  g.textBaseline = 'alphabetic';
  for (const c of L.chars) {
    const a = clamp((prog - c.t) / .3); if (a <= 0) { if (!pen) pen = c; break; }
    const f = c.font_ || (c.font_ = `${c.weight} ${c.fs}px ${c.font}`); if (f !== font) { g.font = f; font = f; }
    if (c.gold) {
      const gr = g.createLinearGradient(c.x, c.y - c.fs, c.x + c.fs, c.y);
      const sh = (Math.sin(time * 1.6 + c.x * .02) + 1) / 2;
      gr.addColorStop(0, '#8a5f22'); gr.addColorStop(.45 + sh * .2, GOLD_B); gr.addColorStop(1, GOLD_A);
      g.fillStyle = gr;
    } else g.fillStyle = c.color;
    g.globalAlpha = a; g.fillText(c.ch, c.x, c.y);
    if (a < 1) { g.globalAlpha = (1 - a) * .9; g.globalCompositeOperation = 'lighter'; const s = c.fs * 1.6; g.drawImage(glow, c.x - s * .2, c.y - c.fs * .9, s, s); g.globalCompositeOperation = 'source-over'; pen = pen || c; }
  }
  g.globalAlpha = 1;
  return pen;
}
export function ornament(g, cx, cy, width, color = SEPIA, a = 1) {
  g.save(); g.globalAlpha = a; g.strokeStyle = color; g.fillStyle = color; g.lineWidth = Math.max(1, width * .006);
  const hw = width / 2;
  g.beginPath(); g.moveTo(cx - hw, cy); g.bezierCurveTo(cx - hw * .6, cy - width * .03, cx - hw * .3, cy + width * .03, cx - width * .05, cy); g.stroke();
  g.beginPath(); g.moveTo(cx + hw, cy); g.bezierCurveTo(cx + hw * .6, cy - width * .03, cx + hw * .3, cy + width * .03, cx + width * .05, cy); g.stroke();
  g.beginPath(); g.moveTo(cx, cy - width * .035); g.lineTo(cx + width * .03, cy); g.lineTo(cx, cy + width * .035); g.lineTo(cx - width * .03, cy); g.closePath(); g.fill();
  for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * hw * .55, cy - width * .02, width * .018, 0, TAU); g.stroke(); }
  g.restore();
}
function corners(g, w, h, a = .55) {
  g.save(); g.strokeStyle = SEPIA; g.globalAlpha = a * .5; g.lineWidth = Math.max(1, w * .002);
  const m = w * .06, l = w * .06;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
    g.beginPath(); g.moveTo(x, y + sy * l); g.lineTo(x, y); g.lineTo(x + sx * l, y); g.stroke();
    g.beginPath(); g.arc(x + sx * l * .25, y + sy * l * .25, w * .004, 0, TAU); g.stroke();
  }
  g.restore();
}
function folio(g, w, h, n) {
  g.save(); g.fillStyle = SEPIA; g.globalAlpha = .55; g.font = `italic ${w * .028}px ${LATIN}`; g.textAlign = 'center'; g.fillText(n, w / 2, h - w * .07); g.restore();
}
function latin(g, text, x, y, size, a = .6) { g.save(); g.fillStyle = SEPIA; g.globalAlpha = a; g.font = `italic ${size}px ${LATIN}`; g.textAlign = 'center'; g.fillText(text.split('').join(String.fromCharCode(8202)), x, y); g.restore(); }
function plate(g, img, x, y, w, h, prog = 1) {
  g.save();
  g.shadowColor = 'rgba(40,25,10,.35)'; g.shadowBlur = w * .03; g.shadowOffsetY = w * .01;
  g.fillStyle = '#efe4c9'; g.fillRect(x - w * .03, y - w * .03, w * 1.06, h + w * .06); g.shadowColor = 'transparent';
  const s = Math.max(w / img.width, h / img.height); const sw = w / s, sh = h / s;
  g.globalAlpha = .95; g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  g.globalAlpha = 1; g.strokeStyle = 'rgba(110,76,42,.5)'; g.lineWidth = 1; g.strokeRect(x - w * .015, y - w * .015, w * 1.03, h + w * .03);
  // photo corners
  g.fillStyle = 'rgba(70,45,22,.75)';
  for (const [cx, cy, sx, sy] of [[x - w * .03, y - w * .03, 1, 1], [x + w * 1.03, y - w * .03, -1, 1], [x - w * .03, y + h + w * .03, 1, -1], [x + w * 1.03, y + h + w * .03, -1, -1]]) {
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + sx * w * .09, cy); g.lineTo(cx, cy + sy * w * .09); g.closePath(); g.fill();
  }
  g.restore();
}
/** Progressive ink stroke along a polyline (points in px). */
function inkLine(g, pts, k, width, color = INK) {
  if (k <= 0) return;
  let total = 0; const seg = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let left = total * clamp(k);
  g.save(); g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  let end = pts[0];
  for (let i = 1; i < pts.length && left > 0; i++) {
    const d = seg[i - 1], f = Math.min(1, left / d);
    end = [lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]; g.lineTo(end[0], end[1]); left -= d;
  }
  g.stroke(); g.restore();
  return end;
}
function circlePts(cx, cy, r, a0 = 0, a1 = TAU, n = 60) { return Array.from({ length: n + 1 }, (_, i) => { const a = lerp(a0, a1, i / n); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }); }

// ---------------- the book ----------------
/** Returns page definitions; each has draw(g, w, h, prog, time) → { pen } and a writing duration. */
export function buildPages(assets) {
  const P = [];
  const page = (side, build) => P.push({ side, build });

  // Spread 0 — endpaper bookplate | title page
  page('left', (g, w, h) => {
    const L = layoutText(g, w, { lines: ['此书属于'], y: .62 * h / w, size: .045, color: SEPIA, start: .2, cps: 6 });
    const N = layoutText(g, w, { lines: ['师宝宝'], y: .74 * h / w, size: .1, weight: 600, gold: true, start: L.end + .3, cps: 3.2, spacing: .18 });
    return { dur: N.end + .6, draw(prog, time) {
      // marbled endpaper border + bookplate
      g.save(); g.strokeStyle = 'rgba(109,76,42,.55)'; g.lineWidth = w * .004; g.strokeRect(w * .08, h * .06, w * .84, h * .88); g.lineWidth = 1; g.strokeRect(w * .1, h * .075, w * .8, h * .85); g.restore();
      const bx = w * .2, by = h * .3, bw = w * .6, bh = h * .52;
      g.save(); g.fillStyle = 'rgba(245,234,208,.75)'; g.fillRect(bx, by, bw, bh); g.strokeStyle = 'rgba(109,76,42,.6)'; g.lineWidth = w * .003; g.strokeRect(bx, by, bw, bh); g.strokeRect(bx + w * .015, by + w * .015, bw - w * .03, bh - w * .03); g.restore();
      drawStarCrest(g, w / 2, by + bh * .22, w * .1);
      latin(g, 'EX LIBRIS', w / 2, by + bh * .42, w * .03);
      const a = drawText(g, L, prog, w, time), b = drawText(g, N, prog, w, time);
      ornament(g, w / 2, by + bh * .9, w * .3, SEPIA, .7);
      return { pen: a || b };
    } };
  });
  page('right', (g, w, h) => {
    const T = layoutText(g, w, { lines: ['写给师宝宝的', '一场梦'], y: .36 * h / w, size: .078, weight: 600, lh: 1.6, start: .2, cps: 4.5, spacing: .14 });
    const S = layoutText(g, w, { lines: ['今晚，这本书只为你打开。'], y: .66 * h / w, size: .04, color: SEPIA, start: T.end + .5, cps: 7 });
    return { dur: S.end + .5, draw(prog, time) {
      corners(g, w, h); latin(g, 'A BOOK THAT KNOWS ONLY YOU', w / 2, h * .2, w * .026);
      ornament(g, w / 2, h * .24, w * .34);
      const a = drawText(g, T, prog, w, time); ornament(g, w / 2, h * .56, w * .22, SEPIA, between(prog, T.end - .5, T.end + .3)); const b = drawText(g, S, prog, w, time);
      folio(g, w, h, 'i'); return { pen: a || b };
    } };
  });

  // Spread 1 — notes on light | the book remembers your name
  page('left', (g, w, h) => ({ dur: 0, draw() { corners(g, w, h); plate(g, assets.spell, w * .17, h * .12, w * .66, h * .64); latin(g, 'De Lumine · 关于光的笔记', w / 2, h * .87, w * .03, .7); folio(g, w, h, 'ii'); return {}; } }));
  page('right', (g, w, h) => {
    const T = layoutText(g, w, { lines: ['这本书，', '记不住所有咒语，', '却记得你的名字。', '', '它没有收藏整个世界，', '只想把一些温柔的光，', '留在你翻开它的时候。'], x: .14, y: .2 * h / w, size: .056, lh: 2.05, align: 'left', start: .3, cps: 8 });
    return { dur: T.end + .4, draw(prog, time) { corners(g, w, h); latin(g, 'FOLIUM I', w / 2, h * .1, w * .025); const p = drawText(g, T, prog, w, time); folio(g, w, h, 'iii'); return { pen: p }; } };
  });

  // Spread 2 — ten thousand sentences, one leans toward you | constellation
  page('left', (g, w, h) => {
    const T = layoutText(g, w, { lines: ['书里有万千字句，'], y: .2 * h / w, size: .058, weight: 600, start: .2, cps: 6 });
    const F = layoutText(g, w, { lines: ['有一句，偏向你。'], y: .62 * h / w, size: .07, start: 0, cps: 100, color: '#5a1a1a' });
    const R = rng(21); const scatter = F.chars.map(() => ({ x: (R() * .7 + .15) * w, y: (R() * .28 + .3) * h, r: (R() - .5) * 1.4 }));
    const gatherStart = T.end + .3;
    // faint "other sentences" texture
    const filler = '风吹过很远的地方月亮落在湖面上有人在灯下读诗山海之间的路很长很长';
    return { dur: gatherStart + 2.8, draw(prog, time) {
      corners(g, w, h); latin(g, 'INTER VERBA', w / 2, h * .1, w * .025);
      const p = drawText(g, T, prog, w, time);
      g.save(); g.fillStyle = SEPIA; g.globalAlpha = .16; g.font = `${w * .03}px ${SERIF}`;
      for (let r = 0; r < 7; r++) g.fillText(filler.slice(r * 3, r * 3 + 22), w * .14, h * (.3 + r * .045)); g.restore();
      F.chars.forEach((c, i) => {
        const k = between(prog, gatherStart + i * .13, gatherStart + 1.1 + i * .13), s = scatter[i];
        const x = lerp(s.x, c.x, k), y = lerp(s.y, c.y, k);
        g.save(); g.translate(x + c.fs / 2, y - c.fs / 3); g.rotate(s.r * (1 - k)); g.globalAlpha = lerp(.22, 1, k);
        g.fillStyle = k > .98 ? '#5a1a1a' : INK; g.font = `${c.weight} ${c.fs}px ${c.font}`; g.fillText(c.ch, -c.fs / 2, c.fs / 3); g.restore();
        if (k > 0 && k < 1) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.sin(k * Math.PI) * .8; g.drawImage(glow, x - c.fs * .3, y - c.fs * 1.1, c.fs * 1.6, c.fs * 1.6); g.restore(); }
      });
      const u = between(prog, gatherStart + 2.1, gatherStart + 2.7); if (u > 0) inkLine(g, [[w * .28, h * .67], [w * .72, h * .67]], u, w * .003, '#7a2a2a');
      folio(g, w, h, 'iv'); return { pen: p };
    } };
  });
  page('right', (g, w, h) => {
    const T = layoutText(g, w, { lines: ['就像夜空里，', '有那么多星星，', '我还是会，', '先找到你。'], x: .16, y: .62 * h / w, size: .05, lh: 2, align: 'left', start: 2.6, cps: 7 });
    const cx = w * .55, cy = h * .3, r = w * .17;
    const stars = [[.2, .14], [.33, .22], [.42, .16], [.55, .28], [.66, .2], [.78, .3], [.62, .4]].map(([x, y]) => [x * w, y * h + h * .02]);
    return { dur: T.end + .4, draw(prog, time) {
      corners(g, w, h);
      inkLine(g, circlePts(cx, cy, r, -1.1, 2.6, 70), between(prog, .1, 1.1), w * .004);
      inkLine(g, circlePts(cx + r * .42, cy - r * .2, r * .86, -1.25, 2.75, 70), between(prog, .7, 1.6), w * .0025, SEPIA);
      const k = between(prog, 1.4, 2.5); inkLine(g, stars, k, w * .0018, SEPIA);
      stars.forEach(([x, y], i) => { const a = between(prog, 1.4 + i * .14, 1.7 + i * .14); if (a <= 0) return; g.save(); g.globalAlpha = a; drawStar(g, x, y, w * (i === 3 ? .022 : .012), i === 3 ? '#9a6a1e' : INK); g.restore(); });
      const tw = (Math.sin(time * 2.4) + 1) / 2; if (prog > 2.6) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .25 + tw * .3; g.drawImage(glow, stars[3][0] - w * .06, stars[3][1] - w * .06, w * .12, w * .12); g.restore(); }
      const p = drawText(g, T, prog, w, time); folio(g, w, h, 'v'); return { pen: p };
    } };
  });

  // Spread 3 — pressed rose | favouritism has a name
  page('left', (g, w, h) => ({ dur: 0, draw() { corners(g, w, h); plate(g, assets.botanical, w * .17, h * .1, w * .66, h * .68); latin(g, 'Rosa · 压在书页里的花', w / 2, h * .88, w * .03, .7); folio(g, w, h, 'vi'); return {}; } }));
  page('right', (g, w, h) => {
    const T = layoutText(g, w, { lines: ['原来，偏爱也有名字。'], y: .22 * h / w, size: .056, weight: 600, start: .3, cps: 6 });
    const B = layoutText(g, w, { lines: ['它不声张，也不计数，', '只是在每一个', '寻常的日子里，', '悄悄多分给你一点。'], x: .16, y: .4 * h / w, size: .05, lh: 2.1, align: 'left', start: T.end + .5, cps: 8 });
    return { dur: B.end + .6, draw(prog, time) {
      corners(g, w, h); latin(g, 'NOMEN AMORIS', w / 2, h * .1, w * .025);
      const a = drawText(g, T, prog, w, time); ornament(g, w / 2, h * .3, w * .26, SEPIA, between(prog, T.end, T.end + .6)); const b = drawText(g, B, prog, w, time);
      // a small hand-drawn heart, signed in red ink
      const k = between(prog, B.end - .3, B.end + .5); if (k > 0) inkLine(g, heartPts(w * .72, h * .84, w * .045), k, w * .004, '#8a2424');
      folio(g, w, h, 'vii'); return { pen: a || b };
    } };
  });

  // Spread 5 — the story begins | an ink map where two pairs of footsteps set out
  page('left', (g, w, h) => {
    const T = layoutText(g, w, { lines: ['故事，', '从这里开始。'], y: .3 * h / w, size: .075, weight: 600, lh: 1.7, start: .3, cps: 4 });
    const B = layoutText(g, w, { lines: ['想带你去看一看，', '两条路是怎样靠近的。', '一串脚印属于你，', '一串属于我。'], y: .62 * h / w, size: .048, lh: 2.1, color: SEPIA, start: T.end + .5, cps: 7 });
    return { dur: B.end + .3, draw(prog, time) { corners(g, w, h); latin(g, 'INITIUM', w / 2, h * .1, w * .025); const a = drawText(g, T, prog, w, time); ornament(g, w / 2, h * .52, w * .3, SEPIA, between(prog, T.end, T.end + .5)); const b = drawText(g, B, prog, w, time); folio(g, w, h, 'viii'); return { pen: a || b }; } };
  });
  page('right', (g, w, h) => {
    const map = new Path2D(CHINA_OUTLINE);
    const box = { x: w * .02, y: h * .12, s: w * .96 / 1100 };
    const her = trail(HER_ROUTE.slice(0, 2), 22), his = trail(HIS_ROUTE.slice(0, 2), 22);
    return { dur: 5.2, map: true, box, draw(prog, time) {
      corners(g, w, h); latin(g, 'MAPPA VIARUM', w / 2, h * .1, w * .025);
      g.save(); g.translate(box.x - 140 * box.s, box.y - 60 * box.s); g.scale(box.s, box.s);
      g.globalAlpha = .1; g.fillStyle = SEPIA; g.fill(map); g.globalAlpha = .75; g.strokeStyle = SEPIA; g.lineWidth = 1.4 / box.s * w / 500; g.stroke(map); g.globalAlpha = 1;
      // compass rose
      g.restore();
      drawCompass(g, w * .2, h * .74, w * .07);
      g.save(); g.translate(box.x - 140 * box.s, box.y - 60 * box.s); g.scale(box.s, box.s);
      const steps = (tr, k, label, col) => {
        const n = Math.floor(tr.length * k);
        for (let i = 0; i < n; i++) {
          const s = tr[i], age = (n - i) / tr.length; g.save(); g.translate(s.x, s.y); g.rotate(s.a); g.globalAlpha = Math.max(.25, 1 - age * 1.2); g.fillStyle = col;
          g.beginPath(); g.ellipse(0, s.side * 5, 5.5, 2.6, 0, 0, TAU); g.fill(); g.beginPath(); g.arc(6.4, s.side * 5, 1.8, 0, TAU); g.fill(); g.restore();
        }
        const head = tr[Math.max(0, n - 1)];
        if (n > 0) { g.save(); g.font = `600 ${20}px ${SERIF}`; g.fillStyle = col; g.textAlign = 'center'; g.globalAlpha = .95; g.fillText(label, head.x, head.y - 18); g.restore(); }
      };
      const dotted = (id, t) => { const [x, y] = mapXY(CITIES[id]); g.globalAlpha = t; g.fillStyle = INK; g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill(); g.font = `${17}px ${SERIF}`; g.fillText(CITIES[id].name, x + 9, y + 6); g.globalAlpha = 1; };
      dotted('zhoukou', between(prog, .1, .6)); dotted('wuhan', between(prog, .1, .6)); dotted('shenzhen', between(prog, .3, .8));
      steps(her, between(prog, .8, 5.4), '师宝宝', '#7a2a2a'); steps(his, between(prog, 1, 5.8), '我', '#2a3a5a');
      g.restore();
      return {};
    } };
  });
  return P;
}

function trail(ids, n) {
  const pts = ids.map(id => mapXY(CITIES[id])); const out = [];
  const total = n; let side = 1;
  for (let i = 0; i < total; i++) {
    const f = i / (total - 1) * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(f)), u = f - k;
    const a = Math.atan2(pts[k + 1][1] - pts[k][1], pts[k + 1][0] - pts[k][0]);
    const wob = Math.sin(i * .8) * 6;
    out.push({ x: lerp(pts[k][0], pts[k + 1][0], u) - Math.sin(a) * wob, y: lerp(pts[k][1], pts[k + 1][1], u) + Math.cos(a) * wob, a, side: side = -side });
  }
  return out;
}
function heartPts(cx, cy, s) { return Array.from({ length: 61 }, (_, i) => { const t = i / 60 * TAU; return [cx + s * 16 * Math.pow(Math.sin(t), 3) / 16, cy - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]; }); }
function drawStar(g, x, y, r, col) {
  g.fillStyle = col; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, rr = i % 2 ? r * .28 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function drawStarCrest(g, x, y, s) {
  g.save(); g.strokeStyle = SEPIA; g.lineWidth = s * .04; g.globalAlpha = .8;
  g.beginPath(); g.arc(x, y, s, 0, TAU); g.stroke(); g.beginPath(); g.arc(x, y, s * .86, 0, TAU); g.stroke();
  drawStar(g, x, y - s * .05, s * .55, SEPIA);
  g.beginPath(); g.arc(x - s * .35, y + s * .35, s * .22, -1, 2.4); g.stroke();
  g.restore();
}
function drawQuill(g, x, y, s) {
  g.save(); g.translate(x, y); g.rotate(-.6); g.strokeStyle = SEPIA; g.fillStyle = 'rgba(109,76,42,.14)'; g.lineWidth = s * .03;
  g.beginPath(); g.moveTo(0, s * .8); g.quadraticCurveTo(-s * .25, 0, 0, -s * .8); g.quadraticCurveTo(s * .3, 0, 0, s * .8); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(0, s * 1.1); g.lineTo(0, -s * .7); g.stroke();
  for (let i = -6; i < 7; i++) { g.beginPath(); g.moveTo(0, i * s * .11); g.lineTo((i % 2 ? .16 : -.16) * s, i * s * .11 - s * .08); g.stroke(); }
  g.restore();
}
function drawCompass(g, x, y, r) {
  g.save(); g.strokeStyle = SEPIA; g.fillStyle = SEPIA; g.globalAlpha = .7; g.lineWidth = 1;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.beginPath(); g.arc(x, y, r * .8, 0, TAU); g.stroke();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15); g.lineTo(x + Math.cos(a + .3) * r * .2, y + Math.sin(a + .3) * r * .2); g.lineTo(x + Math.cos(a - .3) * r * .2, y + Math.sin(a - .3) * r * .2); g.closePath(); i === 3 ? g.fill() : g.stroke(); }
  g.font = `italic ${r * .45}px ${LATIN}`; g.textAlign = 'center'; g.fillText('N', x, y - r * 1.3);
  g.restore();
}
