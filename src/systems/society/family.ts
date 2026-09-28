/**
 * Las Colmenas: Aurel's parents (mara_colmenas, tomas_colmenas) and Bruma. A gentle, bittersweet scene:
 * they don't know who Elias is. They talk about their son and his dog. The player can be kind or cruel,
 * and they remember.
 */
import { G, res } from '../../core/state';
import { track } from '../../core/tracker';
import { rng } from '../../core/rng';
import { dialogue, type DialogueChoice, type DialogueLine } from '../../ui/dialogue';
import { narrate } from '../../ui/narrator';
import { audio } from '../../audio';
import { applyDeed } from './deeds';
import { NPC_LINES } from './lines_npc';
import { yearAnswer } from './greetings';
import { eliasPortrait, feel, hasMemory, npcState, portraitFor, remember } from './memory';
import { soc } from './state';

const FAMILY = ['mara_colmenas', 'tomas_colmenas'];
export function isFamily(id: string): boolean { return FAMILY.includes(id); }

const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

function mara(text: string, mood?: 'smile' | 'sad' | 'scared' | 'surprised' | 'neutral'): DialogueLine {
  return { speaker: 'Mara', title: 'de Las Colmenas', portrait: portraitFor('mara_colmenas', mood ?? 'smile'), side: 'left', text, speed: 0.85 };
}
function tomas(text: string, mood?: 'smile' | 'sad' | 'scared' | 'determined' | 'neutral' | 'angry'): DialogueLine {
  return { speaker: 'Tomás', title: 'de Las Colmenas', portrait: portraitFor('tomas_colmenas', mood ?? 'neutral'), side: 'left', text, speed: 0.85 };
}
function elias(text: string, mood: 'neutral' | 'smug' | 'sad' | 'angry' = 'neutral'): DialogueLine {
  return { speaker: '{name}', portrait: eliasPortrait(mood), side: 'right', text };
}

function both(fn: (id: string) => void): void { for (const id of FAMILY) fn(id); }

export async function talkFamily(id: string): Promise<void> {
  const st = npcState(id);
  if (!st) return;
  if (!st.alive) {
    await dialogue.say({ text: '(La casa está vacía. En la mesa hay dos tazas. Una tiene té frío.)' });
    return;
  }
  const s = soc();
  s.talked[id] = (s.talked[id] ?? 0) + 1;
  const scared = hasMemory(id, 'amenazado') && st.feelings.miedo >= 30;
  const kind = hasMemory(id, 'ayudado');
  const first = !st.met;
  both((x) => { const n = npcState(x); if (n) n.met = true; });

  if (scared) {
    const choice = await dialogue.ask(mara('(Mara abre la puerta apenas. Te reconoce.) ...Por favor. No tenemos nada. Ya se llevó lo que quería.', 'scared'), [
      { id: 'sorry', text: 'Pedir perdón' },
      { id: 'leave', text: 'Irte en silencio' },
    ], true);
    if (choice === 'sorry') {
      await dialogue.say([elias('...Lo siento.', 'sad'), mara('(Te mira mucho rato.) Mi hijo decía que todo el mundo merece una segunda mañana. Yo intento creerle.', 'sad')]);
      both((x) => { feel(x, { miedo: -15, odio: -5 }); remember(x, { kind: 'disculpa', text: 'Volviste a pedir perdón', where: 'aldea_colmenas', intensity: 6 }); });
      track('family_apology');
    }
    return;
  }

  const opener = first
    ? pick(NPC_LINES[id]?.first ?? ['Buenas.'])
    : kind ? '¡Mire, Tomás, es el joven que nos ayudó! Pase, pase, que el pan está caliente.' : pick(NPC_LINES[id]?.again ?? ['Buenas.']);
  let line: DialogueLine = id === 'mara_colmenas' ? mara(opener) : tomas(opener, 'smile');
  const asked = new Set<string>();

  for (let guard = 0; guard < 12; guard++) {
    const choices: DialogueChoice[] = [];
    if (!asked.has('son')) choices.push({ id: 'son', text: 'Preguntar por su hijo' });
    if (!asked.has('dog')) choices.push({ id: 'dog', text: 'Preguntar por la perrita' });
    if (!asked.has('help')) choices.push({ id: 'help', text: 'Ayudar con la cerca y la cosecha', hint: 'amable' });
    if (!asked.has('name')) choices.push({ id: 'name', text: 'Decirles quién eres' });
    choices.push({ id: 'year', text: '¿Qué año es?' });
    choices.push({ id: 'cruel', text: 'Amenazarlos', hint: 'cruel' });
    choices.push({ id: 'leave', text: 'Irte en silencio' });
    const choice = await dialogue.ask(line, choices, true);
    if (choice === 'leave') {
      await dialogue.say(mara(pick(NPC_LINES.mara_colmenas.bye ?? ['Vaya con cuidado.'])));
      if (asked.has('son')) {
        void narrate({ third: 'Elias salió de las Colmenas. No miró atrás. Tampoco hizo falta: lo sentía en la espalda.', first: 'Salí de las Colmenas. No miré atrás. Tampoco hizo falta: lo sentía en la espalda.' });
      }
      return;
    }
    asked.add(choice);
    if (choice === 'son') line = await askSon();
    else if (choice === 'dog') line = await askDog();
    else if (choice === 'help') line = await help();
    else if (choice === 'name') line = await tellName();
    else if (choice === 'year') { await dialogue.say(elias('¿Qué año es?')); line = mara(yearAnswer('mara_colmenas'), 'sad'); }
    else if (choice === 'cruel') { await cruel(); return; }
  }
}

