/**
 * Map encounters (Mount & Blade style): when a party touches Elias (or he intercepts one), a modal offers
 * Hablar / Pelear / Huir / Sobornar / Velo (+ contextual: extorsionar, comprar reliquia, limosna, reclutar).
 * Aurel gets a dramatic dialogue instead of the modal.
 */
import type { BattleResult } from '../../battle/api';
import type { GoodId, JobId, Rarity } from '../../data/types';
import { LOCATIONS } from '../../data/world';
import { RELICS } from '../../data/relics';
import { UNITS } from '../../data/units';
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { track } from '../../core/tracker';
import { addNews, recentNews } from '../../core/news';
import { progressQuest } from '../../core/quests';
import { uid, rng } from '../../core/rng';
import { h, esc } from '../../ui/dom';
import { modal, button } from '../../ui/widgets';
import { toast, banner, cutin } from '../../ui/toasts';
import { dialogue, type DialogueLine } from '../../ui/dialogue';
import { portraitSVG, type PortraitSpec } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import { applyDeed, npcGreeting, portraitFor, openBank, totalDebt } from '../society/api';
import { knows } from '../progression/codex';
import { grantRelic } from '../progression/relics';
import { effective } from '../progression/stats';
import { W, factionName, PARTY_LABEL, type PartyState } from './state';
import { getParty, removeParty, partyGoal, goodName } from './parties';
import { eliasPower, odds, totalPower } from './forces';
import { launchBattle, partyBattle } from './battles';
import { goodBase } from './init';
import { aurelLine } from '../story/aurel';

export type EncounterOutcome = 'battle' | 'escaped' | 'left' | 'resolved';
export interface EncounterCtx { night: boolean; onWater: boolean; pushAway: (fromX: number, fromZ: number, dist: number) => void }

const KIND_JOB: Record<PartyState['kind'], JobId> = {
  caravana: 'mercader', patrulla: 'soldado', ejercito: 'capitan', cazadores: 'cazador', nemesis: 'guerrero', rival: 'ladron',
  refugiados: 'campesino', aurel: 'guardian', bandidos: 'pirata', alianza: 'guardian', cobradores: 'banquero',
};
const RELIC_PRICE: Record<Rarity, number> = { comun: 150, pococomun: 320, rara: 650, epica: 1300, legendaria: 2600, mitica: 6000 };
const HUNTERS = new Set(['cazadores', 'nemesis', 'aurel', 'alianza', 'cobradores']);

export function partyPortrait(p: PartyState, mood: PortraitSpec['mood'] = 'neutral'): PortraitSpec {
  if (p.kind === 'aurel') return { seed: 'aurel', race: 'humano', special: 'aurel', mood };
  if (p.npcId) { try { return portraitFor(p.npcId, mood); } catch { /* fall through */ } }
  const gen = p.npcId ? G.run.npcs[p.npcId]?.generated : undefined;
  return {
    seed: gen?.seed ?? `${p.id}:${p.seed}`, race: p.race, job: gen?.job ?? KIND_JOB[p.kind], mood,
    scar: !!gen && gen.scars > 0, hood: p.kind === 'rival' || p.kind === 'bandidos',
  };
}
const eliasPortrait = (mood: PortraitSpec['mood'] = 'smug'): PortraitSpec => ({ seed: 'elias', race: 'excepcion', special: 'elias', mood });

// ───────────────────────── odds & costs ─────────────────────────

