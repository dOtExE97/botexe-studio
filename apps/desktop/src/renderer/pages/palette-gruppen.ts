// palette-gruppen.ts — Widgets nach Kategorie gruppieren, für die AUFGEKLAPPTE
// Palette. DOM-frei, damit die Einteilung prüfbar ist.
//
// Warum es das gibt: In der schmalen Spalte ist immer nur EINE Kategorie
// sichtbar (Tab-Chips). Wer nicht weiß, in welchem Tab ein Widget liegt, muss
// raten — und wer den Namen nicht kennt, kann auch nicht suchen. Aufgeklappt
// stehen alle Kategorien untereinander, und genau dafür braucht es diese
// Einteilung an EINER Stelle statt verstreut in der Ansicht.

export interface PaletteWidget {
  type: string;
  label: string;
}

export interface PaletteGruppe<T extends PaletteWidget> {
  id: string;
  label: string;
  items: T[];
}

export interface GruppenRegeln {
  /** widgetType → Kategorie-id. Fehlt einer, fällt er auf `rueckfall`. */
  kategorieVon: Record<string, string>;
  /** Kategorien in Anzeige-Reihenfolge. */
  kategorien: { id: string; label: string }[];
  /** id der kuratierten Quer-Kategorie („Beliebt") — sie ist die einzige mit
   *  EIGENER Reihenfolge statt der Katalog-Reihenfolge. */
  beliebtId: string;
  /** Die kuratierte Auswahl, in ihrer eigenen Reihenfolge. */
  beliebt: string[];
  /** Typen, die als Variante hinter einem Anführer liegen. */
  varianten: Set<string>;
  /** Selten gebrauchte Spezialfälle. */
  spezial: Set<string>;
  /** Kategorie für Widgets ohne Eintrag. */
  rueckfall: string;
}

/**
 * Alle Kategorien mit ihren Widgets, in Anzeige-Reihenfolge.
 *
 * Varianten und Spezialfälle bleiben draußen — sie gehören unter ihren
 * Anführer bzw. ans Ende und würden die Übersicht sonst wieder aufblähen.
 * Leere Kategorien fallen weg: eine Überschrift ohne Inhalt ist nur eine
 * weitere Zeile zum Überspringen.
 */
export function gruppiereNachKategorie<T extends PaletteWidget>(
  widgets: T[],
  regeln: GruppenRegeln,
): PaletteGruppe<T>[] {
  const raus: PaletteGruppe<T>[] = [];
  for (const kat of regeln.kategorien) {
    const items = kat.id === regeln.beliebtId
      ? regeln.beliebt
          .map((t) => widgets.find((w) => w.type === t))
          .filter((w): w is T => !!w)
      : widgets.filter(
          (w) =>
            (regeln.kategorieVon[w.type] ?? regeln.rueckfall) === kat.id
            && !regeln.varianten.has(w.type)
            && !regeln.spezial.has(w.type),
        );
    if (items.length > 0) raus.push({ id: kat.id, label: kat.label, items });
  }
  return raus;
}
