# La Excepción — Code Architecture & Team Rules

Read `docs/GDD.md` (design, Spanish) first, then this file. `docs/RESEARCH.md` (if present) has technique references.

## Stack
Vite 8 · TypeScript 7 (strict) · Three.js r186 (WebGLRenderer + EffectComposer) · Tone.js 15 (audio only) · plain DOM/CSS UI (no framework). All visible text is **Spanish**. No image/audio asset files: everything is procedural (SVG strings, canvas textures, primitives, synthesized audio).

- Dev server: `npm run dev` → http://127.0.0.1:5173 (already running — do NOT start another).
- Type-check: `npx tsc --noEmit -p .` (filter to your folders; other agents are mid-work).
- Jump straight into a scene: `http://127.0.0.1:5173/?scene=<id>&<param>=<value>` → `engine.goto(id, { debug: true, ...query })` after creating/loading a run. `&fps` shows an FPS/draw-call overlay. `?scene=dev` is the look-lab.
- Console handle: `window.LX` → `{ engine, G, newRun, loadRun, saveRun }`.

## Folder ownership (only edit what you own; ask the integrator via your final report for anything else)
| Path | Owner |
|---|---|
| `src/core/*`, `src/render/*`, `src/ui/*.ts` (not `art/`), `src/ui/theme.css`, `src/characters/*`, `src/data/types.ts`, `src/data/world.ts`, `src/scenes/dev`, `src/scenes/index.ts`, `src/systems/index.ts`, `src/main.ts`, `src/battle/api.ts` (contract) | **core / integrator** |
| `src/audio/*` | audio agent |
| `src/ui/art/*` | 2D art agent |
| `src/data/*` (except `types.ts`, `world.ts`, and the story data files below), `src/systems/progression/*` | **content & progression agent** |
| `src/battle/*` (except `api.ts`: add-only) | **battle agent** |
| `src/scenes/overworld/*`, `src/scenes/location/*`, `src/systems/world/*` | **world agent** |
| `src/systems/society/*`, `src/scenes/council/*` | **society agent** |
| `src/casino/*` | **casino agent** |
| `src/scenes/title/*`, `src/scenes/prologue/*`, `src/scenes/ending/*`, `src/scenes/margins/*`, `src/systems/story/*`, `src/data/story.ts`, `src/data/pages.ts`, `src/data/achievements.ts`, `src/data/margins.ts` | **story agent** |

Each module folder has an `index.ts` stub already wired into `src/scenes/index.ts` / `src/systems/index.ts`. Replace the stub's content; keep the file.
CSS: each module creates its own `*.css` file imported from its TS (Vite bundles it) with a class prefix: `.ow-` overworld, `.loc-` location, `.bt-` battle, `.cs-` casino, `.pol-` council/politics, `.st-` story, `.pg-` progression. Reuse the tokens and classes from `src/ui/theme.css` (`.lx-panel`, `.lx-btn`, `.lx-chip`, `.lx-bar`, `.lx-title`, `.lx-book`, `.lx-impact`, rarity classes `.r-epica`…).

## Core APIs (import paths relative to `src/`)

### Engine & scenes — `core/engine.ts`
```ts
registerScene(id, () => new MyScene());           // GameScene: { id, scene: THREE.Scene, camera, enter(params), exit(), update(dt,time), lateUpdate?(realDt), render?(dt), resize?, persistent?, domOnly? }
engine.goto(id, params?, { fade?: number, card?: { title, subtitle?, hold? } })   // fade-to-black transitions; card = Fragment title card
engine.hitstop(ms); engine.slowmo(scale, seconds); engine.paused; engine.time; engine.realTime
engine.pipeline  // post FX (below) · engine.renderer · engine.toScreen(vec3) → {x,y,visible}
```
Scene IDs: `title`, `prologue`, `battle`, `overworld`, `location`, `casino`, `council`, `ending`, `margins`, `dev`.
Scenes must clean up in `exit()` (remove DOM they added, dispose heavy geometry unless `persistent`). The engine calls `pipeline.resetEffects()` between scenes.

