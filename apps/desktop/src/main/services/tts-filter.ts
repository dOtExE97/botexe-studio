// tts-filter.ts — wer wird beim Chat-Vorlesen berücksichtigt?
// Pure Logik (testbar): Gruppen-Filter (Teamherz/Mod/Follower/VIP) +
// optionaler Prefix-Modus („nur Nachrichten, die mit . beginnen").
import type { StudioEvent } from '@botexe/trigger-engine';

/** Ankreuzbare Gruppen fürs Vorlesen (Multi-Select, ODER-verknüpft).
 *  App-VIPs (von dir markiert) werden immer vorgelesen.
 *
 *  `subs` und `teamherz` sind ZWEI VERSCHIEDENE DINGE und deshalb zwei
 *  Häkchen — sie wurden lange in eins geworfen:
 *    subs      = SUPERFAN, das bezahlte Abo (`isSub`). Kein Stufensystem.
 *    teamherz  = TEAMHERZ, der gratis Fanclub. Hat eine STUFE (`teamLevel`),
 *                auf die sich die Mindeststufe bezieht.
 *  Solange die Stufe unter „Superfans" hing, musste man BEIDES sein, damit
 *  überhaupt etwas vorgelesen wurde — der Filter griff praktisch nie. */
export type ReadGroup = 'all' | 'followers' | 'subs' | 'teamherz' | 'mods' | 'vips';

/** Legacy: alte Einzel-Stufe (vor dem Multi-Select). Nur noch für die Migration. */
export type ReadWho = ReadGroup;

/** Alte hierarchische Einzel-Einstellung → neues Gruppen-Array, so dass das
 *  bisherige Verhalten erhalten bleibt (z.B. „followers" schloss subs+mods ein). */
export function migrateReadWho(who: string): ReadGroup[] {
  switch (who) {
    case 'all': return ['all'];
    case 'followers': return ['followers', 'subs', 'mods'];
    case 'subs': return ['subs', 'mods'];
    case 'mods': return ['mods'];
    case 'vips': return ['vips'];
    default: return ['all'];
  }
}

function groupMatches(group: ReadGroup, u: StudioEvent['user'], teamMinLevel = 0): boolean {
  switch (group) {
    case 'all': return true;
    case 'mods': return !!u?.isMod;
    // SUPERFAN = das bezahlte Abo. Keine Stufe, die gibt es dort nicht.
    case 'subs': return !!u?.isSub;
    // TEAMHERZ = der gratis Fanclub, MIT Stufe.
    case 'teamherz': {
      const stufe = u?.teamLevel ?? 0;
      // Ohne Stufe kein Teamherz: TikTok schickt sie an jedem Zuschauer mit,
      // der einen hat. Kein Wert heißt hier wirklich „keiner".
      if (stufe <= 0) return false;
      return teamMinLevel <= 0 || stufe >= teamMinLevel;
    }
    case 'followers': return !!u?.isFollower;
    case 'vips': return false; // nur App-VIPs (separat behandelt)
  }
}

export interface ReadDecision {
  read: boolean;
  /** Text fürs Vorlesen (Prefix bereits entfernt). */
  text: string;
  /** Wenn nicht vorgelesen: warum? 'prefix' = Start-Zeichen fehlt (gilt auch für
   *  Mods/Follower!), 'group' = in keiner gewählten Gruppe. Für klares Logging. */
  reason?: 'prefix' | 'group';
}

/** Enthält der Text ein gesperrtes Wort? (case-insensitiv, Teilwort-Match). */
export function containsBlockedWord(text: string, blockedWords: string[]): boolean {
  if (!text || !blockedWords?.length) return false;
  const lower = text.toLowerCase();
  return blockedWords.some((w) => {
    const t = w.trim().toLowerCase();
    return t.length > 0 && lower.includes(t);
  });
}

