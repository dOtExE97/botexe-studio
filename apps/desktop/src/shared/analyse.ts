// analyse.ts — Auswertung der Stream-Historie für die Analyse-Seite.
// Reine Rechnung, kein I/O — testbar und in beiden Prozessen nutzbar.
//
// Die Zahlen sollen eine FRAGE beantworten, nicht nur eine Spalte füllen:
//   „Läuft es besser als sonst?"  → Vergleich zum Schnitt
//   „Wann lohnt sich streamen?"   → beste Wochentage/Uhrzeiten
//   „Geht es aufwärts?"           → Trend über die letzten Streams

export interface StreamEintrag {
  at: number;
  coins: number;
  gifts: number;
  likes: number;
  chats: number;
  follows: number;
  shares: number;
  peakViewers: number;
  uniqueViewers?: number;
  /** Erst ab v0.47 vorhanden — ältere Einträge kennen weder Start noch Dauer. */
  startedAt?: number;
  durationMin?: number;
  subs?: number;
  envelopes?: number;
  envelopeCoins?: number;
}

/** Ein Wert plus Einordnung — mehr als die nackte Zahl. */
export interface Kennzahl {
  wert: number;
  /** Schnitt der Vergleichsgruppe. */
  schnitt: number;
  /** Abweichung in Prozent (positiv = besser als sonst). 0 wenn kein Schnitt. */
  abweichung: number;
}

export function kennzahl(wert: number, vergleich: number[]): Kennzahl {
  const brauchbar = vergleich.filter((v) => Number.isFinite(v));
  const schnitt = brauchbar.length ? brauchbar.reduce((a, b) => a + b, 0) / brauchbar.length : 0;
  const abweichung = schnitt > 0 ? Math.round(((wert - schnitt) / schnitt) * 100) : 0;
  return { wert, schnitt: Math.round(schnitt), abweichung };
}

/** Streams im Zeitfenster, älteste zuerst. */
export function imZeitraum(eintraege: StreamEintrag[], tage: number, jetzt: number): StreamEintrag[] {
  const ab = jetzt - tage * 86_400_000;
  return eintraege.filter((e) => e.at >= ab && e.at <= jetzt).sort((a, b) => a.at - b.at);
}

/** Trend über die letzten Streams: Steigt oder fällt es?
 *
 *  Bewusst simpel — erste Hälfte gegen zweite Hälfte. Eine echte Regression
 *  wäre bei fünf Datenpunkten Zahlenmystik; diese Aussage versteht dagegen
 *  jeder und stimmt in der Größenordnung. */
export function trend(werte: number[]): { richtung: 'hoch' | 'runter' | 'gleich'; prozent: number } {
  if (werte.length < 4) return { richtung: 'gleich', prozent: 0 };
  const mitte = Math.floor(werte.length / 2);
  const alt = werte.slice(0, mitte);
  const neu = werte.slice(mitte);
  const m = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const alterSchnitt = m(alt);
  const neuerSchnitt = m(neu);
  if (alterSchnitt <= 0) return { richtung: neuerSchnitt > 0 ? 'hoch' : 'gleich', prozent: 0 };
  const p = Math.round(((neuerSchnitt - alterSchnitt) / alterSchnitt) * 100);
  // Unter 10 % ist Rauschen — als „gleich" darstellen, sonst suggeriert jede
  // Schwankung eine Entwicklung.
  if (Math.abs(p) < 10) return { richtung: 'gleich', prozent: p };
  return { richtung: p > 0 ? 'hoch' : 'runter', prozent: p };
}

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

export interface TagesWert {
  tag: string;
  /** Durchschnittliche Coins an diesem Wochentag. */
  schnitt: number;
  /** Wie viele Streams die Grundlage sind — bei 1 ist es Zufall, nicht Muster. */
  anzahl: number;
}

/**
 * Welcher Wochentag bringt im Schnitt am meisten? Nur Tage mit mindestens
 * ZWEI Streams, sonst wäre ein einzelner guter Abend „der beste Wochentag".
 */
export function besteWochentage(eintraege: StreamEintrag[]): TagesWert[] {
  const nach = new Map<number, number[]>();
  for (const e of eintraege) {
    // Beginn schlägt Ende: Ein Stream, der um 01:30 endet, gehört zum
    // Freitagabend, nicht zum Samstag. `startedAt` gibt es erst ab v0.47 —
    // bei Altdaten bleibt es beim Ende, dann eben mit dieser Unschärfe.
    const d = new Date(e.startedAt ?? e.at).getDay();
    const liste = nach.get(d) ?? [];
    liste.push(e.coins);
    nach.set(d, liste);
  }
  const out: TagesWert[] = [];
  for (const [tag, werte] of nach) {
    if (werte.length < 2) continue;
    out.push({
      tag: WOCHENTAGE[tag] ?? '?',
      schnitt: Math.round(werte.reduce((a, b) => a + b, 0) / werte.length),
      anzahl: werte.length,
    });
  }
  return out.sort((a, b) => b.schnitt - a.schnitt);
}

/** Der stärkste Stream im Zeitraum — mit Datum, damit man sich erinnert. */
export function besterStream(eintraege: StreamEintrag[]): StreamEintrag | null {
  if (eintraege.length === 0) return null;
  return eintraege.reduce((a, b) => (b.coins > a.coins ? b : a));
}


