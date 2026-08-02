// sport-ticker.js — Fußball-Liveticker: Spiele eines Wettbewerbs (WM, Bundesliga,
// …) mit Wappen + Stand, blitzt bei Toren auf. Kann zusätzlich die aktuelle
// TABELLE zeigen — wahlweise nur Spiele, nur Tabelle, oder beides als Slider.
// Optional auf EIN Team gefiltert. Pollt /sport (+ /sport/standings).
// props: { provider, competition, title, maxMatches, refreshSec, goalSoundId,
//          goalBanner, goalText, team, view('matches'|'table'|'both'),
//          tableRows, slideSec, accent }
const STYLE_ID = 'bx-sp-style';
const CSS = `
.bx-sp { position:absolute; inset:0; display:flex; flex-direction:column; gap:2cqmin; padding:4cqmin; container-type:size;
  font-family: var(--bx-font-body); background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 44px -16px var(--bx-accent); overflow:hidden;
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.bx-sp-title { display:flex; align-items:center; gap:.5em; font-family: var(--bx-font-display);
  font-size: calc(clamp(8px, 5cqmin, 52px) * var(--bx-fs, 1)); letter-spacing:.16em; text-transform:uppercase; color: var(--bx-text, #fff);
  text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent); }
.bx-sp-title .dot { flex:none; width:.36em; height:.36em; border-radius:50%; background:#ff3b3b; box-shadow:0 0 10px #ff3b3b; animation: bx-sp-blink 1.4s infinite; }
.bx-sp-title .tab { margin-left:auto; font-size: calc(clamp(6px,2.8cqmin,28px) * var(--bx-fs, 1)); letter-spacing:.14em; color: var(--bx-teal); opacity:.9; }
@keyframes bx-sp-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
.bx-sp-list { display:flex; flex-direction:column; gap:1.6cqmin; overflow:hidden; flex:1; }
/* Zeilen brauchen einen kräftigen eigenen Grund: auf hellem Video verschwindet
   ein fast durchsichtiges Dunkelblau (vorher .42) samt weißer Schrift. */
.bx-sp-row { display:grid; grid-template-columns: 1fr auto 1fr; align-items:center; gap:2cqmin;
  padding:1.9cqmin 2.6cqmin; border-radius:2.6cqmin; background: rgba(8,10,18,.66); border:1px solid rgba(255,255,255,.16);
  transition: background .3s; }
.bx-sp-team { display:flex; align-items:center; gap:.4em; min-width:0; }
.bx-sp-team.away { flex-direction:row-reverse; text-align:right; }
.bx-sp-team img { width: clamp(9px, 5cqmin, 56px); height: clamp(9px, 5cqmin, 56px); object-fit:contain; flex:none; }
.bx-sp-team span { font-family: var(--bx-font-display); font-size: calc(clamp(9px, 4.1cqmin, 42px) * var(--bx-fs, 1)); color:#fff;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-shadow:0 1px 3px rgba(0,0,0,.75); }
.bx-sp-score { font-family: var(--bx-font-display); font-size: calc(clamp(10px, 5.2cqmin, 54px) * var(--bx-fs, 1)); color: var(--bx-gold);
  -webkit-text-stroke: max(2px,.07em) #0a0b12; paint-order: stroke fill; min-width: 2.6em; text-align:center; }
.bx-sp-min { font-family: var(--bx-font-mono); font-size: calc(clamp(8px, 3.1cqmin, 30px) * var(--bx-fs, 1)); text-align:center; margin-top:2px; }
.bx-sp-min.live { color:#ff5b5b; } .bx-sp-min.fin { color: #c3cadd; } .bx-sp-min.sched { color: var(--bx-teal); }
.bx-sp-row.goal { animation: bx-sp-goal 1.4s ease; }
@keyframes bx-sp-goal {
  0% { background: rgba(8,10,18,.42); }
  15% { background: color-mix(in srgb, var(--bx-gold) 55%, transparent); transform: scale(1.04); }
  100% { background: rgba(8,10,18,.42); transform: scale(1); } }
.bx-sp-empty { display:flex; flex:1; align-items:center; justify-content:center; text-align:center;
  font-size: calc(clamp(7px, 3.2cqmin, 30px) * var(--bx-fs, 1)); letter-spacing:.12em; color: var(--bx-muted); padding: 10px; }
/* — Tabelle — */
.bx-sp-table { display:flex; flex-direction:column; gap:.8cqmin; overflow:hidden; flex:1; }
.bx-sp-grp { font-family: var(--bx-font-display); font-size: calc(clamp(7px,3cqmin,30px) * var(--bx-fs, 1)); letter-spacing:.14em;
  text-transform:uppercase; color: var(--bx-teal); margin:.3em .15em .1em; }
.bx-sp-trow { display:grid; grid-template-columns: 1.6em 1fr 2.2em 2.4em 2.4em; align-items:center; gap:.4em;
  padding:.28em .55em; border-radius:.5em; background: rgba(8,10,18,.66); border:1px solid rgba(255,255,255,.14);
  font-size: calc(clamp(9px, 3.5cqmin, 36px) * var(--bx-fs, 1)); }
.bx-sp-trow.me { border-color: var(--bx-gold); box-shadow: 0 0 14px -4px var(--bx-gold) inset; }
.bx-sp-trow .pos { font-family: var(--bx-font-mono); color: #c3cadd; text-align:center; }
.bx-sp-trow .tm { display:flex; align-items:center; gap:6px; min-width:0; }
.bx-sp-trow .tm img { width: clamp(8px,4cqmin,44px); height: clamp(8px,4cqmin,44px); object-fit:contain; flex:none; }
.bx-sp-trow .tm span { font-family: var(--bx-font-display); color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-sp-trow .sp, .bx-sp-trow .gd { font-family: var(--bx-font-mono); text-align:center; color: #c3cadd; }
.bx-sp-trow .pt { font-family: var(--bx-font-display); text-align:center; color: var(--bx-gold); }
.bx-sp-thead { display:grid; grid-template-columns: 1.6em 1fr 2.2em 2.4em 2.4em; gap:.4em; padding:0 .55em;
  font-family: var(--bx-font-mono); font-size: calc(clamp(8px,2.9cqmin,28px) * var(--bx-fs, 1)); letter-spacing:.06em; color: #c3cadd; opacity:1; }
.bx-sp-page { display:flex; flex-direction:column; flex:1; min-height:0; }
.bx-sp-page.hide { display:none; }
/* Zeile passt nicht mehr ganz in die Box → ausblenden statt unten abschneiden. */
.bx-sp .bx-off { display:none; }
/* Tor-Feier */
.bx-sp.goalflash { box-shadow: var(--bx-shadow), 0 0 60px -4px #2bff88, 0 0 0 2.5px #2bff88 inset !important; }
.bx-sp-goal-banner { position:absolute; inset:0; display:flex; align-items:center; overflow:hidden; pointer-events:none; opacity:0; }
.bx-sp.goalflash .bx-sp-goal-banner { opacity:1; }
.bx-sp-goal-banner span { font-family: var(--bx-font-display); font-size: calc(clamp(30px, 26cqmin, 96px) * var(--bx-fs, 1)); white-space:nowrap;
  color:#3dff97; -webkit-text-stroke: 3px #064; paint-order: stroke fill; text-shadow: 0 0 26px #2bff88; will-change: transform;
  animation: bx-sp-goalrun 2.2s linear; }
@keyframes bx-sp-goalrun { from { transform: translateX(100%); } to { transform: translateX(-130%); } }

/* ── „Rahmen ausblenden" (bx-frameless) ───────────────────────────────────
   Die Spielzeilen bringen ihre eigene dunkle Fläche mit und bleiben lesbar.
   Frei auf dem Video stehen nur Titel, Gruppenzeile und der Leer-Hinweis —
   die bekommen hier eine Kontur, sonst nichts. */
.bx-frameless .bx-sp { box-shadow: none; }
.bx-frameless .bx-sp-title, .bx-frameless .bx-sp-grp, .bx-frameless .bx-sp-empty {
  -webkit-text-stroke: max(1.5px, .075em) var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 max(1px, .04em) max(3px, .1em) rgba(0,0,0,.6); }

/* ── Premium-Ebene (.bx-premium) ───────────────────────────────────────────
   AUSGENOMMEN: die WAPPEN. Die Basis legt jedem Bild einen farbigen Schein in
   der Akzentfarbe unter — bei zehn Vereinslogos nebeneinander wird daraus ein
   Farbnebel, und ein Wappen ist ohnehin eine feste Marke und kein Ereignis.
   Sie behalten deshalb nur den dunklen Schatten, der sie vom Video abhebt.
   Der Auslöser ist das TOR. Die getroffene Zeile leuchtet bereits gold auf
   (bx-sp-goal); diese Regel steht im Dokument nach widget-base.css und hätte
   den Auslöser überschrieben — hier laufen beide zusammen, mit dem Ring in
   Gold statt im Akzent, passend zum Aufleuchten der Zeile. */
.bx-premium .bx-sp-team img, .bx-premium .bx-sp-trow .tm img {
  filter: drop-shadow(0 .1em .2em rgba(0, 0, 0, .75)); }
.bx-premium .bx-sp-row.goal.bx-hit {
  --bx-accent: var(--bx-gold, #ffd23e);
  animation: bx-sp-goal 1.4s ease,
    bx-premium-lift 900ms cubic-bezier(.2,1.5,.35,1),
    bx-premium-ring 900ms cubic-bezier(.2,.9,.3,1); }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
const VIEWS = new Set(['matches', 'table', 'both']);

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

// ── Editor-Schaufenster ────────────────────────────────────────────────────
// Ohne Demo blieb der Ticker im Editor eine leere Karte (die echten Daten
// kommen erst live vom /sport-Endpunkt) — man konnte Größe und Position nicht
// beurteilen. Deshalb: in der Vorschau ein plausibler Bundesliga-Stand.
const DEMO_MATCHES = [
  { id: 'd1', home: 'Bayern München', away: 'Dortmund', homeScore: 2, awayScore: 1, status: 'live', minute: 67 },
  { id: 'd2', home: 'Leverkusen', away: 'RB Leipzig', homeScore: 0, awayScore: 0, status: 'live', minute: 23 },
  { id: 'd3', home: 'Stuttgart', away: 'Eintracht Frankfurt', homeScore: 3, awayScore: 2, status: 'finished' },
  { id: 'd4', home: 'Werder Bremen', away: 'FC Augsburg', homeScore: null, awayScore: null, status: 'scheduled', kickoff: '2026-01-01T17:30:00Z' },
  { id: 'd5', home: 'SC Freiburg', away: '1. FC Köln', homeScore: null, awayScore: null, status: 'scheduled', kickoff: '2026-01-01T19:30:00Z' },
];
const DEMO_STANDINGS = [
  { position: 1, team: 'Bayern München', played: 18, goalDiff: 34, points: 45 },
  { position: 2, team: 'Leverkusen', played: 18, goalDiff: 22, points: 41 },
  { position: 3, team: 'Stuttgart', played: 18, goalDiff: 15, points: 36 },
  { position: 4, team: 'Dortmund', played: 18, goalDiff: 11, points: 33 },
  { position: 5, team: 'RB Leipzig', played: 18, goalDiff: 9, points: 31 },
  { position: 6, team: 'Eintracht Frankfurt', played: 18, goalDiff: 4, points: 28 },
  { position: 7, team: 'SC Freiburg', played: 18, goalDiff: -2, points: 24 },
  { position: 8, team: 'Werder Bremen', played: 18, goalDiff: -6, points: 21 },
];
// 'GROUP_A' / 'GROUP_B' → 'Gruppe A'
function prettyGroup(g) { const m = /GROUP_?([A-Z0-9]+)/i.exec(String(g || '')); return m ? `Gruppe ${m[1]}` : String(g || ''); }
/** Spiele ggf. auf ein Team filtern (Teilstring, case-insensitiv). Pure. */
export function filterByTeam(matches, team) {
  const t = String(team || '').trim().toLowerCase();
  if (!t) return matches;
  return matches.filter((m) => String(m.home).toLowerCase().includes(t) || String(m.away).toLowerCase().includes(t));
}

export default class SportTicker {
  constructor(root, props, ctx) {
    ensureStyle();
    this.ctx = ctx || {};
    if (props.accent) root.style.setProperty('--bx-accent', props.accent);
    this.provider = props.provider === 'openligadb' ? 'openligadb' : 'football-data';
    this.competition = String(props.competition ?? '').trim();
    this.title = props.title || 'Liveticker';
    this.maxMatches = Math.max(1, Math.min(12, Number(props.maxMatches ?? 5)));
    this.refreshMs = Math.max(15, Number(props.refreshSec ?? 30)) * 1000;
    this.goalSound = props.goalSoundId || '';
    this.goalBanner = props.goalBanner !== false;
    this.goalText = props.goalText || 'GOOOAAALLL';
    this.team = String(props.team ?? '').trim();
    this.view = VIEWS.has(props.view) ? props.view : 'matches';
    this.tableRows = Math.max(3, Math.min(24, Number(props.tableRows ?? 8)));
    this.slideMs = Math.max(4, Number(props.slideSec ?? 8)) * 1000;
    this.scores = new Map();
    this.firstLoad = true;
    this.goalTimer = null;
    this.page = 'matches'; // aktuelle Slider-Seite
    this.lastMatches = [];
    this.lastStandings = [];
    this.timers = new Set(); // Premium-Auslöser → bei destroy clearen

    this.el = document.createElement('div');
    this.el.className = 'bx-sp';
    this.el.innerHTML = `
      <div class="bx-sp-title"><span class="dot"></span><span class="t"></span><span class="tab"></span></div>
      <div class="bx-sp-page page-matches"><div class="bx-sp-list"></div></div>
      <div class="bx-sp-page page-table hide"><div class="bx-sp-thead"><span></span><span>Team</span><span>Sp</span><span>Diff</span><span>Pkt</span></div><div class="bx-sp-table"></div></div>
      <div class="bx-sp-goal-banner"><span></span></div>`;
    this.el.querySelector('.t').textContent = this.title;
    this.listEl = this.el.querySelector('.bx-sp-list');
    this.tableEl = this.el.querySelector('.bx-sp-table');
    this.tabLabel = this.el.querySelector('.bx-sp-title .tab');
    this.matchesPage = this.el.querySelector('.page-matches');
    this.tablePage = this.el.querySelector('.page-table');
    root.appendChild(this.el);
    // Zieht der Nutzer die Box kleiner, passen die eingestellten Zeilen nicht
    // mehr hinein — dann zeigen wir eben weniger, statt unten abzuschneiden.
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(this.el);

    // Editor-Schaufenster: Demo-Spiele/-Tabelle statt leerer Karte. Kein Poll,
    // kein Tor-Sound — nur Anschauungsmaterial zum Platzieren und Größen.
    if (this.ctx.preview) {
      this.page = this.view === 'table' ? 'table' : 'matches';
      this.applyPage();
      this.firstLoad = true;
      this.renderMatches(DEMO_MATCHES);
      this.renderTable(DEMO_STANDINGS);
      if (this.view === 'both') this.slideTimer = setInterval(() => this.flip(), this.slideMs);
      return;
    }

    if (!this.competition) {
      this.listEl.innerHTML = `<div class="bx-sp-empty">Kein Wettbewerb gewählt — im Editor „Wettbewerb" setzen (z.B. WM = 2000).</div>`;
      return;
    }

    // Startseite je nach Modus.
    this.page = this.view === 'table' ? 'table' : 'matches';
    this.applyPage();

    this.poll();
    this.timer = setInterval(() => this.poll(), this.refreshMs);
    // Slider nur im „beides"-Modus.
    if (this.view === 'both') this.slideTimer = setInterval(() => this.flip(), this.slideMs);
  }

  applyPage() {
    const showTable = this.page === 'table';
    this.matchesPage.classList.toggle('hide', showTable);
    this.tablePage.classList.toggle('hide', !showTable);
    this.tabLabel.textContent = this.view === 'both' ? (showTable ? 'Tabelle' : 'Spiele') : '';
    this.fit();
  }

  /** Sichtbare Zeilenzahl aus der Boxhoehe ableiten statt stur die eingestellte
   *  Hoechstzahl zu rendern: was nicht mehr ganz hineinpasst, wird ausgeblendet
   *  (nicht geloescht — bei einer groesseren Box kommt es zurueck). */
  fit() {
    this.fitList(this.listEl);
    this.fitList(this.tableEl);
  }

  fitList(box) {
    if (!box) return;
    const avail = box.clientHeight;
    const kids = Array.from(box.children);
    if (!avail || kids.length === 0) return;
    for (const k of kids) k.classList.remove('bx-off');
    const top = kids[0].offsetTop;
    let keep = 0;
    for (const k of kids) {
      if (keep > 0 && k.offsetTop + k.offsetHeight - top > avail) break;
      keep++;
    }
    for (let i = keep; i < kids.length; i++) kids[i].classList.add('bx-off');
  }
  flip() { this.page = this.page === 'table' ? 'matches' : 'table'; this.applyPage(); }

  async poll() {
    const jobs = [];
    if (this.view !== 'table') jobs.push(this.fetchJson('/sport').then((d) => { this.lastMatches = Array.isArray(d.matches) ? d.matches : []; this.renderMatches(this.lastMatches); }));
    if (this.view !== 'matches') jobs.push(this.fetchJson('/sport/standings').then((d) => { this.lastStandings = Array.isArray(d.standings) ? d.standings : []; this.renderTable(this.lastStandings); }));
    try { await Promise.all(jobs); } catch { /* kurzer Hänger — letzter Stand bleibt */ }
  }

  async fetchJson(path) {
    const url = `${this.ctx.baseUrl}${path}?provider=${encodeURIComponent(this.provider)}&competition=${encodeURIComponent(this.competition)}&token=${this.ctx.token}`;
    const res = await fetch(url);
    return res.json();
  }

  renderMatches(matches) {
    const filtered = filterByTeam(matches, this.team);
    const rank = (m) => (m.status === 'live' ? 0 : m.status === 'scheduled' ? 1 : 2);
    const sorted = filtered.slice().sort((a, b) => rank(a) - rank(b) || String(a.kickoff || '').localeCompare(String(b.kickoff || '')));
    const shown = sorted.slice(0, this.maxMatches);

    if (shown.length === 0) {
      this.listEl.innerHTML = `<div class="bx-sp-empty">${this.team ? `Keine Spiele für „${esc(this.team)}".` : 'Aktuell keine Spiele für diesen Wettbewerb.'}</div>`;
      this.firstLoad = false;
      return;
    }

    const goalIds = new Set();
    for (const m of shown) {
      const total = (m.homeScore ?? 0) + (m.awayScore ?? 0);
      const prev = this.scores.get(m.id);
      if (!this.firstLoad && prev !== undefined && total > prev) goalIds.add(m.id);
      this.scores.set(m.id, total);
    }
    if (goalIds.size > 0 && this.goalSound) this.ctx.playSound?.(this.goalSound);
    if (goalIds.size > 0 && this.goalBanner) this.celebrateGoal();

    this.listEl.innerHTML = shown.map((m) => this.rowHtml(m, goalIds.has(m.id))).join('');
    // Der Moment des Tickers: ein Tor. Erst nach dem Neuaufbau der Liste — die
    // Zeilen von eben gibt es nicht mehr.
    if (goalIds.size > 0) for (const row of this.listEl.querySelectorAll('.bx-sp-row.goal')) bxHit(row, this.timers);
    this.fit();
    this.firstLoad = false;
  }

  renderTable(rows) {
    if (!rows || rows.length === 0) {
      this.tableEl.innerHTML = `<div class="bx-sp-empty">Keine Tabelle verfügbar.</div>`;
      return;
    }
    const meTeam = this.team.toLowerCase();
    const shown = rows.slice(0, this.tableRows);
    let lastGroup = null;
    this.tableEl.innerHTML = shown.map((r) => {
      let head = '';
      if (r.group && r.group !== lastGroup) { lastGroup = r.group; head = `<div class="bx-sp-grp">${esc(prettyGroup(r.group))}</div>`; }
      const me = meTeam && String(r.team).toLowerCase().includes(meTeam) ? ' me' : '';
      const crest = r.crest ? `<img src="${esc(r.crest)}" alt="">` : '';
      const gd = `${r.goalDiff > 0 ? '+' : ''}${r.goalDiff}`;
      return `${head}<div class="bx-sp-trow${me}">
        <span class="pos">${r.position}</span>
        <span class="tm">${crest}<span>${esc(r.team)}</span></span>
        <span class="sp">${r.played}</span>
        <span class="gd">${gd}</span>
        <span class="pt">${r.points}</span>
      </div>`;
    }).join('');
    this.fit();
  }

  celebrateGoal() {
    const span = this.el.querySelector('.bx-sp-goal-banner span');
    span.textContent = `${this.goalText}   ${this.goalText}`;
    span.style.animation = 'none'; void span.offsetWidth; span.style.animation = '';
    this.el.classList.add('goalflash');
    clearTimeout(this.goalTimer);
    this.goalTimer = setTimeout(() => this.el.classList.remove('goalflash'), 2600);
  }

  rowHtml(m, goal) {
    const score = (m.homeScore == null || m.awayScore == null) ? '–&nbsp;:&nbsp;–' : `${m.homeScore}&nbsp;:&nbsp;${m.awayScore}`;
    const minCls = m.status === 'live' ? 'live' : m.status === 'finished' ? 'fin' : 'sched';
    const minTxt = m.status === 'live' ? (m.minute ? `${m.minute}'` : 'LIVE')
      : m.status === 'finished' ? 'Ende'
      : (m.kickoff ? new Date(m.kickoff).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'bald');
    const crest = (u) => (u ? `<img src="${esc(u)}" alt="">` : '');
    return `<div class="bx-sp-row${goal ? ' goal' : ''}">
      <div class="bx-sp-team home">${crest(m.homeCrest)}<span>${esc(m.home)}</span></div>
      <div><div class="bx-sp-score">${score}</div><div class="bx-sp-min ${minCls}">${esc(minTxt)}</div></div>
      <div class="bx-sp-team away">${crest(m.awayCrest)}<span>${esc(m.away)}</span></div>
    </div>`;
  }

  destroy() {
    this.ro?.disconnect();
    if (this.timer) clearInterval(this.timer);
    if (this.slideTimer) clearInterval(this.slideTimer);
    clearTimeout(this.goalTimer);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.el.remove();
  }
}
