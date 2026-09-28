# La Excepción — Research Reference (design + engineering)

> Actionable reference for the code team. Stack: Vite + TS, **three 0.186** (`WebGLRenderer` + `EffectComposer`), **Tone.js 15.1**, DOM/CSS UI.
> Units: meters, seconds; "f" = frames at 60 fps (1 f ≈ 16.7 ms). Values tagged **(P)** are *our proposed starting tunables*; everything else is sourced inline.
> Canon from `docs/GDD.md` wins on conflicts (e.g., hitstop 40–90 ms, dodge i-frames 0.25 s, copy resistance +20%/ability cap 80%, time in **lunas**, never show dates/years).

**Contents:** 1 Engagement · 2 Nemesis memory · 3 Anime rendering · 4 TABS battles · 5 Action feel · 6 Audio · 7 Strategy sim · 8 Casino · 9 Fourth wall · Top 25 rules

## 1. Engagement & retention (single-player roguelite)

### 1.1 Loop stack
| Loop | Length | La Excepción content | Hook into next loop |
|---|---|---|---|
| Core | 2–30 s | cast, dodge, get hit → Comprensión → copy | a new Excepción to try *now* |
| Encounter | 1–5 min | TABS battle, casino game, Concilio vote | loot reveal, nemesis taunt, vote reveal |
| Cycle | 60–120 min first, 30–60 later (GDD) | continents → ending / El Sello | narrator + NPCs react to *how* it ended |
| Meta | hours | Tinta upgrades, Códice %, nemesis roster, narrator memory | 3 visible open loops (1.8) |

- **Death must advance the story.** In Hades every return to the hub yields new dialogue, unlocks and plot; the team's phrase was "take the sting out of failure" ([GameSpot](https://www.gamespot.com/articles/hades-changes-what-it-means-to-be-a-roguelike/1100-6483420/)). Scale: 21,000+ voiced lines, 300k+ words ([GameRant](https://gamerant.com/hades-word-count-illiad-odyssey/)). We can't hand-write that much, so combine templated memory lines (§2) with a strict eligibility → priority → weighted selector.
- Hades' conversations are filtered by conditions (weapon, failed escapes, relationship level) and sorted into **priority tiers** so story beats pre-empt flavor ([GDC 2021 talk](https://www.gdcvault.com/play/1026975/Breathing-Life-into-Greek-Myth), [summary](https://www.toolify.ai/ai-news/unveiling-the-secrets-of-hades-dialogue-system-104463)).

```ts
type Pred = (m: Meta) => boolean;                       // Meta = run history + persistent facts
interface Line { id: string; who: string; text: string; tier: 0 | 1 | 2 | 3;  // 3 story, 2 event, 1 relation, 0 flavor
  weight?: number; once?: boolean; cooldownRuns?: number; req?: Pred[] }
export function pickLine(pool: Line[], m: Meta, rnd: () => number): Line | undefined {
  const ok = pool.filter(l => !(l.once && m.played.has(l.id))
    && m.cycle - (m.lastPlayedCycle[l.id] ?? -1e9) > (l.cooldownRuns ?? 0)
    && (l.req ?? []).every(p => p(m)));
  if (!ok.length) return;
  const top = Math.max(...ok.map(l => l.tier)), tier = ok.filter(l => l.tier === top);
  let r = rnd() * tier.reduce((s, l) => s + (l.weight ?? 1), 0);
  return tier.find(l => (r -= l.weight ?? 1) <= 0) ?? tier[tier.length - 1];
}
// log per cycle: killedBy, lastExcepcion, casinoNet, votesRigged, deathsToNemesis[id], reloadsMidBattle,
// hesitations (sacrifice screen opened/closed), unusedSpells, localHourStarted
```

