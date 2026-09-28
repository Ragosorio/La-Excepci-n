/** Optional Web Speech API voice (Spanish), used rarely for the villain's whisper. */

const PREFERRED_NAMES = ['jorge', 'juan', 'diego', 'carlos', 'raul', 'raúl', 'pablo', 'alvaro', 'álvaro', 'enrique', 'andrés', 'andres'];
const LANG_ORDER = ['es-mx', 'es-us', 'es-419', 'es-gt', 'es-co', 'es-ar', 'es-es', 'es'];

export class Speech {
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    const synth = Speech.synth();
    if (!synth) return;
    this.pick();
    try {
      synth.addEventListener('voiceschanged', () => this.pick());
    } catch {
      /* old browsers */
    }
  }

  static synth(): SpeechSynthesis | null {
    const g = globalThis as unknown as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: unknown };
    return g.speechSynthesis && g.SpeechSynthesisUtterance ? g.speechSynthesis : null;
  }

  private pick(): void {
    const synth = Speech.synth();
    if (!synth) return;
    const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
    if (!voices.length) return;
    const score = (v: SpeechSynthesisVoice): number => {
      const lang = v.lang.toLowerCase().replace('_', '-');
      const li = LANG_ORDER.findIndex((l) => lang.startsWith(l));
      const name = v.name.toLowerCase();
      const male = PREFERRED_NAMES.some((n) => name.includes(n)) ? 3 : 0;
      return (li < 0 ? 0 : LANG_ORDER.length - li) + male + (v.localService ? 0.5 : 0);
    };
    this.voice = voices.reduce((a, b) => (score(b) > score(a) ? b : a));
  }

  /** Returns the estimated speaking time in seconds (0 if unavailable). */
  speak(text: string, opts: { pitch?: number; rate?: number } | undefined, volume: number): number {
    const synth = Speech.synth();
    if (!synth || !text.trim()) return 0;
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      u.voice = this.voice;
      u.lang = this.voice.lang;
    } else u.lang = 'es-MX';
    const rate = Math.max(0.3, Math.min(2, opts?.rate ?? 0.82));
    u.rate = rate;
    u.pitch = Math.max(0, Math.min(2, opts?.pitch ?? 0.55));
    u.volume = Math.max(0, Math.min(1, volume));
    synth.cancel();
    synth.speak(u);
    return (text.length * 0.075) / rate + 0.6;
  }

  stop(): void {
    try {
      Speech.synth()?.cancel();
    } catch {
      /* ignore */
    }
  }
}
