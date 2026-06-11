// TtsPage — Stimme von bOtExE Studio: Chat vorlesen (wie TikFinity),
// Stimmen testen, Verhalten einstellen. Gesprochen wird lokal über die App.
import { useEffect, useState } from 'react';

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

interface TtsSettings {
  enabled: boolean;
  voice: string;
  volume: number;
  readChat: boolean;
  chatVoiceMode: 'fixed' | 'perUser';
  skipCommands: boolean;
  maxTextLen: number;
  chatTemplate: string;
}

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

  const refreshVoices = () =>
    window.studio.getTtsVoices().then((v: VoiceGroup[]) => setGroups(v));
  const refreshByok = () =>
    window.studio.getByokStatus().then((s: Record<string, boolean>) => setByokStatus(s));

  useEffect(() => {
    void refreshVoices();
    void refreshByok();
    void window.studio.getByokProviders().then((p: ByokProvider[]) => setByokProviders(p));
    void window.studio.getSettings().then((s: { tts: TtsSettings }) => setTts(s.tts));
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
          <h1 className="font-display text-lg uppercase">Stimme (TTS)</h1>
          <p className="mt-1 text-xs text-studio-muted">
            bOtExE liest Chat-Nachrichten vor und spricht Trigger-Ansagen — kostenlos über Edge-TTS, Wiedergabe lokal über dein System-Audio.
          </p>
        </div>
        <button
          onClick={() => update({ enabled: !tts.enabled })}
          className={`clip-slant px-5 py-2.5 font-display text-sm ${
            tts.enabled ? 'bg-studio-teal text-black' : 'bg-studio-raised text-studio-muted'
          }`}
        >
          {tts.enabled ? 'TTS AKTIV' : 'TTS AUS'}
        </button>
      </div>

      {/* Stimme + Test */}
      <section className="border border-studio-border bg-studio-panel p-4">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.3em] text-studio-muted">Standard-Stimme</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={currentVoice}
            onChange={(e) => update({ voice: e.target.value })}
            className="border border-studio-border bg-studio-raised px-3 py-2 text-sm outline-none focus:border-studio-accent"
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
              className="clip-slant bg-studio-gold/15 px-4 py-2 text-xs font-bold text-studio-gold hover:bg-studio-gold hover:text-black disabled:opacity-50"
            >
              {piperBusy ? '⬇ Lädt… (einmalig, ~25–80 MB)' : '⬇ STIMME VORBEREITEN'}
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
        <div className="mt-3 flex gap-2">
          <input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            className="clip-slant flex-1 border border-studio-border bg-studio-raised px-4 py-2 text-sm outline-none focus:border-studio-teal"
          />
          <button
            onClick={() => void window.studio.testTts(testText, tts.voice)}
            className="clip-slant bg-studio-teal/15 px-5 py-2 text-sm font-bold text-studio-teal hover:bg-studio-teal hover:text-black"
          >
            ▶ VORLESEN
          </button>
        </div>
      </section>

      {/* Chat vorlesen */}
      <section className="border border-studio-border bg-studio-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-studio-muted">Chat vorlesen</h2>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox" checked={tts.readChat}
              onChange={(e) => update({ readChat: e.target.checked })}
              className="accent-[#21e6c1]"
            />
            Jede Chat-Nachricht vorlesen
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="text-[10px] uppercase tracking-widest text-studio-muted">
            Stimmen-Modus
            <select
              value={tts.chatVoiceMode}
              onChange={(e) => update({ chatVoiceMode: e.target.value as 'fixed' | 'perUser' })}
              className="mt-1 w-full border border-studio-border bg-studio-raised px-2 py-2 text-xs text-studio-text outline-none"
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
              className="mt-1 w-full border border-studio-border bg-studio-raised px-2 py-2 font-mono text-xs text-studio-text outline-none"
            />
            <span className="mt-0.5 block text-[9px] normal-case tracking-normal text-studio-muted/70">
              Platzhalter: {'{user}'} und {'{text}'}
            </span>
          </label>
          <label className="flex items-center gap-2 text-xs normal-case">
            <input
              type="checkbox" checked={tts.skipCommands}
              onChange={(e) => update({ skipCommands: e.target.checked })}
              className="accent-[#21e6c1]"
            />
            Befehle (!…) überspringen
          </label>
          <label className="text-[10px] uppercase tracking-widest text-studio-muted">
            Max. Zeichen pro Nachricht
            <input
              type="number" value={tts.maxTextLen}
              onChange={(e) => update({ maxTextLen: Number(e.target.value) })}
              className="mt-1 w-28 border border-studio-border bg-studio-raised px-2 py-1.5 font-mono text-xs outline-none"
            />
          </label>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-studio-muted">
          Troll-Schutz ist immer aktiv: Links fliegen raus, Emoji- und Zeichen-Spam wird eingedampft,
          lange Texte werden gekürzt, und bei Nachrichten-Fluten liest bOtExE nur die neuesten vor.
        </p>
      </section>

      {/* Premium- / KI-Stimmen (BYOK) */}
      <section className="border border-studio-border bg-studio-panel p-4">
        <h2 className="mb-1 text-[11px] font-bold uppercase tracking-[0.3em] text-studio-gold">
          Premium- & KI-Stimmen (eigene Keys)
        </h2>
        <p className="mb-3 text-[11px] leading-relaxed text-studio-muted">
          Trag deinen eigenen Zugang ein — die Stimmen erscheinen dann oben im Dropdown. Jeder Dienst rechnet über
          deinen eigenen Account ab, du entscheidest selbst, was du nutzt. Keys bleiben lokal auf diesem Rechner.
        </p>
        <div className="flex flex-col gap-2">
          {byokProviders.map((p) => {
            const configured = byokStatus[p.id];
            const open = openProvider === p.id;
            const draft = byokDrafts[p.id] ?? {};
            return (
              <div key={p.id} className="border border-studio-border bg-studio-raised">
                <button
                  onClick={() => setOpenProvider(open ? null : p.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                  <span className={`clip-slant px-2 py-0.5 text-[9px] font-bold tracking-widest ${
                    configured ? 'bg-studio-teal/15 text-studio-teal' : 'bg-studio-bg text-studio-muted'
                  }`}>
                    {configured ? '✓ AKTIV' : 'AUS'}
                  </span>
                  <span className="flex-1 text-sm font-bold">{p.label}</span>
                  <span className="text-studio-muted">{open ? '▲' : '▼'}</span>
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
                            className="mt-1 w-full border border-studio-border bg-studio-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-studio-gold"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => void saveByok(p.id)}
                        className="clip-slant bg-studio-gold/15 px-4 py-1.5 text-xs font-bold text-studio-gold hover:bg-studio-gold hover:text-black"
                      >
                        SPEICHERN
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

      <p className="text-[11px] text-studio-muted">
        💡 In den <b>Trigger-Regeln</b> gibt es jetzt auch die Aktion „Ansage sprechen" — z.B.
        „Gift ≥ 100 → <i>{'{user}'} hat {'{count}'}x {'{gift}'} geschickt, vielen Dank!</i>"
      </p>
    </div>
  );
}
