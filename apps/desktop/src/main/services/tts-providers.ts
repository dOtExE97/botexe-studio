// tts-providers.ts — die drei TTS-Quellen hinter dem TTSService:
//   edge:  Microsoft Edge-TTS (online, gratis, beste Qualität)
//   piper: lokal/offline (Binary + Stimmen werden einmalig heruntergeladen)
//   gtts:  Google-Translate-TTS (inoffiziell — die Meme-Robo-Stimme; kann
//          jederzeit brechen, deshalb klar gelabelt und nie Default)
// Stimmen-IDs sind namespaced: 'edge:de-DE-KatjaNeural', 'piper:de-thorsten', 'gtts:de'.
import { EdgeTTS } from 'node-edge-tts';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { log } from '../core/logger';

export interface TTSVoice {
  id: string; // namespaced
  name: string;
  language: 'de' | 'en' | 'andere';
  /** false = muss erst eingerichtet/heruntergeladen werden (Piper). */
  ready: boolean;
}

export interface VoiceGroup {
  provider: 'edge' | 'piper' | 'gtts';
  label: string;
  voices: TTSVoice[];
}

// ── Edge ──────────────────────────────────────────────────────────────────

const EDGE_VOICES: Array<[string, string, 'de' | 'en']> = [
  ['de-DE-KatjaNeural', 'Katja (DE, Frau)', 'de'],
  ['de-DE-AmalaNeural', 'Amala (DE, Frau)', 'de'],
  ['de-DE-ElkeNeural', 'Elke (DE, Frau)', 'de'],
  ['de-DE-LouisaNeural', 'Louisa (DE, Frau)', 'de'],
  ['de-DE-MajaNeural', 'Maja (DE, Frau)', 'de'],
  ['de-DE-SeraphinaMultilingualNeural', 'Seraphina (DE, multilingual)', 'de'],
  ['de-DE-ConradNeural', 'Conrad (DE, Mann)', 'de'],
  ['de-DE-FlorianMultilingualNeural', 'Florian (DE, multilingual)', 'de'],
  ['de-DE-KillianNeural', 'Killian (DE, Mann)', 'de'],
  ['de-DE-KlausNeural', 'Klaus (DE, Mann)', 'de'],
  ['de-AT-IngridNeural', 'Ingrid (AT, Frau)', 'de'],
  ['de-AT-JonasNeural', 'Jonas (AT, Mann)', 'de'],
  ['en-US-JennyNeural', 'Jenny (EN-US, Frau)', 'en'],
  ['en-US-AriaNeural', 'Aria (EN-US, Frau)', 'en'],
  ['en-US-GuyNeural', 'Guy (EN-US, Mann)', 'en'],
  ['en-GB-SoniaNeural', 'Sonia (EN-GB, Frau)', 'en'],
  ['en-GB-RyanNeural', 'Ryan (EN-GB, Mann)', 'en'],
];

async function edgeSynthesize(text: string, voiceId: string, target: string): Promise<void> {
  const lang = voiceId.split('-').slice(0, 2).join('-');
  const engine = new EdgeTTS({ voice: voiceId, lang, volume: '+0%' });
  await engine.ttsPromise(text, target);
}

// ── Google Translate (inoffiziell) ────────────────────────────────────────

const GTTS_LANGS: Array<[string, string]> = [
  ['de', 'Google Robo (Deutsch) — Meme-Klassiker'],
  ['en', 'Google Robo (English)'],
  ['fr', 'Google Robo (Français)'],
  ['es', 'Google Robo (Español)'],
  ['tr', 'Google Robo (Türkçe)'],
];

async function gttsSynthesize(text: string, lang: string, target: string): Promise<void> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Google-TTS HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error('Google-TTS lieferte keine Audio-Daten');
  await fsp.writeFile(target, buf);
}

// ── Piper (lokal) ─────────────────────────────────────────────────────────

const PIPER_RELEASE = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2';
const PIPER_VOICES_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0';

