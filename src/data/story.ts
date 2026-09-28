/**
 * La Excepción — story text library (story agent).
 *
 * Every piece of narrative text lives here so the author can edit the voice without touching code.
 * Book rules (GDD §1): no dates, no years, no "Capítulo N" (Fragments have words), the line
 * "Siempre estuve viéndote." is exact, and the narrator drifts from third person to first.
 *
 * Narrator lines: `third` (default), `first` (Elias narrating himself — cycle 2+ slips, always after the ending),
 * `direct` (the voice talking to the player — cycle 3+). Tokens: {name} (current short name, handled by ui/narrator),
 * and the story engine fills {n} {gold} {hora} {habilidad} {reliquia} {continente} {capitan} {lugar}.
 */
import type { NarratorLine } from './types';

/** The line. Never paraphrase it. */
export const SIEMPRE = 'Siempre estuve viéndote.';

export type FragmentId = 'antes' | 'nombre' | 'regla' | 'sobrevivio' | 'el';

export const FRAGMENTS: Record<FragmentId, { title: string; subtitle?: string }> = {
  antes: { title: 'Antes' },
  nombre: { title: 'Cuando aún tenía nombre', subtitle: 'Muchos años después. O antes. Nadie contaba ya.' },
  regla: { title: 'La regla', subtitle: 'Todo poder que lo tocaba dejaba de tener poder sobre él.' },
  sobrevivio: { title: 'Lo que sobrevivió', subtitle: 'Cinco continentes. Una isla blanca. Un héroe cansado.' },
  el: { title: 'Él' },
};

// ───────────────────────────── The five powers (Aurel's kit) ─────────────────────────────

export interface PowerInfo { id: string; name: string; color: string; glyph: 'mind' | 'veil' | 'fist' | 'relic' | 'return' | 'dawn'; short: string }

export const HERO_POWERS: PowerInfo[] = [
  { id: 'fuerza_titanica', name: 'Fuerza Titánica', color: '#ff7a3a', glyph: 'fist', short: 'Un puñetazo que manda a volar.' },
  { id: 'velo', name: 'Velo', color: '#8f7cff', glyph: 'veil', short: 'Desaparecer. Aparecer detrás.' },
  { id: 'dominar_mente', name: 'Dominar Mente', color: '#ff7bf0', glyph: 'mind', short: 'Tu cuerpo deja de obedecerte.' },
  { id: 'afinidad_reliquias', name: 'Afinidad de Reliquias', color: '#e6cc80', glyph: 'relic', short: 'Toda reliquia da todo su poder.' },
  { id: 'retorno', name: 'Retorno', color: '#9dffb8', glyph: 'return', short: 'Morir, y volver.' },
];

/** Order of the cut-ins at the resurrection (GDD §2.3). */
export const REVIVE_ORDER = ['dominar_mente', 'velo', 'fuerza_titanica', 'afinidad_reliquias', 'retorno'];

export const EL_ALBA: PowerInfo = { id: 'el_alba', name: 'El Alba', color: '#ffe7a0', glyph: 'dawn', short: 'La luz de su mano.' };

export function powerInfo(id: string): PowerInfo | undefined {
  return id === EL_ALBA.id ? EL_ALBA : HERO_POWERS.find((p) => p.id === id);
}

// ───────────────────────────── Prologue ("Antes") ─────────────────────────────

export const PROLOGUE = {
  epigraph: ['Hay reglas que sostienen al mundo.', 'Y hay cosas que existen para romperlas.'],
  boyName: 'El niño',
  motherName: 'Su madre',
  fatherName: 'Su padre',
  breakfast: [
    { who: 'boy', text: '¿En qué año naciste?' },
    { who: 'mother', text: 'No sé.' },
    { who: 'boy', text: '¿Cómo que no sabés?' },
    { who: 'mother', text: 'Hace mucho dejamos de contar.' },
    { who: 'boy', text: '¿Por qué?' },
    { who: 'mother', text: 'No recuerdo.' },
  ] as Array<{ who: 'boy' | 'mother' | 'father'; text: string }>,
  breakfastAfter: 'Y siguieron desayunando.',
  walkHint: 'WASD para caminar',
  sitHint: 'Sentarse',
  dawnLine: { third: 'Le gustaba ver amanecer. A Bruma también.' } as NarratorLine,
  clickPrompt: 'Clic',
  run: 'Corre.',
  runHint: 'Mantén Shift para correr',
  parents: [
    { who: 'boy', text: 'Había una sombra en la niebla. Se hizo de noche, y de mi mano... salió luz.' },
    { who: 'narr', text: 'Sus padres se miraron. No parecían sorprendidos.' },
    { who: 'mother', text: 'Tus poderes están despertando.' },
    { who: 'father', text: 'Siéntate. Tenemos mucho que explicarte.' },
  ] as Array<{ who: 'boy' | 'mother' | 'father' | 'narr'; text: string }>,
  skipSnark: 'Ya sabes cómo termina. ¿O no?',
  holdToSkip: 'Mantén Espacio para saltar',
};

