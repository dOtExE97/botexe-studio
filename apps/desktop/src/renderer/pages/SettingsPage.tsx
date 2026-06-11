// SettingsPage — App-Einstellungen: Loyalty-Punkte-Regeln, App-Infos,
// Datenordner, Punkte-Reset.
import { useEffect, useState } from 'react';
import { Coins, Info, FolderOpen, RotateCcw, MessageSquare, UserPlus, Heart, Gift } from 'lucide-react';

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

const RULE_ICON: Record<string, typeof Coins> = {
  perChat: MessageSquare,
  perFollow: UserPlus,
  perCoin: Gift,
  perLike: Heart,
};

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

  const numField = (key: keyof PointsConfig, label: string, hint?: string) => {
    const RIcon = RULE_ICON[key] ?? Coins;
    return (
      <label className="flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-studio-muted">
          <RIcon size={12} className="text-studio-accent" /> {label}
        </span>
        <input
          type="number"
          min={0}
          value={points ? (points[key] as number) : 0}
          onChange={(e) => updatePoints({ [key]: Math.max(0, Number(e.target.value)) } as Partial<PointsConfig>)}
          className="bx-input font-mono"
        />
        {hint && <span className="text-[10px] text-studio-muted/70">{hint}</span>}
      </label>
    );
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5 p-6">
      <div>
        <h1 className="font-display text-xl uppercase">Einstellungen</h1>
        <p className="mt-1 text-xs text-studio-muted">Loyalty-Punkte, App-Infos und Daten.</p>
      </div>

      {/* Loyalty-Punkte */}
      <section className="bx-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-gold">
            <Coins size={15} /> Loyalty-Punkte
          </h2>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={points?.enabled ?? false}
              onChange={(e) => updatePoints({ enabled: e.target.checked })}
            />
            Punkte sammeln aktiv
          </label>
        </div>
        <p className="mb-4 text-[12px] leading-relaxed text-studio-muted">
          Zuschauer sammeln über alle Streams hinweg Punkte für Aktivität. Anzeigen via Widget „Punkte-Bestenliste".
          Das ist die Währungs-Basis fürs Glücksrad und das spätere Stream-Kartenspiel.
        </p>
        {points && (
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-widest text-studio-muted">Name der Währung</span>
              <input
                value={points.currencyName}
                onChange={(e) => updatePoints({ currencyName: e.target.value })}
                className="bx-input"
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
          className="bx-pill mt-4 border-studio-accent/40 text-studio-accent hover:border-studio-accent hover:text-studio-accent"
        >
          <RotateCcw size={13} /> Alle Punkte zurücksetzen
        </button>
      </section>

      {/* App-Info */}
      <section className="bx-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
          <Info size={15} /> Über bOtExE Studio
        </h2>
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
        <button onClick={() => void window.studio.openDataDir()} className="bx-pill mt-4 hover:text-studio-teal">
          <FolderOpen size={13} /> Datenordner öffnen
        </button>
      </section>
    </div>
  );
}
