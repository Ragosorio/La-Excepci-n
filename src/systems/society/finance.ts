/**
 * Money that flows every luna: businesses (income + Codicia), army upkeep (unpaid → desertion),
 * La Banca de las Mil Suertes (loans with interest, default → goblin collectors) and Banca shares
 * (dividends; owning 100 shares = owning the Banca → story beat for the Libro de la Realidad).
 */
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { addNews } from '../../core/news';
import { track } from '../../core/tracker';
import { rng, uid } from '../../core/rng';
import { fmt } from '../../core/math';
import { LOCATIONS } from '../../data/world';
import { UNITS } from '../../data/units';
import type { GoodId } from '../../data/types';
import { banner, toast } from '../../ui/toasts';
import { audio } from '../../audio';
import { addCorruption } from './corruption';
import { applyDeed } from './deeds';
import { changeRep, repTier } from './factions';
import { continentOf, ensureLocation, locName, luna, soc } from './state';
import type { BusinessKind, BusinessState, LoanState } from './types';

export interface BusinessDef { name: string; desc: string; cost: number; income: number; good?: GoodId; secretEvery?: number; needs: (locId: string) => boolean; needsText: string }

const produces = (id: string, g: GoodId) => !!LOCATIONS[id]?.produces?.includes(g);
const hasService = (id: string, s: string) => !!(LOCATIONS[id]?.services as string[] | undefined)?.includes(s);

export const BUSINESS_DEFS: Record<BusinessKind, BusinessDef> = {
  molino: { name: 'Molino', desc: 'Muele grano ajeno y lo vende como propio.', cost: 380, income: 26, good: 'grano', needs: (id) => produces(id, 'grano') || LOCATIONS[id]?.kind === 'aldea', needsText: 'Lugar con trigo o aldea' },
  aserradero: { name: 'Aserradero', desc: 'Los árboles de Sylvaria no perdonan. Los compradores sí.', cost: 420, income: 30, good: 'madera', needs: (id) => produces(id, 'madera') || LOCATIONS[id]?.continent === 'sylvaria', needsText: 'Bosques (Sylvaria)' },
  mina: { name: 'Mina', desc: 'Cavar hondo, pagar poco, vender caro.', cost: 900, income: 70, good: 'hierro', needs: (id) => produces(id, 'hierro') || produces(id, 'gemas'), needsText: 'Lugar con hierro o gemas' },
  taller: { name: 'Taller alquímico', desc: 'Calderos que burbujean las veinticuatro horas.', cost: 650, income: 46, good: 'pociones', needs: (id) => produces(id, 'pociones') || LOCATIONS[id]?.continent === 'morvenna', needsText: 'Pociones (Morvenna)' },
  taberna: { name: 'Taberna', desc: 'Cerveza, rumores y deudas pequeñas.', cost: 480, income: 34, needs: (id) => hasService(id, 'taberna'), needsText: 'Lugar con taberna' },
  sedas: { name: 'Casa de seda', desc: 'Telas finas... y oídos finos. Da un Secreto cada 3 lunas.', cost: 780, income: 52, good: 'seda', secretEvery: 3, needs: (id) => produces(id, 'seda') || hasService(id, 'sedas'), needsText: 'Seda o Casa de las Sedas' },
  naviera: { name: 'Naviera', desc: 'Barcos que no preguntan. +30 de carga para tus caravanas.', cost: 1200, income: 88, good: 'especias', needs: (id) => hasService(id, 'puerto'), needsText: 'Puerto' },
  cristaleria: { name: 'Destilería de maná', desc: 'Magia embotellada, con etiqueta dorada.', cost: 1100, income: 80, good: 'cristal', needs: (id) => produces(id, 'cristal'), needsText: 'Lugar con maná cristalizado' },
};
const LEVEL_MULT = [0, 1, 1.7, 2.5];

export function businessIncome(b: BusinessState): number {
  const def = BUSINESS_DEFS[b.kind];
  const pros = G.run.locations[b.location]?.prosperity ?? 50;
  return Math.round(def.income * (0.5 + pros / 100) * LEVEL_MULT[b.level]);
}

export function businessOptions(locationId: string): Array<{ kind: BusinessKind; def: BusinessDef; available: boolean; owned?: BusinessState }> {
  const owned = soc().businesses.filter((b) => b.location === locationId);
  return (Object.keys(BUSINESS_DEFS) as BusinessKind[]).map((k) => ({
    kind: k, def: BUSINESS_DEFS[k], available: BUSINESS_DEFS[k].needs(locationId), owned: owned.find((b) => b.kind === k),
  })).filter((o) => o.available || o.owned);
}

