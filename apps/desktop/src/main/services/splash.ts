// Startbild.
//
// Warum: Zwischen Doppelklick und fertigem Fenster liegen ein paar Sekunden —
// der Overlay-Server bindet seinen Port, die Einstellungen werden geladen, der
// Renderer baut auf. Vorher passierte in der Zeit sichtbar nichts, was auf
// einem langsameren Stream-PC wie „gestartet? oder nicht?" aussieht.
//
// Zwei Dinge sind hier wichtiger als das Bild selbst:
//
// 1. Das Startbild darf NIEMALS stehen bleiben. Wenn das Hauptfenster nicht
//    kommt (Port belegt, Fehlerdialog), muss es trotzdem verschwinden — sonst
//    klebt ein unschließbares Bild auf dem Bildschirm. Deshalb der Notaus per
//    Zeitschaltung.
// 2. Es darf keine Zeit kosten. Kein Warten auf Netz, keine Schrift von außen,
//    nur ein lokales Bild in einem rahmenlosen Fenster.

import { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { log } from '../core/logger';

/** Notaus: Nach dieser Zeit geht das Startbild von selbst zu — egal was sonst
 *  passiert ist. Großzügig gewählt, damit es auf langsamen Rechnern nicht
 *  mitten im Start wegblitzt, aber kurz genug, um nie zu kleben. */
const NOTAUS_MS = 20_000;

let fenster: BrowserWindow | null = null;
let notaus: ReturnType<typeof setTimeout> | null = null;

/** Bild als data:-Adresse einbetten — ein <img src="file://…"> wäre von der
 *  CSP des Hauptfensters betroffen und müsste extra freigeschaltet werden. */
function seite(bildDatei: string): string | null {
  if (!fs.existsSync(bildDatei)) return null;
  const b64 = fs.readFileSync(bildDatei).toString('base64');
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<style>
  html,body{margin:0;height:100%;overflow:hidden;background:#0c0d12}
  img{width:100%;height:100%;object-fit:cover;display:block}
  /* Sanft einblenden, damit es nicht aufpoppt. */
  body{animation:auf .25s ease-out}
  @keyframes auf{from{opacity:0}to{opacity:1}}
</style>
<img src="data:image/jpeg;base64,${b64}" alt="bOtExE Studio startet">`)}`;
}

/** Startbild zeigen. Tut nichts (und meldet nichts Schlimmes), wenn das Bild
 *  fehlt — ein fehlendes Startbild ist kein Grund, den Start abzubrechen. */
export function zeigeSplash(assetsDir: string): void {
  if (fenster) return;
  const html = seite(path.join(assetsDir, 'splash.jpg'));
  if (!html) return;

  try {
    fenster = new BrowserWindow({
      width: 560,
      height: 315,
      frame: false,
      resizable: false,
      movable: false,
      show: false,
      center: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#0c0d12',
      // Nichts aus dem Fenster heraus erreichbar machen: Es zeigt nur ein Bild.
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    fenster.once('ready-to-show', () => fenster?.show());
    void fenster.loadURL(html);
    fenster.on('closed', () => { fenster = null; });
  } catch (err) {
    log.warn('Splash', `Startbild konnte nicht gezeigt werden: ${(err as Error).message}`);
    fenster = null;
    return;
  }

  notaus = setTimeout(() => {
    if (fenster) log.warn('Splash', 'Startbild per Notaus geschlossen — das Hauptfenster kam nicht.');
    schliesseSplash();
  }, NOTAUS_MS);
}

/** Startbild wegräumen. Mehrfach aufrufbar. */
export function schliesseSplash(): void {
  if (notaus) { clearTimeout(notaus); notaus = null; }
  if (!fenster) return;
  const w = fenster;
  fenster = null;
  if (!w.isDestroyed()) w.close();
}
