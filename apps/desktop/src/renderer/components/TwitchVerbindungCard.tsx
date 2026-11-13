// TwitchVerbindungCard — Abschnitt „Twitch-Verbindung" in den Einstellungen.
//
// Ablauf für den Streamer: eigene Client-ID eintragen (einmalig), „Mit Twitch
// verbinden" drücken, den angezeigten Code im Browser bestätigen — fertig.
// Danach verbindet die App beim Start von selbst (abschaltbar).
//
// Die Tokens sieht diese Oberfläche nie — nur den Stand aus dem Hauptprozess
// (useTwitchStatus: Push + einmaliger Pull).
import { useEffect, useState } from 'react';
import { Check, ClipboardCopy, ExternalLink, Tv } from 'lucide-react';
import { toast } from './ToastHost';
import { useTwitchStatus } from '../hooks/useTwitchStatus';
import type { TwitchUiStatus } from '../../main/services/twitch-steuerung';

const TWITCH_LILA = '#9146ff';
/** Dieselbe Regel wie im Hauptprozess (istGueltigeTwitchClientId). */
const CLIENT_ID_MUSTER = /^[a-z0-9]{1,64}$/i;

interface Code {
  userCode: string;
  verificationUri: string;
  expiresIn: number;
}

function statusZeile(t: TwitchUiStatus): { text: string; gut: boolean } {
  if (t.anmeldungLaeuft) return { text: 'Warte auf deine Bestätigung im Browser …', gut: false };
  const live = t.live === true ? ' · Live: ja' : t.live === false ? ' · Live: nein' : '';
  switch (t.status) {
    case 'verbunden': return { text: `Verbunden als ${t.login ?? '…'}${live}`, gut: true };
    case 'verbinde': return { text: 'Verbinde mit Twitch …', gut: false };
    case 'getrennt': return { text: 'Getrennt – verbinde neu …', gut: false };
    case 'neu-anmelden': return { text: 'Bitte neu verbinden', gut: false };
    case 'fehler': return { text: `Problem mit Twitch${t.detail ? `: ${t.detail}` : ''}`, gut: false };
    default:
      return t.angemeldet
        ? { text: `Angemeldet als ${t.login ?? '…'}, gerade nicht verbunden`, gut: false }
        : { text: 'Nicht verbunden', gut: false };
  }
}

