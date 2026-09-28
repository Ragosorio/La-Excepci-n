/**
 * Conversations (GDD §4.6, §4.9): talkTo(npcId) — portraits with moods from feelings, memory-aware greetings,
 * rumors, "¿Qué año es?", threaten / bribe / gift / Dominar Mente, trade, recruit lieutenants, role options
 * (gobernante, delegado, informante), judgement of defeated captains. Every choice feeds applyDeed / memories.
 */
import { G, res } from '../../core/state';
import { track } from '../../core/tracker';
import { rng } from '../../core/rng';
import { input } from '../../core/input';
import { dialogue, type DialogueChoice, type DialogueLine } from '../../ui/dialogue';
import { toast } from '../../ui/toasts';
import { narrate } from '../../ui/narrator';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import type { PortraitMood } from '../../ui/art/portraits';
import type { ContinentId, NpcState } from '../../data/types';
import { applyDeed } from './deeds';
import { changeRep, repValue } from './factions';
import { addCorruption } from './corruption';
import { NPC_LINES } from './lines_npc';
import { BRIBE_NO, BRIBE_OK, FAREWELLS, FAREWELLS_DUENDE, THREAT_NO, THREAT_OK } from './lines_common';
import { npcGreeting, rumorLine, yearAnswer } from './greetings';
import { eliasPortrait, feel, makeLoyal, npcState, npcView, portraitFor, remember } from './memory';
import { addLieutenant, dominateCaptive, executeCaptive, fullName, pendingCaptives, releaseCaptive, spareCaptive } from './nemesis';
import { buyVote, delegateId, isDelegate, voteBuyCost } from './politics';
import { continentOf, knowsAbility, luna, presence, soc, veloActive } from './state';
import { mindPulse, popText } from './uifx';
import { talkFamily, talkBruma, isFamily } from './family';
import { talkTownsfolk } from './townsfolk';
import { openMarket } from './market';
import { openBank } from './bank';
import { openSedas } from './sedas';
import type { NpcView } from './types';

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

export interface Conv {
  id: string;
  v: NpcView;
  st: NpcState;
  loc: string | null;
  seen: Set<string>;
  used: Set<string>;
  mood?: PortraitMood;
}

export function npcLine(c: Conv, text: string, mood?: PortraitMood): DialogueLine {
  return { speaker: c.v.name, title: c.v.title, portrait: portraitFor(c.id, mood ?? c.mood), side: 'left', text };
}
export function eliasLine(text: string, mood: PortraitMood = 'smug'): DialogueLine {
  return { speaker: '{name}', portrait: eliasPortrait(mood), side: 'right', text };
}

let busy = false;
export function isTalking(): boolean { return busy; }

/** Full conversation with a named NPC, a generated nemesis, or 'townsfolk:<locationId>'. */
export async function talkTo(npcId: string): Promise<void> {
  if (busy || !G.run || !npcId) return;
  busy = true;
  const prevInput = input.enabled;
  try {
    if (npcId.startsWith('townsfolk:')) await talkTownsfolk(npcId.slice('townsfolk:'.length));
    else if (npcId === 'bruma') await talkBruma();
    else if (isFamily(npcId)) await talkFamily(npcId);
    else if (soc().nemesis[npcId]?.fallen) await judgeCaptive(npcId);
    else await talkNpc(npcId);
  } catch (err) {
    console.error('[society] talkTo', err);
  } finally {
    busy = false;
    dialogue.close();
    input.enabled = prevInput;
  }
}

function makeConv(id: string): Conv | null {
  const v = npcView(id);
  const st = npcState(id);
  if (!v || !st) return null;
  return { id, v, st, loc: G.run.player.location ?? st.location ?? null, seen: new Set(), used: new Set() };
}

type Reply = { text: string; mood?: PortraitMood } | 'end';

