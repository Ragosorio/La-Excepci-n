/**
 * Nemesis captains (GDD §4.6, research §2): generated, named, with traits and memories. They survive, flee,
 * get promoted, carry scars, hold grudges, hunt Elias on the map and echo into the next cycle.
 * (Lower-risk shape per research note: per-NPC memory, grudges and trait mutations, no auto-reshuffled ranks.)
 */
import { G, type RunState } from '../../core/state';
import { bus } from '../../core/events';
import { addNews } from '../../core/news';
import { track } from '../../core/tracker';
import { Rng, rng, uid } from '../../core/rng';
import { CONTINENTS, GUILDS, LOCATIONS } from '../../data/world';
import { UNITS, unitsForContinent } from '../../data/units';
import { captainTitle, promotionTitle, randomName } from '../../data/names';
import { RACES } from '../../data/races';
import type { ContinentId, FactionId, GuildId, JobId, RaceId, TraitId, UnitDef, ArmyUnit } from '../../data/types';
import type { BattleResult, BattleSetup, CaptainSpec } from '../../battle/api';
import { cutin, toast } from '../../ui/toasts';
import { portraitSVG } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { CONTINENT_IDS } from '../../data/world';
import { continentOf, contName, luna, shortPlace, soc } from './state';
import { displayName, feel, killNpc, makeLoyal, npcState, npcView, portraitFor, remember, topMemory } from './memory';
import type { NemesisMeta } from './types';

const TRAIT_POOL: TraitId[] = ['orgulloso', 'cobarde', 'vengativo', 'cruel', 'honorable', 'supersticioso', 'borracho', 'jugador', 'codicioso', 'ambicioso', 'valiente', 'paranoico', 'piadoso', 'leal', 'sabio', 'curioso'];
const FALLBACK_NAMES = ['Brann', 'Ilse', 'Oren', 'Vela', 'Grakh', 'Moira', 'Tolv', 'Sarn', 'Edda', 'Kellan', 'Ruska', 'Dorn', 'Yeva', 'Horst', 'Lune', 'Barra'];
const FALLBACK_TITLES = ['el Terco', 'la Rápida', 'Rompehuesos', 'el Tuerto', 'la Sin Miedo', 'el Dos Veces Quemado', 'Mediamuela', 'la Última Flecha'];

// ───────────────────────────── helpers ─────────────────────────────

function factionContinent(f: FactionId | undefined, location?: string): ContinentId | null {
  const byLoc = continentOf(location);
  if (byLoc && byLoc !== 'concordia') return byLoc;
  if (!f) return byLoc;
  if ((CONTINENT_IDS as string[]).includes(f)) return f as ContinentId;
  const g = GUILDS[f as GuildId];
  if (g) return continentOf(g.base);
  return byLoc;
}

function pickUnit(cont: ContinentId | null, strength: number, r: Rng): UnitDef | null {
  const good = (u: UnitDef) => u.role !== 'asedio' && u.role !== 'sanador' && u.role !== 'apoyo';
  let pool: UnitDef[] = [];
  try { if (cont) pool = unitsForContinent(cont).filter(good); } catch { pool = []; }
  if (!pool.length && cont) {
    const races = CONTINENTS[cont]?.races ?? [];
    pool = Object.values(UNITS).filter((u) => races.includes(u.race) && good(u));
  }
  if (!pool.length) pool = Object.values(UNITS).filter(good);
  if (!pool.length) return null;
  const minTier = strength >= 2 ? 3 : strength >= 1.2 ? 2 : 1;
  const tiered = pool.filter((u) => u.tier >= minTier);
  return r.pick(tiered.length ? tiered : pool);
}

export function fallbackUnitId(): string {
  const any = Object.keys(UNITS);
  return any[0] ?? 'soldado';
}

function safeName(race: RaceId, gender: 'f' | 'm', r: Rng): string {
  try { const n = randomName(race, gender, r); if (n) return n; } catch { /* content WIP */ }
  return r.pick(FALLBACK_NAMES);
}
function safeTitle(r: Rng, gender: 'f' | 'm'): string {
  try { const t = captainTitle(r, gender); if (t) return t; } catch { /* content WIP */ }
  return r.pick(FALLBACK_TITLES);
}

