/**
 * Location actions (GDD §4.9): every entry knows when it is available, what it costs, what it risks,
 * and runs a juicy flow (dial roll, fx, townsfolk reactions) before handing consequences to `applyDeed`.
 */
import type { CorruptionPath, LocationDef } from '../../data/types';
import { NPCS } from '../../data/npcs';
import { RELICS } from '../../data/relics';
import { G, res, type LocationState } from '../../core/state';
import { track } from '../../core/tracker';
import { addNews } from '../../core/news';
import { activeQuests } from '../../core/quests';
import { engine } from '../../core/engine';
import { bus } from '../../core/events';
import { h, esc } from '../../ui/dom';
import { modal, confirmModal, type ModalAction } from '../../ui/widgets';
import { toast, banner } from '../../ui/toasts';
import { narrate } from '../../ui/narrator';
import { dialogue } from '../../ui/dialogue';
import { audio } from '../../audio';
import { applyDeed, npcsAt, openMarket, openSedas, openBank, talkTo, yearAnswer, repValue, councilStatus, attendCouncil, type Deed, type DeedOutcome } from '../../systems/society/api';
import { knows } from '../../systems/progression/codex';
import { grantRelic } from '../../systems/progression/relics';
import { effective } from '../../systems/progression/stats';
import { openForge, openAcademy } from '../../systems/progression/workshops';
import { W } from '../../systems/world/state';
import { totalPower, odds, defenderPower } from '../../systems/world/forces';
import { launchBattle, siegeBattle, ruinBattle, conquestNews } from '../../systems/world/battles';
import { passLunas, lunasText } from '../../systems/world/time';
import { ACTION_ICON } from '../overworld/icons';
import { rollDial, consequences } from './roll';
import { openRecruit } from './recruit';
import { openTavern } from './tavern';
import type { LocationDiorama } from './diorama';

export interface LocCtx {
  id: string;
  def: LocationDef;
  st: LocationState;
  dio: LocationDiorama;
  refresh(): void;
  leave(scene?: string, params?: unknown): void;
  shake(n: number): void;
  busy(on: boolean): void;
}

export type ActionGroup = 'gente' | 'servicios' | 'poder' | 'guerra' | 'tu';
export interface LocAction {
  id: string;
  group: ActionGroup;
  label: string;
  icon: string;
  cost?: string;
  tip: string;
  disabled?: string;
  hot?: boolean;
  danger?: boolean;
  run(ctx: LocCtx): Promise<void> | void;
}

export const GROUP_NAME: Record<ActionGroup, string> = { gente: 'Gente', servicios: 'Servicios', poder: 'Poder', guerra: 'Guerra', tu: 'Tú' };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const stat = (s: Parameters<typeof effective>[0]) => { try { return effective(s); } catch { return G.run.player.stats[s] ?? 5; } };
const knowsSafe = (id: string) => { try { return knows(id); } catch { return false; } };
const isMine = (st: LocationState) => st.control === 'excepcion';

/** Snapshot → applyDeed → if the society layer changed nothing (stub), apply a light local fallback. */
function deed(d: Deed, ctx: LocCtx, fallback: () => void): DeedOutcome {
  const st = ctx.st;
  const cont = G.run.continents[ctx.def.continent];
  const before = `${st.fear}|${st.loyalty}|${st.prosperity}|${cont?.corruption}|${G.run.player.alert}`;
  let out: DeedOutcome = {};
  try { out = applyDeed(d) ?? {}; } catch (err) { console.warn('[location] applyDeed failed', err); }
  const after = `${st.fear}|${st.loyalty}|${st.prosperity}|${cont?.corruption}|${G.run.player.alert}`;
  if (before === after && !Object.keys(out).length) fallback();
  return out;
}
function localCorruption(ctx: LocCtx, path: CorruptionPath, amount: number): void {
  const c = G.run.continents[ctx.def.continent];
  if (!c || ctx.def.continent === 'concordia') return;
  const v = amount * (c.pathMult?.[path] ?? 1);
  c.paths[path] = (c.paths[path] ?? 0) + v;
  c.corruption = Math.min(100, c.corruption + v);
}
function adjust(st: LocationState, k: 'fear' | 'loyalty' | 'prosperity', d: number): void { st[k] = clamp(st[k] + d, 0, 100); }

async function showResult(title: string, items: Array<{ label: string; good?: boolean }>, text?: string, out?: DeedOutcome): Promise<void> {
  if (out?.lines?.length) items = [...items.filter((i) => /oro|Secreto|Influencia|maná|muerto|Reliquia/i.test(i.label)), ...out.lines.map((l) => ({ label: l, good: !/Alerta|Reputaci|Lealtad|−|-\d/.test(l) }))];
  if (!items.length && !text) return;
  await modal({ title, body: h('div', { class: 'lx-col' }, text ? h('div', { class: 'lx-book', style: 'font-size:17px' }, text) : null, consequences(items)), actions: [{ label: 'Continuar', value: 'ok', kind: 'primary', hotkey: 'Enter' }] });
}

// ───────────────────────── flows ─────────────────────────

