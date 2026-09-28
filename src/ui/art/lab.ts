// Dev gallery for the procedural art (served at /art-lab.html).
import type { PortraitMood, PortraitSpec, RaceId } from './portraits';
import { PORTRAIT_MOODS, PORTRAIT_SPECIALS, RACE_IDS, portraitSVG } from './portraits';
import { ICON_NAMES, icon } from './icons';
import { FACE_EXPRS, FACE_VARIANTS, createFaceAtlas } from './faceAtlas';
import { RARITIES, RARITY_COLORS, RARITY_NAMES, RELIC_SHAPES, SLOT_SYMBOLS, crestSVG, logoSVG, relicSVG, slotSymbolSVG, tarotCardSVG } from './relicArt';
import { CREST_IDS } from './heraldry';
import { ARCANOS, PALOS } from './tarot';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app') as HTMLElement;
const nav = document.getElementById('nav') as HTMLElement;

function section(id: string, title: string, note?: string): HTMLElement {
  const s = document.createElement('section');
  s.id = id;
  s.innerHTML = `<h2>${title}</h2>${note ? `<p class="note">${note}</p>` : ''}`;
  app.appendChild(s);
  const a = document.createElement('a');
  a.href = `#${id}`;
  a.textContent = title;
  nav.appendChild(a);
  return s;
}

function grid(parent: HTMLElement, cls = ''): HTMLElement {
  const g = document.createElement('div');
  g.className = `grid ${cls}`;
  parent.appendChild(g);
  return g;
}

function cell(parent: HTMLElement, svg: string, label: string, cls = ''): HTMLElement {
  const d = document.createElement('div');
  d.className = `cell ${cls}`;
  d.innerHTML = `${svg}<div class="lbl" title="${label}">${label}</div>`;
  parent.appendChild(d);
  return d;
}

// ---------------------------------------------------------------------------
// Portraits
// ---------------------------------------------------------------------------

const JOBS = ['guerrero', 'arquero', 'curandero', 'hechicero', 'mercader', 'cortesana', 'herrero', 'erudito', 'cazador', 'sacerdote', 'bardo', 'ladron', 'minero', 'chaman', 'noble', 'soldado', 'campesino', 'banquero', 'crupier', 'capitan', 'espia', 'asesino', 'alquimista', 'pirata', 'guardian', 'rey', 'reina', 'tabernero', 'monje', 'delegado'];

