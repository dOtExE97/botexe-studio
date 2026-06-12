// ttls-link.ts — TikTok-Live-Studio-tauglicher Overlay-Link.
//
// TTLS-Link-Quellen lehnen IPs und „localhost" ab (Format-Validierung verlangt
// eine echte Domain). Lösung: `localtest.me` — eine öffentliche Domain, die
// fest auf 127.0.0.1 zeigt. Traffic bleibt 100% lokal; die Domain ist nur ein
// „Namensschild". Haken: Router mit DNS-Rebind-Schutz (z.B. FritzBox) blocken
// die öffentliche Auflösung → dann hilft eine Zeile in der hosts-Datei, die
// diese App per Admin-Dialog selbst setzen kann (und beim Uninstall entfernt).
import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { spawn } from 'node:child_process';
import { log } from '../core/logger';

export const TTLS_HOST = 'localtest.me';
const MARKER = '# bOtExE Studio';
const ENTRY = `127.0.0.1 ${TTLS_HOST} ${MARKER}`;

/** Overlay-URL in die TTLS-taugliche Domain-Form umschreiben. */
export function toTtlsUrl(url: string): string {
  return url.replace('127.0.0.1', TTLS_HOST);
}

/** Pfad der hosts-Datei (plattformabhängig). */
export function hostsPath(): string {
  return process.platform === 'win32'
    ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts')
    : '/etc/hosts';
}

/** Prüft, ob der hosts-Inhalt einen aktiven (nicht auskommentierten) Eintrag hat. */
export function hostsContainsEntry(content: string): boolean {
  return content
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) return false;
      const beforeComment = (trimmed.split('#')[0] ?? '').trim();
      const parts = beforeComment.split(/\s+/);
      return parts[0] === '127.0.0.1' && parts.slice(1).includes(TTLS_HOST);
    });
}

/** Eintrag idempotent anhängen (pure Funktion — testbar). */
export function addEntryToHosts(content: string): string {
  if (hostsContainsEntry(content)) return content;
  const sep = content.endsWith('\n') || content === '' ? '' : '\n';
  return `${content}${sep}${ENTRY}\n`;
}

/** Unsere Zeile entfernen (pure Funktion — für den Uninstall). */
export function removeEntryFromHosts(content: string): string {
  return content
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) return true;
      const beforeComment = (trimmed.split('#')[0] ?? '').trim();
      const parts = beforeComment.split(/\s+/);
      return !(parts[0] === '127.0.0.1' && parts.slice(1).includes(TTLS_HOST));
    })
    .join('\n');
}

/** Löst die TTLS-Domain auf diesem PC auf 127.0.0.1 auf? (hosts ODER DNS) */
export function ttlsHostResolves(): Promise<boolean> {
  return new Promise((resolve) => {
    dns.lookup(TTLS_HOST, { family: 4 }, (err, address) => {
      resolve(!err && address === '127.0.0.1');
    });
  });
}

/** Steht unser Eintrag bereits in der hosts-Datei? (lesen geht ohne Admin) */
export function hostsEntryInstalled(): boolean {
  try {
    return hostsContainsEntry(fs.readFileSync(hostsPath(), 'utf-8'));
  } catch {
    return false;
  }
}

/**
 * hosts-Eintrag mit Admin-Rechten setzen (Windows: UAC-Dialog).
 * Idempotent — vorhandener Eintrag wird nicht doppelt angehängt.
 */
export function installHostsEntry(): Promise<{ ok: boolean; error?: string }> {
  if (hostsEntryInstalled()) return Promise.resolve({ ok: true });
  if (process.platform !== 'win32') {
    return Promise.resolve({
      ok: false,
      error: `Bitte manuell eintragen: echo "${ENTRY}" | sudo tee -a /etc/hosts`,
    });
  }
  // PowerShell mit RunAs: hängt die Zeile an, wenn sie fehlt (idempotent).
  const inner = [
    `$h=Join-Path $env:SystemRoot 'System32\\drivers\\etc\\hosts'`,
    `$c=Get-Content -Raw $h -ErrorAction SilentlyContinue`,
    `if($c -notmatch '(?m)^\\s*127\\.0\\.0\\.1\\s+.*${TTLS_HOST.replace(/\./g, '\\.')}'){Add-Content -Path $h -Value '${ENTRY}'}`,
  ].join('; ');
  return runElevated(inner);
}

/** hosts-Eintrag mit Admin-Rechten entfernen (für den Uninstall).
 *  Läuft detached — überlebt den sofortigen App-Quit des Squirrel-Events. */
export function uninstallHostsEntry(): Promise<{ ok: boolean; error?: string }> {
  if (!hostsEntryInstalled() || process.platform !== 'win32') return Promise.resolve({ ok: true });
  const inner = [
    `$h=Join-Path $env:SystemRoot 'System32\\drivers\\etc\\hosts'`,
    `$lines=Get-Content $h | Where-Object {$_ -notmatch '${MARKER}'}`,
    `Set-Content -Path $h -Value $lines`,
  ].join('; ');
  return runElevated(inner, true);
}

function runElevated(innerPs: string, detached = false): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Äußeres PowerShell startet inneres mit -Verb RunAs (UAC) und wartet.
    const encoded = Buffer.from(innerPs, 'utf16le').toString('base64');
    const args = [
      '-NoProfile', '-NonInteractive', '-Command',
      `$p=Start-Process powershell -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-EncodedCommand','${encoded}'; exit $p.ExitCode`,
    ];
    const child = spawn('powershell.exe', args, { windowsHide: true, detached, stdio: detached ? 'ignore' : undefined });
    if (detached) {
      child.unref();
      resolve({ ok: true });
      return;
    }
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr += String(d); });
    child.on('error', (err) => resolve({ ok: false, error: err.message }));
    child.on('exit', (code) => {
      if (code === 0) {
        log.info('TTLS', 'hosts-Eintrag aktualisiert');
        resolve({ ok: true });
      } else {
        // Häufigster Fall: User hat den UAC-Dialog abgebrochen.
        log.warn('TTLS', `hosts-Setup nicht ausgeführt (Code ${code})`, stderr.slice(0, 200));
        resolve({ ok: false, error: stderr.trim() || 'Admin-Bestätigung abgebrochen' });
      }
    });
  });
}
