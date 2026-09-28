/**
 * Society module — shared types (deeds, state slice, council sessions) and the events this module adds.
 * Public types are re-exported from ./api.ts.
 */
import type { ContinentId, CorruptionPath, FactionId, GoodId, JobId, RaceId, TraitId } from '../../data/types';

// ───────────────────────────── Deeds ─────────────────────────────

export type DeedKind =
  | 'terror' | 'manipulate' | 'invest' | 'raid' | 'infiltrate' | 'conquer' | 'liberate' | 'spare' | 'execute'
  | 'rob_caravan' | 'bribe' | 'blackmail' | 'assassinate' | 'gift' | 'trade' | 'recruit' | 'battle_won' | 'battle_lost'
  | 'cheat_caught' | 'relic_stolen' | 'sanctuary' | 'help';

export interface Deed {
  kind: DeedKind;
  location?: string;
  npcId?: string;
  /** 1 = a normal act. 0.3 = small, 3 = huge. */
  magnitude?: number;
  /** Override the default corruption path of this kind. */
  path?: CorruptionPath;
  faction?: FactionId;
  /** Stealthy act (Velo, silent): much less Alert, fewer witnesses, no public news. */
  silent?: boolean;
  /** Override the generated news line. */
  text?: string;
  /** Goods involved (caravans, trade). */
  good?: GoodId;
  /** Continent override when there is no location. */
  continent?: ContinentId;
  /** Do not publish news at all. */
  noNews?: boolean;
}

export interface DeedOutcome {
  corruption?: number;
  alert?: number;
  fear?: number;
  rep?: number;
  news?: string;
  loyalty?: number;
  prosperity?: number;
  path?: CorruptionPath;
  continent?: ContinentId;
  /** Short human-readable consequence chips ("+6% Terror en Valdoria", "Alerta +5"...). */
  lines?: string[];
}

export type Feelings = { miedo: number; odio: number; deuda: number; respeto: number };

// ───────────────────────────── Economy ─────────────────────────────

export type BusinessKind = 'molino' | 'aserradero' | 'mina' | 'taller' | 'taberna' | 'sedas' | 'naviera' | 'cristaleria';

export interface BusinessState { id: string; kind: BusinessKind; location: string; level: number; since: number; invested: number; earned: number }
export interface LoanState { id: string; principal: number; owed: number; rate: number; takenLuna: number; dueLuna: number }
export interface MarketEvent { id: string; text: string; location: string; good: GoodId; mult: number; until: number }
export interface ContractMeta { type: 'entregar' | 'aterrorizar' | 'sobornar' | 'asaltar' | 'asesinar' | 'infiltrar' | 'arena'; location: string; good?: GoodId; npcId?: string; continent?: ContinentId }

// ───────────────────────────── Politics ─────────────────────────────

export interface SessionResult { id: string; passed: boolean; yes: number; no: number; eliasWon: boolean; votes: Record<string, 'si' | 'no' | 'abst'> }

export interface SessionState {
  id: string;
  luna: number;
  resolutions: string[];
  /** Resolution parameters (e.g. embargo target continent). */
  params: Record<string, string>;
  emergency?: boolean;
  status: 'announced' | 'pending' | 'inprogress' | 'resolved';
  results: SessionResult[];
}

// ───────────────────────────── Nemesis ─────────────────────────────

export interface NemesisMeta {
  faction: FactionId;
  continent: ContinentId | null;
  home: string | null;
  unitId: string;
  gender: 'f' | 'm';
  encounters: number;
  kills: number;          // times this captain killed Elias
  fled: number;
  defeats: number;
  promotions: number;
  lastSeen: number;       // luna
  hunting: boolean;
  huntCooldown: number;   // luna before which no new hunt
  echoCycle?: number;     // came back from a previous cycle
  fallen?: boolean;       // defeated, awaiting judgement
  epithets: string[];
}

// ───────────────────────────── Slice ─────────────────────────────

export interface AlertSlice {
  last: number;
  selloActive: boolean;
  selloRemaining: number;
  selloTotal: number;
  lastHunters: number;
  alliance: boolean;
  peak: number;
  lastLoud: number;
  bountyUntil: number;
}

