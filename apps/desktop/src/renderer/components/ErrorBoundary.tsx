// ErrorBoundary — fängt Render-Crashes ab, statt die ganze App weiß werden zu
// lassen. Zeigt einen freundlichen Hinweis + Neu-laden, und spiegelt den Fehler
// ins zentrale Datei-Log (damit man auf dem Stream-PC sieht, was kaputt war).
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, FileText } from 'lucide-react';

interface Props { children: ReactNode }
interface State { error: Error | null }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const detail = `${error.message}\n${error.stack ?? ''}\n${info.componentStack ?? ''}`;
    window.studio?.logRenderer?.('error', 'UI', detail);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertTriangle size={48} className="text-studio-accent" />
        <h1 className="font-display text-xl uppercase">Etwas ist abgestürzt</h1>
        <p className="max-w-md text-sm text-studio-muted">
          Die Oberfläche hatte einen Fehler. Dein Overlay & der Server laufen weiter — nur dieses Fenster braucht ein Neu-laden.
          Der Fehler steht im Log.
        </p>
        <code className="max-w-lg overflow-auto rounded bg-studio-bg px-3 py-2 font-mono text-[11px] text-studio-accent">
          {this.state.error.message}
        </code>
        <div className="flex gap-2">
          <button onClick={() => window.location.reload()} className="bx-btn-accent">
            <RotateCcw size={15} /> Neu laden
          </button>
          <button onClick={() => void window.studio?.openLogs?.()} className="bx-pill">
            <FileText size={14} /> Logs öffnen
          </button>
        </div>
      </div>
    );
  }
}
