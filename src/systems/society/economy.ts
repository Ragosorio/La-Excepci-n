/**
 * Economy (GDD §4.8, research §7.1): per-location stock & price for 8 goods. price → base × f(stock/target)
 * with mean reversion + market events; the player's trades walk the curve (slippage). Caravans (world module)
 * move stock between markets with shipGoods(). Taverns get generated contracts.
 */
import { G, res, type LocationState, type QuestState } from '../../core/state';
import { addNews } from '../../core/news';
import { track } from '../../core/tracker';
import { makeRng, rng, uid } from '../../core/rng';
import { getQuest, progressQuest, failQuest } from '../../core/quests';
import { CONTINENTS, LOCATIONS, LOCATION_LIST } from '../../data/world';
import { GOODS } from '../../data/goods';
import type { ContinentId, GoodId } from '../../data/types';
import { applyDeed } from './deeds';
import { repPriceMult, repTier } from './factions';
import { GOOD_IDS, continentOf, contName, ensureLocation, locName, luna, soc } from './state';
import type { ContractMeta, Deed } from './types';

export const TARGET = 100;

export const GOOD_FALLBACK: Record<GoodId, { name: string; base: number; desc: string }> = {
  grano: { name: 'Grano', base: 8, desc: 'Trigo, cebada y centeno. Lo que come el mundo.' },
  madera: { name: 'Madera', base: 12, desc: 'Troncos de Sylvaria que todavía recuerdan el bosque.' },
  hierro: { name: 'Hierro', base: 20, desc: 'Lingotes de Kharaz. Pesados y honestos.' },
  especias: { name: 'Especias', base: 30, desc: 'Pimienta, azafrán y canela de las Islas. Huele a dinero.' },
  seda: { name: 'Seda', base: 38, desc: 'Tela que susurra. Las cortesanas pagan bien.' },
  pociones: { name: 'Pociones', base: 26, desc: 'Frascos burbujeantes de Morvenna. No leas la etiqueta.' },
  gemas: { name: 'Gemas', base: 60, desc: 'Piedras que guardan la luz de la montaña.' },
  cristal: { name: 'Maná cristalizado', base: 48, desc: 'Magia en estado sólido. Frío al tacto.' },
};

export function goodInfo(g: GoodId): { id: GoodId; name: string; base: number; desc: string } {
  const d = GOODS[g] as { name?: string; base?: number; desc?: string } | undefined;
  const f = GOOD_FALLBACK[g];
  return { id: g, name: d?.name ?? f.name, base: d?.base ?? f.base, desc: d?.desc ?? f.desc };
}

/** Softer Vic3-style curve: scarce → up to ×3, glut → down to ×0.35. */
export function priceFactor(stock: number, target = TARGET): number {
  const r = Math.max(0.02, stock / target);
  return Math.max(0.35, Math.min(3, Math.pow(r, -0.6)));
}

export function isMarket(locationId: string): boolean {
  return !!LOCATIONS[locationId]?.services.includes('mercado');
}
export function marketIds(): string[] { return LOCATION_LIST.filter((l) => l.services.includes('mercado')).map((l) => l.id); }

type Profile = 'prod' | 'prodLite' | 'neutral' | 'consLite' | 'cons';
const NATURAL: Record<Profile, number> = { prod: 170, prodLite: 125, neutral: 95, consLite: 70, cons: 45 };

export function profile(locationId: string, g: GoodId): Profile {
  const d = LOCATIONS[locationId];
  if (!d) return 'neutral';
  if (d.produces?.includes(g)) return 'prod';
  if (d.consumes?.includes(g)) return 'cons';
  const c = CONTINENTS[d.continent];
  if (c?.goods.produces.includes(g)) return 'prodLite';
  if (c?.goods.consumes.includes(g)) return 'consLite';
  return 'neutral';
}

function eventMult(locationId: string, g: GoodId): number {
  let m = 1;
  for (const e of soc().events) if (e.location === locationId && e.good === g && e.until > luna()) m *= e.mult;
  return m;
}

