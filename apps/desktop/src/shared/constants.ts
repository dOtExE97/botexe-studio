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
  // Overlay
  OVERLAY_GET_INFO: 'overlay:get-info',
  // Sound (lokale Wiedergabe passiert im Renderer — Main schickt Play-Befehle)
  SOUND_PLAY: 'sound:play',
} as const;
