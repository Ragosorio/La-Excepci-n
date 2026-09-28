/**
 * Debug / test battle setups for ?scene=battle (&test=arena|duel|ruina|asedio|final|emboscada, &units=N, &biome=…).
 * Unit ids are picked from the canonical UNITS when available (by race/role), else from the local fallback set.
 */
import type { ArmyUnit, RaceId, UnitRole } from '../data/types';
import type { BattleBiome, BattleSetup, CaptainSpec, EnemyGroup } from './api';
import { allUnitDefs, hasUnitDef } from './defs';
import { Rng } from '../core/rng';

const BIOMES: BattleBiome[] = ['llanura', 'bosque', 'montana', 'pantano', 'tropical', 'marmol', 'ruina', 'arena', 'concordia', 'vacio'];

function pick(rng: Rng, want: { role?: UnitRole[]; race?: RaceId[]; fallback: string; tier?: number[] }): string {
  const all = allUnitDefs().filter((u) => !u.id.startsWith('__custom_'));
  let c = all.filter((u) => (!want.role || want.role.includes(u.role)) && (!want.race || want.race.includes(u.race)) && (!want.tier || want.tier.includes(u.tier)));
  if (!c.length) c = all.filter((u) => (!want.role || want.role.includes(u.role)));
  if (!c.length || (hasUnitDef(want.fallback) && rng.chance(0.4))) return want.fallback;
  return rng.pick(c).id;
}

function army(list: Array<[string, number, number?]>): ArmyUnit[] {
  const out: ArmyUnit[] = [];
  let n = 0;
  for (const [unitId, count, stars] of list) for (let k = 0; k < count; k++) out.push({ uid: `dbg_${n++}`, unitId, stars: stars ?? (k % 5 === 0 ? 1 : 0), xp: 0, hpPct: 1 });
  return out;
}

