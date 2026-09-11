// herz-alarm.js — Vollbild-Alert mit transparenten 3D-Herz-Animationen.
//
// Zeigt bei einem Auslöser (standardmäßig Teamherz) eine 6-Sekunden-Animation
// formatfüllend über dem Videobild und blendet sich danach selbst wieder aus.
// Die Clips sind transparente WebM (VP9 + Alpha) — Chromium und der
// OBS-/TTLS-Browser stellen den Alpha-Kanal echt transparent dar (nachgewiesen
// auf buntem Grund: kein schwarzer Kasten). Der Ton steckt als Opus-Spur IM
// WebM; „Original-Sound" heißt darum schlicht: das Video nicht stummschalten.
//
// props: {
//   motiv?: 'rotation' | 'royal' | 'kiss' | 'angel'   (rotation = Standard)
//   sound?: 'original' | 'custom' | 'off'
//   soundId?: string                                   (nur bei sound='custom')
//   event?: 'teamherz' | 'gift' | 'follow' | 'sub'     (teamherz = Standard)
//   minLevel?: number                                  (nur bei event='teamherz')
//   showUser?: boolean                                 (Name + Profilbild zeigen)
//   userText?: string                                  ({name} = Nickname des Gebers)
// }
//
// Die drei Motive sind mit der App gebündelt (assets/herz-anim/*.webm) und
// werden vom Overlay-Server unter /herz-anim/<datei> ausgeliefert. Sechs weitere
// (Collection 02) holt ein Knopf im Panel als Zusatzpaket von einem
// GitHub-Release (herz-pack.ts) in denselben Ordner — deshalb ist MOTIVE ein
// Katalog und das Widget fragt per /herz-anim-index, welche wirklich da sind.

// Die Geschenk-Nummer des Teamherzens bei TikTok. KOPIE von TEAMHERZ_GIFT_ID in
// apps/desktop/src/main/services/intro.ts — reines JS kann die TypeScript-Seite
// nicht importieren; ein Test hält beide Zahlen gleich.
const TEAMHERZ_GIFT_ID = 7934;

/** Der KATALOG aller bekannten Motive, in Rotations-Reihenfolge. Die ersten
 *  drei sind gebündelt (immer da); die restlichen sechs kommen per Zusatzpaket
 *  (Knopf im Panel) in denselben /herz-anim/-Ordner. `gebuendelt` markiert, was
 *  ohne Download verfügbar ist. */
export const MOTIVE = [
  { id: 'royal', datei: 'royal.webm', label: 'Royal Boss', gebuendelt: true },
  { id: 'kiss', datei: 'kiss.webm', label: 'Kiss Flight', gebuendelt: true },
  { id: 'angel', datei: 'angel.webm', label: 'Angel Crown', gebuendelt: true },
  { id: 'neon-dj', datei: 'neon-dj.webm', label: 'Neon DJ' },
  { id: 'cyber-gamer', datei: 'cyber-gamer.webm', label: 'Cyber Gamer' },
  { id: 'solar-hero', datei: 'solar-hero.webm', label: 'Solar Hero' },
  { id: 'rockstar', datei: 'rockstar.webm', label: 'Rockstar' },
  { id: 'galaxy-rider', datei: 'galaxy-rider.webm', label: 'Galaxy Rider' },
  { id: 'golden-jackpot', datei: 'golden-jackpot.webm', label: 'Golden Jackpot' },
];

/** Die ohne Download vorhandenen Motiv-ids — der sichere Rückfall, solange die
 *  Liste der tatsächlich installierten Motive (index) noch nicht geladen ist. */
export const GEBUENDELT = MOTIVE.filter((m) => m.gebuendelt).map((m) => m.id);

/** HTML-Escape für den Nickname (kommt von TikTok, gehört nie roh ins DOM). */
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Anzeigetext aus der Vorlage bauen. `{name}` → Nickname (bereits escaped).
 *  Fehlt die Vorlage, wird nur der Name gezeigt; fehlt der Name, „Jemand". */
export function baueUserText(vorlage, nickname) {
  const name = escapeHtml(nickname || 'Jemand');
  const v = String(vorlage ?? '').trim();
  if (!v) return name;
  return escapeHtml(v).replace(/\{name\}/g, name);
}

