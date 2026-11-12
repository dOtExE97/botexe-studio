// ereignis-alarm.js — Modus „Ereignisse" des Herz-Alarms.
//
// Der klassische Herz-Alarm (herz-alarm.js) reagiert auf EINEN Auslöser und
// bricht eine laufende Animation ab, wenn der nächste kommt. Dieser Modus ist
// „der eine Screen" für alle großen Momente im Live: Teamherz, Level-Up
// (Teamherz-/Geschenke-Stufe), Superfan-Abo, Superfan betritt, Truhe, VIP
// betritt und erreichtes LIVE-Ziel. Jede Art hat ihre eigene Animation
// (Live-Renderer aus alarm-anim.js, ein Herz-Motiv als WebM oder eine eigene
// Datei) und ihren eigenen Ton. Ereignisse laufen NACHEINANDER, höchstens zehn
// warten; was überläuft, wird verworfen und gemeldet.
//
// herz-alarm.js delegiert nur, wenn `props.modus === 'ereignisse'` — ohne das
// Prop (alle bestehenden Overlays) läuft exakt der alte Weg.
//
// ACHTUNG Ring-Import: herz-alarm.js → ereignis-alarm.js → alarm-anim.js →
// herz-alarm.js. Darum benutzt dieses Modul seine Importe NUR in Funktionen,
// nie auf oberster Ebene (dort wären sie je nach Einstiegsdatei noch nicht
// ausgewertet). Die Tabellen hier oben enthalten nur Text.

import { MOTIVE, GEBUENDELT, baueUrl, baueUserText, escapeHtml, trifftAusloeser, waehleMotiv, motivZuId, ensureStyle as ensureHerzStyle } from './herz-alarm.js';
import { ANIMATIONEN, erzeugeRenderer, ladeSchrift } from './alarm-anim.js';

/** Je Art die Prop-Namen ihrer Einstellungen (ausgeschrieben, damit der
 *  Feld-Wächter sie findet) und die Standard-Animation. */
const ARTEN = {
  teamherz: { anim: 'anim_teamherz', media: 'media_teamherz', sound: 'sound_teamherz', soundId: 'soundId_teamherz', std: 'motiv' },
  level_team: { anim: 'anim_level_team', media: 'media_level_team', sound: 'sound_level_team', soundId: 'soundId_level_team', std: 'lvl-tiktok-neon' },
  level_gifter: { anim: 'anim_level_gifter', media: 'media_level_gifter', sound: 'sound_level_gifter', soundId: 'soundId_level_gifter', std: 'lvl-tiktok-neon' },
  superfan: { anim: 'anim_superfan', media: 'media_superfan', sound: 'sound_superfan', soundId: 'soundId_superfan', std: 'superfan-premium' },
  superfan_betritt: { anim: 'anim_superfan_betritt', media: 'media_superfan_betritt', sound: 'sound_superfan_betritt', soundId: 'soundId_superfan_betritt', std: 'superfan-premium' },
  truhe: { anim: 'anim_truhe', media: 'media_truhe', sound: 'sound_truhe', soundId: 'soundId_truhe', std: 'truhe-premium' },
  vip: { anim: 'anim_vip', media: 'media_vip', sound: 'sound_vip', soundId: 'soundId_vip', std: 'vip-gold' },
  ziel: { anim: 'anim_ziel', media: 'media_ziel', sound: 'sound_ziel', soundId: 'soundId_ziel', std: 'ziel-erreicht' },
  // Follow = Piraten-Orakel: jeder neue Follower bekommt „seine" Kistennummer.
  follow: { anim: 'anim_follow', media: 'media_follow', sound: 'sound_follow', soundId: 'soundId_follow', std: 'piraten-orakel' },
};

/** Standard-Häkchen: VIP, Superfan betritt und Geschenke-Level-Up sind aus. */
const STANDARD_ARTEN = ['teamherz', 'level_team', 'superfan', 'truhe', 'ziel'];

/** Rückfall, wenn eine gewählte Animation (noch) nicht eingebaut ist. */
const ERSATZ_ANIMATION = 'lvl-tiktok-neon';

const MAX_WARTEND = 10;
const SUPERFAN_FENSTER_MS = 60_000;
const TRUHE_FENSTER_MS = 30_000;
const SCHRIFT_WARTEN_MS = 1500;
const BILD_DAUER_MS = 6000;
const AUSBLENDEN_MS = 300;

const ORAKEL_CHANCE = 137500;
const ORAKEL_MAX = 99_999_999;

