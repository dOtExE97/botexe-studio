// event-bus.ts — In-Process Pub/Sub für normalisierte StudioEvents.
// Adapter publisht → Trigger-Engine-Wiring, Overlay-Server und Renderer-Feed
// subscriben. Übernommen aus botexe-app und auf typisierte Events umgestellt.
import { EventEmitter } from 'node:events';
import type { StudioEvent, StudioEventType } from '@botexe/trigger-engine';
import { log } from './logger';

const ALL = 'event';

export class EventBus {
  private emitter = new EventEmitter();
  /** Letztes Event pro Typ — Replay für Late-Joiner (Overlay verbindet sich neu). */
  private lastValues = new Map<StudioEventType, StudioEvent>();

  constructor() {
    // Wenige, langlebige Subscriber (Wiring, Server, Renderer-Forwarder) —
    // pro WS-Client wird NICHT subscribed (Audit H8-Lehre).
    this.emitter.setMaxListeners(30);
  }

  publish(event: StudioEvent): void {
    this.lastValues.set(event.type, event);
    this.emitter.emit(ALL, event);
    this.emitter.emit(`type:${event.type}`, event);
  }

  subscribe(type: StudioEventType, cb: (e: StudioEvent) => void): () => void {
    const safe = wrapSafe(cb);
    this.emitter.on(`type:${type}`, safe);
    return () => this.emitter.off(`type:${type}`, safe);
  }

  subscribeAll(cb: (e: StudioEvent) => void): () => void {
    const safe = wrapSafe(cb);
    this.emitter.on(ALL, safe);
    return () => this.emitter.off(ALL, safe);
  }

  getLastValue(type: StudioEventType): StudioEvent | undefined {
    return this.lastValues.get(type);
  }

  /** Sticky-Werte verwerfen (Session-Reset) — Late-Joiner starten leer. */
  clearLastValues(): void {
    this.lastValues.clear();
  }

  getAllLastValues(): StudioEvent[] {
    return Array.from(this.lastValues.values());
  }

  /** Diagnose: Anzahl aktiver Listener (Leak-Erkennung in Tests, Audit H8). */
  listenerCount(): number {
    return this.emitter.eventNames().reduce((sum, name) => sum + this.emitter.listenerCount(name), 0);
  }
}

// Ein werfender Subscriber darf weder publish() noch die übrigen Subscriber
// mitreißen (sonst killt ein Widget-Bug den ganzen Event-Fluss im Stream).
function wrapSafe(cb: (e: StudioEvent) => void): (e: StudioEvent) => void {
  return (e) => {
    try {
      cb(e);
    } catch (err) {
      log.error('Bus', `Subscriber-Fehler bei ${e.type}`, (err as Error).message);
    }
  };
}

export const eventBus = new EventBus();
