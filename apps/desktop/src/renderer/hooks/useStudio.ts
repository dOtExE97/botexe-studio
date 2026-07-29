// useStudio.ts — zentrale Live-Daten der App-Shell: Verbindungs-Status,
// Event-Feed (gedeckelt), Session-Stats. Eine Subscription pro App-Lebenszeit.
import { useEffect, useRef, useState } from 'react';
import type { StudioEvent } from '@botexe/trigger-engine';
import type { StatsSnapshot } from '../../main/core/session-stats';
import type { RangStand } from '../../main/adapters/tiktok-rank';

/** Ein Messpunkt der Verlaufs-Kurven. */
export interface VerlaufPunkt {
  at: number;
  coins: number;
  likes: number;
  viewers: number;
}

/** Abstand zwischen zwei Messpunkten. 20 s × 90 Punkte = 30 Minuten Rückschau —
 *  lang genug, um zu sehen ob's läuft, kurz genug um aktuell zu wirken. */
const VERLAUF_TAKT_MS = 20_000;
const VERLAUF_MAX = 90;
import type { AdapterStatusInfo } from '../../main/adapters/tiktok-adapter';

const FEED_MAX = 60;

export interface FeedEntry {
  key: number;
  event: StudioEvent;
}

export function useStudio() {
  const [status, setStatus] = useState<AdapterStatusInfo>({
    status: 'disconnected',
    isReconnect: false,
  });
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [overlayUrl, setOverlayUrl] = useState('');
  // Verlauf der wichtigsten Zahlen — für die Mini-Kurven auf der Live-Seite.
  // Absichtlich HIER und nicht in der Seite: Beim Wechseln auf Trigger und
  // zurück wäre der Verlauf sonst jedes Mal weg.
  const [verlauf, setVerlauf] = useState<VerlaufPunkt[]>([]);
  // Ranglisten-Platz (Push + Pull, siehe constants.ts).
  const [rang, setRang] = useState<RangStand | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    // P1-3: der Main-Prozess kann VOR diesem Mount schon einen Status gepusht
    // haben (Auto-Live-Watch läuft während studio.start(), noch vor
    // createMainWindow() — siehe main.ts) — dieser erste Push geht ins Leere,
    // weil hier noch niemand zuhört. Ohne Gegenmaßnahme bliebe die UI dauerhaft
    // bei "disconnected" hängen, obwohl im Hintergrund längst gewartet/verbunden
    // wird (und "Verbinden" würde fälschlich einen zweiten, unnötigen Connect
    // auslösen statt korrekt zu erkennen, dass schon gewartet wird).
    //
    // Fix: zusätzlich zum Push den Ist-Stand EINMAL abholen (Pull). Reihenfolge
    // Push-Subscribe → Pull, mit "pushedSincePull"-Wächter: kommt zwischen
    // Subscribe und Pull-Antwort noch ein echter Push rein, gewinnt IMMER der
    // (neuere) Push — sonst könnte die spät ankommende Pull-Antwort einen
    // frischeren Push wieder überschreiben (Race in der Gegenrichtung).
    let pushedSincePull = false;
    const unsubStatus = window.studio.onPlatformStatus((info) => {
      pushedSincePull = true;
      setStatus(info as AdapterStatusInfo);
    });
    void window.studio.getPlatformStatus().then((info) => {
      if (!pushedSincePull) setStatus(info as AdapterStatusInfo);
    });
    const unsubBus = window.studio.onBusEvent((e) => {
      setFeed((prev) => {
        const next = [...prev, { key: keyRef.current++, event: e as unknown as StudioEvent }];
        return next.length > FEED_MAX ? next.slice(next.length - FEED_MAX) : next;
      });
    });
    const unsubStats = window.studio.onStats((s) => {
      const snap = s as unknown as StatsSnapshot;
      setStats(snap);
      // Nur alle VERLAUF_TAKT_MS einen Punkt merken: Die Statistik kommt bei
      // jedem Ereignis, im Rosen-Regen also dutzendfach pro Sekunde. Ungefiltert
      // wäre die Kurve nach einer Minute voll und würde nur Sekunden zeigen.
      setVerlauf((prev) => {
        const jetzt = Date.now();
        const letzter = prev[prev.length - 1];
        if (letzter && jetzt - letzter.at < VERLAUF_TAKT_MS) return prev;
        const punkt: VerlaufPunkt = {
          at: jetzt,
          coins: snap.totals.coins,
          likes: snap.totals.likes,
          viewers: snap.totals.viewers,
        };
        const next = [...prev, punkt];
        return next.length > VERLAUF_MAX ? next.slice(next.length - VERLAUF_MAX) : next;
      });
    });
    let rangGepusht = false;
    const unsubRank = window.studio.onRankStatus?.((r) => { rangGepusht = true; setRang(r); });
    void window.studio.getRank?.().then((r) => { if (!rangGepusht && r) setRang(r); }).catch(() => { /* optional */ });
    void window.studio.getOverlayInfo().then((info: { url: string }) => setOverlayUrl(info.url));
    return () => {
      unsubStatus();
      unsubBus();
      unsubStats();
      unsubRank?.();
    };
  }, []);

  return { status, feed, stats, overlayUrl, verlauf, rang };
}
