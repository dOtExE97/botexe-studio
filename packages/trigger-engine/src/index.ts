// @botexe/trigger-engine — deterministische Regel-Logik, keine Electron-/IO-Abhängigkeiten.
// Cooldowns rechnen mit event.ts (nicht Wanduhr) → Replay-Tests sind exakt reproduzierbar.

export { giftRuleId, findGiftRule, upsertGiftRule, otherGiftRules, orderedGiftKeys, type GiftKey } from './gift-mapping';
export { stickerRuleId, findStickerRule, upsertStickerRule, otherStickerRules } from './sticker-mapping';
// giftKey nach außen: JEDER Vergleich „ist das dieses Geschenk?" muss ihn
// benutzen. Die Widget-Bindungen (Rad/Automat/Lucky-Card) verglichen die
// Namen vorher buchstabengenau und verfehlten dadurch dasselbe Geschenk in
// anderer Schreibweise — obwohl die Trigger-Engine daneben korrekt matchte.
export { giftKey } from '../../widget-kit/gift-rules.js';
// giftKey ist EINZIGE Quelle in packages/widget-kit/gift-rules.js (DOM-freies
// reines JS, allowJs übernimmt es unverändert — s. tsconfig.json und der
// bestehende itemsFromRules-Import in gift-mapping.ts). Vorher hatte diese
// Datei eine eigene, textidentische Kopie von giftKey — 4. unabhängige Kopie
// im Repo (neben gift-rules.js selbst, gift-counter.js und dem impliziten
// Vertrag über orderedGiftKeys). Ändert sich die Normalisierungsregel künftig
// (z.B. Unicode-Normalisierung für Emoji-Gift-Namen) nur an EINER Stelle,
// drifteten Trigger-Matching (hier) und Rad/Slot/Tafel (gift-rules.js)
// lautlos auseinander.
import { giftKey } from '../../widget-kit/gift-rules.js';

export type StudioEventType =
  | 'chat'
  | 'gift'
  | 'follow'
  | 'sub'
  | 'like'
  | 'share'
  /** Zuschauer betritt den Stream (TikTok „member"/join). */
  | 'join'
  | 'viewer_count'
  /** Superfan-Ereignis: jemand ist dem Superfan-Club beigetreten oder es gab
   *  eine andere Superfan-Meldung. Kommt als Banner-Nachricht rein, in der ein
   *  vollständiges Zuschauer-Objekt steckt. */
  | 'superfan'
  /** Zuschauer schickt ein Emote/Sticker — reines Beteiligungs-Signal. */
  | 'emote'
  /** Coin-Kiste / Schatztruhe (TikTok „envelope"), inkl. Superfan-Truhe.
   *  Eigene Gattung, KEIN Geschenk: Absender, Coin-Wert und Anzahl der
   *  Gewinner stehen in einer eigenen Nachricht, und es hängt kein
   *  vollständiges Zuschauer-Objekt daran (siehe normalizeEnvelope). */
  | 'envelope'
  /** Periodischer Tick — Timer-Regeln (z.B. alle 10 Min. Socials einblenden). */
  | 'timer';

export interface StudioUser {
  id: string;
  /** Rohe numerische TikTok-userId (falls abweichend von id) — als zweiter,
   *  stabiler Schlüssel fürs Rollen-Gedächtnis, da TikTok mal uniqueId, mal nur
   *  userId liefert. */
  userId?: string;
  nickname: string;
  profilePic?: string;
  /** SUPERFAN — das BEZAHLTE Abo (UserIdentity.isSubscriberOfAnchor).
   *
   *  NICHT Teamherz. Die beiden werden ständig verwechselt, auch hier stand
   *  jahrelang „Teamherz-Mitglied" — falsch:
   *    Superfan  = kostet Geld, monatlich, `isSub`
   *    Teamherz  = gratis, Fanclub, hat eine STUFE, siehe `teamLevel`
   *  Man kann das eine ohne das andere sein. Wer beides in einen Topf wirft,
   *  baut Filter, die nie greifen. */
  isSub?: boolean;
  /** Moderator dieses Streams. */
  isMod?: boolean;
  /** Folgt dem Streamer. */
  isFollower?: boolean;
  /** Ihr folgt euch GEGENSEITIG — mehr als ein Follower, und für einen kleinen
   *  Kanal der Unterschied zwischen Publikum und Bekanntschaft. TikTok schickt
   *  es an jeder Chat-Nachricht mit (UserIdentity.isMutualFollowingWithAnchor). */
  isMutual?: boolean;
  /** Hat dir schon einmal etwas geschenkt (UserIdentity.isGiftGiverOfAnchor) —
   *  auch in einem früheren Stream, den die App gar nicht gesehen hat. */
  hatGeschenkt?: boolean;
  /** Teamherz-Stufe (TikToks Fan-Club-Level, 0 = kein Teamherz).
   *
   *  TikTok schickt das an jedem Nutzer mit — wir haben es bisher weggeworfen.
   *  Damit lässt sich z.B. das Vorlesen erst ab einer Stufe freigeben. */
  teamLevel?: number;
  /** Geschenke-Stufe des Zuschauers bei TikTok insgesamt (payGrade), nicht
   *  bezogen auf diesen Stream. 0 = unbekannt. */
  gifterLevel?: number;
  /** Wie viele Follower dieser ZUSCHAUER selbst hat (user.followInfo).
   *  Lag an jeder Nachricht an; gelesen wurde bisher nur der Folge-Status.
   *  Ein Streamer mit 20 000 Followern im Raum ist eine Info wert. */
  followerCount?: number;
  /** Wie vielen der Zuschauer selbst folgt. */
  followingCount?: number;
}

