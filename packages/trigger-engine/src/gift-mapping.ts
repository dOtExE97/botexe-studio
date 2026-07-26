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

/** Ein Eintrag der Rad-Segmentliste (nur der Schlüssel, kein Anzeigetext —
 *  der Text ist Widget-Sache; der Server braucht nur wer/welcher Index). */
export interface GiftKey {
  slug: string;
  giftId: number;
  ruleId: string;
}

/**
 * Gift-Regeln in Anzeigereihenfolge, dedupliziert — DAS SERVER-PENDANT zu
 * itemsFromRules() in packages/widget-kit/gift-menu.js. Das Rad-Widget baut
 * seine Segmente per itemsFromRules aus denselben Regeln; der Server bestimmt
 * per orderedGiftKeys() den Gewinner-INDEX. Beide MÜSSEN exakt dieselbe
 * Einschluss-/Dedup-/Reihenfolge-Logik verwenden — sonst landet das Rad
 * (Widget-Reihenfolge) auf einem anderen Feld als dem, dessen Aktion
 * serverseitig gefeuert wird (Index-Drift). Bei Änderung an EINER Stelle
 * IMMER die andere mitziehen — siehe Kommentar bei itemsFromRules/giftKey
 * in gift-menu.js.
 *
 * Schlüssel-Formel identisch zu giftKey() in gift-menu.js: Slug klein +
 * auf a-z0-9 reduziert (Apostroph/Leerzeichen/Schreibweise egal), sonst
 * `#<giftId>`.
 */
export function orderedGiftKeys(rules: TriggerRule[]): GiftKey[] {
  const out: GiftKey[] = [];
  const seen = new Set<string>();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || rule.enabled === false || rule.event !== 'gift') continue;
    const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
    const slugCond = conds.find((c) => c && c.kind === 'gift_slug_is') as
      | { kind: 'gift_slug_is'; value: string }
      | undefined;
    const idCond = conds.find((c) => c && c.kind === 'gift_id_is') as
      | { kind: 'gift_id_is'; value: number }
      | undefined;
    if (!slugCond && !idCond) continue;
    const slug = slugCond ? String(slugCond.value ?? '') : '';
    const giftId = idCond ? Number(idCond.value) || 0 : 0;
    const key = slug ? slug.toLowerCase().replace(/[^a-z0-9]/g, '') : `#${giftId}`;
    if (!key || seen.has(key)) continue;
    if (!slug && !giftId) continue; // ungültige gift_id_is (0/NaN) ohne Slug
    seen.add(key);
    out.push({ slug, giftId, ruleId: rule.id });
  }
  return out;
}