async function talkNpc(id: string): Promise<void> {
  const c = makeConv(id);
  if (!c) { toast('No hay nadie con ese nombre aquí.', { kind: 'bad' }); return; }
  if (!c.st.alive) { await dialogue.say({ text: '(No hay nadie. Solo el lugar donde estaba.)' }); return; }
  let text = npcGreeting(id);
  c.st.met = true;
  const s = soc();
  s.talked[id] = (s.talked[id] ?? 0) + 1;
  track('npcs_talked');
  audio.sfx('page_turn', { volume: 0.35 });
  let mood: PortraitMood | undefined;
  let menu: Menu = 'main';
  let fresh = true;
  for (let guard = 0; guard < 60; guard++) {
    const line = npcLine(c, text, mood);
    if (!fresh) line.speed = 40;      // re-showing the same line while browsing menus: no typewriter
    const choice = await dialogue.ask(line, buildChoices(c, menu), true);
    if (choice === 'menu_power' || choice === 'menu_press' || choice === 'back') {
      menu = choice === 'menu_power' ? 'power' : choice === 'menu_press' ? 'press' : 'main';
      fresh = false;
      continue;
    }
    const reply = await handle(c, choice);
    if (reply === 'end') break;
    text = reply.text;
    mood = reply.mood;
    menu = 'main';
    fresh = true;
  }
}

// ───────────────────────────── choices ─────────────────────────────

const MERCHANT_JOBS = ['mercader', 'tabernero', 'herrero', 'alquimista', 'banquero', 'crupier', 'campesino', 'curandero'];

function isImportant(c: Conv): number {
  const r = c.v.role;
  return r === 'gobernante' ? 3 : r === 'delegado' ? 2.5 : r === 'custodia' || r === 'heroe' ? 4 : r === 'jefe' ? 2 : 1;
}
export function bribeCostFor(c: Conv): number {
  const t = c.v.traits;
  let cost = 40 + isImportant(c) * 60;
  if (t.includes('codicioso')) cost *= 0.5;
  if (t.includes('honorable') || t.includes('piadoso')) cost *= 1.6;
  return Math.round(cost / 5) * 5;
}
function dominateMana(c: Conv): number { return isImportant(c) >= 2 ? 35 : 20; }
function dominateRisk(c: Conv): number {
  if (veloActive()) return 0;
  const t = c.v.traits;
  let r = 0.2;
  if (t.includes('paranoico')) r += 0.15;
  if (t.includes('sabio')) r += 0.1;
  if (isImportant(c) >= 2) r += 0.1;
  if (Number(G.run.flags.magic_census_until ?? -1) > luna()) r += 0.15;
  return Math.min(0.85, r);
}
function recruitable(c: Conv): boolean {
  return !!c.v.combatUnit || ['jefe', 'rival'].includes(c.v.role ?? '') || !!soc().nemesis[c.id];
}
function isMerchant(c: Conv): boolean {
  return c.v.role === 'mercader' || c.v.role === 'tabernero' || (MERCHANT_JOBS.includes(c.v.job) && c.v.role !== 'gobernante' && c.v.role !== 'familia');
}

type Menu = 'main' | 'power' | 'press';

