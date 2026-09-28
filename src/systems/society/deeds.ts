/**
 * Deeds: ONE consistent consequence table for everything Elias does in the world (GDD pillars 3 & 4).
 * applyDeed({ kind:'terror', location:'vado_trigo' }) → corruption (path × continent weakness × Presencia),
 * fear/loyalty/prosperity, reputation (continent + guilds + Concilio), witness memories, Alert, a news line,
 * tracker keys, contract progress. Returns a summary callers can show.
 */
import { G, res, type NewsItem } from '../../core/state';
import { bus } from '../../core/events';
import { addNews } from '../../core/news';
import { track } from '../../core/tracker';
import { rng } from '../../core/rng';
import { fmt } from '../../core/math';
import type { ContinentId, CorruptionPath, GuildId } from '../../data/types';
import { CONTINENT_IDS } from '../../data/world';
import { toast } from '../../ui/toasts';
import { addCorruption, setControl } from './corruption';
import { changeRep, factionName } from './factions';
import { feel, killNpc, npcView, npcsAt, remember, displayName } from './memory';
import { contractsOnDeed, marketShock } from './economy';
import { PATH_NAMES, continentOf, ensureLocation, locDef, locName, presenceFactor, round1, shortPlace, soc, veloActive, worldEpithet, contName, luna } from './state';
import type { Deed, DeedKind, DeedOutcome, Feelings } from './types';

interface MemSpec { kind: string; text: string; intensity: number; feel: Partial<Feelings> }
interface DeedRule {
  paths: Array<[CorruptionPath, number]>;
  fear: number; loyalty: number; prosperity: number;
  rep: number;
  guilds?: Partial<Record<GuildId, number>>;
  concilio?: number;
  alert: number;
  stealthy?: boolean;
  witness?: MemSpec;
  target?: MemSpec;
  track?: string[];
  news: string[];
  kind: NewsItem['kind'];
  chance?: number;
  important?: boolean;
}

