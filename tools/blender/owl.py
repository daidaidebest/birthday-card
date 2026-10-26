# A snowy owl with a real wing stroke, exec'd from castle.py (uses its namespace: s, cam, FPS, FRAMES, MOON_DIR, blu...).
# Model: plump body + round head with a facial disc, golden eyes, two-segment wings (arm + hand) on an armature,
# slotted primaries, a fanned tail. Motion: deep, slow wingbeats (downstroke longer than upstroke, the hand folding
# on the way up), long glides, the body rising on each downstroke, banking into its turn, and the head held steady
# — it turns to look at the camera as it passes the moon.
import bpy, bmesh, math, random
from mathutils import Vector, Matrix, Euler, Quaternion

OWL = collection('Owl')
RO = random.Random(5)

def feather_mat(name, base=(.86, .86, .84), spots=.55, spot_scale=9.0, under=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; P = N['Principled BSDF']; out = N['Material Output']
    tc = N.new('ShaderNodeTexCoord')
    # dark chevrons/bars of a snowy owl: stretched voronoi cells thresholded into small marks
    mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (spot_scale, spot_scale * 2.2, spot_scale); link(nt, tc.outputs['Object'], mp.inputs[0])
    vo = N.new('ShaderNodeTexVoronoi'); vo.feature = 'F1'; vo.inputs['Randomness'].default_value = .9; link(nt, mp.outputs[0], vo.inputs['Vector'])
    th = N.new('ShaderNodeMapRange'); th.inputs[1].default_value = .14; th.inputs[2].default_value = .22; link(nt, vo.outputs['Distance'], th.inputs[0])
    ck = N.new('ShaderNodeMath'); ck.operation = 'GREATER_THAN'; ck.inputs[1].default_value = 1 - spots; link(nt, vo.outputs['Color'], ck.inputs[0])
    inv = N.new('ShaderNodeMath'); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1; link(nt, th.outputs[0], inv.inputs[1])
    spot = N.new('ShaderNodeMath'); spot.operation = 'MULTIPLY'; link(nt, inv.outputs[0], spot.inputs[0]); link(nt, ck.outputs[0], spot.inputs[1])
    col = N.new('ShaderNodeMix'); col.data_type = 'RGBA'; link(nt, spot.outputs[0], col.inputs[0]); col.inputs[6].default_value = (*base, 1); col.inputs[7].default_value = (.09, .08, .075, 1)
    link(nt, col.outputs[2], P.inputs['Base Color'])
    P.inputs['Roughness'].default_value = .62; P.inputs['Sheen Weight'].default_value = .6; P.inputs['Sheen Roughness'].default_value = .4
    # soft, fine feather texture
    nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 140; nz.inputs['Detail'].default_value = 4; link(nt, tc.outputs['Object'], nz.inputs['Vector'])
    b = N.new('ShaderNodeBump'); b.inputs['Strength'].default_value = .25; b.inputs['Distance'].default_value = .002; link(nt, nz.outputs['Fac'], b.inputs['Height']); link(nt, b.outputs[0], P.inputs['Normal'])
    # moonlight through thin wing feathers
    tr = N.new('ShaderNodeBsdfTranslucent'); tr.inputs[0].default_value = (1, .97, .93, 1)
    mx = N.new('ShaderNodeMixShader'); mx.inputs[0].default_value = .28 if under else .1
    link(nt, P.outputs[0], mx.inputs[1]); link(nt, tr.outputs[0], mx.inputs[2]); link(nt, mx.outputs[0], out.inputs[0])
    return m
F_BODY = feather_mat('owl_body', spots=.35, spot_scale=11)
F_WING = feather_mat('owl_wing', spots=.5, spot_scale=8, under=True)
F_FACE = feather_mat('owl_face', base=(.93, .93, .92), spots=.0)
EYE = mat('owl_eye', (1.0, .72, .05), .15, emit=(1, .6, .05), strength=.6)
PUPIL = mat('owl_pupil', (0, 0, 0), .05)
BEAK = mat('owl_beak', (.04, .035, .03), .35)
LETTER = mat('owl_letter', (.82, .72, .52), .7)
RIBBON = mat('owl_ribbon', (.75, .55, .18), .3, metal=.6)

def ellipsoid(name, c, r, seg=28, rings=18, mats=(), taper=None):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1)
    for v in bm.verts:
        x, y, z = v.co
        if taper: x, y, z = taper(x, y, z)
        v.co = Vector((c[0] + x * r[0], c[1] + y * r[1], c[2] + z * r[2]))
    return obj_from_bm(name, bm, mats, col=OWL, smooth=True)

