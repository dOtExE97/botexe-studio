import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldReadChat, containsBlockedWord, migrateReadWho, istNurEineZahl, stufeWirktNicht, niemandWirdVorgelesen, entferneEmoji, nameOhneEmoji } from './tts-filter';
import type { StudioEvent } from '@botexe/trigger-engine';

function chat(text: string, user: Partial<NonNullable<StudioEvent['user']>> = {}): StudioEvent {
  return { type: 'chat', ts: 1, text, user: { id: 'u1', nickname: 'Mia', ...user } };
}

test('containsBlockedWord: case-insensitiv, Teilwort, Leerliste = nie blockiert', () => {
  const words = ['Idiot', 'spam'];
  assert.equal(containsBlockedWord('du IDIOT!', words), true);
  assert.equal(containsBlockedWord('keine spammerei', words), true);
  assert.equal(containsBlockedWord('alles gut', words), false);
  assert.equal(containsBlockedWord('idiot', []), false);
  assert.equal(containsBlockedWord('', words), false);
});

test('Gruppen all: jeder wird vorgelesen', () => {
  assert.deepEqual(shouldReadChat(chat('hi'), ['all'], '', false), { read: true, text: 'hi' });
});

test('Multi-Select: liest, wer in MIND. EINER angekreuzten Gruppe ist (OR)', () => {
  const groups = ['mods', 'followers'] as const;
  assert.equal(shouldReadChat(chat('hi', { isMod: true }), [...groups], '', false).read, true);
  assert.equal(shouldReadChat(chat('hi', { isFollower: true }), [...groups], '', false).read, true);
  assert.equal(shouldReadChat(chat('hi', { isSub: true }), [...groups], '', false).read, false); // Sub nicht angekreuzt
  assert.equal(shouldReadChat(chat('hi'), [...groups], '', false).read, false); // niemand
});

test('einzelne Gruppe trifft NUR diese Gruppe (keine Hierarchie mehr)', () => {
  // Teamherz angekreuzt → ein Mod (ohne Sub-Flag) wird NICHT automatisch mitgelesen
  assert.equal(shouldReadChat(chat('hi', { isMod: true }), ['subs'], '', false).read, false);
  assert.equal(shouldReadChat(chat('hi', { isSub: true }), ['subs'], '', false).read, true);
});

test('App-VIP wird immer vorgelesen, egal welche Gruppen', () => {
  assert.equal(shouldReadChat(chat('hi'), ['mods'], '', true).read, true);
  assert.equal(shouldReadChat(chat('hi'), [], '', true).read, true);
});

test('leere Gruppenliste → niemand (außer App-VIP)', () => {
  assert.equal(shouldReadChat(chat('hi', { isMod: true }), [], '', false).read, false);
});

test('prefix: nur Nachrichten mit Start-Zeichen, Prefix wird entfernt', () => {
  assert.equal(shouldReadChat(chat('hallo'), ['all'], '.', false).read, false);
  const r = shouldReadChat(chat('.hallo zusammen'), ['all'], '.', false);
  assert.equal(r.read, true);
  assert.equal(r.text, 'hallo zusammen');
});

test('prefix kombiniert mit Gruppe: beides muss passen', () => {
  assert.equal(shouldReadChat(chat('.hi'), ['subs'], '.', false).read, false);
  assert.equal(shouldReadChat(chat('.hi', { isSub: true }), ['subs'], '.', false).read, true);
});

test('reason: warum übersprungen — Prefix fehlt vs nicht in Gruppe', () => {
  // Ohne Prefix übersprungen → reason 'prefix' (auch wenn die Rolle passt!)
  assert.equal(shouldReadChat(chat('hallo', { isMod: true }), ['mods'], '.', false).reason, 'prefix');
  // Prefix passt, aber Gruppe nicht → reason 'group'
  assert.equal(shouldReadChat(chat('hi', { isSub: true }), ['mods'], '', false).reason, 'group');
  // Wird vorgelesen → kein reason
  assert.equal(shouldReadChat(chat('.hi', { isMod: true }), ['mods'], '.', false).reason, undefined);
});