/** Was TikTok an fast jeder Nachricht über die Beziehung dieses Zuschauers zum
 *  Kanal mitliefert (`portraitTag`) — mit Zahlen, nicht nur als Etikett.
 *
 *  Fehlt ein Feld, ist es UNBEKANNT, nicht null. Jede Auswertung und jede
 *  Bedingung muss das unterscheiden: „folgt seit 0 Tagen" wäre eine Aussage,
 *  „keine Angabe" ist keine. */
export interface StudioBeziehung {
  folgtSeitTagen?: number;
  fanclubSeitTagen?: number;
  superfanSeitMonaten?: number;
  istTopGifter?: boolean;
  folgtNicht?: boolean;
  /** Folgt seit HEUTE (TikToks `followedToday`). Eigenes Feld statt
   *  `folgtSeitTagen: 0`, weil 0 sonst nicht von „keine Angabe" zu
   *  unterscheiden waere. */
  folgtSeitHeute?: boolean;
}

export interface StudioGift {
  slug: string;
  giftId?: number;
  count: number;
  coinsPerUnit: number;
  totalCoins: number;
  /** Offizielles TikTok-Gift-Bild (aus giftDetails), für Alerts/Feeds. */
  icon?: string;
  /** Name, den die Overlay-Widgets ANZEIGEN sollen — deutscher Name oder die
   *  eigene Umbenennung aus der Galerie, je nach Einstellung `giftNameLang`.
   *  Studio reichert das an; fehlt es, zeigen die Widgets `slug`.
   *
   *  WICHTIG: Nur für die Anzeige. Jede Zuordnung (Trigger, Rad, Automat,
   *  Zähler) läuft weiter über `slug` — sonst würde eine Umbenennung still
   *  alle Regeln des Nutzers ins Leere laufen lassen. */
  displayName?: string;
}

/** Normalisiertes Live-Event — vom TikTok-Adapter erzeugt, von Engine/Overlays konsumiert. */
/** Eine Coin-Kiste / Schatztruhe.
 *
 *  WICHTIG: Am Absender hängt KEIN vollständiges Zuschauer-Objekt — TikTok
 *  liefert in dieser Nachricht nur Anzeigename, ID und Bild. Es gibt also
 *  keinen @-Namen und keine Teamherz-Stufe. Wer die Truhe wie ein Geschenk
 *  behandelt, wundert sich sonst, warum niemand Punkte bekommt. */
export interface StudioEnvelope {
  /** Coin-Wert der Truhe (TikTok: diamondCount). */
  coins: number;
  /** Für wie viele Zuschauer die Truhe gedacht ist. */
  winners: number;
  /** true = Superfan-Truhe (nur für Teamherz-Mitglieder). */
  superFan: boolean;
}

/** Ein Platz aus TikToks eigener Raum-Bestenliste (WebcastRoomUserSeqMessage). */
export interface RaumPlatz {
  platz: number;
  /** TikToks Punktzahl für diesen Zuschauer im laufenden Stream. */
  punkte: number;
  user: StudioUser;
}

/** Ein Sticker aus einer Nachricht (TikToks „emote").
 *
 *  TikTok liefert dazu KEINEN Namen — nur eine Nummer und ein Bild. Deshalb ist
 *  `id` der einzige stabile Anker für Regeln, und die Sticker-Seite lässt den
 *  Streamer selbst einen Namen vergeben. */