async function doTerror(ctx: LocCtx): Promise<void> {
  const { st } = ctx;
  const ratio = totalPower() / Math.max(1, st.garrison);
  const chance = clamp(0.35 + 0.035 * stat('presencia') + 0.25 * Math.min(2, ratio) + G.run.player.titleIndex * 0.05 - st.loyalty / 400, 0.1, 0.95);
  const r = await rollDial({ title: 'Aterrorizar', subtitle: ctx.def.name, chance, flavor: 'Que te teman es más barato que que te quieran.', color: '#e2455b' });
  ctx.dio.fx.emit('shadow', ctx.dio.focus, { count: 60, scale: 3 });
  ctx.dio.fx.ring(ctx.dio.focus.clone().setY(ctx.dio.baseY + 0.3), { color: '#9b5cff', radius: 30, duration: 0.9 });
  audio.sfx('explosion', { volume: 0.5 }); audio.sfx('crowd_gasp');
  ctx.shake(0.7);
  engine.pipeline.flash('#3a0a24', 0.4, 0.6);
  track('terror_acts');
  if (r === 'fail') {
    ctx.dio.react('calm');
    res.add('alert', 6);
    deed({ kind: 'terror', location: ctx.id, magnitude: 0.3, path: 'terror' }, ctx, () => { adjust(st, 'fear', 4); adjust(st, 'loyalty', 5); });
    await showResult('Nadie se arrodilla', [{ label: '+6 Alerta' }, { label: '+Lealtad al enemigo' }], 'Se ríen. Uno te lanza una piedra. Otro corre a avisar a la guardia.');
    if (st.garrison > 0 && Math.random() < 0.5) await guardFight(ctx, 'La guardia responde');
  } else {
    ctx.dio.react('terror');
    const mag = r === 'crit' ? 1.6 : 1;
    const out = deed({ kind: 'terror', location: ctx.id, magnitude: mag, path: 'terror' }, ctx, () => {
      adjust(st, 'fear', 18 * mag); adjust(st, 'loyalty', -8 * mag); adjust(st, 'prosperity', -3);
      localCorruption(ctx, 'terror', 4 * mag); res.add('alert', 3);
    });
    await showResult(r === 'crit' ? '¡El pueblo se arrodilla!' : 'El miedo echa raíces',
      [{ label: `Miedo ${Math.round(st.fear)}`, good: true }, { label: 'Terror ↑', good: true }, { label: 'Reputación ↓' }, { label: 'Alerta ↑' }],
      r === 'crit' ? 'Las puertas se cierran solas a tu paso. Los niños ya no juegan afuera.' : 'Bajan la mirada cuando pasas. Es un comienzo.', out);
  }
  ctx.refresh();
}

async function doManipulate(ctx: LocCtx): Promise<void> {
  const { st, def } = ctx;
  if (!res.spend('mana', 30)) { toast('Necesitas 30 de maná.', { kind: 'bad' }); return; }
  const leader = npcsAt(ctx.id).map((n) => NPCS[n]).find((n) => n && (n.role === 'gobernante' || n.role === 'delegado' || n.role === 'jefe')) ?? null;
  const chance = clamp(0.42 + 0.03 * stat('magia') + 0.025 * stat('presencia') - (def.kind === 'capital' ? 0.12 : 0) - st.loyalty / 500, 0.1, 0.95);
  engine.pipeline.setMind(0.8);
  audio.sfx('mind_control');
  const r = await rollDial({ title: 'Dominar Mente', subtitle: leader ? `${leader.name} — ${def.name}` : def.name, chance, flavor: 'Una idea pequeña, plantada en el lugar correcto, crece como un bosque.', color: '#ff7bf0' });
  engine.pipeline.setMind(0);
  track('minds_dominated');
  if (r === 'fail') {
    res.add('alert', 10);
    deed({ kind: 'manipulate', location: ctx.id, npcId: leader?.id, magnitude: 0.2, path: 'intriga' }, ctx, () => adjust(st, 'fear', 3));
    await showResult('Te descubrieron', [{ label: '+10 Alerta' }, { label: '−30 maná' }], `${leader ? leader.name : 'El consejo local'} siente algo ajeno dentro de su cabeza... y grita.`);
  } else {
    ctx.dio.react('mind');
    ctx.dio.fx.emit('mind', ctx.dio.focus, { count: 50, scale: 3 });
    const mag = r === 'crit' ? 1.6 : 1;
    if (r === 'crit') { res.add('secrets', 1); res.add('influence', 2); }
    const out = deed({ kind: 'manipulate', location: ctx.id, npcId: leader?.id, magnitude: mag, path: 'intriga' }, ctx, () => {
      adjust(st, 'loyalty', -15 * mag); localCorruption(ctx, 'intriga', 5 * mag); res.add('influence', 1);
    });
    await showResult(r === 'crit' ? 'Una marioneta perfecta' : 'Los hilos se tensan',
      [{ label: 'Intriga ↑', good: true }, { label: 'Lealtad al gobierno ↓', good: true }, ...(r === 'crit' ? [{ label: '+1 Secreto', good: true }, { label: '+2 Influencia', good: true }] : [])],
      'Firmará lo que le pongas enfrente. Y creerá que fue idea suya.', out);
  }
  ctx.refresh();
}

async function doInvest(ctx: LocCtx): Promise<void> {
  const { st } = ctx;
  const tiers = [{ g: 200, n: 'Un molino, una tienda' }, { g: 600, n: 'Un taller, un almacén' }, { g: 1500, n: 'Media calle principal' }];
  const v = await modal({
    title: 'Invertir', className: 'loc-invest',
    body: h('div', { class: 'lx-col' }, h('div', { class: 'lx-book' }, 'La codicia también corrompe. Solo que con recibo.'),
      h('div', { class: 'lx-small lx-muted' }, 'Cada negocio rinde oro cada luna y aumenta la Codicia en el continente.')),
    actions: [
      ...tiers.map((t, i): ModalAction => ({ label: `${t.n} · ${t.g} oro`, value: String(i), kind: i === 2 ? 'primary' : undefined, disabled: !res.can('gold', t.g) })),
      { label: 'Cancelar', value: 'no', kind: 'ghost' },
    ],
  });
  if (v === null || v === 'no') return;
  const t = tiers[Number(v)];
  if (!res.spend('gold', t.g)) return;
  st.businesses.push(`negocio_${G.run.luna}_${t.g}_${st.businesses.length}`);
  track('gold_invested', t.g);
  audio.sfx('coins_many'); audio.sfx('purchase');
  ctx.dio.react('coins');
  ctx.dio.fx.emit('coins', ctx.dio.focus.clone().setY(ctx.dio.focus.y + 4), { count: 50, scale: 2.2 });
  const mag = t.g / 200;
  const out = deed({ kind: 'invest', location: ctx.id, magnitude: [1, 2, 3.5][Number(v)] ?? 1, path: 'codicia' }, ctx, () => {
    adjust(st, 'prosperity', 4 + mag * 3); adjust(st, 'loyalty', 2); localCorruption(ctx, 'codicia', 2 * Math.sqrt(mag));
  });
  await showResult('Trato hecho', [{ label: `−${t.g} oro` }, { label: 'Codicia ↑', good: true }, { label: 'Prosperidad ↑', good: true }], 'Nadie pregunta de dónde viene el oro cuando llega puntual.', out);
  ctx.refresh();
}

