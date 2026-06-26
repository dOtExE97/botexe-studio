// quiz-game.js — Quiz-Overlay für das Studio-Game-System. Reagiert nur auf den
// eigenen gameKind 'quiz' und zeigt: Frage groß oben + Optionen als A/B/C/D-
// Karten mit Buchstaben-Badge, Text und Live-Stimmen-Balken (voteCounts /
// totalVotes). Im 'reveal'-State wird die richtige Option grün hervorgehoben,
// falsche abgedunkelt und der Gewinner-Name eingeblendet. 'idle' = unsichtbar.
//
// Daten kommen über onGameState({ gameKind, state }), Effekte über
// onGameEvent({ gameKind, state/event }). Größen sind container-relativ (cqmin),
// damit das Widget per Layer-Zoom auch TikTok-Hochkant sauber skaliert.
//
// props: { accent?, showVotes? (bool, default true) }
// state: { state:'idle'|'question'|'locked'|'reveal'|'cooldown', question, options[],
//          totalVotes, voteCounts[], correctIndex?, winner?:{ nickname } }

const STYLE_ID = 'bx-qz-style';
const GAME_KIND = 'quiz';
const LETTERS = ['A', 'B', 'C', 'D'];
// Pro Option eine feste Akzentfarbe (wie bei live-poll) — sorgt für klare
// Unterscheidbarkeit der Balken, solange nicht aufgedeckt wurde.
const OPT_COLORS = ['#ff5e8a', '#4ea8ff', '#ffd23e', '#21e6c1'];

const CSS = `
.bx-qz { position:absolute; inset:0; display:flex; flex-direction:column; gap:2.6cqmin;
  padding:3.2cqmin 3.6cqmin; container-type:size; font-family: var(--bx-font-body);
  background: var(--bx-glass, rgba(14,15,22,.82)); border-radius: var(--bx-radius, 16px);
  box-shadow: var(--bx-shadow, 0 10px 40px rgba(0,0,0,.5)), 0 0 44px -18px var(--bx-accent,#ff5436);
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px);
  opacity:1; transition: opacity .25s ease; overflow:hidden; }
/* idle → komplett unsichtbar, nimmt keine Klicks an */
.bx-qz.is-idle { opacity:0; pointer-events:none; }
/* Frage */
.bx-qz-q { flex:none; font-family: var(--bx-font-display); line-height:1.08;
  font-size: clamp(13px, 6.4cqmin, 30px); color: var(--bx-text,#fff);
  -webkit-text-stroke: 2.5px var(--bx-ink,#0a0b12); paint-order: stroke fill;
  text-shadow: 0 2px 10px rgba(0,0,0,.6); }
/* Optionsliste */
.bx-qz-opts { flex:1; display:flex; flex-direction:column; gap:2.2cqmin; min-height:0; }
.bx-qz-opt { position:relative; flex:1; min-height:0; border-radius:11px; overflow:hidden;
  display:flex; align-items:center; background: rgba(8,9,14,.7);
  box-shadow: inset 0 0 0 1.6px rgba(255,255,255,.07);
  transition: box-shadow .3s ease, opacity .3s ease, filter .3s ease; }
/* Live-Stimmen-Balken hinter dem Text */
.bx-qz-fill { position:absolute; left:0; top:0; bottom:0; width:0%; opacity:.8;
  background: var(--c); box-shadow: 0 0 22px -4px var(--c);
  transition: width 480ms cubic-bezier(.25,1,.35,1); }
.bx-qz-row { position:relative; z-index:2; display:flex; align-items:center; gap:2.4cqmin;
  width:100%; padding:0 3cqmin; }
.bx-qz-badge { flex:none; display:grid; place-items:center; min-width:2.1em; height:2.1em;
  border-radius:9px; font-family: var(--bx-font-display); font-weight:800;
  font-size: clamp(12px, 4.4cqmin, 20px); color:#0a0b12; background: var(--c);
  box-shadow: 0 2px 8px rgba(0,0,0,.4); }
.bx-qz-text { flex:1; font-family: var(--bx-font-display);
  font-size: clamp(12px, 4.6cqmin, 21px); color:#fff;
  -webkit-text-stroke: 2px var(--bx-ink,#0a0b12); paint-order: stroke fill;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-qz-pct { flex:none; font-family: var(--bx-font-mono, var(--bx-font-display));
  font-weight:800; font-size: clamp(12px, 4.6cqmin, 21px); color:#fff;
  text-shadow: 0 1px 4px rgba(0,0,0,.9); min-width:3.2ch; text-align:right; }
.bx-qz.no-votes .bx-qz-fill, .bx-qz.no-votes .bx-qz-pct { display:none; }
/* reveal — richtige Option grün, falsche abdunkeln */
.bx-qz-opt.correct { box-shadow: inset 0 0 0 2.4px var(--bx-teal,#21e6c1),
  0 0 26px -4px var(--bx-teal,#21e6c1); animation: bx-qz-pop .8s ease-in-out 2; }
.bx-qz-opt.correct .bx-qz-fill { background:#21e6c1; opacity:.85; }
.bx-qz-opt.correct .bx-qz-badge { background:#21e6c1; }
.bx-qz-opt.wrong { opacity:.42; filter: grayscale(.55) brightness(.8); }
@keyframes bx-qz-pop { 0%,100%{ transform: scale(1); } 50%{ transform: scale(1.025); } }
/* Gewinner-Zeile (nur reveal) */
.bx-qz-winner { flex:none; display:flex; align-items:center; justify-content:center; gap:1.6cqmin;
  font-family: var(--bx-font-display); font-size: clamp(11px, 4.2cqmin, 18px);
  color: var(--bx-text,#fff); letter-spacing:.04em;
  max-height:0; opacity:0; overflow:hidden; transition: max-height .35s ease, opacity .35s ease; }
.bx-qz-winner.show { max-height:3em; opacity:1; }
.bx-qz-winner .bx-qz-trophy { font-size:1.25em; filter: drop-shadow(0 0 8px var(--bx-gold,#ffd23e)); }
.bx-qz-winner b { color: var(--bx-gold,#ffd23e);
  text-shadow: 0 0 12px color-mix(in srgb, var(--bx-gold,#ffd23e) 50%, transparent); }
/* dezenter Hinweis im question/locked-State */
.bx-qz-foot { flex:none; text-align:center; font-family: var(--bx-font-display);
  font-size: clamp(9px, 3cqmin, 13px); color: var(--bx-muted,#ffffff88); letter-spacing:.06em;
  max-height:2em; opacity:1; overflow:hidden; transition: max-height .3s ease, opacity .3s ease; }
.bx-qz-foot.hide { max-height:0; opacity:0; }
.bx-qz.is-locked .bx-qz-foot::after { content:''; }
`;

