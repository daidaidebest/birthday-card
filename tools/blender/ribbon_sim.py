"""The prologue envelope's satin ribbon and bow, as one continuous strip: the tied design, the untie simulation and
the render mesh. Pure numpy (imported by tools/blender/ribbon.py inside Blender; runs alone for checks):
  python3 tools/blender/ribbon_sim.py plot OUT.png      centrelines of a few frames, drawn flat (no Blender)
Units: metres, envelope coordinates (origin = envelope centre, x right, y up the page, z out of the flap side;
the flap side of the envelope is the plane z = 0, the envelope occupies -ET <= z <= 0).

One ribbon, in chain order: left tail -> knot -> left loop -> knot -> left band -> round the left edge -> across the
address side (hidden) -> round the right edge -> right band -> the wrap that forms the visible knot -> right loop ->
knot -> right tail. Untying = pulling the right tail: the right loop's return end slides through the knot (a ring
constraint that moves along the material), the loop shrinks and pops through, the wrap lets go of the left loop, the
crossing opens, and the slack loop round the envelope slips down and off its bottom edge (position-based dynamics
with inextensible links, bending memory of the tied creases, no edge-wise bending, contact + friction with the
envelope, air drag that depends on the ribbon's facing)."""
import numpy as np

EW = 0.22; EH = EW / 1.4634; ET = 0.0016          # envelope 22 cm (aspect from tools/parchment.py), letter inside
SEAL_Y = 0.645                                    # PRO.seal.y: the bow sits on the flap's point (fraction from the top)
KY = EH * (0.5 - SEAL_Y)                          # the knot's y
RW = 0.0105                                       # ribbon width (a 10 mm double-face satin)
RT = 0.00028                                      # ribbon thickness
LIE = RT / 2 + 0.00006                            # centreline height of ribbon lying on paper
DS = 0.002                                        # particle spacing of the simulated centreline
ROW = 0.0005                                      # render mesh row spacing along the ribbon
COLS = 15                                         # render mesh columns across the width
FPS = 30


def norm(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def smooth(x):
    x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)


def rot(v, axis, ang):
    """Rodrigues: rotate vectors v about unit axes by angles (broadcast)."""
    ang = np.asarray(ang)[..., None]; c, s = np.cos(ang), np.sin(ang)
    return v * c + np.cross(axis, v) * s + axis * (np.sum(axis * v, -1, keepdims=True)) * (1 - c)


def catmull(P, n=10):
    """Centripetal Catmull-Rom through P (k,3): dense points and their parameter (control index + fraction)."""
    P = np.asarray(P, float); E = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    pts, par = [], []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = E[i:i + 4]
        t1 = np.linalg.norm(p1 - p0) ** .5 + 1e-9; t2 = t1 + np.linalg.norm(p2 - p1) ** .5 + 1e-9; t3 = t2 + np.linalg.norm(p3 - p2) ** .5 + 1e-9
        for k in range(n):
            t = t1 + (t2 - t1) * k / n
            a1 = (t1 - t) / t1 * p0 + t / t1 * p1; a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2; a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / t2 * a1 + t / t2 * a2; b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            pts.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2); par.append(i + k / n)
    pts.append(P[-1]); par.append(len(P) - 1)
    return np.array(pts), np.array(par)


def arclen(P):
    return np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])


def resample(P, s_src, s_new):
    return np.stack([np.interp(s_new, s_src, P[:, k]) for k in range(P.shape[1])], 1)


# ------------------------------------------------------------------------------------------------ the tied design
class CP:
    """A control point: position (knot-relative), face-normal hint, twist about the tangent, gather (fraction of the
    width the fabric is squeezed into), pleat depth scale, and a region tag."""
    def __init__(self, p, nh=(0, 0, 1), tw=0., g=1., pl=1., tag='band'):
        self.p, self.nh, self.tw, self.g, self.pl, self.tag = np.array(p, float), np.array(nh, float), tw, g, pl, tag


