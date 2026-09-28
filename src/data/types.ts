/**
 * Shared data schemas for La Excepción.
 * Canonical design lives in docs/GDD.md. Content files in src/data/* implement these types.
 */

// ───────────────────────────────── Identity ─────────────────────────────────

export type RaceId =
  | 'elfo' | 'caballero' | 'gigante' | 'ogro' | 'duende' | 'mago' | 'bruja'
  | 'enano' | 'humano' | 'trol' | 'clerigo' | 'picaro' | 'sirena' | 'draconido'
  | 'excepcion';

export type JobId =
  | 'guerrero' | 'soldado' | 'arquero' | 'curandero' | 'hechicero' | 'mercader' | 'cortesana'
  | 'herrero' | 'erudito' | 'cazador' | 'sacerdote' | 'bardo' | 'ladron' | 'minero' | 'chaman'
  | 'noble' | 'campesino' | 'banquero' | 'crupier' | 'capitan' | 'espia' | 'asesino' | 'alquimista'
  | 'pirata' | 'guardian' | 'rey' | 'reina' | 'tabernero' | 'monje' | 'delegado' | 'estudiante';

export type ContinentId = 'valdoria' | 'sylvaria' | 'kharaz' | 'morvenna' | 'islas' | 'concordia';

export type GuildId =
  | 'juramentados' | 'orden_alba' | 'banca' | 'aquelarre' | 'academia' | 'sedas' | 'ceniza' | 'yunque';

export type FactionId = ContinentId | GuildId | 'concilio' | 'excepcion';

export type School =
  | 'arcano' | 'fuego' | 'hielo' | 'rayo' | 'luz' | 'sombra' | 'mente' | 'naturaleza'
  | 'veneno' | 'sangre' | 'fuerza' | 'tierra' | 'tiempo' | 'suerte' | 'agua' | 'fisico';

export type Rarity = 'comun' | 'pococomun' | 'rara' | 'epica' | 'legendaria' | 'mitica';

export type CorruptionPath = 'conquista' | 'intriga' | 'codicia' | 'terror';

export type StatId = 'fuerza' | 'magia' | 'velocidad' | 'presencia' | 'suerte' | 'vida' | 'mana' | 'armadura';

export type GoodId = 'grano' | 'madera' | 'hierro' | 'especias' | 'seda' | 'pociones' | 'gemas' | 'cristal';

// ───────────────────────────────── Races & jobs ─────────────────────────────

export interface RaceDef {
  id: RaceId;
  name: string;            // 'Élfico'
  plural: string;          // 'Elfos'
  desc: string;
  /** Body proportions for 3D rigs (1 = human). */
  body: { height: number; width: number; head: number; limbs: number; belly?: number };
  skin: string[];          // hex skin tones to pick from
  hair: string[];          // hex hair colors
  eyes: string[];
  features: Array<'orejas_largas' | 'orejas_enormes' | 'colmillos' | 'barba' | 'cuernos' | 'escamas' | 'aletas' | 'piel_piedra' | 'halo' | 'cola' | 'sombrero_pico'>;
  racialPower: { id: string; name: string; desc: string };
  abilities: string[];     // ability ids typical of this race
  homeContinents: ContinentId[];
  namePool: { m: string[]; f: string[]; surnames: string[] };
}

export interface JobDef {
  id: JobId;
  name: string;            // 'Cortesana'
  desc: string;
  outfit: { primary: string; secondary: string; headgear?: 'casco' | 'sombrero_alto' | 'sombrero_pico' | 'capucha' | 'corona' | 'mitra' | 'velo' | 'tricornio' | 'copa' | 'visera' | 'turbante' | 'ninguno'; weapon?: WeaponKind; shield?: boolean; cape?: boolean; robe?: boolean };
  social?: 'secretos' | 'comercio' | 'rumores' | 'curacion' | 'reclutar' | 'ensenar' | 'forjar' | 'apuestas' | 'contratos';
}

