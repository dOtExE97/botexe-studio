import { app, autoUpdater, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';
import type { StudioEvent, TriggerRule, Redemption, PanelButton, ChatCommand } from '@botexe/trigger-engine';
import { IPC } from './shared/constants';
import { Studio } from './main/services/studio';
import { searchMyInstants, downloadMyInstants } from './main/services/myinstants';
import { BYOK_PROVIDERS } from './main/services/tts-byok';
import { log, initFileLogging, getLogDir, formatLocalStamp } from './main/core/logger';
import { toTtlsUrl, ttlsHostResolves, hostsEntryInstalled, installHostsEntry, uninstallHostsEntry, TTLS_HOST } from './main/services/ttls-link';

// Squirrel-Installer (Windows) startet die App während Install/Update kurz —
// dann sofort beenden, sonst öffnen sich Geister-Fenster.
// Beim Uninstall: unseren hosts-Eintrag mit aufräumen (fire-and-forget,
// PowerShell läuft detached weiter, auch wenn die App gleich beendet).
if (process.argv.some((a) => a === '--squirrel-uninstall')) {
  void uninstallHostsEntry();
}
if (started) {
  app.quit();
}

// Performance neben dem Spiel: Chromium drosselt verdeckte/Hintergrund-Fenster
// hart (Renderer-Priorität runter, Timer/rAF gebremst). Wenn der Streamer
// Fortnite im Vollbild zockt, ist unser Fenster verdeckt — ohne diese Switches
// würde die Editor-Vorschau/Overlay-Logik einbrechen. Das ungebremste rAF, das
// dadurch sonst entstünde, fängt unser eigener 60fps-Cap ab (fps-cap.js).
// Bewusst NICHT: --disable-gpu-vsync (würde rAF auf 200+fps treiben) und
// powerSaveBlocker (hält System künstlich wach — für ein Overlay unnötig).
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// Nur eine Instanz — zweiter Start fokussiert das bestehende Fenster.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Auto-Update über GitHub Releases (Squirrel-Delta: Nutzer laden nur die
// Änderungen). Funktioniert nur, wenn die Releases öffentlich sind.
const UPDATE_REPO = 'dOtExE97/botexe-studio';
/** Letzter bekannter Update-Zustand — fürs UI (Settings) + Toasts. */
let updateState: { state: string; version?: string; message?: string } = { state: 'idle' };

function pushUpdateStatus(next: typeof updateState): void {
  updateState = next;
  sendToRenderer(IPC.UPDATE_STATUS, next);
}

function setupAutoUpdate(): void {
  if (!app.isPackaged || !UPDATE_REPO) {
    pushUpdateStatus({ state: 'dev' }); // Auto-Update nur in der installierten App
    return;
  }
  try {
    // „Kein Release"/404 ist der NORMALFALL, solange keine öffentlichen Releases
    // existieren — soll NICHT als Riesen-Stacktrace im Log landen.
    const isNoRelease = (m: unknown) => /\b404\b|not found/i.test(String(m ?? ''));
    const firstLine = (m: unknown) => (String(m ?? '').split('\n')[0] ?? '').slice(0, 180);
    // Eigener, kompakter Logger für update-electron-app → schluckt Squirrels
    // verbose Child-Prozess-Ausgabe (sonst dumpt sie via console den ganzen Stack).
    const updLogger = {
      log: () => undefined, info: () => undefined,
      warn: (...a: unknown[]) => log.warn('Update', firstLine(a[0])),
      error: (...a: unknown[]) => { if (!isNoRelease(a[0])) log.warn('Update', firstLine(a[0])); },
    };
    // notifyUser:false → kein eigener Dialog der Lib; wir steuern das UI selbst.
    updateElectronApp({
      updateSource: { type: UpdateSourceType.ElectronPublicUpdateService, repo: UPDATE_REPO },
      updateInterval: '6 hours',
      notifyUser: false,
      logger: updLogger,
    });
    autoUpdater.on('checking-for-update', () => pushUpdateStatus({ state: 'checking' }));
    autoUpdater.on('update-available', () => pushUpdateStatus({ state: 'available' }));
    autoUpdater.on('update-not-available', () => pushUpdateStatus({ state: 'none' }));
    autoUpdater.on('update-downloaded', (_e, _notes, name) => {
      pushUpdateStatus({ state: 'downloaded', version: typeof name === 'string' ? name : undefined });
      sendToRenderer(IPC.TOAST_SHOW, { type: 'info', message: 'Update geladen — beim nächsten Neustart aktiv (oder jetzt in den Einstellungen installieren).' });
    });
    autoUpdater.on('error', (err) => {
      // 404 = noch kein öffentliches Release → harmloser Normalzustand, nur knapp + leise.
      if (isNoRelease(err?.message)) {
        log.info('Update', 'Kein Update verfügbar (noch kein öffentliches Release)');
        pushUpdateStatus({ state: 'none' });
        return;
      }
      log.warn('Update', 'Auto-Update-Fehler', firstLine(err?.message ?? err));
      pushUpdateStatus({ state: 'error', message: firstLine(err?.message ?? 'unbekannt') });
    });
  } catch (err) {
    log.warn('Update', 'Auto-Update nicht verfügbar', (err as Error).message);
    pushUpdateStatus({ state: 'error', message: (err as Error).message });
  }
}

let mainWindow: BrowserWindow | null = null;
let studio: Studio | null = null;

function sendToRenderer(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0c0c10',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // Stream-Tool: auch wenn das Fenster verdeckt ist, nicht drosseln
      // (Events/Sounds laufen weiter, CDP-Captures hängen nicht).
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Login-Fenster: der Nutzer meldet sich bei TikTok an, wir lesen danach den
 *  „sessionid"-Cookie aus (schaltet das Chat-Senden frei). Eigene, persistente
 *  Session (getrennt vom App-Shell, daher keine strikte CSP); echter Chrome-UA,
 *  sonst zeigt TikTok in Electron oft „Seite nicht verfügbar". */
async function openTiktokLogin(): Promise<{ ok: boolean; loggedIn: boolean }> {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      title: 'Bei TikTok anmelden — danach kann die App in den Chat schreiben',
      autoHideMenuBar: true,
      parent: mainWindow ?? undefined,
      webPreferences: { partition: 'persist:tiktok', sandbox: true },
    });
    win.webContents.setUserAgent(CHROME_UA);
    void win.loadURL('https://www.tiktok.com/login');
    let done = false;
    const finish = (loggedIn: boolean) => {
      if (done) return;
      done = true;
      clearInterval(iv);
      if (!win.isDestroyed()) win.close();
      resolve({ ok: true, loggedIn });
    };
    const check = async () => {
      try {
        const sess = win.webContents.session;
        const sidC = await sess.cookies.get({ url: 'https://www.tiktok.com', name: 'sessionid' });
        const sid = sidC.find((c) => c.value && c.value.length > 10)?.value;
        if (!sid) return; // noch nicht eingeloggt
        // tt-target-idc ist von der Lib ZWINGEND zum Senden nötig.
        const idcC = await sess.cookies.get({ url: 'https://www.tiktok.com', name: 'tt-target-idc' });
        const idc = idcC.find((c) => c.value)?.value ?? '';
        isStudio().setTiktokSession(sid, idc);
        finish(true);
      } catch { /* noch nicht eingeloggt */ }
    };
    const iv = setInterval(() => void check(), 1500);
    win.on('closed', () => { clearInterval(iv); if (!done) resolve({ ok: true, loggedIn: isStudio().isTiktokLoggedIn() }); });
  });
}

