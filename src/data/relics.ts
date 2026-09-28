/**
 * Reliquias (GDD §4.4). Canonical export: RELICS.
 *
 * ── Passive keys (RelicDef.passives) — read through `relicPassive(key)` (systems/progression/relics.ts),
 *    which sums equipped relics × forge level bonus (+25% per level). Values are fractions unless noted.
 *  gold_mult          +x oro de todas las fuentes                     (economy/world: multiply gold gains)
 *  trade_mult         +x mejores precios (compra más barato, vende más caro)
 *  interest           +x interés por luna sobre tu oro (Libro de Cuentas Infinitas)
 *  casino_luck        +x suerte en el casino (0.1 ≈ +10% de ventaja relativa)
 *  reroll             N re-tiradas por juego de casino (Dado de Hueso de Dios)
 *  reveal_relics      1 = muestra reliquias en el mapa
 *  reveal_weakness    1 = revela multiplicadores de corrupción de los continentes
 *  reveal_invisible   1 = ves unidades invisibles en batalla (y trampas en el casino)
 *  alert_mult         +x a las ganancias de Alerta (negativo = menos Alerta)
 *  stealth            +x éxito en Infiltrar / trampas sin ser visto
 *  disguise           1 = puedes disfrazarte de miembro de cualquier facción
 *  recruit_discount   +x descuento al reclutar
 *  upkeep_mult        +x al mantenimiento (negativo = más barato)
 *  army_morale        +x moral del ejército
 *  army_damage        +x daño del ejército
 *  army_speed         +x velocidad del ejército
 *  fear_mult          +x Miedo generado (Aterrorizar, Terror)
 *  influence_gain     +x Influencia ganada
 *  secret_gain        +x Secretos ganados
 *  steal_mult         +x oro robado
 *  dominate_cost      +x coste de Dominar Mente sobre líderes (negativo = más barato)
 *  mana_regen         +x regeneración de maná
 *  mana_cost          +x coste de maná (negativo = más barato)
 *  cooldown_mult      +x enfriamientos (negativo = más rápidos)
 *  hp_regen           N PV por segundo en batalla
 *  heal_mult          +x curación recibida y hecha
 *  lifesteal          x del daño hecho vuelve como vida
 *  crit_chance        +x probabilidad de crítico
 *  crit_mult          +x daño crítico
 *  armor_pierce       1 = tus golpes atraviesan escudos y armadura
 *  knockback_mult     +x empuje (TABS)
 *  range_mult         +x alcance de proyectiles
 *  move_speed         +x velocidad de movimiento
 *  reflect            x del daño de hechizos reflejado al lanzador
 *  time_slow          x de ralentización del mundo en batalla (enemigos)
 *  traicion_chance    x probabilidad de que un enemigo herido se vuelva contra los suyos
 *  retorno_extra      N cargas extra de Retorno por batalla
 *  essence_mult       +x Esencia ganada
 *  loot_luck          +x mejora de rareza en el botín (0.1 ≈ un peldaño cada 10 tiradas)
 *  comprehension_bonus x probabilidad de +1 Comprensión extra al ser golpeado
 *  resist_all         +x resistencia a todas las etiquetas
 *  resist_<tag>       +x resistencia a una etiqueta (resist_fuego, resist_mente...)
 *  equip_cap          N espacios de reliquia extra
 *  free_rewrite       N reescrituras sin sacrificio por ciclo (La Pluma del Narrador)
 */
import type { RelicDef } from './types';

const R = (d: RelicDef) => d;

