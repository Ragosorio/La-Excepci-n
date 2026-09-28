/**
 * Location services: La Forja (relic upgrades; at the Forja Primigenia Aurora + Nocturna → Eclipse),
 * La Academia de Altamira (rank-ups, lessons that "teach by hitting you", costly fusion) and La Fusión.
 * Contract (kept): openForge(loc), openAcademy(loc), openFusion().
 */
import type { AbilityDef, RelicInstance } from '../../data/types';
import { h, clear, layer, wait } from '../../ui/dom';
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { track } from '../../core/tracker';
import { engine } from '../../core/engine';
import { audio } from '../../audio';
import { toast } from '../../ui/toasts';
import { confirmModal } from '../../ui/widgets';
import { ABILITIES, RANK_ROMAN } from '../../data/abilities';
import { FUSIONS, FUSION_COST, fuse, fusionPreview, isGeneratedFusion } from '../../data/fusions';
import { RELICS } from '../../data/relics';
import { LOCATIONS } from '../../data/world';
import { RARITY_INFO, RARITY_ORDER, SCHOOL_INFO } from '../../data/schools';
import { PS } from './pstate';
import * as cx from './codex';
import { MAX_RELIC_LEVEL, grantRelic, ownedRelic, relicInstances, removeRelic, upgradeCost, upgradeRelic, waitForReveals } from './relics';
import { abilityIcon, relicArt, icon } from './art';
import { burst, flashEl, header, openOverlay, queueBanner, resChip, seg } from './pgui';

// ───────────────────────────── La Forja ─────────────────────────────

export async function openForge(locationId: string): Promise<void> {
  if (!G.run) return;
  const primigenia = locationId === 'forja_primigenia' || LOCATIONS[locationId]?.special === 'forja';
  const hilda = locationId === 'kharaz_dum';
  const discount = hilda ? 0.15 : primigenia ? 0.1 : 0;
  const gold = resChip('gold', () => G.run.player.gold);
  const ess = resChip('ess', () => G.run.player.essence);
  const list = h('div', { class: 'pg-scroll' });
  const top = h('div', null);
  const ov = openOverlay({ key: 'forge', className: 'pg-forge', onClose: () => off() },
    header(primigenia ? 'LA FORJA PRIMIGENIA' : 'LA FORJA', primigenia ? 'El primer fuego del mundo. Aquí se reforja lo que no debería tocarse.' : hilda ? 'El Yunque de Hilda: "No toques nada. Todo aquí está caliente, afilado o es mío."' : 'Martillo, brasas y paciencia.', () => ov.close(), gold.el, ess.el),
    top, list);
  const off = bus.on('res:change', () => { gold.refresh(); ess.refresh(); });
  audio.ambience('forge', true, 0.5);
  const prevClose = ov.close;
  ov.close = () => { audio.ambience('forge', false); prevClose(); };

  const render = () => {
    clear(top); clear(list);
    const solar = ownedRelic('daga_solar'), lunar = ownedRelic('daga_lunar');
    if (primigenia && solar && lunar) top.appendChild(eclipseCard(solar, lunar, () => { render(); }));
    else if (primigenia && (solar || lunar)) top.appendChild(h('div', { class: 'pg-eclipse-card', style: 'opacity:.7' },
      h('div', { class: 'pg-daggers' }, h('span', { html: relicArt(RELICS[solar ? 'daga_solar' : 'daga_lunar'], 76) }), h('span', { html: icon('candado', { size: 40, color: '#8a7aa0' }) })),
      h('div', null, h('div', { class: 'pg-title', style: 'font-size:18px' }, 'Falta la otra mitad'), h('div', { class: 'lx-muted' }, solar ? 'Nocturna, la Daga Lunar, duerme en la Mina de la Luna Caída.' : 'Aurora, la Daga Solar, descansa en el Templo del Alba.'))));
    const rels = relicInstances().filter((r) => RELICS[r.id]);
    if (!rels.length) { list.appendChild(h('div', { class: 'pg-empty-note' }, 'No tienes nada que forjar. Vuelve con algo que brille.')); return; }
    const box = h('div', { class: 'pg-list', style: 'padding:14px 4px' });
    rels.sort((a, b) => RARITY_ORDER.indexOf(RELICS[b.id].rarity) - RARITY_ORDER.indexOf(RELICS[a.id].rarity));
    for (const r of rels) box.appendChild(forgeRow(r, discount, render));
    list.appendChild(box);
    if (discount) list.appendChild(h('div', { class: 'lx-small lx-muted', style: 'text-align:center;margin:6px 0 14px' }, hilda ? 'Hilda te hace precio: −15%. "Porque me caes bien. No te acostumbres."' : 'El fuego primigenio es generoso: −10%.'));
  };
  render();
}

