// sticker-catalog.ts — merkt sich die Sticker, die im Stream durchgekommen sind.
//
// WARUM ÜBERHAUPT MERKEN: TikTok gibt die Sticker-Liste eines Kanals NICHT
// heraus. Untersucht und ausgeschlossen (20.08.2026): die Raum-Antwort führt
// zwar `sticker_list`/`emoji_list`, die sind aber leer und meinen Spenden-
// Sticker; das eulerstream-SDK kennt nur Gift-Routen; und TikFinity kann es nur,
// weil deren EIGENER Server (`getChannelEmotes`) die Liste liefert. Über TikToks
// Weboberfläche ist der Endpunkt nicht auffindbar — dort lassen sich Sticker
// nicht einmal senden. Also entsteht der Katalog beim Zusehen. Das ist kein
// Notbehelf: im Mitschnitt trugen 38 % der Chat-Nachrichten Sticker.
//
// Aufbau bewusst nach dem Vorbild von gift-catalog.ts — dieselbe Falle, dieselbe
// Lösung: TikToks Bildadressen laufen ab, deshalb wird jedes Bild EINMAL lokal
// abgelegt. Ohne Kopie zeigt die Sticker-Seite morgen leere Kacheln.
import fs from 'node:fs';
import path from 'node:path';
import type { StudioSticker } from '@botexe/trigger-engine';
import { log } from '../core/logger';
import { schreibeAtomar } from '../core/atomar-schreiben';

const SCHEMA_VERSION = 1;

export interface StickerEntry {
  /** TikToks emoteId — der Anker für Regeln. */
  id: string;
  /** Dateiname im Sticker-Ordner, sobald ein Download geklappt hat. */
  bildDatei?: string;
  /** Herkunft bei TikTok. Läuft ab, wird bei jeder Sichtung aufgefrischt. */
  bildUrl: string;
  animiert: boolean;
  /** TikToks packageId, z.B. 'fansclub'. */
  paket?: string;
  /** avgColor — Platzhalter, solange kein Bild da ist. */
  farbe?: string;
  anzahl: number;
  erstGesehen: number;
  zuletztGesehen: number;
  /** TikTok liefert KEINEN Namen zu einem Sticker (auch TikFinity zeigt nur die
   *  Nummer). Der Streamer darf deshalb selbst einen vergeben. */
  eigenerName?: string;
}

interface Serialized {
  schemaVersion: number;
  sticker: StickerEntry[];
}

/** Eine echte Herkunfts-Adresse — nicht unsere eigene Auslieferung.
 *  Alles, was auf 127.0.0.1/localhost zeigt, kommt aus unserem eigenen Server
 *  und taugt nicht als Quelle für ein erneutes Laden. */
export function istFremdeAdresse(url: string | undefined): boolean {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  try {
    // Achtung: `hostname` liefert IPv6 MIT Klammern — '[::1]', nicht '::1'.
    // Der Vergleich ohne Klammern wäre nie wahr geworden.
    const h = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return h !== '127.0.0.1' && h !== 'localhost' && h !== '::1';
  } catch {
    return false;
  }
}

export class StickerCatalog {
  private readonly file: string;
  private readonly imagesDir: string;
  private sticker = new Map<string, StickerEntry>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Laufende Downloads (Dateiname) — gegen Doppel-Downloads bei Sticker-Regen. */
  private downloading = new Set<string>();
  /** Schon gezählte Sichtungen (Schlüssel → Zeitpunkt, wird aufgeräumt).
   *  Eine Chat-Nachricht mit Sticker erzeugt ZWEI Ereignisse — das Chat-
   *  Ereignis und ein nachgereichtes 'emote' je Sticker, damit Sticker-Regeln
   *  greifen. Ohne diese Sperre zählte jeder Sticker doppelt, und die Sticker-
   *  Seite behauptete „2× gesehen" für ein einziges Mal. */
  private zuletztGezaehlt = new Map<string, number>();

