// StringListEditor — eine Liste einfacher Text-Einträge, jede Zeile einzeln
// bearbeitbar, mit Hinzufügen / Entfernen / Sortieren. Ersetzt die frueheren
// „alles in EINE Zeile mit | oder , getrennt"-Felder (Glücksrad-Preise,
// Laufband-Nachrichten, Quiz-Antworten …), die kaum bedienbar waren.
// Gespeichert wird weiterhin als getrennter String → rückwärtskompatibel.
import { useEffect, useRef, useState } from 'react';
import { X, Plus, ChevronUp, ChevronDown } from 'lucide-react';

function parse(value: string, sep: string): string[] {
  return String(value || '')
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);
}
function serialize(rows: string[], sep: string): string {
  // Bar mit dem Trennzeichen zusammensetzen (jedes Widget splittet darauf und
  // trimmt). Das Trennzeichen selbst wird beim Tippen aus den Einträgen
  // neutralisiert (siehe setRow), damit die Liste nicht zerreißt.
  return rows.map((r) => r.trim()).filter(Boolean).join(sep);
}

export default function StringListEditor({
  value,
  onChange,
  separator = '|',
  placeholder,
  addLabel = 'Eintrag hinzufügen',
  maxItems,
}: {
  value: string;
  onChange: (next: string) => void;
  separator?: string;
  placeholder?: string;
  addLabel?: string;
  maxItems?: number;
}) {
  const sep = separator;
  // Lokaler Zustand, damit frisch hinzugefügte LEERE Zeilen bestehen bleiben
  // (serialize filtert sie nur beim Speichern raus).
  const [rows, setRows] = useState<string[]>(() => {
    const p = parse(value, sep);
    return p.length ? p : [''];
  });
  const lastSent = useRef(value);
  useEffect(() => {
    if (value !== lastSent.current) {
      const p = parse(value, sep);
      setRows(p.length ? p : ['']);
      lastSent.current = value;
    }
  }, [value, sep]);

  const commit = (next: string[]) => {
    const s = serialize(next, sep);
    lastSent.current = s;
    setRows(next);
    onChange(s);
  };
  const setRow = (i: number, v: string) => {
    // Das Trennzeichen im Text neutralisieren, damit die Liste heil bleibt.
    const clean = v.split(sep).join('/');
    commit(rows.map((r, j) => (j === i ? clean : r)));
  };
  const remove = (i: number) => {
    const next = rows.filter((_, j) => j !== i);
    commit(next.length ? next : ['']);
  };
  const add = () => { if (!maxItems || rows.length < maxItems) commit([...rows, '']); };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    const a = rows[i];
    const b = rows[j];
    if (a === undefined || b === undefined) return;
    const next = [...rows];
    next[i] = b;
    next[j] = a;
    commit(next);
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-4 flex-none text-center font-mono text-[10px] text-studio-muted">{i + 1}</span>
          <div className="flex flex-none flex-col justify-center">
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="text-studio-muted hover:text-studio-accent disabled:opacity-25 disabled:hover:text-studio-muted"
              title="Nach oben"
            >
              <ChevronUp size={11} />
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === rows.length - 1}
              className="text-studio-muted hover:text-studio-accent disabled:opacity-25 disabled:hover:text-studio-muted"
              title="Nach unten"
            >
              <ChevronDown size={11} />
            </button>
          </div>
          <input
            value={row}
            onChange={(e) => setRow(i, e.target.value)}
            placeholder={placeholder ?? 'Eintrag…'}
            className="bx-input min-w-0 flex-1 text-xs normal-case tracking-normal"
          />
          <button
            onClick={() => remove(i)}
            className="flex-none text-studio-muted hover:text-studio-accent"
            title="Zeile entfernen"
          >
            <X size={13} />
          </button>
        </div>
      ))}
      {(!maxItems || rows.length < maxItems) && (
        <button
          onClick={add}
          className="bx-pill mt-0.5 self-start text-[11px] hover:border-studio-accent hover:text-studio-accent"
        >
          <Plus size={12} /> {addLabel}
        </button>
      )}
      {maxItems && rows.length >= maxItems && (
        <span className="text-[10px] text-studio-muted/70">Maximal {maxItems} Einträge.</span>
      )}
    </div>
  );
}