const RULES: Record<DeedKind, DeedRule> = {
  terror: {
    paths: [['terror', 6]], fear: 18, loyalty: -8, prosperity: -4, rep: -8, guilds: { juramentados: -4, orden_alba: -3 }, concilio: -3, alert: 6,
    witness: { kind: 'amenazado', text: 'Aterrorizaste {short}', intensity: 5, feel: { miedo: 15, odio: 8 } },
    target: { kind: 'amenazado', text: 'Me amenazaste en {short}', intensity: 7, feel: { miedo: 25, odio: 12 } },
    kind: 'rumor',
    news: [
      'En {loc} la gente cierra las ventanas antes del anochecer. Dicen que {epithet} pasó por ahí.',
      'Los niños de {loc} ya no juegan en la plaza. Nadie quiere decir por qué.',
      'En {loc} los perros le aúllan a una sombra con ojos violeta.',
      'Dicen que en {loc} un mago pálido sonrió, y tres guardias soltaron sus lanzas.',
    ],
  },
  manipulate: {
    paths: [['intriga', 7]], fear: 0, loyalty: 4, prosperity: 0, rep: 0, concilio: -2, alert: 4, stealthy: true,
    target: { kind: 'dominado', text: 'Me metiste en la cabeza en {short}', intensity: 8, feel: { respeto: 20 } },
    track: ['manipulations'], kind: 'rumor', chance: 0.7,
    news: [
      'El señor de {loc} firma decretos que nadie entiende. Tiene la mirada perdida, dicen.',
      'En {loc} alguien juró haber visto espirales en los ojos del alcalde.',
      'Nadie sabe por qué {loc} cambió de opinión de la noche a la mañana.',
    ],
  },
  invest: {
    paths: [['codicia', 4]], fear: 0, loyalty: 3, prosperity: 6, rep: 3, guilds: { banca: 2 }, alert: 1,
    track: ['investments'], kind: 'economia', chance: 0.8,
    news: [
      'Un inversionista misterioso compró medio {loc}. Pagó en oro que todavía estaba tibio.',
      'En {loc} abrieron negocios nuevos. Los dueños nunca aparecen de día.',
      'El dinero fluye hacia {loc}. Nadie pregunta de dónde. Esa es la parte cara.',
    ],
  },
  raid: {
    paths: [['terror', 3], ['codicia', 2]], fear: 15, loyalty: -15, prosperity: -18, rep: -12, guilds: { juramentados: -5, orden_alba: -3 }, concilio: -5, alert: 8,
    witness: { kind: 'robado', text: 'Saqueaste {short}', intensity: 6, feel: { odio: 15, miedo: 10 } },
    kind: 'guerra',
    news: [
      '{loc} fue saqueado. Los graneros vacíos todavía huelen a ceniza violeta.',
      'Saquearon {loc}. Los sobrevivientes describen a un hombre elegante que nunca levantó la voz.',
      'De {loc} solo quedaron las puertas. Abiertas. Muy educadamente abiertas.',
    ],
  },
  infiltrate: {
    paths: [['intriga', 4]], fear: 0, loyalty: 0, prosperity: 0, rep: -2, alert: 2, stealthy: true,
    track: ['infiltrations'], kind: 'rumor', chance: 0.4,
    news: ['Alguien entró a {loc} sin abrir una sola puerta.', 'En {loc} faltan papeles. Nadie vio a nadie.', 'Los guardias de {loc} juran que no durmieron. Sus bolsillos dicen otra cosa.'],
  },
  conquer: {
    paths: [['conquista', 12]], fear: 22, loyalty: -10, prosperity: -8, rep: -10, guilds: { juramentados: -6 }, concilio: -6, alert: 10,
    witness: { kind: 'conquistado', text: 'Tomaste {short}', intensity: 6, feel: { miedo: 15, odio: 10 } },
    track: ['conquests'], kind: 'guerra', important: true,
    news: [
      '{loc} cayó. El estandarte del eclipse ondea sobre sus murallas.',
      'Los defensores de {loc} se rindieron cuando el mago sonrió. Otros dicen que ya estaban muertos.',
      'Tomaron {loc}. El Concilio convoca a sus generales.',
    ],
  },
  liberate: {
    paths: [['conquista', 5], ['intriga', 2]], fear: -8, loyalty: 18, prosperity: 4, rep: 6, concilio: -3, alert: 5,
    witness: { kind: 'ayudado', text: 'Nos liberaste en {short}', intensity: 6, feel: { deuda: 20, respeto: 15 } },
    track: ['liberations'], kind: 'guerra',
    news: ['{loc} fue liberado... de sus libertadores. Ahora ondea el eclipse, y nadie sabe si aplaudir.', 'En {loc} echaron a la guarnición del Concilio. Los vecinos invitaron a cenar al mago. Nadie comió mucho.'],
  },
  spare: {
    paths: [['intriga', 2]], fear: 0, loyalty: 5, prosperity: 0, rep: 4, alert: 0,
    target: { kind: 'perdonado', text: 'Me perdonaste en {short}', intensity: 9, feel: { respeto: 40, deuda: 30, odio: -20 } },
    track: ['spared'], kind: 'rumor', chance: 0.6,
    news: ['{npc} vive. Nadie sabe por qué {epithet} lo dejó ir.', 'Dicen que la Excepción perdonó a {npc}. Los más listos tienen más miedo que antes.'],
  },
  execute: {
    paths: [['terror', 5]], fear: 15, loyalty: -6, prosperity: 0, rep: -6, guilds: { orden_alba: -4, juramentados: -2 }, concilio: -3, alert: 4,
    witness: { kind: 'familiar_muerto', text: 'Ejecutaste a {npc} en {short}', intensity: 6, feel: { odio: 20, miedo: 12 } },
    track: ['executed'], kind: 'guerra',
    news: ['{npc} fue ejecutado en {loc}. La plaza quedó en silencio durante horas.', 'Colgaron el estandarte de {npc} al revés en {loc}. Es un mensaje. Todos lo entendieron.'],
  },
  rob_caravan: {
    paths: [['codicia', 3], ['terror', 1]], fear: 6, loyalty: -3, prosperity: -6, rep: -5, guilds: { banca: -2 }, concilio: -2, alert: 5,
    kind: 'economia', chance: 0.5,
    news: ['Una caravana de {good} no llegó a {loc}. Los precios ya lo notan.', 'Asaltaron un convoy rumbo a {loc}. Los mercaderes contratan guardias; los guardias piden aumento.', 'Otra caravana vacía en los caminos de {cont}. Solo dejaron las ruedas... y una pluma violeta.'],
  },
  bribe: {
    paths: [['codicia', 2]], fear: 0, loyalty: 2, prosperity: 0, rep: 0, alert: 1, stealthy: true,
    target: { kind: 'sobornado', text: 'Aceptó tu oro en {short}', intensity: 5, feel: { deuda: 15, respeto: -5 } },
    kind: 'rumor', chance: 0.25,
    news: ['En {loc}, un funcionario estrena capa de seda. Con qué sueldo, nadie sabe.', 'En {loc} los guardias miran para otro lado. Con mucha dedicación.'],
  },
  blackmail: {
    paths: [['intriga', 5]], fear: 5, loyalty: 0, prosperity: 0, rep: -1, alert: 2, stealthy: true,
    target: { kind: 'chantajeado', text: 'Me chantajeaste en {short}', intensity: 8, feel: { odio: 30, miedo: 20 } },
    track: ['blackmails'], kind: 'rumor', chance: 0.3,
    news: ['{npc} renunció a sus principios esta luna. Dicen que alguien le mostró una carta.', 'A {npc} le tiemblan las manos cuando alguien menciona el color violeta.'],
  },
  assassinate: {
    paths: [['terror', 3], ['intriga', 4]], fear: 12, loyalty: -8, prosperity: 0, rep: -10, guilds: { ceniza: 3, orden_alba: -3 }, concilio: -10, alert: 12,
    witness: { kind: 'familiar_muerto', text: 'Asesinaste a {npc}', intensity: 6, feel: { odio: 20, miedo: 15 } },
    kind: 'guerra', important: true,
    news: ['{npc} apareció muerto en {loc}. Ninguna puerta fue forzada.', 'Asesinaron a {npc}. En la almohada había una pluma violeta.'],
  },
  gift: {
    paths: [['codicia', 1]], fear: -3, loyalty: 8, prosperity: 3, rep: 6, alert: 0,
    target: { kind: 'regalo', text: 'Me hiciste un regalo en {short}', intensity: 5, feel: { deuda: 15, respeto: 10, odio: -5 } },
    track: ['gifts'], kind: 'rumor', chance: 0.35,
    news: ['En {loc} alguien repartió oro. La gente lo aceptó y luego no pudo dormir.', 'Regalos sin firma llegan a {loc}. Todos saben de quién son.'],
  },
  trade: {
    paths: [['codicia', 0.5]], fear: 0, loyalty: 0, prosperity: 1, rep: 1, guilds: { banca: 0.5 }, alert: 0, stealthy: true,
    kind: 'economia', chance: 0.08,
    news: ['Un comerciante de ojos violeta mueve {good} por {cont}. Paga bien. Nadie le pregunta nada.'],
  },
  recruit: {
    paths: [['conquista', 1]], fear: 2, loyalty: -2, prosperity: 0, rep: -1, alert: 1,
    kind: 'rumor', chance: 0.15,
    news: ['Jóvenes de {loc} se marchan con un ejército que no lleva bandera.', 'En {loc} se reclutan soldados para alguien. Pagan puntual. Eso asusta más.'],
  },
  battle_won: {
    paths: [['conquista', 4]], fear: 8, loyalty: -4, prosperity: -2, rep: -3, concilio: -2, alert: 3,
    kind: 'guerra', chance: 0.5,
    news: ['Hubo batalla cerca de {loc}. Los que la vieron hablan de soldados que volaban.', 'Cerca de {loc} el campo quedó sembrado de escudos. El ejército del eclipse ganó otra vez.'],
  },
  battle_lost: {
    paths: [], fear: -10, loyalty: 6, prosperity: 0, rep: 2, concilio: 3, alert: 2,
    kind: 'guerra', chance: 0.6,
    news: ['Cerca de {loc}, el ejército del eclipse retrocedió. En las tabernas brindan, en voz baja.', 'Dicen que {epithet} perdió una batalla en {loc}. Dicen también que no dejó de sonreír.'],
  },
  cheat_caught: {
    paths: [['codicia', 1]], fear: 0, loyalty: 0, prosperity: 0, rep: -5, guilds: { banca: -12 }, alert: 3,
    witness: { kind: 'enganado', text: 'Te vi hacer trampa en {short}', intensity: 4, feel: { odio: 10 } },
    kind: 'casino',
    news: ['¡Trampa en {loc}! Los Ojos de la Casa atraparon a {epithet} con la mano en la rueda.', 'En {loc} echaron a un mago por hacer trampa. Dice que fue la suerte. La suerte dice que no.'],
  },
  relic_stolen: {
    paths: [['intriga', 4], ['codicia', 2]], fear: 4, loyalty: -4, prosperity: 0, rep: -8, concilio: -4, alert: 8, stealthy: true,
    kind: 'rumor', important: true,
    news: ['Alguien entró a {loc} sin abrir una sola puerta. Falta algo que no debía faltar.', 'El tesoro de {loc} amaneció más ligero. Los guardias juran que no durmieron.'],
  },
  sanctuary: {
    paths: [['intriga', 2], ['terror', 1]], fear: 6, loyalty: -2, prosperity: 0, rep: -3, alert: 2,
    kind: 'rumor',
    news: ['En {loc} hay un círculo de ceniza violeta que nadie se atreve a pisar.', 'Los pájaros ya no se posan cerca de {loc}. Algo se instaló ahí.'],
  },
  help: {
    paths: [['intriga', 1]], fear: -6, loyalty: 10, prosperity: 5, rep: 8, guilds: { orden_alba: 1 }, concilio: 1, alert: -1,
    witness: { kind: 'ayudado', text: 'Nos ayudaste en {short}', intensity: 5, feel: { deuda: 20, respeto: 10, odio: -10 } },
    target: { kind: 'ayudado', text: 'Me ayudaste en {short}', intensity: 7, feel: { deuda: 30, respeto: 15, odio: -15 } },
    track: ['helped'], kind: 'rumor', chance: 0.5,
    news: ['En {loc} dicen que el mago ese ayudó a reparar el molino. Nadie sabe qué pensar.', '{epithet} ayudó a la gente de {loc}. Los viejos dicen que así empiezan las peores historias.'],
  },
};

