// top-rotator.js — Rotierende Bestenliste für Hochformat: zeigt Top Gifter,
// dann smooth übergeblendet Top Likes, dann Top Punkte usw. — untereinander.
// props: { sources?: 'gifts,likes,points', interval?: sek, limit?, accent?, showPic? }
const STYLE_ID = 'bx-tr-style';
const CSS = `
.bx-tr { position: absolute; inset: 0; display: flex; flex-direction: column; font-family: var(--bx-font-body); overflow: hidden; }
.bx-tr-head { position: relative; height: 34px; margin-bottom: 6px; }
.bx-tr-title { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-display); font-size: 20px; letter-spacing: .08em; text-transform: uppercase; color: var(--bx-text,#fff);
  -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill;
  text-shadow: 0 0 14px color-mix(in srgb, var(--bx-accent) 60%, transparent), 0 3px 5px rgba(0,0,0,.5);
  transition: opacity .35s, transform .35s; }
.bx-tr-list { position: relative; flex: 1; }
.bx-tr-list.out .bx-tr-row { opacity: 0; transform: translateY(-14px); }
.bx-tr-list.in .bx-tr-row { animation: bx-tr-rowin .45s cubic-bezier(.2,1.1,.3,1) backwards; }
@keyframes bx-tr-rowin { from { opacity: 0; transform: translateY(18px); } }
.bx-tr-row { display: flex; align-items: center; gap: 11px; height: 54px; padding: 0 6px;
  transition: opacity .3s, transform .3s; }
.bx-tr-rank { width: 34px; height: 34px; flex: none; display: flex; align-items: center; justify-content: center;
  font-family: var(--bx-font-display); font-size: 17px; color: #0a0b12; border-radius: 11px; background: #525873;
  -webkit-text-stroke: 0; box-shadow: 0 3px 8px rgba(0,0,0,.4); }
.bx-tr-row[data-rank="1"] .bx-tr-rank { background: linear-gradient(160deg,#ffe88a,#f5b914); box-shadow: 0 0 16px -2px var(--bx-gold), 0 3px 8px rgba(0,0,0,.4); }
.bx-tr-row[data-rank="2"] .bx-tr-rank { background: linear-gradient(160deg,#eef2fb,#b9c2d8); }
.bx-tr-row[data-rank="3"] .bx-tr-rank { background: linear-gradient(160deg,#f0b487,#c9763c); }
.bx-tr-pic { width: 46px; height: 46px; flex: none; border-radius: 50%; background: #1a1c28 center/cover;
  box-shadow: 0 0 0 3px #5c9dff, 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-row[data-rank="1"] .bx-tr-pic { box-shadow: 0 0 0 3px var(--bx-gold), 0 0 18px -2px var(--bx-gold), 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-row[data-rank="2"] .bx-tr-pic { box-shadow: 0 0 0 3px #d7deec, 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-row[data-rank="3"] .bx-tr-pic { box-shadow: 0 0 0 3px #f0a35a, 0 4px 10px rgba(0,0,0,.5); }
.bx-tr-crown { position: absolute; margin-top: -34px; margin-left: 26px; transform: rotate(-12deg);
  filter: drop-shadow(0 2px 3px rgba(0,0,0,.7)); }
.bx-tr-name { flex: 1; min-width: 0; font-family: var(--bx-font-display); font-size: 21px; color: var(--bx-text,#fff); text-transform: uppercase;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0,0,0,.55); }
.bx-tr-row[data-rank="1"] .bx-tr-name { color: var(--bx-gold); }
.bx-tr-val { flex: none; font-family: var(--bx-font-display); font-size: 21px; color: var(--bx-text,#fff);
  -webkit-text-stroke: 3px var(--bx-ink, #0a0b12); paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0,0,0,.55); }
.bx-tr-val .arr { font-size: 15px; -webkit-text-stroke: 2px var(--bx-ink, #0a0b12); }
.bx-tr-empty { display: flex; align-items: center; justify-content: center; height: 100%; font-family: var(--bx-font-display);
  font-size: 15px; letter-spacing: .1em; color: var(--bx-muted); text-transform: uppercase; }

/* ── Stil „Neon" — freistehend ohne Panel, Glow pur. */
.bx-tr-neon { background: none !important; box-shadow: none !important; border: none; }
.bx-tr-neon::before { display: none; }
.bx-tr-neon .bx-tr-row { background: none !important; }
.bx-tr-neon .bx-tr-name { text-shadow: 0 1px 0 rgba(0,0,0,.95), 0 2px 8px rgba(0,0,0,.9); }
.bx-tr-neon .bx-tr-val { text-shadow: 0 0 12px color-mix(in srgb, var(--bx-accent) 70%, transparent), 0 1px 0 rgba(0,0,0,.9); }

/* ── Stil „Pills" — Akzent-Pillen mit dunkler Schrift. */
.bx-tr-pills { background: none !important; box-shadow: none !important; }
.bx-tr-pills::before { display: none; }
.bx-tr-pills .bx-tr-row { background: linear-gradient(120deg, var(--bx-accent), var(--bx-accent-2)) !important;
  border-radius: 999px; box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--bx-accent) 75%, transparent); margin-bottom: 6px; }
.bx-tr-pills .bx-tr-row[data-rank="1"] { background: linear-gradient(120deg, #ffe88a, var(--bx-gold)) !important; }
.bx-tr-pills .bx-tr-name { color: #0c0d14 !important; text-shadow: none; }
.bx-tr-pills .bx-tr-val { color: #0c0d14 !important; text-shadow: none; background: rgba(255,255,255,.72); border-radius: 999px; padding: 2px 10px; }
.bx-tr-pills .bx-tr-rank { background: rgba(12,13,20,.85) !important; color: #fff; border-radius: 50%; box-shadow: none !important; }

/* ── BAUCHBINDE — TV-Unterzeile: farbiger Rangblock links, breiter dunkler
   Balken, Name groß, Wert als Chip rechts. Schiebt sich seitlich ein. */
.bx-tr-banner { background: none; box-shadow: none; padding: 4px 2px; }
.bx-tr-banner::before { display: none; }
.bx-tr-banner .bx-tr-title { letter-spacing: .3em; }
.bx-tr-banner .bx-tr-row { height: 58px; gap: 0; padding: 0; overflow: hidden;
  border-radius: 0 10px 10px 0; background: linear-gradient(100deg, rgba(12,13,20,.94), rgba(12,13,20,.78));
  box-shadow: 0 6px 18px -8px rgba(0,0,0,.7); margin-bottom: 6px;
  border-left: 6px solid var(--bx-accent); animation: bx-tr-slide .45s cubic-bezier(.2,1.1,.3,1) backwards; }
@keyframes bx-tr-slide { from { opacity:0; transform: translateX(-26px); } }
.bx-tr-banner .bx-tr-rank { width: 46px; height: 100%; border-radius: 0; flex: none;
  background: var(--bx-accent) !important; box-shadow: none !important; color: #0c0d14; font-size: 22px; }
.bx-tr-banner .bx-tr-row[data-rank="1"] .bx-tr-rank { background: linear-gradient(160deg,#ffe88a,#f5b914) !important; }
.bx-tr-banner .bx-tr-pic { margin-left: 10px; }
.bx-tr-banner .bx-tr-name { margin-left: 12px; font-size: 24px; letter-spacing: .02em; }
.bx-tr-banner .bx-tr-val { margin-right: 12px; background: rgba(255,255,255,.10); border-radius: 999px; padding: 3px 14px; }
.bx-tr-banner .bx-tr-crown { margin-left: 74px; }

/* ── KARTE — jede Person eine eigene Karte: großes Bild links, Name und Wert
   übereinander rechts. Wirkt wie ein Kontakt-/Sammelkarten-Stapel. */
.bx-tr-karte { background: none; box-shadow: none; padding: 4px 2px; }
.bx-tr-karte::before { display: none; }
.bx-tr-karte .bx-tr-row { height: 66px; gap: 12px; padding: 0 12px 0 8px; margin-bottom: 8px;
  border-radius: 14px; background: linear-gradient(150deg, rgba(24,26,38,.95), rgba(12,13,20,.92));
  box-shadow: 0 10px 22px -10px rgba(0,0,0,.8), inset 0 1px 0 rgba(255,255,255,.07);
  border: 1px solid color-mix(in srgb, var(--bx-accent) 30%, transparent); }
.bx-tr-karte .bx-tr-row[data-rank="1"] { border-color: color-mix(in srgb, var(--bx-gold) 60%, transparent);
  box-shadow: 0 10px 26px -10px rgba(0,0,0,.85), 0 0 22px -8px var(--bx-gold), inset 0 1px 0 rgba(255,255,255,.09); }
.bx-tr-karte .bx-tr-rank { width: 26px; height: 26px; font-size: 14px; border-radius: 8px; }
.bx-tr-karte .bx-tr-pic { width: 52px; height: 52px; border-radius: 12px; }
.bx-tr-karte .bx-tr-name { font-size: 22px; }
.bx-tr-karte .bx-tr-val { font-size: 22px; }
.bx-tr-karte .bx-tr-crown { margin-top: -40px; margin-left: 44px; }


/* ── SIEGEL — rundes Wappen: Profilbild im Kreis, Name darunter, Wert als
   Gravur. Nur Platz 1 groß, der Rest klein daneben. */
.bx-tr-siegel { background: none; box-shadow: none; }
.bx-tr-siegel::before { display: none; }
.bx-tr-siegel .bx-tr-list { display: flex; align-items: center; justify-content: center; gap: 4%; }
.bx-tr-siegel .bx-tr-row { position: static; height: auto; flex-direction: column; align-items: center; gap: 4px;
  padding: 10px 6px; flex: 1 1 0; min-width: 0; border-radius: 50%; aspect-ratio: 1/1; justify-content: center;
  background: radial-gradient(circle at 50% 30%, rgba(30,32,46,.96), rgba(10,11,18,.96));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--bx-accent) 55%, transparent), 0 10px 24px -10px rgba(0,0,0,.8); }
.bx-tr-siegel .bx-tr-row[data-rank="1"] { box-shadow: 0 0 0 4px var(--bx-gold), 0 0 26px -6px var(--bx-gold), 0 10px 24px -10px rgba(0,0,0,.85); }
.bx-tr-siegel .bx-tr-rank { display: none; }
.bx-tr-siegel .bx-tr-pic { width: clamp(30px, 30cqmin, 70px); height: clamp(30px, 30cqmin, 70px); }
.bx-tr-siegel .bx-tr-name { flex: none; font-size: clamp(11px, 9cqmin, 19px); text-align: center; max-width: 100%; }
.bx-tr-siegel .bx-tr-val { font-size: clamp(10px, 8cqmin, 17px); }
.bx-tr-siegel .bx-tr-crown { margin-top: -18px; margin-left: 0; }

/* ── KASSETTE — Retro-Tape: Gehäuse mit zwei Spulen, Name auf dem Klebeetikett. */
.bx-tr-kassette { background: none; box-shadow: none; }
.bx-tr-kassette::before { display: none; }
.bx-tr-kassette .bx-tr-row { height: 62px; margin-bottom: 8px; border-radius: 8px; padding: 0 10px;
  background: linear-gradient(180deg, #2a2d3c, #14161f); border: 2px solid #0a0b12;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 6px 16px -8px rgba(0,0,0,.8); }
.bx-tr-kassette .bx-tr-rank { border-radius: 50%; width: 26px; height: 26px; font-size: 13px;
  background: #0a0b12 !important; color: var(--bx-gold); box-shadow: inset 0 0 0 2px #4a5066 !important; }
.bx-tr-kassette .bx-tr-pic { border-radius: 50%; width: 34px; height: 34px;
  box-shadow: 0 0 0 3px #0a0b12, 0 0 0 5px #4a5066 !important; }
.bx-tr-kassette .bx-tr-name { background: #f6f0e2; color: #2c2416 !important; text-shadow: none;
  border-radius: 3px; padding: 3px 10px; font-size: 17px; margin: 0 8px; flex: 1;
  box-shadow: inset 0 -1px 0 rgba(0,0,0,.15); }
.bx-tr-kassette .bx-tr-val { font-size: 17px; color: var(--bx-gold) !important; }
.bx-tr-kassette .bx-tr-crown { margin-top: -30px; margin-left: 20px; }
`;
function ensureStyle() { if (!document.getElementById(STYLE_ID)) { const s=document.createElement('style'); s.id=STYLE_ID; s.textContent=CSS; document.head.appendChild(s); } }
const fmt = (n) => (n >= 1000 ? `${(n/1000).toFixed(n>=10000?0:1)}K` : String(n));
const SRC = {
  gifts: { title: 'Top Gifter', accent: '#ff5436', valColor: '#ffd23e', list: (s) => s?.topGifters || [], val: (e) => fmt(e.coins), arr: '▲' },
  likes: { title: 'Top Likes', accent: '#ff5e8a', valColor: '#ff8ab0', list: (s) => s?.topLikers || [], val: (e) => `${fmt(e.likes)} ❤`, arr: '▲' },
  points: { title: 'Top Supporter', accent: '#7c5cff', valColor: '#b59cff', list: (s) => s?.topPoints || [], val: (e) => fmt(e.points), arr: '★' },
  wins: { title: 'Top Gewinner', accent: '#ffd23e', valColor: '#ffe88a', list: (s) => s?.topWinners || [], val: (e) => `${e.gameWins || 0} 🏆`, arr: '★' },
};

