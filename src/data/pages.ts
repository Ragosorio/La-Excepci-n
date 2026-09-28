/**
 * Páginas del Libro — lore fragments written in the voice of the book (EB Garamond).
 * Rules: no dates, no years counted, no chapter numbers. Titles are words, never "Capítulo".
 * `where`: a location id (awarded on first visit / ruin victory there) or 'random' (ruins, events).
 * `minCycle`: only discoverable from that cycle on.
 */
import type { LorePage } from './types';

export const PAGES: LorePage[] = [
  {
    id: 'antes', title: 'Antes', where: 'crater',
    text: 'Nadie sabe de dónde vino Elias Veyr. Los que dicen saberlo cuentan historias distintas: que fue aprendiz de un mago que lo echó por insolente, que nació en una torre sin puertas, que un día simplemente estaba ahí, en medio de un camino, con el abrigo ya puesto. Él nunca corrigió a nadie. Le gustaba que el mundo tuviera que inventárselo.\n\nLo único cierto es que llegó sin nada: sin ejército, sin oro, sin un nombre que alguien temiera. Y que tenía, desde el principio, esa manera de mirar las cosas como si ya supiera cómo iban a terminar.',
  },
  {
    id: 'mechon', title: 'El mechón de plata', where: 'random',
    text: 'Tiene un mechón plateado que le cae sobre la frente. Él dice que es de nacimiento. Madame Fortuna dice que no: que a la gente le sale un mechón así cuando ve algo que no debía ver, y que a él le salió por mirar hacia atrás.\n\nLe preguntaron qué había visto. Fortuna barajó las cartas, sacó una en blanco y la guardó sin mostrarla.\n\n—Nada todavía —dijo—. Por eso es de plata y no blanco.',
  },
  {
    id: 'aurel', title: 'El héroe cansado', where: 'mausoleo_alba',
    text: 'Aurel no pidió ser el Gran Héroe. Lo fue como se es alto: sin permiso. Rubio, de ojos color ámbar, con una cicatriz en el puente de la nariz que nadie le recuerda haberse hecho.\n\nSalvó los cinco continentes tantas veces que la gente dejó de darle las gracias y empezó a darle instrucciones. Cuando lo celebran, sonríe con amabilidad y mira hacia el bosque, como quien espera que alguien lo llame a cenar.\n\nDicen que es justo. Es verdad. Lo que no dicen es que la justicia, hecha todos los días, cansa como cualquier otro oficio.',
  },
  {
    id: 'bruma', title: 'Bruma', where: 'aldea_colmenas',
    text: 'Bruma es una perrita blanca y gris, de pelo largo, que nunca ladra de miedo. Cuando el niño la encontró cabía en un zapato. Cuando el niño se hizo hombre, ella seguía ahí, más lenta, con el hocico canoso.\n\nTiene una costumbre que nadie ha sabido explicar: se sienta mirando hacia el este, a cualquier hora, y mueve la cola despacio. Como si para ella siempre estuviera amaneciendo.\n\nLos perros ven cosas que nosotros no. O quizás, simplemente, no ven las que nosotros sí.',
  },
  {
    id: 'colmenas', title: 'Las Colmenas', where: 'aldea_colmenas',
    text: 'Las Colmenas son torres donde viven muchas familias a la vez, una encima de otra, como celdas de miel. De noche, sus ventanas encendidas parecen un enjambre de luciérnagas quietas.\n\nNadie en Las Colmenas sabe en qué año nació. No es tristeza: es costumbre. Los viejos cuentan que un día alguien preguntó para qué servía contar, y nadie supo responder, y a la mañana siguiente ya nadie contaba.\n\nLos niños desayunan sin saber su edad. Crecen igual.',
  },
  {
    id: 'contar', title: 'El día que dejamos de contar', where: 'random',
    text: 'Hubo un tiempo —dicen— en que la gente contaba los días. Los anotaba en paredes, en libros, en los troncos de los árboles. Luego dejó de hacerlo. No hubo decreto, ni guerra, ni plaga. Simplemente, un día, alguien olvidó anotar, y al siguiente otro, y así.\n\nLos sabios de Altamira discuten si fue el mundo el que olvidó el tiempo o el tiempo el que se olvidó del mundo.\n\nMadame Fortuna, cuando se lo preguntan, se ríe y responde con otra pregunta:\n\n—¿Y quién les dijo que alguna vez contaron?',
  },
  {
    id: 'concilio', title: 'La mesa de los cinco', where: 'concordia',
    text: 'En Concordia hay una mesa redonda con cinco sillas y una sexta, un poco más alta, que nunca se usa para votar. Ahí se sientan los delegados de los cinco continentes.\n\nNo están en guerra, pero tampoco la evitan: la paz, en esa mesa, se negocia cada cuatro lunas, como el precio del grano. La Custodia desempata. Los demás fingen que no les importa quién tiene la silla más alta.\n\nEs la paz más frágil del mundo. Por eso la cuidan tanto.',
  },
  {
    id: 'ione', title: 'La Custodia', where: 'random',
    text: 'Ione Salvaterra lleva el pelo plateado en un moño apretado y un prendedor de rama de olivo que nunca se quita. Cree en las reglas con la fe de quien ha visto lo que pasa sin ellas. Es idealista, lo sabe, y no se disculpa.\n\nCuando le hablaron por primera vez de un mago que no moría, pidió silencio, cerró los ojos y dijo:\n\n—Toda regla tiene una excepción. Por eso escribimos tantas reglas.',
  },
  {
    id: 'aurora', title: 'Aurora', where: 'templo_alba',
    text: 'La Daga Solar se llama Aurora. Es pequeña, casi un juguete, con una hoja que parece hecha de la primera luz de la mañana. Corta lo que no debería poder cortarse: escudos, armaduras, promesas.\n\nDicen los sacerdotes del Templo del Alba que Aurora es el bien, y que quien la empuña no puede mentir mientras la sostiene.\n\nNo dicen que el bien, afilado, también hiere. Eso lo sabe cualquiera que haya sostenido una daga.',
  },
  {
    id: 'nocturna', title: 'Nocturna', where: 'mina_luna',
    text: 'Los enanos cavaron tan hondo que encontraron un pedazo de luna caído. Adentro, como una semilla dentro de una fruta, estaba Nocturna, la Daga Lunar. Drena lo que toca y deja miedo donde antes había valor.\n\nLos mineros que la vieron dejaron de cavar esa misma noche y nunca volvieron a la mina. No era cobardía. Era respeto: hay cosas que se entierran solas por algo.',
  },
  {
    id: 'eclipse', title: 'Eclipse', where: 'forja_primigenia',
    text: 'Aurora y Nocturna fueron forjadas para no tocarse. Pero en la Forja Primigenia, donde arde el primer fuego del mundo, se pueden fundir las cosas que no deberían.\n\nDe las dos dagas nace una espada: Eclipse. Mata como matan todas las espadas, pero además hace algo peor: quien es herido por ella duda de su bando. Un ejército entero puede volverse contra sí mismo por un solo corte.\n\nUn sol y una luna en la misma hoja. Por un momento, nadie sabe qué hora es.',
  },
  {
    id: 'libro_realidad', title: 'El Libro de la Realidad', where: 'boveda_tiburcio',
    text: 'Sus páginas están casi todas en blanco, y las que no lo están cambian cada vez que alguien las lee. El Libro de la Realidad permite reescribir algo del mundo. Una línea. Una sola verdad.\n\nPero no acepta tinta ni oro. Acepta pedazos: una habilidad, un recuerdo, la mitad de un ejército.\n\nDon Tiburcio lo guarda en su bóveda y jura que nunca lo ha abierto. Es la única vez que alguien lo ha visto decir la verdad sin cobrar.',
  },
  {
    id: 'libro_aprendizaje', title: 'El Libro del Aprendizaje', where: 'altamira',
    text: 'En la Biblioteca Prohibida de Altamira hay un libro que enseña lo que no se debe aprender: a caminar por detrás del tiempo, a ser varios a la vez, a cortar mil veces en lo que dura un parpadeo. Los archimagos lo estudian con guantes y en voz baja.\n\nEl Libro del Aprendizaje no tiene índice. Se abre solo, en la página que necesitas, y a veces en la que no.\n\nAlgunos dicen que elige a su lector. Otros, que simplemente tiene prisa.',
  },
  {
    id: 'excepcion', title: 'La Excepción', where: 'random',
    text: 'Toda regla tiene una excepción. Él era la excepción de todas.\n\nLo que lo golpeaba le enseñaba a golpear. Lo que lo quemaba dejaba de quemarlo. Lo que sobrevivía, lo dominaba. No era un poder que se usara; era un poder que se padecía: para aprender algo tenía que dejar que se lo hicieran.\n\nPor eso los que lo vieron pelear al principio pensaron que era torpe. Se dejaba pegar. Sonreía. Y un rato después, pegaba igual.',
  },
  {
    id: 'ciudad_blanca', title: 'La ciudad blanca', where: 'concordia',
    text: 'Concordia es blanca porque la repintan. Cada vez que hay una disputa, los canteros suben a los andamios y cubren de cal las manchas, los nombres escritos con carbón, las marcas de las espadas.\n\nEn el centro de la plaza hay una marca que nadie ha querido cubrir: un hundimiento en la piedra, como si alguien hubiera sido golpeado con la fuerza de una montaña.\n\nLos guías se la muestran a los forasteros. Nunca dicen de quién es.',
  },
  {
    id: 'corona_vacia', title: 'La Corona Vacía', where: 'mausoleo_alba',
    text: 'En Valdoria construyeron una tumba para Aurel antes de que Aurel muriera. El Mausoleo del Alba, lo llaman: mármol, columnas, un sarcófago abierto esperando. Sobre él dejaron una corona sin rey.\n\nDicen que quien la lleva puede mandar sobre los que mandan, pero que la corona pesa lo que pesa la tumba.\n\nLa Reina Isolde la mandó sellar. Luego mandó sellar a los que sabían dónde estaba.',
  },
  {
    id: 'sylvaria', title: 'El bosque que recuerda', where: 'lumen',
    text: 'En Sylvaria los árboles son tan viejos que recuerdan. Si pones la mano en un tronco y cierras los ojos, a veces oyes pasos que ya no están, voces de gente que se fue.\n\nLos elfos no olvidan nada; lo aprendieron de los árboles. Por eso su justicia es lenta y su perdón, rarísimo.\n\nLa Suma Sacerdotisa Elowen ha visto nacer y morir a tantos que ya no llora en los funerales. Solo planta un árbol. El bosque sigue creciendo.',
  },
  {
    id: 'forja', title: 'El primer fuego', where: 'kharaz_dum',
    text: 'Bajo la Montaña Hueca arde un fuego que nadie encendió. Los enanos lo llaman el primer fuego del mundo y le rezan con martillos. En él se reforjan las reliquias y se funden las cosas que no deberían fundirse.\n\nEl Rey Thrain cuenta las monedas dos veces y las piedras tres, pero al fuego no le cobra. Dice que es lo único en Kharaz que trabaja gratis.\n\nY lo único que nadie se atrevería a robar.',
  },
  {
    id: 'morgaine', title: 'Tres ojos', where: 'aquelarre',
    text: 'La Madre Morgaine tiene tres ojos: dos que miran lo que está, y uno, en la frente, que mira lo que vuelve.\n\nDicen las brujas del Aquelarre que ese tercer ojo ve los ciclos: que el mundo termina y empieza, y que algunos lo recuerdan.\n\nCuando alguien le pregunta si ya ha vivido esto, Morgaine sirve sopa y responde:\n\n—Todos lo hemos vivido. Algunos, más veces que otros. Tómatela antes de que se enfríe. Otra vez.',
  },
  {
    id: 'tiburcio', title: 'La Banca', where: 'puerto_fortuna',
    text: 'Don Tiburcio Faroles es un duende pequeño con un diente de oro, un monóculo y un sombrero de copa que lo hace parecer casi de estatura normal. Presta dinero a reyes, a piratas y a dioses menores. Nunca pierde.\n\n—¿Qué onda, patojo? —saluda, y ya te está cobrando la conversación.\n\nEn las Islas dicen que la casa siempre gana. Tiburcio corrige, con cariño: la casa no gana. La casa espera. Ganar es cosa de impacientes.',
  },
  {
    id: 'fortuna', title: 'Madame Fortuna', where: 'random', minCycle: 2,
    text: 'Madame Fortuna tiene un ojo de cada color y un velo de monedas que suena cuando se ríe. Es crupier, adivina, delegada y, según ella, medio sirena por parte de madre.\n\nCuando le reparte cartas a un forastero, a veces se detiene y lo mira más de la cuenta.\n\n—Tú ya estuviste en esta mesa —dice—. No me acuerdo cuándo. Nadie se acuerda de cuándo. Pero la baraja sí.',
  },
  {
    id: 'crater', title: 'El Cráter', where: 'crater',
    text: 'En un campo de trigo de Valdoria hay un cráter que antes no estaba. Los campesinos del Vado dicen que una noche cayó una estrella, y que la estrella se levantó y se sacudió el polvo. Nadie les cree.\n\nEl trigo alrededor creció más alto después. Cuánto después, nadie lo sabe: en Valdoria tampoco cuentan.\n\nLa tierra del fondo sigue tibia. Los niños la tocan para ver si todavía late.',
  },
  {
    id: 'alba', title: 'La luz de su mano', where: 'random',
    text: 'Aurel tiene un último poder que nunca le enseñó a nadie: una luz que le sale de la mano, blanca como el primer minuto del día. La llaman El Alba.\n\nLa usó por primera vez cuando era niño, en el borde de un bosque, contra algo que nadie más vio. Nunca habla de esa mañana.\n\nSi alguien le pregunta, dice que se asustó de una sombra. Luego cambia de tema, y mira hacia el bosque.',
  },
  {
    id: 'nemesis', title: 'Los que vuelven', where: 'random',
    text: 'Hay enemigos que no mueren del todo. Huyen, sanan, cuentan la historia en las tabernas y la mejoran cada vez. Se ganan un apodo, una cicatriz, un rencor. Y vuelven.\n\nEl mundo recuerda lo que haces, pero sobre todo recuerda lo que no terminaste.\n\nCada capitán que dejas vivo es una promesa que alguien te va a cobrar. Cada capitán que matas es un nombre que alguien va a heredar.',
  },
  {
    id: 'retorno', title: 'Retorno', where: 'random',
    text: 'Morir, para Aurel, era un trámite. Caía, se quedaba quieto un instante, y la luz lo levantaba como una marea. Se lo había visto hacer medio mundo.\n\nLo que nadie sabía es cuánto le costaba. No en sangre ni en fuerza: en otra cosa. Cada vez que volvía, algo pequeño se quedaba del otro lado. Un recuerdo, un olor, el nombre de alguien.\n\nPor eso sonreía menos. Por eso miraba tanto hacia el bosque.',
  },
  {
    id: 'velo', title: 'Velo', where: 'random',
    text: 'Hacerse invisible no es desaparecer. Es algo más triste: es seguir ahí, mirando, sin que nadie te mire.\n\nEl Velo te enseña rápido que la mayoría de la gente habla de ti exactamente como temías. Y que algunas personas, muy pocas, siguen hablándote aunque no te vean.\n\nA esas hay que cuidarlas. O temerlas.',
  },
  {
    id: 'mente', title: 'Dominar Mente', where: 'random',
    text: 'Entrar en una mente ajena es como entrar de noche a una casa ajena. Hay cosas fuera de lugar, olores que no reconoces, retratos de gente que no conoces.\n\nY siempre, en algún cuarto, hay una puerta cerrada que el dueño no se atreve a abrir.\n\nLos que dominan mentes aprenden pronto a no abrirla. Los que no aprenden, no salen iguales.',
  },
  {
    id: 'fuerza', title: 'Fuerza Titánica', where: 'random',
    text: 'No es que golpee más fuerte. Es que el mundo pesa menos cuando lo golpea. Un soldado sale volando como un saco de trigo; una puerta se vuelve astillas; un muro, una opinión.\n\nLa Fuerza Titánica también llena de maná a quien la tiene, como si el cuerpo, al romper cosas, se acordara de que es mágico.\n\nAurel la usaba con cuidado, casi con vergüenza. Otros no tendrían ese problema.',
  },
  {
    id: 'afinidad', title: 'Afinidad', where: 'random',
    text: 'Las reliquias eligen. Una espada élfica, en manos de un enano, es solo una espada. Un cáliz de sirena, en boca de un gigante, es solo un vaso.\n\nPero hay gente a la que las reliquias obedecen enteras, sin preguntar de dónde viene. Aurel era así. Los sabios lo llamaban afinidad.\n\nLos herreros de Kharaz tenían otra palabra, más corta y menos amable, y la decían en voz baja.',
  },
  {
    id: 'raiz', title: 'Raíz Profunda', where: 'raiz_profunda',
    text: 'Las raíces del Primer Árbol bajan tanto que tocan algo que respira. Los elfos dicen que es el corazón del bosque. Los enanos, que es una cueva con viento.\n\nLos que bajaron a comprobarlo volvieron callados y con las uñas llenas de tierra tibia. Solo uno habló. Dijo que abajo no había corazón ni viento: que había alguien, sentado en la oscuridad, contando algo en voz baja.\n\nQue no eran días. Que eran lectores.',
  },
  {
    id: 'pozo', title: 'El Pozo de la Luna', where: 'pozo_luna',
    text: 'Hay un pozo en Morvenna que refleja una luna que no está en el cielo. Las brujas bajan cubos para sacar un poco de su luz, que sirve para las pociones de olvido.\n\nNadie sabe de qué luna es el reflejo. Morgaine dice que es la luna de otra vuelta: la de la última vez.\n\nQue por eso tiene otra forma. Que por eso nunca está llena.',
  },
  {
    id: 'torre', title: 'La Torre Invertida', where: 'torre_invertida',
    text: 'La Torre Invertida crece hacia abajo. Sus guardias suben para bajar y bajan para subir, y ninguno se marea porque nacieron ahí.\n\nEn el piso más profundo, que es el más alto, hay una ventana que da a un cielo distinto. Dicen que desde ahí se ve el mundo al revés: los reyes pidiendo limosna, los héroes huyendo, los villanos dando las gracias.',
  },
  {
    id: 'pagina_blanca', title: 'La página en blanco', where: 'random',
    text: 'El Gran Sello es un ritual antiguo: cinco sabios, cinco lunas, una página en blanco. Se escribe alrededor de alguien hasta que no queda nada de él fuera del papel.\n\nLo usaron una vez, dicen, contra algo que ya nadie recuerda. Por eso funcionó.\n\nLo malo de las páginas en blanco es que también se leen. Y lo que se lee, tarde o temprano, vuelve.',
  },
  {
    id: 'sombra', title: 'La sombra', where: 'random', minCycle: 2,
    text: 'Siempre estuvo ahí. En el borde de las cosas, en la neblina de las mañanas, detrás de los hombros de la gente que se da vuelta y no ve nada.\n\nNo es mala. No es buena. Mira.\n\nAlgunos niños la ven una sola vez en la vida, y esa vez les cambia todo. Los adultos la llaman un mal sueño. Los perros no la llaman de ninguna manera: se sientan, mueven la cola y siguen mirando el amanecer.',
  },
  {
    id: 'voz', title: 'La voz', where: 'random', minCycle: 2,
    text: 'Esta historia la cuenta alguien. Al principio parece que no: que las cosas simplemente pasan, una detrás de otra, y que las palabras las siguen como perros.\n\nPero si lees con atención notarás que la voz tiene gustos. Se detiene en ciertos detalles. Se burla de ciertos reyes. Se calla en ciertos momentos.\n\nY a veces, muy de vez en cuando, dice «yo», y luego finge que no lo dijo.',
  },
  {
    id: 'margenes', title: 'Márgenes', where: 'random', minCycle: 2,
    text: 'En los libros viejos, a veces, alguien escribe en los márgenes. Notas, correcciones, una palabra subrayada dos veces. Quien las encuentra no sabe quién las dejó ni cuándo.\n\nPero la letra le resulta familiar. Demasiado familiar. Como si la hubiera escrito uno mismo, en otra lectura del mismo libro, para no cometer los mismos errores.\n\nY luego los cometiera igual.',
  },
  {
    id: 'pluma', title: 'La Pluma', where: 'random', minCycle: 2,
    text: 'Dicen que existe una pluma con la que se escribió el mundo, y que quien la encuentra puede cambiar una sola línea del destino sin pagar nada.\n\nDicen también que nadie la ha encontrado nunca, porque la pluma no se encuentra: se reconoce. Aparece en las manos de quien ya sabe cómo termina la historia.\n\nY esa persona, casi siempre, decide no cambiar nada.',
  },
  {
    id: 'el', title: 'Él', where: 'random', minCycle: 3,
    text: 'Cuando ya no quedaron nombres para él, el mundo usó un pronombre. Él. Así, con mayúscula, como se escribe lo que no se quiere nombrar.\n\nLos sabios discuten si Él es alguien o es algo: una persona que se volvió regla, o una regla que aprendió a caminar. Quizás no importa.\n\nQuizás lo único que importa es que Él recuerda. Y que, en algún lugar, alguien está leyendo esto.\n\nHola.',
  },
];

export const PAGE_BY_ID: Record<string, LorePage> = Object.fromEntries(PAGES.map((p) => [p.id, p]));
