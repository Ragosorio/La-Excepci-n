/**
 * Casino module entry: registers the 'casino' scene (El Gran Casino / El Casino Clandestino),
 * the casino state slice and the module-level listeners (jackpot growth from world events, arena settlement).
 * Debug: ?scene=casino&game=slots|ruleta|tarot|dados|arena|pozo|final
 */
import './casino.css';
import { registerScene } from '../core/engine';
import './state';
import './systems';
import { CasinoScene } from './scene';

registerScene('casino', () => new CasinoScene());

export { openTresDados } from './api';
