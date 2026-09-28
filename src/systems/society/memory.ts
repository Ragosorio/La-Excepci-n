/**
 * NPC memory (GDD §4.6): feelings (miedo, odio, deuda, respeto 0..100) + memories (what, where, which luna, intensity).
 * Canonical NPCs come from data/npcs.ts (with a built-in fallback while content is being written);
 * generated nemeses live in G.run.npcs too, with extra metadata in the society slice.
 */
import { G, type RunState } from '../../core/state';
import { bus } from '../../core/events';
import { NPCS } from '../../data/npcs';
import type { FactionId, JobId, NpcDef, NpcMemory, NpcState, RaceId, TraitId } from '../../data/types';
import type { PortraitMood, PortraitSpec, PortraitSpecial } from '../../ui/art/portraits';
import { clamp100, ensureLocation, luna, soc } from './state';
import type { Feelings, NpcView } from './types';

type Fallback = Omit<NpcDef, 'id' | 'bio'> & { bio?: string };

/** Minimal canonical data so every society feature works before/without data/npcs.ts. NPCS always wins. */
export const NPC_FALLBACK: Record<string, Fallback> = {
  isolde_varn: { name: 'Isolde Varn', title: 'Reina de Valdoria', race: 'humano', job: 'reina', gender: 'f', age: 'adult', faction: 'valdoria', home: 'corona_varn', traits: ['ambicioso', 'paranoico'], role: 'gobernante', voice: 'noble', portrait: { crown: true } },
  galvan: { name: 'Sir Galvan Brisaclara', title: 'Mariscal de los Juramentados', race: 'caballero', job: 'guerrero', gender: 'm', age: 'adult', faction: 'valdoria', home: 'fortaleza_juramento', traits: ['honorable', 'valiente', 'orgulloso'], role: 'delegado', voice: 'noble' },
  mirelle: { name: 'Viuda Mirelle', title: 'Señora de la Casa de las Sedas', race: 'humano', job: 'cortesana', gender: 'f', age: 'adult', faction: 'sedas', home: 'callejones_ceniza', traits: ['curioso', 'ambicioso'], role: 'informante', voice: 'elegante' },
  tobias: { name: 'Tobías Sinllave', title: 'Maestro del Gremio de la Ceniza', race: 'picaro', job: 'ladron', gender: 'm', age: 'adult', faction: 'ceniza', home: 'callejones_ceniza', traits: ['codicioso', 'jugador', 'leal'], role: 'jefe', voice: 'callejero' },
  anselmo: { name: 'Anselmo de Grisal', title: 'Canciller de la Corona', race: 'humano', job: 'noble', gender: 'm', age: 'old', faction: 'valdoria', home: 'corona_varn', traits: ['ambicioso', 'cobarde', 'codicioso'], role: 'informante', voice: 'burocrata' },
  berta_molinera: { name: 'Berta la Molinera', race: 'humano', job: 'campesino', gender: 'f', age: 'adult', faction: 'valdoria', home: 'vado_trigo', traits: ['valiente', 'curioso'], role: 'mercader', voice: 'campechano' },
  elowen: { name: 'Elowen Aelthar', title: 'Suma Sacerdotisa de Sylvaria', race: 'elfo', job: 'sacerdote', gender: 'f', age: 'adult', faction: 'sylvaria', home: 'lumen', traits: ['piadoso', 'cruel', 'sabio'], role: 'gobernante', voice: 'arcaico' },
  thalion: { name: 'Thalion Hojaplata', title: 'Delegado de Sylvaria', race: 'elfo', job: 'arquero', gender: 'm', age: 'adult', faction: 'sylvaria', home: 'lumen', traits: ['orgulloso', 'honorable'], role: 'delegado', voice: 'altivo' },
  liria: { name: 'Liria', title: 'Herbolaria del Claro', race: 'elfo', job: 'curandero', gender: 'f', age: 'young', faction: 'sylvaria', home: 'claro_luciernagas', traits: ['piadoso', 'curioso'], role: 'mercader', voice: 'dulce' },
  mara_colmenas: { name: 'Mara', title: 'de Las Colmenas', race: 'humano', job: 'campesino', gender: 'f', age: 'old', faction: 'sylvaria', home: 'aldea_colmenas', traits: ['piadoso', 'leal'], role: 'familia', voice: 'maternal', portrait: { special: 'mother' } },
  tomas_colmenas: { name: 'Tomás', title: 'de Las Colmenas', race: 'humano', job: 'campesino', gender: 'm', age: 'old', faction: 'sylvaria', home: 'aldea_colmenas', traits: ['leal', 'valiente'], role: 'familia', voice: 'paternal', portrait: { special: 'father' } },
  thrain: { name: 'Thrain Martillohondo', title: 'Rey de Kharaz', race: 'enano', job: 'rey', gender: 'm', age: 'old', faction: 'kharaz', home: 'kharaz_dum', traits: ['codicioso', 'orgulloso'], role: 'gobernante', voice: 'gruñon', portrait: { crown: true } },
  ymra: { name: 'Ymra', title: 'la Colina que Anda', race: 'gigante', job: 'delegado', gender: 'f', age: 'old', faction: 'kharaz', home: 'escalon_gigantes', traits: ['sabio', 'leal'], role: 'delegado', voice: 'lento' },
  grub: { name: 'Grub', title: 'Jefe de Tragapiedras', race: 'ogro', job: 'guerrero', gender: 'm', age: 'adult', faction: 'kharaz', home: 'tragapiedras', traits: ['valiente', 'borracho'], role: 'jefe', voice: 'ogro' },
  hilda: { name: 'Hilda', title: 'Maestra del Yunque', race: 'enano', job: 'herrero', gender: 'f', age: 'adult', faction: 'yunque', home: 'kharaz_dum', traits: ['honorable', 'codicioso'], role: 'mercader', voice: 'rudo' },
  morgaine: { name: 'Madre Morgaine Tresojos', title: 'Señora de Morvenna', race: 'bruja', job: 'chaman', gender: 'f', age: 'old', faction: 'morvenna', home: 'aquelarre', traits: ['sabio', 'supersticioso'], role: 'gobernante', voice: 'profetico', portrait: { glowEyes: true } },
  cassius: { name: 'Archimago Cassius Vellum', title: 'Director de la Academia', race: 'mago', job: 'hechicero', gender: 'm', age: 'adult', faction: 'morvenna', home: 'altamira', traits: ['orgulloso', 'ambicioso', 'codicioso'], role: 'delegado', voice: 'pomposo' },
  nimue: { name: 'Nimue', title: 'Estudiante de Altamira', race: 'mago', job: 'estudiante', gender: 'f', age: 'young', faction: 'academia', home: 'altamira', traits: ['curioso', 'ambicioso', 'valiente'], role: 'informante', voice: 'nerd' },
  jabu: { name: 'Jabu el Paciente', title: 'Jefe de la Ciénaga', race: 'trol', job: 'chaman', gender: 'm', age: 'old', faction: 'morvenna', home: 'cienaga_trol', traits: ['sabio', 'vengativo'], role: 'jefe', voice: 'paciente' },
  tiburcio: { name: 'Don Tiburcio Faroles', title: 'Gran Banquero de las Islas', race: 'duende', job: 'banquero', gender: 'm', age: 'adult', faction: 'islas', home: 'puerto_fortuna', traits: ['codicioso', 'jugador'], role: 'gobernante', voice: 'chapin', portrait: { special: 'tiburcio' } },
  fortuna: { name: 'Madame Fortuna', title: 'Delegada de las Islas', race: 'sirena', job: 'crupier', gender: 'f', age: 'adult', faction: 'islas', home: 'puerto_fortuna', traits: ['jugador', 'sabio'], role: 'delegado', voice: 'misterioso', portrait: { special: 'fortuna' } },
  rhea: { name: 'Capitana Rhea Sal', title: 'Reina de la Cala', race: 'humano', job: 'pirata', gender: 'f', age: 'adult', faction: 'islas', home: 'cala_contrabandistas', traits: ['valiente', 'codicioso'], role: 'rival', voice: 'marinero' },
  coralina: { name: 'Coralina', title: 'La Sirena del Faro', race: 'sirena', job: 'bardo', gender: 'f', age: 'young', faction: 'islas', home: 'faro_sirenas', traits: ['curioso', 'supersticioso'], role: 'informante', voice: 'cantarin' },
  ione: { name: 'Ione Salvaterra', title: 'Custodia del Concilio', race: 'humano', job: 'delegado', gender: 'f', age: 'adult', faction: 'concilio', home: 'concordia', traits: ['honorable', 'piadoso'], role: 'custodia', voice: 'idealista', portrait: { special: 'ione' } },
  aurel: { name: 'Aurel', title: 'Portador del Alba', race: 'humano', job: 'guerrero', gender: 'm', age: 'young', faction: 'concilio', home: 'concordia', traits: ['valiente', 'honorable', 'leal'], role: 'heroe', voice: 'heroico', portrait: { special: 'aurel' } },
  bruma: { name: 'Bruma', race: 'humano', job: 'campesino', gender: 'f', age: 'old', faction: 'concilio', home: 'concordia', traits: [], role: 'familia', voice: 'perro', portrait: { special: 'bruma' } },
};