def body_taper(x, y, z):
    k = 1 - .38 * max(0, -y) ** 1.5           # slimmer toward the tail
    z2 = z - .18 * max(0, -y) ** 2 + .05 * max(0, y)
    return x * k, y, z2 * (1 - .1 * max(0, -y))
root = bpy.data.objects.new('owl', None); OWL.objects.link(root)
body = ellipsoid('owl_bodym', (0, 0, 0), (.15, .27, .135), mats=[F_BODY], taper=body_taper); body.parent = root
head = bpy.data.objects.new('owl_head', None); OWL.objects.link(head); head.parent = root; head.location = (0, .25, .07)
hd = ellipsoid('owl_headm', (0, 0, 0), (.118, .108, .11), mats=[F_BODY]); hd.parent = head
face = ellipsoid('owl_facem', (0, .062, -.005), (.1, .045, .088), mats=[F_FACE]); face.parent = head
for sx in (-1, 1):
    e = ellipsoid(f'owl_eye{sx}', (sx * .043, .1, .018), (.021, .012, .019), seg=16, rings=10, mats=[EYE]); e.parent = head
    p = ellipsoid(f'owl_pupil{sx}', (sx * .043, .111, .018), (.011, .004, .011), seg=12, rings=8, mats=[PUPIL]); p.parent = head
bk = bmesh.new(); bmesh.ops.create_cone(bk, cap_ends=True, segments=8, radius1=.016, radius2=.002, depth=.035, matrix=Matrix.Translation((0, .118, -.012)) @ Matrix.Rotation(math.radians(-70), 4, 'X'))
obj_from_bm('owl_beak', bk, [BEAK], col=OWL, smooth=True).parent = head
# tail: a fan of broad feathers
tb = bmesh.new()
for k in range(7):
    a = math.radians(-24 + k * 8); L = .2 - abs(k - 3) * .008
    d = Vector((math.sin(a), -math.cos(a), 0)); side = Vector((d.y, -d.x, 0)) * .028
    o = Vector((0, -.2, -.02)); tip = o + d * L
    vs = [tb.verts.new(o - side * .6), tb.verts.new(o + side * .6), tb.verts.new(tip + side + Vector((0, 0, .002 * k))), tb.verts.new(tip - side + Vector((0, 0, .002 * k)))]
    tb.faces.new(vs)
tail = obj_from_bm('owl_tail', tb, [F_WING], col=OWL); tail.parent = root
tail.modifiers.new('sol', 'SOLIDIFY').thickness = .006

# ---------- wings on an armature ----------
arm_data = bpy.data.armatures.new('owl_rig'); rig = bpy.data.objects.new('owl_rig', arm_data); OWL.objects.link(rig); rig.parent = root
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')
SH, WR, TIP = .1, .36, .74   # shoulder, wrist, tip (x, m)
for side, sx in (('R', 1), ('L', -1)):
    a = arm_data.edit_bones.new(f'arm.{side}'); a.head = (sx * SH, .05, .05); a.tail = (sx * WR, .07, .06); a.roll = 0
    h = arm_data.edit_bones.new(f'hand.{side}'); h.head = a.tail; h.tail = (sx * TIP, .02, .06); h.parent = a; h.use_connect = True; h.roll = 0
bpy.ops.object.mode_set(mode='OBJECT')

