/**
 * Fragmento "Antes" (GDD §2.3): the epigraph → breakfast in Las Colmenas → the forest before dawn → the log →
 * dawn → the shadow forms, the morning clouds over, night falls *for him* while Bruma keeps watching a lovely dawn →
 * [Clic] the light → closed eyes → a normal morning → "Siempre estuve viéndote." → rain → "Corre." → the parents →
 * LA EXCEPCIÓN → "Cuando aún tenía nombre".
 * Debug: ?scene=prologue&mode=boy&at=walk|sit|dawn|shadow|blink|bruma|light|morning|voice|rain|parents|end
 */
import * as THREE from 'three';
import { G } from '../../core/state';
import { saveMeta } from '../../core/save';
import { input } from '../../core/input';
import { engine } from '../../core/engine';
import { h, layer } from '../../ui/dom';
import { dialogue, type DialogueLine } from '../../ui/dialogue';
import type { PortraitSpec } from '../../ui/art/portraits';
import { audio } from '../../audio';
import { PROLOGUE } from '../../data/story';
import { epigraph, blackout, showSiempre, centerLine, keyPrompt, clickPrompt, hint, holdToSkip, skipButton, logoCard } from '../../systems/story/ui';
import { sayLine } from '../../systems/story/narration';
import { unlockAchievement } from '../../systems/story/achievements';
import { startAurelDuel } from '../../systems/story/acts';
import { Director, ease, type Timeline } from './director';
import { showVignette } from './vignette';
import { setupForest, seatBoy, seatDog, seatPos, dogSeatPos, headingOf, shots, Walker, forestBounds, lightBurst, handPos, eyelids } from './forestKit';
import type { PCtx } from './index';

type Mood = PortraitSpec['mood'];
const P = {
  boy: (mood: Mood = 'neutral'): PortraitSpec => ({ seed: 'aurel_child', race: 'humano', special: 'aurel_child', age: 'child', gender: 'm', mood }),
  mother: (mood: Mood = 'smile'): PortraitSpec => ({ seed: 'mother', race: 'humano', special: 'mother', gender: 'f', mood }),
  father: (mood: Mood = 'neutral'): PortraitSpec => ({ seed: 'father', race: 'humano', special: 'father', gender: 'm', mood }),
};

