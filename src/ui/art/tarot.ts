// Tarot / Spanish-suit cards (2:3). Ornate dark-violet + gold frame, readable corner indices.
import { linGrad, n, polar, radGrad, starPoints, svgOpen, uid } from './util';

export type ArcanoId =
  | 'loco'
  | 'mago'
  | 'sacerdotisa'
  | 'emperatriz'
  | 'emperador'
  | 'enamorados'
  | 'carro'
  | 'fuerza'
  | 'ermitano'
  | 'rueda'
  | 'justicia'
  | 'colgado'
  | 'muerte'
  | 'templanza'
  | 'diablo'
  | 'torre'
  | 'estrella'
  | 'luna'
  | 'sol'
  | 'juicio'
  | 'mundo';
export type Palo = 'espadas' | 'copas' | 'oros' | 'bastos';
export type TarotCard = { kind: 'arcano'; id: ArcanoId } | { kind: 'palo'; suit: Palo; value: number } | { kind: 'dorso' };

export const ARCANOS: ArcanoId[] = ['loco', 'mago', 'sacerdotisa', 'emperatriz', 'emperador', 'enamorados', 'carro', 'fuerza', 'ermitano', 'rueda', 'justicia', 'colgado', 'muerte', 'templanza', 'diablo', 'torre', 'estrella', 'luna', 'sol', 'juicio', 'mundo'];
export const PALOS: Palo[] = ['espadas', 'copas', 'oros', 'bastos'];

const ARC_INFO: Record<ArcanoId, [string, string]> = {
  loco: ['0', 'EL LOCO'],
  mago: ['I', 'EL MAGO'],
  sacerdotisa: ['II', 'LA SACERDOTISA'],
  emperatriz: ['III', 'LA EMPERATRIZ'],
  emperador: ['IV', 'EL EMPERADOR'],
  enamorados: ['VI', 'LOS ENAMORADOS'],
  carro: ['VII', 'EL CARRO'],
  fuerza: ['VIII', 'LA FUERZA'],
  ermitano: ['IX', 'EL ERMITAÑO'],
  rueda: ['X', 'LA RUEDA'],
  justicia: ['XI', 'LA JUSTICIA'],
  colgado: ['XII', 'EL COLGADO'],
  muerte: ['XIII', 'LA MUERTE'],
  templanza: ['XIV', 'LA TEMPLANZA'],
  diablo: ['XV', 'EL DIABLO'],
  torre: ['XVI', 'LA TORRE'],
  estrella: ['XVII', 'LA ESTRELLA'],
  luna: ['XVIII', 'LA LUNA'],
  sol: ['XIX', 'EL SOL'],
  juicio: ['XX', 'EL JUICIO'],
  mundo: ['XXI', 'EL MUNDO'],
};

const GOLD = '#e6c173';
const GOLD_L = '#fbe7b0';
const GOLD_D = '#8a6424';
const INK = '#120818';
const IVORY = '#f3ead8';

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

function frame(u: string, defs: string[]): string {
  defs.push(linGrad(`${u}bg`, [[0, '#2e1a4a'], [0.55, '#1b0f2e'], [1, '#0e0718']], 0, 0, 0.3, 1));
  defs.push(linGrad(`${u}gd`, [[0, GOLD_L], [0.5, GOLD], [1, GOLD_D]], 0, 0, 1, 1));
  let s = `<rect x="3" y="3" width="194" height="294" rx="14" fill="url(#${u}bg)" stroke="${INK}" stroke-width="3"/>`;
  s += `<rect x="6" y="6" width="188" height="288" rx="11" fill="none" stroke="url(#${u}gd)" stroke-width="3"/>`;
  s += `<rect x="12" y="12" width="176" height="276" rx="8" fill="none" stroke="${GOLD}" stroke-width="1" opacity=".75"/>`;
  for (const [x, y, sx, sy] of [[12, 12, 1, 1], [188, 12, -1, 1], [12, 288, 1, -1], [188, 288, -1, -1]] as const) {
    s += `<path d="M${x + sx * 4} ${y + sy * 26}C${x + sx * 4} ${y + sy * 10} ${x + sx * 10} ${y + sy * 4} ${x + sx * 26} ${y + sy * 4}" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`;
    s += `<path d="M${x + sx * 9} ${y + sy * 20}c${sx * 0} ${sy * -6} ${sx * 5} ${sy * -11} ${sx * 11} ${sy * -11}" fill="none" stroke="${GOLD}" stroke-width="1"/>`;
    s += `<circle cx="${x + sx * 8}" cy="${y + sy * 8}" r="2.4" fill="${GOLD}" stroke="${INK}" stroke-width=".6"/>`;
  }
  return s;
}

