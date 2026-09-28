/**
 * Alerta del Concilio (GDD §4.1): 50+ hero hunters, 75+ the Gran Alianza mobilizes, 100 starts the Gran Sello
 * (3 lunas). If the Alert is still ≥ 90 when the ritual ends → sello:complete (story plays the bad ending).
 * Dropping below 90 during the ritual breaks it.
 * Alert itself lives in G.run.player.alert and changes through res.add('alert', n) from anywhere.
 */
import { G, res } from '../../core/state';
import { bus } from '../../core/events';
import { addNews } from '../../core/news';
import { track } from '../../core/tracker';
import { engine } from '../../core/engine';
import { banner, toast } from '../../ui/toasts';
import { narrate } from '../../ui/narrator';
import { audio } from '../../audio';
import { corruptedContinents, luna, soc, veloActive } from './state';

export interface AlertState {
  level: number;
  tier: 'calma' | 'vigilancia' | 'cazadores' | 'alianza' | 'sello';
  label: string;
  color: string;
  /** Per-luna drift if nothing loud happens (negative = decays). */
  drift: number;
  sello: { active: boolean; remaining: number; total: number } | null;
  alliance: boolean;
  bounty: boolean;
  nextHuntersIn: number | null;
}

const TIERS: Array<{ min: number; tier: AlertState['tier']; label: string; color: string }> = [
  { min: 100, tier: 'sello', label: 'El Gran Sello', color: '#ffffff' },
  { min: 75, tier: 'alianza', label: 'La Gran Alianza moviliza', color: '#ff3b5c' },
  { min: 50, tier: 'cazadores', label: 'Cazadores del Concilio', color: '#ff7a45' },
  { min: 25, tier: 'vigilancia', label: 'Vigilancia', color: '#ffc857' },
  { min: 0, tier: 'calma', label: 'Calma', color: '#9ad1c4' },
];

function huntersInterval(level: number): number { return level >= 75 ? 2 : 3; }

/** True while the per-luna drift is being applied (drift is not a "loud act"). */
let drifting = false;

/** Natural per-luna Alert drift (decay minus world pressure). */
export function alertDrift(): number {
  const s = soc();
  const l = luna();
  let d = -2.5;
  if (l - s.alert.lastLoud <= 1) d += 2.5;        // no decay right after a loud act
  d += corruptedContinents().length * 1.2;         // the world is scared
  if (s.alert.bountyUntil > l) d += 1;
  if (veloActive()) d -= 1.5;
  return Math.round(d * 10) / 10;
}

export function alertState(): AlertState {
  const s = soc();
  const level = Math.round(G.run?.player.alert ?? 0);
  const t = s.alert.selloActive ? TIERS[0] : TIERS.find((x) => level >= x.min) ?? TIERS[TIERS.length - 1];
  const nextHunters = level >= 50 ? Math.max(0, s.alert.lastHunters + huntersInterval(level) - luna()) : null;
  return {
    level, tier: t.tier, label: t.label, color: t.color, drift: alertDrift(),
    sello: s.alert.selloActive ? { active: true, remaining: s.alert.selloRemaining, total: s.alert.selloTotal } : null,
    alliance: s.alert.alliance, bounty: s.alert.bountyUntil > luna(), nextHuntersIn: nextHunters,
  };
}

function hunterStrength(): number {
  const a = G.run.player.alert;
  return Math.round((1 + a / 50 + corruptedContinents().length * 0.3) * 10) / 10;
}

export function emitHunters(extra = 0): void {
  const s = soc();
  const a = G.run.player.alert;
  const count = Math.max(1, 1 + Math.floor(Math.max(0, a - 50) / 20) + extra);
  s.alert.lastHunters = luna();
  bus.emit('alert:hunters', { count, strength: hunterStrength() });   // the world module spawns them (and reports it)
}

export function mobilizeAlliance(reason = ''): void {
  const s = soc();
  if (s.alert.alliance) return;
  s.alert.alliance = true;
  const strength = Math.round((1 + G.run.player.alert / 40 + corruptedContinents().length * 0.5) * 10) / 10;
  bus.emit('alert:alliance', { strength });
  audio.sfx('horn_war');
  toast('<b>La Gran Alianza se moviliza.</b> Cinco estandartes marchan hacia ti.', { kind: 'bad', duration: 5 });
  addNews(`La Gran Alianza se moviliza${reason ? ': ' + reason : ''}. Por primera vez en generaciones, los cinco continentes marchan juntos.`, 'concilio', true);
}

