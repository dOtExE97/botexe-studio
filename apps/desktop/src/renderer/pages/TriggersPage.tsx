// TriggersPage — „Wenn X passiert → mach Y". Regeln werden als Karten
// editiert; jede Änderung speichert sofort (Single-User-Tool).
import { useEffect, useState } from 'react';
import { Zap, Filter, Play, Plus, Trash2, Power, Clock, AlertTriangle } from 'lucide-react';
import ConfirmButton from '../components/ConfirmButton';
import { toast } from '../components/ToastHost';
import type { TriggerRule, TriggerCondition, TriggerAction, StudioEventType } from '@botexe/trigger-engine';
import type { OverlayLayout } from '@botexe/overlay-engine';

const EVENT_OPTIONS: { value: StudioEventType; label: string }[] = [
  { value: 'gift', label: 'Gift kommt rein' },
  { value: 'follow', label: 'Neuer Follower' },
  { value: 'sub', label: 'Neuer Sub' },
  { value: 'share', label: 'Stream geteilt' },
  { value: 'chat', label: 'Chat-Nachricht' },
  { value: 'like', label: 'Likes' },
  { value: 'viewer_count', label: 'Zuschauerzahl' },
  { value: 'timer', label: 'Timer (wiederkehrend)' },
];

const CONDITION_OPTIONS: Record<string, { value: TriggerCondition['kind']; label: string; valueType?: 'number' | 'text' }[]> = {
  gift: [
    { value: 'gift_coins_gte', label: 'Gift-Wert mindestens … Coins', valueType: 'number' },
    { value: 'gift_count_gte', label: 'Combo mindestens … Stück', valueType: 'number' },
    { value: 'gift_slug_is', label: 'Gift heißt genau …', valueType: 'text' },
  ],
  chat: [
    { value: 'chat_command', label: 'Nachricht ist Befehl (z.B. !hype) …', valueType: 'text' },
    { value: 'chat_keyword', label: 'Nachricht enthält …', valueType: 'text' },
    { value: 'chat_first_time', label: 'Allererste Nachricht (neuer Zuschauer)' },
  ],
  viewer_count: [{ value: 'viewer_count_gte', label: 'Mindestens … Zuschauer', valueType: 'number' }],
};

interface SoundEntry { id: string; filename: string }

/** Kompaktes Verzögerungs-Feld für Combo-Sequenzen (Versatz ab Auslösung). */
function ActionDelay({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
  return (
    <label className="flex items-center gap-1 self-end text-[9px] uppercase tracking-wider text-studio-muted/70" title="Verzögerung ab Auslösung (Sekunden) — für Combos">
      <Clock size={10} /> +
      <input
        type="number"
        min={0}
        step={0.5}
        value={Math.round(value / 100) / 10}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)) * 1000)}
        className="bx-input font-mono"
        style={{ width: '3.4rem', padding: '3px 6px' }}
      />
      s
    </label>
  );
}

function newRule(): TriggerRule {
  return {
    id: `rule-${Date.now().toString(36)}`,
    name: 'Neue Regel',
    event: 'gift',
    conditions: [],
    actions: [],
    cooldownMs: 0,
    enabled: true,
  };
}