### Post-processing — `render/pipeline.ts` (`engine.pipeline`)
`impact(frames, mode 0 invert|1 b/w|2 black-red)`, `flash(color, intensity, dur)`, `chromaticPulse(amount, dur)`, `setSpeedLines(0..1)`, `setMind(0..1)` (swirl + purple, for mind control), `setDesat(0..1)` (Velo/invisibility), `setLetterbox(0..1)` (cutscenes), `setFade(0..1)`, `setTint(color)`, `setGrade({saturation, contrast, brightness, vignette, grain})`, `setBloom(strength, radius, threshold)`.

### Look — `render/toon.ts`, `render/sky.ts`, `render/fx.ts`, `render/camera.ts`
- `toon(color, { rim, rimColor, emissive, bands, vertexColors, transparent… })` cached MeshToonMaterial (hard bands + anime rim). `withOutline(mesh, thickness)` / `outlineAll(group)` inverted hull (works with InstancedMesh via `outlineMaterial(thickness)` on a second InstancedMesh). `glow(color, intensity)` unlit HDR for bloom. Characters & props: outlines. Terrain/backgrounds: no outlines (painted look).
- `new Sky(scene, opts)` → `.setTime(0..1)` (0 midnight, .25 dawn, .5 noon, .75 dusk), `.override = { horizon, top, fog, sunI, ambI, stars, weight }` for moods, `.update(dt, camera, time)`, `.sun` (DirectionalLight with shadows; set `sky.shadowTarget` to the focus point), `.isNight`.
- `new Fx(scene)` → `emit(preset, pos, opts)` presets: spark hit magic arcane fire ice lightning light shadow mind poison nature ink smoke dust explosion coins essence heal stars leaves confetti blood earth time luck; `ring(pos,{color,radius})`, `beam(a,b,{color,width})`, `bolt(a,b)`, `flash(pos,{color,radius})`, `update(dt)`.
- `new CameraRig(camera)` → `follow(vec3)`, `yaw/pitch/distance`, `shake(0..1)`, `kick(dir, amount)`, `fovPunch(deg)`, `zoom(wheel)`, `groundPoint(nx, ny)`, `update(dt)`.

### Characters — `characters/rig.ts`
`buildCharacter({ seed, race, job?, gender?, age?, special?, colors?, weapon?, shield?, cape?, robe?, headgear?, eyeGlow? })` → `CharacterRig` with `.root` (feet, faces +Z), `.update(dt, { speed })`, `.pose = 'idle'|'sit'|'kneel'|'cast'|'channel'|'point'|'cheer'|'fly'|'lie'|'dead'`, `.play('attack'|'cast'|'point'|'cheer', dur)`, `.hit(dir)`, `.setExpression(FaceExpr)`, `.setEyeGlow(color|null)`, `.setOpacity(a)`, `.height`, `.dispose()`. Specials: `elias`, `elias_god`, `aurel`, `aurel_child`, `aurel_old`, `shadow`, `tiburcio`, `fortuna`, `ione`, `mother`, `father`. ~24 draw calls each → use for heroes/NPCs (≤ ~30 on screen). Crowds: battle module's instanced renderer.

### State — `core/state.ts`, `core/save.ts`, `core/tracker.ts`
- `G.run` (RunState, the current cycle) and `G.meta` (MetaState, persists across cycles). See the interfaces in `core/state.ts`: player (resources, army, codex, relics, loadout…), continents (corruption), locations (fear, loyalty, prices…), npcs (NpcState with memories), reputation, flags, quests, news, stats, modules.
- Add your own serializable slice: `declare module '../../core/state' { interface RunModules { casino: CasinoState } }` + `registerModule('casino', (run) => initial)`.
- Populate a fresh run: `onRunInit(name, priority, (run) => {...})` (0 world, 10 npcs, 20 economy, 30 politics, 40 story, 90 meta bonuses). `newRun(seed)` runs them.
- Resources: `res.add('gold'|'essence'|'influence'|'secrets'|'alert'|'mana'|'hp', n)`, `res.spend(key, n) → boolean`, `res.can(key, n)`; `addResModifier(key, fn)` for multipliers. Emits `res:change`.
- `refreshTitle()` after corruption changes (name progression). `TITLES`.
- `saveRun(force?)`, `saveMeta()` (autosave every 15 s already). JSON-serializable data only in state.
- `track(key, n)` / `trackMax(key, v)` — log player behavior for the narrator & the ending ("Siempre estuve viéndote"). Call it generously (keys listed in `core/tracker.ts`).

