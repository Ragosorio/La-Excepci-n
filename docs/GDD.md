# LA EXCEPCIÓN — Documento de Diseño del Juego (GDD)

> *Hay reglas que sostienen al mundo. Y hay cosas que existen para romperlas.*

Este documento es la fuente de verdad del juego. Todo texto visible al jugador va en **español** (neutro con "tú"; los duendes hablan con jerga chapina). Los nombres propios, IDs y números de aquí son canónicos: si un módulo necesita un dato, lo toma de `src/data/*`, que sigue este documento.

---

## 0. Pitch

**Eres el villano. Todo lo que sobrevives, lo dominas.**

Action-RPG + estrategia + simulador de batallas (estilo TABS) + casino, con estética anime y profundidad de mundo tipo WoW. Controlas a **Elias Veyr**, un mago patético que aparece en un mundo de cinco continentes, desafía al Gran Héroe, **muere**... y vuelve. Porque tiene **La Excepción**: todo poder que lo toca, todo lo que sobrevive, deja de tener poder sobre él y pasa a ser suyo.

### Pilares (cada feature debe servir a uno)
1. **Fantasía de poder que escala** — de 1 punto de daño a reescribir la realidad. Los números crecen de forma exponencial y se siente.
2. **Lo que te golpea te enseña** — copiar habilidades es colección + riesgo: tienes que dejar que te pegue lo que quieres aprender.
3. **El mundo recuerda** — NPCs con memoria, némesis que regresan, rumores que cuentan lo que hiciste.
4. **Muchas formas de corromper** — conquista, intriga, codicia o terror. Cada continente cae distinto.
5. **La suerte también es un arma** — casinos, apuestas, trampas con magia, reliquias por azar.
6. **El libro te mira** — un narrador que cambia de "él" a "yo", ciclos que regresan al principio y un villano que, al final, te mira a ti.

### Referencias
World of Warcraft (razas, facciones, reputaciones, rareza de objetos por color), Totally Accurate Battle Simulator (unidades bamboleantes, ragdolls que vuelan, colocación de tropas), Hogwarts Legacy / Hades (combate de hechizos en acción directa, muerte que avanza la historia), Mount & Blade (mapa del mundo con grupos que se mueven, pueblos, comercio, ejércitos), Shadow of Mordor (sistema Némesis), Yakuza (casinos y minijuegos dentro del mundo), el libro *La Excepción* de Rolando Osorio (historia, tono, narrador, estructura sin tiempo).

---

## 1. Tono, estética y reglas del libro

- **Anime**: cel-shading de 2–3 bandas, contornos oscuros en personajes y utilería, fondos "pintados" sin contorno, bloom en la magia, cut-ins con retrato al usar poderes grandes, *impact frames* (1–3 fotogramas invertidos/alto contraste) en golpes críticos, líneas de velocidad, caras expresivas (ojos espiral al ser controlados mentalmente, X al morir).
- **TABS**: las unidades son figuras hechas de formas simples (cápsulas y esferas) con cara anime, se bambolean al caminar y salen volando en arcos ridículos con golpes fuertes. La muerte es ragdoll (sin sangre explícita: "tinta" violeta/negra y chispas).
- **Tono**: oscuro pero divertido. El villano es ingenioso y elegante; el mundo tiene humor (ogros que comen piedras, duendes banqueros chapines: "¿Qué onda, patojo?", "¡A la gran!", "Qué chilero", "Shute", "Está yuca"). Nunca cruel de forma gratuita; nada sexual explícito.
- **Tipografía**: *Cinzel* (títulos, nombres), *EB Garamond* (narrador, páginas del libro), *Alegreya Sans* (UI), *Bangers* (daño, impactos, "¡EXCEPCIÓN!").
- **Paleta**: noche violeta `#1a1024`, profundo `#0d0714`, oro envejecido `#d9b36c`, marfil `#f3ead8`, violeta Excepción `#9b5cff`, cian alba `#7fe3ff`, sangre `#e2455b`.
- **Símbolo**: el **eclipse** (disco negro con corona delgada de luz). Es el logo, el separador, la marca de Elias y la reliquia final.
- **Reglas heredadas del libro** (obligatorias):
  - **No hay fechas ni años**. El tiempo del juego se mide en **lunas** (fases lunares), nunca en "Día 12". Si un NPC recibe la pregunta "¿Qué año es?", responde variantes de: *"No sé. Un día dejamos de contar."*
  - **No hay "Capítulo 1"**. Los actos se llaman **Fragmentos** con palabras: *Antes*, *Cuando aún tenía nombre*, *La regla*, *Lo que sobrevivió*, *Él*.
  - La frase **"Siempre estuve viéndote."** se conserva exacta. Aparece al inicio (prólogo) y es la última línea del ciclo, dicha por el jugador.
  - El **narrador** empieza en tercera persona ("Elias caminó...") y termina en primera ("Caminé..."). El cambio es sutil y sin explicación.

---

## 2. Historia

### 2.1 Personajes principales

| Personaje | Descripción |
|---|---|
| **Elias Veyr** (jugador) | Mago alto y pálido, pelo negro con un mechón plateado, ojos con anillo violeta, abrigo negro de cuello alto con forro violeta y el sigilo del eclipse. Apareció en este mundo sin pasado conocido. Débil al inicio. Elegante, sarcástico, paciente. Su poder: **La Excepción**. |
| **Aurel** | El Gran Héroe de los Cinco Continentes, Portador del Alba, Campeón del Concilio. Rubio, ojos ámbar, armadura blanca y dorada con sol del alba, cicatriz en el puente de la nariz. Cálido, justo, un poco cansado de ser necesario. Poderes: Dominar Mente, Velo, Fuerza Titánica (+regeneración de maná), Afinidad de Reliquias, Retorno, y **El Alba** (la luz de su mano). |
| **El niño** | Aurel a los 13 años. En el prólogo nunca se dice su nombre. |
| **Bruma** | La perrita blanca-gris de Aurel. Tranquila. Siempre parece ver un amanecer normal. Sigue viva (y vieja) cuando Aurel es adulto. Aparece en cada ciclo. |
| **La Voz** (el narrador) | El texto del juego. Tercera persona... hasta que deja de serlo. |
| **Custodia Ione Salvaterra** | Presidenta del Concilio de los Cinco. Idealista, pelo plateado en moño, túnica blanca, prendedor de rama de olivo. |
| **Don Tiburcio Faroles** | Duende, Gran Banquero de las Islas de Azar, dueño del Gran Casino. Diente de oro, monóculo, sombrero de copa, chaleco verde. Habla chapín. Adorable y peligroso. |
| **Madame Fortuna** | Crupier y adivina (mitad sirena), velo con monedas, ojos de distinto color. Delegada de las Islas. Parece saber más de lo que dice sobre "los ciclos". |

