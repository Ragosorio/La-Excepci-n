// Anime-style procedural character portraits (SVG strings).
// portraitSVG(spec, size) → complete <svg> with a square 200×200 viewBox and transparent background.
import type { Age, Ctx, Feats, Gender, Geo, Headwear, HairBack, HairFront, OutfitId, Pal } from './portraitCtx';
import { defShape, useRef } from './portraitCtx';
import { buildFacePath, drawBeard, drawBraids, drawBrows, drawEars, drawEyes, drawFaceAccessories, drawFaceBase, drawLightCracks, drawMask, drawMoodOverlay, drawMouth, drawNeck, drawTusks } from './portraitFace';
import { buildFrontHair, drawBackHair, drawBun, drawFrontHair, drawHairDrapes, drawHairTies } from './portraitHair';
import { drawBackGear, drawBody, drawFrontGear, drawHeadwear } from './portraitGear';
import { brumaSVG, drawAura, drawEclipseHalo, narratorSVG, shadowFigureSVG } from './portraitSpecials';
import type { Rng } from './util';
import { deepShade, lightOf, luminance, makeRng, mix, shadowOf, svgOpen, uid } from './util';

export type RaceId =
  | 'elfo'
  | 'caballero'
  | 'gigante'
  | 'ogro'
  | 'duende'
  | 'mago'
  | 'bruja'
  | 'enano'
  | 'humano'
  | 'trol'
  | 'clerigo'
  | 'picaro'
  | 'sirena'
  | 'draconido'
  | 'excepcion';
export type PortraitMood =
  | 'neutral'
  | 'smile'
  | 'smug'
  | 'angry'
  | 'scared'
  | 'sad'
  | 'surprised'
  | 'mind'
  | 'dead'
  | 'shadow'
  | 'hurt'
  | 'determined';
export type PortraitSpecial =
  | 'elias'
  | 'elias_god'
  | 'aurel'
  | 'aurel_child'
  | 'aurel_old'
  | 'bruma'
  | 'shadow'
  | 'mother'
  | 'father'
  | 'tiburcio'
  | 'fortuna'
  | 'ione'
  | 'narrador';
export interface PortraitSpec {
  seed: string; // stable per NPC id → deterministic variation (hair style, colors, features)
  race: RaceId;
  job?: string;
  gender?: 'f' | 'm' | 'x';
  age?: 'child' | 'young' | 'adult' | 'old';
  mood?: PortraitMood;
  palette?: { hair?: string; eyes?: string; skin?: string; outfit?: string; accent?: string };
  special?: PortraitSpecial; // hand-tuned signature characters
  scar?: boolean;
  eyepatch?: boolean;
  crown?: boolean;
  hood?: boolean;
  glowEyes?: boolean;
}

export const RACE_IDS: RaceId[] = ['elfo', 'caballero', 'gigante', 'ogro', 'duende', 'mago', 'bruja', 'enano', 'humano', 'trol', 'clerigo', 'picaro', 'sirena', 'draconido', 'excepcion'];
export const PORTRAIT_MOODS: PortraitMood[] = ['neutral', 'smile', 'smug', 'angry', 'scared', 'sad', 'surprised', 'mind', 'dead', 'shadow', 'hurt', 'determined'];
export const PORTRAIT_SPECIALS: PortraitSpecial[] = ['elias', 'elias_god', 'aurel', 'aurel_child', 'aurel_old', 'bruma', 'shadow', 'mother', 'father', 'tiburcio', 'fortuna', 'ione', 'narrador'];

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