export interface StudioSticker {
  /** TikToks emoteId. */
  id: string;
  /** Bild: lokaler Pfad, sobald der Katalog es abgelegt hat, sonst die
   *  CDN-Adresse. TikToks Adressen laufen ab — deshalb wird kopiert. */
  bild: string;
  /** Position im Text (0 = ganz vorne). Ein Sticker kann mitten im Satz stehen. */
  index: number;
  animiert: boolean;
  /** TikToks packageId, z.B. 'fansclub' — aus welchem Set der Sticker stammt. */
  paket?: string;
  /** Platzhalter-Farbe, solange das Bild lädt (TikToks avgColor). */
  farbe?: string;
}

export interface StudioEvent {
  type: StudioEventType;
  ts: number;
  user?: StudioUser;
  text?: string;
  /** Sticker dieser Nachricht. Lagen an jeder Chat-Nachricht an und wurden
   *  verworfen — wodurch reine Sticker-Nachrichten spurlos verschwanden, denn
   *  ihr Text ist leer. Im Mitschnitt vom 20.08.2026 (@hi_im_billa, 90 s):
   *  8 von 21 Chat-Nachrichten, also 38 %. */
  sticker?: StudioSticker[];
  /** Wie lange dieser Zuschauer schon folgt / im Fanclub / Superfan ist.
   *  Liegt an fast jeder Nachricht an und wurde nie gelesen. */
  beziehung?: StudioBeziehung;
  /** Nur bei 'join': woher der Zuschauer kam (TikToks `clientEnterSource`, ROH).
   *  Die möglichen Werte sind nirgends dokumentiert — deshalb wird der Wert
   *  unverändert weitergereicht und nirgends in erfundene Schubladen sortiert. */
  herkunft?: string;
  gift?: StudioGift;
  likeCount?: number;
  totalLikes?: number;
  viewerCount?: number;
  /** Wie viele davon UNSICHTBAR zuschauen (TikTok „anonymous"). Erklärt die
   *  Lücke zwischen „gefühlt viele" und der angezeigten Zahl. */
  anonymousViewers?: number;
  /** TikToks EIGENE Raum-Bestenliste, die in jedem Zuschauer-Tick mitkommt und
   *  bisher komplett weggeworfen wurde: Platz, Punktzahl und Zuschauer. */
  raumBeste?: RaumPlatz[];
  /** TikToks eigener Beliebtheitswert für den Raum (nur bei 'viewer_count').
   *  Fehlt, wenn TikTok ihn nicht mitschickt — eine 0 sähe aus wie „Beliebtheit
   *  null" statt „nicht geliefert". */
  beliebtheit?: number;
  /** Nur bei 'join': Dieser Zuschauer gehört zu TikToks Top-Supportern des
   *  Streams. Platz und Punktzahl, soweit mitgeliefert. */
  ehrengast?: { platz?: number; punkte?: number };
  /** true = dieser Zuschauer ist zum allerersten Mal aktiv (Studio reichert an). */
  firstOfUser?: boolean;
  /** true = dieser Zuschauer folgt zum ersten Mal (seit die App ihn kennt) —
   *  kein Re-Follow. Studio reichert an; nur bei type === 'follow' relevant. */
  firstFollow?: boolean;
  /** Nur bei 'sub': wie viele Monate der Zuschauer schon Teamherz ist
   *  (TikTok liefert das als Text mit — 1 = brandneu). */
  subMonths?: number;
  /** Nur bei 'envelope': Coin-Wert der Truhe, Anzahl der Gewinner und ob es
   *  die Superfan-Truhe war. */
  envelope?: StudioEnvelope;
  /** Nur bei 'superfan': true = jemand ist NEU beigetreten (TikTok unterscheidet
   *  das selbst), false = sonstige Superfan-Meldung (Verlängerung, Stufe …). */
  superfanNeu?: boolean;
  /** true = Test-/Replay-Event (Vorschau) — löst Overlay/TTS aus, wird aber NICHT
   *  persistent verbucht (keine echten Punkte/Coins/Likes, kein Gift-Katalog). */
  synthetic?: boolean;
  /** true = Sticky-Replay beim (Re-)Connect einer Overlay-Quelle: das letzte
   *  Event pro Typ wird zum Rehydrieren erneut gesendet. Effekt-/Zähler-Widgets
   *  MÜSSEN das überspringen (sonst Geister-Alerts + Doppelzählung); nur
   *  idempotente Anzeigen (Top-Gift/Top-Streak) dürfen es verarbeiten. */
  sticky?: boolean;
}

