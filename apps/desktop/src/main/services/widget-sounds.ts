// widget-sounds.ts — Sounds, die direkt an Widgets hängen (Feuerwerk-Knall,
// Rad-Drehen, Alert-Sound). Abgespielt wird IMMER lokal über die App (nie im
// Overlay-Browser) — so gibt es keinen Doppel-Ton, wenn das Overlay in OBS
// UND TikTok Live Studio gleichzeitig offen ist. Pure Logik, testbar.
import type { OverlayLayout } from '@botexe/overlay-engine';

/** Widgets, deren soundId bei einem Gift-Event SOFORT (server-seitig) feuert.
 *  gift-fireworks NICHT mehr hier: das spielt Pfeife/Boom selbst, zeitlich
 *  an die Animation gekoppelt (ctx.playSound → WS-Backchannel). */
const GIFT_SOUND_WIDGETS = new Set(['gift-alert']);

/** Sound-IDs, die für dieses Gift abgespielt werden sollen — über alle
 *  Profile gesammelt und dedupliziert (Widget in 2 Profilen = 1× Ton). */
export function collectGiftSounds(layouts: OverlayLayout[], totalCoins: number): string[] {
  const out = new Set<string>();
  for (const layout of layouts) {
    for (const layer of layout.layers) {
      if (!layer.visible || !GIFT_SOUND_WIDGETS.has(layer.widgetType)) continue;
      const props = (layer.props ?? {}) as { soundId?: unknown; minCoins?: unknown };
      const soundId = typeof props.soundId === 'string' ? props.soundId : '';
      if (!soundId) continue;
      const minCoins = Number(props.minCoins ?? 0);
      if (totalCoins < minCoins) continue;
      out.add(soundId);
    }
  }
  return [...out];
}

export interface WheelSounds {
  spin: string;
  result: string;
  spinMs: number;
}

/** Sounds des Ziel-Glücksrads (spin sofort, result nach spinMs). */
export function findWheelSounds(layouts: OverlayLayout[], targetId: string): WheelSounds | null {
  for (const layout of layouts) {
    for (const layer of layout.layers) {
      if (layer.id !== targetId || layer.widgetType !== 'wheel') continue;
      const props = (layer.props ?? {}) as { spinSoundId?: unknown; resultSoundId?: unknown; spinMs?: unknown };
      return {
        spin: typeof props.spinSoundId === 'string' ? props.spinSoundId : '',
        result: typeof props.resultSoundId === 'string' ? props.resultSoundId : '',
        spinMs: Math.max(2000, Number(props.spinMs ?? 5000)),
      };
    }
  }
  return null;
}
