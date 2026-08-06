// tiktok-pk.ts — PK-Kämpfe (LinkMic-Battles) auslesen.
//
// WAS EIN PK IST: Zwei Streamer treten gegeneinander an. Die Zuschauer beider
// Seiten schenken, und wessen Seite am Ende mehr Punkte hat, gewinnt. Für viele
// Streamer ist das der wichtigste Moment des Abends — und die App hat davon
// bisher NICHTS mitbekommen.
//
// WARUM ES SO LANGE GEDAUERT HAT: Bis v0.49.0 standen `WebcastLinkMicBattle`
// und `WebcastLinkMicArmies` auf der Liste „harmlos, nicht melden" — sie wurden
// stumm verworfen, noch bevor irgendjemand sie sehen konnte. Erst nach dem
// Entstummen hat ein echter Kampf gezeigt, was wirklich ankommt.
//
// ALLE FELDNAMEN HIER SIND BELEGT aus dem Diagnose-Log eines echten Kampfes
// (05.08.2026) — nichts davon ist geraten:
//
//   WebcastLinkMicBattle ×2    battleId, battleSetting{startTimeMs,duration,
//                              endTimeMs,battleType,status}, battleResult,
//                              anchorInfo{<uid>,<uid>}, battleCombos{<uid>,<uid>}
//   WebcastLinkMicArmies ×62   battleId, battleItems{<uid>,<uid>}, battleStatus,
//                              fromUserId, giftId, giftCount, totalDiamondCount,
//                              scoreUpdateTime, triggerCriticalStrike
//   …BattlePunishFinish ×1     battleId, reason, opUid
//
// DIE BESONDERHEIT, die man sonst rät: Bei `battleItems` und `anchorInfo` sind
// die STREAMER-IDs die Schlüssel des Objekts — kein Array, sondern
// { "7069026870822716421": …, "6635416940436602885": … }. Wer hier ein Array
// erwartet, bekommt nichts und merkt es nicht.

/** Punktestand einer Seite. */
export interface PkSeite {
  /** TikTok-User-ID des Streamers dieser Seite. */
  userId: string;
  punkte: number;
}

/** Ein Punktestand-Update während des Kampfes. */
export interface PkStand {
  battleId: string;
  seiten: PkSeite[];
  /** Wer gerade vorn liegt — undefined bei Gleichstand. */
  fuehrt?: string;
  /** Nur wenn dieses Update von einem Geschenk ausgelöst wurde. */
  beitrag?: {
    vonUserId: string;
    giftId: string;
    anzahl: number;
    coins: number;
  };
  /** Läuft der Kampf noch? (battleStatus aus der Nachricht) */
  status?: number;
}

/** Rahmen des Kampfes: Start, Dauer, Ergebnis. */
export interface PkRahmen {
  battleId: string;
  /** Beginn in ms, sofern mitgeliefert. */
  startetAt?: number;
  endetAt?: number;
  /** Geplante Dauer in Sekunden. */
  dauerSek?: number;
  /** Die beiden Streamer-IDs. */
  teilnehmer: string[];
  /** 0/undefined = läuft noch. */
  ergebnis?: number;
}