const GOOD_NAMES: Record<string, string> = { grano: 'grano', madera: 'madera', hierro: 'hierro', especias: 'especias', seda: 'seda', pociones: 'pociones', gemas: 'gemas', cristal: 'maná cristalizado' };

function fill(t: string, d: Deed, cont: ContinentId | null, silent: boolean): string {
  return t
    .replace(/\{loc\}/g, d.location ? locName(d.location) : contName(cont))
    .replace(/\{short\}/g, d.location ? shortPlace(d.location) : contName(cont))
    .replace(/\{cont\}/g, contName(cont))
    .replace(/\{npc\}/g, d.npcId ? displayName(d.npcId) : 'alguien importante')
    .replace(/\{good\}/g, d.good ? GOOD_NAMES[d.good] ?? d.good : 'mercancía')
    .replace(/\{epithet\}/g, silent ? 'alguien' : worldEpithet())
    .replace(/\{name\}/g, silent ? 'alguien' : G.run.player.name);
}

const cap = (v: number, m: number) => Math.max(-m, Math.min(m, v));
/** "+6" / "−8" with a real minus sign. */
const signed = (v: number, d = 0) => { const a = d ? fmt(Math.abs(v), d) : String(Math.round(Math.abs(v))); return v > 0 ? `+${a}` : v < 0 ? `−${a}` : '0'; };

