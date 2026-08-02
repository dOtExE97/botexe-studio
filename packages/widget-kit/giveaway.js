// giveaway.js — Verlosung/Giveaway-Ziehung. Zuschauer treten per !join bei (von
// der App gesammelt); auf „Gewinner ziehen" animiert das Widget die Ziehung und
// enthüllt den Gewinner. Bekommt {kind:'giveaway_draw', params:{winner, names}}.
// props: { style?: 'strip'|'spotlight', title?, accent?, theme?, soundId?, winSoundId? }
const STYLE_ID = 'bx-gv-style';
const CARD_W = 150; // px, Streifen-Karten
const CSS = `
.bx-gv { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:10px; container-type:size; font-family: var(--bx-font-body); overflow:hidden; }
/* min(cqi,cqh) statt cqmin: in einer breiten 760x240-Box misst cqmin nur die
   kurze Seite — die Schrift bliebe unnötig klein. */
.bx-gv-title { font-family: var(--bx-font-display); font-size: calc((clamp(13px,min(2.6cqi,8cqh),42px)) * var(--bx-fs, 1)); letter-spacing:.18em;
  text-transform:uppercase; color: var(--bx-text,#fff); text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent); }
.bx-gv-sub { font-family: var(--bx-font-display); font-size: calc((clamp(10px,min(1.8cqi,5.5cqh),26px)) * var(--bx-fs, 1)); color: var(--bx-muted); margin-top:-4px; }
/* — strip: CSGO-Case-Stil, Karten scrollen horizontal, Marker in der Mitte — */
.bx-gv-strip { position:relative; width:96%; height: clamp(50px,min(11cqi,42cqh),210px); border-radius: var(--bx-radius);
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
  border:1px solid rgba(255,255,255,.12); font-family: var(--bx-font-display); font-size: calc((clamp(12px,min(2.4cqi,8cqh),34px)) * var(--bx-fs, 1));
  color:#fff; -webkit-text-stroke:2px #0a0b12; paint-order:stroke fill; text-align:center; padding:0 8px;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-gv-card.win { background: linear-gradient(160deg, color-mix(in srgb, var(--bx-gold) 60%, transparent), color-mix(in srgb, var(--bx-accent) 35%, transparent));
  border-color: var(--bx-gold); box-shadow:0 0 26px -2px var(--bx-gold); animation: bx-gv-winpulse 1s ease-in-out 2; }
@keyframes bx-gv-winpulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
/* — spotlight: ein großes Feld, Namen flackern durch, verlangsamen, Reveal — */
.bx-gv-spot { display:flex; align-items:center; justify-content:center; width:90%; height: clamp(50px,min(12cqi,45cqh),220px);
  border-radius: var(--bx-radius); background: var(--bx-glass); box-shadow: var(--bx-shadow), 0 0 50px -14px var(--bx-accent);
  font-family: var(--bx-font-display); font-size: calc((clamp(18px,min(6cqi,22cqh),92px)) * var(--bx-fs, 1)); color:#fff; -webkit-text-stroke:3px #0a0b12;
  paint-order:stroke fill; text-align:center; padding:0 12px; white-space:nowrap; overflow:hidden; }
.bx-gv-spot.win { color: var(--bx-gold); text-shadow:0 0 28px var(--bx-gold); animation: bx-gv-winpulse .8s ease 3; }
.bx-gv-winner { font-family: var(--bx-font-display); font-size: calc((clamp(12px,min(2.6cqi,9cqh),40px)) * var(--bx-fs, 1)); color: var(--bx-gold);
  -webkit-text-stroke:2px #0a0b12; paint-order:stroke fill; opacity:0; }
.bx-gv-winner.show { animation: bx-gv-reveal 600ms cubic-bezier(.2,1.6,.4,1) forwards; }
@keyframes bx-gv-reveal { 0%{opacity:0; transform:scale(.6)} 100%{opacity:1; transform:scale(1)} }

/* ── „Rahmen ausblenden" (.bx-frameless): ohne Panel steht der Text direkt auf
   dem Videobild. Auf hellen Szenen war heller Text dort praktisch unsichtbar —
   darum Kontur an Titel und Untertitel (Karten/Gewinner haben schon eine).
   Muster wie .bx-outline in widget-base.css (Kontur + paint-order). Gilt NUR im
   frameless-Fall, das normale Aussehen mit Panel bleibt unverändert. */
html .bx-frameless .bx-gv-title { -webkit-text-stroke: max(1.5px, .09em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }
html .bx-frameless .bx-gv-sub { color: #fff; -webkit-text-stroke: max(1.5px, .1em) var(--bx-ink, #0a0b12); paint-order: stroke fill; }

/* ── Premium-Ebene (.bx-premium) ───────────────────────────────────────────
   Der Moment ist die Enthüllung des gezogenen Namens. Beide Bühnen bringen dort
   schon eine eigene Animation UND einen eigenen Schatten mit (Gold-Glow der
   Gewinnerkarte bzw. Panel-Schatten des Spotlights) — die Regeln des Widgets
   stehen im Dokument NACH widget-base.css und würden den Auslöser sonst
   schlicht überschreiben. Deshalb hier die eigene Fassung: die vorhandene
   Puls-Animation bleibt, Anheben und Ring kommen dazu, und der Ring läuft in
   Gold statt im Akzent — das ist die Farbe des Gewinns in diesem Widget. */
.bx-premium .bx-gv-card.win.bx-hit,
.bx-premium .bx-gv-spot.bx-hit { --bx-accent: var(--bx-gold, #ffd23e); }
.bx-premium .bx-gv-card.win.bx-hit {
  animation: bx-gv-winpulse 1s ease-in-out 2,
    bx-premium-lift 900ms cubic-bezier(.2,1.5,.35,1),
    bx-premium-ring 900ms cubic-bezier(.2,.9,.3,1); }
.bx-premium .bx-gv-spot.win.bx-hit {
  animation: bx-gv-winpulse .8s ease 3,
    bx-premium-lift 900ms cubic-bezier(.2,1.5,.35,1),
    bx-premium-ring 900ms cubic-bezier(.2,.9,.3,1); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const STYLES = new Set(['strip', 'spotlight']);
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

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
    // Editor-Vorschau: Teilnehmer-Karten zeigen — sonst sieht man im Editor nur
    // einen leeren Streifen und weiß nicht, was das Widget später darstellt.
    if (this.host.preview) this.renderDemo();
  }

  /** Statische Demo für den Editor (keine Animation, keine Timer). */
  renderDemo() {
    const names = ['Mia', 'LeonGG', 'Nova', 'BigBen', 'Sara_99', 'ExE'];
    if (this.style === 'spotlight') {
      const spot = this.el.querySelector('.bx-gv-spot');
      if (spot) spot.textContent = `${names.length} dabei · !join`;
      return;
    }
    const track = this.el.querySelector('.bx-gv-track');
    if (!track) return;
    const cards = [];
    for (let i = 0; i < 14; i++) cards.push(names[i % names.length]);
    track.innerHTML = cards.map((n, i) => `<div class="bx-gv-card${i === 7 ? ' win' : ''}">${esc(n)}</div>`).join('');
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
    const namenListe = Array.isArray(action.params?.names) ? action.params.names : [];
    if (namenListe.length === 0) {
      // Ohne Teilnehmer zeigt das Widget nur einen Platzhalter — das sieht im
      // Stream aus wie ein kaputtes Widget, ist aber schlicht eine leere Runde.
      this.host?.notify?.(
        'Die Verlosung wurde gestartet, aber es gab keine Teilnehmer — angezeigt wird nur ein Platzhalter. '
        + 'Zuschauer müssen vorher mit dem Beitrittswort in den Chat schreiben, und die Verlosung muss eingeschaltet sein.',
      );
    }
    const names = namenListe.length ? namenListe : [winner];
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
    // Der Moment: der gezogene Gewinner steht fest. Der Auslöser sitzt auf der
    // Bühne (Gewinnerkarte bzw. Spotlight-Feld), nicht auf der Gewinnerzeile —
    // dort ist es der Name selbst, der gerade groß geworden ist.
    bxHit(this.el.querySelector('.bx-gv-card.win') || this.el.querySelector('.bx-gv-spot'), this.timers);
  }

  /** Neuer Stream: laufende Ziehung/Timer abbrechen, zurück in den Wartezustand. */
  onReset() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.renderIdle();
  }

  destroy() { for (const t of this.timers) clearTimeout(t); this.timers.clear(); this.el.remove(); }
}
