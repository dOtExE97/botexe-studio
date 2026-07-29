// EbenenListe — alle Widgets des Layouts auf einen Blick, mit Sichtbarkeit,
// Sperre und Stapel-Reihenfolge.
//
// Warum: Bisher sah man nur, was auf der Fläche liegt. Bei einem
// bildschirmfüllenden Widget (Feuerwerk, Konfetti) verdeckt es alles darunter
// — anklicken ließ sich das Darunterliegende dann gar nicht mehr. Und der
// Sichtbar-Haken lag versteckt in den Eigenschaften des ausgewählten Widgets:
// Um etwas auszublenden, musste man es also erst anklicken können.
//
// Die Liste ist nach Stapel-Reihenfolge sortiert — OBEN in der Liste heißt
// oben auf dem Bild, wie man es aus Bildbearbeitungen kennt.
import { Eye, EyeOff, Lock, LockOpen, ChevronUp, ChevronDown, Layers, Trash2 } from 'lucide-react';
import type { OverlayLayer } from '@botexe/overlay-engine';

interface Props {
  layers: OverlayLayer[];
  selectedId: string | null;
  hoveredId: string | null;
  labelFor: (l: OverlayLayer) => string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<OverlayLayer>) => void;
  /** Stapel-Reihenfolge ändern: +1 = weiter nach vorn, -1 = nach hinten. */
  onMove: (id: string, richtung: 1 | -1) => void;
  onDelete: (id: string) => void;
}

export default function EbenenListe({
  layers, selectedId, hoveredId, labelFor, onSelect, onHover, onPatch, onMove, onDelete,
}: Props) {
  // Oberstes zuerst — wie in jeder Bildbearbeitung.
  const sortiert = [...layers].sort((a, b) => b.z - a.z);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-studio-gold">
          <Layers size={12} /> Ebenen
        </span>
        <span className="text-[10px] text-studio-muted">{layers.length}</span>
      </div>

      {layers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-studio-border p-3 text-center text-[11px] text-studio-muted">
          Noch keine Widgets. Zieh eins aus der Palette auf die Fläche.
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto pr-0.5">
          {sortiert.map((l, i) => {
            const aktiv = l.id === selectedId;
            return (
              <li
                key={l.id}
                onMouseEnter={() => onHover(l.id)}
                onMouseLeave={() => onHover(null)}
                className={`group flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors ${
                  aktiv ? 'bg-studio-accent/20 ring-1 ring-studio-accent/60'
                    : l.id === hoveredId ? 'bg-studio-raised' : 'hover:bg-studio-raised/60'
                }`}
              >
                {/* Sichtbarkeit — der häufigste Griff, deshalb ganz vorn. */}
                <button
                  onClick={() => onPatch(l.id, { visible: !l.visible })}
                  title={l.visible ? 'Ausblenden (im Stream nicht zu sehen)' : 'Wieder einblenden'}
                  className={`flex-none rounded p-0.5 ${l.visible ? 'text-studio-muted hover:text-studio-text' : 'text-studio-accent'}`}
                >
                  {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>

                {/* Sperre — verhindert versehentliches Verschieben. */}
                <button
                  onClick={() => onPatch(l.id, { locked: !l.locked })}
                  title={l.locked
                    ? 'Entsperren — wieder auf der Fläche verschiebbar'
                    : 'Sperren — bleibt sichtbar, lässt sich aber nicht mehr aus Versehen verschieben'}
                  className={`flex-none rounded p-0.5 ${l.locked ? 'text-studio-gold' : 'text-studio-muted/50 hover:text-studio-text'}`}
                >
                  {l.locked ? <Lock size={12} /> : <LockOpen size={12} />}
                </button>

                <button
                  onClick={() => onSelect(l.id)}
                  className={`min-w-0 flex-1 truncate text-left text-[11px] ${
                    l.visible ? 'text-studio-text/90' : 'text-studio-muted line-through decoration-studio-muted/50'
                  }`}
                  title={`${labelFor(l)} — anklicken zum Auswählen`}
                >
                  {l.name || labelFor(l)}
                </button>

                {/* Stapel-Reihenfolge. Erscheint erst beim Darüberfahren —
                    sonst wirkt die Liste wie ein Cockpit. */}
                <span className="flex flex-none items-center opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => onMove(l.id, 1)}
                    disabled={i === 0}
                    title="Weiter nach vorn"
                    className="rounded p-0.5 text-studio-muted hover:text-studio-teal disabled:opacity-25"
                  >
                    <ChevronUp size={11} />
                  </button>
                  <button
                    onClick={() => onMove(l.id, -1)}
                    disabled={i === sortiert.length - 1}
                    title="Weiter nach hinten"
                    className="rounded p-0.5 text-studio-muted hover:text-studio-teal disabled:opacity-25"
                  >
                    <ChevronDown size={11} />
                  </button>
                  <button
                    onClick={() => onDelete(l.id)}
                    title="Widget entfernen"
                    className="rounded p-0.5 text-studio-muted hover:text-studio-accent"
                  >
                    <Trash2 size={11} />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-1.5 text-[9px] leading-relaxed text-studio-muted/70">
        Oben in der Liste = oben im Bild. Ein <b>gesperrtes</b> Widget bleibt sichtbar, liegt aber
        anderen nicht mehr im Weg.
      </p>
    </div>
  );
}