export function fleeChance(p: PartyState, ctx: EncounterCtx): number {
  let c = 0.42 + (5.5 - p.speed) * 0.09 + (effective('velocidad') - 6) * 0.03 + (ctx.night ? 0.1 : 0) + (ctx.onWater ? 0.05 : 0);
  if (p.kind === 'aurel') c -= 0.3;
  if (p.kind === 'alianza') c += 0.15;
  return Math.max(0.08, Math.min(0.92, c));
}
export function veilChance(p: PartyState): number {
  const base = p.kind === 'aurel' ? 0.3 : p.kind === 'cazadores' ? 0.72 : 0.88;
  return Math.max(0.1, Math.min(0.97, base + (effective('magia') - 8) * 0.02));
}
export function bribeCost(p: PartyState): number {
  const greedy = p.faction === 'islas' || p.faction === 'banca' ? 0.6 : p.faction === 'kharaz' ? 0.8 : p.faction === 'concilio' ? 1.6 : 1;
  return Math.round((40 + p.strength * 6) * greedy * (1 + G.run.player.alert / 100));
}
function canBribe(p: PartyState): boolean { return (!HUNTERS.has(p.kind) || p.kind === 'cobradores') && p.kind !== 'refugiados' && p.kind !== 'rival'; }
function extortChance(p: PartyState): number {
  const ratio = totalPower() / Math.max(1, p.strength);
  return Math.max(0.1, Math.min(0.92, 0.25 + ratio * 0.18 + (effective('presencia') - 4) * 0.04 + G.run.player.titleIndex * 0.06));
}
function cargoValue(p: PartyState): number {
  let v = 0;
  for (const [g, q] of Object.entries(p.goods ?? {}) as Array<[GoodId, number]>) v += goodBase(g) * q;
  return Math.round(v);
}
const pctTxt = (v: number) => `${Math.round(v * 100)}%`;

// ───────────────────────── modal ─────────────────────────

interface Opt { id: string; label: string; tip: string; kind?: 'primary' | 'danger' | 'ghost'; disabled?: boolean; hotkey?: string }

function encounterBody(p: PartyState, opts: Opt[], pick: (id: string) => void, flavor: string): HTMLElement {
  const mine = totalPower();
  const theirs = Math.max(1, p.strength);
  const o = odds(mine, theirs);
  const max = Math.max(mine, theirs);
  const barRow = (label: string, v: number, color: string) => h('div', { class: 'ow-enc-bar' },
    h('span', { class: 'ow-enc-bar-l' }, label),
    h('div', { class: 'ow-enc-bar-track' }, h('div', { class: 'ow-enc-bar-fill', style: `width:${Math.round((v / max) * 100)}%;background:${color}` })),
    h('span', { class: 'ow-enc-bar-v' }, String(Math.round(v))));
  const goods = Object.entries(p.goods ?? {}).map(([g, q]) => `${q} de ${goodName(g as GoodId)}`).join(', ');
  return h('div', { class: 'ow-enc' },
    h('div', { class: 'ow-enc-head' },
      h('div', { class: 'ow-enc-portrait', html: portraitSVG(partyPortrait(p, HUNTERS.has(p.kind) ? 'determined' : 'neutral'), 150), style: `--fc:${p.color}` }),
      h('div', { class: 'ow-enc-info' },
        h('div', { class: 'ow-enc-name' }, p.name),
        h('div', { class: 'ow-enc-tags' },
          h('span', { class: 'ow-tag', style: `--c:${p.color}` }, factionName(p.faction)),
          h('span', { class: 'ow-tag' }, PARTY_LABEL[p.kind]),
          h('span', { class: 'ow-tag ghost' }, partyGoal(p))),
        goods ? h('div', { class: 'lx-small lx-muted' }, `Carga: ${goods}`) : null,
        p.relic ? h('div', { class: 'lx-small', style: 'color:var(--r-epica)' }, `Lleva: ${RELICS[p.relic]?.name ?? 'una reliquia'}`) : null,
        h('div', { class: 'ow-enc-flavor' }, flavor),
      )),
    h('div', { class: 'ow-enc-forces' },
      barRow('Tus fuerzas', mine, 'linear-gradient(90deg,#6a3bc0,#c7a2ff)'),
      barRow('Ellos', theirs, `linear-gradient(90deg,${p.color}aa,${p.color})`),
      h('div', { class: 'ow-enc-odds', style: `color:${o.color}` }, `Batalla: ${o.text}`)),
    h('div', { class: 'ow-enc-actions' }, opts.map((op) => button(op.label, () => pick(op.id), { kind: op.kind, disabled: op.disabled, tip: op.tip, hotkey: op.hotkey }))),
  );
}

