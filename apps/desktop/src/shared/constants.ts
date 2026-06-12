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
  // Punkte-Einlöse-Store
  REDEMPTIONS_GET: 'redemptions:get',
  REDEMPTIONS_SET: 'redemptions:set',
  // Sounds (lokale Wiedergabe passiert im Renderer — Main schickt Play-Befehle)
  SOUND_PLAY: 'sound:play',
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
  POINTS_RESET: 'points:reset',
  VIEWERS_LIST: 'viewers:list',
  VIEWER_FLAG: 'viewers:flag',
  VIEWER_GRANT: 'viewers:grant',
  VIEWER_VOICE: 'viewers:voice',
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