  constructor(userDataDir: string) {
    fs.mkdirSync(userDataDir, { recursive: true });
    this.file = path.join(userDataDir, 'sticker-catalog.json');
    this.imagesDir = path.join(userDataDir, 'sticker-images');
    fs.mkdirSync(this.imagesDir, { recursive: true });
    this.load();
  }

  getImagesDir(): string {
    return this.imagesDir;
  }

  /** Dateiname des lokalen Bildes, wenn es wirklich existiert — sonst ''. */
  localeDatei(entry: StickerEntry): string {
    if (entry.bildDatei && fs.existsSync(path.join(this.imagesDir, entry.bildDatei))) return entry.bildDatei;
    return '';
  }

  /**
   * Gesehene Sticker merken. Wird bei jedem Ereignis mit Stickern aufgerufen.
   *
   * Der eigene Name wird NIE überschrieben — sonst wäre er nach der nächsten
   * Sichtung wieder weg.
   */
  merken(sticker: StudioSticker[] | undefined, ts: number, absenderId?: string): void {
    if (!Array.isArray(sticker) || sticker.length === 0) return;
    let geaendert = false;
    for (const s of sticker) {
      if (!s?.id) continue;
      // Der Schlüssel muss das EREIGNIS identifizieren, nicht bloß den Sticker:
      // Zwei Zuschauer können denselben Sticker in derselben Millisekunde
      // schicken (die Bibliothek verarbeitet gebündelte Nachrichten in einer
      // Schleife), und eine Nachricht kann denselben Sticker zweimal enthalten.
      // Beides sind echte Sichtungen. Nur die nachgereichte Kopie desselben
      // Stickers derselben Nachricht soll wegfallen.
      //
      // Der Anker ist `index` — die Position IM TEXT. Sie ist der einzige Wert,
      // der über beide Ereignisse gleich bleibt: Im Chat-Ereignis stehen alle
      // Sticker zusammen in einer Liste, im nachgereichten steht jeder allein
      // (und hätte damit immer die Listenposition 0). Wer die Listenposition
      // nähme, würde den ZWEITEN Sticker einer Nachricht wieder doppelt zählen.
      const schluessel = `${s.id}|${ts}|${absenderId ?? ''}|${s.index}`;
      if (this.zuletztGezaehlt.has(schluessel)) continue;
      this.zuletztGezaehlt.set(schluessel, ts);
      // Der Merker darf nicht endlos wachsen — er braucht nur die letzten
      // Sekunden, weil das nachgereichte Ereignis unmittelbar folgt.
      if (this.zuletztGezaehlt.size > 500) {
        for (const [k, t] of this.zuletztGezaehlt) {
          if (ts - t > 10_000) this.zuletztGezaehlt.delete(k);
        }
      }
      const vorhanden = this.sticker.get(s.id);
      if (vorhanden) {
        vorhanden.anzahl++;
        vorhanden.zuletztGesehen = ts;
        // Adresse auffrischen: die alte ist womöglich abgelaufen. ABER nur
        // echte TikTok-Adressen — sobald das Bild lokal liegt, trägt das
        // Ereignis unsere eigene Adresse (mit Port und Zugangsschlüssel), und
        // die als „Herkunft" zu speichern würde die einzige Möglichkeit
        // zerstören, das Bild je wieder neu zu laden.
        if (istFremdeAdresse(s.bild)) vorhanden.bildUrl = s.bild;
        if (s.paket) vorhanden.paket = s.paket;
        if (s.farbe) vorhanden.farbe = s.farbe;
      } else {
        this.sticker.set(s.id, {
          id: s.id,
          bildUrl: s.bild || '',
          animiert: !!s.animiert,
          ...(s.paket ? { paket: s.paket } : {}),
          ...(s.farbe ? { farbe: s.farbe } : {}),
          anzahl: 1,
          erstGesehen: ts,
          zuletztGesehen: ts,
        });
      }
      geaendert = true;
      const eintrag = this.sticker.get(s.id);
      if (eintrag) this.holeBild(eintrag);
    }
    if (geaendert) this.scheduleSave();
  }

