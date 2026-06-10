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

  // Trigger-Regeln
  getRules: () => ipcRenderer.invoke(IPC.RULES_GET),
  setRules: (rules: unknown[]) => ipcRenderer.invoke(IPC.RULES_SET, rules),

  // Sounds
  listSounds: () => ipcRenderer.invoke(IPC.SOUND_LIST),
  importSounds: () => ipcRenderer.invoke(IPC.SOUND_IMPORT),
  deleteSound: (id: string) => ipcRenderer.invoke(IPC.SOUND_DELETE, id),
  testSound: (id: string) => ipcRenderer.invoke(IPC.SOUND_TEST, id),

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
};

export type StudioApi = typeof api;

contextBridge.exposeInMainWorld('studio', api);