def loop_cps(side, L, alpha, zpk, roll, droop, back_first, n=14, lift=0.):
    """A bow loop: a flattened, puffed tube of ribbon. Out along one layer from the knot, round the outer fold, back
    along the other. side -1 left / +1 right; alpha: rise of its axis; roll: rotation of the tube about its axis
    (opens it towards the viewer); droop: its end sags under its own weight."""
    zk_f, z_ft, zb0, zb1, z0 = 0.0042, 0.0058 + lift, 0.0016, 0.0005, 0.003
    r = (z_ft - zb1) / 2; zc = (z_ft + zb1) / 2
    def place(xp, z, u, oa, oz):
        th = alpha - droop * u * u
        ax = np.array([side * np.cos(th), np.sin(th), 0.]); perp = np.array([-side * np.sin(th), np.cos(th), 0.])
        rho = roll * smooth(u / .6); cr, sr = np.cos(rho), np.sin(rho)
        p = ax * xp + perp * ((z - z0) * sr) + np.array([0, 0, z0 + (z - z0) * cr])
        nh = norm(ax * oa + perp * (oz * sr) + np.array([0, 0, oz * cr]))
        g = .40 + .60 * smooth((u - .03) / .42)
        return p, nh, g
    front, back, fold = [], [], []
    for u in np.linspace(0, 1, n):
        xp = .0026 + (L - r - .0026) * u
        zf = zk_f + (z_ft - zk_f) * u + (zpk - (zk_f + z_ft) / 2) * np.sin(np.pi * u) ** .8
        front.append((xp, zf, u, 0., 1.))
        back.append((xp, zb0 + (zb1 - zb0) * u ** .6, u, 0., -1.))
    for psi in np.linspace(0, np.pi, 9)[1:-1]:
        fold.append((L - r + r * np.sin(psi), zc + r * np.cos(psi), 1., np.sin(psi), np.cos(psi)))
    seq = (back + fold[::-1] + front[::-1]) if back_first else (front + fold + back[::-1])
    out = []
    for xp, z, u, oa, oz in seq:
        p, nh, g = place(xp, z, u, oa, oz)
        out.append(CP(p, nh, 0., g, 1., 'loop'))
    return out


def tail_cps(side, tip, twist, n=9):
    """A tail: out from under the knot, a soft S down the paper, lying flat at its cut end."""
    p0 = np.array([side * .0022, -.0050, .0031]); p1 = np.array([tip[0], tip[1], LIE])
    d = p1 - p0; perp = norm(np.array([-d[1], d[0], 0.]))
    out = []
    for i, u in enumerate(np.linspace(0, 1, n)):
        p = p0 + d * u + perp * (.0016 * np.sin(np.pi * u * 1.6) * side)
        p[2] = LIE + (.0031 - LIE) * (1 - smooth(u / .55)) + .0005 * np.sin(np.pi * u) * (1 - u)
        tw = twist * (1 - u) ** 1.4 + .35 * side * np.sin(np.pi * u * 1.3) * (1 - u * .6)
        g = .48 + .52 * smooth(u / .3)
        out.append(CP(p, (0, 0, 1), tw, g, 1., 'tail'))
    return out


