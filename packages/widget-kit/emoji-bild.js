// emoji-bild.js — Emojis im Chat-Text als Twemoji-Bilder zeigen.
//
// Warum: OBS unter Windows (Chromium/CEF) setzt ZWJ-Folgen wie die
// Piratenflagge (🏴 + ZWJ + ☠ + VS16) trotz Emoji-Schrift-Fallback aus
// Einzelteilen zusammen — übrig bleibt ein einsames Kreuz. Ein Bild je
// Emoji-Folge sieht überall gleich aus.
//
// Zwei Hälften:
//  - `emojiTeile` / `twemojiCode` / `twemojiUrl` sind DOM-frei und testbar.
//  - `haengeTextAn` baut daraus DOM — nur mit createTextNode und <img>,
//    NIE innerHTML: der Text stammt von Zuschauern.
//
// Bilder: Twemoji (CC-BY 4.0, Grafiken von Twitter/jdecked) über jsDelivr.
// Lädt ein Bild nicht (offline, Folge ohne Datei), steht wieder das Zeichen da.

export const TWEMOJI_BASIS = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/';

const ZWJ = '‍';
// Eine Emoji-Folge (in dieser Reihenfolge versucht):
//  1. Flagge aus zwei Regional-Indikatoren (🇩🇪)
//  2. Tag-Folge (Schottland, England, Wales: 🏴 + Tags + Abschluss)
//  3. Tastenkappe (1️⃣, #️⃣): Ziffer/#/* [VS16] U+20E3
//  4. Bildzeichen [VS16 | Hautton] (ZWJ Bildzeichen [VS16 | Hautton])*
const FOLGE = new RegExp(
  '\\p{Regional_Indicator}{2}'
  + '|\\u{1F3F4}[\\u{E0020}-\\u{E007E}]+\\u{E007F}'
  + '|[0-9#*]\\uFE0F?\\u20E3'
  + '|\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|\\p{Emoji_Modifier})?)*',
  'gu',
);
const ALS_BILD = /\p{Emoji_Presentation}|️|‍|⃣|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u{E007F}/u;

/**
 * Soll diese Folge ein Bild werden? Nur, wenn sie wirklich als Emoji gemeint
 * ist: ein Zeichen mit Emoji-Darstellung, eine VS16, ein ZWJ, ein Hautton, eine
 * Tastenkappe oder eine Flagge. Reine Text-Zeichen wie ©, ®, ™, ↔ oder ein
 * nacktes ☺ bleiben Text — sonst würde aus jedem „™" im Chat ein Bildchen.
 * Ausnahme ❤ (U+2764): Ohne VS16 getippt ist es im Chat trotzdem ein Herz.
 */
function istBildFolge(folge) {
  return ALS_BILD.test(folge) || folge === '❤';
}

/**
 * Twemoji-Dateiname einer Folge — die offizielle Regel aus twemoji
 * (`grabTheRightIcon`): Enthält die Folge KEIN ZWJ, fallen alle VS16 (U+FE0F)
 * weg; mit ZWJ bleiben sie stehen. Danach die Codepunkte klein in Hex, mit
 * Bindestrich verbunden.
 *   🏴‍☠️ → 1f3f4-200d-2620-fe0f · ❤️ → 2764 · 👍🏽 → 1f44d-1f3fd · 🇩🇪 → 1f1e9-1f1ea
 * @param {string} folge
 */
export function twemojiCode(folge) {
  const s = String(folge ?? '');
  const roh = s.includes(ZWJ) ? s : s.replace(/️/g, '');
  const teile = [];
  for (const z of roh) teile.push(z.codePointAt(0).toString(16));
  return teile.join('-');
}

/** Bild-Adresse zu einem Code aus twemojiCode(). */
export function twemojiUrl(code) {
  return `${TWEMOJI_BASIS}${code}.svg`;
}

/**
 * Text in Stücke zerlegen: Text bleibt Text, Emoji-Folgen werden zu
 * `{art:'emoji', wert, code}`.
 * @param {string} text
 * @returns {Array<{art:'text', wert:string} | {art:'emoji', wert:string, code:string}>}
 */
export function emojiTeile(text) {
  const s = typeof text === 'string' ? text : '';
  const teile = [];
  let gelesen = 0;
  for (const m of s.matchAll(FOLGE)) {
    const folge = m[0];
    if (!istBildFolge(folge)) continue;
    if (m.index > gelesen) teile.push({ art: 'text', wert: s.slice(gelesen, m.index) });
    teile.push({ art: 'emoji', wert: folge, code: twemojiCode(folge) });
    gelesen = m.index + folge.length;
  }
  if (gelesen < s.length) teile.push({ art: 'text', wert: s.slice(gelesen) });
  return teile;
}

/**
 * Text mit Emoji-Bildern an `el` anhängen. Ohne Emojis entsteht genau EIN
 * Textknoten — wie vorher. Schlägt ein Bild fehl, ersetzt das ursprüngliche
 * Zeichen das Bild (kein kaputtes Bildsymbol im Overlay).
 * @param {HTMLElement} el
 * @param {string} text
 */
export function haengeTextAn(el, text) {
  if (!el || !text) return;
  for (const teil of emojiTeile(text)) {
    if (teil.art === 'text') { el.appendChild(document.createTextNode(teil.wert)); continue; }
    const img = document.createElement('img');
    img.className = 'emoji';
    img.alt = teil.wert;
    img.draggable = false;
    img.decoding = 'async';
    img.addEventListener('error', () => {
      if (img.parentNode) img.replaceWith(document.createTextNode(teil.wert));
    }, { once: true });
    img.src = twemojiUrl(teil.code);
    el.appendChild(img);
  }
}

/**
 * Wie `el.textContent = text`, nur mit Emoji-Bildern. Ohne Emoji im Text ist
 * es wörtlich dieselbe Zuweisung — für Namen, die bisher so gesetzt wurden.
 * @param {HTMLElement} el
 * @param {string} text
 */
export function setzeTextMitEmojis(el, text) {
  if (!el) return;
  const s = String(text ?? '');
  if (!emojiTeile(s).some((t) => t.art === 'emoji')) { el.textContent = s; return; }
  el.textContent = '';
  haengeTextAn(el, s);
}
