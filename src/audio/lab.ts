/**
 * Audio Lab (dev page: /audio-lab.html). Exercises the public API from
 * src/audio/index.ts: every mood/region, sfx, stinger and ambience, plus
 * volume/intensity controls, stress tests and offline diagnostics.
 */
import { type Ambience, type MusicMood, type Region, type SfxName, type StingerName, audio } from './index';
import type { EngineDebug } from './engine';
import { AMBIENCES, MUSIC_MOODS, REGIONS, SFX_NAMES, STINGERS } from './types';

const $ = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: Array<Node | string>): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const k of kids) el.append(k);
  return el;
};

const app = document.getElementById('app') ?? document.body;
const section = (title: string, ...kids: Node[]): HTMLElement => {
  const s = $('section', {}, $('h2', {}, title), ...kids);
  app.append(s);
  return s;
};

interface EngineLike { debug(): EngineDebug; meter(): { rms: number; peak: number } }
const engine = (): EngineLike | undefined => (globalThis as unknown as { __lxAudioEngine?: EngineLike }).__lxAudioEngine;

// ── engine ──
const status = $('div', { class: 'status' }, 'bloqueado — haz clic en «Unlock» (o en cualquier parte)');
const unlockBtn = $('button', { class: 'primary', onclick: () => void audio.unlock() }, 'Unlock');
const muteBtn = $('button', {
  onclick: () => {
    muted = !muted;
    audio.setMuted(muted);
    muteBtn.textContent = muted ? 'Unmute' : 'Mute';
  },
}, 'Mute');
let muted = false;
let voice = true;
const voiceBtn = $('button', {
  onclick: () => {
    voice = !voice;
    audio.setVoiceEnabled(voice);
    voiceBtn.textContent = voice ? 'Voz: on' : 'Voz: off';
  },
}, 'Voz: on');
const meterBar = $('div', { class: 'meter' }, $('div', { class: 'fill' }), $('div', { class: 'pk' }));
const meterTxt = $('span', { class: 'val' }, '— dB');
section('Motor', $('div', { class: 'row' }, unlockBtn, muteBtn, voiceBtn, $('span', {}, ' salida '), meterBar, meterTxt), status);
let pkHold = -120;
let pkAt = 0;
const drawMeter = (): void => {
  const m = engine()?.meter();
  if (m) {
    const now = performance.now();
    if (m.peak > pkHold || now - pkAt > 1500) {
      pkHold = m.peak;
      pkAt = now;
    }
    const pct = (db: number): string => `${Math.max(0, Math.min(100, ((db + 60) / 60) * 100))}%`;
    (meterBar.firstChild as HTMLElement).style.width = pct(m.rms);
    (meterBar.lastChild as HTMLElement).style.left = pct(pkHold);
    meterTxt.textContent = `rms ${m.rms.toFixed(1)} · pico ${pkHold.toFixed(1)} dBFS`;
  }
  requestAnimationFrame(drawMeter);
};
requestAnimationFrame(drawMeter);

setInterval(() => {
  const d = engine()?.debug();
  if (!d) {
    status.textContent = audio.unlocked ? 'desbloqueado' : 'bloqueado — haz clic en «Unlock» (o en cualquier parte)';
    return;
  }
  status.textContent = `ctx ${d.state} · t=${d.time.toFixed(1)}s · mood ${d.mood} (${d.region}) · piezas ${d.pieces} · sfx voces ${d.sfxVoices} · amb [${d.ambience.join(', ')}] · intensidad ${d.intensity.toFixed(2)} · duck ${d.duck.toFixed(2)} · ${d.sampleRate} Hz · latencia ${(d.baseLatency * 1000).toFixed(0)} ms`;
}, 250);