/**
 * Ist die Nachricht bloß eine nackte Zahl?
 *
 * Läuft ein Zahlenraten-Spiel, besteht der Chat minutenlang aus „42", „7",
 * „100" — und die Sprachausgabe liest jede einzeln vor. Das ist kein Fehler
 * im Filter, sondern schlicht keine sinnvolle Ansage.
 *
 * BEWUSST ENG gefasst: nur Ziffern, dazwischen höchstens Leerzeichen, Punkt
 * oder Komma. „42" und „1.000" fliegen raus, „42!" und „ich sage 42" bleiben —
 * wer einen Satz schreibt, will vorgelesen werden.
 */
export function istNurEineZahl(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /^\d[\d\s.,]*$/.test(t);
}

/**
 * Greift die eingestellte Teamherz-Mindeststufe überhaupt?
 *
 * NEIN, sobald „Alle Zuschauer" mit angekreuzt ist: Die Gruppen sind
 * ODER-verknüpft, und „Alle" trifft immer zuerst zu. Die Stufe steht dann in
 * der Oberfläche, tut aber nichts — eine Einstellung, die zu wirken scheint
 * und es nicht tut. Genau so gemeldet: „TTS nur mit Teamherz Stufe 3, es wird
 * trotzdem alles vorgelesen."
 */
export function stufeWirktNicht(groups: ReadGroup[], teamMinLevel: number): boolean {
  if (teamMinLevel <= 0) return false;
  // „Alle" schlägt jede Stufe — die Gruppen sind ODER-verknüpft.
  if (groups.includes('all')) return true;
  // Und ohne die Gruppe „Teamherz" bezieht sich die Stufe auf gar nichts.
  return !groups.includes('teamherz');
}

/**
 * Ist bei „Wer wird vorgelesen" gar nichts angekreuzt?
 *
 * Dann ist Schluss: Ohne Gruppe trifft nichts zu, und es wird KEINE
 * Chat-Nachricht mehr vorgelesen — nur die ★VIPs, die man im Zuschauer-Tab
 * selbst markiert hat, kommen noch durch.
 *
 * Das ist die andere Hälfte derselben Falle: Nimmt man das Häkchen bei „Alle
 * Zuschauer" weg (weil die Teamherz-Stufe sonst nicht greift) und kreuzt nichts
 * anderes an, wird es schlagartig komplett still. Begründet wurde das bisher
 * nur auf der Debug-Ebene — also für den Nutzer gar nicht. Man setzt das
 * Häkchen wieder und ist genauso schlau wie vorher.
 */
export function niemandWirdVorgelesen(groups: ReadGroup[]): boolean {
  return groups.length === 0;
}

export function shouldReadChat(
  event: StudioEvent,
  groups: ReadGroup[],
  prefix: string,
  isAppVip: boolean,
  /** Mindest-Teamherz-Stufe für die Gruppe „Teamherz" (0 = egal). */
  teamMinLevel = 0,
): ReadDecision {
  const raw = event.text ?? '';

  // Prefix-Modus: nur Nachrichten, die mit dem Zeichen beginnen (wird entfernt).
  let text = raw;
  if (prefix) {
    if (!raw.startsWith(prefix)) return { read: false, text: raw, reason: 'prefix' };
    text = raw.slice(prefix.length).trim();
    if (!text) return { read: false, text: '', reason: 'prefix' };
  }

  // App-VIPs (von dir markiert) immer; sonst: in mind. einer angekreuzten Gruppe.
  const u = event.user;
  const groupOk = isAppVip || groups.some((g) => groupMatches(g, u, teamMinLevel));

  return groupOk ? { read: true, text } : { read: false, text, reason: 'group' };
}

// ── Emojis ─────────────────────────────────────────────────────────────────
// Vorlese-Stimmen sprechen Emojis entweder aus („Sonne mit Gesicht, rotes
// Herz, Funken") oder verschlucken sie. Beides stört: Aus „☀️Sarüüüh❤️✨☀️"
// wird eine Litanei, bevor überhaupt der Name kommt.
//
// Zwei getrennte Schalter, weil es zwei getrennte Ärgernisse sind: Emojis IM
// TEXT sind oft Teil der Aussage („😂😂"), Emojis IM NAMEN nie.

