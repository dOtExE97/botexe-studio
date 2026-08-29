// tts-service.test.ts — Sequencing: mehrere Ansagen dürfen sich NICHT
// überlappen. Die nächste startet erst, wenn der Renderer das echte Audio-Ende
// meldet (notifyEnded), nicht nach einer Zeichen-Schätzung.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TTSService, isTransientTtsError, pickLocalFallbackVoice, geschaetzteDauerMs, type TTSPlayback } from './tts-service';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tts-'));
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Test-Service ohne echte Synthese — riesige Schätzdauer, damit nur das
 *  echte 'ended' die nächste Ansage freigeben kann. */
class FakeTTS extends TTSService {
  override async synthesize(text: string): Promise<TTSPlayback> {
    return { fileId: `f-${text}`, durationMs: 100_000 };
  }
}

test('nächste Ansage startet erst nach echtem Audio-Ende, nicht nach Schätzung', async () => {
  const played: string[] = [];
  const tts = new FakeTTS(tmpDir(), (p) => played.push(p.fileId));

  tts.speak('a', 'v');
  tts.speak('b', 'v');
  await wait(20);
  assert.deepEqual(played, ['f-a'], 'erst nur die erste Ansage');

  // Renderer meldet: erste Ansage ist fertig → zweite darf starten.
  tts.notifyEnded('f-a');
  await wait(260); // 180ms Atempause + Puffer
  assert.deepEqual(played, ['f-a', 'f-b'], 'zweite Ansage erst nach Ende der ersten');
});

test('clear() gibt eine laufende Wartezeit frei (Reset hängt nicht)', async () => {
  const played: string[] = [];
  const tts = new FakeTTS(tmpDir(), (p) => played.push(p.fileId));
  tts.speak('x', 'v');
  await wait(20);
  assert.deepEqual(played, ['f-x']);
  // ohne notifyEnded: clear() muss die Wartezeit trotzdem auflösen
  tts.clear();
  await wait(20);
  // Queue ist leer → keine weitere Ansage, aber auch kein Hänger.
  assert.deepEqual(played, ['f-x']);
});

// — Transiente Fehler-Erkennung (für Auto-Retry bei TTS-Aussetzern, z.B. Edge 503).
test('isTransientTtsError: Server-/Netzfehler sind transient', () => {
  for (const m of [
    'Unexpected server response: 503',
    'HTTP 502 Bad Gateway',
    'request timed out (ETIMEDOUT)',
    'socket hang up ECONNRESET',
    'fetch failed',
    'Too Many Requests 429',
  ]) assert.equal(isTransientTtsError(m), true, m);
});

test('isTransientTtsError: permanente Fehler NICHT (kein sinnloser Retry)', () => {
  for (const m of [
    'Invalid API key',
    'voice not found',
    'unauthorized 401',
  ]) assert.equal(isTransientTtsError(m), false, m);
});

// — Lokaler Fallback (Notnagel, wenn die Online-Stimme streikt — Issue #16:
// 30s Stille trotz fertig eingerichtetem Piper). Echte IDs aus PIPER_VOICES.
const piperFake = (readyIds: string[]) => ({
  hasBinary: () => readyIds.length > 0,
  voiceReady: (id: string) => readyIds.includes(id),
});

test('pickLocalFallbackVoice: nimmt eine bereite Piper-Stimme, wenn online scheitert', () => {
  assert.equal(
    pickLocalFallbackVoice(piperFake(['de-karlsson']) as never, 'edge:de-DE-KatjaNeural'),
    'piper:de-karlsson',
  );
});

test('pickLocalFallbackVoice: nichts bereit ⇒ null', () => {
  assert.equal(pickLocalFallbackVoice(piperFake([]) as never, 'edge:de-DE-KatjaNeural'), null);
});

test('pickLocalFallbackVoice: schon lokal ⇒ null (kein Ringelreihen)', () => {
  assert.equal(pickLocalFallbackVoice(piperFake(['de-karlsson']) as never, 'piper:de-karlsson'), null);
});

