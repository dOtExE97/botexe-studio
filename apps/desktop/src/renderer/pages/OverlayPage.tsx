// OverlayPage — den EINEN Overlay-Screen zusammenbauen.
// Canvas = Hochformat (TikTok-Default) oder Querformat, skaliert; Layer direkt
// am Objekt draggen/resizen, Eigenschaften rechts im Panel. TikTok-SafeZones
// werden als Guides eingeblendet (wo Chat/Buttons der TikTok-UI liegen).
// Speichern validiert (ajv) und pusht live.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CANVAS_PRESETS,
  getSafeZoneProfile,
  type CanvasPreset,
  type OverlayLayout,
  type OverlayLayer,
} from '@botexe/overlay-engine';

interface PropField {
  key: string;
  label: string;
  /** seconds = im UI in Sekunden, gespeichert als ms · boolean = Schalter */
  type: 'number' | 'text' | 'select' | 'color' | 'boolean' | 'seconds';
  options?: { value: string; label: string }[];
  hint?: string;
}

const ACCENT_FIELD: PropField = {
  key: 'accent',
  label: 'Akzentfarbe',
  type: 'color',
  hint: 'färbt Kanten, Balken und Badges dieses Widgets',
};

function styleField(options: { value: string; label: string }[]): PropField {
  return { key: 'style', label: 'Stil', type: 'select', options };
}

