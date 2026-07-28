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

  if ((gesucht[0] ?? '').length < 4) return false;
  for (const t of texte) {
    if (!t) continue;
    const woerter = t
      .toLowerCase()
      .split(/[^a-zA-ZäöüßÄÖÜ0-9]+/)
      .flatMap(lesarten)
      .filter((w) => w.length >= 4);
    if (woerter.some((w) => gesucht.some((n) => lev(w, n) <= 2))) return true;
  }
  return false;
}
