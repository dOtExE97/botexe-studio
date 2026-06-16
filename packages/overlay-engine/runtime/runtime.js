// runtime.js — schlanker Overlay-Renderer für den TikTok-Live-Studio-Browser.
//
// Aufgaben:
//   1. WebSocket zur App (auto-reconnect — die Browser-Quelle muss sich
//      selbst heilen, niemand klickt im TTLS auf "neu laden")
//   2. Layout (DSL) → absolut positionierte Layer, skaliert auf Viewport
//   3. Events/Actions an die Widget-Instanzen verteilen
//
// Bewusst Vanilla-JS ohne Framework: der TTLS-Browser ist limitiert,
// jedes eingesparte Kilobyte und jeder eingesparte Frame zählt.

/* global window, document, WebSocket */

const cfg = window.BOTEXE_OVERLAY || {};
const stage = document.getElementById('stage');
const stageWrap = document.getElementById('stage-wrap');

// Schnell-Modus (?perf=1): Blur & teure Effekte aus — für den schwachen
// TTLS-Browser. Widgets können die Klasse selbst abfragen (Partikel-Budget).
if (cfg.perf) document.documentElement.classList.add('bx-perf');

// ── Widget-Registry ────────────────────────────────────────────────────────
// widgetType → Modul-URL. Module werden lazy geladen und gecacht; ein Layout
// mit unbekanntem widgetType rendert einen leeren Layer statt zu crashen.
const moduleCache = new Map();

async function loadWidgetClass(widgetType) {
  if (moduleCache.has(widgetType)) return moduleCache.get(widgetType);
  const url = `${cfg.baseUrl}/widgets/${encodeURIComponent(widgetType)}.js?token=${cfg.token}`;
  const promise = import(url)
    .then((m) => m.default || null)
    .catch((err) => {
      console.warn(`[overlay] Widget "${widgetType}" nicht ladbar:`, err);
      reportClientError(widgetType, `nicht ladbar: ${err && err.message ? err.message : err}`);
      return null;
    });
  moduleCache.set(widgetType, promise);
  return promise;
}

// ── Pro-Widget-Stil (Schriftart / Textfarbe / Größe) ───────────────────────
// Nur gebündelte (Lilita One, Baloo 2) + System-Fonts — kein CDN.
const FONT_STACKS = {
  lilita: "'Lilita One', 'Arial Black', sans-serif",
  baloo: "'Baloo 2', system-ui, sans-serif",
  sans: "'Segoe UI', system-ui, Arial, sans-serif",
  rounded: "'Baloo 2', 'Trebuchet MS', system-ui, sans-serif",
  condensed: "'Arial Narrow', 'Roboto Condensed', 'Oswald', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', Consolas, monospace",
};