export function upgradeCost(b: BusinessState): number { return Math.round(BUSINESS_DEFS[b.kind].cost * b.level * 0.9); }

export function buyBusiness(locationId: string, kind: BusinessKind): BusinessState | null {
  const def = BUSINESS_DEFS[kind];
  const s = soc();
  if (!def || !def.needs(locationId) || s.businesses.some((b) => b.location === locationId && b.kind === kind)) return null;
  if (!res.spend('gold', def.cost)) return null;
  const b: BusinessState = { id: uid('biz'), kind, location: locationId, level: 1, since: luna(), invested: def.cost, earned: 0 };
  s.businesses.push(b);
  const loc = ensureLocation(locationId);
  if (loc && !loc.businesses.includes(b.id)) loc.businesses.push(b.id);
  applyDeed({ kind: 'invest', location: locationId, magnitude: def.cost / 500 });
  track('businesses_bought');
  track('gold_spent', def.cost);
  return b;
}

export function upgradeBusiness(id: string): boolean {
  const b = soc().businesses.find((x) => x.id === id);
  if (!b || b.level >= 3) return false;
  const cost = upgradeCost(b);
  if (!res.spend('gold', cost)) return false;
  b.level++;
  b.invested += cost;
  applyDeed({ kind: 'invest', location: b.location, magnitude: cost / 500, noNews: true });
  track('gold_spent', cost);
  return true;
}

export function sellBusiness(id: string): number {
  const s = soc();
  const i = s.businesses.findIndex((x) => x.id === id);
  if (i < 0) return 0;
  const b = s.businesses[i];
  const value = Math.round(b.invested * 0.45);
  s.businesses.splice(i, 1);
  const loc = G.run.locations[b.location];
  if (loc) loc.businesses = loc.businesses.filter((x) => x !== id);
  res.add('gold', value, { raw: true });
  return value;
}

// ───────────────────────────── army upkeep ─────────────────────────────

export function unitUpkeep(unitId: string, devoto?: boolean, lieutenant?: boolean): number {
  const base = UNITS[unitId]?.upkeep ?? 3;
  return base * (devoto ? 0.5 : 1) * (lieutenant ? 1.5 : 1);
}
export function armyUpkeep(): number {
  return Math.round(G.run.player.army.reduce((s, u) => s + unitUpkeep(u.unitId, u.devoto, !!u.npcId), 0));
}

function payUpkeep(): { paid: number; unpaid: number; deserters: number } {
  const cost = armyUpkeep();
  if (!cost) return { paid: 0, unpaid: 0, deserters: 0 };
  const gold = G.run.player.gold;
  if (gold >= cost) { res.add('gold', -cost, { raw: true }); return { paid: cost, unpaid: 0, deserters: 0 }; }
  res.add('gold', -gold, { raw: true });
  const unpaid = cost - gold;
  const army = G.run.player.army;
  const avg = cost / Math.max(1, army.length);
  const n = Math.min(army.filter((u) => !u.npcId).length, Math.ceil(unpaid / Math.max(1, avg)));
  // the unpaid and unloved leave first: regular troops, then lowest veterancy
  const order = army.map((u, i) => ({ u, i, k: (u.devoto ? 10 : 0) + u.stars * 3 + rng.next() })).filter((x) => !x.u.npcId).sort((a, b) => a.k - b.k);
  const leaving = new Set(order.slice(0, n).map((x) => x.u.uid));
  G.run.player.army = army.filter((u) => !leaving.has(u.uid));
  if (n) {
    track('units_deserted', n);
    toast(`<b>${n} ${n === 1 ? 'soldado desertó' : 'soldados desertaron'}.</b> «Sin paga no hay gloria.»`, { kind: 'bad', duration: 4.5 });
    addNews(`Desertores del ejército del eclipse llegan a las tabernas. Dicen que la paga era buena... cuando había.`, 'guerra');
  }
  return { paid: gold, unpaid, deserters: n };
}

// ───────────────────────────── La Banca ─────────────────────────────

export function totalDebt(): number { return Math.round(soc().loans.reduce((s, l) => s + l.owed, 0)); }
function syncDebt(): void { G.run.player.debt = totalDebt(); }