function levelFor(strength: number): number {
  const corrupted = CONTINENT_IDS.filter((c) => G.run.continents[c]?.corrupted).length;
  // strength is garrison-scale (≈10 for a village, ≈90–150 for capitals): a village captain starts around level 3
  return Math.max(1, Math.min(60, Math.round(2 + luna() * 0.25 + strength * 0.12 + corrupted * 3)));
}

export function fullName(id: string): string {
  const st = G.run.npcs[id];
  const g = st?.generated;
  if (!g) return displayName(id);
  return g.titleText ? `${g.name} ${g.titleText}` : g.name;
}

// ───────────────────────────── creation ─────────────────────────────

export function createNemesis(opts: { continent: ContinentId | null; faction: FactionId; home?: string | null; strength?: number; name?: string; race?: RaceId; title?: string; level?: number; echoCycle?: number }): string {
  const s = soc();
  s.nemesisSeq++;
  const id = `nem_${s.nemesisSeq}`;
  const r = new Rng(`${G.run.seed}:nemesis:${s.nemesisSeq}`);
  const strength = opts.strength ?? 1;
  const unit = pickUnit(opts.continent, strength, r);
  const race: RaceId = opts.race ?? unit?.race ?? (opts.continent ? r.pick(CONTINENTS[opts.continent]?.races ?? ['humano']) : 'humano');
  const job: JobId = unit?.job ?? 'capitan';
  const gender: 'f' | 'm' = r.chance(race === 'ogro' || race === 'gigante' ? 0.3 : 0.45) ? 'f' : 'm';
  const traits = r.pickN(TRAIT_POOL, 2);
  const home = opts.home ?? null;
  G.run.npcs[id] = {
    id, alive: true, location: home ?? 'concordia',
    feelings: { miedo: 5, odio: 15 + (traits.includes('vengativo') ? 15 : 0) + (traits.includes('cruel') ? 5 : 0), deuda: 0, respeto: traits.includes('honorable') ? 10 : 0 },
    memories: [], met: false,
    generated: { name: opts.name ?? safeName(race, gender, r), race, job, level: opts.level ?? levelFor(strength), titleText: opts.title ?? safeTitle(r, gender), traits, scars: 0, seed: `${id}:${r.int(0, 1e6)}` },
  };
  const meta: NemesisMeta = {
    faction: opts.faction, continent: opts.continent, home, unitId: unit?.id ?? fallbackUnitId(), gender,
    encounters: 0, kills: 0, fled: 0, defeats: 0, promotions: 0, lastSeen: luna(), hunting: false, huntCooldown: luna() + 3,
    echoCycle: opts.echoCycle, epithets: [],
  };
  s.nemesis[id] = meta;
  return id;
}

// ───────────────────────────── taunts ─────────────────────────────

const MEMORY_TAUNTS: Record<string, string[]> = {
  mato_elias: ['Ya te maté una vez en {where}. ¿Qué te hace pensar que no lo haré otra vez?', '¿Otra vez vivo? Todavía guardo tu sombrero de {where}.', 'Te vi caer en {where}. Esta vez me quedo a mirar hasta el final.'],
  cicatriz: ['Me dejaste esta cicatriz en {where}. Hoy te la devuelvo.', '¿Ves esta marca? {where}. La toco cada noche pensando en ti.', 'La cicatriz de {where} todavía arde cuando llueve. Hoy va a llover.'],
  huyo: ['La última vez huí. Esta vez no.', 'Corrí en {where}. Todavía sueño con tus ojos. Hoy termino esa pesadilla.', 'Me llamaron cobarde por lo de {where}. Tu cabeza les va a cerrar la boca.'],
  familiar_muerto: ['Mataste a {detail} en {where}. Hoy lo pagas.', '{detail} era mi hermano de armas. Lo dejaste en {where}. Yo no te voy a dejar.'],
  perdonado: ['Me perdonaste en {where}. Fue un error. Te lo voy a demostrar.', 'Me dejaste vivir en {where}. Te lo agradezco... pero tengo órdenes.'],
  vencio: ['Te vi huir en {where}. ¿Vienes a huir otra vez?', 'En {where} te derroté. No me hagas repetirlo.'],
  derrotado: ['En {where} me tumbaste. Aprendí. ¿Y tú?', 'Me ganaste en {where}. Fue suerte. Hoy se te acaba.'],
  abandonado: ['¡Me diste por muerto en {where}! Error de principiante.', 'En {where} me dejaste tirado en el barro. El barro me enseñó a esperar.'],
  dominado: ['Me metiste en la cabeza en {where}. Todavía oigo tu voz. Hoy la callo.', 'Mis ojos giraron por ti en {where}. Nunca más.'],
  humillado: ['Me humillaste en {where}. Todo el mundo lo vio. Hoy todo el mundo te verá caer.'],
  eco: ['¿Nos conocemos? Siento que ya te maté una vez.', 'Juraría que ya peleamos. En otra vida. En otro libro.', 'Tu cara... la he soñado. En el sueño ganaba yo.'],
};

