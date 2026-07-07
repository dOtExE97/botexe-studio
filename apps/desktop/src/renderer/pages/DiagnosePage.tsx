// DiagnosePage — „Warum sehe ich mein Overlay nicht?". Zeigt den echten Zustand
// (Overlay-Server, verbundene Browser-Quellen, Key, letzter Broadcast, Overlay-
// Fehler) als Ampel-Checkliste + häufigste Ursachen. Löst die meisten OBS/TTLS-
// Konfigurationsfehler, ohne dass der Streamer im Log wühlen muss.
import { useCallback, useEffect, useState } from 'react';
import { Stethoscope, RefreshCw, Copy, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from '../components/ToastHost';

interface Diag {
  host: string; port: number; overlayUrl: string; clientCount: number;
  clients: { profileId: string; alive: boolean }[]; lastBroadcastAt: number;
  recentClientIssues: { at: number; text: string }[];
  keySet: boolean; connectMode: string; username: string;
  layoutCount: number; activeLayoutId: string;
}

function Row({ ok, warn, label, hint }: { ok: boolean; warn?: boolean; label: string; hint: string }) {
  const Icon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  const color = ok ? 'text-emerald-400' : warn ? 'text-amber-400' : 'text-studio-accent';
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-studio-raised/40 px-3 py-2.5">
      <Icon size={17} className={`mt-0.5 flex-none ${color}`} />
      <div>
        <div className="text-sm font-bold">{label}</div>
        <div className="text-[11px] text-studio-muted">{hint}</div>
      </div>
    </div>
  );
}

export default function DiagnosePage() {
  const [d, setD] = useState<Diag | null>(null);
  const [connected, setConnected] = useState(false);

  const load = useCallback(() => {
    void (window.studio.getDiagnostics() as Promise<Diag>).then(setD).catch(() => setD(null));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000); // live aktualisieren
    // Verbindungsstatus separat (kommt über den Status-Stream)
    const off = window.studio.onPlatformStatus((s: { status: string }) => setConnected(s.status === 'connected'));
    return () => { clearInterval(t); off(); };
  }, [load]);

  if (!d) return <div className="p-8 text-studio-muted">Lade Diagnose…</div>;

  const overlayConnected = d.clientCount > 0;
  const broadcastAgo = d.lastBroadcastAt ? Math.round((Date.now() - d.lastBroadcastAt) / 1000) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center gap-2">
        <Stethoscope size={20} className="text-studio-accent" />
        <h1 className="text-lg font-bold">Diagnose — sehe ich mein Overlay?</h1>
        <button onClick={load} className="bx-pill ml-auto text-xs"><RefreshCw size={12} className="inline" /> Neu prüfen</button>
      </div>

      <div className="bx-card space-y-2 p-4">
        <Row ok label="Overlay-Server läuft" hint={`Lokal auf ${d.host}:${d.port} — die App liefert dein Overlay aus.`} />
        <Row
          ok={overlayConnected}
          label={overlayConnected ? `${d.clientCount} Overlay-Quelle(n) verbunden` : 'Keine Browser-Quelle verbunden'}
          hint={overlayConnected
            ? 'Mindestens ein OBS/TikTok-Live-Studio-Fenster hat dein Overlay offen. 👍'
            : 'DAS ist meist die Ursache: In OBS/TikTok Live Studio ist noch keine Browser-Quelle mit deinem Overlay-Link offen. Link unten kopieren und als Browser-Quelle einfügen.'}
        />
        <Row ok={d.keySet} label={d.keySet ? 'eulerstream-Key gesetzt' : 'Kein eulerstream-Key'} hint={d.keySet ? 'Verbindung zu TikTok ist möglich.' : 'Ohne Key keine TikTok-Verbindung — Einstellungen → TikTok-Verbindung → „Gratis-Key holen".'} />
        <Row ok={connected} warn={!connected && d.keySet} label={connected ? 'Mit TikTok verbunden' : 'Nicht mit TikTok verbunden'} hint={connected ? `Live-Events kommen rein (${d.connectMode}).` : 'Auf der Live-Seite verbinden. Steht dort „Warte auf Live", ist das kein Fehler.'} />
        <Row ok={d.layoutCount > 0} label={`${d.layoutCount} Overlay-Layout(s)`} hint={d.layoutCount > 0 ? 'Du hast mindestens ein Overlay gebaut.' : 'Noch kein Overlay — auf der Overlay-Seite eins zusammenstellen.'} />
      </div>

      <div className="bx-card p-4">
        <div className="mb-2 text-sm font-bold">Dein Overlay-Link</div>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded bg-studio-bg px-2.5 py-2 font-mono text-[11px] text-studio-teal">{d.overlayUrl}</code>
          <button onClick={() => { void window.studio.copyText(d.overlayUrl); toast('success', 'Link kopiert'); }} className="bx-btn-accent text-xs"><Copy size={12} className="inline" /> Kopieren</button>
        </div>
        <p className="mt-2 text-[11px] text-studio-muted">
          In OBS/TikTok Live Studio als <b>Browser-Quelle</b> einfügen (transparenter Hintergrund). Tipp: den fertigen Link findest du auch oben im Overlay-Editor.
          {broadcastAgo !== null && <> · Letztes Event ans Overlay: vor {broadcastAgo}s.</>}
        </p>
      </div>

      {d.recentClientIssues.length > 0 && (
        <div className="bx-card p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-amber-300"><AlertTriangle size={15} /> Letzte Overlay-Meldungen</div>
          <div className="space-y-1 font-mono text-[10px] text-studio-muted">
            {d.recentClientIssues.slice(-8).reverse().map((i, k) => <div key={k} className="truncate">{i.text}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}
