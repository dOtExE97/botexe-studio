// TriggersPage — „Wenn X passiert → mach Y". Regeln werden als Karten
// editiert; jede Änderung speichert sofort (Single-User-Tool).
import { useEffect, useState } from 'react';
import { Zap, Filter, Play, Plus, Trash2, Power, Clock, AlertTriangle, Copy } from 'lucide-react';
import ConfirmButton from '../components/ConfirmButton';
import GiftPicker from '../components/GiftPicker';
import { toast, toastAction } from '../components/ToastHost';
import type { TriggerRule, TriggerCondition, TriggerAction, StudioEventType } from '@botexe/trigger-engine';
import type { OverlayLayout } from '@botexe/overlay-engine';

const EVENT_OPTIONS: { value: StudioEventType; label: string }[] = [
  { value: 'gift', label: 'Gift kommt rein' },
  { value: 'follow', label: 'Neuer Follower' },
  { value: 'sub', label: 'Neuer Sub (Teamherz)' },
  { value: 'join', label: 'Zuschauer betritt Stream' },
  { value: 'share', label: 'Stream geteilt' },
  { value: 'chat', label: 'Chat-Nachricht' },
  { value: 'like', label: 'Likes' },
  { value: 'viewer_count', label: 'Zuschauerzahl' },
  { value: 'timer', label: 'Timer (wiederkehrend)' },
];

