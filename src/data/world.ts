/**
 * World geography: the five continents + Concordia, and every location.
 * Coordinates are overworld units (≈ meters on the diorama map). +x = east, +z = south.
 * See docs/GDD.md §3.3.
 */
import type { ContinentDef, ContinentId, GuildDef, GuildId, LocationDef } from './types';

export const CONTINENTS: Record<ContinentId, ContinentDef> = {
  valdoria: {
    id: 'valdoria', name: 'Valdoria', epithet: 'La Corona',
    desc: 'Llanuras doradas, castillos y catedrales. Los humanos gobiernan con acero y papel sellado.',
    races: ['humano', 'caballero', 'picaro', 'clerigo'], ruler: 'isolde_varn', delegate: 'galvan',
    guilds: ['juramentados', 'ceniza', 'sedas'],
    goods: { produces: ['grano', 'hierro'], consumes: ['especias', 'seda', 'pociones'] },
    pathMult: { conquista: 1.0, intriga: 1.5, codicia: 1.0, terror: 0.6 },
    palette: { ground: '#c9b45a', ground2: '#7fa04a', accent: '#c0392b', water: '#3a78b8', fog: '#e8dcb0' },
    biome: 'llanura', center: { x: -62, z: 8 }, radius: 32,
  },
  sylvaria: {
    id: 'sylvaria', name: 'Sylvaria', epithet: 'El Bosque que Recuerda',
    desc: 'Árboles colosales, luz dorada entre las hojas y templos del alba. Los elfos no olvidan nada.',
    races: ['elfo', 'clerigo', 'duende'], ruler: 'elowen', delegate: 'thalion',
    guilds: ['orden_alba'],
    goods: { produces: ['madera', 'cristal', 'pociones'], consumes: ['hierro', 'grano'] },
    pathMult: { conquista: 0.8, intriga: 1.0, codicia: 0.5, terror: 1.6 },
    palette: { ground: '#4f8a3a', ground2: '#2f6a3a', accent: '#ffd36b', water: '#3a9a9a', fog: '#c8e8b0' },
    biome: 'bosque', center: { x: -30, z: -58 }, radius: 30,
  },
  kharaz: {
    id: 'kharaz', name: 'Kharaz', epithet: 'La Montaña Hueca',
    desc: 'Montañas, forjas y ríos de lava. Enanos, gigantes y ogros; aquí solo se respeta el oro y el martillo.',
    races: ['enano', 'gigante', 'ogro'], ruler: 'thrain', delegate: 'ymra',
    guilds: ['yunque'],
    goods: { produces: ['hierro', 'gemas'], consumes: ['grano', 'madera', 'especias'] },
    pathMult: { conquista: 1.5, intriga: 0.6, codicia: 1.2, terror: 0.8 },
    palette: { ground: '#7a6a5a', ground2: '#4a3f38', accent: '#ff6a2a', water: '#2a4a6a', fog: '#b0a090' },
    biome: 'montana', center: { x: 40, z: -56 }, radius: 32,
  },
  morvenna: {
    id: 'morvenna', name: 'Morvenna', epithet: 'Las Tierras del Crepúsculo',
    desc: 'Pantanos, torres torcidas y lunas enormes. Brujas, magos y troles; la Academia de Altamira vigila los libros prohibidos.',
    races: ['bruja', 'mago', 'trol'], ruler: 'morgaine', delegate: 'cassius',
    guilds: ['aquelarre', 'academia'],
    goods: { produces: ['pociones', 'cristal'], consumes: ['seda', 'gemas', 'madera'] },
    pathMult: { conquista: 0.6, intriga: 1.4, codicia: 1.0, terror: 1.1 },
    palette: { ground: '#4a4a6a', ground2: '#3a5a4a', accent: '#b48cff', water: '#2a3a4a', fog: '#6a5a8a' },
    biome: 'pantano', center: { x: 68, z: 20 }, radius: 30,
  },
  islas: {
    id: 'islas', name: 'Islas de Azar', epithet: 'Donde Todo Tiene Precio',
    desc: 'Un archipiélago de faroles, puertos y casinos flotantes. Los duendes de la Banca prestan, cobran y nunca pierden.',
    races: ['duende', 'picaro', 'humano', 'sirena'], ruler: 'tiburcio', delegate: 'fortuna',
    guilds: ['banca', 'ceniza', 'sedas'],
    goods: { produces: ['especias', 'seda'], consumes: ['hierro', 'grano', 'gemas'] },
    pathMult: { conquista: 0.8, intriga: 0.7, codicia: 1.7, terror: 1.0 },
    palette: { ground: '#e8d49a', ground2: '#5ab06a', accent: '#ff4fa3', water: '#2ab0c8', fog: '#bfeff0' },
    biome: 'tropical', center: { x: 8, z: 64 }, radius: 32,
  },
  concordia: {
    id: 'concordia', name: 'Concordia', epithet: 'La Mesa de los Cinco',
    desc: 'Isla blanca y neutral en el centro del mundo. Sede del Concilio de los Cinco Continentes.',
    races: ['humano', 'clerigo', 'elfo', 'enano', 'duende'], ruler: 'ione', delegate: 'ione',
    guilds: [],
    goods: { produces: [], consumes: ['grano', 'seda', 'especias'] },
    pathMult: { conquista: 1, intriga: 1, codicia: 1, terror: 1 },
    palette: { ground: '#e8e2d0', ground2: '#b8c8a0', accent: '#d9b36c', water: '#3a88c8', fog: '#f0f0ff' },
    biome: 'marmol', center: { x: 2, z: 2 }, radius: 9,
  },
};