/**
 * Kistennummer, in der „dein" Piraten-Token liegt: Wie viele Kisten öffnest du,
 * bis bei Chance 1 : `chance` pro Kiste der erste Treffer kommt? Das ist
 * geometrisch verteilt — Mittel ≈ chance, meist ein paar Tausend bis ein paar
 * Hunderttausend, ganz selten zweistellig (Glückspilz).
 */
export function wuerfleKiste(chance = ORAKEL_CHANCE, zufall = Math.random) {
  const c = Math.max(2, Math.round(Number(chance)) || ORAKEL_CHANCE);
  const u = Math.min(1 - 1e-12, Math.max(0, Number(zufall()) || 0));
  const n = Math.ceil(Math.log(1 - u) / Math.log(1 - 1 / c));
  return Math.max(1, Math.min(ORAKEL_MAX, Number.isFinite(n) ? n : 1));
}

const zahl = (v, std = 0) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : std; };

/** Props auf sichere Werte bringen. Ergebnis ist das `cfg` für alarmArt(). */
export function normalisiereCfg(props) {
  const p = props || {};
  const ereignisse = Array.isArray(p.ereignisse) ? p.ereignisse.filter((a) => a in ARTEN) : [...STANDARD_ARTEN];
  const anim = {}, media = {}, sound = {}, soundId = {};
  for (const [art, k] of Object.entries(ARTEN)) {
    anim[art] = typeof p[k.anim] === 'string' && p[k.anim] ? p[k.anim] : k.std;
    media[art] = typeof p[k.media] === 'string' ? p[k.media] : '';
    sound[art] = ['standard', 'custom', 'off'].includes(p[k.sound]) ? p[k.sound] : 'standard';
    soundId[art] = typeof p[k.soundId] === 'string' ? p[k.soundId] : '';
  }
  return {
    ereignisse: new Set(ereignisse),
    anim, media, sound, soundId,
    minLevel: Math.max(0, zahl(p.minLevel)),
    minLevelUp: Math.max(0, zahl(p.minLevelUp)),
    minVip: p.minVip === undefined || p.minVip === null || p.minVip === '' ? 20 : Math.max(0, zahl(p.minVip, 20)),
    superfanVerlaengert: p.superfanVerlaengert !== false,
    qualitaet: p.qualitaet === 'leicht' ? 'leicht' : 'voll',
    zeigeUser: p.showUser !== false,
    userText: p.userText != null ? p.userText : '💜 {name} ist Teil des Teams',
    orakelChance: Math.max(2, Math.min(ORAKEL_MAX, zahl(p.orakelChance, ORAKEL_CHANCE) || ORAKEL_CHANCE)),
    orakelGlueck: p.orakelGlueck === undefined || p.orakelGlueck === null || p.orakelGlueck === '' ? 1000 : Math.max(0, zahl(p.orakelGlueck, 1000)),
    orakelGroesse: Math.max(40, Math.min(100, zahl(p.orakelGroesse, 75) || 75)),
    orakelToken: typeof p.orakelToken === 'string' ? p.orakelToken : '',
    orakelKiste: typeof p.orakelKiste === 'string' ? p.orakelKiste : '',
  };
}

/** Doppelt-Sperren einer Widget-Instanz (Truhe, Superfan, VIP, LIVE-Ziel). */
export function neuerMerker() {
  return { truhen: new Map(), superfan: new Map(), vip: new Set(), ziele: new Set(), follower: new Set() };
}

function nutzerSchluessel(u) {
  return u ? String(u.id || u.uniqueId || u.nickname || '') : '';
}

/** Alte Einträge aus einer Zeit-Map werfen, sobald sie groß wird. */
function ausduennen(map, jetzt, fenster) {
  if (map.size <= 500) return;
  for (const [k, t] of map) if (jetzt - t > fenster) map.delete(k);
}

/** Welche Art ist das Ereignis — noch ohne Häkchen und Doppelt-Sperren? */
function rohArt(e, cfg) {
  switch (e.type) {
    case 'sub':
      // Superfan-Abo (TikToks bezahltes LIVE-Abo). superfanNeu fehlt → als neu werten.
      if (e.superfanNeu === false && !cfg.superfanVerlaengert) return null;
      return 'superfan';
    case 'superfan':
      if (e.superfanArt === 'betritt') return 'superfan_betritt';
      if (e.superfanArt === 'abo_neu') return 'superfan';
      if (e.superfanArt === 'abo_verlaengert') return cfg.superfanVerlaengert ? 'superfan' : null;
      return e.superfanNeu === true ? 'superfan' : null;
    case 'level_up': {
      const lu = e.levelUp || {};
      if (zahl(lu.neu) < cfg.minLevelUp) return null;
      return lu.art === 'gifter' ? 'level_gifter' : 'level_team';
    }
    case 'envelope':
      return 'truhe';
    case 'vip_betritt':
      return zahl(e.vip?.stufe) >= cfg.minVip ? 'vip' : null;
    case 'live_ziel':
      // Nur beim Sprung auf „erreicht" (Flanke bestimmt der Main-Prozess) — nicht
      // bei jedem weiteren Update eines schon erreichten Ziels. Die Sperre je
      // Ziel-id in alarmArt bleibt als zweites Netz.
      return e.ziel?.erreicht === true && e.ziel?.geradeErreicht === true ? 'ziel' : null;
    case 'follow':
      return 'follow';
    case 'gift':
      // Teamherz kommt hier NUR als Geschenk: `sub` ist im Ereignis-Modus das Superfan-Abo.
      return trifftAusloeser(e, 'teamherz', cfg.minLevel) ? 'teamherz' : null;
    default:
      return null;
  }
}