def wing_mesh(sx):
    """Planform: rounded leading edge, scalloped secondaries, five separated primaries at the hand ('fingers')."""
    bm = bmesh.new(); NU, NV = 16, 6; grid = []
    def le(u):  # leading edge y
        return .08 + .05 * math.sin(min(1, u / .5) * math.pi / 2) - .12 * max(0, u - .55) ** 1.6
    def te(u):  # trailing edge y
        return -.2 - .02 * math.sin(u * math.pi) + .06 * max(0, u - .55)
    for i in range(NU + 1):
        u = i / NU * .78; x = SH + u * (TIP - SH) - .02; row = []
        for j in range(NV + 1):
            v = j / NV; y = le(u) * (1 - v) + te(u) * v
            scal = .012 * abs(math.sin(i * math.pi / 2)) * v ** 3  # scalloped trailing feathers
            z = .06 + .022 * (1 - v) ** 2 * (1 - u) - .01 * v
            row.append(bm.verts.new((sx * x, y - scal, z)))
        grid.append(row)
    for i in range(NU):
        for j in range(NV):
            f = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]) if sx > 0 else (grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j], grid[i][j]))
    # primaries: long slender feathers fanning from the hand
    x0 = SH + .78 * (TIP - SH) - .04
    for k in range(6):
        ang = math.radians(8 - k * 11); L = .24 - k * .018; w = .034
        base = Vector((sx * (x0 - k * .012), .03 - k * .03, .055))
        d = Vector((sx * math.cos(ang), math.sin(ang), 0)); n = Vector((-d.y, d.x, 0)) * (w / 2)
        p = [base - n, base + n, base + d * L * .82 + n * .9, base + d * L, base + d * L * .82 - n * .9]
        vs = [bm.verts.new(q + Vector((0, 0, -.004 * k))) for q in p]
        bm.faces.new(vs if sx > 0 else list(reversed(vs)))
    me = bpy.data.meshes.new(f'owl_wing{sx}'); bm.to_mesh(me); bm.free(); me.materials.append(F_WING)
    ob = bpy.data.objects.new(f'owl_wing{sx}', me); OWL.objects.link(ob); ob.parent = rig
    side = 'R' if sx > 0 else 'L'
    ga, gh = ob.vertex_groups.new(name=f'arm.{side}'), ob.vertex_groups.new(name=f'hand.{side}')
    for v in me.vertices:
        ax = abs(v.co.x); k = max(0, min(1, (ax - (WR - .06)) / .12)); k = k * k * (3 - 2 * k)
        ga.add([v.index], 1 - k, 'REPLACE'); gh.add([v.index], k, 'REPLACE')
    md = ob.modifiers.new('rig', 'ARMATURE'); md.object = rig
    sol = ob.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = .008; sol.offset = 0
    sub = ob.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
    ob.modifiers.move(2, 0) if False else None
    return ob
wings = [wing_mesh(1), wing_mesh(-1)]
# the letter, held in its talons under the body
lb = bmesh.new(); bmesh.ops.create_cube(lb, size=1, matrix=Matrix.Translation((0, .02, -.17)) @ Matrix.Rotation(.2, 4, 'Z') @ Matrix.Diagonal((.2, .13, .012, 1)))
letter = obj_from_bm('owl_letter', lb, [LETTER], col=OWL); letter.parent = root
rb = bmesh.new(); bmesh.ops.create_cube(rb, size=1, matrix=Matrix.Translation((0, .02, -.17)) @ Matrix.Rotation(.2, 4, 'Z') @ Matrix.Diagonal((.03, .135, .016, 1)))
obj_from_bm('owl_ribbon', rb, [RIBBON], col=OWL).parent = root

# a soft moonlit key that only touches the owl (light linking), so its white feathers read against the sky
okey = bpy.data.objects.new('owl_key', bpy.data.lights.new('owl_key', 'SUN')); s.collection.objects.link(okey)
okey.data.energy = 2.2; okey.data.color = (.8, .86, 1.0); okey.data.angle = math.radians(8)
okey.rotation_euler = (-Vector((.3, 1, -.6)).normalized()).to_track_quat('-Z', 'Y').to_euler()
try:
    okey.light_linking.receiver_collection = OWL
except Exception as e: print('light linking unavailable', e)
# ---------- flight ----------
def flap_state(t):
    """(phase 0..1 within a beat or None while gliding, glide weight 0..1). Beats: ~2.3 Hz; long glides between."""
    plan = [(0, 4), (1.75, 0), (3.1, 3), (4.5, 0), (9, 0)]  # (start time, beats); 0 beats = glide
    T = 1 / 2.3
    for (t0, n), (t1, _) in zip(plan, plan[1:]):
        if t0 <= t < t1:
            if n and t - t0 < n * T: return ((t - t0) / T) % 1, 0.0
            return None, min(1, (t - t0 - n * T) / .35)
    return None, 1.0
def wing_pose(t):
    ph, glide = flap_state(t)
    if ph is None:   # glide: wings spread, a slight dihedral, tiny corrections in the air
        g = math.radians(6) + math.radians(1.5) * math.sin(t * 5.1)
        return dict(flap=g, hand=math.radians(-3), sweep=0, hsweep=math.radians(-6), twist=math.radians(2) * math.sin(t * 3.3), bob=0)
    # downstroke 0..0.58, upstroke 0.58..1
    if ph < .58: u = ph / .58; f = math.cos(u * math.pi)          # +1 (up) -> -1 (down)
    else: u = (ph - .58) / .42; f = -math.cos(u * math.pi)        # -1 -> +1
    amp = math.radians(38); flap = math.radians(4) + amp * f
    lagp = (ph - .08) % 1; hf = math.cos(lagp / .58 * math.pi) if lagp < .58 else -math.cos((lagp - .58) / .42 * math.pi)
    hand = math.radians(18) * hf
    fold = math.sin(u * math.pi) if ph >= .58 else 0             # the hand tucks back on the upstroke
    return dict(flap=flap, hand=hand - math.radians(10) * fold, sweep=math.radians(-6) * fold, hsweep=math.radians(-38) * fold,
                twist=math.radians(9) * (-math.sin(ph * 2 * math.pi)), bob=-.035 * f)