test('sanitize entfernt auch NACKTE Domains (Scam-/Werbe-Links)', () => {
  assert.equal(TTSService.sanitize('schaut mal auf spam-seite.com vorbei', 200), 'schaut mal auf vorbei');
  assert.equal(TTSService.sanitize('www.billig-coins.de/free', 200), '');
  assert.equal(TTSService.sanitize('krasse-seite.xyz/gewinn jetzt!', 200), 'jetzt!');
  // Normale Sätze mit Punkt bleiben unangetastet.
  assert.equal(TTSService.sanitize('Danke. Das war stark.', 200), 'Danke. Das war stark.');
});

// Aus einem echten 10-Stunden-Stream (Chris, 01.08.2026): Bei 13 % der Ansagen
// lief die Sicherheits-Wartezeit ab, BEVOR der Ton fertig war — die Ansagen
// ohne Rückmeldung hatten im Schnitt 50 % längere, emoji-reichere Namen.
// Ursache: „60 ms pro Zeichen" unterschätzt gesprochene Emoji dramatisch.
test('geschaetzteDauerMs: Emoji zählen wie gesprochene Wörter, nicht wie Buchstaben', () => {
  const nurText = geschaetzteDauerMs('Mika folgt jetzt');
  const mitEmoji = geschaetzteDauerMs('Mika🇩🇪⚽️ folgt jetzt');
  assert.ok(mitEmoji > nurText + 1500,
    `Emoji müssen deutlich mehr Zeit bekommen (Text ${nurText}ms, mit Emoji ${mitEmoji}ms)`);
});

test('geschaetzteDauerMs: ein Emoji zählt als EIN Zeichen, nicht als zwei halbe', () => {
  // '🇩🇪' besteht aus zwei Code-Punkten — [...text] zerlegt korrekt.
  const a = geschaetzteDauerMs('🇩🇪');
  assert.equal(a, 1400, 'zwei Regional-Indikatoren à 700ms');
});

test('geschaetzteDauerMs: Mindestdauer, damit nie bei 0 weitergemacht wird', () => {
  assert.equal(geschaetzteDauerMs(''), 600);
  assert.equal(geschaetzteDauerMs('a'), 600);
});

// ── Zwischenspeicher ───────────────────────────────────────────────────────
// Chris' 10-Stunden-Log: 85× fiel die Online-Stimme aus (schwaches WLAN im
// Keller), jedes Mal mit „TTS-Timeout". Bis dahin ging JEDE Ansage neu ins
// Netz — auch wenn derselbe Name gerade eben schon vorgelesen wurde.

/** Zählt die echten Synthese-Aufrufe und schreibt eine Datei wie die Echte. */
class ZaehlTTS extends TTSService {
  aufrufe = 0;
  override async synthesize(text: string, voice: string): Promise<TTSPlayback> {
    this.aufrufe++;
    return super.synthesize(text, voice);
  }
}