export const CONTINENT_IDS: ContinentId[] = ['valdoria', 'sylvaria', 'kharaz', 'morvenna', 'islas'];

const L = (d: LocationDef) => d;

export const LOCATION_LIST: LocationDef[] = [
  // ── VALDORIA
  L({ id: 'corona_varn', name: 'Corona de Varn', continent: 'valdoria', kind: 'capital', pos: { x: -68, z: 2 },
    desc: 'Ciudad-castillo de murallas blancas. Aquí la Reina Isolde firma sentencias con tinta dorada.',
    races: { humano: 5, caballero: 3, clerigo: 1, picaro: 1 }, garrison: 90, prosperity: 75,
    produces: ['hierro'], consumes: ['especias', 'seda'], services: ['mercado', 'reclutar', 'taberna', 'templo', 'sedas'],
    npcs: ['isolde_varn', 'anselmo'] }),
  L({ id: 'vado_trigo', name: 'Vado del Trigo', continent: 'valdoria', kind: 'aldea', pos: { x: -50, z: 20 },
    desc: 'Molinos, trigo hasta el horizonte y gente que nunca ha visto magia de verdad.',
    races: { humano: 8, picaro: 1 }, garrison: 12, prosperity: 45,
    produces: ['grano'], consumes: ['pociones'], services: ['mercado', 'reclutar', 'taberna'], npcs: ['berta_molinera'] }),
  L({ id: 'crater', name: 'El Cráter', continent: 'valdoria', kind: 'santuario', pos: { x: -43, z: 27 },
    desc: 'El hoyo que dejó Elias al caer. La tierra todavía está tibia.',
    races: {}, garrison: 0, prosperity: 0, services: ['santuario'], special: 'crater' }),
  L({ id: 'fortaleza_juramento', name: 'Fortaleza Juramento', continent: 'valdoria', kind: 'fortaleza', pos: { x: -80, z: -14 },
    desc: 'Bastión de Los Juramentados. Cada piedra fue puesta con una promesa.',
    races: { caballero: 6, humano: 3, clerigo: 1 }, garrison: 120, prosperity: 50,
    services: ['reclutar', 'forja'], npcs: ['galvan'] }),
  L({ id: 'callejones_ceniza', name: 'Callejones de Ceniza', continent: 'valdoria', kind: 'ciudad', pos: { x: -73, z: 24 },
    desc: 'Barrio de humo y candados rotos. El Gremio de la Ceniza compra lo que robaste; la Casa de las Sedas compra lo que sabes.',
    races: { picaro: 5, humano: 4, duende: 1 }, garrison: 25, prosperity: 55,
    produces: ['seda'], consumes: ['pociones'], services: ['mercado', 'taberna', 'sedas', 'reclutar'], npcs: ['mirelle', 'tobias'] }),
  L({ id: 'mausoleo_alba', name: 'Mausoleo del Alba', continent: 'valdoria', kind: 'ruina', pos: { x: -56, z: -12 },
    desc: 'Tumba ceremonial construida para el Héroe "cuando llegue su hora". Está vacía. Por ahora.',
    races: {}, garrison: 40, prosperity: 0, services: ['ruina'], relic: 'corona_vacia' }),

  // ── SYLVARIA
  L({ id: 'lumen', name: 'Lúmen', continent: 'sylvaria', kind: 'capital', pos: { x: -34, z: -64 },
    desc: 'Una ciudad tallada dentro de un árbol más viejo que las lunas.',
    races: { elfo: 7, clerigo: 2, duende: 1 }, garrison: 85, prosperity: 80,
    produces: ['madera', 'cristal'], consumes: ['hierro'], services: ['mercado', 'reclutar', 'templo', 'taberna'], npcs: ['elowen', 'thalion'] }),
  L({ id: 'templo_alba', name: 'Templo del Alba', continent: 'sylvaria', kind: 'templo', pos: { x: -18, z: -75 },
    desc: 'Donde amanece primero. En su altar descansa Aurora, la Daga Solar.',
    races: { clerigo: 6, elfo: 4 }, garrison: 70, prosperity: 40, services: ['templo', 'ruina'], relic: 'daga_solar' }),
  L({ id: 'claro_luciernagas', name: 'Claro de las Luciérnagas', continent: 'sylvaria', kind: 'aldea', pos: { x: -45, z: -47 },
    desc: 'Aldea de cazadores y herboristas bajo miles de luces diminutas.',
    races: { elfo: 5, duende: 3, humano: 2 }, garrison: 15, prosperity: 50,
    produces: ['pociones'], consumes: ['grano'], services: ['mercado', 'reclutar', 'taberna'], npcs: ['liria'] }),
  L({ id: 'aldea_colmenas', name: 'Las Colmenas', continent: 'sylvaria', kind: 'especial', pos: { x: -19, z: -45 },
    desc: 'Torres-hogar comunitarias junto al bosque de la bruma. Nadie aquí sabe en qué año nació.',
    races: { humano: 8, elfo: 2 }, garrison: 8, prosperity: 55,
    produces: ['grano'], consumes: ['pociones'], services: ['mercado', 'taberna'], npcs: ['mara_colmenas', 'tomas_colmenas'], special: 'colmenas', relic: 'collar_bruma' }),
  L({ id: 'raiz_profunda', name: 'Raíz Profunda', continent: 'sylvaria', kind: 'ruina', pos: { x: -47, z: -73 },
    desc: 'Donde las raíces del Primer Árbol bajan hasta algo que respira.',
    races: {}, garrison: 45, prosperity: 0, services: ['ruina'] }),

  // ── KHARAZ
  L({ id: 'kharaz_dum', name: 'Kharaz-Dûm', continent: 'kharaz', kind: 'capital', pos: { x: 44, z: -63 },
    desc: 'La ciudad bajo la montaña. Mil forjas encendidas y un rey que cuenta cada moneda dos veces.',
    races: { enano: 7, gigante: 2, ogro: 1 }, garrison: 110, prosperity: 80,
    produces: ['hierro', 'gemas'], consumes: ['grano', 'madera'], services: ['mercado', 'reclutar', 'taberna', 'forja'], npcs: ['thrain', 'hilda'] }),
  L({ id: 'forja_primigenia', name: 'La Forja Primigenia', continent: 'kharaz', kind: 'especial', pos: { x: 59, z: -72 },
    desc: 'El primer fuego del mundo. Aquí se reforjan las reliquias... y se funden las que no deberían tocarse.',
    races: { enano: 6, gigante: 2 }, garrison: 60, prosperity: 60, services: ['forja'], special: 'forja' }),
  L({ id: 'mina_luna', name: 'Mina de la Luna Caída', continent: 'kharaz', kind: 'ruina', pos: { x: 27, z: -73 },
    desc: 'Los enanos cavaron hasta un pedazo de luna. Lo que encontraron dentro todavía brilla: Nocturna, la Daga Lunar.',
    races: {}, garrison: 60, prosperity: 0, services: ['ruina'], relic: 'daga_lunar' }),
  L({ id: 'tragapiedras', name: 'Campamento Tragapiedras', continent: 'kharaz', kind: 'aldea', pos: { x: 25, z: -44 },
    desc: 'Los ogros de Grub comen piedras, pelean por diversión y respetan a quien los lanza más lejos.',
    races: { ogro: 8, gigante: 1, duende: 1 }, garrison: 40, prosperity: 30,
    produces: ['hierro'], consumes: ['grano'], services: ['reclutar', 'taberna', 'mercado'], npcs: ['grub'] }),
  L({ id: 'escalon_gigantes', name: 'Escalón de los Gigantes', continent: 'kharaz', kind: 'fortaleza', pos: { x: 61, z: -45 },
    desc: 'Una escalera de piedra hecha para piernas de doce metros.',
    races: { gigante: 6, enano: 3 }, garrison: 130, prosperity: 40, services: ['reclutar'], npcs: ['ymra'] }),

  // ── MORVENNA
  L({ id: 'altamira', name: 'Altamira', continent: 'morvenna', kind: 'capital', pos: { x: 72, z: 14 },
    desc: 'La Academia de Altamira: torres que cambian de lugar, escaleras que discuten, y una Biblioteca Prohibida.',
    races: { mago: 6, bruja: 2, humano: 2 }, garrison: 90, prosperity: 75,
    produces: ['cristal'], consumes: ['seda', 'gemas'], services: ['mercado', 'reclutar', 'academia', 'taberna'], npcs: ['cassius', 'nimue'], relic: 'libro_aprendizaje' }),
  L({ id: 'pozo_luna', name: 'El Pozo de la Luna', continent: 'morvenna', kind: 'ruina', pos: { x: 85, z: 31 },
    desc: 'Un pozo que refleja una luna que no está en el cielo.',
    races: {}, garrison: 50, prosperity: 0, services: ['ruina'] }),
  L({ id: 'aquelarre', name: 'El Aquelarre', continent: 'morvenna', kind: 'aldea', pos: { x: 57, z: 33 },
    desc: 'Chozas sobre patas de pollo, calderos humeantes y brujas que leen el futuro en la sopa.',
    races: { bruja: 7, trol: 2, humano: 1 }, garrison: 35, prosperity: 45,
    produces: ['pociones'], consumes: ['gemas'], services: ['mercado', 'reclutar', 'taberna'], npcs: ['morgaine'] }),
  L({ id: 'cienaga_trol', name: 'Ciénaga Trol', continent: 'morvenna', kind: 'aldea', pos: { x: 81, z: 2 },
    desc: 'Los troles de Jabu esperan. Son muy buenos esperando.',
    races: { trol: 8, bruja: 1, duende: 1 }, garrison: 45, prosperity: 30,
    produces: ['pociones'], consumes: ['grano'], services: ['reclutar', 'mercado', 'taberna'], npcs: ['jabu'] }),
  L({ id: 'torre_invertida', name: 'La Torre Invertida', continent: 'morvenna', kind: 'fortaleza', pos: { x: 61, z: 4 },
    desc: 'Una torre que crece hacia abajo. Los guardias suben para bajar.',
    races: { mago: 5, trol: 3, bruja: 2 }, garrison: 100, prosperity: 35, services: ['reclutar', 'ruina'] }),

  // ── ISLAS DE AZAR
  L({ id: 'puerto_fortuna', name: 'Puerto Fortuna', continent: 'islas', kind: 'casino', pos: { x: 6, z: 60 },
    desc: 'Faroles, música, barcos de todas partes y El Gran Casino "La Banca de las Mil Suertes".',
    races: { duende: 5, humano: 3, picaro: 2, sirena: 1 }, garrison: 70, prosperity: 90,
    produces: ['especias', 'seda'], consumes: ['hierro', 'gemas'], services: ['mercado', 'reclutar', 'taberna', 'casino', 'banca', 'sedas', 'puerto'], npcs: ['tiburcio', 'fortuna'] }),
  L({ id: 'arena_remolino', name: 'Arena del Remolino', continent: 'islas', kind: 'arena', pos: { x: 23, z: 70 },
    desc: 'Un coliseo sobre un remolino. Aquí se apuesta a quién sale volando más lejos.',
    races: { duende: 4, ogro: 2, humano: 2, picaro: 2 }, garrison: 40, prosperity: 70, services: ['arena', 'taberna', 'reclutar'] }),
  L({ id: 'cala_contrabandistas', name: 'Cala de los Contrabandistas', continent: 'islas', kind: 'puerto', pos: { x: -14, z: 68 },
    desc: 'Ron, secretos y barcos sin bandera. La Capitana Rhea Sal no pregunta nada que no quiera saber.',
    races: { picaro: 5, humano: 3, duende: 2 }, garrison: 30, prosperity: 60,
    produces: ['especias'], consumes: ['hierro'], services: ['mercado', 'taberna', 'reclutar', 'puerto'], npcs: ['rhea'] }),
  L({ id: 'faro_sirenas', name: 'Faro de las Sirenas', continent: 'islas', kind: 'aldea', pos: { x: -4, z: 83 },
    desc: 'La luz del faro canta. Los marineros dicen que es la sirena Coralina.',
    races: { sirena: 5, humano: 4, duende: 1 }, garrison: 20, prosperity: 45,
    produces: ['seda'], consumes: ['grano'], services: ['mercado', 'taberna', 'reclutar'], npcs: ['coralina'] }),
  L({ id: 'boveda_tiburcio', name: 'La Bóveda de Tiburcio', continent: 'islas', kind: 'especial', pos: { x: 27, z: 84 },
    desc: 'Una isla que es una caja fuerte. Adentro, el premio mayor de todos los premios mayores: el Libro de la Realidad.',
    races: { duende: 8, ogro: 2 }, garrison: 150, prosperity: 100, services: ['banca'], special: 'boveda', relic: 'libro_realidad' }),

  // ── CONCORDIA
  L({ id: 'concordia', name: 'Concordia', continent: 'concordia', kind: 'concilio', pos: { x: 2, z: 2 },
    desc: 'La ciudad blanca. Cinco torres, una mesa redonda, y la paz más frágil del mundo.',
    races: { humano: 4, clerigo: 2, elfo: 1, enano: 1, duende: 1 }, garrison: 140, prosperity: 85,
    consumes: ['grano', 'seda'], services: ['concilio', 'mercado', 'taberna', 'templo'], npcs: ['ione', 'aurel'] }),
];