const HUMAN_SKIN = ['#f8e2d0', '#f4d6bf', '#eecaa9', '#e3b48e', '#c99169', '#a8704b', '#7e5236'];
const SKIN: Record<RaceId, string[]> = {
  humano: HUMAN_SKIN,
  caballero: ['#f6dcc6', '#ecc6a4', '#d6a27a', '#a8704b'],
  mago: HUMAN_SKIN,
  bruja: [...HUMAN_SKIN.slice(0, 4), '#d7e2cc', '#e8dcef'],
  clerigo: HUMAN_SKIN,
  picaro: HUMAN_SKIN,
  elfo: ['#faeadf', '#f6e0d2', '#efd9cf', '#e6d6e4', '#b9a6c6', '#d8b494'],
  gigante: ['#a89e90', '#9d9587', '#938d88', '#ae9a82'],
  ogro: ['#9aa27f', '#8d9672', '#a3a68b', '#86916c'],
  duende: ['#96bb52', '#84ad46', '#a6c25c', '#76a046', '#8fa83e'],
  enano: ['#f2cdac', '#e8b894', '#d8a07c', '#bc8664'],
  trol: ['#62a9b0', '#539aaa', '#6ca8c6', '#5aa298', '#6d92c2'],
  sirena: ['#f5e6e4', '#eaf1f0', '#d9eeec', '#f2dcd2'],
  draconido: ['#cf7556', '#c09152', '#77a062', '#d8b476', '#8e7ea0', '#b05a44'],
  excepcion: ['#ebe2f2', '#ded5ec', '#d3cae3'],
};
const HUMAN_HAIR = ['#2a2230', '#3d2a22', '#5e3b26', '#8a5530', '#a0452b', '#d9b35e', '#c9a27a', '#1f2740', '#6b4a3a'];
const HAIR: Record<RaceId, string[]> = {
  humano: HUMAN_HAIR,
  caballero: HUMAN_HAIR,
  mago: ['#e6e3ee', '#2e3a7a', '#5b3a8a', '#1b1822', '#c9c2d6', '#7a3a5a'],
  bruja: ['#3a1f4a', '#3f7a4a', '#8a2238', '#9f7ac2', '#d2692e', '#1b1418'],
  clerigo: ['#e2c170', '#f0e2b8', '#8a5530', '#e8e4dc', '#c98a4a'],
  picaro: ['#2a2230', '#5a2a24', '#3d2a22', '#8a3a2a', '#20242e'],
  elfo: ['#f1e6c8', '#dde1ea', '#f0d890', '#a8dcbf', '#c9b6e8', '#e6f0f5', '#b7d68f'],
  gigante: ['#5a5048', '#4a4a52', '#6a5a4a', '#8a8078'],
  ogro: ['#2a2622', '#3a3028', '#4a3a2a'],
  duende: ['#2a2a2a', '#3a4a2a', '#8a8a8a', '#e8e4dc', '#4a2a2a'],
  enano: ['#b84a26', '#c9702f', '#5e3b26', '#2a2230', '#e8e4dc', '#d9a44a'],
  trol: ['#c43b3b', '#e0782f', '#f1ead8', '#1b1822', '#b8428a', '#3ab0a0'],
  sirena: ['#5fd3c6', '#2aa198', '#3b82c4', '#f08a7e', '#e6f0ef', '#7a6ad8'],
  draconido: ['#6e1f1f', '#1b1418', '#8a5a2b', '#efe6d8', '#2a3a2a'],
  excepcion: ['#1b1424', '#d9ccff', '#2a1a3a', '#e8e4f0'],
};
const EYES_DEF = ['#3f7ad8', '#3aa06a', '#8a5a2a', '#6a4aa8', '#2a8a9a', '#b0453a', '#d9a02a', '#4a4a5a'];
const EYES: Partial<Record<RaceId, string[]>> = {
  elfo: ['#3aa06a', '#2a9ac0', '#8ad0a0', '#6a8ae0', '#b08ae0'],
  duende: ['#f2d23a', '#f0b82a', '#e8e04a', '#ff9a2a'],
  ogro: ['#e8c23a', '#c8742a', '#b0453a'],
  gigante: ['#6a8aa8', '#8a7a5a', '#5a8a8a'],
  trol: ['#f2d23a', '#e8783a', '#e2455b', '#b8f04a'],
  sirena: ['#2ad0c0', '#3a9ae0', '#7fe3ff', '#b08ae0'],
  draconido: ['#f2b632', '#e8783a', '#e2455b', '#7fe36a'],
  excepcion: ['#9b5cff', '#b98cff', '#7fe3ff'],
  bruja: ['#9bdc5a', '#b08ae0', '#e2455b', '#f2b632'],
  mago: ['#6a8ae0', '#9b5cff', '#2a9ac0', '#d9a02a'],
};
const ACCENTS = ['#b3202c', '#2a5aa8', '#2f8a5a', '#8a3ab0', '#c8742a', '#1f8a8a', '#c83a7a', '#d9b36c'];

const OUTFIT_COLORS: Record<OutfitId, string[]> = {
  tunic: ['#5a6e3a', '#7a4a2a', '#3e5a7a', '#6a3a5a', '#8a6a3a'],
  armor: ['#3a2a3a', '#2a3242', '#40302a'],
  lightarmor: ['#8a7a5a', '#6a5a48', '#5a6a5a'],
  robe: ['#3a2a7a', '#5a2a6a', '#1f3f6a', '#6a1f3a'],
  sorcerer: ['#1f1530', '#2a1a2a', '#10202a'],
  clergy: ['#f3efe6', '#efe8d8'],
  monk: ['#c8742a', '#8a5a2a', '#a8452a'],
  leather: ['#4a6a3a', '#5a4a2a', '#3a5a4a'],
  rogue: ['#2e2e3a', '#3a2a2e', '#243030'],
  merchant: ['#8a2a3a', '#2a5a6a', '#6a4a1a', '#3a6a3a'],
  gown: ['#6a1f4a', '#1f3a6a', '#3a1f5a', '#7a2a2a'],
  apron: ['#c8b89a', '#b8a888', '#d8c8a8'],
  noble: ['#5a1f3a', '#1f2f5a', '#3a1f4a'],
  peasant: ['#a8906a', '#8a7a5a', '#9a8a6a', '#6a8a4a'],
  banker: ['#2f7a3a', '#5a2a3a', '#2a4a6a'],
  dealer: ['#1b1620'],
  captain: ['#1f2f5a', '#6a1f24', '#1f3a3a'],
  pirate: ['#6a1f24', '#2a2a4a', '#3a2a1a'],
  royal: ['#6a1a2a', '#3a1a5a', '#1a2a5a'],
  council: ['#f1ece2', '#e6e8f0'],
  miner: ['#6a6a6a', '#5a5048'],
  shaman: ['#7a5a3a', '#5a4a3a'],
  bard: ['#6a2a6a', '#2a5a6a', '#8a4a1a'],
  witch: ['#2a1a3a', '#1a2a1f', '#3a1a2a'],
  scholar: ['#3a2a1f', '#2a2a3a', '#4a3a2a'],
  healer: ['#e8e2d0', '#dfe8d8'],
  elias: ['#1a161f'],
  dress: ['#8a5a4a', '#5a6a8a', '#7a6a4a'],
};

