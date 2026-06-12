import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './renderer/App';
import ErrorBoundary from './renderer/components/ErrorBoundary';
import './renderer/styles/index.css';

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