interface PiperVoiceDef {
  id: string;
  name: string;
  language: 'de' | 'en';
  /** Pfad-Fragment unter piper-voices, z.B. de/de_DE/thorsten/medium/de_DE-thorsten-medium */
  model: string;
}

const PIPER_VOICES: PiperVoiceDef[] = [
  { id: 'de-thorsten', name: 'Thorsten (DE, Mann) — lokal', language: 'de', model: 'de/de_DE/thorsten/medium/de_DE-thorsten-medium' },
  { id: 'de-eva', name: 'Eva (DE, Frau) — lokal', language: 'de', model: 'de/de_DE/eva_k/x_low/de_DE-eva_k-x_low' },
  { id: 'de-kerstin', name: 'Kerstin (DE, Frau) — lokal', language: 'de', model: 'de/de_DE/kerstin/low/de_DE-kerstin-low' },
  { id: 'de-karlsson', name: 'Karlsson (DE, Mann) — lokal', language: 'de', model: 'de/de_DE/karlsson/low/de_DE-karlsson-low' },
  { id: 'de-ramona', name: 'Ramona (DE, Frau) — lokal', language: 'de', model: 'de/de_DE/ramona/low/de_DE-ramona-low' },
  { id: 'en-amy', name: 'Amy (EN-US, Frau) — lokal', language: 'en', model: 'en/en_US/amy/medium/en_US-amy-medium' },
  { id: 'en-ryan', name: 'Ryan (EN-US, Mann) — lokal', language: 'en', model: 'en/en_US/ryan/medium/en_US-ryan-medium' },
  { id: 'en-alan', name: 'Alan (EN-GB, Mann) — lokal', language: 'en', model: 'en/en_GB/alan/medium/en_GB-alan-medium' },
];

