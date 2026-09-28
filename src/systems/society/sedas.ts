/**
 * La Casa de las Sedas (GDD §3.4): buy/sell Secretos; spend them to reveal a continent's weakness
 * (corruption multipliers), where a relic sleeps, or a delegate's secret for blackmail in the Concilio.
 */
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { rng } from '../../core/rng';
import { track } from '../../core/tracker';
import { fmt } from '../../core/math';
import { h, clear } from '../../ui/dom';
import { button } from '../../ui/widgets';
import { portraitSVG, type PortraitMood, type PortraitSpec } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { recentNews } from '../../core/news';
import { CONTINENTS, CONTINENT_IDS, LOCATIONS } from '../../data/world';
import { RELICS } from '../../data/relics';
import type { ContinentId } from '../../data/types';
import { corruptionInfo } from './corruption';
import { repValue } from './factions';
import { crest, resIcon } from './icons';
import { npcView, portraitFor } from './memory';
import { bubble, openWindow, resChip, setBubble } from './panelui';
import { delegateId } from './politics';
import { PATHS, PATH_COLORS, PATH_NAMES, ensureContinent, locName, luna, soc } from './state';
import { popText, shakeEl } from './uifx';

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** "Sir Galvan Brisaclara" → "Galvan", "Madame Fortuna" → "Fortuna". */
export function shortName(n: string): string {
  const w = n.replace(/^(Sir|Don|Doña|Madame|Archimago|Capitana|Madre|La|El|Lady|Maese|Sor)\s+/i, '').split(' ');
  return w[0] || n;
}

const DELEGATE_SECRETS: Record<string, string[]> = {
  galvan: ['Galvan rompió un juramento una vez. Lo enterró junto con el escudero que lo presenció.', 'El escudo de Galvan tiene un nombre grabado por dentro. No es el de su esposa.'],
  thalion: ['Thalion falló un tiro. Uno solo. Mató a su hermano.', 'Thalion no sabe leer las runas antiguas. Finge desde hace tres siglos.'],
  ymra: ['Ymra se durmió durante una sesión entera del Concilio. Firmó un tratado dormida.', 'Ymra esconde a un gigante proscrito en el Escalón. Es su hijo.'],
  cassius: ['Cassius copió su primer tratado de un alumno que desapareció.', 'Cassius reprobó el examen de primer año. Tres veces. Los registros se quemaron solos.'],
  fortuna: ['Madame Fortuna no es mitad sirena: es sirena entera, y lo oculta.', 'Las cartas de Fortuna están marcadas. Todas. Desde siempre.'],
  ione: ['Ione firmó en secreto la orden que exilió a los magos de Concordia.', 'La Custodia duda. Cada noche escribe su renuncia y cada mañana la quema.'],
};
const GENERIC_SECRETS = ['{n} debe dinero a la Banca. Mucho dinero.', '{n} vendió su voto una vez. El comprador está muerto; el recibo, no.', '{n} tiene una segunda familia en las Islas.', '{n} le teme a la oscuridad. Duerme con tres velas.'];

const HELLO_M = ['Siéntate, querido. Aquí el té es de Sylvaria y los secretos, de todas partes.', 'Bienvenido a la Casa. Aquí nadie te vio entrar. Ni yo.', 'Traes cara de querer saber algo. Eso siempre sale caro.'];
const HELLO_G = ['La Casa de las Sedas te saluda. En voz baja.', 'Bienvenido. Todo lo que se dice aquí, se vende aquí.', 'Pasa. Deja el nombre en la puerta; aquí no hace falta.'];

function hostFor(locationId: string): { name: string; title: string; spec: (m: PortraitMood) => PortraitSpec } {
  if (locationId === 'callejones_ceniza' && G.run.npcs.mirelle?.alive !== false) {
    return { name: 'Viuda Mirelle', title: 'Señora de la Casa de las Sedas', spec: (m) => portraitFor('mirelle', m) };
  }
  return { name: 'Dama de las Sedas', title: `Casa de las Sedas · ${locName(locationId)}`, spec: (m) => ({ seed: `${locationId}:sedas`, race: 'humano', job: 'cortesana', gender: 'f', mood: m }) };
}

