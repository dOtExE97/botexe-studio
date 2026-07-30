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

/* global window, document, WebSocket, location */

import { installFpsCap } from './fps-cap.js';

const cfg = window.BOTEXE_OVERLAY || {};
const stage = document.getElementById('stage');
const stageWrap = document.getElementById('stage-wrap');

// Schnell-Modus (?perf=1): Blur & teure Effekte aus + dichteres Glas — für den
// schwachen TTLS-Browser. Widgets können die Klasse selbst abfragen (Budget).
// Sonst im ECHTEN Overlay (kein preview): nur Blur aus (bx-noblur) — der blurrt
// dort eh nur Transparenz, ist also optisch neutral, spart aber GPU. Die
// Editor-Vorschau behält den vollen Blur (echte Optik beim Bearbeiten).
if (cfg.perf) document.documentElement.classList.add('bx-perf');
else if (!cfg.preview) document.documentElement.classList.add('bx-noblur');

// requestAnimationFrame auf ~60fps deckeln — IMMER, nicht nur in der Vorschau.
// Grund: Die Editor-Vorschau (Electron ohne VSync) rennt mit hunderten fps,
// UND das echte Overlay lief auf High-Refresh-Monitoren mit ~174fps (per Log
// gemessen). Für ein Overlay sind 60fps verlustfrei (alle Animationen sind
// dt-/zeitbasiert), sparen aber massiv CPU/GPU neben dem Spiel. Die Logik
// (driftfreier Akkumulator, kein Frame-Verschlucken) steckt getestet in
// fps-cap.js.
installFpsCap(window, typeof cfg.fpsCap === 'number' ? cfg.fpsCap : 60);

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
  rounded: "'Fredoka', 'Baloo 2', system-ui, sans-serif",
  condensed: "'Bebas Neue', 'Arial Narrow', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', Consolas, monospace",
  // Gebündelte Display-Schriften
  bebas: "'Bebas Neue', sans-serif",
  anton: "'Anton', 'Arial Black', sans-serif",
  bungee: "'Bungee', sans-serif",
  luckiest: "'Luckiest Guy', cursive",
  fredoka: "'Fredoka', sans-serif",
  marker: "'Permanent Marker', cursive",
  pacifico: "'Pacifico', cursive",
  russo: "'Russo One', sans-serif",
  pressstart: "'Press Start 2P', monospace",
  righteous: "'Righteous', sans-serif",
};