### 2.2 Los nombres de Elias (progresión)
Cambian según los continentes corrompidos. Se muestran en el HUD, en diálogos de NPCs y en el narrador. Al cambiar: campanada profunda + banner.

| Continentes | Nombre | Cómo lo llama el mundo |
|---|---|---|
| 0 | **Elias Veyr** | "el mago ese", "el muerto que camina" |
| 1 | **La Excepción** | "la cosa que no muere" |
| 2 | **El Hombre sin Ley** | |
| 3 | **Veyr** | ("hay aldeas donde ya no se pronuncia") |
| 4 | **El Referente** | los dioses y los sabios |
| 5 | **Él** | "Esto se está acercando demasiado a Él." |

### 2.3 Estructura (Fragmentos)

**Fragmento: *Antes*** — Prólogo jugable (5 min)
1. Negro. Texto en Cinzel: *"Hay reglas que sostienen al mundo. Y hay cosas que existen para romperlas."*
2. **Desayuno en Las Colmenas** (viñeta de diálogo con retratos). El niño pregunta a su madre: "¿En qué año naciste?" — "No sé." — "¿Cómo que no sabés?" — "Hace mucho dejamos de contar." — "¿Por qué?" — "No recuerdo." Y siguen desayunando.
3. **El bosque** (3D). Antes del amanecer. El niño camina con Bruma (WASD) desde las Colmenas (torres-hogar comunitarias) hasta el borde del bosque. Neblina, luces artificiales tenues de las Colmenas atrás. Se sienta en un tronco (E). Amanece: rayos de sol, neblina dorada, precioso.
4. **La sombra**. En la neblina aparece una sombra que se marca cada vez más: la mañana se nubla poco a poco; la sombra se vuelve negra y definida; en un parpadeo, **todo se vuelve noche** para él (mismo lugar, más neblina, las luces de las Colmenas encendidas). **Bruma no se asusta: sigue mirando algo lindo** (para ella sigue amaneciendo — mostrar su cara tranquila). La sombra queda a unos metros.
5. **La luz**. Prompt: *[Clic]* — el niño se para y lanza una luz desde su mano (primer poder del jugador, gran destello). Cierra los ojos (negro). Los abre: todo normal, como si hubiera sido un sueño. Pero algo le dice a sus espaldas, en letra EB Garamond cursiva, centrada: **"Siempre estuve viéndote."**
6. Empieza a llover, cada vez más fuerte. Prompt: *"Corre."* Regresa corriendo con Bruma a su casa.
7. Los padres escuchan (viñeta). **No se sorprenden** — pero NO porque conozcan la sombra (eso sería información nueva). Interpretan todo desde lo que conocen: *"Tus poderes están despertando. Siéntate. Tenemos mucho que explicarte."*
8. Título: **LA EXCEPCIÓN** (logo con el eclipse en la Ó).

**Fragmento: *Cuando aún tenía nombre*** — La muerte de Elias (8 min)
1. Texto: *"Muchos años después. O antes. Nadie contaba ya."*
2. **Concordia**, gran plaza del Concilio, celebración en honor a Aurel. Elias Veyr aparece en medio de la plaza (distorsión violeta), se presenta con dramatismo: *"Me llamo Elias Veyr. Este mundo me pertenece."* La multitud se ríe. Aurel da un paso al frente, amable: *"Nadie tiene que salir herido."*
3. **Pelea tutorial imposible** contra Aurel (arena de batalla). Elias solo tiene *Chispa Arcana* (1 de daño) y *Esquivar*. Aurel usa sus poderes uno a uno y cada uno que golpea a Elias llena un icono arriba: **"Comprendiendo… Fuerza Titánica 1/1"**. Secuencia guiada: puñetazo que lo hace volar (Fuerza), desaparece y aparece detrás (Velo), los controles se invierten y la pantalla gira en espiral (Dominar Mente), su espada brilla con una reliquia (Afinidad), y cuando Elias por suerte lo derriba, Aurel se levanta al instante envuelto en luz (Retorno).
4. El golpe final: Aurel lo lanza con un puñetazo titánico al cielo. **Ragdoll cinematográfico**: Elias vuela sobre el mar y el mapa y cae en un campo de trigo de Valdoria. Cráter. Silencio.
5. Narrador: *"Elias Veyr murió aquella noche."* … pausa larga … *"Excepto que no."*
6. **Resurrección**: luz violeta, 5 cut-ins seguidos **"EXCEPCIÓN ADQUIRIDA"**: *Dominar Mente*, *Velo*, *Fuerza Titánica*, *Afinidad de Reliquias*, *Retorno*. Elias se levanta en el cráter. Sonríe.
7. En Concordia, Aurel da por muerto a Elias. Nadie lo busca. Todavía.

**Fragmento: *La regla*** — El juego principal (60–90 min el primer ciclo)
Mundo abierto. Objetivo: **corromper los cinco continentes** y reunir **las tres reliquias mayores**. Se puede hacer en cualquier orden. Designios (misiones) guían sin encerrar:
1. *Un primer siervo* — usa Dominar Mente con alguien en Vado del Trigo y recluta.
2. *Un ejército de verdad* — ten 10 unidades.
3. *La primera caída* — lleva un continente a 100% de corrupción → nombre "La Excepción"; el Concilio convoca sesión de emergencia; Aurel se entera de que vives.
4. *Las dagas* — Daga Solar y Daga Lunar → fusiónalas en **Eclipse**.
5. *Los libros* — Libro del Aprendizaje y Libro de la Realidad.
6. *La mesa de los cinco* — sobrevive/manipula las sesiones del Concilio.
7. Desde la segunda caída, **Aurel caza a Elias** en el mapa (némesis supremo, huir es sabio al principio).