export type WeaponKind =
  | 'espada' | 'hacha' | 'lanza' | 'arco' | 'ballesta' | 'baston' | 'daga' | 'martillo' | 'maza'
  | 'abanico' | 'escoba' | 'trabuco' | 'garrote' | 'libro' | 'ninguna' | 'puños' | 'pistola' | 'hoz';

// ───────────────────────────────── Abilities ────────────────────────────────

export type AbilityKind =
  | 'projectile'  // flies toward target/cursor
  | 'aoe'         // area at a point
  | 'cone'        // cone in front
  | 'beam'        // line/chain
  | 'dash'        // moves caster, damages along path
  | 'blink'       // instant teleport
  | 'buff'        // self/ally positive status
  | 'debuff'      // enemy negative status
  | 'summon'      // spawns units/clones
  | 'aura'        // persistent area around caster
  | 'passive'     // always on
  | 'transform'   // changes caster form
  | 'channel'     // sustained
  | 'melee'       // close attack
  | 'trap'        // placed, triggers
  | 'special';    // custom code path (handled by id)

export type StatusId =
  | 'quemadura' | 'congelado' | 'lento' | 'aturdido' | 'veneno' | 'encanto' | 'mente' | 'miedo'
  | 'sapo' | 'ceguera' | 'silencio' | 'raiz' | 'invisible' | 'escudo' | 'regeneracion' | 'prisa'
  | 'robo_vida' | 'maldicion' | 'furia' | 'inmortal' | 'sangrado' | 'marcado' | 'traicion' | 'provocar';

export interface EffectSpec {
  status?: StatusId;
  duration?: number;       // seconds
  magnitude?: number;      // meaning depends on status (e.g. slow 0.4 = -40%)
  chance?: number;         // 0..1 (default 1)
  knockback?: number;      // impulse strength (TABS launch). 10 = strong punch, 25 = giant stomp
  pull?: number;           // negative knockback toward caster
  heal?: number;           // flat heal
  damage?: number;         // extra flat damage
}

export interface AbilityDef {
  id: string;
  name: string;
  desc: string;            // mechanical description (Spanish)
  flavor?: string;         // one-liner in-world
  school: School;
  rarity: Rarity;
  /** Who uses it in the world (to know where to go to copy it). */
  source: { races?: RaceId[]; jobs?: JobId[]; units?: string[]; npcs?: string[]; relic?: string; book?: 'aprendizaje' | 'realidad' };
  /** Hits needed to copy (La Excepción). 0 = cannot be copied (e.g. relic-granted). */
  comprehension: number;
  kind: AbilityKind;
  target: 'self' | 'enemy' | 'ally' | 'ground' | 'direction';
  mana: number;
  cooldown: number;        // seconds
  castTime?: number;       // seconds (0 = instant)
  power: number;           // base damage (or heal) at rank I
  range?: number;          // meters
  radius?: number;         // meters
  duration?: number;       // seconds
  speed?: number;          // projectile m/s
  count?: number;          // projectiles / clones / chains
  effects?: EffectSpec[];
  /** Resist tags this ability applies; copying it grants resistance to these. */
  tags: string[];
  color?: string;          // main VFX color (hex)
  vfx?: string;            // vfx preset key
  sfx?: string;            // audio SfxName
  /** Out-of-battle use. */
  world?: Array<'politica' | 'economia' | 'sigilo' | 'casino' | 'exploracion' | 'terror'>;
  /** If produced by fusion. */
  fusionOf?: [string, string];
  /** Ultimate (R slot). */
  ultimate?: boolean;
}

export interface CodexEntry {
  id: string;              // ability id
  progress: number;        // comprehension points collected
  acquired: boolean;
  rank: number;            // 1..5
  timesUsed: number;
  acquiredAt?: number;     // luna
}

// ───────────────────────────────── Relics ───────────────────────────────────

export type RelicShape =
  | 'daga' | 'espada' | 'libro' | 'corona' | 'anillo' | 'amuleto' | 'orbe' | 'baston' | 'caliz'
  | 'mascara' | 'moneda' | 'dado' | 'campana' | 'farol' | 'pluma' | 'reloj' | 'brujula' | 'estandarte'
  | 'martillo' | 'arco' | 'guantelete' | 'espejo' | 'semilla' | 'ojo' | 'tambor' | 'llave' | 'collar'
  | 'capa' | 'cetro' | 'cuerno' | 'craneo' | 'carta' | 'botella' | 'escama' | 'corazon' | 'gema';