async function downloadFile(url: string, target: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download fehlgeschlagen: HTTP ${res.status} für ${url}`);
  await fsp.writeFile(target, Buffer.from(await res.arrayBuffer()));
}

export class PiperRuntime {
  private readonly baseDir: string;
  private readonly voicesDir: string;

  constructor(userDataDir: string) {
    this.baseDir = path.join(userDataDir, 'piper');
    this.voicesDir = path.join(this.baseDir, 'voices');
    fs.mkdirSync(this.voicesDir, { recursive: true });
  }

  private binPath(): string {
    return path.join(this.baseDir, 'piper', process.platform === 'win32' ? 'piper.exe' : 'piper');
  }

  hasBinary(): boolean {
    return fs.existsSync(this.binPath());
  }

  voiceReady(id: string): boolean {
    const def = PIPER_VOICES.find((v) => v.id === id);
    if (!def) return false;
    const base = path.basename(def.model);
    return fs.existsSync(path.join(this.voicesDir, `${base}.onnx`));
  }

  readyVoiceIds(): string[] {
    return PIPER_VOICES.filter((v) => this.voiceReady(v.id)).map((v) => v.id);
  }

  /** Binary (einmalig, ~25 MB) + gewählte Stimme (~20–80 MB) herunterladen. */
  async setup(voiceId: string): Promise<void> {
    if (!this.hasBinary()) {
      const asset =
        process.platform === 'win32'
          ? 'piper_windows_amd64.zip'
          : process.platform === 'darwin'
            ? 'piper_macos_x64.tar.gz'
            : 'piper_linux_x86_64.tar.gz';
      const archive = path.join(this.baseDir, asset);
      log.info('Piper', `Lade Binary: ${asset}…`);
      await downloadFile(`${PIPER_RELEASE}/${asset}`, archive);
      await this.extract(archive);
      await fsp.unlink(archive).catch(() => undefined);
      if (!this.hasBinary()) throw new Error('Piper-Binary nach Extraktion nicht gefunden');
      if (process.platform !== 'win32') await fsp.chmod(this.binPath(), 0o755);
      log.info('Piper', 'Binary bereit');
    }

    const def = PIPER_VOICES.find((v) => v.id === voiceId);
    if (!def) throw new Error(`Unbekannte Piper-Stimme: ${voiceId}`);
    if (!this.voiceReady(voiceId)) {
      const base = path.basename(def.model);
      log.info('Piper', `Lade Stimme ${def.name}…`);
      await downloadFile(`${PIPER_VOICES_BASE}/${def.model}.onnx`, path.join(this.voicesDir, `${base}.onnx`));
      await downloadFile(`${PIPER_VOICES_BASE}/${def.model}.onnx.json`, path.join(this.voicesDir, `${base}.onnx.json`));
      log.info('Piper', `Stimme ${def.name} bereit`);
    }
  }

  private extract(archive: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child =
        process.platform === 'win32'
          ? spawn('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path "${archive}" -DestinationPath "${this.baseDir}" -Force`])
          : spawn('tar', ['-xzf', archive, '-C', this.baseDir]);
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Extraktion fehlgeschlagen (code ${code})`))));
      child.on('error', reject);
    });
  }

  synthesize(text: string, voiceId: string, target: string): Promise<void> {
    const def = PIPER_VOICES.find((v) => v.id === voiceId);
    if (!def) return Promise.reject(new Error(`Unbekannte Piper-Stimme: ${voiceId}`));
    if (!this.hasBinary() || !this.voiceReady(voiceId)) {
      return Promise.reject(new Error('Piper nicht eingerichtet — auf der Stimme-Seite „Vorbereiten" klicken'));
    }
    const model = path.join(this.voicesDir, `${path.basename(def.model)}.onnx`);
    return new Promise((resolve, reject) => {
      const child = spawn(this.binPath(), ['--model', model, '--output_file', target]);
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Piper-Timeout'));
      }, 15_000);
      child.on('close', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(new Error(`Piper exit ${code}`));
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.stdin.write(text);
      child.stdin.end();
    });
  }
}

// ── Gemeinsame Oberfläche ─────────────────────────────────────────────────

export function getVoiceGroups(piper: PiperRuntime): VoiceGroup[] {
  return [
    {
      provider: 'edge',
      label: 'Edge — online, beste Qualität (gratis)',
      voices: EDGE_VOICES.map(([id, name, language]) => ({ id: `edge:${id}`, name, language, ready: true })),
    },
    {
      provider: 'piper',
      label: 'Piper — lokal & offline (einmaliger Download)',
      voices: PIPER_VOICES.map((v) => ({ id: `piper:${v.id}`, name: v.name, language: v.language, ready: piper.voiceReady(v.id) })),
    },
    {
      provider: 'gtts',
      label: 'Google Robo — inoffiziell, kann jederzeit brechen',
      voices: GTTS_LANGS.map(([lang, name]) => ({ id: `gtts:${lang}`, name, language: lang === 'de' ? 'de' : lang === 'en' ? 'en' : 'andere', ready: true })),
    },
  ];
}

/** Legacy-Stimmen ohne Namespace (Settings v2) → edge:. */
export function normalizeVoiceId(voice: string): string {
  return voice.includes(':') ? voice : `edge:${voice}`;
}

export function extForVoice(voice: string): 'mp3' | 'wav' {
  return normalizeVoiceId(voice).startsWith('piper:') ? 'wav' : 'mp3';
}

export async function synthesizeWith(
  piper: PiperRuntime,
  text: string,
  voice: string,
  target: string,
): Promise<void> {
  const normalized = normalizeVoiceId(voice);
  const [ns, id] = normalized.split(':', 2) as [string, string];
  switch (ns) {
    case 'edge':
      return edgeSynthesize(text, id, target);
    case 'piper':
      return piper.synthesize(text, id, target);
    case 'gtts':
      return gttsSynthesize(text, id, target);
    default:
      throw new Error(`Unbekannter TTS-Provider: ${ns}`);
  }
}