export default class TopRotator {
  constructor(root, props) {
    ensureStyle();
    this.root = root;
    this.fixedAccent = props.accent || null;
    this.sources = String(props.sources || 'gifts,likes').split(',').map((x) => x.trim()).filter((x) => SRC[x]);
    if (this.sources.length === 0) this.sources = ['gifts', 'likes'];
    this.interval = Math.max(2, Number(props.interval ?? 5)) * 1000;
    this.limit = Math.min(8, Math.max(1, Number(props.limit ?? 5)));
    this.showPic = props.showPic !== false;
    this.idx = 0;
    this.stats = null;
    this.el = document.createElement('div');
    const style = ['glas', 'neon', 'pills', 'banner', 'karte', 'siegel', 'kassette'].includes(props.style) ? props.style : 'glas';
    this.el.className = `bx-tr${style !== 'glas' ? ` bx-tr-${style}` : ''}`;
    this.el.innerHTML = `<div class="bx-tr-head"><div class="bx-tr-title"></div></div><div class="bx-tr-list in"></div>`;
    this.titleEl = this.el.querySelector('.bx-tr-title');
    this.listEl = this.el.querySelector('.bx-tr-list');
    root.appendChild(this.el);
    this.render(true);
    if (this.sources.length > 1) this.timer = setInterval(() => this.rotate(), this.interval);
  }
  rotate() {
    this.idx = (this.idx + 1) % this.sources.length;
    // raus-animation, dann wechseln + rein
    this.listEl.classList.add('out');
    this.titleEl.style.opacity = '0';
    this.titleEl.style.transform = 'translateY(-8px)';
    setTimeout(() => { this.render(true); this.listEl.classList.remove('out'); this.titleEl.style.opacity=''; this.titleEl.style.transform=''; }, 360);
  }
  onStats(stats) { this.stats = stats; this.render(false); }
  render(animate) {
    const key = this.sources[this.idx];
    const def = SRC[key];
    const accent = this.fixedAccent || def.accent;
    this.root.style.setProperty('--bx-accent', accent);
    this.titleEl.textContent = def.title;
    const items = def.list(this.stats).slice(0, this.limit);
    this.listEl.classList.toggle('in', !!animate);
    if (animate) void this.listEl.offsetWidth;
    if (items.length === 0) { this.listEl.innerHTML = `<div class="bx-tr-empty">— noch keine —</div>`; return; }
    this.listEl.innerHTML = items.map((e, i) => `
      <div class="bx-tr-row" data-rank="${i+1}" style="animation-delay:${i*60}ms">
        <div class="bx-tr-rank">${i+1}</div>
        ${this.showPic ? `<div class="bx-tr-pic" style="${e.profilePic?`background-image:url('${attrUrl(e.profilePic)}')`:''}"></div>${i===0?'<div class="bx-tr-crown"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="17" viewBox="0 0 24 18"><path d="M2 6.2l3.6 3.1L9.4 3l2.6 4.2L14.6 3l3.8 6.3L22 6.2l-1.7 9.3a1 1 0 0 1-1 .8H4.7a1 1 0 0 1-1-.8L2 6.2Z" fill="#ffd23e" stroke="rgba(0,0,0,.55)" stroke-width=".8" stroke-linejoin="round"/><circle cx="2" cy="6.2" r="1.4" fill="#ffd23e"/><circle cx="12" cy="2.4" r="1.4" fill="#ffd23e"/><circle cx="22" cy="6.2" r="1.4" fill="#ffd23e"/></svg></div>':''}` : ''}
        <div class="bx-tr-name">${escapeHtml(e.nickname)}</div>
        <div class="bx-tr-val" style="color:${i===0&&key!=='points'?def.valColor:'var(--bx-text,#fff)'}"><span class="arr">${def.arr}</span> ${def.val(e)}</div>
      </div>`).join('');
  }
  destroy() { clearInterval(this.timer); this.el.remove(); }
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
/** URL für HTML-Attribut + CSS url('…') — NUR Sonderzeichen ersetzen, nie
 *  (nach-)encodieren: data-URIs / vor-encodierte CDN-URLs blieben sonst kaputt. */
function attrUrl(u) { return String(u).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '%27').replace(/[<>\n\r]/g, ''); }
