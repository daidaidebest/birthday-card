// The keepsake (v16). After the credits, a postcard to keep: cream card stock, the study on the night of the wish with
// the fireworks in its window, a daily wish she picks by tapping, and a golden postmark stamped with the very minute she
// seals it. The card is drawn on one canvas at print size, so what she sees is exactly what she saves: a PNG, through
// the share sheet on phones (straight into Photos), a download elsewhere, or the image itself to long-press.
// Then the closing shot: the screen goes dark, a real night sky comes up slowly, and one last line.
import { asset, loadImage, canvas, clamp, between, easeOut, rng, TAU, glowSprite, sparkleSprite, wrapText } from './util.js';

const WISHES = [
  '愿你今天醒来，窗外刚好是晴天。',
  '愿你每一顿饭，都有人陪你好好吃。',
  '愿你的烦恼都很小，快乐都很大。',
  '愿你累了的时候，总有一个肩膀可以靠。',
  '愿你想念的人，此刻也正想着你。',
  '愿你走过的每一条路，都开着花。',
  '愿你一直勇敢，也一直被温柔以待。',
  '愿你被这个世界，偏爱多一点点。',
  '愿你的每一个愿望，都已经在路上。',
  '愿往后的每一个生日，我都在你身边。',
];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const INK = '#3b2a1b', GOLD = '#a27936', FW = ['255,226,170', '255,214,150', '255,236,205', '250,200,175'];
const SERIF = 'GiftSerif, "Noto Serif SC", "Source Han Serif SC", "Songti SC", STSong, serif', LATIN = 'GiftLatin, "Palatino Linotype", Palatino, Georgia, serif', SCRIPT = 'GiftScript, GiftLatin, cursive';
const NAME = '师宝宝的生日明信片.png';
// the renders the picture is cut from (the wide shot of the study, after the wish): size and window glass, render px
// and the fireworks painted into its window: [x, y, radius, colour] (below the moon in the portrait frame)
const SRC = {
  p: { w: 1080, h: 1920, glass: [897, 139, 1080, 944], fw: [[992, 650, 74, 0], [1048, 745, 48, 2], [940, 760, 40, 1]] },
  l: { w: 1440, h: 810, glass: [928, 0, 1267, 315], fw: [[1150, 92, 84, 0], [1022, 66, 56, 2], [1215, 196, 46, 3]] },
};
// print layouts in card pixels: landscape for wide screens (the picture on the left), portrait for phones (on top).
// pic/stamp: [x, y, w, h]; crop/shot: the part of the render in the picture/stamp; mark: postmark centre, radius and the
// length of its wavy lines (in radii); hit: the wish line's
// tap area [x0, y0, x1, y1]; f: font sizes (script "To", name, label, wish, sign-off, footer)
const CARD = {
  l: { w: 1600, h: 1067, src: 'p', pic: [64, 64, 776, 939], crop: [0, 382, 1080, 1307], shot: [897, 372, 183, 190],
    x0: 904, x1: 1532, stamp: [1344, 84, 172, 212], mark: [1248, 334, 108, 1.75], to: 492, label: 602, wish: [678, 72], sign: 922, foot: 982,
    hit: [888, 560, 1548, 866], f: [76, 62, 25, 44, 32, 18] },
  p: { w: 1067, h: 1600, src: 'l', pic: [56, 56, 955, 744], crop: [280, 0, 1040, 810], shot: [944, 0, 306, 315],
    x0: 84, x1: 983, stamp: [818, 846, 160, 198], mark: [740, 1074, 100, 1.55], to: 962, label: 1150, wish: [1236, 76], sign: 1482, foot: 1538,
    hit: [60, 1098, 1007, 1432], f: [80, 66, 27, 46, 34, 19] },
};
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const TOUCH = IOS || matchMedia('(pointer: coarse)').matches;
const pad2 = n => String(n).padStart(2, '0');

/** Letters set one by one with a little air between them (canvas letterSpacing is not everywhere yet). */
function spaced(g, text, x, y, track = 0, align = 'left') {
  const ch = [...text], ws = ch.map(c => g.measureText(c).width), total = ws.reduce((a, b) => a + b, 0) + track * (ch.length - 1);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  g.textAlign = 'left'; ch.forEach((c, i) => { g.fillText(c, cx, y); cx += ws[i] + track; });
  return total;
}
/** A wish on one line if it fits, otherwise broken after the comma nearest the middle. */
function lines(g, text, max, track) {
  const w = s => g.measureText(s).width + track * [...s].length;
  if (w(text) <= max) return [text];
  const cuts = [...text].map((c, i) => c === '，' ? i + 1 : -1).filter(i => i > 0);
  const mid = text.length / 2, cut = cuts.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid))[0];
  return cut && w(text.slice(0, cut)) <= max && w(text.slice(cut)) <= max ? [text.slice(0, cut), text.slice(cut)] : wrapText(g, text, max * .94);
}
const goldLine = (g, x0, x1, y, a = .5, w = 1.5) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, `rgba(166,124,58,${a})`); gr.addColorStop(.5, `rgba(200,160,90,${a})`); gr.addColorStop(1, `rgba(166,124,58,${a * .6})`); g.fillStyle = gr; g.fillRect(x0, y, x1 - x0, w); };
function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, q = i % 2 ? r * .28 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); }