/** Equilibrium price right now (before player modifiers). */
export function targetPrice(locationId: string, g: GoodId, stockOverride?: number): number {
  const loc = G.run.locations[locationId];
  const stock = stockOverride ?? loc?.stock[g] ?? TARGET;
  const region = LOCATIONS[locationId]?.continent === 'concordia' ? 1.1 : 1;
  return goodInfo(g).base * priceFactor(stock) * eventMult(locationId, g) * region;
}

// ───────────────────────────── init & luna ─────────────────────────────

/** Fresh run (priority 20): replaces the world's placeholder market with society's supply/demand model. */
export function initPrices(): void {
  const rs = makeRng(`${G.run.seed}:prices`);
  for (const id of marketIds()) {
    const loc = ensureLocation(id);
    if (!loc) continue;
    for (const g of GOOD_IDS) {
      loc.stock[g] = Math.round(NATURAL[profile(id, g)] * (0.6 + loc.prosperity / 250) * rs.range(0.85, 1.15));
      loc.price[g] = Math.round(targetPrice(id, g) * 10) / 10;
    }
  }
}

const EVENTS: Array<{ good: GoodId; mult: number; text: string }> = [
  { good: 'grano', mult: 1.6, text: 'Plaga en los graneros de {loc}. El pan sube.' },
  { good: 'grano', mult: 0.6, text: 'Cosecha histórica en {loc}. Regalan trigo en la plaza.' },
  { good: 'seda', mult: 1.5, text: 'Un barco de seda naufragó rumbo a {loc}.' },
  { good: 'cristal', mult: 1.7, text: 'Fiebre del cristal en {loc}: los magos compran todo lo que brilla.' },
  { good: 'hierro', mult: 0.65, text: 'Abrieron una veta nueva cerca de {loc}. El hierro sobra.' },
  { good: 'hierro', mult: 1.5, text: 'Rumores de guerra en {loc}: todos quieren acero.' },
  { good: 'pociones', mult: 1.6, text: 'Una fiebre extraña en {loc}. Las pociones escasean.' },
  { good: 'especias', mult: 1.45, text: 'Piratas cerraron la ruta de especias hacia {loc}.' },
  { good: 'gemas', mult: 1.5, text: 'Una boda noble en {loc}. Las gemas vuelan.' },
  { good: 'madera', mult: 1.4, text: 'Incendio en los muelles de {loc}. Hace falta madera.' },
  { good: 'especias', mult: 0.7, text: 'Llegó una flota cargada de especias a {loc}. Huele a canela hasta en los templos.' },
  { good: 'pociones', mult: 0.7, text: 'Las brujas vaciaron sus calderos en {loc}. Pociones a precio de sopa.' },
];

export function marketShock(locationId: string, g: GoodId | null, mult: number, lunas = 3, text?: string): void {
  const loc = ensureLocation(locationId);
  if (!loc) return;
  if (!g) {
    for (const k of GOOD_IDS) loc.stock[k] = Math.round(loc.stock[k] * mult);
    return;
  }
  soc().events.push({ id: uid('ev'), text: text ?? '', location: locationId, good: g, mult, until: luna() + lunas });
}

export function economyLunaTick(): void {
  const s = soc();
  const l = luna();
  s.events = s.events.filter((e) => e.until > l);
  const markets = marketIds();
  // occasional market events
  for (const id of markets) {
    if (!rng.chance(0.03)) continue;
    const ev = rng.pick(EVENTS);
    if (profile(id, ev.good) === 'prod' && ev.mult > 1.3 && rng.chance(0.5)) continue;
    const text = ev.text.replace('{loc}', locName(id));
    marketShock(id, ev.good, ev.mult, rng.int(3, 5), text);
    addNews(text, 'economia');
  }
  for (const id of markets) {
    const loc = ensureLocation(id);
    if (!loc) continue;
    const hist = (s.hist[id] ??= {});
    for (const g of GOOD_IDS) {
      const nat = NATURAL[profile(id, g)] * (0.6 + loc.prosperity / 250);
      loc.stock[g] = Math.max(0, Math.round(loc.stock[g] + (nat - loc.stock[g]) * 0.18 + rng.range(-4, 4)));
      const target = targetPrice(id, g);
      const cur = loc.price[g] || target;
      loc.price[g] = Math.max(0.5, Math.round((cur + (target - cur) * 0.25 + goodInfo(g).base * 0.02 * rng.range(-1, 1)) * 10) / 10);
      const h = (hist[g] ??= []);
      h.push(loc.price[g]);
      if (h.length > 6) h.shift();
    }
  }
}

