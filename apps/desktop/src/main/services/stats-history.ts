// stats-history.ts — persistente Historie beendeter Stream-Sessions für die
// Zeitraum-Ansichten (Woche/Monat/Jahr). Pro Session ein Eintrag mit Totals +
// Zeitstempel; die Abfrage summiert alle Einträge im gewählten Fenster.
import fs from 'node:fs';
import path from 'node:path';
import { log } from '../core/logger';
import type { StatsTotals } from '../core/session-stats';

const SCHEMA_VERSION = 1;
const MAX_ENTRIES = 2000; // ~5 Jahre täglicher Streams — harte Obergrenze

export type StatsRange = 'week' | 'month' | 'year';
const RANGE_DAYS: Record<StatsRange, number> = { week: 7, month: 30, year: 365 };

export interface StatsHistoryEntry extends StatsTotals {
  at: number; // Zeitpunkt des Session-Endes (ms)
}

export interface StatsSummary extends StatsTotals {
  sessions: number;
}

interface Serialized {
  schemaVersion: number;
  entries: StatsHistoryEntry[];
}

function emptySummary(): StatsSummary {
  return { coins: 0, gifts: 0, follows: 0, likes: 0, shares: 0, chats: 0, viewers: 0, peakViewers: 0, sessions: 0 };
}

export class StatsHistory {
  private readonly file: string;
  private entries: StatsHistoryEntry[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(userDataDir: string) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.file = path.join(userDataDir, 'stats-history.json');
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.file)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<Serialized>;
      if (data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.entries)) return;
      this.entries = data.entries.filter((e) => e && typeof e.at === 'number');
    } catch (err) {
      log.warn('StatsHistory', 'stats-history.json nicht lesbar — leer gestartet', (err as Error).message);
    }
  }

  /** Eine beendete Session ablegen (nur wenn überhaupt Aktivität war). */
  record(totals: StatsTotals, at: number): void {
    const active = totals.coins + totals.gifts + totals.likes + totals.chats + totals.follows + totals.shares;
    if (active <= 0) return;
    this.entries.push({ ...totals, at });
    if (this.entries.length > MAX_ENTRIES) this.entries = this.entries.slice(-MAX_ENTRIES);
    this.scheduleSave();
  }

  /** Summe aller Sessions im Zeitraum bis `now`. */
  summary(range: StatsRange, now: number): StatsSummary {
    const cutoff = now - RANGE_DAYS[range] * 86_400_000;
    const out = emptySummary();
    for (const e of this.entries) {
      if (e.at < cutoff || e.at > now) continue;
      out.coins += e.coins;
      out.gifts += e.gifts;
      out.follows += e.follows;
      out.likes += e.likes;
      out.shares += e.shares;
      out.chats += e.chats;
      out.peakViewers = Math.max(out.peakViewers, e.peakViewers);
      out.sessions += 1;
    }
    return out;
  }

  /** Alle Einträge (chronologisch) — für CSV-Export. */
  all(): StatsHistoryEntry[] {
    return [...this.entries].sort((a, b) => a.at - b.at);
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 3000);
  }

  save(): void {
    const data: Serialized = { schemaVersion: SCHEMA_VERSION, entries: this.entries };
    const tmp = `${this.file}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      log.error('StatsHistory', 'Speichern fehlgeschlagen', (err as Error).message);
    }
  }
}
