// guess-number.js — Zahlen-Raten: die App denkt sich eine Zahl aus (Bereich
// einstellbar, z.B. 0–9 oder 1–100), Zuschauer raten per Chat-Nachricht.
// Treffer: Kacheln flippen zur Zahl, Gewinner mit Name + Avatar, Sound —
// danach automatisch neue Runde (props.autoNewRound).
//
// Geheimzahl aus (Session-Seed + layerId + Rundennummer) — alle Overlay-Clients
// (OBS + TTLS) haben dieselbe Zahl/denselben Gewinner, aber JEDER Stream eine
// andere (Seed kommt pro Session vom Server via hello/reset).
// props: { min?, max?, hints?, autoNewRound?, roundDelayMs?, winSoundId?,
//          title?, accent? }
const STYLE_ID = 'bx-gn-style';
const CSS = `
/* Alles hier war vorher in festen Pixeln — beim Vergrößern des Widgets blieb
   die Karte winzig in der Mitte stehen. Jetzt hängt eine einzige Basisgröße
   (font-size auf .bx-gn) an der Box, alles darunter ist in em ausgedrückt. */
.bx-gn { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  container-type:size; font-size: calc((clamp(9px, 5.6cqmin, 64px)) * var(--bx-fs, 1));
  gap:.62em; padding:.9em; font-family: var(--bx-font-body); background: var(--bx-glass);
  border-radius: var(--bx-radius); box-shadow: var(--bx-shadow), 0 0 44px -16px var(--bx-accent);
  overflow:hidden; -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.bx-gn-title { font-family: var(--bx-font-display); font-size:1em; letter-spacing:.26em; text-transform:uppercase;
  color: var(--bx-text, #fff); text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent); text-align:center; }
.bx-gn-tiles { display:flex; gap:.5em; perspective: 500px; }
/* Achtung: die Kachel setzt selbst font-size:2.75em — alle weiteren em in
   DIESER Regel beziehen sich deshalb auf die Kachelschrift, nicht auf die
   Basisgröße. 1.41em/1.77em entsprechen den früheren 62x78px bei 44px Schrift. */
.bx-gn-tile { width:1.41em; height:1.77em; border-radius:.28em; display:flex; align-items:center; justify-content:center;
  font-family: var(--bx-font-num, var(--bx-font-display)); font-weight:800; font-size:2.75em; color: var(--bx-text, #fff);
  background: linear-gradient(165deg, rgba(255,255,255,.14), rgba(255,255,255,.04));
  border:max(1.5px,.035em) solid color-mix(in srgb, var(--bx-accent) 55%, transparent);
  box-shadow: 0 .13em .36em rgba(0,0,0,.45), 0 0 .5em -.18em var(--bx-accent);
  text-shadow: 0 0 16px color-mix(in srgb, var(--bx-accent) 70%, transparent); }
.bx-gn-tile.flip { animation: bx-gn-flip 600ms cubic-bezier(.2,1.2,.3,1); }
@keyframes bx-gn-flip { 0% { transform: rotateX(0); } 50% { transform: rotateX(90deg); } 100% { transform: rotateX(0); } }
.bx-gn-hint { min-height:1.25em; font-family: var(--bx-font-display); font-size:.88em; letter-spacing:.1em;
  text-transform:uppercase; color: var(--bx-gold); text-shadow: 0 1px 4px rgba(0,0,0,.6); }
.bx-gn-hint.pulse { animation: bx-gn-pulse 450ms cubic-bezier(.2,1.4,.4,1); }
@keyframes bx-gn-pulse { 0% { transform: scale(.7); opacity:0; } 100% { transform: scale(1); opacity:1; } }
.bx-gn-sub { font-size:.75em; color: var(--bx-muted); text-align:center; }
.bx-gn-win { display:flex; align-items:center; gap:.62em; animation: bx-gn-pulse 500ms cubic-bezier(.2,1.5,.35,1); }
.bx-gn-win img { width:2.75em; height:2.75em; border-radius:50%; box-shadow: 0 0 0 .19em var(--bx-gold), 0 0 1.1em var(--bx-gold); }
.bx-gn-win .who { font-family: var(--bx-font-display); font-size:1.25em; color: var(--bx-gold);
  text-transform:uppercase; text-shadow: 0 0 14px var(--bx-gold); }
.bx-gn-confetti { position:absolute; width:.56em; height:.56em; border-radius:2px; pointer-events:none;
  animation: bx-gn-conf var(--dur,1.4s) ease-out forwards; }
@keyframes bx-gn-conf { 0% { transform: translate(0,0) rotate(0); opacity:1; }
  100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)); opacity:0; } }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur an Titel, Kacheln, Hinweis und Hilfstext.
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-gn-title { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-gn-tile { -webkit-text-stroke: max(1.5px, .06em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-gn-hint { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-gn-sub { color: #fff; -webkit-text-stroke: max(1.5px, .11em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-gn-win .who { -webkit-text-stroke: max(1.5px, .08em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
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
    // Rundenstand pro Session merken: Nach einem Reload/Reconnect dieser Quelle
    // würde round sonst wieder bei 1 starten — andere Quellen (OBS/TTLS) sind
    // aber längst bei Runde N → andere Geheimzahl + kaputte Sieg-Dedup.
    this.storeKey = `bx-gn-${this.ctx.layerId || 'guess'}`;
    try {
      const saved = JSON.parse(localStorage.getItem(this.storeKey) || 'null');
      if (saved && saved.seed === (this.ctx.sessionSeed || '')) this.round = Number(saved.round) || 0;
    } catch { /* korrupter Eintrag → Runde 0 */ }

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
    // Editor-Schaufenster: laufende Runde andeuten, damit die Hinweiszeile nicht
    // tot wirkt. Bewusst OHNE win() — das würde einen Fake-Sieg ans Spiel-
    // Leaderboard melden.
    if (this.ctx.preview) this.startPreview();
  }

  startPreview() {
    const mid = Math.floor((this.min + this.max) / 2);
    const demo = [
      `${this.min} — höher! ▲`,
      `${this.max} — niedriger! ▼`,
      `${mid} — höher! ▲`,
    ];
    let i = 0;
    const show = () => {
      this.hintEl.textContent = demo[i % demo.length];
      this.hintEl.classList.remove('pulse');
      void this.hintEl.offsetWidth;
      this.hintEl.classList.add('pulse');
      i += 1;
    };
    show();
    this.previewTimer = setInterval(show, 2200);
  }

  newRound(animate) {
    this.round++;
    this.solved = false;
    try { localStorage.setItem(this.storeKey, JSON.stringify({ seed: this.ctx.sessionSeed || '', round: this.round })); } catch { /* voll/blockiert — egal */ }
    this.secret = rngInt(`${this.ctx.sessionSeed || ''}-${this.ctx.layerId || 'guess'}-${this.round}`, this.min, this.max);
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
    if (event.sticky) return; // Reconnect-Replay: rehydriert nur Anzeigen, keine Effekte/Zähler
    if (this.solved || event.type !== 'chat') return;
    const text = (event.text ?? '').trim();
    // So viele Ziffern zulassen, wie das Maximum hat — sonst wäre das Spiel bei
    // Bereichen > 9999 unlösbar (korrekte Tipps würden vor dem Vergleich verworfen).
    if (!new RegExp(`^\\d{1,${this.digits}}$`).test(text)) return;
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

  /** Neuer Stream (neuer Session-Seed): Rundenzähler + gemerkten Stand leeren. */
  onReset() {
    if (this.roundTimer) clearTimeout(this.roundTimer);
    try { localStorage.removeItem(this.storeKey); } catch { /* egal */ }
    this.round = 0;
    this.newRound(true);
    if (this.ctx.preview && !this.previewTimer) this.startPreview();
  }

  destroy() {
    if (this.roundTimer) clearTimeout(this.roundTimer);
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.el.remove();
  }
}