const zahl = (w: unknown): number => {
  const n = typeof w === 'string' ? Number(w) : typeof w === 'number' ? w : NaN;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Ein Objekt, dessen SCHLÜSSEL die Streamer-IDs sind, in eine Liste bringen.
 *
 * Der Wert je Schlüssel ist mal eine nackte Zahl, mal ein Objekt mit `points`
 * oder `score`. Beide Formen kommen vor, deshalb werden beide gelesen — und
 * alles andere ergibt 0 statt einer Ausnahme.
 */
function seitenAus(roh: unknown): PkSeite[] {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return [];
  const raus: PkSeite[] = [];
  for (const [userId, wert] of Object.entries(roh as Record<string, unknown>)) {
    // Schlüssel müssen wie TikTok-IDs aussehen — sonst landen Felder wie
    // „status" versehentlich als Teilnehmer in der Liste.
    if (!/^\d{6,}$/.test(userId)) continue;
    const punkte = typeof wert === 'object' && wert !== null
      ? zahl((wert as Record<string, unknown>)['points'] ?? (wert as Record<string, unknown>)['score'])
      : zahl(wert);
    raus.push({ userId, punkte });
  }
  return raus;
}

/**
 * Punktestand aus `WebcastLinkMicArmies`.
 *
 * Diese Nachricht kam in einem echten Kampf 62× — sie ist der Live-Ticker.
 * null, wenn kein Kampf erkennbar ist (dann ist es kein PK-Update).
 */
export function lesePkStand(data: unknown): PkStand | null {
  const d = data as Record<string, unknown> | undefined;
  const battleId = String(d?.['battleId'] ?? '').trim();
  if (!battleId) return null;

  const seiten = seitenAus(d?.['battleItems']);
  if (seiten.length === 0) return null;

  // Führung nur bei echtem Vorsprung — bei Gleichstand führt niemand.
  const sortiert = [...seiten].sort((a, b) => b.punkte - a.punkte);
  const fuehrt = sortiert.length >= 2 && (sortiert[0]?.punkte ?? 0) > (sortiert[1]?.punkte ?? 0)
    ? sortiert[0]?.userId
    : undefined;

  const vonUserId = String(d?.['fromUserId'] ?? '').trim();
  const giftId = String(d?.['giftId'] ?? '').trim();
  const coins = zahl(d?.['totalDiamondCount']);

  return {
    battleId,
    seiten,
    ...(fuehrt ? { fuehrt } : {}),
    ...(vonUserId && giftId
      ? { beitrag: { vonUserId, giftId, anzahl: zahl(d?.['giftCount']) || 1, coins } }
      : {}),
    ...(d?.['battleStatus'] !== undefined ? { status: zahl(d['battleStatus']) } : {}),
  };
}

/**
 * Rahmen aus `WebcastLinkMicBattle` — Start, Dauer, Teilnehmer, Ergebnis.
 * Kommt zweimal je Kampf: einmal beim Start, einmal am Ende.
 */
export function lesePkRahmen(data: unknown): PkRahmen | null {
  const d = data as Record<string, unknown> | undefined;
  const setting = d?.['battleSetting'] as Record<string, unknown> | undefined;
  const battleId = String(d?.['battleId'] ?? setting?.['battleId'] ?? '').trim();
  if (!battleId) return null;

  // Teilnehmer stehen als SCHLÜSSEL in anchorInfo bzw. battleCombos.
  const teilnehmer = [
    ...seitenAus(d?.['anchorInfo']).map((s) => s.userId),
    ...seitenAus(d?.['battleCombos']).map((s) => s.userId),
  ];
  const start = zahl(setting?.['startTimeMs']);
  const ende = zahl(setting?.['endTimeMs']);
  const ergebnis = zahl(d?.['battleResult']);

  return {
    battleId,
    teilnehmer: [...new Set(teilnehmer)],
    ...(start > 0 ? { startetAt: start } : {}),
    ...(ende > 0 ? { endetAt: ende } : {}),
    ...(zahl(setting?.['duration']) > 0 ? { dauerSek: zahl(setting?.['duration']) } : {}),
    ...(ergebnis > 0 ? { ergebnis } : {}),
  };
}

/**
 * Lesbare Zusammenfassung für das Log — aus SICHT DES STREAMERS.
 *
 * „4.200 : 3.100" allein sagt nichts, wenn man nicht weiß, welche Zahl die
 * eigene ist. Deshalb steht die eigene immer vorn, sobald die eigene ID
 * bekannt ist.
 */
export function pkText(stand: PkStand, eigeneId?: string): string {
  const eigen = eigeneId ? stand.seiten.find((s) => s.userId === eigeneId) : undefined;
  const gegner = eigen ? stand.seiten.find((s) => s.userId !== eigeneId) : undefined;
  if (eigen && gegner) {
    const diff = eigen.punkte - gegner.punkte;
    const lage = diff > 0 ? `du führst mit ${diff}`
      : diff < 0 ? `du liegst ${Math.abs(diff)} zurück`
        : 'Gleichstand';
    return `${eigen.punkte} : ${gegner.punkte} — ${lage}`;
  }
  return stand.seiten.map((s) => s.punkte).join(' : ');
}
