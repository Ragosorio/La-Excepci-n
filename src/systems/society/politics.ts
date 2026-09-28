/**
 * El Concilio de los Cinco (GDD §4.7, research §7.3). A session every 4 lunas (announced 1 luna before).
 * Five delegates + the Custodia Ione (tie-breaker). Each delegate's lean toward Elias comes from the resolution's
 * ideology, their traits, their feelings, their continent's corruption and Elias's reputation; corrupted continents
 * give Elias their seat. In-session tools push the lean; secret-ballot randomness decides the undecided.
 */
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { addNews } from '../../core/news';
import { track } from '../../core/tracker';
import { engine } from '../../core/engine';
import { Rng, rng } from '../../core/rng';
import { h } from '../../ui/dom';
import { modal } from '../../ui/widgets';
import { dialogue } from '../../ui/dialogue';
import { toast } from '../../ui/toasts';
import { audio } from '../../audio';
import { CONTINENTS, CONTINENT_IDS, LOCATIONS } from '../../data/world';
import type { ContinentId, TraitId } from '../../data/types';
import { randomName } from '../../data/names';
import { applyDeed } from './deeds';
import { changeRep, repValue } from './factions';
import { feel, killNpc, npcState, npcView, remember } from './memory';
import { RESOLUTIONS, agendaCtx, resolutionTitle } from './resolutions';
import { contName, corruptedContinents, knowsAbility, luna, presence, seatsHeld, soc, veloActive } from './state';
import type { SessionResult, SessionState } from './types';

export type Tool = 'dominar' | 'sobornar' | 'chantajear' | 'intimidar' | 'favor' | 'discurso' | 'asesinar';
export const TOOLS: Tool[] = ['dominar', 'sobornar', 'chantajear', 'intimidar', 'favor', 'discurso', 'asesinar'];
export const TOOL_NAMES: Record<Tool, string> = {
  dominar: 'Dominar Mente', sobornar: 'Sobornar', chantajear: 'Chantajear', intimidar: 'Intimidar', favor: 'Cobrar un favor', discurso: 'Discurso', asesinar: 'Asesinar',
};

// ───────────────────────────── delegates ─────────────────────────────

export interface DelegateInfo { id: string; continent: ContinentId; name: string; title?: string; seat: boolean; empty: boolean; bought: boolean; loyal: boolean }

function createReplacement(c: ContinentId): string {
  const s = soc();
  s.council.replacements ??= {};
  const n = Object.keys(s.council.replacements).length + 1;
  const id = `del_${c}_${n}`;
  const r = new Rng(`${G.run.seed}:delegate:${id}`);
  const race = r.pick(CONTINENTS[c].races);
  const gender: 'f' | 'm' = r.chance(0.5) ? 'f' : 'm';
  let name = 'Oren';
  try { name = randomName(race, gender, r) || name; } catch { /* content WIP */ }
  const pool: TraitId[] = ['cobarde', 'codicioso', 'ambicioso', 'paranoico', 'leal', 'honorable', 'curioso', 'supersticioso'];
  G.run.npcs[id] = {
    id, alive: true, location: 'concordia', feelings: { miedo: 25, odio: 10, deuda: 0, respeto: 0 }, memories: [], met: false,
    generated: { name, race, job: 'delegado', level: 1, titleText: `${gender === 'f' ? 'Delegada' : 'Delegado'} de ${contName(c)}`, traits: r.pickN(pool, 2), scars: 0, seed: id },
  };
  s.council.replacements[id] = { continent: c, gender };
  s.council.delegates[c] = id;
  return id;
}

export function delegateId(c: ContinentId): string {
  const cc = soc().council;
  const emptyNow = cc.emptySeat[c] === cc.count;   // killed this session: the body stays in the chair until it ends
  const rep = cc.delegates[c];
  if (rep && (G.run.npcs[rep]?.alive || emptyNow)) return rep;
  const base = CONTINENTS[c]?.delegate;
  if (base && ((npcState(base)?.alive ?? false) || (emptyNow && !rep))) return base;
  const id = createReplacement(c);
  addNews(`${contName(c)} envió a ${npcView(id)?.name ?? 'un nuevo delegado'} a ocupar su silla en el Concilio. Dicen que duerme con la puerta atrancada.`, 'concilio');
  return id;
}

export function delegates(): DelegateInfo[] {
  const s = soc();
  const seats = seatsHeld();
  return CONTINENT_IDS.map((c) => {
    const id = delegateId(c);
    const v = npcView(id);
    return {
      id, continent: c, name: v?.name ?? id, title: v?.title, seat: seats.includes(c),
      empty: s.council.emptySeat[c] === s.council.count, bought: s.council.boughtVotes[id] === s.council.count,
      loyal: !!G.run.npcs[id]?.loyal,
    };
  });
}

