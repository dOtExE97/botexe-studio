// gift-rules.js — reine (DOM-freie) Ableitung „Gift-Trigger-Regeln → Rad-/
// Tafel-Einträge". EINZIGE Quelle dieser Logik: gift-menu.js (Tafel-Widget)
// und wheel.js (Glücksrad-Widget) importieren beide von HIER, und der Server
// (packages/trigger-engine/src/gift-mapping.ts, orderedGiftKeys()) tut es
// ebenfalls (über einen relativen Import, gebündelt von Vite/tsx — kein
// DOM-Zugriff hier, deshalb geht das auch im Node-Hauptprozess).
//
// Vorher gab es hiervon zwei unabhängige Kopien (gift-menu.js fürs Widget,
// gift-mapping.ts fürs Server-Pendant orderedGiftKeys) — bei jeder Änderung
// mussten beide von Hand synchron gehalten werden ("Kommentar bei Änderung
// mitziehen"). Reale Falle: eine Gift-Regel ohne Aktion liefert leeren Text →
// itemsFromRules() nimmt sie trotzdem auf, das Rad-Widget filtert sie aber
// beim Segment-Aufbau weg (this.segments = items.map(text).filter(Boolean)).
// Zählte der Server sie mit, driftete sein Gewinner-Index gegen die
// tatsächlich sichtbaren Rad-Felder auseinander. Jetzt gibt es nur noch DIESE
// eine Funktion — Server-Index und Rad-Segmente sind per Konstruktion gleich.

/** Toleranter Gift-Schlüssel (nur Buchstaben/Ziffern, klein) — Apostroph,
 *  Leerzeichen und Schreibweise sind damit egal. */
