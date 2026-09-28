/**
 * PUBLIC CONTRACT of the battle module (owned by the battle agent).
 * Other modules (world, story, casino) code against these types.
 * Rule: you may ADD optional fields/methods; never rename or remove existing ones.
 *
 * Start a battle:   engine.goto('battle', setup satisfies BattleSetup)
 * The battle scene returns to setup.returnTo (default: overworld) and calls setup.onResult(result).
 *
 * Order at the end of a battle: script.onEnd(ctx, result) → write-back → bus 'battle:end' → setup.onResult(result)
 * → results screen → engine.goto(returnTo). Write-back (real battles only — not debug, not arena): the battle itself
 * merges result.survivors (xp / stars / wounds) into G.run.player.army by uid, removes result.unitsLost, appends
 * converted Devotos, adds loot gold / essence / relics and saves. Army units not passed in setup.player.army are left
 * untouched. Listeners must NOT add result.loot again (a uid-merge of the army is idempotent and harmless).
 *
 * Teams: 0 = player side (arena: side A), 1 = enemy, 2 = arena side B / third party.
 * DOM: the battle only removes elements it created itself; anything a script appends (e.g. to layer('hud'))
 * must be removed by that script (onEnd).
 */
import type * as THREE from 'three';
import type { ArmyUnit, ContinentId, FactionId } from '../data/types';
import type { CharacterRig, Pose } from '../characters/rig';
import type { FaceExpr } from '../ui/art/faceAtlas';
import type { Fx } from '../render/fx';
import type { Pipeline } from '../render/pipeline';

export type BattleKind = 'escaramuza' | 'asedio' | 'ruina' | 'duelo' | 'arena' | 'tutorial' | 'final' | 'emboscada';
export type BattleBiome = 'llanura' | 'bosque' | 'montana' | 'pantano' | 'tropical' | 'marmol' | 'ruina' | 'arena' | 'concordia' | 'vacio';

export interface EnemyGroup { unitId: string; count: number; stars?: number }

export interface CaptainSpec {
  npcId?: string;           // existing NpcState id (nemesis) — memory system updates it after battle
  unitId: string;
  name: string;
  title?: string;
  abilities?: string[];
  hpMult?: number;
  dmgMult?: number;
  taunt?: string;           // pre-battle cut-in line
  special?: string;         // rig special (e.g. 'aurel')
}

export interface BattleSetup {
  kind: BattleKind;
  biome: BattleBiome;
  locationId?: string;
  continent?: ContinentId;
  timeOfDay?: number;       // 0..1 (see Sky)
  weather?: 'clear' | 'rain' | 'fog' | 'snow' | 'ash' | 'storm';
  title?: string;           // shown on intro ("Asedio de Lúmen")
  /** Player side. present=false → spectator (arena). */
  player: { present: boolean; army: ArmyUnit[]; allies?: EnemyGroup[] };
  enemy: { faction: FactionId; groups: EnemyGroup[]; captains?: CaptainSpec[]; boss?: CaptainSpec; walls?: boolean };
  /** Arena spectator mode: two AI sides; bet UI is provided by the casino module via overlay callbacks.
   *  sideA spawns as team 0, sideB as team 2. The bout ends when one side has no fighters left; a double KO or the
   *  150 s time limit goes to the judges (more units standing, then more total HP, then a coin flip).
   *  result.winnerSide is always set ('A' | 'B') and result.victory === (winnerSide === 'A'). No write-back. */
  arena?: { sideA: { name: string; groups: EnemyGroup[] }; sideB: { name: string; groups: EnemyGroup[] }; onTick?: (ctx: BattleContext) => void };
  script?: BattleScript;
  rewards?: { gold?: number; essence?: number; relicChance?: number; relicId?: string; rarityBoost?: number };
  deploy?: boolean;          // default: true if the player has an army
  allowRetreat?: boolean;    // default true (except tutorial/final)
  returnTo?: { scene: string; params?: unknown };
  onResult?: (r: BattleResult) => void;
  /** Where Elias spawns (world x/z; the field is roughly -62..62, the enemy side is +z). Default: his deployment zone;
   *  'duelo' / 'tutorial' put him 13 m in front of the boss (Elias at z = -6.5, boss at z = +6.5). */
  playerStart?: { x: number; z: number };
}

export interface BattleResult {
  victory: boolean;
  fled: boolean;
  playerDied: boolean;       // ran out of Retorno charges
  revivals: number;
  survivors: ArmyUnit[];     // player's army after battle (with xp/stars updated, wounded hpPct)
  unitsLost: ArmyUnit[];
  enemiesKilled: number;
  captainsKilled: string[];  // CaptainSpec.npcId or name
  captainsFled: string[];
  captainKilledPlayer?: string;
  copied: string[];          // ability ids acquired during the battle
  loot: { gold: number; essence: number; relics: string[] };
  prisoners: number;         // enemies that can be converted to Devotos
  duration: number;          // seconds
  /** Arena only: 'A' = setup.arena.sideA (team 0) won, 'B' = sideB (team 2) won. */
  winnerSide?: 'A' | 'B';    // arena
}

