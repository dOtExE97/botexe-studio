// tts-byok.ts — „Bring Your Own Key"-TTS-Provider. Der User trägt pro Dienst
// seine Zugangsdaten ein (mit Anleitung in der UI), dann erscheinen die
// Stimmen im normalen Dropdown. Voice-IDs namespaced: 'elevenlabs:<id>' usw.
//
// HTTP-Pfade brauchen echte Keys zum Endgültig-Verifizieren — sie sind nach
// der jeweils dokumentierten API gebaut und beim ersten Test mit Key zu prüfen.
import fsp from 'node:fs/promises';
import { signRequest } from './aws-sigv4';

export type ByokProviderId = 'elevenlabs' | 'polly' | 'ttsmonster' | 'openai';

export interface ByokField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder?: string;
  optional?: boolean;
}

export interface ByokVoice {
  id: string; // ohne namespace
  name: string;
  language: 'de' | 'en' | 'andere';
}

export interface ByokProviderDef {
  id: ByokProviderId;
  label: string;
  /** Kurz-Anleitung, wie man an die Zugangsdaten kommt. */
  howto: string;
  fields: ByokField[];
  /** Kuratierte Standard-Stimmen (Account kann mehr haben). */
  voices: ByokVoice[];
}

export const BYOK_PROVIDERS: ByokProviderDef[] = [
  {
    id: 'ttsmonster',
    label: 'TTS.Monster — Twitch-KI-Stimmen (gratis)',
    howto:
      '1. Auf tts.monster mit Twitch/Google anmelden  ·  2. Dashboard → „API“ → Key kopieren  ·  ' +
      'Free-Tier: 300 Nachrichten/Monat, 100+ Stimmen.',
    fields: [{ key: 'apiKey', label: 'API-Key', type: 'password', placeholder: 'tts.monster API-Key' }],
    voices: [
      { id: '', name: '(Standard-Stimme des Accounts)', language: 'andere' },
    ],
  },
  {
    id: 'polly',
    label: 'Amazon Polly — inkl. „Brian“ (Twitch-Klassiker)',
    howto:
      '1. AWS-Account anlegen (aws.amazon.com, Kreditkarte nötig, 12 Monate gratis 1 Mio. Zeichen/Monat)  ·  ' +
      '2. IAM → User mit Policy „AmazonPollyReadOnlyAccess“  ·  3. Access-Key + Secret erstellen.',
    fields: [
      { key: 'accessKeyId', label: 'Access Key ID', type: 'text', placeholder: 'AKIA…' },
      { key: 'secretAccessKey', label: 'Secret Access Key', type: 'password' },
      { key: 'region', label: 'Region', type: 'text', placeholder: 'eu-central-1' },
    ],
    voices: [
      { id: 'Brian', name: 'Brian (EN-GB, Mann) — DER Twitch-Klassiker', language: 'en' },
      { id: 'Daniel', name: 'Daniel (DE, Mann)', language: 'de' },
      { id: 'Vicki', name: 'Vicki (DE, Frau)', language: 'de' },
      { id: 'Hannah', name: 'Hannah (DE, Frau)', language: 'de' },
      { id: 'Amy', name: 'Amy (EN-GB, Frau)', language: 'en' },
      { id: 'Matthew', name: 'Matthew (EN-US, Mann)', language: 'en' },
      { id: 'Joanna', name: 'Joanna (EN-US, Frau)', language: 'en' },
    ],
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs — beste KI-Qualität',
    howto:
      '1. Auf elevenlabs.io registrieren (Free-Tier ~10.000 Zeichen/Monat)  ·  ' +
      '2. Profil → „API Keys“ → Key erstellen.',
    fields: [{ key: 'apiKey', label: 'API-Key', type: 'password', placeholder: 'sk_…' }],
    voices: [
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (EN, Frau)', language: 'en' },
      { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (EN, Frau)', language: 'en' },
      { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni (EN, Mann)', language: 'en' },
      { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold (EN, Mann)', language: 'en' },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI-kompatibel — lokale KI / eigener Server (Dev)',
    howto:
      'Für selbstgehostete Stimmen (XTTS via openedai-speech, LocalAI, Ollama-TTS) oder OpenAI selbst. ' +
      'Basis-URL eintragen (z.B. http://127.0.0.1:8000/v1), Key nur wenn der Server einen verlangt.',
    fields: [
      { key: 'baseUrl', label: 'Basis-URL', type: 'text', placeholder: 'http://127.0.0.1:8000/v1' },
      { key: 'apiKey', label: 'API-Key', type: 'password', optional: true, placeholder: '(optional)' },
      { key: 'model', label: 'Modell', type: 'text', optional: true, placeholder: 'tts-1' },
    ],
    voices: [
      { id: 'alloy', name: 'Alloy', language: 'andere' },
      { id: 'echo', name: 'Echo', language: 'andere' },
      { id: 'fable', name: 'Fable', language: 'andere' },
      { id: 'onyx', name: 'Onyx', language: 'andere' },
      { id: 'nova', name: 'Nova', language: 'andere' },
      { id: 'shimmer', name: 'Shimmer', language: 'andere' },
    ],
  },
];

export type ByokCredentials = Record<string, string>;

/** Pflichtfelder (nicht-optional) eines Providers vorhanden? */
export function isConfigured(providerId: ByokProviderId, creds: ByokCredentials | undefined): boolean {
  const def = BYOK_PROVIDERS.find((p) => p.id === providerId);
  if (!def || !creds) return false;
  return def.fields.filter((f) => !f.optional).every((f) => (creds[f.key] ?? '').trim().length > 0);
}

async function writeAudio(target: string, data: ArrayBuffer | Buffer): Promise<void> {
  await fsp.writeFile(target, Buffer.isBuffer(data) ? data : Buffer.from(data));
}

// ── ElevenLabs ──────────────────────────────────────────────────────────
async function elevenSynthesize(text: string, voiceId: string, creds: ByokCredentials, target: string): Promise<void> {
  const id = voiceId || '21m00Tcm4TlvDq8ikWAM';
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: {
      'xi-api-key': creds.apiKey ?? '',
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  await writeAudio(target, await res.arrayBuffer());
}

// ── TTS.Monster ─────────────────────────────────────────────────────────
async function ttsMonsterSynthesize(text: string, voiceId: string, creds: ByokCredentials, target: string): Promise<void> {
  // Dev-API: generate liefert eine URL zur Audio-Datei; die laden wir nach.
  const gen = await fetch('https://api.console.tts.monster/generate', {
    method: 'POST',
    headers: { Authorization: creds.apiKey ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ voice_id: voiceId || undefined, message: text }),
  });
  if (!gen.ok) throw new Error(`TTS.Monster HTTP ${gen.status}: ${(await gen.text()).slice(0, 120)}`);
  const data = (await gen.json()) as { url?: string };
  if (!data.url) throw new Error('TTS.Monster: keine Audio-URL erhalten');
  const audio = await fetch(data.url);
  if (!audio.ok) throw new Error(`TTS.Monster Audio HTTP ${audio.status}`);
  await writeAudio(target, await audio.arrayBuffer());
}

// ── OpenAI-kompatibel ───────────────────────────────────────────────────
async function openaiSynthesize(text: string, voiceId: string, creds: ByokCredentials, target: string): Promise<void> {
  const base = (creds.baseUrl ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('Basis-URL fehlt');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (creds.apiKey) headers.Authorization = `Bearer ${creds.apiKey}`;
  const res = await fetch(`${base}/audio/speech`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: creds.model || 'tts-1',
      input: text,
      voice: voiceId || 'alloy',
      response_format: 'mp3',
    }),
  });
  if (!res.ok) throw new Error(`OpenAI-TTS HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  await writeAudio(target, await res.arrayBuffer());
}

// ── Amazon Polly (SigV4-signiert) ───────────────────────────────────────
async function pollySynthesize(text: string, voiceId: string, creds: ByokCredentials, target: string): Promise<void> {
  const region = creds.region || 'eu-central-1';
  const host = `polly.${region}.amazonaws.com`;
  const path = '/v1/speech';
  const body = JSON.stringify({
    Text: text,
    VoiceId: voiceId || 'Brian',
    OutputFormat: 'mp3',
    Engine: 'neural',
  });
  // amzDate ohne Millis/Doppelpunkte: YYYYMMDDTHHMMSSZ
  const amzDate = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const { headers } = signRequest({
    accessKeyId: creds.accessKeyId ?? '',
    secretAccessKey: creds.secretAccessKey ?? '',
    region,
    service: 'polly',
    host,
    method: 'POST',
    path,
    body,
    amzDate,
    extraHeaders: { 'content-type': 'application/json' },
  });
  const res = await fetch(`https://${host}${path}`, { method: 'POST', headers, body });
  if (!res.ok) {
    // Neural nicht überall verfügbar → einmal mit standard-Engine retry.
    if (res.status === 400) {
      const body2 = JSON.stringify({ Text: text, VoiceId: voiceId || 'Brian', OutputFormat: 'mp3', Engine: 'standard' });
      const { headers: h2 } = signRequest({
        accessKeyId: creds.accessKeyId ?? '',
        secretAccessKey: creds.secretAccessKey ?? '',
        region, service: 'polly', host, method: 'POST', path, body: body2, amzDate,
        extraHeaders: { 'content-type': 'application/json' },
      });
      const res2 = await fetch(`https://${host}${path}`, { method: 'POST', headers: h2, body: body2 });
      if (!res2.ok) throw new Error(`Polly HTTP ${res2.status}: ${(await res2.text()).slice(0, 120)}`);
      await writeAudio(target, await res2.arrayBuffer());
      return;
    }
    throw new Error(`Polly HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  await writeAudio(target, await res.arrayBuffer());
}

export async function byokSynthesize(
  providerId: ByokProviderId,
  text: string,
  voiceId: string,
  creds: ByokCredentials,
  target: string,
): Promise<void> {
  switch (providerId) {
    case 'elevenlabs':
      return elevenSynthesize(text, voiceId, creds, target);
    case 'ttsmonster':
      return ttsMonsterSynthesize(text, voiceId, creds, target);
    case 'openai':
      return openaiSynthesize(text, voiceId, creds, target);
    case 'polly':
      return pollySynthesize(text, voiceId, creds, target);
  }
}