export interface RelicDef {
  id: string;
  name: string;
  shape: RelicShape;
  rarity: Rarity;
  lore: string;            // 1–2 lines, evocative
  effectText: string;      // what it does (Spanish, short)
  /** Races that get full power when an NPC wields it. Elias always gets 100% (Afinidad de Reliquias). */
  affinity: RaceId[] | 'any';
  /** Additive % bonuses (0.1 = +10%). */
  stats?: Partial<Record<StatId, number>>;
  schoolBoost?: Partial<Record<School, number>>;
  /** Ability granted while equipped (usable in Q/E relic slots). */
  grants?: string;
  /** Passive hooks read by systems (economy, casino, world...). Free-form keys, documented in relics.ts. */
  passives?: Record<string, number>;
  major?: boolean;         // one of the 3 great relics (4 items incl. both daggers + Eclipse)
  unique?: boolean;
  secret?: boolean;        // only appears in later cycles
  /** Fixed location id; undefined = random placement per cycle. */
  location?: string;
  minCycle?: number;
}

export interface RelicInstance {
  uid: string;             // unique instance id
  id: string;              // RelicDef id
  level: number;           // forge upgrades 0..3
  foundAt?: string;        // location id
  foundLuna?: number;
}

// ───────────────────────────────── Units / army ─────────────────────────────

export type UnitRole = 'melee' | 'rango' | 'mago' | 'sanador' | 'tanque' | 'asesino' | 'asedio' | 'monstruo' | 'apoyo';

export interface UnitDef {
  id: string;
  name: string;
  race: RaceId;
  job: JobId;
  role: UnitRole;
  tier: 1 | 2 | 3;
  hp: number;
  damage: number;
  attackRange: number;     // meters (melee ~1.2)
  attackCooldown: number;  // seconds
  speed: number;           // m/s
  mass: number;            // knockback resistance (human = 1)
  armor: number;           // 0..0.8 damage reduction
  scale: number;           // visual/body scale (human = 1, giant = 2.6, goblin = 0.6)
  cost: number;            // gold to recruit
  upkeep: number;          // gold per luna
  weapon: WeaponKind;
  shield?: boolean;
  abilities: string[];     // ability ids the unit can cast in battle (and Elias can copy)
  projectile?: 'flecha' | 'bala' | 'roca' | 'orbe' | 'lanza' | 'bomba' | 'hacha' | 'martillo';
  desc: string;
  recruitAt?: ContinentId[];
}

export interface ArmyUnit {
  uid: string;
  unitId: string;          // UnitDef id
  stars: number;           // 0..3 veterancy
  xp: number;
  name?: string;           // named units (lieutenants, devotos with names)
  devoto?: boolean;        // mind-converted
  npcId?: string;          // if this unit is a named NPC (lieutenant)
  hpPct?: number;          // 0..1 carried wounds between battles
}

// ───────────────────────────────── World ────────────────────────────────────

export type LocationKind = 'capital' | 'ciudad' | 'aldea' | 'fortaleza' | 'ruina' | 'templo' | 'especial' | 'casino' | 'arena' | 'puerto' | 'santuario' | 'concilio';

export interface ContinentDef {
  id: ContinentId;
  name: string;
  epithet: string;         // 'La Corona'
  desc: string;
  races: RaceId[];         // main races (conquering grants their racial powers)
  ruler?: string;          // npc id
  delegate?: string;       // npc id
  guilds: GuildId[];
  goods: { produces: GoodId[]; consumes: GoodId[] };
  pathMult: Record<CorruptionPath, number>;
  palette: { ground: string; ground2: string; accent: string; water?: string; fog: string };
  biome: 'llanura' | 'bosque' | 'montana' | 'pantano' | 'tropical' | 'marmol';
  /** Map placement (overworld units, roughly -100..100). */
  center: { x: number; z: number };
  radius: number;
}