function forgeRow(r: RelicInstance, discount: number, rerender: () => void): HTMLElement {
  const def = RELICS[r.id];
  const cost = upgradeCost(r, discount);
  const canPay = !!cost && res.can('gold', cost.gold) && res.can('essence', cost.essence);
  const art = h('div', { html: relicArt(def, 64) });
  const btn = h('button', { class: `lx-btn small ${canPay ? 'primary' : ''}`, disabled: !cost || !canPay },
    cost ? `Forjar +${r.level + 1}` : 'Obra maestra');
  btn.addEventListener('click', () => {
    if (!upgradeRelic(r.uid, discount)) { audio.sfx('ui_error'); return; }
    audio.sfx('sword_clash'); setTimeout(() => audio.sfx('level_up'), 140);
    burst(art, '#ff9a3a', 26, 80); flashEl(art);
    toast(`<b>${def.name}</b> forjada a <b>+${r.level}</b>`, { kind: def.rarity, icon: relicArt(def, 26, false) });
    setTimeout(rerender, 380);
  });
  const lvl = r.level ? h('span', { class: 'pg-lvl' }, `+${r.level}`) : null;
  return h('div', { class: 'pg-li' }, art,
    h('div', null, h('div', { class: 'pg-li-name', style: `color:${RARITY_INFO[def.rarity].color}` }, def.name, ' ', lvl),
      h('div', { class: 'pg-li-sub' }, def.effectText),
      h('div', { class: 'pg-li-sub' }, `Nivel ${r.level}/${MAX_RELIC_LEVEL} · cada nivel +25% de poder`)),
    h('div', { style: 'display:flex;flex-direction:column;gap:6px;align-items:flex-end' },
      cost ? h('span', { class: 'pg-cost' },
        h('span', { class: res.can('gold', cost.gold) ? '' : 'bad' }, `${cost.gold.toLocaleString('es-ES')} oro`),
        h('span', { class: res.can('essence', cost.essence) ? '' : 'bad', style: 'color:var(--essence)' }, `${cost.essence} ✦`)) : null,
      btn));
}

function eclipseCard(solar: RelicInstance, lunar: RelicInstance, rerender: () => void): HTMLElement {
  const btn = h('button', { class: 'lx-btn primary big' }, 'Fundir las dagas');
  btn.addEventListener('click', async () => {
    const ok = await confirmModal('Fundir a Aurora y Nocturna', h('div', { class: 'lx-book', style: 'font-size:18px;font-style:italic' },
      'El sol y la luna no deberían tocarse. Si lo haces, no hay vuelta atrás: las dos dagas dejarán de existir y nacerá otra cosa.'), 'Fundir', 'Todavía no', true);
    if (!ok) return;
    await forgeEclipse(solar, lunar);
    rerender();
  });
  return h('div', { class: 'pg-eclipse-card' },
    h('div', { class: 'pg-daggers' }, h('span', { html: relicArt(RELICS.daga_solar, 76) }), h('span', { html: relicArt(RELICS.daga_lunar, 76) })),
    h('div', { style: 'flex:1' },
      h('div', { class: 'pg-title', style: 'font-size:20px' }, 'Aurora + Nocturna = ECLIPSE'),
      h('div', { class: 'lx-muted' }, 'Una espada que mata… y convence a los que no mata de volverse contra su propio ejército.')),
    btn);
}

