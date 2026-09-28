/**
 * Hazañas (achievements). Each grants Tinta (meta currency) when unlocked.
 * `when` is a declarative condition evaluated by systems/story/achievements.ts; ids without `when` are unlocked by code
 * (story events: revive, endings, idle, reloads...). Secret ones show as "???" until unlocked.
 */
import type { AchievementDef } from './types';

export interface AchievementCond {
  /** Tracker key in G.run.stats / G.meta.stats (scope). */
  stat?: string;
  /** Max-value record in G.meta.records. */
  record?: string;
  /** Meta counters. */
  meta?: 'cyclesCompleted' | 'currentCycle' | 'pages';
  scope?: 'run' | 'meta';
  gte: number;
}

export interface StoryAchievement extends AchievementDef {
  when?: AchievementCond;
  glyph?: 'eclipse' | 'skull' | 'coin' | 'eye' | 'book' | 'crown' | 'dog' | 'moon' | 'sword' | 'mask' | 'feather';
}

export const ACHIEVEMENTS: StoryAchievement[] = [
  { id: 'excepto_que_no', name: 'Excepto que no', desc: 'Muere en Concordia… y levántate.', ink: 5, glyph: 'eclipse' },
  { id: 'primera_victoria', name: 'Primera tinta', desc: 'Gana tu primera batalla.', ink: 5, glyph: 'sword', when: { stat: 'battles_won', scope: 'meta', gte: 1 } },
  { id: 'veterano', name: 'Veterano', desc: 'Gana 50 batallas.', ink: 20, glyph: 'sword', when: { stat: 'battles_won', scope: 'meta', gte: 50 } },
  { id: 'primer_siervo', name: 'Un primer siervo', desc: 'Consigue tu primera unidad.', ink: 5, glyph: 'crown' },
  { id: 'legion', name: 'Legión', desc: 'Ten 25 unidades a la vez.', ink: 15, glyph: 'crown' },
  { id: 'primera_caida', name: 'La primera caída', desc: 'Corrompe un continente.', ink: 15, glyph: 'eclipse' },
  { id: 'cinco_de_cinco', name: 'Cinco de cinco', desc: 'Corrompe los cinco continentes en un mismo ciclo.', ink: 40, glyph: 'eclipse' },
  { id: 'eclipse', name: 'Eclipse', desc: 'Une a Aurora y Nocturna.', ink: 25, glyph: 'moon' },
  { id: 'lectura_prohibida', name: 'Lectura prohibida', desc: 'Reúne ambos libros en un mismo ciclo.', ink: 25, glyph: 'book' },
  { id: 'el', name: 'Él', desc: 'Llega al final.', ink: 50, glyph: 'eye' },
  { id: 'siempre', name: 'Siempre estuve viéndote', desc: 'Di la última línea.', ink: 10, glyph: 'eye', secret: true },
  { id: 'pagina_en_blanco', name: 'Página en blanco', desc: 'Termina un ciclo encerrado en el Gran Sello.', ink: 15, glyph: 'book' },
  { id: 'pagina_rota', name: 'Página rota', desc: 'Rompe el Gran Sello antes de que te encierre.', ink: 20, glyph: 'book' },
  { id: 'alba_robada', name: 'El Alba', desc: 'Copia la luz de la mano de Aurel.', ink: 30, glyph: 'eclipse' },
  { id: 'coleccionista', name: 'Coleccionista de golpes', desc: 'Copia 10 habilidades.', ink: 15, glyph: 'eclipse', when: { stat: 'abilities_copied', scope: 'meta', gte: 10 } },
  { id: 'codice_abierto', name: 'Códice abierto', desc: 'Copia 30 habilidades.', ink: 30, glyph: 'eclipse', when: { stat: 'abilities_copied', scope: 'meta', gte: 30 } },
  { id: 'morir_es_facil', name: 'Morir es fácil', desc: 'Muere 10 veces.', ink: 10, glyph: 'skull', when: { stat: 'deaths', scope: 'meta', gte: 10 } },
  { id: 'siete_vidas', name: 'Siete vidas', desc: 'Vuelve con Retorno 7 veces.', ink: 10, glyph: 'skull', when: { stat: 'revivals', scope: 'meta', gte: 7 } },
  { id: 'la_casa_gana', name: 'La casa siempre gana', desc: 'Pierde 5.000 monedas en una sola apuesta.', ink: 10, glyph: 'coin', when: { record: 'gamble_biggest_loss', gte: 5000 } },
  { id: 'excepcional', name: '¡EXCEPCIONAL!', desc: 'Gana 10.000 monedas en una sola apuesta.', ink: 20, glyph: 'coin', when: { record: 'gamble_biggest_win', gte: 10000 } },
  { id: 'noche_larga', name: 'Una noche larga', desc: 'Apuesta 20.000 monedas en total.', ink: 10, glyph: 'coin', when: { stat: 'gold_gambled', scope: 'meta', gte: 20000 } },
  { id: 'tahur', name: 'Tahúr', desc: 'Haz trampa 10 veces.', ink: 15, glyph: 'mask', when: { stat: 'cheats', scope: 'meta', gte: 10 } },
  { id: 'ojos_de_la_casa', name: 'Los Ojos de la Casa', desc: 'Que te atrapen haciendo trampa.', ink: 5, glyph: 'eye', when: { stat: 'cheats_caught', scope: 'meta', gte: 1 } },
  { id: 'titiritero', name: 'Titiritero', desc: 'Domina 25 mentes.', ink: 15, glyph: 'eye', when: { stat: 'minds_dominated', scope: 'meta', gte: 25 } },
  { id: 'piedad', name: 'Piedad calculada', desc: 'Perdona a 10 enemigos.', ink: 10, glyph: 'feather', when: { stat: 'spared', scope: 'meta', gte: 10 } },
  { id: 'sin_discursos', name: 'Sin discursos', desc: 'Ejecuta a 10 enemigos.', ink: 10, glyph: 'skull', when: { stat: 'executed', scope: 'meta', gte: 10 } },
  { id: 'nadie_me_ha_visto', name: 'Nadie me ha visto', desc: 'Pasa cinco minutos invisible.', ink: 10, glyph: 'mask', when: { stat: 'invisible_seconds', scope: 'meta', gte: 300 } },
  { id: 'miedo_respeto', name: 'El miedo es respeto', desc: 'Siembra el terror 10 veces.', ink: 10, glyph: 'skull', when: { stat: 'terror_acts', scope: 'meta', gte: 10 } },
  { id: 'rencores', name: 'Rencores', desc: 'Mata a 3 capitanes con nombre.', ink: 10, glyph: 'sword', when: { stat: 'nemesis_killed', scope: 'meta', gte: 3 } },
  { id: 'tesorero', name: 'Tesorero', desc: 'Ten 10.000 monedas a la vez.', ink: 10, glyph: 'coin' },
  { id: 'tinta_roja', name: 'Tinta roja', desc: 'Debe más de 5.000 monedas a la Banca.', ink: 5, glyph: 'coin', secret: true },
  { id: 'relicario', name: 'Relicario', desc: 'Posee 10 reliquias a la vez.', ink: 15, glyph: 'crown' },
  { id: 'mitico', name: 'Mítico', desc: 'Obtén una reliquia mítica.', ink: 20, glyph: 'crown' },
  { id: 'mesa_de_cinco', name: 'La mesa de los cinco', desc: 'Sobrevive a tres sesiones del Concilio.', ink: 10, glyph: 'crown' },
  { id: 'aritmetica', name: 'Aritmética', desc: 'Huye de Aurel.', ink: 5, glyph: 'sword', secret: true },
  { id: 'visita', name: 'Visita', desc: 'Vuelve al borde del bosque de la bruma.', ink: 5, glyph: 'dog', secret: true },
  { id: 'te_fuiste', name: 'Te fuiste', desc: 'Deja al mundo esperándote.', ink: 5, glyph: 'eye', secret: true },
  { id: 'insomnio', name: 'Insomnio', desc: 'Juega entre la una y las cinco de la madrugada.', ink: 5, glyph: 'moon', secret: true },
  { id: 'recargar', name: 'Recargar no borra', desc: 'Recarga la página en mitad de una batalla.', ink: 5, glyph: 'eye', secret: true },
  { id: 'dudaste', name: 'Dudaste', desc: 'Abre el Libro de la Realidad y ciérralo sin escribir.', ink: 5, glyph: 'book', secret: true },
  { id: 'deja_vu', name: 'Déjà vu', desc: 'Empieza un segundo ciclo.', ink: 10, glyph: 'feather', when: { meta: 'currentCycle', gte: 2 } },
  { id: 'otra_vez_tu', name: 'Otra vez tú', desc: 'Empieza un tercer ciclo.', ink: 15, glyph: 'feather', when: { meta: 'currentCycle', gte: 3 } },
  { id: 'lector', name: 'Lector', desc: 'Encuentra 10 páginas del Libro.', ink: 15, glyph: 'book', when: { meta: 'pages', gte: 10 } },
  { id: 'el_libro_entero', name: 'El libro entero', desc: 'Encuentra 30 páginas del Libro.', ink: 40, glyph: 'book', when: { meta: 'pages', gte: 30 } },
  { id: 'saltar', name: 'Ya sabes cómo termina', desc: 'Salta el prólogo.', ink: 2, glyph: 'feather', secret: true },
];

export const ACHIEVEMENT_BY_ID: Record<string, StoryAchievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
