import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PointsStore, DEFAULT_POINTS_CONFIG, isNewVisit, istErsterAuftritt } from './points-store';
import type { StudioEvent } from '@botexe/trigger-engine';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'points-'));
}

test('markFollowed: erster Follow → true, Re-Follow → false, Eintrag persistiert', () => {
  const s = new PointsStore(tmpDir());
  assert.equal(s.markFollowed('u1', 'Mia'), true, 'erstes Mal Folgen → true (Jumpscare feuert)');
  assert.equal(s.markFollowed('u1', 'Mia'), false, 'Re-Follow → false (kein Jumpscare)');
  assert.equal(s.markFollowed('u1'), false, 'auch ohne Nickname weiterhin false');
  assert.equal(s.get('u1')?.everFollowed, true, 'Flag persistent gemerkt');
  // Anderer User ist unabhängig.
  assert.equal(s.markFollowed('u2', 'Ben'), true);
});

test('recordWin zählt Spiel-Siege pro User, topWinners sortiert + filtert', () => {
  const s = new PointsStore(tmpDir());
  s.recordWin({ id: 'mia', nickname: 'Mia', profilePic: 'm.jpg' });
  s.recordWin({ id: 'mia', nickname: 'Mia' });
  s.recordWin({ id: 'ben', nickname: 'Ben' });
  s.award('cara', 'Cara', 100); // hat Punkte, aber 0 Siege → nicht in topWinners

  assert.equal(s.get('mia')?.gameWins, 2);
  const top = s.topWinners(10);
  assert.equal(top.length, 2, 'nur User mit Siegen');
  assert.equal(top[0]?.id, 'mia');
  assert.equal(top[0]?.gameWins, 2);
  assert.equal(top[1]?.id, 'ben');
  assert.equal(top[0]?.profilePic, 'm.jpg');
});

test('Leaderboard-Cache wird nach Mutation aktualisiert (nicht stale)', () => {
  const s = new PointsStore(tmpDir());
  s.award('mia', 'Mia', 10);
  s.award('ben', 'Ben', 5);
  assert.deepEqual(s.top(2).map((e) => `${e.id}:${e.points}`), ['mia:10', 'ben:5'], 'erste Sortierung');
  // Nach weiterer Vergabe muss top() die NEUEN Werte zeigen (Cache invalidiert).
  s.award('ben', 'Ben', 20);
  assert.deepEqual(s.top(2).map((e) => `${e.id}:${e.points}`), ['ben:25', 'mia:10'], 'Cache aktualisiert + neu sortiert');
  assert.equal(s.topWinners(5).length, 0);
  s.recordWin({ id: 'mia', nickname: 'Mia' });
  assert.equal(s.topWinners(5).length, 1, 'Winners-Cache nach recordWin frisch');
});

test('Per-User-Likes zählen nur die eigenen (nicht den raumweiten Gesamtzähler)', () => {
  const s = new PointsStore(tmpDir());
  const cfg = { ...DEFAULT_POINTS_CONFIG, enabled: true };
  // totalLikes ist der RAUM-Gesamtwert (48000) — darf NICHT übernommen werden.
  s.recordEvent({ type: 'like', ts: 1, user: { id: 'u', nickname: 'U' }, likeCount: 3, totalLikes: 48000 }, cfg);
  assert.equal(s.get('u')?.likes, 3, 'nur die eigenen 3 Likes, nicht 48000');
  s.recordEvent({ type: 'like', ts: 2, user: { id: 'u', nickname: 'U' }, likeCount: 2, totalLikes: 51000 }, cfg);
  assert.equal(s.get('u')?.likes, 5, 'kumuliert die eigenen (3+2)');
});

test('gameWins überlebt Persistenz', () => {
  const dir = tmpDir();
  const a = new PointsStore(dir);
  a.recordWin({ id: 'mia', nickname: 'Mia' });
  a.save();
  const b = new PointsStore(dir);
  assert.equal(b.get('mia')?.gameWins, 1);
});

