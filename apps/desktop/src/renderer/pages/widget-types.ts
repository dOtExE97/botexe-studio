// Widget-Katalog — die eine Wahrheit über alle Overlay-Widgets: Typ, Label,
// Beschreibung, Standardgröße (w/h), Standard-Props und die Felder des
// Eigenschaften-Panels.
//
// Bewusst ein eigenes Modul OHNE React-Import: so kann auch der
// Überlauf-Prüfer (apps/desktop/scripts/widget-overflow-check.ts) den echten
// Katalog laden, statt eine Kopie davon zu pflegen, die auseinanderläuft.
// Hier NUR Daten/Typen ergänzen — nichts, was den Renderer mitzieht.

export interface PropField {
  key: string;
  label: string;
  /** seconds = im UI in Sekunden, gespeichert als ms · boolean = Schalter
   *  media = visueller Bild/Video-Picker mit Import · sound = Sound-Dropdown
   *  (abgespielt über die App, nie im Overlay) */
  type: 'number' | 'text' | 'select' | 'color' | 'boolean' | 'seconds' | 'media' | 'sound' | 'gift-list' | 'gift' | 'gift-command-list' | 'list';
  options?: { value: string; label: string }[];
  hint?: string;
  /** Nur für 'gift-command-list' und 'list': Platzhalter im Textfeld je Zeile. */
  textPlaceholder?: string;
  /** Nur 'list': Trennzeichen, mit dem die Einträge in EINEM String gespeichert
   *  werden (rückwärtskompatibel zu den alten „a|b|c"-Feldern). Standard '|'. */
  separator?: string;
  /** Nur 'list': Beschriftung des „+"-Knopfs (z.B. „Preis hinzufügen"). */
  addLabel?: string;
  /** Nur 'list': optionale Obergrenze an Einträgen (z.B. 4 Quiz-Antworten). */
  maxItems?: number;
  /** Nur boolean: Zustand, wenn die Prop (noch) NICHT gesetzt ist. Die meisten
   *  Widgets lesen `props.x !== false`, behandeln „nicht gesetzt" also als AN —
   *  darum ist true der Standard. Felder, die ohne Wert AUS sind (z.B.
   *  „Rahmen ausblenden"), setzen hier false, sonst zeigt der Schalter „an",
   *  obwohl nichts passiert. */
  uncheckedDefault?: boolean;
  /** Feld nur zeigen, wenn diese Bedingung auf den aktuellen Props zutrifft.
   *  Gegen wirkungslose Einstellungen: z.B. „Stil" beim Geschenk-Menü nur im
   *  Rotations-Modus, „Tempo des Laufbands" nur im Laufband-Modus. */
  showIf?: (props: Record<string, unknown>) => boolean;
}

const ACCENT_FIELD: PropField = {
  key: 'accent',
  label: 'Akzentfarbe',
  type: 'color',
  hint: 'färbt Kanten, Balken und Badges dieses Widgets',
};

function styleField(options: { value: string; label: string }[]): PropField {
  return { key: 'style', label: 'Grundform / Stil', type: 'select', options };
}

// Pro-Widget-Typografie (B2.1): Schriftart + Größe + Textfarbe. Wirkt über
// CSS-Vars/Zoom, die die Runtime auf den Layer-Root setzt.
const FONT_FIELD: PropField = {
  key: 'fontFamily', label: 'Schriftart', type: 'select',
  options: [
    { value: '', label: 'Standard (Studio-Mix)' },
    { value: 'lilita', label: 'Lilita One (verspielt, fett)' },
    { value: 'baloo', label: 'Baloo 2 (rund, kräftig)' },
    { value: 'fredoka', label: 'Fredoka (rund, freundlich)' },
    { value: 'bebas', label: 'Bebas Neue (hoch, schmal)' },
    { value: 'anton', label: 'Anton (massiv, schmal)' },
    { value: 'bungee', label: 'Bungee (Urban/Gaming)' },
    { value: 'luckiest', label: 'Luckiest Guy (Comic, fett)' },
    { value: 'russo', label: 'Russo One (sportlich/Tech)' },
    { value: 'righteous', label: 'Righteous (geometrisch)' },
    { value: 'marker', label: 'Permanent Marker (Stift)' },
    { value: 'pacifico', label: 'Pacifico (Schreibschrift)' },
    { value: 'pressstart', label: 'Press Start 2P (Retro-Pixel)' },
    { value: 'sans', label: 'Sans (schlicht)' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'condensed', label: 'Schmal (Condensed)' },
    { value: 'serif', label: 'Serif (elegant)' },
    { value: 'mono', label: 'Mono' },
  ],
  hint: 'Schriftart dieses Widgets (nur lokale/System-Fonts).',
};
const SIZE_FIELD: PropField = {
  // Bewusst „Textgröße" statt „Größe": die tatsächliche Widget-Größe zieht man
  // am Rahmen im Editor. Zwei Felder „Größe" (hier + das Karten-Format des
  // Action-Screens) standen sonst gleichnamig untereinander.
  key: 'fontScale', label: 'Textgröße', type: 'select',
  options: [
    { value: '0.7', label: 'Klein' },
    { value: '0.85', label: 'Kompakt' },
    { value: '1', label: 'Normal' },
    { value: '1.2', label: 'Groß' },
    { value: '1.5', label: 'Sehr groß' },
  ],
  hint: 'Skaliert den gesamten Widget-Inhalt (Schrift + Abstände).',
};
const TEXTCOLOR_FIELD: PropField = {
  key: 'textColor', label: 'Textfarbe', type: 'color', hint: 'Haupt-Textfarbe (leer = hell).',
};
/** Premium-Design ("Skin") — kuratierte Looks, durchwählbar. Akzentfarbe bleibt
 *  separat (Theme + eigene Brand-Farbe kombinierbar). */
const THEME_FIELD: PropField = {
  key: 'theme', label: 'Farb-Design (Theme)', type: 'select',
  options: [
    { value: 'glas', label: '🫧 Glas (dunkel, edel — Standard)' },
    { value: 'neon', label: '⚡ Neon (Cyber-Glow, Bungee-Schrift)' },
    { value: 'synthwave', label: '🌆 Synthwave (Retro-Pink/Lila, Bebas)' },
    { value: 'arcade', label: '🕹️ Arcade (dick gerundet, Lilita)' },
    { value: 'luxus', label: '👑 Luxus (Schwarz/Gold, Serif)' },
    { value: 'midnight', label: '🌙 Midnight (Tiefblau, Russo)' },
    { value: 'inferno', label: '🔥 Inferno (Glut/Orange, Anton)' },
    { value: 'mint', label: '🌿 Mint (hell, frisch, Fredoka) ☀️' },
    { value: 'minimal', label: '⬜ Minimal (clean, transparent)' },
    { value: 'vapor', label: '💜 Vapor (Pastell-Verlauf, Righteous) ☀️' },
    { value: 'holo', label: '🌈 Holo (echt irisierend) ☀️' },
    { value: 'royal', label: '💎 Royal (Tiefviolett/Gold, Serif)' },
    { value: 'forest', label: '🌲 Forest (Wald-Grün, Russo)' },
    { value: 'mono', label: '⬛ Mono (Schwarz/Weiß-Kontur, Bebas)' },
    { value: 'aurora', label: '❄️ Aurora (Polarlicht-Glow)' },
    { value: 'paper', label: '📝 Paper (Creme, Marker-Schrift) ☀️' },
    { value: 'bubblegum', label: '🍬 Bubblegum (Rosa, Fredoka) ☀️' },
    { value: 'frost', label: '🧊 Frost (helles Milchglas) ☀️' },
    { value: 'carbon', label: '🏁 Carbon (harte schwarze Kante, Anton)' },
    { value: 'outline', label: '⭕ Outline (nur Kontur, ultraleicht)' },
    { value: 'chrome', label: '🪙 Chrome (poliertes Metall, Russo) ☀️' },
    { value: 'sticker', label: '🏷️ Sticker (Comic, Luckiest Guy) ☀️' },
    { value: 'sunset', label: '🌅 Sunset (warmer Verlauf, Bebas)' },
    { value: 'terminal', label: '💻 Terminal (grün, Pixel-Schrift)' },
  ],
  hint: 'Edler Komplett-Look des Widgets — färbt Panel, Schatten, Radius, Schrift. Mit deiner Akzentfarbe kombinierbar.',
};
/** Volles Typo-Set (Design + Schriftart + Größe + Farbe) — für reine Text-Widgets. */
const STYLE_FIELDS: PropField[] = [THEME_FIELD, FONT_FIELD, SIZE_FIELD, TEXTCOLOR_FIELD];

/** „Rahmen ausblenden" — entfernt das Panel (Glas-Hintergrund + Schatten), zeigt
 *  nur den Inhalt. Wird universell für alle Panel-Widgets eingeblendet (s.u.). */
export const FRAME_FIELD: PropField = {
  key: 'frameless', label: 'Rahmen ausblenden', type: 'boolean', uncheckedDefault: false,
  hint: 'Entfernt Hintergrund-Panel + Schatten — zeigt nur den Inhalt (transparent, wie eine reine Liste). Ideal, wenn das Widget sonst zu viel Fläche deckt.',
};
/** Reine Effekt-/Vollbild-Widgets ohne Panel — da bringt „Rahmen ausblenden" nichts. */
export const NO_FRAME_TOGGLE = new Set(['gift-fireworks', 'heart-rain', 'emojify', 'gift-cannon', 'gift-counter', 'gift-jar', 'goal-bar', 'top-rotator', 'combo']);

/** „Premium-Effekte" — eine zuschaltbare Gestaltungs-Ebene für JEDES Widget.
 *  Die Regeln liegen gebündelt in widget-base.css unter .bx-premium; die
 *  Laufzeit setzt die Klasse. Ohne Haken ändert sich nichts — bestehende
 *  Overlays bleiben unberührt. */
