// myinstants.test.ts — Absicherung des Import-Downloads gegen SSRF.
// Der Import-Pfad darf (wie der Vorhör-Pfad) NUR myinstants.com-MP3s über HTTPS
// laden — keine internen IPs, keine fremden Domains, keine Nicht-MP3s.
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { isAllowedMyInstantsMp3, downloadMyInstants } from './myinstants';

test('isAllowedMyInstantsMp3: erlaubt nur myinstants.com-HTTPS-MP3', () => {
  // erlaubt
  assert.equal(isAllowedMyInstantsMp3('https://www.myinstants.com/media/sounds/x.mp3'), true);
  assert.equal(isAllowedMyInstantsMp3('https://myinstants.com/x.mp3'), true);
  assert.equal(isAllowedMyInstantsMp3('https://www.myinstants.com/X.MP3'), true); // Groß/Klein

  // abgelehnt: kein HTTPS
  assert.equal(isAllowedMyInstantsMp3('http://www.myinstants.com/x.mp3'), false);
  // abgelehnt: fremde Domain
  assert.equal(isAllowedMyInstantsMp3('https://evil.com/x.mp3'), false);
  // abgelehnt: interne IP (Cloud-Metadata / SSRF-Klassiker)
  assert.equal(isAllowedMyInstantsMp3('https://169.254.169.254/x.mp3'), false);
  assert.equal(isAllowedMyInstantsMp3('http://127.0.0.1/x.mp3'), false);
  assert.equal(isAllowedMyInstantsMp3('https://localhost/x.mp3'), false);
  // abgelehnt: Host-Trick (Subdomain-Suffix)
  assert.equal(isAllowedMyInstantsMp3('https://www.myinstants.com.evil.tld/x.mp3'), false);
  // abgelehnt: kein MP3
  assert.equal(isAllowedMyInstantsMp3('https://www.myinstants.com/x.txt'), false);
  // abgelehnt: Müll
  assert.equal(isAllowedMyInstantsMp3('nicht-mal-ne-url'), false);
  assert.equal(isAllowedMyInstantsMp3(''), false);
});

test('downloadMyInstants lehnt verbotene URLs ab, BEVOR es ins Netz/auf Platte geht', async () => {
  const dir = os.tmpdir();
  // interne IP → sofortiger Reject (kein fetch, kein File-Write)
  await assert.rejects(
    () => downloadMyInstants('https://169.254.169.254/evil.mp3', 'evil', dir),
    /URL|erlaubt|myinstants/i,
  );
  // fremde Domain → Reject
  await assert.rejects(
    () => downloadMyInstants('https://evil.com/x.mp3', 'x', dir),
    /URL|erlaubt|myinstants/i,
  );
  // Nicht-MP3 → Reject
  await assert.rejects(
    () => downloadMyInstants('https://www.myinstants.com/x.txt', 'x', dir),
    /URL|erlaubt|myinstants/i,
  );
});