test('exportEntries/importEntries: Backup-Roundtrip erhält Punkte + Felder', () => {
  const a = new PointsStore(tmpDir());
  a.award('mia', 'Mia', 50, 'm.jpg');
  a.recordWin({ id: 'mia', nickname: 'Mia' });
  a.setFlag('mia', 'vip', true);
  const dump = a.exportEntries();

  const b = new PointsStore(tmpDir());
  b.importEntries(dump);
  const e = b.get('mia');
  assert.equal(e?.points, 50);
  assert.equal(e?.gameWins, 1);
  assert.equal(e?.vip, true);
  assert.equal(e?.profilePic, 'm.jpg');
});

test('award addiert punkte pro user und merkt nickname/bild', () => {
  const s = new PointsStore(tmpDir());
  s.award('mia', 'Mia', 10, 'pic.jpg');
  s.award('mia', 'Mia', 5);
  const e = s.get('mia');
  assert.equal(e?.points, 15);
  assert.equal(e?.nickname, 'Mia');
  assert.equal(e?.profilePic, 'pic.jpg');
});

test('top liefert die punktreichsten user absteigend, limitiert', () => {
  const s = new PointsStore(tmpDir());
  s.award('a', 'A', 100);
  s.award('b', 'B', 300);
  s.award('c', 'C', 200);
  const top = s.top(2);
  assert.deepEqual(top.map((e) => e.id), ['b', 'c']);
});

test('recordEvent vergibt punkte gemäß config (gift-coins, follow, chat)', () => {
  const s = new PointsStore(tmpDir());
  const cfg = { ...DEFAULT_POINTS_CONFIG, perChat: 1, perFollow: 50, perCoin: 2, perLike: 0 };
  const gift: StudioEvent = { type: 'gift', ts: 1, user: { id: 'mia', nickname: 'Mia' }, gift: { slug: 'rose', count: 1, coinsPerUnit: 10, totalCoins: 10 } };
  assert.equal(s.recordEvent(gift, cfg), 20); // 10 coins * 2
  assert.equal(s.recordEvent({ type: 'follow', ts: 2, user: { id: 'ben', nickname: 'Ben' } }, cfg), 50);
  assert.equal(s.recordEvent({ type: 'chat', ts: 3, user: { id: 'mia', nickname: 'Mia' }, text: 'hi' }, cfg), 1);
  assert.equal(s.get('mia')?.points, 21);
});

test('recordEvent ohne user oder bei deaktiviert vergibt nichts', () => {
  const s = new PointsStore(tmpDir());
  assert.equal(s.recordEvent({ type: 'follow', ts: 1 }, DEFAULT_POINTS_CONFIG), 0);
  assert.equal(
    s.recordEvent({ type: 'follow', ts: 1, user: { id: 'x', nickname: 'X' } }, { ...DEFAULT_POINTS_CONFIG, enabled: false }),
    0,
  );
});

test('Aktivitäts-Statistik läuft auch bei DEAKTIVIERTEM Punkte-System weiter', () => {
  const s = new PointsStore(tmpDir());
  const cfg = { ...DEFAULT_POINTS_CONFIG, enabled: false };
  assert.equal(s.recordEvent({ type: 'chat', ts: 1, user: { id: 'u', nickname: 'U' }, text: 'hi' }, cfg), 0, 'keine Punkte');
  s.recordEvent({ type: 'like', ts: 2, user: { id: 'u', nickname: 'U' }, likeCount: 3 }, cfg);
  const e = s.get('u');
  assert.equal(e?.points ?? 0, 0, 'Punkte bleiben 0');
  assert.equal(e?.visitCount, 1, 'Besuch trotzdem gezählt (Stammgast-Erkennung)');
  assert.equal(e?.totalChats, 1, 'Chat-Statistik trotzdem gepflegt');
  assert.equal(e?.likes, 3, 'Like-Statistik trotzdem gepflegt');
});

test('persistenz: save + neu laden erhält punkte (atomar)', () => {
  const dir = tmpDir();
  const a = new PointsStore(dir);
  a.award('mia', 'Mia', 42);
  a.save();
  const b = new PointsStore(dir);
  assert.equal(b.get('mia')?.points, 42);
});

test('kaputte points-datei → leerer store, kein crash', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'points.json'), '{kaputt');
  const s = new PointsStore(dir);
  assert.equal(s.top(5).length, 0);
});