export function debugSetup(params: Record<string, unknown>): BattleSetup {
  const seed = Number(params.seed ?? 7);
  const rng = new Rng(seed * 31 + 5);
  const test = String(params.test ?? '');
  const biomeParam = String(params.biome ?? '');
  const biome = (BIOMES.includes(biomeParam as BattleBiome) ? biomeParam : '') as BattleBiome | '';
  const unitsN = Number(params.units ?? 0);
  const deploy = params.deploy === undefined ? undefined : params.deploy !== '0' && params.deploy !== 'false';

  const soldier = pick(rng, { role: ['melee'], race: ['humano', 'caballero'], fallback: 'soldado' });
  const knight = pick(rng, { role: ['tanque'], race: ['caballero', 'humano', 'enano'], fallback: 'caballero_juramentado' });
  const archer = pick(rng, { role: ['rango'], race: ['elfo', 'humano'], fallback: 'arquero_elfo' });
  const mage = pick(rng, { role: ['mago'], fallback: 'mago_aprendiz' });
  const healer = pick(rng, { role: ['sanador'], fallback: 'clerigo_alba' });
  const ogre = pick(rng, { race: ['ogro'], fallback: 'ogro_tragapiedras' });
  const giant = pick(rng, { race: ['gigante'], fallback: 'gigante_colina' });
  const goblin = pick(rng, { race: ['duende'], fallback: 'duende_bombero' });
  const dwarf = pick(rng, { race: ['enano'], role: ['melee', 'tanque'], fallback: 'enano_martillo' });
  const witch = pick(rng, { race: ['bruja'], fallback: 'bruja_aquelarre' });
  const troll = pick(rng, { race: ['trol'], fallback: 'trol_cienaga' });
  const rogue = pick(rng, { role: ['asesino'], fallback: 'picaro_ceniza' });
  const peasant = hasUnitDef('campesino') ? 'campesino' : soldier;
  /** First canonical id that exists (content data), else the fallback. */
  const choose = (...ids: string[]): string => ids.find((id) => hasUnitDef(id)) ?? ids[ids.length - 1];

  const captain = (unitId: string, name: string, title: string, taunt: string, extra: Partial<CaptainSpec> = {}): CaptainSpec =>
    ({ unitId, name, title, taunt, ...extra });

  if (unitsN > 0) {
    // stress test: two big mixed armies, no deployment
    const half = Math.max(10, Math.floor(unitsN / 2));
    const mix = (n: number): EnemyGroup[] => [
      { unitId: soldier, count: Math.round(n * 0.35) }, { unitId: knight, count: Math.round(n * 0.15) }, { unitId: archer, count: Math.round(n * 0.2) },
      { unitId: dwarf, count: Math.round(n * 0.12) }, { unitId: goblin, count: Math.round(n * 0.1) }, { unitId: ogre, count: Math.max(1, Math.round(n * 0.05)) },
      { unitId: mage, count: Math.max(1, Math.round(n * 0.03)) },
    ];
    const pa = mix(half).flatMap((g) => army([[g.unitId, g.count]]));
    return {
      kind: 'escaramuza', biome: biome || 'llanura', title: `Prueba de estrés · ${unitsN} unidades`, timeOfDay: 0.62, deploy: deploy ?? false,
      player: { present: params.elias !== '0', army: pa },
      enemy: { faction: 'valdoria', groups: mix(half), captains: [captain(knight, 'Sir Brann', 'el Terco', '¿Doscientos? Que sean trescientos.')] },
      rewards: { gold: 200, essence: 20 },
    };
  }

  switch (test) {
    case 'arena':
      return {
        kind: 'arena', biome: 'arena', title: 'Arena del Remolino', timeOfDay: 0.76,
        player: { present: false, army: [] },
        enemy: { faction: 'islas', groups: [] },
        arena: {
          sideA: { name: 'Los Tragapiedras', groups: [{ unitId: ogre, count: 3 }, { unitId: goblin, count: 10 }, { unitId: troll, count: 4 }] },
          sideB: { name: 'La Guardia de Varn', groups: [{ unitId: knight, count: 6 }, { unitId: soldier, count: 10 }, { unitId: archer, count: 6 }] },
        },
      };
    case 'duel':
      return {
        kind: 'duelo', biome: biome || 'concordia', title: 'Duelo en Concordia', timeOfDay: 0.58, deploy: false,
        player: { present: true, army: [] },
        enemy: { faction: 'concilio', groups: [], boss: { unitId: knight, name: 'Aurel', title: 'Portador del Alba', special: 'aurel', hpMult: 12, dmgMult: 1.6, abilities: ['golpe_titanico', 'velo', 'el_alba'], taunt: 'Nadie tiene que salir herido. Todavía estamos a tiempo.' } },
        allowRetreat: false,
      };
    case 'ruina':
      return {
        kind: 'ruina', biome: biome || 'ruina', title: 'Raíz Profunda', timeOfDay: 0.3, deploy,
        player: { present: true, army: army([[soldier, 6], [archer, 4], [healer, 1]]) },
        enemy: { faction: 'sylvaria', groups: [{ unitId: troll, count: 6 }, { unitId: witch, count: 4 }, { unitId: rogue, count: 6 }, { unitId: goblin, count: 8 }],
          boss: { unitId: giant, name: 'El Guardián de la Raíz', title: 'Lo que respira abajo', hpMult: 2.2, taunt: '…' } },
        rewards: { gold: 300, essence: 40, relicChance: 1 },
      };
    case 'asedio':
      return {
        kind: 'asedio', biome: biome || 'llanura', title: 'Asedio de Fortaleza Juramento', timeOfDay: 0.45, deploy,
        player: { present: true, army: army([[soldier, 10], [ogre, 2], [goblin, 8], [archer, 6], [dwarf, 6]]) },
        enemy: { faction: 'valdoria', walls: true, groups: [{ unitId: knight, count: 8 }, { unitId: archer, count: 10 }, { unitId: soldier, count: 12 }],
          captains: [captain(knight, 'Dama Leonor', 'Escudo de Varn', '¡Estos muros resistieron a gigantes! ¿Y tú qué eres?')] },
        rewards: { gold: 500, essence: 50 },
      };
    case 'final':
      return {
        kind: 'final', biome: 'concordia', title: 'La Gran Alianza', timeOfDay: 0.7, deploy,
        player: { present: true, army: army([[soldier, 20], [ogre, 4], [giant, 1], [troll, 8], [goblin, 12], [witch, 6], [archer, 12]]) },
        enemy: { faction: 'concilio', groups: [{ unitId: knight, count: 26 }, { unitId: archer, count: 20 }, { unitId: dwarf, count: 16 }, { unitId: mage, count: 8 }, { unitId: healer, count: 6 }, { unitId: giant, count: 2 }],
          captains: [captain(knight, 'Sir Galvan Brisaclara', 'Mariscal de los Juramentados', 'Por el juramento. Por los cinco.'), captain(archer, 'Thalion Hojaplata', 'Delegado de Sylvaria', 'Mi flecha no falla dos veces.')],
          boss: { unitId: knight, name: 'Aurel', title: 'Portador del Alba', special: 'aurel', hpMult: 14, dmgMult: 1.8, abilities: ['golpe_titanico', 'velo', 'el_alba', 'dominar_mente'], taunt: '¿Sabes cuántas veces te he visto volver? Esta es la última.' } },
        allowRetreat: false,
        rewards: { gold: 2000, essence: 200, relicChance: 1, rarityBoost: 2 },
      };
    case 'emboscada':
      return {
        kind: 'emboscada', biome: biome || 'bosque', title: 'Emboscada en el bosque', timeOfDay: 0.82, deploy: false,
        player: { present: true, army: army([[soldier, 6], [archer, 4]]) },
        enemy: { faction: 'ceniza', groups: [{ unitId: rogue, count: 10 }, { unitId: goblin, count: 6 }, { unitId: troll, count: 3 }],
          captains: [captain(rogue, 'Tobías Manosueltas', 'del Gremio de la Ceniza', 'Nada personal, patojo. Bueno… un poco.')] },
      };
    default:
      break;
  }
  // default skirmish: Elias + ~24 mixed allies vs ~32 enemies incl. a captain and a giant
  const pLancer = choose('lancero', 'soldado'), pDwarf = choose('guerrero_enano', 'minero_enano', 'enano_martillo'), pArcher = choose('arquero_elfo'),
    pOgre = choose('ogro_brutal', 'ogro_tragapiedras'), pGob = choose('duende_bombardero', 'duende_bombero'), pWitch = choose('bruja_maleficio', 'bruja_aquelarre'), pHeal = choose('clerigo_alba');
  const eMil = choose('miliciano', 'campesino'), eLancer = choose('lancero', 'soldado'), eKnight = choose('caballero_juramentado'), eXbow = choose('ballestero', 'arquero_elfo'),
    eMage = choose('aprendiz', 'mago_aprendiz'), eTroll = choose('trol_berserker', 'trol_cienaga'), eGiant = choose('gigante_anciano', 'rompemuros', 'gigante_colina');
  return {
    kind: 'escaramuza', biome: biome || 'llanura', title: 'Escaramuza en el Vado del Trigo', timeOfDay: 0.64, weather: params.weather as BattleSetup['weather'],
    deploy,
    player: { present: true, army: army([[pLancer, 7], [pDwarf, 4], [pArcher, 5], [pOgre, 1], [pGob, 4], [pWitch, 1], [pHeal, 1]]) },
    enemy: {
      faction: 'valdoria',
      groups: [{ unitId: eMil, count: 9 }, { unitId: eLancer, count: 8 }, { unitId: eKnight, count: 3 }, { unitId: eXbow, count: 5 }, { unitId: eMage, count: 2 }, { unitId: eTroll, count: 2 }, { unitId: eGiant, count: 1 }],
      captains: [captain(eKnight, 'Sir Brann', 'el Terco', '¡Tú! El mago que no se muere. Hoy aprendes a quedarte en el suelo.')],
    },
    rewards: { gold: 180, essence: 25, relicChance: 0.35 },
  };
}