const WIDGET_TYPES: {
  type: string;
  label: string;
  desc: string;
  w: number;
  h: number;
  props: Record<string, unknown>;
  fields: PropField[];
}[] = [
  {
    type: 'gift-alert', label: 'Gift-Alert', desc: 'Großer Alert mitten im Bild, wenn ein Gift kommt — mit Gift-Bild und Profilfoto.',
    w: 760, h: 380, props: { minCoins: 0, durationMs: 5000 },
    fields: [
      { key: 'minCoins', label: 'Erst ab … Coins', type: 'number', hint: 'Kleinere Gifts lösen keinen großen Alert aus. 0 = jedes Gift.' },
      { key: 'durationMs', label: 'Anzeigedauer', type: 'seconds', hint: 'Wie lange der Alert sichtbar bleibt.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'follow-alert', label: 'Follow-Alert', desc: 'Einblendung für Follows, Subs und Shares — in 4 Stilen.',
    w: 460, h: 90, props: { durationMs: 3600, style: 'glas', colorByType: true },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas (edel)' },
        { value: 'neon', label: 'Neon (leuchtende Outline)' },
        { value: 'minimal', label: 'Minimal (schlank, deckt wenig)' },
        { value: 'hype', label: 'Hype (fett, gefüllt)' },
      ]),
      { key: 'durationMs', label: 'Anzeigedauer', type: 'seconds', hint: 'Wie lange jede Einblendung sichtbar bleibt.' },
      { key: 'colorByType', label: 'Eigene Farbe pro Typ', type: 'boolean', hint: 'An: Follow türkis, Sub gold, Share rot. Aus: überall deine Akzentfarbe.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'goal-bar', label: 'Goal-Bar', desc: 'Fortschrittsbalken Richtung Session-Ziel.',
    w: 560, h: 80, props: { metric: 'coins', target: 1000, label: '' },
    fields: [
      { key: 'metric', label: 'Metrik', type: 'select', options: [
        { value: 'coins', label: 'Coins' }, { value: 'likes', label: 'Likes' },
        { value: 'follows', label: 'Follower' }, { value: 'gifts', label: 'Gifts' },
      ] },
      { key: 'target', label: 'Ziel', type: 'number', hint: 'Bei diesem Wert ist der Balken voll.' },
      { key: 'label', label: 'Eigener Titel', type: 'text', hint: 'Leer = automatisch (z.B. „Coin-Goal").' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'leaderboard', label: 'Top Gifter', desc: 'Die größten Gift-Supporter — TikFinity-Look (Avatare + Kronen) oder Box.',
    w: 760, h: 180, props: { source: 'gifts', limit: 5, title: '', style: 'arcade' },
    fields: [
      { key: 'source', label: 'Quelle', type: 'select', options: [
        { value: 'gifts', label: 'Gifts (Coins)' }, { value: 'likes', label: 'Likes' },
      ] },
      styleField([
        { value: 'arcade', label: 'Arcade (TikFinity-Look)' },
        { value: 'glas', label: 'Glas (Panel)' },
        { value: 'neon', label: 'Neon (durchscheinend)' },
        { value: 'bars', label: 'Balken (minimal)' },
      ]),
      { key: 'limit', label: 'Plätze', type: 'number', hint: 'Wie viele Zuschauer angezeigt werden (1–10).' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Leer = automatisch („Top Gifter").' },
      { key: 'showPic', label: 'Profilbilder zeigen', type: 'boolean', hint: 'Avatare der Zuschauer anzeigen.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'leaderboard', label: 'Like-Liste', desc: 'Wer am fleißigsten liked — TikFinity-Look (Avatare + Kronen) oder Box.',
    w: 760, h: 180, props: { source: 'likes', limit: 5, title: '', style: 'arcade' },
    fields: [
      { key: 'source', label: 'Quelle', type: 'select', options: [
        { value: 'gifts', label: 'Gifts (Coins)' }, { value: 'likes', label: 'Likes' },
      ] },
      styleField([
        { value: 'arcade', label: 'Arcade (TikFinity-Look)' },
        { value: 'glas', label: 'Glas (Panel)' },
        { value: 'neon', label: 'Neon (durchscheinend)' },
        { value: 'bars', label: 'Balken (minimal)' },
      ]),
      { key: 'limit', label: 'Plätze', type: 'number', hint: 'Wie viele Zuschauer angezeigt werden (1–10).' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Leer = automatisch („Top Likes").' },
      { key: 'showPic', label: 'Profilbilder zeigen', type: 'boolean', hint: 'Avatare der Zuschauer anzeigen.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'top-rotator', label: 'Bestenliste (Wechsel)', desc: 'Zeigt abwechselnd Top Gifter, Top Likes, Top Punkte — smooth übergeblendet, untereinander. Ideal fürs Hochformat.',
    w: 460, h: 360, props: { sources: 'gifts,likes', interval: 5, limit: 5, accent: '', showPic: true },
    fields: [
      { key: 'sources', label: 'Welche Listen', type: 'text', hint: 'Reihenfolge, kommagetrennt: gifts, likes, points.' },
      { key: 'interval', label: 'Sekunden pro Liste', type: 'number', hint: 'Wie lange jede Liste gezeigt wird, bevor gewechselt wird.' },
      { key: 'limit', label: 'Plätze', type: 'number', hint: 'Wie viele Zuschauer pro Liste (1–8).' },
      { key: 'showPic', label: 'Profilbilder zeigen', type: 'boolean', hint: 'Avatare der Zuschauer anzeigen.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'points-board', label: 'Punkte-Bestenliste', desc: 'All-Time Top-Supporter nach gesammelten Loyalty-Punkten (über alle Streams).',
    w: 360, h: 300, props: { source: 'points', limit: 5, title: '', accent: '#7c5cff' },
    fields: [
      { key: 'limit', label: 'Plätze', type: 'number', hint: 'Wie viele Top-Supporter (1–10).' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Leer = automatisch („Top Punkte").' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'countdown', label: 'Countdown', desc: 'Zähler nach unten — z.B. „Stream startet in" oder Pausen-Timer.',
    w: 460, h: 200, props: { minutes: 5, label: 'Countdown', doneText: 'LOS!' },
    fields: [
      { key: 'minutes', label: 'Startzeit (Minuten)', type: 'number', hint: 'Von hier zählt der Timer runter (beim Laden der Quelle).' },
      { key: 'label', label: 'Beschriftung', type: 'text', hint: 'Text über dem Timer, z.B. „Stream-Start in".' },
      { key: 'doneText', label: 'Text bei 0', type: 'text', hint: 'Was angezeigt wird, wenn der Timer abläuft.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'activity-feed', label: 'Activity-Feed', desc: 'Alle Events gemischt (Follow, Sub, Share, Gift) als Live-Ticker.',
    w: 420, h: 320, props: { max: 6, ttlMs: 60000 },
    fields: [
      { key: 'max', label: 'Max. Einträge', type: 'number', hint: 'So viele Events bleiben gleichzeitig sichtbar.' },
      { key: 'ttlMs', label: 'Verschwinden nach', type: 'seconds', hint: 'Wie lange ein Eintrag stehen bleibt (0 = nie).' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'wheel', label: 'Glücksrad', desc: 'Dreht bei einer Trigger-Aktion (z.B. !spin gegen Punkte) und zeigt den Gewinn. Preise frei wählbar.',
    w: 480, h: 560, props: { segments: '100 Coins|Nichts|VIP-Tag|Shoutout|50 Punkte|Joker|Doppelt|Pech', spinMs: 5000, accent: '#ff5436', autoShow: true, title: 'Glücksrad' },
    fields: [
      { key: 'segments', label: 'Preise', type: 'text', hint: 'Mit | trennen — jeder Eintrag ein Segment, z.B. „100 Coins|Nichts|VIP".' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Überschrift über dem Rad.' },
      { key: 'spinMs', label: 'Drehdauer', type: 'seconds', hint: 'Wie lange das Rad dreht, bis es stoppt.' },
      { key: 'autoShow', label: 'Auto ein-/ausblenden', type: 'boolean', hint: 'An: Rad erscheint beim Spin und verschwindet nach dem Ergebnis (deckt sonst nichts zu). Aus: dauerhaft sichtbar.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'top-gift', label: 'Top-Gift', desc: 'Highlight des größten Einzel-Gifts der Session — Bild, Spender, Bounce bei Rekord.',
    w: 320, h: 320, props: { title: '', accent: '#ffd23e' },
    fields: [{ key: 'title', label: 'Titel', type: 'text', hint: 'Überschrift, leer = „Größtes Gift".' }, ACCENT_FIELD],
  },
  {
    type: 'heart-rain', label: 'Herzregen', desc: 'Likes steigen als Emojis auf (TikTok-Style) — transparent, deckt nichts zu.',
    w: 1080, h: 900, props: { emojis: '❤️,💖,💕,✨,🔥', maxPerBurst: 5 },
    fields: [
      { key: 'emojis', label: 'Emojis', type: 'text', hint: 'Welche Symbole aufsteigen, kommagetrennt (z.B. ❤️,💖,🔥).' },
      { key: 'maxPerBurst', label: 'Max. pro Like-Schub', type: 'number', hint: 'Begrenzt, wie viele bei einer Like-Welle gleichzeitig kommen.' },
    ],
  },
  {
    type: 'text-ticker', label: 'Lauftext-Banner', desc: 'Scrollender Streifen für Socials/Ansagen — dünn, deckt kaum zu. 3 Stile.',
    w: 760, h: 56, props: { messages: 'Folge mir! | Discord in der Bio | Danke fürs Zuschauen ❤️', speed: 18, style: 'glas' },
    fields: [
      { key: 'messages', label: 'Nachrichten', type: 'text', hint: 'Mehrere mit | trennen, z.B. „Folge mir! | Discord in der Bio".' },
      styleField([
        { value: 'glas', label: 'Glas' },
        { value: 'solid', label: 'Gefüllt' },
        { value: 'neon', label: 'Neon' },
      ]),
      { key: 'speed', label: 'Tempo (Sek/Runde)', type: 'number', hint: 'Kleiner = schneller. Sekunden für einen Durchlauf.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'gift-jar', label: 'Coin-Glas', desc: 'Bonbon-Glas, das sich mit den Geschenken füllt — jedes Gift ein Ball mit Bild, größer bei mehr Coins.',
    w: 440, h: 520, props: { target: 2000, label: '', accent: '#ffd23e' },
    fields: [
      { key: 'target', label: 'Ziel (Coins)', type: 'number', hint: 'Bei diesem Wert ist das Glas voll.' },
      { key: 'label', label: 'Eigener Titel', type: 'text', hint: 'Text über dem Glas, leer = „Coin-Glas".' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'gift-fireworks', label: 'Gift-Feuerwerk', desc: 'Jedes Gift steigt als Rakete auf und explodiert — je mehr Coins, desto fetter der Burst.',
    w: 900, h: 1200, props: { minCoins: 0, maxRockets: 3 },
    fields: [
      { key: 'minCoins', label: 'Erst ab … Coins', type: 'number', hint: 'Feuerwerk nur für Gifts ab diesem Wert. 0 = jedes.' },
      { key: 'maxRockets', label: 'Max. Raketen gleichzeitig', type: 'number', hint: 'Begrenzt die Show bei vielen Gifts auf einmal.' },
    ],
  },
  {
    type: 'gift-feed', label: 'Gift-Feed', desc: 'Ticker der letzten Gifts mit Gift-Bildern.',
    w: 380, h: 240, props: { max: 5, ttlMs: 25000 },
    fields: [
      { key: 'max', label: 'Max. Einträge', type: 'number', hint: 'So viele letzte Gifts bleiben sichtbar.' },
      { key: 'ttlMs', label: 'Verschwinden nach', type: 'seconds', hint: 'Wie lange ein Gift im Ticker bleibt.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'stat-chips', label: 'Live-Zähler', desc: 'Kompakte Chips für Viewer, Likes, Follower & Co. — mit Puls bei jeder Änderung.',
    w: 540, h: 60, props: { metrics: 'viewers,likes,follows' },
    fields: [
      { key: 'metrics', label: 'Welche Zähler', type: 'text', hint: 'Kommagetrennt, Reihenfolge zählt: viewers, likes, follows, coins, gifts, shares.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'chat-box', label: 'Chat-Box', desc: 'Der Live-Chat direkt im Overlay.',
    w: 420, h: 360, props: { max: 8, hideAfterMs: 0, accent: '#ff5436' },
    fields: [
      { key: 'max', label: 'Max. Nachrichten', type: 'number', hint: 'So viele Chat-Zeilen bleiben gleichzeitig sichtbar.' },
      { key: 'hideAfterMs', label: 'Ausblenden nach', type: 'seconds', hint: 'Einzelne Nachrichten verschwinden danach. 0 = bleiben.' },
      ACCENT_FIELD,
    ],
  },
];

interface ZoneStyle {
  fill: string;
  stroke: string;
}
const ZONE_FALLBACK: ZoneStyle = { fill: 'rgba(255,210,62,.10)', stroke: 'rgba(255,210,62,.55)' };
const ZONE_STYLE: Record<string, ZoneStyle> = {
  blocked: { fill: 'rgba(255,77,46,.16)', stroke: 'rgba(255,77,46,.7)' },
  risky: ZONE_FALLBACK,
  focus: { fill: 'transparent', stroke: 'rgba(33,230,193,.55)' },
};

function newLayerId(): string {
  return `layer-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function freshLayout(name: string, preset: CanvasPreset): OverlayLayout {
  return {
    schemaVersion: 1,
    id: `layout-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    name,
    canvas: { ...CANVAS_PRESETS[preset], background: 'transparent' },
    layers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export default function OverlayPage() {
  const [profiles, setProfiles] = useState<OverlayLayout[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [layout, setLayout] = useState<OverlayLayout | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: OverlayLayer } | null>(null);

  const canvasW = layout?.canvas.width ?? CANVAS_PRESETS.portrait.width;
  const canvasH = layout?.canvas.height ?? CANVAS_PRESETS.portrait.height;
  const safeZones = getSafeZoneProfile(canvasW, canvasH);

  // Profile laden — oder das erste Profil anlegen (Hochformat-Default)
  useEffect(() => {
    void (async () => {
      let list = (await window.studio.listLayouts()) as OverlayLayout[];
      if (list.length === 0) {
        const first = freshLayout('Hochformat', 'portrait');
        await window.studio.saveLayout(first);
        await window.studio.setActiveLayout(first.id);
        list = [first];
      }
      const settings = (await window.studio.getSettings()) as { activeLayoutId: string | null };
      const active = settings.activeLayoutId ?? list[0]?.id ?? null;
      setProfiles(list);
      setActiveId(active);
      const cur = list.find((l) => l.id === active) ?? list[0] ?? null;
      setLayout(cur);
    })();
  }, []);

  const refreshProfiles = async () => {
    setProfiles((await window.studio.listLayouts()) as OverlayLayout[]);
  };

  const selectProfile = (id: string) => {
    const p = profiles.find((l) => l.id === id);
    if (p) {
      setLayout(p);
      setSelectedId(null);
    }
  };

  const createProfile = async (preset: CanvasPreset) => {
    const fresh = freshLayout(preset === 'portrait' ? 'Hochformat' : 'Querformat', preset);
    await window.studio.saveLayout(fresh);
    await refreshProfiles();
    setLayout(fresh);
    setSelectedId(null);
  };

  const renameProfile = async (name: string) => {
    if (!layout) return;
    await persist({ ...layout, name });
    await refreshProfiles();
  };

  const deleteProfile = async (id: string) => {
    if (profiles.length <= 1) return; // mindestens ein Profil behalten
    await window.studio.deleteLayout(id);
    const rest = profiles.filter((l) => l.id !== id);
    await refreshProfiles();
    if (layout?.id === id) setLayout(rest[0] ?? null);
    if (activeId === id && rest[0]) {
      await window.studio.setActiveLayout(rest[0].id);
      setActiveId(rest[0].id);
    }
  };

  const duplicateProfile = async () => {
    if (!layout) return;
    const copy: OverlayLayout = {
      ...layout,
      id: `layout-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
      name: `${layout.name} Kopie`,
      layers: layout.layers.map((l) => ({ ...l })),
    };
    await window.studio.saveLayout(copy);
    await refreshProfiles();
    setLayout(copy);
  };

  const makeDefault = async () => {
    if (!layout) return;
    await window.studio.setActiveLayout(layout.id);
    setActiveId(layout.id);
  };

  const copyProfileLink = async (id: string) => {
    const link = (await window.studio.getProfileLink(id)) as string;
    await navigator.clipboard.writeText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  // Canvas-Skalierung an Containergröße anpassen
  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const update = () =>
      setScale(Math.min((el.clientWidth - 24) / canvasW, (el.clientHeight - 24) / canvasH));
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, [layout === null, canvasW, canvasH]);

  const persist = useCallback(async (next: OverlayLayout) => {
    setLayout(next);
    const result = (await window.studio.saveLayout(next)) as { ok: boolean; errors?: string[] };
    if (result.ok) {
      setSaveState('saved');
      setSaveError('');
      setProfiles((prev) => prev.map((p) => (p.id === next.id ? next : p)));
      setTimeout(() => setSaveState('idle'), 1200);
    } else {
      setSaveState('error');
      setSaveError((result.errors ?? []).join('; '));
    }
  }, []);

  const updateLayer = (id: string, patch: Partial<OverlayLayer>, save = false) => {
    if (!layout) return;
    const next = {
      ...layout,
      layers: layout.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    };
    if (save) void persist(next);
    else setLayout(next);
  };

  const switchPreset = (preset: CanvasPreset) => {
    if (!layout) return;
    const dims = CANVAS_PRESETS[preset];
    if (layout.canvas.width === dims.width) return;
    // Layer in den neuen Canvas einpassen, nichts darf außerhalb liegen.
    const layers = layout.layers.map((l) => ({
      ...l,
      x: Math.min(l.x, Math.max(0, dims.width - l.w)),
      y: Math.min(l.y, Math.max(0, dims.height - l.h)),
      w: Math.min(l.w, dims.width),
      h: Math.min(l.h, dims.height),
    }));
    void persist({ ...layout, canvas: { ...layout.canvas, width: dims.width, height: dims.height }, layers });
  };

  const addWidget = (typeDef: (typeof WIDGET_TYPES)[number]) => {
    if (!layout) return;
    const w = Math.min(typeDef.w, canvasW - 40);
    const h = Math.min(typeDef.h, canvasH - 40);
    const layer: OverlayLayer = {
      id: newLayerId(),
      widgetType: typeDef.type,
      name: typeDef.label,
      x: Math.round((canvasW - w) / 2),
      y: Math.round((canvasH - h) / 2),
      w,
      h,
      z: layout.layers.length + 1,
      visible: true,
      props: { ...typeDef.props },
    };
    setSelectedId(layer.id);
    void persist({ ...layout, layers: [...layout.layers, layer] });
  };

  const removeLayer = (id: string) => {
    if (!layout) return;
    setSelectedId(null);
    void persist({ ...layout, layers: layout.layers.filter((l) => l.id !== id) });
  };

  // Drag & Resize direkt am Canvas
  const onPointerDown = (e: React.PointerEvent, layer: OverlayLayer, mode: 'move' | 'resize') => {
    e.stopPropagation();
    setSelectedId(layer.id);
    dragRef.current = { id: layer.id, mode, startX: e.clientX, startY: e.clientY, orig: { ...layer } };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    if (drag.mode === 'move') {
      updateLayer(drag.id, {
        x: Math.round(Math.max(0, Math.min(canvasW - drag.orig.w, drag.orig.x + dx))),
        y: Math.round(Math.max(0, Math.min(canvasH - drag.orig.h, drag.orig.y + dy))),
      });
    } else {
      updateLayer(drag.id, {
        w: Math.round(Math.max(60, drag.orig.w + dx)),
        h: Math.round(Math.max(40, drag.orig.h + dy)),
      });
    }
  };
  const onPointerUp = () => {
    if (dragRef.current && layout) void persist(layout);
    dragRef.current = null;
  };

  if (!layout) return <div className="p-6 text-studio-muted">Lade…</div>;

  const selected = layout.layers.find((l) => l.id === selectedId) ?? null;
  const selectedDef = selected
    ? WIDGET_TYPES.find(
        (w) =>
          w.type === selected.widgetType &&
          (w.type !== 'leaderboard' || w.props.source === (selected.props?.source ?? 'gifts')),
      ) ?? WIDGET_TYPES.find((w) => w.type === selected.widgetType)
    : null;
  const isPortrait = canvasH > canvasW;

  return (
    <div className="grid h-full grid-cols-[200px_1fr_260px] gap-0">
      {/* Widget-Palette */}
      <aside className="overflow-y-auto border-r border-studio-border bg-studio-panel p-3">
        <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.3em] text-studio-muted">Widgets</h2>
        <div className="flex flex-col gap-2">
          {WIDGET_TYPES.map((w) => (
            <button
              key={w.label}
              onClick={() => addWidget(w)}
              className="clip-slant group border border-studio-border bg-studio-raised p-3 text-left transition-colors hover:border-studio-accent/60"
            >
              <div className="text-xs font-bold group-hover:text-studio-accent">{w.label}</div>
              <div className="mt-0.5 text-[10px] leading-snug text-studio-muted">{w.desc}</div>
            </button>
          ))}
        </div>
      </aside>

      {/* Canvas */}
      <section className="relative flex flex-col overflow-hidden bg-studio-bg">
        {/* Profil-Leiste — jedes Profil ist ein eigener Overlay-Screen mit eigenem Link */}
        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-studio-border bg-studio-panel px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-studio-muted">Profile</span>
          {profiles.map((p) => {
            const isPortraitP = p.canvas.height > p.canvas.width;
            const isCurrent = p.id === layout?.id;
            return (
              <div
                key={p.id}
                className={`clip-slant flex items-center gap-1.5 border px-2.5 py-1.5 text-xs ${
                  isCurrent ? 'border-studio-accent bg-studio-accent/15 text-studio-text' : 'border-studio-border bg-studio-raised text-studio-muted'
                }`}
              >
                <button onClick={() => selectProfile(p.id)} className="flex items-center gap-1.5">
                  <span>{isPortraitP ? '📱' : '🖥'}</span>
                  <span className="font-bold">{p.name}</span>
                  {p.id === activeId && <span className="text-[9px] text-studio-teal" title="Standard-Link">★</span>}
                </button>
                <button
                  onClick={() => void copyProfileLink(p.id)}
                  title="Overlay-Link dieses Profils kopieren"
                  className="text-studio-muted hover:text-studio-teal"
                >
                  {copiedId === p.id ? '✓' : '🔗'}
                </button>
              </div>
            );
          })}
          <button onClick={() => void createProfile('portrait')} className="clip-slant border border-studio-border bg-studio-raised px-2.5 py-1.5 text-xs text-studio-muted hover:text-studio-accent" title="Neues Hochformat-Profil">
            + 📱
          </button>
          <button onClick={() => void createProfile('landscape')} className="clip-slant border border-studio-border bg-studio-raised px-2.5 py-1.5 text-xs text-studio-muted hover:text-studio-accent" title="Neues Querformat-Profil">
            + 🖥
          </button>
          <div className="flex-1" />
          {layout && (
            <>
              <input
                value={layout.name}
                onChange={(e) => setLayout({ ...layout, name: e.target.value })}
                onBlur={(e) => void renameProfile(e.target.value)}
                className="w-40 border border-studio-border bg-studio-raised px-2 py-1.5 text-xs outline-none focus:border-studio-accent"
                title="Profil umbenennen"
              />
              <button onClick={() => void duplicateProfile()} className="text-[11px] text-studio-muted hover:text-studio-text" title="Profil duplizieren">⎘ Kopie</button>
              {layout.id !== activeId && (
                <button onClick={() => void makeDefault()} className="text-[11px] text-studio-teal hover:text-studio-text" title="Als Standard-Link setzen">★ Standard</button>
              )}
              {profiles.length > 1 && (
                <button onClick={() => void deleteProfile(layout.id)} className="text-[11px] text-studio-muted hover:text-studio-accent">Löschen</button>
              )}
            </>
          )}
        </div>

        {/* Canvas-Toolbar */}
        <div className="flex flex-none items-center gap-2 border-b border-studio-border bg-studio-panel/60 px-3 py-2">
          {(Object.keys(CANVAS_PRESETS) as CanvasPreset[]).map((preset) => {
            const dims = CANVAS_PRESETS[preset];
            const active = canvasW === dims.width && canvasH === dims.height;
            return (
              <button
                key={preset}
                onClick={() => switchPreset(preset)}
                className={`clip-slant px-3 py-1.5 text-[11px] font-bold tracking-wider ${
                  active ? 'bg-studio-accent text-black' : 'bg-studio-raised text-studio-muted hover:text-studio-text'
                }`}
              >
                {preset === 'portrait' ? '📱 ' : '🖥 '}
                {dims.label} · {dims.width}×{dims.height}
              </button>
            );
          })}
          <div className="flex-1" />
          <label className="flex items-center gap-2 text-[11px] text-studio-muted">
            <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} className="accent-[#ff4d2e]" />
            TikTok-UI-Zonen
          </label>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center p-3" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
          <div
            ref={canvasRef}
            onPointerDown={() => setSelectedId(null)}
            className="relative flex-none"
            style={{
              width: canvasW * scale,
              height: canvasH * scale,
              backgroundImage:
                'linear-gradient(45deg, #14161e 25%, transparent 25%, transparent 75%, #14161e 75%), linear-gradient(45deg, #14161e 25%, #101218 25%, #101218 75%, #14161e 75%)',
              backgroundSize: '24px 24px',
              backgroundPosition: '0 0, 12px 12px',
              boxShadow: '0 0 0 1px #262a36',
            }}
          >
            {/* TikTok-UI SafeZones als Guides */}
            {showZones &&
              safeZones?.zones.map((zone) => {
                const zs = ZONE_STYLE[zone.kind] ?? ZONE_FALLBACK;
                return (
                  <div
                    key={zone.id}
                    className="pointer-events-none absolute"
                    style={{
                      left: zone.x * scale,
                      top: zone.y * scale,
                      width: zone.w * scale,
                      height: zone.h * scale,
                      background: zs.fill,
                      outline: `1.5px dashed ${zs.stroke}`,
                      outlineOffset: '-1.5px',
                    }}
                    title={zone.note}
                  >
                    <span
                      className="absolute top-0.5 left-1 text-[8px] font-bold uppercase tracking-wider"
                      style={{ color: zs.stroke }}
                    >
                      {zone.label}
                    </span>
                  </div>
                );
              })}

            {layout.layers.map((layer) => {
              const isSel = layer.id === selectedId;
              const label =
                layer.widgetType === 'leaderboard' && layer.props?.source === 'likes'
                  ? 'Like-Liste'
                  : (WIDGET_TYPES.find((w) => w.type === layer.widgetType)?.label ?? layer.widgetType);
              return (
                <div
                  key={layer.id}
                  onPointerDown={(e) => onPointerDown(e, layer, 'move')}
                  className={`absolute flex cursor-grab items-center justify-center select-none active:cursor-grabbing ${
                    isSel ? 'z-50' : ''
                  }`}
                  style={{
                    left: layer.x * scale,
                    top: layer.y * scale,
                    width: layer.w * scale,
                    height: layer.h * scale,
                    background: isSel ? 'rgba(255,77,46,.14)' : 'rgba(33,230,193,.07)',
                    outline: isSel ? '2px solid #ff4d2e' : '1px dashed rgba(33,230,193,.45)',
                    opacity: layer.visible ? 1 : 0.35,
                  }}
                >
                  <span className="pointer-events-none px-1 text-center font-display text-[11px] uppercase tracking-wider text-white/80" style={{ textShadow: '0 1px 4px #000' }}>
                    {label}
                  </span>
                  {isSel && (
                    <div
                      onPointerDown={(e) => onPointerDown(e, layer, 'resize')}
                      className="absolute -right-1.5 -bottom-1.5 h-3.5 w-3.5 cursor-nwse-resize bg-studio-accent"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="absolute bottom-2 left-3 text-[10px] text-studio-muted">
            {canvasW}×{canvasH} · {isPortrait ? 'Hochformat' : 'Querformat'} · transparent ·{' '}
            {saveState === 'saved' ? '✓ gespeichert & live gepusht' : saveState === 'error' ? `⚠ ${saveError}` : 'Änderungen speichern automatisch'}
          </div>
        </div>
      </section>

      {/* Property-Panel */}
      <aside className="overflow-y-auto border-l border-studio-border bg-studio-panel p-4">
        {!selected && (
          <div className="mt-2 flex flex-col gap-3 text-xs leading-relaxed text-studio-muted">
            <p>Klick links ein Widget, um es auf den Screen zu legen — oder wähl eins auf dem Canvas aus, um es hier einzustellen.</p>
            <div className="border-t border-studio-border pt-3">
              <p className="mb-2 font-bold uppercase tracking-widest text-[10px]">TikTok-UI-Zonen</p>
              <p><span style={{ color: ZONE_STYLE.blocked?.stroke }}>■ Rot</span> — hier liegt Chat/Gift-Leiste, Widgets werden verdeckt.</p>
              <p><span style={{ color: ZONE_STYLE.risky?.stroke }}>■ Gelb</span> — riskant, UI-Elemente je nach Gerät.</p>
              <p><span style={{ color: ZONE_STYLE.focus?.stroke }}>■ Türkis</span> — bester Bereich für dauerhafte Widgets.</p>
            </div>
          </div>
        )}
        {selected && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-sm uppercase">{selectedDef?.label}</h2>
              <button onClick={() => removeLayer(selected.id)} className="text-[11px] text-studio-muted hover:text-studio-accent">
                Entfernen
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(['x', 'y', 'w', 'h'] as const).map((k) => (
                <label key={k} className="text-[10px] uppercase tracking-widest text-studio-muted">
                  {k}
                  <input
                    type="number"
                    value={selected[k]}
                    onChange={(e) => updateLayer(selected.id, { [k]: Number(e.target.value) } as Partial<OverlayLayer>, true)}
                    className="mt-1 w-full border border-studio-border bg-studio-raised px-2 py-1.5 font-mono text-xs text-studio-text outline-none focus:border-studio-accent"
                  />
                </label>
              ))}
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selected.visible}
                onChange={(e) => updateLayer(selected.id, { visible: e.target.checked }, true)}
                className="accent-[#ff4d2e]"
              />
              Sichtbar
            </label>

            {selectedDef && selectedDef.fields.length > 0 && (
              <div className="mt-1 border-t border-studio-border pt-3">
                <h3 className="mb-2 text-[10px] uppercase tracking-[0.3em] text-studio-muted">Widget-Einstellungen</h3>
                <div className="flex flex-col gap-2.5">
                  {selectedDef.fields.map((field) => {
                    const value = selected.props?.[field.key] ?? '';
                    const setProp = (v: unknown) =>
                      updateLayer(selected.id, { props: { ...selected.props, [field.key]: v } }, true);

                    // Boolean = Schalter in eigener Zeile
                    if (field.type === 'boolean') {
                      return (
                        <label key={field.key} className="flex cursor-pointer items-start gap-2 text-xs text-studio-text">
                          <input
                            type="checkbox"
                            checked={value !== false}
                            onChange={(e) => setProp(e.target.checked)}
                            className="mt-0.5 accent-[#ff4d2e]"
                          />
                          <span>
                            {field.label}
                            {field.hint && <span className="mt-0.5 block text-[10px] text-studio-muted/80">{field.hint}</span>}
                          </span>
                        </label>
                      );
                    }
                    return (
                      <label key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                        {field.label}
                        {field.type === 'color' ? (
                          <input
                            type="color"
                            value={typeof value === 'string' && value ? value : '#ff4d2e'}
                            onChange={(e) => setProp(e.target.value)}
                            className="mt-1 h-8 w-full cursor-pointer border border-studio-border bg-studio-raised"
                          />
                        ) : field.type === 'select' ? (
                          <select
                            value={String(value)}
                            onChange={(e) => setProp(e.target.value)}
                            className="mt-1 w-full border border-studio-border bg-studio-raised px-2 py-1.5 text-xs text-studio-text outline-none focus:border-studio-accent"
                          >
                            {field.options?.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : field.type === 'seconds' ? (
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={Math.round((Number(value) || 0) / 100) / 10}
                            onChange={(e) => setProp(Math.max(0, Number(e.target.value)) * 1000)}
                            className="mt-1 w-full border border-studio-border bg-studio-raised px-2 py-1.5 font-mono text-xs text-studio-text outline-none focus:border-studio-accent"
                          />
                        ) : (
                          <input
                            type={field.type}
                            value={field.type === 'number' ? Number(value) : String(value)}
                            onChange={(e) => setProp(field.type === 'number' ? Number(e.target.value) : e.target.value)}
                            className="mt-1 w-full border border-studio-border bg-studio-raised px-2 py-1.5 font-mono text-xs text-studio-text outline-none focus:border-studio-accent"
                          />
                        )}
                        {field.hint && <span className="mt-0.5 block text-[9px] normal-case tracking-normal text-studio-muted/70">{field.hint}</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="text-[10px] text-studio-muted">Layer-ID: <code className="font-mono">{selected.id}</code></div>
          </div>
        )}
      </aside>
    </div>
  );
}