// Premium-Designs ("Skins"): kuratierte CSS-Var-Bündel. Weil alle Widgets diese
// Vars nutzen, übernimmt JEDES Widget das Design sofort. Akzentfarbe bleibt
// bewusst beim User (eigenes Feld) → Theme + eigene Brand-Farbe kombinierbar.
// Alle Themes sind dunkel/satt → sicher mit jedem Widget (heller Text bleibt lesbar).
const THEMES = {
  glas: {}, // Default: edler dunkler Glasmorphismus (wie bisher)
  neon: {
    '--bx-glass': 'linear-gradient(160deg, rgba(8,12,22,.9), rgba(5,8,16,.92))',
    '--bx-shadow': '0 0 0 1.5px color-mix(in srgb, var(--bx-accent) 55%, transparent) inset, 0 0 30px -6px var(--bx-accent), 0 18px 40px -14px rgba(0,0,0,.8)',
    '--bx-radius': '10px', '--bx-text': '#eafffb', '--bx-muted': '#86d8d0',
  },
  synthwave: {
    '--bx-glass': 'linear-gradient(165deg, rgba(46,18,66,.92), rgba(18,9,38,.93))',
    '--bx-shadow': '0 0 0 1.5px rgba(255,94,170,.45) inset, 0 0 34px -8px rgba(124,92,255,.6), 0 18px 40px -14px rgba(0,0,0,.82)',
    '--bx-radius': '12px', '--bx-text': '#ffe6f6', '--bx-muted': '#caa0e6',
    '--bx-gold': '#ff7ac8', '--bx-teal': '#6df0ff',
  },
  arcade: {
    '--bx-glass': 'linear-gradient(165deg, #262a3a, #14151e)',
    '--bx-shadow': '0 6px 0 rgba(0,0,0,.55), 0 16px 30px -10px rgba(0,0,0,.7)',
    '--bx-radius': '20px', '--bx-text': '#ffffff',
    '--bx-font-display': "'Lilita One', 'Arial Black', sans-serif",
  },
  luxus: {
    '--bx-glass': 'linear-gradient(160deg, rgba(22,18,10,.95), rgba(9,8,5,.96))',
    '--bx-shadow': '0 0 0 1px rgba(255,210,62,.38) inset, 0 22px 52px -16px rgba(0,0,0,.88)',
    '--bx-radius': '14px', '--bx-text': '#fbf2d6', '--bx-muted': '#bda775',
    '--bx-font-display': "Georgia, 'Times New Roman', serif",
  },
  midnight: {
    '--bx-glass': 'linear-gradient(160deg, rgba(14,22,44,.92), rgba(8,12,26,.93))',
    '--bx-shadow': '0 0 0 1px rgba(120,160,255,.22) inset, 0 20px 46px -16px rgba(0,0,0,.85)',
    '--bx-radius': '16px', '--bx-text': '#eaf1ff', '--bx-muted': '#94a6cf',
  },
  inferno: {
    '--bx-glass': 'linear-gradient(160deg, rgba(34,12,8,.93), rgba(16,7,5,.94))',
    '--bx-shadow': '0 0 0 1px rgba(255,120,60,.3) inset, 0 0 30px -10px rgba(255,80,30,.5), 0 18px 42px -14px rgba(0,0,0,.85)',
    '--bx-radius': '14px', '--bx-text': '#ffeede', '--bx-muted': '#d39c80',
    '--bx-gold': '#ff8a3d',
  },
  mint: {
    '--bx-glass': 'linear-gradient(160deg, rgba(10,28,26,.9), rgba(6,18,18,.92))',
    '--bx-shadow': '0 0 0 1px rgba(40,224,196,.28) inset, 0 18px 42px -16px rgba(0,0,0,.82)',
    '--bx-radius': '18px', '--bx-text': '#e7fff8', '--bx-muted': '#86c8bb',
  },
  minimal: {
    '--bx-glass': 'linear-gradient(160deg, rgba(22,24,32,.6), rgba(15,17,23,.58))',
    '--bx-shadow': '0 10px 24px -14px rgba(0,0,0,.6)',
    '--bx-radius': '8px', '--bx-text': '#eef0f6', '--bx-muted': '#9aa0b2',
  },
  vapor: {
    '--bx-glass': 'linear-gradient(160deg, rgba(18,30,42,.62), rgba(12,22,34,.58))',
    '--bx-shadow': '0 0 0 1px rgba(180,220,255,.22) inset, 0 26px 60px -18px rgba(0,0,0,.7)',
    '--bx-radius': '22px', '--bx-text': '#eef7ff', '--bx-muted': '#9fc2dc',
  },
  holo: {
    '--bx-glass': 'linear-gradient(160deg, rgba(20,18,30,.92), rgba(10,9,18,.93))',
    '--bx-shadow': '0 0 0 1.5px rgba(255,120,220,.4) inset, 0 0 26px -8px rgba(120,200,255,.5), 0 18px 44px -14px rgba(0,0,0,.82)',
    '--bx-radius': '14px', '--bx-text': '#f4eeff', '--bx-muted': '#b9aed6',
    '--bx-gold': '#ff8ad6', '--bx-teal': '#7cd6ff', '--bx-pink': '#c77bff',
  },
  royal: {
    '--bx-glass': 'linear-gradient(160deg, rgba(28,18,46,.93), rgba(14,9,26,.94))',
    '--bx-shadow': '0 0 0 1px rgba(210,200,255,.3) inset, 0 22px 50px -16px rgba(0,0,0,.86)',
    '--bx-radius': '12px', '--bx-text': '#f3eeff', '--bx-muted': '#b6acd2',
    '--bx-gold': '#d9d2ff', '--bx-font-display': "Georgia, 'Times New Roman', serif",
  },
  forest: {
    '--bx-glass': 'linear-gradient(160deg, rgba(16,30,22,.93), rgba(9,18,13,.94))',
    '--bx-shadow': '0 0 0 1px rgba(120,200,150,.22) inset, 0 20px 46px -16px rgba(0,0,0,.84)',
    '--bx-radius': '20px', '--bx-text': '#eef7ee', '--bx-muted': '#9bc0a2',
    '--bx-gold': '#ffcf73',
  },
  mono: {
    '--bx-glass': 'linear-gradient(160deg, #1a1a1c, #0c0c0e)',
    '--bx-shadow': '0 0 0 2px #2c2c30 inset, 0 14px 30px -12px rgba(0,0,0,.85)',
    '--bx-radius': '4px', '--bx-text': '#f2f2f4', '--bx-muted': '#9a9aa0',
    '--bx-font-display': "'Arial Narrow', 'Roboto Condensed', 'Oswald', sans-serif",
  },
  aurora: {
    '--bx-glass': 'linear-gradient(160deg, rgba(10,24,40,.9), rgba(14,30,28,.9))',
    '--bx-shadow': '0 0 0 1px rgba(120,255,200,.22) inset, 0 0 30px -10px rgba(80,180,255,.45), 0 18px 44px -14px rgba(0,0,0,.82)',
    '--bx-radius': '18px', '--bx-text': '#eafff6', '--bx-muted': '#8fcabf',
    '--bx-teal': '#5cffc0',
  },
  // ── Helle Themes: --bx-text auf dunkel + --bx-text-shadow auf hell, damit
  //    Kontur/Schatten auf hellem Grund nicht matschen (Token in widget-base.css).
  paper: {
    '--bx-glass': 'linear-gradient(160deg, rgba(252,250,244,.94), rgba(244,240,230,.92))',
    '--bx-shadow': '0 1px 0 rgba(0,0,0,.04) inset, 0 16px 36px -18px rgba(80,70,50,.4)',
    '--bx-radius': '12px', '--bx-text': '#26211a', '--bx-muted': '#7a7060',
    '--bx-ink': '#fbf7ee', '--bx-text-shadow': 'rgba(255,255,255,.7)',
    '--bx-font-display': "Georgia, 'Times New Roman', serif",
  },
  bubblegum: {
    '--bx-glass': 'linear-gradient(160deg, rgba(255,240,250,.95), rgba(255,228,244,.93))',
    '--bx-shadow': '0 0 0 3px #3a1430, 6px 6px 0 rgba(58,20,48,.85)',
    '--bx-radius': '20px', '--bx-text': '#3a1430', '--bx-muted': '#9c5680',
    '--bx-ink': '#fff0fa', '--bx-text-shadow': 'rgba(255,255,255,.65)',
    '--bx-font-display': "'Lilita One', 'Arial Black', sans-serif",
  },
};