const TRAIT_TAUNTS: Partial<Record<TraitId, string[]>> = {
  orgulloso: ['¿Tú eres la Excepción? Me esperaba algo con más presencia.', 'Van a cantar esta batalla. Con mi nombre, no con el tuyo.'],
  cobarde: ['¡N-no te acerques! ¡Tengo refuerzos! ...Tengo refuerzos, ¿verdad?', 'Si esto sale mal, yo nunca estuve aquí.'],
  vengativo: ['Dicen que no mueres. Perfecto: te podré matar muchas veces.', 'Llevo una lista. Tu nombre está arriba de todo.'],
  cruel: ['Guardaré tus ojos en un frasco. Los violetas son raros.', 'Me han contado que gritas bonito.'],
  honorable: ['Pelearé contigo de frente. Es más de lo que mereces.', 'Sin trucos, mago. Acero contra lo que seas.'],
  supersticioso: ['Mi abuela me dio este amuleto contra los que no mueren. Veamos si sirve.', 'No me mires a los ojos. No me mires a los ojos.'],
  borracho: ['¡Hip! Ya te veo doble. Así que te voy a pegar doble.', '¡Brindo por tu entierro! ...¿Otra vez? ¡Otro brindis!'],
  jugador: ['Aposté mi sueldo a que caes en el primer asalto. No me hagas perder.', 'Diez a uno a que no llegas a mí. Acepto apuestas.'],
  codicioso: ['Tu cabeza vale oro en Concordia. Ya me la gasté.', 'Nada personal: me pagan por kilo.'],
  ambicioso: ['Tu cabeza me hará general.', 'Después de ti, el Concilio me dará un castillo.'],
  valiente: ['No te tengo miedo. Nadie aquí te tiene miedo.', 'He visto cosas peores. No muchas, pero algunas.'],
  paranoico: ['Sabía que vendrías. Lo sabía. ¡LO SABÍA!', '¿Eres tú de verdad o es otro de tus trucos?'],
  piadoso: ['Que el Alba me perdone por lo que voy a hacerte.', 'Rezo por tu alma. Por si tienes.'],
  leal: ['Por mi señor y por Concordia.', 'Mientras yo respire, no pasas.'],
  sabio: ['Los que no mueren aprenden. Veamos qué aprendes de mí.', 'Todo lo que sube cae, mago. Hasta tú.'],
  curioso: ['¿Es verdad que copias lo que te golpea? Probemos.', 'Siempre quise ver qué hay detrás de esos ojos.'],
};

function fillTaunt(t: string, where?: string, detail?: string): string {
  return t.replace(/\{where\}/g, shortPlace(where)).replace(/\{detail\}/g, detail ?? 'uno de los nuestros');
}

/** Pre-battle cut-in line, citing the strongest memory when there is one. */
export function nemesisTaunt(id: string): string {
  const st = G.run.npcs[id];
  if (!st) return '';
  const m = topMemory(id, Object.keys(MEMORY_TAUNTS));
  if (m && MEMORY_TAUNTS[m.kind]) {
    const detail = m.kind === 'familiar_muerto' ? m.text.replace(/^Mataste a /, '').replace(/ en .*$/, '') : undefined;
    return fillTaunt(rng.pick(MEMORY_TAUNTS[m.kind]), m.where, detail);
  }
  const traits = st.generated?.traits ?? npcView(id)?.traits ?? [];
  const pool = traits.flatMap((t) => TRAIT_TAUNTS[t] ?? []);
  return pool.length ? rng.pick(pool) : `${fullName(id)} te cierra el paso.`;
}

