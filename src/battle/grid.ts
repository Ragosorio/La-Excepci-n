/**
 * Dense uniform grid rebuilt every tick with a counting sort (allocation-free, O(n)).
 * Query with forEachNear(x, z, r, cb) or the manual cell API in hot loops.
 */
import type { Units } from './units';
import { S_DEAD } from './const';

export class Grid {
  readonly cols: number;
  readonly rows: number;
  readonly start: Int32Array;
  readonly items: Int32Array;
  count = 0;
  constructor(readonly x0: number, readonly z0: number, readonly cell: number, readonly size: number, max: number) {
    this.cols = Math.ceil(size / cell);
    this.rows = this.cols;
    this.start = new Int32Array(this.cols * this.rows + 1);
    this.items = new Int32Array(max);
  }
  cx(x: number): number { const c = ((x - this.x0) / this.cell) | 0; return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c; }
  cz(z: number): number { const c = ((z - this.z0) / this.cell) | 0; return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c; }

  /** Rebuild from all living, active units. */
  build(u: Units): void {
    const s = this.start;
    s.fill(0);
    const n = u.n;
    for (let i = 0; i < n; i++) {
      if (!u.active[i] || u.state[i] === S_DEAD) continue;
      s[this.cz(u.z[i]) * this.cols + this.cx(u.x[i])]++;
    }
    for (let c = 1; c < s.length; c++) s[c] += s[c - 1];
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      if (!u.active[i] || u.state[i] === S_DEAD) continue;
      this.items[--s[this.cz(u.z[i]) * this.cols + this.cx(u.x[i])]] = i;
      cnt++;
    }
    this.count = cnt;
  }

  /** Calls fn(j) for every unit in cells overlapping the square of radius r around (x, z). */
  forEachNear(x: number, z: number, r: number, fn: (j: number) => void): void {
    const c0 = this.cx(x - r), c1 = this.cx(x + r), r0 = this.cz(z - r), r1 = this.cz(z + r);
    for (let rz = r0; rz <= r1; rz++) {
      for (let cx = c0; cx <= c1; cx++) {
        const c = rz * this.cols + cx;
        for (let k = this.start[c], e = this.start[c + 1]; k < e; k++) fn(this.items[k]);
      }
    }
  }

  /** Fills out[] with unit indices within r (exact circle test). Returns count. */
  query(u: Units, x: number, z: number, r: number, out: Int32Array | number[], max = 64): number {
    const c0 = this.cx(x - r), c1 = this.cx(x + r), r0 = this.cz(z - r), r1 = this.cz(z + r);
    const r2 = r * r;
    let n = 0;
    for (let rz = r0; rz <= r1; rz++) {
      for (let cx = c0; cx <= c1; cx++) {
        const c = rz * this.cols + cx;
        for (let k = this.start[c], e = this.start[c + 1]; k < e; k++) {
          const j = this.items[k];
          const dx = u.x[j] - x, dz = u.z[j] - z;
          if (dx * dx + dz * dz <= r2) { out[n++] = j; if (n >= max) return n; }
        }
      }
    }
    return n;
  }
}
