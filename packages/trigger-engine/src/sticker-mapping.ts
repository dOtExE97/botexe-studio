// sticker-mapping.ts — Brücke zwischen Sticker-Seite und Trigger-Regeln.
//
// Gebaut wie gift-mapping.ts, und aus demselben Grund: Die Sticker-Seite soll
// bequem sein, aber KEINEN eigenen Regelspeicher haben. Sie verwaltet pro
// Sticker eine „kanonische" Regel mit stabiler id (stickermap-<emoteId>);
// zusätzliche, frei auf der Trigger-Seite gebaute Regeln zum selben Sticker
// bleiben unberührt.
//
// Doppeltes Wissen ist in diesem Projekt eine der beiden wiederkehrenden
// Fehlerklassen — deshalb ist die Regel die einzige Wahrheit, und die Seite
// nur eine hübschere Ansicht darauf.
import type { TriggerAction, TriggerRule } from './index';

/** Stabile id der kanonischen Sticker-Regel.
 *
 *  Die emoteId ist eine reine Zahl als Text und braucht keine Normalisierung —
 *  anders als Gift-Namen, wo Schreibweisen auseinanderlaufen. Sie wird
 *  persistiert, also darf sich ihre Bildung nie ändern. */
export function stickerRuleId(emoteId: string): string {
  return `stickermap-${emoteId.trim()}`;
}

/** Die kanonische Regel dieses Stickers (falls vorhanden). */
export function findStickerRule(rules: TriggerRule[], emoteId: string): TriggerRule | undefined {
  const id = stickerRuleId(emoteId);
  return rules.find((r) => r.id === id);
}

/**
 * Aktionen eines Stickers setzen: legt die kanonische Regel an oder
 * aktualisiert sie. Leere Aktionsliste ⇒ Regel entfernen.
 * enabled/cooldown bleiben erhalten.
 *
 * `name` ist der Anzeigename auf der Trigger-Seite. TikTok liefert zu einem
 * Sticker keinen Namen, deshalb steht dort die Nummer — es sei denn, der
 * Streamer hat auf der Sticker-Seite einen eigenen vergeben.
 */
export function upsertStickerRule(
  rules: TriggerRule[],
  emoteId: string,
  actions: TriggerAction[],
  anzeigeName?: string,
): TriggerRule[] {
  const id = stickerRuleId(emoteId);
  if (actions.length === 0) return rules.filter((r) => r.id !== id);
  const existing = rules.find((r) => r.id === id);
  const rule: TriggerRule = {
    id,
    name: `Sticker: ${anzeigeName?.trim() || `#${emoteId}`}`,
    event: 'emote',
    conditions: [{ kind: 'sticker_ist', value: emoteId }],
    actions,
    // Bewusst KEINE Abklingzeit voreingestellt: ausdrückliche Entscheidung —
    // jeder Sticker feuert. Wer es leiser will, stellt sie auf der
    // Trigger-Seite ein; das Feld bleibt dann erhalten.
    cooldownMs: existing?.cooldownMs ?? 0,
    enabled: existing?.enabled ?? true,
  };
  return existing ? rules.map((r) => (r.id === id ? rule : r)) : [...rules, rule];
}

/** Fremde (nicht von der Sticker-Seite verwaltete) Regeln zu diesem Sticker.
 *
 *  Damit die Seite ehrlich sagen kann „hier hängt noch etwas anderes dran",
 *  statt den Eindruck zu erwecken, sie zeige alles. */
export function otherStickerRules(rules: TriggerRule[], emoteId: string): TriggerRule[] {
  const id = stickerRuleId(emoteId);
  return rules.filter((r) => r.id !== id
    && (r.conditions ?? []).some((c) => c.kind === 'sticker_ist' && c.value === emoteId));
}
