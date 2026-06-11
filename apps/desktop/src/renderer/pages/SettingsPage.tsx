// SettingsPage — App-Einstellungen: Loyalty-Punkte-Regeln, App-Infos,
// Datenordner, Punkte-Reset.
import { useEffect, useState } from 'react';

interface PointsConfig {
  enabled: boolean;
  perChat: number;
  perFollow: number;
  perLike: number;
  perCoin: number;
  currencyName: string;
}

interface AppInfo {
  version: string;
  electron: string;
  node: string;
  platform: string;
  dataDir: string;
  overlayPort: number;
}

export default function SettingsPage() {
  const [points, setPoints] = useState<PointsConfig | null>(null);
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    void window.studio.getSettings().then((s: { points: PointsConfig }) => setPoints(s.points));
    void window.studio.getAppInfo().then((i: AppInfo) => setInfo(i));
  }, []);

  const updatePoints = (patch: Partial<PointsConfig>) => {
    if (!points) return;
    const next = { ...points, ...patch };
    setPoints(next);
    void window.studio.updateSettings({ points: patch });
  };

  const numField = (key: keyof PointsConfig, label: string, hint?: string) => (
    <label className="text-[10px] uppercase tracking-widest text-studio-muted">
      {label}
      <input
        type="number"
        min={0}
        value={points ? (points[key] as number) : 0}
        onChange={(e) => updatePoints({ [key]: Math.max(0, Number(e.target.value)) } as Partial<PointsConfig>)}
        className="mt-1 w-full border border-studio-border bg-studio-raised px-2 py-1.5 font-mono text-xs outline-none focus:border-studio-accent"
      />
      {hint && <span className="mt-0.5 block text-[9px] normal-case tracking-normal text-studio-muted/70">{hint}</span>}
    </label>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-5 p-6">
      <div>
        <h1 className="font-display text-lg uppercase">Einstellungen</h1>
        <p className="mt-1 text-xs text-studio-muted">Loyalty-Punkte, App-Infos und Daten.</p>
      </div>

      {/* Loyalty-Punkte */}
      <section className="border border-studio-border bg-studio-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-studio-gold">Loyalty-Punkte</h2>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={points?.enabled ?? false}
              onChange={(e) => updatePoints({ enabled: e.target.checked })}
              className="accent-[#ffd23e]"
            />
            Punkte sammeln aktiv
          </label>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-studio-muted">
          Zuschauer sammeln über alle Streams hinweg Punkte für Aktivität. Anzeigen via Widget „Punkte-Bestenliste".
          Das ist die Währungs-Basis für das spätere Stream-Kartenspiel.
        </p>
        {points && (
          <div className="grid grid-cols-3 gap-3">
            <label className="text-[10px] uppercase tracking-widest text-studio-muted">
              Name der Währung
              <input
                value={points.currencyName}
                onChange={(e) => updatePoints({ currencyName: e.target.value })}
                className="mt-1 w-full border border-studio-border bg-studio-raised px-2 py-1.5 text-xs outline-none focus:border-studio-accent"
              />
            </label>
            {numField('perChat', 'pro Chat-Nachricht')}
            {numField('perFollow', 'pro Follow / Share')}
            {numField('perCoin', 'pro Gift-Coin', 'z.B. 1 = ein Punkt je Coin')}
            {numField('perLike', 'pro Like', '0 = Likes geben nichts')}
          </div>
        )}
        <button
          onClick={() => void window.studio.resetPoints()}
          className="clip-slant mt-4 border border-studio-accent/40 bg-studio-accent/10 px-4 py-2 text-xs font-bold text-studio-accent hover:bg-studio-accent hover:text-black"
        >
          Alle Punkte zurücksetzen
        </button>
      </section>

      {/* App-Info */}
      <section className="border border-studio-border bg-studio-panel p-4">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.3em] text-studio-muted">Über bOtExE Studio</h2>
        {info && (
          <div className="grid grid-cols-2 gap-y-2 font-mono text-xs text-studio-text/90">
            <span className="text-studio-muted">Version</span><span>{info.version}</span>
            <span className="text-studio-muted">Electron</span><span>{info.electron}</span>
            <span className="text-studio-muted">Node</span><span>{info.node}</span>
            <span className="text-studio-muted">Plattform</span><span>{info.platform}</span>
            <span className="text-studio-muted">Overlay-Port</span><span>{info.overlayPort}</span>
            <span className="text-studio-muted">Datenordner</span>
            <span className="truncate" title={info.dataDir}>{info.dataDir}</span>
          </div>
        )}
        <button
          onClick={() => void window.studio.openDataDir()}
          className="clip-slant mt-4 border border-studio-border bg-studio-raised px-4 py-2 text-xs hover:border-studio-teal hover:text-studio-teal"
        >
          📂 Datenordner öffnen
        </button>
      </section>
    </div>
  );
}
