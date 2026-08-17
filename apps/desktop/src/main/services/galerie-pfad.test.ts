// galerie-pfad.test.ts — nagelt fest, WO in TikToks Galerie-Antwort die
// Geschenke stehen.
//
// Warum es diesen Test gibt: Derselbe Abruf ist zweimal hintereinander an
// geratenen Annahmen gescheitert. Erst wurde die Signatur der Abruf-Funktion
// geraten (Absturz bei jedem Verbinden), dann der Pfad in der Antwort — gesucht
// wurde in `gifts`, `data.gifts` und `giftList`, richtig ist `data.normal_gifts`.
// Beide Male lag die Antwort fertig in node_modules.
//
// Beleg: node_modules/tiktok-live-api-sdk/dist/index.d.ts
//   WebcastGiftGalleryResponse { code, message?, data?: WebcastGiftGalleryData }
//   WebcastGiftGalleryData     { normal_gifts: NormalGiftItem[], … }
import test from 'node:test';
import assert from 'node:assert/strict';
import { liesGalerieEintraege, liesGalerieFehler } from './studio';

test('der echte Pfad ist data.normal_gifts', () => {
  // Nachgebaut nach der Typdefinition des SDK.
  const antwort = {
    code: 0,
    data: {
      normal_gifts: [
        { gift_id: '5655', name: 'Rose', coin_price: 1, goal_count: 100, current_sent_count: 42 },
        { gift_id: '7934', name: 'Heart Me', coin_price: 1, goal_count: 0, current_sent_count: 0 },
      ],
      current_timestamp: 1_700_000_000,
    },
  };
  const eintraege = liesGalerieEintraege(antwort);
  assert.equal(eintraege.length, 2);
  assert.equal((eintraege[0] as { name: string }).name, 'Rose');
});

test('die alten, geratenen Pfade hätten NICHTS gefunden', () => {
  // Der eigentliche Punkt dieses Tests: Genau diese Antwort lag beim Streamer
  // vor, und die App meldete dreimal „enthielt keine erkennbaren Einträge".
  const antwort = { code: 0, data: { normal_gifts: [{ gift_id: '1', name: 'X' }] } };
  const geraten = [
    (antwort as { gifts?: unknown[] }).gifts,
    (antwort as { data?: { gifts?: unknown[] } }).data?.gifts,
    (antwort as { giftList?: unknown[] }).giftList,
  ].find(Array.isArray) ?? [];
  assert.equal(geraten.length, 0, 'die drei geratenen Pfade sind allesamt leer');
  assert.equal(liesGalerieEintraege(antwort).length, 1, 'der nachgeschlagene Pfad trifft');
});

test('Rückfalloptionen bleiben, falls eulerstream die Hülle umbaut', () => {
  assert.equal(liesGalerieEintraege({ gifts: [{ name: 'A' }] }).length, 1);
  assert.equal(liesGalerieEintraege({ data: { gifts: [{ name: 'A' }] } }).length, 1);
  assert.equal(liesGalerieEintraege({ giftList: [{ name: 'A' }] }).length, 1);
  assert.equal(liesGalerieEintraege([{ name: 'A' }]).length, 1, 'blankes Array direkt');
});

test('kaputte oder leere Antworten geben ein leeres Array, keinen Absturz', () => {
  assert.deepEqual(liesGalerieEintraege(undefined), []);
  assert.deepEqual(liesGalerieEintraege(null), []);
  assert.deepEqual(liesGalerieEintraege({}), []);
  assert.deepEqual(liesGalerieEintraege({ data: {} }), []);
  assert.deepEqual(liesGalerieEintraege({ code: 4003, message: 'no permission' }), []);
  assert.deepEqual(liesGalerieEintraege('kaputt'), []);
});

// ── Fehlerantwort vs. leere Galerie ────────────────────────────────────────
// Zweiter Fall aus dem Feld: Bei einer Nutzerin kam `{ code, error, detail }`
// zurück — eine Fehlermeldung. Die App las darin nach Geschenken, fand keine
// und meldete „enthielt keine erkennbaren Einträge". Sachlich wahr, in der
// Wirkung falsch: Es klang nach einem Streamer ohne Galerie statt nach einem
// gescheiterten Abruf, und schickte die Fehlersuche in die falsche Richtung.

test('eine Fehlerantwort wird als Fehler erkannt, nicht als leere Galerie', () => {
  const satz = liesGalerieFehler({ code: 403, error: 'forbidden', detail: 'plan required' });
  assert.ok(satz, 'wird als Fehler erkannt');
  assert.match(satz, /forbidden/);
  assert.match(satz, /403/);
});

test('eine ERFOLGREICHE Antwort gilt nicht als Fehler', () => {
  // Wichtig, weil auch die Erfolgsantwort ein `code`-Feld trägt: Auf `code`
  // allein zu prüfen, würde jeden geglückten Abruf zum Fehler erklären.
  assert.equal(liesGalerieFehler({ code: 0, data: { normal_gifts: [] } }), null);
  assert.equal(liesGalerieFehler({ code: 0, data: { normal_gifts: [{ name: 'Rose' }] } }), null);
  assert.equal(liesGalerieFehler([]), null, 'eine blanke Liste ist keine Fehlermeldung');
  assert.equal(liesGalerieFehler(undefined), null);
});

test('aus der Fehlermeldung fliegt raus, was nach Schlüssel aussieht', () => {
  // Fremde Fehlermeldungen zitieren gern die aufgerufene URL — samt Schlüssel.
  // Logdateien gibt man weiter, deshalb läuft der Text durch den Filter.
  const satz = liesGalerieFehler({ code: 401, error: 'bad key euler_abc123def456ghi789jkl' });
  assert.ok(satz);
  assert.doesNotMatch(satz, /euler_abc123/, 'der Schlüssel steht NICHT im Log');
  assert.match(satz, /entfernt/);
});
