/**
 * Dados Mentirosos — sit with 2–3 named tahúres (pepe_chucho, lady_ambar, el_mudo, …) who remember you.
 * Buy-in pot, winner takes it (5% rake; 0 in the Clandestino). Rivals that caught you cheating call you out sooner.
 */
import { h } from '../../ui/dom';
import { audio } from '../../audio';
import { fmt } from '../../core/math';
import { G } from '../../core/state';
import { portraitSVG, type PortraitMood } from '../../ui/art/portraits';
import { NPCS } from '../../data/npcs';
import { randomName } from '../../data/names';
import { Rng } from '../../core/rng';
import { remember, feel } from '../../systems/society/api';
import { cs, bet as takeBet, settle, rivalMem, luna, casinoClosed, gold } from '../state';
import { winBanner, coinBurst, centerOf, tierFor } from '../fx2d';
import { gameHeader, rulesSheet, bubble } from '../ui';
import { cleanRound } from '../security';
import { LiarsTable, type Seat, type Lines } from './liars';
import type { Persona } from './liarsAI';
import type { RaceId } from '../../data/types';
import type { GameCtx, GameView } from '../types';

interface RivalDef { id: string; name: string; title: string; race: RaceId; job: string; gender: 'f' | 'm'; age?: 'young' | 'adult' | 'old'; persona: Persona; lines: Lines; greet: { first: string; beatYou: string; lostToYou: string; caught: string }; eyepatch?: boolean; scar?: boolean }

