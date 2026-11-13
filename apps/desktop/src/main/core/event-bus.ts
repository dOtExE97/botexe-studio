// event-bus.ts — In-Process Pub/Sub für normalisierte StudioEvents.
// Adapter publisht → Trigger-Engine-Wiring, Overlay-Server und Renderer-Feed
// subscriben. Übernommen aus botexe-app und auf typisierte Events umgestellt.
import { EventEmitter } from 'node:events';
import type { StudioEvent, StudioEventType } from '@botexe/trigger-engine';
import { log } from './logger';

const ALL = 'event';

export class EventBus {
  private emitter = new EventEmitter();
  /** Letztes Event pro Typ UND Plattform — Replay für Late-Joiner (Overlay
   *  verbindet sich neu). Außen je Typ (Reihenfolge der Typen wie bisher),
   *  innen je Plattform ('' = ohne Plattform), dort jüngster Wert zuletzt.
   *  Sonst überschriebe ein Twitch-Chat den TikTok-Wert, und ein TikTok-
   *  Overlay bekäme nach dem Neuladen gar keinen Chat-Stand mehr. */
  private lastValues = new Map<StudioEventType, Map<string, StudioEvent>>();

  constructor() {
    // Wenige, langlebige Subscriber (Wiring, Server, Renderer-Forwarder) —
    // pro WS-Client wird NICHT subscribed (Audit H8-Lehre).
    this.emitter.setMaxListeners(30);
  }

  /** Vorfilter: liefert false → das Ereignis wird verworfen, KEIN Abonnent
   *  (auch nicht der Overlay-Server) sieht es. Nötig fürs Dedup, weil der
   *  Overlay-Server unabhängig von Studio direkt am Bus hängt. */
  private vorfilter: ((e: StudioEvent) => boolean) | null = null;

  setVorfilter(fn: ((e: StudioEvent) => boolean) | null): void {
    this.vorfilter = fn;
  }

  publish(event: StudioEvent): void {
    if (this.vorfilter && !this.vorfilter(event)) return;
    this.merkeLetztenWert(event);
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

  private merkeLetztenWert(event: StudioEvent): void {
    let jePlattform = this.lastValues.get(event.type);
    if (!jePlattform) {
      jePlattform = new Map();
      this.lastValues.set(event.type, jePlattform);
    }
    if (event.plattform === undefined) {
      // Gilt für alle Overlays → ist für jedes Overlay der jüngste Stand
      // dieser Art; ältere Plattform-Werte wären nur noch Rauschen. Ohne
      // Plattform-Ereignisse bleibt damit alles wie vorher: ein Wert je Art.
      jePlattform.clear();
      jePlattform.set('', event);
      return;
    }
    // Löschen + neu setzen: der jüngste Wert steht zuletzt, damit die
    // Nachlieferung die Reihenfolge der Ereignisse einhält.
    jePlattform.delete(event.plattform);
    jePlattform.set(event.plattform, event);
  }

  /** Jüngstes Event dieses Typs über alle Plattformen. */
  getLastValue(type: StudioEventType): StudioEvent | undefined {
    const jePlattform = this.lastValues.get(type);
    if (!jePlattform) return undefined;
    let letzter: StudioEvent | undefined;
    for (const e of jePlattform.values()) letzter = e;
    return letzter;
  }

  /** Sticky-Werte verwerfen (Session-Reset) — Late-Joiner starten leer. */
  clearLastValues(): void {
    this.lastValues.clear();
  }

  /** Alle Sticky-Werte (je Typ und Plattform). Der Overlay-Server filtert
   *  sie je Browser-Quelle nach deren Plattform. */
  getAllLastValues(): StudioEvent[] {
    const out: StudioEvent[] = [];
    for (const jePlattform of this.lastValues.values()) out.push(...jePlattform.values());
    return out;
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
