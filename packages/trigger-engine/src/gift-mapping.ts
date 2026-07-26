// gift-mapping.ts — Brücke zwischen Geschenke-Galerie und Trigger-Regeln.
// Die Galerie verwaltet pro Gift eine „kanonische" Regel (stabile id
// giftmap-<slug>), damit Zuordnungen idempotent sind. Zusätzliche, frei auf
// der Trigger-Seite gebaute Regeln zum selben Gift bleiben unberührt.
import type { TriggerAction, TriggerRule } from './index';
// itemsFromRules ist reine, DOM-freie Logik aus packages/widget-kit — SIE ist
// die einzige Quelle für „Gift-Regeln → Rad-/Tafel-Einträge". Damit gilt
// orderedGiftKeys()' Index per Konstruktion für dasselbe Segment, das das
// Rad-Widget (wheel.js) anzeigt — keine zweite, von Hand synchron zu
// haltende Kopie mehr. Kein Typen-Paket nötig: gift-rules.js ist DOM-frei
// reines JS, allowJs übernimmt es unverändert (siehe tsconfig.json).
import { itemsFromRules } from '../../widget-kit/gift-rules.js';

/** Stabile id der kanonischen Galerie-Regel eines Gifts. */
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

/** Fremde (nicht von der Galerie verwaltete) Regeln, die dasselbe Gift referenzieren. */
export function otherGiftRules(rules: TriggerRule[], slug: string): TriggerRule[] {
  const id = giftRuleId(slug);
  const key = slug.trim().toLowerCase();
  return rules.filter(
    (r) =>
      r.id !== id &&
      r.event === 'gift' &&
      (r.conditions ?? []).some(
        (c) => c.kind === 'gift_slug_is' && c.value.trim().toLowerCase() === key,
      ),
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
 * SICHTBAREN RAD-SEGMENTEN: beide entstehen aus derselben itemsFromRules()
 * (packages/widget-kit/gift-rules.js), und beide wenden denselben Textfilter
 * an (`.filter((it) => it.text)`), den wheel.js beim Segmentaufbau nutzt
 * (`this.segments = items.map(it => it.text).filter(Boolean)`). Eine
 * Gift-Regel ohne Aktion (leerer Text) zählt hier also NICHT mit — sie taucht
 * auf dem Rad ja auch nicht als Segment auf. Ohne diesen Filter würde der
 * Server-Index gegen die Rad-Segmente driften (Index N zählt eine Regel mit,
 * die das Rad gar nicht zeigt → falsches Feld feuert).
 */
export function orderedGiftKeys(rules: TriggerRule[]): GiftKey[] {
  const items = (itemsFromRules(Array.isArray(rules) ? rules : []) as Array<{
    slug: string;
    giftId: number;
    text: string;
    ruleId: string;
  }>).filter((it) => it.text);
  return items.map((it) => ({ slug: it.slug, giftId: it.giftId, ruleId: it.ruleId }));
}