export const RIVALS: RivalDef[] = [
  {
    id: 'pepe_chucho', name: 'Pepe Chucho', title: 'tahúr de puerto', race: 'duende', job: 'bardo', gender: 'm',
    persona: { threshold: 0.32, bluff: 0.38, temperature: 0.2, exact: 0.25, perception: 0.3, read: 0.03 },
    lines: {
      think: ['Mmm… mmm…', '¿Y si…? No. ¿O sí?', 'Hip… perdón.'], bid: ['¡Ahí te va, vos!', '¡Súbale, súbale!', 'Esa me la sé.', '¡Chilero!'],
      liar: ['¡MENTIROSO! ¡Puro farol, patojo!', '¡A la gran, eso es mentira!'], exact: ['¡Exacto, exactito!'],
      lose: ['¡Shute! ¡Mi dadito!', '¿Quién me cambió los dados?'], win: ['¡Jajay! ¡Volvió el Chucho!'], out: ['Me limpiaron… otra vez. Voy por un trago.'],
      caught: ['¡EH! ¡Ese dado se movió solito! ¡Trampa, trampa!'],
    },
    greet: { first: '¿Jugás dados, mago? Pepe Chucho, para servirle… y para ganarle.', beatYou: '¡Volviste! ¿Querés que te vuelva a dejar sin dados, patojo?', lostToYou: 'Vos otra vez… me dejaste sin sombrero la última vez. Hoy me desquito.', caught: 'Te estoy viendo las manos, mago. No me vas a volver a hacer la de los dados bailarines.' },
  },
  {
    id: 'lady_ambar', name: 'Lady Ámbar', title: 'la Dama de las Sedas', race: 'sirena', job: 'cortesana', gender: 'f',
    persona: { threshold: 0.46, bluff: 0.12, temperature: 0.08, exact: 0.12, perception: 0.85, read: 0.05 },
    lines: {
      think: ['Interesante…', 'Tus ojos dicen otra cosa.', 'Veamos.'], bid: ['Sin temblar.', 'Subo, con permiso.', 'Mi turno, querido.'],
      liar: ['Mentira. Se te nota en los ojos.', 'No. Eso no está en la mesa.'], exact: ['Exacto. Ni uno más, ni uno menos.'],
      lose: ['Qué descortés de mi parte.', 'Un error. Lo anoto.'], win: ['Como esperaba.'], out: ['Me retiro. Pero recordaré tu cara.'],
      caught: ['Eso fue magia, querido. Y yo vendo secretos… incluido este.'],
    },
    greet: { first: 'Lady Ámbar. Juego por información, no por oro… aunque el oro nunca sobra.', beatYou: 'Otra vez tú. La última partida me enseñó todo lo que necesitaba de ti.', lostToYou: 'Me ganaste una vez. No es una costumbre que piense permitirte.', caught: 'La Casa de las Sedas ya sabe que haces trampa, querido. Yo misma se lo dije.' },
  },
  {
    id: 'el_mudo', name: 'El Mudo', title: 'minero de Kharaz', race: 'enano', job: 'minero', gender: 'm', scar: true,
    persona: { threshold: 0.4, bluff: 0.2, temperature: 0.12, exact: 0.08, perception: 0.6, read: 0.04 },
    lines: {
      think: ['…', '(se acaricia la barba)', '(entrecierra los ojos)'], bid: ['(levanta los dedos)', '(golpea la mesa)', '…'],
      liar: ['(señala con el dedo y gruñe)', '¡…!'], exact: ['(asiente una sola vez)'],
      lose: ['(suspira)', '…'], win: ['(sonríe, apenas)'], out: ['(se levanta y se va sin decir nada)'],
      caught: ['(te agarra la muñeca y niega con la cabeza)'],
    },
    greet: { first: '(El enano te mira, asiente, y señala la silla vacía.)', beatYou: '(Te reconoce. Levanta tres dedos: las veces que ha pensado en ti.)', lostToYou: '(Golpea la mesa. Quiere revancha.)', caught: '(Se cruza de brazos. No piensa quitarte la vista de encima.)' },
  },
  {
    id: 'dona_chayito', name: 'Doña Chayito', title: 'abuela y tahúr', race: 'humano', job: 'tabernero', gender: 'f', age: 'old',
    persona: { threshold: 0.42, bluff: 0.25, temperature: 0.1, exact: 0.3, perception: 0.7, read: 0.06 },
    lines: {
      think: ['Ay, mijo…', 'Déjeme pensar.', 'En mis tiempos…'], bid: ['Subo, mijito.', 'Con cariño.', 'Ahí va.'],
      liar: ['¡Mentiroso! Igualito que mi difunto.', 'Mijo, eso no se lo cree ni usted.'], exact: ['Exacto. La abuela nunca falla.'],
      lose: ['Ay, los dados de ahora…', '¡Qué barbaridad!'], win: ['La experiencia, mijo.'], out: ['Me voy a mi hamaca. Suerte, criatura.'],
      caught: ['¡Mijo! ¡Ese dado lo cambió! ¡A mí no me engaña!'],
    },
    greet: { first: 'Siéntese, mijo, que la abuela no muerde. Solo gana.', beatYou: '¿Volvió por su merecido? Qué bueno, porque ando necesitada.', lostToYou: 'Me ganó la vez pasada. Hoy traigo mis dados de la suerte.', caught: 'Ya sé sus mañas, mijo. La abuela todo lo ve.' },
  },
  {
    id: 'capitan_rompeolas', name: 'Capitán Rompeolas', title: 'pirata retirado', race: 'humano', job: 'pirata', gender: 'm', eyepatch: true,
    persona: { threshold: 0.35, bluff: 0.32, temperature: 0.16, exact: 0.15, perception: 0.45, read: 0.03 },
    lines: {
      think: ['Arrr…', 'Huele a tormenta.', 'Mmh.'], bid: ['¡Subo, marinero!', '¡A toda vela!', '¡Arrr!'],
      liar: ['¡Mentira como sirena en tierra!', '¡Al tablón con esa apuesta!'], exact: ['¡Exacto como mi brújula!'],
      lose: ['¡Por las barbas del kraken!', '¡Maldición!'], win: ['¡Botín para el capitán!'], out: ['Me hundo con honor… y sin oro.'],
      caught: ['¡Tramposo! ¡En mi barco te colgaban del mástil!'],
    },
    greet: { first: 'Capitán Rompeolas. Perdí un ojo apostando. El otro lo tengo en tus manos, marinero.', beatYou: '¡El marinero de agua dulce volvió! Otra ronda de humillación, ¿eh?', lostToYou: 'Me hundiste la última vez. Hoy traigo cañones.', caught: 'Tengo un ojo, pero ve por dos. No lo intentes.' },
  },
];

