// Geheimnis-Tresor für die Einstellungen.
//
// Warum: settings.json lag komplett im Klartext auf der Platte — darin der
// TikTok-„sessionid"-Cookie (wer den hat, IST du bei TikTok), der Euler-Key,
// der KI-Key, das OBS-Passwort und die TTS-Zugänge. Ein kopiertes
// Nutzerverzeichnis (Backup-Tool, Cloud-Sync, geteilter Rechner) reichte aus.
//
// Jetzt: Die Geheimnis-Felder werden aus dem Klartext-JSON herausgezogen und
// als EIN verschlüsselter Block (`_secrets`) daneben gelegt. Electrons
// safeStorage bindet ihn an das Benutzerkonto des Betriebssystems
// (Windows: DPAPI, Linux: Schlüsselbund, macOS: Keychain) — die Datei woanders
// hinzukopieren nützt dann nichts mehr.
//
// Ein Block statt Feld-für-Feld, weil es dann egal ist, ob ein Geheimnis ein
// String (aiApiKey) oder ein Objekt (ttsCredentials, spotifyTokens) ist.
//
// Diese Datei importiert BEWUSST kein 'electron': so ist sie unter `node:test`
// prüfbar. Die Krypto wird als Schnittstelle hereingereicht.

import { log } from '../core/logger';

/** Was safeStorage können muss — nur diese drei Methoden nutzen wir. */
export interface Krypto {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(enc: Buffer): string;
  /** Nur Linux: welcher Schlüsselbund es geworden ist. Siehe echterSchutz(). */
  getSelectedStorageBackend?(): string;
}

/**
 * Ist die Verschlüsselung mehr als Fassade?
 *
 * Wichtig und leicht zu übersehen: Auf Linux OHNE Schlüsselbund meldet
 * `isEncryptionAvailable()` trotzdem `true` — Chromium fällt dann auf das
 * Backend `basic_text` zurück, das mit einem FEST EINGEBAUTEN Schlüssel
 * arbeitet. Entschlüsseln kann das jeder, der den kennt (er steht im
 * Chromium-Quellcode). Das ist Verschleierung, kein Schutz.
 *
 * Wir verschlüsseln in dem Fall trotzdem — es ist nicht schlechter als vorher
 * und der Rückweg funktioniert. Aber es muss im Log stehen, damit niemand
 * (auch nicht wir) sich in falscher Sicherheit wiegt.
 *
 * Auf Windows (DPAPI) und macOS (Keychain) gibt es das Problem nicht.
 */
export function echterSchutz(krypto: Krypto): boolean {
  try {
    if (!krypto.isEncryptionAvailable()) return false;
    const backend = krypto.getSelectedStorageBackend?.();
    return backend !== 'basic_text';
  } catch {
    return false;
  }
}

/** Feldname im JSON, unter dem der verschlüsselte Block liegt. */
export const SECRET_BLOCK = '_secrets';

/** Verschachtelte Geheimnisse: Feld → Unterfelder. Aktuell nur das
 *  OBS-Passwort, das im `obs`-Block neben harmlosen Angaben (URL) sitzt. */
const VERSCHACHTELT: Record<string, string[]> = { obs: ['password'] };

/** Ein „leeres" Geheimnis ist keins — leere Strings/Objekte wandern nicht in
 *  den Tresor, sonst entsteht bei einer frischen Installation ein Block voller
 *  Leerwerte (und jeder Start ein unnötiger Keyring-Zugriff). */