/**
 * Alle Emojis und ihr Beiwerk entfernen.
 *
 * Nicht nur das Bildzeichen selbst: Hautfarben-Modifikatoren, Variantenwähler
 * und der Zero-Width-Joiner (der zusammengesetzte Emojis wie 👨‍👩‍👧 verklebt)
 * müssen mit weg. Bleiben sie stehen, hat man unsichtbare Zeichen im Text —
 * und manche Stimmen stolpern genau darüber.
 *
 * Ziffern und Rautezeichen bleiben ausdrücklich erhalten: Sie sind zwar Teil
 * mancher Emoji-Folgen (0️⃣, #️⃣), aber viel häufiger einfach Text.
 */
export function entferneEmoji(text: string): string {
  return text
    // Das Bildzeichen selbst.
    .replace(/\p{Extended_Pictographic}/gu, '')
    // Flaggen: zwei Regionalzeichen, die zusammen ein Land ergeben.
    .replace(/\p{Regional_Indicator}/gu, '')
    // Das Beiwerk EINZELN, nicht als eine Zeichenklasse: Hautfarbe,
    // Variantenwähler, Kombi-Fuge (ZWJ), Umrahmung. In eine Klasse geworfen
    // sieht es aus, als ließe sich damit ein zusammengesetztes Emoji treffen —
    // kann es nicht, und der Linter beanstandet das zu Recht.
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
    .replace(/︎|️/g, '')
    .replace(/‍/g, '')
    .replace(/⃣/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Name ohne Emojis — aber niemals ein LEERER Name.
 *
 * Es gibt Zuschauer, deren Anzeigename nur aus Emojis besteht. Würde man den
 * blank putzen, sagte die Ansage „ sagt: hallo" — schlimmer als ein paar
 * vorgelesene Bildzeichen. In dem Fall bleibt der Name, wie er ist.
 */
export function nameOhneEmoji(name: string): string {
  const sauber = entferneEmoji(name);
  return sauber.length > 0 ? sauber : name;
}

// ── Nachgelieferter Chat ───────────────────────────────────────────────────

/** So lange nach dem Verbinden gilt Chat als nachgeliefert. */
export const NACHLIEFERUNG_MS = 25_000;

/**
 * Kommt diese Nachricht aus TikToks Nachlieferung statt aus dem laufenden Chat?
 *
 * Reisst die Verbindung ab, schreiben die Leute weiter. Beim Neuverbinden
 * schickt TikTok den verpassten Verlauf auf einen Schlag hinterher. Belegt im
 * Stream vom 19.08.2026: SECHSMAL kamen exakt sechs Nachrichten mit identischem
 * Zeitstempel, jeweils Sekunden nach einem Neuverbinden.
 *
 * Alle wurden vorgelesen — bei rund vier Sekunden je Ansage eine halbe Minute
 * Rückstand. Zu hören war Chat von vor fünf Minuten, während im Stream längst
 * etwas anderes lief. Genau das meinte der Streamer mit „TTS kommt ewig nicht".
 *
 * WARUM ES NICHT ÜBER DAS ALTER GEHT: Die Warteschlange misst, wie lange eine
 * Ansage IN IHR lag. Die nachgelieferten landen alle gleichzeitig darin und
 * gelten damit als brandneu. Und TikToks eigenen Zeitstempel führt die App
 * nicht mit — sie setzt den Empfangszeitpunkt, der bei Nachlieferungen
 * ebenfalls „jetzt" ist.
 *
 * Deshalb der Umweg über den Verbindungszeitpunkt: Was unmittelbar nach dem
 * Verbinden hereinkommt, ist mit hoher Wahrscheinlichkeit Verlauf.
 *
 * DER PREIS, offen benannt: In diesem Fenster wird auch eine ECHT neue
 * Nachricht nicht vorgelesen. Das ist der bessere Tausch — eine verpasste
 * Nachricht wiegt leichter als eine halbe Minute nachgeplapperter alter Chat.
 * Trigger, Zähler und Widgets sehen sie ohnehin weiterhin.
 */
export function istNachlieferung(verbundenSeit: number, jetzt: number): boolean {
  if (verbundenSeit <= 0) return false;
  return jetzt - verbundenSeit < NACHLIEFERUNG_MS;
}