function flavorFor(p: PartyState): string {
  const n = G.run.player.name;
  switch (p.kind) {
    case 'caravana': return rng.pick(['Los mercaderes se aferran a sus fardos.', 'Las mulas resoplan. Nadie quiere mirarte a los ojos.']);
    case 'patrulla': return effectiveHostileText(p) ? `Las lanzas bajan. Te reconocieron, ${n}.` : 'Los soldados te observan con desconfianza.';
    case 'ejercito': return 'Estandartes, tambores y demasiadas botas.';
    case 'cazadores': return 'Héroes a sueldo del Concilio. Traen cadenas bendecidas.';
    case 'nemesis': return 'Una cicatriz que tiene tu nombre.';
    case 'rival': return p.relic ? 'Guarda algo envuelto en trapos. Brilla.' : 'Mapas viejos, palas nuevas, prisa.';
    case 'refugiados': return 'Llevan lo que pudieron cargar. Los niños no lloran: están demasiado cansados.';
    case 'bandidos': return 'Cuchillos, risas y una fogata mal apagada.';
    case 'alianza': return 'Cinco estandartes. Una sola intención.';
    case 'cobradores': return 'Duendes con libretas, garrotes y sonrisas de dientes de oro. La Banca nunca olvida.';
    default: return '';
  }
}
function effectiveHostileText(p: PartyState): boolean { return p.hostile; }

function optionsFor(p: PartyState, ctx: EncounterCtx): Opt[] {
  const o: Opt[] = [];
  const hostile = p.hostile || HUNTERS.has(p.kind);
  o.push({ id: 'talk', label: 'Hablar', tip: 'Escuchar lo que tienen que decir.', kind: 'ghost', hotkey: '1' });
  if (p.kind === 'caravana') {
    o.push({ id: 'fight', label: 'Asaltar', tip: `Emboscada: batalla contra ${p.strength} de fuerza.<br><b>Botín:</b> carga (${cargoValue(p)} oro) y su bolsa.<br><span class="lx-bad">−Reputación, +Alerta, +Codicia</span>`, kind: 'danger', hotkey: '2' });
    const ec = extortChance(p);
    o.push({ id: 'extort', label: `Extorsionar (${pctTxt(ec)})`, tip: 'Que paguen "peaje" sin pelear. Si se niegan, habrá que decidir.<br><span class="lx-bad">+Terror</span>', hotkey: '3' });
  } else {
    o.push({ id: 'fight', label: p.kind === 'refugiados' ? 'Atacar' : 'Pelear', tip: `Batalla contra ${Math.round(p.strength)} de fuerza.`, kind: 'danger', hotkey: '2' });
  }
  if (hostile) {
    const fc = fleeChance(p, ctx);
    o.push({ id: 'flee', label: `Huir (${pctTxt(fc)})`, tip: 'Si fallas, te alcanzan y la pelea empieza en tu contra.', hotkey: '3' });
  }
  if (canBribe(p) && hostile) {
    const c = bribeCost(p);
    o.push({ id: 'bribe', label: `Sobornar (${c} oro)`, tip: `Te ignorarán ${factionName(p.faction)} por 2 lunas.`, disabled: !res.can('gold', c), hotkey: '4' });
  }
  if (hostile) {
    const known = safeKnows('velo');
    o.push({ id: 'veil', label: known ? `Velo (20 maná · ${pctTxt(veilChance(p))})` : 'Velo', tip: known ? 'Desapareces y pasas de largo.' : 'Necesitas copiar <b>Velo</b>.', disabled: !known || !res.can('mana', 20), hotkey: '5' });
  }
  if (p.kind === 'rival' && p.relic) {
    const r = RELICS[p.relic];
    const price = RELIC_PRICE[r?.rarity ?? 'rara'];
    o.push({ id: 'buyrelic', label: `Comprar ${r?.name ?? 'la reliquia'} (${price})`, tip: 'Todo tiene precio. Incluso esto.', kind: 'primary', disabled: !res.can('gold', price) });
  }
  if (p.kind === 'cobradores') o.push({ id: 'paydebt', label: 'Pagar a la Banca', tip: 'Abre la Banca para saldar tus préstamos. Sin deuda, se van silbando.', kind: 'primary', hotkey: '6' });
  if (p.kind === 'refugiados') {
    o.push({ id: 'alms', label: 'Dar limosna (30 oro)', tip: '+Reputación. El mundo recuerda.', disabled: !res.can('gold', 30) });
    o.push({ id: 'recruit', label: 'Reclutar desesperados', tip: 'Gente sin nada que perder. Se unen gratis.' });
  }
  if (!hostile || p.kind === 'caravana') o.push({ id: 'leave', label: 'Seguir camino', tip: 'Dejarlos pasar.', kind: 'ghost', hotkey: 'Escape' });
  return o;
}

