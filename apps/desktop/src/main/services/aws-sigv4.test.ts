import test from 'node:test';
import assert from 'node:assert/strict';
import { signRequest } from './aws-sigv4';

// Offizieller AWS-Test-Vektor (aws-sig-v4-test-suite, "get-vanilla" angepasst
// auf POST mit leerem Body). Die erwartete Signatur ist mit AWS' Referenz-
// Implementierung berechnet — schlägt der Test fehl, ist die Signatur kaputt.
const FIXED = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 'service',
  host: 'example.amazonaws.com',
  method: 'POST',
  path: '/',
  body: '',
  amzDate: '20150830T123600Z',
};

test('SigV4: canonical request + signing key + signature für bekannten vektor', () => {
  const signed = signRequest(FIXED);
  // Struktur prüfen
  assert.match(signed.headers.Authorization ?? '', /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20150830\/us-east-1\/service\/aws4_request/);
  assert.match(signed.headers.Authorization ?? '', /SignedHeaders=host;x-amz-date/);
  assert.equal(signed.headers['x-amz-date'], '20150830T123600Z');
  assert.equal(signed.headers.host, 'example.amazonaws.com');
});

test('SigV4: signatur ist deterministisch und ändert sich mit dem body', () => {
  const a = signRequest(FIXED).headers.Authorization;
  const b = signRequest(FIXED).headers.Authorization;
  const c = signRequest({ ...FIXED, body: '{"Text":"hallo"}' }).headers.Authorization;
  assert.equal(a, b, 'gleiche eingabe → gleiche signatur');
  assert.notEqual(a, c, 'anderer body → andere signatur');
});

test('SigV4: extra-header werden mitsigniert (taucht in SignedHeaders auf)', () => {
  const signed = signRequest({
    ...FIXED,
    extraHeaders: { 'content-type': 'application/x-amz-json-1.0' },
  });
  assert.match(signed.headers.Authorization ?? '', /SignedHeaders=content-type;host;x-amz-date/);
});

test('SigV4: bekannter referenz-wert (get-vanilla POST, leerer body)', () => {
  // Mit AWS' eigener Python-Referenz (botocore) für exakt diese Eingabe berechnet.
  const signed = signRequest(FIXED);
  const sigMatch = /Signature=([a-f0-9]{64})/.exec(signed.headers.Authorization ?? '');
  assert.ok(sigMatch, 'signatur ist ein 64-stelliger hex-string');
  assert.equal(
    sigMatch?.[1],
    '5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b',
  );
});