// ───────────────────────────── player-facing prices ─────────────────────────────

export function priceOf(locationId: string, good: string): number {
  const loc = G.run?.locations[locationId];
  const g = good as GoodId;
  if (!loc || !GOOD_IDS.includes(g)) return 0;
  return Math.round(loc.price[g] || targetPrice(locationId, g));
}

/** Multiplier on what Elias pays (buy) or receives (sell) here. */
export function playerPriceMult(locationId: string, side: 'buy' | 'sell'): { mult: number; notes: string[] } {
  const loc = G.run.locations[locationId];
  const cont = continentOf(locationId);
  const l = luna();
  const f = G.run.flags;
  const notes: string[] = [];
  let buy = 1, sell = 1;
  if (cont) {
    const rm = repPriceMult(cont);
    buy *= rm; sell *= 2 - rm;
    if (rm !== 1) notes.push(`Reputación (${repTier(cont).name})`);
  }
  if (loc && loc.fear >= 60) { buy *= 0.9; sell *= 1.05; notes.push('Te temen'); }
  if (loc?.control === 'excepcion') { buy *= 0.92; sell *= 1.05; notes.push('Territorio tuyo'); }
  if (Number(f.sanctions_until ?? -1) > l) { buy *= 1.2; sell *= 0.85; notes.push('Sanciones del Concilio'); }
  if (cont && f.embargo_target === cont && Number(f.embargo_until ?? -1) > l) { buy *= 1.4; sell *= 0.7; notes.push('Embargo'); }
  if (Number(f.free_trade_until ?? -1) > l) { buy *= 0.96; sell *= 1.04; notes.push('Libre comercio'); }
  return side === 'buy' ? { mult: buy, notes } : { mult: sell, notes };
}

/** Refuses to trade with the hated (unless they fear you or you own the place). */
export function tradeRefusal(locationId: string): string | null {
  const loc = G.run.locations[locationId];
  const cont = continentOf(locationId);
  if (!loc || !cont || loc.control === 'excepcion') return null;
  if (repTier(cont).id === 'odiado' && loc.fear < 50) return 'Aquí no le vendemos nada a usted. Ni agua.';
  return null;
}

/** Total gold for trading `qty` units (slippage walks the local curve). */
export function quote(locationId: string, g: GoodId, side: 'buy' | 'sell', qty: number): { total: number; unit: number; qty: number } {
  const loc = G.run.locations[locationId];
  if (!loc || qty <= 0) return { total: 0, unit: 0, qty: 0 };
  const stock = loc.stock[g];
  const q = side === 'buy' ? Math.min(qty, Math.max(0, stock)) : qty;
  const mid = loc.price[g] || targetPrice(locationId, g);
  const f0 = priceFactor(stock);
  const { mult } = playerPriceMult(locationId, side);
  let sum = 0;
  for (let i = 0; i < q; i++) {
    const st = side === 'buy' ? stock - i : stock + i;
    sum += mid * (priceFactor(st) / f0);
  }
  const spread = side === 'buy' ? 1.08 : 0.92;
  const total = Math.max(side === 'buy' ? 1 : 0, Math.round(sum * spread * mult));
  return { total: q ? total : 0, unit: q ? total / q : 0, qty: q };
}

