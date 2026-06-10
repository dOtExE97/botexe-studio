import type { StudioApi } from '../preload';

declare global {
  interface Window {
    studio: StudioApi;
  }
}

export {};
