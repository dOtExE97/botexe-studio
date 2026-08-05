// tiktok-artenbuch.test.ts — der Bericht muss die Frage beantworten
// „was kam in diesem Stream wirklich an?" — vollständig und ohne Werte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Artenbuch } from './tiktok-artenbuch';

test('zählt je Art und trennt ausgewertet von verworfen', () => {
  const b = new Artenbuch();
  b.verbuche('WebcastChatMessage', true);
  b.verbuche('WebcastChatMessage', true);
  b.verbuche('WebcastChatMessage', true);
  b.verbuche('WebcastGiftMessage', true);
  b.verbuche('WebcastBarrageMessage', false);
  b.verbuche('WebcastBarrageMessage', false);

  const stand = b.stand();
  assert.equal(stand[0]?.type, 'WebcastChatMessage', 'häufigste zuerst');
  assert.equal(stand[0]?.anzahl, 3);
  assert.equal(stand.find((e) => e.type === 'WebcastBarrageMessage')?.genutzt, false);

  const text = b.bericht() ?? '';
  assert.match(text, /6 Nachrichten in 3 Arten/);
  assert.match(text, /AUSGEWERTET \(2\)/);
  assert.match(text, /VERWORFEN \(1\)/);
  assert.match(text, /WebcastBarrageMessage ×2/);
});

test('leeres Buch berichtet NICHTS', () => {
  // Wichtig für die Live-Check-Verbindungen: Die verbinden alle 30 Sekunden
  // kurz und trennen wieder, ohne je eine Nachricht zu sehen. Ein Bericht pro
  // Check wären 120 sinnlose Logzeilen pro Stunde.
  assert.equal(new Artenbuch().bericht(), null);
});

test('eine Art, die erst verworfen und später ausgewertet wird, gilt als ausgewertet', () => {
  // Kann vorkommen, wenn dieselbe Art mal mit und mal ohne verwertbaren Inhalt
  // ankommt (z.B. Social-Nachrichten: follow/share ja, der Rest nein). Im
  // Zweifel soll der Bericht nicht behaupten, die App ignoriere sie komplett.
  const b = new Artenbuch();
  b.verbuche('WebcastSocialMessage', false);
  b.verbuche('WebcastSocialMessage', true);
  assert.equal(b.stand()[0]?.genutzt, true);
});

test('der Bericht enthält NIEMALS Werte — nur Namen und Zahlen', () => {
  // Logdateien werden weitergegeben. Ein Nutzername oder eine Raum-ID im
  // Bericht wäre ein Datenleck, das niemand bemerkt.
  const b = new Artenbuch();
  b.verbuche('WebcastChatMessage', true);
  const text = b.bericht() ?? '';
  // Der Bericht kennt die Nutzdaten gar nicht — verbuche() bekommt nur den
  // Typnamen. Dieser Test hält fest, dass das so BLEIBT.
  assert.doesNotMatch(text, /@|uniqueId|nickname|roomId|\d{6,}/,
    'kein Name, keine ID, keine lange Zahl im Bericht');
});

test('sehr viele Arten werden gedeckelt, aber die Zahl bleibt ehrlich', () => {
  const b = new Artenbuch();
  for (let i = 0; i < 30; i++) b.verbuche(`WebcastArt${i}Message`, false);
  const text = b.bericht() ?? '';
  assert.match(text, /VERWORFEN \(30\)/, 'die Gesamtzahl steht da');
  assert.match(text, /und 10 weitere/, 'der Rest wird nicht verschwiegen, nur gekürzt');
});

test('leeren() setzt zurück — der Bericht beschreibt EINEN Stream', () => {
  const b = new Artenbuch();
  b.verbuche('WebcastChatMessage', true);
  b.leeren();
  assert.equal(b.bericht(), null);
});
