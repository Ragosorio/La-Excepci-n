/**
 * El Libro de la Realidad — an open book: choose a rewrite (left page), choose its price (right page), sign.
 * Opening and closing without signing is recorded (track('hesitations')). The ending uses { forced: 'tiempo' }:
 * only "No existe el tiempo." and only "Tu nombre." → player.nameSacrificed = true + refreshTitle().
 *
 * Effects applied here: nadie_me_vio (Alerta 0), oro_doble (3 lunas), lider_leal (NpcState.loyal), reliquia_mia
 * (grant), nunca_mori (+1 Retorno), siempre_temido (+20 corrupción), and every sacrifice. Everything is also
 * emitted as 'reality:rewrite' { rewrite, sacrifice } — ids may carry a target after ':' (e.g. 'lider_leal:galvan').
 * Listeners: world → 'ejercito_nunca_existio' (erase the nearest hostile party), battle → 'batalla_ganada'
 * (win the current battle; G.run.flags.reality_next_battle_won is set for the next one otherwise).
 */
import { h, clear, wait } from '../../ui/dom';
import { G, refreshTitle, res } from '../../core/state';
import { bus } from '../../core/events';
import { track } from '../../core/tracker';
import { engine } from '../../core/engine';
import { audio } from '../../audio';
import { toast } from '../../ui/toasts';
import type { ContinentId } from '../../data/types';
import { ABILITIES } from '../../data/abilities';
import { RELICS } from '../../data/relics';
import { NPCS } from '../../data/npcs';
import { CONTINENTS, CONTINENT_IDS, LOCATIONS } from '../../data/world';
import { PS, hasRun } from './pstate';
import { acquiredIds, forgetAbility } from './codex';
import { grantRelic, hasRelic, relicInstances, relicPassive, removeRelic } from './relics';
import { syncVitals } from './stats';
import { openOverlay } from './pgui';

export interface RealityOutcome { rewrite: string; sacrifice: string }

interface Choice { id: string; label: string }
interface Option {
  id: string;
  text: string;               // written in the book
  note: string;               // small explanation
  enabled: () => string | true; // true or a reason why not
  targets?: () => Choice[];   // needs a sub-choice
}

// ───────────────────────────── rewrites ─────────────────────────────

const LEADER_ROLES = new Set(['gobernante', 'delegado', 'jefe', 'rival', 'informante', 'heroe']);
const NEVER_LOYAL = new Set(['aurel', 'bruma', 'mara_colmenas', 'tomas_colmenas']);

function leaderTargets(): Choice[] {
  return Object.values(NPCS).filter((n) => LEADER_ROLES.has(n.role ?? '') && !NEVER_LOYAL.has(n.id))
    .filter((n) => { const s = G.run.npcs?.[n.id]; return (!s || s.alive) && !s?.loyal; })
    .map((n) => ({ id: n.id, label: `${n.name}${n.title ? ` — ${n.title}` : ''}` }));
}

function relicTargets(): Choice[] {
  const out: Choice[] = [];
  const seen = new Set<string>();
  for (const r of Object.values(RELICS)) {
    if (r.id === 'eclipse' || r.id === 'libro_realidad' || hasRelic(r.id) || !r.location) continue;
    out.push({ id: r.id, label: `${r.name} — ${LOCATIONS[r.location]?.name ?? ''}` }); seen.add(r.id);
  }
  for (const [lid, l] of Object.entries(G.run.locations ?? {})) {
    if (!l?.relic || seen.has(l.relic) || hasRelic(l.relic) || !RELICS[l.relic] || !(l.visited || l.explored)) continue;
    out.push({ id: l.relic, label: `${RELICS[l.relic].name} — ${LOCATIONS[lid]?.name ?? lid}` }); seen.add(l.relic);
  }
  return out;
}

function continentTargets(filter: (c: ContinentId) => boolean): Choice[] {
  return CONTINENT_IDS.filter((c) => G.run.continents?.[c] && filter(c)).map((c) => ({ id: c, label: `${CONTINENTS[c].name} (${Math.round(G.run.continents[c].corruption)}%)` }));
}

