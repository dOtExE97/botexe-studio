// countdown.js — Premium-Countdown. Zählt ab props.minutes herunter; bei 0
// optional Text. Glas-Kapsel, Neon-Ziffern, sanfter Puls in der Schlussphase.
// Lebendig: jede Ziffer rollt beim Wechsel (alte slided/faded raus nach oben,
// neue rein von unten) — animiert wird nur, was sich wirklich ändert.
// props: { minutes?, label?, doneText?, accent? }
const STYLE_ID = 'bx-cd-style';
const CSS = `
.bx-cd { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: var(--bx-font-body); gap: 6px; }
.bx-cd-label { font-family: var(--bx-font-display); font-size: 15px; letter-spacing: .34em; text-transform: uppercase;
  color: var(--bx-muted); text-shadow: 0 2px 6px rgba(0,0,0,.8); }
.bx-cd-time { display: flex; align-items: center; font-family: var(--bx-font-mono); font-weight: 700; font-size: 64px; line-height: 1; color: var(--bx-text,#fff);
  padding: 10px 28px; border-radius: 18px; background: var(--bx-glass);
  box-shadow: var(--bx-shadow), 0 0 40px -12px var(--bx-accent);
  text-shadow: 0 0 22px color-mix(in srgb, var(--bx-accent) 55%, transparent), 0 3px 8px rgba(0,0,0,.7);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); transition: color .35s ease; }
/* Eine rollende Ziffer: feste Zelle mit Höhe 1em, der Strip slided vertikal. */
.bx-cd-digit { position: relative; display: inline-block; width: .62em; height: 1em; overflow: hidden; vertical-align: top; }
.bx-cd-roll { position: absolute; left: 0; right: 0; top: 0; will-change: transform; }
.bx-cd-roll > span { display: block; height: 1em; text-align: center; }
/* Spring-Slide beim Wechsel — übernommen aus der Motion-Sprache von wheel/gift-alert. */
.bx-cd-digit.rolling .bx-cd-roll { transition: transform .42s cubic-bezier(.2,1.3,.3,1); }
.bx-cd-sep { display: inline-block; text-align: center; width: .38em; }
.bx-cd.urgent .bx-cd-sep { animation: bx-cd-blink 1s steps(1) infinite; }
.bx-cd-done-text { display: inline-block; }
.bx-cd.urgent .bx-cd-time { color: var(--bx-accent); animation: bx-cd-pulse 1s ease-in-out infinite; }
.bx-cd.done .bx-cd-time { color: var(--bx-teal); animation: bx-cd-pop 420ms cubic-bezier(.2,1.5,.3,1); }
@keyframes bx-cd-pulse { 50% { transform: scale(1.05); } }
@keyframes bx-cd-pop { 0% { transform: scale(.7); } 60% { transform: scale(1.08); } 100% { transform: scale(1); } }
@keyframes bx-cd-blink { 50% { opacity: .25; } }

/* ── Stil „Neon" — freistehende Riesen-Ziffern ohne Kapsel: purer Glow. */
.bx-cd-neon .bx-cd-time { background: none; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none;
  font-size: 84px; padding: 0;
  text-shadow: 0 0 30px var(--bx-accent), 0 0 60px color-mix(in srgb, var(--bx-accent) 50%, transparent), 0 3px 0 rgba(0,0,0,.5); }
.bx-cd-neon .bx-cd-label { color: var(--bx-text, #fff); text-shadow: 0 0 12px color-mix(in srgb, var(--bx-accent) 60%, transparent), 0 2px 6px rgba(0,0,0,.8); }

/* ── Stil „LED" — dunkle Anzeigetafel mit Scanlines und Bernstein-Ziffern:
   Flughafen-/Stadion-Board-Ästhetik. */
.bx-cd-led .bx-cd-time { border-radius: 8px; background: #0a0c0a;
  box-shadow: 0 0 0 3px #1c201c, 0 12px 30px -10px rgba(0,0,0,.8), inset 0 0 24px rgba(0,0,0,.9);
  color: var(--bx-gold); text-shadow: 0 0 14px color-mix(in srgb, var(--bx-gold) 70%, transparent);
  position: relative; -webkit-backdrop-filter: none; backdrop-filter: none; }
.bx-cd-led .bx-cd-time::after { content: ''; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: repeating-linear-gradient(0deg, transparent 0 2px, rgba(0,0,0,.28) 2px 4px); }
.bx-cd-led .bx-cd-label { font-family: var(--bx-font-mono); letter-spacing: .5em; color: var(--bx-gold); opacity: .75; }
.bx-cd-led.urgent .bx-cd-time { color: var(--bx-accent); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }

export default class Countdown {
  constructor(root, props, ctx) {
    ensureStyle();
    root.style.setProperty('--bx-accent', props.accent || '#ff5436');
    this.minutes = Math.max(0, Number(props.minutes ?? 5));
    this.remaining = this.minutes * 60;
    // Deadline merken: Rebuild/Reconnect setzt den Timer sonst auf die volle
    // Zeit zurück (und OBS-/TTLS-Quelle liefen auseinander). Gemerkt wird der
    // Ziel-Zeitpunkt — läuft er noch, wird übernommen statt neu gestartet.
    this.storeKey = `bx-cd-${(ctx && ctx.layerId) || 'countdown'}`;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storeKey) || 'null');
      if (saved && saved.minutes === this.minutes && saved.endAt > Date.now()) {
        this.remaining = Math.ceil((saved.endAt - Date.now()) / 1000);
      } else {
        localStorage.setItem(this.storeKey, JSON.stringify({ minutes: this.minutes, endAt: Date.now() + this.remaining * 1000 }));
      }
    } catch { /* Storage blockiert → lokaler Timer reicht */ }
    this.doneText = props.doneText || 'LOS!';
    this.digits = [];          // { cell, roll, value } pro Ziffernstelle
    this.lastText = null;      // zuletzt gerendertes Ziffern-Muster (z.B. "0459")
    this.showingDone = false;
    this.el = document.createElement('div');
    const style = ['glas', 'neon', 'led'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-cd${style !== 'glas' ? ` bx-cd-${style}` : ''}`;
    this.el.innerHTML = `<div class="bx-cd-label"></div><div class="bx-cd-time"></div>`;
    this.el.querySelector('.bx-cd-label').textContent = props.label || 'Countdown';
    this.timeEl = this.el.querySelector('.bx-cd-time');
    root.appendChild(this.el);
    this.render(true);
    this.timer = setInterval(() => this.tick(), 1000);
  }

  tick() {
    if (this.remaining > 0) this.remaining--;
    this.render(false);
  }

  // Baut die mm:ss-Struktur einmalig auf: 4 rollende Ziffern + Separator.
  buildTimeStructure() {
    this.timeEl.innerHTML = '';
    this.digits = [];
    const addDigit = () => {
      const cell = document.createElement('span');
      cell.className = 'bx-cd-digit';
      const roll = document.createElement('span');
      roll.className = 'bx-cd-roll';
      cell.appendChild(roll);
      this.timeEl.appendChild(cell);
      this.digits.push({ cell, roll, value: null });
    };
    addDigit(); addDigit();
    const sep = document.createElement('span');
    sep.className = 'bx-cd-sep';
    sep.textContent = ':';
    this.timeEl.appendChild(sep);
    addDigit(); addDigit();
    this.lastText = null;
    this.showingDone = false;
  }

  // Setzt eine Ziffernzelle. Animiert nur, wenn der Wert sich ändert.
  setDigit(slot, ch, animate) {
    if (slot.value === ch) return;
    const prev = slot.value;
    slot.value = ch;
    if (!animate || prev === null) {
      // Initial / ohne Animation: direkt setzen, Strip oben.
      slot.cell.classList.remove('rolling');
      slot.roll.innerHTML = `<span>${ch}</span>`;
      slot.roll.style.transform = 'translateY(0)';
      return;
    }
    // Roll: alte Ziffer oben, neue darunter; Strip von -1em → 0 schieben,
    // sodass die alte nach oben raus und die neue rein slidet.
    slot.cell.classList.remove('rolling');
    slot.roll.innerHTML = `<span>${prev}</span><span>${ch}</span>`;
    slot.roll.style.transform = 'translateY(0)';
    // Reflow erzwingen, dann Transition starten (wie res.offsetWidth im wheel).
    void slot.cell.offsetWidth;
    slot.cell.classList.add('rolling');
    slot.roll.style.transform = 'translateY(-1em)';
  }

  render(initial) {
    if (this.remaining <= 0) {
      if (!this.showingDone) {
        this.timeEl.innerHTML = `<span class="bx-cd-done-text"></span>`;
        this.timeEl.querySelector('.bx-cd-done-text').textContent = this.doneText;
        this.digits = [];
        this.showingDone = true;
        this.lastText = null;
      }
      this.el.classList.add('done');
      this.el.classList.remove('urgent');
      return;
    }
    // Aus Done zurück (z.B. wenn neu konfiguriert) oder erster Aufbau.
    if (this.showingDone || this.digits.length === 0) this.buildTimeStructure();

    const m = Math.floor(this.remaining / 60), s = this.remaining % 60;
    const text = String(m).padStart(2, '0') + String(s).padStart(2, '0'); // 4 Ziffern
    const animate = !initial && this.lastText !== null;
    for (let i = 0; i < 4; i++) this.setDigit(this.digits[i], text[i], animate);
    this.lastText = text;
    this.el.classList.toggle('urgent', this.remaining <= 10);
  }

  /** Neuer Stream: Countdown frisch von der eingestellten Zeit starten. */
  onReset() {
    this.remaining = this.minutes * 60;
    this.showingDone = false;
    try { localStorage.setItem(this.storeKey, JSON.stringify({ minutes: this.minutes, endAt: Date.now() + this.remaining * 1000 })); } catch { /* egal */ }
    this.render(true);
  }

  destroy() { clearInterval(this.timer); this.el.remove(); }
}