/**
 * Ordnet ein Ereignis einer Alarm-Art zu (oder null). Nur Arten mit Häkchen
 * (`cfg.ereignisse`) zählen. Mit `merker` greifen die Doppelt-Sperren:
 * Truhe über envelopeId (sonst Name+Coins 30 s), Superfan je Nutzer 60 s,
 * VIP je Nutzer einmal, LIVE-Ziel einmal je Ziel-id.
 */
export function alarmArt(event, cfg, merker, jetzt = Date.now()) {
  if (!event || typeof event !== 'object' || event.sticky || !cfg) return null;
  const art = rohArt(event, cfg);
  if (!art || !cfg.ereignisse.has(art)) return null;
  if (!merker) return art;
  if (art === 'truhe') {
    const env = event.envelope || {};
    const id = String(env.envelopeId ?? '').trim();
    const key = id ? `id:${id}` : `nc:${event.user?.nickname ?? ''}|${zahl(env.coins)}`;
    const zuletzt = merker.truhen.get(key);
    if (zuletzt !== undefined && (id || jetzt - zuletzt < TRUHE_FENSTER_MS)) return null;
    merker.truhen.set(key, jetzt);
    ausduennen(merker.truhen, jetzt, 10 * 60_000);
  } else if (art === 'superfan') {
    const key = nutzerSchluessel(event.user);
    if (key) {
      const zuletzt = merker.superfan.get(key);
      if (zuletzt !== undefined && jetzt - zuletzt < SUPERFAN_FENSTER_MS) return null;
      merker.superfan.set(key, jetzt);
      ausduennen(merker.superfan, jetzt, SUPERFAN_FENSTER_MS);
    }
  } else if (art === 'vip') {
    const key = nutzerSchluessel(event.user);
    if (key) {
      if (merker.vip.has(key)) return null;
      merker.vip.add(key);
    }
  } else if (art === 'follow') {
    // Je Zuschauer einmal pro Stream — Entfolgen und neu Folgen würfelt nicht neu.
    const key = nutzerSchluessel(event.user);
    if (key) {
      if (merker.follower.has(key)) return null;
      merker.follower.add(key);
      if (merker.follower.size > 20000) merker.follower.clear();
    }
  } else if (art === 'ziel') {
    const key = String(event.ziel?.id ?? '');
    if (merker.ziele.has(key)) return null;
    merker.ziele.add(key);
  }
  return art;
}

/** Wartende Alarme, der Reihe nach. `rein` gibt false, wenn sie voll ist. */
export class Warteschlange {
  constructor(max = MAX_WARTEND) { this.max = max; this.liste = []; }
  rein(eintrag) {
    if (this.liste.length >= this.max) return false;
    this.liste.push(eintrag);
    return true;
  }
  raus() { return this.liste.shift(); }
  get laenge() { return this.liste.length; }
  leeren() { this.liste.length = 0; }
}

/** Gewählte Live-Animation, oder der Rückfall, wenn sie nicht eingebaut ist. */
export function waehleAnimation(id, katalog) {
  if (katalog && Object.prototype.hasOwnProperty.call(katalog, id)) return { id, ersatz: false };
  return { id: ERSATZ_ANIMATION, ersatz: true };
}

const kuerze = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** Superfan-Abo-Ereignis eine Verlängerung? (sub: superfanNeu === false; superfan: abo_verlaengert) */
function superfanVerlaengert(e) {
  return e?.type === 'sub' ? e.superfanNeu === false : e?.superfanArt === 'abo_verlaengert';
}

/** Daten für den Renderer aus Art + Ereignis (TikTok lässt Felder weg).
 *  `extra` trägt beim Follow die gewürfelte Kiste und die Orakel-Einstellungen. */