async function doRaid(ctx: LocCtx): Promise<void> {
  const { st } = ctx;
  const ratio = totalPower() / Math.max(1, st.garrison);
  const chance = clamp(0.3 + 0.3 * Math.min(2, ratio) + 0.02 * stat('fuerza'), 0.05, 0.95);
  if (!(await confirmModal('Saquear', `¿Saquear ${ctx.def.name}? Si la guarnición resiste, habrá batalla. (Probabilidad: ${pct(chance)})`, 'Saquear', 'Mejor no', true))) return;
  const r = await rollDial({ title: 'Saqueo', subtitle: ctx.def.name, chance, flavor: 'Todo lo que sobrevive, lo dominas. Lo demás, te lo llevas.', color: '#ffb347' });
  track('raids');
  if (r === 'fail') {
    await guardFight(ctx, 'La guarnición defiende sus casas');
    return;
  }
  const mult = r === 'crit' ? 1.6 : 1;
  const loot = Math.round((st.prosperity * 5 + 60 + stat('suerte') * 8) * mult);
  res.add('gold', loot);
  audio.sfx('coins_many'); audio.sfx('fire_burst');
  ctx.dio.react('terror');
  ctx.dio.fx.emit('fire', ctx.dio.focus.clone().setY(ctx.dio.baseY + 2), { count: 60, scale: 3 });
  ctx.dio.fx.emit('coins', ctx.dio.focus, { count: 40, scale: 2 });
  ctx.shake(0.6);
  const out = deed({ kind: 'raid', location: ctx.id, magnitude: mult, path: 'terror' }, ctx, () => {
    adjust(st, 'prosperity', -25); adjust(st, 'fear', 15); adjust(st, 'loyalty', -20); res.add('alert', 8); localCorruption(ctx, 'terror', 3);
  });
  addNews(`${ctx.def.name} fue saqueada. Las columnas de humo se ven desde lejos.`, 'guerra');
  await showResult(r === 'crit' ? '¡Botín magnífico!' : 'Saqueo', [{ label: `+${loot} oro`, good: true }, { label: 'Miedo ↑', good: true }, { label: 'Prosperidad ↓' }, { label: 'Alerta ↑' }], out.news ?? 'El humo se ve desde lejos.', out);
  ctx.refresh();
}

async function doInfiltrate(ctx: LocCtx): Promise<void> {
  const { st, def } = ctx;
  const npcs = npcsAt(ctx.id).filter((n) => NPCS[n] && n !== 'aurel' && n !== 'bruma');
  const relic = st.relic && !def.services.includes('ruina') ? st.relic : null;
  const base = clamp(0.45 + 0.035 * stat('velocidad') + 0.02 * stat('suerte') - st.garrison / 400, 0.08, 0.92);
  const opts: Array<{ id: string; label: string; chance: number; desc: string }> = [
    { id: 'secrets', label: 'Robar secretos', chance: base, desc: '1–3 Secretos de los archivos.' },
    { id: 'gold', label: 'Vaciar el tesoro', chance: base - 0.08, desc: 'Oro según la prosperidad.' },
  ];
  if (npcs.length) opts.push({ id: 'kill', label: `Asesinar a ${NPCS[npcs[0]].name}`, chance: base - 0.15, desc: 'Muy ruidoso si sale mal.' });
  if (relic) opts.push({ id: 'relic', label: `Robar ${RELICS[relic]?.name ?? 'la reliquia'}`, chance: base - 0.22, desc: 'Lo que nadie debería poder tocar.' });
  const v = await modal({
    title: 'Infiltrar (Velo)', body: h('div', { class: 'lx-col' },
      h('div', { class: 'lx-book' }, 'Nadie cierra la puerta a lo que no puede ver.'),
      h('div', { class: 'lx-small lx-muted' }, 'Cuesta 20 de maná. Si fallas: +Alerta y quizá la guardia.'),
      ...opts.map((o) => h('div', { class: 'lx-small' }, h('b', null, o.label), ` — ${o.desc} (${pct(clamp(o.chance, 0.05, 0.95))})`))),
    actions: [...opts.map((o) => ({ label: o.label, value: o.id, kind: o.id === 'relic' ? 'primary' as const : undefined, disabled: !res.can('mana', 20) })), { label: 'Cancelar', value: 'no', kind: 'ghost' as const }],
  });
  if (!v || v === 'no') return;
  const o = opts.find((x) => x.id === v)!;
  if (!res.spend('mana', 20)) return;
  engine.pipeline.setDesat(0.6);
  audio.sfx('invisibility_on');
  track('invisible_seconds', 30);
  const r = await rollDial({ title: 'Infiltración', subtitle: o.label, chance: clamp(o.chance, 0.05, 0.95), flavor: 'Pasos que no hacen ruido. Una sombra que no proyecta sombra.', color: '#7fe3ff' });
  engine.pipeline.setDesat(0);
  audio.sfx('invisibility_off');
  if (r === 'fail') {
    res.add('alert', o.id === 'kill' || o.id === 'relic' ? 15 : 9);
    deed({ kind: 'infiltrate', location: ctx.id, magnitude: 0.2, path: 'intriga' }, ctx, () => adjust(st, 'loyalty', 4));
    await showResult('¡Te vieron!', [{ label: 'Alerta ↑↑' }], 'Una campana. Luego muchas. El Velo se rasga como papel mojado.');
    if (Math.random() < 0.6) await guardFight(ctx, 'Los guardias te rodean');
    ctx.refresh();
    return;
  }
  const crit = r === 'crit';
  const items: Array<{ label: string; good?: boolean }> = [];
  if (o.id === 'secrets') { const n = crit ? 3 : 1 + Math.floor(Math.random() * 2); res.add('secrets', n); items.push({ label: `+${n} Secretos`, good: true }); audio.sfx('page_turn'); }
  if (o.id === 'gold') { const g = Math.round((st.prosperity * 4 + 50) * (crit ? 1.6 : 1)); res.add('gold', g); items.push({ label: `+${g} oro`, good: true }); audio.sfx('coins_many'); }
  if (o.id === 'kill') {
    const npc = npcs[0];
    const ns = G.run.npcs[npc];
    if (ns) ns.alive = false;
    st.npcsHere = st.npcsHere.filter((x) => x !== npc);
    track('assassinations');
    try { applyDeed({ kind: 'assassinate', location: ctx.id, npcId: npc, path: 'intriga', silent: true }); } catch { /* ignore */ }
    items.push({ label: `${NPCS[npc]?.name ?? 'El objetivo'} ha muerto`, good: true });
    addNews(`${NPCS[npc]?.name ?? 'Alguien importante'} apareció muerto en ${def.name}. Nadie vio nada.`, 'rumor', true);
    audio.sfx('death_pop');
  }
  if (o.id === 'relic' && relic) {
    st.relic = undefined;
    try { grantRelic(relic, { reveal: true, where: ctx.id }); } catch { /* ignore */ }
    try { applyDeed({ kind: 'relic_stolen', location: ctx.id, path: 'intriga', silent: true }); } catch { /* ignore */ }
    items.push({ label: RELICS[relic]?.name ?? 'Reliquia', good: true });
    track('relics_stolen');
  }
  if (o.id !== 'kill' && o.id !== 'relic') deed({ kind: 'infiltrate', location: ctx.id, magnitude: crit ? 1.5 : 1, path: 'intriga', silent: true }, ctx, () => localCorruption(ctx, 'intriga', 2));
  await showResult(crit ? 'Ni un susurro' : 'Hecho', items);
  ctx.refresh();
}

