// GiftCommandListEditor — pro Zeile ein GESCHENK (durchsuchbarer Picker) + ein
// Text, was es auslöst. Für das Befehl-Karussell. Serialisiert als
// "slug::Text | slug2::Text2" (parseItems im Widget versteht das + Legacy-Emoji).
import { useEffect, useRef, useState } from 'react';
import { X, Plus } from 'lucide-react';
import GiftPicker from './GiftPicker';

interface Row {
  slug: string;
  text: string;
}

function parse(value: string): Row[] {
  return String(value || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf('::');
      if (i >= 0) return { slug: s.slice(0, i).trim(), text: s.slice(i + 2).trim() };
      return { slug: '', text: s }; // Legacy-/Nur-Text-Eintrag
    });
}

function serialize(rows: Row[]): string {
  return rows
    .filter((r) => r.slug || r.text)
    .map((r) => (r.slug ? `${r.slug}::${r.text}` : r.text))
    .join(' | ');
}

export default function GiftCommandListEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  // Lokaler Zustand, damit auch leere Zeilen (frisch hinzugefügt) bestehen
  // bleiben — serialize filtert sie nur fürs Speichern raus.
  const [rows, setRows] = useState<Row[]>(() => parse(value));
  const lastSent = useRef(value);
  useEffect(() => {
    // Nur bei EXTERNER Änderung (anderes Widget gewählt) neu einlesen.
    if (value !== lastSent.current) {
      setRows(parse(value));
      lastSent.current = value;
    }
  }, [value]);

  const commit = (next: Row[]) => {
    const s = serialize(next);
    lastSent.current = s;
    setRows(next);
    onChange(s);
  };
  const setRow = (i: number, patch: Partial<Row>) => commit(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => commit(rows.filter((_, j) => j !== i));
  const add = () => commit([...rows, { slug: '', text: '' }]);

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="w-[44%] flex-none">
            <GiftPicker value={row.slug} onChange={(slug) => setRow(i, { slug })} placeholder="Gift…" />
          </div>
          <input
            value={row.text}
            // | und :: sind Trennzeichen im Speicherformat → im Text neutralisieren,
            // damit eine Eingabe die Liste nicht zerschießt.
            onChange={(e) => setRow(i, { text: e.target.value.replace(/\|/g, '/').replace(/::/g, ':') })}
            placeholder="Auslöser/Text (z.B. !feuer)"
            className="bx-input min-w-0 flex-1 text-xs normal-case tracking-normal"
          />
          <button onClick={() => remove(i)} className="flex-none text-studio-muted hover:text-studio-accent" title="Zeile entfernen">
            <X size={13} />
          </button>
        </div>
      ))}
      <button onClick={add} className="bx-pill mt-0.5 self-start text-[11px] hover:border-studio-accent hover:text-studio-accent">
        <Plus size={12} /> Geschenk + Text
      </button>
    </div>
  );
}
