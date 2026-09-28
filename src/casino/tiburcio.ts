/**
 * Don Tiburcio Faroles — Gran Banquero, dueño del Gran Casino. Chapín, adorable y peligroso.
 * Memory-aware greetings (wins, losses, cheating, bans, streaks, titles) + lobby quips + reactions.
 * In the speakeasy the host is El Chato Quiñónez.
 */
import type { PortraitMood, PortraitSpec } from '../ui/art/portraits';
import { G } from '../core/state';
import { fmt } from '../core/math';
import { cs, luna, gold } from './state';

export const TIB = (mood: PortraitMood = 'smile'): PortraitSpec => ({ seed: 'tiburcio', race: 'duende', special: 'tiburcio', mood });
export const CHATO = (mood: PortraitMood = 'smug'): PortraitSpec => ({ seed: 'el_chato', race: 'duende', job: 'tabernero', gender: 'm', mood });

export interface Greeting { text: string; mood: PortraitMood; key: string }

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/** Chooses the most relevant greeting (story/memory first, flavor last). */
export function greeting(): Greeting {
  const s = cs();
  const p = G.run.player;
  const lb = s.lastBig;
  const recent = luna() - lb.luna <= 12;
  if (!s.tiburcio.met) {
    return { key: 'first', mood: 'smile', text: '¡Bienvenido al Gran Casino, patojo! La Banca de las Mil Suertes: aquí la suerte es de quien la paga… y la paga siempre la casa. ¡Ja! Pasá adelante, que el oro no muerde.' };
  }
  if (s.caught > 0 && s.lastGreetLuna < luna() && s.suspicion > 20) {
    return { key: 'cheater', mood: 'angry', text: 'Ajá… el mago de los dedos largos. Los Ojos de la Casa te tienen en la mira, shute. Jugá limpio y todos contentos.' };
  }
  if (recent && lb.kind === 'win' && lb.amount >= 3000) {
    return { key: 'bigwin', mood: 'surprised', text: `¡A la gran, patojo! ¿Otra vez vos? La última vez me volaste ${fmt(lb.amount)} de oro. Hoy la casa se desquita, vos… con cariño.` };
  }
  if (recent && lb.kind === 'loss' && lb.amount >= 2000) {
    return { key: 'bigloss', mood: 'smug', text: `¡Qué chivo verte, patojo! Tus ${fmt(lb.amount)} están bien cuidaditos en mi bóveda. ¿Venís a visitarlos?` };
  }
  if (p.gold < 50) {
    return { key: 'broke', mood: 'smug', text: '¿Sin pisto? Está yuca. La Banca presta, ¿eh? A un interés… cariñoso. Casi familiar.' };
  }
  if (s.streak >= 4) {
    return { key: 'streak', mood: 'surprised', text: `¡Esa racha de ${s.streak} está que arde! Nomás no la soplés, que se apaga.` };
  }
  if (p.titleIndex >= 1 && !s.tiburcio.seen.includes('title')) {
    s.tiburcio.seen.push('title');
    return { key: 'title', mood: 'smug', text: `Dicen por ahí que ahora te llaman *${p.name}*, y que no te morís. ¡Mejor! Un cliente que no se muere es un cliente para siempre.` };
  }
  if (p.gold >= 10000 && !s.final.won) {
    return { key: 'final', mood: 'smug', text: 'Uy, qué bolsa tan chilera. Tengo algo en la bóveda que te interesa, ¿verdad? Una *Apuesta Final*… si te alcanza el valor.' };
  }
  if (p.gold >= 3000) {
    return { key: 'rich', mood: 'smile', text: 'Pasá, pasá. Esa bolsa se ve muy pesada; aquí te la aliviamos con mucho gusto.' };
  }
  return pick([
    { key: 'hello1', mood: 'smile' as PortraitMood, text: '¡A la gran, patojo! ¿Otra vez vos? Ya te extrañaban las maquinitas.' },
    { key: 'hello2', mood: 'smile' as PortraitMood, text: '¿Qué onda, mago? Hoy las mesas andan de buenas. Bueno… eso digo siempre.' },
    { key: 'hello3', mood: 'smug' as PortraitMood, text: 'Bienvenido de vuelta. Aquí adentro no hay relojes, vos. Ni lunas. Solo oro que va y viene… más va que viene.' },
  ]);
}

export const CHATO_GREETING = (): Greeting => ({
  key: 'chato', mood: 'smug',
  text: 'Psst… por aquí, patojo. El Concilio cerró la Banca, pero la suerte no se cierra. Aquí se paga mejor… y se corre más. Si oís silbatos, corré.',
});

const QUIPS = [
  'La casa siempre gana. Pero hoy anda de buenas, fijate.',
  '¿Una más? Una más nunca le hizo daño a nadie… bueno, a casi nadie.',
  'Ese tragamonedas está caliente, patojo. Yo que vos…',
  '¿Qué año es? ¡Ja! Aquí adentro no hay años, vos. Un día dejamos de contar.',
  'El Pozo de los Deseos escucha. A veces hasta concede.',
  'La Rueda de las Almas acepta esencia. Las almas también son moneda, ¿verdad?',
  'Los Ojos de la Casa nunca parpadean. Yo sí, pero de gusto.',
  'Madame Fortuna dice que hoy es tu día. Dice eso todos los días.',
  '¡Qué chilero ese abrigo! Se vería mejor con menos oro en los bolsillos.',
  'En la Arena se apuesta a quién sale volando más lejos. Casi siempre es un duende.',
  'La Apuesta Final no es para cualquiera. Es para el que se cree la excepción.',
];

export function quip(): string {
  const s = cs();
  const i = s.tiburcio.quipIdx++ % QUIPS.length;
  if (gold() > 10000 && Math.random() < 0.25 && !s.final.won) return 'Diez mil de oro y una partida de dados. Así de fácil se gana un libro que reescribe el mundo.';
  return QUIPS[i];
}

export function reactWin(net: number): string {
  if (net >= 10000) return pick(['¡¿QUÉ?! ¡Alguien traiga mis sales!', '¡A la gran! ¡Eso no estaba en el presupuesto, patojo!']);
  if (net >= 2000) return pick(['¡Uy! Ya me dolió el bolsillo.', '¡Qué suerte más shute tenés vos!', '¡Chilero! …para vos. Para mí, no tanto.']);
  return pick(['¡Bien ahí!', 'Mirá nomás, el mago tiene suerte.', 'Ganar poquito también es ganar, patojo.']);
}

export function reactLoss(): string {
  return pick(['La casa agradece tu generosidad.', '¡Casi, patojo! Casi. Otra y ya.', 'Así es esto: hoy no, mañana tampoco… pero pasado, ¿quién sabe?', 'No te agüités. Las fichas no guardan rencor.']);
}

/** Break nudge after a long session (ethics guardrail, told in character). */
export const BREAK_LINE = { third: '{name} llevaba mucho tiempo frente a las mesas. Las fichas no se cansan. Él sí.', first: 'Llevaba demasiado tiempo frente a las mesas. Las fichas no se cansan. Yo sí.' };
