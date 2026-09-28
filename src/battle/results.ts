/**
 * Results screen: banner, stats, copied Excepciones, captains, promotions (★), prisoners → Devotos (mana),
 * loot (gold / essence / relics via lootReveal). Returns when the player continues.
 */
import type { ArmyUnit, Rarity } from '../data/types';
import type { BattleResult } from './api';
import type { Battle } from './world';
import { abilityRT } from './defs';
import { abilityIcon } from './icons';
import { h, layer } from '../ui/dom';
import { button, panel } from '../ui/widgets';
import { lootReveal, toast } from '../ui/toasts';
import { G, res } from '../core/state';
import { track } from '../core/tracker';
import { RELICS } from '../data/relics';
import { audio } from '../audio';

type RelicFn = (shape: string, rarity: Rarity, o?: { size?: number }) => string;
const relicMods = import.meta.glob('../ui/art/relic*.ts', { eager: true }) as Record<string, { relicSVG?: RelicFn }>;
const relicArt: RelicFn | undefined = Object.values(relicMods).find((m) => typeof m.relicSVG === 'function')?.relicSVG;

const RAR_COL: Record<Rarity, string> = { comun: '#c8c8c8', pococomun: '#1eff00', rara: '#2f8cff', epica: '#a335ee', legendaria: '#ff8000', mitica: '#e6cc80' };

function relicIcon(id: string): { svg: string; name: string; rarity: Rarity; desc?: string } {
  const d = RELICS[id];
  const rarity: Rarity = d?.rarity ?? 'rara';
  let svg = '';
  if (relicArt && d) { try { svg = relicArt(d.shape, rarity, { size: 110 }); } catch { svg = ''; } }
  if (!svg) svg = `<svg viewBox="0 0 64 64" width="110" height="110"><defs><radialGradient id="rg${id}" cx="50%" cy="40%"><stop offset="0" stop-color="#fff"/><stop offset=".4" stop-color="${RAR_COL[rarity]}"/><stop offset="1" stop-color="#1a0b24"/></radialGradient></defs><polygon points="32,4 56,24 46,58 18,58 8,24" fill="url(#rg${id})" stroke="#f5d99a" stroke-width="2"/><circle cx="32" cy="30" r="7" fill="#0d0714" stroke="#f5d99a"/></svg>`;
  return { svg, name: d?.name ?? id, rarity, desc: d?.effectText };
}

export interface ResultsOpts { debug: boolean; retry?: () => void; onPrisoners?: (n: number) => ArmyUnit[] }