/** Options grouped in short menus so the box never covers the portrait: main · «Asuntos de poder…» · «Presionar…». */
function buildChoices(c: Conv, menu: Menu): DialogueChoice[] {
  const p = G.run.player;
  const role = c.v.role;
  const loyal = !!c.st.loyal;
  const power: DialogueChoice[] = [];
  const press: DialogueChoice[] = [];
  if (role === 'gobernante') {
    power.push({ id: 'tribute', text: 'Exigir tributo', hint: loyal ? 'es tuyo' : 'miedo o lealtad', disabled: tributeCooldown(c) > 0, tip: tributeCooldown(c) > 0 ? `Vuelve en ${tributeCooldown(c)} lunas` : undefined });
    if (!c.used.has('alliance') && !G.run.flags[`alliance_${c.id}`]) power.push({ id: 'alliance', text: 'Proponer una alianza', hint: 'reputación' });
    power.push({ id: 'betray', text: 'Que traicione al Concilio', hint: 'su delegado votará contigo' });
  }
  if (isDelegate(c.id) || role === 'delegado') {
    const bought = soc().council.boughtVotes[c.id] === soc().council.count;
    const cost = voteBuyCost(c.id);
    power.push({ id: 'buyvote', text: bought ? 'Su voto ya es tuyo' : 'Comprar su voto', hint: bought ? 'próxima sesión' : `−${cost} oro · próxima sesión`, disabled: bought || p.gold < cost });
    if ((soc().secretsOn[c.id] ?? 0) > 0 && !bought) power.push({ id: 'blackmail', text: 'Chantajear', hint: 'usa su secreto' });
  }
  if (recruitable(c) && !p.army.some((u) => u.npcId === c.id)) power.push({ id: 'recruit', text: 'Reclutar como teniente', hint: loyal ? 'te obedece' : 'respeto, deuda o miedo' });
  if (!loyal && role !== 'custodia') {
    press.push({ id: 'threaten', text: 'Amenazar', hint: 'miedo' });
    const cost = bribeCostFor(c);
    press.push({ id: 'bribe', text: 'Sobornar', hint: `−${cost} oro`, disabled: p.gold < cost || c.used.has('bribe'), tip: c.used.has('bribe') ? 'Ya lo intentaste' : p.gold < cost ? 'No tienes oro suficiente' : undefined });
  }
  if (!loyal && knowsAbility('dominar_mente')) {
    const mana = dominateMana(c);
    const risk = Math.round(dominateRisk(c) * 100);
    press.push({ id: 'dominate', text: '*Dominar Mente*', hint: `−${mana} maná · ${risk ? `riesgo ${risk}%` : 'sin riesgo (Velo)'}`, disabled: p.mana < mana, tip: p.mana < mana ? 'No tienes maná suficiente' : undefined });
  }
  if (role !== 'gobernante' && role !== 'delegado' && !c.used.has('gift')) press.push({ id: 'gift', text: 'Hacer un regalo', hint: '−30 oro', disabled: p.gold < 30 });

  if (menu === 'power' && power.length) return [...power, { id: 'back', text: '← Volver' }];
  if (menu === 'press' && press.length) return [...press, { id: 'back', text: '← Volver' }];

  const out: DialogueChoice[] = [];
  out.push({ id: 'rumor', text: 'Rumores', hint: 'lo que se dice' });
  out.push({ id: 'year', text: '¿Qué año es?' });
  if (c.id === 'tiburcio') out.push({ id: 'bank', text: 'Hablar de negocios (La Banca)', hint: 'préstamos · acciones' });
  if (c.id === 'mirelle' || (c.v.job === 'cortesana' && role === 'informante')) out.push({ id: 'sedas', text: 'Comprar secretos', hint: 'Casa de las Sedas' });
  if (isMerchant(c) && c.loc) out.push({ id: 'trade', text: 'Comerciar', hint: 'mercado' });
  if (role === 'informante') {
    const cost = infoCost(c);
    out.push({ id: 'buysecret', text: 'Comprar un secreto', hint: `−${cost} oro`, disabled: p.gold < cost, tip: p.gold < cost ? 'No tienes oro suficiente' : undefined });
  }
  const HINT: Record<string, string> = { tribute: 'tributo', alliance: 'alianza', betray: 'traición', buyvote: 'su voto', blackmail: 'chantaje', recruit: 'reclutar' };
  if (power.length) out.push({ id: 'menu_power', text: role === 'gobernante' ? 'Asuntos de Estado…' : role === 'delegado' ? 'Asuntos del Concilio…' : 'Proponer algo…', hint: power.map((x) => HINT[x.id] ?? '').filter(Boolean).slice(0, 3).join(' · ') });
  if (press.length) out.push({ id: 'menu_press', text: 'Presionar…', hint: 'amenazar · sobornar · dominar' });
  out.push({ id: 'bye', text: 'Despedirse' });
  return out;
}

