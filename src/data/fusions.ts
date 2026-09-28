/**
 * Fusión (GDD §4.3): combine two known abilities into a new one.
 * Canonical exports: FUSIONS (key "a+b", ids sorted → result ability id), fusionKey(), fuse().
 *
 * Named recipes come from abilities_fusion.ts (`fusionOf`). Any other pair goes through the deterministic
 * generic fuser: it builds a hybrid AbilityDef (id `fusion_<a>__<b>`, ids sorted), registers it into ABILITIES
 * at runtime and returns its id. Same inputs → same output, always (no randomness beyond string hashes).
 * Generated fusions cannot be fused again (their ids would become ambiguous); named ones can.
 */
import type { AbilityDef, AbilityKind, EffectSpec, Rarity, School, StatusId } from './types';
import { ABILITIES } from './abilities';
import { FUSION_ABILITIES } from './abilities_fusion';
import { RARITY_ORDER, SCHOOL_INFO, STATUS_INFO, rarityUp } from './schools';
import { hashString } from '../core/rng';

export function fusionKey(a: string, b: string): string { return [a, b].sort().join('+'); }

/** Named recipes: fusionKey(a, b) → result ability id. */
export const FUSIONS: Record<string, string> = Object.fromEntries(
  FUSION_ABILITIES.filter((f) => f.fusionOf).map((f) => [fusionKey(f.fusionOf![0], f.fusionOf![1]), f.id]),
);

/** Relic fusions done at La Forja Primigenia. */
export const RELIC_FUSIONS: Record<string, string> = { [fusionKey('daga_solar', 'daga_lunar')]: 'eclipse' };

export const GENERATED_PREFIX = 'fusion_';
export function generatedFusionId(a: string, b: string): string { const [x, y] = [a, b].sort(); return `${GENERATED_PREFIX}${x}__${y}`; }
export function isGeneratedFusion(id: string): boolean { return id.startsWith(GENERATED_PREFIX) && id.includes('__'); }

/** Parses `fusion_<a>__<b>` back into its parents (only for generated fusions). */
export function parseGeneratedFusion(id: string): [string, string] | null {
  if (!isGeneratedFusion(id)) return null;
  const body = id.slice(GENERATED_PREFIX.length);
  const i = body.indexOf('__');
  if (i <= 0) return null;
  return [body.slice(0, i), body.slice(i + 2)];
}

// ───────────────────────────── naming ─────────────────────────────

