/**
 * La Apuesta Final — Don Tiburcio in person. Best of three heads-up Dados Mentirosos (3 dice each).
 * Stake: 10.000 de oro, or a relic (épica+), or "un año de tu vida" (he laughs: nobody counts years).
 * Prize: El Libro de la Realidad (grantRelic('libro_realidad', { reveal: true }) + flag libro_realidad_casino).
 * Dim lights, spotlight, letterbox, crowd gasps and cut-ins.
 */
import { h } from '../../ui/dom';
import { audio } from '../../audio';
import { engine } from '../../core/engine';
import { fmt } from '../../core/math';
import { G } from '../../core/state';
import { bus } from '../../core/events';
import { track } from '../../core/tracker';
import { addNews } from '../../core/news';
import { dialogue } from '../../ui/dialogue';
import { cutin, banner } from '../../ui/toasts';
import { narrate } from '../../ui/narrator';
import { portraitSVG } from '../../ui/art/portraits';
import { RELICS } from '../../data/relics';
import { grantRelic, removeRelic } from '../../systems/progression/relics';
import { remember, feel } from '../../systems/society/api';
import { cs, bet as takeBet, settle, luna, gold, persist } from '../state';
import { relicArt, rarityColor } from '../art';
import { coinRain, confettiBurst } from '../fx2d';
import { gameHeader } from '../ui';
import { TIB } from '../tiburcio';
import { LiarsTable, type Seat } from './liars';
import type { GameCtx, GameView } from '../types';

const STAKE_GOLD = 10000;
const TIB_SEAT: Seat = {
  id: 'tiburcio', name: 'Don Tiburcio', title: 'Gran Banquero de las Islas', grudge: 0,
  persona: { threshold: 0.44, bluff: 0.3, temperature: 0.1, exact: 0.18, perception: 0.95, read: 0.07 },
  portrait: (m) => portraitSVG(TIB(m === 'mind' ? 'mind' : m), 96),
  lines: {
    think: ['Mmm… patojo, patojo…', 'Se te ve en la cara, ¿sabías?', 'Tranquilo. Respirá.'],
    bid: ['Subo. Con cariño.', 'Ahí te va, mago.', 'Veamos de qué estás hecho.', 'La casa sube.'],
    liar: ['¡MENTIROSO! Y lo digo con todo el respeto.', '¡Ja! Eso no te lo creés ni vos.'],
    exact: ['Exacto. Como una cuenta bien llevada.'],
    lose: ['¡A la gran!', 'Uy… eso me dolió en la bóveda.'], win: ['La casa siempre gana, patojo.'], out: ['…Bien jugado. Bien jugado.'],
    caught: ['¡Ja! Mi monóculo es de vidrio antimagia, patojo. Te vi.', '¿Magia en MI mesa? Qué poca educación.'],
  },
};

