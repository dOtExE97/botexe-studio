// level-up-waechter.ts — Teamherz-Level-Up erkennen, auch wenn TikTok keinen Banner schickt.
//
// Zwei Quellen melden dasselbe Ereignis: der Banner („X ist auf Stufe 7") und
// das Teamherz-Abzeichen, das an jeder Nachricht des Zuschauers hängt. Der
// Banner kommt nicht immer; das Abzeichen verrät den Anstieg trotzdem. Damit
// nicht beide auslösen, merkt sich der Wächter, welche Stufe er zuletzt sah und
// welche Banner er in der letzten Minute schon gemeldet bekam.

import type { StudioEvent } from '@botexe/trigger-engine';
import { log } from './logger';

/** So lange gilt ein gemeldetes Level-Up als „läuft schon" (Banner und
 *  Abzeichen kommen oft Sekunden nacheinander, aber nie Minuten). */
const DEDUP_MS = 60_000;

export class LevelUpWaechter {
  /** Höchste gesehene Stufe je Zuschauer in dieser Sitzung. */
  private letzte = new Map<string, number>();
  /** Gemeldete Level-Ups: "userId:stufe" → Zeitpunkt. */
  private gemeldet = new Map<string, number>();

  /** Abzeichen gesehen. Liefert die neue Stufe, wenn sie gegenüber der letzten
   *  Sichtung in dieser Sitzung gestiegen ist; Erstsichtung → null. */
  sieheStufe(userId: string, stufe: number, _ts: number): number | null {
    const bisher = this.letzte.get(userId);
    if (bisher === undefined) {
      this.letzte.set(userId, stufe);
      return null;
    }
    if (stufe <= bisher) return null;
    this.letzte.set(userId, stufe);
    return stufe;
  }

  /** Level-Up gemeldet (Banner, oder das aus dem Abzeichen abgeleitete Ereignis);
   *  merkt sich (userId, stufe, ts) fürs Dedup und als letzte Stufe. */
  vonBanner(userId: string, stufe: number, ts: number): void {
    this.gemeldet.set(`${userId}:${stufe}`, ts);
    if (stufe > (this.letzte.get(userId) ?? -1)) this.letzte.set(userId, stufe);
    // Alte Einträge wegräumen, damit die Liste in langen Streams nicht wächst.
    if (this.gemeldet.size > 500) {
      for (const [k, t] of this.gemeldet) if (ts - t > DEDUP_MS) this.gemeldet.delete(k);
    }
  }

  /** true, wenn für userId+stufe in den letzten 60 000 ms schon ein Level-Up lief. */
  istDoppelt(userId: string, stufe: number, ts: number): boolean {
    const t = this.gemeldet.get(`${userId}:${stufe}`);
    return t !== undefined && ts - t <= DEDUP_MS;
  }

  reset(): void {
    this.letzte.clear();
    this.gemeldet.clear();
  }
}

/** Bus-Vorfilter: Teamherz-Level-Up aus zwei Quellen zu einem Ereignis machen.
 *  Läuft VOR allen Abonnenten (auch dem Overlay-Server), Rückgabe false = verwerfen.
 *  - Banner-Level-Up (Teamherz): merken; kam dasselbe in der letzten Minute
 *    schon (z.B. über das Abzeichen), wird es verworfen.
 *  - Jedes andere echte Ereignis mit Teamherz-Stufe: steigt die Stufe
 *    gegenüber der letzten Sichtung, wird ein Level-Up veröffentlicht —
 *    unmarkiert (`synthetic` hieße „Test"). Es läuft selbst wieder durch
 *    diesen Filter; dort wird es nur gemerkt, löst aber nichts Neues aus.
 *  - Test- (synthetic) und Replay-Ereignisse (sticky) füttern den Wächter nie.
 *  Das Fenster ist einseitig: Kommt der Banner MEHR als 60 s nach dem aus dem
 *  Abzeichen abgeleiteten Level-Up, gilt er als neues Ereignis.
 *  Es gibt nur EINEN Vorfilter-Platz am Bus (EventBus.setVorfilter). */
export function erzeugeLevelUpVorfilter(
  waechter: LevelUpWaechter,
  veroeffentliche: (e: StudioEvent) => void,
): (e: StudioEvent) => boolean {
  return (e) => {
    if (e.synthetic || e.sticky) return true;
    const user = e.user;
    if (e.type === 'level_up') {
      if (e.levelUp?.art !== 'team' || !user) return true;
      if (waechter.istDoppelt(user.id, e.levelUp.neu, e.ts)) {
        log.debug('TikTok', `Teamherz-Level-Up von ${user.nickname} (Stufe ${e.levelUp.neu}) war schon gemeldet — übersprungen`);
        return false;
      }
      waechter.vonBanner(user.id, e.levelUp.neu, e.ts);
      return true;
    }
    const stufe = user?.teamLevel ?? 0;
    if (user && stufe > 0) {
      const neu = waechter.sieheStufe(user.id, stufe, e.ts);
      if (neu !== null && !waechter.istDoppelt(user.id, neu, e.ts)) {
        // Plattform des Auslösers erben — sonst ginge ein TikTok-Level-Up als
        // „gilt für alle" auch ins Twitch-Overlay.
        const levelUp: StudioEvent = {
          type: 'level_up', ts: e.ts, user, levelUp: { art: 'team', neu },
          ...(e.plattform ? { plattform: e.plattform } : {}),
        };
        // Erst das auslösende Ereignis zustellen, dann das Level-Up.
        queueMicrotask(() => veroeffentliche(levelUp));
      }
    }
    return true;
  };
}
