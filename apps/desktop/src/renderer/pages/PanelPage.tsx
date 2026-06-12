// PanelPage — manuelles Auslöse-Panel: Soundboard + Schnell-Aktionen, die per
// Klick ODER globalem Hotkey (auch wenn die App im Hintergrund ist) feuern.
// Wie ein Software-Stream-Deck.
import { useEffect, useRef, useState } from 'react';
import { Gamepad2, Plus, Trash2, Play, Volume2, Mic, Sparkles, Film, Keyboard, X, Hash } from 'lucide-react';
import type { PanelButton, TriggerAction } from '@botexe/trigger-engine';
import ConfirmButton from '../components/ConfirmButton';

interface SoundEntry { id: string; filename: string }
interface LayerRef { id: string; name: string; widgetType: string }
type ActKind = 'play_sound' | 'speak' | 'fire_alert' | 'play_media' | 'counter_add';

const ACT_META: { kind: ActKind; label: string; icon: typeof Play }[] = [
  { kind: 'play_sound', label: 'Sound', icon: Volume2 },
  { kind: 'speak', label: 'Ansage (TTS)', icon: Mic },
  { kind: 'fire_alert', label: 'Overlay-Alert', icon: Sparkles },
  { kind: 'play_media', label: 'Medium', icon: Film },
  { kind: 'counter_add', label: 'Counter ±', icon: Hash },
];

/** Electron-Accelerator aus einem Tastendruck bauen (null = ungültig). */
function accelFromEvent(e: React.KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.shiftKey) mods.push('Shift');
  if (e.altKey) mods.push('Alt');
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k)) return null;
  let key = '';
  if (/^[a-z]$/i.test(k)) key = k.toUpperCase();
  else if (/^[0-9]$/.test(k)) key = k;
  else if (/^F\d{1,2}$/.test(k)) key = k;
  else if (k === ' ') key = 'Space';
  else key = k;
  if (mods.length === 0 && !/^F\d/.test(key)) return null; // globaler Hotkey braucht Modifier (außer F-Tasten)
  return [...mods, key].join('+');
}

function newButton(): PanelButton {
  return { id: `pb-${Date.now().toString(36)}`, label: 'Neuer Knopf', action: { kind: 'play_sound', soundId: '' } };
}