function infoCost(c: Conv): number { return Math.round((c.id === 'mirelle' ? 110 : 90) * (repValue('sedas') >= 40 ? 0.85 : 1)); }
function tributeCooldown(c: Conv): number { return Math.max(0, Number(G.run.flags[`tribute_${c.id}`] ?? -99) + 4 - luna()); }

// ───────────────────────────── handlers ─────────────────────────────

async function handle(c: Conv, choice: string): Promise<Reply> {
  const lines = NPC_LINES[c.id];
  const duende = c.v.race === 'duende';
  switch (choice) {
    case 'rumor': return { text: rumorLine({ duende, intro: lines?.rumor, seen: c.seen }) };
    case 'year': {
      await dialogue.say(eliasLine('¿Qué año es?', 'neutral'));
      return { text: yearAnswer(c.id), mood: 'surprised' };
    }
    case 'bank': dialogue.close(); await openBank(); return 'end';
    case 'sedas': dialogue.close(); await openSedas(c.loc ?? 'callejones_ceniza'); return 'end';
    case 'trade': dialogue.close(); await openMarket(c.loc ?? c.st.location); return 'end';
    case 'buysecret': return buySecret(c);
    case 'tribute': return tribute(c);
    case 'alliance': return alliance(c);
    case 'betray': return betray(c);
    case 'buyvote': return buyVoteReply(c);
    case 'blackmail': return blackmailDelegate(c);
    case 'recruit': return recruit(c);
    case 'threaten': return threaten(c);
    case 'bribe': return bribe(c);
    case 'dominate': return dominate(c);
    case 'gift': return gift(c);
    case 'bye':
    default: {
      await dialogue.say(npcLine(c, pick(lines?.bye ?? (duende ? FAREWELLS_DUENDE : FAREWELLS))));
      return 'end';
    }
  }
}

function buySecret(c: Conv): Reply {
  const cost = infoCost(c);
  if (!res.spend('gold', cost)) return { text: 'Sin oro no hay secretos, querido.' };
  res.add('secrets', 1);
  track('secrets_bought');
  audio.sfx('whisper');
  popText({ x: window.innerWidth / 2, y: window.innerHeight * 0.55 }, '+1 Secreto', 'var(--secret)', true);
  return { text: rng.pick(['Acércate. Esto no lo repito dos veces...', 'Toma. Guárdalo bien: los secretos se echan a perder si se airean.', 'Un secreto fresco. Todavía está tibio.']), mood: 'smug' };
}

function tribute(c: Conv): Reply {
  const f = c.st.feelings;
  const cont = continentOf(c.v.home);
  const loc = G.run.locations[c.v.home];
  const owned = loc?.control === 'excepcion';
  if (c.st.loyal || f.miedo >= 40 || owned) {
    const gold = Math.round((loc?.prosperity ?? 50) * 4 + 100);
    res.add('gold', gold);
    G.run.flags[`tribute_${c.id}`] = luna();
    feel(c.id, { odio: 5, miedo: 5 });
    if (cont) addCorruption(cont, 'codicia', 3);
    remember(c.id, { kind: 'humillado', text: 'Me obligaste a pagarte tributo', where: c.v.home, intensity: 5 });
    audio.sfx('coins_many');
    popText({ x: window.innerWidth / 2, y: window.innerHeight * 0.55 }, `+${gold} oro`, 'var(--gold-hi)', true);
    track('tributes');
    return { text: c.st.loyal ? 'Por supuesto. Todo lo mío es tuyo.' : '(Aprieta los dientes.) Tómalo. Y que nadie sepa que lo pedí yo.', mood: c.st.loyal ? 'mind' : 'angry' };
  }
  feel(c.id, { odio: 8 });
  return { text: '¿Tributo? ¿A ti? Te daré tributo el día que me des miedo.', mood: 'angry' };
}

