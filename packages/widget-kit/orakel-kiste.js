// orakel-kiste.js — die Kistennummer des Piraten-Orakels. EINZIGE Quelle.
//
// Zwei Seiten würfeln dieselbe Zahl: der Herz-Alarm im Overlay (Modus
// „Ereignisse", ereignis-alarm.js) für Follows ohne mitgelieferte Kiste
// (TikTok, alte Wege), und die App im Hauptprozess für echte Twitch-Follows
// (damit `!kiste` die Nummer kennt und alle Overlays dieselbe zeigen). Beide
// importieren diese Datei — keine zweite Kopie, die auseinanderlaufen kann.
//
// Reines JS ohne Importe und ohne DOM: läuft im Browser (Overlay) und unter
// Node (Main-Prozess über `allowJs`, wie gift-rules.js).

export const ORAKEL_CHANCE = 137500;
export const ORAKEL_GLUECK = 1000;
export const ORAKEL_MAX = 99_999_999;

/**
 * Kistennummer, in der „dein" Piraten-Token liegt: Wie viele Kisten öffnest du,
 * bis bei Chance 1 : `chance` pro Kiste der erste Treffer kommt? Das ist
 * geometrisch verteilt — Mittel ≈ chance, meist ein paar Tausend bis ein paar
 * Hunderttausend, ganz selten zweistellig (Glückspilz).
 */
export function wuerfleKiste(chance = ORAKEL_CHANCE, zufall = Math.random) {
  const c = Math.max(2, Math.round(Number(chance)) || ORAKEL_CHANCE);
  const u = Math.min(1 - 1e-12, Math.max(0, Number(zufall()) || 0));
  const n = Math.ceil(Math.log(1 - u) / Math.log(1 - 1 / c));
  return Math.max(1, Math.min(ORAKEL_MAX, Number.isFinite(n) ? n : 1));
}
