// Where things sit in the prologue's paintings (fractions of each image unless noted). Measured from the
// art by tools/prologue_art.py; edit by hand only together with the images.
export const PRO = {
  moon: { x: .643, y: .344 },           // castle.webp (the photograph): the moon behind the spire
  castle: { x: .47, y: .53 },           // the heart of the castle, where the glide comes to rest
  horizon: .33,                         // the stars stay above this line
  windows: { y0: .42, y1: .66 },        // the castle's lit windows
  lake: { x0: .0, y0: .93, x1: 1, y1: .995 },
  mistY: .64,
  boats: [],
  castlePlane: 2, lakePlane: 4,         // depth planes the windows (and the mist below them) and the water belong to
  envAspect: 1.4634,                    // envelope width / height (tools/parchment.py)
  seal: { x: .5, y: .645, w: .2 },      // the wax seal (tools/seal_blender.py) on the flap's point: centre, width / envelope width
};
