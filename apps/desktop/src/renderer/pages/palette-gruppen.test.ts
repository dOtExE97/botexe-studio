import test from 'node:test';
import assert from 'node:assert/strict';
import { gruppiereNachKategorie, type GruppenRegeln } from './palette-gruppen';

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
