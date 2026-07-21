// SettingsPage — App-Einstellungen: Loyalty-Punkte-Regeln, App-Infos,
// Datenordner, Punkte-Reset.
import { useEffect, useState } from 'react';
import { Coins, Info, FolderOpen, RotateCcw, MessageSquare, UserPlus, Heart, Gift, Speaker, FileText, Clapperboard, Check, AlertTriangle, ShieldCheck, Download, RefreshCw, Upload, Gamepad2, Rocket, Sparkles, KeyRound, ExternalLink, Music, Play, Pause, SkipForward, SkipBack } from 'lucide-react';
import ConfirmButton from '../components/ConfirmButton';
import GreetReturningCard from '../components/GreetReturningCard';
import ThirdPartyLicenses from '../components/ThirdPartyLicenses';
import { toast } from '../components/ToastHost';
import { DEFAULT_BLOCKLIST } from '../../shared/moderation';

interface PointsConfig {
  enabled: boolean;
  perChat: number;
  perFollow: number;
  perLike: number;
  perCoin: number;
  perMinute: number;
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
  perMinute: Check,
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
  const [connectMode, setConnectMode] = useState<'cloud' | 'direct'>('cloud');
  const [autoLiveWatch, setAutoLiveWatch] = useState(true);
  const [autostart, setAutostart] = useState(false);
  const [giftSoundGap, setGiftSoundGap] = useState(0);
  const [autoBackup, setAutoBackup] = useState(true);
  const [aiProvider, setAiProvider] = useState<'gemini' | 'ollama'>('gemini');
  const [aiModel, setAiModel] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [aiKeySet, setAiKeySet] = useState(false);
  const [spotifyClientId, setSpotifyClientId] = useState('');
  const [spotify, setSpotify] = useState<{ connected: boolean; clientIdSet: boolean; redirectUri: string; nowPlaying: { title: string; artist: string; albumArt: string; isPlaying: boolean } | null }>({ connected: false, clientIdSet: false, redirectUri: '', nowPlaying: null });

  useEffect(() => {
    void window.studio.getSettings().then((s: { points: PointsConfig; audioOutputId?: string; moderation?: { blockedWords?: string[] }; sportKeySet?: boolean; tiktokSignKeySet?: boolean; tiktokConnectMode?: 'cloud' | 'direct'; autoLiveWatch?: boolean; autostart?: boolean; spotifyClientId?: string; obsPasswordSet?: boolean; obs?: { enabled: boolean; url: string }; streamerbot?: { enabled: boolean; url: string }; tiktokLoggedIn?: boolean }) => {
      setPoints(s.points);
      setAudioOut(s.audioOutputId ?? '');
      setBlockedWords((s.moderation?.blockedWords ?? []).join(', '));
      // Keys/Passwörter kommen nicht mehr roh zurück — nur „gesetzt"-Flags.
      setSportKeySet(!!s.sportKeySet);
      setSignKeySet(!!s.tiktokSignKeySet);
      setConnectMode(s.tiktokConnectMode === 'direct' ? 'direct' : 'cloud');
      setAutoLiveWatch(s.autoLiveWatch !== false);
      setAutostart(s.autostart === true);
      const sy = s as unknown as { giftSoundGapSec?: number; autoBackup?: boolean };
      setGiftSoundGap(sy.giftSoundGapSec ?? 0);
      setAutoBackup(sy.autoBackup !== false);
      const sx = s as unknown as { ai?: { provider?: string; model?: string }; aiKeySet?: boolean };
      setAiProvider(sx.ai?.provider === 'ollama' ? 'ollama' : 'gemini');
      setAiModel(sx.ai?.model ?? '');
      setAiKeySet(!!sx.aiKeySet);
      setSpotifyClientId(s.spotifyClientId ?? '');
      setObsPasswordSet(!!s.obsPasswordSet);
      if (s.obs) setObs({ enabled: s.obs.enabled, url: s.obs.url, password: '' });
      if (s.streamerbot) setSb(s.streamerbot);
      setTiktokIn(!!s.tiktokLoggedIn);
    });
    void window.studio.getAppInfo().then((i: AppInfo) => setInfo(i));
    const offUpdate = window.studio.onUpdateStatus((s) => setUpdate(s));
    const offObs = window.studio.onObsStatus((s) => setObsStatus(s));
    const offSb = window.studio.onStreamerbotStatus((s) => setSbStatus(s));
    // Key-Assistent hat gespeichert → Status-Ampel sofort auf „Key gesetzt".
    const onKeySaved = () => setSignKeySet(true);
    window.addEventListener('bx-key-saved', onKeySaved);
    return () => { offUpdate?.(); offObs?.(); offSb?.(); window.removeEventListener('bx-key-saved', onKeySaved); };
  }, []);

