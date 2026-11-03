// A watercolor animation cel; the tiny star and the movement toward the heart stay live.
import {asset,loadImage,clamp,easeInOut} from './util.js';

export const PAINTED_HANDS = Object.freeze({frames:36,open:8,w:1536,h:1024,star:[.515,.43]});

export async function loadPaintedHands() {
  const image=await loadImage(asset('img/hands-cupped-painted.png'));
  return {meta:PAINTED_HANDS,image};
}

export function drawPaintedHands(g,{images,x,y,width,height,close=0,opacity=1,time=0,reduced=false}){
  if(!images)return;
  const breath=reduced?0:Math.sin(time*1.15)*width*.0012;
  const hold=easeInOut(clamp(close)),[sx,sy]=PAINTED_HANDS.star;
  g.save();g.globalAlpha*=clamp(opacity);
  // Move one clean cel as the hands cradle the light: never dissolve between mismatched fingers.
  g.translate(x+width*sx,y+height*sy+breath);
  g.rotate(reduced?0:hold*.012);
  g.scale(1-hold*.018,1-hold*.028);
  g.drawImage(images.image,-width*sx,-height*sy,width,height);
  g.restore();
}
