// slot-machine.js — Gambling-Automat: 3 Walzen, die bei einem Geschenk drehen
// und mit einstellbarer Gewinnchance eins der Geschenke ausspucken. Task 1
// (dieses Modul) baut NUR das Widget selbst — Walzen, Symbole aus der
// Geschenk-Liste, die reine Landelogik und die Optik (Spin + Gewinn/Niete-
// Landung). Die Server-Bindung (welches Geschenk dreht, echte Gewinnchance)
// kommt in Task 2, die Gewinn-AUSLÖSUNG (Aktion feuern) + der Challenge-
// Countdown in Task 3 — hier reagiert `onAction` nur optisch auf
// {kind:'spin_slot', win, winnerIndex, roll}.
//
// Symbol-Quelle: wie wheel.js/gift-menu.js — entweder eine manuelle Liste
// oder (Standard) automatisch aus den Geschenk-Triggern des Nutzers
// (itemsFromRules aus gift-rules.js, EINZIGE Quelle dieser Ableitung, s.
// dortigen Kommentar). Icons kommen wie im Geschenke-Menü aus dem
// App-Katalog (/gift-catalog, /gift-img) — kein TikTok-Bild wird je
// mitgeliefert (siehe CLAUDE.md).
import { itemsFromRules, giftKey } from './gift-rules.js';

const STYLE_ID = 'bx-sm-style';

/** Reiner Helfer (kein DOM) — wie die drei Walzen landen.
 *  Gewinn: alle drei Walzen zeigen denselben Index (winnerIndex, moduliert
 *  auf die Symbolanzahl n). Niete: drei Indizes, GARANTIERT nicht alle
 *  gleich (sonst sähe eine Niete wie ein Gewinn aus) — roll (0..1, vom
 *  Server oder lokalem Zufall) bestimmt nur die Streuung/Optik.
 *  n<=0 → [0,0,0] (kein Absturz bei leerer Symbolliste); n===1 degeneriert
 *  ebenfalls auf [0,0,0] (ein einziges Symbol kann gar nicht "verlieren"). */
export function slotReels(win, winnerIndex, n, roll) {
  if (n <= 0) return [0, 0, 0];
  const w = ((Math.round(winnerIndex) % n) + n) % n;
  if (win || n === 1) return [w, w, w];
  // Niete: drei Indizes aus einem Dreier-Fenster [a, a+1, a+2] (mod n).
  // Für n>=3 sind das immer drei VERSCHIEDENE Werte (Abstand 1 und 2 mod n
  // fällt erst bei n<=2 mit 0 zusammen) — nie 3 gleich. Für n===2 bleiben nur
  // zwei mögliche Werte; die dritte Walze wird bewusst auf den ANDEREN Wert
  // gesetzt (nie auf a), damit auch dort niemals alle drei gleich sind.
  const a = Math.floor(Math.min(0.999999, Math.max(0, roll)) * n);
  const b = (a + 1) % n;
  const c = n > 2 ? (a + 2) % n : b;
  return [a, b, c];
}

