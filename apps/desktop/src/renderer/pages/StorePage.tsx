// StorePage — Punkte-Einlöse-Store: Zuschauer geben per Chat-Befehl Punkte aus
// und lösen damit eine Belohnung aus (Sound, Ansage, Overlay-Alert, Medium).
// Wie Twitch-Kanalpunkte — die Brücke zwischen Punkte-System und Engagement.
import { useEffect, useState } from 'react';
import { Gift, Plus, Trash2, Power, Coins, Volume2, Mic, Sparkles, Film } from 'lucide-react';
import type { Redemption, TriggerAction } from '@botexe/trigger-engine';

interface SoundEntry { id: string; filename: string }
interface LayerRef { id: string; name: string; widgetType: string }

type RewardKind = 'play_sound' | 'speak' | 'fire_alert' | 'play_media';

const REWARD_META: { kind: RewardKind; label: string; icon: typeof Gift }[] = [
  { kind: 'play_sound', label: 'Sound abspielen', icon: Volume2 },
  { kind: 'speak', label: 'Ansage (TTS)', icon: Mic },
  { kind: 'fire_alert', label: 'Overlay-Alert', icon: Sparkles },
  { kind: 'play_media', label: 'Medium abspielen', icon: Film },
];

function newRedemption(): Redemption {
  return {
    id: `red-${Date.now().toString(36)}`,
    name: 'Neue Einlösung',
    command: '!befehl',
    cost: 100,
    actions: [{ kind: 'play_sound', soundId: '' }],
    enabled: true,
    cooldownMs: 0,
  };
}

