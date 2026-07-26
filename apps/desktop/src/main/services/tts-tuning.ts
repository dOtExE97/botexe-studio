// tts-tuning.ts — Regler-Schema PRO ANBIETER (rein, keine I/O). Bisher gab es
// nur ein globales Tempo/Tonhöhe-Paar, das nur bei Edge wirkt — bei Piper
// taten die Regler nichts (echte Nutzer-Beschwerde). Jeder Anbieter bekommt
// jetzt seine eigenen, zu ihm passenden Regler mit Vorgaben und Grenzen.
//
// `resolveTuning` füllt fehlende Werte mit den Vorgaben und klemmt Zahlen in
// ihr min..max — das Anwenden der Werte in den Engines ist NICHT Teil dieser
// Datei (folgt in einer separaten Task).
export interface TuningParam {
  key: string;
  label: string;
  hint: string;
  min?: number;
  max?: number;
  step?: number;
  default: number | string;
  options?: Array<{ value: string; label: string }>;
}

// Hinweis gtts: Google-Translate-TTS (translate_tts) wird hier per rohem
// fetch angesprochen (siehe tts-providers.ts) — kein bestätigter Parameter
// für „langsamer sprechen" in diesem Aufruf. Statt einen Regler anzubieten,
// der nichts bewirkt, bleibt gtts hier bewusst OHNE Eintrag (verify-or-drop
// aus dem Task-Brief → drop).
export const TUNING_SPECS: Record<string, TuningParam[]> = {
  edge: [
    { key: 'rate', label: 'Tempo', hint: 'Wie schnell gesprochen wird.', min: -50, max: 50, step: 5, default: 0 },
    { key: 'pitch', label: 'Tonhöhe', hint: 'Höher oder tiefer als normal.', min: -20, max: 20, step: 2, default: 0 },
    { key: 'volume', label: 'Lautstärke', hint: 'Zusätzlich zur Mixer-Lautstärke.', min: -50, max: 50, step: 5, default: 0 },
  ],
  piper: [
    { key: 'lengthScale', label: 'Tempo', hint: 'Kleiner = schneller gesprochen.', min: 0.5, max: 2, step: 0.05, default: 1 },
    { key: 'noiseScale', label: 'Ausdruck', hint: 'Höher = lebendiger, aber unruhiger.', min: 0, max: 1, step: 0.05, default: 0.667 },
    { key: 'noiseW', label: 'Aussprache-Variation', hint: 'Höher = weniger monoton, kann nuscheln.', min: 0, max: 1, step: 0.05, default: 0.8 },
    { key: 'sentenceSilence', label: 'Pause zwischen Sätzen', hint: 'Sekunden Stille nach jedem Satz.', min: 0, max: 2, step: 0.1, default: 0.2 },
  ],
  openai: [
    { key: 'speed', label: 'Tempo', hint: '1 = normal, 2 = doppelt so schnell.', min: 0.25, max: 4, step: 0.05, default: 1 },
    {
      key: 'quality',
      label: 'Qualität',
      hint: 'HD klingt besser, kostet mehr.',
      default: 'tts-1',
      options: [
        { value: 'tts-1', label: 'Standard' },
        { value: 'tts-1-hd', label: 'HD' },
      ],
    },
  ],
  polly: [
    {
      key: 'engine',
      label: 'Qualität',
      hint: 'Neural klingt deutlich natürlicher.',
      default: 'neural',
      options: [
        { value: 'standard', label: 'Standard' },
        { value: 'neural', label: 'Neural' },
      ],
    },
  ],
  elevenlabs: [
    { key: 'stability', label: 'Stabilität', hint: 'Höher = gleichmäßiger, niedriger = ausdrucksstärker.', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'similarity', label: 'Ähnlichkeit', hint: 'Wie nah an der Original-Stimme.', min: 0, max: 1, step: 0.05, default: 0.75 },
    { key: 'style', label: 'Stil', hint: 'Mehr Betonung — kann instabiler klingen.', min: 0, max: 1, step: 0.05, default: 0 },
  ],
};

/** Füllt fehlende Regler-Werte mit den Vorgaben des Anbieters und klemmt
 *  Zahlen in ihr min..max. Unbekannter Anbieter (kein Eintrag in
 *  TUNING_SPECS) ⇒ leeres Objekt (nichts anzuwenden). */
export function resolveTuning(provider: string, saved?: Record<string, unknown>): Record<string, number | string> {
  const spec = TUNING_SPECS[provider];
  if (!spec) return {};
  const out: Record<string, number | string> = {};
  for (const p of spec) {
    const raw = saved?.[p.key];
    if (typeof p.default === 'string') {
      const ok = p.options?.some((o) => o.value === raw);
      out[p.key] = ok ? (raw as string) : p.default;
    } else {
      const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : (p.default as number);
      out[p.key] = Math.min(p.max ?? n, Math.max(p.min ?? n, n));
    }
  }
  return out;
}