def design():
    """The tied bow, as one chain of control points from the left tail's tip to the right tail's tip."""
    C = []
    tl = tail_cps(-1, (-.0190, -.0400), .9)[::-1]          # tip first
    for c in tl: c.tw = c.tw
    C += tl
    # into the knot and round into the left loop's front layer (hidden under the wrap)
    C += [CP((-.0010, -.0020, .0034), (0, 0, 1), .6, .4, 1., 'knot'), CP((.0004, .0002, .0038), (0, 0, 1), .3, .38, 1., 'knot')]
    C += loop_cps(-1, .0385, np.radians(14), .0112, np.radians(52), np.radians(10), back_first=False, lift=.0006)
    # hairpin under the knot, then the left band runs out to the edge
    C += [CP((.0006, -.0001, .0013), (0, 0, 1), 0, .45, 1., 'knot'), CP((.0012, 0, .0008), (0, 0, 1), 0, .5, 1., 'knot'),
          CP((-.0030, 0, .0007), (0, 0, 1), 0, .52, 1., 'band')]
    for x in np.linspace(-.006, -EW / 2, 14):
        u = (-x - .003) / .02
        C.append(CP((x, 0, LIE + .0005 * (1 - smooth(u))), (0, 0, 1), 0, .52 + .48 * smooth(u), 1., 'band'))
    # round the left edge, across the address side, round the right edge
    Re = ET / 2 + LIE
    for th in np.linspace(0, np.pi, 9)[1:-1]:
        C.append(CP((-EW / 2 - Re * np.sin(th), 0, -ET / 2 + Re * np.cos(th)), (-np.sin(th), 0, np.cos(th)), 0, 1, 1, 'edge'))
    for x in np.linspace(-EW / 2, EW / 2, 12):
        C.append(CP((x, 0, -ET - LIE), (0, 0, -1), 0, 1, 1, 'back'))
    for th in np.linspace(np.pi, 0, 9)[1:-1]:
        C.append(CP((EW / 2 + Re * np.sin(th), 0, -ET / 2 + Re * np.cos(th)), (np.sin(th), 0, np.cos(th)), 0, 1, 1, 'edge'))
    for x in np.linspace(EW / 2, .006, 14):
        u = (x - .003) / .02
        C.append(CP((x, 0, LIE + .0005 * (1 - smooth(u))), (0, 0, 1), 0, .52 + .48 * smooth(u), 1., 'band'))
    # the wrap: the right strand goes under and round the gathered loops; its front is the visible knot
    C.append(CP((.0032, -.0006, .0008), (0, 0, 1), 0, .5, 1., 'knot'))
    zc, ry, rz = .0037, .0060, .0037
    for ph in np.linspace(-np.pi * .82, np.pi * .80, 13):
        C.append(CP((.0006 * np.cos(ph), ry * np.sin(ph), zc + rz * np.cos(ph)), (0, np.sin(ph), np.cos(ph)), 0, .80, .4, 'wrap'))
    C += [CP((.0016, .0010, .0011), (0, 0, 1), 0, .4, 1., 'knot')]
    C += loop_cps(1, .0368, np.radians(10), .0106, np.radians(48), np.radians(12), back_first=True, lift=.0003)
    C += [CP((.0006, -.0012, .0040), (0, 0, 1), -.4, .38, 1., 'knot')]
    C += tail_cps(1, (.0200, -.0425), -1.0)
    return C


def build_chain(C, ds=DS):
    """Control points -> evenly spaced particles: positions X, directors D (width direction), normals N and
    per-particle gather / pleat / tag."""
    P = np.array([c.p for c in C]); dense, par = catmull(P, 12)
    s = arclen(dense); L = s[-1]; n = int(round(L / ds)) + 1; sn = np.linspace(0, L, n)
    X = resample(dense, s, sn); pn = np.interp(sn, s, par)
    i0 = np.clip(np.floor(pn).astype(int), 0, len(C) - 2); f = (pn - i0)[:, None]
    nh = np.array([c.nh for c in C]); NH = norm(nh[i0] * (1 - f) + nh[i0 + 1] * f)
    tw = np.array([c.tw for c in C]); TW = tw[i0] * (1 - f[:, 0]) + tw[i0 + 1] * f[:, 0]
    g = np.array([c.g for c in C]); G = g[i0] * (1 - f[:, 0]) + g[i0 + 1] * f[:, 0]
    pl = np.array([c.pl for c in C]); PL = pl[i0] * (1 - f[:, 0]) + pl[i0 + 1] * f[:, 0]
    tags = [C[i].tag if fi < .5 else C[i + 1].tag for i, fi in zip(i0, f[:, 0])]
    T = tangents(X)
    D = norm(np.cross(NH, T)); D = rot(D, T, TW); D = fix_signs(D)
    X[:, 1] += KY
    return dict(X=X, D=D, G=G, PL=PL, tags=np.array(tags), L=L)


def tangents(X):
    T = np.empty_like(X); T[1:-1] = X[2:] - X[:-2]; T[0] = X[1] - X[0]; T[-1] = X[-1] - X[-2]
    return norm(T)


def fix_signs(D):
    D = D.copy()
    for i in range(1, len(D)):
        if np.dot(D[i], D[i - 1]) < 0: D[i] = -D[i]
    return D