async function askSon(): Promise<DialogueLine> {
  await dialogue.say([
    elias('Me dijeron que tienen un hijo.'),
    mara('¿Mi hijo? Se fue hace mucho. Bueno, hace... no sé cuánto. Aquí no contamos.', 'smile'),
    tomas('Es el Campeón del Concilio, ¿sabe? Aurel. Aunque para nosotros sigue siendo el niño que se levantaba antes del amanecer.', 'smile'),
    mara('Una mañana volvió del bosque corriendo, empapado. Dijo que había visto una sombra. Que la sombra le habló.', 'sad'),
    tomas('Le dijimos que eran sus poderes despertando. ¿Qué otra cosa podía ser?', 'neutral'),
  ]);
  void narrate({
    third: 'Elias no dijo nada. Algo en el pecho le dolió, sin pedir permiso.',
    first: 'No dije nada. Algo en el pecho me dolió, sin pedir permiso.',
    direct: 'Tú sabes qué sombra era. Él todavía no.',
  }, { position: 'top' });
  both((x) => remember(x, { kind: 'conversacion_hijo', text: 'Nos preguntaste por Aurel', where: 'aldea_colmenas', intensity: 4 }));
  track('family_talks');
  return mara('Nos escribe, a veces. Cartas cortas. Siempre termina igual: «No se preocupen». Como si eso sirviera de algo.', 'sad');
}

async function askDog(): Promise<DialogueLine> {
  await dialogue.say([
    elias('¿Y la perrita?'),
    mara('¿Bruma? ¡Ay, Bruma! Blanca-gris, tranquilita. Se fue con él. Siempre se va con él.', 'smile'),
    tomas('Esa perra nunca le tuvo miedo a nada. Ni a la neblina. Ni a... bueno, a nada.', 'smile'),
  ]);
  track('family_talks');
  return mara('A veces pienso que ve cosas que nosotros no. Como si para ella siempre estuviera amaneciendo.', 'smile');
}

async function help(): Promise<DialogueLine> {
  applyDeed({ kind: 'help', location: 'aldea_colmenas', npcId: 'mara_colmenas', magnitude: 0.6 });
  both((x) => { remember(x, { kind: 'ayudado', text: 'Nos ayudaste con la cerca', where: 'aldea_colmenas', intensity: 7 }); feel(x, { deuda: 20, respeto: 10 }); });
  track('family_kindness');
  res.add('hp', 40);
  audio.sfx('heal');
  await dialogue.say([
    { text: '(Arreglas la cerca que la perra de su hijo saltaba siempre. Cargas sacos. Nadie usa magia. No hace falta.)' },
    tomas('Gracias, joven. Hace mucho que nadie nos ayudaba. Nuestro hijo manda cartas, pero las cartas no arreglan cercas.', 'smile'),
  ]);
  return mara('Tome, lleve pan. No, no me diga que no. Tiene cara de no haber comido en muchas lunas.', 'smile');
}