export const LOCATIONS: Record<string, LocationDef> = Object.fromEntries(LOCATION_LIST.map((l) => [l.id, l]));

export function locationsOf(c: ContinentId): LocationDef[] {
  return LOCATION_LIST.filter((l) => l.continent === c);
}

export const GUILDS: Record<GuildId, GuildDef> = {
  juramentados: { id: 'juramentados', name: 'Los Juramentados', desc: 'Orden de caballeros. Mercenarios pesados que odian el terror.', races: ['caballero', 'humano'], base: 'fortaleza_juramento', services: ['mercenarios'], color: '#c0392b' },
  orden_alba: { id: 'orden_alba', name: 'La Orden del Alba', desc: 'Clérigos de la luz. Curan, bendicen... y te odian por naturaleza.', races: ['clerigo', 'elfo', 'humano'], base: 'templo_alba', services: ['curacion', 'quitar_maldicion'], color: '#ffd36b' },
  banca: { id: 'banca', name: 'La Banca de las Mil Suertes', desc: 'Duendes banqueros. Préstamos, inversiones, apuestas.', races: ['duende'], base: 'puerto_fortuna', services: ['prestamos', 'inversiones', 'casino'], color: '#3ab06a' },
  aquelarre: { id: 'aquelarre', name: 'El Aquelarre', desc: 'Brujas. Maldiciones, pociones y el futuro en la sopa.', races: ['bruja', 'trol'], base: 'aquelarre', services: ['maldiciones', 'pociones', 'profecias'], color: '#8a3ab0' },
  academia: { id: 'academia', name: 'La Academia de Altamira', desc: 'Magos eruditos. Enseñan y perfeccionan habilidades.', races: ['mago', 'humano', 'elfo'], base: 'altamira', services: ['ensenar', 'fusion'], color: '#4a6ad0' },
  sedas: { id: 'sedas', name: 'La Casa de las Sedas', desc: 'Cortesanas y espías. Venden secretos, nunca el cuerpo de nadie: el conocimiento es la única moneda que no se devalúa.', races: ['humano', 'elfo', 'sirena', 'picaro'], base: 'callejones_ceniza', services: ['secretos', 'debilidades', 'rumores'], color: '#c0407a' },
  ceniza: { id: 'ceniza', name: 'El Gremio de la Ceniza', desc: 'Pícaros y ladrones. Contratos, botín robado, asesinatos discretos.', races: ['picaro', 'humano', 'duende'], base: 'callejones_ceniza', services: ['contratos', 'perista', 'asesinatos'], color: '#6a6a7a' },
  yunque: { id: 'yunque', name: 'El Yunque', desc: 'Liga de herreros y mineros. Forjan y mejoran reliquias.', races: ['enano', 'gigante'], base: 'kharaz_dum', services: ['forjar', 'mejorar_reliquias'], color: '#ff6a2a' },
};