export function cargoUsed(): number { const g = soc().goods; return GOOD_IDS.reduce((s, k) => s + (g[k] ?? 0), 0); }
export function cargoCap(): number {
  const naval = soc().businesses.some((b) => b.kind === 'naviera') ? 30 : 0;
  return 40 + G.run.player.army.length * 3 + naval;
}

function nudgePrice(loc: LocationState, g: GoodId): void {
  const t = targetPrice(loc.id, g);
  loc.price[g] = Math.round((loc.price[g] + (t - loc.price[g]) * 0.55) * 10) / 10;
}

/** Buys goods (total can be a haggled price). Returns false if not possible. */
export function buyGoods(locationId: string, g: GoodId, qty: number, total?: number): boolean {
  const loc = ensureLocation(locationId);
  if (!loc || qty <= 0) return false;
  const q = quote(locationId, g, 'buy', qty);
  if (q.qty < qty) return false;
  const price = Math.round(total ?? q.total);
  if (cargoUsed() + qty > cargoCap()) return false;
  if (!res.spend('gold', price)) return false;
  const s = soc();
  const have = s.goods[g] ?? 0;
  s.goodsCost[g] = Math.round(((s.goodsCost[g] ?? 0) * have + price) / (have + qty) * 10) / 10;
  s.goods[g] = have + qty;
  loc.stock[g] = Math.max(0, loc.stock[g] - qty);
  nudgePrice(loc, g);
  track('gold_spent', price);
  track('goods_bought', qty);
  if (price >= 150) applyDeed({ kind: 'trade', location: locationId, magnitude: price / 400, good: g, noNews: price < 600 });
  return true;
}

export function sellGoods(locationId: string, g: GoodId, qty: number, total?: number): boolean {
  const loc = ensureLocation(locationId);
  const s = soc();
  if (!loc || qty <= 0 || (s.goods[g] ?? 0) < qty) return false;
  const price = Math.round(total ?? quote(locationId, g, 'sell', qty).total);
  s.goods[g] -= qty;
  if (s.goods[g] <= 0) { s.goods[g] = 0; s.goodsCost[g] = 0; }
  loc.stock[g] += qty;
  nudgePrice(loc, g);
  res.add('gold', price);
  track('gold_earned', price);
  track('goods_sold', qty);
  if (price >= 150) applyDeed({ kind: 'trade', location: locationId, magnitude: price / 400, good: g, noNews: price < 600 });
  contractsOnSell(locationId, g, qty);
  return true;
}

/** Best known place to sell a good (visited markets; all markets if none visited). */
export function bestSellHint(g: GoodId, exclude?: string): { location: string; price: number } | null {
  const markets = marketIds().filter((id) => id !== exclude);
  const visited = markets.filter((id) => G.run.locations[id]?.visited);
  const pool = visited.length ? visited : markets;
  let best: { location: string; price: number } | null = null;
  for (const id of pool) {
    const p = priceOf(id, g) * 0.92;
    if (!best || p > best.price) best = { location: id, price: Math.round(p) };
  }
  return best;
}

export function trendOf(locationId: string, g: GoodId): -1 | 0 | 1 {
  const h = soc().hist[locationId]?.[g];
  const cur = G.run.locations[locationId]?.price[g];
  if (!h || h.length < 2 || !cur) return 0;
  const avg = h.slice(0, -1).reduce((a, b) => a + b, 0) / (h.length - 1);
  if (cur > avg * 1.04) return 1;
  if (cur < avg * 0.96) return -1;
  return 0;
}

// ───────────────────────────── caravans (world module) ─────────────────────────────

/** Moves stock between markets (caravan arrival). Returns the quantity actually shipped. */
export function shipGoods(from: string, to: string, good: GoodId, qty: number): number {
  const a = ensureLocation(from), b = ensureLocation(to);
  if (!a || !b || qty <= 0 || !GOOD_IDS.includes(good)) return 0;
  const q = Math.max(0, Math.min(Math.floor(qty), Math.floor(a.stock[good] * 0.6)));
  a.stock[good] -= q;
  b.stock[good] += q;
  return q;
}