const SPECIALS: PortraitSpecial[] = ['elias', 'elias_god', 'aurel', 'aurel_child', 'aurel_old', 'bruma', 'shadow', 'mother', 'father', 'tiburcio', 'fortuna', 'ione', 'narrador'];

export function npcDef(id: string): (Fallback & { id: string }) | undefined {
  const d = NPCS[id];
  if (d) return { ...(NPC_FALLBACK[id] ?? {}), ...d };
  const f = NPC_FALLBACK[id];
  return f ? { id, ...f } : undefined;
}

export function canonicalIds(): string[] {
  return [...new Set([...Object.keys(NPC_FALLBACK), ...Object.keys(NPCS)])];
}

export function npcState(id: string): NpcState | undefined {
  const run = G.run;
  if (!run) return undefined;
  let st = run.npcs[id];
  if (!st) {
    const d = npcDef(id);
    if (!d) return undefined;
    st = newNpcState(id, d.home, d.traits);
    run.npcs[id] = st;
  }
  return st;
}

function newNpcState(id: string, home: string, traits: TraitId[]): NpcState {
  const odio = (traits.includes('piadoso') ? 8 : 0) + (traits.includes('honorable') ? 6 : 0);
  return { id, alive: true, location: home, feelings: { miedo: 0, odio, deuda: 0, respeto: traits.includes('curioso') ? 6 : 0 }, memories: [], met: false };
}

