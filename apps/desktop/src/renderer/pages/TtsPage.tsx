// TtsPage — Stimme von bOtExE Studio: Chat vorlesen (wie TikFinity),
// Stimmen testen, Verhalten einstellen. Gesprochen wird lokal über die App.
import { AnAusSchalter } from '../components/AnAusSchalter';
import { useEffect, useState } from 'react';
import {
  Mic,
  Volume2,
  Play,
  Download,
  MessageSquare,
  Sparkles,
  Check,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  AlertTriangle,
  Sliders,
  RotateCcw,
} from 'lucide-react';
import { providerFromVoice } from '../../shared/tts-voice';

/** Ein Regler aus TUNING_SPECS (main/services/tts-tuning.ts) — reine Daten,
 *  kommen per IPC (getTuningSpecs) in den Renderer, siehe TuningSection unten. */
interface TuningParam {
  key: string;
  label: string;
  hint: string;
  min?: number;
  max?: number;
  step?: number;
  default: number | string;
  options?: Array<{ value: string; label: string }>;
}

/** Anzeigename je Anbieter für die Feineinstellungs-Überschrift — bekannte
 *  Anbieter bekommen einen kurzen, Streamer-verständlichen Namen; unbekannte
 *  (z.B. neue BYOK-Anbieter) fallen auf den Anfang ihres Gruppen-Labels zurück. */
const PROVIDER_FRIENDLY_LABEL: Record<string, string> = {
  edge: 'Edge (online)',
  piper: 'Lokal (Piper)',
  gtts: 'Google Robo',
  openai: 'OpenAI-kompatibel',
  polly: 'Amazon Polly',
  elevenlabs: 'ElevenLabs',
  ttsmonster: 'TTS.Monster',
};

function friendlyProviderLabel(provider: string, groups: VoiceGroup[]): string {
  if (PROVIDER_FRIENDLY_LABEL[provider]) return PROVIDER_FRIENDLY_LABEL[provider];
  const group = groups.find((g) => g.provider === provider);
  return group ? (group.label.split(' — ')[0] ?? group.label) : provider;
}

/** Feineinstellung — zeigt NUR die Regler, die der Anbieter der gewählten
 *  Stimme tatsächlich unterstützt (statt der alten festen Tempo/Tonhöhe-Regler,
 *  die bei Piper stillschweigend gar nichts taten). Jeder Regler erklärt sich
 *  selbst per sichtbarem Hinweistext, nicht nur per Tooltip. */
function TuningSection({
  provider,
  providerLabel,
  params,
  values,
  onChange,
  onReset,
}: {
  provider: string;
  providerLabel: string;
  params: TuningParam[];
  values: Record<string, number | string>;
  onChange: (key: string, value: number | string) => void;
  onReset: () => void;
}) {
  return (
    <section className="bx-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-gold">
          <Sliders size={15} /> Feineinstellung — {providerLabel}
        </h2>
        {params.length > 0 && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 text-[11px] text-studio-muted hover:text-studio-accent"
          >
            <RotateCcw size={12} /> Auf Standard zurücksetzen
          </button>
        )}
      </div>
      {params.length === 0 ? (
        <p className="text-[11px] text-studio-muted">
          Für diese Stimme gibt es keine Feineinstellungen.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {params.map((p) => {
            const value = values[p.key] ?? p.default;
            return (
              <div key={p.key} className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                  <span className="w-40 shrink-0 text-xs font-bold text-studio-fg">{p.label}</span>
                  {p.options ? (
                    <select
                      value={String(value)}
                      onChange={(e) => onChange(p.key, e.target.value)}
                      className="bx-select flex-1 text-xs"
                    >
                      {p.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        type="range"
                        min={p.min}
                        max={p.max}
                        step={p.step}
                        value={Number(value)}
                        onChange={(e) => onChange(p.key, Number(e.target.value))}
                        className="min-w-0 flex-1 accent-[#21e6c1]"
                      />
                      <span className="w-12 shrink-0 text-right font-mono text-xs">{value}</span>
                    </>
                  )}
                </div>
                <p className="pl-[10.75rem] text-[10px] leading-snug text-studio-muted">{p.hint}</p>
              </div>
            );
          })}
        </div>
      )}
      {provider === 'gtts' && (
        <p className="mt-3 text-[10px] leading-snug text-studio-muted/80">
          Google Robo ist ein inoffizieller Dienst ohne bestätigte Einstell-Parameter — kann jederzeit brechen.
        </p>
      )}
    </section>
  );
}