/** Apply every consequence of a player action consistently. */
export function applyDeed(d: Deed): DeedOutcome {
  if (!G.run || !d || !RULES[d.kind]) return {};
  const rule = RULES[d.kind];
  const mag = Math.max(0.05, Math.min(10, d.magnitude ?? 1));
  const loc = d.location ? ensureLocation(d.location) : null;
  const factionCont = d.faction && (CONTINENT_IDS as string[]).includes(d.faction) ? (d.faction as ContinentId) : null;
  const cont: ContinentId | null = d.continent ?? continentOf(d.location) ?? factionCont ?? (d.npcId ? continentOf(npcView(d.npcId)?.home) : null);
  const velo = veloActive();
  const silent = !!d.silent;
  const out: DeedOutcome = { continent: cont ?? undefined, lines: [] };
  const lines = out.lines!;

  // 1) corruption (Presencia & capitals amplify)
  const capital = locDef(d.location)?.kind === 'capital' ? 1.25 : 1;
  const pf = presenceFactor();
  let corr = 0;
  if (cont && cont !== 'concordia') {
    const paths: Array<[CorruptionPath, number]> = d.path ? [[d.path, rule.paths.reduce((s, [, v]) => s + v, 0) || 2]] : rule.paths;
    for (const [p, base] of paths) {
      const eff = addCorruption(cont, p, base * mag * pf * capital, undefined);
      if (eff > 0) lines.push(`+${fmt(eff, 1)}% ${PATH_NAMES[p]} · ${contName(cont)}`);
      corr += eff;
      out.path ??= p;
    }
  }
  out.corruption = round1(corr);

  // 2) location state
  if (loc) {
    const f = cap(rule.fear * mag, 40), l = cap(rule.loyalty * mag, 40), p = cap(rule.prosperity * mag, 40);
    loc.fear = Math.max(0, Math.min(100, loc.fear + f));
    loc.loyalty = Math.max(0, Math.min(100, loc.loyalty + l));
    loc.prosperity = Math.max(0, Math.min(100, loc.prosperity + p));
    out.fear = round1(f); out.loyalty = round1(l); out.prosperity = round1(p);
    if (Math.round(f)) lines.push(`Miedo ${signed(f)}`);
    if (Math.round(l)) lines.push(`Lealtad ${signed(l)}`);
    if (d.kind === 'conquer' || d.kind === 'liberate') setControl(loc.id, 'excepcion');
    if (d.kind === 'raid') { loc.razed = loc.prosperity < 15 || loc.razed; marketShock(loc.id, null, 0.7); }
  }
  if (d.kind === 'rob_caravan' && d.location) marketShock(d.location, d.good ?? null, 1.35);

  // 3) reputation
  const repD = cap(rule.rep * mag, 25);
  if (cont && repD) { changeRep(cont, repD); if (Math.round(repD)) lines.push(`Reputación ${contName(cont)} ${signed(repD)}`); }
  out.rep = round1(repD);
  for (const [g, v] of Object.entries(rule.guilds ?? {})) if (v) changeRep(g as GuildId, cap(v * mag, 25));
  if (rule.concilio) changeRep('concilio', cap(rule.concilio * mag, 25));
  if (d.faction && d.faction !== cont && repD) { changeRep(d.faction, repD * 0.8); if (Math.round(repD * 0.8)) lines.push(`Reputación ${factionName(d.faction)} ${signed(repD * 0.8)}`); }

  // 4) memories
  const target = d.npcId;
  if (target && rule.target) {
    remember(target, { kind: rule.target.kind, text: fill(rule.target.text, d, cont, false), where: d.location, intensity: Math.min(10, Math.round(rule.target.intensity * Math.min(1.5, 0.7 + mag * 0.3))) });
    feel(target, scaleFeel(rule.target.feel, mag));
  }
  if (!silent && rule.witness && d.location) {
    for (const w of npcsAt(d.location).filter((id) => id !== target && !G.run.npcs[id]?.loyal).slice(0, 6)) {
      remember(w, { kind: rule.witness.kind, text: fill(rule.witness.text, d, cont, false), where: d.location, intensity: rule.witness.intensity });
      feel(w, scaleFeel(rule.witness.feel, mag * 0.8));
    }
  }
  if (target && (d.kind === 'execute' || d.kind === 'assassinate')) killNpc(target, d.kind === 'execute' ? 'ejecucion' : 'asesinato');

  // 5) Alert
  if (rule.alert) {
    const stealth = silent ? 0.35 : velo ? (rule.stealthy ? 0.35 : 0.6) : 1;
    const a = rule.alert > 0 ? rule.alert * Math.min(3, mag) * stealth : rule.alert * mag;
    const applied = res.add('alert', round1(a));
    out.alert = round1(applied);
    if (applied) lines.push(`Alerta ${signed(applied, 1)}`);
  }

  // 6) news
  if (!d.noNews) {
    const chance = (rule.chance ?? 1) * (silent ? 0.5 : 1);
    if (d.text || rng.chance(chance)) {
      const news = d.text ?? fill(rng.pick(rule.news), d, cont, silent);
      addNews(news, rule.kind, !!rule.important && !silent);
      out.news = news;
    }
  }

  // 7) tracker, log, contracts
  track(`deeds_${d.kind}`);
  for (const k of rule.track ?? []) track(k);
  const s = soc();
  s.deedLog.unshift({ kind: d.kind, location: d.location, luna: luna(), npcId: d.npcId });
  if (s.deedLog.length > 40) s.deedLog.length = 40;
  try { contractsOnDeed(d); } catch (err) { console.warn('[society] contracts', err); }
  bus.emit('deed:applied', { deed: d, outcome: out });
  return out;
}

function scaleFeel(f: Partial<Feelings>, k: number): Partial<Feelings> {
  const o: Partial<Feelings> = {};
  for (const [key, v] of Object.entries(f) as Array<[keyof Feelings, number]>) o[key] = Math.round(v * Math.min(2, k));
  return o;
}

/** Convenience: toast a deed summary ("Terror en Vado del Trigo · +6% Terror · Miedo +18 · Alerta +6"). */
export function deedToast(title: string, o: DeedOutcome): void {
  const chips = (o.lines ?? []).slice(0, 4).map((l) => `<span class="soc-chip-inline">${l}</span>`).join(' ');
  toast(`<b>${title}</b> ${chips}`, { kind: (o.alert ?? 0) > 4 ? 'bad' : 'epica', duration: 4.2 });
}

/** Recent deeds at a location (for townsfolk gossip). */
export function recentDeedsAt(locationId: string, lunas = 12): Array<{ kind: DeedKind; luna: number; npcId?: string }> {
  const l = luna();
  return soc().deedLog.filter((x) => x.location === locationId && l - x.luna <= lunas);
}

export const DEED_KINDS = Object.keys(RULES) as DeedKind[];
