// OverlayHealthBanner — die drei „Overlay ist still tot"-Fälle, bei denen die
// App selbst gar nichts falsch findet, aber im Stream NICHTS vom Overlay zu
// sehen ist:
//   1. Der Overlay-Server ist von seinem Standard-Port (27415) auf einen
//      anderen ausgewichen (Port belegt) — ein alter OBS/TTLS-Link zeigt dann
//      für immer auf die falsche Adresse.
//   2. TikTok ist verbunden, aber seit einer Weile hat sich keine einzige
//      Browser-Quelle am Overlay-Server gemeldet.
//   3. Der TikTok-Live-Studio-Link (localtest.me → 127.0.0.1) löst auf diesem
//      Rechner nicht mehr auf (DNS-Filter/VPN/Router-Update) — nur relevant,
//      wenn der Streamer die TTLS-Route überhaupt nutzt.
// Gleiches Look&Feel wie UpdateBanner: unten rechts, dismissible, kein Nagging
// (Grace-Periods + Bedingungen verschwinden von selbst, wenn sie nicht mehr
// zutreffen — ein Dismiss taucht erst wieder auf, wenn der Fall neu eintritt).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Copy, X } from 'lucide-react';
import { OVERLAY_PORT } from '../../shared/constants';

const POLL_MS = 45_000;
/** Case 2: erst nach ein paar Minuten warnen — kurze 0-Client-Phasen bei
 *  Szenenwechsel/Reconnect sind normal und kein Grund zum Nörgeln. */
const NO_CLIENT_GRACE_MS = 3 * 60_000;
/** Case 3: einen Poll-Zyklus überleben lassen, bevor gewarnt wird — ein
 *  einzelner DNS-Ausrutscher ist kein „TTLS ist kaputt". */
const TTLS_GRACE_MS = 60_000;

export const TTLS_COPIED_KEY = 'bx-ttls-link-copied';

/** Von den Copy-Aktionen (OverlayPage, App-Topbar) aufgerufen, sobald der User
 *  sich EINMAL den TTLS-Link geholt hat — Signal „nutzt vermutlich TTLS". */
export function markTtlsLinkUsed(): void {
  try { localStorage.setItem(TTLS_COPIED_KEY, '1'); } catch { /* egal, Storage optional */ }
}

function hasTtlsBeenUsedBefore(): boolean {
  try { return localStorage.getItem(TTLS_COPIED_KEY) === '1'; } catch { return false; }
}

interface Diag { port: number; clientCount: number; platformConnected: boolean; overlayUrl: string }
interface TtlsInfo { ready: boolean; hostsEntry: boolean }

// ── Reine Entscheidungs-Logik (DOM-frei, testbar) ──────────────────────────

/** Case 1: Server lauscht NICHT auf dem konfigurierten Standard-Port. */
export function isPortMismatch(diag: Pick<Diag, 'port'>): boolean {
  return diag.port !== OVERLAY_PORT;
}

/** Case 2 (roh, ohne Grace-Period): live verbunden, aber niemand hört zu. */
export function isOverlayEmptyWhileLive(diag: Pick<Diag, 'clientCount' | 'platformConnected'>): boolean {
  return diag.platformConnected && diag.clientCount === 0;
}

/** Ist der TTLS-Weg für diesen Nutzer überhaupt relevant? Bewusst GROSSZÜGIG:
 *  entweder wurde der hosts-Fallback installiert, ODER der Nutzer hat
 *  irgendwann den TTLS-Link kopiert (Domain-Auflösung kann ohne hosts-Eintrag
 *  klappen — dann bliebe er sonst unentdeckt als „nutzt TTLS nicht"). */
export function isTtlsRelevant(hostsEntry: boolean, copiedBefore: boolean): boolean {
  return hostsEntry || copiedBefore;
}

/** Case 3 (roh, ohne Grace-Period): TTLS wird genutzt, löst aber nicht mehr auf. */
export function isTtlsBroken(ttls: TtlsInfo, copiedBefore: boolean): boolean {
  return isTtlsRelevant(ttls.hostsEntry, copiedBefore) && !ttls.ready;
}

/** Trackt, seit wann eine Bedingung ununterbrochen wahr ist (null = gerade falsch). */
export function persistedSince(current: boolean, since: number | null, now: number): number | null {
  if (!current) return null;
  return since ?? now;
}

/** Ist eine seit `since` andauernde Bedingung schon lange genug wahr, um zu warnen? */
export function graceElapsed(since: number | null, now: number, graceMs: number): boolean {
  return since !== null && now - since >= graceMs;
}

// ── Komponente ──────────────────────────────────────────────────────────────

function useDismissableCase(rawActive: boolean): [boolean, () => void] {
  // Zeigt an, solange rawActive UND nicht dismissed. Ein Dismiss gilt nur für
  // DIESES Auftreten — fällt die Bedingung weg und kommt später wieder, wird
  // erneut gewarnt (kein dauerhaftes Stummschalten).
  const [dismissed, setDismissed] = useState(false);
  const prevActive = useRef(rawActive);
  useEffect(() => {
    if (rawActive && !prevActive.current) setDismissed(false); // false→true: neu aufgetreten
    prevActive.current = rawActive;
  }, [rawActive]);
  return [rawActive && !dismissed, () => setDismissed(true)];
}