const JOB_OUTFIT: Record<string, OutfitId> = {
  guerrero: 'armor',
  caballero: 'armor',
  guardian: 'armor',
  soldado: 'lightarmor',
  arquero: 'leather',
  cazador: 'leather',
  curandero: 'healer',
  hechicero: 'sorcerer',
  mago: 'robe',
  mercader: 'merchant',
  cortesana: 'gown',
  herrero: 'apron',
  alquimista: 'apron',
  tabernero: 'apron',
  erudito: 'scholar',
  sacerdote: 'clergy',
  clerigo: 'clergy',
  monje: 'monk',
  bardo: 'bard',
  ladron: 'rogue',
  picaro: 'rogue',
  asesino: 'rogue',
  espia: 'rogue',
  minero: 'miner',
  chaman: 'shaman',
  noble: 'noble',
  campesino: 'peasant',
  banquero: 'banker',
  crupier: 'dealer',
  capitan: 'captain',
  pirata: 'pirate',
  rey: 'royal',
  reina: 'royal',
  delegado: 'council',
  bruja: 'witch',
  elias: 'elias',
  dress: 'dress',
};

const RACE_OUTFIT: Partial<Record<RaceId, OutfitId>> = {
  caballero: 'armor',
  mago: 'robe',
  bruja: 'witch',
  clerigo: 'clergy',
  picaro: 'rogue',
  excepcion: 'sorcerer',
};

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function makeGeo(race: RaceId, gender: Gender, age: Age): Geo {
  const g: Geo = {
    cx: 100,
    top: 40,
    R: 33,
    turn: 0.12,
    eyeY: 96,
    eyeU: 0.5,
    eyeW: 18,
    eyeH: 16.5,
    browGap: 12,
    noseY: 109,
    mouthY: 119,
    mouthW: 9,
    chinY: 132,
    jawY: 118,
    jawU: 0.78,
    chinW: 0,
    earY: 98,
    neckW: 10,
    neckY: 150,
    shW: 64,
  };
  if (age === 'child') {
    Object.assign(g, { top: 45, R: 34, eyeY: 103, eyeW: 19.5, eyeH: 19, noseY: 114, mouthY: 122, chinY: 133, jawY: 121, jawU: 0.84, neckW: 8, shW: 50, neckY: 152, browGap: 13, earY: 104 });
  } else if (age === 'adult') {
    Object.assign(g, { eyeH: 15, eyeW: 17.5, chinY: 134, noseY: 110, mouthY: 121, jawY: 119 });
  } else if (age === 'old') {
    Object.assign(g, { eyeH: 13.5, eyeW: 17, chinY: 135, noseY: 111, mouthY: 122, jawY: 120 });
  }
  if (gender === 'm') {
    g.jawU = age === 'child' ? 0.84 : 0.83;
    g.chinW = age === 'child' ? 1 : 3;
    g.eyeH *= 0.9;
    g.neckW += 2.5;
    g.shW += 8;
    g.mouthW = 10;
    g.jawY += 1;
    g.browGap += 0.5;
  } else if (gender === 'f') {
    g.jawU = age === 'child' ? 0.8 : 0.72;
    g.eyeH *= 1.04;
    g.neckW -= 0.5;
    g.shW -= 4;
    g.mouthW = 8;
  }
  switch (race) {
    case 'elfo':
      g.R -= 1.5;
      g.jawU -= 0.04;
      g.chinY += 2;
      break;
    case 'ogro':
      Object.assign(g, { R: 40, jawU: 0.97, chinW: 10, eyeU: 0.46, neckW: 20, shW: 92, mouthW: 17, browGap: 8 });
      g.jawY += 6;
      g.chinY += 6;
      g.eyeW *= 0.78;
      g.eyeH *= 0.6;
      g.mouthY += 3;
      break;
    case 'gigante':
      Object.assign(g, { R: 38, jawU: 0.92, chinW: 8, neckW: 18, shW: 92, mouthW: 13, browGap: 8.5 });
      g.jawY += 4;
      g.chinY += 5;
      g.eyeW *= 0.84;
      g.eyeH *= 0.68;
      break;
    case 'trol':
      Object.assign(g, { R: 31, jawU: 0.82, neckW: 9, shW: 70, mouthW: 12 });
      g.chinY += 7;
      g.jawY += 5;
      g.eyeW *= 0.95;
      g.eyeH *= 0.8;
      g.mouthY += 4;
      g.noseY += 2;
      break;
    case 'enano':
      Object.assign(g, { R: 37, jawU: 0.9, chinW: 6, neckW: 15, shW: 84 });
      g.eyeW *= 0.92;
      g.eyeH *= 0.86;
      break;
    case 'duende':
      Object.assign(g, { R: 31, jawU: 0.7, mouthW: 15, neckW: 7.5, shW: 52 });
      g.chinY -= 1;
      g.eyeW *= 1.06;
      g.eyeH *= 0.94;
      break;
    case 'draconido':
      g.jawU += 0.03;
      break;
    default:
      break;
  }
  return g;
}

// ---------------------------------------------------------------------------
// Feature resolution
// ---------------------------------------------------------------------------