**Fragmento: *Lo que sobrevivió*** — Acto final (10 min)
Se activa con **5 continentes corrompidos**, o con **3 continentes + las 3 reliquias mayores**. El Concilio forma **La Gran Alianza** en Concordia. Batalla final enorme (tu ejército vs. la Alianza) + duelo contra Aurel (usa todo lo que tú tienes, más *El Alba*). Al vencerlo, **copias El Alba**: la misma luz que el niño lanzó en el prólogo.

**Fragmento: *Él*** — Final (5 min, interactivo)
1. Concordia en ruinas. Aurel de rodillas, más viejo de lo que debería (el tiempo se dobla). Bruma a su lado, tranquila.
2. Elias abre el **Libro de la Realidad**. Solo hay una reescritura posible: **"No existe el tiempo."** Costo: **"Tu nombre."** [Confirmar] (si el jugador duda — abre y cierra — se registra).
3. La UI "falla". El narrador: *"Elias Veyr escribió la última regla."* → *"Él escribió la última regla."* → *"Escribí la última regla."* A partir de aquí, primera persona.
4. Todos los momentos existen a la vez: montaje con TU historia (el bosque, tu muerte, los némesis que mataste, tus reliquias, tu mayor apuesta).
5. Diálogo con Aurel: **"¿Sabes cómo supe que lo había logrado, pequeño?"** Aurel no responde. Elias sonríe. Narrador: *"Pero no estaba mirando al muchacho. Tampoco había nada detrás de él. Te estaba mirando a ti."* La cámara gira: **Elias mira a la cámara**.
6. Elias habla con el jugador usando datos reales registrados: *"Te vi morir 7 veces. Te vi apostar 12.400 monedas en una sola noche. Te vi dudar antes de entregar mi nombre."* + la hora local: *"Son las 2:14 de la madrugada, por cierto."* (3–5 datos elegidos por lo más notable). *"Aunque, pensándolo bien, tú ya lo viste."* Pausa. **"Vuelve al principio."**
7. Negro. El prólogo empieza otra vez, pero **ahora controlas a la sombra**: el bosque al amanecer, el niño y Bruma sentados. Al acercarte, la mañana se oscurece (eres tú quien la oscurece). El niño se para y te lanza la luz. Cuando todo vuelve a la normalidad, estás detrás de él. Prompt: *[E] Hablar*. Aparece, en la misma posición y tipografía que la primera vez: **"Siempre estuve viéndote."**
8. Créditos breves → **Ciclo siguiente** (pantalla de *Los Márgenes*).

**Final alternativo — *El Sello*** (derrota del ciclo): si la **Alerta del Concilio** llega a 100 y el ritual del Gran Sello se completa, Elias es encerrado "en una página en blanco". Narrador: *"Lo encerraron en una página en blanco. Las páginas en blanco también se leen."* → *"Vuelve al principio."* → siguiente ciclo (conservas el progreso meta). Perder también avanza la historia.

### 2.4 Ciclos (rejugabilidad narrativa)
- Cada partida completa es un **Ciclo**. Al terminar (final o sello) empieza el siguiente con progreso meta.
- El mundo cambia por ciclo (semilla): ubicación de reliquias menores, debilidades de continentes, rasgos de líderes, némesis, eventos.
- **Ecos entre ciclos**: algunos NPCs recuerdan vagamente ("¿Nos hemos visto antes? Tengo la sensación de que ya me has matado."). Madame Fortuna y la Madre Morgaine saben de los ciclos. Bruma siempre te mira tranquila.
- El narrador evoluciona: Ciclo 1 casi siempre tercera persona; Ciclo 2 se le escapan frases en primera; Ciclo 3+ a veces te habla directamente ("Otra vez tú.").
- Ciclo 2+: aparece la reliquia secreta **La Pluma del Narrador**. Ciclo 3+: diálogos nuevos con Aurel (él también empieza a recordar).
- La pantalla de título cambia por ciclo (en Ciclo 2+ se lee tenuemente "Siempre estuve viéndote." bajo el logo).

---

## 3. El mundo

### 3.1 Linajes (razas)
Cada linaje tiene aspecto, proporciones (para las unidades TABS), poderes copiables y oficios. Al corromper un continente, Elias gana el **poder racial pasivo** de sus linajes principales ("cada raza que conquista le da su poder").

