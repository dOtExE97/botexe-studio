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
    const unsubStatus = window.studio.onPlatformStatus((info) =>
      setStatus(info as AdapterStatusInfo),
    );
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
