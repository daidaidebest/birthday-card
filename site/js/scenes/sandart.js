// City drawings from the original sand-art chapter (our own line art), drawn in 1280×850 space.
import { CHINA_OUTLINE, CITIES, mapXY } from './pages.js';
const MAP_POINTS = Object.values(CITIES);
const mapPosition = mapXY;
const ART_WIDTH = 1280, ART_HEIGHT = 850;
function randomGenerator(seed) {
  let n = seed;
  return () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
}
function stroke(ctx, d, color = '#b69157', width = 1.6) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(new Path2D(d));
}
function fill(ctx, d, color) {
  ctx.fillStyle = color; ctx.fill(new Path2D(d));
}
function tree(ctx, x, y, scale, seed) {
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
function water(ctx, seed, low = 570, high = 730) {
  const random = randomGenerator(seed);
  for (let i = 0; i < 190; i += 1) {
    const y = low + random() * (high - low); const x = 80 + random() * 1100; const length = 5 + random() * 59;
    ctx.globalAlpha = .12 + (1 - Math.abs(x - 640) / 640) * .36;
    stroke(ctx, `M${x} ${y}q${length / 2} -2 ${length} 0`, '#ae8b56', .7 + random() * 1.6);
  }
  ctx.globalAlpha = 1;
}
function moon(ctx, x = 800, y = 220, radius = 72) {
  ctx.save(); ctx.strokeStyle = '#b48f54'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(x, y, radius + 6, .5, 4.5); ctx.stroke();
  ctx.restore();
}
/** Original city silhouettes; the university names are separate from these regional images. */
function roof(ctx, x, y, w, rise) {
  const a = x - w / 2; const b = x + w / 2;
  const d = `M${a} ${y-16}Q${a+w*.18} ${y-2} ${x} ${y-rise}Q${b-w*.18} ${y-2} ${b} ${y-16}L${b-13} ${y+10}Q${x} ${y+27} ${a+13} ${y+10}Z`;
  ctx.save(); ctx.globalAlpha = .24; fill(ctx, d, '#a58853'); ctx.restore(); stroke(ctx, d, '#a58853', 3);
  stroke(ctx, `M${a+9} ${y+3}Q${x} ${y+18} ${b-9} ${y+3}`, '#a58853', 1.6);
  for (let i=1;i<18;i++) { const t=i/18; const xx=a+w*t; const top=y-rise*(1-Math.abs(t*2-1))**1.55; stroke(ctx, `M${xx} ${top+6}Q${xx-(x-xx)*.03} ${y} ${xx} ${y+9}`, '#a58853', .9); }
}
function colonnade(ctx, x, y, w, h, count) {
  ctx.save(); ctx.globalAlpha = .12; fill(ctx, `M${x-w/2} ${y}h${w}v${h}h${-w}Z`, '#a58853'); ctx.restore();
  for(let i=0;i<=count;i++) {
    const xx=x-w/2+w*i/count; stroke(ctx, `M${xx} ${y}v${h}`, '#a58853', 4.6);
    if(i<count) { const gap=w/count; stroke(ctx, `M${xx+8} ${y+10}h${gap-16}v${h-20}h${16-gap}ZM${xx+gap/2} ${y+11}v${h-22}`, '#a58853', 1); }
  }
  stroke(ctx, `M${x-w/2-13} ${y+h}h${w+26}m${-w-26} 8h${w+26}`, '#a58853', 2.5);
}
function pagoda(ctx, x, y, scale, tiers) {
  ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
  for(let i=0;i<tiers;i++) {
    const yy=-i*88; const w=490-i*64;
    colonnade(ctx,0,yy-55,w*.68,65,6); roof(ctx,0,yy-62,w,72);
    stroke(ctx,`M${-w*.41} ${yy+8}h${w*.82}m${-w*.82} -14h${w*.82}`,'#a58853',2);
  }
  const tip=-(tiers-1)*88-138; stroke(ctx,`M0 ${tip+6}v-39M-9 ${tip-11}h18`,'#a58853',3); ctx.restore();
}
function tower(ctx, x, bottom, w, h, top=0) {
  const y=bottom-h; const d=`M${x} ${bottom}V${y+top}L${x+w*.5} ${y}L${x+w} ${y+top}V${bottom}Z`;
  ctx.save(); ctx.globalAlpha=.2; fill(ctx,d,'#a58853'); ctx.restore(); stroke(ctx,d,'#a58853',2.4);
  for(let xx=x+9;xx<x+w-5;xx+=11) stroke(ctx,`M${xx} ${y+top+13}V${bottom-8}`,'#a58853',.7);
  for(let yy=y+top+22;yy<bottom;yy+=19) stroke(ctx,`M${x+3} ${yy}h${w-6}`,'#a58853',.65);
}
export function drawSandArtwork(ctx, id, owner) {
  ctx.lineCap='round'; ctx.lineJoin='round';
  if(id==='shenzhen'&&owner==='both') {
    ctx.globalAlpha=.08; fill(ctx,CHINA_OUTLINE,'#a58853'); ctx.globalAlpha=1; stroke(ctx,CHINA_OUTLINE,'#a58853',3.1);
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
