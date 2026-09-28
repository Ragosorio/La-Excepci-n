/**
 * World systems: geography, fresh-run world generation, time (lunas), the living map (parties),
 * encounters, sieges/ruins battles, taverns (contracts + mercenaries).
 *
 * Public API for other modules — see the re-exports below. Most useful:
 *   spawnHunters(n, strength) · spawnNemesis(npcId) · spawnArmy(locId) · spawnAurel() · spawnRival() · spawnRefugees(locId)
 *   spawnCollectors(n, mult, debt) · spawnBandits(loc, captain, race, strength) · spawnParty(init) · removeParty(id)
 *   launchBattle(setup, { onResult, returnTo }) · siegeBattle(loc) · ruinBattle(loc) · partyBattle(party, ambush)
 *   passLunas(n) · skyTime() · phaseName() · isNight() · heightAt(x,z) · continentAt(x,z)
 */
import { bus } from '../../core/events';
import { G } from '../../core/state';
import './state';
import './init';
import { initPartyEvents, removeParty } from './parties';
import { addNews } from '../../core/news';
import { initContractEvents } from './contracts';
import { W } from './state';

initPartyEvents();
initContractEvents();

// Remember political clocks for the HUD / Concordia.
bus.on('concilio:session', ({ lunaDue, resolutions }) => { if (G.hasRun) W().council = { lunaDue, resolutions }; });
bus.on('concilio:resolved', () => { if (G.hasRun && W().council && G.run.luna >= (W().council?.lunaDue ?? 0)) W().council = null; });
bus.on('sello:start', ({ lunas }) => { if (G.hasRun) W().sello = lunas; });
bus.on('sello:progress', ({ remaining }) => { if (G.hasRun) W().sello = remaining; });
bus.on('sello:broken', () => { if (G.hasRun) W().sello = null; });
bus.on('sello:complete', () => { if (G.hasRun) W().sello = null; });
bus.on('state:new-run', () => { if (G.hasRun) G.run.timeScale = 1; });

// Libro de la Realidad: "Este ejército nunca existió" erases the nearest hostile party on the map.
bus.on('reality:rewrite', ({ rewrite }) => {
  if (!G.hasRun || rewrite !== 'ejercito_nunca_existio') return;
  const e = G.run.player.pos;
  const hostile = W().parties.filter((p) => p.hostile || p.kind === 'ejercito' || p.kind === 'alianza' || p.kind === 'cazadores' || p.kind === 'nemesis');
  const target = hostile.sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
  if (!target) return;
  G.run.flags.reality_army_erased = Number(G.run.flags.reality_army_erased ?? 0) + 1;
  addNews(`${target.name} desapareció del camino. Nadie recuerda haberlo visto partir. Nadie recuerda que existiera.`, 'excepcion', true);
  removeParty(target.id);
});

export { W, factionColor, factionName, FACTION_COLOR, PARTY_LABEL } from './state';
export type { PartyState, PartyKind, WorldModule } from './state';
export {
  spawnParty, spawnCaravan, spawnPatrol, spawnHunters, spawnNemesis, spawnRival, spawnRefugees, spawnArmy, spawnAurel,
  spawnAlliance, spawnBandits, spawnCollectors, removeParty, getParty,
} from './parties';
export { LUNA_SECONDS, passLunas, skyTime, phaseName, phaseGlyph, isNight, nightFactor, setSpeed, setPaused, togglePause, isPaused } from './time';
export { heightAt, surfaceAt, isWater, continentAt, locationHeight } from './geo';
export { armyPower, totalPower, eliasPower, composeForce, armyUpkeep } from './forces';
export { launchBattle, siegeBattle, ruinBattle, partyBattle, respawnAtSanctuary, nearestSanctuary } from './battles';
export { tavernState, takeContract, hireMerc } from './contracts';