### Events — `core/events.ts`
`bus.on(type, fn) → off`, `bus.emit(type, payload)`, `bus.scope()` (dispose all in `exit()`). Add event types with declaration merging:
```ts
declare module '../../core/events' { interface GameEvents { 'casino:win': { game: string; amount: number } } }
```
Core events: `scene:enter/exit`, `state:new-run/loaded/saved`, `res:change`, `codex:progress`, `codex:acquired`, `relic:gained`, `title:change`, `narrator:line`, `luna:tick`, `quest:added/progress/done/failed`, `news:add`.

### Quests & news — `core/quests.ts`, `core/news.ts`
`addQuest({ id, kind: 'main'|'side'|'contract', title, desc, goal, target?, reward? })`, `progressQuest(id, n, absolute?)`, `completeQuest(id)`, `activeQuests()`. `addNews(text, kind, important?)`.

### Input — `core/input.ts`
`input.down(code)`, `input.wasPressed(code)`, `input.action('up'|'dodge'|'slot1'…)`, `input.actionPressed(a)`, `input.moveVector()`, `input.mouse` ({x,y,nx,ny,dx,dy,wheel,buttons}), `input.mousePressed(b)` (only clicks on the canvas, not UI), `input.enabled` (false during dialogue), `requestPointerLock()`.

### UI — `ui/*.ts`
- `h(tag, props, ...children)` hyperscript (`html:` for SVG strings, `onclick`, `'data-tip'` tooltips), `layer('hud'|'panel'|'dialogue'|'modal'|'cutin'|'narrator'|'toast'|'world'|'fade')`, `frag(html)`, `wait(ms)`.
- `button(label, onClick, { kind, small, big, disabled, tip, hotkey, icon })`, `panel({ title, onClose, icon }, ...children)`, `bar(v, max, { color, label })`, `modal({ title, body, actions })→Promise<value|null>`, `confirmModal(title, text)`, `tabs([...])`.
- `dialogue.say([{ speaker, title?, portrait: PortraitSpec|svg, side?, text }])`, `dialogue.ask(line, [{ id, text, hint?, disabled? }]) → id`. Text supports `*énfasis*` and `{name}`.
- `narrate({ third, first?, direct? } | string, { position: 'bottom'|'center'|'top', hold })` — the narrator (EB Garamond italic). Prefer providing both persons.
- `toast(html, { kind: 'good'|'bad'|'gold'|rarity, icon })`, `banner(title, sub, { kind: 'victory'|'defeat'|'excepcion'|'name'|'jackpot' })`, `cutin({ portrait, title, subtitle, colors, side })`, `excepcionAcquired(name, { color })`, `lootReveal([{ name, rarity, svg, desc }])`.
- `floatText(vec3, text, { kind: 'dmg'|'crit'|'heal'|'magic'|'gold'|'info' })` damage numbers.
- `ui/menu.ts`: Esc opens the pause menu. If your UI handles Escape, call `e.preventDefault()` in your keydown handler. `blockMenu(true|false)` during cutscenes.
- Art (`ui/art/*`): `portraitSVG(spec, size)`, `icon(name, { size, color })`, `relicSVG(shape, rarity, { size })`, `RARITY_COLORS`, `slotSymbolSVG`, `crestSVG(continent)`, `logoSVG()`, `tarotCardSVG(card)`, `createFaceAtlas()`.

### Audio — `audio/index.ts`
`audio.music(mood, { region })`, `audio.sfx(name, { volume, pitch })`, `audio.stinger(name)`, `audio.ambience(name, on)`, `audio.setIntensity(0..1)`, `audio.duck(amount, s)`. Moods: title prologue prologue_dark overworld overworld_night location battle boss victory_loop casino tension stealth council ending void silence. See `SfxName` for the full effect list.