interface TtsVoice {
  id: string;
  name: string;
  language: string;
  ready: boolean;
}

interface VoiceGroup {
  provider: string;
  label: string;
  voices: TtsVoice[];
}

type ReadGroup = 'all' | 'followers' | 'subs' | 'mods' | 'vips';
interface AnnounceCfg { enabled: boolean; template: string; voice: string }
interface GiftAnnounceCfg extends AnnounceCfg { minCoins: number }

interface TtsSettings {
  enabled: boolean;
  voice: string;
  volume: number;
  rate?: number;
  pitch?: number;
  readChat: boolean;
  chatVoiceMode: 'fixed' | 'perUser';
  skipCommands: boolean;
  maxTextLen: number;
  chatTemplate: string;
  readGroups?: ReadGroup[];
  teamMinLevel?: number;
  readPrefix?: string;
  announceFollow?: AnnounceCfg;
  announceGift?: GiftAnnounceCfg;
  /** Regler-Werte PRO ANBIETER (edge/piper/openai/…), siehe tts-tuning.ts. */
  tuning?: Record<string, Record<string, number | string>>;
}

const READ_GROUP_LABELS: { id: ReadGroup; label: string }[] = [
  { id: 'all', label: 'Alle Zuschauer' },
  { id: 'followers', label: 'Follower' },
  { id: 'subs', label: 'Superfans' },
  { id: 'mods', label: 'Moderatoren' },
  { id: 'vips', label: 'Meine VIPs (Zuschauer-Tab)' },
];

interface ByokField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder?: string;
  optional?: boolean;
}

interface ByokProvider {
  id: string;
  label: string;
  howto: string;
  fields: ByokField[];
}