// Premium-Designs ("Skins"): kuratierte CSS-Var-Bündel. Weil alle Widgets diese
// Vars nutzen, übernimmt JEDES Widget das Design sofort. Akzentfarbe bleibt
// bewusst beim User (eigenes Feld) → Theme + eigene Brand-Farbe kombinierbar.
// Alle Themes sind dunkel/satt → sicher mit jedem Widget (heller Text bleibt lesbar).
const THEMES = {
  // Alle Themes bewusst UNTERSCHIEDLICH — nicht nur andere Tönung, sondern eigene
  // Form, Rand, Schrift und Farbwelt (dunkel/hell/bunt/Kontur). Helle Themes setzen
  // --bx-ink hell (Kontur der Widget-Überschriften) + helles --bx-text-shadow.
  glas: {
    '--bx-glass': 'linear-gradient(160deg, rgba(20,24,38,.82), rgba(10,12,22,.86))',
    '--bx-shadow': '0 0 0 1px rgba(255,255,255,.08) inset, 0 18px 44px -14px rgba(0,0,0,.8)',
    '--bx-radius': '16px', '--bx-text': '#eef1f8', '--bx-muted': '#9aa3bd',
  },
  neon: {
    '--bx-glass': '#0a0612',
    '--bx-shadow': '0 0 0 2px #16e0ff inset, 0 0 24px -2px #16e0ff, 0 0 40px -6px #ff2bd6',
    '--bx-radius': '4px', '--bx-text': '#eafcff', '--bx-muted': '#7fd8e8', '--bx-gold': '#16e0ff',
    '--bx-font-display': "'Bungee', sans-serif",
  },
  synthwave: {
    '--bx-glass': 'linear-gradient(165deg, #2a1150, #150626)',
    '--bx-shadow': '0 0 0 1.5px #ff5eae inset, 0 0 34px -6px #7c5cff, 0 6px 0 -1px #ff5eae',
    '--bx-radius': '8px', '--bx-text': '#ffe6f6', '--bx-muted': '#c79fe0', '--bx-gold': '#ffd23e',
    '--bx-font-display': "'Bebas Neue', sans-serif",
  },
  arcade: {
    '--bx-glass': 'linear-gradient(165deg, #2a2f42, #14151e)',
    '--bx-shadow': '0 6px 0 rgba(0,0,0,.5), 0 16px 30px -10px rgba(0,0,0,.7)',
    '--bx-radius': '20px', '--bx-text': '#ffffff', '--bx-muted': '#b9c0d8',
    '--bx-font-display': "'Lilita One', 'Arial Black', sans-serif",
  },
  luxus: {
    '--bx-glass': 'linear-gradient(160deg, #12100a, #070603)',
    '--bx-shadow': '0 0 0 1.5px #caa24a inset, 0 22px 50px -16px #000',
    '--bx-radius': '12px', '--bx-text': '#f3e4b8', '--bx-muted': '#b79a5e', '--bx-gold': '#f4c752',
    '--bx-font-display': "Georgia, 'Times New Roman', serif",
  },
  midnight: {
    '--bx-glass': 'linear-gradient(160deg, #101d3a, #070d1e)',
    '--bx-shadow': '0 0 0 1px rgba(120,160,255,.28) inset, 0 18px 46px -16px rgba(0,0,0,.85)',
    '--bx-radius': '14px', '--bx-text': '#e6eeff', '--bx-muted': '#93a6d4', '--bx-gold': '#6da8ff',
    '--bx-font-display': "'Russo One', sans-serif",
  },
  inferno: {
    '--bx-glass': 'linear-gradient(160deg, #1e0a06, #0c0403)',
    '--bx-shadow': '0 0 0 1px rgba(255,120,50,.4) inset, 0 0 30px -6px #ff6a1f, 0 18px 42px -14px #000',
    '--bx-radius': '8px', '--bx-text': '#ffe4d2', '--bx-muted': '#d99a72', '--bx-gold': '#ff8a3d',
    '--bx-font-display': "'Anton', sans-serif",
  },
  mint: {
    '--bx-glass': 'linear-gradient(160deg, #e2fff4, #c9f7ea)',
    '--bx-shadow': '0 10px 26px -12px rgba(40,200,160,.55)',
    '--bx-radius': '20px', '--bx-text': '#0f4a3c', '--bx-muted': '#3f8a76', '--bx-gold': '#0bbf8a',
    '--bx-ink': '#eafff6', '--bx-text-shadow': 'rgba(255,255,255,.6)',
    '--bx-font-display': "'Fredoka', sans-serif",
  },
  minimal: {
    '--bx-glass': 'rgba(22,24,32,.55)',
    '--bx-shadow': '0 10px 24px -14px rgba(0,0,0,.6)',
    '--bx-radius': '8px', '--bx-text': '#eef0f6', '--bx-muted': '#9aa0b2',
  },
  vapor: {
    '--bx-glass': 'linear-gradient(135deg, #b16cff, #6ad0ff 55%, #8affd0)',
    '--bx-shadow': '0 0 0 1px rgba(255,255,255,.4) inset, 0 18px 44px -14px rgba(120,80,220,.55)',
    '--bx-radius': '20px', '--bx-text': '#1e0f3a', '--bx-muted': '#43307a', '--bx-gold': '#ffffff',
    '--bx-ink': '#f2ecff', '--bx-text-shadow': 'rgba(255,255,255,.5)',
    '--bx-font-display': "'Righteous', sans-serif",
  },
  holo: {
    '--bx-glass': 'linear-gradient(130deg, #ff9de6, #a78bff 40%, #67e8ff 75%, #8affc1)',
    '--bx-shadow': '0 0 0 1px rgba(255,255,255,.5) inset, 0 18px 44px -14px rgba(120,80,200,.6)',
    '--bx-radius': '20px', '--bx-text': '#241246', '--bx-muted': '#4a2f7a', '--bx-gold': '#ffffff',
    '--bx-ink': '#fff', '--bx-text-shadow': 'rgba(255,255,255,.5)',
    '--bx-font-display': "'Righteous', sans-serif",
  },
  royal: {
    '--bx-glass': 'linear-gradient(160deg, #241246, #120826)',
    '--bx-shadow': '0 0 0 1.5px #caa24a inset, 0 20px 50px -16px #000',
    '--bx-radius': '12px', '--bx-text': '#efe6ff', '--bx-muted': '#b6a4dc', '--bx-gold': '#f4c752',
    '--bx-font-display': "Georgia, 'Times New Roman', serif",
  },
  forest: {
    '--bx-glass': 'linear-gradient(160deg, #0f2c1a, #06160d)',
    '--bx-shadow': '0 0 0 1px rgba(140,220,140,.28) inset, 0 18px 44px -14px #000',
    '--bx-radius': '16px', '--bx-text': '#e2ffe8', '--bx-muted': '#8fc79a', '--bx-gold': '#9be86a',
    '--bx-font-display': "'Russo One', sans-serif",
  },
  mono: {
    '--bx-glass': '#0c0c0c',
    '--bx-shadow': '0 0 0 1.5px #fff inset',
    '--bx-radius': '2px', '--bx-text': '#ffffff', '--bx-muted': '#aaaaaa', '--bx-gold': '#ffffff',
    '--bx-font-display': "'Bebas Neue', sans-serif", '--bx-font-body': 'monospace',
  },
  aurora: {
    '--bx-glass': 'linear-gradient(160deg, #0a2438, #0d2b26)',
    '--bx-shadow': '0 0 0 1px rgba(120,255,200,.24) inset, 0 0 30px -10px #50b4ff, 0 18px 44px -14px #000',
    '--bx-radius': '18px', '--bx-text': '#eafff6', '--bx-muted': '#8fcabf', '--bx-gold': '#5cffc0',
  },
  paper: {
    '--bx-glass': '#f6f0e2',
    '--bx-shadow': '0 2px 0 #d8cdb0, 0 12px 26px -12px rgba(0,0,0,.4)',
    '--bx-radius': '8px', '--bx-text': '#2c2416', '--bx-muted': '#7a6a48', '--bx-gold': '#c0392b',
    '--bx-ink': '#fbf7ee', '--bx-text-shadow': 'rgba(255,255,255,.7)',
    '--bx-font-display': "'Permanent Marker', cursive",
  },
  frost: {
    '--bx-glass': 'rgba(255,255,255,.72)',
    '--bx-shadow': '0 0 0 1px rgba(255,255,255,.7) inset, 0 16px 40px -16px rgba(90,120,160,.5)',
    '--bx-radius': '18px', '--bx-text': '#1e2a38', '--bx-muted': '#5a6b80', '--bx-gold': '#2f7ad6',
    '--bx-ink': '#f6f8fb', '--bx-text-shadow': 'rgba(255,255,255,.55)',
  },
  carbon: {
    '--bx-glass': '#161616',
    '--bx-shadow': '5px 5px 0 0 #000',
    '--bx-radius': '4px', '--bx-text': '#ffffff', '--bx-muted': '#b0b0b0', '--bx-gold': '#ffe600',
    '--bx-border': '2.5px solid #000', '--bx-font-display': "'Anton', sans-serif",
  },
  outline: {
    '--bx-glass': 'rgba(10,10,16,.35)',
    '--bx-shadow': 'none',
    '--bx-radius': '12px', '--bx-text': '#ffffff', '--bx-muted': '#cfd4e0', '--bx-gold': '#ffd23e',
    '--bx-border': '2px solid rgba(255,255,255,.85)',
  },
  chrome: {
    '--bx-glass': 'linear-gradient(160deg, #e8ecf2, #aab3c2 55%, #cfd6e0)',
    '--bx-shadow': '0 0 0 1px rgba(255,255,255,.7) inset, 0 14px 30px -12px rgba(0,0,0,.5)',
    '--bx-radius': '12px', '--bx-text': '#1a2230', '--bx-muted': '#4a5568', '--bx-gold': '#3a5a90',
    '--bx-ink': '#f2f5f9', '--bx-text-shadow': 'rgba(255,255,255,.6)',
    '--bx-font-display': "'Russo One', sans-serif",
  },
  sticker: {
    '--bx-glass': '#fff3c4',
    '--bx-shadow': '0 0 0 4px #1a1120, 6px 6px 0 0 #1a1120',
    '--bx-radius': '18px', '--bx-text': '#1a1120', '--bx-muted': '#6a4a1a', '--bx-gold': '#e8543f',
    '--bx-ink': '#fff3c4', '--bx-text-shadow': 'rgba(255,255,255,.5)',
    '--bx-font-display': "'Luckiest Guy', cursive",
  },
  sunset: {
    '--bx-glass': 'linear-gradient(150deg, #ff7a3d, #ff3d77 60%, #a23bff)',
    '--bx-shadow': '0 0 0 1px rgba(255,255,255,.25) inset, 0 18px 44px -14px rgba(200,40,90,.6)',
    '--bx-radius': '18px', '--bx-text': '#ffffff', '--bx-muted': '#ffe0d0', '--bx-gold': '#ffe600',
    '--bx-font-display': "'Bebas Neue', sans-serif",
  },
  bubblegum: {
    '--bx-glass': 'linear-gradient(160deg, #ffe3f3, #ffd0e8)',
    '--bx-shadow': '0 10px 26px -10px rgba(255,120,180,.5)',
    '--bx-radius': '26px', '--bx-text': '#7a1f52', '--bx-muted': '#c25a92', '--bx-gold': '#ff4d94',
    '--bx-ink': '#fff0fa', '--bx-text-shadow': 'rgba(255,255,255,.65)',
    '--bx-font-display': "'Fredoka', sans-serif",
  },
  terminal: {
    '--bx-glass': '#040a05',
    '--bx-shadow': '0 0 0 1px #1f7a2e inset, 0 0 22px -6px #37ff6a',
    '--bx-radius': '3px', '--bx-text': '#8dffab', '--bx-muted': '#3fbf5f', '--bx-gold': '#eaff8d',
    '--bx-font-display': "'Press Start 2P', monospace", '--bx-font-body': "'Press Start 2P', monospace",
  },
};