export function secretPrice(): number {
  const s = soc();
  const bought = s.sedasBought.luna === luna() ? s.sedasBought.count : 0;
  let p = 120 * (1 + 0.25 * bought);
  if (repValue('sedas') >= 40) p *= 0.85;
  if (Number(G.run.flags.sedas_closed_until ?? -1) > luna()) p *= 2;
  return Math.round(p / 5) * 5;
}

/** Reveals the path multipliers of a continent. */
export function revealWeakness(c: ContinentId): boolean {
  const st = ensureContinent(c);
  if (st.weaknessKnown) return false;
  st.weaknessKnown = true;
  track('weaknesses_revealed');
  return true;
}

/** Reveals a random relic location not yet revealed. Returns [relicId, locationId] or null. */
export function revealRelic(): [string, string] | null {
  const s = soc();
  const known = new Set(s.revealedRelics.map((r) => r.relic));
  const cands: Array<[string, string]> = [];
  for (const loc of Object.values(G.run.locations)) {
    if (loc.relic && !known.has(loc.relic) && !G.run.player.relics.some((r) => r.id === loc.relic)) cands.push([loc.relic, loc.id]);
  }
  if (!cands.length) for (const l of Object.values(LOCATIONS)) if (l.relic && !known.has(l.relic)) cands.push([l.relic, l.id]);
  if (!cands.length) return null;
  const [relic, location] = rng.pick(cands);
  s.revealedRelics.push({ relic, location });
  bus.emit('relic:revealed', { relicId: relic, locationId: location });
  track('relics_revealed');
  return [relic, location];
}

export function learnDelegateSecret(id: string): string {
  const s = soc();
  const name = npcView(id)?.name ?? 'El delegado';
  const pool = DELEGATE_SECRETS[id] ?? GENERIC_SECRETS.map((t) => t.replace('{n}', name));
  const used = new Set(s.secretTexts[id] ?? []);
  const text = pool.find((t) => !used.has(t)) ?? pick(pool);
  (s.secretTexts[id] ??= []).push(text);
  s.secretsOn[id] = (s.secretsOn[id] ?? 0) + 1;
  track('delegate_secrets');
  return text;
}