/** How much this delegate wants to side with Elias (−100..100), before the resolution itself. */
export function proElias(id: string, c: ContinentId | null): number {
  const st = npcState(id);
  if (!st) return 0;
  if (c && G.run.continents[c]?.corrupted) return 100;
  let v = c ? -15 : -35;
  if (st.loyal) v += 90;
  const f = st.feelings;
  v += f.respeto * 0.35 + f.deuda * 0.45 + f.miedo * 0.3 - f.odio * 0.6;
  if (c) { v += (G.run.continents[c]?.corruption ?? 0) * 0.45; v += repValue(c) * 0.3; }
  v += repValue('concilio') * (c ? 0.1 : 0.3);
  return Math.max(-100, Math.min(100, v));
}

// ───────────────────────────── sessions ─────────────────────────────

export function paramsFor(session: SessionState, resId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(session.params)) if (k.startsWith(resId + ':')) out[k.slice(resId.length + 1)] = v;
  return out;
}

function recentlyVoted(id: string): boolean {
  return soc().council.history.some((x) => x.id === id && luna() - x.luna < 8);
}

export function pickAgenda(n: number): string[] {
  const ctx = agendaCtx();
  const c = soc().council;
  const out: string[] = [];
  for (const q of c.queued) if (RESOLUTIONS[q] && !out.includes(q) && RESOLUTIONS[q].weight(ctx) > 0) out.push(q);
  c.queued = [];
  const pool = Object.values(RESOLUTIONS).filter((r) => !out.includes(r.id) && (r.requiresSeats ?? 0) <= ctx.seats && r.weight(ctx) > 0 && !recentlyVoted(r.id));
  while (out.length < n && pool.length) {
    const r = rng.weighted(pool, (x) => x.weight(ctx));
    out.push(r.id);
    pool.splice(pool.indexOf(r), 1);
  }
  if (!out.length) out.push('paz_perpetua');
  return out.slice(0, 3);
}

export function createSession(lunaDue: number, opts: { emergency?: boolean; forced?: string[] } = {}): SessionState {
  const corrupted = corruptedContinents().length;
  const n = opts.emergency ? 2 : Math.max(1, Math.min(3, 1 + (luna() > 10 ? 1 : 0) + (corrupted >= 2 ? 1 : 0)));
  const ids = opts.forced?.length ? [...opts.forced] : pickAgenda(n);
  const params: Record<string, string> = {};
  for (const id of ids) {
    const p = RESOLUTIONS[id]?.params?.() ?? {};
    for (const [k, v] of Object.entries(p)) params[`${id}:${k}`] = v;
  }
  return { id: `ses_${luna()}_${Math.floor(Math.random() * 1e5)}`, luna: lunaDue, resolutions: ids, params, emergency: opts.emergency, status: 'announced', results: [] };
}

function agendaText(sess: SessionState): string {
  return sess.resolutions.map((id) => `«${resolutionTitle(id, paramsFor(sess, id))}»`).join(', ');
}

function announce(sess: SessionState): void {
  const txt = agendaText(sess);
  addNews(sess.emergency
    ? `Sesión de emergencia: el Concilio de los Cinco se reúne con la próxima luna. En la mesa: ${txt}.`
    : `El Concilio de los Cinco sesionará con la próxima luna. En la mesa: ${txt}.`, 'concilio', true);
  toast(`<b>${sess.emergency ? 'Sesión de emergencia' : 'El Concilio sesiona en 1 luna'}</b><br>${txt}`, { kind: 'info', duration: 5.5 });
  audio.sfx('bell', { volume: 0.5 });
  bus.emit('concilio:announce', { lunaDue: sess.luna, resolutions: [...sess.resolutions] });
}

/** Per-luna: announce, open, and (if ignored too long) auto-resolve sessions. */
export function politicsLunaTick(): void {
  const c = soc().council;
  const l = luna();
  if (!c.session && l >= c.next - 1) {
    c.session = createSession(c.next);
    announce(c.session);
  }
  const sess = c.session;
  if (!sess) return;
  if (sess.status === 'announced' && l >= sess.luna) {
    sess.status = 'pending';
    c.next = sess.luna + 4;
    bus.emit('concilio:session', { lunaDue: sess.luna, resolutions: [...sess.resolutions] });
    requestPresent();
  } else if ((sess.status === 'pending' || sess.status === 'inprogress') && l >= sess.luna + 2 && engine.sceneId !== 'council') {
    toast('El Concilio se cansó de esperarte y votó sin ti.', { kind: 'bad' });
    autoResolve(sess);
  } else if (sess.status === 'pending') {
    tryPresent();
  }
}