export interface LocationDef {
  id: string;
  name: string;
  continent: ContinentId;
  kind: LocationKind;
  desc: string;
  pos: { x: number; z: number };   // overworld coordinates
  races: Partial<Record<RaceId, number>>; // population mix weights
  garrison: number;        // base defender strength
  prosperity: number;      // 0..100 base
  produces?: GoodId[];
  consumes?: GoodId[];
  services: Array<'mercado' | 'reclutar' | 'taberna' | 'sedas' | 'banca' | 'casino' | 'arena' | 'forja' | 'academia' | 'templo' | 'ruina' | 'concilio' | 'santuario' | 'puerto'>;
  npcs?: string[];         // named npc ids present
  relic?: string;          // fixed relic here
  special?: string;        // custom behavior key
}

export interface GuildDef {
  id: GuildId;
  name: string;
  desc: string;
  races: RaceId[];
  base: string;            // location id
  services: string[];
  color: string;
}

// ───────────────────────────────── NPCs ─────────────────────────────────────

export type TraitId =
  | 'codicioso' | 'cobarde' | 'orgulloso' | 'leal' | 'vengativo' | 'piadoso' | 'supersticioso'
  | 'ambicioso' | 'borracho' | 'curioso' | 'valiente' | 'paranoico' | 'honorable' | 'cruel' | 'sabio' | 'jugador';

export interface NpcDef {
  id: string;
  name: string;
  title?: string;          // 'Reina de Valdoria'
  race: RaceId;
  job: JobId;
  gender: 'f' | 'm' | 'x';
  age: 'child' | 'young' | 'adult' | 'old';
  faction: FactionId;
  home: string;            // location id
  traits: TraitId[];
  bio: string;
  portrait?: { special?: string; palette?: Record<string, string>; scar?: boolean; eyepatch?: boolean; crown?: boolean; hood?: boolean; glowEyes?: boolean };
  /** Voice/idiolect hint for dialogue writers: 'chapin', 'noble', 'arcaico', 'rudo', 'poetico'... */
  voice?: string;
  greeting?: string[];     // lines when first met
  role?: 'gobernante' | 'delegado' | 'mercader' | 'tabernero' | 'heroe' | 'rival' | 'informante' | 'jefe' | 'familia' | 'custodia';
  combat?: { unitId: string; abilities?: string[]; hpMult?: number };
}

export interface NpcMemory {
  kind: string;            // 'amenazado','robado','perdonado','herido','familiar_muerto','sobornado','dominado','ayudado','derrotado','humillado','enganado','pagado'...
  text: string;            // short description used in dialogue ("Me robaste en el Vado")
  luna: number;
  where?: string;          // location id
  intensity: number;       // 1..10
}

export interface NpcState {
  id: string;
  alive: boolean;
  location: string;
  feelings: { miedo: number; odio: number; deuda: number; respeto: number };
  memories: NpcMemory[];
  loyal?: boolean;         // mind-bound / converted
  met: boolean;
  /** For generated nemesis captains. */
  generated?: { name: string; race: RaceId; job: JobId; level: number; titleText?: string; traits: TraitId[]; scars: number; seed: string };
}

// ───────────────────────────────── Meta ─────────────────────────────────────

export interface LorePage {
  id: string;
  title: string;           // a single evocative word or phrase — never "Capítulo"
  text: string;            // written like the book (EB Garamond), 60–200 words
  minCycle?: number;
  where?: 'random' | string; // location id or random
}

export interface AchievementDef { id: string; name: string; desc: string; secret?: boolean; ink: number }

export interface MarginDef {
  id: string;
  name: string;
  desc: string;            // with {v} placeholder for value
  maxRank: number;
  cost: number[];          // ink per rank
  value: number[];         // effect value per rank
}

// ───────────────────────────────── Narrative helpers ────────────────────────

/** A narrator line with both persons. The narrator system chooses based on progression. */
export interface NarratorLine { third: string; first?: string; direct?: string }
