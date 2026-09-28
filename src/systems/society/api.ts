/**
 * PUBLIC CONTRACT of the society module, used by world/battle/casino/story. Signatures are stable; more exports added.
 *
 *   applyDeed({ kind: 'terror', location: 'vado_trigo' })        → consequences + summary
 *   talkTo('tiburcio') · talkTo('townsfolk:vado_trigo')          → full conversation UI
 *   openMarket(loc) · openSedas(loc) · openBank()                → service UIs
 *   captainsFor({ faction: 'kharaz', count: 2 })                 → named nemesis captains for a battle
 *   alertState() · councilStatus() · attendCouncil()             → HUD / Concordia menu
 *   shipGoods(from, to, good, qty) · bestCaravanRoute()          → caravans
 *   generateContract(loc)                                        → tavern contract for addQuest()
 */
export type { DeedKind, Deed, DeedOutcome, Feelings, NpcView, SessionState } from './types';

// deeds, corruption, reputation
export { applyDeed, deedToast, recentDeedsAt } from './deeds';
export { addCorruption, corruptionInfo, bestPath, setControl } from './corruption';
export { changeRep, changeRepContinent, repValue, repTier, repPriceMult, factionName, factionColor, REP_TIERS, REP_FACTIONS } from './factions';

// NPCs, memory, conversations
export { remember, feel, npcsAt, moveNpc, killNpc, makeLoyal, npcView, npcState, portraitFor, moodFor, topMemory, hasMemory, displayName } from './memory';
export { npcGreeting, yearAnswer, rumorLine } from './greetings';
export { talkTo, judgeCaptives, judgeCaptive } from './dialogue';

// nemesis
export { captainsFor, pendingCaptives, nemesisTaunt, addLieutenant, fullName as nemesisName, startHunt } from './nemesis';

// economy & services
export { priceOf, shipGoods, bestCaravanRoute, generateContract, goodInfo, marketShock, cargoUsed, cargoCap } from './economy';
export { armyUpkeep, totalDebt, businessIncome } from './finance';
export { openMarket } from './market';
export { openSedas, revealWeakness, revealRelic } from './sedas';
export { openBank } from './bank';

// alert & politics
export { alertState, type AlertState } from './alert';
export { attendCouncil, councilStatus, delegates as councilDelegates } from './politics';
