// telemetry-main.ts — Sentry im HAUPT-Prozess. Wird NUR aufgerufen, wenn der
// Nutzer zugestimmt hat (Einstellung telemetry === 'on'). Ohne Zustimmung wird
// Sentry gar nicht initialisiert → es geht nichts raus.
import * as Sentry from '@sentry/electron/main';
import { SENTRY_DSN, scrubEvent, telemetryEnvironment } from '../shared/telemetry';

export function initMainTelemetry(version: string, packaged: boolean): void {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: `botexe-studio@${version}`,
    environment: telemetryEnvironment(packaged),
    // Nur Fehler — keine Performance-/Trace-Daten.
    tracesSampleRate: 0,
    // Klick-/Konsolen-Spur begrenzen (weniger Datenanfall).
    maxBreadcrumbs: 30,
    // Jedes Ereignis läuft durch den Geheimnis-Filter, bevor es rausgeht.
    beforeSend: (event) => {
      scrubEvent(event as unknown as Record<string, unknown>);
      return event;
    },
    beforeBreadcrumb: (crumb) => {
      scrubEvent(crumb as unknown as Record<string, unknown>);
      return crumb;
    },
  });
}
