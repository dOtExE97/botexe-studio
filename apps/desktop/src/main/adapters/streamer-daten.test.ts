// streamer-daten.test.ts — Name, Bild, Titel, Follower und Startzeit des
// Streamers.
//
// DIESE FUNKTION LAG SCHON ZWEIMAL DANEBEN, beide Male durch Raten:
//   1. Sie suchte nach `owner` und wartete auf einen `roomInfo`-Rahmen, den es
//      angeblich nicht gibt. Ergebnis: Name und Bild blieben JAHRELANG leer,
//      ohne dass irgendwo ein Fehler stand.
//   2. Nach der ersten Korrektur fand sie den Namen (aus der Live-Ansage), aber
//      weiter kein Bild — denn im roomInfo-Rahmen heißt es `avatarUrl` und ist
//      eine fertige Adresse als Text, kein Objekt mit `url_list`.
//
// Die Fixtures unten sind ABGESCHRIEBEN aus einem echten Diagnose-Log
// (05.08.2026), nicht ausgedacht. Deshalb stehen hier die Feldnamen so, wie
// TikTok sie wirklich schickt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { leseHost } from './tiktok-cloud';

/** Belegt: roomInfo{status,isLive,id,coverUrl,title,startTime,totalViewers},
 *          user{avatarUrl,nickname,secUid,numericUid,isVerified,following,followers,uniqueId} */
const ROOM_INFO = {
  raw: { note: '…' },
  roomInfo: {
    status: 2, isLive: true, id: '7069026870822716421',
    coverUrl: 'https://p16.tiktokcdn.com/cover.jpeg',
    title: 'ROAD TO 4K FOLLOWER!',
    startTime: 1_754_420_000, // Sekunden!
    totalViewers: 412,
  },
  user: {
    avatarUrl: 'https://p16.tiktokcdn.com/avatar.jpeg',
    nickname: 'dOtExE_97',
    secUid: 'MS4wLjA…', numericUid: '6635416940436602885',
    isVerified: false, following: 210, followers: 3412,
    uniqueId: 'dotexe97',
  },
  uniqueId: 'dotexe97',
};

/** Belegt: host{userId,nickname,bioDescription,profilePicture,…}, description, language */
const LIVE_INTRO = {
  roomId: '7069026870822716421',
  description: 'Neuer Streamer :) Kommt rein und bleibt gerne <3',
  host: {
    userId: '6635416940436602885',
    nickname: 'dOtExE_97',
    bioDescription: 'Zocken & Quatschen',
    profilePicture: { urlList: ['https://p16.tiktokcdn.com/avatar-intro.jpeg'] },
  },
  language: 'de',
};

test('roomInfo: Name, BILD, Titel, Follower und Startzeit', () => {
  const h = leseHost(ROOM_INFO);
  assert.equal(h?.nickname, 'dOtExE_97');
  assert.equal(h?.avatar, 'https://p16.tiktokcdn.com/avatar.jpeg',
    'avatarUrl ist eine fertige Adresse als Text — genau daran ist es zweimal gescheitert');
  assert.equal(h?.titel, 'ROAD TO 4K FOLLOWER!');
  assert.equal(h?.follower, 3412);
  assert.equal(h?.startetAt, 1_754_420_000_000, 'Sekunden werden zu Millisekunden');
});

test('Live-Ansage: Name, Bild aus der Objekt-Form, Titel, Sprache', () => {
  const h = leseHost(LIVE_INTRO);
  assert.equal(h?.nickname, 'dOtExE_97');
  assert.equal(h?.avatar, 'https://p16.tiktokcdn.com/avatar-intro.jpeg', 'hier IST es ein Objekt mit urlList');
  assert.equal(h?.titel, 'Neuer Streamer :) Kommt rein und bleibt gerne <3');
  assert.equal(h?.sprache, 'de');
  assert.equal(h?.follower, undefined, 'die Live-Ansage kennt keine Follower-Zahl');
});

test('Startzeit: Sekunden UND Millisekunden werden erkannt', () => {
  const ms = leseHost({ roomInfo: { startTime: 1_754_420_000_000 } })?.startetAt;
  assert.equal(ms, 1_754_420_000_000, 'Millisekunden bleiben Millisekunden');
  const sek = leseHost({ roomInfo: { startTime: 1_754_420_000 } })?.startetAt;
  assert.equal(sek, 1_754_420_000_000, 'Sekunden werden umgerechnet');
});

test('Unfug bei der Startzeit wird verworfen, nicht weitergereicht', () => {
  // Eine 0, eine 1970er-Zeit oder ein Wert aus der Zukunft wären in der
  // Auswertung schlimmer als gar keine Zeit: Sie erzeugen einen Stream, der
  // angeblich 56 Jahre lief.
  assert.equal(leseHost({ roomInfo: { startTime: 0 } })?.startetAt, undefined);
  assert.equal(leseHost({ roomInfo: { startTime: 12345 } })?.startetAt, undefined, 'zu alt');
  assert.equal(leseHost({ roomInfo: { startTime: Date.now() + 86_400_000 } })?.startetAt, undefined, 'Zukunft');
  assert.equal(leseHost({ roomInfo: { startTime: 'kaputt' } })?.startetAt, undefined);
});

test('leere oder kaputte Rahmen ergeben nichts — statt halber Wahrheiten', () => {
  assert.equal(leseHost(undefined), undefined);
  assert.equal(leseHost({}), undefined);
  assert.equal(leseHost({ user: {} }), undefined);
  assert.equal(leseHost('kaputt'), undefined);
  assert.equal(leseHost({ user: { nickname: '' } }), undefined, 'ein leerer Name ist kein Name');
});