/** Setzt Stil-Vars auf den Layer-Root und legt bei Bedarf einen Zoom-Wrapper
 *  an (skaliert den Inhalt = Schrift + Abstände). Liefert das Mount-Element. */
function applyWidgetStyle(el, props) {
  // Theme zuerst — eigene Schrift/Farbe (unten) gewinnt darüber.
  const theme = THEMES[props.theme];
  if (theme) for (const k in theme) el.style.setProperty(k, theme[k]);

  // „Rahmen weg" (frameless): Panel-Hintergrund + Schatten transparent → zeigt nur
  // den Inhalt (wie eine reine Liste). Greift bei ALLEN Panel-Widgets, die die
  // Glass-Vars nutzen — eine Stelle, alle Widgets. Nach dem Theme, damit es gewinnt.
  if (props.frameless) {
    // Klasse für die CSS-Regeln (Blur + Gradient-Rand weg) UND Vars als Fallback
    // für Widgets, die --bx-glass direkt auf ihrer eigenen Wurzel nutzen.
    el.classList.add('bx-frameless');
    el.style.setProperty('--bx-glass', 'transparent');
    el.style.setProperty('--bx-shadow', 'none');
  } else {
    // Layer wird pro Layer-ID wiederverwendet → Frameless sauber zurücknehmen.
    el.classList.remove('bx-frameless');
    if (!theme) {
      el.style.removeProperty('--bx-glass');
      el.style.removeProperty('--bx-shadow');
    }
  }

  // „Premium-Effekte" — eine zuschaltbare Gestaltungs-Ebene, die für JEDES
  // Widget gilt (Tiefe, tabellarische Zahlen, langsames Atmen, gemeinsame
  // Auslöser-Choreografie). Die Regeln stehen gebündelt in widget-base.css
  // unter .bx-premium. Ohne den Haken ändert sich nichts.
  el.classList.toggle('bx-premium', !!props.polish);

  const fam = FONT_STACKS[props.fontFamily];
  if (fam) {
    el.style.setProperty('--bx-font-display', fam);
    el.style.setProperty('--bx-font-body', fam);
    el.style.setProperty('--bx-font-num', fam);
  }
  if (props.textColor) el.style.setProperty('--bx-text', String(props.textColor));

  // WICHTIG: Die Widget-Box muss ein Container-Query-Container sein, sonst
  // messen die cq-Einheiten IN der Widget-Wurzel gegen den Viewport.
  // Hintergrund: ein Element kann seinen EIGENEN container-type nicht abfragen.
  // Fast alle Widgets setzen container-type auf ihrer Wurzel (richtig für die
  // Kinder) und benutzen cq-Einheiten in derselben Regel (z.B. die Basis-
  // Schriftgröße) — die landeten dadurch beim Viewport und ignorierten die
  // eingestellte Box komplett. Beim Zahlen-Raten kam so eine Basisschrift von
  // 27,6 px statt 15,7 px heraus, der Inhalt war höher als das Kästchen und
  // wurde oben und unten abgeschnitten.
  el.style.containerType = 'size';

  // Textgröße als FAKTOR, den die Widgets in ihre Basisgröße multiplizieren.
  //
  // Vorher wurde der Inhalt in umgekehrter Größe gerendert und per transform
  // zurückskaliert. Das funktionierte nur, solange die Widgets ihre Schrift
  // NICHT aus ihrer Box ableiteten. Seit sie das tun (Container-Fix oben),
  // hoben sich beide Effekte exakt auf: gemessen 52,0 px auf dem Bildschirm bei
  // 0,7× / 1,0× / 1,5× — der Regler war komplett wirkungslos.
  // Ein Faktor kann sich nicht selbst aufheben; die Widgets lesen ihn über
  // --bx-fs und multiplizieren ihn in ihre eine Basisgröße.
  const scale = Number(props.fontScale ?? 1) || 1;
  el.style.setProperty('--bx-fs', String(scale));
  return el;
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
// Dasselbe für Aktionen und Momente: Sie liefen bisher SOFORT gegen die noch
// nicht gemounteten Widgets. Der Streamer sah dann „Trigger ausgeführt" im Log,
// im Overlay passierte nichts — und die Overlay-Meldung nannte auch noch die
// falsche Ursache („liegt in einem anderen Layout"). Gedeckelt, damit ein
// Geschenke-Sturm während eines langen Mounts das Array nicht sprengt.
let pendingActions = [];
const PENDING_ACTIONS_MAX = 50;

// Letzter Spielzustand JE Spielart, zum Nachreichen beim Widget-Mount (wie
// lastStats/lastSpotify). Muss eine Map sein, keine einzelne Variable: der
// Server schickt beim Verbinden zwei davon (laufendes Spiel + Boss), eine
// einzelne Variable würde die erste verschlucken.
const lastGameStates = new Map();

// Laufende Layout-Aufbauten durchnummerieren. Zwei `layout`-Nachrichten kurz
// hintereinander (Editor-Save, Profilwechsel) starten zwei Aufbauten, die sich
// beim `await` des Widget-Moduls überholen können — ohne diese Nummer mountet
// der ältere Lauf seine Widgets auf DOM-Knoten, die der jüngere längst entfernt
// hat (Geister-Widget mit ewig laufenden Timern) und hängt seine restlichen
// Ebenen zusätzlich in den neuen Stage (gemischtes Layout).
let layoutEpoch = 0;

// Vollflächige Effekt-Widgets bekommen KEIN Mount-Einschweben (.bx-enter) —
// sie bringen ihren eigenen Auftritt mit (Burst/Regen/Konfetti/Fontäne).
const FULLBLEED_FX = new Set(['gift-fireworks', 'heart-rain', 'milestone-confetti', 'emojify', 'gift-cannon']);

async function renderLayout(layout) {
  // Eigene Nummer ziehen, BEVOR irgendetwas awaited wird — ab hier ist jeder
  // ältere Lauf veraltet und darf nichts mehr in Stage/liveLayers schreiben.
  const meine = ++layoutEpoch;
  // Der ganze Aufbau in try/catch: Wirft hier irgendetwas (kaputtes Layout,
  // DOM-Fehler, scaleStage), bliebe die rendering-Sperre sonst für immer
  // gesetzt — siehe gibRenderingFrei().
  try {
    await renderLayoutIntern(layout, meine);
  } catch (err) {
    meldeEinmal('laufzeit', `Layout-Aufbau fehlgeschlagen: ${err && err.message ? err.message : err}`);
  } finally {
    // Nur der NEUESTE Lauf gibt frei. Täte es ein überholter, würden die
    // gestauten Ereignisse in einen halb aufgebauten Stage zugestellt. Der
    // neueste Lauf durchläuft sein finally immer — die Sperre kann also nicht
    // hängenbleiben.
    if (meine === layoutEpoch) gibRenderingFrei();
  }
}

async function renderLayoutIntern(layout, epoch) {
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
    const mountEl = applyWidgetStyle(el, layer.props || {});

    // Typ und Name mitführen: Ohne sie stand bei einem Fehler nur „onEvent" im
    // Log — bei zwanzig Widgets im Overlay war damit nicht erkennbar, WELCHES
    // gestolpert ist. Der Name ist der, den der Streamer selbst vergeben hat.
    const entry = { el, widget: null, typ: layer.widgetType, name: layer.name || layer.widgetType };
    liveLayers.set(layer.id, entry);

    const WidgetClass = await loadWidgetClass(layer.widgetType);
    // Hat uns während des Modul-Ladens ein neueres Layout überholt, gehört der
    // Stage jetzt ihm: nichts mehr mounten, nichts mehr anhängen.
    if (epoch !== layoutEpoch) return;
    if (WidgetClass) {
      try {
        entry.widget = new WidgetClass(mountEl, layer.props || {}, {
          baseUrl: cfg.baseUrl,
          token: cfg.token,
          layerId: layer.id,
          // Session-Seed als Getter → Widgets lesen immer den aktuellen Wert
          // (auch wenn er per reset erst nach dem Mount aktualisiert wird).
          get sessionSeed() { return sessionSeed; },
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
          // Hinweis ins App-Log (Diagnose-Seite). Für Fälle, in denen ein Widget
          // absichtlich NICHTS tut und der Streamer sonst rätselt — z.B. ein
          // Geschenk kommt an, passt aber zu keinem Eintrag der Liste, also
          // bleibt die Animation aus. In der Vorschau still (Demo-Daten).
          notify: (message) => {
            if (PREVIEW || SINGLE) return;
            reportClientError(layer.widgetType, message);
          },
        });
        if (lastStats) entry.widget?.onStats?.(lastStats);
        if (lastSpotify) entry.widget?.onSpotify?.(lastSpotify);
        // Laufendes Quiz/Bingo/Boss nachreichen. Der Server schickt den Zustand
        // direkt nach dem Layout — da stehen die Widgets aber noch nicht, und
        // ein zweites Mal kommt er nur bei echter Änderung. Ohne diese Zeile
        // war das Spiel nach jedem Neuladen der Browser-Quelle (passiert bei
        // jedem App-Update automatisch, mitten im Stream) aus dem Overlay weg.
        for (const zustand of lastGameStates.values()) entry.widget?.onGameState?.(zustand);
      } catch (err) {
        console.warn(`[overlay] Widget "${layer.widgetType}" crash beim mount:`, err);
        reportClientError(layer.widgetType, `Crash beim Mount: ${err && err.message ? err.message : err}`);
      }
    }
  }

}