/** The window mask of a render (white glass on black) as alpha, cut to the glass's rect [x0, y0, x1, y1] of frame f. */
export function alphaMask(img, [x0, y0, x1, y1], f) {
  const sx = img.width / f.w, sy = img.height / f.h, c = canvas((x1 - x0) * sx, (y1 - y0) * sy), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, -x0 * sx, -y0 * sy); const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let i = 0; i < p.length; i += 4) { p[i + 3] = p[i]; p[i] = p[i + 1] = p[i + 2] = 0; }
  g.putImageData(d, 0, 0); return c;
}
// champagne willows frozen at the top of their bloom (render px): a soft heart, trails brightening outward, hot tips
function willows(g, bursts, R) {
  g.globalCompositeOperation = 'lighter';
  for (const [cx, cy, r, b] of bursts) {
    const sp = glowSprite(FW[b], 32, 2.2), hot = glowSprite('255,246,226', 32, 3);
    g.globalAlpha = .22; g.drawImage(sp, cx - r * .9, cy - r * .9, r * 1.8, r * 1.8);
    for (let j = 0; j < 34; j++) {
      const a = j / 34 * TAU + R() * .12, q = .74 + R() * .26;
      for (let s = 1; s <= 11; s++) {
        const u = s / 11, d = r * q * (1 - (1 - u) ** 2.2), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d + r * .4 * u ** 2.4, sz = r * (.026 + .03 * u);
        g.globalAlpha = .08 + .6 * u ** 1.6; g.drawImage(u === 1 ? hot : sp, x - sz, y - sz, sz * 2, sz * 2);
      }
    }
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}
// the room on the night of the wish, with fireworks in the window (kept to the glass by the render's mask)
function picture(after, mask, src) {
  const c = canvas(src.w, src.h), g = c.getContext('2d');
  if (after) g.drawImage(after, 0, 0, src.w, src.h);
  else { const gr = g.createLinearGradient(0, 0, 0, src.h); gr.addColorStop(0, '#1d1a2c'); gr.addColorStop(1, '#5a3a22'); g.fillStyle = gr; g.fillRect(0, 0, src.w, src.h); }
  const [x0, y0, x1, y1] = src.glass, f = canvas(x1 - x0, y1 - y0), fg = f.getContext('2d');
  fg.translate(-x0, -y0); willows(fg, src.fw, rng(1103)); fg.setTransform(1, 0, 0, 1, 0, 0);
  if (mask) { fg.globalCompositeOperation = 'destination-in'; fg.drawImage(alphaMask(mask, src.glass, src), 0, 0, f.width, f.height); }
  g.drawImage(f, x0, y0);
  return c;
}
// a postage stamp: perforated paper, a little window onto the fireworks, its value and the name of the post
function stamp(w, h, pic, [sx, sy, sw, sh]) {
  const c = canvas(w, h), g = c.getContext('2d'), ix = 14, iy = 14, iw = w - 28, ih = h - 28 - 34;
  g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, w, h);
  g.drawImage(pic, sx, sy, sw, sh, ix, iy, iw, ih);
  g.strokeStyle = 'rgba(120,88,44,.55)'; g.lineWidth = 1.2; g.strokeRect(ix + .5, iy + .5, iw - 1, ih - 1);
  g.fillStyle = '#5b4229'; g.font = `italic 22px ${LATIN}`; g.textBaseline = 'alphabetic'; g.fillText('11·03', ix, h - 19);
  g.font = `16px ${SERIF}`; spaced(g, '童话邮政', w - ix, h - 20, 2, 'right');
  g.globalCompositeOperation = 'destination-out'; const r = 5.5;
  for (const [len, edge] of [[w, (u, k) => [u, k ? h : 0]], [h, (u, k) => [k ? w : 0, u]]]) {
    const n = Math.round(len / 16);
    for (let i = 0; i <= n; i++) for (const k of [0, 1]) { const [x, y] = edge(i * len / n, k); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
  }
  return c;
}
// the postmark in gold ink: a double ring with the words round it, the minute she sealed the card in the middle, and
// the wavy cancellation lines running off to the right; the ink takes unevenly, as real ink does
function postmark(R, d, wl = 2) {
  const pad = 12, c = canvas(R * 2 + pad * 2 + R * wl, R * 2 + pad * 2), g = c.getContext('2d'), ox = pad + R, oy = pad + R;
  const ink = g.createLinearGradient(0, 0, c.width, c.height * .6);
  ink.addColorStop(0, '#8a6327'); ink.addColorStop(.3, '#c39a4d'); ink.addColorStop(.55, '#97702f'); ink.addColorStop(.8, '#cfab63'); ink.addColorStop(1, '#8d652a');
  g.strokeStyle = g.fillStyle = ink;
  g.lineWidth = R * .045; g.beginPath(); g.arc(ox, oy, R * .965, 0, TAU); g.stroke();
  g.lineWidth = R * .022; g.beginPath(); g.arc(ox, oy, R * .64, 0, TAU); g.stroke();
  const arc = (text, r, mid, dir, size) => { // along the top clockwise, along the bottom read left to right
    g.font = `${size}px ${LATIN}`; g.textAlign = 'center'; const ch = [...text], tr = size * .14, ws = ch.map(x => g.measureText(x).width + tr), span = ws.reduce((a, b) => a + b, 0) / r;
    let a = mid - dir * span / 2;
    ch.forEach((x, i) => { const m = a + dir * ws[i] / 2 / r; g.save(); g.translate(ox + Math.cos(m) * r, oy + Math.sin(m) * r); g.rotate(m + dir * Math.PI / 2); g.fillText(x, 0, 0); g.restore(); a += dir * ws[i] / r; });
  };
  arc('SPECIALLY DELIVERED', R * .72, -Math.PI / 2, 1, R * .13);
  arc("SHI BAOBAO'S FAIRY TALE", R * .86, Math.PI / 2, -1, R * .12);
  for (const sx of [-1, 1]) { g.beginPath(); g.arc(ox + sx * R * .8, oy, R * .035, 0, TAU); g.fill(); }   // two dots, and a crescent moon at the top
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  g.beginPath(); g.arc(ox, oy - R * .4, R * .085, 0, TAU); g.arc(ox + R * .04, oy - R * .43, R * .072, 0, TAU, true); g.fill('evenodd');
  g.font = `${R * .19}px ${LATIN}`; spaced(g, `${MON[d.getMonth()]} ${pad2(d.getDate())} ${d.getFullYear()}`, ox, oy - R * .05, R * .025, 'center');
  g.fillRect(ox - R * .44, oy + R * .05, R * .88, R * .014);
  g.font = `${R * .26}px ${LATIN}`; spaced(g, `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, ox, oy + R * .37, R * .03, 'center');
  g.lineWidth = R * .04; g.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const y0 = oy - R * .42 + (i - 2) * R * .2, xa = ox + R * 1.06, xb = c.width - pad; g.beginPath(); // across the stamp
    for (let x = xa; x <= xb; x += 3) g.lineTo(x, y0 + Math.sin((x - xa) / (R * .3) * Math.PI) * R * .055);
    g.stroke();
  }
  const Rn = rng(d.getMinutes() + 7); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) { g.globalAlpha = .35 + Rn() * .65; g.beginPath(); g.arc(Rn() * c.width, Rn() * c.height, R * (.004 + Rn() * .012), 0, TAU); g.fill(); }
  for (let i = 0; i < 5; i++) { const x = Rn() * c.width, y = Rn() * c.height, r = R * (.25 + Rn() * .35), gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  return { c, ox, oy };
}

export class Keepsake {
  constructor(parent, env, { onAgain } = {}) {
    this.env = env; this.k = env.portrait ? 'p' : 'l'; const L = this.L = CARD[this.k];
    this.t = 0; this.touchedAt = 0; this.wish = 0; this.fade = null; this.mark = null; this.sealed = false; this.savedAt = null; this.file = null;
    const el = this.el = document.createElement('div'); el.className = 'ks ks-' + this.k; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <div class="ks-inner">
        <p class="ks-eyebrow"><small>A POSTCARD FOR YOU</small>寄给你的明信片</p>
        <div class="ks-card"><canvas class="ks-cv" role="img" aria-label="明信片：To 师宝宝"></canvas><canvas class="ks-foil" aria-hidden="true"></canvas>
          <button type="button" class="ks-wish" aria-label="换一句每日心愿"><span>轻点，换一句心愿 ↻</span></button></div>
        <p class="ks-tip">轻点心愿换一句；选好了，就盖上邮戳。</p>
        <div class="ks-actions">
          <button type="button" class="ks-btn" data-seal>盖上邮戳 <span>✦</span></button>
          <button type="button" class="ks-btn" data-save hidden>收藏这张明信片 <span>↓</span></button>
          <button type="button" class="ks-link" data-again>再许一个愿 ✧</button>
        </div>
      </div>
      <div class="ks-sheet" hidden><img alt="明信片"><p>长按图片，保存到相册</p><button type="button" class="ks-link" data-close>好了</button></div>`;
    parent.appendChild(el);
    const $ = s => el.querySelector(s);
    this.cardEl = $('.ks-card'); this.cv = $('.ks-cv'); this.cv.width = L.w; this.cv.height = L.h; this.g = this.cv.getContext('2d');
    // the foil: a slow metallic sheen over the gold only, for the eye (the saved card is the plain canvas underneath)
    this.foil = $('.ks-foil'); this.foil.width = Math.round(L.w / 2); this.foil.height = Math.round(L.h / 2); this.fg = this.foil.getContext('2d');
    this.tipEl = $('.ks-tip'); this.sealBtn = $('[data-seal]'); this.saveBtn = $('[data-save]'); this.sheet = $('.ks-sheet');
    const [hx0, hy0, hx1, hy1] = L.hit; Object.assign($('.ks-wish').style, { left: hx0 / L.w * 100 + '%', top: hy0 / L.h * 100 + '%', width: (hx1 - hx0) / L.w * 100 + '%', height: (hy1 - hy0) / L.h * 100 + '%' });
    $('.ks-wish').addEventListener('click', () => this.next());
    this.sealBtn.addEventListener('click', () => this.seal());
    this.saveBtn.addEventListener('click', () => this.save());
    $('[data-again]').addEventListener('click', () => { this.touch(); onAgain && onAgain(); });
    $('[data-close]').addEventListener('click', () => { this.sheet.hidden = true; this.saved('收好了。愿它替我，一直陪着你。'); });
  }
  touch() { this.touchedAt = this.t; }
  /** Loads the picture, the paper and the fonts, and draws the card's still parts once. */
  prepare() {
    return this.ready || (this.ready = (async () => {
      const L = this.L, src = SRC[L.src];
      const [after, mask, paper] = await Promise.all([`img/cake3d-after-${L.src}.webp`, `img/cake3d-mask-${L.src}.webp`, 'img/paper.webp'].map(p => loadImage(asset(p)).catch(() => null)));
      if (document.fonts) await Promise.all([`40px GiftSerif`, `40px GiftScript`, `40px GiftLatin`, `italic 40px GiftLatin`].map(f => document.fonts.load(f, 'To 师宝宝心愿 NOV').catch(() => {})));
      this.base = this.drawBase(picture(after, mask, src), paper); this.compose();
    })());
  }
  drawBase(pic, paper) {
    const L = this.L, c = canvas(L.w, L.h), g = c.getContext('2d'), R = rng(3), [fTo, fName, fLabel, , fSign, fFoot] = L.f;
    // card stock: cream, a faint mottle of paper, fibres, and edges a shade warmer
    g.fillStyle = '#f4ecda'; g.fillRect(0, 0, L.w, L.h);
    if (paper) { g.globalCompositeOperation = 'multiply'; g.globalAlpha = .22; g.fillStyle = g.createPattern(paper, 'repeat'); g.fillRect(0, 0, L.w, L.h); }
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 1600; i++) { g.globalAlpha = .04 + R() * .08; g.fillStyle = R() < .5 ? '#8a6a40' : '#fffaf0'; g.fillRect(R() * L.w, R() * L.h, 1 + R() * 2.5, 1 + R() * 1.2); }
    g.globalAlpha = 1;
    { const gr = g.createRadialGradient(L.w / 2, L.h / 2, Math.min(L.w, L.h) * .35, L.w / 2, L.h / 2, Math.hypot(L.w, L.h) * .56); gr.addColorStop(0, 'rgba(160,120,60,0)'); gr.addColorStop(1, 'rgba(160,120,60,.16)'); g.fillStyle = gr; g.fillRect(0, 0, L.w, L.h); }
    // a double rule of champagne gold round the edge
    { const gr = g.createLinearGradient(0, 0, L.w, L.h); gr.addColorStop(0, '#b8914f'); gr.addColorStop(.35, '#e2c58a'); gr.addColorStop(.6, '#a98243'); gr.addColorStop(1, '#d9bb7c');
      g.strokeStyle = gr; g.lineWidth = 3; g.strokeRect(24, 24, L.w - 48, L.h - 48); g.lineWidth = 1.2; g.strokeRect(34, 34, L.w - 68, L.h - 68); }
    // the picture, mounted: a soft shadow, a print's lifted blacks and vignette, a hairline frame and a gold mat line
    const [px, py, pw, ph] = L.pic, [cx, cy, cw, ch] = L.crop;
    g.save(); g.shadowColor = 'rgba(60,38,16,.35)'; g.shadowBlur = 18; g.shadowOffsetY = 6; g.fillStyle = '#20160e'; g.fillRect(px, py, pw, ph); g.restore();
    g.drawImage(pic, cx, cy, cw, ch, px, py, pw, ph);
    g.save(); g.beginPath(); g.rect(px, py, pw, ph); g.clip();
    g.fillStyle = 'rgba(255,240,215,.05)'; g.fillRect(px, py, pw, ph);
    { const gr = g.createRadialGradient(px + pw / 2, py + ph * .45, Math.min(pw, ph) * .3, px + pw / 2, py + ph / 2, Math.hypot(pw, ph) * .62); gr.addColorStop(0, 'rgba(20,10,0,0)'); gr.addColorStop(1, 'rgba(20,10,0,.42)'); g.fillStyle = gr; g.fillRect(px, py, pw, ph); }
    g.font = `italic ${Math.round(fFoot * 1.25)}px ${LATIN}`; g.fillStyle = 'rgba(255,244,222,.86)'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 8;
    spaced(g, 'the night of the wish · 11.03', px + 26, py + ph - 26, 1.5);
    g.restore();
    g.strokeStyle = 'rgba(110,80,40,.6)'; g.lineWidth = 1.2; g.strokeRect(px + .5, py + .5, pw - 1, ph - 1);
    g.strokeStyle = 'rgba(176,138,72,.55)'; g.lineWidth = 1; g.strokeRect(px - 10.5, py - 10.5, pw + 21, ph + 21);
    // the stamp, a touch askew
    { const [sx, sy, sw, sh] = L.stamp, st = stamp(sw, sh, pic, L.shot); g.save(); g.translate(sx + sw / 2, sy + sh / 2); g.rotate(.022); g.shadowColor = 'rgba(70,45,20,.3)'; g.shadowBlur = 9; g.shadowOffsetY = 3; g.drawImage(st, -sw / 2, -sh / 2); g.restore(); }
    // To 师宝宝, the daily wish's label and its ruled lines, the sign-off
    g.textBaseline = 'alphabetic';
    g.fillStyle = GOLD; g.font = `${fTo}px ${SCRIPT}`; g.textAlign = 'left'; g.fillText('To', L.x0, L.to); const tw = g.measureText('To').width;
    g.fillStyle = INK; g.font = `${fName}px ${SERIF}`; spaced(g, '师宝宝', L.x0 + tw + fName * .42, L.to, fName * .14);
    goldLine(g, L.x0, L.x0 + (L.x1 - L.x0) * .55, L.to + 22, .55);
    g.fillStyle = GOLD; g.font = `${fLabel}px ${SERIF}`; let lw = spaced(g, '每日心愿', L.x0, L.label, fLabel * .3);
    g.font = `${fLabel * .82}px ${LATIN}`; spaced(g, '·  DAILY WISH', L.x0 + lw + fLabel * .7, L.label, fLabel * .22);
    for (let i = 0; i < 3; i++) goldLine(g, L.x0, L.x1, L.wish[0] + 22 + i * L.wish[1], .42, 1.2);
    g.fillStyle = INK; g.globalAlpha = .82; g.font = `${fSign}px ${SERIF}`; spaced(g, '—— 一个在东京想你的人', L.x1, L.sign, fSign * .1, 'right'); g.globalAlpha = 1;
    g.fillStyle = GOLD; g.font = `${fFoot}px ${LATIN}`; spaced(g, 'FAIRY TALE POST  ·  Nº 1103', L.x0, L.foot, fFoot * .32);
    this.goldMask = this.drawGold();
    return c;
  }
  /** Everything on the card printed in gold foil (the rules, "To", the label, the lines, the footer), as a half-size mask. */
  drawGold() {
    const L = this.L, c = canvas(L.w / 2, L.h / 2), g = c.getContext('2d'), [fTo, , fLabel, , , fFoot] = L.f, [px, py, pw, ph] = L.pic;
    g.scale(.5, .5); g.fillStyle = g.strokeStyle = '#fff';
    g.lineWidth = 3; g.strokeRect(24, 24, L.w - 48, L.h - 48); g.lineWidth = 1.2; g.strokeRect(34, 34, L.w - 68, L.h - 68);
    g.lineWidth = 1; g.strokeRect(px - 10.5, py - 10.5, pw + 21, ph + 21);
    g.textBaseline = 'alphabetic'; g.font = `${fTo}px ${SCRIPT}`; g.textAlign = 'left'; g.fillText('To', L.x0, L.to);
    g.fillRect(L.x0, L.to + 22, (L.x1 - L.x0) * .55, 1.5);
    g.font = `${fLabel}px ${SERIF}`; const lw = spaced(g, '每日心愿', L.x0, L.label, fLabel * .3);
    g.font = `${fLabel * .82}px ${LATIN}`; spaced(g, '·  DAILY WISH', L.x0 + lw + fLabel * .7, L.label, fLabel * .22);
    g.globalAlpha = .75; for (let i = 0; i < 3; i++) g.fillRect(L.x0, L.wish[0] + 22 + i * L.wish[1], L.x1 - L.x0, 1.2); g.globalAlpha = 1;
    g.font = `${fFoot}px ${LATIN}`; spaced(g, 'FAIRY TALE POST  ·  Nº 1103', L.x0, L.foot, fFoot * .32);
    return c;
  }
  /** The sheen: a soft band of light crossing the card every ten seconds or so, nudged by how she tilts the phone. */
  drawFoil(t) {
    const f = this.fg, w = this.foil.width, h = this.foil.height; if (!this.goldMask) return;
    f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, w, h);
    if (this.env.reduced) return;
    const u = ((t / 10.5) % 1) * 1.9 - .45 + this.env.look.x * .2 + this.env.look.y * .08, cx = w * u, cy = h * u, L = Math.hypot(w, h) * .16;
    for (const [k, a] of [[1, .62], [2.6, .16]]) {
      const gr = f.createLinearGradient(cx - L * k * .7, cy - L * k * .7, cx + L * k * .7, cy + L * k * .7);
      gr.addColorStop(0, 'rgba(255,244,214,0)'); gr.addColorStop(.5, `rgba(255,248,226,${a})`); gr.addColorStop(1, 'rgba(255,244,214,0)');
      f.fillStyle = gr; f.fillRect(0, 0, w, h);
    }
    f.globalCompositeOperation = 'destination-in'; f.drawImage(this.goldMask, 0, 0, w, h); f.globalCompositeOperation = 'source-over';
  }
  wishText(g, i, a) {
    if (a <= 0) return; const L = this.L, fs = L.f[3], tr = fs * .06;
    g.save(); g.globalAlpha = a; g.fillStyle = INK; g.font = `${fs}px ${SERIF}`; g.textBaseline = 'alphabetic';
    lines(g, WISHES[i], L.x1 - L.x0 - 16, tr).slice(0, 3).forEach((s, j) => spaced(g, s, L.x0 + 6, L.wish[0] + j * L.wish[1], tr));
    g.restore();
  }
  /** The postmark at its moment: the stamp comes down (its shadow gathers), presses with a little twist, the ink spreads
   *  into the fibres and its wet shine dries. */
  drawMark(g) {
    const m = this.mark, u = this.t - m.at, red = this.env.reduced, P = red ? 0 : .22, [cx, cy] = this.L.mark;
    g.save(); g.translate(cx, cy);
    if (u < P) {
      const q = u / P, r = m.R * (1.4 - .35 * q), gr = g.createRadialGradient(0, 0, r * .5, 0, 0, r);
      gr.addColorStop(0, `rgba(60,40,20,${(.2 * q * q).toFixed(3)})`); gr.addColorStop(1, 'rgba(60,40,20,0)'); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
    } else {
      const v = u - P, press = red ? 1 : easeOut(clamp(v / .2)), spread = red ? 1 : easeOut(clamp(v / 1.1));
      g.rotate(m.rot + (1 - press) * .08); const sc = 1 + .05 * (1 - press); g.scale(sc, sc);
      const S = m.s, dx = -S.ox, dy = -S.oy, d = 2.4 * spread;
      g.globalAlpha = .1 * spread; for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.drawImage(S.c, dx + ax * d, dy + ay * d);
      g.globalAlpha = (red ? clamp(u / .5) : clamp(v / .06)) * (.96 - .08 * spread); g.drawImage(S.c, dx, dy);
      const wet = red ? 0 : clamp(v / .06) * (1 - between(v, .25, 1.5));
      if (wet > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = .28 * wet; g.drawImage(S.c, dx, dy); }
    }
    g.restore();
  }
  compose() {
    const g = this.g; if (!this.base) return;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.drawImage(this.base, 0, 0);
    const f = this.fade, k = f ? clamp((this.t - f.at) / .45) : 1;
    if (f && k < 1) this.wishText(g, f.from, 1 - k);
    this.wishText(g, this.wish, k);
    if (this.mark) this.drawMark(g);
  }
  layout(W, H) {
    const k = this.env.portrait ? 'p' : 'l';
    if (k !== this.k) {   // the phone turned: the card is set again for the new frame (the same wish, the same postmark)
      this.k = k; const L = this.L = CARD[k];
      this.el.classList.remove('ks-p', 'ks-l'); this.el.classList.add('ks-' + k);
      this.cv.width = L.w; this.cv.height = L.h; this.foil.width = Math.round(L.w / 2); this.foil.height = Math.round(L.h / 2);
      const [hx0, hy0, hx1, hy1] = L.hit; Object.assign(this.el.querySelector('.ks-wish').style, { left: hx0 / L.w * 100 + '%', top: hy0 / L.h * 100 + '%', width: (hx1 - hx0) / L.w * 100 + '%', height: (hy1 - hy0) / L.h * 100 + '%' });
      this.ready = null; this.base = null; this.file = null;
      if (this.el.classList.contains('on')) this.prepare().then(() => this.compose());
    }
    // a short landscape screen: the words and buttons stand beside the card instead of above and below it
    const side = k === 'l' && H < 560, top = this.env.safe ? this.env.safe().t : 0;
    this.el.classList.toggle('ks-side', side);
    const L = this.L, chrome = side ? 32 + top : k === 'p' ? 238 : 214, wide = side ? W * .6 - 40 : W - 32;
    const s = Math.min(wide / L.w, (H - chrome) / L.h, 1);
    Object.assign(this.cardEl.style, { width: Math.round(L.w * s) + 'px', height: Math.round(L.h * s) + 'px' });
  }
  show(t) {
    this.t = t; this.touchedAt = t; this.el.classList.add('on'); this.el.setAttribute('aria-hidden', 'false');
    this.layout(this.env.W, this.env.H); this.prepare().then(() => this.compose());
  }
  hide() { this.el.classList.remove('on'); this.el.setAttribute('aria-hidden', 'true'); }
  next() {
    if (this.sealed) return; this.touch();
    this.fade = { from: this.wish, at: this.t }; this.wish = (this.wish + 1) % WISHES.length; this.env.audio.sfx('page', .35);
  }
  seal() {
    if (this.sealed || !this.base) return; this.sealed = true; this.touch();
    const d = new Date(), R = this.L.mark[2];
    this.mark = { s: postmark(R, d, this.L.mark[3]), R, at: this.t, rot: -.15 + (Math.random() - .5) * .08, hit: false, done: false };
    this.el.classList.add('sealed'); this.sealBtn.hidden = true; this.env.audio.hit?.('stamp', { at: this.env.audio.ctx ? this.env.audio.ctx.currentTime + .22 : null });   // the ink meets the card
    this.tipEl.textContent = `邮戳记下了这一刻：${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  async save() {
    this.touch(); const file = this.file; if (!file) return;
    if (TOUCH && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: '师宝宝的生日明信片' }); return this.saved('收好了。愿它替我，一直陪着你。'); }
      catch (e) { if (e?.name === 'AbortError') return; } // she closed the sheet; anything else falls through
    }
    const url = this.url || (this.url = URL.createObjectURL(file));
    if (!IOS && 'download' in HTMLAnchorElement.prototype) {
      const a = document.createElement('a'); a.href = url; a.download = NAME; document.body.appendChild(a); a.click(); a.remove();
      return this.saved('已经存好了。愿它替我，一直陪着你。');
    }
    this.sheet.querySelector('img').src = url; this.sheet.hidden = false; // last resort: the image itself, to long-press
  }
  saved(text) { this.savedAt = this.t; this.touch(); this.tipEl.textContent = text; this.saveBtn.firstChild.textContent = '再存一张 '; }
  update(dt, t) {
    this.t = t; if (!this.el.classList.contains('on') || !this.base) return;
    this.drawFoil(t);
    const m = this.mark, fading = this.fade && t - this.fade.at < .5;
    if (m && !m.hit && t - m.at >= (this.env.reduced ? 0 : .22)) { // contact
      m.hit = true; this.env.audio.sfx('seal', .9);
      if (!this.env.reduced) { this.cardEl.classList.remove('thump'); void this.cardEl.offsetWidth; this.cardEl.classList.add('thump'); }
      const r = this.cv.getBoundingClientRect(); this.env.fx.burst(r.left + this.L.mark[0] / this.L.w * r.width, r.top + this.L.mark[1] / this.L.h * r.height, { n: 12, speed: 50, life: 1.6, size: 1.3, color: '255,222,160', sparkle: 0 });
    }
    if (fading || (m && !m.done)) this.compose();
    if (m && !m.done && t - m.at > 1.8) { // the ink has dried: the card is final, ready to keep
      m.done = true; this.compose();
      if (this.goldMask) { const gm = this.goldMask.getContext('2d'), [cx, cy] = this.L.mark; gm.save(); gm.setTransform(.5, 0, 0, .5, 0, 0); gm.translate(cx, cy); gm.rotate(m.rot); gm.globalAlpha = .9; gm.drawImage(m.s.c, -m.s.ox, -m.s.oy); gm.restore(); } // the postmark's gold catches the light too
      this.cv.toBlob(b => { if (!b) return; this.file = new File([b], NAME, { type: 'image/png' }); this.saveBtn.hidden = false; requestAnimationFrame(() => this.saveBtn.classList.add('in')); }, 'image/png');
    }
  }
  remove() { if (this.url) URL.revokeObjectURL(this.url); this.el.remove(); }
}

const WORDS = [['屏幕里的生日童话，', '到这里就结束了；'], ['可我们真实的故事，', '才刚刚翻开新的一页。'], ['现在，转过头，', '看看你的身边。']];
// the stars of the real photograph: point-like bright spots, found once in a small copy of it
function findStars(img, n = 80) {
  const w = 350, h = Math.round(img.height / img.width * w), c = canvas(w, h), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, L = new Float32Array(w * h), out = [];
  for (let i = 0; i < w * h; i++) L[i] = d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11;
  for (let y = 3; y < h * .76; y++) for (let x = 3; x < w - 3; x++) {
    const v = L[y * w + x]; if (v < 110) continue;
    let peak = true; for (let j = -1; j <= 1 && peak; j++) for (let i = -1; i <= 1; i++) if ((i || j) && L[(y + j) * w + x + i] > v) { peak = false; break; }
    if (!peak) continue;
    const ring = (L[(y - 3) * w + x] + L[(y + 3) * w + x] + L[y * w + x - 3] + L[y * w + x + 3] + L[(y - 2) * w + x - 2] + L[(y - 2) * w + x + 2] + L[(y + 2) * w + x - 2] + L[(y + 2) * w + x + 2]) / 8;
    if (v - ring > 38) out.push({ x: (x + .5) / w, y: (y + .5) / h, b: Math.min(1, (v - ring) / 160) });
  }
  const R = rng(5);
  return out.sort((a, b) => b.b - a.b).slice(0, n).map(s => ({ ...s, w: .5 + R() * 1.6, p: R() * TAU }));
}

export class Closing {
  constructor(parent, env, { onReplay } = {}) {
    this.env = env; this.at = null; this.stars = [];
    const el = this.el = document.createElement('div'); el.className = 'ks-end'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `<div class="ks-end-sky"><i class="ks-end-photo"></i><canvas class="ks-end-stars"></canvas></div>
      <div class="ks-end-words">${WORDS.map((l, i) => `<p class="l${i + 1}">${l.map(s => `<span>${s}</span>`).join('')}</p>`).join('')}</div>
      <button type="button" class="ks-end-replay">从头再看一遍</button>`;
    parent.appendChild(el);
    this.sky = el.querySelector('.ks-end-sky'); this.photo = el.querySelector('.ks-end-photo'); this.cv = el.querySelector('.ks-end-stars'); this.g = this.cv.getContext('2d');
    this.spark = sparkleSprite('235,240,255', 32);
    el.querySelector('.ks-end-replay').addEventListener('click', () => onReplay && onReplay());
  }
  prepare() {
    return this.ready || (this.ready = loadImage(asset('img/photo-night-sky.webp')).then(img => { this.img = img; try { this.stars = findStars(img); } catch { this.stars = []; } }).catch(() => {}));
  }
  start(t) {
    this.at = t; this.prepare(); this.el.classList.add('on'); this.el.setAttribute('aria-hidden', 'false');
    const portrait = this.env.portrait; this.focus = portrait ? [.62, .5] : [.5, .38];
    this.photo.style.backgroundPosition = `${this.focus[0] * 100}% ${this.focus[1] * 100}%`;
  }
  update(dt, t) {
    if (this.at == null) return; const k = t - this.at, el = this.el, cl = (c, on) => on !== el.classList.contains(c) && el.classList.toggle(c, on);
    cl('sky', k > 4.2); cl('w1', k > 9); cl('w2', k > 12.8); cl('w3', k > 18.5); cl('replay', k > 30);
    if (k > 20 && !this.ducked) { this.ducked = true; this.env.audio.duck(.12, 16); } // the music fades very gently toward silence
    // the photograph's own stars, twinkling softly
    if (k < 4 || !this.img || !this.stars.length) return;
    const bw = this.sky.offsetWidth, bh = this.sky.offsetHeight, r = Math.min(this.env.dpr, 1.5);
    if (this.cv.width !== Math.round(bw * r)) { this.cv.width = Math.round(bw * r); this.cv.height = Math.round(bh * r); }
    const g = this.g, iw = this.img.width, ih = this.img.height, s = Math.max(bw / iw, bh / ih), ox = (bw - iw * s) * this.focus[0], oy = (bh - ih * s) * this.focus[1];
    const fade = between(k, 6, 14), slow = this.env.reduced ? .25 : 1;
    g.setTransform(r, 0, 0, r, 0, 0); g.clearRect(0, 0, bw, bh); g.globalCompositeOperation = 'lighter';
    for (const p of this.stars) {
      const tw = .5 + .5 * Math.sin(t * p.w * slow + p.p), a = fade * (.12 + .5 * p.b) * (.1 + .9 * tw * tw * tw), sz = 4 + 9 * p.b * (.7 + .3 * tw);
      g.globalAlpha = a; g.drawImage(this.spark, ox + p.x * iw * s - sz / 2, oy + p.y * ih * s - sz / 2, sz, sz);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  remove() { this.el.remove(); }
}
