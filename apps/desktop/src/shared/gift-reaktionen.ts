// gift-reaktionen.ts — beantwortet EINMAL für die ganze App die Frage:
// „Passiert bei diesem Geschenk irgendetwas?"
//
// WARUM ALS EIGENES MODUL: Ein Geschenk kann an fünf verschiedenen Stellen
// verdrahtet sein — als Trigger-Regel, in der Liste eines Geschenk-Menüs, als
// Dreh-Geschenk am Glücksrad oder Slot, in der Ziehung, im Befehl-Karussell.
// Würde die Vorschlags-Leiste in der Galerie ihre eigene Prüfung mitbringen,
// wäre das wieder „dasselbe Wissen an zwei Stellen": Baut jemand ein neues
// Widget mit Geschenk-Feld, würde die Galerie weiter „keine Reaktion"
// behaupten und Vorschläge für längst verdrahtete Geschenke machen.
//
// Deshalb liest diese Datei die Widget-Felder NICHT aus einer eigenen Liste,
// sondern bekommt sie vom Aufrufer aus der Widget-Typdefinition gereicht
// (Feldtyp 'gift', 'gift-list', 'gift-command-list'). Neues Widget mit
// Geschenk-Feld ⇒ hier ohne eine Zeile Änderung mit erfasst.

/** Wie überall: nur Buchstaben/Ziffern, klein (siehe gift-rules.js). */
export function reaktionsKey(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface RegelInfo {
  name?: string;
  event?: string;
  enabled?: boolean;
  conditions?: { kind?: string; value?: string | number }[];
  actions?: unknown[];
}

/** Ein Geschenk-Feld einer Overlay-Ebene, schon aufgelöst zu Slugs. */
export interface WidgetGiftFeld {
  /** Anzeigename der Ebene („Glücksrad") — für die Begründung. */
  ebene: string;
  slugs: string[];
}

export interface Reaktion {
  /** Klartext für die Anzeige: „Regel „Rose → Sound"" */
  grund: string;
  /** true, wenn etwas GENAU auf dieses Geschenk reagiert (Name/Nummer).
   *  false bei Allgemein-Reaktionen (ab X Coins, jedes Geschenk) — die
   *  fangen zwar auch dieses Geschenk, sind aber kein eigener Auftritt. */
  spezifisch: boolean;
}

export interface Gift {
  slug: string;
  giftId?: number;
}

/** Zerlegt den Wert eines Geschenk-Feldes in Slugs.
 *  Deckt alle drei Speicherformate ab: Einzelwert ('Rose'), Komma-Liste
 *  ('Rose,Galaxy') und die Geschenk+Text-Liste ('Rose::Danke | Galaxy::Wow'). */
export function slugsAusFeldwert(wert: unknown): string[] {
  const s = typeof wert === 'string' ? wert : '';
  if (!s.trim()) return [];
  return s
    .split(/[|,]/)
    .map((teil) => (teil.split('::')[0] ?? '').trim())
    .filter(Boolean);
}

/** Alles, was auf dieses Geschenk reagiert — leere Liste = niemand. */
export function reaktionenFuerGift(
  gift: Gift,
  quellen: { regeln?: RegelInfo[]; widgetFelder?: WidgetGiftFeld[] },
): Reaktion[] {
  const key = reaktionsKey(gift.slug);
  const out: Reaktion[] = [];

  for (const r of quellen.regeln ?? []) {
    // Ausgeschaltete Regeln zählen bewusst NICHT: Sonst würde die Galerie
    // „hat schon eine Reaktion" behaupten, während im Stream nichts passiert.
    if (r.enabled === false || r.event !== 'gift') continue;
    if (!Array.isArray(r.actions) || r.actions.length === 0) continue; // Regel ohne Aktion tut nichts
    const name = r.name?.trim() || 'Regel ohne Namen';
    const bedingungen = Array.isArray(r.conditions) ? r.conditions : [];
    if (bedingungen.length === 0) {
      out.push({ grund: `Regel „${name}" (feuert bei jedem Geschenk)`, spezifisch: false });
      continue;
    }
    for (const c of bedingungen) {
      if (c?.kind === 'gift_slug_is' && reaktionsKey(String(c.value ?? '')) === key && key) {
        out.push({ grund: `Regel „${name}"`, spezifisch: true });
      } else if (c?.kind === 'gift_id_is' && gift.giftId != null && Number(c.value) === gift.giftId) {
        out.push({ grund: `Regel „${name}"`, spezifisch: true });
      } else if (c?.kind === 'gift_coins_gte' || c?.kind === 'gift_count_gte') {
        out.push({ grund: `Regel „${name}" (allgemein, ab ${c.value})`, spezifisch: false });
      }
    }
  }

  for (const f of quellen.widgetFelder ?? []) {
    if (!key) continue;
    if (f.slugs.some((s) => reaktionsKey(s) === key)) {
      out.push({ grund: `Widget „${f.ebene}"`, spezifisch: true });
    }
  }

  return out;
}

/** Kurzfassung für die Vorschlags-Leiste: Hat das Geschenk einen EIGENEN Auftritt? */
export function hatEigeneReaktion(gift: Gift, quellen: { regeln?: RegelInfo[]; widgetFelder?: WidgetGiftFeld[] }): boolean {
  return reaktionenFuerGift(gift, quellen).some((r) => r.spezifisch);
}
