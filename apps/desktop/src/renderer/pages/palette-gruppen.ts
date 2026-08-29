// palette-gruppen.ts — Widgets nach Kategorie gruppieren, für die AUFGEKLAPPTE
// Palette. DOM-frei, damit die Einteilung prüfbar ist.
//
// Warum es das gibt: In der schmalen Spalte ist immer nur EINE Kategorie
// sichtbar (Tab-Chips). Wer nicht weiß, in welchem Tab ein Widget liegt, muss
// raten — und wer den Namen nicht kennt, kann auch nicht suchen. Aufgeklappt
// stehen alle Kategorien untereinander, und genau dafür braucht es diese
// Einteilung an EINER Stelle statt verstreut in der Ansicht.
import { passt, bewerte } from '../../shared/suche';

export const PALETTE_KATEGORIEN: { id: string; label: string }[] = [
  { id: 'beliebt', label: 'Beliebt' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'spiele', label: 'Spiele' },
  { id: 'gifts', label: 'Gifts & Ziele' },
  { id: 'listen', label: 'Listen & Chat' },
  { id: 'stats', label: 'Stats & Zähler' },
  { id: 'deko', label: 'Ambient & Deko' },
  { id: 'media', label: 'Media' },
];
// „Beliebt": die typischen Einsteiger-/Stream-Basics, in sinnvoller Reihenfolge.
// (heart-rain statt stream-boss: null Konfiguration, sofort sichtbarer Effekt.)
export const POPULAR_WIDGETS = [
  'gift-alert', 'follow-alert', 'stat-chips', 'goal-bar', 'leaderboard',
  'chat-box', 'gift-feed', 'gift-menu', 'top-gift', 'heart-rain', 'wheel',
];
// JEDES Widget MUSS hier stehen — fehlende fallen auf 'deko' zurück und sind
// dann im falschen Tab unauffindbar (genau so verschwand mal die halbe
// Spiele-Sammlung in „Ambient & Deko").
export const CATEGORY_OF: Record<string, string> = {
  'gift-alert': 'alerts', 'follow-alert': 'alerts', 'gift-fireworks': 'alerts', 'gift-cannon': 'alerts', 'action-screen': 'alerts',
  bingo: 'spiele', 'guess-number': 'spiele', wheel: 'spiele', giveaway: 'spiele', 'gift-battle': 'spiele', 'live-poll': 'spiele',
  // Der Automat FEHLTE hier und landete dadurch still in „Ambient & Deko" —
  // genau die Falle, vor der der Kommentar oben warnt. Ein Wächter-Test hält
  // die Liste jetzt vollständig.
  'slot-machine': 'spiele',
  'quiz-game': 'spiele', 'hangman-game': 'spiele', 'tic-tac-toe-game': 'spiele', 'connect-four-game': 'spiele', 'stream-boss': 'spiele',
  'gift-menu': 'gifts', 'gift-jar': 'gifts', 'gift-counter': 'gifts', 'goal-bar': 'gifts', 'top-gift': 'gifts', 'top-streak': 'gifts', 'hype-train': 'gifts', 'goal-countdown': 'gifts',
  'gift-feed': 'listen', 'chat-box': 'listen', 'activity-feed': 'listen', leaderboard: 'listen', 'points-board': 'listen', 'top-rotator': 'listen', 'sport-ticker': 'listen',
  // Die beiden Uhren standen unter „Gifts & Ziele" — wer eine Uhr sucht, sucht
  // sie aber nicht bei den Geschenken. Der Subathon-Timer folgt dem Countdown,
  // weil er in der Palette als dessen Variante daruntersteht: Anfuehrer und
  // Variante in verschiedenen Reitern waere schlicht verwirrend.
  'stat-chips': 'stats', counter: 'stats', countdown: 'stats', subathon: 'stats',
  // Konfetti bei erreichtem Meilenstein ist ein Auftritt, kein Ziel-Widget —
  // es zeigt keinen Stand an, es feiert einen Moment. Also zu den Alerts.
  'milestone-confetti': 'alerts',
  // Das Befehl-Karussell zeigt Geschenke — es gehört zu „Gifts & Ziele", nicht
  // zur Deko, und liegt dort als Variante unter dem Geschenk-Menü.
  'command-carousel': 'gifts',
  'heart-rain': 'deko', 'text-ticker': 'deko', 'social-rotator': 'deko', emojify: 'deko', 'text-label': 'deko',
  media: 'media', 'spotify-now-playing': 'media',
};

