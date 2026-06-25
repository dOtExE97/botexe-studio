// GiftPicker — visueller Gift-Auswähler mit Suche + Thumbnails. Ersetzt überall
// das blanke „Gift-Name eintippen"-Textfeld (Trigger-Bedingung, Bingo-Felder).
// Zeigt das gewählte Gift als Chip; Klick öffnet ein Such-Popover mit echtem
// Bild aus dem Gift-Katalog (642+).
import { useMemo, useRef, useState, useEffect } from 'react';
import { Search, ChevronDown, X, Star } from 'lucide-react';
import { useGiftCatalog, type GiftEntry } from '../hooks/useGiftCatalog';

/** Nur Buchstaben/Ziffern, klein — macht die Suche tolerant gegen Apostroph,
 *  Leerzeichen & Co. (z.B. „Jollie's Community" → „jolliescommunity"). */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Levenshtein-Distanz, früh abgebrochen — für Tippfehler-Toleranz („jolly"→„jollie"). */
function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prevRow = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const curRow = [i + 1];
    for (let j = 0; j < b.length; j++) {
      curRow.push(Math.min(
        (curRow[j] ?? 0) + 1,
        (prevRow[j + 1] ?? 0) + 1,
        (prevRow[j] ?? 0) + (a[i] === b[j] ? 0 : 1),
      ));
    }
    prevRow = curRow;
  }
  return prevRow[b.length] ?? 99;
}

/** Passt der Suchbegriff aufs Gift? Teilstring (sonderzeichen-tolerant) ODER ein
 *  Wort des Namens mit ≤2 Tippfehlern — so findet „jolly" auch „Jollie's …". */
function matchGift(needle: string, slug: string): boolean {
  const n = norm(needle);
  if (!n) return true;
  if (norm(slug).includes(n)) return true;
  if (n.length < 4) return false;
  return slug.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length >= 4 && lev(w, n) <= 2);
}

interface Props {
  value: string;
  onChange: (slug: string) => void;
  placeholder?: string;
}

export default function GiftPicker({ value, onChange, placeholder = 'Gift wählen…' }: Props) {
  const { gifts, loaded } = useGiftCatalog();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Klick außerhalb schließt das Popover.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = useMemo(
    () => gifts.find((g) => g.slug.toLowerCase() === value.trim().toLowerCase()),
    [gifts, value],
  );

  const results = useMemo(() => {
    const needle = q.trim();
    const list = needle
      ? gifts.filter((g) => matchGift(needle, g.slug) || (g.de ? matchGift(needle, g.de) : false))
      : gifts;
    // Schon erhaltene Gifts (count>0) zuerst — die kommen bei DIR wirklich vor;
    // danach günstige zuerst. So sind die drei „Jollies" leicht auseinanderzuhalten.
    return [...list]
      .sort((a, b) =>
        (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0) ||
        (a.coins || 0) - (b.coins || 0) ||
        a.slug.localeCompare(b.slug),
      )
      .slice(0, 60);
  }, [gifts, q]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="bx-input flex w-full items-center gap-2 text-left"
      >
        {current?.icon && <img src={current.icon} alt="" className="h-5 w-5 object-contain" />}
        <span className={`flex-1 truncate ${value ? '' : 'text-studio-muted'}`}>
          {current?.de || value || placeholder}
        </span>
        {value && (
          <X
            size={13}
            className="text-studio-muted hover:text-studio-accent"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
          />
        )}
        <ChevronDown size={14} className="text-studio-muted" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-full rounded-xl border border-studio-border bg-studio-raised p-2 shadow-2xl">
          <label className="mb-2 flex items-center gap-2 rounded-lg bg-studio-bg px-2.5 py-1.5">
            <Search size={14} className="text-studio-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Gift suchen…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          {!loaded ? (
            <p className="p-4 text-center text-xs text-studio-muted">Lade Katalog…</p>
          ) : gifts.length === 0 ? (
            <p className="p-4 text-center text-xs text-studio-muted">
              Noch keine Gifts im Katalog — einmal live verbinden, dann sind alle da.
            </p>
          ) : (
            <div className="grid max-h-64 grid-cols-3 gap-1 overflow-y-auto">
              {results.map((g) => (
                <GiftCell key={g.slug} gift={g} active={g.slug === value} onPick={() => { onChange(g.slug); setOpen(false); }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GiftCell({ gift, active, onPick }: { gift: GiftEntry; active: boolean; onPick: () => void }) {
  const received = gift.count > 0;
  return (
    <button
      type="button"
      onClick={onPick}
      title={`${gift.de ? `${gift.de} (${gift.slug})` : gift.slug}${gift.coins > 0 ? ` · ${gift.coins} Coins` : ''}${received ? ` · schon ${gift.count}× erhalten` : ''}`}
      className={`relative flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-colors hover:bg-studio-accent/15 ${active ? 'bg-studio-accent/20 ring-1 ring-studio-accent' : ''}`}
    >
      {/* Schon erhalten → Stern: zeigt, welches Gift bei DIR wirklich vorkommt. */}
      {received && <Star size={11} className="absolute right-1 top-1 fill-studio-gold text-studio-gold" />}
      {gift.icon ? (
        <img src={gift.icon} alt="" className="h-9 w-9 object-contain" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded bg-studio-bg text-[9px] text-studio-muted">?</div>
      )}
      <span className="w-full truncate text-center text-[9px] text-studio-text/90">{gift.de || gift.slug}</span>
      <span className="text-[8px] font-mono text-studio-muted">{gift.coins > 0 ? `${gift.coins} 🪙` : '—'}</span>
    </button>
  );
}