export function alarmDaten(art, e, extra = {}) {
  const u = (e && e.user) || {};
  const d = { name: String(u.nickname || u.uniqueId || ''), bild: typeof u.profilePic === 'string' ? u.profilePic : '' };
  switch (art) {
    case 'teamherz':
      return { ...d, art: 'team', ...(u.teamLevel ? { neu: zahl(u.teamLevel) } : {}) };
    case 'level_team':
    case 'level_gifter': {
      const neu = zahl(e?.levelUp?.neu, 1);
      return { ...d, art: art === 'level_gifter' ? 'gifter' : 'team', neu, alt: Math.max(0, neu - 1) };
    }
    case 'superfan':
      // Neu-Abo: Kopfzeile „NEUER" über „SUPERFAN", Unterzeile bleibt der
      // Renderer-Standard „WILLKOMMEN IM SUPERFAN-CLUB" (wie in der Probe).
      return superfanVerlaengert(e) ? { ...d, unterzeile: 'SUPERFAN VERLÄNGERT' } : { ...d, neuAbo: true };
    case 'superfan_betritt':
      return { ...d, unterzeile: 'SUPERFAN IST DA' };
    case 'truhe': {
      const env = e?.envelope || {};
      return { ...d, coins: zahl(env.coins), ...(env.superFan ? { unterzeile: 'SUPERFAN-TRUHE' } : {}) };
    }
    case 'vip': {
      const stufe = zahl(e?.vip?.stufe);
      return { ...d, art: 'gifter', stufe, neu: stufe, titel: 'VIP IST DA', unterzeile: `GESCHENKE-STUFE ${stufe}` };
    }
    case 'ziel': {
      const z = e?.ziel || {};
      return {
        ...d, titel: 'ZIEL ERREICHT!', fortschritt: zahl(z.fortschritt), ziel: zahl(z.ziel),
        unterzeile: kuerze(z.geschenk?.name || z.beschreibung || '', 32).toUpperCase(),
      };
    }
    case 'follow':
      return {
        ...d, kiste: extra.kiste ?? 1, chance: extra.chance ?? ORAKEL_CHANCE, glueckBis: extra.glueckBis ?? 1000,
        groesse: extra.groesse ?? 75, tokenBild: extra.tokenBild || '', kisteBild: extra.kisteBild || '',
      };
    default:
      return d;
  }
}