test('addPoints/redeem: manuelles abziehen für künftige einlösungen', () => {
  const s = new PointsStore(tmpDir());
  s.award('mia', 'Mia', 100);
  assert.equal(s.spend('mia', 30), true);
  assert.equal(s.get('mia')?.points, 70);
  assert.equal(s.spend('mia', 1000), false, 'nicht genug punkte');
  assert.equal(s.get('mia')?.points, 70);
});

// ── Zuschauer-Verwaltung (Erweiterung) ───────────────────────────────────

test('recordEvent trackt zuschauer-statistik (gifts, likes, lastSeen)', () => {
  const s = new PointsStore(tmpDir());
  s.recordEvent({ type: 'gift', ts: 100, user: { id: 'mia', nickname: 'Mia' }, gift: { slug: 'r', count: 1, coinsPerUnit: 50, totalCoins: 50 } }, DEFAULT_POINTS_CONFIG);
  s.recordEvent({ type: 'like', ts: 200, user: { id: 'mia', nickname: 'Mia' }, likeCount: 30, totalLikes: 30 }, DEFAULT_POINTS_CONFIG);
  const v = s.get('mia');
  assert.equal(v?.gifts, 1);
  assert.equal(v?.coins, 50);
  assert.equal(v?.likes, 30);
  assert.equal(v?.lastSeen, 200);
  assert.ok(v?.firstSeen && v.firstSeen <= 100);
});

test('setFlag/isMuted/isVip: zuschauer markieren', () => {
  const s = new PointsStore(tmpDir());
  s.award('troll', 'Troll', 5);
  assert.equal(s.isMuted('troll'), false);
  s.setFlag('troll', 'muted', true);
  assert.equal(s.isMuted('troll'), true);
  s.setFlag('mia', 'vip', true); // legt eintrag an falls neu
  assert.equal(s.isVip('mia'), true);
  s.setFlag('troll', 'muted', false);
  assert.equal(s.isMuted('troll'), false);
});

test('grant: punkte manuell vergeben/abziehen', () => {
  const s = new PointsStore(tmpDir());
  s.award('mia', 'Mia', 100);
  s.grant('mia', -30);
  assert.equal(s.get('mia')?.points, 70);
  s.grant('mia', 1000);
  assert.equal(s.get('mia')?.points, 1070);
});

test('search: findet zuschauer nach name (case-insensitive)', () => {
  const s = new PointsStore(tmpDir());
  s.award('u1', 'MiaGaming', 10);
  s.award('u2', 'BenBot', 20);
  s.award('u3', 'miamia', 5);
  const r = s.search('mia', 10);
  assert.deepEqual(r.map((e) => e.nickname).sort(), ['MiaGaming', 'miamia']);
});

test('migration v1→v2: alte einträge ohne flags bleiben lesbar', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'points.json'), JSON.stringify({ schemaVersion: 1, viewers: [{ id: 'mia', nickname: 'Mia', points: 42 }] }));
  const s = new PointsStore(dir);
  assert.equal(s.get('mia')?.points, 42);
  assert.equal(s.isVip('mia'), false);
});

// — Stammgast-Erkennung: neuer Besuch nach längerer Pause (Standard 4h Lücke).
test('isNewVisit: erster Kontakt zählt als Besuch', () => {
  assert.equal(isNewVisit(undefined, 1000, 4 * 3600 * 1000), true);
});
test('isNewVisit: nach langer Pause neuer Besuch, im selben Stream nicht', () => {
  const gap = 4 * 3600 * 1000;
  assert.equal(isNewVisit(1000, 1000 + 5 * 3600 * 1000, gap), true);  // 5h später → neuer Besuch
  assert.equal(isNewVisit(1000, 1000 + 1 * 3600 * 1000, gap), false); // 1h später → gleicher Stream
});

