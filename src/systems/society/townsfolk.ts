/**
 * Generic townsfolk: talkTo('townsfolk:<locationId>') spawns a one-off local (race from the location's mix,
 * duendes speak chapín) whose mood comes from the place (fear, control, reputation) and who gossips about
 * what Elias did there.
 */
import { G, res } from '../../core/state';
import { Rng, rng } from '../../core/rng';
import { track } from '../../core/tracker';
import { LOCATIONS, CONTINENTS } from '../../data/world';
import { randomName } from '../../data/names';
import type { JobId, RaceId } from '../../data/types';
import { dialogue, type DialogueLine } from '../../ui/dialogue';
import type { PortraitMood, PortraitSpec } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { applyDeed, recentDeedsAt } from './deeds';
import { repTier } from './factions';
import { rumorLine, yearFor, fillTokens } from './greetings';
import {
  BRIBE_OK, FAREWELLS, FAREWELLS_DUENDE, THREAT_NO, THREAT_OK, TITLE_GREETINGS, TOWN_FEAR, TOWN_GOSSIP, TOWN_GREET,
  TOWN_GREET_DUENDE, TOWN_HATE, TOWN_OWNED,
} from './lines_common';
import { eliasPortrait } from './memory';
import { presence, soc } from './state';
import { popText } from './uifx';

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

const JOB_BY_CONT: Record<string, JobId[]> = {
  valdoria: ['campesino', 'soldado', 'mercader', 'tabernero', 'herrero'],
  sylvaria: ['cazador', 'curandero', 'arquero', 'campesino', 'sacerdote'],
  kharaz: ['minero', 'herrero', 'guerrero', 'mercader'],
  morvenna: ['alquimista', 'estudiante', 'hechicero', 'chaman'],
  islas: ['pirata', 'mercader', 'crupier', 'bardo', 'banquero'],
  concordia: ['delegado', 'guardian', 'sacerdote', 'mercader', 'erudito'],
};

interface Towny { name: string; race: RaceId; job: JobId; gender: 'f' | 'm'; age: 'young' | 'adult' | 'old' | 'child'; seed: string }

function makeTowny(locationId: string): Towny {
  const s = soc();
  s.townsfolkSeq++;
  const seed = `${locationId}:town:${s.townsfolkSeq}`;
  const r = new Rng(seed);
  const def = LOCATIONS[locationId];
  const mix = Object.entries(def?.races ?? {}) as Array<[RaceId, number]>;
  const race: RaceId = mix.length ? r.weighted(mix, (x) => x[1])[0] : r.pick(CONTINENTS[def?.continent ?? 'valdoria']?.races ?? ['humano']);
  const gender: 'f' | 'm' = r.chance(0.5) ? 'f' : 'm';
  const age = r.weighted(['young', 'adult', 'old', 'child'] as const, (a) => (a === 'child' ? 0.6 : a === 'adult' ? 3 : 1.5));
  let name = 'Alguien';
  try { name = randomName(race, gender, r) || name; } catch { /* content WIP */ }
  const job = age === 'child' ? 'campesino' : r.pick(JOB_BY_CONT[def?.continent ?? 'valdoria'] ?? ['campesino']);
  return { name, race, job, gender, age, seed };
}

function portrait(t: Towny, mood: PortraitMood): PortraitSpec {
  return { seed: t.seed, race: t.race as PortraitSpec['race'], job: t.job, gender: t.gender, age: t.age, mood };
}

function greeting(locationId: string, t: Towny): { text: string; mood: PortraitMood } {
  const loc = G.run.locations[locationId];
  const def = LOCATIONS[locationId];
  const cont = def?.continent ?? 'valdoria';
  const tier = repTier(cont).id;
  if (t.age === 'child') return { text: pick(['¡Mamá dice que no hable con usted! ...¿Es verdad que no se muere?', '¿Usted es el mago? ¿Me enseña un truco? ¡Uno chiquito!']), mood: 'surprised' };
  if (loc && loc.fear >= 60) return { text: pick(TOWN_FEAR), mood: 'scared' };
  if (loc?.control === 'excepcion') return { text: pick(TOWN_OWNED), mood: 'neutral' };
  if (tier === 'odiado' || tier === 'hostil') return { text: pick(TOWN_HATE), mood: 'angry' };
  const deeds = recentDeedsAt(locationId).filter((d) => TOWN_GOSSIP[d.kind]);
  if (deeds.length && rng.chance(0.6)) return { text: pick(TOWN_GOSSIP[deeds[0].kind]!), mood: deeds[0].kind === 'help' || deeds[0].kind === 'gift' ? 'smile' : 'scared' };
  if (t.race === 'duende') return { text: pick(TOWN_GREET_DUENDE), mood: 'smile' };
  const base = pick(TOWN_GREET[cont] ?? TOWN_GREET.valdoria).replace('{loc}', def?.name ?? 'este lugar');
  if (G.run.player.titleIndex >= 1 && rng.chance(0.4)) return { text: `${pick(TITLE_GREETINGS[G.run.player.titleIndex])} ${base}`, mood: 'neutral' };
  return { text: fillTokens(base), mood: 'neutral' };
}