export const RELICS: Record<string, RelicDef> = {
  // ═══════════════════ LAS TRES RELIQUIAS MAYORES (míticas, únicas)
  daga_solar: R({ id: 'daga_solar', name: 'Aurora, la Daga Solar', shape: 'daga', rarity: 'mitica', major: true, unique: true, location: 'templo_alba',
    lore: 'Forjada con el primer amanecer del mundo. Corta la noche, y todo lo que se esconde en ella.',
    effectText: 'Tus cortes atraviesan escudos y armadura. +35% daño de Luz y +15% curación. Concede Corte de Aurora.',
    affinity: ['clerigo', 'elfo'], stats: { magia: 0.15 }, schoolBoost: { luz: 0.35 }, grants: 'aurora_corte', passives: { armor_pierce: 1, heal_mult: 0.15 } }),
  daga_lunar: R({ id: 'daga_lunar', name: 'Nocturna, la Daga Lunar', shape: 'daga', rarity: 'mitica', major: true, unique: true, location: 'mina_luna',
    lore: 'Los enanos cavaron hasta un pedazo de luna caída. Dentro encontraron esto, todavía frío, todavía brillando.',
    effectText: 'Tus cortes atraviesan escudos y armadura. +35% daño de Sombra, robo de vida y más Miedo. Concede Drenaje de Nocturna.',
    affinity: ['picaro', 'bruja'], stats: { fuerza: 0.15 }, schoolBoost: { sombra: 0.35, sangre: 0.2 }, grants: 'nocturna_drenaje', passives: { armor_pierce: 1, lifesteal: 0.1, fear_mult: 0.25 } }),
  eclipse: R({ id: 'eclipse', name: 'Eclipse', shape: 'espada', rarity: 'mitica', major: true, unique: true,
    lore: 'Aurora y Nocturna fundidas en la Forja Primigenia: un disco negro con una corona delgada de luz. Mata. Y convence a los que no mata.',
    effectText: 'Cada enemigo que hieres puede volverse contra su ejército (Traición). +40% Luz y Sombra. Concede Eclipse Total.',
    affinity: 'any', stats: { fuerza: 0.25, magia: 0.25 }, schoolBoost: { luz: 0.4, sombra: 0.4 }, grants: 'eclipse_total',
    passives: { traicion_chance: 0.12, armor_pierce: 1, lifesteal: 0.12 } }),
  libro_realidad: R({ id: 'libro_realidad', name: 'El Libro de la Realidad', shape: 'libro', rarity: 'mitica', major: true, unique: true, location: 'boveda_tiburcio',
    lore: 'Sus páginas están en blanco hasta que alguien escribe. Lo que se escribe, pasa. Lo que se paga, no vuelve.',
    effectText: 'Permite Reescribir la realidad a cambio de un Sacrificio.',
    affinity: 'any', stats: { presencia: 0.15 }, passives: { influence_gain: 0.1 } }),
  libro_aprendizaje: R({ id: 'libro_aprendizaje', name: 'El Libro del Aprendizaje', shape: 'libro', rarity: 'mitica', major: true, unique: true, location: 'altamira',
    lore: 'Encadenado en la Biblioteca Prohibida de Altamira. Enseña cosas que no se deberían saber, y las enseña muy bien.',
    effectText: 'Enseña Paso Fantasma, Mil Cortes, Clones de Sombra y Metamorfosis. Permite fusionar habilidades. +25% prob. de Comprensión extra.',
    affinity: 'any', stats: { magia: 0.1 }, passives: { comprehension_bonus: 0.25 } }),

  // ═══════════════════ RELIQUIAS FIJAS Y SECRETAS
  corona_vacia: R({ id: 'corona_vacia', name: 'La Corona Vacía', shape: 'corona', rarity: 'legendaria', unique: true, location: 'mausoleo_alba',
    lore: 'Hecha para el Héroe "cuando llegue su hora". Nadie la ha llevado nunca. Pesa exactamente lo que pesa una promesa.',
    effectText: 'Dominar la mente de líderes cuesta la mitad. +20% Influencia. Concede El Peso de la Corona.',
    affinity: ['humano', 'caballero'], stats: { presencia: 0.3 }, grants: 'peso_corona', passives: { dominate_cost: -0.5, influence_gain: 0.2 } }),
  collar_bruma: R({ id: 'collar_bruma', name: 'El Collar de Bruma', shape: 'collar', rarity: 'legendaria', unique: true, location: 'aldea_colmenas',
    lore: 'Cuero viejo y una plaquita: BRUMA. Quien lo lleva ve lo que ella veía: que seguía amaneciendo.',
    effectText: 'Ves lo invisible y las ilusiones. −10% Alerta. Concede Lo que Bruma Vio.',
    affinity: 'any', grants: 'mirada_bruma', passives: { reveal_invisible: 1, alert_mult: -0.1, resist_mente: 0.1 } }),
  pluma_narrador: R({ id: 'pluma_narrador', name: 'La Pluma del Narrador', shape: 'pluma', rarity: 'mitica', unique: true, secret: true, minCycle: 2,
    lore: 'Escribe sola, con una letra que reconoces. Es la tuya. Nunca la has usado.',
    effectText: 'Una vez por ciclo, reescribe una línea del destino sin Sacrificio. +20% Esencia.',
    affinity: 'any', stats: { magia: 0.1, presencia: 0.1 }, passives: { free_rewrite: 1, essence_mult: 0.2 } }),

  // ═══════════════════ MÍTICAS
  lagrima_heroe: R({ id: 'lagrima_heroe', name: 'La Lágrima del Héroe', shape: 'gema', rarity: 'mitica', unique: true,
    lore: 'Aurel lloró una sola vez, de niño, en un bosque, sin saber por qué. La lágrima se volvió cristal. Él no lo sabe.',
    effectText: '+1 carga de Retorno, +20% Vida y Magia, +20% curación.',
    affinity: 'any', stats: { vida: 0.2, magia: 0.2 }, passives: { retorno_extra: 1, heal_mult: 0.2 } }),
  sello_cinco: R({ id: 'sello_cinco', name: 'El Sello de los Cinco', shape: 'anillo', rarity: 'mitica', unique: true,
    lore: 'Cinco anillos de oro fundidos en uno, el día que se firmó la paz. Con él, un voto del Concilio vale por dos.',
    effectText: '+50% Influencia, dominar líderes −25%, +30% Presencia.',
    affinity: ['humano', 'clerigo'], stats: { presencia: 0.3 }, passives: { influence_gain: 0.5, dominate_cost: -0.25 } }),

  // ═══════════════════ LEGENDARIAS
  reloj_sin_agujas: R({ id: 'reloj_sin_agujas', name: 'El Reloj sin Agujas', shape: 'reloj', rarity: 'legendaria',
    lore: 'Marca una hora que nadie ha vivido. Los relojeros de Altamira se niegan a abrirlo.',
    effectText: 'Los enemigos se mueven un 15% más lento. −10% enfriamientos. Concede Segundo Robado.',
    affinity: ['mago', 'elfo'], stats: { velocidad: 0.1 }, schoolBoost: { tiempo: 0.3 }, grants: 'segundo_robado', passives: { time_slow: 0.15, cooldown_mult: -0.1 } }),
  dado_hueso_dios: R({ id: 'dado_hueso_dios', name: 'El Dado de Hueso de Dios', shape: 'dado', rarity: 'legendaria',
    lore: 'Tallado del nudillo de algo que fue adorado. Tiene siete caras. Nadie ha visto la séptima.',
    effectText: 'Vuelve a tirar un resultado en el casino, una vez por juego. +30% Suerte.',
    affinity: ['duende'], stats: { suerte: 0.3 }, schoolBoost: { suerte: 0.25 }, passives: { reroll: 1, casino_luck: 0.1 } }),
  arco_ultima_estrella: R({ id: 'arco_ultima_estrella', name: 'El Arco de la Última Estrella', shape: 'arco', rarity: 'legendaria',
    lore: 'Los elfos dispararon todas las estrellas menos una. Esta. Por si acaso.',
    effectText: '+20% alcance y +10% crítico. +20% daño de Luz y Físico. Concede La Última Estrella.',
    affinity: ['elfo'], stats: { velocidad: 0.1 }, schoolBoost: { luz: 0.2, fisico: 0.2 }, grants: 'ultima_estrella', passives: { range_mult: 0.2, crit_chance: 0.1 } }),
  martillo_kharn: R({ id: 'martillo_kharn', name: 'El Martillo de Kharn', shape: 'martillo', rarity: 'legendaria',
    lore: 'Kharn, el primer rey enano, forjó la montaña con él. O eso dice la inscripción, que escribió Kharn.',
    effectText: '+30% daño de Rayo, +20% de Tierra, +20% empuje. Concede Ira de Kharn.',
    affinity: ['enano', 'gigante'], stats: { fuerza: 0.2, armadura: 0.15 }, schoolBoost: { rayo: 0.3, tierra: 0.2 }, grants: 'ira_kharn', passives: { knockback_mult: 0.2 } }),
  mascara_sin_rostro: R({ id: 'mascara_sin_rostro', name: 'La Máscara sin Rostro', shape: 'mascara', rarity: 'legendaria',
    lore: 'Lisa, blanca, sin agujeros para los ojos. Aun así, ves perfectamente. Los demás no te ven a ti.',
    effectText: 'Puedes disfrazarte de miembro de cualquier facción. +25% sigilo, −15% Alerta. Concede Rostro Prestado.',
    affinity: ['picaro', 'humano'], stats: { presencia: 0.1 }, grants: 'rostro_prestado', passives: { disguise: 1, stealth: 0.25, alert_mult: -0.15 } }),
  semilla_primer_arbol: R({ id: 'semilla_primer_arbol', name: 'La Semilla del Primer Árbol', shape: 'semilla', rarity: 'legendaria',
    lore: 'Todavía está viva. Si la plantas, algo crecerá. Los elfos prefieren que no averigües qué.',
    effectText: '+20% Vida, regeneras 2 PV/s, +20% curación, +35% Naturaleza. Concede Raíces del Primer Árbol.',
    affinity: ['elfo', 'clerigo'], stats: { vida: 0.2 }, schoolBoost: { naturaleza: 0.35 }, grants: 'raices_primer_arbol', passives: { hp_regen: 2, heal_mult: 0.2 } }),
  libro_cuentas_infinitas: R({ id: 'libro_cuentas_infinitas', name: 'El Libro de Cuentas Infinitas', shape: 'libro', rarity: 'legendaria',
    lore: 'Cada página suma la anterior. La última página todavía no existe; el libro la está calculando.',
    effectText: 'Cada luna tu oro gana un 3% de interés compuesto. +10% oro y mejores precios.',
    affinity: ['duende', 'enano'], passives: { interest: 0.03, gold_mult: 0.1, trade_mult: 0.1 } }),
  corazon_gigante: R({ id: 'corazon_gigante', name: 'Corazón del Gigante Dormido', shape: 'corazon', rarity: 'legendaria',
    lore: 'Late una vez por luna. Cuando late, tiemblan las copas en Kharaz-Dûm.',
    effectText: '+35% Vida, +10% Armadura, regeneras 1 PV/s, +20% daño de Tierra.',
    affinity: ['gigante'], stats: { vida: 0.35, armadura: 0.1 }, schoolBoost: { tierra: 0.2 }, passives: { hp_regen: 1 } }),
  escama_madre_dragon: R({ id: 'escama_madre_dragon', name: 'Escama de la Madre Dragón', shape: 'escama', rarity: 'legendaria',
    lore: 'Del tamaño de un escudo y tibia como un hogar. La Madre Dragón no la echa de menos. Todavía.',
    effectText: '+50% resistencia al Fuego, +35% daño de Fuego, +20% Armadura. Concede Aliento de Fuego.',
    affinity: ['draconido'], stats: { armadura: 0.2 }, schoolBoost: { fuego: 0.35 }, grants: 'aliento_fuego', passives: { resist_fuego: 0.5 } }),
  ultima_carta: R({ id: 'ultima_carta', name: 'La Última Carta', shape: 'carta', rarity: 'legendaria',
    lore: 'Madame Fortuna la guarda en la manga desde hace varios ciclos. Dice que es tuya; que ya se la ganaste. Que todavía no.',
    effectText: '+25% Suerte, una re-tirada por juego de casino, +12% suerte en el casino, +8% crítico.',
    affinity: ['duende', 'humano', 'sirena'], stats: { suerte: 0.25 }, passives: { casino_luck: 0.12, reroll: 1, crit_chance: 0.08 } }),

  // ═══════════════════ ÉPICAS
  brujula_perdido: R({ id: 'brujula_perdido', name: 'La Brújula de lo Perdido', shape: 'brujula', rarity: 'epica',
    lore: 'No apunta al norte. Apunta a lo que perdiste. Contigo, no deja de girar.',
    effectText: 'Revela las reliquias en el mapa. +10% velocidad de viaje.',
    affinity: ['humano', 'duende', 'picaro'], passives: { reveal_relics: 1, move_speed: 0.1 } }),
  guantelete_titan: R({ id: 'guantelete_titan', name: 'El Guantelete del Titán', shape: 'guantelete', rarity: 'epica',
    lore: 'Hecho a medida para una mano que ya no existe. Se ajusta a la tuya con un chasquido que no te gusta.',
    effectText: '+30% Fuerza, +25% daño de Fuerza, +30% empuje. Concede Puño de la Montaña.',
    affinity: ['gigante', 'ogro'], stats: { fuerza: 0.3 }, schoolBoost: { fuerza: 0.25, fisico: 0.15 }, grants: 'puno_montana', passives: { knockback_mult: 0.3 } }),
  caliz_sangre_pactada: R({ id: 'caliz_sangre_pactada', name: 'El Cáliz de la Sangre Pactada', shape: 'caliz', rarity: 'epica',
    lore: 'Nunca está vacío. Nadie recuerda haberlo llenado. Sabe a hierro y a promesa.',
    effectText: 'Robo de vida 12%. +30% daño de Sangre. Concede Pacto de Sangre.',
    affinity: ['bruja', 'trol'], schoolBoost: { sangre: 0.3 }, grants: 'pacto_sangre', passives: { lifesteal: 0.12 } }),
  espejo_obsidiana: R({ id: 'espejo_obsidiana', name: 'El Espejo de Obsidiana', shape: 'espejo', rarity: 'epica',
    lore: 'Refleja todo menos a quien lo sostiene. Los hechizos rebotan en él como piedras en un lago.',
    effectText: 'Refleja 20% del daño de hechizos. Concede Reflejo de Obsidiana.',
    affinity: ['mago', 'bruja'], stats: { magia: 0.1 }, grants: 'reflejo_obsidiana', passives: { reflect: 0.2 } }),
  estandarte_rey_caido: R({ id: 'estandarte_rey_caido', name: 'El Estandarte del Rey Caído', shape: 'estandarte', rarity: 'epica',
    lore: 'Nadie recuerda el nombre del rey. El estandarte sí, y lo grita cuando sopla el viento.',
    effectText: '+25% moral y +10% daño del ejército. Concede Grito del Rey Caído.',
    affinity: ['caballero', 'humano'], stats: { presencia: 0.15 }, grants: 'grito_rey_caido', passives: { army_morale: 0.25, army_damage: 0.1 } }),
  ojo_ciclope: R({ id: 'ojo_ciclope', name: 'El Ojo del Cíclope', shape: 'ojo', rarity: 'epica',
    lore: 'Parpadea cuando no lo miras. Ve las grietas de todo: murallas, ejércitos, promesas.',
    effectText: '+10% crítico, +15% alcance, revela debilidades de los continentes. Concede Mirada del Cíclope.',
    affinity: ['gigante'], stats: { magia: 0.1 }, schoolBoost: { arcano: 0.2 }, grants: 'mirada_ciclope', passives: { crit_chance: 0.1, range_mult: 0.15, reveal_weakness: 1 } }),
  craneo_profeta: R({ id: 'craneo_profeta', name: 'Cráneo del Profeta Parlanchín', shape: 'craneo', rarity: 'epica',
    lore: 'Predijo el fin del mundo tres veces. Sigue hablando, cada vez más bajito.',
    effectText: 'Revela debilidades de los continentes. +25% Secretos.',
    affinity: ['bruja', 'mago'], stats: { magia: 0.1 }, passives: { reveal_weakness: 1, secret_gain: 0.25 } }),
  espada_juramento_roto: R({ id: 'espada_juramento_roto', name: 'Espada del Juramento Roto', shape: 'espada', rarity: 'epica',
    lore: 'Un caballero la clavó en su propio escudo el día que dejó de creer. Todavía vibra.',
    effectText: '+20% Fuerza, +20% daño Físico, robo de vida 6%, +25% daño crítico.',
    affinity: ['caballero'], stats: { fuerza: 0.2 }, schoolBoost: { fisico: 0.2 }, passives: { lifesteal: 0.06, crit_mult: 0.25 } }),
  capa_noche_viva: R({ id: 'capa_noche_viva', name: 'Capa de la Noche Viva', shape: 'capa', rarity: 'epica',
    lore: 'Está hecha de una noche que se negó a terminar. A veces respira.',
    effectText: '+25% daño de Sombra, +20% sigilo, +30% daño crítico desde la invisibilidad.',
    affinity: ['picaro', 'bruja'], schoolBoost: { sombra: 0.25 }, passives: { stealth: 0.2, crit_mult: 0.3 } }),
  lente_copista: R({ id: 'lente_copista', name: 'La Lente del Copista', shape: 'ojo', rarity: 'epica',
    lore: 'Perteneció a un monje de Altamira que copiaba libros prohibidos de memoria. Ahora copia otras cosas.',
    effectText: '35% de probabilidad de ganar Comprensión extra al ser golpeado.',
    affinity: 'any', stats: { magia: 0.05 }, passives: { comprehension_bonus: 0.35 } }),
  grillete_roto: R({ id: 'grillete_roto', name: 'El Grillete Roto', shape: 'anillo', rarity: 'epica',
    lore: 'Te lo pusieron en un ciclo que no recuerdas. Lo rompiste en uno que sí.',
    effectText: '−20% Alerta, +10% Armadura, +5% resistencia a todo.',
    affinity: 'any', stats: { armadura: 0.1 }, passives: { alert_mult: -0.2, resist_all: 0.05 } }),

  // ═══════════════════ RARAS
  moneda_dos_caras: R({ id: 'moneda_dos_caras', name: 'La Moneda de Dos Caras Iguales', shape: 'moneda', rarity: 'rara',
    lore: 'Cara y cara. Don Tiburcio tiene una igual. Dice que la tuya es falsa. La suya también.',
    effectText: '+15% oro de todas las fuentes. +10% Suerte.',
    affinity: ['duende', 'picaro'], stats: { suerte: 0.1 }, passives: { gold_mult: 0.15 } }),
  campana_silencio: R({ id: 'campana_silencio', name: 'La Campana del Silencio', shape: 'campana', rarity: 'rara',
    lore: 'Suena sin hacer ruido. Después de oírla, nadie habla durante un rato.',
    effectText: '−10% Alerta. Concede Tañido del Silencio.',
    affinity: ['clerigo', 'humano'], grants: 'tanido_silencio', passives: { alert_mult: -0.1 } }),
  farol_almas: R({ id: 'farol_almas', name: 'El Farol de Almas', shape: 'farol', rarity: 'rara',
    lore: 'La llama es violeta y se inclina hacia los moribundos, como si tuviera hambre.',
    effectText: '+25% Esencia. +15% daño de Sombra. Concede Cosecha de Almas.',
    affinity: ['bruja', 'mago', 'trol'], schoolBoost: { sombra: 0.15 }, grants: 'cosecha_almas', passives: { essence_mult: 0.25 } }),
  tambor_guerra_trol: R({ id: 'tambor_guerra_trol', name: 'El Tambor de Guerra Trol', shape: 'tambor', rarity: 'rara',
    lore: 'Parche de piel de algo con escamas. Los troles dicen que el ritmo lo lleva el tambor, no el que toca.',
    effectText: '+10% velocidad y +5% daño del ejército, +10% Miedo. Concede Ritmo de Guerra.',
    affinity: ['trol', 'ogro'], grants: 'ritmo_guerra', passives: { army_speed: 0.1, army_damage: 0.05, fear_mult: 0.1 } }),
  anillo_centella: R({ id: 'anillo_centella', name: 'Anillo de la Centella', shape: 'anillo', rarity: 'rara',
    lore: 'Da calambre al ponérselo. Y al quitárselo. Y a la gente que te da la mano.',
    effectText: '+25% daño de Rayo, +10% Magia.',
    affinity: ['mago'], stats: { magia: 0.1 }, schoolBoost: { rayo: 0.25 } }),
  orbe_escarcha: R({ id: 'orbe_escarcha', name: 'Orbe de Escarcha Eterna', shape: 'orbe', rarity: 'rara',
    lore: 'Un invierno entero cabe dentro. Si lo agitas, nieva en tu mano.',
    effectText: '+25% daño de Hielo, +10% Maná.',
    affinity: ['mago', 'bruja'], stats: { mana: 0.1 }, schoolBoost: { hielo: 0.25 } }),
  corazon_brasas: R({ id: 'corazon_brasas', name: 'Corazón de Brasas', shape: 'corazon', rarity: 'rara',
    lore: 'Late con fuego. Quien lo lleva nunca tiene frío, y rara vez tiene paciencia.',
    effectText: '+25% daño de Fuego, +5% Vida.',
    affinity: ['draconido', 'mago'], stats: { vida: 0.05 }, schoolBoost: { fuego: 0.25 } }),
  cetro_espinas: R({ id: 'cetro_espinas', name: 'Cetro de Espinas', shape: 'cetro', rarity: 'rara',
    lore: 'Florece cuando alguien sufre cerca. Tiene muchas flores.',
    effectText: '+20% daño de Veneno, +15% de Naturaleza.',
    affinity: ['bruja', 'elfo'], schoolBoost: { veneno: 0.2, naturaleza: 0.15 } }),
  mascara_bufon: R({ id: 'mascara_bufon', name: 'Máscara del Bufón Triste', shape: 'mascara', rarity: 'rara',
    lore: 'Sonríe por fuera. Por dentro, está llorando. Quien la usa dice cosas que la gente cree.',
    effectText: '+20% daño de Mente, +10% Presencia, +3% suerte en el casino.',
    affinity: ['humano', 'picaro'], stats: { presencia: 0.1 }, schoolBoost: { mente: 0.2 }, passives: { casino_luck: 0.03 } }),
  cuerno_grub: R({ id: 'cuerno_grub', name: 'Cuerno de Grub', shape: 'cuerno', rarity: 'rara',
    lore: 'Grub dice que se lo arrancó a una montaña. La montaña no lo ha desmentido.',
    effectText: '+10% Fuerza, +20% Miedo, +10% empuje.',
    affinity: ['ogro'], stats: { fuerza: 0.1 }, passives: { fear_mult: 0.2, knockback_mult: 0.1 } }),
  perla_negra: R({ id: 'perla_negra', name: 'Perla Negra de las Sirenas', shape: 'gema', rarity: 'rara',
    lore: 'Las sirenas lloran perlas blancas. Esta es de una que lloró de rabia.',
    effectText: '+25% daño de Agua, +10% de Mente, +5% mejores precios.',
    affinity: ['sirena'], schoolBoost: { agua: 0.25, mente: 0.1 }, passives: { trade_mult: 0.05 } }),
  yunque_bolsillo: R({ id: 'yunque_bolsillo', name: 'Yunque de Bolsillo', shape: 'martillo', rarity: 'rara',
    lore: 'Un yunque enano del tamaño de un puño. Pesa como uno de verdad. Los enanos lo consideran ligero.',
    effectText: '+15% Armadura, −10% mantenimiento del ejército.',
    affinity: ['enano'], stats: { armadura: 0.15 }, passives: { upkeep_mult: -0.1 } }),
  baston_raiz: R({ id: 'baston_raiz', name: 'Bastón de Raíz Viva', shape: 'baston', rarity: 'rara',
    lore: 'Le brotan hojas en primavera, aunque nadie sepa cuándo es primavera.',
    effectText: '+25% curación, +15% Naturaleza, +10% Luz.',
    affinity: ['elfo', 'clerigo'], schoolBoost: { naturaleza: 0.15, luz: 0.1 }, passives: { heal_mult: 0.25 } }),

  // ═══════════════════ POCO COMUNES
  guantes_ladron: R({ id: 'guantes_ladron', name: 'Guantes del Ladrón Zurdo', shape: 'guantelete', rarity: 'pococomun',
    lore: 'El derecho está intacto. El zurdo, gastado de tanto trabajar.',
    effectText: '+25% oro robado, +10% sigilo.',
    affinity: ['picaro'], stats: { velocidad: 0.05 }, passives: { steal_mult: 0.25, stealth: 0.1 } }),
  ojo_gato: R({ id: 'ojo_gato', name: 'Ojo de Gato Tallado', shape: 'gema', rarity: 'pococomun',
    lore: 'Una gema con una pupila que se cierra a la luz. Ve bien en la oscuridad; sobre todo, ve puntos débiles.',
    effectText: '+5% crítico, +5% Suerte.',
    affinity: 'any', stats: { suerte: 0.05 }, passives: { crit_chance: 0.05 } }),
  capa_ceniza: R({ id: 'capa_ceniza', name: 'Capa de Ceniza', shape: 'capa', rarity: 'pococomun',
    lore: 'Tejida con el humo de los Callejones. Huele a secretos quemados.',
    effectText: '−10% Alerta, +10% sigilo.',
    affinity: ['picaro', 'humano'], passives: { alert_mult: -0.1, stealth: 0.1 } }),
  pluma_cuervo: R({ id: 'pluma_cuervo', name: 'Pluma de Cuervo Mensajero', shape: 'pluma', rarity: 'pococomun',
    lore: 'El cuervo que la perdió sigue entregando cartas. Ahora escribe él mismo algunas.',
    effectText: '+20% Secretos, +5% Influencia.',
    affinity: 'any', passives: { secret_gain: 0.2, influence_gain: 0.05 } }),
  herradura_duende: R({ id: 'herradura_duende', name: 'Herradura de Duende', shape: 'amuleto', rarity: 'pococomun',
    lore: 'Los duendes no tienen caballos. Nadie sabe de dónde sacan las herraduras. Nadie pregunta.',
    effectText: '+5% oro, +4% suerte en el casino, +8% Suerte.',
    affinity: ['duende'], stats: { suerte: 0.08 }, passives: { gold_mult: 0.05, casino_luck: 0.04 } }),
  llave_maestra: R({ id: 'llave_maestra', name: 'Llave de Todas las Puertas Menores', shape: 'llave', rarity: 'pococomun',
    lore: 'Abre cualquier puerta pequeña. Las grandes se ofenden.',
    effectText: '+15% sigilo, botín ligeramente mejor.',
    affinity: 'any', passives: { stealth: 0.15, loot_luck: 0.05 } }),
  frasco_sanguijuelas: R({ id: 'frasco_sanguijuelas', name: 'Frasco de Sanguijuelas de la Ciénaga', shape: 'botella', rarity: 'pococomun',
    lore: 'Los troles juran que son medicinales. Las sanguijuelas juran lo mismo.',
    effectText: '+8% Vida, regeneras 0,5 PV/s en batalla.',
    affinity: ['trol', 'bruja'], stats: { vida: 0.08 }, passives: { hp_regen: 0.5 } }),

  // ═══════════════════ COMUNES
  anillo_cobre: R({ id: 'anillo_cobre', name: 'Anillo de Cobre Torcido', shape: 'anillo', rarity: 'comun',
    lore: 'Alguien lo mordió para comprobar que no era oro. No era oro.',
    effectText: '+5% Magia.', affinity: 'any', stats: { magia: 0.05 } }),
  diente_lobo: R({ id: 'diente_lobo', name: 'Diente de Lobo en un Cordel', shape: 'amuleto', rarity: 'comun',
    lore: 'Un campesino del Vado juraba que era de un lobo que mató. El lobo opina distinto.',
    effectText: '+5% Velocidad.', affinity: 'any', stats: { velocidad: 0.05 } }),
  moneda_agujereada: R({ id: 'moneda_agujereada', name: 'Moneda Agujereada', shape: 'moneda', rarity: 'comun',
    lore: 'Suerte de pobre: ya le hicieron un agujero, así que no le pueden hacer otro.',
    effectText: '+5% Suerte, +2% suerte en el casino.', affinity: 'any', stats: { suerte: 0.05 }, passives: { casino_luck: 0.02 } }),
  botella_niebla: R({ id: 'botella_niebla', name: 'Botella con Niebla de Morvenna', shape: 'botella', rarity: 'comun',
    lore: 'Si la abres, sale un poco de noche. Ciérrala rápido.',
    effectText: '+8% Maná.', affinity: 'any', stats: { mana: 0.08 } }),
  vela_negra: R({ id: 'vela_negra', name: 'Cabo de Vela Negra', shape: 'farol', rarity: 'comun',
    lore: 'Se enciende sola cuando alguien muere cerca. Casi siempre está encendida.',
    effectText: '+5% Esencia.', affinity: 'any', passives: { essence_mult: 0.05 } }),
  cuerno_pastor: R({ id: 'cuerno_pastor', name: 'Cuerno de Pastor', shape: 'cuerno', rarity: 'comun',
    lore: 'Llama a las ovejas. En tus manos, llama a otra cosa.',
    effectText: '+5% moral del ejército.', affinity: 'any', passives: { army_morale: 0.05 } }),
  escama_suelta: R({ id: 'escama_suelta', name: 'Escama Suelta de Dracónido', shape: 'escama', rarity: 'comun',
    lore: 'Tibia al tacto. Siempre.',
    effectText: '+5% Armadura, +5% daño de Fuego.', affinity: 'any', stats: { armadura: 0.05 }, schoolBoost: { fuego: 0.05 } }),
  carta_ajena: R({ id: 'carta_ajena', name: 'Carta de Amor Ajena', shape: 'carta', rarity: 'comun',
    lore: 'Nunca llegó a su destinataria. Tú la leíste. Ahora sabes algo que no deberías.',
    effectText: '+10% Secretos.', affinity: 'any', passives: { secret_gain: 0.1 } }),
};