function alliance(c: Conv): Reply {
  c.used.add('alliance');
  const cont = continentOf(c.v.home) as ContinentId | null;
  const f = c.st.feelings;
  if (c.st.loyal || f.respeto >= 40 || (cont && repValue(cont) >= 15)) {
    G.run.flags[`alliance_${c.id}`] = luna();
    if (cont) { changeRep(cont, 8); addCorruption(cont, 'intriga', 5); }
    res.add('influence', 15);
    remember(c.id, { kind: 'alianza', text: 'Hicimos una alianza', where: c.v.home, intensity: 6 });
    feel(c.id, { respeto: 10, deuda: 10 });
    audio.sfx('buff');
    track('alliances');
    return { text: 'Una alianza. Discreta. Muy discreta. Mis consejeros no necesitan saberlo.', mood: 'smile' };
  }
  feel(c.id, { odio: 5 });
  return { text: 'Una alianza se hace entre iguales. Tú no eres mi igual. Todavía.', mood: 'smug' };
}

function betray(c: Conv): Reply {
  const cont = continentOf(c.v.home) as ContinentId | null;
  const f = c.st.feelings;
  const secret = (soc().secretsOn[c.id] ?? 0) > 0;
  if (!cont) return { text: 'No tengo a quién traicionar.' };
  if (c.st.loyal || secret || f.miedo >= 70) {
    if (secret) soc().secretsOn[c.id]--;
    const del = delegateId(cont);
    soc().council.boughtVotes[del] = soc().council.count;
    addCorruption(cont, 'intriga', 8);
    remember(c.id, { kind: 'chantajeado', text: 'Me hiciste traicionar al Concilio', where: c.v.home, intensity: 7 });
    feel(c.id, { odio: c.st.loyal ? 0 : 15 });
    track('betrayals');
    audio.sfx('whisper');
    return { text: `Mi delegado votará como tú digas en la próxima sesión. Y yo nunca te conocí.`, mood: c.st.loyal ? 'mind' : 'scared' };
  }
  feel(c.id, { odio: 10 });
  res.add('alert', 3);
  return { text: '¿Traicionar al Concilio? ¿Por ti? Guardias, acompañen al caballero a la salida.', mood: 'angry' };
}

function buyVoteReply(c: Conv): Reply {
  const t = c.v.traits;
  if (t.includes('honorable') && rng.chance(0.5)) {
    feel(c.id, { odio: 10 });
    res.add('alert', 2);
    return { text: 'Mi voto pertenece a mi pueblo. Ni todo el oro de las Islas lo mueve.', mood: 'angry' };
  }
  const cost = voteBuyCost(c.id);
  if (!buyVote(c.id)) return { text: 'Vuelve cuando tengas el oro.' };
  applyDeed({ kind: 'bribe', npcId: c.id, location: c.loc ?? undefined, silent: true, noNews: true, magnitude: cost / 150 });
  audio.sfx('coins_many');
  return { text: t.includes('codicioso') ? 'Un placer hacer negocios contigo. Levantaré la mano cuando me mires.' : '...Está bien. Pero esto nunca pasó.', mood: 'smug' };
}

function blackmailDelegate(c: Conv): Reply {
  const s = soc();
  if ((s.secretsOn[c.id] ?? 0) <= 0) return { text: '¿Qué crees que sabes?' };
  s.secretsOn[c.id]--;
  const text = (s.secretTexts[c.id] ?? []).pop();
  s.council.boughtVotes[c.id] = s.council.count;
  applyDeed({ kind: 'blackmail', npcId: c.id, location: c.loc ?? undefined, silent: true, noNews: true });
  audio.sfx('heartbeat');
  return { text: text ? `(Lee la nota: «${text}». Palidece.) ...¿Qué quieres? Mi voto. Claro. Claro que sí.` : '(Palidece.) Está bien. Votaré contigo. Solo... no lo digas.', mood: 'scared' };
}