/** Setzt Stil-Vars auf den Layer-Root und legt bei Bedarf einen Zoom-Wrapper
 *  an (skaliert den Inhalt = Schrift + Abstände). Liefert das Mount-Element. */
function applyWidgetStyle(el, props, w, h) {
  // Theme zuerst — eigene Schrift/Farbe (unten) gewinnt darüber.
  const theme = THEMES[props.theme];
  if (theme) for (const k in theme) el.style.setProperty(k, theme[k]);

  // „Rahmen weg" (frameless): Panel-Hintergrund + Schatten transparent → zeigt nur
  // den Inhalt (wie eine reine Liste). Greift bei ALLEN Panel-Widgets, die die
  // Glass-Vars nutzen — eine Stelle, alle Widgets. Nach dem Theme, damit es gewinnt.
  if (props.frameless) {
    el.style.setProperty('--bx-glass', 'transparent');
    el.style.setProperty('--bx-shadow', 'none');
  }

  const fam = FONT_STACKS[props.fontFamily];
  if (fam) {
    el.style.setProperty('--bx-font-display', fam);
    el.style.setProperty('--bx-font-body', fam);
    el.style.setProperty('--bx-font-num', fam);
  }
  if (props.textColor) el.style.setProperty('--bx-text', String(props.textColor));

  const scale = Number(props.fontScale ?? 1) || 1;
  if (Math.abs(scale - 1) < 0.01) return el;
  // Inhalt im inversen Maß rendern und zurückskalieren → Box bleibt gleich,
  // alles drin (Schrift/Abstände/Bilder) wird um `scale` größer/kleiner.
  const inner = document.createElement('div');
  inner.style.position = 'absolute';
  inner.style.top = '0';
  inner.style.left = '0';
  inner.style.width = `${w / scale}px`;
  inner.style.height = `${h / scale}px`;
  inner.style.transformOrigin = 'top left';
  inner.style.transform = `scale(${scale})`;
  el.appendChild(inner);
  return inner;
}