function safeKnows(id: string): boolean { try { return knows(id); } catch { return false; } }
function safeDeed(d: Parameters<typeof applyDeed>[0]): void { try { applyDeed(d); } catch (err) { console.warn('[world] applyDeed failed', err); } }

function showOptions(p: PartyState, ctx: EncounterCtx): Promise<string | null> {
  let closeFn: ((v: string | null) => void) | null = null;
  const opts = optionsFor(p, ctx);
  const body = encounterBody(p, opts, (id) => closeFn?.(id), flavorFor(p));
  const hostile = p.hostile || HUNTERS.has(p.kind);
  const onKey = (e: KeyboardEvent) => {
    const op = opts.find((o) => o.hotkey && !o.disabled && (o.hotkey === e.key || (o.hotkey === 'Escape' && e.code === 'Escape')));
    if (op) { e.preventDefault(); e.stopPropagation(); closeFn?.(op.id); }
  };
  window.addEventListener('keydown', onKey, true);
  return modal({
    title: hostile ? '¡Encuentro!' : 'En el camino',
    body, className: 'ow-enc-modal', dismissable: !hostile,
    onOpen: (_root, close) => { closeFn = close; },
  }).finally(() => window.removeEventListener('keydown', onKey, true));
}

// ───────────────────────── flows ─────────────────────────

async function talk(p: PartyState): Promise<boolean> {
  const who = { speaker: p.leader ?? PARTY_LABEL[p.kind], title: p.leader ? PARTY_LABEL[p.kind] : factionName(p.faction), portrait: partyPortrait(p) };
  const n = G.run.player.name;
  let text: string;
  const rumor = recentNews(6).find((x) => x.kind === 'rumor' || x.kind === 'guerra');
  switch (p.kind) {
    case 'caravana': {
      const g = Object.entries(p.goods ?? {})[0];
      const dest = p.to ? LOCATIONS[p.to]?.name : null;
      text = `Llevamos ${g ? `${g[1]} de ${goodName(g[0] as GoodId)}` : 'mercancía'} ${dest ? `a ${dest}` : 'al mercado'}. ${rumor ? `Y dicen por ahí: *${rumor.text}*` : 'No buscamos problemas.'}`;
      break;
    }
    case 'patrulla': text = p.hostile ? `Tenemos órdenes de detenerte, ${n}. Nada personal.` : 'Circula, viajero. Y nada de magia rara en los caminos del reino.'; break;
    case 'ejercito': text = `Vamos a recuperar ${p.targetLoc ? LOCATIONS[p.targetLoc]?.name : 'lo que es nuestro'}. Apártate o te pasamos por encima.`; break;
    case 'cazadores': text = p.npcId ? safeGreeting(p.npcId) : `El Concilio te declaró una excepción a la ley, ${n}. Ríndete y vivirás... un rato.`; break;
    case 'nemesis': text = p.npcId ? safeGreeting(p.npcId) : 'Tú y yo tenemos una cuenta pendiente.'; break;
    case 'rival': text = p.relic ? `¿Esto? ${RELICS[p.relic]?.name ?? 'Una baratija'}. Si la quieres, págala. Aquí todo tiene precio.` : '¿Tú también buscas reliquias? Llegas tarde. Siempre llegan tarde.'; break;
    case 'refugiados': text = `Veníamos de ${p.from ? LOCATIONS[p.from]?.name : 'allá'}. ${rng.pick(['Ya no queda nada.', 'Dicen que la sombra violeta se come los campos.', '¿Qué año es? No sé. Dejamos de contar hace mucho.'])}`; break;
    case 'bandidos': text = '¡Mirá quién vino solito! Suelta la bolsa y nadie sale volando.'; break;
    case 'alianza': text = 'Cinco continentes contra uno. Hasta tú sabes contar eso.'; break;
    case 'cobradores': text = `¡Qué onda, patojo! Don Tiburcio manda saludos... y la factura. Son ${debtNow()} de oro, más intereses, más la molestia.`; break;
    default: text = '...';
  }
  await dialogue.say([{ ...who, text } as DialogueLine]);
  return false;
}
function debtNow(): number { try { return Math.round(totalDebt()); } catch { return Math.round(G.run.player.debt ?? 0); } }
function safeGreeting(id: string): string { try { return npcGreeting(id) || '...'; } catch { return '...'; } }

