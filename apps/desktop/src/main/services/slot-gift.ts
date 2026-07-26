// slot-gift.ts — serverseitige Bindung „Bei welchem Geschenk drehen?" für den
// Gambling-Automat (slot-machine). Spiegelt wheel-gift.ts: ein Slot-Widget
// trägt optional einen Gift-Slug als Prop (spinGift). Kommt genau dieses
// Geschenk an, sollen die Walzen drehen — Gewinn/Niete und Gewinner-Symbol
// entscheidet der SERVER (zentraler Zufall, siehe planSlotOutcome), damit
// alle Overlay-Quellen (OBS + TTLS) dasselbe Ergebnis zeigen. Pure Logik,
// kein I/O — RNG wird injiziert, testbar.
import { orderedGiftKeys, type TriggerAction, type TriggerRule } from '@botexe/trigger-engine';

export type SlotLayer = { id: string; widgetType: string; visible: boolean; props?: Record<string, unknown> };

/**
 * Sichtbare Automat-Widgets, deren spinGift-Prop auf diesen Gift-Slug passt —
 * NUR mit props.source==='trigger'. Grund (Parität): der Server-Gewinner-
 * Index (winnerIndex) kommt aus orderedGiftKeys(rules) — genau der Symbol-
 * Reihenfolge, die das Slot-Widget bei source:'trigger' selbst aus den
 * Trigger-Regeln anzeigt (itemsFromRules in slot-machine.js). Bei
 * source:'liste' zeigt das Widget eine EIGENE, freie Symbol-Liste — dort
 * würde ein server-gewürfelter winnerIndex auf ein falsches/zufälliges
 * Symbol zeigen. Also: 'liste'-Automaten bekommen (noch) keinen Server-Spin.
 */
export function matchingSlotLayers(layers: SlotLayer[], giftSlug: string): SlotLayer[] {
  const slug = String(giftSlug || '');
  if (!slug) return [];
  return layers.filter(
    (l) =>
      l.widgetType === 'slot-machine' &&
      l.visible &&
      String(l.props?.spinGift || '') === slug &&
      l.props?.source === 'trigger',
  );
}

/** Eine für Studio.dispatchAction() fertig geplante Aktion. */
export type SlotSpinAction = { ruleId: string; action: TriggerAction };

/**
 * Task 3 (Gewinn-Aktivierung): plant für jeden zu diesem Gift passenden
 * Automaten GENAU EINE spin_slot-Aktion (Gewinn/Niete + Gewinner-Index kommen
 * zentral aus planSlotOutcome) — und bei Gewinn zusätzlich die volle
 * Aktionsliste der ausgelosten Gift-Regel, verzögert um die Dreh-Dauer
 * (spinMs), damit sie erst feuert, wenn die Walzen stillstehen (identisches
 * Muster zu planWheelSpins/wheel-gift.ts). Pure Funktion (kein setTimeout/
 * Dispatch selbst) — Studio.ts ruft nur noch dispatchAction() für jeden
 * Eintrag auf: eine Entscheidungsstelle, kein Doppelfeuer (pro Automat genau
 * 1 Spin + höchstens 1 Aktions-Satz).
 */
export function planSlotSpins(
  layers: SlotLayer[],
  giftSlug: string,
  rules: TriggerRule[],
  rng: () => number = Math.random,
): SlotSpinAction[] {
  const out: SlotSpinAction[] = [];
  const keys = orderedGiftKeys(rules);
  for (const layer of matchingSlotLayers(layers, giftSlug)) {
    const p = layer.props ?? {};
    const winChance = Number(p.winChance ?? 60) / 100;
    const { win, winnerIndex } = planSlotOutcome(rng(), rng(), winChance, keys.length);
    out.push({
      ruleId: 'slot-gift',
      action: { kind: 'spin_slot', targetId: layer.id, win, winnerIndex, roll: rng() },
    });
    if (win) {
      const rule = rules.find((r) => r.id === keys[winnerIndex]?.ruleId);
      if (rule) {
        // Default (2000) MUSS mit widget-types.ts' slot-machine-Standard
        // übereinstimmen — sonst feuert die Aktion (unkonfiguriert) zu einem
        // anderen Zeitpunkt als die Walzen im Widget tatsächlich stoppen.
        const spinMs = Number(p.spinMs ?? 2000);
        for (const act of rule.actions) {
          out.push({ ruleId: rule.id, action: { ...act, delayMs: (act.delayMs ?? 0) + spinMs } });
        }
      }
    }
  }
  return out;
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