export function showResults(b: Battle, r: BattleResult, promotions: Array<{ name: string; stars: number }>, opts: ResultsOpts): Promise<void> {
  return new Promise((resolve) => {
    const root = h('div', { class: 'bt-results' });
    const kind = r.fled ? 'fled' : r.victory ? '' : 'defeat';
    const title = b.setup.arena ? `¡Gana ${r.winnerSide === 'A' ? b.setup.arena.sideA.name : b.setup.arena.sideB.name}!` : r.fled ? 'Retirada' : r.victory ? '¡Victoria!' : 'Derrota';
    const sub = b.setup.arena ? 'La Arena del Remolino ruge.' : r.fled ? 'Vivir para dominar otro día.' : r.victory ? pickLine(['El mundo recordará esto. Tú te asegurarás de ello.', 'Otro campo que aprende tu nombre.', 'Nadie tiene que salir herido. Casi nadie.']) : r.playerDied ? 'Sin Retornos. Por ahora.' : 'Tu ejército cayó.';
    const stat = (v: string | number, k: string, cls = '') => h('div', { class: `bt-stat ${cls}` }, h('div', { class: 'v' }, String(v)), h('div', { class: 'k' }, k));
    const mins = Math.floor(r.duration / 60), secs = Math.round(r.duration % 60);
    const grid = h('div', { class: 'bt-res-grid' },
      stat(r.enemiesKilled, 'Abatidos'), stat(r.unitsLost.length, 'Bajas', r.unitsLost.length ? 'bad' : ''),
      stat(`+${r.loot.gold}`, 'Oro', 'gold'), stat(`+${r.loot.essence}`, 'Esencia', 'essence'),
      stat(`${mins}:${String(secs).padStart(2, '0')}`, 'Duración'), stat(b.stats.maxStreak, 'Mejor racha'),
      stat(r.revivals, 'Retornos'), stat(b.stats.playerKills, 'Por tu mano'));
    const body = h('div', null, grid);
    if (r.copied.length) {
      body.appendChild(h('div', { class: 'bt-res-sec' }, h('h4', null, 'Excepciones adquiridas'),
        h('div', { class: 'bt-chips' }, ...r.copied.map((id) => { const ab = abilityRT(id); return h('span', { class: 'bt-chip exc', html: `${ab ? abilityIcon(id, ab.school, 24) : ''}<span>${ab?.name ?? id}</span>` }); }))));
    }
    if (r.captainsKilled.length || r.captainsFled.length || r.captainKilledPlayer) {
      body.appendChild(h('div', { class: 'bt-res-sec' }, h('h4', null, 'Capitanes'),
        h('div', { class: 'bt-chips' },
          ...r.captainsKilled.map((n) => h('span', { class: 'bt-chip cap' }, `☠ ${prettyNpc(n)}`)),
          ...r.captainsFled.map((n) => h('span', { class: 'bt-chip' }, `↩ ${prettyNpc(n)} huyó`)),
          r.captainKilledPlayer ? h('span', { class: 'bt-chip cap' }, `⚔ ${prettyNpc(r.captainKilledPlayer)} te mató`) : null)));
    }
    if (promotions.length) {
      body.appendChild(h('div', { class: 'bt-res-sec' }, h('h4', null, 'Ascensos'),
        h('div', { class: 'bt-chips' }, ...promotions.slice(0, 16).map((p) => h('span', { class: 'bt-chip star' }, `${p.name} ${'★'.repeat(p.stars)}`)))));
    }
    if (r.prisoners > 0 && opts.onPrisoners) {
      const cost = 10;
      const total = cost * r.prisoners;
      const txt = h('div', { class: 'txt', html: `<b>${r.prisoners}</b> prisionero${r.prisoners > 1 ? 's' : ''} con la mente abierta. Conviértelos en <b>Devotos</b> por ${total} de maná.` });
      const btn = button('Convertir en Devotos', () => {
        const mana = G.run?.player.mana ?? 0;
        if (!opts.debug && mana < total) { toast('No tienes suficiente maná', { kind: 'bad', sound: true }); return; }
        if (!opts.debug) res.spend('mana', total);
        const devs = opts.onPrisoners!(r.prisoners);
        track('devotos', devs.length);
        audio.sfx('mind_control', { volume: 0.9 });
        toast(`${devs.length} Devoto${devs.length > 1 ? 's' : ''} se unen a tu ejército`, { kind: 'epica' });
        btn.disabled = true; btn.textContent = 'Convertidos';
      }, { kind: 'primary' });
      body.appendChild(h('div', { class: 'bt-res-sec' }, h('div', { class: 'bt-prisoners' }, txt, btn)));
    }
    const actions = h('div', { class: 'bt-res-actions' });
    const finish = () => { root.remove(); resolve(); };
    if (r.loot.relics.length) {
      const lootBtn = button(`Botín (${r.loot.relics.length})`, async () => {
        lootBtn.disabled = true;
        await lootReveal(r.loot.relics.map((id) => relicIcon(id)), 'Botín');
      }, { kind: 'primary' });
      actions.appendChild(lootBtn);
    }
    if (opts.retry) actions.appendChild(button('Repetir batalla', () => { root.remove(); opts.retry!(); resolve(); }, { kind: 'ghost' }));
    actions.appendChild(button('Continuar', finish, { kind: r.loot.relics.length ? 'ghost' : 'primary', big: true, hotkey: 'Enter' }));
    const onKey = (e: KeyboardEvent) => { if (e.code === 'Enter' && root.isConnected && !document.querySelector('.lx-loot')) { e.preventDefault(); window.removeEventListener('keydown', onKey); finish(); } };
    window.addEventListener('keydown', onKey);
    root.appendChild(panel({ className: 'bt-res-panel' }, h('div', { class: `bt-res-title ${kind}` }, title), h('div', { class: 'bt-res-sub' }, sub), body, actions));
    layer('modal').appendChild(root);
  });
}

function prettyNpc(id: string): string {
  const m = G.run?.npcs?.[id]?.generated?.name;
  return m ?? id;
}
function pickLine(a: string[]): string { return a[Math.floor(Math.random() * a.length)]; }

