// myinstants.ts — MyInstants-Suche + Import (aus botexe-app übernommen).
//
// MyInstants hat keine offizielle API; wir scrapen mit realistischem
// Browser-User-Agent (sonst 403). Pure Regex über das HTML — keine extra
// cheerio-Dependency für so simple Parses.
//
// Rate-Limit: max 1 Query/Sekunde. Treffer auf 50 geclamped, Download 5 MB.
// Kein Electron-Import — das Ziel-Verzeichnis kommt rein (testbar).
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { URL } from 'node:url';
import { log } from '../core/logger';

const BASE = 'https://www.myinstants.com';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
const MIN_QUERY_INTERVAL_MS = 1000;

const ALLOWED_HOSTS = new Set(['www.myinstants.com', 'myinstants.com']);

/** SSRF-Schutz für den Import-Download: nur myinstants.com-MP3s über HTTPS.
 *  Identische Allowlist wie der Vorhör-Pfad (overlay-server streamPreview) —
 *  verhindert, dass ein manipulierter Link interne IPs/fremde Hosts abruft. */
export function isAllowedMyInstantsMp3(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    ALLOWED_HOSTS.has(parsed.hostname.toLowerCase()) &&
    /\.mp3$/i.test(parsed.pathname)
  );
}

let lastQueryAt = 0;

export interface MyInstantsResult {
  title: string;
  mp3Url: string;
  thumbnail: string | null;
  /** MyInstants zeigt statt Thumbnails farbige Buttons — die Farbe für die UI. */
  color: string | null;
  pageUrl: string;
}

function fetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: {
          'User-Agent': UA,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9,de;q=0.8',
        },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          fetchText(new URL(res.headers.location, url).toString()).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          reject(new Error(`HTTP ${status}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.end();
  });
}

function fetchBuffer(url: string, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        headers: { 'User-Agent': UA, Accept: 'audio/*,*/*;q=0.5' },
        timeout: FETCH_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        // KEINE Redirects folgen — eine 3xx-Weiterleitung könnte von einer
        // erlaubten myinstants.com-URL auf eine interne IP zeigen (SSRF).
        if (status >= 300 && status < 400) {
          res.resume(); // Socket leeren
          reject(new Error('Weiterleitung beim Download nicht erlaubt'));
          return;
        }
        if (status !== 200) {
          reject(new Error(`HTTP ${status}`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (c: Buffer) => {
          total += c.length;
          if (total > maxBytes) {
            req.destroy(new Error(`Datei zu groß (>${maxBytes} bytes)`));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.end();
  });
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function absolutize(url: string): string {
  if (!url) return url;
  if (url.startsWith('//')) return `https:${url}`;
  if (url.startsWith('/')) return BASE + url;
  return url;
}

function parseInstants(html: string): MyInstantsResult[] {
  const results: MyInstantsResult[] = [];
  const blockRe =
    /<div[^>]*class=["'][^"']*\binstant\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class=["'][^"']*\binstant\b|<\/div>\s*<\/div>|<footer|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(html))) {
    const block = m[1] ?? '';

    const onclickMatch = /onclick=["']play\(\s*['"]([^'"]+)['"]/.exec(block);
    if (!onclickMatch?.[1]) continue;
    const mp3Url = absolutize(onclickMatch[1]);

    // Attribut-Reihenfolge variiert (href vor class und umgekehrt) — beide matchen.
    const linkMatch =
      /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*instant-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(block) ??
      /<a[^>]*class=["'][^"']*instant-link[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(block);
    let title = '';
    let pageUrl = BASE;
    if (linkMatch?.[1] && linkMatch[2] !== undefined) {
      pageUrl = absolutize(linkMatch[1]);
      title = decodeHtmlEntities(linkMatch[2].replace(/<[^>]+>/g, '').trim());
    }
    // Fallback: button title='Play XYZ sound'
    if (!title) {
      const titleMatch = /title=["']Play ([\s\S]*?) sound["']/i.exec(block);
      title = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1].trim()) : 'Unbekannt';
    }

    const bgMatch = /background-image\s*:\s*url\(\s*['"]?([^'")]+)/i.exec(block);
    const thumbnail = bgMatch?.[1] ? absolutize(bgMatch[1]) : null;
    const colorMatch = /small-button-background[^>]*background-color:\s*([^;"']+)/i.exec(block);
    const color = colorMatch?.[1]?.trim() ?? null;

    results.push({ title, mp3Url, thumbnail, color, pageUrl });
    if (results.length >= 50) break;
  }
  return results;
}

export async function searchMyInstants(query: string): Promise<MyInstantsResult[]> {
  const q = (query || '').trim();
  if (!q) return [];

  const wait = MIN_QUERY_INTERVAL_MS - (Date.now() - lastQueryAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastQueryAt = Date.now();

  const html = await fetchText(`${BASE}/en/search/?name=${encodeURIComponent(q)}`);
  const results = parseInstants(html);
  log.info('MyInstants', `"${q}" → ${results.length} Treffer`);
  return results;
}

function sanitizeFilename(name: string): string {
  const base = path.basename(name).toLowerCase();
  const cleaned = base.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || `sound-${Date.now()}.mp3`;
}

export async function downloadMyInstants(
  mp3Url: string,
  title: string,
  soundsDir: string,
): Promise<string> {
  // SSRF-Schutz: nur myinstants.com-MP3s über HTTPS — vor jedem Netz-/Datei-Zugriff.
  if (!isAllowedMyInstantsMp3(mp3Url)) throw new Error('Nur myinstants.com-MP3-Links sind erlaubt');
  let safe = sanitizeFilename(title);
  if (!/\.(mp3|wav|ogg|m4a)$/i.test(safe)) safe += '.mp3';

  let target = path.join(soundsDir, safe);
  let n = 1;
  while (fs.existsSync(target)) {
    const parsed = path.parse(safe);
    target = path.join(soundsDir, `${parsed.name}-${n}${parsed.ext}`);
    n++;
    if (n > 100) throw new Error('Kein freier Dateiname gefunden');
  }

  const buf = await fetchBuffer(mp3Url, MAX_DOWNLOAD_BYTES);
  await fsp.writeFile(target, buf);
  log.info('MyInstants', `Import: ${path.basename(target)} (${buf.length} bytes)`);
  return path.basename(target);
}