function recruit(c: Conv): Reply {
  const f = c.st.feelings;
  const nem = soc().nemesis[c.id];
  if (c.st.loyal || f.respeto >= 50 || f.deuda >= 50 || f.miedo >= 70) {
    const unit = addLieutenant(c.id, c.v.combatUnit ?? nem?.unitId);
    if (!unit) return { text: 'Ya marcho contigo.' };
    if (c.v.canonical) c.st.location = 'ejercito';
    audio.stinger('level_up');
    toast(`<b>${c.v.name}</b> se une a tu ejército como teniente.`, { kind: 'epica', duration: 4 });
    return { text: c.st.loyal ? 'A donde tú vayas.' : f.miedo >= 70 ? 'S-sí. Iré. No tengo mucha opción, ¿verdad?' : 'Te seguiré. No por el Concilio. Por lo que vi en tus ojos.', mood: c.st.loyal ? 'mind' : 'determined' };
  }
  if (c.v.traits.includes('codicioso')) {
    const price = 250 + (G.run.npcs[c.id]?.generated?.level ?? 5) * 10;
    if (res.spend('gold', price)) {
      addLieutenant(c.id, c.v.combatUnit ?? nem?.unitId);
      if (c.v.canonical) c.st.location = 'ejercito';
      toast(`<b>${c.v.name}</b> se une por ${price} de oro. Por ahora.`, { kind: 'gold' });
      return { text: 'Por ese precio, soy tuyo. Mientras dure el oro.', mood: 'smug' };
    }
    return { text: `Pagas ${price} de oro y hablamos.`, mood: 'smug' };
  }
  feel(c.id, { odio: 3 });
  return { text: 'No sigo a nadie. Y menos a ti.', mood: 'angry' };
}

function threaten(c: Conv): Reply {
  const lines = NPC_LINES[c.id];
  const t = c.v.traits;
  const f = c.st.feelings;
  const loc = c.loc ? G.run.locations[c.loc] : null;
  if (c.id === 'aurel') return { text: lines?.threatNo ? pick(lines.threatNo) : 'No.', mood: 'determined' };
  const power = 25 + presence() * 3 + (loc?.fear ?? 0) * 0.3 + f.miedo * 0.4 + G.run.player.titleIndex * 6;
  const resist = 40 + (t.includes('valiente') ? 30 : 0) + (t.includes('orgulloso') ? 15 : 0) + (t.includes('honorable') ? 10 : 0) - (t.includes('cobarde') ? 30 : 0) + (c.v.role === 'gobernante' ? 20 : 0) + (c.v.role === 'heroe' ? 40 : 0);
  const ok = power + rng.range(-15, 15) > resist;
  if (ok) {
    applyDeed({ kind: 'terror', location: c.loc ?? undefined, npcId: c.id, magnitude: 0.25, noNews: true });
    audio.sfx('heartbeat');
    let extra = '';
    if (c.v.role === 'informante') { res.add('secrets', 1); extra = ' (+1 Secreto)'; }
    else if (isMerchant(c)) { const g = rng.int(15, 40); res.add('gold', g); extra = ` (+${g} oro)`; }
    if (extra) popText({ x: window.innerWidth / 2, y: window.innerHeight * 0.55 }, extra.trim().replace(/[()]/g, ''), 'var(--gold-hi)');
    return { text: (lines?.threatOk ? pick(lines.threatOk) : pick(THREAT_OK)) + extra, mood: 'scared' };
  }
  feel(c.id, { odio: 15, respeto: 5 });
  remember(c.id, { kind: 'amenazado', text: 'Intentaste asustarme', where: c.loc ?? undefined, intensity: 5 });
  res.add('alert', 1);
  return { text: lines?.threatNo ? pick(lines.threatNo) : pick(THREAT_NO), mood: 'angry' };
}