function defaultFeats(): Feats {
  return {
    eyeShape: 'round',
    eyeKind: 'normal',
    hairBack: 'short',
    hairFront: 'swept',
    hairTop: 'smooth',
    sideLen: 1,
    ahoge: false,
    hairVol: 6,
    part: 0,
    sweep: 1,
    streak: null,
    greyStreaks: false,
    ears: 'human',
    beard: 'none',
    tusks: 'none',
    horns: false,
    scales: false,
    cracks: false,
    freckles: false,
    facePaint: false,
    wrinkles: false,
    soot: false,
    noseKind: 'small',
    headwear: 'none',
    crown: false,
    halo: false,
    goggles: false,
    monocle: false,
    glasses: false,
    eyepatch: false,
    mask: false,
    earrings: false,
    scar: false,
    scarKind: 'cheek',
    glowEyes: false,
    outfit: 'tunic',
    braids: false,
    goldTooth: false,
    thirdEye: false,
    lightCracks: false,
    eclipseHalo: false,
    aura: null,
    fan: false,
    quiver: false,
    cape: false,
    plume: false,
    lashBoost: 0,
    irisBoost: 1,
    smirk: false,
    tired: false,
  };
}

function makeFeats(spec: PortraitSpec, race: RaceId, gender: Gender, age: Age, job: string, rng: Rng): Feats {
  const f = defaultFeats();
  const hr = rng.fork('hair');
  const fr = rng.fork('feat');
  f.eyeShape = fr.pick(gender === 'm' ? (['sharp', 'round', 'sharp', 'gentle', 'cat'] as const) : (['round', 'gentle', 'sharp', 'cat', 'round'] as const));
  if (age === 'child') f.eyeShape = fr.pick(['round', 'round', 'gentle'] as const);
  // hair
  let back: HairBack;
  let front: HairFront;
  if (gender === 'f') {
    back = hr.pick(['long', 'long', 'bob', 'ponytail', 'twintails', 'bun', 'long', 'lowbun'] as const);
    front = hr.pick(['swept', 'parted', 'blunt', 'curtain', 'messy', 'parted'] as const);
    f.sideLen = back === 'bob' ? 2 : hr.pick([2, 3, 3] as const);
  } else if (gender === 'm') {
    back = hr.pick(['short', 'nape', 'short', 'nape', 'long', 'ponytail', 'nape'] as const);
    front = hr.pick(['spiky', 'swept', 'messy', 'parted', 'slick', 'spiky'] as const);
    f.sideLen = back === 'long' ? 3 : hr.pick([1, 1, 2] as const);
  } else {
    back = hr.pick(['bob', 'nape', 'long', 'ponytail'] as const);
    front = hr.pick(['swept', 'messy', 'parted', 'curtain'] as const);
    f.sideLen = back === 'long' ? 3 : 2;
  }
  f.hairBack = back;
  f.hairFront = front;
  f.hairTop = front === 'spiky' ? 'spiky' : hr.chance(0.15) && gender !== 'f' ? 'spiky' : 'smooth';
  f.sweep = hr.chance(0.5) ? 1 : -1;
  f.part = hr.range(-0.35, 0.35);
  f.hairVol = hr.range(4, 9);
  f.ahoge = hr.chance(age === 'child' ? 0.4 : 0.12);
  if (age === 'old') f.wrinkles = true;
  if (gender === 'm' && (age === 'adult' || age === 'old')) {
    const b = fr.next();
    f.beard = b < 0.18 ? 'short' : b < 0.28 ? 'stubble' : b < 0.34 ? 'goatee' : b < 0.4 ? 'mustache' : age === 'old' && b < 0.7 ? 'full' : 'none';
  }
  if (race === 'humano' || race === 'picaro') f.freckles = fr.chance(0.14);

  // race features
  switch (race) {
    case 'elfo':
      f.ears = 'elf';
      if (gender !== 'm') f.hairBack = hr.pick(['long', 'long', 'ponytail', 'bun'] as const);
      if (f.hairFront === 'spiky') f.hairFront = 'swept';
      f.hairTop = 'smooth';
      f.lashBoost = 0.3;
      f.earrings = fr.chance(0.35);
      break;
    case 'duende':
      f.ears = 'goblin';
      f.noseKind = 'long';
      f.hairBack = hr.pick(['none', 'short', 'nape'] as const);
      f.hairFront = hr.pick(['messy', 'slick', 'spiky', 'none'] as const);
      f.hairTop = f.hairFront === 'none' ? 'bald' : f.hairFront === 'spiky' ? 'spiky' : 'smooth';
      f.sideLen = 1;
      f.hairVol = 3;
      f.earrings = fr.chance(0.5);
      f.eyeShape = 'cat';
      break;
    case 'ogro':
      f.tusks = 'under';
      f.noseKind = 'broad';
      f.hairTop = hr.chance(0.7) ? 'bald' : 'smooth';
      f.hairBack = 'none';
      f.hairFront = f.hairTop === 'bald' ? 'none' : 'messy';
      f.sideLen = 0;
      f.hairVol = 2;
      f.eyeShape = 'round';
      if (f.beard === 'short') f.beard = 'stubble';
      break;
    case 'gigante':
      f.cracks = true;
      f.noseKind = 'broad';
      f.hairTop = hr.chance(0.45) ? 'bald' : 'smooth';
      f.hairFront = f.hairTop === 'bald' ? 'none' : 'slick';
      f.hairBack = f.hairTop === 'bald' ? 'none' : 'short';
      f.sideLen = 1;
      f.eyeShape = 'round';
      if (gender === 'm' && f.beard === 'none') f.beard = fr.chance(0.5) ? 'full' : 'none';
      break;
    case 'trol':
      f.ears = 'troll';
      f.tusks = 'long';
      f.noseKind = 'hook';
      f.hairTop = 'crest';
      f.hairFront = 'none';
      f.hairBack = 'none';
      f.facePaint = fr.chance(0.6);
      f.earrings = fr.chance(0.6);
      f.eyeShape = 'sharp';
      if (f.beard !== 'none') f.beard = 'none';
      break;
    case 'enano':
      if (gender === 'f') {
        f.braids = true;
        f.hairBack = 'short';
        f.hairFront = hr.pick(['parted', 'swept', 'blunt'] as const);
        f.freckles = fr.chance(0.4);
      } else {
        f.beard = age === 'child' ? 'none' : age === 'young' && fr.chance(0.4) ? 'full' : 'dwarf';
        f.hairBack = 'short';
        f.hairFront = hr.pick(['slick', 'messy', 'parted'] as const);
        f.hairTop = hr.chance(0.25) ? 'bald' : 'smooth';
        if (f.hairTop === 'bald') f.hairFront = 'none';
      }
      f.sideLen = 1;
      f.eyeShape = 'round';
      break;
    case 'sirena':
      f.ears = 'fin';
      f.scales = true;
      f.hairBack = hr.pick(['long', 'wild', 'long'] as const);
      f.hairFront = hr.pick(['curtain', 'swept', 'parted'] as const);
      f.hairTop = 'smooth';
      f.sideLen = 3;
      f.lashBoost = 0.35;
      f.earrings = fr.chance(0.4);
      break;
    case 'draconido':
      f.horns = true;
      f.scales = true;
      f.eyeKind = 'slit';
      f.tusks = 'fangs';
      f.eyeShape = gender === 'f' ? 'cat' : 'sharp';
      f.ears = fr.chance(0.5) ? 'fin' : 'human';
      break;
    case 'excepcion':
      f.glowEyes = true;
      f.eyeShape = 'sharp';
      f.aura = '#9b5cff';
      break;
    case 'bruja':
      if (gender !== 'm') f.hairBack = hr.pick(['wild', 'long', 'long'] as const);
      f.lashBoost = 0.25;
      if (fr.chance(0.15)) f.thirdEye = true;
      break;
    case 'caballero':
      f.cape = fr.chance(0.6);
      f.plume = fr.chance(0.5);
      break;
    default:
      break;
  }

  // outfit + headwear by job
  const outfit = JOB_OUTFIT[job] ?? RACE_OUTFIT[race] ?? 'tunic';
  f.outfit = outfit;
  const jr = rng.fork('job');
  let hw: Headwear = 'none';
  switch (job) {
    case 'mago':
      hw = 'wizard';
      break;
    case 'hechicero':
      hw = jr.chance(0.35) ? 'wizard' : 'none';
      break;
    case 'sacerdote':
    case 'clerigo':
      hw = jr.chance(0.55) ? 'mitre' : 'none';
      f.halo = true;
      break;
    case 'pirata':
      hw = jr.chance(0.7) ? 'tricorn' : 'bandana';
      f.earrings = true;
      f.eyepatch = jr.chance(0.25);
      break;
    case 'crupier':
      hw = 'visor';
      break;
    case 'minero':
      hw = 'miner';
      f.soot = true;
      break;
    case 'campesino':
      hw = jr.chance(0.4) ? 'straw' : 'none';
      break;
    case 'bardo':
      hw = 'beret';
      break;
    case 'mercader':
      hw = jr.chance(0.4) ? 'turban' : 'none';
      break;
    case 'cortesana':
      hw = 'veil';
      f.earrings = true;
      f.fan = true;
      f.lashBoost = 0.35;
      break;
    case 'soldado':
      hw = jr.chance(0.5) ? 'kettle' : 'none';
      break;
    case 'picaro':
    case 'ladron':
    case 'asesino':
    case 'espia':
      hw = jr.chance(job === 'ladron' ? 0.5 : 0.8) ? 'hood' : 'none';
      f.mask = job === 'asesino' || (job === 'picaro' && jr.chance(0.6)) || (job === 'espia' && jr.chance(0.4));
      break;
    case 'cazador':
      hw = jr.chance(0.4) ? 'hood' : 'none';
      f.quiver = true;
      break;
    case 'arquero':
      f.quiver = true;
      break;
    case 'herrero':
    case 'alquimista':
      f.goggles = true;
      if (job === 'herrero') f.soot = jr.chance(0.6);
      break;
    case 'banquero':
      f.monocle = jr.chance(0.7);
      break;
    case 'erudito':
      f.glasses = jr.chance(0.75);
      break;
    case 'rey':
    case 'reina':
      f.crown = true;
      break;
    case 'noble':
      f.earrings = gender === 'f';
      break;
    case 'chaman':
      f.facePaint = true;
      break;
    case 'monje':
      if (gender === 'm' && race !== 'trol') {
        f.hairTop = 'bald';
        f.hairFront = 'none';
        f.hairBack = 'none';
      }
      break;
    case 'guerrero':
    case 'guardian':
      f.cape = jr.chance(0.5);
      break;
    default:
      break;
  }
  if (!job) {
    if (race === 'mago') hw = 'wizard';
    if (race === 'bruja') hw = 'witch';
    if (race === 'clerigo') {
      f.halo = true;
      hw = jr.chance(0.4) ? 'mitre' : 'none';
    }
    if (race === 'picaro') {
      hw = 'hood';
      f.mask = true;
    }
  }
  if (race === 'bruja' && (job === '' || job === 'bruja' || job === 'hechicero' || job === 'chaman' || job === 'alquimista')) hw = 'witch';
  if (race === 'caballero' && (outfit === 'armor' || outfit === 'lightarmor')) hw = 'helmet';
  if (spec.hood) hw = 'hood';
  f.headwear = hw;
  if (spec.crown) f.crown = true;
  if (spec.eyepatch) f.eyepatch = true;
  if (spec.glowEyes) f.glowEyes = true;
  if (spec.scar) {
    f.scar = true;
    f.scarKind = rng.fork('scar').pick(['nose', 'eye', 'cheek'] as const);
  }
  // hats need a calm crown silhouette
  const openTop: Headwear[] = ['none', 'visor', 'veil', 'coinveil'];
  if (!openTop.includes(hw)) {
    if (f.hairTop === 'spiky') f.hairTop = 'smooth';
    f.ahoge = false;
    f.hairVol = Math.min(f.hairVol, 5);
  }
  if (hw === 'hood' || hw === 'helmet') {
    if (f.hairBack === 'twintails' || f.hairBack === 'ponytail' || f.hairBack === 'bun') f.hairBack = 'short';
    if (f.sideLen > 2) f.sideLen = 2;
  }
  if (hw === 'helmet' && f.hairTop === 'crest') f.hairTop = 'smooth';
  if (f.hairTop === 'bald' && f.hairFront !== 'none') f.hairFront = 'none';
  return f;
}