test('awardWatchTime belohnt nur kürzlich aktive Zuschauer', () => {
  const s = new PointsStore(tmpDir());
  const cfg = { ...DEFAULT_POINTS_CONFIG, enabled: true, perMinute: 5 };
  const now = 1_000_000;
  s.recordEvent({ type: 'chat', ts: now - 60_000, user: { id: 'aktiv', nickname: 'Aktiv' }, text: 'hi' }, cfg);
  s.recordEvent({ type: 'chat', ts: now - 30 * 60_000, user: { id: 'weg', nickname: 'Weg' }, text: 'hi' }, cfg);
  const rewarded = s.awardWatchTime(cfg, now);
  assert.equal(rewarded, 1, 'nur der aktive Zuschauer');
  assert.equal(s.get('aktiv')?.points, 1 + 5, 'Chat-Punkt + Watch-Time');
  assert.equal(s.get('weg')?.points, 1, 'inaktiver bekommt nichts dazu');
  assert.equal(s.awardWatchTime({ ...cfg, perMinute: 0 }, now), 0, 'aus = keine Vergabe');
});

test('Teamherz-Stufe wird dauerhaft gemerkt und nur nach OBEN nachgezogen', () => {
  const s = new PointsStore(tmpDir());
  const ev = (teamLevel?: number, gifterLevel?: number, ts = 1): StudioEvent => ({
    type: 'chat', ts, text: 'hi',
    user: { id: 'u1', nickname: 'Fan', ...(teamLevel ? { teamLevel } : {}), ...(gifterLevel ? { gifterLevel } : {}) },
  });

  s.recordEvent(ev(3, 12), DEFAULT_POINTS_CONFIG);
  assert.equal(s.get('u1')?.teamLevel, 3);
  assert.equal(s.get('u1')?.gifterLevel, 12);

  // Ereignis OHNE Abzeichen darf die bekannte Stufe nicht löschen — genau das
  // war der Grund, warum die Stufe bisher nirgends verlässlich stand.
  s.recordEvent(ev(undefined, undefined, 2), DEFAULT_POINTS_CONFIG);
  assert.equal(s.get('u1')?.teamLevel, 3, 'Stufe bleibt erhalten');
  assert.equal(s.get('u1')?.gifterLevel, 12);

  // Aufstieg wird übernommen.
  s.recordEvent(ev(5, 14, 3), DEFAULT_POINTS_CONFIG);
  assert.equal(s.get('u1')?.teamLevel, 5);
  assert.equal(s.get('u1')?.gifterLevel, 14);

  // Ein niedrigerer Wert (unvollständiges Ereignis) zieht NICHT runter.
  s.recordEvent(ev(1, 2, 4), DEFAULT_POINTS_CONFIG);
  assert.equal(s.get('u1')?.teamLevel, 5);
  assert.equal(s.get('u1')?.gifterLevel, 14);
});

// ── Beziehungs-Angaben aus TikToks Etiketten ───────────────────────────────
// Sie kommen nicht an jeder Nachricht mit. Werden sie beim letzten Wert
// gespeichert, loescht die naechste Nachricht ohne Etiketten alles wieder —
// genau der Fehler, den teamLevel schon einmal hatte.

function chat(overrides: Partial<StudioEvent> = {}): StudioEvent {
  return { type: 'chat', ts: 1_000, user: { id: 'u1', nickname: 'Solo Leveling' }, ...overrides };
}

test('Beziehungs-Angaben werden als HOECHSTWERT gemerkt', () => {
  const s = new PointsStore(tmpDir());
  s.recordEvent(chat({ beziehung: { folgtSeitTagen: 437, fanclubSeitTagen: 424, superfanSeitMonaten: 2 } }), DEFAULT_POINTS_CONFIG);
  // Zweite Nachricht OHNE Etiketten — der Regelfall.
  s.recordEvent(chat({ ts: 2_000 }), DEFAULT_POINTS_CONFIG);
  const e = s.get('u1');
  assert.equal(e?.folgtSeitTagen, 437, 'eine Nachricht ohne Etiketten darf nichts zuruecksetzen');
  assert.equal(e?.fanclubSeitTagen, 424);
  assert.equal(e?.superfanSeitMonaten, 2);
});

test('Top-Gifter bleibt gemerkt — es ist eine Auszeichnung, kein Zustand', () => {
  const s = new PointsStore(tmpDir());
  s.recordEvent(chat({ beziehung: { istTopGifter: true } }), DEFAULT_POINTS_CONFIG);
  s.recordEvent(chat({ ts: 2_000, beziehung: { folgtSeitTagen: 5 } }), DEFAULT_POINTS_CONFIG);
  assert.equal(s.get('u1')?.istTopGifter, true);
});

