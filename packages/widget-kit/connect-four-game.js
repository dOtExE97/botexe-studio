// connect-four-game.js — 4-Gewinnt-Overlay-Widget. Zeigt das Spielbrett (7 Spalten
// x 6 Reihen) mit roten/gelben Steinen, die Spielernamen + wer am Zug ist, und
// die Gewinnsituation (aufleuchtende Gewinn-Steine) bzw. Unentschieden.
// Daten kommen via onGameState({ gameKind:'connect-four', state }).
// state = {
//   board: (null|'R'|'Y')[6][7]   // board[Reihe][Spalte], Reihe 0 = oben
//   players: { R?:{nickname}, Y?:{nickname} }
//   turn: 'R'|'Y'
//   status: 'waiting'|'playing'|'won'|'draw'
//   winner?: { nickname }
//   winCells?: Array<[r,c]>        // aufleuchtende Gewinn-Felder
// }
// props: { accent }
const GAME_KIND = 'connect-four';
const STYLE_ID = 'bx-c4-style';
const ROWS = 6;
const COLS = 7;
const CSS = `
.bx-c4 { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:.5em; container-type:size; font-family: var(--bx-font-body); color:#fff; text-align:center;
  --bx-c4-accent: var(--bx-accent,#ff5436); --bx-c4-r:#ff4757; --bx-c4-y:#ffd32a; }
/* Kopfzeile: beide Spieler, der Aktive leuchtet */
.bx-c4-players { display:flex; align-items:center; justify-content:center; gap:.6em; font-size: clamp(11px, 4.4cqmin, 19px);
  font-family: var(--bx-font-display, inherit); font-weight:800; line-height:1.05; max-width:96%; }
.bx-c4-pl { display:flex; align-items:center; gap:.35em; padding:.18em .5em; border-radius:.6em; opacity:.55;
  transition:opacity .25s ease, box-shadow .25s ease; white-space:nowrap; max-width:42cqmin; overflow:hidden; text-overflow:ellipsis; }
.bx-c4-pl.active { opacity:1; box-shadow:0 0 0 2px color-mix(in srgb, var(--bx-c4-accent) 70%, transparent), 0 0 14px color-mix(in srgb, var(--bx-c4-accent) 45%, transparent); }
.bx-c4-dot { width:.85em; height:.85em; border-radius:50%; flex:none; box-shadow:0 0 6px rgba(0,0,0,.4); }
.bx-c4-dot.R { background:var(--bx-c4-r); } .bx-c4-dot.Y { background:var(--bx-c4-y); }
.bx-c4-vs { font-size:.78em; opacity:.6; }
/* Status-Zeile */
.bx-c4-status { font-size: clamp(11px, 4.2cqmin, 18px); font-weight:700; min-height:1.2em;
  color: color-mix(in srgb, var(--bx-c4-accent) 60%, #fff); text-shadow:0 1px 6px rgba(0,0,0,.5); }
.bx-c4.won .bx-c4-status { color: var(--bx-gold,#ffd700); }
/* Spielfeld: blaues Brett mit Loch-Rastern */
.bx-c4-grid { display:grid; grid-template-columns:repeat(${COLS}, 1fr); gap: 1.2cqmin;
  padding: 1.4cqmin; border-radius: 2cqmin; background:linear-gradient(160deg,#2b4cdb,#1b2f8f);
  box-shadow:0 8px 26px rgba(0,0,0,.45), inset 0 0 18px rgba(0,0,0,.3); width: 78cqmin; max-width:96%; }
.bx-c4-colhdr { display:grid; grid-template-columns:repeat(${COLS}, 1fr); gap:1.2cqmin; width:78cqmin; max-width:96%; padding:0 1.4cqmin;
  font-size: clamp(9px, 3.2cqmin, 14px); font-weight:800; color:#ffffffaa; }
.bx-c4-cell { aspect-ratio:1/1; border-radius:50%; background:radial-gradient(circle at 35% 30%, #0c1430, #060a1c);
  box-shadow:inset 0 2px 5px rgba(0,0,0,.6); display:grid; place-items:center; }
.bx-c4-cell .pc { width:86%; height:86%; border-radius:50%; transform:scale(0); transition:transform .18s cubic-bezier(.2,1.6,.35,1); }
.bx-c4-cell .pc.set { transform:scale(1); }
.bx-c4-cell .pc.R { background:radial-gradient(circle at 35% 30%, #ff7b86, var(--bx-c4-r)); box-shadow:0 1px 4px rgba(0,0,0,.5); }
.bx-c4-cell .pc.Y { background:radial-gradient(circle at 35% 30%, #fff0a0, var(--bx-c4-y)); box-shadow:0 1px 4px rgba(0,0,0,.5); }
.bx-c4-cell.win .pc { animation: bx-c4-glow 1s ease-in-out infinite; }
@keyframes bx-c4-glow { 0%,100% { box-shadow:0 0 0 rgba(255,255,255,.0); filter:brightness(1); }
  50% { box-shadow:0 0 14px 4px rgba(255,255,255,.85); filter:brightness(1.35); } }
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
  }
}

/** Leeres 6x7-Brett (alle Felder null). Reine Logik. */
export function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
}

/** winCells (Array von [r,c]) in ein Set "r,c" wandeln — schnelles Nachschlagen
 *  beim Rendern. Toleriert undefined/leer. */
export function winSet(winCells) {
  const set = new Set();
  if (Array.isArray(winCells)) {
    for (const rc of winCells) {
      if (Array.isArray(rc) && rc.length >= 2) set.add(`${rc[0]},${rc[1]}`);
    }
  }
  return set;
}

export default class ConnectFourWidget {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    this.p = props || {};
    if (this.p.accent) root.style.setProperty('--bx-accent', this.p.accent);

    this.el = document.createElement('div');
    this.el.className = 'bx-c4';
    // Kopf (Spieler), Status, Spaltennummern, Spielfeld
    this.el.innerHTML = `
      <div class="bx-c4-players">
        <div class="bx-c4-pl" data-pl="R"><span class="bx-c4-dot R"></span><span class="bx-c4-name" data-name="R">Rot</span></div>
        <span class="bx-c4-vs">vs</span>
        <div class="bx-c4-pl" data-pl="Y"><span class="bx-c4-dot Y"></span><span class="bx-c4-name" data-name="Y">Gelb</span></div>
      </div>
      <div class="bx-c4-status"></div>
      <div class="bx-c4-colhdr"></div>
      <div class="bx-c4-grid"></div>`;
    root.appendChild(this.el);

    // Spaltennummern 1-7 als Hinweis
    const hdr = this.el.querySelector('.bx-c4-colhdr');
    for (let c = 0; c < COLS; c++) {
      const s = document.createElement('div'); s.textContent = String(c + 1); hdr.appendChild(s);
    }
    // Zellen einmalig anlegen, danach nur noch Klassen umschalten.
    this.grid = this.el.querySelector('.bx-c4-grid');
    this.cells = [];
    for (let r = 0; r < ROWS; r++) {
      this.cells[r] = [];
      for (let c = 0; c < COLS; c++) {
        const cell = document.createElement('div'); cell.className = 'bx-c4-cell';
        const pc = document.createElement('div'); pc.className = 'pc';
        cell.appendChild(pc); this.grid.appendChild(cell);
        this.cells[r][c] = cell;
      }
    }

    this.state = null;
    // Editor-Schaufenster: Demo-Stand zeigen.
    if (this.ctx.preview) this.state = this.demoState();
    this.render();
  }

  /** Demo-Zustand fürs Editor-Schaufenster: ein paar Steine + Rot am Zug. */
  demoState() {
    const board = emptyBoard();
    board[5][3] = 'R'; board[5][2] = 'Y'; board[4][3] = 'Y';
    board[5][3] = 'R'; board[5][4] = 'R'; board[4][2] = 'R';
    board[5][1] = 'Y'; board[3][3] = 'Y';
    return {
      board,
      players: { R: { nickname: 'ExE' }, Y: { nickname: 'Chat' } },
      turn: 'R', status: 'playing',
    };
  }

  /** Nur auf den eigenen gameKind reagieren, sonst ignorieren. Dann neu rendern. */
  onGameState(msg) {
    if (!msg || msg.gameKind !== GAME_KIND) return;
    this.state = msg.state || null;
    this.render();
  }

  /** Optionale Effekte (z.B. bei 'win'). Reagiert nur auf eigenen gameKind. */
  onGameEvent(msg) {
    if (!msg || msg.gameKind !== GAME_KIND) return;
    if (msg.type === 'win' || msg.event === 'win') this.flash();
  }

  /** Kurzes Aufblitzen des Bretts als Gewinn-Effekt. */
  flash() {
    if (!this.grid) return;
    this.grid.style.transition = 'filter .15s ease';
    this.grid.style.filter = 'brightness(1.6)';
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => { if (this.grid) this.grid.style.filter = ''; }, 220);
  }

  render() {
    const st = this.state;
    const board = (st && Array.isArray(st.board)) ? st.board : emptyBoard();
    const players = (st && st.players) || {};
    const status = (st && st.status) || 'waiting';
    const turn = (st && st.turn) || 'R';
    const wins = winSet(st && st.winCells);

    this.el.classList.toggle('won', status === 'won');

    // Spielernamen
    const nameR = (players.R && players.R.nickname) || 'Rot';
    const nameY = (players.Y && players.Y.nickname) || 'Gelb';
    this.el.querySelector('[data-name="R"]').textContent = nameR;
    this.el.querySelector('[data-name="Y"]').textContent = nameY;

    // Aktiver Spieler nur während des Spiels markieren.
    const plR = this.el.querySelector('[data-pl="R"]');
    const plY = this.el.querySelector('[data-pl="Y"]');
    plR.classList.toggle('active', status === 'playing' && turn === 'R');
    plY.classList.toggle('active', status === 'playing' && turn === 'Y');

    // Status-Text
    const statusEl = this.el.querySelector('.bx-c4-status');
    if (status === 'waiting') {
      statusEl.textContent = '!join zum Mitspielen';
    } else if (status === 'won') {
      const wn = (st && st.winner && st.winner.nickname) || (turn === 'R' ? nameR : nameY);
      statusEl.textContent = `🏆 ${wn} gewinnt!`;
    } else if (status === 'draw') {
      statusEl.textContent = 'Unentschieden!';
    } else {
      statusEl.textContent = `${turn === 'R' ? nameR : nameY} ist am Zug`;
    }

    // Brett: Steine + Gewinn-Hervorhebung
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.cells[r][c];
        const pc = cell.firstChild;
        const v = (board[r] && board[r][c]) || null;
        pc.className = 'pc' + (v ? ` set ${v}` : '');
        cell.classList.toggle('win', status === 'won' && wins.has(`${r},${c}`));
      }
    }
  }

  destroy() {
    clearTimeout(this._flashT);
    if (this.el) this.el.remove();
  }
}
