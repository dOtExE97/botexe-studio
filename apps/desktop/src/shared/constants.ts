export const OVERLAY_HOST = '127.0.0.1';
export const OVERLAY_PORT = 27415;

export const APP_NAME = 'bOtExE Studio';

/** IPC-Kanäle Main ↔ Renderer. Nur benannte Kanäle — kein generisches invoke(). */
export const IPC = {
  // Plattform-Verbindung
  PLATFORM_CONNECT: 'platform:connect',
  PLATFORM_DISCONNECT: 'platform:disconnect',
  PLATFORM_STATUS: 'platform:status',
  // Event-Bus → Renderer (Live-Feed in der App-Shell)
  BUS_EVENT: 'bus:event',
  STATS_UPDATE: 'stats:update',
  STATS_HISTORY_GET: 'stats:history-get',
  STATS_CSV_EXPORT: 'stats:csv-export',
  // Overlay
  OVERLAY_GET_INFO: 'overlay:get-info',
  // Layouts
  LAYOUT_LIST: 'layout:list',
  LAYOUT_GET: 'layout:get',
  LAYOUT_SAVE: 'layout:save',
  LAYOUT_DELETE: 'layout:delete',
  LAYOUT_SET_ACTIVE: 'layout:set-active',
  LAYOUT_PROFILE_LINK: 'layout:profile-link',
  // Trigger-Regeln
  RULES_GET: 'rules:get',
  RULES_SET: 'rules:set',
  // Geschenke-Galerie (kompletter Gift-Katalog mit Bildern)
  GIFT_CATALOG_GET: 'gift-catalog:get',
  // Punkte-Einlöse-Store
  REDEMPTIONS_GET: 'redemptions:get',
  REDEMPTIONS_SET: 'redemptions:set',
  // Chat-Befehle (Bot)
  COMMANDS_GET: 'commands:get',
  COMMANDS_SET: 'commands:set',
  // Manuelles Auslöse-Panel + Hotkeys
  PANEL_GET: 'panel:get',
  PANEL_SET: 'panel:set',
  PANEL_FIRE: 'panel:fire',
  // Sounds (lokale Wiedergabe passiert im Renderer — Main schickt Play-Befehle)
  SOUND_PLAY: 'sound:play',
  SOUND_ENDED: 'sound:ended',
  SOUND_LIST: 'sound:list',
  SOUND_IMPORT: 'sound:import',
  SOUND_DELETE: 'sound:delete',
  SOUND_TEST: 'sound:test',
  SOUND_SEARCH_MYINSTANTS: 'sound:search-myinstants',
  SOUND_IMPORT_MYINSTANTS: 'sound:import-myinstants',
  // Medien (eigene Bilder/Videos fürs Overlay)
  MEDIA_LIST: 'media:list',
  MEDIA_IMPORT: 'media:import',
  MEDIA_DELETE: 'media:delete',
  // TTS
  TTS_VOICES: 'tts:voices',
  TTS_TEST: 'tts:test',
  TTS_PIPER_SETUP: 'tts:piper-setup',
  TTS_BYOK_PROVIDERS: 'tts:byok-providers',
  TTS_BYOK_STATUS: 'tts:byok-status',
  TTS_BYOK_SET: 'tts:byok-set',
  // App-Info / Einstellungen
  APP_INFO: 'app:info',
  APP_OPEN_DATA_DIR: 'app:open-data-dir',
  CONFIG_EXPORT: 'config:export',
  CONFIG_IMPORT: 'config:import',
  // OBS-Studio-Steuerung
  OBS_SET_CONFIG: 'obs:set-config',
  OBS_GET_SCENES: 'obs:get-scenes',
  OBS_STATUS: 'obs:status',
  // TikTok-Login (Chat-Senden) + Chat senden
  TIKTOK_LOGIN: 'tiktok:login',
  TIKTOK_LOGOUT: 'tiktok:logout',
  CHAT_SEND: 'chat:send',
  // Streamer.bot-Brücke
  SB_SET_CONFIG: 'sb:set-config',
  SB_GET_ACTIONS: 'sb:get-actions',
  SB_STATUS: 'sb:status',
  // Auto-Update (GitHub Releases, Squirrel-Delta)
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status',
  // TikTok-Live-Studio-Link (Domain-Form + hosts-Setup)
  TTLS_LINK_GET: 'ttls:link-get',
  TTLS_SETUP: 'ttls:setup',
  // Logs / Diagnose
  LOGS_OPEN: 'logs:open',
  LOG_RENDERER: 'log:renderer',
  // Nutzer-Toasts (Fehler/Hinweise)
  TOAST_SHOW: 'toast:show',
  POINTS_RESET: 'points:reset',
  SESSION_RESET: 'session:reset',
  VIEWERS_LIST: 'viewers:list',
  VIEWER_FLAG: 'viewers:flag',
  VIEWER_GRANT: 'viewers:grant',
  VIEWER_VOICE: 'viewers:voice',
  VIEWER_WELCOME_MEDIA: 'viewers:welcome-media',
  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  // Replay / Test-Events
  REPLAY_RECORD_START: 'replay:record-start',
  REPLAY_RECORD_STOP: 'replay:record-stop',
  REPLAY_PLAY: 'replay:play',
  REPLAY_STOP: 'replay:stop',
  TEST_EVENT: 'test:event',
} as const;
