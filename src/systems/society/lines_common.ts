/**
 * Generic line pools: "¿Qué año es?" (≥15 variants + voices + cycle echoes), memory/feeling/trait greetings,
 * townsfolk by continent (duendes speak chapín), rumor wrappers and reactions.
 * Tokens: {where} {detail} {epithet} {name} {loc}.
 */
import type { ContinentId, TraitId } from '../../data/types';
import type { DeedKind } from './types';

export const YEAR_ANSWERS: string[] = [
  'No sé. Un día dejamos de contar.',
  '¿Año? Mi abuela decía que antes había. Nunca me explicó qué eran.',
  'El mismo que ayer, supongo. ¿O era mañana?',
  'Contábamos lunas, pero se nos perdió la cuenta en una boda.',
  'Hace mucho dejamos de contar. Nadie recuerda por qué. Nadie pregunta por qué. Excepto usted.',
  '¿Para qué quiere saber eso? Las cosas pasan igual.',
  'Mi padre tenía un calendario. Lo usamos para prender el fuego.',
  'Los años son como los impuestos: si nadie los cobra, dejan de existir.',
  'Pregúntele a la luna. Ella tampoco sabe, pero lo disimula mejor.',
  '(Se queda mirándote un rato largo.) ...Qué pregunta tan rara. Me dio frío.',
  'El año del trigo bueno. O del trigo malo. Siempre es uno de los dos.',
  'Nadie sabe en qué año nació. Es de mala educación preguntarlo, ¿sabía?',
  'No hay años. Hay antes y hay después. Y usted huele a después.',
  'Hubo un tiempo en que lo sabíamos. Después alguien escribió algo, y ya no.',
  '¿Año? Qué palabra tan vieja. Suena a algo que se rompió.',
  'El cura dice que preguntar eso trae mala suerte. El cura también dice muchas cosas.',
  'Si le digo un número, ¿me deja en paz? ...Siete. No, espere. No sé.',
  'Qué curioso. Cuando intento pensarlo, se me olvida lo que estaba pensando.',
];

export const YEAR_BY_RACE: Partial<Record<string, string[]>> = {
  duende: [
    '¿Año? ¡A la gran! Aquí lo único que se cuenta es el pisto, patojo.',
    'Puchis, vos, yo ni sé qué día es hoy. Y eso que llevo la contabilidad.',
    '¿Año? Está yuca esa pregunta, cuate. Mejor pregúnteme cuánto me debe.',
  ],
  enano: ['Los enanos contamos vetas, no años. Y las vetas no mienten.', '¡Bah! Pregúntale a la montaña. Lleva más tiempo aquí que los años.'],
  elfo: ['Novecientas lunas llevo preguntándome lo mismo. Deja de preguntar: envejece.', 'Los elfos no contamos. Recordamos. Y no recuerdo eso.'],
  ogro: ['¿Año? ¿Se come?', '¡Año ser grande! ¡Como piedra!'],
  gigante: ['Mmm... año... Las montañas... tampoco... saben.'],
  trol: ['Esperamos. No contamos. Esperar es mejor que contar.'],
  bruja: ['Todos. Ninguno. El que estás repitiendo.', 'La sopa dice que no hay años. La sopa suele tener razón.'],
  mago: ['Existe un tratado entero sobre la desaparición del calendario. Tiene todas las páginas en blanco.', 'Error de cálculo. Siempre da error de cálculo.'],
  sirena: ['El mar no cuenta olas. Tampoco años.', 'Canto la respuesta y se la lleva la marea.'],
  clerigo: ['El Alba sale cada día. Nadie le pregunta cuántas veces.'],
  picaro: ['El año en que no me atraparon. Todos, por ahora.'],
};

export const YEAR_CHILD = ['¡Yo tengo siete! ¿O eso es otra cosa?', '¡Mi mamá tampoco sabe! Dice que no importa.'];

/** Cycle 2+: some NPCs remember being asked. */
export const YEAR_CYCLE = [
  '...¿Otra vez me preguntas eso?',
  'Ya me preguntaste eso. No en esta vida, creo. Pero me lo preguntaste.',
  'Qué raro. Tengo la respuesta en la punta de la lengua... como si ya te la hubiera dado.',
  'Siempre que me preguntas eso, llueve después. Siempre. ¿Cómo sé que siempre?',
  'Esta conversación... la soñé. Terminaba con usted sonriendo así.',
];

