// Emotes von 7TV, BTTV und FrankerFaceZ für den Twitch-Chat.
//
// Twitch kennt diese Emotes nicht: Für Twitch ist „catJAM" nur Text. Wer die
// Browser-Erweiterung hat, sieht ein Bild, das Overlay sah bisher das Wort.
// Hier werden die Emote-Listen geladen (global + Kanal) und ein Wort im Chat
// in ein Bild übersetzt. Nur ganze Wörter, Groß-/Kleinschreibung zählt (so
// machen es die Erweiterungen auch: „Kappa" ≠ „kappa").
//
// Antwortformate am 13.11.2026 gegen die echten Schnittstellen geprüft:
//   7TV  GET https://7tv.io/v3/emote-sets/global → { emotes: [{ id, name, data: { animated, host: { url: '//cdn.7tv.app/emote/<id>', files } } }] }
//        GET https://7tv.io/v3/users/twitch/<id>  → { emote_set: { emotes: [...] } } bzw. 404 { error_code: 12000 } ohne 7TV-Konto
//   BTTV GET https://api.betterttv.net/3/cached/emotes/global → [{ id, code, imageType, animated }]
//        GET https://api.betterttv.net/3/cached/users/twitch/<id> → { channelEmotes: [...], sharedEmotes: [...] } bzw. 404
//        Bild: https://cdn.betterttv.net/emote/<id>/2x (liefert das Bild direkt, PNG/GIF)
//   FFZ  GET https://api.betterttv.net/3/cached/frankerfacez/emotes/global → [{ id, code, images: { '1x','2x','4x' }, animated }]
//        GET https://api.betterttv.net/3/cached/frankerfacez/users/twitch/<id> → dasselbe Format (leer ohne FFZ)

export type EmoteQuelle = '7tv' | 'bttv' | 'ffz';

export interface FremdEmote {
  quelle: EmoteQuelle;
  id: string;
  bild: string;
  animiert: boolean;
}

type Roh = Record<string, unknown>;
const obj = (v: unknown): Roh | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Roh) : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);
const liste = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Erlaubte Emote-Namen: so wie die Dienste sie vergeben, ohne Leerzeichen. */
const NAME = /^\S{2,40}$/;

export function sevenTvEmotes(antwort: unknown): Array<[string, FremdEmote]> {
  const a = obj(antwort);
  const set = obj(a?.emote_set) ?? a;
  const aus: Array<[string, FremdEmote]> = [];
  for (const roh of liste(set?.emotes)) {
    const e = obj(roh);
    const name = str(e?.name), id = str(e?.id);
    const data = obj(e?.data), host = str(obj(data?.host)?.url);
    if (!name || !id || !NAME.test(name) || !host || !/^\/\/cdn\.7tv\.app\//.test(host)) continue;
    aus.push([name, { quelle: '7tv', id, bild: `https:${host}/2x.webp`, animiert: data?.animated === true }]);
  }
  return aus;
}

export function bttvEmotes(antwort: unknown): Array<[string, FremdEmote]> {
  const a = obj(antwort);
  const roh = Array.isArray(antwort) ? antwort : [...liste(a?.channelEmotes), ...liste(a?.sharedEmotes)];
  const aus: Array<[string, FremdEmote]> = [];
  for (const r of roh) {
    const e = obj(r);
    const name = str(e?.code), id = str(e?.id);
    if (!name || !id || !NAME.test(name) || !/^[a-f0-9]{24}$/i.test(id)) continue;
    aus.push([name, { quelle: 'bttv', id, bild: `https://cdn.betterttv.net/emote/${id}/2x`, animiert: e?.animated === true }]);
  }
  return aus;
}

export function ffzEmotes(antwort: unknown): Array<[string, FremdEmote]> {
  const aus: Array<[string, FremdEmote]> = [];
  for (const r of liste(antwort)) {
    const e = obj(r);
    const name = str(e?.code), id = e?.id;
    const bilder = obj(e?.images);
    const bild = str(bilder?.['2x']) ?? str(bilder?.['1x']);
    if (!name || (typeof id !== 'number' && typeof id !== 'string') || !NAME.test(name) || !bild || !/^https:\/\//.test(bild)) continue;
    aus.push([name, { quelle: 'ffz', id: String(id), bild, animiert: e?.animated === true }]);
  }
  return aus;
}

export interface FremdEmotesDeps {
  fetch: typeof fetch;
  now: () => number;
  log: (stufe: 'info' | 'warn', text: string) => void;
}

/** Hält die Emote-Liste eines Kanals. `laden()` ist billig wiederholbar: Die
 *  Liste wird höchstens alle 30 Minuten neu geholt. */
export class FremdEmotes {
  private emotes = new Map<string, FremdEmote>();
  private kanal = '';
  private stand = 0;
  private laeuft: Promise<void> | null = null;

  constructor(private readonly deps: FremdEmotesDeps) {}

  finde(wort: string): FremdEmote | undefined {
    return this.emotes.get(wort);
  }

  get anzahl(): number { return this.emotes.size; }

  laden(twitchUserId: string): Promise<void> {
    if (!/^\d+$/.test(twitchUserId)) return Promise.resolve();
    if (this.laeuft) return this.laeuft;
    if (twitchUserId === this.kanal && this.deps.now() - this.stand < 30 * 60_000) return Promise.resolve();
    this.laeuft = this.holen(twitchUserId).finally(() => { this.laeuft = null; });
    return this.laeuft;
  }

  private async holen(id: string): Promise<void> {
    const json = async (url: string): Promise<unknown> => {
      try {
        const r = await this.deps.fetch(url, { signal: AbortSignal.timeout(10_000) });
        return r.ok ? await r.json() : null; // 404 = Kanal hat dort kein Konto — normal
      } catch { return null; }
    };
    const [sGlobal, bGlobal, fGlobal, sKanal, bKanal, fKanal] = await Promise.all([
      json('https://7tv.io/v3/emote-sets/global'),
      json('https://api.betterttv.net/3/cached/emotes/global'),
      json('https://api.betterttv.net/3/cached/frankerfacez/emotes/global'),
      json(`https://7tv.io/v3/users/twitch/${id}`),
      json(`https://api.betterttv.net/3/cached/users/twitch/${id}`),
      json(`https://api.betterttv.net/3/cached/frankerfacez/users/twitch/${id}`),
    ]);
    // Reihenfolge = Vorrang: später gewinnt. Kanal-Emotes vor globalen, 7TV
    // zuletzt (das ist die Erweiterung, die heute die meisten nutzen).
    const neu = new Map<string, FremdEmote>([
      ...ffzEmotes(fGlobal), ...bttvEmotes(bGlobal), ...sevenTvEmotes(sGlobal),
      ...ffzEmotes(fKanal), ...bttvEmotes(bKanal), ...sevenTvEmotes(sKanal),
    ]);
    if (neu.size === 0) {
      // Alles fehlgeschlagen (offline?) — die alte Liste behalten, später neu versuchen.
      this.deps.log('warn', '7TV/BTTV/FFZ-Emotes ließen sich nicht laden — im Chat stehen sie vorerst als Wort. Neuer Versuch beim nächsten Verbinden.');
      return;
    }
    this.emotes = neu; this.kanal = id; this.stand = this.deps.now();
    const kanalAnzahl = sevenTvEmotes(sKanal).length + bttvEmotes(bKanal).length + ffzEmotes(fKanal).length;
    this.deps.log('info', `Emotes von 7TV, BTTV und FFZ geladen: ${neu.size} (davon ${kanalAnzahl} eigene des Kanals).`);
  }
}