/** First fall → emergency session next luna; later falls push the Gran Alianza onto the agenda. */
export function onContinentCorrupted(): void {
  const c = soc().council;
  if (!c.emergencyDone) {
    c.emergencyDone = true;
    const forced = ['llamar_campeon', 'sanciones'].filter((id) => RESOLUTIONS[id].weight(agendaCtx()) > 0 || id === 'llamar_campeon');
    const sess = c.session;
    if (sess && sess.status === 'announced') {
      // fold the emergency into the session already announced, and bring it forward
      sess.resolutions = [...new Set([...forced, ...sess.resolutions])].slice(0, 3);
      sess.emergency = true;
      sess.luna = Math.min(sess.luna, luna() + 1);
      announce(sess);
      return;
    }
    if (sess) { for (const id of forced) if (!c.queued.includes(id)) c.queued.push(id); return; }
    c.session = createSession(luna() + 1, { emergency: true, forced });
    c.next = Math.max(c.next, luna() + 5);
    announce(c.session);
  } else if (!c.queued.includes('gran_alianza')) c.queued.push('gran_alianza');
}

let presenting = false;
let wantPresent = false;

export function requestPresent(): void {
  wantPresent = true;
  tryPresent();
}

/** Called on scene enter / luna: shows the invitation when the player is on the world map. */
export function tryPresent(): void {
  const sess = soc().council.session;
  if (!wantPresent || presenting || !sess || sess.status !== 'pending') return;
  if (engine.sceneId !== 'overworld' || dialogue.open || document.querySelector('.lx-modal-back')) return;
  void presentSession();
}

async function presentSession(): Promise<void> {
  const sess = soc().council.session;
  if (!sess || presenting) return;
  presenting = true;
  wantPresent = false;
  audio.stinger('council_open');
  const seats = seatsHeld();
  const bought = delegates().filter((d) => d.bought).length;
  const cards = sess.resolutions.map((id) => {
    const r = RESOLUTIONS[id];
    const p = paramsFor(sess, id);
    const want = r.eliasWants(p);
    return h('div', { class: 'pol-invite-card' },
      h('div', { class: 'pol-invite-icon' }, r.icon),
      h('div', { class: 'pol-invite-txt' },
        h('div', { class: 'pol-invite-title' }, r.title(p)),
        h('div', { class: 'pol-invite-desc' }, r.desc(p)),
        h('div', { class: `pol-want ${want}` }, want === 'si' ? 'Te conviene que PASE' : 'Te conviene que FRACASE')));
  });
  const body = h('div', { class: 'pol-invite' },
    h('div', { class: 'pol-invite-lead' }, sess.emergency ? 'Sesión de emergencia en Concordia. Los cinco delegados ya ocupan sus sillas.' : 'Cinco sillas de mármol, una mesa redonda y una Custodia que no duerme.'),
    ...cards,
    h('div', { class: 'pol-invite-foot' },
      seats.length ? h('span', { class: 'lx-chip' }, `♛ ${seats.length} ${seats.length === 1 ? 'asiento tuyo' : 'asientos tuyos'}`) : null,
      bought ? h('span', { class: 'lx-chip' }, `💰 ${bought} ${bought === 1 ? 'voto comprado' : 'votos comprados'}`) : null,
      h('span', { class: 'lx-muted lx-small' }, 'Si no asistes, votarán según sus posturas actuales.')));
  const v = await modal({ title: sess.emergency ? 'Sesión de emergencia del Concilio' : 'El Concilio de los Cinco sesiona', body, wide: true, dismissable: false, className: 'pol-invite-modal',
    actions: [{ label: 'Ignorar', value: 'ignore', kind: 'ghost' }, { label: 'Asistir', value: 'attend', kind: 'primary' }] });
  presenting = false;
  if (v === 'attend') attendCouncil();
  else autoResolve(sess);
}

/** Go to the council scene for the pending session (also callable from Concordia's location menu). */
export function attendCouncil(): boolean {
  const sess = soc().council.session;
  if (!sess || (sess.status !== 'pending' && sess.status !== 'inprogress')) return false;
  sess.status = 'inprogress';
  const back = engine.sceneId && engine.sceneId !== 'council' ? engine.sceneId : 'overworld';
  void engine.goto('council', { sessionId: sess.id, returnTo: back }, { fade: 0.7, card: { title: 'El Concilio de los Cinco', subtitle: sess.emergency ? 'Sesión de emergencia' : 'Concordia', hold: 1.5 } });
  return true;
}

