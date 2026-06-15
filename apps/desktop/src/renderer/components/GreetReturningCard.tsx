// GreetReturningCard.tsx — Stammgast-Begrüßung: wiederkehrende Zuschauer werden
// beim ersten Chat der Session per TTS willkommen geheißen.
import { useEffect, useState } from 'react';
import { UserCheck } from 'lucide-react';

interface Greet { enabled: boolean; minVisits: number; template: string }

export default function GreetReturningCard() {
  const [g, setG] = useState<Greet>({ enabled: false, minVisits: 2, template: '' });

  useEffect(() => { void window.studio.getGreet().then((s) => setG(s as Greet)); }, []);
  const patch = (p: Partial<Greet>) => { setG((s) => ({ ...s, ...p })); void window.studio.setGreet(p); };

  return (
    <section className="bx-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserCheck size={18} className="text-studio-teal" />
        <h3 className="font-display text-sm uppercase tracking-wider">Stammgast-Begrüßung</h3>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs">
          <input type="checkbox" checked={g.enabled} onChange={(e) => patch({ enabled: e.target.checked })} className="accent-[#21e6c1]" />
          Aktiv
        </label>
      </div>
      <div className="grid grid-cols-[auto,1fr] items-center gap-3">
        <label className="text-[11px] uppercase tracking-wider text-studio-muted">
          Ab Besuch
          <input type="number" min={2} className="bx-input mt-1 w-20 font-mono" value={g.minVisits}
            onChange={(e) => setG((s) => ({ ...s, minVisits: Math.max(2, Number(e.target.value)) }))}
            onBlur={(e) => patch({ minVisits: Math.max(2, Number(e.target.value)) })} />
        </label>
        <label className="text-[11px] uppercase tracking-wider text-studio-muted">
          Ansage-Vorlage
          <input className="bx-input mt-1" value={g.template}
            onChange={(e) => setG((s) => ({ ...s, template: e.target.value }))}
            onBlur={(e) => patch({ template: e.target.value })} />
        </label>
      </div>
      <p className="mt-2 text-[11px] text-studio-muted/70">
        Platzhalter: <b>{'{user}'}</b> = Name, <b>{'{visits}'}</b> = Anzahl Besuche. Wird per TTS gesprochen
        (TTS muss aktiv sein). Ein neuer Besuch zählt nach ≥ 4 h Pause.
      </p>
    </section>
  );
}
