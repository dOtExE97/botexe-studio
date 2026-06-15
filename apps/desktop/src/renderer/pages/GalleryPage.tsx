// GalleryPage — Geschenke-Galerie: alle je gesehenen Gifts mit echtem Bild.
// Drei Ansichten (Letztes Live / Alle / Schon erhalten), Suche + Sortierung.
// Pro Gift lassen sich Aktionen zuordnen (Sound, Feuerwerk/Alert, TTS) — das
// legt im Hintergrund eine Trigger-Regel an (wie bei TikFinity). Der Erst-
// Schenker jedes Gifts ist mit Datum verewigt. 🏆
import { useEffect, useMemo, useState } from 'react';
import { Gift, Search, Crown, Coins, Volume2, Sparkles, Mic, Plus, Trash2, Play, X } from 'lucide-react';
import type { TriggerRule, TriggerAction } from '@botexe/trigger-engine';
import { findGiftRule, upsertGiftRule, otherGiftRules } from '@botexe/trigger-engine';
import { useGiftCatalog, type GiftEntry } from '../hooks/useGiftCatalog';
import { giftDisplayName, giftNameDe } from '../lib/gift-names-de';
import { toast } from '../components/ToastHost';

interface SoundEntry { id: string; filename: string }
interface LayerRef { id: string; name: string; widgetType: string }

type View = 'lastRoom' | 'all' | 'received';
type Sort = 'coins' | 'name' | 'recent';

const VIEWS: { id: View; label: string }[] = [
  { id: 'lastRoom', label: 'Letztes Live' },
  { id: 'all', label: 'Alle' },
  { id: 'received', label: 'Schon erhalten' },
];

const ACTION_META: { kind: TriggerAction['kind']; label: string; icon: typeof Gift }[] = [
  { kind: 'play_sound', label: 'Sound', icon: Volume2 },
  { kind: 'fire_alert', label: 'Overlay-Alert', icon: Sparkles },
  { kind: 'speak', label: 'Ansage (TTS)', icon: Mic },
];