/** 84213 → „84.213". */
const tausender = (n) => String(Math.max(0, Math.round(Number(n) || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Text der HTML-Namensleiste (bei Motiv-Video oder eigener Datei). Escaped. */
function leistenText(art, e, cfg, extra) {
  const d = alarmDaten(art, e, extra);
  const n = escapeHtml(d.name || 'Jemand');
  switch (art) {
    case 'teamherz': return baueUserText(cfg.userText, d.name);
    case 'level_team': return `💜 ${n} · Teamherz-Stufe ${d.neu}`;
    case 'level_gifter': return `🏅 ${n} · Geschenke-Stufe ${d.neu}`;
    case 'superfan': return superfanVerlaengert(e) ? `⭐ ${n} verlängert Superfan` : `⭐ ${n} ist neuer Superfan`;
    case 'superfan_betritt': return `⭐ Superfan ${n} ist da`;
    case 'truhe': return `🎁 ${n} schickt eine Truhe${d.coins ? ` (${d.coins} Coins)` : ''}`;
    case 'vip': return `👑 VIP ${n} ist da`;
    case 'ziel': return `🎯 LIVE-Ziel erreicht${d.ziel ? ` (${d.fortschritt}/${d.ziel})` : ''}`;
    case 'follow': return `🏴‍☠️ ${n} · Token in Kiste Nr. ${tausender(d.kiste)}`;
    default: return n;
  }
}

/** Deutsche Demo-Ereignisse für die Editor-Vorschau. */
function demoEreignis(art) {
  const user = { id: 'demo-mia', nickname: 'Mia', teamLevel: 12 };
  switch (art) {
    case 'teamherz': return { type: 'gift', gift: { giftId: 7934 }, user };
    case 'level_team': return { type: 'level_up', levelUp: { art: 'team', neu: 12 }, user };
    case 'level_gifter': return { type: 'level_up', levelUp: { art: 'gifter', neu: 12 }, user };
    case 'superfan': return { type: 'sub', superfanNeu: true, user };
    case 'superfan_betritt': return { type: 'superfan', superfanArt: 'betritt', user };
    case 'truhe': return { type: 'envelope', envelope: { coins: 500 }, user };
    case 'vip': return { type: 'vip_betritt', vip: { stufe: 25 }, user };
    case 'follow': return { type: 'follow', user };
    case 'ziel': return { type: 'live_ziel', ziel: { id: 'demo', fortschritt: 12, ziel: 12, geschenk: { name: 'Rose' }, erreicht: true, geradeErreicht: true }, user };
    default: return { type: 'level_up', levelUp: { art: 'team', neu: 12 }, user };
  }
}

const VIDEO_ENDUNG = /\.(mp4|webm|mov|m4v|ogv)(\?|$)/i;

const STYLE_ID = 'bx-ea-style';
// Baut auf der Herz-Alarm-Basis (.bx-hz, Video, Namensleiste) auf; hier nur
// Leinwand und Standbild der eigenen Datei.
const CSS = `
.bx-ea .bx-ea-canvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
.bx-ea .bx-ea-bild { position:absolute; inset:0; width:100%; height:100%; object-fit:contain;
  opacity:0; transition:opacity .25s ease; }
.bx-ea.an.zeigt-bild .bx-ea-bild { opacity:1; }
.bx-ea.zeigt-canvas .bx-hz-user { display:none; }
`;

function ensureStyle() {
  ensureHerzStyle();
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

const jetztMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

export default class EreignisAlarm {
  constructor(root, props, ctx) {
    ensureStyle();
    this.root = root;
    this.ctx = ctx || {};
    this.props = props || {};
    this.cfg = normalisiereCfg(this.props);
    if (this.props.accent) root.style.setProperty('--bx-accent', this.props.accent);
    this.schlange = new Warteschlange(MAX_WARTEND);
    this.merker = neuerMerker();
    this.aktuell = null;
    this.zerstoert = false;
    this.timers = new Set();
    this.raf = 0;
    this.renderer = null;
    this.gemeldet = new Map();
    this.schrift = null;
    this.w = 0; this.h = 0;
    this.letzteMotiv = null;
    this.demoNr = 0;
    this.verfuegbar = [...GEBUENDELT];
    this.ladeVerfuegbare();
    // Token-/Kistenbild vorladen: sonst zeigt der erste Follow ein paar Bilder
    // lang die gezeichnete Truhe, bis das Bild da ist.
    this.vorgeladen = [];
    if (this.cfg.ereignisse.has('follow') && typeof Image !== 'undefined') {
      for (const id of [this.cfg.orakelToken, this.cfg.orakelKiste]) {
        if (!id) continue;
        try { const i = new Image(); i.src = baueUrl(this.ctx.baseUrl, this.ctx.token, `/media/${encodeURIComponent(id)}`); this.vorgeladen.push(i); } catch { /* egal */ }
      }
    }

    this.el = document.createElement('div');
    this.el.className = `bx-hz bx-ea${this.cfg.zeigeUser ? '' : ' ohne-user'}`;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bx-ea-canvas';
    this.el.appendChild(this.canvas);
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.el.appendChild(this.video);
    this.bild = document.createElement('img');
    this.bild.className = 'bx-ea-bild';
    this.bild.alt = '';
    this.el.appendChild(this.bild);
    this.userEl = document.createElement('div');
    this.userEl.className = 'bx-hz-user';
    this.userEl.innerHTML = '<img class="bx-hz-pic leer" alt=""><span class="bx-hz-text"></span>';
    this.picEl = this.userEl.querySelector('.bx-hz-pic');
    this.textEl = this.userEl.querySelector('.bx-hz-text');
    this.el.appendChild(this.userEl);
    root.appendChild(this.el);

    this.beiVideoEnde = () => { if (this.aktuell && this.aktuell.plan?.typ !== 'canvas') this.fertig(this.aktuell); };
    this.beiVideoFehler = () => {
      const e = this.aktuell;
      if (!e || e.plan?.typ === 'canvas' || e.plan?.typ === 'bild') return;
      this.melde(`video:${e.plan?.url}`, `Ereignis-Alarm: Video für „${e.art}" ließ sich nicht abspielen — übersprungen.`);
      this.fertig(e);
    };
    this.beiMetadaten = () => {
      const e = this.aktuell;
      const d = Number(this.video.duration);
      if (e && e.plan?.typ === 'datei' && Number.isFinite(d) && d > 0) this.sicherheitsAus(e, d * 1000 + 1500);
    };
    this.video.addEventListener('ended', this.beiVideoEnde);
    this.video.addEventListener('error', this.beiVideoFehler);
    this.video.addEventListener('loadedmetadata', this.beiMetadaten);

    if (typeof ResizeObserver !== 'undefined') {
      try { this.ro = new ResizeObserver(() => this.messe()); this.ro.observe(root); } catch { this.ro = null; }
    }
    this.messe();

    if (this.ctx.preview) this.naechsteDemo();
  }

  // ---------------------------------------------------------------- Hilfen ---

  /** Meldung ins App-Log, je Schlüssel höchstens einmal pro Minute. */
  melde(schluessel, text) {
    const t = Date.now();
    const zuletzt = this.gemeldet.get(schluessel);
    if (zuletzt !== undefined && t - zuletzt < 60_000) return;
    this.gemeldet.set(schluessel, t);
    if (this.gemeldet.size > 200) this.gemeldet.clear();
    try { this.ctx.notify?.(text); } catch { /* nie eskalieren */ }
  }

  /** Boxgröße messen. Gibt false, solange die Ebene ausgeblendet ist (0×0). */
  messe() {
    const r = this.root.getBoundingClientRect ? this.root.getBoundingClientRect() : null;
    const w = r ? r.width : 0, h = r ? r.height : 0;
    if (!(w > 0) || !(h > 0)) { this.w = 0; this.h = 0; return false; }
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const k = dpr * (this.cfg.qualitaet === 'leicht' ? 0.5 : 1);
    const cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
    if (this.canvas.width !== cw) this.canvas.width = cw;
    if (this.canvas.height !== ch) this.canvas.height = ch;
    this.w = cw; this.h = ch;
    return true;
  }

  zeitgeber(fn, ms) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
    return t;
  }

  sicherheitsAus(eintrag, ms) {
    if (eintrag.sicherheit) { clearTimeout(eintrag.sicherheit); this.timers.delete(eintrag.sicherheit); }
    eintrag.sicherheit = this.zeitgeber(() => this.fertig(eintrag), ms);
  }

  /** Inter Black laden, aber höchstens 1,5 s darauf warten (dann Ersatzschrift). */
  bereitSchrift() {
    if (!this.schrift) {
      this.schrift = Promise.race([
        Promise.resolve().then(() => ladeSchrift(this.ctx.baseUrl, this.ctx.token)).catch(() => {}),
        // Bewusst NICHT über this.timers: stoppe() würde den Rückfall sonst
        // löschen, und hängt das Laden, käme nie wieder eine Live-Animation.
        new Promise((ok) => setTimeout(ok, SCHRIFT_WARTEN_MS)),
      ]);
    }
    return this.schrift;
  }

  /** Installierte Herz-Motive (gebündelt + Zusatzpaket) vom Server holen. */
  ladeVerfuegbare() {
    const url = baueUrl(this.ctx.baseUrl, this.ctx.token, '/herz-anim-index');
    if (!url || typeof fetch !== 'function') return;
    fetch(url)
      .then((r) => (r.ok ? r.json() : []))
      .then((liste) => {
        if (!Array.isArray(liste) || this.zerstoert) return;
        const da = new Set(liste.map((e) => e && e.id).filter(Boolean));
        for (const g of GEBUENDELT) da.add(g);
        const neu = MOTIVE.filter((m) => da.has(m.id)).map((m) => m.id);
        if (neu.length) this.verfuegbar = neu;
      })
      .catch(() => { /* Server weg — gebündelte reichen */ });
  }

  // ------------------------------------------------------------- Ereignisse ---

  onEvent(event) {
    if (this.zerstoert || !event || event.sticky) return;
    if (this.ctx.preview) return; // Vorschau zeigt ihre Demo-Schleife
    const art = alarmArt(event, this.cfg, this.merker);
    if (!art) return;
    this.einreihen({ art, event });
  }

  einreihen(eintrag) {
    // Die Kiste wird beim Eintreffen gewürfelt, nicht erst beim Abspielen —
    // so steht die Zahl fest, auch wenn der Alarm in der Warteschlange wartet.
    if (eintrag.art === 'follow' && !eintrag.extra) eintrag.extra = this.orakelExtra();
    if (!this.aktuell) { this.starte(eintrag); return; }
    if (!this.schlange.rein(eintrag)) {
      const name = eintrag.event?.user?.nickname || 'Jemand';
      this.melde('ueberlauf', `Ereignis-Alarm: ${MAX_WARTEND} Alarme warten schon — „${eintrag.art}" von ${name} verworfen.`);
    }
  }

  /** Gewürfelte Kiste + Orakel-Einstellungen (Bilder aus der Medien-Bibliothek). */
  orakelExtra() {
    const c = this.cfg;
    const url = (id) => (id ? baueUrl(this.ctx.baseUrl, this.ctx.token, `/media/${encodeURIComponent(id)}`) : '');
    return {
      kiste: wuerfleKiste(c.orakelChance), chance: c.orakelChance, glueckBis: c.orakelGlueck,
      groesse: c.orakelGroesse, tokenBild: url(c.orakelToken), kisteBild: url(c.orakelKiste),
    };
  }

  /** Was wird gespielt? → { typ:'canvas', id } | { typ:'motiv', url } | { typ:'datei'|'bild', url } */
  plane(art) {
    let wahl = this.cfg.anim[art];
    if (wahl === 'eigen') {
      const id = this.cfg.media[art];
      if (id) {
        const url = baueUrl(this.ctx.baseUrl, this.ctx.token, `/media/${encodeURIComponent(id)}`);
        return { typ: VIDEO_ENDUNG.test(id) ? 'datei' : 'bild', url };
      }
      this.melde(`eigen-leer:${art}`, `Ereignis-Alarm: Für „${art}" ist „Eigene Datei" gewählt, aber keine Datei — spiele die Standard-Animation.`);
      wahl = ARTEN[art].std;
    }
    if (wahl === 'motiv' || wahl.startsWith('motiv:')) {
      const wunsch = wahl === 'motiv' ? 'rotation' : wahl.slice(6);
      const id = waehleMotiv(wunsch, this.letzteMotiv, this.verfuegbar) || GEBUENDELT[0];
      this.letzteMotiv = id;
      return { typ: 'motiv', url: baueUrl(this.ctx.baseUrl, this.ctx.token, `/herz-anim/${motivZuId(id).datei}`) };
    }
    const a = waehleAnimation(wahl, ANIMATIONEN);
    if (a.ersatz) this.melde(`ersatz:${wahl}`, `Ereignis-Alarm: Animation „${wahl}" gibt es (noch) nicht — spiele „${a.id}".`);
    return { typ: 'canvas', id: a.id };
  }

  starte(eintrag) {
    this.aktuell = eintrag;
    if (eintrag.art === 'follow' && !eintrag.extra) eintrag.extra = this.orakelExtra();
    try {
      eintrag.plan = this.plane(eintrag.art);
      const plan = eintrag.plan;
      const stumm = !!this.ctx.preview || this.cfg.sound[eintrag.art] !== 'standard';
      this.el.classList.toggle('zeigt-canvas', plan.typ === 'canvas');
      this.el.classList.toggle('zeigt-bild', plan.typ === 'bild');
      if (plan.typ === 'canvas') {
        // Erst die Schrift (max. 1,5 s), dann der Renderer — sonst backt er
        // seine Textebenen mit der Ersatzschrift.
        this.bereitSchrift().then(() => {
          if (this.aktuell !== eintrag || this.zerstoert) return;
          this.starteCanvas(eintrag, stumm);
        });
        return;
      }
      this.setzeLeiste(eintrag);
      if (plan.typ === 'bild') {
        this.bild.src = plan.url;
        this.el.classList.add('an');
        this.eigenerSound(eintrag);
        this.sicherheitsAus(eintrag, BILD_DAUER_MS);
        return;
      }
      // Herz-Motiv oder eigenes Video: Ton steckt im Video („standard").
      this.video.loop = false;
      this.video.muted = stumm;
      this.video.src = plan.url;
      this.video.currentTime = 0;
      this.el.classList.add('an');
      const p = this.video.play();
      if (p && p.catch) p.catch(() => { /* Autoplay evtl. blockiert — Bild läuft trotzdem */ });
      this.eigenerSound(eintrag);
      // Motive sind 6 s; eigene Videos verlängern das per loadedmetadata.
      this.sicherheitsAus(eintrag, plan.typ === 'motiv' ? 8000 : 20_000);
    } catch (err) {
      this.abbruch(eintrag, err);
    }
  }

  eigenerSound(eintrag) {
    if (this.ctx.preview) return;
    if (this.cfg.sound[eintrag.art] === 'custom' && this.cfg.soundId[eintrag.art]) this.ctx.playSound?.(this.cfg.soundId[eintrag.art]);
  }

  setzeLeiste(eintrag) {
    if (!this.cfg.zeigeUser) return;
    this.textEl.innerHTML = leistenText(eintrag.art, eintrag.event, this.cfg, eintrag.extra);
    const pic = eintrag.event?.user?.profilePic;
    if (pic) { this.picEl.src = pic; this.picEl.classList.remove('leer'); }
    else { this.picEl.removeAttribute('src'); this.picEl.classList.add('leer'); }
  }

  starteCanvas(eintrag, stumm) {
    try {
      const id = eintrag.plan.id;
      this.renderer = erzeugeRenderer(id, alarmDaten(eintrag.art, eintrag.event, eintrag.extra));
      const dauer = Number(this.renderer.dauer) > 0 ? Number(this.renderer.dauer) : 6;
      const g = this.canvas.getContext('2d');
      if (!g) throw new Error('kein 2D-Kontext');
      this.el.classList.add('an');
      if (!stumm) this.ctx.playSound?.(ANIMATIONEN[id]?.sound);
      else this.eigenerSound(eintrag);
      this.sicherheitsAus(eintrag, dauer * 1000 + 1500);
      const start = jetztMs();
      const leicht = this.cfg.qualitaet === 'leicht';
      let zuletzt = -Infinity;
      const naechstes = (fn) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16));
      const bild = () => {
        this.raf = 0;
        if (this.aktuell !== eintrag || this.zerstoert) return;
        try {
          const jetzt = jetztMs();
          const t = (jetzt - start) / 1000;
          if (t >= dauer) { this.fertig(eintrag); return; }
          // Leicht: höchstens ~30 Bilder/s.
          if (!leicht || jetzt - zuletzt >= 32) {
            zuletzt = jetzt;
            // Nichts zeichnen ohne vermessene Fläche (ausgeblendete Ebene).
            if ((this.w && this.h) || this.messe()) this.renderer.zeichne(g, t, this.w, this.h);
          }
          this.raf = naechstes(bild);
        } catch (err) {
          // Sperre lösen, Eintrag verwerfen, NICHT weiterplanen.
          this.abbruch(eintrag, err);
        }
      };
      bild();
    } catch (err) {
      this.abbruch(eintrag, err);
    }
  }

  abbruch(eintrag, err) {
    const id = eintrag?.plan?.id || eintrag?.plan?.typ || '?';
    this.melde(`fehler:${id}`, `Ereignis-Alarm: Animation „${id}" für „${eintrag?.art}" abgebrochen (${err && err.message ? err.message : String(err)}) — nächster Alarm läuft weiter.`);
    this.fertig(eintrag, true);
  }

  /** Aktuellen Alarm beenden, ausblenden, danach den nächsten starten. */
  fertig(eintrag, sofort = false) {
    if (!eintrag || this.aktuell !== eintrag || eintrag.endet) return;
    eintrag.endet = true;
    if (eintrag.sicherheit) { clearTimeout(eintrag.sicherheit); this.timers.delete(eintrag.sicherheit); }
    this.stoppeRaf();
    this.el.classList.remove('an');
    this.zeitgeber(() => {
      this.raeumeAuf();
      if (this.aktuell !== eintrag) return;
      this.aktuell = null;
      if (this.zerstoert) return;
      const naechster = this.schlange.raus();
      if (naechster) this.starte(naechster);
      else if (this.ctx.preview) this.zeitgeber(() => this.naechsteDemo(), 600);
    }, sofort ? 0 : AUSBLENDEN_MS);
  }

  stoppeRaf() {
    if (!this.raf) return;
    try {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
      clearTimeout(this.raf);
    } catch { /* egal */ }
    this.raf = 0;
  }

  raeumeAuf() {
    if (this.renderer) { try { this.renderer.destroy(); } catch { /* egal */ } this.renderer = null; }
    try { const g = this.canvas.getContext('2d'); if (g) g.clearRect(0, 0, this.canvas.width, this.canvas.height); } catch { /* egal */ }
    try { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); } catch { /* egal */ }
    try { this.bild.removeAttribute('src'); } catch { /* egal */ }
    this.el.classList.remove('zeigt-canvas', 'zeigt-bild');
  }

  /** Editor-Vorschau: reihum die angehakten Arten mit Demo-Daten, stumm. */
  naechsteDemo() {
    if (this.zerstoert || this.aktuell) return;
    const arten = Object.keys(ARTEN).filter((a) => this.cfg.ereignisse.has(a));
    const liste = arten.length ? arten : ['level_team'];
    const art = liste[this.demoNr++ % liste.length];
    this.starte({ art, event: demoEreignis(art), demo: true });
  }

  /** Alles Laufende sofort beenden (Reset/Abbau). */
  stoppe() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.stoppeRaf();
    this.schlange.leeren();
    this.aktuell = null;
    this.el.classList.remove('an');
    this.raeumeAuf();
  }

  onReset() {
    // Neuer Stream: Warteschlange weg, Doppelt-Sperren (VIP einmal je Stream) neu.
    this.stoppe();
    this.merker = neuerMerker();
    if (this.ctx.preview && !this.zerstoert) this.naechsteDemo();
  }

  destroy() {
    this.zerstoert = true;
    this.stoppe();
    try { this.ro?.disconnect(); } catch { /* egal */ }
    this.video.removeEventListener('ended', this.beiVideoEnde);
    this.video.removeEventListener('error', this.beiVideoFehler);
    this.video.removeEventListener('loadedmetadata', this.beiMetadaten);
    this.el.remove();
  }
}
