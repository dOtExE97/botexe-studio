import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './renderer/App';
import ErrorBoundary from './renderer/components/ErrorBoundary';
import './renderer/styles/index.css';

// Absturzberichte (Sentry) im Renderer — NUR wenn der Nutzer zugestimmt hat
// (der Haupt-Prozess signalisiert das über window.bxTelemetryEnabled). Der
// Renderer sendet über den Haupt-Prozess; der Geheimnis-Filter dort greift für
// alles. Ohne Zustimmung wird Sentry gar nicht geladen.
if ((window as unknown as { bxTelemetryEnabled?: boolean }).bxTelemetryEnabled) {
  void import('@sentry/electron/renderer').then(({ init }) => {
    void import('./shared/telemetry').then(({ scrubEvent }) => {
      init({
        beforeSend: (event) => {
          scrubEvent(event as unknown as Record<string, unknown>);
          return event;
        },
      });
    });
  }).catch(() => { /* Telemetrie ist optional — Fehler hier nie hochreichen */ });
}

// Globale Renderer-Fehler ins Datei-Log spiegeln (sonst nur in den DevTools sichtbar).
window.addEventListener('error', (e) => {
  window.studio?.logRenderer?.('error', 'Window', `${e.message} @ ${e.filename}:${e.lineno}`);
});
window.addEventListener('unhandledrejection', (e) => {
  window.studio?.logRenderer?.('error', 'Promise', String((e as PromiseRejectionEvent).reason));
});

const container = document.getElementById('root');
if (!container) throw new Error('#root fehlt im index.html');
createRoot(container).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