test('migrateReadWho: alte Einstellung → Gruppen-Array (altes Verhalten erhalten)', () => {
  assert.deepEqual(migrateReadWho('all'), ['all']);
  assert.deepEqual(migrateReadWho('followers'), ['followers', 'subs', 'mods']); // war hierarchisch
  assert.deepEqual(migrateReadWho('subs'), ['subs', 'mods']);
  assert.deepEqual(migrateReadWho('mods'), ['mods']);
  assert.deepEqual(migrateReadWho('vips'), ['vips']);
  assert.deepEqual(migrateReadWho('quatsch'), ['all']); // Fallback
});

// Mindest-Teamherz-Stufe: TikTok liefert die Stufe als Fan-Club-Level mit.
// „Erst ab Stufe 3 vorlesen" ist ein Wunsch von Streamern mit vielen Teamherzen.
//
// ACHTUNG, die Gruppe heisst jetzt 'teamherz', nicht mehr 'subs': Die Stufe
// gehoert zum gratis Fanclub, nicht zum bezahlten Superfan-Abo. Bis dahin hing
// sie unter „Superfans" — man musste BEIDES sein, damit der Filter griff.
test('teamMinLevel: unter der Schwelle wird nicht vorgelesen', () => {
  const e = { type: 'chat', ts: 0, text: 'hi', user: { id: 'a', nickname: 'A', teamLevel: 2 } } as StudioEvent;
  assert.equal(shouldReadChat(e, ['teamherz'], '', false, 3).read, false);
  assert.equal(shouldReadChat(e, ['teamherz'], '', false, 2).read, true, 'genau auf der Schwelle zaehlt');
  assert.equal(shouldReadChat(e, ['teamherz'], '', false, 0).read, true, '0 = keine Schwelle');
});

test('ohne Teamherz-Stufe gehoert man nicht zur Gruppe „Teamherz"', () => {
  // Frueher galt hier „unbekannte Stufe → trotzdem vorlesen", weil die Gruppe
  // ein Superfan-Abo meinte und die Stufe nur ein Zusatzfilter war. Jetzt IST
  // die Stufe das Merkmal: keine Stufe = kein Teamherz. Wer ein bezahltes Abo
  // hat, wird ueber die eigene Gruppe „Superfans" erfasst.
  const e = { type: 'chat', ts: 0, text: 'hi', user: { id: 'a', nickname: 'A', isSub: true } } as StudioEvent;
  assert.equal(shouldReadChat(e, ['teamherz'], '', false, 5).read, false);
  assert.equal(shouldReadChat(e, ['subs'], '', false, 5).read, true, 'als Superfan aber schon');
});

test('teamMinLevel: gilt NUR fuer die Teamherz-Gruppe', () => {
  // Ein Mod mit niedriger Stufe darf nicht wegen der Teamherz-Schwelle rausfallen.
  const mod = { type: 'chat', ts: 0, text: 'hi', user: { id: 'm', nickname: 'M', isMod: true, isSub: true, teamLevel: 1 } } as StudioEvent;
  assert.equal(shouldReadChat(mod, ['mods', 'subs'], '', false, 9).read, true, 'als Mod trotzdem vorlesen');
  // Und „alle" bleibt unberuehrt.
  const jeder = { type: 'chat', ts: 0, text: 'hi', user: { id: 'x', nickname: 'X', isSub: true, teamLevel: 1 } } as StudioEvent;
  assert.equal(shouldReadChat(jeder, ['all'], '', false, 9).read, true);
});

// ── Reine Zahlen (Zahlenraten) ─────────────────────────────────────────────
// Gemeldet: Läuft ein Zahlenraten-Spiel, liest die Sprachausgabe minutenlang
// einzelne Zahlen vor. Das ist kein Filterfehler — es ist einfach keine
// sinnvolle Ansage.

test('nackte Zahlen werden als solche erkannt', () => {
  assert.equal(istNurEineZahl('42'), true);
  assert.equal(istNurEineZahl('  7 '), true);
  assert.equal(istNurEineZahl('1.000'), true, 'mit Tausenderpunkt');
  assert.equal(istNurEineZahl('12,5'), true);
  assert.equal(istNurEineZahl('42 42'), true, 'mehrere Tipps in einer Zeile');
});