| ID | Linaje | Aspecto / proporción | Poder racial pasivo (al conquistar) | Poderes típicos (copiables) |
|---|---|---|---|---|
| `elfo` | Élfico | Alto, esbelto, orejas largas, tonos claros | **Ojo Élfico**: +25% daño a distancia y alcance | Lluvia de Flechas, Paso del Viento, Flecha Estelar, Bendición del Bosque |
| `caballero` | Caballero | Humano acorazado, ancho | **Juramento**: una vez por batalla sobrevives con 1 PV | Muro de Escudos, Carga Juramentada, Juramento Inquebrantable |
| `gigante` | Gigante | 3× tamaño, piel de piedra | **Piel de Montaña**: +30% vida máx. | Pisotón Sísmico, Lanzar Roca, Piel de Montaña |
| `ogro` | Ogro | Grande y gordo, gris-verde, colmillos | **Estómago de Hierro**: devorar enemigos cura | Devorar, Lanzar Aliado, Eructo Nauseabundo |
| `duende` | Duende | Pequeño (0.6×), verde, orejotas, sonrisa de dientes | **Suerte de Duende**: +20% oro y +suerte en el casino | Bomba de Feria, Moneda Trucada, Trampa de Resorte, Autodestrucción Chilera |
| `mago` | Mago | Humanoide con túnica y sombrero alto | **Erudición**: −20% coste de maná | Bola de Fuego, Rayo en Cadena, Nova de Escarcha, Parpadeo, Escudo Arcano |
| `bruja` | Bruja | Sombrero puntiagudo, capa, escoba | **Maleficio**: tus ataques maldicen (−armadura) | Maldición, Plaga de Sapos (convierte en sapo), Caldero Venenoso, Vuelo de Escoba |
| `enano` | Enano | Bajo (0.75×) y ancho, barbas | **Barba de Hierro**: +25% armadura | Martillo Rúnico, Barril Explosivo, Grito de Guerra |
| `humano` | Humano | Proporción normal | **Adaptable**: +1 espacio de habilidad | Grito de Formación, Lanza Perforante |
| `trol` | Trol | Alto y larguirucho, azul-verdoso, colmillos | **Regeneración Trol**: regeneras vida | Frenesí, Lanza Vudú, Regeneración |
| `clerigo` | Clérigo | Túnicas blancas, halo | **Gracia**: curas un 30% más, tus aliados también | Sanación, Luz Sagrada, Escudo Divino, Resurrección Menor |
| `picaro` | Pícaro | Capucha, máscara, dagas | **Sombra**: +50% daño crítico por la espalda | Puñalada Trapera, Bomba de Humo, Veneno en la Hoja, Robar |
| `sirena` | Sirena | Escamas, aletas, cabello aguamarina | **Canto**: tus ilusiones duran más | Canto Hipnótico, Ola |
| `draconido` | Dracónido | Cuernos, escamas, cola (raro) | **Sangre de Dragón**: inmune a quemaduras | Aliento de Fuego, Alas (salto) |

### 3.2 Oficios (trabajos) — la ropa refleja el oficio
`guerrero`, `soldado`, `arquero`, `curandero`, `hechicero`, `mercader`, **`cortesana`** (red de información y espionaje de la Casa de las Sedas: velo, sedas, abanico de acero; elegante, nunca explícito — venden **Secretos**), `herrero`, `erudito`, `cazador`, `sacerdote`, `bardo`, `ladron`, `minero`, `chaman`, `noble`, `campesino`, `banquero`, `crupier`, `capitan`, `espia`, `asesino`, `alquimista`, `pirata`, `guardian`, `rey`/`reina`, `tabernero`, `monje`, `delegado`.

### 3.3 Continentes y lugares
Hay 5 continentes + la isla neutral **Concordia**. No están en guerra, pero tampoco la evitan: la paz es delicada. Cada continente tiene gobernante, delegado en el Concilio, economía, debilidad de corrupción (multiplicadores por vía, con variación aleatoria por ciclo) y una reliquia importante.

**Multiplicadores base de corrupción** (Conquista / Intriga / Codicia / Terror):
- Valdoria 1.0 / **1.5** / 1.0 / 0.6
- Sylvaria 0.8 / 1.0 / 0.5 / **1.6**
- Kharaz **1.5** / 0.6 / 1.2 / 0.8
- Morvenna 0.6 / **1.4** / 1.0 / 1.1
- Islas de Azar 0.8 / 0.7 / **1.7** / 1.0

#### VALDORIA — "La Corona" (humanos, caballeros, pícaros, clérigos)
Llanuras doradas, castillos, catedrales. Economía: grano, caballos, acero. **Gobernante**: Reina **Isolde Varn** (fría, pragmática). **Delegado**: Sir **Galvan Brisaclara**, Mariscal de los Juramentados (honorable, terco). Gremios: Los Juramentados, El Gremio de la Ceniza, La Casa de las Sedas.
- `corona_varn` — **Corona de Varn** (capital, ciudad-castillo)
- `vado_trigo` — **Vado del Trigo** (aldea agrícola; zona inicial)
- `fortaleza_juramento` — **Fortaleza Juramento** (fortaleza de caballeros)
- `callejones_ceniza` — **Callejones de Ceniza** (barrio de pícaros, mercado negro, la Casa de las Sedas de la Viuda Mirelle)
- `mausoleo_alba` — **Mausoleo del Alba** (ruina: tumba ceremonial del héroe; reliquia *La Corona Vacía*)
- `crater` — **El Cráter** (donde cae Elias; su primer Santuario)

#### SYLVARIA — "El Bosque que Recuerda" (elfos, clérigos, duendes silvestres)
Árboles colosales, luz dorada, templos. Economía: madera, hierbas, savia de maná. **Gobernante**: Suma Sacerdotisa **Elowen Aelthar** (900 años, serena, despiadada con lo impuro). **Delegado**: **Thalion Hojaplata** (arquero, orgulloso). Gremio: La Orden del Alba.
- `lumen` — **Lúmen** (capital-árbol)
- `templo_alba` — **Templo del Alba** (reliquia mayor: **Daga Solar "Aurora"**)
- `claro_luciernagas` — **Claro de las Luciérnagas** (aldea)
- `aldea_colmenas` — **Las Colmenas** (el pueblo del prólogo: torres-hogar comunitarias junto al bosque de la bruma; viven los padres ya mayores de Aurel; reliquia *Collar de Bruma* en el tronco del prólogo)
- `raiz_profunda` — **Raíz Profunda** (ruina)

#### KHARAZ — "La Montaña Hueca" (enanos, gigantes, ogros)
Montañas, forjas, minas, ríos de lava. Economía: hierro, oro, gemas, armas. **Gobernante**: Rey **Thrain Martillohondo** (gruñón, codicioso, respeta el oro y la fuerza). **Delegada**: **Ymra, la Colina que Anda** (giganta lenta y sabia). Gremio: El Yunque.
- `kharaz_dum` — **Kharaz-Dûm** (capital bajo la montaña)
- `forja_primigenia` — **La Forja Primigenia** (mejora reliquias; puede fusionar las dagas)
- `mina_luna` — **Mina de la Luna Caída** (reliquia mayor: **Daga Lunar "Nocturna"**)
- `tragapiedras` — **Campamento Tragapiedras** (ogros; jefe **Grub**, que come piedras)
- `escalon_gigantes` — **Escalón de los Gigantes** (fortaleza)

