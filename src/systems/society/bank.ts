/**
 * La Banca de las Mil Suertes (GDD §3.4, §4.8): Don Tiburcio lends with interest per luna, collects with goblins,
 * and sells shares of the Banca (dividends each luna). 100 shares = the Banca is yours.
 */
import { G } from '../../core/state';
import { fmt } from '../../core/math';
import { h, clear } from '../../ui/dom';
import { button } from '../../ui/widgets';
import { portraitSVG, type PortraitMood } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { repTier } from './factions';
import { buyShares, creditLine, loanRate, repay, sellShares, takeLoan, totalDebt } from './finance';
import { resIcon, sparkline } from './icons';
import { portraitFor } from './memory';
import { bubble, openWindow, resChip, setBubble } from './panelui';
import { luna, soc } from './state';
import { popText, shakeEl } from './uifx';

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

const HELLO = ['¡Qué onda, patojo! ¿Pisto? Aquí hay pisto. Con intereses, pero hay.', '¡A la gran! Mi cliente favorito. Bueno, el único que no se muere.', 'Pase, pase. Siéntese. No toque nada que brille.'];
const LOAN = ['¡Chilero! Firme aquí. Y aquí. Y aquí también. No lea eso.', 'Ahí está su pisto. Cuídelo, que es mío.', '¡Trato! Y recuerde: la Banca siempre cobra. Siempre.'];
const REPAY = ['¡Eso! Así me gusta. Cliente que paga, cliente que vuelve.', 'Púchica, qué puntualidad. Casi me emociono.', 'Anotado. Con letra bonita y todo.'];
const SHARES = ['¡Ahora es socio! Bueno, socio chiquito. Socito.', 'Invertir en la Banca es invertir en mí. Muy buena decisión.', '¡Qué chivo! Los dividendos llegan cada luna. Casi siempre.'];
const NO = ['Mire, vos, sin pisto no hay trato.', 'Está yuca. No le alcanza.', 'Nel. No se puede.'];

