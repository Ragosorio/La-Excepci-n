/**
 * Public types of the audio module. Re-exported by `src/audio/index.ts` —
 * import them from there (`import type { SfxName } from '../audio'`).
 */

export type MusicMood =
  | 'title' | 'prologue' | 'prologue_dark' | 'overworld' | 'overworld_night' | 'location'
  | 'battle' | 'boss' | 'victory_loop' | 'casino' | 'tension' | 'stealth' | 'council'
  | 'ending' | 'void' | 'silence';

export type Region = 'valdoria' | 'sylvaria' | 'kharaz' | 'morvenna' | 'islas' | 'concordia';

export type SfxName =
  | 'ui_click' | 'ui_hover' | 'ui_open' | 'ui_close' | 'ui_error' | 'ui_confirm' | 'ui_tab'
  | 'coin' | 'coins_many' | 'purchase' | 'sell'
  | 'cast_arcane' | 'cast_fire' | 'cast_ice' | 'cast_lightning' | 'cast_light' | 'cast_shadow' | 'cast_mind'
  | 'cast_nature' | 'cast_poison' | 'cast_blood' | 'cast_earth' | 'cast_time' | 'cast_luck'
  | 'whoosh' | 'dash' | 'teleport' | 'hit_light' | 'hit_heavy' | 'hit_magic' | 'punch_launch' | 'explosion'
  | 'shield_block' | 'arrow_shot' | 'arrow_hit' | 'sword_swing' | 'sword_clash' | 'footstep' | 'death_pop'
  | 'ragdoll_thud' | 'heal' | 'buff' | 'debuff' | 'invisibility_on' | 'invisibility_off' | 'mind_control'
  | 'revive' | 'level_up' | 'loot_common' | 'loot_rare' | 'loot_epic' | 'loot_legendary' | 'loot_mythic'
  | 'copy_progress' | 'copy_acquired' | 'dice_roll' | 'dice_land' | 'card_flip' | 'card_deal' | 'chip_place'
  | 'slot_spin' | 'slot_reel_stop' | 'slot_near_miss' | 'slot_win_small' | 'slot_win_big' | 'jackpot'
  | 'wheel_tick' | 'wheel_ball' | 'crowd_cheer' | 'crowd_gasp' | 'crowd_boo' | 'page_turn' | 'quill'
  | 'heartbeat' | 'whisper' | 'bell' | 'horn_war' | 'drum_war' | 'glitch' | 'impact_frame' | 'typewriter'
  | 'narrator' | 'alert_rise' | 'gavel' | 'door' | 'fire_burst' | 'freeze' | 'zap' | 'poison_bubble'
  | 'thunder' | 'bark' | 'step_grass' | 'splash' | 'eat' | 'burp' | 'toad' | 'bomb_fuse' | 'clone' | 'eclipse';

export type StingerName =
  | 'excepcion' | 'victory' | 'defeat' | 'discovery' | 'relic_found' | 'corruption_complete' | 'name_change'
  | 'siempre' | 'death' | 'sealed' | 'jackpot_fanfare' | 'level_up' | 'council_open' | 'nemesis' | 'cycle';

export type Ambience =
  | 'rain' | 'rain_heavy' | 'wind' | 'forest_dawn' | 'night' | 'fire' | 'crowd' | 'casino' | 'sea' | 'swamp' | 'forge' | 'void';

export interface SfxOpts { volume?: number; pitch?: number; pan?: number; }

export type Bus = 'master' | 'music' | 'sfx' | 'ambience';