export type TriggerCondition =
  | { kind: 'gift_coins_gte'; value: number }
  | { kind: 'gift_count_gte'; value: number }
  | { kind: 'gift_slug_is'; value: string }
  /** Bestimmtes Gift über die STABILE TikTok-Gift-ID (sprachunabhängig — anders
   *  als der lokalisierte Anzeigename). Fürs TikFinity-Import robust. */
  | { kind: 'gift_id_is'; value: number }
  /** Coin-Kiste ab einem Mindestwert bzw. nur die Superfan-Truhe. */
  | { kind: 'envelope_coins_gte'; value: number }
  | { kind: 'envelope_superfan' }
  /** Nur der echte Neu-Beitritt, keine Verlängerung/Stufenmeldung. */
  /** Der Zuschauer folgt dir GEGENSEITIG — ihr folgt euch beide. Mehr als ein
   *  Follower: für einen kleinen Kanal der Unterschied zwischen Publikum und
   *  Bekanntschaft. TikTok schickt es an jeder Chat-Nachricht mit. */
  | { kind: 'user_gegenseitig' }
  /** Der Zuschauer hat dir schon einmal etwas geschenkt — auch in einem
   *  früheren Stream, den die App nie gesehen hat. TikTok weiß das, wir nicht. */
  | { kind: 'user_hat_geschenkt' }
  /** Ein Top-Supporter betritt den Stream (TikToks eigene Wertung). Optional
   *  erst ab einem Platz: `value: 3` = nur die ersten drei. 0/fehlt = jeder,
   *  den TikTok als Top-Supporter markiert. */
  | { kind: 'ehrengast_betritt'; value?: number }
  | { kind: 'superfan_neu' }
  /** Nur Verlängerungen (Treue!) — das Gegenstück zu superfan_neu. */
  | { kind: 'superfan_verlaengerung' }
  /** Ab wie vielen Monaten Superfan-Treue. */
  | { kind: 'superfan_monate_gte'; value: number }
  /** Wie lange dieser Zuschauer dir schon folgt. TikTok liefert es an fast
   *  jeder Nachricht mit — „seit 437 Tagen dabei", ohne dass die App je
   *  mitzählen musste.
   *
   *  FEHLT die Angabe, gilt die Bedingung als NICHT erfüllt. Nie andersherum:
   *  sonst begrüßt die Treue-Regel jeden Fremden. */
  | { kind: 'folgt_seit_tagen_gte'; value: number }
  /** Wie lange im Teamherz/Fanclub (TikToks `memberDays`). */
  | { kind: 'fanclub_seit_tagen_gte'; value: number }
  /** Folgt seit HEUTE — der brandneue Follower. */
  | { kind: 'folgt_seit_heute' }
  /** TikTok markiert diesen Zuschauer als Top-Schenker. */
  | { kind: 'ist_top_gifter' }
  /** Der Zuschauer hat SELBST mindestens so viele Follower — z.B. um einen
   *  großen Kanal im Raum besonders zu begrüßen. */
  | { kind: 'follower_count_gte'; value: number }
  /** Ein bestimmter Sticker (TikToks emoteId). TikTok liefert zu Stickern
   *  KEINEN Namen — die Nummer ist der einzige stabile Anker. Die Sticker-Seite
   *  zeigt dazu das Bild, damit niemand Nummern vergleichen muss. */
  | { kind: 'sticker_ist'; value: string }
  | { kind: 'chat_keyword'; value: string }
  /** Nachricht beginnt mit dem Befehl (z.B. '!hype'), optional mit Argumenten. */
  | { kind: 'chat_command'; value: string }
  /** Allererste Nachricht dieses Zuschauers (über alle Streams) — Begrüßung. */
  | { kind: 'chat_first_time' }
  /** Erst-Follow (kein Re-Follow) — z.B. Jumpscare nur beim ersten Mal. */
  | { kind: 'follow_first_time' }
  /** Raumweite Like-Meilensteine: feuert, wenn totalLikes die Schwelle KREUZT
   *  (nicht bei jedem Batch darüber) — für „bei 1000 Likes Feuerwerk". */
  | { kind: 'like_count_gte'; value: number }
  | { kind: 'viewer_count_gte'; value: number };

