/**
 * Arena del Remolino — bet on one of two random armies (UNITS). Odds = Monte-Carlo win chance with a 7% margin.
 * Watch it in 3D (battle module, spectator mode, live bet overlay; settles on return via params.settle) or resolve it
 * quickly here with an animated skirmish. Cheat: sneak in under the Velo and sabotage the other side (very visible).
 */
import { h, layer } from '../../ui/dom';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import { fmt } from '../../core/math';
import { G, res } from '../../core/state';
import { uid } from '../../core/rng';
import { portraitSVG } from '../../ui/art/portraits';
import { crestSVG } from '../../ui/art/heraldry';
import { UNITS } from '../../data/units';
import { RACES } from '../../data/races';
import type { RaceId, UnitDef, ContinentId } from '../../data/types';
import type { BattleContext, BattleScript, BattleSetup, UnitHandle } from '../../battle/api';
import { cs, bet as takeBet, settle, luna, betLadder, gold, hotFor, type ArenaBet, type ArenaMatch, type ArenaSideSpec } from '../state';
import { winBanner, tierFor, coinBurst, centerOf, shakeEl } from '../fx2d';
import { gameHeader, betPicker, rulesSheet, cheatButton } from '../ui';
import { cheatRoll, cleanRound } from '../security';
import { simulate, winProbA, quote, type SimGroup } from './arenaMath';
import type { GameCtx, GameView } from '../types';

const EXCLUDE = new Set(['aurel', 'clon_sombra', 'devoto', 'espiritu_ancestral']);
const NAMES: Partial<Record<RaceId, string[]>> = {
  humano: ['Los Milicianos del Vado', 'La Guardia Gris', 'La Marea Pirata', 'Los Mosqueteros de la Banca'],
  caballero: ['Los Juramentados', 'La Orden del Escudo Roto'], clerigo: ['La Guardia del Alba', 'Los Hermanos de la Luz'],
  picaro: ['El Gremio de la Ceniza', 'Las Navajas del Callejón'], elfo: ['Las Hojas de Plata', 'Los Arqueros de Lúmen'],
  duende: ['Los Duendes Explosivos', 'La Pandilla de la Banca'], enano: ['Los Martillos de Kharaz', 'La Barba de Hierro'],
  gigante: ['Los Escalones Vivientes', 'La Montaña que Camina'], ogro: ['Los Tragapiedras', 'Los Glotones de Grub'],
  mago: ['Los Aprendices de Altamira', 'El Círculo de la Tormenta'], bruja: ['El Aquelarre', 'Las Hermanas del Caldero'],
  trol: ['Los Pacientes de Jabu', 'Los Colmillos de la Ciénaga'], sirena: ['El Coro del Faro'], draconido: ['Las Escamas de Alquiler'],
};
const CALLS = [
  '¡Un {u} salió volando hasta las gradas!', '¡Qué golpe! ¡El público enloquece!', '¡Ese {u} no vio venir nada!',
  '¡Eso va a doler mañana!', '¡Un {u} perdió el casco… y la dignidad!', '¡El remolino se traga a un {u}!', '¡Qué batalla, patojos, qué batalla!',
  '¡{u} contra {v}! ¡Nadie se mueve de su asiento!',
];

const toSim = (u: UnitDef) => ({ id: u.id, hp: u.hp, damage: u.damage, cooldown: u.attackCooldown, armor: u.armor, role: u.role, tier: u.tier });
const simSide = (side: ArenaSideSpec): SimGroup[] => side.groups.filter((g) => UNITS[g.unitId]).map((g) => ({ unit: toSim(UNITS[g.unitId]), count: g.count }));

