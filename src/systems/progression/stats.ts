/**
 * Derived player stats: base (G.run.player.stats, margins already folded in by the story module at run init)
 * + relic bonuses (× forge level) + racial powers from corrupted continents + Libro de la Realidad penalties.
 * Contract (kept): effective, maxHp, maxMana, manaRegen, damageMult, armor, racialPowers, hasRacialPower.
 *
 * `player.hpMax` / `player.manaMax` are DERIVED: syncVitals() rewrites them from stats.vida / stats.mana.
 * Other modules should change `player.stats.vida|mana` (base) rather than hpMax directly.
 */
import type { ContinentId, EffectSpec, RaceId, School, StatId, StatusId } from '../../data/types';
import { RACES, RACIAL_POWERS } from '../../data/races';
import { CONTINENTS } from '../../data/world';
import { G } from '../../core/state';
import { bus } from '../../core/events';
import { track } from '../../core/tracker';
import { audio } from '../../audio';
import { toast } from '../../ui/toasts';
import { queueBanner } from './pgui';
import { PS, hasRun } from './pstate';
import { relicPassive, relicSchoolBoost, relicStat } from './relics';
import { knows, rank } from './codex';
import { racialIcon } from './art';

// ───────────────────────────── racial powers ─────────────────────────────

export function racialPowers(): string[] { return hasRun() ? G.run.player.racePowers ?? [] : []; }
export function hasRacialPower(id: string): boolean { return racialPowers().includes(id); }

// ───────────────────────────── core stats ─────────────────────────────

const RACIAL_STAT: Partial<Record<StatId, Array<[string, number]>>> = {
  vida: [['piel_montana', 0.3]],
};

/** Effective stat value. `armadura` is in points (100 = 100% reduction before the cap). */
export function effective(stat: StatId): number {
  if (!hasRun()) return 0;
  const base = G.run.player.stats[stat] ?? 0;
  if (stat === 'armadura') return base + 100 * (relicStat('armadura') + (hasRacialPower('barba_hierro') ? 0.25 : 0));
  let mult = 1 + relicStat(stat);
  for (const [power, v] of RACIAL_STAT[stat] ?? []) if (hasRacialPower(power)) mult += v;
  return base * mult;
}

export function maxHp(): number {
  if (!hasRun()) return 100;
  return Math.max(1, Math.round(effective('vida') * (PS().hpPenalty ?? 1)));
}
export function maxMana(): number {
  if (!hasRun()) return 60;
  return Math.max(10, Math.round(effective('mana')));
}

/** Mana per second in battle: 6 base, ×3 with Fuerza Titánica (GDD), + relic mana_regen. */
export function manaRegen(): number {
  if (!hasRun()) return 6;
  return 6 * (knows('fuerza_titanica') ? 3 : 1) * (1 + relicPassive('mana_regen'));
}

/** Damage multiplier for a school: relic school boosts + Fuerza (físico/fuerza) or Magia (the rest). */
export function damageMult(school: School): number {
  if (!hasRun()) return 1;
  const physical = school === 'fisico' || school === 'fuerza';
  const statBonus = physical ? (effective('fuerza') - 5) * 0.03 : (effective('magia') - 8) * 0.03;
  return Math.max(0.2, 1 + relicSchoolBoost(school) + statBonus);
}

/** Damage reduction 0..0.8. */
export function armor(): number { return Math.max(0, Math.min(0.8, effective('armadura') / 100)); }

// ───────────────────────────── battle helpers ─────────────────────────────

