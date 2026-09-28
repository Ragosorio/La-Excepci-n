/**
 * The Concilio's resolution pool (GDD §4.7). Each resolution has an agenda weight driven by what Elias has done,
 * per-continent ideology (+ = inclined to vote SÍ), trait biases, and effects when it passes (or fails).
 */
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { narrate } from '../../ui/narrator';
import { CONTINENT_IDS, LOCATION_LIST } from '../../data/world';
import type { ContinentId, TraitId } from '../../data/types';
import { addCorruption } from './corruption';
import { changeRep } from './factions';
import { emitHunters, mobilizeAlliance } from './alert';
import { marketIds } from './economy';
import { totalDebt } from './finance';
import { contName, corruptedContinents, ensureLocation, luna, seatsHeld, soc } from './state';

export interface AgendaCtx { corrupted: number; alert: number; seats: number; luna: number; stats: Record<string, number>; debt: number; title: number }
type Params = Record<string, string>;

export interface ResolutionDef {
  id: string;
  title: (p: Params) => string;
  desc: (p: Params) => string;
  passText: (p: Params) => string[];
  failText?: (p: Params) => string[];
  eliasWants: (p: Params) => 'si' | 'no';
  ideology: (p: Params) => Partial<Record<ContinentId | 'ione', number>>;
  traits?: Partial<Record<TraitId, number>>;
  weight: (c: AgendaCtx) => number;
  params?: () => Params;
  apply: (p: Params) => void;
  applyFail?: (p: Params) => void;
  requiresSeats?: number;
  icon: string;
}

const l = () => luna();
const flags = () => G.run.flags;
const until = (k: string) => Number(flags()[k] ?? -1) > l();
const s = <T,>(x: T) => (): T => x;