  /** Eigenen Namen vergeben oder löschen (leerer Text = zurück zur Nummer). */
  umbenennen(id: string, name: string): void {
    const e = this.sticker.get(id);
    if (!e) return;
    const sauber = name.trim().slice(0, 60);
    if (sauber) e.eigenerName = sauber;
    else delete e.eigenerName;
    this.scheduleSave();
  }

  /** Einen Sticker nachschlagen. Eigene Methode, weil sie bei JEDER
   *  Chat-Nachricht läuft — über alle() zu suchen würde jedes Mal die komplette
   *  Liste neu aufbauen und sortieren. */
  get(id: string): StickerEntry | undefined {
    return this.sticker.get(id);
  }

  /** Alle bekannten Sticker, zuletzt gesehene zuerst. */
  alle(): StickerEntry[] {
    return [...this.sticker.values()].sort((a, b) => b.zuletztGesehen - a.zuletztGesehen);
  }

  private holeBild(entry: StickerEntry): void {
    const url = entry.bildUrl;
    if (!url || !/^https?:\/\//i.test(url)) return;
    const ext = ((url.split('?')[0] ?? url).match(/\.(png|webp|jpe?g|gif)$/i)?.[1] || 'webp').toLowerCase();
    const name = `sticker-${entry.id}.${ext}`;
    const dest = path.join(this.imagesDir, name);
    if (fs.existsSync(dest)) {
      if (entry.bildDatei !== name) { entry.bildDatei = name; this.scheduleSave(); }
      return;
    }
    if (this.downloading.has(name)) return;
    this.downloading.add(name);
    void this.ladeBild(url, dest, name, entry);
  }

  private async ladeBild(url: string, dest: string, name: string, entry: StickerEntry): Promise<void> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (!res.ok) {
        // Gedrosselt: bei einem Sticker-Regen liefen sonst dutzende gleiche
        // Warnungen ins Log, und das Log ist für den Streamer, nicht für uns.
        log.gedrosselt(`sticker-bild:${res.status}`, 5 * 60_000, 'warn', 'StickerCatalog',
          `Ein Sticker-Bild wurde nicht geladen — TikTok antwortete mit ${res.status}. `
          + 'Der Sticker bleibt trotzdem bekannt und kann eine Aktion auslösen; nur das Bild fehlt.');
        return;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > 2 * 1024 * 1024) return; // Sanity-Cap
      fs.writeFileSync(dest, buf);
      entry.bildDatei = name;
      this.scheduleSave();
    } catch (err) {
      log.warn('StickerCatalog', `Sticker-Bild nicht ladbar (${name})`, (err as Error).message);
    } finally {
      this.downloading.delete(name);
    }
  }

  private load(): void {
    if (!fs.existsSync(this.file)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as Partial<Serialized>;
      if (data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.sticker)) {
        log.warn('StickerCatalog', 'sticker-catalog.json passt nicht zum Format dieser Version — '
          + 'die Sticker werden beim nächsten Stream neu gelernt.');
        return;
      }
      for (const e of data.sticker) {
        if (e && typeof e.id === 'string' && e.id) this.sticker.set(e.id, e);
      }
    } catch (err) {
      log.warn('StickerCatalog', 'sticker-catalog.json nicht lesbar', (err as Error).message);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.save(); }, 2_000);
    // Der Timer darf das Beenden der App nicht aufhalten.
    this.saveTimer.unref?.();
  }

  save(): void {
    try {
      const daten: Serialized = { schemaVersion: SCHEMA_VERSION, sticker: [...this.sticker.values()] };
      // Atomar: ein Absturz mitten im Schreiben darf den Katalog nicht zerreissen.
      schreibeAtomar(this.file, JSON.stringify(daten));
    } catch (err) {
      log.warn('StickerCatalog', 'sticker-catalog.json nicht schreibbar', (err as Error).message);
    }
  }
}