export function giftKey(slug) {
  return String(slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Geteilter Geschenk-Katalog ───────────────────────────────────────────────
// Fünf Widget-Arten brauchen den Katalog (Geschenk-Menü, Automat, Bingo,
// Geschenk-Zähler, Befehls-Karussell). Jede Instanz holte ihn bisher SELBST.
// Solange der Katalog nur die selbst gesammelten Geschenke enthielt, fiel das
// nicht auf — seit er alle 5000+ TikTok-Geschenke kennt, sind das rund 860 KB
// PRO Widget. Bei vier Widgets in zwei Overlay-Quellen (OBS + TikTok Live
// Studio) also mehrere Megabyte und ebenso oft JSON-Verarbeitung, jedes Mal
// mit demselben Ergebnis.
//
// Ein Overlay-Dokument holt ihn deshalb genau EINMAL; alle Widgets darin teilen
// sich die Antwort. Das ist nebenbei konsistenter: vorher konnten zwei Widgets
// unterschiedliche Momentaufnahmen erwischen.
let katalogPromise = null;

/** Geschenk-Katalog holen — geteilt über alle Widgets dieses Overlays.
 *  Liefert im Fehlerfall ein leeres Objekt (Widgets zeigen dann Platzhalter). */
export function ladeGiftKatalog(baseUrl, token) {
  if (!katalogPromise) {
    katalogPromise = fetch(`${baseUrl}/gift-catalog?token=${token}`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
  }
  return katalogPromise;
}

/** Nur für Tests: den geteilten Abruf vergessen. */
export function vergissGiftKatalog() {
  katalogPromise = null;
}

/** Name, den ein Widget für ein Geschenk ANZEIGEN soll.
 *
 *  Der Hauptprozess hängt `displayName` an, wenn der Streamer unter
 *  Einstellungen „Geschenknamen im Overlay: Deutsch" gewählt hat — dann steht
 *  dort der deutsche Name oder seine eigene Umbenennung aus der Galerie. Ohne
 *  die Einstellung fehlt das Feld und es bleibt beim Originalnamen.
 *
 *  NUR für die Anzeige: Jede Zuordnung (welches Geschenk löst was aus) läuft
 *  weiter über `slug`, sonst würde eine Umbenennung die Regeln des Nutzers
 *  still ins Leere laufen lassen. */
export function giftName(gift) {
  if (!gift) return '';
  return String(gift.displayName || gift.slug || '');
}

/** Aktions-Art → verständlicher deutscher Text für Tafel/Rad. */
export function actionLabel(action) {
  if (!action || typeof action !== 'object') return '';
  switch (action.kind) {
    case 'play_sound': return 'Sound';
    case 'fire_alert': return 'Alarm';
    case 'show_layer': return 'Einblendung';
    case 'hide_layer': return '';
    case 'speak': return 'Ansage';
    case 'spin_wheel': return 'Glücksrad';
    case 'play_media': return 'Video/Bild';
    case 'counter_add': return `Zähler ${Number(action.delta) >= 0 ? '+' : ''}${Number(action.delta) || 0}`;
    case 'obs_scene': return `Szene: ${action.scene || ''}`.trim();
    case 'obs_visibility': return 'Quelle ein/aus';
    case 'send_chat': return 'Chat-Nachricht';
    case 'streamerbot_action': return String(action.action || 'Streamer.bot');
    case 'giveaway_draw': return 'Verlosung';
    case 'giveaway_reset': return '';
    case 'spotify_control': return 'Musik';
    case 'spotify_request': return 'Songwunsch';
    default: return '';
  }
}

/** Trigger-Regeln → Tafel-/Rad-Einträge (VOR Textfilter — leerer Text ist
 *  möglich, z.B. eine Gift-Regel ohne Aktion). Nur aktive Gift-Regeln mit
 *  einer Gift-Bedingung (gift_slug_is / gift_id_is). Der Text kommt aus dem
 *  Regel-Namen, sofern er selbst gewählt ist; sonst aus den Aktionen.
 *
 *  WICHTIG für Aufrufer, die einen Gewinner-INDEX über mehrere Systeme
 *  synchron halten müssen (Rad-Segmente vs. Server-Gewinnerwahl): das
 *  Rad-Widget zeigt nur Einträge MIT Text (`.filter((it) => it.text)`).
 *  Jeder Aufrufer, dessen Index sich mit dem Rad decken muss, MUSS densel-
 *  ben Filter anwenden — sonst zählt eine textlose Regel mit, die auf dem
 *  Rad gar nicht als Segment auftaucht (Index-Drift). */
export function itemsFromRules(rules) {
  const out = [];
  const seen = new Set();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!rule || rule.enabled === false || rule.event !== 'gift') continue;
    const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
    const slugCond = conds.find((c) => c && c.kind === 'gift_slug_is');
    const idCond = conds.find((c) => c && c.kind === 'gift_id_is');
    if (!slugCond && !idCond) continue;
    const slug = slugCond ? String(slugCond.value || '') : '';
    const giftId = idCond ? Number(idCond.value) || 0 : 0;
    const key = slug ? giftKey(slug) : `#${giftId}`;
    if (!key || seen.has(key)) continue;
    // Von der Geschenke-Galerie erzeugte Regeln heißen „Gift: <slug>" — das ist
    // kein sprechender Text, dann lieber die Aktionen beschreiben.
    const name = String(rule.name || '').trim();
    const generic = /^gift:/i.test(name);
    const fromActions = (Array.isArray(rule.actions) ? rule.actions : [])
      .map(actionLabel).filter(Boolean);
    const uniq = [...new Set(fromActions)];
    const text = (!generic && name) ? name : uniq.join(' + ');
    if (!slug && !giftId) continue;
    seen.add(key);
    out.push({ slug, giftId, text, ruleId: rule.id });
  }
  return out;
}

/** gift-menu.js, source:'trigger': trigger-abgeleitete Einträge (`derived`,
 *  aus itemsFromRules) mit den manuell eingetragenen Geschenken (`manual`,
 *  parseItems(props.items) — dasselbe Feld, das per GiftPicker befüllt wird)
 *  zusammenführen. Trigger-Einträge haben Vorrang und bleiben automatisch
 *  aktuell; ein manueller Eintrag ergänzt NUR, was itemsFromRules nicht
 *  ableiten konnte.
 *
 *  Realer Fehlerfall (Nutzer-Meldung): eine Trigger-Regel feuert über einen
 *  Coin-/Combo-Schwellenwert (`gift_coins_gte`/`gift_count_gte`, TriggersPage
 *  „Gift-Wert mindestens … Coins") statt über den Gift-Namen
 *  (`gift_slug_is`/`gift_id_is`). itemsFromRules() kennt dann korrekterweise
 *  KEINEN Gift-Namen für diese Regel (mehrere Geschenke könnten die Schwelle
 *  reißen) und lässt sie aus — der Sound/Alarm feuert trotzdem, denn die
 *  Trigger-Engine wertet dieselbe Regel unabhängig aus. Vorher überschrieb
 *  loadRules() `this.items` komplett mit `derived` — ein Geschenk, das der
 *  Nutzer TROTZDEM per GiftPicker in der Liste unten ausgewählt hatte, wurde
 *  dabei stillschweigend verworfen: die Tafel feierte nie, obwohl der Sound
 *  hörbar lief. Mit dem Merge bleibt genau dieser manuelle Eintrag erhalten. */
/** DIE kanonische, gefilterte, geordnete Gift-Eintragsliste — Server-
 *  Gewinner-Index und Widget-Anzeige MÜSSEN beide exakt aus DIESER Funktion
 *  kommen, nicht nur aus itemsFromRules() + einem von Hand nachgebauten
 *  `.filter((it) => it.text)`.
 *
 *  Vorher wandte jeder Aufrufer (gift-mapping.ts' orderedGiftKeys, gift-
 *  menu.js' loadRules, slot-machine.js' loadRules, wheel.js' loadRules) den
 *  Textfilter selbst an — vier textidentische Kopien derselben einen Zeile,
 *  nur durch Kommentar synchron gehalten ("MUSS mit orderedGiftKeys()
 *  deckungsgleich bleiben"). Ein neuer Aufrufer, der diesen Kommentar nicht
 *  liest oder den Filter vergisst, würde sofort einen Index-Drift einführen
 *  — genau der Fehler, der Rad/Slot/Lucky-Draw je einmal real getroffen hat.
 *  Jetzt gibt es nur noch DIESE eine Funktion; wer sie aufruft, kann den
 *  Filter nicht mehr vergessen. */
export function orderedGiftEntries(rules) {
  return itemsFromRules(rules).filter((it) => it.text);
}

export function mergeGiftItems(derived, manual) {
  const seen = new Set(
    (Array.isArray(derived) ? derived : [])
      .map((it) => (it && it.slug ? giftKey(it.slug) : (it && it.giftId ? `#${it.giftId}` : '')))
      .filter(Boolean),
  );
  const extra = (Array.isArray(manual) ? manual : []).filter((it) => {
    const key = it && it.slug ? giftKey(it.slug) : '';
    return !!key && !seen.has(key);
  });
  return [...(Array.isArray(derived) ? derived : []), ...extra];
}
