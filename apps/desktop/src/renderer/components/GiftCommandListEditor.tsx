// GiftCommandListEditor — pro Zeile ein GESCHENK (durchsuchbarer Picker) + ein
// Text, was es auslöst. Für das Befehl-Karussell. Serialisiert als
// "slug::Text | slug2::Text2" (parseItems im Widget versteht das + Legacy-Emoji).
// Optional trägt eine Zeile eine Challenge-Dauer ("slug::Text::60" — Sekunden),
// die als drittes Feld nur geschrieben wird, wenn secs > 0 (unverändertes
// Format bleibt sonst 2-feldig).
import { useEffect, useRef, useState } from 'react';
import { X, Plus, ChevronUp, ChevronDown, Timer } from 'lucide-react';
import GiftPicker from './GiftPicker';

interface Row {
  slug: string;
  text: string;
  secs?: number;
}

export function parse(value: string): Row[] {
  return String(value || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split('::');
      if (parts.length === 1) return { slug: '', text: (parts[0] ?? '').trim() }; // Legacy-/Nur-Text-Eintrag
      const slug = (parts[0] ?? '').trim();
      const rest = parts.slice(1).map((p) => p.trim());
      let secs = 0;
      // Dauer nur, wenn NEBEN dem Text ein reines Zahlen-Feld am Ende steht
      // (mind. 2 Felder nach dem slug) — „slug::42" bleibt Text, kein Timer.
      const last = rest[rest.length - 1];
      if (rest.length >= 2 && last !== undefined && /^\d+$/.test(last)) {
        secs = Number(rest.pop());
      }
      const text = rest.join('::').trim();
      return secs > 0 ? { slug, text, secs } : { slug, text };
    });
}

export function serialize(rows: Row[]): string {
  return rows
    .filter((r) => r.slug || r.text)
    .map((r) => {
      const base = r.slug ? `${r.slug}::${r.text}` : r.text;
      return r.secs && r.secs > 0 ? `${base}::${r.secs}` : base;
    })
    .join(' | ');
}

export default function GiftCommandListEditor(
  { value, onChange, textPlaceholder }: { value: string; onChange: (next: string) => void; textPlaceholder?: string },
) {
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
  /** Zeile um eine Position verschieben. Beim Geschenk-Menü ist die Reihenfolge
   *  sichtbar (so rotiert die Tafel bzw. so läuft das Band) — ohne Verschieben
   *  müsste man zum Umsortieren alles neu eintippen. */
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    const a = rows[i];
    const b = rows[j];
    if (!a || !b) return;
    const next = [...rows];
    next[i] = b;
    next[j] = a;
    commit(next);
  };

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {/* Zwei Ebenen pro Zeile statt nebeneinander: die Eigenschaften-Spalte ist
          nur ~230px breit — nebeneinander blieb vom Textfeld so wenig übrig,
          dass schon der Platzhalter abgeschnitten wurde („Auslöser/Te"). */}
      {rows.map((row, i) => (
        <div key={i} className="rounded-md border border-studio-border bg-studio-raised/40 p-1.5">
          <div className="flex items-center gap-1">
            <span className="w-4 flex-none text-center font-mono text-[10px] text-studio-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <GiftPicker value={row.slug} onChange={(slug) => setRow(i, { slug })} placeholder="Geschenk wählen…" />
            </div>
            <button
              onClick={() => move(i, -1)}
              disabled={i === 0}
              className="flex-none text-studio-muted hover:text-studio-accent disabled:opacity-25 disabled:hover:text-studio-muted"
              title="Nach oben"
            >
              <ChevronUp size={13} />
            </button>
            <button
              onClick={() => move(i, 1)}
              disabled={i === rows.length - 1}
              className="flex-none text-studio-muted hover:text-studio-accent disabled:opacity-25 disabled:hover:text-studio-muted"
              title="Nach unten"
            >
              <ChevronDown size={13} />
            </button>
            <button onClick={() => remove(i)} className="flex-none text-studio-muted hover:text-studio-accent" title="Zeile entfernen">
              <X size={13} />
            </button>
          </div>
          <input
            value={row.text}
            // | und :: sind Trennzeichen im Speicherformat → im Text neutralisieren,
            // damit eine Eingabe die Liste nicht zerschießt.
            onChange={(e) => setRow(i, { text: e.target.value.replace(/\|/g, '/').replace(/::/g, ':') })}
            placeholder={textPlaceholder ?? 'Auslöser/Text (z.B. !feuer)'}
            className="bx-input mt-1 w-full text-xs normal-case tracking-normal"
          />
          {/* Eigene, klar beschriftete Zeile für die optionale Challenge-Dauer —
              vorher war es nur ein kryptisches „Min"-Kästchen. Eingabe in MINUTEN,
              gespeichert in Sekunden (secs). Leer/0 ⇒ kein Timer, kein 3. Feld.
              .bx-input setzt width:100% unlayered (schlägt jede Tailwind-Breiten-
              Utility) — feste Breite darum per Inline-Style erzwingen. */}
          <label className="mt-1.5 flex items-center gap-1.5 text-[10px] normal-case tracking-normal text-studio-muted">
            <Timer size={13} className="flex-none text-studio-gold" />
            <span className="flex-none">Challenge-Timer:</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={row.secs ? row.secs / 60 : ''}
              onChange={(e) => {
                const min = Number(e.target.value);
                setRow(i, { secs: min > 0 ? Math.round(min * 60) : 0 });
              }}
              placeholder="–"
              title="Challenge-Dauer in Minuten — läuft als Countdown im Overlay, wenn dieses Geschenk kommt. Leer = kein Timer."
              style={{ width: '3rem' }}
              className="bx-input flex-none px-1.5 py-1 text-center text-xs"
            />
            <span className="flex-none">Min</span>
            <span className="flex-none text-studio-muted/70">· leer = kein Timer</span>
          </label>
        </div>
      ))}
      <p className="mt-0.5 flex items-start gap-1.5 text-[10px] leading-snug normal-case tracking-normal text-studio-muted/80">
        <Timer size={12} className="mt-0.5 flex-none text-studio-gold" />
        <span><b>Challenge-Timer</b> (optional): Trag Minuten ein, dann läuft bei diesem Geschenk ein sichtbarer Countdown im Overlay — z.&nbsp;B. „1&nbsp;Min still sein". Leer lassen = nur der Text, kein Timer.</span>
      </p>
      {rows.length === 0 && (
        <p className="normal-case tracking-normal text-studio-muted/70">
          Noch nichts eingetragen — unten eine Zeile hinzufügen.
        </p>
      )}
      <button onClick={add} className="bx-pill mt-0.5 self-start text-[11px] hover:border-studio-accent hover:text-studio-accent">
        <Plus size={12} /> Geschenk + Text
      </button>
    </div>
  );
}