export type TriggerActionKind =
  | { kind: 'play_sound'; soundId: string; volume?: number }
  | { kind: 'fire_alert'; targetId: string; params?: Record<string, unknown> }
  | { kind: 'show_layer'; targetId: string; durationMs?: number }
  | { kind: 'hide_layer'; targetId: string }
  /** TTS-Ansage; template mit {user} {text} {gift} {count} {coins} platzhaltern. */
  | { kind: 'speak'; template: string; voice?: string }
  /** roll (0..1) würfelt der SERVER beim Broadcast — alle Overlay-Quellen
   *  (OBS + TTLS) zeigen so denselben Gewinner. segmentIndex = fester Zielwert. */
  | { kind: 'spin_wheel'; targetId: string; cost?: number; segmentIndex?: number; roll?: number }
  /** Gambling-Automat: win/winnerIndex/roll würfelt der SERVER zentral beim
   *  Geschenk-Empfang (planSlotOutcome in slot-gift.ts) — alle Overlay-
   *  Quellen zeigen so dasselbe Ergebnis. */
  | { kind: 'spin_slot'; targetId: string; win?: boolean; winnerIndex?: number; roll?: number }
  /** Media-Widget abspielen (Bild einblenden / Video starten) — z.B. Begrüßungsclip. */
  | { kind: 'play_media'; targetId: string }
  /** Counter-Widget verändern (delta ±N, z.B. „Tode +1" per Hotkey/Befehl). */
  | { kind: 'counter_add'; targetId: string; delta: number }
  /** OBS-Szene wechseln (braucht OBS-WebSocket-Verbindung). */
  | { kind: 'obs_scene'; scene: string }
  /** OBS-Quelle in einer Szene ein-/ausblenden. */
  | { kind: 'obs_visibility'; scene: string; source: string; visible: boolean }
  /** Nachricht in den TikTok-Live-Chat senden (braucht Login; rate-limited). */
  | { kind: 'send_chat'; template: string }
  /** Streamer.bot-Aktion auslösen (per Name oder ID). */
  | { kind: 'streamerbot_action'; action: string }
  /** Giveaway: Gewinner aus den !join-Teilnehmern ziehen (App wählt, Widget
   *  animiert). params werden von der App gesetzt (winner + names). */
  | { kind: 'giveaway_draw'; params?: { winner?: { nickname: string; avatar?: string }; names?: string[] } }
  /** Giveaway zurücksetzen (Teilnehmerliste leeren, Widget auf Idle). */
  | { kind: 'giveaway_reset' }
  /** Spotify steuern (braucht verbundenes Spotify Premium + aktives Gerät). */
  | { kind: 'spotify_control'; control: 'play' | 'pause' | 'next' | 'previous' }
  /** Song-Request: query (Template, z.B. {args} = Chat-Text nach dem Befehl) →
   *  Spotify-Suche → erster Treffer in die Wiedergabe-Queue. */
  | { kind: 'spotify_request'; query: string }
  /** Reine Anzeige-Aktion (kein Gift-Event, keine Coin-/Zähler-Nebenwirkung):
   *  startet auf dem Geschenke-Slider (gift-menu) die Challenge des per slug
   *  benannten Geschenks — z.B. wenn der Gambling-Automat dieses Geschenk als
   *  Gewinner auslost (siehe slot-gift.ts planSlotSpins). Kann auf dem
   *  gift-menu-Widget nie erneut den Automaten auslösen. */
  | { kind: 'start_gift_challenge'; targetId: string; slug: string; who?: string }
  /** Lucky-Card: der Geschenke-Slider (gift-menu) shuffelt die Karten durch
   *  und landet auf winnerIndex — win/winnerIndex/roll würfelt der SERVER
   *  (Task 2, noch offen); das Widget entscheidet NIE selbst über
   *  Gewinn/Niete, es spielt nur die Animation und löst bei Gewinn die
   *  Challenge der gezogenen Karte aus (celebrate). */
  | { kind: 'lucky_draw'; targetId: string; win?: boolean; winnerIndex?: number; roll?: number; who?: string };

/** Eine Aktion mit optionaler Verzögerung (Combo-Sequenz: Alert jetzt,
 *  Sound +0,5s, Ansage +2s …). delayMs = Versatz ab Auslösung der Regel. */
export type TriggerAction = TriggerActionKind & { delayMs?: number };

/** Punkte-Einlösung: Zuschauer gibt per Chat-Befehl Punkte aus → Aktion(en). */
export interface Redemption {
  id: string;
  name: string;
  /** Chat-Befehl, z.B. '!airhorn' (mit oder ohne führendes !). */
  command: string;
  /** Punkte-Kosten pro Einlösung. */
  cost: number;
  actions: TriggerAction[];
  enabled: boolean;
  /** Globaler Mindestabstand zwischen zwei Einlösungen (ms). */
  cooldownMs?: number;
}

