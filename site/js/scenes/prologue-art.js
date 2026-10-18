// Where things sit in the prologue's paintings (fractions of each image unless noted). Measured from the
// art by tools/prologue_art.py; edit by hand only together with the images.
export const PRO = {
  moon: { x: .605, y: .195 },           // castle.webp: the moon
  castle: { x: .4, y: .5 },            // the heart of the castle, where the dive comes to rest
  tower: { x: .34, y: .27 },            // the tallest tower, where the owl sets off
  horizon: .4,                          // the stars stay above this line
  windows: { y0: .2, y1: .99 },         // lit windows, and the lanterns on the boats with their reflections
  lake: { x0: .02, y0: .8, x1: .85, y1: .99 },
  mistY: .74,
  boats: [],                            // the painting has its own lantern boats; their lights flicker with the windows
  castlePlane: 2, lakePlane: 2,         // depth planes the windows and the water belong to
  owl: { w: 1024, sx: 128, sy: 0, wx: 28, wy: 200, by: 420, ty: 780 }, // owl-body/-wing px: shoulder offset, wing pivot, shoulder line, talons
  envAspect: 1.4634,                    // envelope width / height (tools/parchment.py)
  seal: { x: .5, y: .645, w: .2 },      // the wax seal (tools/seal_blender.py) on the flap's point: centre, width / envelope width
};