// Verwandten-Gruppen — ein Audit über alle 44 Widgets fand mehrere Gruppen, die
// sich für den Nutzer kaum unterscheiden (drei Bestenlisten, zwei Laufbänder,
// drei Ziel-Anzeigen …). Sie ERSATZLOS zusammenzulegen würde bestehende
// Overlays zerreißen, deshalb bleiben alle Typen erhalten: in der Palette zeigen
// wir nur den Anführer, die Varianten liegen einen Klick darunter. Effekt ist
// derselbe (kürzere Liste), Risiko null.
// Schlüssel = Anführer, Werte = Varianten (die dann NICHT einzeln gelistet werden).
export const RELATED_OF: Record<string, string[]> = {
  leaderboard: ['top-rotator', 'points-board'],
  'gift-feed': ['activity-feed'],
  // Der Geschenkzaehler lag hier als Variante der Goal-Bar und war dadurch in
  // der schmalen Palette gar nicht zu sehen — obwohl er etwas anderes tut
  // (EIN Geschenk gross im Bild, Ring statt Balken) und zu den meistgenutzten
  // Widgets ueberhaupt gehoert. Er steht jetzt fuer sich.
  'goal-bar': ['goal-countdown'],
  countdown: ['subathon'],
  'top-gift': ['top-streak'],
  'quiz-game': ['live-poll', 'guess-number'],
  'tic-tac-toe-game': ['connect-four-game'],
  // Das Geschenk-Menü kann alles, was das Befehl-Karussell kann, und mehr
  // (Rotations-Modus, Coin-Preis, Einträge automatisch aus den Triggern) —
  // deshalb führt es, das Karussell liegt als Variante darunter.
  'gift-menu': ['command-carousel'],
  'gift-fireworks': ['gift-cannon'],
  'heart-rain': ['emojify'],
};
// Alle Typen, die als Variante hinter einem Anführer liegen. Bei aktiver SUCHE
// werden sie trotzdem gefunden — sonst wäre ein Widget unauffindbar, dessen
// Namen der Nutzer kennt.
export const RELATED_MEMBERS = new Set(Object.values(RELATED_OF).flat());
// Spezialfälle, die kaum jemand braucht (Sport-Ticker: externer Anbieter, 13
// technische Optionen, thematisch neben der Spur). Nicht gelöscht — wer sie
// schon nutzt, behält sie —, aber am Ende der Kategorie eingeklappt.
export const RARELY_USED = new Set(['sport-ticker']);

/** Der Kategoriename eines Widgets — geht als Beiwerk in die Suche ein, damit
 *  „spiel", „geschenk" oder „stats" auch die Widgets finden, die das Wort nicht
 *  im Namen tragen. Eine eigene Schlagwort-Liste pro Widget waere dieselbe
 *  Information ein zweites Mal — und die zweite Kopie veraltet immer. */
export const KATEGORIE_LABEL: Record<string, string> = Object.fromEntries(
  PALETTE_KATEGORIEN.map((c) => [c.id, c.label]),
);
export const katLabel = (typ: string): string => KATEGORIE_LABEL[CATEGORY_OF[typ] ?? 'deko'] ?? '';

export interface PaletteWidget {
  type: string;
  label: string;
  desc?: string;
}

/**
 * Widgets zu einer Sucheingabe finden, nach Relevanz sortiert.
 *
 * Gesucht wird über Name, Beschreibung, den internen Typ (wer „gift-jar" aus
 * einer Anleitung kennt, findet damit das Coin-Glas) UND den Kategorienamen —
 * so findet „spiel" auch das Glücksmoment-Zeug, das das Wort nicht im Namen
 * trägt. Der Kategoriename zählt dabei als Beiwerk, nie so viel wie der Name.
 *
 * An EINER Stelle, weil beide Ansichten (schmale Leiste und Katalog) dieselbe
 * Suche brauchen — zwei Kopien wären zwei Suchen, die auseinanderlaufen.
 */
export function sucheWidgets<T extends PaletteWidget>(suche: string, widgets: T[]): T[] {
  const q = suche.trim();
  if (!q) return widgets;
  const punkte = (w: T) => bewerte(q, w.label, w.desc, w.type, katLabel(w.type));
  return widgets
    .filter((w) => passt(q, w.label, w.desc, w.type, katLabel(w.type)))
    .sort((a, b) => punkte(b) - punkte(a));
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

/**
 * Die Gruppen für die AUFGEKLAPPTE Palette („Alle zeigen").
 *
 * Bewusst hier und nicht in der Ansicht: Der springende Punkt dieser Ansicht
 * ist, dass NICHTS mehr hinter einem Knopf liegt — weder die Varianten noch die
 * Spezialfälle. Stünden die beiden leeren Mengen in der Ansicht, könnte ein
 * Wächter-Test sie nicht prüfen; er würde seine eigene Kopie der Regeln testen
 * und wäre für immer grün, egal was die Ansicht tut.
 */
export function alleGruppen<T extends PaletteWidget>(widgets: T[]): PaletteGruppe<T>[] {
  return gruppiereNachKategorie(widgets, {
    kategorieVon: CATEGORY_OF,
    kategorien: PALETTE_KATEGORIEN,
    beliebtId: 'beliebt',
    beliebt: POPULAR_WIDGETS,
    varianten: new Set<string>(),
    spezial: new Set<string>(),
    rueckfall: 'deko',
  });
}