/** Stimmen-Dropdown (für Ansage-Blöcke) — "" = Standard-Stimme. */
function VoiceSelect({ groups, value, onChange }: { groups: VoiceGroup[]; value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="bx-select mt-1 text-xs">
      <option value="">Standard-Stimme</option>
      {groups.map((g) => (
        <optgroup key={g.provider} label={g.label}>
          {g.voices.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Dedizierte Event-Ansagen (neue Follower / große Gifts) — unabhängig vom Chat. */
function AnnounceSection({
  tts,
  groups,
  update,
}: {
  tts: TtsSettings;
  groups: VoiceGroup[];
  update: (p: Partial<TtsSettings>) => void;
}) {
  const af = tts.announceFollow ?? { enabled: false, template: '{user} folgt jetzt! ❤️', voice: '' };
  const ag = tts.announceGift ?? { enabled: false, template: '{user} schenkt {gift}!', voice: '', minCoins: 1000 };
  return (
    <section className="bx-card p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-gold">
        <Volume2 size={15} /> Ansagen (Ereignisse vorlesen)
      </h2>
      <div className="flex flex-col gap-4">
        {/* Neue Follower */}
        <AnAusSchalter
          an={af.enabled}
          onChange={(an) => update({ announceFollow: { ...af, enabled: an } })}
          titel="Neue Follower ansagen"
          beschreibung="Sagt den Namen an, wenn dir jemand neu folgt."
          kinder={(
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex-1 text-[10px] uppercase tracking-widest text-studio-muted">
              Text
              <input value={af.template} onChange={(e) => update({ announceFollow: { ...af, template: e.target.value } })}
                className="bx-input mt-1 font-mono text-xs" />
            </label>
            <label className="text-[10px] uppercase tracking-widest text-studio-muted">
              Stimme
              <VoiceSelect groups={groups} value={af.voice} onChange={(v) => update({ announceFollow: { ...af, voice: v } })} />
            </label>
          </div>
          )}
        />
        {/* Große Gifts */}
        <AnAusSchalter
          an={ag.enabled}
          onChange={(an) => update({ announceGift: { ...ag, enabled: an } })}
          titel="Große Gifts ansagen"
          beschreibung="Sagt Geschenke an — erst ab der Coin-Grenze unten."
          kinder={(<>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[10px] uppercase tracking-widest text-studio-muted">
              Ab Coins
              <input type="number" value={ag.minCoins} min={0}
                onChange={(e) => update({ announceGift: { ...ag, minCoins: Math.max(0, Number(e.target.value) || 0) } })}
                className="bx-input mt-1 w-24 font-mono text-xs" />
            </label>
            <label className="flex-1 text-[10px] uppercase tracking-widest text-studio-muted">
              Text
              <input value={ag.template} onChange={(e) => update({ announceGift: { ...ag, template: e.target.value } })}
                className="bx-input mt-1 font-mono text-xs" />
            </label>
            <label className="text-[10px] uppercase tracking-widest text-studio-muted">
              Stimme
              <VoiceSelect groups={groups} value={ag.voice} onChange={(v) => update({ announceGift: { ...ag, voice: v } })} />
            </label>
          </div>
          <span className="mt-1.5 block text-[9px] tracking-normal text-studio-muted/80">
            Platzhalter: {'{user}'}, {'{gift}'}, {'{count}'}, {'{coins}'}
          </span>
          </>)}
        />
        <p className="text-[11px] leading-relaxed text-studio-muted">
          Tipp: Wenn du für Follower/Gifts bereits eigene „Sprechen"-Trigger angelegt hast, kann es sonst
          <b> doppelt</b> vorgelesen werden — dann hier oder dort eins ausschalten.
        </p>
      </div>
    </section>
  );
}


export default function TtsPage() {
  const [groups, setGroups] = useState<VoiceGroup[]>([]);
  const [tts, setTts] = useState<TtsSettings | null>(null);
  const [testText, setTestText] = useState('bOtExE Studio ist bereit — danke für die Rose, Mia!');
  const [piperBusy, setPiperBusy] = useState(false);
  const [piperError, setPiperError] = useState('');
  const [byokProviders, setByokProviders] = useState<ByokProvider[]>([]);
  const [byokStatus, setByokStatus] = useState<Record<string, boolean>>({});
  const [byokDrafts, setByokDrafts] = useState<Record<string, Record<string, string>>>({});
  const [openProvider, setOpenProvider] = useState<string | null>(null);
  const [tuningSpecs, setTuningSpecs] = useState<Record<string, TuningParam[]>>({});

  const refreshVoices = () =>
    window.studio.getTtsVoices().then((v: VoiceGroup[]) => setGroups(v));
  const refreshByok = () =>
    window.studio.getByokStatus().then((s: Record<string, boolean>) => setByokStatus(s));

  useEffect(() => {
    void refreshVoices();
    void refreshByok();
    void window.studio.getByokProviders().then((p: ByokProvider[]) => setByokProviders(p));
    void window.studio.getSettings().then((s: { tts: TtsSettings }) => setTts(s.tts));
    void window.studio.getTuningSpecs().then((s: Record<string, TuningParam[]>) => setTuningSpecs(s));
  }, []);

  const saveByok = async (provider: string) => {
    const fields = byokDrafts[provider] ?? {};
    await window.studio.setByokCredentials(provider, fields);
    setByokDrafts((d) => ({ ...d, [provider]: {} }));
    await refreshByok();
    await refreshVoices();
    setOpenProvider(null);
  };

  const clearByok = async (provider: string, fields: ByokField[]) => {
    const empty: Record<string, string> = {};
    for (const f of fields) empty[f.key] = '';
    await window.studio.setByokCredentials(provider, empty);
    await refreshByok();
    await refreshVoices();
  };

  const update = (patch: Partial<TtsSettings>) => {
    if (!tts) return;
    const next = { ...tts, ...patch };
    setTts(next);
    void window.studio.updateSettings({ tts: patch });
  };

  if (!tts) return <div className="p-6 text-studio-muted">Lade…</div>;

  // Legacy-Stimmen (v2-Settings) ohne Namespace → edge:
  const currentVoice = tts.voice.includes(':') ? tts.voice : `edge:${tts.voice}`;
  const allVoices = groups.flatMap((g) => g.voices);
  const selectedVoice = allVoices.find((v) => v.id === currentVoice);
  const needsPiperSetup = currentVoice.startsWith('piper:') && selectedVoice && !selectedVoice.ready;

  // Feineinstellung: nur die Regler des Anbieters der GEWÄHLTEN Stimme —
  // vorher gab es feste Tempo/Tonhöhe-Regler, die bei Piper stillschweigend
  // nichts bewirkten (echte Nutzer-Beschwerde).
  const tuningProvider = providerFromVoice(tts.voice);
  const tuningParams = tuningSpecs[tuningProvider] ?? [];
  const tuningValues = tts.tuning?.[tuningProvider] ?? {};
  const setTuning = (key: string, value: number | string) => {
    update({
      tuning: {
        ...(tts.tuning ?? {}),
        [tuningProvider]: { ...(tts.tuning?.[tuningProvider] ?? {}), [key]: value },
      },
    });
  };
  const resetTuning = () => {
    update({ tuning: { ...(tts.tuning ?? {}), [tuningProvider]: {} } });
  };

  const runPiperSetup = async () => {
    setPiperBusy(true);
    setPiperError('');
    try {
      const r = (await window.studio.setupPiper(currentVoice)) as { ok: boolean; error?: string };
      if (!r.ok) setPiperError(r.error ?? 'Setup fehlgeschlagen');
      await refreshVoices();
    } finally {
      setPiperBusy(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl uppercase">
            <Mic size={20} className="text-studio-teal" /> Stimme (TTS)
          </h1>
          <p className="mt-1 text-xs text-studio-muted">
            bOtExE liest Chat-Nachrichten vor und spricht Trigger-Ansagen — kostenlos über Edge-TTS, Wiedergabe lokal über dein System-Audio.
          </p>
        </div>
        <button
          onClick={() => update({ enabled: !tts.enabled })}
          className={`clip-slant px-5 py-2.5 font-display text-sm ${
            tts.enabled ? 'bg-studio-teal text-black' : 'border border-studio-control-border bg-studio-control text-studio-muted'
          }`}
        >
          {tts.enabled ? 'TTS AKTIV' : 'TTS AUS'}
        </button>
      </div>

      {/* Stimme + Test */}
      <section className="bx-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-gold">
          <Volume2 size={15} /> Standard-Stimme
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={currentVoice}
            onChange={(e) => update({ voice: e.target.value })}
            className="bx-select w-auto"
          >
            {groups.map((g) => (
              <optgroup key={g.provider} label={g.label}>
                {g.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}{!v.ready ? ' (noch nicht geladen)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {needsPiperSetup && (
            <button
              onClick={() => void runPiperSetup()}
              disabled={piperBusy}
              className="bx-pill border-studio-gold/40 text-studio-gold hover:border-studio-gold hover:text-studio-gold disabled:opacity-50"
            >
              <Download size={13} />
              {piperBusy ? 'Lädt… (einmalig, ~25–80 MB)' : 'STIMME VORBEREITEN'}
            </button>
          )}
          {piperError && <span className="text-xs text-studio-accent">{piperError}</span>}
          <label className="flex w-56 items-center gap-2 text-xs text-studio-muted">
            Lautstärke
            <input
              type="range" min={0} max={1} step={0.05} value={tts.volume}
              onChange={(e) => update({ volume: Number(e.target.value) })}
              className="flex-1 accent-[#21e6c1]"
            />
            <span className="w-9 font-mono">{Math.round(tts.volume * 100)}%</span>
          </label>
        </div>
        <p className="mt-1 text-[10px] text-studio-muted/70">
          Lautstärke wirkt global (Mischpult) — Tempo/Klang je Anbieter stellst du unten bei „Feineinstellung" ein.
        </p>
        {!needsPiperSetup && selectedVoice?.ready && (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-studio-teal">
            <Check size={13} /> Diese Stimme ist sofort bereit — kein Download nötig{currentVoice.startsWith('edge:') ? ' (Cloud-Stimme über Microsoft Edge, gratis)' : ''}. Tipp ein Wort und klick VORLESEN.
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="bx-input flex-1"
          />
          <button
            onClick={() => void window.studio.testTts(testText, tts.voice)}
            className="bx-btn-accent shrink-0"
          >
            <Play size={14} /> VORLESEN
          </button>
        </div>
      </section>

      <TuningSection
        provider={tuningProvider}
        providerLabel={friendlyProviderLabel(tuningProvider, groups)}
        params={tuningParams}
        values={tuningValues}
        onChange={setTuning}
        onReset={resetTuning}
      />

      {/* Chat vorlesen */}
      <section className="bx-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-gold">
          <MessageSquare size={15} /> Chat vorlesen
        </h2>
        <AnAusSchalter
          an={tts.readChat}
          onChange={(an) => update({ readChat: an })}
          titel="Jede Chat-Nachricht vorlesen"
          beschreibung="Liest mit, was im Chat geschrieben wird."
          hinweis="Follower- und Gift-Ansagen laufen weiter — die hängen an ihren eigenen Schaltern oben, nicht an diesem."
          kinder={(
        <div className="grid grid-cols-2 gap-4">
          <label className="text-[10px] uppercase tracking-widest text-studio-muted">
            Stimmen-Modus
            <select
              value={tts.chatVoiceMode}
              onChange={(e) => update({ chatVoiceMode: e.target.value as 'fixed' | 'perUser' })}
              className="bx-select mt-1 text-xs"
            >
              <option value="perUser">Eigene Stimme pro Zuschauer (stabil zugelost)</option>
              <option value="fixed">Eine Stimme für alle</option>
            </select>
          </label>
          <label className="text-[10px] uppercase tracking-widest text-studio-muted">
            Vorlese-Format
            <input
              value={tts.chatTemplate}
              onChange={(e) => update({ chatTemplate: e.target.value })}
              className="bx-input mt-1 font-mono text-xs"
            />
            <span className="mt-0.5 block text-[9px] normal-case tracking-normal text-studio-muted/80">
              Platzhalter: {'{user}'} und {'{text}'}
            </span>
          </label>
          <div className="text-[10px] uppercase tracking-widest text-studio-muted">
            Wer wird vorgelesen <span className="normal-case tracking-normal text-studio-muted/80">(mehrere möglich)</span>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 normal-case">
              {READ_GROUP_LABELS.map((g) => {
                const groups = tts.readGroups ?? ['all'];
                return (
                  <label key={g.id} className="flex items-center gap-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={groups.includes(g.id)}
                      onChange={(e) => {
                        const cur = new Set<ReadGroup>(tts.readGroups ?? ['all']);
                        if (e.target.checked) cur.add(g.id);
                        else cur.delete(g.id);
                        update({ readGroups: [...cur] });
                      }}
                    />
                    {g.label}
                  </label>
                );
              })}
            </div>
            <span className="mt-1 block text-[9px] normal-case tracking-normal text-studio-muted/80">
              Vorgelesen wird, wer in mindestens einer angekreuzten Gruppe ist. Deine ★VIPs werden immer
              vorgelesen, Stumm-geschaltete nie. „Alle" liest jeden.
            </span>
            {/* Erscheint nur, wenn „Teamherz" angekreuzt ist — sonst waere es ein
                Regler ohne Wirkung. */}
            {(tts.readGroups ?? ['all']).includes('subs') && (
              <label className="mt-2 flex items-center gap-2 normal-case tracking-normal text-xs text-studio-text">
                Erst ab Teamherz-Stufe
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={tts.teamMinLevel ?? 0}
                  onChange={(e) => update({ teamMinLevel: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
                  className="bx-input w-16 font-mono text-xs"
                />
                <span className="text-[10px] text-studio-muted">0 = jede Stufe</span>
              </label>
            )}
            {(tts.readGroups ?? ['all']).includes('subs') && (tts.teamMinLevel ?? 0) > 0 && (
              <span className="mt-1 block text-[9px] normal-case tracking-normal text-studio-muted/80">
                TikTok schickt die Teamherz-Stufe mit. Kommt sie bei einer Nachricht ausnahmsweise
                nicht mit, wird trotzdem vorgelesen — lieber einmal zu viel, als einen echten
                Unterstützer stumm zu schalten.
              </span>
            )}
          </div>
          <label className="text-[10px] uppercase tracking-widest text-studio-muted">
            Nur mit Start-Zeichen
            <input
              value={tts.readPrefix ?? ''}
              onChange={(e) => update({ readPrefix: e.target.value.slice(0, 3) })}
              placeholder="z.B. ."
              className="bx-input mt-1 w-28 font-mono text-xs"
            />
            <span className="mt-0.5 block text-[9px] normal-case tracking-normal text-studio-muted/80">
              Leer = alle (wie oben gewählt). Mit „." werden <strong>nur</strong> Nachrichten mit Punkt
              vorgelesen — <strong>auch von Mods/Followern!</strong> (Punkt wird entfernt). Wenn jemand
              nicht vorgelesen wird, obwohl er sollte: hier auf leer prüfen.
            </span>
          </label>
          <label className="flex items-center gap-2 text-xs normal-case">
            <input
              type="checkbox" checked={tts.skipCommands}
              onChange={(e) => update({ skipCommands: e.target.checked })}
            />
            Befehle (!…) überspringen
          </label>
          <label className="text-[10px] uppercase tracking-widest text-studio-muted">
            Max. Zeichen pro Nachricht
            <input
              type="number" value={tts.maxTextLen}
              onChange={(e) => update({ maxTextLen: Number(e.target.value) })}
              className="bx-input mt-1 w-28 font-mono text-xs"
            />
          </label>
        </div>
          )}
        />
        <p className="mt-3 text-[11px] leading-relaxed text-studio-muted">
          Troll-Schutz ist immer aktiv: Links fliegen raus, Emoji- und Zeichen-Spam wird eingedampft,
          lange Texte werden gekürzt, und bei Nachrichten-Fluten liest bOtExE nur die neuesten vor.
        </p>
      </section>

      <AnnounceSection tts={tts} groups={groups} update={update} />

      {/* Premium- / KI-Stimmen (BYOK) */}
      <section className="bx-card p-5">
        <h2 className="mb-1 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-gold">
          <Sparkles size={15} /> Premium- & KI-Stimmen (eigene Keys)
        </h2>
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-studio-gold/40 bg-studio-gold/10 px-3 py-2 text-[11px] leading-relaxed text-studio-gold">
          <AlertTriangle size={14} className="mt-0.5 flex-none" />
          <span><b>Diese Stimmen kosten Geld.</b> Sie laufen über deine eigenen Cloud-API-Keys (Amazon, ElevenLabs, OpenAI …) und rechnen pro Zeichen/Minute über DEINEN Account ab. Prüfe die Preise beim Anbieter, bevor du einen Key einträgst. Die <b>Standard-Stimme oben ist gratis</b> und reicht für den Anfang.</span>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-studio-muted">
          Trag deinen eigenen Zugang ein — die Stimmen erscheinen dann oben im Dropdown. Keys bleiben lokal auf diesem Rechner.
        </p>
        <div className="flex flex-col gap-2">
          {byokProviders.map((p) => {
            const configured = byokStatus[p.id];
            const open = openProvider === p.id;
            const draft = byokDrafts[p.id] ?? {};
            return (
              <div
                key={p.id}
                className="overflow-hidden rounded-xl border border-studio-border bg-studio-raised/60"
              >
                <button
                  onClick={() => setOpenProvider(open ? null : p.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-widest ${
                    configured ? 'bg-studio-teal/15 text-studio-teal' : 'bg-studio-bg text-studio-muted'
                  }`}>
                    {configured ? <Check size={11} /> : null}
                    {configured ? 'AKTIV' : 'AUS'}
                  </span>
                  <span className="flex-1 text-sm font-bold">{p.label}</span>
                  <span className="text-studio-muted">
                    {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </span>
                </button>
                {open && (
                  <div className="border-t border-studio-border p-4">
                    <p className="mb-3 text-[11px] leading-relaxed text-studio-muted">{p.howto}</p>
                    <div className="flex flex-col gap-2">
                      {p.fields.map((f) => (
                        <label key={f.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          {f.label}{f.optional ? ' (optional)' : ''}
                          <input
                            type={f.type}
                            placeholder={f.placeholder}
                            value={draft[f.key] ?? ''}
                            onChange={(e) =>
                              setByokDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], [f.key]: e.target.value } }))
                            }
                            className="bx-input mt-1 font-mono text-xs"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => void saveByok(p.id)}
                        className="bx-pill border-studio-gold/40 text-studio-gold hover:border-studio-gold hover:text-studio-gold"
                      >
                        <Check size={13} /> SPEICHERN
                      </button>
                      {configured && (
                        <button
                          onClick={() => void clearByok(p.id, p.fields)}
                          className="text-xs text-studio-muted hover:text-studio-accent"
                        >
                          Entfernen
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <p className="flex items-start gap-2 text-[11px] text-studio-muted">
        <Lightbulb size={14} className="mt-0.5 shrink-0 text-studio-gold" />
        <span>
          In den <b>Trigger-Regeln</b> gibt es jetzt auch die Aktion „Ansage sprechen" — z.B.
          „Gift ≥ 100 → <i>{'{user}'} hat {'{count}'}x {'{gift}'} geschickt, vielen Dank!</i>"
        </span>
      </p>
    </div>
  );
}