function makePalette(spec: PortraitSpec, race: RaceId, f: Feats, rng: Rng, mood: PortraitMood, age: Age): Pal {
  const pr = rng.fork('pal');
  let skin = spec.palette?.skin ?? pr.pick(SKIN[race]);
  if (mood === 'dead') skin = mix(skin, '#a3a8ba', 0.42);
  let hair = spec.palette?.hair ?? pr.pick(HAIR[race]);
  if (age === 'old' && !spec.palette?.hair && race !== 'trol') hair = mix(hair, pr.chance(0.5) ? '#e8e6e2' : '#b9b6b2', 0.7);
  const eye = spec.palette?.eyes ?? pr.pick(EYES[race] ?? EYES_DEF);
  const outfit = spec.palette?.outfit ?? pr.pick(OUTFIT_COLORS[f.outfit]);
  const accent = spec.palette?.accent ?? pr.pick(ACCENTS);
  const dark = luminance(hair) < 0.22;
  const green = race === 'duende' || race === 'ogro' || race === 'trol';
  return {
    skin,
    skinSh: mix(skin, green ? '#2a3a5a' : '#a04a6e', green ? 0.2 : 0.2),
    skinSh2: mix(skin, green ? '#1a2440' : '#6a2a4e', 0.32),
    skinHi: lightOf(skin, 0.06),
    skinLine: mix(shadowOf(skin, 0.45), '#1a0a14', 0.5),
    blush: green ? '#e0808a' : '#ff8a9a',
    hair,
    hairSh: dark ? mix(hair, '#000000', 0.35) : deepShade(hair, 0.3),
    hairHi: dark ? mix(hair, '#c8d0ff', 0.42) : lightOf(hair, 0.2),
    hairLine: mix(shadowOf(hair, 0.4), '#12081a', 0.6),
    eye,
    eye2: eye,
    outfit,
    outfitSh: shadowOf(outfit, 0.12),
    outfitHi: lightOf(outfit, 0.12),
    outfitLine: mix(shadowOf(outfit, 0.4), '#12081a', 0.55),
    accent,
    accentSh: shadowOf(accent, 0.12),
    accentLine: mix(shadowOf(accent, 0.4), '#12081a', 0.55),
    metal: race === 'caballero' ? pr.pick(['#b8c2ce', '#aab4c0', '#8f97a6']) : '#aeb8c4',
    metalSh: '#6a7280',
    metalHi: '#eef2f8',
    metalLine: '#2a2230',
    trim: '#d9b36c',
    trimSh: '#8a6a2a',
    line: '#1a0d1e',
    mouth: '#5c1f2e',
    glow: f.glowEyes ? lightOf(eye, 0.15) : '#b98cff',
  };
}

