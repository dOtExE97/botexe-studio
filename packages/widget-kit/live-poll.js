// live-poll.js — Live-Abstimmung: Frage + 2–4 Optionen. Zuschauer stimmen per
// Chat ab (!1, !2 … oder nur die Zahl), eine Stimme pro Person und Runde. Balken
// füllen sich live; nach Ablauf des Timers wird der Sieger enthüllt; optional
// neue Runde. Zwei Designs: 'bars' (Balken) und 'cards' (Karten).
// props: { style?, question?, options?, durationSec?, autoNewRound?, roundDelayMs?,
//          revealSoundId?, accent?, theme? }

// ── Reine Logik (DOM-frei, getestet) ───────────────────────────────────────
/** "Ja, Nein, Vielleicht" → ['Ja','Nein','Vielleicht']; max 4. */
export function parseOptions(str) {
  return String(str || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 4);
}
/** Chat-Text → 0-basierter Optionsindex (oder -1). Akzeptiert "!1", "1", " !3 ".
 *  Nur eine reine Stimme zählt (kein Fließtext). */
export function voteIndex(text, optionCount) {
  const m = String(text || '').trim().match(/^!?\s*(\d{1,2})$/);
  if (!m) return -1;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > optionCount) return -1;
  return n - 1;
}
/** Stimmenzahlen → Prozente (gerundet), Gewinner-Index (-1 wenn keine Stimme). */
export function pollResult(counts) {
  const total = counts.reduce((a, b) => a + (b || 0), 0);
  const percents = counts.map((c) => (total ? Math.round((c / total) * 100) : 0));
  let winner = -1, best = 0;
  counts.forEach((c, i) => { if ((c || 0) > best) { best = c; winner = i; } });
  return { percents, winner, total };
}

