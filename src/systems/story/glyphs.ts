/** Small stroke glyphs (24×24) used by story UI: hazañas, márgenes, the duel "Comprendiendo…" row. */

const P: Record<string, string> = {
  eclipse: '<circle cx="12" cy="12" r="9.3" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1"/><circle cx="12" cy="12" r="6.6" fill="#0d0714" stroke="currentColor" stroke-width="1.7"/>',
  skull: '<path d="M12 3.5c-4.4 0-7.5 3-7.5 7 0 2.4 1.1 4 2.6 5v3h9.8v-3c1.5-1 2.6-2.6 2.6-5 0-4-3.1-7-7.5-7z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9.2" cy="11" r="1.7" fill="currentColor"/><circle cx="14.8" cy="11" r="1.7" fill="currentColor"/><path d="M10.5 18.5v-2M13.5 18.5v-2" stroke="currentColor" stroke-width="1.3"/>',
  coin: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity=".6"/><path d="M12 9.2v5.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  eye: '<path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>',
  book: '<path d="M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5 0 8.5 1.5 2-1.5 5-1.9 8.5-1.5V5C17 4.6 14 5 12 6.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6.5v13" stroke="currentColor" stroke-width="1.2"/>',
  crown: '<path d="M4 17.5l-1-10 5 4 4-6.5 4 6.5 5-4-1 10z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4.5 20h15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  dog: '<path d="M6 9.5L4 4.5l4.5 2.5h7L20 4.5l-2 5c.8 1.2 1.2 2.6 1.2 4 0 3.6-3.2 6-7.2 6s-7.2-2.4-7.2-6c0-1.4.4-2.8 1.2-4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="9.5" cy="12.5" r="1" fill="currentColor"/><circle cx="14.5" cy="12.5" r="1" fill="currentColor"/><path d="M11 15.5h2l-1 1.2z" fill="currentColor"/>',
  moon: '<path d="M15.5 3.8A8.5 8.5 0 1 0 20.2 16 7 7 0 0 1 15.5 3.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>',
  sword: '<path d="M19.5 4.5l-9.8 9.8M19.5 4.5l-.6 3.4-8.5 8.5M19.5 4.5l-3.4.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 13l4 4M5 19l3-3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  mask: '<path d="M3 9c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0 0 4.5-2.4 7.2-5.4 7.2-1.6 0-2.7-1-3.6-2.4-.9 1.4-2 2.4-3.6 2.4C5.4 16.2 3 13.5 3 9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6.5 11.2h3M14.5 11.2h3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  feather: '<path d="M19.5 4.5c-7 .5-12 5.5-13 13l1.5 2c1-1 2-2.4 2.6-3.6 5.6-.6 8.9-5.9 8.9-11.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 20.5l6-6.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  fist: '<path d="M7 11V7.5a1.6 1.6 0 0 1 3.2 0V10m0-3.2a1.6 1.6 0 0 1 3.2 0V10m0-2.4a1.6 1.6 0 0 1 3.2 0V11m0-1.6a1.5 1.5 0 0 1 3 0v3.4c0 4-2.8 6.7-6.6 6.7h-1.2C8.8 19.5 6 17 6 13.8V12a1.5 1.5 0 0 1 3 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>',
  veil: '<path d="M12 3.5c-4 0-6.5 3.2-6.5 7.5 0 3.5-1 6-2 8.5 3-.8 5-1 8.5-1s5.5.2 8.5 1c-1-2.5-2-5-2-8.5 0-4.3-2.5-7.5-6.5-7.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2" stroke-linejoin="round"/><path d="M9.5 11.5h1.5M13 11.5h1.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  mind: '<path d="M12 12.2c0-.9.7-1.4 1.4-1.2.9.3 1.2 1.4.8 2.2-.6 1.3-2.3 1.6-3.4.9-1.6-1-1.8-3.3-.7-4.7 1.5-1.9 4.4-2 6.1-.4 2.1 2 2 5.5-.1 7.4-2.6 2.3-6.8 2.1-9.1-.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  relic: '<path d="M12 3.5l5 5.5-5 11.5L7 9z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 9h10M12 3.5l-2 5.5 2 11.5 2-11.5z" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity=".7" stroke-linejoin="round"/>',
  return: '<path d="M18.5 8.5A7.5 7.5 0 1 0 19.5 13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M19 4.5v4.3h-4.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 9v3.3l2.2 1.4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  dawn: '<path d="M5 16a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3 19.5h18M12 4.5v3M5.2 7.6l2 2M18.8 7.6l-2 2M2.5 12.8l2.6.6M21.5 12.8l-2.6.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  ink: '<path d="M12 3.5c3 4.2 5.5 7.4 5.5 10.5a5.5 5.5 0 0 1-11 0C6.5 10.9 9 7.7 12 3.5z" fill="currentColor"/>',
  phones: '<path d="M4.5 15.5V12a7.5 7.5 0 0 1 15 0v3.5" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="3.2" y="13.5" width="4.2" height="6.5" rx="1.6" fill="currentColor"/><rect x="16.6" y="13.5" width="4.2" height="6.5" rx="1.6" fill="currentColor"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="1.6"/>',
};

export type GlyphName = keyof typeof P | string;

export function glyph(name: GlyphName, size = 22, color = 'currentColor'): string {
  const body = P[name] ?? P.eclipse;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" style="color:${color}" aria-hidden="true">${body}</svg>`;
}