/** Manuell auslösbarer Knopf (Soundboard/Schnell-Aktion) mit optionalem Hotkey. */
export interface PanelButton {
  id: string;
  label: string;
  action: TriggerAction;
  /** Electron-Accelerator, z.B. 'CommandOrControl+Shift+1' (leer = kein Hotkey). */
  accelerator?: string;
}

export interface TriggerRule {
  id: string;
  name: string;
  event: StudioEventType;
  /** UND-verknüpft; keine/leere Liste = matcht jedes Event des Typs. */
  conditions?: TriggerCondition[];
  actions: TriggerAction[];
  /** Mindestabstand zwischen zwei Auslösungen dieser Regel (über event.ts gemessen). */
  cooldownMs?: number;
  /** Mindestabstand PRO ZUSCHAUER (event.user.id) — begrenzt Spam durch einzelne
   *  Nutzer, ohne die Regel global zu drosseln. Aus TikFinitys userCooldown. */
  userCooldownMs?: number;
  enabled: boolean;
}

/** Eine Regel, die gepasst hat, aber von einer Abklingzeit gebremst wurde. */
export interface GebremsteRegel {
  ruleId: string;
  name: string;
  grund: 'abklingzeit' | 'proZuschauer' | 'ausgeschaltet';
  /** Wie lange die Sperre noch gilt (ms). */
  restMs: number;
}

export interface TriggerMatch {
  ruleId: string;
  action: TriggerAction;
}

export class TriggerEngine {
  private rules: TriggerRule[] = [];
  /** ruleId → event.ts der letzten Auslösung. Überlebt setRules() bewusst. */
  private lastFired = new Map<string, number>();
  /** Ergebnis des letzten evaluate(): Regeln, die gepasst hätten, aber wegen
   *  einer Abklingzeit übersprungen wurden — siehe gebremsteRegeln(). */
  private zuletztGebremst: GebremsteRegel[] = [];
  /** Regeln, die beim letzten evaluate() gepasst hätten, aber AUS sind. */
  private zuletztAusgeschaltet: GebremsteRegel[] = [];
  /** ruleId → (userId → event.ts) für den Cooldown pro Zuschauer. */
  private lastFiredPerUser = new Map<string, Map<string, number>>();

  setRules(rules: TriggerRule[]): void {
    this.rules = rules;
  }

  /** Gibt es mind. eine aktive Timer-Regel? — damit der 1s-Ticker nur läuft,
   *  wenn er auch etwas auswerten kann (sonst reine Leerlauf-Last). */
  /** Die aktuell geladenen Regeln (nur lesen — Kopie, damit niemand von außen
   *  am internen Stand dreht). Gebraucht für Start-Meldungen wie „Timer-Regel
   *  ohne Intervall", die sonst jede Sekunde erneut geprüft würden. */
  alleRegeln(): TriggerRule[] {
    return [...this.rules];
  }

  hasTimerRules(): boolean {
    return this.rules.some((r) => r.enabled && r.event === 'timer');
  }

  resetCooldowns(): void {
    this.lastFired.clear();
    this.lastFiredPerUser.clear();
  }

  evaluate(event: StudioEvent): TriggerMatch[] {
    this.zuletztGebremst = [];
    const matches: TriggerMatch[] = [];
    this.zuletztAusgeschaltet = [];
    for (const rule of this.rules) {
      if (rule.event !== event.type) continue;
      if (rule.event === 'timer') continue; // Timer laufen über evaluateTimer
      if (!(rule.conditions ?? []).every((c) => conditionHolds(c, event))) continue;
      // Erst NACH der Bedingungsprüfung auf „ausgeschaltet" testen: So weiß der
      // Aufrufer nicht nur, dass eine Regel aus ist, sondern dass sie GERADE
      // gepasst hätte. Eine ausgeschaltete Regel wurde sonst nirgends je
      // erwähnt — der Streamer baut sie ein zweites Mal.
      if (!rule.enabled) {
        this.zuletztAusgeschaltet.push({ ruleId: rule.id, name: rule.name, grund: 'ausgeschaltet', restMs: 0 });
        continue;
      }
      // Cooldown pro Zuschauer VOR dem globalen prüfen (sonst würde ein
      // gedrosselter Nutzer den globalen Timer trotzdem zurücksetzen).
      const userId = event.user?.id;
      if (rule.userCooldownMs !== undefined && userId) {
        let perUser = this.lastFiredPerUser.get(rule.id);
        const lastU = perUser?.get(userId);
        if (lastU !== undefined && event.ts - lastU < rule.userCooldownMs) {
          this.zuletztGebremst.push({ ruleId: rule.id, name: rule.name, grund: 'proZuschauer', restMs: rule.userCooldownMs - (event.ts - lastU) });
          continue;
        }
        if (!perUser) { perUser = new Map(); this.lastFiredPerUser.set(rule.id, perUser); }
        perUser.set(userId, event.ts);
      }
      if (rule.cooldownMs !== undefined) {
        const last = this.lastFired.get(rule.id);
        if (last !== undefined && event.ts - last < rule.cooldownMs) {
          this.zuletztGebremst.push({ ruleId: rule.id, name: rule.name, grund: 'abklingzeit', restMs: rule.cooldownMs - (event.ts - last) });
          continue;
        }
        this.lastFired.set(rule.id, event.ts);
      }
      for (const action of rule.actions) {
        matches.push({ ruleId: rule.id, action });
      }
    }
    return matches;
  }