function toSpec(id: string): CaptainSpec {
  const st = G.run.npcs[id];
  const g = st.generated!;
  const m = soc().nemesis[id];
  m.lastSeen = luna();
  return {
    npcId: id, unitId: m.unitId || fallbackUnitId(), name: g.name, title: g.titleText,
    hpMult: Math.round((1.2 + g.level * 0.05 + g.scars * 0.05) * 100) / 100,
    dmgMult: Math.round((1.1 + g.level * 0.035) * 100) / 100,
    taunt: nemesisTaunt(id),
  };
}

// ───────────────────────────── public: captains ─────────────────────────────

/** Named captains for an enemy force: living nemeses tied to that faction/area first, else new ones. */
export function captainsFor(opts: { location?: string; faction?: FactionId; count: number; strength?: number }): CaptainSpec[] {
  if (!G.run) return [];
  const want = Math.max(0, Math.min(6, Math.floor(opts.count || 0)));
  if (!want) return [];
  const s = soc();
  const cont = factionContinent(opts.faction, opts.location);
  const faction: FactionId = opts.faction ?? (cont ?? 'concilio');
  const scored = Object.entries(s.nemesis)
    .filter(([id, m]) => { const st = G.run.npcs[id]; return !!st?.alive && !st.loyal && !m.fallen && !!st.generated; })
    .map(([id, m]) => {
      const st = G.run.npcs[id];
      let sc = 0;
      if (m.faction === faction) sc += 5;
      if (cont && m.continent === cont) sc += 3;
      if (opts.location && m.home === opts.location) sc += 2;
      if (m.hunting) sc += 3;
      sc += st.feelings.odio / 25 + m.kills * 2;
      if (m.lastSeen === luna()) sc -= 2;
      return { id, sc: sc + Math.random() * 0.8 };
    })
    .filter((x) => x.sc >= 3)
    .sort((a, b) => b.sc - a.sc);
  const ids = scored.slice(0, want).map((x) => x.id);
  while (ids.length < want) {
    ids.push(createNemesis({ continent: cont, faction, home: opts.location ?? null, strength: opts.strength }));
  }
  return ids.map(toSpec);
}

// ───────────────────────────── battle outcomes ─────────────────────────────

interface Presentation { id: string; title: string; subtitle: string }
const presentations: Presentation[] = [];

function queuePromotion(id: string, title: string, subtitle: string): void {
  presentations.push({ id, title, subtitle });
}

/** Show queued nemesis promotions as anime cut-ins (called when back on the map/location). */
export async function flushNemesisPresentations(): Promise<void> {
  while (presentations.length) {
    const p = presentations.shift()!;
    try {
      audio.stinger('nemesis');
      await cutin({ portrait: portraitSVG(portraitFor(p.id, 'smug'), 520), title: p.title, subtitle: p.subtitle, colors: ['#2a0710', '#e2455b'], side: 'left', duration: 1.8, slowmo: false });
    } catch (err) { console.warn('[society] nemesis cutin', err); }
  }
}

function addTrait(id: string, t: TraitId): void {
  const g = G.run.npcs[id]?.generated;
  if (g && !g.traits.includes(t)) { g.traits.push(t); if (g.traits.length > 4) g.traits.shift(); }
}

function killerTitle(prev: string | undefined, kills: number, gender: 'f' | 'm'): string {
  if (kills <= 1 || !prev) return 'Matador de la Excepción';
  if (kills === 2) {
    try { const t = promotionTitle(rng, gender); if (t && t !== prev) return t; } catch { /* content WIP */ }
    return gender === 'f' ? 'la Dos Veces Matadora' : 'el Dos Veces Matador';
  }
  return gender === 'f' ? 'la que Mata lo que no Muere' : 'el que Mata lo que no Muere';
}

function promoteKiller(id: string, where: string | null): void {
  const st = npcState(id);
  const m = soc().nemesis[id];
  const g = st?.generated;
  remember(id, { kind: 'mato_elias', text: `Te maté en ${shortPlace(where)}`, where: where ?? undefined, intensity: 10 });
  feel(id, { respeto: 10, miedo: -25, odio: -5 });
  if (g && m) {
    g.level = Math.min(60, g.level + 3);
    m.kills++; m.promotions++;
    g.titleText = killerTitle(g.titleText, m.kills, m.gender);
    addTrait(id, 'orgulloso');
    queuePromotion(id, '¡NÉMESIS ASCIENDE!', `${g.name} ${g.titleText} · Nivel ${g.level}`);
    addNews(`${g.name} dice que mató a ${G.run.player.name} en ${shortPlace(where)}. Nadie le cree. Todos le temen.`, 'guerra', true);
    if (!m.hunting && rng.chance(0.5)) startHunt(id);
  }
  track('killed_by_nemesis');
}

