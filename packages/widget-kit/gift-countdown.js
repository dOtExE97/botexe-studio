// gift-countdown.js — reiner, DOM-freier Kern des Challenge-Countdowns im
// Geschenke-Slider (gift-menu.js). Enthält NUR Berechnung, keine Zeitgeber und
// kein DOM: so bleibt die Logik ohne Browser/Timer testbar (node:test).
//
// WICHTIG: Das ist NICHT `countdown.js` — die Datei existiert bereits als
// eigenständiges „Premium-Countdown"-Widget (props.minutes-Ablauf-Timer,
// glas/neon/led) und wird im Widget-Katalog referenziert. Dieser Kern hier
// gehört ausschließlich zu gift-menu.js, deshalb der eigene Dateiname.
//
// stackRemaining/fmtTime: von Task 3 fürs Rendern der Stil-Varianten genutzt.
// nextCountdownState/tickCountdownState: der Zustandsübergang, den
// gift-menu.js bei celebrate() bzw. jedem Tick anwendet — als eigene reine
// Funktion, damit genau DIESE Übergänge ohne echtes setInterval/DOM testbar
// sind (statt DOM/Timer im Test nachzubauen).

/** Sekunden draufaddieren, bei `cap` (Default 600s = 10 Min) deckeln.
 *  Negative/`prev` unter 0 zählen als 0 (kein „Minus-Startguthaben"). */
export function stackRemaining(prev, addSecs, cap = 600) {
  const base = prev > 0 ? prev : 0;
  return Math.min(cap, base + Math.max(0, addSecs));
}

/** Sekunden → "m:ss" (z. B. 80 → "1:20"). */
export function fmtTime(secs) {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Zustandsübergang für ein neu eintreffendes Geschenk mit `secs>0`.
 *  `prev` ist der bisherige Map-Eintrag ({remaining, total}) oder undefined
 *  (Neustart). `total` wächst beim Stacken mit hoch (der Fortschrittsbalken/
 *  -ring aus Task 3 rechnet gegen `total`, nicht gegen den ursprünglichen
 *  Wert — sonst würde er beim Draufstapeln über 100% hinausschießen). */
export function nextCountdownState(prev, addSecs, cap = 600) {
  const remaining = stackRemaining(prev ? prev.remaining : 0, addSecs, cap);
  const total = prev ? Math.max(prev.total, remaining) : remaining;
  return { remaining, total };
}

/** Ein Sekunden-Tick auf einen bestehenden Zustand. `done` zeigt an, ob der
 *  Eintrag jetzt zurückgesetzt werden muss (remaining <= 0). */
export function tickCountdownState(state) {
  const remaining = state.remaining - 1;
  return { remaining, total: state.total, done: remaining <= 0 };
}

/** Fortschritt 0..1 (Restzeit/Gesamtzeit) — die gemeinsame Grundlage für die
 *  Balken- UND die Ring-Optik (Task 3). `total<=0` (sollte nicht vorkommen,
 *  Absicherung) zählt als „aufgebraucht". */
export function countdownProgress(remaining, total) {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(1, remaining / total));
}

/** Balken-Breite in Prozent (0..100), gerundet auf 1 Nachkommastelle — reicht
 *  für eine ruhige CSS-Transition, ohne dass Sub-Pixel-Rauschen entsteht. */
export function barWidthPct(remaining, total) {
  return Math.round(countdownProgress(remaining, total) * 1000) / 10;
}

/** `stroke-dashoffset` für den Ring: bei `progress=1` (voll) 0 (kein Offset,
 *  Ring ganz gefüllt), bei `progress=0` (abgelaufen) der volle Umfang (Ring
 *  komplett ausgeblendet). `circumference` ist 2πr des Ring-SVG. */
export function ringDashOffset(remaining, total, circumference) {
  const progress = countdownProgress(remaining, total);
  return Math.round((1 - progress) * circumference * 1000) / 1000;
}