/** Spanish labels for passive keys (tooltips). `pct` → shown as percentage; otherwise as a number. */
export const PASSIVE_INFO: Record<string, { name: string; pct: boolean; good?: 'low' }> = {
  gold_mult: { name: 'Oro', pct: true }, trade_mult: { name: 'Precios', pct: true }, interest: { name: 'Interés por luna', pct: true },
  casino_luck: { name: 'Suerte en el casino', pct: true }, reroll: { name: 'Re-tiradas por juego', pct: false },
  reveal_relics: { name: 'Revela reliquias', pct: false }, reveal_weakness: { name: 'Revela debilidades', pct: false },
  reveal_invisible: { name: 'Ve lo invisible', pct: false }, alert_mult: { name: 'Alerta', pct: true, good: 'low' },
  stealth: { name: 'Sigilo', pct: true }, disguise: { name: 'Disfraz', pct: false }, recruit_discount: { name: 'Descuento al reclutar', pct: true },
  upkeep_mult: { name: 'Mantenimiento', pct: true, good: 'low' }, army_morale: { name: 'Moral del ejército', pct: true },
  army_damage: { name: 'Daño del ejército', pct: true }, army_speed: { name: 'Velocidad del ejército', pct: true },
  fear_mult: { name: 'Miedo', pct: true }, influence_gain: { name: 'Influencia', pct: true }, secret_gain: { name: 'Secretos', pct: true },
  steal_mult: { name: 'Oro robado', pct: true }, dominate_cost: { name: 'Coste de dominar líderes', pct: true, good: 'low' },
  mana_regen: { name: 'Regeneración de maná', pct: true }, mana_cost: { name: 'Coste de maná', pct: true, good: 'low' },
  cooldown_mult: { name: 'Enfriamientos', pct: true, good: 'low' }, hp_regen: { name: 'PV por segundo', pct: false },
  heal_mult: { name: 'Curación', pct: true }, lifesteal: { name: 'Robo de vida', pct: true }, crit_chance: { name: 'Crítico', pct: true },
  crit_mult: { name: 'Daño crítico', pct: true }, armor_pierce: { name: 'Atraviesa armadura', pct: false },
  knockback_mult: { name: 'Empuje', pct: true }, range_mult: { name: 'Alcance', pct: true }, move_speed: { name: 'Velocidad', pct: true },
  reflect: { name: 'Reflejo de hechizos', pct: true }, time_slow: { name: 'Ralentiza enemigos', pct: true },
  traicion_chance: { name: 'Traición', pct: true }, retorno_extra: { name: 'Cargas de Retorno', pct: false },
  essence_mult: { name: 'Esencia', pct: true }, loot_luck: { name: 'Suerte en el botín', pct: true },
  comprehension_bonus: { name: 'Comprensión extra', pct: true }, resist_all: { name: 'Resistencia a todo', pct: true },
  equip_cap: { name: 'Espacios de reliquia', pct: false }, free_rewrite: { name: 'Reescrituras gratis', pct: false },
};

/** Relics that the world may place at random each cycle (not major, no fixed location). */
export function placeableRelics(cycle = 1): RelicDef[] {
  return Object.values(RELICS).filter((r) => !r.major && !r.location && (!r.minCycle || cycle >= r.minCycle));
}

/** Essence given when a duplicate (non-unique) relic is salvaged. */
export const DUPLICATE_ESSENCE: Record<RelicDef['rarity'], number> = { comun: 10, pococomun: 20, rara: 40, epica: 80, legendaria: 160, mitica: 320 };
