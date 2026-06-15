// giveaway.js — Verlosung/Giveaway-Ziehung. Zuschauer treten per !join bei (von
// der App gesammelt); auf „Gewinner ziehen" animiert das Widget die Ziehung und
// enthüllt den Gewinner. Bekommt {kind:'giveaway_draw', params:{winner, names}}.
// props: { style?: 'strip'|'spotlight', title?, accent?, theme?, soundId?, winSoundId? }
const STYLE_ID = 'bx-gv-style';
const CARD_W = 150; // px, Streifen-Karten
const CSS = `
.bx-gv { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:10px; container-type:size; font-family: var(--bx-font-body); overflow:hidden; }
.bx-gv-title { font-family: var(--bx-font-display); font-size: clamp(14px,5cqmin,28px); letter-spacing:.18em;
  text-transform:uppercase; color: var(--bx-text,#fff); text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent); }
.bx-gv-sub { font-family: var(--bx-font-display); font-size: clamp(11px,3.4cqmin,16px); color: var(--bx-muted); margin-top:-4px; }
/* — strip: CSGO-Case-Stil, Karten scrollen horizontal, Marker in der Mitte — */
.bx-gv-strip { position:relative; width:96%; height: clamp(60px,30cqmin,120px); border-radius: var(--bx-radius);
  background: var(--bx-glass); box-shadow: var(--bx-shadow), inset 0 0 40px -10px rgba(0,0,0,.6); overflow:hidden; }
.bx-gv-marker { position:absolute; left:50%; top:0; bottom:0; width:3px; transform:translateX(-50%); z-index:3;
  background: var(--bx-accent); box-shadow:0 0 14px var(--bx-accent); }
.bx-gv-marker::before, .bx-gv-marker::after { content:''; position:absolute; left:50%; transform:translateX(-50%);
  border:8px solid transparent; }
.bx-gv-marker::before { top:-1px; border-top-color: var(--bx-accent); }
.bx-gv-marker::after { bottom:-1px; border-bottom-color: var(--bx-accent); }
.bx-gv-track { position:absolute; top:0; bottom:0; left:0; display:flex; align-items:center; will-change:transform; }
.bx-gv-card { width:${CARD_W}px; flex:none; margin:0 4px; height:78%; display:flex; align-items:center; justify-content:center;
  border-radius:12px; background: linear-gradient(160deg, rgba(255,255,255,.10), rgba(255,255,255,.03));
  border:1px solid rgba(255,255,255,.12); font-family: var(--bx-font-display); font-size: clamp(13px,4.2cqmin,20px);
  color:#fff; -webkit-text-stroke:2px #0a0b12; paint-order:stroke fill; text-align:center; padding:0 8px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-gv-card.win { background: linear-gradient(160deg, color-mix(in srgb, var(--bx-gold) 60%, transparent), color-mix(in srgb, var(--bx-accent) 35%, transparent));
  border-color: var(--bx-gold); box-shadow:0 0 26px -2px var(--bx-gold); animation: bx-gv-winpulse 1s ease-in-out 2; }
@keyframes bx-gv-winpulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
/* — spotlight: ein großes Feld, Namen flackern durch, verlangsamen, Reveal — */
.bx-gv-spot { display:flex; align-items:center; justify-content:center; width:90%; height: clamp(60px,32cqmin,130px);
  border-radius: var(--bx-radius); background: var(--bx-glass); box-shadow: var(--bx-shadow), 0 0 50px -14px var(--bx-accent);
  font-family: var(--bx-font-display); font-size: clamp(20px,11cqmin,56px); color:#fff; -webkit-text-stroke:3px #0a0b12;
  paint-order:stroke fill; text-align:center; padding:0 12px; white-space:nowrap; overflow:hidden; }
.bx-gv-spot.win { color: var(--bx-gold); text-shadow:0 0 28px var(--bx-gold); animation: bx-gv-winpulse .8s ease 3; }
.bx-gv-winner { font-family: var(--bx-font-display); font-size: clamp(13px,4.6cqmin,22px); color: var(--bx-gold);
  -webkit-text-stroke:2px #0a0b12; paint-order:stroke fill; opacity:0; }
.bx-gv-winner.show { animation: bx-gv-reveal 600ms cubic-bezier(.2,1.6,.4,1) forwards; }
@keyframes bx-gv-reveal { 0%{opacity:0; transform:scale(.6)} 100%{opacity:1; transform:scale(1)} }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const STYLES = new Set(['strip', 'spotlight']);
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

export default class Giveaway {
  constructor(root, props, ctx) {
    ensureStyle();
    this.host = ctx || {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.style = STYLES.has(props.style) ? props.style : 'strip';
    this.title = props.title || 'Giveaway';
    this.soundId = props.soundId || '';
    this.winSoundId = props.winSoundId || '';
    this.timers = new Set();
    this.el = document.createElement('div');
    this.el.className = 'bx-gv';
    this.renderIdle();
    root.appendChild(this.el);
  }

  renderIdle() {
    const stage = this.style === 'spotlight'
      ? `<div class="bx-gv-spot">!join</div>`
      : `<div class="bx-gv-strip"><div class="bx-gv-marker"></div><div class="bx-gv-track"></div></div>`;
    this.el.innerHTML = `<div class="bx-gv-title">${esc(this.title)}</div>${stage}<div class="bx-gv-winner"></div>`;
  }

  onAction(action) {
    if (action.kind === 'giveaway_reset') { this.renderIdle(); return; }
    if (action.kind !== 'giveaway_draw') return;
    const winner = action.params?.winner?.nickname || action.params?.winner || 'Gewinner';
    const names = Array.isArray(action.params?.names) && action.params.names.length ? action.params.names : [winner];
    if (this.soundId) this.host.playSound?.(this.soundId);
    if (this.style === 'spotlight') this.drawSpotlight(String(winner), names);
    else this.drawStrip(String(winner), names);
  }

  // CSGO-Case: langer Streifen, rollt aus, Gewinner landet am Marker.
  drawStrip(winner, names) {
    const track = this.el.querySelector('.bx-gv-track');
    const strip = this.el.querySelector('.bx-gv-strip');
    if (!track || !strip) { this.renderIdle(); return; }
    const pick = () => names[Math.floor(Math.random() * names.length)];
    const COUNT = 48, WIN_AT = COUNT - 4; // Gewinner kurz vor Ende
    const cards = [];
    for (let i = 0; i < COUNT; i++) cards.push(i === WIN_AT ? winner : pick());
    track.innerHTML = cards.map((n, i) => `<div class="bx-gv-card${i === WIN_AT ? ' win' : ''}">${esc(n)}</div>`).join('');
    const cellW = CARD_W + 8;
    // Zielposition: Mitte des Gewinner-Cards unter den Marker (Strip-Mitte).
    const target = WIN_AT * cellW + cellW / 2 - strip.clientWidth / 2 + (Math.random() * 40 - 20);
    track.style.transition = 'none';
    track.style.transform = 'translateX(0)';
    void track.offsetWidth; // reflow
    track.style.transition = 'transform 5.2s cubic-bezier(.12,.78,.18,1)';
    track.style.transform = `translateX(${-target}px)`;
    const t = setTimeout(() => { this.timers.delete(t); this.reveal(winner); }, 5300);
    this.timers.add(t);
  }

  // Spotlight: Namen flackern, verlangsamen, Reveal.
  drawSpotlight(winner, names) {
    const spot = this.el.querySelector('.bx-gv-spot');
    if (!spot) { this.renderIdle(); return; }
    spot.classList.remove('win');
    let delay = 60, elapsed = 0;
    const tick = () => {
      spot.textContent = names[Math.floor(Math.random() * names.length)];
      elapsed += delay;
      delay *= 1.18; // verlangsamen
      if (elapsed < 4200) {
        const t = setTimeout(tick, delay); this.timers.add(t);
      } else {
        spot.textContent = winner; spot.classList.add('win');
        this.reveal(winner);
      }
    };
    tick();
  }

  reveal(winner) {
    if (this.winSoundId) this.host.playSound?.(this.winSoundId);
    const w = this.el.querySelector('.bx-gv-winner');
    if (w) { w.textContent = `🎉 Gewinner: ${winner}`; w.classList.remove('show'); void w.offsetWidth; w.classList.add('show'); }
  }

  destroy() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
