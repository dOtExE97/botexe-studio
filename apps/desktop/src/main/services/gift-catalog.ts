// gift-catalog.ts — die App merkt sich jedes je gesehene TikTok-Gift
// (Name, Bild-URL, Coins, Häufigkeit) dauerhaft über alle Streams.
// Nutzer: Bingo-Gift-Zellen (echte Bilder!), später Geschenke-Galerie +
// visueller Gift-Picker für Trigger.
import fs from 'node:fs';
import path from 'node:path';
import { log } from '../core/logger';

const SCHEMA_VERSION = 1;

export interface GiftEntry {
  slug: string;
  icon?: string;
  coins: number;
  count: number;
  lastSeen?: number;
  /** Wer dieses Gift als ALLERERSTER wirklich geschickt hat — verewigt. */
  firstSender?: { id: string; nickname: string };
  firstSenderAt?: number;
  /** War in der Gift-Liste des zuletzt verbundenen Live-Streams. */
  inLastRoom?: boolean;
}

interface Serialized {
  schemaVersion: number;
  gifts: GiftEntry[];
}

export class GiftCatalog {
  private readonly file: string;
  private gifts = new Map<string, GiftEntry>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(userDataDir: string) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.file = path.join(userDataDir, 'gift-catalog.json');
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.file)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<Serialized>;
      if (data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.gifts)) return;
      for (const g of data.gifts) {
        if (g && typeof g.slug === 'string') this.gifts.set(g.slug.toLowerCase(), { ...g });
      }
    } catch (err) {
      log.warn('GiftCatalog', 'gift-catalog.json nicht lesbar — leer gestartet', (err as Error).message);
    }
  }

  record(gift: {
    slug: string;
    icon?: string;
    coinsPerUnit?: number;
    count?: number;
    sender?: { id: string; nickname: string };
    at?: number;
  }): void {
    const key = gift.slug.trim().toLowerCase();
    if (!key) return;
    const inc = gift.count ?? 1;
    const entry = this.gifts.get(key) ?? { slug: gift.slug, coins: gift.coinsPerUnit ?? 0, count: 0 };
    entry.count += inc;
    entry.lastSeen = gift.at ?? Date.now();
    if (gift.icon) entry.icon = gift.icon; // neueste CDN-URL gewinnt
    if (gift.coinsPerUnit) entry.coins = gift.coinsPerUnit;
    // Erstsender nur bei einem ECHTEN Empfang (count>0, mit Sender) verewigen.
    if (inc > 0 && gift.sender && !entry.firstSender) {
      entry.firstSender = { id: gift.sender.id, nickname: gift.sender.nickname };
      entry.firstSenderAt = gift.at ?? Date.now();
    }
    this.gifts.set(key, entry);
    this.scheduleSave();
  }

  /** Markiert die Gift-Liste des aktuellen Live-Streams (für die „Letztes Live"-Ansicht). */
  markLastRoom(slugs: string[]): void {
    const want = new Set(slugs.map((s) => s.trim().toLowerCase()).filter(Boolean));
    for (const [key, entry] of this.gifts) entry.inLastRoom = want.has(key);
    this.scheduleSave();
  }

  /** slug(lowercase) → Eintrag — fürs Overlay (/gift-catalog) und die Galerie. */
  all(): Record<string, GiftEntry> {
    const out: Record<string, GiftEntry> = {};
    for (const [k, v] of this.gifts) out[k] = { ...v };
    return out;
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.save();
    }, 3000);
  }

  save(): void {
    const data: Serialized = { schemaVersion: SCHEMA_VERSION, gifts: Array.from(this.gifts.values()) };
    const tmp = `${this.file}.tmp`;
    try {
      fs.writeFileSync(tmp, JSON.stringify(data), 'utf-8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      log.error('GiftCatalog', 'Speichern fehlgeschlagen', (err as Error).message);
    }
  }
}