test('Sätze MIT Zahlen bleiben — wer schreibt, will vorgelesen werden', () => {
  assert.equal(istNurEineZahl('ich sage 42'), false);
  assert.equal(istNurEineZahl('42!'), false);
  assert.equal(istNurEineZahl('42?'), false);
  assert.equal(istNurEineZahl('nummer 7 bitte'), false);
  assert.equal(istNurEineZahl(''), false);
  assert.equal(istNurEineZahl('   '), false);
  assert.equal(istNurEineZahl('abc'), false);
});

// ── Die stille Falle: Stufe ohne Wirkung ───────────────────────────────────
// Gemeldet als „TTS nur ab Teamherz-Stufe 3, es wird trotzdem alles
// vorgelesen". Kein Fehler in der Stufenerkennung: Die Gruppen sind
// ODER-verknüpft, und „Alle Zuschauer" trifft immer zuerst zu.

test('mit „Alle" angekreuzt ist die Teamherz-Stufe wirkungslos', () => {
  assert.equal(stufeWirktNicht(['all', 'subs'], 3), true);
  const zufall: StudioEvent = {
    type: 'chat', ts: 1, text: '42',
    user: { id: '1', nickname: 'zufall', isSub: false },
  } as StudioEvent;
  assert.equal(shouldReadChat(zufall, ['all', 'subs'], '', false, 3).read, true,
    'genau das ist die Überraschung: Stufe 3 eingestellt, trotzdem wird jeder vorgelesen');
});

test('ohne „Alle" greift die Stufe wie erwartet', () => {
  assert.equal(stufeWirktNicht(['teamherz'], 3), false);
  const zufall: StudioEvent = {
    type: 'chat', ts: 1, text: '42',
    user: { id: '1', nickname: 'zufall' },
  } as StudioEvent;
  const stufe1: StudioEvent = {
    type: 'chat', ts: 1, text: '42',
    user: { id: '2', nickname: 't1', teamLevel: 1 },
  } as StudioEvent;
  assert.equal(shouldReadChat(zufall, ['teamherz'], '', false, 3).read, false);
  assert.equal(shouldReadChat(stufe1, ['teamherz'], '', false, 3).read, false, 'Stufe 1 < 3');
});

test('ohne eingestellte Stufe gibt es keine Warnung', () => {
  assert.equal(stufeWirktNicht(['all', 'teamherz'], 0), false);
  assert.equal(stufeWirktNicht(['all'], 0), false);
});

// ── Die andere Hälfte der Falle: gar kein Häkchen ──────────────────────────
// Gemeldet als Rückfrage: „war es nicht neulich so, dass ohne Haken NICHTS
// vorgelesen wurde?" — Ja. Und begründet wurde es nur auf der Debug-Ebene,
// die kein Nutzer sieht. Man nimmt das Häkchen weg (damit die Teamherz-Stufe
// greift), es wird still, und man setzt es ratlos wieder rein.

test('ohne jedes Häkchen wird NIEMAND vorgelesen', () => {
  assert.equal(niemandWirdVorgelesen([]), true);
  const follower: StudioEvent = {
    type: 'chat', ts: 1, text: 'hallo',
    user: { id: '1', nickname: 'Mia', isFollower: true },
  } as StudioEvent;
  const teamherz: StudioEvent = {
    type: 'chat', ts: 1, text: 'hallo',
    user: { id: '2', nickname: 'T3', isSub: true, teamLevel: 3 },
  } as StudioEvent;
  assert.equal(shouldReadChat(follower, [], '', false, 0).read, false);
  assert.equal(shouldReadChat(teamherz, [], '', false, 0).read, false,
    'auch ein Teamherz der Stufe 3 nicht');
});

test('★VIPs kommen auch ohne Häkchen durch', () => {
  // Wichtig für den Wortlaut des Hinweises: „nur deine ★VIPs kommen noch
  // durch" — das muss auch stimmen.
  const vip: StudioEvent = {
    type: 'chat', ts: 1, text: 'hallo', user: { id: '9', nickname: 'Stammgast' },
  } as StudioEvent;
  assert.equal(shouldReadChat(vip, [], '', true, 0).read, true);
});

