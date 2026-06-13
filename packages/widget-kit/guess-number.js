// guess-number.js — Zahlen-Raten: die App denkt sich eine Zahl aus (Bereich
// einstellbar, z.B. 0–9 oder 1–100), Zuschauer raten per Chat-Nachricht.
// Treffer: Kacheln flippen zur Zahl, Gewinner mit Name + Avatar, Sound —
// danach automatisch neue Runde (props.autoNewRound).
//
// Deterministisch: Geheimzahl aus (layerId + Rundennummer) — alle Overlay-
// Clients (OBS + TTLS) haben dieselbe Zahl und denselben Gewinner.
// props: { min?, max?, hints?, autoNewRound?, roundDelayMs?, winSoundId?,
//          title?, accent? }
const STYLE_ID = 'bx-gn-style';
const CSS = `
.bx-gn { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:10px; padding:14px; font-family: var(--bx-font-body); background: var(--bx-glass);
  border-radius: var(--bx-radius); box-shadow: var(--bx-shadow), 0 0 44px -16px var(--bx-accent);
  overflow:hidden; -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.bx-gn-title { font-family: var(--bx-font-display); font-size:16px; letter-spacing:.26em; text-transform:uppercase;
  color: var(--bx-text, #fff); text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent); text-align:center; }
.bx-gn-tiles { display:flex; gap:8px; perspective: 500px; }
.bx-gn-tile { width:62px; height:78px; border-radius:12px; display:flex; align-items:center; justify-content:center;
  font-family: var(--bx-font-num, var(--bx-font-display)); font-weight:800; font-size:44px; color: var(--bx-text, #fff);
  background: linear-gradient(165deg, rgba(255,255,255,.14), rgba(255,255,255,.04));
  border:1.5px solid color-mix(in srgb, var(--bx-accent) 55%, transparent);
  box-shadow: 0 6px 16px rgba(0,0,0,.45), 0 0 22px -8px var(--bx-accent);
  text-shadow: 0 0 16px color-mix(in srgb, var(--bx-accent) 70%, transparent); }
.bx-gn-tile.flip { animation: bx-gn-flip 600ms cubic-bezier(.2,1.2,.3,1); }
@keyframes bx-gn-flip { 0% { transform: rotateX(0); } 50% { transform: rotateX(90deg); } 100% { transform: rotateX(0); } }
.bx-gn-hint { min-height:20px; font-family: var(--bx-font-display); font-size:14px; letter-spacing:.1em;
  text-transform:uppercase; color: var(--bx-gold); text-shadow: 0 1px 4px rgba(0,0,0,.6); }
.bx-gn-hint.pulse { animation: bx-gn-pulse 450ms cubic-bezier(.2,1.4,.4,1); }
@keyframes bx-gn-pulse { 0% { transform: scale(.7); opacity:0; } 100% { transform: scale(1); opacity:1; } }
.bx-gn-sub { font-size:12px; color: var(--bx-muted); }
.bx-gn-win { display:flex; align-items:center; gap:10px; animation: bx-gn-pulse 500ms cubic-bezier(.2,1.5,.35,1); }
.bx-gn-win img { width:44px; height:44px; border-radius:50%; box-shadow: 0 0 0 3px var(--bx-gold), 0 0 18px var(--bx-gold); }
.bx-gn-win .who { font-family: var(--bx-font-display); font-size:20px; color: var(--bx-gold);
  text-transform:uppercase; text-shadow: 0 0 14px var(--bx-gold); }
.bx-gn-confetti { position:absolute; width:9px; height:9px; border-radius:2px; pointer-events:none;
  animation: bx-gn-conf var(--dur,1.4s) ease-out forwards; }
@keyframes bx-gn-conf { 0% { transform: translate(0,0) rotate(0); opacity:1; }
  100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); opacity:0; } }
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}
function rngInt(seedStr, min, max) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return min + ((h >>> 0) % (max - min + 1));
}
const CONF_COLORS = ['#ffd23e', '#21e6c1', '#ff5e8a', '#7c5cff', '#ffffff'];

export default class GuessNumberWidget {
  constructor(root, props, ctx) {
    ensureStyle();
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.ctx = ctx || {};
    this.min = Math.max(0, Number(props.min ?? 1));
    this.max = Math.max(this.min + 1, Number(props.max ?? 10));
    this.hints = props.hints !== false;
    this.autoNewRound = props.autoNewRound !== false;
    this.roundDelay = Math.max(1500, Number(props.roundDelayMs ?? 6000));
    this.winSound = props.winSoundId || '';
    this.round = 0;
    this.solved = false;
    this.digits = String(this.max).length;

    this.el = document.createElement('div');
    this.el.className = 'bx-gn';
    this.el.innerHTML = `
      <div class="bx-gn-title"></div>
      <div class="bx-gn-tiles"></div>
      <div class="bx-gn-hint"></div>
      <div class="bx-gn-sub"></div>`;
    this.el.querySelector('.bx-gn-title').textContent = props.title || 'Zahl erraten!';
    this.tilesEl = this.el.querySelector('.bx-gn-tiles');
    this.hintEl = this.el.querySelector('.bx-gn-hint');
    this.subEl = this.el.querySelector('.bx-gn-sub');
    root.appendChild(this.el);
    this.newRound(false);
  }

  newRound(animate) {
    this.round++;
    this.solved = false;
    this.secret = rngInt(`${this.ctx.layerId || 'guess'}-${this.round}`, this.min, this.max);
    this.hintEl.textContent = '';
    this.subEl.textContent = `Schreib eine Zahl von ${this.min} bis ${this.max} in den Chat!`;
    this.renderTiles('?', animate);
    const win = this.el.querySelector('.bx-gn-win');
    if (win) win.remove();
  }

  renderTiles(text, animate) {
    const chars = text === '?' ? Array(this.digits).fill('?') : String(text).padStart(this.digits, ' ').split('');
    this.tilesEl.innerHTML = '';
    for (const ch of chars) {
      const t = document.createElement('div');
      t.className = 'bx-gn-tile' + (animate ? ' flip' : '');
      t.textContent = ch.trim() === '' ? '' : ch;
      this.tilesEl.appendChild(t);
    }
  }

  onEvent(event) {
    if (this.solved || event.type !== 'chat') return;
    const text = (event.text ?? '').trim();
    if (!/^\d{1,4}$/.test(text)) return;
    const guess = parseInt(text, 10);
    if (guess < this.min || guess > this.max) return;

    if (guess === this.secret) {
      this.win(event.user);
    } else if (this.hints) {
      this.hintEl.textContent = guess < this.secret ? `${guess} — höher! ▲` : `${guess} — niedriger! ▼`;
      this.hintEl.classList.remove('pulse');
      void this.hintEl.offsetWidth;
      this.hintEl.classList.add('pulse');
    }
  }

  win(user) {
    this.solved = true;
    this.renderTiles(String(this.secret), true);
    this.hintEl.textContent = '';
    this.subEl.textContent = '';
    if (this.winSound) this.ctx.playSound?.(this.winSound);
    // Sieg fürs Spiel-Leaderboard melden (winId gleich auf allen Clients → 1× gezählt).
    if (user?.id) {
      this.ctx.reportWin?.(`${this.ctx.layerId || 'guess'}-${this.round}`, {
        id: user.id, nickname: user.nickname || 'Jemand', profilePic: user.profilePic,
      });
    }

    const w = document.createElement('div');
    w.className = 'bx-gn-win';
    const img = document.createElement('img');
    img.alt = '';
    if (user?.profilePic) img.src = user.profilePic; else img.style.display = 'none';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = `${user?.nickname ?? 'Jemand'} 🎉`;
    w.appendChild(img);
    w.appendChild(who);
    this.el.appendChild(w);
    this.confetti();

    if (this.autoNewRound) {
      this.roundTimer = setTimeout(() => this.newRound(true), this.roundDelay);
    }
  }

  confetti() {
    const rect = this.el.getBoundingClientRect();
    for (let i = 0; i < 26; i++) {
      const c = document.createElement('div');
      c.className = 'bx-gn-confetti';
      c.style.background = CONF_COLORS[i % CONF_COLORS.length];
      c.style.left = `${rect.width / 2}px`;
      c.style.top = `${rect.height * 0.4}px`;
      c.style.setProperty('--dx', `${(Math.random() - 0.5) * rect.width * 1.1}px`);
      c.style.setProperty('--dy', `${rect.height * (0.2 + Math.random() * 0.6)}px`);
      c.style.setProperty('--rot', `${(Math.random() - 0.5) * 720}deg`);
      c.style.setProperty('--dur', `${1 + Math.random() * 0.8}s`);
      this.el.appendChild(c);
      setTimeout(() => c.remove(), 2000);
    }
  }

  destroy() {
    if (this.roundTimer) clearTimeout(this.roundTimer);
    this.el.remove();
  }
}
