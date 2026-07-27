// useStudio.ts — zentrale Live-Daten der App-Shell: Verbindungs-Status,
// Event-Feed (gedeckelt), Session-Stats. Eine Subscription pro App-Lebenszeit.
import { useEffect, useRef, useState } from 'react';
import type { StudioEvent } from '@botexe/trigger-engine';
import type { StatsSnapshot } from '../../main/core/session-stats';
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
    const unsubStats = window.studio.onStats((s) => setStats(s as unknown as StatsSnapshot));
    void window.studio.getOverlayInfo().then((info: { url: string }) => setOverlayUrl(info.url));
    return () => {
      unsubStatus();
      unsubBus();
      unsubStats();
    };
  }, []);

  return { status, feed, stats, overlayUrl };
}
