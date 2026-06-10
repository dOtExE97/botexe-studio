// replay.ts — Events aufnehmen (JSONL) und wieder abspielen: Trigger und
// Overlays testen ohne Live-Stream. Pure Logik — Datei-IO macht der Service.
import type { StudioEvent } from '@botexe/trigger-engine';

export interface ReplayEntry {
  /** Abstand zum ersten aufgenommenen Event in ms. */
  offsetMs: number;
  event: StudioEvent;
}

export class EventRecorder {
  private entries: ReplayEntry[] = [];
  private startTs: number | null = null;

  record(event: StudioEvent): void {
    if (this.startTs === null) this.startTs = event.ts;
    this.entries.push({ offsetMs: event.ts - this.startTs, event });
  }

  get count(): number {
    return this.entries.length;
  }

  toJsonl(): string {
    return this.entries.map((e) => JSON.stringify(e)).join('\n');
  }
}

/** Parst JSONL tolerant: kaputte Zeilen werden übersprungen, nicht alles verworfen. */
export function parseReplay(jsonl: string): ReplayEntry[] {
  const entries: ReplayEntry[] = [];
  for (const line of jsonl.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<ReplayEntry>;
      if (
        typeof parsed.offsetMs === 'number' &&
        parsed.event !== undefined &&
        typeof parsed.event === 'object' &&
        typeof (parsed.event as StudioEvent).type === 'string' &&
        typeof (parsed.event as StudioEvent).ts === 'number'
      ) {
        entries.push(parsed as ReplayEntry);
      }
    } catch {
      // kaputte Zeile — überspringen
    }
  }
  return entries;
}

export interface PlayOptions {
  /** Zeitfaktor: 1 = Echtzeit, 2 = doppelt so schnell, 0 = alles sofort. */
  speed?: number;
  signal?: AbortSignal;
}

/**
 * Spielt Entries ab und publisht sie (Original-ts bleibt erhalten — Cooldowns
 * der Trigger-Engine rechnen mit event.ts und sind damit deterministisch).
 * Liefert die Anzahl publizierter Events.
 */
export async function playReplay(
  entries: ReplayEntry[],
  publish: (e: StudioEvent) => void,
  options: PlayOptions = {},
): Promise<number> {
  const speed = options.speed ?? 1;
  let played = 0;
  let lastOffset = 0;

  for (const entry of entries) {
    if (options.signal?.aborted) break;
    const waitMs = speed > 0 ? (entry.offsetMs - lastOffset) / speed : 0;
    if (waitMs > 0) {
      const aborted = await sleepAbortable(waitMs, options.signal);
      if (aborted) break;
    }
    lastOffset = entry.offsetMs;
    publish(entry.event);
    played++;
  }
  return played;
}

/** true = abgebrochen, false = Zeit normal abgelaufen. */
function sleepAbortable(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(true);
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(false);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(true);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
