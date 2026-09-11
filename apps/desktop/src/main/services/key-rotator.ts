// key-rotator.ts — mehrere eulerstream-Keys mit automatischem Wechsel.
//
// Der Gratis-Community-Plan hat ein Tageskontingent (10 WS / 1000 Anfragen).
// Ist ein Key erschöpft oder wird abgelehnt, soll die App automatisch den
// nächsten hinterlegten Key nehmen, statt den Stream stehenzulassen.
//
// DIE KNIFFLIGE STELLE ist der Close-Code 1011: Er heißt „Server-Fehler" und
// kommt SOWOHL bei erschöpftem Kontingent ALS AUCH, wenn eulerstream den
// Streamer gerade nicht auflösen kann (der ist z.B. offline). Würde bei jedem
// 1011 sofort gewechselt, brennt ein „Streamer nicht live" sinnlos alle Keys
// durch. Deshalb: bei 1011 erst am selben Key WIEDERHOLEN, und erst wenn es dort
// hängen bleibt, weiterrotieren. Eindeutige Key-Fehler (4401/4403) wechseln
// sofort. Netz-/Live-Codes (1006/4404/4005) lösen NIE einen Wechsel aus.
//
// Bewusst reine Logik ohne electron/Netz: so unter node:test prüfbar. Die Zeit
// kommt als Parameter herein (kein Date.now() im Inneren), damit „bis
// Mitternacht" testbar ist.

/** Ab wie vielen 1011-Fehlern am selben Key wird er als erschöpft gewertet. */
const MAX_1011 = 2;

/** Eindeutige Key-Fehler (Schlüssel ungültig / kein Recht) → sofort wechseln. */
const SOFORT_WECHSEL = new Set([4401, 4403]);

export interface RotatorErgebnis {
  /** Wird zu einem ANDEREN Key gewechselt? */
  wechsel: boolean;
  /** Der ab jetzt aktive Key (oder null, wenn alle erschöpft sind). */
  aktiv: string | null;
  /** Grund, kurz — fürs Log. */
  grund?: string;
}

/** Bis wann ein erschöpfter Key gesperrt bleibt: bis zum nächsten lokalen
 *  Tagesbeginn (das Kontingent ist ein Tageslimit). Exportiert für den Test. */
export function naechsteMitternacht(jetzt: number): number {
  const d = new Date(jetzt);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export class KeyRotator {
  private readonly keys: string[];
  /** key → Zeitpunkt, bis zu dem er als erschöpft gilt. */
  private erschoepftBis = new Map<string, number>();
  /** key → Zahl aufeinanderfolgender 1011 (wird bei Erfolg zurückgesetzt). */
  private fehler1011 = new Map<string, number>();

  constructor(keys: string[]) {
    // Leere/doppelte raus, Reihenfolge bleibt (erster = bevorzugt).
    this.keys = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
  }

  anzahl(): number { return this.keys.length; }

  /** Der aktive Key: der erste in der Liste, der nicht (mehr) erschöpft ist. */
  aktiv(jetzt: number): string | null {
    for (const k of this.keys) {
      const bis = this.erschoepftBis.get(k);
      if (!bis || bis <= jetzt) return k;
    }
    return null;
  }

  /** Eine Verbindung mit dem aktiven Key ist erfolgreich zustande gekommen —
   *  den 1011-Zähler dieses Keys zurücksetzen (der Aussetzer war vorübergehend). */
  meldeErfolg(jetzt: number): void {
    const k = this.aktiv(jetzt);
    if (k) this.fehler1011.set(k, 0);
  }

  /**
   * Eine Verbindung mit dem aktiven Key ist mit `code` gescheitert. Entscheidet,
   * ob gewechselt wird, und liefert den ab jetzt aktiven Key.
   */
  meldeFehler(code: number, jetzt: number): RotatorErgebnis {
    const aktuell = this.aktiv(jetzt);
    if (!aktuell) return { wechsel: false, aktiv: null, grund: 'kein Key verfügbar' };

    if (SOFORT_WECHSEL.has(code)) {
      this.sperren(aktuell, jetzt);
      const naechster = this.aktiv(jetzt);
      return { wechsel: naechster !== null && naechster !== aktuell, aktiv: naechster, grund: `Key abgelehnt (Code ${code})` };
    }

    if (code === 1011) {
      const n = (this.fehler1011.get(aktuell) ?? 0) + 1;
      this.fehler1011.set(aktuell, n);
      if (n < MAX_1011) {
        // Noch am selben Key bleiben — könnte ein vorübergehender Server-Aussetzer
        // oder „Streamer gerade offline" sein, kein Key-Problem.
        return { wechsel: false, aktiv: aktuell, grund: `Code 1011 (${n}/${MAX_1011}) — nochmal derselbe Key` };
      }
      this.sperren(aktuell, jetzt);
      const naechster = this.aktiv(jetzt);
      return { wechsel: naechster !== null && naechster !== aktuell, aktiv: naechster, grund: `Code 1011 wiederholt — Kontingent vermutlich erschöpft` };
    }

    // 1006 (Netz weg), 4404 (nicht live), 4005 (Stream-Ende) u.a.: kein Wechsel.
    return { wechsel: false, aktiv: aktuell, grund: `Code ${code} — kein Key-Problem` };
  }

  private sperren(key: string, jetzt: number): void {
    this.erschoepftBis.set(key, naechsteMitternacht(jetzt));
    this.fehler1011.set(key, 0);
  }
}
