// AnAusSchalter.tsx — ein Schalter, dem man von weitem ansieht, ob er an ist.
//
// WARUM ES DAS GIBT
// Auf der Sprachausgabe-Seite gab es einen großen, gut sichtbaren Hauptschalter
// („TTS AKTIV") und daneben drei winzige Kästchen für „Chat vorlesen",
// „Follower ansagen" und „Gifts ansagen". Die Abschnitte darunter sahen immer
// gleich aus — mit allen Einstellfeldern, egal ob der Schalter an war oder aus.
//
// Das ist einer Nutzerin genau so passiert: Hauptschalter an, „Chat vorlesen"
// aus. Sie sah „TTS AKTIV" oben, sah den Abschnitt „Chat vorlesen" mit Stimme
// und Format darin — und hielt es für eingeschaltet. Der Chat blieb stumm, und
// im Log stand zwar der Grund, aber Logs liest niemand während des Streams.
//
// DIE REGEL DAHINTER: Ein Schalter, der etwas abschaltet, muss die abgeschaltete
// Sache auch abgeschaltet AUSSEHEN lassen. Sonst ist er eine Falle.
import type { ReactNode } from 'react';

export function AnAusSchalter({ an, onChange, titel, beschreibung, kinder, hinweis }: {
  an: boolean;
  onChange: (an: boolean) => void;
  titel: string;
  /** Ein Satz, was passiert, wenn er an ist. */
  beschreibung?: string;
  /** Die Einstellungen, die zu diesem Schalter gehören. */
  kinder?: ReactNode;
  /** Zusatz, der auch im AUS-Zustand gilt (z.B. was NICHT betroffen ist). */
  hinweis?: string;
}) {
  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        an ? 'border-studio-border' : 'border-studio-border/50 bg-black/20'
      }`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={an}
        onClick={() => onChange(!an)}
        className="flex w-full items-center gap-3 text-left"
      >
        {/* Der Schieber. Deutlich genug, dass man ihn im Vorbeigehen liest —
            eine 13-px-Checkbox ist das nicht. */}
        <span
          aria-hidden
          className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors ${
            an ? 'bg-studio-teal' : 'bg-studio-control border border-studio-control-border'
          }`}
        >
          <span
            className="absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all"
            style={{ left: an ? 21 : 3 }}
          />
        </span>
        <span className="flex-1">
          <span className={`block text-[13px] font-bold ${an ? 'text-studio-text' : 'text-studio-muted'}`}>
            {titel}
          </span>
          {beschreibung && (
            <span className="mt-0.5 block text-[11px] text-studio-muted">{beschreibung}</span>
          )}
        </span>
        {/* Der Zustand als WORT, nicht nur als Farbe — Farbe allein ist für
            rot-grün-blinde Augen keine Information. */}
        <span
          className={`shrink-0 rounded px-2 py-0.5 font-display text-[10px] uppercase tracking-[0.16em] ${
            an ? 'bg-studio-teal text-black' : 'border border-studio-control-border text-studio-muted'
          }`}
        >
          {an ? 'An' : 'Aus'}
        </span>
      </button>

      {kinder && (
        // Bei AUS gedämpft und nicht bedienbar: Sonst stellt jemand die Stimme
        // ein und wundert sich, dass nichts passiert.
        <div
          className={`mt-3 transition-opacity ${an ? '' : 'pointer-events-none opacity-40'}`}
          aria-hidden={!an}
        >
          {kinder}
        </div>
      )}

      {!an && hinweis && (
        <p className="mt-2 text-[11px] text-studio-muted">{hinweis}</p>
      )}
    </div>
  );
}