export interface CouncilSlice {
  next: number;                                    // luna of the next ordinary session
  count: number;                                   // sessions held
  session: SessionState | null;                    // announced / pending session
  history: Array<{ luna: number; id: string; passed: boolean; eliasWon: boolean }>;
  boughtVotes: Record<string, number>;             // delegate npc id → session count it is bought for
  delegates: Partial<Record<ContinentId, string>>; // replacements after assassinations
  emptySeat: Partial<Record<ContinentId, number>>; // session count during which the seat is empty
  lastDetected: number;                            // luna Dominar Mente was detected at the Concilio
  queued: string[];                                // resolutions forced into the next agenda
  replacements: Record<string, { continent: ContinentId; gender: 'f' | 'm' }>; // generated delegates
  emergencyDone: boolean;                          // the first-fall emergency session happened
}

export interface SocietyState {
  v: number;
  goods: Record<GoodId, number>;
  goodsCost: Record<GoodId, number>;
  hist: Record<string, Partial<Record<GoodId, number[]>>>;
  events: MarketEvent[];
  businesses: BusinessState[];
  loans: LoanState[];
  bank: { shares: number; sharePrice: number; history: number[]; lastCollectors: number; frozenUntil: number; overdueSince: number; owned: boolean };
  secretsOn: Record<string, number>;
  secretTexts: Record<string, string[]>;
  revealedRelics: Array<{ relic: string; location: string }>;
  sedasBought: { luna: number; count: number };
  alert: AlertSlice;
  council: CouncilSlice;
  nemesis: Record<string, NemesisMeta>;
  nemesisSeq: number;
  pendingJudgement: string[];
  deedLog: Array<{ kind: DeedKind; location?: string; luna: number; npcId?: string }>;
  townsfolkSeq: number;
  contracts: Record<string, ContractMeta>;
  lastLuna: { luna: number; income: number; upkeep: number; unpaid: number; deserters: number; interest: number };
  corruptionMarks: Record<string, number>;
  talked: Record<string, number>;                  // npc id → times talked (this run)
  asked: Record<string, number>;                   // npc id → times asked the year (this run)
  flags: Record<string, number | boolean | string>;
}

/** Unified view over canonical (NpcDef) and generated (nemesis/townsfolk) NPCs. */
export interface NpcView {
  id: string;
  name: string;
  title?: string;
  race: RaceId;
  job: JobId;
  gender: 'f' | 'm' | 'x';
  age: 'child' | 'young' | 'adult' | 'old';
  faction: FactionId;
  home: string;
  traits: TraitId[];
  voice: string;
  role?: string;
  combatUnit?: string;
  generated: boolean;
  canonical: boolean;
}

// ───────────────────────────── Events added by this module ─────────────────────────────

declare module '../../core/events' {
  interface GameEvents {
    /** Reputation changed (HUD/politics). */
    'rep:change': { faction: FactionId; value: number; delta: number; tier: string; prevTier: string };
    /** Corruption changed on a continent (HUD). */
    'corruption:change': { continent: ContinentId; path: CorruptionPath; delta: number; value: number };
    /** A location changed hands (world map visuals). */
    'location:control': { id: string; from: FactionId; to: FactionId };
    /** La Banca sends goblin debt collectors (world: spawn a party). */
    'bank:collectors': { count: number; strength: number; debt: number };
    /** La Casa de las Sedas revealed where a relic is (world map marker). */
    'relic:revealed': { relicId: string; locationId: string };
    /** An NPC became loyal to Elias (dominated / rewritten). */
    'npc:loyal': { npcId: string };
    /** An NPC died (execution, assassination, battle). */
    'npc:died': { npcId: string; by: string };
    /** Every deed applied (story/tracker/achievements hooks). */
    'deed:applied': { deed: Deed; outcome: DeedOutcome };
    /** Luna economy summary. */
    'society:luna': { income: number; upkeep: number; unpaid: number; deserters: number; interest: number };
    /** A named NPC joined the army as a lieutenant. */
    'lieutenant:recruited': { npcId: string; unitUid: string };
    /** The next Concilio session was announced (1 luna before). */
    'concilio:announce': { lunaDue: number; resolutions: string[] };
  }
}
