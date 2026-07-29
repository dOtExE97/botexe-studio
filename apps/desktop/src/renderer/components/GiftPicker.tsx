// GiftPicker — visueller Gift-Auswähler mit Suche + Thumbnails. Ersetzt überall
// das blanke „Gift-Name eintippen"-Textfeld (Trigger-Bedingung, Bingo-Felder).
// Zeigt das gewählte Gift als Chip; Klick öffnet ein Such-Popover mit echtem
// Bild aus dem Gift-Katalog (642+).
import { useMemo, useRef, useState, useEffect } from 'react';
import { Search, ChevronDown, X, Star } from 'lucide-react';
import { useGiftCatalog, type GiftEntry } from '../hooks/useGiftCatalog';
import { passt } from '../../shared/suche';

// Suche kommt aus shared/suche.ts — dieselbe, die auch die Widget-Palette
// nutzt. Vorher lag hier eine eigene Kopie mit eigener Normalisierung.
function matchGift(needle: string, slug: string): boolean {
  return passt(needle, slug);
}

/** So viele Kacheln passen sinnvoll ins Popover. Mehr zu zeigen hilft nicht —
 *  ab da muss man ohnehin suchen. */
const MAX_ANZEIGE = 60;

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

    // Reihenfolge nach NÜTZLICHKEIT, nicht nach Preis.
    //
    // Der Anlass: Von den 5726 bekannten Geschenken sind über 4000 Fan-Club-
    // Abzeichen FREMDER Streamer („2ACT Crew", „805Chiefz", …) — allesamt für
    // 1 Coin. Da „günstig zuerst" sortiert wurde, standen genau die ganz oben,
    // und wer die Geldpistole suchte, hat sich durch hunderte davon gescrollt.
    //
    // Nichts wird ausgeblendet: Wer so ein Abzeichen wirklich braucht, findet
    // es weiterhin über die Suche. Es steht nur nicht mehr im Weg.
    const rang = (g: GiftEntry): number => {
      if (g.count > 0) return 0;                 // schon erhalten — kommt bei DIR wirklich vor
      if (g.de) return 1;                        // bekanntes Geschenk (hat einen deutschen Namen)
      if ((g.coins || 0) > 1) return 2;          // echtes Geschenk mit Preis
      return 3;                                  // vermutlich fremdes Fan-Club-Abzeichen
    };

    return [...list]
      .sort((a, b) =>
        rang(a) - rang(b)
        // Innerhalb einer Gruppe: günstige zuerst (dort sucht man meistens),
        // bei gleichem Preis alphabetisch.
        || (a.coins || 0) - (b.coins || 0)
        || a.slug.localeCompare(b.slug),
      )
      .slice(0, MAX_ANZEIGE);
  }, [gifts, q]);

  /** Wie viele Treffer es INSGESAMT gäbe — für den Hinweis, dass gekürzt wurde. */
  const gesamtTreffer = useMemo(() => {
    const needle = q.trim();
    if (!needle) return gifts.length;
    return gifts.filter((g) => matchGift(needle, g.slug) || (g.de ? matchGift(needle, g.de) : false)).length;
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
            /* Stand bisher: „einmal live verbinden, dann sind alle da" — das
               stimmt nur mit einem eulerstream-Bezahlplan. Mit dem Gratis-Key
               scheitert der Abruf der kompletten Room-Liste, und der Katalog
               füllt sich NUR mit Geschenken, die wirklich jemand geschickt hat.
               Die falsche Zusage ließ fehlende Bilder wie einen Fehler aussehen. */
            <p className="p-4 text-center text-xs leading-relaxed text-studio-muted">
              Noch keine Gifts im Katalog.
              <span className="mt-1 block">
                Sie sammeln sich, sobald du live bist — jedes Geschenk, das ankommt, landet mit
                Bild hier und bleibt dauerhaft.
              </span>
            </p>
          ) : (
            <>
              <div className="grid max-h-64 grid-cols-3 gap-1 overflow-y-auto">
                {results.map((g) => (
                  <GiftCell key={g.slug} gift={g} active={g.slug === value} onPick={() => { onChange(g.slug); setOpen(false); }} />
                ))}
              </div>
              {/* Ohne diesen Hinweis scrollt man durch die Liste und wundert
                  sich, warum das gesuchte Geschenk nicht auftaucht — bei über
                  5000 Einträgen ist Scrollen aussichtslos. */}
              {gesamtTreffer > results.length && (
                <p className="mt-1.5 px-1 text-center text-[10px] leading-relaxed text-studio-muted">
                  {q.trim()
                    ? `${gesamtTreffer} Treffer — die ersten ${results.length} werden gezeigt. Tipp genauer, um einzugrenzen.`
                    : <>Von <b className="text-studio-text/80">{gesamtTreffer.toLocaleString('de-DE')}</b> Geschenken werden die {results.length} gängigsten gezeigt. <b className="text-studio-text/80">Tipp oben einfach den Namen</b> — auch deutsch („Geldpistole") und mit Tippfehlern.</>}
                </p>
              )}
              {gesamtTreffer === 0 && (
                <p className="mt-1.5 px-1 text-center text-[10px] text-studio-muted">
                  Nichts gefunden. Versuch den englischen Namen — oder weniger Buchstaben.
                </p>
              )}
            </>
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
