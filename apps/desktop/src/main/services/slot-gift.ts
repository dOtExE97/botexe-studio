// slot-gift.ts — serverseitige Bindung „Bei welchem Geschenk drehen?" für den
// Gambling-Automat (slot-machine). Spiegelt wheel-gift.ts: ein Slot-Widget
// trägt optional einen Gift-Slug als Prop (spinGift). Kommt genau dieses
// Geschenk an, sollen die Walzen drehen — Gewinn/Niete und Gewinner-Symbol
// entscheidet der SERVER (zentraler Zufall, siehe planSlotOutcome), damit
// alle Overlay-Quellen (OBS + TTLS) dasselbe Ergebnis zeigen. Pure Logik,
// kein I/O — RNG wird injiziert, testbar.

export type SlotLayer = { id: string; widgetType: string; visible: boolean; props?: Record<string, unknown> };

/** Sichtbare Automat-Widgets, deren spinGift-Prop auf diesen Gift-Slug passt. */
export function matchingSlotLayers(layers: SlotLayer[], giftSlug: string): SlotLayer[] {
  const slug = String(giftSlug || '');
  if (!slug) return [];
  return layers.filter(
    (l) => l.widgetType === 'slot-machine' && l.visible && String(l.props?.spinGift || '') === slug,
  );
}

/**
 * Entscheidet Gewinn/Niete + Gewinner-Symbol rein aus injizierten Würfen
 * (rollWin, rollPick ∈ [0,1)) — kein Math.random() hier, das würfelt studio.ts
 * zentral, damit alle Overlay-Quellen (OBS + TTLS) dasselbe Ergebnis zeigen.
 * winChance wird auf 0..1 geklemmt (Tippfehler in der Konfiguration dürfen
 * nicht crashen). n<=0 (keine Gift-Symbole konfiguriert) ⇒ nie Gewinn,
 * winnerIndex 0 — sicher statt Absturz.
 */
export function planSlotOutcome(
  rollWin: number,
  rollPick: number,
  winChance: number,
  n: number,
): { win: boolean; winnerIndex: number } {
  const chance = Math.max(0, Math.min(1, winChance));
  if (n <= 0) return { win: false, winnerIndex: 0 };
  const win = rollWin < chance;
  const winnerIndex = Math.floor(rollPick * n);
  return { win, winnerIndex };
}