// ───────────────────────────── The Concordia duel ─────────────────────────────

export const DUEL = {
  opening: { third: 'Elias Veyr eligió el peor día para presentarse.', first: 'Elegí el peor día para presentarme.' } as NarratorLine,
  intro: 'Me llamo Elias Veyr. Este mundo me pertenece.',
  crowd: ['¡Ja, ja, ja!', '¿Y ese quién es?', '¡Un mago de feria!', '¡Que alguien le dé una moneda!', 'Jajaja', '¿Es parte del festejo?'],
  aurelCalm: 'Nadie tiene que salir herido.',
  eliasRetort: 'Qué casualidad. Eso mismo pensaba yo.',
  hints: {
    move: 'Muévete con WASD',
    aim: 'Apunta con el ratón · Clic izquierdo: Chispa Arcana',
    dodge: 'Espacio: Esquivar',
    understand: 'Cada poder que te golpea... lo empiezas a comprender.',
    inverted: '¡Tus controles están invertidos!',
    lucky: '¡Ahora! Está distraído.',
  },
  oneDamage: '1',
  aurel: {
    fuerza: 'Perdón.',
    velo: 'Aquí.',
    mente: 'Deja de pelear contra ti mismo.',
    afinidad: 'Esta espada es más vieja que tu nombre.',
    retorno: 'Buen golpe. De verdad.',
    final: 'Lo siento.',
    shorter: 'Otra vez tú. No sé por qué lo sé.',
  },
  comprehending: 'Comprendiendo…',
};

// ───────────────────────────── Ending ("Él") ─────────────────────────────

export const ENDING = {
  opening: [
    { third: 'Concordia ya no tenía torres. Tenía ceniza, y a un hombre de rodillas.', first: 'Concordia ya no tenía torres. Tenía ceniza, y a un hombre de rodillas.' },
    { third: 'Aurel se veía más viejo de lo que debía. Cerca de él, el tiempo se doblaba.', first: 'Aurel se veía más viejo de lo que debía. Cerca de mí, el tiempo se doblaba.' },
    { third: 'A su lado, Bruma miraba algo lindo que nadie más veía.', first: 'A su lado, Bruma miraba algo lindo que nadie más veía.' },
  ] as NarratorLine[],
  rewrite: ['Elias Veyr escribió la última regla.', 'Él escribió la última regla.', 'Escribí la última regla.'],
  rule: 'No existe el tiempo.',
  cost: 'Tu nombre.',
  allAtOnce: 'Todo ocurrió a la vez.',
  question: '¿Sabes cómo supe que lo había logrado, pequeño?',
  aurelSilence: '…',
  turn: ['Pero no estaba mirando al muchacho.', 'Tampoco había nada detrás de él.', 'Te estaba mirando a ti.'],
  afterthought: 'Aunque, pensándolo bien, tú ya lo viste.',
  back: 'Vuelve al principio.',
  talk: 'Hablar',
  sello: ['Lo encerraron en una página en blanco.', 'Las páginas en blanco también se leen.', 'Vuelve al principio.'],
};

/** "Te vi…" — the monologue built from tracked stats. The ending picks the 3–5 most notable. */
export const WATCHED = {
  deaths: (n: number) => (n === 1 ? 'Te vi morir una vez.' : `Te vi morir ${n} veces.`),
  noDeaths: 'No te vi morir ni una vez. Eso también lo anoté.',
  gambledNight: (g: string) => `Te vi apostar ${g} monedas en una sola noche.`,
  gambled: (g: string) => `Te vi apostar ${g} monedas.`,
  bigWin: (g: string) => `Te vi ganar ${g} monedas de un solo golpe. Y seguir jugando.`,
  bigLoss: (g: string) => `Te vi perder ${g} monedas y quedarte en la mesa.`,
  hesitated: 'Te vi dudar antes de entregar mi nombre.',
  noHesitation: 'Te vi entregar mi nombre sin dudar. Ni un poco.',
  minds: (n: number) => `Te vi entrar en ${n} ${n === 1 ? 'mente' : 'mentes'} sin tocar la puerta.`,
  unitsLost: (n: number) => `Te vi perder ${n} soldados. No te aprendiste sus nombres. Yo sí.`,
  spared: (n: number) => `Te vi perdonar a ${n}. Nunca supe si por piedad o por estrategia.`,
  executed: (n: number) => `Te vi ejecutar a ${n} sin decir una palabra.`,
  cheats: (n: number, caught: number) => (caught > 0 ? `Te vi hacer trampa ${n} veces. Te atraparon ${caught}.` : `Te vi hacer trampa ${n} veces. Nadie más lo notó.`),
  idle: (n: number) => (n === 1 ? 'Te vi irte. Y volver.' : `Te vi irte ${n} veces. Y volver.`),
  reloads: 'Te vi recargar a mitad de una batalla. Recargar no borra lo que vi.',
  sacrifices: (n: number) => `Te vi pagarle al Libro con ${n} ${n === 1 ? 'pedazo' : 'pedazos'} de ti.`,
  cycles: (n: number) => `Te vi volver al principio ${n} ${n === 1 ? 'vez' : 'veces'}.`,
  playtime: (t: string) => `Te vi quedarte ${t} conmigo.`,
  nemesis: (name: string) => `Te vi matar a ${name}. Él también te había visto a ti.`,
  killedBy: (name: string) => `Te vi caer ante ${name}. No se lo perdonaste.`,
};