/** The big moment: both daggers fuse into Eclipse. */
export async function forgeEclipse(solar: RelicInstance, lunar: RelicInstance): Promise<void> {
  const fx = h('div', { class: 'pg-eclipse-fx' }, h('div', { class: 'sun' }), h('div', { class: 'moon' }), h('div', { class: 'corona' }), h('div', { class: 'word' }, 'ECLIPSE'));
  layer('modal').appendChild(fx);
  audio.duck(0.8, 5);
  audio.sfx('whoosh');
  audio.ambience('forge', true, 0.9);
  await wait(1200);
  audio.sfx('heartbeat');
  await wait(1100);
  audio.sfx('eclipse');
  try { engine.pipeline.flash('#f5d99a', 0.9, 0.8); engine.pipeline.chromaticPulse(1.4, 1.2); engine.pipeline.impact(3, 0); } catch { /* ignore */ }
  await wait(900);
  audio.stinger('corruption_complete');
  await wait(1700);
  removeRelic(solar.uid, 'fusion');
  removeRelic(lunar.uid, 'fusion');
  fx.style.transition = 'opacity .6s'; fx.style.opacity = '0';
  setTimeout(() => fx.remove(), 650);
  const inst = grantRelic('eclipse', { reveal: true, where: 'forja_primigenia' });
  track('eclipse_forged');
  if (inst) bus.emit('forge:eclipse', { uid: inst.uid });
  void waitForReveals().then(() => queueBanner('ECLIPSE', 'Mata. Y convence a los que no mata.', 'excepcion', 3.2));
}

// ───────────────────────────── La Academia ─────────────────────────────

const LESSON_GOLD: Record<AbilityDef['rarity'], number> = { comun: 60, pococomun: 90, rara: 180, epica: 350, legendaria: 700, mitica: 1400 };
function lessonPool(): AbilityDef[] {
  return Object.values(ABILITIES).filter((d) => d.comprehension > 0 && !cx.knows(d.id) && !cx.isForgotten(d.id) &&
    ((d.source.races ?? []).includes('mago') || (d.source.jobs ?? []).some((j) => j === 'hechicero' || j === 'erudito' || j === 'estudiante')));
}

export async function openAcademy(locationId: string): Promise<void> {
  if (!G.run) return;
  const gold = resChip('gold', () => G.run.player.gold);
  const ess = resChip('ess', () => G.run.player.essence);
  let tab: 'rangos' | 'lecciones' | 'fusion' = 'rangos';
  const tabs = h('div', { class: 'pg-toolbar' });
  const body = h('div', { class: 'pg-scroll' });
  const ov = openOverlay({ key: 'academy', className: 'pg-academy', onClose: () => off() },
    header('ACADEMIA DE ALTAMIRA', `${LOCATIONS[locationId]?.name ?? 'Altamira'} — "El conocimiento es poder. Nosotros cobramos por los dos."`, () => ov.close(), gold.el, ess.el),
    tabs, body);
  const off = bus.on('res:change', () => { gold.refresh(); ess.refresh(); });
  const render = () => {
    clear(tabs); clear(body);
    tabs.appendChild(seg([['rangos', 'Perfeccionar (−25%)'], ['lecciones', 'Lecciones'], ['fusion', 'Fusión']], tab, (v) => { tab = v; render(); }));
    if (tab === 'rangos') body.appendChild(rankList(0.25, render));
    else if (tab === 'lecciones') body.appendChild(lessonList(render));
    else {
      const book = G.run.player.books.aprendizaje;
      body.appendChild(h('div', { class: 'lx-small lx-muted', style: 'text-align:center;margin-top:10px' },
        book ? 'Con el Libro del Aprendizaje, la Academia fusiona al precio normal (por puro miedo).' : 'Sin el Libro del Aprendizaje la fusión es cara: el doble de Esencia y 500 de oro.'));
      body.appendChild(buildFusionPanel({ costMult: book ? 1 : 2, goldCost: book ? 0 : 500, onDone: render }));
    }
  };
  render();
}