#### MORVENNA — "Las Tierras del Crepúsculo" (brujas, magos, troles)
Pantanos, torres, lunas enormes, niebla. **La Academia de Altamira** (escuela de magia estilo Hogwarts: torres, escaleras que se mueven, estudiantes). Economía: pociones, grimorios, maná. **Gobernante**: la Madre **Morgaine Tresojos** (bruja anciana con tercer ojo; ve los ciclos). **Delegado**: Archimago **Cassius Vellum** (director de la Academia, vanidoso). Gremios: El Aquelarre, La Academia.
- `altamira` — **Altamira** (capital-academia; reliquia mayor en la Biblioteca Prohibida: **El Libro del Aprendizaje**)
- `pozo_luna` — **El Pozo de la Luna** (ruina)
- `aquelarre` — **El Aquelarre** (aldea de brujas)
- `cienaga_trol` — **Ciénaga Trol** (aldea trol; jefe **Jabu el Paciente**)
- `torre_invertida` — **La Torre Invertida** (fortaleza/ruina)

#### LAS ISLAS DE AZAR — "Donde Todo Tiene Precio" (duendes, pícaros, humanos, sirenas)
Archipiélago tropical, faroles, puertos, casinos flotantes. Economía: especias, seda, ron, préstamos, apuestas. **Gobernante**: Don **Tiburcio Faroles**. **Delegada**: **Madame Fortuna**. Gremio: La Banca de las Mil Suertes.
- `puerto_fortuna` — **Puerto Fortuna** (capital; **El Gran Casino "La Banca de las Mil Suertes"**)
- `arena_remolino` — **Arena del Remolino** (apuestas en batallas)
- `cala_contrabandistas` — **Cala de los Contrabandistas** (pueblo pirata; Capitana **Rhea Sal**)
- `faro_sirenas` — **Faro de las Sirenas** (aldea; la sirena **Coralina**)
- `boveda_tiburcio` — **La Bóveda de Tiburcio** (reliquia mayor: **El Libro de la Realidad** — se obtiene ganando *La Apuesta Final*, robándolo con Velo o comprando la Banca)

#### CONCORDIA — sede del **Concilio de los Cinco Continentes** (la "ONU")
- `concordia` — **Concordia** (ciudad blanca; sesiones del Concilio; acto final)

### 3.4 Facciones y gremios (reputación estilo WoW)
Reputación por continente y por gremio: **Odiado** (−42000..−6000) · **Hostil** · **Antipático** · **Neutral** (0) · **Amistoso** (3000) · **Honorable** (9000) · **Reverenciado** (21000) · **Exaltado** (42000). En el juego se usa una escala −100..100 mapeada a esos 8 rangos (Odiado < −75 < Hostil < −40 < Antipático < −10 < Neutral < 15 < Amistoso < 40 < Honorable < 65 < Reverenciado < 90 < Exaltado).

Gremios (mezclan razas, cruzan continentes) y qué ofrecen:
- **Los Juramentados** (caballeros) — mercenarios pesados; odian el Terror.
- **La Orden del Alba** (clérigos) — curación, quitar maldiciones; te odian por naturaleza.
- **La Banca de las Mil Suertes** (duendes) — préstamos con interés, inversiones, casino.
- **El Aquelarre** (brujas) — maldiciones, pociones, secretos del futuro.
- **La Academia de Altamira** (magos) — enseñan/mejoran habilidades (con Esencia).
- **La Casa de las Sedas** (cortesanas y espías) — venden **Secretos**, revelan debilidades y ubicaciones de reliquias.
- **El Gremio de la Ceniza** (pícaros) — contratos, compra de botín robado, asesinatos.
- **El Yunque** (herreros y mineros) — forjan y mejoran reliquias.

---

## 4. Sistemas

### 4.1 Recursos
| Recurso | Uso |
|---|---|
| **Oro** | comercio, reclutar, sobornar, apostar, mantenimiento del ejército |
| **Maná** | hechizos (se regenera rápido gracias a la Fuerza Titánica copiada) |
| **Esencia** ✦ | cae de enemigos y ruinas; sube de rango habilidades y paga fusiones |
| **Influencia** ♛ | capital político; se gana corrompiendo y manipulando; se gasta en el Concilio |
| **Secretos** 🗝 | de cortesanas, espías, infiltraciones; chantaje y revelar debilidades |
| **Alerta del Concilio** (0–100) | amenaza global. Sube con acciones ruidosas; baja con sigilo. 50+: cazadores de héroes; 75+: la Alianza moviliza; 100: ritual del **Gran Sello** (3 lunas para impedirlo) |

Por lugar: **Miedo** (0–100), **Lealtad** (0–100), **Prosperidad**, **Guarnición**, **Control** (quién lo tiene). Por continente: **Corrupción** (0–100) con 4 contribuciones (Conquista/Intriga/Codicia/Terror).

### 4.2 Tiempo
El mapa corre en tiempo real con pausa (Espacio). **1 luna ≈ 75 s** reales en velocidad normal (×1, ×2, ×4). Ciclo día/noche visual dentro de cada luna. Nunca se muestran números de día: el HUD muestra la **fase lunar** (🌑🌒🌓🌔🌕🌖🌗🌘). El Concilio sesiona **cada 4 lunas**. Mantenimiento del ejército e ingresos: **cada luna**.

