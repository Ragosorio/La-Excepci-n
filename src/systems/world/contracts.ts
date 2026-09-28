/**
 * Taverns: contracts (Designios of kind 'contract') and named mercenaries, refreshed once per luna per tavern.
 * Contract kinds: rob a caravan, bet at the Arena, deliver a sealed package, eliminate a bandit captain.
 */
import type { RaceId } from '../../data/types';
import { LOCATION_LIST, LOCATIONS } from '../../data/world';
import { randomName, captainTitle } from '../../data/names';
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { Rng, uid } from '../../core/rng';
import { addQuest, completeQuest, failQuest, getQuest } from '../../core/quests';
import { applyDeed, generateContract } from '../society/api';
import { track } from '../../core/tracker';
import { W, factionName, type ContractOffer, type MercOffer, type TavernState } from './state';
import { spawnBandits, spawnCaravan } from './parties';
import { locationRaces, unitPool, unitPower } from './forces';

export function tavernState(locId: string): TavernState {
  const w = W();
  const luna = G.run.luna;
  let t = w.taverns[locId];
  if (!t || t.luna !== luna) {
    const r = new Rng(`${G.run.seed}:tavern:${locId}:${luna}`);
    t = { luna, contracts: genContracts(locId, r), mercs: genMercs(locId, r) };
    w.taverns[locId] = t;
  }
  return t;
}

function genContracts(locId: string, r: Rng): ContractOffer[] {
  const def = LOCATIONS[locId];
  const out: ContractOffer[] = [];
  // one errand from the society layer (deliveries, messages, bribes, heists — tracked by deeds)
  try {
    const d = generateContract(locId);
    if (d && !getQuest(d.id)) {
      const reward = d.reward ?? {};
      out.push({ id: d.id, kind: 'encargo', title: d.title, desc: d.desc, target: d.target, reward: { gold: reward.gold, essence: reward.essence, influence: reward.influence, secrets: reward.secrets }, taken: false, lunas: Math.max(1, (d.expiresLuna ?? G.run.luna + 6) - G.run.luna), draft: { ...d, reward } as ContractOffer['draft'] });
    }
  } catch { /* society not ready */ }
  const kinds = r.shuffle(['caravana', 'entrega', 'capitan'] as ContractOffer['kind'][]);
  const n = out.length + r.int(2, 3) - 1;
  for (const k of kinds) {
    if (out.length >= n) break;
    const id = `contrato_${locId}_${G.run.luna}_${k}`;
    if (getQuest(id)) continue;
    if (k === 'caravana') {
      const rich = r.int(160, 320);
      out.push({
        id, kind: k, taken: false, lunas: 3,
        title: 'Carga ajena',
        desc: `Un cliente discreto quiere que una caravana no llegue a su destino. Asáltala antes de que entregue.`,
        reward: { gold: rich, influence: r.chance(0.5) ? 1 : 0 },
      });
    } else if (k === 'entrega') {
      const far = LOCATION_LIST.filter((l) => l.id !== locId && l.kind !== 'ruina' && l.id !== 'crater');
      const to = r.pick(far);
      out.push({
        id, kind: k, taken: false, lunas: 4, target: to.id,
        title: `Paquete sellado para ${to.name}`,
        desc: `Nadie debe abrirlo. Nadie debe preguntar. Entrégalo en ${to.name}.`,
        reward: { gold: r.int(90, 220), secrets: 1 },
      });
    } else if (k === 'capitan') {
      const race = r.pick<RaceId>(['humano', 'picaro', 'ogro', 'trol', 'enano', 'duende']);
      const cap = `${randomName(race, r.chance(0.3) ? 'f' : 'm', r)} ${captainTitle(r)}`;
      const near = r.pick(LOCATION_LIST.filter((l) => l.continent === def.continent && l.id !== 'crater')) ?? def;
      out.push({
        id, kind: k, taken: false, lunas: 5, target: near.id,
        title: `La cabeza de ${cap}`,
        desc: `${cap} y su banda acampan cerca de ${near.name}. Aquí pagan por verlos desaparecer.`,
        reward: { gold: r.int(220, 380), essence: r.int(10, 20), influence: 1 },
      });
    } else if (k === 'arena') {
      out.push({
        id, kind: k, taken: false, lunas: 5, target: 'arena_remolino',
        title: 'Mover las apuestas',
        desc: 'Alguien quiere que "ayudes" a la suerte en la Arena del Remolino. Participa en un combate de la Arena.',
        reward: { gold: r.int(180, 260), essence: 10 },
      });
    }
  }
  return out;
}

