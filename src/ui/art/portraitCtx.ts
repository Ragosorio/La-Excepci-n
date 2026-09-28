// Internal context shared by the portrait drawing modules.
import type { PortraitMood, PortraitSpec, RaceId } from './portraits';
import type { Rng } from './util';
import { clamp } from './util';

export type Gender = 'f' | 'm' | 'x';
export type Age = 'child' | 'young' | 'adult' | 'old';

export type HairBack =
  | 'none'
  | 'short'
  | 'nape'
  | 'bob'
  | 'long'
  | 'ponytail'
  | 'twintails'
  | 'bun'
  | 'lowbun'
  | 'wild'
  | 'floating';
export type HairFront = 'spiky' | 'swept' | 'parted' | 'blunt' | 'slick' | 'messy' | 'curtain' | 'none';
export type HairTop = 'smooth' | 'spiky' | 'crest' | 'bald';
export type EarKind = 'human' | 'elf' | 'goblin' | 'fin' | 'troll' | 'none';
export type BeardKind = 'none' | 'stubble' | 'short' | 'full' | 'dwarf' | 'goatee' | 'mustache';
export type EyeShape = 'round' | 'sharp' | 'gentle' | 'cat';
export type EyeKind = 'normal' | 'ring' | 'glow' | 'slit';
export type Headwear =
  | 'none'
  | 'wizard'
  | 'witch'
  | 'mitre'
  | 'tricorn'
  | 'tophat'
  | 'visor'
  | 'helmet'
  | 'kettle'
  | 'miner'
  | 'straw'
  | 'beret'
  | 'bandana'
  | 'turban'
  | 'coinveil'
  | 'veil'
  | 'hood';
export type OutfitId =
  | 'tunic'
  | 'armor'
  | 'lightarmor'
  | 'robe'
  | 'sorcerer'
  | 'clergy'
  | 'monk'
  | 'leather'
  | 'rogue'
  | 'merchant'
  | 'gown'
  | 'apron'
  | 'noble'
  | 'peasant'
  | 'banker'
  | 'dealer'
  | 'captain'
  | 'pirate'
  | 'royal'
  | 'council'
  | 'miner'
  | 'shaman'
  | 'bard'
  | 'witch'
  | 'scholar'
  | 'healer'
  | 'elias'
  | 'dress';

export interface Geo {
  cx: number;
  top: number;
  R: number;
  turn: number;
  eyeY: number;
  eyeU: number;
  eyeW: number;
  eyeH: number;
  browGap: number;
  noseY: number;
  mouthY: number;
  mouthW: number;
  chinY: number;
  jawY: number;
  jawU: number;
  chinW: number;
  earY: number;
  neckW: number;
  neckY: number;
  shW: number;
}

export interface Pal {
  skin: string;
  skinSh: string;
  skinSh2: string;
  skinHi: string;
  skinLine: string;
  blush: string;
  hair: string;
  hairSh: string;
  hairHi: string;
  hairLine: string;
  eye: string;
  eye2: string;
  outfit: string;
  outfitSh: string;
  outfitHi: string;
  outfitLine: string;
  accent: string;
  accentSh: string;
  accentLine: string;
  metal: string;
  metalSh: string;
  metalHi: string;
  metalLine: string;
  trim: string;
  trimSh: string;
  line: string;
  mouth: string;
  glow: string;
}

export interface Feats {
  eyeShape: EyeShape;
  eyeKind: EyeKind;
  hairBack: HairBack;
  hairFront: HairFront;
  hairTop: HairTop;
  /** 0 none, 1 sideburn, 2 chin, 3 long (in front of shoulders) */
  sideLen: 0 | 1 | 2 | 3;
  ahoge: boolean;
  hairVol: number;
  part: number;
  sweep: number;
  streak: string | null;
  greyStreaks: boolean;
  ears: EarKind;
  beard: BeardKind;
  tusks: 'none' | 'under' | 'long' | 'fangs';
  horns: boolean;
  scales: boolean;
  cracks: boolean;
  freckles: boolean;
  facePaint: boolean;
  wrinkles: boolean;
  soot: boolean;
  noseKind: 'small' | 'long' | 'broad' | 'snout' | 'hook';
  headwear: Headwear;
  crown: boolean;
  halo: boolean;
  goggles: boolean;
  monocle: boolean;
  glasses: boolean;
  eyepatch: boolean;
  mask: boolean;
  earrings: boolean;
  scar: boolean;
  scarKind: 'nose' | 'eye' | 'cheek';
  glowEyes: boolean;
  outfit: OutfitId;
  braids: boolean;
  goldTooth: boolean;
  thirdEye: boolean;
  lightCracks: boolean;
  eclipseHalo: boolean;
  aura: string | null;
  fan: boolean;
  quiver: boolean;
  cape: boolean;
  plume: boolean;
  lashBoost: number;
  irisBoost: number;
  /** Signature faint smirk even on a neutral mood (Elias). */
  smirk: boolean;
  /** Heavy, tired lids (older Aurel). */
  tired: boolean;
}

export interface Ctx {
  spec: PortraitSpec;
  race: RaceId;
  job: string;
  gender: Gender;
  age: Age;
  mood: PortraitMood;
  rng: Rng;
  id: string;
  defs: string[];
  g: Geo;
  p: Pal;
  f: Feats;
  /** Paths computed up-front and shared between layers. */
  facePath: string;
  /** id of the face path registered in <defs>. */
  faceId: string;
  /** Front hair shapes (cap + locks) used to cast the fringe shadow on the forehead. */
  hairShapes: string[];
}

/** Horizontal position of a face-surface point u∈[-1,1] once the head is turned (cylinder model). */
export function X(g: Geo, u: number): number {
  return g.cx + g.R * Math.sin(Math.asin(clamp(u, -1, 1)) + g.turn);
}

/** Horizontal foreshortening factor at u (1 = no change). */
export function S(g: Geo, u: number): number {
  const a = Math.asin(clamp(u, -0.98, 0.98));
  return Math.cos(a + g.turn) / Math.cos(a);
}

export function mkId(c: Ctx, name: string): string {
  return `${c.id}${name}`;
}

export function addDef(c: Ctx, def: string): void {
  c.defs.push(def);
}

/** Registers a shape once in <defs> and returns its id (reference it with useRef). */
export function defShape(c: Ctx, key: string, d: string): string {
  const id = `${c.id}${key}`;
  c.defs.push(`<path id="${id}" d="${d}"/>`);
  return id;
}

/** <use> reference to a registered shape with extra presentation attributes. */
export function useRef(id: string, attrs = ''): string {
  return `<use href="#${id}"${attrs ? ` ${attrs}` : ''}/>`;
}

/** Moods where the character is rendered as a silhouette. */
export const isShadowMood = (m: PortraitMood): boolean => m === 'shadow';
