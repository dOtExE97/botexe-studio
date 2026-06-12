import { app, BrowserWindow, dialog, globalShortcut, ipcMain, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';
import type { StudioEvent, TriggerRule, Redemption, PanelButton } from '@botexe/trigger-engine';
import { IPC } from './shared/constants';
import { Studio } from './main/services/studio';
import { searchMyInstants, downloadMyInstants } from './main/services/myinstants';
import { BYOK_PROVIDERS } from './main/services/tts-byok';
import { log, initFileLogging, getLogDir } from './main/core/logger';
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

// Nur eine Instanz — zweiter Start fokussiert das bestehende Fenster.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Auto-Update über GitHub Releases — wird scharf, sobald das Repo existiert.
const UPDATE_REPO = ''; // TODO nach Remote-Anlage: 'dOtExE97/botexe-studio'
if (app.isPackaged && UPDATE_REPO) {
  try {
    updateElectronApp({
      updateSource: { type: UpdateSourceType.ElectronPublicUpdateService, repo: UPDATE_REPO },
      updateInterval: '1 hour',
    });
  } catch (err) {
    log.warn('Update', 'Auto-Update nicht verfügbar', (err as Error).message);
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

function setupStudio(): Studio {
  const paths = Studio.resolvePaths(
    app.getAppPath(),
    process.resourcesPath,
    app.isPackaged,
    app.getPath('userData'),
  );
  return new Studio(paths, {
    onSoundPlay: (cmd) => sendToRenderer(IPC.SOUND_PLAY, cmd),
    onStatus: (info) => sendToRenderer(IPC.PLATFORM_STATUS, info),
    onBusEvent: (e) => sendToRenderer(IPC.BUS_EVENT, e),
    onStats: (stats) => sendToRenderer(IPC.STATS_UPDATE, stats),
    onToast: (toast) => sendToRenderer(IPC.TOAST_SHOW, toast),
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
  }));
  ipcMain.handle(IPC.APP_OPEN_DATA_DIR, () => {
    void shell.openPath(app.getPath('userData'));
    return { ok: true };
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

  // Einlöse-Store
  ipcMain.handle(IPC.REDEMPTIONS_GET, () => isStudio().getRedemptions());
  ipcMain.handle(IPC.REDEMPTIONS_SET, (_e, reds: unknown) => {
    if (!Array.isArray(reds)) return { ok: false, error: 'redemptions muss ein Array sein' };
    isStudio().setRedemptions(reds as Redemption[]);
    return { ok: true };
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
    return safe;
  });
  ipcMain.handle(IPC.SETTINGS_UPDATE, (_e, patch: unknown) => {
    if (typeof patch !== 'object' || patch === null) return { ok: false };
    // Nur bekannte, harmlose Felder durchlassen.
    const allowed: Record<string, unknown> = {};
    const p = patch as Record<string, unknown>;
    if (typeof p.soundVolume === 'number') allowed.soundVolume = Math.min(1, Math.max(0, p.soundVolume));
    if (typeof p.lastUsername === 'string') allowed.lastUsername = p.lastUsername;
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
        ...(['all', 'followers', 'subs', 'mods', 'vips'].includes(t.readWho as string)
          ? { readWho: t.readWho as 'all' | 'followers' | 'subs' | 'mods' | 'vips' }
          : {}),
        ...(typeof t.readPrefix === 'string' ? { readPrefix: t.readPrefix.slice(0, 3) } : {}),
      };
    }
    return { ok: true, settings: isStudio().settings.update(allowed) };
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
  initFileLogging(app.getPath('userData'), new Date().toISOString());

  // Restriktive CSP für den Renderer in Production (dev braucht Vite-HMR).
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: https: http://127.0.0.1:*; media-src 'self' http://127.0.0.1:*; " +
              "frame-src http://127.0.0.1:*; " +
              "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:*",
          ],
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