function rankList(discount: number, rerender: () => void): HTMLElement {
  const ids = cx.acquiredIds().map((id) => ABILITIES[id]).filter((d): d is AbilityDef => !!d && d.id !== 'esquivar' && (cx.codexEntry(d.id)?.rank ?? 1) < cx.MAX_RANK)
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name, 'es'));
  if (!ids.length) return h('div', { class: 'pg-empty-note' }, 'No hay nada que perfeccionar. O ya eres perfecto, o todavía no sabes nada.');
  const box = h('div', { class: 'pg-list', style: 'padding:14px 4px' });
  for (const d of ids) {
    const r = cx.rank(d.id);
    const cost = cx.rankUpCost(d.id, discount)!;
    const ok = G.run.player.essence >= cost;
    const ic = h('div', { html: abilityIcon(d, 56) });
    const btn = h('button', { class: `lx-btn small ${ok ? 'primary' : ''}`, disabled: !ok }, `Rango ${RANK_ROMAN[r + 1]} · ${cost} ✦`);
    btn.addEventListener('click', () => {
      if (!cx.rankUp(d.id, discount)) return;
      burst(ic, SCHOOL_INFO[d.school].color, 22); flashEl(ic);
      toast(`<b>${d.name}</b> sube a rango <b>${RANK_ROMAN[r + 1]}</b>`, { kind: d.rarity, icon: abilityIcon(d, 26) });
      setTimeout(rerender, 360);
    });
    box.appendChild(h('div', { class: 'pg-li' }, ic,
      h('div', null, h('div', { class: 'pg-li-name', style: `color:${RARITY_INFO[d.rarity].color}` }, d.name, h('span', { class: 'lx-muted', style: 'font-size:13px' }, `  Rango ${RANK_ROMAN[r]}`)),
        h('div', { class: 'pg-li-sub' }, '★'.repeat(r) + '☆'.repeat(cx.MAX_RANK - r))),
      btn));
  }
  return box;
}

function lessonList(rerender: () => void): HTMLElement {
  const pool = lessonPool().sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity));
  const box = h('div', { class: 'pg-list', style: 'padding:14px 4px' });
  box.appendChild(h('div', { class: 'lx-muted', style: 'font-style:italic;text-align:center;font-family:var(--f-book);font-size:17px' },
    'El profesor te lanza el hechizo encima. Por pedagogía. Cada lección es un punto de Comprensión.'));
  if (!pool.length) { box.appendChild(h('div', { class: 'pg-empty-note' }, 'Ya aprendiste todo lo que Altamira se atreve a enseñar.')); return box; }
  for (const d of pool) {
    const e = cx.codexEntry(d.id);
    const price = LESSON_GOLD[d.rarity];
    const ok = res.can('gold', price);
    const ic = h('div', { html: abilityIcon(d, 56, { pips: e && e.progress > 0 ? [e.progress, d.comprehension] : undefined }) });
    const btn = h('button', { class: `lx-btn small ${ok ? 'primary' : ''}`, disabled: !ok }, `Lección · ${price} oro`);
    btn.addEventListener('click', () => {
      if (!res.spend('gold', price)) return;
      const s = PS(); s.lessons[d.id] = (s.lessons[d.id] ?? 0) + 1;
      audio.sfx((d.sfx as Parameters<typeof audio.sfx>[0]) ?? 'cast_arcane');
      burst(ic, SCHOOL_INFO[d.school].color, 20, 70); flashEl(ic);
      track('lessons');
      const r = cx.comprehend(d.id, 1);
      if (!r.justAcquired) toast(`Lección de <b>${d.name}</b>: ${r.progress}/${r.required}`, { kind: 'epica' });
      setTimeout(rerender, 400);
    });
    box.appendChild(h('div', { class: 'pg-li' }, ic,
      h('div', null, h('div', { class: 'pg-li-name', style: `color:${RARITY_INFO[d.rarity].color}` }, d.name),
        h('div', { class: 'pg-li-sub' }, `${RARITY_INFO[d.rarity].name} · ${SCHOOL_INFO[d.school].name} · Comprensión ${e?.progress ?? 0}/${d.comprehension}`)),
      btn));
  }
  return box;
}

