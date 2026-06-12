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

    const entry = { el, widget: null };
    liveLayers.set(layer.id, entry);

    const WidgetClass = await loadWidgetClass(layer.widgetType);
    if (WidgetClass) {
      try {
        entry.widget = new WidgetClass(el, layer.props || {}, {
          baseUrl: cfg.baseUrl,
          token: cfg.token,
          layerId: layer.id,
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
  demoStats = {
    totals: { coins: 8400, gifts: 42, follows: 17, likes: 12900, shares: 9, chats: 230, viewers: 342, peakViewers: 410 },
    topGifters, topLikers,
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
  }
}

function startPreview() {
  seedDemoStats();
  setInterval(demoTick, 1700);
  setTimeout(() => { demoTriggerWidgets(); setInterval(demoTriggerWidgets, 13000); }, 2500);
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

if (cfg.wsUrl) {
  connect();
  if (PREVIEW) startPreview();
} else {
  console.error('[overlay] window.BOTEXE_OVERLAY fehlt — Seite direkt geöffnet statt über /overlay?');
}
