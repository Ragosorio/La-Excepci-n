/**
 * Los Ojos de la Casa — casino security.
 * Suspicion 0..100: each cheat adds 12·visibility·(1−stealth) (+ rival perception); improbable wins add a little too.
 * Catch roll: P = min(.95, (s/100)²·visibility·(1−stealth) + perception·.12·(1−stealth)).
 * Caught → fine, a fight with goblin guards (battle 'escaramuza'), escaping with Velo, or Tiburcio's mercy (once).
 */
import { engine } from '../core/engine';
import { bus } from '../core/events';
import { G, res } from '../core/state';
import { track } from '../core/tracker';
import { addNews } from '../core/news';
import { h, layer, wait } from '../ui/dom';
import { dialogue } from '../ui/dialogue';
import { portraitSVG } from '../ui/art/portraits';
import { audio } from '../audio';
import { fmt } from '../core/math';
import { applyDeed, changeRep, remember, repValue } from '../systems/society/api';
import { rank } from '../systems/progression/codex';
import { relicPassive } from '../systems/progression/relics';
import { UNITS } from '../data/units';
import type { BattleSetup } from '../battle/api';
import { cs, clamp, luna, type GameId } from './state';
import { canUse } from './ui';

export function stealthFor(ability: 'velo' | 'dominar_mente' | 'otro'): number {
  let s = 0.12;
  if (ability !== 'otro') { try { s += (rank(ability) - 1) * 0.08; } catch { /* stub */ } }
  try { s += relicPassive('stealth') + relicPassive('casino_stealth'); } catch { /* stub */ }
  if (ability === 'velo') s += 0.15;
  return clamp(s, 0, 0.8);
}

export interface CheatRoll { caught: boolean; p: number; suspicion: number; noticed: boolean }

/** One cheat attempt. visibility ~0.4 (subtle) .. 1.5 (blatant); perception 0..1 from whoever is watching. */
export function cheatRoll(game: GameId, ability: 'velo' | 'dominar_mente' | 'otro', visibility: number, perception = 0): CheatRoll {
  const s = cs();
  const st = stealthFor(ability);
  s.suspicion = clamp(s.suspicion + 12 * visibility * (1 - st) + perception * 8, 0, 100);
  const p = Math.min(0.95, (s.suspicion / 100) ** 2 * visibility * (1 - st) + perception * 0.12 * (1 - st));
  const caught = Math.random() < p;
  track('cheats');
  bus.emit('casino:cheat', { game, caught });
  return { caught, p, suspicion: s.suspicion, noticed: !caught && s.suspicion >= 30 };
}

/** Honest but improbable wins still make the house nervous (a 1-in-1000 win adds ~12). */
export function improbable(p: number): void {
  if (!(p > 0) || p >= 0.1) return;
  cs().suspicion = clamp(cs().suspicion + 6 * Math.max(0, -Math.log10(p) - 1), 0, 100);
}
export function cleanRound(): void { const s = cs(); s.suspicion = Math.max(0, s.suspicion - 5); }
export function decaySuspicion(dt: number): void { const s = cs(); if (s.suspicion > 0) s.suspicion = Math.max(0, s.suspicion - dt * 0.35); }

export function guardUnitId(): string | null {
  if (UNITS.guardia_banca) return 'guardia_banca';
  const all = Object.values(UNITS);
  const pick = all.find((u) => u.race === 'duende' && (u.role === 'tanque' || u.role === 'melee'))
    ?? all.find((u) => u.race === 'duende')
    ?? all.find((u) => u.job === 'guardian');
  return pick?.id ?? null;
}

/** Los Ojos de la Casa: bank guards backed by goblin bombers when available. */
export function guardGroups(clandestino: boolean): Array<{ unitId: string; count: number }> {
  const main = guardUnitId();
  if (!main) return [];
  const out = [{ unitId: main, count: clandestino ? 3 : 4 }];
  if (UNITS.duende_bombardero) out.push({ unitId: 'duende_bombardero', count: clandestino ? 3 : 5 });
  if (UNITS.mosquetero && !clandestino) out.push({ unitId: 'mosquetero', count: 2 });
  return out;
}

