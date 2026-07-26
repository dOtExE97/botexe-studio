// lucky-draw.ts — serverseitige Bindung „Bei welchem Geschenk ziehen?" für die
// Lucky-Card (Stück 4, Task 2). Spiegelt slot-gift.ts: ein Geschenke-Slider
// (gift-menu) trägt optional einen Gift-Slug als Prop (luckyGift). Kommt genau
// dieses Geschenk an, sollen die Karten shuffeln — Gewinn/Niete und
// Gewinner-Karte entscheidet der SERVER (zentraler Zufall, planSlotOutcome
// aus slot-gift.ts, wiederverwendet), damit alle Overlay-Quellen (OBS + TTLS)
// dasselbe Ergebnis zeigen. Pure Logik, kein I/O — RNG wird injiziert,
// testbar. planLuckyDraws() ist so gebaut, dass Task 3 (Chat-Command-Auslöser)
// denselben Dispatch-Pfad wiederverwenden kann (siehe dort).
import { orderedGiftKeys, type TriggerAction, type TriggerRule } from '@botexe/trigger-engine';
import { planSlotOutcome } from './slot-gift';

export type LuckyLayer = { id: string; widgetType: string; visible: boolean; props?: Record<string, unknown> };

/**
 * Sichtbare Geschenke-Slider (gift-menu), deren luckyGift-Prop auf diesen
 * Gift-Slug passt UND bei denen Lucky-Draw aktiviert ist (luckyMode:true).
 * Anders als beim Automat gilt das für BEIDE Quellen (source:'trigger' UND
 * 'liste') — die Kartenzahl n kommt bei 'liste' aus den eigenen Einträgen
 * (props.items), bei 'trigger' aus orderedGiftKeys(rules); siehe
 * luckyCardCount(). Damit ist die Karten-Reihenfolge in jedem Fall dieselbe,
 * aus der auch das Widget seinen winnerIndex-Bereich ableitet.
 */
export function matchingLuckyLayers(layers: LuckyLayer[], giftSlug: string): LuckyLayer[] {
  const slug = String(giftSlug || '');
  if (!slug) return [];
  return layers.filter(
    (l) =>
      l.widgetType === 'gift-menu' &&
      l.visible &&
      l.props?.luckyMode === true &&
      String(l.props?.luckyGift || '') === slug,
  );
}

/**
 * Anzahl der Karten, aus denen dieser Geschenke-Slider seinen winnerIndex
 * ableitet — MUSS exakt der Karten-/Chip-Zahl entsprechen, die das Widget
 * selbst anzeigt (this.list.length in gift-menu.js), sonst zeigt der Server
 * einen winnerIndex, der beim Widget auf die falsche Karte fällt:
 * - source:'trigger' → orderedGiftKeys(rules).length (dieselbe Quelle, die
 *   das Widget bei source:'trigger' über itemsFromRules/loadRules anzeigt).
 * - sonst (source:'liste' oder fehlend) → Einträge aus props.items, gezählt
 *   mit DEMSELBEN Filter wie parseItems() in gift-menu.js: split('|'), trim,
 *   verwerfen wenn weder slug noch text vorhanden — muss zu parseItems in
 *   gift-menu.js passen (dort wird zusätzlich nach '::' zerlegt, für die
 *   reine Zählung reicht der Slug/Text-Check ohne '::').
 */
export function luckyCardCount(layer: LuckyLayer, rules: TriggerRule[]): number {
  const p = layer.props ?? {};
  if (String(p.source ?? 'liste') === 'trigger') return orderedGiftKeys(rules).length;
  return String(p.items || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const parts = s.split('::');
      const slug = (parts[0] ?? '').trim();
      const text = parts.slice(1).join('::').trim();
      return { slug, text };
    })
    .filter((it) => it.slug || it.text).length;
}

/** Eine für Studio.dispatchAction() fertig geplante Aktion. */
export type LuckyDrawAction = { ruleId: string; action: TriggerAction };

/**
 * Plant für jeden zu diesem Gift passenden Geschenke-Slider GENAU EINEN
 * lucky_draw-Dispatch (Gewinn/Niete + Gewinner-Index kommen zentral aus
 * planSlotOutcome, wiederverwendet von slot-gift.ts) — und bei Gewinn UND
 * source:'trigger' zusätzlich die volle Aktionsliste der ausgelosten
 * Gift-Regel, verzögert um die Zieh-Dauer (luckyDrawMs), damit sie erst
 * feuert, wenn die Karten stillstehen (identisches Muster zu planSlotSpins).
 * Bei source:'liste' gibt es keine Regel zum Feuern — die Karte trägt nur
 * einen freien Anzeigetext, keine Trigger-Aktion (Parität mit slot-gift.ts:
 * dort schließt matchingSlotLayers 'liste' ganz aus; hier ist 'liste' als
 * Quelle erlaubt, aber ohne Aktions-Feuern, weil es keine Regel gibt, die man
 * finden könnte). Pure Funktion (kein setTimeout/Dispatch selbst) —
 * studio.ts ruft nur noch dispatchAction() für jeden Eintrag auf: eine
 * Entscheidungsstelle, kein Doppelfeuer (pro Slider genau 1 Draw + höchstens
 * 1 Aktions-Satz).
 *
 * `who` ist der Nickname des Spenders, der den Draw ausgelöst hat (Studio.ts
 * reicht e.user?.nickname durch); optional, weil manche Aufrufer (Tests,
 * spätere Chat-Command-Auslöser in Task 3) keinen Absender haben.
 *
 * Task 3 (Chat-Command-Auslöser) kann denselben Pfad wiederverwenden: statt
 * über ein Gift-Event nur über matchingLuckyLayers() mit einem anderen
 * Auswahlkriterium (z. B. Command-Prop statt luckyGift) an diese Funktion
 * gehen — die Dispatch-/Aktions-Logik ab planSlotOutcome bleibt identisch.
 */
export function planLuckyDraws(
  layers: LuckyLayer[],
  giftSlug: string,
  rules: TriggerRule[],
  rng: () => number = Math.random,
  who?: string,
): LuckyDrawAction[] {
  const out: LuckyDrawAction[] = [];
  const keys = orderedGiftKeys(rules);
  for (const layer of matchingLuckyLayers(layers, giftSlug)) {
    const p = layer.props ?? {};
    const winChance = Number(p.luckyChance ?? 60) / 100;
    const n = luckyCardCount(layer, rules);
    const { win, winnerIndex } = planSlotOutcome(rng(), rng(), winChance, n);
    out.push({
      ruleId: 'lucky-draw',
      action: {
        kind: 'lucky_draw',
        targetId: layer.id,
        win,
        winnerIndex,
        roll: rng(),
        ...(who !== undefined ? { who } : {}),
      },
    });
    if (win && String(p.source ?? 'liste') === 'trigger') {
      // Default (3000) MUSS mit dem Fallback übereinstimmen, das die
      // Lucky-Card in gift-menu.js für ihre Shuffle-Dauer verwendet
      // (runLuckyDraw: `Math.max(600, Number(this.luckyDrawMs) || 3000)`) —
      // sonst feuert die Aktion zu einem anderen Zeitpunkt als die Karten im
      // Widget tatsächlich landen.
      const luckyDrawMs = Number(p.luckyDrawMs ?? 3000);
      const rule = rules.find((r) => r.id === keys[winnerIndex]?.ruleId);
      if (rule) {
        for (const act of rule.actions) {
          out.push({ ruleId: rule.id, action: { ...act, delayMs: (act.delayMs ?? 0) + luckyDrawMs } });
        }
      }
    }
  }
  return out;
}
