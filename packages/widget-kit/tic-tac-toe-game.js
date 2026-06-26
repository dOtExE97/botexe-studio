// tic-tac-toe-game.js — Tic-Tac-Toe-Overlay. Zwei Zuschauer spielen per Chat
// gegeneinander (X gegen O), das Widget zeigt nur den Spielzustand an. Der Zustand
// kommt von außen über onGameState({ gameKind:'tic-tac-toe', state }).
//
// state = { board:(null|'X'|'O')[9], players:{ X?:{nickname}, O?:{nickname} },
//           turn:'X'|'O', status:'waiting'|'playing'|'won'|'draw',
//           winner?:{nickname}, winLine?:number[] }
//
// Render: 3x3-Gitter (~320x360). Leere Felder zeigen ihre Feld-Nummer 1–9 als
// dezenten Hinweis (zum Mitspielen per Chat). X und O farblich getrennt, groß
// gesetzt. Oben beide Spieler-Namen, der aktive (turn) markiert. Bei 'won' wird
// die winLine hervorgehoben + Gewinner gezeigt, 'draw' = Unentschieden,
// 'waiting' = "!join zum Mitspielen".
// props: { accent }

const GAME_KIND = 'tic-tac-toe';
const STYLE_ID = 'bx-ttt-style';
const CSS = `
.bx-ttt { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:.7em; padding:.8em; container-type:size; font-family: var(--bx-font-body); font-size:16px; text-align:center;
  --bx-x: var(--bx-accent, #ff5436); --bx-o: var(--bx-teal, #2ad4c8); }
/* Spieler-Leiste */
.bx-ttt-players { display:flex; align-items:stretch; gap:.5em; width:100%; max-width:20em; }
.bx-ttt-p { flex:1; display:flex; flex-direction:column; gap:.1em; padding:.45em .5em; border-radius:.7em;
  background:linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.03));
  border:2px solid transparent; min-width:0; transition:border-color .2s ease, box-shadow .2s ease; }
.bx-ttt-p .mark { font-family:var(--bx-font-display, inherit); font-weight:800; font-size:1.5em; line-height:1; }
.bx-ttt-p.x .mark { color:var(--bx-x); text-shadow:0 0 12px color-mix(in srgb, var(--bx-x) 60%, transparent); }
.bx-ttt-p.o .mark { color:var(--bx-o); text-shadow:0 0 12px color-mix(in srgb, var(--bx-o) 60%, transparent); }
.bx-ttt-p .name { font-size:.82em; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-ttt-p.x.active { border-color:var(--bx-x); box-shadow:0 0 18px -4px var(--bx-x); }
.bx-ttt-p.o.active { border-color:var(--bx-o); box-shadow:0 0 18px -4px var(--bx-o); }
.bx-ttt-p.active .name { font-weight:700; }
/* Gitter */
.bx-ttt-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:.45em; width:100%; max-width:18em; aspect-ratio:1/1; }
.bx-ttt-cell { position:relative; display:flex; align-items:center; justify-content:center; border-radius:.6em;
  background:linear-gradient(165deg, rgba(255,255,255,.12), rgba(255,255,255,.03));
  border:1.5px solid color-mix(in srgb, var(--bx-accent, #fff) 35%, transparent);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08); overflow:hidden; }
.bx-ttt-cell .num { font-family:var(--bx-font-num, var(--bx-font-display, inherit)); font-weight:700;
  font-size:1.1em; color:#ffffff40; }
.bx-ttt-cell .pick { font-family:var(--bx-font-display, inherit); font-weight:800; font-size:2.6em; line-height:1;
  animation:bx-ttt-pop .35s cubic-bezier(.2,1.5,.35,1); }
.bx-ttt-cell .pick.x { color:var(--bx-x); text-shadow:0 0 14px color-mix(in srgb, var(--bx-x) 65%, transparent); }
.bx-ttt-cell .pick.o { color:var(--bx-o); text-shadow:0 0 14px color-mix(in srgb, var(--bx-o) 65%, transparent); }
@keyframes bx-ttt-pop { 0%{transform:scale(.4);opacity:0} 100%{transform:scale(1);opacity:1} }
.bx-ttt-cell.win { background:linear-gradient(165deg, color-mix(in srgb, var(--bx-gold, #ffd34d) 40%, transparent), rgba(255,255,255,.05));
  border-color:var(--bx-gold, #ffd34d); box-shadow:0 0 20px -4px var(--bx-gold, #ffd34d); animation:bx-ttt-flash .8s ease-in-out infinite alternate; }
@keyframes bx-ttt-flash { from{box-shadow:0 0 12px -6px var(--bx-gold,#ffd34d)} to{box-shadow:0 0 26px -2px var(--bx-gold,#ffd34d)} }
/* Status-Zeile */
.bx-ttt-status { min-height:1.3em; font-family:var(--bx-font-display, inherit); font-weight:800; font-size:1em;
  letter-spacing:.04em; color:#fff; text-shadow:0 0 12px color-mix(in srgb, var(--bx-accent, #fff) 50%, transparent); }
.bx-ttt-status.win { color:var(--bx-gold, #ffd34d); text-shadow:0 0 16px color-mix(in srgb, var(--bx-gold,#ffd34d) 70%, transparent);
  animation:bx-ttt-pop .5s cubic-bezier(.2,1.5,.35,1); }
.bx-ttt-status.draw { color:var(--bx-muted, #9aa0ac); }
.bx-ttt-status.waiting { color:var(--bx-gold, #ffd34d); }
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = CSS;
    document.head.appendChild(s);
  }
}

export default class TicTacToeWidget {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    this.props = props || {};
    if (this.props.accent) root.style.setProperty('--bx-accent', this.props.accent);

    // Aktueller Zustand (anfangs leer/waiting).
    this.state = this._emptyState();

    this.el = document.createElement('div');
    this.el.className = 'bx-ttt';
    this.el.innerHTML = `
      <div class="bx-ttt-players">
        <div class="bx-ttt-p x" data-p="X"><span class="mark">X</span><span class="name"></span></div>
        <div class="bx-ttt-p o" data-p="O"><span class="mark">O</span><span class="name"></span></div>
      </div>
      <div class="bx-ttt-grid"></div>
      <div class="bx-ttt-status"></div>`;
    this.gridEl = this.el.querySelector('.bx-ttt-grid');
    this.statusEl = this.el.querySelector('.bx-ttt-status');
    this.nameX = this.el.querySelector('.bx-ttt-p.x .name');
    this.nameO = this.el.querySelector('.bx-ttt-p.o .name');
    this.pX = this.el.querySelector('.bx-ttt-p.x');
    this.pO = this.el.querySelector('.bx-ttt-p.o');

    // 9 Zellen einmalig aufbauen.
    this.cells = [];
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement('div');
      cell.className = 'bx-ttt-cell';
      this.gridEl.appendChild(cell);
      this.cells.push(cell);
    }
    root.appendChild(this.el);

    // Im Editor-Schaufenster einen Demo-Zustand zeigen.
    if (this.ctx.preview) this.state = this._demoState();
    this.render();
  }

  _emptyState() {
    return { board: Array(9).fill(null), players: {}, turn: 'X', status: 'waiting', winner: null, winLine: null };
  }

  // Demo: laufende Partie kurz vor dem Sieg von X (Diagonale).
  _demoState() {
    const board = ['X', 'O', null, 'O', 'X', null, null, null, 'X'];
    return {
      board,
      players: { X: { nickname: 'ExE' }, O: { nickname: 'Chat-Gegner' } },
      turn: 'X',
      status: 'won',
      winner: { nickname: 'ExE' },
      winLine: [0, 4, 8],
    };
  }

  // Spielzustand von außen — nur auf eigenen gameKind reagieren.
  onGameState(msg) {
    if (!msg || msg.gameKind !== GAME_KIND || !msg.state) return;
    const s = msg.state;
    this.state = {
      board: Array.isArray(s.board) ? s.board.slice(0, 9) : Array(9).fill(null),
      players: s.players || {},
      turn: s.turn === 'O' ? 'O' : 'X',
      status: ['waiting', 'playing', 'won', 'draw'].includes(s.status) ? s.status : 'playing',
      winner: s.winner || null,
      winLine: Array.isArray(s.winLine) ? s.winLine : null,
    };
    this.render();
  }

  // Effekte (optional) — z.B. Konfetti bei Sieg.
  onGameEvent(msg) {
    if (!msg || msg.gameKind !== GAME_KIND) return;
    if (msg.type === 'win') {
      this.el.classList.remove('bx-ttt-cele');
      void this.el.offsetWidth;
      this.el.classList.add('bx-ttt-cele');
      if (this.ctx.playSound && msg.soundId) this.ctx.playSound(msg.soundId);
    }
  }

  render() {
    const s = this.state;
    const board = s.board || [];
    const winSet = new Set(s.winLine || []);

    // Felder.
    for (let i = 0; i < 9; i++) {
      const cell = this.cells[i];
      const val = board[i];
      const isWin = s.status === 'won' && winSet.has(i);
      cell.classList.toggle('win', isWin);
      if (val === 'X' || val === 'O') {
        cell.innerHTML = `<span class="pick ${val === 'X' ? 'x' : 'o'}">${val}</span>`;
      } else {
        // Leeres Feld: Feld-Nummer 1–9 als Hinweis fürs Mitspielen per Chat.
        cell.innerHTML = `<span class="num">${i + 1}</span>`;
      }
    }

    // Spieler-Namen + aktiver Spieler.
    const nx = s.players?.X?.nickname;
    const no = s.players?.O?.nickname;
    this.nameX.textContent = nx || '—';
    this.nameO.textContent = no || '—';
    const live = s.status === 'playing';
    this.pX.classList.toggle('active', live && s.turn === 'X');
    this.pO.classList.toggle('active', live && s.turn === 'O');

    // Status-Zeile.
    this.statusEl.className = 'bx-ttt-status';
    if (s.status === 'waiting') {
      this.statusEl.classList.add('waiting');
      this.statusEl.textContent = '!join zum Mitspielen';
    } else if (s.status === 'won') {
      this.statusEl.classList.add('win');
      const who = s.winner?.nickname;
      this.statusEl.textContent = who ? `${who} gewinnt!` : 'Sieg!';
    } else if (s.status === 'draw') {
      this.statusEl.classList.add('draw');
      this.statusEl.textContent = 'Unentschieden';
    } else {
      // playing: wer ist dran?
      const cur = s.turn === 'O' ? (no || 'O') : (nx || 'X');
      this.statusEl.textContent = `${cur} ist dran (${s.turn})`;
    }
  }

  // Neue Partie / neuer Stream → zurück auf Start.
  onReset() {
    this.state = this._emptyState();
    this.render();
  }

  destroy() {
    this.el.remove();
  }
}