export async function openBank(): Promise<void> {
  if (!G.run) return;
  const gold = resChip(resIcon('oro'), fmt(G.run.player.gold), 'Oro');
  const debt = resChip(resIcon('deuda'), fmt(totalDebt()), 'Deuda con la Banca', 'soc-chip-debt');
  const w = openWindow({ title: 'La Banca de las Mil Suertes', subtitle: 'Puerto Fortuna', icon: resIcon('oro', 26), className: 'soc-bank', headerRight: [gold, debt] });
  const s = soc();
  const portraitEl = h('div', { class: 'soc-portrait', html: portraitSVG(portraitFor('tiburcio', 'smile'), 300) });
  const bub = bubble(s.bank.overdueSince >= 0 ? 'Patojo... usted me debe. Y a mí nadie me debe, ¿me entendió?' : pick(HELLO));
  const tier = repTier('banca');
  const side = h('div', { class: 'soc-side' }, portraitEl, h('div', { class: 'soc-npc-name' }, 'Don Tiburcio Faroles', h('span', null, 'Gran Banquero de las Islas')), bub,
    h('div', { class: 'soc-mods' }, h('span', { class: 'soc-tag', style: `color:${tier.color}` }, `La Banca: ${tier.name}`)));
  const main = h('div', { class: 'soc-main soc-bank-main' });
  w.body.appendChild(h('div', { class: 'soc-split' }, side, main));

  const say = (text: string, mood: PortraitMood) => {
    setBubble(bub, text);
    portraitEl.innerHTML = portraitSVG(portraitFor('tiburcio', mood), 300);
    portraitEl.classList.remove('talk'); void portraitEl.offsetWidth; portraitEl.classList.add('talk');
  };

  const render = () => {
    gold.set?.(fmt(G.run.player.gold));
    debt.set?.(fmt(totalDebt()));
    clear(main);
    const rate = loanRate();
    const line = creditLine();
    const frozen = s.bank.frozenUntil > luna();
    // ── loans
    const loans = h('div', { class: 'soc-card' },
      h('div', { class: 'soc-card-title' }, h('span', { html: resIcon('deuda', 22) }), 'Préstamos'),
      h('div', { class: 'soc-kv' },
        h('span', null, 'Interés por luna'), h('b', null, rate === null ? 'La Banca no te presta' : `${Math.round(rate * 1000) / 10}%`),
        h('span', null, 'Crédito disponible'), h('b', null, fmt(line)),
        h('span', null, 'Plazo'), h('b', null, '8 lunas')),
      frozen ? h('div', { class: 'soc-warn' }, `Auditoría del Concilio: préstamos congelados ${s.bank.frozenUntil - luna()} lunas (sin intereses).`) : null,
      h('div', { class: 'lx-btn-row' }, ...[200, 500, 1000, 2500, 5000].map((a) => button(`Pedir ${fmt(a)}`, (e) => {
        const loan = takeLoan(a);
        if (!loan) { audio.sfx('ui_error'); shakeEl(e.currentTarget as HTMLElement); say(pick(NO), 'smug'); return; }
        audio.sfx('coins_many');
        popText(e.currentTarget as HTMLElement, `+${fmt(a)}`, 'var(--gold-hi)', a >= 1000);
        say(pick(LOAN), 'smile');
        render();
      }, { small: true, disabled: rate === null || a > line || frozen }))));
    const list = h('div', { class: 'soc-loans' });
    if (!s.loans.length) list.appendChild(h('div', { class: 'lx-muted lx-small' }, 'No le debes nada a nadie. Qué sospechoso.'));
    for (const l of s.loans) {
      const left = l.dueLuna - luna();
      list.appendChild(h('div', { class: `soc-loan ${left < 0 ? 'late' : ''}` },
        h('span', null, `Préstamo de ${fmt(l.principal)}`),
        h('b', null, `Debes ${fmt(Math.round(l.owed))}`),
        h('span', { class: left < 0 ? 'lx-bad' : left <= 2 ? 'lx-gold' : 'lx-muted' }, left < 0 ? `VENCIDO hace ${-left} ${-left === 1 ? 'luna' : 'lunas'}` : left === 0 ? 'Vence esta luna' : `Vence en ${left} ${left === 1 ? 'luna' : 'lunas'}`)));
    }
    loans.appendChild(list);
    const total = totalDebt();
    if (total > 0) {
      loans.appendChild(h('div', { class: 'lx-btn-row' }, ...[0.25, 0.5, 1].map((k) => button(k === 1 ? 'Pagar todo' : `Pagar ${k * 100}%`, (e) => {
        const paid = repay(Math.ceil(total * k));
        if (!paid) { audio.sfx('ui_error'); say(pick(NO), 'smug'); return; }
        audio.sfx('sell');
        popText(e.currentTarget as HTMLElement, `−${fmt(paid)}`, 'var(--blood)');
        say(pick(REPAY), 'smile');
        render();
      }, { small: true, kind: k === 1 ? 'primary' : undefined, disabled: G.run.player.gold <= 0 }))));
    }
    // ── shares
    const own = s.bank.shares;
    const price = s.bank.sharePrice;
    const div = Math.round(own * price * 0.02);
    const shares = h('div', { class: 'soc-card' },
      h('div', { class: 'soc-card-title' }, h('span', { html: resIcon('acciones', 22) }), 'Acciones de la Banca'),
      h('div', { class: 'soc-share-row' },
        h('div', { class: 'soc-share-price' }, h('div', { class: 'lx-small lx-muted' }, 'Precio por acción'), h('b', null, fmt(price, 1))),
        h('div', { html: sparkline(s.bank.history, 150, 40) }),
        h('div', { class: 'soc-kv' },
          h('span', null, 'Tienes'), h('b', null, `${own} acciones`),
          h('span', null, 'Valor'), h('b', null, fmt(Math.round(own * price))),
          h('span', null, 'Dividendo por luna'), h('b', { class: 'lx-good' }, `+${fmt(div)}`))),
      h('div', { class: 'lx-btn-row' },
        ...[1, 5, 10, 25].map((n) => button(`Comprar ${n}`, (e) => {
          if (!buyShares(n)) { audio.sfx('ui_error'); say(pick(NO), 'smug'); return; }
          audio.sfx('purchase');
          popText(e.currentTarget as HTMLElement, `+${n} 📈`, 'var(--good)');
          say(pick(SHARES), 'smile');
          render();
        }, { small: true, disabled: G.run.player.gold < Math.round(n * price) })),
        ...[1, 10].map((n) => button(`Vender ${n}`, (e) => {
          const v = sellShares(n);
          if (!v) return;
          audio.sfx('sell');
          popText(e.currentTarget as HTMLElement, `+${fmt(v)}`, 'var(--gold-hi)');
          say('¿Vendiendo? Púchica, usted no tiene fe.', 'sad');
          render();
        }, { small: true, kind: 'ghost', disabled: own < n }))),
      h('div', { class: 'soc-own' },
        h('div', { class: 'lx-small' }, s.bank.owned ? '¡La Banca es tuya!' : `Comprar la Banca: ${own}/100 acciones`),
        h('div', { class: 'soc-own-bar' }, h('div', { class: 'soc-own-fill', style: `width:${Math.min(100, own)}%` })),
        h('div', { class: 'lx-small lx-muted' }, s.bank.owned ? 'Don Tiburcio te guarda la silla del director. Y la llave de la Bóveda.' : 'Dicen que quien posea la Banca posee también lo que guarda su Bóveda.')));
    main.append(loans, shares);
  };

  render();
  await w.closed;
}