const REWRITES: Option[] = [
  { id: 'nadie_me_vio', text: 'Nadie me ha visto.', note: 'La Alerta del Concilio vuelve a 0.', enabled: () => (G.run.player.alert > 0 ? true : 'Nadie te está buscando… todavía.') },
  { id: 'oro_doble', text: 'El oro vale el doble.', note: 'Todo el oro que ganes vale el doble durante 3 lunas.', enabled: () => (G.run.luna < PS().goldDoubleUntil ? 'Ya vale el doble.' : true) },
  { id: 'lider_leal', text: 'Ese líder siempre me fue leal.', note: 'Un líder, delegado o jefe te ha sido leal desde siempre.', enabled: () => (leaderTargets().length ? true : 'No queda nadie a quien reescribir.'), targets: leaderTargets },
  { id: 'reliquia_mia', text: 'Esa reliquia siempre fue mía.', note: 'Una reliquia que conoces aparece en tus manos.', enabled: () => (relicTargets().length ? true : 'No conoces ninguna reliquia ajena.'), targets: relicTargets },
  { id: 'ejercito_nunca_existio', text: 'Este ejército nunca existió.', note: 'El ejército enemigo más cercano deja de haber existido.', enabled: () => true },
  { id: 'batalla_ganada', text: 'Esta batalla ya la gané.', note: 'La batalla actual (o la próxima) termina en victoria.', enabled: () => (G.run.flags.reality_next_battle_won ? 'Ya está escrita.' : true) },
  { id: 'nunca_mori', text: 'Nunca morí aquella noche.', note: '+1 carga de Retorno en cada batalla, para siempre (en este ciclo).', enabled: () => true },
  { id: 'siempre_temido', text: 'Aquí siempre me temieron.', note: '+20 de corrupción (Terror) en un continente.', enabled: () => (continentTargets((c) => !G.run.continents[c].corrupted).length ? true : 'Ya todo te teme.'),
    targets: () => continentTargets((c) => !G.run.continents[c].corrupted) },
];

// ───────────────────────────── sacrifices ─────────────────────────────

const FIXED = new Set(['chispa_arcana', 'esquivar']);
const SACRIFICES: Option[] = [
  { id: 'habilidad', text: 'Algo que comprendí.', note: 'Una habilidad del Códice. La olvidas durante este ciclo.', enabled: () => (abilityTargets().length ? true : 'No sabes nada que valga la pena olvidar.'), targets: () => abilityTargets() },
  { id: 'reliquia', text: 'Una reliquia.', note: 'Desaparece. Como si nunca la hubieras tenido.', enabled: () => (relicSacTargets().length ? true : 'No tienes nada que dar.'), targets: () => relicSacTargets() },
  { id: 'ejercito', text: 'La mitad de mi ejército.', note: 'La mitad de tus tropas deja de existir.', enabled: () => (G.run.player.army.length >= 2 ? true : 'No tienes ejército que partir.') },
  { id: 'vida', text: 'Una parte de mi vida.', note: '−20% de vida máxima durante este ciclo.', enabled: () => (PS().hpPenalty > 0.35 ? true : 'Ya no te queda suficiente vida que dar.') },
  { id: 'corrupcion', text: 'Lo que corrompí.', note: '−30 de corrupción en un continente.', enabled: () => (continentTargets((c) => !G.run.continents[c].corrupted && G.run.continents[c].corruption >= 10).length ? true : 'No hay corrupción que devolver.'),
    targets: () => continentTargets((c) => !G.run.continents[c].corrupted && G.run.continents[c].corruption >= 10) },
  { id: 'recuerdo', text: 'Un recuerdo.', note: 'Una página del Libro que encontraste. Se borra.', enabled: () => ((G.meta?.pages.length ?? 0) > 0 ? true : 'Todavía no recuerdas nada.') },
  { id: 'pluma', text: 'Nada. Esta vez escribo yo.', note: 'La Pluma del Narrador: una reescritura gratis por ciclo.', enabled: () => (relicPassive('free_rewrite') - PS().freeRewritesUsed > 0 ? true : 'Necesitas la Pluma del Narrador.') },
];