export default function PanelPage() {
  const [buttons, setButtons] = useState<PanelButton[]>([]);
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [layers, setLayers] = useState<LayerRef[]>([]);
  const [recording, setRecording] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const recRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      setButtons((await window.studio.getPanelButtons()) as PanelButton[]);
      setSounds((await window.studio.listSounds()) as SoundEntry[]);
      const layouts = (await window.studio.listLayouts()) as { layers: LayerRef[] }[];
      setLayers(layouts.flatMap((l) => l.layers).map((l) => ({ id: l.id, name: l.name, widgetType: l.widgetType })));
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (recording) recRef.current?.focus();
  }, [recording]);

  const save = (next: PanelButton[]) => {
    setButtons(next);
    void window.studio.setPanelButtons(next as unknown as unknown[]);
  };
  const patch = (id: string, p: Partial<PanelButton>) => save(buttons.map((b) => (b.id === id ? { ...b, ...p } : b)));

  const setActKind = (b: PanelButton, kind: ActKind) => {
    const a: TriggerAction =
      kind === 'play_sound' ? { kind, soundId: '' }
      : kind === 'speak' ? { kind, template: '' }
      : kind === 'counter_add' ? { kind, targetId: '', delta: 1 }
      : { kind, targetId: '' };
    patch(b.id, { action: a });
  };
  const setActValue = (b: PanelButton, value: string) => {
    const k = b.action.kind;
    const a: TriggerAction =
      k === 'play_sound' ? { kind: 'play_sound', soundId: value }
      : k === 'speak' ? { kind: 'speak', template: value }
      : k === 'fire_alert' ? { kind: 'fire_alert', targetId: value }
      : k === 'counter_add' ? { kind: 'counter_add', targetId: value, delta: b.action.kind === 'counter_add' ? b.action.delta : 1 }
      : { kind: 'play_media', targetId: value };
    patch(b.id, { action: a });
  };
  const setActDelta = (b: PanelButton, delta: number) => {
    if (b.action.kind !== 'counter_add') return;
    patch(b.id, { action: { ...b.action, delta } });
  };

  const onRecordKey = (b: PanelButton, e: React.KeyboardEvent) => {
    e.preventDefault();
    if (e.key === 'Escape') { setRecording(null); return; }
    const accel = accelFromEvent(e);
    if (accel) { patch(b.id, { accelerator: accel }); setRecording(null); }
  };

  if (!loaded) return <div className="p-6 text-studio-muted">Lade…</div>;
  const mediaLayers = layers.filter((l) => l.widgetType === 'media');
  const counterLayers = layers.filter((l) => l.widgetType === 'counter');

  return (
    <div className="flex flex-col gap-5 p-6">
      <div>
        <h1 className="flex items-center gap-2 font-display text-xl uppercase"><Gamepad2 size={20} className="text-studio-accent" /> Panel</h1>
        <p className="mt-1 max-w-2xl text-xs text-studio-muted">
          Löse Sounds & Aktionen selbst aus — per Klick oder globalem Tastenkürzel (funktioniert auch wenn die App im Hintergrund ist). Dein Software-Stream-Deck.
        </p>
      </div>

      {/* Soundboard */}
      <section className="bx-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-teal"><Volume2 size={15} /> Soundboard</h2>
        {sounds.length === 0 ? (
          <p className="text-xs text-studio-muted">Noch keine Sounds — importiere welche unter „Sounds".</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
            {sounds.map((s) => (
              <button
                key={s.id}
                onClick={() => void window.studio.firePanel({ kind: 'play_sound', soundId: s.id })}
                className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-raised/50 px-3 py-2.5 text-left text-xs transition-colors hover:border-studio-teal/50 hover:bg-studio-raised"
                title={s.filename}
              >
                <Play size={14} className="flex-none text-studio-teal" />
                <span className="truncate">{s.filename}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Schnell-Aktionen */}
      <section className="bx-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-gold"><Keyboard size={15} /> Schnell-Aktionen</h2>
          <button onClick={() => save([...buttons, newButton()])} className="bx-btn-accent"><Plus size={15} /> Neuer Knopf</button>
        </div>

        {buttons.length === 0 && (
          <p className="text-xs text-studio-muted">Noch keine Knöpfe. Lege welche an — z.B. „Intro-Video" auf Strg+Shift+1.</p>
        )}

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {buttons.map((b) => {
            const k = b.action.kind as ActKind;
            const val = b.action.kind === 'play_sound' ? b.action.soundId : b.action.kind === 'speak' ? b.action.template : 'targetId' in b.action ? b.action.targetId : '';
            return (
              <div key={b.id} className="rounded-lg border border-studio-border bg-studio-raised/40 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <button
                    onClick={() => void window.studio.firePanel(b.action)}
                    title="Jetzt auslösen"
                    className="flex-none rounded-md bg-studio-teal/15 p-1.5 text-studio-teal hover:bg-studio-teal/25"
                  >
                    <Play size={14} />
                  </button>
                  <input value={b.label} onChange={(e) => patch(b.id, { label: e.target.value })} className="flex-1 bg-transparent font-display text-sm uppercase outline-none" />
                  <ConfirmButton onConfirm={() => save(buttons.filter((x) => x.id !== b.id))} className="text-studio-muted hover:text-studio-accent" title="Knopf löschen"><Trash2 size={14} /></ConfirmButton>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select value={k} onChange={(e) => setActKind(b, e.target.value as ActKind)} className="bx-select">
                    {ACT_META.map((m) => <option key={m.kind} value={m.kind}>{m.label}</option>)}
                  </select>
                  {k === 'play_sound' ? (
                    <select value={val} onChange={(e) => setActValue(b, e.target.value)} className="bx-select">
                      <option value="">Sound…</option>
                      {sounds.map((s) => <option key={s.id} value={s.id}>{s.filename}</option>)}
                    </select>
                  ) : k === 'speak' ? (
                    <input value={val} onChange={(e) => setActValue(b, e.target.value)} placeholder="Ansage-Text" className="bx-input" />
                  ) : k === 'fire_alert' ? (
                    <select value={val} onChange={(e) => setActValue(b, e.target.value)} className="bx-select">
                      <option value="">Layer…</option>
                      {layers.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.widgetType})</option>)}
                    </select>
                  ) : k === 'counter_add' ? (
                    <div className="flex gap-1.5">
                      <select value={val} onChange={(e) => setActValue(b, e.target.value)} className="bx-select flex-1">
                        <option value="">Counter…</option>
                        {counterLayers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                      <input
                        type="number"
                        value={b.action.kind === 'counter_add' ? b.action.delta : 1}
                        onChange={(e) => setActDelta(b, Number(e.target.value) || 0)}
                        title="±Schritt, z.B. 1 oder -1"
                        className="bx-input font-mono"
                        style={{ width: '4.2rem' }}
                      />
                    </div>
                  ) : (
                    <select value={val} onChange={(e) => setActValue(b, e.target.value)} className="bx-select">
                      <option value="">Medium-Layer…</option>
                      {mediaLayers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                </div>

                {/* Hotkey */}
                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="text-studio-muted">Hotkey:</span>
                  {recording === b.id ? (
                    <div
                      ref={recRef}
                      tabIndex={0}
                      onKeyDown={(e) => onRecordKey(b, e)}
                      onBlur={() => setRecording(null)}
                      className="flex-1 rounded-md border border-studio-accent bg-studio-accent/10 px-2 py-1 text-center text-studio-accent outline-none"
                    >
                      Taste(n) drücken… (Esc = abbrechen)
                    </div>
                  ) : b.accelerator ? (
                    <code className="rounded bg-studio-bg px-2 py-1 font-mono text-studio-text">{b.accelerator}</code>
                  ) : (
                    <span className="text-studio-muted/60">keiner</span>
                  )}
                  {recording !== b.id && (
                    <button onClick={() => setRecording(b.id)} className="bx-pill !py-1 !px-2 text-[10px]">
                      <Keyboard size={11} /> {b.accelerator ? 'Ändern' : 'Aufnehmen'}
                    </button>
                  )}
                  {b.accelerator && recording !== b.id && (
                    <button onClick={() => patch(b.id, { accelerator: undefined })} title="Hotkey entfernen" className="text-studio-muted hover:text-studio-accent"><X size={13} /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