export function loanRate(): number | null {
  const t = repTier('banca').id;
  const table: Record<string, number | null> = { odiado: null, hostil: 0.1, antipatico: 0.08, neutral: 0.06, amistoso: 0.05, honorable: 0.045, reverenciado: 0.04, exaltado: 0.03 };
  return table[t] ?? 0.06;
}

export function creditLine(): number {
  const s = soc();
  const rep = G.run.reputation.banca ?? 0;
  const line = 400 + Math.max(0, rep) * 40 + s.businesses.length * 150 + s.bank.shares * s.bank.sharePrice * 0.5;
  return Math.max(0, Math.round(line - totalDebt()));
}

export function takeLoan(amount: number): LoanState | null {
  const rate = loanRate();
  const s = soc();
  if (rate === null || amount <= 0 || amount > creditLine() || s.bank.frozenUntil > luna()) return null;
  const loan: LoanState = { id: uid('loan'), principal: amount, owed: amount, rate, takenLuna: luna(), dueLuna: luna() + 8 };
  s.loans.push(loan);
  res.add('gold', amount, { raw: true });
  syncDebt();
  track('loans_taken');
  return loan;
}

/** Pays debt (oldest first). Returns the amount paid. */
export function repay(amount: number): number {
  const s = soc();
  let left = Math.min(amount, G.run.player.gold, totalDebt());
  if (left <= 0) return 0;
  const paid = left;
  res.add('gold', -paid, { raw: true });
  for (const l of [...s.loans].sort((a, b) => a.dueLuna - b.dueLuna)) {
    const take = Math.min(l.owed, left);
    l.owed = Math.round((l.owed - take) * 10) / 10;
    left -= take;
    if (left <= 0) break;
  }
  const before = s.loans.length;
  s.loans = s.loans.filter((l) => l.owed > 0.5);
  if (s.loans.length < before) {
    const onTime = s.bank.overdueSince < 0;
    changeRep('banca', onTime ? 3 : 1);
  }
  if (!s.loans.some((l) => l.dueLuna < luna())) s.bank.overdueSince = -1;
  syncDebt();
  return paid;
}

export function buyShares(n: number): boolean {
  const s = soc();
  const cost = Math.round(n * s.bank.sharePrice);
  if (n <= 0 || !res.spend('gold', cost)) return false;
  s.bank.shares += n;
  s.bank.sharePrice = Math.round(s.bank.sharePrice * (1 + 0.003 * n) * 10) / 10;
  addCorruption('islas', 'codicia', cost / 250, 'Acciones de la Banca');
  track('gold_spent', cost);
  checkBancaOwned();
  return true;
}

export function sellShares(n: number): number {
  const s = soc();
  const q = Math.min(n, s.bank.shares);
  if (q <= 0) return 0;
  const value = Math.round(q * s.bank.sharePrice * 0.97);
  s.bank.shares -= q;
  s.bank.sharePrice = Math.max(20, Math.round(s.bank.sharePrice * (1 - 0.003 * q) * 10) / 10);
  res.add('gold', value, { raw: true });
  return value;
}

function checkBancaOwned(): void {
  const s = soc();
  if (s.bank.owned || s.bank.shares < 100) return;
  s.bank.owned = true;
  G.run.flags.banca_owned = true;
  track('banca_owned');
  bus.emit('story:beat', { id: 'banca_comprada' });
  audio.stinger('jackpot_fanfare');
  void banner('LA BANCA ES TUYA', 'Don Tiburcio se quita el sombrero. Por primera vez, sin cobrarte.', { kind: 'jackpot', duration: 3.4 });
  addNews(`${G.run.player.name} compró La Banca de las Mil Suertes. Don Tiburcio dice que fue «un negocio chilero». Nadie le cree.`, 'economia', true);
}

