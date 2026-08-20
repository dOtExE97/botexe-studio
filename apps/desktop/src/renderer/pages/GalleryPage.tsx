// GalleryPage — Geschenke-Galerie: alle je gesehenen Gifts mit echtem Bild.
// Drei Ansichten (Letztes Live / Alle / Schon erhalten), Suche + Sortierung.
// Pro Gift lassen sich Aktionen zuordnen (Sound, Feuerwerk/Alert, TTS) — das
// legt im Hintergrund eine Trigger-Regel an (wie bei TikFinity). Der Erst-
// Schenker jedes Gifts ist mit Datum verewigt. 🏆
import { useEffect, useMemo, useState } from 'react';
import { Gift, Search, Crown, Coins, Volume2, Sparkles, Mic, Plus, Trash2, Play, X, Star, Clock, Download } from 'lucide-react';
import type { TriggerRule, TriggerAction } from '@botexe/trigger-engine';
import { findGiftRule, upsertGiftRule, otherGiftRules } from '@botexe/trigger-engine';
import { useGiftCatalog, type GiftEntry } from '../hooks/useGiftCatalog';
import { giftDisplayName, giftNameDe } from '../../shared/gift-names-de';
import { toast } from '../components/ToastHost';
import { passt, bewerte } from '../../shared/suche';
import { hatEigeneReaktion, slugsAusFeldwert, type WidgetGiftFeld } from '../../shared/gift-reaktionen';
import { WIDGET_TYPES } from './widget-types';

interface SoundEntry { id: string; filename: string }
interface LayerRef { id: string; name: string; widgetType: string; props?: Record<string, unknown> }

type View = 'favorites' | 'lastRoom' | 'all' | 'received';
type Sort = 'coins' | 'name' | 'recent';

