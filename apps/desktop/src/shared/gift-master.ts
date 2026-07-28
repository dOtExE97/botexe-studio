// gift-master.ts — die eingebaute Liste ALLER TikTok-Geschenke (Name, ID,
// Coins, Bild-Adresse) und die eine Regel, wie sie mit dem selbst gesammelten
// Katalog zusammengeführt wird.
//
// WARUM DIESE DATEI EXISTIERT: Die Liste lag früher unter renderer/lib und wurde
// NUR im App-Fenster benutzt (Galerie + Geschenk-Auswähler). Der Overlay-Server
// lieferte den Widgets dagegen bloß den selbst gesammelten Katalog. Ergebnis:
// Im Fenster konnte man „Galaxy" mit Bild auswählen, im Overlay zeigte dasselbe
// Geschenk einen grauen Platzhalter — es sah aus, als sei das Widget kaputt.
//
// Das ist die wiederkehrende Fehlerklasse „dasselbe Wissen an zwei Stellen":
// Hier war es nicht einmal doppelt gepflegt, sondern nur EINER Seite bekannt.
// Beide Seiten führen jetzt über `mergeMitMaster()` zusammen — dieselbe
// Funktion, dieselbe Reihenfolge, dieselbe Normalisierung.
import GIFT_MASTER from './gift-master.json';

export interface MasterGift {
  id: number;
  name: string;
  de?: string;
  coins: number;
  icon?: string;
}

export const MASTER = GIFT_MASTER as MasterGift[];

/** Wie überall in der App: nur Buchstaben/Ziffern, klein (siehe gift-rules.js). */
export function masterKey(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Deutscher Name je Schlüssel — TikTok liefert nur englische Namen. */
export const DE_BY_KEY = new Map(
  MASTER.filter((m) => m.de).map((m) => [masterKey(m.name), m.de as string]),
);

/** Ein Katalog-Eintrag, wie ihn Fenster UND Overlay sehen. */
export interface KatalogEintrag {
  slug: string;
  giftId?: number;
  icon?: string;
  iconFile?: string;
  coins: number;
  count: number;
  de?: string;
  [k: string]: unknown;
}

/**
 * Selbst gesammelten Katalog um alle übrigen bekannten Geschenke ergänzen.
 *
 * Die eigenen Einträge stehen VORN und gewinnen: sie tragen echte Zähler, den
 * Erstschenker und — wichtig — ein lokal gesichertes Bild, das auch dann noch
 * lädt, wenn die TikTok-Adresse längst abgelaufen ist. Die Master-Einträge
 * füllen nur die Lücken.
 */
export function mergeMitMaster(
  eigene: Record<string, KatalogEintrag>,
): KatalogEintrag[] {
  const bekannt = Object.values(eigene).map((g) => ({
    ...g,
    de: g.de ?? DE_BY_KEY.get(masterKey(g.slug)),
  }));
  const gesehen = new Set(bekannt.map((g) => masterKey(g.slug)));
  const rest: KatalogEintrag[] = [];
  for (const m of MASTER) {
    const slug = m.name.trim(); // manche Master-Namen haben führende Leerzeichen
    const key = masterKey(slug);
    // Doppelte Namen aussortieren: TikTok führt 266 Geschenke unter einem schon
    // vergebenen Namen (andere ID, meist regionale oder alte Varianten). Ohne
    // diese Prüfung stand jedes davon zweimal in der Galerie — und die
    // Overlay-Sicht, die von Natur aus je Name nur einen Platz hat, wich von
    // der Fenster-Sicht ab. Der erste Eintrag gewinnt.
    if (!key || gesehen.has(key)) continue;
    gesehen.add(key);
    rest.push({ slug, giftId: m.id, coins: m.coins, count: 0, de: m.de, ...(m.icon ? { icon: m.icon } : {}) });
  }
  return [...bekannt, ...rest];
}

/** Dasselbe als Nachschlagewerk (Schlüssel → Eintrag) — so liefert der Server
 *  den Katalog ans Overlay, damit die Widgets dieselbe Sicht haben. */
export function mergeMitMasterAlsMap(
  eigene: Record<string, KatalogEintrag>,
): Record<string, KatalogEintrag> {
  const out: Record<string, KatalogEintrag> = {};
  for (const e of mergeMitMaster(eigene)) out[masterKey(e.slug)] = e;
  return out;
}
