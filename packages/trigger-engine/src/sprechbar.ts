// sprechbar.ts — Text so aufbereiten, dass eine Sprachausgabe ihn normal liest.
//
// DAS PROBLEM: Viele Zuschauer schreiben ihren Namen in „Schmuckschriften" —
// 𝓐𝓵𝓮𝔁, 𝔸𝕝𝕖𝕩, ᴀʟᴇx, Ａｌｅｘ, 🅐🅛🅔🅧. Das sind keine Schriftarten, sondern
// eigene Zeichen im Unicode-Vorrat. Für den Menschen sieht es aus wie „Alex",
// für die Sprachausgabe ist es etwas völlig anderes: Sie buchstabiert, spricht
// Zeichennamen aus oder überspringt alles wortlos. Genau das hört man im Live
// als „merkwürdig vorgelesene Namen".
//
// DIE LÖSUNG in zwei Schritten:
//  1. `normalize('NFKC')` — Unicode kennt für die meisten dieser Zeichen eine
//     „Kompatibilitäts-Entsprechung", also das normale Zeichen dahinter. Ein
//     einziger Aufruf erledigt Fett, Kursiv, Schreibschrift, Fraktur,
//     Doppelstrich, Breitschrift, hoch-/tiefgestellt und eingekreiste Ziffern.
//     WICHTIG: NFKC, nicht NFKD — NFKD zerlegt „ä" in a + Pünktchen, und wer
//     danach die Pünktchen entfernt (der übliche Reflex gegen Zalgo-Text),
//     macht aus jedem deutschen Umlaut einen nackten Vokal.
//  2. Eine kleine Tabelle für das, was Unicode dort NICHT hinterlegt hat —
//     Kapitälchen (ᴀ ʙ ᴄ) und die eingekreisten/umrahmten Buchstaben.
//
// Aufgeräumt wird außerdem, was eine Stimme nicht sprechen kann: unsichtbare
// Steuerzeichen und übereinandergestapelte Akzente („Zalgo").
//
// Was hier bewusst NICHT passiert: kyrillische oder griechische Buchstaben, die
// lateinischen ähneln (А, Ε, Ο), bleiben stehen. Sie sehen nur zufällig gleich
// aus, und wer wirklich kyrillisch heißt, soll auch so vorgelesen werden.

/** Zeichen, für die Unicode keine Entsprechung kennt — von Hand zugeordnet. */
const TABELLE: Record<string, string> = {
  // Kapitälchen und Kleinbuchstaben-Varianten (Phonetik-Block)
  ᴀ: 'A', ʙ: 'B', ᴄ: 'C', ᴅ: 'D', ᴇ: 'E', ꜰ: 'F', ɢ: 'G', ʜ: 'H', ɪ: 'I',
  ᴊ: 'J', ᴋ: 'K', ʟ: 'L', ᴍ: 'M', ɴ: 'N', ᴏ: 'O', ᴘ: 'P', ǫ: 'Q', ʀ: 'R',
  ѕ: 'S', ᴛ: 'T', ᴜ: 'U', ᴠ: 'V', ᴡ: 'W', ʏ: 'Y', ᴢ: 'Z',
  // Umrahmte Großbuchstaben (🅰-Reihe). NFKC lässt sie unangetastet.
  '🅰': 'A', '🅱': 'B', '🅲': 'C', '🅳': 'D', '🅴': 'E', '🅵': 'F', '🅶': 'G',
  '🅷': 'H', '🅸': 'I', '🅹': 'J', '🅺': 'K', '🅻': 'L', '🅼': 'M', '🅽': 'N',
  '🅾': 'O', '🅿': 'P', '🆀': 'Q', '🆁': 'R', '🆂': 'S', '🆃': 'T', '🆄': 'U',
  '🆅': 'V', '🆆': 'W', '🆇': 'X', '🆈': 'Y', '🆉': 'Z',
  // Ausgefüllte Kreise (🅐-Reihe)
  '🅐': 'A', '🅑': 'B', '🅒': 'C', '🅓': 'D', '🅔': 'E', '🅕': 'F', '🅖': 'G',
  '🅗': 'H', '🅘': 'I', '🅙': 'J', '🅚': 'K', '🅛': 'L', '🅜': 'M', '🅝': 'N',
  '🅞': 'O', '🅟': 'P', '🅠': 'Q', '🅡': 'R', '🅢': 'S', '🅣': 'T', '🅤': 'U',
  '🅥': 'V', '🅦': 'W', '🅧': 'X', '🅨': 'Y', '🅩': 'Z',
};

