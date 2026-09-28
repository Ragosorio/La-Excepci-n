/**
 * La Taberna: rumors (and buying a round for loose tongues), contracts that become Designios,
 * named mercenaries (lieutenants) and Tres Dados (casino module).
 */
import { LOCATION_LIST } from '../../data/world';
import { NPCS, TAVERN_KEEPERS } from '../../data/npcs';
import { UNITS } from '../../data/units';
import { RELICS } from '../../data/relics';
import { G, res } from '../../core/state';
import { track } from '../../core/tracker';
import { h, esc } from '../../ui/dom';
import { modal, button, tabs } from '../../ui/widgets';
import { toast } from '../../ui/toasts';
import { portraitSVG } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { openTresDados } from '../../casino/api';
import { npcGreeting, portraitFor, talkTo } from '../../systems/society/api';
import { tavernState, takeContract, hireMerc } from '../../systems/world/contracts';
import { lunasText } from '../../systems/world/time';
import type { LocCtx } from './actions';

/** "Doña Chabela Pisto" → "Doña Chabela"; "Ruperto Barril" → "Ruperto". */
function shortName(n: string): string {
  const w = n.split(' ');
  return /^(Don|Doña|Maese|Madre|Sor|Sir|Lady|Capitana?)$/.test(w[0]) ? w.slice(0, 2).join(' ') : w[0];
}

const KIND_LABEL: Record<string, string> = { caravana: 'Asalto', entrega: 'Entrega', capitan: 'Cacería', arena: 'Arena', encargo: 'Encargo' };

