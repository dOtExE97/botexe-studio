// sport-ticker.js — Fußball-Liveticker: zeigt aktuelle Spiele eines Wettbewerbs
// (WM, Bundesliga, …) mit Wappen + Spielstand. Pollt /sport (App holt+cacht von
// football-data.org / OpenLigaDB), aktualisiert live und LASST BEI EINEM TOR die
// Karte aufblitzen (+ optional Sound). props: { provider, competition, title,
// maxMatches, refreshSec, goalSoundId, accent }
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
.bx-sp-min { font-family: var(--bx-font-mono); font-size: clamp(9px, 2.6cqmin, 13px); text-align:center;
  margin-top:2px; }
.bx-sp-min.live { color:#ff5b5b; } .bx-sp-min.fin { color: var(--bx-muted); } .bx-sp-min.sched { color: var(--bx-teal); }
.bx-sp-row.goal { animation: bx-sp-goal 1.4s ease; }
@keyframes bx-sp-goal {
  0% { background: rgba(8,10,18,.42); }
  15% { background: color-mix(in srgb, var(--bx-gold) 55%, transparent); transform: scale(1.04); }
  100% { background: rgba(8,10,18,.42); transform: scale(1); } }
.bx-sp-empty { display:flex; flex:1; align-items:center; justify-content:center; text-align:center;
  font-size:12px; letter-spacing:.12em; color: var(--bx-muted); padding: 10px; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

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
    this.scores = new Map(); // matchId → Gesamttore (für Tor-Erkennung)
    this.firstLoad = true;

    this.el = document.createElement('div');
    this.el.className = 'bx-sp';
    this.el.innerHTML = `<div class="bx-sp-title"><span class="dot"></span><span class="t"></span></div><div class="bx-sp-list"></div>`;
    this.el.querySelector('.t').textContent = this.title;
    this.listEl = this.el.querySelector('.bx-sp-list');
    root.appendChild(this.el);

    if (!this.competition) {
      this.listEl.innerHTML = `<div class="bx-sp-empty">Kein Wettbewerb gewählt — im Editor „Wettbewerb" setzen (z.B. WM = 2000).</div>`;
      return;
    }
    this.poll();
    this.timer = setInterval(() => this.poll(), this.refreshMs);
  }

  async poll() {
    try {
      const url = `${this.ctx.baseUrl}/sport?provider=${encodeURIComponent(this.provider)}&competition=${encodeURIComponent(this.competition)}&token=${this.ctx.token}`;
      const res = await fetch(url);
      const data = await res.json();
      this.render(Array.isArray(data.matches) ? data.matches : []);
    } catch {
      /* offline/kurzer Hänger — letzter Stand bleibt stehen */
    }
  }

  render(matches) {
    // Live zuerst, dann geplante (nach Anstoß), dann beendete.
    const rank = (m) => (m.status === 'live' ? 0 : m.status === 'scheduled' ? 1 : 2);
    const sorted = matches.slice().sort((a, b) => rank(a) - rank(b) || String(a.kickoff || '').localeCompare(String(b.kickoff || '')));
    const shown = sorted.slice(0, this.maxMatches);

    if (shown.length === 0) {
      this.listEl.innerHTML = `<div class="bx-sp-empty">Aktuell keine Spiele für diesen Wettbewerb.</div>`;
      return;
    }

    const goalIds = new Set();
    for (const m of shown) {
      const total = (m.homeScore ?? 0) + (m.awayScore ?? 0);
      const prev = this.scores.get(m.id);
      // Tor = Gesamttore gestiegen (nicht beim allerersten Laden, sonst Dauer-Blitz).
      if (!this.firstLoad && prev !== undefined && total > prev) goalIds.add(m.id);
      this.scores.set(m.id, total);
    }
    if (goalIds.size > 0 && this.goalSound) this.ctx.playSound?.(this.goalSound);

    this.listEl.innerHTML = shown.map((m) => this.rowHtml(m, goalIds.has(m.id))).join('');
    this.firstLoad = false;
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

  destroy() { if (this.timer) clearInterval(this.timer); this.el.remove(); }
}