// ── Stage / Layout ─────────────────────────────────────────────────────────
let currentLayout = null;
/** layerId → { el, widget } */
const liveLayers = new Map();

function scaleStage() {
  if (!currentLayout) return;
  const { width, height } = currentLayout.canvas;
  const scale = Math.min(window.innerWidth / width, window.innerHeight / height);
  stage.style.width = `${width}px`;
  stage.style.height = `${height}px`;
  stage.style.transform = `scale(${scale})`;
  // zentrieren übernimmt #stage-wrap (flex) — transform-origin top left,
  // daher wrap-padding via margin ausgleichen:
  stage.style.marginLeft = `${(window.innerWidth - width * scale) / 2}px`;
  stage.style.marginTop = `${(window.innerHeight - height * scale) / 2}px`;
  stageWrap.style.justifyContent = 'flex-start';
  stageWrap.style.alignItems = 'flex-start';
}

// Events, die während des (asynchronen) Widget-Mounts reinkommen, würden
// sonst verpuffen — z.B. der Sticky-Replay direkt nach dem WS-Connect.
let rendering = false;
let pendingEvents = [];

// Vollflächige Effekt-Widgets bekommen KEIN Mount-Einschweben (.bx-enter) —
// sie bringen ihren eigenen Auftritt mit (Burst/Regen/Konfetti/Fontäne).
const FULLBLEED_FX = new Set(['gift-fireworks', 'heart-rain', 'milestone-confetti', 'emojify', 'gift-cannon']);

async function renderLayout(layout) {
  // Komplett-Rebuild: Layout-Wechsel ist selten (Editor-Save), Einfachheit
  // schlägt Diffing. Events laufen danach wieder in frische Widgets.
  rendering = true;
  for (const { widget } of liveLayers.values()) {
    try {
      widget?.destroy?.();
    } catch {
      /* widget-fehler beim abbau ignorieren */
    }
  }
  liveLayers.clear();
  stage.innerHTML = '';
  currentLayout = layout;
  scaleStage();

  const sorted = [...layout.layers].sort((a, b) => a.z - b.z);
  for (const layer of sorted) {
    const el = document.createElement('div');
    el.className = 'layer';
    // Dezentes Einschweben beim Mount — außer bei vollflächigen Effekt-Widgets,
    // die ihren eigenen Auftritt mitbringen (Feuerwerk, Herzregen, Konfetti, …).
    if (!FULLBLEED_FX.has(layer.widgetType)) {
      el.classList.add('bx-enter');
    }
    el.dataset.layerId = layer.id;
    el.dataset.widgetType = layer.widgetType;
    el.style.left = `${layer.x}px`;
    el.style.top = `${layer.y}px`;
    el.style.width = `${layer.w}px`;
    el.style.height = `${layer.h}px`;
    el.style.zIndex = String(layer.z);
    el.style.opacity = String(layer.opacity ?? 1);
    if (!layer.visible) el.style.display = 'none';
    stage.appendChild(el);

    // Pro-Widget-Stil: Schriftart + Textfarbe als CSS-Vars (kaskadieren in den
    // Widget-Baum), Größe per Inhalt-Zoom (skaliert Schrift + Abstände).
    const mountEl = applyWidgetStyle(el, layer.props || {}, layer.w, layer.h);

    const entry = { el, widget: null };
    liveLayers.set(layer.id, entry);

    const WidgetClass = await loadWidgetClass(layer.widgetType);
    if (WidgetClass) {
      try {
        entry.widget = new WidgetClass(mountEl, layer.props || {}, {
          baseUrl: cfg.baseUrl,
          token: cfg.token,
          layerId: layer.id,
          // Editor-Vorschau: Widgets, die nur auf seltene Ereignisse reagieren
          // (z.B. Meilenstein-Konfetti), können sich damit selbst vorführen.
          preview: PREVIEW,
          // Spiel-Widgets: Sound über die App auslösen (Server dedupliziert).
          // In der Editor-Vorschau UND im Palette-Schaufenster bleiben Widget-
          // Sounds STUMM — sonst feuern Demo-Events (z.B. Feuerwerk alle paar
          // Sekunden) permanent Sounds. Sounds gehören nur ins echte Overlay.
          playSound: (soundId) => {
            if (!soundId) return;
            if (PREVIEW || SINGLE) {
              if (!previewSoundOn) return; // Vorschau-Sounds aus → still
              if (SINGLE) {
                // Schaufenster (kein WS): nur kurz nach „Test", an den Editor melden.
                if (performance.now() > soundWindowEnd) return;
                try { window.parent?.postMessage({ type: 'bx-play-sound', soundId: String(soundId) }, '*'); } catch { /* noop */ }
                return;
              }
              // Große Vorschau (hat WS): unten normal über WS senden.
            }
            try {
              if (activeWs && activeWs.readyState === 1) {
                activeWs.send(JSON.stringify({ kind: 'sound', soundId: String(soundId) }));
              }
            } catch { /* nie eskalieren */ }
          },
          // Spiel-Sieg melden (winId = layerId+Runde → Server zählt 1×).
          // In Vorschau/Schaufenster NICHT melden — sonst landen Demo-Sieger
          // (Mia/Leon/…) aus den Demo-Events im echten Punkte-/Bestenlisten-System.
          reportWin: (winId, user) => {
            if (PREVIEW || SINGLE) return;
            try {
              if (activeWs && activeWs.readyState === 1 && winId && user?.id) {
                activeWs.send(JSON.stringify({ kind: 'gamewin', winId: String(winId), user }));
              }
            } catch { /* nie eskalieren */ }
          },
        });
        if (lastStats) entry.widget?.onStats?.(lastStats);
      } catch (err) {
        console.warn(`[overlay] Widget "${layer.widgetType}" crash beim mount:`, err);
        reportClientError(layer.widgetType, `Crash beim Mount: ${err && err.message ? err.message : err}`);
      }
    }
  }

  rendering = false;
  const queued = pendingEvents;
  pendingEvents = [];
  for (const e of queued) dispatchEvent(e);
}