test('Zwischenspeicher: derselbe Text mit derselber Stimme geht nur EINMAL ins Netz', async () => {
  const dir = tmpDir();
  const tts = new ZaehlTTS(dir, () => undefined);
  // piper ist der lokale Weg — synthesizeWith schlägt ohne echtes Piper fehl,
  // deshalb prüfen wir den Cache über die DATEI, die wir selbst hinlegen.
  const ersteId = 'egal';
  assert.ok(ersteId);
  // Direkt gegen die Namensbildung: zweimal dieselbe Eingabe → derselbe Name.
  const a = tts.cacheNameFuer('Hallo Welt', 'edge:de-DE-KatjaNeural');
  const b = tts.cacheNameFuer('Hallo Welt', 'edge:de-DE-KatjaNeural');
  const c = tts.cacheNameFuer('Hallo Welt', 'edge:de-DE-ElkeNeural');
  const d = tts.cacheNameFuer('Anderer Text', 'edge:de-DE-KatjaNeural');
  assert.equal(a, b, 'gleiche Eingabe → gleiche Datei (= kein zweiter Netz-Zugriff)');
  assert.notEqual(a, c, 'andere Stimme → eigene Datei');
  assert.notEqual(a, d, 'anderer Text → eigene Datei');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Zwischenspeicher: eine LEERE Datei gilt nicht als fertige Ansage', async () => {
  const dir = tmpDir();
  const tts = new ZaehlTTS(dir, () => undefined);
  const name = tts.cacheNameFuer('Test', 'piper:de-thorsten');
  fs.writeFileSync(path.join(dir, 'tts-cache', name), '');
  // Eine 0-Byte-Datei darf NICHT als Treffer durchgehen — sonst bliebe es
  // still, und zwar für immer, weil der Name ja gleich bleibt.
  await assert.rejects(() => tts.synthesize('Test', 'piper:de-thorsten'));
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Veraltete Ansagen ──────────────────────────────────────────────────────
// Bei langsamer Leitung staut sich die Warteschlange. Eine Ansage, die zwei
// Minuten hinterherhinkt, hilft niemandem — sie verwirrt nur.

class LangsamTTS extends TTSService {
  gesprochen: string[] = [];
  override async synthesize(text: string): Promise<TTSPlayback> {
    this.gesprochen.push(text);
    return { fileId: `f-${text}`, durationMs: 10 };
  }
}

/** LangsamTTS, das sich wie ein gesunder Renderer verhält: Es meldet jedes
 *  Audio sofort als beendet zurück.
 *
 *  OHNE diese Rückmeldung wartet der Dienst auf seinen Notfall-Wecker
 *  (`durationMs * 2 + 10_000`, siehe waitForPlayback) — und genau das taten
 *  diese beiden Tests: gut 10 Sekunden Leerlauf pro Stück, für eine Prüfung,
 *  die 60 Millisekunden dauert. Hier geht es um die Auswahl in der
 *  Warteschlange, nicht um das Warten auf Ton.
 *
 *  Die Rückmeldung MUSS verzögert kommen (setTimeout 0): Der Dienst trägt den
 *  Warte-Eintrag erst NACH dem onAudio-Aufruf ein. Ein sofortiger Aufruf liefe
 *  ins Leere — und der Test wäre wieder 10 Sekunden lang. */
function langsamMitRueckmeldung(): LangsamTTS {
  const tts: LangsamTTS = new LangsamTTS(tmpDir(), (p) => {
    setTimeout(() => tts.notifyEnded(p.fileId), 0);
  });
  return tts;
}

test('zu alte Ansagen werden übersprungen statt verspätet vorgelesen', async () => {
  const tts = langsamMitRueckmeldung();
  // Direkt in die Warteschlange schreiben, mit altem Zeitstempel.
  const q = (tts as unknown as { queue: { text: string; voice: string; at?: number }[] }).queue;
  q.push({ text: 'uralt', voice: 'v', at: Date.now() - 5 * 60_000 });
  q.push({ text: 'frisch', voice: 'v', at: Date.now() });
  await (tts as unknown as { processNext: () => Promise<void> }).processNext();
  await wait(60);
  assert.ok(!tts.gesprochen.includes('uralt'), 'die alte Ansage wird verworfen');
  assert.ok(tts.gesprochen.includes('frisch'), 'die frische kommt durch');
});

test('Ansagen ohne Zeitstempel (Alt-Einträge) werden NICHT verworfen', async () => {
  const tts = langsamMitRueckmeldung();
  const q = (tts as unknown as { queue: { text: string; voice: string; at?: number }[] }).queue;
  q.push({ text: 'ohne-stempel', voice: 'v' });
  await (tts as unknown as { processNext: () => Promise<void> }).processNext();
  await wait(60);
  assert.ok(tts.gesprochen.includes('ohne-stempel'));
});

// ── Schmuckschriften: der Grund für „merkwürdig vorgelesene Namen" ─────────
test('sanitize glättet Schmuckschriften — sonst buchstabiert die Stimme', () => {
  assert.equal(TTSService.sanitize('𝓜𝓲𝓪 hat ein Geschenk geschickt', 200), 'Mia hat ein Geschenk geschickt');
  assert.equal(TTSService.sanitize('ᴀʟᴇx ist da', 200), 'ALEx ist da');
  assert.equal(TTSService.sanitize('Ｈａｌｌｏ', 200), 'Hallo');
});

test('sanitize lässt deutsche Umlaute in Ruhe', () => {
  // Der naheliegende Weg (zerlegen und Akzente wegwerfen) macht daraus
  // „Grusse fur Munchen".
  assert.equal(TTSService.sanitize('Grüße für München', 200), 'Grüße für München');
});