/** Eine Aktion/einen Moment für die Zeit des Layout-Aufbaus zurückstellen.
 *  Läuft der Puffer über (Geschenke-Sturm während eines langen Mounts), wird
 *  verworfen — aber NICHT stumm: „passiert nichts und keiner weiß warum" ist
 *  genau der Fehler, den diese Warteschlange beseitigen soll. */
function merkeAktion(eintrag, art) {
  if (pendingActions.length < PENDING_ACTIONS_MAX) {
    pendingActions.push(eintrag);
    return;
  }
  meldeEinmal(
    'aktion',
    `Zu viele Aktionen während des Overlay-Aufbaus — „${art || '?'}" wurde verworfen `
      + `(mehr als ${PENDING_ACTIONS_MAX} in der Warteschlange).`,
    'puffer-voll',
  );
}

/** Rendering-Sperre lösen und aufgestaute Ereignisse/Aktionen zustellen.
 *
 *  MUSS auch im Fehlerfall laufen: Bleibt `rendering` auf true hängen, sammeln
 *  sich ab da ALLE Ereignisse in pendingEvents und werden nie zugestellt — das
 *  Overlay wirkt dann komplett tot, ohne Fehler und ohne Meldung. Nur ein
 *  Neuladen der Browser-Quelle hilft. Deshalb steht der Aufruf im `finally` von
 *  renderLayout(). Freigeben darf nur der ZULETZT gestartete Aufbau (Epoch) —
 *  dessen finally läuft immer, die Sperre kann also nicht hängenbleiben. */