function genMercs(locId: string, r: Rng): MercOffer[] {
  const def = LOCATIONS[locId];
  const races = locationRaces(locId);
  const pool = unitPool(def.continent, races).filter((u) => u.tier >= 2);
  if (!pool.length) return [];
  const out: MercOffer[] = [];
  const n = r.chance(0.6) ? 2 : 1;
  const bios = [
    'Dice que perdió una apuesta con un dios. No dice cuál.', 'Nunca ha perdido un duelo. Dice él.', 'Cobra caro. Pelea más caro.',
    'Le falta un ojo y le sobra orgullo.', 'Busca a alguien. No dice a quién.', 'Sirvió al Concilio. Ya no.',
  ];
  for (let i = 0; i < n; i++) {
    const u = r.pick(pool);
    const gender: 'f' | 'm' = r.chance(0.45) ? 'f' : 'm';
    const stars = r.chance(0.3) ? 2 : 1;
    out.push({
      id: `merc_${locId}_${G.run.luna}_${i}`, unitId: u.id, name: `${randomName(u.race, gender, r)} ${captainTitle(r)}`,
      race: u.race, gender, stars, hired: false,
      cost: Math.round((u.cost || 60) * 2.4 * (1 + stars * 0.35)),
      upkeep: Math.round((u.upkeep || 4) * 1.6),
      bio: r.pick(bios),
    });
  }
  return out;
}

/** Accept a tavern contract → becomes a Designio (quest kind 'contract'). */
export function takeContract(locId: string, offerId: string): boolean {
  const t = tavernState(locId);
  const c = t.contracts.find((x) => x.id === offerId);
  if (!c || c.taken) return false;
  const luna = G.run.luna;
  const def = LOCATIONS[locId];
  if (c.draft) {
    c.taken = true;
    addQuest(c.draft);
    track('contracts_taken');
    return true;
  }
  if (c.kind === 'caravana') {
    const cands = W().parties.filter((p) => p.kind === 'caravana' && !p.contract && p.from !== locId);
    const party = cands.sort((a, b) => Math.hypot(b.tx - b.x, b.tz - b.z) - Math.hypot(a.tx - a.x, a.tz - a.z))[0] ?? spawnCaravan();
    if (!party) return false;
    party.contract = c.id;
    party.strength = Math.round(party.strength * 1.3);
    c.desc = `Asalta ${party.name.toLowerCase()} (${factionName(party.faction)}) antes de que llegue a ${party.to ? LOCATIONS[party.to]?.name : 'su destino'}.`;
    c.target = party.to;
    c.partyId = party.id;
  } else if (c.kind === 'capitan') {
    const cap = c.title.replace('La cabeza de ', '');
    const race = (locationRaces(c.target ?? locId)[0] ?? 'humano') as RaceId;
    const p = spawnBandits(c.target ?? locId, cap, race, 16 + luna * 1.5 + (def.garrison > 60 ? 10 : 0));
    if (!p) return false;
    p.contract = c.id;
    p.name = `Banda de ${cap}`;
  } else if (c.kind === 'entrega' && c.target) {
    W().deliveries[c.id] = c.target;
  } else if (c.kind === 'arena') {
    W().deliveries[c.id] = 'arena';
  }
  c.taken = true;
  addQuest({ id: c.id, kind: 'contract', title: c.title, desc: c.desc, goal: 1, target: c.target, reward: c.reward, expiresLuna: luna + c.lunas });
  track('contracts_taken');
  return true;
}

export function hireMerc(locId: string, mercId: string): boolean {
  const t = tavernState(locId);
  const m = t.mercs.find((x) => x.id === mercId);
  if (!m || m.hired) return false;
  const p = G.run.player;
  if (p.army.length >= p.armyCap) return false;
  if (!res.spend('gold', m.cost)) return false;
  m.hired = true;
  p.army.push({ uid: uid('u'), unitId: m.unitId, stars: m.stars, xp: 0, name: m.name });
  try { applyDeed({ kind: 'recruit', location: locId, magnitude: 0.6 }); } catch { /* ignore */ }
  track('units_recruited');
  track('mercenaries_hired');
  return true;
}

export function mercPower(m: MercOffer): number {
  return Math.round(unitPower(undefined, m.stars) * 2);
}

/** Contract bookkeeping: expiry, deliveries, arena. */
export function initContractEvents(): void {
  bus.on('luna:tick', ({ luna }) => {
    if (!G.hasRun) return;
    for (const q of G.run.quests) {
      if (q.kind === 'contract' && !q.done && !q.failed && q.expiresLuna !== undefined && q.expiresLuna <= luna) {
        failQuest(q.id);
        delete W().deliveries[q.id];
      }
    }
  });
  bus.on('location:enter', ({ id }) => {
    if (!G.hasRun) return;
    const d = W().deliveries;
    for (const [qid, target] of Object.entries(d)) {
      if (target === id) { completeQuest(qid); delete d[qid]; }
    }
  });
  const arenaDone = () => {
    if (!G.hasRun) return;
    const d = W().deliveries;
    for (const [qid, target] of Object.entries(d)) if (target === 'arena') { completeQuest(qid); delete d[qid]; }
  };
  bus.on('battle:end', ({ setup }) => { if (setup.kind === 'arena') arenaDone(); });
  // casino module may emit its own win events; listen loosely without declaring their types
  const loose = bus as unknown as { on: (t: string, f: (p: unknown) => void) => void };
  loose.on('casino:win', (p) => { const g = (p as { game?: string } | null)?.game ?? ''; if (g.includes('arena')) arenaDone(); });
}