/** ×mana cost (Erudición −20%, relic mana_cost). */
export function manaCostMult(): number { return Math.max(0.3, (hasRacialPower('erudicion') ? 0.8 : 1) * (1 + relicPassive('mana_cost'))); }
/** ×cooldowns (relic cooldown_mult, negative = faster). */
export function cooldownMult(): number { return Math.max(0.5, 1 + relicPassive('cooldown_mult')); }
export function critChance(): number { return Math.min(0.75, 0.05 + effective('suerte') * 0.005 + relicPassive('crit_chance')); }
export function critMult(): number { return 1.5 + relicPassive('crit_mult'); }
/** Extra crit multiplier when striking from behind or from the Velo (Sombra racial). */
export function backstabCritBonus(): number { return hasRacialPower('sombra') ? 0.5 : 0; }
export function lifesteal(): number { return Math.min(0.5, relicPassive('lifesteal')); }
/** HP per second in battle (relics + Regeneración Trol 1.5%/s). */
export function hpRegen(): number { return relicPassive('hp_regen') + (hasRacialPower('regeneracion_trol') ? 0.015 * maxHp() : 0); }
/** ×healing done/received (Gracia +30%). */
export function healMult(): number { return 1 + relicPassive('heal_mult') + (hasRacialPower('gracia') ? 0.3 : 0); }
export function knockbackMult(): number { return 1 + relicPassive('knockback_mult'); }
/** ×projectile range (Ojo Élfico +25%). */
export function rangeMult(): number { return 1 + relicPassive('range_mult') + (hasRacialPower('ojo_elfico') ? 0.25 : 0); }
/** ×ranged damage (Ojo Élfico +25%). */
export function rangedDamageMult(): number { return hasRacialPower('ojo_elfico') ? 1.25 : 1; }
export function moveSpeedMult(): number { return 1 + relicPassive('move_speed') + (effective('velocidad') - 6) * 0.02; }
/** ×duration of charm / mind control / illusions cast by Elias (Canto +50%). */
export function controlDurationMult(): number { return hasRacialPower('canto') ? 1.5 : 1; }
/** Fraction of max HP healed when Elias kills or devours (Estómago de Hierro). */
export function killHealFraction(): number { return hasRacialPower('estomago_hierro') ? 0.08 : 0; }
/** Once per battle, survive a lethal hit at 1 HP (Juramento). */
export function hasOathSave(): boolean { return hasRacialPower('juramento'); }
export function armorPierce(): boolean { return relicPassive('armor_pierce') > 0; }
export function reflectFraction(): number { return Math.min(0.8, relicPassive('reflect')); }
export function enemyTimeSlow(): number { return Math.min(0.6, relicPassive('time_slow')); }
export function seesInvisible(): boolean { return relicPassive('reveal_invisible') > 0; }

/** Retorno charges per battle: base (+margins) + relics + ranks III and V of Retorno. */
export function retornoCharges(): number {
  if (!hasRun()) return 1;
  const r = knows('retorno') ? rank('retorno') : 0;
  return Math.max(0, G.run.player.retornoMax + relicPassive('retorno_extra') + (r >= 3 ? 1 : 0) + (r >= 5 ? 1 : 0));
}

/** Statuses Elias cannot suffer (Sangre de Dragón → quemadura). */
export function immuneStatuses(): StatusId[] { return hasRacialPower('sangre_dragon') ? ['quemadura'] : []; }

/** Extra effects on every hit Elias lands (Maleficio curse, Eclipse's Traición). */
export function playerOnHitEffects(): EffectSpec[] {
  const out: EffectSpec[] = [];
  if (hasRacialPower('maleficio')) out.push({ status: 'maldicion', duration: 4, magnitude: 0.15 });
  const t = relicPassive('traicion_chance');
  if (t > 0) out.push({ status: 'traicion', duration: 10, chance: Math.min(0.5, t) });
  return out;
}

/** Active ability slots (4, +1 with Adaptable). */
export function activeSlotCount(): number { return 4 + (hasRacialPower('adaptable') ? 1 : 0); }

// ───────────────────────────── economy helpers (res modifiers use these) ─────────────────────────────

