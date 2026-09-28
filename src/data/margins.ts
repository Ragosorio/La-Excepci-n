/**
 * Anotaciones al margen — permanent upgrades bought with Tinta between cycles (GDD §4.12).
 * Applied at run init by systems/story/margins.ts (onRunInit('margins', 90)). `{v}` in desc = value at that rank.
 * Costs grow ~1.5× per rank (RESEARCH §1.11).
 *
 * Other modules may read the effects through run flags set at init:
 *   G.run.flags.margin_recruit_discount (0..1), margin_casino_luck (points), margin_alert_mult (0..1),
 *   margin_weakness_revealed (count), margin_relic_hint (location id).
 */
import type { MarginDef } from './types';

export interface StoryMargin extends MarginDef {
  /** Handwritten flavor shown under the card. */
  note: string;
  glyph: 'feather' | 'coin' | 'crown' | 'eclipse' | 'eye' | 'book' | 'skull' | 'moon' | 'mask';
}

export const MARGINS: StoryMargin[] = [
  { id: 'eco', name: 'Eco adicional', desc: '+{v} espacio de Eco al empezar un ciclo.', maxRank: 3, cost: [20, 45, 90], value: [1, 2, 3],
    note: 'Lo que aprendiste no se olvida. Solo se esconde.', glyph: 'eclipse' },
  { id: 'oro', name: 'Tinta dorada', desc: '+{v}% de todo el oro que ganes.', maxRank: 5, cost: [10, 18, 30, 48, 75], value: [10, 20, 30, 40, 50],
    note: 'Los duendes lo llaman interés. Yo lo llamo memoria.', glyph: 'coin' },
  { id: 'reliquia', name: 'Un recuerdo en el bolsillo', desc: 'Empiezas con una reliquia {v}.', maxRank: 3, cost: [25, 55, 110], value: [1, 2, 3],
    note: 'Algo se te quedó de la última vez.', glyph: 'crown' },
  { id: 'retorno', name: 'Otra vuelta', desc: '+{v} carga de Retorno por batalla.', maxRank: 2, cost: [40, 110], value: [1, 2],
    note: 'Morir se aprende. Volver, también.', glyph: 'skull' },
  { id: 'debilidad', name: 'Lectura atenta', desc: 'Revela la debilidad de {v} continente(s) al inicio.', maxRank: 3, cost: [12, 24, 40], value: [1, 2, 3],
    note: 'Subrayado dos veces: «por aquí se rompe».', glyph: 'eye' },
  { id: 'suerte', name: 'Mano de duende', desc: '+{v} de suerte en el casino.', maxRank: 4, cost: [10, 20, 35, 60], value: [2, 4, 6, 9],
    note: '¿Qué onda, patojo? La suerte también se recuerda.', glyph: 'coin' },
  { id: 'reclutas', name: 'Palabra convincente', desc: 'Reclutar cuesta −{v}%.', maxRank: 3, cost: [15, 30, 55], value: [10, 20, 30],
    note: 'La gente sigue a quien parece saber el final.', glyph: 'crown' },
  { id: 'alerta', name: 'Pasos suaves', desc: 'La Alerta del Concilio sube −{v}%.', maxRank: 3, cost: [15, 30, 55], value: [10, 20, 30],
    note: 'Camina por donde ya caminaste. Deja menos huellas.', glyph: 'mask' },
  { id: 'devotos', name: 'Fieles de antes', desc: 'Empiezas con {v} Devotos en tu ejército.', maxRank: 3, cost: [20, 40, 70], value: [3, 5, 8],
    note: 'No saben por qué te siguen. Tú tampoco.', glyph: 'eye' },
  { id: 'ranura', name: 'Manos vacías', desc: '+{v} espacio para equipar reliquias.', maxRank: 1, cost: [60], value: [1],
    note: 'Siempre cabe una más.', glyph: 'crown' },
  { id: 'mana', name: 'Tinta violeta', desc: '+{v} de maná máximo.', maxRank: 4, cost: [10, 20, 35, 55], value: [10, 20, 30, 45],
    note: 'Escribe con lo que te sobra.', glyph: 'feather' },
  { id: 'vida', name: 'Papel grueso', desc: '+{v}% de vida máxima.', maxRank: 4, cost: [10, 20, 35, 55], value: [10, 20, 30, 45],
    note: 'Las páginas gruesas tardan más en romperse.', glyph: 'book' },
  { id: 'esencia', name: 'Esencia guardada', desc: 'Empiezas con {v} de Esencia.', maxRank: 3, cost: [8, 18, 35], value: [40, 100, 200],
    note: 'Un poco de alma, doblada entre páginas.', glyph: 'moon' },
  { id: 'bolsa', name: 'Bolsa olvidada', desc: 'Empiezas con +{v} de oro.', maxRank: 3, cost: [8, 18, 35], value: [150, 400, 900],
    note: 'Estaba en el abrigo. No recuerdas haberla puesto ahí.', glyph: 'coin' },
  { id: 'influencia', name: 'Nombre conocido', desc: 'Empiezas con {v} de Influencia.', maxRank: 3, cost: [10, 22, 40], value: [10, 25, 50],
    note: 'Te conocen. No saben de dónde.', glyph: 'crown' },
  { id: 'secretos', name: 'Lo que sé', desc: 'Empiezas con {v} Secretos.', maxRank: 3, cost: [10, 22, 40], value: [1, 2, 4],
    note: 'Algunas cosas no se olvidan porque nunca se dijeron.', glyph: 'mask' },
];

export const MARGIN_BY_ID: Record<string, StoryMargin> = Object.fromEntries(MARGINS.map((m) => [m.id, m]));

export const RELIC_RARITY_BY_RANK = ['pococomun', 'rara', 'epica'] as const;
export const RELIC_RARITY_LABEL: Record<string, string> = { pococomun: 'poco común', rara: 'rara', epica: 'épica' };