### 4.3 La Excepción (copiar habilidades) y el Códice
- Cada habilidad tiene **Comprensión** requerida (1–5). Cada vez que **afecta a Elias** (golpe, estado, efecto de área), +1 (los golpes críticos cuentan doble). Al llenarse: **EXCEPCIÓN ADQUIRIDA** (cut-in anime, sonido, ralentización 0.3 s).
- Cada habilidad copiada también otorga **resistencia** a su etiqueta (fuego, veneno, mente, etc.): +20% por habilidad de esa etiqueta, hasta 80%. Las de rareza mítica dan **inmunidad** ("Excepción total").
- **Códice**: colección con % visible ("43/128 Excepciones"). Rangos I–V con Esencia (daño, enfriamiento, efecto extra en III y V).
- **Equipamiento**: 4 espacios activos (teclas 1–4), 2 de reliquia (Q, E), 1 definitiva (R), pasivas raciales ilimitadas. Humano conquistado: +1 espacio.
- **Fusión** (con el Libro del Aprendizaje, o en la Academia de Altamira con coste alto): combina 2 habilidades conocidas → nueva habilidad. Hay recetas con nombre (ej. *Velo* + *Clones de Sombra* = **Legión Invisible**; *Bola de Fuego* + *Nova de Escarcha* = **Vapor Hirviente**; *Dominar Mente* + *Canto Hipnótico* = **Coro de Marionetas**; *Fuerza Titánica* + *Lanzar Aliado* = **Catapulta Humana**; *Daga Solar* + *Daga Lunar* = **Eclipse**) y un generador genérico para cualquier otra combinación (nombre por escuelas: Fuego+Sombra = "Llama Negra", etc.).

**Kit inicial (copiado de Aurel)**:
1. **Dominar Mente** (Mente) — un enemigo lucha por ti 12 s (ojos en espiral); los debilitados (<30% PV) pueden quedarse como **Devotos** después de la batalla. Fuera de batalla: manipular líderes y delegados, hacer trampa en cartas.
2. **Velo** (Sombra) — invisibilidad (y en rango III+, a tus aliados cercanos: "vuelve invisible lo que desee"). El primer golpe desde el Velo es crítico. Fuera de batalla: infiltración, robar, trampas en el casino, bajar la Alerta.
3. **Fuerza Titánica** (Fuerza) — pasiva: tus golpes cuerpo a cuerpo mandan a volar unidades (TABS) y regeneras maná ×3. Activa: *Golpe Titánico* (onda de choque).
4. **Afinidad de Reliquias** (pasiva) — cualquier reliquia te da el 100% de su poder, sin importar la raza (los NPC solo obtienen el poder completo si es de su afinidad).
5. **Retorno** (pasiva) — al morir revives con toda la vida y una onda expansiva. Cargas por batalla: 1 (más con rangos y reliquias). Sin cargas → derrota en esa batalla; reapareces en tu Santuario más cercano, pierdes parte del ejército y la Alerta sube.

**Ataques básicos de Elias**: *Chispa Arcana* (clic izq., proyectil), *Esquivar* (Espacio, i-frames 0.25 s). Con Fuerza Titánica, clic izq. cerca de un enemigo = puñetazo que lanza.

### 4.4 Reliquias
Objetos mágicos que potencian las habilidades del portador **según su tipo** (una reliquia de magia potencia magia, no fuerza). Los NPCs solo reciben el poder completo si su raza está en la afinidad; Elias siempre lo recibe completo. Rareza con colores WoW: **Común** (gris), **Poco común** (verde), **Rara** (azul), **Épica** (morado), **Legendaria** (naranja), **Mítica** (dorado). Equipables: 4 a la vez (+1 con márgenes). Las 3 mayores son míticas y únicas.

**Las tres reliquias mayores**
1. **Las Dagas del Sol y la Luna** — *Aurora* (Daga Solar, bien) y *Nocturna* (Daga Lunar, mal). Por separado: rompen la realidad a pequeña escala (cortes que atraviesan escudos y armadura; *Aurora* ciega y cura, *Nocturna* drena y aterra). **Fusionadas: ECLIPSE**, la espada: mata, y cada enemigo que hiere tiene probabilidad de **volverse contra su propio ejército** (Traición). Su definitiva *Eclipse Total* convierte a la mitad del ejército enemigo.
2. **El Libro de la Realidad** — permite **Reescribir** algo, pero exige un **Sacrificio**. Reescrituras: *"Este ejército nunca existió"*, *"Ese líder siempre me fue leal"*, *"El oro vale el doble"* (3 lunas), *"Nadie me ha visto"* (Alerta = 0), *"Esta batalla ya la gané"*, *"Esa reliquia siempre fue mía"*. Sacrificios a elegir: una habilidad del Códice (se pierde en este ciclo), una reliquia, la mitad del ejército, −20% vida máxima, −30 de corrupción en un continente, *un recuerdo* (una página del libro)... y al final, **tu nombre**.
3. **El Libro del Aprendizaje** — enseña habilidades "rotas" y permite **fusionar** todo lo que sepas: **Paso Fantasma** (teletransporte al cursor), **Mil Cortes** (atacas tan rápido que pareces multiplicarte: dash encadenado con imágenes residuales), **Clones de Sombra** (3–5 clones indistinguibles que pelean y lanzan tus hechizos; los enemigos no saben cuál eres), **Metamorfosis** (te transformas en cualquier linaje que hayas conquistado o copiado: Gigante, Ogro, Dracónido... con sus estadísticas y poderes).

**Otras reliquias (invención)** — ver `src/data/relics.ts` para la lista completa (40+). Ejemplos: *La Corona Vacía* (Valdoria, dominar líderes cuesta la mitad), *El Reloj sin Agujas* (ralentiza el tiempo en batalla), *La Brújula de lo Perdido* (revela reliquias en el mapa), *El Dado de Hueso de Dios* (vuelve a tirar un resultado en el casino, 1 vez por juego), *La Moneda de Dos Caras Iguales* (+15% oro de todo), *El Guantelete del Titán*, *El Arco de la Última Estrella*, *El Martillo de Kharn*, *El Cáliz de la Sangre Pactada* (robo de vida), *La Máscara sin Rostro* (disfrazarte de miembro de cualquier facción), *El Espejo de Obsidiana* (refleja hechizos), *La Campana del Silencio*, *El Estandarte del Rey Caído* (moral del ejército), *El Farol de Almas* (+Esencia), *El Tambor de Guerra Trol*, *La Semilla del Primer Árbol*, *El Ojo del Cíclope*, *El Libro de Cuentas Infinitas* (interés compuesto a tu favor), *El Collar de Bruma* (ver "lo que la perrita vio": revela lo invisible), *La Pluma del Narrador* (secreta, Ciclo 2+: cambia una línea del destino — reescribe gratis una vez por ciclo).

