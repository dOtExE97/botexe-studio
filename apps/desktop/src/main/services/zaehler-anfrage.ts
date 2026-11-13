// zaehler-anfrage.ts — Parameter der Fernsteuerung POST /api/zaehler prüfen
// (Piraten-Zähler: Victory Royales / Kills, z.B. per Stream Deck).
// REINE Funktion, kein Seiteneffekt → direkt testbar. Die Route in
// overlay-server.ts macht aus dem Ergebnis eine Overlay-Aktion `fire_alert`
// mit `params` an jedes Widget „piraten-zaehler" im angezeigten Overlay; das
// Widget wendet sie an (packages/widget-kit/piraten-zaehler.js, wendeAn()).

export type ZaehlerName = 'siege' | 'kills';

/** Was das Widget bekommt (landet als `params` in der fire_alert-Aktion). */
export type ZaehlerParams = { zaehler: ZaehlerName; delta: number } | { zaehler: ZaehlerName; wert: number };

/** Gleiche Schreibweisen wie im Widget (ALIAS in piraten-zaehler.js). Eine
 *  Map, kein Objekt-Literal: sonst gälten geerbte Schlüssel wie „constructor",
 *  „__proto__" oder „toString" als Zähler (Review Runde 3, M1). */
const ALIAS: ReadonlyMap<string, ZaehlerName> = new Map<string, ZaehlerName>([
  ['siege', 'siege'], ['sieg', 'siege'], ['vr', 'siege'], ['victory', 'siege'], ['wins', 'siege'], ['win', 'siege'],
  ['kills', 'kills'], ['kill', 'kills'],
]);

export const ZAEHLER_MAX = 99999;
const MAX_SCHRITT = 100;

/**
 * @param lies liefert einen Parameter (Query oder JSON-Body) als Text.
 *   zaehler = siege|vr|wins|kills (Alias: `wert`, wenn es ein Name ist)
 *   aktion  = plus (Standard) | minus | reset | setzen
 *   anzahl  = Schrittweite für plus/minus (1–100, Standard 1)
 *   auf     = Zielwert für setzen (0–99999)
 */
export function zaehlerAnfrage(lies: (name: string) => string | undefined): ZaehlerParams | { fehler: string } {
  const name = (lies('zaehler') ?? lies('wert') ?? '').trim().toLowerCase();
  const zaehler = ALIAS.get(name);
  if (!zaehler) return { fehler: 'Parameter „zaehler" fehlt oder ist unbekannt — erlaubt: siege (auch vr, wins) oder kills.' };
  const aktion = (lies('aktion') ?? 'plus').trim().toLowerCase();
  if (aktion === 'reset') return { zaehler, wert: 0 };
  if (aktion === 'setzen') {
    const roh = (lies('auf') ?? '').trim();
    const n = /^\d{1,5}$/.test(roh) ? Number(roh) : NaN;
    if (!Number.isInteger(n) || n > ZAEHLER_MAX) return { fehler: `„setzen" braucht „auf" = 0 bis ${ZAEHLER_MAX}.` };
    return { zaehler, wert: n };
  }
  if (aktion !== 'plus' && aktion !== 'minus') return { fehler: 'Parameter „aktion" muss plus, minus, reset oder setzen sein.' };
  const rohAnzahl = (lies('anzahl') ?? '1').trim();
  const anzahl = /^\d{1,3}$/.test(rohAnzahl) ? Number(rohAnzahl) : NaN;
  if (!Number.isInteger(anzahl) || anzahl < 1 || anzahl > MAX_SCHRITT) return { fehler: `„anzahl" muss 1 bis ${MAX_SCHRITT} sein.` };
  return { zaehler, delta: aktion === 'minus' ? -anzahl : anzahl };
}