test('mit mindestens einem Häkchen gibt es keine Warnung', () => {
  assert.equal(niemandWirdVorgelesen(['followers']), false);
  assert.equal(niemandWirdVorgelesen(['all']), false);
});

// ── Superfan ≠ Teamherz ────────────────────────────────────────────────────
// Zwei verschiedene Dinge, die lange EIN Häkchen waren:
//   Superfan = bezahltes Abo (isSub), kein Stufensystem
//   Teamherz = gratis Fanclub (teamLevel), MIT Stufe
// Solange die Stufe unter „Superfans" hing, musste man beides sein.

const nurTeamherz = (stufe: number): StudioEvent => ({
  type: 'chat', ts: 1, text: 'hallo',
  user: { id: 't', nickname: 'Teamherz', isSub: false, teamLevel: stufe },
} as StudioEvent);
const nurSuperfan: StudioEvent = {
  type: 'chat', ts: 1, text: 'hallo',
  user: { id: 's', nickname: 'Superfan', isSub: true },
} as StudioEvent;

test('Teamherz ohne Superfan-Abo zählt zur Gruppe „Teamherz"', () => {
  assert.equal(shouldReadChat(nurTeamherz(5), ['teamherz'], '', false, 3).read, true);
  assert.equal(shouldReadChat(nurTeamherz(1), ['teamherz'], '', false, 3).read, false, 'Stufe 1 < 3');
});

test('Superfan ohne Teamherz zählt zur Gruppe „Superfans" — Stufe egal', () => {
  assert.equal(shouldReadChat(nurSuperfan, ['subs'], '', false, 3).read, true,
    'die Mindeststufe gehört zum Teamherz und darf den Superfan nicht aussperren');
});

test('die Gruppen greifen NICHT übers Kreuz', () => {
  assert.equal(shouldReadChat(nurTeamherz(5), ['subs'], '', false, 0).read, false,
    'ein Teamherz ist kein Superfan');
  assert.equal(shouldReadChat(nurSuperfan, ['teamherz'], '', false, 0).read, false,
    'ein Superfan ist kein Teamherz');
});

test('ohne Teamherz-Gruppe zeigt die Stufe ins Leere', () => {
  assert.equal(stufeWirktNicht(['subs'], 3), true, 'Stufe eingestellt, aber Teamherz nicht angekreuzt');
  assert.equal(stufeWirktNicht(['teamherz'], 3), false);
  assert.equal(stufeWirktNicht(['teamherz', 'all'], 3), true, '„Alle" schlägt alles');
});

// ── Emojis ─────────────────────────────────────────────────────────────────

test('Emojis fliegen samt Beiwerk raus', () => {
  assert.equal(entferneEmoji('☀️Sarüüüh❤️✨☀️'), 'Sarüüüh');
  assert.equal(entferneEmoji('hallo 😂😂 alles gut'), 'hallo alles gut');
  assert.equal(entferneEmoji('Lea 🪐'), 'Lea');
  // Zusammengesetzte Emojis hinterlassen keine unsichtbaren Fugen.
  assert.equal(entferneEmoji('Familie 👨‍👩‍👧 da'), 'Familie da');
  assert.equal(entferneEmoji('Daumen 👍🏽 hoch'), 'Daumen hoch');
  assert.equal(entferneEmoji('Flagge 🇩🇪 hier'), 'Flagge hier');
});

test('Text ohne Emojis bleibt unverändert — auch Zahlen und Umlaute', () => {
  assert.equal(entferneEmoji('Grüße aus Köln, 42 mal'), 'Grüße aus Köln, 42 mal');
  assert.equal(entferneEmoji('1.000 Punkte!'), '1.000 Punkte!');
});

test('ein Name aus lauter Emojis bleibt stehen statt leer zu werden', () => {
  // Sonst sagte die Ansage „ sagt: hallo" — schlimmer als ein paar Bildzeichen.
  assert.equal(nameOhneEmoji('🌸🌸🌸'), '🌸🌸🌸');
  assert.equal(nameOhneEmoji('☀️Sarüüüh❤️'), 'Sarüüüh');
  assert.equal(nameOhneEmoji('dOtExE_97'), 'dOtExE_97');
});