/** Nur Streams, deren Dauer bekannt ist (ab v0.47 aufgezeichnet). */
export function mitDauer(eintraege: StreamEintrag[]): StreamEintrag[] {
  return eintraege.filter((e) => (e.durationMin ?? 0) > 0);
}

/**
 * Coins pro Stunde — die ehrlichste Kennzahl überhaupt.
 *
 * Ohne sie sieht ein kurzer, starker Abend schlechter aus als ein langer,
 * zäher: Die reine Coin-Summe belohnt nur Sitzfleisch. Liefert null, solange
 * kein Stream mit bekannter Dauer dabei ist.
 */
export function coinsProStunde(eintraege: StreamEintrag[]): number | null {
  const brauchbar = mitDauer(eintraege);
  if (brauchbar.length === 0) return null;
  const coins = brauchbar.reduce((a, e) => a + e.coins, 0);
  const minuten = brauchbar.reduce((a, e) => a + (e.durationMin ?? 0), 0);
  if (minuten <= 0) return null;
  return Math.round((coins / minuten) * 60);
}

export interface ZeitFenster {
  /** Startstunde des Fensters, 0-23. */
  stunde: number;
  label: string;
  schnitt: number;
  anzahl: number;
}

/**
 * Zu welcher Tageszeit lohnt es sich? Gruppiert nach Zwei-Stunden-Fenstern,
 * damit aus 24 Einzelstunden nicht 24 Einzelfälle werden.
 *
 * Wie bei den Wochentagen: mindestens ZWEI Streams je Fenster, sonst wäre ein
 * einzelner guter Abend schon „deine beste Sendezeit".
 */
export function besteSendezeiten(eintraege: StreamEintrag[]): ZeitFenster[] {
  const nach = new Map<number, number[]>();
  for (const e of eintraege) {
    // Bewusst NUR Streams mit bekanntem Beginn: Die Endzeit als Sendezeit
    // auszugeben wäre schlicht falsch (ein Stream endet Stunden nach dem Start).
    if (!e.startedAt) continue;
    const fenster = Math.floor(new Date(e.startedAt).getHours() / 2) * 2;
    const liste = nach.get(fenster) ?? [];
    liste.push(e.coins);
    nach.set(fenster, liste);
  }
  const out: ZeitFenster[] = [];
  for (const [stunde, werte] of nach) {
    if (werte.length < 2) continue;
    out.push({
      stunde,
      label: `${String(stunde).padStart(2, '0')}–${String((stunde + 2) % 24).padStart(2, '0')} Uhr`,
      schnitt: Math.round(werte.reduce((a, b) => a + b, 0) / werte.length),
      anzahl: werte.length,
    });
  }
  return out.sort((a, b) => b.schnitt - a.schnitt);
}

/** Wie viele Vergleichs-Streams es mindestens braucht, bevor die App urteilt.
 *  Dieselbe Schwelle wie beim Trend — sonst wäre die Seite an einer Stelle
 *  streng und an der anderen leichtfertig. */
export const URTEIL_AB = 4;

export interface Urteil {
  /** 'stark' | 'normal' | 'ruhig' | 'zu-wenig-daten' */
  art: 'stark' | 'normal' | 'ruhig' | 'zu-wenig-daten';
  satz: string;
  /** Platz dieses Streams innerhalb der Vergleichsgruppe (1 = bester). */
  platz: number;
  vonWievielen: number;
}

/**
 * Die Antwort auf „war das gut?" in EINEM Satz — vor jeder Zahl.
 *
 * `vergleich` enthält die anderen Streams (ohne den bewerteten selbst).
 */
export function urteil(coins: number, vergleich: number[]): Urteil {
  const gesamt = vergleich.length + 1;
  const platz = 1 + vergleich.filter((v) => v > coins).length;
  if (vergleich.length < URTEIL_AB) {
    return {
      art: 'zu-wenig-daten',
      satz: `Das war dein ${gesamt}. aufgezeichneter Stream — für einen ehrlichen Vergleich braucht es ein paar mehr.`,
      platz,
      vonWievielen: gesamt,
    };
  }
  const k = kennzahl(coins, vergleich);
  const rang = `Platz ${platz} von ${gesamt}.`;
  if (k.abweichung >= 25) {
    return { art: 'stark', satz: `Starker Abend — ${k.abweichung} % über deinem Schnitt (${k.schnitt} Coins). ${rang}`, platz, vonWievielen: gesamt };
  }
  if (k.abweichung <= -25) {
    return { art: 'ruhig', satz: `Ruhiger Abend — ${Math.abs(k.abweichung)} % unter deinem Schnitt (${k.schnitt} Coins). ${rang}`, platz, vonWievielen: gesamt };
  }
  // Beim normalen Abend BEWUSST ohne Platzierung: Liegen alle Streams dicht
  // beieinander, wird man mit einem Coin Vorsprung „Platz 1" — zusammen mit
  // „ganz normaler Abend" liest sich das wie ein Widerspruch und macht die
  // ganze Einordnung unglaubwürdig. Der Platz sagt hier schlicht nichts aus.
  return { art: 'normal', satz: `Ein ganz normaler Abend — ziemlich genau dein Schnitt (${k.schnitt} Coins).`, platz, vonWievielen: gesamt };
}
