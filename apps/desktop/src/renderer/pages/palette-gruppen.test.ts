import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gruppiereNachKategorie,
  alleGruppen,
  PALETTE_KATEGORIEN,
  POPULAR_WIDGETS,
  CATEGORY_OF,
  RELATED_OF,
  RELATED_MEMBERS,
  RARELY_USED,
  type GruppenRegeln,
} from './palette-gruppen';
import { WIDGET_TYPES } from './widget-types';

const W = [
  { type: 'gift-alert', label: 'Gift-Alert' },
  { type: 'follow-alert', label: 'Follow-Alert' },
  { type: 'wheel', label: 'Glücksrad' },
  { type: 'leaderboard', label: 'Top Gifter' },
  { type: 'top-rotator', label: 'Bestenliste (Wechsel)' },
  { type: 'sport-ticker', label: 'Sport-Liveticker' },
  { type: 'ohne-kategorie', label: 'Vergessenes Widget' },
];

const REGELN: GruppenRegeln = {
  kategorieVon: {
    'gift-alert': 'alerts', 'follow-alert': 'alerts', wheel: 'spiele',
    leaderboard: 'listen', 'top-rotator': 'listen', 'sport-ticker': 'listen',
  },
  kategorien: [
    { id: 'beliebt', label: 'Beliebt' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'spiele', label: 'Spiele' },
    { id: 'listen', label: 'Listen' },
    { id: 'deko', label: 'Deko' },
    { id: 'leer', label: 'Leere Kategorie' },
  ],
  beliebtId: 'beliebt',
  beliebt: ['wheel', 'gift-alert'],
  varianten: new Set(['top-rotator']),
  spezial: new Set(['sport-ticker']),
  rueckfall: 'deko',
};

test('gruppiert nach Kategorie, in der vorgegebenen Reihenfolge', () => {
  const g = gruppiereNachKategorie(W, REGELN);
  assert.deepEqual(g.map((x) => x.id), ['beliebt', 'alerts', 'spiele', 'listen', 'deko']);
});

test('leere Kategorien fallen weg', () => {
  // Eine Überschrift ohne Inhalt ist nur eine weitere Zeile zum Überspringen.
  assert.equal(gruppiereNachKategorie(W, REGELN).find((x) => x.id === 'leer'), undefined);
});

test('„Beliebt" behält seine EIGENE Reihenfolge', () => {
  const g = gruppiereNachKategorie(W, REGELN).find((x) => x.id === 'beliebt');
  assert.deepEqual(g?.items.map((i) => i.type), ['wheel', 'gift-alert'],
    'kuratierte Reihenfolge, nicht die des Katalogs');
});

test('Varianten und Spezialfälle bleiben draußen', () => {
  const listen = gruppiereNachKategorie(W, REGELN).find((x) => x.id === 'listen');
  assert.deepEqual(listen?.items.map((i) => i.type), ['leaderboard'],
    'top-rotator ist Variante, sport-ticker Spezialfall');
});

test('Widget ohne Kategorie landet im Rückfall — und geht nicht verloren', () => {
  // Genau so verschwand der Gambling-Automat still in „Ambient & Deko".
  const deko = gruppiereNachKategorie(W, REGELN).find((x) => x.id === 'deko');
  assert.deepEqual(deko?.items.map((i) => i.type), ['ohne-kategorie']);
});

test('jedes Widget taucht höchstens EINMAL auf (außer in Beliebt)', () => {
  const g = gruppiereNachKategorie(W, REGELN);
  const ohneBeliebt = g.filter((x) => x.id !== 'beliebt').flatMap((x) => x.items.map((i) => i.type));
  assert.equal(new Set(ohneBeliebt).size, ohneBeliebt.length, 'keine Doppelten');
});

test('leere Widget-Liste ergibt keine Gruppen', () => {
  assert.deepEqual(gruppiereNachKategorie([], REGELN), []);
});