# ------------------------------------------------------------------------------------------------ the untie
def regions(tags):
    runs, s = [], 0
    for i in range(1, len(tags) + 1):
        if i == len(tags) or tags[i] != tags[s]: runs.append((str(tags[s]), s, i)); s = i
    names = ['tailL', 'k1', 'loopL', 'k2', 'bandL', 'edgeL', 'back', 'edgeR', 'bandR', 'k3', 'wrap', 'k4', 'loopR', 'k5', 'tailR']
    assert [r[0] for r in runs] == ['tail', 'knot', 'loop', 'knot', 'band', 'edge', 'back', 'edge', 'band', 'knot', 'wrap', 'knot', 'loop', 'knot', 'tail'], runs
    return {n: (a, b) for n, (_, a, b) in zip(names, runs)}


# timing of the untie (seconds after her touch) and the physics of the slack ribbon
TIMES = dict(grip=.10, pop=.78, letgo=.86, wrap=.80, loopL=.86, bands=.90, ringE=.90, end=2.4)
PHYS = dict(g=1.7, drag_n=14., drag_t=1.2, fric=.9, relax=.45, memory=.3, iters=26, sub=12, twist=.25, shape=.35)


def rounded_box(p):
    """Envelope as a rounded slab: signed distance and outward normal."""
    c = np.array([0, 0, -ET / 2]); h = np.array([EW / 2, EH / 2, ET / 2]); rr = ET / 2
    d = p - c; q = np.abs(d) - (h - rr); qp = np.maximum(q, 0)
    out = np.linalg.norm(qp, axis=1); inside = np.minimum(q.max(1), 0)
    sdf = out + inside - rr
    n = qp * np.sign(d); nl = np.linalg.norm(n, axis=1)
    k = np.argmax(q, 1); ni = np.zeros_like(p); ni[np.arange(len(p)), k] = np.sign(d[np.arange(len(p)), k])
    n = np.where((nl > 1e-12)[:, None], n / np.maximum(nl, 1e-12)[:, None], ni)
    return sdf, n