const CSS = `
/* container-type: size — Walzen/Schrift rechnen unten in cqi/cqh gegen die
   Widget-Box, nicht gegen den Viewport (Pflicht, s. gift-menu.js Kommentar). */
.bx-sm { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  container-type: size; font-family: var(--bx-font-display); }
.bx-sm-cab { position:relative; width:min(92cqi,92cqh*1.5); height:min(88cqh,88cqi/1.5);
  box-sizing:border-box; border-radius:min(3cqi,3cqh);
  padding:min(4.5cqi,4.5cqh);
  background: linear-gradient(180deg, #3a2b52 0%, #1c1430 55%, #120c1f 100%);
  box-shadow: 0 0 0 max(2px,.3cqi) color-mix(in srgb, var(--bx-accent,#ff5e8a) 55%, #000 10%),
    0 .6em 1.6em -.4em rgba(0,0,0,.75), inset 0 .12em 0 rgba(255,255,255,.14);
  display:flex; flex-direction:column; gap:min(2.6cqi,2.6cqh); }
/* Leuchtröhrchen-Rahmen: kleine LEDs am Gehäuse, wandern langsam (immer an —
   das Blinken macht den Automaten "lebendig", auch im Ruhezustand). */
.bx-sm-cab::before { content:''; position:absolute; inset:min(1.4cqi,1.4cqh); pointer-events:none;
  border-radius:min(2.4cqi,2.4cqh); border: max(1px,.2cqi) dashed color-mix(in srgb, var(--bx-accent,#ff5e8a) 55%, transparent);
  opacity:.65; }
.bx-sm-title { flex:none; text-align:center; letter-spacing:.16em; text-transform:uppercase;
  font-size:min(4.6cqi,4.2cqh); color:#fff; -webkit-text-stroke: max(1px,.09em) #0a0b12; paint-order: stroke fill;
  text-shadow: 0 0 .5em color-mix(in srgb, var(--bx-accent,#ff5e8a) 70%, transparent); }
/* Anzeigefenster mit den drei Walzen. */
.bx-sm-win { position:relative; flex:1 1 auto; min-height:0; display:flex; gap:min(2cqi,2cqh);
  padding:min(2cqi,2cqh); border-radius:min(1.6cqi,1.6cqh); box-sizing:border-box;
  background: linear-gradient(180deg, #050308, #0c0714 45%, #050308);
  box-shadow: inset 0 .3em .8em rgba(0,0,0,.7), inset 0 0 0 max(1px,.15cqi) rgba(255,255,255,.08); }
.bx-sm-reel { position:relative; flex:1 1 0; min-width:0; overflow:hidden; border-radius:min(1cqi,1cqh);
  background: rgba(255,255,255,.03); }
/* Streifen mit den Symbolen — wird per transform verschoben (JS setzt
   translateY inline, damit die Ziel-Position vom Server/Zufall abhängen kann;
   CSS liefert nur die spin-Animation UND das sanfte Ausrollen). */
.bx-sm-strip { position:absolute; left:0; right:0; top:0; will-change: transform; }
.bx-sm-cell { height: var(--bx-sm-cell, 33.34cqh); box-sizing:border-box; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:.2em; padding:.3em; }
.bx-sm-cell img, .bx-sm-cell svg { width:min(9cqi,16cqh); height:min(9cqi,16cqh); object-fit:contain;
  filter: drop-shadow(0 .1em .2em rgba(0,0,0,.6)); }
.bx-sm-cell img { display:none; }
.bx-sm-cell.has-img img { display:block; }
.bx-sm-cell.has-img svg { display:none; }
.bx-sm-cell .lbl { max-width:92%; font-size:min(2.2cqi,2.6cqh); line-height:1.05; text-align:center;
  color: var(--bx-text,#f4f0ff); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
/* Während des Drehens: schnelle, endlose Endlosschleife (die Ziel-Landung
   übernimmt danach das JS mit einer ease-out-transition). */
.bx-sm-reel.spin .bx-sm-strip { animation: bx-sm-spin 160ms linear infinite; }
@keyframes bx-sm-spin { from { transform: translateY(0); } to { transform: translateY(var(--bx-sm-cell, 33.34cqh)); } }
/* Sanftes Ausrollen: transition statt keyframes, weil das Ziel dynamisch ist. */
.bx-sm-reel.settle .bx-sm-strip { transition: transform 650ms cubic-bezier(.17,.89,.32,1.28); }
/* Gewinnlinie quer über die Mitte aller drei Walzen. */
.bx-sm-line { position:absolute; left:min(2cqi,2cqh); right:min(2cqi,2cqh); top:50%; height:max(2px,.35cqh);
  transform:translateY(-50%); background: linear-gradient(90deg, transparent, var(--bx-accent,#ff5e8a), transparent);
  box-shadow: 0 0 .8em var(--bx-accent,#ff5e8a); opacity:.55; pointer-events:none; z-index:3; }
.bx-sm-win.win .bx-sm-line { animation: bx-sm-line-flash 550ms ease-in-out 3; opacity:1; }
@keyframes bx-sm-line-flash { 0%,100% { opacity:.55; } 50% { opacity:1; filter:brightness(1.6); } }
/* LED-Kette am unteren Rand des Gehäuses — Casino-Charme, blinkt im Idle
   alternierend, während des Spins schneller. */
.bx-sm-leds { flex:none; display:flex; justify-content:space-between; padding:0 min(1.5cqi,1.5cqh); }
.bx-sm-leds i { width:min(1.4cqi,1.6cqh); height:min(1.4cqi,1.6cqh); border-radius:99em; background:#402a1c;
  box-shadow: inset 0 0 .2em rgba(0,0,0,.6); }
.bx-sm-leds i.on { background: var(--bx-gold,#ffd23e); box-shadow: 0 0 .5em var(--bx-gold,#ffd23e); }
.bx-sm-cab.spinning .bx-sm-leds i { animation: bx-sm-led 240ms steps(1,end) infinite; }
.bx-sm-cab.spinning .bx-sm-leds i:nth-child(odd) { animation-delay:120ms; }
@keyframes bx-sm-led { 0%,49% { background:#402a1c; box-shadow:none; } 50%,100% { background: var(--bx-gold,#ffd23e); box-shadow: 0 0 .5em var(--bx-gold,#ffd23e); } }
/* Hebel an der rechten Innenkante — reine Deko, zuckt kurz beim Auslösen.
   Bewusst INNERHALB des Gehäuses (nicht daneben herausragend): eine negative
   Position ragte je nach Box-Seitenverhältnis über den Widget-Rand hinaus
   (widget-check meldete das als RAGT-RAUS). */
.bx-sm-lever { position:absolute; right:min(1.5cqi,1.5cqh); top:12%; width:min(3cqi,3cqh); height:44%;
  transform-origin: top center; }
.bx-sm-lever .stick { position:absolute; left:50%; top:0; bottom:22%; width:max(3px,.6cqi); translate:-50% 0;
  border-radius:99em; background: linear-gradient(180deg,#d8d8de,#8a8a94); }
.bx-sm-lever .ball { position:absolute; left:50%; top:0; width:min(3.4cqi,3.4cqh); height:min(3.4cqi,3.4cqh);
  translate:-50% -30%; border-radius:99em; background: radial-gradient(circle at 35% 30%, #ff8a9c, #c8102e 68%);
  box-shadow: 0 .1em .3em rgba(0,0,0,.6); }
.bx-sm-lever.pull { animation: bx-sm-lever-pull 650ms cubic-bezier(.2,.8,.3,1.2); }
@keyframes bx-sm-lever-pull { 0% { transform: rotate(0deg); } 35% { transform: rotate(24deg); } 100% { transform: rotate(0deg); } }
/* Ergebnis-Banner (Jackpot-Feier / "so knapp") — legt sich über das
   Anzeigefenster, damit es auch bei sehr flachen Boxen nicht herausragt. */
.bx-sm-msg { position:absolute; left:50%; top:50%; translate:-50% -50%; z-index:5; text-align:center;
  padding:.5em .9em; border-radius:.6em; white-space:nowrap; max-width:92%;
  font-size:min(3.6cqi,4.2cqh); color:#fff; -webkit-text-stroke: max(1px,.08em) #0a0b12; paint-order: stroke fill;
  background: color-mix(in srgb, #000 55%, transparent); opacity:0; pointer-events:none;
  overflow:hidden; text-overflow:ellipsis; }
.bx-sm-msg.show.win { animation: bx-sm-msg-win 2.4s cubic-bezier(.2,1.4,.3,1) forwards; color:#fff2b0; }
.bx-sm-msg.show.loss { animation: bx-sm-msg-loss 1.6s ease forwards; }
@keyframes bx-sm-msg-win { 0% { opacity:0; scale:.5; } 14% { opacity:1; scale:1.12; } 26% { scale:1; }
  80% { opacity:1; } 100% { opacity:0; scale:.96; } }
@keyframes bx-sm-msg-loss { 0% { opacity:0; translate:-50% -40%; } 18% { opacity:1; translate:-50% -50%; }
  75% { opacity:1; } 100% { opacity:0; } }
/* Jackpot-Konfetti: kleine Rechtecke, die aus der Mitte hochspritzen — reine
   transform/opacity-Animation (GPU-freundlich). */
.bx-sm-fx { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:4; }
.bx-sm-fx i { position:absolute; left:var(--x,50%); top:55%; width:.6em; height:.9em; opacity:0;
  background:var(--c,#ffd23e); border-radius:.1em;
  animation: bx-sm-confetti var(--t,900ms) ease-out var(--d,0ms) both; }
@keyframes bx-sm-confetti { 0% { opacity:1; transform: translate(0,0) rotate(0deg); }
  100% { opacity:0; transform: translate(var(--dx,0),-3.2em) rotate(var(--r,180deg)); } }

/* Rahmen ausblenden — nur das Gehäuse ist der "Rahmen" dieses Widgets. */
.bx-frameless .bx-sm-cab { box-shadow:none; background: rgba(10,7,18,.55); }

/* ── Stile (props.style) ─────────────────────────────────────────────────
   neon (Standard, oben) — dunkles Violett, Akzentfarbe glüht. Die anderen
   beiden ändern nur die Gehäusefarben/den Kabinett-Charakter, Walzen/Landung
   bleiben technisch identisch. */
.bx-sm-classic .bx-sm-cab { background: linear-gradient(180deg,#2a3550,#141a2c 55%,#0d101c); }
.bx-sm-casino .bx-sm-cab { background: linear-gradient(180deg,#3a1420 0%,#1a0a10 55%,#100609 100%);
  box-shadow: 0 0 0 max(2px,.3cqi) color-mix(in srgb, var(--bx-gold,#ffd23e) 70%, #000 10%),
    0 .6em 1.6em -.4em rgba(0,0,0,.75), inset 0 .12em 0 rgba(255,255,255,.14); }
.bx-sm-casino .bx-sm-cab::before { border-color: color-mix(in srgb, var(--bx-gold,#ffd23e) 65%, transparent); }
.bx-sm-casino .bx-sm-leds i.on { background:#fff2c4; box-shadow: 0 0 .5em var(--bx-gold,#ffd23e); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }

const GIFT_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--bx-accent,#ff5e8a)"><path d="M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8" fill="rgba(255,255,255,.08)"/><path d="M2 7h20v5H2z" fill="rgba(255,255,255,.12)"/><path d="M12 21V7"/><path d="M12 7S10.5 3 8 3a2.2 2.2 0 0 0 0 4Z"/><path d="M12 7s1.5-4 4-4a2.2 2.2 0 0 1 0 4Z"/></svg>`;