async function guardFight(ctx: LocCtx, title: string): Promise<void> {
  await banner(title.toUpperCase(), ctx.def.name, { kind: 'defeat', duration: 1.4 });
  const setup = siegeBattle(ctx.id);
  setup.kind = 'escaramuza';
  setup.title = title;
  setup.enemy.walls = false;
  setup.enemy.groups = setup.enemy.groups.map((g) => ({ ...g, count: Math.max(1, Math.ceil(g.count * 0.5)) }));
  ctx.busy(true);
  launchBattle(setup, {
    returnTo: { scene: 'location', params: { id: ctx.id } },
    onResult: (r) => {
      if (r.victory) { ctx.st.garrison = Math.max(0, Math.round(ctx.st.garrison * 0.7)); adjust(ctx.st, 'fear', 10); }
    },
  });
}

async function doSiege(ctx: LocCtx): Promise<void> {
  const { st, def } = ctx;
  const o = odds(totalPower(), defenderPower(def.kind, st.garrison));
  const walls = ['capital', 'fortaleza', 'ciudad', 'concilio', 'casino'].includes(def.kind);
  if (!(await confirmModal(walls ? `Asedio de ${def.name}` : `Atacar ${def.name}`,
    h('div', { class: 'lx-col' },
      h('div', null, `Guarnición: `, h('b', null, String(Math.round(st.garrison))), ` · Tus fuerzas: `, h('b', null, String(Math.round(totalPower())))),
      h('div', { style: `color:${o.color};font-weight:800` }, `Batalla: ${o.text}`),
      h('div', { class: 'lx-small lx-muted' }, 'Si ganas, el lugar será tuyo: +Conquista, estandartes del eclipse. El continente enviará ejércitos para recuperarlo.')),
    walls ? 'Asediar' : 'Atacar', 'Retirarse', true))) return;
  ctx.busy(true);
  const setup = siegeBattle(ctx.id);
  launchBattle(setup, {
    returnTo: { scene: 'location', params: { id: ctx.id, conquered: true } },
    onResult: (r) => {
      const s = G.run.locations[ctx.id];
      if (!s) return;
      if (r.victory) {
        s.control = 'excepcion';
        s.garrison = Math.max(10, Math.min(60, G.run.player.army.length * 2 + 10));
        s.loyalty = 20; s.fear = clamp(s.fear + 25, 0, 100);
        try { applyDeed({ kind: 'conquer', location: ctx.id, path: 'conquista', magnitude: def.kind === 'capital' ? 2 : 1 }); } catch { /* ignore */ }
        conquestNews(ctx.id);
        if (s.relic && !def.services.includes('ruina')) {
          const rid = s.relic; s.relic = undefined;
          try { grantRelic(rid, { reveal: true, where: ctx.id }); } catch { /* ignore */ }
        }
      } else if (!r.fled) {
        s.garrison = Math.max(5, Math.round(s.garrison - r.enemiesKilled * 1.5));
      }
    },
  });
}

async function doRuin(ctx: LocCtx): Promise<void> {
  const { st, def } = ctx;
  const rumor = st.relic ? RELICS[st.relic]?.name : null;
  if (!(await confirmModal(`Explorar ${def.name}`, h('div', { class: 'lx-col' },
    h('div', { class: 'lx-book' }, 'Oleadas de lo que duerme ahí abajo, y al final, lo que custodia.'),
    rumor ? h('div', { class: 'lx-violet' }, `Dicen que guarda: ${rumor}`) : h('div', { class: 'lx-muted' }, 'Nadie sabe qué hay al fondo. Quizá nada. Quizá algo que te conoce.'),
    h('div', { class: 'lx-small lx-muted' }, `Fuerza estimada: ${Math.round(st.garrison)}`)), 'Descender', 'Todavía no'))) return;
  ctx.busy(true);
  const setup = ruinBattle(ctx.id);
  launchBattle(setup, {
    returnTo: { scene: 'location', params: { id: ctx.id } },
    onResult: (r) => {
      const s = G.run.locations[ctx.id];
      if (!s || !r.victory) return;
      s.explored = true;
      s.garrison = 0;
      res.add('essence', 10 + Math.round(def.garrison / 5));
      if (s.relic) {
        const rid = s.relic; s.relic = undefined;
        try { grantRelic(rid, { reveal: true, where: ctx.id }); } catch { /* ignore */ }
        track('relics_found');
      }
      addNews(`Algo salió de ${def.name}. Algo entró. Nadie sabe bien el orden.`, 'rumor');
      bus.emit('story:beat', { id: `ruina:${ctx.id}` });
    },
  });
}

async function doSanctuary(ctx: LocCtx): Promise<void> {
  const cost = { gold: 250, essence: 15 };
  if (!res.can('gold', cost.gold) || !res.can('essence', cost.essence)) { toast(`Necesitas ${cost.gold} oro y ${cost.essence} esencia.`, { kind: 'bad' }); return; }
  if (!(await confirmModal('Fundar Santuario', 'Si mueres sin cargas de Retorno, despertarás aquí. El lugar quedará marcado por el eclipse.', 'Fundar', 'Cancelar'))) return;
  res.spend('gold', cost.gold); res.spend('essence', cost.essence);
  G.run.player.sanctuaries.push(ctx.id);
  track('sanctuaries');
  try { applyDeed({ kind: 'sanctuary', location: ctx.id }); } catch { /* ignore */ }
  audio.sfx('eclipse'); audio.stinger('discovery');
  ctx.dio.fx.emit('arcane', ctx.dio.focus, { count: 80, scale: 3 });
  ctx.dio.fx.ring(ctx.dio.focus.clone().setY(ctx.dio.baseY + 0.3), { color: '#9b5cff', radius: 20, duration: 1.2 });
  engine.pipeline.flash('#9b5cff', 0.45, 0.9);
  await banner('SANTUARIO', ctx.def.name, { kind: 'excepcion', duration: 2 });
  ctx.refresh();
}