export const POLISH_FIELD: PropField = {
  key: 'polish', label: 'Premium-Effekte', type: 'boolean', uncheckedDefault: false,
  hint: 'Mehr Tiefe (Lichtkante, weicher Schein unter Bildern), ruhig atmende Bewegung und ein deutlicher Effekt in dem Moment, in dem etwas passiert. Zahlen laufen tabellarisch und springen beim Hochzählen nicht mehr. Kostet kaum Leistung — im Schnell-Modus schaltet sich die Dauerbewegung automatisch ab.',
};
/** Reine Vollflächen-Effekte: dort gibt es kein Panel und keine Bilder, an
 *  denen die Premium-Ebene ansetzen könnte. */
export const NO_POLISH = new Set(['gift-fireworks', 'heart-rain', 'emojify', 'gift-cannon', 'combo']);

/** Schriftart/Größe/Farbe werden universell an JEDES Widget angehängt (außer reine
 *  Effekt-Widgets ohne Text) — dedupliziert, damit Widgets, die sie schon haben,
 *  keine Doppel-Felder bekommen. Das Runtime wendet die Werte universell an. */
export const UNIVERSAL_STYLE_FIELDS: PropField[] = [FONT_FIELD, SIZE_FIELD, TEXTCOLOR_FIELD];
// heart-rain (Namen an den Herzen) und gift-jar (Coin-Abzeichen, Zielbalken,
// Einblendungen) zeigen sehr wohl Text — die brauchen den Groessen-Regler.
// Draussen bleiben nur die, bei denen er nichts tun koennte: Feuerwerk und
// Kanone zeichnen ihren Text auf Canvas, Emojis haben ein eigenes Groessen-
// Feld, und das Medien-Widget zeigt ausser dem Platzhalter keinen Text.
export const NO_STYLE_FIELDS = new Set(['gift-fireworks', 'gift-cannon', 'emojify', 'media']);

/** Nur die Textgröße ist sinnvoll, Schriftart + Textfarbe nicht: Herz-Regen
 *  zeigt Emojis und Avatar-Kreise mit Initialen — keinen Fließtext, für den
 *  eine Schriftart oder Textfarbe etwas bewirken würde. Die Größe skaliert
 *  dagegen sichtbar Herzen und Emojis. */
export const SIZE_ONLY_STYLE = new Set(['heart-rain']);

/** Kein „Textfarbe"-Feld: bei diesen Widgets kommt die Farbe aus dem Design,
 *  dem Spielzustand oder dem Theme — eine freie Textfarbe würde nichts bewirken
 *  oder das Aussehen zerstören (Gold-Zahlen, X/O-Farben, Rad-Segmente, Skins,
 *  LED-/Uhr-Stile). Ein Feld, das nichts tut, gehört weg. Akzentfarbe + Theme
 *  bleiben. */
export const NO_TEXTCOLOR = new Set([
  'action-screen', 'subathon', 'wheel', 'hangman-game', 'tic-tac-toe-game', 'connect-four-game',
  'gift-jar', 'gift-counter',
]);