/** Suggests a profitable caravan route (for spawning caravans on the map). */
export function bestCaravanRoute(fromContinent?: ContinentId): { from: string; to: string; good: GoodId; qty: number; profit: number } | null {
  const markets = marketIds();
  const sources = fromContinent ? markets.filter((m) => continentOf(m) === fromContinent) : markets;
  let best: { from: string; to: string; good: GoodId; qty: number; profit: number } | null = null;
  for (const a of sources) for (const b of markets) {
    if (a === b) continue;
    for (const g of GOOD_IDS) {
      const pa = priceOf(a, g), pb = priceOf(b, g);
      const qty = Math.min(40, Math.floor((G.run.locations[a]?.stock[g] ?? 0) * 0.4));
      const profit = (pb - pa) * qty - 30;
      if (qty > 5 && (!best || profit > best.profit)) best = { from: a, to: b, good: g, qty, profit };
    }
  }
  return best && best.profit > 0 ? best : null;
}

// ───────────────────────────── tavern contracts ─────────────────────────────

type ContractDraft = Omit<QuestState, 'progress' | 'done' | 'createdLuna'> & { progress?: number };

/** A contract for a tavern board (the world module passes it to addQuest). */
export function generateContract(locationId: string): ContractDraft {
  const s = soc();
  const cont = continentOf(locationId) ?? 'valdoria';
  const here = LOCATIONS[locationId];
  const sameCont = LOCATION_LIST.filter((l) => l.continent === cont && l.id !== locationId && l.kind !== 'ruina' && l.kind !== 'santuario');
  const id = `contract_${uid('c')}`;
  const expires = luna() + rng.int(6, 10);
  type Opt = { w: number; make: () => { meta: ContractMeta; title: string; desc: string; goal: number; target: string; reward: QuestState['reward'] } };
  const opts: Opt[] = [
    { w: 3, make: () => {
      const dest = rng.pick([locationId, ...sameCont.filter((l) => l.services.includes('mercado')).map((l) => l.id)]);
      const cons = (LOCATIONS[dest]?.consumes ?? CONTINENTS[cont].goods.consumes);
      const g = rng.pick(cons.length ? cons : GOOD_IDS);
      const qty = rng.int(8, 24);
      const gold = Math.round(goodInfo(g).base * qty * 1.6 + 40);
      return { meta: { type: 'entregar', location: dest, good: g }, title: `Entrega: ${goodInfo(g).name} a ${locName(dest)}`,
        desc: `${qty} de ${goodInfo(g).name.toLowerCase()} para ${locName(dest)}. «Nadie pregunta de dónde sale, solo que llegue», dice el tabernero.`, goal: qty, target: dest, reward: { gold } };
    } },
    { w: 2, make: () => {
      const t = rng.pick(sameCont.length ? sameCont : [here]).id;
      return { meta: { type: 'aterrorizar', location: t }, title: `Un mensaje para ${locName(t)}`,
        desc: `Alguien quiere que ${locName(t)} aprenda a tener miedo. Aterroriza el lugar. No preguntes quién paga.`, goal: 1, target: t, reward: { gold: rng.int(160, 280), influence: 5 } };
    } },
    { w: 2, make: () => ({ meta: { type: 'asaltar', location: locationId, continent: cont }, title: `Caravanas de ${contName(cont)}`,
      desc: `Asalta una caravana en los caminos de ${contName(cont)}. El Gremio de la Ceniza compra la carga sin mirar.`, goal: 1, target: locationId, reward: { gold: rng.int(200, 360) } }) },
    { w: 1.5, make: () => {
      const t = rng.pick(sameCont.length ? sameCont : [here]).id;
      return { meta: { type: 'sobornar', location: t }, title: `Oro bajo la mesa en ${locName(t)}`,
        desc: `Soborna a alguien importante en ${locName(t)}. «Un funcionario comprado vale más que diez espadas.»`, goal: 1, target: t, reward: { influence: 12, gold: 80 } };
    } },
    { w: 1.2, make: () => {
      const t = rng.pick(LOCATION_LIST.filter((l) => l.continent === cont && (l.kind === 'capital' || l.kind === 'fortaleza' || l.kind === 'templo'))) ?? here;
      return { meta: { type: 'infiltrar', location: t.id }, title: `Sin abrir puertas: ${t.name}`,
        desc: `Infíltrate en ${t.name} y sal sin que nadie te vea. Trae lo que encuentres... y lo que oigas.`, goal: 1, target: t.id, reward: { secrets: rng.int(1, 2), gold: 60 } };
    } },
  ];
  const nem = Object.entries(s.nemesis).find(([nid, m]) => m.continent === cont && G.run.npcs[nid]?.alive && !G.run.npcs[nid]?.loyal);
  if (nem) {
    const [nid] = nem;
    const g = G.run.npcs[nid].generated!;
    opts.push({ w: 2, make: () => ({ meta: { type: 'asesinar', location: locationId, npcId: nid }, title: `Recompensa: ${g.name} ${g.titleText ?? ''}`.trim(),
      desc: `${g.name} ${g.titleText ?? ''} tiene enemigos. Uno de ellos paga bien por verlo muerto.`, goal: 1, target: locationId, reward: { gold: 260 + g.level * 12, essence: 10 } }) });
  }
  if (cont === 'islas') {
    opts.push({ w: 1.2, make: () => ({ meta: { type: 'arena', location: 'arena_remolino' }, title: 'Una noche en el Remolino',
      desc: 'Gana una apuesta grande en la Arena del Remolino. «Si ganas, pagamos. Si pierdes, nunca nos conocimos.»', goal: 1, target: 'arena_remolino', reward: { gold: 250 } }) });
  }
  const pick = rng.weighted(opts, (o) => o.w).make();
  s.contracts[id] = pick.meta;
  return { id, kind: 'contract', title: pick.title, desc: pick.desc, goal: pick.goal, target: pick.target, reward: pick.reward, expiresLuna: expires };
}

