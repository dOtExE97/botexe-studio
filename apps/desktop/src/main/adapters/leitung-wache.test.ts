// leitung-wache.test.ts — Wächter gegen die STILLE Leitung.
//
// Der Fall, der diesen Test erzwungen hat: Im Log eines Streamers stand
// 45 Minuten lang sechsmal exakt dieselbe Zeile — gleiche Zuschauerzahl,
// gleiche Like-Zahl, gleiche Chat-Zahl. Nach dem Neuverbinden von Hand waren es
// schlagartig 415 Likes mehr. Die App hielt die Leitung die ganze Zeit für
// gesund, weil ihr Wächter nach dem ERSTEN Ereignis abgeblasen und nie wieder
// aufgezogen wurde: Er bewachte nur die ersten Sekunden nach dem Verbinden.
//
// Diese Tests halten beides fest: die Regel selbst, und dass eine Verbindung
// mitten im laufenden Stream die Zähler nicht auf null wirft.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { EventBus } from '../core/event-bus';
import { TikTokAdapter, leitungsUrteil, type LiveConnectionLike, type AdapterStatusInfo } from './tiktok-adapter';

const MIN = 60_000;

test('leitungsUrteil: still, stiller, tot', () => {
  // Frisch verbunden, alles fließt.
  assert.equal(leitungsUrteil(0, Infinity), 'ok');
  assert.equal(leitungsUrteil(1.9 * MIN, Infinity), 'ok');
  // Zwei Minuten ohne ein einziges Ereignis — meldenswert, aber noch kein Grund
  // für einen Neuaufbau: Ein sehr kleiner Stream kann kurz ruhig sein.
  assert.equal(leitungsUrteil(2 * MIN, Infinity), 'warnen');
  assert.equal(leitungsUrteil(4.9 * MIN, Infinity), 'warnen');
  // Fünf Minuten ohne ALLES — auch ohne Zuschauerzahl. Das kommt bei einem
  // laufenden Stream nicht vor.
  assert.equal(leitungsUrteil(5 * MIN, Infinity), 'heilen');
  assert.equal(leitungsUrteil(45 * MIN, Infinity), 'heilen');
});

test('leitungsUrteil: nicht in Dauerschleife heilen', () => {
  // Bleibt auch die frische Leitung still, darf die App nicht alle fünf Minuten
  // neu verbinden — das verbrennt das Tageskontingent. Gewarnt wird trotzdem.
  assert.equal(leitungsUrteil(10 * MIN, 1 * MIN), 'warnen');
  assert.equal(leitungsUrteil(10 * MIN, 9 * MIN), 'warnen');
  // Nach dem Sperrfenster ist ein neuer Versuch erlaubt.
  assert.equal(leitungsUrteil(10 * MIN, 10 * MIN), 'heilen');
});

test('SELBSTTEST des Wächters: die alte, kaputte Regel fällt durch', () => {
  // Die frühere Fassung war ein Einmal-Timer, der beim ersten Ereignis für immer
  // abgeblasen wurde. Nachgebaut heißt das: „nach dem ersten Ereignis nie wieder
  // etwas melden". Wäre der Test oben zu lasch, würde diese Regel ihn bestehen.
  const alteRegel = (): 'ok' => 'ok';
  assert.notEqual(alteRegel(), leitungsUrteil(45 * MIN, Infinity),
    'Der Wächter muss eine 45 Minuten stille Leitung von einer gesunden unterscheiden');
});

class FakeConnection extends EventEmitter implements LiveConnectionLike {
  async connect(): Promise<Record<string, unknown>> { return { roomId: '123' }; }
  disconnect(): void { /* nichts */ }
  override removeAllListeners(): this { return super.removeAllListeners(); }
}

function setup(now: () => number) {
  const bus = new EventBus();
  const verbindungen: FakeConnection[] = [];
  const statuses: AdapterStatusInfo[] = [];
  const adapter = new TikTokAdapter(bus, {
    factory: () => { const c = new FakeConnection(); verbindungen.push(c); return c; },
    onStatus: (s) => statuses.push(s),
    now,
    baseReconnectDelayMs: 1,
    jitterMs: 0,
  });
  return { adapter, verbindungen, statuses };
}

test('Handverbinden mitten im Stream ist KEIN neuer Stream', async () => {
  // Belegt im Log: Der Streamer drückt „Trennen" und „Verbinden", die App meldet
  // „NEUER Stream — Zähler starten bei null" — obwohl derselbe Stream weiterlief
  // (die Like-Zahl lief durch). Aus einem Abend wurden drei Einträge in der
  // Auswertung. Beim App-Neustart machte die App es längst richtig.
  let jetzt = 1_000_000;
  const { adapter, verbindungen, statuses } = setup(() => jetzt);

  await adapter.connect('testuser');
  assert.equal(statuses.find((s) => s.status === 'connected')?.freshStream, true,
    'der allererste Connect ist sehr wohl ein neuer Stream');

  // Es läuft: ein Chat kommt an.
  verbindungen[0]?.emit('chat', { user: { uniqueId: 'anna' }, comment: 'hi' });

  // Zwei Minuten später trennt der Streamer von Hand und verbindet neu.
  jetzt += 2 * MIN;
  await adapter.disconnect();
  await adapter.connect('testuser');

  const zweiter = statuses.filter((s) => s.status === 'connected')[1];
  assert.ok(zweiter, 'zweiter Connect gemeldet');
  assert.equal(zweiter?.freshStream, false,
    'derselbe Stream — die Zähler müssen weiterlaufen');
  await adapter.disconnect(); // Timer abräumen, sonst hängt der Testlauf
});

test('Nach einer langen Pause ist es sehr wohl ein neuer Stream', async () => {
  // Die Gegenprobe: Wer abends um 19:05 die App schließt und um 21:00 einen
  // neuen Stream startet, darf NICHT mit den alten Zahlen anfangen — Coin-Glas
  // und Ziel-Balken stünden vor den Zuschauern sonst schon halb voll.
  let jetzt = 1_000_000;
  const { adapter, verbindungen, statuses } = setup(() => jetzt);

  await adapter.connect('testuser');
  verbindungen[0]?.emit('chat', { user: { uniqueId: 'anna' }, comment: 'hi' });

  jetzt += 2 * 60 * MIN; // zwei Stunden
  await adapter.disconnect();
  await adapter.connect('testuser');

  const zweiter = statuses.filter((s) => s.status === 'connected')[1];
  assert.equal(zweiter?.freshStream, true, 'zwei Stunden Pause = neuer Stream');
  await adapter.disconnect();
});

test('Ohne ein einziges Ereignis bleibt es ein neuer Stream', async () => {
  // Wer verbindet, sofort wieder trennt und neu verbindet, hat nichts laufen,
  // das fortgesetzt werden könnte. Sonst würde ein Fehlversuch die Zähler eines
  // längst beendeten Streams künstlich am Leben halten.
  let jetzt = 1_000_000;
  const { adapter, statuses } = setup(() => jetzt);

  await adapter.connect('testuser');
  jetzt += 5_000;
  await adapter.disconnect();
  await adapter.connect('testuser');

  const zweiter = statuses.filter((s) => s.status === 'connected')[1];
  assert.equal(zweiter?.freshStream, true, 'nie ein Ereignis gesehen = nichts fortzusetzen');
  await adapter.disconnect();
});
