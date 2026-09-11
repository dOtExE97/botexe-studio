// herz-pack.ts — Download des Zusatz-Pakets mit weiteren Herz-Animationen.
//
// Das Herz-Alarm-Widget bringt drei Motive gebündelt mit (assets/herz-anim,
// read-only im Programm). Sechs weitere Motive („Collection 07 — Ultimate Pro
// Polish": Signature DJ, Cyber Gamer, Solar Hero, Rockstar, Galaxy Rider, Golden
// Jackpot) sind mit ~100 MB zu groß fürs Bündeln — sie liegen als Anhang einer
// GitHub-Version und werden auf Knopfdruck EINMAL geladen. Danach kennt das
// Widget sie wie die gebündelten.
//
// Baugleich zu gift-image-pack.ts (Download + tar.gz + strenger tar-Leser),
// nur mit .webm-Dateien und einem beschreibbaren Ziel (userData) statt der
// read-only App-Ressourcen. Die Sicherheits-Logik ist bewusst dieselbe: fremder
// Inhalt wird in einen Nutzer-Ordner entpackt, also strenge Namensprüfung und
// eine feste Host-Allowlist für Weiterleitungen.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import zlib from 'node:zlib';
import { log } from '../core/logger';

/** Anhang einer GitHub-Version — nicht im Quellcode-Verlauf (die Videos sind
 *  groß und lassen sich als Anhang zurückziehen; ein Commit bleibt für immer). */
export const HERZ_PACK_URL =
  'https://github.com/dOtExE97/botexe-studio/releases/download/heart-pack-v2/heart-pack.tar.gz';

/** Reißleine gegen ein unerwartet riesiges Paket (erwartet ~100 MB). */
const MAX_PACK_BYTES = 300 * 1024 * 1024;
/** Einzeldatei-Grenze — ein Pro-Polish-Clip ist bis ~22 MB, 40 MB lässt Luft.
 *  ZU KNAPP wäre still tödlich: leseTar überspringt ein zu großes Motiv wortlos,
 *  dann fehlt es im Overlay, ohne dass irgendwo ein Fehler auftaucht. */
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120_000;
const MAX_REDIRECTS = 3;

const ERLAUBTE_HOSTS = /(^|\.)(github\.com|githubusercontent\.com)$/i;

/** Darf eine Weiterleitung auf diesen Host zeigen? GitHub schickt Release-
 *  Anhänge auf objects.githubusercontent.com weiter — das muss erlaubt sein.
 *  Exportiert, damit die Regel direkt prüfbar ist. */
export function istErlaubterWeiterleitungsHost(hostname: string): boolean {
  return ERLAUBTE_HOSTS.test(hostname);
}

export interface PackFortschritt {
  geladen: number;
  gesamt: number;
}

export interface TarEintrag {
  name: string;
  daten: Buffer;
}

/**
 * Minimaler tar-Leser (ustar). Nur reguläre Dateien; alles andere wird
 * übersprungen. Streng, weil wir fremden Inhalt in einen Nutzer-Ordner
 * entpacken: Pfadanteil, „..", absoluter Pfad oder falsche Endung fliegen raus.
 */
export function leseTar(buf: Buffer): TarEintrag[] {
  const out: TarEintrag[] = [];
  let pos = 0;
  while (pos + 512 <= buf.length) {
    const header = buf.subarray(pos, pos + 512);
    if (header.every((b) => b === 0)) break;

    const name = header.subarray(0, 100).toString('utf-8').replace(/\0.*$/, '');
    const groesseOktal = header.subarray(124, 136).toString('utf-8').replace(/\0.*$/, '').trim();
    const groesse = parseInt(groesseOktal, 8) || 0;
    const typ = String.fromCharCode(header[156] ?? 0);
    pos += 512;

    const daten = buf.subarray(pos, pos + groesse);
    pos += Math.ceil(groesse / 512) * 512;

    if (typ !== '0' && typ !== '\0') continue;
    if (groesse > MAX_ENTRY_BYTES) continue;
    if (!istSichererName(name)) continue;
    out.push({ name, daten: Buffer.from(daten) });
  }
  return out;
}

/** Nur schlichte .webm-Dateinamen ohne jeden Pfadanteil. */
export function istSichererName(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (name.startsWith('.')) return false;
  return /\.webm$/i.test(name);
}

function ladeBuffer(url: string, aufFortschritt?: (p: PackFortschritt) => void, tiefe = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    // Host-Filter gilt für WEITERLEITUNGSZIELE, nicht für die Start-Adresse (die
    // ist eine Konstante aus unserem Code bzw. im Test ein lokaler Server).
    if (tiefe > 0 && !ERLAUBTE_HOSTS.test(u.hostname)) {
      reject(new Error(`Weiterleitung auf unerwartete Adresse: ${u.hostname}`));
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: { 'User-Agent': 'botexe-studio', Accept: 'application/octet-stream,*/*' },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (tiefe >= MAX_REDIRECTS) { reject(new Error('Zu viele Weiterleitungen')); return; }
          ladeBuffer(new URL(res.headers.location, url).toString(), aufFortschritt, tiefe + 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(status === 404 ? 'Paket nicht gefunden (404)' : `HTTP ${status}`));
          return;
        }
        const gesamt = Number(res.headers['content-length'] ?? 0) || 0;
        const chunks: Buffer[] = [];
        let geladen = 0;
        res.on('data', (c: Buffer) => {
          geladen += c.length;
          if (geladen > MAX_PACK_BYTES) {
            req.destroy(new Error('Paket unerwartet groß — abgebrochen'));
            return;
          }
          chunks.push(c);
          aufFortschritt?.({ geladen, gesamt });
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Zeitüberschreitung')));
    req.on('error', reject);
    req.end();
  });
}

export interface PackErgebnis {
  ok: boolean;
  geschrieben?: number;
  uebersprungen?: number;
  error?: string;
}

/**
 * Lädt das Paket und legt die Clips im (beschreibbaren) Herz-Animations-Ordner
 * ab. Vorhandene Dateien bleiben unangetastet.
 */
export async function ladeHerzPaket(
  zielOrdner: string,
  aufFortschritt?: (p: PackFortschritt) => void,
  url: string = HERZ_PACK_URL,
): Promise<PackErgebnis> {
  try {
    if (url === HERZ_PACK_URL && !url.startsWith('https://github.com/')) {
      return { ok: false, error: 'Unerwartete Paket-Adresse' };
    }
    const gz = await ladeBuffer(url, aufFortschritt);
    const tar = zlib.gunzipSync(gz);
    const eintraege = leseTar(tar);
    if (eintraege.length === 0) return { ok: false, error: 'Paket enthält keine Animationen' };

    fs.mkdirSync(zielOrdner, { recursive: true });
    let geschrieben = 0;
    let uebersprungen = 0;
    for (const e of eintraege) {
      const ziel = path.join(zielOrdner, e.name);
      if (fs.existsSync(ziel)) { uebersprungen++; continue; }
      fs.writeFileSync(ziel, e.daten);
      geschrieben++;
    }
    log.info('HerzPack', `Animations-Paket entpackt: ${geschrieben} neu, ${uebersprungen} schon vorhanden`);
    return { ok: true, geschrieben, uebersprungen };
  } catch (err) {
    const nachricht = (err as Error).message;
    log.warn('HerzPack', `Animations-Paket fehlgeschlagen: ${nachricht}`);
    return { ok: false, error: nachricht };
  }
}
