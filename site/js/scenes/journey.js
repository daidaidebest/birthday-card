// Chapter II: two backlit sand-art lightboxes play her road and his road side by side,
// then merge into one map where both paths are carved in light, pass through Shenzhen and end together in Tokyo.
import { canvas, clamp, lerp, between, easeInOut, easeOut, smooth, rng, fbm, glowSprite, TAU, wait } from '../util.js';
import { drawSandArtwork } from './sandart.js';
import { wander } from '../depth.js';
import { CHINA_OUTLINE, JAPAN_OUTLINE, CITIES, mapXY, HER_ROUTE, HIS_ROUTE } from './pages.js';

const PLACES = {
  zhoukou: { region: '河南', city: '周口', line: '你的故事，从河南周口开始。' },
  tianjin: { region: '', city: '天津', line: '后来，你走向了海河之畔的天津。' },
  beijing: { region: '', city: '北京', school: '中国政法大学', line: '在北京，写下认真而明亮的一页。' },
  hongkong: { region: '', city: '香港', school: '香港科技大学', line: '越过山海，香港也成了你的书页。' },
  shenzhenHer: { region: '', city: '深圳', line: '你的路，来到了深圳。', art: 'shenzhen' },
  wuhan: { region: '湖北', city: '武汉', line: '而我的故事，从湖北武汉开始。' },
  nanjing: { region: '', city: '南京', school: '东南大学', line: '经过南京，也经过自己的春夏。' },
  shanghai: { region: '', city: '上海', school: '上海交通大学', line: '又从南京，走到了上海。' },
  shenzhenHis: { region: '', city: '深圳', line: '我的路，也终于写到了深圳。', art: 'shenzhen' },
};
const HER = ['zhoukou', 'tianjin', 'beijing', 'hongkong', 'shenzhenHer'], HIS = ['wuhan', 'nanjing', 'shanghai', 'shenzhenHis'];
const MAP_LEN = 9;
const SAND = [44, 26, 12];
const MAP_OFF = [-12, 6]; // centres China + Japan inside the light table
const mxy = c => { const [x, y] = mapXY(c); return [x + MAP_OFF[0], y + MAP_OFF[1]]; };
let ART = null; // { w, h, arts: { id: { a: Uint8Array, r: Float32Array, emit: [] } }, map }

function grainField(w, h, seed) {
  const R = rng(seed), g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const clump = fbm(x / 9 + seed, y / 9, 2) * .5 + .5;
    g[y * w + x] = clamp(.42 + clump * .45 + (R() - .5) * .5);
  }
  return g;
}
async function bake(id, w, h, grain) {
  const c = canvas(w, h), g = c.getContext('2d', { willReadFrequently: true }), s = w / 1280;
  g.save(); g.scale(s, s);
  if (id === 'map') {
    const p = new Path2D(CHINA_OUTLINE + JAPAN_OUTLINE); g.translate(MAP_OFF[0], MAP_OFF[1]);
    g.fillStyle = 'rgba(0,0,0,.78)'; g.fill(p); g.strokeStyle = '#000'; g.lineWidth = 6; g.stroke(p);
  } else drawSandArtwork(g, id, 'her');
  g.restore();
  // thicken lines into sand: jittered copies of the drawing
  const thick = canvas(w, h), tg = thick.getContext('2d', { willReadFrequently: true });
  const R = rng(id.length * 7 + 3);
  for (let i = 0; i < 7; i++) { tg.globalAlpha = i ? .45 : 1; tg.drawImage(c, (R() - .5) * 2.6, (R() - .5) * 2.6); }
  const d = tg.getImageData(0, 0, w, h).data, a = new Uint8Array(w * h), r = new Float32Array(w * h);
  const cx = w / 2, cy = h / 2;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    a[i] = clamp(d[i * 4 + 3] / 255 * (.35 + grain[i] * .85)) * 255;
    const n = fbm(x / 70, y / 70, 3) * .22;
    r[i] = id === 'map' ? clamp(Math.hypot(x - cx * 1.05, y - cy) / (w * .55) + n) : clamp((1 - y / h) * .72 + Math.abs(x - cx) / w * .25 + n + .05);
  }
  const emit = [];
  for (let k = 0; k < 2500; k++) { const i = (R() * a.length) | 0; if (a[i] > 90) emit.push([r[i], i % w, (i / w) | 0]); }
  emit.sort((p, q) => p[0] - q[0]);
  await wait(0);
  return { a, r, emit };
}