// ---------------------------------------------------------------------------
// Signature characters
// ---------------------------------------------------------------------------

function specialSpec(spec: PortraitSpec): PortraitSpec {
  const sp = spec.special;
  const pal = spec.palette ?? {};
  switch (sp) {
    case 'elias':
    case 'elias_god':
      return { ...spec, race: 'humano', gender: 'm', age: 'adult', job: 'elias', palette: { hair: '#17121f', eyes: '#9b5cff', skin: '#f3e9ec', ...pal } };
    case 'aurel':
      return { ...spec, race: 'humano', gender: 'm', age: 'young', job: 'guerrero', mood: spec.mood ?? 'determined', palette: { hair: '#f2c85c', eyes: '#e8962a', skin: '#f6dcc4', outfit: '#3a3040', accent: '#d98c2a', ...pal } };
    case 'aurel_child':
      return { ...spec, race: 'humano', gender: 'm', age: 'child', job: 'campesino', palette: { hair: '#f2c85c', eyes: '#e8962a', skin: '#f7dfca', outfit: '#6a8a4a', accent: '#b8743a', ...pal } };
    case 'aurel_old':
      return { ...spec, race: 'humano', gender: 'm', age: 'adult', job: 'guerrero', palette: { hair: '#cdb378', eyes: '#c98a3a', skin: '#ecd0b8', outfit: '#3a3040', accent: '#9a6a3a', ...pal } };
    case 'mother':
      return { ...spec, race: 'humano', gender: 'f', age: 'adult', job: 'dress', mood: spec.mood ?? 'smile', palette: { hair: '#6b4430', eyes: '#7a8a4a', skin: '#f4d8c2', outfit: '#8a5a4a', accent: '#c8a878', ...pal } };
    case 'father':
      return { ...spec, race: 'humano', gender: 'm', age: 'adult', job: 'campesino', mood: spec.mood ?? 'smile', palette: { hair: '#5a3a26', eyes: '#7a5a3a', skin: '#e8c4a4', outfit: '#7a6a4a', accent: '#8a4a3a', ...pal } };
    case 'tiburcio':
      return { ...spec, race: 'duende', gender: 'm', age: 'adult', job: 'banquero', mood: spec.mood ?? 'smile', palette: { hair: '#232326', eyes: '#f2c83a', skin: '#8fb850', outfit: '#2f7a3a', accent: '#c8a13a', ...pal } };
    case 'fortuna':
      return { ...spec, race: 'sirena', gender: 'f', age: 'adult', job: 'cortesana', mood: spec.mood ?? 'smug', palette: { hair: '#2e9c98', eyes: '#f2b632', skin: '#f3e4e0', outfit: '#2a1a3a', accent: '#1f8a8a', ...pal } };
    case 'ione':
      return { ...spec, race: 'humano', gender: 'f', age: 'adult', job: 'delegado', palette: { hair: '#e2e3ea', eyes: '#5a86b8', skin: '#f5e0d0', outfit: '#f3efe6', accent: '#d9b36c', ...pal } };
    default:
      return spec;
  }
}