### 4.5 Ejército y batallas (estilo TABS + control directo)
- **Reclutar** en lugares según las razas que viven ahí (más barato con Miedo alto o reputación alta). Mantenimiento por luna; si no pagas, deserción y moral baja.
- **Veteranía**: unidades que sobreviven ganan estrellas (★ a ★★★): +vida, +daño.
- **Devotos**: enemigos dominados que se unen al ejército.
- **Tipos de batalla**: Escaramuza (campo abierto, caravanas, patrullas), Asedio (defensores con muros y torres), Ruina (oleadas + guardián; da reliquias), Duelo (Elias vs. héroe/némesis), Arena (apuestas, modo espectador).
- **Flujo**: 1) **Despliegue** (vista cenital, colocas tus unidades en tu zona azul con clic/arrastre, ves al enemigo en la zona roja, presupuesto = tu ejército). 2) **Batalla** en tiempo real: controlas a Elias (WASD + ratón apunta; clic izq. básico; clic der. secundario; 1–4 habilidades; Q/E reliquias; R definitiva; Espacio esquivar; Shift correr; rueda zoom; V cambia cámara táctica ↔ hombro). Órdenes al ejército: Z *¡Carguen!*, X *¡Mantengan!*, C *¡Síganme!*. 3) **Resultado**: botín con revelación por rareza, Esencia, habilidades copiadas, unidades ascendidas, prisioneros (convertir con Dominar Mente), actualización de némesis.
- **Sensación**: golpes con *hitstop* (40–90 ms), sacudida de cámara, unidades que vuelan en arcos, cámara lenta en muertes de capitanes, impact frames en críticos, números de daño con Bangers.

### 4.6 NPCs con memoria y Némesis
- NPCs con nombre (líderes, delegados, comerciantes, taberneros, capitanes, héroes) tienen: rasgos (Codicioso, Cobarde, Orgulloso, Leal, Vengativo, Piadoso, Supersticioso, Ambicioso, Borracho, Curioso), sentimientos hacia Elias (**miedo, odio, deuda, respeto**, 0–100) y **memorias** (qué pasó, dónde, en qué luna, intensidad).
- Los diálogos citan memorias: *"Tú. Tú mataste a Brann en el Vado."* · *"Todavía no entiendo por qué me dejaste vivir."* · *"La última vez me robaste. Esta vez paga por adelantado."*
- **Némesis**: en cada batalla hay capitanes enemigos con nombre. Si sobreviven (huyen) o **matan a Elias**, ascienden (título, nivel, cicatriz, rasgo nuevo), te guardan rencor y pueden reaparecer como grupos que te cazan en el mapa. Antes de la batalla hay un cut-in con su provocación, citando el encuentro anterior. Si les dominas la mente, se vuelven **tenientes** (capitanes de tu ejército con bonus).
- **Cazadores del Concilio** (Alerta 50+): héroes con habilidades raras — objetivos perfectos para copiar.
- Rumores: el mundo comenta lo que hiciste ("Dicen que en Kharaz un mago se dejó golpear por un gigante... y luego pisoteó como uno").

### 4.7 Política — El Concilio de los Cinco
- 5 delegados (uno por continente) + la Custodia Ione (desempata). Sesión cada 4 lunas (aviso en noticias con cuenta atrás en lunas).
- Cada sesión vota 1–3 **resoluciones** (pool + disparadas por tus actos): *Sanciones contra la Excepción* (precios +20% para ti, Alerta +10), *Movilizar la Gran Alianza*, *Recompensa por la cabeza de Elias* (cazarrecompensas), *Tratado de Libre Comercio*, *Embargo a Kharaz*, *Prohibir las Apuestas* (¡cierra el casino!), *Amnistía para las Brujas*, *Llamar de vuelta al Campeón* (Aurel regresa), *Fondo de Reconstrucción*, y (con ≥3 asientos tuyos) *Nombrar a Elias Veyr Custodio* (atajo político al acto final: +Intriga masiva).
- **Pantalla de votación**: retratos de delegados con medidor de postura (−100..+100). Herramientas: **Dominar Mente** (voltea fuerte; cuesta maná; riesgo de detección salvo que estés bajo Velo), **Sobornar** (oro; los codiciosos son baratos), **Chantajear** (gasta un Secreto sobre ese delegado), **Intimidar** (Miedo; los valientes resisten), **Asesinar** (lo reemplaza alguien al azar; Alerta +25), **Discurso** (si tienes asiento). Los delegados de continentes corrompidos votan contigo.

### 4.8 Economía
- Bienes: **Grano, Madera, Hierro, Especias, Seda, Pociones, Gemas, Maná cristalizado**. Cada lugar produce/consume ciertos bienes; precio = base × f(stock/objetivo) con reversión a la media; eventos y tus actos lo mueven (quemar cosechas sube el grano).
- **Caravanas** visibles en el mapa llevan bienes entre lugares: puedes asaltarlas (batalla) o protegerlas.
- Comercio del jugador: comprar barato, vender caro (bucle Mount & Blade). **Regateo** (minijuego) para compras grandes y reliquias: oferta/contraoferta con paciencia del mercader; Miedo, Presencia o Dominar Mente ayudan.
- **Negocios**: compra molinos, minas, talleres, tabernas, casas de seda → ingreso por luna + Codicia. Con >50% del control económico de un continente puedes **manipular precios** (hundir o disparar mercados).
- **Préstamos** de la Banca (interés por luna). Si no pagas: cazarrecompensas duendes vienen a embargarte.

