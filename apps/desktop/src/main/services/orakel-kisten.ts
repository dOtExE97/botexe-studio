// orakel-kisten.ts — die Kisten des Piraten-Orakels, gewürfelt im
// Hauptprozess. Bisher würfelte jedes Overlay-Widget selbst: Die App kannte
// die Zahl nicht (kein `!kiste` möglich), und OBS und TTLS zeigten demselben
// Follower zwei verschiedene Kisten.
//
// Jetzt: Bei einem Twitch-Follow würfelt die App EINMAL je Zuschauer und
// Stream (dieselbe Funktion wie das Widget, packages/widget-kit/orakel-kiste.js),
// merkt sich die Zahl bis „Session zurücksetzen"/neuer Stream und hängt sie als
// `event.orakel` ans Ereignis, bevor die Overlays es bekommen. Entfolgen und
// neu Folgen würfelt nicht neu.
//
// Test-Ereignisse (synthetic) würfeln JEDES MAL frisch und werden nicht
// gemerkt — so lässt sich das Orakel beliebig oft testen, und ein Test mit
// einer echten Zuschauer-ID verbraucht nicht dessen Kiste für den Abend.
// TikTok-Follows bleiben unberührt (dort würfelt das Widget wie bisher mit
// seinen eigenen Einstellungen).
import { wuerfleKiste, ORAKEL_CHANCE, ORAKEL_GLUECK, ORAKEL_MAX, type StudioEvent } from '@botexe/trigger-engine';
import { TWITCH_ANONYM_ID } from '../adapters/twitch-normalize';

export interface OrakelWurf { kiste: number; glueck: boolean; chance: number }

/** Werte aus den Einstellungen auf dieselben Grenzen wie im Widget bringen. */
export function orakelGrenzen(chance: unknown, glueck: unknown): { chance: number; glueck: number } {
  const c = Math.floor(Number(chance));
  const g = Math.floor(Number(glueck));
  return {
    chance: Number.isFinite(c) && c >= 2 ? Math.min(ORAKEL_MAX, c) : ORAKEL_CHANCE,
    glueck: Number.isFinite(g) && g >= 0 ? Math.min(ORAKEL_MAX, g) : ORAKEL_GLUECK,
  };
}

/** Würfelt die App für dieses Ereignis? Nur Twitch-Follows mit echtem Zuschauer. */
export function sollOrakelWuerfeln(e: StudioEvent): boolean {
  return e.type === 'follow' && e.plattform === 'twitch' && !!e.user?.id && e.user.id !== TWITCH_ANONYM_ID;
}

export class OrakelKisten {
  private kisten = new Map<string, OrakelWurf>();

  constructor(private readonly zufall: () => number = Math.random) {}

  /** Kiste für einen Follow (oder null, wenn die App hier nicht würfelt). */
  fuerFollow(e: StudioEvent, einstellung: { chance: unknown; glueck: unknown }): OrakelWurf | null {
    if (!sollOrakelWuerfeln(e) || !e.user) return null;
    const id = e.user.id;
    if (!e.synthetic) {
      const schon = this.kisten.get(id);
      if (schon) return schon;
    }
    const { chance, glueck } = orakelGrenzen(einstellung.chance, einstellung.glueck);
    const kiste = wuerfleKiste(chance, this.zufall);
    const wurf: OrakelWurf = { kiste, glueck: kiste <= glueck, chance };
    if (!e.synthetic) this.kisten.set(id, wurf);
    return wurf;
  }

  /** Kiste eines Zuschauers in diesem Stream (null: noch keine). */
  kisteVon(userId: string | undefined): number | null {
    return userId ? this.kisten.get(userId)?.kiste ?? null : null;
  }

  anzahl(): number { return this.kisten.size; }

  /** Neuer Stream / Session zurückgesetzt → alle würfeln neu. */
  reset(): void { this.kisten.clear(); }
}