export default function OverlayHealthBanner() {
  const [diag, setDiag] = useState<Diag | null>(null);
  const noClientSinceRef = useRef<number | null>(null);
  const ttlsBadSinceRef = useRef<number | null>(null);
  const [noClientGrace, setNoClientGrace] = useState(false);
  const [ttlsGrace, setTtlsGrace] = useState(false);

  useEffect(() => {
    let alive = true;
    const poll = () => {
      void (window.studio.getDiagnostics() as Promise<Diag>).then((d) => {
        if (!alive) return;
        setDiag(d);
        const now = Date.now();
        noClientSinceRef.current = persistedSince(isOverlayEmptyWhileLive(d), noClientSinceRef.current, now);
        setNoClientGrace(graceElapsed(noClientSinceRef.current, now, NO_CLIENT_GRACE_MS));
      }).catch(() => { /* nächster Poll versucht's wieder */ });
      void (window.studio.getTtlsLink() as Promise<TtlsInfo>).then((t) => {
        if (!alive) return;
        const now = Date.now();
        const broken = isTtlsBroken(t, hasTtlsBeenUsedBefore());
        ttlsBadSinceRef.current = persistedSince(broken, ttlsBadSinceRef.current, now);
        setTtlsGrace(graceElapsed(ttlsBadSinceRef.current, now, TTLS_GRACE_MS));
      }).catch(() => { /* egal, nächster Poll */ });
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const portBad = diag ? isPortMismatch(diag) : false;
  const [showPort, dismissPort] = useDismissableCase(portBad);
  const [showNoClient, dismissNoClient] = useDismissableCase(noClientGrace);
  const [showTtls, dismissTtls] = useDismissableCase(ttlsGrace);

  if (!showPort && !showNoClient && !showTtls) return null;

  const goTo = (page: string) => window.dispatchEvent(new CustomEvent('bx-navigate', { detail: page }));

  return (
    <div className="fixed bottom-24 right-4 z-[1000] flex max-w-sm flex-col gap-3">
      {showPort && diag && (
        <Card onDismiss={dismissPort}>
          <div className="font-bold text-studio-text">Overlay läuft auf einem anderen Port</div>
          <div className="mt-0.5 text-xs text-studio-muted">
            Port {OVERLAY_PORT} war belegt (z.B. ein alter bOtExE-Prozess oder ein anderes Programm) — der
            Overlay-Server ist auf Port {diag.port} ausgewichen. Steckt in OBS/TikTok Live Studio noch der
            alte Link, bleibt die Browser-Quelle für immer durchsichtig.
          </div>
          <div className="mt-2.5 flex gap-2">
            <button
              onClick={() => void window.studio.copyText(diag.overlayUrl)}
              className="bx-btn-accent text-xs"
            >
              <Copy size={12} className="inline" /> Link neu kopieren
            </button>
          </div>
        </Card>
      )}
      {showNoClient && (
        <Card onDismiss={dismissNoClient}>
          <div className="font-bold text-studio-text">Kein Overlay im Stream sichtbar</div>
          <div className="mt-0.5 text-xs text-studio-muted">
            Du bist seit einigen Minuten mit TikTok verbunden, aber keine Browser-Quelle hat sich am
            Overlay-Server gemeldet. Vermutlich fehlt in OBS/TikTok Live Studio die Browser-Quelle mit dem
            Overlay-Link, oder sie zeigt auf die falsche Adresse — im Stream ist dann nichts von deinem
            Overlay zu sehen.
          </div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => goTo('diagnose')} className="bx-btn-accent text-xs">Diagnose öffnen</button>
          </div>
        </Card>
      )}
      {showTtls && (
        <Card onDismiss={dismissTtls}>
          <div className="font-bold text-studio-text">TikTok-Studio-Link funktioniert gerade nicht</div>
          <div className="mt-0.5 text-xs text-studio-muted">
            localtest.me löst auf diesem Rechner gerade nicht mehr zu 127.0.0.1 auf (DNS-Filter, VPN, Router-
            oder Windows-Update können das ändern) — dein TikTok-Live-Studio-Overlay bleibt deshalb leer,
            auch wenn OBS ganz normal weiterläuft.
          </div>
          <div className="mt-2.5 flex gap-2">
            <button onClick={() => goTo('settings')} className="bx-btn-accent text-xs">Einstellungen öffnen</button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Card({ children, onDismiss }: { children: ReactNode; onDismiss: () => void }) {
  return (
    <div
      className="bx-card flex items-start gap-3 border-studio-accent/50 px-4 py-3 text-sm"
      style={{ animation: 'bx-toast-in 220ms cubic-bezier(.2,1.4,.35,1)' }}
    >
      <AlertTriangle size={18} className="mt-0.5 flex-none text-studio-accent" />
      <div className="flex-1">{children}</div>
      <button onClick={onDismiss} className="flex-none text-studio-muted hover:text-studio-text" title="Ausblenden">
        <X size={15} />
      </button>
    </div>
  );
}