// What every city shares: the dunes of sand along the bottom of the table (one long strip the camera walks along,
// so a change of city is a pan rather than a cut) and the darker sand in the corners, which stays put.
function bakeGround(w, h, grain) {
  const SW = w * 6, dune = new Uint8Array(SW * h), vig = new Uint8Array(w * h), cx = w / 2, cy = h / 2;
  for (let x = 0; x < SW; x++) {
    // the strip wraps: blend the noise toward its start over the last screen so the seam cannot show
    const u = x / w, f = n => n(u) * (1 - clamp(x / w - 5)) + n(u - 6) * clamp(x / w - 5);
    const top = h * (.895 + f(v => fbm(v * 7.1, 3, 3)) * .06 + f(v => fbm(v * 1.3, 9, 2)) * .03);
    for (let y = Math.max(0, Math.floor(top) - 2); y < h; y++) {
      const edge = clamp(y - top + 1), gi = y * w + (x % w);
      dune[y * SW + x] = clamp(edge * (.35 + grain[gi] * .85)) * 255;
    }
  }
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const v = Math.hypot((x - cx) / cx, (y - cy) / cy);
    vig[i] = clamp(clamp((v - .92) * 1.6) * .9 * (.35 + grain[i] * .85)) * 255;
  }
  return { SW, dune, vig };
}