/** Trifft ein Ereignis den eingestellten Auslöser? Reine Logik → testbar.
 *  Teamherz ist die Falle: TikTok schickt es ENTWEDER als Fanclub-Sub
 *  (`type:'sub'`) ODER als Gift mit der Teamherz-Nummer — beide zählen. Die
 *  Mindeststufe greift nur beim Teamherz und nur, wenn eine Stufe bekannt ist. */
export function trifftAusloeser(event, art, minLevel = 0) {
  if (!event) return false;
  if (art === 'teamherz') {
    const istTeamherz = event.type === 'sub' || (event.type === 'gift' && Number(event.gift?.giftId) === TEAMHERZ_GIFT_ID);
    if (!istTeamherz) return false;
    if (minLevel > 0) {
      const stufe = Number(event.user?.teamLevel ?? 0);
      // Ohne bekannte Stufe NICHT feuern, wenn eine Mindeststufe verlangt ist —
      // sonst löst jeder Teamherz aus, obwohl der Streamer ab Stufe X wollte.
      return stufe >= minLevel;
    }
    return true;
  }
  return event.type === art;
}

/** Welches Motiv kommt als Nächstes?
 *
 *  Arbeitet über die Liste der TATSÄCHLICH vorhandenen Motiv-ids (`verfuegbar`,
 *  in Katalog-Reihenfolge). Ein fester Wunsch gewinnt — aber nur, wenn das Motiv
 *  auch da ist; sonst fällt es auf die Rotation zurück (z.B. ein Pack-Motiv
 *  gewählt, aber Pack nicht geladen). „rotation" läuft der Reihe nach, damit
 *  sich nichts wiederholt, bis alle durch sind. Gibt die nächste id zurück oder
 *  null, wenn gar nichts verfügbar ist. */
export function waehleMotiv(motivWunsch, letzteId, verfuegbar) {
  if (!verfuegbar || verfuegbar.length === 0) return null;
  if (motivWunsch && motivWunsch !== 'rotation' && verfuegbar.includes(motivWunsch)) return motivWunsch;
  const i = verfuegbar.indexOf(letzteId);
  return verfuegbar[(i + 1) % verfuegbar.length];
}

/** Motiv-Objekt aus dem Katalog zu einer id. */
export function motivZuId(id) {
  return MOTIVE.find((m) => m.id === id) || MOTIVE[0];
}

