import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from './shared/constants';

// Schmale, explizit benannte API-Oberfläche — KEIN generisches invoke()
// (Audit H2 der Alt-App: generischer Kanal = voller Main-Zugriff bei Renderer-XSS).
const api = {
  platformConnect: (username: string) => ipcRenderer.invoke(IPC.PLATFORM_CONNECT, username),
  platformDisconnect: () => ipcRenderer.invoke(IPC.PLATFORM_DISCONNECT),
  getOverlayInfo: () => ipcRenderer.invoke(IPC.OVERLAY_GET_INFO),

  onPlatformStatus: (cb: (status: string) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, status: string) => cb(status);
    ipcRenderer.on(IPC.PLATFORM_STATUS, listener);
    return () => ipcRenderer.off(IPC.PLATFORM_STATUS, listener);
  },
  onBusEvent: (cb: (event: unknown) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, event: unknown) => cb(event);
    ipcRenderer.on(IPC.BUS_EVENT, listener);
    return () => ipcRenderer.off(IPC.BUS_EVENT, listener);
  },
  onSoundPlay: (cb: (cmd: unknown) => void) => {
    const listener = (_e: Electron.IpcRendererEvent, cmd: unknown) => cb(cmd);
    ipcRenderer.on(IPC.SOUND_PLAY, listener);
    return () => ipcRenderer.off(IPC.SOUND_PLAY, listener);
  },
};

export type StudioApi = typeof api;

contextBridge.exposeInMainWorld('studio', api);