function gibRenderingFrei() {
  rendering = false;
  const queued = pendingEvents;
  pendingEvents = [];
  for (const e of queued) {
    try {
      dispatchEvent(e);
    } catch (err) {
      meldeEinmal('laufzeit', `Ereignis nach Layout-Aufbau: ${err && err.message ? err.message : err}`);
    }
  }
  // Aktionen NACH den Ereignissen: Ein Alert soll die Zähler-Ereignisse
  // derselben Sekunde nicht überholen.
  const queuedAktionen = pendingActions;
  pendingActions = [];
  for (const a of queuedAktionen) {
    try {
      if (a.art === 'moment') dispatchMoment(a.moment);
      else dispatchAction(a.ruleId, a.action);
    } catch (err) {
      meldeEinmal('laufzeit', `Aktion nach Layout-Aufbau: ${err && err.message ? err.message : err}`);
    }
  }
}

// ── Nachrichten-Verteilung ────────────────────────────────────────────────
function dispatchEvent(event) {
  for (const { widget, typ, name } of liveLayers.values()) {
    try {
      widget?.onEvent?.(event);
    } catch (err) {
      console.warn('[overlay] Widget-Fehler bei onEvent:', err);
      reportClientError(typ || 'onEvent', `„${name}" stolperte bei einem ${event?.type ?? '?'}-Ereignis: ${err && err.message ? err.message : String(err)}`);
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

let lastSpotify = null;
function dispatchSpotify(state) {
  lastSpotify = state;
  for (const { widget } of liveLayers.values()) {
    try { widget?.onSpotify?.(state); } catch (err) { reportClientError('onSpotify', err && err.message ? err.message : String(err)); }
  }
}

// Neuer Stream → akkumulierende Widgets (Top-Listen, Zähler, Glas) zurücksetzen.
function dispatchReset() {
  lastStats = null;
  // Spiele sind mit dem alten Stream vorbei — sonst taucht ein beendetes Quiz
  // beim nächsten Widget-Mount wieder auf.
  lastGameStates.clear();
  for (const { widget } of liveLayers.values()) {
    try {
      widget?.onReset?.();
    } catch (err) {
      console.warn('[overlay] Widget-Fehler bei onReset:', err);
      reportClientError('onReset', err && err.message ? err.message : String(err));
    }
  }
}

// Premium-Moment → an alle Widgets mit onMoment (action-screen) verteilen.
function dispatchMoment(moment) {
  if (!moment) return;
  dispatchToWidgets('onMoment', moment);
}

// Eine Widget-Methode (onMoment/onGameState/onGameEvent) mit einem Argument an
// alle lebenden Widgets rufen — wer sie nicht implementiert, ignoriert sie.
function dispatchToWidgets(method, arg) {
  if (arg == null) return;
  for (const { widget } of liveLayers.values()) {
    try {
      widget?.[method]?.(arg);
    } catch (err) {
      console.warn(`[overlay] Widget-Fehler bei ${method}:`, err);
      reportClientError(method, err && err.message ? err.message : String(err));
    }
  }
}

function dispatchAction(ruleId, action) {
  if (action.kind === 'show_layer' || action.kind === 'hide_layer') {
    const entry = liveLayers.get(action.targetId);
    if (!entry) {
      // Wie beim allgemeinen Dispatch: ein fehlendes Ziel ist ein echter
      // Fehlschlag, kein Normalfall. Bisher passierte hier stumm nichts.
      meldeEinmal(
        'aktion',
        `„${action.kind}" hatte kein Ziel in diesem Overlay (Widget ${String(action.targetId).slice(0, 12)}). `
          + 'Meist liegt das Widget in einem anderen Layout als dem gerade angezeigten.',
        `ziel:${action.kind}:${action.targetId}`,
      );
      return;
    }
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
  // Kein Ziel? Das war bisher ein stiller Fehlschlag: Der Hauptprozess sucht
  // passende Widgets in ALLEN Layouts und meldet die Aktion als ausgeführt —
  // hier liegen aber nur die Layer des GERADE angezeigten Layouts. Liegt das
  // Ziel in einem anderen Layout, passierte im Stream nichts und nichts stand
  // im Log. Genau so gemeldet: „Karten-Ziehung ausgelöst, aber nichts zu sehen".
  if (!entry) {
    meldeEinmal(
      'aktion',
      `Aktion „${action.kind}" hatte kein Ziel in diesem Overlay (Widget ${String(action.targetId).slice(0, 12)}). `
        + 'Meist liegt das Widget in einem anderen Layout als dem gerade angezeigten.',
      `ziel:${action.kind}:${action.targetId}`,
    );
    return;
  }
  // Ziel ist da, aber ausgeblendet: Das Widget arbeitet die Aktion brav ab —
  // nur sieht sie niemand, weil der Layer auf display:none steht. Sieht für
  // den Streamer genauso aus wie ein Totalausfall.
  if (entry.el?.style.display === 'none') {
    meldeEinmal(
      'aktion',
      `„${action.kind}" ging an „${entry.name}", aber das Widget ist im Overlay ausgeblendet (Auge in der Ebenen-Liste).`,
      `unsichtbar:${action.targetId}`,
    );
  }
  if (typeof entry.widget?.onAction !== 'function') {
    meldeEinmal(
      'aktion',
      `Aktion „${action.kind}" ging an ein Widget, das damit nichts anfangen kann.`,
      `kannnicht:${action.kind}`,
    );
    return;
  }
  try {
    entry.widget.onAction(action, ruleId);
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
  // Geschenke-Slider mit Lucky-Draw lässt sich hier NICHT sinnvoll testen: Die
  // Ziehung plant der Hauptprozess (planLuckyDraws), und die Palette-Vorschau
  // läuft mit den Standard-Eigenschaften — dort ist luckyMode immer aus. Wer
  // die Ziehung ausprobieren will, nimmt „Testen ohne Live" mit dem
  // eingestellten Auslöser-Geschenk (Live-Seite): Das geht durch denselben
  // Weg wie ein echtes Geschenk, inklusive Server-Planung und Zustellung.
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
// Zuletzt vom Server gemeldete App-Version. Wechselt sie über einen Reconnect
// hinweg (= App wurde aktualisiert), lädt die Seite neu → frischer Overlay-Code.
let seenVersion = null;
let activeWs = null;
// Session-Seed vom Server (hello/reset) — deterministische Spiele (Zahlen-Raten,
// Bingo) würfeln damit pro Stream andere Zahlen, aber synchron über alle Quellen.
let sessionSeed = '';

// Widget-/Runtime-Fehler an die App melden (zentrales Datei-Log), nicht nur
// in die TTLS-Browser-Console (die sieht niemand).
function reportClientError(scope, message, level = 'warn') {
  try {
    if (activeWs && activeWs.readyState === 1) {
      activeWs.send(JSON.stringify({ kind: 'clientlog', level, scope, message: String(message).slice(0, 500) }));
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
    // Versions-Handshake: bei neuer App-Version (nach Update) die Seite neu laden,
    // damit Browser-Quellen den frischen Runtime-/Widget-Code holen statt ewig den
    // alten im Speicher zu behalten.
    if (msg.kind === 'hello') {
      if (msg.seed) sessionSeed = msg.seed; // Session-Seed für deterministische Spiele
      // Gemerkte Spielzustände verwerfen: Der Server schickt gleich nach dem
      // `hello` NUR das, was wirklich noch läuft — für „läuft nichts mehr" gibt
      // es keine Nachricht. Ohne dieses Leeren würde ein Quiz, das während der
      // Trennung zu Ende ging, beim nächsten Widget-Mount als Zombie wieder
      // auftauchen und dort stehen bleiben.
      lastGameStates.clear();
      // Editor-Vorschau (PREVIEW) NICHT neuladen — würde mitten im Bearbeiten
      // neu starten; sie wird beim App-Neustart ohnehin frisch geladen.
      if (seenVersion !== null && seenVersion !== msg.version && !PREVIEW) {
        console.warn(`[overlay] neue Version ${msg.version} (war ${seenVersion}) — lade neu`);
        location.reload();
        return;
      }
      seenVersion = msg.version;
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
    else if (msg.kind === 'action') {
      if (rendering) merkeAktion({ art: 'aktion', ruleId: msg.ruleId, action: msg.action }, msg.action?.kind);
      else dispatchAction(msg.ruleId, msg.action);
    }
    else if (msg.kind === 'stats') dispatchStats(msg.stats);
    else if (msg.kind === 'spotify') dispatchSpotify(msg.state);
    else if (msg.kind === 'reset') { if (msg.seed) sessionSeed = msg.seed; dispatchReset(); }
    else if (msg.kind === 'moment') {
      if (rendering) merkeAktion({ art: 'moment', moment: msg.moment }, 'moment');
      else dispatchMoment(msg.moment);
    }
    else if (msg.kind === 'game-state') {
      // Zustand merken (Mount-Nachreichung), dann normal verteilen.
      const zustand = { gameKind: msg.gameKind, state: msg.state };
      lastGameStates.set(String(msg.gameKind ?? ''), zustand);
      dispatchToWidgets('onGameState', zustand);
    }
    // `type` = `event` mitschicken: einige Widgets lesen msg.type / msg.event.type
    // statt des Event-Strings — ohne dies fielen Win-Celebration/Reveal-Sound aus.
    else if (msg.kind === 'game-event') dispatchToWidgets('onGameEvent', { gameKind: msg.gameKind, event: msg.event, type: msg.event, payload: msg.payload });
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

// Auffangnetz für alles, was NEBEN den bekannten Wegen schiefgeht.
//
// Die Aufrufe ins Widget (onEvent, onAction, onStats …) sind einzeln
// abgesichert — ein stolperndes Widget reißt die anderen nicht mit und landet
// im App-Log. Widgets arbeiten aber zum großen Teil in Zeitgebern und
// Animationen: Ein Fehler DORT läuft an allen diesen Sicherungen vorbei und
// landete bisher nur in der Browser-Konsole, die im Stream niemand sieht. Eine
// Animation blieb dann einfach stehen, ohne jede Spur im Log.
//
// Beide Fälle abfangen: geworfene Fehler und abgelehnte Zusagen (async).
// Gedrosselt, damit ein Fehler in einer 60-Bilder-Schleife nicht das Log flutet
// — der Server begrenzt zwar auch, aber erst nachdem gesendet wurde.
const gemeldeteFehler = new Set();
function meldeEinmal(quelle, text, schluesselText) {
  // Schlüssel OHNE Fundstelle: Derselbe Fehler aus einer Animationsschleife
  // feuert sonst mit jeder Zeilennummer neu und flutet das Log trotzdem.
  const schluessel = `${quelle}:${schluesselText ?? text}`.slice(0, 160);
  if (gemeldeteFehler.has(schluessel)) return;
  gemeldeteFehler.add(schluessel);
  // Nach 200 verschiedenen Fehlern aufhören zu sammeln (Speicher).
  if (gemeldeteFehler.size > 200) gemeldeteFehler.clear();
  reportClientError(quelle, text);
}

window.addEventListener('error', (e) => {
  // Fehlgeschlagene Bilder/Skripte melden sich hier ohne `error`-Objekt —
  // die sind meist harmlos (abgelaufene Gift-Adresse) und würden nur rauschen.
  if (!e?.error) return;
  const datei = String(e.filename || '').split('/').pop() || '?';
  const nachricht = e.error.message || e.message;
  meldeEinmal('laufzeit', `${nachricht} (${datei}:${e.lineno || '?'})`, nachricht);
});

window.addEventListener('unhandledrejection', (e) => {
  const grund = e?.reason;
  meldeEinmal('laufzeit', `unbehandelt: ${grund?.message || String(grund).slice(0, 120)}`);
});

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
      // Mit dem 60er-Cap ist ~60 der Gesund-Wert → als INFO melden, nicht als
      // WARN (sonst sieht jedes normale Log alarmierend aus). Nur echte
      // Drosselung (Browser bremst hart) bleibt eine Warnung.
      //
      // AUSNAHME Editor-Vorschau: Chromium drosselt jedes nicht sichtbare
      // Fenster absichtlich auf ~10 fps. Wer die App wegklickt oder auf eine
      // andere Seite wechselt, erzeugt also garantiert eine „Warnung", die
      // nichts über den Stream aussagt — die Vorschau sieht niemand außer dem
      // Streamer. Echte Warnungen kämen darin unter. Deshalb: Vorschau nur INFO.
      const preview = !!cfg.preview && !cfg.perf;
      const healthy = fps >= 50;
      const zusatz = fps < 12
        ? preview
          ? ' — Vorschau lief im Hintergrund (normal, betrifft den Stream nicht)'
          : ' — Browser drosselt, Widgets nutzen Fallback (~18fps)'
        : '';
      reportClientError('fps', `~${fps} fps (rAF) [${ctx}]${zusatz}`, healthy || preview ? 'info' : 'warn');
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