async function doRest(ctx: LocCtx): Promise<void> {
  const inn = ctx.def.services.includes('taberna');
  const v = await modal({
    title: 'Descansar', body: h('div', { class: 'lx-col' },
      h('div', { class: 'lx-book' }, inn ? 'Una cama. Una puerta con cerrojo. Casi un lujo.' : 'El suelo es duro. Las estrellas no cobran.'),
      h('div', { class: 'lx-small lx-muted' }, 'Pasa el tiempo: recuperas vida y maná, y tu ejército sana sus heridas.')),
    actions: [
      { label: `Media luna${inn ? ' · 10 oro' : ''}`, value: '0.5', disabled: inn && !res.can('gold', 10) },
      { label: `Una luna${inn ? ' · 20 oro' : ''}`, value: '1', kind: 'primary', disabled: inn && !res.can('gold', 20) },
      { label: 'Cancelar', value: 'no', kind: 'ghost' },
    ],
  });
  if (!v || v === 'no') return;
  const n = Number(v);
  if (inn && !res.spend('gold', n >= 1 ? 20 : 10)) return;
  engine.pipeline.setFade(0.85);
  audio.sfx('page_turn');
  await new Promise((r) => setTimeout(r, 650));
  passLunas(n);
  const p = G.run.player;
  res.add('hp', p.hpMax); res.add('mana', p.manaMax);
  for (const u of p.army) u.hpPct = Math.min(1, (u.hpPct ?? 1) + 0.35 * n);
  engine.pipeline.setFade(0);
  track('rests');
  void narrate({ third: `{name} descansó ${n >= 1 ? 'una luna' : 'media luna'}. El mundo no.`, first: `Descansé ${n >= 1 ? 'una luna' : 'media luna'}. El mundo no.` });
  ctx.refresh();
}

async function doTemple(ctx: LocCtx): Promise<void> {
  const p = G.run.player;
  const wounded = p.army.filter((u) => (u.hpPct ?? 1) < 1);
  const wound = wounded.reduce((s, u) => s + (1 - (u.hpPct ?? 1)), 0);
  const cost = Math.round(20 + wound * 45);
  const terror = G.run.continents[ctx.def.continent]?.paths?.terror ?? 0;
  let rep = 0;
  try { rep = repValue('orden_alba'); } catch { rep = 0; }
  const refuse = terror >= 30 || rep <= -40 || ctx.st.fear >= 70;
  const priest = { speaker: 'Sacerdotisa', title: 'Orden del Alba', portrait: { seed: `temple:${ctx.id}`, race: 'clerigo' as const, job: 'sacerdote', gender: 'f' as const, mood: refuse ? 'scared' as const : 'neutral' as const } };
  if (refuse) {
    const pick = await dialogue.ask({ ...priest, text: 'La luz no atiende a quien la apaga. Vete... por favor.' }, [
      { id: 'pay', text: `Pagar el triple (${cost * 3} oro)`, disabled: !res.can('gold', cost * 3) },
      { id: 'mind', text: 'Dominar su mente (25 maná)', disabled: !knowsSafe('dominar_mente') || !res.can('mana', 25) },
      { id: 'no', text: 'Irse' },
    ]);
    if (pick === 'no') return;
    if (pick === 'pay' && !res.spend('gold', cost * 3)) return;
    if (pick === 'mind') { if (!res.spend('mana', 25)) return; ctx.dio.react('mind'); audio.sfx('mind_control'); track('minds_dominated'); }
  } else {
    const pick = await dialogue.ask({ ...priest, text: wounded.length ? `Tus hombres sangran. Podemos cerrar esas heridas por ${cost} de oro.` : 'La luz sana el cuerpo. Lo demás no es asunto nuestro.' }, [
      { id: 'heal', text: `Sanar al ejército y a ti (${cost} oro)`, disabled: !res.can('gold', cost) },
      { id: 'no', text: 'Irse' },
    ]);
    if (pick !== 'heal' || !res.spend('gold', cost)) return;
  }
  for (const u of p.army) u.hpPct = 1;
  res.add('hp', p.hpMax);
  audio.sfx('heal');
  ctx.dio.fx.emit('heal', ctx.dio.focus, { count: 70, scale: 3 });
  ctx.dio.fx.emit('light', ctx.dio.focus, { count: 40, scale: 2.5 });
  engine.pipeline.flash('#fff7d6', 0.3, 0.6);
  toast('Heridas cerradas. La luz no pregunta de dónde vienen.', { kind: 'good' });
  ctx.refresh();
}

async function doTalk(ctx: LocCtx): Promise<void> {
  const ids = npcsAt(ctx.id).filter((n) => NPCS[n] && G.run.npcs[n]?.alive !== false);
  const choices = ids.map((n) => ({ id: n, text: `${NPCS[n].name}${NPCS[n].title ? ` — ${NPCS[n].title}` : ''}` }));
  choices.push({ id: '__folk', text: 'La gente del lugar' });
  choices.push({ id: '__no', text: 'Nadie' });
  const pick = await dialogue.ask({ speaker: ctx.def.name, text: ids.length ? '¿Con quién quieres hablar?' : 'Solo gente común. Pero la gente común también sabe cosas.' }, choices);
  if (pick === '__no') return;
  if (pick === '__folk') {
    try { await talkTo(`townsfolk:${ctx.id}`); } catch { await folkTalk(ctx); }
    ctx.refresh();
    return;
  }
  try { await talkTo(pick); } catch (err) { console.warn('[location] talkTo failed', err); }
  ctx.refresh();
}