export function councilStatus(): { next: number; lunasLeft: number; session: SessionState | null; agenda: string[] } {
  const c = soc().council;
  const sess = c.session;
  const next = sess ? sess.luna : c.next;
  return { next, lunasLeft: Math.max(0, next - luna()), session: sess, agenda: sess ? sess.resolutions.map((id) => resolutionTitle(id, paramsFor(sess, id))) : [] };
}

// ───────────────────────────── runtime (voting) ─────────────────────────────

export interface CouncilRuntime {
  session: SessionState;
  index: number;
  mods: Record<string, number>;
  sessionMods: Record<string, number>;
  used: Record<string, Tool[]>;
  sessionUsed: Record<string, Tool[]>;
  manaUses: number;
  assassinated: boolean;
  speech: boolean;
  debug: boolean;
}

export function startRuntime(session: SessionState, debug = false): CouncilRuntime {
  return { session, index: session.results.length, mods: {}, sessionMods: {}, used: {}, sessionUsed: {}, manaUses: 0, assassinated: false, speech: false, debug };
}

export function currentRes(rt: CouncilRuntime): string | null { return rt.session.resolutions[rt.index] ?? null; }

function yesInclination(resId: string, params: Record<string, string>, id: string, c: ContinentId | null): number {
  const r = RESOLUTIONS[resId];
  const ideo = r.ideology(params)[c ?? 'ione'] ?? 0;
  let t = 0;
  for (const tr of npcView(id)?.traits ?? []) t += r.traits?.[tr] ?? 0;
  return ideo + t;
}

export interface Lean { id: string; continent: ContinentId | null; lean: number; p: number; seat: boolean; empty: boolean; bought: boolean }

export function leanOf(rt: CouncilRuntime, id: string, c: ContinentId | null): Lean {
  const s = soc();
  const resId = currentRes(rt);
  const seat = !!c && seatsHeld().includes(c);
  const empty = !!c && s.council.emptySeat[c] === s.council.count;
  const bought = s.council.boughtVotes[id] === s.council.count;
  if (!resId) return { id, continent: c, lean: 0, p: 0.5, seat, empty, bought };
  if (seat || bought) return { id, continent: c, lean: 100, p: 1, seat, empty: false, bought };
  if (empty) return { id, continent: c, lean: 0, p: 0.5, seat, empty, bought };
  const params = paramsFor(rt.session, resId);
  const wants = RESOLUTIONS[resId].eliasWants(params);
  const yes = yesInclination(resId, params, id, c);
  let lean = (wants === 'si' ? yes : -yes) + proElias(id, c) * 0.8 + (rt.sessionMods[id] ?? 0) + (rt.mods[id] ?? 0);
  lean = Math.max(-100, Math.min(100, lean));
  return { id, continent: c, lean, p: 1 / (1 + Math.exp(-lean / 15)), seat, empty, bought };
}

export function allLeans(rt: CouncilRuntime): { delegates: Lean[]; ione: Lean } {
  return { delegates: CONTINENT_IDS.map((c) => leanOf(rt, delegateId(c), c)), ione: leanOf(rt, 'ione', null) };
}

/** Expected result: Elias's chance to get what he wants (enumerates all ballots). */
export function forecast(rt: CouncilRuntime): { pWin: number; expectedFor: number; expectedAgainst: number } {
  const { delegates: ds, ione } = allLeans(rt);
  const voters = ds.filter((d) => !d.empty);
  const n = voters.length;
  let pWin = 0, ef = 0;
  for (const v of voters) ef += v.p;
  for (let mask = 0; mask < 1 << n; mask++) {
    let p = 1, forE = 0;
    for (let i = 0; i < n; i++) {
      const yes = (mask >> i) & 1;
      p *= yes ? voters[i].p : 1 - voters[i].p;
      forE += yes;
    }
    const against = n - forE;
    if (forE > against) pWin += p;
    else if (forE === against) pWin += p * ione.p;
  }
  return { pWin, expectedFor: ef, expectedAgainst: n - ef };
}

// ───────────────────────────── tools ─────────────────────────────

export interface ToolInfo { available: boolean; cost: string; reason?: string; risk?: number }

function traitsOf(id: string): TraitId[] { return npcView(id)?.traits ?? []; }