function setupStudio(): Studio {
  const paths = Studio.resolvePaths(
    app.getAppPath(),
    process.resourcesPath,
    app.isPackaged,
    app.getPath('userData'),
  );
  paths.appVersion = app.getVersion();
  return new Studio(paths, {
    onSoundPlay: (cmd) => sendToRenderer(IPC.SOUND_PLAY, cmd),
    onStatus: (info) => sendToRenderer(IPC.PLATFORM_STATUS, info),
    onBusEvent: (e) => sendToRenderer(IPC.BUS_EVENT, e),
    onStats: (stats) => sendToRenderer(IPC.STATS_UPDATE, stats),
    onToast: (toast) => sendToRenderer(IPC.TOAST_SHOW, toast),
    onTriggerLog: (entry) => sendToRenderer(IPC.TRIGGER_LOG, entry),
    onObsStatus: (status) => sendToRenderer(IPC.OBS_STATUS, status),
    onStreamerbotStatus: (status) => sendToRenderer(IPC.SB_STATUS, status),
  });
}

// ── IPC — alle Kanäle explizit, Inputs validiert ──────────────────────────

function isStudio(): Studio {
  if (!studio) throw new Error('Studio nicht initialisiert');
  return studio;
}

function registerIpc(): void {
  ipcMain.handle(IPC.PLATFORM_CONNECT, async (_e, username: unknown) => {
    if (typeof username !== 'string' || !/^@?[a-zA-Z0-9._]{2,40}$/.test(username)) {
      return { ok: false, error: 'Ungültiger Username' };
    }
    try {
      await isStudio().connect(username);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.PLATFORM_DISCONNECT, async () => {
    await isStudio().disconnect();
    return { ok: true };
  });

  ipcMain.handle(IPC.OVERLAY_GET_INFO, () => isStudio().getOverlayInfo());

  ipcMain.handle(IPC.APP_INFO, () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: process.platform,
    dataDir: app.getPath('userData'),
    overlayPort: isStudio().getOverlayInfo().port,
    control: isStudio().getControlInfo(),
  }));
  ipcMain.handle(IPC.APP_OPEN_DATA_DIR, () => {
    void shell.openPath(app.getPath('userData'));
    return { ok: true };
  });
  ipcMain.handle(IPC.APP_OPEN_GIFT_IMAGES, () => {
    void shell.openPath(isStudio().giftCatalog.getImagesDir());
    return { ok: true };
  });
  ipcMain.handle(IPC.SPOTIFY_BEGIN_AUTH, () => {
    const r = isStudio().spotifyBeginAuth();
    if (r.ok && r.url) void shell.openExternal(r.url); // Login im Standardbrowser
    return r;
  });
  ipcMain.handle(IPC.SPOTIFY_STATUS, () => isStudio().spotifyStatus());
  ipcMain.handle(IPC.SPOTIFY_CONTROL, async (_e, action: unknown) => {
    if (action !== 'play' && action !== 'pause' && action !== 'next' && action !== 'previous') return { ok: false };
    return { ok: await isStudio().spotifyControl(action) };
  });
  ipcMain.handle(IPC.SPOTIFY_LOGOUT, () => { isStudio().spotifyLogout(); return { ok: true }; });
  ipcMain.handle(IPC.APP_COPY, (_e, text: unknown) => {
    // navigator.clipboard ist im Electron-Renderer geblockt → nativ kopieren.
    clipboard.writeText(typeof text === 'string' ? text : String(text ?? ''));
    return { ok: true };
  });
  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, (_e, url: unknown) => {
    // Nur http(s) öffnen — kein file:/// o.ä. aus dem Renderer zulassen.
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
      return { ok: true };
    }
    return { ok: false };
  });
  // Konfig-Backup: alles (Einstellungen/Trigger/Store/Panel/Overlays/Zuschauer)
  // in eine JSON-Datei sichern bzw. wieder einspielen.
  ipcMain.handle(IPC.CONFIG_EXPORT, async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Backup speichern',
      defaultPath: `botexe-studio-backup-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { ok: false };
    try {
      const bundle = { app: app.getVersion(), exportedAt: new Date().toISOString(), ...isStudio().exportConfig() };
      fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), 'utf-8');
      return { ok: true, path: filePath };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  ipcMain.handle(IPC.CONFIG_IMPORT, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Backup einspielen',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths[0]) return { ok: false };
    try {
      const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
      const res = isStudio().importConfig(data);
      if (res.ok) registerPanelHotkeys(); // Hotkeys aus dem Backup neu greifen
      return res;
    } catch (err) {
      return { ok: false, layouts: 0, viewers: 0, error: (err as Error).message };
    }
  });
  // Auto-Update: manuell prüfen + installieren (Settings).
  ipcMain.handle(IPC.UPDATE_CHECK, () => {
    if (!app.isPackaged) return { state: 'dev' };
    try {
      pushUpdateStatus({ state: 'checking' });
      autoUpdater.checkForUpdates();
    } catch (err) {
      pushUpdateStatus({ state: 'error', message: (err as Error).message });
    }
    return updateState;
  });
  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    if (updateState.state === 'downloaded') {
      try { autoUpdater.quitAndInstall(); } catch (err) { log.warn('Update', 'quitAndInstall', (err as Error).message); }
    }
    return { ok: updateState.state === 'downloaded' };
  });
  // TikTok-Live-Studio-Link: Domain-Form + Status der lokalen Auflösung
  ipcMain.handle(IPC.TTLS_LINK_GET, async (_e, layoutId: unknown) => {
    const base = typeof layoutId === 'string' && layoutId
      ? isStudio().getProfileLink(layoutId)
      : isStudio().getOverlayInfo().url;
    const resolves = await ttlsHostResolves();
    return {
      // &perf=1: der TTLS-Browser rendert oft ohne GPU — Schnell-Modus
      // (ohne Echtzeit-Blur) hält die Animationen dort smooth.
      url: `${toTtlsUrl(base)}&perf=1`,
      host: TTLS_HOST,
      ready: resolves,
      hostsEntry: hostsEntryInstalled(),
    };
  });
  ipcMain.handle(IPC.TTLS_SETUP, async () => {
    const result = await installHostsEntry();
    return { ...result, ready: await ttlsHostResolves() };
  });

  ipcMain.handle(IPC.LOGS_OPEN, () => {
    void shell.openPath(getLogDir() || app.getPath('userData'));
    return { ok: true };
  });
  // Renderer-Fehler (Widget-/UI-Crashes) ins zentrale Datei-Log spiegeln.
  ipcMain.on(IPC.SOUND_ENDED, (_e, soundId: unknown) => {
    if (typeof soundId === 'string') isStudio().notifySoundEnded(soundId);
  });
  ipcMain.on(IPC.LOG_RENDERER, (_e, level: unknown, scope: unknown, message: unknown) => {
    const s = typeof scope === 'string' ? scope : 'Renderer';
    const m = typeof message === 'string' ? message : String(message);
    if (level === 'error') log.error(s, m);
    else if (level === 'warn') log.warn(s, m);
    else log.info(s, m);
  });
  ipcMain.handle(IPC.VIEWERS_LIST, (_e, query: unknown) =>
    isStudio().listViewers(typeof query === 'string' ? query : '', 200),
  );
  ipcMain.handle(IPC.VIEWER_FLAG, (_e, userId: unknown, flag: unknown, value: unknown) => {
    if (typeof userId === 'string' && (flag === 'vip' || flag === 'muted') && typeof value === 'boolean') {
      isStudio().setViewerFlag(userId, flag, value);
    }
    return { ok: true };
  });
  ipcMain.handle(IPC.VIEWER_GRANT, (_e, userId: unknown, delta: unknown) => {
    if (typeof userId === 'string' && typeof delta === 'number') isStudio().grantPoints(userId, delta);
    return { ok: true };
  });
  ipcMain.handle(IPC.VIEWER_VOICE, (_e, userId: unknown, voice: unknown) => {
    if (typeof userId === 'string') isStudio().setViewerVoice(userId, typeof voice === 'string' && voice ? voice : undefined);
    return { ok: true };
  });
  ipcMain.handle(IPC.VIEWER_WELCOME_MEDIA, (_e, userId: unknown, mediaId: unknown) => {
    if (typeof userId === 'string') isStudio().setViewerWelcomeMedia(userId, typeof mediaId === 'string' && mediaId ? mediaId : undefined);
    return { ok: true };
  });
  ipcMain.handle(IPC.SESSION_RESET, () => {
    isStudio().resetSession();
    return { ok: true };
  });
  ipcMain.handle(IPC.POINTS_RESET, async () => {
    if (!mainWindow) return { ok: false };
    const res = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Abbrechen', 'Punkte zurücksetzen'],
      defaultId: 0,
      cancelId: 0,
      message: 'Alle Loyalty-Punkte aller Zuschauer löschen?',
      detail: 'Das kann nicht rückgängig gemacht werden.',
    });
    if (res.response !== 1) return { ok: false };
    isStudio().resetPoints();
    return { ok: true };
  });

  // Layouts
  ipcMain.handle(IPC.LAYOUT_LIST, () => isStudio().layouts.list());
  ipcMain.handle(IPC.LAYOUT_GET, (_e, id: unknown) =>
    typeof id === 'string' ? isStudio().layouts.get(id) : null,
  );
  ipcMain.handle(IPC.LAYOUT_SAVE, (_e, layout: unknown) => {
    const result = isStudio().layouts.save(layout);
    if (result.ok) isStudio().notifyLayoutSaved(result.layout.id);
    return result;
  });
  ipcMain.handle(IPC.LAYOUT_DELETE, (_e, id: unknown) =>
    typeof id === 'string' ? isStudio().layouts.delete(id) : false,
  );
  ipcMain.handle(IPC.LAYOUT_SET_ACTIVE, (_e, id: unknown) => {
    isStudio().setActiveLayout(typeof id === 'string' ? id : null);
    return { ok: true };
  });
  ipcMain.handle(IPC.LAYOUT_PROFILE_LINK, (_e, id: unknown) =>
    typeof id === 'string' ? isStudio().getProfileLink(id) : '',
  );

  // Trigger-Regeln
  ipcMain.handle(IPC.RULES_GET, () => isStudio().getRules());
  ipcMain.handle(IPC.RULES_SET, (_e, rules: unknown) => {
    if (!Array.isArray(rules)) return { ok: false, error: 'rules muss ein Array sein' };
    isStudio().setRules(rules as TriggerRule[]);
    return { ok: true };
  });
  ipcMain.handle(IPC.GIFT_CATALOG_GET, () => isStudio().getGiftCatalog());
  ipcMain.handle(IPC.GIFT_META_SET, (_e, slug: unknown, patch: unknown) => {
    if (typeof slug !== 'string' || typeof patch !== 'object' || patch === null) return {};
    return isStudio().setGiftMeta(slug, patch as { favorite?: boolean; customName?: string });
  });
  ipcMain.handle(IPC.OBS_SET_CONFIG, (_e, cfg: unknown) => {
    const c = (cfg ?? {}) as Record<string, unknown>;
    isStudio().setObsConfig({
      enabled: c.enabled === true,
      url: typeof c.url === 'string' ? c.url.slice(0, 200) : 'ws://127.0.0.1:4455',
      password: typeof c.password === 'string' ? c.password.slice(0, 200) : '',
    });
    return { ok: true, status: isStudio().getObsStatus() };
  });
  ipcMain.handle(IPC.OBS_GET_SCENES, () => isStudio().getObsScenes());
  // Streamer.bot
  ipcMain.handle(IPC.SB_SET_CONFIG, (_e, cfg: unknown) => {
    const c = (cfg ?? {}) as Record<string, unknown>;
    isStudio().setStreamerbotConfig({
      enabled: c.enabled === true,
      url: typeof c.url === 'string' ? c.url.slice(0, 200) : 'ws://127.0.0.1:8080/',
    });
    return { ok: true, status: isStudio().getStreamerbotStatus() };
  });
  ipcMain.handle(IPC.SB_GET_ACTIONS, () => isStudio().getStreamerbotActions());
  // TikTok-Login-Fenster: nach dem Login den sessionid-Cookie auslesen.
  ipcMain.handle(IPC.TIKTOK_LOGIN, () => openTiktokLogin());
  ipcMain.handle(IPC.TIKTOK_LOGOUT, () => { isStudio().setTiktokSession(undefined); return { ok: true }; });
  ipcMain.handle(IPC.CHAT_SEND, async (_e, text: unknown) => {
    if (typeof text !== 'string') return { ok: false, error: 'kein Text' };
    return isStudio().sendChat(text);
  });
  ipcMain.handle(IPC.STATS_HISTORY_GET, (_e, range: unknown) => {
    const r = range === 'month' || range === 'year' ? range : 'week';
    return isStudio().getStatsHistory(r);
  });
  ipcMain.handle(IPC.STATS_CSV_EXPORT, async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Stream-Statistik als CSV speichern',
      defaultPath: `botexe-stats-${stamp}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return { ok: false };
    try {
      fs.writeFileSync(filePath, '﻿' + isStudio().exportStatsCsv(), 'utf-8'); // BOM für Excel
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  // Einlöse-Store
  ipcMain.handle(IPC.REDEMPTIONS_GET, () => isStudio().getRedemptions());
  ipcMain.handle(IPC.REDEMPTIONS_SET, (_e, reds: unknown) => {
    if (!Array.isArray(reds)) return { ok: false, error: 'redemptions muss ein Array sein' };
    isStudio().setRedemptions(reds as Redemption[]);
    return { ok: true };
  });
  ipcMain.handle(IPC.COMMANDS_GET, () => isStudio().getChatCommands());
  ipcMain.handle(IPC.COMMANDS_SET, (_e, cmds: unknown) => {
    if (!Array.isArray(cmds)) return { ok: false, error: 'commands muss ein Array sein' };
    isStudio().setChatCommands(cmds as ChatCommand[]);
    return { ok: true };
  });

  // Giveaway / Verlosung
  ipcMain.handle(IPC.GIVEAWAY_STATE, () => isStudio().giveawayState());
  ipcMain.handle(IPC.GIVEAWAY_CONFIG, (_e, patch: unknown) => {
    if (typeof patch !== 'object' || patch === null) return { ok: false };
    return { ok: true, config: isStudio().setGiveawayConfig(patch as Partial<{ enabled: boolean; joinWord: string; entryCost: number }>) };
  });
  ipcMain.handle(IPC.GIVEAWAY_DRAW, () => isStudio().drawGiveaway());
  ipcMain.handle(IPC.GIVEAWAY_RESET, () => { isStudio().resetGiveaway(); return { ok: true }; });
  // Stammgast-Begrüßung
  ipcMain.handle(IPC.GREET_GET, () => isStudio().getGreetReturning());
  ipcMain.handle(IPC.GREET_SET, (_e, patch: unknown) => {
    if (typeof patch !== 'object' || patch === null) return {};
    return isStudio().setGreetReturning(patch as Partial<{ enabled: boolean; minVisits: number; template: string }>);
  });

  // Manuelles Auslöse-Panel + Hotkeys
  ipcMain.handle(IPC.PANEL_GET, () => isStudio().getPanelButtons());
  ipcMain.handle(IPC.PANEL_SET, (_e, buttons: unknown) => {
    if (!Array.isArray(buttons)) return { ok: false, error: 'buttons muss ein Array sein' };
    isStudio().setPanelButtons(buttons as PanelButton[]);
    registerPanelHotkeys();
    return { ok: true };
  });
  ipcMain.handle(IPC.PANEL_FIRE, (_e, action: unknown) => {
    if (action && typeof action === 'object') isStudio().fireManual(action as Parameters<Studio['fireManual']>[0]);
    return { ok: true };
  });

  // Sounds
  ipcMain.handle(IPC.SOUND_LIST, () => isStudio().sounds.list());
  ipcMain.handle(IPC.SOUND_IMPORT, async () => {
    if (!mainWindow) return { ok: false, error: 'Kein Fenster' };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Sound importieren',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (picked.canceled) return { ok: true, imported: [] };
    const imported = [];
    for (const file of picked.filePaths) {
      const result = isStudio().sounds.import(file);
      if (result.ok) imported.push(result.entry);
    }
    return { ok: true, imported };
  });
  ipcMain.handle(IPC.SOUND_DELETE, (_e, id: unknown) =>
    typeof id === 'string' ? isStudio().sounds.delete(id) : false,
  );
  ipcMain.handle(IPC.SOUND_TEST, (_e, id: unknown) => {
    if (typeof id === 'string') isStudio().playSound(id);
    return { ok: true };
  });
  ipcMain.handle(IPC.SOUND_SEARCH_MYINSTANTS, async (_e, query: unknown) => {
    if (typeof query !== 'string' || query.trim().length < 2) {
      return { ok: false, error: 'Suchbegriff zu kurz', results: [] };
    }
    try {
      return { ok: true, results: await searchMyInstants(query) };
    } catch (err) {
      return { ok: false, error: (err as Error).message, results: [] };
    }
  });
  ipcMain.handle(IPC.SOUND_IMPORT_MYINSTANTS, async (_e, mp3Url: unknown, title: unknown) => {
    if (typeof mp3Url !== 'string' || typeof title !== 'string') {
      return { ok: false, error: 'mp3Url + title erwartet' };
    }
    try {
      const id = await downloadMyInstants(mp3Url, title, isStudio().sounds.getDir());
      return { ok: true, id };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  ipcMain.handle(IPC.SOUND_PREVIEW_MYINSTANTS, (_e, mp3Url: unknown) => {
    if (typeof mp3Url !== 'string') return { ok: false, error: 'mp3Url erwartet' };
    isStudio().previewSound(mp3Url);
    return { ok: true };
  });

  // Medien (Bilder/Videos)
  ipcMain.handle(IPC.MEDIA_LIST, () => isStudio().listMedia());
  ipcMain.handle(IPC.MEDIA_IMPORT, async () => {
    if (!mainWindow) return { ok: false, error: 'Kein Fenster' };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Bild oder Video importieren',
      filters: [{ name: 'Medien', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (picked.canceled) return { ok: true, imported: [] };
    const imported = [];
    for (const file of picked.filePaths) {
      const result = isStudio().media.import(file);
      if (result.ok) imported.push({ ...result.entry, url: isStudio().mediaUrl(result.entry.id) });
    }
    return { ok: true, imported };
  });
  ipcMain.handle(IPC.MEDIA_DELETE, (_e, id: unknown) =>
    typeof id === 'string' ? isStudio().media.delete(id) : false,
  );

  // TTS
  ipcMain.handle(IPC.TTS_VOICES, () => isStudio().tts.getVoiceGroups());
  ipcMain.handle(IPC.TTS_PIPER_SETUP, async (_e, voiceId: unknown) => {
    if (typeof voiceId !== 'string') return { ok: false, error: 'voiceId fehlt' };
    try {
      await isStudio().tts.setupPiper(voiceId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });
  ipcMain.handle(IPC.TTS_BYOK_PROVIDERS, () => BYOK_PROVIDERS);
  ipcMain.handle(IPC.TTS_BYOK_STATUS, () => isStudio().ttsCredentialStatus());
  ipcMain.handle(IPC.TTS_BYOK_SET, (_e, provider: unknown, fields: unknown) => {
    if (typeof provider !== 'string' || typeof fields !== 'object' || fields === null) {
      return { ok: false, error: 'provider + fields erwartet' };
    }
    const sane: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
      if (typeof v === 'string') sane[k] = v;
    }
    isStudio().setTtsCredentials(provider, sane);
    return { ok: true };
  });
  ipcMain.handle(IPC.TTS_TEST, (_e, text: unknown, voice: unknown) => {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, error: 'Text fehlt' };
    isStudio().speakTest(text, typeof voice === 'string' ? voice : undefined);
    return { ok: true };
  });

  // Settings
  ipcMain.handle(IPC.SETTINGS_GET, () => {
    // BYOK-Keys NIE an den Renderer — Status reicht (sonst landen Keys in
    // Screenshots/Crash-Dumps). Der Renderer nutzt dafür ttsCredentialStatus().
    // get() liefert eine tiefe Kopie, das delete trifft also nur die Antwort.
    const safe = isStudio().settings.get() as unknown as Record<string, unknown>;
    delete safe.ttsCredentials;
    // Sensible Account-/Sign-Tokens nicht roh ausliefern — nur ein Boolean-Status.
    safe.tiktokLoggedIn =
      typeof safe.tiktokSessionId === 'string' && safe.tiktokSessionId.length > 0 &&
      typeof safe.tiktokTargetIdc === 'string' && safe.tiktokTargetIdc.length > 0;
    safe.tiktokSignKeySet = typeof safe.tiktokSignApiKey === 'string' && safe.tiktokSignApiKey.length > 0;
    delete safe.tiktokSessionId;
    delete safe.tiktokTargetIdc;
    delete safe.tiktokSignApiKey;
    // Weitere Geheimnisse nie roh an den Renderer (Screenshots/Crash-Dumps) —
    // stattdessen nur ein „ist gesetzt"-Flag, damit die UI „gesetzt" anzeigen kann.
    safe.sportKeySet = typeof safe.sportApiKey === 'string' && safe.sportApiKey.length > 0;
    delete safe.sportApiKey;       // football-data.org-Key
    delete safe.controlToken;      // Steuer-/Overlay-Token (Renderer braucht ihn nie)
    safe.spotifyConnected = !!(safe.spotifyTokens && typeof safe.spotifyTokens === 'object');
    delete safe.spotifyTokens;     // OAuth-Tokens nie an den Renderer
    if (safe.obs && typeof safe.obs === 'object') {
      const obs = safe.obs as Record<string, unknown>;
      safe.obsPasswordSet = typeof obs.password === 'string' && (obs.password as string).length > 0;
      delete obs.password;         // OBS-WebSocket-Passwort
    }
    return safe;
  });
  ipcMain.handle(IPC.SETTINGS_UPDATE, (_e, patch: unknown) => {
    if (typeof patch !== 'object' || patch === null) return { ok: false };
    // Nur bekannte, harmlose Felder durchlassen.
    const allowed: Record<string, unknown> = {};
    const p = patch as Record<string, unknown>;
    if (typeof p.soundVolume === 'number') allowed.soundVolume = Math.min(1, Math.max(0, p.soundVolume));
    if (typeof p.lastUsername === 'string') allowed.lastUsername = p.lastUsername;
    // Audio-Ausgabegerät: war NICHT in der Allowlist → wurde nie persistiert
    // (Ausgabe fiel nach jedem Neustart auf „System" zurück). Jetzt gespeichert.
    if (typeof p.audioOutputId === 'string') allowed.audioOutputId = p.audioOutputId.slice(0, 200);
    if (typeof p.audioOutputLabel === 'string') allowed.audioOutputLabel = p.audioOutputLabel.slice(0, 120);
    if (typeof p.points === 'object' && p.points !== null) {
      const pc = p.points as Record<string, unknown>;
      const cur = isStudio().settings.get().points;
      allowed.points = {
        ...cur,
        ...(typeof pc.enabled === 'boolean' ? { enabled: pc.enabled } : {}),
        ...(typeof pc.perChat === 'number' ? { perChat: Math.max(0, pc.perChat) } : {}),
        ...(typeof pc.perFollow === 'number' ? { perFollow: Math.max(0, pc.perFollow) } : {}),
        ...(typeof pc.perLike === 'number' ? { perLike: Math.max(0, pc.perLike) } : {}),
        ...(typeof pc.perCoin === 'number' ? { perCoin: Math.max(0, pc.perCoin) } : {}),
        ...(typeof pc.currencyName === 'string' ? { currencyName: pc.currencyName.slice(0, 24) } : {}),
      };
    }
    if (typeof p.tts === 'object' && p.tts !== null) {
      const t = p.tts as Record<string, unknown>;
      const current = isStudio().settings.get().tts;
      allowed.tts = {
        ...current,
        ...(typeof t.enabled === 'boolean' ? { enabled: t.enabled } : {}),
        ...(typeof t.voice === 'string' ? { voice: t.voice } : {}),
        ...(typeof t.volume === 'number' ? { volume: Math.min(1, Math.max(0, t.volume)) } : {}),
        ...(typeof t.readChat === 'boolean' ? { readChat: t.readChat } : {}),
        ...(t.chatVoiceMode === 'fixed' || t.chatVoiceMode === 'perUser' ? { chatVoiceMode: t.chatVoiceMode } : {}),
        ...(typeof t.skipCommands === 'boolean' ? { skipCommands: t.skipCommands } : {}),
        ...(typeof t.maxTextLen === 'number' ? { maxTextLen: Math.min(500, Math.max(20, t.maxTextLen)) } : {}),
        ...(typeof t.chatTemplate === 'string' ? { chatTemplate: t.chatTemplate } : {}),
        ...(Array.isArray(t.readGroups)
          ? {
              readGroups: (t.readGroups as unknown[]).filter(
                (g): g is 'all' | 'followers' | 'subs' | 'mods' | 'vips' =>
                  typeof g === 'string' && ['all', 'followers', 'subs', 'mods', 'vips'].includes(g),
              ),
            }
          : {}),
        ...(typeof t.readPrefix === 'string' ? { readPrefix: t.readPrefix.slice(0, 3) } : {}),
      };
    }
    if (typeof p.sportApiKey === 'string') allowed.sportApiKey = p.sportApiKey.trim().slice(0, 120);
    if (typeof p.tiktokSignApiKey === 'string') allowed.tiktokSignApiKey = p.tiktokSignApiKey.trim().slice(0, 200);
    if (p.tiktokConnectMode === 'cloud' || p.tiktokConnectMode === 'direct') allowed.tiktokConnectMode = p.tiktokConnectMode;
    if (typeof p.autoLiveWatch === 'boolean') allowed.autoLiveWatch = p.autoLiveWatch;
    if (typeof p.spotifyClientId === 'string') allowed.spotifyClientId = p.spotifyClientId.trim().slice(0, 100);
    if (typeof p.moderation === 'object' && p.moderation !== null) {
      const m = p.moderation as Record<string, unknown>;
      if (Array.isArray(m.blockedWords)) {
        allowed.moderation = {
          blockedWords: m.blockedWords
            .filter((w): w is string => typeof w === 'string')
            .map((w) => w.trim().slice(0, 60))
            .filter(Boolean)
            .slice(0, 200),
        };
      }
    }
    const saved = isStudio().settings.update(allowed);
    // Auto-Live-Watch sofort anwenden (nicht erst beim Neustart).
    if (typeof allowed.autoLiveWatch === 'boolean') isStudio().setAutoLiveWatch(allowed.autoLiveWatch);
    return { ok: true, settings: saved };
  });

  // Replay / Test-Events
  ipcMain.handle(IPC.REPLAY_RECORD_START, () => {
    isStudio().startRecording();
    return { ok: true };
  });
  ipcMain.handle(IPC.REPLAY_RECORD_STOP, async () => {
    const jsonl = isStudio().stopRecording();
    if (!jsonl || !mainWindow) return { ok: true, saved: false };
    const picked = await dialog.showSaveDialog(mainWindow, {
      title: 'Aufnahme speichern',
      defaultPath: `replay-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jsonl`,
      filters: [{ name: 'Replay', extensions: ['jsonl'] }],
    });
    if (picked.canceled || !picked.filePath) return { ok: true, saved: false };
    fs.writeFileSync(picked.filePath, jsonl, 'utf-8');
    return { ok: true, saved: true, path: picked.filePath };
  });
  ipcMain.handle(IPC.REPLAY_PLAY, async (_e, speed: unknown) => {
    if (!mainWindow) return { ok: false, error: 'Kein Fenster' };
    const picked = await dialog.showOpenDialog(mainWindow, {
      title: 'Replay abspielen',
      filters: [{ name: 'Replay', extensions: ['jsonl'] }],
      properties: ['openFile'],
    });
    const file = picked.filePaths[0];
    if (picked.canceled || !file) return { ok: true, played: 0 };
    const jsonl = fs.readFileSync(file, 'utf-8');
    const played = await isStudio().playReplayJsonl(jsonl, typeof speed === 'number' ? speed : 1);
    return { ok: true, played };
  });
  ipcMain.handle(IPC.REPLAY_STOP, () => {
    isStudio().stopReplay();
    return { ok: true };
  });
  ipcMain.handle(IPC.TEST_EVENT, (_e, event: unknown) => {
    const ev = event as StudioEvent;
    if (typeof ev !== 'object' || ev === null || typeof ev.type !== 'string') {
      return { ok: false, error: 'Ungültiges Event' };
    }
    isStudio().injectTestEvent(ev);
    return { ok: true };
  });
}

/** Globale Hotkeys aus den Panel-Buttons (neu) registrieren. */
function registerPanelHotkeys(): void {
  globalShortcut.unregisterAll();
  if (!studio) return;
  for (const btn of studio.getPanelButtons()) {
    if (!btn.accelerator) continue;
    try {
      globalShortcut.register(btn.accelerator, () => studio?.fireManual(btn.action));
    } catch (err) {
      log.warn('Hotkeys', `Accelerator "${btn.accelerator}" ungültig`, (err as Error).message);
    }
  }
}

// ── App-Lifecycle ──────────────────────────────────────────────────────────

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  // Zweitinstanz (Single-Instance-Lock verloren): nichts starten — sonst
  // loggt/bindet ein Geister-Studio kurz mit, bevor quit() greift.
  if (!gotLock) return;
  // Datei-Logging zuerst — damit ALLE Start-Logs/Fehler in die Datei wandern.
  initFileLogging(app.getPath('userData'), formatLocalStamp(new Date()));

  // Media-Permission auto-gewähren: ohne sie maskiert Chromium die Audio-Geräte-
  // IDs (leer/instabil über Neustarts) → die gewählte Ausgabe (setSinkId) „verfällt"
  // und fällt auf System zurück. Mit Permission sind deviceIds + Labels stabil.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  // Restriktive CSP für den Renderer in Production (dev braucht Vite-HMR).
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // Das eingebettete Overlay-iframe wird vom lokalen Server geladen und
      // injiziert seine Config per Inline-<script> + lädt Gift-Bilder vom
      // TikTok-CDN. Dafür braucht es eine eigene, lockere CSP — sonst bleibt
      // die Vorschau im Editor leer (Inline-Script geblockt). Die STRIKTE CSP
      // gilt nur fürs eigentliche App-Shell (Schutz gegen XSS).
      const isLocalOverlay = /^https?:\/\/(127\.0\.0\.1|localhost|localtest\.me)(:\d+)?\//.test(details.url);
      const csp = isLocalOverlay
        ? "default-src 'self' 'unsafe-inline' http: https: ws: wss: data: blob:"
        : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: https: http://127.0.0.1:*; media-src 'self' http://127.0.0.1:*; " +
          "frame-src http://127.0.0.1:*; " +
          "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*";
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp],
        },
      });
    });
  }

  studio = setupStudio();
  registerIpc();
  try {
    await studio.start();
    registerPanelHotkeys();
  } catch (err) {
    log.error('Main', 'Studio-Start fehlgeschlagen', (err as Error).message);
  }

  createMainWindow();
  setupAutoUpdate(); // Hintergrund-Update-Check + Event-Weiterleitung ans UI

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  void studio?.stop();
});

process.on('uncaughtException', (err) => {
  log.error('Main', 'uncaughtException', err.message);
});
process.on('unhandledRejection', (reason) => {
  log.error('Main', 'unhandledRejection', String(reason));
});