/** Asked again in the same run. */
export const YEAR_AGAIN = [
  'Ya se lo dije: no sé. Y sigo sin saber.',
  '¿Otra vez? Usted tiene una obsesión rara.',
  'La respuesta no cambió desde la última vez. Bueno, a lo mejor sí. No lo sé.',
];

// ───────────────────────────── greetings ─────────────────────────────

export const MEMORY_GREETINGS: Record<string, string[]> = {
  amenazado: ['Tú otra vez. La última vez me amenazaste en {where}. No lo olvidé.', '¿Vienes a asustarme de nuevo? En {where} ya lo hiciste muy bien.'],
  perdonado: ['Todavía no entiendo por qué me dejaste vivir.', 'Me perdonaste en {where}. Todavía no sé si darte las gracias o huir.'],
  robado: ['La última vez me robaste. Esta vez paga por adelantado.', 'Cuento mis monedas cuando te veo. Costumbre desde {where}.'],
  familiar_muerto: ['Tú. Tú mataste a {detail}.', 'No me mires. Tienes las manos manchadas de {detail}.'],
  dominado: ['Mi cabeza... cada vez que te veo, me duele aquí.', 'Hay un hueco en mi memoria con la forma de tus ojos.'],
  sobornado: ['¿Otra bolsa? Qué generoso. Qué sospechoso.', 'Lo de {where} queda entre nosotros, ¿verdad?'],
  chantajeado: ['No diga nada. Sé lo que sabe.', 'Por favor... no aquí. Nos pueden oír.'],
  ayudado: ['¡Usted! El que nos ayudó en {where}. Pase, pase.', 'No se me olvida lo de {where}. Aquí tiene una amiga. O algo parecido.'],
  regalo: ['Todavía tengo lo que me regalaste. No sé si debería.', 'Ah, el generoso. ¿Qué quieres a cambio esta vez?'],
  conquistado: ['Tomaste {where}. Ahora eres el que manda. Qué raro se siente decirlo.'],
  mato_elias: ['Te maté. Te vi caer. ¿Qué eres?', 'Tú... estabas muerto. Yo te maté. ¡Yo te maté!'],
  huyo: ['La última vez huí. No me hagas huir otra vez.'],
  cicatriz: ['Mira esta cicatriz. {where}. Tú me la hiciste.'],
  vencio: ['Te vi huir en {where}. ¿Vienes por la revancha?'],
  derrotado: ['Me tumbaste en {where}. Todavía me duele el orgullo.'],
  abandonado: ['Me diste por muerto en {where}. Casi tienes razón.'],
  enganado: ['El tramposo del casino. Te estoy mirando las manos.'],
  humillado: ['Me humillaste delante de todos. No lo olvido.'],
};

export const ECO_GREETINGS = [
  '¿Nos hemos visto antes? Algo en mí dice: «{memory}». No sé por qué.',
  'Qué raro... te conozco. De un sueño, creo. Uno donde tú y yo... «{memory}».',
  'Siento que ya tuvimos esta conversación. Y que terminó mal.',
  'Juraría que te he visto antes. En otra vida. En otro libro.',
];

export const FEELING_GREETINGS: Record<'miedo' | 'odio' | 'respeto' | 'deuda', string[]> = {
  miedo: ['(Retrocede un paso.) N-no quiero problemas.', 'S-sí, señor. Lo que usted diga, señor.', '(Evita mirarte a los ojos.) ¿Qué... qué desea?'],
  odio: ['Lárgate de mi vista.', 'Si las miradas mataran, tú ya estarías muerto. Otra vez.', 'Di lo que quieras y vete.'],
  respeto: ['Mi señor.', 'Es un honor que venga en persona.', 'Le escucho. Siempre le escucho.'],
  deuda: ['Le debo una. No lo olvido.', 'Lo que necesite. Se lo debo.'],
};

export const LOYAL_GREETINGS = ['Ordene. (Sus ojos giran en espiral, apenas.)', 'Estoy a su servicio. Siempre lo estuve. ¿Verdad?', 'Dígame qué hacer. Pensar cansa.'];

export const TITLE_GREETINGS: string[][] = [
  ['Ah, el mago ese.', '¿Usted es el que cayó del cielo? Pensé que sería más impresionante.', 'El muerto que camina. Qué cosas.'],
  ['Tú eres... la cosa que no muere.', 'La Excepción. Los niños te dibujan con cuernos. No te pareces.'],
  ['El Hombre sin Ley. Aquí todavía tenemos leyes. Pocas, pero tenemos.', 'Dicen que ninguna ley te detiene. ¿Ni la de la gravedad?'],
  ['(Baja la voz.) ...Veyr.', 'No diré tu nombre. En mi aldea ya no se pronuncia.'],
  ['El Referente. Los sabios te citan como si fueras un libro.', 'Todo se mide a partir de ti. Hasta mi miedo.'],
  ['...', '(No te mira. Nadie te mira ya.)'],
];