export function openFinal(ctx: GameCtx): GameView {
  const { host } = ctx;
  const s = cs();
  let table: LiarsTable | null = null;
  let stake: { kind: 'gold'; amount: number } | { kind: 'relic'; uid: string; id: string } | null = null;
  let playing = false;
  let myWins = 0, hisWins = 0;

  const body = h('div', { class: 'cs-fn' });
  let bigTib: HTMLElement | null = null;
  const mood = (m: Parameters<typeof TIB>[0]) => { if (bigTib) bigTib.innerHTML = portraitSVG(TIB(m), 360); };
  /** Tiburcio speaks across the table: the big portrait carries his mood (no duplicate in the dialogue box). */
  const tib = async (lines: Array<[Parameters<typeof TIB>[0], string]>) => {
    for (const [m, text] of lines) { mood(m); await dialogue.say({ speaker: 'Don Tiburcio', title: 'Gran Banquero de las Islas', portrait: bigTib ? null : TIB(m), text }); }
  };
  const score = h('div', { class: 'cs-fn-score' });
  const root = h('div', { class: 'cs-game cs-final' }, h('div', { class: 'cs-fn-spot' }),
    gameHeader('final', 'La Apuesta Final', 'Don Tiburcio en persona', () => host.back()), score, body);
  ctx.root.appendChild(root);

  // mood: dim lights, letterbox, tension music, crowd murmurs
  host.tension(1);
  host.focus('final');
  engine.pipeline.setLetterbox(1);
  engine.pipeline.setGrade({ vignette: 0.95, saturation: 1.05 });
  audio.music('tension');
  audio.ambience('crowd', true, 0.35);

  const renderScore = () => {
    const pip = (n: number) => Array.from({ length: 2 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
    score.innerHTML = playing ? `<span class="me">Tú <b>${pip(myWins)}</b></span><span class="vs">AL MEJOR DE TRES</span><span class="him"><b>${pip(hisWins)}</b> Don Tiburcio</span>` : '';
  };

  function ownedRelics(): Array<{ uid: string; id: string; name: string; rarity: string; shape: string }> {
    return (G.run.player.relics ?? []).map((r) => ({ uid: r.uid, id: r.id, def: RELICS[r.id] }))
      .filter((x) => x.def && ['epica', 'legendaria', 'mitica'].includes(x.def.rarity) && x.id !== 'libro_realidad')
      .map((x) => ({ uid: x.uid, id: x.id, name: x.def!.name, rarity: x.def!.rarity, shape: x.def!.shape }));
  }

  async function intro(): Promise<void> {
    body.innerHTML = '';
    bigTib = h('div', { class: 'cs-fn-tib', html: portraitSVG(TIB('smug'), 360) });
    body.append(bigTib);
    if (s.final.won) {
      await tib([['sad', 'Ya te llevaste mi Libro, patojo. ¿Qué más querés? ¿Mi sombrero? …No. El sombrero no.']]);
      host.back();
      return;
    }
    if (s.final.played > 0 && luna() - s.final.lastLuna < 1) {
      await tib([['smug', 'Una Apuesta Final por luna, patojo. Volvé cuando la luna cambie… y traé más valor. O más oro.']]);
      host.back();
      return;
    }
    await tib([
      ['smug', s.final.played ? '¿Otra vez vos? Me gusta la gente que no aprende. Es la que más paga.' : 'Así que querés *La Apuesta Final*. El Libro de la Realidad: la página que reescribe lo que sea… si pagás lo que pide.'],
      ['smile', 'Vos y yo. Dados Mentirosos, tres dados cada uno, al mejor de tres partidas. Sin crupieres, sin tahúres. Solo la casa… y la excepción.'],
    ]);
    if (!ctx.alive()) return;
    await chooseStake();
  }

  async function chooseStake(): Promise<void> {
    const relics = ownedRelics();
    mood('smug');
    const choice = await dialogue.ask({ speaker: 'Don Tiburcio', portrait: bigTib ? null : TIB('smug'), text: '¿Y qué ponés sobre la mesa, patojo?' }, [
      { id: 'gold', text: `Diez mil de oro (${fmt(STAKE_GOLD)})`, disabled: gold() < STAKE_GOLD, hint: gold() < STAKE_GOLD ? `Tienes ${fmt(gold())}` : '' },
      { id: 'relic', text: 'Una de mis reliquias', disabled: !relics.length, hint: relics.length ? `${relics.length} disponibles` : 'Épica o mejor' },
      { id: 'year', text: 'Un año de mi vida' },
      { id: 'leave', text: 'Mejor no. Todavía no.' },
    ]);
    if (!ctx.alive()) return;
    if (choice === 'year') {
      audio.sfx('crowd_gasp');
      await tib([
        ['surprised', '¿Un año? ¿UN AÑO? ¡JAJAJAJA! ¿Y de dónde vas a sacar uno, patojo?'],
        ['smile', 'Aquí nadie cuenta los años. Un día dejamos de contar. No acepto moneda que no existe… ni siquiera de vos.'],
      ]);
      G.run.flags.offered_a_year = true;
      track('offered_a_year');
      return chooseStake();
    }
    if (choice === 'leave') { host.back(); return; }
    if (choice === 'relic') {
      mood('smug');
      const pick = await dialogue.ask({ speaker: 'Don Tiburcio', portrait: bigTib ? null : TIB('smug'), text: 'A ver, a ver… mostrame esas joyitas.' },
        [...relics.slice(0, 5).map((r) => ({ id: r.uid, text: `${r.name}`, hint: r.rarity })), { id: 'back', text: 'Pensándolo bien…' }]);
      if (pick === 'back' || !ctx.alive()) return chooseStake();
      const r = relics.find((x) => x.uid === pick);
      if (!r) return chooseStake();
      stake = { kind: 'relic', uid: r.uid, id: r.id };
    } else {
      if (!takeBet('final', STAKE_GOLD)) return chooseStake();
      stake = { kind: 'gold', amount: STAKE_GOLD };
    }
    await match();
  }

  async function match(): Promise<void> {
    s.final.played++;
    s.final.lastLuna = luna();
    playing = true;
    myWins = 0; hisWins = 0;
    renderScore();
    audio.sfx('crowd_gasp');
    await cutin({ portrait: portraitSVG(TIB('smug'), 520), title: 'LA APUESTA FINAL', subtitle: stake?.kind === 'gold' ? `${fmt(STAKE_GOLD)} DE ORO CONTRA EL LIBRO` : 'UNA RELIQUIA CONTRA EL LIBRO', colors: ['#2a0610', '#e2455b'], side: 'left', duration: 1.8 });
    for (let game = 1; myWins < 2 && hisWins < 2; game++) {
      if (!ctx.alive()) return;
      if (game > 1) {
        await cutin({ portrait: portraitSVG(TIB(hisWins > myWins ? 'smug' : 'angry'), 520), title: game === 3 ? '¡LA DECISIVA!' : `PARTIDA ${game}`, subtitle: `TÚ ${myWins} — ${hisWins} DON TIBURCIO`, colors: ['#1a0616', '#9b5cff'], side: game % 2 ? 'left' : 'right', duration: 1.5 });
      }
      body.innerHTML = '';
      bigTib = null;
      const tbl = new LiarsTable({
        root: body, seats: [TIB_SEAT], dice: 3, alive: () => ctx.alive(), cheats: true, dramatic: true,
        onCaught: () => void caught(),
        onEvent: (e, who) => { if (e === 'reveal') host.tension(1); if (e === 'lose_die') { audio.sfx(who === 'player' ? 'crowd_gasp' : 'crowd_cheer', { volume: 0.5 }); host.shake(0.3); } },
      });
      table = tbl;
      const r = await tbl.play();
      table = null;
      if (!ctx.alive() || r.quit || r.caught) return;
      if (r.winner === 'player') { myWins++; audio.sfx('crowd_cheer'); host.celebrate(1); }
      else { hisWins++; audio.sfx('crowd_boo', { volume: 0.4 }); }
      renderScore();
      tbl.dispose();
    }
    playing = false;
    if (myWins >= 2) await victory(); else await defeat();
  }

  async function caught(): Promise<void> {
    playing = false;
    if (stake?.kind === 'gold') settle('final', STAKE_GOLD, 0);
    else if (stake?.kind === 'relic') loseRelic(stake.uid);
    stake = null;
    try { remember('tiburcio', { kind: 'enganado', text: 'Me hizo trampa en La Apuesta Final, en mi propia mesa', where: 'puerto_fortuna', intensity: 9 }); } catch { /* stub */ }
    await host.caught('final', 'Hiciste trampa en la mesa de Don Tiburcio');
  }

  function loseRelic(uidv: string): void {
    const p = G.run.player;
    // removeRelic keeps books/equip state consistent and emits relic:lost
    removeRelic(uidv, 'otro');
    p.loadout.relics = p.loadout.relics.map((u) => (u === uidv ? null : u));
    persist();
  }

  async function victory(): Promise<void> {
    host.tension(0);
    engine.pipeline.setLetterbox(0);
    audio.sfx('crowd_cheer'); audio.stinger('jackpot_fanfare');
    engine.pipeline.impact(3, 0);
    engine.pipeline.flash('#ffe9a8', 0.6, 0.9);
    host.celebrate(3);
    void coinRain(300, 4000, { confetti: true, gems: true });
    confettiBurst(window.innerWidth / 2, window.innerHeight * 0.4, 120);
    await cutin({ portrait: portraitSVG({ seed: 'elias', race: 'excepcion', special: 'elias', mood: 'smug', glowEyes: true }, 520), title: '¡EL LIBRO ES MÍO!', subtitle: 'LA EXCEPCIÓN LE GANÓ A LA CASA', colors: ['#1a0b33', '#f5d99a'], side: 'right', duration: 1.8 });
    if (stake?.kind === 'gold') settle('final', STAKE_GOLD, STAKE_GOLD, { noStreak: true, noBonus: true });
    track('casino_wins');
    stake = null;
    s.final.won = true;
    G.run.flags.libro_realidad_casino = true;
    bus.emit('casino:final', { won: true });
    addNews('¡Don Tiburcio perdió La Apuesta Final! Dicen que el Libro de la Realidad salió de la Bóveda en manos de un mago pálido.', 'casino', true);
    try { remember('tiburcio', { kind: 'humillado', text: 'Me ganó La Apuesta Final y se llevó el Libro de la Realidad', where: 'puerto_fortuna', intensity: 10 }); feel('tiburcio', { respeto: 25, miedo: 10 }); } catch { /* stub */ }
    await dialogue.say([
      { speaker: 'Don Tiburcio', portrait: TIB('surprised'), text: '…¡A la gran! …¡A LA GRAN!' },
      { speaker: 'Don Tiburcio', portrait: TIB('sad'), text: 'Está bien. Está bien. Un trato es un trato, y la Banca siempre paga sus deudas… aunque le duela el alma. El Libro es tuyo, patojo.' },
    ]);
    let granted = false;
    try { granted = !!grantRelic('libro_realidad', { reveal: true, where: 'puerto_fortuna' }); } catch { granted = false; }
    if (granted) bus.emit('casino:relic', { relicId: 'libro_realidad', source: 'final' });
    else void banner('EL LIBRO DE LA REALIDAD', 'La Apuesta Final es tuya', { kind: 'jackpot', duration: 3 });
    void narrate({ third: 'Elias sostuvo el Libro de la Realidad. Pesaba menos de lo que debería. Las cosas importantes siempre pesan menos.', first: 'Sostuve el Libro de la Realidad. Pesaba menos de lo que debería. Las cosas importantes siempre pesan menos.' });
    body.innerHTML = '';
    body.append(h('div', { class: 'cs-fn-end won' }, h('div', { class: 'cs-fn-end-t' }, 'EL LIBRO ES TUYO'), h('div', { html: relicArt('libro', 'mitica', 180) }), h('button', { class: 'cs-btn gold big', onclick: () => host.back() }, 'Volver al salón')));
  }

  async function defeat(): Promise<void> {
    host.tension(0.4);
    audio.sfx('crowd_gasp');
    if (stake?.kind === 'gold') settle('final', STAKE_GOLD, 0);
    else if (stake?.kind === 'relic') { loseRelic(stake.uid); track('casino_losses'); }
    const lostRelic = stake?.kind === 'relic' ? RELICS[stake.id] : undefined;
    stake = null;
    bus.emit('casino:final', { won: false });
    try { remember('tiburcio', { kind: 'pagado', text: 'Le gané La Apuesta Final', where: 'puerto_fortuna', intensity: 5 }); } catch { /* stub */ }
    await dialogue.say({ speaker: 'Don Tiburcio', portrait: TIB('smug'), text: lostRelic ? `${lostRelic.name} se ve muy bonita en mi vitrina, patojo. Volvé la otra luna… si te queda algo que apostar.` : 'La casa siempre gana, patojo. Siempre. Volvé la otra luna, que el Libro no se va a ningún lado… o eso creo.' });
    body.innerHTML = '';
    body.append(h('div', { class: 'cs-fn-end lost' }, h('div', { class: 'cs-fn-end-t' }, 'LA CASA GANA'), lostRelic ? h('div', { html: relicArt(lostRelic.shape, lostRelic.rarity, 140), style: `filter:grayscale(.7);--rc:${rarityColor(lostRelic.rarity)}` }) : h('div', { class: 'cs-fn-end-s' }, `−${fmt(STAKE_GOLD)} de oro`), h('button', { class: 'cs-btn big', onclick: () => host.back() }, 'Volver al salón')));
  }

  void intro();

  return {
    onKey: (e) => table?.onKey(e) ?? false,
    close() {
      if (playing && stake) {
        // walking away mid-match forfeits the stake
        if (stake.kind === 'gold') settle('final', STAKE_GOLD, 0); else loseRelic(stake.uid);
        stake = null;
      }
      table?.dispose();
      table = null;
      engine.pipeline.setLetterbox(0);
      engine.pipeline.setGrade({ vignette: 0.66, saturation: 1.2 });
      host.tension(0);
      audio.music('casino', { region: 'islas' });
      audio.ambience('crowd', false);
      if (dialogue.open) dialogue.close();
      root.remove();
    },
  };
}