/** Unified identity view (canonical or generated). */
export function npcView(id: string): NpcView | null {
  const d = npcDef(id);
  if (d) {
    return {
      id, name: d.name, title: d.title, race: d.race, job: d.job, gender: d.gender, age: d.age, faction: d.faction, home: d.home,
      traits: d.traits ?? [], voice: d.voice ?? 'neutral', role: d.role, combatUnit: d.combat?.unitId, generated: false, canonical: true,
    };
  }
  const st = G.run?.npcs[id];
  if (st?.generated) {
    const s = soc();
    const meta = s.nemesis[id];
    const g = st.generated;
    const del = s.council.replacements?.[id];
    return {
      id, name: g.name, title: g.titleText, race: g.race, job: g.job, gender: meta?.gender ?? del?.gender ?? 'm', age: 'adult',
      faction: meta?.faction ?? del?.continent ?? 'concilio', home: meta?.home ?? st.location, traits: g.traits, voice: g.race === 'duende' ? 'chapin' : 'rudo',
      role: del ? 'delegado' : 'rival', combatUnit: meta?.unitId, generated: true, canonical: false,
    };
  }
  return null;
}

export function displayName(id: string): string {
  const v = npcView(id);
  return v ? v.name : 'Alguien';
}

// ───────────────────────────── init ─────────────────────────────