### 4.9 Acciones en lugares
Menú contextual del lugar (con escena 3D de fondo):
*Hablar* (NPCs presentes; opción universal "¿Qué año es?"), *Mercado*, *Reclutar*, *Taberna* (rumores, contratos, dados rápidos, héroes a sueldo), *Casa de las Sedas* (comprar Secretos), *Aterrorizar* (+Miedo, +Terror, −reputación, +Alerta), *Manipular* (Dominar Mente al líder: +Intriga, maná, riesgo), *Invertir* (+Codicia), *Saquear* (+oro, +miedo, −reputación, +Alerta), *Atacar/Asediar* (batalla → capturar: +Conquista), *Infiltrar* (requiere Velo: robar Secretos/oro, asesinar, robar reliquia; minijuego de sigilo o tirada), *Explorar ruina* (batalla de ruina → reliquia), *Casino / Arena* (Islas), *Descansar*, *Fundar Santuario* (punto de reaparición).

### 4.10 Casino — Islas de Azar
Moneda: Oro. Todo es **dinero del juego**, nunca real. Presentación muy "jugosa": lluvia de monedas, luces, banners ("¡GANANCIA!", "¡GRAN GANANCIA!", "¡EXCEPCIONAL!"), casi-premios con tensión, rachas.
1. **Tragamonedas de Reliquias** — 5 rodillos × 3 filas, líneas de pago, símbolos de reliquias; **Eclipse** = scatter (3+ → *Giros de la Excepción* gratis); **X** = comodín; bote progresivo que crece; el premio mayor da una reliquia real.
2. **La Rueda de las Almas** — ruleta de 37 casillas (0 = Eclipse); apuestas: Sol/Luna (color), par/impar, docenas, número. Puedes apostar **Esencia** ("almas"). Trampa: Velo para empujar la bola (riesgo).
3. **Veintiuno del Tarot** — blackjack con baraja española de tarot (palos: espadas, copas, oros, bastos) + **Arcanos Mayores** con efectos (*El Loco* cambia tu carta, *La Torre* descarta tu mano, *El Mundo* = 21 instantáneo, *El Sol* revela la carta del crupier, *La Luna* esconde tu carta, *La Muerte* reinicia la ronda). Trampa: Dominar Mente al crupier.
4. **Dados Mentirosos** — contra 2–3 tahúres con nombre (y memoria: rivales recurrentes). Dominar Mente = ver los dados de uno; Velo = cambiar un dado. Riesgo de detección por la percepción de cada rival.
5. **Arena del Remolino** — apuestas en batallas TABS entre dos ejércitos aleatorios con cuotas (con margen de la casa). Ves la batalla en 3D (modo espectador). Trampa: entrar invisible a influir (peligroso).
6. **El Pozo de los Deseos** — lanzas oro (100 / 1000) por una reliquia o fragmento al azar, revelación por rareza con haz de color, **contador de piedad** visible ("Legendaria garantizada en 23 tiros").
7. **La Apuesta Final** — Don Tiburcio en persona: al mejor de 3 (Dados Mentirosos) apostando 10.000 de oro (o una reliquia, o *un año de tu vida*... que no existe, porque nadie cuenta los años — Tiburcio se ríe). Premio: **El Libro de la Realidad**.
- **Seguridad**: "Los Ojos de la Casa". Si te pillan: multa, o pelea con guardias (batalla), y reputación con la Banca baja.
- En cualquier taberna: **Tres Dados** (apuesta rápida).

### 4.11 Designios (misiones)
Registro visible de objetivos (principales, secundarios y dinámicos — *contratos* de tabernas: asaltar caravana, asesinar, entregar, ganar en la arena). Los objetivos incompletos siempre están a la vista (efecto Zeigarnik). Cada designio da recompensa clara.

### 4.12 Progresión meta — *Los Márgenes*
Guardado aparte del ciclo. **Tinta** (moneda meta) al terminar un ciclo = f(continentes, reliquias, excepciones, hazañas).
- **Anotaciones al margen** (mejoras permanentes con rangos): +1 espacio de Eco, +10% oro, empezar con una reliquia poco común, +1 carga de Retorno, revelar una debilidad al inicio, +suerte en el casino, reclutamiento −10%, Alerta −10% de ganancia, empezar con 3 Devotos, +1 espacio de reliquia...
- **Ecos**: al iniciar un ciclo eliges N habilidades de tu Códice histórico para empezar con ellas.
- **Páginas del Libro**: ~30 fragmentos de lore escritos con el estilo del libro (sin fechas, sin capítulos) repartidos por el mundo (algunos solo en ciclos posteriores). Colección con %.
- **Hazañas** (logros): ~30.
- **Presagios**: modificador diario con semilla (misma para todos ese día) y **Pactos** opcionales de dificultad a cambio de más Tinta.

### 4.13 "Siempre estuve viéndote" — el registro
El juego registra estadísticas (solo localmente): muertes, revividas, oro apostado, mayor ganancia, mayor pérdida, trampas hechas y atrapadas, unidades perdidas, sacrificios, NPCs perdonados/asesinados, mentes dominadas, tiempo jugado, momentos de inactividad, veces que dudó (abrir/cerrar la pantalla de sacrificio), hora local. El narrador y el final los usan ("Te fuiste. Él esperó." si el jugador deja el juego inactivo mucho tiempo).

---

## 5. Controles (resumen)
- **Mapa**: WASD / clic para mover el grupo; Espacio pausa; 1/2/3 velocidad; rueda zoom; clic en lugar = entrar; Tab = Códice; I = Reliquias; J = Designios; M = Mapa político; Esc = menú.
- **Batalla**: WASD mover, ratón apuntar, clic izq./der., 1–4, Q, E, R, Espacio esquivar, Shift correr, Z/X/C órdenes, V cámara, Esc pausa.
- **Diálogo**: clic/Espacio avanzar; 1–4 elegir.

## 6. Sesión y ritmo
- Primer ciclo: 60–120 min. Ciclos siguientes: 30–60 min (más poder, conocimiento).
- Cada 3–5 minutos debe pasar algo notable: una habilidad nueva, una reliquia, un nombre nuevo, una sesión del Concilio, un némesis, una gran ganancia.
- Guardado automático constante. Se puede cerrar el navegador y seguir.
