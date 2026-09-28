/** Shared numeric constants for the battle simulation (no imports → safe from cycles). */
import type { StatusId } from '../data/types';

export const MAXU = 720;          // unit slots (alive + corpses)
export const NJ = 15;             // skeleton joints per unit
export const NA = 4;              // ability slots per unit

// ── teams (UnitHandle.team): 0 = player side / arena side A, 1 = enemy, 2 = arena side B / third party
export const TEAM_PLAYER = 0, TEAM_ENEMY = 1, TEAM_B = 2;

// ── states
export const S_FREE = 0, S_IDLE = 1, S_MOVE = 2, S_ATTACK = 3, S_CAST = 4, S_AIR = 5, S_DOWN = 6, S_DEAD = 7, S_DASH = 8, S_HELD = 9;

// ── flags
export const F_PLAYER = 1 << 0;
export const F_CAPTAIN = 1 << 1;
export const F_BOSS = 1 << 2;
export const F_RIG = 1 << 3;       // rendered by a full CharacterRig
export const F_CLONE = 1 << 4;     // Elias shadow clone
export const F_SUMMON = 1 << 5;
export const F_DEVOTO = 1 << 6;
export const F_NOAI = 1 << 7;      // script: idle
export const F_SCRIPTED = 1 << 8;  // script: moveTo / manual control
export const F_INVULN = 1 << 9;
export const F_PRISONER = 1 << 10; // dominated while weak → can become a Devoto
export const F_FLED = 1 << 11;
export const F_TOWER = 1 << 12;    // stationed on a siege tower
export const F_ROUT = 1 << 13;
export const F_HERO = 1 << 14;     // named hero (Aurel...)
export const F_THROWN = 1 << 15;   // thrown by an ogre: explodes on landing
export const F_EATEN = 1 << 16;    // devoured: no corpse
export const F_NOCORPSE = 1 << 17;
export const F_DEPLOYED = 1 << 18; // placed in deployment (not yet fighting)
export const F_WALL = 1 << 19;     // (reserved)
export const F_TRANSFORMED = 1 << 20;
export const F_HIDDEN = 1 << 21;    // script: not rendered (rig / crowd body, shadow, ring, nameplate)

// ── joints (skeleton / ragdoll particles)
export const J_HEAD = 0, J_NECK = 1, J_PELVIS = 2, J_SHL = 3, J_SHR = 4, J_ELL = 5, J_ELR = 6, J_HANDL = 7, J_HANDR = 8,
  J_HIPL = 9, J_HIPR = 10, J_KNEEL = 11, J_KNEER = 12, J_FOOTL = 13, J_FOOTR = 14;

// ── statuses (index = bit)
export const STATUS_IDS: StatusId[] = [
  'quemadura', 'congelado', 'lento', 'aturdido', 'veneno', 'encanto', 'mente', 'miedo', 'sapo', 'ceguera', 'silencio', 'raiz',
  'invisible', 'escudo', 'regeneracion', 'prisa', 'robo_vida', 'maldicion', 'furia', 'inmortal', 'sangrado', 'marcado', 'traicion', 'provocar',
];
export const NS = STATUS_IDS.length;
export const SI: Record<StatusId, number> = Object.fromEntries(STATUS_IDS.map((s, i) => [s, i])) as Record<StatusId, number>;
export const GOOD_STATUS = new Set<StatusId>(['invisible', 'escudo', 'regeneracion', 'prisa', 'robo_vida', 'furia', 'inmortal']);

// status bit masks used in hot loops
export const B_BURN = 1 << SI.quemadura, B_FROZEN = 1 << SI.congelado, B_SLOW = 1 << SI.lento, B_STUN = 1 << SI.aturdido,
  B_POISON = 1 << SI.veneno, B_CHARM = 1 << SI.encanto, B_MIND = 1 << SI.mente, B_FEAR = 1 << SI.miedo, B_TOAD = 1 << SI.sapo,
  B_BLIND = 1 << SI.ceguera, B_SILENCE = 1 << SI.silencio, B_ROOT = 1 << SI.raiz, B_INVIS = 1 << SI.invisible, B_SHIELD = 1 << SI.escudo,
  B_REGEN = 1 << SI.regeneracion, B_HASTE = 1 << SI.prisa, B_LEECH = 1 << SI.robo_vida, B_CURSE = 1 << SI.maldicion,
  B_FURY = 1 << SI.furia, B_IMMORTAL = 1 << SI.inmortal, B_BLEED = 1 << SI.sangrado, B_MARK = 1 << SI.marcado,
  B_TRAITOR = 1 << SI.traicion, B_TAUNT = 1 << SI.provocar;

/** Statuses that prevent any action. */
export const B_DISABLED = B_FROZEN | B_STUN;

// ── face expressions (index into FACE_EXPRS of the face atlas)
export const EX_NEUTRAL = 0, EX_ANGRY = 1, EX_SCARED = 2, EX_HURT = 3, EX_DEAD = 4, EX_MIND = 5, EX_HAPPY = 6, EX_SLEEP = 7, EX_DETERMINED = 8, EX_EATING = 9;

// ── attack styles
export const AS_SWING = 0, AS_THRUST = 1, AS_BOW = 2, AS_GUN = 3, AS_CAST = 4, AS_PUNCH = 5, AS_THROW = 6;

// ── projectile kinds
export const P_ARROW = 0, P_BULLET = 1, P_ROCK = 2, P_ORB = 3, P_SPEAR = 4, P_BOMB = 5, P_AXE = 6, P_HAMMER = 7;
export const PROJ_BY_NAME: Record<string, number> = { flecha: P_ARROW, bala: P_BULLET, roca: P_ROCK, orbe: P_ORB, lanza: P_SPEAR, bomba: P_BOMB, hacha: P_AXE, martillo: P_HAMMER };

export const GRAVITY = 18;

/** Field half-size: units fight inside [-FIELD, FIELD]² (routers leave through the edges). */
export const FIELD = 62;
