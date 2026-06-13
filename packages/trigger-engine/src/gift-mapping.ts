// gift-mapping.ts — Brücke zwischen Geschenke-Galerie und Trigger-Regeln.
// Die Galerie verwaltet pro Gift eine „kanonische" Regel (stabile id
// giftmap-<slug>), damit Zuordnungen idempotent sind. Zusätzliche, frei auf
// der Trigger-Seite gebaute Regeln zum selben Gift bleiben unberührt.
import type { TriggerAction, TriggerRule } from './index';

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
