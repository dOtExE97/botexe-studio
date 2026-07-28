// gift-image-pack.ts — einmaliger Download des Geschenk-Bilder-Pakets.
//
// WARUM es das gibt: TikTok gibt die vollständige Geschenk-Liste (und damit die
// Bild-Adressen) nur gegen einen kostenpflichtigen eulerstream-Plan heraus. Mit
// dem Gratis-Zugang sammelt die App nur Bilder von Geschenken, die wirklich mal
// jemand geschickt hat — alles andere zeigt im Overlay einen grauen Platzhalter.
// Dieses Paket schließt genau diese Lücke: einmal laden, danach haben alle
// Widgets für jedes Geschenk ein Bild.
//
// Format ist bewusst tar.gz und nicht zip: Node entpackt gzip von Haus aus
// (node:zlib), und ein tar-Leser sind ~40 Zeilen. Eine ZIP-Bibliothek wäre eine
// zusätzliche Abhängigkeit für genau einen Aufruf.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import zlib from 'node:zlib';
import { log } from '../core/logger';

/** Wo das Paket liegt. Anhang einer GitHub-Version — NICHT im Quellcode-Verlauf
 *  (die Bilder gehören TikTok; ein Anhang lässt sich zurückziehen, ein Commit
 *  bleibt für immer). */
export const PACK_URL =
  'https://github.com/dOtExE97/botexe-studio/releases/download/gift-images-v1/gift-images.tar.gz';

/** Reißleine gegen ein unerwartet riesiges Paket (erwartet ~25 MB). */
const MAX_PACK_BYTES = 200 * 1024 * 1024;
/** Einzeldatei-Grenze — ein Gift-Bild ist wenige KB groß. */
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 60_000;
/** GitHub leitet auf objects.githubusercontent.com weiter — mehr als drei
 *  Sprünge braucht kein legitimer Download. */
const MAX_REDIRECTS = 3;

const ERLAUBTE_HOSTS = /(^|\.)(github\.com|githubusercontent\.com)$/i;

/** Darf eine Weiterleitung auf diesen Host zeigen? GitHub schickt Release-
 *  Anhänge auf objects.githubusercontent.com weiter — das muss erlaubt sein,
 *  alles andere nicht. Exportiert, damit die Regel direkt prüfbar ist (ein
 *  echter GitHub-Sprung lässt sich lokal nicht nachstellen). */
export function istErlaubterWeiterleitungsHost(hostname: string): boolean {
  return ERLAUBTE_HOSTS.test(hostname);
}

export interface PackFortschritt {
  /** Bereits geladene Bytes. */
  geladen: number;
  /** Gesamtgröße, falls der Server sie meldet (sonst 0). */
  gesamt: number;
}

/** Ein Eintrag aus dem tar. */
export interface TarEintrag {
  name: string;
  daten: Buffer;
}

/**
 * Minimaler tar-Leser (ustar). Liefert nur reguläre Dateien; Ordner, Links und
 * alles andere werden übersprungen.
 *
 * Bewusst streng: Wir entpacken hier fremden Inhalt in einen Ordner des
 * Nutzers. Einträge mit Pfadanteil, „..", absolutem Pfad oder falscher Endung
 * fliegen raus — ein präpariertes Archiv darf NICHT in Nachbarordner schreiben.
 */