function ensureStyle() {
  if (!document.getElementById(STYLE_ID)) {
    const s = document.createElement('style');
    s.id = STYLE_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
// Stimmenzahlen → Prozente (gerundet), robust gegen fehlendes totalVotes.
function toPercents(counts, total) {
  const sum = total > 0 ? total : counts.reduce((a, b) => a + (Number(b) || 0), 0);
  return counts.map((c) => (sum > 0 ? Math.round(((Number(c) || 0) / sum) * 100) : 0));
}

export default class QuizGameWidget {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    this.p = props || {};
    if (this.p.accent) root.style.setProperty('--bx-accent', this.p.accent);
    this.showVotes = this.p.showVotes !== false; // default true

    // Aktueller Spielzustand. Start: idle (unsichtbar), bis onGameState kommt.
    this.gs = { state: 'idle', question: '', options: [], totalVotes: 0, voteCounts: [] };

    this.el = document.createElement('div');
    this.el.className = 'bx-qz is-idle' + (this.showVotes ? '' : ' no-votes');
    this.el.innerHTML = `
      <div class="bx-qz-q"></div>
      <div class="bx-qz-opts"></div>
      <div class="bx-qz-winner"><span class="bx-qz-trophy">🏆</span><span class="bx-qz-wtxt"></span></div>
      <div class="bx-qz-foot">Tippe A · B · C · D in den Chat</div>`;
    this.qEl = this.el.querySelector('.bx-qz-q');
    this.optsEl = this.el.querySelector('.bx-qz-opts');
    this.winnerEl = this.el.querySelector('.bx-qz-winner');
    this.wtxtEl = this.winnerEl.querySelector('.bx-qz-wtxt');
    this.footEl = this.el.querySelector('.bx-qz-foot');
    root.appendChild(this.el);

    this._optCount = 0; // gemerkte Optionsanzahl → Karten nur bei Änderung neu bauen
    this.render();

    // Editor-Schaufenster: Demo-Quiz zeigen, das zwischen Frage und Reveal pendelt.
    if (this.ctx.preview) this.startPreview();
  }

  // ── Daten-Eingang ──────────────────────────────────────────────────────────
  // Reagiert NUR auf den eigenen gameKind; sonst ignorieren.
  onGameState(msg) {
    if (!msg || msg.gameKind !== GAME_KIND || !msg.state) return;
    const s = msg.state;
    const opts = Array.isArray(s.options) ? s.options : [];
    this.gs = {
      state: typeof s.state === 'string' ? s.state : 'idle',
      question: s.question || '',
      options: opts,
      totalVotes: Number(s.totalVotes) || 0,
      voteCounts: Array.isArray(s.voteCounts) ? s.voteCounts : opts.map(() => 0),
      // correctIndex/winner können beim reveal mitkommen (auch via getState).
      correctIndex: (s.correctIndex === 0 || s.correctIndex > 0) ? s.correctIndex : undefined,
      winner: s.winner || undefined,
    };
    this.render();
  }

  // Optionale Effekte (z.B. Konfetti / Sound bei 'win' oder 'reveal').
  onGameEvent(msg) {
    if (!msg || msg.gameKind !== GAME_KIND) return;
    const type = msg.event?.type || msg.type;
    if ((type === 'win' || type === 'reveal') && this.ctx.playSound) {
      this.ctx.playSound('quiz-reveal');
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  render() {
    const g = this.gs;
    const state = g.state || 'idle';

    // State-Klassen setzen (CSS steuert Sichtbarkeit + reveal-Looks).
    this.el.classList.toggle('is-idle', state === 'idle');
    this.el.classList.toggle('is-question', state === 'question');
    this.el.classList.toggle('is-locked', state === 'locked');
    this.el.classList.toggle('is-reveal', state === 'reveal');
    this.el.classList.toggle('is-cooldown', state === 'cooldown');

    if (state === 'idle') return; // unsichtbar — nicht weiter rendern

    this.qEl.textContent = g.question || '';

    // Karten nur neu aufbauen, wenn sich Anzahl/Texte der Optionen ändern —
    // sonst nur Werte aktualisieren (kein Flackern, sauberer Balken-Übergang).
    if (g.options.length !== this._optCount) {
      this.buildOptions(g.options);
      this._optCount = g.options.length;
    } else {
      g.options.forEach((label, i) => {
        const t = this.optEls[i]?.querySelector('.bx-qz-text');
        if (t && t.textContent !== String(label)) t.textContent = label;
      });
    }

    const revealed = state === 'reveal' && g.correctIndex !== undefined;
    const percents = toPercents(g.voteCounts, g.totalVotes);

    this.optEls.forEach((opt, i) => {
      const fill = opt.querySelector('.bx-qz-fill');
      const pct = opt.querySelector('.bx-qz-pct');
      if (fill) fill.style.width = `${percents[i] || 0}%`;
      if (pct) pct.textContent = `${percents[i] || 0}%`;
      // reveal: richtige grün, alle anderen abdunkeln.
      opt.classList.toggle('correct', revealed && i === g.correctIndex);
      opt.classList.toggle('wrong', revealed && i !== g.correctIndex);
    });

    // Gewinner-Name nur im reveal mit bekanntem Sieger.
    const hasWinner = state === 'reveal' && g.winner && g.winner.nickname;
    if (hasWinner) this.wtxtEl.innerHTML = `Erste richtig: <b>${esc(g.winner.nickname)}</b>`;
    this.winnerEl.classList.toggle('show', !!hasWinner);

    // Chat-Hinweis nur in der aktiven Frage zeigen.
    this.footEl.classList.toggle('hide', state !== 'question');
  }

  buildOptions(options) {
    this.optsEl.innerHTML = options.map((label, i) => `
      <div class="bx-qz-opt" data-i="${i}" style="--c:${OPT_COLORS[i % OPT_COLORS.length]}">
        <div class="bx-qz-fill"></div>
        <div class="bx-qz-row">
          <span class="bx-qz-badge">${LETTERS[i] || (i + 1)}</span>
          <span class="bx-qz-text">${esc(label)}</span>
          <span class="bx-qz-pct">0%</span>
        </div>
      </div>`).join('');
    this.optEls = [...this.optsEl.querySelectorAll('.bx-qz-opt')];
  }

  // ── Editor-Vorschau ────────────────────────────────────────────────────────
  // Simuliert eine Quiz-Runde: Frage mit live wachsenden Stimmen, dann Reveal
  // mit grüner Lösung + Gewinner, danach Schleife.
  startPreview() {
    const demoOptions = ['Berlin', 'Paris', 'Madrid', 'Rom'];
    const counts = [0, 0, 0, 0];
    const base = {
      gameKind: GAME_KIND,
      state: {
        state: 'question',
        question: 'Hauptstadt von Deutschland?',
        options: demoOptions,
        totalVotes: 0,
        voteCounts: counts.slice(),
      },
    };
    this.onGameState(base);

    let phase = 'question';
    this.previewVotes = setInterval(() => {
      if (phase !== 'question') return;
      const idx = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 4);
      counts[idx] += 1;
      const total = counts.reduce((a, b) => a + b, 0);
      this.onGameState({ gameKind: GAME_KIND, state: { ...base.state, totalVotes: total, voteCounts: counts.slice() } });
    }, 320);

    // Zyklus: nach ~6s aufdecken, nach weiteren ~4s neue Runde.
    this.previewCycle = setInterval(() => {
      if (phase === 'question') {
        phase = 'reveal';
        const total = counts.reduce((a, b) => a + b, 0) || 1;
        this.onGameState({
          gameKind: GAME_KIND,
          state: { ...base.state, state: 'reveal', totalVotes: total, voteCounts: counts.slice(),
            correctIndex: 0, winner: { nickname: 'ExE' } },
        });
        this.onGameEvent({ gameKind: GAME_KIND, event: { type: 'reveal' } });
      } else {
        phase = 'question';
        counts.fill(0);
        this.onGameState({ gameKind: GAME_KIND, state: { ...base.state, totalVotes: 0, voteCounts: counts.slice() } });
      }
    }, 5000);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────
  onReset() {
    this.gs = { state: 'idle', question: '', options: [], totalVotes: 0, voteCounts: [] };
    this._optCount = 0;
    this.optsEl.innerHTML = '';
    this.optEls = [];
    this.render();
  }

  destroy() {
    if (this.previewVotes) clearInterval(this.previewVotes);
    if (this.previewCycle) clearInterval(this.previewCycle);
    this.el.remove();
  }
}
