import { useEffect, useRef, useState } from 'react';
import { SandKit } from './vendor/sandkit/index.js';
import type { ShapeSource } from './vendor/sandkit/index.js';
import './journey.css';

type PlaceId = 'zhoukou' | 'tianjin' | 'beijing' | 'hongkong' | 'wuhan' | 'nanjing' | 'shanghai' | 'shenzhen' | 'tokyo';
type Place = { id: PlaceId; city: string; region: string; school?: string; motif: string; owner: 'her' | 'me' | 'both'; line: string; caption: string };
const PLACES: Place[] = [
  { id: 'zhoukou', city: '周口', region: '河南', motif: '古城门阙 · 沙颍河', owner: 'her', line: '你的故事，从河南周口开始。', caption: '还没有相遇的时候，世界已经在认真写你。' },
  { id: 'tianjin', city: '天津', region: '海河之畔', motif: '天津之眼 · 海河', owner: 'her', line: '后来，你走向了天津。', caption: '一座城，成为下一页的开头。' },
  { id: 'beijing', city: '北京', region: '求学的这一页', school: '中国政法大学', motif: '古都檐影', owner: 'her', line: '在北京，写下认真而明亮的一页。', caption: '中国政法大学，留在你的来路里。' },
  { id: 'hongkong', city: '香港', region: '越过山海', school: '香港科技大学', motif: '山海 · 维港帆影', owner: 'her', line: '从北京到香港，山海也成为书页。', caption: '香港科技大学，和更辽阔的远方。' },
  { id: 'shenzhen', city: '深圳', region: '南方的这一程', motif: '城市天际线 · 海湾', owner: 'her', line: '你的路，来到了深圳。', caption: '海风翻开新一页，也把你带到我身边。' },
  { id: 'wuhan', city: '武汉', region: '湖北', motif: '黄鹤楼 · 长江', owner: 'me', line: '而我的故事，从湖北武汉开始。', caption: '另一页，另一条向前走的路。' },
  { id: 'nanjing', city: '南京', region: '求学的这一页', school: '东南大学', motif: '城门 · 梧桐', owner: 'me', line: '经过南京，也经过自己的春夏。', caption: '东南大学，是我来路中的一站。' },
  { id: 'shanghai', city: '上海', region: '继续向前', school: '上海交通大学', motif: '浦江 · 东方明珠', owner: 'me', line: '又从南京，走到了上海。', caption: '上海交通大学之后，这条路也写向了深圳。' },
  { id: 'shenzhen', city: '深圳', region: '同一座城，另一条来路', motif: '城市天际线 · 海湾', owner: 'me', line: '我的路，也终于写到了深圳。', caption: '曾经各自向前的我们，来到了同一座城。' },
  { id: 'tokyo', city: '东京', region: '日本', motif: '东亚地图 · 东京', owner: 'both', line: '各自走来的路，在东京写下同一页。', caption: '日本 · 东京，是这一页的最后一站。' },
];
// Natural Earth 1:110m generalized geographic outline, public domain.
// Source: github.com/nvkelso/natural-earth-vector — ne_110m_admin_0_countries.geojson
// Equirectangular display at latitude 36.9 degrees; not a campus or navigation map.
const CHINA_OUTLINE = 'M650.7 736.5L639.2 731.1L638.8 716.1L645.7 708.1L661 703.2L669 703.6L672.1 710.3L666 718L662.7 728.1L650.7 736.5ZM241.6 313.9L240.5 303.9L250.1 299.3L237.5 268.9L265.3 262L272.4 258.1L282.5 226.7L310.3 232.5L318.1 224.6L318.8 207L330.4 205.4L341 193.7L346.5 192.3L350.2 204.5L362 213.8L381.9 220.4L391.6 234.5L386.2 254.9L391.2 262.5L407.9 265.5L426.7 267.9L443.6 278.8L452.3 280.8L458.7 296.9L466.9 307.3L482.3 306.9L511.2 310.8L529.8 308.4L543.7 311L564.4 321.6L581.3 321.6L587.5 327L603.8 317.6L626.4 311.6L647.4 310.9L663.8 304.8L673.8 295.4L683.6 289.5L681.3 283.7L676.9 277L684.2 265.7L692.1 267.3L706.5 270.8L720.4 261.6L741.8 254.8L752.1 243.2L761.9 238.2L782.2 235.9L793.3 237.9L794.8 231.7L782.1 219.4L770.9 213.8L760.1 220.3L746.3 217.6L738.4 219.8L734.8 212.6L744.7 195.1L751.5 182L768.3 188.6L788 177.5L787.9 169.8L800.5 151.2L808.3 145.6L808.2 136L800.5 131.8L812 123.1L829.4 119.9L848 119.5L869 124.7L881.2 131.1L889.9 148.8L895.1 156.3L900 167.1L905.2 184.2L929.6 189.8L946.2 202.2L951.8 218.7L973.1 218.7L985.2 211.8L1008.4 206.6L1001 222.4L995.6 228.8L990.8 248L981.4 265L964.4 261.9L952.4 268.1L956 283L954 303.7L946.9 304.2L947 313.1L937.9 302.8L932.4 312.6L910.7 320.1L912.9 329.3L900.8 328.7L894.2 323.2L884.5 335.6L869.1 345L857.7 356.3L838.1 361.3L827.8 369.5L812.8 374.3L820.2 366.2L817.3 359.4L828.4 347.6L821 338.4L808.8 344.6L793 356.8L784.3 368.1L770.6 368.9L763.5 377.1L770.8 388.9L782.3 391.8L782.8 399.7L793.8 404.8L809.5 392.3L822 399.1L831 399.5L833.3 408.7L813.5 413.6L806.9 423L793.3 431.8L786.1 444.1L801.2 453.7L806.7 470.9L815.2 486.9L824.7 500.4L824.5 513.4L815.7 518.2L819 527.5L827.3 532.9L825.1 547.2L821.6 561.1L813.8 562.6L803.5 581.6L792.2 604.5L779.2 625.4L759.9 641.6L740.5 656.3L724.7 658.3L716.1 666.1L711.3 660.4L703.4 669.1L683.8 677.9L669 680.5L664.2 699L656.5 700.1L652.8 687.4L656.1 680.6L637.3 675L630.7 677.8L616.6 673.3L609.9 666.2L612.2 656.1L599.4 652.9L592.6 646.3L580.7 655.7L567.1 657.7L555.9 657.6L548.4 661.9L541.1 664.4L543.2 684.4L535.8 684L534.5 679.9L534.1 672.6L523.8 677.7L517.8 674.5L507.4 667.9L511.4 653.4L502.6 650L499.2 633.9L484.5 636.8L486.1 616L499.4 601.4L500 587L499.6 573.6L493.4 569.4L488.8 559.1L480.6 560.4L465.5 557.8L470.2 550.5L463.6 539.6L453.7 546.9L441.9 542.6L425.8 553.8L413 566.8L401.8 569L395.6 564.3L388.2 563.9L378.2 559.8L370.7 564.3L361.4 577.3L360.2 563.5L351.7 567.2L335.4 565.5L319.5 561.4L308.2 553.8L297.3 550.3L292.6 541.9L284.7 539.4L270.6 528L259.4 522.6L253.6 526.8L234.1 514.6L220.3 503.5L216.4 484.2L226.5 486.5L226.9 477.6L221.4 468.6L222.8 454.4L207.7 433.9L184.7 426.8L180.6 413.3L170.2 405.2L167.7 400.2L165.6 390.2L166.1 383.4L157.6 379.4L153 381.1L149.5 365L153.4 360.9L151.5 356.9L164.9 348.6L174.5 345.2L189.4 347.5L194.7 336.3L212.6 334.3L217.6 327.3L239.7 317.8L241.6 313.9ZM822.9 628.1L814.5 656.2L808.5 670.5L801.1 655.7L799.5 642.8L807.7 625.6L818.9 612.3L825.3 617.5L822.9 628.1Z';
const JAPAN_OUTLINE = 'M1104.4 369.3L1091.4 387.0L1091.7 405.0L1086.4 419.0L1088.8 427.7L1081.5 440.1L1063.7 448.3L1039.0 449.4L1019.1 469.4L1009.7 462.6L1009.1 449.6L984.8 453.4L968.2 461.7L951.8 462.0L966.0 474.9L956.7 504.6L947.6 512.0L940.8 505.2L944.3 489.4L935.4 484.3L929.7 472.3L943.0 466.9L950.3 455.9L964.4 446.9L974.6 434.9L1002.5 429.7L1017.5 433.3L1032.1 402.2L1041.5 410.5L1062.0 393.0L1070.0 386.2L1078.8 364.8L1076.4 345.1L1082.3 334.1L1097.2 330.9L1104.8 355.1L1104.4 369.3ZM1142.6 285.7L1152.5 278.3L1155.6 297.9L1134.8 302.7L1122.6 320.1L1100.6 308.1L1092.9 327.3L1077.4 327.5L1075.4 310.1L1082.4 296.7L1097.3 295.7L1101.4 271.5L1105.5 257.8L1122.0 276.1L1132.7 282.0L1142.6 285.7ZM971.2 469.4L978.9 458.9L986.9 461.0L992.7 453.6L1002.9 457.4L1004.7 463.4L996.8 474.0L991.1 468.4L983.9 472.4L980.2 482.7L971.1 477.7L971.2 469.4Z';
const FINAL_OUTLINE = CHINA_OUTLINE + JAPAN_OUTLINE;
const ART_WIDTH = 1280;
const ART_HEIGHT = 850;
const LAST = PLACES.length - 1;
const HER_STOPS = [0, 1, 2, 3, 4];
const HIS_STOPS = [5, 6, 7, 8];
const ROUTE_MS = 40000;
const MEETING_MS = 12000;
const TOTAL_MS = ROUTE_MS + MEETING_MS;
// Cities: Natural Earth ne_10m_populated_places_simple (public domain).
// The user confirmed Zhoukou, Henan, as her starting city.
const MAP_POINTS = [
  { id: 'zhoukou', label: '河南 · 周口', lon: 114.65, lat: 33.62, dx: -61, dy: -4 },
  { id: 'tianjin', label: '天津', lon: 117.196607, lat: 39.082772, dx: 31, dy: 10 },
  { id: 'beijing', label: '北京', lon: 116.394201, lat: 39.901720, dx: -30, dy: -28 },
  { id: 'hongkong', label: '香港', lon: 114.183064, lat: 22.306927, dx: 50, dy: 52 },
  { id: 'shenzhen', label: '深圳', lon: 114.061154, lat: 22.548097, dx: -78, dy: 16 },
  { id: 'wuhan', label: '武汉', lon: 114.268071, lat: 30.581977, dx: -44, dy: 2 },
  { id: 'nanjing', label: '南京', lon: 118.778029, lat: 32.051965, dx: -10, dy: -27 },
  { id: 'shanghai', label: '上海', lon: 121.434559, lat: 31.218398, dx: 39, dy: 13 },
  { id: 'tokyo', label: '日本 · 东京', lon: 139.6917, lat: 35.6895, dx: -15, dy: 44 },
];
// Screen-pixel callouts keep mobile labels legible without moving the geographic anchors.
const MOBILE_MAP_CALLOUTS: Record<string, { x: number; y: number }> = {
  zhoukou: { x: -30, y: -9 }, tianjin: { x: 28, y: -10 }, beijing: { x: -22, y: -22 },
  hongkong: { x: 32, y: 22 }, shenzhen: { x: -29, y: -3 }, wuhan: { x: -24, y: 16 },
  nanjing: { x: 32, y: -17 }, shanghai: { x: 36, y: 13 }, tokyo: { x: -10, y: 30 },
};
const mapPosition = (point: { lon: number; lat: number }) => [140 + (point.lon - 73) * 14, 110 + (54 - point.lat) * 17.5];
const mapRoute = (ids: string[]) => ids.map((id, i) => `${i ? 'L' : 'M'}${mapPosition(MAP_POINTS.find((point) => point.id === id)!).join(' ')}`).join('');
const MAP_ROUTES = [mapRoute(['zhoukou', 'tianjin', 'beijing', 'hongkong', 'shenzhen', 'tokyo']), mapRoute(['wuhan', 'nanjing', 'shanghai', 'shenzhen', 'tokyo'])];
const MEETING = mapPosition(MAP_POINTS[8]);
// Same geographic coordinates, enlarged locally. Labels are offset, the cities are not.
// Shenzhen to Tokyo, with north above and east to the right.
const deltaPosition = (point: { lon: number; lat: number }) => [50 + (point.lon - 114) * 8, 28 + (36 - point.lat) * 7];
const LEG_SHENZHEN = deltaPosition(MAP_POINTS[4]);
const LEG_TOKYO = deltaPosition(MAP_POINTS[8]);

