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
  }
}

// ── WebSocket mit Selbstheilung ───────────────────────────────────────────
let reconnectDelay = 1000;

function connect() {
  const ws = new WebSocket(cfg.wsUrl);

  ws.onopen = () => {
    reconnectDelay = 1000;
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
    else if (msg.kind === 'event') {
      if (rendering) pendingEvents.push(msg.event);
      else dispatchEvent(msg.event);
    }
    else if (msg.kind === 'action') dispatchAction(msg.ruleId, msg.action);
    else if (msg.kind === 'stats') dispatchStats(msg.stats);
  };

  ws.onclose = () => {
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
} else {
  console.error('[overlay] window.BOTEXE_OVERLAY fehlt — Seite direkt geöffnet statt über /overlay?');
}