def simulate(ch, frames=None, fps=FPS, P=PHYS, Tm=TIMES, pull_dir=(.55, -.80, .22), log=False):
    """Pull the right tail: returns per-frame X (F,N,3), D (F,N,3), G (F,N), PL (F,N)."""
    X0 = ch['X'].copy(); D0 = ch['D'].copy(); G0 = ch['G'].copy(); PL0 = ch['PL'].copy(); N = len(X0)
    rg = regions(ch['tags']); frames = frames or int(round(Tm['end'] * fps)) + 1
    idx = np.arange(N)
    def span(*names): return np.concatenate([np.arange(*rg[n]) for n in names])
    # release time of each particle (pinned to the tied pose until then); the right tail + loop move with the grip
    rel = np.full(N, np.inf)
    rel[span('loopR', 'k5', 'tailR')] = Tm['grip']
    rel[span('k3', 'wrap', 'k4')] = Tm['wrap']
    rel[span('k1', 'loopL', 'k2', 'tailL')] = Tm['loopL']
    rel[span('bandL', 'edgeL', 'back', 'edgeR', 'bandR')] = Tm['bands']
    b4 = rg['loopR'][0]; b6 = rg['tailR'][0]
    QE = X0[b6].copy()                                   # where the right tail leaves the knot: the ring it is pulled through
    m_start = float(b6)                                  # material position held at the ring: slides back to the loop's root
    m_end = b4 + np.linalg.norm(X0[b4] - X0[b6]) * 1.15 / DS
    Kc = (X0[b4] + X0[b6]) / 2                            # the loop shrinks towards the knot, keeping its shape
    tip0 = X0[-1].copy(); pdir = norm(np.array(pull_dir, float))
    L_tail0 = (N - 1 - b6) * DS
    r1 = np.linalg.norm(X0[1:] - X0[:-1], axis=1)
    r2_0 = np.linalg.norm(X0[2:] - X0[:-2], axis=1); r2_flat = r1[:-1] + r1[1:]
    x = X0.copy(); v = np.zeros_like(x); d = D0.copy()
    out_X, out_D, out_G, out_PL = [], [], [], []
    dt = 1. / fps / P['sub']; g = np.array([0, -P['g'], 0])
    def pull(t):
        u = np.clip((t - Tm['grip']) / (Tm['pop'] - Tm['grip']), 0, 1)
        return u ** 1.55                                   # static friction first, then the loop runs through faster and faster
    def tip_target(t):
        p = pull(t); m = m_start + (m_end - m_start) * p
        Lt = (N - 1 - m) * DS * .985
        # the hand draws the tail out along its own line at first, then away (down, right, a little off the paper)
        a = norm(tip0 - QE); dirn = norm(a * (1 - smooth(p * 1.4)) + pdir * smooth(p * 1.4))
        return QE + dirn * Lt, m
    held_tip_v = np.zeros(3)
    for f in range(frames):
        for s in range(P['sub']):
            t = (f * P['sub'] + s + 1) * dt
            free = rel <= t
            w = free.astype(float)
            # gravity + drag that depends on the ribbon's facing (flat to the air: slow; edge-on: glides)
            T = tangents(x); n = np.cross(T, d)
            vn = np.sum(v * n, 1, keepdims=True) * n
            acc = g - P['drag_n'] * vn - P['drag_t'] * (v - vn)
            v = v + acc * dt * w[:, None]
            p = x + v * dt * w[:, None]
            p[~free] = X0[~free]
            # the hand: holds the tail tip until the loop has popped through, then lets go (it keeps its momentum)
            if Tm['grip'] <= t < Tm['letgo']:
                tt, m = tip_target(t); p[-1] = tt; w[-1] = 0
                held_tip_v = (tt - x[-1]) / dt
            else:
                m = m_start + (m_end - m_start) * pull(t)
            ring_on = Tm['grip'] <= t < Tm['ringE']
            for it in range(P['iters']):
                # inextensible links (two colours, Gauss-Seidel)
                for par in (0, 1):
                    i = idx[par:N - 1:2]; j = i + 1
                    dv = p[j] - p[i]; L = np.linalg.norm(dv, axis=1); ws = w[i] + w[j]
                    ok = ws > 0; c = np.where(ok, (L - r1[i]) / np.maximum(ws, 1e-9), 0)[:, None] * dv / np.maximum(L, 1e-12)[:, None]
                    p[i] += w[i, None] * c; p[j] -= w[j, None] * c
                # bending memory: the tied creases relax after release, never quite all the way
                if it % 2 == 0:
                    age = np.clip((t - rel) / P['relax'], 0, 1)
                    mem = ((1 - smooth(age)) + P['memory'] * smooth(age)) * P.get('bend', 1)
                    r2 = r2_flat * (1 - mem[1:-1]) + r2_0 * mem[1:-1]
                    for par in (0, 1, 2, 3):
                        i = idx[par:N - 2:4]; j = i + 2
                        dv = p[j] - p[i]; L = np.linalg.norm(dv, axis=1); ws = w[i] + w[j]
                        c = np.where(ws > 0, .25 * (L - r2[i]) / np.maximum(ws, 1e-9), 0)[:, None] * dv / np.maximum(L, 1e-12)[:, None]
                        p[i] += w[i, None] * c; p[j] -= w[j, None] * c
                # no edge-wise bending: a ribbon folds and twists, it does not bend in its own plane
                for par in (1, 2, 3):                      # three colours: the triples never overlap within a pass
                    i = idx[par:N - 1:3]
                    k2 = p[i - 1] + p[i + 1] - 2 * p[i]; c = np.sum(k2 * d[i], 1, keepdims=True) * d[i] * P.get('edgewise', .3)
                    wm = (w[i] * w[i - 1] * w[i + 1])[:, None]
                    p[i] += c * wm * .6666; p[i - 1] -= c * wm * .3333; p[i + 1] -= c * wm * .3333
                # the right loop keeps its shape while it is drawn into the knot (satin stiffness + the knot's grip)
                if ring_on and m > b4 + 1:
                    kl = (m - b4) / (b6 - b4); ii = np.arange(b4, int(np.floor(m)) + 1)
                    jj = np.clip(b4 + (ii - b4) / max(kl, 1e-3), 0, N - 1)
                    tgt = Kc + (np.stack([np.interp(jj, idx, X0[:, k]) for k in range(3)], 1) - Kc) * kl
                    ks = P['shape'] * (1 - smooth((pull(t) - .8) / .2))
                    p[ii] += (tgt - p[ii]) * ks * w[ii, None]
                # the knot's ring: the material at m is held where the tail leaves the knot
                if ring_on:
                    i = int(np.clip(np.floor(m), 0, N - 2)); fr = m - i
                    q = (1 - fr) * p[i] + fr * p[i + 1]; den = (1 - fr) ** 2 * w[i] + fr ** 2 * w[i + 1]
                    if den > 0:
                        dq = (QE - q) / den; p[i] += (1 - fr) * w[i] * dq; p[i + 1] += fr * w[i + 1] * dq
                # the envelope
                sdf, nb = rounded_box(p); pen = (LIE - sdf) * w
                hit = pen > 0; p[hit] += nb[hit] * pen[hit, None]
            v_new = (p - x) / dt
            sdf, nb = rounded_box(p); contact = (sdf < LIE * 1.3) & free
            vn_b = np.sum(v_new * nb, 1, keepdims=True)
            v_new[contact] = (v_new[contact] - vn_b[contact] * nb[contact]) * P['fric'] + np.maximum(vn_b[contact], 0) * nb[contact]
            if t >= Tm['letgo'] and t - dt < Tm['letgo']: v_new[-1] = held_tip_v * .8
            # directors: carried along with each segment's turn, twist diffuses, flat against the paper where touching
            Tn = tangents(p); To = tangents(x)
            ax = np.cross(To, Tn); sn = np.linalg.norm(ax, axis=1); cs = np.sum(To * Tn, 1)
            ang = np.arctan2(sn, cs); ax = ax / np.maximum(sn, 1e-12)[:, None]
            dn = np.where((sn > 1e-9)[:, None], rot(d, ax, ang), d)
            for _ in range(3): dn[1:-1] += P['twist'] * (dn[:-2] + dn[2:] - 2 * dn[1:-1])
            dn[contact] -= np.sum(dn[contact] * nb[contact], 1, keepdims=True) * nb[contact] * .5
            dn = norm(dn - Tn * np.sum(dn * Tn, 1, keepdims=True))
            d = np.where(free[:, None], dn, D0)
            x = p; v = np.where(free[:, None], v_new, 0)
        # gathers: released fabric spreads back to its full width; fabric squeezing through the ring gathers there
        age = np.clip((f / fps - rel) / .35, 0, 1)
        Gf = G0 + (1 - G0) * smooth(age) * .85
        if Tm['grip'] <= f / fps < Tm['ringE']:
            mm = m_start + (m_end - m_start) * pull(f / fps)
            Gf = np.minimum(Gf, .42 + .58 * smooth(np.abs(idx - mm) * DS / .009))
        PLf = PL0 * (1 - .5 * smooth(age))
        out_X.append(x.copy()); out_D.append(d.copy()); out_G.append(Gf); out_PL.append(PLf)
        if log and f % 6 == 0: print('frame', f, 'y range %.3f %.3f' % (x[:, 1].min(), x[:, 1].max()), 'stretch %.3f' % (np.linalg.norm(np.diff(x, axis=0), axis=1) / r1).max(), flush=True)
    return dict(X=np.array(out_X), D=np.array(out_D), G=np.array(out_G), PL=np.array(out_PL))