function fmtDate(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function GalleryPage() {
  const { gifts, loaded } = useGiftCatalog();
  const [rules, setRules] = useState<TriggerRule[]>([]);
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [layers, setLayers] = useState<LayerRef[]>([]);
  const [view, setView] = useState<View>('lastRoom');
  const [sort, setSort] = useState<Sort>('coins');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  // Anzeige-Sprache der Gift-Namen (lokal gemerkt). Default Deutsch.
  const [lang, setLang] = useState<'de' | 'en'>(() => (localStorage.getItem('bx-gift-lang') === 'en' ? 'en' : 'de'));
  const toggleLang = () => setLang((l) => { const n = l === 'de' ? 'en' : 'de'; localStorage.setItem('bx-gift-lang', n); return n; });

  useEffect(() => {
    void (async () => {
      setRules((await window.studio.getRules()) as TriggerRule[]);
      setSounds((await window.studio.listSounds()) as SoundEntry[]);
      const layouts = (await window.studio.listLayouts()) as { layers: LayerRef[] }[];
      setLayers(layouts.flatMap((l) => l.layers).map((l) => ({ id: l.id, name: l.name, widgetType: l.widgetType })));
    })();
  }, []);

  const saveRules = (next: TriggerRule[]) => {
    setRules(next);
    void window.studio.setRules(next as unknown as unknown[]);
  };

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = gifts;
    if (view === 'lastRoom') list = list.filter((g) => g.inLastRoom);
    else if (view === 'received') list = list.filter((g) => g.count > 0);
    // Suche matcht BEIDE Sprachen: deutsche User finden „Herz", andere „Heart".
    if (needle) list = list.filter((g) => {
      const de = giftNameDe(g.slug);
      return g.slug.toLowerCase().includes(needle) || (!!de && de.toLowerCase().includes(needle));
    });
    const sorted = [...list];
    const dn = (s: string) => giftDisplayName(s, lang);
    if (sort === 'coins') sorted.sort((a, b) => (b.coins || 0) - (a.coins || 0) || dn(a.slug).localeCompare(dn(b.slug)));
    else if (sort === 'name') sorted.sort((a, b) => dn(a.slug).localeCompare(dn(b.slug)));
    else sorted.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    return sorted;
  }, [gifts, view, q, sort, lang]);

  const selectedGift = gifts.find((g) => g.slug === selected) || null;

  if (!loaded) return <div className="p-6 text-studio-muted">Lade Geschenke-Katalog…</div>;

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl uppercase">
            <Gift size={20} className="text-studio-accent" /> Geschenke-Galerie
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-studio-muted">
            Alle Gifts mit echtem Bild. Klick ein Gift, um ihm Aktionen zuzuordnen (Sound, Feuerwerk, Ansage) —
            das wird automatisch zu einer Trigger-Regel. Der Erst-Schenker ist mit Datum verewigt. 🏆
          </p>
        </div>
        <div className="text-right text-[11px] text-studio-muted">
          {gifts.length} Gifts im Katalog · {gifts.filter((g) => g.count > 0).length} schon erhalten
        </div>
      </div>

      {/* Ansichts-Tabs + Suche + Sortierung */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-studio-border">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors ${view === v.id ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted hover:bg-studio-raised'}`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-studio-border bg-studio-bg px-2.5 py-1.5">
          <Search size={14} className="text-studio-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gift suchen…" className="flex-1 bg-transparent text-sm outline-none" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bx-select" style={{ width: 'auto' }}>
          <option value="coins">Wert (hoch → niedrig)</option>
          <option value="name">Name (A→Z)</option>
          <option value="recent">Zuletzt gesehen</option>
        </select>
        <button
          onClick={toggleLang}
          title="Geschenk-Namen auf Deutsch oder Englisch anzeigen (Suche findet immer beide)"
          className="rounded-lg border border-studio-border px-3 py-1.5 text-xs font-semibold tracking-wide text-studio-muted hover:text-studio-accent"
        >
          {lang === 'de' ? '🇩🇪 DE' : '🇬🇧 EN'}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Galerie-Raster */}
        <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2 overflow-y-auto pr-1">
          {shown.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-studio-border p-10 text-center text-sm text-studio-muted">
              {view === 'lastRoom'
                ? 'Noch keine Gift-Liste vom Live geladen — verbinde dich einmal mit deinem TikTok-Live.'
                : view === 'received'
                  ? 'Noch keine Gifts erhalten. Sobald welche reinkommen, erscheinen sie hier.'
                  : 'Katalog ist leer.'}
            </p>
          )}
          {shown.map((g) => {
            const mapped = !!findGiftRule(rules, g.slug);
            return (
              <button
                key={g.slug}
                onClick={() => setSelected(g.slug)}
                className={`group relative flex flex-col items-center gap-1 rounded-xl border p-2 transition-colors ${selected === g.slug ? 'border-studio-accent bg-studio-accent/10' : 'border-studio-border bg-studio-raised hover:border-studio-accent/50'}`}
              >
                {g.icon ? (
                  <img src={g.icon} alt="" className="h-12 w-12 object-contain" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-studio-bg text-studio-muted">?</div>
                )}
                <span className="w-full truncate text-center text-[10px] font-medium" title={g.slug}>{giftDisplayName(g.slug, lang)}</span>
                <span className="flex items-center gap-0.5 text-[9px] text-studio-gold"><Coins size={9} /> {g.coins}</span>
                {g.firstSender && (
                  <span className="flex items-center gap-0.5 text-[8px] text-studio-muted" title={`Erster: ${g.firstSender.nickname} am ${fmtDate(g.firstSenderAt)}`}>
                    <Crown size={8} className="text-studio-gold" /> {g.firstSender.nickname}
                  </span>
                )}
                {mapped && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-studio-teal" title="Hat zugeordnete Aktionen" />}
              </button>
            );
          })}
        </div>

        {/* Detail-/Aktions-Panel */}
        {selectedGift && (
          <GiftActionPanel
            gift={selectedGift}
            rules={rules}
            sounds={sounds}
            layers={layers}
            lang={lang}
            onSaveRules={saveRules}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

function GiftActionPanel({
  gift, rules, sounds, layers, lang, onSaveRules, onClose,
}: {
  gift: GiftEntry;
  rules: TriggerRule[];
  sounds: SoundEntry[];
  layers: LayerRef[];
  lang: 'de' | 'en';
  onSaveRules: (r: TriggerRule[]) => void;
  onClose: () => void;
}) {
  const rule = findGiftRule(rules, gift.slug);
  const actions = rule?.actions ?? [];
  const others = otherGiftRules(rules, gift.slug);

  const setActions = (next: TriggerAction[]) => onSaveRules(upsertGiftRule(rules, gift.slug, next));

  const addAction = (kind: TriggerAction['kind']) => {
    const a: TriggerAction =
      kind === 'play_sound' ? { kind, soundId: '' }
      : kind === 'speak' ? { kind, template: `Danke {user} für ${gift.slug}!` }
      : { kind: 'fire_alert', targetId: '' };
    setActions([...actions, a]);
  };
  const patchAction = (i: number, a: TriggerAction) => setActions(actions.map((x, idx) => (idx === i ? a : x)));
  const removeAction = (i: number) => setActions(actions.filter((_, idx) => idx !== i));

  const test = () => {
    if (actions.length === 0) { toast('warn', 'Noch keine Aktion zugeordnet.'); return; }
    for (const a of actions) void window.studio.firePanel(a);
    toast('success', `„${gift.slug}" getestet — ${actions.length} Aktion(en).`);
  };

  return (
    <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-studio-border bg-studio-raised p-4">
      <div className="flex items-center gap-2">
        {gift.icon && <img src={gift.icon} alt="" className="h-10 w-10 object-contain" />}
        <div className="flex-1">
          <div className="font-display text-sm uppercase">{giftDisplayName(gift.slug, lang)}</div>
          {giftDisplayName(gift.slug, lang) !== gift.slug && (
            <div className="text-[9px] text-studio-muted/60">{gift.slug}</div>
          )}
          <div className="flex items-center gap-1 text-[10px] text-studio-gold"><Coins size={10} /> {gift.coins} Coins · {gift.count}× erhalten</div>
        </div>
        <button onClick={onClose} className="text-studio-muted hover:text-studio-accent"><X size={16} /></button>
      </div>

      {gift.firstSender && (
        <div className="flex items-center gap-1.5 rounded-lg bg-studio-bg px-2.5 py-1.5 text-[11px]">
          <Crown size={12} className="text-studio-gold" />
          <span className="text-studio-muted">Erster Schenker:</span>
          <span className="font-semibold">{gift.firstSender.nickname}</span>
          {gift.firstSenderAt && <span className="text-studio-muted">· {fmtDate(gift.firstSenderAt)}</span>}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-studio-muted">Aktionen bei diesem Gift</span>
        {actions.length > 0 && (
          <button onClick={test} className="flex items-center gap-1 text-[11px] text-studio-muted hover:text-studio-teal"><Play size={12} /> Test</button>
        )}
      </div>

      {actions.length === 0 && <p className="text-[11px] text-studio-muted">Noch nichts zugeordnet — füge unten eine Aktion hinzu.</p>}

      <div className="flex flex-col gap-2">
        {actions.map((a, i) => (
          <div key={i} className="rounded-lg border border-studio-border bg-studio-bg p-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-studio-muted">
                {ACTION_META.find((m) => m.kind === a.kind)?.label ?? a.kind}
              </span>
              <button onClick={() => removeAction(i)} className="text-studio-muted hover:text-studio-accent"><Trash2 size={12} /></button>
            </div>
            {a.kind === 'play_sound' ? (
              <select value={a.soundId} onChange={(e) => patchAction(i, { ...a, soundId: e.target.value })} className="bx-select">
                <option value="">Sound wählen…</option>
                {sounds.map((s) => <option key={s.id} value={s.id}>{s.filename}</option>)}
              </select>
            ) : a.kind === 'speak' ? (
              <input value={a.template} onChange={(e) => patchAction(i, { ...a, template: e.target.value })} placeholder="{user} hat {gift} geschickt!" className="bx-input" />
            ) : a.kind === 'fire_alert' ? (
              <select value={a.targetId} onChange={(e) => patchAction(i, { ...a, targetId: e.target.value })} className="bx-select">
                <option value="">Overlay-Layer wählen…</option>
                {layers.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.widgetType})</option>)}
              </select>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ACTION_META.map((m) => (
          <button key={m.kind} onClick={() => addAction(m.kind)} className="flex items-center gap-1 rounded-lg border border-studio-border px-2 py-1 text-[11px] text-studio-muted hover:border-studio-accent hover:text-studio-fg">
            <Plus size={11} /> <m.icon size={12} /> {m.label}
          </button>
        ))}
      </div>

      {others.length > 0 && (
        <p className="mt-1 text-[10px] text-studio-muted">
          + {others.length} weitere eigene Regel(n) auf der Trigger-Seite nutzen dieses Gift.
        </p>
      )}
    </div>
  );
}