export function goldDoubled(): boolean { return hasRun() && G.run.luna < (PS().goldDoubleUntil ?? -1); }
/** ×gold gains from relics, Suerte de Duende and "El oro vale el doble" (margins apply their own modifier). */
export function goldMult(): number {
  return (1 + relicPassive('gold_mult') + (hasRacialPower('suerte_duende') ? 0.2 : 0)) * (goldDoubled() ? 2 : 1);
}
export function essenceMult(): number { return 1 + relicPassive('essence_mult'); }
export function influenceMult(): number { return 1 + relicPassive('influence_gain'); }
export function secretMult(): number { return 1 + relicPassive('secret_gain'); }
export function alertMult(): number { return Math.max(0.2, 1 + relicPassive('alert_mult')); }
export function fearMult(): number { return 1 + relicPassive('fear_mult'); }
export function tradeBonus(): number { return relicPassive('trade_mult'); }
/** Relic-only casino luck (the casino adds Suerte de Duende itself). */
export function casinoLuck(): number { return relicPassive('casino_luck'); }

// ───────────────────────────── sync ─────────────────────────────

/** Rewrites player.hpMax / manaMax from the derived values (keeps the current ratio sensible). */
export function syncVitals(): void {
  if (!hasRun()) return;
  const p = G.run.player;
  const hpMax = maxHp(), manaMax = maxMana();
  const dh = hpMax - p.hpMax, dm = manaMax - p.manaMax;
  if (dh === 0 && dm === 0) return;
  p.hpMax = hpMax;
  p.manaMax = manaMax;
  p.hp = Math.max(1, Math.min(hpMax, p.hp + Math.max(0, dh)));
  p.mana = Math.max(0, Math.min(manaMax, p.mana + Math.max(0, dm)));
  bus.emit('progression:stats', { hpMax, manaMax });
}

/** Grants one racial power (idempotent). Returns true if newly gained. */
export function grantRacialPower(powerId: string, opts: { silent?: boolean } = {}): boolean {
  if (!hasRun() || !RACIAL_POWERS[powerId]) return false;
  const p = G.run.player;
  p.racePowers ??= [];
  if (p.racePowers.includes(powerId)) return false;
  p.racePowers.push(powerId);
  track('racial_powers');
  const info = RACIAL_POWERS[powerId];
  bus.emit('progression:racial', { power: powerId, race: info.race });
  if (!opts.silent) toast(`<b>${info.name}</b> — ${info.desc}`, { kind: 'legendaria', icon: racialIcon(powerId, 24), duration: 6 });
  syncVitals();
  return true;
}

/** "Cada raza que conquista le da su poder": grants the powers of a continent's main lineages. */
export function grantContinentPowers(c: ContinentId): string[] {
  const cont = CONTINENTS[c];
  if (!cont || !hasRun()) return [];
  const gained: string[] = [];
  cont.races.forEach((race: RaceId, i) => {
    const pw = RACES[race]?.racialPower.id;
    if (!pw || hasRacialPower(pw)) return;
    setTimeout(() => { if (grantRacialPower(pw)) audio.sfx('level_up', { pitch: 1 + i * 0.08 }); }, 900 + i * 700);
    gained.push(pw);
  });
  if (gained.length) {
    audio.stinger('level_up');
    const names = gained.map((g) => RACIAL_POWERS[g].name).join(' · ');
    queueBanner(`Herencia de ${cont.name}`, names, 'excepcion', 3.2);
  }
  return gained;
}

/** Summary rows for UIs. */
export function statSummary(): Array<{ label: string; value: string }> {
  const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
  return [
    { label: 'Vida máxima', value: String(maxHp()) },
    { label: 'Maná máximo', value: String(maxMana()) },
    { label: 'Maná por segundo', value: manaRegen().toFixed(1) },
    { label: 'Armadura', value: `${Math.round(armor() * 100)}%` },
    { label: 'Crítico', value: `${Math.round(critChance() * 100)}% ×${critMult().toFixed(2)}` },
    { label: 'Cargas de Retorno', value: String(retornoCharges()) },
    { label: 'Oro', value: pct(goldMult() - 1) },
    { label: 'Esencia', value: pct(essenceMult() - 1) },
    { label: 'Alerta', value: pct(alertMult() - 1) },
  ];
}