export const RESOLUTIONS: Record<string, ResolutionDef> = {
  sanciones: {
    id: 'sanciones', icon: '⚖',
    title: s('Sanciones contra la Excepción'),
    desc: s('Que ningún mercado honesto comercie con el mago de ojos violeta sin pagar el precio de la vergüenza.'),
    passText: s(['Precios +20% para ti durante 8 lunas', 'Alerta +10']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 30, sylvaria: 40, kharaz: -10, morvenna: 0, islas: -25, ione: 35 }),
    traits: { honorable: 20, piadoso: 15, codicioso: -20, jugador: -10 },
    weight: (c) => (until('sanctions_until') ? 0 : 1.5 + c.corrupted * 2 + c.alert / 25),
    apply: () => { flags().sanctions_until = l() + 8; res.add('alert', 10); },
  },
  gran_alianza: {
    id: 'gran_alianza', icon: '⚔',
    title: s('Movilizar la Gran Alianza'),
    desc: s('Cinco estandartes bajo una sola causa: detener lo que no se detiene.'),
    passText: s(['La Gran Alianza marcha contra ti', 'Alerta +10']),
    failText: s(['Los delegados discuten quién paga el pan de los soldados. Nadie marcha.']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 35, sylvaria: 30, kharaz: 10, morvenna: -10, islas: -20, ione: 20 }),
    traits: { valiente: 20, cobarde: -25, leal: 10, ambicioso: 10 },
    weight: (c) => (soc().alert.alliance ? 0 : c.alert >= 55 || c.corrupted >= 2 ? 3 + c.corrupted : 0),
    apply: () => { res.add('alert', 10); mobilizeAlliance('por decreto del Concilio'); },
  },
  recompensa: {
    id: 'recompensa', icon: '☠',
    title: s('Recompensa por la cabeza de Elias Veyr'),
    desc: s('Oro concordiano para quien traiga pruebas de que «la cosa que no muere» murió de verdad.'),
    passText: s(['Cazarrecompensas te buscan durante 10 lunas']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 20, sylvaria: 25, kharaz: 15, morvenna: -5, islas: 10, ione: -10 }),
    traits: { codicioso: 15, cruel: 15, piadoso: -15, honorable: -5, vengativo: 15 },
    weight: (c) => (soc().alert.bountyUntil > c.luna ? 0 : 1 + c.alert / 20 + ((c.stats.assassinations ?? 0) + (c.stats.executed ?? 0)) * 0.5 + (c.luna - soc().council.lastDetected <= 4 ? 5 : 0)),
    apply: () => { soc().alert.bountyUntil = l() + 10; emitHunters(1); },
  },
  libre_comercio: {
    id: 'libre_comercio', icon: '⚓',
    title: s('Tratado de Libre Comercio'),
    desc: s('Caminos abiertos, aranceles bajos y caravanas que no se detienen en cada frontera.'),
    passText: s(['Mejores precios de compra y venta (10 lunas)', 'Codicia +20% durante 10 lunas', 'Prosperidad +5 en los mercados']),
    eliasWants: () => 'si',
    ideology: () => ({ valdoria: 10, sylvaria: -25, kharaz: 25, morvenna: 0, islas: 40, ione: 10 }),
    traits: { codicioso: 25, jugador: 10, piadoso: -10, supersticioso: -5, paranoico: -10 },
    weight: () => (until('free_trade_until') ? 0 : 1.5 + (soc().businesses.length ? 1 : 0)),
    apply: () => {
      flags().free_trade_until = l() + 10;
      for (const id of marketIds()) { const loc = ensureLocation(id); if (loc) loc.prosperity = Math.min(100, loc.prosperity + 5); }
    },
  },
  embargo: {
    id: 'embargo', icon: '⛓',
    title: (p) => `Embargo a ${contName(p.target as ContinentId)}`,
    desc: (p) => `Cerrar los puertos y los caminos de ${contName(p.target as ContinentId)} hasta que «recupere la cordura».`,
    passText: (p) => [`${contName(p.target as ContinentId)}: prosperidad −12, lealtad −8`, 'Comerciar allí te cuesta un 40% más (8 lunas)', 'Intriga +4 en ese continente'],
    eliasWants: (p) => (G.run.continents[p.target as ContinentId]?.corrupted ? 'no' : 'si'),
    ideology: (p) => {
      const o: Partial<Record<ContinentId | 'ione', number>> = { valdoria: 10, sylvaria: 10, kharaz: 10, morvenna: 10, islas: -10, ione: 0 };
      o[p.target as ContinentId] = -60;
      return o;
    },
    traits: { paranoico: 15, codicioso: -10, honorable: 5 },
    weight: () => (until('embargo_until') ? 0 : 1.2),
    params: () => {
      const cands = CONTINENT_IDS.filter((c) => !G.run.continents[c]?.corrupted);
      const pool = cands.length ? cands : CONTINENT_IDS;
      const target = pool.reduce((a, b) => ((G.run.continents[b]?.corruption ?? 0) > (G.run.continents[a]?.corruption ?? 0) ? b : a), pool[0]);
      return { target };
    },
    apply: (p) => {
      const c = p.target as ContinentId;
      flags().embargo_target = c;
      flags().embargo_until = l() + 8;
      for (const loc of LOCATION_LIST.filter((x) => x.continent === c)) {
        const st = ensureLocation(loc.id);
        if (st) { st.prosperity = Math.max(0, st.prosperity - 12); st.loyalty = Math.max(0, st.loyalty - 8); }
      }
      addCorruption(c, 'intriga', 4, 'Embargo del Concilio');
    },
  },
  prohibir_apuestas: {
    id: 'prohibir_apuestas', icon: '🎲',
    title: s('Prohibir las Apuestas'),
    desc: s('Cerrar las mesas, apagar los faroles del Gran Casino y devolver la decencia a los puertos.'),
    passText: s(['El casino cierra durante 6 lunas']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 20, sylvaria: 35, kharaz: -5, morvenna: 0, islas: -70, ione: 15 }),
    traits: { piadoso: 25, jugador: -40, codicioso: -15, supersticioso: 10 },
    weight: (c) => (Number(flags().casino_closed ?? -1) > c.luna ? 0 : 0.6 + (c.stats.casino_wins ?? 0) / 10 + (c.stats.cheats_caught ?? 0) * 1.5 + ((c.stats.gold_gambled ?? 0) > 5000 ? 1.5 : 0)),
    apply: () => { flags().casino_closed = l() + 6; },
  },
  amnistia_brujas: {
    id: 'amnistia_brujas', icon: '☾',
    title: s('Amnistía para las Brujas'),
    desc: s('Perdonar al Aquelarre sus viejas maldiciones. Las brujas prometen portarse bien. Más o menos.'),
    passText: s(['El Aquelarre te lo agradece (+reputación)', 'Morvenna +6, Orden del Alba −6']),
    eliasWants: () => 'si',
    ideology: () => ({ valdoria: -10, sylvaria: -45, kharaz: 0, morvenna: 50, islas: 15, ione: 5 }),
    traits: { piadoso: -20, supersticioso: -15, sabio: 10, curioso: 10 },
    weight: () => (flags().witch_amnesty ? 0 : 1),
    apply: () => { flags().witch_amnesty = true; changeRep('aquelarre', 12); changeRep('morvenna', 6); changeRep('orden_alba', -6); },
  },
  llamar_campeon: {
    id: 'llamar_campeon', icon: '☀',
    title: s('Llamar de vuelta al Campeón'),
    desc: s('Que Aurel, Portador del Alba, deje el retiro y termine lo que empezó en la plaza de Concordia.'),
    passText: s(['Aurel regresa... y te caza']),
    failText: s(['Aurel sigue lejos. Por ahora.']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 40, sylvaria: 30, kharaz: 15, morvenna: 5, islas: 0, ione: 30 }),
    traits: { valiente: 10, leal: 15, cobarde: 15, orgulloso: -10 },
    weight: (c) => (flags().aurel_hunting ? 0 : c.corrupted >= 1 ? 3 + c.corrupted : 0),
    apply: () => { flags().aurel_hunting = true; bus.emit('story:beat', { id: 'aurel_hunting' }); },
  },
  fondo_reconstruccion: {
    id: 'fondo_reconstruccion', icon: '⌂',
    title: s('Fondo de Reconstrucción'),
    desc: s('Oro de los cinco continentes para levantar lo que el miedo derribó.'),
    passText: s(['Lugares arrasados: prosperidad +15, lealtad +10', 'El Terror rinde un 20% menos (8 lunas)', 'Terror −6 en el continente más corrupto']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 20, sylvaria: 20, kharaz: 5, morvenna: 10, islas: -10, ione: 40 }),
    traits: { piadoso: 20, codicioso: -15, honorable: 10, cruel: -10 },
    weight: (c) => (until('reconstruction_until') ? 0 : 0.5 + ((c.stats.raids ?? 0) + (c.stats.terror_acts ?? 0)) * 0.3),
    apply: () => {
      flags().reconstruction_until = l() + 8;
      for (const loc of Object.values(G.run.locations)) {
        if (loc.control === 'excepcion') continue;
        if (loc.prosperity < 40 || loc.razed) { loc.prosperity = Math.min(100, loc.prosperity + 15); loc.loyalty = Math.min(100, loc.loyalty + 10); loc.razed = false; }
      }
      const cands = CONTINENT_IDS.filter((c) => !G.run.continents[c]?.corrupted);
      if (cands.length) {
        const worst = cands.reduce((a, b) => ((G.run.continents[b]?.corruption ?? 0) > (G.run.continents[a]?.corruption ?? 0) ? b : a), cands[0]);
        addCorruption(worst, 'terror', -6);
      }
    },
  },
  custodio_elias: {
    id: 'custodio_elias', icon: '♛', requiresSeats: 3,
    title: s('Nombrar a Elias Veyr Custodio del Concilio'),
    desc: s('Tres asientos ya son suyos. Que la mesa deje de fingir.'),
    passText: s(['Intriga +25 en todos los continentes', 'Influencia +50 · Alerta −30', 'Eres Custodio: la Intriga rinde +25%']),
    failText: s(['La sala se ríe. Influencia −10, Alerta +5.']),
    eliasWants: () => 'si',
    ideology: () => ({ valdoria: -30, sylvaria: -40, kharaz: -20, morvenna: -20, islas: -10, ione: -70 }),
    traits: { ambicioso: 15, cobarde: 20, honorable: -25 },
    weight: (c) => (flags().elias_custodio || c.seats < 3 ? 0 : 8),
    apply: () => {
      flags().elias_custodio = true;
      for (const c of CONTINENT_IDS) if (!G.run.continents[c]?.corrupted) addCorruption(c, 'intriga', 25, 'Custodio del Concilio');
      res.add('influence', 50);
      res.add('alert', -30);
      bus.emit('story:beat', { id: 'elias_custodio' });
      void narrate({ third: 'Le dieron el prendedor de olivo. Él lo sostuvo como se sostiene una llave.', first: 'Me dieron el prendedor de olivo. Lo sostuve como se sostiene una llave.' });
    },
    applyFail: () => { res.add('influence', -10); res.add('alert', 5); },
  },
  censo_magico: {
    id: 'censo_magico', icon: '✎',
    title: s('Censo de Magia'),
    desc: s('Todo mago, bruja o criatura que lance un hechizo deberá registrarse en Concordia. Con nombre. Y apellido.'),
    passText: s(['Dominar Mente se detecta con más facilidad (10 lunas)', 'Alerta +5']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 25, sylvaria: 15, kharaz: 20, morvenna: -50, islas: -5, ione: 10 }),
    traits: { paranoico: 25, sabio: -10, curioso: -10, supersticioso: 10 },
    weight: (c) => (until('magic_census_until') ? 0 : 0.8 + (c.stats.minds_dominated ?? 0) * 0.3),
    apply: () => { flags().magic_census_until = l() + 10; res.add('alert', 5); },
  },
  paz_perpetua: {
    id: 'paz_perpetua', icon: '☮',
    title: s('Tratado de Paz Perpetua'),
    desc: s('Que ningún continente levante la espada contra otro. Nunca. (Nadie define «nunca».)'),
    passText: s(['Lealtad +10 en todos los lugares que no controlas']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 10, sylvaria: 20, kharaz: -10, morvenna: 5, islas: 10, ione: 45 }),
    traits: { piadoso: 20, cruel: -20, ambicioso: -15, cobarde: 15 },
    weight: () => (until('peace_until') ? 0 : 1),
    apply: () => {
      flags().peace_until = l() + 6;
      for (const loc of Object.values(G.run.locations)) if (loc.control !== 'excepcion') loc.loyalty = Math.min(100, loc.loyalty + 10);
    },
  },
  impuesto_guerra: {
    id: 'impuesto_guerra', icon: '⛨',
    title: s('Impuesto de Guerra'),
    desc: s('Cada moneda del mundo pagará un poco de acero concordiano.'),
    passText: s(['Guarniciones reforzadas durante 8 lunas', 'Prosperidad −5 en todo el mundo']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 30, sylvaria: 5, kharaz: -20, morvenna: -5, islas: -30, ione: 10 }),
    traits: { codicioso: -25, valiente: 10, ambicioso: 10 },
    weight: (c) => (until('war_tax_until') ? 0 : c.alert / 30 + c.corrupted),
    apply: () => {
      flags().war_tax_until = l() + 8;
      for (const loc of Object.values(G.run.locations)) if (loc.control !== 'excepcion') loc.prosperity = Math.max(0, loc.prosperity - 5);
    },
  },
  auditoria_banca: {
    id: 'auditoria_banca', icon: '⚜',
    title: s('Auditoría de La Banca de las Mil Suertes'),
    desc: s('Revisar los libros de Don Tiburcio. Todos. Incluso los que tiene escondidos debajo del sombrero.'),
    passText: s(['Préstamos congelados 4 lunas: sin intereses, sin préstamos nuevos']),
    eliasWants: () => (totalDebt() > 300 ? 'si' : 'no'),
    ideology: () => ({ valdoria: 15, sylvaria: 20, kharaz: 10, morvenna: 5, islas: -60, ione: 10 }),
    traits: { codicioso: -20, honorable: 15, jugador: -10 },
    weight: (c) => (soc().bank.frozenUntil > c.luna ? 0 : 0.6 + (c.debt > 0 ? 1.2 : 0)),
    apply: () => { soc().bank.frozenUntil = l() + 4; },
  },
  cerrar_sedas: {
    id: 'cerrar_sedas', icon: '✉',
    title: s('Clausurar la Casa de las Sedas'),
    desc: s('Los secretos son un peligro para la paz. Sobre todo los secretos de los delegados.'),
    passText: s(['Los Secretos cuestan el doble durante 6 lunas', 'La Casa de las Sedas te aprecia más (odian al Concilio)']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 10, sylvaria: 25, kharaz: 15, morvenna: -10, islas: -20, ione: 15 }),
    traits: { paranoico: 25, curioso: -15, honorable: 10 },
    weight: (c) => (until('sedas_closed_until') ? 0 : 0.5 + (c.stats.blackmails ?? 0) * 0.6),
    apply: () => { flags().sedas_closed_until = l() + 6; changeRep('sedas', 5); },
  },
  no_persona: {
    id: 'no_persona', icon: '✕',
    title: s('Declarar a Elias Veyr «No-Persona»'),
    desc: s('Prohibir su nombre en los cinco continentes. Lo que no se nombra, no existe. (Eso dicen.)'),
    passText: s(['Reputación −8 en todos los continentes', 'Alerta +5']),
    eliasWants: () => 'no',
    ideology: () => ({ valdoria: 20, sylvaria: 30, kharaz: 0, morvenna: -15, islas: -10, ione: 5 }),
    traits: { supersticioso: 20, sabio: -15, orgulloso: 10 },
    weight: (c) => (flags().no_persona ? 0 : c.title >= 2 ? 1.5 : 0.3),
    apply: () => {
      flags().no_persona = true;
      for (const c of CONTINENT_IDS) changeRep(c, -8);
      res.add('alert', 5);
      void narrate({ third: 'Prohibieron su nombre. El nombre se rió.', first: 'Prohibieron mi nombre. Mi nombre se rió.' });
    },
  },
};

export function agendaCtx(): AgendaCtx {
  return {
    corrupted: corruptedContinents().length, alert: G.run.player.alert, seats: seatsHeld().length, luna: luna(),
    stats: G.run.stats, debt: totalDebt(), title: G.run.player.titleIndex,
  };
}

export function resolutionTitle(id: string, p: Params = {}): string { const r = RESOLUTIONS[id]; return r ? r.title(p) : id; }