function fight(p: PartyState, ambush: boolean): void {
  const pid = p.id;
  audio.sfx('horn_war');
  const setup = partyBattle(p, ambush);
  launchBattle(setup, {
    onResult: (r: BattleResult) => onPartyResult(pid, p, ambush, r),
  });
}

function onPartyResult(pid: string, snapshot: PartyState, ambush: boolean, r: BattleResult): void {
  const p = getParty(pid) ?? snapshot;
  if (r.victory) {
    if (p.contract) progressQuest(p.contract, 1);
    if (p.kind === 'caravana') {
      const v = cargoValue(p);
      if (v > 0) { res.add('gold', v); toast(`Botín de la caravana: <b>+${v} oro</b>`, { kind: 'gold' }); }
      const good = Object.keys(p.goods ?? {})[0] as GoodId | undefined;
      safeDeed({ kind: 'rob_caravan', faction: p.faction, magnitude: 1, path: 'codicia', continent: p.home, good, location: p.to ?? p.from, noNews: true });
      track('caravans_robbed');
      addNews(`Asaltaron ${p.name.toLowerCase()} en pleno camino. Los testigos hablan de un mago pálido.`, 'rumor');
    } else if (p.kind === 'cazadores') {
      res.add('alert', 3);
      addNews('Los cazadores del Concilio no volvieron. Nadie se atreve a decir por qué.', 'concilio');
    } else if (p.kind === 'aurel') {
      W().aurelCooldown = G.run.luna + 4;
      addNews('Aurel se retiró herido a Concordia. Por primera vez, alguien lo vio sangrar.', 'excepcion', true);
      bus.emit('story:beat', { id: 'aurel_repelled' });
    } else if (p.kind === 'ejercito' || p.kind === 'alianza') {
      addNews(`${p.name} fue destrozado en campo abierto.`, 'guerra', true);
    }
    if (p.relic) { try { grantRelic(p.relic, { reveal: true, where: 'camino' }); } catch { /* ignore */ } }
    removeParty(pid);
  } else {
    p.cooldown = r.fled ? 12 : 16;
    p.state = p.hostile ? 'roam' : 'travel';
    p.spotted = false;
    if (!r.fled) p.strength = Math.round(p.strength * 1.08);
  }
  void ambush;
}