function cornerIndex(label: string, sym: string): string {
  const one = (tx: string) => `<g ${tx}><text x="26" y="40" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="${label.length > 1 ? 21 : 26}" fill="${GOLD_L}" stroke="${INK}" stroke-width="2.6" paint-order="stroke">${label}</text>${sym ? `<g transform="translate(26 57) scale(.44)">${sym}</g>` : ''}</g>`;
  return one('') + one('transform="rotate(180 100 150)"');
}

// ---------------------------------------------------------------------------
// Suit symbols (drawn centred at 0,0, ~60 units tall)
// ---------------------------------------------------------------------------

function suitSymbol(p: Palo): string {
  switch (p) {
    case 'espadas':
      return (
        `<path d="M0 -30L5 -22V14H-5V-22Z" fill="#dfe6f2" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
        `<path d="M0 -24V12" stroke="#6a7488" stroke-width="1.4"/>` +
        `<path d="M-16 14Q0 10 16 14L16 19Q0 15 -16 19Z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>` +
        `<path d="M-3.4 19H3.4V29H-3.4Z" fill="#3b5ab8" stroke="${INK}" stroke-width="1.8"/>` +
        `<circle cx="0" cy="32" r="4" fill="${GOLD}" stroke="${INK}" stroke-width="1.8"/>`
      );
    case 'copas':
      return (
        `<path d="M-18 -26H18C18 -8 11 2 0 2C-11 2 -18 -8 -18 -26Z" fill="${GOLD}" stroke="${INK}" stroke-width="2.2"/>` +
        `<ellipse cx="0" cy="-26" rx="18" ry="4" fill="#c0283a" stroke="${INK}" stroke-width="2"/>` +
        `<path d="M-3 2H3V14H-3Z" fill="${GOLD}" stroke="${INK}" stroke-width="1.8"/>` +
        `<path d="M-14 28Q-10 16 -3 14H3Q10 16 14 28Z" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>` +
        `<circle cx="0" cy="-12" r="4" fill="#c0283a" stroke="${INK}" stroke-width="1.4"/>` +
        `<path d="M-13 -20Q-12 -8 -5 -3" stroke="#fff" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/>`
      );
    case 'oros':
      return (
        `<circle cx="0" cy="0" r="24" fill="${GOLD}" stroke="${INK}" stroke-width="2.4"/>` +
        `<circle cx="0" cy="0" r="18" fill="none" stroke="${GOLD_D}" stroke-width="1.6"/>` +
        `<polygon points="${starPoints(0, 0, 13, 5.6, 8)}" fill="${GOLD_L}" stroke="${GOLD_D}" stroke-width="1.2"/>` +
        `<circle cx="0" cy="0" r="4" fill="#c0283a" stroke="${INK}" stroke-width="1"/>` +
        `<path d="M-15 -10A18 18 0 0 1 -4 -18" stroke="#fff" stroke-width="2" fill="none" opacity=".7" stroke-linecap="round"/>`
      );
    case 'bastos':
      return (
        `<path d="M-4 30L-7 -18C-8 -26 -2 -32 4 -30C9 -28 10 -22 8 -16L4 30Z" fill="#8a5a2a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
        `<circle cx="-5" cy="-6" r="3" fill="#6a4020" stroke="${INK}" stroke-width="1.2"/><circle cx="5" cy="8" r="2.6" fill="#6a4020" stroke="${INK}" stroke-width="1.2"/>` +
        `<path d="M5 -22C12 -28 20 -26 22 -22C16 -18 10 -18 5 -22Z" fill="#4fae52" stroke="${INK}" stroke-width="1.4"/>` +
        `<path d="M-6 -12C-12 -18 -20 -16 -22 -12C-16 -8 -10 -8 -6 -12Z" fill="#4fae52" stroke="${INK}" stroke-width="1.4"/>` +
        `<path d="M-2 -24V24" stroke="#c89a62" stroke-width="1.6" opacity=".7"/>`
      );
  }
}

const PIPS: Record<number, Array<[number, number]>> = {
  2: [[100, 95], [100, 205]],
  3: [[100, 88], [100, 150], [100, 212]],
  4: [[70, 100], [130, 100], [70, 200], [130, 200]],
  5: [[70, 95], [130, 95], [100, 150], [70, 205], [130, 205]],
  6: [[70, 90], [130, 90], [70, 150], [130, 150], [70, 210], [130, 210]],
  7: [[70, 88], [130, 88], [100, 119], [70, 150], [130, 150], [70, 212], [130, 212]],
  8: [[70, 86], [130, 86], [100, 118], [70, 150], [130, 150], [100, 182], [70, 214], [130, 214]],
  9: [[65, 88], [100, 88], [135, 88], [65, 150], [100, 150], [135, 150], [65, 212], [100, 212], [135, 212]],
};

// ---------------------------------------------------------------------------
// Arcana illustrations (centred in the arch window ~ (100,145))
// ---------------------------------------------------------------------------

function arcanaArt(id: ArcanoId, u: string, defs: string[]): string {
  const g = (d: string, fill = GOLD, w = 2) => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>`;
  const line = (d: string, col = GOLD, w = 2.2) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const star = (x: number, y: number, r: number, k = 5, col = GOLD_L) => `<polygon points="${starPoints(x, y, r, r * 0.42, k)}" fill="${col}" stroke="${INK}" stroke-width="1"/>`;
  switch (id) {
    case 'loco':
      return (
        g('M70 150C70 118 84 104 100 104C116 104 130 118 130 150Z', '#7a3ab0') +
        g('M72 148C60 138 52 118 58 100C66 112 72 124 80 134Z', '#c0283a') +
        g('M128 148C140 138 148 118 142 100C134 112 128 124 120 134Z', '#2a7a8a') +
        g('M92 132C90 116 92 98 100 86C108 98 110 116 108 132Z', GOLD) +
        `<circle cx="58" cy="98" r="5" fill="${GOLD}" stroke="${INK}" stroke-width="1.6"/><circle cx="142" cy="98" r="5" fill="${GOLD}" stroke="${INK}" stroke-width="1.6"/><circle cx="100" cy="84" r="5" fill="${GOLD}" stroke="${INK}" stroke-width="1.6"/>` +
        g('M68 148H132V160H68Z', IVORY) +
        line('M60 200Q100 176 140 200', '#8ad0ff', 2) +
        `<path d="M92 186q8 -10 16 0q-8 8 -16 0Z" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`
      );
    case 'mago':
      return (
        line('M78 92C70 84 70 76 78 76C86 76 94 92 100 92C106 92 114 76 122 76C130 76 130 84 122 92C114 100 106 84 100 84C94 84 86 100 78 92Z', GOLD_L, 3) +
        g('M96 110H104V204H96Z', IVORY) +
        star(100, 108, 10, 5) +
        `<g transform="translate(62 214) scale(.3)">${suitSymbol('copas')}</g><g transform="translate(88 214) scale(.3)">${suitSymbol('espadas')}</g><g transform="translate(112 214) scale(.3)">${suitSymbol('oros')}</g><g transform="translate(138 214) scale(.3)">${suitSymbol('bastos')}</g>`
      );
    case 'sacerdotisa':
      return (
        g('M56 100H74V214H56Z', '#1a1024') +
        g('M126 100H144V214H126Z', IVORY) +
        `<text x="65" y="164" text-anchor="middle" font-family="Cinzel, serif" font-size="14" fill="${IVORY}">B</text><text x="135" y="164" text-anchor="middle" font-family="Cinzel, serif" font-size="14" fill="${INK}">J</text>` +
        `<circle cx="100" cy="112" r="11" fill="${IVORY}" stroke="${INK}" stroke-width="1.8"/>` +
        g('M82 112A10 10 0 0 0 82 132A13 13 0 0 1 82 112Z', IVORY, 1.4) +
        g('M118 112A10 10 0 0 1 118 132A13 13 0 0 0 118 112Z', IVORY, 1.4) +
        g('M86 150H114V196H86Z', '#e8d8b0', 1.8) +
        line('M90 160H110M90 168H110M90 176H106', '#8a7650', 1.4)
      );
    case 'emperatriz': {
      let s = '';
      for (let i = 0; i < 12; i++) {
        const p = polar(100, 118, 34, -90 + i * 30);
        s += star(p.x, p.y, 4, 5);
      }
      s += g('M80 128C80 116 90 110 100 116C110 110 120 116 120 128C120 144 108 154 100 162C92 154 80 144 80 128Z', '#c0283a');
      s += line('M100 132V150M93 141H107', GOLD_L, 2.4) + `<circle cx="100" cy="128" r="5" fill="none" stroke="${GOLD_L}" stroke-width="2.4"/>`;
      s += line('M72 212C74 192 80 180 84 176M128 212C126 192 120 180 116 176', '#d8b050', 2.4);
      for (let i = 0; i < 4; i++) s += `<ellipse cx="${80 + i * 1.4}" cy="${184 + i * 7}" rx="3" ry="5" fill="#e8c060" stroke="${INK}" stroke-width=".8" transform="rotate(-25 ${80 + i * 1.4} ${184 + i * 7})"/><ellipse cx="${120 - i * 1.4}" cy="${184 + i * 7}" rx="3" ry="5" fill="#e8c060" stroke="${INK}" stroke-width=".8" transform="rotate(25 ${120 - i * 1.4} ${184 + i * 7})"/>`;
      return s;
    }
    case 'emperador':
      return (
        g('M64 118C52 104 56 88 70 88C80 88 84 98 80 106C76 100 70 100 68 106C66 110 70 116 76 118Z', '#e8dcc0') +
        g('M136 118C148 104 144 88 130 88C120 88 116 98 120 106C124 100 130 100 132 106C134 110 130 116 124 118Z', '#e8dcc0') +
        g('M76 112H124V200H76Z', '#8a1a2e') +
        g('M84 92L80 76L90 84L100 70L110 84L120 76L116 92Z', GOLD) +
        `<circle cx="100" cy="150" r="14" fill="${GOLD}" stroke="${INK}" stroke-width="2"/>` +
        line('M100 136V128M92 132H108', GOLD_L, 2.6) +
        g('M70 200H130V212H70Z', GOLD)
      );
    case 'enamorados':
      return (
        star(100, 92, 14, 12, '#ffe08a') +
        g('M72 138C72 126 82 120 90 126C98 120 108 126 108 138C108 152 96 160 90 166C84 160 72 152 72 138Z', '#c0283a') +
        g('M94 146C94 134 104 128 112 134C120 128 130 134 130 146C130 160 118 168 112 174C106 168 94 160 94 146Z', '#e2455b') +
        line('M62 184L140 116', GOLD_L, 2.6) +
        g('M140 116L130 118L136 126Z', GOLD_L, 1.2) +
        g('M62 184l-4 -8l-2 10l10 -2Z', GOLD, 1.2)
      );
    case 'carro':
      return (
        g('M64 110H136L130 92H70Z', '#3b5ab8') +
        star(84, 101, 3.6) + star(100, 99, 3.6) + star(116, 101, 3.6) +
        line('M70 110V156M130 110V156', GOLD, 3) +
        g('M62 150H138V170H62Z', GOLD) +
        `<circle cx="72" cy="186" r="16" fill="none" stroke="${INK}" stroke-width="6"/><circle cx="72" cy="186" r="16" fill="none" stroke="${GOLD}" stroke-width="3"/>` +
        `<circle cx="128" cy="186" r="16" fill="none" stroke="${INK}" stroke-width="6"/><circle cx="128" cy="186" r="16" fill="none" stroke="${GOLD}" stroke-width="3"/>` +
        line('M72 170V202M56 186H88M128 170V202M112 186H144', GOLD, 1.6) +
        star(100, 126, 10, 8, GOLD_L)
      );
    case 'fuerza': {
      let s = line('M84 92C76 84 76 78 84 78C92 78 96 92 100 92C104 92 108 78 116 78C124 78 124 84 116 92C108 100 104 86 100 86C96 86 92 100 84 92Z', GOLD_L, 2.6);
      let mane = '';
      for (let i = 0; i <= 20; i++) {
        const p = polar(100, 156, i % 2 ? 44 : 36, (i / 20) * 360 - 90);
        mane += `${i === 0 ? 'M' : 'L'}${n(p.x)} ${n(p.y)}`;
      }
      s += g(mane + 'Z', '#d98c2a');
      s += g('M78 150C78 134 88 126 100 126C112 126 122 134 122 150C122 166 112 184 100 188C88 184 78 166 78 150Z', '#f2c14e');
      s += line('M86 146l8 3M114 146l-8 3', INK, 2.6);
      s += g('M94 162H106L100 170Z', INK, 1);
      s += line('M100 170V174M92 178Q100 184 108 178', INK, 1.8);
      return s;
    }
    case 'ermitano': {
      defs.push(radGrad(`${u}lt`, [[0, '#fff6c8', 0.95], [0.4, '#ffd36a', 0.5], [1, '#ffb030', 0]]));
      return (
        line('M70 90L64 214', '#8a5a2a', 5) +
        `<circle cx="116" cy="146" r="40" fill="url(#${u}lt)"/>` +
        line('M116 104V116', GOLD, 2) +
        g('M104 116H128L132 124H100Z', GOLD) +
        g('M102 124H130V166H102Z', '#ffd36a', 2) +
        `<polygon points="${starPoints(116, 145, 10, 4.6, 6)}" fill="#fffbe6" stroke="${INK}" stroke-width="1"/>` +
        g('M100 166H132L128 174H104Z', GOLD)
      );
    }
    case 'rueda': {
      let s = `<circle cx="100" cy="150" r="52" fill="none" stroke="${INK}" stroke-width="8"/><circle cx="100" cy="150" r="52" fill="none" stroke="${GOLD}" stroke-width="4.5"/>`;
      s += `<circle cx="100" cy="150" r="40" fill="#2a1a4a" stroke="${GOLD}" stroke-width="1.6"/>`;
      for (let i = 0; i < 8; i++) {
        const p = polar(100, 150, 40, i * 45);
        s += line(`M100 150L${n(p.x)} ${n(p.y)}`, GOLD, 2);
        const q = polar(100, 150, 46, i * 45 + 22.5);
        s += `<circle cx="${n(q.x)}" cy="${n(q.y)}" r="2.2" fill="${GOLD_L}"/>`;
      }
      s += `<circle cx="100" cy="150" r="10" fill="${GOLD}" stroke="${INK}" stroke-width="2"/><circle cx="101" cy="151" r="6" fill="#07030c"/>`;
      return s;
    }
    case 'justicia':
      return (
        g('M97 84H103V214H97Z', '#dfe6f2') +
        g('M84 200Q100 194 116 200V206Q100 200 84 206Z', GOLD) +
        g('M100 80L106 90H94Z', '#dfe6f2') +
        line('M60 118H140', GOLD, 3) +
        line('M64 118L52 156M64 118L76 156M136 118L124 156M136 118L148 156', GOLD_L, 1.2) +
        g('M48 156H80Q78 166 64 166Q50 166 48 156Z', GOLD) +
        g('M120 156H152Q150 166 136 166Q122 166 120 156Z', GOLD)
      );
    case 'colgado':
      return (
        line('M60 92H140M100 92V110', '#5aa83a', 5) +
        line('M100 110V122', IVORY, 1.6) +
        `<circle cx="100" cy="196" r="20" fill="#ffd36a" opacity=".35"/>` +
        g('M92 122H108L112 156H88Z', '#3b5ab8') +
        g('M88 156H112L108 182H92Z', '#c0283a') +
        `<circle cx="100" cy="194" r="11" fill="#f3d6c0" stroke="${INK}" stroke-width="2"/>` +
        line('M88 162L78 150M112 162L122 150', '#f3d6c0', 3.4) +
        `<circle cx="100" cy="194" r="17" fill="none" stroke="${GOLD_L}" stroke-width="2"/>`
      );
    case 'muerte':
      return (
        line('M124 84L96 218', '#8a5a2a', 4) +
        g('M124 84C140 92 150 108 146 128C140 114 130 104 118 100Z', '#dfe6f2') +
        g('M100 118C116 118 126 128 126 142C126 150 122 156 116 160V170A3 3 0 0 1 113 173H87A3 3 0 0 1 84 170V160C78 156 74 150 74 142C74 128 84 118 100 118Z', IVORY) +
        `<ellipse cx="91" cy="143" rx="6" ry="7" fill="${INK}"/><ellipse cx="109" cy="143" rx="6" ry="7" fill="${INK}"/>` +
        g('M100 152L96 158H104Z', INK, 1) +
        line('M93 164V171M100 164V171M107 164V171', INK, 1.6) +
        `<path d="M64 206c8 -6 16 -6 24 0M112 206c8 -6 16 -6 24 0" stroke="#c0283a" stroke-width="3" fill="none" stroke-linecap="round"/>`
      );
    case 'templanza':
      return (
        g('M100 84L122 118H78Z', '#ffe08a', 1.8) +
        g('M62 136H88L86 152Q75 160 64 152Z', GOLD) +
        g('M112 176H138L136 192Q125 200 114 192Z', GOLD) +
        `<path d="M80 150C92 160 108 166 120 178" stroke="#8ad0ff" stroke-width="5" fill="none" stroke-linecap="round"/>` +
        `<path d="M80 150C92 160 108 166 120 178" stroke="#e6fbff" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
        line('M60 210Q100 196 140 210', '#8ad0ff', 2)
      );
    case 'diablo':
      return (
        g('M76 122C62 110 58 92 64 76C70 92 78 100 88 104Z', '#3a2a2a') +
        g('M124 122C138 110 142 92 136 76C130 92 122 100 112 104Z', '#3a2a2a') +
        g('M100 100C120 100 128 114 128 132C128 152 116 170 100 176C84 170 72 152 72 132C72 114 80 100 100 100Z', '#8a1a2e') +
        g('M84 128l12 4l-2 6l-10 -3ZM116 128l-12 4l2 6l10 -3Z', '#ffd36a', 1.2) +
        g('M92 156Q100 162 108 156L104 166H96Z', INK, 1.2) +
        line('M70 196Q86 188 100 196Q114 204 130 196', '#aeb8c4', 3) +
        `<circle cx="70" cy="196" r="4" fill="none" stroke="#aeb8c4" stroke-width="2.4"/><circle cx="130" cy="196" r="4" fill="none" stroke="#aeb8c4" stroke-width="2.4"/>`
      );
    case 'torre':
      return (
        g('M82 120H118V214H82Z', '#8a8298') +
        line('M82 150H118M82 180H118M96 120V150M104 150V180M92 180V214', INK, 1.2) +
        g('M78 120H122V110H114V116H106V110H94V116H86V110H78Z', '#8a8298') +
        g('M88 104L84 86L94 94L100 82L106 94L116 86L112 104Z', GOLD) +
        g('M124 70L108 100H118L104 126L132 92H120L134 70Z', '#fff6b0', 1.6) +
        g('M86 196C80 190 80 180 86 174C88 182 92 184 94 188C96 180 100 176 100 170C106 178 108 188 104 196Z', '#ff7a30', 1.4)
      );
    case 'estrella': {
      let s = star(100, 118, 30, 8, '#fff6c8');
      const small: Array<[number, number]> = [[60, 92], [140, 92], [52, 132], [148, 132], [66, 166], [134, 166], [100, 84]];
      for (const [x, y] of small) s += star(x, y, 6, 8, GOLD_L);
      s += `<path d="M76 184C88 176 112 176 124 184" stroke="#8ad0ff" stroke-width="3" fill="none"/>`;
      s += line('M60 208Q80 198 100 208T140 208', '#8ad0ff', 2);
      return s;
    }
    case 'luna':
      return (
        `<circle cx="100" cy="116" r="30" fill="#e6e0f0" stroke="${INK}" stroke-width="2"/>` +
        `<path d="M112 90A30 30 0 1 0 112 142A24 24 0 1 1 112 90Z" fill="${GOLD_L}" stroke="${INK}" stroke-width="1.6"/>` +
        `<path d="M90 110q4 -3 8 0M92 124q5 3 10 -1" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
        g('M58 170H74V214H58Z', '#8a8298') +
        g('M126 170H142V214H126Z', '#8a8298') +
        g('M56 170L66 158L76 170Z', '#5a2a9a') +
        g('M124 170L134 158L144 170Z', '#5a2a9a') +
        `<path d="M96 156q4 6 0 10q-4 -4 0 -10ZM104 166q3 5 0 8q-3 -3 0 -8Z" fill="#ffe08a"/>` +
        line('M80 214Q100 204 120 214', '#8ad0ff', 2)
      );
    case 'sol': {
      let s = '';
      for (let i = 0; i < 16; i++) {
        const a = i * 22.5;
        const p0 = polar(100, 142, 34, a - 6);
        const p1 = polar(100, 142, i % 2 ? 50 : 60, a);
        const p2 = polar(100, 142, 34, a + 6);
        s += `<path d="M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}L${n(p2.x)} ${n(p2.y)}Z" fill="${i % 2 ? '#ffb030' : '#ffd36a'}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`;
      }
      s += `<circle cx="100" cy="142" r="32" fill="#ffd36a" stroke="${INK}" stroke-width="2.2"/>`;
      s += `<path d="M88 136q4 -4 8 0M104 136q4 -4 8 0M88 152q12 10 24 0" stroke="${INK}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
      s += `<circle cx="84" cy="146" r="4" fill="#ff8a6a" opacity=".6"/><circle cx="116" cy="146" r="4" fill="#ff8a6a" opacity=".6"/>`;
      return s;
    }
    case 'juicio': {
      let s = '';
      for (let i = 0; i < 9; i++) {
        const a = 200 + i * 17.5;
        const p = polar(100, 150, 70, a);
        s += line(`M100 150L${n(p.x)} ${n(p.y)}`, '#ffe08a', 1.2);
      }
      s += g('M64 120L132 100L136 108L70 132Z', GOLD);
      s += g('M132 100C140 94 150 96 152 104C150 112 140 114 136 108Z', GOLD);
      s += g('M78 128H112V156L95 148L78 156Z', IVORY, 1.6);
      s += line('M95 132V150M87 140H103', '#c0283a', 3);
      s += g('M60 188C68 176 82 176 90 184C98 172 116 172 122 184C130 178 142 182 142 192C142 200 130 204 100 204C72 204 58 200 60 188Z', '#e6e0f0', 1.6);
      return s;
    }
    case 'mundo': {
      let s = `<ellipse cx="100" cy="150" rx="40" ry="56" fill="none" stroke="#2f8a4e" stroke-width="9"/>`;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * 360;
        const p = polar(0, 0, 1, a);
        const x = 100 + p.x * 40;
        const y = 150 + p.y * 56;
        s += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="5" ry="2.6" fill="#5ac06a" stroke="${INK}" stroke-width=".7" transform="rotate(${n(a + 90)} ${n(x)} ${n(y)})"/>`;
      }
      s += `<circle cx="100" cy="150" r="24" fill="#3b7bd8" stroke="${INK}" stroke-width="2"/>`;
      s += `<path d="M86 140q8 -6 14 2q6 6 12 -2M84 156q10 4 18 -2q8 -4 14 4" stroke="#5ac06a" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      s += `<path d="M86 138A16 16 0 0 1 98 130" stroke="#fff" stroke-width="2" fill="none" opacity=".6" stroke-linecap="round"/>`;
      s += `<path d="M100 92l4 6h-8zM100 208l4 -6h-8z" fill="#c0283a" stroke="${INK}" stroke-width="1"/>`;
      return s;
    }
  }
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export function tarotCardSVG(card: { kind: 'arcano'; id: ArcanoId } | { kind: 'palo'; suit: Palo; value: number } | { kind: 'dorso' }, width = 120): string {
  const u = uid('tc');
  const defs: string[] = [];
  let s = frame(u, defs);
  if (card.kind === 'dorso') {
    defs.push(radGrad(`${u}gl`, [[0, '#9b5cff', 0.55], [0.6, '#5b2a9a', 0.2], [1, '#5b2a9a', 0]]));
    s += `<rect x="20" y="20" width="160" height="260" rx="6" fill="none" stroke="${GOLD}" stroke-width="1.2"/>`;
    let lattice = '';
    for (let i = -8; i <= 8; i++) {
      lattice += `M${20 + i * 20} 20L${20 + i * 20 + 260} 280M${180 - i * 20} 20L${180 - i * 20 - 260} 280`;
    }
    defs.push(`<clipPath id="${u}cl"><rect x="20" y="20" width="160" height="260" rx="6"/></clipPath>`);
    s += `<g clip-path="url(#${u}cl)"><path d="${lattice}" stroke="${GOLD}" stroke-width=".6" opacity=".35"/></g>`;
    s += `<circle cx="100" cy="150" r="70" fill="url(#${u}gl)"/>`;
    for (let i = 0; i < 32; i++) {
      const a = i * 11.25;
      const p0 = polar(100, 150, 40, a);
      const p1 = polar(100, 150, i % 2 ? 54 : 66, a);
      s += `<path d="M${n(p0.x)} ${n(p0.y)}L${n(p1.x)} ${n(p1.y)}" stroke="${i % 2 ? '#c9a4ff' : GOLD}" stroke-width="${i % 2 ? 0.8 : 1.4}" stroke-linecap="round"/>`;
    }
    s += `<circle cx="100" cy="150" r="36" fill="#f6f0ff"/><circle cx="102.4" cy="152" r="32" fill="#07030c"/>`;
    s += `<circle cx="100" cy="150" r="40" fill="none" stroke="${GOLD}" stroke-width="1.6"/>`;
    s += `<polygon points="${starPoints(100, 48, 8, 3, 4)}" fill="${GOLD_L}"/><polygon points="${starPoints(100, 252, 8, 3, 4)}" fill="${GOLD_L}"/>`;
    s += `<path d="M44 48h40M116 48h40M44 252h40M116 252h40" stroke="${GOLD}" stroke-width="1"/>`;
    return `${svgOpen(width, 200, 300)}<defs>${defs.join('')}</defs>${s}</svg>`;
  }
  if (card.kind === 'arcano') {
    const [num, name] = ARC_INFO[card.id] ?? ['?', card.id.toUpperCase()];
    defs.push(radGrad(`${u}w`, [[0, '#4a2a7a'], [0.7, '#24123e'], [1, '#150a26']], 0.5, 0.4, 0.7));
    const arch = 'M28 232V112A72 72 0 0 1 172 112V232Z';
    s += `<path d="${arch}" fill="url(#${u}w)" stroke="${GOLD}" stroke-width="2"/>`;
    defs.push(`<clipPath id="${u}ac"><path d="${arch}"/></clipPath>`);
    s += `<g clip-path="url(#${u}ac)">${arcanaArt(card.id, u, defs)}</g>`;
    s += `<path d="M36 232V114A64 64 0 0 1 164 114V232" fill="none" stroke="${GOLD}" stroke-width=".8" opacity=".6"/>`;
    s += `<text x="100" y="40" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="22" letter-spacing="2" fill="${GOLD_L}" stroke="${INK}" stroke-width="2.6" paint-order="stroke">${num}</text>`;
    s += `<rect x="24" y="242" width="152" height="36" rx="6" fill="#140b22" stroke="${GOLD}" stroke-width="1.6"/>`;
    const fs = name.length > 13 ? 12 : name.length > 10 ? 14 : 16;
    s += `<text x="100" y="${265}" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="${fs}" letter-spacing="1.2" fill="${IVORY}" stroke="${INK}" stroke-width="2" paint-order="stroke">${name}</text>`;
    s += `<text x="22" y="30" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="11" fill="${GOLD}">${num}</text>`;
    s += `<text x="178" y="30" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="11" fill="${GOLD}">${num}</text>`;
    return `${svgOpen(width, 200, 300)}<defs>${defs.join('')}</defs>${s}</svg>`;
  }
  // Spanish suit card
  const v = Math.max(1, Math.min(12, Math.round(card.value)));
  const sym = suitSymbol(card.suit);
  s += cornerIndex(String(v), sym);
  const suitName = card.suit.toUpperCase();
  if (v === 1) {
    defs.push(radGrad(`${u}a`, [[0, '#6a3ab0', 0.7], [1, '#6a3ab0', 0]]));
    s += `<circle cx="100" cy="150" r="70" fill="url(#${u}a)"/>`;
    s += `<circle cx="100" cy="150" r="56" fill="none" stroke="${GOLD}" stroke-width="1.4"/><circle cx="100" cy="150" r="60" fill="none" stroke="${GOLD}" stroke-width=".7" stroke-dasharray="2 3"/>`;
    s += `<g transform="translate(100 150) scale(1.5)">${sym}</g>`;
    s += `<text x="100" y="256" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="13" letter-spacing="2" fill="${IVORY}" stroke="${INK}" stroke-width="2" paint-order="stroke">AS DE ${suitName}</text>`;
  } else if (v <= 9) {
    const sc = v <= 3 ? 0.95 : v <= 6 ? 0.8 : 0.64;
    for (const [x, y] of PIPS[v] ?? []) s += `<g transform="translate(${x} ${y}) scale(${sc})">${sym}</g>`;
  } else {
    const rank = v === 10 ? 'SOTA' : v === 11 ? 'CABALLO' : 'REY';
    defs.push(radGrad(`${u}f`, [[0, '#4a2a7a'], [1, '#1a0f2e']], 0.5, 0.4, 0.7));
    s += `<rect x="34" y="62" width="132" height="170" rx="10" fill="url(#${u}f)" stroke="${GOLD}" stroke-width="1.6"/>`;
    let emblemArt = '';
    if (v === 10) {
      emblemArt = `<path d="M74 106Q100 84 126 106L122 114Q100 100 78 114Z" fill="#c0283a" stroke="${INK}" stroke-width="2"/><path d="M120 104C130 88 142 84 150 80C144 92 136 100 124 108Z" fill="${IVORY}" stroke="${INK}" stroke-width="1.6"/>`;
    } else if (v === 11) {
      emblemArt = `<path d="M84 124V116C84 108 88 102 94 98L88 94L84 98L80 94L90 82C94 78 100 76 106 76C116 76 124 84 124 98V124Z" fill="#e8dcc0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cx="98" cy="88" r="2" fill="${INK}"/><path d="M106 78C112 80 116 86 116 94" stroke="${GOLD_D}" stroke-width="2" fill="none"/>`;
    } else {
      emblemArt = `<path d="M74 118L70 90L84 102L100 84L116 102L130 90L126 118Z" fill="${GOLD}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><circle cx="100" cy="110" r="4" fill="#c0283a" stroke="${INK}" stroke-width="1"/><circle cx="70" cy="88" r="3" fill="${GOLD_L}" stroke="${INK}" stroke-width="1"/><circle cx="100" cy="82" r="3" fill="${GOLD_L}" stroke="${INK}" stroke-width="1"/><circle cx="130" cy="88" r="3" fill="${GOLD_L}" stroke="${INK}" stroke-width="1"/>`;
    }
    s += emblemArt;
    s += `<g transform="translate(100 172) scale(1.05)">${sym}</g>`;
    s += `<rect x="40" y="242" width="120" height="30" rx="6" fill="#140b22" stroke="${GOLD}" stroke-width="1.4"/>`;
    s += `<text x="100" y="263" text-anchor="middle" font-family="Cinzel, serif" font-weight="700" font-size="15" letter-spacing="2" fill="${IVORY}" stroke="${INK}" stroke-width="2" paint-order="stroke">${rank}</text>`;
  }
  return `${svgOpen(width, 200, 300)}<defs>${defs.join('')}</defs>${s}</svg>`;
}
