// ConfirmButton — Schutz vor Fehlklicks bei destruktiven Aktionen.
// Erster Klick „scharf schalten" → zeigt „Sicher? ✓ ✕" inline; erst der zweite
// Klick führt aus. Setzt sich nach kurzer Zeit selbst zurück. Kein nativer Dialog
// (passt besser zum Inline-Stil und blockiert nichts).
import { useEffect, useState, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';

interface Props {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
  confirmLabel?: string;
  title?: string;
}

export default function ConfirmButton({ onConfirm, children, className, confirmLabel = 'Sicher?', title }: Props) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  if (armed) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-[11px] text-studio-muted">{confirmLabel}</span>
        <button
          onClick={() => { setArmed(false); onConfirm(); }}
          className="rounded-md bg-studio-accent/20 p-1 text-studio-accent hover:bg-studio-accent hover:text-black"
          title="Ja, ausführen"
        >
          <Check size={13} />
        </button>
        <button
          onClick={() => setArmed(false)}
          className="rounded-md bg-studio-raised p-1 text-studio-muted hover:text-studio-text"
          title="Abbrechen"
        >
          <X size={13} />
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setArmed(true)} className={className} title={title}>
      {children}
    </button>
  );
}
