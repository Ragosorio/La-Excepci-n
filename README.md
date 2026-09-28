# La Excepción — el videojuego

> *Eres el villano. Todo lo que sobrevives, lo dominas.*

Action-RPG + estrategia + simulador de batallas (estilo TABS) + casino, con estética anime, basado en el libro *La Excepción* de Rolando Osorio. Todo corre en el navegador y todo es procedural: no hay imágenes ni audios externos (los personajes, retratos, iconos, música y efectos se generan con código).

## Cómo jugar

```bash
npm install
```

```bash
npm run dev
```

Abre http://127.0.0.1:5173 — se recomienda jugar con audífonos.

Para generar la versión final (carpeta `dist/`, se puede subir a cualquier hosting estático):

```bash
npm run build
```

## Controles

| Dónde | Controles |
|---|---|
| Mapa del mundo | WASD o clic para moverte · Espacio pausa · 1/2/3 velocidad · rueda zoom · clic derecho arrastrar = girar · E entrar a un lugar · Tab Códice · I Reliquias · J Designios · M Mapa político · Esc menú |
| Batalla | WASD moverte · ratón apuntar · clic izq. Chispa Arcana (o puñetazo titánico cerca) · clic der. Golpe Titánico · 1–4 habilidades · Q/E reliquias · R definitiva · Espacio esquivar · Shift correr · Z/X/C órdenes al ejército · V cambiar cámara |
| Diálogos | clic / Espacio avanzar · 1–4 elegir |

## Estructura

```
docs/GDD.md            ← la biblia del juego: historia, mundo, sistemas (en español)
docs/ARCHITECTURE.md   ← cómo está organizado el código y sus APIs
docs/RESEARCH.md       ← técnicas investigadas (enganche, render anime, TABS, audio…)
src/core/              ← motor: bucle, escenas, estado, guardado, entrada, eventos
src/render/            ← look anime: post-procesado, materiales toon, cielo, partículas, cámara
src/characters/        ← personajes 3D procedurales (razas, oficios, animación)
src/ui/                ← interfaz: diálogos, narrador, cut-ins, menús · ui/art = retratos/iconos SVG
src/audio/             ← música adaptativa y efectos sintetizados (Tone.js)
src/data/              ← contenido: razas, unidades, habilidades, reliquias, NPCs, mundo, historia
src/systems/           ← reglas: progresión (Códice, reliquias), mundo, sociedad (política, economía, memoria), historia
src/scenes/            ← título, prólogo, mapa, lugares, concilio, final, márgenes
src/battle/            ← batallas TABS + combate de Elias
src/casino/            ← el Gran Casino de las Islas de Azar
```

## Editar la historia

- Textos del narrador y momentos clave: `src/data/story.ts`
- Páginas del libro que se encuentran en el mundo: `src/data/pages.ts`
- Personajes con nombre (diálogos, rasgos): `src/data/npcs.ts`
- Nombres, razas, reliquias, habilidades: `src/data/*.ts`

## Atajos de desarrollo

- `?scene=dev` — laboratorio visual (personajes, efectos, enlaces a todas las escenas)
- `?scene=battle`, `?scene=overworld`, `?scene=casino&game=slots`, `?scene=prologue&mode=boy`, `?scene=ending`… — saltar directo a una escena
- `&fps` — muestra FPS y llamadas de dibujo
- En la consola: `LX.G.run` (partida actual), `LX.G.meta` (progreso entre ciclos), `LX.res.add('gold', 1000)`, `LX.bus` (eventos)
- `&vt` — reloj virtual para pruebas automáticas (el juego corre a máxima velocidad aunque la pestaña esté oculta); `&vtpause` arranca en pausa. Expone `__vt.play(ms)`, `__vt.drive(ms)` (un bot que pelea con Elias), `__vt.frame()`
- `?scene=overworld&fresh` — empieza una partida nueva directo en el mapa

Los datos se guardan en el `localStorage` del navegador (partida + progreso de ciclos). Desde el menú de pausa (Esc) puedes exportar la partida.