// SandKit is MIT licensed, Copyright (c) 2026 Linkly AI. The original distribution
// and full license are preserved in vendor/sandkit. Story and drawings are ours.
const DRAWING_PATHS: Record<PlaceId, string[]> = {
  zhoukou: ['M277 606H1020M382 553V353H897V553', 'M328 320Q438 330 640 246Q842 330 952 320', 'M85 661Q260 597 451 664T879 665T1200 651'],
  tianjin: ['M907 365A247 247 0 1 1 413 365A247 247 0 1 1 907 365', 'M500 662L660 365L820 662M240 604H1080', 'M100 724Q374 657 682 708T1200 700'],
  beijing: ['M355 461Q459 475 650 376Q841 475 945 461', 'M426 357Q515 365 650 283Q785 365 874 357', 'M240 639Q650 681 1050 639M282 674H1010'],
  hongkong: ['M35 530Q164 493 332 279Q403 302 524 446Q632 304 751 390Q927 236 1239 480', 'M262 587H1070', 'M549 654L691 684L757 642M643 650V451Q704 485 722 610L647 605'],
  wuhan: ['M400 532Q505 548 650 475Q795 548 900 532', 'M466 352Q555 368 650 295Q745 368 834 352', 'M81 671H1192M81 650H1192'],
  nanjing: ['M247 647V528H331V449H968V528H1041V647', 'M410 331Q514 341 650 266Q786 341 890 331', 'M202 711Q422 647 663 695T1106 711'],
  shanghai: ['M577 635L651 411V124M651 411L725 635', 'M832 635V309L864 280L897 309V635M941 633Q901 409 980 174Q960 411 1025 633', 'M108 677Q352 618 611 679T1193 674'],
  tokyo: [],
  shenzhen: ['M689 635L708 253L752 121L795 253L814 635', 'M340 635V470Q399 445 424 340Q449 445 509 470V635', 'M87 679Q362 621 654 684T1193 673'],
};
function randomGenerator(seed: number) {
  let n = seed;
  return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
}
function stroke(ctx: CanvasRenderingContext2D, d: string, color = '#b69157', width = 1.6) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(new Path2D(d));
}
function fill(ctx: CanvasRenderingContext2D, d: string, color: string) {
  ctx.fillStyle = color; ctx.fill(new Path2D(d));
}
function tree(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, seed: number) {
  const random = randomGenerator(seed);
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  fill(ctx, 'M-10 0Q-5-64-17-110Q-32-145-20-174Q-18-130 9-107Q4-77 14 0Z', '#8f7145');
  ['M0-70Q-39-98-67-110Q-110-117-134-144', 'M-2-89Q33-124 58-155Q91-173 130-176', 'M-15-117Q-58-157-53-208', 'M-16-125Q9-173 16-218', 'M-30-142Q-84-172-112-186', 'M10-111Q65-128 99-127Q132-129 154-151'].forEach((d) => stroke(ctx, d, '#b79760', 3.5));
  for (let i = 0; i < 275; i += 1) {
    const angle = random() * Math.PI * 2; const radius = Math.sqrt(random());
    ctx.fillStyle = '#af8950'; ctx.globalAlpha = .22 + random() * .6;
    ctx.beginPath(); ctx.ellipse(Math.cos(angle) * radius * 177, -170 + Math.sin(angle) * radius * 75, 3 + random() * 8, 2 + random() * 5, random() * 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
function water(ctx: CanvasRenderingContext2D, seed: number, low = 570, high = 730) {
  const random = randomGenerator(seed);
  for (let i = 0; i < 190; i += 1) {
    const y = low + random() * (high - low); const x = 80 + random() * 1100; const length = 5 + random() * 59;
    ctx.globalAlpha = .12 + (1 - Math.abs(x - 640) / 640) * .36;
    stroke(ctx, `M${x} ${y}q${length / 2} -2 ${length} 0`, '#ae8b56', .7 + random() * 1.6);
  }
  ctx.globalAlpha = 1;
}
function moon(ctx: CanvasRenderingContext2D, x = 800, y = 220, radius = 72) {
  ctx.save(); ctx.strokeStyle = '#b48f54'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(x, y, radius + 6, .5, 4.5); ctx.stroke();
  ctx.restore();
}
/** Original city silhouettes; the university names are separate from these regional images. */
function roof(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, rise: number) {
  const a = x - w / 2; const b = x + w / 2;
  const d = `M${a} ${y-16}Q${a+w*.18} ${y-2} ${x} ${y-rise}Q${b-w*.18} ${y-2} ${b} ${y-16}L${b-13} ${y+10}Q${x} ${y+27} ${a+13} ${y+10}Z`;
  ctx.save(); ctx.globalAlpha = .24; fill(ctx, d, '#a58853'); ctx.restore(); stroke(ctx, d, '#a58853', 3);
  stroke(ctx, `M${a+9} ${y+3}Q${x} ${y+18} ${b-9} ${y+3}`, '#a58853', 1.6);
  for (let i=1;i<18;i++) { const t=i/18; const xx=a+w*t; const top=y-rise*(1-Math.abs(t*2-1))**1.55; stroke(ctx, `M${xx} ${top+6}Q${xx-(x-xx)*.03} ${y} ${xx} ${y+9}`, '#a58853', .9); }
}
function colonnade(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, count: number) {
  ctx.save(); ctx.globalAlpha = .12; fill(ctx, `M${x-w/2} ${y}h${w}v${h}h${-w}Z`, '#a58853'); ctx.restore();
  for(let i=0;i<=count;i++) {
    const xx=x-w/2+w*i/count; stroke(ctx, `M${xx} ${y}v${h}`, '#a58853', 4.6);
    if(i<count) { const gap=w/count; stroke(ctx, `M${xx+8} ${y+10}h${gap-16}v${h-20}h${16-gap}ZM${xx+gap/2} ${y+11}v${h-22}`, '#a58853', 1); }
  }
  stroke(ctx, `M${x-w/2-13} ${y+h}h${w+26}m${-w-26} 8h${w+26}`, '#a58853', 2.5);
}
function pagoda(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, tiers: number) {
  ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
  for(let i=0;i<tiers;i++) {
    const yy=-i*88; const w=490-i*64;
    colonnade(ctx,0,yy-55,w*.68,65,6); roof(ctx,0,yy-62,w,72);
    stroke(ctx,`M${-w*.41} ${yy+8}h${w*.82}m${-w*.82} -14h${w*.82}`,'#a58853',2);
  }
  const tip=-(tiers-1)*88-138; stroke(ctx,`M0 ${tip+6}v-39M-9 ${tip-11}h18`,'#a58853',3); ctx.restore();
}
function tower(ctx: CanvasRenderingContext2D, x: number, bottom: number, w: number, h: number, top=0) {
  const y=bottom-h; const d=`M${x} ${bottom}V${y+top}L${x+w*.5} ${y}L${x+w} ${y+top}V${bottom}Z`;
  ctx.save(); ctx.globalAlpha=.2; fill(ctx,d,'#a58853'); ctx.restore(); stroke(ctx,d,'#a58853',2.4);
  for(let xx=x+9;xx<x+w-5;xx+=11) stroke(ctx,`M${xx} ${y+top+13}V${bottom-8}`,'#a58853',.7);
  for(let yy=y+top+22;yy<bottom;yy+=19) stroke(ctx,`M${x+3} ${yy}h${w-6}`,'#a58853',.65);
}
function drawSandArtwork(ctx: CanvasRenderingContext2D, id: PlaceId, owner: Place['owner']) {
  ctx.lineCap='round'; ctx.lineJoin='round';
  if(id==='tokyo'&&owner==='both') {
    ctx.globalAlpha=.08; fill(ctx,FINAL_OUTLINE,'#a58853'); ctx.globalAlpha=1; stroke(ctx,FINAL_OUTLINE,'#a58853',3.1);
    MAP_POINTS.forEach(point=>{const [x,y]=mapPosition(point);ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fillStyle='#a58853';ctx.fill();}); return;
  }
  const random=randomGenerator(id.length*23);
  for(let i=0;i<1600;i++) {const x=random()*ART_WIDTH;const y=600+random()**.7*220;ctx.globalAlpha=.03+random()*.2;ctx.fillStyle='#a58853';const size=.5+random()*2.2;ctx.fillRect(x,y,size,size);}ctx.globalAlpha=1;
  if(id==='zhoukou') {
    moon(ctx,970,247,106);
    ctx.globalAlpha=.18;fill(ctx,'M300 600V548H390V350H895V548H994V600Z','#a58853');ctx.globalAlpha=1;
    for(const [x,w,h] of [[461,63,145],[639,109,198],[816,63,145]]) {
      stroke(ctx,`M${x-w/2} 598V${598-h+w/2}a${w/2} ${w/2} 0 0 1 ${w} 0V598`,'#a58853',3.5);
      stroke(ctx,`M${x-w/2-13} 598V${598-h+w/2}a${w/2+13} ${w/2+13} 0 0 1 ${w+26} 0V598`,'#a58853',1.1);
    }
    colonnade(ctx,640,358,498,49,10); roof(ctx,640,336,626,90); colonnade(ctx,640,252,210,55,4); roof(ctx,640,246,340,70);
    stroke(ctx,'M640 176V148M382 353V553M897 353V553M277 606H1020M277 617H1020','#a58853',3);
    water(ctx,94,675,817);stroke(ctx,'M85 661Q260 597 451 664T879 665T1200 651','#a58853',3);
    for(let i=0;i<20;i++) {const x=142+i*13;const y=728+Math.sin(i*.6)*14;stroke(ctx,`M${x} ${y}q-7-30 4-65`,'#a58853',1.6);for(let j=0;j<5;j++)stroke(ctx,`M${x+1} ${y-55+j*7}l-7-7m7 7 8-6`,'#a58853',2);}
  } else if(id==='tianjin') {
    const cx=660,cy=365,r=247;ctx.strokeStyle='#a58853';
    [r,r-12,25,10].forEach((radius,i)=>{ctx.lineWidth=i<2?3:2;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();});
    for(let i=0;i<36;i++) {const a=i/36*Math.PI*2;const x=cx+Math.cos(a)*r;const y=cy+Math.sin(a)*r;stroke(ctx,`M${cx} ${cy}L${x} ${y}`,'#a58853',1.1);ctx.globalAlpha=.5;ctx.fillRect(x-6,y-3,12,9);ctx.globalAlpha=1;stroke(ctx,`M${x-7} ${y-5}h14v11h-14Z`,'#a58853',1.2);}
    stroke(ctx,'M500 662L660 365L820 662M240 604H1080','#a58853',6);fill(ctx,'M239 602H1080V622H239Z','#a58853');
    for(let x=262;x<1060;x+=24)stroke(ctx,`M${x} 591V603`,'#a58853',2);
    for(let x=300;x<1060;x+=146)stroke(ctx,`M${x} 623V688M${x} 643Q${x+71} 605 ${x+142} 643`,'#a58853',3);
    water(ctx,19,687,817);tree(ctx,1120,722,1.15,34);
  } else if(id==='beijing') {
    moon(ctx,995,230,111);
    for(let i=0;i<3;i++){const y=596+i*28;const w=692+i*83;stroke(ctx,`M${650-w/2} ${y}Q650 ${y+34} ${650+w/2} ${y}`,'#a58853',3);stroke(ctx,`M${650-w/2} ${y-13}Q650 ${y+17} ${650+w/2} ${y-13}`,'#a58853',1.5);for(let x=650-w/2;x<650+w/2;x+=32)stroke(ctx,`M${x} ${y-9}v-22`,'#a58853',2);}
    colonnade(ctx,650,491,458,98,12);roof(ctx,650,477,590,101);colonnade(ctx,650,387,320,75,10);roof(ctx,650,373,448,90);colonnade(ctx,650,287,207,71,8);roof(ctx,650,278,329,83);
    stroke(ctx,'M650 195V156M639 172H661','#a58853',3);
    for(let y=644;y<725;y+=12)stroke(ctx,`M${576-(y-644)*.65} ${y}H${724+(y-644)*.65}`,'#a58853',1.5);
    tree(ctx,1138,665,1.2,29);
  } else if(id==='hongkong') {
    moon(ctx,953,210,95);ctx.globalAlpha=.14;fill(ctx,'M35 530Q164 493 332 279Q403 302 524 446Q632 304 751 390Q927 236 1239 480V581H35Z','#a58853');ctx.globalAlpha=1;
    stroke(ctx,'M35 530Q164 493 332 279Q403 302 524 446Q632 304 751 390Q927 236 1239 480','#a58853',2.5);
    [[330,64,167],[411,53,206],[485,63,151],[785,63,244],[867,52,179],[944,55,127]].forEach(([x,w,h])=>tower(ctx,x,580,w,h,13));
    stroke(ctx,'M262 587H1070M788 363L848 557M847 363L788 557','#a58853',2);water(ctx,20,598,817);
    fill(ctx,'M549 654L691 684L757 642Q653 663 549 654Z','#a58853');stroke(ctx,'M549 654L691 684L757 642M643 650V451','#a58853',3);
    ctx.globalAlpha=.3;fill(ctx,'M646 459Q704 485 722 610L647 605Z','#a58853');ctx.globalAlpha=1;stroke(ctx,'M646 459Q704 485 722 610L647 605Z','#a58853',2);
    for(let y=488;y<609;y+=24)stroke(ctx,`M647 ${y}L${667+(y-488)*.45} ${y+9}`,'#a58853',2);
    stroke(ctx,'M634 493Q594 517 577 597L634 602Z','#a58853',2);
  } else if(id==='wuhan') {
    moon(ctx,1018,254,116);pagoda(ctx,650,611,.98,5);stroke(ctx,'M81 671H1192M81 650H1192','#a58853',3);
    for(let x=103;x<1180;x+=98)stroke(ctx,`M${x} 674V744M${x} 696Q${x+46} 650 ${x+96} 696`,'#a58853',3.7);
    for(let x=110;x<1180;x+=19)stroke(ctx,`M${x} 649V632`,'#a58853',1.5);
    water(ctx,91,740,825);tree(ctx,133,715,1.18,44);
  } else if(id==='nanjing') {
    moon(ctx,1000,229,111);ctx.globalAlpha=.22;fill(ctx,'M247 647V528H331V449H968V528H1041V647Z','#a58853');ctx.globalAlpha=1;
    stroke(ctx,'M247 647V528H331V449H968V528H1041V647M222 655H1063','#a58853',3.5);
    for(let row=0;row<10;row++){const y=468+row*18;stroke(ctx,`M336 ${y}H525M775 ${y}H963`,'#a58853',.8);for(let x=348+row%2*20;x<953;x+=44){if(x<526||x>777)stroke(ctx,`M${x} ${y}v-16`,'#a58853',.7);}}
    stroke(ctx,'M552 646V554a98 98 0 0 1 196 0V646M567 646V555a83 83 0 0 1 166 0V646','#a58853',4);
    colonnade(ctx,650,357,324,79,8);roof(ctx,650,347,480,81);colonnade(ctx,650,274,204,59,6);roof(ctx,650,266,360,66);stroke(ctx,'M650 200V169','#a58853',3);
    tree(ctx,122,696,1.6,89);tree(ctx,1118,701,1.37,96);stroke(ctx,'M202 711Q422 647 663 695T1106 711','#a58853',3);
  } else if(id==='shanghai') {
    moon(ctx,400,228,102);tower(ctx,407,635,78,156,6);tower(ctx,506,634,61,208,15);stroke(ctx,'M650 122V626','#a58853',3);
    [305,416].forEach((y,i)=>{const r=i?53:35;ctx.strokeStyle='#a58853';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(650,y,r,r*.8,0,0,Math.PI*2);ctx.stroke();for(let z=-2;z<=2;z++){ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(650,y+z*7,Math.sqrt(1-(z/4)**2)*r,5,0,0,Math.PI*2);ctx.stroke();}});
    stroke(ctx,'M627 454L576 636M674 454L725 636M637 279V184H663V279','#a58853',5);tower(ctx,756,635,55,261,24);tower(ctx,832,635,65,355,29);stroke(ctx,'M844 320H885V359H844Z','#a58853',3);
    ctx.globalAlpha=.3;fill(ctx,'M941 633Q901 409 980 174Q960 411 1025 633Z','#a58853');ctx.globalAlpha=1;stroke(ctx,'M941 633Q901 409 980 174Q960 411 1025 633ZM978 205Q925 427 980 627','#a58853',2.5);
    for(let y=307;y<621;y+=17)stroke(ctx,`M${934+Math.abs(440-y)*.02} ${y}h${34+Math.max(0,y-440)*.17}`,'#a58853',.7);
    stroke(ctx,'M180 653H1120','#a58853',2);water(ctx,102,672,817);
  } else {
    moon(ctx,1021,247,116);tower(ctx,512,635,76,211,9);tower(ctx,866,635,64,244,27);
    ctx.globalAlpha=.3;fill(ctx,'M689 635L708 253L752 121L795 253L814 635Z','#a58853');ctx.globalAlpha=1;stroke(ctx,'M689 635L708 253L752 121L795 253L814 635ZM752 124V634M708 253H795M710 268L794 621M794 268L709 621M700 423H804','#a58853',2.3);
    for(let y=287;y<634;y+=19)stroke(ctx,`M${706-(y-287)*.038} ${y}H${797+(y-287)*.038}`,'#a58853',.8);
    stroke(ctx,'M340 635V470Q399 445 424 340Q449 445 509 470V635M424 345V635','#a58853',2.5);for(let y=487;y<631;y+=17)stroke(ctx,`M345 ${y}H504`,'#a58853',.8);
    stroke(ctx,'M203 650H1100','#a58853',2);water(ctx,202,670,815);
  }
  ctx.globalCompositeOperation='destination-in';const edge=ctx.createRadialGradient(650,440,300,650,440,700);edge.addColorStop(0,'#000');edge.addColorStop(.78,'rgba(0,0,0,.94)');edge.addColorStop(1,'transparent');ctx.fillStyle=edge;ctx.fillRect(0,0,ART_WIDTH,ART_HEIGHT);ctx.globalCompositeOperation='source-over';
}
function makeArtwork(place: Place) {
  const painting = document.createElement('canvas'); painting.width = ART_WIDTH; painting.height = ART_HEIGHT;
  const context = painting.getContext('2d')!;
  drawSandArtwork(context, place.id, place.owner);
  context.globalCompositeOperation = 'source-in'; context.fillStyle = place.owner === 'me' ? '#eee0bf' : '#dfb775'; context.fillRect(0, 0, ART_WIDTH, ART_HEIGHT);
  const line = document.createElement('canvas'); line.width = 800; line.height = Math.round(800 * ART_HEIGHT / ART_WIDTH);
  const ink = line.getContext('2d', { willReadFrequently: true })!;
  ink.fillStyle = '#fff'; ink.fillRect(0, 0, line.width, line.height); ink.filter = 'brightness(0)'; ink.drawImage(painting, 0, 0, line.width, line.height);
  return { line, painting };
}
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const shapeName = (index: number) => `${PLACES[index].owner}-${PLACES[index].id}`;
const sandColor = (index: number) => PLACES[index].owner === 'me' ? '#eee0bf' : '#dfb775';

type JourneyView = { indices: [number, number]; finale: boolean; closingLine: boolean };
type LaneRuntime = {
  node: HTMLDivElement; picture: HTMLDivElement; sand: HTMLCanvasElement; canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D; renderer: SandKit | null; loaded: boolean; staticOnly: boolean;
  index: number; previous: number; width: number; height: number; fit: number; ox: number; oy: number; entrance: boolean;
};

export default function Journey({ onComplete, reducedMotion, active: sceneActive = true }: { onComplete: () => void; reducedMotion: boolean; active?: boolean }) {
  const [view, setView] = useState<JourneyView>({ indices: [0, 5], finale: false, closingLine: false });
  const [playing, setPlaying] = useState(true);
  const [ready, setReady] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const laneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pictureRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sandRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const staticRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const pathRefs = useRef<(SVGPathElement | null)[][]>([[], []]);
  const controller = useRef<{ toggle: () => void; replay: () => void; next: () => void; sync: () => void } | null>(null);
  const clockRef = useRef({ elapsed: 0, playing: true });
  const allowedRef = useRef(sceneActive);
  allowedRef.current = sceneActive;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const completedRef = useRef(false);

  useEffect(() => { controller.current?.sync(); }, [sceneActive]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const artwork = PLACES.map(makeArtwork);
    const lanes: LaneRuntime[] = [];
    for (let n = 0; n < 2; n += 1) {
      const node = laneRefs.current[n]; const picture = pictureRefs.current[n];
      const sand = sandRefs.current[n]; const canvas = staticRefs.current[n];
      const context = canvas?.getContext('2d');
      if (!node || !picture || !sand || !canvas || !context) return;
      const index = clockRef.current.elapsed >= ROUTE_MS ? (n === 0 ? LAST : 8) : (n === 0 ? HER_STOPS[Math.floor(clockRef.current.elapsed / 8000)] : HIS_STOPS[Math.floor(clockRef.current.elapsed / 10000)]);
      lanes.push({ node, picture, sand, canvas, context, renderer: null, loaded: reducedMotion, staticOnly: reducedMotion, index, previous: index, width: 1, height: 1, fit: 1, ox: 0, oy: 0, entrance: clockRef.current.elapsed === 0 });
      canvas.style.opacity = '1';
    }
    let disposed = false; let frame = 0; let last = 0; let visible = true;
    let elapsed = clockRef.current.elapsed; let play = clockRef.current.playing;
    let finale = elapsed >= ROUTE_MS; let closingLine = elapsed >= ROUTE_MS + 6500;
    const loaded = () => lanes.every((lane) => lane.loaded);
    const available = () => !disposed && !document.hidden && visible && allowedRef.current && loaded() && !completedRef.current;
    const localTime = (n: number) => finale ? elapsed - ROUTE_MS : elapsed % (n === 0 ? 8000 : 10000);
    const cancelFrame = () => { if (reducedMotion) clearTimeout(frame); else cancelAnimationFrame(frame); frame = 0; };

    const drawStatic = (lane: LaneRuntime, local: number) => {
      const { context: ctx, width, height, ox, oy, fit } = lane;
      ctx.clearRect(0, 0, width, height);
      const blend = reducedMotion ? 1 : clamp(local / 1500);
      if (blend < 1 && lane.previous !== lane.index) {
        ctx.globalAlpha = 1 - blend; ctx.drawImage(artwork[lane.previous].painting, ox, oy, ART_WIDTH * fit, ART_HEIGHT * fit);
      }
      ctx.globalAlpha = blend; ctx.drawImage(artwork[lane.index].painting, ox, oy, ART_WIDTH * fit, ART_HEIGHT * fit); ctx.globalAlpha = 1;
    };
    const compose = (lane: LaneRuntime) => {
      const width = lane.node.clientWidth || 1; const height = lane.node.clientHeight || 1;
      const mobile = window.matchMedia('(max-width: 700px)').matches;
      const reserve = lane.index === LAST && mobile ? Math.min(140, height * .36) : 0;
      const availableHeight = height - reserve;
      const fit = lane.index === LAST
        ? Math.min(width / (mobile ? 1020 : 1180), availableHeight / 780)
        : Math.min(width / (PLACES[lane.index].id === 'shanghai' ? 1110 : 1000), height / 635, Math.min(width, height) * 2 / ART_WIDTH);
      const extraX = lane.index === LAST ? width * .025 : 0;
      lane.width = width; lane.height = height; lane.fit = fit;
      lane.ox = (width - ART_WIDTH * fit) / 2 + extraX;
      lane.oy = (availableHeight - ART_HEIGHT * fit) / 2;
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      lane.canvas.width = Math.round(width * dpr); lane.canvas.height = Math.round(height * dpr);
      lane.context.setTransform(dpr, 0, 0, dpr, 0, 0);
      lane.node.style.setProperty('--art-left', `${lane.ox}px`);
      lane.node.style.setProperty('--art-top', `${lane.oy}px`);
      lane.node.style.setProperty('--art-width', `${ART_WIDTH * fit}px`);
      lane.node.style.setProperty('--art-height', `${ART_HEIGHT * fit}px`);
      lane.renderer?.setOptions({ pictureScale: fit * ART_WIDTH / Math.max(1, Math.min(width, height)), offsetX: extraX / width, offsetY: reserve / (2 * height), color: sandColor(lane.index), colorDark: sandColor(lane.index) });
      drawStatic(lane, localTime(lanes.indexOf(lane)));
    };
    const updateView = () => setView({ indices: [lanes[0].index, lanes[1].index], finale, closingLine });
    const select = (lane: LaneRuntime, next: number) => {
      if (lane.index === next) return;
      lane.previous = lane.index; lane.index = next; lane.renderer?.pin(shapeName(next));
      compose(lane);
    };
    const directScene = () => {
      lanes.forEach((lane, n) => {
        if (finale && n === 1) return;
        const local = localTime(n); const duration = finale ? MEETING_MS : n === 0 ? 8000 : 10000;
        const progress = clamp(local / duration);
        lane.picture.style.transform = reducedMotion || finale ? 'none' : `translate3d(${(n === 0 ? 1 : -1) * (progress - .5) * 4}px,${(1 - progress) * 2}px,0) scale(${1.018 + progress * .023})`;
        lane.node.parentElement!.style.setProperty('--caption-opacity', `${reducedMotion ? 1 : clamp((local - 550) / 700)}`);
        lane.node.parentElement!.style.setProperty('--title-opacity', `${reducedMotion ? 1 : .35 + .65 * clamp(local / 1000)}`);
        if (lane.staticOnly || !lane.loaded) drawStatic(lane, local);
        pathRefs.current[n].forEach((path, p) => {
          if (!path) return;
          const fraction = reducedMotion ? 1 : clamp((local - (finale ? (p === 0 ? 700 : 2500) : 500 + p * 530)) / (finale ? 3300 : 1450));
          path.style.strokeDasharray = '1'; path.style.strokeDashoffset = `${1 - fraction}`;
          path.style.opacity = `${finale ? .94 : reducedMotion ? 0 : fraction < 1 ? .46 : .07}`;
        });
      });
      const meetingLocal = elapsed - ROUTE_MS;
      root.style.setProperty('--meeting-reveal', `${reducedMotion ? 1 : clamp((meetingLocal - 5200) / 900)}`);
      root.style.setProperty('--delta-reveal', `${reducedMotion ? 1 : clamp((meetingLocal - 3200) / 650)}`);
      root.style.setProperty('--delta-progress', `${reducedMotion ? 0 : 1 - clamp((meetingLocal - 3600) / 1800)}`);
      root.style.setProperty('--exit-opacity', `${reducedMotion ? 0 : clamp((elapsed - TOTAL_MS) / 1100)}`);
    };
    function tick(stamp: number) {
      frame = 0;
      if (!available() || !play) { last = 0; return; }
      // Story duration is elapsed foreground time, never the renderer's capped simulation delta.
      const dt = last ? Math.max(0, stamp - last) : 0; last = stamp; elapsed += dt;
      clockRef.current.elapsed = elapsed;
      const nextFinale = elapsed >= ROUTE_MS;
      const nextClosingLine = elapsed >= ROUTE_MS + 6500;
      const indices = nextFinale ? [LAST, 8] : [HER_STOPS[Math.floor(elapsed / 8000)], HIS_STOPS[Math.floor(elapsed / 10000)]];
      if (nextFinale !== finale || nextClosingLine !== closingLine || lanes.some((lane, n) => lane.index !== indices[n])) {
        finale = nextFinale; closingLine = nextClosingLine;
        lanes.forEach((lane, n) => select(lane, indices[n]));
        updateView();
        if (finale) lanes[1].renderer?.pause();
      }
      if (elapsed >= TOTAL_MS && !root!.classList.contains('journey-leaving')) { root!.classList.add('journey-leaving'); setLeaving(true); }
      directScene();
      if (elapsed >= TOTAL_MS + (reducedMotion ? 125 : 1100)) {
        completedRef.current = true; lanes.forEach((lane) => lane.renderer?.pause()); onCompleteRef.current(); return;
      }
      wake();
    }
    function wake() {
      if (!frame && available() && play) frame = reducedMotion ? window.setTimeout(() => tick(performance.now()), 125) : requestAnimationFrame(tick);
    }
    function sync() {
      last = 0;
      const running = available() && play;
      root!.dataset.sceneSuspended = running ? 'false' : 'true';
      lanes.forEach((lane, n) => {
        if (running && !(finale && n === 1)) {
          lane.renderer?.resume();
          if (lane.entrance) { lane.entrance = false; lane.renderer?.replay(); }
        } else lane.renderer?.pause();
      });
      if (running) wake(); else cancelFrame();
    }
    const seek = (time: number) => {
      elapsed = time; clockRef.current.elapsed = time; last = 0;
      finale = time >= ROUTE_MS; closingLine = false; completedRef.current = false;
      play = true; clockRef.current.playing = true; setPlaying(true); setLeaving(false); root.classList.remove('journey-leaving');
      lanes.forEach((lane, n) => {
        select(lane, finale ? n === 0 ? LAST : 8 : n === 0 ? 0 : 5);
        if (time === 0) lane.entrance = true;
      });
      updateView(); directScene(); sync();
    };
    controller.current = {
      toggle: () => { play = !play; clockRef.current.playing = play; setPlaying(play); sync(); },
      replay: () => seek(0),
      next: () => { if (finale) { elapsed = TOTAL_MS; clockRef.current.elapsed = elapsed; setLeaving(true); root.classList.add('journey-leaving'); play = true; clockRef.current.playing = true; setPlaying(true); sync(); } else seek(ROUTE_MS); },
      sync,
    };
    const checkReady = () => {
      if (disposed) return;
      setReady(loaded()); setFallback(lanes.some((lane) => lane.staticOnly));
      if (loaded()) sync();
    };
    const useStatic = (lane: LaneRuntime) => {
      if (disposed) return;
      lane.renderer?.dispose(); lane.renderer = null; lane.staticOnly = true; lane.loaded = true;
      lane.canvas.style.opacity = '1'; drawStatic(lane, localTime(lanes.indexOf(lane))); checkReady();
    };
    const resizer = new ResizeObserver(() => { lanes.forEach(compose); directScene(); });
    lanes.forEach((lane) => { compose(lane); resizer.observe(lane.node); });
    const observer = new IntersectionObserver((entries) => { visible = entries.some((entry) => entry.isIntersecting); sync(); }, { threshold: .12 }); observer.observe(root);
    document.addEventListener('visibilitychange', sync);
    if (reducedMotion) checkReady();
    else lanes.forEach((lane, n) => {
      const sourceIndices = n === 0 ? [...HER_STOPS, LAST] : HIS_STOPS;
      const shapes: ShapeSource[] = sourceIndices.map((i) => {
        const line = artwork[i].line;
        return { name: shapeName(i), pinOnly: true, raster: () => ({ line: { w: line.width, h: line.height, data: line.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, line.width, line.height).data } }) };
      });
      try {
        // Two actual renderers, 26k each on every screen: the combined mobile budget is never exceeded on resize.
        lane.renderer = new SandKit(lane.sand, { shapes, worker: true, options: {
          count: 26000, pointSize: 1.28, sizeVariation: 1.02, opacity: 1, color: sandColor(lane.index), colorDark: sandColor(lane.index),
          introMs: 1800, moveMs: 1950, holdMs: 15000, stagger: .39, scatterPhase: .25, scatterReach: .1, scatterDepth: .3, flightFade: .035,
          jitter: .00065, sway: 0, tilt: .018, tiltEase: .11, depthRange: .09, depthContrast: .15, dustShare: .004, fillDensity: .55, interiorTone: .035, blurRadius: 1, cloudRadius: 1.08, cloudFar: -.35,
          pictureScale: lane.fit * ART_WIDTH / Math.max(1, Math.min(lane.width, lane.height)), offsetX: 0, offsetY: 0, layoutMs: 900,
        }, onError: () => useStatic(lane) });
        lane.renderer.pin(shapeName(lane.index)); lane.renderer.pause();
        lane.renderer.ready.then(() => {
          if (disposed || lane.staticOnly) return;
          lane.loaded = true; lane.canvas.style.opacity = '0'; compose(lane); checkReady();
        }).catch(() => useStatic(lane));
      } catch { useStatic(lane); }
    });
    updateView(); directScene();
    return () => { disposed = true; cancelFrame(); lanes.forEach((lane) => lane.renderer?.dispose()); resizer.disconnect(); observer.disconnect(); document.removeEventListener('visibilitychange', sync); controller.current = null; };
  }, [reducedMotion]);

  return (
    <section ref={rootRef} className={`journey-stage journey-duet${view.finale ? ' journey-map-finale' : ''}${leaving ? ' journey-leaving' : ''}${reducedMotion ? ' journey-still' : ''}${!playing || !sceneActive ? ' journey-paused' : ''}`} data-scene={view.finale ? 'both-tokyo' : `${shapeName(view.indices[0])} ${shapeName(view.indices[1])}`} aria-label="第二章，两条各自走过的人生来路，最后一站是日本东京">
      <header className="journey-heading" data-pet-obstacle><span className="journey-eyebrow">第二章 · 两条来路</span><span className="journey-chapter-poem">各自的时光，终于同页。</span></header>
      <div className="journey-duet-field">
        {view.indices.map((index, n) => {
          const place = PLACES[index]; const paired = index === LAST;
          return <article className={`journey-lane journey-lane-${n === 0 ? 'her' : 'me'}`} key={n} aria-hidden={view.finale && n === 1} aria-label={paired ? '我们的最后一站，日本东京' : n === 0 ? '她的来路' : '我的来路'}>
            <header className="journey-place" data-pet-obstacle>
              <span className="journey-person">{paired ? '终于同页' : n === 0 ? '你的来路' : '我的来路'}</span>
              <h3>{place.id === 'zhoukou' || place.id === 'wuhan' ? `${place.region} · ${place.city}` : paired ? '日本 · 东京' : place.city}</h3>
              {place.school && <p className="journey-school">{place.school}</p>}
            </header>
            <div className="journey-art" ref={(node) => { laneRefs.current[n] = node; }}>
              <div className="journey-picture" ref={(node) => { pictureRefs.current[n] = node; }}>
                <canvas ref={(node) => { staticRefs.current[n] = node; }} className="journey-fallback" aria-hidden="true" />
                <canvas ref={(node) => { sandRefs.current[n] = node; }} className="journey-sand" aria-hidden="true" />
                <svg className="journey-drawn-lines" viewBox={`0 0 ${ART_WIDTH} ${ART_HEIGHT}`} aria-hidden="true">
                  {(paired ? MAP_ROUTES : DRAWING_PATHS[place.id]).map((d, i) => <path pathLength="1" className={paired ? `journey-map-route journey-map-route-${i}` : undefined} d={d} key={`${index}-${i}`} ref={(node) => { pathRefs.current[n][i] = node; }} />)}
                  {paired && <><g className="journey-map-knot" transform={`translate(${MEETING[0]} ${MEETING[1]})`}><circle r="23" /><circle r="10" /><path d="M0 0C-25-20-34 13-9 9L0 0C24-21 34 12 9 9Z" /><path d="M-1 2Q-9 23-27 26M2 2Q11 24 30 27" /></g><g className="journey-delta-connector"><path className="journey-delta-leader-desktop" d={`M${MEETING[0] + 20} ${MEETING[1]}L1140 500L1040 590`} /><path className="journey-delta-leader-mobile" d={`M${MEETING[0]} ${MEETING[1] + 21}L${MEETING[0]} 756L640 818`} /></g></>}
                </svg>
                {paired && <div className="journey-map-labels" aria-label="周口、天津、北京、香港、深圳、东京；武汉、南京、上海、深圳、东京">
                  {MAP_POINTS.map((point) => { const [x, y] = mapPosition(point); return <span className={`journey-map-label journey-map-label-${point.id}`} key={point.id} style={{ left: `${(x + point.dx) / ART_WIDTH * 100}%`, top: `${(y + point.dy) / ART_HEIGHT * 100}%` }}>{point.label}</span>; })}
                  {MAP_POINTS.map((point) => {
                    const [x, y] = mapPosition(point); const callout = MOBILE_MAP_CALLOUTS[point.id];
                    return <span className="journey-map-callout" key={`callout-${point.id}`} style={{ left: `${x / ART_WIDTH * 100}%`, top: `${y / ART_HEIGHT * 100}%` }}>
                      <svg viewBox="-100 -100 200 200" aria-hidden="true"><path d={`M0 0L${callout.x * .5} ${callout.y}L${callout.x} ${callout.y}`} /></svg>
                      <span className={`journey-map-callout-label journey-map-label-${point.id}${callout.x < 0 ? ' is-left' : ''}`} style={{ left: callout.x, top: callout.y }}>{point.label}</span>
                    </span>;
                  })}
                </div>}
              </div>
              {paired && <figure className="journey-delta-inset" aria-label="最后一程，从深圳到日本东京。保留城市真实经纬度相对位置。" data-pet-obstacle>
                <figcaption>最后一程 · 深圳 → 东京</figcaption>
                <svg viewBox="0 0 320 156" aria-hidden="true"><path className="journey-delta-grid" d="M31 66H289M31 110H289M77 26V136M221 26V136" /><path className="journey-delta-route" pathLength="1" d={`M${LEG_SHENZHEN.join(' ')}L${LEG_TOKYO.join(' ')}`} /><circle className="journey-delta-city" cx={LEG_SHENZHEN[0]} cy={LEG_SHENZHEN[1]} r="5" /><circle className="journey-delta-city journey-delta-meeting" cx={LEG_TOKYO[0]} cy={LEG_TOKYO[1]} r="7" /><path className="journey-delta-arrow" d={`M${LEG_TOKYO[0] - 3} ${LEG_TOKYO[1] + 16}l-4-10 10 5`} /></svg>
                <span className="journey-delta-hongkong" style={{ left: '20%', top: '65%' }}><strong>深圳</strong><small>继续向前</small></span><span className="journey-delta-shenzhen" style={{ right: '5%', top: '5%' }}><strong>东京</strong><small>日本 · 最后一站</small></span>
              </figure>}
            </div>
            <p className="journey-lane-caption" data-pet-obstacle>{paired && view.closingLine ? place.caption : place.line}</p>
          </article>;
        })}
      </div>
      <footer className="journey-footer" data-pet-obstacle>
        <button type="button" onClick={() => controller.current?.replay()} disabled={!ready || leaving}>重新读起</button>
        <button type="button" className="journey-playback" onClick={() => controller.current?.toggle()} disabled={!ready || leaving} aria-label={playing ? '暂停两条路线的自动讲述' : '继续两条路线的自动讲述'}>{playing ? '让这一刻停留' : '让故事继续'}</button>
        <button type="button" className="journey-next" onClick={() => controller.current?.next()} disabled={!ready || leaving}>{view.finale ? '收进回忆' : '看最后一站'}<span aria-hidden="true">↗</span></button>
      </footer>
      <p className="journey-status" role="status">{!ready ? '沙粒正在汇聚…' : fallback && !reducedMotion ? '以静帧沙画，继续讲述来路' : ''}</p>
    </section>
  );
}