const hexLerp = (a: string, b: string, k: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, k))).getHexString();
const sstep = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
function angleTo(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const BEATS = ['epigraph', 'breakfast', 'walk', 'sit', 'dawn', 'shadow', 'blink', 'bruma', 'light', 'morning', 'voice', 'rain', 'parents', 'end'] as const;
type Beat = typeof BEATS[number];

export async function runBoy(c: PCtx): Promise<void> {
  const tl = c.tl;
  const black = blackout();
  black.el.style.opacity = '1';
  c.dom.push(black.el);
  c.block(true);
  input.enabled = false;
  audio.music('silence');
  const f = setupForest(c);
  const boy = c.boy!, dog = c.dog!, sh = c.shadow!;
  const at = (BEATS as readonly string[]).includes(String(c.params.at)) ? (c.params.at as Beat) : 'epigraph';
  const from = BEATS.indexOf(at);
  const play = (b: Beat) => BEATS.indexOf(b) >= from;

  // ── cast & world before dawn
  c.atmos.time = 0.2; c.atmos.near = 9; c.atmos.far = 105; c.atmos.mist = '#9aa3c8'; c.atmos.mistD = 1.1;
  f.setLamps(0.8); f.fireflies01 = 1; f.rays01 = 0;
  boy.root.position.copy(f.startPos);
  boy.root.rotation.y = Math.PI / 2;
  dog.root.position.copy(f.startPos).add(new THREE.Vector3(-0.6, 0, -1.1));
  dog.root.position.y = f.height(dog.root.position.x, dog.root.position.z);
  const walker = new Walker(boy);
  walker.heading = Math.PI / 2;
  c.rig.yaw = -Math.PI / 2;
  c.rig.follow(boy.root.position, true);
  c.camMode = 'rig';
  const warm = new THREE.PointLight('#ffb870', 0, 3.2, 1.6);
  dog.head.add(warm);
  warm.position.set(0, 0.5, 0.6);
  const seat = seatPos(f);
  const eastFar = f.logPos.clone().addScaledVector(f.faceDir, 60).add(new THREE.Vector3(0, 7, 0));

  // cast animation: always on; speeds set by whoever drives them
  let boySpeed = 0, dogSpeed = 0, puffT = 0, walking = false;
  c.hooks.add((dt) => {
    boy.update(dt, { speed: boySpeed });
    dog.update(dt, { speed: dogSpeed });
    if (sh.root.visible) {
      sh.update(dt, { speed: 0 });
      puffT -= dt;
      if (puffT <= 0) { puffT = 0.12; c.fx.emit('shadow', sh.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 1.6, (Math.random() - 0.5) * 0.8)), { count: 1, size: 1.5, sizeEnd: 2.8, life: 2.2, speed: 0.35, up: 0.3, color: '#07040b', color2: '#1b1028' }); }
    }
  });
  const bounds = forestBounds(c);
  const walkHook = (dt: number) => {
    if (!walking) return;
    walker.update(dt, c, { bounds, canRun: true });
    boySpeed = walker.speed;
    dogSpeed = c.dogBrain!.follow(dt, boy.root.position, walker.heading, walker.speed, (x, z) => f.height(x, z));
    c.atmos.time = Math.min(0.216, c.atmos.time + dt * 0.00035);
  };
  c.hooks.add(walkHook);

  // ── skipping (repeat cycles, or ?skip)
  const canSkip = (G.meta?.cyclesCompleted ?? 0) > 0 || !!G.meta?.seenPrologue || c.params.skip !== undefined;
  let skipped = false;
  const disposers: Array<() => void> = [];
  const onSkip = () => {
    if (skipped || !c.alive) return;
    skipped = true;
    disposers.forEach((d) => d());
    tl.kill();
    Director.run(() => finish(c, true), 'skip');
  };
  if (canSkip) { disposers.push(holdToSkip(onSkip, PROLOGUE.holdToSkip)); disposers.push(skipButton(onSkip)); }

  /** Jump helper: put the world in the state a later beat expects. */
  const seated = () => {
    walking = false;
    seatBoy(c); seatDog(c);
    dog.lookTarget = eastFar; dog.wag = 0.35;
    c.camMode = 'shot';
    engine.pipeline.setLetterbox(1);
  };
  if (from > BEATS.indexOf('breakfast')) audio.music('prologue');
  if (from > BEATS.indexOf('walk')) { seated(); const s = shots(c).silhouette(); c.shot.set(s.pos, s.look, 46); }
  if (from > BEATS.indexOf('dawn')) {
    c.atmos.time = 0.302; c.atmos.mist = '#f6dcb8'; c.atmos.mistD = 0.8; c.atmos.near = 19; c.atmos.far = 185;
    f.fireflies01 = 0; f.setLamps(0.05); f.rays01 = 1;
    const s = shots(c).silhouetteClose(); c.shot.set(s.pos, s.look, 46);
  }
  if (from > BEATS.indexOf('shadow')) {
    sh.root.visible = true; sh.setOpacity(0.8); c.atmos.overcast = 0.85; f.rays01 = 0;
    sh.root.position.copy(f.shadowPos); sh.root.rotation.y = headingOf(f.logPos.clone().sub(f.shadowPos));
    boy.setExpression('scared');
  }
  if (from > BEATS.indexOf('blink')) {
    c.atmos.night = 1; c.atmos.overcast = 0.35; f.setLamps(1); sh.setOpacity(1);
    sh.root.position.copy(f.logPos).addScaledVector(f.faceDir, 5.4).addScaledVector(f.right, 0.3);
    sh.root.position.y = f.height(sh.root.position.x, sh.root.position.z);
    dog.setWarmth(0.3); warm.intensity = 0.5; audio.music('prologue_dark');
    const s = shots(c).overShoulder(); c.shot.set(s.pos, s.look, 42);
  }
  if (from > BEATS.indexOf('light')) morningState();
  if (from > BEATS.indexOf('voice')) { const s = shots(c).sideAfter(); c.shot.set(s.pos, s.look, 44); boy.root.rotation.y += Math.PI; }
  if (from > BEATS.indexOf('epigraph') && from <= BEATS.indexOf('parents')) black.el.style.opacity = from > BEATS.indexOf('walk') ? '0' : '1';

  function morningState(): void {
    sh.root.visible = false;
    c.atmos.night = 0; c.atmos.overcast = 0; c.atmos.time = 0.31;
    c.atmos.near = 26; c.atmos.far = 230; c.atmos.mist = '#f5ebda'; c.atmos.mistD = 0.5;
    f.rays01 = 0.55; f.setLamps(0); f.fireflies01 = 0;
    warm.intensity = 0; dog.setWarmth(0);
    boy.pose = 'idle';
    boy.setExpression('neutral');
    const standAt = seat.clone().addScaledVector(f.faceDir, 0.3);
    standAt.y = f.height(standAt.x, standAt.z);
    boy.root.position.copy(standAt);
    boy.root.rotation.y = headingOf(f.faceDir);
    dog.lookTarget = boy.head.g.getWorldPosition(new THREE.Vector3());
    dog.wag = 0.7;
    const pov = shots(c).shadowPOV();
    c.shot.set(pov.pos, pov.look, 48);
    c.camMode = 'shot';
    engine.pipeline.setLetterbox(1);
  }

  // 1 ── epigraph
  if (play('epigraph')) await tl.hold(epigraph(PROLOGUE.epigraph, { hold: 2.4, stagger: 1.7 }));

  // 2 ── breakfast
  if (play('breakfast')) {
    audio.music('prologue');
    const vig = await tl.hold(showVignette('dawn', 1.6, () => { black.el.style.transition = 'none'; black.el.style.opacity = '0'; }));
    c.dom.push(vig.el);
    await tl.wait(0.9);
    const moods: Record<number, Mood> = { 2: 'surprised', 4: 'neutral' };
    const lines: DialogueLine[] = PROLOGUE.breakfast.map((l, i) => l.who === 'boy'
      ? { speaker: PROLOGUE.boyName, portrait: P.boy(moods[i] ?? 'neutral'), side: 'left', text: l.text }
      : { speaker: PROLOGUE.motherName, portrait: P.mother(i === 5 ? 'neutral' : 'smile'), side: 'right', text: l.text, speed: 0.8 });
    await tl.hold(dialogue.say(lines));
    await tl.wait(0.4);
    await tl.hold(centerLine(PROLOGUE.breakfastAfter, { hold: 1.8 }));
    await tl.hold(vig.close(1.6, () => { black.el.style.transition = 'none'; black.el.style.opacity = '1'; }));
  }

  // 3 ── the forest before dawn: walk to the log
  if (play('walk')) {
    audio.ambience('forest_dawn', true, 0.45);
    audio.ambience('wind', true, 0.2);
    await tl.hold(black.to(0, 2.6));
    c.block(false);
    input.enabled = true;
    walking = true;
    await tl.wait(1.2);
    hint(PROLOGUE.walkHint, 5);
    let prompt: ReturnType<typeof keyPrompt> | null = null;
    let again = 25;
    await tl.until(() => {
      const d = boy.root.position.distanceTo(seat);
      if (d < 2.4 && !prompt) prompt = keyPrompt('E', PROLOGUE.sitHint);
      if (d > 3.2 && prompt) { prompt.remove(); prompt = null; }
      again -= tl.lastDt;
      if (again <= 0 && d > 6) { again = 30; hint('Sigue el sendero hasta el borde del bosque', 4); }
      return !!prompt && input.actionPressed('interact');
    });
    (prompt as ReturnType<typeof keyPrompt> | null)?.remove();
  }

  // 4 ── he sits; Bruma sits beside him
  if (play('sit')) {
    walking = false;
    input.enabled = false;
    c.block(true);
    boySpeed = 0;
    const p0 = boy.root.position.clone();
    const r0 = boy.root.rotation.y;
    const r1 = headingOf(f.faceDir);
    const dogFrom = dog.root.position.clone(), dogTo = dogSeatPos(f);
    c.shot.set(c.camera.position.clone(), boy.root.position.clone().add(new THREE.Vector3(0, 1, 0)));
    c.camMode = 'shot';
    engine.pipeline.setLetterbox(1);
    const s = shots(c).silhouette();
    c.shot.move(tl, s.pos, s.look, 3.2, ease.inOut, 46).catch(() => undefined);
    await tl.tween(0.9, (k) => {
      boy.root.position.lerpVectors(p0, seat, k);
      boy.root.rotation.y = r0 + angleTo(r0, r1) * k;
      boySpeed = k < 0.9 ? 1.2 : 0;
    });
    seatBoy(c);
    dogSpeed = 2;
    await tl.tween(1.3, (k) => {
      dog.root.position.lerpVectors(dogFrom, dogTo, k);
      dog.root.position.y = f.height(dog.root.position.x, dog.root.position.z);
      dog.root.rotation.y = Math.atan2(dogTo.x - dogFrom.x, dogTo.z - dogFrom.z);
    });
    dogSpeed = 0;
    seated();
    await tl.wait(1.2);
  }

  // 5 ── dawn
  if (play('dawn')) {
    audio.ambience('forest_dawn', true, 0.65);
    tl.bg(16, (k) => {
      c.atmos.time = 0.216 + k * (0.302 - 0.216);
      f.fireflies01 = 1 - sstep(0, 0.5, k);
      f.setLamps(0.8 * (1 - sstep(0.2, 0.9, k)) + 0.05);
      f.rays01 = sstep(0.35, 0.85, k);
      c.atmos.mist = hexLerp(hexLerp('#9aa3c8', '#ffcf98', sstep(0.25, 0.6, k)), '#f6dcb8', sstep(0.6, 1, k));
      c.atmos.mistD = 1.1 - k * 0.3;
      c.atmos.near = 9 + k * 10; c.atmos.far = 105 + k * 80;
    }, ease.linear);
    const s = shots(c).silhouetteClose();
    c.shot.move(tl, s.pos, s.look, 15, ease.sine).catch(() => undefined);
    await tl.wait(5);
    f.startBirds();
    await tl.wait(2.5);
    void sayLine(PROLOGUE.dawnLine, {}, { position: 'bottom', hold: 3.2 });
    await tl.wait(8.8);
  }

  const s0 = shots(c);
  const sov = s0.overShoulder(), sbf = s0.boyFace();

  // 6 ── the shadow forms in the mist; the morning clouds over, little by little
  if (play('shadow')) {
    sh.root.visible = true;
    sh.root.position.copy(f.shadowPos);
    sh.root.rotation.y = headingOf(f.logPos.clone().sub(f.shadowPos));
    sh.setOpacity(0.001);
    audio.music('prologue_dark', { fade: 6 });
    tl.bg(15, (k) => {
      sh.setOpacity(Math.max(0.001, k * k * 0.8));
      c.atmos.overcast = sstep(0.05, 0.9, k) * 0.85;
      f.rays01 = Math.max(0, 1 - k * 1.4);
      c.atmos.near = 19 - k * 9; c.atmos.far = 185 - k * 90;
    }, ease.linear);
    audio.ambience('wind', true, 0.5);
    c.shot.set(sov.pos, sov.look, 44);
    await tl.wait(4.2);
    boy.setExpression('scared');
    c.shot.set(sbf.pos, sbf.look, 40);
    await tl.wait(3.0);
    const sw = s0.wide();
    c.shot.set(sw.pos, sw.look, 48);
    audio.sfx('heartbeat', { volume: 0.6 });
    await tl.wait(3.2);
    c.shot.set(sov.pos, sov.look, 44);
    c.shot.move(tl, sov.pos.clone().lerp(sov.look, 0.12), sov.look, 4, ease.in, 38).catch(() => undefined);
    audio.sfx('heartbeat', { volume: 0.8 });
    await tl.wait(2.2);
    audio.sfx('heartbeat', { volume: 1 });
    await tl.wait(1.6);
  }

  // 7 ── in a blink, everything is night — for him
  if (play('blink')) {
    engine.pipeline.impact(1, 1);
    c.atmos.night = 1; c.atmos.overcast = 0.35;
    f.setLamps(1); f.rays01 = 0;
    sh.root.visible = true;
    sh.setOpacity(1);
    sh.root.position.copy(f.logPos).addScaledVector(f.faceDir, 5.4).addScaledVector(f.right, 0.3);
    sh.root.position.y = f.height(sh.root.position.x, sh.root.position.z);
    sh.root.rotation.y = headingOf(f.logPos.clone().sub(sh.root.position));
    audio.music('prologue_dark', { fade: 1 });
    audio.ambience('forest_dawn', false);
    audio.ambience('night', true, 0.5);
    audio.sfx('heartbeat', { volume: 1 });
    dog.setWarmth(0.3);
    warm.intensity = 0.5;
    const s = shots(c).overShoulder();
    c.shot.set(s.pos, s.look, 42);
    await tl.wait(2.8);
    c.shot.set(sbf.pos, sbf.look, 38);
    await tl.wait(1.8);
  }

  // 8 ── Bruma is not afraid: for her it is still a beautiful dawn
  if (play('bruma')) {
    const saved = { night: c.atmos.night, overcast: c.atmos.overcast, mist: c.atmos.mist, time: c.atmos.time };
    c.atmos.night = 0; c.atmos.overcast = 0; c.atmos.time = 0.285; c.atmos.mist = '#ffd6a2';
    f.rays01 = 0.9; f.setLamps(0.05);
    sh.root.visible = false;
    dog.wag = 0.55;
    dog.setWarmth(0.08);
    warm.intensity = 0;
    const look0 = dog.lookTarget;
    dog.lookTarget = eastFar;
    audio.ambience('forest_dawn', true, 0.5);
    audio.duck(0.7, 3.6);
    const sd = shots(c).dogFace();
    c.shot.set(sd.pos, sd.look, 38);
    c.shot.move(tl, sd.pos.clone().lerp(sd.look, 0.12), sd.look, 3.6, ease.sine, 36).catch(() => undefined);
    await tl.wait(3.6);
    c.atmos.night = saved.night; c.atmos.overcast = saved.overcast; c.atmos.mist = saved.mist; c.atmos.time = saved.time;
    f.rays01 = 0; f.setLamps(1);
    dog.setWarmth(0.3);
    warm.intensity = 0.5;
    dog.lookTarget = look0;
    sh.root.visible = true;
    audio.ambience('forest_dawn', false);
    const s = shots(c).overShoulder();
    c.shot.set(s.pos, s.look, 42);
    await tl.wait(0.8);
  }

  // 9 ── [Clic]: he stands and throws the light
  if (play('light')) {
    await tl.hold(clickPrompt(PROLOGUE.clickPrompt));
    boy.setExpression('determined');
    boy.pose = 'idle';
    const standAt = seat.clone().addScaledVector(f.faceDir, 0.3);
    standAt.y = f.height(standAt.x, standAt.z);
    boy.root.position.copy(standAt);
    const side = f.logPos.clone().addScaledVector(f.right, 2.6).addScaledVector(f.faceDir, 1.4).add(new THREE.Vector3(0, 0.95, 0));
    const mid = f.logPos.clone().lerp(sh.root.position, 0.45).add(new THREE.Vector3(0, 1.0, 0));
    c.shot.set(side, mid, 46);
    boy.pose = 'point';
    const lids = eyelids(c);
    const burst = lightBurst(c, () => handPos(boy), sh.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
    await tl.wait(1.25);
    void lids.close(0.5);
    await tl.hold(burst);
    await tl.wait(0.7);
    // 10 ── eyes closed. Then: a normal morning, as if nothing had happened.
    morningState();
    audio.music('silence', { fade: 0.5 });
    audio.ambience('night', false);
    audio.ambience('forest_dawn', true, 0.55);
    c.shot.handheld = 0.035;
    await tl.wait(1.8);
    await tl.hold(lids.open(2.4));
    await tl.wait(2.8);
  } else if (play('morning')) {
    audio.ambience('forest_dawn', true, 0.55);
    await tl.wait(1.5);
  }

  // 11 ── a voice behind him
  if (play('voice')) {
    const line = showSiempre({ hold: 3.6 });
    await tl.wait(3.4);
    const rot0 = boy.root.rotation.y;
    boy.setExpression('scared');
    const sa = shots(c).sideAfter();
    c.shot.handheld = 0.02;
    c.shot.set(sa.pos, sa.look, 44);
    await tl.tween(1.5, (k) => { boy.root.rotation.y = rot0 + Math.PI * k; }, ease.inOut);
    await tl.wait(1.6);
    await tl.hold(line);
  }

  // 12 ── rain, harder and harder. "Corre."
  if (play('rain')) {
    audio.ambience('rain', true, 0.55);
    tl.bg(6, (k) => { c.rain!.intensity = k * 0.45; c.atmos.rain = k * 0.65; f.rays01 = 0.55 * (1 - k); });
    await tl.wait(3);
    audio.sfx('thunder', { volume: 0.55 });
    tl.bg(9, (k) => { c.rain!.intensity = 0.45 + k * 0.55; c.atmos.rain = 0.65 + k * 0.35; });
    audio.ambience('rain_heavy', true, 0.75);
    await tl.wait(1.2);
    const corre = h('div', { class: 'st-corre' }, PROLOGUE.run);
    layer('narrator').appendChild(corre);
    c.dom.push(corre);
    requestAnimationFrame(() => corre.classList.add('in'));
    audio.sfx('heartbeat', { volume: 0.8 });
    await tl.wait(1.6);
    corre.classList.add('out');
    engine.pipeline.setLetterbox(0);
    boy.setExpression('determined');
    walker.heading = boy.root.rotation.y;
    c.rig.yaw = walker.heading + Math.PI;
    c.rig.follow(boy.root.position, true);
    c.camMode = 'rig';
    c.block(false);
    input.enabled = true;
    walking = true;
    hint(PROLOGUE.runHint, 5);
    let thunderT = 8, idleT = 0;
    await tl.until(() => {
      thunderT -= tl.lastDt;
      if (thunderT <= 0) { thunderT = 10 + Math.random() * 8; audio.sfx('thunder', { volume: 0.4 + Math.random() * 0.3 }); engine.pipeline.flash('#dfe6ff', 0.25, 0.25); }
      idleT = walker.speed < 0.3 ? idleT + tl.lastDt : 0;
      if (idleT > 14) { idleT = 0; hint('Corre a casa, por el sendero', 4); }
      return boy.root.position.distanceTo(f.homePos) < 5;
    });
    walking = false;
    input.enabled = false;
    c.block(true);
    await tl.hold(black.to(1, 1.1));
  }

  // 13 ── the parents
  if (play('parents')) {
    black.el.style.opacity = '1';
    c.block(true);
    audio.ambience('rain_heavy', false);
    audio.ambience('rain', true, 0.35);
    audio.ambience('forest_dawn', false);
    audio.ambience('wind', false);
    const vig2 = await tl.hold(showVignette('rain', 1.2, () => { black.el.style.transition = 'none'; black.el.style.opacity = '0'; }));
    c.dom.push(vig2.el);
    vig2.shakeDog();
    audio.sfx('bark', { volume: 0.35, pitch: 1.2 });
    await tl.wait(1.2);
    const pl = PROLOGUE.parents;
    await tl.hold(dialogue.say([{ speaker: PROLOGUE.boyName, portrait: P.boy('scared'), side: 'left', text: pl[0].text }]));
    await tl.hold(sayLine({ third: pl[1].text }, {}, { position: 'center', hold: 2.4 }));
    await tl.hold(dialogue.say([
      { speaker: PROLOGUE.motherName, portrait: P.mother('smile'), side: 'right', text: pl[2].text, speed: 0.8 },
      { speaker: PROLOGUE.fatherName, portrait: P.father('neutral'), side: 'right', text: pl[3].text, speed: 0.8 },
    ]));
    await tl.wait(0.6);
    await tl.hold(vig2.close(1.8, () => { black.el.style.transition = 'none'; black.el.style.opacity = '1'; }));
    audio.ambience('rain', false);
  }
  disposers.forEach((d) => d());
  await finish(c, false);
}

/** Title reveal → Fragment card → the Concordia duel. Also the landing point of a skip. */
async function finish(c: PCtx, skipped: boolean): Promise<void> {
  const tl: Timeline = c.director.timeline();
  c.tl = tl;
  c.block(true);
  input.enabled = false;
  const black = blackout();
  c.dom.push(black.el);
  if (skipped) {
    await black.to(1, 0.8);
    tl.guard();
    audio.music('silence', { fade: 1 });
    await centerLine(PROLOGUE.skipSnark, { hold: 2.2 });
    unlockAchievement('saltar');
  } else {
    black.el.style.opacity = '1';
  }
  if (!c.alive) return;
  audio.music('title');
  await logoCard(3.2);
  if (G.meta) { G.meta.seenPrologue = true; saveMeta(); }
  if (!c.alive) return;
  await startAurelDuel();
}