export async function openSedas(locationId: string): Promise<void> {
  if (!G.run) return;
  const host = hostFor(locationId);
  const secrets = resChip(resIcon('secreto'), G.run.player.secrets, 'Secretos');
  const gold = resChip(resIcon('oro'), fmt(G.run.player.gold), 'Oro');
  const w = openWindow({ title: 'La Casa de las Sedas', subtitle: locName(locationId), icon: resIcon('secreto', 26), className: 'soc-sedas', headerRight: [gold, secrets] });
  const portraitEl = h('div', { class: 'soc-portrait', html: portraitSVG(host.spec('smug'), 300) });
  const bub = bubble(pick(host.name === 'Viuda Mirelle' ? HELLO_M : HELLO_G));
  const side = h('div', { class: 'soc-side' }, portraitEl, h('div', { class: 'soc-npc-name' }, host.name, h('span', null, host.title)), bub);
  const main = h('div', { class: 'soc-main' });
  w.body.appendChild(h('div', { class: 'soc-split' }, side, main));
  let reveal: HTMLElement | null = null;

  const say = (text: string, mood: PortraitMood) => {
    setBubble(bub, text);
    portraitEl.innerHTML = portraitSVG(host.spec(mood), 300);
    portraitEl.classList.remove('talk'); void portraitEl.offsetWidth; portraitEl.classList.add('talk');
  };
  const spend = (n: number, anchor: HTMLElement): boolean => {
    if (!res.spend('secrets', n)) { audio.sfx('ui_error'); shakeEl(anchor); say('Los secretos se pagan con secretos, querido. Y no tienes suficientes.', 'smug'); return false; }
    audio.sfx('whisper');
    return true;
  };

  const render = () => {
    secrets.set?.(G.run.player.secrets);
    gold.set?.(fmt(G.run.player.gold));
    clear(main);
    const price = secretPrice();
    const trade = h('div', { class: 'soc-card' },
      h('div', { class: 'soc-card-title' }, h('span', { html: resIcon('secreto', 22) }), 'Secretos'),
      h('div', { class: 'soc-secret-count' }, h('span', { html: resIcon('secreto', 36) }), h('b', null, String(G.run.player.secrets))),
      Number(G.run.flags.sedas_closed_until ?? -1) > luna() ? h('div', { class: 'soc-warn' }, 'El Concilio «clausuró» la Casa. Los precios se duplicaron. La puerta, no.') : null,
      h('div', { class: 'lx-btn-row' },
        button(`Comprar un Secreto (${fmt(price)})`, (e) => {
          if (!res.spend('gold', price)) { audio.sfx('ui_error'); shakeEl(e.currentTarget as HTMLElement); return; }
          res.add('secrets', 1);
          const s = soc();
          if (s.sedasBought.luna !== luna()) s.sedasBought = { luna: luna(), count: 0 };
          s.sedasBought.count++;
          track('secrets_bought');
          audio.sfx('whisper');
          popText(e.currentTarget as HTMLElement, '+1 🗝', 'var(--secret)', true);
          say(pick(['Acércate... Esto no lo repito.', 'Guárdalo bien. Los secretos se echan a perder al sol.', 'Uno fresco. Todavía está tibio.']), 'smug');
          render();
        }, { kind: 'primary', small: true, disabled: G.run.player.gold < price }),
        button('Vender un Secreto (60)', (e) => {
          if (!res.spend('secrets', 1)) return;
          res.add('gold', 60);
          audio.sfx('coin');
          popText(e.currentTarget as HTMLElement, '+60', 'var(--gold-hi)');
          say('Mmm. Esto ya lo sabía. Pero te lo pago igual: me gusta tener dos copias.', 'smile');
          render();
        }, { small: true, kind: 'ghost', disabled: G.run.player.secrets < 1 })));

    const weak = h('div', { class: 'soc-card' },
      h('div', { class: 'soc-card-title' }, 'La debilidad de un continente', h('span', { class: 'soc-cost' }, '2 🗝')),
      h('div', { class: 'lx-small lx-muted' }, 'Cada continente cae más fácil por una vía. Saberla la hace un 15% más efectiva.'),
      h('div', { class: 'soc-cont-row' }, ...CONTINENT_IDS.map((c) => {
        const known = ensureContinent(c).weaknessKnown;
        return h('button', { class: `soc-cont-btn ${known ? 'known' : ''}`, 'data-tip': known ? 'Ya la conoces (clic para ver)' : `Revelar la debilidad de ${CONTINENTS[c].name}`, onclick: (e: MouseEvent) => {
          if (!known && !spend(2, e.currentTarget as HTMLElement)) return;
          if (!known) revealWeakness(c);
          showWeakness(c);
          render();
        } }, h('span', { html: crest(c, 30) }), CONTINENTS[c].name);
      })));

    const relic = h('div', { class: 'soc-card' },
      h('div', { class: 'soc-card-title' }, 'Dónde duerme una reliquia', h('span', { class: 'soc-cost' }, '2 🗝')),
      h('div', { class: 'lx-small lx-muted' }, 'Las cortesanas oyen a los ladrones, y los ladrones siempre hablan de lo que no pudieron robar.'),
      button('Preguntar', (e) => {
        if (!spend(2, e.currentTarget as HTMLElement)) return;
        const r = revealRelic();
        if (!r) { res.add('secrets', 2); say('Ya sabes todo lo que yo sé sobre reliquias. Te devuelvo tus secretos.', 'neutral'); render(); return; }
        const name = RELICS[r[0]]?.name ?? r[0];
        audio.stinger('discovery');
        say(`Dicen que ${name} está en ${locName(r[1])}. Lo dicen muy bajito.`, 'smug');
        showCard(h('div', { class: 'soc-reveal-relic' }, h('div', { class: 'lx-title' }, name), h('div', { class: 'lx-book' }, `Descansa en ${locName(r[1])}.`), h('div', { class: 'lx-small lx-muted' }, 'Marcado en tu mapa.')));
        render();
      }, { small: true, disabled: G.run.player.secrets < 2 }));
    const known = soc().revealedRelics;
    if (known.length) relic.appendChild(h('div', { class: 'soc-known' }, ...known.slice(-4).map((k) => h('div', { class: 'lx-small' }, `• ${RELICS[k.relic]?.name ?? k.relic} — ${locName(k.location)}`))));

    const dels = h('div', { class: 'soc-card' },
      h('div', { class: 'soc-card-title' }, 'El secreto de un delegado', h('span', { class: 'soc-cost' }, '1 🗝')),
      h('div', { class: 'lx-small lx-muted' }, 'Para chantajearlo en el Concilio (efecto fuerte) o para comprar su voto sin oro.'),
      h('div', { class: 'soc-cont-row' }, ...[...CONTINENT_IDS.map((c) => delegateId(c)), 'ione'].map((id) => {
        const v = npcView(id);
        const have = soc().secretsOn[id] ?? 0;
        return h('button', { class: 'soc-del-btn', 'data-tip': have ? `Tienes ${have} secreto(s) sobre ${v?.name}` : `Comprar un secreto sobre ${v?.name}`, onclick: (e: MouseEvent) => {
          if (!spend(1, e.currentTarget as HTMLElement)) return;
          const text = learnDelegateSecret(id);
          audio.sfx('page_turn');
          say('Esto vale más que tu peso en oro. Úsalo con elegancia.', 'smug');
          showCard(h('div', { class: 'soc-reveal-secret' }, h('div', { class: 'lx-small lx-muted' }, `Sobre ${v?.name ?? id}`), h('div', { class: 'lx-book' }, `«${text}»`)));
          render();
        } }, h('span', { class: 'soc-del-face', html: portraitSVG(portraitFor(id, 'neutral'), 44) }), h('span', null, shortName(v?.name ?? id)), have ? h('span', { class: 'soc-badge' }, String(have)) : null);
      })));

    const rum = h('div', { class: 'soc-card soc-rumors' }, h('div', { class: 'soc-card-title' }, 'Lo que se dice en la Casa'),
      ...(recentNews(4).length ? recentNews(4).map((n) => h('div', { class: 'lx-small soc-rumor' }, `«${n.text}»`)) : [h('div', { class: 'lx-small lx-muted' }, 'Todo está demasiado tranquilo. Eso también es un secreto.')]));
    main.append(trade, weak, relic, dels, rum);
    if (reveal) main.prepend(reveal);
  };

  const showCard = (el: HTMLElement) => { reveal = h('div', { class: 'soc-reveal lx-pop' }, el); render(); };

  const showWeakness = (c: ContinentId) => {
    const info = corruptionInfo(c);
    const max = Math.max(...PATHS.map((p) => info.mult[p]));
    showCard(h('div', { class: 'soc-weak' },
      h('div', { class: 'soc-weak-head' }, h('span', { html: crest(c, 42) }), h('div', null, h('div', { class: 'lx-title' }, CONTINENTS[c].name), h('div', { class: 'lx-small' }, 'Cae más fácil por: ', h('b', { style: `color:${PATH_COLORS[info.best]}` }, info.bestName)))),
      ...PATHS.map((p) => h('div', { class: 'soc-weak-row' },
        h('span', null, PATH_NAMES[p]),
        h('div', { class: 'soc-weak-bar' }, h('div', { class: 'soc-weak-fill', style: `width:${Math.round((info.mult[p] / max) * 100)}%;background:${PATH_COLORS[p]}` })),
        h('b', null, `×${info.mult[p].toFixed(2)}`)))));
    audio.stinger('discovery');
  };

  render();
  await w.closed;
}