// ── Wächter gegen die echten Katalogdaten ──────────────────────────────────
// Bis hierher prüft der Test die Mechanik mit erfundenen Widgets. Ab hier geht
// es um den WIRKLICHEN Katalog — genau dort saßen alle bisherigen Fehler.

test('jedes Widget hat eine Kategorie (sonst landet es still in der Deko)', () => {
  // Fehlt ein Eintrag in CATEGORY_OF, fällt das Widget auf „Ambient & Deko"
  // zurück und ist im falschen Reiter praktisch unauffindbar. Genau so lag der
  // Gambling-Automat monatelang bei der Deko statt bei den Spielen.
  const bekannt = new Set(PALETTE_KATEGORIEN.map((c) => c.id));
  const fehlen = [...new Set(WIDGET_TYPES.map((w) => w.type))].filter((t) => !CATEGORY_OF[t]);
  assert.deepEqual(fehlen, [], `ohne Kategorie: ${fehlen.join(', ')}`);
  const unbekannt = Object.entries(CATEGORY_OF).filter(([, k]) => !bekannt.has(k));
  assert.deepEqual(unbekannt, [], 'Kategorie-id, die es als Reiter gar nicht gibt');
});

test('der Katalog zeigt wirklich JEDES Widget', () => {
  // Der Punkt des Katalogs ist „zeig mir alles". In der Vorgänger-Ansicht lagen
  // die Varianten trotzdem hinter einem Aufklapper — 13 von 46 Widgets waren
  // ausgerechnet dort unsichtbar.
  // alleGruppen() ist genau das, was der Katalog aufruft — nicht eine hier
  // nachgebaute Kopie der Regeln, die immer gruen bliebe.
  const gruppen = alleGruppen(WIDGET_TYPES);
  const gezeigt = new Set(gruppen.flatMap((g) => g.items.map((i) => i.type)));
  const fehlen = [...new Set(WIDGET_TYPES.map((w) => w.type))].filter((t) => !gezeigt.has(t));
  assert.deepEqual(fehlen, [], `im Katalog unsichtbar: ${fehlen.join(', ')}`);
});

test('Anführer und seine Varianten liegen im selben Reiter', () => {
  // Sonst steht der Aufklapper „2 Varianten zu Countdown" in einem Reiter und
  // die Varianten gehören laut Einteilung in einen anderen — beim Umsortieren
  // die naheliegendste Falle.
  const falsch: string[] = [];
  for (const [anfuehrer, varianten] of Object.entries(RELATED_OF)) {
    for (const v of varianten) {
      if (CATEGORY_OF[v] !== CATEGORY_OF[anfuehrer]) {
        falsch.push(`${v} (${CATEGORY_OF[v]}) unter ${anfuehrer} (${CATEGORY_OF[anfuehrer]})`);
      }
    }
  }
  assert.deepEqual(falsch, [], falsch.join('; '));
});

test('kein Anführer ist selbst Variante, und jede Variante gibt es wirklich', () => {
  const typen = new Set(WIDGET_TYPES.map((w) => w.type));
  const unbekannt = [...RELATED_MEMBERS, ...Object.keys(RELATED_OF)].filter((t) => !typen.has(t));
  assert.deepEqual(unbekannt, [], `Verwandten-Gruppe zeigt auf ein Widget, das es nicht gibt: ${unbekannt.join(', ')}`);
  const beides = Object.keys(RELATED_OF).filter((t) => RELATED_MEMBERS.has(t));
  assert.deepEqual(beides, [], `Anführer und Variante zugleich — dann verschwindet er ganz: ${beides.join(', ')}`);
});

test('„Beliebt" und die Spezialfälle zeigen auf echte Widgets', () => {
  const typen = new Set(WIDGET_TYPES.map((w) => w.type));
  assert.deepEqual(POPULAR_WIDGETS.filter((t) => !typen.has(t)), [], 'Beliebt-Eintrag ohne Widget → Kachel fehlt still');
  assert.deepEqual([...RARELY_USED].filter((t) => !typen.has(t)), []);
});