export default function TwitchVerbindungCard() {
  const twitch = useTwitchStatus();
  const [clientId, setClientId] = useState('');
  const [autoConnect, setAutoConnect] = useState(true);
  const [code, setCode] = useState<Code | null>(null);
  const [beschaeftigt, setBeschaeftigt] = useState(false);

  useEffect(() => {
    void window.studio.getSettings().then((s: { twitchClientId?: string; twitchAutoConnect?: boolean }) => {
      setClientId(s.twitchClientId ?? '');
      setAutoConnect(s.twitchAutoConnect !== false);
    });
  }, []);

  // Anmeldung vorbei (geklappt, abgelaufen, abgebrochen) → Code ausblenden.
  useEffect(() => {
    if (!twitch.anmeldungLaeuft) setCode(null);
  }, [twitch.anmeldungLaeuft]);

  const idGueltig = CLIENT_ID_MUSTER.test(clientId.trim());

  const speichereClientId = () => {
    const id = clientId.trim();
    if (id && !CLIENT_ID_MUSTER.test(id)) {
      toast('error', 'Die Client-ID besteht nur aus Buchstaben und Ziffern — bitte nochmal vollständig kopieren.');
      return;
    }
    void window.studio.updateSettings({ twitchClientId: id });
  };

  const verbinden = async () => {
    setBeschaeftigt(true);
    try {
      const r = await window.studio.twitchBeginLogin();
      if (r.ok) setCode({ userCode: r.userCode, verificationUri: r.verificationUri, expiresIn: r.expiresIn });
      else toast('error', r.error);
    } finally {
      setBeschaeftigt(false);
    }
  };

  const trennen = async () => {
    setBeschaeftigt(true);
    try {
      const r = await window.studio.twitchLogout();
      if (!r.ok) toast('error', r.error ?? 'Abmelden hat nicht geklappt.');
    } finally {
      setBeschaeftigt(false);
    }
  };

  const jetztVerbinden = async () => {
    const r = await window.studio.twitchConnect();
    if (!r.ok) toast('error', r.error ?? 'Verbinden hat nicht geklappt.');
  };

  const zeile = statusZeile(twitch);
  const zeigeVerbindenKnopf = !twitch.angemeldet || twitch.status === 'neu-anmelden';

  return (
    <section className="mb-5 break-inside-avoid bx-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-gold">
          <Tv size={15} style={{ color: TWITCH_LILA }} /> Twitch-Verbindung
        </h2>
        <span className={`flex items-center gap-1.5 text-[11px] font-bold ${zeile.gut ? 'text-emerald-300' : 'text-studio-muted'}`}>
          <span className={`h-2 w-2 rounded-full ${zeile.gut ? 'bg-emerald-400' : 'bg-studio-muted'}`} />
          {zeile.gut ? 'Verbunden' : twitch.angemeldet ? 'Angemeldet' : 'Nicht verbunden'}
        </span>
      </div>

      <p className="mb-1 text-[11px] text-studio-muted">
        Holt Follows, Chat, Subs, Bits und Raids von deinem Twitch-Kanal in die App — getrennt von TikTok.
        Welches Overlay was zeigt, stellst du je Overlay ein.
      </p>
      <p className="mb-3 text-[10px] leading-relaxed text-studio-muted/80">
        So bekommst du eine Client-ID:{' '}
        <button
          onClick={() => void window.studio.openExternal('https://dev.twitch.tv/console')}
          className="font-bold text-studio-teal hover:underline"
        >
          dev.twitch.tv/console
        </button>{' '}
        → Anwendung registrieren → Weiterleitungs-URL <code className="rounded bg-black/40 px-1 font-mono">https://localhost</code>,
        Kategorie <b className="text-studio-text/90">Application Integration</b>, Client-Typ{' '}
        <b className="text-studio-text/90">Öffentlich</b> → Client-ID hier einfügen.
        Ein Geheimnis (Client Secret) brauchst du nicht.
      </p>

      <label className="block text-[11px] uppercase tracking-widest text-studio-muted">Twitch Client-ID</label>
      <input
        type="text" value={clientId}
        onChange={(e) => setClientId(e.target.value)}
        onBlur={speichereClientId}
        placeholder="z. B. abc123def456…" className="bx-input mt-1.5 w-full font-mono text-xs"
      />
      {clientId.trim() && !idGueltig && (
        <p className="mt-1 text-[10px] text-studio-accent">Nur Buchstaben und Ziffern — da ist noch ein Zeichen zu viel drin.</p>
      )}

      {/* Status */}
      <p className="mt-3 text-[11px] font-bold" style={{ color: zeile.gut ? TWITCH_LILA : undefined }}>
        {zeile.text}
      </p>
      {twitch.loginFehler && <p className="mt-1 text-[11px] text-studio-accent">{twitch.loginFehler}</p>}
      {!twitch.loginFehler && twitch.status === 'neu-anmelden' && twitch.detail && (
        <p className="mt-1 text-[10px] text-studio-muted/80">{twitch.detail}</p>
      )}

      {/* Code anzeigen, solange auf die Bestätigung gewartet wird */}
      {code && twitch.anmeldungLaeuft && (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: TWITCH_LILA }}>
          <p className="text-[11px] text-studio-muted">Dein Code — im Browser eingeben bzw. bestätigen:</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="select-all font-mono text-3xl font-black tracking-[0.2em] text-studio-fg">{code.userCode}</span>
            <button
              onClick={() => { void window.studio.copyText(code.userCode); toast('success', 'Code kopiert.'); }}
              className="bx-pill flex items-center gap-1 px-2 py-1 text-[11px] hover:text-studio-accent"
            >
              <ClipboardCopy size={12} /> Code kopieren
            </button>
          </div>
          <p className="mt-2 flex items-center gap-1 text-[11px] text-studio-muted">
            <ExternalLink size={12} /> Im Browser bestätigen (öffnet sich automatisch).
            Der Code gilt {Math.max(1, Math.round(code.expiresIn / 60))} Minuten.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {zeigeVerbindenKnopf && (
          <button
            onClick={() => void verbinden()}
            disabled={!idGueltig || beschaeftigt}
            className="bx-btn-accent disabled:opacity-40"
          >
            <Tv size={14} /> {twitch.anmeldungLaeuft ? 'Neuen Code holen' : 'Mit Twitch verbinden'}
          </button>
        )}
        {twitch.angemeldet && twitch.status === 'aus' && !twitch.anmeldungLaeuft && (
          <button onClick={() => void jetztVerbinden()} className="bx-pill text-[11px] hover:text-studio-accent">
            <Check size={12} className="mr-1 inline" /> Jetzt verbinden
          </button>
        )}
        {(twitch.angemeldet || twitch.anmeldungLaeuft) && (
          <button
            onClick={() => void trennen()}
            disabled={beschaeftigt}
            className="bx-pill ml-auto text-[11px] hover:text-studio-accent disabled:opacity-40"
          >
            Trennen
          </button>
        )}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-lg border border-studio-border/60 p-3 text-[11px] text-studio-muted">
        <input
          type="checkbox" checked={autoConnect}
          onChange={(e) => { setAutoConnect(e.target.checked); void window.studio.updateSettings({ twitchAutoConnect: e.target.checked }); }}
          className="mt-0.5"
        />
        <span>
          <b className="text-studio-fg">Beim Start automatisch mit Twitch verbinden</b> — einmal angemeldet, verbindet die App
          bei jedem Start von selbst und erneuert die Anmeldung im Hintergrund.
        </span>
      </label>
    </section>
  );
}