const GEN_ARCHETYPES: Array<{ title: string; job: string; persona: Persona; lines: Lines }> = [
  { title: 'marinera con suerte', job: 'pirata', persona: { threshold: 0.36, bluff: 0.3, temperature: 0.15, exact: 0.12, perception: 0.4, read: 0.03 },
    lines: { think: ['Hmm.', 'A ver…', 'Déjame pensar.'], bid: ['Subo.', 'Va.', 'Ahí va.'], liar: ['¡Mentira!', '¡Eso no hay!'], exact: ['Exacto.'], lose: ['¡Maldición!', 'Uf.'], win: ['¡Ja!'], out: ['Me retiro.'], caught: ['¡Trampa! ¡Lo vi!'] } },
  { title: 'mercader desconfiado', job: 'mercader', persona: { threshold: 0.47, bluff: 0.08, temperature: 0.07, exact: 0.08, perception: 0.75, read: 0.05 },
    lines: { think: ['Calculando…', 'Los números no mienten.', 'Mmm.'], bid: ['Una oferta justa.', 'Subo, con cuidado.'], liar: ['Mentira. Lo sé.', 'No me cuadra.'], exact: ['Exacto, como mi libro de cuentas.'], lose: ['Una pérdida menor.', 'Qué mal negocio.'], win: ['Buen negocio.'], out: ['Mala inversión.'], caught: ['¡Eso fue un truco! ¡Guardias!'] } },
  { title: 'soldado de permiso', job: 'soldado', persona: { threshold: 0.34, bluff: 0.28, temperature: 0.18, exact: 0.15, perception: 0.35, read: 0.03 },
    lines: { think: ['¿Eh?', 'Mmm…', 'Ya voy.'], bid: ['¡A la carga!', '¡Subo!'], liar: ['¡Mentiroso!', '¡No te creo nada!'], exact: ['¡Exacto!'], lose: ['¡Rayos!'], win: ['¡Victoria!'], out: ['Me rindo…'], caught: ['¡Tramposo! ¡Ese dado se movió!'] } },
];
const GEN_RACES: RaceId[] = ['humano', 'duende', 'enano', 'elfo', 'sirena', 'picaro', 'trol', 'bruja'];

/** A procedurally generated tahúr (used when the named rivals don't fill the table). */
function genRival(): RivalDef {
  const rng = new Rng(Math.floor(Math.random() * 2 ** 31));
  const race = rng.pick(GEN_RACES);
  const gender: 'f' | 'm' = rng.chance(0.5) ? 'f' : 'm';
  const arch = rng.pick(GEN_ARCHETYPES);
  const name = randomName(race, gender, rng);
  const id = `tahur_${name.toLowerCase().normalize('NFD').replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '')}`;
  return {
    id, name, title: arch.title, race, job: arch.job, gender, persona: arch.persona, lines: arch.lines,
    greet: { first: `${name}. Juego poco, pero juego bien.`, beatYou: `Ah, el mago. ¿Otra lección?`, lostToYou: `Me debes una revancha, mago.`, caught: 'Te estoy mirando las manos.' },
  };
}

function seatFor(d: RivalDef): Seat {
  const npc = NPCS[d.id];
  const name = npc?.name ?? d.name;
  const race = (npc?.race ?? d.race) as RaceId;
  const job = npc?.job ?? d.job;
  const gender = (npc?.gender ?? d.gender) as 'f' | 'm';
  const mem = cs().rivals[d.id];
  const grudge = mem ? Math.min(1.5, mem.caught * 1 + (mem.lostToYou > mem.beatYou ? 0.25 : 0)) : 0;
  const drunk = d.id === 'pepe_chucho' && Math.random() < 0.3;
  return {
    id: d.id, name, title: npc?.title ?? d.title, persona: d.persona, lines: d.lines, grudge, drunk,
    portrait: (m) => portraitSVG({ seed: d.id, race, job, gender, age: npc?.age ?? d.age, mood: m as PortraitMood, eyepatch: npc?.portrait?.eyepatch ?? d.eyepatch, scar: npc?.portrait?.scar ?? d.scar }, 96),
  };
}

const STAKES = [50, 250, 1000, 5000];