async function aurelEncounter(p: PartyState, ctx: EncounterCtx): Promise<EncounterOutcome> {
  const aurel = { speaker: 'Aurel', title: 'Portador del Alba', portrait: partyPortrait(p, 'determined') };
  const elias = { speaker: '{name}', portrait: eliasPortrait('smug'), side: 'right' as const };
  const met = Number(G.run.flags.aurel_met ?? 0);
  G.run.flags.aurel_met = met + 1;
  engine.pipeline.setLetterbox(1);
  audio.music('boss', { fade: 1.5 });
  let storyLine = '';
  try { storyLine = aurelLine(); } catch { storyLine = ''; }
  const opener = G.run.cycle >= 3 && met === 0
    ? '¿Nos hemos visto antes? Tengo la sensación de que ya te he matado.'
    : met === 0 ? 'Así que es verdad. Sigues vivo. Nadie tiene que salir herido, Elias.'
      : storyLine || rng.pick(['Otra vez tú.', 'Esto tiene que terminar.', 'Cada vez que te veo, el mundo está un poco más oscuro.']);
  await dialogue.say([
    { ...aurel, text: opener },
    { ...elias, text: rng.pick(['Qué curioso. Eso mismo pensaba yo.', 'Tú me enseñaste todo lo que sé. Literalmente.', 'Llegas tarde, héroe. Siempre llegan tarde.']) },
  ]);
  const fc = fleeChance(p, ctx), vc = veilChance(p);
  const known = safeKnows('velo');
  const choice = await dialogue.ask({ ...aurel, text: 'La luz de su mano no quema... todavía.' }, [
    { id: 'fight', text: 'Pelear. Esta vez no voy a caer.' },
    { id: 'flee', text: 'Huir. No hoy.', hint: pctTxt(fc) },
    { id: 'veil', text: 'Velo: desaparecer frente a quien lo inventó.', hint: known ? pctTxt(vc) : 'No lo conoces', disabled: !known || !res.can('mana', 20) },
  ]);
  engine.pipeline.setLetterbox(0);
  if (choice === 'flee' && Math.random() < fc) return escape(p, ctx, 'Aurel no te persigue. Todavía.');
  if (choice === 'veil' && res.spend('mana', 20)) {
    if (Math.random() < vc) return veiled(p, ctx);
    toast('Aurel te mira directo a través del Velo.', { kind: 'bad' });
  }
  if (choice !== 'fight') await banner('¡NO HAY ESCAPATORIA!', 'Aurel te cierra el paso', { kind: 'defeat', duration: 1.6 });
  await cutin({ portrait: portraitSVG({ seed: 'aurel', race: 'humano', special: 'aurel', mood: 'determined' }, 520), title: 'AUREL', subtitle: 'PORTADOR DEL ALBA', colors: ['#3a2a10', '#ffd36b'], side: 'left', duration: 1.4 });
  fight(p, false);
  return 'battle';
}

function escape(p: PartyState, ctx: EncounterCtx, msg = 'Escapaste.'): EncounterOutcome {
  ctx.pushAway(p.x, p.z, 8);
  p.cooldown = 10; p.state = HUNTERS.has(p.kind) ? 'roam' : 'travel'; p.lost = 99; p.spotted = false; p.retarget = 4;
  audio.sfx('whoosh');
  toast(msg, { kind: 'good' });
  track('escapes');
  return 'escaped';
}
function veiled(p: PartyState, ctx: EncounterCtx): EncounterOutcome {
  W().veilT = 14;
  G.run.flags.velo_active = true;
  p.cooldown = 12; p.state = HUNTERS.has(p.kind) ? 'roam' : 'travel'; p.lost = 99; p.spotted = false;
  audio.sfx('invisibility_on');
  engine.pipeline.chromaticPulse(0.6, 0.5);
  toast('Velo: pasas entre ellos como una idea que nadie tuvo.', { kind: 'epica' });
  track('invisible_seconds', 14);
  void ctx;
  return 'escaped';
}