// ───────────────────────────── La Fusión ─────────────────────────────

export async function openFusion(): Promise<void> {
  if (!G.run) return;
  if (!G.run.player.books.aprendizaje) {
    toast('Para fusionar necesitas <b>El Libro del Aprendizaje</b>… o pagar a la Academia de Altamira.', { kind: 'bad', sound: true });
    return;
  }
  const ess = resChip('ess', () => G.run.player.essence);
  const ov = openOverlay({ key: 'fusion', onClose: () => off() },
    header('FUSIÓN', 'Dos reglas rotas hacen una regla nueva.', () => ov.close(), ess.el),
    h('div', { class: 'pg-body' }, buildFusionPanel({ costMult: 1, goldCost: 0 })));
  const off = bus.on('res:change', () => ess.refresh());
}

export interface FusionPanelOpts { costMult: number; goldCost: number; onDone?: () => void }

/** Two sockets + preview + known-ability picker. Used by openFusion, the Códice and the Academia. */
export function buildFusionPanel(opts: FusionPanelOpts): HTMLElement {
  const root = h('div', { class: 'pg-fusion' });
  const pick: [string | null, string | null] = [null, null];
  let active: 0 | 1 = 0;
  const render = () => {
    clear(root);
    const sock = (i: 0 | 1) => {
      const d = pick[i] ? ABILITIES[pick[i]!] : null;
      return h('div', { class: `pg-socket ${active === i ? 'active' : ''}`, onclick: () => { audio.sfx('ui_click'); if (pick[i] && active === i) pick[i] = null; active = i; render(); } },
        d ? h('div', { html: abilityIcon(d, 84) }) : h('div', { html: icon('mas', { size: 40, color: '#6d5f80' }) }),
        h('div', { class: 'pg-socket-name', style: d ? `color:${RARITY_INFO[d.rarity].color}` : 'color:#6d5f80' }, d ? d.name : i === 0 ? 'Primera' : 'Segunda'));
    };
    const vortex = h('div', { class: 'pg-vortex' });
    root.appendChild(h('div', { class: 'pg-fusion-row' }, sock(0), h('div', { class: 'pg-plus' }, '+'), sock(1), h('div', { class: 'pg-plus' }, '='), vortex));
    // preview
    if (pick[0] && pick[1]) {
      const prev = fusionPreview(pick[0], pick[1]);
      if (!prev) root.appendChild(h('div', { class: 'pg-result' }, h('div', { class: 'lx-muted' }, 'Estas dos no se dejan fusionar. Una fusión genérica es demasiado inestable para volver a fusionarse.')));
      else {
        const already = cx.knows(prev.id);
        const cost = Math.round(FUSION_COST[prev.rarity] * opts.costMult);
        const canPay = G.run.player.essence >= cost && G.run.player.gold >= opts.goldCost;
        const named = !!FUSIONS[[pick[0], pick[1]].sort().join('+')];
        const btn = h('button', { class: `lx-btn ${canPay && !already ? 'primary' : ''}`, disabled: already || !canPay },
          already ? 'Ya la conoces' : `Fusionar · ${cost} ✦${opts.goldCost ? ` + ${opts.goldCost} oro` : ''}`);
        btn.addEventListener('click', async () => {
          if (!pick[0] || !pick[1]) return;
          if (!res.spend('essence', cost)) return;
          if (opts.goldCost && !res.spend('gold', opts.goldCost)) { res.add('essence', cost, { raw: true }); return; }
          vortex.classList.add('fast');
          audio.sfx('clone'); audio.sfx('cast_arcane', { pitch: 0.7 });
          burst(vortex, RARITY_INFO[prev.rarity].color, 30, 120);
          await wait(650);
          const id = fuse(pick[0], pick[1]);
          if (!id) return;
          const s = PS(); s.fusionsMade += 1;
          track('fusions');
          bus.emit('fusion:created', { abilityId: id, a: pick[0], b: pick[1] });
          cx.acquire(id);
          pick[0] = pick[1] = null; active = 0;
          opts.onDone?.();
          render();
        });
        root.appendChild(h('div', { class: 'pg-result', style: `--rc:${RARITY_INFO[prev.rarity].color}` },
          h('div', { html: abilityIcon(prev, 84) }),
          h('div', { style: 'flex:1' },
            h('div', { class: 'pg-detail-name', style: `color:${RARITY_INFO[prev.rarity].color};font-size:19px` }, prev.name, named ? h('span', { class: 'pg-tag', style: 'margin-left:8px;font-size:11px;color:var(--gold-hi)' }, 'Receta') : null),
            h('div', { class: 'lx-small lx-muted' }, `${RARITY_INFO[prev.rarity].name} · ${SCHOOL_INFO[prev.school].name}${prev.power ? ` · Poder ${prev.power}` : ''} · Maná ${prev.mana} · ${prev.cooldown} s`),
            h('div', { class: 'lx-small', style: 'margin-top:4px' }, prev.desc)),
          btn));
      }
    } else {
      root.appendChild(h('div', { class: 'lx-muted', style: 'font-family:var(--f-book);font-style:italic;font-size:17px' }, 'Elige dos habilidades que ya comprendas.'));
    }
    // picker
    const cands = cx.acquiredIds().map((id) => ABILITIES[id]).filter((d): d is AbilityDef => !!d && d.id !== 'esquivar' && !isGeneratedFusion(d.id))
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name, 'es'));
    const grid = h('div', { class: 'pg-grid' });
    for (const d of cands) {
      const inUse = pick.includes(d.id);
      const card = h('div', { class: `pg-card r-${d.rarity} ${inUse ? 'sel' : ''}`, style: `--rc:${RARITY_INFO[d.rarity].color}`, 'data-tip': `<b>${d.name}</b>\n${d.desc}` },
        h('div', { html: abilityIcon(d, 56) }), h('div', { class: 'pg-card-name' }, d.name));
      card.addEventListener('click', () => {
        audio.sfx('chip_place');
        if (inUse) { pick[pick.indexOf(d.id) as 0 | 1] = null; render(); return; }
        pick[active] = d.id;
        active = pick[0] && !pick[1] ? 1 : pick[1] && !pick[0] ? 0 : active;
        render();
      });
      grid.appendChild(card);
    }
    root.appendChild(h('div', { class: 'pg-picker' }, grid));
    // recipes hints
    const hints: HTMLElement[] = [];
    for (const [key, res2] of Object.entries(FUSIONS)) {
      if (cx.knows(res2)) continue;
      const [a, b] = key.split('+');
      const ka = cx.knows(a), kb = cx.knows(b);
      if (!ka && !kb) continue;
      const nm = (id: string, k: boolean) => (k ? ABILITIES[id]?.name ?? id : '???');
      hints.push(h('div', { class: 'pg-hint', style: ka && kb ? 'border-color:var(--gold);background:rgba(217,179,108,.1)' : '' },
        h('span', { html: icon(ka && kb ? 'estrella' : 'candado', { size: 16, color: ka && kb ? '#f5d99a' : '#8a7aa0' }) }),
        `${nm(a, ka)} + ${nm(b, kb)} = ${ka && kb ? ABILITIES[res2]?.name ?? '???' : '???'}`));
    }
    if (hints.length) root.appendChild(h('div', { class: 'pg-picker' }, h('div', { class: 'pg-section-title', style: 'margin-top:8px' }, 'Recetas que presientes'), h('div', { class: 'pg-hints' }, ...hints.slice(0, 12))));
  };
  render();
  return root;
}

