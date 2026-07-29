// Wächter für den Geheimnis-Tresor.
//
// Das Wichtigste steht in „Fremder Rechner": Wenn das Entschlüsseln scheitert,
// darf NUR der Login weg sein — nicht die ganze Konfiguration. Ein Nutzer, der
// nach einem Windows-Neuaufsetzen alle Trigger und Layouts verliert, hätte
// lieber Klartext gehabt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { packe, entpacke, echterSchutz, SECRET_BLOCK, _resetWarnung, type Krypto } from './secret-box';
import { SECRET_TOP_LEVEL_FIELDS } from './settings-store';

/** safeStorage-Ersatz: „verschlüsselt" durch Umdrehen — reicht, um zu prüfen,
 *  dass nichts Lesbares in der Datei landet und der Rückweg stimmt. */
const echt: Krypto = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from([...Buffer.from(s, 'utf-8')].map((b) => b ^ 0x5a)),
  decryptString: (b) => Buffer.from([...b].map((x) => x ^ 0x5a)).toString('utf-8'),
};

const aus: Krypto = {
  isEncryptionAvailable: () => false,
  encryptString: () => { throw new Error('nicht verfügbar'); },
  decryptString: () => { throw new Error('nicht verfügbar'); },
};

const FELDER = SECRET_TOP_LEVEL_FIELDS;

const beispiel = () => ({
  schemaVersion: 7,
  tiktokSessionId: 'geheimer-cookie-123',
  aiApiKey: 'sk-abcdef',
  ttsCredentials: { elevenlabs: { key: 'xyz' } },
  obs: { enabled: true, url: 'ws://localhost:4455', password: 'obs-pw' },
  giftSoundGapSec: 5,
  autostart: true,
});

test('Geheimnisse stehen nicht mehr lesbar in der Datei', () => {
  const datei = JSON.stringify(packe(beispiel(), FELDER, echt));
  for (const nadel of ['geheimer-cookie-123', 'sk-abcdef', 'xyz', 'obs-pw']) {
    assert.ok(!datei.includes(nadel), `„${nadel}" steht noch im Klartext in der Datei`);
  }
});

test('harmlose Einstellungen bleiben lesbar', () => {
  // Wichtig fürs Debuggen: Man soll settings.json weiterhin aufmachen und
  // nachsehen können, ohne dass alles ein Buchstabenbrei ist.
  const gepackt = packe(beispiel(), FELDER, echt);
  assert.equal(gepackt.giftSoundGapSec, 5);
  assert.equal(gepackt.autostart, true);
  assert.equal((gepackt.obs as Record<string, unknown>).url, 'ws://localhost:4455');
});

test('Hin und zurück ergibt exakt das Original', () => {
  const original = beispiel();
  const zurueck = entpacke(packe(original, FELDER, echt), echt);
  assert.deepEqual(zurueck, original);
});

test('Umstieg: eine alte Klartext-Datei wird unverändert übernommen', () => {
  // Bei der ersten Aktualisierung liegt settings.json noch im Klartext und hat
  // gar keinen _secrets-Block. Da darf nichts verloren gehen.
  const alt = beispiel();
  const gelesen = entpacke(alt as Record<string, unknown>, echt);
  assert.equal(gelesen.tiktokSessionId, 'geheimer-cookie-123');
  assert.equal((gelesen.obs as Record<string, unknown>).password, 'obs-pw');
});

test('Fremder Rechner: nur die Geheimnisse fehlen, der Rest bleibt', () => {
  _resetWarnung();
  const gepackt = packe(beispiel(), FELDER, echt);
  const kaputt: Krypto = { ...echt, decryptString: () => { throw new Error('DPAPI: falscher Benutzer'); } };
  const gelesen = entpacke(gepackt, kaputt);

  assert.equal(gelesen.tiktokSessionId, undefined, 'Login ist weg — erwartet');
  assert.equal(gelesen.giftSoundGapSec, 5, 'Einstellungen müssen bleiben');
  assert.equal(gelesen.autostart, true, 'Einstellungen müssen bleiben');
  assert.equal((gelesen.obs as Record<string, unknown>).url, 'ws://localhost:4455');
  assert.equal(gelesen[SECRET_BLOCK], undefined, 'der unlesbare Block darf nicht im Objekt landen');
});

test('ohne Schlüsselbund bleibt alles im Klartext — die App startet trotzdem', () => {
  _resetWarnung();
  const gepackt = packe(beispiel(), FELDER, aus);
  assert.equal(gepackt.tiktokSessionId, 'geheimer-cookie-123');
  assert.equal(gepackt[SECRET_BLOCK], undefined);
  assert.deepEqual(entpacke(gepackt, aus), beispiel(), 'auch dann muss der Rückweg stimmen');
});

