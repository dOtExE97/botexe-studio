// befehl-variablen.ts — Platzhalter für Chat-Befehls-Antworten, die NICHT aus
// dem Ereignis selbst kommen: Musik, Laufzeit, Orakel-Kiste, Follower-Ziel,
// Bestenliste, Links. Die App sammelt die Werte (BefehlsWerte), diese Datei
// setzt sie nur ein — rein, ohne IO, darum hier testbar.
//
// {user} {text} {args} {gift} … füllt danach wie bisher renderSpeakTemplate()
// (der Sprechweg macht {user} dort aussprechbar). Darum lässt diese Funktion
// alle Ereignis-Platzhalter unberührt.

/** Twitch-Affiliate: 50 Follower (die übrigen Bedingungen zählt Twitch selbst). */
export const AFFILIATE_ZIEL = 50;

export const KEINE_KISTE_TEXT = '??? (erst folgen, dann würfelt das Orakel deine Kiste)';
export const KEINE_MUSIK_TEXT = 'Gerade läuft keine Musik';
export const LINK_FEHLT_TEXT = '(Link in den Einstellungen eintragen)';
const KEINE_LAUFZEIT_TEXT = 'kurzem (die App ist gerade mit keinem Stream verbunden)';
const KEIN_TOP_TEXT = 'noch niemand — sei die/der Erste!';
const FOLLOWER_UNBEKANNT = '?';

export interface BefehlsWerte {
  /** Spotify: aktueller Titel (nur wenn wirklich etwas läuft) bzw. beim
   *  Song-Wunsch der gefundene Titel. */
  song?: { title: string; artist: string } | null;
  /** Wie lange der Stream schon läuft (ms) — null: nicht verbunden. */
  uptimeMs?: number | null;
  /** Kiste des Aufrufers (Piraten-Orakel) — null: hat (noch) keine. */
  kiste?: number | null;
  /** Follower-Stand des Kanals (Twitch follower_stand) — null: unbekannt. */
  follower?: number | null;
  /** Top-Unterstützer (Namen, bester zuerst). */
  top?: string[];
  links?: { discord?: string; tiktok?: string; insta?: string };
  /** Aktive Befehle (für !befehle). */
  befehle?: string[];
}

const tausender = (n: number): string => String(Math.max(0, Math.floor(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** 12345 → „Nr. 12.345". */
export function formatKiste(n: number): string {
  return `Nr. ${tausender(n)}`;
}

/** 8_040_000 → „2 Std 14 Min", 840_000 → „14 Min". */
export function formatUptime(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return m > 0 ? `${h} Std ${m} Min` : `${h} Std`;
  return m > 0 ? `${m} Min` : 'gerade eben';
}

/** Ziel des Befehls: erstes Wort nach dem Befehl, ohne führendes @ („!hug @Mia" → „Mia"). */
export function zielUser(text: string | undefined): string {
  const args = (text ?? '').replace(/^\s*\S+\s*/, '');
  const erstes = args.split(/\s+/)[0] ?? '';
  return erstes.replace(/^@+/, '').slice(0, 40);
}

/** Braucht die Vorlage den aktuellen Song? (Dann lohnt ein frischer Abruf.) */
export function braucheSong(template: string): boolean {
  return /\{song\}/.test(template);
}

/** Setzt die Befehls-Platzhalter ein. Unbekannte/fehlende Werte → freundlicher Text. */
export function fuelleBefehlsVariablen(template: string, eventText: string | undefined, w: BefehlsWerte): string {
  const link = (v: string | undefined) => (v && v.trim() ? v.trim() : LINK_FEHLT_TEXT);
  const werte: Record<string, () => string> = {
    song: () => (w.song && w.song.title ? (w.song.artist ? `${w.song.title} – ${w.song.artist}` : w.song.title) : KEINE_MUSIK_TEXT),
    uptime: () => (typeof w.uptimeMs === 'number' && w.uptimeMs >= 0 ? formatUptime(w.uptimeMs) : KEINE_LAUFZEIT_TEXT),
    kiste: () => (typeof w.kiste === 'number' && w.kiste >= 1 ? formatKiste(w.kiste) : KEINE_KISTE_TEXT),
    follower: () => (typeof w.follower === 'number' ? tausender(w.follower) : FOLLOWER_UNBEKANNT),
    ziel: () => {
      const n = typeof w.follower === 'number' ? tausender(w.follower) : FOLLOWER_UNBEKANNT;
      const geschafft = typeof w.follower === 'number' && w.follower >= AFFILIATE_ZIEL;
      return `${n} von ${AFFILIATE_ZIEL}${geschafft ? ' — geschafft! 🎉' : ''}`;
    },
    top: () => {
      const t = (w.top ?? []).filter(Boolean).slice(0, 3);
      return t.length ? t.map((n, i) => `${i + 1}. ${n}`).join(' · ') : KEIN_TOP_TEXT;
    },
    ziel_user: () => zielUser(eventText) || 'alle',
    discord: () => link(w.links?.discord),
    tiktok: () => link(w.links?.tiktok),
    insta: () => link(w.links?.insta),
    befehle: () => ((w.befehle ?? []).length ? (w.befehle ?? []).join(' · ') : 'noch keine'),
  };
  // Funktions-Ersetzung: ein Songtitel mit „$&" o.ä. bleibt wörtlich stehen.
  return template.replace(/\{(song|uptime|kiste|follower|ziel_user|ziel|top|discord|tiktok|insta|befehle)\}/g, (_, k: string) => werte[k]?.() ?? '');
}