async function tellName(): Promise<DialogueLine> {
  const t = G.run.player.titleIndex;
  await dialogue.say(elias(t === 0 ? 'Me llamo Elias Veyr.' : `Me llaman ${G.run.player.name}.`));
  if (t === 0) return mara('Qué nombre tan... bonito. ¿Es de por aquí? No, no parece de por aquí.', 'smile');
  if (t <= 2) return mara(`¿${G.run.player.name}? He oído ese nombre en el mercado... No, no puede ser usted. Usted tiene cara de buena persona. Cansada, pero buena.`, 'surprised');
  return tomas('(Tomás deja de martillar. Mara le toma la mano.) ...Aquí no decimos ese nombre. Pero usted es bienvenido. A la mesa no se le pregunta el nombre a nadie.', 'neutral');
}

async function cruel(): Promise<void> {
  await dialogue.say([
    elias('¿Saben quién soy? ¿Saben lo que puedo hacerles?', 'angry'),
    mara('No... no sé quién es usted. Pero si quiere algo, llévelo. Solo no le haga daño a él.', 'scared'),
    tomas('(Se pone delante de Mara. Le tiemblan las manos.) Váyase. Por favor.', 'determined'),
  ]);
  applyDeed({ kind: 'terror', location: 'aldea_colmenas', npcId: 'tomas_colmenas', magnitude: 0.5 });
  both((x) => { remember(x, { kind: 'amenazado', text: 'Nos amenazaste en nuestra casa', where: 'aldea_colmenas', intensity: 8 }); feel(x, { miedo: 40, odio: 10 }); });
  track('family_cruelty');
  void narrate({
    third: 'Elias salió de las Colmenas con lo que había venido a buscar. No recordaba qué era.',
    first: 'Salí de las Colmenas con lo que había venido a buscar. No recordaba qué era.',
  });
}

// ───────────────────────────── Bruma ─────────────────────────────

export async function talkBruma(): Promise<void> {
  const st = npcState('bruma');
  const cycle = G.run.cycle;
  const first = !st?.met;
  if (st) st.met = true;
  const line = { speaker: 'Bruma', portrait: portraitFor('bruma', 'smile'), side: 'left' as const, text: first ? pick(NPC_LINES.bruma.first) : cycle >= 2 && rng.chance(0.5) ? '(Bruma te reconoce. Siempre te reconoce.)' : pick(NPC_LINES.bruma.again) };
  const choice = await dialogue.ask(line, [
    { id: 'pet', text: 'Acariciarla' },
    { id: 'stay', text: 'Quedarte un momento' },
    { id: 'leave', text: 'Irte' },
  ], true);
  if (choice === 'pet') {
    track('bruma_pets');
    remember('bruma', { kind: 'caricia', text: 'Me acariciaste', intensity: 3 });
    audio.sfx('bark', { volume: 0.4 });
    await dialogue.say({ speaker: 'Bruma', portrait: portraitFor('bruma', 'smile'), text: '(Bruma cierra los ojos. Por un segundo, detrás de ti, amanece.)', speed: 0.7 });
  } else if (choice === 'stay') {
    track('bruma_stays');
    await dialogue.say({ speaker: 'Bruma', portrait: portraitFor('bruma', 'neutral'), text: '(Se sienta a tu lado. No pide nada. Es lo más cerca que has estado de la paz en mucho tiempo.)', speed: 0.7 });
    void narrate({ third: 'La perrita no le tenía miedo. Nunca le tuvo miedo.', first: 'La perrita no me tenía miedo. Nunca me tuvo miedo.', direct: 'Ella te ve. Siempre te vio.' });
  }
}