export function bribeCost(id: string): number {
  const t = traitsOf(id);
  let m = 1;
  if (t.includes('codicioso')) m *= 0.5;
  if (t.includes('honorable')) m *= 2.2;
  if (t.includes('leal')) m *= 1.4;
  if (t.includes('orgulloso')) m *= 1.3;
  if (t.includes('piadoso')) m *= 1.4;
  if (G.run.npcs[id]?.loyal) m *= 0.5;
  return Math.round(140 * (1 + 0.15 * soc().council.count) * m / 5) * 5;
}

function dominateRisk(id: string): number {
  if (veloActive()) return 0;
  const t = traitsOf(id);
  let r = id === 'ione' ? 0.6 : 0.3;
  if (Number(G.run.flags.magic_census_until ?? -1) > luna()) r += 0.15;
  if (t.includes('paranoico')) r += 0.1;
  if (t.includes('sabio')) r += 0.1;
  return Math.min(0.9, r);
}
function dominateMana(rt: CouncilRuntime): number { return 25 + rt.manaUses * 10; }
const ASSASSIN_COST = 300;
const FAVOR_COST = 15;
const SPEECH_COST = 10;

export function toolInfo(rt: CouncilRuntime, tool: Tool, id: string, c: ContinentId | null): ToolInfo {
  const s = soc();
  const p = G.run.player;
  const seat = !!c && seatsHeld().includes(c);
  const empty = !!c && s.council.emptySeat[c] === s.council.count;
  const used = rt.used[id] ?? [];
  const sUsed = rt.sessionUsed[id] ?? [];
  if (!currentRes(rt)) return { available: false, cost: '', reason: 'No hay votación en curso' };
  if (tool !== 'discurso' && (seat || empty)) return { available: false, cost: '', reason: seat ? 'Este asiento ya es tuyo' : 'El asiento está vacío' };
  switch (tool) {
    case 'dominar': {
      const mana = dominateMana(rt);
      if (!knowsAbility('dominar_mente') && !rt.debug) return { available: false, cost: `${mana} maná`, reason: 'Aún no copias Dominar Mente' };
      if (sUsed.includes('dominar')) return { available: false, cost: `${mana} maná`, reason: 'Ya está bajo tu control esta sesión' };
      if (p.mana < mana) return { available: false, cost: `${mana} maná`, reason: 'No tienes maná suficiente' };
      return { available: true, cost: `${mana} maná`, risk: dominateRisk(id) };
    }
    case 'sobornar': {
      if (id === 'ione') return { available: false, cost: '—', reason: 'La Custodia no tiene precio. Eso dice.' };
      const cost = bribeCost(id);
      if (used.includes('sobornar')) return { available: false, cost: `${cost} oro`, reason: 'Ya aceptó (o rechazó) tu oro en esta votación' };
      if (p.gold < cost) return { available: false, cost: `${cost} oro`, reason: 'No tienes oro suficiente' };
      return { available: true, cost: `${cost} oro` };
    }
    case 'chantajear': {
      const specific = (s.secretsOn[id] ?? 0) > 0;
      if (sUsed.includes('chantajear')) return { available: false, cost: '1 Secreto', reason: 'Ya lo chantajeaste esta sesión' };
      if (p.secrets < 1) return { available: false, cost: '1 Secreto', reason: 'No tienes Secretos (Casa de las Sedas)' };
      return { available: true, cost: specific ? '1 Secreto (tienes uno suyo)' : '1 Secreto' };
    }
    case 'intimidar':
      if (used.includes('intimidar')) return { available: false, cost: 'Alerta +3', reason: 'Ya lo intimidaste en esta votación' };
      return { available: true, cost: 'Alerta +3' };
    case 'favor':
      if (used.includes('favor')) return { available: false, cost: `${FAVOR_COST} influencia`, reason: 'Ya cobraste ese favor' };
      if (p.influence < FAVOR_COST) return { available: false, cost: `${FAVOR_COST} influencia`, reason: 'No tienes influencia suficiente' };
      return { available: true, cost: `${FAVOR_COST} influencia` };
    case 'discurso':
      if (!seatsHeld().length && !rt.debug) return { available: false, cost: `${SPEECH_COST} influencia`, reason: 'Necesitas un asiento (corrompe un continente)' };
      if (rt.speech) return { available: false, cost: `${SPEECH_COST} influencia`, reason: 'Ya hablaste en esta votación' };
      if (p.influence < SPEECH_COST) return { available: false, cost: `${SPEECH_COST} influencia`, reason: 'No tienes influencia suficiente' };
      return { available: true, cost: `${SPEECH_COST} influencia` };
    case 'asesinar':
      if (id === 'ione') return { available: false, cost: '—', reason: 'Matar a la Custodia sería otra historia. Literalmente.' };
      if (rt.assassinated) return { available: false, cost: `${ASSASSIN_COST} oro`, reason: 'Un asesinato por sesión. Hasta la Ceniza tiene límites.' };
      if (p.gold < ASSASSIN_COST) return { available: false, cost: `${ASSASSIN_COST} oro`, reason: 'El Gremio de la Ceniza cobra por adelantado' };
      return { available: true, cost: `${ASSASSIN_COST} oro · Alerta +25`, risk: 1 };
  }
}