/** onRunInit('npcs', 10): place every canonical NPC at home; cycle 2+: déjà-vu echoes. */
export function initNpcs(run: RunState): void {
  for (const id of canonicalIds()) {
    const d = npcDef(id);
    if (!d || run.npcs[id]) continue;
    run.npcs[id] = newNpcState(id, d.home, d.traits ?? []);
    const loc = run.locations[d.home] ?? ensureLocation(d.home);
    if (loc && !loc.npcsHere.includes(id)) loc.npcsHere.push(id);
  }
  if (run.cycle >= 2) applyEchoes(run);
}

function applyEchoes(run: RunState): void {
  const echoes = G.meta?.npcEchoes ?? {};
  for (const [id, e] of Object.entries(echoes)) {
    const st = run.npcs[id];
    if (!st || !e) continue;
    const feelingKey = (['miedo', 'odio', 'deuda', 'respeto'] as const).find((k) => e.feeling === k);
    if (feelingKey) st.feelings[feelingKey] = clamp100(st.feelings[feelingKey] + 15);
    st.memories.push({ kind: 'eco', text: e.memory || 'Algo que no pasó en esta vida', luna: -1, intensity: 3 });
  }
}

// ───────────────────────────── memory & feelings ─────────────────────────────

/** Adds a memory (luna stamped). Keeps the 12 most intense; intensity ≥ 9 never fades. */
export function remember(npcId: string, m: Omit<NpcMemory, 'luna'>): void {
  const st = npcState(npcId);
  if (!st) return;
  st.memories.push({ ...m, luna: luna(), intensity: Math.max(1, Math.min(10, m.intensity)) });
  if (st.memories.length > 12) {
    let k = -1;
    st.memories.forEach((x, i) => { if (x.intensity < 9 && (k < 0 || x.intensity < st.memories[k].intensity)) k = i; });
    st.memories.splice(k >= 0 ? k : 0, 1);
  }
}

export function feel(npcId: string, d: Partial<Feelings>): void {
  const st = npcState(npcId);
  if (!st) return;
  const f = st.feelings;
  if (d.miedo) f.miedo = clamp100(f.miedo + d.miedo);
  if (d.odio) f.odio = clamp100(f.odio + d.odio);
  if (d.deuda) f.deuda = clamp100(f.deuda + d.deuda);
  if (d.respeto) f.respeto = clamp100(f.respeto + d.respeto);
}

export function hasMemory(npcId: string, kind: string): boolean {
  return !!npcState(npcId)?.memories.some((m) => m.kind === kind);
}

/** Most salient memory (intensity, then recency), optionally filtered by kinds. */
export function topMemory(npcId: string, kinds?: string[]): NpcMemory | undefined {
  const st = G.run?.npcs[npcId];
  if (!st) return undefined;
  const list = st.memories.filter((m) => !kinds || kinds.includes(m.kind));
  return list.sort((a, b) => b.intensity - a.intensity || b.luna - a.luna)[0];
}

/** NPC ids physically present at a location right now (NpcState.location is authoritative). */
export function npcsAt(locationId: string): string[] {
  const run = G.run;
  if (!run) return [];
  const out = new Set<string>();
  for (const st of Object.values(run.npcs)) {
    if (st.alive && st.location === locationId && !soc().nemesis[st.id]?.fallen) out.add(st.id);
  }
  for (const id of run.locations[locationId]?.npcsHere ?? []) {
    const st = run.npcs[id];
    if (!st) { if (npcDef(id)) out.add(id); }
  }
  return [...out];
}

export function moveNpc(id: string, to: string): void {
  const st = npcState(id);
  if (!st) return;
  const from = G.run.locations[st.location];
  if (from) from.npcsHere = from.npcsHere.filter((x) => x !== id);
  st.location = to;
  const loc = ensureLocation(to);
  if (loc && !loc.npcsHere.includes(id)) loc.npcsHere.push(id);
}