/** Evocative names per school pair (sorted "a+b"). */
const PAIR_NAMES: Record<string, string> = {
  'agua+arcano': 'Marea Arcana', 'agua+fisico': 'Resaca', 'agua+fuego': 'Géiser', 'agua+fuerza': 'Maremoto', 'agua+hielo': 'Mar Helado',
  'agua+luz': 'Reflejo del Alba', 'agua+mente': 'Canto de Sirena', 'agua+naturaleza': 'Manglar', 'agua+rayo': 'Tormenta Marina',
  'agua+sangre': 'Marea Roja', 'agua+sombra': 'Abismo', 'agua+suerte': 'Pesca Milagrosa', 'agua+tiempo': 'Marea Eterna',
  'agua+tierra': 'Lodo Voraz', 'agua+veneno': 'Ciénaga Negra',
  'arcano+fisico': 'Filo Arcano', 'arcano+fuego': 'Fuego Violeta', 'arcano+fuerza': 'Puño Rúnico', 'arcano+hielo': 'Escarcha Arcana',
  'arcano+luz': 'Estrella Fugaz', 'arcano+mente': 'Eco Mental', 'arcano+naturaleza': 'Bosque Encantado', 'arcano+rayo': 'Relámpago Violeta',
  'arcano+sangre': 'Hemomancia', 'arcano+sombra': 'El Vacío', 'arcano+suerte': 'Azar Arcano', 'arcano+tiempo': 'Paradoja',
  'arcano+tierra': 'Runa Viva', 'arcano+veneno': 'Miasma Arcano',
  'fisico+fuego': 'Filo Ardiente', 'fisico+fuerza': 'Golpe Brutal', 'fisico+hielo': 'Filo de Escarcha', 'fisico+luz': 'Espada del Alba',
  'fisico+mente': 'Golpe Hipnótico', 'fisico+naturaleza': 'Espina', 'fisico+rayo': 'Filo Tronante', 'fisico+sangre': 'Carnicería',
  'fisico+sombra': 'Puñal de Sombra', 'fisico+suerte': 'Golpe de Suerte', 'fisico+tiempo': 'Corte Eterno', 'fisico+tierra': 'Avalancha',
  'fisico+veneno': 'Filo Envenenado',
  'fuego+fuerza': 'Puño Volcánico', 'fuego+hielo': 'Vapor Hirviente', 'fuego+luz': 'Sol Naciente', 'fuego+mente': 'Delirio Ardiente',
  'fuego+naturaleza': 'Incendio Forestal', 'fuego+rayo': 'Tormenta de Fuego', 'fuego+sangre': 'Sangre Hirviente', 'fuego+sombra': 'Llama Negra',
  'fuego+suerte': 'Fuegos de Feria', 'fuego+tiempo': 'Ceniza Eterna', 'fuego+tierra': 'Magma', 'fuego+veneno': 'Humo Tóxico',
  'fuerza+hielo': 'Glaciar', 'fuerza+luz': 'Juicio', 'fuerza+mente': 'Voluntad de Hierro', 'fuerza+naturaleza': 'Furia del Bosque',
  'fuerza+rayo': 'Trueno', 'fuerza+sangre': 'Frenesí Titánico', 'fuerza+sombra': 'Mano Invisible', 'fuerza+suerte': 'Golpe de Gracia',
  'fuerza+tiempo': 'Impacto Eterno', 'fuerza+tierra': 'Terremoto', 'fuerza+veneno': 'Puño de Ortiga',
  'hielo+luz': 'Aurora Boreal', 'hielo+mente': 'Mente Helada', 'hielo+naturaleza': 'Invierno del Bosque', 'hielo+rayo': 'Tormenta de Cristal',
  'hielo+sangre': 'Sangre Fría', 'hielo+sombra': 'Noche Helada', 'hielo+suerte': 'Copo Afortunado', 'hielo+tiempo': 'Instante Congelado',
  'hielo+tierra': 'Permafrost', 'hielo+veneno': 'Escarcha Venenosa',
  'luz+mente': 'Revelación', 'luz+naturaleza': 'Primavera', 'luz+rayo': 'Relámpago Sagrado', 'luz+sangre': 'Martirio', 'luz+sombra': 'Crepúsculo',
  'luz+suerte': 'Estrella de la Suerte', 'luz+tiempo': 'Alba Eterna', 'luz+tierra': 'Cristal Solar', 'luz+veneno': 'Luz Enferma',
  'mente+naturaleza': 'Sueño del Bosque', 'mente+rayo': 'Descarga Mental', 'mente+sangre': 'Sed', 'mente+sombra': 'Pesadilla',
  'mente+suerte': 'Engaño', 'mente+tiempo': 'Recuerdo Ajeno', 'mente+tierra': 'Peso de la Culpa', 'mente+veneno': 'Locura',
  'naturaleza+rayo': 'Tormenta de Primavera', 'naturaleza+sangre': 'Raíz Sangrante', 'naturaleza+sombra': 'Bosque Maldito',
  'naturaleza+suerte': 'Trébol de Cuatro Hojas', 'naturaleza+tiempo': 'Las Estaciones', 'naturaleza+tierra': 'Montaña Viva',
  'naturaleza+veneno': 'Flor Carnívora',
  'rayo+sangre': 'Pulso Rojo', 'rayo+sombra': 'Relámpago Negro', 'rayo+suerte': 'Rayo Caprichoso', 'rayo+tiempo': 'Instante Eléctrico',
  'rayo+tierra': 'Tormenta Rúnica', 'rayo+veneno': 'Descarga Corrosiva',
  'sangre+sombra': 'Hambre Nocturna', 'sangre+suerte': 'Pacto del Tahúr', 'sangre+tiempo': 'Vida Robada', 'sangre+tierra': 'Barro Rojo',
  'sangre+veneno': 'Fiebre Negra',
  'sombra+suerte': 'Mala Suerte', 'sombra+tiempo': 'Olvido', 'sombra+tierra': 'La Tumba', 'sombra+veneno': 'Veneno de Medianoche',
  'suerte+tiempo': 'Segunda Oportunidad', 'suerte+tierra': 'Oro de Tontos', 'suerte+veneno': 'Copa Envenenada',
  'tiempo+tierra': 'Fósil', 'tiempo+veneno': 'Lenta Agonía', 'tierra+veneno': 'Pantano',
};