test('nur das, was wirklich da ist — keine leeren Felder', () => {
  const h = leseHost({ user: { nickname: 'Nur ein Name' } });
  assert.deepEqual(h, { nickname: 'Nur ein Name' },
    'kein avatar:"" und kein follower:0 — sonst überschreibt es später echte Werte');
});

test('SELBSTTEST: die alte Fassung hätte das Bild NICHT gefunden', () => {
  // So sah sie aus: nur die Objekt-Form, nur unter `owner`/`host`.
  const alt = (o: Record<string, unknown>) => {
    const bild = o['profilePicture'] as { urlList?: string[] } | undefined;
    return bild?.urlList?.[0];
  };
  assert.equal(alt(ROOM_INFO.user as unknown as Record<string, unknown>), undefined,
    'die alte Fassung fand im roomInfo-Rahmen nichts …');
  assert.ok(leseHost(ROOM_INFO)?.avatar, '… die neue findet das Bild');
});

// ── Die eigene Nutzer-ID ───────────────────────────────────────────────────
// Wozu: Im PK-Kampf stehen die Punkte in einem Objekt, dessen SCHLÜSSEL die
// Streamer-IDs sind. Ohne die eigene ID lässt sich nicht sagen, welche der
// beiden Zahlen die eigene ist — im Log stand deshalb „4200 : 3100" in
// beliebiger Reihenfolge.
//
// Der Stolperstein steckt in den Schreibweisen: Die Typdefinition des SDK sagt
// `numeric_uid`, auf der Leitung kommt `numericUid`. Beide müssen gelesen
// werden, sonst findet man nichts und merkt es nicht.

test('roomInfo: die eigene Nutzer-ID wird gelesen (Höckerschrift!)', () => {
  assert.equal(leseHost(ROOM_INFO)?.userId, '6635416940436602885');
});

test('Live-Ansage: dort heißt dasselbe Feld userId', () => {
  assert.equal(leseHost(LIVE_INTRO)?.userId, '6635416940436602885');
});

test('auch die Unterstrich-Schreibweise der Typdefinition trifft', () => {
  const h = leseHost({ user: { nickname: 'x', numeric_uid: '6635416940436602885' } });
  assert.equal(h?.userId, '6635416940436602885');
});

test('der Direktweg nennt es id_str', () => {
  assert.equal(leseHost({ user: { nickname: 'x', id_str: '6635416940436602885' } })?.userId,
    '6635416940436602885');
});

test('eine ID als ZAHL wird abgewiesen, wenn sie nicht mehr heil sein kann', () => {
  // TikTok-IDs haben 19 Stellen, JavaScript rechnet nur 16 sicher: Aus
  // …602885 wird beim Einlesen …603000. Diese Zahl SIEHT richtig aus, passt
  // aber nie zu den Schlüsseln im PK-Punktestand — „du führst" ginge dauerhaft
  // nicht, ohne dass irgendwo ein Fehler stünde. Deshalb: lieber nichts.
  // Die Zahl wird ABSICHTLICH aus Text erzeugt: Als Literal beanstandet der
  // Linter sie zu Recht („verliert zur Laufzeit an Genauigkeit") — und genau
  // dieser Verlust ist der Fall, den wir hier nachstellen wollen.
  const kaputt = Number('6635416940436602885');
  const h = leseHost({ user: { nickname: 'x', id: kaputt } });
  assert.equal(h?.userId, undefined, 'gerundete Zahl wird NICHT übernommen');
});

test('… aber eine kleine Zahl ist unbedenklich und zählt', () => {
  assert.equal(leseHost({ user: { nickname: 'x', id: 123456789 } })?.userId, '123456789');
});

test('steht die ID daneben als Text, wird die kaputte Zahl übergangen', () => {
  // Der eigentliche Grund, warum es die Text-Felder gibt: Beide Formen liegen
  // im selben Objekt, und die heile muss gewinnen.
  const h = leseHost({
    user: { nickname: 'x', id: Number('6635416940436602885'), id_str: '6635416940436602885' },
  });
  assert.equal(h?.userId, '6635416940436602885');
});

test('die secUid wird NICHT als ID genommen', () => {
  // Sie steht direkt daneben und sieht nach Kennung aus — passt aber nie zu den
  // Schlüsseln im PK-Punktestand. Würde sie durchrutschen, gäbe es keinen
  // Fehler, nur dauerhaft falsche Zuordnung.
  const h = leseHost({ user: { nickname: 'x', secUid: 'MS4wLjABAAAAxyz123' } });
  assert.equal(h?.userId, undefined);
});

test('offensichtlicher Unfug wird abgewiesen', () => {
  assert.equal(leseHost({ user: { nickname: 'x', userId: '' } })?.userId, undefined);
  assert.equal(leseHost({ user: { nickname: 'x', userId: '123' } })?.userId, undefined,
    'zu kurz für eine TikTok-ID');
  assert.equal(leseHost({ user: { nickname: 'x', userId: 'abc123def456' } })?.userId, undefined);
});

test('fehlt die ID, bleibt der Rest heil', () => {
  const h = leseHost({ user: { nickname: 'dOtExE_97', avatarUrl: 'https://x/a.jpg' } });
  assert.equal(h?.userId, undefined);
  assert.equal(h?.nickname, 'dOtExE_97', 'Name kommt trotzdem an');
});