function genSide(avoid: RaceId | null, color: string): ArenaSideSpec & { race: RaceId } {
  const all = Object.values(UNITS).filter((u) => !EXCLUDE.has(u.id));
  const races = [...new Set(all.map((u) => u.race))].filter((r) => r !== avoid && r !== 'excepcion');
  const race = races[Math.floor(Math.random() * races.length)] as RaceId;
  const home = RACES[race]?.homeContinents?.[0];
  let pool = all.filter((u) => u.race === race);
  if (home) pool = pool.concat(all.filter((u) => u.race !== race && u.recruitAt?.includes(home)).slice(0, 4));
  const own = pool.filter((u) => u.race === race).sort(() => Math.random() - 0.5);
  const allies = pool.filter((u) => u.race !== race).sort(() => Math.random() - 0.5);
  // the namesake race always fields at least one unit type
  const types = [own[0], ...[...own.slice(1), ...allies].sort(() => Math.random() - 0.5)].filter(Boolean).slice(0, 1 + Math.floor(Math.random() * Math.min(3, pool.length)));
  const groups = types.map((u) => ({ unitId: u.id, count: u.tier === 1 ? 4 + Math.floor(Math.random() * 6) : u.tier === 2 ? 2 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 2) }));
  const names = NAMES[race] ?? [`Los ${RACES[race]?.plural ?? 'Valientes'}`];
  return { race, name: names[Math.floor(Math.random() * names.length)], groups, color, crest: (home ?? 'islas') as string };
}

export function genMatch(): ArenaMatch | null {
  if (Object.keys(UNITS).length < 4) return null;
  const A = genSide(null, '#e2455b');
  const B = genSide(A.race, '#4f8aff');
  if (B.name === A.name) B.name = `${B.name} II`;
  // rebalance so the favourite is never absurd
  const r = Math.random;
  let pA = winProbA(simSide(A), simSide(B), r, 120);
  for (let k = 0; k < 8 && (pA > 0.78 || pA < 0.22); k++) {
    const weak = pA > 0.5 ? B : A;
    const g = weak.groups[Math.floor(Math.random() * weak.groups.length)];
    g.count += UNITS[g.unitId]?.tier === 3 ? 1 : 2;
    pA = winProbA(simSide(A), simSide(B), r, 120);
  }
  pA = winProbA(simSide(A), simSide(B), r, 300);
  const q = quote(pA);
  return { id: uid('am'), a: { name: A.name, groups: A.groups, color: A.color, crest: A.crest }, b: { name: B.name, groups: B.groups, color: B.color, crest: B.crest }, pA, oddsA: q.a, oddsB: q.b, createdLuna: luna() };
}

export const odds = (n: number) => `×${n.toFixed(2).replace('.', ',')}`;

/** Ensure a fresh open matchup exists (used by the lobby card and the 3D odds board). */
export function currentMatch(): ArenaMatch | null {
  const s = cs();
  const pending = Object.values(s.arenaBets).some((b) => b.status !== 'settled' && b.match.id === s.arenaMatch?.id);
  if (!s.arenaMatch || pending || luna() - s.arenaMatch.createdLuna > 2) s.arenaMatch = genMatch();
  return s.arenaMatch;
}

