/**
 * End of the cycle (GDD §2.3 "Él", step 7): the prologue again — but now you are the shadow.
 * The morning darkens as you approach (you are what darkens it). The boy stands and throws the light at you.
 * When it clears you are behind him. [E] Hablar → "Siempre estuve viéndote." → cycle:end → credits → margins.
 */
import * as THREE from 'three';
import { G } from '../../core/state';
import { input } from '../../core/input';
import { engine } from '../../core/engine';
import { audio } from '../../audio';
import { ENDING } from '../../data/story';
import { blackout, showSiempre, keyPrompt, hint, rollCredits } from '../../systems/story/ui';
import { unlockAchievement } from '../../systems/story/achievements';
import { endCycle } from '../../systems/story/cycle';
import { ease } from './director';
import { setupForest, seatBoy, seatDog, headingOf, shots, Walker, lightBurst, handPos, eyelids } from './forestKit';
import type { PCtx } from './index';

const sstep = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export async function runShadow(c: PCtx): Promise<void> {
  const tl = c.tl;
  const black = blackout();
  black.el.style.opacity = '1';
  c.dom.push(black.el);
  c.block(true);
  input.enabled = false;
  const f = setupForest(c);
  const boy = c.boy!, dog = c.dog!, sh = c.shadow!;

  // the same dawn as the first time
  c.atmos.time = 0.286; c.atmos.near = 16; c.atmos.far = 170; c.atmos.mist = '#f6d6ae'; c.atmos.mistD = 0.9;
  f.rays01 = 0.9; f.setLamps(0.05); f.fireflies01 = 0;
  seatBoy(c); seatDog(c);
  dog.wag = 0.6;
  // you
  sh.root.visible = true;
  sh.setOpacity(1);
  const start = f.logPos.clone().addScaledVector(f.faceDir, 27).addScaledVector(f.right, 2.5);
  start.y = f.height(start.x, start.z);
  sh.root.position.copy(start);
  const toBoy = f.logPos.clone().sub(start).setY(0).normalize();
  sh.root.rotation.y = headingOf(toBoy);
  const walker = new Walker(sh, 2.3, 3.4);
  walker.heading = sh.root.rotation.y;
  c.rig.distance = 6.6; c.rig.pitch = 0.26; c.rig.lookOffset.set(0, 1.6, 0);
  c.rig.yaw = walker.heading + Math.PI;
  c.rig.follow(sh.root.position, true);
  c.camMode = 'rig';

  let walking = false;
  let boyStood = false;
  let heartT = 0;
  let darkMusic = false;
  const shHead = new THREE.Vector3();
  c.hooks.add((dt) => {
    boy.update(dt, { speed: 0 });
    sh.update(dt, { speed: walking ? walker.speed : 0 });
    sh.head.g.getWorldPosition(shHead);
    dog.lookTarget = shHead;       // she looks at you — calm, as if you were the sunrise
    dog.update(dt, { speed: 0 });
    if (Math.random() < dt * 3.5) c.fx.emit('shadow', sh.root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.1 + Math.random() * 0.5, (Math.random() - 0.5) * 1.2)), { count: 1, size: 0.8, sizeEnd: 1.7, life: 1.6, speed: 0.3, up: 0.2, color: '#07040b', color2: '#1b1028' });
  });
  const walkHook = (dt: number) => {
    if (!walking) return;
    walker.update(dt, c, { canRun: true });
    // you are what darkens the morning
    const d = sh.root.position.distanceTo(f.logPos);
    const k = 1 - sstep(6, 26, d);
    c.atmos.overcast = sstep(0, 0.55, k) * 0.7;
    c.atmos.night = sstep(0.35, 1, k);
    f.rays01 = 0.9 * (1 - sstep(0, 0.6, k));
    f.setLamps(sstep(0.5, 1, k));
    c.atmos.near = 16 - k * 10; c.atmos.far = 170 - k * 110;
    if (k > 0.45 && !boyStood) boy.setExpression('scared');
    heartT -= dt;
    if (k > 0.3 && heartT <= 0) { heartT = 2.6 - k * 1.6; audio.sfx('heartbeat', { volume: 0.4 + k * 0.6 }); }
    if (k > 0.25 && !darkMusic) { darkMusic = true; audio.music('prologue_dark', { fade: 6 }); }
  };
  c.hooks.add(walkHook);

  audio.music('prologue');
  audio.ambience('forest_dawn', true, 0.6);
  await tl.hold(black.to(0, 3));
  c.block(false);
  input.enabled = true;
  walking = true;
  let hinted = false;
  await tl.until(() => {
    if (!hinted && walker.speed < 0.2 && tl.lastDt > 0) { hinted = true; setTimeout(() => { if (walker.speed < 0.2 && c.alive) hint('WASD', 3); }, 4000); }
    return sh.root.position.distanceTo(f.logPos) < 6.2;
  });

  // the boy stands and throws the light at you
  walking = false;
  input.enabled = false;
  c.block(true);
  audio.music('prologue_dark', { fade: 1 });
  audio.ambience('forest_dawn', false);
  c.atmos.night = 1; c.atmos.overcast = 0.35; f.rays01 = 0; f.setLamps(1);
  boy.pose = 'idle';
  boyStood = true;
  boy.setExpression('determined');
  const standAt = boy.root.position.clone().addScaledVector(f.faceDir, 0.3);
  standAt.y = f.height(standAt.x, standAt.z);
  boy.root.position.copy(standAt);
  boy.root.rotation.y = headingOf(sh.root.position.clone().sub(standAt));
  const pov = sh.root.position.clone().add(new THREE.Vector3(0, 1.7, 0)).addScaledVector(toBoy, -1.2);
  c.shot.set(pov, boy.root.position.clone().add(new THREE.Vector3(0, 0.9, 0)), 44);
  c.camMode = 'shot';
  engine.pipeline.setLetterbox(1);
  await tl.wait(1.2);
  boy.pose = 'point';
  const lids = eyelids(c);
  const burst = lightBurst(c, () => handPos(boy), sh.root.position.clone().add(new THREE.Vector3(0, 1.3, 0)));
  await tl.wait(1.25);
  void lids.close(0.45);
  await tl.hold(burst);
  await tl.wait(1.4);

  // when it clears: a normal morning, and you are behind him
  c.atmos.night = 0; c.atmos.overcast = 0; c.atmos.time = 0.31;
  c.atmos.near = 26; c.atmos.far = 230; c.atmos.mist = '#f5ebda'; c.atmos.mistD = 0.5;
  f.rays01 = 0.55; f.setLamps(0);
  audio.music('silence', { fade: 0.4 });
  audio.ambience('forest_dawn', true, 0.5);
  boy.pose = 'idle';
  boy.setExpression('neutral');
  boy.root.rotation.y = headingOf(f.faceDir);
  const behind = f.logPos.clone().addScaledVector(f.faceDir, -1.5);
  behind.y = f.height(behind.x, behind.z);
  sh.root.position.copy(behind);
  sh.root.rotation.y = headingOf(f.faceDir);
  sh.root.visible = false; // the camera is your eyes now
  const p = shots(c).shadowPOV();
  c.shot.handheld = 0.035;
  c.shot.set(p.pos, p.look, 48);
  await tl.wait(1.6);
  await tl.hold(lids.open(2.4));
  await tl.wait(1.2);
  const prompt = keyPrompt('E', ENDING.talk);
  c.dom.push(prompt.el);
  await tl.until(() => input.rawPressed('KeyE') || input.rawPressed('KeyF'));
  prompt.remove();

  // the last line of the cycle — yours
  unlockAchievement('siempre');
  const line = showSiempre({ hold: 4 });
  await tl.wait(4.6);
  // he starts to turn… and the page closes before he can see
  const r0 = boy.root.rotation.y;
  boy.setExpression('scared');
  c.tl.bg(1.6, (k) => { boy.root.rotation.y = r0 + Math.PI * 0.35 * k; }, ease.in);
  await tl.wait(0.7);
  await tl.hold(black.to(1, 0.35));
  await tl.hold(line);
  audio.ambience('forest_dawn', false);
  endCycle('el');
  await tl.wait(1.2);
  await rollCredits();
  if (!c.alive) return;
  if (G.meta) G.meta.flags.st_seen_ending = true;
  await engine.goto('margins', { ending: 'el' }, { fade: 1 });
}