  /**
   * Welche Regeln haben beim LETZTEN evaluate() vollständig gepasst, wurden
   * aber von einer Abklingzeit geschluckt?
   *
   * Ohne diesen Rückkanal ist der Fall von außen nicht von „keine Regel passt"
   * zu unterscheiden — für den Streamer sieht beides gleich aus (es passiert
   * nichts), die Ursache ist aber eine völlig andere: einmal muss er die Regel
   * bauen, einmal nur warten oder die Abklingzeit senken.
   */
  gebremsteRegeln(): GebremsteRegel[] {
    return this.zuletztGebremst;
  }

  /** Regeln, die beim letzten evaluate() gepasst hätten — nur eben
   *  ausgeschaltet sind. Gleicher Rückkanal-Gedanke wie gebremsteRegeln(). */
  ausgeschalteteTreffer(): GebremsteRegel[] {
    return this.zuletztAusgeschaltet;
  }

  /**
   * Timer-Regeln auswerten — pro Tick aufgerufen (z.B. jede Sekunde).
   * cooldownMs ist das Intervall; ohne cooldownMs feuert die Regel jeden Tick.
   */
  evaluateTimer(ts: number): TriggerMatch[] {
    const matches: TriggerMatch[] = [];
    for (const rule of this.rules) {
      if (!rule.enabled || rule.event !== 'timer') continue;
      if (rule.cooldownMs !== undefined) {
        const last = this.lastFired.get(rule.id);
        if (last !== undefined && ts - last < rule.cooldownMs) continue;
        this.lastFired.set(rule.id, ts);
      }
      for (const action of rule.actions) {
        matches.push({ ruleId: rule.id, action });
      }
    }
    return matches;
  }
}

/** Prüft, ob eine Nachricht mit dem Befehl beginnt (am Anfang, dann Ende oder
 *  Leerzeichen) — case-insensitive, führende ! egal. */
export function commandMatches(message: string, command: string): boolean {
  const cmd = command.trim().toLowerCase().replace(/^!*/, '');
  if (!cmd) return false;
  const msg = (message ?? '').trim().toLowerCase();
  return msg === `!${cmd}` || msg.startsWith(`!${cmd} `);
}

/** Erste aktivierte Einlösung, deren Befehl auf die Nachricht passt. */
export function matchRedemption(redemptions: Redemption[], message: string): Redemption | null {
  for (const r of redemptions) {
    if (r.enabled && commandMatches(message, r.command)) return r;
  }
  return null;
}

/** Chat-Befehl („Bot"): !befehl → Antwort (Overlay/TTS/Chat). */
export interface ChatCommand {
  id: string;
  /** Auslöse-Befehl, z.B. '!discord' (führende ! egal). */
  command: string;
  /** Antworttext mit Platzhaltern ({user} {text} …). */
  response: string;
  /** Antwort per TTS vorlesen. */
  speak: boolean;
  /** Antwort in den TikTok-Chat schreiben (braucht Login). */
  sendToChat: boolean;
  /** Mindest-Gruppe (Standard 'all'). */
  who?: 'all' | 'followers' | 'subs' | 'mods';
  /** Globaler Mindestabstand zwischen zwei Auslösungen (ms). */
  cooldownMs?: number;
  enabled: boolean;
}