const STYLE_ID = 'bx-hz-style';
// --u = „1px bei Standardhöhe" analog zu den anderen Widgets, damit Avatar und
// Text mitwachsen, wenn die Box größer gezogen wird.
const CSS = `
.bx-hz { position:absolute; inset:0; overflow:hidden; pointer-events:none;
  container-type:size; --u: calc(min(0.09cqi, 0.052cqh)); font-family: var(--bx-font-body); }
/* Das Video füllt die Box formatgetreu (9:16). object-fit:contain, damit auf
   quadratischen/breiten Boxen nichts abgeschnitten wird — die Figur bleibt ganz. */
.bx-hz video { position:absolute; inset:0; width:100%; height:100%; object-fit:contain;
  opacity:0; transition:opacity .25s ease; }
.bx-hz.an video { opacity:1; }

/* Name + Profilbild des Gebers — eine Leiste unten mittig, blendet mit der
   Animation ein. Steht auf dem Videobild, darum eigene Kontur/Schatten, damit
   sie auf jeder Szene lesbar bleibt. */
.bx-hz-user { position:absolute; left:50%; bottom:6%; transform:translateX(-50%) translateY(calc(var(--u) * 30));
  display:flex; align-items:center; gap:calc(var(--u) * 14);
  padding:calc(var(--u) * 10) calc(var(--u) * 26) calc(var(--u) * 10) calc(var(--u) * 10);
  border-radius:999px; max-width:86%; opacity:0;
  background:linear-gradient(180deg, rgba(20,16,28,.82), rgba(10,8,16,.86));
  box-shadow:0 calc(var(--u) * 6) calc(var(--u) * 20) rgba(0,0,0,.5), inset 0 0 0 1px color-mix(in srgb, var(--bx-accent) 45%, transparent);
  transition:opacity .3s ease .1s, transform .3s cubic-bezier(.2,1.4,.3,1) .1s; }
.bx-hz.an .bx-hz-user { opacity:1; transform:translateX(-50%) translateY(0); }
.bx-hz.ohne-user .bx-hz-user { display:none; }
.bx-hz-pic { flex:none; width:calc(var(--u) * 66); height:calc(var(--u) * 66); border-radius:50%;
  object-fit:cover; background:#2a2233; box-shadow:0 0 0 calc(var(--u) * 3) color-mix(in srgb, var(--bx-accent) 70%, transparent); }
.bx-hz-pic.leer { display:none; }
.bx-hz-text { font-family:var(--bx-font-display); font-weight:800; color:#fff;
  font-size:calc(var(--u) * 30); line-height:1.05; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  -webkit-text-stroke:calc(var(--u) * 2) var(--bx-ink, #0a0b12); paint-order:stroke fill;
  text-shadow:0 0 calc(var(--u) * 14) color-mix(in srgb, var(--bx-accent) 55%, transparent); }
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

export default class HerzAlarm {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    this.props = props || {};
    // Akzentfarbe (Rand/Schein der Namensleiste). Die Runtime setzt --bx-accent
    // ohnehin; hier zusätzlich, damit ein direkt gesetzter Wert sicher greift.
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.art = ['teamherz', 'gift', 'follow', 'sub'].includes(props.event) ? props.event : 'teamherz';
    this.motivWunsch = props.motiv || 'rotation';
    this.soundModus = ['original', 'custom', 'off'].includes(props.sound) ? props.sound : 'original';
    this.minLevel = Math.max(0, Math.floor(Number(props.minLevel ?? 0)) || 0);
    this.zeigeUser = props.showUser !== false; // Standard: Name + Bild an
    this.userText = props.userText != null ? props.userText : '💜 {name} ist Teil des Teams';
    this.timers = new Set();

    // Rotations-Stand überlebt Overlay-Reloads (pro Layer), damit nach einem
    // Neuladen nicht wieder bei Motiv 1 begonnen wird. Gemerkt wird die id.
    this.storageKey = `bx-hz-${(ctx && ctx.layerId) || 'default'}`;
    this.letzteId = this.ladeId();
    // Welche Motive sind wirklich da? Start mit den gebündelten (immer vorhanden),
    // dann per Index-Abruf um geladene Pack-Motive ergänzen.
    this.verfuegbar = MOTIVE.filter((m) => GEBUENDELT.includes(m.id)).map((m) => m.id);
    this.ladeVerfuegbare();

    this.el = document.createElement('div');
    this.el.className = `bx-hz${this.zeigeUser ? '' : ' ohne-user'}`;
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.el.appendChild(this.video);
    // Name + Profilbild des Gebers (unten). Einmal aufgebaut, Inhalt pro Alarm
    // gesetzt. Bei ausgeschaltetem Schalter versteckt die Klasse ohne-user es.
    this.userEl = document.createElement('div');
    this.userEl.className = 'bx-hz-user';
    this.userEl.innerHTML = '<img class="bx-hz-pic leer" alt=""><span class="bx-hz-text"></span>';
    this.picEl = this.userEl.querySelector('.bx-hz-pic');
    this.textEl = this.userEl.querySelector('.bx-hz-text');
    this.el.appendChild(this.userEl);
    root.appendChild(this.el);

    // Ende der Animation → ausblenden.
    this.video.addEventListener('ended', () => this.aus());

    if (this.ctx.preview) this.zeigeVorschau();
  }

  basis() {
    // baseUrl ist die Overlay-Adresse inkl. Token; die Clips liegen unter
    // /herz-anim/. Fehlt sie (z.B. isolierter Test), bleibt der relative Pfad.
    const b = this.ctx.baseUrl || '';
    const ohneQuery = b.split('?')[0].replace(/\/overlay$/, '');
    const token = b.includes('token=') ? `?${b.split('?')[1]}` : '';
    return { root: ohneQuery, token };
  }

  quelleFuer(id) {
    const m = motivZuId(id);
    const { root, token } = this.basis();
    return `${root}/herz-anim/${m.datei}${token}`;
  }

  /** Die installierten Motive vom Server holen (/herz-anim-index). Ergänzt die
   *  gebündelten um geladene Pack-Motive. Fehlschlag ist unkritisch — dann
   *  bleibt es bei den gebündelten. Katalog-Reihenfolge bleibt erhalten. */
  ladeVerfuegbare() {
    const { root, token } = this.basis();
    if (!root) return; // isolierter Test ohne Server
    fetch(`${root}/herz-anim-index${token}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((liste) => {
        if (!Array.isArray(liste)) return;
        const da = new Set(liste.map((e) => e && e.id).filter(Boolean));
        // Immer auch die gebündelten als vorhanden werten (liegen im anderen Ordner).
        for (const g of GEBUENDELT) da.add(g);
        const neu = MOTIVE.filter((m) => da.has(m.id)).map((m) => m.id);
        if (neu.length) this.verfuegbar = neu;
      })
      .catch(() => { /* Netz/Server weg — gebündelte reichen */ });
  }

  ladeId() {
    try { return window.localStorage.getItem(this.storageKey) || null; } catch { return null; }
  }
  merkeId(id) {
    try { window.localStorage.setItem(this.storageKey, id); } catch { /* private mode */ }
  }

  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: keine Effekte nachfeuern
    if (this.ctx.preview) return; // in der Vorschau läuft der Dauer-Loop
    if (!trifftAusloeser(event, this.art, this.minLevel)) return;
    this.setzeUser(event.user);
    this.spiele();
  }

  /** Name + Bild des Gebers in die untere Leiste setzen. */
  setzeUser(user) {
    if (!this.zeigeUser) return;
    this.textEl.innerHTML = baueUserText(this.userText, user?.nickname);
    const pic = user?.profilePic;
    if (pic) { this.picEl.src = pic; this.picEl.classList.remove('leer'); }
    else { this.picEl.removeAttribute('src'); this.picEl.classList.add('leer'); }
  }

  spiele() {
    const id = waehleMotiv(this.motivWunsch, this.letzteId, this.verfuegbar);
    if (!id) return; // kein Motiv verfügbar (sollte nie sein — gebündelte sind da)
    // Läuft schon eine Animation (zweites Teamherz kurz nach dem ersten), deren
    // Sicherheits-Aus- und Aufräum-Timer ZUERST löschen. Sonst beendet der alte
    // 8-Sekunden-Timer die neue Animation mitten drin — fällt nur bei dichten
    // Auslösern auf, genau im vollen Live.
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.letzteId = id;
    this.merkeId(id);

    this.video.loop = false;
    this.video.muted = this.soundModus !== 'original';
    this.video.src = this.quelleFuer(id);
    this.video.currentTime = 0;
    this.el.classList.add('an');
    const p = this.video.play();
    if (p && p.catch) p.catch(() => { /* Autoplay evtl. blockiert — Bild läuft, Ton ggf. nicht */ });

    // Eigener Sound über die App (nicht im Overlay), wie die übrigen
    // Widget-Sounds. Nur wenn gewählt UND gesetzt.
    if (this.soundModus === 'custom' && this.props.soundId && this.ctx.playSound) {
      this.ctx.playSound(this.props.soundId);
    }

    // Sicherheits-Aus, falls 'ended' ausbleibt (z.B. Dekodier-Hänger): die
    // Clips sind 6 s, nach 8 s ist sicher Schluss.
    const t = setTimeout(() => { this.timers.delete(t); this.aus(); }, 8000);
    this.timers.add(t);
  }

  aus() {
    this.el.classList.remove('an');
    // Nach dem Ausblenden das Standbild wegnehmen, damit nicht der letzte Frame
    // stehen bleibt.
    const t = setTimeout(() => {
      this.timers.delete(t);
      try { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); } catch { /* noop */ }
    }, 300);
    this.timers.add(t);
  }

  /** Editor-Vorschau: ein Motiv dauerhaft im Loop, stumm — sonst stünde im
   *  Editor eine leere Box und man platziert blind. */
  zeigeVorschau() {
    // In der Vorschau das gewünschte Motiv (oder das erste des Katalogs) zeigen.
    const id = this.motivWunsch && this.motivWunsch !== 'rotation' ? this.motivWunsch : MOTIVE[0].id;
    this.video.loop = true;
    this.video.muted = true;
    this.video.src = this.quelleFuer(id);
    // Beispiel-Geber, damit man Text + Bild im Editor beurteilen kann.
    this.setzeUser({ nickname: 'Semil' });
    this.el.classList.add('an');
    const p = this.video.play();
    if (p && p.catch) p.catch(() => {});
  }

  onReset() { this.aus(); }

  destroy() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    try { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); } catch { /* noop */ }
    this.el.remove();
  }
}