export function openDados(ctx: GameCtx): GameView {
  const { host } = ctx;
  const s = cs();
  let table: LiarsTable | null = null;
  let stake = 250;
  let size: 3 | 4 = 3;
  let playing = false;
  const rake = casinoClosed() ? 0 : 0.05;

  const body = h('div', { class: 'cs-dd' });
  const rules = rulesSheet('Dados Mentirosos', h('div', null,
    h('p', null, 'Cada jugador agita sus dados en secreto. Por turnos se apuesta cuántos dados de una cara hay ', h('b', null, 'en toda la mesa'), ' (por ejemplo, "cinco cuatros"). Los ', h('b', null, 'unos (Eclipses) son comodines'), '.'),
    h('p', null, 'Cada apuesta debe subir la cantidad, o mantenerla con una cara mayor. O puedes gritar ', h('b', null, '¡Mentiroso!'), ': se levantan los cubiletes y pierde un dado quien se equivocó. ', h('b', null, '¡Exacto!'), ' recupera un dado si aciertas la cantidad justa.'),
    h('p', null, 'El último con dados se lleva el bote', rake > 0 ? ` (la casa se queda el ${Math.round(rake * 100)}%).` : ' (en el Clandestino no hay comisión).'),
    h('p', { class: 'muted' }, 'Trampas: Dominar Mente te deja ver los dados de un rival; el Velo cambia uno de los tuyos. Cada tahúr tiene su propia vista… y memoria.')));
  const root = h('div', { class: 'cs-game cs-dados' },
    gameHeader('dados', 'Dados Mentirosos', 'Farolea, desconfía, sobrevive', () => host.back(), h('button', { class: 'cs-btn small', onclick: () => rules.toggle() }, 'Reglas')),
    body, rules.el);
  ctx.root.appendChild(root);

  function pickRivals(n: number): RivalDef[] {
    const met = RIVALS.filter((r) => s.rivals[r.id]);
    const pool = RIVALS.slice();
    const out: RivalDef[] = [];
    if (met.length && Math.random() < 0.8) out.push(met[Math.floor(Math.random() * met.length)]);
    const core = ['pepe_chucho', 'lady_ambar', 'el_mudo'];
    for (const id of core) if (out.length < n && !out.find((r) => r.id === id) && Math.random() < 0.75) out.push(pool.find((r) => r.id === id)!);
    // a stranger sometimes takes the last seat
    if (out.length < n && Math.random() < 0.35) out.push(genRival());
    while (out.length < n) { const r = pool[Math.floor(Math.random() * pool.length)]; if (!out.includes(r)) out.push(r); }
    return out.slice(0, n);
  }
  let rivals = pickRivals(2);

  function renderSetup(): void {
    playing = false;
    body.innerHTML = '';
    const seats = h('div', { class: 'cs-dd-seats' }, ...rivals.map((r) => {
      const m = s.rivals[r.id];
      const line = !m ? r.greet.first : m.caught > 0 ? r.greet.caught : m.beatYou > m.lostToYou ? r.greet.beatYou : r.greet.lostToYou;
      const sf = seatFor(r);
      const card = h('div', { class: 'cs-dd-rival' },
        h('div', { class: 'cs-dd-portrait', html: sf.portrait(m && m.caught ? 'angry' : m && m.beatYou > m.lostToYou ? 'smug' : 'smile') }),
        h('div', { class: 'cs-dd-rname' }, sf.name), h('div', { class: 'cs-dd-rtitle' }, sf.title),
        m ? h('div', { class: 'cs-dd-rec' }, `Te ganó ${m.beatYou} · le ganaste ${m.lostToYou}${m.caught ? ` · te pilló ${m.caught}` : ''}`) : h('div', { class: 'cs-dd-rec new' }, 'Nuevo rival'),
        sf.drunk ? h('div', { class: 'cs-tag hot' }, 'Borracho: farolea de más') : null);
      window.setTimeout(() => bubble(card, line, 5200), 300 + Math.random() * 600);
      return card;
    }));
    const stakeBtns = h('div', { class: 'cs-dd-stakes' }, ...STAKES.map((v) => h('button', { class: `cs-btn ${v === stake ? 'gold on' : ''}`, disabled: gold() < v, onclick: () => { stake = v; audio.sfx('chip_place'); renderSetup(); } }, `${fmt(v)} de oro`)));
    const sizeBtns = h('div', { class: 'cs-dd-stakes' },
      h('button', { class: `cs-btn ${size === 3 ? 'gold on' : ''}`, onclick: () => { size = 3; rivals = pickRivals(2); renderSetup(); } }, 'Mesa de 3'),
      h('button', { class: `cs-btn ${size === 4 ? 'gold on' : ''}`, onclick: () => { size = 4; rivals = pickRivals(3); renderSetup(); } }, 'Mesa de 4'),
      h('button', { class: 'cs-btn small', onclick: () => { rivals = pickRivals(size - 1); audio.sfx('card_deal'); renderSetup(); } }, '↻ Otra mesa'));
    const pot = stake * size;
    const sit = h('button', { class: 'cs-btn gold big', disabled: gold() < stake, onclick: () => void start() }, `Sentarse · bote ${fmt(Math.round(pot * (1 - rake)))}`);
    body.append(h('div', { class: 'cs-dd-setup' },
      h('div', { class: 'cs-dd-title' }, 'La mesa de los tahúres'), seats,
      h('div', { class: 'cs-dd-row' }, h('div', { class: 'cs-dd-label' }, 'Entrada'), stakeBtns),
      h('div', { class: 'cs-dd-row' }, h('div', { class: 'cs-dd-label' }, 'Mesa'), sizeBtns),
      sit));
  }

  async function start(): Promise<void> {
    if (playing) return;
    if (!takeBet('dados', stake)) { audio.sfx('ui_error'); return; }
    if (await host.raidCheck('dados', stake)) return;
    playing = true;
    body.innerHTML = '';
    const seats = rivals.map(seatFor);
    for (const r of rivals) { const m = rivalMem(r.id, r.name); m.played++; m.lastLuna = luna(); }
    const tbl = new LiarsTable({
      root: body, seats, dice: 4, alive: () => ctx.alive(), cheats: true,
      onCaught: (by) => {
        const m = rivalMem(by.id, by.name); m.caught++;
        try { remember(by.id, { kind: 'enganado', text: 'Me hizo trampa en los dados del Gran Casino', where: 'puerto_fortuna', intensity: 6 }); feel(by.id, { odio: 15 }); } catch { /* stub */ }
        settle('dados', stake, 0);
        playing = false;
        void host.caught('dados', `${by.name} te vio hacer trampa`);
      },
    });
    table = tbl;
    const result = await tbl.play();
    if (!ctx.alive() || result.quit || result.caught) return;
    table = null;
    const pot = Math.round(stake * size * (1 - rake));
    host.hud.holdGold();
    const won = result.winner === 'player';
    const r = settle('dados', stake, won ? pot : 0);
    for (const rv of rivals) {
      const m = rivalMem(rv.id, rv.name);
      if (won) { m.lostToYou++; try { remember(rv.id, { kind: 'humillado', text: 'Me ganó a los Dados Mentirosos en el Gran Casino', where: 'puerto_fortuna', intensity: 3 }); feel(rv.id, { respeto: 5 }); } catch { /* stub */ } }
      else if (result.winner === rv.id) { m.beatYou++; try { remember(rv.id, { kind: 'pagado', text: 'Le gané a los dados y se fue con los bolsillos vacíos', where: 'puerto_fortuna', intensity: 2 }); } catch { /* stub */ } }
    }
    if (won) {
      cleanRound();
      const o = centerOf(body);
      coinBurst(o.x, o.y, 40);
      host.celebrate(r.net >= stake * 5 ? 2 : 1);
      await winBanner(tierFor(r.net, stake) ?? 'win', r.net, { origin: o, sub: 'EL BOTE ES TUYO' });
      host.say('¡Le ganaste a los tahúres, patojo! Eso no pasa todos los días… bueno, sí, pero no a vos.');
    } else {
      const w = RIVALS.find((x) => x.id === result.winner);
      host.gloat();
      host.say(w ? `${w.name} se llevó el bote. La próxima, patojo.` : 'La casa… digo, la mesa, gana.', { mood: 'smug' });
    }
    host.hud.releaseGold();
    rivals = pickRivals(size - 1);
    renderSetup();
  }

  renderSetup();
  host.say('Los tahúres no perdonan, patojo. Y se acuerdan de todo.', { mood: 'smug' });

  return {
    onKey: (e) => table?.onKey(e) ?? false,
    close() {
      if (table && playing) { settle('dados', stake, 0); }
      table?.dispose();
      table = null;
      host.hud.releaseGold();
      root.remove();
      void G;
    },
  };
}