test('die eigene Follower-Zahl nimmt den LETZTEN Wert — die aendert sich echt', () => {
  const s = new PointsStore(tmpDir());
  s.recordEvent(chat({ user: { id: 'u1', nickname: 'A', followerCount: 1_932 } }), DEFAULT_POINTS_CONFIG);
  s.recordEvent(chat({ ts: 2_000, user: { id: 'u1', nickname: 'A', followerCount: 1_800 } }), DEFAULT_POINTS_CONFIG);
  assert.equal(s.get('u1')?.followerCount, 1_800);
});

test('die Follower-Zahl bleibt stehen, wenn eine Nachricht sie nicht mitbringt', () => {
  const s = new PointsStore(tmpDir());
  s.recordEvent(chat({ user: { id: 'u1', nickname: 'A', followerCount: 1_932 } }), DEFAULT_POINTS_CONFIG);
  s.recordEvent(chat({ ts: 2_000, user: { id: 'u1', nickname: 'A' } }), DEFAULT_POINTS_CONFIG);
  assert.equal(s.get('u1')?.followerCount, 1_932, 'kein Zuruecksetzen auf undefined');
});

test('Herkunft wird beim Beitritt gemerkt', () => {
  const s = new PointsStore(tmpDir());
  s.recordEvent({ type: 'join', ts: 1_000, user: { id: 'u1', nickname: 'A' }, herkunft: 'homepage_hot-live_cell' }, DEFAULT_POINTS_CONFIG);
  assert.equal(s.get('u1')?.herkunft, 'homepage_hot-live_cell');
});

test('ohne Beziehungs-Angaben wird nichts erfunden', () => {
  const s = new PointsStore(tmpDir());
  s.recordEvent(chat(), DEFAULT_POINTS_CONFIG);
  const e = s.get('u1');
  assert.equal(e?.folgtSeitTagen, undefined, 'nicht 0 — unbekannt ist etwas anderes als „seit null Tagen"');
  assert.equal(e?.istTopGifter, undefined);
});

test('treueVerteilung: „unbekannt" ist eine eigene Gruppe, kein Neuling', () => {
  const s = new PointsStore(tmpDir());
  s.recordEvent(chat({ user: { id: 'a', nickname: 'A' }, beziehung: { folgtSeitTagen: 874 } }), DEFAULT_POINTS_CONFIG);
  s.recordEvent(chat({ user: { id: 'b', nickname: 'B' }, beziehung: { folgtSeitTagen: 40 } }), DEFAULT_POINTS_CONFIG);
  s.recordEvent(chat({ user: { id: 'c', nickname: 'C' }, beziehung: { folgtSeitTagen: 10 } }), DEFAULT_POINTS_CONFIG);
  s.recordEvent(chat({ user: { id: 'd', nickname: 'D' }, beziehung: { folgtSeitTagen: 3 } }), DEFAULT_POINTS_CONFIG);
  s.recordEvent(chat({ user: { id: 'e', nickname: 'E' } }), DEFAULT_POINTS_CONFIG);
  assert.deepEqual(s.treueVerteilung(), { neu: 1, wochen: 1, monate: 1, jahr: 1, unbekannt: 1 });
});

test('treueVerteilung: leerer Store liefert lauter Nullen', () => {
  assert.deepEqual(new PointsStore(tmpDir()).treueVerteilung(),
    { neu: 0, wochen: 0, monate: 0, jahr: 0, unbekannt: 0 });
});

// ── „Zum ersten Mal da" ────────────────────────────────────────────────────
// Regression aus dieser Runde: Seit der Beitritt in der Statistik landet (fuer
// die Herkunft), existiert der Eintrag beim ersten Kommentar schon. Wer
// „erster Auftritt" mit „Eintrag existiert nicht" gleichsetzt, bricht damit die
// Begruessung „Neue begruessen" (chat_first_time) fuer praktisch jeden.

test('istErsterAuftritt: voellig unbekannter Zuschauer', () => {
  assert.equal(istErsterAuftritt(undefined, 'chat'), true);
  assert.equal(istErsterAuftritt(undefined, 'join'), true);
});