export const TRAIT_GREETINGS: Partial<Record<TraitId, string[]>> = {
  codicioso: ['¿Traes oro? Porque si no traes oro, no traes nada.', 'Hablemos de negocios. Es el único idioma que respeto.'],
  cobarde: ['¡No me haga daño! ¡Tengo familia! ...Bueno, un gato.', 'Hola, hola, buenas, sí, buenas, ¿qué necesita?'],
  orgulloso: ['Deberías inclinarte al hablarme. Lo dejaré pasar. Esta vez.', 'Supongo que vienes a pedirme algo. Todos vienen a pedirme algo.'],
  leal: ['Mi lealtad tiene dueño, forastero. Y no eres tú.', 'Sirvo a quien debo servir.'],
  vengativo: ['Llevo la cuenta de todo, ¿sabes? De todo.', 'No olvido. Nunca olvido.'],
  piadoso: ['Que el Alba te ilumine. O al menos te caliente un poco.', 'Rezaré por ti. Parece que te hace falta.'],
  supersticioso: ['(Hace una señal contra el mal de ojo.) Buenas...', 'No me mire directamente, por favor. Por si acaso.'],
  ambicioso: ['Tú y yo podríamos llegar lejos. Yo más, claro.', 'Siempre busco aliados útiles. ¿Eres útil?'],
  borracho: ['¡Eh! ¡Hip! ¡Un amigo! ¿Eres mi amigo? Pareces mi amigo.', '¿Invitas tú? Hoy invitas tú.'],
  curioso: ['¡Oh! ¿Es verdad lo que dicen de ti? ¿Todo? ¿Hasta lo de la pluma?', 'Cuéntame algo que no sepa. Por favor.'],
  valiente: ['No te tengo miedo. Dilo rápido.', 'Mírame a los ojos cuando me hables.'],
  paranoico: ['¿Quién te envió? ¿Te siguieron? ¿Estás seguro?', 'Hablemos en voz baja. Las paredes oyen. Esta pared, sobre todo.'],
  honorable: ['Habla con la verdad y te escucharé.', 'Te trataré con respeto. Mientras lo merezcas.'],
  cruel: ['Qué interesante. Me pregunto cuánto aguantarías.', 'Me gustan las cosas que no se rompen. Hay que probarlas.'],
  sabio: ['Los que no mueren aprenden. ¿Qué has aprendido tú?', 'Siéntate. Las respuestas no se dan de pie.'],
  jugador: ['¿Una apuesta? Diez a uno a que me pides algo.', 'La suerte te sonríe. O te enseña los dientes. Depende del día.'],
};

// ───────────────────────────── townsfolk ─────────────────────────────

export const TOWN_GREET: Record<ContinentId, string[]> = {
  valdoria: ['Buenas. Aquí en {loc} no pasa nada. Bueno, no pasaba nada hasta que usted llegó.', 'Si busca al alguacil, está durmiendo. Si busca problemas, también.', 'El trigo está alto este año. Los precios también.'],
  sylvaria: ['Los árboles murmuran cuando pasas. No es un cumplido.', 'Camina despacio. Aquí el suelo recuerda.', 'Las luces del bosque se apagan cerca de ti. ¿Lo notaste?'],
  kharaz: ['¡Aparta, que llevo un carro de hierro!', 'Si no traes oro o piedra, no me hagas perder el turno de la forja.', 'Aquí se trabaja, forastero. Mirar también cuesta.'],
  morvenna: ['¿Buscas pociones? Las de la izquierda curan. Las de la derecha... también, a su manera.', 'No mires la luna mucho rato. Se te queda pegada.', 'Aquí todo el mundo es un poco bruja. Tú también, creo.'],
  islas: ['¡Bienvenido a las Islas! Todo tiene precio, hasta este saludo.', '¿Viene por el casino? Todos vienen por el casino. Pocos vuelven por el barco.', 'La brisa es gratis. Lo demás, no.'],
  concordia: ['Silencio, por favor: aquí hasta las palomas votan.', 'Concordia es la ciudad más pacífica del mundo. Eso dice el cartel.', 'Los guardias de la Custodia nunca duermen. O eso dicen para que no lo intentes.'],
};