export async function talkTownsfolk(locationId: string): Promise<void> {
  if (!LOCATIONS[locationId]) return;
  const t = makeTowny(locationId);
  const duende = t.race === 'duende';
  const title = { campesino: 'Lugareño', mercader: 'Mercader', soldado: 'Soldado' }[t.job as string] ?? 'Lugareño';
  const line = (text: string, mood: PortraitMood): DialogueLine => ({ speaker: t.name, title, portrait: portrait(t, mood), side: 'left', text });
  const elias = (text: string): DialogueLine => ({ speaker: '{name}', portrait: eliasPortrait('smug'), side: 'right', text });
  let { text, mood } = greeting(locationId, t);
  const seen = new Set<string>();
  const used = new Set<string>();
  track('townsfolk_talked');
  for (let guard = 0; guard < 20; guard++) {
    const p = G.run.player;
    const choice = await dialogue.ask(line(text, mood), [
      { id: 'rumor', text: 'Rumores' },
      { id: 'year', text: '¿Qué año es?' },
      { id: 'help', text: '¿Necesita ayuda?', hint: 'amable', disabled: used.has('help') },
      { id: 'bribe', text: 'Darle unas monedas', hint: '−10 oro', disabled: p.gold < 10 || used.has('bribe') },
      { id: 'threaten', text: 'Amenazar', hint: 'miedo', disabled: used.has('threaten') },
      { id: 'bye', text: 'Despedirse' },
    ], true);
    if (choice === 'bye') { await dialogue.say(line(pick(duende ? FAREWELLS_DUENDE : FAREWELLS), mood)); return; }
    used.add(choice);
    if (choice === 'rumor') { text = rumorLine({ duende, seen }); mood = 'neutral'; }
    else if (choice === 'year') { await dialogue.say(elias('¿Qué año es?')); text = yearFor(t.race, t.age === 'child'); mood = 'surprised'; }
    else if (choice === 'help') {
      applyDeed({ kind: 'help', location: locationId, magnitude: 0.25, noNews: rng.chance(0.7) });
      text = duende ? '¡Púchica, qué chivo! Gracias, cuate. Nadie ayuda de gratis en las Islas. ¿Seguro que es gratis?' : pick(['¡Gracias! No esperaba eso de usted. De nadie, la verdad.', 'Qué raro... gracias. Le contaré a todos. Bueno, a algunos.']);
      mood = 'smile';
    } else if (choice === 'bribe') {
      res.add('gold', -10, { raw: true });
      audio.sfx('coin');
      if (rng.chance(0.12)) { res.add('secrets', 1); popText({ x: window.innerWidth / 2, y: window.innerHeight * 0.55 }, '+1 Secreto', 'var(--secret)'); text = `${pick(BRIBE_OK)} Oí a dos guardias hablar de algo que no deberían saber...`; }
      else text = `${pick(BRIBE_OK)} ${rumorLine({ duende, seen })}`;
      mood = 'smile';
    } else if (choice === 'threaten') {
      const loc = G.run.locations[locationId];
      const ok = 30 + presence() * 3 + (loc?.fear ?? 0) * 0.4 + rng.range(-15, 15) > 40;
      if (ok) {
        applyDeed({ kind: 'terror', location: locationId, magnitude: 0.15, noNews: true });
        const g = rng.int(3, 18);
        res.add('gold', g);
        text = `${pick(THREAT_OK)} (Te da ${g} monedas.)`;
        mood = 'scared';
      } else { text = pick(THREAT_NO); mood = 'angry'; res.add('alert', 1); }
    }
  }
}
