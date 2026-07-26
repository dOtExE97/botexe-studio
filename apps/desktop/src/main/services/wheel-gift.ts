// wheel-gift.ts — serverseitige Bindung „Bei welchem Geschenk drehen?": ein
// Glücksrad-Widget trägt optional einen Gift-Slug als Prop (spinGift). Kommt
// genau dieses Geschenk an, soll das Rad automatisch drehen — ohne dass dafür
// eine Trigger-Regel angelegt werden muss (die würde in der Regel-Liste des
// Nutzers als Fremdkörper auftauchen). Pure Logik, kein I/O — testbar.
export type WheelLayer = { id: string; widgetType: string; visible: boolean; props?: Record<string, unknown> };

/** IDs sichtbarer Rad-Widgets, deren spinGift-Prop auf diesen Gift-Slug passt. */
export function matchingWheelSpins(layers: WheelLayer[], giftSlug: string): string[] {
  const slug = String(giftSlug || '');
  if (!slug) return [];
  return layers
    .filter((l) => l.widgetType === 'wheel' && l.visible && String(l.props?.spinGift || '') === slug)
    .map((l) => l.id);
}