export interface AudioAPI {
  /** Must be called from a user gesture (first click/keydown). Idempotent. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  music(mood: MusicMood, opts?: { region?: Region; fade?: number }): void;   // crossfade (default 2s); same mood+region = no-op
  sfx(name: SfxName, opts?: SfxOpts): void;                                   // fire-and-forget, never throws, no-op before unlock
  stinger(name: StingerName): void;                                          // short musical phrase; ducks music while playing
  ambience(name: Ambience, on: boolean, volume?: number): void;              // looping beds, fade in/out
  setIntensity(v: number): void;   // 0..1 — adaptive layering (battle/boss/tension add layers: percussion, brass, choir)
  setVolume(bus: 'master' | 'music' | 'sfx' | 'ambience', v: number): void; // 0..1, persisted to localStorage key 'lx.audio'
  getVolume(bus: 'master' | 'music' | 'sfx' | 'ambience'): number;
  setMuted(m: boolean): void;
  duck(amount: number, seconds: number): void;  // temporarily lower music (e.g. during dialogue)
  speak(text: string, opts?: { pitch?: number; rate?: number }): void; // optional Web Speech API (es-ES/es-MX voice), used rarely for the villain's whisper; no-op if unavailable or disabled via setVoiceEnabled
  setVoiceEnabled(on: boolean): void;
}

export const MUSIC_MOODS: readonly MusicMood[] = [
  'title', 'prologue', 'prologue_dark', 'overworld', 'overworld_night', 'location',
  'battle', 'boss', 'victory_loop', 'casino', 'tension', 'stealth', 'council',
  'ending', 'void', 'silence',
];

export const REGIONS: readonly Region[] = ['valdoria', 'sylvaria', 'kharaz', 'morvenna', 'islas', 'concordia'];

export const STINGERS: readonly StingerName[] = [
  'excepcion', 'victory', 'defeat', 'discovery', 'relic_found', 'corruption_complete', 'name_change',
  'siempre', 'death', 'sealed', 'jackpot_fanfare', 'level_up', 'council_open', 'nemesis', 'cycle',
];

export const AMBIENCES: readonly Ambience[] = [
  'rain', 'rain_heavy', 'wind', 'forest_dawn', 'night', 'fire', 'crowd', 'casino', 'sea', 'swamp', 'forge', 'void',
];

export const SFX_NAMES = [
  'ui_click', 'ui_hover', 'ui_open', 'ui_close', 'ui_error', 'ui_confirm', 'ui_tab',
  'coin', 'coins_many', 'purchase', 'sell',
  'cast_arcane', 'cast_fire', 'cast_ice', 'cast_lightning', 'cast_light', 'cast_shadow', 'cast_mind',
  'cast_nature', 'cast_poison', 'cast_blood', 'cast_earth', 'cast_time', 'cast_luck',
  'whoosh', 'dash', 'teleport', 'hit_light', 'hit_heavy', 'hit_magic', 'punch_launch', 'explosion',
  'shield_block', 'arrow_shot', 'arrow_hit', 'sword_swing', 'sword_clash', 'footstep', 'death_pop',
  'ragdoll_thud', 'heal', 'buff', 'debuff', 'invisibility_on', 'invisibility_off', 'mind_control',
  'revive', 'level_up', 'loot_common', 'loot_rare', 'loot_epic', 'loot_legendary', 'loot_mythic',
  'copy_progress', 'copy_acquired', 'dice_roll', 'dice_land', 'card_flip', 'card_deal', 'chip_place',
  'slot_spin', 'slot_reel_stop', 'slot_near_miss', 'slot_win_small', 'slot_win_big', 'jackpot',
  'wheel_tick', 'wheel_ball', 'crowd_cheer', 'crowd_gasp', 'crowd_boo', 'page_turn', 'quill',
  'heartbeat', 'whisper', 'bell', 'horn_war', 'drum_war', 'glitch', 'impact_frame', 'typewriter',
  'narrator', 'alert_rise', 'gavel', 'door', 'fire_burst', 'freeze', 'zap', 'poison_bubble',
  'thunder', 'bark', 'step_grass', 'splash', 'eat', 'burp', 'toad', 'bomb_fuse', 'clone', 'eclipse',
] as const satisfies readonly SfxName[];

// Compile-time guarantee that SFX_NAMES lists every SfxName.
type MissingSfx = Exclude<SfxName, (typeof SFX_NAMES)[number]>;
export const SFX_LIST_COMPLETE: [MissingSfx] extends [never] ? true : MissingSfx = true;
