import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './shared/constants';

// Schmale, explizit benannte API-Oberfläche — KEIN generisches invoke()
// (Audit H2 der Alt-App: generischer Kanal = voller Main-Zugriff bei Renderer-XSS).

function listen<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.off(channel, listener);
    };
  };
}

const api = {
  // Plattform
  platformConnect: (username: string) => ipcRenderer.invoke(IPC.PLATFORM_CONNECT, username),
  platformDisconnect: () => ipcRenderer.invoke(IPC.PLATFORM_DISCONNECT),

  // Overlay
  getOverlayInfo: () => ipcRenderer.invoke(IPC.OVERLAY_GET_INFO),

  // Layouts
  listLayouts: () => ipcRenderer.invoke(IPC.LAYOUT_LIST),
  getLayout: (id: string) => ipcRenderer.invoke(IPC.LAYOUT_GET, id),
  saveLayout: (layout: unknown) => ipcRenderer.invoke(IPC.LAYOUT_SAVE, layout),
  deleteLayout: (id: string) => ipcRenderer.invoke(IPC.LAYOUT_DELETE, id),
  setActiveLayout: (id: string | null) => ipcRenderer.invoke(IPC.LAYOUT_SET_ACTIVE, id),
  getProfileLink: (id: string) => ipcRenderer.invoke(IPC.LAYOUT_PROFILE_LINK, id),

  // Trigger-Regeln
  getRules: () => ipcRenderer.invoke(IPC.RULES_GET),
  setRules: (rules: unknown[]) => ipcRenderer.invoke(IPC.RULES_SET, rules),
  // Geschenke-Galerie
  getGiftCatalog: () => ipcRenderer.invoke(IPC.GIFT_CATALOG_GET),
  setGiftMeta: (slug: string, patch: { favorite?: boolean; customName?: string }) => ipcRenderer.invoke(IPC.GIFT_META_SET, slug, patch),
  // Stats-Zeitraum (Woche/Monat/Jahr)
  getStatsHistory: (range: 'week' | 'month' | 'year') => ipcRenderer.invoke(IPC.STATS_HISTORY_GET, range),
  exportStatsCsv: () => ipcRenderer.invoke(IPC.STATS_CSV_EXPORT),
  getRedemptions: () => ipcRenderer.invoke(IPC.REDEMPTIONS_GET),
  setRedemptions: (reds: unknown[]) => ipcRenderer.invoke(IPC.REDEMPTIONS_SET, reds),
  getCommands: () => ipcRenderer.invoke(IPC.COMMANDS_GET),
  setCommands: (cmds: unknown[]) => ipcRenderer.invoke(IPC.COMMANDS_SET, cmds),
  giveawayState: () => ipcRenderer.invoke(IPC.GIVEAWAY_STATE),
  giveawayConfig: (patch: unknown) => ipcRenderer.invoke(IPC.GIVEAWAY_CONFIG, patch),
  giveawayDraw: () => ipcRenderer.invoke(IPC.GIVEAWAY_DRAW),
  giveawayReset: () => ipcRenderer.invoke(IPC.GIVEAWAY_RESET),
  getGreet: () => ipcRenderer.invoke(IPC.GREET_GET),
  setGreet: (patch: unknown) => ipcRenderer.invoke(IPC.GREET_SET, patch),
  getPanelButtons: () => ipcRenderer.invoke(IPC.PANEL_GET),
  setPanelButtons: (buttons: unknown[]) => ipcRenderer.invoke(IPC.PANEL_SET, buttons),
  firePanel: (action: unknown) => ipcRenderer.invoke(IPC.PANEL_FIRE, action),

  // Sounds
  listSounds: () => ipcRenderer.invoke(IPC.SOUND_LIST),
  importSounds: () => ipcRenderer.invoke(IPC.SOUND_IMPORT),
  deleteSound: (id: string) => ipcRenderer.invoke(IPC.SOUND_DELETE, id),
  testSound: (id: string) => ipcRenderer.invoke(IPC.SOUND_TEST, id),
  searchMyInstants: (query: string) => ipcRenderer.invoke(IPC.SOUND_SEARCH_MYINSTANTS, query),
  importMyInstants: (mp3Url: string, title: string) =>
    ipcRenderer.invoke(IPC.SOUND_IMPORT_MYINSTANTS, mp3Url, title),

  // Medien (Bilder/Videos)
  listMedia: () => ipcRenderer.invoke(IPC.MEDIA_LIST),
  importMedia: () => ipcRenderer.invoke(IPC.MEDIA_IMPORT),
  deleteMedia: (id: string) => ipcRenderer.invoke(IPC.MEDIA_DELETE, id),

  // TTS
  getTtsVoices: () => ipcRenderer.invoke(IPC.TTS_VOICES),
  testTts: (text: string, voice?: string) => ipcRenderer.invoke(IPC.TTS_TEST, text, voice),
  setupPiper: (voiceId: string) => ipcRenderer.invoke(IPC.TTS_PIPER_SETUP, voiceId),
  getByokProviders: () => ipcRenderer.invoke(IPC.TTS_BYOK_PROVIDERS),
  getByokStatus: () => ipcRenderer.invoke(IPC.TTS_BYOK_STATUS),
  setByokCredentials: (provider: string, fields: Record<string, string>) =>
    ipcRenderer.invoke(IPC.TTS_BYOK_SET, provider, fields),

  // App-Info
  getAppInfo: () => ipcRenderer.invoke(IPC.APP_INFO),
  openDataDir: () => ipcRenderer.invoke(IPC.APP_OPEN_DATA_DIR),
  openExternal: (url: string) => ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),
  // Konfig-Backup
  exportConfig: () => ipcRenderer.invoke(IPC.CONFIG_EXPORT),
  importConfig: () => ipcRenderer.invoke(IPC.CONFIG_IMPORT),
  // Auto-Update
  checkForUpdate: () => ipcRenderer.invoke(IPC.UPDATE_CHECK),
  installUpdate: () => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  onUpdateStatus: listen<{ state: string; version?: string; message?: string }>(IPC.UPDATE_STATUS),
  // OBS-Studio
  setObsConfig: (cfg: { enabled: boolean; url: string; password: string }) => ipcRenderer.invoke(IPC.OBS_SET_CONFIG, cfg),
  getObsScenes: () => ipcRenderer.invoke(IPC.OBS_GET_SCENES),
  onObsStatus: listen<string>(IPC.OBS_STATUS),
  // TikTok-Login + Chat senden
  tiktokLogin: () => ipcRenderer.invoke(IPC.TIKTOK_LOGIN),
  tiktokLogout: () => ipcRenderer.invoke(IPC.TIKTOK_LOGOUT),
  sendChat: (text: string) => ipcRenderer.invoke(IPC.CHAT_SEND, text),
  // Streamer.bot
  setStreamerbotConfig: (cfg: { enabled: boolean; url: string }) => ipcRenderer.invoke(IPC.SB_SET_CONFIG, cfg),
  getStreamerbotActions: () => ipcRenderer.invoke(IPC.SB_GET_ACTIONS),
  onStreamerbotStatus: listen<string>(IPC.SB_STATUS),
  openLogs: () => ipcRenderer.invoke(IPC.LOGS_OPEN),
  resetSession: () => ipcRenderer.invoke(IPC.SESSION_RESET),
  getTtlsLink: (layoutId?: string) => ipcRenderer.invoke(IPC.TTLS_LINK_GET, layoutId),
  setupTtls: () => ipcRenderer.invoke(IPC.TTLS_SETUP),
  logRenderer: (level: 'info' | 'warn' | 'error', scope: string, message: string) =>
    ipcRenderer.send(IPC.LOG_RENDERER, level, scope, message),
  resetPoints: () => ipcRenderer.invoke(IPC.POINTS_RESET),
  listViewers: (query: string) => ipcRenderer.invoke(IPC.VIEWERS_LIST, query),
  setViewerFlag: (userId: string, flag: string, value: boolean) => ipcRenderer.invoke(IPC.VIEWER_FLAG, userId, flag, value),
  grantPoints: (userId: string, delta: number) => ipcRenderer.invoke(IPC.VIEWER_GRANT, userId, delta),
  setViewerVoice: (userId: string, voice: string) => ipcRenderer.invoke(IPC.VIEWER_VOICE, userId, voice),
  setViewerWelcomeMedia: (userId: string, mediaId: string) => ipcRenderer.invoke(IPC.VIEWER_WELCOME_MEDIA, userId, mediaId),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  updateSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke(IPC.SETTINGS_UPDATE, patch),

  // Replay / Test
  replayRecordStart: () => ipcRenderer.invoke(IPC.REPLAY_RECORD_START),
  replayRecordStop: () => ipcRenderer.invoke(IPC.REPLAY_RECORD_STOP),
  replayPlay: (speed: number) => ipcRenderer.invoke(IPC.REPLAY_PLAY, speed),
  replayStop: () => ipcRenderer.invoke(IPC.REPLAY_STOP),
  sendTestEvent: (event: Record<string, unknown>) => ipcRenderer.invoke(IPC.TEST_EVENT, event),

  // Events Main → Renderer
  onPlatformStatus: listen<{ status: string; isReconnect: boolean; attempt?: number }>(IPC.PLATFORM_STATUS),
  onBusEvent: listen<Record<string, unknown>>(IPC.BUS_EVENT),
  onStats: listen<Record<string, unknown>>(IPC.STATS_UPDATE),
  onSoundPlay: listen<{ soundId: string; url: string; volume: number }>(IPC.SOUND_PLAY),
  /** Renderer meldet, dass ein Audio fertig ist (fürs TTS-Sequencing). */
  reportSoundEnded: (soundId: string) => ipcRenderer.send(IPC.SOUND_ENDED, soundId),
  onToast: listen<{ type: 'error' | 'warn' | 'info'; message: string }>(IPC.TOAST_SHOW),
  /** Live-Protokoll: ein Trigger hat gefeuert (Live-Seite). */
  onTriggerLog: listen<{ id: string; at: number; rule: string; action: string; reason: string }>(IPC.TRIGGER_LOG),
};

export type StudioApi = typeof api;

contextBridge.exposeInMainWorld('studio', api);
