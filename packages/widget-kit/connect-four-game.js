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
  font-size: calc((clamp(6px, 4.6cqmin, 60px)) * var(--bx-fs, 1));
  --bx-c4-accent: var(--bx-accent,#ff5436); --bx-c4-r:#ff4757; --bx-c4-y:#ffd32a;
  /* Brettbreite: normalerweise 78cqmin — aber gedeckelt durch die Höhe, die
     nach Kopfzeile, Status und Spaltennummern übrig bleibt (~7.6em Textzeilen).
     Ohne diesen Deckel schob eine größere Textgröße (--bx-fs 1.5) das Brett
     unten aus der Box. Das Brett ist 7 Spalten breit und 6 Reihen hoch, daher
     der Faktor 7/6 von Resthöhe auf Breite. */
  --bx-c4-w: min(78cqmin, calc(max(0px, 100cqh - 7.6em) * 7 / 6)); }
/* Kopfzeile: beide Spieler, der Aktive leuchtet */
.bx-c4-players { display:flex; align-items:center; justify-content:center; gap:.6em; font-size: calc((clamp(8px, 5.8cqmin, 62px)) * var(--bx-fs, 1));
  font-family: var(--bx-font-display, inherit); font-weight:800; line-height:1.1; max-width:96%; }
.bx-c4-pl { display:flex; align-items:center; gap:.35em; padding:.18em .5em; border-radius:.6em; opacity:.62;
  text-shadow:0 1px 3px rgba(0,0,0,.8);
  transition:opacity .25s ease, box-shadow .25s ease; white-space:nowrap; max-width:42cqmin; overflow:hidden; text-overflow:ellipsis; }
