/** Mood -> Piece factory. */
import type { MusicMood, Region } from '../types';
import { BattlePiece } from './battle';
import { CasinoPiece } from './casino';
import { EndingPiece, ProloguePiece, TitlePiece, VoidPiece } from './cinematic';
import { CouncilPiece, TensionPiece, VictoryPiece } from './drama';
import { ExplorePiece, exploreStyle } from './explore';
import type { MusicHost, Piece } from './piece';

export type { MusicHost, Piece } from './piece';

/** Moods whose sound depends on the region. */
export function regionMatters(mood: MusicMood): boolean {
  return (
    mood === 'overworld' || mood === 'overworld_night' || mood === 'location' || mood === 'battle' || mood === 'boss' ||
    mood === 'victory_loop' || mood === 'tension' || mood === 'stealth'
  );
}

export function createPiece(host: MusicHost, mood: MusicMood, region: Region, seed: number): Piece | null {
  switch (mood) {
    case 'title':
      return new TitlePiece(host, mood, region, seed);
    case 'prologue':
    case 'prologue_dark':
      return new ProloguePiece(host, mood, region, seed);
    case 'overworld':
    case 'overworld_night':
    case 'location':
      return new ExplorePiece(host, mood, region, seed, exploreStyle(mood, region));
    case 'battle':
    case 'boss':
      return new BattlePiece(host, mood, region, seed);
    case 'victory_loop':
      return new VictoryPiece(host, mood, region, seed);
    case 'casino':
      return new CasinoPiece(host, mood, 'islas', seed);
    case 'tension':
    case 'stealth':
      return new TensionPiece(host, mood, region, seed);
    case 'council':
      return new CouncilPiece(host, mood, 'concordia', seed);
    case 'ending':
      return new EndingPiece(host, mood, region, seed);
    case 'void':
      return new VoidPiece(host, mood, region, seed);
    case 'silence':
    default:
      return null;
  }
}
