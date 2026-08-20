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
  const gesucht = lesarten(suche);
  const n = gesucht[0] ?? '';
  if (!n) return 1; // leere Suche: alle gleichwertig, Reihenfolge bleibt wie sie war

  const punkteFuer = (text: string | undefined, faktor: number): number => {
    if (!text) return 0;
    for (const ziel of lesarten(text)) {
      for (const g of gesucht) {
        if (!g) continue;
        if (ziel === g) return 100 * faktor;          // genau das
        if (ziel.startsWith(g)) return 80 * faktor;   // fängt damit an
        // Wortanfang mitten im Text („Gift-Alert" bei Suche „alert") zählt mehr
        // als ein Treffer irgendwo im Wort („Top Gifter" bei Suche „gift").
        if (wortAnfang(text, g)) return 60 * faktor;
        if (ziel.includes(g)) return 40 * faktor;
      }
    }
    return 0;
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
  const gesucht = lesarten(suche);
  if (!gesucht[0]) return true;

  for (const t of texte) {
    if (!t) continue;
    for (const ziel of lesarten(t)) {
      if (gesucht.some((n) => ziel.includes(n))) return true;
    }
  }

  const laenge = (gesucht[0] ?? '').length;
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
    if (woerter.some((w) => gesucht.some((n) => lev(w, n) <= erlaubt))) return true;
  }
  return false;
}