/** Montage fragments (ending, "todos los momentos existen a la vez"). */
export const MONTAGE = {
  forest: 'El bosque, antes del amanecer.',
  death: 'Concordia. Un puñetazo. El cielo.',
  crater: 'Un cráter en un campo de trigo.',
  firstCopy: (a: string) => `La primera vez que algo fue tuyo: ${a}.`,
  nemesis: (n: string) => `${n}, cayendo.`,
  relic: (r: string) => `${r}, en tu mano.`,
  bet: (g: string) => `Una apuesta de ${g} monedas.`,
  revivals: (n: number) => `${n} ${n === 1 ? 'regreso' : 'regresos'}.`,
  name: 'Tu nombre, tachado.',
};

export const CREDITS: Array<{ big?: string; line?: string; small?: string; gap?: boolean }> = [
  { big: 'La Excepción' },
  { line: 'Basado en el libro de Rolando Osorio' },
  { gap: true },
  { small: 'Escrito para los amigos que lo leyeron primero.' },
  { gap: true },
  { small: 'Elias Veyr · Aurel · Bruma' },
  { small: 'Ione Salvaterra · Don Tiburcio Faroles · Madame Fortuna · Morgaine Tresojos' },
  { gap: true },
  { small: 'Un mundo que dejó de contar, hecho con Three.js y Tone.js.' },
  { small: 'Hecho en Guatemala.' },
  { gap: true },
  { line: 'Gracias por jugar.' },
];

// ───────────────────────────── Narrator library ─────────────────────────────

export interface StoryLine extends NarratorLine {
  id: string;
  minCycle?: number;
  maxCycle?: number;
  weight?: number;
  /** Only once per run (cycle). */
  once?: boolean;
}

const L = (id: string, third: string, first?: string, direct?: string, extra: Partial<StoryLine> = {}): StoryLine =>
  ({ id, third, first, direct, ...extra });

/**
 * Event key → candidate lines. The story engine (systems/story/narration.ts) filters by cycle and `once`,
 * picks weighted-random and applies per-key and global cooldowns so the voice never becomes spam.
 */