function promoteFled(id: string, where: string | null): void {
  const st = npcState(id);
  const m = soc().nemesis[id];
  const g = st?.generated;
  remember(id, { kind: 'huyo', text: `Huí de ti en ${shortPlace(where)}`, where: where ?? undefined, intensity: 7 });
  feel(id, { odio: 20, miedo: 10 });
  if (g && m) {
    m.fled++; m.promotions++;
    g.level = Math.min(60, g.level + 1);
    if (rng.chance(0.7)) {
      g.scars++;
      remember(id, { kind: 'cicatriz', text: `Me dejaste esta cicatriz en ${shortPlace(where)}`, where: where ?? undefined, intensity: 8 });
    }
    addTrait(id, rng.chance(0.5) ? 'vengativo' : rng.pick(TRAIT_POOL));
    if (m.fled === 1) m.epithets.push('el que Volvió');
    queuePromotion(id, 'HUYÓ... Y VOLVERÁ', `${g.name} ${g.titleText ?? ''} · Nivel ${g.level}${g.scars ? ' · marcado' : ''}`);
    if (!m.hunting && rng.chance(0.3)) startHunt(id);
  }
}

function survivedWin(id: string, where: string | null, playerFled: boolean): void {
  const st = npcState(id);
  const m = soc().nemesis[id];
  remember(id, { kind: 'vencio', text: playerFled ? `Te vi huir en ${shortPlace(where)}` : `Te derroté en ${shortPlace(where)}`, where: where ?? undefined, intensity: 7 });
  feel(id, { respeto: -10, odio: 5, miedo: -10 });
  if (st?.generated && m) {
    st.generated.level = Math.min(60, st.generated.level + 1);
    m.promotions++;
    queuePromotion(id, playerFled ? 'TE VIO HUIR' : 'NÉMESIS INVICTO', `${st.generated.name} ${st.generated.titleText ?? ''} · Nivel ${st.generated.level}`);
  }
}

function markFallen(id: string, where: string | null): void {
  const m = soc().nemesis[id];
  remember(id, { kind: 'derrotado', text: `Me derrotaste en ${shortPlace(where)}`, where: where ?? undefined, intensity: 8 });
  feel(id, { miedo: 20 });
  if (m) { m.defeats++; m.fallen = true; m.lastSeen = luna(); }
  const s = soc();
  if (!s.pendingJudgement.includes(id)) s.pendingJudgement.push(id);
}

function rivalsRemember(deadId: string, where: string | null, how: 'mato' | 'ejecuto'): void {
  const s = soc();
  const m = s.nemesis[deadId];
  if (!m) return;
  const name = G.run.npcs[deadId]?.generated?.name ?? 'uno de los nuestros';
  for (const [id, other] of Object.entries(s.nemesis)) {
    if (id === deadId || other.faction !== m.faction || !G.run.npcs[id]?.alive) continue;
    if (!rng.chance(how === 'ejecuto' ? 0.6 : 0.3)) continue;
    remember(id, { kind: 'familiar_muerto', text: `${how === 'ejecuto' ? 'Ejecutaste' : 'Mataste'} a ${name} en ${shortPlace(where)}`, where: where ?? undefined, intensity: 6 });
    feel(id, { odio: how === 'ejecuto' ? 15 : 10, miedo: how === 'ejecuto' ? 10 : 0 });
  }
}

