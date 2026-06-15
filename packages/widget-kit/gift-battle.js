// gift-battle.js — Geschenk-Schlacht: zwei Teams im Tauziehen. Jedes Team ist
// bestimmten Gifts zugeordnet; Zuschauer pushen ihr Team mit Geschenken. Ein
// Rundentimer läuft, am Ende blitzt der Sieger auf, danach (optional) neue Runde.
// Zwei Designs: 'tug' (Tauzieh-Balken) und 'versus' (zwei füllende Säulen).
// props: { style?, teamA?, teamB?, giftsA?, giftsB?, metric?('coins'|'count'),
//          durationSec?, autoNewRound?, roundDelayMs?, winSoundId?, accent?, theme? }

// ── Reine Logik (DOM-frei, getestet) ───────────────────────────────────────
/** Slug einem Team zuordnen. Listen sind lowercase-Tokens. null = keinem. */
export function matchTeam(slug, listA, listB) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return null;
  if (Array.isArray(listA) && listA.includes(s)) return 'a';
  if (Array.isArray(listB) && listB.includes(s)) return 'b';
  return null;
}
/** Anteil von Team A in Prozent (0..100), 50 bei Gleichstand. Clamped 2..98,
 *  damit kein Team optisch komplett verschwindet. */
export function battlePosition(scoreA, scoreB) {
  const a = Math.max(0, scoreA || 0);
  const b = Math.max(0, scoreB || 0);
  if (a + b === 0) return 50;
  const pct = (a / (a + b)) * 100;
  return Math.max(2, Math.min(98, Math.round(pct)));
}
/** Sieger: 'a' | 'b' | 'tie'. */
export function battleWinner(scoreA, scoreB) {
  if ((scoreA || 0) > (scoreB || 0)) return 'a';
  if ((scoreB || 0) > (scoreA || 0)) return 'b';
  return 'tie';
}