/** Same-school fusions. */
const SAME_NAMES: Record<School, string> = {
  agua: 'Diluvio', arcano: 'Arcano Mayor', fisico: 'Tormenta de Acero', fuego: 'Infierno', fuerza: 'Fuerza Bruta', hielo: 'Invierno Eterno',
  luz: 'Luz Cegadora', mente: 'Mente Colmena', naturaleza: 'Selva Voraz', rayo: 'Tempestad', sangre: 'Río de Sangre', sombra: 'Noche Absoluta',
  suerte: 'Doble o Nada', tiempo: 'El Bucle', tierra: 'Cataclismo', veneno: 'La Peste',
};

/** Used when two generated fusions of the same schools would share a name. */
const KIND_NOUN: Partial<Record<AbilityKind, string>> = {
  projectile: 'Orbe', aoe: 'Estallido', cone: 'Aliento', beam: 'Haz', dash: 'Embestida', blink: 'Paso', buff: 'Manto', debuff: 'Marca',
  summon: 'Legión', aura: 'Aura', channel: 'Torrente', melee: 'Golpe', trap: 'Trampa',
};

const KIND_PHRASE: Partial<Record<AbilityKind, string>> = {
  projectile: 'Un proyectil que vuela hacia el objetivo', aoe: 'Un estallido que golpea toda un área', cone: 'Una ráfaga en cono frente a ti',
  beam: 'Un haz que atraviesa en línea recta', dash: 'Una embestida que arrolla todo a su paso', blink: 'Un salto instantáneo que golpea al llegar',
  buff: 'Un manto que te envuelve', debuff: 'Una marca que se clava en el enemigo', summon: 'Una invocación que pelea a tu lado',
  aura: 'Un aura que te rodea', channel: 'Un torrente sostenido', melee: 'Un golpe cuerpo a cuerpo', trap: 'Una trampa que espera a su víctima',
};

const FLAVORS = [
  'No existía hasta que la necesitaste.',
  'El Libro del Aprendizaje no la conocía. Ahora sí.',
  'Dos reglas rotas hacen una regla nueva.',
  'Nadie la había intentado. Nadie había sobrevivido a lo suficiente.',
  'Página nueva. Tinta tuya.',
  'Una excepción de otra excepción.',
  'Los magos de Altamira la llamarán imposible. En voz baja.',
  'Suena como dos hechizos discutiendo. Gana el enemigo que no está.',
];

// ───────────────────────────── merge rules ─────────────────────────────

const KIND_ORDER: AbilityKind[] = ['summon', 'trap', 'blink', 'dash', 'beam', 'cone', 'aoe', 'projectile', 'channel', 'melee', 'aura', 'debuff', 'buff'];
const NON_EXECUTABLE: AbilityKind[] = ['passive', 'transform', 'special'];

function mergeKind(ka: AbilityKind, kb: AbilityKind): AbilityKind {
  const a = NON_EXECUTABLE.includes(ka) ? null : ka;
  const b = NON_EXECUTABLE.includes(kb) ? null : kb;
  if (!a && !b) return 'aoe';
  if (!a) return b!;
  if (!b) return a;
  if (a === b) return a;
  const set = new Set([a, b]);
  if (set.has('buff') && set.has('debuff')) return 'aura';
  if (set.has('projectile') && set.has('aoe')) return 'projectile';
  return KIND_ORDER.find((k) => set.has(k)) ?? a;
}