# path in camera space: from the right edge, across the moon, out at the top left. x right, y up, z depth (positive = in front)
OWL_T0, OWL_T1 = 3.6, 9.4
def cam_basis(f):
    s.frame_set(f); M = cam.matrix_world.copy(); return M.to_translation(), M.to_3x3()
mid_f = int((OWL_T0 + OWL_T1) / 2 * FPS)
p_mid, B_mid = cam_basis(mid_f)
md_ = B_mid.inverted() @ MOON_DIR   # the moon's direction in camera space at mid-flight
moon_xy = Vector((md_.x / -md_.z, md_.y / -md_.z))  # on the image plane at depth 1
def rel_path(u):
    depth = 6.6 - 1.0 * u
    x = (1 - u) * 1.35 + u * -1.25 + moon_xy.x * .4
    y = moon_xy.y - .03 + .05 * math.sin(u * math.pi) - .22 * (u - .5)
    return Vector((x * depth, y * depth, -depth))
pose_bones = rig.pose.bones
for pb in pose_bones: pb.rotation_mode = 'XYZ'
prev = None
FALL = None
for f in range(1, FRAMES + 1):
    t = f / FPS; u = (t - OWL_T0) / (OWL_T1 - OWL_T0)
    if u < -.05 or u > 1.05:
        root.hide_render = True; root.keyframe_insert('hide_render', frame=f)
        for o in OWL.objects: o.hide_render = True; o.keyframe_insert('hide_render', frame=f)
        continue
    for o in OWL.objects: o.hide_render = False; o.keyframe_insert('hide_render', frame=f)
    cp, B = cam_basis(f)
    q = rel_path(u); q2 = rel_path(u + .01)
    pos = cp + B @ q; ahead = cp + B @ q2
    wp = wing_pose(t)
    fwd = (ahead - pos).normalized()
    # bank into the curve: lateral acceleration in camera space
    acc = (rel_path(u + .02) - 2 * q2 + q); bank = max(-.5, min(.5, -acc.y * 30)) + .18
    up = Vector((0, 0, 1))
    rot = fwd.to_track_quat('Y', 'Z')
    rot = rot @ Quaternion((0, 1, 0), bank) @ Quaternion((1, 0, 0), math.radians(-6))
    root.location = pos + Vector((0, 0, wp['bob'])); root.rotation_mode = 'QUATERNION'; root.rotation_quaternion = rot
    root.keyframe_insert('location', frame=f); root.keyframe_insert('rotation_quaternion', frame=f)
    for side, sx in (('R', 1), ('L', -1)):
        a, h = pose_bones[f'arm.{side}'], pose_bones[f'hand.{side}']
        a.rotation_euler = Euler((wp['flap'], wp['twist'] * sx, wp['sweep'] * -sx))
        h.rotation_euler = Euler((wp['hand'], wp['twist'] * .6 * sx, wp['hsweep'] * -sx))
        a.keyframe_insert('rotation_euler', frame=f); h.keyframe_insert('rotation_euler', frame=f)
    # the head stays level while the body pitches, and turns toward the camera as the owl passes the moon
    look = math.exp(-((u - .5) / .16) ** 2)
    to_cam = (cp - pos).normalized(); local = rot.inverted() @ to_cam
    yaw = math.atan2(-local.x, local.y) * look * .85
    pitch = math.atan2(local.z, math.hypot(local.x, local.y)) * look * .5
    head.rotation_mode = 'XYZ'; head.rotation_euler = Euler((pitch - wp['bob'] * 2, 0, yaw)); head.keyframe_insert('rotation_euler', frame=f)
    tail.rotation_euler = Euler((wp['bob'] * 3 + math.radians(4) * math.sin(t * 2.3), 0, math.radians(3) * math.sin(t * 1.7))); tail.keyframe_insert('rotation_euler', frame=f)