/** Sinnvolle Start-Werte für Zahlen-Bedingungen (0 = „feuert immer"-Falle). */
const NUM_DEFAULT: Record<string, number> = {
  gift_coins_gte: 100, gift_count_gte: 10, viewer_count_gte: 50, like_count_gte: 100,
};

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
  follow: [
    { value: 'follow_first_time', label: 'Nur beim ERSTEN Follow (kein Re-Follow)' },
  ],
  like: [
    { value: 'like_count_gte', label: 'Like-Meilenstein erreicht (bei … Likes)', valueType: 'number' },
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


/** Regel als lesbarer deutscher Satz — „WENN … DANN …". Führt Laien durch die
 *  Karte und macht Fallen sichtbar („bei JEDEM Gift" statt vermeintlichem Filter). */
function ruleToSentence(rule: TriggerRule, layerName: (id: string) => string, soundName: (id: string) => string): string {
  const ev = EVENT_OPTIONS.find((o) => o.value === rule.event)?.label ?? rule.event;
  const c = rule.conditions?.[0] as (TriggerCondition & { value?: string | number }) | undefined;
  let wenn = ev;
  if (rule.event === 'timer') wenn = `alle ${Math.max(1, Math.round((rule.cooldownMs ?? 0) / 1000))} Sek.`;
  else if (c) {
    switch (c.kind) {
      case 'gift_coins_gte': wenn = `Gift im Wert von mind. ${c.value} Coins`; break;
      case 'gift_count_gte': wenn = `Gift-Combo mit mind. ${c.value} Stück`; break;
      case 'gift_slug_is': wenn = `das Gift „${c.value}" reinkommt`; break;
      case 'chat_keyword': wenn = `eine Nachricht „${c.value}" enthält`; break;
      case 'chat_command': wenn = `jemand „${c.value}" schreibt`; break;
      case 'chat_first_time': wenn = 'jemand zum ALLERERSTEN Mal schreibt'; break;
      case 'follow_first_time': wenn = 'jemand zum ERSTEN Mal folgt'; break;
      case 'like_count_gte': wenn = `die Likes ${c.value} erreichen`; break;
      case 'viewer_count_gte': wenn = `mind. ${c.value} Zuschauer da sind`; break;
    }
  } else if (rule.event === 'gift') wenn = 'IRGENDEIN Gift reinkommt';
  const parts: string[] = [];
  for (const a of rule.actions) {
    switch (a.kind) {
      case 'play_sound': parts.push(`spiele „${soundName(a.soundId)}"`); break;
      case 'fire_alert': parts.push(`zeige Alert auf „${layerName(a.targetId)}"`); break;
      case 'speak': parts.push(`sage „${(a.template ?? '').slice(0, 32)}${(a.template ?? '').length > 32 ? '…' : ''}"`); break;
      case 'spin_wheel': parts.push('drehe das Glücksrad'); break;
      case 'play_media': parts.push(`spiele Medium „${layerName(a.targetId)}"`); break;
      case 'counter_add': parts.push(`Counter ${((a as { delta?: number }).delta ?? 1) >= 0 ? '+' : ''}${(a as { delta?: number }).delta ?? 1}`); break;
      case 'obs_scene': parts.push(`OBS-Szene „${(a as { scene?: string }).scene}"`); break;
      case 'send_chat': parts.push('schreibe in den Chat'); break;
      case 'streamerbot_action': parts.push('Streamer.bot-Aktion'); break;
      case 'spotify_control': parts.push(`Spotify ${(a as { control?: string }).control}`); break;
      case 'spotify_request': parts.push('Song-Request'); break;
      default: parts.push(a.kind);
    }
  }
  const dann = parts.length ? parts.join(' + ') : '⚠ noch KEINE Aktion (Regel tut nichts)';
  return `WENN ${wenn} → DANN ${dann}`;
}

/** Ein-Klick-Vorlagen: die 8 häufigsten Streamer-Wünsche, sofort startklar.
 *  Assets (Sound/Alert-Layer) werden beim Anlegen aus dem Vorhandenen gewählt. */
const RULE_TEMPLATES: { icon: string; name: string; desc: string; build: (ctx: { firstSound?: string; alertLayer?: string }) => Omit<TriggerRule, 'id'> }[] = [
  { icon: '💎', name: 'Großes Gift feiern', desc: 'Ab 100 Coins: Alert + Danke-Ansage',
    build: (x) => ({ name: 'Großes Gift feiern', event: 'gift', conditions: [{ kind: 'gift_coins_gte', value: 100 }],
      actions: [...(x.alertLayer ? [{ kind: 'fire_alert', targetId: x.alertLayer } as TriggerAction] : []), { kind: 'speak', template: '{user} schickt {gift} — DANKE! 🔥' }], cooldownMs: 0, enabled: true }) },
  { icon: '🌹', name: 'Rose → Sound', desc: 'Bei jeder Rose einen Sound abspielen',
    build: (x) => ({ name: 'Rose → Sound', event: 'gift', conditions: [{ kind: 'gift_slug_is', value: 'Rose' }],
      actions: x.firstSound ? [{ kind: 'play_sound', soundId: x.firstSound }] : [{ kind: 'speak', template: 'Danke für die Rose, {user}! 🌹' }], cooldownMs: 0, enabled: true }) },
  { icon: '👻', name: 'Erster Follow', desc: 'Nur beim ERSTEN Follow: Sound + Ansage',
    build: (x) => ({ name: 'Erster Follow', event: 'follow', conditions: [{ kind: 'follow_first_time' }],
      actions: [...(x.firstSound ? [{ kind: 'play_sound', soundId: x.firstSound } as TriggerAction] : []), { kind: 'speak', template: '{user} folgt jetzt — willkommen an Bord! ❤️' }], cooldownMs: 0, enabled: true }) },
  { icon: '💜', name: 'Neuer Sub (Teamherz)', desc: 'Danke-Ansage bei jedem neuen Teamherz',
    build: () => ({ name: 'Neuer Sub', event: 'sub', conditions: [],
      actions: [{ kind: 'speak', template: 'WOW — {user} ist jetzt Teamherz! Tausend Dank! 💜' }], cooldownMs: 0, enabled: true }) },
  { icon: '🔥', name: '!hype-Befehl', desc: 'Chat schreibt !hype → Sound/Alert',
    build: (x) => ({ name: '!hype', event: 'chat', conditions: [{ kind: 'chat_command', value: '!hype' }],
      actions: x.firstSound ? [{ kind: 'play_sound', soundId: x.firstSound }] : [{ kind: 'speak', template: 'HYPE HYPE HYPE! 🔥' }], cooldownMs: 10000, enabled: true }) },
  { icon: '👋', name: 'Neue Zuschauer begrüßen', desc: 'Erste Nachricht überhaupt → Willkommens-Ansage',
    build: () => ({ name: 'Neue begrüßen', event: 'chat', conditions: [{ kind: 'chat_first_time' }],
      actions: [{ kind: 'speak', template: 'Willkommen im Stream, {user}! 👋' }], cooldownMs: 0, enabled: true }) },
  { icon: '❤️', name: 'Like-Meilenstein', desc: 'Bei 1000 Likes: Feier-Ansage (+Sound)',
    build: (x) => ({ name: 'Like-Meilenstein', event: 'like', conditions: [{ kind: 'like_count_gte', value: 1000 }],
      actions: [...(x.firstSound ? [{ kind: 'play_sound', soundId: x.firstSound } as TriggerAction] : []), { kind: 'speak', template: 'Ihr habt das Like-Ziel geknackt — ihr seid die BESTEN! ❤️' }], cooldownMs: 0, enabled: true }) },
  { icon: '⏰', name: 'Regelmäßige Erinnerung', desc: 'Alle 10 Min: Hinweis vorlesen (Follow/Discord…)',
    build: () => ({ name: 'Erinnerung', event: 'timer', conditions: [],
      actions: [{ kind: 'speak', template: 'Wenn dir der Stream gefällt: Follow dalassen! 🙌' }], cooldownMs: 600000, enabled: true }) },
];

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
  const [query, setQuery] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  // ✨ KI-Trigger: „bei Rose Sound X" in Worten → fertige Regel(n).
  const [aiTriggerWish, setAiTriggerWish] = useState('');
  const [aiTriggerBusy, setAiTriggerBusy] = useState(false);

  const runAiTrigger = async () => {
    if (aiTriggerBusy || !aiTriggerWish.trim()) return;
    setAiTriggerBusy(true);
    try {
      const result = await window.studio.aiTrigger({
        wish: aiTriggerWish.trim(),
        ctx: { sounds, layers },
      });
      if (!result.ok || !Array.isArray(result.rules) || result.rules.length === 0) {
        toast('error', result.error ?? 'KI-Regel fehlgeschlagen.');
        return;
      }
      const created = result.rules as TriggerRule[];
      save([...rules, ...created]);
      setAiTriggerWish('');
      toastAction('success', `✨ ${created.length} Regel(n) gebaut — unten prüfen & anpassen.`, {
        label: 'Rückgängig',
        onClick: () => setRules((cur) => {
          const ids = new Set(created.map((r) => r.id));
          const next = cur.filter((r) => !ids.has(r.id));
          void window.studio.setRules(next as unknown as unknown[]);
          return next;
        }),
      });
    } finally {
      setAiTriggerBusy(false);
    }
  };
  const [obsScenes, setObsScenes] = useState<string[]>([]);
  const [sbActions, setSbActions] = useState<{ id: string; name: string }[]>([]);
  // Weitere Aktionen (Glücksrad/OBS/Spotify/…) pro Regel eingeklappt — die
  // Dropdown-Wand überforderte; die 3 Kern-Aktionen reichen für 90% der Regeln.
  const [moreActionsOpen, setMoreActionsOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      setRules((await window.studio.getRules()) as TriggerRule[]);
      setSounds((await window.studio.listSounds()) as SoundEntry[]);
      const layouts = (await window.studio.listLayouts()) as OverlayLayout[];
      setLayers((layouts[0]?.layers ?? []).map((l) => ({ id: l.id, name: `${l.name} (${l.widgetType})`, widgetType: l.widgetType })));
      setObsScenes((await window.studio.getObsScenes().catch(() => [])) as string[]);
      setSbActions((await window.studio.getStreamerbotActions().catch(() => [])) as { id: string; name: string }[]);
      setLoaded(true);
    })();
  }, []);

  const save = (next: TriggerRule[]) => {
    setRules(next);
    void window.studio.setRules(next as unknown as unknown[]);
  };

  // Regel duplizieren (häufige Variante schneller bauen).
  const duplicateRule = (rule: TriggerRule) => {
    const copy: TriggerRule = {
      ...JSON.parse(JSON.stringify(rule)),
      id: `rule-${Date.now().toString(36)}`,
      name: `${rule.name} (Kopie)`,
    };
    save([...rules, copy]);
  };

  const eventLabel = (ev: string) => EVENT_OPTIONS.find((o) => o.value === ev)?.label ?? ev;
  const q = query.trim().toLowerCase();
  const shownRules = q
    ? rules.filter((r) => r.name.toLowerCase().includes(q) || eventLabel(r.event).toLowerCase().includes(q))
    : rules;

  const patchRule = (id: string, patch: Partial<TriggerRule>) =>
    save(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const getAction = (rule: TriggerRule, kind: TriggerAction['kind']) =>
    rule.actions.find((a) => a.kind === kind);

  // Regel testen: alle Aktionen einmal durch dieselbe Auslöse-Kette schicken
  // (wie ein echtes Event), ohne dass ein Zuschauer/Event nötig ist.
  /** Baut ein Test-Event, das die Bedingungen dieser Regel ERFÜLLT — der Test
   *  läuft dann durch die ECHTE Kette (Engine + Bedingungen + Cooldown), statt
   *  die Aktionen blind zu feuern. So prüft man wirklich „greift meine Regel?". */
  const eventForRule = (rule: TriggerRule): Record<string, unknown> | null => {
    const c = rule.conditions?.[0] as (TriggerCondition & { value?: string | number }) | undefined;
    const user = { id: `test-${Date.now().toString(36)}`, nickname: 'Test-Zuschauer' };
    switch (rule.event) {
      case 'gift': {
        const slug = c?.kind === 'gift_slug_is' ? String(c.value || 'Rose') : 'Rose';
        const count = c?.kind === 'gift_count_gte' ? Number(c.value) || 1 : 1;
        const coins = c?.kind === 'gift_coins_gte' ? Number(c.value) || 1 : 100;
        return { type: 'gift', user, gift: { slug, count, coinsPerUnit: Math.max(1, Math.ceil(coins / count)), totalCoins: Math.max(coins, count) } };
      }
      case 'chat': {
        const text = c?.kind === 'chat_command' ? String(c.value || '!test')
          : c?.kind === 'chat_keyword' ? `Test mit ${String(c.value || 'hype')}` : 'Test-Nachricht';
        return { type: 'chat', user, text };
      }
      case 'follow': return { type: 'follow', user };
      case 'sub': return { type: 'sub', user };
      case 'share': return { type: 'share', user };
      case 'join': return { type: 'join', user };
      case 'like': {
        const v = c?.kind === 'like_count_gte' ? Number(c.value) || 100 : 100;
        return { type: 'like', user, likeCount: Math.max(1, v), totalLikes: v };
      }
      case 'viewer_count': return { type: 'viewer_count', viewerCount: c?.kind === 'viewer_count_gte' ? Number(c.value) || 1 : 100 };
      default: return null; // timer: hat kein Event — direkt feuern
    }
  };

  const testRule = (rule: TriggerRule) => {
    if (rule.actions.length === 0) { toast('warn', 'Diese Regel hat noch keine Aktion.'); return; }
    const ev = eventForRule(rule);
    if (!ev) {
      // Timer-Regel: kein Event konstruierbar → Aktionen direkt auslösen.
      for (const a of rule.actions) void window.studio.firePanel(a);
      toast('success', `„${rule.name}" getestet — ${rule.actions.length} Aktion(en) direkt ausgelöst.`);
      return;
    }
    if (!rule.enabled) { toast('warn', 'Regel ist AUS — zum Testen erst aktivieren.'); return; }
    void window.studio.sendTestEvent(ev);
    toast('success', `Test-Event geschickt — läuft durch die ECHTE Kette (inkl. Bedingung & Cooldown). Nichts passiert? Dann greift die Regel so nicht.`);
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

  const setObsSceneAction = (rule: TriggerRule, scene: string) => {
    const others = rule.actions.filter((a) => a.kind !== 'obs_scene');
    patchRule(rule.id, {
      actions: scene ? [...others, { kind: 'obs_scene', scene }] : others,
    });
  };

  const setChatAction = (rule: TriggerRule, template: string) => {
    const others = rule.actions.filter((a) => a.kind !== 'send_chat');
    patchRule(rule.id, { actions: template.trim() ? [...others, { kind: 'send_chat', template }] : others });
  };
  const setSbAction = (rule: TriggerRule, action: string) => {
    const others = rule.actions.filter((a) => a.kind !== 'streamerbot_action');
    patchRule(rule.id, { actions: action ? [...others, { kind: 'streamerbot_action', action }] : others });
  };
  const setSpotifyControl = (rule: TriggerRule, control: string) => {
    const others = rule.actions.filter((a) => a.kind !== 'spotify_control');
    const ok = control === 'play' || control === 'pause' || control === 'next' || control === 'previous';
    patchRule(rule.id, { actions: ok ? [...others, { kind: 'spotify_control', control }] : others });
  };
  const setSpotifyRequest = (rule: TriggerRule, query: string) => {
    const others = rule.actions.filter((a) => a.kind !== 'spotify_request');
    patchRule(rule.id, { actions: query.trim() ? [...others, { kind: 'spotify_request', query }] : others });
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
        <div className="flex items-center gap-2">
          {rules.length > 4 && (
            <label className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-bg px-2.5 py-1.5">
              <Filter size={13} className="text-studio-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Regel suchen…" className="bg-transparent text-sm outline-none" style={{ width: '9rem' }} />
            </label>
          )}
          <button onClick={() => setShowTemplates((v) => !v)} className="bx-pill hover:text-studio-teal" title="Fertige Regel-Vorlagen (ein Klick)">
            <Zap size={13} /> Vorlagen
          </button>
          <button onClick={() => save([...rules, newRule()])} className="bx-btn-accent">
            <Plus size={15} /> Neue Regel
          </button>
        </div>
      </div>

      {/* ✨ KI-Trigger: Regel in normalem Deutsch beschreiben */}
      <div className="flex items-center gap-2 rounded-xl border border-studio-border bg-studio-panel/80 px-3 py-2">
        <span className="flex-none text-[10px] font-bold uppercase tracking-[0.2em] text-studio-teal" title="Beschreib die Regel in normalen Worten — die KI baut sie (nur mit deinen echten Sounds/Widgets).">
          ✨ KI-Trigger
        </span>
        <input
          value={aiTriggerWish}
          onChange={(e) => setAiTriggerWish(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !aiTriggerBusy && aiTriggerWish.trim() && void runAiTrigger()}
          placeholder='z.B. "wenn jemand eine Rose schickt, spiel den Airhorn-Sound und bedank dich per Ansage"'
          disabled={aiTriggerBusy}
          className="bx-input flex-1 text-xs disabled:opacity-60"
        />
        <button
          onClick={() => void runAiTrigger()}
          disabled={aiTriggerBusy || !aiTriggerWish.trim()}
          className="bx-btn-accent flex-none px-3 py-1.5 text-[11px] disabled:opacity-40"
        >
          {aiTriggerBusy ? 'KI baut…' : 'Regel bauen'}
        </button>
      </div>

      {(rules.length === 0 || showTemplates) && (
        <div className="bx-card p-4">
          <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.28em] text-studio-muted">
            <Zap size={14} /> Vorlagen — ein Klick, fertig eingerichtet
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {RULE_TEMPLATES.map((t) => (
              <button
                key={t.name}
                onClick={() => {
                  const firstSound = sounds[0]?.id;
                  const alertLayer = layers.find((l) => l.widgetType === 'gift-alert')?.id;
                  const built = { id: `rule-${Date.now().toString(36)}`, ...t.build({ firstSound, alertLayer }) } as TriggerRule;
                  save([...rules, built]);
                  setShowTemplates(false);
                  toast('success', `Vorlage „${t.name}" angelegt — unten anpassen, falls gewünscht.`);
                }}
                className="clip-slant rounded-lg border border-studio-border bg-studio-raised p-2.5 text-left transition-colors hover:border-studio-accent/60"
              >
                <div className="text-sm">{t.icon} <b className="text-xs">{t.name}</b></div>
                <div className="mt-0.5 text-[10px] leading-snug text-studio-muted">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {rules.length > 0 && shownRules.length === 0 && (
        <div className="border border-dashed border-studio-border p-6 text-center text-sm text-studio-muted">
          Keine Regel passt zu „{query}".
        </div>
      )}

      {shownRules.map((rule) => {
        const condOptions = CONDITION_OPTIONS[rule.event] ?? [];
        const cond = rule.conditions?.[0];
        const condDef = condOptions.find((c) => c.value === cond?.kind);
        const soundAction = getAction(rule, 'play_sound') as { soundId?: string; delayMs?: number } | undefined;
        const alertAction = getAction(rule, 'fire_alert') as { targetId?: string; delayMs?: number } | undefined;
        const speakAction = getAction(rule, 'speak') as { template?: string; delayMs?: number } | undefined;
        const spinAction = getAction(rule, 'spin_wheel') as { targetId?: string; cost?: number } | undefined;
        const mediaAction = getAction(rule, 'play_media') as { targetId?: string; delayMs?: number } | undefined;
        const counterAction = getAction(rule, 'counter_add') as { targetId?: string; delta?: number } | undefined;
        const obsAction = getAction(rule, 'obs_scene') as { scene?: string } | undefined;
        const chatAction = getAction(rule, 'send_chat') as { template?: string } | undefined;
        const sbAction = getAction(rule, 'streamerbot_action') as { action?: string } | undefined;
        const spoCtrl = getAction(rule, 'spotify_control') as { control?: string } | undefined;
        const spoReq = getAction(rule, 'spotify_request') as { query?: string } | undefined;
        const comboCount = rule.actions.length;
        const wheels = layers.filter((l) => l.widgetType === 'wheel');
        const mediaLayers = layers.filter((l) => l.widgetType === 'media');
        const counterLayers = layers.filter((l) => l.widgetType === 'counter');
        // Tote Ziel-Referenzen: Aktion zeigt auf ein Layer, das nicht mehr existiert.
        const deadTargets = rule.actions.filter(
          (a) => 'targetId' in a && a.targetId && !layers.some((l) => l.id === a.targetId),
        );
        // Konflikt-Check: feuern weitere AKTIVE Regeln auf dasselbe Gift?
        // (z.B. Galerie-Regel + manuelle Regel → doppelter Alert/Sound)
        const myCond = rule.conditions?.[0] as { kind?: string; value?: string } | undefined;
        const giftConflicts = rule.enabled && rule.event === 'gift' && myCond?.kind === 'gift_slug_is'
          ? rules.filter((r) => r.id !== rule.id && r.enabled && r.event === 'gift'
              && (r.conditions?.[0] as { kind?: string; value?: string } | undefined)?.kind === 'gift_slug_is'
              && String((r.conditions?.[0] as { value?: string }).value ?? '').trim().toLowerCase() === String(myCond.value ?? '').trim().toLowerCase())
          : [];
        // „Weitere Aktionen" offen, wenn manuell aufgeklappt ODER eine davon
        // bereits konfiguriert ist (sonst wäre eine bestehende Regel unsichtbar).
        const hasAdvanced = !!(spinAction?.targetId || mediaAction?.targetId || counterAction?.targetId
          || obsAction?.scene || chatAction?.template || sbAction?.action || spoCtrl?.control || spoReq?.query);
        const moreOpen = hasAdvanced || moreActionsOpen.has(rule.id);
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
              <button
                onClick={() => duplicateRule(rule)}
                title="Regel duplizieren"
                className="flex items-center gap-1 text-[11px] text-studio-muted transition-colors hover:text-studio-text"
              >
                <Copy size={13} /> Kopie
              </button>
              <ConfirmButton
                onConfirm={() => {
                  const removed = rule;
                  save(rules.filter((r) => r.id !== rule.id));
                  toastAction('info', `„${removed.name}" gelöscht.`, {
                    label: 'Rückgängig',
                    onClick: () => setRules((cur) => {
                      const next = [...cur, removed];
                      void window.studio.setRules(next as unknown as unknown[]);
                      return next;
                    }),
                  });
                }}
                className="flex items-center gap-1 text-[11px] text-studio-muted transition-colors hover:text-studio-accent"
              >
                <Trash2 size={13} /> Löschen
              </ConfirmButton>
            </div>

            {/* Die Regel als Satz — Laien-Führung + macht „feuert immer"-Fallen sichtbar. */}
            <div className="border-b border-studio-border/60 bg-studio-raised/30 px-4 py-1.5 text-[11px] text-studio-muted">
              {ruleToSentence(rule, (id) => layers.find((l) => l.id === id)?.name ?? '?', (id) => sounds.find((s) => s.id === id)?.filename?.replace(/\.[a-z0-9]+$/i, '') ?? '?')}
              {giftConflicts.length > 0 && (
                <span className="ml-2 text-amber-300">
                  ⚠ {giftConflicts.length} weitere aktive Regel(n) feuern ebenfalls auf „{String(myCond?.value ?? '')}" — doppelte Alerts/Sounds möglich.
                </span>
              )}
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
                                // Sinnvoller Zahlen-Default statt 0: „mindestens 0" würde bei
                                // JEDEM Event feuern — der Streamer glaubt aber, er filtert.
                                ? { kind: def.value, value: def.valueType === 'number' ? (NUM_DEFAULT[def.value] ?? 10) : '' }
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
                    {cond && cond.kind === 'gift_slug_is' ? (
                      // Visueller Gift-Picker mit Suche statt blankem Textfeld.
                      <GiftPicker
                        value={('value' in cond ? String(cond.value) : '')}
                        onChange={(slug) => patchRule(rule.id, { conditions: [{ ...cond, value: slug } as TriggerCondition] })}
                      />
                    ) : cond && condDef && condDef.valueType ? (
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
                    ) : null}
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
                  {!moreOpen && (
                    <button
                      onClick={() => setMoreActionsOpen((prev) => new Set(prev).add(rule.id))}
                      className="self-start text-[10px] font-bold uppercase tracking-wider text-studio-muted hover:text-studio-accent"
                    >
                      + Weitere Aktionen (Glücksrad, Medium, Counter, OBS, Chat, Spotify …)
                    </button>
                  )}
                  {moreOpen && <>
                  {wheels.length === 0 && mediaLayers.length === 0 && counterLayers.length === 0 && (
                    <p className="text-[10px] leading-snug text-studio-muted/70">
                      💡 Aktionen wie Glücksrad drehen, Medium abspielen oder Counter ändern erscheinen hier, sobald du im <b>Overlay</b> ein passendes Widget anlegst.
                    </p>
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
                  {/* OBS-Szenenwechsel (nur wenn OBS-Steuerung verbunden = Szenen da). */}
                  {obsScenes.length > 0 && (
                    <select
                      value={obsAction?.scene ?? ''}
                      onChange={(e) => setObsSceneAction(rule, e.target.value)}
                      className="bx-select"
                    >
                      <option value="">Keine OBS-Szene</option>
                      {obsScenes.map((s) => (<option key={s} value={s}>OBS-Szene: {s}</option>))}
                    </select>
                  )}
                  {/* Chat-Nachricht senden (braucht TikTok-Login in den Einstellungen). */}
                  <input
                    value={chatAction?.template ?? ''}
                    onChange={(e) => setChatAction(rule, e.target.value)}
                    placeholder="💬 Chat-Nachricht (leer = aus) — {user} {gift} möglich"
                    className="bx-input"
                  />
                  {chatAction?.template && (
                    <p className="-mt-1 text-[10px] text-amber-300/90">
                      ⚠ Chat-Senden braucht den <b>Direkt-Modus</b> + TikTok-Login (Einstellungen → TikTok-Verbindung). Im Cloud-Modus (Standard) kann die App nur empfangen.
                    </p>
                  )}
                  {/* Streamer.bot-Aktion (nur wenn verbunden = Aktionen geladen). */}
                  {sbActions.length > 0 && (
                    <select value={sbAction?.action ?? ''} onChange={(e) => setSbAction(rule, e.target.value)} className="bx-select">
                      <option value="">Keine Streamer.bot-Aktion</option>
                      {sbActions.map((a) => (<option key={a.id} value={a.name}>SB: {a.name}</option>))}
                    </select>
                  )}
                  {/* Spotify steuern (braucht verbundenes Spotify Premium + aktives Gerät). */}
                  <select value={spoCtrl?.control ?? ''} onChange={(e) => setSpotifyControl(rule, e.target.value)} className="bx-select">
                    <option value="">🎵 Spotify steuern (aus)</option>
                    <option value="play">Spotify: Play</option>
                    <option value="pause">Spotify: Pause</option>
                    <option value="next">Spotify: Nächster Song</option>
                    <option value="previous">Spotify: Vorheriger Song</option>
                  </select>
                  {/* Song-Request: Suchtext → erster Treffer in die Queue. {args} = Chat nach dem Befehl. */}
                  <input
                    value={spoReq?.query ?? ''}
                    onChange={(e) => setSpotifyRequest(rule, e.target.value)}
                    placeholder="🎶 Song-Request (leer = aus) — Suchtext, z.B. {args} = Chat nach dem Befehl"
                    className="bx-input"
                  />
                  </>}
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