const STYLE_ID = 'bx-pl-style';
const BAR_COLORS = ['#ff5e8a', '#4ea8ff', '#ffd23e', '#21e6c1'];
const CSS = `
.bx-pl { position:absolute; inset:0; display:flex; flex-direction:column; gap:8px; padding:12px 14px;
  container-type:size; font-family: var(--bx-font-body); background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 44px -18px var(--bx-accent); overflow:hidden;
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.bx-pl-head { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.bx-pl-q { font-family: var(--bx-font-display); font-size: clamp(13px,5.4cqmin,24px); letter-spacing:.04em;
  color: var(--bx-text,#fff); text-shadow: 0 2px 8px rgba(0,0,0,.7); line-height:1.1; }
.bx-pl-clock { font-family: var(--bx-font-mono); font-weight:800; font-size: clamp(12px,4.4cqmin,20px); color: var(--bx-gold);
  text-shadow: 0 0 12px color-mix(in srgb, var(--bx-gold) 50%, transparent); min-width:3ch; text-align:right; }
.bx-pl-opts { flex:1; display:flex; flex-direction:column; gap:8px; min-height:0; }
/* — bars — */
.bx-pl-bar { position:relative; flex:1; min-height:0; border-radius:12px; overflow:hidden; display:flex; align-items:center;
  background: rgba(8,9,14,.7); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.07); }
.bx-pl-fill { position:absolute; left:0; top:0; bottom:0; width:0%; opacity:.85;
  background: var(--c); box-shadow: 0 0 22px -4px var(--c); transition: width 500ms cubic-bezier(.25,1,.35,1); }
.bx-pl-bar .bx-pl-row { position:relative; z-index:2; display:flex; align-items:center; gap:8px; width:100%; padding:0 12px; }
.bx-pl-key { font-family: var(--bx-font-display); font-size: clamp(12px,4cqmin,18px); color:#0a0b12; background:var(--c);
  border-radius:7px; min-width:1.6em; text-align:center; padding:1px 6px; -webkit-text-stroke:0; }
.bx-pl-label { flex:1; font-family: var(--bx-font-display); font-size: clamp(12px,4.2cqmin,19px); color:#fff;
  -webkit-text-stroke:2px #0a0b12; paint-order:stroke fill; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-pl-pct { font-family: var(--bx-font-mono); font-weight:800; font-size: clamp(12px,4.4cqmin,20px); color:#fff;
  text-shadow:0 1px 4px rgba(0,0,0,.9); }
/* — cards — */
.bx-pl.cards .bx-pl-opts { flex-direction:row; }
.bx-pl.cards .bx-pl-bar { flex-direction:column; justify-content:flex-end; border-radius: var(--bx-radius); }
.bx-pl.cards .bx-pl-fill { left:0; right:0; top:auto; bottom:0; width:100% !important; height:0%;
  transition: height 500ms cubic-bezier(.25,1,.35,1); }
.bx-pl.cards .bx-pl-row { flex-direction:column; gap:4px; padding:8px 6px; height:100%; justify-content:space-between; }
.bx-pl.cards .bx-pl-label { white-space:normal; text-align:center; }
/* Gewinner */
.bx-pl-bar.win { box-shadow: inset 0 0 0 2px var(--bx-gold), 0 0 26px -4px var(--bx-gold); animation: bx-pl-win .8s ease-in-out 2; }
@keyframes bx-pl-win { 0%,100%{ transform: scale(1); } 50%{ transform: scale(1.03); } }
.bx-pl-foot { font-family: var(--bx-font-display); font-size: clamp(10px,3.2cqmin,14px); color: var(--bx-muted);
  text-align:center; letter-spacing:.08em; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const STYLES = new Set(['bars', 'cards']);
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

export default class LivePoll {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.style = STYLES.has(props.style) ? props.style : 'bars';
    this.question = props.question || 'Was meint ihr?';
    this.options = parseOptions(props.options);
    if (this.options.length < 2) this.options = ['Ja', 'Nein'];
    this.duration = Math.max(10, Number(props.durationSec ?? 45));
    this.autoNewRound = props.autoNewRound !== false;
    this.roundDelay = Math.max(1500, Number(props.roundDelayMs ?? 6000));
    this.revealSound = props.revealSoundId || '';

    this.el = document.createElement('div');
    this.el.className = 'bx-pl' + (this.style === 'cards' ? ' cards' : '');
    this.el.innerHTML = `
      <div class="bx-pl-head"><div class="bx-pl-q">${esc(this.question)}</div><div class="bx-pl-clock"></div></div>
      <div class="bx-pl-opts"></div>
      <div class="bx-pl-foot">Tippe die Zahl in den Chat — z.B. „1"</div>`;
    this.optsEl = this.el.querySelector('.bx-pl-opts');
    this.clockEl = this.el.querySelector('.bx-pl-clock');
    root.appendChild(this.el);

    this.newRound();
    if (this.ctx.preview) this.startPreview();
  }

  buildOptions() {
    this.optsEl.innerHTML = this.options.map((label, i) => `
      <div class="bx-pl-bar" data-i="${i}" style="--c:${BAR_COLORS[i % BAR_COLORS.length]}">
        <div class="bx-pl-fill"></div>
        <div class="bx-pl-row">
          <span class="bx-pl-key">${i + 1}</span>
          <span class="bx-pl-label">${esc(label)}</span>
          <span class="bx-pl-pct">0%</span>
        </div>
      </div>`).join('');
    this.barEls = [...this.optsEl.querySelectorAll('.bx-pl-bar')];
    this.fillEls = this.barEls.map((b) => b.querySelector('.bx-pl-fill'));
    this.pctEls = this.barEls.map((b) => b.querySelector('.bx-pl-pct'));
  }

  newRound() {
    this.counts = this.options.map(() => 0);
    this.voted = new Set();
    this.ended = false;
    this.remaining = this.duration;
    this.buildOptions();
    this.render();
    if (this.clockEl) this.clockEl.textContent = this.fmtClock(this.remaining);
    // Im Live läuft der Rundentimer; in der Vorschau treibt startPreview() selbst.
    if (!this.ctx.preview) this.startClock();
  }

  startClock() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = setInterval(() => {
      this.remaining = Math.max(0, this.remaining - 1);
      if (this.clockEl) this.clockEl.textContent = this.fmtClock(this.remaining);
      if (this.remaining <= 0) this.reveal();
    }, 1000);
  }
  fmtClock(s) { const m = Math.floor(s / 60); const r = s % 60; return `${m}:${String(r).padStart(2, '0')}`; }

  onEvent(event) {
    if (this.ended || event.type !== 'chat' || !event.user) return;
    const idx = voteIndex(event.text, this.options.length);
    if (idx < 0) return;
    if (this.voted.has(event.user.id)) return; // eine Stimme pro Person
    this.voted.add(event.user.id);
    this.counts[idx] += 1;
    this.render();
  }

  render() {
    const { percents } = pollResult(this.counts);
    percents.forEach((p, i) => {
      if (this.fillEls[i]) this.fillEls[i].style[this.style === 'cards' ? 'height' : 'width'] = `${p}%`;
      if (this.pctEls[i]) this.pctEls[i].textContent = `${p}%`;
    });
  }

  reveal() {
    if (this.ended) return;
    this.ended = true;
    if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
    const { winner } = pollResult(this.counts);
    if (winner >= 0 && this.barEls[winner]) {
      this.barEls[winner].classList.add('win');
      if (this.revealSound) this.ctx.playSound?.(this.revealSound);
    }
    if (this.autoNewRound && !this.ctx.preview) {
      this.roundTimer = setTimeout(() => this.newRound(), this.roundDelay);
    }
  }

  onReset() {
    if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
    if (this.roundTimer) { clearTimeout(this.roundTimer); this.roundTimer = null; }
    if (this.previewTimer) { clearInterval(this.previewTimer); this.previewTimer = null; }
    this.newRound();
    if (this.ctx.preview) this.startPreview();
  }

  // Editor-Vorschau: simulierte Stimmen + Auto-Reveal-Zyklus.
  startPreview() {
    let fakeId = 0;
    this.previewTimer = setInterval(() => {
      if (this.ended) return;
      const idx = Math.floor(Math.random() * this.options.length);
      this.voted.add(`p${fakeId++}`);
      this.counts[idx] += 1;
      this.render();
      this.remaining = Math.max(0, this.remaining - 1);
      if (this.clockEl) this.clockEl.textContent = this.fmtClock(this.remaining);
    }, 350);
    this.previewCycle = setInterval(() => { this.reveal(); setTimeout(() => this.newRound(), 2500); }, 9000);
  }

  destroy() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.roundTimer) clearTimeout(this.roundTimer);
    if (this.previewTimer) clearInterval(this.previewTimer);
    if (this.previewCycle) clearInterval(this.previewCycle);
    this.el.remove();
  }
}