function bribe(c: Conv): Reply {
  c.used.add('bribe');
  const lines = NPC_LINES[c.id];
  const t = c.v.traits;
  const cost = bribeCostFor(c);
  const refuse = c.v.role === 'custodia' || c.id === 'aurel' || (t.includes('honorable') && rng.chance(0.6)) || (t.includes('piadoso') && rng.chance(0.3));
  if (refuse) {
    feel(c.id, { odio: 6, respeto: -5 });
    return { text: lines?.bribeNo ? pick(lines.bribeNo) : pick(BRIBE_NO), mood: 'angry' };
  }
  if (!res.spend('gold', cost)) return { text: 'Eso no alcanza ni para empezar.' };
  applyDeed({ kind: 'bribe', npcId: c.id, location: c.loc ?? undefined, magnitude: cost / 150 });
  track('bribes');
  audio.sfx('coin');
  let reward = '';
  const roll = rng.next();
  if (c.v.role === 'informante' || roll < 0.25) { res.add('secrets', 1); reward = 'Te susurra algo que vale un Secreto.'; }
  else if (isImportant(c) >= 2) { res.add('alert', -3); reward = 'Sus guardias mirarán para otro lado un tiempo (Alerta −3).'; }
  else reward = rumorLine({ seen: c.seen });
  return { text: `${lines?.bribeOk ? pick(lines.bribeOk) : pick(BRIBE_OK)} ${reward}`, mood: 'smile' };
}

function dominate(c: Conv): Reply {
  const mana = dominateMana(c);
  if (!res.spend('mana', mana)) return { text: '(Tu magia titubea. Te falta maná.)' };
  mindPulse(1600);
  audio.sfx('mind_control');
  if (c.id === 'aurel') return { text: 'Tus trucos son míos, Elias. Los sentí salir de mí.', mood: 'determined' };
  if (c.v.role === 'heroe' && rng.chance(0.5)) {
    res.add('alert', 5);
    feel(c.id, { odio: 20 });
    return { text: '(Aprieta los dientes. Algo en su mente te empuja de vuelta.) Me entrenaron para esto, mago. Inténtalo otra vez y te arranco los ojos.', mood: 'angry' };
  }
  if (c.id === 'morgaine' && rng.chance(0.5)) return { text: 'Jijiji. Eso ya lo intentaste en otra vida, niño. Y en la otra también.', mood: 'smug' };
  remember(c.id, { kind: 'dominado', text: 'Me metiste en la cabeza', where: c.loc ?? undefined, intensity: 8 });
  makeLoyal(c.id, 'dominado');
  applyDeed({ kind: 'manipulate', location: c.loc ?? undefined, npcId: c.id, magnitude: isImportant(c) >= 2 ? 1.4 : 0.6, silent: true });
  track('minds_dominated');
  let extra = '';
  if (rng.chance(dominateRisk(c))) {
    res.add('alert', 6);
    extra = ' (Alguien vio brillar tus ojos. Alerta +6.)';
    track('dominations_seen');
  }
  engine.pipeline?.chromaticPulse(0.8, 0.6);
  const lines = NPC_LINES[c.id];
  return { text: (lines?.loyal ? pick(lines.loyal) : 'Sí... Sí. Lo que tú digas. Siempre fue lo que tú digas.') + extra, mood: 'mind' };
}

