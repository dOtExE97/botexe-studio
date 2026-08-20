// OverlayPage — den EINEN Overlay-Screen zusammenbauen.
// Canvas = Hochformat (TikTok-Default) oder Querformat, skaliert; Layer direkt
// am Objekt draggen/resizen, Eigenschaften rechts im Panel. TikTok-SafeZones
// werden als Guides eingeblendet (wo Chat/Buttons der TikTok-UI liegen).
// Speichern validiert (ajv) und pusht live.
import { passt, bewerte } from '../../shared/suche';
import EbenenListe from '../components/EbenenListe';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Clapperboard,
  Smartphone,
  Monitor,
  Link,
  Check,
  Copy,
  Star,
  Trash2,
  Plus,
  Play,
  AlertTriangle,
  LayoutPanelTop,
  Zap,
  Gamepad2,
  Gift,
  MessageSquare,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import {
  CANVAS_PRESETS,
  getSafeZoneProfile,
  type CanvasPreset,
  type OverlayLayout,
  type OverlayLayer,
} from '@botexe/overlay-engine';
import ConfirmButton from '../components/ConfirmButton';
import GiftListEditor from '../components/GiftListEditor';
import GiftCommandListEditor from '../components/GiftCommandListEditor';
import StringListEditor from '../components/StringListEditor';
import GiftPicker from '../components/GiftPicker';
import WidgetPreview from '../components/WidgetPreview';
import { toast, toastAction } from '../components/ToastHost';
import { markTtlsLinkUsed } from '../components/OverlayHealthBanner';
// Widget-Katalog (Typ, Standardgröße, Standard-Props, Panel-Felder) — eigenes
// Modul, damit auch der Überlauf-Prüfer im CI dieselben Definitionen liest.
import {
  WIDGET_TYPES,
  FRAME_FIELD,
  NO_FRAME_TOGGLE,
  POLISH_FIELD,
  NO_POLISH,
  SIZE_ONLY_STYLE,
  NO_TEXTCOLOR,
  NO_STYLE_FIELDS,
  UNIVERSAL_STYLE_FIELDS,
  type PropField,
} from './widget-types';

// Palette-Kategorien — Tab-Chips oben, es ist immer NUR eine Kategorie sichtbar
// (Feedback: „riesen unübersichtliche Liste"). „Beliebt" ist ein kuratierter
// Quer-Tab mit den wichtigsten Widgets. Mapping per Typ, Einträge oben unberührt.
/** Wie viel von einem Widget mindestens auf der Fläche bleiben muss, wenn man
 *  es über den Rand hinauszieht. Ohne diesen Rest wäre es im Editor nicht mehr
 *  anfassbar — man müsste es über die Ebenenliste zurückholen. */
const SICHTBAR_MIN = 24;

const PALETTE_CATEGORIES: { id: string; label: string; icon: typeof Star }[] = [
  { id: 'beliebt', label: 'Beliebt', icon: Star },
  { id: 'alerts', label: 'Alerts', icon: Zap },
  { id: 'spiele', label: 'Spiele', icon: Gamepad2 },
  { id: 'gifts', label: 'Gifts & Ziele', icon: Gift },
  { id: 'listen', label: 'Listen & Chat', icon: MessageSquare },
  { id: 'stats', label: 'Stats & Zähler', icon: BarChart3 },
  { id: 'deko', label: 'Ambient & Deko', icon: Sparkles },
  { id: 'media', label: 'Media', icon: Clapperboard },
];
// „Beliebt": die typischen Einsteiger-/Stream-Basics, in sinnvoller Reihenfolge.
// (heart-rain statt stream-boss: null Konfiguration, sofort sichtbarer Effekt.)
const POPULAR_WIDGETS = [
  'gift-alert', 'follow-alert', 'stat-chips', 'goal-bar', 'leaderboard',
  'chat-box', 'gift-feed', 'gift-menu', 'top-gift', 'heart-rain', 'wheel',
];
// JEDES Widget MUSS hier stehen — fehlende fallen auf 'deko' zurück und sind
// dann im falschen Tab unauffindbar (genau so verschwand mal die halbe
// Spiele-Sammlung in „Ambient & Deko").
const CATEGORY_OF: Record<string, string> = {
  'gift-alert': 'alerts', 'follow-alert': 'alerts', 'gift-fireworks': 'alerts', 'gift-cannon': 'alerts', 'action-screen': 'alerts',
  bingo: 'spiele', 'guess-number': 'spiele', wheel: 'spiele', giveaway: 'spiele', 'gift-battle': 'spiele', 'live-poll': 'spiele',
  'quiz-game': 'spiele', 'hangman-game': 'spiele', 'tic-tac-toe-game': 'spiele', 'connect-four-game': 'spiele', 'stream-boss': 'spiele',
  'gift-menu': 'gifts', 'gift-jar': 'gifts', 'gift-counter': 'gifts', 'goal-bar': 'gifts', 'top-gift': 'gifts', 'top-streak': 'gifts', countdown: 'gifts', 'hype-train': 'gifts', subathon: 'gifts', 'milestone-confetti': 'gifts', 'goal-countdown': 'gifts',
  'gift-feed': 'listen', 'chat-box': 'listen', 'activity-feed': 'listen', leaderboard: 'listen', 'points-board': 'listen', 'top-rotator': 'listen', 'sport-ticker': 'listen',
  'stat-chips': 'stats', counter: 'stats',
  // Das Befehl-Karussell zeigt Geschenke — es gehört zu „Gifts & Ziele", nicht
  // zur Deko, und liegt dort als Variante unter dem Geschenk-Menü.
  'command-carousel': 'gifts',
  'heart-rain': 'deko', 'text-ticker': 'deko', 'social-rotator': 'deko', emojify: 'deko', 'text-label': 'deko',
  media: 'media', 'spotify-now-playing': 'media',
};

// Verwandten-Gruppen — ein Audit über alle 44 Widgets fand mehrere Gruppen, die
// sich für den Nutzer kaum unterscheiden (drei Bestenlisten, zwei Laufbänder,
// drei Ziel-Anzeigen …). Sie ERSATZLOS zusammenzulegen würde bestehende
// Overlays zerreißen, deshalb bleiben alle Typen erhalten: in der Palette zeigen
// wir nur den Anführer, die Varianten liegen einen Klick darunter. Effekt ist
// derselbe (kürzere Liste), Risiko null.
// Schlüssel = Anführer, Werte = Varianten (die dann NICHT einzeln gelistet werden).
const RELATED_OF: Record<string, string[]> = {
  leaderboard: ['top-rotator', 'points-board'],
  'gift-feed': ['activity-feed'],
  'goal-bar': ['goal-countdown', 'gift-counter'],
  countdown: ['subathon'],
  'top-gift': ['top-streak'],
  'quiz-game': ['live-poll', 'guess-number'],
  'tic-tac-toe-game': ['connect-four-game'],
  // Das Geschenk-Menü kann alles, was das Befehl-Karussell kann, und mehr
  // (Rotations-Modus, Coin-Preis, Einträge automatisch aus den Triggern) —
  // deshalb führt es, das Karussell liegt als Variante darunter.
  'gift-menu': ['command-carousel'],
  'gift-fireworks': ['gift-cannon'],
  'heart-rain': ['emojify'],
};
// Alle Typen, die als Variante hinter einem Anführer liegen. Bei aktiver SUCHE
// werden sie trotzdem gefunden — sonst wäre ein Widget unauffindbar, dessen
// Namen der Nutzer kennt.
const RELATED_MEMBERS = new Set(Object.values(RELATED_OF).flat());
// Spezialfälle, die kaum jemand braucht (Sport-Ticker: externer Anbieter, 13
// technische Optionen, thematisch neben der Spur). Nicht gelöscht — wer sie
// schon nutzt, behält sie —, aber am Ende der Kategorie eingeklappt.
const RARELY_USED = new Set(['sport-ticker']);

// widgetType → Label, einmalig aufgebaut. Spart das lineare WIDGET_TYPES.find()
// pro Layer pro Render in der Ebenen-Liste.
// ACHTUNG: Zwei Palette-Einträge teilen sich einen widgetType ('leaderboard' —
// „Top Gifter" und „Like-Liste" sind dasselbe Widget mit anderer Voreinstellung).
// Bei Object.fromEntries gewinnt der LETZTE, weshalb eine Top-Gifter-Ebene in der
// Liste als „Like-Liste" auftauchte. Deshalb: erster Eintrag gewinnt, und wo die
// Palette mehrere Namen für denselben Typ führt, entscheidet die Ebene selbst
// über ihren Namen (siehe ebenenName unten).
const WIDGET_LABELS: Record<string, string> = WIDGET_TYPES.reduce<Record<string, string>>((acc, w) => {
  if (!(w.type in acc)) acc[w.type] = w.label;
  return acc;
}, {});

