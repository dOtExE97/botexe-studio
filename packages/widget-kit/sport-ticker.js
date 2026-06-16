// sport-ticker.js — Fußball-Liveticker: Spiele eines Wettbewerbs (WM, Bundesliga,
// …) mit Wappen + Stand, blitzt bei Toren auf. Kann zusätzlich die aktuelle
// TABELLE zeigen — wahlweise nur Spiele, nur Tabelle, oder beides als Slider.
// Optional auf EIN Team gefiltert. Pollt /sport (+ /sport/standings).
// props: { provider, competition, title, maxMatches, refreshSec, goalSoundId,
//          goalBanner, goalText, team, view('matches'|'table'|'both'),
//          tableRows, slideSec, accent }
const STYLE_ID = 'bx-sp-style';
const CSS = `
.bx-sp { position:absolute; inset:0; display:flex; flex-direction:column; gap:8px; padding:14px; container-type:size;
  font-family: var(--bx-font-body); background: var(--bx-glass); border-radius: var(--bx-radius);
  box-shadow: var(--bx-shadow), 0 0 44px -16px var(--bx-accent); overflow:hidden;
  -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); }
.bx-sp-title { display:flex; align-items:center; gap:8px; font-family: var(--bx-font-display);
  font-size: clamp(13px, 5cqmin, 26px); letter-spacing:.16em; text-transform:uppercase; color: var(--bx-text, #fff);
  text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent); }
.bx-sp-title .dot { width:9px; height:9px; border-radius:50%; background:#ff3b3b; box-shadow:0 0 10px #ff3b3b; animation: bx-sp-blink 1.4s infinite; }
.bx-sp-title .tab { margin-left:auto; font-size: clamp(9px,2.8cqmin,13px); letter-spacing:.14em; color: var(--bx-teal); opacity:.9; }
@keyframes bx-sp-blink { 0%,100%{opacity:1} 50%{opacity:.3} }
.bx-sp-list { display:flex; flex-direction:column; gap:6px; overflow:hidden; flex:1; }
.bx-sp-row { display:grid; grid-template-columns: 1fr auto 1fr; align-items:center; gap:8px;
  padding:7px 10px; border-radius:10px; background: rgba(8,10,18,.42); border:1px solid rgba(255,255,255,.10);
  transition: background .3s; }
.bx-sp-team { display:flex; align-items:center; gap:7px; min-width:0; }
.bx-sp-team.away { flex-direction:row-reverse; text-align:right; }
.bx-sp-team img { width: clamp(18px, 5cqmin, 30px); height: clamp(18px, 5cqmin, 30px); object-fit:contain; flex:none; }
.bx-sp-team span { font-family: var(--bx-font-display); font-size: clamp(11px, 3.4cqmin, 18px); color:#fff;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-sp-score { font-family: var(--bx-font-display); font-size: clamp(14px, 4.6cqmin, 24px); color: var(--bx-gold);
  -webkit-text-stroke: 2px #0a0b12; paint-order: stroke fill; min-width: 56px; text-align:center; }
.bx-sp-min { font-family: var(--bx-font-mono); font-size: clamp(9px, 2.6cqmin, 13px); text-align:center; margin-top:2px; }
.bx-sp-min.live { color:#ff5b5b; } .bx-sp-min.fin { color: var(--bx-muted); } .bx-sp-min.sched { color: var(--bx-teal); }
.bx-sp-row.goal { animation: bx-sp-goal 1.4s ease; }
@keyframes bx-sp-goal {
  0% { background: rgba(8,10,18,.42); }
  15% { background: color-mix(in srgb, var(--bx-gold) 55%, transparent); transform: scale(1.04); }
  100% { background: rgba(8,10,18,.42); transform: scale(1); } }
.bx-sp-empty { display:flex; flex:1; align-items:center; justify-content:center; text-align:center;
  font-size:12px; letter-spacing:.12em; color: var(--bx-muted); padding: 10px; }
/* — Tabelle — */
.bx-sp-table { display:flex; flex-direction:column; gap:3px; overflow:hidden; flex:1; }
.bx-sp-grp { font-family: var(--bx-font-display); font-size: clamp(10px,3cqmin,14px); letter-spacing:.14em;
  text-transform:uppercase; color: var(--bx-teal); margin:4px 2px 1px; }
.bx-sp-trow { display:grid; grid-template-columns: 1.6em 1fr 2.2em 2.4em 2.4em; align-items:center; gap:6px;
  padding:4px 8px; border-radius:8px; background: rgba(8,10,18,.42); border:1px solid rgba(255,255,255,.07);
  font-size: clamp(10px, 3cqmin, 16px); }
.bx-sp-trow.me { border-color: var(--bx-gold); box-shadow: 0 0 14px -4px var(--bx-gold) inset; }
.bx-sp-trow .pos { font-family: var(--bx-font-mono); color: var(--bx-muted); text-align:center; }
.bx-sp-trow .tm { display:flex; align-items:center; gap:6px; min-width:0; }
.bx-sp-trow .tm img { width: clamp(15px,4cqmin,24px); height: clamp(15px,4cqmin,24px); object-fit:contain; flex:none; }
.bx-sp-trow .tm span { font-family: var(--bx-font-display); color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bx-sp-trow .sp, .bx-sp-trow .gd { font-family: var(--bx-font-mono); text-align:center; color: var(--bx-muted); }
.bx-sp-trow .pt { font-family: var(--bx-font-display); text-align:center; color: var(--bx-gold); }
.bx-sp-thead { display:grid; grid-template-columns: 1.6em 1fr 2.2em 2.4em 2.4em; gap:6px; padding:0 8px;
  font-family: var(--bx-font-mono); font-size: clamp(8px,2.4cqmin,11px); letter-spacing:.06em; color: var(--bx-muted); opacity:.7; }
.bx-sp-page { display:flex; flex-direction:column; flex:1; min-height:0; }
.bx-sp-page.hide { display:none; }
/* Tor-Feier */
.bx-sp.goalflash { box-shadow: var(--bx-shadow), 0 0 60px -4px #2bff88, 0 0 0 2.5px #2bff88 inset !important; }
.bx-sp-goal-banner { position:absolute; inset:0; display:flex; align-items:center; overflow:hidden; pointer-events:none; opacity:0; }
.bx-sp.goalflash .bx-sp-goal-banner { opacity:1; }
.bx-sp-goal-banner span { font-family: var(--bx-font-display); font-size: clamp(30px, 26cqmin, 96px); white-space:nowrap;
  color:#3dff97; -webkit-text-stroke: 3px #064; paint-order: stroke fill; text-shadow: 0 0 26px #2bff88; will-change: transform;
  animation: bx-sp-goalrun 2.2s linear; }
@keyframes bx-sp-goalrun { from { transform: translateX(100%); } to { transform: translateX(-130%); } }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
const VIEWS = new Set(['matches', 'table', 'both']);
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
    if (this.timer) clearInterval(this.timer);
    if (this.slideTimer) clearInterval(this.slideTimer);
    clearTimeout(this.goalTimer);
    this.el.remove();
  }
}