function abilityTargets(): Choice[] {
  return acquiredIds().filter((id) => !FIXED.has(id) && ABILITIES[id]).map((id) => ({ id, label: ABILITIES[id].name }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}
function relicSacTargets(): Choice[] {
  return relicInstances().filter((r) => r.id !== 'libro_realidad' && RELICS[r.id]).map((r) => ({ id: r.uid, label: `${RELICS[r.id].name}${r.level ? ` +${r.level}` : ''}` }));
}

// ───────────────────────────── apply ─────────────────────────────

function applyRewrite(id: string, target: string | null): string {
  const run = G.run;
  switch (id) {
    case 'nadie_me_vio': res.add('alert', -run.player.alert, { raw: true }); return 'La Alerta cae a 0.';
    case 'oro_doble': PS().goldDoubleUntil = run.luna + 3; return 'El oro vale el doble durante 3 lunas.';
    case 'lider_leal': {
      if (!target) return '';
      const s = run.npcs?.[target];
      if (s) {
        s.loyal = true;
        s.feelings = { ...s.feelings, respeto: 100, odio: 0, miedo: Math.min(s.feelings.miedo, 20) };
        s.memories = [...(s.memories ?? []), { kind: 'reescrito', text: 'Siempre te fui leal. Siempre.', luna: run.luna, intensity: 10 }];
      }
      run.flags[`reescrito_leal_${target}`] = true;
      return `${NPCS[target]?.name ?? target} siempre te fue leal.`;
    }
    case 'reliquia_mia': if (target) grantRelic(target, { reveal: true, where: 'libro_realidad' }); return target ? `${RELICS[target]?.name} siempre fue tuya.` : '';
    case 'ejercito_nunca_existio': run.flags.reality_army_erased = (Number(run.flags.reality_army_erased) || 0) + 1; return 'Un ejército deja de haber existido.';
    case 'batalla_ganada': if (engine.sceneId !== 'battle') run.flags.reality_next_battle_won = true; return 'La batalla ya está ganada.';
    case 'nunca_mori': run.player.retornoMax += 1; return '+1 carga de Retorno.';
    case 'siempre_temido': {
      const c = target as ContinentId | null;
      const cs = c ? run.continents[c] : null;
      if (cs) { cs.paths.terror = (cs.paths.terror ?? 0) + 20; cs.corruption = Math.min(99, cs.corruption + 20); }
      return c ? `${CONTINENTS[c].name} siempre te temió.` : '';
    }
    default: return '';
  }
}

function applySacrifice(id: string, target: string | null): string {
  const run = G.run;
  switch (id) {
    case 'habilidad': if (target) forgetAbility(target); return target ? `Olvidas ${ABILITIES[target]?.name ?? target}.` : '';
    case 'reliquia': { const inst = relicInstances().find((r) => r.uid === target); if (inst) removeRelic(inst.uid, 'sacrificio'); return inst ? `${RELICS[inst.id]?.name} deja de existir.` : ''; }
    case 'ejercito': {
      const army = run.player.army;
      const n = Math.floor(army.length / 2);
      for (let i = 0; i < n; i++) army.splice(Math.floor(Math.random() * army.length), 1);
      track('units_lost', n);
      return `${n} soldados dejan de haber existido.`;
    }
    case 'vida': PS().hpPenalty *= 0.8; syncVitals(); return 'Tu vida máxima se reduce un 20%.';
    case 'corrupcion': {
      const c = target as ContinentId | null;
      const cs = c ? run.continents[c] : null;
      if (cs) {
        let left = 30;
        cs.corruption = Math.max(0, cs.corruption - 30);
        for (const p of ['terror', 'codicia', 'intriga', 'conquista'] as const) { const take = Math.min(left, cs.paths[p] ?? 0); cs.paths[p] -= take; left -= take; }
      }
      return c ? `${CONTINENTS[c].name} olvida parte de tu sombra.` : '';
    }
    case 'recuerdo': { const pages = G.meta?.pages ?? []; const lost = pages.pop(); return lost ? 'Un recuerdo se borra del Libro.' : ''; }
    case 'pluma': PS().freeRewritesUsed += 1; return 'La Pluma escribe sola.';
    case 'nombre': run.player.nameSacrificed = true; refreshTitle(); return 'Tu nombre.';
    default: return '';
  }
}

// ───────────────────────────── UI ─────────────────────────────

let busy = false;

export async function openRealityBook(opts: { forced?: 'tiempo' } = {}): Promise<RealityOutcome | null> {
  if (!hasRun() || busy) return null;
  const forced = opts.forced === 'tiempo';
  if (!forced && !G.run.player.books.realidad && !hasRelic('libro_realidad')) {
    toast('Necesitas <b>El Libro de la Realidad</b>. Duerme en la Bóveda de Tiburcio.', { kind: 'bad', sound: true });
    return null;
  }
  busy = true;
  return new Promise<RealityOutcome | null>((resolve) => {
    let done = false;
    let signed = false;
    const sel: { rw: string | null; rwT: string | null; sc: string | null; scT: string | null } = forced
      ? { rw: 'tiempo', rwT: null, sc: 'nombre', scT: null } : { rw: null, rwT: null, sc: null, scT: null };
    const left = h('div', { class: 'pg-page left' });
    const right = h('div', { class: 'pg-page right' });
    const seal = h('div', { class: 'pg-book-seal' });
    const book = h('div', { class: `pg-book ${forced ? 'pg-forced' : ''}` }, left, right, seal);
    const ov = openOverlay({ key: 'reality', shell: false, className: 'pg-book-back', onClose: () => finish(null) }, book);
    audio.sfx('page_turn');
    audio.ambience('void', true, 0.35);

    function finish(out: RealityOutcome | null): void {
      if (done) return;
      done = true;
      busy = false;
      audio.ambience('void', false);
      if (!out && !signed) track('hesitations');
      if (ov.open) ov.close();
      resolve(out);
    }

    const optionLine = (o: Option, chosen: string | null, chosenT: string | null, blood: boolean, pick: (id: string, t: string | null) => void): HTMLElement => {
      const en = o.enabled();
      const isSel = chosen === o.id;
      const line = h('div', { class: `pg-line ${blood ? 'blood' : ''} ${isSel ? 'sel' : ''} ${en === true ? '' : 'disabled'}`, 'data-tip': en === true ? undefined : en },
        o.text, h('small', null, en === true ? o.note : en));
      line.addEventListener('click', () => { if (en !== true || signed) return; audio.sfx('quill', { volume: 0.5 }); pick(o.id, null); });
      const wrap = h('div', null, line);
      if (isSel && o.targets) {
        const subs = h('div', { class: 'pg-sub-choices' }, ...o.targets().map((t) => h('div', { class: `pg-sub ${chosenT === t.id ? 'sel' : ''}`, onclick: () => { if (signed) return; audio.sfx('ui_click', { volume: 0.5 }); pick(o.id, t.id); } }, t.label)));
        wrap.appendChild(subs);
      }
      return wrap;
    };

    const ready = (): boolean => {
      if (forced) return true;
      const rw = REWRITES.find((o) => o.id === sel.rw), sc = SACRIFICES.find((o) => o.id === sel.sc);
      return !!rw && !!sc && (!rw.targets || !!sel.rwT) && (!sc.targets || !!sel.scT);
    };

    const render = (): void => {
      clear(left); clear(right);
      left.append(h('div', { class: 'pg-page-h' }, forced ? 'La última regla' : 'Reescribir'), h('div', { class: 'pg-page-rule' }));
      right.append(h('div', { class: 'pg-page-h' }, 'El precio'), h('div', { class: 'pg-page-rule' }));
      if (forced) {
        left.append(h('div', { class: 'pg-lines' }, h('div', { class: 'pg-line sel' }, 'No existe el tiempo.', h('small', null, 'Todos los momentos, a la vez. Para siempre.'))));
        right.append(h('div', { class: 'pg-lines' }, h('div', { class: 'pg-line blood sel' }, 'Tu nombre.', h('small', null, 'Elias Veyr'))));
      } else {
        left.append(h('div', { class: 'pg-lines' }, ...REWRITES.map((o) => optionLine(o, sel.rw, sel.rwT, false, (id, t) => { sel.rw = id; sel.rwT = t; render(); }))));
        right.append(h('div', { class: 'pg-lines' }, ...SACRIFICES.map((o) => optionLine(o, sel.sc, sel.scT, true, (id, t) => { sel.sc = id; sel.scT = t; render(); }))));
      }
      left.append(h('div', { class: 'pg-page-num' }, '— ∞ —'));
      const sign = h('button', { class: 'pg-quill', disabled: !ready() }, forced ? 'Escribir la última regla' : 'Firmar');
      sign.addEventListener('click', () => void doSign());
      const closeBtn = h('button', { class: 'pg-quill ghost', onclick: () => finish(null) }, 'Cerrar el libro');
      right.append(h('div', { class: 'pg-book-actions' }, closeBtn, sign), h('div', { class: 'pg-page-num' }, forced ? '— la última —' : '— lo que se paga no vuelve —'));
    };

    const inkWrite = async (el: HTMLElement, text: string, speed = 55): Promise<HTMLElement[]> => {
      const spans: HTMLElement[] = [];
      for (const [i, ch] of [...text].entries()) {
        const s = h('span', { class: 'ch' }, ch);
        el.appendChild(s); spans.push(s);
        if (i % 3 === 0) audio.sfx('quill', { volume: 0.35, pitch: 0.9 + Math.random() * 0.3 });
        await wait(speed);
      }
      return spans;
    };

    const doSign = async (): Promise<void> => {
      if (signed || !ready()) return;
      signed = true;
      const rw = forced ? null : REWRITES.find((o) => o.id === sel.rw)!;
      const sc = forced ? null : SACRIFICES.find((o) => o.id === sel.sc)!;
      clear(left); clear(right);
      const inkL = h('div', { class: 'pg-ink' });
      const inkR = h('div', { class: 'pg-ink blood' });
      left.append(h('div', { class: 'pg-page-h' }, 'Y así fue'), h('div', { class: 'pg-page-rule' }), h('div', { style: 'flex:1;display:flex;align-items:center;justify-content:center' }, inkL));
      right.append(h('div', { class: 'pg-page-h' }, 'Y así se pagó'), h('div', { class: 'pg-page-rule' }), h('div', { style: 'flex:1;display:flex;align-items:center;justify-content:center' }, inkR));
      audio.duck(0.7, 6);
      await inkWrite(inkL, forced ? 'No existe el tiempo.' : rw!.text, forced ? 90 : 55);
      await wait(350);
      const tLabel = (o: Option | null, t: string | null) => (o?.targets && t ? o.targets().find((x) => x.id === t)?.label ?? '' : '');
      const priceText = forced ? 'Elias Veyr' : `${sc!.text}${tLabel(sc, sel.scT) ? ` ${tLabel(sc, sel.scT)}.` : ''}`;
      const spans = await inkWrite(inkR, priceText, forced ? 120 : 50);
      await wait(400);
      let outcome: RealityOutcome;
      if (forced) {
        // the name dissolves, letter by letter; the book (and the UI) fails for a moment
        book.classList.add('glitch');
        try { engine.pipeline.chromaticPulse(1.6, 1.6); } catch { /* ignore */ }
        for (const s of [...spans].reverse()) { s.classList.add('gone'); audio.sfx('glitch', { volume: 0.5, pitch: 0.6 + Math.random() * 0.8 }); await wait(140); }
        await wait(500);
        applySacrifice('nombre', null);
        outcome = { rewrite: 'tiempo', sacrifice: 'nombre' };
      } else {
        const d1 = applyRewrite(rw!.id, sel.rwT);
        const d2 = applySacrifice(sc!.id, sel.scT);
        outcome = { rewrite: sel.rwT ? `${rw!.id}:${sel.rwT}` : rw!.id, sacrifice: sel.scT ? `${sc!.id}:${sel.scT}` : sc!.id };
        PS().rewrites.push({ rewrite: outcome.rewrite, sacrifice: outcome.sacrifice, luna: G.run.luna, detail: [d1, d2].filter(Boolean).join(' ') });
        if (d1) setTimeout(() => toast(d1, { kind: 'mitica', duration: 4.5 }), 1400);
        if (d2) setTimeout(() => toast(d2, { kind: 'bad', duration: 4.5 }), 2000);
      }
      if (outcome.sacrifice !== 'pluma') track('sacrifices');
      track('rewrites');
      seal.classList.add('on');
      audio.sfx('bell');
      try { engine.pipeline.flash('#9b5cff', 0.55, 0.7); } catch { /* ignore */ }
      bus.emit('reality:rewrite', outcome);
      await wait(700);
      right.classList.add('closing');
      audio.sfx('page_turn', { pitch: 0.7 });
      await wait(1150);
      finish(outcome);
    };

    render();
  });
}