### 1.2 Variable-ratio rewards, bounded
- Variable-ratio schedules give the highest, steadiest response rates and the most resistance to extinction ([Lumen: schedules](https://courses.lumenlearning.com/waymaker-psychology/chapter/reading-reinforcement-schedules/)). Use VR for *content* (relic drops, copyable elite variants, NPC events); cap dry streaks with pity (1.4); keep a fixed floor (every cycle pays Tinta > 0).

### 1.3 Rarity colors (WoW) → GDD tiers
WoW hex values ([Warcraft Wiki](https://warcraft.wiki.gg/wiki/Quality)): Poor `#9d9d9d`, Common `#ffffff`, Uncommon `#1eff00`, Rare `#0070dd`, Epic `#a335ee`, Legendary `#ff8000`, Artifact `#e6cc80`, Heirloom `#00ccff`.

| GDD tier | Hex | Drop share (P) | Reveal (P) |
|---|---|---|---|
| Común (gris) | `#9d9d9d` | 55% | 150 ms, tick |
| Poco común | `#1eff00` | 27% | 250 ms |
| Rara | `#0070dd` | 12% | 400 ms + chime |
| Épica | `#a335ee` | 5% | 700 ms beam + 60 ms hitstop |
| Legendaria | `#ff8000` | 0.9% | 1.2 s beam + cut-in + flash |
| Mítica | `#e6cc80` | 0.1% / unique | 2 s, narrator interrupts |

Beam color announces rarity *before* the item (anticipation). Add a distinct frame shape per tier (color-blind safety).

### 1.4 Pity (El Pozo de los Deseos)
- Genshin reference: 5★ base 0.6%, soft pity from pull 74 (+~6%/pull), hard pity 90; most 5★ land at pulls 75–82 ([pity guide](https://lootcalc.com/guides/genshin-wish-pity-guide), [traveler.gg](https://traveler.gg/soft-pity-vs-hard-pity-in-genshin-impact-what-guaranteed-really-means/)). Our formula reproduces it: expected 62.3 pulls = 1.61% consolidated rate.
- **(P)** Legendary: base 2%, soft 25, step 5%, hard 40 → mean 22.3 pulls, median 27, 90th pct 32. Épica guaranteed every 10. Show both counters ("Legendaria garantizada en 23 tiros", GDD). Duplicates → shards; 100 shards = pick any seen relic ("spark").

```ts
export const pHit = (n: number, base: number, soft: number, step: number, hard: number) =>
  n >= hard ? 1 : Math.min(1, base + Math.max(0, n - soft + 1) * step);   // n = pulls since last hit, 1-based
export function expectedPulls(b: number, s: number, st: number, h: number) {
  let surv = 1, e = 0;
  for (let n = 1; n <= h; n++) { const p = pHit(n, b, s, st, h); e += n * surv * p; surv *= 1 - p; }
  return e;                                                // Genshin (0.006,74,0.06,90) → 62.3
}
```

### 1.5 Near-miss presentation (honest)
- Near-misses increase persistence. Kassinove & Schare (2001): 30% near-miss frequency produced the most play during extinction vs 15% and 45% (inverted U) ([review](https://link.springer.com/article/10.1007/s10899-019-09891-8)); near-misses recruit win-related circuitry ([Clark et al. 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2658737/)).
- Casino: reel clustering + last-reel anticipation (§8.1). Everywhere else: *true* near-miss facts on the death/Sello screen — boss HP "4%", "1 relic from set bonus", "vote lost 2–3", "Comprensión 4/5".
- Outcome first, presentation second. Nevada ruled in 1989 that a "secondary decision" choosing near-miss displays after a loss is unacceptable, while virtual-reel clustering is allowed ([Harrigan](https://link.springer.com/article/10.1007/s11469-007-9139-8)). We follow the stricter reading: never fabricate.

### 1.6 Losses disguised as wins (LDW)
- Multi-line slots celebrate payouts smaller than the bet, and players' skin conductance treats these like real wins ([Dixon et al. 2010](https://pubmed.ncbi.nlm.nih.gov/20712818/)); a distinct sound can "unmask" them ([Dixon 2014](https://link.springer.com/article/10.1007/s10899-013-9411-8)).
- Rule: celebrate **net** wins only; show `+net / −net` on every result; LDW gets a deflating sound plus a deadpan narrator line ("Ganaste 5. Apostaste 10. Felicidades.").

### 1.7 Streaks & multipliers
- (P) Battle style rank D→C→B→A→S→SS→SSS (anime letters, shake on rank-up): +1 rank per 8 hits or 2 kills without taking damage, −2 when hit, decays after 3 s idle; Esencia multiplier 1.0 + 0.15·rank (cap 2.0).
- Map: consecutive battle wins +5% Oro each (cap +50%), reset on retreat. Casino: "double or nothing" offered after **wins only**, never after losses (no loss chasing).

### 1.8 Open loops (Zeigarnik → Ovsiankina)
- A 2025 meta-analysis (59 studies) found no reliable memory advantage for unfinished tasks (Zeigarnik), but a robust tendency to **resume** them: ~67% vs a 50% baseline (Ovsiankina) ([Ghibellini & Meier 2025](https://www.nature.com/articles/s41599-025-05000-w)). Design for resumption: every open loop needs a one-click "continue".
- Death/cycle screen always shows 3 loops: short ("Anotación en 80/100 Tinta"), medium ("Grakh el Dos Veces Quemado te espera en Kharaz"), long ("Códice 63%"). Hades' Fated List holds 55 prophecies with prerequisites ([Hades Wiki](https://hades.fandom.com/wiki/Fated_List_of_Minor_Prophecies)). End sessions on a cliffhanger line.

### 1.9 Collection %
- Códice (Excepciones), Páginas del Libro, bestiary: "???" silhouettes; lore tiers at 1/5/15 encounters (P); per-continent and global %. Near-complete sets get highlighted ("2 left in Kharaz").

### 1.10 Daily seeded modifiers (Presagios)
- Slay the Spire's Daily Climb: same seed + 3 modifiers for everyone, green positive / red negative ([StS wiki](https://slay-the-spire.fandom.com/wiki/Daily_Challenge), [Kotaku](https://kotaku.com/slay-the-spires-daily-challenges-keep-getting-better-1823780588)). Ours: 1 positive, 1 negative, 1 chaotic; compare against personal best.
- Never punish absence. PEGI (from June 2026): "play-by-appointment" features are PEGI 7 when rewards are neutral/positive, PEGI 12 when players are penalised for not returning ([PEGI](https://pegi.info/news/pegi-expands-age-rating-criteria-interactive-risk-categories), [Lewis Silkin](https://www.lewissilkin.com/insights/2026/03/18/pegi-announces-major-update-to-age-rating-criteria-what-games-businesses-need-to-102mn9y)).
- Seed from the UTC date internally, but **display only a moon glyph** (GDD: no dates).

```ts
const xmur3 = (s: string) => { let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }; };
export const mulberry32 = (a: number) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const presagioRng = () => mulberry32(xmur3('LX-presagio-' + new Date().toISOString().slice(0, 10))());
```

### 1.11 Number escalation
- Idle math ([Pecorella I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i), [III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii)): `cost_next = base·r^owned` (AdVenture Capitalist lemonade stand: base 4, r = 1.07); production linear × multipliers; milestone multipliers at 25/50 owned; prestige currency is usually a fractional power (√, ∛) of lifetime earnings.
- (P) Anotaciones al margen: r = 1.12–1.18. Tinta per cycle ≈ `floor(12·sqrt(cycleScore/1000))`. Damage should visibly grow ~10× per continent conquered (GDD pillar 1).

```ts
export const bulkCost = (b: number, r: number, owned: number, n: number) => b * r ** owned * (r ** n - 1) / (r - 1);
export const maxBuy = (b: number, r: number, owned: number, cash: number) =>
  Math.floor(Math.log((cash * (r - 1)) / (b * r ** owned) + 1) / Math.log(r));
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
export const fmt = (x: number) => { const e = Math.max(0, Math.min(SUF.length - 1, Math.floor(Math.log10(Math.abs(x) || 1) / 3)));
  const v = x / 1000 ** e; return (e ? v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) : Math.round(v)) + SUF[e]; }; // 1234567 → "1.23M"
```

### 1.12 Session pacing
- (P) Title → control < 15 s; new cycle → first fight < 60 s; defeat → control again < 10 s (skippable interlude with 1–3 reactive lines); something notable every 3–5 min (GDD); each natural stop (Concilio session, town arrival) ends on an open loop.
- Accessibility: Hades' God Mode starts at 20% damage resistance, +2% per death, cap 80%, toggle anytime with no penalty ([Hades Wiki](https://hades.fandom.com/wiki/God_Mode)). Experts: opt-in Pactos like the Pact of Punishment (stackable conditions → heat → bounties) ([Hades Wiki](https://hades.fandom.com/wiki/Pact_of_Punishment)).

### 1.13 Juice
- **Art of Screenshake** (Nijman 2013), roughly in talk order: lower enemy HP, faster fire, bigger bullets, muzzle flash, less accuracy, impact effects, hit animation, enemy knockback, **permanence** (bodies/shells stay), camera lerp, camera look-ahead, screen shake, player knockback, **sleep** (hit pause), gun delay/kick, shells, more bass, random explosions, camera kick, bigger explosions, smoke ([talk](https://www.youtube.com/watch?v=SkgkIXZ_13Y), [notes](https://artificials.ch/game-feeling/)); notes suggest 100–200 ms sleep on a *deadly* hit.
- **Juice it or lose it** (Jonasson & Purho 2012): ease everything, squash & stretch, particles, trails, sound, personality (eyes) ([talk](https://www.youtube.com/watch?v=Fy0aCDmgnxg)).
- Hitstop references: SFV ≈ 8/12/15 f for light/medium/heavy ([Shoryuken](http://shoryuken.com/2016/06/07/hitstop-in-street-fighter-v-kens-not-so-little-secret/)); Smash Ultimate ≈ ⌊d·0.65 + 6⌋ f for d% damage, victim shakes during hitlag ([SmashWiki](https://www.ssbwiki.com/Hitlag)).

| Event (crowd ARPG) (P) | Hitstop | Trauma | Extras |
|---|---|---|---|
| Chispa Arcana hits minion | 40 ms | +0.05 | 1 f white flash, 6–10 sparks |
| Heavy spell / crit | 80–90 ms | +0.25 | FOV punch −3°, number ×1.5 |
| Kill | 60 ms | +0.15 | knockback ×1.5, corpse stays |
| Elias hit | 90 ms | +0.4 | red vignette 150 ms, player knockback |
| EXCEPCIÓN ADQUIRIDA | 90 ms + 0.3 s slow-mo (GDD) | +0.3 | cut-in, rarity color |
| Captain/boss kill | 90 ms + 0.2× slow-mo 1 s | +0.8 | impact frames (§3.7) |

Budget: ≤ 250 ms of freeze per rolling second; in 200-unit fights only hits involving Elias freeze time.

```ts
export class GameClock { private freeze = 0; private hist: [number, number][] = []; private slow = 1; private slowT = 0;
  hitstop(ms: number, now: number) { this.hist = this.hist.filter(([t]) => now - t < 1000);
    const add = Math.max(0, Math.min(ms, 250 - this.hist.reduce((s, [, d]) => s + d, 0)));
    if (add > 0) { this.freeze = Math.max(this.freeze, add); this.hist.push([now, add]); } }
  slowmo(scale: number, ms: number) { this.slow = scale; this.slowT = ms; }
  step(realMs: number): number {                       // gameplay dt (s); UI/audio/particles use real time
    if (this.freeze > 0) { this.freeze -= realMs; return 0; }
    if (this.slowT > 0 && (this.slowT -= realMs) <= 0) this.slow = 1;
    return (Math.min(realMs, 33) / 1000) * this.slow; } // clamp after tab switches
}
```
- **Trauma shake** ([Eiserloh, GDC 2016](https://archive.org/stream/GDC2016Eiserloh/GDC2016-Eiserloh_djvu.txt)): trauma ∈ [0,1], +0.2–0.5 per event, linear decay; shake = trauma² or ³ (0.3/0.6/0.9 → 3%/22%/73% with cube); rotational is best in 3D; use smoothed noise, not random.

```ts
const vnoise = (x: number) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const h = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  return h(i) * (1 - u) + h(i + 1) * u; };
let trauma = 0, st = 0; export const addTrauma = (a: number) => (trauma = Math.min(1, trauma + a));
export function applyShake(cam: THREE.PerspectiveCamera, dt: number, scale = 1) { // AFTER position/lookAt
  st += dt; trauma = Math.max(0, trauma - 1.1 * dt); const s = trauma * trauma * scale, F = 22, d = Math.PI / 180;
  cam.rotateX(1.2 * d * s * vnoise(st * F)); cam.rotateY(1.2 * d * s * vnoise(100 + st * F)); cam.rotateZ(2.5 * d * s * vnoise(200 + st * F)); }
```
- Knockback `Δv = dir·K·damage/mass` + vertical `0.35·|Δv|` (small races fly further — comedy). Particles 8–20 per hit, 150–500 ms life. Sound: transient + body + tail, pitch ±5%, gain ±2 dB, ≤ 6 voices per SFX, ≥ 30 ms between retriggers. Camera kick on cast: 0.1–0.2 m opposite the aim, recover with a spring (half-life 60–90 ms).

### 1.14 Ethics guardrails
- In-game currency only: nothing purchasable, no ads, no paid random items, no NFT. PEGI's June 2026 criteria: paid random items → min PEGI 16; NFT/blockchain → PEGI 18; social-casino-style simulated gambling stays PEGI 18 while PEGI drafts criteria separating fantastical from realistic casino content ([Reed Smith](https://www.reedsmith.com/articles/pegi-launches-interactive-risk-categories-overhauls-age-ratings-for-loot-boxes-in-game-spending-and-communication-features/)). Keep the Islas de Azar magical/stylized, not a realistic casino tutorial.
- Publish odds (RTP, pity counters) in-game; outcome-first RNG; net results; no loss chasing; optional break nudge from the narrator after 90 min.
- Photosensitivity: nothing may flash more than 3× per second (WCAG 2.3.1) ([W3C](https://w3c.github.io/wcag21/understanding/three-flashes-or-below-threshold.html)); ship "Reduce flashing" and "Screen shake %" options.

## 2. Nemesis-style NPC memory

### 2.1 How Shadow of Mordor / War structures it
- Hierarchy: grunts → captains → warchiefs (each with 2–4 captain bodyguards) → overlords (SoW) ([Game Developer analysis](https://www.gamedeveloper.com/design/core-system-analysis-of-middle-earth-shadow-of-war), [Gamer Guides](https://www.gamerguides.com/shadow-of-mordor/guide/miscellaneous/the-nemesis-system)).
- Each captain: generated name/look, level (SoW 1–60), role, clan and **traits**: strengths, weaknesses, "Enraged by X", "Fear of X", immunities ([SoW traits](https://shadowofwar.fandom.com/wiki/Nemesis_Traits)). Set one on fire and let him escape → he returns afraid of fire ([GameRant](https://gamerant.com/middle-earth-shadow-of-mordor-nemesis-system-character-development-good/)).
- Promotion: a grunt who kills the player becomes a captain; when the player dies, time passes and power struggles resolve ([TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/MiddleEarthShadowOfMordor)). Captains remember past fights and allies' deaths, carry visible scars, can come back from death (unless decapitated), and taunt about history ([Game Developer](https://www.gamedeveloper.com/design/core-system-analysis-of-middle-earth-shadow-of-war)).
- **Legal flag.** WB holds US 10,926,179 "Nemesis characters, nemesis forts, social vendettas and followers" (priority 2015, granted 2021-02-23, expected expiry 2036-08-11) on NPC hierarchies whose parameters change through player encounters ([Google Patents](https://patents.google.com/patent/US10926179B2/en)). Not legal advice: get counsel before any commercial release. Lower-risk shape: per-NPC memory, grudges and trait mutations plus a rivalry graph, *without* an auto-reshuffled military rank ladder.

### 2.2 Data model (browser-light, JSON-serializable)
```ts
type MemKind = 'killedElias' | 'defeatedBy' | 'fled' | 'spared' | 'burnedBy' | 'excepcionTaken' | 'cheatedAtCasino'
  | 'bribed' | 'blackmailed' | 'betrayed' | 'humiliatedInConcilio' | 'rescued' | 'mindDominated';
interface Memory { kind: MemKind; cycle: number; luna: number; place: string; detail?: string; salience: number; core: boolean }
interface NemesisNPC {
  id: string; name: string; epithet: string; faction: string; tier: 0 | 1 | 2 | 3; level: number;
  traits: string[];                                  // GDD: Codicioso, Cobarde, Orgulloso, Leal, Vengativo...
  strengths: string[]; weaknesses: string[]; fears: string[]; immunities: string[]; enragedBy: string[];
  signature: string; scars: string[]; status: 'alive' | 'dead' | 'missing' | 'returned'; deaths: number;
  feelings: { miedo: number; odio: number; deuda: number; respeto: number };   // 0..100 (GDD)
  rivals: Record<string, number>; memories: Memory[]; }                        // memories cap 12
export function remember(n: NemesisNPC, m: Memory, cap = 12) { n.memories.push(m); if (n.memories.length <= cap) return;
  let k = -1; n.memories.forEach((x, i) => { if (!x.core && (k < 0 || x.salience < n.memories[k].salience)) k = i; });
  if (k >= 0) n.memories.splice(k, 1); }                                        // evict least salient non-core
```

### 2.3 Encounter → consequence rules (P)
| Fact from combat log | Memory | Mutation |
|---|---|---|
| NPC killed Elias | killedElias (core) | level +2, epithet "…Verdugo de la Excepción", odio −, respeto +30; an unnamed killer is promoted to a named NPC |
| Beaten, NPC fled | fled | 50% gains fear of the finishing element, 50% immunity to it (the "fear of fire" rule) |
| Killed normally | defeatedBy | 35% returns next cycle with a scar + new intro; permanent only if dissolved by a finisher |
| Elias copied his signature | excepcionTaken (core) | next meeting swaps signature or gains "Anti-plagio" (resists copies): "Devuélvemelo." |
| Cheated at Dados Mentirosos | cheatedAtCasino | calls "¡Mentiroso!" +20% more often vs Elias |
| Spared | spared (core) | respeto +40; may sell intel, refuse to fight, or betray later if Orgulloso |
| Bribed / blackmailed in Concilio | bribed / blackmailed | vote bought; blackmail → odio +40, 10%/cycle leak risk |
- After each defeat/cycle run 3–6 off-screen struggles (duel, feast, ambush, trial) between rivals: winner +1 level, loser may die; write NPC↔NPC memories so they gossip ("rumores", GDD).
- Salience starts at 1.0; non-core ×0.8 per cycle; the taunt uses the top-salience memory and must cite **specifics** (place, element, luna phase, cycle #).

```ts
const TAUNTS: Partial<Record<MemKind, string[]>> = {
  killedElias: ['{name}: ¿Otra vez vivo, Excepción? Aún guardo tu sombrero de {place}.'],
  burnedBy: ['{name}: Me quemaste en {place}. Aprendí a amar el olor.'],
  excepcionTaken: ['{name}: Ese {detail} es MÍO. Ladrón. Devuélvemelo.'],
};
export function taunt(n: NemesisNPC, rnd = Math.random) {
  const m = [...n.memories].sort((a, b) => b.salience - a.salience)[0], pool = m && TAUNTS[m.kind];
  if (!pool) return `${n.name} ${n.epithet} te cierra el paso.`;
  return pool[(rnd() * pool.length) | 0].replace('{name}', n.name).replace('{place}', m.place).replace('{detail}', m.detail ?? '');
}
```
- Presentation: freeze-frame cut-in (name, epithet, 2 trait icons, 1.2 s, skippable), per-NPC text-blip pitch, and a "Recuerda: te quemó en el Vado (ciclo 3)" chip.

## 3. Anime / toon rendering in Three.js (r186, WebGL2)

### 3.1 Toon ramp, tinted shadows, rim
- `MeshToonMaterial` looks up `coord = dot(N,L)*0.5+0.5` in `gradientMap` (**red channel only**); with no map it uses a 0.7/1.0 two-tone step at coord 0.7 ([chunk](https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/gradientmap_pars_fragment.glsl.js)).
- N texels + NearestFilter → band *i* covers N·L ∈ [2i/N − 1, 2(i+1)/N − 1). 2 texels = terminator at N·L 0; 4 texels `[s,s,m,l]` = shadow < 0 ≤ mid < 0.5 ≤ lit.
- `DataTexture` defaults to NearestFilter (the official toon example uses `DataTexture(colors, n, 1, RedFormat)`) ([example](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_materials_toon.html)). A PNG/Canvas ramp needs `min/magFilter = NearestFilter`, `generateMipmaps = false`.
- Since r155 lights use physical units (legacy mode removed in r165): multiply old intensities by π ([forum](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733)). A DirectionalLight ≈ 3 shows base color on lit toon faces; add a HemisphereLight ≈ 1–1.5 as fill.
- Roystan's toon reference values: ambient 0.4, glossiness 32, specular `smoothstep(0.005, 0.01, x)`, rim amount 0.716, rim threshold 0.1 via `rimDot * pow(NdotL, 0.1)` ([Roystan](https://roystan.net/articles/toon-shader/)).

```ts
const ramp = (v: number[]) => { const t = new THREE.DataTexture(new Uint8Array(v.map(x => x * 255)), v.length, 1, THREE.RedFormat); t.needsUpdate = true; return t; };
const RAMP = ramp([0, 0, 0.6, 1]);            // value = "light fraction": shadow | shadow | mid | lit
export function toonMat(color: THREE.ColorRepresentation) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: RAMP });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uShadow: { value: new THREE.Color(0.45, 0.4, 0.62) },      // violet-tinted shade
      uRim: { value: new THREE.Color(1.0, 0.94, 0.85) }, uRimStart: { value: 0.6 } });
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uShadow, uRim; uniform float uRimStart;')
      .replace('#include <gradientmap_pars_fragment>', `uniform sampler2D gradientMap;
        vec3 getGradientIrradiance(vec3 n, vec3 l) {
          return mix(uShadow, vec3(1.0), texture2D(gradientMap, vec2(dot(n, l) * 0.5 + 0.5, 0.0)).r); }`)
      .replace('#include <opaque_fragment>', `
        float rim = smoothstep(uRimStart, uRimStart + 0.03, 1.0 - saturate(dot(geometryNormal, geometryViewDir)));
        #if NUM_DIR_LIGHTS > 0
          rim *= smoothstep(0.0, 0.25, dot(geometryNormal, directionalLights[0].direction)); // lit-side rim only
        #endif
        outgoingLight += uRim * rim * 0.5;
        #include <opaque_fragment>`);
    m.userData.shader = sh;                     // keep a handle to tweak uniforms later
  };
  return m;                                     // always set gradientMap, or the pars replacement breaks
}
```
Cast shadows multiply `directLight.color` to 0, so shadowed areas show only the hemisphere fill. For units, prefer instanced **blob shadows** (1 draw call) over shadow maps (every caster adds a draw call in the shadow pass).

### 3.2 Outlines
- **Inverted hull** (duplicate mesh, `BackSide`, pushed out along normals) is the anime standard. Guilty Gear Xrd extrudes by a per-vertex-color thickness, scales with camera distance, draws inner lines with texture alpha, and edits normals for 2D-like shadows ([GGXrd GDC PDF](https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf), [ASW line control](https://www.docswell.com/s/ASW_Academy/5LVY67-GG-Toonline-Eng)). Extruding in **clip space** gives constant pixel width ([Ameye](https://ameye.dev/notes/rendering-outlines/)).
- Hard-edged primitives (boxes) have split normals → gaps at corners. Fix: the outline geometry = `mergeVertices` of the part without normal/uv, then `computeVertexNormals()` (smooth normals).
- The OutlinePass example does not support InstancedMesh ([#18533](https://github.com/mrdoob/three.js/issues/18533)), so write a tiny instanced hull material and let the twin mesh **share `instanceMatrix`**.

```ts
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
export const outlineMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { uInk: { value: new THREE.Color(0x1a1024) }, uPx: { value: 2.5 }, uRes: { value: new THREE.Vector2(1920, 1080) } },
  vertexShader: /* glsl */`
    uniform float uPx; uniform vec2 uRes;
    void main() {
      mat4 m = modelMatrix;
      #ifdef USE_INSTANCING
        m = m * instanceMatrix;                       // declared by three when mesh.isInstancedMesh
      #endif
      vec4 clip = projectionMatrix * viewMatrix * (m * vec4(position, 1.0));
      vec2 d = (projectionMatrix * vec4(normalize(mat3(viewMatrix) * mat3(m) * normal), 0.0)).xy;
      float l = length(d); d = l > 1e-5 ? d / l : vec2(0.0);
      float px = uPx * clamp(12.0 / clip.w, 0.35, 1.0);  // thinner far away
      clip.xy += d * px * 2.0 / uRes * clip.w;           // pixels → NDC, undo perspective divide
      gl_Position = clip;
    }`,
  fragmentShader: /* glsl */`uniform vec3 uInk; void main() { gl_FragColor = vec4(uInk, 1.0); }`,
});
export function withOutline(body: THREE.InstancedMesh, srcGeo: THREE.BufferGeometry) { // srcGeo: BEFORE adding instanced attrs
  const g = srcGeo.clone(); g.deleteAttribute('normal'); g.deleteAttribute('uv');
  const og = mergeVertices(g); og.computeVertexNormals();
  const o = new THREE.InstancedMesh(og, outlineMat, body.instanceMatrix.count);
  o.instanceMatrix = body.instanceMatrix; o.frustumCulled = false; return o;    // same buffer; copy body.count each frame
}
// on resize: renderer.getDrawingBufferSize(outlineMat.uniforms.uRes.value)
```
Bake non-uniform proportions into part geometry and keep instance matrices **uniform-scale** (the `mat3(m)*normal` shortcut and toon normals stay correct).

- **Screen-space alternative** for terrain/buildings: Sobel on linear depth (plus normals or surface IDs for interior creases) ([Omar Shehata](https://omar-shehata.medium.com/how-to-render-outlines-in-webgl-8253c14724f9), [repo](https://github.com/OmarShehata/webgl-outlines)). One full-screen pass, but no per-object control. Build the composer on a target with `depthTexture: new THREE.DepthTexture(w, h)` and `samples: 4`, and place the edge pass **right after RenderPass** (depth is valid there).

```glsl
#include <packing>
uniform sampler2D tDiffuse, tDepth; uniform vec2 uRes; uniform float uNear, uFar, uK; uniform vec3 uInk; varying vec2 vUv;
float ld(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }   // meters
void main() {
  vec2 px = 1.0 / uRes; float gx = 0.0, gy = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) { float d = ld(vUv + vec2(i, j) * px);   // Sobel 3×3
    gx += d * float(i) * (j == 0 ? 2.0 : 1.0); gy += d * float(j) * (i == 0 ? 2.0 : 1.0); }
  float edge = step(uK * ld(vUv), length(vec2(gx, gy)));    // threshold grows with distance (uK ≈ 0.05)
  gl_FragColor = vec4(mix(texture2D(tDiffuse, vUv).rgb, uInk, edge), 1.0); }
```

### 3.3 Anime sky & clouds (cheap)
- Sky dome (BackSide sphere following the camera, `depthWrite:false`, rendered first): 2–3 color gradient + crisp sun disc + halo; set `scene.fog` color = horizon so the diorama melts into the sky. Procedural cel skies use exactly this recipe ([cartoon sky](https://godotshaders.com/shader/cartoon-sky-shader/)).

```glsl
uniform vec3 uTop, uHorizon, uBottom, uSunDir, uSun; varying vec3 vDir;  // vDir = position (sphere at camera)
void main() {
  vec3 d = normalize(vDir); float h = d.y, s = dot(d, normalize(uSunDir));
  vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.45)) : mix(uHorizon, uBottom, pow(-h, 0.3));
  c += uSun * (smoothstep(0.9990, 0.9993, s) * 3.0 + pow(max(s, 0.0), 64.0) * 0.35);   // crisp HDR disc (→ bloom) + halo
  gl_FragColor = vec4(c, 1.0); }
```
- Palettes (P): day top `#3a6fd8` → horizon `#bfe6ff`; dusk top `#3b2c85` → horizon `#ff9f6e`; night top `#0d0714` → horizon `#1a1024` (GDD palette) with the violet Excepción `#9b5cff` on the moon halo.
- Clouds: 20–40 clusters × 5–9 low-poly icospheres in ONE InstancedMesh with a 2-band toon (white / lavender `#c9c3ff`), no outline, slow drift + bob; optional blob shadows on the map.

### 3.4 Stylized water
- Roystan's toon water reference: shallow `(0.325, 0.807, 0.971, 0.725)`, deep `(0.086, 0.407, 1, 0.749)`, depth max 1, noise cutoff 0.777, foam 0.4 → 0.04 by view angle, distortion 0.27, scroll (0.03, 0.03) ([Roystan](https://roystan.net/articles/toon-water/)); web ports use a depth render target ([Gamedev.js](https://gamedevjs.com/tutorials/creating-toon-water-for-the-web/), [three forum](https://discourse.threejs.org/t/toon-water-shader-with-depth-based-fog-and-intersection-foam/35978)).
- Overworld coasts are static, so skip the depth pass: **bake distance-to-land** into a small R8 texture at map generation and drive color, foam and anime shore rings from it.

```glsl
uniform sampler2D tShore; uniform float uTime; uniform vec3 uShallow, uDeep, uFoam; varying vec2 vMapUv; varying vec3 vWorld;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f *= f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + 1.0), f.x), f.y); }
void main() {
  float d = texture2D(tShore, vMapUv).r;                          // 0 at coast … 1 far out
  vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.6, d));
  float cut = mix(0.3, 0.777, clamp(d / 0.15, 0.0, 1.0));          // more foam near shore
  float foam = smoothstep(cut - 0.01, cut + 0.01, n2(vWorld.xz * 0.8 + uTime * 0.05));
  float rings = step(0.5, fract(d * 10.0 - uTime * 0.3)) * (1.0 - smoothstep(0.0, 0.12, d));   // anime shore rings
  gl_FragColor = vec4(mix(col, uFoam, max(foam, rings)), 0.9); }
```

### 3.5 Bloom, tone mapping, pass order
- `UnrealBloomPass(resolution, strength = 1, radius, threshold)`: 5 mips, blur kernels `[6,10,14,18,22]`, mip factors `[1,.8,.6,.4,.2]`, high-pass `smoothWidth` 0.01 ([source](https://github.com/mrdoob/three.js/blob/dev/examples/jsm/postprocessing/UnrealBloomPass.js)); the official example uses threshold 0, strength 1, radius 0.5, ACES ([example](https://github.com/mrdoob/three.js/blob/dev/examples/webgl_postprocessing_unreal_bloom.html)).
- `EffectComposer` targets are `HalfFloatType`, so emissive > 1 survives to the bloom pass. **(P) Anime look:** threshold 0.9, strength 0.7–1.0, radius 0.35–0.45; spells/edges/sun use HDR color 2–4; everything else ≤ 1. This makes bloom selective at zero extra cost (the layer-based selective example re-renders the scene).
- Tone mapping: r186 ships `NeutralToneMapping` and `AgXToneMapping`; ACES pushes saturated brights toward white/yellow, so test Neutral for saturated anime palettes.
- Order: `RenderPass → (edge pass) → UnrealBloomPass → OutputPass (tone map + sRGB) → AnimeFinalPass`. Composer targets have no MSAA by default: use a custom target with `samples: 4`, or add `SMAAPass`/`FXAAPass`.

### 3.6 One final "anime" pass: grade + vignette + speed lines + impact frames
```ts
export const AnimeFinal = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uImpact: { value: 0 }, uSpeed: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 16 / 9 }, uVig: { value: 0.35 }, uSat: { value: 1.12 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uImpact, uSpeed, uAspect, uVig, uSat; uniform vec2 uCenter; varying vec2 vUv;
    float h11(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);                                             // saturation
      vec2 p = (vUv - uCenter) * vec2(uAspect, 1.0);
      float seg = floor((atan(p.y, p.x) / 6.28318 + 0.5) * 180.0);           // 180 angular slots
      float line = step(0.82, h11(seg + floor(uTime * 24.0) * 17.0)) * smoothstep(0.25, 0.8, length(p));
      c = mix(c, vec3(1.0), line * uSpeed);                                  // speed lines, re-rolled at 24 Hz
      float bw = step(0.45, l);                                              // impact: 1 = ink B/W, 2 = inverted
      c = mix(c, uImpact > 1.5 ? vec3(1.0 - bw) : vec3(bw) * vec3(1.0, 0.96, 0.9), step(0.5, uImpact));
      vec2 q = vUv - 0.5; gl_FragColor = vec4(c * (1.0 - uVig * dot(q, q) * 2.0), 1.0);   // vignette
    }` };
// composer.addPass(new ShaderPass(AnimeFinal));  — after OutputPass, so it works in display space
```

### 3.7 Impact frames
- Anime impact frames are 1–3 frames of inverted/ink-only contrast on the hit. (P) Crits/captain kills: `[2, 2, 1]` (inverted, inverted, ink) at 60 fps + hitstop 90 ms + FOV punch + speed lines 300 ms + trauma 0.5.
- Rate-limit to one impact sequence per 700 ms, so it can never exceed 3 flashes/s (WCAG 2.3.1). With "Reduce flashing" on, swap in desaturate + zoom punch.

```ts
let lastImpact = -1e9; const seq: number[] = [];
export function impactFrames(now: number, reduceFlash: boolean) {
  if (reduceFlash || now - lastImpact < 700) return; lastImpact = now; seq.push(2, 2, 1);
}
export const tickImpact = (pass: { uniforms: any }) => (pass.uniforms.uImpact.value = seq.shift() ?? 0); // once per rendered frame
```

### 3.8 Speed lines
- Shader version is in §3.6 (polar slots re-rolled at 24 Hz; the same polar-coordinate approach as [radial speedlines](https://godotshaders.com/shader/radial-speedlines/)). The CSS overlay is cheaper for UI moments (cut-ins, Concilio reveals):

```css
.speedlines { position: fixed; inset: -20%; pointer-events: none; opacity: 0; transition: opacity 60ms; animation: sl .12s steps(1) infinite;
  background: repeating-conic-gradient(#fff0 0deg 1.6deg, #fffc 1.6deg 2deg, #fff0 2deg 3.1deg); mask-image: radial-gradient(circle, transparent 32%, #000 70%); }
.speedlines.on { opacity: 1; }  @keyframes sl { 33% { transform: rotate(.7deg) } 66% { transform: rotate(-.5deg) } }
```

### 3.9 Dissolve, hit flash, faces (per-instance attributes)
- Dissolve = discard where noise < progress, glowing HDR edge just above it, bloomed ([Codrops](https://tympanus.net/codrops/2025/02/17/implementing-a-dissolve-effect-with-shaders-and-particles-in-three-js/)). Use it for "unmade" finishers, El Sello, summons (0.6–1.2 s, edge width 0.06).
- Per-instance data = `InstancedBufferAttribute` on the shared geometry, read via `onBeforeCompile`. Update only dirty ranges with `attr.addUpdateRange(start, count)` + `needsUpdate = true`.

```ts
const MAX = 256, aFlash = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1), aDissolve = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
aFlash.setUsage(THREE.DynamicDrawUsage); aDissolve.setUsage(THREE.DynamicDrawUsage);
partGeo.setAttribute('aFlash', aFlash); partGeo.setAttribute('aDissolve', aDissolve);   // add to the outline geo too
// inside toonMat onBeforeCompile (in addition to 3.1):
sh.vertexShader = sh.vertexShader
  .replace('#include <common>', '#include <common>\nattribute float aFlash, aDissolve; varying float vFlash, vDis; varying vec3 vNP;')
  .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlash = aFlash; vDis = aDissolve; vNP = position * 4.0 + instanceMatrix[3].xyz;');
sh.fragmentShader = sh.fragmentShader
  .replace('#include <common>', `#include <common>
    varying float vFlash, vDis; varying vec3 vNP;
    float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
    float n3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h13(i), h13(i + vec3(1,0,0)), f.x), mix(h13(i + vec3(0,1,0)), h13(i + vec3(1,1,0)), f.x), f.y),
                 mix(mix(h13(i + vec3(0,0,1)), h13(i + vec3(1,0,1)), f.x), mix(h13(i + vec3(0,1,1)), h13(i + 1.0), f.x), f.y), f.z); }`)
  .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
    float edge = 0.0; if (vDis > 0.0) { float dn = n3(vNP); if (dn < vDis) discard; edge = 1.0 - smoothstep(vDis, vDis + 0.06, dn); }`)
  .replace('#include <opaque_fragment>', `outgoingLight = mix(outgoingLight, vec3(1.0), vFlash);
    outgoingLight += vec3(2.6, 0.9, 3.2) * edge;   // HDR violet → bloom
    #include <opaque_fragment>`);
```
(Merge these replacements into the single `onBeforeCompile` of §3.1; `instanceMatrix` exists only on InstancedMesh, so guard it with `#ifdef USE_INSTANCING` if the material is shared with plain meshes.)
- Faces: a 4×4 expression atlas on the head's face quad, with per-instance `aFace` → `vUv = (uv + vec2(mod(aFace,4.), floor(aFace/4.))) / 4.`. States: attack = angry, knocked = dizzy spirals, rout = panic + sweat drop, dominated = spiral eyes (GDD), dead = X. Blink every 2–6 s for 120 ms.
- **Limited animation:** Guilty Gear Xrd avoids interpolation to read as 2D ([GGXrd PDF](https://www.ggxrd.com/Motomura_Junya_GuiltyGearXrd.pdf)). Sample body poses at 12 fps ("on twos": `tp = Math.floor(t*12)/12`) while root motion, camera and VFX stay at 60 fps. This also cuts pose math by 5×.
- Cut-ins: DOM overlay, diagonal band (`clip-path: polygon(0 15%,100% 0,100% 85%,0 100%)`, gradient `#1a1024 → #9b5cff`), slide in / hold / out over 700–900 ms (`cubic-bezier(.2,.9,.2,1)`, keyframes −110% → 0 at 20–80% → +110%), world at 0.25× time.

### 3.10 Performance for 100–200 characters
- A widely cited budget from three.js maintainer Don McCurdy: stay under ~100 draw calls and ~100k vertices when possible ([utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)). Measure with `renderer.info.render.calls` (set `renderer.info.autoReset = false` and call `info.reset()` once per frame, because the composer renders many times).
- One `InstancedMesh` per **part type** (head, torso, arm, leg, weapon kinds, shield), `count = MAX`, `mesh.count = active`; `instanceMatrix.setUsage(DynamicDrawUsage)`; call `setColorAt` **before the first render** (it creates `instanceColor`; creating it later means the shader lacks `USE_INSTANCING_COLOR` until `material.needsUpdate = true`). `frustumCulled = false` for battle meshes, or `computeBoundingSphere()` after updates.
- Write matrices straight into `instanceMatrix.array` from SoA sim arrays (no `Object3D` per part, no per-frame allocations): 200 units × 7 parts = 1,400 mat4 ≈ 90 KB/frame upload, which is trivial.
- Static diorama props (houses, trees, ruins) of mixed geometry: `BatchedMesh` (multi-draw, one call) ([docs](https://threejs.org/docs/pages/BatchedMesh.html)).

| Draw-call estimate (P) | Calls |
|---|---|
| 7 part types × (body + outline) | 14 |
| blob shadows, projectiles, particles, damage-number sprites (if WebGL) | 4 |
| terrain + BatchedMesh props + water + sky + clouds | 6–10 |
| post: render, bloom (~12 internal), output, final | ~15 |
| **Total** | **≈ 40–45** |

## 4. TABS-like battle simulation

### 4.1 What TABS does, and what we do instead
- TABS units are **active ragdolls**: torque on leg joints from animation curves makes the walk; a *step handler* decides when steps start/end; a *standing handler* pushes torso/head up as a curve of head height; a *balance* script moves feet under the center of mass; components are mix-and-match (snakes skip the standing handler) ([Game Developer / Landfall](https://www.gamedeveloper.com/design/how-landfall-games-finds-the-fun-in-physics-engines)).
- 200 active ragdolls in JS is too expensive. Approximation: **kinematic agent + procedural pose + springs while alive → Verlet ragdoll on death or heavy knockdown**. It is visually 80% of TABS at ~5% of the cost.
- Data: SoA typed arrays (`Float32Array` pos/vel/heading/hp/morale, `Uint8Array` team/state), fixed 60 Hz sim, staggered AI, seeded PRNG (§1.10) → deterministic replays, testable odds, Arena spectating.
- States: `idle → advance → engage → windup → strike → recover → stagger → airborne → down → getUp → rout → ragdoll → corpse`.

### 4.2 Procedural walk + wobble
```ts
// underdamped spring: f = wobble Hz, z = damping ratio (0.3 jelly … 1 crisp); stable while 2πf·dt < 2
export function spring(s: { x: number; v: number }, goal: number, f: number, z: number, dt: number) {
  const w = 2 * Math.PI * f; s.v += (w * w * (goal - s.x) - 2 * z * w * s.v) * dt; s.x += s.v * dt;
}
export function pose(u: Unit, dt: number) {
  const k = Math.min(1, u.speed / u.maxSpeed), s = Math.sin((u.phase += (u.speed / 0.8) * Math.PI * dt)), sw = 0.65 * k; // ~0.8 m/step, rad
  u.legL = s * sw; u.legR = -s * sw; u.armL = -0.8 * s * sw; u.armR = 0.8 * s * sw; u.bob = Math.abs(s) * 0.06 * k; // bob in m
  spring(u.leanFwd, THREE.MathUtils.clamp(u.accelFwd * 0.05, -0.4, 0.4), 4, 0.35, dt);   // overshoot = wobble
  spring(u.leanSide, THREE.MathUtils.clamp(u.accelSide * 0.05, -0.3, 0.3), 4, 0.35, dt);
  spring(u.head, u.leanFwd.x * 0.6, 6, 0.3, dt);                           // secondary motion
}
```
- (P) Attacks: windup 250–400 ms (ease-in-back), strike 80–120 ms, recover 200–300 ms. Landing squash `sy = 1 − 0.2·impact`, `sxz = 1/√sy` (volume-preserving). Races scale body proportions (duende 0.6×, GDD), not the sim.

### 4.3 Knockback & tumbling (P)
- `Δv = dir·(K·damage/mass) + up·0.35·|…|`; explosions `(1 − d/R)²` falloff + upward bias; Fuerza Titánica punches use K ×3 (GDD: "mandan a volar").
- Airborne: gravity 15–20 m/s² (snappier at toy scale), spin `ω = (up × dir)·|Δv|·1.5`; landing restitution 0.2, friction 0.6; `down` 0.6–1.0 s, then a 0.4 s get-up. `|Δv| > 6 m/s` or HP ≤ 0 → ragdoll.

### 4.4 Verlet ragdoll (Jakobsen)
- Verlet particles + iterated distance constraints (Hitman used 1–10 relaxation iterations per object type) ([Jakobsen](https://www.cs.cmu.edu/afs/cs/academic/class/15462-s13/www/lec_slides/Jakobsen.pdf)).
- 11 particles: head, chest, pelvis, shoulders ×2, hands ×2, hips ×2, feet ×2. ~17 sticks: the chain plus braces (shoulder↔pelvis ×2, head↔shoulder ×2, shoulder↔shoulder, hip↔hip). Initialize from the live pose with `prev = pos − vel·dt`, so the corpse inherits the knockback.

```ts
export interface Rag { p: Float32Array; q: Float32Array; w: Float32Array; sticks: Uint16Array; rest: Float32Array; n: number; still: number }
export function stepRag(r: Rag, dt: number, iters = 6, g = -18, damp = 0.99, rad = 0.12, fric = 0.6) {
  const { p, q } = r;
  for (let i = 0; i < r.n * 3; i++) { const cur = p[i], v = (cur - q[i]) * damp; q[i] = cur; p[i] = cur + v + (i % 3 === 1 ? g * dt * dt : 0); } // Verlet
  for (let it = 0; it < iters; it++) {
    for (let s = 0; s < r.sticks.length; s += 2) {                         // distance constraints
      const a = r.sticks[s] * 3, b = r.sticks[s + 1] * 3, wa = r.w[a / 3], wb = r.w[b / 3];
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], d = Math.hypot(dx, dy, dz) || 1e-6;
      const k = (d - r.rest[s >> 1]) / (d * (wa + wb));
      p[a] += dx * wa * k; p[a + 1] += dy * wa * k; p[a + 2] += dz * wa * k;
      p[b] -= dx * wb * k; p[b + 1] -= dy * wb * k; p[b + 2] -= dz * wb * k;
    }
    for (let i = 1; i < r.n * 3; i += 3) if (p[i] < rad) p[i] = rad;        // ground projection
  }
  let maxMove = 0;
  for (let i = 0; i < r.n * 3; i += 3) {
    if (p[i + 1] <= rad + 1e-4) { q[i] += (p[i] - q[i]) * fric; q[i + 2] += (p[i + 2] - q[i + 2]) * fric; } // ground friction
    maxMove = Math.max(maxMove, Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]));
  }
  r.still = maxMove < 5e-4 ? r.still + 1 : 0;                                // freeze after 30 still steps
}
```
- Render: each part = segment between its 2 particles → position = midpoint, rotation = `quat.setFromUnitVectors(UP, dir)`; head sphere on the head particle.
- (P) Cap 40 active ragdolls; the oldest freeze first. Frozen corpses stay (**permanence**); past 150 corpses, sink the oldest into "tinta" puddles (GDD: violet/black ink, no gore).

### 4.5 Uniform grid (dense spatial hash, counting sort)
- Rebuilt every tick, O(n), allocation-free ([Müller, Ten Minute Physics #11](https://matthias-research.github.io/pages/tenMinutePhysics/11-hashing.html)). Cell ≈ the largest interaction radius (1.5–2 m).

```ts
export class Grid {
  start: Int32Array; items: Int32Array;
  constructor(public x0: number, public z0: number, public cell: number, public cols: number, public rows: number, max: number) {
    this.start = new Int32Array(cols * rows + 1); this.items = new Int32Array(max); }
  cellOf(x: number, z: number) { const c = this.cols, r = this.rows;
    return Math.min(r - 1, Math.max(0, ((z - this.z0) / this.cell) | 0)) * c + Math.min(c - 1, Math.max(0, ((x - this.x0) / this.cell) | 0)); }
  build(n: number, xs: Float32Array, zs: Float32Array) { const s = this.start; s.fill(0);
    for (let i = 0; i < n; i++) s[this.cellOf(xs[i], zs[i])]++;
    for (let c = 1; c < s.length; c++) s[c] += s[c - 1];                        // prefix sums = cell ends
    for (let i = 0; i < n; i++) this.items[--s[this.cellOf(xs[i], zs[i])]] = i; } // → s[c] = cell start
  near(x: number, z: number, fn: (j: number) => void) {
    const c0 = this.cellOf(x, z), cx = c0 % this.cols, cz = (c0 / this.cols) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const gx = cx + dx, gz = cz + dz; if (gx < 0 || gz < 0 || gx >= this.cols || gz >= this.rows) continue;
      const c = gz * this.cols + gx; for (let k = this.start[c]; k < this.start[c + 1]; k++) fn(this.items[k]); } }
}
```
Targeting can be brute force (200×200 ≈ 40k distance checks) if staggered across frames.

### 4.6 Steering
- Reynolds: seek, flee, pursue, arrive, separation, cohesion…; steering = desired velocity − velocity, truncated to max force ([Reynolds GDC 1999](https://www.red3d.com/cwr/papers/1999/gdc99steer.pdf)).
```ts
let ax = 0, az = 0;                                          // unit i toward target (tx,tz)
const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1e-6, sp = maxSpeed * Math.min(1, d / slowR); // arrive
ax += (dx / d) * sp - vx; az += (dz / d) * sp - vz;
grid.near(x, z, j => { if (j === i) return; const ox = x - xs[j], oz = z - zs[j], d2 = ox * ox + oz * oz;
  if (d2 > SEP_R * SEP_R || d2 < 1e-6) return; ax += (ox / d2) * W_SEP; az += (oz / d2) * W_SEP; });  // separation
const a = Math.hypot(ax, az); if (a > maxForce) { ax *= maxForce / a; az *= maxForce / a; }
vx += ax * dt; vz += az * dt;                                 // then clamp |v| ≤ maxSpeed
```
- (P) SEP_R 1.2 m, W_SEP 2, formation cohesion 0.3 until contact; infantry 3–5 m/s, maxForce 20 m/s². **Melee slots:** at most 4 attackers per target, 90° apart; overflow re-targets (prevents blobs). Orders (GDD): Z *¡Carguen!* = seek nearest; X *¡Mantengan!* = arrive at placement slot; C *¡Síganme!* = arrive at Elias + formation offset.

### 4.7 Target selection (P)
- `score = dist · (ranged ? 0.6 : 1) − 3·isWounded − 5·isThreatToAlly + 4·isEliasAndIAmCaptain`; switch only if the new score < 0.7 × current (hysteresis); re-evaluate every 0.3–0.6 s, staggered by `id % 20` frames. Mages pick clusters (count within 3 m via the grid); archers need line of fire.

### 4.8 Projectiles
- Angle to hit (x, y) at launch speed v: θ = atan((v² ± √(v⁴ − g(gx² + 2yv²))) / (gx)); discriminant < 0 → out of range ([Wikipedia](https://en.wikipedia.org/wiki/Projectile_motion)). Low root for arrows, high root for catapults.
```ts
export function launchAngle(v: number, dx: number, dy: number, g = 9.81, high = false): number | null {
  const v2 = v * v, disc = v2 * v2 - g * (g * dx * dx + 2 * dy * v2);
  if (disc < 0) return null;                        // advance until in range
  return Math.atan((v2 + (high ? 1 : -1) * Math.sqrt(disc)) / (g * dx));
}
// lead moving targets: t = dx / (v·cosθ); aim at pos + vel·t; iterate twice. Spread ±(1–3°)·(1 − accuracy).
```
Projectiles are instanced; hits = grid query along the segment each tick, units as vertical capsules (r 0.4 m, h 1.6 m).

### 4.9 Morale & rout
- Total War: morale falls faster when attacked from several sides; if the general dies, routing units shatter and can't rally ([TW wiki](https://totalwar.fandom.com/wiki/Morale)).
- (P) Base morale 60–90 by unit type. −4 per ally death within 6 m (recovers 1/s); −15 flanked, −25 rear; −25 own captain dies; −1/s inside Elias' fear aura, scaled by the place's **Miedo**; +10 near own captain; +5 winning the local fight. Below 25 → rout: flee to the nearest edge at 1.2× speed, drop the weapon (permanence), panic face. Rally above 40 after 5 s undamaged; never rallies if its captain is dead. Link: enemy starting morale −Miedo/5.

### 4.10 Auto-resolve & previews
- A full fight ≈ 200 units × 60 Hz × 60–120 s ≈ 0.7–1.4 M unit-updates: run skipped/auto-resolved fights headless in a Web Worker. Instant previews and Arena odds use Lanchester (§8.5), calibrated offline against headless sims.

## 5. Action combat feel (top-down + shoulder cam)

### 5.1 Buffering & forgiveness
- Celeste constants: coyote `JumpGraceTime 0.1 s`, `DashTime 0.15 s`, `DashCooldown 0.2 s` ([Player.cs](https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs)); philosophy: widen timing windows in the player's favor ([Thorson](https://threadreaderapp.com/thread/1238338574220546049.html)).
- (P) Buffer 120 ms for attack/cast and 150 ms for dodge; the latest press wins; presses during hitstop are kept and the window extends by the freeze time.
```ts
const buf = new Map<string, number>();                       // action → press time (ms, real clock)
export const press = (a: string) => buf.set(a, performance.now());
export function consume(a: string, windowMs: number, frozenMs = 0) {
  const t = buf.get(a); if (t !== undefined && performance.now() - t <= windowMs + frozenMs) { buf.delete(a); return true; }
  return false;
}
```
- Esquivar (GDD: 0.25 s i-frames). (P) 0.32 s total: i-frames 0.02–0.27 s, 0.05 s recovery, 2 charges, 0.9 s recharge. As in Hades, attacking or casting mid-dash ends immunity ([Hades Wiki](https://hades.fandom.com/wiki/Gameplay_mechanics)). Reference: Dark Souls 2 rolls give 6–17 i-frames at 30 fps depending on Agility ([DS2 wiki](https://darksouls2.wiki.fextralife.com/Agility)).
- (P) **Perfect dodge:** dodging ≤ 120 ms before a hit lands → 0.3× slow-mo for 0.8 s + counter window. Against a *copyable* attack it counts as "grazed": +1 Comprensión with no damage. This gives the Blue-Mage fantasy a skill path.

### 5.2 Mouse aim & aim assist
- Tactical cam: raycast the cursor onto a plane at **hand height** (not y = 0) to avoid parallax misses. Shoulder cam (V): raycast from the screen center, then fire from the hand toward that hit point.
```ts
const ray = new THREE.Raycaster(), aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2), hit = new THREE.Vector3();
export const aimPoint = (ndc: THREE.Vector2, cam: THREE.Camera) => (ray.setFromCamera(ndc, cam), ray.ray.intersectPlane(aimPlane, hit));
```
- Assist: score = angle + 0.02·distance inside a cone; bend the projectile up to 50% toward the best target. Relic Hunters Zero uses ~30° auto-aim, a 0.3 radial deadzone, and turning interpolated at ~12°/frame at 60 fps instead of snapping ([Venturelli](https://www.gamedeveloper.com/design/everything-i-learned-about-dual-stick-shooter-controls)). Cones widen with distance, where help matters most ([GameDev Pensieve](https://www.gamedevpensieve.com/design/design_mechanics/design_mechanics_aim-assist)). (P) Mouse 6–10°, gamepad 25–30°.

### 5.3 Camera
- Use a frame-rate-independent critically damped spring parameterized by half-life ([Holden, Spring-It-On](https://theorangeduck.com/page/spring-roll-call)). `x += (t − x)·0.1` per frame is frame-rate dependent (Eiserloh's weights assume 60 fps and need timescale scaling).
```ts
const negexp = (x: number) => 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
export function springTo(s: { x: number; v: number }, goal: number, halflife: number, dt: number) {
  const y = (4 * Math.LN2) / (halflife + 1e-5) / 2, j0 = s.x - goal, j1 = s.v + j0 * y, e = negexp(y * dt);
  s.x = e * (j0 + j1 * dt) + goal; s.v = e * (s.v - j1 * y * dt);
}
// tactical: goal = elias + clampLen(cursor − elias, 3.5)·0.25 per axis; halflife 0.12 s (0.08 s in combat)
```
- Order per frame: follow spring → look-ahead → FOV punch spring → trauma shake (applied last, never fed back). Shoulder rig (P): offset (0.6, 1.6, −3.5) m, FOV 60°, pull in when the camera collides.

### 5.4 Cast times & cooldown UX (P)
- Tiers: instant (Chispa Arcana), quick 150–250 ms (move freely), channel 400–800 ms (50% move speed), definitiva (R) 1.0 s with cut-in and 0.25× world. Esquivar cancels any cast; refund 75% of the cooldown if canceled before release.
- Icon: conic sweep (`background: conic-gradient(#0009 calc(var(--p) * 360deg), #0000 0)`, set `--p` from JS); numerals only above 2 s; "ready" pop (scale 1→1.15→1 over 150 ms + soft chime); pressing on cooldown → 3 px shake + dull thunk + buffered 150 ms; charges as pips.

### 5.5 Telegraphing
- Simple visual reaction time averages ~250 ms ([benchmarks](https://reactiontimetests.org/blog/what-is-a-good-reaction-time)), so windups must exceed reaction + input + dodge startup. (P) Melee ≥ 400 ms, ranged ≥ 500 ms, big AoE ≥ 800 ms, boss specials ≥ 1 s.
- Ground decals fill from the center and complete **exactly** at impact. Color language: red = damage, **violet `#9b5cff` = copyable** (Comprensión cue), yellow = interruptible. White rim flash 150 ms before impact; audio cue at windup start. With 200 units, only draw telegraphs that can reach Elias (≤ 15 m).

### 5.6 Damage numbers (Bangers, GDD)
- DOM pool (≤ 40 live) positioned with `translate3d` from projected world positions, or one canvas overlay. (P) Pop 1.6→1.0 in 90 ms (ease-out-back), rise 40 px over 700 ms, fade in the last 30%, x jitter ±12 px, size ∝ log10(dmg); crits 1.5×, orange/yellow + "!" + 2 px shake; merge hits on one target within 200 ms into a count-up; color by school; in big fights show only numbers that involve Elias.
```css
.dmg { position: absolute; font: 400 22px/1 'Bangers', system-ui; color: #fff; -webkit-text-stroke: 4px #1a1024;
  paint-order: stroke fill; will-change: transform, opacity; pointer-events: none; }
```

### 5.7 Copy (La Excepción) feedback loop
- Canon (GDD): Comprensión 1–5 per ability, crits count double; when full → **EXCEPCIÓN ADQUIRIDA** (cut-in, sound, 0.3 s slow-mo); +20% resistance per copied ability with that tag, cap 80%; mythic = immunity.
- Feel (P): every Comprensión tick = violet particle stream into Elias (300 ms) + a pip lighting on a floating ring over his head, so the player *sees* progress toward the copy mid-fight. The last pip triggers 90 ms hitstop → slow-mo → cut-in in rarity color → Códice +1 with a "NEW" pulse. Show "Resistencia Fuego 40%" chips in the HUD. This is also a visible near-miss ("4/5").

## 6. Adaptive music & SFX with Tone.js 15

### 6.1 Setup, unlock, mixing
- Browsers block audio until a user gesture. Call `await Tone.start()` in the first `pointerdown`/`keydown` ([Chrome autoplay policy](https://developer.chrome.com/blog/autoplay)). A "Presiona cualquier tecla" title gate doubles as the unlock and a fourth-wall beat.
- `Tone.now()` includes the context's `lookAhead` (default 0.1 s); `Tone.immediate()` does not. Use Transport/`now()` for music (keeps sync) and `immediate()` for input-driven SFX; Tone's docs warn that mixing the two within one sound can cause timing issues ([Tone perf wiki](https://github.com/Tonejs/Tone.js/wiki/Performance)). The wiki also suggests scheduling user-triggered sounds slightly ahead to avoid pops, and notes that ConvolverNode (Reverb) and HRTF panners are the most expensive nodes → **one shared reverb send**. Sync visuals with `Tone.getDraw().schedule()`.
```ts
import * as Tone from 'tone';
Tone.setContext(new Tone.Context({ latencyHint: 'interactive', lookAhead: 0.05 }));   // before creating nodes
export const master = new Tone.Limiter(-1).toDestination();
const bus = (db: number) => new Tone.Channel({ volume: db }).connect(master);
export const musicBus = bus(-8), sfxBus = bus(-4), uiBus = bus(-10);
const verb = new Tone.Reverb({ decay: 4.5, preDelay: 0.02, wet: 1 }).connect(master);     // the ONE convolver
new Tone.Channel({ volume: -6 }).receive('verb').connect(verb); sfxBus.send('verb', -14); musicBus.send('verb', -10);
const unlock = async () => { await Tone.start(); Tone.getTransport().start('+0.1'); };
addEventListener('pointerdown', unlock, { once: true }); addEventListener('keydown', unlock, { once: true });
document.addEventListener('visibilitychange', () => Tone.getDestination().volume.rampTo(document.hidden ? -60 : 0, 0.3));
```

### 6.2 Leitmotif: 5 notes, one "exception"
- Undertale threads its opening "Once Upon a Time" melody through overworld themes, the final boss, the closing "Good Night" and joke songs ([Undertale Wiki](https://undertale.wiki/w/Leitmotifs)). Do the same with one motif.
- (P) **Motif:** D4 F4 E4 A3 **G♯3**, rhythm ♩ ♪ ♪ ♩ ♩ (one 4/4 bar). G♯ is the tritone/♯4 in D: the "exception" note that never resolves… until the ending (G♯ → A → D).

| Mood | BPM / key | Treatment |
|---|---|---|
| Title | 72, D minor | celesta/FM bell motif over pad, stops on G♯, silence |
| Map (per continent) | 96, D Lydian (F♯) | plucked FM; swap lead instrument per continent (vertical variation) |
| Battle | 150, D minor | diminution (16ths), octave doubling, driving saw bass, membrane toms, brass stabs |
| Casino (Islas de Azar) | 124, swing 0.5 on 8n | walking bass; G♯ reharmonized as the 3rd of E7 — the exception *fits* here |
| Tension (Concilio, betrayal) | 60 | augmentation, first 3 notes only, D–G♯ tritone drone, clock tick |
| Ending | 66 → 40 | music box; motif finally resolves; `bpm.rampTo(40, 20)` = the box unwinding |
```ts
const MOTIF_MIN = [0, 3, 2, -5, -6], MOTIF_LYD = [0, 4, 2, -5, -6], BEATS = [1, 0.5, 0.5, 1, 1];
const bt = (b: number) => `0:${Math.floor(b)}:${(b % 1) * 4}`;                  // beats → "bars:quarters:sixteenths"
export function motifPart(inst: Tone.Synth, root = 'D4', steps = MOTIF_MIN, factor = 1) {
  let t = 0; const ev = steps.map((s, i) => { const e = { time: bt(t), note: Tone.Frequency(root).transpose(s).toNote(),
    dur: BEATS[i] * factor * 0.9 }; t += BEATS[i] * factor; return e; });
  return new Tone.Part((time, e) => inst.triggerAttackRelease(e.note, Tone.Time('4n').toSeconds() * e.dur, time), ev);
} // factor 0.25 = battle diminution, 2 = tension augmentation
```

### 6.3 Vertical layering, horizontal re-sequencing, crossfades
- Vertical layering adds/removes stems by intensity; horizontal re-sequencing jumps between segments on musical boundaries; stingers bridge events ([overview](https://www.thegameaudioco.com/making-your-game-s-music-more-dynamic-vertical-layering-vs-horizontal-resequencing)).
- Tone quantization: `"@1m"` = next measure on the Transport grid; `"+1m"` = relative ([Time wiki](https://github.com/Tonejs/Tone.js/wiki/Time)). `CrossFade` is equal-power (`fade` 0 = a, 1 = b) ([docs](https://tonejs.github.io/docs/15.1.22/classes/CrossFade.html)).
```ts
const L = { pad: new Tone.Channel(0), bass: new Tone.Channel(-60), drums: new Tone.Channel(-60), lead: new Tone.Channel(-60) };
Object.values(L).forEach(c => c.connect(musicBus));
export function setIntensity(x: number) { const on = (thr: number) => (x >= thr ? 0 : -60);   // x: foes near, HP, boss phase → 0..1
  L.bass.volume.rampTo(on(0.25), '1m'); L.drums.volume.rampTo(on(0.5), '1m'); L.lead.volume.rampTo(on(0.75), '1m'); }
export const goToSection = (cur: Tone.Part, next: Tone.Part) =>
  Tone.getTransport().scheduleOnce(t => { cur.stop(t); next.start(t); }, '@4m'); // phrase boundary
const xf = new Tone.CrossFade(0).connect(master);             // deck A/B for mood changes (map ↔ casino)
export const toDeckB = () => xf.fade.rampTo(1, 3);            // 3 s equal-power; stop A's parts afterwards
// stingers (victory, jackpot, EXCEPCIÓN): duck musicBus −8 dB for 1.5 s, fire at '@4n'
```

### 6.4 SFX recipes (pool synths once; never create nodes per sound)
- The Super Mario coin is two square-wave notes, B5 → E6 ([Game Audio Lookout](https://medium.com/game-audio-lookout/musical-sound-effects-in-the-super-mario-series-b14872fb2d94)). Choir formants /ɑ/ ≈ 730/1090/2440 Hz, /u/ ≈ 300/870/2240, /i/ ≈ 270/2290/3010 (Peterson & Barney, adult male) ([Praat table](https://www.fon.hum.uva.nl/praat/manual/Create_formant_table__Peterson___Barney_1952_.html)).
```ts
const now = () => Tone.immediate() + 0.01;
const coinS = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0.25, release: 0.08 }, volume: -16 }).connect(sfxBus); coinS.maxPolyphony = 6;
export function coin(t = now(), semis = 0) { const f = (n: string) => Tone.Frequency(n).transpose(semis).toFrequency();
  coinS.triggerAttackRelease(f('B5'), 0.055, t); coinS.triggerAttackRelease(f('E6'), 0.28, t + 0.055); }
export const coinShower = (n: number, t = now()) => { for (let i = 0; i < n; i++) coin(t + i * (0.04 + Math.random() * 0.03), (Math.random() * 4 - 2) | 0); };
const tickS = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.018, sustain: 0 }, volume: -20 })
  .connect(new Tone.Filter({ type: 'highpass', frequency: 2500 }).connect(sfxBus));
export const reelTick = (t = now()) => tickS.triggerAttackRelease(0.02, t);     // rate follows reel speed
const wBp = new Tone.Filter({ type: 'bandpass', frequency: 600, Q: 3 }), wPan = new Tone.Panner(0);
const whooshS = new Tone.NoiseSynth({ noise: { type: 'pink' }, envelope: { attack: 0.06, decay: 0.3, sustain: 0, release: 0.1 }, volume: -8 });
whooshS.chain(wBp, wPan, sfxBus);
export function whoosh(pan = 0, t = now()) { wPan.pan.setValueAtTime(pan, t);
  wBp.frequency.setValueAtTime(400, t); wBp.frequency.exponentialRampToValueAtTime(2400, t + 0.15);
  wBp.frequency.exponentialRampToValueAtTime(700, t + 0.4); whooshS.triggerAttackRelease(0.35, t); }
const hitFm = new Tone.FMSynth({ harmonicity: 1.5, modulationIndex: 18, envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.1 },
  modulationEnvelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }, volume: -10 }).connect(sfxBus);
const sparkle = new Tone.MetalSynth({ harmonicity: 12, modulationIndex: 20, resonance: 7000, octaves: 1.5,
  envelope: { attack: 0.001, decay: 0.12, release: 0.05 }, volume: -28 }).connect(sfxBus);
export function arcaneHit(t = now()) { hitFm.detune.setValueAtTime(0, t); hitFm.detune.linearRampToValueAtTime(-1200, t + 0.2);
  hitFm.triggerAttackRelease('C5', 0.2, t); sparkle.triggerAttackRelease('C6', 0.08, t + 0.01); }
const boomLp = new Tone.Filter({ type: 'lowpass', frequency: 3000, rolloff: -24 });
const boomN = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.005, decay: 1.1, sustain: 0, release: 0.2 }, volume: -4 });
boomN.chain(boomLp, new Tone.Distortion(0.3), sfxBus);
const kick = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 6, envelope: { attack: 0.001, decay: 0.6, sustain: 0, release: 0.2 } }).connect(sfxBus);
export function explosion(t = now()) { boomLp.frequency.setValueAtTime(3000, t); boomLp.frequency.exponentialRampToValueAtTime(120, t + 1);
  boomN.triggerAttackRelease(1, t); kick.triggerAttackRelease('C1', 0.5, t); }
const clickS = new Tone.MembraneSynth({ pitchDecay: 0.004, octaves: 2, envelope: { attack: 0.001, decay: 0.03, sustain: 0, release: 0.01 }, volume: -14 }).connect(uiBus);
export const uiClick = () => clickS.triggerAttackRelease('C6', 0.02, now());
const brass = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sawtooth' }, envelope: { attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.4 }, volume: -16 });
brass.chain(new Tone.Filter(2500, 'lowpass'), sfxBus); brass.maxPolyphony = 8;
export function levelUp(t = now()) { const s = 0.09; ['G4', 'C5', 'E5'].forEach((n, i) => brass.triggerAttackRelease(n, s * 0.9, t + i * s));
  brass.triggerAttackRelease('G5', 0.25, t + 3 * s); brass.triggerAttackRelease(['C5', 'E5', 'G5', 'C6'], 0.9, t + 3 * s + 0.27); }
const choirOut = new Tone.Gain(0.9).connect(sfxBus);                                     // sfxBus already sends to reverb
const formants = ([[730, 1], [1090, 0.5], [2440, 0.3]] as const)
  .map(([f, g]) => new Tone.Filter({ type: 'bandpass', frequency: f, Q: 9 }).connect(new Tone.Gain(g).connect(choirOut)));
const choir = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 25 },
  envelope: { attack: 0.35, decay: 0.3, sustain: 0.8, release: 2.5 }, volume: -6 });
choir.fan(...formants);
export const ominous = (t = now()) => { choir.triggerAttackRelease(['D3', 'A3', 'D4', 'F4', 'G#4'], 1.6, t); kick.triggerAttackRelease('D1', 1, t); };
// jackpot: FMSynth bell (harmonicity 3.5, modIndex 12) arpeggio C5 E5 G5 C6 E6 G6 C7 in 16ths + coinShower(30) + held C-major pad 2–3 s
// text blips (Undertale-style): square 5 ms, pitch per NPC, one every 30–45 ms of revealed text
```

### 6.5 Avoiding clicks & voice explosions
- Envelope attack ≥ 1–5 ms, release ≥ 10–30 ms; never set gains instantly (`rampTo(v, 0.02)`); exponential ramps can't reach 0 (use linear, or 1e-4); ramp the gain to 0 over 10–20 ms before stopping a source.
- Pool synths per SFX type; `PolySynth.maxPolyphony` 6–8; ≥ 30 ms between identical triggers; randomize pitch ±5% / gain ±2 dB; master `Limiter(-1)`.

## 7. Strategy-layer simulation

### 7.1 Prices: supply/demand + mean reversion
- Victoria 3: `price = base · [1 + 0.75 · clamp((BUY − SELL)/min(BUY, SELL), ±1)]`, i.e., ±75% of base; e.g., wood base 20 with 100 buy / 120 sell orders → 17 ([Vic3 wiki](https://vic3.paradoxwikis.com/Market)). GDD wants `base × f(stock/objetivo)`; with `r = stock/target` the Vic3 form becomes `f(r) = 1 + 0.75·clamp((1 − r)/min(1, r), ±1)` (saturates at r ≤ 0.5 and r ≥ 2). The softer alternative is `f(r) = clamp(r^−0.6, 0.3, 3)`.
- Mean reversion: the displayed price moves 25% toward target each luna + small noise (Ornstein–Uhlenbeck: `x += θ(μ − x)dt + σ√dt·N(0,1)`); stock += production − consumption ± caravans. Player trades walk the curve (slippage), so dumping 50 swords crashes the local price.
```ts
export const priceFactor = (stock: number, target: number) => {
  const r = Math.max(1e-3, stock / target); return 1 + 0.75 * Math.max(-1, Math.min(1, (1 - r) / Math.min(1, r))); };
export function sellRevenue(base: number, stock: number, target: number, qty: number) {
  let sum = 0; for (let i = 0; i < qty; i++) sum += base * priceFactor(stock + i, target); return Math.round(sum); }
export function lunaTick(g: Good, rnd: () => number) {
  g.stock = Math.max(0, g.stock + g.prod - g.cons);
  const target = g.base * priceFactor(g.stock, g.target);
  g.price += (target - g.price) * 0.25 + g.base * 0.02 * (rnd() * 2 - 1);
}
```
- Caravans: pick the route maximizing `(sellDest − buySrc)·qty − lunasTravel·upkeep − risk·cargo`. Delivery moves stock, so arbitrage flattens prices. Raiding one (GDD) causes a shortage → price spike → rumor + contract. 8 goods × ~40 places = 320 prices per luna, which is trivial.

### 7.2 Reputation tiers
- WoW: Hated −42000…−6001 (36,000 to climb), Hostile −6000…−3001, Unfriendly −3000…−1, Neutral 0…2999, Friendly 3000…8999, Honored 9000…20999, Revered 21000…41999, Exalted 42000+ ([Warcraft Wiki](https://warcraft.wiki.gg/wiki/Reputation)). Tier widths grow 3k → 6k → 12k → 21k: a long tail that makes the top tiers feel earned.
- GDD maps rep to −100..100 with near-equal bands. (P) Keep WoW's long-tail feel with a diminishing gain multiplier: `gain × (1 − 0.12·tierIndexAboveNeutral)`. Each tier unlocks something concrete (prices −5/−10/−15/−20%, recruits, quests, a Concilio vote lean).
```ts
const TIERS = [['Odiado', -100], ['Hostil', -75], ['Antipático', -40], ['Neutral', -10], ['Amistoso', 15],
  ['Honorable', 40], ['Reverenciado', 65], ['Exaltado', 90]] as const;
export const tierOf = (rep: number) => [...TIERS].reverse().find(([, min]) => rep >= min)![0];
```

### 7.3 Concilio voting (UN-like)
- Stellaris Galactic Community: a resolution passes if the diplomatic weight *for* exceeds the weight *against*; weight comes from fleet, economy, tech, pops; favors can each add 10% of another member's weight to your side, with caps; council members can force emergency votes on a cooldown ([Stellaris wiki](https://stellaris.fandom.com/wiki/Galactic_community), [Fanbyte](https://www.fanbyte.com/legacy/stellaris-galactic-community-guide-resolutions-list-diplomatic-weight-explained)).
- CK3 leverage: **hooks** — a weak hook is single-use; a strong hook only goes on cooldown and blocks hostile actions. Blackmail with a *Shunned* secret gives a weak hook, a *Criminal* one a strong hook; refusal exposes the secret ([CK3 Hooks](https://ck3.paradoxwikis.com/Hooks)). **Dread:** a target is Intimidated at dread ≥ boldness + 20 and Terrified at ≥ +45; dread decays 0.5/month toward its natural value ([CK3 Attributes](https://ck3.paradoxwikis.com/Attributes)); e.g., +50/+100 to blackmail acceptance ([GameRant](https://gamerant.com/ck3-crusader-kings-3-how-why-gain-dread/)).
- Model on the GDD stance meter (−100..100):
```ts
export function stance(d: Delegate, r: Resolution, e: Elias) {
  const fear = e.miedo[d.continent], bold = d.boldness + (d.traits.includes('Orgulloso') ? 15 : 0) - (d.traits.includes('Cobarde') ? 25 : 0);
  const intimidated = fear >= bold + 20, terrified = fear >= bold + 45;          // CK3 thresholds; "los valientes resisten" (GDD)
  return d.ideology(r) + 0.5 * d.opinionOfElias + d.bribe * (d.traits.includes('Codicioso') ? 2 : 1)
    + (d.hook === 'strong' ? 60 : d.hook === 'weak' ? 30 : 0) + (terrified ? 50 : intimidated ? 25 : 0)
    + (d.dominated ? 100 : 0) + (d.continentCorrupted ? 100 : 0);        // clamp −100..100 for the UI meter
}
export const pYes = (s: number) => 1 / (1 + Math.exp(-s / 15));          // secret ballot → show a forecast band
```
- Reveal votes one by one, the undecided last, with a slow counter and a heartbeat stinger: the vote *is* a near-miss machine. Assassinate: Alerta +25 (GDD).

### 7.4 Fear vs love
- Machiavelli, *The Prince* ch. XVII: if you must choose, it is "much safer to be feared than loved" ([Gutenberg](https://www.gutenberg.org/files/1232/1232-h/1232-h.htm)). Games make that trade explicit:
- **Dungeon Keeper** — a slap doubles a creature's speed and boosts work skills but hurts health and happiness; the torture chamber speeds up that creature's kin by 25% at half pay, but anger builds ([Hand of Evil](https://dungeonkeeper.fandom.com/wiki/Hand_of_Evil), [Torture Chamber](https://dungeonkeeper.fandom.com/wiki/Torture_Chamber)). **Overlord** — the corruption meter changes appearance (spikes from 10%, dark haze at 50%), spells and the ending ([wiki](https://overlord.fandom.com/wiki/Corruption)). **Tropico** — executions and arrests make families and witnesses lose approval and turn rebel ([wiki](https://tropico.fandom.com/wiki/Special_Action_(Tropico_3_and_4))). **CK3** — dread (§7.3); accepting a faction's ultimatum costs 20 dread.
- (P) Per place: `miedo`, `lealtad` (love), hidden `resentimiento`. Fear gives compliance (taxes +, unrest suppressed, enemy morale −) and decays fast when Elias is away (half-life 6 lunas); love gives volunteers, discounts, votes, and decays slowly (half-life 20 lunas). Each terror act adds `resentimiento += 0.5·ΔMiedo`, which spreads 20% along roads to neighbors.

### 7.5 Rebellion thresholds
- CK3: factions accrue discontent while their military power exceeds 80% of the liege's; at 100% discontent they send an ultimatum → accept or civil war ([Dev Diary #19](https://forum.paradoxplaza.com/forum/threads/ck3-dev-diary-19-factions-and-civil-wars.1363951/), [GameRant](https://gamerant.com/crusader-kings-3-how-to-handle-factions-guide/)).
```ts
export function unrestTick(p: Place, rnd: () => number) {           // once per luna
  const unrest = p.resentimiento + p.hardship - 0.6 * p.miedo - 0.4 * p.lealtad;
  if (unrest > 50) p.production *= 0.9;                               // protests
  if (unrest > 75 && rnd() < 0.05 * (unrest - 75) / 5) spawnRebels(p); // 5% per 5 points above 75
  if (p.rebelStrength >= 0.8 * p.garrison) p.discontent += (p.rebelStrength / p.garrison - 0.8) * 50;
  if (p.discontent >= 100) ultimatum(p);                              // accept: −20 Miedo, +10 Lealtad | refuse: battle
}
```

## 8. Casino minigame design (Islas de Azar)

### 8.1 Tragamonedas de Reliquias (5×3)
- Weighted virtual reels date to Telnaes' 1984 patent; weighting blanks around a top symbol ("clustering") creates near-misses. With blank/TopAward/blank weighted 6/1/6 out of 50 virtual stops, the top symbol shows in the window 26% of the time but lands on the payline only 2% ([patent background](https://patents.google.com/patent/US9659445B2/en), [Harrigan](https://link.springer.com/article/10.1007/s11469-007-9139-8)).
- (P) Cap the blank:top ratio at 3:1 (honest-ish drama). Target RTP 92–96% (a gold sink), hit frequency 25–35%. The GDD scatter (Eclipse) is where near-misses live: with 2 Eclipses landed, reels 4–5 **anticipate** (extra 1.0–1.5 s spin, slower ticks, riser, glow).
- Tune RTP by Monte Carlo at build time in Node: the standard error is ≈ σ/√N, so 10⁷ spins give roughly ±0.3–0.5 RTP points for typical σ. Exact enumeration works for 3-reel minis like Tres Dados.
```ts
export function simulate(reels: number[][], evalSpin: (grid: number[][]) => number, N = 1e7, rnd = Math.random) {
  let paid = 0, hits = 0; const grid = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let s = 0; s < N; s++) {
    for (let r = 0; r < 5; r++) { const L = reels[r].length, stop = (rnd() * L) | 0;
      for (let row = 0; row < 3; row++) grid[r][row] = reels[r][(stop + row) % L]; }
    const w = evalSpin(grid); paid += w; if (w > 0) hits++;
  }
  return { rtp: paid / N, hitFreq: hits / N };                  // evalSpin returns payout in bet units (lines, wilds, scatters)
}
```
- Win celebration (P): net < 0 → no fanfare; 1–3× → 0.8 s; 3–10× → 1.5–2.5 s "¡GANANCIA!"; ≥ 10× → "¡GRAN GANANCIA!" 4–6 s (industry "big win" thresholds run 10–25× bet by manufacturer ([Flip the Switch](https://fliptheswitch.com/what-constitutes-a-big-win-on-slots/))); ≥ 50× or jackpot → "¡EXCEPCIONAL!" 8–12 s. Count-up with ease-out, coin rate tied to count speed, always skippable (click = jump to total). Progressive: 1.5% of each bet feeds the pot, shown growing live.

### 8.2 La Rueda de las Almas (37 pockets)
- Single-zero wheel: straight bets pay 35:1 → EV = 36/37 − 1 = **−2.70%** (double-zero 38 pockets: −5.26%). Even-money Sol/Luna, par/impar and docenas carry the same edge.
- Honest animation: pick the pocket with RNG first, then solve the spin so constant deceleration lands on it:
```ts
export function spinTo(pocket: number, fromAngle: number, pockets = 37, alpha = 3, rnd = Math.random) {
  const slot = (2 * Math.PI) / pockets, target = pocket * slot + (rnd() - 0.5) * slot * 0.6;
  const delta = (4 + ((rnd() * 3) | 0)) * 2 * Math.PI + ((((target - fromAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
  const w0 = Math.sqrt(2 * alpha * delta); return { w0, duration: w0 / alpha }; // θ(t) = w0·t − ½·alpha·t² (~4.5 s)
}
```
- Velo cheat ("empujar la bola"): shift the landing ±1 pocket; suspicion per §8.6.

### 8.3 Veintiuno del Tarot
- Blackjack rule costs to the player: 6:5 naturals ≈ +1.39% house edge, dealer hits soft 17 ≈ +0.22%, double-after-split ≈ −0.15% ([Casino.org](https://www.casino.org/blog/blackjack-house-edge/)). Base on 3:2, S17, DAS.
- A Latin-suited tarot (espadas, copas, oros, bastos) has 14 ranks per suit: As–10, Sota, Caballo, Reina, Rey. That makes 20/56 = 35.7% ten-valued cards vs 16/52 = 30.8% in a standard deck → more naturals **and** more busts. The 22 Arcanos (GDD: El Loco, La Torre, El Mundo, El Sol, La Luna, La Muerte…) would be 28% of a full 78-card shoe, far too often. (P) Shuffle in 6 majors per 56-card shoe (~10%), or give each deal a 12% chance to flip from a separate Arcana deck.
- Tune the edge (target 1–3%) with a 10⁶-hand Monte Carlo in a Worker using a simple basic-strategy bot; re-run whenever an Arcana effect changes. Dominar Mente on the dealer (GDD) = see the hole card → suspicion.

### 8.4 Dados Mentirosos AI
- Unknown dice follow a binomial: P(at least k of face f among n) with p = 1/6 (1/3 if ones are wild); bidding the expected count (rounded down) is right more often than not ([Wikipedia](https://en.wikipedia.org/wiki/Liar%27s_dice)).
```ts
export function pAtLeast(k: number, n: number, p: number) {       // P(X ≥ k), X ~ Bin(n, p)
  if (k <= 0) return 1; if (k > n) return 0; let term = (1 - p) ** n, cdf = 0;
  for (let i = 0; i < k; i++) { cdf += term; term *= ((n - i) / (i + 1)) * (p / (1 - p)); }
  return 1 - cdf; }                                                  // k=4, n=10, p=1/3 → 0.44
export function aiTurn(me: Tahur, bid: Bid, unknown: number, wild: boolean) {
  const p = wild && bid.face !== 1 ? 1 / 3 : 1 / 6, mine = me.count(bid.face, wild);
  const pTrue = pAtLeast(bid.qty - mine, unknown, p) + me.readBonus(bid);  // readBonus: +belief if the bidder repeated the face
  if (pTrue < me.challengeThreshold) return { call: '¡Mentiroso!' };        // personality 0.3–0.5 (see memory note below)
  const options = me.legalRaises(bid).map(b => ({ b, s: pAtLeast(b.qty - me.count(b.face, wild), unknown, p) + (me.rnd() < me.bluff ? 0.25 : 0) }));
  return { raise: softmaxPick(options, me.temperature) }; }
```
- Named rivals remember you (§2): once they catch you cheating, their challenge threshold rises by +0.1–0.15, so they call "¡Mentiroso!" sooner. Magic (GDD): Dominar Mente = see one rival's dice; Velo = change one die. El Dado de Hueso de Dios = one reroll per game. Precedent: Kingdom Come: Deliverance 2's dice use loaded dice and badges that bend the rules, and most NPC dice are loaded too ([GamesRadar](https://www.gamesradar.com/games/action-rpg/kingdom-come-deliverance-2-dice-how-to-play/)).

### 8.5 Arena del Remolino: odds from army strength
- Lanchester's square law: aimed-fire fighting strength ∝ (unit quality) × N², so 3× numbers ≈ 9× strength ([Wikipedia](https://en.wikipedia.org/wiki/Lanchester%27s_laws), [Ernest Adams](https://www.gamedeveloper.com/design/the-designer-s-notebook-kicking-butt-by-the-numbers-lanchester-s-laws)). Melee-heavy armies sit closer to the linear law, so blend.
- Bookmaking: overround = Σ(1/odds) − 1 ([Wikipedia](https://en.wikipedia.org/wiki/Mathematics_of_bookmaking)). Quote `o = 1/(p·(1 + m))` and the book sums to 1 + m.
```ts
export function winProb(A: { n: number; q: number }, B: { n: number; q: number }, k = 1.5) { // k fitted on headless sims
  const sa = A.q * A.n ** 2, sb = B.q * B.n ** 2; return 1 / (1 + (sb / sa) ** k); }
export function quote(pA: number, margin = 0.07) {
  const c = (p: number) => Math.min(20, Math.max(1.02, 1 / (p * (1 + margin)))); return { a: c(pA), b: c(1 - pA) }; // pA .62 → 1.51 / 2.46
}
```
- Run the real fight deterministically (seeded) after bets close. Bettors watch in 3D (GDD). Entering invisible to influence = cheat with the highest visibility (§8.6).

### 8.6 Cheating & detection (Los Ojos de la Casa)
- (P) Suspicion 0–100 per casino. Each cheat adds `12 × visibility × (1 − stealth)`; improbable wins also raise it, even honest ones (fun paranoia): `+6 × max(0, −log10(P(outcome)) − 1)`, so a 1-in-1000 win adds 12. Decays 1/s idle and 10 per clean game.
- Catch roll per cheat: `P = min(0.95, (s/100)² × visibility × (1 − stealth))`. Thresholds: 30 an eye icon appears and the dealer comments; 60 warning; 80 security approaches (talk / bribe / intimidate with Miedo); 100 caught → fine or guard fight, Banca rep down (GDD), plus a nemesis memory "Me hizo trampa".
- Blue-Mage synergy: the security mage's *Detectar Magia* is copyable; its Comprensión grants resistance that lowers future detection.

## 9. Fourth-wall & meta narrative (tasteful, browser-native)

### 9.1 What the references do
- **Undertale:** finishing a Genocide run sets a permanent flag that survives the in-game True Reset and alters later Pacifist endings; clearing it means deleting files outside the game ([SAVE](https://undertale.fandom.com/wiki/SAVE), [Genocide Route](https://undertale.fandom.com/wiki/Genocide_Route)).
- **Doki Doki Literature Club:** character files (`.chr`) sit in the install folder; Monika deletes the others, and the player can delete `monika.chr` to change the ending ([ScreenRant](https://screenrant.com/doki-doki-literature-club-plus-delete-monika/)).
- **Inscryption:** Act III bosses add rules, photograph the board, ask for files from your drive, and use your Steam friends list ([GameSpot](https://www.gamespot.com/articles/inscryption-ending-explained-arg-secrets-and-whats-going-on-in-the-story/1100-6497568/)). That drew privacy criticism for pulling real data through a fiction ([Pixel Poppers](https://pixelpoppers.com/2022/02/inscryption-and-privacy/)).
- **Pony Island:** fake crash screens, fake Steam dialogs and friend messages, random notification sounds, a fake "not responding" stall ([Wikipedia](https://en.wikipedia.org/wiki/Pony_Island), [NYMG](https://www.nymgamer.com/?p=12935)).
- **The Stanley Parable:** real-clock achievements — "Go Outside" (don't play for five years), "Commitment" (run the game for an entire Tuesday) ([PC Gamer](https://www.pcgamer.com/you-can-finally-get-this-elusive-the-stanley-parable-achievement/)).

### 9.2 La Excepción techniques (fit the GDD's "Siempre estuve viéndote")
- **Narrator memory ≠ save.** Store a separate `lx.narrator` record that survives "Nuevo juego" and cycles, the Undertale-style scar. Only an explicit "Borrar todo (de verdad)" in settings clears it, and the narrator comments on that too.
- **Person shift as a UI event:** 3rd person ("Elias caminó…") → 2nd when the player defies the script ("Tú entraste. Él no.") → 1st ("Caminé…"). Shift font/color subtly with each person (EB Garamond italic for 1st) so the change *reads* without explanation (GDD).
- **Real-world signals the browser gives for free (no permissions):** local hour (the GDD ending: "Son las 2:14 de la madrugada, por cierto."), time since last visit, session count, tab hidden/shown ([Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)), reload vs fresh load ([`PerformanceNavigationTiming.type`](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceNavigationTiming/type)), idle time, hesitations (sacrifice screen opened/closed), `navigator.language` for the default language. **Never print dates or years** (GDD); "Hace tres lunas de tu mundo que no venías" is fine.
- **Refresh = anti-save-scum, told as story:** autosave every wave, keep `inBattle` in sessionStorage; on a reload mid-battle, resume the battle and the narrator notes it ("Recargar no borra lo que vi.").
- **Tab away:** pause; `document.title = '(…) La Excepción'`; on return, a line keyed to time away ("Te fuiste. Él esperó." — GDD).
- **Save-edit awareness:** a checksum mismatch triggers a playful line ("Editaste la realidad. Lindo.") with no punishment.

```ts
interface NarratorMem { v: 1; first: number; last: number; sessions: number; cycles: number; deaths: number;
  reloadsMidBattle: number; awaySeconds: number; hesitations: number; scars: string[]; seen: Record<string, number> }
const KEY = 'lx.narrator';
export function loadMem(): NarratorMem {
  try { const m = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (m?.v === 1) return m; } catch { /* private mode */ }
  return { v: 1, first: Date.now(), last: Date.now(), sessions: 0, cycles: 0, deaths: 0, reloadsMidBattle: 0, awaySeconds: 0, hesitations: 0, scars: [], seen: {} };
}
export const saveMem = (m: NarratorMem) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* quota */ } };
const mem = loadMem(); const daysAway = (Date.now() - mem.last) / 864e5; mem.sessions++; mem.last = Date.now(); // phrase vaguely, no dates
const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
if (nav?.type === 'reload' && sessionStorage.getItem('lx.inBattle') === '1') mem.reloadsMidBattle++;
const hour = new Date().getHours(), timeTag = hour < 5 ? 'madrugada' : hour < 12 ? 'mañana' : hour < 19 ? 'tarde' : 'noche';
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => { if (document.hidden) { hiddenAt = Date.now(); document.title = '(…) La Excepción'; return; } // + pause
  document.title = 'La Excepción'; mem.awaySeconds += (Date.now() - hiddenAt) / 1000; saveMem(mem); /* narrator.onReturn(...) */ });
const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
// save = { data, sum: fnv(SALT + JSON.stringify(data)) } → mismatch ⇒ narrator line only
```
- **Storage reality:** localStorage is ~5 MiB per origin, best-effort; `navigator.storage.persist()` requests persistence ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)). Safari's ITP deletes all script-writable storage after 7 days of Safari use without interaction (home-screen web apps are exempt) ([WebKit](https://webkit.org/tracking-prevention/)). So call `persist()` after the first finished cycle (not on load) and offer an "Exportar alma" save code; the narrator can joke: "Tu navegador olvida. Yo no."
- **Don'ts:** never mimic OS/browser dialogs or system notifications (phishing-like; Pony Island did it inside a desktop app, not a browser tab); never request camera/mic/notifications/geolocation for a gag; never read clipboard or files; no `beforeunload` traps except for genuinely unsaved progress; no fake "browser crashed" screens. Ship "Narrador: Completo / Sutil / Apagado" and "Efectos meta: on/off", plus a content note if dark themes intensify.

## Top 25 implementation rules for La Excepción

1. **Every defeat pays out:** Tinta > 0, at least one new reactive line, one nemesis update. Death advances the story.
2. Title → control < 15 s; defeat → control < 10 s; something notable every 3–5 min (GDD).
3. The death/cycle screen always shows **3 open loops** (short/medium/long), each with a one-click "continue".
4. Dialogue selector = conditions → highest priority tier → weighted random, with `once` and cooldowns (Hades pattern).
5. Rarity = WoW hex ladder + a distinct frame shape; the beam color announces rarity *before* the reveal.
6. Pozo: visible pity counters (soft 25 / hard 40 legendary, épica every 10), shards for duplicates.
7. **Outcome first, presentation second.** No fabricated near-misses; publish RTP/odds; celebrate only net wins.
8. No real money, no purchasable anything, no punitive dailies; Presagios reward and never punish (PEGI 2026).
9. Hitstop 40–90 ms per hit (GDD), ≤ 250 ms per rolling second; only hits involving Elias freeze time in big fights.
10. Trauma shake: trauma², Perlin-style noise, rotational, decays ~1.1/s; exposed as a % slider.
11. Impact frames ≤ 1 sequence per 700 ms (≤ 3 flashes/s, WCAG 2.3.1); "Reduce flashing" swaps to desaturate + zoom.
12. One `InstancedMesh` per body-part type; outline twin shares `instanceMatrix`; target ≈ 40–60 draw calls, < 100 always.
13. Only uniform scale in instance matrices; bake proportions into geometry. `setColorAt` before the first render.
14. Toon: 4-texel NearestFilter ramp `[0,0,.6,1]`, violet-tinted shadow via `getGradientIrradiance` override, lit-side rim; DirectionalLight ≈ 3 (physical units).
15. Bloom via HDR emissive (2–4) + threshold 0.9 instead of selective passes; order `Render → Bloom → Output → AnimeFinal`; MSAA via a `samples: 4` composer target.
16. Poses at 12 fps ("on twos"); root motion, camera and VFX at 60 fps.
17. Alive = kinematic steering + springs; dead/knocked-out = Verlet ragdoll (6 iterations); ≤ 40 active; corpses freeze and stay (permanence).
18. Counting-sort grid rebuilt each tick for separation/hits; targeting staggered 0.3–0.6 s with 0.7× hysteresis; ≤ 4 melee attackers per target.
19. Battles are fixed-step, seeded and deterministic (replays, Arena, headless calibration of Lanchester k).
20. Input buffer 120–150 ms; Esquivar i-frames 0.25 s; acting mid-dodge ends i-frames; perfect dodge on a copyable attack = +1 Comprensión.
21. Telegraph windups ≥ 400/500/800/1000 ms (melee/ranged/AoE/boss); decals complete exactly at impact; violet = copyable.
22. Camera: half-life critically damped spring (0.08–0.12 s) + 25% cursor look-ahead; shake applied last.
23. Audio: unlock on first gesture; `immediate()` for SFX, Transport for music; pooled synths; one reverb send; section changes on `@1m`/`@4m`.
24. One 5-note leitmotif (D F E A G♯) in every mood; G♯ resolves only in the ending.
25. Narrator memory lives apart from the save, reacts to cycles, reloads, time away and local hour, never shows dates/years, never fakes OS dialogs or asks for permissions, and has Subtle/Off modes. **Nemesis systems need a patent review before commercial release.**
