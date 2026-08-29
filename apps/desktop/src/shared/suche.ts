// suche.ts — tolerante Textsuche für Auswahllisten (Geschenke, Widgets …).
//
// Lag vorher NUR im Geschenk-Auswähler. Die Widget-Palette suchte daneben mit
// stumpfem `includes`, weshalb „Glucksrad" (ohne Umlaut) oder „gift jar" nichts
// fand. Beide nutzen jetzt dieselbe Logik.

/** Umlaut-/Akzentpunkte entfernen: ü→u, é→e. */
function ohneAkzente(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Auf einen vergleichbaren Kern reduzieren: klein, nur Buchstaben und Ziffern.
 *  Umlaute werden zum Grundbuchstaben (ü→u), damit „Glucksrad" und „Glücksrad"
 *  denselben Kern ergeben. */
export function normText(s: string): string {
  return ohneAkzente(String(s ?? '').toLowerCase())
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/** Zweite Lesart: Umlaute deutsch ausgeschrieben (ü→ue).
 *
 *  Warum beide: Wer „Gluck" tippt, meint „Glück" — da braucht es ü→u. Wer
 *  „Glueck" tippt, braucht ü→ue. Nur eine Lesart zu nehmen bricht jeweils die
 *  andere Hälfte der Eingaben, deshalb wird immer in beiden verglichen. */
function normAusgeschrieben(s: string): string {
  return ohneAkzente(
    String(s ?? '')
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss'),
  ).replace(/[^a-z0-9]/g, '');
}

/** Beide Lesarten eines Textes (identische entfallen). */
function lesarten(s: string): string[] {
  const a = normText(s);
  const b = normAusgeschrieben(s);
  return a === b ? [a] : [a, b];
}

/**
 * Wörter, die dasselbe meinen — vor allem deutsch ↔ englisch.
 *
 * WARUM ES DAS BRAUCHT: Die Widget-Namen sind gemischt. „Gift-Alert",
 * „Gift-Feed" und „Coin-Glas" stehen neben „Geschenk-Menü" und
 * „Geschenkzähler". Wer „geschenk" tippt, fand deshalb genau vier von elf
 * Geschenk-Widgets — der Rest heißt englisch. Genau so ging eine Zuschauerin
 * leer aus, die „geschenk" gesucht hat.
 *
 * Die Gruppen sind bewusst klein gehalten: Jedes zusätzliche Wort holt auch
 * Fehltreffer herein. Aufgenommen wird nur, was ein Streamer wirklich statt
 * des Namens eintippen würde.
 */
const SYNONYM_GRUPPEN: string[][] = [
  ['geschenk', 'geschenke', 'gift', 'gifts', 'spende', 'spenden', 'donation'],
  ['like', 'likes', 'herz', 'herzen', 'heart', 'hearts'],
  ['zuschauer', 'viewer', 'viewers', 'gast', 'gaeste', 'publikum'],
  ['follower', 'follow', 'abonnent', 'abo', 'neuer'],
  ['punkte', 'points', 'punkt'],
  ['bestenliste', 'leaderboard', 'rangliste', 'ranking'],
  ['chat', 'kommentar', 'kommentare', 'nachricht', 'nachrichten'],
  ['uhr', 'timer', 'countdown', 'zeit', 'stoppuhr'],
  ['musik', 'music', 'song', 'lied', 'spotify'],
  ['alarm', 'alert', 'einblendung', 'benachrichtigung', 'meldung'],
  ['spiel', 'spiele', 'game', 'games', 'minispiel'],
  ['rad', 'wheel', 'gluecksrad', 'drehen'],
  ['zaehler', 'counter', 'zaehlen'],
  ['ziel', 'goal', 'target'],
  ['coin', 'coins', 'muenze', 'muenzen', 'diamanten'],
  ['bild', 'foto', 'image', 'grafik'],
  ['video', 'clip', 'film'],
  ['text', 'schrift', 'label', 'beschriftung'],
  ['ton', 'sound', 'audio', 'gerausch'],
  ['emoji', 'emojis', 'smiley', 'smileys'],
  ['verlosung', 'giveaway', 'gewinnspiel', 'ziehung'],
  ['umfrage', 'poll', 'abstimmung', 'voting'],
];

/** kern → gleichbedeutende Kerne (ohne den Kern selbst). Einmal aufgebaut. */
const SYNONYME: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const gruppe of SYNONYM_GRUPPEN) {
    const kerne = gruppe.flatMap(lesarten);
    for (const k of kerne) {
      const andere = kerne.filter((x) => x !== k);
      m.set(k, [...(m.get(k) ?? []), ...andere]);
    }
  }
  return m;
})();