// Anzahl kompletter "Umdrehungen" im Streifen, bevor er auf dem Zielsymbol
// landet — rein optisch, damit der Spin nicht zu kurz aussieht.
const LAPS = 4;

// "rose::Konfetti-Regen | galaxy::Songwunsch" → [{slug, text}] — dieselbe
// Kurzform wie gift-menu.js parseItems, hier ohne Countdown-Feld (das ist
// Aufgabe von Task 3 / gift-menu, nicht des Automaten).
function parseSlotItems(raw) {
  return String(raw || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [slug, ...rest] = s.split('::');
      return { slug: (slug || '').trim(), text: rest.join('::').trim() };
    })
    .filter((it) => it.slug || it.text);
}

const DEMO = 'Rose::Konfetti | Finger Heart::Danke-Sound | Galaxy::Songwunsch | TikTok::Extra-Dreh | Doughnut::Bonus';

export default class SlotMachine {
  constructor(root, props, ctx) {
    ensureStyle();
    // Namenskollision vermeiden (Muster wheel.js): der App-Kontext
    // (baseUrl/token/preview) heißt hier `this.host`, nicht `this.ctx`.
    this.host = ctx || {};
    this.props = props || {};
    if (props.accent) root.style.setProperty('--bx-accent', String(props.accent));
    this.title = props.title || 'Gambling-Automat';
    this.style = ['neon', 'classic', 'casino'].includes(props.style) ? props.style : 'neon';
    this.source = props.source === 'liste' ? 'liste' : 'trigger';
    this.icons = {}; this.iconsById = {}; this.meta = {}; this.metaById = {};
    this.timers = new Set();
    this.spinning = false;
    this.reelIndex = [0, 0, 0]; // aktueller Symbol-Index je Walze (für die nächste Drehung als Startpunkt)

    this.items = parseSlotItems(props.items);
    this.preview = !!this.host.preview;
    if (!this.items.length && (this.source === 'liste' || this.preview)) {
      this.items = parseSlotItems(DEMO);
      this.demo = true;
    }
    if (!this.items.length) this.items = [{ slug: '', text: '?' }];

    this.el = document.createElement('div');
    this.el.className = `bx-sm bx-sm-${this.style}`;
    this.el.innerHTML = `<div class="bx-sm-cab">
        <div class="bx-sm-title"></div>
        <div class="bx-sm-win">
          <div class="bx-sm-reel" data-r="0"><div class="bx-sm-strip"></div></div>
          <div class="bx-sm-reel" data-r="1"><div class="bx-sm-strip"></div></div>
          <div class="bx-sm-reel" data-r="2"><div class="bx-sm-strip"></div></div>
          <div class="bx-sm-line"></div>
          <div class="bx-sm-fx"></div>
          <div class="bx-sm-msg"></div>
        </div>
        <div class="bx-sm-leds"></div>
        <div class="bx-sm-lever"><span class="stick"></span><span class="ball"></span></div>
      </div>`;
    this.el.querySelector('.bx-sm-title').textContent = this.title;
    root.appendChild(this.el);
    this.cab = this.el.querySelector('.bx-sm-cab');
    this.winEl = this.el.querySelector('.bx-sm-win');
    this.msgEl = this.el.querySelector('.bx-sm-msg');
    this.fxEl = this.el.querySelector('.bx-sm-fx');
    this.leverEl = this.el.querySelector('.bx-sm-lever');
    this.reels = [...this.el.querySelectorAll('.bx-sm-reel')];
    // LED-Kette: Anzahl grob nach Breite, rein dekorativ.
    const leds = this.el.querySelector('.bx-sm-leds');
    leds.innerHTML = Array.from({ length: 10 }, (_, i) => `<i class="${i % 2 === 0 ? 'on' : ''}"></i>`).join('');

    this.buildStrips();

    // Quelle "trigger": Symbole aus den Geschenk-Triggern nachladen (Muster
    // wheel.js loadRules). Nicht in der Editor-Vorschau (kein Server dort).
    if (this.source === 'trigger' && this.host.baseUrl && !this.host.preview) {
      void this.loadRules();
      void this.loadCatalog();
    } else if (this.host.baseUrl && !this.host.preview) {
      void this.loadCatalog();
    }

    // Editor-Vorschau: von selbst drehen (mal Gewinn, mal Niete), damit man
    // die Optik beurteilen kann (Muster: wheel.js Demo).
    if (this.preview) {
      let n = 0;
      const demo = () => {
        const win = n % 2 === 0;
        const winnerIndex = Math.floor(Math.random() * this.items.length);
        const roll = Math.random();
        this.onAction({ kind: 'spin_slot', win, winnerIndex, roll });
        n++;
      };
      this.demoT = setTimeout(demo, 500);
      this.demoInterval = setInterval(demo, 4600);
    }
  }