export async function openTavern(ctx: LocCtx): Promise<void> {
  let closeFn: ((v: string | null) => void) | null = null;
  const t = tavernState(ctx.id);
  const rumors = () => {
    const news = G.run.news.slice(0, 9);
    const list = h('div', { class: 'loc-rumors' },
      news.length ? news.map((n) => h('div', { class: `loc-rumor k-${n.kind}` }, h('span', { class: 'ow-news-k' }, n.kind), ' ', n.text)) : h('div', { class: 'lx-book lx-muted' }, 'La taberna está callada. Demasiado callada.'));
    const round = button('Invitar una ronda (20 oro)', () => {
      if (!res.spend('gold', 20)) { audio.sfx('ui_error'); return; }
      audio.sfx('coin'); audio.sfx('crowd_cheer', { volume: 0.5 });
      track('rounds_bought');
      ctx.st.loyalty = Math.min(100, ctx.st.loyalty + 1);
      const hidden = LOCATION_LIST.filter((l) => { const s = G.run.locations[l.id]; return s?.relic && !s.explored && !s.flags.relicKnown && !s.visited; });
      if (hidden.length && Math.random() < 0.55) {
        const l = hidden[Math.floor(Math.random() * hidden.length)];
        const s = G.run.locations[l.id];
        s.flags.relicKnown = true;
        toast(`Un borracho jura que en <b>${esc(l.name)}</b> hay ${esc(RELICS[s.relic!]?.name ?? 'una reliquia')}.`, { kind: 'epica', duration: 5 });
      } else if (Math.random() < 0.3) {
        res.add('secrets', 1);
        toast('Alguien habla de más. <b>+1 Secreto</b>.', { kind: 'good' });
      } else toast('Brindan por ti. No saben quién eres. Mejor así.', { kind: 'info' });
    }, { small: true, kind: 'primary', disabled: !res.can('gold', 20) });
    return h('div', { class: 'lx-col' }, list, h('div', { class: 'lx-btn-row' }, round));
  };
  const contracts = () => {
    if (!t.contracts.length) return h('div', { class: 'lx-book lx-muted' }, 'Hoy nadie necesita nada turbio. Vuelve otra luna.');
    return h('div', { class: 'loc-contracts' }, t.contracts.map((c) => {
      const r = c.reward;
      const reward = [r.gold ? `${r.gold} oro` : '', r.essence ? `${r.essence} esencia` : '', r.influence ? `${r.influence} influencia` : '', r.secrets ? `${r.secrets} secreto` : ''].filter(Boolean).join(' · ');
      const card = h('div', { class: `loc-contract ${c.taken ? 'taken' : ''}` },
        h('div', { class: 'loc-contract-k' }, KIND_LABEL[c.kind] ?? c.kind),
        h('div', { class: 'loc-contract-t' }, c.title),
        h('div', { class: 'loc-contract-d' }, c.desc),
        h('div', { class: 'loc-contract-f' }, h('span', { class: 'lx-gold' }, reward), h('span', { class: 'lx-small lx-muted' }, `Plazo: ${lunasText(c.lunas)}`),
          c.taken ? h('span', { class: 'lx-good lx-small' }, 'Aceptado') : button('Aceptar', () => {
            if (takeContract(ctx.id, c.id)) {
              audio.sfx('quill'); audio.sfx('ui_confirm');
              toast(`Nuevo designio: <b>${esc(c.title)}</b>`, { kind: 'gold' });
              closeFn?.('refresh');
            } else { audio.sfx('ui_error'); toast('Ese trabajo ya no está disponible.', { kind: 'bad' }); }
          }, { small: true, kind: 'primary' })));
      return card;
    }));
  };
  const mercs = () => {
    if (!t.mercs.length) return h('div', { class: 'lx-book lx-muted' }, 'Ningún héroe a sueldo esta luna. Los buenos se van rápido.');
    return h('div', { class: 'loc-mercs' }, t.mercs.map((m) => {
      const u = UNITS[m.unitId];
      return h('div', { class: `loc-merc ${m.hired ? 'hired' : ''}` },
        h('div', { class: 'loc-merc-portrait', html: portraitSVG({ seed: m.id, race: m.race, job: u?.job ?? 'guerrero', gender: m.gender, mood: 'smug', scar: m.stars > 1 }, 130) }),
        h('div', { class: 'loc-merc-info' },
          h('div', { class: 'loc-merc-name' }, m.name, h('span', { class: 'loc-unit-tier' }, '★'.repeat(m.stars))),
          h('div', { class: 'lx-small lx-muted' }, u?.name ?? m.unitId),
          h('div', { class: 'loc-merc-bio' }, `“${m.bio}”`),
          h('div', { class: 'loc-contract-f' }, h('span', { class: 'lx-gold' }, `${m.cost} oro`), h('span', { class: 'lx-small lx-muted' }, `${m.upkeep} oro/luna`),
            m.hired ? h('span', { class: 'lx-good lx-small' }, 'Contratado') : button('Contratar', () => {
              if (hireMerc(ctx.id, m.id)) {
                audio.sfx('level_up'); audio.sfx('coins_many', { volume: 0.5 });
                toast(`<b>${esc(m.name)}</b> se une como teniente.`, { kind: 'good' });
                ctx.dio.react('cheer');
                closeFn?.('refresh');
              } else { audio.sfx('ui_error'); toast('No te alcanza (o tu ejército está lleno).', { kind: 'bad' }); }
            }, { small: true, kind: 'primary', disabled: !res.can('gold', m.cost) }))));
    }));
  };
  const dice = () => h('div', { class: 'lx-col', style: 'align-items:center;padding:14px' },
    h('div', { class: 'lx-book', style: 'font-size:18px;text-align:center' }, 'Tres dados, un vaso de cuero y un tahúr que nunca parpadea.'),
    button('Jugar a Tres Dados', () => { closeFn?.('dice'); }, { big: true, kind: 'primary' }));
  const keeperId = TAVERN_KEEPERS[ctx.id];
  const keeper = keeperId ? NPCS[keeperId] : undefined;
  const keeperBox = () => {
    if (!keeper || !keeperId) return null;
    let greet = '';
    try { greet = npcGreeting(keeperId); } catch { greet = ''; }
    let spec: Parameters<typeof portraitSVG>[0] = { seed: keeperId, race: keeper.race, job: keeper.job, gender: keeper.gender === 'x' ? undefined : keeper.gender, mood: 'smile' };
    try { spec = portraitFor(keeperId, 'smile'); } catch { /* default */ }
    return h('div', { class: 'loc-keeper' },
      h('div', { class: 'loc-keeper-portrait', html: portraitSVG(spec, 110) }),
      h('div', { class: 'loc-keeper-info' },
        h('div', { class: 'loc-keeper-name' }, keeper.name, keeper.title ? h('small', null, keeper.title) : null),
        greet ? h('div', { class: 'loc-keeper-greet' }, `“${greet}”`) : null,
        button(`Hablar con ${shortName(keeper.name)}`, () => closeFn?.('keeper'), { small: true, kind: 'ghost' })));
  };
  let tab = 'rumores';
  for (;;) {
    const body = h('div', { class: 'loc-tavern' }, keeperBox(), tabs([
      { id: 'rumores', label: 'Rumores', render: rumors },
      { id: 'contratos', label: `Contratos (${t.contracts.filter((c) => !c.taken).length})`, render: contracts },
      { id: 'mercenarios', label: 'Mercenarios', render: mercs },
      { id: 'dados', label: 'Tres Dados', render: dice },
    ], tab, (id) => { tab = id; }));
    audio.sfx('door', { volume: 0.5 });
    const v = await modal({ title: `Taberna — ${ctx.def.name}`, body, wide: true, className: 'loc-tavern-modal', onOpen: (_r, close) => { closeFn = close; } });
    if (v === 'refresh') continue;
    if (v === 'dice') { try { await openTresDados(ctx.id); } catch (err) { console.warn('[tavern] dice failed', err); } continue; }
    if (v === 'keeper' && keeperId) { try { await talkTo(keeperId); } catch (err) { console.warn('[tavern] talk failed', err); } continue; }
    break;
  }
  ctx.refresh();
}