async function folkTalk(ctx: LocCtx): Promise<void> {
  const w = ctx.dio.walkers[Math.floor(Math.random() * Math.max(1, ctx.dio.walkers.length))];
  const spec = w ? { seed: w.rig.spec.seed, race: w.rig.spec.race, job: w.rig.spec.job, gender: w.rig.spec.gender, mood: ctx.st.fear > 60 ? 'scared' as const : 'neutral' as const } : { seed: 'folk', race: 'humano' as const };
  const who = { speaker: 'Lugareño', portrait: spec };
  const greet = ctx.st.fear > 60 ? '¡N-no me haga daño! Diga lo que quiera...' : isMine(ctx.st) ? 'Mi señor... digo... ¿qué se le ofrece?' : '¿Y usted de dónde salió?';
  for (let i = 0; i < 4; i++) {
    const pick = await dialogue.ask({ ...who, text: i === 0 ? greet : '¿Algo más?' }, [
      { id: 'year', text: '¿Qué año es?' },
      { id: 'rumor', text: '¿Qué se cuenta por aquí?' },
      { id: 'me', text: '¿Has oído hablar de mí?' },
      { id: 'bye', text: 'Nada. Sigue con lo tuyo.' },
    ]);
    if (pick === 'bye') break;
    if (pick === 'year') { let a = 'No sé. Un día dejamos de contar.'; try { a = yearAnswer(); } catch { /* stub */ } await dialogue.say({ ...who, text: a }); track('asked_year'); }
    if (pick === 'rumor') {
      const n = G.run.news.slice(0, 10);
      const item = n.length ? n[Math.floor(Math.random() * n.length)] : null;
      await dialogue.say({ ...who, text: item ? `Dicen que... ${item.text}` : 'Aquí nunca pasa nada. Bueno, casi nunca.' });
    }
    if (pick === 'me') {
      const t = G.run.player.titleIndex;
      const lines = ['¿El mago ese? ¿El que se murió? Dicen que camina. Ja. Cuentos.', '¿La cosa que no muere? Mi prima dice que la vio. Mi prima miente mucho.', 'El Hombre sin Ley... por favor, no diga ese nombre aquí.', 'Hay aldeas donde ya no se pronuncia. Esta es una de ellas.', 'Los sabios dicen que usted es el Referente. Yo solo sé que tengo miedo.', 'Él.'];
      await dialogue.say({ ...who, text: lines[Math.min(t, lines.length - 1)] });
    }
  }
}

type CouncilView = { lunasLeft: number; agenda: string[]; open: boolean; emergency: boolean };
function councilView(): CouncilView {
  try {
    const cs = councilStatus();
    const st = cs.session?.status;
    return { lunasLeft: cs.lunasLeft, agenda: cs.agenda, open: !!cs.session && (st === 'pending' || st === 'inprogress'), emergency: !!cs.session?.emergency };
  } catch {
    const c = W().council;
    return { lunasLeft: c ? c.lunaDue - G.run.luna : 4, agenda: c?.resolutions ?? [], open: !!c && G.run.luna >= c.lunaDue, emergency: false };
  }
}

async function doCouncil(ctx: LocCtx): Promise<void> {
  const cv = councilView();
  if (cv.open) {
    const ok = await confirmModal(cv.emergency ? 'Sesión de emergencia' : 'El Concilio sesiona',
      h('div', { class: 'lx-col' },
        h('div', { class: 'lx-book', style: 'font-size:17px' }, 'La mesa de los cinco está reunida. Hoy se decide el mundo, o lo que queda de él.'),
        cv.agenda.length ? h('ul', { class: 'loc-agenda' }, cv.agenda.map((a) => h('li', null, a))) : null),
      'Entrar al Concilio', 'Todavía no');
    if (!ok) return;
    let went = false;
    try { went = attendCouncil(); } catch { went = false; }
    if (!went) ctx.leave('council');
    else ctx.busy(true);
    return;
  }
  await modal({
    title: 'El Concilio de los Cinco', body: h('div', { class: 'lx-col' },
      h('div', { class: 'lx-book', style: 'font-size:17px' }, 'Cinco torres blancas, una mesa redonda y la paz más frágil del mundo.'),
      h('div', null, `Próxima sesión en ${lunasText(cv.lunasLeft)}.`),
      cv.agenda.length ? h('div', { class: 'lx-col' }, h('div', { class: 'lx-small lx-muted' }, 'En la agenda:'), h('ul', { class: 'loc-agenda' }, cv.agenda.map((a) => h('li', null, a)))) : null,
      h('div', { class: 'lx-small lx-muted' }, 'Durante las sesiones puedes sobornar, chantajear, intimidar o dominar a los delegados.')),
    actions: [{ label: 'Entendido', value: 'ok', kind: 'primary' }],
  });
}

async function doHeist(ctx: LocCtx): Promise<void> {
  const chance = clamp(0.2 + 0.03 * stat('velocidad') + 0.025 * stat('suerte'), 0.08, 0.6);
  if (!(await confirmModal('El Golpe a la Bóveda', h('div', { class: 'lx-col' },
    h('div', { class: 'lx-book' }, '"Nadie ha robado la Bóveda de Tiburcio". Nadie tenía el Velo de Aurel, tampoco.'),
    h('div', null, `Probabilidad: `, h('b', null, pct(chance)), ' · Cuesta 40 de maná.'),
    h('div', { class: 'lx-small lx-bad' }, 'Si fallas: +25 Alerta, la Banca te odiará y los guardias duendes no perdonan.')), 'Entrar sin ser visto', 'Mejor apostar', true))) return;
  if (!res.spend('mana', 40)) { toast('Necesitas 40 de maná.', { kind: 'bad' }); return; }
  engine.pipeline.setDesat(0.7);
  audio.sfx('invisibility_on');
  const r = await rollDial({ title: 'El Golpe', subtitle: 'La Bóveda de Tiburcio', chance, flavor: '¿Qué onda, patojo? ...¿Patojo? ¿Hay alguien ahí?', color: '#ffe066' });
  engine.pipeline.setDesat(0);
  if (r === 'fail') {
    res.add('alert', 25);
    try { applyDeed({ kind: 'infiltrate', location: ctx.id, faction: 'banca', magnitude: 0.5 }); } catch { /* ignore */ }
    await guardFight(ctx, '¡Los Ojos de la Casa!');
    return;
  }
  const st = ctx.st;
  if (st.relic) { const rid = st.relic; st.relic = undefined; try { grantRelic(rid, { reveal: true, where: ctx.id }); } catch { /* ignore */ } }
  const gold = r === 'crit' ? 5000 : 2000;
  res.add('gold', gold);
  track('heists');
  addNews('Alguien robó la Bóveda de Tiburcio. Don Tiburcio no ha dejado de gritar desde entonces.', 'casino', true);
  try { applyDeed({ kind: 'relic_stolen', location: ctx.id, faction: 'banca' }); } catch { /* ignore */ }
  await showResult('¡Está yuca!', [{ label: `+${gold} oro`, good: true }, { label: 'El premio mayor de todos los premios mayores', good: true }], 'Don Tiburcio, a lo lejos: "¡A la gran! ¡¿Quién fue el shute?!"');
  ctx.refresh();
}