export interface ToolResult { ok: boolean; text: string; delta: number; detected?: boolean; refused?: boolean; mood?: 'mind' | 'smile' | 'angry' | 'scared' | 'dead' | 'sad' | 'surprised'; all?: boolean }

const mark = (rec: Record<string, Tool[]>, id: string, t: Tool) => { (rec[id] ??= []).push(t); };

export function useTool(rt: CouncilRuntime, tool: Tool, id: string, c: ContinentId | null): ToolResult {
  const info = toolInfo(rt, tool, id, c);
  if (!info.available) return { ok: false, text: info.reason ?? 'No es posible.', delta: 0 };
  const s = soc();
  const name = npcView(id)?.name ?? id;
  const t = traitsOf(id);
  switch (tool) {
    case 'dominar': {
      res.spend('mana', dominateMana(rt));
      rt.manaUses++;
      mark(rt.sessionUsed, id, 'dominar');
      rt.sessionMods[id] = (rt.sessionMods[id] ?? 0) + 85;
      remember(id, { kind: 'dominado', text: 'Me metiste en la cabeza en el Concilio', where: 'concordia', intensity: 8 });
      track('minds_dominated');
      track('council_dominations');
      audio.sfx('mind_control');
      const detected = rng.chance(info.risk ?? 0);
      if (detected) {
        s.council.lastDetected = luna();
        res.add('alert', 12);
        changeRep('concilio', -12);
        feel(id, { odio: 30 });
        if (!s.council.queued.includes('recompensa')) s.council.queued.push('recompensa');
        return { ok: true, delta: 85, detected: true, mood: 'mind', text: `${name} gira los ojos en espiral... y la Custodia lo nota. «¡Magia de mente en esta sala!» Alerta +12.` };
      }
      return { ok: true, delta: 85, mood: 'mind', text: `Los ojos de ${name} se vuelven espirales. Nadie más se da cuenta.` };
    }
    case 'sobornar': {
      const cost = bribeCost(id);
      mark(rt.used, id, 'sobornar');
      if (t.includes('honorable') && rng.chance(0.5)) {
        feel(id, { odio: 10 });
        res.add('alert', 3);
        rt.mods[id] = (rt.mods[id] ?? 0) - 10;
        audio.sfx('ui_error');
        return { ok: true, refused: true, delta: -10, mood: 'angry', text: `${name} empuja la bolsa de vuelta. «Mi voto no se vende.» Te mira con asco.` };
      }
      res.spend('gold', cost);
      const d = t.includes('codicioso') ? 45 : 30;
      rt.mods[id] = (rt.mods[id] ?? 0) + d;
      applyDeed({ kind: 'bribe', npcId: id, continent: c ?? undefined, silent: true, noNews: true, magnitude: cost / 150 });
      track('council_bribes');
      track('bribes');
      audio.sfx('coins_many');
      return { ok: true, delta: d, mood: 'smile', text: t.includes('codicioso') ? `${name} guarda la bolsa sin contarla. Ya la contó con los ojos.` : `${name} acepta el oro. No te mira a la cara.` };
    }
    case 'chantajear': {
      res.spend('secrets', 1);
      mark(rt.sessionUsed, id, 'chantajear');
      const specific = (s.secretsOn[id] ?? 0) > 0;
      if (specific) s.secretsOn[id]--;
      let d = specific ? 70 : 40;
      if (t.includes('honorable')) d = Math.round(d * 0.8);
      rt.sessionMods[id] = (rt.sessionMods[id] ?? 0) + d;
      applyDeed({ kind: 'blackmail', npcId: id, continent: c ?? undefined, silent: true, noNews: true });
      const secret = specific ? (s.secretTexts[id] ?? []).pop() : undefined;
      audio.sfx('whisper');
      return { ok: true, delta: d, mood: 'scared', text: secret ? `Le deslizas una nota: «${secret}». ${name} palidece.` : `Le susurras algo al oído a ${name}. Suficiente para que tiemble.` };
    }
    case 'intimidar': {
      mark(rt.used, id, 'intimidar');
      const st = npcState(id);
      let d = Math.max(10, Math.min(55, 10 + (st?.feelings.miedo ?? 0) * 0.5 + presence() * 2 + (c ? avgFear(c) * 0.2 : 0)));
      res.add('alert', 3);
      if (t.includes('valiente')) {
        d *= 0.3;
        feel(id, { odio: 10 });
        rt.mods[id] = (rt.mods[id] ?? 0) + d;
        return { ok: true, delta: Math.round(d), mood: 'angry', text: `${name} sostiene tu mirada. «He visto cosas peores que tú.»` };
      }
      if (t.includes('honorable')) d *= 0.7;
      rt.mods[id] = (rt.mods[id] ?? 0) + d;
      feel(id, { miedo: 12, odio: 6 });
      remember(id, { kind: 'amenazado', text: 'Me amenazaste en pleno Concilio', where: 'concordia', intensity: 6 });
      audio.sfx('heartbeat');
      return { ok: true, delta: Math.round(d), mood: 'scared', text: `Solo sonríes. A ${name} se le cae la pluma.` };
    }
    case 'favor': {
      res.spend('influence', FAVOR_COST);
      mark(rt.used, id, 'favor');
      rt.mods[id] = (rt.mods[id] ?? 0) + 20;
      audio.sfx('ui_confirm');
      return { ok: true, delta: 20, mood: 'surprised', text: `Le recuerdas a ${name} un favor que no sabía que te debía.` };
    }
    case 'discurso': {
      res.spend('influence', SPEECH_COST);
      rt.speech = true;
      const base = Math.min(35, 8 + presence() * 1.5 + seatsHeld().length * 5);
      for (const dc of CONTINENT_IDS) {
        const did = delegateId(dc);
        const dt = traitsOf(did);
        const k = dt.includes('honorable') || dt.includes('orgulloso') ? 0.7 : dt.includes('cobarde') ? 1.3 : 1;
        rt.mods[did] = (rt.mods[did] ?? 0) + base * k;
      }
      rt.mods.ione = (rt.mods.ione ?? 0) + base * 0.5;
      track('council_speeches');
      audio.sfx('horn_war', { volume: 0.4 });
      return { ok: true, delta: Math.round(base), all: true, text: `Te pones de pie. La sala entera guarda silencio mientras hablas. (+${Math.round(base)} a todos)` };
    }
    case 'asesinar': {
      res.spend('gold', ASSASSIN_COST);
      rt.assassinated = true;
      if (c) s.council.emptySeat[c] = s.council.count;
      applyDeed({ kind: 'assassinate', npcId: id, continent: c ?? undefined, noNews: true });
      res.add('alert', 13); // + the deed's own ≈12 → Alerta +25 (GDD)
      changeRep('concilio', -20);
      killNpc(id, 'asesinato');
      if (c) s.council.delegates[c] = id;
      addNews(`${name} murió en su silla del Concilio. Nadie vio nada. Todos vieron algo violeta.`, 'concilio', true);
      track('council_assassinations');
      track('assassinations');
      audio.sfx('death_pop');
      return { ok: true, delta: 0, mood: 'dead', text: `Una sombra detrás de la silla de ${name}. Un golpe seco. El asiento de ${contName(c)} queda vacío.` };
    }
  }
}