function applySpecialFeats(c: Ctx): void {
  const { f, g, p } = c;
  const sp = c.spec.special;
  if (!sp) return;
  const reset = (): void => {
    f.beard = 'none';
    f.freckles = false;
    f.earrings = false;
    f.glasses = false;
    f.monocle = false;
    f.cape = false;
    f.quiver = false;
    f.headwear = c.spec.hood ? 'hood' : 'none';
  };
  switch (sp) {
    case 'elias':
    case 'elias_god': {
      reset();
      f.hairBack = sp === 'elias_god' ? 'floating' : 'long';
      f.hairFront = 'parted';
      f.part = -0.22;
      f.hairTop = 'smooth';
      f.sideLen = 2;
      f.hairVol = 6;
      f.ahoge = false;
      f.streak = '#dfe3ee';
      f.eyeShape = 'sharp';
      f.eyeKind = sp === 'elias_god' ? 'glow' : 'ring';
      f.outfit = 'elias';
      f.smirk = true;
      f.aura = '#7b3cff';
      g.R -= 1;
      g.jawU = 0.75;
      g.chinY += 2;
      g.chinW = 1.5;
      p.hairHi = '#6b6a9a';
      p.glow = sp === 'elias_god' ? '#c9a4ff' : '#c49bff';
      p.accent = '#5b2a9a';
      if (sp === 'elias_god') {
        f.lightCracks = true;
        f.eclipseHalo = true;
        f.smirk = false;
      }
      break;
    }
    case 'aurel':
    case 'aurel_old': {
      reset();
      f.hairBack = 'nape';
      f.hairFront = 'spiky';
      f.hairTop = 'spiky';
      f.sideLen = 1;
      f.hairVol = 8;
      f.eyeShape = sp === 'aurel' ? 'round' : 'gentle';
      f.outfit = 'armor';
      f.scar = true;
      f.scarKind = 'nose';
      f.cape = true;
      p.metal = sp === 'aurel' ? '#eeeae2' : '#c9c2b4';
      p.trim = sp === 'aurel' ? '#e8b84a' : '#b0904a';
      p.trimSh = '#8a5e12';
      if (sp === 'aurel_old') {
        f.greyStreaks = true;
        f.beard = 'stubble';
        f.wrinkles = true;
        f.tired = true;
        f.lightCracks = false;
        f.hairVol = 5;
      }
      break;
    }
    case 'aurel_child': {
      reset();
      f.hairBack = 'nape';
      f.hairFront = 'messy';
      f.hairTop = 'spiky';
      f.sideLen = 1;
      f.hairVol = 7;
      f.ahoge = true;
      f.eyeShape = 'round';
      f.irisBoost = 1.08;
      f.outfit = 'peasant';
      break;
    }
    case 'mother': {
      reset();
      f.hairBack = 'lowbun';
      f.hairFront = 'curtain';
      f.part = 0.1;
      f.hairTop = 'smooth';
      f.sideLen = 2;
      f.eyeShape = 'gentle';
      f.outfit = 'dress';
      break;
    }
    case 'father': {
      reset();
      f.hairBack = 'short';
      f.hairFront = 'messy';
      f.hairTop = 'smooth';
      f.sideLen = 1;
      f.beard = 'short';
      f.eyeShape = 'gentle';
      f.outfit = 'peasant';
      break;
    }
    case 'tiburcio': {
      reset();
      f.headwear = 'tophat';
      f.hairFront = 'slick';
      f.hairBack = 'short';
      f.hairTop = 'smooth';
      f.monocle = true;
      f.goldTooth = true;
      f.earrings = true;
      f.outfit = 'banker';
      f.beard = 'none';
      break;
    }
    case 'fortuna': {
      reset();
      f.headwear = 'coinveil';
      f.hairBack = 'long';
      f.hairFront = 'curtain';
      f.sideLen = 3;
      f.eyeShape = 'cat';
      f.earrings = true;
      f.outfit = 'gown';
      f.fan = false;
      p.accent = '#4a2a7a';
      p.accentLine = '#1a0d2a';
      p.eye2 = '#57e0d4';
      p.trim = '#e8c15a';
      break;
    }
    case 'ione': {
      reset();
      f.hairBack = 'bun';
      f.hairFront = 'parted';
      f.part = 0.18;
      f.hairTop = 'smooth';
      f.sideLen = 2;
      f.eyeShape = 'gentle';
      f.outfit = 'council';
      p.hairHi = '#ffffff';
      break;
    }
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

function buildCtx(spec0: PortraitSpec): Ctx {
  const spec = specialSpec(spec0);
  const rng = makeRng(`${spec.seed}|${spec.special ?? ''}|${spec.race}`);
  const race = spec.race;
  const gr = rng.fork('gender');
  const bigMale = race === 'ogro' || race === 'gigante' || race === 'trol' || race === 'enano';
  const gender: Gender = spec.gender ?? (gr.chance(bigMale ? 0.7 : 0.5) ? 'm' : gr.chance(0.85) ? 'f' : 'x');
  const job = spec.job ?? '';
  const ageDefault: Age = bigMale || ['rey', 'reina', 'banquero', 'capitan', 'noble', 'delegado', 'tabernero'].includes(job) ? 'adult' : 'young';
  const age: Age = spec.age ?? ageDefault;
  const mood: PortraitMood = spec.mood ?? 'neutral';
  const g = makeGeo(race, gender, age);
  const f = makeFeats(spec, race, gender, age, job, rng);
  const p = makePalette(spec, race, f, rng, mood, age);
  const c: Ctx = { spec, race, job, gender, age, mood, rng, id: uid('p'), defs: [], g, p, f, facePath: '', faceId: '', hairShapes: [] };
  applySpecialFeats(c);
  if (f.glowEyes && !spec.special) p.glow = lightOf(p.eye, 0.15);
  return c;
}

function silhouetteFilter(c: Ctx): string {
  const id = `${c.id}sil`;
  c.defs.push(`<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%"><feFlood flood-color="#120a1c"/><feComposite in2="SourceAlpha" operator="in"/></filter>`);
  return id;
}

export function portraitSVG(spec: PortraitSpec, size = 256): string {
  if (spec.special === 'bruma') return brumaSVG(spec, size);
  if (spec.special === 'shadow') return shadowFigureSVG(spec, size);
  if (spec.special === 'narrador') return narratorSVG(spec, size);
  const c = buildCtx(spec);
  const { f } = c;
  c.facePath = buildFacePath(c.g);
  c.faceId = defShape(c, 'face', c.facePath);
  const front = buildFrontHair(c);
  c.hairShapes = front ? front.shapes : [];

  const layers: string[] = [];
  if (f.eclipseHalo) layers.push(drawEclipseHalo(c));
  else if (f.aura) layers.push(drawAura(c, f.aura, 0.34));
  if (c.mood === 'shadow') layers.push(drawAura(c, '#6a3ab0', 0.3, 'as'));

  const body: string[] = [];
  body.push(drawBackGear(c));
  body.push(drawBackHair(c));
  body.push(drawNeck(c));
  body.push(drawBody(c));
  body.push(drawBraids(c));
  body.push(drawHairDrapes(c));
  body.push(drawEars(c));
  body.push(drawFaceBase(c));
  const eyesId = `${c.id}eyes`;
  const eyes = c.mood !== 'shadow' ? `<g id="${eyesId}">${drawEyes(c)}</g>` : '';
  body.push(eyes);
  body.push(drawBeard(c));
  body.push(drawMouth(c));
  body.push(drawTusks(c));
  body.push(drawFaceAccessories(c));
  body.push(drawMask(c));
  body.push(drawBun(c));
  body.push(drawFrontHair(c, front));
  if (eyes && front && f.headwear !== 'helmet') {
    // anime "see-through bangs": eyes stay readable through the fringe
    const hc = `${c.id}hu`;
    c.defs.push(`<clipPath id="${hc}">${front.shapes.slice(1).map((id) => useRef(id)).join('')}</clipPath>`);
    body.push(`<g clip-path="url(#${hc})" opacity=".55">${useRef(eyesId)}</g>`);
  }
  body.push(drawBrows(c));
  body.push(drawHeadwear(c));
  body.push(drawHairTies(c));
  body.push(drawFrontGear(c));

  if (c.mood === 'shadow') {
    const fid = silhouetteFilter(c);
    layers.push(`<g filter="url(#${fid})">${body.join('')}</g>`);
    layers.push(drawEyes(c));
  } else {
    layers.push(body.join(''));
    layers.push(drawMoodOverlay(c));
    if (f.lightCracks) layers.push(drawLightCracks(c));
  }
  return compactSvg(`${svgOpen(size, 200, 200, ' stroke-linejoin="round" stroke-linecap="round"')}<defs>${c.defs.join('')}</defs>${layers.join('')}</svg>`);
}

/** Size optimisation: joins/caps are inherited from the root, path data spacing is tightened. */
function compactSvg(svg: string): string {
  const head = svg.indexOf('>') + 1;
  const root = svg.slice(0, head);
  const rest = svg
    .slice(head)
    .replace(/ stroke-linejoin="round"/g, '')
    .replace(/ stroke-linecap="round"/g, '')
    .replace(/ d="([^"]*)"/g, (_m, d: string) => ` d="${d.replace(/ -/g, '-').replace(/([A-Za-z]) /g, '$1')}"`);
  return root + rest;
}