/** Erster aktivierter Befehl, der auf die Nachricht passt. */
export function matchChatCommand(commands: ChatCommand[], message: string): ChatCommand | null {
  for (const c of commands) {
    if (c.enabled && commandMatches(message, c.command)) return c;
  }
  return null;
}

/** Füllt ein speak-Template mit Werten aus dem Event ({user} → Nickname usw.). */
export function renderSpeakTemplate(template: string, event: StudioEvent): string {
  return template
    .replace(/\{user\}/g, event.user?.nickname ?? 'Jemand')
    .replace(/\{text\}/g, event.text ?? '')
    // {args} = Chat-Text NACH dem ersten Wort (dem Befehl) — z.B. "!sr Song" → "Song".
    .replace(/\{args\}/g, (event.text ?? '').replace(/^\s*\S+\s*/, ''))
    .replace(/\{gift\}/g, event.gift?.slug ?? '')
    .replace(/\{count\}/g, String(event.gift?.count ?? ''))
    .replace(/\{coins\}/g, String(event.gift?.totalCoins ?? ''));
}

function conditionHolds(condition: TriggerCondition, event: StudioEvent): boolean {
  switch (condition.kind) {
    case 'gift_coins_gte':
      return event.gift !== undefined && event.gift.totalCoins >= condition.value;
    case 'gift_count_gte':
      return event.gift !== undefined && event.gift.count >= condition.value;
    case 'gift_slug_is':
      // Normalisiert (nur Buchstaben/Ziffern) — tolerant gegen Apostroph/Leer-
      // zeichen/Schreibweise, damit ein vorab gewähltes Gift sicher matcht.
      return event.gift !== undefined && giftKey(event.gift.slug) === giftKey(condition.value);
    case 'gift_id_is':
      return event.gift?.giftId === condition.value;
    case 'envelope_coins_gte':
      return (event.envelope?.coins ?? 0) >= condition.value;
    case 'envelope_superfan':
      return event.envelope?.superFan === true;
    case 'user_gegenseitig':
      return event.user?.isMutual === true;
    case 'user_hat_geschenkt':
      return event.user?.hatGeschenkt === true;
    case 'ehrengast_betritt': {
      if (!event.ehrengast) return false;
      const grenze = condition.value ?? 0;
      if (grenze <= 0) return true;
      // Ohne Platzangabe kann eine Platz-Grenze nicht erfüllt sein — sonst
      // würde „nur die ersten drei" jeden Ehrengast durchlassen, sobald TikTok
      // die Nummer einmal nicht mitschickt.
      const platz = event.ehrengast.platz ?? 0;
      return platz > 0 && platz <= grenze;
    }
    case 'superfan_neu':
      return event.superfanNeu === true;
    case 'superfan_verlaengerung':
      return event.superfanNeu === false;
    case 'superfan_monate_gte':
      return (event.subMonths ?? 0) >= condition.value;
    // Alle Beziehungs-Bedingungen: fehlt die Angabe, ist die Bedingung FALSCH.
    // Das `?? 0` sorgt genau dafür — value ist immer >= 1.
    case 'folgt_seit_tagen_gte':
      return (event.beziehung?.folgtSeitTagen ?? 0) >= condition.value;
    case 'fanclub_seit_tagen_gte':
      return (event.beziehung?.fanclubSeitTagen ?? 0) >= condition.value;
    case 'folgt_seit_heute':
      return event.beziehung?.folgtSeitHeute === true;
    case 'ist_top_gifter':
      return event.beziehung?.istTopGifter === true;
    case 'follower_count_gte':
      return (event.user?.followerCount ?? 0) >= condition.value;
    case 'sticker_ist':
      return (event.sticker ?? []).some((s) => s.id === condition.value);
    case 'chat_keyword':
      return (event.text ?? '').toLowerCase().includes(condition.value.toLowerCase()) && condition.value !== '';
    case 'chat_command':
      return commandMatches(event.text ?? '', condition.value);
    case 'chat_first_time':
      return event.firstOfUser === true;
    case 'follow_first_time':
      return event.firstFollow === true;
    case 'like_count_gte': {
      // Feuert genau beim KREUZEN der Schwelle (vorher darunter, jetzt darüber) —
      // nicht bei jedem weiteren Like-Batch oberhalb (sonst Alert-Spam).
      if (event.totalLikes === undefined) return false;
      const before = event.totalLikes - (event.likeCount ?? 0);
      return event.totalLikes >= condition.value && before < condition.value;
    }
    case 'viewer_count_gte':
      return event.viewerCount !== undefined && event.viewerCount >= condition.value;
  }
}