function gift(c: Conv): Reply {
  c.used.add('gift');
  if (!res.spend('gold', 30)) return { text: '¿Un regalo? ¿Con qué?' };
  applyDeed({ kind: 'gift', npcId: c.id, location: c.loc ?? undefined, magnitude: 0.4 });
  audio.sfx('coin');
  const t = c.v.traits;
  if (t.includes('codicioso')) return { text: '¡Oh! Qué detalle. Me gustan los detalles. Sobre todo los que brillan.', mood: 'smile' };
  if (t.includes('paranoico')) return { text: '¿Un regalo? ¿Por qué? ...¿Qué quieres? Lo acepto, pero no me fío.', mood: 'surprised' };
  return { text: rng.pick(['Vaya... gracias. No esperaba eso de usted.', 'Qué raro. Qué amable. Qué raro.', 'Lo guardaré. Y me acordaré.']), mood: 'smile' };
}

// ───────────────────────────── judgement ─────────────────────────────

/** Perdonar / Ejecutar / Dominar / Soltar a defeated captain. */
export async function judgeCaptive(id: string): Promise<void> {
  const c = makeConv(id);
  if (!c) return;
  const name = fullName(id);
  audio.stinger('nemesis');
  const p = G.run.player;
  const choices: DialogueChoice[] = [
    { id: 'spare', text: 'Perdonar', hint: 'respeto · deuda' },
    { id: 'execute', text: 'Ejecutar', hint: 'Terror · miedo' },
  ];
  if (knowsAbility('dominar_mente')) choices.push({ id: 'dominate', text: '*Dominar Mente* — que sea tu teniente', hint: '−20 maná', disabled: p.mana < 20 });
  choices.push({ id: 'release', text: 'Dejarlo ahí', hint: 'que decida el destino' });
  const intro = rng.pick(['(De rodillas, sangrando tinta violeta.) ...Hazlo de una vez.', '(Te mira desde el barro.) ¿Qué esperas?', '(Escupe.) Si me dejas vivir, te buscaré. Te lo juro.', '(Tiembla, pero no baja la mirada.) Termina.']);
  const pickId = await dialogue.ask(npcLine(c, `${intro}`, 'hurt'), choices, true);
  if (pickId === 'spare') {
    spareCaptive(id);
    applyDeed({ kind: 'spare', npcId: id, location: c.loc ?? undefined });
    await dialogue.say(npcLine(c, rng.pick(['...¿Por qué? ¿Por qué me dejas vivir?', 'No lo entiendo. No lo voy a olvidar. Todavía no sé si eso es bueno.', 'Te debo la vida. Odio deberte algo.']), 'surprised'));
  } else if (pickId === 'execute') {
    executeCaptive(id);
    applyDeed({ kind: 'execute', npcId: id, location: c.loc ?? undefined });
    engine.pipeline?.impact(2, 2);
    audio.sfx('death_pop');
    void narrate({ third: `${name} no volvió a levantarse. {name} ni siquiera miró.`, first: `${name} no volvió a levantarse. Yo ni siquiera miré.` });
  } else if (pickId === 'dominate') {
    if (res.spend('mana', 20)) {
      mindPulse(1500);
      audio.sfx('mind_control');
      dominateCaptive(id);
      applyDeed({ kind: 'manipulate', npcId: id, location: c.loc ?? undefined, magnitude: 0.5, silent: true });
      await dialogue.say(npcLine(c, 'Sí... mi señor. Siempre fui suyo. ¿Verdad?', 'mind'));
      toast(`<b>${name}</b> es ahora tu teniente.`, { kind: 'epica' });
    }
  } else {
    releaseCaptive(id);
    await dialogue.say(npcLine(c, '(Lo dejas en el barro. Lo último que oyes es su respiración.)', 'hurt'));
  }
}

/** Judge every defeated captain waiting (called automatically after battles, or by the world module). */
export async function judgeCaptives(): Promise<void> {
  if (busy) return;
  const ids = pendingCaptives().slice(0, 3);
  for (const id of ids) {
    busy = true;
    try { await judgeCaptive(id); } catch (err) { console.error('[society] judge', err); } finally { busy = false; dialogue.close(); }
  }
  for (const id of pendingCaptives()) releaseCaptive(id);
}