  /** Symbole aus den Trigger-Regeln des Nutzers ableiten (Quelle "trigger").
   *  Schlägt das fehl (Route noch nicht da), bleibt die manuelle/Demo-Liste
   *  stehen — Muster: wheel.js loadRules(). */
  async loadRules() {
    try {
      const res = await fetch(`${this.host.baseUrl}/trigger-rules?token=${this.host.token}`);
      if (!res.ok) return;
      const data = await res.json();
      const rules = Array.isArray(data) ? data : (data && Array.isArray(data.rules) ? data.rules : []);
      const items = itemsFromRules(rules).filter((it) => it.slug || it.text);
      if (!items.length) return;
      this.items = items;
      this.demo = false;
      this.buildStrips();
      this.applyIcons();
    } catch { /* Route (noch) nicht da — manuelle/Demo-Liste bleibt */ }
  }

  /** Gift-Bilder/Namen aus dem App-Katalog (nur offizielle Quelle: lokale
   *  Kopie unter /gift-img, sonst TikTok-CDN-URL) — Muster: gift-menu.js
   *  loadCatalog(). */
  async loadCatalog() {
    try {
      const res = await fetch(`${this.host.baseUrl}/gift-catalog?token=${this.host.token}`);
      const cat = await res.json();
      for (const [slug, e] of Object.entries(cat || {})) {
        if (!e) continue;
        const key = giftKey(e.slug || slug);
        const url = e.iconFile
          ? `${this.host.baseUrl}/gift-img/${encodeURIComponent(e.iconFile)}?token=${this.host.token}`
          : (e.icon || '');
        if (url) this.icons[key] = url;
        this.meta[key] = { name: e.customName || e.slug || slug };
        const gid = Number(e.giftId) || 0;
        if (gid) { if (url) this.iconsById[gid] = url; this.metaById[gid] = { ...this.meta[key], key }; }
      }
      this.applyIcons();
    } catch { /* offline/alte App — Slug + Platzhalter reichen */ }
  }