test('istErsterAuftritt: bekannt vom BEITRITT, aber erste Nachricht', () => {
  // Genau der Fall, der die Begruessung gekillt hat.
  assert.equal(istErsterAuftritt({ totalChats: 0 }, 'chat'), true,
    'wer noch nie geschrieben hat, schreibt beim ersten Mal ZUM ERSTEN MAL');
});

test('istErsterAuftritt: wer schon geschrieben hat, ist nicht mehr neu', () => {
  assert.equal(istErsterAuftritt({ totalChats: 1 }, 'chat'), false);
  assert.equal(istErsterAuftritt({ totalChats: 42 }, 'chat'), false);
});

test('istErsterAuftritt: andere Ereignisarten machen niemanden neu', () => {
  // Sonst waere ein bekannter Zuschauer bei jedem Like wieder „zum ersten Mal da".
  assert.equal(istErsterAuftritt({ totalChats: 0 }, 'like'), false);
  assert.equal(istErsterAuftritt({ totalChats: 0 }, 'join'), false);
});

test('Beitritt und danach erste Nachricht: die Begruessung greift noch', () => {
  const s = new PointsStore(tmpDir());
  s.recordEvent({ type: 'join', ts: 1_000, user: { id: 'u1', nickname: 'A' }, herkunft: 'x' }, DEFAULT_POINTS_CONFIG);
  assert.equal(istErsterAuftritt(s.get('u1'), 'chat'), true, 'nach dem Beitritt ist die erste Nachricht immer noch die erste');
  s.recordEvent(chat({ ts: 2_000, user: { id: 'u1', nickname: 'A' } }), DEFAULT_POINTS_CONFIG);
  assert.equal(istErsterAuftritt(s.get('u1'), 'chat'), false, 'danach nicht mehr');
});

test('Zuschauzeit-Punkte gibt es nur fuer echte Aktivitaet, nicht fuers Hereinschauen', () => {
  const s = new PointsStore(tmpDir());
  const cfg = { ...DEFAULT_POINTS_CONFIG, perMinute: 5 };
  s.recordEvent({ type: 'join', ts: 1_000, user: { id: 'lurker', nickname: 'L' } }, cfg);
  s.recordEvent(chat({ ts: 1_000, user: { id: 'aktiv', nickname: 'A' } }), cfg);

  assert.equal(s.awardWatchTime(cfg, 2_000), 1, 'nur der Aktive bekommt Zuschauzeit');
  assert.equal(s.get('lurker')?.points ?? 0, 0, 'wer nur hereinschaut, sammelt nichts');
});

test('search: die Sortierung entscheidet, WER in den ersten Plaetzen landet', () => {
  // Der Kern des Problems: Der Hauptprozess liefert nur die ersten 200. Wurde
  // immer nach Punkten geschnitten, war der treueste Zuschauer mit wenig
  // Punkten gar nicht dabei — keine Sortierung der Oberflaeche konnte ihn
  // danach noch hervorholen.
  const s = new PointsStore(tmpDir());
  s.recordEvent(chat({ user: { id: 'reich', nickname: 'Reich' }, beziehung: { folgtSeitTagen: 3 } }), DEFAULT_POINTS_CONFIG);
  s.grant('reich', 10_000);
  s.recordEvent(chat({ user: { id: 'treu', nickname: 'Treu' }, beziehung: { folgtSeitTagen: 874 } }), DEFAULT_POINTS_CONFIG);

  assert.equal(s.search('', 1, 'punkte')[0]?.id, 'reich');
  assert.equal(s.search('', 1, 'treue')[0]?.id, 'treu', 'bei „Treue" muss der Treueste den ersten Platz kriegen');
});

test('search: ohne Angabe landet man hinten, nicht bei null', () => {
  const s = new PointsStore(tmpDir());
  s.recordEvent(chat({ user: { id: 'ohne', nickname: 'Ohne' } }), DEFAULT_POINTS_CONFIG);
  s.recordEvent(chat({ user: { id: 'mit', nickname: 'Mit' }, beziehung: { folgtSeitTagen: 5 } }), DEFAULT_POINTS_CONFIG);
  assert.deepEqual(s.search('', 10, 'treue').map((e) => e.id), ['mit', 'ohne']);
});