/** bus 'battle:end' → promotions, deaths, memories (nemeses and canonical captains alike). */
export function onBattleEnd(setup: BattleSetup, result: BattleResult): void {
  if (!G.run || !setup || !result) return;
  const caps: CaptainSpec[] = [...(setup.enemy?.captains ?? []), ...(setup.enemy?.boss ? [setup.enemy.boss] : [])];
  const where = setup.locationId ?? G.run.player.location ?? null;
  const has = (list: string[] | undefined, c: CaptainSpec) => !!list && (list.includes(c.npcId ?? '\u0000') || list.includes(c.name));
  for (const c of caps) {
    const id = c.npcId;
    if (!id) continue;
    const st = npcState(id);
    if (!st || !st.alive) continue;
    st.met = true;
    const m = soc().nemesis[id];
    if (m) { m.encounters++; m.lastSeen = luna(); m.hunting = false; }
    const killedElias = !!result.captainKilledPlayer && (result.captainKilledPlayer === id || result.captainKilledPlayer === c.name);
    const killed = has(result.captainsKilled, c);
    // dying outranks everything: a captain who killed Elias and then fell is not promoted
    if (killedElias && !killed) promoteKiller(id, where);
    else if (has(result.captainsFled, c) && !killed) promoteFled(id, where);
    else if (killed) {
      if (result.victory && st.generated) markFallen(id, where);
      else if (st.generated && rng.chance(0.25)) {
        st.generated.scars++;
        remember(id, { kind: 'abandonado', text: `Me diste por muerto en ${shortPlace(where)}`, where: where ?? undefined, intensity: 8 });
        feel(id, { odio: 25 });
      } else {
        killNpc(id, 'batalla');
        rivalsRemember(id, where, 'mato');
      }
    } else if (!result.victory) survivedWin(id, where, result.fled);
  }
  pruneNemeses();
}

// ───────────────────────────── judgement (defeated captains) ─────────────────────────────

export function pendingCaptives(): string[] {
  const s = soc();
  s.pendingJudgement = s.pendingJudgement.filter((id) => G.run.npcs[id]?.alive && s.nemesis[id]?.fallen);
  return [...s.pendingJudgement];
}

function clearFallen(id: string): void {
  const s = soc();
  s.pendingJudgement = s.pendingJudgement.filter((x) => x !== id);
  const m = s.nemesis[id];
  if (m) m.fallen = false;
}

export function spareCaptive(id: string): void {
  clearFallen(id);
  const where = G.run.player.location;
  remember(id, { kind: 'perdonado', text: `Me perdonaste en ${shortPlace(where)}`, where: where ?? undefined, intensity: 9 });
  feel(id, { respeto: 40, deuda: 30, odio: -20, miedo: 10 });
  const g = G.run.npcs[id]?.generated;
  if (g && !g.traits.includes('orgulloso') && !g.traits.includes('vengativo') && rng.chance(0.4)) addTrait(id, 'leal');
}

export function executeCaptive(id: string): void {
  clearFallen(id);
  const where = G.run.player.location;
  killNpc(id, 'ejecucion');
  rivalsRemember(id, where, 'ejecuto');
}

export function releaseCaptive(id: string): void {
  clearFallen(id);
  const where = G.run.player.location;
  const st = G.run.npcs[id];
  if (st?.generated && rng.chance(0.3)) {
    st.generated.scars++;
    remember(id, { kind: 'abandonado', text: `Me dejaste por muerto en ${shortPlace(where)}`, where: where ?? undefined, intensity: 8 });
    feel(id, { odio: 20 });
  } else {
    killNpc(id, 'batalla');
  }
}

/** A captive (or any recruitable NPC) joins the army as a named lieutenant. */
export function addLieutenant(npcId: string, unitId?: string): ArmyUnit | null {
  const p = G.run.player;
  if (p.army.some((u) => u.npcId === npcId)) return null;
  const v = npcView(npcId);
  const uId = unitId ?? v?.combatUnit ?? soc().nemesis[npcId]?.unitId ?? fallbackUnitId();
  const unit: ArmyUnit = { uid: uid('lt'), unitId: uId, stars: 1, xp: 0, name: v?.name ?? displayName(npcId), npcId };
  p.army.push(unit);
  bus.emit('lieutenant:recruited', { npcId, unitUid: unit.uid });
  track('lieutenants');
  return unit;
}

export function dominateCaptive(id: string): void {
  clearFallen(id);
  const where = G.run.player.location;
  remember(id, { kind: 'dominado', text: `Me metiste en la cabeza en ${shortPlace(where)}`, where: where ?? undefined, intensity: 9 });
  makeLoyal(id, 'dominado');
  addLieutenant(id);
  track('minds_dominated');
}

// ───────────────────────────── hunts, per-luna ─────────────────────────────

