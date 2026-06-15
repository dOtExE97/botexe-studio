// ToastHost — sichtbares Fehler-/Hinweis-Feedback. Lauscht auf Meldungen vom
// Main-Prozess (IPC: TTS-Fehler, Verbindungsabbruch …) UND auf renderer-interne
// Meldungen (Custom-Event 'bx-toast', z.B. Import fehlgeschlagen).
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Info, CheckCircle2, X } from 'lucide-react';

export type ToastType = 'error' | 'warn' | 'info' | 'success';
interface ToastAction { label: string; onClick: () => void }
interface Toast { id: number; type: ToastType; message: string; action?: ToastAction }

/** Von überall im Renderer aufrufbar: zeigt einen Toast. */
export function toast(type: ToastType, message: string): void {
  window.dispatchEvent(new CustomEvent('bx-toast', { detail: { type, message } }));
}

/** Toast mit Aktion, z.B. „Gelöscht — [Rückgängig]". */
export function toastAction(type: ToastType, message: string, action: ToastAction): void {
  window.dispatchEvent(new CustomEvent('bx-toast', { detail: { type, message, action } }));
}

const STYLE: Record<ToastType, { cls: string; Icon: typeof Info }> = {
  error: { cls: 'border-studio-accent/50 text-studio-accent', Icon: AlertTriangle },
  warn: { cls: 'border-studio-gold/50 text-studio-gold', Icon: AlertTriangle },
  info: { cls: 'border-sky-400/50 text-sky-300', Icon: Info },
  success: { cls: 'border-emerald-400/50 text-emerald-300', Icon: CheckCircle2 },
};

let seq = 0;

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    const push = (type: ToastType, message: string, action?: ToastAction) => {
      const id = ++seq;
      setToasts((ts) => [...ts.slice(-3), { id, type, message, action }]);
      const t = setTimeout(() => {
        pending.delete(t);
        setToasts((ts) => ts.filter((x) => x.id !== id));
      }, action ? 7000 : type === 'error' ? 7000 : 4500);
      pending.add(t);
    };
    const onWin = (e: Event) => {
      const d = (e as CustomEvent<{ type: ToastType; message: string; action?: ToastAction }>).detail;
      if (d?.message) push(d.type ?? 'info', d.message, d.action);
    };
    window.addEventListener('bx-toast', onWin);
    const off = window.studio?.onToast?.((t) => push((t.type as ToastType) ?? 'info', t.message));
    return () => {
      window.removeEventListener('bx-toast', onWin);
      off?.();
      for (const t of pending) clearTimeout(t);
      pending.clear();
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
            {t.action && (
              <button
                onClick={() => { t.action?.onClick(); setToasts((ts) => ts.filter((x) => x.id !== t.id)); }}
                className="flex-none rounded-md bg-studio-raised px-2 py-0.5 text-xs font-bold text-studio-text hover:bg-studio-accent hover:text-black"
              >
                {t.action.label}
              </button>
            )}
            <button onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))} className="flex-none text-studio-muted hover:text-studio-text">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