  // Spotify-Status (verbunden? + was läuft gerade) regelmäßig holen.
  useEffect(() => {
    let alive = true;
    const poll = () => { void window.studio.spotifyStatus().then((st) => { if (alive) setSpotify(st); }).catch(() => undefined); };
    poll();
    const iv = setInterval(poll, 3000);
    return () => { alive = false; clearInterval(iv); };
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
          <p className="mt-1 text-xs text-studio-muted">TikTok-Verbindung (Key!), Audio, Punkte, Integrationen & Daten.</p>
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('bx-show-tour'))}
          className="bx-pill flex-none text-[11px] hover:text-studio-accent"
          title="Die Willkommens-/Einrichtungs-Tour erneut anzeigen"
        >
          <Rocket size={13} /> Tour erneut zeigen
        </button>
      </div>

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
        <p className="mb-2 text-[11px] text-studio-muted">
          Zum Verbinden (Chat, Geschenke, Likes empfangen) braucht die App einen <b>kostenlosen API-Key</b> von eulerstream. <b className="text-amber-300">Ohne Key geht's nicht</b> — aber er ist gratis und in 2 Minuten geholt. Am einfachsten mit dem Assistenten:
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('bx-key-wizard'))}
          className="bx-btn-accent mb-3"
        >
          <KeyRound size={14} /> Key-Assistent öffnen (2 Min, geführt)
        </button>
        <p className="mb-2 text-[10px] text-studio-muted/70">
          Der Assistent führt dich durch Konto + Key, erkennt den kopierten Key automatisch und prüft ihn sofort. Alternativ hier manuell: <button onClick={() => void window.studio.openExternal('https://www.eulerstream.com/dashboard/api-keys')} className="underline hover:text-studio-accent">Key-Seite öffnen <ExternalLink size={9} className="inline opacity-70" /></button> und den Key unten einfügen.
        </p>
        <input
          type="password"
          value={signKey}
          onChange={(e) => setSignKey(e.target.value)}
          onBlur={() => {
            const k = signKey.trim();
            if (!k) return;
            void window.studio.updateSettings({ tiktokSignApiKey: k });
            setSignKeySet(true);
            // Sofort prüfen — „funktioniert" sieht man hier, nicht erst beim Verbinden.
            void window.studio.testSignKey(k).then((r) => {
              if (r.ok) toast('success', '✓ Key geprüft — funktioniert!');
              else if (r.reason === 'invalid') toast('error', 'Key gespeichert, aber eulerstream lehnt ihn ab — bitte nochmal vollständig kopieren.');
              else toast('info', 'Key gespeichert (Prüfung gerade nicht möglich — wird beim Verbinden getestet).');
            });
          }}
          placeholder={signKeySet ? '•••••••• (gesetzt — leer lassen zum Behalten)' : 'Euler API-Key (euler_… — kostenlos auf eulerstream.com)'}
          className="bx-input w-full font-mono text-xs"
        />
        {/* Live-Format-Check: hilft, den richtigen Key zu erkennen. */}
        {signKey.trim().length > 0 && (
          signKey.trim().startsWith('euler_')
            ? <p className="mt-1 text-[11px] text-emerald-300">✓ Sieht nach einem gültigen eulerstream-Key aus — Feld verlassen zum Speichern.</p>
            : <p className="mt-1 text-[11px] text-amber-300">⚠ Ein eulerstream-Key beginnt normalerweise mit „euler_". Sicher, dass das der richtige ist? (Nicht dein TikTok-Passwort/-Login!)</p>
        )}
        {signKeySet && (
          <button
            onClick={() => { setSignKey(''); void window.studio.updateSettings({ tiktokSignApiKey: '' }); setSignKeySet(false); toast('info', 'API-Key gelöscht.'); }}
            className="bx-pill mt-2 text-[11px] hover:text-studio-accent"
          >
            Key löschen
          </button>
        )}

        <div className="mt-3 rounded-lg border border-studio-teal/30 bg-studio-teal/5 p-2.5 text-[11px] text-studio-muted">
          💡 <b className="text-studio-fg">Gut zu wissen:</b> Nach dem Verbinden wartet die App, bis <b>du live gehst</b> — solange steht oben <span className="font-mono">„warte auf Live"</span>. Das ist <b>kein Fehler</b>: Sobald dein Live startet, verbindet sie sich automatisch. Den Key-Status siehst du oben rechts (<span className="text-emerald-300">Key gesetzt</span> / <span className="text-amber-300">Kein Key</span>).
        </div>

        {/* Verbindungs-Modus */}
        <div className="mt-4 rounded-lg border border-studio-border/60 p-3">
          <div className="mb-2 text-[11px] font-bold text-studio-fg">Verbindungs-Modus</div>
          <label className="flex cursor-pointer items-start gap-2 text-[11px] text-studio-muted">
            <input
              type="radio" name="connectMode" checked={connectMode === 'cloud'}
              onChange={() => { setConnectMode('cloud'); void window.studio.updateSettings({ tiktokConnectMode: 'cloud' }); }}
              className="mt-0.5"
            />
            <span><b className="text-emerald-300">Cloud (gratis, empfohlen)</b> — Euler hostet die Verbindung. Funktioniert mit dem <b>kostenlosen Community-Key</b>. Empfängt Chat/Geschenke/Likes. (Chat-Senden geht hier nicht.)</span>
          </label>
          <label className="mt-2 flex cursor-pointer items-start gap-2 text-[11px] text-studio-muted">
            <input
              type="radio" name="connectMode" checked={connectMode === 'direct'}
              onChange={() => { setConnectMode('direct'); void window.studio.updateSettings({ tiktokConnectMode: 'direct' }); }}
              className="mt-0.5"
            />
            <span><b>Direkt</b> — App signiert selbst. Kann <b>auch Chat senden</b>, braucht aber einen <b>kostenpflichtigen Business-Key</b> (eulerstream „Webcast Signatures"). Nur wählen, wenn du den hast.</span>
          </label>
        </div>

        <p className="mt-2 text-[10px] text-studio-muted/70">
          Tipp: Bleib bei <b>Cloud</b> — das ist der Gratis-Weg. „Direkt" ohne Business-Key endet in „requires a Business plan".
        </p>

        {/* Auto-Live-Watch */}
        <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-studio-border/60 p-3 text-[11px] text-studio-muted">
          <input
            type="checkbox" checked={autoLiveWatch}
            onChange={(e) => { setAutoLiveWatch(e.target.checked); void window.studio.updateSettings({ autoLiveWatch: e.target.checked }); }}
            className="mt-0.5"
          />
          <span>
            <b className="text-studio-fg">Automatisch verbinden, wenn ich live gehe</b> — die App beobachtet beim Start deinen zuletzt verbundenen Account und verbindet von selbst, sobald du auf TikTok live gehst (wie TikFinity). Nutzt einen sparsamen Live-Check (kein Sign-Kontingent).
          </span>
        </label>

        {/* Autostart mit Windows */}
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-studio-border/60 p-3 text-[11px] text-studio-muted">
          <input
            type="checkbox" checked={autostart}
            onChange={(e) => { setAutostart(e.target.checked); void window.studio.updateSettings({ autostart: e.target.checked }); }}
            className="mt-0.5"
          />
          <span>
            <b className="text-studio-fg">Mit Windows automatisch starten</b> — behebt das „Browser-Quelle nach Neustart leer"-Problem: bOtExE Studio (und damit der Overlay-Server) läuft dann schon, <b>bevor</b> du OBS/TikTok Live Studio öffnest. So muss deine Browser-Quelle nie wieder neu eingefügt werden.
          </span>
        </label>
      </section>

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
            {numField('perMinute', 'pro Minute dabei', 'Zuschauzeit belohnen: Punkte je Minute für alle, die gerade aktiv sind (Chat/Like/Gift). 0 = aus')}
          </div>
        )}
        <div className="mt-4">
          <ConfirmButton
            onConfirm={() => { void window.studio.resetPoints(); toast('info', 'Loyalty-Punkte zurückgesetzt (Level & Stats bleiben).'); }}
            confirmLabel="Loyalty-Punkte für IMMER auf 0 setzen?"
            className="bx-pill border-studio-accent/40 text-studio-accent hover:border-studio-accent hover:text-studio-accent"
          >
            <RotateCcw size={13} /> Nur Loyalty-Punkte zurücksetzen
          </ConfirmButton>
          <p className="mt-1 text-[10px] text-studio-muted/70">Setzt nur die gesammelten Punkte auf 0. Spiele-Meister-Level, Wins, Besuche, Coins & Likes bleiben erhalten.</p>
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
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-studio-border bg-studio-raised px-3 py-2 text-[11px] leading-relaxed text-studio-muted">
          <AlertTriangle size={14} className="mt-0.5 flex-none text-studio-gold" />
          <span>
            <b>Hochformat-Quelle (1080×1920):</b> Beim Einfügen in TTLS die <b>benutzerdefinierte Auflösung</b> auf
            1080×1920 stellen. TTLS vergisst diese Größe bei Hochformat-Quellen leider manchmal nach einem Neustart
            (bekanntes TTLS-Verhalten — eine Webseite kann ihre Quellgröße nicht selbst vorgeben, das gilt für jedes
            Overlay, auch fremde). Hilft meist: TTLS <b>sauber übers Menü beenden</b> statt hart schließen, und in der
            Hochformat-/9:16-Szene arbeiten.
          </span>
        </div>
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
          <Speaker size={15} /> Audio-Ausgabe & Sound-Bremse
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

      {/* Gift-Sound-Bremse (Anti-Spam) */}
      <section className="bx-card p-5">
        <h2 className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
          <Gift size={15} /> Gift-Sound-Bremse
        </h2>
        <p className="mb-2 text-[11px] text-studio-muted">
          Wie oft dürfen Geschenke denselben Sound auslösen? Bei <b>0</b> triggert <b>jedes</b> Geschenk (Standard). Mit z.B. <b>10</b> spielt derselbe Sound höchstens alle 10 Sekunden — rettet dich beim „Rosen-Regen". 🌹🌹🌹
        </p>
        <label className="flex w-72 items-center gap-2 text-xs text-studio-muted">
          Frühestens alle
          <input
            type="number" min={0} max={600} value={giftSoundGap}
            onChange={(e) => setGiftSoundGap(Math.max(0, Number(e.target.value)))}
            onBlur={() => void window.studio.updateSettings({ giftSoundGapSec: giftSoundGap })}
            className="bx-input w-20 font-mono"
          />
          Sekunden <span className="text-studio-muted/60">(0 = jedes Gift)</span>
        </label>
        <p className="mt-2 text-[10px] text-studio-muted/70">
          Gilt für die Sounds der Gift-Widgets (Alert & Co.). Trigger-Regeln haben zusätzlich ihren eigenen Cooldown — auch in der Geschenke-Galerie einstellbar.
        </p>
      </section>

      {/* Spotify */}
      <section className="bx-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
            <Music size={15} /> Spotify
          </h2>
          <span className={`flex items-center gap-1.5 text-[11px] font-bold ${spotify.connected ? 'text-emerald-300' : 'text-studio-muted'}`}>
            <span className={`h-2 w-2 rounded-full ${spotify.connected ? 'bg-emerald-400' : 'bg-studio-muted'}`} />
            {spotify.connected ? 'Verbunden' : 'Nicht verbunden'}
          </span>
        </div>

        {!spotify.connected ? (
          <>
            <p className="mb-2 text-[11px] text-studio-muted">
              Zeigt „läuft gerade" im Overlay & lässt dich Spotify steuern. Einmalig einrichten (wie bei TikFinity):
            </p>
            <ol className="mb-3 ml-4 list-decimal space-y-1.5 text-[11px] text-studio-muted">
              <li>Auf <button onClick={() => void window.studio.openExternal('https://developer.spotify.com/dashboard')} className="font-bold text-studio-teal hover:underline">developer.spotify.com</button> eine App anlegen → <b>Client ID</b> kopieren.</li>
              <li>Dort als <b>Redirect URI</b> exakt eintragen:<br/>
                <span className="mt-1 inline-flex items-center gap-1.5">
                  <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-studio-fg">{spotify.redirectUri || 'http://127.0.0.1:27415/spotify/callback'}</code>
                  <button onClick={() => void window.studio.copyText(spotify.redirectUri)} className="bx-pill px-2 py-0.5 text-[10px] hover:text-studio-accent">kopieren</button>
                </span>
              </li>
              <li>Client ID hier einfügen → <b>Mit Spotify anmelden</b>.</li>
            </ol>
            <input
              type="text" value={spotifyClientId}
              onChange={(e) => setSpotifyClientId(e.target.value)}
              onBlur={() => void window.studio.updateSettings({ spotifyClientId: spotifyClientId.trim() })}
              placeholder="Spotify Client ID" className="bx-input w-full font-mono text-xs"
            />
            <button
              onClick={() => void window.studio.spotifyBeginAuth().then((r: { ok: boolean; error?: string }) => { if (!r.ok) toast('error', r.error ?? 'Login fehlgeschlagen'); })}
              disabled={!spotifyClientId.trim()}
              className="bx-btn-accent mt-2 disabled:opacity-40"
            >
              <Music size={14} /> Mit Spotify anmelden
            </button>
            <p className="mt-2 text-[10px] text-studio-muted/70">Steuern (Play/Skip) braucht <b>Spotify Premium</b> + ein aktives Spotify-Gerät.</p>
          </>
        ) : (
          <>
            {spotify.nowPlaying ? (
              <div className="flex items-center gap-3 rounded-lg border border-studio-border bg-studio-raised/40 p-2.5">
                {spotify.nowPlaying.albumArt && <img src={spotify.nowPlaying.albumArt} alt="" className="h-12 w-12 flex-none rounded object-cover" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-studio-fg">{spotify.nowPlaying.title}</div>
                  <div className="truncate text-[11px] text-studio-muted">{spotify.nowPlaying.artist}</div>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-studio-muted">Gerade läuft nichts (oder kein aktives Spotify-Gerät). Spiel in der Spotify-App etwas ab.</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => void window.studio.spotifyControl('previous')} className="bx-pill" title="Vorheriger"><SkipBack size={14} /></button>
              <button onClick={() => void window.studio.spotifyControl(spotify.nowPlaying?.isPlaying ? 'pause' : 'play')} className="bx-pill" title={spotify.nowPlaying?.isPlaying ? 'Pause' : 'Play'}>{spotify.nowPlaying?.isPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
              <button onClick={() => void window.studio.spotifyControl('next')} className="bx-pill" title="Nächster"><SkipForward size={14} /></button>
              <button onClick={() => void window.studio.spotifyLogout()} className="bx-pill ml-auto text-[11px] hover:text-studio-accent">Abmelden</button>
            </div>
            <p className="mt-2 text-[10px] text-studio-muted/70">Tipp: Widget <b>„Spotify — Läuft gerade"</b> ins Overlay ziehen (Palette → Medien). Steuern auch per Trigger-Aktion möglich.</p>
          </>
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

      {/* ✨ KI-Assistent (Overlay-Wünsche) */}
      <section className="bx-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
            <Sparkles size={15} /> KI-Assistent (Overlay-Wünsche)
          </h2>
          <span className={`flex items-center gap-1.5 text-[11px] font-bold ${(aiProvider === 'ollama' || aiKeySet) ? 'text-emerald-300' : 'text-studio-muted'}`}>
            <span className={`h-2 w-2 rounded-full ${(aiProvider === 'ollama' || aiKeySet) ? 'bg-emerald-400' : 'bg-studio-muted'}`} />
            {aiProvider === 'ollama' ? 'Ollama (lokal)' : aiKeySet ? 'Bereit' : 'Kein Key'}
          </span>
        </div>
        <p className="mb-3 text-[11px] text-studio-muted">
          Im <b>Overlay-Editor</b> gibt es die ✨-Zeile: Wunsch eintippen („Goal-Bar oben, Chat unten links, alles in Pink") → die KI baut dein Overlay um. Mit „Rückgängig", falls es nicht gefällt. Die KI nutzt nur die vorhandenen Widgets.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <label className="flex cursor-pointer items-start gap-2 text-[11px] text-studio-muted">
            <input type="radio" name="aiProvider" checked={aiProvider === 'gemini'}
              onChange={() => { setAiProvider('gemini'); void window.studio.updateSettings({ ai: { provider: 'gemini', model: aiModel } }); }} className="mt-0.5" />
            <span><b className="text-emerald-300">Google Gemini (gratis, empfohlen)</b> — kostenloser API-Key, 2 Minuten.</span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-[11px] text-studio-muted">
            <input type="radio" name="aiProvider" checked={aiProvider === 'ollama'}
              onChange={() => { setAiProvider('ollama'); void window.studio.updateSettings({ ai: { provider: 'ollama', model: aiModel } }); }} className="mt-0.5" />
            <span><b>Ollama (lokal)</b> — läuft komplett auf deinem PC, braucht installiertes Ollama.</span>
          </label>
        </div>
        {aiProvider === 'gemini' && (
          <>
            <button onClick={() => void window.studio.openExternal('https://aistudio.google.com/apikey')} className="bx-btn-accent mb-2 text-[11px]">
              <KeyRound size={13} /> Gratis Gemini-Key holen <ExternalLink size={11} className="opacity-70" />
            </button>
            <input
              type="password" value={aiKey}
              onChange={(e) => setAiKey(e.target.value)}
              onBlur={() => { const k = aiKey.trim(); if (k) { void window.studio.updateSettings({ aiApiKey: k }); setAiKeySet(true); toast('success', 'KI-Key gespeichert.'); } }}
              placeholder={aiKeySet ? '•••••••• (gesetzt — leer lassen zum Behalten)' : 'Gemini API-Key (AIza…) — gratis auf aistudio.google.com'}
              className="bx-input w-full font-mono text-xs"
            />
          </>
        )}
        <input
          value={aiModel}
          onChange={(e) => setAiModel(e.target.value)}
          onBlur={() => void window.studio.updateSettings({ ai: { provider: aiProvider, model: aiModel.trim() } })}
          placeholder={aiProvider === 'ollama' ? 'Modell (leer = llama3.1)' : 'Modell (leer = gemini-2.0-flash)'}
          className="bx-input mt-2 w-full font-mono text-xs"
        />
      </section>

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
          Kommagetrennt. Nachrichten, die eines dieser Wörter enthalten, werden <b>nicht vorgelesen</b> (TTS) — gilt auch für Ansagen/Begrüßungen (z.B. Slur im Nickname). Teilwort-Treffer, Groß/klein egal. Links werden immer entfernt.
        </p>
        <button
          onClick={() => {
            const merged = Array.from(new Set([
              ...blockedWords.split(',').map((w) => w.trim()).filter(Boolean),
              ...DEFAULT_BLOCKLIST,
            ]));
            setBlockedWords(merged.join(', '));
            void window.studio.updateSettings({ moderation: { blockedWords: merged } });
            toast('success', `Standard-Blockliste geladen (${merged.length} Einträge).`);
          }}
          className="bx-pill mt-2 text-[11px] hover:text-studio-accent"
          title="Kuratierte Liste gängiger Beleidigungen/Slurs (DE/EN) zu deiner Liste hinzufügen"
        >
          <ShieldCheck size={12} /> Standard-Blockliste laden
        </button>
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
            {update.state === 'error' && `Update-Check gerade nicht möglich (${update.message ?? 'unbekannt'}) — kein Problem, die App prüft stündlich automatisch weiter.`}
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
          <button onClick={() => void window.studio.openGiftImages()} className="bx-pill hover:text-studio-teal" title="Lokal gespeicherte Gift-Bilder (werden beim Verbinden automatisch gesichert)">
            <Gift size={13} /> Geschenk-Bilder öffnen
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
        <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-studio-border/60 p-3 text-[11px] text-studio-muted">
          <input
            type="checkbox" checked={autoBackup}
            onChange={(e) => { setAutoBackup(e.target.checked); void window.studio.updateSettings({ autoBackup: e.target.checked }); }}
            className="mt-0.5"
          />
          <span>
            <b className="text-studio-fg">Tägliches Auto-Backup</b> — sichert die Konfiguration automatisch 1×/Tag in den Datenordner (Unterordner „backups", die letzten 7 bleiben). Empfohlen.
          </span>
        </label>
        <p className="mt-2 text-[10px] text-studio-muted/70">
          Bei Problemen: „Logs öffnen" — dort liegt für jeden App-Start eine Datei mit allem, was passiert/failt.
        </p>
      </section>

      <ThirdPartyLicenses />
    </div>
  );
}
