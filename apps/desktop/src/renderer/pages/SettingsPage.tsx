// SettingsPage — App-Einstellungen: Loyalty-Punkte-Regeln, App-Infos,
// Datenordner, Punkte-Reset.
import { useEffect, useState } from 'react';
import { Coins, Info, FolderOpen, RotateCcw, MessageSquare, UserPlus, Heart, Gift, Speaker, FileText, Clapperboard, Check, AlertTriangle, ShieldCheck, Download, RefreshCw, Upload, Gamepad2, Rocket, Sparkles } from 'lucide-react';
import ConfirmButton from '../components/ConfirmButton';
import GreetReturningCard from '../components/GreetReturningCard';
import { toast } from '../components/ToastHost';

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
  control?: { url: string; token: string };
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
  const [outputs, setOutputs] = useState<{ deviceId: string; label: string }[]>([]);
  const [audioOut, setAudioOut] = useState('');
  const [ttls, setTtls] = useState<{ ready: boolean; host: string } | null>(null);
  const [ttlsBusy, setTtlsBusy] = useState(false);
  const [update, setUpdate] = useState<{ state: string; version?: string; message?: string }>({ state: 'idle' });
  const [blockedWords, setBlockedWords] = useState('');
  const [sportKey, setSportKey] = useState('');
  const [sportKeySet, setSportKeySet] = useState(false);
  const [obsPasswordSet, setObsPasswordSet] = useState(false);
  const [obs, setObs] = useState<{ enabled: boolean; url: string; password: string }>({ enabled: false, url: 'ws://127.0.0.1:4455', password: '' });
  const [obsStatus, setObsStatus] = useState('off');
  const [sb, setSb] = useState<{ enabled: boolean; url: string }>({ enabled: false, url: 'ws://127.0.0.1:8080/' });
  const [sbStatus, setSbStatus] = useState('off');
  const [tiktokIn, setTiktokIn] = useState(false);
  const [signKey, setSignKey] = useState('');
  const [signKeySet, setSignKeySet] = useState(false);

  useEffect(() => {
    void window.studio.getSettings().then((s: { points: PointsConfig; audioOutputId?: string; moderation?: { blockedWords?: string[] }; sportKeySet?: boolean; tiktokSignKeySet?: boolean; obsPasswordSet?: boolean; obs?: { enabled: boolean; url: string }; streamerbot?: { enabled: boolean; url: string }; tiktokLoggedIn?: boolean }) => {
      setPoints(s.points);
      setAudioOut(s.audioOutputId ?? '');
      setBlockedWords((s.moderation?.blockedWords ?? []).join(', '));
      // Keys/Passwörter kommen nicht mehr roh zurück — nur „gesetzt"-Flags.
      setSportKeySet(!!s.sportKeySet);
      setSignKeySet(!!s.tiktokSignKeySet);
      setObsPasswordSet(!!s.obsPasswordSet);
      if (s.obs) setObs({ enabled: s.obs.enabled, url: s.obs.url, password: '' });
      if (s.streamerbot) setSb(s.streamerbot);
      setTiktokIn(!!s.tiktokLoggedIn);
    });
    void window.studio.getAppInfo().then((i: AppInfo) => setInfo(i));
    const offUpdate = window.studio.onUpdateStatus((s) => setUpdate(s));
    const offObs = window.studio.onObsStatus((s) => setObsStatus(s));
    const offSb = window.studio.onStreamerbotStatus((s) => setSbStatus(s));
    return () => { offUpdate?.(); offObs?.(); offSb?.(); };
  }, []);

  const applySb = (next: { enabled: boolean; url: string }) => { setSb(next); void window.studio.setStreamerbotConfig(next); };

  const applyObs = (next: { enabled: boolean; url: string; password: string }) => {
    setObs(next);
    void window.studio.setObsConfig(next);
  };

  useEffect(() => {
    void window.studio.getTtlsLink().then((t: { ready: boolean; host: string }) => setTtls(t));
    // Audio-Ausgabegeräte auflisten. Erst kurz Media-Permission anfragen
    // (getUserMedia) — sonst liefert Chromium leere Geräte-Namen und maskierte
    // IDs, die nach einem Neustart nicht mehr matchen (Ausgabe „verfällt").
    const md = navigator.mediaDevices;
    const list = () => md?.enumerateDevices()
      .then((ds) => setOutputs(
        ds.filter((d) => d.kind === 'audiooutput').map((d) => ({ deviceId: d.deviceId, label: d.label || 'Gerät' })),
      ))
      .catch(() => setOutputs([]));
    Promise.resolve(md?.getUserMedia?.({ audio: true }))
      .then((stream) => stream?.getTracks().forEach((t) => t.stop()))
      .catch(() => undefined)
      .finally(() => void list());
  }, []);

  const setAudioOutput = (id: string) => {
    setAudioOut(id);
    // Label mitspeichern → robuster Fallback, wenn die deviceId mal wechselt.
    const label = outputs.find((o) => o.deviceId === id)?.label ?? '';
    void window.studio.updateSettings({ audioOutputId: id, audioOutputLabel: label });
    window.dispatchEvent(new CustomEvent('bx-audio-output', { detail: id }));
  };

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl uppercase">Einstellungen</h1>
          <p className="mt-1 text-xs text-studio-muted">Loyalty-Punkte, App-Infos und Daten.</p>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('bx-show-tour'))}
          className="bx-pill flex-none text-[11px] hover:text-studio-accent"
          title="Die Willkommens-/Einrichtungs-Tour erneut anzeigen"
        >
          <Rocket size={13} /> Tour erneut zeigen
        </button>
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
        <div className="mt-4">
          <ConfirmButton
            onConfirm={() => { void window.studio.resetPoints(); toast('info', 'Alle Punkte zurückgesetzt.'); }}
            confirmLabel="Alle Punkte für IMMER löschen?"
            className="bx-pill border-studio-accent/40 text-studio-accent hover:border-studio-accent hover:text-studio-accent"
          >
            <RotateCcw size={13} /> Alle Punkte zurücksetzen
          </ConfirmButton>
        </div>
      </section>

      {/* TikTok Live Studio */}
      <section className="bx-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-accent">
          <Clapperboard size={15} /> TikTok Live Studio
        </h2>
        <p className="mb-3 text-[12px] leading-relaxed text-studio-muted">
          TikTok Live Studio akzeptiert keine IP-Links — darum gibt es im Overlay-Editor den extra
          „TikTok-Studio-Link" (<Clapperboard size={11} className="inline" />) in Domain-Form ({ttls?.host ?? 'localtest.me'}).
          Die Domain zeigt auf deinen eigenen PC; manche Router (z.B. FritzBox) blocken das aber.
          Die Einrichtung trägt dafür <b>eine Zeile ins lokale „Telefonbuch"</b> deines PCs ein (hosts-Datei) —
          einmalig, mit Windows-Admin-Bestätigung. Es wird nichts geöffnet oder freigegeben.
        </p>
        {ttls?.ready ? (
          <p className="flex items-center gap-2 text-xs text-studio-teal">
            <Check size={14} /> Bereit — der TikTok-Studio-Link funktioniert auf diesem PC.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-xs text-studio-gold">
              <AlertTriangle size={14} /> Noch nicht eingerichtet — Link würde in TikTok Live Studio nicht laden.
            </p>
            <button
              disabled={ttlsBusy}
              onClick={() => {
                setTtlsBusy(true);
                void window.studio.setupTtls().then((r: { ok: boolean; ready: boolean; error?: string }) => {
                  setTtlsBusy(false);
                  setTtls((t) => (t ? { ...t, ready: r.ready } : t));
                  if (r.ready) toast('success', 'TikTok-Studio-Link eingerichtet!');
                  else toast('error', `Einrichtung fehlgeschlagen: ${r.error ?? 'unbekannt'}`);
                });
              }}
              className="bx-btn-accent disabled:opacity-60"
            >
              <ShieldCheck size={15} /> {ttlsBusy ? 'Warte auf Admin-Bestätigung…' : 'Automatisch einrichten (Admin)'}
            </button>
          </div>
        )}
      </section>

      {/* Audio-Ausgabe */}
      <section className="bx-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-teal">
          <Speaker size={15} /> Audio-Ausgabe
        </h2>
        <p className="mb-3 text-[12px] leading-relaxed text-studio-muted">
          Wohin Sounds & TTS abgespielt werden. <b>Standard</b> reicht für die meisten — OBS nimmt den Desktop-Ton mit.
          Wer ein Mischpult (z.B. Rodecaster) oder ein virtuelles Audiokabel (VB-Audio Cable / VoiceMeeter) nutzt, wählt es hier.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-studio-muted">Ausgabegerät</span>
          <select value={audioOut} onChange={(e) => setAudioOutput(e.target.value)} className="bx-select">
            <option value="">Standard (System)</option>
            {outputs.map((o) => (
              <option key={o.deviceId} value={o.deviceId}>{o.label}</option>
            ))}
          </select>
        </label>
        {outputs.length === 0 && (
          <p className="mt-2 text-[10px] text-studio-muted/70">Keine Geräte gefunden — Standard wird genutzt.</p>
        )}
      </section>

      {/* Sport-Liveticker */}
      <section className="bx-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
          <Gift size={15} /> Sport-Liveticker
        </h2>
        <label className="block text-[11px] uppercase tracking-widest text-studio-muted">football-data.org API-Key</label>
        <input
          type="password"
          value={sportKey}
          onChange={(e) => setSportKey(e.target.value)}
          onBlur={() => { if (sportKey.trim()) { void window.studio.updateSettings({ sportApiKey: sportKey.trim() }); setSportKeySet(true); } }}
          placeholder={sportKeySet ? '•••••••• (gesetzt — leer lassen zum Behalten)' : 'dein kostenloser Key von football-data.org/client/register'}
          className="bx-input mt-1.5 w-full font-mono text-xs"
        />
        <p className="mt-2 text-[10px] text-studio-muted/70">
          Kostenlos registrieren auf <b>football-data.org</b> → deckt WM, Champions League & Top-Ligen ab. Für deutsche Ligen geht das Widget auch ohne Key (Quelle „OpenLigaDB"). Der Key bleibt lokal.
        </p>
      </section>

      {/* Stream Deck / Fernsteuerung */}
      {info?.control && (() => {
        const ctrl = info.control;
        return (
        <section className="bx-card p-5">
          <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
            <Gamepad2 size={15} /> Stream Deck
          </h2>
          <p className="mb-3 text-[11px] text-studio-muted">
            Mit dem bOtExE-Studio-Stream-Deck-Plugin lösen Stream-Deck-Tasten deine <b>Panel</b>-Knöpfe aus. Im Plugin (Property Inspector) diese Werte eintragen:
          </p>
          <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-2 text-xs">
            <span className="text-studio-muted">URL</span>
            <input readOnly value={ctrl.url} className="bx-input font-mono" onFocus={(e) => e.target.select()} />
            <button onClick={() => void window.studio.copyText(ctrl.url).then(() => toast('success', 'URL kopiert.'))} className="bx-pill px-2 py-1.5 text-[11px] hover:text-studio-teal">Kopieren</button>
            <span className="text-studio-muted">Token</span>
            <input readOnly value={ctrl.token} className="bx-input font-mono" onFocus={(e) => e.target.select()} />
            <button onClick={() => void window.studio.copyText(ctrl.token).then(() => toast('success', 'Token kopiert.'))} className="bx-pill px-2 py-1.5 text-[11px] hover:text-studio-teal">Kopieren</button>
          </div>
          <p className="mt-2 text-[10px] text-studio-muted/70">
            Plugin liegt im Repo unter <span className="font-mono">streamdeck/de.botexe.studio.sdPlugin</span> — Ordner ins Stream-Deck-Plugin-Verzeichnis kopieren (oder als .streamDeckPlugin doppelklicken). Token wechselt pro App-Start nicht.
          </p>
        </section>
        );
      })()}

      {/* OBS-Studio-Steuerung */}
      <section className="bx-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
            <Clapperboard size={15} /> OBS-Steuerung
          </h2>
          <span className={`flex items-center gap-1.5 text-[11px] font-bold ${obsStatus === 'connected' ? 'text-emerald-300' : obsStatus === 'error' ? 'text-studio-accent' : obsStatus === 'connecting' ? 'text-studio-gold' : 'text-studio-muted'}`}>
            <span className={`h-2 w-2 rounded-full ${obsStatus === 'connected' ? 'bg-emerald-400' : obsStatus === 'error' ? 'bg-studio-accent' : obsStatus === 'connecting' ? 'bg-studio-gold animate-pulse' : 'bg-studio-muted'}`} />
            {obsStatus === 'connected' ? 'Verbunden' : obsStatus === 'connecting' ? 'Verbinde…' : obsStatus === 'error' ? 'Fehler' : 'Aus'}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs text-studio-muted">
          <input type="checkbox" checked={obs.enabled} onChange={(e) => applyObs({ ...obs, enabled: e.target.checked })} className="accent-[#21e6c1]" />
          OBS-Steuerung aktivieren (Trigger können Szenen wechseln / Quellen schalten)
        </label>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-studio-muted">WebSocket-URL</span>
            <input value={obs.url} onChange={(e) => setObs({ ...obs, url: e.target.value })} onBlur={() => applyObs(obs)} className="bx-input font-mono" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-studio-muted">Passwort</span>
            <input
              type="password"
              value={obs.password}
              onChange={(e) => setObs({ ...obs, password: e.target.value })}
              onBlur={() => { applyObs(obs); if (obs.password) setObsPasswordSet(true); }}
              placeholder={obsPasswordSet ? '•••• (gesetzt)' : ''}
              className="bx-input font-mono"
              style={{ width: '10rem' }}
            />
          </label>
        </div>
        <p className="mt-2 text-[10px] text-studio-muted/70">
          In OBS: <b>Werkzeuge → WebSocket-Server-Einstellungen</b> → aktivieren, Port (Standard 4455) + Passwort übernehmen. Dann oben „aktivieren". Aktionen baust du auf der <b>Trigger</b>-Seite (z.B. „Großes Gift → Szene wechseln").
        </p>
      </section>

      {/* TikTok-Verbindung (Sign-Key) */}
      <section className="bx-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
            <ShieldCheck size={15} /> TikTok-Verbindung (Sign-Key)
          </h2>
          <span className={`flex items-center gap-1.5 text-[11px] font-bold ${signKeySet ? 'text-emerald-300' : 'text-amber-300'}`}>
            <span className={`h-2 w-2 rounded-full ${signKeySet ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {signKeySet ? 'Key gesetzt' : 'Kein Key'}
          </span>
        </div>
        <p className="mb-3 text-[11px] text-studio-muted">
          Um dein TikTok-Live zu verbinden (Chat, Geschenke, Likes empfangen) braucht die App einen <b>Sign-Key</b> von eulerstream. Den gibt's <b>kostenlos</b>: auf <span className="font-mono">eulerstream.com</span> registrieren → einen Key erstellen → im Dashboard das Add-on <b>„Webcast Signatures"</b> einschalten (ist beim Gratis-Community-Plan dabei, aber standardmäßig <b>aus</b>) → Key hier eintragen.
        </p>
        <input
          type="password"
          value={signKey}
          onChange={(e) => setSignKey(e.target.value)}
          onBlur={() => { if (signKey.trim()) { void window.studio.updateSettings({ tiktokSignApiKey: signKey.trim() }); setSignKeySet(true); toast('success', 'Sign-Key gespeichert.'); } }}
          placeholder={signKeySet ? '•••••••• (gesetzt — leer lassen zum Behalten)' : 'Euler Sign-Key (euler_… — kostenlos auf eulerstream.com)'}
          className="bx-input w-full font-mono text-xs"
        />
        {signKeySet && (
          <button
            onClick={() => { setSignKey(''); void window.studio.updateSettings({ tiktokSignApiKey: '' }); setSignKeySet(false); toast('info', 'Sign-Key gelöscht.'); }}
            className="bx-pill mt-2 text-[11px] hover:text-studio-accent"
          >
            Key löschen
          </button>
        )}
        <p className="mt-2 text-[10px] text-studio-muted/70">
          Ohne aktiviertes „Webcast Signatures"-Add-on lehnt eulerstream das Verbinden mit der Meldung „requires a Business plan" ab — das Add-on einzuschalten ist gratis und behebt das.
        </p>
      </section>

      {/* TikTok-Chat senden */}
      <section className="bx-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
            <MessageSquare size={15} /> Chat schreiben (TikTok-Login)
          </h2>
          <span className={`flex items-center gap-1.5 text-[11px] font-bold ${tiktokIn ? 'text-emerald-300' : 'text-studio-muted'}`}>
            <span className={`h-2 w-2 rounded-full ${tiktokIn ? 'bg-emerald-400' : 'bg-studio-muted'}`} />
            {tiktokIn ? 'Angemeldet' : 'Nicht angemeldet'}
          </span>
        </div>
        <p className="mb-3 text-[11px] text-studio-muted">
          Damit die App selbst Nachrichten in deinen Live-Chat schreiben kann, einmal mit deinem TikTok-Account anmelden (öffnet ein TikTok-Login-Fenster). Danach gibt's die Aktion „Chat-Nachricht senden" und ein Sendefeld im Live-Cockpit.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {tiktokIn ? (
            <button onClick={() => void window.studio.tiktokLogout().then(() => setTiktokIn(false))} className="bx-pill hover:text-studio-accent">Abmelden</button>
          ) : (
            <button onClick={() => void window.studio.tiktokLogin().then((r: { loggedIn: boolean }) => { setTiktokIn(r.loggedIn); if (r.loggedIn) toast('success', 'Bei TikTok angemeldet — Chat-Senden ist frei.'); })} className="bx-btn-accent">
              <MessageSquare size={14} /> Mit TikTok anmelden
            </button>
          )}
        </div>
        <p className="mt-2 text-[10px] text-studio-muted/70">
          ⚠️ TikTok drosselt stark — die App sendet max. <b>1 Nachricht / 30 Sek</b>. Senden erfolgt über deine eingeloggte Session (kein offizielles API); nutze es maßvoll.
        </p>
      </section>

      {/* Streamer.bot-Brücke */}
      <section className="bx-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
            <Gamepad2 size={15} /> Streamer.bot
          </h2>
          <span className={`flex items-center gap-1.5 text-[11px] font-bold ${sbStatus === 'connected' ? 'text-emerald-300' : sbStatus === 'error' ? 'text-studio-accent' : sbStatus === 'connecting' ? 'text-studio-gold' : 'text-studio-muted'}`}>
            <span className={`h-2 w-2 rounded-full ${sbStatus === 'connected' ? 'bg-emerald-400' : sbStatus === 'connecting' ? 'bg-studio-gold animate-pulse' : 'bg-studio-muted'}`} />
            {sbStatus === 'connected' ? 'Verbunden' : sbStatus === 'connecting' ? 'Verbinde…' : sbStatus === 'error' ? 'Fehler' : 'Aus'}
          </span>
        </div>
        <label className="flex items-center gap-2 text-xs text-studio-muted">
          <input type="checkbox" checked={sb.enabled} onChange={(e) => applySb({ ...sb, enabled: e.target.checked })} className="accent-[#21e6c1]" />
          Streamer.bot verbinden (Trigger können Streamer.bot-Aktionen auslösen)
        </label>
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-widest text-studio-muted">WebSocket-URL</span>
          <input value={sb.url} onChange={(e) => setSb({ ...sb, url: e.target.value })} onBlur={() => applySb(sb)} className="bx-input font-mono" />
        </label>
        <p className="mt-2 text-[10px] text-studio-muted/70">
          In Streamer.bot: <b>Servers/Clients → WebSocket Server</b> aktivieren (Standard-Port 8080). Dann hier „verbinden". Auf der <b>Trigger</b>-Seite kannst du dann „Streamer.bot-Aktion" als Aktion wählen.
        </p>
      </section>

      {/* Stammgast-Begrüßung */}
      <GreetReturningCard />

      {/* Chat-Moderation */}
      <section className="bx-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
          <ShieldCheck size={15} /> Chat-Moderation
        </h2>
        <label className="block text-[11px] uppercase tracking-widest text-studio-muted">Gesperrte Wörter</label>
        <textarea
          value={blockedWords}
          onChange={(e) => setBlockedWords(e.target.value)}
          onBlur={() => void window.studio.updateSettings({ moderation: { blockedWords: blockedWords.split(',').map((w) => w.trim()).filter(Boolean) } })}
          placeholder="z.B. beleidigung1, slur2, spamlink"
          rows={2}
          className="bx-input mt-1.5 w-full font-mono text-xs"
        />
        <p className="mt-2 text-[10px] text-studio-muted/70">
          Kommagetrennt. Nachrichten, die eines dieser Wörter enthalten, werden <b>nicht vorgelesen</b> (TTS). Teilwort-Treffer, Groß/klein egal.
        </p>
      </section>

      {/* Updates */}
      <section className="bx-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
          <Download size={15} /> Updates
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {update.state === 'downloaded' ? (
            <button onClick={() => void window.studio.installUpdate()} className="bx-btn-accent">
              <Download size={14} /> Update installieren & neu starten
            </button>
          ) : (
            <button
              onClick={() => void window.studio.checkForUpdate()}
              disabled={update.state === 'checking'}
              className="bx-pill hover:text-studio-teal disabled:opacity-50"
            >
              <RefreshCw size={13} className={update.state === 'checking' ? 'animate-spin' : ''} /> Nach Updates suchen
            </button>
          )}
          <span className="text-xs text-studio-muted">
            {update.state === 'checking' && 'Suche nach Updates…'}
            {update.state === 'available' && 'Update gefunden — wird im Hintergrund geladen…'}
            {update.state === 'downloaded' && `Update ${update.version ? `(${update.version}) ` : ''}bereit.`}
            {update.state === 'none' && 'Du hast die neueste Version. ✅'}
            {update.state === 'error' && `Update-Check fehlgeschlagen: ${update.message ?? 'unbekannt'}`}
            {update.state === 'dev' && 'Auto-Update läuft nur in der installierten App.'}
            {(update.state === 'idle') && 'Updates werden automatisch im Hintergrund geprüft.'}
          </span>
        </div>
        <p className="mt-2 text-[10px] text-studio-muted/70">
          Updates kommen automatisch über GitHub — es wird nur die Änderung geladen (kein kompletter Neu-Download). Beim nächsten Start ist die neue Version aktiv.
        </p>
      </section>

      {/* Feedback & Fehler melden */}
      <section className="bx-card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
          <MessageSquare size={15} /> Feedback &amp; Fehler melden
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-studio-muted">
          Was kaputt? Idee? Schreib's auf GitHub — App-Version &amp; System werden
          automatisch eingetragen. Bei Fehlern hilft es, die <b>Logs</b> anzuhängen
          (unten „Logs öffnen", neueste <code>.log</code>-Datei ins GitHub-Formular ziehen).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              const body = `**Was ist passiert?**\n\n\n**Was hattest du erwartet?**\n\n\n**Schritte zum Nachstellen**\n1. \n2. \n\n---\nApp-Version: ${info?.version ?? '?'}\nSystem: ${info?.platform ?? ''} · ${navigator.userAgent}\nTipp: Logs anhängen (Einstellungen → „Logs öffnen", neueste .log-Datei hier reinziehen).`;
              void window.studio.openExternal(`https://github.com/dOtExE97/botexe-studio/issues/new?labels=bug&title=${encodeURIComponent('[Bug] ')}&body=${encodeURIComponent(body)}`);
            }}
            className="bx-pill hover:text-studio-accent"
          >
            <AlertTriangle size={13} /> Fehler melden
          </button>
          <button
            onClick={() => {
              const body = `**Welche Funktion wünschst du dir?**\n\n\n**Warum / wofür?**\n\n\n---\nApp-Version: ${info?.version ?? '?'}`;
              void window.studio.openExternal(`https://github.com/dOtExE97/botexe-studio/issues/new?labels=enhancement&title=${encodeURIComponent('[Idee] ')}&body=${encodeURIComponent(body)}`);
            }}
            className="bx-pill hover:text-studio-teal"
          >
            <Sparkles size={13} /> Funktion wünschen
          </button>
        </div>
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
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => void window.studio.openDataDir()} className="bx-pill hover:text-studio-teal">
            <FolderOpen size={13} /> Datenordner öffnen
          </button>
          <button onClick={() => void window.studio.openLogs()} className="bx-pill hover:text-studio-teal">
            <FileText size={13} /> Logs öffnen
          </button>
          <button
            onClick={() => void window.studio.exportConfig().then((r: { ok: boolean }) => r.ok && toast('success', 'Backup gespeichert.'))}
            className="bx-pill hover:text-studio-teal"
          >
            <Download size={13} /> Backup exportieren
          </button>
          <ConfirmButton
            onConfirm={() => void window.studio.importConfig().then((r: { ok: boolean; layouts?: number; viewers?: number; error?: string }) => {
              if (r.ok) { toast('success', `Backup eingespielt: ${r.layouts ?? 0} Overlays, ${r.viewers ?? 0} Zuschauer. Seite lädt neu…`); setTimeout(() => window.location.reload(), 900); }
              else if (r.error) toast('error', `Import fehlgeschlagen: ${r.error}`);
            })}
            confirmLabel="Überschreibt Konfig — sicher?"
            className="bx-pill hover:text-studio-accent"
          >
            <Upload size={13} /> Backup einspielen
          </ConfirmButton>
        </div>
        <p className="mt-2 text-[10px] text-studio-muted/70">
          Backup sichert Einstellungen, Trigger, Store, Panel, Overlays & Zuschauer-Punkte in eine Datei (für PC-Wechsel / Sicherheit). Sounds & Medien liegen separat im Datenordner.
        </p>
        <p className="mt-2 text-[10px] text-studio-muted/70">
          Bei Problemen: „Logs öffnen" — dort liegt für jeden App-Start eine Datei mit allem, was passiert/failt.
        </p>
      </section>
    </div>
  );
}