function targetFor(kind: AbilityKind, a: AbilityDef, b: AbilityDef): AbilityDef['target'] {
  switch (kind) {
    case 'summon': return a.kind === 'summon' ? a.target : b.kind === 'summon' ? b.target : 'self';
    case 'trap': case 'blink': return 'ground';
    case 'dash': case 'beam': case 'cone': case 'projectile': case 'channel': return 'direction';
    case 'aoe': return a.kind === 'aoe' ? a.target : b.kind === 'aoe' ? b.target : 'self';
    case 'melee': case 'debuff': return 'enemy';
    default: return 'self';
  }
}

/** When a blessing is fused into an attack it turns into a curse for the enemy (and vice versa). */
const INVERT_GOOD_TO_BAD: Partial<Record<StatusId, EffectSpec>> = {
  invisible: { status: 'ceguera', duration: 2 }, escudo: { status: 'maldicion', duration: 5, magnitude: 0.25 },
  prisa: { status: 'lento', duration: 3, magnitude: 0.35 }, furia: { status: 'marcado', duration: 5, magnitude: 0.2 },
  regeneracion: { status: 'veneno', duration: 5, magnitude: 6 }, inmortal: { status: 'aturdido', duration: 1 },
  robo_vida: { heal: 20 },
};
const INVERT_BAD_TO_GOOD: Partial<Record<StatusId, EffectSpec>> = {
  quemadura: { status: 'furia', duration: 6, magnitude: 0.25 }, congelado: { status: 'escudo', duration: 5, magnitude: 0.35 },
  lento: { status: 'prisa', duration: 5, magnitude: 0.3 }, aturdido: { status: 'escudo', duration: 4, magnitude: 0.3 },
  veneno: { status: 'regeneracion', duration: 6, magnitude: 5 }, encanto: { status: 'invisible', duration: 3 },
  mente: { status: 'furia', duration: 6, magnitude: 0.3 }, miedo: { status: 'furia', duration: 6, magnitude: 0.25 },
  sapo: { status: 'regeneracion', duration: 6, magnitude: 4 }, ceguera: { status: 'invisible', duration: 3 },
  silencio: { status: 'escudo', duration: 5, magnitude: 0.3 }, raiz: { status: 'escudo', duration: 5, magnitude: 0.3 },
  maldicion: { status: 'escudo', duration: 5, magnitude: 0.3 }, sangrado: { status: 'robo_vida', duration: 6, magnitude: 0.2 },
  marcado: { status: 'furia', duration: 6, magnitude: 0.25 }, traicion: { status: 'furia', duration: 6, magnitude: 0.35 },
  provocar: { status: 'escudo', duration: 5, magnitude: 0.3 },
};
const SELF_KINDS: AbilityKind[] = ['buff'];
const MIXED_KINDS: AbilityKind[] = ['aura', 'summon'];

function mergeEffects(kind: AbilityKind, a: EffectSpec[] = [], b: EffectSpec[] = []): EffectSpec[] {
  const polarity: 'bad' | 'good' | 'mixed' = SELF_KINDS.includes(kind) ? 'good' : MIXED_KINDS.includes(kind) ? 'mixed' : 'bad';
  const input: EffectSpec[] = [];
  for (const e of [...a, ...b]) {
    if (!e.status || polarity === 'mixed') { input.push(e); continue; }
    const good = STATUS_INFO[e.status]?.good ?? false;
    if (polarity === 'bad' && good) { const inv = INVERT_GOOD_TO_BAD[e.status]; if (inv) input.push({ ...inv }); continue; }
    if (polarity === 'good' && !good) { const inv = INVERT_BAD_TO_GOOD[e.status]; if (inv) input.push({ ...inv }); continue; }
    input.push(e);
  }
  const out: EffectSpec[] = [];
  const byStatus = new Map<string, EffectSpec>();
  let knock = 0, pull = 0, heal = 0, dmg = 0;
  for (const e of input) {
    if (e.status) {
      const prev = byStatus.get(e.status);
      if (!prev) byStatus.set(e.status, { ...e });
      else byStatus.set(e.status, {
        ...prev,
        duration: Math.max(prev.duration ?? 0, e.duration ?? 0) || undefined,
        magnitude: prev.magnitude !== undefined || e.magnitude !== undefined ? Math.max(prev.magnitude ?? 0, e.magnitude ?? 0) : undefined,
        chance: Math.min(1, Math.max(prev.chance ?? 1, e.chance ?? 1)),
      });
      continue;
    }
    knock = Math.max(knock, e.knockback ?? 0);
    pull = Math.max(pull, e.pull ?? 0);
    heal += e.heal ?? 0;
    dmg = Math.max(dmg, e.damage ?? 0);
  }
  out.push(...byStatus.values());
  if (knock && polarity !== 'good') out.push({ knockback: Math.round(knock * 1.15) });
  if (pull && polarity !== 'good') out.push({ pull });
  if (heal) out.push({ heal: Math.round(heal * 0.8) });
  if (dmg && polarity !== 'good') out.push({ damage: dmg, chance: 0.5 });
  return out;
}