  displayName(it) {
    const k = it.slug ? giftKey(it.slug) : '';
    const m = (k && this.meta[k]) || null;
    return (m && m.name) || it.slug || it.text || '?';
  }

  cellHtml(it) {
    const k = it.slug ? giftKey(it.slug) : '';
    return `<div class="bx-sm-cell" data-key="${escapeHtml(k)}">${GIFT_SVG}<img alt="" />`
      + `<span class="lbl">${escapeHtml(this.displayName(it))}</span></div>`;
  }

  applyIcons() {
    for (const cell of this.el.querySelectorAll('.bx-sm-cell')) {
      const key = cell.dataset.key || '';
      const url = this.icons[key];
      if (!url) continue;
      const img = cell.querySelector('img');
      if (!img || img.getAttribute('src')) continue;
      img.onload = () => cell.classList.add('has-img');
      img.src = url;
    }
  }

  /** Baut je Walze einen Streifen mit LAPS+1 vollen Runden der Symbolliste,
   *  damit er weit genug "drehen" kann, bevor er auf dem Zielindex landet. */
  buildStrips() {
    const n = this.items.length;
    for (const reel of this.reels) {
      const strip = reel.querySelector('.bx-sm-strip');
      let html = '';
      for (let lap = 0; lap <= LAPS; lap++) {
        for (let i = 0; i < n; i++) html += this.cellHtml(this.items[i]);
      }
      strip.innerHTML = html;
      strip.style.transform = 'translateY(0)';
    }
    this.applyIcons();
  }