function liveContracts(): Array<[string, ContractMeta]> {
  const s = soc();
  const out: Array<[string, ContractMeta]> = [];
  for (const [id, m] of Object.entries(s.contracts)) {
    const q = getQuest(id);
    if (!q) continue;
    if (q.done || q.failed) { delete s.contracts[id]; continue; }
    out.push([id, m]);
  }
  return out;
}

export function contractsOnDeed(d: Deed): void {
  for (const [id, m] of liveContracts()) {
    const at = d.location === m.location;
    if (m.type === 'aterrorizar' && d.kind === 'terror' && at) progressQuest(id, 1);
    else if (m.type === 'sobornar' && d.kind === 'bribe' && (at || (!!m.npcId && d.npcId === m.npcId))) progressQuest(id, 1);
    else if (m.type === 'asaltar' && d.kind === 'rob_caravan' && (continentOf(d.location) === m.continent || d.continent === m.continent)) progressQuest(id, 1);
    else if (m.type === 'infiltrar' && (d.kind === 'infiltrate' || d.kind === 'relic_stolen') && at) progressQuest(id, 1);
    else if (m.type === 'asesinar' && (d.kind === 'assassinate' || d.kind === 'execute') && d.npcId === m.npcId) progressQuest(id, 1);
  }
}

export function contractsOnSell(locationId: string, g: GoodId, qty: number): void {
  for (const [id, m] of liveContracts()) if (m.type === 'entregar' && m.location === locationId && m.good === g) progressQuest(id, qty);
}

export function contractsOnDeath(npcId: string): void {
  for (const [id, m] of liveContracts()) if (m.type === 'asesinar' && m.npcId === npcId) progressQuest(id, 1);
}

export function contractsLunaTick(): void {
  for (const [id] of liveContracts()) {
    const q = getQuest(id);
    if (q?.expiresLuna !== undefined && q.expiresLuna < luna()) { failQuest(id); delete soc().contracts[id]; }
  }
}