/** Minimum mana / cooldown / power by result rarity (passive parents have none of these). */
const MIN_MANA: Record<Rarity, number> = { comun: 6, pococomun: 8, rara: 14, epica: 22, legendaria: 32, mitica: 45 };
const MIN_CD: Record<Rarity, number> = { comun: 2, pococomun: 3, rara: 5, epica: 8, legendaria: 12, mitica: 18 };
const MIN_POWER: Record<Rarity, number> = { comun: 20, pococomun: 26, rara: 40, epica: 60, legendaria: 90, mitica: 140 };

function blendHex(c1 = '#9b5cff', c2 = '#9b5cff'): string {
  const p = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) || 0);
  const [a, b] = [p(c1), p(c2)];
  return '#' + a.map((v, i) => Math.round((v + b[i]) / 2).toString(16).padStart(2, '0')).join('');
}

const avg = (x = 0, y = 0) => (x + y) / 2;
const maxOpt = (x?: number, y?: number) => (x === undefined && y === undefined ? undefined : Math.max(x ?? 0, y ?? 0));

function describeEffects(effects: EffectSpec[]): string {
  const bits: string[] = [];
  for (const e of effects) {
    if (e.status) bits.push(STATUS_INFO[e.status]?.name.toLowerCase() ?? e.status);
    else if (e.knockback) bits.push('empuje');
    else if (e.pull) bits.push('atracción');
    else if (e.heal) bits.push('te cura');
    else if (e.damage) bits.push('daño extra al azar');
  }
  if (!bits.length) return '';
  const last = bits.pop();
  return bits.length ? `${bits.join(', ')} y ${last}` : last!;
}

function pairName(sa: School, sb: School): string {
  if (sa === sb) return SAME_NAMES[sa];
  return PAIR_NAMES[[sa, sb].sort().join('+')] ?? `${SCHOOL_INFO[sa].name} ${SCHOOL_INFO[sb].name}`;
}