  onAction(action) {
    if (!action || action.kind !== 'spin_slot' || this.spinning) return;
    const n = this.items.length;
    if (n < 1) return;
    const [r0, r1, r2] = slotReels(!!action.win, Number(action.winnerIndex) || 0, n, Number(action.roll) || 0);
    this.spinning = true;
    this.cab.classList.add('spinning');
    this.msgEl.classList.remove('show', 'win', 'loss');
    this.winEl.classList.remove('win');
    this.fxEl.innerHTML = '';
    // Hebel zucken lassen — reine Deko.
    this.leverEl.classList.remove('pull'); void this.leverEl.offsetWidth; this.leverEl.classList.add('pull');
    const targets = [r0, r1, r2];
    // Jede Walze bekommt für sich einen leichten Zeitversatz beim Anlaufen
    // (klassischer Slot-Look: Walzen stoppen NACHEINANDER, nicht gleichzeitig).
    this.reels.forEach((reel, i) => {
      reel.classList.remove('settle');
      reel.classList.add('spin');
      const stopIn = 700 + i * 260;
      const t = setTimeout(() => this.landReel(reel, targets[i], stopIn), stopIn);
      this.timers.add(t);
    });
    const totalMs = 700 + 2 * 260 + 700; // letzte Walze + Ausroll-Transition
    const doneT = setTimeout(() => this.finish(!!action.win, targets[0]), totalMs);
    this.timers.add(doneT);
  }