const VIEWS: { id: View; label: string }[] = [
  { id: 'favorites', label: '⭐ Favoriten' },
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
  const { gifts, loaded, reload } = useGiftCatalog();
  const [rules, setRules] = useState<TriggerRule[]>([]);
  const [sounds, setSounds] = useState<SoundEntry[]>([]);
  const [layers, setLayers] = useState<LayerRef[]>([]);
  const [view, setView] = useState<View>('lastRoom');
  // Warum ist „Letztes Live" leer / warum fehlen Bilder? Der Abruf der
  // kompletten Room-Gift-Liste braucht einen eulerstream-Bezahlplan; mit dem
  // Gratis-Key kommen nur tatsächlich geschickte Gifts in den Katalog. Das war
  // bisher unsichtbar und sah nach einem Fehler aus.
  const [giftListStatus, setGiftListStatus] = useState<string>('unbekannt');
  useEffect(() => {
    void window.studio.getGiftListStatus?.().then(setGiftListStatus).catch(() => setGiftListStatus('unbekannt'));
  }, []);

  // Einmaliger Download des Bild-Pakets (~25 MB) — schliesst die Luecke, die
  // der kostenpflichtige Gift-Listen-Abruf laesst.
  const [paketLaeuft, setPaketLaeuft] = useState(false);
  const [paketProzent, setPaketProzent] = useState(0);
  useEffect(() => window.studio.onGiftImagesProgress?.((p) => {
    setPaketProzent(p.gesamt > 0 ? Math.round((p.geladen / p.gesamt) * 100) : 0);
  }), []);

  const bilderLaden = () => {
    setPaketLaeuft(true);
    setPaketProzent(0);
    void window.studio.downloadGiftImages?.()
      .then((r) => {
        if (r?.ok) {
          toast('success', `${r.geschrieben ?? 0} Geschenk-Bilder geladen.`);
          reload();
        } else {
          toast('error', `Bilder-Download fehlgeschlagen: ${r?.error ?? 'unbekannt'}`);
        }
      })
      .catch((e: Error) => toast('error', `Bilder-Download fehlgeschlagen: ${e.message}`))
      .finally(() => setPaketLaeuft(false));
  };
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
      // props kommen MIT: Die Vorschlags-Leiste muss wissen, welche Geschenke
      // schon in einem Widget stecken (Glücksrad, Geschenk-Menü, Ziehung …).
      setLayers(layouts.flatMap((l) => l.layers).map((l) => ({ id: l.id, name: l.name, widgetType: l.widgetType, props: l.props ?? {} })));
    })();
  }, []);

  const saveRules = (next: TriggerRule[]) => {
    setRules(next);
    void window.studio.setRules(next as unknown as unknown[]);
  };

  const setMeta = (slug: string, patch: { favorite?: boolean; customName?: string }) =>
    void window.studio.setGiftMeta(slug, patch).then(reload);

  const shown = useMemo(() => {
    const needle = q.trim();
    let list = gifts;
    if (view === 'favorites') list = list.filter((g) => g.favorite);
    else if (view === 'lastRoom') list = list.filter((g) => g.inLastRoom);
    else if (view === 'received') list = list.filter((g) => g.count > 0);
    // Suche matcht BEIDE Sprachen + eigenen Namen: „Herz", „Heart" oder „fette Rakete".
    // Tolerante Suche über beide Sprachen UND den eigenen Namen: „Herz",
    // „Heart", „Hertz" (Tippfehler) oder „fette Rakete" finden alle etwas.
    if (needle) list = list.filter((g) => passt(needle, g.slug, giftNameDe(g.slug) ?? undefined, g.customName));

    const sorted = [...list];
    const dn = (g: GiftEntry) => giftDisplayName(g.slug, lang, g.customName);
    // Beim SUCHEN zaehlt zuerst, wie gut der Treffer passt — die gewaehlte
    // Sortierung entscheidet nur noch bei gleicher Trefferguete.
    //
    // Das muss in DERSELBEN Sortierung stecken wie Coins/Name/Zuletzt: Eine
    // vorgelagerte Relevanz-Sortierung waere hier wirkungslos, weil die
    // folgenden Vergleiche eine vollstaendige Ordnung ueber einen anderen
    // Schluessel bilden und sie damit komplett ueberschreiben. Genau so stand
    // die Rose bei Sortierung „Name" wieder mittendrin.
    const rel = needle
      ? (g: GiftEntry) => bewerte(needle, [g.slug, giftNameDe(g.slug) ?? undefined, g.customName])
      : null;
    const nachRelevanz = (a: GiftEntry, b: GiftEntry) => (rel ? rel(b) - rel(a) : 0);

    if (sort === 'coins') sorted.sort((a, b) => nachRelevanz(a, b) || (b.coins || 0) - (a.coins || 0) || dn(a).localeCompare(dn(b)));
    else if (sort === 'name') sorted.sort((a, b) => nachRelevanz(a, b) || dn(a).localeCompare(dn(b)));
    else sorted.sort((a, b) => nachRelevanz(a, b) || (b.lastSeen || 0) - (a.lastSeen || 0));
    return sorted;
  }, [gifts, view, q, sort, lang]);

  // ---- Vorschlags-Leiste -------------------------------------------------
  // „Diese Geschenke kommen bei dir am häufigsten — und es passiert nichts."
  //
  // Die Geschenk-Felder werden aus der WIDGET-TYPDEFINITION gelesen, nicht aus
  // einer eigenen Liste: Feldtyp 'gift', 'gift-list' oder 'gift-command-list'.
  // Baut später jemand ein neues Widget mit Geschenk-Feld, ist es hier ohne
  // Änderung erfasst — sonst würde die Leiste Geschenke vorschlagen, die längst
  // verdrahtet sind.
  const widgetFelder = useMemo<WidgetGiftFeld[]>(() => {
    const out: WidgetGiftFeld[] = [];
    for (const ebene of layers) {
      const def = WIDGET_TYPES.find((w) => w.type === ebene.widgetType);
      if (!def) continue;
      const slugs: string[] = [];
      for (const f of def.fields) {
        if (f.type !== 'gift' && f.type !== 'gift-list' && f.type !== 'gift-command-list') continue;
        slugs.push(...slugsAusFeldwert(ebene.props?.[f.key]));
      }
      if (slugs.length > 0) out.push({ ebene: ebene.name, slugs });
    }
    return out;
  }, [layers]);

  // Weggeklickte Vorschläge bleiben weg — sonst nervt die Leiste nach jedem
  // Stream mit demselben Geschenk, das man bewusst nicht bespielen will.
  const [abgelehnt, setAbgelehnt] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('bx-gift-vorschlag-aus') || '[]') as string[]; } catch { return []; }
  });
  const ablehnen = (slug: string) => setAbgelehnt((cur) => {
    const n = [...new Set([...cur, slug])];
    localStorage.setItem('bx-gift-vorschlag-aus', JSON.stringify(n));
    return n;
  });
  const [vorschlaegeZu, setVorschlaegeZu] = useState(false);

  const vorschlaege = useMemo(() => {
    const q = { regeln: rules as unknown as Parameters<typeof hatEigeneReaktion>[1]['regeln'], widgetFelder };
    return gifts
      .filter((g) => (g.count ?? 0) >= 3) // unter 3× ist es Zufall, kein Muster
      .filter((g) => !abgelehnt.includes(g.slug))
      .filter((g) => !hatEigeneReaktion({ slug: g.slug, giftId: g.giftId }, q))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 5);
  }, [gifts, rules, widgetFelder, abgelehnt]);

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

      {/* Vorschläge: beliebte Geschenke, bei denen bisher nichts passiert.
          Steht ÜBER den Tabs, weil es der eine Handgriff ist, der den Stream
          spürbar lebendiger macht — und weil man es sonst nie sieht. */}
      {vorschlaege.length > 0 && (
        <div className="rounded-lg border border-studio-gold/40 bg-studio-gold/5 p-3">
          <div className="flex items-center gap-2">
            <Sparkles size={14} className="text-studio-gold" />
            <b className="font-display text-[11px] uppercase tracking-[0.25em] text-studio-gold">Vorschläge</b>
            <span className="text-[11px] text-studio-muted">
              Das schicken deine Zuschauer am häufigsten — und es passiert nichts damit.
            </span>
            <button
              onClick={() => setVorschlaegeZu((v) => !v)}
              className="ml-auto text-[11px] text-studio-muted transition-colors hover:text-studio-text"
            >
              {vorschlaegeZu ? 'zeigen' : 'ausblenden'}
            </button>
          </div>
          {!vorschlaegeZu && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {vorschlaege.map((g) => (
                <div
                  key={g.slug}
                  className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-raised py-1 pl-1.5 pr-1"
                >
                  {g.icon ? (
                    <img src={g.icon} alt="" className="h-7 w-7 rounded" />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-studio-bg text-[10px] text-studio-muted">?</div>
                  )}
                  <div className="leading-tight">
                    <div className="text-xs">{giftDisplayName(g.slug, lang, g.customName)}</div>
                    <div className="text-[10px] text-studio-muted">{g.count}× erhalten · {g.coins} Coins</div>
                  </div>
                  <button
                    // Suche mit zurücksetzen: sonst öffnet zwar die Detail-
                    // Ansicht, das Geschenk fehlt aber im Raster dahinter.
                    onClick={() => { setSelected(g.slug); setView('all'); setQ(''); }}
                    className="clip-slant bg-studio-gold/20 px-2 py-1 text-[10px] font-bold tracking-widest text-studio-gold transition-colors hover:bg-studio-gold/30"
                  >
                    AKTION DRAUF
                  </button>
                  <button
                    onClick={() => ablehnen(g.slug)}
                    title="Diesen Vorschlag nicht mehr zeigen"
                    className="p-1 text-studio-muted transition-colors hover:text-studio-accent"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
        {/* Bild-Paket: der eine Klick, der alle Platzhalter verschwinden laesst. */}
        <button
          onClick={bilderLaden}
          disabled={paketLaeuft}
          title="Lädt einmalig alle Geschenk-Bilder (~25 MB). Deine eigenen Bilder bleiben unangetastet."
          className="flex items-center gap-1.5 rounded-lg border border-studio-gold/50 bg-studio-gold/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-studio-gold hover:bg-studio-gold/20 disabled:opacity-60"
        >
          <Download size={13} />
          {paketLaeuft ? (paketProzent > 0 ? `Lädt… ${paketProzent}%` : 'Lädt…') : 'Bilder laden'}
        </button>
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
          {giftListStatus === 'plan-noetig' && (
            <p className="col-span-full rounded-xl border border-studio-gold/40 bg-studio-gold/5 p-3 text-xs leading-relaxed text-studio-muted">
              <b className="text-studio-gold">Warum fehlen manche Geschenke (und deren Bilder)?</b>{' '}
              TikTok gibt die vollständige Geschenk-Liste deines Streams nur gegen Aufpreis heraus —
              mit dem kostenlosen Zugang kommt sie nicht. Deshalb sammelt die App die Geschenke
              selbst: <b className="text-studio-text">jedes, das wirklich jemand schickt</b>, landet
              mit Bild hier und bleibt für immer. Bis dahin zeigen Widgets für solche Geschenke ein
              graues Platzhalter-Symbol.
              <span className="mt-1.5 block">
                <b className="text-studio-text">Schneller geht's mit „Bilder laden" oben</b> — das holt
                einmalig alle Geschenk-Bilder, danach hat jedes Widget sofort ein Bild. Eigene Bilder
                kannst du auch selbst ablegen (<b className="text-studio-text">Einstellungen →
                Geschenk-Bilder öffnen</b>), benannt nach dem Geschenk
                (<code>Hat and Mustache.png</code>) — Schreibweise egal. Deine eigenen Bilder werden
                vom Download nie überschrieben.
              </span>
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
                <span className="w-full truncate text-center text-[10px] font-medium" title={g.slug}>{giftDisplayName(g.slug, lang, g.customName)}</span>
                <span className="flex items-center gap-0.5 text-[9px] text-studio-gold"><Coins size={9} /> {g.coins}</span>
                {g.firstSender && (
                  <span className="flex items-center gap-0.5 text-[8px] text-studio-muted" title={`Erster: ${g.firstSender.nickname} am ${fmtDate(g.firstSenderAt)}`}>
                    <Crown size={8} className="text-studio-gold" /> {g.firstSender.nickname}
                  </span>
                )}
                <span
                  onClick={(e) => { e.stopPropagation(); setMeta(g.slug, { favorite: !g.favorite }); }}
                  className="absolute left-1 top-1 cursor-pointer rounded p-0.5 hover:bg-studio-bg/60"
                  title={g.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                >
                  <Star size={12} className={g.favorite ? 'fill-studio-gold text-studio-gold' : 'text-studio-muted/40'} />
                </span>
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
            onSetMeta={(patch) => setMeta(selectedGift.slug, patch)}
            onSaveRules={saveRules}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  );
}

/** Eigener-Name-Feld — controlled, synct beim Gift-Wechsel neu, committet bei
 *  Blur. Verhindert verlorene Eingaben beim schnellen Wechseln der Auswahl. */
function CustomNameInput({ slug, value, onCommit }: { slug: string; value: string; onCommit: (v: string) => void }) {
  const [val, setVal] = useState(value);
  useEffect(() => { setVal(value); }, [slug, value]);
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => { if (val !== value) onCommit(val); }}
      placeholder="Eigener Name (optional, gewinnt über Übersetzung)"
      className="bx-input text-xs"
    />
  );
}

function GiftActionPanel({
  gift, rules, sounds, layers, lang, onSetMeta, onSaveRules, onClose,
}: {
  gift: GiftEntry;
  rules: TriggerRule[];
  sounds: SoundEntry[];
  layers: LayerRef[];
  lang: 'de' | 'en';
  onSetMeta: (patch: { favorite?: boolean; customName?: string }) => void;
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
          <div className="font-display text-sm uppercase">{giftDisplayName(gift.slug, lang, gift.customName)}</div>
          {giftDisplayName(gift.slug, lang, gift.customName) !== gift.slug && (
            <div className="text-[9px] text-studio-muted/80">{gift.slug}</div>
          )}
          <div className="flex items-center gap-1 text-[10px] text-studio-gold"><Coins size={10} /> {gift.coins} Coins · {gift.count}× erhalten</div>
        </div>
        <button onClick={() => onSetMeta({ favorite: !gift.favorite })} title={gift.favorite ? 'Favorit entfernen' : 'Als Favorit'} className="text-studio-muted hover:text-studio-gold">
          <Star size={16} className={gift.favorite ? 'fill-studio-gold text-studio-gold' : ''} />
        </button>
        <button onClick={onClose} className="text-studio-muted hover:text-studio-accent"><X size={16} /></button>
      </div>
      <CustomNameInput slug={gift.slug} value={gift.customName ?? ''} onCommit={(name) => onSetMeta({ customName: name })} />

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

      {rule && actions.length > 0 && (
        <label className="flex items-center gap-2 text-[11px] text-studio-muted" title="Wie oft dieses Gift seine Aktionen maximal auslöst. 0 = jedes Mal. Rettet bei Gift-Spam (z.B. Rosen-Regen).">
          <Clock size={12} /> Höchstens alle
          <input
            type="number" min={0} max={600}
            value={Math.round((rule.cooldownMs ?? 0) / 1000)}
            onChange={(e) => {
              const sec = Math.max(0, Math.min(600, Number(e.target.value) || 0));
              onSaveRules(rules.map((r) => (r.id === rule.id ? { ...r, cooldownMs: sec * 1000 } : r)));
            }}
            className="bx-input w-16 font-mono text-xs"
          />
          Sek. <span className="text-studio-muted/80">(0 = jedes Gift)</span>
        </label>
      )}
      {others.length > 0 && (
        <p className="mt-1 text-[10px] text-studio-muted">
          + {others.length} weitere eigene Regel(n) auf der Trigger-Seite nutzen dieses Gift.
        </p>
      )}
    </div>
  );
}