.bx-c4-pl.active { opacity:1; box-shadow:0 0 0 2px color-mix(in srgb, var(--bx-c4-accent) 70%, transparent), 0 0 14px color-mix(in srgb, var(--bx-c4-accent) 45%, transparent); }
.bx-c4-dot { width:.85em; height:.85em; border-radius:50%; flex:none; box-shadow:0 0 6px rgba(0,0,0,.4); }
.bx-c4-dot.R { background:var(--bx-c4-r); } .bx-c4-dot.Y { background:var(--bx-c4-y); }
.bx-c4-vs { font-size:.78em; opacity:.6; }
/* Status-Zeile */
.bx-c4-status { font-size: calc((clamp(8px, 5.6cqmin, 60px)) * var(--bx-fs, 1)); font-weight:700; min-height:1.3em;
  color: color-mix(in srgb, var(--bx-c4-accent) 60%, #fff); text-shadow:0 1px 4px rgba(0,0,0,.85), 0 0 .6em rgba(0,0,0,.55); }
.bx-c4.won .bx-c4-status { color: var(--bx-gold,#ffd700); }
/* Spielfeld: blaues Brett mit Loch-Rastern */
.bx-c4-grid { display:grid; grid-template-columns:repeat(${COLS}, 1fr); gap: 1.2cqmin;
  padding: 1.4cqmin; border-radius: 2cqmin; background:linear-gradient(160deg,#2b4cdb,#1b2f8f);
  box-shadow:0 8px 26px rgba(0,0,0,.45), inset 0 0 18px rgba(0,0,0,.3); width: var(--bx-c4-w); max-width:96%; }
.bx-c4-colhdr { display:grid; grid-template-columns:repeat(${COLS}, 1fr); gap:1.2cqmin; width: var(--bx-c4-w); max-width:96%; padding:0 1.4cqmin;
  font-size: calc((clamp(7px, 4.2cqmin, 48px)) * var(--bx-fs, 1)); font-weight:800; color:#fff;
  text-shadow:0 1px 3px rgba(0,0,0,.85), 0 0 .5em rgba(0,0,0,.7); }
.bx-c4-cell { aspect-ratio:1/1; border-radius:50%; background:radial-gradient(circle at 35% 30%, #0c1430, #060a1c);
  box-shadow:inset 0 2px 5px rgba(0,0,0,.6); display:grid; place-items:center; }
.bx-c4-cell .pc { width:86%; height:86%; border-radius:50%; transform:scale(0); transition:transform .18s cubic-bezier(.2,1.6,.35,1); }
.bx-c4-cell .pc.set { transform:scale(1); }
.bx-c4-cell .pc.R { background:radial-gradient(circle at 35% 30%, #ff7b86, var(--bx-c4-r)); box-shadow:0 1px 4px rgba(0,0,0,.5); }
.bx-c4-cell .pc.Y { background:radial-gradient(circle at 35% 30%, #fff0a0, var(--bx-c4-y)); box-shadow:0 1px 4px rgba(0,0,0,.5); }
.bx-c4-cell.win .pc { animation: bx-c4-glow 1s ease-in-out infinite; }
@keyframes bx-c4-glow { 0%,100% { box-shadow:0 0 0 rgba(255,255,255,.0); filter:brightness(1); }
  50% { box-shadow:0 0 14px 4px rgba(255,255,255,.85); filter:brightness(1.35); } }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur an Spaltenzahlen und Statuszeile (das Brett bleibt sichtbar).
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-c4-colhdr { -webkit-text-stroke: max(1.5px, .11em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-c4-status { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Premium-Ebene (.bx-premium) ───────────────────────────────────────────
   Der Auslöser sitzt auf dem eben eingeworfenen STEIN und deutlicher auf den
   Steinen der Gewinnreihe. Er rundet sich mit ihnen (border-radius erbt der
   Ring vom Element), sitzt also als Kreis um den Chip.
   Ausgenommen bleibt das BRETT: seine blaue Platte samt Innenschatten ist eine
   feste Form; ein Ring darum hätte den Schatten für eine Sekunde gelöscht und
   das Brett wäre flach geworden. Die Löcher bleiben ebenfalls ruhig.
   Die Gewinnsteine glühen von Haus aus dauerhaft — die Widget-Regel steht im
   Dokument nach widget-base.css und hätte den Auslöser überschrieben. Deshalb
   hier zusammengefasst: erst der Ring, danach (900 ms) das Glühen. */
.bx-premium .bx-c4-cell .pc.bx-hit {
  animation: bx-premium-lift 900ms cubic-bezier(.2,1.5,.35,1),
    bx-premium-ring 900ms cubic-bezier(.2,.9,.3,1); }
.bx-premium .bx-c4-cell.win .pc.bx-hit {
  --bx-accent: #fff;
  animation: bx-premium-lift 900ms cubic-bezier(.2,1.5,.35,1),
    bx-premium-ring 900ms cubic-bezier(.2,.9,.3,1),
    bx-c4-glow 1s ease-in-out 900ms infinite; }
`;
function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; document.head.appendChild(s);
  }
}

// Premium-Auslöser: Klasse `bx-hit` setzen und nach 900 ms wieder wegnehmen.
// Was daraus wird (Anheben, Ring, Aufblitzen), entscheidet die Premium-Ebene in
// widget-base.css — ohne den Haken „Premium-Effekte" passiert nichts. Bewusst
// lokal dupliziert: die Widgets haben kein gemeinsames JS-Modul.
function bxHit(el, timers) {
  if (!el) return;
  // Ohne die Premium-Ebene gibt es fuer .bx-hit keine einzige CSS-Regel —
  // der erzwungene Reflow unten waere also Arbeit fuer einen unsichtbaren
  // Effekt, bei JEDEM Ereignis und in JEDEM Widget.
  if (!el.closest('.bx-premium')) return;
  el.classList.remove('bx-hit');
  void el.offsetWidth; // Reflow → bei schnellen Folgen springt der Effekt neu an
  el.classList.add('bx-hit');
  const t = setTimeout(() => { timers.delete(t); el.classList.remove('bx-hit'); }, 900);
  timers.add(t);
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
    this.timers = new Set(); // Premium-Auslöser → bei destroy clearen
    this._prev = null;       // letzter Brettstand → erkennt den eingeworfenen Stein
    this._winShown = false;  // Gewinnreihe genau einmal auslösen
    // Editor-Schaufenster: Demo-Stand zeigen.
    if (this.ctx.preview) this.state = this.demoState();
    this.render();
  }

  /** Demo-Zustand fürs Editor-Schaufenster: ein paar Steine + Rot am Zug. */
  demoState() {
    const board = emptyBoard();
    board[5][3] = 'R'; board[5][2] = 'Y'; board[4][3] = 'Y';
    board[5][0] = 'R'; board[5][4] = 'R'; board[4][2] = 'R';
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
    // Leerer/null state = Spiel vorbei -> Widget sauber in den Idle-Zustand
    // (unsichtbar) versetzen, statt auf dem letzten Frame einzufrieren.
    if (!msg.state) {
      this.state = null;
      if (this.el) this.el.style.display = 'none';
      this.render();
      return;
    }
    if (this.el) this.el.style.display = '';
    this.state = msg.state;
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

    // Brett: Steine + Gewinn-Hervorhebung. Der Auslöser gilt nur für das, was
    // sich WIRKLICH geändert hat — beim ersten Aufbau (Mount, Demo-Stand) bleibt
    // das Brett ruhig, sonst plumpsten alle Steine gleichzeitig los.
    const first = this._prev === null;
    const winHits = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.cells[r][c];
        const pc = cell.firstChild;
        const v = (board[r] && board[r][c]) || null;
        pc.className = 'pc' + (v ? ` set ${v}` : '');
        const isWin = status === 'won' && wins.has(`${r},${c}`);
        cell.classList.toggle('win', isWin);
        if (isWin) winHits.push(pc);
        else if (!first && v && v !== this._prev[r][c]) bxHit(pc, this.timers);
      }
    }
    this._prev = board.map((row) => (Array.isArray(row) ? row.slice(0, COLS) : Array(COLS).fill(null)));
    // Der Gewinnzug — deutlicher als ein einzelner Stein: die ganze Reihe.
    if (status === 'won' && !this._winShown) {
      this._winShown = true;
      for (const pc of winHits) bxHit(pc, this.timers);
    } else if (status !== 'won') {
      this._winShown = false;
    }
  }

  /** Neuer Stream: letzten Spielstand nicht stehen lassen → in den Idle. */
  onReset() { this.onGameState({ gameKind: GAME_KIND, state: null }); }

  destroy() {
    clearTimeout(this._flashT);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (this.el) this.el.remove();
  }
}