export const WIDGET_TYPES: {
  type: string;
  label: string;
  desc: string;
  w: number;
  h: number;
  props: Record<string, unknown>;
  fields: PropField[];
}[] = [
  {
    type: 'action-screen', label: 'Action-Screen (Momente)', desc: 'Die Bühne für besondere Momente: Wenn ein VIP reinkommt, jemand ein Spiel gewinnt oder der Boss fällt, blendet sich automatisch eine schicke Karte ein — sonst unsichtbar.',
    w: 420, h: 240, props: { channels: '', types: '', sizeMode: 'standard', queueMode: 'priority', maxQueue: 6, minPriority: 0, dedupeMs: 1500, defaultSkin: 'premium', animation: 'pop', showAvatar: true, showStats: true, soundMode: 'moment', accent: '#ff5436' },
    fields: [
      { key: 'channels', label: 'Kanäle', type: 'text', hint: 'Leer = alle. Sonst kommagetrennt: vip, viewer, game, mastery, boss, loot, manual, clip.' },
      { key: 'sizeMode', label: 'Karten-Format', type: 'select', hint: 'Wie groß die Momente-Karte auftritt. (Die Textgröße stellst du weiter unten.)', options: [
        { value: 'compact', label: 'Kompakt' }, { value: 'standard', label: 'Standard' }, { value: 'full', label: 'Groß (kurz)' },
      ] },
      { key: 'defaultSkin', label: 'Design', type: 'select', options: [
        { value: 'premium', label: 'Premium Gold' }, { value: 'arcade', label: 'Arcade XP' }, { value: 'clean', label: 'Clean Stream' }, { value: 'cute', label: 'Cute Pop' }, { value: 'dark-pro', label: 'Dark Pro' },
      ] },
      { key: 'animation', label: 'Animation', type: 'select', options: [
        { value: 'pop', label: 'Pop' }, { value: 'slide', label: 'Slide' }, { value: 'flip', label: 'Flip' }, { value: 'fade', label: 'Fade' },
      ] },
      { key: 'minPriority', label: 'Mindest-Priorität', type: 'number', hint: '0 = alles. Höher = nur wichtige Momente (Boss=100, VIP=70, Game-Win=35).' },
      { key: 'showAvatar', label: 'Profilbild zeigen', type: 'boolean' },
      { key: 'showStats', label: 'Stats zeigen', type: 'boolean' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'quiz-game', label: 'Quiz', desc: 'Chat-Quiz: Zuschauer antworten mit A/B/C/D, Live-Stimmen-Balken, Auflösung mit Gewinner. Starten/Auflösen auf der Live-Seite.',
    w: 420, h: 240, props: { accent: '#7c5cff', showVotes: true }, fields: [ACCENT_FIELD],
  },
  {
    type: 'hangman-game', label: 'Galgenmännchen', desc: 'Chat rät Buchstaben (oder „!guess wort"). Wort-Zeile, Fehlversuche, geratene Buchstaben.',
    w: 400, h: 170, props: { style: 'herzen', accent: '#ff5436' },
    fields: [
      styleField([
        { value: 'herzen', label: 'Herzen (Standard)' },
        { value: 'galgen', label: 'Galgen — die Figur baut sich Stück für Stück auf' },
      ]),
      ACCENT_FIELD,
    ],
  },
  {
    type: 'tic-tac-toe-game', label: 'Tic Tac Toe', desc: '2 Zuschauer duellieren sich aus dem Chat („!join", dann Feld 1–9). 3×3-Gitter, Turn-Anzeige, Gewinnlinie.',
    w: 340, h: 380, props: { accent: '#28e0c4' }, fields: [ACCENT_FIELD],
  },
  {
    type: 'connect-four-game', label: '4 Gewinnt', desc: '2 Zuschauer aus dem Chat („!join", dann Spalte 1–7). 7×6-Raster, fallende Steine, Gewinn-Hervorhebung.',
    w: 420, h: 350, props: { accent: '#ffd23e' }, fields: [ACCENT_FIELD],
  },
  {
    type: 'stream-boss', label: 'Stream-Boss', desc: 'Gemeinsamer Boss mit HP-Leiste — Gifts fügen Schaden zu (nach Coins). Top-Schadensliste, Level-Aufstieg, Kill-Moment. Boss-Modus auf der Live-Seite an.',
    w: 440, h: 190, props: { style: 'glas', accent: '#ff3b6b', showDamagers: true },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas (Standard)' },
        { value: 'arcade', label: '🕹️ Arcade (LED-Lebensbalken)' },
        { value: 'duester', label: '🩸 Düster (Dark-Fantasy, rot)' },
      ]),
      ACCENT_FIELD,
    ],
  },
  {
    type: 'gift-alert', label: 'Gift-Alert', desc: 'Großer Alert mitten im Bild, wenn ein Gift kommt — mit Gift-Bild und Profilfoto.',
    w: 760, h: 380, props: { style: 'glas', minCoins: 0, durationMs: 5000, soundId: 'botexe-alert.wav' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas-Karte (Standard)' },
        { value: 'neon', label: 'Neon (freistehend, riesig)' },
        { value: 'banner', label: 'Banner (schmale Leiste unten)' },
      ]),
      { key: 'minCoins', label: 'Erst ab … Coins', type: 'number', hint: 'Kleinere Gifts lösen keinen großen Alert aus. 0 = jedes Gift.' },
      { key: 'durationMs', label: 'Anzeigedauer', type: 'seconds', hint: 'Wie lange der Alert sichtbar bleibt.' },
      { key: 'soundId', label: 'Alert-Sound', type: 'sound', hint: 'Spielt beim Alert über die App (läuft über dein Desktop-Audio in den Stream).' },
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
    type: 'hype-train', label: 'Hype-Train', desc: 'Ein Hype-Balken, den Geschenke & Likes füllen: Stufe für Stufe steigt das Level, die Farben werden wilder, beim Aufstieg gibt es einen Sound. Perfekt, um den Chat anzuheizen.',
    w: 560, h: 150, props: { style: 'zug', coinsPerPoint: 1, likesPerPoint: 10, levelStep: 200, maxLevels: 5, windowSec: 30, title: 'Hype-Train', levelSoundId: 'botexe-gewinn.wav', accent: '#ff4d2e' },
    fields: [
      styleField([
        { value: 'zug', label: '🚂 Zug (Standard)' },
        { value: 'rakete', label: '🚀 Rakete (Boost mit Flammen)' },
        { value: 'led', label: '📟 LED-Anzeigetafel' },
      ]),
      { key: 'levelStep', label: 'Punkte pro Level', type: 'number', hint: 'Wie viele Punkte ein Level kostet. Punkte = Coins (÷ Coins/Punkt) + Likes (÷ Likes/Punkt).' },
      { key: 'maxLevels', label: 'Max. Level', type: 'number', hint: '2–6. Bei MAX flippt der Zug auf Feuer-Modus.' },
      { key: 'windowSec', label: 'Zeitfenster (Sek.)', type: 'number', hint: 'So lange darf zwischen zwei Beiträgen vergehen, sonst endet der Zug. Jeder Beitrag verlängert.' },
      { key: 'coinsPerPoint', label: 'Coins pro Punkt', type: 'number', hint: '1 = jeder Coin ein Punkt. Höher = Coins zählen weniger.' },
      { key: 'likesPerPoint', label: 'Likes pro Punkt', type: 'number', hint: 'z.B. 10 = 10 Likes ein Punkt.' },
      { key: 'title', label: 'Titel', type: 'text' },
      { key: 'levelSoundId', label: 'Level-Up-Sound', type: 'sound', hint: 'Spielt über die App bei jedem neuen Level.' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'subathon', label: 'Subathon-Timer', desc: 'Ein Countdown, den deine Zuschauer verlängern: Jedes Geschenk und jeder neue Follower gibt Extra-Zeit — dein Publikum hält den Stream am Leben.',
    w: 440, h: 200, props: { style: 'glas', startMinutes: 30, secondsPerCoin: 2, secondsPerFollow: 30, secondsPerLike: 0, maxMinutes: 600, title: 'Subathon', addSoundId: 'botexe-gewinn.wav', accent: '#28e0c4' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas (Standard)' },
        { value: 'bombe', label: '🧨 Zeitbombe (Comic)' },
        { value: 'led', label: '📟 LED-Anzeigetafel' },
      ]),
      { key: 'startMinutes', label: 'Startzeit (Min.)', type: 'number', hint: 'Womit der Timer startet (beim Laden).' },
      { key: 'secondsPerCoin', label: 'Sek. pro Coin', type: 'number', hint: 'Jeder Gift-Coin verlängert um so viele Sekunden.' },
      { key: 'secondsPerFollow', label: 'Sek. pro Follower', type: 'number' },
      { key: 'secondsPerLike', label: 'Sek. pro Like', type: 'number', hint: '0 = Likes verlängern nicht (sonst läuft der Timer nie ab).' },
      { key: 'maxMinutes', label: 'Max. Minuten', type: 'number', hint: 'Obergrenze, damit der Timer nicht ins Unendliche wächst.' },
      { key: 'title', label: 'Titel', type: 'text' },
      { key: 'addSoundId', label: 'Verlängerungs-Sound', type: 'sound' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'goal-bar', label: 'Goal-Bar', desc: 'Fortschrittsbalken Richtung Session-Ziel.',
    w: 560, h: 80, props: { style: 'glas', metric: 'coins', target: 1000, label: '', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas (Standard)' },
        { value: 'arcade', label: 'Arcade (LED-Segmente)' },
        { value: 'slim', label: 'Slim (dünne Linie, minimal)' },
        { value: 'thermo', label: '🌡️ Thermometer (senkrecht, spart Breite)' },
        { value: 'akku', label: '🔋 Akku (Batterie, blitzt bei 100%)' },
        { value: 'ring', label: '⭕ Ring (kreisförmig, sehr kompakt)' },
      ]),
      { key: 'metric', label: 'Metrik', type: 'select', options: [
        { value: 'coins', label: 'Coins' }, { value: 'likes', label: 'Likes' },
        { value: 'follows', label: 'Follower' }, { value: 'gifts', label: 'Gifts' },
      ] },
      { key: 'target', label: 'Ziel', type: 'number', hint: 'Bei diesem Wert ist der Balken voll.' },
      { key: 'label', label: 'Eigener Titel', type: 'text', hint: 'Leer = automatisch (z.B. „Coin-Ziel").' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'goal-countdown', label: 'Ziel-Countdown (Text)', desc: 'Cooler Text-Countdown wie „Noch 50.000 Likes bis zum Ziel!" — pro Metrik, zählt automatisch das nächste Ziel hoch.',
    w: 760, h: 130, props: { metric: 'likes', target: 1000, template: 'Noch {n} {label} bis zum Ziel!', doneText: 'Ziel erreicht! 🎉', onReach: 'raise', accent: '#ff5436', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'metric', label: 'Metrik', type: 'select', options: [
        { value: 'likes', label: 'Likes' }, { value: 'follows', label: 'Follower' },
        { value: 'shares', label: 'Shares' }, { value: 'gifts', label: 'Geschenke' },
        { value: 'coins', label: 'Coins' }, { value: 'viewers', label: 'Zuschauer (aktuell)' },
        { value: 'uniqueViewers', label: 'Zuschauer gesamt (verschiedene)' },
      ] },
      { key: 'target', label: 'Ziel', type: 'number', hint: 'Erstes Ziel. Bei „weiterzählen" steigt es danach in dieser Schrittweite (1000 → 2000 → …).' },
      { key: 'template', label: 'Text', type: 'text', hint: 'Platzhalter: {n} = verbleibend, {label} = Metrik, {target} = Ziel. Z.B. „Noch {n} {label} bis zum Ziel!".' },
      { key: 'doneText', label: 'Bei Erreichen', type: 'text', hint: 'Text, wenn das Ziel erreicht ist (im Modus „stehenbleiben").' },
      { key: 'onReach', label: 'Bei Ziel', type: 'select', options: [
        { value: 'raise', label: 'Weiterzählen (nächstes Ziel)' },
        { value: 'keep', label: 'Stehenbleiben („erreicht")' },
      ], hint: 'Weiterzählen = das Ziel wächst automatisch mit.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'milestone-confetti', label: 'Meilenstein-Konfetti', desc: 'Feiert erreichte Marken (z.B. alle 100 Follower) mit Konfetti-Burst + Glow-Banner.',
    w: 520, h: 320, props: { style: 'konfetti', metric: 'follows', step: 100, milestones: '', label: '', message: 'Meilenstein! 🎉', soundId: 'botexe-gewinn.wav', accent: '#ffd23e', theme: 'glas' },
    fields: [
      styleField([
        { value: 'konfetti', label: '🎊 Konfetti-Regen (Standard)' },
        { value: 'feuerwerk', label: '🎆 Funken steigen auf' },
        { value: 'pow', label: '💥 Comic-POW (Sticker-Explosion)' },
      ]),
      { key: 'metric', label: 'Metrik', type: 'select', options: [
        { value: 'follows', label: 'Follower' }, { value: 'coins', label: 'Coins' },
        { value: 'likes', label: 'Likes' }, { value: 'gifts', label: 'Gifts' },
      ] },
      { key: 'step', label: 'Schritt', type: 'number', hint: 'Alle N Einheiten feiern (z.B. 100 = bei 100, 200, 300 …). Wird ignoriert, wenn unten eine Liste steht.' },
      { key: 'milestones', label: 'Feste Marken', type: 'text', hint: 'Optional: eigene Schwellen, mit Komma (z.B. „1000, 5000, 10000"). Überschreibt den Schritt.' },
      { key: 'label', label: 'Eigener Titel', type: 'text', hint: 'Leer = automatisch (z.B. „Follower").' },
      { key: 'message', label: 'Botschaft', type: 'text', hint: 'Untertitel im Banner, z.B. „Danke euch! 🎉".' },
      { key: 'soundId', label: 'Feier-Sound', type: 'sound', hint: 'Spielt über die App beim Erreichen einer Marke.' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'leaderboard', label: 'Top Gifter', desc: 'Die größten Gift-Supporter — mit Avataren + Kronen oder Box.',
    w: 760, h: 180, props: { source: 'gifts', limit: 5, title: '', style: 'arcade', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'source', label: 'Quelle', type: 'select', options: [
        { value: 'gifts', label: 'Gifts (Coins)' }, { value: 'likes', label: 'Likes' },
      ] },
      styleField([
        { value: 'arcade', label: 'Arcade (Avatare + Kronen)' },
        { value: 'glas', label: 'Glas (Panel)' },
        { value: 'neon', label: 'Neon (durchscheinend)' },
        { value: 'bars', label: 'Balken (minimal)' },
        { value: 'podium', label: 'Podium (Siegertreppchen Top 3)' },
        { value: 'pills', label: 'Bunte Pillen' },
        { value: 'royal', label: 'Royal (Gold & Samt, edel)' },
        { value: 'treppe', label: 'Treppe (Staffelung nach Rang)' },
        { value: 'nummern', label: 'Nummern (groß, typografisch)' },
      ]),
      { key: 'limit', label: 'Plätze', type: 'number', hint: 'Wie viele Zuschauer angezeigt werden (1–10).' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Leer = automatisch („Top Gifter").' },
      { key: 'showPic', label: 'Profilbilder zeigen', type: 'boolean', hint: 'Avatare der Zuschauer anzeigen.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'leaderboard', label: 'Like-Liste', desc: 'Wer am fleißigsten liked — mit Avataren + Kronen oder Box.',
    w: 760, h: 180, props: { source: 'likes', limit: 5, title: '', style: 'arcade', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'source', label: 'Quelle', type: 'select', options: [
        { value: 'gifts', label: 'Gifts (Coins)' }, { value: 'likes', label: 'Likes' },
      ] },
      styleField([
        { value: 'arcade', label: 'Arcade (Avatare + Kronen)' },
        { value: 'glas', label: 'Glas (Panel)' },
        { value: 'neon', label: 'Neon (durchscheinend)' },
        { value: 'bars', label: 'Balken (minimal)' },
        { value: 'podium', label: 'Podium (Siegertreppchen Top 3)' },
        { value: 'pills', label: 'Bunte Pillen' },
        { value: 'royal', label: 'Royal (Gold & Samt, edel)' },
        { value: 'treppe', label: 'Treppe (Staffelung nach Rang)' },
        { value: 'nummern', label: 'Nummern (groß, typografisch)' },
      ]),
      { key: 'limit', label: 'Plätze', type: 'number', hint: 'Wie viele Zuschauer angezeigt werden (1–10).' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Leer = automatisch („Top Likes").' },
      { key: 'showPic', label: 'Profilbilder zeigen', type: 'boolean', hint: 'Avatare der Zuschauer anzeigen.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'top-rotator', label: 'Bestenliste (Wechsel)', desc: 'Zeigt abwechselnd Top Gifter, Top Likes, Top Punkte — smooth übergeblendet, untereinander. Ideal fürs Hochformat.',
    w: 460, h: 360, props: { sources: 'gifts,likes', interval: 5, limit: 5, style: 'glas', accent: '', showPic: true, fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas (Panel)' },
        { value: 'neon', label: 'Neon (freistehend)' },
        { value: 'pills', label: 'Bunte Pillen' },
        { value: 'banner', label: '🎬 Bauchbinde (TV-Unterzeile)' },
        { value: 'karte', label: '🃏 Karte (Kontaktkarten)' },
        { value: 'siegel', label: '🏅 Siegel (rundes Wappen)' },
        { value: 'kassette', label: '📼 Kassette (Retro-Tape)' },
      ]),
      { key: 'sources', label: 'Welche Listen', type: 'text', hint: 'Reihenfolge, kommagetrennt: gifts, likes, points, wins (Spiel-Siege).' },
      { key: 'interval', label: 'Sekunden pro Liste', type: 'number', hint: 'Wie lange jede Liste gezeigt wird, bevor gewechselt wird.' },
      { key: 'limit', label: 'Plätze', type: 'number', hint: 'Wie viele Zuschauer pro Liste (1–8).' },
      { key: 'showPic', label: 'Profilbilder zeigen', type: 'boolean', hint: 'Avatare der Zuschauer anzeigen.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'points-board', label: 'Punkte-Bestenliste', desc: 'All-Time Top-Supporter nach gesammelten Loyalty-Punkten (über alle Streams).',
    w: 360, h: 300, props: { source: 'points', limit: 5, title: '', style: 'glas', accent: '#7c5cff', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas (Panel)' },
        { value: 'neon', label: 'Neon (freistehend)' },
        { value: 'pills', label: 'Bunte Pillen' },
        { value: 'bon', label: '🧾 Kassenbon (Papier, Perforation)' },
        { value: 'highscore', label: '🕹️ Highscore (Arcade, Pixelschrift)' },
      ]),
      { key: 'limit', label: 'Plätze', type: 'number', hint: 'Wie viele Top-Supporter (1–10).' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Leer = automatisch („Top Punkte").' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'countdown', label: 'Countdown', desc: 'Zähler nach unten — z.B. „Stream startet in" oder Pausen-Timer.',
    w: 460, h: 200, props: { style: 'glas', minutes: 5, label: 'Countdown', doneText: 'LOS!', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas-Kapsel (Standard)' },
        { value: 'neon', label: 'Neon (freistehend, groß)' },
        { value: 'led', label: 'LED-Anzeigetafel' },
      ]),
      { key: 'minutes', label: 'Startzeit (Minuten)', type: 'number', hint: 'Von hier zählt der Timer runter (beim Laden der Quelle).' },
      { key: 'label', label: 'Beschriftung', type: 'text', hint: 'Text über dem Timer, z.B. „Stream-Start in".' },
      { key: 'doneText', label: 'Text bei 0', type: 'text', hint: 'Was angezeigt wird, wenn der Timer abläuft.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'bingo', label: 'Stream-Bingo', desc: 'Bingo-Brett (3×3 bis 5×5) mit Auto-Zielen — Zellen haken sich live ab (Gifts, Like-/Coin-Meilensteine), Reihen geben BINGO mit Animation + Sound. Volles Brett = neue Runde.',
    w: 480, h: 540, props: { size: 3, gifts: 'Rose,Finger Heart,GG', likeStep: 2000, coinStep: 200, followStep: 5, autoNewRound: true, cellSoundId: 'botexe-alert.wav', bingoSoundId: 'botexe-gewinn.wav', title: 'Stream-Bingo' },
    fields: [
      { key: 'size', label: 'Rastergröße', type: 'select', options: [
        { value: '3', label: '3×3 (9 Ziele)' }, { value: '4', label: '4×4 (16 Ziele)' }, { value: '5', label: '5×5 (25 Ziele)' },
      ], hint: 'Wie groß das Bingo-Brett ist.' },
      { key: 'gifts', label: 'Gift-Felder (welche Gifts lösen aus)', type: 'gift-list', hint: 'Wähle die Gifts, die als Bingo-Felder erscheinen — mit echten Bildern. Leer = Auto (günstige Gifts aus dem Katalog) + Meilensteine.' },
      { key: 'likeStep', label: 'Like-Schritt', type: 'number', hint: 'Meilenstein-Abstand, z.B. 2000 = Zellen für +2K/+4K/+6K Likes (ab Rundenstart). 0 = keine Like-Ziele.' },
      { key: 'coinStep', label: 'Coin-Schritt', type: 'number', hint: 'Wie Like-Schritt, für Coins. 0 = aus.' },
      { key: 'followStep', label: 'Follower-Schritt', type: 'number', hint: 'Wie Like-Schritt, für neue Follower. 0 = aus.' },
      { key: 'autoNewRound', label: 'Auto neue Runde', type: 'boolean', hint: 'Volles Brett → nach kurzer Pause automatisch ein frisches Brett würfeln.' },
      { key: 'cellSoundId', label: 'Treffer-Sound', type: 'sound', hint: 'Spielt, wenn eine Zelle abgehakt wird.' },
      { key: 'bingoSoundId', label: 'Bingo-Sound', type: 'sound', hint: 'Spielt bei einer kompletten Reihe/Spalte/Diagonale.' },
      { key: 'title', label: 'Titel', type: 'text' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'guess-number', label: 'Zahlen-Raten', desc: 'Die App denkt sich eine Zahl aus — Zuschauer raten im Chat. Treffer: Kacheln flippen auf, Gewinner mit Avatar + Konfetti + Sound, dann automatisch neue Runde.',
    w: 420, h: 280, props: { min: 1, max: 10, hints: true, autoNewRound: true, roundDelayMs: 6000, winSoundId: 'botexe-gewinn.wav', title: 'Zahl erraten!' },
    fields: [
      { key: 'min', label: 'Von', type: 'number', hint: 'Kleinste mögliche Zahl.' },
      { key: 'max', label: 'Bis', type: 'number', hint: 'Größte mögliche Zahl — z.B. 9 (einstellig), 10 oder 100.' },
      { key: 'hints', label: 'Höher/Niedriger-Tipps', type: 'boolean', hint: 'An: falsche Versuche zeigen ▲ höher / ▼ niedriger — macht es interaktiver.' },
      { key: 'autoNewRound', label: 'Auto neue Runde', type: 'boolean', hint: 'Nach einem Gewinner startet automatisch die nächste Runde.' },
      { key: 'roundDelayMs', label: 'Pause zwischen Runden', type: 'seconds', hint: 'Wie lange der Gewinner gefeiert wird, bevor es weitergeht.' },
      { key: 'winSoundId', label: 'Gewinn-Sound', type: 'sound', hint: 'Spielt, wenn jemand die Zahl trifft.' },
      { key: 'title', label: 'Titel', type: 'text' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'counter', label: 'Counter', desc: 'Manueller Zähler („Tode: 7") — hoch/runter per Panel-Klick, Hotkey oder Chat-Befehl. Wert überlebt Overlay-Reloads.',
    w: 320, h: 160, props: { style: 'glas', label: 'Tode', start: 0, accent: '#ff5436', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas (Standard)' },
        { value: 'led', label: '📟 LED-Score (Arcade)' },
        { value: 'sticker', label: '🏷️ Sticker (Comic, weiß)' },
      ]),
      { key: 'label', label: 'Beschriftung', type: 'text', hint: 'Was gezählt wird, z.B. „Tode", „Wins", „Schreie".' },
      { key: 'start', label: 'Startwert', type: 'number', hint: 'Nur beim allerersten Laden — danach merkt sich der Counter seinen Stand.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'activity-feed', label: 'Activity-Feed', desc: 'Alle Events gemischt (Follow, Sub, Share, Gift) als Live-Ticker.',
    w: 420, h: 320, props: { style: 'glas', max: 6, ttlMs: 60000, fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas (Standard)' },
        { value: 'timeline', label: '⏱️ Zeitstrahl (Linie mit Punkten)' },
        { value: 'bubbles', label: '💬 Sprechblasen (versetzt)' },
      ]),
      { key: 'max', label: 'Max. Einträge', type: 'number', hint: 'So viele Events bleiben gleichzeitig sichtbar.' },
      { key: 'ttlMs', label: 'Verschwinden nach', type: 'seconds', hint: 'Wie lange ein Eintrag stehen bleibt (0 = nie).' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'wheel', label: 'Glücksrad', desc: 'Dreht bei einer Trigger-Aktion (z.B. !spin gegen Punkte) und zeigt den Gewinn. Preise frei wählbar.',
    w: 480, h: 560, props: { style: 'classic', segments: '100 Coins|Nichts|VIP-Tag|Shoutout|50 Punkte|Joker|Doppelt|Pech', source: 'liste', spinMs: 5000, accent: '#ff5436', autoShow: true, showTrigger: true, title: 'Glücksrad', spinSoundId: 'botexe-rad.wav', resultSoundId: 'botexe-gewinn.wav', spinGift: '', autoFire: false },
    fields: [
      styleField([
        { value: 'classic', label: '🎡 Bunt (Standard)' },
        { value: 'casino', label: '🎰 Casino (Gold & Rot-Schwarz)' },
        { value: 'neon', label: '⚡ Neon-Arcade (freistehend, Glow)' },
      ]),
      { key: 'source', label: 'Woher kommen die Felder', type: 'select', options: [
        { value: 'liste', label: 'Meine Liste unten' },
        { value: 'trigger', label: 'Automatisch aus meinen Geschenk-Triggern' },
      ], hint: 'Automatisch: das Rad nimmt deine Geschenk-Trigger als Felder und bleibt von allein aktuell.' },
      { key: 'segments', label: 'Preise', type: 'list', separator: '|', textPlaceholder: 'Preis, z.B. 100 Coins', addLabel: 'Preis hinzufügen', hint: 'Jede Zeile ist ein Feld auf dem Rad. Frei änderbar — hinzufügen, entfernen, sortieren.', showIf: (p) => (p.source ?? 'liste') === 'liste' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Überschrift über dem Rad.' },
      { key: 'spinMs', label: 'Drehdauer', type: 'seconds', hint: 'Wie lange das Rad dreht, bis es stoppt.' },
      { key: 'autoShow', label: 'Auto ein-/ausblenden', type: 'boolean', hint: 'An: Rad erscheint beim Spin und verschwindet nach dem Ergebnis (deckt sonst nichts zu). Aus: dauerhaft sichtbar.' },
      { key: 'showTrigger', label: 'Dreher-Banner', type: 'boolean', hint: 'Zeigt beim Start kurz, wer (womit) gedreht hat — freistehend. Lichter-Kette am Rand ist immer an.' },
      { key: 'spinSoundId', label: 'Dreh-Sound', type: 'sound', hint: 'Spielt beim Start des Spins über die App.' },
      { key: 'resultSoundId', label: 'Gewinn-Sound', type: 'sound', hint: 'Spielt, wenn das Rad stehen bleibt.' },
      { key: 'spinGift', label: 'Bei welchem Geschenk drehen?', type: 'gift',
        hint: 'Wähle ein Geschenk — schickt das jemand, dreht das Rad automatisch. Leer = nur manuell/über eigene Trigger.' },
      { key: 'autoFire', label: 'Aktion automatisch ausführen', type: 'boolean',
        showIf: (p) => (p.source ?? 'liste') === 'trigger',
        hint: 'An: das ausgeloste Geschenk feuert seine Aktion von selbst (Sound/Effekt), sobald das Rad stehen bleibt. Aus: das Rad zeigt nur an.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'slot-machine', label: 'Gambling-Automat', desc: 'Spielautomat: ein Geschenk lässt die Walzen drehen — mit einstellbarer Gewinnchance wird zufällig eins deiner Geschenke gezogen und ausgelöst.',
    w: 640, h: 480, props: { source: 'trigger', items: '', style: 'neon', accent: '#ff5e8a', spinGift: '', winChance: 60, spinMs: 2000 },
    fields: [
      { key: 'source', label: 'Woher kommen die Symbole', type: 'select', options: [
        { value: 'trigger', label: 'Automatisch aus meinen Geschenk-Triggern' },
        { value: 'liste', label: 'Meine Liste unten' },
      ], hint: 'Die Walzen zeigen deine Geschenke/Challenges. Automatisch: bleibt von allein aktuell, wenn du deine Trigger änderst.' },
      { key: 'items', label: 'Geschenke auf den Walzen', type: 'gift-command-list', textPlaceholder: 'Was löst es aus?', hint: 'Pro Zeile ein Geschenk wählen und dazuschreiben, was es auslöst. Bild kommt automatisch dazu. (Wird bei „Automatisch aus meinen Geschenk-Triggern" nicht benutzt.)', showIf: (p) => p.source === 'liste' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Überschrift über den Walzen.' },
      { key: 'spinGift', label: 'Bei welchem Geschenk drehen?', type: 'gift', hint: 'Schickt das jemand, drehen die Walzen. Leer = nur manuell.' },
      { key: 'winChance', label: 'Gewinnchance (%)', type: 'number', hint: '0 = nie ein Gewinn, 100 = immer. Bestimmt, wie oft 3 Gleiche fallen.' },
      { key: 'spinMs', label: 'Dreh-Dauer', type: 'seconds', hint: 'Wie lange die Walzen drehen, bis sie stoppen. Bestimmt auch, wann bei Gewinn die Aktion feuert (gleichzeitig mit dem Stopp).' },
      ACCENT_FIELD,
      styleField([
        { value: 'neon', label: '⚡ Neon (Standard)' },
        { value: 'classic', label: '🎡 Klassisch' },
        { value: 'casino', label: '🎰 Casino (Gold & Rot-Schwarz)' },
      ]),
    ],
  },
  {
    type: 'giveaway', label: 'Giveaway / Verlosung', desc: 'Verlosung: Zuschauer schreiben !join in den Chat und sind im Lostopf. Auf Knopfdruck zieht das Widget spannend animiert einen Gewinner.',
    w: 760, h: 240, props: { style: 'strip', title: 'Giveaway', soundId: '', winSoundId: 'botexe-gewinn.wav', accent: '#ff5436', theme: 'glas' },
    fields: [
      { key: 'title', label: 'Titel', type: 'text' },
      styleField([
        { value: 'strip', label: 'Streifen (Case-Opening-Style)' },
        { value: 'spotlight', label: 'Spotlight (Flacker-Reveal)' },
      ]),
      { key: 'soundId', label: 'Zieh-Sound', type: 'sound', hint: 'Spielt beim Start der Ziehung.' },
      { key: 'winSoundId', label: 'Gewinner-Sound', type: 'sound', hint: 'Spielt beim Reveal des Gewinners.' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'gift-battle', label: 'Geschenk-Schlacht', desc: 'Zwei Teams im Tauziehen — jedes Team ist Gifts zugeordnet, Zuschauer pushen ihr Team. Rundentimer, Sieger-Blitz, optional Auto-Runde. (Zwei Designs)',
    w: 620, h: 220, props: { style: 'tug', teamA: 'Team Rosa', teamB: 'Team Blau', giftsA: 'rose', giftsB: 'heart', metric: 'coins', durationSec: 60, autoNewRound: true, roundDelayMs: 6000, winSoundId: 'botexe-gewinn.wav', accent: '#ff5436', theme: 'glas' },
    fields: [
      styleField([
        { value: 'tug', label: 'Tauziehen (Balken)' },
        { value: 'versus', label: 'Versus (zwei Säulen)' },
      ]),
      { key: 'teamA', label: 'Name Team A', type: 'text' },
      { key: 'teamB', label: 'Name Team B', type: 'text' },
      { key: 'giftsA', label: 'Gifts Team A', type: 'gift-list', hint: 'Gifts für Team A — durchsuchbar auswählen. Leer + Team B leer = Auto-Split (günstig=A, teuer=B).' },
      { key: 'giftsB', label: 'Gifts Team B', type: 'gift-list', hint: 'Gifts für Team B — durchsuchbar auswählen.' },
      { key: 'metric', label: 'Wertung', type: 'select', options: [
        { value: 'coins', label: 'Coins (Wert der Gifts)' },
        { value: 'count', label: 'Anzahl (jedes Gift = 1)' },
      ], hint: 'Womit gezogen wird.' },
      { key: 'durationSec', label: 'Rundenlänge (Sek.)', type: 'number', hint: 'Wie lange eine Schlacht dauert.' },
      { key: 'autoNewRound', label: 'Auto neue Runde', type: 'boolean', hint: 'Nach dem Sieger automatisch eine frische Runde starten.' },
      { key: 'roundDelayMs', label: 'Pause bis zur neuen Runde', type: 'seconds', hint: 'Wie lange der Sieger gefeiert wird, bevor die nächste Runde startet.' },
      { key: 'winSoundId', label: 'Sieger-Sound', type: 'sound', hint: 'Spielt über die App, wenn ein Team gewinnt.' },
      ACCENT_FIELD, THEME_FIELD,
    ],
  },
  {
    type: 'live-poll', label: 'Live-Umfrage', desc: 'Frage + 2–4 Optionen. Zuschauer stimmen per Chat ab (Zahl tippen, z.B. „1") — eine Stimme pro Person. Balken füllen sich live, am Ende Sieger-Reveal. (Zwei Designs)',
    w: 480, h: 280, props: { style: 'bars', question: 'Was sollen wir spielen?', options: 'Fortnite, Just Chatting, Zuschauer-Games', durationSec: 45, autoNewRound: false, roundDelayMs: 6000, revealSoundId: 'botexe-gewinn.wav', accent: '#7c5cff', theme: 'glas' },
    fields: [
      styleField([
        { value: 'bars', label: 'Balken (untereinander)' },
        { value: 'cards', label: 'Karten (nebeneinander)' },
      ]),
      { key: 'question', label: 'Frage', type: 'text' },
      { key: 'options', label: 'Optionen', type: 'list', separator: ',', maxItems: 4, textPlaceholder: 'Antwort, z.B. Fortnite', addLabel: 'Antwort hinzufügen', hint: 'Bis zu 4 Antworten. Zuschauer tippen die Zahl (1, 2, …) in den Chat.' },
      { key: 'durationSec', label: 'Abstimmdauer (Sek.)', type: 'number', hint: 'Wie lange abgestimmt werden kann, bis der Sieger enthüllt wird.' },
      { key: 'autoNewRound', label: 'Auto neue Runde', type: 'boolean', hint: 'Nach dem Reveal automatisch wieder offen für Stimmen.' },
      { key: 'roundDelayMs', label: 'Pause bis zur neuen Runde', type: 'seconds', hint: 'Wie lange das Ergebnis stehen bleibt, bevor neu abgestimmt wird.' },
      { key: 'revealSoundId', label: 'Reveal-Sound', type: 'sound', hint: 'Spielt über die App beim Enthüllen des Siegers.' },
      ACCENT_FIELD, THEME_FIELD,
    ],
  },
  {
    type: 'top-gift', label: 'Top-Gift', desc: 'Highlight des größten Einzel-Gifts der Session — Gift-Bild, Spender-Avatar, Bounce bei Rekord.',
    w: 320, h: 320, props: { title: '', style: 'glas', accent: '#ffd23e', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'title', label: 'Titel', type: 'text', hint: 'Überschrift, leer = „Größtes Gift".' },
      styleField([
        { value: 'glas', label: 'Glas (Panel)' },
        { value: 'sticker', label: 'Sticker (freistehend, ohne Panel)' },
        { value: 'podest', label: 'Podest — das Gift auf einer goldenen Siegertreppe im Spotlight-Kegel' },
        { value: 'vitrine', label: 'Vitrine — hinter Glas im Schaukasten, mit graviertem Messingschild' },
        { value: 'neonschild', label: 'Neonschild — Leuchtreklame mit doppelter Neonröhre' },
      ]),
      ACCENT_FIELD, ...STYLE_FIELDS,
    ],
  },
  {
    type: 'top-streak', label: 'Top-Streak', desc: 'Höchste Combo der Session (z.B. „50x Rose") — Gift-Bild, Spender-Avatar und die Streak-Zahl groß.',
    w: 340, h: 320, props: { title: '', style: 'glas', accent: '#ff5e8a', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'title', label: 'Titel', type: 'text', hint: 'Überschrift, leer = „Höchste Combo".' },
      styleField([
        { value: 'glas', label: 'Glas (Panel)' },
        { value: 'sticker', label: 'Sticker (freistehend, ohne Panel)' },
        { value: 'flamme', label: 'Flammensäule — brennt mit jeder Combo-Stufe höher' },
        { value: 'bon', label: 'Quittung — Kassenbon mit Zackenkante und Barcode' },
        { value: 'comic', label: 'Comic-Knall — die Combo in einem gezackten Explosionsstern' },
      ]),
      ACCENT_FIELD, ...STYLE_FIELDS,
    ],
  },
  {
    type: 'media', label: 'Bild / Video', desc: 'Eigenes Bild oder Video einblenden — dauerhaft (Logo/Banner) oder per Trigger (z.B. Begrüßungsvideo bei einem Superfan).',
    w: 600, h: 400, props: { mediaId: '', mode: 'trigger', fit: 'contain', durationMs: 6000, frame: false, loop: true, muted: true },
    fields: [
      { key: 'mediaId', label: 'Medium', type: 'media', hint: 'Bild/Video wählen oder neues importieren (PNG, JPG, GIF, WEBP, MP4, WEBM).' },
      { key: 'mode', label: 'Modus', type: 'select', options: [
        { value: 'trigger', label: 'Per Trigger (blendet sich ein/aus)' },
        { value: 'static', label: 'Dauerhaft sichtbar' },
      ], hint: 'Trigger: erscheint nur wenn eine Regel „Medium abspielen" auslöst (z.B. Superfan-Begrüßung). Dauerhaft: immer sichtbar (Logo/Banner).' },
      { key: 'fit', label: 'Anpassung', type: 'select', options: [
        { value: 'contain', label: 'Ganz zeigen (Letterbox)' },
        { value: 'cover', label: 'Fläche füllen (Zuschnitt)' },
      ], hint: 'Ganz zeigen = nichts abgeschnitten. Füllen = randlos, schneidet ggf. zu.' },
      { key: 'durationMs', label: 'Bild-Anzeigedauer', type: 'seconds', hint: 'Nur für Bilder im Trigger-Modus (Videos enden von selbst).' },
      { key: 'frame', label: 'Rahmen & Schatten', type: 'boolean', hint: 'Abgerundeter Glas-Rahmen mit Akzent-Glow um das Medium.' },
      { key: 'muted', label: 'Video stumm', type: 'boolean', hint: 'An lassen — Overlay-Ton ist im TikTok-Studio unzuverlässig, Sound besser als Sound-Trigger.' },
      { key: 'loop', label: 'Video looped (dauerhaft)', type: 'boolean', hint: 'Nur im Dauerhaft-Modus: Video endlos wiederholen.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'heart-rain', label: 'Like-Herzen', desc: 'Likes als bunte Herzen + Profilbilder, über die ganze Breite aufsteigend, sanft schwingend .',
    w: 1080, h: 1100, props: { emojis: '❤️,💖,💕,✨,🔥', maxPerBurst: 16, mode: 'fountain', avatars: true },
    fields: [
      { key: 'mode', label: 'Stil', type: 'select', options: [
        { value: 'fountain', label: 'Dicht (viele kleine Herzen)' },
        { value: 'rain', label: 'Locker (größere Herzen)' },
      ], hint: 'Beide steigen über die ganze Breite auf — „Dicht" wirft mehr kleinere Herzen, „Locker" weniger, größere.' },
      { key: 'avatars', label: 'Profilbilder zeigen', type: 'boolean', hint: 'Ab und zu steigt das echte Profilbild des Likers mit auf.' },
      { key: 'emojis', label: 'Emojis', type: 'text', hint: 'Eigene Symbole, kommagetrennt (z.B. ❤️,💖,🔥). Leer/Default = edle bunte SVG-Herzen.' },
      { key: 'maxPerBurst', label: 'Max. pro Like-Schub', type: 'number', hint: 'Begrenzt, wie viele bei einer Like-Welle gleichzeitig kommen.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'text-label', label: 'Text / Schrift', desc: 'Eigener fester Text in schöner Schrift — z.B. „Follow = Lizzard". Farbe, dicke Kontur, optional animiert. Größe = Box ziehen.',
    w: 760, h: 120, props: { text: 'Dein Text hier', animation: 'none', outline: true, accent: '#ff5436', fontFamily: 'lilita', fontScale: 1, textColor: '' },
    fields: [
      { key: 'text', label: 'Text', type: 'text', hint: 'Was angezeigt wird. Zeilenumbruch mit Enter möglich.' },
      { key: 'animation', label: 'Animation', type: 'select', options: [
        { value: 'none', label: 'Keine' }, { value: 'pulse', label: 'Pulsieren' },
        { value: 'bounce', label: 'Hüpfen' }, { value: 'float', label: 'Schweben' },
        { value: 'glow', label: 'Leuchten' }, { value: 'rainbow', label: 'Regenbogen' },
        { value: 'shimmer', label: 'Glanz-Sweep' },
      ] },
      { key: 'outline', label: 'Dicke Kontur', type: 'boolean', hint: 'Schwarze Outline . Aus = clean.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'text-ticker', label: 'Lauftext-Banner', desc: 'Scrollender Streifen für Socials/Ansagen — dünn, deckt kaum zu. 3 Stile.',
    w: 760, h: 56, props: { messages: 'Folge mir! | Discord in der Bio | Danke fürs Zuschauen ❤️', speed: 18, style: 'glas', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'messages', label: 'Nachrichten', type: 'list', separator: '|', textPlaceholder: 'Nachricht, z.B. Folge mir!', addLabel: 'Nachricht hinzufügen', hint: 'Jede Zeile läuft nacheinander durchs Band.' },
      styleField([
        { value: 'glas', label: 'Glas' },
        { value: 'solid', label: 'Gefüllt' },
        { value: 'neon', label: 'Neon' },
      ]),
      { key: 'speed', label: 'Tempo (Sek/Runde)', type: 'number', hint: 'Kleiner = schneller. Sekunden für einen Durchlauf.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'social-rotator', label: 'Social-Media-Rotator', desc: 'Rotierende Follow-Pille, die nacheinander deine Kanäle bewirbt — mit echtem Plattform-Branding (TikTok/Insta/YouTube/Discord/Twitch/X/Kick).',
    w: 540, h: 120, props: { channels: 'tiktok:dein_name | instagram:dein_name | discord:Link in Bio', intervalMs: 6000, follow: 'Folgen', style: 'pill', accent: '#ff5436', theme: 'glas' },
    fields: [
      { key: 'channels', label: 'Kanäle', type: 'text', hint: 'Format „plattform:Name", mit | trennen. Plattformen: tiktok, instagram, youtube, discord, twitch, x, kick, snapchat, facebook.' },
      styleField([
        { value: 'pill', label: 'Pille (hell, freistehend)' },
        { value: 'glas', label: 'Glas' },
        { value: 'neon', label: 'Neon' },
      ]),
      { key: 'intervalMs', label: 'Anzeigedauer', type: 'seconds', hint: 'Wie lange jeder Kanal gezeigt wird.' },
      { key: 'follow', label: 'Button-Text', type: 'text', hint: 'Text auf dem Follow-Button (z.B. „Folgen").' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'emojify', label: 'Emojify (Chat-Emojis)', desc: 'Jedes Emoji, das Zuschauer in den Chat schreiben, fliegt animiert über den Bildschirm.',
    w: 1080, h: 900, props: { style: 'float', max: 6, size: 52, accent: '#ff5436' },
    fields: [
      styleField([
        { value: 'float', label: 'Aufsteigen (mit Drift)' },
        { value: 'cross', label: 'Quer fliegen' },
        { value: 'fall', label: 'Herabregnen' },
      ]),
      { key: 'size', label: 'Größe (px)', type: 'number', hint: 'Wie groß die Emojis fliegen.' },
      { key: 'max', label: 'Max. pro Nachricht', type: 'number', hint: 'Wie viele Emojis aus EINER Chat-Nachricht fliegen (Spam-Schutz).' },
    ],
  },
  {
    type: 'gift-menu', label: 'Geschenk-Menü', desc: 'Die Preistafel deines Streams: zeigt, welches Geschenk was auslöst — entweder eins nach dem anderen groß eingeblendet oder als durchlaufendes Band. Mit echtem Gift-Bild und Coin-Preis. Kann die Einträge automatisch aus deinen Triggern lesen, dann pflegst du nichts doppelt.',
    w: 420, h: 520,
    props: { mode: 'rotation', items: '', tile: 'breit', banner: 'schimmer', source: 'liste', title: 'Geschenke & was sie auslösen', showTitle: true, showCoins: true, intervalMs: 6000, speed: 26, style: 'karte', timerStyle: 'balken', timerPlacement: 'prominent', accent: '#ff5e8a', theme: 'glas' },
    fields: [
      { key: 'mode', label: 'Darstellung', type: 'select', options: [
        { value: 'rotation', label: 'Eins nach dem anderen' },
        { value: 'leiste', label: 'Laufband' },
      ], hint: 'Eins nach dem anderen blendet jedes Geschenk groß ein — gut für schmale, hohe Ecken. Das Laufband lässt alle Einträge durchlaufen und braucht nur einen flachen Streifen.' },
      { key: 'tile', label: 'Kachelform im Laufband', type: 'select', showIf: (p) => p.mode === 'leiste', options: [
        { value: 'breit', label: 'Breit — Geschenk links, Name und Wirkung daneben' },
        { value: 'quadrat', label: 'Quadrat — kleine Vierecke, Preis in der Ecke (die meisten Einträge)' },
        { value: 'etikett', label: 'Etikett — Wirkung groß, Name und Preis auf dem Bild' },
        { value: 'ablage', label: 'Ablage — nur Geschenk und Preis, wie die TikTok-Geschenkablage' },
        { value: 'ueberlagert', label: 'Überlagert (Wucht) — kantige Arcade-Kachel, Wirkung in fetten Versalien, Auslöser mit Druckwelle' },
        { value: 'vitrine', label: 'Vitrine (edel) — schwarzer Schaukasten mit Goldlinie und Lichtkegel, Auslöser als weiches Aufleuchten' },
        { value: 'aufkleber', label: 'Aufkleber (verspielt) — ausgestanzter Sticker, leicht schief, Auslöser hüpft und wirft Konfetti' },
        { value: 'untertitel', label: 'Untertitel — farbige Bauchbinde unten, Geschenk ragt darüber' },
        { value: 'banderole', label: 'Banderole — schräges Band quer über dem Geschenk' },
      ], hint: 'Nur beim Laufband. Bei „Überlagert", „Untertitel" und „Banderole" liegt die Schrift ALS EBENE über dem Geschenkbild und darf es anschneiden — dadurch wird die Wirkung groß und ist auch auf dem Handy lesbar. „Ablage" zeigt bewusst NICHT, was das Geschenk auslöst.' },
      { key: 'banner', label: 'Hintergrund des Laufbands', type: 'select', showIf: (p) => p.mode === 'leiste', options: [
        { value: 'schimmer', label: 'Schimmer — ruhig, ein Lichtstreif wandert darüber' },
        { value: 'welle', label: 'Welle — Farbverlauf wandert langsam durch' },
        { value: 'streifen', label: 'Streifen — schräge Streifen laufen mit' },
        { value: 'aurora', label: 'Aurora — zwei weiche Farbwolken driften' },
      ], hint: 'Nur beim Laufband. Alle vier sind animiert und laufen dauerhaft — gerechnet wird nur mit Farbverläufen, das kostet auch im schwachen Browser von TikTok Live Studio kaum Leistung.' },
      { key: 'source', label: 'Woher kommen die Einträge', type: 'select', options: [
        { value: 'liste', label: 'Meine Liste unten' },
        { value: 'trigger', label: 'Automatisch aus meinen Triggern' },
      ], hint: 'Automatisch: die Tafel liest deine Geschenk-Trigger und bleibt von allein aktuell, wenn du dort etwas änderst.' },
      { key: 'items', label: 'Geschenke + was sie auslösen', type: 'gift-command-list', textPlaceholder: 'Was löst es aus?', hint: 'Pro Zeile ein Geschenk wählen und dazuschreiben, was es auslöst. Bild und Coin-Preis kommen automatisch dazu. Die Reihenfolge bestimmt, wie die Tafel durchwechselt. Minuten eintragen ⇒ Countdown läuft: dann läuft bei diesem Geschenk ein Countdown im Overlay. (Wird bei „Automatisch aus meinen Triggern" nicht benutzt.)' },
      { key: 'timerPlacement', label: 'Timer-Platzierung', type: 'select', options: [
        { value: 'prominent', label: 'Prominent — großer Countdown im Vordergrund' },
        { value: 'kompakt', label: 'Kompakt — kleines Ziffernblatt in der Ecke' },
      ], hint: 'Prominent übernimmt den getroffenen Eintrag komplett: große Zeit mittig, Bild abgedunkelt dahinter — gut, wenn die Challenge im Fokus stehen soll. Kompakt zeigt nur ein kleines Ziffernblatt in der Ecke bzw. im Laufband-Chip, der Rest bleibt wie gewohnt sichtbar.' },
      { key: 'timerStyle', label: 'Timer-Optik', type: 'select', options: [
        { value: 'einfach', label: 'Einfach — nur die Restzeit' },
        { value: 'balken', label: 'Balken — schrumpfender Streifen + Zeit' },
        { value: 'ring', label: 'Ring — Kreis, der sich leert' },
      ], hint: 'Wie der Countdown auf einem Geschenk mit Dauer angezeigt wird.' },
      // Stil (Sammelkarte/Preistafel/Leuchtreklame) nur im Rotations-Modus:
      // im Laufband bestimmt die Kachelform das Aussehen, „Stil" wäre dort
      // fast wirkungslos (Audit-Befund A2).
      { ...styleField([
        { value: 'karte', label: 'Sammelkarte — Innenrahmen, Hologramm-Glanz, geprägter Gold-Preis' },
        { value: 'tafel', label: 'Preistafel — Kreidetafel im Holzrahmen, Preis rechts wie auf der Speisekarte' },
        { value: 'neon', label: 'Leuchtreklame — doppelte Neonröhre mit glühender Schrift' },
      ]), showIf: (p) => (p.mode ?? 'rotation') === 'rotation' },
      { key: 'title', label: 'Überschrift', type: 'text' },
      { key: 'showTitle', label: 'Überschrift zeigen', type: 'boolean' },
      { key: 'showCoins', label: 'Coin-Preis zeigen', type: 'boolean' },
      { key: 'intervalMs', label: 'Wie lange ein Geschenk stehen bleibt', type: 'seconds', showIf: (p) => (p.mode ?? 'rotation') === 'rotation', hint: 'Wie lange jedes Geschenk groß eingeblendet bleibt.' },
      { key: 'speed', label: 'Tempo des Laufbands', type: 'number', showIf: (p) => p.mode === 'leiste', hint: 'Sekunden pro Durchlauf — größer = langsamer.' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'command-carousel', label: 'Befehl-Karussell', desc: 'Durchlaufende Sticker-Leiste, die Zuschauern zeigt, welches GESCHENK welche Aktion auslöst (TikTok-Sticker-Look mit Gift-Bildern).',
    w: 900, h: 90, props: { items: 'rose::!feuer | heart::Liebe | gg::GG', speed: 26, style: 'sticker', accent: '#ff5436', theme: 'glas' },
    fields: [
      { key: 'items', label: 'Geschenke + Text', type: 'gift-command-list', hint: 'Pro Zeile ein Geschenk wählen + den Text dazu (was es auslöst). Das echte Gift-Bild läuft mit durch.' },
      styleField([
        { value: 'sticker', label: 'Sticker (bunt, TikTok-Look)' },
        { value: 'glas', label: 'Glas' },
        { value: 'neon', label: 'Neon' },
      ]),
      { key: 'speed', label: 'Tempo (Sek/Runde)', type: 'number', hint: 'Kleiner = schneller.' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'gift-cannon', label: 'Geschenke-Kanone', desc: 'Bei Gifts fliegen die Profilbilder der Zuschauer (mit Gift-Icon) ins Bild und sammeln sich unten — Combos feuern mehrere Bälle.',
    w: 1080, h: 900, props: { style: 'cannon', position: 'left', minCoins: 0, maxBalls: 28, soundId: '' },
    fields: [
      styleField([
        { value: 'cannon', label: 'Kanone (schräg, mit Rohr)' },
        { value: 'fountain', label: 'Fontäne (gerade nach oben)' },
        { value: 'rain', label: 'Regen (von oben)' },
      ]),
      { key: 'position', label: 'Position', type: 'select', options: [
        { value: 'left', label: 'Unten links' },
        { value: 'center', label: 'Unten Mitte' },
        { value: 'right', label: 'Unten rechts' },
      ], hint: 'Wo die Kanone/Quelle steht (bei „Regen" egal).' },
      { key: 'minCoins', label: 'Mindest-Coins', type: 'number', hint: 'Erst ab diesem Gift-Wert auslösen (0 = immer).' },
      { key: 'maxBalls', label: 'Max. Bälle', type: 'number', hint: 'Wie viele Bälle gleichzeitig im Bild bleiben (TTLS-schonend).' },
      { key: 'soundId', label: 'Schuss-Sound', type: 'sound', hint: 'Spielt beim Abschuss über die App.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'gift-jar', label: 'Coin-Glas', desc: 'Behälter, der sich mit den Geschenken füllt — jedes Gift ein Ball mit Bild, größer bei mehr Coins. Als Glas, Herz, Pokal, Schatztruhe oder im TikFinity-Original-Look.',
    w: 440, h: 520, props: { target: 2000, label: '', shape: 'glas', showToast: true, accent: '#ffd23e' },
    fields: [
      { key: 'shape', label: 'Form', type: 'select', options: [
        { value: 'glas', label: '🫙 Bonbon-Glas (Standard)' },
        { value: 'tikfinity', label: '🫙 Mason-Glas (TikFinity-Original)' },
        { value: 'herz', label: '💜 Herz' },
        { value: 'pokal', label: '🏆 Pokal (Gold-Henkel)' },
        { value: 'truhe', label: '🪙 Schatztruhe' },
      ], hint: 'In welchen Behälter die Geschenke fallen.' },
      { key: 'target', label: 'Ziel (Coins)', type: 'number', hint: 'Bei diesem Wert ist der Behälter voll.' },
      { key: 'label', label: 'Eigener Titel', type: 'text', hint: 'Text über dem Glas, leer = „Coin-Glas".' },
      { key: 'showToast', label: 'Donation-Toasts', type: 'boolean', hint: 'Zeigt bei jedem Gift kurz „Name schickt Gift ×N" .' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'gift-counter', label: 'Geschenkzähler', desc: 'Zählt ein bestimmtes Gift (oder alle) Richtung Ziel — großes animiertes Gift-Icon, „aktuell / Ziel", Aktion bei Erreichen.',
    w: 340, h: 360, props: { style: 'glas', giftSlug: '', target: 15, label: 'Geschenk-Ziel', onReach: 'raise', accent: '#ffd23e', theme: 'glas' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas (Standard)' },
        { value: 'neon', label: '⚡ Neon (freistehend)' },
        { value: 'medaille', label: '🥇 Gold-Medaille' },
      ]),
      { key: 'giftSlug', label: 'Gift zählen', type: 'gift', hint: 'Welches Gift gezählt wird — durchsuchbar auswählen (leer = ALLE Gifts).' },
      { key: 'target', label: 'Ziel', type: 'number', hint: 'Wie viele bis zum Ziel.' },
      { key: 'onReach', label: 'Bei Zielerreichung', type: 'select', options: [
        { value: 'raise', label: 'Ziel erhöhen (weiterzählen)' },
        { value: 'reset', label: 'Zähler auf 0 zurück' },
        { value: 'keep', label: 'Nichts (drüber zählen)' },
      ] },
      { key: 'label', label: 'Titel', type: 'text', hint: 'Über dem Zähler, z.B. „Du bist gut genug!".' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'gift-fireworks', label: 'Gift-Feuerwerk', desc: 'Jedes Gift steigt als Rakete auf und explodiert — bei Combos (z.B. 10x Rose) fächert es in mehrere Raketen.',
    w: 900, h: 1200, props: { shape: 'kreis', minCoins: 0, maxRockets: 12, comboMode: 'fan', burstScale: 1.5, showName: true, soundId: 'botexe-boom.wav', whistleSoundId: 'botexe-pfeife.wav', accent: '#ff5436' },
    fields: [
      { key: 'shape', label: 'Burst-Form', type: 'select', options: [
        { value: 'kreis', label: '🎆 Kugel (Standard)' },
        { value: 'herz', label: '💜 Herz-Explosion' },
        { value: 'stern', label: '⭐ Stern-Explosion' },
        { value: 'spirale', label: '🌀 Spirale (Galaxie)' },
        { value: 'blume', label: '🌸 Blume (Blütenblätter)' },
      ], hint: 'In welcher Form die Rakete am Himmel explodiert.' },
      { key: 'minCoins', label: 'Erst ab … Coins', type: 'number', hint: 'Feuerwerk nur für Gifts ab diesem Wert. 0 = jedes.' },
      { key: 'showName', label: 'Name im Burst (freistehend)', type: 'boolean', hint: 'Zeigt den Namen des Schenkenden als leuchtenden Neon-Schriftzug im Explosionszentrum.' },
      ACCENT_FIELD,
      { key: 'comboMode', label: 'Bei Combos (z.B. 10x Rose)', type: 'select', options: [
        { value: 'fan', label: 'Auffächern — eine Rakete pro Gift' },
        { value: 'single', label: 'Eine große Rakete (Größe = Gesamtwert)' },
      ], hint: '„Auffächern": 10x Rose = 10er-Raketen-Volley. „Eine große": ein einzelner, großer Burst.' },
      { key: 'maxRockets', label: 'Max. Raketen pro Combo', type: 'number', hint: 'Obergrenze beim Auffächern — z.B. 150x Rose wird auf so viele Raketen gedeckelt (Default 12).' },
      { key: 'burstScale', label: 'Burst-Größe', type: 'select', options: [
        { value: '0.6', label: 'Klein' },
        { value: '1', label: 'Normal' },
        { value: '1.5', label: 'Groß' },
        { value: '2', label: 'Riesig' },
      ], hint: 'Skaliert die Größe jeder Explosion. Große Raketen brechen oben in bunte Verbund-Bursts.' },
      { key: 'whistleSoundId', label: 'Aufstiegs-Pfeife', type: 'sound', hint: 'Spielt, während die Rakete aufsteigt (Default: synthetisches Pfeifen).' },
      { key: 'soundId', label: 'Boom-Sound', type: 'sound', hint: 'Spielt bei der Explosion oben — getimt zur Animation (Default: synthetischer Boom).' },
    ],
  },
  {
    type: 'sport-ticker', label: 'Sport-Liveticker', desc: 'Aktuelle Fußballspiele (WM, Bundesliga, …) mit Wappen + Spielstand — aktualisiert live, blitzt bei jedem Tor auf.',
    w: 460, h: 320, props: { provider: 'openligadb', competition: 'bl1', title: 'Liveticker', view: 'matches', maxMatches: 5, tableRows: 8, slideSec: 8, team: '', refreshSec: 30, goalSoundId: 'botexe-gewinn.wav', goalBanner: true, goalText: 'GOOOAAALLL', accent: '#28e0c4' },
    fields: [
      { key: 'provider', label: 'Datenquelle', type: 'select', options: [
        { value: 'football-data', label: 'football-data.org (WM + Ligen, braucht Key)' },
        { value: 'openligadb', label: 'OpenLigaDB (deutsche Ligen, kein Key)' },
      ], hint: 'football-data deckt WM/CL/Top-Ligen ab (kostenloser Key in den Einstellungen → Sport). OpenLigaDB braucht keinen Key.' },
      { key: 'competition', label: 'Wettbewerb', type: 'text', hint: 'football-data: ID (WM=2000, Bundesliga=2002, Premier League=2021, CL=2001). OpenLigaDB: Kürzel (bl1, bl2, dfb).' },
      { key: 'view', label: 'Anzeige', type: 'select', options: [
        { value: 'matches', label: 'Nur Spiele' },
        { value: 'table', label: 'Nur Tabelle' },
        { value: 'both', label: 'Beides (Slider: Spiele ↔ Tabelle)' },
      ], hint: 'Spiele, die aktuelle Tabelle, oder beides abwechselnd als Slider.' },
      { key: 'team', label: 'Nur dieses Team', type: 'text', hint: 'Optional: nur Spiele dieses Teams zeigen (Name-Teil reicht, z.B. „Bayern"). In der Tabelle wird das Team hervorgehoben. Leer = alle.' },
      { key: 'title', label: 'Titel', type: 'text' },
      { key: 'maxMatches', label: 'Max. Spiele', type: 'number', hint: 'Wie viele Spiele gleichzeitig (Live zuerst). 1 = nur das wichtigste Spiel.' },
      { key: 'tableRows', label: 'Tabellen-Plätze', type: 'number', hint: 'Wie viele Tabellen-Plätze gezeigt werden (3–24).' },
      { key: 'slideSec', label: 'Slider-Wechsel (Sek.)', type: 'number', hint: 'Nur bei „Beides": Sekunden pro Seite, bevor zwischen Spiele/Tabelle gewechselt wird.' },
      { key: 'refreshSec', label: 'Aktualisieren alle … Sek.', type: 'number', hint: 'Mind. 15s. football-data Free erlaubt 10 Abrufe/Min.' },
      { key: 'goalSoundId', label: 'Tor-Sound', type: 'sound', hint: 'Spielt über die App, wenn ein Tor fällt.' },
      { key: 'goalBanner', label: 'Tor-Feier (freistehend)', type: 'boolean', hint: 'Bei einem Tor läuft ein großer Text quer durch + das ganze Widget leuchtet grün.' },
      { key: 'goalText', label: 'Tor-Text', type: 'text', hint: 'Was bei einem Tor durchläuft (Standard: GOOOAAALLL).' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'gift-feed', label: 'Gift-Feed', desc: 'Ticker der letzten Gifts mit Gift-Bildern.',
    w: 380, h: 240, props: { style: 'glas', max: 5, ttlMs: 25000, fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas-Zeilen (Standard)' },
        { value: 'neon', label: 'Neon (freistehend)' },
        { value: 'pills', label: 'Bunte Pillen' },
      ]),
      { key: 'max', label: 'Max. Einträge', type: 'number', hint: 'So viele letzte Gifts bleiben sichtbar.' },
      { key: 'ttlMs', label: 'Verschwinden nach', type: 'seconds', hint: 'Wie lange ein Gift im Ticker bleibt.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'stat-chips', label: 'Live-Zähler', desc: 'Kompakte Chips für Viewer, Likes, Follower & Co. — mit Puls bei jeder Änderung.',
    w: 540, h: 60, props: { style: 'glas', metrics: 'viewers,likes,follows', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas-Chips (Standard)' },
        { value: 'badges', label: 'Badges (schräg, satt)' },
        { value: 'minimal', label: 'Minimal (ohne Hintergrund)' },
      ]),
      { key: 'metrics', label: 'Welche Zähler', type: 'text', hint: 'Kommagetrennt, Reihenfolge zählt: viewers, uniqueViewers (gesamt dabei), likes, follows, coins, gifts, shares.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'spotify-now-playing', label: 'Spotify — Läuft gerade', desc: 'Zeigt den aktuell laufenden Spotify-Song (Cover, Titel, Künstler, Fortschritt). Braucht eine verbundene Spotify-App (Einstellungen → Spotify).',
    w: 560, h: 140, props: { accent: '#1db954', theme: 'glas' },
    fields: [ ACCENT_FIELD, THEME_FIELD ],
  },
  {
    type: 'chat-box', label: 'Chat-Box', desc: 'Der Live-Chat direkt im Overlay.',
    w: 420, h: 360, props: { style: 'glas', max: 8, hideAfterMs: 0, accent: '#ff5436', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      styleField([
        { value: 'glas', label: 'Glas-Bubbles (Standard)' },
        { value: 'clean', label: 'Clean (nur Text, Gamer-Look)' },
        { value: 'sticker', label: 'Sticker (helle Comic-Bubbles)' },
      ]),
      { key: 'max', label: 'Max. Nachrichten', type: 'number', hint: 'So viele Chat-Zeilen bleiben gleichzeitig sichtbar.' },
      { key: 'hideAfterMs', label: 'Ausblenden nach', type: 'seconds', hint: 'Einzelne Nachrichten verschwinden danach. 0 = bleiben.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
];
