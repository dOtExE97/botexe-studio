// tts-voice.ts — winzige, plattformneutrale Helfer rund um Stimmen-IDs
// ('edge:de-DE-KatjaNeural', 'piper:de-thorsten', …). Geteilt zwischen Main
// (tts-providers.ts hat sein eigenes normalizeVoiceId für die Engine-Seite)
// und Renderer (TtsPage.tsx braucht den Anbieter-Namespace, um die richtigen
// Feineinstellungs-Regler aus TUNING_SPECS anzuzeigen) — kein Node/DOM, damit
// beide Seiten dieselbe Logik nutzen können, ohne Main-Code in den Renderer
// zu importieren (Prozessgrenze bleibt sauber).

/** Legacy-Stimmen ohne Namespace (alte Settings-Version) → edge:. */
export function normalizeVoiceId(voice: string): string {
  return voice.includes(':') ? voice : `edge:${voice}`;
}

/** Anbieter-Namespace einer (ggf. unnamespaced) Stimmen-ID, z.B. 'edge', 'piper'. */
export function providerFromVoice(voice: string): string {
  return normalizeVoiceId(voice).split(':', 1)[0] as string;
}