async function doTrunk(ctx: LocCtx): Promise<void> {
  const st = ctx.st;
  await narrate({ third: 'El tronco seguía ahí. Alguien, hace mucho, se sentó en él a ver amanecer.', first: 'El tronco seguía ahí. Me senté donde se sentó él.' }, { position: 'center', hold: 3 });
  if (st.relic === 'collar_bruma') {
    st.relic = undefined;
    try { grantRelic('collar_bruma', { reveal: true, where: ctx.id }); } catch { /* ignore */ }
    bus.emit('story:beat', { id: 'collar_bruma' });
  } else toast('Solo madera vieja, húmeda de neblina.', { kind: 'info' });
  ctx.refresh();
}

/** El Cráter: remember the fall and point at the first objective. */
export async function craterMemory(ctx: LocCtx, auto = false): Promise<void> {
  if (!auto) {
    ctx.dio.fx.emit('arcane', ctx.dio.focus, { count: 40, scale: 2.5 });
    audio.sfx('whisper');
    await narrate({ third: 'Aurel lo lanzó al cielo de un solo golpe. {name} cruzó el mar y cayó aquí. Murió. Excepto que no.', first: 'Aurel me lanzó al cielo de un solo golpe. Crucé el mar y caí aquí. Morí. Excepto que no.' }, { position: 'bottom', hold: 3.5 });
  }
  const qs = activeQuests();
  const main = qs.find((q) => q.kind === 'main' && q.target) ?? qs.find((q) => q.kind === 'main') ?? qs[0];
  if (main) {
    W().tracked = main.id;
    toast(`<b>Designio:</b> ${esc(main.title)}<br><span class="lx-muted">${esc(main.desc)}</span>`, { kind: 'gold', duration: 7 });
  } else {
    toast('Hacia el oeste, el <b>Vado del Trigo</b>. Gente que nunca ha visto magia de verdad. Todavía.', { kind: 'gold', duration: 7 });
  }
}

// ───────────────────────── catalogue ─────────────────────────

