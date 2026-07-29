// Symbol im Infobereich (Systemleiste, unten rechts neben der Uhr).
//
// Warum: Der Overlay-Server läuft im Hauptprozess. Solange das Fenster offen
// sein MUSS, liegt bOtExE Studio dem Streamer die ganze Sendung über in der
// Taskleiste im Weg — und wer es aus Versehen schließt, killt mitten im Stream
// alle Overlays in OBS.
//
// Jetzt: Fenster schließen legt die App in den Infobereich, alles läuft weiter.
// Beendet wird über das Rechtsklick-Menü des Symbols (oder Datei → Beenden).
// Abschaltbar über Einstellungen → `minimizeToTray`, denn ein Programm, das
// sich nicht schließen lässt, ist für manche eine böse Überraschung.

import { Tray, Menu, nativeImage, app } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { log } from '../core/logger';

export interface TrayOptionen {
  fenster: () => BrowserWindow | null;
  /** Ordner mit tray-16/32.png (im Paket <Resources>/assets, in dev apps/desktop/assets). */
  assetsDir: string;
  /** Overlay-Adresse für den Menüeintrag „Overlay-Adresse kopieren". */
  overlayUrl: () => string;
  kopiere: (text: string) => void;
  /** Wirklich beenden (setzt das Beenden-Flag und ruft app.quit). */
  beende: () => void;
  fensterZeigen: () => void;
}

let tray: Tray | null = null;

/** Symbol laden. Fehlt die Datei (unerwarteter Paket-Inhalt), lieber kein Tray
 *  als ein unsichtbares Symbol, das man nicht mehr anklicken kann.
 *
 *  Zwei Größen: 16px ist die native Größe der Windows-Taskleiste, die 32er
 *  kommt als „@2x"-Fassung dazu. Ohne die zweite Fassung skaliert Windows auf
 *  einem 4K-Bildschirm das 16er hoch — das sieht ausgefranst aus. */
function ladeSymbol(assetsDir: string): Electron.NativeImage | null {
  const klein = path.join(assetsDir, 'tray-16.png');
  if (!fs.existsSync(klein)) return null;
  const img = nativeImage.createFromPath(klein);
  if (img.isEmpty()) return null;

  const gross = path.join(assetsDir, 'tray-32.png');
  if (fs.existsSync(gross)) {
    const grossBuf = nativeImage.createFromPath(gross);
    if (!grossBuf.isEmpty()) {
      img.addRepresentation({ scaleFactor: 2, buffer: grossBuf.toPNG() });
    }
  }
  return img;
}

export function starteTray(opt: TrayOptionen): boolean {
  if (tray) return true;
  const symbol = ladeSymbol(opt.assetsDir);
  if (!symbol) {
    log.warn('Tray', `Kein Symbol in ${opt.assetsDir} gefunden — Infobereich-Symbol wird übersprungen.`);
    return false;
  }

  try {
    tray = new Tray(symbol);
  } catch (err) {
    // Nicht jeder Linux-Desktop hat einen Infobereich (und im CI/headless gibt
    // es gar keinen). Das darf den App-Start nicht mitreißen: ohne Symbol
    // bleibt es beim alten Verhalten — Fenster schließen beendet die App.
    log.warn('Tray', `Infobereich nicht verfügbar: ${(err as Error).message}`);
    tray = null;
    return false;
  }
  tray.setToolTip('bOtExE Studio');

  const menue = () => Menu.buildFromTemplate([
    { label: 'bOtExE Studio öffnen', click: () => opt.fensterZeigen() },
    { type: 'separator' },
    {
      label: 'Overlay-Adresse kopieren',
      click: () => {
        const url = opt.overlayUrl();
        if (url) opt.kopiere(url);
      },
    },
    { type: 'separator' },
    { label: `Version ${app.getVersion()}`, enabled: false },
    { label: 'Beenden', click: () => opt.beende() },
  ]);

  tray.setContextMenu(menue());
  // Linksklick: Fenster holen. Unter Windows ist das die Erwartung, unter
  // Linux öffnet je nach Desktop stattdessen das Menü — beides ist in Ordnung.
  tray.on('click', () => {
    const w = opt.fenster();
    if (w && w.isVisible() && !w.isMinimized()) w.hide();
    else opt.fensterZeigen();
  });
  return true;
}

export function stoppeTray(): void {
  tray?.destroy();
  tray = null;
}

export function trayLaeuft(): boolean {
  return tray !== null;
}
