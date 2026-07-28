// wheel-gift.ts — serverseitige Bindung „Bei welchem Geschenk drehen?": ein
// Glücksrad-Widget trägt optional einen Gift-Slug als Prop (spinGift). Kommt
// genau dieses Geschenk an, soll das Rad automatisch drehen — ohne dass dafür
// eine Trigger-Regel angelegt werden muss (die würde in der Regel-Liste des
// Nutzers als Fremdkörper auftauchen). Pure Logik, kein I/O — testbar.
import { orderedGiftKeys, giftKey, type TriggerAction, type TriggerRule } from '@botexe/trigger-engine';
import { WIDGET_TIMING_DEFAULTS } from '../../shared/constants';

export type WheelLayer = { id: string; widgetType: string; visible: boolean; props?: Record<string, unknown> };

/** Sichtbare Rad-Widgets, deren spinGift-Prop auf diesen Gift-Slug passt (voller
 *  Layer statt nur ID — Task 3 braucht props.source/autoFire/spinMs fürs
 *  Auto-Feuern). */
export function matchingWheelLayers(layers: WheelLayer[], giftSlug: string): WheelLayer[] {
  // giftKey statt exaktem Vergleich: das eingestellte Geschenk und der Name im
  // Ereignis sind oft NICHT zeichengleich (Schreibweise, Apostroph,
  // Leerzeichen). Die Trigger-Engine matcht laengst tolerant — hier war es
  // buchstabengenau, also drehte das Rad bei genau demselben Geschenk nicht.
  const key = giftKey(giftSlug);
  if (!key) return [];
  return layers.filter(
    (l) => l.widgetType === 'wheel' && l.visible && giftKey(String(l.props?.spinGift || '')) === key,
  );
}

/** Eine für Studio.dispatchAction() fertig geplante Aktion. */
export type WheelSpinAction = { ruleId: string; action: TriggerAction };

/**
 * Task 3 (Auto-Feuern): plant für jedes zu diesem Gift passende Rad GENAU EINE
 * spin_wheel-Aktion — bei `props.source==='trigger' && props.autoFire===true`
 * zusätzlich die volle Aktionsliste des ausgelosten Gift-Triggers (verzögert
 * um spinMs). Der Gewinner-Index kommt aus orderedGiftKeys(rules) — demselben
 * Reihenfolge-/Dedup-Schlüssel, den das Rad-Widget für seine Segmente nutzt
 * (itemsFromRules in gift-menu.js) — und wird dem Rad per segmentIndex
 * mitgeschickt, damit es GARANTIERT auf dem Feld landet, dessen Aktion hier
 * gefeuert wird. Pure Funktion (kein setTimeout/Dispatch selbst) — Studio.ts
 * ruft nur noch dispatchAction() für jeden Eintrag auf: eine Entscheidungs-
 * stelle, kein Doppelfeuer (pro Rad genau 1 Spin + höchstens 1 Aktions-Satz).
 */
export function planWheelSpins(
  layers: WheelLayer[],
  giftSlug: string,
  rules: TriggerRule[],
  pickIndex: (count: number) => number = (count) => Math.floor(Math.random() * count),
): WheelSpinAction[] {
  const out: WheelSpinAction[] = [];
  for (const layer of matchingWheelLayers(layers, giftSlug)) {
    const p = layer.props ?? {};
    if (p.source === 'trigger' && p.autoFire === true) {
      const keys = orderedGiftKeys(rules);
      if (keys.length) {
        const idx = pickIndex(keys.length);
        const spinMs = Number(p.spinMs ?? WIDGET_TIMING_DEFAULTS.WHEEL_SPIN_MS);
        out.push({ ruleId: 'wheel-gift', action: { kind: 'spin_wheel', targetId: layer.id, segmentIndex: idx } });
        const rule = rules.find((r) => r.id === keys[idx]?.ruleId);
        if (rule) {
          for (const act of rule.actions) {
            out.push({ ruleId: rule.id, action: { ...act, delayMs: (act.delayMs ?? 0) + spinMs } });
          }
        }
        continue; // Rad hat schon deterministisch gedreht — nicht zusätzlich per roll
      }
    }
    out.push({ ruleId: 'wheel-gift', action: { kind: 'spin_wheel', targetId: layer.id } });
  }
  return out;
}