export default function StorePage() {
  const [reds, setReds] = useState<Redemption[]>([]);
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [layers, setLayers] = useState<LayerRef[]>([]);
  const [currency, setCurrency] = useState('Punkte');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      setReds((await window.studio.getRedemptions()) as Redemption[]);
      setSounds((await window.studio.listSounds()) as SoundEntry[]);
      const layouts = (await window.studio.listLayouts()) as { layers: LayerRef[] }[];
      setLayers(layouts.flatMap((l) => l.layers).map((l) => ({ id: l.id, name: l.name, widgetType: l.widgetType })));
      const s = (await window.studio.getSettings()) as { points: { currencyName: string } };
      setCurrency(s.points.currencyName);
      setLoaded(true);
    })();
  }, []);

  const save = (next: Redemption[]) => {
    setReds(next);
    void window.studio.setRedemptions(next as unknown as unknown[]);
  };
  const patch = (id: string, p: Partial<Redemption>) => save(reds.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const reward = (r: Redemption): TriggerAction => r.actions[0] ?? { kind: 'play_sound', soundId: '' };
  const setRewardKind = (r: Redemption, kind: RewardKind) => {
    const a: TriggerAction =
      kind === 'play_sound' ? { kind, soundId: '' }
      : kind === 'speak' ? { kind, template: '' }
      : { kind, targetId: '' };
    patch(r.id, { actions: [a] });
  };
  const setRewardValue = (r: Redemption, value: string) => {
    const cur = reward(r);
    let a: TriggerAction;
    if (cur.kind === 'play_sound') a = { kind: 'play_sound', soundId: value };
    else if (cur.kind === 'speak') a = { kind: 'speak', template: value };
    else if (cur.kind === 'fire_alert') a = { kind: 'fire_alert', targetId: value };
    else a = { kind: 'play_media', targetId: value };
    patch(r.id, { actions: [a] });
  };

  if (!loaded) return <div className="p-6 text-studio-muted">Lade…</div>;

  const mediaLayers = layers.filter((l) => l.widgetType === 'media');

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl uppercase"><Gift size={20} className="text-studio-accent" /> Einlöse-Store</h1>
          <p className="mt-1 max-w-2xl text-xs text-studio-muted">
            Zuschauer geben gesammelte {currency} per Chat-Befehl aus und lösen eine Belohnung aus — wie Twitch-Kanalpunkte.
            Reicht das Guthaben nicht, passiert nichts. Basis fürs spätere Kartenspiel.
          </p>
        </div>
        <button onClick={() => save([...reds, newRedemption()])} className="bx-btn-accent">
          <Plus size={15} /> Neue Einlösung
        </button>
      </div>

      {reds.length === 0 && (
        <div className="rounded-xl border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
          Noch keine Einlösungen. Beispiel: „!airhorn" für 100 {currency} → spielt einen Sound.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {reds.map((r) => {
          const rw = reward(r);
          const rewardKind = rw.kind as RewardKind;
          const rewardValue =
            rw.kind === 'play_sound' ? rw.soundId
            : rw.kind === 'speak' ? rw.template
            : 'targetId' in rw ? rw.targetId : '';
          return (
            <div key={r.id} className={`bx-card p-4 transition-opacity ${r.enabled ? '' : 'opacity-60'}`}>
              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={() => patch(r.id, { enabled: !r.enabled })}
                  className={`clip-slant flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-widest ${r.enabled ? 'bg-studio-teal/15 text-studio-teal' : 'bg-studio-raised text-studio-muted'}`}
                >
                  <Power size={11} /> {r.enabled ? 'AKTIV' : 'AUS'}
                </button>
                <input
                  value={r.name}
                  onChange={(e) => patch(r.id, { name: e.target.value })}
                  className="flex-1 bg-transparent font-display text-sm uppercase outline-none"
                />
                <button onClick={() => save(reds.filter((x) => x.id !== r.id))} className="flex items-center gap-1 text-[11px] text-studio-muted hover:text-studio-accent">
                  <Trash2 size={13} /> Löschen
                </button>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-studio-muted">Chat-Befehl</span>
                  <input value={r.command} onChange={(e) => patch(r.id, { command: e.target.value })} placeholder="!airhorn" className="bx-input font-mono" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-studio-muted"><Coins size={11} className="text-studio-gold" /> Kosten</span>
                  <input type="number" min={0} value={r.cost} onChange={(e) => patch(r.id, { cost: Math.max(0, Number(e.target.value)) })} className="bx-input font-mono" style={{ width: '6rem' }} />
                </label>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-studio-muted">Belohnung</span>
                  <select value={rewardKind} onChange={(e) => setRewardKind(r, e.target.value as RewardKind)} className="bx-select">
                    {REWARD_META.map((m) => <option key={m.kind} value={m.kind}>{m.label}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-studio-muted">
                    {rewardKind === 'play_sound' ? 'Sound' : rewardKind === 'speak' ? 'Text' : rewardKind === 'fire_alert' ? 'Overlay-Layer' : 'Medium-Layer'}
                  </span>
                  {rewardKind === 'play_sound' ? (
                    <select value={rewardValue} onChange={(e) => setRewardValue(r, e.target.value)} className="bx-select">
                      <option value="">Sound wählen…</option>
                      {sounds.map((s) => <option key={s.id} value={s.id}>{s.filename}</option>)}
                    </select>
                  ) : rewardKind === 'speak' ? (
                    <input value={rewardValue} onChange={(e) => setRewardValue(r, e.target.value)} placeholder="{user} hat eingelöst!" className="bx-input" />
                  ) : rewardKind === 'fire_alert' ? (
                    <select value={rewardValue} onChange={(e) => setRewardValue(r, e.target.value)} className="bx-select">
                      <option value="">Layer wählen…</option>
                      {layers.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.widgetType})</option>)}
                    </select>
                  ) : (
                    <select value={rewardValue} onChange={(e) => setRewardValue(r, e.target.value)} className="bx-select">
                      <option value="">Medium-Layer wählen…</option>
                      {mediaLayers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                </label>
              </div>

              <label className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-studio-muted">
                Cooldown (s)
                <input type="number" min={0} value={(r.cooldownMs ?? 0) / 1000} onChange={(e) => patch(r.id, { cooldownMs: Math.max(0, Number(e.target.value)) * 1000 })} className="bx-input font-mono" style={{ width: '5rem' }} />
                <span className="normal-case tracking-normal text-studio-muted/60">Mindestabstand zwischen zwei Einlösungen</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