function avgFear(c: ContinentId): number {
  const locs = Object.values(G.run.locations).filter((l) => LOCATIONS[l.id]?.continent === c && l.control !== 'excepcion');
  if (!locs.length) return 0;
  return locs.reduce((s, l) => s + l.fear, 0) / locs.length;
}

// ───────────────────────────── votes ─────────────────────────────

export interface Ballot { id: string; continent: ContinentId | null; vote: 'si' | 'no' | 'abst'; forElias: boolean; lean: number; certainty: number }

/** Casts every ballot for the current resolution (seats & bought votes first, the undecided last). */
export function castVotes(rt: CouncilRuntime, r: Rng = rng): { result: SessionResult; ballots: Ballot[]; tie: Ballot | null } {
  const resId = currentRes(rt)!;
  const params = paramsFor(rt.session, resId);
  const wants = RESOLUTIONS[resId].eliasWants(params);
  const { delegates: ds, ione } = allLeans(rt);
  const ballots: Ballot[] = ds.map((d) => {
    if (d.empty) return { id: d.id, continent: d.continent, vote: 'abst', forElias: false, lean: 0, certainty: -1 };
    const forElias = Math.abs(d.lean) >= 35 || d.seat || d.bought ? d.lean > 0 : r.next() < d.p;
    const vote: 'si' | 'no' = forElias ? wants : wants === 'si' ? 'no' : 'si';
    return { id: d.id, continent: d.continent, vote, forElias, lean: d.lean, certainty: d.seat || d.bought ? 200 : Math.abs(d.lean) };
  });
  ballots.sort((a, b) => b.certainty - a.certainty);
  let yes = ballots.filter((b) => b.vote === 'si').length;
  let no = ballots.filter((b) => b.vote === 'no').length;
  let tie: Ballot | null = null;
  if (yes === no) {
    const forElias = Math.abs(ione.lean) >= 20 ? ione.lean > 0 : r.next() < ione.p;
    const vote: 'si' | 'no' = forElias ? wants : wants === 'si' ? 'no' : 'si';
    tie = { id: 'ione', continent: null, vote, forElias, lean: ione.lean, certainty: Math.abs(ione.lean) };
    if (vote === 'si') yes++; else no++;
  }
  const passed = yes > no;
  const eliasWon = (passed && wants === 'si') || (!passed && wants === 'no');
  const votes: Record<string, 'si' | 'no' | 'abst'> = {};
  for (const b of ballots) votes[b.id] = b.vote;
  if (tie) votes.ione = tie.vote;
  return { result: { id: resId, passed, yes, no, eliasWon, votes }, ballots, tie };
}