/** Anzeigename einer Ebene in der Ebenen-Liste. Bei „leaderboard" hängt er an
 *  der Quelle, sonst wäre der Name für die Hälfte der Ebenen schlicht falsch. */
function ebenenName(widgetType: string, props?: Record<string, unknown>): string {
  if (widgetType === 'leaderboard') {
    return props?.source === 'likes' ? 'Like-Liste' : 'Top Gifter';
  }
  return WIDGET_LABELS[widgetType] ?? widgetType;
}

interface ZoneStyle {
  /** Akzentfarbe (rgb-Tripel) — Tönung & Rand werden daraus abgeleitet. */
  rgb: string;
  /** Diagonale Schraffur als „bitte meiden"-Hinweis (nur Sperrzonen). */
  hatch?: boolean;
}
const ZONE_FALLBACK: ZoneStyle = { rgb: '255,210,62' };
const ZONE_STYLE: Record<string, ZoneStyle> = {
  blocked: { rgb: '255,77,46', hatch: true },
  risky: ZONE_FALLBACK,
  focus: { rgb: '33,230,193' },
};

interface MediaItem { id: string; filename: string; kind: 'image' | 'video'; url: string }

function newLayerId(): string {
  return `layer-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}

function freshLayout(name: string, preset: CanvasPreset): OverlayLayout {
  // NUR width/height/background ins Canvas — CANVAS_PRESETS enthält auch `label`,
  // das Canvas-Schema ist aber strikt (additionalProperties:false).
  const { width, height } = CANVAS_PRESETS[preset];
  return {
    schemaVersion: 1,
    id: `layout-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    name,
    canvas: { width, height, background: 'transparent' },
    layers: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Feld-Beschriftung mit dezentem „?"-Knopf: die Erklärung erscheint erst auf
 *  Klick, statt dauerhaft unter jedem Regler zu stehen und das Panel zu bläht.
 *  Bewusst ein Button mit stopPropagation, damit der Klick nicht das
 *  umschließende <label> auslöst (Fokus/Toggle des Reglers). */
function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  const [open, setOpen] = useState(false);
  if (!hint) return <>{label}</>;
  return (
    <>
      <span className="inline-flex items-center gap-1.5 align-middle">
        <span>{label}</span>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
          aria-label="Erklärung anzeigen"
          className={`grid h-4 w-4 flex-none place-items-center rounded-full border text-[9px] font-bold leading-none ${
            open ? 'border-transparent bg-studio-accent/20 text-studio-accent' : 'border-studio-border text-studio-muted hover:border-studio-muted hover:text-studio-text'
          }`}
        >?</button>
      </span>
      {open && (
        <span className="mt-1 block rounded-md border border-studio-border bg-studio-raised p-2 text-[10px] font-normal normal-case leading-snug tracking-normal text-studio-muted">
          {hint}
        </span>
      )}
    </>
  );
}

/** Aufklappbarer Block im Optionen-Panel. Gruppiert die vielen Regler in
 *  „Position & Größe", „Inhalt & Verhalten" und „Aussehen" — statt einer
 *  langen Scroll-Wand. Native <details> = zugänglich, kein extra Zustand. */