// ── Nachrichten-Verteilung ────────────────────────────────────────────────
function dispatchEvent(event) {
  for (const { widget } of liveLayers.values()) {
    try {
      widget?.onEvent?.(event);
    } catch (err) {
      console.warn('[overlay] Widget-Fehler bei onEvent:', err);
      reportClientError('onEvent', err && err.message ? err.message : String(err));
    }
  }
}

let lastStats = null;

function dispatchStats(stats) {
  lastStats = stats;
  for (const { widget } of liveLayers.values()) {
    try {
      widget?.onStats?.(stats);
    } catch (err) {
      console.warn('[overlay] Widget-Fehler bei onStats:', err);
      reportClientError('onStats', err && err.message ? err.message : String(err));
    }
  }
}

// Neuer Stream → akkumulierende Widgets (Top-Listen, Zähler, Glas) zurücksetzen.
function dispatchReset() {
  lastStats = null;
  for (const { widget } of liveLayers.values()) {
    try {
      widget?.onReset?.();
    } catch (err) {
      console.warn('[overlay] Widget-Fehler bei onReset:', err);
      reportClientError('onReset', err && err.message ? err.message : String(err));
    }
  }
}

function dispatchAction(ruleId, action) {
  if (action.kind === 'show_layer' || action.kind === 'hide_layer') {
    const entry = liveLayers.get(action.targetId);
    if (entry) {
      entry.el.style.display = action.kind === 'show_layer' ? '' : 'none';
      if (action.kind === 'show_layer' && action.durationMs) {
        setTimeout(() => {
          entry.el.style.display = 'none';
        }, action.durationMs);
      }
    }
    return;
  }
  // fire_alert & co.: das Ziel-Widget entscheidet, was zu tun ist.
  const entry = liveLayers.get(action.targetId);
  try {
    entry?.widget?.onAction?.(action, ruleId);
  } catch (err) {
    console.warn('[overlay] Widget-Fehler bei onAction:', err);
    reportClientError('onAction', err && err.message ? err.message : String(err));
  }
}