/** Applies a voted resolution; advances the runtime. Returns the effect lines. */
export function finishResolution(rt: CouncilRuntime, result: SessionResult): string[] {
  const r = RESOLUTIONS[result.id];
  const params = paramsFor(rt.session, result.id);
  let lines: string[] = [];
  try {
    if (result.passed) { r.apply(params); lines = r.passText(params); }
    else { r.applyFail?.(params); lines = r.failText?.(params) ?? ['No pasa nada. Por ahora.']; }
  } catch (err) { console.warn('[society] resolution apply', err); }
  rt.session.results.push(result);
  const c = soc().council;
  c.history.push({ luna: luna(), id: result.id, passed: result.passed, eliasWon: result.eliasWon });
  if (c.history.length > 40) c.history.shift();
  if (result.eliasWon) { track('council_votes_won'); changeRep('concilio', -2); }
  else track('council_votes_lost');
  bus.emit('concilio:resolved', { resolution: result.id, passed: result.passed });
  addNews(`El Concilio ${result.passed ? 'aprobó' : 'rechazó'} «${r.title(params)}» (${result.yes}–${result.no}).`, 'concilio', result.eliasWon === false);
  rt.index++;
  rt.mods = {};
  rt.used = {};
  rt.speech = false;
  return lines;
}

export function finishSession(rt: CouncilRuntime): void {
  const c = soc().council;
  rt.session.status = 'resolved';
  c.count++;
  if (c.session?.id === rt.session.id) c.session = null;
  for (const [id, n] of Object.entries(c.boughtVotes)) if (n < c.count) delete c.boughtVotes[id];
  for (const [k, n] of Object.entries(c.emptySeat)) {
    if ((n ?? 0) >= c.count) continue;
    delete c.emptySeat[k as ContinentId];
    const dead = c.delegates[k as ContinentId];
    if (dead && !G.run.npcs[dead]?.alive) delete c.delegates[k as ContinentId];
  }
  track('council_sessions');
}

/** Session without Elias: votes follow current stances (bought votes and seats still count). */
export function autoResolve(sess: SessionState): void {
  const rt = startRuntime(sess);
  const lines: string[] = [];
  while (currentRes(rt)) {
    const { result } = castVotes(rt);
    finishResolution(rt, result);
    const r = RESOLUTIONS[result.id];
    lines.push(`«${r.title(paramsFor(sess, result.id))}» <b style="color:${result.eliasWon ? 'var(--good)' : 'var(--blood)'}">${result.passed ? 'APROBADA' : 'RECHAZADA'}</b> ${result.yes}–${result.no}`);
  }
  finishSession(rt);
  audio.sfx('gavel');
  toast(`<b>El Concilio votó sin ti</b><br>${lines.join('<br>')}`, { kind: 'info', duration: 7 });
}

// ───────────────────────────── outside the session ─────────────────────────────

/** Price to buy a delegate's vote for the next session (dialogue option). */
export function voteBuyCost(id: string): number { return Math.round(bribeCost(id) * 1.6 / 5) * 5; }

export function buyVote(id: string): boolean {
  const c = soc().council;
  const cost = voteBuyCost(id);
  if (!res.spend('gold', cost)) return false;
  c.boughtVotes[id] = c.count;
  track('votes_bought');
  return true;
}

export function isDelegate(id: string): ContinentId | null {
  for (const c of CONTINENT_IDS) if (delegateId(c) === id) return c;
  return null;
}
