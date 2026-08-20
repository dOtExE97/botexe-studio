// sticker-text.js — Text und Sticker einer Chat-Nachricht in Anzeige-Teile
// zerlegen. DOM-frei, damit Widget und Test dieselbe Wahrheit nutzen (gleiches
// Muster wie gift-rules.js).
//
// TikTok liefert zu jedem Sticker eine `index`-Position im Text: 0 heißt ganz
// vorne, 5 heißt „nach dem fünften Zeichen". Eine reine Sticker-Nachricht hat
// als Text nur ein Leerzeichen — deshalb darf ein leerer Text nicht bedeuten,
// dass es nichts anzuzeigen gibt.

/**
 * Hat diese Chat-Nachricht etwas zu zeigen?
 *
 * Sieht nach einer ueberfluessigen Funktion aus, ist aber der eigentliche Fehler
 * von frueher: Die Chat-Box prueft `!event.text` und verwarf damit JEDE reine
 * Sticker-Nachricht, weil deren Text nur ein Leerzeichen ist. Als Funktion ist
 * die Entscheidung pruefbar — im Widget waere sie es nicht.
 *
 * @param {{text?:string, sticker?:Array}} event
 */
export function hatInhalt(event) {
  if (!event) return false;
  if (event.text) return true;
  return Array.isArray(event.sticker) && event.sticker.some((s) => s && s.id);
}

/**
 * @typedef {{art:'text', wert:string} | {art:'sticker', wert:object}} Teil
 * @param {string} text
 * @param {Array<{id:string,bild:string,index:number}>} sticker
 * @returns {Teil[]}
 */
export function textMitStickern(text, sticker) {
  const txt = typeof text === 'string' ? text : '';
  const liste = Array.isArray(sticker) ? sticker.filter((s) => s && s.id) : [];
  if (liste.length === 0) return [{ art: 'text', wert: txt }];

  // Aufsteigend nach Position — TikTok garantiert die Reihenfolge nicht.
  const sortiert = [...liste].sort((a, b) => zahl(a.index) - zahl(b.index));

  const teile = [];
  let gelesen = 0;
  for (const s of sortiert) {
    // Positionen jenseits des Textes hängen den Sticker hinten an, statt den
    // Text zu zerreißen (negative Werte ebenso: sie landen vorne).
    const pos = Math.max(gelesen, Math.min(zahl(s.index), txt.length));
    const davor = txt.slice(gelesen, pos);
    if (davor) teile.push({ art: 'text', wert: davor });
    teile.push({ art: 'sticker', wert: s });
    gelesen = pos;
  }
  const rest = txt.slice(gelesen);
  if (rest) teile.push({ art: 'text', wert: rest });
  return teile;
}

function zahl(v) {
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