/** Full encounter flow. The caller pauses world time while this runs. */
export async function openEncounter(p: PartyState, ctx: EncounterCtx): Promise<EncounterOutcome> {
  if (p.kind === 'aurel') return aurelEncounter(p, ctx);
  const hostile = p.hostile || HUNTERS.has(p.kind);
  if (hostile) { audio.sfx('horn_war', { volume: 0.7 }); engine.pipeline.chromaticPulse(0.5, 0.4); }
  for (let guard = 0; guard < 8; guard++) {
    const choice = await showOptions(p, ctx);
    switch (choice) {
      case 'talk': await talk(p); continue;
      case 'fight': fight(p, p.kind === 'caravana' || !hostile); return 'battle';
      case 'flee': {
        if (Math.random() < fleeChance(p, ctx)) return escape(p, ctx);
        await banner('¡TE ALCANZARON!', 'No hay más remedio que pelear', { kind: 'defeat', duration: 1.5 });
        fight(p, false);
        return 'battle';
      }
      case 'bribe': {
        const c = bribeCost(p);
        if (!res.spend('gold', c)) { toast('No te alcanza el oro.', { kind: 'bad' }); continue; }
        W().bribes[p.faction] = G.run.luna + 2;
        p.cooldown = 40; p.state = 'travel'; p.spotted = false;
        audio.sfx('coins_many');
        safeDeed({ kind: 'bribe', faction: p.faction, magnitude: 1, continent: p.home });
        track('bribes');
        toast(`${factionName(p.faction)} mira hacia otro lado. <b>−${c} oro</b>`, { kind: 'gold' });
        return 'resolved';
      }
      case 'veil': {
        if (!res.spend('mana', 20)) { toast('No te alcanza el maná.', { kind: 'bad' }); continue; }
        if (Math.random() < veilChance(p)) return veiled(p, ctx);
        toast('¡Te vieron a través del Velo!', { kind: 'bad' });
        fight(p, false);
        return 'battle';
      }
      case 'extort': {
        if (Math.random() < extortChance(p)) {
          const g = Math.round((p.gold ?? 60) * 0.7 + cargoValue(p) * 0.25);
          p.gold = Math.max(0, (p.gold ?? 0) - g);
          res.add('gold', g);
          audio.sfx('coins_many');
          safeDeed({ kind: 'terror', faction: p.faction, magnitude: 0.5, path: 'terror', continent: p.home, location: p.from });
          track('extortions');
          toast(`Pagaron el "peaje": <b>+${g} oro</b>`, { kind: 'gold' });
          p.cooldown = 40; p.hostile = false;
          return 'resolved';
        }
        toast('Se niegan a pagar. Uno escupe al suelo.', { kind: 'bad' });
        audio.sfx('crowd_boo', { volume: 0.5 });
        continue;
      }
      case 'buyrelic': {
        const r = p.relic ? RELICS[p.relic] : undefined;
        const price = RELIC_PRICE[r?.rarity ?? 'rara'];
        if (!p.relic || !res.spend('gold', price)) continue;
        try { grantRelic(p.relic, { reveal: true, where: 'camino' }); } catch { /* ignore */ }
        p.relic = undefined;
        audio.sfx('purchase');
        toast('Trato hecho. El cazarreliquias cuenta las monedas dos veces.', { kind: 'gold' });
        removeParty(p.id);
        return 'resolved';
      }
      case 'paydebt': {
        try { await openBank(); } catch { /* ignore */ }
        if (debtNow() <= 0) {
          audio.sfx('coins_many');
          toast('Los cobradores cuentan las monedas dos veces... y se van silbando.', { kind: 'gold' });
          removeParty(p.id);
          return 'resolved';
        }
        continue;
      }
      case 'alms': {
        if (!res.spend('gold', 30)) continue;
        safeDeed({ kind: 'help', faction: p.faction, magnitude: 0.5, continent: p.home });
        audio.sfx('coin');
        toast('Te miran como si no supieran qué eres. Quizá tú tampoco.', { kind: 'good' });
        p.cooldown = 60;
        return 'resolved';
      }
      case 'recruit': {
        const pool = Object.values(UNITS).filter((u) => u.tier === 1 && (u.race === p.race || u.job === 'campesino'));
        if (!pool.length) { toast('No hay nadie aquí capaz de sostener un arma.', { kind: 'bad' }); continue; }
        const n = Math.max(1, Math.min(3, Math.round(p.size * 0.8)));
        for (let i = 0; i < n; i++) G.run.player.army.push({ uid: uid('u'), unitId: rng.pick(pool).id, stars: 0, xp: 0 });
        safeDeed({ kind: 'recruit', faction: p.faction, magnitude: Math.min(2, n * 0.4), continent: p.home, location: p.from });
        track('units_recruited', n);
        audio.sfx('level_up');
        toast(`<b>+${n}</b> ${n === 1 ? 'desesperado se une' : 'desesperados se unen'} a tu ejército.`, { kind: 'good' });
        removeParty(p.id);
        return 'resolved';
      }
      case 'leave':
      case null:
      default:
        p.cooldown = 8;
        return 'left';
    }
  }
  p.cooldown = 8;
  return 'left';
}

/** Short text for hover tooltips on the map. */
export function partyTooltip(p: PartyState): string {
  const o = odds(totalPower(), p.strength);
  return `<b>${esc(p.name)}</b><br>${esc(factionName(p.faction))} · ${esc(PARTY_LABEL[p.kind])}<br>${esc(partyGoal(p))}<br>Fuerza ${Math.round(p.strength)} · <span style="color:${o.color}">${o.text}</span>`;
}

export { eliasPower };