### Data — `data/*`
Schemas in `data/types.ts`. Canonical exports (content agent fills them; everyone else reads):
`RACES` (races.ts), `JOBS` (jobs.ts), `UNITS` + `unitsForContinent()` (units.ts), `ABILITIES` + `HERO_KIT` (abilities.ts), `FUSIONS` + `fuse()` (fusions.ts), `RELICS` (relics.ts), `NPCS` (npcs.ts), `GOODS` (goods.ts), `NAMES` + `randomName(race, gender, rng)` (names.ts); `CONTINENTS`, `LOCATIONS`, `LOCATION_LIST`, `GUILDS`, `CONTINENT_IDS` (world.ts — core).

**Canonical ids everyone may rely on**
- Hero kit (copied from Aurel): `dominar_mente`, `velo`, `fuerza_titanica`, `afinidad_reliquias`, `retorno`. Elias basics: `chispa_arcana` (LMB), `esquivar` (Space), `golpe_titanico` (active of Fuerza Titánica). Aurel's last power: `el_alba`.
- Libro del Aprendizaje: `paso_fantasma`, `mil_cortes`, `clones_sombra`, `metamorfosis`. Eclipse ultimate: `eclipse_total`; Eclipse passive: `traicion`.
- Major relics: `daga_solar` (Aurora), `daga_lunar` (Nocturna), `eclipse` (fusion), `libro_realidad`, `libro_aprendizaje`. Also `corona_vacia`, `collar_bruma`, `pluma_narrador` (secret, cycle 2+).
- NPC ids: `isolde_varn`, `galvan`, `mirelle`, `tobias`, `anselmo`, `berta_molinera`, `elowen`, `thalion`, `liria`, `mara_colmenas`, `tomas_colmenas`, `thrain`, `ymra`, `grub`, `hilda`, `morgaine`, `cassius`, `nimue`, `jabu`, `tiburcio`, `fortuna`, `rhea`, `coralina`, `ione`, `aurel`, `bruma`.
- Location ids: see `data/world.ts`.

### Progression systems — `systems/progression/*` (content agent)
`codex.ts`: `comprehend(abilityId, amount=1)` (La Excepción — call when Elias is affected by an ability; handles acquisition, resistances, events, cut-in), `acquire(id, { silent })`, `knows(id)`, `resistance(tag) → 0..1`, `rankUp(id)`, `equipSlot(i, id)`, `openCodex()`.
`relics.ts`: `grantRelic(id, { reveal, where })`, `hasRelic(id)`, `equipRelic(uid)`, `relicPassive(key) → number`, `openRelics()`.
`stats.ts`: `effective(stat)`, `maxHp()`, `maxMana()`, `manaRegen()`, `damageMult(school)`, `racialPowers()`.
`reality.ts`: `openRealityBook({ forced?: 'tiempo' })` (Libro de la Realidad UI; rewrite + sacrifice).

### Battle — `battle/api.ts` (contract; battle agent implements)
`engine.goto('battle', setup: BattleSetup)`. `BattleScript` hooks give story/casino scripted control via `BattleContext`. Arena spectator: `setup.arena` + `player.present = false`.

## Conventions
- TypeScript strict, no `any` unless unavoidable. ES modules. Small files (< ~700 lines). Comment the "why", not the "what".
- Never throw from update loops; guard nulls. Keep 60 fps with 150 units: reuse geometries/materials, avoid per-frame allocations in hot paths.
- Everything the player can do should feed back (sound + visual + number) — "juice".
- Time is in **lunas** (moon phases). Never show day/year numbers. `G.run.luna` is internal.
- Names/titles: use `G.run.player.name` (it changes: Elias Veyr → La Excepción → … → Él).
- Humor: duendes speak Guatemalan slang ("patojo", "chilero", "a la gran", "qué chivo", "shute", "está yuca"); others per `NpcDef.voice`.
- The "cortesana" job is an elegant information broker/spy (never sexual content).
- No real-money anything. Gambling is with in-game gold/essence only.