function PanelSection({ title, dot, defaultOpen = true, action, children }: {
  title: string; dot: string; defaultOpen?: boolean; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group border-t border-studio-border first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2.5 text-[10px] font-bold uppercase tracking-[0.2em] text-studio-gold [&::-webkit-details-marker]:hidden">
        <span className="h-2 w-2 flex-none rounded-[3px]" style={{ background: dot, boxShadow: `0 0 8px ${dot}` }} />
        {title}
        <span className="ml-auto flex items-center gap-2">
          {action}
          <ChevronRight size={14} className="text-studio-muted transition-transform group-open:rotate-90 group-open:text-studio-teal" />
        </span>
      </summary>
      <div className="flex flex-col gap-2.5 pb-3">{children}</div>
    </details>
  );
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
  const [showPreview, setShowPreview] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [soundList, setSoundList] = useState<{ id: string; filename: string }[]>([]);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [activeCat, setActiveCat] = useState('beliebt'); // aktiver Kategorie-Tab
  const [openGroup, setOpenGroup] = useState<string | null>(null); // aufgeklappte Varianten
  const [showRare, setShowRare] = useState(false); // Spezialfälle am Listenende
  // ✨ KI-Assistent: Wunsch-Text, Busy-Zustand + Layout-Sicherung für Rückgängig.
  const [aiWish, setAiWish] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPrev, setAiPrev] = useState<OverlayLayout | null>(null);
  // 🎨 Design-Galerie: Grundformen des ausgewählten Widgets als Live-Vorschau.
  const [galleryOpen, setGalleryOpen] = useState(false);
  // Bereit = Ollama gewählt ODER Gemini-Key gesetzt — sonst Einrichtungs-Hinweis statt Feld.
  const [aiReady, setAiReady] = useState(true);
  useEffect(() => {
    void window.studio.getSettings().then((s: { ai?: { provider?: string }; aiKeySet?: boolean }) => {
      setAiReady(s.ai?.provider === 'ollama' || !!s.aiKeySet);
    });
  }, []);
  // Schaufenster: Overlay-Basis-URL (für die Live-Vorschau-Iframes der Palette)
  // + An/Aus-Schalter (auf schwachen PCs abschaltbar).
  const [overlayBase, setOverlayBase] = useState<string | null>(null);
  const [livePalette, setLivePalette] = useState(() => localStorage.getItem('bx-palette-live') !== '0');
  // Vorschau-Sounds: standardmäßig AUS (sonst Demo-Sound-Spam), per Schalter an.
  const [previewSound, setPreviewSound] = useState(() => localStorage.getItem('bx-preview-sound') === '1');
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: OverlayLayer } | null>(null);
  // Gebündeltes Speichern von Prop-Edits (gegen Reload-Spam beim Tippen).
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef<OverlayLayout | null>(null);
  // rAF-gedrosselter Drag (max. 1 State-Update pro Frame statt pro pointermove).
  const dragRaf = useRef<number | null>(null);
  const dragLatest = useRef<Partial<OverlayLayer> | null>(null);

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

  const refreshMedia = useCallback(async () => {
    setMediaList((await window.studio.listMedia()) as MediaItem[]);
  }, []);
  useEffect(() => { void refreshMedia(); }, [refreshMedia]);
  useEffect(() => {
    void window.studio.listSounds().then((s: { id: string; filename: string }[]) => setSoundList(s));
  }, []);

  // Overlay-Basis-URL (inkl. Token) für die Palette-Schaufenster-Iframes holen.
  useEffect(() => {
    void window.studio.getOverlayInfo().then((info: { url: string }) => setOverlayBase(info.url));
  }, []);

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
      meldeGroessenwechsel();
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
    meldeGroessenwechsel();
  };

  /** Der Kopfzeile Bescheid sagen: Die empfohlene Browserquellen-Größe hängt am
   *  Standard-Profil. Wechselt es (oder ändert sich sein Format), zeigt die
   *  Pille dort sonst eine veraltete Zahl — ausgerechnet auf DIESER Seite, wo
   *  man den Wechsel gerade vorgenommen hat. */
  const meldeGroessenwechsel = () => window.dispatchEvent(new CustomEvent('bx-overlay-groesse'));

  /** Empfohlene Browserquellen-Größe eines Profils, z.B. „1080×1920". */
  const dimsFor = (id: string) => {
    const p = profiles.find((l) => l.id === id);
    return p ? `${p.canvas.width}×${p.canvas.height}` : '1080×1920';
  };

  const copyProfileLink = async (id: string) => {
    const link = (await window.studio.getProfileLink(id)) as string;
    await window.studio.copyText(link);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
    toast('success', `Link kopiert — Browserquelle auf ${dimsFor(id)} stellen (benutzerdefinierte Auflösung).`);
  };

  // TikTok-Live-Studio-Link: Domain-Form (TTLS lehnt IP-Links ab). Wenn die
  // Domain lokal noch nicht auflöst (Router-DNS-Schutz), auf das einmalige
  // Setup in den Einstellungen hinweisen.
  const copyTtlsLink = async (id: string) => {
    const info = (await window.studio.getTtlsLink(id)) as { url: string; ready: boolean };
    await window.studio.copyText(info.url);
    markTtlsLinkUsed();
    if (info.ready) {
      toast('success', `Link kopiert! In TTLS: Quelle hinzufügen → Link einfügen → Größe auf ${dimsFor(id)} (benutzerdefinierte Auflösung) → fertig.`);
    } else {
      toast('warn', 'Link kopiert — aber einmalige Einrichtung nötig: Einstellungen → TikTok Live Studio.');
    }
  };

  // Live-Vorschau-Link für das aktive Profil (echtes Overlay als iframe, mit
  // Demo-Daten via &preview=1). Neu laden nur bei Profilwechsel — Layout-Edits
  // landen über den WS-Broadcast im iframe.
  useEffect(() => {
    if (!layout) { setPreviewUrl(null); return; }
    void window.studio.getProfileLink(layout.id).then((link: string) => {
      setPreviewUrl(link ? `${link}&preview=1` : null);
    });
  }, [layout?.id]);

  // Vorschau-Sound-Schalter live an die große Vorschau-Iframe melden.
  useEffect(() => {
    previewFrameRef.current?.contentWindow?.postMessage({ type: 'bx-preview-sound-toggle', enabled: previewSound }, '*');
  }, [previewSound]);

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
    // Beim Profilwechsel (Canvas remountet) + bei Größenänderung neu anhängen.
  }, [layout?.id, canvasW, canvasH]);

  // Eigentlicher Save (IPC → broadcast → Overlay-Rebuild). Bewusst getrennt vom
  // State-Update, damit er gebündelt werden kann.
  const doSave = useCallback(async (next: OverlayLayout) => {
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

  // Sofort speichern — für strukturelle Änderungen (Layer hinzufügen/löschen,
  // Profil umbenennen, Canvas-Preset).
  const persist = useCallback(async (next: OverlayLayout) => {
    setLayout(next);
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    pendingSave.current = null;
    await doSave(next);
  }, [doSave]);

  // ✨ KI-Wunsch umsetzen: kompakten Widget-Katalog + aktuelles Layout an den
  // Main-Prozess, KI liefert neue layers; gespeichert wird über den normalen
  // Save-Pfad (ajv-Validierung inklusive). Vorher-Stand für „Rückgängig" sichern.
  const runAiWish = useCallback(async () => {
    if (!layout || aiBusy) return;
    setAiBusy(true);
    try {
      const seen = new Set<string>();
      const catalog = WIDGET_TYPES.filter((w) => (seen.has(w.type) ? false : (seen.add(w.type), true)))
        .map((w) => ({ type: w.type, label: w.label, desc: w.desc, w: w.w, h: w.h, props: w.props }));
      const result = await window.studio.aiWish({
        wish: aiWish.trim(),
        layout: { canvas: layout.canvas, layers: layout.layers },
        catalog,
      });
      if (!result.ok || !Array.isArray(result.layers)) {
        toast('error', result.error ?? 'KI-Wunsch fehlgeschlagen.');
        return;
      }
      const before = layout;
      const next = { ...layout, layers: result.layers as OverlayLayout['layers'] };
      await persist(next);
      setAiPrev(before);
      setAiWish('');
      toast('success', `✨ Umgesetzt — ${result.layers.length} Widgets. Nicht gut? „Rückgängig" ist daneben.`);
    } finally {
      setAiBusy(false);
    }
  }, [layout, aiBusy, aiWish, persist]);


  // Gebündeltes Speichern (~300ms) — für Prop-Edits beim Tippen. Ohne das löst
  // JEDER Tastendruck ein saveLayout + komplettes Overlay-Rebuild aus (Flackern,
  // CPU-Spike). UI aktualisiert sofort, nur der Save/Broadcast wartet.
  const persistDebounced = useCallback((next: OverlayLayout) => {
    setLayout(next);
    pendingSave.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const pending = pendingSave.current;
      pendingSave.current = null;
      if (pending) void doSave(pending);
    }, 300);
  }, [doSave]);

  // Beim Verlassen einen noch ausstehenden Save sofort rausschreiben (kein
  // verlorener letzter Tastendruck).
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (pendingSave.current) void doSave(pendingSave.current);
  }, [doSave]);

  const updateLayer = (id: string, patch: Partial<OverlayLayer>, save = false) => {
    if (!layout) return;
    const next = {
      ...layout,
      layers: layout.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    };
    if (save) persistDebounced(next);
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
    meldeGroessenwechsel();
  };

  /** Fertiges Beispiel-Overlay: die sechs Widgets, die fast jeder Stream braucht,
   *  sinnvoll platziert (in Hochformat unter dem TikTok-Kopfbereich und über der
   *  Chat-Leiste, damit nichts verdeckt wird). Prozentual gerechnet, passt daher
   *  auf Hoch- UND Querformat. */
  const insertStarterOverlay = () => {
    if (!layout) return;
    const W = canvasW, H = canvasH;
    const portrait = H >= W;
    // Anteilige Platzierung: oben Zahlen/Ziel, Mitte Alert, unten Chat/Feed.
    const plan: { type: string; x: number; y: number; w: number; h: number; props?: Record<string, unknown> }[] = portrait
      ? [
        { type: 'stat-chips', x: .06, y: .115, w: .56, h: .032, props: { metrics: 'viewers,likes,follows' } },
        { type: 'goal-bar', x: .06, y: .158, w: .62, h: .042, props: { metric: 'coins', target: 5000 } },
        { type: 'leaderboard', x: .06, y: .215, w: .62, h: .105, props: { source: 'gifts', style: 'treppe', limit: 3, title: 'Top Gifter' } },
        { type: 'follow-alert', x: .06, y: .335, w: .48, h: .05 },
        { type: 'gift-alert', x: .14, y: .40, w: .72, h: .20 },
        { type: 'chat-box', x: .06, y: .63, w: .52, h: .18 },
      ]
      : [
        { type: 'stat-chips', x: .04, y: .05, w: .34, h: .055, props: { metrics: 'viewers,likes,follows' } },
        { type: 'goal-bar', x: .04, y: .12, w: .40, h: .07 },
        { type: 'leaderboard', x: .66, y: .05, w: .30, h: .22, props: { source: 'gifts', style: 'treppe', limit: 3, title: 'Top Gifter' } },
        { type: 'follow-alert', x: .04, y: .22, w: .30, h: .08 },
        { type: 'gift-alert', x: .30, y: .34, w: .40, h: .30 },
        { type: 'chat-box', x: .04, y: .56, w: .26, h: .38 },
      ];
    const layers: OverlayLayer[] = [];
    plan.forEach((p, i) => {
      const def = WIDGET_TYPES.find((wt) => wt.type === p.type);
      if (!def) return;
      layers.push({
        id: newLayerId(), widgetType: def.type, name: def.label,
        x: Math.round(p.x * W), y: Math.round(p.y * H),
        w: Math.round(p.w * W), h: Math.round(p.h * H),
        z: i + 1, visible: true,
        props: { ...def.props, ...(p.props ?? {}) },
      });
    });
    void persist({ ...layout, layers: [...layout.layers, ...layers] });
    toast('success', `Starter-Overlay eingefügt — ${layers.length} Widgets. Alles frei verschiebbar.`);
  };

  const addWidget = (typeDef: (typeof WIDGET_TYPES)[number]) => {
    if (!layout) return;
    const w = Math.min(typeDef.w, canvasW - 40);
    const h = Math.min(typeDef.h, canvasH - 40);
    // Treppen-Versatz um die Mitte, damit mehrere neue Widgets NICHT deckungs-
    // gleich übereinander landen (sonst sieht man nur eins, Klick wirkt „ins Leere").
    const casc = (layout.layers.length % 6) * 40;
    const layer: OverlayLayer = {
      id: newLayerId(),
      widgetType: typeDef.type,
      name: typeDef.label,
      x: Math.max(10, Math.min(canvasW - w - 10, Math.round((canvasW - w) / 2) - 100 + casc)),
      y: Math.max(10, Math.min(canvasH - h - 10, Math.round((canvasH - h) / 2) - 100 + casc)),
      w,
      h,
      z: layout.layers.length + 1,
      visible: true,
      props: { ...typeDef.props },
    };
    setSelectedId(layer.id);
    void persist({ ...layout, layers: [...layout.layers, layer] });
    toast('success', `„${typeDef.label}" hinzugefügt`);
  };

  // Einbau-Auftrag von anderen Seiten (z.B. Spiel-Wächter „Jetzt einbauen"):
  // sessionStorage nennt den Widget-Typ, wir legen ihn beim Öffnen direkt ein.
  // MUSS nach addWidget/persist stehen (TDZ). Läuft erst, wenn das Layout da ist.
  const pendingAddDone = useRef(false);
  useEffect(() => {
    if (!layout || pendingAddDone.current) return;
    const wanted = sessionStorage.getItem('bx-add-widget');
    if (!wanted) return;
    pendingAddDone.current = true;
    sessionStorage.removeItem('bx-add-widget');
    const def = WIDGET_TYPES.find((wt) => wt.type === wanted);
    if (!def) return;
    // Doppelt einbauen vermeiden, falls das Widget inzwischen doch schon da ist.
    const existing = layout.layers.find((l) => l.widgetType === wanted);
    if (existing) { setSelectedId(existing.id); return; }
    addWidget(def);
  }, [layout]);

  const removeLayer = (id: string) => {
    if (!layout) return;
    const removed = layout.layers.find((l) => l.id === id);
    const afterRemove = { ...layout, layers: layout.layers.filter((l) => l.id !== id) };
    setSelectedId(null);
    void persist(afterRemove);
    // Kein stiller Datenverlust bei Fehlklick: Undo anbieten (wie in TriggersPage).
    if (removed) {
      toastAction('info', `„${removed.name}" entfernt.`, {
        label: 'Rückgängig',
        onClick: () => void persist({ ...afterRemove, layers: [...afterRemove.layers, removed] }),
      });
    }
  };

  // Drag & Resize direkt am Canvas
  const onPointerDown = (e: React.PointerEvent, layer: OverlayLayer, mode: 'move' | 'resize') => {
    // Gesperrt: gar nicht erst reagieren. Der Klick geht dann an das Widget
    // DARUNTER — genau dafür ist die Sperre da (ein bildschirmfüllendes
    // Feuerwerk soll den Rest nicht unerreichbar machen).
    if (layer.locked) return;
    e.stopPropagation();
    setSelectedId(layer.id);
    dragRef.current = { id: layer.id, mode, startX: e.clientX, startY: e.clientY, orig: { ...layer } };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  /** Ein Widget im Stapel verschieben: mit dem Nachbarn die Position tauschen.
   *  Tauschen statt „z+1" — sonst landen zwei Widgets auf demselben Wert und
   *  die Reihenfolge wird zufällig. */
  const moveLayer = (id: string, richtung: 1 | -1) => {
    if (!layout) return;
    const sortiert = [...layout.layers].sort((a, b) => a.z - b.z);
    const i = sortiert.findIndex((l) => l.id === id);
    const j = i + richtung;
    if (i < 0 || j < 0 || j >= sortiert.length) return;
    const a = sortiert[i];
    const b = sortiert[j];
    if (!a || !b) return;
    const zA = a.z;
    void persist({
      ...layout,
      layers: layout.layers.map((l) =>
        l.id === a.id ? { ...l, z: b.z } : l.id === b.id ? { ...l, z: zA } : l),
    });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const patch: Partial<OverlayLayer> = drag.mode === 'move'
      ? {
          // Über den Rand hinaus erlaubt: Ein Widget soll auch halb aus dem Bild
          // ragen dürfen (Laufband, das seitlich reinschiebt; Alert, der oben
          // angeschnitten sitzt). Vorher klebte alles hart an der Kante.
          // Begrenzt bleibt es trotzdem — ein Rest muss sichtbar bleiben, sonst
          // verschwindet das Widget und ist im Editor nicht mehr greifbar.
          x: Math.round(Math.max(SICHTBAR_MIN - drag.orig.w, Math.min(canvasW - SICHTBAR_MIN, drag.orig.x + dx))),
          y: Math.round(Math.max(SICHTBAR_MIN - drag.orig.h, Math.min(canvasH - SICHTBAR_MIN, drag.orig.y + dy))),
        }
      : {
          w: Math.round(Math.max(60, drag.orig.w + dx)),
          h: Math.round(Math.max(40, drag.orig.h + dy)),
        };
    // Auf 1 State-Update pro Frame drosseln — pointermove feuert oft 120+/s und
    // re-rendert sonst jedes Mal die ganze (große) Editor-Komponente.
    dragLatest.current = patch;
    if (dragRaf.current != null) return;
    dragRaf.current = requestAnimationFrame(() => {
      dragRaf.current = null;
      if (dragRef.current && dragLatest.current) updateLayer(dragRef.current.id, dragLatest.current);
    });
  };
  const onPointerUp = () => {
    if (dragRaf.current != null) { cancelAnimationFrame(dragRaf.current); dragRaf.current = null; }
    const drag = dragRef.current;
    dragRef.current = null;
    // Finale Position atomar anwenden UND speichern (nur der gedragte Layer
    // ändert sich; die übrigen Layer bleiben wie im aktuellen Layout).
    if (drag && dragLatest.current && layout) {
      const patch = dragLatest.current;
      dragLatest.current = null;
      void persist({ ...layout, layers: layout.layers.map((l) => (l.id === drag.id ? { ...l, ...patch } : l)) });
    }
  };

  // Palette-Gruppierung nur neu berechnen, wenn sich die Suche ändert — nicht
  // bei jedem Re-Render (z.B. während eines Drags).
  // Sichtbare Widgets: bei Suche quer über ALLE Kategorien, sonst nur der aktive
  // Tab. „Beliebt" ist die kuratierte POPULAR_WIDGETS-Reihenfolge.
  // Bei aktiver Suche wird ALLES durchsucht (auch eingeklappte Varianten und
  // Spezialfälle) — wer einen Namen kennt, muss ihn finden.
  const visibleItems = useMemo(() => {
    const q = paletteQuery.trim();
    if (q) {
      // Tolerante Suche (shared/suche.ts): Umlaute in beiden Schreibweisen,
      // Bindestriche/Leerzeichen egal, Tippfehler verziehen. Vorher stumpfes
      // `includes` — „Glucksrad" fand nichts, „gift jar" auch nicht.
      // Der interne Typ zählt mit: wer „gift-jar" aus einer Anleitung kennt,
      // findet damit das Coin-Glas.
      // Nach Relevanz sortiert: Ein Treffer im NAMEN schlaegt einen in der
      // Beschreibung. Vorher listete „geschenk" den Hype-Train vor dem
      // Geschenk-Menue, weil das Wort in dessen Beschreibung vorkommt — und in
      // der schmalen Spalte sah man die echten Geschenk-Widgets gar nicht.
      return WIDGET_TYPES
        .filter((w) => passt(q, w.label, w.desc, w.type))
        .sort((a, b) => bewerte(q, b.label, b.desc, b.type) - bewerte(q, a.label, a.desc, a.type));
    }
    if (activeCat === 'beliebt') {
      return POPULAR_WIDGETS
        .map((t) => WIDGET_TYPES.find((w) => w.type === t))
        .filter((w): w is (typeof WIDGET_TYPES)[number] => !!w);
    }
    return WIDGET_TYPES.filter(
      (w) =>
        (CATEGORY_OF[w.type] ?? 'deko') === activeCat &&
        !RELATED_MEMBERS.has(w.type) &&
        !RARELY_USED.has(w.type),
    );
  }, [paletteQuery, activeCat]);

  // Die Spezialfälle der aktiven Kategorie, eingeklappt am Listenende.
  const rareItems = useMemo(() => {
    if (paletteQuery.trim() || activeCat === 'beliebt') return [];
    return WIDGET_TYPES.filter(
      (w) => RARELY_USED.has(w.type) && (CATEGORY_OF[w.type] ?? 'deko') === activeCat,
    );
  }, [paletteQuery, activeCat]);

  // Eine Palette-Kachel — je nach Live-Schalter mit echter Vorschau oder als
  // schlanke Text-Kachel. Ausgelagert, weil Anführer, Varianten und
  // Spezialfälle dieselbe Darstellung brauchen.
  const renderPaletteCard = (w: (typeof WIDGET_TYPES)[number]) =>
    livePalette ? (
      <WidgetPreview
        key={w.type}
        type={w.type}
        props={w.props}
        w={w.w}
        h={w.h}
        label={w.label}
        desc={w.desc}
        overlayBase={overlayBase}
        soundOn={previewSound}
        onAdd={() => addWidget(w)}
      />
    ) : (
      <button
        key={w.type}
        onClick={() => addWidget(w)}
        className="clip-slant group rounded-lg border border-studio-border bg-studio-raised p-2.5 text-left transition-colors hover:border-studio-accent/60"
      >
        <div className="text-xs font-bold group-hover:text-studio-accent">{w.label}</div>
        <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-studio-muted">{w.desc}</div>
      </button>
    );

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
    <div className="grid h-full grid-cols-[220px_1fr_260px] gap-0">
      {/* Widget-Palette — Kategorie-Tabs + Suche (nur eine Kategorie sichtbar) */}
      <aside data-palette-scroll className="overflow-y-auto border-r border-studio-border bg-studio-panel p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-studio-gold">Widgets</h2>
          <button
            onClick={() => setLivePalette((on) => { const next = !on; localStorage.setItem('bx-palette-live', next ? '1' : '0'); return next; })}
            className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${livePalette ? 'text-studio-teal' : 'text-studio-muted'} hover:text-studio-teal`}
            title="Live-Vorschau der Widgets in der Liste an/aus (auf schwachen PCs ggf. aus)"
          >
            <Play size={11} /> {livePalette ? 'Live an' : 'Live aus'}
          </button>
        </div>
        <input
          value={paletteQuery}
          onChange={(e) => setPaletteQuery(e.target.value)}
          placeholder="Widget suchen…"
          className="bx-input mb-3 w-full text-xs"
        />
        {/* Kategorie-Tabs (nur eine Kategorie sichtbar). Bei aktiver Suche
            werden stattdessen Treffer quer über alle Kategorien gezeigt. */}
        {!paletteQuery.trim() ? (
          <div className="mb-3 flex flex-wrap gap-1">
            {PALETTE_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              const on = cat.id === activeCat;
              return (
                <button
                  key={cat.id}
                  onClick={() => setActiveCat(cat.id)}
                  className={`flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold transition-colors ${
                    on
                      ? 'border-studio-accent bg-studio-accent/15 text-studio-accent'
                      : 'border-studio-border bg-studio-raised text-studio-muted hover:border-studio-accent/40 hover:text-studio-text'
                  }`}
                >
                  <Icon size={11} /> {cat.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="mb-2 px-1 text-[10px] text-studio-muted">
            {visibleItems.length} Treffer für „{paletteQuery.trim()}“
          </div>
        )}
        {visibleItems.length === 0 ? (
          <div className="px-1 py-6 text-center text-[11px] text-studio-muted">Nichts gefunden.</div>
        ) : (
          <div className={livePalette ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}>
            {visibleItems.map((w) => {
              // Varianten nur außerhalb der Suche anbieten — bei einer Suche ist
              // ohnehin schon jedes Widget einzeln in der Trefferliste.
              const variants = paletteQuery.trim()
                ? []
                : (RELATED_OF[w.type] ?? [])
                    .map((t) => WIDGET_TYPES.find((x) => x.type === t))
                    .filter((x): x is (typeof WIDGET_TYPES)[number] => !!x);
              const open = openGroup === w.type;
              return (
                <Fragment key={w.type}>
                  {renderPaletteCard(w)}
                  {variants.length > 0 && (
                    <button
                      onClick={() => setOpenGroup(open ? null : w.type)}
                      className={`flex items-center justify-center gap-1 rounded-md border border-dashed px-2 py-1 text-[10px] font-bold transition-colors ${
                        livePalette ? '' : 'col-span-2'
                      } ${
                        open
                          ? 'border-studio-accent/60 text-studio-accent'
                          : 'border-studio-border text-studio-muted hover:border-studio-accent/40 hover:text-studio-text'
                      }`}
                      title="Ähnliche Widgets, die dasselbe anders darstellen"
                    >
                      {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      {open ? 'Varianten zu' : `${variants.length} Variante${variants.length > 1 ? 'n' : ''} zu`} „{w.label}“
                    </button>
                  )}
                  {open && variants.map((v) => renderPaletteCard(v))}
                </Fragment>
              );
            })}
          </div>
        )}
        {/* Spezialfälle — vorhanden, aber bewusst aus der Hauptliste heraus. */}
        {rareItems.length > 0 && (
          <>
            <button
              onClick={() => setShowRare((v) => !v)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-studio-border px-2 py-1 text-[10px] font-bold text-studio-muted transition-colors hover:border-studio-accent/40 hover:text-studio-text"
            >
              {showRare ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              {rareItems.length} {rareItems.length === 1 ? 'Spezialfall' : 'Spezialfälle'} für Fortgeschrittene
            </button>
            {showRare && (
              <div className={`mt-2 ${livePalette ? 'flex flex-col gap-2' : 'grid grid-cols-2 gap-2'}`}>
                {rareItems.map((w) => renderPaletteCard(w))}
              </div>
            )}
          </>
        )}
      </aside>

      {/* Canvas */}
      <section className="relative flex flex-col overflow-hidden bg-studio-bg">
        {/* Profil-Leiste — jedes Profil ist ein eigener Overlay-Screen mit eigenem Link */}
        <div className="flex flex-none flex-wrap items-center gap-2 border-b border-studio-border bg-studio-panel px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-studio-gold">Profile</span>
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
                  {isPortraitP ? <Smartphone size={13} /> : <Monitor size={13} />}
                  <span className="font-bold">{p.name}</span>
                  <span className="rounded bg-black/30 px-1 py-0.5 font-mono text-[9px] tabular-nums text-studio-muted" title="Browserquellen-Größe in TTLS/OBS auf diesen Wert stellen">
                    {p.canvas.width}×{p.canvas.height}
                  </span>
                  {p.id === activeId && <Star size={11} className="text-studio-teal" fill="currentColor" aria-label="Standard-Link" />}
                </button>
                <button
                  onClick={() => void copyProfileLink(p.id)}
                  title="Overlay-Link kopieren (OBS / Browser)"
                  className="text-studio-muted hover:text-studio-teal"
                >
                  {copiedId === p.id ? <Check size={13} className="text-studio-teal" /> : <Link size={13} />}
                </button>
                <button
                  onClick={() => void copyTtlsLink(p.id)}
                  title="Link für TikTok Live Studio kopieren (Domain-Form — TTLS akzeptiert keine IP-Links)"
                  className="text-studio-muted hover:text-studio-accent"
                >
                  <Clapperboard size={13} />
                </button>
              </div>
            );
          })}
          <button onClick={() => void createProfile('portrait')} className="clip-slant flex items-center gap-1 border border-studio-border bg-studio-raised px-2.5 py-1.5 text-xs text-studio-muted hover:text-studio-accent" title="Neues Hochformat-Profil">
            <Plus size={12} /> <Smartphone size={13} />
          </button>
          <button onClick={() => void createProfile('landscape')} className="clip-slant flex items-center gap-1 border border-studio-border bg-studio-raised px-2.5 py-1.5 text-xs text-studio-muted hover:text-studio-accent" title="Neues Querformat-Profil">
            <Plus size={12} /> <Monitor size={13} />
          </button>
          <div className="flex-1" />
          {layout && (
            <>
              <input
                value={layout.name}
                onChange={(e) => setLayout({ ...layout, name: e.target.value })}
                onBlur={(e) => void renameProfile(e.target.value)}
                className="bx-input w-40"
                style={{ padding: '6px 10px', fontSize: '12px' }}
                title="Profil umbenennen"
              />
              <button onClick={() => void duplicateProfile()} className="flex items-center gap-1 text-[11px] text-studio-muted hover:text-studio-text" title="Profil duplizieren"><Copy size={12} /> Kopie</button>
              {layout.id !== activeId && (
                <button onClick={() => void makeDefault()} className="flex items-center gap-1 text-[11px] text-studio-teal hover:text-studio-text" title="Als Standard-Link setzen"><Star size={12} /> Standard</button>
              )}
              {profiles.length > 1 && (
                <ConfirmButton onConfirm={() => void deleteProfile(layout.id)} className="flex items-center gap-1 text-[11px] text-studio-muted hover:text-studio-accent"><Trash2 size={12} /> Löschen</ConfirmButton>
              )}
            </>
          )}
        </div>

        {/* ✨ KI-Assistent: Wunsch in natürlicher Sprache → Layout wird umgebaut */}
        <div className="flex flex-none items-center gap-2 border-b border-studio-border bg-studio-panel/80 px-3 py-2">
          <span className="flex-none text-[10px] font-bold uppercase tracking-[0.2em] text-studio-teal" title="Beschreib in normalen Worten, wie dein Overlay aussehen soll — die KI baut es um.">
            ✨ KI-Assistent
          </span>
          {!aiReady ? (
            <>
              <span className="flex-1 text-[11px] text-studio-muted">
                Beschreib dein Overlay einfach in Worten („Goal-Bar oben, Chat in Pink") — einmalig gratis einrichten:
              </span>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('bx-navigate', { detail: 'settings' }))}
                className="bx-btn-accent flex-none px-3 py-1.5 text-[11px]"
              >
                KI einrichten (gratis, 2 Min) →
              </button>
            </>
          ) : (<>
          <input
            value={aiWish}
            onChange={(e) => setAiWish(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !aiBusy && aiWish.trim() && void runAiWish()}
            placeholder='Wünsch dir was… z.B. "Goal-Bar oben, Chat unten links, alles in Pink mit Herz-Glas"'
            disabled={aiBusy}
            className="bx-input flex-1 text-xs disabled:opacity-60"
          />
          <button
            onClick={() => void runAiWish()}
            disabled={aiBusy || !aiWish.trim()}
            className="bx-btn-accent flex-none px-3 py-1.5 text-[11px] disabled:opacity-40"
          >
            {aiBusy ? 'KI baut…' : 'Umsetzen'}
          </button>
          {aiPrev && !aiBusy && (
            <button
              onClick={() => { const prev = aiPrev; setAiPrev(null); void persist(prev); toast('info', 'KI-Änderung rückgängig gemacht.'); }}
              className="bx-pill flex-none text-[11px] hover:text-studio-accent"
              title="Letzte KI-Änderung rückgängig machen"
            >
              ↩ Rückgängig
            </button>
          )}
          </>)}
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
                className={`clip-slant flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold tracking-wider ${
                  active ? 'bg-studio-accent text-black' : 'border border-studio-control-border bg-studio-control text-studio-muted hover:border-studio-control-border-hover hover:text-studio-text'
                }`}
              >
                {preset === 'portrait' ? <Smartphone size={13} /> : <Monitor size={13} />}
                {dims.label} · {dims.width}×{dims.height}
              </button>
            );
          })}
          <div className="flex-1" />
          <label className="flex items-center gap-2 text-[11px] text-studio-muted" title="Zeigt die echten Widgets live mit Demo-Daten. Rahmen erscheinen nur, wenn du ein Widget anfasst.">
            <input type="checkbox" checked={showPreview} onChange={(e) => setShowPreview(e.target.checked)} className="accent-[#21e6c1]" />
            Echte Widgets (Vorschau)
          </label>
          <label className="flex items-center gap-2 text-[11px] text-studio-muted" title="Sounds in der Vorschau hörbar machen. Standard aus, damit z.B. das Feuerwerk nicht dauernd knallt. Im Schaufenster nur kurz beim Klick auf Test.">
            <input
              type="checkbox"
              checked={previewSound}
              onChange={(e) => { setPreviewSound(e.target.checked); localStorage.setItem('bx-preview-sound', e.target.checked ? '1' : '0'); }}
              className="accent-[#ffd23e]"
            />
            Vorschau-Sound
          </label>
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
            {/* Live-Vorschau: das ECHTE Overlay als skaliertes iframe (Demo-Daten).
                pointer-events aus → Klicks/Drags gehen an die Handles darüber. */}
            {showPreview && previewUrl && (
              <iframe
                key={layout.id}
                ref={previewFrameRef}
                src={previewUrl}
                title="Live-Vorschau"
                onLoad={() => previewFrameRef.current?.contentWindow?.postMessage({ type: 'bx-preview-sound-toggle', enabled: previewSound }, '*')}
                className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                style={{ width: canvasW, height: canvasH, transform: `scale(${scale})` }}
              />
            )}

            {/* Leerer Canvas: freundlicher Hinweis statt blankes Bild (Onboarding). */}
            {layout.layers.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
                <LayoutPanelTop size={36} className="text-studio-muted/50" />
                <p className="text-sm font-bold text-studio-text/80">Noch keine Widgets auf diesem Screen</p>
                <p className="max-w-[80%] text-xs text-studio-muted">Wähl links aus der <b>Widget-Palette</b> — du siehst jedes Widget schon live in der Liste. Mit <b>➕ Hinzufügen</b> landet es hier.</p>
                <button
                  onClick={insertStarterOverlay}
                  className="bx-btn-accent pointer-events-auto mt-2 px-5 py-2.5 font-display text-sm tracking-wide"
                >
                  ✨ Starter-Overlay einfügen (6 Widgets, fertig platziert)
                </button>
                <p className="max-w-[80%] text-[10px] text-studio-muted/70">Zahlen, Ziel-Balken, Top-Gifter, Follow- &amp; Gift-Alert und Chat — direkt startklar, alles frei verschiebbar.</p>
              </div>
            )}

            {/* TikTok-UI SafeZones als dezente Guides (weiche Tönung, Pill-Label) */}
            {showZones &&
              safeZones?.zones.map((zone) => {
                const zs = ZONE_STYLE[zone.kind] ?? ZONE_FALLBACK;
                const hatch = zs.hatch
                  ? `, repeating-linear-gradient(45deg, rgba(${zs.rgb},.10) 0 6px, transparent 6px 12px)`
                  : '';
                return (
                  <div
                    key={zone.id}
                    className="pointer-events-none absolute overflow-hidden rounded-[6px]"
                    style={{
                      left: zone.x * scale,
                      top: zone.y * scale,
                      width: zone.w * scale,
                      height: zone.h * scale,
                      background: `linear-gradient(rgba(${zs.rgb},.06), rgba(${zs.rgb},.06))${hatch}`,
                      border: `1px solid rgba(${zs.rgb},.32)`,
                      boxShadow: `inset 0 0 0 1px rgba(${zs.rgb},.06)`,
                    }}
                    title={zone.note}
                  >
                    <span
                      className="absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
                      style={{ background: `rgba(${zs.rgb},.16)`, color: `rgb(${zs.rgb})`, backdropFilter: 'blur(2px)' }}
                    >
                      {zone.label}
                    </span>
                  </div>
                );
              })}

            {layout.layers.map((layer) => {
              const isSel = layer.id === selectedId;
              const isHover = layer.id === hoveredId;
              const label = ebenenName(layer.widgetType, layer.props);
              // Bei aktiver Vorschau ist der echte Widget-Inhalt (iframe) die
              // Hauptsache → Rahmen/Label nur bei Hover oder Auswahl zeigen, sonst
              // unsichtbar (echtes WYSIWYG). Ohne Vorschau: gefülltes Platzhalter-Feld.
              const showFrame = isSel || isHover || !showPreview;
              const showLabel = isSel || isHover || !showPreview;
              return (
                <div
                  key={layer.id}
                  onPointerDown={(e) => onPointerDown(e, layer, 'move')}
                  onPointerEnter={() => setHoveredId(layer.id)}
                  onPointerLeave={() => setHoveredId((h) => (h === layer.id ? null : h))}
                  className={`absolute flex cursor-grab items-center justify-center select-none rounded-[4px] transition-[background,box-shadow] duration-100 active:cursor-grabbing ${
                    isSel ? 'z-50' : ''
                  }`}
                  style={{
                    left: layer.x * scale,
                    top: layer.y * scale,
                    width: layer.w * scale,
                    height: layer.h * scale,
                    background: !showPreview
                      ? isSel ? 'rgba(255,77,46,.14)' : 'rgba(33,230,193,.07)'
                      : isSel ? 'rgba(255,77,46,.06)' : 'transparent',
                    boxShadow: isSel
                      ? '0 0 0 2px #ff4d2e, 0 0 0 5px rgba(255,77,46,.18)'
                      : showFrame
                        ? showPreview
                          ? '0 0 0 1px rgba(255,255,255,.5)'
                          : '0 0 0 1px rgba(33,230,193,.5)'
                        : 'none',
                    opacity: layer.visible ? 1 : 0.35,
                    // Gesperrte Widgets sind für die Maus durchlässig — nur so
                    // erreicht man, was darunter liegt.
                    pointerEvents: layer.locked ? 'none' : undefined,
                  }}
                >
                  {showLabel && showPreview ? (
                    <span
                      className="pointer-events-none absolute -top-[18px] left-0 max-w-full truncate rounded-t-[4px] bg-studio-accent px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider text-white"
                      style={{ background: isSel ? '#ff4d2e' : 'rgba(20,22,30,.9)', opacity: isSel || isHover ? 1 : 0 }}
                    >
                      {label}
                    </span>
                  ) : showLabel ? (
                    <span className="pointer-events-none px-1 text-center font-display text-[11px] uppercase tracking-wider text-white/80" style={{ textShadow: '0 1px 4px #000' }}>
                      {label}
                    </span>
                  ) : null}
                  {isSel && (
                    <div
                      onPointerDown={(e) => onPointerDown(e, layer, 'resize')}
                      className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 cursor-nwse-resize rounded-full border-2 border-white bg-studio-accent shadow"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="absolute bottom-2 left-3 flex items-center gap-1 text-[10px] text-studio-muted">
            <span>{canvasW}×{canvasH} · {isPortrait ? 'Hochformat' : 'Querformat'} · transparent ·</span>
            {saveState === 'saved' ? (
              <span className="flex items-center gap-1 text-studio-teal"><Check size={11} /> gespeichert & live gepusht</span>
            ) : saveState === 'error' ? (
              <span className="flex items-center gap-1 text-studio-accent"><AlertTriangle size={11} /> {saveError}</span>
            ) : (
              <span>Änderungen speichern automatisch</span>
            )}
          </div>
        </div>
      </section>

      {/* Property-Panel */}
      <aside className="overflow-y-auto border-l border-studio-border bg-studio-panel p-4">
        {/* Ebenen-Liste — IMMER sichtbar, auch wenn nichts ausgewählt ist.
            Genau dann braucht man sie: um ein verdecktes Widget zu erreichen
            oder eins auszublenden, das man gar nicht anklicken kann. */}
        <div className="mb-3 flex-none border-b border-studio-border pb-3">
          <EbenenListe
            layers={layout.layers}
            selectedId={selectedId}
            hoveredId={hoveredId}
            labelFor={(l) => ebenenName(l.widgetType, l.props)}
            onSelect={setSelectedId}
            onHover={setHoveredId}
            onPatch={(id, patch) => updateLayer(id, patch, true)}
            onMove={moveLayer}
            onDelete={removeLayer}
          />
        </div>

        {!selected && (
          <div className="mt-2 flex flex-col gap-3 text-xs leading-relaxed text-studio-muted">
            <p>Klick links ein Widget, um es auf den Screen zu legen — oder wähl eins auf dem Canvas aus, um es hier einzustellen.</p>
            <div className="border-t border-studio-border pt-3">
              <p className="mb-2 font-bold uppercase tracking-widest text-[10px]">TikTok-UI-Zonen</p>
              <p><span style={{ color: `rgb(${ZONE_STYLE.blocked?.rgb})` }}>■ Rot</span> — hier liegt Chat/Gift-Leiste, Widgets werden verdeckt.</p>
              <p><span style={{ color: `rgb(${ZONE_STYLE.risky?.rgb})` }}>■ Gelb</span> — riskant, UI-Elemente je nach Gerät.</p>
              <p><span style={{ color: `rgb(${ZONE_STYLE.focus?.rgb})` }}>■ Türkis</span> — bester Bereich für dauerhafte Widgets.</p>
            </div>
          </div>
        )}
        {selected && (
          <div className="flex flex-col">
            <div className="flex items-center justify-between pb-1">
              <h2 className="font-display text-sm uppercase">{selectedDef?.label}</h2>
              <button onClick={() => removeLayer(selected.id)} className="text-[11px] text-studio-muted hover:text-studio-accent">
                Entfernen
              </button>
            </div>

            {(() => {
              // ── Alle Felder zusammenstellen (Logik wie zuvor) ───────────
              // KOPIE, sonst mutiert base.push() die WIDGET_TYPES-Definition.
              const base = [...(selectedDef?.fields ?? [])];
              if (selectedDef && !NO_FRAME_TOGGLE.has(selectedDef.type)) base.push(FRAME_FIELD);
              if (selectedDef && !NO_POLISH.has(selectedDef.type)) base.push(POLISH_FIELD);
              // Schrift/Größe/Farbe universell — aber nur die, die wirklich wirken.
              const style = !selectedDef || NO_STYLE_FIELDS.has(selectedDef.type)
                ? []
                : UNIVERSAL_STYLE_FIELDS
                    .filter((sf) => !base.some((f) => f.key === sf.key))
                    .filter((sf) => {
                      if (SIZE_ONLY_STYLE.has(selectedDef.type)) return sf.key === 'fontScale';
                      if (NO_TEXTCOLOR.has(selectedDef.type)) return sf.key !== 'textColor';
                      return true;
                    });
              // showIf blendet im aktuellen Zustand wirkungslose Felder aus.
              const all = [...base, ...style].filter((f) => !f.showIf || f.showIf(selected.props ?? {}));
              // Drei Blöcke: „Aussehen" bündelt Design/Schrift/Größe/Farbe/Rahmen/
              // Premium, der Rest ist „Inhalt & Verhalten".
              const APP = new Set(['fontFamily', 'fontScale', 'textColor', 'frameless', 'polish', 'style', 'shape', 'theme', 'accent']);
              const content = all.filter((f) => !APP.has(f.key));
              const appearance = all.filter((f) => APP.has(f.key));
              const hasStyle = !!selectedDef?.fields.some((f) => f.key === 'style' || f.key === 'shape');

              // Eine Feld-Zeile rendern (der bisherige Switch, unverändert).
              const renderField = (field: PropField) => {
                    const value = selected.props?.[field.key] ?? '';
                    const setProp = (v: unknown) =>
                      updateLayer(selected.id, { props: { ...selected.props, [field.key]: v } }, true);

                    // Gift-Liste = visuelle Mehrfach-Gift-Auswahl (z.B. Bingo-Felder)
                    if (field.type === 'gift-list') {
                      return (
                        <div key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          <FieldLabel label={field.label} hint={field.hint} />
                          <GiftListEditor value={String(value)} onChange={(v) => setProp(v)} />
                        </div>
                      );
                    }

                    // Geschenk + Text pro Zeile (Befehl-Karussell).
                    if (field.type === 'gift-command-list') {
                      return (
                        <div key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          <FieldLabel label={field.label} hint={field.hint} />
                          <GiftCommandListEditor
                            value={String(value)}
                            onChange={(v) => setProp(v)}
                            textPlaceholder={field.textPlaceholder}
                          />
                        </div>
                      );
                    }

                    // Einfache Liste: eine Zeile pro Eintrag, statt „alles in EINE
                    // Zeile mit | / , getrennt" (Glücksrad-Preise, Laufband-Texte …).
                    if (field.type === 'list') {
                      return (
                        <div key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          <FieldLabel label={field.label} hint={field.hint} />
                          <StringListEditor
                            value={String(value)}
                            onChange={(v) => setProp(v)}
                            separator={field.separator}
                            placeholder={field.textPlaceholder}
                            addLabel={field.addLabel}
                            maxItems={field.maxItems}
                          />
                        </div>
                      );
                    }

                    // Einzel-Gift mit durchsuchbarer Auswahl (Bild + Name, keine Tipparbeit).
                    if (field.type === 'gift') {
                      return (
                        <div key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          <FieldLabel label={field.label} hint={field.hint} />
                          <div className="mt-1.5"><GiftPicker value={String(value)} onChange={(v) => setProp(v)} placeholder="Alle Gifts (leer lassen)…" /></div>
                        </div>
                      );
                    }

                    // Media = visueller Bild/Video-Picker mit Import
                    if (field.type === 'media') {
                      return (
                        <div key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          <FieldLabel label={field.label} hint={field.hint} />
                          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                            {mediaList.map((m) => {
                              const sel = m.id === value;
                              return (
                                <button
                                  key={m.id}
                                  onClick={() => setProp(m.id)}
                                  title={m.filename}
                                  className={`group relative aspect-square overflow-hidden border bg-black/40 ${sel ? 'border-studio-accent ring-1 ring-studio-accent' : 'border-studio-border hover:border-studio-accent/50'}`}
                                >
                                  {m.kind === 'video' ? (
                                    <>
                                      <video src={m.url} muted className="h-full w-full object-cover" />
                                      <span className="absolute bottom-0.5 right-0.5 flex items-center gap-0.5 rounded bg-black/70 px-1 text-[8px] text-white"><Play size={8} fill="currentColor" /> Video</span>
                                    </>
                                  ) : (
                                    <img src={m.url} alt="" className="h-full w-full object-cover" />
                                  )}
                                  {/* Abwählen direkt auf der gewählten Kachel — dort sucht man
                                      es. Der Textlink darunter war so unscheinbar, dass Nutzer
                                      dachten, man KÖNNE die Auswahl nicht entfernen. */}
                                  {sel && (
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(ev) => { ev.stopPropagation(); setProp(''); }}
                                      onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.stopPropagation(); setProp(''); } }}
                                      title="Auswahl entfernen — das Widget zeigt dann nichts Festes mehr"
                                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/75 text-white hover:bg-studio-accent hover:text-black"
                                    >
                                      <X size={10} />
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                            <button
                              onClick={async () => {
                                const res = (await window.studio.importMedia()) as { ok: boolean; imported?: MediaItem[] };
                                await refreshMedia();
                                if (res?.imported?.[0]) setProp(res.imported[0].id);
                              }}
                              className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-studio-border text-studio-muted hover:border-studio-teal hover:text-studio-teal"
                            >
                              <Plus size={18} />
                              <span className="text-[8px] normal-case tracking-normal">Importieren</span>
                            </button>
                          </div>
                          {value ? (
                            <button
                              onClick={() => setProp('')}
                              className="mt-1.5 flex items-center gap-1 rounded border border-studio-border px-2 py-1 text-[10px] normal-case tracking-normal text-studio-muted hover:border-studio-accent/60 hover:text-studio-accent"
                            >
                              <X size={10} /> Auswahl entfernen
                            </button>
                          ) : null}
                        </div>
                      );
                    }

                    // Sound = Dropdown der App-Sounds (Wiedergabe über die App)
                    if (field.type === 'sound') {
                      return (
                        <label key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          <FieldLabel label={field.label} hint={field.hint} />
                          <select
                            value={String(value)}
                            onChange={(e) => setProp(e.target.value)}
                            className="bx-select mt-1 text-xs"
                          >
                            <option value="">Kein Sound</option>
                            {soundList.map((s) => (
                              <option key={s.id} value={s.id}>{s.filename}</option>
                            ))}
                          </select>
                          {soundList.length === 0 && (
                            <span className="mt-0.5 block text-[9px] normal-case tracking-normal text-studio-gold">
                              Noch keine Sounds — unter „Sounds" importieren (MyInstants-Suche!).
                            </span>
                          )}
                        </label>
                      );
                    }

                    // Mehrfachauswahl (z.B. „bei welchen Ereignissen") — der Prop-
                    // Wert ist ein echtes String-Array, nicht getrennter Text
                    // (das Widget prüft Array.isArray, siehe PropField-Kommentar).
                    if (field.type === 'checkboxes') {
                      const selectedValues = Array.isArray(value)
                        ? (value as unknown[]).map(String)
                        : (field.options ?? []).map((o) => o.value);
                      const toggle = (v: string, checked: boolean) => {
                        const next = checked
                          ? [...selectedValues, v]
                          : selectedValues.filter((x) => x !== v);
                        setProp(next);
                      };
                      return (
                        <div key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          <FieldLabel label={field.label} hint={field.hint} />
                          <div className="mt-1.5 flex flex-col gap-1">
                            {field.options?.map((o) => (
                              <label key={o.value} className="flex cursor-pointer items-center gap-2 text-xs normal-case tracking-normal text-studio-text">
                                <input
                                  type="checkbox"
                                  checked={selectedValues.includes(o.value)}
                                  onChange={(e) => toggle(o.value, e.target.checked)}
                                  className="accent-[#ff4d2e]"
                                />
                                <span>{o.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    // Boolean = Schalter in eigener Zeile
                    if (field.type === 'boolean') {
                      return (
                        <label key={field.key} className="flex cursor-pointer items-start gap-2 text-xs text-studio-text">
                          <input
                            type="checkbox"
                            checked={value === '' || value === undefined ? (field.uncheckedDefault ?? true) : value !== false}
                            onChange={(e) => setProp(e.target.checked)}
                            className="mt-0.5 accent-[#ff4d2e]"
                          />
                          <span><FieldLabel label={field.label} hint={field.hint} /></span>
                        </label>
                      );
                    }
                    return (
                      <label key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                        <FieldLabel label={field.label} hint={field.hint} />
                        {field.type === 'color' ? (
                          <input
                            type="color"
                            value={typeof value === 'string' && value ? value : '#ff4d2e'}
                            onChange={(e) => setProp(e.target.value)}
                            className="mt-1 h-8 w-full cursor-pointer rounded-lg border border-studio-border bg-studio-raised"
                          />
                        ) : field.type === 'select' ? (
                          <select
                            value={String(value)}
                            onChange={(e) => setProp(e.target.value)}
                            className="bx-select mt-1"
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
                            className="bx-input mt-1 font-mono"
                          />
                        ) : (
                          <input
                            type={field.type}
                            value={field.type === 'number' ? Number(value) : String(value)}
                            onChange={(e) => setProp(field.type === 'number' ? Number(e.target.value) : e.target.value)}
                            className={`bx-input mt-1${field.type === 'number' ? ' font-mono' : ''}`}
                          />
                        )}
                      </label>
                    );
              };

              return (
                <>
                  <PanelSection title="Position & Größe" dot="#f0b429">
                    <div className="grid grid-cols-2 gap-2">
                      {(['x', 'y', 'w', 'h'] as const).map((k) => (
                        <label key={k} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          {{ x: 'Abstand links', y: 'Abstand oben', w: 'Breite', h: 'Höhe' }[k]}
                          <input
                            type="number"
                            value={selected[k]}
                            onChange={(e) => updateLayer(selected.id, { [k]: Number(e.target.value) } as Partial<OverlayLayer>, true)}
                            className="bx-input mt-1 font-mono"
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected.visible}
                          onChange={(e) => updateLayer(selected.id, { visible: e.target.checked }, true)}
                          className="accent-[#ff4d2e]"
                        />
                        Sichtbar
                      </label>
                      <label className="flex items-center gap-2" title="Bleibt sichtbar, lässt sich auf der Fläche aber nicht mehr anfassen — praktisch bei großen Widgets, die anderen im Weg liegen.">
                        <input
                          type="checkbox"
                          checked={!!selected.locked}
                          onChange={(e) => updateLayer(selected.id, { locked: e.target.checked }, true)}
                          className="accent-[#ffd23e]"
                        />
                        Gesperrt
                      </label>
                    </div>
                  </PanelSection>

                  {content.length > 0 && (
                    <PanelSection title="Inhalt & Verhalten" dot="#33e3c6">
                      {content.map(renderField)}
                    </PanelSection>
                  )}

                  {appearance.length > 0 && (
                    <PanelSection
                      title="Aussehen"
                      dot="#ff5e8a"
                      defaultOpen={false}
                      action={hasStyle ? (
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setGalleryOpen(true); }}
                          className="normal-case tracking-normal text-[10px] font-bold text-studio-teal hover:text-studio-accent"
                          title="Alle Grundformen dieses Widgets als Live-Vorschau durchblättern"
                        >
                          🎨 Galerie
                        </button>
                      ) : undefined}
                    >
                      {appearance.map(renderField)}
                    </PanelSection>
                  )}
                </>
              );
            })()}
            <div className="mt-1 border-t border-studio-border pt-2 text-[10px] text-studio-muted">Layer-ID: <code className="font-mono">{selected.id}</code></div>
          </div>
        )}
      </aside>

      {galleryOpen && selected && selectedDef && (
        <DesignGalleryModal
          def={selectedDef}
          layer={selected}
          overlayBase={overlayBase}
          onPick={(key, v) => updateLayer(selected.id, { props: { ...selected.props, [key]: v } }, true)}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </div>
  );
}

/** 🎨 Design-Galerie: alle Grundformen/Stile des Widgets als LIVE-Vorschau —
 *  klicken = anwenden (Modal bleibt offen zum Durchprobieren). */
function DesignGalleryModal({ def, layer, overlayBase, onPick, onClose }: {
  def: (typeof WIDGET_TYPES)[number];
  layer: OverlayLayout['layers'][number];
  overlayBase: string | null;
  onPick: (key: string, value: string) => void;
  onClose: () => void;
}) {
  const styleFields = def.fields.filter((fld) => (fld.key === 'style' || fld.key === 'shape') && fld.options);
  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bx-card max-h-[86vh] w-[min(880px,94vw)] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg">🎨 Design-Galerie — {def.label}</h2>
          <button onClick={onClose} className="bx-pill text-xs hover:text-studio-accent">Fertig</button>
        </div>
        {styleFields.map((fld) => (
          <div key={fld.key} className="mb-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-studio-muted">{fld.label}</div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {(fld.options ?? []).map((opt) => {
                const active = String(layer.props?.[fld.key] ?? (def.props as Record<string, unknown>)[fld.key] ?? '') === opt.value;
                return (
                  <GalleryCell
                    key={opt.value}
                    type={def.type}
                    w={def.w}
                    h={def.h}
                    props={{ ...def.props, ...layer.props, [fld.key]: opt.value }}
                    overlayBase={overlayBase}
                    label={opt.label}
                    active={active}
                    onPick={() => onPick(fld.key, opt.value)}
                  />
                );
              })}
            </div>
          </div>
        ))}
        <p className="text-[10px] text-studio-muted/70">Klick auf eine Karte wendet den Look sofort an — du siehst ihn direkt im Overlay. Farb-Designs (Themes) & Akzentfarbe stellst du zusätzlich rechts im Panel ein.</p>
      </div>
    </div>
  );
}

/** Eine Live-Vorschau-Zelle der Galerie (gleiches Single-Widget-Prinzip wie die Palette). */
function GalleryCell({ type, w, h, props, overlayBase, label, active, onPick }: {
  type: string; w: number; h: number; props: Record<string, unknown>;
  overlayBase: string | null; label: string; active: boolean; onPick: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const cw = frameRef.current?.contentWindow;
      if (ev.source !== cw) return;
      const d = ev.data as { type?: string } | null;
      if (d?.type === 'bx-preview-ready') {
        cw?.postMessage({
          type: 'bx-preview-mount',
          layer: { id: 'preview', widgetType: type, x: 0, y: 0, w, h, z: 0, opacity: 1, visible: true, props },
          canvas: { width: w, height: h },
        }, '*');
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [type, w, h, props]);
  const src = overlayBase ? `${overlayBase}&preview=1&perf=1&single=1` : '';
  return (
    <button
      onClick={onPick}
      className={`overflow-hidden rounded-lg border text-left transition-colors ${active ? 'border-studio-accent ring-1 ring-studio-accent' : 'border-studio-border hover:border-studio-accent/60'}`}
    >
      <div className="relative h-[120px] w-full" style={{ background: '#0b0d13' }}>
        {src ? <iframe ref={frameRef} src={src} title={label} className="pointer-events-none h-full w-full border-0" scrolling="no" /> : null}
      </div>
      <div className={`px-2 py-1.5 text-[11px] font-bold ${active ? 'text-studio-accent' : 'text-studio-text'}`}>{active ? '✓ ' : ''}{label}</div>
    </button>
  );
}
