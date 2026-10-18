// Springy strands for the painted horses' manes and tails.

/** A chain of points that trails behind an anchor with springy lag (mane locks, tails). */
export class Strand {
  constructor(n, len) { this.n = n; this.len = len; this.p = Array.from({ length: n }, () => ({ x: 0, y: 0, vx: 0, vy: 0 })); this.init = false; }
  update(ax, ay, dirx, diry, dt, wind = 0, gravity = 0, stiff = 14) {
    const P = this.p;
    if (!this.init) { P.forEach((q, i) => { q.x = ax + dirx * this.len * i; q.y = ay + diry * this.len * i; }); this.init = true; }
    P[0].x = ax; P[0].y = ay;
    for (let i = 1; i < this.n; i++) {
      const q = P[i], prev = P[i - 1];
      const tx = prev.x + dirx * this.len, ty = prev.y + diry * this.len;
      q.vx += ((tx - q.x) * stiff + wind) * dt; q.vy += ((ty - q.y) * stiff + gravity) * dt;
      q.vx *= Math.exp(-dt * 5); q.vy *= Math.exp(-dt * 5);
      q.x += q.vx * dt; q.y += q.vy * dt;
      const dx = q.x - prev.x, dy = q.y - prev.y, d = Math.hypot(dx, dy) || 1;
      q.x = prev.x + dx / d * this.len; q.y = prev.y + dy / d * this.len;
    }
  }
}