  /** Eine Walze vom Dreh- in den Ausroll-Zustand versetzen und per
   *  translateY auf den Zielindex fahren lassen (CSS transition übernimmt
   *  das sanfte Ausklingen, s. .bx-sm-reel.settle). */
  landReel(reel, index, spunMs) {
    reel.classList.remove('spin');
    reel.classList.add('settle');
    const strip = reel.querySelector('.bx-sm-strip');
    const cellH = strip.firstElementChild ? strip.firstElementChild.getBoundingClientRect().height : 0;
    const n = this.items.length;
    // Zielzelle: eine möglichst weit hinten liegende Wiederholung des
    // Zielindex im Streifen (LAPS volle Runden weiter unten) — dadurch dreht
    // der Streifen sichtbar mehrfach, bevor er stoppt.
    const targetCell = LAPS * n + index;
    strip.style.transform = `translateY(-${targetCell * cellH}px)`;
    this.reelIndex[[...this.reels].indexOf(reel)] = index;
  }

  finish(win, winnerIndex) {
    this.spinning = false;
    this.cab.classList.remove('spinning');
    for (const reel of this.reels) reel.classList.remove('spin');
    const it = this.items[((winnerIndex % this.items.length) + this.items.length) % this.items.length];
    this.msgEl.textContent = win
      ? `🎉 JACKPOT — ${this.displayName(it)}!`
      : 'So knapp daneben…';
    this.msgEl.classList.remove('show', 'win', 'loss');
    void this.msgEl.offsetWidth;
    this.msgEl.classList.add('show', win ? 'win' : 'loss');
    if (win) {
      this.winEl.classList.add('win');
      this.confetti();
    } else {
      this.winEl.classList.remove('win');
    }
  }

  /** Kleine Konfetti-Rechtecke, die aus der Mitte hochspritzen (Jackpot-
   *  Feier) — Muster wie die Partikel in gift-menu.js/milestone-confetti. */
  confetti() {
    const pal = ['#ffd23e', '#ff5e8a', '#28e0c4', '#5c9dff', '#c45cff'];
    let html = '';
    for (let k = 0; k < 22; k++) {
      const x = Math.round(20 + Math.random() * 60);
      const dx = Math.round(Math.random() * 60 - 30);
      const rot = Math.round(Math.random() * 720 - 360);
      const dur = Math.round(700 + Math.random() * 500);
      const del = Math.round(Math.random() * 200);
      html += `<i style="--x:${x}%;--dx:${dx}px;--r:${rot}deg;--t:${dur}ms;--d:${del}ms;--c:${pal[k % pal.length]}"></i>`;
    }
    this.fxEl.innerHTML = html;
    const t = setTimeout(() => { this.timers.delete(t); this.fxEl.innerHTML = ''; }, 1600);
    this.timers.add(t);
  }

  destroy() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    clearTimeout(this.demoT); clearInterval(this.demoInterval);
    this.el.remove();
  }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
