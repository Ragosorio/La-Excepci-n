/**
 * Bienes comerciables (GDD §4.8). Canonical export: GOODS.
 * `base` = reference price in gold per unit; the economy moves it with stock/target and events.
 * `icon` = icon name for ui/art `icon()` (same as the good id; the art module maps it).
 */
import type { GoodId } from './types';

export interface GoodDef { id: GoodId; name: string; base: number; icon: string; desc: string; plural?: string; color?: string; volatility?: number }

export const GOODS: Record<GoodId, GoodDef> = {
  grano: { id: 'grano', name: 'Grano', plural: 'sacos de grano', base: 8, icon: 'grano', color: '#e8c46a', volatility: 0.25,
    desc: 'Trigo dorado de Valdoria. Si arde una cosecha, el mundo entero lo siente en el estómago.' },
  madera: { id: 'madera', name: 'Madera', plural: 'troncos', base: 12, icon: 'madera', color: '#9e7a50', volatility: 0.2,
    desc: 'Madera de Sylvaria que recuerda haber sido árbol. Los elfos solo venden la que se cae sola… dicen.' },
  hierro: { id: 'hierro', name: 'Hierro', plural: 'lingotes de hierro', base: 18, icon: 'hierro', color: '#9aa0a8', volatility: 0.25,
    desc: 'Lingotes de Kharaz, con el sello del Yunque. Sin hierro no hay espadas, ni cerraduras, ni reyes.' },
  especias: { id: 'especias', name: 'Especias', plural: 'fardos de especias', base: 26, icon: 'especias', color: '#e2703a', volatility: 0.35,
    desc: 'Pimienta de fuego, canela de las islas y un chile que los duendes llaman "el chilero". Pica hasta el alma.' },
  seda: { id: 'seda', name: 'Seda', plural: 'rollos de seda', base: 34, icon: 'seda', color: '#c0407a', volatility: 0.3,
    desc: 'Seda de las Islas y de la Casa de las Sedas. Suave como un secreto bien guardado.' },
  pociones: { id: 'pociones', name: 'Pociones', plural: 'cajas de pociones', base: 30, icon: 'pocion', color: '#8dff5a', volatility: 0.3,
    desc: 'Pociones de Morvenna en frascos con etiquetas escritas a mano. "Agítese antes de usar. No se mire directamente."' },
  gemas: { id: 'gemas', name: 'Gemas', plural: 'bolsas de gemas', base: 60, icon: 'gema', color: '#7fe3ff', volatility: 0.4,
    desc: 'Gemas talladas bajo la montaña. Los enanos las cuentan dos veces; los duendes, tres.' },
  cristal: { id: 'cristal', name: 'Maná cristalizado', plural: 'cristales de maná', base: 48, icon: 'cristal', color: '#9b5cff', volatility: 0.45,
    desc: 'Savia de maná de Sylvaria endurecida en cristal violeta. Zumba bajito si lo acercas al oído.' },
};

export const GOOD_IDS: GoodId[] = ['grano', 'madera', 'hierro', 'especias', 'seda', 'pociones', 'gemas', 'cristal'];