/** Unsichtbares Beiwerk: weiches Trennzeichen, Nullbreiten-Leerzeichen,
 *  Schreibrichtungs-Marken, Wortverbinder, Byte-Reihenfolge-Marke.
 *
 *  WAS HIER BEWUSST FEHLT — an echten Live-Daten gelernt:
 *  • U+200D, der Verbinder. Er klebt Emojis zu EINEM zusammen. Eine
 *    Zuschauerin heißt „Miri1997🎮❤️🐈‍⬛"; ohne den Verbinder wird aus der
 *    schwarzen Katze eine Katze UND ein schwarzes Quadrat. Genauso hängen
 *    Familien-, Flaggen- und Berufs-Emojis daran.
 *  • U+FE0F, die Darstellungswahl. Sie entscheidet, ob ❤️ als Emoji oder als
 *    Schriftzeichen ❤ erscheint.
 *  • U+200C, der Nicht-Verbinder. In persischer und indischer Schrift ist er
 *    Teil der Rechtschreibung, kein Ballast.
 *  Diese drei sind unsichtbar, aber nicht bedeutungslos — und die Sprachausgabe
 *  wird durch sie nicht schlechter.
 *
 *  ALS ESCAPE-FOLGEN, nicht als Zeichen: Die Zeichen selbst sind unsichtbar,
 *  im Quelltext steht dann scheinbar nichts. Der Uebersetzer stolperte prompt
 *  ueber einen Schreibrichtungs-Marker mitten im Ausdruck und meldete eine
 *  nicht geschlossene regulaere Ausdrucksfolge. */
const UNSICHTBAR = /[\u00AD\u200B\u200E\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/gu;

/** Akzente ohne Grundzeichen — stehen am Anfang eines Zalgo-Textes. */
const AKZENTE_AM_ANFANG = /^\p{Mn}+/u;

/**
 * Text in eine Form bringen, die eine Sprachausgabe normal vorliest.
 *
 * Deutsche Umlaute, Akzente und echte fremdsprachige Schriften bleiben
 * unangetastet — es geht nur um Schmuckschriften und unsichtbaren Ballast.
 */
export function sprechbar(text: string): string {
  const roh = String(text ?? '');
  if (!roh) return '';

  let t = roh.normalize('NFKC').replace(UNSICHTBAR, '');

  // Handtabelle für das, was NFKC nicht kennt. Über die Zeichen laufen statt
  // über eine Ersetzung mit Zeichenklasse: die Schlüssel sind teils Zeichen
  // außerhalb der Grundebene und wären in einer Klasse nicht sauber zu fassen.
  t = [...t].map((z) => TABELLE[z] ?? z).join('');

  // Zalgo: mehr als zwei gestapelte Akzente auf EINEM Zeichen sind keine
  // Sprache mehr. Ein bis zwei bleiben — sonst fielen echte Schriften
  // (Vietnamesisch, Hebräisch mit Punktierung) mit hinein.
  t = t.replace(/(\P{Mn})(\p{Mn}{3,})/gu, (_, grund: string) => grund);
  // Akzente ganz am Anfang haben kein Grundzeichen, auf dem sie sitzen könnten.
  t = t.replace(AKZENTE_AM_ANFANG, '');

  return t.replace(/\s+/g, ' ').trim();
}

/** Hat der Text nach dem Aufbereiten überhaupt etwas Sprechbares? */
export function istSprechbar(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(sprechbar(text));
}

/**
 * Ein Zuschauername, wie ihn die Stimme sagen soll.
 *
 * Bleibt nach dem Aufbereiten nichts Sprechbares übrig — der Name besteht nur
 * aus Emojis oder Zierzeichen —, kommt der Ersatz zum Zug. Besser ein
 * schlichtes „Jemand" als eine Stimme, die Zeichennamen vorliest oder mitten im
 * Satz verstummt.
 */
export function sprechbarerName(name: string | undefined, ersatz = 'Jemand'): string {
  const sauber = sprechbar(name ?? '');
  return /[\p{L}\p{N}]/u.test(sauber) ? sauber : ersatz;
}