# ------------------------------------------------------------------------------------------------ render mesh
NOTCH = .0058          # depth of the dovetail cut at each tail's end


def strip(X, D, G, PL, rings=(), seed=3):
    """Centreline particles -> a dense ribbon surface (rows x COLS vertices) with gathered pleats near the knot, a
    gentle cup across the width, and dovetail-cut ends. Returns verts (R*COLS,3), faces (quads), uv (R*COLS,2)."""
    s = np.arange(len(X)) * DS; L = s[-1]          # material coordinates: the same rows every frame
    dense, par = catmull(X, 4)
    nr = int(round(L / ROW)) + 1; sr = np.linspace(0, L, nr)
    # rows: material arc-length positions (use the particle parameter so the material maps 1:1)
    pr = np.interp(sr, s, np.arange(len(X)))
    C = resample(dense, par, pr)
    i0 = np.clip(np.floor(pr).astype(int), 0, len(X) - 2); f = (pr - i0)[:, None]
    Dr = norm(D[i0] * (1 - f) + D[i0 + 1] * f); Gr = G[i0] * (1 - f[:, 0]) + G[i0 + 1] * f[:, 0]; PLr = PL[i0] * (1 - f[:, 0]) + PL[i0 + 1] * f[:, 0]
    T = tangents(C); Dr = norm(Dr - T * np.sum(Dr * T, 1, keepdims=True)); Nr = np.cross(T, Dr)
    t = np.linspace(-1, 1, COLS)
    # dovetail: each column of the end rows stops at its own length (the centre is cut deepest)
    se = np.empty((nr, COLS))
    E = NOTCH * 2.5                                 # the end rows are squeezed (not clamped: no degenerate faces)
    for j, tj in enumerate(t):
        a = NOTCH * (1 - abs(tj)); k = (E - a) / E
        se[:, j] = np.where(sr > L - E, L - E + (sr - (L - E)) * k, np.where(sr < E, E - (E - sr) * k, sr))
    # where the cut moved a vertex, re-evaluate the centre/frames there
    ii = np.interp(se, s, np.arange(len(X)))
    Cx = np.stack([np.interp(ii, pr, C[:, k]) for k in range(3)], -1)
    Dx = np.stack([np.interp(ii, pr, Dr[:, k]) for k in range(3)], -1)
    Nx = np.stack([np.interp(ii, pr, Nr[:, k]) for k in range(3)], -1)
    Gx = np.interp(ii, pr, Gr); Px = np.interp(ii, pr, PLr)
    # pleats where the width is gathered: depth from the excess fabric; phase drifts so they fan, not stripe
    rr = np.random.RandomState(seed); ph = np.interp(se, sr, np.cumsum(rr.randn(nr)) * .01)
    excess = np.sqrt(np.clip(1 - Gx ** 2, 0, 1))
    amp = RW * .085 * excess * Px
    pleat = amp * np.sin(np.pi * (2.5 * (t[None, :] + 1) / 2) * 2 + ph * 6 + 1.3)
    cup = RW * .045 * (1 - t[None, :] ** 2) * (.4 + .6 * excess)
    off = Dx * (RW / 2 * t[None, :] * Gx)[..., None] + Nx * (pleat + cup - RW * .02)[..., None]
    V = (Cx + off).reshape(-1, 3)
    uv = np.stack([se / RW, np.broadcast_to((t + 1) / 2, se.shape)], -1).reshape(-1, 2)
    r, j = np.meshgrid(np.arange(nr - 1), np.arange(COLS - 1), indexing='ij')
    a = r * COLS + j
    F = np.stack([a, a + COLS, a + COLS + 1, a + 1], -1).reshape(-1, 4)
    return V, F, uv


if __name__ == '__main__':
    import sys, time
    ch = build_chain(design())
    if len(sys.argv) > 2 and sys.argv[1] == 'sim':
        t0 = time.time(); S = simulate(ch, log=True); print('sim %.1fs' % (time.time() - t0))
        np.savez_compressed(sys.argv[2], **S); sys.exit()
    print('particles', len(ch['X']), 'length %.3f m' % ch['L'])
    V, F, uv = strip(ch['X'], ch['D'], ch['G'], ch['PL'])
    print('mesh', V.shape, F.shape)
    if len(sys.argv) > 2 and sys.argv[1] == 'plot':
        from PIL import Image, ImageDraw
        S = 4000; im = Image.new('RGB', (900, 700), (30, 30, 40)); d = ImageDraw.Draw(im)
        cx, cy = 450, 350
        P = lambda p: (cx + p[0] * S, cy - (p[1] - KY) * S)
        for f in F[::1]:
            q = [P(V[k]) for k in f]; z = V[f, 2].mean()
            c = int(np.clip(120 + z * 15000, 0, 255)); d.polygon(q, fill=(c, int(c * .7), int(c * .7)))
        im.save(sys.argv[2])