function portraits(): void {
  const s = section('specials', 'Personajes', 'Retratos firmados: special + estados de ánimo.');
  for (const sp of PORTRAIT_SPECIALS) {
    const h = document.createElement('h3');
    h.textContent = sp;
    s.appendChild(h);
    const g = grid(s);
    const moods: PortraitMood[] = sp === 'bruma' || sp === 'shadow' || sp === 'narrador' ? ['neutral', 'smile', 'sad', 'angry', 'surprised', 'mind', 'dead'] : ['neutral', 'smile', 'smug', 'angry', 'scared', 'sad', 'surprised', 'determined', 'hurt', 'mind', 'dead', 'shadow'];
    for (const m of moods) cell(g, portraitSVG({ seed: sp, race: 'humano', special: sp, mood: m }, 168), m);
    if (sp === 'bruma') cell(g, portraitSVG({ seed: sp, race: 'humano', special: sp, age: 'old' }, 168), 'old');
  }

  const r = section('races', 'Linajes', 'Cada linaje con varias semillas / géneros.');
  for (const race of RACE_IDS) {
    const h = document.createElement('h3');
    h.textContent = race;
    r.appendChild(h);
    const g = grid(r);
    for (let i = 0; i < 6; i++) {
      const spec: PortraitSpec = { seed: `${race}-${i}`, race, gender: i % 2 ? 'm' : 'f' };
      if (i === 4) spec.age = 'child';
      if (i === 5) spec.age = 'old';
      cell(g, portraitSVG(spec, 150), `${race} ${spec.gender} ${spec.age ?? ''}`);
    }
  }

  const j = section('jobs', 'Oficios', 'Todos los oficios (humano, semilla fija por oficio).');
  const gj = grid(j);
  const races: RaceId[] = ['humano', 'elfo', 'enano', 'duende', 'sirena', 'draconido', 'trol', 'ogro'];
  JOBS.forEach((job, i) => {
    const race = races[i % races.length] as RaceId;
    cell(gj, portraitSVG({ seed: `job-${job}`, race: i < 12 ? 'humano' : race, job, gender: i % 3 === 0 ? 'm' : 'f' }, 150), `${job} · ${i < 12 ? 'humano' : race}`);
  });

  const m = section('moods', 'Estados de ánimo', 'Una misma NPC en todos los moods + flags.');
  const gm = grid(m);
  for (const mood of PORTRAIT_MOODS) cell(gm, portraitSVG({ seed: 'npc-mood', race: 'elfo', job: 'arquero', gender: 'f', mood }, 150), mood);
  const gm2 = grid(m);
  for (const mood of PORTRAIT_MOODS) cell(gm2, portraitSVG({ seed: 'npc-mood2', race: 'duende', job: 'mercader', gender: 'm', mood }, 150), mood);
  const gf = grid(m);
  cell(gf, portraitSVG({ seed: 'flags1', race: 'humano', scar: true, eyepatch: true, gender: 'm', job: 'pirata' }, 150), 'scar+eyepatch');
  cell(gf, portraitSVG({ seed: 'flags2', race: 'elfo', crown: true, gender: 'f', job: 'noble' }, 150), 'crown');
  cell(gf, portraitSVG({ seed: 'flags3', race: 'humano', hood: true, gender: 'm' }, 150), 'hood');
  cell(gf, portraitSVG({ seed: 'flags4', race: 'excepcion', glowEyes: true, gender: 'f' }, 150), 'glowEyes');
  cell(gf, portraitSVG({ seed: 'flags5', race: 'humano', palette: { hair: '#e2455b', eyes: '#7fe3ff', outfit: '#1a1024', accent: '#d9b36c' }, gender: 'f', job: 'hechicero' }, 150), 'palette');
}

// ---------------------------------------------------------------------------
// Icons + face atlas
// ---------------------------------------------------------------------------

function icons(): void {
  const s = section('icons', 'Iconos', `${ICON_NAMES.length} iconos · currentColor (marfil), tamaños 32 / 20 y color explícito.`);
  const g = grid(s, 'icons');
  for (const name of ICON_NAMES) {
    const d = cell(g, `<div class="row" style="justify-content:center">${icon(name, { size: 32 })}${icon(name, { size: 20, color: '#d9b36c' })}${icon(name, { size: 16, color: '#9b5cff' })}</div>`, name, 'plain');
    d.style.width = '96px';
  }
}

function faces(): void {
  const s = section('faces', 'Atlas de caras', 'Canvas transparente: columnas = expresiones, filas = variantes de ojos. Abajo: decal sobre una "cabeza".');
  const atlas = createFaceAtlas(128);
  const wrap = document.createElement('div');
  wrap.className = 'cell checker';
  wrap.style.display = 'inline-block';
  atlas.canvas.style.width = `${atlas.canvas.width * 0.75}px`;
  wrap.appendChild(atlas.canvas);
  s.appendChild(wrap);
  const g = grid(s);
  FACE_VARIANTS.forEach((v, vi) => {
    for (const e of FACE_EXPRS) {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 96;
      const ctx = c.getContext('2d') as CanvasRenderingContext2D;
      const grad = ctx.createRadialGradient(40, 36, 6, 48, 48, 48);
      grad.addColorStop(0, '#f6dcc6');
      grad.addColorStop(1, '#c98f78');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(48, 48, 46, 0, Math.PI * 2);
      ctx.fill();
      const i = atlas.index(e, vi);
      const col = i % atlas.cols;
      const row = Math.floor(i / atlas.cols);
      ctx.drawImage(atlas.canvas, col * atlas.cell, row * atlas.cell, atlas.cell, atlas.cell, 8, 10, 80, 80);
      const d = document.createElement('div');
      d.className = 'cell';
      d.appendChild(c);
      const l = document.createElement('div');
      l.className = 'lbl';
      l.textContent = `${e} · ${v}`;
      d.appendChild(l);
      g.appendChild(d);
    }
  });
}