/** Builds (without registering) the generic hybrid for a pair. Null if not fusable. */
export function buildGenericFusion(aId: string, bId: string): AbilityDef | null {
  if (aId === bId) return null;
  const a = ABILITIES[aId], b = ABILITIES[bId];
  if (!a || !b) return null;
  if (isGeneratedFusion(aId) || isGeneratedFusion(bId)) return null;
  const [x, y] = [a, b].sort((p, q) => (p.id < q.id ? -1 : 1));
  const id = generatedFusionId(x.id, y.id);
  const h = hashString(id);
  // primary = rarer, then stronger, then alphabetical (deterministic)
  const ri = (r: Rarity) => RARITY_ORDER.indexOf(r);
  const [primary, secondary] = [x, y].sort((p, q) => ri(q.rarity) - ri(p.rarity) || q.power - p.power || (p.id < q.id ? -1 : 1));
  const kind = mergeKind(primary.kind, secondary.kind);
  const target = targetFor(kind, primary, secondary);
  const rarity = rarityUp(ri(x.rarity) >= ri(y.rarity) ? x.rarity : y.rarity);
  const offensive = !['buff', 'aura'].includes(kind);
  // 1.35 × the average of the parents that actually hit (a pure buff parent adds its effects, not a zero)
  const hitters = [x.power, y.power].filter((p) => p > 0);
  const basePow = hitters.length ? hitters.reduce((s, p) => s + p, 0) / hitters.length : 0;
  const power = offensive ? Math.round(Math.max(MIN_POWER[rarity] * 0.6, 1.35 * basePow)) : Math.round(1.35 * basePow);
  const effects = mergeEffects(kind, x.effects, y.effects);
  const baseName = pairName(primary.school, secondary.school);
  const clash = Object.values(ABILITIES).some((o) => o.id !== id && o.name === baseName);
  const name = clash ? `${KIND_NOUN[kind] ?? 'Eco'} de ${baseName}` : baseName;
  let radius = maxOpt(x.radius, y.radius);
  if (kind === 'projectile' && (x.kind === 'aoe' || y.kind === 'aoe')) radius = Math.max(radius ?? 0, 3);
  if ((kind === 'aoe' || kind === 'aura') && !radius) radius = 5;
  let range = maxOpt(x.range, y.range);
  if (['projectile', 'beam', 'blink', 'trap', 'debuff'].includes(kind) && !range) range = 16;
  if (target === 'ground' && !range) range = 16;
  const effTxt = describeEffects(effects);
  const def: AbilityDef = {
    id, name,
    desc: `${KIND_PHRASE[kind] ?? 'Un poder nuevo'}. Nace de ${x.name} y ${y.name}.${effTxt ? ` Efectos: ${effTxt}.` : ''}`,
    flavor: FLAVORS[h % FLAVORS.length],
    school: primary.school,
    rarity,
    source: { book: 'aprendizaje' },
    comprehension: 0,
    kind, target,
    mana: Math.max(MIN_MANA[rarity], Math.round(avg(x.mana, y.mana))),
    cooldown: Math.max(MIN_CD[rarity], Math.round(avg(x.cooldown, y.cooldown) * 10) / 10),
    castTime: maxOpt(x.castTime, y.castTime),
    power,
    range, radius,
    duration: maxOpt(x.duration, y.duration),
    speed: maxOpt(x.speed, y.speed) ?? (kind === 'projectile' ? 22 : undefined),
    count: maxOpt(x.count, y.count),
    effects,
    tags: [...new Set([...x.tags, ...y.tags])],
    color: blendHex(x.color, y.color),
    vfx: primary.vfx ?? secondary.vfx,
    sfx: primary.sfx ?? secondary.sfx,
    world: [...new Set([...(x.world ?? []), ...(y.world ?? [])])],
    fusionOf: [x.id, y.id],
    ultimate: x.ultimate || y.ultimate || undefined,
  };
  if (kind === 'summon' && def.count === undefined) def.count = 2;
  if (kind === 'summon' && def.duration === undefined) def.duration = 15;
  return def;
}

/**
 * Returns the resulting ability id (named recipe or generated + registered into ABILITIES), or null if not fusable.
 * Deterministic: fuse(a, b) === fuse(b, a).
 */
export function fuse(a: string, b: string): string | null {
  const named = FUSIONS[fusionKey(a, b)];
  if (named) return named;
  const id = generatedFusionId(a, b);
  if (ABILITIES[id]) return id;
  const def = buildGenericFusion(a, b);
  if (!def) return null;
  ABILITIES[id] = def;
  return id;
}

/** Preview the result without registering it (UI). */
export function fusionPreview(a: string, b: string): AbilityDef | null {
  const named = FUSIONS[fusionKey(a, b)];
  if (named) return ABILITIES[named] ?? null;
  const id = generatedFusionId(a, b);
  return ABILITIES[id] ?? buildGenericFusion(a, b);
}

/** Looks up an ability, re-generating generic fusions from their id if needed (after loading a save). */
export function resolveAbility(id: string): AbilityDef | undefined {
  if (ABILITIES[id]) return ABILITIES[id];
  const parents = parseGeneratedFusion(id);
  if (!parents) return undefined;
  const got = fuse(parents[0], parents[1]);
  return got ? ABILITIES[got] : undefined;
}

/** Essence cost of a fusion by result rarity (Libro del Aprendizaje). The Academia charges ×2 plus gold without the book. */
export const FUSION_COST: Record<Rarity, number> = { comun: 20, pococomun: 30, rara: 50, epica: 90, legendaria: 150, mitica: 260 };