export const CHEPE = () => portraitSVG({ seed: 'chepe_tuerto', race: 'duende', job: 'guardian', eyepatch: true, scar: true, mood: 'angry' }, 400);

function alarm(): Promise<void> {
  const el = h('div', { class: 'cs-alarm' }, h('div', { class: 'cs-alarm-eye' }), h('div', { class: 'cs-alarm-title' }, '¡LOS OJOS DE LA CASA!'), h('div', { class: 'cs-alarm-sub' }, 'Te vieron.'));
  layer('cutin').appendChild(el);
  audio.sfx('alert_rise'); audio.sfx('crowd_gasp');
  engine.pipeline.flash('#e2455b', 0.45, 0.6);
  engine.pipeline.impact(2, 2);
  return wait(1800).then(() => { el.classList.add('out'); return wait(400); }).then(() => el.remove());
}

export type CaughtOutcome = 'fine' | 'fight' | 'fled' | 'forgiven' | 'banned';

/** Full caught sequence. `from` = location id for the return trip. */
export async function caughtFlow(game: GameId, why: string, from: string, clandestino: boolean): Promise<CaughtOutcome> {
  const s = cs();
  s.caught++;
  track('cheats_caught');
  await alarm();
  const fine = Math.max(250, Math.round(G.run.player.gold * 0.18 / 50) * 50);
  const canPay = res.can('gold', fine);
  const guard = guardUnitId();
  const bancaRep = (() => { try { return repValue('banca'); } catch { return 0; } })();
  const mercy = !clandestino && s.tiburcio.forgave < 1 && (s.net < -5000 || bancaRep > 40);
  const who = clandestino ? 'El Chato Quiñónez' : 'Chepe el Tuerto';
  const opener = clandestino
    ? `¡Ey, ey, ey! Aquí somos clandestinos, patojo, no ciegos. ${why}. ¿Cómo lo arreglamos?`
    : s.caught > 1
      ? `¿Otra vez vos? ${why}. Don Tiburcio ya te tiene en su librito negro, shute.`
      : `Quieto ahí, mago. ${why}. En la Banca las trampas se pagan… con oro o con dientes.`;
  const choice = await dialogue.ask(
    { speaker: who, title: clandestino ? 'Dueño del Clandestino' : 'Jefe de Los Ojos de la Casa', portrait: CHEPE(), text: opener },
    [
      { id: 'fine', text: `Pagar la multa (${fmt(fine)} de oro)`, disabled: !canPay, hint: canPay ? '' : 'No te alcanza' },
      { id: 'fight', text: 'Pelear con los guardias', disabled: !guard, hint: guard ? 'Batalla' : 'Los guardias no están' },
      ...(canUse('velo') ? [{ id: 'flee', text: 'Desaparecer con el *Velo*', hint: `${Math.round((0.5 + stealthFor('velo') * 0.5) * 100)}%` }] : []),
      ...(mercy ? [{ id: 'mercy', text: 'Pedirle clemencia a Don Tiburcio', hint: 'Una sola vez' }] : []),
      { id: 'accept', text: 'Aceptar la expulsión', hint: 'Veto de 3 lunas' },
    ],
  );
  const loc = clandestino ? from : 'puerto_fortuna';
  const consequences = (magnitude: number) => {
    try { applyDeed({ kind: 'cheat_caught', location: loc, faction: 'banca', magnitude, text: `Atrapado haciendo trampa en ${clandestino ? 'el Casino Clandestino' : 'el Gran Casino'}` }); } catch { /* stub */ }
    try { changeRep('banca', -8 * magnitude); } catch { /* stub */ }
    try { remember('tiburcio', { kind: 'enganado', text: 'Me hizo trampa en mi propio casino', where: loc, intensity: 5 + magnitude }); } catch { /* stub */ }
  };
  const ban = (n: number) => {
    s.bannedUntil = luna() + n; s.bans++;
    bus.emit('casino:banned', { lunas: n });
  };
  if (choice === 'fine') {
    res.spend('gold', fine);
    audio.sfx('coins_many');
    consequences(1);
    s.suspicion = 40;
    if (s.caught >= 3) ban(1);
    await dialogue.say({ speaker: who, portrait: CHEPE(), text: s.caught >= 3 ? 'Pagaste, pero ya te conocemos la maña. Una luna afuera, pues.' : 'Así me gusta. Pagando se entiende la gente. Portate bien, ¿va?' });
    return s.caught >= 3 ? 'banned' : 'fine';
  }
  if (choice === 'mercy') {
    s.tiburcio.forgave++;
    s.suspicion = 50;
    await dialogue.say({ speaker: 'Don Tiburcio', title: 'Gran Banquero', portrait: { seed: 'tiburcio', race: 'duende', special: 'tiburcio', mood: 'smug' }, text: 'Chepe, soltalo. Este patojo ya me dejó media bóveda en las mesas. Te la paso *por esta vez*, ¿oíste? La próxima, te cobro hasta el sombrero.' });
    return 'forgiven';
  }
  if (choice === 'flee') {
    const ok = Math.random() < 0.5 + stealthFor('velo') * 0.5;
    audio.sfx('invisibility_on');
    engine.pipeline.setDesat(0.7);
    await wait(900);
    engine.pipeline.setDesat(0);
    consequences(ok ? 1 : 2);
    if (ok) {
      ban(2);
      addNews('Un mago desapareció en el aire en medio del Gran Casino. Los Ojos de la Casa juran que lo volverán a ver.', 'casino');
      await dialogue.say({ speaker: who, portrait: CHEPE(), text: '¡¿Dónde se metió?! ¡Cierren las puertas! …Ya sabemos tu cara, mago. No volvás en un buen rato.' });
      return 'fled';
    }
    const take = Math.min(G.run.player.gold, fine * 2);
    res.spend('gold', take);
    ban(3);
    await dialogue.say({ speaker: who, portrait: CHEPE(), text: `¡Ja! Se te ve la sombra, shute. Nos quedamos con ${fmt(take)} de oro por la molestia. Y fuera.` });
    return 'banned';
  }
  if (choice === 'fight' && guard) {
    consequences(2);
    s.guardFight = 'pending';
    const setup: BattleSetup = {
      kind: 'escaramuza', biome: 'tropical', continent: 'islas', locationId: loc, timeOfDay: 0.92,
      title: clandestino ? 'Redada en el Clandestino' : 'Los Ojos de la Casa',
      player: { present: true, army: [] },
      enemy: { faction: 'banca', groups: guardGroups(clandestino) },
      allowRetreat: true, deploy: false,
      returnTo: { scene: 'casino', params: { settle: 'guardias', from } },
      onResult: (r) => { try { cs().guardFight = r.victory ? 'won' : 'lost'; } catch { /* run gone */ } },
    };
    void engine.goto('battle', setup, { fade: 0.5 });
    return 'fight';
  }
  consequences(1);
  ban(3);
  await dialogue.say({ speaker: who, portrait: CHEPE(), text: 'Sabia decisión. Tres lunas sin pisar la Banca. Y sonreí, que la cámara del Concilio te está viendo… es broma. Nosotros sí.' });
  return 'banned';
}

/** After returning from the guard fight. */
export async function settleGuardFight(): Promise<'won' | 'lost' | null> {
  const s = cs();
  const r = s.guardFight;
  if (!r || r === 'pending') { s.guardFight = null; return null; }
  s.guardFight = null;
  if (r === 'won') {
    s.suspicion = 30;
    addNews('Un mago mandó a volar a Los Ojos de la Casa por la puerta del Gran Casino. Don Tiburcio no está contento.', 'casino', true);
    return 'won';
  }
  const take = Math.min(G.run.player.gold, 1000);
  res.spend('gold', take);
  s.bannedUntil = luna() + 3; s.bans++;
  bus.emit('casino:banned', { lunas: 3 });
  return 'lost';
}