export const NARRATION: Record<string, StoryLine[]> = {
  overworld_intro: [
    L('ow1', 'Elias Veyr caminó hacia el pueblo más cercano. No tenía ejército, ni oro, ni amigos. Tenía una regla.',
      'Caminé hacia el pueblo más cercano. No tenía ejército, ni oro, ni amigos. Tenía una regla.', undefined, { maxCycle: 1 }),
    L('ow2', 'El mundo lo daba por muerto. Era, pensándolo bien, una ventaja.', 'El mundo me daba por muerto. Era, pensándolo bien, una ventaja.'),
  ],
  first_battle: [
    L('fb1', 'Era la primera vez que {name} peleaba contra alguien que podía perder.', 'Era la primera vez que peleaba contra alguien que podía perder.',
      'Tu primera pelea de verdad. Él fingió no tener miedo. Tú también.', { once: true }),
  ],
  battle_won: [
    L('bw1', 'Ganó. No lo celebró: las cosas que se celebran se olvidan.', 'Gané. No lo celebré: las cosas que se celebran se olvidan.', 'Ganaste. No lo celebres; yo no lo haría.'),
    L('bw2', 'Cuando el polvo bajó, {name} seguía de pie. Era, de momento, su única virtud.', 'Cuando el polvo bajó, yo seguía de pie. Era, de momento, mi única virtud.'),
    L('bw3', 'Los vencidos lo miraron como se mira una tormenta que ya pasó: con alivio y con rencor.', 'Los vencidos me miraron como se mira una tormenta que ya pasó: con alivio y con rencor.'),
    L('bw4', 'Otra victoria. El mundo empezaba a acostumbrarse, que es la forma más lenta de rendirse.', 'Otra victoria. El mundo empezaba a acostumbrarse, que es la forma más lenta de rendirse.'),
  ],
  battle_lost: [
    L('bl1', 'Perdió. El mundo tomó nota, con esa letra pequeña que usa para las cosas que piensa cobrar.', 'Perdí. El mundo tomó nota, con esa letra pequeña que usa para las cosas que piensa cobrar.',
      'Perdiste. No pasa nada. Perder también avanza la historia.'),
    L('bl2', 'La derrota le supo a tierra. Se levantó de todos modos; era lo único que sabía hacer bien.', 'La derrota me supo a tierra. Me levanté de todos modos; era lo único que sabía hacer bien.'),
  ],
  battle_fled: [
    L('bf1', 'Huyó. Hay quien lo llama cobardía. Él lo llamaba tener mañana.', 'Hui. Hay quien lo llama cobardía. Yo lo llamaba tener mañana.', 'Huiste. Bien. Los muertos no aprenden nada.'),
  ],
  first_copy: [
    L('fc1', 'El golpe le dolió. Después dejó de dolerle. Después fue suyo.', 'El golpe me dolió. Después dejó de dolerme. Después fue mío.', '¿Lo sentiste? Así se roba sin manos.', { once: true }),
  ],
  copy: [
    L('cp1', 'Otra cosa que lo tocó. Otra cosa que ya no podía tocarlo.', 'Otra cosa que me tocó. Otra cosa que ya no podía tocarme.'),
    L('cp2', '{habilidad}. El mundo se la había enseñado sin querer.', '{habilidad}. El mundo me la había enseñado sin querer.', '{habilidad}. Te la regalaron a golpes.'),
    L('cp3', 'Aprendía como aprenden las cicatrices: de afuera hacia adentro.', 'Aprendía como aprenden las cicatrices: de afuera hacia adentro.'),
  ],
  copy_milestone: [
    L('cm1', '{n} excepciones. A estas alturas, las reglas lo esquivaban a él.', '{n} excepciones. A estas alturas, las reglas me esquivaban a mí.', '{n}. Las reglas ya te esquivan a ti.'),
  ],
  name_1: [
    L('n1', 'El mundo le dio otro nombre: La Excepción. Él no lo pidió, pero tampoco lo devolvió.', 'El mundo me dio otro nombre: La Excepción. No lo pedí, pero tampoco lo devolví.',
      'Ya no te llaman Elias. ¿Te diste cuenta?'),
  ],
  name_2: [
    L('n2', 'Lo llamaron El Hombre sin Ley. Las leyes siguieron existiendo; solo que ya no hablaban de él.', 'Me llamaron El Hombre sin Ley. Las leyes siguieron existiendo; solo que ya no hablaban de mí.'),
  ],
  name_3: [
    L('n3', 'Veyr. Solo eso. Hubo aldeas donde ya no se pronunciaba; se susurraba, como se susurra el frío.', 'Veyr. Solo eso. Hubo aldeas donde mi nombre ya no se pronunciaba; se susurraba, como se susurra el frío.'),
  ],
  name_4: [
    L('n4', 'Los dioses y los sabios empezaron a llamarlo El Referente. Medían el mundo con él, como con una regla rota.',
      'Los dioses y los sabios empezaron a llamarme El Referente. Medían el mundo conmigo, como con una regla rota.', 'El Referente. Suena a alguien que no tiene que explicarse. Te queda.'),
    L('n4b', 'Alguien, en algún templo, escribió: «Esto se está acercando demasiado a Él». Luego tachó la última palabra.',
      'Alguien, en algún templo, escribió: «Esto se está acercando demasiado a Él». Luego tachó la última palabra.'),
  ],
  death_first: [
    L('d1', '{name} murió. Luego dejó de estarlo. La muerte, para él, empezaba a ser una costumbre incómoda.', 'Morí. Luego dejé de estarlo. La muerte empezaba a ser una costumbre incómoda.',
      'Moriste. Yo lo vi. Volviste. También lo vi.', { once: true }),
  ],
  death_many: [
    L('d2', 'Murió otra vez. El mundo empezaba a aburrirse de enterrarlo.', 'Morí otra vez. El mundo empezaba a aburrirse de enterrarme.', 'Otra vez. ¿Lo haces a propósito?'),
    L('d3', 'Cada muerte le enseñaba algo. Casi siempre, lo mismo: no pararse ahí.', 'Cada muerte me enseñaba algo. Casi siempre, lo mismo: no pararme ahí.'),
  ],
  death_lots: [
    L('d4', '{n} veces. Ya no lo lloraba nadie; solo lo esperaban.', '{n} veces. Ya no me lloraba nadie; solo me esperaban.', '{n}. Llevo la cuenta, por si te interesa.'),
  ],
  death_absurd: [
    L('d5', 'Murió tantas veces que la muerte empezó a saludarlo por su nombre. Por su nombre de ahora.', 'Morí tantas veces que la muerte empezó a saludarme por mi nombre.',
      '{n} muertes. Me pregunto quién de los dos está aprendiendo.'),
  ],
  revival: [
    L('rv1', 'Retorno. La vida le volvió al cuerpo como vuelve el agua a un pozo: sin pedir permiso.', 'Retorno. La vida me volvió al cuerpo como vuelve el agua a un pozo: sin pedir permiso.'),
    L('rv2', 'Se levantó. Los que lo habían matado se quedaron quietos, como quien olvida una palabra.', 'Me levanté. Los que me habían matado se quedaron quietos, como quien olvida una palabra.'),
  ],
  idle_return: [
    L('id1', 'Te fuiste. Él esperó.', 'Te fuiste. Yo esperé.', 'Te fuiste. Te esperé.'),
    L('id2', 'Estuviste lejos un rato. Él no se movió. Algunas cosas solo se mueven cuando alguien las mira.',
      'Estuviste lejos un rato. No me moví. Algunas cosas solo se mueven cuando alguien las mira.', undefined, { minCycle: 2 }),
  ],
  late_night: [
    L('ln1', '{hora}. Él tampoco duerme.', '{hora}. Yo tampoco duermo.', '{hora}. Deberías dormir. Yo no puedo.'),
  ],
  tab_return: [
    L('tr1', 'Volviste. El mundo había seguido girando, pero despacio, por cortesía.', 'Volviste. El mundo había seguido girando, pero despacio, por cortesía.', 'Volviste. Lo sabía.'),
  ],
  reload_mid_battle: [
    L('rl1', 'Hay quien cree que cerrar los ojos deshace las cosas.', 'Hay quien cree que cerrar los ojos deshace las cosas. Yo no.', 'Recargar no borra lo que vi.'),
  ],
  gamble_first: [
    L('g0', 'Apostó por primera vez. La suerte lo miró con curiosidad, como se mira a un forastero.', 'Aposté por primera vez. La suerte me miró con curiosidad, como se mira a un forastero.', undefined, { once: true }),
  ],
  gamble_win_big: [
    L('gw1', 'Ganó {gold} monedas. A la suerte nadie le había explicado quién era él.', 'Gané {gold} monedas. A la suerte nadie le había explicado quién era yo.',
      '{gold} monedas. La casa también lo vio. La casa no olvida.'),
    L('gw2', 'Las monedas cayeron como lluvia de verano. Don Tiburcio sonrió con un solo diente: el de oro.',
      'Las monedas cayeron como lluvia de verano. Don Tiburcio me sonrió con un solo diente: el de oro.'),
  ],
  gamble_loss_big: [
    L('gl1', 'Perdió {gold} monedas en una noche. Lo contó como quien cuenta estrellas: sin rencor y sin terminar.',
      'Perdí {gold} monedas en una noche. Lo conté como quien cuenta estrellas: sin rencor y sin terminar.', '{gold} monedas. Yo lo anoté. Tú intenta olvidarlo.'),
    L('gl2', 'La casa siempre gana. Él lo sabía. Jugó igual, porque lo que buscaba no era ganar.', 'La casa siempre gana. Lo sabía. Jugué igual, porque lo que buscaba no era ganar.'),
  ],
  cheat_caught: [
    L('cc1', 'Lo atraparon haciendo trampa. Era la primera vez en mucho tiempo que alguien lo veía de verdad.',
      'Me atraparon haciendo trampa. Era la primera vez en mucho tiempo que alguien me veía de verdad.', 'Te vieron. Qué raro se siente, ¿no? Que te vean.'),
  ],
  spared: [
    L('sp1', 'Lo dejó vivir. Nadie supo si por piedad o por cálculo. Él tampoco.', 'Lo dejé vivir. Nadie supo si por piedad o por cálculo. Yo tampoco.', 'Lo dejaste vivir. Él lo va a recordar. Yo también.'),
    L('sp2', 'Perdonaba como otros guardan monedas: por si acaso.', 'Perdonaba como otros guardan monedas: por si acaso.'),
  ],
  executed: [
    L('ex1', 'No hubo discurso. {name} nunca desperdiciaba palabras en quien ya no iba a escucharlas.', 'No hubo discurso. Nunca desperdicié palabras en quien ya no iba a escucharlas.', 'Así, sin más. Tomé nota.'),
    L('ex2', 'Cada nombre que borraba dejaba un hueco en el mundo. El mundo, por ahora, no se quejaba.', 'Cada nombre que borraba dejaba un hueco en el mundo. El mundo, por ahora, no se quejaba.'),
  ],
  mind_first: [
    L('mf1', 'Entró en su mente como quien entra a una casa sin llave. Adentro olía a miedo y a pan recién hecho.',
      'Entré en su mente como quien entra a una casa sin llave. Adentro olía a miedo y a pan recién hecho.', undefined, { once: true }),
  ],
  mind_many: [
    L('mm1', '{n} mentes. De noche se le mezclaban los recuerdos ajenos con los propios. No le molestaba: los ajenos eran mejores.',
      '{n} mentes. De noche se me mezclan los recuerdos ajenos con los propios. No me molesta: los ajenos son mejores.'),
  ],
  units_lost_many: [
    L('ul1', 'Los soldados caían y él no se aprendía sus nombres. Alguien tenía que hacerlo.', 'Los soldados caían y yo no me aprendía sus nombres. Alguien tenía que hacerlo.',
      '{n} soldados. ¿Te acuerdas de alguno? Yo de todos.'),
  ],
  first_recruit: [
    L('fr1', 'Un primer siervo. Nadie empieza con un ejército; se empieza con alguien que no se atreve a decir que no.',
      'Un primer siervo. Nadie empieza con un ejército; se empieza con alguien que no se atreve a decir que no.', undefined, { once: true }),
  ],
  army_10: [
    L('a10', 'Diez. Suficiente para que un pueblo cierre las ventanas al verlos pasar.', 'Diez. Suficiente para que un pueblo cierre las ventanas al vernos pasar.', undefined, { once: true }),
  ],
  army_25: [
    L('a25', 'Ya no era un grupo. Era una frase que el mundo no quería terminar de leer.', 'Ya no era un grupo. Era una frase que el mundo no quería terminar de leer.', undefined, { once: true }),
  ],
  terror_first: [
    L('tf1', 'El miedo es una forma de respeto que no necesita permiso. {name} lo aprendió rápido.', 'El miedo es una forma de respeto que no necesita permiso. Lo aprendí rápido.', undefined, { once: true }),
  ],
  invisible_long: [
    L('iv1', 'Durante un rato, nadie lo vio. Yo sí.', 'Durante un rato, nadie me vio. Casi nadie.', 'Nadie te vio. Casi nadie.', { once: true }),
  ],
  colmenas: [
    L('co1', 'Las Colmenas seguían ahí, junto al bosque de la bruma. Algunas ventanas tenían luz. Ninguna lo esperaba.',
      'Las Colmenas seguían ahí, junto al bosque de la bruma. Algunas ventanas tenían luz. Ninguna me esperaba.', '¿Reconoces el bosque? Deberías.'),
    L('co2', 'Había un tronco en el borde del bosque. {name} no supo por qué se detuvo a mirarlo.', 'Había un tronco en el borde del bosque. No supe por qué me detuve a mirarlo.',
      'El tronco sigue ahí. Tú sabes quién se sentaba.', { minCycle: 2 }),
  ],
  bruma: [
    L('br1', 'Una perrita vieja, blanca y gris, lo miró sin miedo. Como si para ella siguiera amaneciendo.', 'Una perrita vieja, blanca y gris, me miró sin miedo. Como si para ella siguiera amaneciendo.',
      'Ella te conoce. No preguntes de dónde.'),
  ],
  crater: [
    L('cr1', 'El Cráter todavía estaba tibio. La tierra recuerda mejor que la gente.', 'El Cráter todavía estaba tibio. La tierra recuerda mejor que la gente.'),
    L('cr2', 'Volvió al hoyo donde había muerto. Le pareció más pequeño; a todos nos pasa con las casas de la infancia.', 'Volví al hoyo donde había muerto. Me pareció más pequeño; a todos nos pasa con las casas de la infancia.'),
  ],
  concordia: [
    L('cn1', 'Concordia seguía blanca. La paz, como la cal, hay que repintarla cada tanto.', 'Concordia seguía blanca. La paz, como la cal, hay que repintarla cada tanto.'),
    L('cn2', 'En la plaza seguía la marca donde Aurel lo había golpeado. Nadie la había limpiado. Era un monumento.', 'En la plaza seguía la marca donde Aurel me había golpeado. Nadie la había limpiado. Era un monumento.'),
  ],
  aurel_knows: [
    L('ak1', 'En Concordia, alguien le contó a Aurel que el mago seguía vivo. Aurel no dijo nada. Pidió que le afilaran la espada.',
      'En Concordia, alguien le contó a Aurel que yo seguía vivo. No dijo nada. Pidió que le afilaran la espada.', 'Ya lo sabe. Aurel sabe que vives.'),
  ],
  aurel_returns: [
    L('ar1', 'El Portador del Alba volvió a los caminos. Esta vez no buscaba celebraciones.', 'El Portador del Alba volvió a los caminos. Esta vez no buscaba celebraciones.',
      'Él viene. Huir también es una forma de ganar. Por ahora.'),
  ],
  aurel_encounter: [
    L('ae1', 'Aurel lo miró como se mira un error propio.', 'Aurel me miró como se mira un error propio.'),
    L('ae2', 'El héroe estaba cansado. Se le notaba en los hombros, no en la espada.', 'El héroe estaba cansado. Se le notaba en los hombros, no en la espada.'),
    L('ae3', 'Aurel dudó un instante, como si recordara algo que todavía no había pasado.', 'Aurel dudó un instante, como si recordara algo que todavía no había pasado.',
      'Él también empieza a recordar. Qué incómodo, ¿no?', { minCycle: 3 }),
  ],
  aurel_fled: [
    L('af1', 'Huyó de Aurel. No era vergüenza: era aritmética.', 'Hui de Aurel. No era vergüenza: era aritmética.'),
  ],
  dejavu: [
    L('dv1', '{name} tuvo la sensación de haber estado aquí antes. La apartó como se aparta una telaraña.', 'Tuve la sensación de haber estado aquí antes. La aparté como se aparta una telaraña.',
      'Otra vez tú.', { minCycle: 2 }),
    L('dv2', 'Todo estaba donde debía estar. Eso fue lo que más le inquietó.', 'Todo estaba donde debía estar. Eso fue lo que más me inquietó.', 'Ya estuviste aquí. Los dos lo sabemos.', { minCycle: 2 }),
    L('dv3', 'El mundo lo saludó como a un conocido. Él no recordaba haberse presentado.', 'El mundo me saludó como a un conocido. No recordaba haberme presentado.', 'Otra vez tú. Otra vez yo.', { minCycle: 3 }),
  ],
  relic_first: [
    L('rf1', 'Su primera reliquia. Algunas cosas no se encuentran: esperan.', 'Mi primera reliquia. Algunas cosas no se encuentran: esperan.', undefined, { once: true }),
  ],
  relic_major: [
    L('rm1', '{reliquia}. El mundo tiene pocas cosas que no se pueden repetir. Esta era una.', '{reliquia}. El mundo tiene pocas cosas que no se pueden repetir. Esta era una.'),
  ],
  eclipse: [
    L('ec1', 'El sol y la luna se tocaron en su mano. Por un momento, nadie en el mundo supo qué hora era.', 'El sol y la luna se tocaron en mi mano. Por un momento, nadie en el mundo supo qué hora era.',
      'Eclipse. ¿Ves? Ya casi no queda tiempo. Literalmente.', { once: true }),
  ],
  book_realidad: [
    L('bk1', 'El Libro de la Realidad pesaba menos de lo que debía. Las cosas peligrosas suelen ser ligeras.', 'El Libro de la Realidad pesaba menos de lo que debía. Las cosas peligrosas suelen ser ligeras.', undefined, { once: true }),
  ],
  book_aprendizaje: [
    L('bk2', 'El Libro del Aprendizaje se abrió solo, en una página que decía su nombre. Tenía prisa.', 'El Libro del Aprendizaje se abrió solo, en una página que decía mi nombre. Tenía prisa.', undefined, { once: true }),
  ],
  continent_corrupted: [
    L('cc2', '{continente} dejó de rezar. No a él. Todavía.', '{continente} dejó de rezar. No a mí. Todavía.', '{continente} es tuyo. ¿Se siente como pensabas?'),
    L('cc3', 'Cayó {continente}. No hubo ruido: las cosas grandes caen en silencio y hacen ruido después.', 'Cayó {continente}. No hubo ruido: las cosas grandes caen en silencio y hacen ruido después.'),
  ],
  alert_high: [
    L('ah1', 'El Concilio empezó a pronunciar su nombre con cuidado, como quien pisa hielo.', 'El Concilio empezó a pronunciar mi nombre con cuidado, como quien pisa hielo.'),
  ],
  custodio: [
    L('cu1', 'El Concilio lo nombró Custodio. Le dieron la silla más alta de la mesa, la que nunca se usa para votar. Él la usó para sentarse.',
      'El Concilio me nombró Custodio. Me dieron la silla más alta de la mesa, la que nunca se usa para votar. La usé para sentarme.', 'Custodio. Te dieron las llaves de la casa que viniste a quemar.'),
  ],
  alliance: [
    L('al1', 'Los cinco se pusieron de acuerdo. Mala señal: cuando el Concilio coincide, alguien va a morir.', 'Los cinco se pusieron de acuerdo. Mala señal: cuando el Concilio coincide, alguien va a morir.'),
  ],
  sello_start: [
    L('ss1', 'Empezaron a escribir el Sello: una página en blanco con su forma exacta.', 'Empezaron a escribir el Sello: una página en blanco con mi forma exacta.', 'Te están preparando una página. En blanco.'),
  ],
  sello_broken: [
    L('sb1', 'El Sello se rompió. Las páginas en blanco también se rompen, si se las mira fijamente.', 'El Sello se rompió. Las páginas en blanco también se rompen, si se las mira fijamente.'),
  ],
  council_session: [
    L('cs1', 'El Concilio se reunió. Hablaron de él durante horas. No lo invitaron; nunca hizo falta.', 'El Concilio se reunió. Hablaron de mí durante horas. No me invitaron; nunca hizo falta.'),
  ],
  luna: [
    L('lu1', 'Pasó otra luna. Nadie la contó.', 'Pasó otra luna. Nadie la contó.'),
    L('lu2', 'La luna cambió de cara. En el mundo, nadie cambió de opinión.', 'La luna cambió de cara. En el mundo, nadie cambió de opinión.'),
    L('lu3', 'Otra luna. En Las Colmenas, alguien preguntó en qué año estaban. Nadie supo contestar.', 'Otra luna. En Las Colmenas, alguien preguntó en qué año estaban. Nadie supo contestar.'),
  ],
  ambient: [
    L('am1', 'Caminaba como si el mundo le debiera algo. Quizás se lo debía.', 'Caminaba como si el mundo me debiera algo. Quizás me lo debía.'),
    L('am2', 'No tenía prisa. Las cosas inevitables nunca tienen prisa.', 'No tenía prisa. Las cosas inevitables nunca tienen prisa.'),
    L('am3', 'A veces se detenía a escuchar. El viento le contaba cosas que la gente callaba.', 'A veces me detenía a escuchar. El viento me contaba cosas que la gente callaba.'),
    L('am4', 'Había un silencio que lo seguía. No era suyo. Era de alguien que lo miraba.', 'Había un silencio que me seguía. No era mío. Era de alguien que me miraba.', 'Ese silencio soy yo.'),
    L('am5', 'Nadie le preguntaba quién era. Nadie se atreve a preguntar lo que no quiere saber.', 'Nadie me preguntaba quién era. Nadie se atreve a preguntar lo que no quiere saber.'),
    L('am6', 'Por un instante, la voz que contaba esta historia sonó muy parecida a la suya.', 'Por un instante, la voz que contaba esta historia sonó muy parecida a la mía.', undefined, { minCycle: 2 }),
  ],
  rich: [
    L('ri1', 'Tenía más oro del que podía gastar. Eso nunca lo había detenido.', 'Tenía más oro del que podía gastar. Eso nunca me había detenido.', undefined, { once: true }),
  ],
  debt: [
    L('de1', 'La Banca escribió su nombre en tinta roja. Los duendes no olvidan una deuda; la heredan.', 'La Banca escribió mi nombre en tinta roja. Los duendes no olvidan una deuda; la heredan.', undefined, { once: true }),
  ],
  hesitation: [
    L('he1', 'Dudó. Abrió el libro, lo cerró. Anoté las dos cosas.', 'Dudé. Abrí el libro y lo cerré. Lo anoté.', 'Dudaste. Lo anoté.'),
  ],
  sacrifice: [
    L('sa1', 'Pagó. El Libro no acepta promesas; acepta pedazos.', 'Pagué. El Libro no acepta promesas; acepta pedazos.'),
  ],
  final_act: [
    L('fa1', 'Cinco continentes, una isla blanca y todo lo que sobrevivió, esperándolo.', 'Cinco continentes, una isla blanca y todo lo que sobrevivió, esperándome.', 'Ya casi. Ya casi llegamos al final. Otra vez.'),
    L('fa2', 'En Concordia, la Gran Alianza afilaba sus armas. Aurel no. Aurel rezaba, que es otra forma de afilar.', 'En Concordia, la Gran Alianza afilaba sus armas. Aurel no. Aurel rezaba, que es otra forma de afilar.'),
  ],
  nemesis_killed: [
    L('nk1', '{capitan} no volvería a buscarlo. Alguien tendría que heredar su rencor.', '{capitan} no volvería a buscarme. Alguien tendría que heredar su rencor.'),
  ],
  nemesis_rises: [
    L('nr1', '{capitan} lo mató. Esa noche, en alguna taberna, alguien brindó por un nombre nuevo.', '{capitan} me mató. Esa noche, en alguna taberna, alguien brindó por un nombre nuevo.',
      '{capitan}. Recuerda ese nombre. Yo ya lo hice.'),
  ],
  el_alba: [
    L('ea1', 'La luz que el niño lanzó en el bosque le atravesó el pecho. No le dolió. Ya era suya.', 'La luz que el niño lanzó en el bosque me atravesó el pecho. No me dolió. Ya era mía.'),
  ],
  new_cycle: [
    L('nc1', 'Todo volvió a empezar. Casi todo.', 'Todo volvió a empezar. Casi todo.', 'Otra vez. ¿Cuántas van? Yo sí las cuento.'),
    L('nc2', 'En los márgenes del libro, alguien había dejado anotaciones. La letra se parecía a la suya.', 'En los márgenes del libro, alguien había dejado anotaciones. La letra se parecía a la mía.',
      'Esas notas al margen son tuyas. Las dejaste para ti.'),
    L('nc3', 'Ya no le sorprendía volver. Le sorprendía que tú también.', 'Ya no me sorprende volver. Me sorprende que tú también.', 'Ya no me sorprende volver. Me sorprende que tú también.', { minCycle: 3 }),
  ],
  new_cycle_sello: [
    L('ns1', 'Lo encerraron en una página. Pero él había aprendido a leer entre líneas.', 'Me encerraron en una página. Pero yo había aprendido a leer entre líneas.'),
  ],
};

