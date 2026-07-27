// gift-mapping.ts — Brücke zwischen Geschenke-Galerie und Trigger-Regeln.
// Die Galerie verwaltet pro Gift eine „kanonische" Regel (stabile id
// giftmap-<slug>), damit Zuordnungen idempotent sind. Zusätzliche, frei auf
// der Trigger-Seite gebaute Regeln zum selben Gift bleiben unberührt.
import type { TriggerAction, TriggerRule } from './index';
// orderedGiftEntries ist reine, DOM-freie Logik aus packages/widget-kit — SIE
// ist die einzige Quelle für „Gift-Regeln → gefilterte Rad-/Tafel-Einträge"
// (itemsFromRules() + der Textfilter, den jede Anzeige-Seite ohnehin
// braucht, in EINER Funktion statt als von Hand nachgebauter Filter pro
// Aufrufer). Damit gilt orderedGiftKeys()' Index per Konstruktion für
// dasselbe Segment, das das Rad-Widget (wheel.js) anzeigt — keine zweite,
// von Hand synchron zu haltende Kopie mehr. Kein Typen-Paket nötig: gift-
// rules.js ist DOM-frei reines JS, allowJs übernimmt es unverändert (siehe
// tsconfig.json).
import { orderedGiftEntries, giftKey } from '../../widget-kit/gift-rules.js';

/** Stabile id der kanonischen Galerie-Regel eines Gifts.
 *
 *  WICHTIG: normalisiert bewusst NUR mit trim()+toLowerCase(), NICHT mit dem
 *  strengeren giftKey() (das zusätzlich alle Nicht-Alphanumerischen Zeichen
 *  entfernt) — diese ID wird in settings.json PERSISTIERT (Regel-id). Würde
 *  man hier auf giftKey() umstellen, änderte sich die ID jedes bestehenden
 *  Gifts mit Satzzeichen/Leerzeichen im Slug (z.B. "Finger Heart's") beim
 *  nächsten Speichern — findGiftRule() fände die alte Regel nicht mehr
 *  wieder ⇒ verwaiste Duplikat-Regel. Der eigentliche Matching-Bug (zwei
 *  Schreibweisen desselben Gifts = zwei „kanonische" Regeln) wird stattdessen
 *  in otherGiftRules() unten behoben, wo giftKey() ohne ID-Migration
 *  nachgezogen werden kann. */
export function giftRuleId(slug: string): string {
  return `giftmap-${slug.trim().toLowerCase()}`;
}

/** Die kanonische Galerie-Regel dieses Gifts (falls vorhanden). */
export function findGiftRule(rules: TriggerRule[], slug: string): TriggerRule | undefined {
  const id = giftRuleId(slug);
  return rules.find((r) => r.id === id);
}

/**
 * Aktionen eines Gifts setzen: legt die kanonische Regel an oder aktualisiert
 * sie. Leere Aktionsliste ⇒ Regel entfernen. enabled/cooldown bleiben erhalten.
 */
export function upsertGiftRule(
  rules: TriggerRule[],
  slug: string,
  actions: TriggerAction[],
): TriggerRule[] {
  const id = giftRuleId(slug);
  if (actions.length === 0) return rules.filter((r) => r.id !== id);
  const existing = rules.find((r) => r.id === id);
  const rule: TriggerRule = {
    id,
    name: `Gift: ${slug}`,
    event: 'gift',
    conditions: [{ kind: 'gift_slug_is', value: slug }],
    actions,
    cooldownMs: existing?.cooldownMs ?? 0,
    enabled: existing?.enabled ?? true,
  };
  return existing ? rules.map((r) => (r.id === id ? rule : r)) : [...rules, rule];
}

/** Fremde (nicht von der Galerie verwaltete) Regeln, die dasselbe Gift referenzieren.
 *
 *  Vergleicht mit giftKey() (nicht trim()+toLowerCase()) — DIESELBE Normali-
 *  sierung, die die Trigger-Engine beim tatsächlichen Matching verwendet
 *  (conditionHolds, gift_slug_is) und die gift-rules.js/wheel.js/gift-menu.js
 *  teilen. Vorher driftete das auseinander: ein Slug mit Satzzeichen/
 *  Leerzeichen (z.B. "Finger Heart's" vs. "Finger Hearts") wurde HIER als
 *  zwei verschiedene Gifts behandelt, obwohl die Engine sie als dasselbe
 *  matcht — Streamer sahen scheinbar zwei „fremde" Regeln für ein Gift, das
 *  eigentlich nur eins war. Betrifft NUR den Vergleich, nicht giftRuleId()
 *  (siehe deren Kommentar oben — dort bleibt die alte, schwächere
 *  Normalisierung bewusst stehen, um persistierte IDs nicht zu brechen). */
export function otherGiftRules(rules: TriggerRule[], slug: string): TriggerRule[] {
  const id = giftRuleId(slug);
  const key = giftKey(slug);
  return rules.filter(
    (r) =>
      r.id !== id &&
      r.event === 'gift' &&
      (r.conditions ?? []).some((c) => c.kind === 'gift_slug_is' && giftKey(c.value) === key),
  );
}

/** Ein Eintrag der Rad-Segmentliste (nur der Schlüssel, kein Anzeigetext —
 *  der Text ist Widget-Sache; der Server braucht nur wer/welcher Index). */
export interface GiftKey {
  slug: string;
  giftId: number;
  ruleId: string;
}

/**
 * Gift-Regeln in Anzeigereihenfolge, dedupliziert und um textlose Einträge
 * bereinigt — DER GEWINNER-INDEX HIER IST PER KONSTRUKTION IDENTISCH ZU DEN
 * SICHTBAREN RAD-SEGMENTEN: beide entstehen aus derselben, EINEN
 * orderedGiftEntries() (packages/widget-kit/gift-rules.js) — inklusive deren
 * Textfilter (`.filter((it) => it.text)`), den wheel.js/slot-machine.js/
 * gift-menu.js beim Aufbau ihrer Anzeige-Liste ebenfalls über dieselbe
 * Funktion anwenden (nicht mehr über eine eigene, lokale Kopie des Filters).
 * Eine Gift-Regel ohne Aktion (leerer Text) zählt hier also NICHT mit — sie
 * taucht auf dem Rad ja auch nicht als Segment auf. Ohne diesen (gemeinsamen)
 * Filter würde der Server-Index gegen die Rad-Segmente driften (Index N
 * zählt eine Regel mit, die das Rad gar nicht zeigt → falsches Feld feuert).
 */
export function orderedGiftKeys(rules: TriggerRule[]): GiftKey[] {
  const items = orderedGiftEntries(Array.isArray(rules) ? rules : []) as Array<{
    slug: string;
    giftId: number;
    text: string;
    ruleId: string;
  }>;
  return items.map((it) => ({ slug: it.slug, giftId: it.giftId, ruleId: it.ruleId }));
}
