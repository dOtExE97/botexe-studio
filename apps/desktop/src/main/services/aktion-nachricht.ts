// aktion-nachricht.ts — baut die Overlay-Nachricht einer ausgelösten Aktion.
//
// Eigene kleine Datei, damit die Plattform-Regel ohne die ganze Studio-Klasse
// prüfbar ist: Die Aktion trägt die Plattform des AUSLÖSENDEN Ereignisses.
// Ein Twitch-Follow, der eine Follow-Regel auslöst, darf seinen Alarm nicht
// ins TikTok-Overlay schicken. Ereignis ohne Plattform (Timer, Test-Knopf,
// manuell) → Aktion ohne Plattform → an alle Overlays, wie bisher.
import type { MomentPayload } from '@botexe/overlay-engine';
import type { Plattform, StudioEvent, TriggerAction } from '@botexe/trigger-engine';
import type { OverlayMessage } from '../adapters/overlay-server';
import { TWITCH_ID_PRAEFIX } from '../adapters/twitch-normalize';

export function aktionsNachricht(
  ruleId: string,
  action: TriggerAction,
  event: Pick<StudioEvent, 'plattform'>,
): Extract<OverlayMessage, { kind: 'action' }> {
  return { kind: 'action', ruleId, action, ...(event.plattform ? { plattform: event.plattform } : {}) };
}

/** Plattform eines Moments (Premium-Einblender): die des auslösenden
 *  Ereignisses — oder, wenn es keins gibt (Spiel-Sieg, vom Overlay gemeldet),
 *  aus der Zuschauer-ID ('twitch:…' = Twitch). Sonst ohne = an alle Overlays. */
export function momentNachricht(
  moment: MomentPayload,
  quelle?: Pick<StudioEvent, 'plattform'>,
): Extract<OverlayMessage, { kind: 'moment' }> {
  const plattform: Plattform | undefined = quelle?.plattform
    ?? (moment.user?.id?.startsWith(TWITCH_ID_PRAEFIX) ? 'twitch' : undefined);
  return { kind: 'moment', moment, ...(plattform ? { plattform } : {}) };
}

/** In welchen Chat geht eine Antwort (Regel „In den Chat schreiben",
 *  Chat-Befehl) auf dieses Ereignis? In den der auslösenden Plattform: Twitch
 *  → Twitch-Chat. Alles andere (TikTok, Timer, Test-Knopf, manuell) → TikTok-
 *  Chat wie bisher. Eine Antwort im TikTok-Chat auf einen Twitch-Follow wäre
 *  dort Spam — und verbrauchte die TikTok-Drossel für echte TikTok-Antworten. */
export function chatZiel(event: Pick<StudioEvent, 'plattform'>): Plattform {
  return event.plattform === 'twitch' ? 'twitch' : 'tiktok';
}