export function killNpc(id: string, by: string): void {
  const st = npcState(id);
  if (!st || !st.alive) return;
  st.alive = false;
  const loc = G.run.locations[st.location];
  if (loc) loc.npcsHere = loc.npcsHere.filter((x) => x !== id);
  bus.emit('npc:died', { npcId: id, by });
}

export function makeLoyal(id: string, how: 'dominado' | 'reescrito' | 'convencido' = 'dominado'): void {
  const st = npcState(id);
  if (!st) return;
  if (!st.loyal) {
    st.loyal = true;
    st.feelings.respeto = Math.max(st.feelings.respeto, 70);
    st.feelings.odio = Math.min(st.feelings.odio, how === 'dominado' ? st.feelings.odio : 0);
    bus.emit('npc:loyal', { npcId: id });
  }
}

// ───────────────────────────── portraits & mood ─────────────────────────────

export function moodFor(id: string): PortraitMood {
  const st = G.run?.npcs[id];
  const v = npcView(id);
  if (!st || !v) return 'neutral';
  if (!st.alive) return 'dead';
  if (st.loyal && st.memories.some((m) => m.kind === 'dominado')) return 'mind';
  const f = st.feelings;
  if (f.miedo >= 60 && f.miedo >= f.odio) return 'scared';
  if (f.odio >= 55) return 'angry';
  if (f.respeto >= 60 || f.deuda >= 50 || st.loyal) return 'smile';
  if (st.memories.some((m) => m.kind === 'familiar_muerto' && m.intensity >= 6)) return 'sad';
  if (f.miedo >= 35) return 'scared';
  if (f.odio >= 30) return 'angry';
  if (v.traits.includes('codicioso') || v.traits.includes('orgulloso') || v.traits.includes('jugador')) return 'smug';
  if (v.traits.includes('valiente') || v.traits.includes('honorable')) return 'determined';
  return 'neutral';
}

export function portraitFor(id: string, mood?: PortraitMood): PortraitSpec {
  const v = npcView(id);
  const st = G.run?.npcs[id];
  const d = npcDef(id);
  const p = d?.portrait;
  const special = p?.special && (SPECIALS as string[]).includes(p.special) ? (p.special as PortraitSpecial) : undefined;
  const pal = p?.palette ?? {};
  return {
    seed: st?.generated?.seed ?? id,
    race: (v?.race ?? 'humano') as PortraitSpec['race'],
    job: v?.job,
    gender: v?.gender,
    age: v?.age,
    mood: mood ?? moodFor(id),
    palette: { hair: pal.hair, eyes: pal.eyes, skin: pal.skin, outfit: pal.outfit, accent: pal.accent },
    special,
    scar: !!p?.scar || (st?.generated?.scars ?? 0) > 0,
    eyepatch: !!p?.eyepatch || (st?.generated?.scars ?? 0) >= 3,
    crown: !!p?.crown,
    hood: !!p?.hood,
    glowEyes: !!p?.glowEyes || (!!st?.loyal && st.memories.some((m) => m.kind === 'dominado')),
  };
}

export function eliasPortrait(mood: PortraitMood = 'smug'): PortraitSpec {
  const god = (G.run?.player.titleIndex ?? 0) >= 5;
  return { seed: 'elias', race: 'excepcion', special: god ? 'elias_god' : 'elias', mood, glowEyes: mood === 'angry' };
}

/** Faction-ish helpers for NPC relations. */
export function npcFaction(id: string): FactionId { return npcView(id)?.faction ?? 'concilio'; }
export function npcRace(id: string): RaceId { return npcView(id)?.race ?? 'humano'; }
export function npcJob(id: string): JobId { return npcView(id)?.job ?? 'campesino'; }
export function hasTrait(id: string, t: TraitId): boolean { return !!npcView(id)?.traits.includes(t); }
