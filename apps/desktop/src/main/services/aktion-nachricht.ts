// aktion-nachricht.ts — baut die Overlay-Nachricht einer ausgelösten Aktion.
//
// Eigene kleine Datei, damit die Plattform-Regel ohne die ganze Studio-Klasse
// prüfbar ist: Die Aktion trägt die Plattform des AUSLÖSENDEN Ereignisses.
// Ein Twitch-Follow, der eine Follow-Regel auslöst, darf seinen Alarm nicht
// ins TikTok-Overlay schicken. Ereignis ohne Plattform (Timer, Test-Knopf,
// manuell) → Aktion ohne Plattform → an alle Overlays, wie bisher.
import type { StudioEvent, TriggerAction } from '@botexe/trigger-engine';
import type { OverlayMessage } from '../adapters/overlay-server';

export function aktionsNachricht(
  ruleId: string,
  action: TriggerAction,
  event: Pick<StudioEvent, 'plattform'>,
): Extract<OverlayMessage, { kind: 'action' }> {
  return { kind: 'action', ruleId, action, ...(event.plattform ? { plattform: event.plattform } : {}) };
}