/** Ein Suchbegriff mit Gewicht. Sinnverwandte zählen etwas weniger, damit der
 *  wörtliche Treffer immer vorne steht: Wer „gift" tippt, will „Gift-Alert"
 *  oben sehen und nicht „Geschenk-Menü". */
interface Suchkern { kern: string; gewicht: number }

/** Die Lesarten der Eingabe plus ihre sinnverwandten Wörter.
 *
 *  Erweitert wird nur, wenn die GANZE Eingabe ein bekanntes Wort ist. „gift"
 *  holt „geschenk" dazu; „gift-alert" bleibt wörtlich — sonst zöge jede
 *  längere Eingabe die halbe Gruppe mit und die Trefferliste würde beliebig. */
/** Letzte Eingabe und ihr Ergebnis.
 *
 *  WARUM: `passt()` und `bewerte()` werden je EINTRAG aufgerufen — beim
 *  Geschenke-Auswähler 5726-mal pro Tastendruck, und `bewerte()` gleich noch
 *  einmal beim Sortieren. Die Eingabe ist dabei immer dieselbe. Ohne diesen
 *  Merker zerlegt die Suche denselben Begriff über zehntausendmal je Anschlag;
 *  gemessen kostete allein das rund ein Drittel der Laufzeit. Ein einziger
 *  Platz reicht — es gibt nie zwei Suchen gleichzeitig. */
let letzteEingabe: string | null = null;
let letzteKerne: Suchkern[] = [];

function suchkerne(suche: string): Suchkern[] {
  if (suche === letzteEingabe) return letzteKerne;
  const raus: Suchkern[] = [];
  const gesehen = new Set<string>();
  const zufuegen = (kern: string, gewicht: number) => {
    if (!kern || gesehen.has(kern)) return;
    gesehen.add(kern);
    raus.push({ kern, gewicht });
  };
  for (const l of lesarten(suche)) zufuegen(l, 1);
  for (const l of lesarten(suche)) for (const s of SYNONYME.get(l) ?? []) zufuegen(s, 0.85);
  letzteEingabe = suche;
  letzteKerne = raus;
  return raus;
}

/** Levenshtein-Distanz, früh abgebrochen — für Tippfehler-Toleranz. */
export function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) {
      cur.push(Math.min(
        (cur[j] ?? 0) + 1,
        (prev[j + 1] ?? 0) + 1,
        (prev[j] ?? 0) + (a[i] === b[j] ? 0 : 1),
      ));
    }
    prev = cur;
  }
  return prev[b.length] ?? 99;
}

/**
 * Wie gut passt der Suchbegriff? 0 = gar nicht, höher = besser.
 *
 * WARUM ES DAS BRAUCHT: `passt()` beantwortet nur „ja oder nein". Ohne
 * Reihenfolge steht das Gesuchte irgendwo zwischen den Zufallstreffern —
 * gemessen am echten Katalog (5034 Geschenke) landete „rose" bei 49 Treffern
 * mit der ROSE auf Platz 22, und „löwe" bei 126 Treffern mit dem LÖWEN auf
 * Platz 125. Für den Streamer sieht das aus, als fände die Suche nichts.
 *
 * Der erste Parameter sind die NAMEN und zählen am meisten. Mehrere sind
 * erlaubt und gleichwertig — der deutsche Geschenkname ist genauso ein Name wie
 * der englische. Ohne das landete „Lion" bei der Suche nach „löwe" auf Platz 16
 * hinter lauter „Love"-Geschenken, weil sein deutscher Name nur als Beiwerk
 * zählte.
 *
 * Alles Weitere (Beschreibung, interner Typ) ist Beiwerk: Ein Widget, das
 * „Geschenk" nur in der Beschreibung trägt, darf nie vor dem Geschenk-Menü
 * stehen.
 */
