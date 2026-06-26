// hangman-game.js — Galgenmännchen-Overlay. Zeigt das gesuchte Wort als Reihe
// von Buchstaben-Slots (aufgedeckte hervorgehoben, verdeckte als "_"), die
// Fehlversuche als Herz-Leiste (wrong/maxWrong) und die bereits geratenen
// Buchstaben (falsche durchgestrichen + rot). Bei 'won' grüner Glow, bei 'lost'
// rot. Daten kommen über onGameState({ gameKind, state }) und reagieren nur auf
// gameKind 'hangman'. Größe ~380x150, skaliert per em/cqmin → Hochkant-tauglich.
// props: { accent }
const GAME_KIND = 'hangman';
const STYLE_ID = 'bx-hm-style';
const CSS = `
.bx-hm { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:.55em; container-type:size; font-family: var(--bx-font-display, var(--bx-font-body, sans-serif));
  --bx-hm-accent: var(--bx-accent, #ff5436); }
/* Karte mit fester Zielgröße ~380x150 — skaliert mit, wenn der Layer gezoomt wird */
.bx-hm-card { width: clamp(280px, 96cqi, 380px); padding: .9em 1em; border-radius: .9em; box-sizing:border-box;
  display:flex; flex-direction:column; align-items:center; gap:.5em;
  background: linear-gradient(160deg, rgba(18,18,26,.96), rgba(10,10,16,.96)); color:#fff;
  border:1px solid color-mix(in srgb, var(--bx-hm-accent) 50%, transparent);
  box-shadow: 0 10px 40px rgba(0,0,0,.5), 0 0 30px color-mix(in srgb, var(--bx-hm-accent) 28%, transparent);
  transition: box-shadow .4s ease, border-color .4s ease; }
.bx-hm.won .bx-hm-card { border-color: var(--bx-teal, #2ee6a6);
  box-shadow: 0 10px 40px rgba(0,0,0,.5), 0 0 38px color-mix(in srgb, var(--bx-teal,#2ee6a6) 65%, transparent); }
.bx-hm.lost .bx-hm-card { border-color: #ff4d4d;
  box-shadow: 0 10px 40px rgba(0,0,0,.5), 0 0 38px rgba(255,77,77,.6); }
/* Wort-Zeile: jeder Slot eine Box */
.bx-hm-word { display:flex; flex-wrap:wrap; justify-content:center; gap:.28em; }
.bx-hm-slot { min-width:1.1em; height:1.5em; padding:0 .18em; display:grid; place-items:center;
  font-weight:800; font-size:clamp(15px, 8cqmin, 26px); line-height:1; border-radius:.22em;
  background:rgba(255,255,255,.06); border-bottom:.14em solid rgba(255,255,255,.25); color:#fff8;
  text-transform:uppercase; transition: color .2s ease, background .2s ease, border-color .2s ease; }
.bx-hm-slot.filled { color:#fff; background:color-mix(in srgb, var(--bx-hm-accent) 28%, transparent);
  border-bottom-color: var(--bx-hm-accent);
  text-shadow: 0 0 10px color-mix(in srgb, var(--bx-hm-accent) 60%, transparent); }
.bx-hm-slot.space { background:none; border:none; min-width:.5em; }
.bx-hm.won .bx-hm-slot.filled { background:color-mix(in srgb, var(--bx-teal,#2ee6a6) 30%, transparent);
  border-bottom-color: var(--bx-teal,#2ee6a6); text-shadow:0 0 10px color-mix(in srgb, var(--bx-teal,#2ee6a6) 70%, transparent); }
.bx-hm.lost .bx-hm-slot.filled { color:#ffd0d0; }
/* Fehlversuch-Leiste (Herzen) */
.bx-hm-hearts { display:flex; gap:.18em; font-size:clamp(13px, 6cqmin, 20px); line-height:1; }
.bx-hm-heart { opacity:1; transition: transform .2s ease, opacity .2s ease; }
.bx-hm-heart.lost { opacity:.28; filter:grayscale(1); transform:scale(.85); }
/* Reihe der geratenen Buchstaben */
.bx-hm-guessed { display:flex; flex-wrap:wrap; justify-content:center; gap:.2em;
  font-size:clamp(10px, 4.4cqmin, 14px); }
.bx-hm-g { padding:.06em .32em; border-radius:.3em; font-weight:700; text-transform:uppercase;
  background:rgba(255,255,255,.08); color:#fff; }
.bx-hm-g.wrong { background:rgba(255,77,77,.18); color:#ff8a8a; text-decoration:line-through; }
.bx-hm-status { font-size:clamp(11px, 5cqmin, 16px); font-weight:800; letter-spacing:.02em; }
.bx-hm.won .bx-hm-status { color: var(--bx-teal,#2ee6a6); }
.bx-hm.lost .bx-hm-status { color:#ff6b6b; }
/* Konfetti bei Gewinn */
.bx-hm-confetti { position:absolute; top:0; left:50%; width:.5em; height:.8em; border-radius:1px;
  pointer-events:none; animation: bx-hm-fall 1.2s ease-in forwards; }
@keyframes bx-hm-fall { 0%{transform:translate(-50%,-10%) rotate(0);opacity:1} 100%{transform:translate(var(--bx-hm-dx,0),120cqh) rotate(540deg);opacity:0} }
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }
}

// Demo-Zustand fürs Editor-Schaufenster.
const DEMO_STATE = {
  masked: '_ A _ _ E', wrong: 2, maxWrong: 6,
  guessed: ['A', 'E', 'X', 'Q'], status: 'playing',
  lastGuesser: { nickname: 'ExE' },
};

export default class HangmanGame {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    this.p = props || {};
    if (this.p.accent) root.style.setProperty('--bx-accent', this.p.accent);

    this.el = document.createElement('div');
    this.el.className = 'bx-hm';
    this.el.innerHTML = '<div class="bx-hm-card">'
      + '<div class="bx-hm-word"></div>'
      + '<div class="bx-hm-hearts"></div>'
      + '<div class="bx-hm-guessed"></div>'
      + '<div class="bx-hm-status"></div>'
      + '</div>';
    root.appendChild(this.el);
    this.card = this.el.querySelector('.bx-hm-card');

    this.state = null;
    this._timers = [];
    // Editor-Schaufenster: Demo zeigen.
    if (this.ctx.preview) this.render(DEMO_STATE);
  }

  // Nur auf den eigenen gameKind reagieren, sonst ignorieren.
  onGameState(msg) {
    if (!msg || msg.gameKind !== GAME_KIND || !msg.state) return;
    this.render(msg.state);
  }

  // Effekte (z.B. Konfetti bei 'win'). Reagiert nur auf eigenen gameKind.
  onGameEvent(msg) {
    if (!msg || msg.gameKind !== GAME_KIND) return;
    const type = msg.type || (msg.event && msg.event.type);
    if (type === 'win' || type === 'won') this.celebrate();
  }

  render(state) {
    if (!state) return;
    this.state = state;
    const status = state.status || 'playing';
    this.el.classList.toggle('won', status === 'won');
    this.el.classList.toggle('lost', status === 'lost');

    // Wort-Zeile: masked aufsplitten. Token (Buchstabe/"_") werden zu Slots,
    // Leerzeichen zwischen Tokens werden ignoriert; ein "/" oder echtes Wort-
    // Leerzeichen kannst du im masked als doppeltes Leerzeichen kodieren.
    const word = this.el.querySelector('.bx-hm-word');
    word.innerHTML = '';
    const tokens = this.tokenize(state.masked);
    for (const t of tokens) {
      const slot = document.createElement('div');
      if (t === ' ') { slot.className = 'bx-hm-slot space'; }
      else {
        const filled = t !== '_';
        slot.className = 'bx-hm-slot' + (filled ? ' filled' : '');
        slot.textContent = filled ? t : '';
      }
      word.appendChild(slot);
    }

    // Fehlversuch-Herzen (übrig = maxWrong - wrong).
    const max = Math.max(0, Math.floor(Number(state.maxWrong) || 0));
    const wrong = Math.max(0, Math.min(max, Math.floor(Number(state.wrong) || 0)));
    const hearts = this.el.querySelector('.bx-hm-hearts');
    hearts.innerHTML = '';
    for (let i = 0; i < max; i++) {
      const h = document.createElement('span');
      h.className = 'bx-hm-heart' + (i < wrong ? ' lost' : '');
      h.textContent = i < wrong ? '🖤' : '❤️';
      hearts.appendChild(h);
    }

    // Geratene Buchstaben — falsche (nicht im masked enthalten) rot/durchgestrichen.
    const guessed = Array.isArray(state.guessed) ? state.guessed : [];
    const inWord = new Set(tokens.filter((t) => t !== '_' && t !== ' ').map((t) => t.toUpperCase()));
    const gWrap = this.el.querySelector('.bx-hm-guessed');
    gWrap.innerHTML = '';
    for (const raw of guessed) {
      const g = String(raw).toUpperCase();
      const isWrong = !inWord.has(g);
      const tag = document.createElement('span');
      tag.className = 'bx-hm-g' + (isWrong ? ' wrong' : '');
      tag.textContent = g;
      gWrap.appendChild(tag);
    }

    // Status-Zeile.
    const sEl = this.el.querySelector('.bx-hm-status');
    const who = state.lastGuesser && state.lastGuesser.nickname ? state.lastGuesser.nickname : '';
    if (status === 'won') sEl.textContent = who ? `🏆 ${who} hat gelöst!` : '🏆 Gelöst!';
    else if (status === 'lost') sEl.textContent = '💀 Verloren';
    else sEl.textContent = who ? `${who} ist dran` : 'Rate einen Buchstaben!';

    if (status === 'won' && !this._celebrated) { this._celebrated = true; this.celebrate(); }
    if (status !== 'won') this._celebrated = false;
  }

  // masked in Tokens zerlegen. Einfach-Leerzeichen = Trenner zwischen Slots,
  // Doppel-Leerzeichen = echter Wort-Abstand (eigener leerer Slot).
  tokenize(masked) {
    const str = String(masked == null ? '' : masked);
    const out = [];
    let i = 0;
    while (i < str.length) {
      const c = str[i];
      if (c === ' ') {
        if (str[i + 1] === ' ') { out.push(' '); i += 2; } // echter Wort-Abstand
        else i += 1;                                        // Slot-Trenner
        continue;
      }
      out.push(c); i += 1;
    }
    return out;
  }

  // Kurzer Konfetti-Regen über der Karte.
  celebrate() {
    const colors = ['#2ee6a6', '#ffd54a', '#ff5436', '#5ad1ff', '#ff8fc7'];
    for (let i = 0; i < 16; i++) {
      const c = document.createElement('div');
      c.className = 'bx-hm-confetti';
      c.style.background = colors[i % colors.length];
      c.style.setProperty('--bx-hm-dx', `${(Math.random() * 200 - 100).toFixed(0)}px`);
      c.style.left = `${(Math.random() * 80 + 10).toFixed(0)}%`;
      c.style.animationDelay = `${(Math.random() * 0.25).toFixed(2)}s`;
      this.el.appendChild(c);
      const t = setTimeout(() => c.remove(), 1600);
      this._timers.push(t);
    }
  }

  destroy() {
    this._timers.forEach((t) => clearTimeout(t));
    this._timers = [];
    this.el.remove();
  }
}