const STYLE_ID = 'bx-bt-style';
const CSS = `
.bx-bt { position:absolute; inset:0; display:flex; flex-direction:column; gap:8px; padding:10px 12px;
  container-type:size; font-family: var(--bx-font-body); overflow:hidden; }
.bx-bt-head { display:flex; align-items:center; justify-content:center; gap:10px; }
.bx-bt-title { font-family: var(--bx-font-display); font-size: clamp(13px,5cqmin,24px); letter-spacing:.16em;
  text-transform:uppercase; color: var(--bx-text,#fff); text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 55%, transparent); }
.bx-bt-clock { font-family: var(--bx-font-mono); font-weight:800; font-size: clamp(13px,4.6cqmin,22px); color: var(--bx-gold);
  text-shadow: 0 0 12px color-mix(in srgb, var(--bx-gold) 50%, transparent); min-width:3ch; text-align:center; }
.bx-bt-teams { display:flex; justify-content:space-between; align-items:flex-end; gap:8px; }
.bx-bt-team { display:flex; flex-direction:column; align-items:center; min-width:0; }
.bx-bt-name { font-family: var(--bx-font-display); font-size: clamp(12px,4cqmin,20px); -webkit-text-stroke:2px #0a0b12;
  paint-order:stroke fill; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 42cqw; }
.bx-bt-team.a .bx-bt-name { color: var(--bx-a, #ff5e8a); }
.bx-bt-team.b .bx-bt-name { color: var(--bx-b, #4ea8ff); }
.bx-bt-score { font-family: var(--bx-font-mono); font-weight:800; font-size: clamp(13px,5cqmin,26px); color:#fff;
  text-shadow: 0 2px 6px rgba(0,0,0,.7); }
/* — tug: Tauzieh-Balken, Mitte = Knoten, schiebt sich zur stärkeren Seite — */
.bx-bt-tug { position:relative; height: clamp(26px,16cqmin,52px); border-radius:999px; overflow:hidden;
  background: linear-gradient(180deg, rgba(8,9,14,.92), rgba(18,20,28,.92));
  box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.08), 0 10px 24px -8px rgba(0,0,0,.7); }
.bx-bt-side { position:absolute; top:0; bottom:0; transition: width 600ms cubic-bezier(.25,1,.35,1); }
.bx-bt-side.a { left:0; background: linear-gradient(90deg, var(--bx-a,#ff5e8a), color-mix(in srgb, var(--bx-a,#ff5e8a) 55%, transparent)); }
.bx-bt-side.b { right:0; background: linear-gradient(270deg, var(--bx-b,#4ea8ff), color-mix(in srgb, var(--bx-b,#4ea8ff) 55%, transparent)); }
.bx-bt-side::after { content:''; position:absolute; inset:0;
  background: repeating-linear-gradient(115deg, transparent 0 14px, rgba(255,255,255,.14) 14px 24px);
  animation: bx-bt-stripes 1.2s linear infinite; }
.bx-bt-knot { position:absolute; top:-4px; bottom:-4px; width:5px; transform:translateX(-50%); z-index:3;
  background:#fff; border-radius:3px; box-shadow:0 0 12px #fff, 0 0 22px var(--bx-accent);
  transition: left 600ms cubic-bezier(.25,1,.35,1); }
@keyframes bx-bt-stripes { to { transform: translateX(24px); } }
/* — versus: zwei füllende Säulen mit „VS" — */
.bx-bt-cols { flex:1; display:flex; align-items:stretch; gap:10px; min-height:0; }
.bx-bt-col { position:relative; flex:1; border-radius: var(--bx-radius); overflow:hidden;
  background: var(--bx-glass); box-shadow: var(--bx-shadow); }
.bx-bt-colfill { position:absolute; left:0; right:0; bottom:0; height:50%; transition: height 600ms cubic-bezier(.25,1,.35,1); }
.bx-bt-col.a .bx-bt-colfill { background: linear-gradient(0deg, var(--bx-a,#ff5e8a), color-mix(in srgb, var(--bx-a,#ff5e8a) 30%, transparent)); }
.bx-bt-col.b .bx-bt-colfill { background: linear-gradient(0deg, var(--bx-b,#4ea8ff), color-mix(in srgb, var(--bx-b,#4ea8ff) 30%, transparent)); }
.bx-bt-vs { align-self:center; font-family: var(--bx-font-display); font-size: clamp(16px,7cqmin,34px); color:#fff;
  -webkit-text-stroke:3px #0a0b12; paint-order:stroke fill; text-shadow:0 0 18px var(--bx-accent); }
/* Sieg-Blitz */
.bx-bt.win-a .bx-bt-team.a, .bx-bt.win-b .bx-bt-team.b { animation: bx-bt-win 1s ease-in-out 2; }
.bx-bt.win-a .bx-bt-side.a, .bx-bt.win-b .bx-bt-side.b { filter: brightness(1.4) saturate(1.3); }
.bx-bt.win-a .bx-bt-col.a, .bx-bt.win-b .bx-bt-col.b { box-shadow: 0 0 30px -2px var(--bx-gold), inset 0 0 0 2px var(--bx-gold); }
@keyframes bx-bt-win { 0%,100%{ transform: scale(1); } 50%{ transform: scale(1.12); } }
.bx-bt-banner { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%) scale(.6); z-index:5; opacity:0;
  font-family: var(--bx-font-display); font-size: clamp(16px,9cqmin,42px); color: var(--bx-gold); -webkit-text-stroke:3px #0a0b12;
  paint-order:stroke fill; text-shadow:0 0 24px var(--bx-gold); pointer-events:none; white-space:nowrap; }
.bx-bt-banner.show { animation: bx-bt-banner 2.4s cubic-bezier(.2,1.5,.3,1) forwards; }
@keyframes bx-bt-banner { 0%{opacity:0; transform:translate(-50%,-50%) scale(.5);} 15%{opacity:1; transform:translate(-50%,-50%) scale(1);}
  80%{opacity:1;} 100%{opacity:0; transform:translate(-50%,-50%) scale(1);} }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const STYLES = new Set(['tug', 'versus']);
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
function tokens(str) { return String(str || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean); }
const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(Math.round(n)));

export default class GiftBattle {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.style = STYLES.has(props.style) ? props.style : 'tug';
    this.nameA = props.teamA || 'Team A';
    this.nameB = props.teamB || 'Team B';
    this.listA = tokens(props.giftsA);
    this.listB = tokens(props.giftsB);
    this.metric = props.metric === 'count' ? 'count' : 'coins';
    this.duration = Math.max(10, Number(props.durationSec ?? 60));
    this.autoNewRound = props.autoNewRound !== false;
    this.roundDelay = Math.max(1500, Number(props.roundDelayMs ?? 6000));
    this.winSound = props.winSoundId || '';
    this.scoreA = 0; this.scoreB = 0;
    this.remaining = this.duration;
    this.ended = false;

    this.el = document.createElement('div');
    this.el.className = 'bx-bt';
    this.el.innerHTML = this.style === 'versus' ? this.versusMarkup() : this.tugMarkup();
    root.appendChild(this.el);
    this.cacheEls();
    this.render();
    if (!this.ctx.preview) this.startClock();
    else this.startPreview();
  }

  tugMarkup() {
    return `
      <div class="bx-bt-head"><div class="bx-bt-title">${esc(this.titleText())}</div><div class="bx-bt-clock"></div></div>
      <div class="bx-bt-teams">
        <div class="bx-bt-team a"><div class="bx-bt-name">${esc(this.nameA)}</div><div class="bx-bt-score">0</div></div>
        <div class="bx-bt-team b"><div class="bx-bt-name">${esc(this.nameB)}</div><div class="bx-bt-score">0</div></div>
      </div>
      <div class="bx-bt-tug"><div class="bx-bt-side a"></div><div class="bx-bt-side b"></div><div class="bx-bt-knot"></div></div>
      <div class="bx-bt-banner"></div>`;
  }
  versusMarkup() {
    return `
      <div class="bx-bt-head"><div class="bx-bt-title">${esc(this.titleText())}</div><div class="bx-bt-clock"></div></div>
      <div class="bx-bt-cols">
        <div class="bx-bt-col a"><div class="bx-bt-colfill"></div></div>
        <div class="bx-bt-vs">VS</div>
        <div class="bx-bt-col b"><div class="bx-bt-colfill"></div></div>
      </div>
      <div class="bx-bt-teams">
        <div class="bx-bt-team a"><div class="bx-bt-name">${esc(this.nameA)}</div><div class="bx-bt-score">0</div></div>
        <div class="bx-bt-team b"><div class="bx-bt-name">${esc(this.nameB)}</div><div class="bx-bt-score">0</div></div>
      </div>
      <div class="bx-bt-banner"></div>`;
  }
  titleText() { return this.metric === 'count' ? 'Geschenk-Schlacht' : 'Coin-Schlacht'; }

  cacheEls() {
    this.clockEl = this.el.querySelector('.bx-bt-clock');
    this.scoreEls = this.el.querySelectorAll('.bx-bt-score');
    this.knotEl = this.el.querySelector('.bx-bt-knot');
    this.sideA = this.el.querySelector('.bx-bt-side.a');
    this.sideB = this.el.querySelector('.bx-bt-side.b');
    this.fillA = this.el.querySelector('.bx-bt-col.a .bx-bt-colfill');
    this.fillB = this.el.querySelector('.bx-bt-col.b .bx-bt-colfill');
    this.bannerEl = this.el.querySelector('.bx-bt-banner');
  }

  startClock() {
    this.clockTimer = setInterval(() => {
      this.remaining = Math.max(0, this.remaining - 1);
      if (this.clockEl) this.clockEl.textContent = this.fmtClock(this.remaining);
      if (this.remaining <= 0) this.endRound();
    }, 1000);
    if (this.clockEl) this.clockEl.textContent = this.fmtClock(this.remaining);
  }
  fmtClock(s) { const m = Math.floor(s / 60); const r = s % 60; return `${m}:${String(r).padStart(2, '0')}`; }

  onEvent(event) {
    if (this.ended || event.type !== 'gift' || !event.gift) return;
    let team = matchTeam(event.gift.slug, this.listA, this.listB);
    // Beide Listen leer → Auto-Split nach Coin-Höhe (teuer vs. günstig wäre
    // unfair; stattdessen abwechselnd per Gift-Reihenfolge geht nicht ohne State)
    // → günstigste Hälfte zu A, teure zu B, Schwelle 50 Coins.
    if (team === null && this.listA.length === 0 && this.listB.length === 0) {
      team = (event.gift.coinsPerUnit ?? 0) >= 50 ? 'b' : 'a';
    }
    if (team === null) return;
    const amount = this.metric === 'count' ? (event.gift.count || 1) : (event.gift.totalCoins || event.gift.coinsPerUnit || 0);
    if (team === 'a') this.scoreA += amount; else this.scoreB += amount;
    this.render();
  }

  render() {
    if (this.scoreEls) { this.scoreEls[0].textContent = fmt(this.scoreA); this.scoreEls[1].textContent = fmt(this.scoreB); }
    const pos = battlePosition(this.scoreA, this.scoreB);
    if (this.style === 'versus') {
      const max = Math.max(this.scoreA, this.scoreB, 1);
      if (this.fillA) this.fillA.style.height = `${Math.max(6, (this.scoreA / max) * 100)}%`;
      if (this.fillB) this.fillB.style.height = `${Math.max(6, (this.scoreB / max) * 100)}%`;
    } else {
      if (this.sideA) this.sideA.style.width = `${pos}%`;
      if (this.sideB) this.sideB.style.width = `${100 - pos}%`;
      if (this.knotEl) this.knotEl.style.left = `${pos}%`;
    }
  }

  endRound() {
    if (this.ended) return;
    this.ended = true;
    if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
    const w = battleWinner(this.scoreA, this.scoreB);
    if (w !== 'tie') {
      this.el.classList.add(w === 'a' ? 'win-a' : 'win-b');
      if (this.winSound) this.ctx.playSound?.(this.winSound);
      const name = w === 'a' ? this.nameA : this.nameB;
      this.showBanner(`🏆 ${name}`);
    } else {
      this.showBanner('Unentschieden!');
    }
    if (this.autoNewRound && !this.ctx.preview) {
      this.roundTimer = setTimeout(() => this.newRound(), this.roundDelay);
    }
  }

  showBanner(text) {
    if (!this.bannerEl) return;
    this.bannerEl.textContent = text;
    this.bannerEl.classList.remove('show'); void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
  }

  newRound() {
    this.scoreA = 0; this.scoreB = 0; this.ended = false;
    this.remaining = this.duration;
    this.el.classList.remove('win-a', 'win-b');
    if (this.bannerEl) this.bannerEl.classList.remove('show');
    this.render();
    this.startClock();
  }

  onReset() {
    if (this.clockTimer) { clearInterval(this.clockTimer); this.clockTimer = null; }
    if (this.roundTimer) { clearTimeout(this.roundTimer); this.roundTimer = null; }
    if (this.previewTimer) { clearInterval(this.previewTimer); this.previewTimer = null; }
    this.newRound();
    if (this.ctx.preview) this.startPreview();
  }

  // Editor-Vorschau: Gifts simulieren, damit man die Schlacht live sieht.
  startPreview() {
    this.remaining = this.duration;
    if (this.clockEl) this.clockEl.textContent = this.fmtClock(this.remaining);
    this.previewTimer = setInterval(() => {
      const toA = Math.random() < 0.5;
      const amt = this.metric === 'count' ? 1 : [1, 5, 5, 99, 199][Math.floor(Math.random() * 5)];
      if (toA) this.scoreA += amt; else this.scoreB += amt;
      this.render();
    }, 700);
  }

  destroy() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.roundTimer) clearTimeout(this.roundTimer);
    if (this.previewTimer) clearInterval(this.previewTimer);
    this.el.remove();
  }
}
