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
    const d = new Date(e.at).getDay();
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