// ---------------------------------------------------------------------------
// Relics, slots, crests, logo, tarot
// ---------------------------------------------------------------------------

function logo(): void {
  const s = section('logo', 'Logo');
  const g = grid(s);
  cell(g, logoSVG(640), 'logoSVG(640)', 'plain');
  cell(g, logoSVG(280), 'logoSVG(280)', 'plain');
}

function relics(): void {
  const s = section('relics', 'Reliquias', 'Todas las formas × todas las rarezas (96 px) + tamaños 48 / 160.');
  const legend = document.createElement('div');
  legend.className = 'row';
  legend.innerHTML = RARITIES.map((r) => `<span style="color:${RARITY_COLORS[r]};font-family:Cinzel,serif;margin-right:14px">${RARITY_NAMES[r]}</span>`).join('');
  s.appendChild(legend);
  const filter = params.get('shapes');
  const size = Number(params.get('rs') ?? 96);
  const list = filter ? RELIC_SHAPES.filter((x) => filter.split(',').includes(x)) : RELIC_SHAPES;
  for (const shape of list) {
    const g = grid(s);
    g.style.alignItems = 'center';
    const h = document.createElement('div');
    h.style.cssText = 'width:90px;font-family:Cinzel,serif;color:#cbb8ff;font-size:13px';
    h.textContent = shape;
    g.appendChild(h);
    for (const r of RARITIES) cell(g, relicSVG(shape, r, { size, seed: `lab-${shape}` }), RARITY_NAMES[r], 'plain');
    cell(g, relicSVG(shape, 'epica', { size: 48, seed: `lab-${shape}-b` }), '48px', 'plain');
    if (!params.get('rs')) cell(g, relicSVG(shape, 'mitica', { size: 160, seed: `lab-${shape}-c` }), '160px mítica', 'plain');
  }
}

function slots(): void {
  const s = section('slots', 'Tragamonedas');
  const g = grid(s);
  for (const sym of SLOT_SYMBOLS) cell(g, slotSymbolSVG(sym, 110), sym);
}

function crests(): void {
  const s = section('crests', 'Blasones');
  const g = grid(s);
  for (const c of CREST_IDS) cell(g, crestSVG(c, 120), c);
}

function tarot(): void {
  const s = section('tarot', 'Tarot y naipes');
  const set = params.get('tset');
  const g = grid(s);
  if (set !== 'suits') {
    cell(g, tarotCardSVG({ kind: 'dorso' }, 140), 'dorso', 'plain');
    for (const id of ARCANOS) cell(g, tarotCardSVG({ kind: 'arcano', id }, 140), id, 'plain');
  }
  if (set === 'arcana') return;
  const suitSize = set === 'suits' ? 96 : 110;
  for (const suit of PALOS) {
    const h = document.createElement('h3');
    h.textContent = suit;
    s.appendChild(h);
    const gs = grid(s);
    for (let v = 1; v <= 12; v++) cell(gs, tarotCardSVG({ kind: 'palo', suit, value: v }, suitSize), `${v} de ${suit}`, 'plain');
  }
}

// ---------------------------------------------------------------------------
// Focus mode: ?focus=<json array of PortraitSpec>&size=360  (big previews for art review)
// ---------------------------------------------------------------------------

const focus = params.get('focus');
if (focus) {
  const size = Number(params.get('size') ?? 380);
  const specs = JSON.parse(focus) as PortraitSpec[];
  const s = section('focus', 'Focus');
  const g = grid(s, 'big');
  for (const sp of specs) cell(g, portraitSVG(sp, size), `${sp.special ?? sp.race} ${sp.job ?? ''} ${sp.mood ?? ''}`);
} else if (params.get('only')) {
  const only = params.get('only');
  const map: Record<string, () => void> = { icons, faces, portraits, relics, slots, crests, logo, tarot };
  for (const k of (only ?? '').split(',')) map[k]?.();
} else {
  logo();
  portraits();
  faces();
  icons();
  relics();
  slots();
  crests();
  tarot();
}