export const TOWN_GREET_DUENDE = [
  '¡Qué onda, vos! ¿Vas pa\'l casino? ¡Aguas con Don Tiburcio, que te deja sin pisto!',
  '¡A la gran! ¿Vos sos el mago que no se muere? ¡Qué chilero! ¿Me firmás un recibo?',
  'Púchica, patojo, ¿y esa cara? Parece que te cobraron intereses.',
  '¡Ey, cuate! Si necesitás algo, yo conozco a alguien que conoce a alguien. Cobro comisión, eso sí.',
  '¿Qué onda? No hay clavo, aquí todo se arregla con pisto.',
];

export const TOWN_FEAR = ['(Baja la mirada.) Sí, señor. Lo que usted diga, señor.', 'N-no he visto nada. No sé nada. No soy nadie.', '(Se esconde detrás de un barril. No muy bien.)'];
export const TOWN_OWNED = [
  'Desde que ondea el eclipse, las cosechas siguen igual. Pero ya nadie roba. Nadie se atreve.',
  'Usted manda aquí ahora. Algunos lo celebran. Otros hacen maletas.',
  'Los niños ya saludan al estandarte violeta. Da un poco de miedo lo rápido que aprenden.',
];
export const TOWN_HATE = ['No queremos gente como usted aquí.', 'Váyase. Por favor. O sin por favor.', '(Escupe en el suelo. Muy cerca de tus botas.)'];

export const TOWN_GOSSIP: Partial<Record<DeedKind, string[]>> = {
  terror: ['Usted es el que asustó a medio pueblo, ¿verdad? Mi vecina todavía no sale de casa.', 'Desde que usted pasó, los perros no ladran. Solo miran.'],
  raid: ['Usted saqueó este lugar. Todavía se ven las marcas. No espere que le sirvan cerveza.'],
  help: ['¡Usted ayudó aquí! Mi tía no lo puede creer. Yo tampoco, la verdad.'],
  gift: ['Dicen que usted repartió oro. ¿Queda algo? Pregunto por un amigo.'],
  conquer: ['Cuando sus tropas entraron, pensé que era el fin. Resultó ser un martes cualquiera.'],
  execute: ['Aquí ejecutaron a alguien por su orden. La plaza todavía está en silencio.'],
  invest: ['Usted compró medio pueblo. Mi jefe ahora trabaja para usted. Es rarísimo.'],
  cheat_caught: ['¡Usted es el tramposo del casino! Mi primo estaba ahí. Dice que fue muy elegante.'],
  sanctuary: ['Ese círculo violeta que dejó... las gallinas no se acercan. Ni yo.'],
  battle_won: ['Vi la batalla desde el cerro. Sus soldados volaban. Bueno, los de ellos volaban.'],
};

export const RUMOR_WRAP = ['Dicen que {rumor}', 'Oí que {rumor}', 'Por ahí andan diciendo que {rumor}', 'No lo repita, pero {rumor}', 'Me contaron esto: {rumor}'];
export const RUMOR_WRAP_DUENDE = ['Mirá, cuate, dicen que {rumor}', 'Púchica, ¿no sabías? {rumor}', 'Te lo cuento cabal: {rumor}'];
export const NO_RUMORS = ['No ha pasado nada interesante. Bueno, nada que yo quiera repetir.', 'Todo tranquilo. Demasiado tranquilo, dicen los viejos.', 'Nada. Ni un chisme. Qué luna tan aburrida.'];

export const THREAT_OK = ['¡Está bien, está bien! ¡Tome, tome!', 'N-no hace falta ponerse así. Hablemos.', 'Entendido. Perfectamente entendido.'];
export const THREAT_NO = ['¿Me amenaza? ¿Aquí? ¿Delante de todos?', 'No le tengo miedo. Bueno, un poco. Pero no suficiente.', 'Váyase antes de que llame a la guardia.'];
export const BRIBE_OK = ['Esto... no lo vi. Y usted tampoco.', 'Qué casualidad: justo me acordé de algo.', 'El oro siempre ayuda a la memoria.'];
export const BRIBE_NO = ['¿Por quién me toma?', 'Guárdese su oro. No todo se compra.', 'Ni por todo el oro de las Islas.'];
export const FAREWELLS = ['Vaya con cuidado.', 'Hasta luego.', 'Que le vaya bien. Lejos, de preferencia.', 'Adiós, pues.'];
export const FAREWELLS_DUENDE = ['¡Que te vaya chilero, patojo!', '¡Va pues, cuidate!', '¡Aguas en el camino, vos!'];
