// ToastHost — sichtbares Fehler-/Hinweis-Feedback. Lauscht auf Meldungen vom
// Main-Prozess (IPC: TTS-Fehler, Verbindungsabbruch …) UND auf renderer-interne
// Meldungen (Custom-Event 'bx-toast', z.B. Import fehlgeschlagen).
import { useEffect, useState } from 'react';
import { AlertTriangle, Info, CheckCircle2, X } from 'lucide-react';

export type ToastType = 'error' | 'warn' | 'info' | 'success';
interface Toast { id: number; type: ToastType; message: string }

/** Von überall im Renderer aufrufbar: zeigt einen Toast. */
export function toast(type: ToastType, message: string): void {
  window.dispatchEvent(new CustomEvent('bx-toast', { detail: { type, message } }));
}

const STYLE: Record<ToastType, { cls: string; Icon: typeof Info }> = {
  error: { cls: 'border-studio-accent/50 text-studio-accent', Icon: AlertTriangle },
  warn: { cls: 'border-studio-gold/50 text-studio-gold', Icon: AlertTriangle },
  info: { cls: 'border-studio-teal/50 text-studio-teal', Icon: Info },
  success: { cls: 'border-studio-teal/50 text-studio-teal', Icon: CheckCircle2 },
};

let seq = 0;

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const push = (type: ToastType, message: string) => {
      const id = ++seq;
      setToasts((ts) => [...ts.slice(-3), { id, type, message }]);
      setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), type === 'error' ? 7000 : 4500);
    };
    const onWin = (e: Event) => {
      const d = (e as CustomEvent<{ type: ToastType; message: string }>).detail;
      if (d?.message) push(d.type ?? 'info', d.message);
    };
    window.addEventListener('bx-toast', onWin);
    const off = window.studio?.onToast?.((t) => push((t.type as ToastType) ?? 'info', t.message));
    return () => {
      window.removeEventListener('bx-toast', onWin);
      off?.();
    };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex flex-col gap-2">
      {toasts.map((t) => {
        const { cls, Icon } = STYLE[t.type];
        return (
          <div
            key={t.id}
            className={`bx-card pointer-events-auto flex max-w-sm items-start gap-2.5 px-4 py-3 text-sm ${cls}`}
            style={{ animation: 'bx-toast-in 220ms cubic-bezier(.2,1.4,.35,1)' }}
          >
            <Icon size={17} className="mt-0.5 flex-none" />
            <span className="flex-1 text-studio-text/90">{t.message}</span>
            <button onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))} className="flex-none text-studio-muted hover:text-studio-text">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