function startSello(): void {
  const s = soc();
  if (s.alert.selloActive) return;
  s.alert.selloActive = true;
  s.alert.selloTotal = 3;
  s.alert.selloRemaining = 3;
  bus.emit('sello:start', { lunas: 3 });
  track('sello_started');
  audio.sfx('bell');
  audio.sfx('alert_rise');
  engine.pipeline?.flash('#ffffff', 0.35, 0.8);
  addNews('En Concordia, cinco magos empezaron a escribir una página en blanco. Dicen que es para ti.', 'concilio', true);
  void banner('EL GRAN SELLO', 'Tres lunas. Baja la Alerta de 90 o te encerrarán en una página en blanco.', { kind: 'defeat', duration: 3.4 });
  void narrate({
    third: 'En Concordia empezaron a escribir una página en blanco. Tenía su forma exacta.',
    first: 'En Concordia empezaron a escribir una página en blanco. Tenía mi forma exacta.',
  }, { position: 'center' });
}

function breakSello(): void {
  const s = soc();
  if (!s.alert.selloActive) return;
  s.alert.selloActive = false;
  s.alert.selloRemaining = 0;
  bus.emit('sello:broken', {});
  track('sello_broken');
  audio.stinger('excepcion');
  void banner('EL SELLO SE ROMPE', 'La página en blanco se mancha de tinta violeta.', { kind: 'excepcion', duration: 2.6 });
  addNews('El ritual del Gran Sello fracasó. Los cinco magos de Concordia no quieren hablar de lo que vieron en la página.', 'concilio', true);
}

/** React to every Alert change (from any module) — thresholds are checked immediately. */
export function onAlertChange(value: number): void {
  const s = soc();
  const prev = s.alert.last;
  s.alert.last = value;
  s.alert.peak = Math.max(s.alert.peak, value);
  if (value > prev && !drifting) s.alert.lastLoud = luna();
  if (prev < 50 && value >= 50) {
    toast('<b>Alerta 50:</b> el Concilio contrata cazadores de héroes.', { kind: 'bad', duration: 4.5 });
    audio.sfx('alert_rise');
    emitHunters();
  }
  if (prev < 75 && value >= 75) mobilizeAlliance('la Alerta del Concilio es insoportable');
  if (value < 65 && s.alert.alliance && prev >= 65) {
    s.alert.alliance = false;
    addNews('La Gran Alianza se dispersa. Los estandartes vuelven a casa, discutiendo quién tuvo la culpa.', 'concilio');
  }
  if (value >= 100 && !s.alert.selloActive) startSello();
  if (s.alert.selloActive && value < 90) breakSello();
}

/** Per-luna Alert update: drift, periodic hunters, Sello countdown. */
export function alertLunaTick(): void {
  const s = soc();
  const d = alertDrift();
  if (d !== 0) {
    drifting = true;
    try { res.add('alert', d, { raw: d < 0 }); } finally { drifting = false; }
  }
  const a = G.run.player.alert;
  if (a >= 50 && luna() - s.alert.lastHunters >= huntersInterval(a)) emitHunters();
  else if (s.alert.bountyUntil > luna() && luna() - s.alert.lastHunters >= 2) emitHunters();
  if (s.alert.selloActive) {
    s.alert.selloRemaining = Math.max(0, s.alert.selloRemaining - 1);
    bus.emit('sello:progress', { remaining: s.alert.selloRemaining });
    if (s.alert.selloRemaining > 0) {
      toast(`<b>El Gran Sello:</b> ${s.alert.selloRemaining === 1 ? 'queda una luna' : `quedan ${s.alert.selloRemaining} lunas`}.`, { kind: 'bad', duration: 4 });
      audio.sfx('heartbeat');
    } else if (G.run.player.alert >= 90) {
      s.alert.selloActive = false;
      track('sello_complete');
      bus.emit('sello:complete', {});
    } else {
      breakSello();
    }
  }
}
