// WidgetKatalog — der Vollbild-Katalog über der ganzen App.
//
// WARUM ES DAS GIBT: In der schmalen Leiste am Rand ist immer nur eine
// Kategorie sichtbar. Wer nicht weiß, in welchem Reiter etwas liegt, findet es
// nicht — und wer den Namen nicht kennt, kann auch nicht danach suchen. Die
// aufgeklappte Leiste war ein Zwischenschritt: Sie nahm der Bühne die halbe
// Breite und zeigte trotzdem nur zwei bis drei Kacheln nebeneinander.
//
// Hier ist das Verhältnis umgedreht: volle Fensterbreite, Kategorien als
// Sprungleiste links, vier bis fünf echte Vorschauen nebeneinander. Ein Klick
// legt das Widget an und schließt.
//
// Die Einteilung und die Suche kommen aus palette-gruppen.ts — dieselben, die
// auch die schmale Leiste benutzt. Zwei Kopien wären zwei Suchen, die
// auseinanderlaufen.
import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search } from 'lucide-react';
import { WIDGET_TYPES } from '../pages/widget-types';
import { alleGruppen, sucheWidgets } from '../pages/palette-gruppen';

type WidgetDef = (typeof WIDGET_TYPES)[number];

interface Props {
  offen: boolean;
  onClose: () => void;
  /** Eine Kachel — dieselbe Darstellung wie in der schmalen Leiste. */
  renderKarte: (w: WidgetDef) => React.ReactNode;
  /** Symbol je Kategorie-id (die Icons leben in der Seite, nicht in der Einteilung). */
  icons: Record<string, React.ComponentType<{ size?: number }>>;
}

export default function WidgetKatalog({ offen, onClose, renderKarte, icons }: Props) {
  const [suche, setSuche] = useState('');
  const [aktiv, setAktiv] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sucheRef = useRef<HTMLInputElement>(null);

  const gruppen = useMemo(() => alleGruppen(WIDGET_TYPES), []);
  const treffer = useMemo(() => (suche.trim() ? sucheWidgets(suche, WIDGET_TYPES) : []), [suche]);

  // Beim Öffnen: Suchfeld scharf und leer. Ein stehengebliebener Suchbegriff von
  // gestern wäre beim nächsten Öffnen eine leere Liste ohne erkennbaren Grund.
  useEffect(() => {
    if (!offen) return;
    setSuche('');
    setAktiv(null);
    const t = setTimeout(() => sucheRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [offen]);

  // Escape schließt. Am document, nicht am Panel: Der Fokus liegt im Suchfeld,
  // und ein Klick auf eine Kachel nimmt ihn ganz weg.
  useEffect(() => {
    if (!offen) return;
    const auf = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', auf);
    return () => document.removeEventListener('keydown', auf);
  }, [offen, onClose]);

  // Welche Kategorie steht gerade oben? Die Sprungleiste soll mitwandern, wenn
  // man von Hand scrollt — sonst leuchtet dort dauerhaft der zuletzt geklickte
  // Eintrag, während man längst woanders ist.
  useEffect(() => {
    if (!offen || suche.trim()) return;
    const wurzel = scrollRef.current;
    if (!wurzel) return;
    const io = new IntersectionObserver(
      (eintraege) => {
        const oben = eintraege
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (oben) setAktiv(oben.target.getAttribute('data-kat'));
      },
      // Nur das obere Drittel zählt als „aktuell".
      { root: wurzel, rootMargin: '0px 0px -66% 0px' },
    );
    for (const el of wurzel.querySelectorAll('[data-kat]')) io.observe(el);
    return () => io.disconnect();
  }, [offen, suche]);

  if (!offen) return null;

  const springeZu = (id: string) => {
    setAktiv(id);
    scrollRef.current?.querySelector(`[data-kat="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const q = suche.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm md:p-8"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-[1500px] flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-panel shadow-2xl"
        // Klicks im Panel dürfen nicht bis zum Hintergrund durchfallen, sonst
        // schließt sich das Fenster beim Tippen ins Suchfeld.
        onClick={(e) => e.stopPropagation()}
      >
        {/* Kopf: Titel, Suche, Schließen */}
        <div className="flex flex-none items-center gap-3 border-b border-studio-border px-4 py-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-studio-gold">Widget hinzufügen</h2>
          <div className="relative ml-auto w-full max-w-md">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-studio-muted" />
            <input
              ref={sucheRef}
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder={'Suchen — auch „geschenk", „spiel", „uhr" …'}
              className="bx-input w-full pl-8 text-xs"
            />
          </div>
          <button
            onClick={onClose}
            className="flex-none rounded-md p-1.5 text-studio-muted transition-colors hover:bg-studio-raised hover:text-studio-text"
            title="Schließen (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sprungleiste */}
          <nav className="hidden w-44 flex-none flex-col gap-0.5 overflow-y-auto border-r border-studio-border p-2 sm:flex">
            {gruppen.map((g) => {
              const Icon = icons[g.id];
              const on = !q && aktiv === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => springeZu(g.id)}
                  disabled={!!q}
                  className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-bold transition-colors disabled:opacity-40 ${
                    on ? 'bg-studio-accent/15 text-studio-accent' : 'text-studio-muted hover:bg-studio-raised hover:text-studio-text'
                  }`}
                >
                  {Icon ? <Icon size={13} /> : null}
                  <span className="flex-1 truncate">{g.label}</span>
                  <span className="font-mono text-[9px] font-normal opacity-60">{g.items.length}</span>
                </button>
              );
            })}
            <div className="mt-auto px-2 pt-3 text-[10px] leading-snug text-studio-muted">
              {WIDGET_TYPES.length} Widgets insgesamt.
              <br />
              Klick legt es an.
            </div>
          </nav>

          {/* Inhalt. data-palette-scroll: Die Vorschau-Kacheln laden ihr Widget
              erst, wenn sie in DIESEM Bereich sichtbar werden. */}
          <div ref={scrollRef} data-palette-scroll className="min-w-0 flex-1 overflow-y-auto p-4">
            {q ? (
              treffer.length === 0 ? (
                <div className="py-16 text-center text-sm text-studio-muted">
                  Nichts gefunden für „{q}“.
                  <div className="mt-1 text-[11px]">Die Suche kennt auch Umschreibungen — probier „geschenk", „uhr", „spiel" oder „chat".</div>
                </div>
              ) : (
                <>
                  <div className="mb-2 px-1 text-[10px] uppercase tracking-[0.2em] text-studio-muted">
                    {treffer.length} {treffer.length === 1 ? 'Treffer' : 'Treffer'} für „{q}“
                  </div>
                  <Raster>{treffer.map((w) => renderKarte(w))}</Raster>
                </>
              )
            ) : (
              <div className="flex flex-col gap-6">
                {gruppen.map((g) => (
                  <section key={g.id} data-kat={g.id}>
                    <h3 className="mb-2 flex items-baseline gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-studio-gold">
                      {g.label}
                      <span className="font-mono text-[9px] tracking-normal text-studio-muted">{g.items.length}</span>
                    </h3>
                    <Raster>{g.items.map((w) => renderKarte(w))}</Raster>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Vier bis fünf Kacheln je Reihe, je nach Fensterbreite. */
function Raster({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">{children}</div>;
}