export default function TriggersPage() {
  const [rules, setRules] = useState<TriggerRule[]>([]);
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [layers, setLayers] = useState<{ id: string; name: string; widgetType: string }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      setRules((await window.studio.getRules()) as TriggerRule[]);
      setSounds((await window.studio.listSounds()) as SoundEntry[]);
      const layouts = (await window.studio.listLayouts()) as OverlayLayout[];
      setLayers((layouts[0]?.layers ?? []).map((l) => ({ id: l.id, name: `${l.name} (${l.widgetType})`, widgetType: l.widgetType })));
      setLoaded(true);
    })();
  }, []);

  const save = (next: TriggerRule[]) => {
    setRules(next);
    void window.studio.setRules(next as unknown as unknown[]);
  };

  const patchRule = (id: string, patch: Partial<TriggerRule>) =>
    save(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const getAction = (rule: TriggerRule, kind: TriggerAction['kind']) =>
    rule.actions.find((a) => a.kind === kind);

  // Regel testen: alle Aktionen einmal durch dieselbe Auslöse-Kette schicken
  // (wie ein echtes Event), ohne dass ein Zuschauer/Event nötig ist.
  const testRule = (rule: TriggerRule) => {
    if (rule.actions.length === 0) { toast('warn', 'Diese Regel hat noch keine Aktion.'); return; }
    for (const a of rule.actions) void window.studio.firePanel(a);
    toast('success', `„${rule.name}" getestet — ${rule.actions.length} Aktion(en) ausgelöst.`);
  };

  const setSoundAction = (rule: TriggerRule, soundId: string) => {
    const others = rule.actions.filter((a) => a.kind !== 'play_sound');
    patchRule(rule.id, {
      actions: soundId ? [...others, { kind: 'play_sound', soundId }] : others,
    });
  };

  const setAlertAction = (rule: TriggerRule, targetId: string) => {
    const others = rule.actions.filter((a) => a.kind !== 'fire_alert');
    patchRule(rule.id, {
      actions: targetId ? [...others, { kind: 'fire_alert', targetId }] : others,
    });
  };

  const setSpeakAction = (rule: TriggerRule, template: string) => {
    const others = rule.actions.filter((a) => a.kind !== 'speak');
    patchRule(rule.id, {
      actions: template.trim() ? [...others, { kind: 'speak', template }] : others,
    });
  };

  const setSpinAction = (rule: TriggerRule, targetId: string, cost: number) => {
    const others = rule.actions.filter((a) => a.kind !== 'spin_wheel');
    patchRule(rule.id, {
      actions: targetId ? [...others, { kind: 'spin_wheel', targetId, cost }] : others,
    });
  };

  const setMediaAction = (rule: TriggerRule, targetId: string) => {
    const others = rule.actions.filter((a) => a.kind !== 'play_media');
    patchRule(rule.id, {
      actions: targetId ? [...others, { kind: 'play_media', targetId }] : others,
    });
  };

  const setCounterAction = (rule: TriggerRule, targetId: string, delta: number) => {
    const others = rule.actions.filter((a) => a.kind !== 'counter_add');
    patchRule(rule.id, {
      actions: targetId ? [...others, { kind: 'counter_add', targetId, delta }] : others,
    });
  };

  // Verzögerung einer bestehenden Aktion setzen (Combo-Sequenz).
  const setActionDelay = (rule: TriggerRule, kind: TriggerAction['kind'], delayMs: number) => {
    patchRule(rule.id, {
      actions: rule.actions.map((a) => (a.kind === kind ? { ...a, delayMs: delayMs || undefined } : a)),
    });
  };

  if (!loaded) return <div className="p-6 text-studio-muted">Lade…</div>;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl uppercase">Trigger-Regeln</h1>
          <p className="mt-1 text-xs text-studio-muted">
            Wenn ein Event reinkommt und die Bedingung passt, feuert die Aktion — Alert im Overlay und/oder Sound über deine Anlage.
          </p>
        </div>
        <button
          onClick={() => save([...rules, newRule()])}
          className="bx-btn-accent"
        >
          <Plus size={15} /> Neue Regel
        </button>
      </div>

      {rules.length === 0 && (
        <div className="border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
          Noch keine Regeln. Beispiel: „Gift ≥ 100 Coins → Gift-Alert + Sound".
        </div>
      )}

      {rules.map((rule) => {
        const condOptions = CONDITION_OPTIONS[rule.event] ?? [];
        const cond = rule.conditions?.[0];
        const condDef = condOptions.find((c) => c.value === cond?.kind);
        const soundAction = getAction(rule, 'play_sound') as { soundId?: string; delayMs?: number } | undefined;
        const alertAction = getAction(rule, 'fire_alert') as { targetId?: string; delayMs?: number } | undefined;
        const speakAction = getAction(rule, 'speak') as { template?: string; delayMs?: number } | undefined;
        const spinAction = getAction(rule, 'spin_wheel') as { targetId?: string; cost?: number } | undefined;
        const mediaAction = getAction(rule, 'play_media') as { targetId?: string; delayMs?: number } | undefined;
        const counterAction = getAction(rule, 'counter_add') as { targetId?: string; delta?: number } | undefined;
        const comboCount = rule.actions.length;
        const wheels = layers.filter((l) => l.widgetType === 'wheel');
        const mediaLayers = layers.filter((l) => l.widgetType === 'media');
        const counterLayers = layers.filter((l) => l.widgetType === 'counter');
        // Tote Ziel-Referenzen: Aktion zeigt auf ein Layer, das nicht mehr existiert.
        const deadTargets = rule.actions.filter(
          (a) => 'targetId' in a && a.targetId && !layers.some((l) => l.id === a.targetId),
        );
        return (
          <div
            key={rule.id}
            className={`bx-card p-0 transition-opacity ${rule.enabled ? '' : 'opacity-60'}`}
          >
            <div className="flex items-center gap-3 border-b border-studio-border px-4 py-2.5">
              <button
                onClick={() => patchRule(rule.id, { enabled: !rule.enabled })}
                className={`clip-slant flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold tracking-widest ${
                  rule.enabled ? 'bg-studio-teal/15 text-studio-teal' : 'bg-studio-raised text-studio-muted'
                }`}
              >
                <Power size={11} /> {rule.enabled ? 'AKTIV' : 'AUS'}
              </button>
              <input
                value={rule.name}
                onChange={(e) => patchRule(rule.id, { name: e.target.value })}
                className="flex-1 bg-transparent font-display text-sm uppercase outline-none"
              />
              <button
                onClick={() => testRule(rule)}
                title="Aktionen dieser Regel jetzt testen (ohne echtes Event)"
                className="flex items-center gap-1 text-[11px] text-studio-muted transition-colors hover:text-studio-teal"
              >
                <Play size={13} /> Test
              </button>
              <ConfirmButton
                onConfirm={() => save(rules.filter((r) => r.id !== rule.id))}
                className="flex items-center gap-1 text-[11px] text-studio-muted transition-colors hover:text-studio-accent"
              >
                <Trash2 size={13} /> Löschen
              </ConfirmButton>
            </div>

            <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 p-4">
              {/* WENN */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.3em] text-studio-accent">
                  <Zap size={12} /> Wenn
                </div>
                <select
                  value={rule.event}
                  onChange={(e) => patchRule(rule.id, { event: e.target.value as StudioEventType, conditions: [] })}
                  className="bx-select"
                >
                  {EVENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* BEDINGUNG (bzw. INTERVALL bei Timer) */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.3em] text-studio-gold">
                  <Filter size={12} /> {rule.event === 'timer' ? 'Intervall' : 'Bedingung'}
                </div>
                {rule.event === 'timer' ? (
                  <label className="flex items-center gap-2 py-1 text-xs text-studio-muted">
                    alle
                    <input
                      type="number"
                      min={5}
                      value={Math.round((rule.cooldownMs ?? 600_000) / 1000)}
                      onChange={(e) => patchRule(rule.id, { cooldownMs: Math.max(5, Number(e.target.value)) * 1000 })}
                      className="bx-input font-mono w-24"
                    />
                    Sekunden
                  </label>
                ) : condOptions.length === 0 ? (
                  <div className="py-2 text-xs text-studio-muted">— keine nötig —</div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <select
                      value={cond?.kind ?? ''}
                      onChange={(e) => {
                        const def = condOptions.find((c) => c.value === e.target.value);
                        patchRule(rule.id, {
                          conditions: def
                            ? [(def.valueType
                                ? { kind: def.value, value: def.valueType === 'number' ? 0 : '' }
                                : { kind: def.value }) as TriggerCondition]
                            : [],
                        });
                      }}
                      className="bx-select"
                    >
                      <option value="">Immer</option>
                      {condOptions.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    {cond && condDef && condDef.valueType && (
                      <input
                        type={condDef.valueType}
                        value={('value' in cond ? cond.value : '') as string | number}
                        onChange={(e) =>
                          patchRule(rule.id, {
                            conditions: [{ ...cond, value: condDef.valueType === 'number' ? Number(e.target.value) : e.target.value } as TriggerCondition],
                          })
                        }
                        className={`bx-input${condDef.valueType === 'number' ? ' font-mono' : ''}`}
                      />
                    )}
                  </div>
                )}
              </div>

              {/* DANN */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 font-display text-[11px] uppercase tracking-[0.3em] text-studio-teal">
                  <Play size={12} /> Dann
                </div>
                <div className="flex flex-col gap-1.5">
                  <select
                    value={alertAction?.targetId ?? ''}
                    onChange={(e) => setAlertAction(rule, e.target.value)}
                    className="bx-select"
                  >
                    <option value="">Kein Overlay-Alert</option>
                    {layers.map((l) => (
                      <option key={l.id} value={l.id}>Alert auf: {l.name}</option>
                    ))}
                  </select>
                  {alertAction?.targetId && (
                    <ActionDelay value={alertAction.delayMs ?? 0} onChange={(ms) => setActionDelay(rule, 'fire_alert', ms)} />
                  )}
                  <select
                    value={soundAction?.soundId ?? ''}
                    onChange={(e) => setSoundAction(rule, e.target.value)}
                    className="bx-select"
                  >
                    <option value="">Kein Sound</option>
                    {sounds.map((s) => (
                      <option key={s.id} value={s.id}>{s.filename}</option>
                    ))}
                  </select>
                  {soundAction?.soundId && (
                    <ActionDelay value={soundAction.delayMs ?? 0} onChange={(ms) => setActionDelay(rule, 'play_sound', ms)} />
                  )}
                  <input
                    value={speakAction?.template ?? ''}
                    onChange={(e) => setSpeakAction(rule, e.target.value)}
                    placeholder='Ansage, z.B. "{user} schickt {gift}, danke!" (leer = keine)'
                    className="bx-input"
                  />
                  {speakAction?.template && (
                    <ActionDelay value={speakAction.delayMs ?? 0} onChange={(ms) => setActionDelay(rule, 'speak', ms)} />
                  )}
                  {wheels.length > 0 && (
                    <div className="flex gap-1.5">
                      <select
                        value={spinAction?.targetId ?? ''}
                        onChange={(e) => setSpinAction(rule, e.target.value, spinAction?.cost ?? 0)}
                        className="bx-select flex-1"
                      >
                        <option value="">Kein Glücksrad</option>
                        {wheels.map((l) => (<option key={l.id} value={l.id}>Rad drehen: {l.name}</option>))}
                      </select>
                      {spinAction?.targetId && (
                        <input
                          type="number" min={0} value={spinAction.cost ?? 0}
                          onChange={(e) => setSpinAction(rule, spinAction.targetId ?? '', Math.max(0, Number(e.target.value)))}
                          title="Punkte-Kosten pro Spin (0 = gratis)"
                          className="bx-input font-mono w-20"
                        />
                      )}
                    </div>
                  )}
                  {mediaLayers.length > 0 && (
                    <select
                      value={mediaAction?.targetId ?? ''}
                      onChange={(e) => setMediaAction(rule, e.target.value)}
                      className="bx-select"
                    >
                      <option value="">Kein Medium</option>
                      {mediaLayers.map((l) => (<option key={l.id} value={l.id}>Medium abspielen: {l.name}</option>))}
                    </select>
                  )}
                  {mediaAction?.targetId && (
                    <ActionDelay value={mediaAction.delayMs ?? 0} onChange={(ms) => setActionDelay(rule, 'play_media', ms)} />
                  )}
                  {counterLayers.length > 0 && (
                    <div className="flex gap-1.5">
                      <select
                        value={counterAction?.targetId ?? ''}
                        onChange={(e) => setCounterAction(rule, e.target.value, counterAction?.delta ?? 1)}
                        className="bx-select flex-1"
                      >
                        <option value="">Kein Counter</option>
                        {counterLayers.map((l) => (<option key={l.id} value={l.id}>Counter ändern: {l.name}</option>))}
                      </select>
                      {counterAction?.targetId && (
                        <input
                          type="number" value={counterAction.delta ?? 1}
                          onChange={(e) => setCounterAction(rule, counterAction.targetId ?? '', Number(e.target.value) || 0)}
                          title="±Schritt, z.B. 1 oder -1"
                          className="bx-input font-mono w-20"
                        />
                      )}
                    </div>
                  )}
                  {deadTargets.length > 0 && (
                    <p className="flex items-center gap-1 text-[10px] text-studio-accent">
                      <AlertTriangle size={11} /> {deadTargets.length} Aktion(en) zeigen auf ein gelöschtes Widget — bitte neu zuweisen.
                    </p>
                  )}
                  {comboCount > 1 && (
                    <p className="flex items-center gap-1 text-[9px] text-studio-muted/70">
                      <Clock size={9} /> Combo: {comboCount} Aktionen feuern zusammen — mit „+Sek." zeitversetzt.
                    </p>
                  )}
                  {rule.event !== 'timer' && (
                    <label className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-widest text-studio-muted">
                      Cooldown (s)
                      <input
                        type="number"
                        value={(rule.cooldownMs ?? 0) / 1000}
                        onChange={(e) => patchRule(rule.id, { cooldownMs: Math.max(0, Number(e.target.value)) * 1000 })}
                        className="bx-input font-mono w-20"
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