export default {
  id: 'journey', music: 'journey',
  async load(env) {
    if (ART) return;
    const w = env.q < 1 ? 480 : 640, h = Math.round(w * 850 / 1280), grain = grainField(w, h, 4);
    const arts = {};
    for (const id of ['zhoukou', 'tianjin', 'beijing', 'hongkong', 'shenzhen', 'wuhan', 'nanjing', 'shanghai', 'map']) arts[id] = await bake(id, w, h, grain);
    ART = { w, h, arts, ground: bakeGround(w, h, grain) };
  },
  create(env) {
    const { el, fx } = env;
    env.pups.set('journey');
    el.innerHTML = `
      <div class="jr-room"></div>
      <header class="jr-head"><small>CHAPTER II</small><span>两条来路 · 各自的时光，终于同页</span></header>
      <div class="jr">
        ${['her', 'his'].map(k => `<section class="jr-lane ${k}"><div class="jr-box"><canvas class="sand"></canvas><canvas class="glow"></canvas><div class="jr-labels"></div></div>
          <div class="jr-meta"><small>${k === 'her' ? '你的来路' : '我的来路'}</small><h3></h3><p class="school"></p><p class="line"></p></div></section>`).join('')}
      </div>`;
    const $ = s => el.querySelector(s);
    const W = ART.w, H = ART.h;
    const lanes = ['her', 'his'].map((k, n) => {
      const root = $('.jr-lane.' + k), sand = root.querySelector('canvas.sand'), glow = root.querySelector('canvas.glow');
      sand.width = W; sand.height = H; glow.width = W; glow.height = H;
      const g = sand.getContext('2d'), img = g.createImageData(W, H);
      return { n, root, sand, glow, g, gg: glow.getContext('2d'), img, u32: new Uint32Array(img.data.buffer), cur: null, old: null, p: 9, pan: -1, doff: n * W * 2.1, idx: -1, grains: [],
        meta: { h3: root.querySelector('h3'), school: root.querySelector('.school'), line: root.querySelector('.line') } };
    });
    const R = rng(77), field = $('.jr'), labels = $('.jr-lane.her .jr-labels'), room = $('.jr-room'), metas = [...el.querySelectorAll('.jr-meta')];
    const COLOR = (SAND[2] << 16) | (SAND[1] << 8) | SAND[0];
    const spark = glowSprite('255,244,214', 64, 1.6);

    function setPlace(lane, key, how = 'pour') {
      const P = PLACES[key]; lane.old = lane.cur; lane.cur = ART.arts[P.art || key];
      if (how === 'pan') { lane.pan = 0; lane.p = 9; } else { lane.p = 0; lane.pan = -1; }
      const m = lane.meta; lane.root.classList.remove('swap'); void lane.root.offsetWidth; lane.root.classList.add('swap');
      setTimeout(() => { m.h3.textContent = P.region ? `${P.region} · ${P.city}` : P.city; m.school.textContent = P.school || ''; m.line.textContent = P.line; }, how === 'pan' ? PAN * 450 : 450);
      env.audio.sfx('sparkle', .25);
    }
    // One frame of sand. A new city is poured (the drawing appears along its reveal order) or walked to: the
    // camera pans across the table, the old city sliding out as the next slides in, the dunes in front passing
    // a little faster than the skyline. The corners' darker sand stays put.
    function compose(lane) {
      const { u32 } = lane, A = lane.cur, O = lane.old, G = ART.ground, SW = G.SW, n = W * H;
      const map = A === ART.arts.map, panning = lane.pan >= 0 && O, e = panning ? easeInOut(lane.pan) : 0;
      const p = lane.p * 1.3 - .05, q = lane.p * 1.7, oOff = Math.round(e * W), nOff = oOff - W;
      const dOff = Math.round(lane.doff + e * W * 1.3) % SW;
      for (let y = 0, i = 0; y < H; y++) {
        const row = y * W, drow = y * SW;
        for (let x = 0; x < W; x++, i++) {
          let a = 0;
          if (panning) {
            const xo = x + oOff, xn = x + nOff;
            if (xo < W) a = O.a[row + xo];
            if (xn >= 0) { const b = A.a[row + xn]; if (b > a) a = b; }
          } else {
            a = A ? A.a[i] * clamp((p - A.r[i]) * 7) : 0;
            if (O && q < 1.4) { const ro = x / W * .75 + O.r[i] * .3, f = clamp(1 - (q - ro) * 5); let b = O.a[i]; if (map) { const gd = G.dune[drow + (x + dOff) % SW]; b = Math.max(b, gd, G.vig[i]); } b *= f; if (b > a) a = b; }
          }
          if (!map) { const gd = G.dune[drow + (x + dOff) % SW], v = G.vig[i]; if (gd > a) a = gd; if (v > a) a = v; }
          u32[i] = a > 2 ? ((a & 255) << 24) | COLOR : 0;
        }
      }
      lane.g.putImageData(lane.img, 0, 0);
    }
    function pour(lane, dt) {
      const A = lane.cur; if (!A) return;
      const g = lane.gg, f = lane.p * 1.3 - .05;
      if (lane.grains.length || lane.dirtyG) { g.clearRect(0, 0, W, H); lane.dirtyG = lane.grains.length > 0; }
      if (lane.p < .95 && lane.pan < 0) {
        // a thin stream of sand falling from an unseen hand onto the drawing front
        let lo = 0, hi = A.emit.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (A.emit[m][0] < f) lo = m + 1; else hi = m; }
        for (let k = 0; k < 3; k++) {
          const e = A.emit[Math.min(A.emit.length - 1, Math.max(0, lo + ((R() - .5) * 60 | 0)))];
          if (e) lane.grains.push({ x: e[1] + (R() - .5) * 4, y: -5 - R() * 30, ty: e[2], vy: 220 + R() * 140, life: 1 });
        }
      }
      g.fillStyle = `rgb(${SAND})`;
      lane.grains = lane.grains.filter(s => {
        s.y += s.vy * dt; if (s.y >= s.ty) { s.life -= dt * 5; s.y = s.ty; }
        g.globalAlpha = clamp(s.life); g.fillRect(s.x, s.y, 1.4, 2.2); return s.life > 0;
      });
      g.globalAlpha = 1;
    }

    // ---------- map finale ----------
    const routes = [HER_ROUTE, HIS_ROUTE].map(r => r.map(id => mxy(CITIES[id]).map(v => v * W / 1280)));
    const lens = routes.map(pts => { let L = 0; const seg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); L += d; } return { L, seg }; });
    const at = (k, f) => { const pts = routes[k], { L, seg } = lens[k]; let left = L * clamp(f); for (let i = 1; i < pts.length; i++) { if (left <= seg[i - 1]) { const u = left / seg[i - 1]; return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)]; } left -= seg[i - 1]; } return pts[pts.length - 1]; };
    const LABELS = [['zhoukou', '周口', -1, 0], ['tianjin', '天津', 1, 0], ['beijing', '北京 · 中国政法大学', -1, -1], ['hongkong', '香港 · 香港科技大学', 1, 1], ['wuhan', '武汉', -1, 0], ['nanjing', '南京 · 东南大学', -1, -1], ['shanghai', '上海 · 上海交通大学', 1, 0], ['shenzhen', '深圳', -1, -1], ['tokyo', '日本 · 东京', 1, 1]];
    const labelEls = LABELS.map(([id, text, sx, sy]) => {
      const [x, y] = mxy(CITIES[id]); const s = document.createElement('span'); s.className = 'jr-city' + (sx < 0 ? ' l' : '') + (sy < 0 ? ' u' : sy > 0 ? ' d' : '');
      s.textContent = text; s.style.left = (x / 1280 * 100) + '%'; s.style.top = (y / 850 * 100) + '%'; labels.appendChild(s); return { id, s };
    });
    const progressFor = (k, id) => { const route = k ? HIS_ROUTE : HER_ROUTE, i = route.indexOf(id); if (i < 0) return 9; let d = 0; for (let j = 1; j <= i; j++) d += lens[k].seg[j - 1]; return d / lens[k].L; };
    let heart = 0, met = false;
    function mapFrame(t) {
      const lane = lanes[0], g = lane.g, gg = lane.gg;
      const fh = between(t, 1.6, 5.2), fm = between(t, 1.8, 5.2);
      // carve both paths through the sand
      g.save(); g.globalCompositeOperation = 'destination-out'; g.lineCap = g.lineJoin = 'round';
      [fh, fm].forEach((f, k) => {
        if (f <= 0) return; g.lineWidth = W / 260; g.beginPath(); const N = 80;
        for (let i = 0; i <= N; i++) { const [x, y] = at(k, f * i / N); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      });
      Object.values(CITIES).forEach(c => { const [x, y] = mxy(c).map(v => v * W / 1280); g.beginPath(); g.arc(x, y, W / 200, 0, TAU); g.fill(); });
      g.restore();
      gg.clearRect(0, 0, W, H); gg.globalCompositeOperation = 'lighter';
      gg.save(); gg.lineCap = 'round'; gg.setLineDash([W / 300, W / 160]); gg.lineWidth = W / 420; gg.strokeStyle = 'rgba(255,236,196,.75)';
      [fh, fm].forEach((f, k) => { if (f <= 0) return; gg.beginPath(); const N = 80; for (let i = 0; i <= N; i++) { const [x, y] = at(k, f * i / N); i ? gg.lineTo(x, y) : gg.moveTo(x, y); } gg.stroke(); });
      gg.restore();
      [fh, fm].forEach((f, k) => { if (f <= 0 || f >= 1) return; const [x, y] = at(k, f), s = W / 14; gg.globalAlpha = .9; gg.drawImage(spark, x - s / 2, y - s / 2, s, s); });
      if (fh >= 1 && fm >= 1 && !met) { met = true; env.audio.sfx('chime', .8); const r = lane.glow.getBoundingClientRect(), [x, y] = mxy(CITIES.tokyo); fx.burst(r.left + x / 1280 * r.width, r.top + y / 850 * r.height, { n: 90, speed: 160, life: 2.2, size: 2.2 }); }
      if (met) {
        heart = Math.min(1, heart + 1 / 60); const [x, y] = mxy(CITIES.tokyo).map(v => v * W / 1280), s = W / 26;
        const pulse = 1;
        gg.globalAlpha = .55 + .2 * Math.sin(t * 3); gg.drawImage(spark, x - s * 2.5, y - s * 2.5, s * 5, s * 5);
        g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath();
        for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU * heart; const hx = 16 * Math.pow(Math.sin(a), 3), hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); i ? g.lineTo(x + hx * s / 14 * pulse, y - s * 1.6 + hy * s / 14 * pulse) : g.moveTo(x + hx * s / 14, y - s * 1.6 + hy * s / 14); }
        g.lineWidth = W / 300; g.stroke(); g.restore();
        // part of the heart lies over the sea, where there is no sand to carve: it is also drawn in light
        gg.save(); gg.globalCompositeOperation = 'lighter'; gg.globalAlpha = .85; gg.strokeStyle = '#ffe7b8'; gg.lineWidth = W / 380; gg.beginPath();
        for (let i = 0; i <= 60; i++) { const a = i / 60 * TAU * heart; const hx = 16 * Math.pow(Math.sin(a), 3), hy = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)); i ? gg.lineTo(x + hx * s / 14, y - s * 1.6 + hy * s / 14) : gg.moveTo(x + hx * s / 14, y - s * 1.6 + hy * s / 14); }
        gg.stroke(); gg.restore();
      }
      gg.globalCompositeOperation = 'source-over'; gg.globalAlpha = 1;
      labelEls.forEach(({ id, s }) => { const on = Math.min(progressFor(0, id), progressFor(1, id)) <= Math.max(fh, fm) + .001 && t > 2; s.classList.toggle('on', on); });
    }

    // ---------- her hands in the sand ----------
    // a finger drawn across a lightbox carves a trail the light shines through; a sweep (or a tap) walks on to
    // the next stop sooner. Left alone, the stops follow the music: both tables move on together, every two bars,
    // each new city settling on the downbeat (the score is 76 bpm in 4/4, tools/music.py journey()).
    const BAR = 240 / 76, STEP = 2 * BAR, PAN = 2.4, AUTO_END = 9;
    const HIS_AT = [0, 1, 2, 2, 3]; // his road has one stop fewer: he waits in Shanghai while she crosses to Hong Kong
    const hintEl = document.createElement('p'); hintEl.className = 'jr-hint'; el.appendChild(hintEl);
    const hint = text => { if (text) hintEl.textContent = text; hintEl.classList.toggle('on', !!text); };
    let touchAny = false, endAsked = 0, wantNext = false, wantEnd = false, step = -1, nextAt = BAR, mt = 0;
    const laneAt = (x, y) => lanes.find(l => { const r = l.sand.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && r.width > 0; });
    let stroke = null;
    el.addEventListener('pointerdown', e => {
      if (e.target.closest('#hud,#menu,#btn-next')) return;
      touchAny = true; hint(null);
      const l = mode === 'routes' ? laneAt(e.clientX, e.clientY) : lanes[0];
      stroke = { l, x: e.clientX, y: e.clientY, x0: e.clientX, t0: T, dist: 0 };
      if (l) carve(l, e.clientX, e.clientY, e.clientX, e.clientY);
    });
    addEventListener('pointermove', e => {
      if (!stroke || !stroke.l) return;
      carve(stroke.l, stroke.x, stroke.y, e.clientX, e.clientY);
      stroke.dist += Math.hypot(e.clientX - stroke.x, e.clientY - stroke.y); stroke.x = e.clientX; stroke.y = e.clientY;
    }, { passive: true });
    const release = e => {
      if (!stroke) return; const st = stroke; stroke = null;
      const r = st.l?.sand.getBoundingClientRect(), sweep = r && Math.abs(st.x - st.x0) > r.width * .35, tap = T - st.t0 < .3 && st.dist < 10;
      if (mode === 'routes') {
        if (sweep || tap) wantNext = true;
      } else if (mode === 'map' && (tap || sweep)) { if (met) wantEnd = true; }
    };
    addEventListener('pointerup', release); addEventListener('pointercancel', release);
    function carve(l, x0, y0, x1, y1) {
      const r = l.sand.getBoundingClientRect(), k = l.sand.width / r.width;
      const g = l.g; g.save(); g.globalCompositeOperation = 'destination-out'; g.lineCap = 'round'; g.lineWidth = Math.max(3, l.sand.width / 70);
      g.beginPath(); g.moveTo((x0 - r.left) * k, (y0 - r.top) * k); g.lineTo((x1 - r.left) * k, (y1 - r.top) * k); g.stroke(); g.restore();
      // grains thrown aside by the finger, catching the light
      if (Math.random() < .5) fx.trail(x1, y1, { life: .8, size: 1.1, spread: 8, vy: -8 });
      l.carved = true;
    }

    // ---------- clock ----------
    let T = 0, mode = 'routes', ended = false, cardShown = false, mapT = 0;
    let mapStart = 1e9;
    const cuesMap = env.cues([[.6, 4.6, '各自走来的路，在东京写下同一页。'], [5, MAP_LEN, '日本 · 东京，是这一页的最后一站。']]);
    function resize() {
      const Wv = env.W, Hv = env.H, portrait = env.portrait;
      el.classList.toggle('portrait', portrait);
      const ar = 1280 / 850;
      let bw = portrait ? Math.min(Wv * .9, (Hv * .3) * ar) : Math.min(Wv * .43, Hv * .56 * ar);
      el.style.setProperty('--bw', bw + 'px'); el.style.setProperty('--bh', bw / ar + 'px');
      const mw = portrait ? Math.min(Wv * .98, Hv * .5 * ar) : Math.min(Wv * .8, Hv * .7 * ar);
      el.style.setProperty('--mw', mw + 'px'); el.style.setProperty('--mh', mw / ar + 'px');
    }
    resize();
    return {
      resize,
      progress: () => mode === 'map' ? .75 + clamp(mapT / MAP_LEN) * .25 : clamp(((lanes[0].idx + 1) / HER.length + (lanes[1].idx + 1) / HIS.length) / 2) * .75,
      destroy() { removeEventListener('pointerup', release); removeEventListener('pointercancel', release); },
      update(dt, t) {
        T = t;
        if (!cardShown) { cardShown = true; env.chapterCard('II', 1700); }
        // 2.5D parallax: the glow of the room drifts least, the light tables more, the captions most,
        // so the layers separate in depth as the camera breathes and leans with her (2D moves only: cheap)
        let par = [0, 0];
        { const wd = wander(t, 6.1, .8), calm = mode === 'map' ? 1 - between(mapT, 1, 6) * .6 : 1, u = Math.min(env.W, env.H) * .012 * calm;
          const cx = (wd.x + env.look.x * 1.2) * u, cy = (wd.y * .7 + env.look.y * .9) * u;
          const set = (e, v) => { if (e._t !== v) { e._t = v; e.style.transform = v; } };
          set(room, `translate(${(cx * .6).toFixed(1)}px,${(cy * .6).toFixed(1)}px)`);
          par = [cx, cy];
          metas.forEach(m => set(m, `translate(${(-cx * 1.1).toFixed(1)}px,${(-cy * 1.1).toFixed(1)}px)`)); }
        // the music's own clock (the scene clock until the track is playing), so the sand keeps time with it
        mt += dt; { const at = env.audio.time('journey'); if (at != null) { if (Math.abs(at - mt) > .5) mt = at; else mt += (at - mt) * .1; } }
        const rt = t - 1.7; // the chapter card
        if (mt < BAR - 1.95) { el.classList.remove('lit'); return; }
        el.classList.add('lit');
        cuesMap(rt - mapStart);
        if (mode === 'routes') {
          // a sweep brings the next stop forward to the next downbeat it can reach
          if (wantNext) { wantNext = false; if (step >= 0 && lanes.every(l => l.pan < 0)) nextAt = Math.min(nextAt, Math.ceil((mt + PAN) / BAR - .02) * BAR); }
          if (step < 0) { step = 0; lanes.forEach((l, k) => { l.idx = 0; setPlace(l, (k ? HIS : HER)[0]); }); nextAt = BAR + STEP; }
          else if (step < HER.length - 1 && mt >= nextAt - PAN) {
            step++; nextAt += STEP;
            lanes.forEach((l, k) => { const i = k ? HIS_AT[step] : step; if (i !== l.idx) { l.idx = i; setPlace(l, (k ? HIS : HER)[i], 'pan'); } });
          }
          lanes.forEach(l => { l.last = l.idx >= (l.n ? HIS : HER).length - 1; l.ready = l.pan < 0 && l.p >= 1.25; });
          if (!touchAny && step >= 1 && mt > nextAt - STEP + 1) hint('用手指拂过沙画，走向下一站');
          lanes.forEach(l => {
            if (l.pan >= 0) {
              l.pan = Math.min(1, l.pan + dt / PAN); compose(l);
              if (l.pan >= 1) { l.doff = (l.doff + W * 1.3) % ART.ground.SW; l.pan = -1; l.old = null; compose(l); }
            } else if (l.p < 1.25) l.p += dt / 1.6, compose(l);
            pour(l, dt);
            // a gentle step in the walk while the camera pans; the sand sits a little deeper than the frame
            const bob = l.pan >= 0 ? Math.sin(l.pan * Math.PI * 4) * Math.sin(l.pan * Math.PI) * 2.2 : 0;
            const z = `translate(${(par[0] * .45).toFixed(1)}px,${(par[1] * .45 + bob).toFixed(1)}px) scale(1.03)`;
            if (l.z !== z) { l.z = z; l.sand.style.transform = l.glow.style.transform = z; }
          });
          if (step === HER.length - 1 && lanes.every(l => l.ready) && mt >= nextAt - 1) {
            hint(null); mapStart = rt;
            mode = 'map'; mapT = 0; field.classList.add('is-map');
            const l = lanes[0]; l.old = l.cur; l.cur = ART.arts.map; l.p = 0; l.pan = -1; l.grains = [];
            l.sand.style.transform = l.glow.style.transform = '';
            l.meta.h3.textContent = '日本 · 东京'; l.meta.school.textContent = ''; l.meta.line.textContent = '';
            env.audio.sfx('whoosh', .5);
          }
        } else {
          mapT += dt; const l = lanes[0];
          if (l.p < 1.25) { l.p += dt / 1.5; compose(l); }
          else mapFrame(mapT); // the carving accumulates on the finished sand, no per-frame recompose
          if (met && !endAsked) { endAsked = mapT; setTimeout(() => { if (!ended) hint('轻触，翻到下一章'); }, 2600); }
          if (!ended && met && (wantEnd || mapT - endAsked > AUTO_END)) { ended = true; hint(null); env.next({ transition: 'gold' }); }
        }
      },
    };
  },
};