function istLeer(v: unknown): boolean {
  if (v == null || v === '') return true;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

/**
 * Trennt die Geheimnisse ab und verschlüsselt sie.
 * Gibt das Objekt zurück, das SO auf die Platte geschrieben werden darf.
 *
 * Ist keine Verschlüsselung verfügbar (Linux ohne Schlüsselbund, headless),
 * bleibt alles im Klartext wie bisher — lieber unverschlüsselt als eine App,
 * die sich nicht mehr starten lässt. Wird einmal pro Speichern geloggt.
 */
export function packe(
  settings: Record<string, unknown>,
  felder: readonly string[],
  krypto: Krypto,
): Record<string, unknown> {
  const raus = { ...settings };
  delete raus[SECRET_BLOCK]; // nie einen alten Block mitschleppen

  if (!sicher(krypto)) return raus;

  const tresor: Record<string, unknown> = {};
  for (const feld of felder) {
    if (istLeer(raus[feld])) continue;
    tresor[feld] = raus[feld];
    delete raus[feld];
  }
  for (const [feld, unterfelder] of Object.entries(VERSCHACHTELT)) {
    const block = raus[feld];
    if (!block || typeof block !== 'object') continue;
    const kopie = { ...(block as Record<string, unknown>) };
    for (const u of unterfelder) {
      if (istLeer(kopie[u])) continue;
      tresor[`${feld}.${u}`] = kopie[u];
      delete kopie[u];
    }
    raus[feld] = kopie;
  }

  if (Object.keys(tresor).length === 0) return raus;

  try {
    raus[SECRET_BLOCK] = krypto.encryptString(JSON.stringify(tresor)).toString('base64');
  } catch (err) {
    // Verschlüsseln fehlgeschlagen → die Geheimnisse zurücklegen. Sie im
    // Nirgendwo verschwinden zu lassen wäre schlimmer als Klartext: der Nutzer
    // müsste sich sonst neu anmelden, ohne zu wissen warum.
    log.warn('Secrets', `Verschlüsseln fehlgeschlagen, speichere im Klartext: ${(err as Error).message}`);
    const klartext = { ...settings };
    delete klartext[SECRET_BLOCK];
    return klartext;
  }
  return raus;
}

/**
 * Gegenstück zu packe(): holt die Geheimnisse zurück ins Objekt.
 *
 * Scheitert das Entschlüsseln (Datei von einem anderen Rechner/Benutzerkonto,
 * Schlüsselbund neu aufgesetzt), gehen NUR die Geheimnisse verloren — alle
 * übrigen Einstellungen, Layouts und Trigger bleiben. Der Nutzer meldet sich
 * einmal neu an statt seine ganze Konfiguration zu verlieren.
 */
export function entpacke(
  roh: Record<string, unknown>,
  krypto: Krypto,
): Record<string, unknown> {
  const block = roh[SECRET_BLOCK];
  const raus = { ...roh };
  delete raus[SECRET_BLOCK];
  if (typeof block !== 'string' || !block) return raus;

  let tresor: Record<string, unknown>;
  try {
    tresor = JSON.parse(krypto.decryptString(Buffer.from(block, 'base64'))) as Record<string, unknown>;
  } catch (err) {
    log.warn(
      'Secrets',
      `Geheimnisse nicht lesbar (${(err as Error).message}) — bitte TikTok-Anmeldung und API-Keys neu eintragen. `
        + 'Alle übrigen Einstellungen bleiben erhalten.',
    );
    return raus;
  }
  if (!tresor || typeof tresor !== 'object') return raus;

  for (const [schluessel, wert] of Object.entries(tresor)) {
    const punkt = schluessel.indexOf('.');
    if (punkt < 0) {
      raus[schluessel] = wert;
      continue;
    }
    const feld = schluessel.slice(0, punkt);
    const unter = schluessel.slice(punkt + 1);
    // Nur in erwartete Unterfelder zurückschreiben — ein manipulierter Tresor
    // soll nicht irgendeinen Pfad im Einstellungs-Objekt setzen können.
    if (!VERSCHACHTELT[feld]?.includes(unter)) continue;
    const vorhanden = raus[feld];
    raus[feld] = { ...(typeof vorhanden === 'object' && vorhanden ? vorhanden : {}), [unter]: wert };
  }
  return raus;
}

/** Einmal-Warnung, damit nicht jeder Speichervorgang eine Zeile schreibt. */
let gewarnt = false;

function sicher(krypto: Krypto): boolean {
  let ok = false;
  try {
    ok = krypto.isEncryptionAvailable();
  } catch {
    ok = false;
  }
  if (!gewarnt) {
    gewarnt = true;
    if (!ok) {
      log.warn(
        'Secrets',
        'Kein System-Schlüsselbund verfügbar — API-Keys und TikTok-Login liegen unverschlüsselt in settings.json.',
      );
    } else if (!echterSchutz(krypto)) {
      // Siehe echterSchutz(): sieht verschlüsselt aus, schützt aber nicht.
      log.warn(
        'Secrets',
        'Schlüsselbund-Backend „basic_text" — die Verschlüsselung nutzt einen fest eingebauten Schlüssel und '
          + 'schützt NICHT vor fremdem Zugriff. Für echten Schutz einen Schlüsselbund einrichten '
          + '(gnome-keyring oder kwallet).',
      );
    } else {
      log.info('Secrets', `Geheimnisse verschlüsselt (${krypto.getSelectedStorageBackend?.() ?? 'System-Schlüsselbund'})`);
    }
  }
  return ok;
}

/** Nur für Tests: die Einmal-Warnung zurücksetzen. */
export function _resetWarnung(): void {
  gewarnt = false;
}
