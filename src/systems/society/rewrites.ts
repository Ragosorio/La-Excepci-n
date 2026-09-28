/**
 * Society-side consequences of Libro de la Realidad rewrites (GDD §4.4). The progression module applies the core
 * effect (ids may carry a target after ':', e.g. 'lider_leal:galvan'); here the world *remembers* it:
 *   lider_leal → the leader's land slides into Intriga; the Concilio seat follows if it is a delegate.
 *   nadie_me_vio → witnesses forget the last lunas; bounties and "magic in the chamber" suspicions vanish.
 *   ejercito_nunca_existio → a mobilized Gran Alianza dissolves; nemeses stop hunting.
 */
import { G } from '../../core/state';
import { addNews } from '../../core/news';
import { track } from '../../core/tracker';
import { addCorruption } from './corruption';
import { displayName, makeLoyal, npcState, npcView } from './memory';
import { isDelegate } from './politics';
import { continentOf, luna, soc } from './state';

export function onRewrite(p: { rewrite: string; sacrifice: string }): void {
  if (!G.run || !p?.rewrite) return;
  const [id, target] = p.rewrite.split(':');
  try {
    if (id === 'lider_leal' || id.includes('leal')) rewriteLoyal(target);
    else if (id === 'ejercito_nunca_existio' || id.includes('ejercito')) rewriteArmy();
    else if (id === 'nadie_me_vio' || id.includes('visto')) rewriteUnseen();
  } catch (err) { console.warn('[society] rewrite', err); }
}

function rewriteLoyal(target?: string): void {
  if (!target || !npcState(target)) return;
  makeLoyal(target, 'reescrito');
  const cont = continentOf(npcView(target)?.home);
  if (cont && cont !== 'concordia') addCorruption(cont, 'intriga', 12, 'El Libro de la Realidad');
  const seat = isDelegate(target);
  if (seat) soc().council.boughtVotes[target] = soc().council.count;
  track('rewrite_loyal');
  addNews(`${displayName(target)} jura que siempre sirvió a ${G.run.player.name}. Los archivos le dan la razón. Nadie recuerda haberlos escrito.`, 'excepcion', true);
}

function rewriteArmy(): void {
  const s = soc();
  const had = s.alert.alliance;
  s.alert.alliance = false;
  for (const m of Object.values(s.nemesis)) m.hunting = false;
  track('rewrite_army');
  if (had) addNews('La Gran Alianza... ¿qué Gran Alianza? Nadie recuerda haber marchado.', 'excepcion', true);
}

function rewriteUnseen(): void {
  const s = soc();
  const l = luna();
  s.alert.bountyUntil = -1;
  s.council.lastDetected = -99;
  for (const st of Object.values(G.run.npcs)) {
    st.memories = st.memories.filter((m) => m.intensity >= 9 || l - m.luna > 3);
  }
  track('rewrite_unseen');
  addNews('Nadie recuerda haber visto a nadie. Los testigos miran sus manos, confundidos.', 'excepcion', true);
}