/** Script override of a unit's per-frame visual sync (ctx.setRigOverride). Fields left undefined stay simulated.
 *  visible: any unit (false also hides its shadow, ring and nameplate). pose / expression / opacity: rig units
 *  (Elias, bosses, heroes, named specials). rig.play(...) one-shots still work on top of an overridden pose. */
export interface RigOverride { pose?: Pose; opacity?: number; visible?: boolean; expression?: FaceExpr }

export interface UnitHandle {
  readonly id: number;
  /** Original team (stable). Mind control switches a unit's allegiance temporarily without changing `team`. */
  readonly team: number;     // 0 = player side, 1 = enemy, 2 = arena side B / third party
  readonly unitId: string;
  name?: string;
  hp: number;
  hpMax: number;
  readonly position: THREE.Vector3;
  alive: boolean;
  npcId?: string;
  isPlayer?: boolean;
}

export interface BattleContext {
  readonly time: number;
  readonly setup: BattleSetup;
  readonly player: UnitHandle & { mana: number; manaMax: number; invulnerable: boolean; controlsInverted: boolean; minHp: number };
  /** Living units (optionally of one original team); the player is returned as ctx.player. */
  units(team?: number): UnitHandle[];
  spawn(unitId: string, pos: { x: number; z: number }, team: number, opts?: { name?: string; special?: string; hpMult?: number; dmgMult?: number; abilities?: string[]; npcId?: string; captain?: boolean }): UnitHandle;
  cast(caster: UnitHandle, abilityId: string, target?: UnitHandle | { x: number; z: number }): void;
  damage(target: UnitHandle, amount: number, opts?: { abilityId?: string; knockback?: number; from?: { x: number; z: number }; crit?: boolean }): void;
  heal(target: UnitHandle, amount: number): void;
  moveTo(u: UnitHandle, pos: { x: number; z: number }): void;
  setAI(u: UnitHandle, mode: 'auto' | 'idle' | 'scripted'): void;
  say(u: UnitHandle, text: string, seconds?: number): void;
  hint(text: string, seconds?: number): void;
  cameraFocus(target: UnitHandle | { x: number; z: number } | null, opts?: { distance?: number; duration?: number }): void;
  slowmo(scale: number, seconds: number): void;
  wait(seconds: number): Promise<void>;
  launch(u: UnitHandle, velocity: { x: number; y: number; z: number }): void;
  lockInput(locked: boolean): void;
  /** Give Elias comprehension of an ability as if he had been hit by it. */
  comprehend(abilityId: string, amount?: number): void;
  end(victory: boolean, opts?: { skipResults?: boolean; fled?: boolean }): void;
  rigOf(u: UnitHandle): CharacterRig | null;
  /** Instant reposition (clamped to the field, snapped to the ground, velocity cleared, airborne → standing).
   *  Small shadow/arcane puff + 'teleport' sfx at both ends unless fx === false. yaw: facing in radians (0 = +z). */
  teleport(u: UnitHandle, pos: { x: number; z: number }, opts?: { fx?: boolean; yaw?: number }): void;
  /** Pin pose / expression / opacity / visibility so the per-frame sync doesn't reset them; null restores. */
  setRigOverride(u: UnitHandle, override: RigOverride | null): void;
  readonly fx: Fx;
  readonly pipeline: Pipeline;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
}

export interface BattleScript {
  id: string;
  onStart?(ctx: BattleContext): void | Promise<void>;
  onUpdate?(ctx: BattleContext, dt: number): void;
  onPlayerDamaged?(ctx: BattleContext, info: { amount: number; abilityId?: string; source?: UnitHandle }): void;
  /** Return true to prevent default death handling (Retorno / defeat). */
  onPlayerDeath?(ctx: BattleContext): boolean;
  onUnitDeath?(ctx: BattleContext, unit: UnitHandle): void;
  /** Every damage instance, after armor / resistances / shields, BEFORE it is applied and before the floating number
   *  is shown. Return a number to replace the amount (0 = no HP loss; the hit still flashes / knocks back), or nothing
   *  to keep it. source is undefined for ctx.damage / environment damage. Damage dealt from inside this hook (e.g. a
   *  ctx.damage call) does not re-enter it. Dodged (i-frames) and INMUNE hits never reach it. */
  onDamage?(ctx: BattleContext, info: { target: UnitHandle; amount: number; abilityId?: string; source?: UnitHandle }): number | void;
  /** Called once when the battle finishes (victory / defeat / retreat / ctx.end), before 'battle:end' and onResult.
   *  Not called if the scene is torn down externally mid-battle. Remove any DOM you added here. */
  onEnd?(ctx: BattleContext, result: BattleResult): void | Promise<void>;
}

declare module '../core/events' {
  interface GameEvents {
    /** battle → society (nemesis), world (conquest), story (designios). */
    'battle:start': { setup: BattleSetup };
    'battle:end': { setup: BattleSetup; result: BattleResult };
  }
}