export function actionsFor(ctx: LocCtx): LocAction[] {
  const { def, st } = ctx;
  const sv = new Set(def.services);
  const mine = isMine(st);
  const A: LocAction[] = [];
  const special = def.special;
  const npcCount = (() => { try { return npcsAt(ctx.id).length; } catch { return 0; } })();
  const hasPeople = Object.keys(def.races).length > 0;
  const velo = knowsSafe('velo'), mind = knowsSafe('dominar_mente');
  const ratio = totalPower() / Math.max(1, st.garrison);

  if (hasPeople) A.push({ id: 'talk', group: 'gente', label: 'Hablar', icon: ACTION_ICON.talk, cost: npcCount ? `${npcCount} ${npcCount === 1 ? 'persona notable' : 'personas notables'}` : 'Gente común', tip: 'Conversar con quienes están aquí. Siempre puedes preguntar <b>¿Qué año es?</b>', run: doTalk });
  if (sv.has('taberna')) A.push({ id: 'tavern', group: 'gente', label: 'Taberna', icon: ACTION_ICON.tavern, cost: 'Rumores · contratos · dados', tip: 'Rumores, contratos (Designios), mercenarios con nombre y <b>Tres Dados</b>.', run: (c) => openTavern(c) });
  if (sv.has('mercado')) A.push({ id: 'market', group: 'gente', label: 'Mercado', icon: ACTION_ICON.market, cost: 'Comprar y vender', tip: 'Compra barato, vende caro. Los precios cambian con la oferta y la demanda.', run: () => openMarket(ctx.id) });
  if (sv.has('sedas')) A.push({ id: 'sedas', group: 'gente', label: 'Casa de las Sedas', icon: ACTION_ICON.sedas, cost: 'Secretos', tip: 'Cortesanas y espías: venden <b>Secretos</b>, debilidades de continentes y ubicaciones de reliquias.', run: () => openSedas(ctx.id) });
  if (sv.has('banca')) A.push({ id: 'bank', group: 'gente', label: 'Banca', icon: ACTION_ICON.bank, cost: 'Préstamos · inversiones', tip: 'La Banca de las Mil Suertes: préstamos con interés por luna. Si no pagas, vienen duendes a cobrar.', run: () => openBank() });

  if (sv.has('reclutar')) A.push({ id: 'recruit', group: 'servicios', label: 'Reclutar', icon: ACTION_ICON.recruit, cost: `${G.run.player.army.length}/${G.run.player.armyCap} unidades`, tip: 'Recluta unidades de los linajes que viven aquí. Más barato con Miedo alto o buena reputación.', run: (c) => openRecruit(c) });
  if (sv.has('templo')) A.push({ id: 'temple', group: 'servicios', label: 'Templo', icon: ACTION_ICON.temple, cost: 'Sanar heridas', tip: 'Cura al ejército y a ti por oro. Los clérigos pueden negarse si el Terror es alto.', run: doTemple });
  if (sv.has('forja')) A.push({ id: 'forge', group: 'servicios', label: 'Forja', icon: ACTION_ICON.forge, cost: 'Mejorar reliquias', tip: 'El Yunque reforja reliquias.' + (def.id === 'forja_primigenia' ? ' Aquí se pueden <b>fusionar las dagas</b>.' : ''), run: () => openForge(ctx.id) });
  if (sv.has('academia')) A.push({ id: 'academy', group: 'servicios', label: 'Academia', icon: ACTION_ICON.academy, cost: 'Rangos y fusiones', tip: 'La Academia de Altamira enseña y perfecciona habilidades con Esencia.', run: () => openAcademy(ctx.id) });
  if (sv.has('casino')) A.push({ id: 'casino', group: 'servicios', label: 'Gran Casino', icon: ACTION_ICON.casino, cost: 'La Banca de las Mil Suertes', tip: 'Tragamonedas, la Rueda de las Almas, Veintiuno del Tarot, Dados Mentirosos, el Pozo de los Deseos...', hot: true, run: (c) => c.leave('casino') });
  if (sv.has('arena')) A.push({ id: 'arena', group: 'servicios', label: 'Arena', icon: ACTION_ICON.arena, cost: 'Apostar en batallas', tip: 'Dos ejércitos, cuotas y un remolino. Apuesta a quién sale volando más lejos.', hot: true, run: (c) => c.leave('casino', { game: 'arena' }) });
  if (sv.has('concilio')) { const cv = councilView(); A.push({ id: 'council', group: 'servicios', label: 'Concilio', icon: ACTION_ICON.council, cost: cv.open ? '¡En sesión!' : `Sesión en ${lunasText(cv.lunasLeft)}`, hot: cv.open, tip: 'La mesa de los cinco continentes.', run: doCouncil }); }
  if (special === 'boveda') {
    A.push({ id: 'heist', group: 'poder', label: 'Golpe a la Bóveda', icon: ACTION_ICON.heist, cost: velo ? '40 maná · muy difícil' : 'Requiere Velo', disabled: velo ? undefined : 'Necesitas copiar Velo', danger: true, tip: 'Robar el Libro de la Realidad con el Velo. Si fallas, los Ojos de la Casa.', run: doHeist });
    A.push({ id: 'final', group: 'servicios', label: 'La Apuesta Final', icon: ACTION_ICON.casino, cost: 'En el Gran Casino', hot: true, tip: 'Don Tiburcio en persona, en Puerto Fortuna: al mejor de tres. Premio: el Libro de la Realidad.', run: (c) => c.leave('casino', { game: 'final' }) });
  }
  if (special === 'crater') A.push({ id: 'memory', group: 'tu', label: 'Recordar la caída', icon: ACTION_ICON.sanctuary, cost: 'El primer designio', hot: G.run.luna < 2, tip: 'Aquí caíste. Aquí empezó todo.', run: (c) => craterMemory(c) });
  if (special === 'colmenas' && st.relic === 'collar_bruma') A.push({ id: 'trunk', group: 'tu', label: 'El tronco del bosque', icon: ACTION_ICON.trunk, cost: 'Donde amanecía', hot: true, tip: 'Junto al bosque de la bruma hay un tronco viejo.', run: doTrunk });

  if (hasPeople && def.kind !== 'ruina') {
    A.push({ id: 'terror', group: 'poder', label: 'Aterrorizar', icon: ACTION_ICON.terror, cost: '+Miedo · +Terror · +Alerta', danger: true, tip: `Muestra lo que eres. <b>+Miedo</b>, <b>+Terror</b>, −reputación, +Alerta.<br>Probabilidad según Presencia y tu fuerza vs la guarnición (${Math.round(st.garrison)}).`, run: doTerror });
    A.push({ id: 'manipulate', group: 'poder', label: 'Manipular', icon: ACTION_ICON.mind, cost: mind ? '30 maná · +Intriga' : 'Requiere Dominar Mente', disabled: mind ? (res.can('mana', 30) ? undefined : 'Falta maná') : 'Necesitas copiar Dominar Mente', tip: 'Dominar Mente sobre quien gobierna: +Intriga, −lealtad al gobierno. Riesgo de detección.', run: doManipulate });
    A.push({ id: 'invest', group: 'poder', label: 'Invertir', icon: ACTION_ICON.invest, cost: '200–1500 oro · +Codicia', tip: 'Compra negocios: ingresos por luna y <b>+Codicia</b>.', disabled: res.can('gold', 200) ? undefined : 'Necesitas al menos 200 oro', run: doInvest });
    if (!mine) A.push({ id: 'raid', group: 'poder', label: 'Saquear', icon: ACTION_ICON.raid, cost: `+Oro · +Miedo · riesgo de batalla`, danger: true, tip: '+Oro, +Miedo, −Prosperidad, −reputación, +Alerta. Si fallas, la guarnición pelea.', run: doRaid });
    if (!mine) A.push({ id: 'infiltrate', group: 'poder', label: 'Infiltrar', icon: ACTION_ICON.infiltrate, cost: velo ? '20 maná · sigilo' : 'Requiere Velo', disabled: velo ? (res.can('mana', 20) ? undefined : 'Falta maná') : 'Necesitas copiar Velo', tip: 'Con el Velo: robar Secretos u oro, asesinar, o robar una reliquia.', run: doInfiltrate });
  }
  if (sv.has('ruina') && !st.explored) A.push({ id: 'ruin', group: 'guerra', label: 'Explorar ruina', icon: ACTION_ICON.ruin, cost: `Oleadas + guardián · fuerza ${Math.round(st.garrison)}`, hot: !!st.relic, tip: 'Batalla de ruina: oleadas y un guardián. Premio: lo que esconda (reliquias, Esencia).', run: doRuin });
  if (!mine && st.garrison > 0 && def.kind !== 'ruina' && special !== 'boveda') {
    const o = odds(totalPower(), defenderPower(def.kind, st.garrison));
    A.push({ id: 'siege', group: 'guerra', label: ['capital', 'fortaleza', 'ciudad', 'concilio', 'casino'].includes(def.kind) ? 'Asediar' : 'Atacar', icon: ACTION_ICON.siege, cost: `Guarnición ${Math.round(st.garrison)} · ${o.text}`, danger: true, tip: `Batalla contra la guarnición. Si vences, el lugar es tuyo (+Conquista).<br><span style="color:${o.color}">Pronóstico: ${o.text}</span>`, run: doSiege, hot: ratio > 1.4 });
  }
  if (!G.run.player.sanctuaries.includes(ctx.id) && (mine || st.fear >= 60 || def.kind === 'ruina') && def.continent !== 'concordia') {
    A.push({ id: 'sanctuary', group: 'tu', label: 'Fundar Santuario', icon: ACTION_ICON.sanctuary, cost: '250 oro · 15 esencia', tip: 'Punto de reaparición si mueres sin cargas de Retorno.', run: doSanctuary });
  }
  A.push({ id: 'rest', group: 'tu', label: 'Descansar', icon: ACTION_ICON.rest, cost: sv.has('taberna') ? 'Posada: 10–20 oro' : 'Acampar', tip: 'Pasa el tiempo: recuperas vida y maná, y tu ejército sana.', run: doRest });
  return A;
}
