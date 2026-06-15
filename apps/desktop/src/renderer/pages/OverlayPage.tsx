// OverlayPage — den EINEN Overlay-Screen zusammenbauen.
// Canvas = Hochformat (TikTok-Default) oder Querformat, skaliert; Layer direkt
// am Objekt draggen/resizen, Eigenschaften rechts im Panel. TikTok-SafeZones
// werden als Guides eingeblendet (wo Chat/Buttons der TikTok-UI liegen).
// Speichern validiert (ajv) und pusht live.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { toast } from '../components/ToastHost';

interface PropField {
  key: string;
  label: string;
  /** seconds = im UI in Sekunden, gespeichert als ms · boolean = Schalter
   *  media = visueller Bild/Video-Picker mit Import · sound = Sound-Dropdown
   *  (abgespielt über die App, nie im Overlay) */
  type: 'number' | 'text' | 'select' | 'color' | 'boolean' | 'seconds' | 'media' | 'sound' | 'gift-list';
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

// Pro-Widget-Typografie (B2.1): Schriftart + Größe + Textfarbe. Wirkt über
// CSS-Vars/Zoom, die die Runtime auf den Layer-Root setzt.
const FONT_FIELD: PropField = {
  key: 'fontFamily', label: 'Schriftart', type: 'select',
  options: [
    { value: '', label: 'Standard (Studio-Mix)' },
    { value: 'lilita', label: 'Lilita One (verspielt, fett)' },
    { value: 'baloo', label: 'Baloo 2 (rund, kräftig)' },
    { value: 'sans', label: 'Sans (schlicht)' },
    { value: 'rounded', label: 'Rounded' },
    { value: 'condensed', label: 'Schmal (Condensed)' },
    { value: 'serif', label: 'Serif (elegant)' },
    { value: 'mono', label: 'Mono' },
  ],
  hint: 'Schriftart dieses Widgets (nur lokale/System-Fonts).',
};
const SIZE_FIELD: PropField = {
  key: 'fontScale', label: 'Größe', type: 'select',
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
  key: 'theme', label: 'Design', type: 'select',
  options: [
    { value: 'glas', label: 'Glas (Standard)' },
    { value: 'neon', label: 'Neon (Cyberpunk)' },
    { value: 'synthwave', label: 'Synthwave (Retro-Pink)' },
    { value: 'arcade', label: 'Arcade (fett, TikFinity-Look)' },
    { value: 'luxus', label: 'Luxus (Schwarz/Gold, Serif)' },
    { value: 'midnight', label: 'Midnight (Tiefblau)' },
    { value: 'inferno', label: 'Inferno (Glut/Rot)' },
    { value: 'mint', label: 'Mint (Frisch)' },
    { value: 'minimal', label: 'Minimal (clean)' },
    { value: 'vapor', label: 'Vapor (Pastell-Lila)' },
    { value: 'holo', label: 'Holo (Iridescent)' },
    { value: 'royal', label: 'Royal (Tiefviolett/Gold)' },
    { value: 'forest', label: 'Forest (Wald-Grün)' },
    { value: 'mono', label: 'Mono (Schwarz/Weiß, Terminal)' },
    { value: 'aurora', label: 'Aurora (Polarlicht)' },
    { value: 'paper', label: 'Paper (Hell, Papier) ☀️' },
    { value: 'bubblegum', label: 'Bubblegum (Hell, Pink) ☀️' },
  ],
  hint: 'Edler Komplett-Look des Widgets — färbt Panel, Schatten, Radius, Schrift. Mit deiner Akzentfarbe kombinierbar.',
};
/** Volles Typo-Set (Design + Schriftart + Größe + Farbe) — für reine Text-Widgets. */
const STYLE_FIELDS: PropField[] = [THEME_FIELD, FONT_FIELD, SIZE_FIELD, TEXTCOLOR_FIELD];

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
    w: 760, h: 380, props: { minCoins: 0, durationMs: 5000, soundId: 'botexe-alert.wav' },
    fields: [
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
    type: 'hype-train', label: 'Hype-Train', desc: 'Geschenke & Likes treiben einen Zug an, der in Stufen aufsteigt (Twitch-Style) — füllt sich live, verlängert den Timer, eskaliert die Farbe, Sound beim Level-Up.',
    w: 560, h: 150, props: { coinsPerPoint: 1, likesPerPoint: 10, levelStep: 200, maxLevels: 5, windowSec: 30, title: 'Hype-Train', levelSoundId: 'botexe-gewinn.wav', accent: '#ff4d2e' },
    fields: [
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
    type: 'subathon', label: 'Subathon-Timer', desc: 'Countdown, den Geschenke & Follower VERLÄNGERN — hält den Stream am Laufen (Twitch-Klassiker). „+Xs" ploppt bei jedem Zuwachs auf.',
    w: 440, h: 200, props: { startMinutes: 30, secondsPerCoin: 2, secondsPerFollow: 30, secondsPerLike: 0, maxMinutes: 600, title: 'Subathon', addSoundId: 'botexe-gewinn.wav', accent: '#28e0c4' },
    fields: [
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
    w: 560, h: 80, props: { metric: 'coins', target: 1000, label: '', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'metric', label: 'Metrik', type: 'select', options: [
        { value: 'coins', label: 'Coins' }, { value: 'likes', label: 'Likes' },
        { value: 'follows', label: 'Follower' }, { value: 'gifts', label: 'Gifts' },
      ] },
      { key: 'target', label: 'Ziel', type: 'number', hint: 'Bei diesem Wert ist der Balken voll.' },
      { key: 'label', label: 'Eigener Titel', type: 'text', hint: 'Leer = automatisch (z.B. „Coin-Goal").' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'milestone-confetti', label: 'Meilenstein-Konfetti', desc: 'Feiert erreichte Marken (z.B. alle 100 Follower) mit Konfetti-Burst + Glow-Banner.',
    w: 520, h: 320, props: { metric: 'follows', step: 100, milestones: '', label: '', message: 'Meilenstein! 🎉', soundId: 'botexe-gewinn.wav', accent: '#ffd23e', theme: 'glas' },
    fields: [
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
    type: 'leaderboard', label: 'Top Gifter', desc: 'Die größten Gift-Supporter — TikFinity-Look (Avatare + Kronen) oder Box.',
    w: 760, h: 180, props: { source: 'gifts', limit: 5, title: '', style: 'arcade', fontFamily: '', fontScale: 1, textColor: '' },
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
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'leaderboard', label: 'Like-Liste', desc: 'Wer am fleißigsten liked — TikFinity-Look (Avatare + Kronen) oder Box.',
    w: 760, h: 180, props: { source: 'likes', limit: 5, title: '', style: 'arcade', fontFamily: '', fontScale: 1, textColor: '' },
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
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'top-rotator', label: 'Bestenliste (Wechsel)', desc: 'Zeigt abwechselnd Top Gifter, Top Likes, Top Punkte — smooth übergeblendet, untereinander. Ideal fürs Hochformat.',
    w: 460, h: 360, props: { sources: 'gifts,likes', interval: 5, limit: 5, accent: '', showPic: true, fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
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
    w: 360, h: 300, props: { source: 'points', limit: 5, title: '', accent: '#7c5cff', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'limit', label: 'Plätze', type: 'number', hint: 'Wie viele Top-Supporter (1–10).' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Leer = automatisch („Top Punkte").' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'countdown', label: 'Countdown', desc: 'Zähler nach unten — z.B. „Stream startet in" oder Pausen-Timer.',
    w: 460, h: 200, props: { minutes: 5, label: 'Countdown', doneText: 'LOS!', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
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
    w: 320, h: 160, props: { label: 'Tode', start: 0, accent: '#ff5436', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'label', label: 'Beschriftung', type: 'text', hint: 'Was gezählt wird, z.B. „Tode", „Wins", „Schreie".' },
      { key: 'start', label: 'Startwert', type: 'number', hint: 'Nur beim allerersten Laden — danach merkt sich der Counter seinen Stand.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'activity-feed', label: 'Activity-Feed', desc: 'Alle Events gemischt (Follow, Sub, Share, Gift) als Live-Ticker.',
    w: 420, h: 320, props: { max: 6, ttlMs: 60000, fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'max', label: 'Max. Einträge', type: 'number', hint: 'So viele Events bleiben gleichzeitig sichtbar.' },
      { key: 'ttlMs', label: 'Verschwinden nach', type: 'seconds', hint: 'Wie lange ein Eintrag stehen bleibt (0 = nie).' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'wheel', label: 'Glücksrad', desc: 'Dreht bei einer Trigger-Aktion (z.B. !spin gegen Punkte) und zeigt den Gewinn. Preise frei wählbar.',
    w: 480, h: 560, props: { segments: '100 Coins|Nichts|VIP-Tag|Shoutout|50 Punkte|Joker|Doppelt|Pech', spinMs: 5000, accent: '#ff5436', autoShow: true, showTrigger: true, title: 'Glücksrad', spinSoundId: 'botexe-rad.wav', resultSoundId: 'botexe-gewinn.wav' },
    fields: [
      { key: 'segments', label: 'Preise', type: 'text', hint: 'Mit | trennen — jeder Eintrag ein Segment, z.B. „100 Coins|Nichts|VIP".' },
      { key: 'title', label: 'Titel', type: 'text', hint: 'Überschrift über dem Rad.' },
      { key: 'spinMs', label: 'Drehdauer', type: 'seconds', hint: 'Wie lange das Rad dreht, bis es stoppt.' },
      { key: 'autoShow', label: 'Auto ein-/ausblenden', type: 'boolean', hint: 'An: Rad erscheint beim Spin und verschwindet nach dem Ergebnis (deckt sonst nichts zu). Aus: dauerhaft sichtbar.' },
      { key: 'showTrigger', label: 'Dreher-Banner', type: 'boolean', hint: 'Zeigt beim Start kurz, wer (womit) gedreht hat — TikFinity-Style. Lichter-Kette am Rand ist immer an.' },
      { key: 'spinSoundId', label: 'Dreh-Sound', type: 'sound', hint: 'Spielt beim Start des Spins über die App.' },
      { key: 'resultSoundId', label: 'Gewinn-Sound', type: 'sound', hint: 'Spielt, wenn das Rad stehen bleibt.' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'giveaway', label: 'Giveaway / Verlosung', desc: 'Zuschauer treten per !join bei (in Einstellungen → Giveaway aktivieren); auf der Live-Seite „Gewinner ziehen" → das Widget animiert die Ziehung und enthüllt den Gewinner.',
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
    w: 620, h: 220, props: { style: 'tug', teamA: 'Team Rosa', teamB: 'Team Blau', giftsA: 'rose', giftsB: 'heart', metric: 'coins', durationSec: 60, autoNewRound: true, winSoundId: 'botexe-gewinn.wav', accent: '#ff5436', theme: 'glas' },
    fields: [
      styleField([
        { value: 'tug', label: 'Tauziehen (Balken)' },
        { value: 'versus', label: 'Versus (zwei Säulen)' },
      ]),
      { key: 'teamA', label: 'Name Team A', type: 'text' },
      { key: 'teamB', label: 'Name Team B', type: 'text' },
      { key: 'giftsA', label: 'Gifts Team A', type: 'text', hint: 'Gift-Namen für Team A, kommagetrennt (z.B. „rose, finger heart"). Leer + Team B leer = Auto-Split (günstig=A, teuer=B).' },
      { key: 'giftsB', label: 'Gifts Team B', type: 'text', hint: 'Gift-Namen für Team B, kommagetrennt.' },
      { key: 'metric', label: 'Wertung', type: 'select', options: [
        { value: 'coins', label: 'Coins (Wert der Gifts)' },
        { value: 'count', label: 'Anzahl (jedes Gift = 1)' },
      ], hint: 'Womit gezogen wird.' },
      { key: 'durationSec', label: 'Rundenlänge (Sek.)', type: 'number', hint: 'Wie lange eine Schlacht dauert.' },
      { key: 'autoNewRound', label: 'Auto neue Runde', type: 'boolean', hint: 'Nach dem Sieger automatisch eine frische Runde starten.' },
      { key: 'winSoundId', label: 'Sieger-Sound', type: 'sound', hint: 'Spielt über die App, wenn ein Team gewinnt.' },
      ACCENT_FIELD, THEME_FIELD,
    ],
  },
  {
    type: 'live-poll', label: 'Live-Umfrage', desc: 'Frage + 2–4 Optionen. Zuschauer stimmen per Chat ab (Zahl tippen, z.B. „1") — eine Stimme pro Person. Balken füllen sich live, am Ende Sieger-Reveal. (Zwei Designs)',
    w: 480, h: 280, props: { style: 'bars', question: 'Was sollen wir spielen?', options: 'Fortnite, Just Chatting, Zuschauer-Games', durationSec: 45, autoNewRound: false, revealSoundId: 'botexe-gewinn.wav', accent: '#7c5cff', theme: 'glas' },
    fields: [
      styleField([
        { value: 'bars', label: 'Balken (untereinander)' },
        { value: 'cards', label: 'Karten (nebeneinander)' },
      ]),
      { key: 'question', label: 'Frage', type: 'text' },
      { key: 'options', label: 'Optionen', type: 'text', hint: '2–4 Optionen, kommagetrennt. Zuschauer tippen die Zahl (1, 2, …) in den Chat.' },
      { key: 'durationSec', label: 'Abstimmdauer (Sek.)', type: 'number', hint: 'Wie lange abgestimmt werden kann, bis der Sieger enthüllt wird.' },
      { key: 'autoNewRound', label: 'Auto neue Runde', type: 'boolean', hint: 'Nach dem Reveal automatisch wieder offen für Stimmen.' },
      { key: 'revealSoundId', label: 'Reveal-Sound', type: 'sound', hint: 'Spielt über die App beim Enthüllen des Siegers.' },
      ACCENT_FIELD, THEME_FIELD,
    ],
  },
  {
    type: 'top-gift', label: 'Top-Gift', desc: 'Highlight des größten Einzel-Gifts der Session — Gift-Bild, Spender-Avatar, Bounce bei Rekord.',
    w: 320, h: 320, props: { title: '', style: 'glas', accent: '#ffd23e', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'title', label: 'Titel', type: 'text', hint: 'Überschrift, leer = „Größtes Gift".' },
      styleField([{ value: 'glas', label: 'Glas (Panel)' }, { value: 'sticker', label: 'Sticker (freistehend, TikFinity-Look)' }]),
      ACCENT_FIELD, ...STYLE_FIELDS,
    ],
  },
  {
    type: 'top-streak', label: 'Top-Streak', desc: 'Höchste Combo der Session (z.B. „50x Rose") — Gift-Bild, Spender-Avatar und die Streak-Zahl groß.',
    w: 340, h: 320, props: { title: '', style: 'glas', accent: '#ff5e8a', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'title', label: 'Titel', type: 'text', hint: 'Überschrift, leer = „Höchste Combo".' },
      styleField([{ value: 'glas', label: 'Glas (Panel)' }, { value: 'sticker', label: 'Sticker (freistehend, TikFinity-Look)' }]),
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
    type: 'heart-rain', label: 'Like-Herzen', desc: 'Likes als Herzen — Fontäne (TikFinity-Style, viele Mini-Herzen aus einer Quelle) oder verteilter Regen.',
    w: 1080, h: 900, props: { emojis: '❤️,💖,💕,✨,🔥', maxPerBurst: 8, mode: 'fountain', source: 'center' },
    fields: [
      { key: 'mode', label: 'Stil', type: 'select', options: [
        { value: 'fountain', label: 'Fontäne (Mini-Herzen, TikFinity-Style)' },
        { value: 'rain', label: 'Regen (große Herzen, verteilt)' },
      ], hint: 'Fontäne: viele kleine Herzen aus einer Quelle. Regen: große Herzen über die ganze Breite.' },
      { key: 'source', label: 'Fontänen-Quelle', type: 'select', options: [
        { value: 'center', label: 'Unten Mitte' },
        { value: 'left', label: 'Unten links' },
        { value: 'right', label: 'Unten rechts (wie Like-Button)' },
      ], hint: 'Wo die Fontäne entspringt (nur im Fontänen-Stil).' },
      { key: 'emojis', label: 'Emojis', type: 'text', hint: 'Eigene Symbole, kommagetrennt (z.B. ❤️,💖,🔥). Leer/Default = edle SVG-Herzen.' },
      { key: 'maxPerBurst', label: 'Max. pro Like-Schub', type: 'number', hint: 'Begrenzt, wie viele bei einer Like-Welle gleichzeitig kommen.' },
    ],
  },
  {
    type: 'text-ticker', label: 'Lauftext-Banner', desc: 'Scrollender Streifen für Socials/Ansagen — dünn, deckt kaum zu. 3 Stile.',
    w: 760, h: 56, props: { messages: 'Folge mir! | Discord in der Bio | Danke fürs Zuschauen ❤️', speed: 18, style: 'glas', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'messages', label: 'Nachrichten', type: 'text', hint: 'Mehrere mit | trennen, z.B. „Folge mir! | Discord in der Bio".' },
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
        { value: 'pill', label: 'Pille (hell, TikFinity-Look)' },
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
    type: 'command-carousel', label: 'Befehl-Karussell', desc: 'Durchlaufende Sticker-Leiste, die Zuschauern zeigt, welche Befehle/Sounds es gibt (TikTok-Sticker-Look).',
    w: 900, h: 90, props: { items: '🔥 !feuer | 🎵 Musik | 💀 Tod | 🎉 Party | ❤️ Liebe', speed: 26, style: 'sticker', accent: '#ff5436', theme: 'glas' },
    fields: [
      { key: 'items', label: 'Einträge', type: 'text', hint: 'Mit | trennen. Führendes Emoji wird zur Kachel, z.B. „🔥 !feuer | 🎵 Musik".' },
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
    ],
  },
  {
    type: 'gift-jar', label: 'Coin-Glas', desc: 'Bonbon-Glas, das sich mit den Geschenken füllt — jedes Gift ein Ball mit Bild, größer bei mehr Coins.',
    w: 440, h: 520, props: { target: 2000, label: '', showToast: true, accent: '#ffd23e' },
    fields: [
      { key: 'target', label: 'Ziel (Coins)', type: 'number', hint: 'Bei diesem Wert ist das Glas voll.' },
      { key: 'label', label: 'Eigener Titel', type: 'text', hint: 'Text über dem Glas, leer = „Coin-Glas".' },
      { key: 'showToast', label: 'Donation-Toasts', type: 'boolean', hint: 'Zeigt bei jedem Gift kurz „Name schickt Gift ×N" (TikFinity-Style).' },
      ACCENT_FIELD,
    ],
  },
  {
    type: 'gift-counter', label: 'Geschenkzähler', desc: 'Zählt ein bestimmtes Gift (oder alle) Richtung Ziel — großes animiertes Gift-Icon, „aktuell / Ziel", Aktion bei Erreichen.',
    w: 340, h: 360, props: { giftSlug: '', target: 15, label: 'Geschenk-Ziel', onReach: 'raise', accent: '#ffd23e', theme: 'glas' },
    fields: [
      { key: 'giftSlug', label: 'Gift (Slug)', type: 'text', hint: 'Welches Gift gezählt wird (leer = ALLE Gifts). Den genauen Namen siehst du in der Geschenke-Galerie, z.B. „Rose".' },
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
    w: 900, h: 1200, props: { minCoins: 0, maxRockets: 12, comboMode: 'fan', burstScale: 1.5, showName: true, soundId: 'botexe-boom.wav', whistleSoundId: 'botexe-pfeife.wav', accent: '#ff5436' },
    fields: [
      { key: 'minCoins', label: 'Erst ab … Coins', type: 'number', hint: 'Feuerwerk nur für Gifts ab diesem Wert. 0 = jedes.' },
      { key: 'showName', label: 'Name im Burst (TikFinity-Style)', type: 'boolean', hint: 'Zeigt den Namen des Schenkenden als leuchtenden Neon-Schriftzug im Explosionszentrum.' },
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
    w: 460, h: 320, props: { provider: 'football-data', competition: '2000', title: 'Liveticker', maxMatches: 5, refreshSec: 30, goalSoundId: 'botexe-gewinn.wav', goalBanner: true, goalText: 'GOOOAAALLL', accent: '#28e0c4' },
    fields: [
      { key: 'provider', label: 'Datenquelle', type: 'select', options: [
        { value: 'football-data', label: 'football-data.org (WM + Ligen, braucht Key)' },
        { value: 'openligadb', label: 'OpenLigaDB (deutsche Ligen, kein Key)' },
      ], hint: 'football-data deckt WM/CL/Top-Ligen ab (kostenloser Key in den Einstellungen → Sport). OpenLigaDB braucht keinen Key.' },
      { key: 'competition', label: 'Wettbewerb', type: 'text', hint: 'football-data: ID (WM=2000, Bundesliga=2002, Premier League=2021, CL=2001). OpenLigaDB: Kürzel (bl1, bl2, dfb).' },
      { key: 'title', label: 'Titel', type: 'text' },
      { key: 'maxMatches', label: 'Max. Spiele', type: 'number', hint: 'Wie viele Spiele gleichzeitig (Live zuerst).' },
      { key: 'refreshSec', label: 'Aktualisieren alle … Sek.', type: 'number', hint: 'Mind. 15s. football-data Free erlaubt 10 Abrufe/Min.' },
      { key: 'goalSoundId', label: 'Tor-Sound', type: 'sound', hint: 'Spielt über die App, wenn ein Tor fällt.' },
      { key: 'goalBanner', label: 'Tor-Feier (TikFinity-Style)', type: 'boolean', hint: 'Bei einem Tor läuft ein großer Text quer durch + das ganze Widget leuchtet grün.' },
      { key: 'goalText', label: 'Tor-Text', type: 'text', hint: 'Was bei einem Tor durchläuft (Standard: GOOOAAALLL).' },
      ACCENT_FIELD,
      THEME_FIELD,
    ],
  },
  {
    type: 'gift-feed', label: 'Gift-Feed', desc: 'Ticker der letzten Gifts mit Gift-Bildern.',
    w: 380, h: 240, props: { max: 5, ttlMs: 25000, fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'max', label: 'Max. Einträge', type: 'number', hint: 'So viele letzte Gifts bleiben sichtbar.' },
      { key: 'ttlMs', label: 'Verschwinden nach', type: 'seconds', hint: 'Wie lange ein Gift im Ticker bleibt.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'stat-chips', label: 'Live-Zähler', desc: 'Kompakte Chips für Viewer, Likes, Follower & Co. — mit Puls bei jeder Änderung.',
    w: 540, h: 60, props: { metrics: 'viewers,likes,follows', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'metrics', label: 'Welche Zähler', type: 'text', hint: 'Kommagetrennt, Reihenfolge zählt: viewers, likes, follows, coins, gifts, shares.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
  {
    type: 'chat-box', label: 'Chat-Box', desc: 'Der Live-Chat direkt im Overlay.',
    w: 420, h: 360, props: { max: 8, hideAfterMs: 0, accent: '#ff5436', fontFamily: '', fontScale: 1, textColor: '' },
    fields: [
      { key: 'max', label: 'Max. Nachrichten', type: 'number', hint: 'So viele Chat-Zeilen bleiben gleichzeitig sichtbar.' },
      { key: 'hideAfterMs', label: 'Ausblenden nach', type: 'seconds', hint: 'Einzelne Nachrichten verschwinden danach. 0 = bleiben.' },
      ACCENT_FIELD,
      ...STYLE_FIELDS,
    ],
  },
];

// Palette-Kategorien — gruppieren die lange Widget-Liste (Feedback Bild 1/2:
// „zu unübersichtlich"). Mapping per Typ, damit die Einträge oben unberührt bleiben.
const PALETTE_CATEGORIES: { id: string; label: string }[] = [
  { id: 'alerts', label: 'Alerts' },
  { id: 'spiele', label: 'Spiele' },
  { id: 'gifts', label: 'Gifts & Ziele' },
  { id: 'listen', label: 'Listen & Chat' },
  { id: 'stats', label: 'Stats & Zähler' },
  { id: 'deko', label: 'Ambient & Deko' },
  { id: 'media', label: 'Media' },
];
const CATEGORY_OF: Record<string, string> = {
  'gift-alert': 'alerts', 'follow-alert': 'alerts', 'gift-fireworks': 'alerts',
  bingo: 'spiele', 'guess-number': 'spiele', wheel: 'spiele', giveaway: 'spiele', 'gift-battle': 'spiele', 'live-poll': 'spiele',
  'gift-jar': 'gifts', 'gift-counter': 'gifts', 'goal-bar': 'gifts', 'top-gift': 'gifts', 'top-streak': 'gifts', countdown: 'gifts', 'hype-train': 'gifts', subathon: 'gifts', 'milestone-confetti': 'gifts',
  'gift-cannon': 'alerts',
  'gift-feed': 'listen', 'chat-box': 'listen', 'activity-feed': 'listen', leaderboard: 'listen', 'points-board': 'listen', 'top-rotator': 'listen', 'sport-ticker': 'listen',
  'stat-chips': 'stats', counter: 'stats',
  'heart-rain': 'deko', 'text-ticker': 'deko', 'social-rotator': 'deko', emojify: 'deko', 'command-carousel': 'deko',
  media: 'media',
};

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
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [hoveredId, setHoveredId] = useState<string | null>(null);
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

  const refreshMedia = useCallback(async () => {
    setMediaList((await window.studio.listMedia()) as MediaItem[]);
  }, []);
  useEffect(() => { void refreshMedia(); }, [refreshMedia]);
  useEffect(() => {
    void window.studio.listSounds().then((s: { id: string; filename: string }[]) => setSoundList(s));
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

  // TikTok-Live-Studio-Link: Domain-Form (TTLS lehnt IP-Links ab). Wenn die
  // Domain lokal noch nicht auflöst (Router-DNS-Schutz), auf das einmalige
  // Setup in den Einstellungen hinweisen.
  const copyTtlsLink = async (id: string) => {
    const info = (await window.studio.getTtlsLink(id)) as { url: string; ready: boolean };
    await navigator.clipboard.writeText(info.url);
    if (info.ready) {
      toast('success', 'TikTok-Studio-Link kopiert — als Link-Quelle einfügen.');
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
      {/* Widget-Palette — nach Kategorien gruppiert + Suche (übersichtlicher) */}
      <aside className="overflow-y-auto border-r border-studio-border bg-studio-panel p-3">
        <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.3em] text-studio-muted">Widgets</h2>
        <input
          value={paletteQuery}
          onChange={(e) => setPaletteQuery(e.target.value)}
          placeholder="Widget suchen…"
          className="bx-input mb-3 w-full text-xs"
        />
        {(() => {
          const q = paletteQuery.trim().toLowerCase();
          const match = (w: (typeof WIDGET_TYPES)[number]) =>
            !q || w.label.toLowerCase().includes(q) || w.desc.toLowerCase().includes(q);
          return (
            <div className="flex flex-col gap-3">
              {PALETTE_CATEGORIES.map((cat) => {
                const items = WIDGET_TYPES.filter((w) => (CATEGORY_OF[w.type] ?? 'deko') === cat.id && match(w));
                if (items.length === 0) return null;
                const open = q !== '' || !collapsedCats.has(cat.id); // bei Suche immer offen
                return (
                  <div key={cat.id}>
                    <button
                      onClick={() => setCollapsedCats((prev) => {
                        const next = new Set(prev);
                        next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                        return next;
                      })}
                      className="mb-1.5 flex w-full items-center justify-between px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-studio-muted hover:text-studio-fg"
                    >
                      <span>{cat.label}</span>
                      <span className="text-studio-muted/60">{open ? '−' : `+${items.length}`}</span>
                    </button>
                    {open && (
                      <div className="flex flex-col gap-2">
                        {items.map((w) => (
                          <button
                            key={w.label}
                            onClick={() => addWidget(w)}
                            className="clip-slant group rounded-lg border border-studio-border bg-studio-raised p-3 text-left transition-colors hover:border-studio-accent/60"
                          >
                            <div className="text-xs font-bold group-hover:text-studio-accent">{w.label}</div>
                            <div className="mt-0.5 text-[10px] leading-snug text-studio-muted">{w.desc}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
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
                  {isPortraitP ? <Smartphone size={13} /> : <Monitor size={13} />}
                  <span className="font-bold">{p.name}</span>
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
                  active ? 'bg-studio-accent text-black' : 'bg-studio-raised text-studio-muted hover:text-studio-text'
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
                src={previewUrl}
                title="Live-Vorschau"
                className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
                style={{ width: canvasW, height: canvasH, transform: `scale(${scale})` }}
              />
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
              const label =
                layer.widgetType === 'leaderboard' && layer.props?.source === 'likes'
                  ? 'Like-Liste'
                  : (WIDGET_TYPES.find((w) => w.type === layer.widgetType)?.label ?? layer.widgetType);
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
                    className="bx-input mt-1 font-mono"
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

                    // Gift-Liste = visuelle Mehrfach-Gift-Auswahl (z.B. Bingo-Felder)
                    if (field.type === 'gift-list') {
                      return (
                        <div key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          {field.label}
                          <GiftListEditor value={String(value)} onChange={(v) => setProp(v)} />
                          {field.hint && <p className="mt-1 normal-case tracking-normal text-studio-muted/70">{field.hint}</p>}
                        </div>
                      );
                    }

                    // Media = visueller Bild/Video-Picker mit Import
                    if (field.type === 'media') {
                      return (
                        <div key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          {field.label}
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
                            <button onClick={() => setProp('')} className="mt-1 text-[9px] normal-case tracking-normal text-studio-muted hover:text-studio-accent">
                              Auswahl entfernen
                            </button>
                          ) : null}
                          {field.hint && <span className="mt-1 block text-[9px] normal-case tracking-normal text-studio-muted/70">{field.hint}</span>}
                        </div>
                      );
                    }

                    // Sound = Dropdown der App-Sounds (Wiedergabe über die App)
                    if (field.type === 'sound') {
                      return (
                        <label key={field.key} className="text-[10px] uppercase tracking-widest text-studio-muted">
                          {field.label}
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
                          {field.hint && <span className="mt-0.5 block text-[9px] normal-case tracking-normal text-studio-muted/70">{field.hint}</span>}
                          {soundList.length === 0 && (
                            <span className="mt-0.5 block text-[9px] normal-case tracking-normal text-studio-gold">
                              Noch keine Sounds — unter „Sounds" importieren (MyInstants-Suche!).
                            </span>
                          )}
                        </label>
                      );
                    }

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
