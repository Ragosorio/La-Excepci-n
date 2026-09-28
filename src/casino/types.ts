/** Casino-internal contracts between the scene (host) and each game view. */
import type { GameId } from './state';
import type { CasinoHud } from './hud';
import type { Focus } from './lobby3d';
import type { PortraitMood } from '../ui/art/portraits';

export interface CasinoHost {
  readonly hud: CasinoHud;
  readonly clandestino: boolean;
  /** Close the current game and return to the lobby. */
  back(): void;
  celebrate(level: 1 | 2 | 3): void;
  gloat(): void;
  tension(v: number): void;
  shake(a: number): void;
  focus(f: Focus): void;
  /** Quick speech bubble from Don Tiburcio (or the host of the speakeasy). */
  say(text: string, opts?: { mood?: PortraitMood; ms?: number }): void;
  /** Los Ojos de la Casa caught you: runs the security flow and closes the game. */
  caught(game: GameId, why: string): Promise<void>;
  /** Speakeasy raid roll (clandestino only). Returns true when a raid interrupted the round. */
  raidCheck(game: GameId, stake: number): Promise<boolean>;
  setBoard(lines: string[]): void;
  /** Leave the casino scene entirely (e.g. to a battle). */
  readonly leaving: boolean;
}

export interface GameCtx {
  host: CasinoHost;
  root: HTMLElement;
  params: Record<string, unknown>;
  /** False once the game view was closed (async flows must stop touching the DOM/state). */
  alive(): boolean;
}

export interface GameView {
  /** Real-time update (seconds). */
  update?(dt: number): void;
  close(): void;
  /** Return true when the key was handled (prevents the lobby/menu from reacting). */
  onKey?(e: KeyboardEvent): boolean;
}

export type GameOpener = (ctx: GameCtx) => GameView;
