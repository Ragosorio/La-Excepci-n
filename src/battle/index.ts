// Battle module: TABS-style battles, Elias' action combat, deployment, results, scripting, arena spectator.
import { registerScene } from '../core/engine';
import { BattleScene } from './scene';

registerScene('battle', () => new BattleScene());