export function bewerte(
  suche: string,
  namen: string | undefined | (string | undefined)[],
  ...weitere: (string | undefined)[]
): number {
  const gesucht = suchkerne(suche);
  if (!gesucht[0]?.kern) return 1; // leere Suche: alle gleichwertig, Reihenfolge bleibt wie sie war

  const punkteFuer = (text: string | undefined, faktor: number): number => {
    if (!text) return 0;
    // Bestwert statt „erster Treffer": seit es sinnverwandte Begriffe gibt,
    // kommen die Kerne mit unterschiedlichem Gewicht. Ein früher Synonym-
    // Treffer darf einen späteren wörtlichen nicht verdecken.
    let beste = 0;
    for (const ziel of lesarten(text)) {
      for (const { kern: g, gewicht } of gesucht) {
        if (!g) continue;
        const roh = ziel === g ? 100                          // genau das
          : ziel.startsWith(g) ? 80                           // fängt damit an
          // Wortanfang mitten im Text („Gift-Alert" bei Suche „alert") zählt
          // mehr als ein Treffer irgendwo im Wort („Top Gifter" bei „gift").
          : wortAnfang(text, g) ? 60
          : ziel.includes(g) ? 40
          : 0;
        if (roh > 0) beste = Math.max(beste, roh * faktor * gewicht);
      }
    }
    return beste;
  };

  const nameListe = Array.isArray(namen) ? namen : [namen];
  const beste = Math.max(
    0,
    ...nameListe.map((t) => punkteFuer(t, 1)),
    ...weitere.map((t) => punkteFuer(t, 0.3)),
  );
  if (beste > 0) return beste;

  // Nichts gefunden? Dann zählt nur noch die Tippfehler-Toleranz — und die
  // landet bewusst ganz unten, damit „Pose" nie vor „Rose" steht.
  return passt(suche, ...nameListe, ...weitere) ? 1 : 0;
}

/** Beginnt ein Wort des Textes mit dem Suchbegriff? */
function wortAnfang(text: string, gesucht: string): boolean {
  return text
    .toLowerCase()
    .split(/[^a-zA-ZäöüßÄÖÜ0-9]+/)
    .flatMap(lesarten)
    .some((w) => w.startsWith(gesucht));
}

/**
 * Passt der Suchbegriff auf einen der Texte?
 *
 * Reihenfolge: erst Teilstring (schnell und meistens gemeint), dann
 * Tippfehler-Toleranz auf einzelnen Wörtern. Kurze Eingaben (< 4 Zeichen)
 * bekommen KEINE Tippfehler-Toleranz — sonst passt „rad" auf halb alles.
 */
export function passt(suche: string, ...texte: (string | undefined)[]): boolean {
  const gesucht = suchkerne(suche).map((k) => k.kern);
  if (!gesucht[0]) return true;

  for (const t of texte) {
    if (!t) continue;
    for (const ziel of lesarten(t)) {
      if (gesucht.some((n) => ziel.includes(n))) return true;
    }
  }

  // Tippfehler-Toleranz nur auf der WÖRTLICHEN Eingabe. Sinnverwandte Wörter
  // dürfen keine Tippfehler mitbringen — sonst holt „geschenk" über „gift"
  // auch noch alles herein, was auf zwei Buchstaben an „gift" herankommt.
  const woertlich = lesarten(suche);
  const laenge = (woertlich[0] ?? '').length;
  if (laenge < 4) return false;

  // Wie viele Tippfehler sind erlaubt? An die Wortlänge gekoppelt, sonst wird
  // die Suche bei kurzen Wörtern absurd: „rose" und „lowe" (= Löwe) trennen
  // nur zwei Buchstaben — bei vier Zeichen die halbe Länge. Genau so fand eine
  // Suche nach „Rose" das Geschenk „Lion".
  const erlaubt = laenge >= 7 ? 2 : 1;

  for (const t of texte) {
    if (!t) continue;
    const woerter = t
      .toLowerCase()
      .split(/[^a-zA-ZäöüßÄÖÜ0-9]+/)
      .flatMap(lesarten)
      .filter((w) => w.length >= 4);
    if (woerter.some((w) => woertlich.some((n) => lev(w, n) <= erlaubt))) return true;
  }
  return false;
}
