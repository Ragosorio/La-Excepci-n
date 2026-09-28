/**
 * Deployment zones and automatic formations (melee front, ranged/casters back, monsters on the flanks).
 */
import type { UnitRole } from '../data/types';
import { specFor } from './defs';

export interface Zone { x0: number; x1: number; z0: number; z1: number; /** +1: faces +z (player), -1: faces -z */ dir: number }

export function zonesFor(round: boolean, kind: string): { player: Zone; enemy: Zone } {
  if (round) return { player: { x0: -22, x1: 22, z0: -34, z1: -12, dir: 1 }, enemy: { x0: -22, x1: 22, z0: 12, z1: 34, dir: -1 } };
  if (kind === 'asedio') return { player: { x0: -34, x1: 34, z0: -46, z1: -18, dir: 1 }, enemy: { x0: -30, x1: 30, z0: 20, z1: 44, dir: -1 } };
  return { player: { x0: -32, x1: 32, z0: -44, z1: -16, dir: 1 }, enemy: { x0: -32, x1: 32, z0: 16, z1: 44, dir: -1 } };
}

const ROLE_ROW: Record<UnitRole, number> = { tanque: 0, melee: 1, monstruo: 1, asesino: 2, apoyo: 3, asedio: 3, rango: 4, mago: 4, sanador: 5 };

/** Returns positions for the given unit ids (same order), laid out in rows inside the zone. */
export function formation(ids: string[], zone: Zone): Array<{ x: number; z: number }> {
  const idx = ids.map((id, k) => ({ id, k, row: ROLE_ROW[specFor(id).role] ?? 1, r: specFor(id).radius }));
  idx.sort((a, b) => a.row - b.row || a.r - b.r);
  const out: Array<{ x: number; z: number }> = new Array(ids.length);
  const width = zone.x1 - zone.x0;
  const front = zone.dir > 0 ? zone.z1 - 1.5 : zone.z0 + 1.5;
  let depth = 0;
  let i = 0;
  while (i < idx.length) {
    const row = idx[i].row;
    let j = i;
    while (j < idx.length && idx[j].row === row) j++;
    const group = idx.slice(i, j);
    // monsters go to the flanks of their row
    let k = 0;
    while (k < group.length) {
      const maxR = Math.max(...group.slice(k, k + 40).map((g) => g.r));
      const sp = Math.max(1.35, maxR * 2.3);
      const cols = Math.max(1, Math.min(group.length - k, Math.floor(width / sp)));
      const rowW = (cols - 1) * sp;
      for (let c = 0; c < cols && k < group.length; c++, k++) {
        const g = group[k];
        const x = -rowW / 2 + c * sp + (zone.x0 + zone.x1) / 2 + ((depth * 0.37) % 1 - 0.5) * 0.6;
        out[g.k] = { x, z: front - zone.dir * (depth + maxR) };
      }
      depth += sp * 0.95 + (maxR > 0.8 ? maxR : 0);
      if (depth > zone.z1 - zone.z0 - 2) depth = (depth % 3) + 0.7;
    }
    depth += 0.6;
    i = j;
  }
  return out;
}
