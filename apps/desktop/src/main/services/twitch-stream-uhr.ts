// twitch-stream-uhr.ts — erkennt aus dem Twitch-Status, wann ein NEUER Stream
// beginnt (→ Orakel-Kisten neu würfeln) und seit wann er läuft ({uptime}).
//
// Früher hing das an „live wird true, und vorher war nicht live". `live:false`
// kommt aber nur aus einem empfangenen `stream.offline`. Fehlt das (Leitung am
// Streamende tot, PC im Ruhezustand, Twitch von Hand getrennt), war der
// nächste Stream kein „neuer" — alle behielten ihre Kisten von gestern, und
// !uptime meldete 26 Std. Jetzt zählt die Stream-ID aus `stream.online`
// (Belege 5.8): Jede neue ID ist ein neuer Stream.
import type { TwitchStatusInfo } from '../adapters/twitch-adapter';

export class TwitchStreamUhr {
  /** Seit wann live (ms) — 0: nicht live. */
  liveSeit = 0;
  /** Seit wann mit Twitch verbunden (ms) — 0: nicht verbunden. */
  verbundenSeit = 0;
  private streamId = '';

  /** Status mitschreiben. true = ein NEUER Stream hat begonnen. */
  melde(info: TwitchStatusInfo, jetzt: number): boolean {
    if (info.status === 'verbunden' && !this.verbundenSeit) this.verbundenSeit = jetzt;
    if (info.status === 'aus') this.verbundenSeit = 0;
    if (info.live === false) {
      this.liveSeit = 0;
      return false;
    }
    if (info.live !== true) return false;
    const id = info.streamId ?? '';
    const neu = !this.liveSeit || (id !== '' && id !== this.streamId);
    if (id) this.streamId = id;
    // Twitchs eigene Startzeit, wenn sie plausibel ist — sonst „jetzt".
    const start = typeof info.startedAt === 'number' && info.startedAt > 0 && info.startedAt <= jetzt ? info.startedAt : 0;
    if (neu) this.liveSeit = start || jetzt;
    return neu;
  }
}