// ── Vorschau-Modus ─────────────────────────────────────────────────────────
// Im Editor läuft das Overlay als iframe mit ?preview=1. Dann gibt es keinen
// echten Stream — also erzeugen wir LOKAL Demo-Stats + Demo-Events, damit der
// Streamer sieht, wie die Widgets wirklich aussehen und sich bewegen. Layouts
// kommen weiter per WS (Editor-Edits live), echte Events/Stats werden ignoriert.
const PREVIEW = !!cfg.preview;
// Einzel-Widget-Schaufenster (Palette): KEIN WS — der Editor schickt das Layer
// per postMessage, das Widget führt sich mit denselben Demo-Daten selbst vor.
const SINGLE = !!cfg.single;
// Vorschau-Sounds: standardmäßig AUS (sonst spammt das Demo z.B. Feuerwerk).
// Der Editor schaltet sie per postMessage an/aus. Im Schaufenster spielt Sound
// zusätzlich nur kurz nach „Test" (soundWindowEnd), nie im Dauer-Demo.
let previewSoundOn = false;
let soundWindowEnd = 0;

function demoAvatar(name, color) {
  const initial = (name[0] || '?').toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">` +
    `<defs><radialGradient id="g" cx="35%" cy="30%"><stop offset="0%" stop-color="#fff" stop-opacity=".35"/>` +
    `<stop offset="100%" stop-color="${color}"/></radialGradient></defs>` +
    `<rect width="96" height="96" rx="48" fill="url(#g)"/>` +
    `<text x="48" y="64" font-size="48" font-family="Arial,sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">${initial}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function demoGiftIcon(color, glyph) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72">` +
    `<rect width="72" height="72" rx="18" fill="${color}"/>` +
    `<text x="36" y="50" font-size="40" text-anchor="middle">${glyph}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const DEMO_USERS = [
  { id: 'd1', nickname: 'Mia', color: '#ff5ea8' },
  { id: 'd2', nickname: 'Leon', color: '#21e6c1' },
  { id: 'd3', nickname: 'Skyler', color: '#7c5cff' },
  { id: 'd4', nickname: 'Nova', color: '#ffd23e' },
  { id: 'd5', nickname: 'Ben', color: '#ff7847' },
  { id: 'd6', nickname: 'Luna', color: '#4ea8ff' },
].map((u) => ({ ...u, profilePic: demoAvatar(u.nickname, u.color) }));

const DEMO_GIFTS = [
  { slug: 'Rose', coins: 1, icon: demoGiftIcon('#ff5ea8', '🌹') },
  { slug: 'Heart', coins: 5, icon: demoGiftIcon('#ff4d6d', '❤️') },
  { slug: 'Finger Heart', coins: 5, icon: demoGiftIcon('#ff7847', '🫰') },
  { slug: 'Galaxy', coins: 1000, icon: demoGiftIcon('#7c5cff', '🌌') },
  { slug: 'Lion', coins: 29999, icon: demoGiftIcon('#ffd23e', '🦁') },
  { slug: 'Rocket', coins: 20000, icon: demoGiftIcon('#21e6c1', '🚀') },
];

const DEMO_CHATS = [
  'Hey! 🔥', 'Lass gehen!', 'GG 😎', 'Erster!', 'Was ein Stream 💜',
  'Gönnung 🙌', '!spin', 'Folg dir schon ewig', 'Brudi 😂', 'Mega Vibes ❤️',
  '7', '3', '5', '9', '2', // Zahlen-Raten-Vorschau: gelegentliche Treffer
];

let demoStats = null;

function seedDemoStats() {
  const topGifters = DEMO_USERS.slice(0, 5).map((u, i) => ({
    id: u.id, nickname: u.nickname, profilePic: u.profilePic,
    coins: (5 - i) * 1200 + 300, gifts: (5 - i) * 3 + 1,
  }));
  const topLikers = [...DEMO_USERS].reverse().slice(0, 5).map((u, i) => ({
    id: u.id, nickname: u.nickname, profilePic: u.profilePic,
    likes: (5 - i) * 450 + 120,
  }));
  const topPoints = DEMO_USERS.slice(1, 6).map((u, i) => ({
    id: u.id, nickname: u.nickname, profilePic: u.profilePic,
    points: (5 - i) * 800 + 150,
  }));
  demoStats = {
    totals: { coins: 8400, gifts: 42, follows: 17, likes: 12900, shares: 9, chats: 230, viewers: 342, peakViewers: 410 },
    topGifters, topLikers, topPoints, currencyName: 'Punkte',
  };
  dispatchStats(demoStats);
}

function demoPickUser() {
  return DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
}

function demoTick() {
  if (!demoStats) return;
  const u = demoPickUser();
  const user = { id: u.id, nickname: u.nickname, profilePic: u.profilePic };
  const roll = Math.random();
  if (roll < 0.4) {
    const g = DEMO_GIFTS[Math.floor(Math.random() * DEMO_GIFTS.length)];
    demoStats.totals.coins += g.coins;
    demoStats.totals.gifts += 1;
    dispatchEvent({ type: 'gift', ts: Date.now(), user, gift: { slug: g.slug, count: 1, coinsPerUnit: g.coins, totalCoins: g.coins, icon: g.icon } });
  } else if (roll < 0.68) {
    demoStats.totals.chats += 1;
    dispatchEvent({ type: 'chat', ts: Date.now(), user, text: DEMO_CHATS[Math.floor(Math.random() * DEMO_CHATS.length)] });
  } else if (roll < 0.9) {
    demoStats.totals.likes += 18;
    dispatchEvent({ type: 'like', ts: Date.now(), user, likeCount: 18, totalLikes: demoStats.totals.likes });
  } else {
    demoStats.totals.follows += 1;
    dispatchEvent({ type: 'follow', ts: Date.now(), user });
  }
  // Viewer leicht schwanken lassen, damit der Live-Zähler pulsiert
  demoStats.totals.viewers = Math.max(1, demoStats.totals.viewers + Math.floor(Math.random() * 9) - 4);
  dispatchStats(demoStats);
}

// Aktions-getriggerte Widgets (Rad, Media-Trigger) brauchen eine Aktion, um
// sichtbar zu werden — in der Vorschau lösen wir sie regelmäßig aus, damit man
// das Rad drehen und das Video/Bild abspielen sieht.
function demoTriggerWidgets() {
  for (const [layerId, entry] of liveLayers) {
    const type = entry.el?.dataset.widgetType;
    if (type === 'wheel') dispatchAction('preview-spin', { kind: 'spin_wheel', targetId: layerId });
    else if (type === 'media') dispatchAction('preview-media', { kind: 'play_media', targetId: layerId });
    else if (type === 'giveaway') {
      const names = DEMO_USERS.map((u) => u.nickname);
      dispatchAction('preview-giveaway', { kind: 'giveaway_draw', params: { winner: { nickname: names[0] }, names } });
    }
  }
}

function startPreview() {
  seedDemoStats();
  setInterval(demoTick, 1700);
  setTimeout(() => { demoTriggerWidgets(); setInterval(demoTriggerWidgets, 13000); }, 2500);
  // Debug-Hook NUR im Preview: gezielt Events einspeisen (Design-Checks/Tests).
  window.__bxPreviewEvent = (e) => dispatchEvent({ ts: Date.now(), ...e });
}

// ── Einzel-Widget-Schaufenster (Palette-Vorschau) ──────────────────────────
// Kein WS: der Editor schickt das Layer per postMessage, danach treibt der
// normale Demo-Motor das Widget. Der „Test"-Knopf am Kärtchen löst die
// typische Aktion/ein dickes Gift aus.
function setupSinglePreview() {
  let started = false;
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
    if (d.type === 'bx-preview-mount' && d.layer && d.canvas) {
      const layout = { canvas: { width: d.canvas.width, height: d.canvas.height }, layers: [d.layer] };
      void renderLayout(layout).then(() => { if (!started) { started = true; startPreview(); } });
    } else if (d.type === 'bx-preview-test') {
      previewTest(d.widgetType, d.layerId);
    }
  });
  // Dem Editor signalisieren: bereit, Layer entgegenzunehmen.
  try { window.parent?.postMessage({ type: 'bx-preview-ready' }, '*'); } catch { /* noop */ }
}

function previewTest(widgetType, layerId) {
  // Sound-Fenster öffnen: die durch DIESEN Test ausgelösten Sounds dürfen kurz
  // klingen (falls Vorschau-Sounds an) — das Dauer-Demo bleibt still.
  soundWindowEnd = performance.now() + 4000;
  const u = demoPickUser();
  const user = { id: u.id, nickname: u.nickname, profilePic: u.profilePic };
  if (widgetType === 'wheel') { dispatchAction('preview-test', { kind: 'spin_wheel', targetId: layerId }); return; }
  if (widgetType === 'media') { dispatchAction('preview-test', { kind: 'play_media', targetId: layerId }); return; }
  if (widgetType === 'giveaway') {
    const names = DEMO_USERS.map((x) => x.nickname);
    dispatchAction('preview-test', { kind: 'giveaway_draw', params: { winner: { nickname: names[0] }, names } });
    return;
  }
  if (widgetType === 'live-poll') {
    DEMO_USERS.forEach((x, i) => dispatchEvent({ type: 'chat', ts: Date.now(), user: { id: x.id, nickname: x.nickname, profilePic: x.profilePic }, text: String((i % 3) + 1) }));
    return;
  }
  // Default: ein dickes Gift treibt Alerts/Feuerwerk/Kanone/Zähler/Glas/…
  const g = DEMO_GIFTS[DEMO_GIFTS.length - 1];
  dispatchEvent({ type: 'gift', ts: Date.now(), user, gift: { slug: g.slug, count: 5, coinsPerUnit: g.coins, totalCoins: g.coins * 5, icon: g.icon } });
}

// ── WebSocket mit Selbstheilung ───────────────────────────────────────────
let reconnectDelay = 1000;
let activeWs = null;

// Widget-/Runtime-Fehler an die App melden (zentrales Datei-Log), nicht nur
// in die TTLS-Browser-Console (die sieht niemand).
function reportClientError(scope, message) {
  try {
    if (activeWs && activeWs.readyState === 1) {
      activeWs.send(JSON.stringify({ kind: 'clientlog', level: 'error', scope, message: String(message).slice(0, 500) }));
    }
  } catch {
    /* Melde-Fehler nie eskalieren */
  }
}

function connect() {
  const ws = new WebSocket(cfg.wsUrl);

  ws.onopen = () => {
    reconnectDelay = 1000;
    activeWs = ws;
    console.log('[overlay] verbunden');
  };

  ws.onmessage = (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.data);
    } catch {
      return;
    }
    if (msg.kind === 'layout') void renderLayout(msg.layout);
    // In der Vorschau treiben Demo-Daten die Widgets — echte Events/Stats/
    // Aktionen vom Server (i.d.R. leer, kein Live-Stream) ignorieren wir.
    else if (PREVIEW) return;
    else if (msg.kind === 'event') {
      if (rendering) pendingEvents.push(msg.event);
      else dispatchEvent(msg.event);
    }
    else if (msg.kind === 'action') dispatchAction(msg.ruleId, msg.action);
    else if (msg.kind === 'stats') dispatchStats(msg.stats);
    else if (msg.kind === 'reset') dispatchReset();
  };

  ws.onclose = () => {
    if (activeWs === ws) activeWs = null;
    console.warn(`[overlay] getrennt — reconnect in ${reconnectDelay}ms`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

window.addEventListener('resize', scaleStage);

// FPS-Diagnose: einmalig nach dem Start die echte rAF-Rate messen und ins
// App-Log melden (Einstellungen → Logs öffnen) — zeigt sofort, ob der
// TTLS-Browser drosselt und der Anti-Throttle-Fallback der Widgets greift.
setTimeout(() => {
  let frames = 0;
  const t0 = performance.now();
  const count = () => {
    frames++;
    if (performance.now() - t0 < 2000) requestAnimationFrame(count);
    else {
      const fps = Math.round(frames / 2);
      const ctx = cfg.perf ? 'ttls-link' : cfg.preview ? 'editor-vorschau' : 'obs/browser';
      reportClientError('fps', `~${fps} fps (rAF) [${ctx}]${fps < 12 ? ' — Browser drosselt, Widgets nutzen Fallback (~18fps)' : ''}`);
    }
  };
  requestAnimationFrame(count);
}, 6000);

// Vorschau-Sound-Schalter (Editor → Runtime), gilt für große Vorschau + Schaufenster.
if (PREVIEW || SINGLE) {
  window.addEventListener('message', (ev) => {
    const d = ev.data;
    if (d && typeof d === 'object' && d.type === 'bx-preview-sound-toggle') previewSoundOn = !!d.enabled;
  });
}

if (SINGLE) {
  // Schaufenster-Vorschau: kein WS, Layer kommt per postMessage vom Editor.
  setupSinglePreview();
} else if (cfg.wsUrl) {
  connect();
  if (PREVIEW) startPreview();
} else {
  console.error('[overlay] window.BOTEXE_OVERLAY fehlt — Seite direkt geöffnet statt über /overlay?');
}