export function startHunt(id: string): void {
  const m = soc().nemesis[id];
  if (!m || m.hunting || !G.run.npcs[id]?.alive) return;
  m.hunting = true;
  m.huntCooldown = luna() + 6;
  bus.emit('nemesis:hunt', { npcId: id });
  addNews(`Dicen que ${fullName(id)} anda preguntando por ti en ${contName(m.continent)}. Pregunta con los puños.`, 'guerra');
  toast(`<b>${fullName(id)}</b> te está cazando.`, { kind: 'bad', duration: 4 });
}

export function nemesisLunaTick(): void {
  const s = soc();
  const l = luna();
  for (const [id, m] of Object.entries(s.nemesis)) {
    const st = G.run.npcs[id];
    if (!st?.alive || st.loyal) continue;
    if (m.hunting && l - m.huntCooldown > -1) m.hunting = false;   // hunts fade after ~5 lunas
    if (m.fallen && l - m.lastSeen >= 3) releaseCaptive(id);      // judgement never came
    if (!m.hunting && !m.fallen && m.huntCooldown <= l && (st.feelings.odio >= 60 || m.kills > 0)) {
      if (rng.chance(0.08 + m.kills * 0.04)) startHunt(id);
    }
  }
}

function pruneNemeses(): void {
  const s = soc();
  const l = luna();
  for (const [id, m] of Object.entries(s.nemesis)) {
    const st = G.run.npcs[id];
    if (st && !st.alive && m.kills === 0 && l - m.lastSeen > 10) {
      delete s.nemesis[id];
      delete G.run.npcs[id];
    }
  }
}

// ───────────────────────────── cycles ─────────────────────────────

/** bus 'cycle:end' → the most memorable nemeses and NPC feelings echo into the next cycle. */
export function writeEchoes(cycle: number): void {
  const meta = G.meta;
  if (!meta || !G.run) return;
  const s = soc();
  const ranked = Object.entries(s.nemesis)
    .map(([id, m]) => ({ id, m, st: G.run.npcs[id] }))
    .filter((x) => !!x.st?.generated)
    .map((x) => ({ ...x, score: x.m.kills * 5 + (x.st.generated?.level ?? 0) + x.st.feelings.odio / 10 + x.m.fled * 2 + (x.st.alive ? 2 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  for (const x of ranked) {
    const g = x.st.generated!;
    meta.nemesisEchoes.push({ name: g.name, race: g.race, title: g.titleText, grudge: topMemory(x.id)?.text ?? 'Algo que no terminamos', cycle });
  }
  if (meta.nemesisEchoes.length > 8) meta.nemesisEchoes.splice(0, meta.nemesisEchoes.length - 8);
  for (const [id, st] of Object.entries(G.run.npcs)) {
    if (st.generated) continue;
    const f = st.feelings;
    const key = (['odio', 'miedo', 'deuda', 'respeto'] as const).reduce((a, b) => (f[b] > f[a] ? b : a), 'odio' as 'odio' | 'miedo' | 'deuda' | 'respeto');
    const mem = topMemory(id);
    if (f[key] >= 35 || (mem && mem.intensity >= 7)) {
      meta.npcEchoes[id] = { cycle, feeling: key, memory: mem?.text ?? '' };
    }
  }
}

/** New cycle: echoes of old nemeses return (they don't know why they hate you). */
export function initNemesisEchoes(run: RunState): void {
  if (run.cycle < 2) return;
  const echoes = (G.meta?.nemesisEchoes ?? []).filter((e) => e.cycle < run.cycle).slice(-3);
  for (const e of echoes) {
    const race = (e.race as RaceId) ?? 'humano';
    let cont: ContinentId | null = null;
    try { cont = RACES[race]?.homeContinents?.[0] ?? null; } catch { cont = null; }
    if (!cont) cont = CONTINENT_IDS.find((c) => CONTINENTS[c].races.includes(race)) ?? 'valdoria';
    const home = Object.values(LOCATIONS).find((l) => l.continent === cont && l.kind !== 'ruina')?.id ?? null;
    const id = createNemesis({ continent: cont, faction: cont, home, name: e.name, race, title: e.title, strength: 1.3, echoCycle: e.cycle });
    const st = run.npcs[id];
    if (st) {
      st.feelings.odio = 45;
      st.memories.push({ kind: 'eco', text: e.grudge || 'Algo que no terminamos', luna: -1, intensity: 6 });
    }
  }
}
