// chat-box.js — Premium Live-Chat im Overlay (NEU ggü. Alt-App).
// Glas-Bubbles, Avatar-Glow, hash-stabile Nickname-Farben, Mask-Fade.
// textContent-only (kein HTML-Inject). props: { max?, hideAfterMs? }
const STYLE_ID = 'bx-cb-style';
const CSS = `
.bx-cb { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: clamp(3px,1.4cqh,12px);
  overflow: hidden; font-family: var(--bx-font-body); container-type: size;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 14%); mask-image: linear-gradient(to bottom, transparent, #000 14%); }
.bx-cb-msg { display: flex; align-items: flex-start; gap: clamp(5px,1.8cqi,16px); padding: clamp(3px,1.3cqh,12px) clamp(7px,2.6cqi,22px) clamp(4px,1.5cqh,13px) clamp(4px,1.4cqi,14px); border-radius: 14px;
  background: var(--bx-glass); -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  box-shadow: 0 6px 16px -8px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05) inset;
  transform: translateY(14px); opacity: 0; animation: bx-cb-in 280ms cubic-bezier(.2,1.3,.4,1) forwards; }
.bx-cb-msg.fade { animation: bx-cb-out 420ms ease-in forwards; }
/* Passt nicht mehr in die Box → gar nicht erst zeigen (statt oben abschneiden). */
.bx-cb-msg.bx-off { display: none; }
/* Eigener Groessen-Container, damit der Fallback-Buchstabe (.bx-av::after) mitwaechst. */
.bx-cb-pic { width: clamp(17px,min(6.6cqi,7.5cqh),46px); aspect-ratio: 1/1; height: auto; border-radius: 50%; flex: none; margin-top: 1px;
  container-type: size; box-shadow: 0 0 0 2px rgba(255,255,255,.12); }
.bx-cb-pic::after { font-size: 52cqmin; }
.bx-cb-body { min-width: 0; }
.bx-cb-name { font-family: var(--bx-font-display); font-size: clamp(9px,min(3.4cqi,4.2cqh),22px); text-transform: uppercase; letter-spacing: .03em;
  text-shadow: 0 1px 3px rgba(0,0,0,.8); }
.bx-cb-text { font-size: clamp(11px,min(4.4cqi,5.4cqh),28px); line-height: 1.28; color: var(--bx-text,#f2f3f8); text-shadow: 0 1px 2px rgba(0,0,0,.6);
  word-break: break-word; overflow-wrap: anywhere; }
@keyframes bx-cb-in { to { transform: translateY(0); opacity: 1; } }
@keyframes bx-cb-out { to { opacity: 0; } }

/* ── Stil „Clean" — keine Bubbles: pure Textzeilen mit harter Schattenkante,
   minimaler Footprint (klassischer Gamer-Chat direkt überm Gameplay). */
.bx-cb-clean .bx-cb-msg { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none;
  padding: clamp(1px,.5cqh,4px) 4px; border-radius: 0; }
.bx-cb-clean .bx-cb-pic { box-shadow: 0 2px 6px rgba(0,0,0,.7); }
.bx-cb-clean .bx-cb-name { text-shadow: 0 1px 0 rgba(0,0,0,.9), 0 2px 6px rgba(0,0,0,.9); }
.bx-cb-clean .bx-cb-text { color: #fff; text-shadow: 0 1px 0 rgba(0,0,0,.95), 0 2px 8px rgba(0,0,0,.9); }

/* ── Stil „Sticker" — helle Comic-Bubbles mit dunkler Schrift und Akzent-Nase,
   leicht abwechselnd gekippt: verspielter Cute-Pop-Look. */
.bx-cb-sticker .bx-cb-msg { background: rgba(255,255,255,.94); border-radius: 16px 16px 16px 4px;
  box-shadow: 0 6px 16px -6px rgba(0,0,0,.55), 0 0 0 2.5px var(--bx-accent);
  -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-cb-sticker .bx-cb-msg:nth-child(odd) { transform-origin: left bottom; rotate: -0.6deg; }
.bx-cb-sticker .bx-cb-msg:nth-child(even) { transform-origin: left bottom; rotate: 0.5deg; }
.bx-cb-sticker .bx-cb-text { color: #14161f; text-shadow: none; font-weight: 600; }
.bx-cb-sticker .bx-cb-name { text-shadow: none; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s); } }
function nameColor(name) { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0; return `hsl(${Math.abs(h) % 360} 88% 70%)`; }

/** URL sicher in CSS url("…") einbetten — NUR Quotes escapen, nie
 *  (nach-)encodieren: data-URIs und vor-encodierte CDN-URLs blieben sonst kaputt. */
function cssUrl(u) { return String(u).replace(/[\\"']/g, '\\$&').replace(/[\n\r]/g, ''); }

/* ── Avatar-Fallback (bewusst je Widget dupliziert, kein gemeinsames JS-Modul):
   ohne Bild — oder wenn das Laden scheitert — erscheint der Anfangsbuchstabe
   auf einem aus dem Namen abgeleiteten Farbton statt eines schwarzen Kreises. */
function avHue(name) { const s = String(name || ''); let h = 0; for (let i = 0; i < s.length; i++) h += s.charCodeAt(i); return h % 360; }
function avSet(el, name, url) {
  if (!el) return;
  const s = String(name || '').trim();
  el.classList.add('bx-av');
  el.dataset.initial = (s[0] || '?').toUpperCase();
  el.style.setProperty('--bx-av-h', String(avHue(s)));
  if (!url) return;
  const img = new Image();
  img.onload = () => { if (el.isConnected) { el.style.backgroundImage = `url("${cssUrl(url)}")`; el.classList.add('bx-av-img'); } };
  img.src = url;
}
/** Demo-Nachrichten für die Editor-Vorschau — sonst bleibt die Box dort leer. */
const DEMO = [
  ['Mia', 'Das Overlay ist mega 🔥'],
  ['LeonGG', 'gg wp'],
  ['Nova', 'Wie lange streamst du heute noch?'],
  ['BigBen', 'Bin neu hier — cooler Stream!'],
  ['Sara_99', 'Ich muss gleich leider weg, aber morgen wieder ❤'],
  ['Kaan', 'W stream'],
  ['Pia', 'erster'],
  ['ExE', 'Kommt gleich noch eine Runde?'],
];
export default class ChatBox {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.max = Math.min(30, Math.max(3, Number(props.max ?? 8)));
    this.hideAfterMs = Number(props.hideAfterMs ?? 0);
    this.style = ['glas', 'clean', 'sticker'].includes(props.style) ? props.style : 'glas';
    this.el = document.createElement('div');
    this.el.className = `bx-cb${this.style !== 'glas' ? ` bx-cb-${this.style}` : ''}`;
    root.appendChild(this.el);
    this.timers = new Set();
    // Zieht der Nutzer die Box kleiner, passen die eingestellten Nachrichten
    // nicht mehr hinein — dann zeigen wir eben weniger, statt oben abzuschneiden.
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.el);
    if (ctx?.preview) {
      for (const [nick, text] of DEMO.slice(-this.max)) {
        this.onEvent({ type: 'chat', ts: Date.now(), user: { id: nick, nickname: nick }, text });
      }
    }
  }
  /** Sichtbare Zeilenzahl aus der Boxhöhe ableiten: von unten nach oben zählen,
   *  wie viele Nachrichten ganz hineinpassen — der Rest wird ausgeblendet
   *  (nicht gelöscht, damit er bei einer größeren Box zurückkommt).
   *  Bewusst KEINE Schrift-Anpassung: die Zeilenhöhe darf nicht bei jeder
   *  neuen Nachricht springen. */
  fit() {
    const box = this.el.clientHeight;
    const kids = Array.from(this.el.children);
    if (!box || kids.length === 0) return;
    for (const k of kids) k.classList.remove('bx-off');
    const last = kids[kids.length - 1];
    const bottom = last.offsetTop + last.offsetHeight;
    let keep = 1;
    for (let i = kids.length - 2; i >= 0; i--) {
      if (bottom - kids[i].offsetTop > box) break;
      keep++;
    }
    for (let i = 0; i < kids.length - keep; i++) kids[i].classList.add('bx-off');
  }
  onEvent(event) {
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    if (event.type !== 'chat' || !event.text) return;
    const msg = document.createElement('div');
    msg.className = 'bx-cb-msg';
    msg.innerHTML = `<div class="bx-cb-pic"></div><div class="bx-cb-body"><div class="bx-cb-name"></div><div class="bx-cb-text"></div></div>`;
    const name = event.user?.nickname || 'Anonym';
    const nameEl = msg.querySelector('.bx-cb-name');
    nameEl.textContent = name;
    // Sticker-Stil hat helle Bubbles → dunklere Namensfarbe, sonst unlesbar.
    nameEl.style.color = this.style === 'sticker' ? nameColor(name).replace('88% 70%', '80% 34%') : nameColor(name);
    msg.querySelector('.bx-cb-text').textContent = event.text;
    avSet(msg.querySelector('.bx-cb-pic'), name, event.user?.profilePic);
    this.el.appendChild(msg);
    while (this.el.children.length > this.max) this.el.firstElementChild.remove();
    this.fit();
    if (this.hideAfterMs > 0) {
      const t = setTimeout(() => { this.timers.delete(t); msg.classList.add('fade'); setTimeout(() => { msg.remove(); this.fit(); }, 440); }, this.hideAfterMs);
      this.timers.add(t);
    }
  }
  destroy() { this.ro?.disconnect(); for (const t of this.timers) clearTimeout(t); this.el.remove(); }
}