/** Names used when the content data (ABILITIES/RELICS) is not available yet. */
export const FALLBACK_NAMES: Record<string, string> = {
  dominar_mente: 'Dominar Mente', velo: 'Velo', fuerza_titanica: 'Fuerza Titánica', afinidad_reliquias: 'Afinidad de Reliquias',
  retorno: 'Retorno', el_alba: 'El Alba', chispa_arcana: 'Chispa Arcana', esquivar: 'Esquivar', golpe_titanico: 'Golpe Titánico',
  paso_fantasma: 'Paso Fantasma', mil_cortes: 'Mil Cortes', clones_sombra: 'Clones de Sombra', metamorfosis: 'Metamorfosis',
  eclipse_total: 'Eclipse Total', traicion: 'Traición',
  daga_solar: 'Aurora, la Daga Solar', daga_lunar: 'Nocturna, la Daga Lunar', eclipse: 'Eclipse', libro_realidad: 'El Libro de la Realidad',
  libro_aprendizaje: 'El Libro del Aprendizaje', corona_vacia: 'La Corona Vacía', collar_bruma: 'El Collar de Bruma', pluma_narrador: 'La Pluma del Narrador',
};

export const CONTINENT_NAMES: Record<string, string> = {
  valdoria: 'Valdoria', sylvaria: 'Sylvaria', kharaz: 'Kharaz', morvenna: 'Morvenna', islas: 'Las Islas de Azar', concordia: 'Concordia',
};