test('Verschlüsseln schlägt fehl → Geheimnisse gehen NICHT verloren', () => {
  _resetWarnung();
  const kaputt: Krypto = { ...echt, encryptString: () => { throw new Error('Keyring weg') } };
  const gepackt = packe(beispiel(), FELDER, kaputt);
  assert.equal(gepackt.tiktokSessionId, 'geheimer-cookie-123', 'lieber Klartext als weg');
  assert.equal(gepackt[SECRET_BLOCK], undefined);
});

test('leere Felder wandern nicht in den Tresor', () => {
  // Frische Installation: nichts eingetragen → gar kein Block, kein
  // Schlüsselbund-Zugriff bei jedem Speichern.
  const frisch = { schemaVersion: 7, tiktokSessionId: '', aiApiKey: '', ttsCredentials: {}, obs: { url: 'x', password: '' } };
  const gepackt = packe(frisch, FELDER, echt);
  assert.equal(gepackt[SECRET_BLOCK], undefined, 'kein Block, wenn es nichts zu schützen gibt');
  assert.equal(gepackt.tiktokSessionId, '');
});

test('jedes Feld der Geheimnis-Liste wird wirklich geschützt', () => {
  // Absicherung gegen die häufigste Panne hier: Jemand fügt SECRET_TOP_LEVEL_FIELDS
  // ein neues Feld hinzu — dann muss es automatisch mitverschlüsselt werden.
  const alle: Record<string, unknown> = { schemaVersion: 7 };
  for (const f of FELDER) alle[f] = `wert-von-${f}`;
  const datei = JSON.stringify(packe(alle, FELDER, echt));
  for (const f of FELDER) {
    assert.ok(!datei.includes(`wert-von-${f}`), `${f} landet noch im Klartext`);
  }
});

test('manipulierter Tresor kann keine fremden Unterfelder setzen', () => {
  // Ein Tresor-Eintrag „obs.enabled" oder „tts.irgendwas" darf nicht
  // durchgereicht werden — nur die bekannten Geheimnis-Unterfelder.
  const boese = { [SECRET_BLOCK]: echt.encryptString(JSON.stringify({
    'obs.password': 'echt-pw',
    'obs.enabled': false,
    'tts.voice': 'gekapert',
  })).toString('base64') };
  const gelesen = entpacke(boese, echt) as Record<string, Record<string, unknown>>;
  assert.equal(gelesen.obs?.password, 'echt-pw', 'das erlaubte Unterfeld kommt an');
  assert.equal(gelesen.obs?.enabled, undefined, 'obs.enabled ist kein Geheimnis-Feld');
  assert.equal(gelesen.tts, undefined, 'tts steht gar nicht in der Liste');
});

test('Linux ohne Schlüsselbund: „verfügbar", aber kein echter Schutz', () => {
  // Die heimtückische Falle: isEncryptionAvailable() sagt true, Chromium nutzt
  // aber einen fest eingebauten Schlüssel. Verschlüsselt wird trotzdem (nicht
  // schlechter als vorher) — es darf nur niemand für echten Schutz halten.
  const attrappe: Krypto = { ...echt, getSelectedStorageBackend: () => 'basic_text' };
  assert.equal(echterSchutz(attrappe), false, 'basic_text ist KEIN echter Schutz');
  const gepackt = packe(beispiel(), FELDER, attrappe);
  assert.ok(gepackt[SECRET_BLOCK], 'verschlüsselt wird trotzdem');
  assert.deepEqual(entpacke(gepackt, attrappe), beispiel(), 'und der Rückweg stimmt');
});

test('echter Schlüsselbund gilt als echter Schutz', () => {
  assert.equal(echterSchutz({ ...echt, getSelectedStorageBackend: () => 'gnome_libsecret' }), true);
  assert.equal(echterSchutz({ ...echt, getSelectedStorageBackend: () => 'kwallet6' }), true);
  // Windows/macOS: die Methode existiert dort gar nicht → kein Verdachtsfall.
  assert.equal(echterSchutz(echt), true, 'ohne die Methode (Windows/macOS) ist es echter Schutz');
  assert.equal(echterSchutz(aus), false, 'gar keine Verschlüsselung ist kein Schutz');
});

test('kaputter Block-Inhalt wirft nicht', () => {
  _resetWarnung();
  for (const block of ['kein-base64!!', Buffer.from('kein json').toString('base64'), '']) {
    const gelesen = entpacke({ schemaVersion: 7, [SECRET_BLOCK]: block }, echt);
    assert.equal(gelesen.schemaVersion, 7);
  }
});