// ── volumes ──
const slider = (label: string, value: number, on: (v: number) => void): HTMLElement => {
  const out = $('span', { class: 'val' }, value.toFixed(2));
  const inp = $('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(value) });
  inp.addEventListener('input', () => {
    const v = Number(inp.value);
    out.textContent = v.toFixed(2);
    on(v);
  });
  return $('label', { class: 'slider' }, $('span', {}, label), inp, out);
};
section(
  'Volúmenes (persisten en localStorage «lx.audio»)',
  $('div', { class: 'row' },
    ...(['master', 'music', 'sfx', 'ambience'] as const).map((b) => slider(b, audio.getVolume(b), (v) => audio.setVolume(b, v)))),
);

// ── music ──
let region: Region = 'valdoria';
let fade = 2;
const regionSel = $('select', {});
for (const r of REGIONS) regionSel.append($('option', { value: r }, r));
regionSel.addEventListener('change', () => {
  region = regionSel.value as Region;
});
const fadeInp = $('input', { type: 'number', min: '0', max: '20', step: '0.5', value: '2', style: 'width:4em' });
fadeInp.addEventListener('change', () => {
  fade = Number(fadeInp.value) || 0;
});
const moodBtns = MUSIC_MOODS.map((m: MusicMood) =>
  $('button', {
    onclick: async () => {
      await audio.unlock();
      audio.music(m, { region, fade });
      for (const b of moodBtns) b.classList.toggle('on', b === btnOf(m));
    },
  }, m));
const btnOf = (m: MusicMood): HTMLButtonElement | undefined => moodBtns[MUSIC_MOODS.indexOf(m)];
section(
  'Música',
  $('div', { class: 'row' }, $('span', {}, 'Región '), regionSel, $('span', {}, ' fade (s) '), fadeInp),
  $('div', { class: 'grid' }, ...moodBtns),
  $('div', { class: 'row' }, slider('intensidad', 0, (v) => audio.setIntensity(v)),
    $('button', { onclick: () => audio.duck(0.7, 2) }, 'duck 0.7 × 2 s'),
    $('button', { onclick: () => audio.speak('Siempre estuve viéndote.') }, 'speak «Siempre estuve viéndote.»')),
);

// ── stingers ──
section('Stingers', $('div', { class: 'grid' }, ...STINGERS.map((s: StingerName) =>
  $('button', { onclick: async () => { await audio.unlock(); audio.stinger(s); } }, s))));

// ── ambience ──
let ambVol = 1;
const ambOn = new Set<Ambience>();
section(
  'Ambiente',
  $('div', { class: 'row' }, slider('volumen bed', 1, (v) => {
    ambVol = v;
    for (const a of ambOn) audio.ambience(a, true, ambVol);
  })),
  $('div', { class: 'grid' }, ...AMBIENCES.map((a: Ambience) => {
    const b = $('button', {
      onclick: async () => {
        await audio.unlock();
        const on = !ambOn.has(a);
        if (on) ambOn.add(a);
        else ambOn.delete(a);
        audio.ambience(a, on, ambVol);
        b.classList.toggle('on', on);
      },
    }, a);
    return b;
  })),
);

// ── sfx ──
let sPitch = 1;
let sVol = 1;
let sPan = 0;
const groups: Array<[string, (n: string) => boolean]> = [
  ['UI', (n) => n.startsWith('ui_')],
  ['Economía', (n) => ['coin', 'coins_many', 'purchase', 'sell'].includes(n)],
  ['Hechizos', (n) => n.startsWith('cast_')],
  ['Combate', (n) => ['whoosh', 'dash', 'teleport', 'hit_light', 'hit_heavy', 'hit_magic', 'punch_launch', 'explosion', 'shield_block', 'arrow_shot', 'arrow_hit', 'sword_swing', 'sword_clash', 'footstep', 'death_pop', 'ragdoll_thud'].includes(n)],
  ['Estados', (n) => ['heal', 'buff', 'debuff', 'invisibility_on', 'invisibility_off', 'mind_control', 'revive', 'level_up'].includes(n)],
  ['Botín / Excepción', (n) => n.startsWith('loot_') || n.startsWith('copy_')],
  ['Casino', (n) => ['dice_roll', 'dice_land', 'card_flip', 'card_deal', 'chip_place', 'slot_spin', 'slot_reel_stop', 'slot_near_miss', 'slot_win_small', 'slot_win_big', 'jackpot', 'wheel_tick', 'wheel_ball'].includes(n)],
  ['Multitud', (n) => n.startsWith('crowd_')],
];
const grouped = new Set<string>();
const sfxSec = section(
  'SFX',
  $('div', { class: 'row' },
    slider('pitch (×0.5–1.5)', 0.5, (v) => { sPitch = 0.5 + v; }),
    slider('volume', 1, (v) => { sVol = v; }),
    slider('pan (−1…1)', 0.5, (v) => { sPan = v * 2 - 1; })),
);
const sfxBtn = (n: SfxName): HTMLButtonElement => $('button', {
  onclick: async () => {
    await audio.unlock();
    audio.sfx(n, { pitch: sPitch, volume: sVol, pan: sPan });
  },
}, n);
for (const [title, pred] of groups) {
  const names = SFX_NAMES.filter((n) => pred(n));
  names.forEach((n) => grouped.add(n));
  sfxSec.append($('h3', {}, title), $('div', { class: 'grid' }, ...names.map(sfxBtn)));
}
sfxSec.append($('h3', {}, 'Varios'), $('div', { class: 'grid' }, ...SFX_NAMES.filter((n) => !grouped.has(n)).map(sfxBtn)));

// ── tests ──
const log = $('pre', { class: 'log' });
const say = (s: string): void => {
  log.textContent = s + '\n' + (log.textContent ?? '');
};
section(
  'Pruebas',
  $('div', { class: 'row' },
    $('button', {
      onclick: async () => {
        await audio.unlock();
        // 200-unit battle: 400 combat sfx in 2 s
        const pool: SfxName[] = ['hit_light', 'hit_heavy', 'sword_clash', 'sword_swing', 'arrow_hit', 'footstep', 'death_pop', 'ragdoll_thud', 'punch_launch', 'whoosh'];
        const t0 = performance.now();
        let n = 0;
        const id = setInterval(() => {
          for (let i = 0; i < 20; i++) {
            audio.sfx(pool[Math.floor(Math.random() * pool.length)] ?? 'hit_light', { pan: Math.random() * 2 - 1, volume: 0.4 + Math.random() * 0.6 });
            n++;
          }
          if (performance.now() - t0 > 2000) {
            clearInterval(id);
            say(`estrés: ${n} llamadas en 2 s (tope 24 voces)`);
          }
        }, 100);
      },
    }, 'Estrés: batalla de 200 unidades'),
    $('button', {
      onclick: async () => {
        await audio.unlock();
        let i = 0;
        const id = setInterval(() => {
          const n = SFX_NAMES[i++];
          if (!n) {
            clearInterval(id);
            return;
          }
          say(`▶ ${n}`);
          audio.sfx(n);
        }, 700);
      },
    }, 'Tocar todos los SFX'),
    $('button', {
      onclick: async () => {
        await audio.unlock();
        for (let i = 0; i < 12; i++) setTimeout(() => audio.sfx('coin', { pitch: 1 + i * 0.02 }), i * 45);
      },
    }, 'Lluvia de monedas'),
    $('button', {
      onclick: async () => {
        await audio.unlock();
        audio.music('prologue', { region, fade: 1 });
        setTimeout(() => audio.music('prologue_dark', { fade: 6 }), 9000);
        say('prólogo → (9 s) → prologue_dark con fundido de 6 s (misma armonía, sincronizado)');
      },
    }, 'Prólogo → oscuro'),
  ),
  log,
);

// ── diagnostics ──
const table = $('table', { class: 'diag' });
const diagRow = (s: { name: string; peakDb: number; rmsDb: number; loudDb: number; tail: number; cpu: number; clipped: number; bad: boolean }): void => {
  const warn = s.bad || s.clipped > 0 || s.peakDb > -1 || s.peakDb < -45;
  table.append($('tr', { class: warn ? 'warn' : '' },
    $('td', {}, s.name), $('td', {}, s.peakDb.toFixed(1)), $('td', {}, s.rmsDb.toFixed(1)), $('td', {}, s.loudDb.toFixed(1)),
    $('td', {}, s.tail.toFixed(2)), $('td', {}, (s.cpu * 100).toFixed(1) + '%'), $('td', {}, s.bad ? 'NaN!' : s.clipped ? `clip ${s.clipped}` : '')));
};
const header = (): void => {
  table.textContent = '';
  table.append($('tr', {}, ...['nombre', 'pico dB', 'RMS dB', 'RMS máx 1s', 'cola s', 'render/tiempo', ''].map((h) => $('th', {}, h))));
};
section(
  'Diagnóstico offline (render sin reproducir)',
  $('div', { class: 'row' },
    $('button', {
      onclick: async () => {
        const d = await import('./diagnostics');
        header();
        for (const n of SFX_NAMES) diagRow(await d.renderSfx(n));
      },
    }, 'Medir todos los SFX'),
    $('button', {
      onclick: async () => {
        const d = await import('./diagnostics');
        header();
        for (const s of STINGERS) diagRow(await d.renderStinger(s));
      },
    }, 'Medir stingers'),
    $('button', {
      onclick: async () => {
        const d = await import('./diagnostics');
        header();
        for (const m of MUSIC_MOODS) if (m !== 'silence') diagRow(await d.renderMood(m, region, 16, 0));
      },
    }, 'Medir todas las músicas (región actual, 16 s)'),
    $('button', {
      onclick: async () => {
        const d = await import('./diagnostics');
        header();
        for (const x of [0, 0.5, 1]) {
          diagRow(await d.renderMood('battle', region, 16, x));
          diagRow(await d.renderMood('boss', region, 16, x));
        }
      },
    }, 'Batalla/jefe por intensidad'),
    $('button', {
      onclick: async () => {
        const d = await import('./diagnostics');
        header();
        for (const a of AMBIENCES) diagRow(await d.renderAmbience(a));
      },
    }, 'Medir ambientes'),
  ),
  table,
);

// ── resumable diagnostics job (survives Vite full reloads; used from devtools/automation) ──
interface DiagItem { kind: 'mood' | 'sfx' | 'stinger' | 'amb'; name: string; region?: Region; x?: number; secs?: number }
interface DiagJob { items: DiagItem[]; results: string[]; done: boolean }
const JOB_KEY = 'lx.audio.diagJob';
const readJob = (): DiagJob | null => {
  try {
    const raw = sessionStorage.getItem(JOB_KEY);
    return raw ? (JSON.parse(raw) as DiagJob) : null;
  } catch {
    return null;
  }
};
const writeJob = (j: DiagJob): void => {
  try {
    sessionStorage.setItem(JOB_KEY, JSON.stringify(j));
  } catch {
    /* ignore */
  }
};
async function runJob(): Promise<void> {
  const job = readJob();
  if (!job || job.done) return;
  const d = await import('./diagnostics');
  while (job.items.length) {
    const it = job.items[0] as DiagItem;
    let s;
    if (it.kind === 'mood') s = await d.renderMood(it.name as MusicMood, it.region ?? 'valdoria', it.secs ?? 8, it.x ?? 0);
    else if (it.kind === 'sfx') s = await d.renderSfx(it.name as SfxName, it.secs ?? 4);
    else if (it.kind === 'stinger') s = await d.renderStinger(it.name as StingerName, it.secs ?? 8);
    else s = await d.renderAmbience(it.name as Ambience, it.secs ?? 10);
    job.results.push(
      `${it.kind}:${it.name}${it.region ? '/' + it.region : ''}${it.x !== undefined ? '@' + it.x : ''} rms ${s.rmsDb} pk ${s.peakDb} loud ${s.loudDb} vps ${s.vps} nodes ${s.nodes} cpu ${(s.cpu * 100).toFixed(1)}%${s.bad ? ' NaN!' : ''}${s.clipped ? ' clip' : ''}`,
    );
    job.items.shift();
    writeJob(job);
  }
  job.done = true;
  writeJob(job);
}
(globalThis as unknown as { __lxDiag?: unknown }).__lxDiag = {
  start(items: DiagItem[]): void {
    writeJob({ items, results: [], done: false });
    void runJob();
  },
  status(): DiagJob | null {
    return readJob();
  },
};
void runJob();