export function openArena(ctx: GameCtx): GameView {
  const { host } = ctx;
  const s = cs();
  let busy = false;
  let side: 'A' | 'B' | null = null;
  let cheat = false;
  const params = ctx.params ?? {};
  const from = typeof params.from === 'string' ? params.from : G.run.player.location ?? 'puerto_fortuna';

  const body = h('div', { class: 'cs-ar' });
  const rules = rulesSheet('Arena del Remolino', h('div', null,
    h('p', null, 'Dos ejércitos al azar, un remolino y mucha gente gritando. Apuesta por uno: la cuota refleja su probabilidad real de ganar, con un 7% para la casa.'),
    h('p', null, h('b', null, 'Ver en la Arena: '), 'miras el combate completo en 3D. ', h('b', null, 'Resultado rápido: '), 'se decide aquí mismo, en segundos.'),
    h('p', { class: 'muted' }, 'Colarte con el Velo inclina la balanza… pero todo el coliseo está mirando la arena. Oro del juego.')));
  const root = h('div', { class: 'cs-game cs-arena' },
    gameHeader('arena', 'Arena del Remolino', 'Apuesta a quién sale volando', () => host.back(), h('button', { class: 'cs-btn small', onclick: () => rules.toggle() }, 'Reglas')),
    body, rules.el);
  ctx.root.appendChild(root);
  document.querySelectorAll('.cs-arena-overlay').forEach((e) => e.remove());

  function ensureMatch(): ArenaMatch | null {
    const m = currentMatch();
    if (m) host.setBoard([`${m.a.name}  ${odds(m.oddsA)}`, `${m.b.name}  ${odds(m.oddsB)}`, '¡Apuestas abiertas!']);
    return m;
  }

  function sideCard(m: ArenaMatch, which: 'A' | 'B'): HTMLElement {
    const sp = which === 'A' ? m.a : m.b;
    const o = which === 'A' ? m.oddsA : m.oddsB;
    const p = which === 'A' ? m.pA : 1 - m.pA;
    const units = sp.groups.map((g) => {
      const u = UNITS[g.unitId];
      if (!u) return null;
      return h('div', { class: 'cs-ar-unit', 'data-tip': `<b>${u.name}</b>\n${u.desc}\nPV ${u.hp} · daño ${u.damage}` },
        h('div', { class: 'cs-ar-uface', html: portraitSVG({ seed: `arena_${u.id}`, race: u.race, job: u.job, mood: 'determined' }, 58) }),
        h('div', { class: 'cs-ar-uname' }, u.name), h('div', { class: 'cs-ar-ucount' }, `×${g.count}`));
    });
    let crest = '';
    try { crest = crestSVG(sp.crest as ContinentId, 64); } catch { crest = ''; }
    const card = h('div', { class: `cs-ar-side ${which} ${side === which ? 'picked' : ''}`, style: `--sc:${sp.color}`, onclick: () => { if (busy) return; side = which; audio.sfx('chip_place'); render(); } },
      h('div', { class: 'cs-ar-crest', html: crest }),
      h('div', { class: 'cs-ar-name' }, sp.name),
      h('div', { class: 'cs-ar-units' }, ...units),
      h('div', { class: 'cs-ar-strength' }, h('div', { class: 'cs-ar-bar', style: `width:${Math.round(p * 100)}%` })),
      h('div', { class: 'cs-ar-odds' }, odds(o)),
      h('div', { class: 'cs-ar-prob' }, `${Math.round(p * 100)}% de ganar`),
      h('div', { class: 'cs-ar-pick' }, side === which ? '✔ Tu apuesta' : 'Apostar aquí'));
    return card;
  }

  let picker: ReturnType<typeof betPicker> | null = null;
  function render(): void {
    body.innerHTML = '';
    const m = ensureMatch();
    if (!m) {
      body.append(h('div', { class: 'cs-ar-empty' }, 'Hoy no hay combates: los gladiadores todavía no llegan al remolino.'));
      return;
    }
    const betAmt = picker?.value() ?? 100;
    picker = betPicker(betLadder([25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]), betAmt, () => renderFoot());
    const foot = h('div', { class: 'cs-ar-foot' });
    body.append(h('div', { class: 'cs-ar-match' }, sideCard(m, 'A'), h('div', { class: 'cs-ar-vs' }, h('div', { class: 'cs-ar-vs-t' }, 'VS'), h('div', { class: 'cs-ar-whirl' })), sideCard(m, 'B')), foot);
    function renderFoot(): void {
      foot.innerHTML = '';
      const amt = picker!.value();
      const o = side === 'A' ? m!.oddsA : side === 'B' ? m!.oddsB : 0;
      const hot = hotFor('arena');
      const units3d = m!.a.groups.every((g) => UNITS[g.unitId]) && m!.b.groups.every((g) => UNITS[g.unitId]);
      const cheatB = cheatButton('velo', cheat ? 'Velo: colarte (activado)' : 'Colarte en la arena con el Velo', 16, 'Te cuelas invisible y debilitas al otro bando antes del combate. Todo el coliseo mira la arena: muy arriesgado.', () => { cheat = !cheat; audio.sfx(cheat ? 'invisibility_on' : 'invisibility_off'); renderFoot(); });
      if (cheatB && cheat) cheatB.classList.add('cs-pulse');
      foot.append(
        picker!.el,
        h('div', { class: 'cs-ar-payout' }, side ? h('span', null, 'Si gana ', h('b', null, side === 'A' ? m!.a.name : m!.b.name), ': cobras ', h('b', { class: 'cs-ar-win' }, fmt(Math.floor(amt * o))), hot ? ` (+${hot.label} mesa caliente)` : '') : h('span', { class: 'lx-muted' }, 'Elige un bando.')),
        h('div', { class: 'cs-ar-go' },
          h('button', { class: 'cs-btn gold big', disabled: !side || busy || gold() < amt || !units3d, onclick: () => void place('3d'), 'data-tip': units3d ? 'Ver el combate completo en 3D' : 'Faltan unidades para la arena 3D' }, '⚔ Apostar y ver la batalla'),
          h('button', { class: 'cs-btn big', disabled: !side || busy || gold() < amt, onclick: () => void place('rapida') }, '⚡ Resultado rápido')),
        cheatB ?? '');
    }
    renderFoot();
  }

  async function place(mode: '3d' | 'rapida'): Promise<void> {
    const m = s.arenaMatch;
    if (!m || !side || busy || !picker) return;
    const amt = picker.value();
    if (!takeBet('arena', amt)) { audio.sfx('ui_error'); return; }
    if (await host.raidCheck('arena', amt)) return;
    busy = true;
    const o = side === 'A' ? m.oddsA : m.oddsB;
    const bet: ArenaBet = { id: uid('ab'), match: m, side, amount: amt, odds: o, status: 'pending', cheat, mode };
    s.arenaBets[bet.id] = bet;
    audio.sfx('coins_many', { volume: 0.5 });
    if (cheat) {
      res.spend('mana', 16);
      const r = cheatRoll('arena', 'velo', 1.3, 0.35);
      if (r.caught) {
        bet.status = 'settled';
        settle('arena', amt, 0);
        await host.caught('arena', 'Te vieron colarte en la arena bajo el Velo');
        return;
      }
    }
    if (mode === '3d') { launch3d(bet); return; }
    await quick(bet);
  }

  function launch3d(bet: ArenaBet): void {
    const m = bet.match;
    const betName = bet.side === 'A' ? m.a.name : m.b.name;
    let overlay: HTMLElement | null = null;
    let tick = 0;
    const teams = (c: BattleContext): { A: UnitHandle[]; B: UnitHandle[] } => {
      const t2 = c.units(2).filter((u) => u.alive);
      if (t2.length || c.units(2).length) return { A: [...c.units(0), ...c.units(1)].filter((u) => u.alive && !u.isPlayer), B: t2 };
      return { A: c.units(0).filter((u) => u.alive && !u.isPlayer), B: c.units(1).filter((u) => u.alive) };
    };
    const script: BattleScript = {
      id: 'casino_arena',
      onStart(c) {
        try {
          overlay = h('div', { class: 'cs-arena-overlay' }, h('div', { class: 'cs-ao-bet' }, `Tu apuesta: ${fmt(bet.amount)} a `, h('b', { style: `color:${bet.side === 'A' ? m.a.color : m.b.color}` }, betName), ` ${odds(bet.odds)}`), h('div', { class: 'cs-ao-count' }));
          layer('hud').appendChild(overlay);
          if (bet.cheat) {
            const t = teams(c);
            const enemies = (bet.side === 'A' ? t.B : t.A).slice().sort(() => Math.random() - 0.5);
            enemies.slice(0, Math.ceil(enemies.length * 0.35)).forEach((u) => c.damage(u, u.hpMax * 0.55, { knockback: 9 }));
            c.hint('Desde las sombras, alguien empuja la balanza…', 3);
          }
        } catch (err) { console.warn('[casino] arena overlay', err); }
      },
      onUpdate(c, dt) {
        tick += dt;
        if (tick < 0.4 || !overlay) return;
        tick = 0;
        try { const t = teams(c); const el = overlay.querySelector('.cs-ao-count'); if (el) el.innerHTML = `<span style="color:${m.a.color}">${m.a.name}: ${t.A.length}</span> · <span style="color:${m.b.color}">${m.b.name}: ${t.B.length}</span>`; } catch { /* ignore */ }
      },
      onEnd() { overlay?.remove(); overlay = null; },
    };
    const setup: BattleSetup = {
      kind: 'arena', biome: 'arena', continent: 'islas', locationId: 'arena_remolino', timeOfDay: 0.62, title: `${m.a.name} contra ${m.b.name}`,
      player: { present: false, army: [] },
      enemy: { faction: 'islas', groups: [] },
      arena: { sideA: { name: m.a.name, groups: m.a.groups }, sideB: { name: m.b.name, groups: m.b.groups } },
      script, allowRetreat: false, deploy: false,
      returnTo: { scene: 'casino', params: { game: 'arena', settle: bet.id, from, direct: from === 'arena_remolino' } },
      onResult: (r) => { const b = cs().arenaBets[bet.id]; if (b && b.status === 'pending') { b.winner = r.winnerSide ?? (r.victory ? 'A' : 'B'); b.status = 'resolved'; } },
    };
    s.arenaMatch = null;
    host.say('¡A sus asientos, patojo! Que empiece el remolino.', { mood: 'smile' });
    void engine.goto('battle', setup, { fade: 0.6, card: { title: 'Arena del Remolino', subtitle: `${m.a.name} contra ${m.b.name}`, hold: 1.4 } });
  }

  async function quick(bet: ArenaBet): Promise<void> {
    const m = bet.match;
    const sab = bet.cheat ? { side: bet.side, frac: 0.35 } : null;
    const sim = simulate(simSide(m.a), simSide(m.b), Math.random, sab);
    bet.winner = sim.winner; bet.status = 'resolved';
    s.arenaMatch = null;
    body.innerHTML = '';
    const col = (sp: ArenaSideSpec, key: 'a' | 'b') => {
      const tokens: HTMLElement[][] = sp.groups.map((g) => Array.from({ length: g.count }, () => h('div', { class: 'cs-ar-tok', html: portraitSVG({ seed: `arena_${g.unitId}`, race: UNITS[g.unitId]?.race ?? 'humano', job: UNITS[g.unitId]?.job, mood: 'angry' }, 52) })));
      const el = h('div', { class: `cs-ar-col ${key}`, style: `--sc:${sp.color}` }, h('div', { class: 'cs-ar-name' }, sp.name), h('div', { class: 'cs-ar-toks' }, ...tokens.flat()));
      return { el, tokens };
    };
    const A = col(m.a, 'a'), B = col(m.b, 'b');
    const call = h('div', { class: 'cs-ar-call' }, '¡Comienza el combate!');
    body.append(h('div', { class: 'cs-ar-fight' }, A.el, h('div', { class: 'cs-ar-mid' }, h('div', { class: 'cs-ar-whirl big' }), call), B.el));
    audio.sfx('horn_war'); audio.sfx('crowd_cheer', { volume: 0.6 });
    host.tension(0.3);
    const frames = sim.frames;
    const stepMs = Math.max(90, Math.min(260, 5200 / frames.length));
    for (let i = 1; i < frames.length && ctx.alive(); i++) {
      const f = frames[i];
      for (const [side2, arr] of [[A, f.a], [B, f.b]] as Array<[typeof A, number[]]>) {
        side2.tokens.forEach((toks, gi) => { toks.forEach((t, ti) => { if (ti >= arr[gi] && !t.classList.contains('ko')) { t.classList.add('ko'); if (Math.random() < 0.3) audio.sfx(Math.random() < 0.5 ? 'hit_heavy' : 'punch_launch', { volume: 0.35 }); } }); });
      }
      if (i % 6 === 0) {
        const names = [...m.a.groups, ...m.b.groups].map((g) => (UNITS[g.unitId]?.name ?? 'gladiador').toLowerCase());
        const pickN = () => names[Math.floor(Math.random() * names.length)];
        call.textContent = CALLS[Math.floor(Math.random() * CALLS.length)].replace('{u}', pickN()).replace('{v}', pickN());
        audio.sfx('crowd_cheer', { volume: 0.3 }); shakeEl(call);
      }
      await new Promise((r) => window.setTimeout(r, stepMs));
    }
    host.tension(0);
    if (!ctx.alive()) return;
    await settleBet(bet);
  }

  async function settleBet(bet: ArenaBet): Promise<void> {
    const m = bet.match;
    busy = true;
    if (bet.status === 'pending') {
      bet.status = 'settled';
      settle('arena', bet.amount, bet.amount, { noStreak: true });
      body.innerHTML = '';
      body.append(h('div', { class: 'cs-ar-result' }, h('div', { class: 'cs-ar-rt' }, 'Combate suspendido'), h('div', null, 'La batalla no terminó. La Banca te devuelve la apuesta.'), h('button', { class: 'cs-btn gold', onclick: () => { busy = false; render(); } }, 'Otro combate')));
      return;
    }
    if (bet.status === 'settled') { busy = false; render(); return; }
    bet.status = 'settled';
    const won = bet.winner === bet.side;
    host.hud.holdGold();
    const r = settle('arena', bet.amount, won ? Math.floor(bet.amount * bet.odds) : 0);
    const wname = bet.winner === 'A' ? m.a.name : m.b.name;
    const wcol = bet.winner === 'A' ? m.a.color : m.b.color;
    body.innerHTML = '';
    const again = h('button', { class: 'cs-btn gold big', onclick: () => { busy = false; render(); } }, 'Siguiente combate');
    body.append(h('div', { class: `cs-ar-result ${won ? 'won' : 'lost'}` }, h('div', { class: 'cs-ar-rt', style: `color:${wcol}` }, `¡Gana ${wname}!`), h('div', { class: 'cs-ar-rs' }, won ? `Tu apuesta ${odds(bet.odds)} paga ${fmt(Math.floor(bet.amount * bet.odds))} de oro.` : `Apostaste ${fmt(bet.amount)} a ${bet.side === 'A' ? m.a.name : m.b.name}. El remolino se lo tragó.`), again));
    if (won) {
      cleanRound();
      const o = centerOf(body);
      coinBurst(o.x, o.y, 50, { gems: true });
      const tier = tierFor(r.net, bet.amount) ?? 'win';
      host.celebrate(tier === 'win' ? 1 : 2);
      await winBanner(tier, r.net, { origin: o, sub: wname.toUpperCase() });
    } else { host.gloat(); audio.sfx('crowd_boo', { volume: 0.6 }); }
    host.hud.releaseGold();
    // keep the bet log short
    const settled = Object.values(s.arenaBets).filter((b) => b.status === 'settled');
    if (settled.length > 6) for (const b of settled.slice(0, settled.length - 6)) delete s.arenaBets[b.id];
  }

  const settleId = typeof params.settle === 'string' ? params.settle : '';
  // explicit settle (return from the 3D battle), or any bet left unpaid by an interrupted visit
  const pending = (settleId ? s.arenaBets[settleId] : undefined)
    ?? Object.values(s.arenaBets).find((b) => b.status === 'resolved' || (b.status === 'pending' && (b.mode === 'rapida' || !settleId)));
  if (pending) void settleBet(pending);
  else render();
  if (!pending) host.say('En la Arena se apuesta a quién sale volando más lejos. Casi siempre es un duende.', { mood: 'smile' });

  return {
    close() { host.hud.releaseGold(); host.tension(0); root.remove(); },
  };
}
