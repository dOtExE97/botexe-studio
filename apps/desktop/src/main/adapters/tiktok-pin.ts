// tiktok-pin.ts — angepinnte Nachrichten (TikToks „oben festhalten").
//
// Der Streamer kann im Live eine Nachricht oben festhalten, damit sie stehen
// bleibt: eine Chat-Nachricht („heute nur Chill-Zocken"), ein Geschenk, einen
// Beitritt. In der TikTok-App sehen das alle — im OBS-Overlay bisher niemand.
//
// FÜNF SORTEN, EINE NACHRICHT. Belegt im Protokoll-Schema
// (tiktok-live-proto/v3, `WebcastRoomPinMessage`):
//   chatMessage · socialMessage · giftMessage · memberMessage · likeMessage
// Genau EINES davon ist gesetzt, die anderen sind leer.
//
// WARUM DAS HIER STEHT UND NICHT GERATEN WURDE: In einem echten Stream wurde
// erst ein Geschenk und danach eine Chat-Nachricht angepinnt. Im Diagnose-Log
// stand aber nur die ERSTE Form — Feldlisten werden je Art nur einmal
// ausgegeben. Wer daraus schließt „Pin = immer ein Geschenk", baut ein Widget,
// das bei jeder gepinnten Chat-Nachricht leer bleibt. Das Schema kennt die
// Wahrheit; das Log allein hätte hier in die Irre geführt.
//
// UND DAS LÖSEN NICHT VERGESSEN: `action` unterscheidet Anpinnen (1) von
// Lösen (2). Ohne das bliebe eine einmal gepinnte Nachricht für den Rest des
// Abends im Overlay stehen — auch wenn der Streamer sie längst gelöst hat.

/** Was angepinnt wurde, in einer für die Anzeige brauchbaren Form. */
export interface PinInhalt {
  /** Welche Sorte — bestimmt, was die Anzeige daraus macht. */
  art: 'chat' | 'geschenk' | 'beitritt' | 'social' | 'like';
  /** Der Text, falls es einer ist (Chat). */
  text?: string;
  /** Wer die angepinnte Nachricht geschrieben/geschickt hat. */
  vonNickname?: string;
  vonId?: string;
  /** Bei einem Geschenk: was und wie viel. */
  geschenk?: { name?: string; anzahl: number };
}

export interface PinEreignis {
  /** true = anpinnen, false = wieder lösen. */
  angepinnt: boolean;
  /** ID der angepinnten Nachricht — zum Wiedererkennen beim Lösen. */
  pinId: string;
  inhalt?: PinInhalt;
  /** Wer angepinnt hat (meist der Streamer oder ein Mod). */
  vonModerator?: string;
  /** Wie lange TikTok sie anzeigt (Sekunden), 0 = unbegrenzt. */
  dauerSek: number;
}

const text = (w: unknown): string | undefined => {
  const s = typeof w === 'string' ? w.trim() : '';
  return s.length > 0 ? s : undefined;
};
const zahl = (w: unknown): number => {
  const n = typeof w === 'string' ? Number(w) : typeof w === 'number' ? w : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Nutzer-Angaben aus einer eingebetteten Nachricht ziehen. */
function nutzer(o: Record<string, unknown> | undefined): { vonNickname?: string; vonId?: string } {
  const u = o?.['user'] as Record<string, unknown> | undefined;
  if (!u) return {};
  return {
    ...(text(u['nickname']) ? { vonNickname: text(u['nickname']) } : {}),
    ...(text(u['uniqueId']) || text(u['userId'])
      ? { vonId: text(u['uniqueId']) ?? text(u['userId']) }
      : {}),
  };
}

/**
 * Eine `WebcastRoomPinMessage` lesen.
 *
 * null, wenn nichts Brauchbares drinsteht — dann soll die Anzeige lieber gar
 * nichts tun, als einen leeren Kasten einzublenden.
 */
export function lesePin(data: unknown): PinEreignis | null {
  const d = data as Record<string, unknown> | undefined;
  if (!d) return null;

  // PIN = 1, PIN_CANCEL = 2 (PinMessageActionType im Schema). Alles andere ist
  // unbekannt — dann NICHT anpinnen: Ein falsch stehengebliebener Pin ist
  // schlimmer als ein verpasster.
  const action = zahl(d['action']);
  if (action !== 1 && action !== 2) return null;
  const angepinnt = action === 1;

  const pinId = text(d['pinMsgId']) ?? text(d['pinId']) ?? '';
  const operator = d['operator'] as Record<string, unknown> | undefined;
  const dauerSek = zahl(d['displayDuration']);

  const rahmen: PinEreignis = {
    angepinnt,
    pinId,
    ...(text(operator?.['nickname']) ? { vonModerator: text(operator?.['nickname']) } : {}),
    dauerSek,
  };

  // Beim LÖSEN ist der Inhalt egal — die Anzeige braucht nur die ID.
  if (!angepinnt) return rahmen;

  const chat = d['chatMessage'] as Record<string, unknown> | undefined;
  const gift = d['giftMessage'] as Record<string, unknown> | undefined;
  const member = d['memberMessage'] as Record<string, unknown> | undefined;
  const social = d['socialMessage'] as Record<string, unknown> | undefined;
  const like = d['likeMessage'] as Record<string, unknown> | undefined;

  let inhalt: PinInhalt | undefined;
  if (chat) {
    // `comment` im Cloud-Weg, `content` im v3-Schema — dieselbe Falle wie beim
    // normalen Chat, wo genau das schon einmal zu leerem Text geführt hat.
    inhalt = { art: 'chat', ...nutzer(chat), ...(text(chat['comment']) ?? text(chat['content'])
      ? { text: text(chat['comment']) ?? text(chat['content']) } : {}) };
  } else if (gift) {
    const details = gift['giftDetails'] as Record<string, unknown> | undefined;
    const g = gift['gift'] as Record<string, unknown> | undefined;
    inhalt = {
      art: 'geschenk',
      ...nutzer(gift),
      geschenk: {
        ...(text(details?.['giftName']) ?? text(g?.['name'])
          ? { name: text(details?.['giftName']) ?? text(g?.['name']) } : {}),
        anzahl: zahl(gift['repeatCount']) || 1,
      },
    };
  } else if (member) {
    inhalt = { art: 'beitritt', ...nutzer(member) };
  } else if (social) {
    inhalt = { art: 'social', ...nutzer(social) };
  } else if (like) {
    inhalt = { art: 'like', ...nutzer(like) };
  }

  return inhalt ? { ...rahmen, inhalt } : rahmen;
}

/** Eine Zeile fürs Log — sagt, WAS angepinnt wurde, nicht nur DASS. */
export function pinText(p: PinEreignis): string {
  if (!p.angepinnt) return 'Angepinnte Nachricht wieder gelöst.';
  const i = p.inhalt;
  if (!i) return 'Eine Nachricht wurde angepinnt.';
  const wer = i.vonNickname ? ` von ${i.vonNickname}` : '';
  switch (i.art) {
    case 'chat':
      return `Chat-Nachricht angepinnt${wer}: „${i.text ?? '(kein Text)'}"`;
    case 'geschenk':
      return `Geschenk angepinnt${wer}: ${i.geschenk?.name ?? 'Geschenk'}`
        + (i.geschenk && i.geschenk.anzahl > 1 ? ` ×${i.geschenk.anzahl}` : '');
    case 'beitritt':
      return `Beitritt angepinnt${wer}`;
    default:
      return `Nachricht angepinnt${wer}`;
  }
}