export function leseTar(buf: Buffer): TarEintrag[] {
  const out: TarEintrag[] = [];
  let pos = 0;
  while (pos + 512 <= buf.length) {
    const header = buf.subarray(pos, pos + 512);
    // Zwei Null-Blöcke = Ende des Archivs.
    if (header.every((b) => b === 0)) break;

    const name = header.subarray(0, 100).toString('utf-8').replace(/\0.*$/, '');
    const groesseOktal = header.subarray(124, 136).toString('utf-8').replace(/\0.*$/, '').trim();
    const groesse = parseInt(groesseOktal, 8) || 0;
    const typ = String.fromCharCode(header[156] ?? 0);
    pos += 512;

    // Nutzdaten sind auf 512 aufgerundet.
    const daten = buf.subarray(pos, pos + groesse);
    pos += Math.ceil(groesse / 512) * 512;

    // '0' und '\0' sind beides „reguläre Datei".
    if (typ !== '0' && typ !== '\0') continue;
    if (groesse > MAX_ENTRY_BYTES) continue;
    if (!istSichererName(name)) continue;
    out.push({ name, daten: Buffer.from(daten) });
  }
  return out;
}

/** Nur schlichte Bild-Dateinamen ohne jeden Pfadanteil. */
export function istSichererName(name: string): boolean {
  if (!name || name.length > 200) return false;
  if (name.includes('/') || name.includes('\\')) return false;
  if (name.startsWith('.')) return false;
  return /\.(png|webp|jpe?g|gif)$/i.test(name);
}

function ladeBuffer(url: string, aufFortschritt?: (p: PackFortschritt) => void, tiefe = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    // Der Host-Filter gilt für WEITERLEITUNGSZIELE, nicht für die Start-Adresse.
    // Begründung: Die Start-Adresse ist eine Konstante aus unserem Code (oder im
    // Test ein lokaler Server) — die kennen wir. Fremdgesteuert ist nur, wohin
    // der Server uns weiterschickt; genau dort muss geprüft werden, damit eine
    // manipulierte Weiterleitung nicht auf einen internen Dienst zeigt.
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
        // Anders als bei MyInstants MUSS hier weitergeleitet werden — GitHub
        // schickt jeden Release-Anhang auf objects.githubusercontent.com. Das
        // Ziel wird gegen dieselbe Host-Liste geprüft, kein offener Sprung.
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
  /** Wie viele Bilder neu abgelegt wurden. */
  geschrieben?: number;
  /** Wie viele schon vorhanden waren (werden nicht überschrieben). */
  uebersprungen?: number;
  error?: string;
}

/**
 * Lädt das Paket und legt die Bilder im Gift-Bilder-Ordner ab.
 *
 * Vorhandene Dateien bleiben unangetastet: Wer eigene Bilder hinterlegt hat,
 * soll sie durch den Download NICHT verlieren.
 */
export async function ladeBildPaket(
  zielOrdner: string,
  aufFortschritt?: (p: PackFortschritt) => void,
  url: string = PACK_URL,
): Promise<PackErgebnis> {
  try {
    // Die Start-Adresse muss https bei uns sein — nur Tests geben eine lokale
    // http-Adresse vor. So bleibt der Aufruf aus der App fest verdrahtet.
    if (url === PACK_URL && !url.startsWith('https://github.com/')) {
      return { ok: false, error: 'Unerwartete Paket-Adresse' };
    }
    const gz = await ladeBuffer(url, aufFortschritt);
    const tar = zlib.gunzipSync(gz);
    const eintraege = leseTar(tar);
    if (eintraege.length === 0) return { ok: false, error: 'Paket enthält keine Bilder' };

    fs.mkdirSync(zielOrdner, { recursive: true });
    let geschrieben = 0;
    let uebersprungen = 0;
    for (const e of eintraege) {
      const ziel = path.join(zielOrdner, e.name);
      if (fs.existsSync(ziel)) { uebersprungen++; continue; }
      fs.writeFileSync(ziel, e.daten);
      geschrieben++;
    }
    log.info('GiftCatalog', `Bild-Paket entpackt: ${geschrieben} neu, ${uebersprungen} schon vorhanden`);
    return { ok: true, geschrieben, uebersprungen };
  } catch (err) {
    const nachricht = (err as Error).message;
    log.warn('GiftCatalog', `Bild-Paket fehlgeschlagen: ${nachricht}`);
    return { ok: false, error: nachricht };
  }
}