function bankLunaTick(): number {
  const s = soc();
  const l = luna();
  let interest = 0;
  if (s.bank.frozenUntil <= l) {
    for (const loan of s.loans) {
      const add = Math.round(loan.owed * loan.rate * 10) / 10;
      loan.owed = Math.round((loan.owed + add) * 10) / 10;
      interest += add;
    }
  }
  syncDebt();
  const overdue = s.loans.filter((x) => x.dueLuna < l);
  if (overdue.length) {
    if (s.bank.overdueSince < 0) {
      s.bank.overdueSince = l;
      toast('<b>La Banca:</b> «Patojo, su préstamo venció. No me haga ir a buscarlo.»', { kind: 'bad', duration: 5 });
    }
    const late = l - s.bank.overdueSince;
    if (late >= 1 && l - s.bank.lastCollectors >= 2) {
      const debt = totalDebt();
      s.bank.lastCollectors = l;
      bus.emit('bank:collectors', { count: 1 + Math.floor(debt / 1500), strength: Math.round((1 + debt / 2000) * 10) / 10, debt });
      changeRep('banca', -6);
      addNews('La Banca de las Mil Suertes envió cobradores. Traen facturas, garrotes y una sonrisa de dientes de oro.', 'economia', true);
      track('bank_collectors');
    }
    if (late >= 4 && late % 2 === 0) seize();
  } else {
    s.bank.overdueSince = -1;
  }
  // share price random walk + dividends
  s.bank.sharePrice = Math.max(20, Math.min(600, Math.round(s.bank.sharePrice * (1 + rng.gaussian(0.012, 0.05)) * 10) / 10));
  s.bank.history.push(s.bank.sharePrice);
  if (s.bank.history.length > 12) s.bank.history.shift();
  if (s.bank.shares > 0) res.add('gold', Math.round(s.bank.shares * s.bank.sharePrice * 0.02));
  return Math.round(interest);
}

function seize(): void {
  const s = soc();
  const biz = [...s.businesses].sort((a, b) => b.invested - a.invested)[0];
  if (biz) {
    const value = Math.round(biz.invested * 0.6);
    s.businesses = s.businesses.filter((b) => b.id !== biz.id);
    const loc = G.run.locations[biz.location];
    if (loc) loc.businesses = loc.businesses.filter((x) => x !== biz.id);
    repayRaw(value);
    toast(`<b>Embargo:</b> la Banca se quedó con tu ${BUSINESS_DEFS[biz.kind].name.toLowerCase()} en ${locName(biz.location)}.`, { kind: 'bad', duration: 5 });
  } else {
    const take = Math.min(G.run.player.gold, Math.round(totalDebt() * 0.3));
    if (take > 0) { res.add('gold', -take, { raw: true }); repayRaw(take); toast(`<b>Embargo:</b> los duendes se llevaron ${fmt(take)} de oro. Contaron dos veces.`, { kind: 'bad' }); }
  }
}

function repayRaw(value: number): void {
  const s = soc();
  let left = value;
  for (const l of s.loans) { const t = Math.min(l.owed, left); l.owed -= t; left -= t; if (left <= 0) break; }
  s.loans = s.loans.filter((l) => l.owed > 0.5);
  syncDebt();
}

// ───────────────────────────── luna summary ─────────────────────────────

export function financeLunaTick(): void {
  const s = soc();
  let income = 0;
  for (const b of s.businesses) {
    const inc = businessIncome(b);
    income += inc;
    b.earned += inc;
    const def = BUSINESS_DEFS[b.kind];
    const cont = continentOf(b.location);
    if (cont) addCorruption(cont, 'codicia', 0.35 * b.level);
    const loc = G.run.locations[b.location];
    if (loc && def.good) loc.stock[def.good] = (loc.stock[def.good] ?? 0) + 6 * b.level;
    if (def.secretEvery && (luna() - b.since) % def.secretEvery === 0 && luna() > b.since) res.add('secrets', 1);
  }
  if (income) { res.add('gold', income); track('gold_earned', income); }
  const up = payUpkeep();
  const interest = bankLunaTick();
  s.lastLuna = { luna: luna(), income, upkeep: up.paid + up.unpaid, unpaid: up.unpaid, deserters: up.deserters, interest };
  bus.emit('society:luna', { income, upkeep: up.paid + up.unpaid, unpaid: up.unpaid, deserters: up.deserters, interest });
  if (income || up.paid || interest) {
    const parts = [
      income ? `<span class="lx-good">+${fmt(income)} negocios</span>` : '',
      up.paid ? `<span class="lx-bad">−${fmt(up.paid + up.unpaid)} ejército</span>` : '',
      interest ? `<span class="lx-bad">+${fmt(interest)} de deuda (intereses)</span>` : '',
    ].filter(Boolean).join(' · ');
    toast(`<b>Cuentas de la luna</b> ${parts}`, { kind: 'gold', duration: 3.6 });
    if (income) audio.sfx('coins_many', { volume: 0.5 });
  }
}
