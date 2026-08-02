// Tests für die Dauerleitung zu Microsofts Sprachdienst.
//
// Der Kern des Ganzen ist: EINE Verbindung für viele Ansagen. Genau das wird
// hier festgehalten — plus die Riegel, die der Bibliothek fehlen (Zeitlimit
// schon beim Aufbau, Aufgeben per terminate statt close).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EdgeDauerleitung, baueSsml, leseKopf, marke, type WsAehnlich } from './edge-dauerleitung';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'edge-'));
}

/** WebSocket-Attrappe: merkt sich Gesendetes und antwortet auf Zuruf. */
class FakeWs implements WsAehnlich {
  static gebaut = 0;
  gesendet: string[] = [];
  beendet = false;
  private handler = new Map<string, (...a: never[]) => void>();

  constructor() { FakeWs.gebaut += 1; }
  on(e: string, cb: (...a: never[]) => void): unknown { this.handler.set(e, cb); return this; }
  send(d: string): void { this.gesendet.push(d); }
  close(): void { this.beendet = true; }
  terminate(): void { this.beendet = true; }
  removeAllListeners(): void { this.handler.clear(); }

  feuere(e: string, ...args: unknown[]): void { (this.handler.get(e) as ((...a: unknown[]) => void) | undefined)?.(...args); }
  /** Die zuletzt gesendete Ansage beantworten: erst Audio, dann turn.end. */
  antworte(audio = Buffer.from('TON')): void {
    const id = /X-RequestId:([0-9a-f]+)/.exec(this.gesendet[this.gesendet.length - 1] ?? '')?.[1] ?? '';
    const kopf = Buffer.from(`X-RequestId:${id}\r\nPath:audio\r\n\r\n`, 'utf-8');
    const laenge = Buffer.alloc(2);
    laenge.writeUInt16BE(kopf.length, 0);
    this.feuere('message', Buffer.concat([laenge, kopf, audio]), true);
    this.feuere('message', `X-RequestId:${id}\r\nPath:turn.end\r\n\r\n`, false);
  }
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('EINE Verbindung trägt mehrere Ansagen (das ist der ganze Sinn)', async () => {
  FakeWs.gebaut = 0;
  let ws!: FakeWs;
  const dir = tmpDir();
  const leitung = new EdgeDauerleitung({ wsFactory: () => { ws = new FakeWs(); return ws; } });

  const erste = leitung.synthetisiere('hallo', 'de-DE-KatjaNeural', path.join(dir, 'a.mp3'));
  await warte(10);
  ws.feuere('open');
  await warte(10);
  ws.antworte();
  await erste;

  const zweite = leitung.synthetisiere('welt', 'de-DE-KatjaNeural', path.join(dir, 'b.mp3'));
  await warte(10);
  ws.antworte();
  await zweite;

  assert.equal(FakeWs.gebaut, 1, 'nur EIN Verbindungsaufbau für zwei Ansagen');
  assert.equal(fs.readFileSync(path.join(dir, 'a.mp3'), 'utf-8'), 'TON');
  assert.equal(fs.readFileSync(path.join(dir, 'b.mp3'), 'utf-8'), 'TON');
  leitung.schliesse();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Ausgabeformat wird EINMAL je Leitung gesetzt, nicht je Ansage', async () => {
  let ws!: FakeWs;
  const dir = tmpDir();
  const leitung = new EdgeDauerleitung({ wsFactory: () => { ws = new FakeWs(); return ws; } });
  const p1 = leitung.synthetisiere('a', 'de-DE-KatjaNeural', path.join(dir, 'a.mp3'));
  await warte(10); ws.feuere('open'); await warte(10); ws.antworte(); await p1;
  const p2 = leitung.synthetisiere('b', 'de-DE-KatjaNeural', path.join(dir, 'b.mp3'));
  await warte(10); ws.antworte(); await p2;

  const configs = ws.gesendet.filter((s) => s.includes('Path:speech.config'));
  assert.equal(configs.length, 1);
  leitung.schliesse();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Bricht die Leitung weg, scheitern offene Ansagen SOFORT (nicht erst im Zeitlimit)', async () => {
  let ws!: FakeWs;
  const dir = tmpDir();
  const leitung = new EdgeDauerleitung({ wsFactory: () => { ws = new FakeWs(); return ws; } });
  const lauf = leitung.synthetisiere('x', 'de-DE-KatjaNeural', path.join(dir, 'x.mp3'));
  await warte(10); ws.feuere('open'); await warte(10);
  ws.feuere('close');
  await assert.rejects(() => lauf);
  assert.equal(leitung.steht, false, 'die Leitung gilt danach als weg');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Nach einem Abriss wird beim nächsten Mal neu aufgebaut (Selbstheilung)', async () => {
  FakeWs.gebaut = 0;
  let ws!: FakeWs;
  const dir = tmpDir();
  const leitung = new EdgeDauerleitung({ wsFactory: () => { ws = new FakeWs(); return ws; } });
  const erste = leitung.synthetisiere('a', 'de-DE-KatjaNeural', path.join(dir, 'a.mp3'));
  await warte(10); ws.feuere('open'); await warte(10); ws.feuere('close');
  await assert.rejects(() => erste);

  const zweite = leitung.synthetisiere('b', 'de-DE-KatjaNeural', path.join(dir, 'b.mp3'));
  await warte(10); ws.feuere('open'); await warte(10); ws.antworte(); await zweite;
  assert.equal(FakeWs.gebaut, 2, 'zweiter Aufbau nach dem Abriss');
  leitung.schliesse();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Ein Ansagen-Schwall öffnet NICHT mehrere Verbindungen gleichzeitig', async () => {
  FakeWs.gebaut = 0;
  let ws!: FakeWs;
  const dir = tmpDir();
  const leitung = new EdgeDauerleitung({ wsFactory: () => { ws = new FakeWs(); return ws; } });
  // Drei Ansagen, bevor die Leitung überhaupt steht — genau der Fall bei
  // langsamer Leitung. Mehrere parallele Aufbauten würden es verschlimmern.
  const alle = [
    leitung.synthetisiere('a', 'de-DE-KatjaNeural', path.join(dir, 'a.mp3')),
    leitung.synthetisiere('b', 'de-DE-KatjaNeural', path.join(dir, 'b.mp3')),
    leitung.synthetisiere('c', 'de-DE-KatjaNeural', path.join(dir, 'c.mp3')),
  ];
  await warte(10);
  assert.equal(FakeWs.gebaut, 1, 'genau ein Aufbau trotz drei Ansagen');
  ws.feuere('open');
  await warte(20);
  for (let i = 0; i < 3; i++) { ws.antworte(); await warte(5); }
  await Promise.allSettled(alle);
  leitung.schliesse();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Antworten werden über die Anfrage-Kennung der richtigen Ansage zugeordnet', async () => {
  const kopf = leseKopf('X-RequestId:abc123\r\nPath:audio\r\n\r\nRest');
  assert.equal(kopf['x-requestid'], 'abc123');
  assert.equal(kopf['path'], 'audio');
});

test('SSML: Sonderzeichen im Namen zerlegen die Ansage nicht', () => {
  const s = baueSsml('Tom & Jerry <3', 'de-DE-KatjaNeural');
  assert.ok(s.includes('Tom &amp; Jerry &lt;3'), 'Steuerzeichen werden entschärft');
  assert.ok(s.includes("xml:lang='de-DE'"));
  assert.ok(s.includes("name='de-DE-KatjaNeural'"));
});

test('SSML: Tempo/Tonhöhe/Lautstärke werden begrenzt statt blind übernommen', () => {
  const s = baueSsml('x', 'de-DE-KatjaNeural', { rate: 999, pitch: -999, volume: 20 });
  assert.ok(s.includes("rate='+50%'"), 'Tempo gedeckelt');
  assert.ok(s.includes("pitch='-20Hz'"), 'Tonhöhe gedeckelt');
  assert.ok(s.includes("volume='+20%'"));
});

test('Zugangsmarke ändert sich im 5-Minuten-Takt, nicht bei jedem Aufruf', () => {
  const t = 1_800_000_000_000;
  assert.equal(marke(t), marke(t + 1000), 'innerhalb desselben Fensters gleich');
  assert.notEqual(marke(t), marke(t + 400_000), 'nach dem Fenster anders');
  assert.match(marke(t), /^[0-9A-F]{64}$/);
});
